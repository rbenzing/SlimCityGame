/**
 * Who lives in a building. The one place that turns a catalog entry's
 * `residents` into people: everything that counts residents asks here, so no
 * two readers can disagree on whether a building is full.
 */
import { BuildingState } from './types';
import type { BuildingCatalogEntry, BuildingInstance } from './types';

type Occupancy = Pick<BuildingInstance, 'state' | 'vacancies'>;

/** Vacancies held to what the building can have: a whole number from 0 to its residents. */
export function clampedVacancies(
  spec: BuildingCatalogEntry,
  vacancies: number | undefined,
): number {
  return Math.max(0, Math.min(spec.residents ?? 0, Math.floor(vacancies ?? 0)));
}

/** The empty places in an Active building; a building that is not Active holds none. */
export function vacanciesOf(spec: BuildingCatalogEntry, inst: Occupancy): number {
  return inst.state === BuildingState.Active ? clampedVacancies(spec, inst.vacancies) : 0;
}

/** The residents living in a building: 0 unless Active, else its residents less its vacancies. */
export function occupiedResidents(spec: BuildingCatalogEntry, inst: Occupancy): number {
  return inst.state === BuildingState.Active
    ? (spec.residents ?? 0) - clampedVacancies(spec, inst.vacancies)
    : 0;
}
