/**
 * Elevation profile for a road placement: decides how high each tile of a drag
 * sits above its terrain, so water crossings come out as a deck on piers and
 * approaches ramp down to the ground at a grade a road can carry.
 *
 * Pure over GridState — no renderer, no worker state — so the whole profile is
 * unit-testable from a hand-built grid.
 */
import {
  BRIDGE_CLEARANCE_M,
  BRIDGE_COST_PER_METER_TILE,
  BRIDGE_MAX_ELEVATION,
  BRIDGE_MAX_GRADE,
  SEA_LEVEL,
} from '../shared/constants';
import type { GridState, TilePoint } from '../shared/types';
import { RoadTier } from '../shared/types';

// Indexing — parameterized by the grid's own `size`, matching the convention in
// src/world/grid.ts and src/world/roads.ts.
const indexOf = (size: number, x: number, z: number): number => z * size + x;

const inBoundsOf = (size: number, x: number, z: number): boolean =>
  x >= 0 && z >= 0 && x < size && z < size;

export type ElevationProfile =
  | { ok: true; elevations: number[]; cost: number }
  | { ok: false; reason: 'grade' | 'height' };

/** Terrain height (metres, world Y) at a tile. */
function groundY(g: GridState, t: TilePoint): number {
  if (!inBoundsOf(g.size, t.x, t.z)) return 0;
  return g.height[indexOf(g.size, t.x, t.z)] ?? 0;
}

/**
 * The world height a tile's deck must reach on its own account: the water
 * surface plus BRIDGE_CLEARANCE_M over water, the ground itself on dry land —
 * a deck never sinks below the terrain it crosses.
 */
function floorY(g: GridState, t: TilePoint): number {
  const ground = groundY(g, t);
  if (!inBoundsOf(g.size, t.x, t.z)) return ground;
  if (!g.water[indexOf(g.size, t.x, t.z)]) return ground;
  return Math.max(ground, SEA_LEVEL + BRIDGE_CLEARANCE_M);
}

/**
 * Below this much lift, a tile is on the ground. Guards against a profile that
 * arithmetic left a fraction of a millimetre off the terrain registering as an
 * elevated tile — which would cost money, skip its frontage, and try to stand a
 * bridge up under a road that is plainly lying on the dirt.
 */
const AT_GRADE_EPSILON_M = 0.01;

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/**
 * Deck world heights of already-built roads orthogonally adjacent to `t` but
 * outside the drag — tiles the new span will physically join onto, and
 * therefore has to meet at a legal step. Plain ground is not a connection: a
 * viaduct is allowed to pass over it.
 */
function connectionHeights(g: GridState, t: TilePoint, inDrag: ReadonlySet<number>): number[] {
  const heights: number[] = [];
  for (const [dx, dz] of DIRS) {
    const nx = t.x + dx;
    const nz = t.z + dz;
    if (!inBoundsOf(g.size, nx, nz)) continue;
    const idx = indexOf(g.size, nx, nz);
    if (inDrag.has(idx)) continue;
    if ((g.roadTier[idx] ?? RoadTier.None) === RoadTier.None) continue;
    heights.push((g.height[idx] ?? 0) + (g.roadElevation[idx] ?? 0));
  }
  return heights;
}

/**
 * Solves the deck height for every tile of `tiles`, in drag order.
 *
 * Each tile starts at the height its own terrain demands, then two sweeps —
 * one forward, one back — raise whatever is needed so no neighbouring pair
 * differs by more than BRIDGE_MAX_GRADE. That yields the LOWEST profile that
 * both clears the water and ramps legally, which is also the cheapest.
 *
 * Fails rather than half-building when the ends cannot reach the ground they
 * connect to — drag from further back on the bank to give the ramp room.
 */
export function solveElevationProfile(
  g: GridState,
  tiles: readonly TilePoint[],
  manual = 0,
): ElevationProfile {
  const n = tiles.length;
  if (n === 0) return { ok: true, elevations: [], cost: 0 };

  const inDrag = new Set(
    tiles.filter((t) => inBoundsOf(g.size, t.x, t.z)).map((t) => indexOf(g.size, t.x, t.z)),
  );
  const joins = tiles.map((t) => connectionHeights(g, t, inDrag));

  // Everything below is solved in world Y, not in per-tile offsets, so the deck
  // comes out smooth over an uneven riverbed instead of tracking the bed. The
  // stored layer is the difference, taken at the very end.
  const floor = tiles.map((t, i) => {
    const joined = joins[i]!;
    const fromJoins = joined.length > 0 ? Math.max(...joined) - BRIDGE_MAX_GRADE : -Infinity;
    return Math.max(floorY(g, t), fromJoins);
  });

  // Ceiling for the requested height: a viaduct still has to climb from
  // whatever each end lands on, so the manual target is capped by how far the
  // ramp has got by tile i. An end over water lands on nothing and caps
  // nothing — a span may simply stop out there and be capped like a dead end.
  const endAnchor = (i: number): number | null => {
    const t = tiles[i]!;
    if (!inBoundsOf(g.size, t.x, t.z)) return null;
    if (g.water[indexOf(g.size, t.x, t.z)]) return null;
    const joined = joins[i]!;
    return joined.length > 0 ? Math.max(...joined) : groundY(g, t);
  };
  const head = endAnchor(0);
  const tail = endAnchor(n - 1);

  const deckY = tiles.map((t, i) => {
    let envelope = Infinity;
    if (head !== null) envelope = Math.min(envelope, head + i * BRIDGE_MAX_GRADE);
    if (tail !== null) envelope = Math.min(envelope, tail + (n - 1 - i) * BRIDGE_MAX_GRADE);
    return Math.max(floor[i]!, Math.min(groundY(g, t) + manual, envelope));
  });

  // Continuity: raise whatever is needed so no neighbouring pair steps by more
  // than the grade limit. Two sweeps give the lowest profile that satisfies it.
  for (let i = 1; i < n; i++) {
    deckY[i] = Math.max(deckY[i]!, deckY[i - 1]! - BRIDGE_MAX_GRADE);
  }
  for (let i = n - 2; i >= 0; i--) {
    deckY[i] = Math.max(deckY[i]!, deckY[i + 1]! - BRIDGE_MAX_GRADE);
  }

  // The sweeps raise tiles within the drag to meet each other, but roads the
  // span joins onto are already built and cannot be raised to suit it.
  for (let i = 0; i < n; i++) {
    for (const joined of joins[i]!) {
      if (Math.abs(deckY[i]! - joined) > BRIDGE_MAX_GRADE) return { ok: false, reason: 'grade' };
    }
  }

  // The stored layer is the offset from each tile's own terrain, kept exact:
  // rounding it to whole metres would make the deck inherit the fraction of
  // whatever it crosses, bowing a level span as the riverbed rises and falls.
  // Only a hair above the ground counts as none, so arithmetic slack on a tile
  // nothing actually lifted cannot make it read as a bridge.
  const elevations = tiles.map((t, i) => {
    const lift = deckY[i]! - groundY(g, t);
    return lift > AT_GRADE_EPSILON_M ? lift : 0;
  });
  if (elevations.some((e) => e > BRIDGE_MAX_ELEVATION)) return { ok: false, reason: 'height' };

  // A span has to land. An end tile still in the air over dry ground, with no
  // built road to hand off to, means the drag did not reach far enough back
  // onto the bank for the ramp — better to reject it than to build a road
  // erupting out of the ground.
  for (const end of [0, n - 1]) {
    if (elevations[end] === 0) continue;
    if (endAnchor(end) === null) continue; // over water: capped like any dead end
    if (joins[end]!.length > 0) continue; // handed off to a built road
    return { ok: false, reason: 'grade' };
  }

  const cost = Math.round(
    elevations.reduce((sum, e) => sum + e * BRIDGE_COST_PER_METER_TILE, 0),
  );
  return { ok: true, elevations, cost };
}

/** True where a road placement needs a deck at all — the render/cost fast path. */
export function isElevated(elevations: readonly number[]): boolean {
  return elevations.some((e) => e > 0);
}
