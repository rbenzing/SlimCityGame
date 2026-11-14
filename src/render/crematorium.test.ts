import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CEMETERY_LAWN_HEIGHT,
  CREMATORIUM_ENTRANCE,
  CREMATORIUM_FLUE_HEIGHT_M,
  CREMATORIUM_FOYER_HEIGHT_M,
  CREMATORIUM_HALL_HEIGHT_M,
  CREMATORIUM_PORCH,
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
import { sizeForKind } from './vehicles';
import catalogData from '../data/catalog.json';
import {
  BuildingCatalogEntry,
  BuildingDelta,
  BuildingInstance,
  BuildingState,
  VehicleKind,
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

describe('the crematorium as a crematorium', () => {
  const layout = computeCrematoriumLayout(CREMATORIUM.footprint);
  const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [CREMATORIUM]);
  const position = renderer
    .partGeometry('crematorium', 'crematoriumBuilding')!
    .getAttribute('position');
  const vertices = Array.from({ length: position.count }, (_, i) =>
    new THREE.Vector3().fromBufferAttribute(position, i),
  ).map((v) => new THREE.Vector3(v.x, v.y - CEMETERY_LAWN_HEIGHT, v.z));
  const [hearseW, hearseH, hearseL] = sizeForKind(VehicleKind.Hearse);

  it('covers the door with a porch a hearse stands under: 6.2 m deep at least, 3 m wide and 2.7 m clear', () => {
    const { porch, foyer, forecourt } = layout;
    expect(porch.z1 - porch.z0).toBeGreaterThanOrEqual(hearseL);
    expect(porch.x1 - porch.x0).toBeGreaterThanOrEqual(3);
    expect(CREMATORIUM_PORCH.clear).toBeGreaterThanOrEqual(2.7);
    expect(CREMATORIUM_PORCH.clear).toBeGreaterThan(hearseH);
    expect(porch.x1 - porch.x0).toBeGreaterThan(hearseW);
    // It stands on the entrance wall, over the forecourt, in the middle of the doors.
    expect(porch.z0).toBeCloseTo(foyer.z1, 9);
    expect(porch.x0).toBeGreaterThanOrEqual(forecourt.x0);
    expect(porch.x1).toBeLessThanOrEqual(forecourt.x1);
    expect(porch.z1).toBeLessThanOrEqual(forecourt.z1);
    expect((porch.x0 + porch.x1) / 2).toBeCloseTo((foyer.x0 + foyer.x1) / 2, 9);
  });

  it('roofs the porch with a slab 2.7 m clear above the ground and leaves its middle 3 m open to the hearse', () => {
    const { porch, foyer } = layout;
    const { clear, slab } = CREMATORIUM_PORCH;
    const roof = vertices.filter((v) => Math.abs(v.y - (clear + slab)) < 1e-6);
    for (const [x, z] of [
      [porch.x0, porch.z0],
      [porch.x1, porch.z0],
      [porch.x0, porch.z1],
      [porch.x1, porch.z1],
    ] as const) {
      expect(
        roof.some((v) => Math.abs(v.x - x) < 1e-6 && Math.abs(v.z - z) < 1e-6),
        `slab corner ${x},${z}`,
      ).toBe(true);
    }
    const mid = (porch.x0 + porch.x1) / 2;
    const inLane = vertices.filter(
      (v) =>
        Math.abs(v.x - mid) < 1.5 - 1e-6 &&
        v.z > foyer.z1 + 0.2 &&
        v.z <= porch.z1 + 1e-6 &&
        v.y > 0.05 &&
        v.y < clear - 1e-6,
    );
    expect(inLane).toEqual([]);
  });

  it('raises a tall entrance under the porch: double doors 3 m high, glass beside them, a gable above', () => {
    const { foyer, porch } = layout;
    const mid = (foyer.x0 + foyer.x1) / 2;
    const face = vertices.filter((v) => Math.abs(v.z - (foyer.z1 + 0.12)) < 1e-6);
    const door = face.filter((v) => Math.abs(v.x - mid) <= CREMATORIUM_ENTRANCE.doorW / 2 + 1e-6);
    expect(Math.max(...door.map((v) => v.y))).toBeCloseTo(CREMATORIUM_ENTRANCE.doorH, 5);
    expect(CREMATORIUM_ENTRANCE.doorW).toBeGreaterThanOrEqual(1.8);
    expect(CREMATORIUM_ENTRANCE.doorH).toBeLessThan(CREMATORIUM_PORCH.clear);
    expect(CREMATORIUM_FOYER_HEIGHT_M).toBeGreaterThan(
      CREMATORIUM_PORCH.clear + CREMATORIUM_PORCH.slab,
    );
    expect(porch.z0).toBe(foyer.z1);
  });

  it('keeps the cremator hall low and behind, the chapel tall, and the flue over both roofs', () => {
    const { hall, chapel, foyer, flue } = layout;
    expect(CREMATORIUM_HALL_HEIGHT_M).toBeLessThan(CREMATORIUM_RIDGE_M - 1.5);
    expect(hall.z1).toBeLessThanOrEqual(foyer.z0 + 1e-9);
    expect(hall.z0).toBeLessThanOrEqual(chapel.z0 + 1e-9);
    expect(CREMATORIUM_FLUE_HEIGHT_M).toBeGreaterThan(CREMATORIUM_RIDGE_M);
    expect(flue.x).toBeGreaterThan(hall.x0);
    expect(flue.x).toBeLessThan(hall.x1);
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
