import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import { GRAND_CITY_MILESTONE, tileIndex } from '../shared/constants';
import { LOT_STANDING_FLOOR } from '../shared/lots';
import { ROOMY_LOT_TILES, roomyLotOf } from '../shared/roomylots';
import { BuildingState, FieldId, RoadTier, ZoneType } from '../shared/types';
import type { BuildingCatalogEntry, DemandLevels, GridState } from '../shared/types';
import { createGrid } from '../world/grid';
import { BuildingRegistry } from './buildings';
import { GrowthSystem, UNLIMITED_ROOM, UNMETERED_SUPPLY, footprintsOf, growsRoomy } from './growth';
import type { Rng } from './growth';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const byId = (id: string): BuildingCatalogEntry => catalog.find((e) => e.id === id)!;
const area = (e: BuildingCatalogEntry): number => e.footprint.w * e.footprint.d;

function constantRng(value: number): Rng {
  const self: Rng = {
    next: () => value,
    int: (maxExclusive: number) => Math.floor(value * maxExclusive),
    range: (a: number, b: number) => a + value * (b - a),
    fork: () => constantRng(value),
  };
  return self;
}

describe('the lots a kind is tried on, roomiest first', () => {
  const compacts = catalog.filter(
    (e) => e.bodyFootprint === undefined && e.kind !== undefined && roomyLotOf(e) !== undefined,
  );

  it('starts at the roomy lot of the table and steps down to the compact lot, for every kind and level', () => {
    expect(compacts).toHaveLength(Object.keys(ROOMY_LOT_TILES).length * 3);
    for (const c of compacts) {
      const lots = footprintsOf(catalog, c, true);
      const roomy = roomyLotOf(c)!;
      expect(lots[0]!.footprint, c.id).toEqual(roomy);
      const within = lots.filter((e) => area(e) <= roomy.w * roomy.d);
      expect(within.map(area), c.id).toEqual([...within.map(area)].sort((a, b) => b - a));
      expect(within[within.length - 1], c.id).toBe(c);
    }
  });

  it('keeps a lot larger than the roomy one as the last resort, after the compact lot', () => {
    const flex3 = byId('ind-3');
    const lots = footprintsOf(catalog, flex3, true).map((e) => `${e.footprint.w}x${e.footprint.d}`);
    expect(lots).toEqual(['5x3', '3x4', '4x4']);
  });

  it('tries smallest first as before when asked for the compact lot', () => {
    for (const c of compacts) {
      const lots = footprintsOf(catalog, c);
      expect(lots.map(area), c.id).toEqual([...lots.map(area)].sort((a, b) => a - b));
      expect(lots[0], c.id).toBe(c);
    }
  });

  it('leaves a kind with no roomy lot, and the dense kinds, as they were', () => {
    for (const id of ['com-fuel-1', 'heavy-chem-1', 'com-hotel-1', 'com-high-1', 'mixed-1']) {
      const e = byId(id);
      expect(footprintsOf(catalog, e, true), id).toEqual(footprintsOf(catalog, e));
    }
  });
});

describe('when a new shop or works takes the roomy lot', () => {
  it('does below Grand City, whatever the land is worth', () => {
    for (let ms = 0; ms < GRAND_CITY_MILESTONE; ms++) {
      expect(growsRoomy(ms, 0)).toBe(true);
      expect(growsRoomy(ms, 255)).toBe(true);
    }
  });

  it('from Grand City does on land under the best standing and not on land of it', () => {
    const best = LOT_STANDING_FLOOR.acre;
    expect(GRAND_CITY_MILESTONE).toBe(5);
    for (const ms of [5, 6]) {
      expect(growsRoomy(ms, best - 1)).toBe(true);
      expect(growsRoomy(ms, best)).toBe(false);
      expect(growsRoomy(ms, 255)).toBe(false);
    }
  });
});

describe('a block grows the lot its town and land call for', () => {
  const wantsShops: DemandLevels = { res: 0, com: 1, ind: 0 };

  /** A street along x at z = 0 with a served ComLow block `depth` deep south of it, `width` wide from x = 1. */
  function block(width: number, depth: number, landValue: number): GridState {
    const g = createGrid();
    g.fields[FieldId.LandValue]!.fill(landValue);
    for (let x = 0; x < width + 2; x++) {
      const i = tileIndex(x, 0);
      g.roadTier[i] = RoadTier.TwoLane;
      g.roadMask[i] = (x > 0 ? 8 : 0) | (x < width + 1 ? 2 : 0);
    }
    for (let z = 1; z <= depth; z++) {
      for (let x = 1; x <= width; x++) {
        const i = tileIndex(x, z);
        g.zone[i] = ZoneType.ComLow;
        g.power[i] = 1;
        g.watered[i] = 1;
        g.sewered[i] = 1;
      }
    }
    return g;
  }

  const onBlock = (g: GridState, x: number, z: number, w: number, d: number): boolean => {
    for (let dz = 0; dz < d; dz++) {
      for (let dx = 0; dx < w; dx++) {
        if (g.zone[tileIndex(x + dx, z + dz)] !== ZoneType.ComLow) return false;
      }
    }
    return true;
  };

  /** What grows on the block when the town is at `milestone` and the first kind in the draw is shown the lots. */
  function grown(
    g: GridState,
    milestone: number,
    registry = new BuildingRegistry(catalog),
    passes = 40,
  ): BuildingRegistry {
    const growth = new GrowthSystem(catalog, constantRng(0), onBlock);
    for (let pass = 0; pass < passes; pass++) {
      growth.tick(g, registry, wantsShops, milestone, pass * 10, UNMETERED_SUPPLY, UNLIMITED_ROOM);
    }
    return registry;
  }

  it('stands a corner shop on its roomy lot below Grand City, even on the best land', () => {
    const placed = grown(block(8, 3, 255), GRAND_CITY_MILESTONE - 1).all();
    expect(placed.length).toBeGreaterThan(0);
    for (const b of placed) expect(b.catalogId).toBe('com-low-1-lot1x2');
  });

  it('stands it on the compact lot from Grand City, on land of the best standing', () => {
    const placed = grown(block(8, 3, 255), GRAND_CITY_MILESTONE).all();
    expect(placed.length).toBeGreaterThan(0);
    for (const b of placed) expect(b.catalogId).toBe('com-low-1');
  });

  it('stands it on the roomy lot from Grand City on land under the best standing', () => {
    const placed = grown(block(8, 3, LOT_STANDING_FLOOR.acre - 1), GRAND_CITY_MILESTONE).all();
    expect(placed.length).toBeGreaterThan(0);
    for (const b of placed) expect(b.catalogId).toBe('com-low-1-lot1x2');
  });

  it('forces the compact lot where the block is too shallow for the roomy one, and still grows', () => {
    const placed = grown(block(8, 1, 100), 1).all();
    expect(placed.length).toBeGreaterThan(0);
    for (const b of placed) expect(b.catalogId).toBe('com-low-1');
  });

  it('leaves a building already standing on its lot', () => {
    const g = block(8, 3, 100);
    const registry = new BuildingRegistry(catalog);
    const first = registry.place(g, byId('com-low-1'), 1, 1, 0, BuildingState.Active)!;
    grown(g, 1, registry);
    const standing = registry.get(first.id)!;
    expect(standing.catalogId).toBe('com-low-1');
    expect(standing.x).toBe(1);
    const others = registry.all().filter((b) => b.id !== first.id);
    expect(others.length).toBeGreaterThan(0);
    for (const b of others) expect(b.catalogId).toBe('com-low-1-lot1x2');
  });
});

describe('a works grows on its roomy lot along either axis of its street', () => {
  const wantsWorks: DemandLevels = { res: 0, com: 0, ind: 1 };

  /** A street `length` tiles long with an Industrial block `depth` deep beside it, running east-west or north-south. */
  function strip(northSouth: boolean, length: number, depth: number): GridState {
    const g = createGrid();
    g.fields[FieldId.LandValue]!.fill(100);
    const at = (along: number, across: number): number =>
      northSouth ? tileIndex(across, along) : tileIndex(along, across);
    for (let i = 0; i < length + 2; i++) {
      g.roadTier[at(i, 0)] = RoadTier.TwoLane;
      g.roadMask[at(i, 0)] = northSouth
        ? (i > 0 ? 1 : 0) | (i < length + 1 ? 4 : 0)
        : (i > 0 ? 8 : 0) | (i < length + 1 ? 2 : 0);
    }
    for (let across = 1; across <= depth; across++) {
      for (let along = 1; along <= length; along++) {
        const i = at(along, across);
        g.zone[i] = ZoneType.Industrial;
        g.power[i] = 1;
        g.watered[i] = 1;
        g.sewered[i] = 1;
      }
    }
    return g;
  }

  const onWorks = (g: GridState, x: number, z: number, w: number, d: number): boolean => {
    for (let dz = 0; dz < d; dz++) {
      for (let dx = 0; dx < w; dx++) {
        if (g.zone[tileIndex(x + dx, z + dz)] !== ZoneType.Industrial) return false;
      }
    }
    return true;
  };

  function growOn(northSouth: boolean): string[] {
    const g = strip(northSouth, 12, 3);
    const depots = catalog.filter((e) => e.kind === 'warehouse');
    const registry = new BuildingRegistry(depots);
    const growth = new GrowthSystem(depots, constantRng(0), onWorks);
    for (let pass = 0; pass < 40; pass++) {
      growth.tick(g, registry, wantsWorks, 1, pass * 10, UNMETERED_SUPPLY, UNLIMITED_ROOM);
    }
    return registry.all().map((b) => b.catalogId);
  }

  it('stands the same roomy depots beside a north-south street as beside an east-west one', () => {
    const eastWest = growOn(false);
    const northSouth = growOn(true);
    expect(eastWest.length).toBeGreaterThan(0);
    for (const id of [...eastWest, ...northSouth]) expect(id).toBe('ind-warehouse-1-lot5x3');
    expect(northSouth.length).toBe(eastWest.length);
  });

  it('turns the works to its street and keeps the turn through a level-up', () => {
    const g = strip(true, 12, 3);
    g.fields[FieldId.LandValue]!.fill(255);
    const depots = catalog.filter((e) => e.kind === 'warehouse');
    const registry = new BuildingRegistry(depots);
    const growth = new GrowthSystem(depots, constantRng(0), onWorks);
    const levelUps: Record<string, number> = {};
    for (let pass = 0; pass < 400; pass++) {
      growth.tick(g, registry, wantsWorks, 1, pass * 10, UNMETERED_SUPPLY, UNLIMITED_ROOM);
    }
    for (const b of registry.all()) levelUps[b.catalogId] = (levelUps[b.catalogId] ?? 0) + 1;
    expect(registry.all().length).toBeGreaterThan(0);
    for (const b of registry.all()) {
      expect(b.rotation, b.catalogId).toBe(1);
    }
    expect(Object.keys(levelUps).some((id) => id.startsWith('ind-warehouse-2'))).toBe(true);
  });
});
