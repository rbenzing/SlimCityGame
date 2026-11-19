import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import type { BuildingCatalogEntry } from './types';
import { isRoomyLotEntry } from './parkingcode';
import { roomyLotOf } from './roomylots';
import { lotLayoutFor } from './lotparking';
import { LOT_PERIMETER_STRIP_M } from './lotgrounds';
import { layoutLot, type LotRect } from './lotlayout';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
/** The roomiest rung of each kind and level: growth stands its long side on the street. */
const roomy = catalog.filter((e) => {
  const lot = roomyLotOf(e);
  return isRoomyLotEntry(e) && lot?.w === e.footprint.w && lot.d === e.footprint.d;
});

describe('a roomy rung keeps a planted strip inside its lot lines', () => {
  it('is a catalog entry that grows its body onto a larger lot and parks to code', () => {
    expect(roomy).toHaveLength(48);
    expect(roomy.every((e) => e.bodyFootprint !== undefined)).toBe(true);
  });

  it('keeps the strip clear of every stall, island, berth and body on the sides and rear, wherever the code spaces still fit', () => {
    for (const e of roomy) {
      const l = lotLayoutFor(e, 0, true)!;
      const { lot } = l;
      const s = LOT_PERIMETER_STRIP_M - 1e-6;
      const parts = [
        ...l.stalls.map((t) => t.rect),
        ...l.accessAisles,
        ...l.islands,
        ...l.berths,
        l.body,
      ];
      for (const r of parts) {
        expect(r.u0 >= lot.u0 + s && r.u1 <= lot.u1 - s && r.v1 <= lot.v1 - s, e.id).toBe(true);
      }
    }
  });

  it('keeps the front strip clear of stalls and the body, the drive alone crossing it to the street', () => {
    for (const e of roomy) {
      const l = lotLayoutFor(e, 0, true)!;
      const front = [...l.stalls.map((s) => s.rect), ...l.islands, ...l.berths, l.body];
      expect(
        front.every((r) => r.v0 >= LOT_PERIMETER_STRIP_M - 1e-6),
        e.id,
      ).toBe(true);
      const drive = [...l.aisles, ...(l.throat ? [l.throat] : [])];
      if (drive.length > 0) {
        expect(Math.min(...drive.map((a) => a.v0)), e.id).toBeLessThan(1e-6);
      }
    }
  });

  it('lays every roomy rung to its code: spaces, accessible spaces and berths', () => {
    for (const e of roomy) {
      const l = lotLayoutFor(e, 0, true)!;
      expect(l.fits, e.id).toBe(true);
    }
  });
});

describe('the strip is given up where it would cost a code space', () => {
  const input = {
    along: 60,
    depth: 60,
    bodyAlong: 20,
    bodyDepth: 20,
    spaces: 30,
    berths: 0,
  };

  it('lays the strip when the lot holds the spaces with it', () => {
    const l = layoutLot({ ...input, perimeterStrip: LOT_PERIMETER_STRIP_M });
    expect(l.fits).toBe(true);
    expect(l.lot).toEqual({ u0: 0, u1: 60, v0: 0, v1: 60 });
    expect(Math.min(...l.stalls.map((s) => s.rect.u0))).toBeGreaterThanOrEqual(1.5 - 1e-6);
  });

  it('lays the lot without it when the spaces would no longer fit', () => {
    const tight = { ...input, along: 33, depth: 33, spaces: 12 };
    const without = layoutLot(tight);
    const withStrip = layoutLot({ ...tight, perimeterStrip: LOT_PERIMETER_STRIP_M });
    expect(without.fits).toBe(true);
    expect(withStrip.fits).toBe(true);
    expect(withStrip.provided).toBe(without.provided);
  });
});

describe('no loading berth stands on a drive aisle, an access aisle or the body', () => {
  const overlaps = (a: LotRect, b: LotRect): boolean =>
    a.u0 < b.u1 - 0.01 && b.u0 < a.u1 - 0.01 && a.v0 < b.v1 - 0.01 && b.v0 < a.v1 - 0.01;

  it('holds for every shop and works lot, turned either way', () => {
    const lots = catalog.filter((e) => e.category === 'com' || e.category === 'ind');
    for (const e of lots) {
      for (const [rotation, alongX] of [
        [0, true],
        [1, true],
        [0, false],
        [1, false],
      ] as const) {
        const l = lotLayoutFor(e, rotation, alongX);
        if (!l) continue;
        for (const b of l.berths) {
          for (const a of [...l.aisles, ...l.accessAisles, l.body]) {
            expect(overlaps(a, b), `${e.id} r${rotation} ${alongX ? 'x' : 'z'}`).toBe(false);
          }
        }
      }
    }
  });
});
