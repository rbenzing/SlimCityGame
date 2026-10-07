import { describe, expect, it } from 'vitest';
import { LOT_SIZES, LOT_STANDING_FLOOR, lotForStanding, platCandidates } from './lots';
import type { BuildingCatalogEntry, LotSize } from './types';

const house = (lot: LotSize | undefined, id = `h-${lot ?? 'none'}`): BuildingCatalogEntry =>
  ({ id, lot, kind: 'detached', level: 1, footprint: { w: 1, d: 1 } }) as BuildingCatalogEntry;

describe('the lot the land warrants', () => {
  it('cuts the 0–255 land value into four bands at 64, 160 and 224', () => {
    expect(lotForStanding(0)).toBe('half');
    expect(lotForStanding(63)).toBe('half');
    expect(lotForStanding(64)).toBe('normal');
    expect(lotForStanding(119)).toBe('normal');
    expect(lotForStanding(159)).toBe('normal');
    expect(lotForStanding(160)).toBe('double');
    expect(lotForStanding(181)).toBe('double');
    expect(lotForStanding(223)).toBe('double');
    expect(lotForStanding(224)).toBe('estate');
    expect(lotForStanding(255)).toBe('estate');
  });

  it('orders the lots from smallest to largest, each floor above the one before', () => {
    const floors = LOT_SIZES.map((s) => LOT_STANDING_FLOOR[s]);
    expect(floors).toEqual([...floors].sort((a, b) => a - b));
    expect(new Set(floors).size).toBe(floors.length);
  });
});

describe('the candidates a plat allows', () => {
  const all = LOT_SIZES.map((s) => house(s));

  it('keeps only the warranted lot among those that fit', () => {
    expect(platCandidates(all, 119).map((e) => e.lot)).toEqual(['normal']);
    expect(platCandidates(all, 240).map((e) => e.lot)).toEqual(['estate']);
    expect(platCandidates(all, 10).map((e) => e.lot)).toEqual(['half']);
  });

  it('falls to the next smaller lot that fits when the warranted one does not', () => {
    const fitting = [house('half'), house('normal')];
    expect(platCandidates(fitting, 240).map((e) => e.lot)).toEqual(['normal']);
    expect(platCandidates([house('half')], 240).map((e) => e.lot)).toEqual(['half']);
  });

  it('never plats a lot larger than the land warrants', () => {
    expect(platCandidates([house('double'), house('estate')], 119)).toEqual([]);
  });

  it('leaves every kind without a lot to the draw', () => {
    const duplex = { ...house(undefined, 'duplex'), kind: 'duplex' } as BuildingCatalogEntry;
    const kept = platCandidates([duplex, ...all], 119);
    expect(kept.map((e) => e.id)).toEqual(['duplex', 'h-normal']);
  });
});
