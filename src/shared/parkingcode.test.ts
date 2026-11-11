import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import type { BuildingCatalogEntry } from './types';
import { ZoneType } from './types';
import { grossFloorM2, grossFloorSqFt, storeysOf } from './floorarea';
import {
  AISLE_WIDTH_M,
  berthTableLimit,
  DOUBLE_MODULE_M,
  drawsLotParking,
  HOTEL_ROOM_M2,
  isDenseLotEntry,
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
  WALK_UP_SIDE_YARD_M,
  WALK_UP_SPACES_PER_HOME,
  walkUpParkingRequirement,
  lotSpacesFor,
} from './parkingcode';
import { holdsLotParkingAt, lotLayoutFor, lotParkingAt } from './lotparking';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;

describe('a walk-up’s car park', () => {
  const walkUps = catalog.filter((e) => e.kind === 'multiplex' || e.kind === 'garden');
  const roadSouth = (x: number, z: number): boolean => z === 12 && x >= 8 && x < 14;

  it('lays 1.4 spaces a home, rounded up, and no berths, for every walk-up in the catalog', () => {
    expect(walkUps).toHaveLength(6);
    expect(WALK_UP_SPACES_PER_HOME).toBe(1.4);
    for (const e of walkUps) {
      const req = walkUpParkingRequirement(e)!;
      expect(req.spaces, e.id).toBe(Math.ceil(1.4 * e.units!));
      expect(req.berths, e.id).toBe(0);
      expect(lotSpacesFor(e), e.id).toEqual(req);
    }
    expect(walkUpParkingRequirement(catalog.find((e) => e.id === 'res-multiplex-1')!)!.spaces).toBe(
      12,
    );
    expect(walkUpParkingRequirement(catalog.find((e) => e.id === 'res-medium-3')!)!.spaces).toBe(
      34,
    );
  });

  it('is drawn for no other home and no downtown block, which keep the kerb', () => {
    for (const e of catalog.filter((c) => c.category === 'res' && !walkUps.includes(c))) {
      expect(walkUpParkingRequirement(e), e.id).toBeNull();
      // A mid-rise or a mixed-use block on its larger level-1 lot parks to code; the rest keep the kerb.
      if (!isDenseLotEntry(e)) expect(lotSpacesFor(e), e.id).toBeNull();
    }
  });

  it('never gates growth: a walk-up is not parked to code, and holds its code wherever it stands', () => {
    for (const e of walkUps) {
      expect(drawsLotParking(e), e.id).toBe(false);
      expect(lotParkingRequirement(e), e.id).toBeNull();
      for (const rotation of [0, 1, 2, 3] as const) {
        expect(holdsLotParkingAt(e, 10, 10, rotation, roadSouth, null), e.id).toBe(true);
      }
    }
  });

  it('lays a multiplex what fits on its lot, the stalls counted from the homes, with its body clear of the side lines', () => {
    for (const e of walkUps.filter((w) => w.kind === 'multiplex')) {
      const parking = lotParkingAt(e, 10, 10, 0, roadSouth, null)!;
      expect(parking, e.id).not.toBeNull();
      expect(parking.layout.required).toBe(walkUpParkingRequirement(e)!.spaces);
      expect(parking.layout.provided).toBeGreaterThan(0);
      expect(parking.layout.provided + parking.layout.shortfall).toBe(parking.layout.required);
      expect(parking.layout.body.u0).toBeGreaterThanOrEqual(WALK_UP_SIDE_YARD_M);
      expect(parking.layout.body.u1).toBeLessThanOrEqual(
        parking.layout.lot.u1 - WALK_UP_SIDE_YARD_M,
      );
      expect(parking.layout.rearYard).not.toBeNull();
    }
  });

  it('lays a garden on its 2×2 lot no car park: its 27.2 m body and a 12.8 m module fill the lot, so a module would park the body on a side line', () => {
    for (const e of walkUps.filter((w) => w.kind === 'garden')) {
      expect(e.footprint).toEqual({ w: 2, d: 2 });
      for (const rotation of [0, 1, 2, 3] as const) {
        expect(lotParkingAt(e, 10, 10, rotation, roadSouth, null), e.id).toBeNull();
      }
    }
  });
});

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

  it('draws lot parking for suburban commerce and industry and a dense kind’s level-1 larger lot only: never downtown on its own footprint, a farm or a home', () => {
    for (const e of catalog) {
      const expected =
        isDenseLotEntry(e) ||
        ((e.category === 'com' || e.category === 'ind') &&
          e.zone !== ZoneType.Agriculture &&
          e.zone !== ZoneType.ComHigh &&
          e.zone !== ZoneType.Mixed);
      expect(drawsLotParking(e), e.id).toBe(expected);
    }
    expect(
      catalog
        .filter((e) => (e.kind === 'office' || e.kind === 'hotel') && !isDenseLotEntry(e))
        .some(drawsLotParking),
    ).toBe(false);
  });
});

describe('a level-1 dense kind on its larger lot', () => {
  const byId = (id: string): BuildingCatalogEntry => catalog.find((e) => e.id === id)!;
  const required = (id: string): number => lotParkingRequirement(byId(id))!.spaces;
  const lots = catalog.filter(isDenseLotEntry);

  it('is the four level-1 kinds on their appended lots, and no other entry', () => {
    expect(lots.map((e) => e.id).sort()).toEqual([
      'com-high-1-lot4x4',
      'com-hotel-1-lot3x3',
      'mixed-1-lot2x2',
      'res-high-1-lot2x2',
    ]);
  });

  it('parks an office at 3 a 1,000 sq ft of its floor', () => {
    expect(requiredSpaces('office', 10_000)).toBe(30);
    expect(required('com-high-1-lot4x4')).toBe(
      Math.ceil((3 * grossFloorSqFt(byId('com-high-1'))) / 1000),
    );
    expect(required('com-high-1-lot4x4')).toBe(120);
  });

  it('parks apartments at 1.4 a home', () => {
    expect(required('res-high-1-lot2x2')).toBe(Math.ceil(1.4 * 17));
  });

  it('parks a hotel a room, a room being 45 m² of floor', () => {
    expect(HOTEL_ROOM_M2).toBe(45);
    expect(required('com-hotel-1-lot3x3')).toBe(
      Math.ceil(grossFloorM2(byId('com-hotel-1')) / HOTEL_ROOM_M2),
    );
    expect(required('com-hotel-1-lot3x3')).toBe(66);
  });

  it('parks a mixed-use block its homes at the apartment rate and its shop floor at the shop’s rate, less the shop’s exemption', () => {
    const e = byId('mixed-1-lot2x2');
    const shopSqFt = grossFloorSqFt(e) / storeysOf(e);
    expect(shopSqFt).toBeGreaterThan(SMALL_USE_EXEMPT_SQ_FT);
    expect(required('mixed-1-lot2x2')).toBe(Math.ceil(1.4 * 10) + requiredSpaces('shop', shopSqFt));
    expect(required('mixed-1-lot2x2')).toBe(19);
  });

  it('draws its floor from its body, so a larger lot never adds floor or jobs', () => {
    for (const e of lots) {
      const base = catalog.find((b) => b.id === e.id.replace(/-lot\d+x\d+$/, ''))!;
      expect(grossFloorSqFt(e), e.id).toBeCloseTo(grossFloorSqFt(base), 6);
    }
  });

  it('takes the kerb’s credit off what its lot holds, as any lot does', () => {
    for (const e of lots) {
      const full = lotLayoutFor(e, 0, true, 0)!;
      expect(full.required, e.id).toBe(lotParkingRequirement(e)!.spaces);
      expect(lotLayoutFor(e, 0, true, 7)!.required, e.id).toBe(full.required - 7);
    }
  });

  it('holds the code’s spaces on the smallest square lot that holds them, whichever street side it fronts', () => {
    const smallestHolding = (base: BuildingCatalogEntry): number => {
      const floor = Math.max(base.footprint.w, base.footprint.d);
      for (let n = floor; n <= 6; n++) {
        const lot = { ...base, footprint: { w: n, d: n }, bodyFootprint: base.footprint };
        if ([true, false].every((alongX) => lotLayoutFor(lot, 0, alongX, 0)!.fits)) return n;
      }
      return Infinity;
    };
    for (const e of lots) {
      const base = catalog.find((b) => b.id === e.id.replace(/-lot\d+x\d+$/, ''))!;
      expect(e.footprint.w, e.id).toBe(smallestHolding(base));
      for (const alongX of [true, false]) {
        const layout = lotLayoutFor(e, 0, alongX, 0)!;
        expect(layout.fits, e.id).toBe(true);
        expect(layout.provided, e.id).toBe(layout.required);
      }
    }
  });

  it('keeps its body clear of the street line by what its street face reaches', () => {
    for (const e of lots) {
      const layout = lotLayoutFor(e, 0, true, 0)!;
      const reach = { 'com-high-1': 1.5, 'com-hotel-1': 6, 'mixed-1': 0, 'res-high-1': 1.8 }[
        e.id.replace(/-lot\d+x\d+$/, '')
      ]!;
      expect(layout.body.v0, e.id).toBeGreaterThanOrEqual(reach - 1e-9);
    }
  });

  it('parks at the kerb on its own footprint, as before', () => {
    for (const id of ['com-high-1', 'com-hotel-1', 'mixed-1', 'res-high-1']) {
      expect(drawsLotParking(byId(id)), id).toBe(false);
      expect(lotSpacesFor(byId(id)), id).toBeNull();
      expect(
        holdsLotParkingAt(byId(id), 10, 10, 0, () => false, null),
        id,
      ).toBe(true);
    }
  });
});
