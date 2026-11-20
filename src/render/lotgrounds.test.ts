import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import catalogData from '../data/catalog.json';
import { BuildingState, type BuildingCatalogEntry, type BuildingInstance } from '../shared/types';
import { TILE_METERS } from '../shared/constants';
import { footprintForRotation } from '../shared/footprint';
import { groundsInstanceCounts, LotGroundsRenderer, type GroundsPool } from './lotgrounds';
import { LotRenderer } from './lots';
import { lotPlanFor, lotPointToWorld } from './lotplan';
import { streetWalk } from '../shared/lotgrounds';

const CATALOG = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const entry = (id: string): BuildingCatalogEntry => CATALOG.find((e) => e.id === id)!;
const flat = (): number => 0;
const ORIGIN = { x: 10, z: 10 };

function building(id: string, over: Partial<BuildingInstance> = {}): BuildingInstance {
  const e = entry(id);
  return {
    id: 1,
    catalogId: id,
    x: ORIGIN.x,
    z: ORIGIN.z,
    rotation: 0,
    level: e.level ?? 1,
    state: BuildingState.Active,
    problems: 0,
    ...over,
  };
}

/** A street along the lot's south edge, so the building fronts something. */
const southStreet =
  (id: string) =>
  (x: number, z: number): boolean => {
    const e = entry(id);
    return z === ORIGIN.z + e.footprint.d && x >= ORIGIN.x - 6 && x < ORIGIN.x + e.footprint.w + 6;
  };

function renderer(
  id: string,
  homesAt?: (x: number, z: number) => boolean,
): { scene: THREE.Scene; grounds: LotGroundsRenderer } {
  const scene = new THREE.Scene();
  const grounds = new LotGroundsRenderer(
    scene,
    flat,
    CATALOG,
    southStreet(id),
    null,
    null,
    homesAt,
  );
  return { scene, grounds };
}

const total = (counts: Record<GroundsPool, number>): number =>
  Object.values(counts).reduce((a, b) => a + b, 0);

describe('lot grounds renderer', () => {
  it('draws a warehouse lot from its plan, one instance for each part', () => {
    const { grounds } = renderer('ind-warehouse-2');
    const b = building('ind-warehouse-2');
    grounds.apply({ added: [b], updated: [], removed: [] });
    const found = grounds.planOf(b)!;
    expect(grounds.instancesOf(b.id)).toEqual(groundsInstanceCounts(found.plan));
    const counts = grounds.instancesOf(b.id);
    expect(counts.box).toBeGreaterThan(0);
    expect(counts.head).toBeGreaterThan(0);
    expect(counts.hedge).toBeGreaterThan(0);
  });

  it('merges a row of shrubs into one hedge run', () => {
    const { grounds } = renderer('ind-warehouse-2');
    const b = building('ind-warehouse-2');
    grounds.apply({ added: [b], updated: [], removed: [] });
    const shrubs = grounds.planOf(b)!.plan.pieces.filter((p) => p.kind === 'shrub').length;
    expect(shrubs).toBeGreaterThan(20);
    expect(grounds.instancesOf(b.id).hedge).toBeLessThan(shrubs / 4);
  });

  it('gives a corner shop a walk and a bin but no poles or planting', () => {
    const { grounds } = renderer('com-low-1');
    const b = building('com-low-1');
    grounds.apply({ added: [b], updated: [], removed: [] });
    const kinds = grounds.planOf(b)!.plan.pieces.map((p) => p.kind);
    // A shop at the street line has its front walk on the footway, so it needs no walk in from it.
    const front = lotPlanFor(entry('com-low-1'), b.x, b.z, southStreet('com-low-1'))?.layout
      .frontWalk;
    if (!front || front.v0 > 0.01) expect(kinds).toContain('walk');
    expect(kinds).toContain('bin');
    expect(grounds.instancesOf(b.id).head).toBe(0);
    expect(grounds.instancesOf(b.id).tree).toBe(0);
  });

  it('keeps every part inside its lot', () => {
    const { scene, grounds } = renderer('ind-warehouse-2');
    const b = building('ind-warehouse-2');
    grounds.apply({ added: [b], updated: [], removed: [] });
    const lot = footprintForRotation(entry(b.catalogId), b.rotation);
    const x0 = b.x * TILE_METERS - 0.5;
    const x1 = (b.x + lot.w) * TILE_METERS + 0.5;
    const z0 = b.z * TILE_METERS - 0.5;
    const z1 = (b.z + lot.d) * TILE_METERS + 0.5;
    const at = new THREE.Vector3();
    const m = new THREE.Matrix4();
    let seen = 0;
    scene.traverse((o) => {
      if (!(o instanceof THREE.InstancedMesh)) return;
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m);
        at.setFromMatrixPosition(m);
        seen += 1;
        expect(at.x).toBeGreaterThanOrEqual(x0);
        expect(at.x).toBeLessThanOrEqual(x1);
        expect(at.z).toBeGreaterThanOrEqual(z0);
        expect(at.z).toBeLessThanOrEqual(z1);
      }
    });
    expect(seen).toBeGreaterThan(10);
  });

  it('frees a lot on removal and redraws it on update, never doubling it', () => {
    const { grounds } = renderer('ind-warehouse-2');
    const b = building('ind-warehouse-2');
    grounds.apply({ added: [b], updated: [], removed: [] });
    const once = total(grounds.instancesOf(b.id));
    grounds.apply({ added: [], updated: [b], removed: [] });
    expect(total(grounds.instancesOf(b.id))).toBe(once);
    grounds.apply({ added: [], updated: [], removed: [b.id] });
    expect(total(grounds.instancesOf(b.id))).toBe(0);
  });

  it('draws nothing for a building that is not standing, nor for a home', () => {
    const { grounds } = renderer('ind-warehouse-2');
    const under = building('ind-warehouse-2', { state: BuildingState.Constructing });
    grounds.apply({ added: [under], updated: [], removed: [] });
    expect(total(grounds.instancesOf(under.id))).toBe(0);
    const home = CATALOG.find((e) => e.category === 'res')!;
    const h = building(home.id, { id: 2 });
    grounds.apply({ added: [h], updated: [], removed: [] });
    expect(grounds.planOf(h)).toBeNull();
    expect(total(grounds.instancesOf(h.id))).toBe(0);
  });

  it('shortens the poles on the side a residential zone lies beside', () => {
    const id = 'ind-warehouse-2';
    const b = building(id);
    const west = renderer(id, (x) => x < ORIGIN.x);
    const near = west.grounds.planOf(b)!.plan.pieces.filter((p) => p.kind === 'light');
    const none = renderer(id)
      .grounds.planOf(b)!
      .plan.pieces.filter((p) => p.kind === 'light');
    expect(near.some((p) => p.short)).toBe(true);
    expect(none.some((p) => p.short)).toBe(false);
  });

  it('draws every upright sheet, fence fabric and gate included, from both sides', () => {
    const { scene } = renderer('ind-warehouse-2');
    const sheets: THREE.InstancedMesh[] = [];
    scene.traverse((o) => {
      if (!(o instanceof THREE.InstancedMesh)) return;
      o.geometry.computeBoundingBox();
      const size = o.geometry.boundingBox!.getSize(new THREE.Vector3());
      const upright = size.y > 0 && (size.x === 0 || size.z === 0);
      if (upright) sheets.push(o);
    });
    // The fabric and the post pools.
    expect(sheets).toHaveLength(2);
    for (const mesh of sheets)
      expect((mesh.material as THREE.Material).side).toBe(THREE.DoubleSide);
  });

  it('keeps the lamp heads lit through the night tint', () => {
    const { scene, grounds } = renderer('ind-warehouse-2');
    grounds.apply({ added: [building('ind-warehouse-2')], updated: [], removed: [] });
    grounds.setNightFactor(1);
    const materials: THREE.Material[] = [];
    scene.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) materials.push(o.material as THREE.Material);
    });
    expect(materials.some((m) => m instanceof THREE.MeshBasicMaterial)).toBe(true);
    expect(materials.filter((m) => !(m instanceof THREE.MeshBasicMaterial)).length).toBeGreaterThan(
      3,
    );
  });
});

describe('the walk across the street verge', () => {
  const id = 'com-strip-1';
  const roadAt = (_x: number, z: number): boolean => z === 8;
  const southEdge = 8 * TILE_METERS;
  const mesh = (street: (x: number, z: number) => { vergeM: number; sidewalkM: number } | null) => {
    const scene = new THREE.Scene();
    new LotRenderer(scene, flat, CATALOG, roadAt, street).apply({
      added: [building(id, { x: 4, z: 6 })],
      updated: [],
      removed: [],
    });
    return (scene.children[0] as THREE.Mesh).geometry.getAttribute('position');
  };
  /** The world x of every vertex lying over the verge, below the lot's street line. */
  const overVerge = (
    position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  ): number[] => {
    const xs: number[] = [];
    for (let i = 0; i < position.count; i += 1) {
      if (position.getZ(i) > southEdge + 1e-6) xs.push(position.getX(i));
    }
    return xs;
  };

  it('carries a walk with no way through the stalls across the verge to the footway', () => {
    const lot = lotPlanFor(entry(id), 4, 6, roadAt)!;
    const walk = streetWalk(lot.layout)!;
    expect(walk.laid).toBe(false);
    const a = lotPointToWorld(lot.frame, walk.rect.u0, 0).x;
    const b = lotPointToWorld(lot.frame, walk.rect.u1, 0).x;
    const xs = overVerge(mesh(() => ({ vergeM: 4.375, sidewalkM: 1.875 })));
    const near = xs.filter((x) => x >= Math.min(a, b) - 1e-6 && x <= Math.max(a, b) + 1e-6);
    expect(near.length).toBeGreaterThanOrEqual(4);
  });

  it('ends the walk at the lot line on a road with no footway', () => {
    const lot = lotPlanFor(entry(id), 4, 6, roadAt)!;
    const walk = streetWalk(lot.layout)!;
    const a = lotPointToWorld(lot.frame, walk.rect.u0, 0).x;
    const b = lotPointToWorld(lot.frame, walk.rect.u1, 0).x;
    const xs = overVerge(mesh(() => ({ vergeM: 7.1875, sidewalkM: 0 })));
    const inWalk = xs.filter((x) => x > Math.min(a, b) + 1e-6 && x < Math.max(a, b) - 1e-6);
    expect(inWalk).toHaveLength(0);
  });

  it('keeps street furniture off the walk where it meets the street', () => {
    const grounds = new LotGroundsRenderer(new THREE.Scene(), flat, CATALOG, roadAt);
    const b = building(id, { x: 4, z: 6 });
    const discs = grounds.clearDiscs(b, () => ({ vergeM: 4.375, sidewalkM: 1.875 }));
    expect(discs.length).toBeGreaterThan(0);
    const lot = lotPlanFor(entry(id), 4, 6, roadAt)!;
    const walk = streetWalk(lot.layout)!;
    const mid = lotPointToWorld(lot.frame, (walk.rect.u0 + walk.rect.u1) / 2, -2);
    expect(discs.some((d) => Math.hypot(d.x - mid.x, d.z - mid.z) <= d.r)).toBe(true);
  });
});
