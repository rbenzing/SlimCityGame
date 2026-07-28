import { describe, expect, it } from 'vitest';
import { RoadTier } from '../shared/types';
import type { GraphEdge, GraphNode, TilePoint } from '../shared/types';
import { findPath, nearestNode } from './pathfind';

function straightRun(x0: number, z0: number, dx: number, dz: number, count: number): TilePoint[] {
  const pts: TilePoint[] = [];
  for (let i = 0; i < count; i++) {
    pts.push({ x: x0 + dx * i, z: z0 + dz * i });
  }
  return pts;
}

describe('nearestNode', () => {
  it('picks the closer of two candidate nodes', () => {
    const nodes: GraphNode[] = [
      { id: 0, x: 0, z: 0, edges: [] },
      { id: 1, x: 100, z: 100, edges: [] },
    ];
    expect(nearestNode(nodes, 1, 0)).toBe(0);
    expect(nearestNode(nodes, 97, 97)).toBe(1);
  });

  it('includes a node at exactly 8 tiles manhattan and excludes one at 9', () => {
    const nodes: GraphNode[] = [{ id: 0, x: 0, z: 0, edges: [] }];
    expect(nearestNode(nodes, 8, 0)).toBe(0);
    expect(nearestNode(nodes, 9, 0)).toBeNull();
  });

  it('breaks distance ties by keeping the first-encountered node', () => {
    const nodes: GraphNode[] = [
      { id: 0, x: 0, z: 0, edges: [] },
      { id: 1, x: 2, z: 0, edges: [] },
    ];
    expect(nearestNode(nodes, 1, 0)).toBe(0);
  });

  it('returns null for an empty node list', () => {
    expect(nearestNode([], 0, 0)).toBeNull();
  });
});

describe('findPath', () => {
  it('returns a direct path in a->b order with cost = length / speed', () => {
    const tiles = straightRun(0, 0, 1, 0, 6); // 6 tiles, (0,0)..(5,0)
    const nodes: GraphNode[] = [
      { id: 0, x: 0, z: 0, edges: [0] },
      { id: 1, x: 5, z: 0, edges: [0] },
    ];
    const edges: GraphEdge[] = [
      { id: 0, a: 0, b: 1, tier: RoadTier.TwoLane, tiles, length: tiles.length, volume: 0 },
    ];

    const result = findPath(nodes, edges, { x: 0, z: 0 }, { x: 5, z: 0 });

    expect(result).not.toBeNull();
    expect(result!.nodes).toEqual([0, 1]);
    expect(result!.edges).toEqual([0]);
    expect(result!.points).toEqual(tiles);
    expect(result!.cost).toBeCloseTo(6 / 14, 10);
  });

  it('reverses the edge tile order when traversed b->a', () => {
    const tiles = straightRun(0, 0, 1, 0, 6);
    const nodes: GraphNode[] = [
      { id: 0, x: 0, z: 0, edges: [0] },
      { id: 1, x: 5, z: 0, edges: [0] },
    ];
    const edges: GraphEdge[] = [
      { id: 0, a: 0, b: 1, tier: RoadTier.TwoLane, tiles, length: tiles.length, volume: 0 },
    ];

    const result = findPath(nodes, edges, { x: 5, z: 0 }, { x: 0, z: 0 });

    expect(result!.nodes).toEqual([1, 0]);
    expect(result!.points).toEqual([...tiles].reverse());
  });

  it('returns a trivial single-node result when from/to resolve to the same node', () => {
    const nodes: GraphNode[] = [{ id: 0, x: 5, z: 5, edges: [] }];
    const result = findPath(nodes, [], { x: 5, z: 5 }, { x: 6, z: 5 });
    expect(result).toEqual({ nodes: [0], edges: [], points: [{ x: 5, z: 5 }], cost: 0 });
  });

  it('returns null when an endpoint has no node within 8 tiles', () => {
    const nodes: GraphNode[] = [{ id: 0, x: 0, z: 0, edges: [] }];
    expect(findPath(nodes, [], { x: 100, z: 100 }, { x: 0, z: 0 })).toBeNull();
  });

  it('returns null across disconnected components', () => {
    const nodes: GraphNode[] = [
      { id: 0, x: 0, z: 0, edges: [0] },
      { id: 1, x: 1, z: 0, edges: [0] },
      { id: 2, x: 50, z: 50, edges: [1] },
      { id: 3, x: 51, z: 50, edges: [1] },
    ];
    const edges: GraphEdge[] = [
      {
        id: 0,
        a: 0,
        b: 1,
        tier: RoadTier.TwoLane,
        tiles: straightRun(0, 0, 1, 0, 2),
        length: 2,
        volume: 0,
      },
      {
        id: 1,
        a: 2,
        b: 3,
        tier: RoadTier.TwoLane,
        tiles: straightRun(50, 50, 1, 0, 2),
        length: 2,
        volume: 0,
      },
    ];

    expect(findPath(nodes, edges, { x: 0, z: 0 }, { x: 51, z: 50 })).toBeNull();
  });

  it('prefers a longer higher-tier detour over a short low-tier direct edge when it is cheaper', () => {
    const nodes: GraphNode[] = [
      { id: 0, x: 0, z: 0, edges: [0, 1] },
      { id: 1, x: 20, z: 0, edges: [0, 2] },
      { id: 2, x: 10, z: 10, edges: [1, 2] },
    ];
    const direct = straightRun(0, 0, 1, 0, 20); // 20 tiles @ tier1 (speed 14) -> cost 20/14 ~= 1.4286
    const legA = straightRun(0, 0, 1, 1, 14); // 14 tiles @ tier3 (speed 28) -> cost 0.5
    const legB = straightRun(20, 0, -1, 1, 14); // 14 tiles @ tier3 (speed 28) -> cost 0.5
    const edges: GraphEdge[] = [
      {
        id: 0,
        a: 0,
        b: 1,
        tier: RoadTier.TwoLane,
        tiles: direct,
        length: direct.length,
        volume: 0,
      },
      { id: 1, a: 0, b: 2, tier: RoadTier.Highway, tiles: legA, length: legA.length, volume: 0 },
      { id: 2, a: 2, b: 1, tier: RoadTier.Highway, tiles: legB, length: legB.length, volume: 0 },
    ];

    const result = findPath(nodes, edges, { x: 0, z: 0 }, { x: 20, z: 0 });

    expect(result!.edges).toEqual([1, 2]);
    expect(result!.cost).toBeCloseTo(14 / 28 + 14 / 28, 10);
  });

  it('diverts through a longer free route when the direct edge is congested near capacity', () => {
    const nodes: GraphNode[] = [
      { id: 0, x: 0, z: 0, edges: [0, 1] },
      { id: 1, x: 10, z: 0, edges: [0, 2] },
      { id: 2, x: 0, z: 10, edges: [1, 2] },
    ];
    const congested = straightRun(0, 0, 1, 0, 10);
    const altA = straightRun(0, 0, 0, 1, 10);
    const altB = straightRun(0, 10, 1, -1, 10);
    const edges: GraphEdge[] = [
      // tier1: speed 14, capacity 600. volume 580 -> congestion ~0.9667 -> cost ~2.095
      { id: 0, a: 0, b: 1, tier: RoadTier.TwoLane, tiles: congested, length: 10, volume: 580 },
      // detour: two free tier1 edges, total cost 10/14 + 10/14 ~= 1.4286 (cheaper than the congested direct edge)
      { id: 1, a: 0, b: 2, tier: RoadTier.TwoLane, tiles: altA, length: 10, volume: 0 },
      { id: 2, a: 2, b: 1, tier: RoadTier.TwoLane, tiles: altB, length: 10, volume: 0 },
    ];

    const result = findPath(nodes, edges, { x: 0, z: 0 }, { x: 10, z: 0 });

    expect(result!.edges).toEqual([1, 2]);
  });

  it('routes forward across a one-way edge whose tiles run low-to-high coordinate (a->b)', () => {
    // One-way rule: flow follows the tile run's own straight axis from the
    // lower coord to the higher (W->E / N->S). Here
    // node a sits at the lower x, node b at the higher x, so a->b is the
    // permitted (forward) direction.
    const tiles = straightRun(0, 0, 1, 0, 6); // (0,0)..(5,0), increasing x
    const nodes: GraphNode[] = [
      { id: 0, x: 0, z: 0, edges: [0] },
      { id: 1, x: 5, z: 0, edges: [0] },
    ];
    const edges: GraphEdge[] = [
      { id: 0, a: 0, b: 1, tier: RoadTier.OneWay, tiles, length: tiles.length, volume: 0 },
    ];

    const result = findPath(nodes, edges, { x: 0, z: 0 }, { x: 5, z: 0 });

    expect(result).not.toBeNull();
    expect(result!.edges).toEqual([0]);
    expect(result!.points).toEqual(tiles);
  });

  it('refuses to route backward against a one-way edge with no alternate route', () => {
    const tiles = straightRun(0, 0, 1, 0, 6); // increasing x = forward a->b only
    const nodes: GraphNode[] = [
      { id: 0, x: 0, z: 0, edges: [0] },
      { id: 1, x: 5, z: 0, edges: [0] },
    ];
    const edges: GraphEdge[] = [
      { id: 0, a: 0, b: 1, tier: RoadTier.OneWay, tiles, length: tiles.length, volume: 0 },
    ];

    // Traveling b->a (high x to low x) is against the one-way flow, and
    // there's no other route, so no path exists.
    expect(findPath(nodes, edges, { x: 5, z: 0 }, { x: 0, z: 0 })).toBeNull();
  });

  it('detours around a one-way edge via a parallel two-way loop when traveling against its flow', () => {
    // A rectangular loop: 0 --(one-way, forward 0->1 only)--> 1 --(two-way)--
    // > 2 --(two-way)--> 3 --(two-way)--> 0. Routing 1 -> 0 must avoid the
    // one-way edge (wrong direction from node 1) and go the long way round.
    const nodes: GraphNode[] = [
      { id: 0, x: 0, z: 0, edges: [0, 3] },
      { id: 1, x: 5, z: 0, edges: [0, 1] },
      { id: 2, x: 5, z: 5, edges: [1, 2] },
      { id: 3, x: 0, z: 5, edges: [2, 3] },
    ];
    const top = straightRun(0, 0, 1, 0, 6); // (0,0)..(5,0), forward 0->1
    const right = straightRun(5, 0, 0, 1, 6); // (5,0)..(5,5)
    const bottom = straightRun(5, 5, -1, 0, 6); // (5,5)..(0,5)
    const left = straightRun(0, 5, 0, -1, 6); // (0,5)..(0,0)
    const edges: GraphEdge[] = [
      { id: 0, a: 0, b: 1, tier: RoadTier.OneWay, tiles: top, length: top.length, volume: 0 },
      { id: 1, a: 1, b: 2, tier: RoadTier.TwoLane, tiles: right, length: right.length, volume: 0 },
      {
        id: 2,
        a: 2,
        b: 3,
        tier: RoadTier.TwoLane,
        tiles: bottom,
        length: bottom.length,
        volume: 0,
      },
      { id: 3, a: 3, b: 0, tier: RoadTier.TwoLane, tiles: left, length: left.length, volume: 0 },
    ];

    const result = findPath(nodes, edges, { x: 5, z: 0 }, { x: 0, z: 0 });

    expect(result).not.toBeNull();
    expect(result!.edges).toEqual([1, 2, 3]); // detour the long way round, not edge 0 backward
  });

  it('routes correctly through a mixed network (one-way + two-way edges) in both valid directions', () => {
    const nodes: GraphNode[] = [
      { id: 0, x: 0, z: 0, edges: [0] },
      { id: 1, x: 5, z: 0, edges: [0, 1] },
      { id: 2, x: 5, z: 5, edges: [1] },
    ];
    const oneWayTiles = straightRun(0, 0, 1, 0, 6); // forward 0->1 (increasing x)
    const twoWayTiles = straightRun(5, 0, 0, 1, 6); // (5,0)..(5,5)
    const edges: GraphEdge[] = [
      {
        id: 0,
        a: 0,
        b: 1,
        tier: RoadTier.OneWay,
        tiles: oneWayTiles,
        length: oneWayTiles.length,
        volume: 0,
      },
      {
        id: 1,
        a: 1,
        b: 2,
        tier: RoadTier.TwoLane,
        tiles: twoWayTiles,
        length: twoWayTiles.length,
        volume: 0,
      },
    ];

    // Forward through both: allowed.
    const forward = findPath(nodes, edges, { x: 0, z: 0 }, { x: 5, z: 5 });
    expect(forward!.edges).toEqual([0, 1]);

    // Reverse through the two-way leg only: still allowed (regression).
    const reverseTwoWay = findPath(nodes, edges, { x: 5, z: 5 }, { x: 5, z: 0 });
    expect(reverseTwoWay!.edges).toEqual([1]);

    // Reverse through the one-way leg: no route (only edge 0, backward).
    expect(findPath(nodes, edges, { x: 5, z: 0 }, { x: 0, z: 0 })).toBeNull();
  });

  it('two-way tiers remain fully bidirectional (zero behavior change regression)', () => {
    const tiles = straightRun(0, 0, 1, 0, 6);
    const nodes: GraphNode[] = [
      { id: 0, x: 0, z: 0, edges: [0] },
      { id: 1, x: 5, z: 0, edges: [0] },
    ];
    for (const tier of [
      RoadTier.TwoLane,
      RoadTier.Avenue,
      RoadTier.Highway,
      RoadTier.Gravel,
      RoadTier.Alley,
      RoadTier.FourLane,
    ]) {
      const edges: GraphEdge[] = [
        { id: 0, a: 0, b: 1, tier, tiles, length: tiles.length, volume: 0 },
      ];
      expect(findPath(nodes, edges, { x: 0, z: 0 }, { x: 5, z: 0 })!.edges).toEqual([0]);
      expect(findPath(nodes, edges, { x: 5, z: 0 }, { x: 0, z: 0 })!.edges).toEqual([0]);
    }
  });

  it('produces a contiguous, orthogonally-stepped point sequence across multiple edges', () => {
    const nodes: GraphNode[] = [
      { id: 0, x: 0, z: 0, edges: [0] },
      { id: 1, x: 3, z: 0, edges: [0, 1] },
      { id: 2, x: 3, z: 3, edges: [1] },
    ];
    const edge0Tiles = straightRun(0, 0, 1, 0, 4); // (0,0)..(3,0)
    const edge1Tiles = straightRun(3, 0, 0, 1, 4); // (3,0)..(3,3)
    const edges: GraphEdge[] = [
      { id: 0, a: 0, b: 1, tier: RoadTier.TwoLane, tiles: edge0Tiles, length: 4, volume: 0 },
      { id: 1, a: 1, b: 2, tier: RoadTier.TwoLane, tiles: edge1Tiles, length: 4, volume: 0 },
    ];

    const result = findPath(nodes, edges, { x: 0, z: 0 }, { x: 3, z: 3 });

    expect(result).not.toBeNull();
    const pts = result!.points;
    expect(pts.length).toBe(7); // 4 + 4 tiles, minus 1 shared junction tile
    for (let i = 1; i < pts.length; i++) {
      const dx = Math.abs(pts[i]!.x - pts[i - 1]!.x);
      const dz = Math.abs(pts[i]!.z - pts[i - 1]!.z);
      expect(dx + dz).toBe(1);
    }
  });
});
