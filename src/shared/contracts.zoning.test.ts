/**
 * Zoning types expansion contract: the three appended ZoneType values
 * (ResMediumRow=6, ResMedium=7, Mixed=8) and
 * the catalog entries that let them grow real buildings, plus the ResHigh/
 * ComHigh milestone retune that turns the 5-zone model into the fuller
 * city-builder progression.
 *
 * SAVE-SAFETY is the load-bearing invariant here: ZoneType numbers 1–5 are
 * serialized into grid.zone bytes, saves, and ZonePatch — this suite pins
 * them so a future reorder can never silently corrupt saves. New zones only
 * ever APPEND.
 *
 * Type-level guarantees are enforced by `npx tsc --noEmit` over this file
 * (vitest transpiles without type-checking); runtime asserts pin the
 * prescribed values.
 */
import { describe, expect, it } from 'vitest';

import type {
  BuildingCatalogEntry,
  CommercialKind,
  IndustrialKind,
  LotSize,
  ResidentialKind,
} from './types';
import { ZoneType } from './types';
import { MILESTONES } from './constants';
import catalogData from '../data/catalog.json';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const byId = (id: string) => catalog.find((e) => e.id === id);

/** RGB channel split of a packed 0xRRGGBB catalog color. */
function rgb(color: number): { r: number; g: number; b: number } {
  return { r: (color >> 16) & 0xff, g: (color >> 8) & 0xff, b: color & 0xff };
}

describe('ZoneType expansion (UI-SPEC §6.21) — SAVE-SAFE append', () => {
  it('keeps the persisted zone numbers 1–5 EXACTLY (grid.zone bytes / saves / ZonePatch)', () => {
    expect(ZoneType.None).toBe(0);
    expect(ZoneType.ResLow).toBe(1);
    expect(ZoneType.ResHigh).toBe(2);
    expect(ZoneType.ComLow).toBe(3);
    expect(ZoneType.ComHigh).toBe(4);
    expect(ZoneType.Industrial).toBe(5);
  });

  it('appends the three new zones at 6/7/8, farmland at 9 and heavy industry at 10', () => {
    expect(ZoneType.ResMediumRow).toBe(6);
    expect(ZoneType.ResMedium).toBe(7);
    expect(ZoneType.Mixed).toBe(8);
    expect(ZoneType.Agriculture).toBe(9);
    expect(ZoneType.IndHeavy).toBe(10);
  });

  it('assigns every zone a unique number (no collision after the append)', () => {
    const values = Object.values(ZoneType);
    expect(new Set(values).size).toBe(values.length);
    // All fit in a Uint8 zone byte.
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });
});

/** Every residential kind, the zone it grows in, when, who lives in it and what a home draws. */
const RESIDENTIAL_KINDS: ReadonlyArray<{
  kind: ResidentialKind;
  lot?: LotSize;
  /** The lot turned a quarter, for a street running north to south. */
  turned?: boolean;
  zone: ZoneType;
  unlock: number;
  share: number;
  household: number;
  kwPerHome: number;
  lots: ReadonlyArray<readonly [number, number]>;
  house: boolean;
}> = [
  ...(
    [
      ['half', 1, 1, false],
      ['normal', 1, 2, false],
      ['normal', 2, 1, true],
      ['double', 2, 2, false],
      ['estate', 2, 3, false],
      ['estate', 3, 2, true],
    ] as const
  ).map(([lot, w, d, turned]) => ({
    kind: 'detached' as const,
    lot,
    turned,
    zone: ZoneType.ResLow,
    unlock: 0,
    share: 61.1,
    household: 2.63,
    kwPerHome: 1.4,
    // A lot is platted once: all three levels stand on it.
    lots: [
      [w, d],
      [w, d],
      [w, d],
    ] as const,
    house: true,
  })),
  ...(
    [
      ['duplex', 1.6],
      ['fourplex', 1.2],
    ] as const
  ).flatMap(([kind, share]) =>
    (
      [
        ['half', 1, 1, false],
        ['normal', 1, 2, false],
        ['normal', 2, 1, true],
      ] as const
    ).map(([lot, w, d, turned]) => ({
      kind,
      lot,
      turned,
      zone: ZoneType.ResLow,
      unlock: 1,
      share,
      household: 2.26,
      kwPerHome: 0.76,
      // A lot is platted once: all three levels stand on it.
      lots: [
        [w, d],
        [w, d],
        [w, d],
      ] as const,
      house: true,
    })),
  ),
  {
    kind: 'townhouse',
    zone: ZoneType.ResMediumRow,
    unlock: 1,
    share: 1.6,
    household: 2.63,
    kwPerHome: 0.97,
    lots: [
      [1, 2],
      [1, 4],
      [1, 6],
    ],
    house: true,
  },
  {
    kind: 'multiplex',
    lot: 'normal',
    zone: ZoneType.ResMedium,
    unlock: 2,
    share: 0.63,
    household: 2.26,
    kwPerHome: 0.7,
    // Two normal parcels side by side.
    lots: [
      [2, 2],
      [2, 2],
      [2, 2],
    ],
    house: false,
  },
  {
    kind: 'garden',
    lot: 'normal',
    zone: ZoneType.ResMedium,
    unlock: 2,
    share: 0.3,
    household: 2.26,
    kwPerHome: 0.7,
    lots: [
      [2, 2],
      [2, 2],
      [2, 2],
    ],
    house: false,
  },
  {
    kind: 'midrise',
    zone: ZoneType.ResHigh,
    unlock: 4,
    share: 0.11,
    household: 2.26,
    kwPerHome: 0.7,
    lots: [
      [2, 2],
      [2, 2],
      [3, 3],
    ],
    house: false,
  },
  {
    kind: 'tower',
    zone: ZoneType.ResHigh,
    unlock: 4,
    share: 0.07,
    household: 2.26,
    kwPerHome: 0.7,
    lots: [
      [2, 2],
      [2, 2],
      [3, 3],
    ],
    house: false,
  },
  {
    kind: 'mixed',
    zone: ZoneType.Mixed,
    unlock: 3,
    share: 1,
    household: 2.26,
    kwPerHome: 0.7,
    lots: [
      [2, 2],
      [2, 2],
      [3, 3],
    ],
    house: false,
  },
];

/** A person's 90 US gallons a day, and an employee's 27.5, in kL. */
const WATER_PER_PERSON_KL = 0.34;
const WATER_PER_JOB_KL = 0.104;
/** A retail floor's draw: 16.7 kWh per square foot a year on a 740 or 1,665 m² plate. */
const RETAIL_FLOOR_KW: Readonly<Record<number, number>> = { 2: 15.2, 3: 34.2 };

const SQ_FT_PER_M2 = 10.764;
const HOURS_PER_YEAR = 8760;
/** Net floor is 80% of the plate; a shop job takes 17.5 m² of it, an office job 13. */
const NET_FLOOR = 0.8;
const RETAIL_M2_PER_JOB = 17.5;
const OFFICE_M2_PER_JOB = 13;
/** A hotel room is 52 m² gross; its staff by class is one per 5, 3 or 2 rooms. */
const HOTEL_M2_PER_ROOM = 52;
const HOTEL_ROOMS_PER_JOB = [5, 3, 2];
const HOTEL_WATER_PER_ROOM_KL = 0.5;
const RESTAURANT_WATER_KL = [7.3, 22.0, 44.0];

/** Every commercial kind: zone, unlock, weight, the survey's kWh per square foot, and each level's lot, body plate and storeys. */
const COMMERCIAL_KINDS: ReadonlyArray<{
  kind: CommercialKind;
  zone: ZoneType;
  unlock: number;
  share: number;
  kwhPerSqFt: number;
  lots: ReadonlyArray<readonly [number, number]>;
  /** The body's plate in m² at each level, from the kind's body rule. */
  plates: readonly number[];
  storeys: readonly number[];
}> = [
  {
    kind: 'shop',
    zone: ZoneType.ComLow,
    unlock: 0,
    share: 350,
    kwhPerSqFt: 16.7,
    lots: [
      [1, 1],
      [1, 2],
      [2, 2],
    ],
    plates: [185, 370, 740],
    storeys: [1, 1, 1],
  },
  {
    kind: 'restaurant',
    zone: ZoneType.ComLow,
    unlock: 0,
    share: 286,
    kwhPerSqFt: 44.2,
    lots: [
      [1, 2],
      [2, 2],
      [3, 2],
    ],
    plates: [326.4, 576, 576],
    storeys: [1, 1, 2],
  },
  {
    kind: 'fuel',
    zone: ZoneType.ComLow,
    unlock: 0,
    share: 123,
    kwhPerSqFt: 53.3,
    lots: [
      [2, 2],
      [3, 2],
      [3, 3],
    ],
    plates: [196, 224, 256],
    storeys: [1, 1, 1],
  },
  {
    kind: 'strip',
    zone: ZoneType.ComLow,
    unlock: 1,
    share: 166,
    kwhPerSqFt: 16.7,
    lots: [
      [3, 2],
      [4, 2],
      [5, 2],
    ],
    plates: [1110, 1480, 1850],
    storeys: [1, 1, 1],
  },
  {
    kind: 'supermarket',
    zone: ZoneType.ComLow,
    unlock: 1,
    share: 46,
    kwhPerSqFt: 16.7,
    lots: [
      [3, 3],
      [4, 3],
      [5, 4],
    ],
    plates: [1665, 2220, 3699],
    storeys: [1, 1, 1],
  },
  {
    kind: 'office',
    zone: ZoneType.ComHigh,
    unlock: 4,
    share: 970,
    kwhPerSqFt: 13.6,
    lots: [
      [2, 2],
      [3, 3],
      [3, 3],
    ],
    plates: [740, 1665, 1665],
    storeys: [5, 8, 16],
  },
  {
    kind: 'hotel',
    zone: ZoneType.ComHigh,
    unlock: 4,
    share: 107,
    kwhPerSqFt: 14.4,
    lots: [
      [2, 2],
      [2, 2],
      [3, 3],
    ],
    plates: [740, 740, 1665],
    storeys: [4, 6, 8],
  },
];

/** A US gallon in kL, as the catalog's water figures were derived. */
const GAL_TO_KL = 0.003785;
/** Grid electricity per job a year by sector, MECS 2018 (Table 6.1 per employee × Table 3.2's electricity share). */
const KWH_PER_JOB: Readonly<Record<string, number>> = {
  machinery: 22_600,
  fabricated: 24_900,
  food: 62_600,
  chemicals: 193_200,
  metals: 273_500,
  paper: 161_800,
};
/** Water per job a working day by sector, US gallons (Pacific Institute 2003, table C-1). */
const GAL_PER_JOB: Readonly<Record<string, number>> = {
  machinery: 110,
  fabricated: 738,
  food: 1967,
  chemicals: 833,
  metals: 1318,
  paper: 1000,
};
/** TRI 2023 releases per reporting facility by sector, thousand pounds a year. */
const KLB_PER_PLANT: Readonly<Record<string, number>> = {
  machinery: 7.2,
  fabricated: 13.5,
  food: 88.6,
  chemicals: 119.9,
  metals: 210.7,
  paper: 416.3,
};
/** The pollution scale: the average TRI electric utility's 484,000 lb a year is the coal plant's 140. */
const POLLUTION_PER_KLB = 140 / 484;
/** A warehouse draws 5.8 kWh per square foot a year (CBECS), a flex building half office and half warehouse. */
const WAREHOUSE_KWH_PER_SQFT = 5.8;
const FLEX_KWH_PER_SQFT = (13.6 + 5.8) / 2;
/** 75 dBA at the property line against a motorway at capacity taken as 80: 10^(−5/10) of its 120; a loading dock's 68 dB, 10^(−12/10). */
const INDUSTRIAL_NOISE = 38;
const DOCK_NOISE = 8;

/** Every industrial kind: zone, unlock, weight, the sector its draw and releases follow, and each level's lot, plate, storeys and height. */
const INDUSTRIAL_KINDS: ReadonlyArray<{
  kind: IndustrialKind;
  zone: ZoneType;
  unlock: number;
  share: number;
  /** The MECS / Pacific Institute / TRI sector the kind draws and emits like; null where it draws per square foot and emits nothing. */
  sector: string | null;
  /** Gross floor per job at each level (HCA Employment Density Guide). */
  m2PerJob: readonly number[];
  lots: ReadonlyArray<readonly [number, number]>;
  plates: readonly number[];
  storeys: readonly number[];
  heights: readonly number[];
  noise: number;
}> = [
  {
    kind: 'workshop',
    zone: ZoneType.Industrial,
    unlock: 0,
    share: 22,
    sector: 'machinery',
    m2PerJob: [47, 47, 47],
    lots: [
      [2, 2],
      [3, 2],
      [3, 3],
    ],
    plates: [740, 1110, 1665],
    storeys: [1, 1, 1],
    heights: [6.1, 6.1, 6.1],
    noise: INDUSTRIAL_NOISE,
  },
  {
    kind: 'warehouse',
    zone: ZoneType.Industrial,
    unlock: 0,
    share: 55,
    sector: null,
    m2PerJob: [70, 77, 95],
    lots: [
      [3, 3],
      [4, 3],
      [5, 4],
    ],
    plates: [1665, 2220, 3699],
    storeys: [1, 1, 1],
    heights: [7.3, 9.8, 12.2],
    noise: DOCK_NOISE,
  },
  {
    kind: 'factory',
    zone: ZoneType.Industrial,
    unlock: 1,
    share: 8,
    sector: 'fabricated',
    m2PerJob: [36, 36, 36],
    lots: [
      [2, 3],
      [3, 3],
      [4, 3],
    ],
    plates: [1110, 1665, 2220],
    storeys: [1, 1, 1],
    heights: [6.1, 7.3, 7.3],
    noise: INDUSTRIAL_NOISE,
  },
  {
    kind: 'flex',
    zone: ZoneType.Industrial,
    unlock: 3,
    share: 9,
    sector: null,
    m2PerJob: [50, 50, 50],
    lots: [
      [2, 2],
      [3, 2],
      [3, 4],
    ],
    plates: [484, 726, 1452],
    storeys: [2, 2, 3],
    heights: [6.4, 6.4, 9.6],
    noise: 0,
  },
  {
    kind: 'foodplant',
    zone: ZoneType.IndHeavy,
    unlock: 2,
    share: 43,
    sector: 'food',
    m2PerJob: [36, 36, 36],
    lots: [
      [3, 3],
      [4, 3],
      [5, 4],
    ],
    plates: [1665, 2220, 3699],
    storeys: [1, 1, 1],
    heights: [8, 9, 10],
    noise: INDUSTRIAL_NOISE,
  },
  {
    kind: 'chemical',
    zone: ZoneType.IndHeavy,
    unlock: 2,
    share: 26,
    sector: 'chemicals',
    m2PerJob: [36, 36, 36],
    lots: [
      [3, 3],
      [4, 4],
      [5, 4],
    ],
    plates: [900, 1600, 2000],
    storeys: [1, 1, 1],
    heights: [10, 12, 15],
    noise: INDUSTRIAL_NOISE,
  },
  {
    kind: 'metals',
    zone: ZoneType.IndHeavy,
    unlock: 2,
    share: 6,
    sector: 'metals',
    m2PerJob: [36, 36, 36],
    lots: [
      [3, 3],
      [4, 3],
      [5, 3],
    ],
    plates: [1665, 2220, 2775],
    storeys: [1, 1, 1],
    heights: [12, 15, 18],
    noise: INDUSTRIAL_NOISE,
  },
  {
    kind: 'paper',
    zone: ZoneType.IndHeavy,
    unlock: 2,
    share: 6,
    sector: 'paper',
    m2PerJob: [36, 36, 36],
    lots: [
      [3, 3],
      [4, 4],
      [5, 4],
    ],
    plates: [1665, 2960, 3699],
    storeys: [1, 1, 1],
    heights: [10, 13, 15],
    noise: INDUSTRIAL_NOISE,
  },
];

describe('Residential kinds (building-types): three levels per kind, every figure derived', () => {
  const ofKind = (kind: ResidentialKind, lot?: LotSize, turned = false) =>
    catalog
      .filter((e) => e.kind === kind && e.lot === lot && e.id.includes('-t-') === turned)
      .sort((a, b) => (a.level ?? 0) - (b.level ?? 0));

  it('gives every residential and farm entry a kind and its homes', () => {
    for (const e of catalog) {
      if (e.zone === undefined) continue;
      if (e.category !== 'res' && e.zone !== ZoneType.Agriculture) continue;
      expect(e.kind, e.id).toBeDefined();
      expect(e.units, e.id).toBeGreaterThan(0);
    }
  });

  it.each(RESIDENTIAL_KINDS)('$kind: three levels in one zone, unlocked together', (k) => {
    const levels = ofKind(k.kind, k.lot, k.turned);
    expect(levels.map((e) => e.level)).toEqual([1, 2, 3]);
    for (const e of levels) {
      expect(e.zone).toBe(k.zone);
      expect(e.category).toBe('res');
      expect(e.unlockMilestone).toBe(k.unlock);
      expect(e.cost).toBe(0);
      expect(e.upkeep).toBe(0);
    }
  });

  it.each(RESIDENTIAL_KINDS)('$kind: carries its draw weight on its first level only', (k) => {
    const [first, ...rest] = ofKind(k.kind, k.lot, k.turned);
    expect(first!.share).toBe(k.share);
    for (const e of rest) expect(e.share).toBeUndefined();
  });

  it.each(RESIDENTIAL_KINDS)('$kind: takes the lots its type takes', (k) => {
    expect(ofKind(k.kind, k.lot, k.turned).map((e) => [e.footprint.w, e.footprint.d])).toEqual(
      k.lots,
    );
  });

  it.each(RESIDENTIAL_KINDS)('$kind: residents are its homes times the household, rounded', (k) => {
    for (const e of ofKind(k.kind, k.lot, k.turned)) {
      // To the cent first, so 375 × 2.26 = 847.5 rounds up and not on float noise.
      expect(e.residents).toBe(Math.round(Number((e.units! * k.household).toFixed(2))));
    }
  });

  it.each(RESIDENTIAL_KINDS)('$kind: draws per home what the energy survey says', (k) => {
    for (const e of ofKind(k.kind, k.lot, k.turned)) {
      const retail = k.kind === 'mixed' ? RETAIL_FLOOR_KW[e.footprint.w]! : 0;
      const expectedMW = (e.units! * k.kwPerHome + retail) / 1000;
      expect(Math.abs(e.powerUse - expectedMW), e.id).toBeLessThanOrEqual(0.0001);
    }
  });

  it.each(RESIDENTIAL_KINDS)('$kind: draws water for every resident, and every shop job', (k) => {
    for (const e of ofKind(k.kind, k.lot, k.turned)) {
      const expectedKL = e.residents! * WATER_PER_PERSON_KL + (e.jobs ?? 0) * WATER_PER_JOB_KL;
      expect(Math.abs(e.waterUse - expectedKL), e.id).toBeLessThanOrEqual(0.06);
    }
  });

  it('adds homes with each level of a block, and keeps one household in a house', () => {
    for (const k of RESIDENTIAL_KINDS) {
      const [l1, l2, l3] = ofKind(k.kind, k.lot, k.turned);
      if (k.house && k.kind !== 'townhouse') {
        expect(new Set([l1!.units, l2!.units, l3!.units]).size).toBe(1);
      } else {
        expect(l1!.units!).toBeLessThan(l2!.units!);
        expect(l2!.units!).toBeLessThan(l3!.units!);
      }
    }
  });

  it('weights the draw by the real stock: detached houses first, towers rarest', () => {
    const weight = (kind: ResidentialKind) =>
      catalog.find((e) => e.kind === kind && e.level === 1)!.share!;
    expect(weight('detached')).toBeGreaterThan(weight('duplex'));
    expect(weight('duplex')).toBeGreaterThan(weight('fourplex'));
    expect(weight('multiplex')).toBeGreaterThan(weight('garden'));
    expect(weight('midrise')).toBeGreaterThan(weight('tower'));
  });

  it('keeps the old ids, so a saved city loads into the new kinds', () => {
    expect(byId('res-low-1')!.kind).toBe('detached');
    expect(byId('res-medium-row-1')!.kind).toBe('townhouse');
    expect(byId('res-medium-1')!.kind).toBe('garden');
    expect(byId('res-high-1')!.kind).toBe('midrise');
    expect(byId('mixed-1')!.kind).toBe('mixed');
  });
});

describe('Commercial kinds (building-types): three levels per kind, every figure derived', () => {
  const ofKind = (kind: CommercialKind) =>
    catalog.filter((e) => e.kind === kind).sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
  const floorM2 = (k: (typeof COMMERCIAL_KINDS)[number], i: number) => k.plates[i]! * k.storeys[i]!;

  it('gives every commercial entry a kind, and keeps the corner shop first for the demand span', () => {
    const com = catalog.filter((e) => e.category === 'com');
    for (const e of com) expect(e.kind, e.id).toBeDefined();
    expect(com.find((e) => e.zone === ZoneType.ComLow)!.id).toBe('com-low-1');
    expect(byId('com-low-1')!.kind).toBe('shop');
    expect(byId('com-low-2')!.kind).toBe('shop');
    expect(byId('com-high-1')!.kind).toBe('office');
    expect(byId('com-high-2')!.kind).toBe('office');
  });

  it.each(COMMERCIAL_KINDS)('$kind: three levels in one zone, unlocked together', (k) => {
    const levels = ofKind(k.kind);
    expect(levels.map((e) => e.level)).toEqual([1, 2, 3]);
    for (const e of levels) {
      expect(e.zone).toBe(k.zone);
      expect(e.category).toBe('com');
      expect(e.unlockMilestone).toBe(k.unlock);
      expect(e.residents).toBeUndefined();
      expect(e.cost).toBe(0);
    }
    expect(levels[0]!.share).toBe(k.share);
    expect(levels[1]!.share).toBeUndefined();
    expect(levels[2]!.share).toBeUndefined();
  });

  it.each(COMMERCIAL_KINDS)('$kind: takes the lots and storeys its type takes', (k) => {
    const levels = ofKind(k.kind);
    expect(levels.map((e) => [e.footprint.w, e.footprint.d])).toEqual(k.lots);
    for (const [i, e] of levels.entries()) {
      expect(Math.max(1, Math.round(e.height / 3.2)), e.id).toBe(k.storeys[i]);
    }
  });

  it.each(COMMERCIAL_KINDS)('$kind: jobs are its net floor at the density guide', (k) => {
    for (const [i, e] of ofKind(k.kind).entries()) {
      const floor = floorM2(k, i);
      const expected =
        k.kind === 'office'
          ? Math.round((floor * NET_FLOOR) / OFFICE_M2_PER_JOB)
          : k.kind === 'hotel'
            ? Math.floor(Math.round(floor / HOTEL_M2_PER_ROOM) / HOTEL_ROOMS_PER_JOB[i]!)
            : Math.round((floor * NET_FLOOR) / RETAIL_M2_PER_JOB);
      expect(e.jobs, e.id).toBe(expected);
    }
  });

  it.each(COMMERCIAL_KINDS)('$kind: draws per square foot what the survey says', (k) => {
    for (const [i, e] of ofKind(k.kind).entries()) {
      const kw = (floorM2(k, i) * SQ_FT_PER_M2 * k.kwhPerSqFt) / HOURS_PER_YEAR;
      expect(Math.abs(e.powerUse - kw / 1000), e.id).toBeLessThanOrEqual(0.0003);
    }
  });

  it.each(COMMERCIAL_KINDS)('$kind: draws water for its staff, its diners or its rooms', (k) => {
    for (const [i, e] of ofKind(k.kind).entries()) {
      const expected =
        k.kind === 'restaurant'
          ? RESTAURANT_WATER_KL[i]!
          : k.kind === 'hotel'
            ? Math.round(floorM2(k, i) / HOTEL_M2_PER_ROOM) * HOTEL_WATER_PER_ROOM_KL
            : e.jobs! * WATER_PER_JOB_KL;
      expect(Math.abs(e.waterUse - expected), e.id).toBeLessThanOrEqual(0.06);
    }
  });

  it('adds jobs with every level of every business', () => {
    for (const k of COMMERCIAL_KINDS) {
      const [l1, l2, l3] = ofKind(k.kind);
      expect(l1!.jobs!).toBeLessThan(l2!.jobs!);
      expect(l2!.jobs!).toBeLessThan(l3!.jobs!);
    }
  });
});

describe('Industrial kinds (building-types): three levels per kind, every figure derived', () => {
  const ofKind = (kind: IndustrialKind) =>
    catalog.filter((e) => e.kind === kind).sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
  const floorM2 = (k: (typeof INDUSTRIAL_KINDS)[number], i: number) => k.plates[i]! * k.storeys[i]!;

  it('gives every works a kind, and keeps the workshop yard first for the demand span', () => {
    const works = catalog.filter(
      (e) => e.category === 'ind' && e.zone !== undefined && e.zone !== ZoneType.Agriculture,
    );
    for (const e of works) expect(e.kind, e.id).toBeDefined();
    expect(works.find((e) => e.zone === ZoneType.Industrial)!.id).toBe('ind-1');
    expect(byId('ind-1')!.kind).toBe('workshop');
    expect(byId('ind-2')!.kind).toBe('factory');
    expect(byId('ind-3')!.kind).toBe('flex');
    expect(works.filter((e) => e.zone === ZoneType.IndHeavy).map((e) => e.kind)).toEqual([
      ...Array(3).fill('foodplant'),
      ...Array(3).fill('chemical'),
      ...Array(3).fill('metals'),
      ...Array(3).fill('paper'),
    ]);
  });

  it.each(INDUSTRIAL_KINDS)('$kind: three levels in one zone, unlocked together', (k) => {
    const levels = ofKind(k.kind);
    expect(levels.map((e) => e.level)).toEqual([1, 2, 3]);
    for (const e of levels) {
      expect(e.zone).toBe(k.zone);
      expect(e.category).toBe('ind');
      expect(e.unlockMilestone).toBe(k.unlock);
      expect(e.residents).toBeUndefined();
      expect(e.cost).toBe(0);
    }
    expect(levels[0]!.share).toBe(k.share);
    expect(levels[1]!.share).toBeUndefined();
    expect(levels[2]!.share).toBeUndefined();
  });

  it.each(INDUSTRIAL_KINDS)('$kind: takes the lots and the heights its type takes', (k) => {
    const levels = ofKind(k.kind);
    expect(levels.map((e) => [e.footprint.w, e.footprint.d])).toEqual(k.lots);
    expect(levels.map((e) => e.height)).toEqual(k.heights);
  });

  it.each(INDUSTRIAL_KINDS)('$kind: jobs are its floor at the density guide', (k) => {
    for (const [i, e] of ofKind(k.kind).entries()) {
      expect(e.jobs, e.id).toBe(Math.round(floorM2(k, i) / k.m2PerJob[i]!));
    }
  });

  it.each(INDUSTRIAL_KINDS)(
    '$kind: draws per job what its sector draws, or per square foot',
    (k) => {
      for (const [i, e] of ofKind(k.kind).entries()) {
        const kw =
          k.sector !== null
            ? (e.jobs! * KWH_PER_JOB[k.sector]!) / HOURS_PER_YEAR
            : (floorM2(k, i) *
                SQ_FT_PER_M2 *
                (k.kind === 'warehouse' ? WAREHOUSE_KWH_PER_SQFT : FLEX_KWH_PER_SQFT)) /
              HOURS_PER_YEAR;
        expect(Math.abs(e.powerUse - kw / 1000), e.id).toBeLessThanOrEqual(0.0003);
      }
    },
  );

  it.each(INDUSTRIAL_KINDS)(
    '$kind: draws water per job as its sector does, or for its staff',
    (k) => {
      for (const e of ofKind(k.kind)) {
        const perJob = k.sector !== null ? GAL_PER_JOB[k.sector]! * GAL_TO_KL : WATER_PER_JOB_KL;
        expect(Math.abs(e.waterUse - e.jobs! * perJob), e.id).toBeLessThanOrEqual(0.06);
      }
    },
  );

  it.each(INDUSTRIAL_KINDS)(
    "$kind: releases what its sector's average plant releases, scaled by its jobs",
    (k) => {
      const levels = ofKind(k.kind);
      if (k.sector === null) {
        for (const e of levels) expect(e.pollution ?? 0, e.id).toBe(0);
        return;
      }
      const average = POLLUTION_PER_KLB * KLB_PER_PLANT[k.sector]!;
      for (const e of levels) {
        const expected = Math.round((average * e.jobs!) / levels[1]!.jobs!);
        expect(Math.abs((e.pollution ?? 0) - expected), e.id).toBeLessThanOrEqual(1);
      }
    },
  );

  it.each(INDUSTRIAL_KINDS)('$kind: makes the noise of its trade', (k) => {
    for (const e of ofKind(k.kind)) expect(e.noise ?? 0, e.id).toBe(k.noise);
  });

  it('adds jobs with every level of every works', () => {
    for (const k of INDUSTRIAL_KINDS) {
      const [l1, l2, l3] = ofKind(k.kind);
      expect(l1!.jobs!).toBeLessThan(l2!.jobs!);
      expect(l2!.jobs!).toBeLessThan(l3!.jobs!);
    }
  });

  it('keeps the heavy plants, and only them, in the Heavy Industrial zone', () => {
    const heavy = INDUSTRIAL_KINDS.filter((k) => k.zone === ZoneType.IndHeavy).map((k) => k.kind);
    expect(heavy).toEqual(['foodplant', 'chemical', 'metals', 'paper']);
    for (const k of INDUSTRIAL_KINDS) {
      const polluting = ofKind(k.kind).some((e) => (e.pollution ?? 0) >= 10);
      expect(polluting, k.kind).toBe(k.zone === ZoneType.IndHeavy);
    }
  });
});

describe('Medium Density Row Housing catalog (zone 6, §6.21)', () => {
  const rows = catalog.filter((e) => e.zone === ZoneType.ResMediumRow);

  it('has exactly 3 levels of townhouse row, res category, M1 gated', () => {
    expect(rows).toHaveLength(3);
    expect(rows.map((e) => e.level).sort()).toEqual([1, 2, 3]);
    for (const e of rows) {
      expect(e.category).toBe('res');
      expect(e.kind).toBe('townhouse');
      expect(e.unlockMilestone).toBe(1);
    }
  });

  it('grows real residents and draws power/water — no dead zone', () => {
    for (const e of rows) {
      expect(e.residents).toBeGreaterThan(0);
      expect(e.jobs ?? 0).toBe(0); // pure residential
      expect(e.powerUse).toBeGreaterThan(0);
      expect(e.waterUse).toBeGreaterThan(0);
    }
  });

  it('reads as NARROW attached rows: width 1, depth 2..6, low height 7..11m', () => {
    for (const e of rows) {
      expect(e.footprint.w).toBe(1);
      expect(e.footprint.d).toBeGreaterThanOrEqual(2);
      expect(e.footprint.d).toBeLessThanOrEqual(6);
      expect(e.height).toBeGreaterThanOrEqual(7);
      expect(e.height).toBeLessThanOrEqual(11);
    }
  });

  it('scales residents monotonically with level', () => {
    const sorted = [...rows].sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
    expect(sorted[0]!.residents!).toBeLessThan(sorted[1]!.residents!);
    expect(sorted[1]!.residents!).toBeLessThan(sorted[2]!.residents!);
  });
});

describe('Medium Density Housing catalog (zone 7, §6.21)', () => {
  const meds = catalog.filter((e) => e.zone === ZoneType.ResMedium);

  it('has two kinds of three levels, res category, M2 gated', () => {
    expect(meds).toHaveLength(6);
    expect(meds.map((e) => e.kind).sort()).toEqual([
      'garden',
      'garden',
      'garden',
      'multiplex',
      'multiplex',
      'multiplex',
    ]);
    for (const e of meds) {
      expect(e.category).toBe('res');
      expect(e.unlockMilestone).toBe(2);
    }
  });

  it('reads as low blocks: 2×2..3×3 footprint, two to three and a half storeys', () => {
    for (const e of meds) {
      expect(e.footprint.w).toBeGreaterThanOrEqual(2);
      expect(e.footprint.w).toBeLessThanOrEqual(3);
      expect(e.footprint.d).toBeGreaterThanOrEqual(2);
      expect(e.footprint.d).toBeLessThanOrEqual(3);
      expect(e.height).toBeGreaterThanOrEqual(6.4);
      expect(e.height).toBeLessThanOrEqual(11.2);
    }
  });

  it('carries MORE residents than row housing at the same level', () => {
    const rowsL1 = byId('res-medium-row-1')!;
    const medL1 = byId('res-medium-1')!;
    expect(medL1.residents!).toBeGreaterThan(rowsL1.residents!);
    for (const e of meds) {
      expect(e.jobs ?? 0).toBe(0);
      expect(e.residents).toBeGreaterThan(0);
    }
  });
});

describe('Mixed Housing catalog (zone 8, §6.21)', () => {
  const mixed = catalog.filter((e) => e.zone === ZoneType.Mixed);

  it('has exactly 3 levels, res category (res-sector demand), M3 gated', () => {
    expect(mixed).toHaveLength(3);
    expect(mixed.map((e) => e.level).sort()).toEqual([1, 2, 3]);
    for (const e of mixed) {
      expect(e.category).toBe('res');
      expect(e.unlockMilestone).toBe(3);
    }
  });

  it('carries BOTH residents AND jobs (commercial ground floor + apartments)', () => {
    for (const e of mixed) {
      expect(e.residents).toBeGreaterThan(0);
      expect(e.jobs).toBeGreaterThan(0);
    }
  });

  it('reads as mid/high-rise mixed-use: 2×2..3×3 footprint, 18..30m', () => {
    for (const e of mixed) {
      expect(e.footprint.w).toBeGreaterThanOrEqual(2);
      expect(e.footprint.w).toBeLessThanOrEqual(3);
      expect(e.height).toBeGreaterThanOrEqual(18);
      expect(e.height).toBeLessThanOrEqual(30);
    }
  });

  it('wears a distinct teal — between residential green and commercial blue', () => {
    for (const e of mixed) {
      const { r, g, b } = rgb(e.color);
      // Teal: green is the dominant channel, blue is strong, red is lowest.
      expect(g).toBeGreaterThan(r);
      expect(b).toBeGreaterThan(r);
      // Not pure green (blue present) and not pure blue (green >= blue).
      expect(g).toBeGreaterThanOrEqual(b);
      expect(b).toBeGreaterThan(g * 0.5);
    }
  });
});

describe('Residential zone families read as distinct greens (§6.21 tints)', () => {
  it('the NEW medium residential families (Row / Medium) wear residential greens', () => {
    // The "residential greens" rule applies to the newly-added families; the
    // pre-existing ResLow/ResHigh entries keep their frozen cool tones
    // (save-safe continuity — their colors are not retinted here).
    const greenZones: ZoneType[] = [ZoneType.ResMediumRow, ZoneType.ResMedium];
    const greens = catalog.filter((e) => e.zone !== undefined && greenZones.includes(e.zone));
    expect(greens.length).toBe(9);
    for (const e of greens) {
      const { r, g, b } = rgb(e.color);
      expect(g).toBeGreaterThan(r);
      expect(g).toBeGreaterThan(b);
    }
  });

  it('the three medium/row families are visually distinguishable from one another', () => {
    const row1 = byId('res-medium-row-1')!.color;
    const med1 = byId('res-medium-1')!.color;
    const mix1 = byId('mixed-1')!.color;
    expect(new Set([row1, med1, mix1]).size).toBe(3);
  });
});

describe('ResHigh / ComHigh milestone retune (§6.21 progression)', () => {
  it('gates the ENTIRE ResHigh family to M4 (was 2/3) — large towers arrive at Small City', () => {
    for (const e of catalog.filter((c) => c.zone === ZoneType.ResHigh)) {
      expect(e.unlockMilestone).toBe(4);
    }
  });

  it('gates the ENTIRE ComHigh family to M4 (was 2/3)', () => {
    for (const e of catalog.filter((c) => c.zone === ZoneType.ComHigh)) {
      expect(e.unlockMilestone).toBe(4);
    }
  });

  it('leaves ResLow / ComLow / Industrial low-tier unlocks untouched', () => {
    expect(byId('res-low-1')!.unlockMilestone).toBe(0);
    expect(byId('com-low-1')!.unlockMilestone).toBe(0);
    expect(byId('ind-1')!.unlockMilestone).toBe(0);
  });

  it('every retuned milestone is a valid MILESTONES index', () => {
    for (const e of catalog) {
      expect(e.unlockMilestone).toBeGreaterThanOrEqual(0);
      expect(e.unlockMilestone).toBeLessThan(MILESTONES.length);
    }
  });
});

describe('New grown zones obey grown-building catalog invariants', () => {
  const newIds = [
    'res-medium-row-1',
    'res-medium-row-2',
    'res-medium-row-3',
    'res-medium-1',
    'res-medium-2',
    'res-medium-3',
    'mixed-1',
    'mixed-2',
    'mixed-3',
  ];

  it('all nine new entries exist exactly once', () => {
    for (const id of newIds) {
      expect(catalog.filter((e) => e.id === id)).toHaveLength(1);
    }
  });

  it('are free to grow (cost 0, upkeep 0) like every other zoned building', () => {
    for (const id of newIds) {
      const e = byId(id)!;
      expect(e.cost).toBe(0);
      expect(e.upkeep).toBe(0);
      expect(e.zone).toBeDefined();
      expect(e.level).toBeGreaterThanOrEqual(1);
      expect(e.level).toBeLessThanOrEqual(3);
    }
  });

  it('carry a valid 0xRRGGBB color and a positive height/footprint', () => {
    for (const id of newIds) {
      const e = byId(id)!;
      expect(Number.isInteger(e.color)).toBe(true);
      expect(e.color).toBeGreaterThanOrEqual(0);
      expect(e.color).toBeLessThanOrEqual(0xffffff);
      expect(e.height).toBeGreaterThan(0);
      expect(e.footprint.w).toBeGreaterThan(0);
      expect(e.footprint.d).toBeGreaterThan(0);
    }
  });
});
