import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  computeBoxPlacements,
  computeManholePlacements,
  computeMeterPlacements,
  computeSignPlacements,
  FurnitureRoadTile,
  RoadFurnitureRenderer,
} from './roadfurniture';
import { RoadTier } from '../shared/types';
import { carriagewayHalfWidthMeters, SIDEWALK_WIDTH_M } from './roadsmesh';

const flatHeightAt = (): number => 0;

/** Builds a straight run of same-tier tiles, horizontal (fixed z) or vertical (fixed x). */
function strip(
  fixed: number,
  from: number,
  to: number,
  orientation: 'ew' | 'ns',
  tier?: RoadTier,
): FurnitureRoadTile[] {
  const tiles: FurnitureRoadTile[] = [];
  for (let v = from; v <= to; v++) {
    const base = orientation === 'ew' ? { x: v, z: fixed } : { x: fixed, z: v };
    tiles.push(tier === undefined ? base : { ...base, tier });
  }
  return tiles;
}

/** A few parallel two-lane streets — enough tiles that every prop layer fires. */
function representativeGrid(): FurnitureRoadTile[] {
  const tiles: FurnitureRoadTile[] = [];
  for (const z of [0, 4, 8]) tiles.push(...strip(z, 0, 19, 'ew', RoadTier.TwoLane));
  return tiles;
}

const PAVED_TIERS = [
  RoadTier.TwoLane,
  RoadTier.Avenue,
  RoadTier.Highway,
  RoadTier.Alley,
  RoadTier.OneWay,
  RoadTier.FourLane,
];

describe('road-furniture placement (pure)', () => {
  it('is deterministic: repeated calls on the same tiles give identical placements', () => {
    const tiles = strip(0, 0, 20, 'ew', RoadTier.TwoLane);
    expect(computeManholePlacements(tiles)).toEqual(computeManholePlacements(tiles));
    expect(computeBoxPlacements(tiles)).toEqual(computeBoxPlacements(tiles));
    expect(computeMeterPlacements(tiles)).toEqual(computeMeterPlacements(tiles));
    expect(computeSignPlacements(tiles)).toEqual(computeSignPlacements(tiles));
  });

  it('is order-independent for manholes: shuffled input yields the same placement set', () => {
    const ordered = strip(0, 0, 20, 'ew', RoadTier.TwoLane);
    const shuffled = [...ordered].reverse();
    const key = (p: { x: number; z: number }): string => `${p.x},${p.z}`;
    const a = new Set(computeManholePlacements(ordered).map(key));
    const b = new Set(computeManholePlacements(shuffled).map(key));
    expect(a).toEqual(b);
  });

  it('places no manholes on gravel', () => {
    expect(computeManholePlacements(strip(0, 0, 20, 'ew', RoadTier.Gravel))).toEqual([]);
  });

  it('places no meters on Avenue, Highway, Gravel, or Alley (only curb-parking tiers)', () => {
    for (const tier of [RoadTier.Avenue, RoadTier.Highway, RoadTier.Gravel, RoadTier.Alley]) {
      expect(computeMeterPlacements(strip(0, 0, 20, 'ew', tier))).toEqual([]);
    }
  });

  it('places no boxes on gravel or alley (no curb)', () => {
    for (const tier of [RoadTier.Gravel, RoadTier.Alley]) {
      expect(computeBoxPlacements(strip(0, 0, 20, 'ew', tier))).toEqual([]);
    }
  });

  it('places no signs on gravel or alley (no curb)', () => {
    for (const tier of [RoadTier.Gravel, RoadTier.Alley]) {
      expect(computeSignPlacements(strip(0, 0, 20, 'ew', tier))).toEqual([]);
    }
  });

  it('keeps every manhole inside the carriageway and off the centerline, for each paved tier', () => {
    for (const tier of PAVED_TIERS) {
      const manholes = computeManholePlacements(strip(0, 0, 40, 'ew', tier));
      expect(manholes.length).toBeGreaterThan(0);
      const half = carriagewayHalfWidthMeters(tier);
      for (const m of manholes) {
        const mag = Math.abs(m.lateral);
        expect(mag).toBeGreaterThanOrEqual(0.6);
        expect(mag).toBeLessThanOrEqual(half - 0.5);
        expect(mag).toBeLessThan(half);
      }
    }
  });

  it('selects the expected periodic tiles for meter pairs along a straight run', () => {
    const meters = computeMeterPlacements(strip(0, 0, 20, 'ew', RoadTier.TwoLane)); // z=0
    const xs = [...new Set(meters.map((m) => m.x))].sort((a, b) => a - b);
    expect(xs).toEqual([0, 5, 10, 15, 20]); // (x+0) % 5 === 0
    expect(meters.length).toBe(xs.length * 2); // two meters per selected tile
  });

  it('offsets the two meters of a pair to opposite sides of the tile center along the run', () => {
    const meters = computeMeterPlacements(strip(0, 0, 5, 'ew', RoadTier.TwoLane));
    const alongs = meters.filter((m) => m.x === 5).map((m) => m.along);
    expect(alongs).toEqual([3, -3]);
  });

  it("marks a dead-end tile (exactly one road neighbor) 'nothrough' and nothing else", () => {
    // (5,5)-(6,5)-(7,5): the two endpoints are dead ends, the middle is a plain run.
    const signs = computeSignPlacements(strip(5, 5, 7, 'ew', RoadTier.TwoLane));
    expect(signs.every((s) => s.type === 'nothrough')).toBe(true);
    expect(signs.filter((s) => s.x === 5).length).toBe(1); // exactly one on the dead end
    expect(signs.filter((s) => s.x === 7).length).toBe(1);
    expect(signs.some((s) => s.x === 6)).toBe(false); // middle run earns nothing
  });

  it("gives a 4-way crossroads its straight approaches a 'stop' sign", () => {
    const t = RoadTier.TwoLane;
    // A plus with arms of length two: the distance-1 tiles are the approaches.
    const tiles: FurnitureRoadTile[] = [
      { x: 0, z: 0, tier: t },
      { x: 1, z: 0, tier: t },
      { x: 2, z: 0, tier: t },
      { x: -1, z: 0, tier: t },
      { x: -2, z: 0, tier: t },
      { x: 0, z: 1, tier: t },
      { x: 0, z: 2, tier: t },
      { x: 0, z: -1, tier: t },
      { x: 0, z: -2, tier: t },
    ];
    const signs = computeSignPlacements(tiles);
    const at = (x: number, z: number): string | undefined =>
      signs.find((s) => s.x === x && s.z === z)?.type;
    for (const [x, z] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const)
      expect(at(x, z)).toBe('stop');
    expect(signs.some((s) => s.x === 0 && s.z === 0)).toBe(false); // the junction itself: no sign
  });

  it("gives a T-junction its approaches a 'giveway' sign", () => {
    const t = RoadTier.TwoLane;
    // An east-west bar with a stem dropping south from its center.
    const tiles: FurnitureRoadTile[] = [
      { x: -2, z: 0, tier: t },
      { x: -1, z: 0, tier: t },
      { x: 0, z: 0, tier: t },
      { x: 1, z: 0, tier: t },
      { x: 2, z: 0, tier: t },
      { x: 0, z: 1, tier: t },
      { x: 0, z: 2, tier: t },
    ];
    const signs = computeSignPlacements(tiles);
    const at = (x: number, z: number): string | undefined =>
      signs.find((s) => s.x === x && s.z === z)?.type;
    for (const [x, z] of [
      [1, 0],
      [-1, 0],
      [0, 1],
    ] as const)
      expect(at(x, z)).toBe('giveway');
    expect(signs.some((s) => s.x === 0 && s.z === 0)).toBe(false); // the junction itself: no sign
  });

  it("marks a turn (L) tile 'bend'", () => {
    const t = RoadTier.TwoLane;
    // (0,0)-(1,0)-(2,0) then up to (2,-1)-(2,-2); (2,0) is the corner.
    const tiles: FurnitureRoadTile[] = [
      { x: 0, z: 0, tier: t },
      { x: 1, z: 0, tier: t },
      { x: 2, z: 0, tier: t },
      { x: 2, z: -1, tier: t },
      { x: 2, z: -2, tier: t },
    ];
    const signs = computeSignPlacements(tiles);
    expect(signs.find((s) => s.x === 2 && s.z === 0)?.type).toBe('bend');
  });

  it('positions the bend sign at the curve OUTER corner, just past the sidewalk, facing the curve', () => {
    const t = RoadTier.TwoLane;
    // Corner (2,0) connects W (1,0) and N (2,-1): the curve hugs the NW tile
    // corner, so the sign stands on the opposite (SE) diagonal.
    const tiles: FurnitureRoadTile[] = [
      { x: 0, z: 0, tier: t },
      { x: 1, z: 0, tier: t },
      { x: 2, z: 0, tier: t },
      { x: 2, z: -1, tier: t },
      { x: 2, z: -2, tier: t },
    ];
    const sign = computeSignPlacements(tiles).find((s) => s.x === 2 && s.z === 0)!;
    expect(sign.type).toBe('bend');
    // radius = tileHalf + carriagewayHalf + sidewalk + margin, along the
    // (+1,+1)/sqrt(2) diagonal from the NW corner (-8,-8).
    const radius = 8 + carriagewayHalfWidthMeters(t) + SIDEWALK_WIDTH_M + 0.5;
    const expected = -8 + radius * Math.SQRT1_2;
    expect(sign.worldOffsetX).toBeCloseTo(expected, 5);
    expect(sign.worldOffsetZ).toBeCloseTo(expected, 5);
    // Faces back toward the corner (the oncoming curve traffic).
    expect(sign.yaw).toBeCloseTo(Math.atan2(-Math.SQRT1_2, -Math.SQRT1_2), 5);
    // Stays inside its own tile (never strands deep in a neighbor's grass).
    expect(Math.abs(sign.worldOffsetX!)).toBeLessThan(8);
    expect(Math.abs(sign.worldOffsetZ!)).toBeLessThan(8);
  });

  it('keeps manholes, boxes and meters OFF turn tiles (the curve owns the tile)', () => {
    // A staircase where every interior tile is a non-collinear 2-neighbor
    // turn — plenty of tiles so each prop layer's hash/period rules would
    // otherwise fire on several of them.
    const t = RoadTier.TwoLane;
    const tiles: FurnitureRoadTile[] = [];
    let x = 0;
    let z = 0;
    tiles.push({ x, z, tier: t });
    for (let k = 0; k < 24; k++) {
      if (k % 2 === 0) x += 1;
      else z += 1;
      tiles.push({ x, z, tier: t });
    }
    const turnTiles = new Set<string>();
    const byKey = new Set(tiles.map((p) => `${p.x},${p.z}`));
    for (const p of tiles) {
      const n = byKey.has(`${p.x},${p.z - 1}`);
      const e = byKey.has(`${p.x + 1},${p.z}`);
      const s = byKey.has(`${p.x},${p.z + 1}`);
      const w = byKey.has(`${p.x - 1},${p.z}`);
      const count = (n ? 1 : 0) + (e ? 1 : 0) + (s ? 1 : 0) + (w ? 1 : 0);
      const collinear = (n && s && !e && !w) || (e && w && !n && !s);
      if (count === 2 && !collinear) turnTiles.add(`${p.x},${p.z}`);
    }
    expect(turnTiles.size).toBeGreaterThan(10); // the staircase really is all turns

    for (const m of computeManholePlacements(tiles)) {
      expect(turnTiles.has(`${m.x},${m.z}`)).toBe(false);
    }
    for (const b of computeBoxPlacements(tiles)) {
      expect(turnTiles.has(`${b.x},${b.z}`)).toBe(false);
    }
    for (const m of computeMeterPlacements(tiles)) {
      expect(turnTiles.has(`${m.x},${m.z}`)).toBe(false);
    }
  });

  it("marks the periodic tiles of a One-Way straight run 'oneway'", () => {
    const signs = computeSignPlacements(strip(0, 0, 18, 'ew', RoadTier.OneWay)); // z=0
    const oneways = signs.filter((s) => s.type === 'oneway').map((s) => s.x);
    expect([...oneways].sort((a, b) => a - b)).toEqual([6, 12]); // (x+0) % 6 === 0, interior only
  });

  it("marks the periodic tiles of a Highway straight run 'speed'", () => {
    const signs = computeSignPlacements(strip(0, 0, 30, 'ew', RoadTier.Highway)); // z=0
    const speeds = signs.filter((s) => s.type === 'speed').map((s) => s.x);
    expect([...speeds].sort((a, b) => a - b)).toEqual([10, 20]); // (x+0) % 10 === 0, interior only
  });

  it('produces no placements for an empty road tile list', () => {
    expect(computeManholePlacements([])).toEqual([]);
    expect(computeBoxPlacements([])).toEqual([]);
    expect(computeMeterPlacements([])).toEqual([]);
    expect(computeSignPlacements([])).toEqual([]);
  });
});

describe('RoadFurnitureRenderer', () => {
  it('produces non-zero counts across all four layers on a representative grid', () => {
    const scene = new THREE.Scene();
    const renderer = new RoadFurnitureRenderer(scene, flatHeightAt);
    renderer.rebuild(representativeGrid());

    const counts = renderer.furnitureCounts();
    expect(counts.manholes).toBeGreaterThan(0);
    expect(counts.boxes).toBeGreaterThan(0);
    expect(counts.meters).toBeGreaterThan(0);
    expect(counts.signs).toBeGreaterThan(0);
  });

  it('adds one InstancedMesh per non-empty layer, sized to that layer count', () => {
    const scene = new THREE.Scene();
    const renderer = new RoadFurnitureRenderer(scene, flatHeightAt);
    renderer.rebuild(representativeGrid());

    const meshes = scene.children.filter(
      (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh,
    );
    expect(meshes.length).toBe(4); // manhole, box, meter, sign

    const counts = renderer.furnitureCounts();
    const total = counts.manholes + counts.boxes + counts.meters + counts.signs;
    expect(meshes.reduce((sum, m) => sum + m.count, 0)).toBe(total);
  });

  it('manholes receive but do not cast shadows; boxes cast shadows', () => {
    const scene = new THREE.Scene();
    const renderer = new RoadFurnitureRenderer(scene, flatHeightAt);
    renderer.rebuild(representativeGrid());

    const meshes = scene.children.filter(
      (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh,
    );
    const manhole = meshes.find((m) => m.userData.furnitureKind === 'manhole')!;
    expect(manhole.castShadow).toBe(false);
    expect(manhole.receiveShadow).toBe(true);

    const box = meshes.find((m) => m.userData.furnitureKind === 'box')!;
    expect(box.castShadow).toBe(true);
  });

  it('tags each sign layer by furnitureKind and its signType, casting shadows', () => {
    const scene = new THREE.Scene();
    const renderer = new RoadFurnitureRenderer(scene, flatHeightAt);
    renderer.rebuild(representativeGrid());

    const meshes = scene.children.filter(
      (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh,
    );
    const signMeshes = meshes.filter((m) => m.userData.furnitureKind === 'sign');
    expect(signMeshes.length).toBeGreaterThan(0);
    for (const mesh of signMeshes) {
      expect(mesh.castShadow).toBe(true);
      expect(typeof mesh.userData.signType).toBe('string');
    }
  });

  it('a second rebuild disposes the previous meshes instead of accumulating them', () => {
    const scene = new THREE.Scene();
    const renderer = new RoadFurnitureRenderer(scene, flatHeightAt);
    renderer.rebuild(representativeGrid());
    const first = scene.children.filter((c) => c instanceof THREE.InstancedMesh);

    renderer.rebuild(representativeGrid());
    const second = scene.children.filter((c) => c instanceof THREE.InstancedMesh);
    expect(second.length).toBe(4);
    for (const mesh of first) expect(scene.children).not.toContain(mesh);
  });

  it('rebuild() with no road tiles clears every layer back to zero', () => {
    const scene = new THREE.Scene();
    const renderer = new RoadFurnitureRenderer(scene, flatHeightAt);
    renderer.rebuild(representativeGrid());

    renderer.rebuild([]);
    const counts = renderer.furnitureCounts();
    expect(counts.manholes).toBe(0);
    expect(counts.boxes).toBe(0);
    expect(counts.meters).toBe(0);
    expect(counts.signs).toBe(0);
    expect(scene.children.filter((c) => c instanceof THREE.InstancedMesh).length).toBe(0);
  });

  it('dispose() removes every layer from the scene', () => {
    const scene = new THREE.Scene();
    const renderer = new RoadFurnitureRenderer(scene, flatHeightAt);
    renderer.rebuild(representativeGrid());

    renderer.dispose();
    expect(scene.children.filter((c) => c instanceof THREE.InstancedMesh).length).toBe(0);
  });
});
