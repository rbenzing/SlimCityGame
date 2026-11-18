/**
 * The roomy lot of each commercial and industrial kind: the smallest lot, at
 * most four tiles deep and no narrower than the compact one, on which the code
 * car park is laid with a 1.5 m planted strip free inside every lot line, the
 * body covers no more than the median built share of a site (0.28 retail,
 * 0.32 industry), the layout keeps a walk to the door and the yards the kind
 * needs. Lots in tiles, frontage by depth, per level. A filling station and a
 * chemical works already stand under that share on their compact lots and
 * keep them.
 */
import type { BuildingCatalogEntry, BuildingKind } from './types';

type Lot = Readonly<{ w: number; d: number }>;

export const ROOMY_LOT_TILES: Readonly<Partial<Record<BuildingKind, readonly [Lot, Lot, Lot]>>> = {
  shop: [
    { w: 1, d: 2 },
    { w: 2, d: 2 },
    { w: 4, d: 2 },
  ],
  restaurant: [
    { w: 1, d: 3 },
    { w: 3, d: 2 },
    { w: 6, d: 2 },
  ],
  strip: [
    { w: 5, d: 2 },
    { w: 7, d: 2 },
    { w: 9, d: 2 },
  ],
  supermarket: [
    { w: 5, d: 3 },
    { w: 7, d: 3 },
    { w: 9, d: 4 },
  ],
  workshop: [
    { w: 3, d: 2 },
    { w: 3, d: 3 },
    { w: 5, d: 3 },
  ],
  warehouse: [
    { w: 5, d: 3 },
    { w: 6, d: 3 },
    { w: 8, d: 4 },
  ],
  factory: [
    { w: 3, d: 3 },
    { w: 5, d: 3 },
    { w: 6, d: 3 },
  ],
  flex: [
    { w: 2, d: 3 },
    { w: 4, d: 2 },
    { w: 5, d: 3 },
  ],
  foodplant: [
    { w: 5, d: 3 },
    { w: 6, d: 3 },
    { w: 8, d: 4 },
  ],
  metals: [
    { w: 4, d: 4 },
    { w: 5, d: 4 },
    { w: 6, d: 4 },
  ],
  paper: [
    { w: 5, d: 3 },
    { w: 6, d: 4 },
    { w: 8, d: 4 },
  ],
};

/** The roomy lot of `entry`'s kind at its level, or undefined for a kind that has none. */
export function roomyLotOf(entry: BuildingCatalogEntry): Lot | undefined {
  if (entry.kind === undefined || entry.level === undefined) return undefined;
  return ROOMY_LOT_TILES[entry.kind]?.[entry.level - 1];
}
