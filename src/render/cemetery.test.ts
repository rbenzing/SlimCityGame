import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CEMETERY_DRIVE_M,
  CEMETERY_FENCE_HEIGHT_M,
  CEMETERY_GATEHOUSE,
  CEMETERY_LAWN_HEIGHT,
  GRAVES_PER_SECTION,
  GRAVE_SPACE,
  HEADSTONE,
  UtilityKitRenderer,
  cemeteryPlots,
  computeCemeteryLayout,
  footprintHalfExtents,
  headstoneAt,
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

const CEMETERY = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings.find(
  (e) => e.id === 'cemetery',
)!;
const PLOTS = cemeteryPlots(CEMETERY);
const flat = (): number => 0;

function instance(id: number, overrides: Partial<BuildingInstance> = {}): BuildingInstance {
  return {
    id,
    catalogId: 'cemetery',
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

const spaceRect = (g: { x: number; z: number }): Rect => ({
  x0: g.x - GRAVE_SPACE.w / 2,
  x1: g.x + GRAVE_SPACE.w / 2,
  z0: g.z - GRAVE_SPACE.l / 2,
  z1: g.z + GRAVE_SPACE.l / 2,
});
const overlaps = (a: Rect, b: Rect): boolean =>
  a.x0 < b.x1 - 1e-9 && b.x0 < a.x1 - 1e-9 && a.z0 < b.z1 - 1e-9 && b.z0 < a.z1 - 1e-9;

describe('the cemetery layout', () => {
  const layout = computeCemeteryLayout(CEMETERY.footprint, PLOTS);
  const { halfW, halfD } = footprintHalfExtents(CEMETERY.footprint);

  it('holds exactly the catalog plots, 780, as grave spaces in the first 780 positions of eight sections', () => {
    expect(PLOTS).toBe(780);
    expect(layout.graves).toHaveLength(780);
    const full = computeCemeteryLayout(CEMETERY.footprint, 8 * GRAVES_PER_SECTION);
    expect(full.graves).toHaveLength(784);
    for (let s = 0; s < 8; s++) {
      expect(full.graves.filter((g) => g.section === s)).toHaveLength(GRAVES_PER_SECTION);
    }
    expect(layout.graves).toEqual(full.graves.slice(0, 780));
  });

  it('gives every grave at least 42 × 96 in, and no two spaces overlap', () => {
    expect(GRAVE_SPACE.w).toBeGreaterThanOrEqual(42 * 0.0254);
    expect(GRAVE_SPACE.l).toBeGreaterThanOrEqual(96 * 0.0254);
    const rects = layout.graves.map(spaceRect);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        if (overlaps(rects[i]!, rects[j]!)) throw new Error(`graves ${i} and ${j} overlap`);
      }
    }
  });

  it('keeps every grave inside the lot, clear of the drive, the gatehouse and its forecourt', () => {
    for (const g of layout.graves) {
      const r = spaceRect(g);
      expect(r.x0).toBeGreaterThan(-halfW);
      expect(r.x1).toBeLessThan(halfW);
      expect(r.z0).toBeGreaterThan(-halfD);
      expect(r.z1).toBeLessThan(halfD);
      for (const other of [layout.drive, layout.gatehouse, layout.forecourt]) {
        expect(overlaps(r, other)).toBe(false);
      }
    }
  });

  it('runs a 20 ft drive from the street edge to the back fence, through a gate gap as wide as itself', () => {
    expect(layout.drive.x1 - layout.drive.x0).toBeCloseTo(20 * 0.3048, 9);
    expect(CEMETERY_DRIVE_M).toBeCloseTo(6.096, 9);
    expect(layout.drive.z1).toBe(halfD);
    expect(layout.drive.z0).toBeLessThan(-halfD + 1);
    expect(layout.gate).toEqual({ x0: layout.drive.x0, x1: layout.drive.x1 });
  });

  it('puts a one-storey 128 m² gatehouse on the street-side tile beside the drive, with a forecourt before it', () => {
    const { w, d, h } = CEMETERY_GATEHOUSE;
    expect(w * d).toBeCloseTo(128, 0);
    expect(h).toBe(CEMETERY.height);
    expect(layout.gatehouse.z1 - layout.gatehouse.z0).toBeCloseTo(d, 9);
    expect(layout.gatehouse.x0).toBeGreaterThanOrEqual(layout.drive.x1);
    expect(layout.forecourt.z0).toBe(layout.gatehouse.z1);
    expect(layout.forecourt.z1).toBeLessThan(halfD);
    const tileZ0 = halfD - TILE_METERS;
    expect(layout.gatehouse.z0).toBeGreaterThanOrEqual(tileZ0);
  });

  it('fills the front section first, and each section from its front row', () => {
    const front = layout.graves.slice(0, GRAVES_PER_SECTION);
    expect(new Set(front.map((g) => g.section)).size).toBe(1);
    expect(Math.min(...front.map((g) => g.z))).toBeGreaterThan(halfD - TILE_METERS - 1);
    expect(layout.graves[0]!.z).toBeGreaterThan(layout.graves[GRAVES_PER_SECTION - 1]!.z);
  });

  it('stands its trees clear of every grave and of the drive and gatehouse', () => {
    expect(layout.trees.length).toBeGreaterThanOrEqual(3);
    for (const t of layout.trees) {
      const trunk: Rect = { x0: t.x - 1.1, x1: t.x + 1.1, z0: t.z - 1.1, z1: t.z + 1.1 };
      for (const g of layout.graves) expect(overlaps(trunk, spaceRect(g))).toBe(false);
      expect(overlaps(trunk, layout.drive)).toBe(false);
      expect(overlaps(trunk, layout.gatehouse)).toBe(false);
    }
  });

  it('is deterministic', () => {
    expect(computeCemeteryLayout(CEMETERY.footprint, PLOTS)).toEqual(layout);
  });
});

describe('the cemetery kit', () => {
  const kinds: UtilityKitPartKind[] = [
    'cemeteryGrounds',
    'cemeteryGatehouse',
    'cemeteryFence',
    'cemeteryTree',
    'cemeteryStone',
  ];

  it('is claimed by the kit renderer so the instancer draws only a plinth under it', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [CEMETERY]);
    expect(renderer.kitIds().has('cemetery')).toBe(true);
  });

  it('keeps every part inside the 3 × 3 footprint at all four rotations', () => {
    for (const rotation of [0, 1, 2, 3] as const) {
      const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [CEMETERY]);
      renderer.setInterments([{ id: 5, used: PLOTS }]);
      renderer.apply(add(instance(5, { rotation })));
      const lot = new THREE.Box3(
        new THREE.Vector3(10 * TILE_METERS, -20, 10 * TILE_METERS),
        new THREE.Vector3(13 * TILE_METERS, 20, 13 * TILE_METERS),
      );
      const m = new THREE.Matrix4();
      for (const kind of kinds) {
        const geometry = renderer.partGeometry('cemetery', kind)!;
        geometry.computeBoundingBox();
        for (const slot of renderer.partSlotsFor(5, kind)) {
          renderer.getPartMatrix('cemetery', kind, slot, m);
          const box = geometry.boundingBox!.clone().applyMatrix4(m);
          expect(lot.containsBox(box.expandByScalar(-1e-6))).toBe(true);
        }
      }
    }
  });

  it('draws the fence 1.5 m high and the gatehouse to the catalog height, on the lawn plate', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [CEMETERY]);
    const top = (kind: UtilityKitPartKind): number => {
      const g = renderer.partGeometry('cemetery', kind)!;
      g.computeBoundingBox();
      return g.boundingBox!.max.y;
    };
    expect(CEMETERY_FENCE_HEIGHT_M).toBe(1.5);
    expect(top('cemeteryFence')).toBeCloseTo(CEMETERY_LAWN_HEIGHT + 1.5, 5);
    expect(top('cemeteryGatehouse')).toBeCloseTo(CEMETERY_LAWN_HEIGHT + CEMETERY.height, 5);
  });

  it('stands each cemetery on the highest ground under its lot, so a slope never shows through', () => {
    const slope = (x: number, z: number): number => 0.04 * x + 0.02 * z;
    const renderer = new UtilityKitRenderer(new THREE.Scene(), slope, [CEMETERY]);
    renderer.setInterments([{ id: 2, used: 1 }]);
    renderer.apply(add(instance(2, { x: 3, z: 4 })));
    const m = new THREE.Matrix4();
    renderer.getPartMatrix(
      'cemetery',
      'cemeteryStone',
      renderer.partSlotsFor(2, 'cemeteryStone')[0]!,
      m,
    );
    const highest = slope(6 * TILE_METERS, 7 * TILE_METERS);
    expect(new THREE.Vector3().setFromMatrixPosition(m).y).toBeCloseTo(
      highest + CEMETERY_LAWN_HEIGHT,
      5,
    );
  });
});

describe('the headstones', () => {
  const stones = (r: UtilityKitRenderer, id: number): number => r.headstoneCount(id);

  it('are a 24 × 8 × 30 in upright, inside the common US single-upright range, on a base 0.1 m wider', () => {
    expect(HEADSTONE.w).toBeGreaterThanOrEqual(20 * 0.0254);
    expect(HEADSTONE.w).toBeLessThanOrEqual(30 * 0.0254);
    expect(HEADSTONE.h).toBeGreaterThanOrEqual(24 * 0.0254);
    expect(HEADSTONE.h).toBeLessThanOrEqual(36 * 0.0254);
    expect(HEADSTONE.t).toBeGreaterThanOrEqual(6 * 0.0254);
    expect(HEADSTONE.t).toBeLessThanOrEqual(8 * 0.0254);
    expect(HEADSTONE.baseW - HEADSTONE.w).toBeCloseTo(0.1, 9);
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [CEMETERY]);
    const g = renderer.partGeometry('cemetery', 'cemeteryStone')!;
    g.computeBoundingBox();
    const size = g.boundingBox!.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(HEADSTONE.baseW, 5);
    expect(size.y).toBeCloseTo(HEADSTONE.baseH + HEADSTONE.h, 5);
    expect(g.boundingBox!.min.y).toBeCloseTo(0, 5);
  });

  it('number exactly the interments, clamped to the plots, and follow a change without a building delta', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [CEMETERY]);
    renderer.apply(add(instance(1)));
    expect(stones(renderer, 1)).toBe(0);
    expect(renderer.instanceCount('cemetery', 'cemeteryStone')).toBe(0);

    renderer.setInterments([{ id: 1, used: 300 }]);
    expect(stones(renderer, 1)).toBe(300);
    expect(renderer.instanceCount('cemetery', 'cemeteryStone')).toBe(300);

    renderer.setInterments([{ id: 1, used: 301 }]);
    expect(stones(renderer, 1)).toBe(301);

    renderer.setInterments([{ id: 1, used: 120 }]);
    expect(stones(renderer, 1)).toBe(120);

    renderer.setInterments([{ id: 1, used: 5000 }]);
    expect(stones(renderer, 1)).toBe(780);

    renderer.setInterments([{ id: 1, used: 0 }]);
    expect(stones(renderer, 1)).toBe(0);
  });

  it('keep the stones already standing untouched when more are added', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [CEMETERY]);
    renderer.apply(add(instance(1)));
    renderer.setInterments([{ id: 1, used: 10 }]);
    const before = renderer.partSlotsFor(1, 'cemeteryStone').slice();
    const m = new THREE.Matrix4();
    renderer.getPartMatrix('cemetery', 'cemeteryStone', before[3]!, m);
    const elements = [...m.elements];
    renderer.setInterments([{ id: 1, used: 50 }]);
    expect(renderer.partSlotsFor(1, 'cemeteryStone').slice(0, 10)).toEqual(before);
    renderer.getPartMatrix('cemetery', 'cemeteryStone', before[3]!, m);
    expect([...m.elements]).toEqual(elements);
  });

  it('stand at the head of each grave, in fill order, inside its space, at all four rotations', () => {
    const layout = computeCemeteryLayout(CEMETERY.footprint, PLOTS);
    for (const rotation of [0, 1, 2, 3] as const) {
      const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [CEMETERY]);
      renderer.setInterments([{ id: 1, used: 200 }]);
      renderer.apply(add(instance(1, { rotation })));
      const center = (10 + 1.5) * TILE_METERS;
      const slots = renderer.partSlotsFor(1, 'cemeteryStone');
      const m = new THREE.Matrix4();
      for (const i of [0, 97, 98, 199]) {
        renderer.getPartMatrix('cemetery', 'cemeteryStone', slots[i]!, m);
        const p = new THREE.Vector3().setFromMatrixPosition(m);
        const local = headstoneAt(layout.graves[i]!);
        const rotated = rotateLocalXZ(local.x, local.z, rotation);
        expect(p.x).toBeCloseTo(center + rotated.x, 3);
        expect(p.z).toBeCloseTo(center + rotated.z, 3);
        expect(p.y).toBeCloseTo(CEMETERY_LAWN_HEIGHT, 5);
        // The head end: behind the grave's centre along the space's own length.
        expect(local.z).toBeLessThan(layout.graves[i]!.z - GRAVE_SPACE.l / 2 + 0.5);
        expect(local.z).toBeGreaterThan(layout.graves[i]!.z - GRAVE_SPACE.l / 2);
      }
    }
  });

  it('draw as one InstancedMesh for every cemetery, and free a removed cemetery`s stones', () => {
    const scene = new THREE.Scene();
    const renderer = new UtilityKitRenderer(scene, flat, [CEMETERY]);
    renderer.apply(add(instance(1), instance(2, { x: 30, z: 30 })));
    renderer.setInterments([
      { id: 1, used: 40 },
      { id: 2, used: 60 },
    ]);
    const mesh = scene.children.filter(
      (c) =>
        (c as THREE.InstancedMesh).isInstancedMesh &&
        (c as THREE.InstancedMesh).geometry === renderer.partGeometry('cemetery', 'cemeteryStone'),
    );
    expect(mesh).toHaveLength(1);
    expect(renderer.instanceCount('cemetery', 'cemeteryStone')).toBe(100);

    renderer.apply({ added: [], removed: [1], updated: [] });
    expect(stones(renderer, 1)).toBe(0);
    const m = new THREE.Matrix4();
    let live = 0;
    const stoneMesh = mesh[0] as THREE.InstancedMesh;
    for (let i = 0; i < stoneMesh.count; i++) {
      stoneMesh.getMatrixAt(i, m);
      if (m.elements[0] !== 0) live++;
    }
    expect(live).toBe(60);
  });

  it('are remembered for a cemetery whose building arrives after its count', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [CEMETERY]);
    renderer.setInterments([{ id: 9, used: 33 }]);
    renderer.apply(add(instance(9)));
    expect(stones(renderer, 9)).toBe(33);
  });

  it('are the same on every build of the same cemetery', () => {
    const build = (): number[] => {
      const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [CEMETERY]);
      renderer.setInterments([{ id: 1, used: 90 }]);
      renderer.apply(add(instance(1)));
      const m = new THREE.Matrix4();
      return renderer
        .partSlotsFor(1, 'cemeteryStone')
        .flatMap(
          (s) => (renderer.getPartMatrix('cemetery', 'cemeteryStone', s, m), [...m.elements]),
        );
    };
    expect(build()).toEqual(build());
  });
});
