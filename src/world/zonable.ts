/**
 * The ONE shared "is this tile zonable" predicate (the standard perpendicular-frontage model). This
 * pure module is the single source of truth for BOTH the visual zoning grid
 * (render/zonegrid.ts) and zone painting (world/grid.ts setZones) — they must
 * agree, and the rule is the standard perpendicular-frontage zoning.
 *
 * The model:
 *  - A road tile's FRONTAGE sides are the two sides parallel to the road's run
 *    (the sides you'd build along). We derive the run from the tile's
 *    orthogonal road-neighbours:
 *      • straight / turn / junction ⇒ frontage = every side that is NOT a
 *        road-connected side (a straight run frontages the two parallel sides;
 *        a turn/junction frontages each open side; a 4-way frontages none);
 *      • a DANGLING END (exactly one road-neighbour) frontages only the two
 *        sides PERPENDICULAR to that neighbour — NEVER the open end, so nothing
 *        grows on or straight across a road end;
 *      • an isolated tile (no road-neighbour) has no run axis ⇒ no frontage.
 *  - From each frontage side we march straight OUTWARD (perpendicular, away
 *    from the road) up to `depth` cells, marking each buildable cell zonable
 *    and STOPPING at the first blocking cell (out-of-bounds / water / road /
 *    building / too-steep) — cells behind a block have no direct access.
 *  - The zonable set is the union over all roads/sides, deduped.
 *
 * No three.js, no DOM. The buildability (slope) check is reimplemented locally
 * (like render/zonegrid.ts does) so this module never imports sim/grid code.
 */
import { RoadTier, isStreetTier } from '../shared/types';
import { MAX_BUILD_SLOPE } from '../shared/constants';

/** Perpendicular frontage depth: cells marched out from a road side. */
export const ZONE_DEPTH = 4;

/**
 * The minimal read-only slice of the world grid this predicate reads. A real
 * GridState (src/shared/types.ts) and render/zonegrid.ts's ZoneGridSource both
 * satisfy this structurally; tests hand-build just these layers. `zone` is
 * part of the shape (so the same object flows through) but is deliberately
 * never read — an already-zoned tile is still zonable.
 */
export interface ZonableGridSource {
  size: number;
  roadTier: Uint8Array;
  water: Uint8Array;
  zone: Uint8Array;
  buildingId: Uint32Array;
  height: Float32Array;
}

// Orthogonal directions, index-aligned: 0=N 1=E 2=S 3=W. Even indices (N/S)
// run along Z, odd indices (E/W) run along X.
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, -1], // N
  [1, 0], // E
  [0, 1], // S
  [-1, 0], // W
];

const isVerticalDir = (d: number): boolean => d === 0 || d === 2; // N or S

/**
 * Frontage direction indices for a road tile given its connected (road-
 * neighbour) direction indices:
 *  - 0 connections (isolated): no run axis ⇒ no frontage.
 *  - 1 connection (dangling end): the two sides perpendicular to it, never the
 *    open end.
 *  - 2+ connections (straight / turn / junction): every non-connected side.
 */
function frontageDirs(connected: readonly number[]): number[] {
  if (connected.length === 0) return [];
  if (connected.length === 1) {
    // Perpendicular to the single connection: a vertical connection frontages
    // E/W; a horizontal one frontages N/S.
    return isVerticalDir(connected[0]!) ? [1, 3] : [0, 2];
  }
  const set = new Set(connected);
  const out: number[] = [];
  for (let d = 0; d < 4; d++) if (!set.has(d)) out.push(d);
  return out;
}

/**
 * Local buildability check (mirrors world/grid.ts isBuildable + the road/
 * building exclusion, reimplemented against this narrower read-only shape so
 * the module stays sim-free): in bounds, not water, no road, no building, and
 * the slope to every existing orthogonal neighbour within MAX_BUILD_SLOPE.
 */
function isBuildableCell(g: ZonableGridSource, x: number, z: number): boolean {
  const { size } = g;
  if (x < 0 || z < 0 || x >= size || z >= size) return false;
  const i = z * size + x;
  if (g.water[i]) return false;
  if (g.roadTier[i] !== RoadTier.None) return false;
  if (g.buildingId[i] !== 0) return false;

  const h = g.height[i]!;
  for (const [ox, oz] of DIRS) {
    const nx = x + ox;
    const nz = z + oz;
    if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
    if (Math.abs(h - g.height[nz * size + nx]!) > MAX_BUILD_SLOPE) return false;
  }
  return true;
}

/**
 * The reusable frontage-reachable mask (one byte per tile, 1 = zonable). This
 * is the shared primitive: callers that query many tiles after a road change
 * (e.g. setZones gating a paint batch) should build the mask once and index it
 * directly rather than calling {@link isZonable} per tile. O(tiles + roads·depth).
 */
export function computeZonableMask(g: ZonableGridSource, depth = ZONE_DEPTH): Uint8Array {
  const { size } = g;
  const mask = new Uint8Array(size * size);

  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      // Only drivable streets provide zoning frontage — rail is not a street.
      if (!isStreetTier(g.roadTier[z * size + x]!)) continue;

      // Street-connected sides of this road tile.
      const connected: number[] = [];
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRS[d]![0]!;
        const nz = z + DIRS[d]![1]!;
        if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
        if (isStreetTier(g.roadTier[nz * size + nx]!)) connected.push(d);
      }

      // March out from each frontage side, stopping at the first block.
      for (const d of frontageDirs(connected)) {
        const dx = DIRS[d]![0]!;
        const dz = DIRS[d]![1]!;
        for (let k = 1; k <= depth; k++) {
          const cx = x + dx * k;
          const cz = z + dz * k;
          if (!isBuildableCell(g, cx, cz)) break;
          mask[cz * size + cx] = 1;
        }
      }
    }
  }
  return mask;
}

/**
 * Every zonable tile (deduped union across all road frontages), row-major.
 * A currently-zoned tile is still included (the zone layer is not consulted).
 */
export function computeZonableTiles(
  g: ZonableGridSource,
  depth = ZONE_DEPTH,
): Array<{ x: number; z: number }> {
  const { size } = g;
  const mask = computeZonableMask(g, depth);
  const tiles: Array<{ x: number; z: number }> = [];
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      if (mask[z * size + x]) tiles.push({ x, z });
    }
  }
  return tiles;
}

/**
 * True iff (x, z) is in the frontage-reachable set — the gate setZones will
 * use before painting a tile. Single-shot: builds the mask internally, so hot
 * callers querying many tiles should use {@link computeZonableMask} once and
 * index the result instead.
 */
export function isZonable(g: ZonableGridSource, x: number, z: number, depth = ZONE_DEPTH): boolean {
  const { size } = g;
  if (x < 0 || z < 0 || x >= size || z >= size) return false;
  return computeZonableMask(g, depth)[z * size + x] === 1;
}
