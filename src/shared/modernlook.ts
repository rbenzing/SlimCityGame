import { SMALL_CITY_MILESTONE, STOREY_CEILING_M } from './constants';
import type { BuildingCatalogEntry } from './types';

/** A building taller than this (m) is drawn modern: the tallest a Small City raises, which only a Grand City or a Metropolis passes. */
export const MODERN_LOOK_MIN_HEIGHT_M: number = STOREY_CEILING_M[SMALL_CITY_MILESTONE]!;

/**
 * Whether a building is drawn with the modern look, a curtain wall and a
 * screened crown: a zoned home or business over the Small City ceiling,
 * whatever its kind or level. A works, a farm, a civic building or a
 * utility is never glazed for its height. Pure.
 */
export function isModernTall(entry: BuildingCatalogEntry): boolean {
  if (entry.category !== 'res' && entry.category !== 'com') return false;
  if (entry.zone === undefined) return false;
  return entry.height > MODERN_LOOK_MIN_HEIGHT_M;
}
