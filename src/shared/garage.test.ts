import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import type { BuildingCatalogEntry } from './types';
import { TILE_METERS } from './constants';
import { bodyMetresFor } from './floorarea';
import {
  GARAGE_MAX_TIERS,
  GARAGE_MIN_AISLE_M,
  GARAGE_TIER_M,
  garageFor,
  garageOpenness,
  garageRequirement,
  garageTiers,
  parksInGarage,
} from './garage';
import { STALL_LENGTH_M, STALL_WIDTH_M, stallsInRow } from './parkingcode';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const dense = catalog.filter((e) => parksInGarage(e));
const LEVEL_ONE = ['com-high-1', 'com-hotel-1', 'mixed-1', 'res-high-1'];

describe('which kinds park in a garage', () => {
  it('is every tower and the office, hotel, mixed-use block and mid-rise from level 2', () => {
    expect(dense.map((e) => e.id).sort()).toEqual(
      [
        'com-high-2',
        'com-hotel-2',
        'com-hotel-3',
        'com-office-2',
        'mixed-2',
        'mixed-3',
        'res-high-2',
        'res-high-3',
        'res-tower-1',
        'res-tower-2',
        'res-tower-3',
      ].sort(),
    );
  });

  it('leaves the four level-1 kinds as they are', () => {
    for (const id of LEVEL_ONE) {
      const e = catalog.find((c) => c.id === id)!;
      expect(parksInGarage(e), id).toBe(false);
      expect(garageFor(e), id).toBeNull();
    }
  });
});

describe('what each kind needs', () => {
  const required = (id: string): number => garageRequirement(catalog.find((e) => e.id === id)!);

  it('holds an office to one space per 1,000 sq ft of floor', () => {
    // 40.8 m x 40.8 m over eight storeys is 143.35 thousand sq ft.
    expect(required('com-office-2')).toBe(144);
    expect(required('com-high-2')).toBe(287);
  });

  it('holds a hotel to half a space a room at 45 m² a room', () => {
    expect(required('com-hotel-2')).toBe(50);
    expect(required('com-hotel-3')).toBe(148);
  });

  it('holds apartments to 0.71 a home', () => {
    expect(required('res-high-2')).toBe(Math.ceil(47 * 0.71));
    expect(required('res-tower-3')).toBe(Math.ceil(285 * 0.71));
  });

  it('holds a mixed-use block to its homes at the apartment rate and its shop floor at the office rate', () => {
    // 40 homes, and a ground floor of 27.2 m x 27.2 m.
    const shopSqFt = 27.2 * 27.2 * 10.764;
    expect(required('mixed-2')).toBe(Math.ceil(40 * 0.71 + shopSqFt / 1000));
  });
});

describe('a garage on its lot', () => {
  const garaged = dense.filter((e) => garageFor(e));

  it('stands on every kind but a hotel on a 2 x 2 lot, whose porte-cochère leaves no rear', () => {
    expect(dense.filter((e) => !garageFor(e)).map((e) => e.id)).toEqual(['com-hotel-2']);
  });

  it('keeps the body’s plate, slides it behind its street projection and puts the deck behind it, inside the lot', () => {
    for (const e of garaged) {
      const g = garageFor(e)!;
      const body = bodyMetresFor(e);
      expect(g.body.u1 - g.body.u0, e.id).toBeCloseTo(body.w, 9);
      expect(g.body.v1 - g.body.v0, e.id).toBeCloseTo(body.d, 9);
      expect(g.body.u0, e.id).toBeGreaterThanOrEqual(0);
      expect(g.body.v0, e.id).toBeGreaterThanOrEqual(0);
      expect(g.deck.v0, e.id).toBeGreaterThanOrEqual(g.body.v1 - 1e-9);
      expect(g.deck.v1, e.id).toBeCloseTo(e.footprint.d * TILE_METERS, 9);
      expect(g.deck.u0).toBe(0);
      expect(g.deck.u1).toBeCloseTo(e.footprint.w * TILE_METERS, 9);
    }
  });

  it('lays one single row on a 2 x 2 lot and a double module on a 3 x 3', () => {
    for (const e of garaged) {
      const g = garageFor(e)!;
      const rows = e.footprint.w === 2 ? 1 : e.id.startsWith('com-hotel') ? 1 : 2;
      expect(g.rows, e.id).toHaveLength(rows);
    }
  });

  it('counts a tier’s stalls by the shared row count, and no stall stands in an aisle or on the stair', () => {
    for (const e of garaged) {
      const g = garageFor(e)!;
      const counted = g.rows.reduce((sum, r) => sum + r.count - r.skipped, 0);
      expect(g.stallsPerTier, e.id).toBe(counted);
      expect(g.stalls, e.id).toHaveLength(counted);
      for (const r of g.rows) {
        expect(r.count, e.id).toBe(stallsInRow(r.rect.u1 - r.rect.u0 - 0.5));
        expect(r.rect.v1 - r.rect.v0, e.id).toBeCloseTo(STALL_LENGTH_M, 9);
      }
      for (const s of g.stalls) {
        const inAisle =
          s.v - STALL_LENGTH_M / 2 < g.aisle.v1 && s.v + STALL_LENGTH_M / 2 > g.aisle.v0;
        expect(inAisle, `${e.id} ${s.u},${s.v}`).toBe(false);
        const onStair =
          s.u + STALL_WIDTH_M / 2 > g.stair.u0 + 1e-6 &&
          s.u - STALL_WIDTH_M / 2 < g.stair.u1 - 1e-6 &&
          s.v > g.stair.v0 &&
          s.v < g.stair.v1;
        expect(onStair, `${e.id} ${s.u},${s.v}`).toBe(false);
      }
    }
  });

  it('keeps an aisle of at least the dial between its rows, and rows inside the deck', () => {
    for (const e of garaged) {
      const g = garageFor(e)!;
      expect(g.aisle.v1 - g.aisle.v0, e.id).toBeGreaterThanOrEqual(GARAGE_MIN_AISLE_M - 1e-6);
      for (const r of g.rows) {
        expect(r.rect.v0).toBeGreaterThanOrEqual(g.deck.v0 - 1e-6);
        expect(r.rect.v1).toBeLessThanOrEqual(g.deck.v1 + 1e-6);
      }
    }
  });

  it('asks for tiers as the requirement over a tier’s stalls, rounded up, at most six, and a shortfall is the kerb’s', () => {
    for (const e of garaged) {
      const g = garageFor(e)!;
      expect(g.required, e.id).toBe(garageRequirement(e));
      expect(g.tiers, e.id).toBe(
        Math.min(GARAGE_MAX_TIERS, Math.max(1, Math.ceil(g.required / g.stallsPerTier))),
      );
      expect(g.provided, e.id).toBe(g.tiers * g.stallsPerTier);
      expect(g.shortfall, e.id).toBe(Math.max(0, g.required - g.provided));
    }
    expect(garageTiers(0, 14)).toBe(1);
    expect(garageTiers(15, 14)).toBe(2);
    expect(garageTiers(10_000, 14)).toBe(GARAGE_MAX_TIERS);
  });

  it('puts the drive down the high-u side, between the body and the lot line, to the deck’s entry', () => {
    for (const e of garaged) {
      const g = garageFor(e)!;
      expect(g.drive.u1, e.id).toBeCloseTo(g.lotW, 9);
      expect(g.drive.u0, e.id).toBeGreaterThan(g.body.u1);
      expect(g.drive.v0).toBe(0);
      expect(g.drive.v1).toBeCloseTo(g.deck.v0, 9);
      expect(g.drive.u1 - g.drive.u0).toBeGreaterThanOrEqual(5);
    }
  });

  it('opens at least 20% of each tier’s wall along at least 40% of its perimeter', () => {
    for (const e of garaged) {
      const { perimeter, wall } = garageOpenness(garageFor(e)!);
      expect(perimeter, e.id).toBeGreaterThanOrEqual(0.4);
      expect(wall, e.id).toBeGreaterThanOrEqual(0.2);
    }
  });

  it('climbs between tiers by a ramp no steeper than 15%, in the aisle', () => {
    for (const e of garaged) {
      const g = garageFor(e)!;
      expect(GARAGE_TIER_M / (g.ramp.u1 - g.ramp.u0), e.id).toBeLessThanOrEqual(0.15 + 1e-9);
      expect(g.ramp.v0).toBeGreaterThanOrEqual(g.aisle.v0 - 1e-9);
      expect(g.ramp.v1).toBeLessThanOrEqual(g.aisle.v1 + 1e-9);
      expect(g.ramp.u1).toBeLessThanOrEqual(g.drive.u0);
    }
  });
});
