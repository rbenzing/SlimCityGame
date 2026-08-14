import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  LOT_Y_OFFSET,
  LotRenderer,
  MAX_LOT_MESH_VERTICES,
  lotBounds,
  lotSurfaceFor,
  lotVertexCount,
} from './lots';
import { TILE_METERS } from '../shared/constants';
import {
  BuildingState,
  ZoneType,
  type BuildingCatalogEntry,
  type BuildingDelta,
  type BuildingInstance,
} from '../shared/types';

function entry(over: Partial<BuildingCatalogEntry> = {}): BuildingCatalogEntry {
  return {
    id: 'test-1',
    name: 'Test',
    category: 'com',
    footprint: { w: 2, d: 2 },
    height: 10,
    color: 0x808080,
    powerUse: 0,
    waterUse: 0,
    cost: 0,
    upkeep: 0,
    unlockMilestone: 0,
    ...over,
  } as BuildingCatalogEntry;
}

function building(over: Partial<BuildingInstance> = {}): BuildingInstance {
  return {
    id: 1,
    catalogId: 'test-1',
    x: 4,
    z: 6,
    rotation: 0,
    state: BuildingState.Active,
    problems: 0,
    ...over,
  } as BuildingInstance;
}

const delta = (over: Partial<BuildingDelta> = {}): BuildingDelta => ({
  added: [],
  updated: [],
  removed: [],
  ...over,
});

const flat = (): number => 0;

describe('lotBounds', () => {
  it('covers exactly the tiles the sim reserved', () => {
    const b = lotBounds(building({ x: 4, z: 6 }), entry({ footprint: { w: 2, d: 3 } }));
    expect(b.x0).toBe(4 * TILE_METERS);
    expect(b.x1).toBe(6 * TILE_METERS);
    expect(b.z0).toBe(6 * TILE_METERS);
    expect(b.z1).toBe(9 * TILE_METERS);
  });

  // "Fill the grid space": two buildings on adjacent footprints must produce
  // pads that touch, or the block reads as boxes on a lawn again.
  it('leaves no seam between neighbouring lots', () => {
    const e = entry({ footprint: { w: 2, d: 2 } });
    const left = lotBounds(building({ x: 4, z: 6 }), e);
    const right = lotBounds(building({ id: 2, x: 6, z: 6 }), e);
    expect(right.x0).toBe(left.x1);

    const below = lotBounds(building({ id: 3, x: 4, z: 8 }), e);
    expect(below.z0).toBe(left.z1);
  });

  it('never reaches into a neighbour', () => {
    const e = entry({ footprint: { w: 2, d: 2 } });
    const a = lotBounds(building({ x: 4, z: 6 }), e);
    const b = lotBounds(building({ id: 2, x: 6, z: 6 }), e);
    expect(a.x1).toBeLessThanOrEqual(b.x0);
  });
});

describe('lotSurfaceFor', () => {
  it('gives industry a yard, commerce a car park, apartments a forecourt', () => {
    expect(lotSurfaceFor(entry({ category: 'ind' }))).toBe('darkAsphalt');
    expect(lotSurfaceFor(entry({ category: 'com' }))).toBe('brightAsphalt');
    expect(lotSurfaceFor(entry({ category: 'res', zone: ZoneType.ResHigh }))).toBe(
      'stainedConcrete',
    );
  });

  it('gives a house a garden rather than paving it over', () => {
    expect(lotSurfaceFor(entry({ category: 'res', zone: ZoneType.ResLow }))).toBe(
      'brightVegetation',
    );
    expect(lotSurfaceFor(entry({ category: 'res', zone: ZoneType.ResMediumRow }))).toBe(
      'brightVegetation',
    );
  });

  it('leaves ground it does not own alone', () => {
    expect(lotSurfaceFor(entry({ category: 'utility' }))).toBeNull();
    expect(lotSurfaceFor(entry({ category: 'park' }))).toBeNull();
    expect(lotSurfaceFor(entry({ category: 'service' }))).toBeNull();
  });
});

describe('LotRenderer', () => {
  it('builds a pad per building and drops it on removal', () => {
    const scene = new THREE.Scene();
    const e = entry();
    const r = new LotRenderer(scene, flat, [e]);

    r.apply(delta({ added: [building()] }));
    expect(r.lotCount()).toBe(1);

    r.apply(delta({ removed: [1] }));
    expect(r.lotCount()).toBe(0);
    expect(scene.children).toHaveLength(0);
  });

  it('builds no pad for a category that brings its own ground', () => {
    const scene = new THREE.Scene();
    const e = entry({ category: 'park' });
    const r = new LotRenderer(scene, flat, [e]);
    r.apply(delta({ added: [building()] }));
    expect(r.lotCount()).toBe(0);
  });

  it('rebuilds rather than duplicating when a building updates', () => {
    const scene = new THREE.Scene();
    const e = entry();
    const r = new LotRenderer(scene, flat, [e]);
    r.apply(delta({ added: [building()] }));
    r.apply(delta({ updated: [building({ state: BuildingState.Abandoned })] }));
    expect(r.lotCount()).toBe(1);
    expect(scene.children).toHaveLength(1);
  });

  // The user-facing requirement: a lot pad must not clip the landscape.
  it('follows the ground instead of cutting through a hill', () => {
    const scene = new THREE.Scene();
    const e = entry({ footprint: { w: 3, d: 3 } });
    // A ridge across the middle of the lot, invisible to a flat quad's corners.
    const ridge = (_x: number, z: number): number =>
      10 - Math.abs(z - (6 + 1.5) * TILE_METERS) * 0.5;
    const r = new LotRenderer(scene, ridge, [e]);
    r.apply(delta({ added: [building({ x: 4, z: 6 })] }));

    const mesh = scene.children[0] as THREE.Mesh;
    const position = mesh.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      expect(y, `pad at (${x},${z}) sits below the ground it covers`).toBeGreaterThanOrEqual(
        ridge(x, z) + LOT_Y_OFFSET - 1e-6,
      );
    }
  });

  it('sits above the terrain but under what stands on the lot', () => {
    const scene = new THREE.Scene();
    const r = new LotRenderer(scene, () => 5, [entry()]);
    r.apply(delta({ added: [building()] }));
    const position = (scene.children[0] as THREE.Mesh).geometry.getAttribute('position');
    for (let i = 0; i < position.count; i += 1) {
      expect(position.getY(i)).toBeCloseTo(5 + LOT_Y_OFFSET, 6);
    }
    // The parking apron rides at 0.12 and a driveway at 0.10; the pad is below both.
    expect(LOT_Y_OFFSET).toBeLessThan(0.1);
  });

  it('keeps even the largest growable lot far under the mesh vertex cap', () => {
    // The reference caps a growable at 4x4 cells; ours are smaller still.
    const big = entry({ footprint: { w: 4, d: 4 } });
    expect(lotVertexCount(building(), big)).toBeLessThan(MAX_LOT_MESH_VERTICES);

    const scene = new THREE.Scene();
    const r = new LotRenderer(scene, flat, [big]);
    r.apply(delta({ added: [building()] }));
    expect(r.largestMeshVertices()).toBeLessThan(MAX_LOT_MESH_VERTICES);
    expect(r.largestMeshVertices()).toBe(lotVertexCount(building(), big));
  });

  it('disposes every pad it owns', () => {
    const scene = new THREE.Scene();
    const r = new LotRenderer(scene, flat, [entry()]);
    r.apply(delta({ added: [building(), building({ id: 2, x: 10 })] }));
    r.dispose();
    expect(r.lotCount()).toBe(0);
    expect(scene.children).toHaveLength(0);
  });

  it('hides and shows every pad without dropping them', () => {
    const scene = new THREE.Scene();
    const r = new LotRenderer(scene, flat, [entry()]);
    r.apply(delta({ added: [building()] }));
    r.setVisible(false);
    expect((scene.children[0] as THREE.Mesh).visible).toBe(false);
    r.setVisible(true);
    expect((scene.children[0] as THREE.Mesh).visible).toBe(true);
    expect(r.lotCount()).toBe(1);
  });
});
