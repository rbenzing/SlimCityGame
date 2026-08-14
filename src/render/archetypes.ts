/**
 * Building archetypes: what a building IS, decided from its catalog entry, and
 * which parts its silhouette is assembled from.
 *
 * A warehouse, a factory and an office differ today only in height and wall
 * colour, so the skyline never says what anything does. An archetype is a
 * recipe over one shared kit of parts — a loading dock, a monitor roof, a stack,
 * a roof array, a canopy, a signage band — not a bespoke model per building.
 *
 * Pure: every export is a function of the catalog entry alone, so archetype
 * choice is testable without a scene and identical on every machine.
 */
import { ZoneType, type BuildingCatalogEntry } from '../shared/types';

export type BuildingArchetype =
  /** Low slab, roll-up doors, a loading dock. Industry at its first level. */
  | 'warehouse'
  /** Monitor roof and a stack: industry that processes something. */
  | 'factory'
  /** Clean industry — a roof array and, pointedly, no stack. */
  | 'greenWorks'
  /** A shop at street level: canopy over the frontage, signage above it. */
  | 'storefront'
  /** Bigger retail and offices: a signage band, no canopy. */
  | 'retailBlock'
  /** Detached and row housing, which already carries a pitched roof. */
  | 'house'
  /** Denser housing: flat-roofed, no shopfront. */
  | 'apartment'
  /** Everything the kit has nothing to say about. */
  | 'plain';

/** Parts the kit can hang on a building. An archetype is a set of these. */
export type BuildingPart =
  | 'loadingDock'
  | 'rollUpDoors'
  | 'monitorRoof'
  | 'roofArray'
  | 'canopy'
  | 'signageBand';

/**
 * Whether an industrial building is the CLEAN kind, taken from whether it
 * actually pollutes rather than from a name or a level. Tying the silhouette to
 * the simulated property is the point: a building with no stack is a building
 * that emits nothing, and the player can read the difference from the air.
 */
export function isCleanIndustry(entry: BuildingCatalogEntry): boolean {
  return entry.category === 'ind' && (entry.pollution ?? 0) === 0;
}

/** A house keeps a pitched roof; anything denser is flat-topped. */
function isHouseZone(zone: number | undefined): boolean {
  return zone === ZoneType.ResLow || zone === ZoneType.ResMediumRow;
}

export function archetypeFor(entry: BuildingCatalogEntry): BuildingArchetype {
  if (entry.category === 'ind') {
    if (isCleanIndustry(entry)) return 'greenWorks';
    return (entry.level ?? 1) >= 2 ? 'factory' : 'warehouse';
  }
  if (entry.category === 'com') {
    return (entry.level ?? 1) >= 2 ? 'retailBlock' : 'storefront';
  }
  if (entry.category === 'res') {
    return isHouseZone(entry.zone) ? 'house' : 'apartment';
  }
  return 'plain';
}

const PARTS: Readonly<Record<BuildingArchetype, readonly BuildingPart[]>> = {
  warehouse: ['loadingDock', 'rollUpDoors'],
  factory: ['monitorRoof'],
  greenWorks: ['roofArray'],
  storefront: ['canopy', 'signageBand'],
  retailBlock: ['signageBand'],
  house: [],
  apartment: [],
  plain: [],
};

export function partsFor(entry: BuildingCatalogEntry): readonly BuildingPart[] {
  return PARTS[archetypeFor(entry)];
}

export function hasPart(entry: BuildingCatalogEntry, part: BuildingPart): boolean {
  return partsFor(entry).includes(part);
}
