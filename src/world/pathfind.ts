/**
 * SlimCity road pathfinding: A* over the road network's node
 * graph, with congestion-aware edge costs. Pure — no GridState, no three.js
 * or DOM — operates only on the graph shape (GraphNode[]/GraphEdge[]) so it
 * is trivially unit-testable and is reused by src/world/roads.ts's
 * RoadNetwork.findPath.
 */

import { flowForStep, isStreetTier, RoadFlow, RoadTier } from '../shared/types';
import type { GraphEdge, GraphNode, PathResult, RoadClassId, TilePoint } from '../shared/types';
import {
  greenShareFor,
  laneCount,
  presetProfileForTier,
  profileCapacity,
  profileSpeed,
  ROAD_PRESETS,
} from '../shared/roadprofile';
import { approachGivesWay, controlDelaySeconds, mergeDelaySeconds } from '../shared/junction';
import {
  armAllowed,
  laneMovementsFor,
  movementAllowed,
  movementBetween,
  movementDelayShare,
  pocketLaneMovements,
  pocketWarranted,
} from '../shared/approach';
import type { JunctionApproach } from '../shared/junction';

interface EdgeRates {
  /** m/s along the edge — the tier's posted speed over 3.6. */
  speed: number;
  /** Σ lane-piece capacity, the volume at which the edge is saturated. */
  capacity: number;
}

// Speed and capacity are DERIVED from each tier's preset cross-section, once,
// so the per-edge cost is a map lookup rather than a catalogue scan.
const RATES_BY_TIER: ReadonlyMap<RoadTier, EdgeRates> = new Map(
  ROAD_PRESETS.filter((s) => s.profile).map((s) => [
    s.tier,
    { speed: profileSpeed(s.profile!), capacity: profileCapacity(s.profile!) },
  ]),
);
const MAX_ROAD_SPEED: number = Math.max(1, ...[...RATES_BY_TIER.values()].map((r) => r.speed));

function ratesForTier(tier: RoadTier): EdgeRates {
  // Defensive fallback only: every tier that can label a built edge has a
  // preset. This never masks a real bug — it just keeps routing from throwing
  // on unexpected data.
  return RATES_BY_TIER.get(tier) ?? RATES_BY_TIER.get(RoadTier.TwoLane)!;
}

/**
 * How much of an edge's capacity serves the direction being travelled, as a
 * multiple of an even split. A road that is the same both ways gives 1, which
 * is what every road gave before a profile could say otherwise; a road with
 * two lanes one way and one the other gives 4/3 to the wider side and 2/3 to
 * the narrower, so the short side congests first.
 *
 * Volume stays a whole-road figure, since that is what the traffic system
 * assigns; this scales the capacity it is compared against, and nothing else.
 */
function directionShare(edge: GraphEdge, fromNodeId: number): number {
  const atoB = edge.lanesAtoB;
  const btoA = edge.lanesBtoA;
  if (atoB === undefined || btoA === undefined || atoB + btoA === 0) return 1;
  const travelled = fromNodeId === edge.a ? atoB : btoA;
  return travelled / ((atoB + btoA) / 2);
}

/**
 * How full the direction of `edge` leaving `fromNodeId` is: volume over the
 * capacity serving that direction, capped at one. It is what scales the edge's
 * own cost, and it is what the junction warrant reads off each arm.
 */
export function approachSaturation(edge: GraphEdge, fromNodeId: number): number {
  const rates = ratesForTier(edge.tier);
  const mine = rates.capacity * directionShare(edge, fromNodeId);
  // A run that drops lanes ahead can only deliver what the road it drops into
  // takes: the taper is the narrow part of the pipe, and traffic heading into
  // it queues for the narrow road rather than the wide one it is still on.
  const ahead = fromNodeId === edge.a ? edge.narrowsAtB : edge.narrowsAtA;
  const capacity = Math.min(mine, ahead ?? Number.POSITIVE_INFINITY);
  return capacity > 0 ? Math.min(1, edge.volume / capacity) : 1;
}

/** The capacity a run of this tier carries, both directions summed. */
export function capacityForTier(tier: RoadTier): number {
  return ratesForTier(tier).capacity;
}

/** length / speed, scaled up as volume approaches (or exceeds) the capacity serving this direction. */
function edgeCost(edge: GraphEdge, fromNodeId: number): number {
  const rates = ratesForTier(edge.tier);
  return (edge.length / rates.speed) * (1 + 2 * approachSaturation(edge, fromNodeId));
}

/** How an edge id resolves to its edge; the graph's own map, passed as a function. */
export type EdgeLookup = (id: number) => GraphEdge | undefined;

/** One arm of a junction, and the edge it arrives on. */
export interface JunctionArm {
  edgeId: number;
  approach: JunctionApproach;
  /** Whether this arm's cross-section can find the width for a turn pocket. */
  canPocket: boolean;
}

/**
 * The arms of a junction as the warrant reads them: what class each road is,
 * how many lanes it brings IN to the node, and how full those lanes are. An
 * edge whose cross-section was never resolved reads as the preset its tier
 * names, which is what every road read as before a profile could say
 * otherwise.
 */
export function armsAt(node: GraphNode, edgeById: EdgeLookup): JunctionArm[] {
  const arms: JunctionArm[] = [];
  for (const edgeId of node.edges) {
    const edge = edgeById(edgeId);
    if (!edge) continue;
    // Traffic on this arm arrives from the FAR end of the run, so that end is
    // the direction its lanes and its volume are read in.
    const fromNodeId = edge.a === node.id ? edge.b : edge.a;
    const preset = presetProfileForTier(edge.tier);
    const lanesIn = fromNodeId === edge.a ? edge.lanesAtoB : edge.lanesBtoA;
    const total = edge.lanes ?? laneCount(preset);
    arms.push({
      edgeId,
      approach: {
        classId: edge.classId ?? preset.class,
        lanes: lanesIn ?? Math.max(1, Math.round(total / 2)),
        vc: approachSaturation(edge, fromNodeId),
      },
      // The pocket belongs to the half of the road arriving here, which is the
      // one the traffic coming from the far end of the run is on.
      canPocket: (fromNodeId === edge.a ? edge.pocketAtoB : edge.pocketBtoA) === true,
    });
  }
  return arms;
}

/**
 * Seconds a driver loses arriving at `node` along `arriving`. A node whose
 * control has not been worked out costs nothing, which is exactly what every
 * junction cost before one did.
 */
export function junctionDelay(
  node: GraphNode,
  arriving: GraphEdge | null,
  leaving: GraphEdge,
  edgeById: EdgeLookup,
): number {
  const control = node.control;
  // A driver setting off from a junction did not queue at it.
  if (!arriving) return 0;
  // Coming up a slip road onto a motorway is a MERGE, not a junction. Nobody
  // stops the driver and no control is warranted where a motorway is an arm,
  // but they still have to find a gap in the traffic already there — so this
  // is the one movement at a grade-separated node that is not free.
  const merging = mergeDelay(node, arriving, leaving);
  if (merging !== null) return merging;
  // A junction with no control has no queue to wait in.
  if (!control || control === 'none') return 0;
  const arms = armsAt(node, edgeById);
  const arm = arms.find((a) => a.edgeId === arriving.id);
  const mine = arm?.approach;
  if (!arm || !mine) return 0;
  const approaches = arms.map((a) => a.approach);
  const delay = controlDelaySeconds(control, approachGivesWay(control, mine, approaches), {
    vc: mine.vc,
    greenShare: greenShareFor(mine.classId),
  });
  // Per MOVEMENT: the queue for a turn two lanes offer is half as long as the
  // queue for one, so a wide approach is quicker for the movement it widened.
  const movement = movementBetween(headingInto(arriving, node.id), headingOutOf(leaving, node.id));
  if (movement === null) return delay;
  const allowed = armAllowed(node.turns ?? 0, armOf(arriving, node.id));
  // The approach zone's turn pocket is a lane the arm has HERE — the left turn
  // waits in it instead of holding up the traffic going straight, and both
  // movements are quicker for it.
  const pocket = arm.canPocket && pocketWarranted(control, allowed);
  const lanes = pocket
    ? pocketLaneMovements(mine.lanes + 1, allowed)
    : laneMovementsFor(mine.lanes, allowed);
  return delay / movementDelayShare(movement, lanes);
}

/** The class a run carries: its own cross-section's, or the preset its tier names. */
function classOf(edge: GraphEdge): RoadClassId {
  return edge.classId ?? presetProfileForTier(edge.tier).class;
}

/**
 * What a driver loses merging onto a motorway off a slip road, or null when
 * the movement they are making is not that.
 *
 * Only the traffic coming UP the ramp pays. A driver already on the motorway
 * is not merging; one leaving it down a ramp is diverging, which costs nothing
 * here — whatever that costs is paid at the terminal further down the ramp.
 * The cost is read off how full the motorway they are joining is, in the
 * direction they are joining it.
 */
function mergeDelay(node: GraphNode, arriving: GraphEdge, leaving: GraphEdge): number | null {
  if (classOf(arriving) !== 'ramp' || classOf(leaving) !== 'highway') return null;
  return mergeDelaySeconds(approachSaturation(leaving, node.id));
}

/** The direction the arm carrying `edge` lies in, seen from `nodeId`. */
function armOf(edge: GraphEdge, nodeId: number): RoadFlow {
  return headingOutOf(edge, nodeId);
}

/** Which way a driver is heading as they ARRIVE at `nodeId` along `edge`. */
function headingInto(edge: GraphEdge, nodeId: number): RoadFlow {
  const tiles = edge.tiles;
  const n = tiles.length;
  if (n < 2) return RoadFlow.None;
  const [from, to] = nodeId === edge.b ? [tiles[n - 2]!, tiles[n - 1]!] : [tiles[1]!, tiles[0]!];
  return flowForStep(to.x - from.x, to.z - from.z);
}

/**
 * Which way a driver is heading as they LEAVE `nodeId` along `edge` — which is
 * also the direction the arm carrying that edge lies in.
 */
function headingOutOf(edge: GraphEdge, nodeId: number): RoadFlow {
  const tiles = edge.tiles;
  const n = tiles.length;
  if (n < 2) return RoadFlow.None;
  const [from, to] = nodeId === edge.a ? [tiles[0]!, tiles[1]!] : [tiles[n - 1]!, tiles[n - 2]!];
  return flowForStep(to.x - from.x, to.z - from.z);
}

/**
 * Whether a driver who arrived at `node` along `arriving` may leave along
 * `leaving`. A junction nobody has restricted allows every turn but the U —
 * which is what makes doubling back at one a thing the router will not do. A
 * run whose geometry names no cardinal has no turn to judge, so it is allowed.
 */
export function turnAllowed(
  node: GraphNode,
  arriving: GraphEdge | null,
  leaving: GraphEdge,
): boolean {
  if (!arriving) return true; // setting off: there is no turn yet
  const movement = movementBetween(headingInto(arriving, node.id), headingOutOf(leaving, node.id));
  if (movement === null) return true;
  return movementAllowed(node.turns ?? 0, armOf(arriving, node.id), movement);
}

/**
 * One-way rule: a run flows the way it was DRAWN, which its tiles record and
 * its edge carries. A road laid before the direction was stored carries none,
 * and falls back to the geometry this always used — along the straight axis
 * from the lower coord to the higher, read from the edge's endpoint tiles
 * (`tiles[0]` is node a's tile, `tiles[last]` is node b's — see buildGraph in
 * roads.ts). A corner-turning run resolves by whichever axis has the larger
 * endpoint delta.
 */
function oneWayForwardIsAtoB(edge: GraphEdge): boolean {
  if (edge.forwardAtoB !== undefined) return edge.forwardAtoB;
  const tiles = edge.tiles;
  if (tiles.length < 2) return true; // degenerate: nothing to restrict
  const first = tiles[0]!;
  const last = tiles[tiles.length - 1]!;
  const dx = last.x - first.x;
  const dz = last.z - first.z;
  return Math.abs(dx) >= Math.abs(dz) ? dx >= 0 : dz >= 0;
}

/**
 * Whether travel across `edge` starting at node `fromNodeId` is permitted.
 * Two-way tiers (every tier except RoadTier.OneWay) are always traversable
 * in both directions — zero behavior change for existing tiers. A one-way
 * edge is traversable only in its flow direction (see `oneWayForwardIsAtoB`).
 *
 * `inNetwork` is the membership test of the network being traversed, and
 * defaults to the drivable-street one, so a caller that does not pass it
 * behaves exactly as before. It generalises what used to be a hardcoded "rail
 * is never drivable" veto: a graph is built from one network's tiles, so an
 * edge of any OTHER network's tier has no business being crossed. Belt and
 * suspenders — buildGraph already keeps the two apart — but it is what stops a
 * train routing down a street as surely as it stops a car railroading.
 */
export function edgeTraversable(
  edge: GraphEdge,
  fromNodeId: number,
  inNetwork: (tier: RoadTier) => boolean = isStreetTier,
): boolean {
  if (!inNetwork(edge.tier)) return false;
  if (edge.tier !== RoadTier.OneWay) return true;
  return oneWayForwardIsAtoB(edge) ? fromNodeId === edge.a : fromNodeId === edge.b;
}

/**
 * Closest node to (x, z) within `maxManhattan` tiles (default 8), scanning
 * the full node list. Returns null if none qualify. Ties keep the
 * first-encountered node.
 */
export function nearestNode(
  nodes: readonly GraphNode[],
  x: number,
  z: number,
  maxManhattan = 8,
): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  for (const n of nodes) {
    const d = Math.abs(n.x - x) + Math.abs(n.z - z);
    if (d <= maxManhattan && d < bestDist) {
      bestDist = d;
      best = n.id;
    }
  }
  return best;
}

/** Minimal binary min-heap keyed by an external priority; A*'s open set. */
class MinHeap<T> {
  private heap: Array<{ item: T; priority: number }> = [];

  get size(): number {
    return this.heap.length;
  }

  push(item: T, priority: number): void {
    const heap = this.heap;
    heap.push({ item, priority });
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      const parentEntry = heap[parent]!;
      const entry = heap[i]!;
      if (parentEntry.priority <= entry.priority) break;
      heap[parent] = entry;
      heap[i] = parentEntry;
      i = parent;
    }
  }

  pop(): T | undefined {
    const heap = this.heap;
    const top = heap[0];
    if (!top) return undefined;
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      const n = heap.length;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let smallest = i;
        if (l < n && heap[l]!.priority < heap[smallest]!.priority) smallest = l;
        if (r < n && heap[r]!.priority < heap[smallest]!.priority) smallest = r;
        if (smallest === i) break;
        const tmp = heap[i]!;
        heap[i] = heap[smallest]!;
        heap[smallest] = tmp;
        i = smallest;
      }
    }
    return top.item;
  }
}

/**
 * A* over the node graph. Entry/exit nodes are the nearest graph nodes to
 * `from`/`to` (within 8 tiles manhattan, see `nearestNode`). Edge cost is
 * congestion-aware (see `edgeCost`). Returns null when either endpoint has
 * no nearby node, or when no route connects the two entry/exit nodes.
 * `points` concatenates each traversed edge's tiles, reversed when the edge
 * is walked b->a, with the shared junction tile deduplicated at each seam.
 */
export function findPath(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  from: TilePoint,
  to: TilePoint,
  /**
   * Optional per-edge cost multiplier (e.g. a district's
   * noHeavyTraffic policy). Applied on top of the congestion-aware base cost.
   * Omitted/undefined -> multiplier 1 everywhere, i.e. no behavior change
   * (every existing caller and test routes identically).
   */
  edgeCostMultiplier?: (edge: GraphEdge) => number,
  /**
   * Membership test of the network being routed over. Defaults to the
   * drivable-street one, so every existing caller routes identically; the rail
   * network passes its own so a train can cross the track edges a car cannot.
   */
  inNetwork?: (tier: RoadTier) => boolean,
  /**
   * How an endpoint tile resolves to a graph node. Defaults to plain proximity
   * over the node list, which is what every caller got before this existed. A
   * caller that can snap better — RoadNetwork, which also knows which run a
   * tile lies on — passes its own so a point standing mid-run still routes.
   */
  snap: (x: number, z: number) => number | null = (x, z) => nearestNode(nodes, x, z),
): PathResult | null {
  const startId = snap(from.x, from.z);
  const endId = snap(to.x, to.z);
  if (startId === null || endId === null) return null;

  const nodeById = new Map<number, GraphNode>();
  for (const n of nodes) nodeById.set(n.id, n);
  const edgeById = new Map<number, GraphEdge>();
  for (const e of edges) edgeById.set(e.id, e);

  const startNode = nodeById.get(startId);
  const endNode = nodeById.get(endId);
  if (!startNode || !endNode) return null;

  if (startId === endId) {
    return { nodes: [startId], edges: [], points: [{ x: startNode.x, z: startNode.z }], cost: 0 };
  }

  // Admissible & consistent: an edge's tile length is always >= the manhattan
  // distance between its endpoints, and cost = length/speed*(>=1) >= length
  // / maxSpeed, so manhattan/maxSpeed never overestimates the true remaining
  // cost.
  const heuristic = (n: GraphNode): number =>
    (Math.abs(n.x - endNode.x) + Math.abs(n.z - endNode.z)) / MAX_ROAD_SPEED;

  // The search state is not a node but a node AND THE EDGE THAT REACHED IT: a
  // turn is only legal or illegal once you know which way the driver came in,
  // and a junction's delay only divides by the lanes serving a movement once
  // you know which movement it is. Keyed as edgeId*2 plus which end it was
  // reached at, with -1 for the start, where nobody has arrived from anywhere.
  const START = -1;
  const keyOf = (edge: GraphEdge, atNodeId: number): number =>
    edge.id * 2 + (atNodeId === edge.b ? 1 : 0);
  const edgeOfState = (key: number): GraphEdge | null =>
    key === START ? null : (edgeById.get(key >> 1) ?? null);
  const nodeOfState = (key: number): number => {
    if (key === START) return startId;
    const edge = edgeById.get(key >> 1);
    if (!edge) return startId;
    return (key & 1) === 1 ? edge.b : edge.a;
  };

  const gScore = new Map<number, number>([[START, 0]]);
  const cameFrom = new Map<number, number>();
  const closed = new Set<number>();
  const open = new MinHeap<number>();
  open.push(START, heuristic(startNode));

  let endState: number | null = null;
  while (open.size > 0) {
    const currentKey = open.pop();
    if (currentKey === undefined) break;
    if (closed.has(currentKey)) continue;
    closed.add(currentKey);

    const currentId = nodeOfState(currentKey);
    if (currentId === endId) {
      endState = currentKey; // a consistent heuristic settles the best one first
      break;
    }
    const current = nodeById.get(currentId);
    if (!current) continue;
    const arriving = edgeOfState(currentKey);
    const currentG = gScore.get(currentKey) ?? Infinity;

    for (const edgeId of current.edges) {
      const edge = edgeById.get(edgeId);
      if (!edge) continue;
      if (!edgeTraversable(edge, currentId, inNetwork)) continue; // wrong network, or one-way against the flow
      const otherId: number = edge.a === currentId ? edge.b : edge.a;
      if (otherId === currentId) continue;
      if (!turnAllowed(current, arriving, edge)) continue; // a banned turn is not a path
      const nextKey = keyOf(edge, otherId);
      if (closed.has(nextKey)) continue;

      // The junction is paid for on DEPARTURE, which is the moment both the
      // arm it was entered by and the movement being made are known. Delays
      // are never negative, so the heuristic stays admissible by ignoring them.
      const delay = junctionDelay(current, arriving, edge, (id) => edgeById.get(id));
      const tentative =
        currentG +
        edgeCost(edge, currentId) * (edgeCostMultiplier ? edgeCostMultiplier(edge) : 1) +
        delay;
      if (tentative < (gScore.get(nextKey) ?? Infinity)) {
        gScore.set(nextKey, tentative);
        cameFrom.set(nextKey, currentKey);
        const otherNode = nodeById.get(otherId);
        if (otherNode) open.push(nextKey, tentative + heuristic(otherNode));
      }
    }
  }

  if (endState === null) return null;
  const finalCost = gScore.get(endState);
  if (finalCost === undefined) return null;

  const nodePath: number[] = [];
  const edgePath: number[] = [];
  for (let cursor: number | undefined = endState; cursor !== undefined;) {
    nodePath.push(nodeOfState(cursor));
    const edge = edgeOfState(cursor);
    if (edge) edgePath.push(edge.id);
    cursor = cursor === START ? undefined : cameFrom.get(cursor);
    if (cursor === undefined && edge) return null; // defensive: a broken chain
  }
  nodePath.reverse();
  edgePath.reverse();

  const points: TilePoint[] = [];
  for (let i = 0; i < edgePath.length; i++) {
    const edgeId = edgePath[i]!;
    const edge = edgeById.get(edgeId)!;
    const fromNodeId = nodePath[i]!;
    const ordered = edge.a === fromNodeId ? edge.tiles : [...edge.tiles].reverse();
    const start = i === 0 ? 0 : 1; // skip the tile shared with the previous edge's end
    for (let k = start; k < ordered.length; k++) {
      points.push(ordered[k]!);
    }
  }

  return { nodes: nodePath, edges: edgePath, points, cost: finalCost };
}
