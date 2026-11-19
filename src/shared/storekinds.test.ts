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
import { DRIVE_THROUGH_LANE_M } from './lotlayout';

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
    floorM2: 1000,
    jobs: 2,
    powerUse: 0.0071,
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
    floorM2: 1776,
    jobs: 2,
    powerUse: 0.0127,
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
    floorM2: 2220,
    jobs: 3,
    powerUse: 0.0158,
    waterUse: 0.3,
    pollution: 0,
    noise: 0,
    height: 3,
    spaces: 6,
  },
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

  it('self-storage counts 75, 133 and 166 units, and a plate wider than its rows', () => {
    const storage = catalog.filter((c) => c.kind === 'storage' && c.bodyFootprint === undefined);
    expect(storage.map((e) => storageUnits(grossFloorSqFt(e)))).toEqual([75, 133, 166]);
    for (const e of storage) expect(grossFloorM2(e)).toBeCloseTo(0.6 * bodyPlateM2(e), 6);
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
  };
  const KINDS = ['pharmacy', 'machineshop', 'storage'] as const;
  /** Whether the code car park, the berths and the body lie inside the planted strip, under the kind's cover share, and a pharmacy's lane stands on its lot. */
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
    const lane = compact.kind !== 'pharmacy' || l.driveThrough !== null;
    return l.fits && inside && cover <= SHARE[compact.kind!]! && lane;
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

  it('the eighteen entries are the last of the catalog, compacts then variants for each kind', () => {
    const tail = catalog.slice(-18).map((e) => e.id);
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
});
