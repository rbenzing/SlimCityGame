import { describe, it, expect } from 'vitest';
import {
  TransitSystem,
  routeLine,
  estimateRidership,
  applyRidershipRelief,
  RIDERSHIP_STOP_RADIUS_TILES,
  CONGESTION_RELIEF_PER_RIDER,
  type PopulationJobsAccessor,
  type TransitRoute,
} from './transit';
import {
  FIELD_COUNT,
  RoadTier,
  type GraphEdge,
  type GridState,
  type PathResult,
  type RoadNetworkApi,
  type TilePoint,
  type TransitLine,
} from '../shared/types';
import { RoadNetwork } from '../world/roads';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

interface FakeNetwork extends RoadNetworkApi {
  readonly addVolumeCalls: { edgeIds: number[]; amount: number }[];
}

function createFakeNetwork(
  findPathImpl: (from: TilePoint, to: TilePoint) => PathResult | null,
  edges: GraphEdge[] = [],
): FakeNetwork {
  const addVolumeCalls: { edgeIds: number[]; amount: number }[] = [];
  return {
    rebuild: () => {},
    invalidateRegion: () => {},
    nearestNode: () => null,
    findPath: findPathImpl,
    addVolume: (edgeIds, amount) => {
      addVolumeCalls.push({ edgeIds: [...edgeIds], amount });
      for (const id of edgeIds) {
        const edge = edges.find((e) => e.id === id);
        if (edge) edge.volume += amount;
      }
    },
    decayVolumes: () => {},
    getEdges: () => edges,
    getNodes: () => [],
    addVolumeCalls,
  };
}

function makeEdge(id: number, volume: number): GraphEdge {
  return { id, a: 0, b: 1, tier: RoadTier.TwoLane, tiles: [], length: 1, volume };
}

function makePath(points: TilePoint[], edges: number[]): PathResult {
  return { nodes: [], edges, points, cost: 0 };
}

function makeGrid(n: number): GridState {
  return {
    size: n,
    height: new Float32Array(n * n),
    water: new Uint8Array(n * n),
    trees: new Uint8Array(n * n),
    zone: new Uint8Array(n * n),
    roadTier: new Uint8Array(n * n),
    roadMask: new Uint8Array(n * n),
    buildingId: new Uint32Array(n * n),
    power: new Uint8Array(n * n),
    watered: new Uint8Array(n * n),
    fields: Array.from({ length: FIELD_COUNT }, () => new Uint8Array(n * n)),
    district: new Uint8Array(n * n),
    landfill: new Uint8Array(n * n),
  };
}

/** True when `a` and `b` are exactly one cardinal (N/E/S/W) tile step apart. */
function isCardinallyAdjacent(a: TilePoint, b: TilePoint): boolean {
  const dx = Math.abs(a.x - b.x);
  const dz = Math.abs(a.z - b.z);
  return (dx === 1 && dz === 0) || (dx === 0 && dz === 1);
}

function fixedAccessor(value: number): PopulationJobsAccessor {
  return { nearbyPopulationJobs: () => value };
}

// ---------------------------------------------------------------------------
// TransitSystem line list
// ---------------------------------------------------------------------------

describe('TransitSystem line list', () => {
  it('assigns incrementing ids from createLine, ignoring any caller-side id concept', () => {
    const sys = new TransitSystem(createFakeNetwork(() => null));
    const a = sys.createLine([{ x: 0, z: 0 }], 0xff0000);
    const b = sys.createLine([{ x: 1, z: 1 }], 0x00ff00);
    expect(a.id).toBe(1);
    expect(b.id).toBe(2);
    expect(sys.getLines().map((l) => l.id)).toEqual([1, 2]);
  });

  it('stores a defensive copy of stops (mutating the input array does not affect the stored line)', () => {
    const sys = new TransitSystem(createFakeNetwork(() => null));
    const stops: TilePoint[] = [
      { x: 0, z: 0 },
      { x: 1, z: 1 },
    ];
    const line = sys.createLine(stops, 0x123456);
    stops.push({ x: 9, z: 9 });
    expect(sys.getLine(line.id)!.stops).toHaveLength(2);
  });

  it('updateLine replaces stops/color for an existing id', () => {
    const sys = new TransitSystem(createFakeNetwork(() => null));
    const line = sys.createLine([{ x: 0, z: 0 }], 0xff0000);
    const updated = sys.updateLine(
      line.id,
      [
        { x: 2, z: 2 },
        { x: 3, z: 3 },
      ],
      0x0000ff,
    );
    expect(updated).not.toBeNull();
    expect(updated!.id).toBe(line.id);
    expect(updated!.stops).toEqual([
      { x: 2, z: 2 },
      { x: 3, z: 3 },
    ]);
    expect(updated!.color).toBe(0x0000ff);
    expect(sys.getLine(line.id)).toEqual(updated);
  });

  it('updateLine returns null for an unknown id and leaves the line list unchanged', () => {
    const sys = new TransitSystem(createFakeNetwork(() => null));
    sys.createLine([{ x: 0, z: 0 }], 1);
    const result = sys.updateLine(999, [{ x: 1, z: 1 }], 2);
    expect(result).toBeNull();
    expect(sys.getLines()).toHaveLength(1);
  });

  it('deleteLine removes the line and reports whether it existed', () => {
    const sys = new TransitSystem(createFakeNetwork(() => null));
    const line = sys.createLine([{ x: 0, z: 0 }], 1);
    expect(sys.deleteLine(line.id)).toBe(true);
    expect(sys.getLine(line.id)).toBeUndefined();
    expect(sys.deleteLine(line.id)).toBe(false);
  });

  it('never reuses an id after delete, matching BuildingInstance.id convention', () => {
    const sys = new TransitSystem(createFakeNetwork(() => null));
    const a = sys.createLine([{ x: 0, z: 0 }], 1);
    sys.deleteLine(a.id);
    const b = sys.createLine([{ x: 1, z: 1 }], 2);
    expect(b.id).not.toBe(a.id);
    expect(b.id).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// routeLine: concatenation over a hand-built graph
// ---------------------------------------------------------------------------

describe('routeLine', () => {
  it('returns null for a line with fewer than 2 stops', () => {
    const network = createFakeNetwork(() => null);
    const line: TransitLine = { id: 1, stops: [{ x: 0, z: 0 }], color: 0 };
    expect(routeLine(network, line)).toBeNull();
  });

  it('returns null when any leg is unreachable', () => {
    let calls = 0;
    const network = createFakeNetwork(() => {
      calls += 1;
      return calls === 1
        ? makePath(
            [
              { x: 0, z: 0 },
              { x: 1, z: 0 },
            ],
            [10],
          )
        : null;
    });
    const line: TransitLine = {
      id: 1,
      stops: [
        { x: 0, z: 0 },
        { x: 1, z: 0 },
        { x: 9, z: 9 },
      ],
      color: 0,
    };
    expect(routeLine(network, line)).toBeNull();
  });

  it('concatenates each leg, de-duplicating the shared junction point at each seam', () => {
    const legA = makePath(
      [
        { x: 0, z: 0 },
        { x: 1, z: 0 },
        { x: 2, z: 0 },
      ],
      [1, 2],
    );
    const legB = makePath(
      [
        { x: 2, z: 0 },
        { x: 2, z: 1 },
        { x: 2, z: 2 },
      ],
      [3, 4],
    );
    let calls = 0;
    const network = createFakeNetwork(() => {
      calls += 1;
      return calls === 1 ? legA : legB;
    });
    const line: TransitLine = {
      id: 1,
      stops: [
        { x: 0, z: 0 },
        { x: 2, z: 0 },
        { x: 2, z: 2 },
      ],
      color: 0,
    };

    const route = routeLine(network, line);
    expect(route).not.toBeNull();
    expect(route!.points).toEqual([
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 2, z: 0 },
      { x: 2, z: 1 },
      { x: 2, z: 2 },
    ]);
    expect(route!.edges).toEqual([1, 2, 3, 4]);
    expect(route!.lengthTiles).toBe(route!.points.length);
  });

  it('over a real hand-built RoadNetwork, produces a cardinally-adjacent chain across a 3-stop line', () => {
    const size = 12;
    const g = makeGrid(size);
    const z = (x: number, zc: number): number => zc * size + x;
    for (const x of [2, 3, 4, 5, 6, 7, 8]) g.roadTier[z(x, 5)] = RoadTier.TwoLane;

    const network = new RoadNetwork();
    network.rebuild(g);

    const line: TransitLine = {
      id: 1,
      stops: [
        { x: 2, z: 5 },
        { x: 5, z: 5 },
        { x: 8, z: 5 },
      ],
      color: 0,
    };
    const route = routeLine(network, line);
    expect(route).not.toBeNull();
    expect(route!.points[0]).toEqual({ x: 2, z: 5 });
    expect(route!.points[route!.points.length - 1]).toEqual({ x: 8, z: 5 });
    for (let i = 1; i < route!.points.length; i += 1) {
      expect(isCardinallyAdjacent(route!.points[i - 1]!, route!.points[i]!)).toBe(true);
    }
  });

  it('is deterministic: two identical calls over the same real network produce identical routes', () => {
    const size = 12;
    const g = makeGrid(size);
    const z = (x: number, zc: number): number => zc * size + x;
    for (const x of [2, 3, 4, 5, 6]) g.roadTier[z(x, 5)] = RoadTier.TwoLane;
    const network = new RoadNetwork();
    network.rebuild(g);

    const line: TransitLine = {
      id: 1,
      stops: [
        { x: 2, z: 5 },
        { x: 6, z: 5 },
      ],
      color: 0,
    };
    const first = routeLine(network, line);
    const second = routeLine(network, line);
    expect(second).toEqual(first);
  });
});

// ---------------------------------------------------------------------------
// estimateRidership
// ---------------------------------------------------------------------------

describe('estimateRidership', () => {
  const route: TransitRoute = {
    points: [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
    ],
    edges: [1],
    lengthTiles: 2,
  };
  const line: TransitLine = {
    id: 1,
    stops: [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
    ],
    color: 0,
  };

  it('returns 0 for a null route', () => {
    expect(estimateRidership(line, null, fixedAccessor(500))).toBe(0);
  });

  it('returns 0 for a line with no stops', () => {
    const emptyLine: TransitLine = { id: 1, stops: [], color: 0 };
    expect(estimateRidership(emptyLine, route, fixedAccessor(500))).toBe(0);
  });

  it('returns 0 when there is no nearby population/jobs at all', () => {
    expect(estimateRidership(line, route, fixedAccessor(0))).toBe(0);
  });

  it('is strictly monotonic increasing in nearby population/jobs, holding the route fixed', () => {
    const low = estimateRidership(line, route, fixedAccessor(50));
    const mid = estimateRidership(line, route, fixedAccessor(200));
    const high = estimateRidership(line, route, fixedAccessor(1000));
    expect(low).toBeGreaterThan(0);
    expect(mid).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(mid);
  });

  it('sums nearby demand across every stop (a 3-stop line beats a 2-stop line with the same per-stop demand)', () => {
    const twoStop: TransitLine = {
      id: 1,
      stops: [
        { x: 0, z: 0 },
        { x: 1, z: 0 },
      ],
      color: 0,
    };
    const threeStop: TransitLine = {
      id: 2,
      stops: [
        { x: 0, z: 0 },
        { x: 1, z: 0 },
        { x: 2, z: 0 },
      ],
      color: 0,
    };
    const sameRoute: TransitRoute = { points: route.points, edges: route.edges, lengthTiles: 2 };
    const accessor = fixedAccessor(100);
    expect(estimateRidership(threeStop, sameRoute, accessor)).toBeGreaterThan(
      estimateRidership(twoStop, sameRoute, accessor),
    );
  });

  it('is deterministic for identical inputs', () => {
    const a = estimateRidership(line, route, fixedAccessor(123));
    const b = estimateRidership(line, route, fixedAccessor(123));
    expect(a).toBe(b);
  });

  it('queries the accessor with RIDERSHIP_STOP_RADIUS_TILES for every stop', () => {
    const radii: number[] = [];
    const accessor: PopulationJobsAccessor = {
      nearbyPopulationJobs: (_x, _z, radiusTiles) => {
        radii.push(radiusTiles);
        return 10;
      },
    };
    estimateRidership(line, route, accessor);
    expect(radii).toEqual([RIDERSHIP_STOP_RADIUS_TILES, RIDERSHIP_STOP_RADIUS_TILES]);
  });
});

// ---------------------------------------------------------------------------
// applyRidershipRelief
// ---------------------------------------------------------------------------

describe('applyRidershipRelief', () => {
  it('reduces volume on every distinct traversed edge, proportional to ridership', () => {
    const edges = [makeEdge(1, 100), makeEdge(2, 100)];
    const network = createFakeNetwork(() => null, edges);
    const route: TransitRoute = {
      points: [],
      edges: [1, 2],
      lengthTiles: 0,
    };
    const ridership = 50;
    applyRidershipRelief(network, route, ridership);

    const relief = ridership * CONGESTION_RELIEF_PER_RIDER;
    expect(edges[0]!.volume).toBeCloseTo(100 - relief, 6);
    expect(edges[1]!.volume).toBeCloseTo(100 - relief, 6);
  });

  it('clamps relief so an edge volume never goes negative', () => {
    const edges = [makeEdge(1, 0.01)];
    const network = createFakeNetwork(() => null, edges);
    const route: TransitRoute = { points: [], edges: [1], lengthTiles: 0 };
    applyRidershipRelief(network, route, 1000);
    expect(edges[0]!.volume).toBeCloseTo(0, 9);
    expect(edges[0]!.volume).toBeGreaterThanOrEqual(0);
  });

  it('de-duplicates a repeated edge id in the route (relieves it once, not twice)', () => {
    const edges = [makeEdge(1, 100)];
    const network = createFakeNetwork(() => null, edges);
    const route: TransitRoute = { points: [], edges: [1, 1], lengthTiles: 0 };
    applyRidershipRelief(network, route, 50);
    const relief = 50 * CONGESTION_RELIEF_PER_RIDER;
    expect(edges[0]!.volume).toBeCloseTo(100 - relief, 6);
  });

  it('is a no-op for a null route, zero/negative ridership, or an edge-less route', () => {
    const edges = [makeEdge(1, 100)];
    const network = createFakeNetwork(() => null, edges);
    applyRidershipRelief(network, null, 50);
    applyRidershipRelief(network, { points: [], edges: [1], lengthTiles: 0 }, 0);
    applyRidershipRelief(network, { points: [], edges: [], lengthTiles: 0 }, 50);
    expect(edges[0]!.volume).toBe(100);
    expect(network.addVolumeCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TransitSystem.tick -- snapshot shape + integration of route/ridership/relief
// ---------------------------------------------------------------------------

describe('TransitSystem.tick', () => {
  it('returns lines[i] <-> ridership[i] in the same order for every current line', () => {
    const path = makePath(
      [
        { x: 0, z: 0 },
        { x: 1, z: 0 },
      ],
      [1],
    );
    const network = createFakeNetwork(() => path, [makeEdge(1, 100)]);
    const sys = new TransitSystem(network);
    const a = sys.createLine(
      [
        { x: 0, z: 0 },
        { x: 1, z: 0 },
      ],
      1,
    );
    const b = sys.createLine(
      [
        { x: 0, z: 0 },
        { x: 1, z: 0 },
      ],
      2,
    );

    const result = sys.tick(fixedAccessor(100));
    expect(result.lines.map((l) => l.id)).toEqual([a.id, b.id]);
    expect(result.ridership).toHaveLength(2);
    expect(result.ridership[0]).toBeGreaterThan(0);
    expect(result.ridership[1]).toBeGreaterThan(0);
  });

  it('applies congestion relief to the network as a side effect of ticking', () => {
    const path = makePath(
      [
        { x: 0, z: 0 },
        { x: 1, z: 0 },
      ],
      [1],
    );
    const edges = [makeEdge(1, 1000)];
    const network = createFakeNetwork(() => path, edges);
    const sys = new TransitSystem(network);
    sys.createLine(
      [
        { x: 0, z: 0 },
        { x: 1, z: 0 },
      ],
      1,
    );

    sys.tick(fixedAccessor(1000));
    expect(edges[0]!.volume).toBeLessThan(1000);
  });

  it('produces an empty snapshot when there are no lines', () => {
    const sys = new TransitSystem(createFakeNetwork(() => null));
    expect(sys.tick(fixedAccessor(100))).toEqual({ lines: [], ridership: [] });
  });

  it('route()/ridership() convenience accessors match tick() for a single line', () => {
    const path = makePath(
      [
        { x: 0, z: 0 },
        { x: 1, z: 0 },
      ],
      [1],
    );
    const network = createFakeNetwork(() => path, [makeEdge(1, 100)]);
    const sys = new TransitSystem(network);
    const line = sys.createLine(
      [
        { x: 0, z: 0 },
        { x: 1, z: 0 },
      ],
      1,
    );

    expect(sys.route(line.id)).toEqual(
      path.points.length
        ? {
            points: path.points,
            edges: path.edges,
            lengthTiles: path.points.length,
          }
        : null,
    );
    expect(sys.ridership(line.id, fixedAccessor(100))).toBeGreaterThan(0);
    expect(sys.route(999)).toBeNull();
    expect(sys.ridership(999, fixedAccessor(100))).toBe(0);
  });
});
