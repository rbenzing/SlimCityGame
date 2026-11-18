import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TILE_METERS } from '../shared/constants';
import {
  KERB_HEIGHT_M,
  WARNING_PAD_DEPTH_M,
  kerbRampBox,
  kerbRampRise,
  kerbRampWidth,
  type KerbRamp,
} from '../shared/kerbramps';

import { RoadFlow, RoadTier, type JunctionControl, type RoadTileDelta } from '../shared/types';
import {
  CURB_Y_OFFSET,
  KERB_FACE_COLOR,
  MARKING_COLOR,
  ROAD_Y_OFFSET,
  RoadMeshRenderer,
  SIDEWALK_COLOR,
  YELLOW_MARKING_COLOR,
  roadTileVertices,
} from './roadsmesh';
import { cutKerbRamps } from './kerbrampmesh';
import { computeLampPlacements, standsOf } from './lamps';
import { computeSignPlacements, signWorldTransform, type FurnitureRoadTile } from './roadfurniture';
import { RAMP_CLEARANCE_M, keepClearOf } from './roadsidespace';

const N = 1;
const E = 2;
const S = 4;
const W = 8;
const JX = 5;
const JZ = 5;
const CENTRE = (JX + 0.5) * TILE_METERS;
const flat = (): number => 0;
const delta = (x: number, z: number, tier: RoadTier, mask: number): RoadTileDelta => ({
  x,
  z,
  tier,
  mask,
  elevation: 0,
  profile: tier,
  flow: RoadFlow.None,
});

/** A crossroads with three tiles of road along each arm, `ns` running north to south and `ew` east to west. */
function crossroads(
  ns: RoadTier,
  ew: RoadTier,
  control: JunctionControl = 'allWayStop',
): { renderer: RoadMeshRenderer; scene: THREE.Scene; positions: number[]; colors: number[] } {
  const scene = new THREE.Scene();
  const renderer = new RoadMeshRenderer(scene, flat);
  const deltas = [delta(JX, JZ, ns, N | E | S | W)];
  for (const k of [1, 2, 3]) {
    const end = k === 3;
    deltas.push(delta(JX, JZ - k, ns, S | (end ? 0 : N)));
    deltas.push(delta(JX, JZ + k, ns, N | (end ? 0 : S)));
    deltas.push(delta(JX - k, JZ, ew, E | (end ? 0 : W)));
    deltas.push(delta(JX + k, JZ, ew, W | (end ? 0 : E)));
  }
  renderer.apply(deltas);
  renderer.setJunctionControls([{ x: JX, z: JZ, control }]);
  const positions: number[] = [];
  const colors: number[] = [];
  for (const child of scene.children) {
    if (!(child instanceof THREE.Mesh) || child instanceof THREE.InstancedMesh) continue;
    for (const n of child.geometry.getAttribute('position').array) positions.push(n);
    for (const n of child.geometry.getAttribute('color').array) colors.push(n);
  }
  return { renderer, scene, positions, colors };
}

/** The mesh holds float32s: lengths agree to this. */
const TOL = 1e-4;

const sameColour = (colors: number[], v: number, c: readonly number[]): boolean =>
  Math.abs(colors[v]! - c[0]!) < 1e-5 &&
  Math.abs(colors[v + 1]! - c[1]!) < 1e-5 &&
  Math.abs(colors[v + 2]! - c[2]!) < 1e-5;

type Vertex = [number, number, number];

/** Every triangle of one colour, as its three vertices. */
function trianglesOf(
  positions: number[],
  colors: number[],
  colour: readonly number[],
): Array<[Vertex, Vertex, Vertex]> {
  const out: Array<[Vertex, Vertex, Vertex]> = [];
  for (let t = 0; t + 8 < positions.length; t += 9) {
    if (![0, 3, 6].every((k) => sameColour(colors, t + k, colour))) continue;
    const v = (k: number): Vertex => [
      positions[t + k]!,
      positions[t + k + 1]!,
      positions[t + k + 2]!,
    ];
    out.push([v(0), v(3), v(6)]);
  }
  return out;
}

const verticesOf = (positions: number[], colors: number[], colour: readonly number[]): Vertex[] =>
  trianglesOf(positions, colors, colour).flat();

interface Line {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** The crossing lines: white rectangles 0.3 m deep and long across an arm, from consecutive white triangles. */
function crossingLines(positions: number[], colors: number[]): Line[] {
  const white = (t: number): boolean => sameColour(colors, t, MARKING_COLOR);
  const out: Line[] = [];
  for (let t = 0; t + 17 < positions.length; t += 9) {
    if (!white(t) || !white(t + 9)) continue;
    const xs = [0, 3, 6, 9, 12, 15].map((k) => positions[t + k]!);
    const zs = [0, 3, 6, 9, 12, 15].map((k) => positions[t + k + 2]!);
    const box = {
      x0: Math.min(...xs),
      x1: Math.max(...xs),
      z0: Math.min(...zs),
      z1: Math.max(...zs),
    };
    const thin = Math.min(box.x1 - box.x0, box.z1 - box.z0);
    const long = Math.max(box.x1 - box.x0, box.z1 - box.z0);
    // Across an arm, within the two tiles about the junction.
    const mx = (box.x0 + box.x1) / 2 - CENTRE;
    const mz = (box.z0 + box.z1) / 2 - CENTRE;
    const spansX = box.x1 - box.x0 > box.z1 - box.z0;
    const near = spansX
      ? Math.abs(mx) < 1 && Math.abs(mz) < 14
      : Math.abs(mz) < 1 && Math.abs(mx) < 14;
    if (Math.abs(thin - 0.3) < 0.02 && long > 3 && near) {
      out.push(box);
      t += 9;
    }
  }
  return out;
}

const TIERS = [RoadTier.TwoLane, RoadTier.FourLane, RoadTier.Avenue, RoadTier.OneWay];
const pairs = TIERS.flatMap((ns) => TIERS.map((ew) => [ns, ew] as const));

describe('kerb ramps at a controlled crossroads', () => {
  for (const [ns, ew] of pairs) {
    const nameOf = (t: RoadTier): string =>
      Object.keys(RoadTier).find((k) => RoadTier[k as keyof typeof RoadTier] === t)!;
    describe(`${nameOf(ns)} running north to south, ${nameOf(ew)} east to west`, () => {
      const { renderer, positions, colors } = crossroads(ns, ew);
      const ramps = renderer.kerbRamps();
      const lines = crossingLines(positions, colors);

      it('lays two ramps for every crossing it paints, one at each kerb', () => {
        // Each crossing is two lines.
        expect(ramps.length).toBe(lines.length);
        const faces = verticesOf(positions, colors, KERB_FACE_COLOR);
        for (const r of ramps) {
          // It stands on the arm's kerb: the kerb face runs on along that line past its ends.
          const fall = r.axis === 'x' ? 0 : 2;
          const along = r.axis === 'x' ? 2 : 0;
          expect(
            faces.some(
              (v) =>
                Math.abs(v[fall] - r.kerb) < TOL &&
                (Math.abs(v[along] - r.from) < TOL || Math.abs(v[along] - r.to) < TOL),
            ),
            'kerb face ends at the ramp',
          ).toBe(true);
          expect(Math.abs(r.back - r.kerb), 'runs 1 in 12 or the footway').toBeLessThanOrEqual(
            KERB_HEIGHT_M * 12 + 1e-9,
          );
        }
      });

      it('lies wholly between the two lines of its crossing, square to them', () => {
        for (const r of ramps) {
          const lateral = r.axis === 'x' ? 'x' : 'z';
          // The lines over this arm that reach this kerb, and lie across this ramp.
          const mine = lines
            .filter((l) =>
              lateral === 'x'
                ? l.x1 - l.x0 > l.z1 - l.z0 && l.x0 <= r.kerb + TOL && l.x1 >= r.kerb - TOL
                : l.z1 - l.z0 > l.x1 - l.x0 && l.z0 <= r.kerb + TOL && l.z1 >= r.kerb - TOL,
            )
            .map((l): [number, number] => (lateral === 'x' ? [l.z0, l.z1] : [l.x0, l.x1]))
            .filter(([a, b]) => b > r.from - 1 && a < r.to + 1)
            .sort((p, q) => p[0]! - q[0]!);
          expect(mine.length, 'two lines').toBe(2);
          expect(r.from).toBeGreaterThanOrEqual(mine[0]![1]! - TOL);
          expect(r.to).toBeLessThanOrEqual(mine[1]![0]! + TOL);
          expect(Math.abs(r.to - r.from - kerbRampWidth(mine[1]![1]! - mine[0]![0]!))).toBeLessThan(
            TOL,
          );
        }
      });

      it('leaves no kerb face in its span', () => {
        for (const r of ramps) {
          const fall = r.axis === 'x' ? 0 : 2;
          const along = r.axis === 'x' ? 2 : 0;
          const bad = verticesOf(positions, colors, KERB_FACE_COLOR).filter(
            (v) =>
              Math.abs(v[fall] - r.kerb) < TOL && v[along] > r.from + TOL && v[along] < r.to - TOL,
          );
          expect(bad).toEqual([]);
        }
      });

      it('falls from the footway’s height at its back to the road’s at the kerb', () => {
        const slope = trianglesOf(positions, colors, SIDEWALK_COLOR);
        for (const r of ramps) {
          const box = kerbRampBox(r);
          const fall = r.axis === 'x' ? 0 : 2;
          // The footway triangles whose middle lies on the ramp are its surface.
          const surface = slope.filter((t) => {
            const cx = (t[0][0] + t[1][0] + t[2][0]) / 3;
            const cz = (t[0][2] + t[1][2] + t[2][2]) / 3;
            return cx > box.x0 && cx < box.x1 && cz > box.z0 && cz < box.z1;
          });
          expect(surface.length, 'a surface on the ramp').toBeGreaterThan(0);
          const verts = surface.flat();
          for (const v of verts) {
            const want = ROAD_Y_OFFSET + KERB_HEIGHT_M * kerbRampRise(r, v[fall]);
            expect(Math.abs(v[1] - want)).toBeLessThan(TOL);
          }
          expect(
            verts.some(
              (v) => Math.abs(v[fall] - r.kerb) < TOL && Math.abs(v[1] - ROAD_Y_OFFSET) < TOL,
            ),
            'road height at the kerb',
          ).toBe(true);
          expect(
            verts.some(
              (v) => Math.abs(v[fall] - r.back) < TOL && Math.abs(v[1] - CURB_Y_OFFSET) < TOL,
            ),
            'footway height at the back',
          ).toBe(true);
        }
      });

      it('covers the whole of its rectangle with its surface, leaving no hole in the footway', () => {
        const slope = trianglesOf(positions, colors, SIDEWALK_COLOR);
        for (const r of ramps) {
          const box = kerbRampBox(r);
          let covered = 0;
          for (const t of slope) {
            const cx = (t[0][0] + t[1][0] + t[2][0]) / 3;
            const cz = (t[0][2] + t[1][2] + t[2][2]) / 3;
            if (!(cx > box.x0 && cx < box.x1 && cz > box.z0 && cz < box.z1)) continue;
            covered +=
              Math.abs(
                (t[1][0] - t[0][0]) * (t[2][2] - t[0][2]) -
                  (t[2][0] - t[0][0]) * (t[1][2] - t[0][2]),
              ) / 2;
          }
          expect(covered).toBeCloseTo((box.x1 - box.x0) * (box.z1 - box.z0), 3);
        }
      });
    });
  }

  it('lays 8 ramps at a plain two-lane crossroads', () => {
    expect(crossroads(RoadTier.TwoLane, RoadTier.TwoLane).renderer.kerbRamps()).toHaveLength(8);
  });

  it('lays none where nothing controls the junction, since no crossing is painted', () => {
    const { renderer } = crossroads(RoadTier.TwoLane, RoadTier.TwoLane, 'none');
    expect(renderer.kerbRamps()).toEqual([]);
  });
});

describe('the warning pads', () => {
  const { renderer, scene } = crossroads(RoadTier.Avenue, RoadTier.TwoLane);
  const ramps = renderer.kerbRamps();
  const pads = scene.children.find(
    (c): c is THREE.InstancedMesh =>
      c instanceof THREE.InstancedMesh && c.geometry instanceof THREE.BoxGeometry,
  )!;

  it('are one instanced mesh with a slab on every ramp, in the tactile yellow', () => {
    expect(pads).toBeDefined();
    expect(pads.count).toBe(ramps.length);
    expect(renderer.padCount()).toBe(ramps.length);
    const colour = (pads.material as THREE.MeshLambertMaterial).color;
    expect(colour.r).toBeCloseTo(YELLOW_MARKING_COLOR[0], 6);
    expect(colour.g).toBeCloseTo(YELLOW_MARKING_COLOR[1], 6);
    expect(colour.b).toBeCloseTo(YELLOW_MARKING_COLOR[2], 6);
  });

  it('are 0.61 m deep from the kerb and as wide as the ramp, lying on its slope', () => {
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    for (let i = 0; i < ramps.length; i++) {
      const r = ramps[i]!;
      pads.getMatrixAt(i, matrix);
      matrix.decompose(position, quat, scale);
      const [depth, width] = r.axis === 'x' ? [scale.x, scale.z] : [scale.z, scale.x];
      expect(depth).toBeCloseTo(WARNING_PAD_DEPTH_M, 4);
      expect(width).toBeCloseTo(r.to - r.from, 4);
      const fall = r.axis === 'x' ? position.x : position.z;
      const along = r.axis === 'x' ? position.z : position.x;
      expect(Math.abs(fall - r.kerb)).toBeCloseTo(WARNING_PAD_DEPTH_M / 2, 4);
      expect(along).toBeCloseTo((r.from + r.to) / 2, 4);
      // The slab's middle stands just over the slope's surface there.
      const surface = ROAD_Y_OFFSET + KERB_HEIGHT_M * kerbRampRise(r, fall);
      expect(position.y - surface).toBeGreaterThan(0);
      expect(position.y - surface).toBeLessThan(0.05);
    }
  });
});

describe('cutKerbRamps', () => {
  const surfaces = {
    footway: [0.5, 0.5, 0.5] as const,
    kerbFace: [0.4, 0.4, 0.4] as const,
    footwayY: 0.1,
    roadY: 0.02,
  };
  const quad = (x0: number, z0: number, x1: number, z1: number): number[] => [
    x0,
    0.1,
    z0,
    x1,
    0.1,
    z0,
    x1,
    0.1,
    z1,
    x0,
    0.1,
    z0,
    x1,
    0.1,
    z1,
    x0,
    0.1,
    z1,
  ];
  const colours = (n: number, c: readonly number[]): number[] =>
    Array.from({ length: n * 3 }, (_, i) => c[i % 3]!);

  it('keeps the footway’s area whole round a ramp: pieces, slope and nothing lost', () => {
    const positions = quad(0, 0, 2, 10);
    const colors = colours(6, surfaces.footway);
    const ramp: KerbRamp = { axis: 'x', kerb: 0, back: 0.96, from: 4, to: 5.275 };
    cutKerbRamps(positions, colors, [ramp], surfaces, () => 0);
    let area = 0;
    for (let t = 0; t + 8 < positions.length; t += 9) {
      const [ax, az, bx, bz, cx, cz] = [0, 2, 3, 5, 6, 8].map((k) => positions[t + k]!) as [
        number,
        number,
        number,
        number,
        number,
        number,
      ];
      area += Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az)) / 2;
    }
    // Footway pieces and the slope: the quad's whole 20 m², no gap and no overlap.
    expect(area).toBeCloseTo(20, 6);
  });

  it('leaves a footway the ramp does not touch exactly as it was', () => {
    const positions = quad(0, 0, 2, 10);
    const before = [...positions];
    const colors = colours(6, surfaces.footway);
    cutKerbRamps(
      positions,
      colors,
      [{ axis: 'x', kerb: 20, back: 20.96, from: 4, to: 5 }],
      surfaces,
      () => 0,
    );
    expect(positions).toEqual(before);
  });

  it('closes the ramp’s two sides with a cheek of the kerb face’s colour', () => {
    const positions = quad(0, 0, 2, 10);
    const colors = colours(6, surfaces.footway);
    cutKerbRamps(
      positions,
      colors,
      [{ axis: 'x', kerb: 0, back: 0.96, from: 4, to: 5.275 }],
      surfaces,
      () => 0,
    );
    const cheeks = verticesOf(positions, colors, surfaces.kerbFace);
    expect(cheeks).toHaveLength(6);
    expect(new Set(cheeks.map((v) => v[2].toFixed(3)))).toEqual(new Set(['4.000', '5.275']));
  });

  it('is what a tile’s own geometry gets: roadTileVertices of a controlled crossroads carries the ramps it returns', () => {
    const v = roadTileVertices(
      JX,
      JZ,
      RoadTier.TwoLane,
      N | E | S | W,
      flat,
      {
        n: RoadTier.TwoLane,
        s: RoadTier.TwoLane,
        e: RoadTier.TwoLane,
        w: RoadTier.TwoLane,
      },
      undefined,
      undefined,
      undefined,
      'allWayStop',
    );
    expect(v.ramps).toHaveLength(8);
  });
});

describe('what stands beside a street keeps off the kerb ramps', () => {
  const { renderer } = crossroads(RoadTier.Avenue, RoadTier.Avenue, 'signal');
  const ramps = renderer.kerbRamps();
  const clear = keepClearOf(
    undefined,
    [],
    1,
    () => 'x',
    () => 0,
    ramps,
  );

  it('holds a ramp, and the post’s width round it, clear', () => {
    for (const r of ramps) {
      const box = kerbRampBox(r);
      const x = (box.x0 + box.x1) / 2;
      const z = (box.z0 + box.z1) / 2;
      expect(clear.blocks(x, z)).toBe(true);
      expect(clear.onRamp(x, z)).toBe(true);
      expect(clear.blocks(box.x1 + RAMP_CLEARANCE_M - 0.01, z)).toBe(true);
      expect(clear.blocks(box.x1 + RAMP_CLEARANCE_M + 0.5, box.z1 + RAMP_CLEARANCE_M + 0.5)).toBe(
        false,
      );
    }
  });

  it('never stands a lamp on a ramp', () => {
    const tiles = [
      { x: JX, z: JZ, tier: RoadTier.Avenue },
      ...[1, 2, 3].flatMap((k) =>
        [
          { x: JX + k, z: JZ },
          { x: JX - k, z: JZ },
          { x: JX, z: JZ + k },
          { x: JX, z: JZ - k },
        ].map((p) => ({ ...p, tier: RoadTier.Avenue })),
      ),
    ];
    const stands = computeLampPlacements(tiles as never, undefined, [], [], [], ramps);
    for (const s of stands) {
      for (const p of standsOf(s)) expect(clear.onRamp(p.x, p.z)).toBe(false);
    }
  });

  it('moves a signal mast on past a ramp it would have stood on', () => {
    const plus: FurnitureRoadTile[] = [
      { x: JX, z: JZ, tier: RoadTier.Avenue, control: 'signal' },
      ...[1, 2].flatMap((k) =>
        [
          { x: JX + k, z: JZ },
          { x: JX - k, z: JZ },
          { x: JX, z: JZ + k },
          { x: JX, z: JZ - k },
        ].map((p) => ({ ...p, tier: RoadTier.Avenue })),
      ),
    ];
    const masts = (clearance?: typeof clear): Array<{ x: number; z: number }> =>
      computeSignPlacements(plus, undefined, clearance)
        .filter((s) => s.type === 'signal')
        .map((s) => signWorldTransform(s));
    const before = masts();
    expect(before.length).toBeGreaterThan(0);
    expect(
      before.some((p) => clear.onRamp(p.x, p.z)),
      'one stood on a ramp',
    ).toBe(true);
    for (const p of masts(clear)) expect(clear.onRamp(p.x, p.z)).toBe(false);
  });
});
