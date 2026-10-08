/**
 * Reading a catalog entry's kind: the one place the kind union is narrowed
 * into what it means, so no caller tests strings of its own.
 */
import { ZoneType } from './types';
import type { BuildingCatalogEntry, BuildingKind, FarmKind, ResidentialKind } from './types';

const FARM_KINDS: ReadonlySet<BuildingKind> = new Set<BuildingKind>([
  'crops',
  'orchard',
  'pasture',
]);

/** The house-scale kinds: a pitched roof and a lot laid out from the street. */
const HOUSE_KINDS: ReadonlySet<BuildingKind> = new Set<BuildingKind>([
  'detached',
  'duplex',
  'fourplex',
  'townhouse',
]);

/** What a farm grows, or null for anything that is not a farm. */
export function farmKindOf(entry: BuildingCatalogEntry): FarmKind | null {
  if (entry.zone !== ZoneType.Agriculture || entry.kind === undefined) return null;
  return FARM_KINDS.has(entry.kind) ? (entry.kind as FarmKind) : null;
}

/** A home rather than a block: a detached house, a duplex, a fourplex or a townhouse row. */
export function isHouseKind(kind: BuildingKind | undefined): kind is ResidentialKind {
  return kind !== undefined && HOUSE_KINDS.has(kind);
}

/** The homes in a townhouse row on its normal lot, about 6 m of frontage each. */
const TOWNHOUSE_ROW_HOMES = 3;

/**
 * How many homes stand across a house-scale building's frontage: three in a
 * townhouse row, two sharing a duplex or a fourplex, one for a detached
 * house, whichever edge of the lot meets the street. Each is laid out with
 * its own door and drive.
 */
export function homesAcrossFrontage(kind: BuildingKind | undefined): number {
  switch (kind) {
    case 'townhouse':
      return TOWNHOUSE_ROW_HOMES;
    case 'duplex':
    case 'fourplex':
      return 2;
    default:
      return 1;
  }
}
