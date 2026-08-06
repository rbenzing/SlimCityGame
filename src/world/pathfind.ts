/**
 * SlimCity road pathfinding: A* over the road network's node
 * graph, with congestion-aware edge costs. Pure — no GridState, no three.js
 * or DOM — operates only on the graph shape (GraphNode[]/GraphEdge[]) so it
 * is trivially unit-testable and is reused by src/world/roads.ts's
 * RoadNetwork.findPath.
 */

import roadsData from '../data/roads.json';
import { RoadTier } from '../shared/types';
import type { GraphEdge, GraphNode, PathResult, RoadSpec, TilePoint } from '../shared/types';

const ROAD_SPECS: readonly RoadSpec[] = (roadsData as { specs: RoadSpec[] }).specs;
const MAX_ROAD_SPEED: number = ROAD_SPECS.reduce((max, s) => Math.max(max, s.speed), 1);

function specForTier(tier: RoadTier): RoadSpec {
  const found = ROAD_SPECS.find((s) => s.tier === tier);
  // Defensive fallback only: every tier that can ever label a built edge
  // (TwoLane/Avenue/Highway) has a catalog entry today. This never masks a
  // real bug — it just keeps routing from throwing on unexpected data.
  return found ?? ROAD_SPECS[0]!;
}

/** length / speed, scaled up as volume approaches (or exceeds) capacity. */
function edgeCost(edge: GraphEdge): number {
  const spec = specForTier(edge.tier);
  const congestion = Math.min(1, edge.volume / spec.capacity);
  return (edge.length / spec.speed) * (1 + 2 * congestion);
}

/**
 * One-way rule: a one-way tile's direction is
 * derived from its mask — it flows along its straight axis from the lower
 * coord to the higher (W->E on an E/W-ish run, N->S on an N/S-ish run). We
 * derive that here from the edge's own endpoint tiles (`tiles[0]` is node
 * a's tile, `tiles[last]` is node b's tile — see buildGraph in roads.ts)
 * rather than re-deriving it per interior tile from the road mask: for a
 * straight one-way run — the only shape this rule describes — the
 * two are equivalent, and this keeps the whole rule derivable purely from
 * data GraphEdge already carries (tier + tiles), needing no shared-type
 * change. This is a deliberate approximation (modern city builders themselves derive
 * direction from drag direction, which we don't track) — a corner-turning
 * one-way run resolves by whichever axis has the larger endpoint delta.
 */
function oneWayForwardIsAtoB(edge: GraphEdge): boolean {
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
 */
export function edgeTraversable(edge: GraphEdge, fromNodeId: number): boolean {
  // Rail is never drivable (buildGraph already keeps rail out of the graph;
  // this is a belt-and-suspenders backstop so no stray rail edge is traversed).
  if (edge.tier === RoadTier.RailTrack) return false;
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
): PathResult | null {
  const startId = nearestNode(nodes, from.x, from.z);
  const endId = nearestNode(nodes, to.x, to.z);
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

  const gScore = new Map<number, number>([[startId, 0]]);
  const cameFrom = new Map<number, { prevNode: number; edgeId: number }>();
  const closed = new Set<number>();
  const open = new MinHeap<number>();
  open.push(startId, heuristic(startNode));

  while (open.size > 0) {
    const currentId = open.pop();
    if (currentId === undefined) break;
    if (currentId === endId) break;
    if (closed.has(currentId)) continue;
    closed.add(currentId);

    const current = nodeById.get(currentId);
    if (!current) continue;
    const currentG = gScore.get(currentId) ?? Infinity;

    for (const edgeId of current.edges) {
      const edge = edgeById.get(edgeId);
      if (!edge) continue;
      if (!edgeTraversable(edge, currentId)) continue; // one-way edge, wrong direction
      const otherId: number = edge.a === currentId ? edge.b : edge.a;
      if (otherId === currentId || closed.has(otherId)) continue;

      const tentative =
        currentG + edgeCost(edge) * (edgeCostMultiplier ? edgeCostMultiplier(edge) : 1);
      if (tentative < (gScore.get(otherId) ?? Infinity)) {
        gScore.set(otherId, tentative);
        cameFrom.set(otherId, { prevNode: currentId, edgeId });
        const otherNode = nodeById.get(otherId);
        if (otherNode) open.push(otherId, tentative + heuristic(otherNode));
      }
    }
  }

  const finalCost = gScore.get(endId);
  if (finalCost === undefined || !cameFrom.has(endId)) return null;

  const nodePath: number[] = [endId];
  const edgePath: number[] = [];
  let cursor = endId;
  while (cursor !== startId) {
    const step = cameFrom.get(cursor);
    if (!step) return null; // defensive: unreachable given the checks above
    edgePath.push(step.edgeId);
    cursor = step.prevNode;
    nodePath.push(cursor);
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
