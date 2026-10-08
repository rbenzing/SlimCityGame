/**
 * The lot a detached house is platted on: the land's standing, read off the
 * land-value field, picks one of five parcel sizes. The top band warrants the
 * acre; where the frontage has only two free tiles the plat falls back to the
 * estate. Shared so the spawner and anything that shows the plat read the same bands.
 */
import { ZoneType, type BuildingCatalogEntry, type LotSize } from './types';

/** Smallest to largest, the order a lot gives way to a smaller one that fits. */
export const LOT_SIZES: readonly LotSize[] = ['half', 'normal', 'double', 'estate', 'acre'];

/** The land-value floor (0–255) at which each lot size is platted; below normal's, a half lot. The acre shares the estate's floor and wins it where it fits. */
export const LOT_STANDING_FLOOR: Readonly<Record<LotSize, number>> = {
  half: 0,
  normal: 64,
  double: 160,
  estate: 224,
  acre: 224,
};

/** A lot's tiles along its street and in from it; the catalog's upright footprint. */
export const LOT_EXTENT: Readonly<Record<LotSize, { frontage: number; depth: number }>> = {
  half: { frontage: 1, depth: 1 },
  normal: { frontage: 1, depth: 2 },
  double: { frontage: 2, depth: 2 },
  estate: { frontage: 2, depth: 3 },
  acre: { frontage: 3, depth: 3 },
};

/** The largest lot the land at `landValue` warrants. */
export function lotForStanding(landValue: number): LotSize {
  let lot: LotSize = 'half';
  for (const size of LOT_SIZES) {
    if (landValue >= LOT_STANDING_FLOOR[size]) lot = size;
  }
  return lot;
}

/** The zones whose kinds stand on the plat. */
export const PLATTED_ZONES: readonly ZoneType[] = [
  ZoneType.ResLow,
  ZoneType.ResMedium,
  ZoneType.ResMediumRow,
  ZoneType.ResHigh,
  ZoneType.ComLow,
  ZoneType.ComHigh,
  ZoneType.Mixed,
];

/** The zones cut as normal lots at every standing. */
const NORMAL_LOT_ZONES: ReadonlySet<ZoneType> = new Set([
  ZoneType.ResMedium,
  ZoneType.ResMediumRow,
  ZoneType.ResHigh,
  ZoneType.ComLow,
  ZoneType.ComHigh,
  ZoneType.Mixed,
]);

/** The zones that also cut a half lot, so a strip one tile deep still grows a corner shop. */
const HALF_LOT_ZONES: ReadonlySet<ZoneType> = new Set([ZoneType.ComLow]);

/** The lot sizes a zone plats: the normal-lot zones are cut as normal lots (shops also as half lots), every other zone any size. */
export function lotsOfZone(zone: ZoneType): readonly LotSize[] {
  if (HALF_LOT_ZONES.has(zone)) return ['half', 'normal'];
  return NORMAL_LOT_ZONES.has(zone) ? ['normal'] : LOT_SIZES;
}

/** The lot the plat warrants in `zone` at `landValue`: the normal-lot zones are normal whatever the standing. */
export function warrantedLot(zone: ZoneType, landValue: number): LotSize {
  return NORMAL_LOT_ZONES.has(zone) ? 'normal' : lotForStanding(landValue);
}

/**
 * The candidates the plat allows: every kind that is not lotted, and of the
 * lotted ones only those on the largest lot the zone's land warrants that has
 * one that fits, so a strip too shallow for the warranted lot plats the next
 * smaller one instead of nothing. A lot the zone does not plat is never a
 * candidate's lot.
 */
export function platCandidates(
  fitting: readonly BuildingCatalogEntry[],
  zone: ZoneType,
  landValue: number,
): BuildingCatalogEntry[] {
  const warranted = LOT_SIZES.indexOf(warrantedLot(zone, landValue));
  const allowed = lotsOfZone(zone);
  let lot = -1;
  for (const e of fitting) {
    if (e.lot !== undefined && !allowed.includes(e.lot)) continue;
    const rank = e.lot === undefined ? -1 : LOT_SIZES.indexOf(e.lot);
    if (rank <= warranted && rank > lot) lot = rank;
  }
  return fitting.filter((e) => e.lot === undefined || LOT_SIZES.indexOf(e.lot) === lot);
}
