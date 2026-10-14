import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CEMETERY_LAWN_HEIGHT,
  CREMATORIUM_FLUE_HEIGHT_M,
  CREMATORIUM_HALL_HEIGHT_M,
  CREMATORIUM_RIDGE_M,
  CREMATORIUM_ROOF_CAP_M,
  CREMATORIUM_ROOMS,
  UtilityKitRenderer,
  computeCrematoriumLayout,
  footprintHalfExtents,
  rotateLocalXZ,
  type Rect,
  type UtilityKitPartKind,
} from './utilitykits';
import catalogData from '../data/catalog.json';
import {
  BuildingCatalogEntry,
  BuildingDelta,
  BuildingInstance,
  BuildingState,
} from '../shared/types';
import { TILE_METERS } from '../shared/constants';

const CREMATORIUM = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings.find(
  (e) => e.id === 'crematorium',
)!;
const flat = (): number => 0;
const FOOT_M = 0.3048;

function instance(id: number, overrides: Partial<BuildingInstance> = {}): BuildingInstance {
  return {
    id,
    catalogId: 'crematorium',
    x: 10,
    z: 10,
    rotation: 0,
    level: 1,
    state: BuildingState.Active,
    problems: 0,
    ...overrides,
  };
}
const add = (...buildings: BuildingInstance[]): BuildingDelta => ({
  added: buildings,
  removed: [],
  updated: [],
});

const area = (r: Rect): number => (r.x1 - r.x0) * (r.z1 - r.z0);
const overlaps = (a: Rect, b: Rect): boolean =>
  a.x0 < b.x1 - 1e-9 && b.x0 < a.x1 - 1e-9 && a.z0 < b.z1 - 1e-9 && b.z0 < a.z1 - 1e-9;

const kinds: UtilityKitPartKind[] = [
  'crematoriumGrounds',
  'crematoriumBuilding',
  'crematoriumFlue',
];

describe('the crematorium layout', () => {
  const layout = computeCrematoriumLayout(CREMATORIUM.footprint);
  const { halfW, halfD } = footprintHalfExtents(CREMATORIUM.footprint);

  it('has the chapel, office, foyer and cremator hall at their floor areas, 626 m² in all', () => {
    expect(area(layout.chapel)).toBeCloseTo(215, 0);
    expect(area(layout.office)).toBeCloseTo(111, 0);
    expect(area(layout.foyer)).toBeCloseTo(60, 0);
    expect(area(layout.hall)).toBeCloseTo(240, 0);
    const rooms = [layout.chapel, layout.office, layout.foyer, layout.hall];
    expect(rooms.reduce((sum, r) => sum + area(r), 0)).toBeCloseTo(626, 0);
    expect(Object.keys(CREMATORIUM_ROOMS)).toHaveLength(4);
  });

  it('keeps the rooms inside the lot and clear of each other, the forecourt on the street side', () => {
    const rooms = [layout.chapel, layout.office, layout.foyer, layout.hall];
    for (const r of [...rooms, layout.forecourt]) {
      expect(r.x0).toBeGreaterThanOrEqual(-halfW);
      expect(r.x1).toBeLessThanOrEqual(halfW);
      expect(r.z0).toBeGreaterThanOrEqual(-halfD);
      expect(r.z1).toBeLessThanOrEqual(halfD);
    }
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        expect(overlaps(rooms[i]!, rooms[j]!)).toBe(false);
      }
      expect(overlaps(rooms[i]!, layout.forecourt)).toBe(false);
    }
    expect(layout.forecourt.z1).toBe(halfD);
  });

  it('stands the one flue on the cremator hall, inside its street-side roof edge', () => {
    expect(layout.flue.x).toBeGreaterThan(layout.hall.x0);
    expect(layout.flue.x).toBeLessThan(layout.hall.x1);
    expect(layout.flue.z).toBeGreaterThan(layout.hall.z0);
    expect(layout.flue.z).toBeLessThan(layout.hall.z1);
    expect(layout.flue.z).toBeGreaterThan((layout.hall.z0 + layout.hall.z1) / 2);
  });

  it('is deterministic', () => {
    expect(computeCrematoriumLayout(CREMATORIUM.footprint)).toEqual(layout);
  });
});

describe('the crematorium kit', () => {
  it('is claimed by the kit renderer so the instancer draws only a plinth under it', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [CREMATORIUM]);
    expect(renderer.kitIds().has('crematorium')).toBe(true);
  });

  it('keeps every part inside the 2 × 2 footprint at all four rotations', () => {
    for (const rotation of [0, 1, 2, 3] as const) {
      const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [CREMATORIUM]);
      renderer.apply(add(instance(5, { rotation })));
      const lot = new THREE.Box3(
        new THREE.Vector3(10 * TILE_METERS, -20, 10 * TILE_METERS),
        new THREE.Vector3(12 * TILE_METERS, 20, 12 * TILE_METERS),
      );
      const m = new THREE.Matrix4();
      for (const kind of kinds) {
        const geometry = renderer.partGeometry('crematorium', kind)!;
        geometry.computeBoundingBox();
        const slots = renderer.partSlotsFor(5, kind);
        expect(slots).toHaveLength(1);
        for (const slot of slots) {
          renderer.getPartMatrix('crematorium', kind, slot, m);
          const box = geometry.boundingBox!.clone().applyMatrix4(m);
          expect(lot.containsBox(box.expandByScalar(-1e-6))).toBe(true);
        }
      }
    }
  });

  it('draws the flue 7.6 m above grade, inside the 18 to 25 ft of US crematory air permits and over 3 ft above the hall roof', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [CREMATORIUM]);
    const flue = renderer.partGeometry('crematorium', 'crematoriumFlue')!;
    flue.computeBoundingBox();
    expect(CREMATORIUM_FLUE_HEIGHT_M).toBe(7.6);
    expect(flue.boundingBox!.max.y - CEMETERY_LAWN_HEIGHT).toBeCloseTo(7.6, 5);
    expect(flue.boundingBox!.min.y).toBeCloseTo(CEMETERY_LAWN_HEIGHT, 5);
    expect(CREMATORIUM_FLUE_HEIGHT_M / FOOT_M).toBeGreaterThanOrEqual(18);
    expect(CREMATORIUM_FLUE_HEIGHT_M / FOOT_M).toBeLessThanOrEqual(25);
    const roof = CREMATORIUM_HALL_HEIGHT_M + CREMATORIUM_ROOF_CAP_M;
    expect(CREMATORIUM_FLUE_HEIGHT_M - roof).toBeGreaterThanOrEqual(3 * FOOT_M);
    // The hall is 4.5 m under its cap, so the stack stands 3.1 m over the roof deck and 2.8 m over the cap.
    expect(CREMATORIUM_HALL_HEIGHT_M).toBe(4.5);
    expect(CREMATORIUM_FLUE_HEIGHT_M - CREMATORIUM_HALL_HEIGHT_M).toBeCloseTo(3.1, 9);
    // An 8-sided stack about 0.9 m across at its mouth (the rim is a little wider).
    const size = flue.boundingBox!.getSize(new THREE.Vector3());
    expect(size.x).toBeGreaterThan(0.85);
    expect(size.x).toBeLessThan(1.3);
  });

  it('draws the building to the catalog height, one tall storey, on the lawn plate', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [CREMATORIUM]);
    const building = renderer.partGeometry('crematorium', 'crematoriumBuilding')!;
    building.computeBoundingBox();
    expect(CREMATORIUM.height).toBe(6.4);
    expect(CREMATORIUM_RIDGE_M).toBe(CREMATORIUM.height);
    expect(building.boundingBox!.max.y).toBeCloseTo(CEMETERY_LAWN_HEIGHT + CREMATORIUM.height, 5);
    expect(building.boundingBox!.min.y).toBeCloseTo(CEMETERY_LAWN_HEIGHT, 5);
  });

  it('turns the flue with the lot, to where its rotated place is', () => {
    const layout = computeCrematoriumLayout(CREMATORIUM.footprint);
    for (const rotation of [0, 1, 2, 3] as const) {
      const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [CREMATORIUM]);
      renderer.apply(add(instance(7, { rotation })));
      const m = new THREE.Matrix4();
      renderer.getPartMatrix(
        'crematorium',
        'crematoriumFlue',
        renderer.partSlotsFor(7, 'crematoriumFlue')[0]!,
        m,
      );
      const at = new THREE.Vector3().setFromMatrixPosition(m);
      const rotated = rotateLocalXZ(layout.flue.x, layout.flue.z, rotation);
      expect(at.x).toBeCloseTo(11 * TILE_METERS + rotated.x, 5);
      expect(at.z).toBeCloseTo(11 * TILE_METERS + rotated.z, 5);
    }
  });

  it('stands on the highest ground under its lot, so a slope never shows through', () => {
    const slope = (x: number, z: number): number => 0.04 * x + 0.02 * z;
    const renderer = new UtilityKitRenderer(new THREE.Scene(), slope, [CREMATORIUM]);
    renderer.apply(add(instance(2, { x: 3, z: 4 })));
    const m = new THREE.Matrix4();
    renderer.getPartMatrix(
      'crematorium',
      'crematoriumBuilding',
      renderer.partSlotsFor(2, 'crematoriumBuilding')[0]!,
      m,
    );
    expect(new THREE.Vector3().setFromMatrixPosition(m).y).toBeCloseTo(
      slope(5 * TILE_METERS, 6 * TILE_METERS),
      5,
    );
  });

  it('draws as three InstancedMeshes for every crematorium, and frees a removed one', () => {
    const scene = new THREE.Scene();
    const renderer = new UtilityKitRenderer(scene, flat, [CREMATORIUM]);
    renderer.apply(add(instance(1), instance(2, { x: 30, z: 30 })));
    for (const kind of kinds) expect(renderer.instanceCount('crematorium', kind)).toBe(2);
    const slots = kinds.map((kind) => renderer.partSlotsFor(1, kind)[0]!);
    renderer.apply({ added: [], removed: [1], updated: [] });
    const m = new THREE.Matrix4();
    kinds.forEach((kind, i) => {
      expect(renderer.partSlotsFor(1, kind)).toHaveLength(0);
      expect(renderer.partSlotsFor(2, kind)).toHaveLength(1);
      renderer.getPartMatrix('crematorium', kind, slots[i]!, m);
      expect(new THREE.Vector3().setFromMatrixScale(m).length()).toBe(0);
    });
  });
});
