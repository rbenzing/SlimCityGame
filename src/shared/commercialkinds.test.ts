import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import type { BuildingCatalogEntry, BuildingKind } from './types';
import { ZoneType } from './types';
import { ROOMY_LOT_TILES } from './roomylots';
import { bodyPlateM2 } from './floorarea';
import { TILE_METERS } from './constants';
import { lotLayoutFor } from './lotparking';
import { LOT_PERIMETER_STRIP_M } from './lotgrounds';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;

interface Row {
  kind: BuildingKind;
  level: number;
  id: string;
  name: string;
  lot: [number, number];
  plateM2: number;
  jobs: number;
  powerUse: number;
  waterUse: number;
  height: number;
  share?: number;
}

/** The figures of the sources' table for the auto repair shop and the convenience store. */
const ROWS: Row[] = [
  {
    kind: 'autorepair',
    level: 1,
    id: 'com-autorepair-1',
    name: 'Auto Repair Shop',
    lot: [1, 2],
    plateM2: 370,
    jobs: 5,
    powerUse: 0.0033,
    waterUse: 0.5,
    height: 6.1,
    share: 85,
  },
  {
    kind: 'autorepair',
    level: 2,
    id: 'com-autorepair-2',
    name: 'Service Centre',
    lot: [2, 2],
    plateM2: 740,
    jobs: 10,
    powerUse: 0.0065,
    waterUse: 1.0,
    height: 6.1,
  },
  {
    kind: 'autorepair',
    level: 3,
    id: 'com-autorepair-3',
    name: 'Auto Centre',
    lot: [3, 2],
    plateM2: 1110,
    jobs: 14,
    powerUse: 0.0098,
    waterUse: 1.5,
    height: 6.1,
  },
  {
    kind: 'convenience',
    level: 1,
    id: 'com-convenience-1',
    name: 'Convenience Store',
    lot: [1, 2],
    plateM2: 370,
    jobs: 17,
    powerUse: 0.0242,
    waterUse: 1.8,
    height: 4.5,
    share: 37,
  },
  {
    kind: 'convenience',
    level: 2,
    id: 'com-convenience-2',
    name: 'Mini Market',
    lot: [2, 2],
    plateM2: 740,
    jobs: 34,
    powerUse: 0.0485,
    waterUse: 3.5,
    height: 4.5,
  },
  {
    kind: 'convenience',
    level: 3,
    id: 'com-convenience-3',
    name: 'Neighbourhood Market',
    lot: [3, 2],
    plateM2: 1110,
    jobs: 51,
    powerUse: 0.0727,
    waterUse: 5.3,
    height: 4.5,
  },
];

describe('the auto repair shop and the convenience store', () => {
  for (const row of ROWS) {
    it(`${row.id} holds the sourced figures`, () => {
      const e = catalog.find((c) => c.id === row.id)!;
      expect(e).toBeDefined();
      expect(e.name).toBe(row.name);
      expect(e.category).toBe('com');
      expect(e.zone).toBe(ZoneType.ComLow);
      expect(e.kind).toBe(row.kind);
      expect(e.level).toBe(row.level);
      expect([e.footprint.w, e.footprint.d]).toEqual(row.lot);
      expect(e.bodyFootprint).toBeUndefined();
      expect(Math.round(bodyPlateM2(e))).toBe(row.plateM2);
      expect(e.jobs).toBe(row.jobs);
      expect(e.powerUse).toBe(row.powerUse);
      expect(e.waterUse).toBe(row.waterUse);
      expect(e.height).toBe(row.height);
      expect(e.share).toBe(row.share);
      expect(e.unlockMilestone).toBe(1);
      expect(e.cost).toBe(0);
      expect(e.upkeep).toBe(0);
    });
  }

  it('the repair shop is noisy as a loading dock (8) and the store is silent', () => {
    for (const e of catalog.filter((c) => c.kind === 'autorepair')) expect(e.noise).toBe(8);
    for (const e of catalog.filter((c) => c.kind === 'convenience'))
      expect(e.noise).toBeUndefined();
  });

  it('roomy lots are the smallest that lay the code car park inside the planted strip under 0.28 cover', () => {
    const SHARE = 0.28;
    const strips = (lot: { w: number; d: number }, compact: BuildingCatalogEntry): boolean => {
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
      return l.fits && inside && cover <= SHARE;
    };
    for (const kind of ['autorepair', 'convenience'] as const) {
      const compacts = catalog.filter((c) => c.kind === kind && c.bodyFootprint === undefined);
      ROOMY_LOT_TILES[kind]!.forEach((lot, i) => {
        const compact = compacts[i]!;
        expect(strips(lot, compact), `${compact.id} on ${lot.w}x${lot.d}`).toBe(true);
        const narrower = { w: lot.w - 1, d: lot.d };
        if (narrower.w >= compact.footprint.w) {
          expect(strips(narrower, compact), `${compact.id} on ${narrower.w}x${narrower.d}`).toBe(
            false,
          );
        }
      });
    }
  });

  it('the six entries are the last of the catalog, compacts then variants', () => {
    const tail = catalog.slice(-30, -18).map((e) => e.id);
    expect(tail).toEqual([
      'com-autorepair-1',
      'com-autorepair-2',
      'com-autorepair-3',
      'com-autorepair-1-lot2x2',
      'com-autorepair-2-lot4x2',
      'com-autorepair-3-lot5x2',
      'com-convenience-1',
      'com-convenience-2',
      'com-convenience-3',
      'com-convenience-1-lot3x2',
      'com-convenience-2-lot4x2',
      'com-convenience-3-lot5x2',
    ]);
  });
});
