import { describe, expect, it } from 'vitest';
import { tileIndex } from '../shared/constants';
import { BuildingState, FieldId, RoadTier, ZoneType } from '../shared/types';
import type { BuildingCatalogEntry, DemandLevels, GridState } from '../shared/types';
import catalogData from '../data/catalog.json';
import { BuildingRegistry } from './buildings';
import { GROWTH_INTERVAL, GrowthSystem } from './growth';
import type { Rng } from './growth';
import { createGrid } from '../world/grid';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const entryOf = (id: string): BuildingCatalogEntry => catalog.find((e) => e.id === id)!;

const SMALL_CITY = 4;
const GRAND_CITY = 5;
const demand: DemandLevels = { res: 0.5, com: 0.5, ind: 0.5 };

function constantRng(value: number): Rng {
  const self: Rng = {
    next: () => value,
    int: (maxExclusive: number) => Math.floor(value * maxExclusive),
    range: (a: number, b: number) => a + value * (b - a),
    fork: () => constantRng(value),
  };
  return self;
}

/** A serviced, zoned block around (x, z) with the best land value, so only the ceiling can hold a building back. */
function richBlock(x: number, z: number, zone: ZoneType): GridState {
  const g = createGrid();
  for (let dz = -1; dz <= 4; dz++) {
    for (let dx = -1; dx <= 4; dx++) {
      const idx = tileIndex(x + dx, z + dz);
      g.zone[idx] = zone;
      g.power[idx] = 1;
      g.watered[idx] = 1;
      g.sewered[idx] = 1;
      g.roadTier[idx] = RoadTier.TwoLane;
      g.fields[FieldId.LandValue]![idx] = 255;
    }
  }
  return g;
}

function passes(
  growth: GrowthSystem,
  g: GridState,
  registry: BuildingRegistry,
  milestone: number,
  count: number,
): void {
  for (let i = 0; i < count; i++) growth.tick(g, registry, demand, milestone, i * GROWTH_INTERVAL);
}

describe('storey ceilings in growth', () => {
  it('keeps a mid-rise at level 1 in a Small City however good the land', () => {
    const g = richBlock(5, 5, ZoneType.ResHigh);
    const registry = new BuildingRegistry(catalog);
    const flats = registry.place(g, entryOf('res-high-1'), 5, 5, 0, BuildingState.Active)!;
    const growth = new GrowthSystem(catalog, constantRng(0), () => true);

    passes(growth, g, registry, SMALL_CITY, 30);

    expect(registry.get(flats.id)?.catalogId).toBe('res-high-1');
    expect(registry.get(flats.id)?.level).toBe(1);
  });

  it('raises that mid-rise to level 2 (25.6 m) once the town is a Grand City', () => {
    const g = richBlock(5, 5, ZoneType.ResHigh);
    const registry = new BuildingRegistry(catalog);
    const flats = registry.place(g, entryOf('res-high-1'), 5, 5, 0, BuildingState.Active)!;
    const growth = new GrowthSystem(catalog, constantRng(0), () => true);

    passes(growth, g, registry, GRAND_CITY, 30);

    expect(registry.get(flats.id)).toBeUndefined();
    expect(registry.all().some((b) => b.catalogId === 'res-high-2')).toBe(true);
  });

  it('keeps a residential tower that an older save placed in a Small City, Active, through 50 passes', () => {
    const g = richBlock(5, 5, ZoneType.ResHigh);
    const registry = new BuildingRegistry(catalog);
    const tower = registry.place(g, entryOf('res-tower-1'), 5, 5, 0, BuildingState.Active)!;
    const growth = new GrowthSystem(catalog, constantRng(0), () => true);

    passes(growth, g, registry, SMALL_CITY, 50);

    const standing = registry.get(tower.id);
    expect(standing?.catalogId).toBe('res-tower-1');
    expect(standing?.state).toBe(BuildingState.Active);
  });
});
