/**
 * The lot a detached house is platted on: the land's standing, read off the
 * land-value field, picks one of four parcel sizes. Shared so the spawner and
 * anything that shows the plat read the same bands.
 */
import type { BuildingCatalogEntry, LotSize } from './types';

/** Smallest to largest, the order a lot gives way to a smaller one that fits. */
export const LOT_SIZES: readonly LotSize[] = ['half', 'normal', 'double', 'estate'];

/** The land-value floor (0–255) at which each lot size is platted; below normal's, a half lot. */
export const LOT_STANDING_FLOOR: Readonly<Record<LotSize, number>> = {
  half: 0,
  normal: 64,
  double: 160,
  estate: 224,
};

/** The largest lot the land at `landValue` warrants. */
export function lotForStanding(landValue: number): LotSize {
  let lot: LotSize = 'half';
  for (const size of LOT_SIZES) {
    if (landValue >= LOT_STANDING_FLOOR[size]) lot = size;
  }
  return lot;
}

/**
 * The candidates the plat allows: every kind that is not lotted, and of the
 * lotted ones only those on the largest lot the land warrants that has one
 * that fits, so a strip too shallow for the warranted lot plats the next
 * smaller one instead of nothing.
 */
export function platCandidates(
  fitting: readonly BuildingCatalogEntry[],
  landValue: number,
): BuildingCatalogEntry[] {
  const warranted = LOT_SIZES.indexOf(lotForStanding(landValue));
  let lot = -1;
  for (const e of fitting) {
    const rank = e.lot === undefined ? -1 : LOT_SIZES.indexOf(e.lot);
    if (rank <= warranted && rank > lot) lot = rank;
  }
  return fitting.filter((e) => e.lot === undefined || LOT_SIZES.indexOf(e.lot) === lot);
}
