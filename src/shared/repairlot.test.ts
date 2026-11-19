import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import type { BuildingCatalogEntry } from './types';
import { lotLayoutFor } from './lotparking';
import { doorClearances, planLotGrounds, type LotGroundsFacts } from './lotgrounds';
import type { LotRect } from './lotlayout';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const repairs = catalog.filter((e) => e.kind === 'autorepair');
const others = catalog.filter(
  (e) => e.category === 'com' && e.kind !== 'autorepair' && e.bodyFootprint !== undefined,
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
