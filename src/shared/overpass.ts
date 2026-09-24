/**
 * The rules for a road passing over another road or a railway: how high it
 * must stand, and what shape a crossing must have. Pure, so the worker that
 * lays one and anything that previews one read the same answer.
 */
import { BRIDGE_MAX_GRADE, OVERPASS_CLEARANCE_M, OVERPASS_RAIL_CLEARANCE_M } from './constants';
import { girderDepthFor } from './bridgestyle';
import { flowDirection, isRailTier, RoadFlow } from './types';
import type { RoadTier, TilePoint } from './types';

/**
 * How far the over road's deck surface must stand above the under road's:
 * the clearance the road or railway beneath needs, plus the depth of the
 * over road's own girder, since what has to clear is its underside.
 */
export function overpassRise(overTier: RoadTier, underTier: RoadTier): number {
  const clearance = isRailTier(underTier) ? OVERPASS_RAIL_CLEARANCE_M : OVERPASS_CLEARANCE_M;
  return clearance + girderDepthFor(overTier);
}

/**
 * How a drag passing through a tile that already holds a road meets that road.
 *
 * - `across`: the road below runs straight across the drag at right angles and
 *   carries on both sides, the drag runs straight through, and nothing below
 *   turns off along the drag. The one shape an overpass may take.
 * - `skew`: the road below is across the drag, but not cleanly — the drag
 *   turns or ends on the tile, the road below ends there, or a road below
 *   joins it along the drag's line. Nothing may cross over that.
 * - `along`: the road below does not cross the drag at all — the drag re-lays
 *   it, or meets it end-on. Not a crossing.
 */
export type CrossingShape = 'across' | 'skew' | 'along';

/**
 * The shape of the crossing at `tiles[i]`. `roadBelowAt` says whether a tile
 * holds a road at the level of the one under `tiles[i]` — one it could join,
 * within a grade step — so an approach ramp already climbing away does not
 * count as a road below.
 */
export function crossingShape(
  tiles: readonly TilePoint[],
  i: number,
  roadBelowAt: (x: number, z: number) => boolean,
): CrossingShape {
  const t = tiles[i]!;
  const prev = tiles[i - 1];
  const next = tiles[i + 1];
  const alongX = (prev ?? next) !== undefined && (prev ?? next)!.z === t.z;
  // The drag's cross axis at this tile: z for a drag running along x.
  const [cx, cz] = alongX ? [0, 1] : [1, 0];
  const sideA = roadBelowAt(t.x + cx, t.z + cz);
  const sideB = roadBelowAt(t.x - cx, t.z - cz);
  if (!sideA && !sideB) return 'along';
  const straight =
    prev !== undefined &&
    next !== undefined &&
    prev.x + next.x === 2 * t.x &&
    prev.z + next.z === 2 * t.z &&
    Math.abs(prev.x - t.x) + Math.abs(prev.z - t.z) === 1;
  if (!straight || !sideA || !sideB) return 'skew';
  if (roadBelowAt(prev.x, prev.z) || roadBelowAt(next.x, next.z)) return 'skew';
  return 'across';
}

/**
 * The axis a road runs along, read from its stored flow byte: 'x' heading east
 * or west, 'z' heading north or south, null where it recorded no heading. A
 * road passing over a crossing always has one — a drag laid it.
 */
export function axisOfFlow(stored: number): 'x' | 'z' | null {
  const d = flowDirection(stored);
  if (d === RoadFlow.East || d === RoadFlow.West) return 'x';
  if (d === RoadFlow.North || d === RoadFlow.South) return 'z';
  return null;
}

/** Whether two decks are near enough in height to join: one grade step. */
export function atOneLevel(deckA: number, deckB: number): boolean {
  return Math.abs(deckA - deckB) <= BRIDGE_MAX_GRADE;
}
