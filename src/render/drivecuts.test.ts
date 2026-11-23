import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { RoadMeshRenderer } from './roadsmesh';
import { RoadFlow, RoadTier } from '../shared/types';
import type { JunctionControl, RoadProfile } from '../shared/types';
import type { TileDriveCut } from '../shared/kerblayout';
import { composeProfile, NO_EDITS, presetProfileForTier } from '../shared/roadprofile';
import { CHUNK_TILES, MAP_SIZE, TILE_METERS } from '../shared/constants';

const N = 1;
const E = 2;
const S = 4;
const W = 8;
const PARKED_ID = 102;
const PARKED = composeProfile(presetProfileForTier(RoadTier.TwoLane), {
  ...NO_EDITS,
  parking: 'both',
});
const PROFILES = new Map<number, RoadProfile>([[PARKED_ID, PARKED]]);

/** An east-west street along z = 20 and a north-south one across it at x = 34. */
const ROW_Z = 20;
const CROSS_X = 34;
const tiles: { x: number; z: number }[] = [
  ...Array.from({ length: 59 }, (_, i) => ({ x: 2 + i, z: ROW_Z })),
  ...Array.from({ length: 33 }, (_, i) => ({ x: CROSS_X, z: 4 + i })).filter((t) => t.z !== ROW_Z),
];

function lay(layout = tiles): { renderer: RoadMeshRenderer; scene: THREE.Scene } {
  const at = new Set(layout.map((t) => `${t.x},${t.z}`));
  const has = (x: number, z: number): boolean => at.has(`${x},${z}`);
  const scene = new THREE.Scene();
  const renderer = new RoadMeshRenderer(
    scene,
    () => 0,
    (id) => PROFILES.get(id) ?? null,
  );
  renderer.apply(
    layout.map((t) => ({
      x: t.x,
      z: t.z,
      tier: RoadTier.TwoLane,
      mask:
        (has(t.x, t.z - 1) ? N : 0) |
        (has(t.x + 1, t.z) ? E : 0) |
        (has(t.x, t.z + 1) ? S : 0) |
        (has(t.x - 1, t.z) ? W : 0),
      elevation: 0,
      profile: PARKED_ID,
      flow: RoadFlow.None,
    })),
  );
  return { renderer, scene };
}

/** Everything the mesh draws, one string per chunk mesh, in a fixed order. */
function drawn(scene: THREE.Scene): string[] {
  const out: string[] = [];
  for (const c of scene.children) {
    if (!(c instanceof THREE.Mesh)) continue;
    // An instanced part emptied by a change stays in the scene with nothing to draw.
    if (c instanceof THREE.InstancedMesh && c.count === 0) continue;
    const p = c.geometry.getAttribute('position');
    const col = c.geometry.getAttribute('color');
    let s = `${p.count}:`;
    for (let i = 0; i < p.count; i++) {
      s += `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)};`;
      if (col)
        s += `${col.getX(i).toFixed(2)},${col.getY(i).toFixed(2)},${col.getZ(i).toFixed(2)};`;
    }
    out.push(s);
  }
  return out.sort();
}

/** The stalls of every tile's two kerbs. */
function stalls(r: RoadMeshRenderer, layout = tiles): string[] {
  return layout.flatMap((t) =>
    (['low', 'high'] as const).map(
      (side) => `${t.x},${t.z},${side}:${JSON.stringify(r.parkingStallsAt(t.x, t.z, side))}`,
    ),
  );
}

const cutOn = (
  x: number,
  z: number,
  side: 'low' | 'high',
  from: number,
  to: number,
): TileDriveCut => ({ x, z, cut: { side, from, to } });

const chunkOf = (x: number, z: number): number =>
  Math.floor(z / CHUNK_TILES) * (MAP_SIZE / CHUNK_TILES) + Math.floor(x / CHUNK_TILES);

describe('RoadMeshRenderer — drive cuts laid one change at a time', () => {
  const m = (t: number, along: number): number => t * TILE_METERS + along;
  const steps: TileDriveCut[][] = [
    // mid-block, then beside the junction, both kerbs, then the cross street
    [cutOn(20, ROW_Z, 'high', m(20, 5), m(20, 8))],
    [cutOn(20, ROW_Z, 'high', m(20, 5), m(20, 8)), cutOn(33, ROW_Z, 'low', m(33, 14), m(33, 17))],
    [
      cutOn(20, ROW_Z, 'high', m(20, 5), m(20, 8)),
      cutOn(33, ROW_Z, 'low', m(33, 14), m(33, 17)),
      cutOn(35, ROW_Z, 'high', m(35, 1), m(35, 4)),
      cutOn(CROSS_X, 8, 'low', m(8, 6), m(8, 9)),
    ],
    // one removed, one moved to the other kerb
    [
      cutOn(33, ROW_Z, 'high', m(33, 14), m(33, 17)),
      cutOn(35, ROW_Z, 'high', m(35, 1), m(35, 4)),
      cutOn(CROSS_X, 8, 'low', m(8, 6), m(8, 9)),
    ],
    [],
  ];

  it('draws what a fresh renderer given the same cuts draws, after every step', () => {
    const live = lay();
    steps.forEach((cuts, i) => {
      // Reading the stalls fills the face cache, so a stale entry would show.
      stalls(live.renderer);
      live.renderer.setDriveCuts(cuts);
      const fresh = lay();
      fresh.renderer.setDriveCuts(cuts);
      expect(stalls(live.renderer), `stalls at step ${i}`).toEqual(stalls(fresh.renderer));
      expect(drawn(live.scene), `geometry at step ${i}`).toEqual(drawn(fresh.scene));
    });
  });

  it('actually moves the stalls when a cut comes and goes, so the guard can fail', () => {
    const { renderer } = lay();
    const before = stalls(renderer);
    renderer.setDriveCuts(steps[0]!);
    expect(stalls(renderer)).not.toEqual(before);
    renderer.setDriveCuts([]);
    expect(stalls(renderer)).toEqual(before);
  });

  it('rebuilds only the chunks its own block face runs through', () => {
    const { renderer } = lay();
    const rebuilt = renderer.setDriveCuts([cutOn(20, ROW_Z, 'high', m(20, 5), m(20, 8))]);
    const along = new Set<number>();
    for (let x = 3; x < CROSS_X; x++) along.add(chunkOf(x, ROW_Z));
    expect([...rebuilt].sort()).toEqual([...along].sort());
    // The cross street's far arms are not on that face.
    expect(rebuilt.has(chunkOf(CROSS_X, 4))).toBe(false);
    expect(rebuilt.has(chunkOf(CROSS_X, 36))).toBe(false);
  });

  it('holds the rebuilds while queueing and, once drained a few at a time, draws what a fresh renderer draws', () => {
    const live = lay();
    live.renderer.setQueueing(true);
    const fresh = lay();
    fresh.renderer.setDriveCuts(steps[2]!);
    const before = drawn(live.scene);
    live.renderer.setDriveCuts(steps[2]!);
    expect(drawn(live.scene)).toEqual(before);
    const kerbChunks = new Set<number>();
    for (let guard = 0; guard < 20; guard++) {
      const { whole, kerb } = live.renderer.drainQueued(1);
      expect(whole.size).toBe(0);
      expect(kerb.size).toBeLessThanOrEqual(1);
      for (const k of kerb) kerbChunks.add(k);
    }
    expect(kerbChunks.size).toBeGreaterThan(1);
    expect(live.renderer.drainQueued(1).kerb.size).toBe(0);
    expect(stalls(live.renderer)).toEqual(stalls(fresh.renderer));
    expect(drawn(live.scene)).toEqual(drawn(fresh.scene));
  });

  it('rebuilds nothing when the cuts are unchanged', () => {
    const { renderer } = lay();
    const cut = [cutOn(20, ROW_Z, 'high', m(20, 5), m(20, 8))];
    renderer.setDriveCuts(cut);
    expect(renderer.setDriveCuts(cut).size).toBe(0);
  });
});

describe('RoadMeshRenderer — junction controls laid one change at a time', () => {
  /** The street along z = 20 with a crossroads at x = 34, a tee up at x = 20 and a tee down at x = 48. */
  const layout: { x: number; z: number }[] = [
    ...tiles.filter((t) => t.x !== CROSS_X || t.z <= 36),
    ...Array.from({ length: 14 }, (_, i) => ({ x: 20, z: 6 + i })),
    ...Array.from({ length: 16 }, (_, i) => ({ x: 48, z: 21 + i })),
  ];
  const at = (x: number, z: number, control: JunctionControl, turns = 0) => ({
    x,
    z,
    control,
    turns,
  });
  const steps = [
    [at(34, 20, 'signal')],
    [at(34, 20, 'signal'), at(20, 20, 'stop'), at(48, 20, 'yield')],
    [at(34, 20, 'allWayStop'), at(20, 20, 'stop', 0x11), at(48, 20, 'yield')],
    [at(34, 20, 'allWayStop'), at(48, 20, 'signal')],
    [],
  ];

  it('draws what a fresh renderer given the same controls draws, after every step', () => {
    const live = lay(layout);
    steps.forEach((controls, i) => {
      stalls(live.renderer, layout);
      live.renderer.setJunctionControls(controls);
      const fresh = lay(layout);
      fresh.renderer.setJunctionControls(controls);
      expect(stalls(live.renderer, layout), `stalls at step ${i}`).toEqual(
        stalls(fresh.renderer, layout),
      );
      expect(drawn(live.scene), `geometry at step ${i}`).toEqual(drawn(fresh.scene));
    });
  });

  it('actually changes the drawing when a control comes and goes, so the guard can fail', () => {
    const { renderer, scene } = lay(layout);
    const before = drawn(scene);
    renderer.setJunctionControls(steps[0]!);
    expect(drawn(scene)).not.toEqual(before);
    renderer.setJunctionControls([]);
    expect(drawn(scene)).toEqual(before);
  });

  it('leaves alone the street that runs on past the next junction', () => {
    const { renderer } = lay(layout);
    const rebuilt = renderer.setJunctionControls([at(34, 20, 'signal')]);
    // The far junction's own arm is not what the control changed.
    expect(rebuilt.has(chunkOf(48, 36))).toBe(false);
    expect(rebuilt.has(chunkOf(34, 4))).toBe(true);
    expect(rebuilt.has(chunkOf(48, 20))).toBe(true);
  });
});
