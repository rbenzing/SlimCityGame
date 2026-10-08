import { describe, expect, it } from 'vitest';
import {
  LOT_SIZES,
  LOT_STANDING_FLOOR,
  PLATTED_ZONES,
  lotForStanding,
  lotsOfZone,
  platCandidates,
  warrantedLot,
} from './lots';
import { ZoneType, type BuildingCatalogEntry, type LotSize } from './types';

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

describe('the lots a zone plats', () => {
  it('plats low density by the land value bands', () => {
    expect(warrantedLot(ZoneType.ResLow, 0)).toBe('half');
    expect(warrantedLot(ZoneType.ResLow, 119)).toBe('normal');
    expect(warrantedLot(ZoneType.ResLow, 181)).toBe('double');
    expect(warrantedLot(ZoneType.ResLow, 255)).toBe('estate');
  });

  it('plats medium density as normal lots whatever the standing', () => {
    expect(warrantedLot(ZoneType.ResMedium, 0)).toBe('normal');
    expect(warrantedLot(ZoneType.ResMedium, 255)).toBe('normal');
    expect(lotsOfZone(ZoneType.ResMedium)).toEqual(['normal']);
  });

  it('plats row housing as normal lots whatever the standing', () => {
    expect(warrantedLot(ZoneType.ResMediumRow, 0)).toBe('normal');
    expect(warrantedLot(ZoneType.ResMediumRow, 255)).toBe('normal');
    expect(lotsOfZone(ZoneType.ResMediumRow)).toEqual(['normal']);
  });

  it('leaves every other zone every lot size', () => {
    expect(lotsOfZone(ZoneType.ResLow)).toEqual(LOT_SIZES);
    expect(lotsOfZone(ZoneType.ResHigh)).toEqual(LOT_SIZES);
  });

  it('names low density, row housing and medium density as the platted zones', () => {
    expect([...PLATTED_ZONES].sort()).toEqual(
      [ZoneType.ResLow, ZoneType.ResMedium, ZoneType.ResMediumRow].sort(),
    );
  });
});

describe('the candidates a plat allows', () => {
  const all = LOT_SIZES.map((s) => house(s));
  const low = ZoneType.ResLow;

  it('keeps only the warranted lot among those that fit', () => {
    expect(platCandidates(all, low, 119).map((e) => e.lot)).toEqual(['normal']);
    expect(platCandidates(all, low, 240).map((e) => e.lot)).toEqual(['estate']);
    expect(platCandidates(all, low, 10).map((e) => e.lot)).toEqual(['half']);
  });

  it('falls to the next smaller lot that fits when the warranted one does not', () => {
    const fitting = [house('half'), house('normal')];
    expect(platCandidates(fitting, low, 240).map((e) => e.lot)).toEqual(['normal']);
    expect(platCandidates([house('half')], low, 240).map((e) => e.lot)).toEqual(['half']);
  });

  it('never plats a lot larger than the land warrants', () => {
    expect(platCandidates([house('double'), house('estate')], low, 119)).toEqual([]);
  });

  it('plats a duplex on the same lot axis as a detached house', () => {
    const duplex = (lot: LotSize, id: string) =>
      ({ ...house(lot, id), kind: 'duplex' }) as BuildingCatalogEntry;
    const fitting = [
      house('half', 'res-half-1'),
      duplex('half', 'res-duplex-h-1'),
      house('normal', 'res-normal-1'),
      duplex('normal', 'res-duplex-1'),
    ];
    expect(platCandidates(fitting, low, 0).map((e) => e.id)).toEqual([
      'res-half-1',
      'res-duplex-h-1',
    ]);
  });

  it('leaves every kind without a lot to the draw', () => {
    const duplex = { ...house(undefined, 'duplex'), kind: 'duplex' } as BuildingCatalogEntry;
    const kept = platCandidates([duplex, ...all], low, 119);
    expect(kept.map((e) => e.id)).toEqual(['duplex', 'h-normal']);
  });

  it('plats medium density on normal lots only, even on land worth nothing', () => {
    const fitting = [house('half'), house('normal')];
    expect(platCandidates(fitting, ZoneType.ResMedium, 0).map((e) => e.lot)).toEqual(['normal']);
    expect(platCandidates(fitting, ZoneType.ResMedium, 255).map((e) => e.lot)).toEqual(['normal']);
  });

  it('plats row housing on normal lots only, even on land worth nothing', () => {
    const fitting = [house('half'), house('normal')];
    expect(platCandidates(fitting, ZoneType.ResMediumRow, 0).map((e) => e.lot)).toEqual(['normal']);
    expect(platCandidates(fitting, ZoneType.ResMediumRow, 255).map((e) => e.lot)).toEqual([
      'normal',
    ]);
  });
});
