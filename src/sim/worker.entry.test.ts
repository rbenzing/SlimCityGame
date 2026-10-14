import { describe, expect, it } from 'vitest';
import { BuildingState, ZoneType } from '../shared/types';
import type { BuildingCatalogEntry, BuildingInstance } from '../shared/types';
import { roadNoiseEmission, selectionOccupancy } from './worker.entry';

describe('selectionOccupancy (pure)', () => {
  const base = {
    id: 'x',
    name: 'X',
    footprint: { w: 1, d: 1 },
    height: 5,
    color: 0,
    powerUse: 0,
    waterUse: 0,
    cost: 0,
    upkeep: 0,
    unlockMilestone: 0,
  };
  const res: BuildingCatalogEntry = {
    ...base,
    category: 'res',
    zone: ZoneType.ResLow,
    kind: 'fourplex',
    units: 4,
    residents: 9,
  };
  const com: BuildingCatalogEntry = { ...base, category: 'com', zone: ZoneType.ComLow, jobs: 6 };
  const util: BuildingCatalogEntry = { ...base, category: 'utility', utility: { powerMW: 5 } };

  const state = (
    s: BuildingState,
    vacancies?: number,
  ): Pick<BuildingInstance, 'state' | 'vacancies'> =>
    vacancies === undefined ? { state: s } : { state: s, vacancies };

  it('fills residents + households for residential (capacity = the homes in the building)', () => {
    expect(selectionOccupancy(res, state(1))).toEqual({
      residents: 9,
      households: { occupied: 4, capacity: 4 },
    });
  });

  it('reports zero occupied residents/households for non-Active residential', () => {
    expect(selectionOccupancy(res, state(0))).toEqual({
      residents: 0,
      households: { occupied: 0, capacity: 4 },
    });
    expect(selectionOccupancy(res, state(2))).toEqual({
      residents: 0,
      households: { occupied: 0, capacity: 4 },
    });
  });

  it('reports the residents still living there, and the homes they fill, once some have died', () => {
    expect(selectionOccupancy(res, state(1, 2))).toEqual({
      residents: 7,
      households: { occupied: 4, capacity: 4 },
    });
    expect(selectionOccupancy(res, state(1, 5))).toEqual({
      residents: 4,
      households: { occupied: 2, capacity: 4 },
    });
    expect(selectionOccupancy(res, state(1, 9))).toEqual({
      residents: 0,
      households: { occupied: 0, capacity: 4 },
    });
  });

  it('reads a farm family the same way', () => {
    const farm: BuildingCatalogEntry = { ...com, residents: 3 };
    expect(selectionOccupancy(farm, state(1, 1))).toEqual({ jobs: 6, residents: 2 });
  });

  it('fills jobs for com/ind, Active only', () => {
    expect(selectionOccupancy(com, state(1))).toEqual({ jobs: 6 });
    expect(selectionOccupancy(com, state(2))).toEqual({ jobs: 0 });
  });

  it('leaves all fields unset for services and utilities', () => {
    expect(selectionOccupancy(util, state(1))).toEqual({});
  });
});

describe('roadNoiseEmission (pure)', () => {
  it('emits nothing for a zero-volume (quiet) road, whatever the tier multiplier', () => {
    expect(roadNoiseEmission(0, 1)).toBe(0);
    expect(roadNoiseEmission(0, 2)).toBe(0);
    expect(roadNoiseEmission(0, 3)).toBe(0);
  });

  it('scales the base emission by the tier noiseMult (gravel 2×, standard 1×, highway 3×)', () => {
    const standard = roadNoiseEmission(40, 1);
    expect(standard).toBeGreaterThan(0);
    expect(roadNoiseEmission(40, 2)).toBe(2 * standard); // gravel
    expect(roadNoiseEmission(40, 3)).toBe(3 * standard); // highway
  });

  it('grows with assigned traffic volume, capped so one emit can never blow past byte range', () => {
    expect(roadNoiseEmission(80, 1)).toBeGreaterThan(roadNoiseEmission(8, 1));
    // Cap: an absurd-volume highway edge still stays a legal per-emit byte amount.
    expect(roadNoiseEmission(1_000_000, 3)).toBeLessThanOrEqual(255);
    expect(roadNoiseEmission(1_000_000, 3)).toBe(roadNoiseEmission(2_000_000, 3));
  });
});
