import { describe, expect, it } from 'vitest';
import {
  archetypeFor,
  hasMansard,
  hasPart,
  isApartmentEntry,
  isCleanIndustry,
  isWalkUpEntry,
  partsFor,
} from './archetypes';
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
    expect(archetypeFor(com('office', 3))).toBe('office');
    expect(archetypeFor(com('hotel'))).toBe('hotel');
  });

  it('dresses each commercial kind with its own parts', () => {
    const com = (kind: BuildingKind, level = 1) => entry({ category: 'com', kind, level });
    expect(partsFor(com('shop'))).toEqual([
      'bulkhead',
      'awning',
      'signageBand',
      'cornice',
      'rooftopUnit',
      'roofHatch',
    ]);
    expect(partsFor(com('strip'))).toEqual([
      'stripCanopy',
      'stripColumn',
      'baseBand',
      'signageBand',
      'anchorParapet',
      'parapetStep',
      'pylon',
      'signPole',
      'rooftopUnit',
      'roofHatch',
    ]);
    expect(partsFor(com('supermarket'))).toEqual([
      'entryTower',
      'towerGlazing',
      'anchorParapet',
      'baseBand',
      'cartCorral',
      'dockScreen',
      'signPole',
      'signageBand',
      'rooftopUnit',
      'roofHatch',
    ]);
    expect(partsFor(com('restaurant'))).toEqual([
      'featureWall',
      'awning',
      'signageBand',
      'accentBand',
      'mansardBand',
      'menuBoard',
      'clearanceBar',
      'pickupCanopy',
      'dumpsterEnclosure',
      'pylon',
      'signPole',
      'rooftopUnit',
      'roofHatch',
    ]);
    expect(partsFor(com('fuel'))).toEqual([
      'fuelCanopy',
      'fuelFascia',
      'fuelIsland',
      'dispenser',
      'bollard',
      'priceSign',
      'signPole',
      'awning',
      'rooftopUnit',
      'roofHatch',
    ]);
    const office = ['lobbyPortal', 'ribbonBand', 'rooftopUnit', 'roofHatch'];
    expect(partsFor(com('office', 1))).toEqual(office);
    expect(partsFor(com('office', 2))).toEqual(office);
    expect(partsFor(com('hotel'))).toEqual([
      'porteCochere',
      'baseBand',
      'signageBand',
      'rooftopUnit',
      'roofHatch',
    ]);
  });

  it('swaps an office tower its rooftop units for a screen and a cooling tower, keeping its ribbon bands', () => {
    const tower = entry({ category: 'com', kind: 'office', level: 3 });
    expect(partsFor(tower)).toEqual([
      'lobbyPortal',
      'ribbonBand',
      'roofScreen',
      'coolingTower',
      'roofHatch',
    ]);
    expect(hasPart(tower, 'rooftopUnit')).toBe(false);
  });

  it('gives a restaurant the old form’s mansard band at level 1 only', () => {
    const com = (level: number) => entry({ category: 'com', kind: 'restaurant', level });
    expect(hasMansard(com(1))).toBe(true);
    expect(hasPart(com(1), 'mansardBand')).toBe(true);
    for (const level of [2, 3]) {
      expect(hasMansard(com(level))).toBe(false);
      expect(hasPart(com(level), 'mansardBand')).toBe(false);
      expect(hasPart(com(level), 'accentBand')).toBe(true);
    }
    expect(hasMansard(entry({ category: 'com', kind: 'shop', level: 1 }))).toBe(false);
  });

  it('holds every part the art table names for each commercial kind', () => {
    const named: Record<string, string[]> = {
      shop: ['bulkhead', 'awning', 'signageBand', 'cornice'],
      strip: ['stripCanopy', 'baseBand', 'signageBand', 'anchorParapet', 'parapetStep', 'pylon'],
      supermarket: ['entryTower', 'baseBand', 'cartCorral', 'dockScreen', 'signageBand'],
      restaurant: ['featureWall', 'menuBoard', 'accentBand', 'pylon', 'mansardBand'],
      fuel: ['fuelFascia', 'priceSign'],
      office: ['ribbonBand', 'lobbyPortal'],
      hotel: ['baseBand', 'porteCochere', 'signageBand'],
    };
    for (const [kind, parts] of Object.entries(named)) {
      const e = entry({ category: 'com', kind: kind as BuildingKind, level: 1 });
      for (const part of parts) expect(partsFor(e), `${kind} ${part}`).toContain(part);
    }
  });

  it('takes the flat canopy off a shop, which has awnings, and leaves a kindless storefront its canopy', () => {
    expect(hasPart(entry({ category: 'com', kind: 'shop', level: 1 }), 'canopy')).toBe(false);
    expect(hasPart(entry({ category: 'com', kind: 'shop', level: 1 }), 'awning')).toBe(true);
    expect(hasPart(entry({ category: 'com', level: 1 }), 'canopy')).toBe(true);
  });

  it('reads industry off its kind: light works by what they do, heavy plants by their industry', () => {
    const ind = (kind: BuildingKind, level = 1, pollution = 40) =>
      entry({ category: 'ind', kind, level, pollution });
    expect(archetypeFor(ind('workshop'))).toBe('workshop');
    expect(archetypeFor(ind('warehouse', 3))).toBe('warehouse');
    expect(archetypeFor(ind('factory', 1))).toBe('factory');
    expect(archetypeFor(ind('flex', 1, 0))).toBe('greenWorks');
    expect(archetypeFor(ind('foodplant'))).toBe('foodPlant');
    expect(archetypeFor(ind('chemical'))).toBe('chemicalPlant');
    expect(archetypeFor(ind('metals'))).toBe('steelworks');
    expect(archetypeFor(ind('paper'))).toBe('paperMill');
  });

  it('dresses each industrial kind with its own parts', () => {
    const ind = (kind: BuildingKind, level = 1, pollution = 40) =>
      entry({ category: 'ind', kind, level, pollution });
    const dockBank = [
      'loadingDock',
      'rollUpDoors',
      'dockShelter',
      'dockBumper',
      'dockLight',
      'officeCorner',
      'officeCanopy',
    ];
    expect(partsFor(ind('workshop'))).toEqual([
      'rollUpDoors',
      'walkDoor',
      'wainscot',
      'gutter',
      'downspout',
      'ridgeVent',
    ]);
    expect(partsFor(ind('warehouse', 2, 0))).toEqual([...dockBank, 'panelReveal', 'parapetBand']);
    expect(partsFor(ind('factory'))).toEqual([
      'monitorRoof',
      'clerestory',
      'rollUpDoors',
      'walkDoor',
      'wainscot',
      'gutter',
      'downspout',
    ]);
    expect(partsFor(ind('flex', 1, 0))).toEqual(['roofArray', 'entryCanopy', 'wainscot']);
    expect(partsFor(ind('foodplant'))).toEqual([...dockBank, 'condenser']);
    expect(partsFor(ind('chemical'))).toEqual([
      'tanks',
      'bundWall',
      'bullet',
      'pipeRack',
      'processColumn',
    ]);
    expect(partsFor(ind('metals'))).toEqual([
      'monitorRoof',
      'furnace',
      'stove',
      'skipBridge',
      'duct',
    ]);
    expect(partsFor(ind('paper'))).toEqual(['monitorRoof', 'tanks', 'chipPile', 'stacker']);
  });

  it('leaves a kindless industrial building the plain parts of its archetype', () => {
    expect(partsFor(entry({ level: 1, pollution: 60 }))).toEqual(['loadingDock', 'rollUpDoors']);
    expect(partsFor(entry({ level: 2, pollution: 90 }))).toEqual(['monitorRoof']);
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
    // The campus on a larger lot is the same building, with the same staff.
    const sameBuilding = (e: BuildingCatalogEntry): boolean =>
      e.id === campus.id ||
      (e.bodyFootprint !== undefined && e.kind === campus.kind && e.level === campus.level);
    for (const other of industrial.filter((e) => !sameBuilding(e))) {
      expect(campus.jobs ?? 0).toBeGreaterThan(other.jobs ?? 0);
    }
  });
});

describe('the apartment kit', () => {
  const res = (kind: BuildingKind, zone: ZoneType = ZoneType.ResMedium): BuildingCatalogEntry =>
    entry({ category: 'res', zone, kind, level: 1 });

  it('calls the four block kinds apartment blocks, and the multiplex and the garden walk-ups', () => {
    for (const kind of ['multiplex', 'garden', 'midrise', 'tower'] as const) {
      expect(isApartmentEntry(res(kind)), kind).toBe(true);
      expect(archetypeFor(res(kind)), kind).toBe('apartment');
    }
    for (const kind of ['detached', 'duplex', 'fourplex', 'townhouse', 'mixed'] as const) {
      expect(isApartmentEntry(res(kind)), kind).toBe(false);
    }
    expect(isWalkUpEntry(res('multiplex'))).toBe(true);
    expect(isWalkUpEntry(res('garden'))).toBe(true);
    expect(isWalkUpEntry(res('midrise'))).toBe(false);
    expect(isWalkUpEntry(res('tower'))).toBe(false);
  });

  it('dresses each apartment kind with its own parts', () => {
    expect(partsFor(res('multiplex'))).toEqual([
      'hipRoofBlock',
      'brickBase',
      'mailKiosk',
      'stoop',
      'entryHood',
      'signPole',
    ]);
    expect(partsFor(res('garden'))).toEqual([
      'hipRoofBlock',
      'brickBase',
      'mailKiosk',
      'breezeway',
      'landing',
      'landingGuard',
      'stairFlight',
      'balconySlab',
      'balconyGuard',
      'patio',
    ]);
    expect(partsFor(res('midrise', ZoneType.ResHigh))).toEqual([
      'bulkhead',
      'storefrontBand',
      'brickPier',
      'boxBay',
      'balconySlab',
      'balconyGuard',
      'parapetBand',
      'elevatorBulkhead',
      'rooftopUnit',
      'roofHatch',
    ]);
    expect(partsFor(res('tower', ZoneType.ResHigh))).toEqual([
      'lobbyPortal',
      'bulkhead',
      'storefrontBand',
      'brickPier',
      'balconySlab',
      'balconyGuard',
      'parapetBand',
      'penthouse',
    ]);
  });

  it('gives the four kinds four different silhouettes, and a kindless block none', () => {
    const sets = (['multiplex', 'garden', 'midrise', 'tower'] as const).map((k) =>
      partsFor(res(k)).join(','),
    );
    expect(new Set(sets).size).toBe(4);
    expect(partsFor(entry({ category: 'res', zone: ZoneType.ResHigh }))).toEqual([]);
  });

  it('dresses every apartment block in the shipped catalog', () => {
    const blocks = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings.filter((e) =>
      isApartmentEntry(e),
    );
    expect(blocks).toHaveLength(12);
    for (const e of blocks) expect(partsFor(e).length, e.id).toBeGreaterThan(0);
  });
});
