import { describe, expect, it } from 'vitest';
import { archetypeFor, hasPart, isCleanIndustry, partsFor } from './archetypes';
import { ZoneType, type BuildingCatalogEntry, type BuildingKind } from '../shared/types';
import catalogData from '../data/catalog.json';

function entry(over: Partial<BuildingCatalogEntry> = {}): BuildingCatalogEntry {
  return {
    id: 'x',
    name: 'X',
    category: 'ind',
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

describe('archetypeFor', () => {
  it('reads the industrial ladder off level and pollution', () => {
    expect(archetypeFor(entry({ level: 1, pollution: 60 }))).toBe('warehouse');
    expect(archetypeFor(entry({ level: 2, pollution: 90 }))).toBe('factory');
    expect(archetypeFor(entry({ level: 3, pollution: 0 }))).toBe('greenWorks');
  });

  // Clean industry is decided by what the building emits, not by its level or
  // its name — so the silhouette and the simulation cannot disagree.
  it('calls any non-polluting industry clean, whatever its level', () => {
    expect(isCleanIndustry(entry({ level: 1, pollution: 0 }))).toBe(true);
    expect(archetypeFor(entry({ level: 2, pollution: 0 }))).toBe('greenWorks');
    expect(isCleanIndustry(entry({ level: 3, pollution: 1 }))).toBe(false);
  });

  it('treats a missing pollution figure as clean, since it emits nothing', () => {
    expect(isCleanIndustry(entry({ level: 2 }))).toBe(true);
  });

  it('never calls a non-industrial building clean industry', () => {
    expect(isCleanIndustry(entry({ category: 'com' }))).toBe(false);
    expect(isCleanIndustry(entry({ category: 'park' }))).toBe(false);
  });

  it('reads a business off its kind: storefronts, a filling station, an office, a hotel', () => {
    const com = (kind: BuildingKind, level = 1) => entry({ category: 'com', kind, level });
    for (const kind of ['shop', 'strip', 'supermarket', 'restaurant'] as const) {
      expect(archetypeFor(com(kind))).toBe('storefront');
      expect(archetypeFor(com(kind, 3))).toBe('storefront');
    }
    expect(archetypeFor(com('fuel'))).toBe('fuelStation');
    expect(partsFor(com('fuel'))).toEqual(['fuelCanopy', 'pumps']);
    expect(archetypeFor(com('office', 3))).toBe('office');
    expect(partsFor(com('office'))).toEqual([]);
    expect(archetypeFor(com('hotel'))).toBe('hotel');
    expect(partsFor(com('hotel'))).toEqual(['canopy', 'signageBand']);
  });

  it('reads industry off its kind: light works by what they do, heavy plants by their industry', () => {
    const ind = (kind: BuildingKind, level = 1, pollution = 40) =>
      entry({ category: 'ind', kind, level, pollution });
    expect(archetypeFor(ind('workshop'))).toBe('workshop');
    expect(partsFor(ind('workshop'))).toEqual(['rollUpDoors']);
    expect(archetypeFor(ind('warehouse', 3))).toBe('warehouse');
    expect(archetypeFor(ind('factory', 1))).toBe('factory');
    expect(archetypeFor(ind('flex', 1, 0))).toBe('greenWorks');
    expect(archetypeFor(ind('foodplant'))).toBe('foodPlant');
    expect(partsFor(ind('foodplant'))).toEqual(['loadingDock', 'rollUpDoors']);
    expect(archetypeFor(ind('chemical'))).toBe('chemicalPlant');
    expect(partsFor(ind('chemical'))).toEqual(['tanks']);
    expect(archetypeFor(ind('metals'))).toBe('steelworks');
    expect(partsFor(ind('metals'))).toEqual(['monitorRoof']);
    expect(archetypeFor(ind('paper'))).toBe('paperMill');
    expect(partsFor(ind('paper'))).toEqual(['monitorRoof', 'tanks']);
  });

  it('splits commerce with no kind into a shopfront and a bigger block, as before', () => {
    expect(archetypeFor(entry({ category: 'com', level: 1 }))).toBe('storefront');
    expect(archetypeFor(entry({ category: 'com', level: 2 }))).toBe('retailBlock');
  });

  it('splits housing into pitched-roof homes and flat-topped density', () => {
    const res = (zone: ZoneType, kind: BuildingKind) => entry({ category: 'res', zone, kind });
    expect(archetypeFor(res(ZoneType.ResLow, 'detached'))).toBe('house');
    expect(archetypeFor(res(ZoneType.ResLow, 'duplex'))).toBe('house');
    expect(archetypeFor(res(ZoneType.ResLow, 'fourplex'))).toBe('house');
    expect(archetypeFor(res(ZoneType.ResMediumRow, 'townhouse'))).toBe('house');
    expect(archetypeFor(res(ZoneType.ResMedium, 'multiplex'))).toBe('apartment');
    expect(archetypeFor(res(ZoneType.ResMedium, 'garden'))).toBe('apartment');
    expect(archetypeFor(res(ZoneType.ResHigh, 'midrise'))).toBe('apartment');
    expect(archetypeFor(res(ZoneType.ResHigh, 'tower'))).toBe('apartment');
    expect(archetypeFor(res(ZoneType.Mixed, 'mixed'))).toBe('apartment');
  });

  it('says nothing about ground it does not own', () => {
    for (const category of ['utility', 'service', 'park'] as const) {
      expect(archetypeFor(entry({ category }))).toBe('plain');
      expect(partsFor(entry({ category }))).toEqual([]);
    }
  });
});

describe('partsFor', () => {
  it('gives a warehouse its dock and doors, and a factory its monitor roof', () => {
    expect(hasPart(entry({ level: 1, pollution: 60 }), 'loadingDock')).toBe(true);
    expect(hasPart(entry({ level: 2, pollution: 90 }), 'monitorRoof')).toBe(true);
  });

  // The point of the green works: it is the industrial building with no stack.
  it('gives clean industry a roof array and never a monitor roof', () => {
    const green = entry({ level: 3, pollution: 0 });
    expect(hasPart(green, 'roofArray')).toBe(true);
    expect(hasPart(green, 'monitorRoof')).toBe(false);
  });

  it('canopies a shopfront but not a retail block', () => {
    expect(hasPart(entry({ category: 'com', level: 1 }), 'canopy')).toBe(true);
    expect(hasPart(entry({ category: 'com', level: 2 }), 'canopy')).toBe(false);
    // Both are signed, though.
    expect(hasPart(entry({ category: 'com', level: 1 }), 'signageBand')).toBe(true);
    expect(hasPart(entry({ category: 'com', level: 2 }), 'signageBand')).toBe(true);
  });

  it('gives every archetype a distinct part set, so silhouettes differ', () => {
    const sets = new Set(
      [
        entry({ level: 1, pollution: 60 }),
        entry({ level: 2, pollution: 90 }),
        entry({ level: 3, pollution: 0 }),
        entry({ category: 'com', level: 1 }),
        entry({ category: 'com', level: 2 }),
      ].map((e) => partsFor(e).join('+')),
    );
    expect(sets.size).toBe(5);
  });
});

describe('the shipped catalog', () => {
  const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
  const byId = (id: string) => catalog.find((e) => e.id === id);
  // The Industrial zone's light kinds; farms count as industry but are a zone of their own.
  const industrial = catalog.filter((e) => e.zone === ZoneType.Industrial);

  it('draws every farm as a farm, never as the works its jobs count alongside', () => {
    const farms = catalog.filter((e) => e.zone === ZoneType.Agriculture);
    expect(farms).toHaveLength(9);
    for (const e of farms) {
      expect(archetypeFor(e)).toBe('farm');
      expect(partsFor(e)).toEqual([]);
      expect(isCleanIndustry(e)).toBe(false);
    }
  });

  it('carries the four light kinds: workshop, warehouse, factory and the clean flex building', () => {
    const found = new Set(industrial.map((e) => archetypeFor(e)));
    expect(found).toEqual(new Set(['workshop', 'warehouse', 'factory', 'greenWorks']));
  });

  it('dresses every heavy plant as its own industry', () => {
    const heavy = catalog.filter((e) => e.zone === ZoneType.IndHeavy);
    expect(heavy).toHaveLength(12);
    const found = new Set(heavy.map((e) => archetypeFor(e)));
    expect(found).toEqual(new Set(['foodPlant', 'chemicalPlant', 'steelworks', 'paperMill']));
    for (const e of heavy) expect(isCleanIndustry(e), e.id).toBe(false);
  });

  it('calls only what emits nothing clean: the flex buildings and the warehouses', () => {
    const clean = industrial.filter(isCleanIndustry);
    expect(new Set(clean.map((e) => e.kind))).toEqual(new Set(['flex', 'warehouse']));
    for (const e of clean) expect(e.pollution ?? 0).toBe(0);
  });

  it('makes the research campus, the clean top of the zone, the biggest employer of any light works', () => {
    const campus = byId('ind-3')!;
    expect(archetypeFor(campus)).toBe('greenWorks');
    for (const other of industrial.filter((e) => e.id !== campus.id)) {
      expect(campus.jobs ?? 0).toBeGreaterThan(other.jobs ?? 0);
    }
  });
});
