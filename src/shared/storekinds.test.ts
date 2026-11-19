import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import type { BuildingCatalogEntry, BuildingKind } from './types';
import { ZoneType } from './types';
import { ROOMY_LOT_TILES } from './roomylots';
import { bodyPlateM2, grossFloorM2, grossFloorSqFt } from './floorarea';
import { TILE_METERS } from './constants';
import { lotLayoutFor } from './lotparking';
import { LOT_PERIMETER_STRIP_M } from './lotgrounds';
import { lotParkingRequirement, storageUnits } from './parkingcode';
import {
  DRIVE_THROUGH_LANE_M,
  DRIVE_THROUGH_STACK_SPACE_M,
  DRIVE_UP_ISLAND_M,
  LUBE_COURT_M,
  type LotRect,
} from './lotlayout';
import { lubeBays } from './parkingcode';
import { bodyMetresFor } from './floorarea';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;

interface Row {
  kind: BuildingKind;
  category: 'com' | 'ind';
  level: number;
  id: string;
  name: string;
  lot: [number, number];
  /** The floor of the sources' table, m². */
  floorM2: number;
  jobs: number;
  powerUse: number;
  waterUse: number;
  pollution?: number;
  noise?: number;
  height: number;
  share?: number;
  spaces: number;
}

/** The figures of the sources' table for the pharmacy, the machine shop and self-storage. */
const ROWS: Row[] = [
  {
    kind: 'pharmacy',
    category: 'com',
    level: 1,
    id: 'com-pharmacy-1',
    name: 'Drug Store',
    lot: [3, 2],
    floorM2: 1110,
    jobs: 51,
    powerUse: 0.0228,
    waterUse: 5.3,
    height: 6,
    share: 42,
    spaces: 60,
  },
  {
    kind: 'pharmacy',
    category: 'com',
    level: 2,
    id: 'com-pharmacy-2',
    name: 'Pharmacy',
    lot: [3, 3],
    floorM2: 1665,
    jobs: 76,
    powerUse: 0.0342,
    waterUse: 7.9,
    height: 6,
    spaces: 90,
  },
  {
    kind: 'pharmacy',
    category: 'com',
    level: 3,
    id: 'com-pharmacy-3',
    name: 'Pharmacy Plus',
    lot: [4, 3],
    floorM2: 2220,
    jobs: 101,
    powerUse: 0.0456,
    waterUse: 10.5,
    height: 6,
    spaces: 120,
  },
  {
    kind: 'machineshop',
    category: 'ind',
    level: 1,
    id: 'ind-machineshop-1',
    name: 'Machine Shop',
    lot: [1, 2],
    floorM2: 370,
    jobs: 10,
    powerUse: 0.0284,
    waterUse: 27.9,
    pollution: 1,
    noise: 38,
    height: 6.1,
    share: 2,
    spaces: 4,
  },
  {
    kind: 'machineshop',
    category: 'ind',
    level: 2,
    id: 'ind-machineshop-2',
    name: 'Machining Works',
    lot: [2, 2],
    floorM2: 740,
    jobs: 21,
    powerUse: 0.0597,
    waterUse: 58.7,
    pollution: 2,
    noise: 38,
    height: 6.1,
    spaces: 8,
  },
  {
    kind: 'machineshop',
    category: 'ind',
    level: 3,
    id: 'ind-machineshop-3',
    name: 'Precision Works',
    lot: [3, 2],
    floorM2: 1110,
    jobs: 31,
    powerUse: 0.0881,
    waterUse: 86.6,
    pollution: 3,
    noise: 38,
    height: 6.1,
    spaces: 12,
  },
  {
    kind: 'storage',
    category: 'ind',
    level: 1,
    id: 'ind-storage-1',
    name: 'Self-Storage',
    lot: [3, 3],
    floorM2: 832,
    jobs: 2,
    powerUse: 0.0059,
    waterUse: 0.2,
    pollution: 0,
    noise: 0,
    height: 3,
    share: 8,
    spaces: 4,
  },
  {
    kind: 'storage',
    category: 'ind',
    level: 2,
    id: 'ind-storage-2',
    name: 'Storage Centre',
    lot: [4, 4],
    floorM2: 1480,
    jobs: 2,
    powerUse: 0.0105,
    waterUse: 0.2,
    pollution: 0,
    noise: 0,
    height: 3,
    spaces: 5,
  },
  {
    kind: 'storage',
    category: 'ind',
    level: 3,
    id: 'ind-storage-3',
    name: 'Storage Park',
    lot: [5, 4],
    floorM2: 1850,
    jobs: 3,
    powerUse: 0.0132,
    waterUse: 0.3,
    pollution: 0,
    noise: 0,
    height: 3,
    spaces: 5,
  },
  ...(
    [
      ['bank', 1, 'com-bank-1', 'Bank Branch', [1, 2], 370, 8, 0.0062, 0.8, 5, 76, 12],
      ['bank', 2, 'com-bank-2', 'Bank', [2, 2], 740, 16, 0.0124, 1.7, 5, undefined, 24],
      ['bank', 3, 'com-bank-3', 'Regional Bank', [3, 2], 1110, 24, 0.0185, 2.5, 5, undefined, 36],
      [
        'medicaloffice',
        1,
        'com-medical-1',
        'Dental Office',
        [2, 2],
        740,
        14,
        0.0158,
        1.5,
        4.6,
        129,
        32,
      ],
      [
        'medicaloffice',
        2,
        'com-medical-2',
        'Medical Office',
        [3, 2],
        1110,
        21,
        0.0237,
        2.2,
        4.6,
        undefined,
        48,
      ],
      [
        'medicaloffice',
        3,
        'com-medical-3',
        'Medical Offices',
        [3, 3],
        1665,
        31,
        0.0356,
        3.2,
        4.6,
        undefined,
        72,
      ],
      ['quicklube', 1, 'com-lube-1', 'Quick Lube', [1, 2], 185, 4, 0.0016, 0.4, 5.5, 9, 5],
      [
        'quicklube',
        2,
        'com-lube-2',
        'Lube Centre',
        [2, 2],
        370,
        9,
        0.0033,
        0.9,
        5.5,
        undefined,
        10,
      ],
      [
        'quicklube',
        3,
        'com-lube-3',
        'Lube & Tyre Centre',
        [3, 2],
        555,
        13,
        0.0049,
        1.4,
        5.5,
        undefined,
        15,
      ],
    ] as const
  ).map(
    ([
      kind,
      level,
      id,
      name,
      lot,
      floorM2,
      jobs,
      powerUse,
      waterUse,
      height,
      share,
      spaces,
    ]): Row => ({
      kind,
      category: 'com',
      level,
      id,
      name,
      lot: [lot[0], lot[1]],
      floorM2,
      jobs,
      powerUse,
      waterUse,
      pollution: 0,
      ...(kind === 'quicklube' ? { noise: 8 } : {}),
      height,
      ...(share === undefined ? {} : { share }),
      spaces,
    }),
  ),
];

describe('the pharmacy, the machine shop and self-storage', () => {
  for (const row of ROWS) {
    it(`${row.id} holds the sourced figures`, () => {
      const e = catalog.find((c) => c.id === row.id)!;
      expect(e).toBeDefined();
      expect(e.name).toBe(row.name);
      expect(e.category).toBe(row.category);
      expect(e.zone).toBe(row.category === 'com' ? ZoneType.ComLow : ZoneType.Industrial);
      expect(e.kind).toBe(row.kind);
      expect(e.level).toBe(row.level);
      expect([e.footprint.w, e.footprint.d]).toEqual(row.lot);
      expect(e.bodyFootprint).toBeUndefined();
      expect(grossFloorM2(e)).toBeCloseTo(row.floorM2, -1);
      expect(e.jobs).toBe(row.jobs);
      expect(e.powerUse).toBe(row.powerUse);
      expect(e.waterUse).toBe(row.waterUse);
      expect(e.pollution).toBe(row.pollution);
      expect(e.noise ?? 0).toBe(row.noise ?? 0);
      expect(e.height).toBe(row.height);
      expect(e.share).toBe(row.share);
      expect(e.unlockMilestone).toBe(1);
      expect(e.cost).toBe(0);
      expect(e.upkeep).toBe(0);
    });

    it(`${row.id} parks ${row.spaces} spaces`, () => {
      const e = catalog.find((c) => c.id === row.id)!;
      expect(lotParkingRequirement(e)!.spaces).toBe(row.spaces);
    });
  }

  it('self-storage counts 63, 111 and 139 units, and a plate wider than its rows', () => {
    const storage = catalog.filter((c) => c.kind === 'storage' && c.bodyFootprint === undefined);
    expect(storage.map((e) => storageUnits(grossFloorSqFt(e)))).toEqual([63, 111, 139]);
    for (const e of storage) expect(grossFloorM2(e)).toBeCloseTo(0.5 * bodyPlateM2(e), 6);
  });

  it('self-storage docks no truck: it owes no loading berth', () => {
    for (const e of catalog.filter((c) => c.kind === 'storage')) {
      expect(lotParkingRequirement(e)!.berths).toBe(0);
    }
  });

  const SHARE: Partial<Record<BuildingKind, number>> = {
    pharmacy: 0.28,
    machineshop: 0.32,
    storage: 0.32,
    bank: 0.28,
    medicaloffice: 0.28,
    quicklube: 0.28,
  };
  const KINDS = [
    'pharmacy',
    'machineshop',
    'storage',
    'bank',
    'medicaloffice',
    'quicklube',
  ] as const;
  /** Whether the lot also holds what its kind keeps beside the car park: a pharmacy's lane, a bank's two lanes, a lube's lane and a full court. */
  const keepsItsGround = (
    kind: BuildingKind,
    l: NonNullable<ReturnType<typeof lotLayoutFor>>,
    inner: number,
  ): boolean => {
    if (kind === 'pharmacy') return l.driveThrough !== null;
    if (kind === 'bank') return l.driveThrough?.rects.length === 2;
    if (kind !== 'quicklube') return true;
    const court = l.lube?.court;
    return (
      !!l.lube?.lane && !!court && court.v1 - court.v0 >= LUBE_COURT_M - 0.01 && court.v1 <= inner
    );
  };
  /** Whether the code car park, the berths and the body lie inside the planted strip, under the kind's cover share, with the front walk and the walk in from the street, and its lanes and court stand on its lot. */
  const holds = (lot: { w: number; d: number }, compact: BuildingCatalogEntry): boolean => {
    const e = { ...compact, footprint: lot, bodyFootprint: compact.footprint };
    const l = lotLayoutFor(e, 0, true)!;
    const s = LOT_PERIMETER_STRIP_M - 1e-6;
    const parts = [
      ...l.stalls.map((t) => t.rect),
      ...l.accessAisles,
      ...l.islands,
      ...l.berths,
      l.body,
    ];
    const inside = parts.every(
      (r) => r.u0 >= l.lot.u0 + s && r.u1 <= l.lot.u1 - s && r.v1 <= l.lot.v1 - s,
    );
    const cover = bodyPlateM2(compact) / (lot.w * lot.d * TILE_METERS * TILE_METERS);
    const lane = keepsItsGround(compact.kind!, l, l.lot.v1 - s);
    const walks = l.frontWalk !== null && l.entranceWalk !== null;
    return l.fits && inside && cover <= SHARE[compact.kind!]! && lane && walks;
  };

  it('each roomy lot is the smallest by area that lays the code car park inside the planted strip under its cover share', () => {
    for (const kind of KINDS) {
      const compacts = catalog.filter((c) => c.kind === kind && c.bodyFootprint === undefined);
      ROOMY_LOT_TILES[kind]!.forEach((lot, i) => {
        const compact = compacts[i]!;
        expect(holds(lot, compact), `${compact.id} on ${lot.w}x${lot.d}`).toBe(true);
        for (let d = compact.footprint.d; d <= 4; d++) {
          for (let w = compact.footprint.w; w <= 12; w++) {
            if (w * d >= lot.w * lot.d) continue;
            expect(holds({ w, d }, compact), `${compact.id} on ${w}x${d}`).toBe(false);
          }
        }
      });
    }
  });

  it('a pharmacy on its roomy lot has a side lane of three cars that stands on no aisle, stall or the body', () => {
    const roomy = catalog.filter((c) => c.kind === 'pharmacy' && c.bodyFootprint !== undefined);
    expect(roomy).toHaveLength(3);
    for (const e of roomy) {
      for (const [rotation, alongX] of [
        [0, true],
        [1, false],
      ] as const) {
        const l = lotLayoutFor(e, rotation, alongX)!;
        const lane = l.driveThrough!;
        expect(lane, e.id).not.toBeNull();
        expect(lane.rects).toHaveLength(1);
        expect(lane.length).toBeGreaterThanOrEqual(3 * 6.1);
        const r = lane.rects[0]!;
        expect(r.u1 - r.u0).toBeCloseTo(DRIVE_THROUGH_LANE_M, 6);
        const others = [
          l.body,
          ...l.aisles,
          ...(l.throat ? [l.throat] : []),
          ...l.stalls.map((s) => s.rect),
          ...l.accessAisles,
          ...l.islands,
        ];
        for (const o of others) {
          const overlap =
            r.u0 < o.u1 - 0.01 && o.u0 < r.u1 - 0.01 && r.v0 < o.v1 - 0.01 && o.v0 < r.v1 - 0.01;
          expect(overlap, `${e.id} lane meets ${JSON.stringify(o)}`).toBe(false);
        }
        expect(lane.pickup.face === 'u+' || lane.pickup.face === 'u-').toBe(true);
      }
    }
  });

  it('the thirty-six entries are the last of the catalog, compacts then variants for each kind', () => {
    const tail = catalog.slice(-36).map((e) => e.id);
    const expected: string[] = [];
    for (const kind of KINDS) {
      const compacts = ROWS.filter((r) => r.kind === kind).map((r) => r.id);
      expected.push(
        ...compacts,
        ...compacts.map((id, i) => {
          const lot = ROOMY_LOT_TILES[kind]![i]!;
          return `${id}-lot${lot.w}x${lot.d}`;
        }),
      );
    }
    expect(tail).toEqual(expected);
  });

  const apart = (a: LotRect, b: LotRect): boolean =>
    a.u1 <= b.u0 + 0.01 || b.u1 <= a.u0 + 0.01 || a.v1 <= b.v0 + 0.01 || b.v1 <= a.v0 + 0.01;
  const ROTATIONS = [
    [0, true],
    [1, false],
  ] as const;

  it('a bank holds three of six cars: a teller lane of 4 and a cash-machine lane of 3, an island between, on no stall or aisle', () => {
    const roomy = catalog.filter((c) => c.kind === 'bank' && c.bodyFootprint !== undefined);
    expect(roomy).toHaveLength(3);
    for (const e of roomy) {
      for (const [rotation, alongX] of ROTATIONS) {
        const l = lotLayoutFor(e, rotation, alongX)!;
        const lanes = l.driveThrough!;
        expect(lanes, e.id).not.toBeNull();
        expect(lanes.stacks).toEqual([4, 3]);
        const [teller, cash] = lanes.rects as [LotRect, LotRect];
        expect(teller.v1 - teller.v0).toBeCloseTo(4 * DRIVE_THROUGH_STACK_SPACE_M, 6);
        expect(cash.v1 - cash.v0).toBeCloseTo(3 * DRIVE_THROUGH_STACK_SPACE_M, 6);
        expect(teller.u1 - teller.u0).toBeCloseTo(DRIVE_THROUGH_LANE_M, 6);
        const island = lanes.island!;
        expect(island.u1 - island.u0).toBeCloseTo(DRIVE_UP_ISLAND_M, 6);
        // The teller lane is against the wall, the island and the cash lane beyond it.
        expect(
          Math.abs(teller.u0 - l.body.u1) < 0.01 || Math.abs(teller.u1 - l.body.u0) < 0.01,
        ).toBe(true);
        const others = [
          l.body,
          ...l.aisles,
          ...(l.throat ? [l.throat] : []),
          ...l.stalls.map((s) => s.rect),
          ...l.accessAisles,
          ...l.islands,
          ...l.berths,
        ];
        for (const lane of [teller, cash, island]) {
          for (const o of others)
            expect(apart(lane, o), `${e.id} meets ${JSON.stringify(o)}`).toBe(true);
          expect(lane.u0).toBeGreaterThanOrEqual(l.lot.u0);
          expect(lane.u1).toBeLessThanOrEqual(l.lot.u1);
          expect(lane.v1).toBeLessThanOrEqual(l.lot.v1);
        }
        // The lanes touch the drive the cash lane begins beside, so a car turns in from it.
        const drive = [...l.aisles, ...(l.throat ? [l.throat] : [])];
        expect(
          drive.some((d) => Math.abs(d.u1 - cash.u0) < 0.01 && d.v0 < cash.v1 && cash.v0 < d.v1),
        ).toBe(true);
      }
    }
  });

  it('a quick lube has one drive-through bay in each 6.8 m of its street face', () => {
    const lubes = catalog.filter((c) => c.kind === 'quicklube' && c.bodyFootprint === undefined);
    expect(lubes.map((e) => lubeBays(bodyMetresFor(e).w))).toEqual([2, 4, 6]);
    for (const e of lubes) expect(bodyMetresFor(e).d).toBeCloseTo(13.6, 6);
    // A lube's lot is two tiles deep, its body one: the same body stands on the roomy lot.
    for (const e of catalog.filter(
      (c) => c.kind === 'quicklube' && c.bodyFootprint !== undefined,
    )) {
      expect(bodyMetresFor(e).d, e.id).toBeCloseTo(13.6, 6);
    }
  });

  it('a quick lube on its roomy lot stands on the front of the lot, with a lane from the drive and a court of 3 cars a bay', () => {
    const roomy = catalog.filter((c) => c.kind === 'quicklube' && c.bodyFootprint !== undefined);
    expect(roomy).toHaveLength(3);
    for (const e of roomy) {
      for (const [rotation, alongX] of ROTATIONS) {
        const l = lotLayoutFor(e, rotation, alongX)!;
        const { apron, lane, court } = l.lube!;
        expect(lane, e.id).not.toBeNull();
        expect(court, e.id).not.toBeNull();
        // The body is one tile deep on the front: its apron is a drive aisle deep and reaches the street.
        expect(apron.v1).toBeCloseTo(l.body.v0, 6);
        expect(apron.v0).toBeCloseTo(0, 6);
        expect(l.body.v0).toBeLessThan(10); // the 1.5 m strip and the apron, nothing deeper
        // Behind the body, across its width, 3 cars a bay deep.
        expect(court!.u0).toBeCloseTo(l.body.u0, 6);
        expect(court!.u1).toBeCloseTo(l.body.u1, 6);
        expect(court!.v0).toBeCloseTo(l.body.v1, 6);
        expect(court!.v1 - court!.v0).toBeCloseTo(LUBE_COURT_M, 6);
        // The lane runs from the street along the wall to the court and meets the drive beside it.
        expect(lane!.v0).toBeCloseTo(0, 6);
        expect(lane!.v1).toBeGreaterThanOrEqual(court!.v0 + 6);
        expect(lane!.u1 - lane!.u0).toBeCloseTo(DRIVE_THROUGH_LANE_M, 6);
        const drive = [...l.aisles, ...(l.throat ? [l.throat] : [])];
        expect(drive.some((d) => Math.abs(d.u1 - lane!.u0) < 0.01 && d.v0 < 1)).toBe(true);
        const others = [
          ...drive,
          ...l.stalls.map((s) => s.rect),
          ...l.accessAisles,
          ...l.islands,
          ...l.berths,
        ];
        for (const ground of [apron, lane!, court!]) {
          for (const o of others)
            expect(apart(ground, o), `${e.id} meets ${JSON.stringify(o)}`).toBe(true);
          expect(ground.u0).toBeGreaterThanOrEqual(l.lot.u0 - 0.01);
          expect(ground.u1).toBeLessThanOrEqual(l.lot.u1 + 0.01);
          expect(ground.v1).toBeLessThanOrEqual(l.lot.v1 + 0.01);
        }
        for (const ground of [lane!, court!]) expect(apart(ground, l.body)).toBe(true);
        // Side by side, so a car turns from the lane into the court.
        expect(Math.abs(lane!.u1 - court!.u0) < 0.01 && lane!.v1 > court!.v0 + 1).toBe(true);
      }
    }
  });

  it('a quick lube on a lot too narrow for its lane keeps its apron and lays no lane', () => {
    const e = catalog.find((c) => c.id === 'com-lube-1')!;
    const l = lotLayoutFor(e, 0, true)!;
    expect(l.lube!.lane).toBeNull();
    expect(l.lube!.apron.v1).toBeCloseTo(l.body.v0, 6);
  });
});
