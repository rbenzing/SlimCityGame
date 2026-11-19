import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import { createRng } from '../core/rng';
import { tileIndex } from '../shared/constants';
import { FieldId, RoadTier, ZoneType } from '../shared/types';
import type { BuildingCatalogEntry, DemandLevels, GridState } from '../shared/types';
import { createGrid } from '../world/grid';
import { platOf, platSourceOf } from '../world/plat';
import { yardTilesOf } from '../world/yard';
import { BuildingRegistry } from './buildings';
import { GrowthSystem, UNLIMITED_ROOM, UNMETERED_SUPPLY } from './growth';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const wants: DemandLevels = { res: 1, com: 0, ind: 0 };
const SMALL_TOWN = 1;

/** A street along z = 0, ResLow zoned three deep south of it and served, poor land to the west and ordinary land to the east. */
function street(): GridState {
  const g = createGrid();
  const land = g.fields[FieldId.LandValue]!;
  for (let x = 0; x < 20; x++) {
    const i = tileIndex(x, 0);
    g.roadTier[i] = RoadTier.TwoLane;
    g.roadMask[i] = (x > 0 ? 8 : 0) | (x < 19 ? 2 : 0);
  }
  for (let z = 1; z <= 3; z++) {
    for (let x = 1; x <= 18; x++) {
      const i = tileIndex(x, z);
      g.zone[i] = ZoneType.ResLow;
      g.power[i] = 1;
      g.watered[i] = 1;
      g.sewered[i] = 1;
      land[i] = x < 10 ? 20 : 119;
    }
  }
  return g;
}

function grow(g: GridState): BuildingRegistry {
  const registry = new BuildingRegistry(catalog);
  const growth = new GrowthSystem(catalog, createRng(7), (_, x, z, w, d) => {
    for (let dz = 0; dz < d; dz++) {
      for (let dx = 0; dx < w; dx++)
        if (g.zone[tileIndex(x + dx, z + dz)] === ZoneType.None) return false;
    }
    return true;
  });
  for (let pass = 0; pass < 120; pass++) {
    growth.tick(g, registry, wants, SMALL_TOWN, pass * 10, UNMETERED_SUPPLY, UNLIMITED_ROOM);
  }
  return registry;
}

const standing = (registry: BuildingRegistry): string[] =>
  registry
    .all()
    .map((b) => `${b.catalogId}@${b.x},${b.z}`)
    .sort();

describe('growth beside a yard', () => {
  it('never builds on a tile that is a lot’s yard, and never differs for the yards being known', () => {
    const g = street();
    const plat = platOf(platSourceOf(g, null, g.fields[FieldId.LandValue]), ZoneType.ResLow);
    const src = platSourceOf(g, null, g.fields[FieldId.LandValue]);
    const yards = plat.parcels.flatMap((p) => yardTilesOf(src, p));
    expect(yards.length).toBeGreaterThan(0);
    const before = standing(grow(g));
    expect(before.length).toBeGreaterThan(0);
    for (const t of yards) expect(g.buildingId[tileIndex(t.x, t.z)], `${t.x},${t.z}`).toBe(0);
    // The same street grown again, with the yards read from the finished town in between, builds the same homes.
    const again = street();
    yardTilesOf(platSourceOf(again, null, again.fields[FieldId.LandValue]), plat.parcels[0]!);
    expect(standing(grow(again))).toEqual(before);
  });
});
