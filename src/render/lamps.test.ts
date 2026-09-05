import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  computeLampPlacements,
  LAMP_OFF_HOUR,
  lampGlowFactor,
  LampRenderer,
  POOL_VERTICES_PER_LAMP,
  tierGetsLamp,
  type LampRoadTile,
} from './lamps';
import { RoadTier, TilePoint } from '../shared/types';
import type { RoadProfile } from '../shared/types';
import { LAMP_SPACING_TILES, TILE_METERS } from '../shared/constants';
import { carriagewayHalfWidthMeters, curbWidthMeters, SIDEWALK_WIDTH_M } from './roadsmesh';

const flatHeightAt = (): number => 0;

/** Visual-day fraction for a clock hour — the same mapping ui/format.ts uses. */
const atHour = (hour: number): number => hour / 24;
const MIDNIGHT = atHour(0);
const MIDDAY = atHour(12);

/** Default (no-tier -> TwoLane) curbside pole offset the placements carry. */
const OFF = carriagewayHalfWidthMeters(RoadTier.TwoLane) + SIDEWALK_WIDTH_M * 0.5;

/** Builds a straight run of tiles, either horizontal (fixed z) or vertical (fixed x). */
function strip(fixed: number, from: number, to: number, orientation: 'ew' | 'ns'): TilePoint[] {
  const tiles: TilePoint[] = [];
  for (let v = from; v <= to; v++) {
    tiles.push(orientation === 'ew' ? { x: v, z: fixed } : { x: fixed, z: v });
  }
  return tiles;
}

describe('computeLampPlacements (pure)', () => {
  it('respects the shared LAMP_SPACING_TILES constant', () => {
    expect(LAMP_SPACING_TILES).toBe(2); // a pole every 32 m, as real streets run
  });

  it('stands no pole on a crossroads — there is no curb to stand it on', () => {
    // A full 4-way at (4,4): both axes run through it, so the lateral offset
    // that clears one carriageway lands inside the other.
    const tiles = [...strip(4, 0, 8, 'ew'), ...strip(4, 0, 8, 'ns')];
    const placements = computeLampPlacements(tiles);
    expect(placements.some((p) => p.x === 4 && p.z === 4)).toBe(false);
  });

  it('stands a pole at the kerb of the tile’s OWN cross-section, not its preset’s', () => {
    // A two-lane with a parking lane at each kerb is 12 m of carriageway; a
    // pole placed for the 7.5 m preset would stand in the parking lane.
    const parked: RoadProfile = {
      class: 'local',
      pieces: [
        { kind: 'sidewalk', width: 1.875 },
        { kind: 'parking', width: 2.25 },
        { kind: 'travel', width: 3.75, flow: 'back' },
        { kind: 'travel', width: 3.75, flow: 'fwd' },
        { kind: 'parking', width: 2.25 },
        { kind: 'sidewalk', width: 1.875 },
      ],
    };
    const tier = RoadTier.TwoLane;
    const preset = computeLampPlacements(strip(4, 0, 8, 'ew').map((t) => ({ ...t, tier })));
    const composed = computeLampPlacements(
      strip(4, 0, 8, 'ew').map((t) => ({ ...t, tier, profile: parked })),
    );
    expect(composed.length).toBe(preset.length);
    for (const p of composed) {
      expect(p.lateralOffset).toBeGreaterThan(6); // clear of the 12 m carriageway
      expect(p.lateralOffset).toBeLessThan(6 + SIDEWALK_WIDTH_M);
    }
    for (const p of preset) expect(p.lateralOffset).toBeLessThan(6);
  });

  it('stands a motorway column on its kerb, not out in the middle of the deck', () => {
    // A motorway is 15m of carriageway in a 16m tile — half a metre of kerb,
    // not a footway. A column offset by a full sidewalk width lands beyond the
    // road entirely, which on a bridge is the blank strip out to the parapet.
    const tier = RoadTier.Highway;
    const road = carriagewayHalfWidthMeters(tier);
    const kerb = curbWidthMeters(tier);
    expect(kerb).toBeLessThan(SIDEWALK_WIDTH_M); // the case being guarded

    const placements = computeLampPlacements(strip(4, 0, 8, 'ew').map((t) => ({ ...t, tier })));
    expect(placements.length).toBeGreaterThan(0);
    for (const p of placements) {
      expect(p.lateralOffset).toBeGreaterThan(road);
      expect(p.lateralOffset).toBeLessThan(road + kerb);
    }
  });

  it('stands no pole on a T-junction either', () => {
    // Stem running north into an east-west road at (4,4).
    const tiles = [...strip(4, 0, 8, 'ew'), ...strip(4, 0, 4, 'ns')];
    const placements = computeLampPlacements(tiles);
    expect(placements.some((p) => p.x === 4 && p.z === 4)).toBe(false);
  });

  it('still lights the approaches either side of a junction', () => {
    const tiles = [...strip(4, 0, 8, 'ew'), ...strip(4, 0, 8, 'ns')];
    const placements = computeLampPlacements(tiles);
    // The straight run is untouched by the junction rule, so the crossing is
    // still lit from its approaches rather than going dark.
    expect(placements.length).toBeGreaterThan(0);
    for (const p of placements) {
      const onEW = p.z === 4 && p.x !== 4;
      const onNS = p.x === 4 && p.z !== 4;
      expect(onEW || onNS).toBe(true);
    }
  });

  it('places lamps every LAMP_SPACING_TILES along an east-west road, offset on z, alternating sides', () => {
    const tiles = strip(5, 0, 6, 'ew'); // (0,5)..(6,5)
    const placements = computeLampPlacements(tiles);

    expect(placements).toEqual([
      { x: 1, z: 5, axis: 'z', side: -1, lateralOffset: OFF },
      { x: 3, z: 5, axis: 'z', side: 1, lateralOffset: OFF },
      { x: 5, z: 5, axis: 'z', side: -1, lateralOffset: OFF },
    ]);
  });

  it('places lamps every LAMP_SPACING_TILES along a north-south road, offset on x, alternating sides', () => {
    const tiles = strip(5, 0, 6, 'ns'); // (5,0)..(5,6)
    const placements = computeLampPlacements(tiles);

    expect(placements).toEqual([
      { x: 5, z: 1, axis: 'x', side: -1, lateralOffset: OFF },
      { x: 5, z: 3, axis: 'x', side: 1, lateralOffset: OFF },
      { x: 5, z: 5, axis: 'x', side: -1, lateralOffset: OFF },
    ]);
  });

  it('continues alternating sides across more than two lamps on a longer road', () => {
    const tiles = strip(0, 0, 12, 'ew'); // (0,0)..(12,0)
    const placements = computeLampPlacements(tiles);
    // even sums: x=0,2,4,6,8,10,12 -> groups 0..6 -> sides +,-,+,-,+,-,+
    expect(placements.map((p) => p.side)).toEqual([1, -1, 1, -1, 1, -1, 1]);
    expect(placements.map((p) => p.x)).toEqual([0, 2, 4, 6, 8, 10, 12]);
  });

  it('is order-independent: shuffled input yields the same placement set', () => {
    const ordered = strip(0, 0, 12, 'ew');
    const shuffled = [...ordered].reverse();
    const a = computeLampPlacements(ordered);
    const b = computeLampPlacements(shuffled);
    const key = (p: { x: number; z: number }): string => `${p.x},${p.z}`;
    expect(new Set(a.map(key))).toEqual(new Set(b.map(key)));
    expect(a.length).toBe(b.length);
  });

  it('defaults an isolated (non-adjacent) selected tile to the z axis', () => {
    const placements = computeLampPlacements([{ x: 9, z: 9 }]); // sum=18, a multiple, no neighbors
    expect(placements).toEqual([{ x: 9, z: 9, axis: 'z', side: -1, lateralOffset: OFF }]);
  });

  it('skips tiles whose (x+z) is not a multiple of LAMP_SPACING_TILES', () => {
    const placements = computeLampPlacements([{ x: 1, z: 2 }]); // sum=3
    expect(placements).toEqual([]);
  });

  it('produces no placements for an empty road tile list', () => {
    expect(computeLampPlacements([])).toEqual([]);
  });

  it('places no lamp on a TURN tile (the curved carriageway owns it), keeping its straight neighbors lit', () => {
    // L-corner at (2,2): connects W (1,2) and N (2,1) — sum 4, so the corner
    // itself is a selected lamp tile and would get a mid-road pole without
    // the turn skip. Straight tiles at sum-multiples still get lamps.
    const tiles = [
      { x: 0, z: 2 },
      { x: 1, z: 2 },
      { x: 2, z: 2 }, // the turn (selected: 2+2=4)
      { x: 2, z: 1 },
      { x: 2, z: 0 }, // straight (selected: 2+0=2)
    ];
    const placements = computeLampPlacements(tiles);
    expect(placements.some((p) => p.x === 2 && p.z === 2)).toBe(false); // no pole in the curve
    expect(placements.some((p) => p.x === 2 && p.z === 0)).toBe(true); // neighbors still lit
  });

  it('gates lamps by tier: every tier but gravel is lamp-eligible', () => {
    expect(tierGetsLamp(RoadTier.Gravel)).toBe(false);
    expect(tierGetsLamp(RoadTier.RailTrack)).toBe(false); // a track is not a street
    for (const tier of [
      RoadTier.TwoLane,
      RoadTier.Avenue,
      RoadTier.Highway,
      RoadTier.Alley,
      RoadTier.OneWay,
      RoadTier.FourLane,
    ]) {
      expect(tierGetsLamp(tier)).toBe(true);
    }
    expect(tierGetsLamp(undefined)).toBe(true);
  });

  it('places no lamp on a gravel tile but keeps it as a neighbor for orientation', () => {
    // A straight EW run where the lamp tile (x=4) is gravel: it is skipped,
    // and the next eligible paved lamp tile still orients correctly.
    const tiles = strip(0, 0, 6, 'ew').map((t) => ({
      ...t,
      tier: t.x === 4 ? RoadTier.Gravel : RoadTier.TwoLane,
    }));
    const placements = computeLampPlacements(tiles);
    expect(placements.some((p) => p.x === 4)).toBe(false);
    expect(placements.some((p) => p.x === 6)).toBe(true);
  });

  it('is deterministic: repeated calls on the same input give the same result (no rng)', () => {
    const tiles = strip(2, 0, 20, 'ew');
    const a = computeLampPlacements(tiles);
    const b = computeLampPlacements(tiles);
    expect(b).toEqual(a);
  });
});

describe('LampRenderer', () => {
  it('rebuild() creates one instance per computed placement across every layer', () => {
    const scene = new THREE.Scene();
    const renderer = new LampRenderer(scene, flatHeightAt);
    const tiles = strip(0, 0, 12, 'ew'); // 7 placements (see test above)

    renderer.rebuild(tiles);

    expect(renderer.lampCount()).toBe(7);
    expect(renderer.poleInstanceCount()).toBe(7);
    expect(renderer.armInstanceCount()).toBe(7);
    expect(renderer.housingInstanceCount()).toBe(7);
    expect(renderer.lensInstanceCount()).toBe(7);
  });

  it('adds exactly one InstancedMesh per layer (pole/arm/housing/lens) to the scene', () => {
    const scene = new THREE.Scene();
    const renderer = new LampRenderer(scene, flatHeightAt);
    renderer.rebuild(strip(0, 0, 12, 'ew'));

    const instancedMeshes = scene.children.filter((c) => c instanceof THREE.InstancedMesh);
    // Model parts: pole, arm, housing, lens. No glow billboard and no light
    // cone — the bloom pass carries the glow off the hot lens/housing.
    expect(instancedMeshes.length).toBe(4);

    // The ground pool is the one layer that cannot be instanced: each disc
    // bakes its own terrain-sampled heights, so it is a single merged Mesh.
    const plainMeshes = scene.children.filter(
      (c) => c instanceof THREE.Mesh && !(c instanceof THREE.InstancedMesh),
    );
    expect(plainMeshes.length).toBe(1);

    // The pole is still a single tapered cylinder.
    const cylinderMeshes = instancedMeshes.filter((c) => c.geometry.type === 'CylinderGeometry');
    expect(cylinderMeshes.length).toBe(1);

    // The lens is a single small sphere; no cone geometry survives.
    const sphereMeshes = instancedMeshes.filter((c) => c.geometry.type === 'SphereGeometry');
    expect(sphereMeshes.length).toBe(1);
    const coneMeshes = instancedMeshes.filter((c) => c.geometry.type === 'ConeGeometry');
    expect(coneMeshes.length).toBe(0);

    // The arm bracket (curved/angled, neck+reach) and the housing (tapered
    // mounting cap + cowl) are now merged multi-part geometries, not bare
    // boxes — so no BoxGeometry survives at the top level, and exactly 2
    // merged BufferGeometry layers remain.
    const boxMeshes = instancedMeshes.filter((c) => c.geometry.type === 'BoxGeometry');
    expect(boxMeshes.length).toBe(0);
    const mergedMeshes = instancedMeshes.filter((c) => c.geometry.type === 'BufferGeometry');
    expect(mergedMeshes.length).toBe(2); // arm + housing
  });

  it('models the arm and housing as merged multi-part geometry (curved bracket, tapered cowl) rather than bare boxes', () => {
    const scene = new THREE.Scene();
    const renderer = new LampRenderer(scene, flatHeightAt);
    renderer.rebuild([{ x: 4, z: 4 }]);

    const merged = scene.children.filter(
      (c): c is THREE.InstancedMesh =>
        c instanceof THREE.InstancedMesh && c.geometry.type === 'BufferGeometry',
    );
    expect(merged.length).toBe(2); // arm bracket + housing cowl
    for (const mesh of merged) {
      const vertexCount = (mesh.geometry.getAttribute('position') as THREE.BufferAttribute).count;
      // More than a single BoxGeometry's 24 vertices: proof each part is a
      // merged multi-segment/multi-piece shape, not one bare box.
      expect(vertexCount).toBeGreaterThan(24);
    }
  });

  it('rebuild() with no road tiles clears everything back to zero', () => {
    const scene = new THREE.Scene();
    const renderer = new LampRenderer(scene, flatHeightAt);
    renderer.rebuild(strip(0, 0, 12, 'ew'));
    expect(renderer.lampCount()).toBeGreaterThan(0);

    renderer.rebuild([]);
    expect(renderer.lampCount()).toBe(0);
    expect(renderer.poleInstanceCount()).toBe(0);
    expect(renderer.armInstanceCount()).toBe(0);
    expect(renderer.housingInstanceCount()).toBe(0);
    expect(renderer.lensInstanceCount()).toBe(0);
    expect(renderer.poolVertexCount()).toBe(0);
    expect(scene.children.filter((c) => c instanceof THREE.Mesh).length).toBe(0);
  });

  it('a second rebuild() disposes the previous meshes instead of accumulating them', () => {
    const scene = new THREE.Scene();
    const renderer = new LampRenderer(scene, flatHeightAt);
    renderer.rebuild(strip(0, 0, 12, 'ew'));
    const firstMeshes = scene.children.filter((c) => c instanceof THREE.Mesh);

    renderer.rebuild(strip(0, 0, 30, 'ew'));
    const secondMeshes = scene.children.filter((c) => c instanceof THREE.Mesh);

    expect(secondMeshes.length).toBe(5); // 4 instanced layers + the merged pool
    for (const mesh of firstMeshes) expect(scene.children).not.toContain(mesh);
  });

  it('casts shadows from the pole, arm, and housing — the lens is a light source, not an occluder', () => {
    const scene = new THREE.Scene();
    const renderer = new LampRenderer(scene, flatHeightAt);
    renderer.rebuild(strip(0, 0, 12, 'ew'));

    expect(renderer.poleCastShadow()).toBe(true);
    expect(renderer.armCastShadow()).toBe(true);
    expect(renderer.housingCastShadow()).toBe(true);

    const instancedMeshes = scene.children.filter(
      (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh,
    );
    const lens = instancedMeshes.find((c) => c.geometry.type === 'SphereGeometry')!;
    expect(lens.castShadow).toBe(false);
  });

  it('setTimeOfDay drives housing, lens and pool together, all past the bloom threshold at night', () => {
    const scene = new THREE.Scene();
    const renderer = new LampRenderer(scene, flatHeightAt);
    renderer.rebuild(strip(0, 0, 12, 'ew'));

    renderer.setTimeOfDay(MIDNIGHT);
    const housingNight = renderer.housingEmissiveIntensity();
    const lensNight = renderer.lensEmissiveIntensity();
    // Both clear BLOOM_LUMINANCE_THRESHOLD (0.35) by a wide margin, and the
    // lens — the compact core the halo grows from — is the hotter of the two.
    expect(housingNight).toBeGreaterThan(1);
    expect(lensNight).toBeGreaterThan(housingNight);
    expect(renderer.poolOpacity()).toBeGreaterThan(0);

    renderer.setTimeOfDay(MIDDAY);
    expect(renderer.housingEmissiveIntensity()).toBe(0);
    expect(renderer.lensEmissiveIntensity()).toBe(0);
    expect(renderer.poolOpacity()).toBe(0); // no glowing patch on a daylit road

    // Out-of-range fractions wrap rather than clamping to a stuck value.
    renderer.setTimeOfDay(MIDNIGHT + 3);
    expect(renderer.housingEmissiveIntensity()).toBeCloseTo(housingNight, 9);
    renderer.setTimeOfDay(MIDDAY - 2);
    expect(renderer.housingEmissiveIntensity()).toBe(0);
  });

  it('places the pole at the curbside position, ground-height-following, with the arm mount above the pole', () => {
    const scene = new THREE.Scene();
    const renderer = new LampRenderer(scene, flatHeightAt);
    // A single selected tile at (4,5): axis defaults to 'z' (isolated tile), side -1.
    renderer.rebuild([{ x: 4, z: 4 }]);
    expect(renderer.lampCount()).toBe(1);

    const polePos = renderer.polePosition(0);
    const armPos = renderer.armPosition(0);
    expect(armPos.y).toBeGreaterThan(polePos.y);
  });

  it('the arm reaches from the pole toward the road centerline, and the housing sits at the arm end (laterally between the pole and the centerline, over the road)', () => {
    const scene = new THREE.Scene();
    const renderer = new LampRenderer(scene, flatHeightAt);
    // Isolated tile (4,6): axis 'z', side -1 -> pole offset toward -z from
    // tile center; the arm/housing must move back toward +z (the centerline).
    renderer.rebuild([{ x: 4, z: 6 }]);

    const polePos = renderer.polePosition(0);
    const housingPos = renderer.housingPosition(0);
    const lensPos = renderer.lensPosition(0);

    // Pole side is -1 on axis z: pole.z < tile center. The housing must be
    // pulled back toward the centerline, i.e. housing.z > pole.z, but by less
    // than double the pole's own offset from the tile center (ARM_LENGTH is
    // 0.8x the pole offset) — still over the near lane, same side as the pole.
    const tileCenterZ = 104; // tileToWorld(6) = (6+0.5)*16
    const poleOffsetFromCenter = tileCenterZ - polePos.z;
    expect(housingPos.z).toBeGreaterThan(polePos.z);
    expect(housingPos.z).toBeLessThan(tileCenterZ);
    expect(tileCenterZ - housingPos.z).toBeLessThan(poleOffsetFromCenter);

    // The lens hangs in the cowl mouth: below the housing attach point, over
    // the road with it, and nowhere near the pole's own z (beside the road).
    expect(lensPos.y).toBeLessThan(housingPos.y);
    expect(Math.abs(lensPos.z - housingPos.z)).toBeLessThan(0.5);
    expect(lensPos.z).not.toBeCloseTo(polePos.z, 1);
  });

  it('the arm bracket yaw rotates its local +X reach to match the actual world direction it must extend toward the road, for every axis/side combination', () => {
    const scene = new THREE.Scene();
    const renderer = new LampRenderer(scene, flatHeightAt);

    const check = (
      tiles: TilePoint[],
      slot: number,
      axis: 'x' | 'z',
      expectedSign: 1 | -1,
    ): void => {
      renderer.rebuild(tiles);
      const quat = renderer.armQuaternion(slot);
      const dir = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);
      const component = axis === 'x' ? dir.x : dir.z;
      expect(Math.sign(Math.round(component))).toBe(expectedSign);
    };

    // ns strip -> axis 'x': slot0 side=-1 (pole offset -x, arm must reach +x),
    // slot1 side=1 (pole offset +x, arm must reach -x).
    check(strip(5, 0, 6, 'ns'), 0, 'x', 1);
    check(strip(5, 0, 6, 'ns'), 1, 'x', -1);
    // ew strip -> axis 'z': slot0 side=-1 (pole offset -z, arm must reach +z),
    // slot1 side=1 (pole offset +z, arm must reach -z).
    check(strip(5, 0, 6, 'ew'), 0, 'z', 1);
    check(strip(5, 0, 6, 'ew'), 1, 'z', -1);
  });

  it('lamp part positions are deterministic: repeated rebuilds on the same tiles give identical transforms', () => {
    const scene = new THREE.Scene();
    const renderer = new LampRenderer(scene, flatHeightAt);
    const tiles = strip(0, 0, 12, 'ew');

    renderer.rebuild(tiles);
    const a = {
      pole: renderer.polePosition(2),
      arm: renderer.armPosition(2),
      housing: renderer.housingPosition(2),
      lens: renderer.lensPosition(2),
    };

    renderer.rebuild(tiles);
    const b = {
      pole: renderer.polePosition(2),
      arm: renderer.armPosition(2),
      housing: renderer.housingPosition(2),
      lens: renderer.lensPosition(2),
    };

    expect(b.pole).toEqual(a.pole);
    expect(b.arm).toEqual(a.arm);
    expect(b.housing).toEqual(a.housing);
    expect(b.lens).toEqual(a.lens);
  });

  it('adds a lens layer with one instance per lamp, seated under the housing on ground-following terrain', () => {
    const heights = new Map<string, number>([['80,80', 12]]);
    const heightAt = (x: number, z: number): number =>
      heights.get(`${Math.round(x)},${Math.round(z)}`) ?? 0;
    const scene = new THREE.Scene();
    const renderer = new LampRenderer(scene, heightAt);
    renderer.rebuild([{ x: 4, z: 4 }]);
    expect(renderer.lampCount()).toBe(1);
    expect(renderer.lensInstanceCount()).toBe(1);

    const housingPos = renderer.housingPosition(0);
    const lensPos = renderer.lensPosition(0);

    // The bulb sits inside the cowl: below the attach point by roughly the
    // cowl's own depth, never further than the housing is off the ground.
    const drop = housingPos.y - lensPos.y;
    expect(drop).toBeGreaterThan(0.2);
    expect(drop).toBeLessThan(0.6);
    expect(lensPos.y).toBeGreaterThan(0);
  });

  it('lays one ground pool per lamp, centered on the road under the luminaire rather than on the curb', () => {
    const scene = new THREE.Scene();
    const renderer = new LampRenderer(scene, flatHeightAt);
    renderer.rebuild(strip(0, 0, 12, 'ew'));

    expect(renderer.poolVertexCount()).toBe(renderer.lampCount() * POOL_VERTICES_PER_LAMP);

    const housingPos = renderer.housingPosition(0);
    const polePos = renderer.polePosition(0);
    const poolCenter = renderer.poolCenter(0);
    expect(poolCenter.x).toBeCloseTo(housingPos.x, 9);
    expect(poolCenter.z).toBeCloseTo(housingPos.z, 9);
    expect(poolCenter.z).not.toBeCloseTo(polePos.z, 1);
    // Sits on the ground, not up at the fixture.
    expect(poolCenter.y).toBeLessThan(1);
    expect(poolCenter.y).toBeGreaterThan(0);
  });

  it('winds every pool to face upward, whichever way the road runs', () => {
    // The two lamp axes are a 90° rotation of each other, not a coordinate
    // swap: a swap mirrors the plane, reversing the winding, and a pool wound
    // downward is back-face culled — the road simply has no light on it.
    for (const orientation of ['ew', 'ns'] as const) {
      const scene = new THREE.Scene();
      const renderer = new LampRenderer(scene, flatHeightAt);
      renderer.rebuild(strip(4, 0, 12, orientation));
      expect(renderer.lampCount()).toBeGreaterThan(0);
      for (const tri of [0, 1, 5]) {
        expect(renderer.poolTriangleFacing(tri)).toBe(1);
      }
    }
  });

  it('lights a north-south road as brightly as an east-west one', () => {
    const ew = new LampRenderer(new THREE.Scene(), flatHeightAt);
    ew.rebuild(strip(4, 0, 12, 'ew'));
    const ns = new LampRenderer(new THREE.Scene(), flatHeightAt);
    ns.rebuild(strip(4, 0, 12, 'ns'));

    expect(ns.lampCount()).toBe(ew.lampCount());
    expect(ns.poolVertexCount()).toBe(ew.poolVertexCount());
    expect(ns.poolTriangleFacing(0)).toBe(ew.poolTriangleFacing(0));
  });

  it('stretches the pool down the roadway, not across it, so successive lamps light a continuous corridor', () => {
    const scene = new THREE.Scene();
    const renderer = new LampRenderer(scene, flatHeightAt);

    // Isolated tile -> axis 'z' (lateral), so the roadway runs along x.
    renderer.rebuild([{ x: 4, z: 4 }]);
    const center = renderer.poolCenter(0);
    let alongReach = 0;
    let acrossReach = 0;
    for (let v = 0; v < POOL_VERTICES_PER_LAMP; v++) {
      alongReach = Math.max(alongReach, Math.abs(renderer.poolVertexX(v) - center.x));
      acrossReach = Math.max(acrossReach, Math.abs(renderer.poolVertexZ(v) - center.z));
    }
    expect(alongReach).toBeGreaterThan(acrossReach * 2);

    // Long enough that the pool reaches most of the way to the next pole:
    // lamps stand LAMP_SPACING_TILES apart, so half that gap is what it must
    // cover for the lit stretches to meet.
    expect(alongReach).toBeGreaterThan((LAMP_SPACING_TILES * TILE_METERS) / 3);
    // ...but still narrow enough not to flood the lots either side of the road.
    expect(acrossReach).toBeLessThan(TILE_METERS / 2);
  });

  it('conforms the pool to the terrain: every vertex sits a fixed clearance above the ground it covers', () => {
    // A ramp along x — a flat disc at one height would slice straight through.
    const ramp = (x: number): number => x * 0.05;
    const scene = new THREE.Scene();
    const renderer = new LampRenderer(scene, (x) => ramp(x));
    renderer.rebuild([{ x: 4, z: 4 }]);

    const heights: number[] = [];
    for (let v = 0; v < POOL_VERTICES_PER_LAMP; v++) heights.push(renderer.poolVertexY(v));
    const spread = Math.max(...heights) - Math.min(...heights);
    // The rim spans the disc's full diameter, so on this ramp the vertex
    // heights must spread by roughly that much — proof they follow the ground.
    expect(spread).toBeGreaterThan(0.3);

    // And the clearance above the sampled ground is identical everywhere.
    const clearance = renderer.poolCenter(0).y - ramp(renderer.poolCenter(0).x);
    expect(clearance).toBeGreaterThan(0);
    expect(clearance).toBeLessThan(0.5);
  });
});

describe('lampGlowFactor (pure)', () => {
  it('burns full through the night and stays dark through the day', () => {
    expect(lampGlowFactor(atHour(0))).toBe(1);
    expect(lampGlowFactor(atHour(3))).toBe(1);
    expect(lampGlowFactor(atHour(21))).toBe(1);
    expect(lampGlowFactor(atHour(9))).toBe(0);
    expect(lampGlowFactor(MIDDAY)).toBe(0);
    expect(lampGlowFactor(atHour(17))).toBe(0);
  });

  it('goes fully dark one hour past sunrise, fading over that hour rather than popping', () => {
    expect(LAMP_OFF_HOUR).toBe(7);
    expect(lampGlowFactor(atHour(6))).toBe(1); // sunrise: still lit
    expect(lampGlowFactor(atHour(6.5))).toBeCloseTo(0.5, 9);
    expect(lampGlowFactor(atHour(LAMP_OFF_HOUR))).toBe(0);
    expect(lampGlowFactor(atHour(7.5))).toBe(0);
  });

  it('lights up from sunset and reaches full once dusk has settled', () => {
    expect(lampGlowFactor(atHour(18))).toBe(0); // sunset: just switching on
    expect(lampGlowFactor(atHour(18.75))).toBeCloseTo(0.5, 9);
    expect(lampGlowFactor(atHour(19.5))).toBe(1);
  });

  it('is monotonic across each ramp and wraps for out-of-range day fractions', () => {
    for (let h = 18; h < 19.5; h += 0.25) {
      expect(lampGlowFactor(atHour(h + 0.25))).toBeGreaterThan(lampGlowFactor(atHour(h)));
    }
    for (let h = 6; h < 7; h += 0.25) {
      expect(lampGlowFactor(atHour(h + 0.25))).toBeLessThan(lampGlowFactor(atHour(h)));
    }
    expect(lampGlowFactor(MIDDAY + 4)).toBe(lampGlowFactor(MIDDAY));
    expect(lampGlowFactor(MIDDAY - 4)).toBe(lampGlowFactor(MIDDAY));
  });
});

describe('lamps keep out of a lot entrance', () => {
  const tileKeyOf = (x: number, z: number): number => x * 100_000 + z;
  const row = (z: number, x0: number, x1: number): LampRoadTile[] =>
    Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, z, tier: RoadTier.TwoLane }));

  // A lamp planted in a car park entrance stands in the middle of the way in.
  it('skips a tile a driveway crosses', () => {
    const tiles = row(8, 0, 20);
    const all = computeLampPlacements(tiles);
    expect(all.length).toBeGreaterThan(0);

    const victim = all[0]!;
    const blocked = computeLampPlacements(tiles, new Set([tileKeyOf(victim.x, victim.z)]));
    expect(blocked.some((p) => p.x === victim.x && p.z === victim.z)).toBe(false);
    expect(blocked.length).toBe(all.length - 1);
  });

  it('leaves every other lamp exactly where it was', () => {
    const tiles = row(8, 0, 20);
    const all = computeLampPlacements(tiles);
    const victim = all[0]!;
    const blocked = computeLampPlacements(tiles, new Set([tileKeyOf(victim.x, victim.z)]));
    expect(blocked).toEqual(all.filter((p) => !(p.x === victim.x && p.z === victim.z)));
  });

  it('changes nothing when no driveway is in the way', () => {
    const tiles = row(8, 0, 20);
    expect(computeLampPlacements(tiles, new Set())).toEqual(computeLampPlacements(tiles));
  });
});
