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
import { carriagewayHalfWidthMeters } from './roadsmesh';

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

  it('gives a dead-end tile (exactly one road neighbor) a sign', () => {
    // (5,5)-(6,5)-(7,5): the two endpoints are dead ends, the middle is not.
    const signs = computeSignPlacements(strip(5, 5, 7, 'ew', RoadTier.TwoLane));
    const dead = new Set(signs.filter((s) => s.deadEnd).map((s) => `${s.x},${s.z}`));
    expect(dead.has('5,5')).toBe(true);
    expect(dead.has('7,5')).toBe(true);
    expect(signs.some((s) => s.x === 6)).toBe(false); // middle: two neighbors, not periodic
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
    const manhole = meshes.find((m) => m.geometry.type === 'CylinderGeometry')!;
    expect(manhole.castShadow).toBe(false);
    expect(manhole.receiveShadow).toBe(true);

    const box = meshes.find((m) => m.geometry.type === 'BoxGeometry')!;
    expect(box.castShadow).toBe(true);
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
