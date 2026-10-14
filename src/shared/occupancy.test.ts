import { describe, expect, it } from 'vitest';
import { BuildingState, ZoneType } from './types';
import type { BuildingCatalogEntry } from './types';
import { clampedVacancies, occupiedResidents, vacanciesOf } from './occupancy';

const flats: BuildingCatalogEntry = {
  id: 'flats',
  name: 'Flats',
  category: 'res',
  zone: ZoneType.ResLow,
  level: 1,
  footprint: { w: 1, d: 1 },
  height: 5,
  color: 0,
  residents: 12,
  powerUse: 0,
  waterUse: 0,
  cost: 0,
  upkeep: 0,
  unlockMilestone: 0,
};
const shop: BuildingCatalogEntry = { ...flats, id: 'shop', category: 'com', residents: undefined };

describe('occupiedResidents', () => {
  it('is the catalog residents of a building that has lost nobody', () => {
    expect(occupiedResidents(flats, { state: BuildingState.Active })).toBe(12);
  });

  it('takes the vacancies off, and never goes below 0', () => {
    expect(occupiedResidents(flats, { state: BuildingState.Active, vacancies: 5 })).toBe(7);
    expect(occupiedResidents(flats, { state: BuildingState.Active, vacancies: 12 })).toBe(0);
    expect(occupiedResidents(flats, { state: BuildingState.Active, vacancies: 40 })).toBe(0);
  });

  it.each([BuildingState.Constructing, BuildingState.Abandoned])(
    'is 0 in state %s, whatever the catalog says',
    (state) => {
      expect(occupiedResidents(flats, { state })).toBe(0);
      expect(vacanciesOf(flats, { state, vacancies: 3 })).toBe(0);
    },
  );

  it('is 0 for a building with no residents', () => {
    expect(occupiedResidents(shop, { state: BuildingState.Active })).toBe(0);
  });
});

describe('vacancies', () => {
  it('are held to a whole number from 0 to the residents', () => {
    expect(clampedVacancies(flats, undefined)).toBe(0);
    expect(clampedVacancies(flats, -2)).toBe(0);
    expect(clampedVacancies(flats, 3.9)).toBe(3);
    expect(clampedVacancies(flats, 99)).toBe(12);
    expect(clampedVacancies(shop, 4)).toBe(0);
  });

  it('are the empty places of an Active building', () => {
    expect(vacanciesOf(flats, { state: BuildingState.Active, vacancies: 5 })).toBe(5);
    expect(vacanciesOf(flats, { state: BuildingState.Active })).toBe(0);
  });
});
