import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  LOT_Y_OFFSET,
  LotRenderer,
  MAX_LOT_MESH_VERTICES,
  layFarmGround,
  lotBounds,
  lotSurfaceFor,
  lotVertexCount,
} from './lots';
import { planFarm, type FarmRect } from './farmlot';
import { TILE_METERS } from '../shared/constants';
import { CURB_CUT_Y_OFFSET } from './parked';
import {
  BuildingState,
  ZoneType,
  type BuildingCatalogEntry,
  type BuildingDelta,
  type BuildingInstance,
  type FarmKind,
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
    expect(lotSurfaceFor(entry({ category: 'res', zone: ZoneType.ResLow }))).toBe('mownLawn');
    expect(lotSurfaceFor(entry({ category: 'res', zone: ZoneType.ResMediumRow }))).toBe(
      'mownLawn',
    );
  });

  it('leaves ground it does not own alone', () => {
    expect(lotSurfaceFor(entry({ category: 'utility' }))).toBeNull();
    expect(lotSurfaceFor(entry({ category: 'park' }))).toBeNull();
    expect(lotSurfaceFor(entry({ category: 'service' }))).toBeNull();
  });

  it('never paves a farm like the industry its jobs count as', () => {
    expect(lotSurfaceFor(entry({ category: 'ind', zone: ZoneType.Agriculture, farm: 'crops' }))).toBeNull();
  });
});

describe('a farm’s ground', () => {
  const farmEntry = (kind: FarmKind): BuildingCatalogEntry =>
    entry({ category: 'ind', zone: ZoneType.Agriculture, farm: kind, level: 1, footprint: { w: 4, d: 5 } });
  const dirtNorth = (_x: number, z: number): boolean => z === 5;
  const laid = (kind: FarmKind, state: BuildingState): Array<{ rect: FarmRect; name: string }> => {
    const plan = planFarm(building({ state }), farmEntry(kind), dirtNorth)!;
    const out: Array<{ rect: FarmRect; name: string }> = [];
    layFarmGround(plan, state, (rect, _y, name) => out.push({ rect, name }));
    return out;
  };
  const area = (r: FarmRect): number => (r.x1 - r.x0) * (r.z1 - r.z0);

  it('covers the whole lot at lot height, the yard and the field between them', () => {
    const plan = planFarm(building(), farmEntry('pasture'), dirtNorth)!;
    const heights: number[] = [];
    let covered = 0;
    layFarmGround(plan, BuildingState.Active, (rect, y) => {
      heights.push(y);
      if (y === LOT_Y_OFFSET) covered += area(rect);
    });
    expect(covered).toBeCloseTo(area(plan.lot), 6);
  });

  it.each([
    ['a crop farm in bands of crop and bare furrow', 'crops' as const, ['tilledSoil']],
    ['an orchard in mown grass', 'orchard' as const, ['mownLawn']],
    ['a paddock in grazed pasture', 'pasture' as const, ['pasture']],
  ])('lays %s', (_label, kind, names) => {
    const fieldNames = new Set(laid(kind, BuildingState.Active).map((l) => l.name));
    for (const name of names) expect(fieldNames).toContain(name);
  });

  it('breaks the field to bare soil while the farm is going up, and lets it go to grass when abandoned', () => {
    expect(laid('crops', BuildingState.Constructing).map((l) => l.name)).toContain('tilledSoil');
    const fallow = laid('crops', BuildingState.Abandoned).map((l) => l.name);
    expect(fallow).toContain('brightVegetation');
    expect(fallow).not.toContain('cropGreen');
    expect(fallow).not.toContain('ripeGrain');
  });

  it('draws the farm’s ground on its own, and within the mesh cap at its largest', () => {
    const scene = new THREE.Scene();
    const big = { ...farmEntry('crops'), id: 'farm-big', level: 3, footprint: { w: 6, d: 7 } };
    const lots = new LotRenderer(scene, flat, [big], () => false, undefined, dirtNorth);
    lots.apply(delta({ added: [building({ catalogId: 'farm-big' })] }));
    expect(lots.lotCount()).toBe(1);
    expect(lots.largestMeshVertices()).toBeLessThan(MAX_LOT_MESH_VERTICES);
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

  describe('a home beside a street', () => {
    const home = entry({ category: 'res', zone: ZoneType.ResLow, footprint: { w: 2, d: 2 } });
    // The street runs along row 8, just south of a 2x2 lot at (4, 6).
    const roadAt = (_x: number, z: number): boolean => z === 8;
    const street = (_x: number, z: number) =>
      z === 8 ? { vergeM: 4.375, sidewalkM: 1.875 } : null;
    const southEdge = 8 * TILE_METERS;

    const zExtent = (scene: THREE.Scene): { min: number; max: number; top: number } => {
      const position = (scene.children[0] as THREE.Mesh).geometry.getAttribute('position');
      let min = Infinity;
      let max = -Infinity;
      let top = -Infinity;
      for (let i = 0; i < position.count; i += 1) {
        min = Math.min(min, position.getZ(i));
        max = Math.max(max, position.getZ(i));
        top = Math.max(top, position.getY(i));
      }
      return { min, max, top };
    };

    it('carries its lawn across the verge and its drive across the sidewalk', () => {
      const scene = new THREE.Scene();
      new LotRenderer(scene, flat, [home], roadAt, street).apply(delta({ added: [building()] }));
      const { min, max, top } = zExtent(scene);
      expect(min).toBeCloseTo(6 * TILE_METERS, 6);
      // Out over the verge and then the footway, to the kerb.
      expect(max).toBeCloseTo(southEdge + 4.375 + 1.875, 6);
      // The curb cut rides over the sidewalk, above everything else on the lot.
      expect(top).toBeCloseTo(CURB_CUT_Y_OFFSET, 6);
    });

    it('keeps a home that fronts no street inside its own footprint', () => {
      const scene = new THREE.Scene();
      new LotRenderer(scene, flat, [home]).apply(delta({ added: [building()] }));
      const { max, top } = zExtent(scene);
      expect(max).toBeCloseTo(southEdge, 6);
      // Its patio may still be there; a curb cut, with no kerb to cut, is not.
      expect(top).toBeLessThan(CURB_CUT_Y_OFFSET);
    });

    it('lays nothing beyond a shop’s own lot — its apron is the parking renderer’s', () => {
      const scene = new THREE.Scene();
      new LotRenderer(scene, flat, [entry()], roadAt, street).apply(delta({ added: [building()] }));
      expect(zExtent(scene).max).toBeCloseTo(southEdge, 6);
    });
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
