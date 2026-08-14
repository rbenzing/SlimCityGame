import { describe, expect, it } from 'vitest';
import { archetypeFor, hasPart, isCleanIndustry, partsFor } from './archetypes';
import { ZoneType, type BuildingCatalogEntry } from '../shared/types';
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

  it('splits commerce into a shopfront and a bigger block', () => {
    expect(archetypeFor(entry({ category: 'com', level: 1 }))).toBe('storefront');
    expect(archetypeFor(entry({ category: 'com', level: 2 }))).toBe('retailBlock');
  });

  it('splits housing into pitched-roof homes and flat-topped density', () => {
    expect(archetypeFor(entry({ category: 'res', zone: ZoneType.ResLow }))).toBe('house');
    expect(archetypeFor(entry({ category: 'res', zone: ZoneType.ResMediumRow }))).toBe('house');
    expect(archetypeFor(entry({ category: 'res', zone: ZoneType.ResHigh }))).toBe('apartment');
    expect(archetypeFor(entry({ category: 'res', zone: ZoneType.Mixed }))).toBe('apartment');
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
  const industrial = catalog.filter((e) => e.category === 'ind');

  it('carries the whole industrial ladder: warehouse, factory, green works', () => {
    const found = new Set(industrial.map((e) => archetypeFor(e)));
    expect(found).toEqual(new Set(['warehouse', 'factory', 'greenWorks']));
  });

  it('has exactly one clean industrial building, and it emits nothing', () => {
    const clean = industrial.filter(isCleanIndustry);
    expect(clean).toHaveLength(1);
    expect(clean[0]!.pollution ?? 0).toBe(0);
  });

  it('makes the clean one the top of the ladder, so it is something to grow into', () => {
    const clean = industrial.find(isCleanIndustry)!;
    for (const dirty of industrial.filter((e) => !isCleanIndustry(e))) {
      expect(clean.level ?? 1).toBeGreaterThan(dirty.level ?? 1);
      expect(clean.jobs ?? 0).toBeGreaterThan(dirty.jobs ?? 0);
    }
  });
});
