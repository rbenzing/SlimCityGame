import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import { lotLayoutFor } from './lotparking';
import { lotParkingRequirement } from './parkingcode';
import type { BuildingCatalogEntry } from './types';
import type { LotRect } from './lotlayout';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const docking = catalog.filter((e) => e.kind === 'warehouse' || e.kind === 'foodplant');
const others = catalog.filter(
  (e) => e.category === 'ind' && e.kind !== 'warehouse' && e.kind !== 'foodplant',
);

/** The layout measures to the centimetre, so a hair's overlap is a touch. */
const overlaps = (a: LotRect, b: LotRect): boolean =>
  a.u0 < b.u1 - 0.011 && b.u0 < a.u1 - 0.011 && a.v0 < b.v1 - 0.011 && b.v0 < a.v1 - 0.011;

describe('the truck court: trailer stalls and the loading wall', () => {
  const layouts = docking.flatMap((e) =>
    ([0, 1, 2, 3] as const).flatMap((rotation) =>
      [true, false].map((alongX) => ({
        e,
        layout: lotLayoutFor(e, rotation, alongX, lotParkingRequirement(e)!.spaces)!,
      })),
    ),
  );

  it('names the wall the berths lie beside, never the street face', () => {
    for (const { e, layout } of layouts) {
      if (layout.berths.length === 0) continue;
      expect(['u-', 'u+', 'v+'], e.id).toContain(layout.loadingWall);
    }
  });

  it('stripes trailer stalls 3.66 × 16.8 m on ground the car park left over', () => {
    let striped = 0;
    for (const { e, layout } of layouts) {
      for (const s of layout.trailerStalls) {
        const dims = [s.u1 - s.u0, s.v1 - s.v0].sort((a, b) => a - b);
        expect(dims[0], e.id).toBeCloseTo(3.66, 1);
        expect(dims[1], e.id).toBeCloseTo(16.76, 1);
        expect(s.u0 >= layout.lot.u0 - 1e-6 && s.u1 <= layout.lot.u1 + 1e-6, e.id).toBe(true);
        expect(s.v0 >= layout.lot.v0 - 1e-6 && s.v1 <= layout.lot.v1 + 1e-6, e.id).toBe(true);
        const taken = [
          layout.body,
          ...layout.stalls.map((t) => t.rect),
          ...layout.aisles,
          ...layout.berths,
          ...layout.islands,
        ];
        for (const t of taken) expect(overlaps(s, t), e.id).toBe(false);
        striped += 1;
      }
    }
    expect(striped).toBeGreaterThan(0);
  });

  it('leaves the spaces the code asks for exactly as they were', () => {
    for (const { e, layout } of layouts) {
      expect(layout.provided, e.id).toBeGreaterThanOrEqual(0);
      expect(layout.fits, e.id).toBe(true);
    }
  });

  it('keeps the court to the kinds that dock trailers', () => {
    for (const e of others) {
      const layout = lotLayoutFor(e, 0, true, lotParkingRequirement(e)?.spaces ?? 0);
      if (!layout) continue;
      expect(layout.trailerStalls, e.id).toEqual([]);
      expect(layout.loadingWall, e.id).toBeNull();
    }
  });
});
