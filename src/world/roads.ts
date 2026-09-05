/**
 * SlimCity road network: grid-level road tile edits
 * (neighbor-mask auto-tiling, tier upgrades, dezoning) plus the node/edge
 * graph built on top of the grid for routing. Pure logic over GridState —
 * no three.js, no DOM.
 */

import { findPath as runAstar, nearestNode as findNearestNode } from './pathfind';
import { RoadTier, ZoneType, isStreetTier } from '../shared/types';
import type {
  GraphEdge,
  GraphNode,
  GridState,
  PathResult,
  RoadNetworkApi,
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

/** 4-bit neighbor bitmask (+N=1 +E=2 +S=4 +W=8) of orthogonal road neighbors. */
export function computeMask(g: GridState, x: number, z: number): number {
  let mask = 0;
  if (tierAt(g, x, z - 1) !== RoadTier.None) mask |= 1;
  if (tierAt(g, x + 1, z) !== RoadTier.None) mask |= 2;
  if (tierAt(g, x, z + 1) !== RoadTier.None) mask |= 4;
  if (tierAt(g, x - 1, z) !== RoadTier.None) mask |= 8;
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
function computeNetworkMask(g: GridState, x: number, z: number, inNetwork: NetworkTiers): number {
  let mask = 0;
  if (inNetwork(tierAt(g, x, z - 1))) mask |= 1;
  if (inNetwork(tierAt(g, x + 1, z))) mask |= 2;
  if (inNetwork(tierAt(g, x, z + 1))) mask |= 4;
  if (inNetwork(tierAt(g, x - 1, z))) mask |= 8;
  return mask;
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

/**
 * Sets `tier` on every in-bounds tile in `tiles` (upgrades only — a tile
 * already carrying a strictly higher tier rejects the request and keeps its
 * existing tier, per-tile, with no error), de-zones every one of those
 * tiles, and recomputes the neighbor mask for every tile whose tier changed
 * plus its orthogonal neighbors. Returns every tile whose tier or mask
 * actually changed.
 */
export function applyRoad(
  g: GridState,
  tiles: TilePoint[],
  tier: RoadTier,
  elevations?: readonly number[],
  profile: number = tier,
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
    const sameTierNewProfile = tier === current && current !== RoadTier.None && g.roadProfile[idx] !== profile;
    if (tier > current || sameTierNewProfile) {
      g.roadTier[idx] = tier;
      g.roadProfile[idx] = profile;
      changedIdx.add(idx);
    }
    // tier < current: rejected per-tile (never a silent downgrade); the
    // tile keeps whatever (>) tier it already had.

    // Elevation follows the drag rather than the tier, so re-dragging a span
    // re-profiles it; a tile that ends up carrying no road keeps none.
    if (elevations && tierAtIdx(g, idx) !== RoadTier.None) {
      const next = elevations[i] ?? 0;
      if ((g.roadElevation[idx] ?? 0) !== next) {
        g.roadElevation[idx] = next;
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
    g.roadMask[idx] = 0;
    g.roadElevation[idx] = 0; // the deck goes with the road
    removedIdx.add(idx);
    deltaMap.set(idx, { x: t.x, z: t.z, tier: RoadTier.None, mask: 0, elevation: 0, profile: 0 });
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
 */
function isNodeTile(g: GridState, x: number, z: number, tier: RoadTier, mask: number): boolean {
  const deg = popcount(mask);
  if (deg !== 2) return true;
  for (const d of DIRS) {
    if ((mask & d.bit) === 0) continue;
    if (tierAt(g, x + d.dx, z + d.dz) < tier) return true;
  }
  return false;
}

interface BuiltGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

function buildGraph(g: GridState, inNetwork: NetworkTiers): BuiltGraph {
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
      if (isNodeTile(g, x, z, tier, mask)) {
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
      edges.push({
        id: edgeId,
        a: startId,
        b: endId,
        tier: runTier,
        tiles: runTiles,
        length: runTiles.length,
        volume: 0,
      });
      nodes[startId]!.edges.push(edgeId);
      nodes[endId]!.edges.push(edgeId);
    }
  }

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

  rebuild(grid: GridState): void {
    this.grid = grid;
    const built = buildGraph(grid, this.inNetwork);
    this.nodes = built.nodes;
    this.edges = built.edges;
    this.tileEdge = null;
    this.dirty = false;
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
    const built = buildGraph(this.grid, this.inNetwork);
    this.nodes = built.nodes;
    this.edges = built.edges;
    this.tileEdge = null;
    this.dirty = false;
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
