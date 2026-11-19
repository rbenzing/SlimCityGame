import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import type { BuildingCatalogEntry } from './types';
import { lotLayoutFor } from './lotparking';
import { doorClearances, planLotGrounds, type LotGroundsFacts } from './lotgrounds';
import type { LotRect } from './lotlayout';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const repairs = catalog.filter((e) => e.kind === 'autorepair');
// A quick lube's or a car wash's face is bay doors or portals too, so each keeps its doors clear as a repair shop does.
const others = catalog.filter(
  (e) =>
    e.category === 'com' &&
    e.kind !== 'autorepair' &&
    e.kind !== 'quicklube' &&
    e.kind !== 'carwash' &&
    e.bodyFootprint !== undefined,
);

const overlaps = (a: LotRect, b: LotRect): boolean =>
  a.u0 < b.u1 - 0.01 && b.u0 < a.u1 - 0.01 && a.v0 < b.v1 - 0.01 && b.v0 < a.v1 - 0.01;

const factsOf = (e: BuildingCatalogEntry): LotGroundsFacts => ({
  kind: e.kind,
  category: 'com',
  homeSides: [],
  kitSign: false,
  kitRefuse: false,
});

describe('a repair shop’s bay doors are doors to the grounds plan', () => {
  it('keeps the ground across the whole street face clear, as it does a dock or an entrance', () => {
    for (const e of repairs) {
      const l = lotLayoutFor(e, 0, true)!;
      const row = doorClearances(l).filter(
        (r) => r.u0 <= l.body.u0 + 0.01 && r.u1 >= l.body.u1 - 0.01,
      );
      expect(row.length, e.id).toBeGreaterThan(0);
      expect(
        row.some((r) => r.v1 >= l.body.v0 - 0.01 && r.v0 < l.body.v0),
        e.id,
      ).toBe(true);
    }
  });

  it('puts no bed, bench, bin, bicycle rack or walk end across the bay doors', () => {
    for (const e of repairs.filter((r) => r.bodyFootprint !== undefined)) {
      for (const rotation of [0, 1] as const) {
        const l = lotLayoutFor(e, rotation, true)!;
        const bays = doorClearances(l).filter(
          (r) => r.u0 <= l.body.u0 + 0.01 && r.u1 >= l.body.u1 - 0.01,
        );
        for (const p of planLotGrounds(l, factsOf(e)).pieces) {
          if (!['bed', 'bench', 'bin', 'bikeRack', 'walk', 'crossing'].includes(p.kind)) continue;
          for (const b of bays) {
            expect(overlaps(p.rect, b), `${e.id} r${rotation} ${p.kind}`).toBe(false);
          }
        }
      }
    }
  });

  it('leaves every other commercial kind’s doors as they were', () => {
    for (const e of others) {
      const l = lotLayoutFor(e, 0, true);
      if (!l) continue;
      const wide = doorClearances(l).filter(
        (r) => r.u0 <= l.body.u0 + 0.01 && r.u1 >= l.body.u1 - 0.01 && r.v1 <= l.body.v0 + 0.01,
      );
      expect(wide, e.id).toHaveLength(0);
    }
  });
});

describe('a repair shop’s way in is its office door, not the middle of the bay row', () => {
  it('lands the entrance walk at the end of the street face beside the drive, clear of the bay doors’ middle', () => {
    for (const e of repairs.filter((r) => r.bodyFootprint !== undefined)) {
      const l = lotLayoutFor(e, 0, true)!;
      const mid = (l.body.u0 + l.body.u1) / 2;
      const cut = (l.curbCut.u0 + l.curbCut.u1) / 2;
      expect(Math.abs(l.entrance.u - mid), e.id).toBeGreaterThan(
        l.body.u1 - l.body.u0 - 4 - (l.body.u1 - l.body.u0) / 2,
      );
      expect(l.entrance.u < mid, e.id).toBe(cut < mid);
    }
  });

  it('stands a bench and a bin by the office door in the end wall, off the door’s clear ground', () => {
    for (const e of repairs.filter((r) => r.bodyFootprint !== undefined)) {
      const l = lotLayoutFor(e, 0, true)!;
      const pieces = planLotGrounds(l, factsOf(e)).pieces;
      // Every roomy lot has ground for the bin; the bench stands where the wall past the door has the length for it.
      expect(
        pieces.filter((p) => p.kind === 'bin'),
        e.id,
      ).toHaveLength(1);
      for (const kind of ['bin', 'bench'] as const) {
        const found = pieces.filter((p) => p.kind === kind);
        expect(found.length, `${e.id} ${kind}`).toBeLessThanOrEqual(1);
        if (found.length === 0) continue;
        const r = found[0]!.rect;
        const against = Math.min(Math.abs(r.u1 - l.body.u0), Math.abs(r.u0 - l.body.u1));
        expect(against, `${e.id} ${kind}`).toBeLessThan(1e-6);
        for (const d of doorClearances(l)) expect(overlaps(r, d), `${e.id} ${kind}`).toBe(false);
      }
    }
  });
});
