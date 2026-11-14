import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  armLengthOf,
  CLEAR_ZONE_FAST_M,
  CLEAR_ZONE_SLOW_M,
  computeLampPlacements,
  LAMP_HEIGHTS_M,
  LAMP_OFF_HOUR,
  lampGlowFactor,
  lampLateralOffset,
  LampRenderer,
  lampRuleOf,
  POOL_VERTICES_PER_LAMP,
  standOf,
  standsOf,
  STOP_CLEAR_HALF_M,
  tierGetsLamp,
  type LampRoadTile,
  type LampStopSite,
} from './lamps';
import { computeTramPolePlacements, POLE_BEHIND_KERB_M, type TramPoleStand } from './roadfurniture';
import { RoadFlow, RoadTier, storedFlow, TilePoint } from '../shared/types';
import type { RoadProfile } from '../shared/types';
import {
  carriagewayHalfWidthOf,
  carriagewayShiftOf,
  corridorHalfProfile,
  hasFootway,
  hasKerbs,
  presetProfileForTier,
  ROAD_PRESETS,
} from '../shared/roadprofile';
import { BUS_STOP_PAD, busStopPlacement } from './busstops';
import { LAMP_SPACING_TILES, LAMP_SPACING_WIDE_TILES, TILE_METERS } from '../shared/constants';
import { carriagewayHalfWidthMeters, SIDEWALK_WIDTH_M } from './roadsmesh';

const flatHeightAt = (): number => 0;

/** Visual-day fraction for a clock hour — the same mapping ui/format.ts uses. */
const atHour = (hour: number): number => hour / 24;
const MIDNIGHT = atHour(0);
const MIDDAY = atHour(12);

/** Default (no-tier -> TwoLane) pole offset the placements carry: 0.46 m behind the kerb face. */
const OFF = carriagewayHalfWidthMeters(RoadTier.TwoLane) + POLE_BEHIND_KERB_M;
/** The lowest pole, which a two-lane street takes. */
const LOW = LAMP_HEIGHTS_M[0];

/** Builds a straight run of tiles, either horizontal (fixed z) or vertical (fixed x). */
function strip(fixed: number, from: number, to: number, orientation: 'ew' | 'ns'): TilePoint[] {
  const tiles: TilePoint[] = [];
  for (let v = from; v <= to; v++) {
    tiles.push(orientation === 'ew' ? { x: v, z: fixed } : { x: fixed, z: v });
  }
  return tiles;
}

describe('computeLampPlacements (pure)', () => {
  it('respects the shared lamp spacing constants', () => {
    expect(LAMP_SPACING_TILES).toBe(3); // a narrow street: a pole every 60 m
    expect(LAMP_SPACING_WIDE_TILES).toBe(4); // a wide one: a pair every 80 m
  });

  it('stands no pole on a crossroads — there is no curb to stand it on', () => {
    // A full 4-way at (4,4): both axes run through it, so the lateral offset
    // that clears one carriageway lands inside the other.
    const tiles = [...strip(4, 0, 8, 'ew'), ...strip(4, 0, 8, 'ns')];
    const placements = computeLampPlacements(tiles);
    expect(placements.some((p) => p.x === 4 && p.z === 4)).toBe(false);
  });

  it('stands no pole on a corner of a compact roundabout, where it would stand in the ring', () => {
    const run = strip(4, 0, 8, 'ew');
    const lit = computeLampPlacements(run);
    expect(lit.length).toBeGreaterThan(0);
    const ring = computeLampPlacements(run.map((t) => ({ ...t, ring: true as const })));
    expect(ring).toEqual([]);
  });

  it('stands no pole on a street the grid has not reached — the pole goes up with the cable', () => {
    const run = strip(4, 0, 8, 'ew');
    const lit = computeLampPlacements(run.map((t) => ({ ...t, powered: true })));
    const dark = computeLampPlacements(run.map((t) => ({ ...t, powered: false })));
    expect(lit.length).toBeGreaterThan(0);
    expect(dark).toEqual([]);
  });

  it('lights the supplied half of a street and leaves the rest dark', () => {
    // Supply reaches as far as x = 4 and no further, which is what a district
    // coming on line looks like from above.
    const run = strip(4, 0, 8, 'ew').map((t) => ({ ...t, powered: t.x <= 4 }));
    const placements = computeLampPlacements(run);
    expect(placements.length).toBeGreaterThan(0);
    expect(placements.every((p) => p.x <= 4)).toBe(true);
  });

  it('a dark stretch does not turn its lit neighbours the wrong way', () => {
    // An unsupplied tile still counts as road for orientation, so the poles
    // either side of it keep facing the way the run does. Were it dropped from
    // the run entirely, a tile beside the gap would read as having no
    // east-west neighbour and stand its pole on the wrong axis.
    const run = strip(4, 0, 8, 'ew');
    const lit = computeLampPlacements(run.map((t) => ({ ...t, powered: true })));
    const gapped = computeLampPlacements(run.map((t) => ({ ...t, powered: t.x !== 3 })));
    for (const p of gapped) {
      const same = lit.find((q) => q.x === p.x && q.z === p.z);
      expect(same).toBeDefined();
      expect(p.axis).toBe(same?.axis);
      expect(p.side).toBe(same?.side);
    }
  });

  it('says nothing about power and gets the lamps it always got', () => {
    // Every caller that predates the power network — and every test below —
    // leaves `powered` unsaid, and must be unaffected.
    const run = strip(4, 0, 8, 'ew');
    expect(computeLampPlacements(run)).toEqual(
      computeLampPlacements(run.map((t) => ({ ...t, powered: true }))),
    );
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

  it('stands a motorway pole at the tile’s edge, clear of its shoulders', () => {
    // A motorway has no footway and no kerb — its shoulders are inside the
    // paved width already — and its 15.45 m of carriageway leaves less than the
    // 4.6 m clear zone before the tile's edge, so the pole stands on the edge.
    const tier = RoadTier.Highway;
    const road = carriagewayHalfWidthMeters(tier);
    const placements = computeLampPlacements(strip(4, 0, 8, 'ew').map((t) => ({ ...t, tier })));
    expect(placements.length).toBeGreaterThan(0);
    for (const p of placements) {
      expect(p.lateralOffset).toBeGreaterThan(road);
      expect(p.lateralOffset).toBe(TILE_METERS / 2);
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
      { x: 0, z: 5, axis: 'z', side: 1, lateralOffset: OFF, height: LOW },
      { x: 3, z: 5, axis: 'z', side: -1, lateralOffset: OFF, height: LOW },
      { x: 6, z: 5, axis: 'z', side: 1, lateralOffset: OFF, height: LOW },
    ]);
  });

  it('places lamps every LAMP_SPACING_TILES along a north-south road, offset on x, alternating sides', () => {
    const tiles = strip(5, 0, 6, 'ns'); // (5,0)..(5,6)
    const placements = computeLampPlacements(tiles);

    expect(placements).toEqual([
      { x: 5, z: 0, axis: 'x', side: 1, lateralOffset: OFF, height: LOW },
      { x: 5, z: 3, axis: 'x', side: -1, lateralOffset: OFF, height: LOW },
      { x: 5, z: 6, axis: 'x', side: 1, lateralOffset: OFF, height: LOW },
    ]);
  });

  it('continues alternating sides across more than two lamps on a longer road', () => {
    const tiles = strip(0, 0, 12, 'ew'); // (0,0)..(12,0)
    const placements = computeLampPlacements(tiles);
    // x = 0,3,6,9,12 -> groups 0..4 -> sides +,-,+,-,+
    expect(placements.map((p) => p.side)).toEqual([1, -1, 1, -1, 1]);
    expect(placements.map((p) => p.x)).toEqual([0, 3, 6, 9, 12]);
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
    const placements = computeLampPlacements([{ x: 9, z: 9 }]); // x=9, a multiple, no neighbors
    expect(placements).toEqual([
      { x: 9, z: 9, axis: 'z', side: -1, lateralOffset: OFF, height: LOW },
    ]);
  });

  it('skips tiles whose run position is not a multiple of LAMP_SPACING_TILES', () => {
    const placements = computeLampPlacements([{ x: 1, z: 2 }]); // x=1
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
    const tiles = strip(0, 0, 12, 'ew'); // 5 placements (see test above)

    renderer.rebuild(tiles);

    expect(renderer.lampCount()).toBe(5);
    expect(renderer.poleInstanceCount()).toBe(5);
    expect(renderer.armInstanceCount()).toBe(5);
    expect(renderer.housingInstanceCount()).toBe(5);
    expect(renderer.lensInstanceCount()).toBe(5);
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
    renderer.rebuild([{ x: 3, z: 4 }]);

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
    expect(scene.children.filter((c) => c instanceof THREE.Mesh && c.visible).length).toBe(0);
  });

  it('rebuilds with the same or fewer lamps keep the same meshes and add no children', () => {
    const scene = new THREE.Scene();
    const renderer = new LampRenderer(scene, flatHeightAt);
    renderer.rebuild(strip(0, 0, 30, 'ew'));
    const first = [...scene.children];
    expect(first.length).toBe(5); // 4 instanced layers + the merged pool

    renderer.rebuild(strip(0, 0, 30, 'ew'));
    renderer.rebuild(strip(0, 0, 12, 'ew'));
    expect(scene.children).toEqual(first);
    expect(scene.children.every((c) => c.visible)).toBe(true);
    expect(renderer.poleInstanceCount()).toBe(renderer.lampCount());

    renderer.rebuild([]);
    expect(scene.children).toEqual(first);
    expect(renderer.poleInstanceCount()).toBe(0);
    expect(scene.children.some((c) => c.visible)).toBe(false);
  });

  it('a rebuild that needs more room replaces and disposes the old instanced meshes', () => {
    const scene = new THREE.Scene();
    const renderer = new LampRenderer(scene, flatHeightAt);
    renderer.rebuild(strip(0, 0, 12, 'ew'));
    const instanced = scene.children.filter(
      (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh,
    );
    const pool = scene.children.find((c) => !(c instanceof THREE.InstancedMesh));
    let disposed = 0;
    for (const mesh of instanced) mesh.addEventListener('dispose', () => (disposed += 1));

    // Past the instance capacity floor: well over 2048 lamps.
    renderer.rebuild(strip(0, 0, 7000, 'ew'));

    expect(disposed).toBe(4);
    expect(scene.children.length).toBe(5);
    for (const mesh of instanced) expect(scene.children).not.toContain(mesh);
    expect(scene.children).toContain(pool);
    expect(renderer.poleInstanceCount()).toBe(renderer.lampCount());
  });

  it('after reused rebuilds the lamps equal what a fresh renderer builds for the same input', () => {
    const scene = new THREE.Scene();
    const reused = new LampRenderer(scene, flatHeightAt);
    reused.rebuild(strip(0, 0, 60, 'ew'));
    reused.rebuild(strip(0, 0, 12, 'ns'));
    reused.rebuild(strip(4, 0, 20, 'ns'));

    const fresh = new LampRenderer(new THREE.Scene(), flatHeightAt);
    fresh.rebuild(strip(4, 0, 20, 'ns'));

    expect(reused.lampCount()).toBe(fresh.lampCount());
    for (let slot = 0; slot < fresh.lampCount(); slot++) {
      expect(reused.polePosition(slot)).toEqual(fresh.polePosition(slot));
      expect(reused.armPosition(slot)).toEqual(fresh.armPosition(slot));
      expect(reused.armQuaternion(slot)).toEqual(fresh.armQuaternion(slot));
      expect(reused.housingPosition(slot)).toEqual(fresh.housingPosition(slot));
      expect(reused.lensPosition(slot)).toEqual(fresh.lensPosition(slot));
      expect(reused.poolCenter(slot)).toEqual(fresh.poolCenter(slot));
    }
    expect(reused.poolVertexCount()).toBe(fresh.poolVertexCount());
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
    // A single selected tile at (3,4): axis defaults to 'z' (isolated tile), side -1.
    renderer.rebuild([{ x: 3, z: 4 }]);
    expect(renderer.lampCount()).toBe(1);

    const polePos = renderer.polePosition(0);
    const armPos = renderer.armPosition(0);
    expect(armPos.y).toBeGreaterThan(polePos.y);
  });

  it('the arm reaches from the pole toward the road centerline, and the housing sits at the arm end (laterally between the pole and the centerline, over the road)', () => {
    const scene = new THREE.Scene();
    const renderer = new LampRenderer(scene, flatHeightAt);
    // Isolated tile (3,6): axis 'z', side -1 -> pole offset toward -z from
    // tile center; the arm/housing must move back toward +z (the centerline).
    renderer.rebuild([{ x: 3, z: 6 }]);

    const polePos = renderer.polePosition(0);
    const housingPos = renderer.housingPosition(0);
    const lensPos = renderer.lensPosition(0);

    // Pole side is -1 on axis z: pole.z < tile center. The housing must be
    // pulled back toward the centerline, i.e. housing.z > pole.z, but by less
    // than double the pole's own offset from the tile center (ARM_LENGTH is
    // 0.8x the pole offset) — still over the near lane, same side as the pole.
    const tileCenterZ = (6 + 0.5) * TILE_METERS; // tileToWorld(6)
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

    // ns strip -> axis 'x': slot0 side=1 (pole offset +x, arm must reach -x),
    // slot1 side=-1 (pole offset -x, arm must reach +x).
    check(strip(5, 0, 6, 'ns'), 0, 'x', -1);
    check(strip(5, 0, 6, 'ns'), 1, 'x', 1);
    // ew strip -> axis 'z': slot0 side=1 (pole offset +z, arm must reach -z),
    // slot1 side=-1 (pole offset -z, arm must reach +z).
    check(strip(5, 0, 6, 'ew'), 0, 'z', -1);
    check(strip(5, 0, 6, 'ew'), 1, 'z', 1);
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
    renderer.rebuild([{ x: 3, z: 4 }]);
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
    renderer.rebuild([{ x: 3, z: 4 }]);
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
    renderer.rebuild([{ x: 3, z: 4 }]);

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

describe('a tram contact pole stands in place of a lamp beside it', () => {
  const row: LampRoadTile[] = Array.from({ length: 21 }, (_, x) => ({
    x,
    z: 8,
    tier: RoadTier.Tram,
  }));

  it('moves a lamp within 1.5 m of a pole along its strip and keeps every other', () => {
    const all = computeLampPlacements(row);
    const victim = standOf(all[1]!);
    // A pole on the same kerb, 1.4 m along: the lamp gives way to it, sliding
    // along its own strip to the nearest place 1.5 m clear.
    const near: TramPoleStand = {
      x: victim.x + 1.4,
      z: victim.z,
      reachX: 0,
      reachZ: 0,
      bracket: true,
      spanTo: null,
      hangs: [],
    };
    const moved = computeLampPlacements(row, undefined, [near]);
    expect(moved.length).toBe(all.length);
    expect(moved.filter((_, i) => i !== 1)).toEqual(all.filter((_, i) => i !== 1));
    const slid = standOf(moved[1]!);
    expect(moved[1]!.x).toBe(all[1]!.x);
    expect(moved[1]!.along).toBeDefined();
    expect(Math.hypot(near.x - slid.x, near.z - slid.z)).toBeGreaterThanOrEqual(1.5);
    // 1.6 m along, it stands its ground.
    const far: TramPoleStand = { ...near, x: victim.x + 1.6 };
    expect(computeLampPlacements(row, undefined, [far])).toEqual(all);
  });

  it('keeps the lamps of a tramway 1.5 m from every pole', () => {
    const poles = computeTramPolePlacements(row);
    const lamps = computeLampPlacements(row, undefined, poles).map(standOf);
    for (const lamp of lamps) {
      for (const pole of poles) {
        expect(Math.hypot(pole.x - lamp.x, pole.z - lamp.z)).toBeGreaterThanOrEqual(1.5);
      }
    }
    expect(lamps.length).toBeGreaterThan(0);
  });
});

describe('a road laid across two tiles is lit from its outer kerbs', () => {
  const lane = (flow: 'fwd' | 'back') => ({ kind: 'travel' as const, width: 3.6, flow });
  const walk = { kind: 'sidewalk' as const, width: 1.9 };
  const arterial: RoadProfile = {
    class: 'arterial',
    pieces: [
      walk,
      lane('back'),
      lane('back'),
      lane('back'),
      lane('fwd'),
      lane('fwd'),
      lane('fwd'),
      walk,
    ],
  };
  /** Six lanes along x, the near half on row 4 and the far half on row 5. */
  const corridor = (): LampRoadTile[] =>
    (['left', 'right'] as const).flatMap((half, i) =>
      strip(4 + i, 0, 20, 'ew').map((t) => ({
        ...t,
        tier: RoadTier.Avenue,
        flow: storedFlow(RoadFlow.East, half),
        profile: corridorHalfProfile(arterial, half),
      })),
    );

  it('lights both halves, each from the kerb away from the other', () => {
    const lamps = computeLampPlacements(corridor());
    expect(lamps.some((l) => l.z === 4)).toBe(true);
    expect(lamps.some((l) => l.z === 5)).toBe(true);
    for (const l of lamps) {
      expect(l.axis).toBe('z');
      expect(l.side).toBe(l.z === 4 ? -1 : 1);
    }
  });

  it('stands each pole at its own kerb, where the carriageway has been pushed to', () => {
    const lamps = computeLampPlacements(corridor());
    expect(lamps.length).toBeGreaterThan(0);
    for (const l of lamps) {
      const half = corridorHalfProfile(arterial, l.z === 4 ? 'left' : 'right');
      const kerb = carriagewayShiftOf(half) - half.seam!.side * carriagewayHalfWidthOf(half);
      const out = (l.side * l.lateralOffset - kerb) * l.side;
      expect(out).toBeGreaterThan(0);
      expect(out).toBeLessThan(walk.width);
    }
  });

  it('keeps an ordinary street’s pole off a kerb with another road right beside it', () => {
    // Two streets side by side, each holding apart the arm toward the other.
    const street = strip(8, 0, 20, 'ew').map((t) => ({ ...t, apart: 4 }));
    const beside = strip(9, 0, 20, 'ew').map((t) => ({ ...t, apart: 1 }));
    const lamps = computeLampPlacements([...street, ...beside]).filter((l) => l.z === 8);
    expect(lamps.length).toBeGreaterThan(0);
    for (const l of lamps) expect(l.side).toBe(-1);
  });
});

describe('a lamp stands in the furnishing strip, by the street’s width', () => {
  const road = (tier: RoadTier, profile?: RoadProfile, x1 = 24): LampRoadTile[] =>
    strip(4, 0, x1, 'ew').map((t) => (profile ? { ...t, tier, profile } : { ...t, tier }));
  const light = (tier: RoadTier, profile?: RoadProfile, x1 = 24) =>
    computeLampPlacements(road(tier, profile, x1));
  const EDGE = TILE_METERS / 2;

  describe('behind the kerb, or back from a road with none, on every profile', () => {
    for (const spec of ROAD_PRESETS.filter((s) => tierGetsLamp(s.tier))) {
      const profile = presetProfileForTier(spec.tier);
      it(`tier ${spec.tier} (${profile.class})`, () => {
        const half = carriagewayHalfWidthOf(profile);
        const placements = light(spec.tier, profile);
        expect(placements.length).toBeGreaterThan(0);
        for (const p of placements) {
          // The carriageway, parking and bike lanes included, ends at `half`.
          expect(p.lateralOffset).toBeGreaterThan(half);
          expect(p.lateralOffset).toBeLessThanOrEqual(EDGE);
          if (hasKerbs(profile)) {
            expect(p.lateralOffset).toBeCloseTo(Math.min(half + POLE_BEHIND_KERB_M, EDGE), 2);
          } else if (profile.class === 'ramp') {
            expect(p.lateralOffset).toBe(EDGE);
          } else {
            const clear = (profile.postedKmh ?? 0) > 65 ? CLEAR_ZONE_FAST_M : CLEAR_ZONE_SLOW_M;
            expect(p.lateralOffset).toBeGreaterThanOrEqual(Math.min(half + clear, EDGE) - 1e-9);
          }
          const footway = profile.pieces.find((piece) => piece.kind === 'sidewalk');
          if (hasFootway(profile) && footway) {
            // The walk behind the pole is the footway less the pole's 0.46 m.
            expect(footway.width - (p.lateralOffset - half)).toBeGreaterThanOrEqual(1.2);
          }
        }
      });
    }

    it('keeps a pole behind the parking lane and the bike lane, not among them', () => {
      const parked: RoadProfile = {
        class: 'local',
        pieces: [
          { kind: 'sidewalk', width: 1.875 },
          { kind: 'parking', width: 2.25 },
          { kind: 'bike', width: 1.5, flow: 'back' },
          { kind: 'travel', width: 3.75, flow: 'back' },
          { kind: 'travel', width: 3.75, flow: 'fwd' },
          { kind: 'bike', width: 1.5, flow: 'fwd' },
          { kind: 'parking', width: 2.25 },
          { kind: 'sidewalk', width: 1.875 },
        ],
      };
      const half = carriagewayHalfWidthOf(parked);
      expect(half).toBe(7.5);
      for (const p of light(RoadTier.TwoLane, parked)) {
        expect(p.lateralOffset).toBeCloseTo(half + POLE_BEHIND_KERB_M, 2);
      }
    });
  });

  describe('where there is no kerb', () => {
    const noKerb = (kmh: number, lane = 3.5): RoadProfile => ({
      class: 'rural',
      postedKmh: kmh,
      pieces: [
        { kind: 'travel', width: lane, flow: 'back' },
        { kind: 'travel', width: lane, flow: 'fwd' },
      ],
    });

    it('stands back from the travelled way by 3.0 m on a road posted to 65 km/h', () => {
      const [p] = light(RoadTier.TwoLane, noKerb(60));
      expect(p!.lateralOffset).toBeCloseTo(3.5 + CLEAR_ZONE_SLOW_M, 9);
      const [q] = light(RoadTier.TwoLane, noKerb(65));
      expect(q!.lateralOffset).toBeCloseTo(3.5 + CLEAR_ZONE_SLOW_M, 9);
    });

    it('stands back 4.6 m on a faster road', () => {
      const [p] = light(RoadTier.TwoLane, noKerb(80));
      expect(p!.lateralOffset).toBeCloseTo(3.5 + CLEAR_ZONE_FAST_M, 9);
    });

    it('stands at the tile’s edge where the tile is narrower than the clear zone', () => {
      const [p] = light(RoadTier.TwoLane, noKerb(80, 6));
      expect(p!.lateralOffset).toBe(EDGE);
      expect(lampLateralOffset(undefined, noKerb(80, 6))).toBe(EDGE);
    });

    it('never stands on the travelled way', () => {
      for (const kmh of [30, 60, 65, 66, 90]) {
        const profile = noKerb(kmh);
        for (const p of light(RoadTier.TwoLane, profile)) {
          expect(p.lateralOffset).toBeGreaterThan(carriagewayHalfWidthOf(profile));
        }
      }
    });
  });

  describe('spacing and side by the street’s width', () => {
    it('alternates sides every 3 tiles on a street up to 15 m', () => {
      for (const tier of [RoadTier.TwoLane, RoadTier.FourLane]) {
        const lamps = light(tier, undefined, 18);
        expect(lamps.map((p) => p.x)).toEqual([0, 3, 6, 9, 12, 15, 18]);
        expect(lamps.map((p) => p.side)).toEqual([1, -1, 1, -1, 1, -1, 1]);
      }
      expect(LAMP_SPACING_TILES * TILE_METERS).toBe(60);
    });

    it('stands facing pairs every 4 tiles on a street over 15 m', () => {
      const lamps = light(RoadTier.Avenue, undefined, 16);
      expect(lamps.map((p) => p.x)).toEqual([0, 0, 4, 4, 8, 8, 12, 12, 16, 16]);
      for (let k = 0; k < lamps.length; k += 2) {
        expect(lamps[k]!.side).toBe(1);
        expect(lamps[k + 1]!.side).toBe(-1);
      }
      expect(LAMP_SPACING_WIDE_TILES * TILE_METERS).toBe(80);
    });

    it('sets a pair of a two-tile corridor square across it, one pole per outer kerb', () => {
      const lane = (flow: 'fwd' | 'back') => ({ kind: 'travel' as const, width: 3.6, flow });
      const arterial: RoadProfile = {
        class: 'arterial',
        pieces: [
          { kind: 'sidewalk', width: 1.9 },
          lane('back'),
          lane('back'),
          lane('back'),
          lane('fwd'),
          lane('fwd'),
          lane('fwd'),
          { kind: 'sidewalk', width: 1.9 },
        ],
      };
      const tiles = (['left', 'right'] as const).flatMap((half, i) =>
        strip(4 + i, 0, 16, 'ew').map((t) => ({
          ...t,
          tier: RoadTier.Avenue,
          flow: storedFlow(RoadFlow.East, half),
          profile: corridorHalfProfile(arterial, half),
        })),
      );
      const lamps = computeLampPlacements(tiles);
      const near = lamps.filter((l) => l.z === 4).map((l) => l.x);
      const far = lamps.filter((l) => l.z === 5).map((l) => l.x);
      expect(near).toEqual([0, 4, 8, 12, 16]);
      expect(far).toEqual(near);
      for (const l of lamps) expect(l.height).toBe(LAMP_HEIGHTS_M[2]);
    });

    it('takes the pole height from the carriageway: 6.1 m under 9 m, 9.1 m to 15 m, 12.2 m beyond', () => {
      const height = (tier: RoadTier): number => lampRuleOf(presetProfileForTier(tier)).height;
      expect(height(RoadTier.TwoLane)).toBe(6.1); // 7.5 m
      expect(height(RoadTier.Alley)).toBe(6.1);
      expect(height(RoadTier.FourLane)).toBe(9.1); // 15 m exactly
      expect(height(RoadTier.Avenue)).toBe(12.2); // 16.2 m
      expect(height(RoadTier.Highway)).toBe(12.2);
      const wide = (n: number): RoadProfile => ({
        class: 'local',
        pieces: [
          { kind: 'sidewalk', width: 1.875 },
          { kind: 'travel', width: n / 2, flow: 'back' },
          { kind: 'travel', width: n / 2, flow: 'fwd' },
          { kind: 'sidewalk', width: 1.875 },
        ],
      });
      expect(lampRuleOf(wide(8.9)).height).toBe(6.1);
      expect(lampRuleOf(wide(9)).height).toBe(9.1);
      expect(lampRuleOf(wide(15.1)).height).toBe(12.2);
      expect(light(RoadTier.TwoLane).every((p) => p.height === 6.1)).toBe(true);
      expect(light(RoadTier.FourLane).every((p) => p.height === 9.1)).toBe(true);
      expect(light(RoadTier.Avenue).every((p) => p.height === 12.2)).toBe(true);
    });

    it('stands each height on its own pole in one mesh, with its lantern over the outer lane', () => {
      for (const [tier, height] of [
        [RoadTier.TwoLane, 6.1],
        [RoadTier.FourLane, 9.1],
        [RoadTier.Avenue, 12.2],
      ] as const) {
        const scene = new THREE.Scene();
        const renderer = new LampRenderer(scene, flatHeightAt);
        renderer.rebuild(road(tier, undefined, 4));
        expect(scene.children.filter((c) => c instanceof THREE.InstancedMesh)).toHaveLength(4);
        const pole = renderer.polePosition(0);
        // Instance matrices are float32.
        expect(pole.y).toBeCloseTo(height / 2, 4);
        expect(renderer.armPosition(0).y).toBeCloseTo(height - 0.05, 4);
        // The lantern hangs inside the kerb, over the outermost lane.
        const half = carriagewayHalfWidthOf(presetProfileForTier(tier));
        const centreZ = (4 + 0.5) * TILE_METERS;
        const lanternOut = Math.abs(renderer.housingPosition(0).z - centreZ);
        expect(lanternOut).toBeLessThan(half);
        expect(lanternOut).toBeGreaterThan(half - 3.75);
        expect(Math.abs(pole.z - centreZ) - lanternOut).toBeCloseTo(armLengthOf(height), 4);
        // Every instance is a positive scale: none is mirrored.
        const matrix = new THREE.Matrix4();
        for (const mesh of scene.children.filter((c) => c instanceof THREE.InstancedMesh)) {
          (mesh as THREE.InstancedMesh).getMatrixAt(0, matrix);
          expect(matrix.determinant()).toBeGreaterThan(0);
        }
      }
    });

    it('follows the lantern with its pool: a taller lantern lights more road', () => {
      const reach = (tier: RoadTier): number => {
        const renderer = new LampRenderer(new THREE.Scene(), flatHeightAt);
        renderer.rebuild(road(tier, undefined, 4));
        const centre = renderer.poolCenter(0);
        expect(centre.x).toBeCloseTo(renderer.housingPosition(0).x, 9);
        expect(centre.z).toBeCloseTo(renderer.housingPosition(0).z, 9);
        let along = 0;
        for (let v = 0; v < POOL_VERTICES_PER_LAMP; v++) {
          along = Math.max(along, Math.abs(renderer.poolVertexX(v) - centre.x));
        }
        return along;
      };
      expect(reach(RoadTier.Avenue)).toBeGreaterThan(reach(RoadTier.TwoLane));
    });

    it('lights no street the grid has not reached, whatever its width', () => {
      const dark = road(RoadTier.Avenue).map((t) => ({ ...t, powered: false }));
      expect(computeLampPlacements(dark)).toEqual([]);
    });
  });

  describe('a motorway and a ramp', () => {
    const motorway = (centre: RoadProfile['pieces'][number] | null): RoadProfile => ({
      class: 'highway',
      kerbs: false,
      pieces: [
        { kind: 'shoulder', width: 1.2 },
        { kind: 'travel', width: 3.5, flow: 'back' },
        { kind: 'travel', width: 3.5, flow: 'back' },
        ...(centre ? [centre] : []),
        { kind: 'travel', width: 3.5, flow: 'fwd' },
        { kind: 'travel', width: 3.5, flow: 'fwd' },
        { kind: 'shoulder', width: 1.2 },
      ],
    });

    it('stands a twin-armed pole on its median every 4 tiles', () => {
      const profile = motorway({ kind: 'median', width: 3 });
      const lamps = light(RoadTier.Highway, profile, 12);
      expect(lamps.map((p) => p.x)).toEqual([0, 4, 8, 12]);
      for (const p of lamps) {
        expect(p.twin).toBe(true);
        expect(p.lateralOffset).toBeCloseTo(0, 9);
        const [a, b] = standsOf(p);
        expect(a!.z).toBeCloseTo((4 + 0.5) * TILE_METERS, 9);
        expect(b!.z).toBeCloseTo(a!.z, 9);
        expect(b!.reachZ).toBe(-a!.reachZ);
        expect(a!.height).toBe(12.2);
      }
      const renderer = new LampRenderer(new THREE.Scene(), flatHeightAt);
      renderer.rebuild(road(RoadTier.Highway, profile, 12));
      expect(renderer.lampCount()).toBe(8); // two arms to a pole
      const zs = new Set([0, 1, 2, 3].map((slot) => renderer.housingPosition(slot).z.toFixed(3)));
      expect(zs.size).toBe(2); // one lantern to each carriageway
    });

    it('stands a twin on a central barrier too', () => {
      const lamps = light(RoadTier.Highway, motorway({ kind: 'barrier', width: 0.6 }), 8);
      expect(lamps.length).toBeGreaterThan(0);
      expect(lamps.every((p) => p.twin === true)).toBe(true);
    });

    it('stands facing poles at the tile’s edge where the profile has no median', () => {
      const lamps = light(RoadTier.Highway, motorway(null), 8);
      expect(lamps.map((p) => p.x)).toEqual([0, 0, 4, 4, 8, 8]);
      for (const p of lamps) {
        expect(p.twin).toBeUndefined();
        expect(p.lateralOffset).toBe(EDGE);
      }
    });

    it('stands a ramp’s pole at the tile’s edge on its outside, every 3 tiles', () => {
      const lamps = light(RoadTier.Ramp, undefined, 9);
      expect(lamps.map((p) => p.x)).toEqual([0, 3, 6, 9]);
      for (const p of lamps) {
        expect(p.lateralOffset).toBe(EDGE);
        expect(p.side).toBe(1); // the side of its wider, 2.4 m shoulder
        expect(p.height).toBe(6.1);
      }
    });
  });

  describe('keeps clear of a bus stop', () => {
    const sites = (tile: number, side: 0 | 1): LampStopSite[] => [{ x: tile, z: 4, side }];
    const withStops = (tiles: LampRoadTile[], stops: LampStopSite[]) =>
      computeLampPlacements(tiles, undefined, [], stops);

    it('moves a lamp out of the stop’s span, along its own tile’s strip', () => {
      const tiles = road(RoadTier.TwoLane, undefined, 12);
      const lamp = computeLampPlacements(tiles).find((p) => p.x === 6)!;
      const found = withStops(tiles, sites(6, lamp.side === -1 ? 0 : 1)).find((p) => p.x === 6)!;
      expect(found).toBeDefined();
      expect(found.side).toBe(lamp.side);
      expect(found.lateralOffset).toBe(lamp.lateralOffset);
      expect(Math.abs(found.along!)).toBeGreaterThanOrEqual(STOP_CLEAR_HALF_M);
      expect(Math.abs(found.along!)).toBeLessThanOrEqual(TILE_METERS / 2 - 3);
      // The nearest free place: half a metre closer is inside the span.
      expect(Math.abs(found.along!) - 0.5).toBeLessThan(STOP_CLEAR_HALF_M);
    });

    it('stands no lamp inside a sign’s or a shelter’s span, on either side', () => {
      const tiles = road(RoadTier.TwoLane, undefined, 12);
      for (const kind of ['sign', 'shelter'] as const) {
        for (const side of [0, 1] as const) {
          for (const tile of [0, 3, 6, 9]) {
            const stop = { x: tile, z: 4, side, kind };
            const placed = busStopPlacement(stop, RoadTier.TwoLane, undefined, 0, 'z');
            const lamps = withStops(tiles, [stop]);
            const mine = lamps.filter((p) => p.x === tile && p.side === (side === 0 ? -1 : 1));
            for (const p of mine) {
              const { x } = standOf(p);
              // Clear of the pad, the shelter's footprint and the boarding area before the door.
              expect(Math.abs(x - placed.pad.x)).toBeGreaterThanOrEqual(BUS_STOP_PAD.along / 2);
              if (placed.shelter) {
                expect(Math.abs(x - placed.shelter.x)).toBeGreaterThanOrEqual(
                  BUS_STOP_PAD.along / 2,
                );
              }
              expect(Math.abs(x - placed.pad.x)).toBeGreaterThanOrEqual(STOP_CLEAR_HALF_M);
            }
          }
        }
      }
    });

    it('leaves the other kerb’s lamp, and every other tile’s, where it was', () => {
      const tiles = road(RoadTier.Avenue, undefined, 16);
      const all = computeLampPlacements(tiles);
      const stopped = withStops(tiles, sites(8, 0));
      // A pair at x = 8: the high kerb's pole stays, the low kerb's moves.
      const at8 = (list: typeof all) => list.filter((p) => p.x === 8);
      expect(at8(stopped).find((p) => p.side === 1)).toEqual(at8(all).find((p) => p.side === 1));
      expect(at8(stopped).find((p) => p.side === -1)!.along).toBeDefined();
      expect(stopped.filter((p) => p.x !== 8)).toEqual(all.filter((p) => p.x !== 8));
    });

    it('re-lays only the tiles a moved stop touches', () => {
      const tiles = road(RoadTier.TwoLane, undefined, 30);
      const none = computeLampPlacements(tiles);
      const differs = (a: typeof none, b: typeof none): number[] =>
        a.filter((p, i) => JSON.stringify(p) !== JSON.stringify(b[i])).map((p) => p.x);
      const first = withStops(tiles, sites(9, 0));
      expect(first.length).toBe(none.length);
      expect(differs(first, none).every((x) => x === 9)).toBe(true);
      // Moving the stop to another tile changes that tile's lamp and the old one's, no more.
      const moved = withStops(tiles, sites(15, 0));
      const touched = new Set([...differs(first, moved), ...differs(moved, first)]);
      expect([...touched].every((x) => x === 9 || x === 15)).toBe(true);
    });

    it('keeps a moved lamp 3 m from a crosswalk in the junction beside its tile', () => {
      // A crossroads at (4,4) with a stop on the lamp tile (3,4) beside it.
      const tiles = [...strip(4, 0, 8, 'ew'), ...strip(4, 0, 8, 'ns')].map((t) => ({
        ...t,
        tier: RoadTier.TwoLane,
      }));
      for (const side of [0, 1] as const) {
        const here = withStops(tiles, sites(3, side)).find((p) => p.x === 3 && p.z === 4);
        expect(here).toBeDefined();
        const junctionEdge = 4 * TILE_METERS; // the junction tile's west edge, where its crosswalk ends
        expect(junctionEdge - standOf(here!).x).toBeGreaterThanOrEqual(3);
      }
    });

    it('stands no lamp on a tile a driveway crosses', () => {
      const tiles = road(RoadTier.TwoLane, undefined, 12);
      const drive = new Set([3 * 100_000 + 4]);
      expect(computeLampPlacements(tiles, drive).some((p) => p.x === 3)).toBe(false);
    });

    it('is deterministic with stops', () => {
      const tiles = road(RoadTier.TwoLane, undefined, 12);
      expect(withStops(tiles, sites(6, 1))).toEqual(withStops(tiles, sites(6, 1)));
    });
  });
});
