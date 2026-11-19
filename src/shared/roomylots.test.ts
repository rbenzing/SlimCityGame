import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import type { BuildingCatalogEntry } from './types';
import { ROOMY_LOT_TILES, roomyLotOf } from './roomylots';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings.filter(
  (e) => e.stacked === undefined,
);
const compacts = catalog.filter(
  (e) => e.bodyFootprint === undefined && e.kind !== undefined && roomyLotOf(e) !== undefined,
);

describe('every roomy lot of the table is a catalog entry', () => {
  it('covers every commercial and industrial compact entry of a kind with a roomy lot, three levels a kind', () => {
    for (const kind of Object.keys(ROOMY_LOT_TILES)) {
      const levels = compacts.filter((e) => e.kind === kind).map((e) => e.level);
      expect(levels.sort(), kind).toEqual([1, 2, 3]);
    }
  });

  it('holds the same building on the roomy lot: only the lot and its body footprint differ', () => {
    for (const c of compacts) {
      const lot = roomyLotOf(c)!;
      const same = catalog.filter(
        (e) =>
          e.bodyFootprint !== undefined &&
          e.kind === c.kind &&
          e.level === c.level &&
          e.zone === c.zone &&
          e.footprint.w === lot.w &&
          e.footprint.d === lot.d,
      );
      expect(same, `${c.kind} L${c.level}`).toHaveLength(1);
      const v = same[0]!;
      expect(v.id).toBe(`${c.id}-lot${lot.w}x${lot.d}`);
      expect(v.bodyFootprint).toEqual(c.footprint);
      const own = new Set(['id', 'footprint', 'bodyFootprint', 'share']);
      const rest = (e: BuildingCatalogEntry): Record<string, unknown> =>
        Object.fromEntries(Object.entries(e).filter(([key]) => !own.has(key)));
      expect(rest(v)).toEqual(rest(c));
    }
  });

  it('gives a kind no roomy lot smaller than its compact one', () => {
    for (const c of compacts) {
      const lot = roomyLotOf(c)!;
      expect(lot.w * lot.d, `${c.id}`).toBeGreaterThanOrEqual(c.footprint.w * c.footprint.d);
      expect(lot.d).toBeLessThanOrEqual(4);
      expect(lot.w).toBeGreaterThanOrEqual(c.footprint.w);
    }
  });

  it('ids stay unique', () => {
    expect(new Set(catalog.map((e) => e.id)).size).toBe(catalog.length);
  });
});
