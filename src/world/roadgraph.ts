/**
 * The node/edge graph routing runs on, built from the road network's cells
 * (src/world/roadnet.ts) rather than from the tile layers: a run follows the
 * network from one node to the next, and two roads the network does not join
 * are never one run. Pure logic — no three.js, no DOM.
 */

import {
  armsAt,
  capacityForTier,
  findPath as runAstar,
  nearestNode as findNearestNode,
} from './pathfind';
import { flowDirection, flowForStep, isStreetTier, RoadFlow } from '../shared/types';
import { canGainTurnPocket, isPresetProfileId, presetProfileForTier } from '../shared/roadprofile';
import { controlFromCode, warrantedControl } from '../shared/junction';
import { ARMS_PER_TILE } from './grid';
import { cellRoute, cellTile, cellWeight, neighbours, roadCellsOf } from './roadnet';
import type { RoadCells } from './roadnet';
import type { NetworkTiers, RoadKey } from './roads';
import type {
  GraphEdge,
  GraphNode,
  GridState,
  PathResult,
  RoadClassId,
  RoadNetworkApi,
  RoadProfile,
  RoadTier,
  TilePoint,
} from '../shared/types';

const indexOf = (size: number, x: number, z: number): number => z * size + x;

/** Resolves a stored profile id to the cross-section it names, or null. */
export type ProfileResolver = (id: number) => RoadProfile | null;

const tierOf = (cells: RoadCells, id: number): RoadTier => cells.tier[id] as RoadTier;

/**
 * The cells a cell is linked to, counting only those that belong to the SAME
 * transport network, so a graph built from one set of tiers never links to
 * another. Grid steps come first, north, east, south, west.
 */
function networkNeighbours(cells: RoadCells, id: number, inNetwork: NetworkTiers): number[] {
  return neighbours(cells, id).filter((next) => inNetwork(tierOf(cells, next)));
}

/**
 * A road is a node when it's an intersection/endpoint/isolated road (neighbour
 * count != 2), or — even with exactly 2 neighbours — when its own tier is
 * strictly higher than at least one neighbour's tier. That second rule places
 * exactly one node at each straight-through tier boundary (on the higher-tier
 * side), so edges can carry a single tier each.
 *
 * A boundary against a JUNCTION needs no node of its own — the junction is the
 * boundary. Adding a second one a tile away leaves a one-tile run between them
 * that is nothing but the seam, and a run with no body has no road to be: a
 * slip road reaching a street one tile short of the junction would read as the
 * street, and the junction would be warranted as though no slip road arrived
 * at it. A dead end or a bend is not a junction and the boundary still stands
 * on the greater road's side of it.
 */
function isNode(
  cells: RoadCells,
  tier: RoadTier,
  links: readonly number[],
  inNetwork: NetworkTiers,
): boolean {
  if (links.length !== 2) return true;
  for (const next of links) {
    if (tierOf(cells, next) >= tier) continue;
    if (networkNeighbours(cells, next, inNetwork).length >= 3) continue;
    return true;
  }
  return false;
}

/**
 * Which way a run's roads say they were drawn, relative to the walk from node
 * a to node b: true when the stored flow points along that walk, false when it
 * points against it, and null when no road of the run ever recorded one — a
 * road laid before the direction was stored, which leaves its reader to fall
 * back to the geometry it always used.
 *
 * The first road that has an answer gives it, reading the run's own roads
 * before its ends. An end is a node, and a node where two roads cross holds
 * the flow of whichever was drawn through it last — the crossing road's, not
 * this one's. A run is one street between two nodes, so its own roads were
 * laid by one drag and agree; a run stitched together from two drags is
 * decided by the end the walk started from.
 */
function storedRunDirection(
  cells: RoadCells,
  runTiles: readonly TilePoint[],
  runKeys: readonly RoadKey[],
): boolean | null {
  const last = runTiles.length - 1;
  const interior = Array.from({ length: Math.max(0, last - 1) }, (_, k) => k + 1);
  const keys = 2 * cells.size * cells.size;
  for (const i of [...interior, 0]) {
    const id = runKeys[i]!;
    // A road off the grid records only whether it runs one way, from its first
    // node to its second; the walk runs with it when it steps toward the second.
    if (id >= keys) {
      if (cells.freeSeg[id - keys]! < 0 || cells.flow[id] !== 1) continue;
      return cells.freeTowardB[id - keys] === runKeys[i + 1];
    }
    const here = runTiles[i]!;
    const next = runTiles[i + 1]!;
    // The direction only: the byte also carries which half of a corridor the
    // road is, and comparing that against a bare RoadFlow never matches.
    const stored = flowDirection(cells.flow[id] ?? RoadFlow.None);
    if (stored === RoadFlow.None) continue;
    const along = flowForStep(next.x - here.x, next.z - here.z);
    if (along === RoadFlow.None) continue; // defensive: a non-orthogonal step
    if (stored === along) return true;
    if (stored === flowForStep(here.x - next.x, here.z - next.z)) return false;
    // Across the step: a crossing road's flow, which says nothing about this one.
  }
  return null;
}

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
  cells: RoadCells,
  runKeys: readonly RoadKey[],
  forwardAtoB: boolean | null,
  profileFor: ProfileResolver,
): {
  classId: RoadClassId;
  lanes: number;
  split: { atoB: number; btoA: number } | null;
  pocket: { atoB: boolean; btoA: boolean };
} | null {
  const mid = runKeys[Math.floor(runKeys.length / 2)];
  if (mid === undefined) return null;
  const profile = profileFor(cells.profile[mid] ?? 0);
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

interface BuiltGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function buildGraph(
  cells: RoadCells,
  inNetwork: NetworkTiers,
  profileFor: ProfileResolver,
): BuiltGraph {
  const size = cells.size;
  const tileCount = size * size;
  // Keyed by cell rather than by tile, so the road passing over a crossing
  // tile and the road on it are two different things to the graph, and so is
  // a road off the grid crossing a tile.
  const nodeIdOf = new Map<number, number>();
  const nodeKeys: number[] = [];
  // A graph is built from ONE network's roads: the drivable streets for the
  // vehicle network, the track for the train one. Everything else is invisible
  // to it, which is what keeps a car off the rails and a train off the road.
  // Roads on the ground come first, then the roads passing over them, then the
  // roads off the grid.
  for (let id = 0; id < cells.count; id++) {
    const tier = tierOf(cells, id);
    if (tier === 0 || !inNetwork(tier)) continue;
    if (isNode(cells, tier, networkNeighbours(cells, id, inNetwork), inNetwork)) {
      nodeIdOf.set(id, nodeKeys.length);
      nodeKeys.push(id);
    }
  }

  const tileOf = (id: number): TilePoint => {
    const idx = cellTile(cells, id);
    return { x: idx % size, z: Math.floor(idx / size) };
  };
  const nodes: GraphNode[] = nodeKeys.map((key, id) => ({ id, ...tileOf(key), edges: [] }));

  const edges: GraphEdge[] = [];
  const consumedSteps = new Set<number>();
  const stepKey = (from: number, to: number): number => from * cells.count + to;

  for (const startKey of nodeKeys) {
    const startId = nodeIdOf.get(startKey)!;

    for (const first of networkNeighbours(cells, startKey, inNetwork)) {
      if (consumedSteps.has(stepKey(startKey, first))) continue;
      consumedSteps.add(stepKey(startKey, first));

      const runKeys: number[] = [startKey];
      let prev = startKey;
      let cur = first;
      const runTier = tierOf(cells, cur);

      while (!nodeIdOf.has(cur)) {
        runKeys.push(cur);
        const onward = networkNeighbours(cells, cur, inNetwork).find((next) => next !== prev);
        if (onward === undefined) break; // defensive: malformed run on inconsistent test data
        consumedSteps.add(stepKey(cur, onward));
        prev = cur;
        cur = onward;
      }
      runKeys.push(cur);
      consumedSteps.add(stepKey(cur, prev));

      const endId = nodeIdOf.get(cur);
      if (endId === undefined) break; // malformed run terminated without reaching a node

      const runTiles = runKeys.map(tileOf);
      const edgeId = edges.length;
      // A grid tile is one tile of road; a road off the grid is as long as
      // its centre line, so a run's length is the distance a driver covers.
      const length = runKeys.reduce((sum, id) => sum + cellWeight(cells, id), 0);
      const route: { x: number; z: number }[] = [];
      runKeys.forEach((key, i) => {
        for (const p of cellRoute(cells, key, runKeys[i - 1], runKeys[i + 1])) {
          const last = route[route.length - 1];
          if (!last || last.x !== p.x || last.z !== p.z) route.push(p);
        }
      });
      const edge: GraphEdge = {
        id: edgeId,
        a: startId,
        b: endId,
        tier: runTier,
        tiles: runTiles,
        route,
        length,
        volume: 0,
      };
      const overTiles = runKeys.flatMap((key, i) =>
        key >= tileCount && key < 2 * tileCount ? [i] : [],
      );
      if (overTiles.length > 0) edge.overTiles = overTiles;
      const stored = storedRunDirection(cells, runTiles, runKeys);
      if (stored !== null) edge.forwardAtoB = stored;
      const facts = runFacts(cells, runKeys, stored, profileFor);
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
    this.build();
  }

  /** The version of the grid's road network the graph was built from, if it has one. */
  private builtFrom: number | null = null;

  /** The graph, rebuilt from the grid's road network. */
  private build(): void {
    const grid = this.grid;
    if (!grid) return;
    this.builtFrom = grid.roads?.version ?? null;
    const built = buildGraph(roadCellsOf(grid), this.inNetwork, (id) => this.resolveProfile(id));
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

  /**
   * Rebuilds when an edit has marked the graph dirty, or when the road network
   * has moved on since the graph was built — which an edit can do after the
   * graph was already rebuilt for it, since the network takes up each command
   * once it has run.
   */
  private ensureFresh(): void {
    const version = this.grid?.roads?.version ?? null;
    if (this.dirty || version !== this.builtFrom) this.build();
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
