/**
 * SlimCity roads on the grid: road tile edits (neighbor-mask auto-tiling,
 * tier upgrades, dezoning) and the joining rules the masks follow. The graph
 * routing runs on is src/world/roadgraph.ts. Pure logic over GridState — no
 * three.js, no DOM.
 */

import { BRIDGE_MAX_GRADE } from '../shared/constants';
import { axisOfFlow } from '../shared/overpass';
import {
  corridorHalfOf,
  flowDirection,
  RoadFlow,
  RoadTier,
  ZoneType,
  isRailTier,
} from '../shared/types';
import { tierOutranks } from '../shared/roadprofile';
import {
  corridorPartners,
  rampJoinAround,
  rampJoins,
  sideBySideCarriageways,
} from '../shared/corridor';
import type { RampJoin } from '../shared/corridor';
import type { GridState, RoadTileDelta, TilePoint } from '../shared/types';

// ---------------------------------------------------------------------------
// Indexing — parameterized by the grid's own `size` (GridState.size), not a
// fixed constant, so this works for both a full MAP_SIZE grid and the small
// hand-built grids used in tests (see src/world/grid.ts for the same
// convention).
// ---------------------------------------------------------------------------

const indexOf = (size: number, x: number, z: number): number => z * size + x;

const inBoundsOf = (size: number, x: number, z: number): boolean =>
  x >= 0 && z >= 0 && x < size && z < size;

interface Dir {
  dx: number;
  dz: number;
  bit: number;
}

/** Orthogonal neighbor directions and their mask bits: +N=1 +E=2 +S=4 +W=8. */
const DIRS: readonly Dir[] = [
  { dx: 0, dz: -1, bit: 1 }, // N
  { dx: 1, dz: 0, bit: 2 }, // E
  { dx: 0, dz: 1, bit: 4 }, // S
  { dx: -1, dz: 0, bit: 8 }, // W
];

function tierAtIdx(g: GridState, idx: number): RoadTier {
  return (g.roadTier[idx] ?? RoadTier.None) as RoadTier;
}

function tierAt(g: GridState, x: number, z: number): RoadTier {
  if (!inBoundsOf(g.size, x, z)) return RoadTier.None;
  return tierAtIdx(g, indexOf(g.size, x, z));
}

// ---------------------------------------------------------------------------
// Auto-tiling mask
// ---------------------------------------------------------------------------

/**
 * 4-bit neighbor bitmask (+N=1 +E=2 +S=4 +W=8) of orthogonal road neighbors.
 *
 * The other half of a corridor is not a neighbour: it is the same road. Left
 * in, each half auto-tiles into the other and every tile of a six-lane road
 * draws as a junction — a box of bare asphalt with its lane markings broken.
 */
export function computeMask(g: GridState, x: number, z: number): number {
  return layerMask(g, x, z, false, anyRoad);
}

/**
 * The mask of the road passing OVER tile (x, z), or 0 where none does. It
 * joins only along its own line, which is the only way it can run across a
 * crossing tile.
 */
export function computeOverMask(g: GridState, x: number, z: number): number {
  return layerMask(g, x, z, true, anyRoad);
}

const anyRoad = (tier: RoadTier): boolean => tier !== RoadTier.None;

/**
 * Which way the road passing over tile `idx` runs: true along x, false along
 * z, null where no road passes over it. Read from its stored flow, which every
 * over road carries — it was laid by a drag, and a drag records its heading.
 */
function overRunsAlongX(g: GridState, idx: number): boolean | null {
  if ((g.overTier[idx] ?? 0) === 0) return null;
  const axis = axisOfFlow(g.overFlow[idx] ?? RoadFlow.None);
  return axis === null ? null : axis === 'x';
}

/**
 * A road on the grid: the tile index for the road on a tile, and the tile
 * index plus the tile count for the road passing over a crossing tile.
 */
export type RoadKey = number;

/**
 * The road reached by stepping one tile (dx, dz) from road `key`, or null
 * where the step leaves it: the road passing over a crossing runs only along
 * its own line, and the road beneath never joins along that line. Stepping
 * onto a crossing tile along the line of its over road reaches the over road;
 * any other step reaches the road on the tile — which may be no road at all,
 * for the caller to decide. The two roads on a crossing tile always run at
 * right angles, so the direction of a step says which of them it meets.
 */
export function roadStep(g: GridState, key: RoadKey, dx: number, dz: number): RoadKey | null {
  const n = g.size * g.size;
  const over = key >= n;
  const idx = over ? key - n : key;
  const x = idx % g.size;
  const z = (idx - x) / g.size;
  const alongX = dx !== 0;
  const axis = overRunsAlongX(g, idx);
  if (over ? axis !== alongX : axis === alongX) return null;
  const nx = x + dx;
  const nz = z + dz;
  if (!inBoundsOf(g.size, nx, nz)) return null;
  const next = indexOf(g.size, nx, nz);
  return overRunsAlongX(g, next) === alongX ? n + next : next;
}

/** The tier of road `key`, on whichever layer it names. */
export function tierOfKey(g: GridState, key: RoadKey): RoadTier {
  const n = g.size * g.size;
  return ((key >= n ? g.overTier[key - n] : g.roadTier[key]) ?? RoadTier.None) as RoadTier;
}

/** The world height of road `key`'s deck surface. */
function deckYOfKey(g: GridState, key: RoadKey): number {
  const n = g.size * g.size;
  const idx = key >= n ? key - n : key;
  const lift = (key >= n ? g.overElevation[idx] : g.roadElevation[idx]) ?? 0;
  return (g.height[idx] ?? 0) + lift;
}

/**
 * Whether two neighbouring roads are at one level, which they must be to join:
 * both on the ground, or decks within one grade step of each other. A deck up
 * in the air passes beside a road on the ground without meeting it.
 */
function atOneLevel(g: GridState, a: RoadKey, b: RoadKey): boolean {
  const n = g.size * g.size;
  const liftOf = (k: RoadKey): number =>
    (k >= n ? g.overElevation[k - n] : g.roadElevation[k]) ?? 0;
  if (liftOf(a) === 0 && liftOf(b) === 0) return true;
  return Math.abs(deckYOfKey(g, a) - deckYOfKey(g, b)) <= BRIDGE_MAX_GRADE;
}

/**
 * The neighbour mask of one of the tile's roads — the road on it, or the one
 * passing over it — counting neighbours whose tier `accepts` takes.
 */
function layerMask(
  g: GridState,
  x: number,
  z: number,
  over: boolean,
  accepts: NetworkTiers,
): number {
  const idx = indexOf(g.size, x, z);
  const key = over ? g.size * g.size + idx : idx;
  const tier = tierOfKey(g, key);
  if (tier === RoadTier.None) return 0;
  let mask = 0;
  for (const d of DIRS) {
    const next = roadStep(g, key, d.dx, d.dz);
    if (next === null) continue;
    const theirs = tierOfKey(g, next);
    if (theirs === RoadTier.None || !accepts(theirs)) continue;
    if (!atOneLevel(g, key, next)) continue;
    // A step onto or off a road passing over is along its own line, where it
    // meets nothing but its own approaches: only the rail rule applies.
    const viaOver = over || next !== indexOf(g.size, x + d.dx, z + d.dz);
    if (viaOver) {
      if (isRailTier(tier) === isRailTier(theirs)) mask |= d.bit;
      continue;
    }
    if (!isSeparateRoad(g, x, z, x + d.dx, z + d.dz)) mask |= d.bit;
  }
  return mask;
}

/**
 * Membership test for a transport network: which tiers its graph is built from.
 * `isStreetTier` gives the vehicle network, `isRailTier` the train one.
 */
export type NetworkTiers = (tier: RoadTier) => boolean;

/**
 * Whether the tile at (nx, nz) is the OTHER HALF of the corridor (x, z)
 * belongs to, rather than a road joining it.
 *
 * The two halves of a corridor lie side by side, so without this each one sees
 * the other as an arm and every tile of a six-lane road reads as a T-junction:
 * crossings painted the length of it and a graph node at every step. They are
 * partners when both are flagged as corridor halves of the SAME road, are
 * opposite halves of it, and lie beside each other across the way they run.
 */
function isCorridorPartner(g: GridState, x: number, z: number, nx: number, nz: number): boolean {
  if (!inBoundsOf(g.size, nx, nz)) return false;
  const i = indexOf(g.size, x, z);
  const n = indexOf(g.size, nx, nz);
  const here = g.roadFlow[i] ?? 0;
  const there = g.roadFlow[n] ?? 0;
  return corridorPartners(
    corridorHalfOf(here),
    corridorHalfOf(there),
    g.roadProfile[i] ?? 0,
    g.roadProfile[n] ?? 0,
    flowDirection(here),
    nx - x,
    nz - z,
  );
}

/**
 * The mask of road `key`, counting only neighbours that belong to the SAME
 * network, so a graph built from one set of tiers never links to another.
 * Identical to `computeMask` on a grid of one network's tiles alone.
 */
function keyNetworkMask(g: GridState, key: RoadKey, inNetwork: NetworkTiers): number {
  const n = g.size * g.size;
  const idx = key >= n ? key - n : key;
  const x = idx % g.size;
  return layerMask(g, x, (idx - x) / g.size, key >= n, inNetwork);
}

/** The mask of road `key` on whichever layer it names, counting every road. */
export function roadKeyMask(g: GridState, key: RoadKey): number {
  return keyNetworkMask(g, key, anyRoad);
}

/**
 * Whether a neighbouring tile is a road of its OWN rather than an arm of this
 * one: the other half of this tile's corridor, a motorway carriageway running
 * alongside, a ramp beside a motorway it does not join, or rail against
 * anything that is not rail — track cuts a street, it does not cross it.
 */
function isSeparateRoad(g: GridState, x: number, z: number, nx: number, nz: number): boolean {
  return (
    isRailAgainstRoad(g, x, z, nx, nz) ||
    isCorridorPartner(g, x, z, nx, nz) ||
    isSideBySideCarriageway(g, x, z, nx, nz) ||
    isRampAlongside(g, x, z, nx, nz)
  );
}

/** Whether exactly one of the two tiles is rail. */
function isRailAgainstRoad(g: GridState, x: number, z: number, nx: number, nz: number): boolean {
  if (!inBoundsOf(g.size, nx, nz)) return false;
  return isRailTier(tierAt(g, x, z)) !== isRailTier(tierAt(g, nx, nz));
}

/**
 * Every road tile's stored mask rewritten from the rules. The mask is derived
 * from the tiles around it, so a save carries whatever the rules said when it
 * was written; loading one recomputes it, or a rule that has changed since
 * would never reach that city's roads.
 */
export function recomputeRoadMasks(g: GridState): void {
  for (let z = 0; z < g.size; z++) {
    for (let x = 0; x < g.size; x++) {
      const i = indexOf(g.size, x, z);
      g.roadMask[i] = tierAtIdx(g, i) === RoadTier.None ? 0 : computeMask(g, x, z);
    }
  }
}

/**
 * Recomputes the stored mask of every road tile in `idxs` and of each one's
 * four neighbours, and returns a delta for every tile whose mask changed. What
 * a road passing over a crossing changes is who the tiles around it join, so
 * laying or lifting one has to be followed by this.
 */
export function remaskAround(g: GridState, idxs: Iterable<number>): RoadTileDelta[] {
  const candidates = new Set<number>();
  for (const idx of idxs) {
    candidates.add(idx);
    const x = idx % g.size;
    const z = (idx - x) / g.size;
    for (const d of DIRS) {
      if (inBoundsOf(g.size, x + d.dx, z + d.dz))
        candidates.add(indexOf(g.size, x + d.dx, z + d.dz));
    }
  }
  const deltas: RoadTileDelta[] = [];
  for (const idx of candidates) {
    const tier = tierAtIdx(g, idx);
    if (tier === RoadTier.None) continue;
    const x = idx % g.size;
    const z = (idx - x) / g.size;
    const mask = computeMask(g, x, z);
    if (mask === (g.roadMask[idx] ?? 0)) continue;
    g.roadMask[idx] = mask;
    deltas.push({
      x,
      z,
      tier,
      mask,
      elevation: g.roadElevation[idx] ?? 0,
      profile: g.roadProfile[idx] ?? tier,
      flow: g.roadFlow[idx] ?? RoadFlow.None,
    });
  }
  return deltas;
}

/**
 * Whether one of the two tiles is a ramp running beside a motorway on the other
 * without joining it — the stretch before a merge or after a diverge, or an
 * elbow. See {@link rampJoin}.
 */
function isRampAlongside(g: GridState, x: number, z: number, nx: number, nz: number): boolean {
  if (!inBoundsOf(g.size, nx, nz)) return false;
  const a = g.roadTier[indexOf(g.size, x, z)];
  const b = g.roadTier[indexOf(g.size, nx, nz)];
  if (a === RoadTier.Ramp && b === RoadTier.Highway) return !rampJoins(rampJoinAt(g, x, z, nx, nz));
  if (a === RoadTier.Highway && b === RoadTier.Ramp) return !rampJoins(rampJoinAt(g, nx, nz, x, z));
  return false;
}

/** How the ramp tile at (rx, rz) meets the motorway tile at (hx, hz). */
function rampJoinAt(g: GridState, rx: number, rz: number, hx: number, hz: number): RampJoin {
  return rampJoinAround(
    (x, z) => inBoundsOf(g.size, x, z) && g.roadTier[indexOf(g.size, x, z)] === RoadTier.Ramp,
    (x, z) => (inBoundsOf(g.size, x, z) ? (g.roadFlow[indexOf(g.size, x, z)] ?? 0) : 0),
    rx,
    rz,
    hx,
    hz,
  );
}

/**
 * Whether the tile at (nx, nz) is a separate motorway carriageway lying
 * alongside (x, z) — see {@link sideBySideCarriageways}. Left unrecognised,
 * the pair draws as an unpainted slab and the graph edge between them lets
 * traffic drift out of one carriageway into the oncoming one.
 */
function isSideBySideCarriageway(
  g: GridState,
  x: number,
  z: number,
  nx: number,
  nz: number,
): boolean {
  if (!inBoundsOf(g.size, nx, nz)) return false;
  const i = indexOf(g.size, x, z);
  const n = indexOf(g.size, nx, nz);
  return sideBySideCarriageways(
    g.roadTier[i] === RoadTier.Highway,
    g.roadTier[n] === RoadTier.Highway,
    g.roadFlow[i] ?? 0,
    g.roadFlow[n] ?? 0,
    nx - x,
    nz - z,
  );
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

/**
 * Sets `tier` on every in-bounds tile in `tiles` (upgrades only — a tile
 * already carrying a strictly higher tier rejects the request and keeps its
 * existing tier, per-tile, with no error, unless `replace` is set, when the
 * drag lands whatever it draws), de-zones every one of those tiles, and
 * recomputes the neighbor mask for every tile whose tier changed plus its
 * orthogonal neighbors. The elevations and flows are per-tile and follow the
 * drag rather than the tier, so re-dragging a span turns it round or re-decks
 * it. Returns every tile whose tier, mask, deck or direction actually changed.
 */
export function applyRoad(
  g: GridState,
  tiles: TilePoint[],
  tier: RoadTier,
  elevations?: readonly number[],
  profile: number = tier,
  replace = false,
  flows?: readonly number[],
): RoadTileDelta[] {
  const changedIdx = new Set<number>();

  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i]!;
    if (!inBoundsOf(g.size, t.x, t.z)) continue;
    const idx = indexOf(g.size, t.x, t.z);
    const current = tierAtIdx(g, idx);
    g.zone[idx] = ZoneType.None; // a road tile, new or pre-existing, never carries a zone
    // The profile is the road's identity and the tier its nearest preset. A
    // higher tier always lands; the same tier lands only when it brings a
    // different profile — a re-composed street replaces the one under it, but
    // re-dragging the same road over itself changes nothing.
    const sameTierNewProfile =
      tier === current && current !== RoadTier.None && g.roadProfile[idx] !== profile;
    // Replace mode lays whatever the player drew over whatever was there, a
    // smaller road included: rebuilding an avenue as a quiet street is a real
    // thing to want, and it is the drag that says so rather than the tier.
    const differs = tier !== current || g.roadProfile[idx] !== profile;
    // A road replaces one BELOW it in the hierarchy, which is not the order
    // the tier numbers are in: a gravel track has a higher tier number than a
    // motorway and must still never cut one.
    const outranks = tierOutranks(tier, current as RoadTier);
    const laid = replace ? differs : outranks || sameTierNewProfile;
    // Which tiles this drag OWNS: the ones it laid, and the ones that already
    // carry exactly the road being drawn, since re-dragging a span is how its
    // height and its direction are changed. A tile that REFUSED the road is
    // not the drag's to re-profile — a street drawn across a motorway must not
    // lift the motorway onto a viaduct on its way past.
    const owned = laid || (tier === current && g.roadProfile[idx] === profile);
    if (laid) {
      g.roadTier[idx] = tier;
      g.roadProfile[idx] = profile;
      changedIdx.add(idx);
    }
    // tier < current: rejected per-tile (never a silent downgrade); the
    // tile keeps whatever (>) tier it already had.

    // Elevation follows the drag rather than the tier, so re-dragging a span
    // re-profiles it; a tile that ends up carrying no road keeps none.
    if (elevations && owned && tierAtIdx(g, idx) !== RoadTier.None) {
      const next = elevations[i] ?? 0;
      if ((g.roadElevation[idx] ?? 0) !== next) {
        g.roadElevation[idx] = next;
        changedIdx.add(idx);
      }
    }

    // Direction follows the drag too, which is how a one-way street is turned
    // round: draw it back the other way.
    if (flows && owned && tierAtIdx(g, idx) !== RoadTier.None) {
      const next = flows[i] ?? RoadFlow.None;
      if ((g.roadFlow[idx] ?? RoadFlow.None) !== next) {
        g.roadFlow[idx] = next;
        changedIdx.add(idx);
      }
    }
  }

  const candidates = new Set<number>(changedIdx);
  for (const idx of changedIdx) {
    const x = idx % g.size;
    const z = Math.floor(idx / g.size);
    for (const d of DIRS) {
      const nx = x + d.dx;
      const nz = z + d.dz;
      if (inBoundsOf(g.size, nx, nz)) candidates.add(indexOf(g.size, nx, nz));
    }
  }

  const deltas: RoadTileDelta[] = [];
  for (const idx of candidates) {
    const tierNow = tierAtIdx(g, idx);
    if (tierNow === RoadTier.None) continue; // mask only means something on an actual road tile
    const x = idx % g.size;
    const z = Math.floor(idx / g.size);
    const newMask = computeMask(g, x, z);
    const oldMask = g.roadMask[idx] ?? 0;
    if (changedIdx.has(idx) || newMask !== oldMask) {
      g.roadMask[idx] = newMask;
      deltas.push({
        x,
        z,
        tier: tierNow,
        mask: newMask,
        elevation: g.roadElevation[idx] ?? 0,
        profile: g.roadProfile[idx] ?? tierNow,
        flow: g.roadFlow[idx] ?? RoadFlow.None,
      });
    }
  }
  return deltas;
}

/**
 * Zeroes tier and mask on every in-bounds, currently-road tile in `tiles`,
 * then recomputes the neighbor mask on every tile that lost a neighbor.
 * Returns every tile whose tier or mask actually changed.
 */
export function removeRoad(g: GridState, tiles: TilePoint[]): RoadTileDelta[] {
  const removedIdx = new Set<number>();
  const deltaMap = new Map<number, RoadTileDelta>();

  for (const t of tiles) {
    if (!inBoundsOf(g.size, t.x, t.z)) continue;
    const idx = indexOf(g.size, t.x, t.z);
    if (tierAtIdx(g, idx) === RoadTier.None) continue;
    g.roadTier[idx] = RoadTier.None;
    g.roadProfile[idx] = 0;
    g.roadFlow[idx] = RoadFlow.None; // the direction goes with the road
    g.junctionControl[idx] = 0; // and so does whatever the player set here
    g.junctionTurns[idx] = 0;
    g.roadMask[idx] = 0;
    g.roadElevation[idx] = 0; // the deck goes with the road
    removedIdx.add(idx);
    deltaMap.set(idx, {
      x: t.x,
      z: t.z,
      tier: RoadTier.None,
      mask: 0,
      elevation: 0,
      profile: 0,
      flow: RoadFlow.None,
    });
  }

  const neighborCandidates = new Set<number>();
  for (const idx of removedIdx) {
    const x = idx % g.size;
    const z = Math.floor(idx / g.size);
    for (const d of DIRS) {
      const nx = x + d.dx;
      const nz = z + d.dz;
      if (!inBoundsOf(g.size, nx, nz)) continue;
      const nIdx = indexOf(g.size, nx, nz);
      if (!removedIdx.has(nIdx)) neighborCandidates.add(nIdx);
    }
  }

  for (const idx of neighborCandidates) {
    const tierNow = tierAtIdx(g, idx);
    if (tierNow === RoadTier.None) continue;
    const x = idx % g.size;
    const z = Math.floor(idx / g.size);
    const newMask = computeMask(g, x, z);
    const oldMask = g.roadMask[idx] ?? 0;
    if (newMask !== oldMask) {
      g.roadMask[idx] = newMask;
      deltaMap.set(idx, {
        x,
        z,
        tier: tierNow,
        mask: newMask,
        elevation: g.roadElevation[idx] ?? 0,
        flow: g.roadFlow[idx] ?? RoadFlow.None,
        profile: g.roadProfile[idx] ?? tierNow,
      });
    }
  }

  return Array.from(deltaMap.values());
}
