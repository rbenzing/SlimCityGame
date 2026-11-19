import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import { MODERN_LOOK_MIN_HEIGHT_M, isModernTall } from './modernlook';
import { MILESTONES, STOREY_CEILING_M } from './constants';
import { BuildingCatalogEntry, ZoneType } from './types';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;

function entry(over: Partial<BuildingCatalogEntry>): BuildingCatalogEntry {
  return {
    id: 'test',
    name: 'Test',
    category: 'res',
    zone: ZoneType.ResHigh,
    level: 2,
    footprint: { w: 2, d: 2 },
    height: 25.6,
    color: 0x888888,
    powerUse: 0,
    waterUse: 0,
    ...over,
  } as BuildingCatalogEntry;
}

describe('isModernTall', () => {
  it('starts above the Small City ceiling of six storeys', () => {
    const smallCity = MILESTONES.findIndex((m) => m.name === 'Small City');
    expect(MODERN_LOOK_MIN_HEIGHT_M).toBe(STOREY_CEILING_M[smallCity]);
    expect(MODERN_LOOK_MIN_HEIGHT_M).toBe(19.2);
  });

  it('is false at the ceiling and true a hair above it', () => {
    expect(isModernTall(entry({ height: 19.2 }))).toBe(false);
    expect(isModernTall(entry({ height: 19.21 }))).toBe(true);
    expect(isModernTall(entry({ height: 6.4 }))).toBe(false);
  });

  it('takes a zoned home, shop, office, hotel or mixed block of any kind or level', () => {
    expect(isModernTall(entry({ category: 'res', kind: 'midrise', level: 2 }))).toBe(true);
    expect(isModernTall(entry({ category: 'res', kind: 'tower', level: 1, height: 38.4 }))).toBe(
      true,
    );
    expect(
      isModernTall(entry({ category: 'res', zone: ZoneType.Mixed, kind: 'mixed', level: 3 })),
    ).toBe(true);
    expect(
      isModernTall(entry({ category: 'com', zone: ZoneType.ComLow, kind: 'shop', level: 1 })),
    ).toBe(true);
    expect(
      isModernTall(entry({ category: 'com', zone: ZoneType.ComHigh, kind: 'hotel', level: 3 })),
    ).toBe(true);
  });

  it('never takes industry, a farm, a civic building or a utility, however tall', () => {
    for (const category of ['ind', 'service', 'utility', 'transit', 'park'] as const) {
      expect(isModernTall(entry({ category, height: 80 })), category).toBe(false);
    }
    expect(isModernTall(entry({ category: 'ind', zone: ZoneType.IndHeavy, height: 60 }))).toBe(
      false,
    );
    expect(isModernTall(entry({ category: 'ind', zone: ZoneType.Agriculture, height: 40 }))).toBe(
      false,
    );
  });

  it('never takes a ploppable, which has no zone', () => {
    expect(isModernTall(entry({ category: 'res', zone: undefined, height: 40 }))).toBe(false);
  });

  it('marks exactly the zoned homes and businesses over the ceiling in the catalog', () => {
    const modern = catalog.filter(isModernTall);
    expect(modern.length).toBeGreaterThan(0);
    for (const e of catalog) {
      const expected =
        (e.category === 'res' || e.category === 'com') &&
        e.zone !== undefined &&
        e.height > STOREY_CEILING_M[4]!;
      expect(isModernTall(e), e.id).toBe(expected);
    }
    for (const e of modern) expect(e.height, e.id).toBeGreaterThan(19.2);
  });
});
