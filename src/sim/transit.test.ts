import { describe, it, expect } from 'vitest';
import {
  TransitSystem,
  routeLine,
  estimateRidership,
  applyRidershipRelief,
  applyStationRelief,
  RIDERSHIP_STOP_RADIUS_TILES,
  CONGESTION_RELIEF_PER_RIDER,
  type PopulationJobsAccessor,
  type TransitRoute,
} from './transit';
import {
  FIELD_COUNT,
  isRailTier,
  isTramTier,
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
    roadElevation: new Float32Array(n * n),
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

// ---------------------------------------------------------------------------
// Rail: the same machinery over a second network (SPEC 26)
// ---------------------------------------------------------------------------

describe('rail lines', () => {
  const SIZE = 28;
  const STREET_Z = 3;
  const RAIL_Z = 20;

  /** Streets on one row, track on another, far enough apart not to snap together. */
  function mixedGrid(): GridState {
    const g = makeGrid(SIZE);
    for (let x = 2; x <= 12; x++) g.roadTier[STREET_Z * SIZE + x] = RoadTier.TwoLane;
    for (let x = 2; x <= 12; x++) g.roadTier[RAIL_Z * SIZE + x] = RoadTier.RailTrack;
    return g;
  }

  function networks(): { road: RoadNetwork; rail: RoadNetwork } {
    const g = mixedGrid();
    const road = new RoadNetwork();
    road.rebuild(g);
    const rail = new RoadNetwork(isRailTier);
    rail.rebuild(g);
    return { road, rail };
  }

  it('routes a rail line over the track and a bus line over the streets', () => {
    const { road, rail } = networks();
    const sys = new TransitSystem(road, rail);

    const train = sys.createLine(
      [
        { x: 2, z: RAIL_Z },
        { x: 12, z: RAIL_Z },
      ],
      0,
      'rail',
    );
    const bus = sys.createLine(
      [
        { x: 2, z: STREET_Z },
        { x: 12, z: STREET_Z },
      ],
      0,
    );

    for (const p of sys.route(train.id)!.points) expect(p.z).toBe(RAIL_Z);
    for (const p of sys.route(bus.id)!.points) expect(p.z).toBe(STREET_Z);
  });

  it('gives a rail line no route where the city has no track', () => {
    // No rail network injected at all — the pre-rail wiring, and the same
    // answer as a bus line whose stops nothing connects.
    const road = new RoadNetwork();
    road.rebuild(mixedGrid());
    const sys = new TransitSystem(road);
    const train = sys.createLine(
      [
        { x: 2, z: RAIL_Z },
        { x: 12, z: RAIL_Z },
      ],
      0,
      'rail',
    );
    expect(sys.route(train.id)).toBeNull();
    expect(sys.ridership(train.id, fixedAccessor(100))).toBe(0);
  });

  it('carries more riders than the same line as a bus, off the same demand', () => {
    const { road, rail } = networks();
    const sys = new TransitSystem(road, rail);
    const stops = [
      { x: 2, z: RAIL_Z },
      { x: 12, z: RAIL_Z },
    ];
    const train = sys.createLine(stops, 0, 'rail');

    const busSys = new TransitSystem(rail); // same geometry, bus rates
    const bus = busSys.createLine(stops, 0);

    const riders = sys.ridership(train.id, fixedAccessor(100));
    expect(riders).toBeGreaterThan(busSys.ridership(bus.id, fixedAccessor(100)));
  });

  it('keeps the mode across an edit that does not mention one', () => {
    const { road, rail } = networks();
    const sys = new TransitSystem(road, rail);
    const train = sys.createLine(
      [
        { x: 2, z: RAIL_Z },
        { x: 12, z: RAIL_Z },
      ],
      0,
      'rail',
    );
    sys.updateLine(
      train.id,
      [
        { x: 2, z: RAIL_Z },
        { x: 10, z: RAIL_Z },
      ],
      0,
    );
    expect(sys.getLine(train.id)!.mode).toBe('rail');
    expect(sys.route(train.id)).not.toBeNull(); // still routed over track
  });
});

describe('tram lines', () => {
  const SIZE = 28;
  const STREET_Z = 3;
  const TRAM_Z = 20;

  /** Track on one row, an unrelated street far enough away not to snap to it. */
  function tramGrid(): GridState {
    const g = makeGrid(SIZE);
    for (let x = 2; x <= 12; x++) g.roadTier[STREET_Z * SIZE + x] = RoadTier.TwoLane;
    for (let x = 2; x <= 12; x++) g.roadTier[TRAM_Z * SIZE + x] = RoadTier.Tram;
    return g;
  }

  function networks(g: GridState): { road: RoadNetwork; tram: RoadNetwork } {
    const road = new RoadNetwork();
    road.rebuild(g);
    const tram = new RoadNetwork(isTramTier);
    tram.rebuild(g);
    return { road, tram };
  }

  /** Road edges lying wholly on one row. */
  function edgesOnRow(road: RoadNetwork, z: number): GraphEdge[] {
    return road.getEdges().filter((e) => e.tiles.every((t) => t.z === z));
  }

  it('puts a tram tile in both graphs — it is a street as well as a track', () => {
    const { road, tram } = networks(tramGrid());
    expect(edgesOnRow(road, TRAM_Z).length).toBeGreaterThan(0); // cars may drive it
    expect(tram.getEdges().length).toBeGreaterThan(0); // and a tram may run it
  });

  it('confines a tram to the track, where a bus would detour around a gap', () => {
    // The track is broken at x=7, with an ordinary street bridging the break
    // one row over. A car can go around; a tram cannot leave its rails.
    const g = tramGrid();
    g.roadTier[TRAM_Z * SIZE + 7] = RoadTier.None;
    for (const x of [6, 8]) g.roadTier[(TRAM_Z - 1) * SIZE + x] = RoadTier.TwoLane;
    for (let x = 6; x <= 8; x++) g.roadTier[(TRAM_Z - 1) * SIZE + x] = RoadTier.TwoLane;
    const { road, tram } = networks(g);

    const stops = [
      { x: 2, z: TRAM_Z },
      { x: 12, z: TRAM_Z },
    ];
    const sys = new TransitSystem(road, null, tram);
    const line = sys.createLine(stops, 0, 'tram');
    expect(sys.route(line.id)).toBeNull();

    const busSys = new TransitSystem(road);
    const bus = busSys.createLine(stops, 0);
    expect(busSys.route(bus.id)).not.toBeNull(); // the detour is open to a car
  });

  it('gives a tram line no route where the city has no tram track', () => {
    const road = new RoadNetwork();
    road.rebuild(tramGrid());
    const sys = new TransitSystem(road); // no tram network injected
    const line = sys.createLine(
      [
        { x: 2, z: TRAM_Z },
        { x: 12, z: TRAM_Z },
      ],
      0,
      'tram',
    );
    expect(sys.route(line.id)).toBeNull();
    expect(sys.ridership(line.id, fixedAccessor(100))).toBe(0);
  });

  it('carries more riders than a bus and fewer than a train, off the same demand', () => {
    const g = tramGrid();
    const { road, tram } = networks(g);
    const stops = [
      { x: 2, z: TRAM_Z },
      { x: 12, z: TRAM_Z },
    ];

    const tramSys = new TransitSystem(road, null, tram);
    const tramLine = tramSys.createLine(stops, 0, 'tram');
    const busSys = new TransitSystem(tram); // same geometry, bus rates
    const busLine = busSys.createLine(stops, 0);
    const railSys = new TransitSystem(road, tram); // same geometry, rail rates
    const railLine = railSys.createLine(stops, 0, 'rail');

    const trams = tramSys.ridership(tramLine.id, fixedAccessor(100));
    expect(trams).toBeGreaterThan(busSys.ridership(busLine.id, fixedAccessor(100)));
    expect(trams).toBeLessThan(railSys.ridership(railLine.id, fixedAccessor(100)));
  });

  it('relieves the streets it runs down, not the ones its edge ids collide with', () => {
    const g = tramGrid();
    const { road, tram } = networks(g);
    const START_VOLUME = 10;
    road.addVolume(
      road.getEdges().map((e) => e.id),
      START_VOLUME,
    );

    const sys = new TransitSystem(road, null, tram);
    const line = sys.createLine(
      [
        { x: 2, z: TRAM_Z },
        { x: 12, z: TRAM_Z },
      ],
      0,
      'tram',
    );

    // The trap this test exists for: the tram graph numbers its edges from 0,
    // and road edge 0 is the far-off street, because its row is scanned first.
    // Relieving by the tram route's own ids would improve the wrong street.
    const tramEdgeIds = new Set(sys.route(line.id)!.edges);
    const collisions = road.getEdges().filter((e) => tramEdgeIds.has(e.id));
    expect(collisions.some((e) => e.tiles.every((t) => t.z === STREET_Z))).toBe(true);

    sys.tick(fixedAccessor(200));

    for (const edge of edgesOnRow(road, TRAM_Z)) expect(edge.volume).toBeLessThan(START_VOLUME);
    for (const edge of edgesOnRow(road, STREET_Z)) expect(edge.volume).toBe(START_VOLUME);
  });
});

describe('applyStationRelief', () => {
  /** One road node at (5,5) with two edges carrying volume. */
  function stationNetwork(): FakeNetwork {
    const edges = [makeEdge(1, 10), makeEdge(2, 10), makeEdge(3, 10)];
    const net = createFakeNetwork(() => null, edges);
    return {
      ...net,
      // Edges 1 and 2 meet at the station's door; edge 3 is elsewhere.
      nearestNode: () => 0,
      getNodes: () => [{ id: 0, x: 5, z: 5, edges: [1, 2] }],
    };
  }

  const railLine = (stops: TilePoint[]): TransitLine => ({ id: 1, stops, color: 0, mode: 'rail' });

  it('relieves the streets meeting the station door, and nothing further off', () => {
    const net = stationNetwork();
    applyStationRelief(net, railLine([{ x: 5, z: 5 }]), 100);

    const relieved = new Set(net.addVolumeCalls.flatMap((c) => c.edgeIds));
    expect(relieved).toEqual(new Set([1, 2]));
    expect(net.addVolumeCalls.every((c) => c.amount < 0)).toBe(true);
  });

  it('relieves a shared doorstep once, not once per stop', () => {
    const net = stationNetwork();
    applyStationRelief(
      net,
      railLine([
        { x: 5, z: 5 },
        { x: 6, z: 5 },
      ]),
      100,
    );
    const ids = net.addVolumeCalls.flatMap((c) => c.edgeIds);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it('never drives an edge negative', () => {
    const edges = [makeEdge(1, 2)];
    const base = createFakeNetwork(() => null, edges);
    const net: FakeNetwork = {
      ...base,
      nearestNode: () => 0,
      getNodes: () => [{ id: 0, x: 5, z: 5, edges: [1] }],
    };
    applyStationRelief(net, railLine([{ x: 5, z: 5 }]), 100_000);
    expect(edges[0]!.volume).toBeGreaterThanOrEqual(0);
  });

  it('relieves nothing for a station no street reaches', () => {
    const edges = [makeEdge(1, 10)];
    const base = createFakeNetwork(() => null, edges);
    const net: FakeNetwork = { ...base, nearestNode: () => null };
    applyStationRelief(net, railLine([{ x: 5, z: 5 }]), 100);
    expect(net.addVolumeCalls).toEqual([]);
  });

  it('does nothing without riders', () => {
    const net = stationNetwork();
    applyStationRelief(net, railLine([{ x: 5, z: 5 }]), 0);
    expect(net.addVolumeCalls).toEqual([]);
  });
});

describe('what tick() hands to the snapshot', () => {
  it('reports each line WITH its mode', () => {
    // The wire mapping used to enumerate id/stops/color and drop the mode, so
    // the render thread saw every rail line as a bus line — bus shelters at the
    // stations, buses on the track.
    const sys = new TransitSystem(createFakeNetwork(() => null));
    sys.createLine([{ x: 1, z: 1 }], 0, 'rail');
    sys.createLine([{ x: 2, z: 2 }], 0);

    const result = sys.tick(fixedAccessor(0));
    expect(result.lines.map((l) => l.mode)).toEqual(['rail', 'bus']);
  });
});

describe('TransitSystem.restore', () => {
  it('brings lines back from a save and never reissues their ids', () => {
    const sys = new TransitSystem(createFakeNetwork(() => null));
    sys.restore([
      { id: 4, color: 1, stops: [{ x: 1, z: 1 }] },
      { id: 9, color: 2, stops: [{ x: 2, z: 2 }], mode: 'rail' },
    ]);

    expect(sys.getLines().map((l) => l.id)).toEqual([4, 9]);
    expect(sys.getLine(9)!.mode).toBe('rail');
    // The next line created cannot collide with one that came out of the save.
    expect(sys.createLine([{ x: 3, z: 3 }], 0).id).toBe(10);
  });

  it('replaces whatever was there, and copies the stops', () => {
    const sys = new TransitSystem(createFakeNetwork(() => null));
    sys.createLine([{ x: 0, z: 0 }], 0);
    const stops = [{ x: 5, z: 5 }];
    sys.restore([{ id: 1, color: 0, stops }]);

    expect(sys.getLines()).toHaveLength(1);
    stops.push({ x: 6, z: 6 }); // mutating the source must not reach the system
    expect(sys.getLine(1)!.stops).toHaveLength(1);
  });

  it('restores nothing from an empty save', () => {
    const sys = new TransitSystem(createFakeNetwork(() => null));
    sys.createLine([{ x: 0, z: 0 }], 0);
    sys.restore([]);
    expect(sys.getLines()).toEqual([]);
  });
});
