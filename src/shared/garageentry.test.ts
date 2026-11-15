import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import type { BuildingCatalogEntry } from './types';
import {
  GARAGE_ENTRY_CLEAR_M,
  GARAGE_GROUND_M,
  GARAGE_SPANDREL_M,
  GARAGE_TIER_M,
  garageEntranceWalk,
  garageFor,
  garageTopM,
  parksInGarage,
} from './garage';
import { ENTRANCE_WALK_M } from './parkingcode';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const garaged = catalog.filter((e) => parksInGarage(e) && garageFor(e));

describe('a garage’s vehicle entrance', () => {
  it('is an opening at least 3.0 m wide and 2.1 m clear, on the deck face the drive ends at', () => {
    expect(garaged.length).toBeGreaterThan(0);
    expect(GARAGE_ENTRY_CLEAR_M).toBeGreaterThanOrEqual(2.1);
    for (const e of garaged) {
      const g = garageFor(e)!;
      expect(g.drive.u1 - g.drive.u0, e.id).toBeGreaterThanOrEqual(3.0);
      expect(g.drive.v1, e.id).toBeCloseTo(g.deck.v0, 9);
    }
  });

  it('joins the street line: the drive starts at the lot’s street edge and stays on the lot', () => {
    for (const e of garaged) {
      const g = garageFor(e)!;
      expect(g.drive.v0, e.id).toBe(0);
      expect(g.drive.u0, e.id).toBeGreaterThanOrEqual(g.body.u1);
      expect(g.drive.u1, e.id).toBeLessThanOrEqual(g.lotW + 1e-9);
    }
  });
});

describe('a garage’s deck top', () => {
  it('is its top tier’s floor and barrier', () => {
    for (const e of garaged) {
      const g = garageFor(e)!;
      expect(garageTopM(g), e.id).toBeCloseTo(
        GARAGE_GROUND_M + (g.tiers - 1) * GARAGE_TIER_M + GARAGE_SPANDREL_M,
        9,
      );
    }
  });
});

describe('a dense block’s walk from its door to the footway', () => {
  it('is at least the entrance walk wide, centred on the body, from the street line to its face', () => {
    for (const e of garaged) {
      const g = garageFor(e)!;
      const walk = garageEntranceWalk(g);
      expect(walk.u1 - walk.u0, e.id).toBeGreaterThanOrEqual(ENTRANCE_WALK_M - 1e-9);
      expect((walk.u0 + walk.u1) / 2, e.id).toBeCloseTo((g.body.u0 + g.body.u1) / 2, 9);
      expect(walk.v0, e.id).toBe(0);
      expect(walk.v1, e.id).toBeCloseTo(g.body.v0, 9);
    }
  });
});
