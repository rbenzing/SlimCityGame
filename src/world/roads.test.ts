import { describe, expect, it } from 'vitest';
import { FIELD_COUNT, RoadTier, ZoneType } from '../shared/types';
import type { GridState } from '../shared/types';
import { applyRoad, computeMask, removeRoad, RoadNetwork } from './roads';

function makeGrid(size: number): GridState {
  const n = size * size;
  return {
    size,
    height: new Float32Array(n),
    water: new Uint8Array(n),
    trees: new Uint8Array(n),
    zone: new Uint8Array(n),
    roadTier: new Uint8Array(n),
    roadMask: new Uint8Array(n),
    buildingId: new Uint32Array(n),
    power: new Uint8Array(n),
    watered: new Uint8Array(n),
    fields: Array.from({ length: FIELD_COUNT }, () => new Uint8Array(n)),
    district: new Uint8Array(n),
    landfill: new Uint8Array(n),
  };
}

function idx(size: number, x: number, z: number): number {
  return z * size + x;
}

describe('computeMask', () => {
  it('is 0 for an isolated tile with no road neighbors', () => {
    const g = makeGrid(10);
    g.roadTier[idx(10, 5, 5)] = RoadTier.TwoLane;
    expect(computeMask(g, 5, 5)).toBe(0);
  });

  it('reads an L shape correctly', () => {
    const size = 10;
    const g = makeGrid(size);
    for (const [x, z] of [
      [4, 4],
      [4, 5],
      [4, 6],
      [5, 6],
      [6, 6],
    ] as const) {
      g.roadTier[idx(size, x, z)] = RoadTier.TwoLane;
    }
    expect(computeMask(g, 4, 4)).toBe(4); // S only
    expect(computeMask(g, 4, 5)).toBe(1 | 4); // N|S (straight run)
    expect(computeMask(g, 4, 6)).toBe(1 | 2); // N|E (the corner)
    expect(computeMask(g, 5, 6)).toBe(8 | 2); // W|E
    expect(computeMask(g, 6, 6)).toBe(8); // W only
  });

  it('reads a T shape correctly', () => {
    const size = 10;
    const g = makeGrid(size);
    for (const [x, z] of [
      [5, 4],
      [5, 5],
      [5, 6],
      [6, 5],
    ] as const) {
      g.roadTier[idx(size, x, z)] = RoadTier.TwoLane;
    }
    expect(computeMask(g, 5, 5)).toBe(1 | 4 | 2); // center: N|S|E
    expect(computeMask(g, 5, 4)).toBe(4); // top arm points S back to center
    expect(computeMask(g, 5, 6)).toBe(1); // bottom arm points N back to center
    expect(computeMask(g, 6, 5)).toBe(8); // right arm points W back to center
  });

  it('reads a 4-way cross correctly', () => {
    const size = 10;
    const g = makeGrid(size);
    for (const [x, z] of [
      [5, 5],
      [5, 4],
      [5, 6],
      [6, 5],
      [4, 5],
    ] as const) {
      g.roadTier[idx(size, x, z)] = RoadTier.TwoLane;
    }
    expect(computeMask(g, 5, 5)).toBe(1 | 2 | 4 | 8);
    expect(computeMask(g, 5, 4)).toBe(4);
    expect(computeMask(g, 5, 6)).toBe(1);
    expect(computeMask(g, 6, 5)).toBe(8);
    expect(computeMask(g, 4, 5)).toBe(2);
  });

  it('ignores out-of-bounds neighbors', () => {
    const g = makeGrid(5);
    g.roadTier[idx(5, 0, 0)] = RoadTier.TwoLane;
    expect(computeMask(g, 0, 0)).toBe(0);
  });
});

describe('applyRoad', () => {
  it('sets tier on new tiles and returns deltas with correct masks for a straight run', () => {
    const size = 10;
    const g = makeGrid(size);
    const deltas = applyRoad(
      g,
      [
        { x: 2, z: 5 },
        { x: 3, z: 5 },
        { x: 4, z: 5 },
      ],
      RoadTier.TwoLane,
    );

    expect(deltas.length).toBe(3);
    const byX = new Map(deltas.map((d) => [d.x, d]));
    expect(byX.get(2)).toEqual({ x: 2, z: 5, tier: RoadTier.TwoLane, mask: 2 }); // E only
    expect(byX.get(3)).toEqual({ x: 3, z: 5, tier: RoadTier.TwoLane, mask: 8 | 2 }); // W|E
    expect(byX.get(4)).toEqual({ x: 4, z: 5, tier: RoadTier.TwoLane, mask: 8 }); // W only

    expect(g.roadTier[idx(size, 3, 5)]).toBe(RoadTier.TwoLane);
    expect(g.roadMask[idx(size, 3, 5)]).toBe(8 | 2);
  });

  it('rejects a downgrade on a per-tile basis, leaving the higher tier intact', () => {
    const size = 10;
    const g = makeGrid(size);
    applyRoad(g, [{ x: 5, z: 5 }], RoadTier.Highway);
    expect(g.roadTier[idx(size, 5, 5)]).toBe(RoadTier.Highway);

    const deltas = applyRoad(g, [{ x: 5, z: 5 }], RoadTier.TwoLane);

    expect(deltas).toEqual([]);
    expect(g.roadTier[idx(size, 5, 5)]).toBe(RoadTier.Highway);
  });

  it('allows an upgrade and reflects the new tier in the returned delta', () => {
    const size = 10;
    const g = makeGrid(size);
    applyRoad(g, [{ x: 5, z: 5 }], RoadTier.TwoLane);

    const deltas = applyRoad(g, [{ x: 5, z: 5 }], RoadTier.Avenue);

    expect(deltas.length).toBe(1);
    expect(deltas[0]!.tier).toBe(RoadTier.Avenue);
    expect(g.roadTier[idx(size, 5, 5)]).toBe(RoadTier.Avenue);
  });

  it('clears zone on tiles it builds road over', () => {
    const size = 10;
    const g = makeGrid(size);
    g.zone[idx(size, 5, 5)] = ZoneType.ResLow;

    applyRoad(g, [{ x: 5, z: 5 }], RoadTier.TwoLane);

    expect(g.zone[idx(size, 5, 5)]).toBe(ZoneType.None);
  });

  it('clears zone even on a rejected (already-higher-tier) tile', () => {
    const size = 10;
    const g = makeGrid(size);
    applyRoad(g, [{ x: 5, z: 5 }], RoadTier.Highway);
    g.zone[idx(size, 5, 5)] = ZoneType.ComLow; // hand-inject a stray zone value

    applyRoad(g, [{ x: 5, z: 5 }], RoadTier.TwoLane); // rejected upgrade

    expect(g.zone[idx(size, 5, 5)]).toBe(ZoneType.None);
  });

  it('reports a mask change on an existing neighbor tile that was not part of this call', () => {
    const size = 10;
    const g = makeGrid(size);
    const first = applyRoad(g, [{ x: 5, z: 5 }], RoadTier.TwoLane);
    expect(first).toEqual([{ x: 5, z: 5, tier: RoadTier.TwoLane, mask: 0 }]);

    const second = applyRoad(g, [{ x: 6, z: 5 }], RoadTier.TwoLane);
    const byXZ = new Map(second.map((d) => [`${d.x},${d.z}`, d]));

    expect(second.length).toBe(2);
    expect(byXZ.get('6,5')).toEqual({ x: 6, z: 5, tier: RoadTier.TwoLane, mask: 8 }); // W
    expect(byXZ.get('5,5')).toEqual({ x: 5, z: 5, tier: RoadTier.TwoLane, mask: 2 }); // E, updated though untouched
  });

  it('ignores out-of-bounds tiles', () => {
    const g = makeGrid(5);
    const deltas = applyRoad(
      g,
      [
        { x: -1, z: 0 },
        { x: 100, z: 100 },
      ],
      RoadTier.TwoLane,
    );
    expect(deltas).toEqual([]);
  });
});

describe('removeRoad', () => {
  it('zeroes tier and mask on removed tiles and fixes neighbor masks', () => {
    const size = 10;
    const g = makeGrid(size);
    applyRoad(
      g,
      [
        { x: 2, z: 5 },
        { x: 3, z: 5 },
        { x: 4, z: 5 },
      ],
      RoadTier.TwoLane,
    );

    const deltas = removeRoad(g, [{ x: 3, z: 5 }]);
    const byXZ = new Map(deltas.map((d) => [`${d.x},${d.z}`, d]));

    expect(byXZ.get('3,5')).toEqual({ x: 3, z: 5, tier: RoadTier.None, mask: 0 });
    expect(byXZ.get('2,5')).toEqual({ x: 2, z: 5, tier: RoadTier.TwoLane, mask: 0 }); // lost its E neighbor
    expect(byXZ.get('4,5')).toEqual({ x: 4, z: 5, tier: RoadTier.TwoLane, mask: 0 }); // lost its W neighbor

    expect(g.roadTier[idx(size, 3, 5)]).toBe(RoadTier.None);
    expect(g.roadMask[idx(size, 3, 5)]).toBe(0);
  });

  it('is a no-op for tiles that carry no road', () => {
    const g = makeGrid(10);
    expect(removeRoad(g, [{ x: 5, z: 5 }])).toEqual([]);
  });

  it('ignores out-of-bounds tiles', () => {
    const g = makeGrid(5);
    expect(removeRoad(g, [{ x: -1, z: 0 }])).toEqual([]);
  });
});

describe('RoadNetwork — rail exclusion (roads epic R4)', () => {
  it('keeps a dedicated rail line out of the drivable graph entirely', () => {
    const size = 12;
    const g = makeGrid(size);
    for (const x of [2, 3, 4, 5, 6]) g.roadTier[idx(size, x, 5)] = RoadTier.RailTrack;
    const net = new RoadNetwork();
    net.rebuild(g);
    expect(net.getNodes().length).toBe(0);
    expect(net.getEdges().length).toBe(0);
  });

  it('never folds a rail tile into a road edge — rail is not a drivable bridge', () => {
    // Two two-lane stubs separated by one rail tile: [2,3] R(4) [5,6] on row 5.
    const size = 14;
    const g = makeGrid(size);
    for (const x of [2, 3]) g.roadTier[idx(size, x, 5)] = RoadTier.TwoLane;
    g.roadTier[idx(size, 4, 5)] = RoadTier.RailTrack;
    for (const x of [5, 6]) g.roadTier[idx(size, x, 5)] = RoadTier.TwoLane;
    const net = new RoadNetwork();
    net.rebuild(g);
    // The rail tile does not bridge the two road stubs.
    expect(net.findPath({ x: 2, z: 5 }, { x: 6, z: 5 })).toBeNull();
    // No drivable edge ever covers the rail tile.
    for (const e of net.getEdges()) {
      for (const t of e.tiles) {
        expect(g.roadTier[idx(size, t.x, t.z)]).not.toBe(RoadTier.RailTrack);
      }
    }
  });
});

describe('RoadNetwork', () => {
  it('builds 2 nodes and 1 edge for a straight line', () => {
    const size = 12;
    const g = makeGrid(size);
    for (const x of [2, 3, 4, 5, 6]) g.roadTier[idx(size, x, 5)] = RoadTier.TwoLane;

    const net = new RoadNetwork();
    net.rebuild(g);

    expect(net.getNodes().length).toBe(2);
    expect(net.getEdges().length).toBe(1);
    expect(net.getEdges()[0]!.length).toBe(5);
    expect(net.getEdges()[0]!.tier).toBe(RoadTier.TwoLane);
    const nodeXs = net
      .getNodes()
      .map((n) => n.x)
      .sort((a, b) => a - b);
    expect(nodeXs).toEqual([2, 6]);
  });

  it('builds 2 nodes and 1 edge for an L shape', () => {
    const size = 12;
    const g = makeGrid(size);
    for (const [x, z] of [
      [2, 2],
      [2, 3],
      [2, 4],
      [3, 4],
      [4, 4],
    ] as const) {
      g.roadTier[idx(size, x, z)] = RoadTier.TwoLane;
    }

    const net = new RoadNetwork();
    net.rebuild(g);

    expect(net.getNodes().length).toBe(2);
    expect(net.getEdges().length).toBe(1);
    expect(net.getEdges()[0]!.length).toBe(5);
  });

  it('builds 4 nodes and 3 edges for a T junction', () => {
    const size = 12;
    const g = makeGrid(size);
    for (const [x, z] of [
      [5, 3],
      [5, 4],
      [5, 5],
      [5, 6],
      [6, 5],
      [7, 5],
    ] as const) {
      g.roadTier[idx(size, x, z)] = RoadTier.TwoLane;
    }

    const net = new RoadNetwork();
    net.rebuild(g);

    expect(net.getNodes().length).toBe(4);
    expect(net.getEdges().length).toBe(3);
  });

  it('builds 5 nodes and 4 edges for a 4-way cross', () => {
    const size = 12;
    const g = makeGrid(size);
    for (const [x, z] of [
      [5, 5],
      [5, 3],
      [5, 4],
      [5, 6],
      [5, 7],
      [3, 5],
      [4, 5],
      [6, 5],
      [7, 5],
    ] as const) {
      g.roadTier[idx(size, x, z)] = RoadTier.TwoLane;
    }

    const net = new RoadNetwork();
    net.rebuild(g);

    expect(net.getNodes().length).toBe(5);
    expect(net.getEdges().length).toBe(4);
  });

  it('builds a single node with no edges for an isolated tile', () => {
    const g = makeGrid(10);
    g.roadTier[idx(10, 5, 5)] = RoadTier.TwoLane;

    const net = new RoadNetwork();
    net.rebuild(g);

    expect(net.getNodes().length).toBe(1);
    expect(net.getEdges().length).toBe(0);
  });

  it('builds 4 nodes and 2 edges for two disconnected segments, and findPath returns null across them', () => {
    const size = 20;
    const g = makeGrid(size);
    for (const x of [2, 3, 4]) g.roadTier[idx(size, x, 2)] = RoadTier.TwoLane;
    for (const x of [10, 11, 12]) g.roadTier[idx(size, x, 15)] = RoadTier.TwoLane;

    const net = new RoadNetwork();
    net.rebuild(g);

    expect(net.getNodes().length).toBe(4);
    expect(net.getEdges().length).toBe(2);
    expect(net.findPath({ x: 2, z: 2 }, { x: 12, z: 15 })).toBeNull();
  });

  it('lazily rebuilds after invalidateRegion, matching a fresh rebuild', () => {
    const size = 16;
    const g = makeGrid(size);
    for (const x of [2, 3, 4]) g.roadTier[idx(size, x, 2)] = RoadTier.TwoLane;

    const net = new RoadNetwork();
    net.rebuild(g);
    expect(net.getNodes().length).toBe(2);
    expect(net.getEdges().length).toBe(1);

    // Mutate the grid directly (as another module would via applyRoad),
    // extending the line, then mark the cached network stale.
    applyRoad(
      g,
      [
        { x: 5, z: 2 },
        { x: 6, z: 2 },
      ],
      RoadTier.TwoLane,
    );
    net.invalidateRegion(0, 0, size, size);

    const lazyNodes = net.getNodes();
    const lazyEdges = net.getEdges();

    const fresh = new RoadNetwork();
    fresh.rebuild(g);

    expect(lazyNodes.length).toBe(fresh.getNodes().length);
    expect(lazyEdges.length).toBe(fresh.getEdges().length);
    expect(lazyEdges[0]!.length).toBe(fresh.getEdges()[0]!.length);
    expect(new Set(lazyNodes.map((n) => `${n.x},${n.z}`))).toEqual(
      new Set(fresh.getNodes().map((n) => `${n.x},${n.z}`)),
    );
  });

  it('findPath routes across the built graph; addVolume/decayVolumes mutate edge.volume', () => {
    const size = 12;
    const g = makeGrid(size);
    for (const x of [2, 3, 4, 5, 6]) g.roadTier[idx(size, x, 5)] = RoadTier.TwoLane;

    const net = new RoadNetwork();
    net.rebuild(g);

    const result = net.findPath({ x: 2, z: 5 }, { x: 6, z: 5 });
    expect(result).not.toBeNull();
    expect(result!.points[0]).toEqual({ x: 2, z: 5 });
    expect(result!.points[result!.points.length - 1]).toEqual({ x: 6, z: 5 });

    const edgeIds = net.getEdges().map((e) => e.id);
    net.addVolume(edgeIds, 100);
    expect(net.getEdges()[0]!.volume).toBe(100);

    net.decayVolumes(0.5);
    expect(net.getEdges()[0]!.volume).toBe(50);
  });

  it('one-way road: findPath succeeds forward (low->high coord) and fails backward with no detour', () => {
    const size = 12;
    const g = makeGrid(size);
    for (const x of [2, 3, 4, 5, 6]) g.roadTier[idx(size, x, 5)] = RoadTier.OneWay;

    const net = new RoadNetwork();
    net.rebuild(g);

    expect(net.getEdges().length).toBe(1);
    expect(net.getEdges()[0]!.tier).toBe(RoadTier.OneWay);

    // Forward: increasing x, matches the one-way rule (W->E on an E/W-ish run).
    const forward = net.findPath({ x: 2, z: 5 }, { x: 6, z: 5 });
    expect(forward).not.toBeNull();
    expect(forward!.points[0]).toEqual({ x: 2, z: 5 });
    expect(forward!.points[forward!.points.length - 1]).toEqual({ x: 6, z: 5 });

    // Backward: no alternate route exists, so no path.
    expect(net.findPath({ x: 6, z: 5 }, { x: 2, z: 5 })).toBeNull();
  });

  it('mixed network: a one-way shortcut plus a two-way loop routes correctly in both directions', () => {
    const size = 16;
    const g = makeGrid(size);
    // One-way top edge, row z=2, x 2..6 (forward: increasing x). Corner
    // tiles (2,2)/(6,2) stay OneWay — the two-way columns start at z=3 so
    // they don't overwrite the corner's own tier.
    for (const x of [2, 3, 4, 5, 6]) g.roadTier[idx(size, x, 2)] = RoadTier.OneWay;
    // Two-way loop back down and around: right side (x=6, z 3..6), bottom
    // (z=6, x 2..6), left side (x=2, z 3..6) all two-lane — a single long
    // detour edge connecting the same two nodes as the one-way shortcut.
    for (const z of [3, 4, 5, 6]) g.roadTier[idx(size, 6, z)] = RoadTier.TwoLane;
    for (const x of [2, 3, 4, 5, 6]) g.roadTier[idx(size, x, 6)] = RoadTier.TwoLane;
    for (const z of [3, 4, 5, 6]) g.roadTier[idx(size, 2, z)] = RoadTier.TwoLane;

    const net = new RoadNetwork();
    net.rebuild(g);

    // Forward along the one-way shortcut: (2,2) -> (6,2) direct.
    const forward = net.findPath({ x: 2, z: 2 }, { x: 6, z: 2 });
    expect(forward).not.toBeNull();
    expect(forward!.points[0]).toEqual({ x: 2, z: 2 });
    expect(forward!.points[forward!.points.length - 1]).toEqual({ x: 6, z: 2 });
    // The direct one-way run is 5 tiles; any detour would be far longer.
    expect(forward!.points.length).toBe(5);

    // Backward against the one-way shortcut: must detour the long way round
    // the loop (down the right side, across the bottom, up the left side)
    // rather than reversing the one-way edge.
    const backward = net.findPath({ x: 6, z: 2 }, { x: 2, z: 2 });
    expect(backward).not.toBeNull();
    expect(backward!.points[0]).toEqual({ x: 6, z: 2 });
    expect(backward!.points[backward!.points.length - 1]).toEqual({ x: 2, z: 2 });
    expect(backward!.points.length).toBeGreaterThan(5); // took the long way round
  });

  it('nearestNode returns null beyond 8 tiles and an id within range', () => {
    const size = 20;
    const g = makeGrid(size);
    for (const x of [2, 3, 4]) g.roadTier[idx(size, x, 2)] = RoadTier.TwoLane;

    const net = new RoadNetwork();
    net.rebuild(g);

    expect(net.nearestNode(2, 2)).not.toBeNull();
    expect(net.nearestNode(19, 19)).toBeNull();
  });
});
