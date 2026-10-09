import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import type { BuildingCatalogEntry } from './types';
import { ZoneType } from './types';
import { grossFloorSqFt } from './floorarea';
import {
  AISLE_WIDTH_M,
  berthTableLimit,
  DOUBLE_MODULE_M,
  drawsLotParking,
  islandsInRow,
  loadingBerths,
  lotParkingRequirement,
  onSiteSpaces,
  requiredSpaces,
  SINGLE_MODULE_M,
  SMALL_USE_EXEMPT_SQ_FT,
  STALL_LENGTH_M,
  STALL_WIDTH_M,
  treesFor,
} from './parkingcode';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;

describe('the parking code', () => {
  it('measures stalls, aisles and modules in the codes’ feet', () => {
    expect(STALL_WIDTH_M).toBeCloseTo(2.74, 2);
    expect(STALL_LENGTH_M).toBeCloseTo(5.49, 2);
    expect(AISLE_WIDTH_M).toBeCloseTo(7.32, 2);
    expect(DOUBLE_MODULE_M).toBeCloseTo(18.29, 2); // 60 ft
    expect(SINGLE_MODULE_M).toBeCloseTo(12.8, 2); // 42 ft
  });

  it('asks spaces per 1,000 sq ft by kind, rounded up', () => {
    expect(requiredSpaces('strip', 11_945)).toBe(60);
    expect(requiredSpaces('supermarket', 17_918)).toBe(90);
    expect(requiredSpaces('warehouse', 17_918)).toBe(9);
    expect(requiredSpaces('flex', 10_420)).toBe(21);
    expect(requiredSpaces('workshop', 8_000)).toBe(8);
    expect(requiredSpaces('workshop', 8_001)).toBe(9);
    // A kindless shop parks as retail, a kindless works as manufacturing.
    expect(requiredSpaces(undefined, 2_000, 'com')).toBe(10);
    expect(requiredSpaces(undefined, 2_000, 'ind')).toBe(2);
  });

  it('parks nothing for the first 3,000 sq ft of a single-tenant shop or restaurant, the rest at the full rate', () => {
    expect(SMALL_USE_EXEMPT_SQ_FT).toBe(3_000);
    expect(requiredSpaces('shop', 1_991)).toBe(0);
    expect(requiredSpaces('shop', 3_000)).toBe(0);
    expect(requiredSpaces('shop', 3_982)).toBe(5);
    expect(requiredSpaces('restaurant', 3_513)).toBe(6);
    // The catalog's own floors: the corner shop needs none, the fast-food stand six.
    const floor = (id: string): number =>
      lotParkingRequirement(catalog.find((e) => e.id === id)!)!.spaces;
    expect(floor('com-low-1')).toBe(0);
    expect(floor('com-restaurant-1')).toBe(6);
  });

  it('gives a strip, a supermarket and industry no small-use exemption', () => {
    expect(requiredSpaces('strip', 2_000)).toBe(10);
    expect(requiredSpaces('supermarket', 2_000)).toBe(10);
    expect(requiredSpaces('flex', 2_000)).toBe(4);
    expect(requiredSpaces('workshop', 2_000)).toBe(2);
    expect(requiredSpaces(undefined, 2_000, 'com')).toBe(10);
  });

  it('credits the kerb one for one against what the lot must hold, never below none', () => {
    expect(onSiteSpaces(60, 0)).toBe(60);
    expect(onSiteSpaces(60, 9)).toBe(51);
    expect(onSiteSpaces(5, 9)).toBe(0);
    expect(onSiteSpaces(0, 0)).toBe(0);
  });

  it('reads Wadsworth OH’s loading tables', () => {
    expect(
      [5_000, 5_001, 20_000, 20_001, 40_000, 40_001, 100_000].map((f) =>
        loadingBerths('retail', f),
      ),
    ).toEqual([0, 1, 1, 2, 2, 3, 3]);
    expect(
      [5_000, 5_001, 30_000, 30_001, 80_000, 80_001, 175_000].map((f) =>
        loadingBerths('industrial', f),
      ),
    ).toEqual([0, 1, 1, 2, 2, 3, 3]);
  });

  it('keeps every floor in the game inside the loading tables', () => {
    for (const e of catalog) {
      if (!lotParkingRequirement(e)) continue;
      const table = e.category === 'ind' ? 'industrial' : 'retail';
      expect(grossFloorSqFt(e), e.id).toBeLessThanOrEqual(berthTableLimit(table));
    }
  });

  it('plants an island at each end of a row and after every ten, and a tree per ten or part', () => {
    expect([0, 1, 10, 11, 20, 21].map(islandsInRow)).toEqual([0, 2, 2, 3, 3, 4]);
    expect([0, 1, 10, 11].map(treesFor)).toEqual([0, 1, 1, 2]);
  });

  it('draws lot parking for suburban commerce and industry only: never downtown, a farm or a home', () => {
    for (const e of catalog) {
      const expected =
        (e.category === 'com' || e.category === 'ind') &&
        e.zone !== ZoneType.Agriculture &&
        e.zone !== ZoneType.ComHigh &&
        e.zone !== ZoneType.Mixed;
      expect(drawsLotParking(e), e.id).toBe(expected);
    }
    expect(
      catalog.filter((e) => e.kind === 'office' || e.kind === 'hotel').some(drawsLotParking),
    ).toBe(false);
  });
});
