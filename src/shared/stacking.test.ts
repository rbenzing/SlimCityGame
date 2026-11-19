import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import { BIG_TOWN_MILESTONE, BUILT_IN_PARKING_MILESTONE, ceilingMilestone } from './constants';
import { FLOOR_HEIGHT_METERS, bodyPlateM2, grossFloorM2, storeysOf } from './floorarea';
import { BUILT_IN_LEVELS_BELOW, builtInParking, parksInGarage } from './garage';
import { drawsLotParking } from './parkingcode';
import { MAX_STACKED_HEIGHT_M, STACKING_KINDS, stackedFormsOf } from './stacking';
import type { BuildingCatalogEntry } from './types';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const built = catalog.filter((e) => e.stacked !== undefined);
const spread = catalog.filter((e) => e.stacked === undefined);
const baseOf = (e: BuildingCatalogEntry): BuildingCatalogEntry =>
  spread.find((s) => e.id.startsWith(`${s.id}-up`))!;

describe('the built-in forms', () => {
  it('are exactly the forms recomputed from the spread catalog, in order', () => {
    expect(built).toEqual(stackedFormsOf(spread).entries);
    expect(built.length).toBeGreaterThan(0);
  });

  it('come last in the catalog, after every spread entry', () => {
    const firstBuilt = catalog.findIndex((e) => e.stacked !== undefined);
    expect(catalog.slice(firstBuilt).every((e) => e.stacked !== undefined)).toBe(true);
  });

  it('exist only for kinds that stack, never over the tallest a rebuild goes', () => {
    for (const e of built) {
      expect(STACKING_KINDS.has(e.kind!), e.id).toBe(true);
      expect(e.height, e.id).toBeLessThanOrEqual(MAX_STACKED_HEIGHT_M);
    }
    const { skipped } = stackedFormsOf(spread);
    expect(skipped.length).toBeGreaterThan(0);
    for (const s of skipped) expect(s.heightM, s.id).toBeGreaterThan(MAX_STACKED_HEIGHT_M);
  });

  it('have one form for each lot a building of the level below stands on', () => {
    for (const e of built) {
      const next = baseOf(e);
      expect(next, e.id).toBeDefined();
      const below = catalog.filter(
        (s) =>
          s.kind === e.kind &&
          s.level === (e.level ?? 0) - 1 &&
          s.footprint.w === e.footprint.w &&
          s.footprint.d === e.footprint.d,
      );
      expect(below.length, e.id).toBeGreaterThan(0);
    }
    expect(new Set(built.map((e) => e.id)).size).toBe(built.length);
  });

  it("carry the next level's people, power, water and look, on the lot they stand on", () => {
    for (const e of built) {
      const next = baseOf(e);
      for (const key of [
        'name',
        'level',
        'kind',
        'zone',
        'jobs',
        'residents',
        'units',
        'powerUse',
        'waterUse',
        'pollution',
        'color',
        'category',
      ] as const) {
        expect(e[key], `${e.id} ${key}`).toEqual(next[key]);
      }
      expect(e.bodyFootprint, e.id).toBeUndefined();
    }
  });

  it("hold the next level's floor in working storeys, never counting a parking storey", () => {
    for (const e of built) {
      const next = baseOf(e);
      const working = e.stacked!.workingStoreys;
      expect(storeysOf(e), e.id).toBe(working);
      expect(bodyPlateM2(e) * working, e.id).toBeGreaterThanOrEqual(grossFloorM2(next) - 1e-6);
      expect(bodyPlateM2(e) * (working - 1), e.id).toBeLessThan(grossFloorM2(next));
    }
  });

  it("stand the working storeys and the parking storeys above ground, or the next level's own height", () => {
    for (const e of built) {
      const next = baseOf(e);
      const { aboveStoreys } = builtInParking(e);
      if (e.stacked!.workingStoreys === storeysOf(next) && aboveStoreys === 0) {
        expect(e.height, e.id).toBe(next.height);
      } else {
        const storeys = e.stacked!.workingStoreys + aboveStoreys;
        expect(e.height, e.id).toBeCloseTo(storeys * FLOOR_HEIGHT_METERS, 1);
      }
    }
  });

  it('unlock at the latest of the next level, the ceiling of their height and Big Town', () => {
    expect(BUILT_IN_PARKING_MILESTONE).toBe(BIG_TOWN_MILESTONE);
    for (const e of built) {
      const next = baseOf(e);
      expect(e.unlockMilestone, e.id).toBe(
        Math.max(next.unlockMilestone, ceilingMilestone(e.height), BUILT_IN_PARKING_MILESTONE),
      );
    }
  });
});

describe('the parking a built-in form carries', () => {
  it('holds every space its floor owes, below ground first and two levels at most', () => {
    for (const e of built) {
      const p = builtInParking(e);
      expect(p.belowSpaces + p.aboveSpaces, e.id).toBeGreaterThanOrEqual(p.owed);
      expect(p.belowLevels, e.id).toBeLessThanOrEqual(BUILT_IN_LEVELS_BELOW);
      if (p.aboveStoreys > 0) expect(p.belowLevels, e.id).toBe(BUILT_IN_LEVELS_BELOW);
      if (p.belowLevels === 1) expect(p.belowSpaces - p.owed, e.id).toBeLessThan(p.belowSpaces);
    }
  });

  it('counts a shop on two tiles: five spaces owed, one level of 26 below, none above', () => {
    const shop = built.find((e) => e.id === 'com-shop-2-up1x2')!;
    expect(builtInParking(shop)).toEqual({
      owed: 5,
      belowLevels: 1,
      belowSpaces: 26,
      aboveStoreys: 0,
      aboveSpaces: 0,
    });
  });

  it('puts what two levels below cannot hold on storeys above ground', () => {
    const restaurant = built.find((e) => e.id === 'com-restaurant-3-up1x2')!;
    const p = builtInParking(restaurant);
    expect(p.belowLevels).toBe(BUILT_IN_LEVELS_BELOW);
    expect(p.aboveStoreys).toBeGreaterThan(0);
    expect(restaurant.height).toBeCloseTo(
      (restaurant.stacked!.workingStoreys + p.aboveStoreys) * FLOOR_HEIGHT_METERS,
      1,
    );
  });

  it('parks in neither a garage deck nor a car park on the lot', () => {
    for (const e of built) {
      expect(parksInGarage(e), e.id).toBe(false);
      expect(drawsLotParking(e), e.id).toBe(false);
    }
  });
});
