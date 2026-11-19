import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import { createRng } from '../core/rng';
import { BIG_TOWN_MILESTONE, tileIndex } from '../shared/constants';
import { EDUCATION_RUNGS } from '../shared/schooling';
import { BuildingState, FieldId, RoadTier, ZoneType } from '../shared/types';
import type { BuildingCatalogEntry, DemandLevels, GridState } from '../shared/types';
import { createGrid } from '../world/grid';
import { BuildingRegistry } from './buildings';
import { GrowthSystem, UNLIMITED_ROOM, UNMETERED_SUPPLY } from './growth';
import type { Rng } from './growth';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const byId = (id: string): BuildingCatalogEntry => catalog.find((e) => e.id === id)!;

const BUSY_TOWNSHIP = BIG_TOWN_MILESTONE - 1;
const SMALL_CITY = BIG_TOWN_MILESTONE + 1;
const GRAND_CITY = BIG_TOWN_MILESTONE + 2;
const METROPOLIS = BIG_TOWN_MILESTONE + 3;
const wants: DemandLevels = { res: 1, com: 1, ind: 1 };

function constantRng(value: number): Rng {
  const self: Rng = {
    next: () => value,
    int: (maxExclusive: number) => Math.floor(value * maxExclusive),
    range: (a: number, b: number) => a + value * (b - a),
    fork: () => constantRng(value),
  };
  return self;
}

/** A street along x at z = 0 with `zone` zoned and served on `width` by `depth` tiles south of it from x = 1. */
function block(zone: ZoneType, width: number, depth: number): GridState {
  const g = createGrid();
  g.fields[FieldId.LandValue]!.fill(255);
  for (const rung of EDUCATION_RUNGS) g.fields[rung.field]!.fill(255);
  for (let x = 0; x < width + 2; x++) {
    const i = tileIndex(x, 0);
    g.roadTier[i] = RoadTier.TwoLane;
    g.roadMask[i] = (x > 0 ? 8 : 0) | (x < width + 1 ? 2 : 0);
  }
  for (let z = 1; z <= depth; z++) {
    for (let x = 1; x <= width; x++) {
      const i = tileIndex(x, z);
      g.zone[i] = zone;
      g.power[i] = 1;
      g.watered[i] = 1;
      g.sewered[i] = 1;
    }
  }
  return g;
}

/** Runs growth `passes` times at `milestone`; a building stands where the block is zoned. */
function run(
  g: GridState,
  registry: BuildingRegistry,
  milestone: number,
  rng: Rng = constantRng(0),
  passes = 60,
): void {
  const zoned = (_: GridState, x: number, z: number, w: number, d: number): boolean => {
    for (let dz = 0; dz < d; dz++) {
      for (let dx = 0; dx < w; dx++)
        if (g.zone[tileIndex(x + dx, z + dz)] === ZoneType.None) return false;
    }
    return true;
  };
  const growth = new GrowthSystem(catalog, rng, zoned);
  for (let pass = 0; pass < passes; pass++) {
    growth.tick(g, registry, wants, milestone, pass * 10, UNMETERED_SUPPLY, UNLIMITED_ROOM);
  }
}

/** A building of `id` standing at (1, 1) on a block that is just its own tiles, and what it is after growth at `milestone`. */
function afterGrowth(id: string, zone: ZoneType, milestone: number): string {
  const entry = byId(id);
  const g = block(zone, entry.footprint.w, entry.footprint.d);
  const registry = new BuildingRegistry(catalog);
  registry.place(g, entry, 1, 1, 0, BuildingState.Active);
  run(g, registry, milestone);
  const standing = registry.all();
  expect(standing).toHaveLength(1);
  return standing[0]!.catalogId;
}

describe('a building that cannot spread goes up on the lot it has', () => {
  it('leaves a level-1 shop on its roomy 1x2 below Big Town, and rebuilds it as the built-in level 2 at Big Town', () => {
    expect(afterGrowth('com-low-1-lot1x2', ZoneType.ComLow, BUSY_TOWNSHIP)).toBe(
      'com-low-1-lot1x2',
    );
    expect(afterGrowth('com-low-1-lot1x2', ZoneType.ComLow, BIG_TOWN_MILESTONE)).toBe(
      'com-shop-2-up1x2',
    );
  });

  it('rebuilds a compact level-2 shop as the built-in level 3 where there is no ground, from Big Town', () => {
    expect(afterGrowth('com-shop-2', ZoneType.ComLow, BUSY_TOWNSHIP)).toBe('com-shop-2');
    expect(afterGrowth('com-shop-2', ZoneType.ComLow, BIG_TOWN_MILESTONE)).toBe('com-low-2-up1x2');
  });

  it('spreads a compact level-2 shop over free ground, never going up while it can spread', () => {
    const g = block(ZoneType.ComLow, 6, 4);
    const registry = new BuildingRegistry(catalog);
    registry.place(g, byId('com-shop-2'), 1, 1, 0, BuildingState.Active);
    run(g, registry, GRAND_CITY);
    const levelThrees = registry.all().filter((b) => b.level === 3);
    expect(levelThrees.length).toBeGreaterThan(0);
    for (const b of levelThrees) expect(byId(b.catalogId).stacked, b.catalogId).toBeUndefined();
  });

  it('builds the next level up again from its own lot, by the same order', () => {
    expect(afterGrowth('com-shop-2-up1x2', ZoneType.ComLow, BIG_TOWN_MILESTONE)).toBe(
      'com-low-2-up1x2',
    );
  });

  it('holds a mid-rise back while its form is over the ceiling, and builds it once the town allows it', () => {
    const form = byId('res-high-2-up1x2');
    expect(form.height).toBeGreaterThan(38.4);
    expect(afterGrowth('res-high-1', ZoneType.ResHigh, GRAND_CITY)).toBe('res-high-1');
    expect(afterGrowth('res-high-1', ZoneType.ResHigh, METROPOLIS)).toBe(form.id);
  });

  it('keeps a filling station on a full block, which cannot stack', () => {
    expect(afterGrowth('com-fuel-1', ZoneType.ComLow, METROPOLIS)).toBe('com-fuel-1');
  });

  it('brings the next level’s jobs and homes with it', () => {
    for (const [from, zone, spread] of [
      ['com-low-1-lot1x2', ZoneType.ComLow, 'com-shop-2'],
      ['res-high-1', ZoneType.ResHigh, 'res-high-2'],
    ] as const) {
      const built = byId(afterGrowth(from, zone, METROPOLIS));
      const next = byId(spread);
      expect(built.stacked, built.id).toBeDefined();
      expect(built.jobs, built.id).toBe(next.jobs);
      expect(built.units, built.id).toBe(next.units);
      expect(built.residents, built.id).toBe(next.residents);
    }
  });

  it('does the same from the same seed', () => {
    const outcome = (): string[] => {
      const g = block(ZoneType.ComLow, 6, 4);
      const registry = new BuildingRegistry(catalog);
      registry.place(g, byId('com-low-1-lot1x2'), 1, 1, 0, BuildingState.Active);
      registry.place(g, byId('com-shop-2'), 4, 1, 0, BuildingState.Active);
      run(g, registry, SMALL_CITY, createRng(7));
      return registry.all().map((b) => `${b.catalogId}@${b.x},${b.z}`);
    };
    expect(outcome()).toEqual(outcome());
  });
});
