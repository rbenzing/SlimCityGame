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
 *  - Farmland is the same march from dirt roads alone, deeper, keeping only
 *    the cells whose soil can be farmed (computeFarmableMask).
 *
 * No three.js, no DOM. The buildability (slope) check is reimplemented locally
 * (like render/zonegrid.ts does) so this module never imports sim/grid code.
 */
import { RoadTier, ZoneType, isStreetTier } from '../shared/types';
import type { RoadNet } from '../shared/types';
import { isFarmable } from '../shared/soil';
import { MAX_BUILD_SLOPE, ROAD_CHECK_RADIUS, TILE_METERS } from '../shared/constants';
import { isGridSegment, sampleCentreLine } from '../shared/roadgeom';
import type { SegmentGeom } from '../shared/roadgeom';
import { presetProfileForTier, profileWidth } from '../shared/roadprofile';

/**
 * Perpendicular frontage depth: cells marched out from a road side. It is
 * the distance a lot may stand from its street and no more, so nothing the
 * brush paints is land that can never grow: a lot's first row must touch the
 * tile beside the road for the utilities to reach it, and the deepest lot in
 * the catalogue is three.
 */
export const ZONE_DEPTH = ROAD_CHECK_RADIUS;

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
  /**
   * Deck heights, when the source has them. A source without the layer reads as
   * entirely at grade, which is what every pre-bridge caller means.
   */
  roadElevation?: Float32Array;
  /**
   * The road network, when the source has one: its roads off the grid front
   * lots too, measured square to the road from its kerb. A source without it
   * has only the grid's roads.
   */
  roads?: RoadNet;
  /** The tiles roads off the grid cover, which nothing is built on. */
  roadFootprint?: Uint8Array;
  /** Each tile's SoilGrade. A source without it has no farmland. */
  soil?: Uint8Array;
}

/** How deep farmland runs back from its dirt road: fields go further back than a house lot. */
export const FARM_DEPTH = 8;

/** A dirt road is the only road a farm's gate opens onto. */
const frontsFarmland = (tier: RoadTier): boolean => tier === RoadTier.Gravel;

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
  if (g.roadFootprint?.[i]) return false;
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
  return marchFrontage(g, isStreetTier, () => true, depth);
}

/**
 * The land a farm may be zoned on: the same march, from dirt roads only and
 * FARM_DEPTH deep, marking only soil that can be farmed. Poor ground does not
 * stop the march — a field runs on past a stony corner — only what blocks
 * any lot does. A paved road fronts no farmland, though a field may run up to
 * it. O(tiles + roads·depth).
 */
export function computeFarmableMask(g: ZonableGridSource): Uint8Array {
  const soil = g.soil;
  if (!soil) return new Uint8Array(g.size * g.size);
  return marchFrontage(g, frontsFarmland, (i) => isFarmable(soil[i]!), FARM_DEPTH);
}

/** The mask that gates painting `zone`: farmland for Agriculture, road frontage for the rest. */
export function zonableMaskFor(g: ZonableGridSource, zone: ZoneType): Uint8Array {
  return zone === ZoneType.Agriculture ? computeFarmableMask(g) : computeZonableMask(g);
}

/**
 * The frontage march: out from each side of every road tile `fronts`
 * accepts, square to the road, `depth` cells or to the first cell a lot
 * cannot stand on, marking the cells `marks` accepts.
 */
function marchFrontage(
  g: ZonableGridSource,
  fronts: (tier: RoadTier) => boolean,
  marks: (i: number) => boolean,
  depth: number,
): Uint8Array {
  const { size } = g;
  const mask = new Uint8Array(size * size);

  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      // Only drivable streets provide zoning frontage — rail is not a street.
      if (!fronts(g.roadTier[z * size + x]! as RoadTier)) continue;
      // Nor does a bridge deck: there is no way onto a lot from a road passing
      // overhead, so an elevated tile fronts nothing.
      if ((g.roadElevation?.[z * size + x] ?? 0) > 0) continue;

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
          if (marks(cz * size + cx)) mask[cz * size + cx] = 1;
        }
      }
    }
  }
  if (g.roads) markFreeFrontage(g, g.roads, mask, fronts, marks, depth);
  return mask;
}

/** How finely the march out from a free road's kerb steps, metres. */
const FRONTAGE_STEP_M = 5;

/**
 * The lots a road off the grid fronts: from every metre of its centre line,
 * straight out square to it on both sides, from its kerb to `depth` tiles
 * beyond, marking each buildable cell and stopping at the first that is not.
 * The first tile out may be the road's own verge, which is passed over rather
 * than stopped at. The width is its tier's preset's, which a composed
 * profile of that tier shares closely enough to find its lots.
 */
function markFreeFrontage(
  g: ZonableGridSource,
  net: RoadNet,
  mask: Uint8Array,
  fronts: (tier: RoadTier) => boolean,
  marks: (i: number) => boolean,
  depth: number,
): void {
  const { size } = g;
  for (let s = 0; s < net.segSlots; s++) {
    if (net.segLive[s] !== 1 || !fronts(net.segTier[s]! as RoadTier)) continue;
    const a = net.segA[s]!;
    const b = net.segB[s]!;
    const geom: SegmentGeom = {
      a: { x: net.nodeX[a]!, z: net.nodeZ[a]! },
      b: { x: net.nodeX[b]!, z: net.nodeZ[b]! },
      control: net.segCurved[s] === 1 ? { x: net.segCX[s]!, z: net.segCZ[s]! } : null,
    };
    if (isGridSegment(geom)) continue;
    const half = profileWidth(presetProfileForTier(net.segTier[s] as RoadTier)) / 2;
    const samples = sampleCentreLine(geom);
    for (let i = 0; i < samples.length; i++) {
      const before = samples[Math.max(0, i - 1)]!;
      const after = samples[Math.min(samples.length - 1, i + 1)]!;
      const tx = after.x - before.x;
      const tz = after.z - before.z;
      const len = Math.sqrt(tx * tx + tz * tz);
      if (len === 0) continue;
      const p = samples[i]!;
      for (const side of [1, -1]) {
        const nx = (-tz / len) * side;
        const nz = (tx / len) * side;
        for (
          let d = half + FRONTAGE_STEP_M;
          d <= half + depth * TILE_METERS;
          d += FRONTAGE_STEP_M
        ) {
          const cx = Math.floor((p.x + nx * d) / TILE_METERS);
          const cz = Math.floor((p.z + nz * d) / TILE_METERS);
          if (cx < 0 || cz < 0 || cx >= size || cz >= size) break;
          const i2 = cz * size + cx;
          if (g.roadFootprint?.[i2] && d < half + TILE_METERS) continue;
          if (!isBuildableCell(g, cx, cz)) break;
          if (marks(i2)) mask[i2] = 1;
        }
      }
    }
  }
}

/**
 * Every zonable tile (deduped union across all road frontages), row-major.
 * A currently-zoned tile is still included (the zone layer is not consulted).
 */
export function computeZonableTiles(
  g: ZonableGridSource,
  depth = ZONE_DEPTH,
): Array<{ x: number; z: number }> {
  return tilesOf(computeZonableMask(g, depth), g.size);
}

/** Every tile `zone` may be painted on, row-major. */
export function zonableTilesFor(
  g: ZonableGridSource,
  zone: ZoneType,
): Array<{ x: number; z: number }> {
  return tilesOf(zonableMaskFor(g, zone), g.size);
}

function tilesOf(mask: Uint8Array, size: number): Array<{ x: number; z: number }> {
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
