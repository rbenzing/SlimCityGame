/**
 * SlimCity road network: grid-level road tile edits
 * (neighbor-mask auto-tiling, tier upgrades, dezoning) plus the node/edge
 * graph built on top of the grid for routing. Pure logic over GridState —
 * no three.js, no DOM.
 */

import {
  armsAt,
  capacityForTier,
  findPath as runAstar,
  nearestNode as findNearestNode,
} from './pathfind';
import {
  corridorHalfOf,
  flowDirection,
  flowForStep,
  RoadFlow,
  RoadTier,
  ZoneType,
  isStreetTier,
} from '../shared/types';
import {
  canGainTurnPocket,
  isPresetProfileId,
  presetProfileForTier,
  rankForTier,
} from '../shared/roadprofile';
import { controlFromCode, warrantedControl } from '../shared/junction';
import { corridorPartners } from '../shared/corridor';
import { ARMS_PER_TILE } from './grid';
import type {
  GraphEdge,
  GraphNode,
  GridState,
  PathResult,
  RoadClassId,
  RoadNetworkApi,
  RoadProfile,
  RoadTileDelta,
  TilePoint,
} from '../shared/types';

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

const OPPOSITE_BIT: Readonly<Record<number, number>> = { 1: 4, 2: 8, 4: 1, 8: 2 };

function tierAtIdx(g: GridState, idx: number): RoadTier {
  return (g.roadTier[idx] ?? RoadTier.None) as RoadTier;
}

function tierAt(g: GridState, x: number, z: number): RoadTier {
  if (!inBoundsOf(g.size, x, z)) return RoadTier.None;
  return tierAtIdx(g, indexOf(g.size, x, z));
}

function popcount(mask: number): number {
  let count = 0;
  for (let m = mask; m !== 0; m >>= 1) count += m & 1;
  return count;
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
  let mask = 0;
  if (tierAt(g, x, z - 1) !== RoadTier.None && !isCorridorPartner(g, x, z, x, z - 1)) mask |= 1;
  if (tierAt(g, x + 1, z) !== RoadTier.None && !isCorridorPartner(g, x, z, x + 1, z)) mask |= 2;
  if (tierAt(g, x, z + 1) !== RoadTier.None && !isCorridorPartner(g, x, z, x, z + 1)) mask |= 4;
  if (tierAt(g, x - 1, z) !== RoadTier.None && !isCorridorPartner(g, x, z, x - 1, z)) mask |= 8;
  return mask;
}

/**
 * Membership test for a transport network: which tiers its graph is built from.
 * `isStreetTier` gives the vehicle network, `isRailTier` the train one.
 */
export type NetworkTiers = (tier: RoadTier) => boolean;

/**
 * Neighbor bitmask counting only neighbours that belong to the SAME network —
 * so the vehicle graph never treats rail as connected, and the rail graph never
 * treats a street as connected, even though `computeMask` still renders the two
 * abutting (the level-crossing look). Identical to `computeMask` on a grid of
 * one network's tiles alone.
 */
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

function computeNetworkMask(g: GridState, x: number, z: number, inNetwork: NetworkTiers): number {
  let mask = 0;
  if (inNetwork(tierAt(g, x, z - 1)) && !isCorridorPartner(g, x, z, x, z - 1)) mask |= 1;
  if (inNetwork(tierAt(g, x + 1, z)) && !isCorridorPartner(g, x, z, x + 1, z)) mask |= 2;
  if (inNetwork(tierAt(g, x, z + 1)) && !isCorridorPartner(g, x, z, x, z + 1)) mask |= 4;
  if (inNetwork(tierAt(g, x - 1, z)) && !isCorridorPartner(g, x, z, x - 1, z)) mask |= 8;
  return mask;
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
    const outranks =
      current === RoadTier.None || rankForTier(tier) > rankForTier(current as RoadTier);
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

// ---------------------------------------------------------------------------
// Graph construction
// ---------------------------------------------------------------------------

/**
 * A road tile is a node when it's an intersection/endpoint/isolated tile
 * (neighbor count != 2), or — even with exactly 2 neighbors — when its own
 * tier is strictly higher than at least one neighbor's tier. That second
 * rule places exactly one node at each straight-through tier boundary (on
 * the higher-tier side), so edges can carry a single tier each.
 *
 * A boundary against a JUNCTION needs no node of its own — the junction is the
 * boundary. Adding a second one a tile away leaves a one-tile run between them
 * that is nothing but the seam, and a run with no body has no road to be: a
 * slip road reaching a street one tile short of the junction would read as the
 * street, and the junction would be warranted as though no slip road arrived
 * at it. A dead end or a bend is not a junction and the boundary still stands
 * on the greater road's side of it.
 */
function isNodeTile(
  g: GridState,
  x: number,
  z: number,
  tier: RoadTier,
  mask: number,
  inNetwork: NetworkTiers,
): boolean {
  const deg = popcount(mask);
  if (deg !== 2) return true;
  for (const d of DIRS) {
    if ((mask & d.bit) === 0) continue;
    const nx = x + d.dx;
    const nz = z + d.dz;
    if (tierAt(g, nx, nz) >= tier) continue;
    if (popcount(computeNetworkMask(g, nx, nz, inNetwork)) >= 3) continue;
    return true;
  }
  return false;
}

interface BuiltGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Which way a run's tiles say they were drawn, relative to the walk from node
 * a to node b: true when the stored flow points along that walk, false when it
 * points against it, and null when no tile of the run ever recorded one — a
 * road laid before the direction was stored, which leaves its reader to fall
 * back to the geometry it always used.
 *
 * The first tile that has an answer gives it. A run is one street between two
 * nodes, so its tiles were laid by one drag and agree; a run stitched together
 * from two drags is decided by the end the walk started from.
 */
function storedRunDirection(g: GridState, runTiles: readonly TilePoint[]): boolean | null {
  for (let i = 0; i < runTiles.length - 1; i++) {
    const here = runTiles[i]!;
    const next = runTiles[i + 1]!;
    // The direction only: the byte also carries which half of a corridor the
    // tile is, and comparing that against a bare RoadFlow never matches.
    const stored = flowDirection(g.roadFlow[indexOf(g.size, here.x, here.z)] ?? RoadFlow.None);
    if (stored === RoadFlow.None) continue;
    const along = flowForStep(next.x - here.x, next.z - here.z);
    if (along === RoadFlow.None) continue; // defensive: a non-orthogonal step
    return stored === along;
  }
  return null;
}

/** Resolves a stored profile id to the cross-section it names, or null. */
export type ProfileResolver = (id: number) => RoadProfile | null;

/**
 * What a run's own cross-section says about it: the class it belongs to, how
 * many travel lanes it has, and how those lanes divide between the two
 * directions of the walk from node a to node b.
 *
 * The split is null when the run is the same both ways — which is every road
 * whose profile says nothing else, and which costs what it always cost. The
 * profile's own `back` and `fwd` are relative to the direction the road was
 * drawn in, so the stored direction is what turns them into a-to-b and b-to-a.
 * A run that never recorded one cannot be told apart, so it is left symmetric
 * rather than guessed at.
 */
function runFacts(
  g: GridState,
  runTiles: readonly TilePoint[],
  forwardAtoB: boolean | null,
  profileFor: ProfileResolver,
): {
  classId: RoadClassId;
  lanes: number;
  split: { atoB: number; btoA: number } | null;
  pocket: { atoB: boolean; btoA: boolean };
} | null {
  const mid = runTiles[Math.floor(runTiles.length / 2)];
  if (!mid) return null;
  const profile = profileFor(g.roadProfile[indexOf(g.size, mid.x, mid.z)] ?? 0);
  if (!profile) return null;
  const travel = profile.pieces.filter((p) => p.kind === 'travel');
  const fwd = travel.filter((p) => p.flow === 'fwd').length;
  const back = travel.filter((p) => p.flow === 'back').length;
  const symmetric = fwd === back || forwardAtoB === null;
  // A driver's own half of the road is the one their direction's lanes are
  // laid on: the `fwd` side going the way the road was drawn, the `back` side
  // coming the other way. That is the half a turn pocket would be cut into.
  const towardB: -1 | 1 = forwardAtoB === false ? -1 : 1;
  return {
    classId: profile.class,
    lanes: travel.length,
    split: symmetric ? null : forwardAtoB ? { atoB: fwd, btoA: back } : { atoB: back, btoA: fwd },
    pocket: {
      atoB: canGainTurnPocket(profile, towardB),
      btoA: canGainTurnPocket(profile, -towardB as -1 | 1),
    },
  };
}

/**
 * Records, on each run, the narrower road it drops into at either end.
 *
 * A node with exactly two edges is a straight-through boundary between two
 * kinds of road — the graph puts one there so an edge can carry a single tier
 * — which is exactly where a lane drop happens. The wide side learns what it
 * drops into, so the traffic heading that way queues for the road it is going
 * to rather than the one it is on; the narrow side learns nothing, since a
 * road widening ahead of you never held anybody up.
 */
function markLaneDrops(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): void {
  for (const node of nodes) {
    if (node.edges.length !== 2) continue;
    const first = edges[node.edges[0]!];
    const second = edges[node.edges[1]!];
    if (!first || !second) continue;
    const pair: [GraphEdge, GraphEdge][] = [
      [first, second],
      [second, first],
    ];
    for (const [edge, other] of pair) {
      const mine = capacityForTier(edge.tier);
      const theirs = capacityForTier(other.tier);
      if (theirs >= mine) continue;
      if (node.id === edge.b) edge.narrowsAtB = theirs;
      else edge.narrowsAtA = theirs;
    }
  }
}

function buildGraph(
  g: GridState,
  inNetwork: NetworkTiers,
  profileFor: ProfileResolver,
): BuiltGraph {
  const size = g.size;
  const nodeIdOf = new Map<number, number>(); // tile idx -> node id
  const nodeTileIdx: number[] = [];

  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const idx = indexOf(size, x, z);
      const tier = tierAtIdx(g, idx);
      // A graph is built from ONE network's tiles: the drivable streets for the
      // vehicle network, the track for the train one. Everything else on the
      // grid is invisible to it, which is what keeps a car off the rails and a
      // train off the road.
      if (!inNetwork(tier)) continue;
      const mask = computeNetworkMask(g, x, z, inNetwork);
      if (isNodeTile(g, x, z, tier, mask, inNetwork)) {
        nodeIdOf.set(idx, nodeTileIdx.length);
        nodeTileIdx.push(idx);
      }
    }
  }

  const nodes: GraphNode[] = nodeTileIdx.map((tileIdx, id) => ({
    id,
    x: tileIdx % size,
    z: Math.floor(tileIdx / size),
    edges: [],
  }));

  const edges: GraphEdge[] = [];
  const consumedSteps = new Set<number>();
  const stepKey = (tileIdx: number, bit: number): number => tileIdx * 16 + bit;

  for (const startIdx of nodeTileIdx) {
    const startId = nodeIdOf.get(startIdx)!;
    const sx = startIdx % size;
    const sz = Math.floor(startIdx / size);
    const startMask = computeNetworkMask(g, sx, sz, inNetwork);

    for (const d of DIRS) {
      if ((startMask & d.bit) === 0) continue;
      if (consumedSteps.has(stepKey(startIdx, d.bit))) continue;
      consumedSteps.add(stepKey(startIdx, d.bit));

      const runTiles: TilePoint[] = [{ x: sx, z: sz }];
      let curX = sx + d.dx;
      let curZ = sz + d.dz;
      let curIdx = indexOf(size, curX, curZ);
      let cameFromBit = OPPOSITE_BIT[d.bit]!;
      const runTier = tierAtIdx(g, curIdx);

      while (!nodeIdOf.has(curIdx)) {
        runTiles.push({ x: curX, z: curZ });
        const curMask = computeNetworkMask(g, curX, curZ, inNetwork);
        let onward: Dir | null = null;
        for (const d2 of DIRS) {
          if ((curMask & d2.bit) !== 0 && d2.bit !== cameFromBit) {
            onward = d2;
            break;
          }
        }
        if (!onward) break; // defensive: malformed run on inconsistent test data
        consumedSteps.add(stepKey(curIdx, onward.bit));
        curX += onward.dx;
        curZ += onward.dz;
        cameFromBit = OPPOSITE_BIT[onward.bit]!;
        curIdx = indexOf(size, curX, curZ);
      }
      runTiles.push({ x: curX, z: curZ });
      consumedSteps.add(stepKey(curIdx, cameFromBit));

      const endId = nodeIdOf.get(curIdx);
      if (endId === undefined) break; // malformed run terminated without reaching a node

      const edgeId = edges.length;
      const edge: GraphEdge = {
        id: edgeId,
        a: startId,
        b: endId,
        tier: runTier,
        tiles: runTiles,
        length: runTiles.length,
        volume: 0,
      };
      const stored = storedRunDirection(g, runTiles);
      if (stored !== null) edge.forwardAtoB = stored;
      const facts = runFacts(g, runTiles, stored, profileFor);
      if (facts) {
        edge.classId = facts.classId;
        edge.lanes = facts.lanes;
        if (facts.split) {
          edge.lanesAtoB = facts.split.atoB;
          edge.lanesBtoA = facts.split.btoA;
        }
        if (facts.pocket.atoB) edge.pocketAtoB = true;
        if (facts.pocket.btoA) edge.pocketBtoA = true;
      }
      edges.push(edge);
      nodes[startId]!.edges.push(edgeId);
      nodes[endId]!.edges.push(edgeId);
    }
  }

  markLaneDrops(nodes, edges);
  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// RoadNetworkApi implementation
// ---------------------------------------------------------------------------

export class RoadNetwork implements RoadNetworkApi {
  private nodes: GraphNode[] = [];
  private edges: GraphEdge[] = [];
  private grid: GridState | null = null;
  private dirty = false;
  /**
   * Optional per-edge pathfind cost multiplier (e.g. a district's
   * noHeavyTraffic policy), injected by the worker. Null -> no adjustment, so
   * default routing is unchanged.
   */
  private edgeCostHook: ((edge: GraphEdge) => number) | null = null;
  private profileFor: ProfileResolver | null = null;

  /** A stored profile id as a cross-section: the injected table, else the preset its tier names. */
  private resolveProfile(id: number): RoadProfile | null {
    const injected = this.profileFor?.(id);
    if (injected) return injected;
    return isPresetProfileId(id) ? presetProfileForTier(id as RoadTier) : null;
  }

  /**
   * Which tiers this network is built from. Defaults to the drivable streets,
   * so an unparameterized instance is the vehicle network it has always been;
   * `isRailTier` gives the train network off the same implementation. The two
   * predicates are disjoint, so the graphs never share an edge.
   */
  private readonly inNetwork: NetworkTiers;

  /**
   * Tile index -> the id of the edge whose run covers it. Built lazily, only
   * when a snap actually needs it, and dropped with the graph. Keeps the
   * mid-run fallback in nearestNode off the hot path: routing that finds a node
   * by proximity — nearly all of it — never builds this at all.
   */
  private tileEdge: Map<number, number> | null = null;

  constructor(inNetwork: NetworkTiers = isStreetTier) {
    this.inNetwork = inNetwork;
  }

  /** Injects the per-edge cost multiplier; pass null to clear it. */
  setEdgeCostHook(hook: ((edge: GraphEdge) => number) | null): void {
    this.edgeCostHook = hook;
  }

  /**
   * How a stored profile id becomes a cross-section. A preset resolves from
   * the catalogue; a player-composed one lives in the save's own table, which
   * only the worker holds, so it injects this. Without it every road is read
   * as the preset its tier names, which is what every road was.
   */
  setProfileResolver(resolve: ProfileResolver | null): void {
    this.profileFor = resolve;
    this.dirty = true;
  }

  rebuild(grid: GridState): void {
    this.grid = grid;
    const built = buildGraph(grid, this.inNetwork, (id) => this.resolveProfile(id));
    this.nodes = built.nodes;
    this.edges = built.edges;
    this.tileEdge = null;
    this.dirty = false;
    this.refreshControls();
  }

  /**
   * Works out who gives way at every junction, from the classes that meet
   * there and what those arms have been carrying. Called whenever either can
   * have changed: when the graph is rebuilt, and once a game day when the
   * volumes decay — which is what makes a control that only a busy junction
   * warrants appear as the city fills, and go away again when it empties.
   *
   * A junction the player has set keeps what they set. The warrant never
   * argues with a choice, so it is not even worked out for that node.
   */
  private refreshControls(): void {
    const byId = new Map<number, GraphEdge>();
    for (const edge of this.edges) byId.set(edge.id, edge);
    const lookup = (id: number): GraphEdge | undefined => byId.get(id);
    const grid = this.grid;
    for (const node of this.nodes) {
      const override = grid
        ? controlFromCode(grid.junctionControl[indexOf(grid.size, node.x, node.z)] ?? 0)
        : null;
      // The warrant is worked out either way, so the inspector can say what
      // handing the junction back to it would mean.
      node.warranted = warrantedControl(armsAt(node, lookup).map((arm) => arm.approach));
      node.control = override ?? node.warranted;
      node.turns = grid ? (grid.junctionTurns[indexOf(grid.size, node.x, node.z)] ?? 0) : 0;
      // The four arms' per-lane sets, so the router divides a movement's delay
      // by the lanes that actually serve it rather than by the lanes the
      // approach would have offered had nobody said otherwise.
      node.laneTurns = grid
        ? Array.from(
            { length: ARMS_PER_TILE },
            (_, arm) =>
              grid.junctionLaneTurns[indexOf(grid.size, node.x, node.z) * ARMS_PER_TILE + arm] ?? 0,
          )
        : undefined;
    }
  }

  /**
   * Correctness over cleverness: any region edit marks the whole
   * cached graph dirty; the next query rebuilds it fully from the grid this
   * network was last (re)built from.
   */
  invalidateRegion(_minX: number, _minZ: number, _maxX: number, _maxZ: number): void {
    this.dirty = true;
  }

  private ensureFresh(): void {
    if (!this.dirty || !this.grid) return;
    const built = buildGraph(this.grid, this.inNetwork, (id) => this.resolveProfile(id));
    this.nodes = built.nodes;
    this.edges = built.edges;
    this.tileEdge = null;
    this.dirty = false;
    this.refreshControls();
  }

  /** The edge whose run covers this tile, or null if the tile is off-network. */
  private edgeCovering(x: number, z: number): GraphEdge | null {
    const grid = this.grid;
    if (!grid) return null;
    if (!this.tileEdge) {
      const index = new Map<number, number>();
      for (const edge of this.edges) {
        for (const tile of edge.tiles) index.set(indexOf(grid.size, tile.x, tile.z), edge.id);
      }
      this.tileEdge = index;
    }
    const id = this.tileEdge.get(indexOf(grid.size, x, z));
    return id === undefined ? null : (this.edges[id] ?? null);
  }

  /**
   * The node a point routes through: the nearest one by proximity, as always.
   *
   * Failing that, a point standing ON a run snaps to the nearer END of that
   * run. A long junction-free corridor has graph nodes only at its two ends, so
   * proximity alone calls a stop in the middle of one off-network however
   * plainly it is standing on the rails — which is exactly the shape of a
   * dedicated transit corridor, and why a tram or rail line down one carried
   * nobody. An ordinary street grid is junction-dense and never reaches here.
   */
  nearestNode(x: number, z: number): number | null {
    this.ensureFresh();
    const near = findNearestNode(this.nodes, x, z);
    if (near !== null) return near;

    const edge = this.edgeCovering(x, z);
    if (!edge) return null;
    const a = this.nodes[edge.a];
    const b = this.nodes[edge.b];
    if (!a) return b?.id ?? null;
    if (!b) return a.id;
    const toA = Math.abs(a.x - x) + Math.abs(a.z - z);
    const toB = Math.abs(b.x - x) + Math.abs(b.z - z);
    return toA <= toB ? a.id : b.id;
  }

  findPath(
    from: TilePoint,
    to: TilePoint,
    edgeCostMultiplier?: (edge: GraphEdge) => number,
  ): PathResult | null {
    this.ensureFresh();
    const hook = this.edgeCostHook;
    // Compose the district cost hook with the caller's per-trip multiplier so
    // both apply; either may be absent.
    const composed =
      edgeCostMultiplier === undefined
        ? (hook ?? undefined)
        : (edge: GraphEdge): number => (hook ? hook(edge) : 1) * edgeCostMultiplier(edge);
    // Snapping goes through this network's own rule, not the plain proximity
    // search, so a route between two points standing mid-run still finds them.
    return runAstar(this.nodes, this.edges, from, to, composed, this.inNetwork, (x, z) =>
      this.nearestNode(x, z),
    );
  }

  addVolume(edgeIds: number[], amount: number): void {
    this.ensureFresh();
    for (const id of edgeIds) {
      const edge = this.edges[id];
      if (edge) edge.volume += amount;
    }
  }

  decayVolumes(factor: number): void {
    this.ensureFresh();
    for (const edge of this.edges) {
      edge.volume *= factor;
    }
    this.refreshControls();
  }

  getEdges(): readonly GraphEdge[] {
    this.ensureFresh();
    return this.edges;
  }

  getNodes(): readonly GraphNode[] {
    this.ensureFresh();
    return this.nodes;
  }
}
