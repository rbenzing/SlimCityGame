import { describe, it, expect } from 'vitest';
import {
  TransitSystem,
  emptyTransitResult,
  routeLine,
  estimateRidership,
  applyRidershipRelief,
  applyStationRelief,
  settleDefault,
  gateOf,
  deadRunHeadwayTicks,
  RIDERSHIP_STOP_RADIUS_TILES,
  CONGESTION_RELIEF_PER_RIDER,
  type FleetDepot,
  type PopulationJobsAccessor,
  type TransitPools,
  type TransitRoute,
} from './transit';
import { dayHourFromTick } from './traffic';
import {
  defaultFleet,
  RUNNING_COST_CENTS,
  SERVICE_END_HOUR,
  SERVICE_START_HOUR,
} from '../shared/transitfleet';
import { TICK_RATE, tileToWorld, VISUAL_DAY_TICKS } from '../shared/constants';
import {
  isRailTier,
  isTramTier,
  RoadFlow,
  RoadTier,
  type GraphEdge,
  type GridState,
  type PathResult,
  type RoadNetworkApi,
  type RoadProfile,
  type TilePoint,
  type TransitLine,
} from '../shared/types';
import {
  composeProfile,
  FIRST_CUSTOM_PROFILE_ID,
  NO_EDITS,
  presetProfileForTier,
} from '../shared/roadprofile';
import { RoadNetwork, tramShape } from '../world/roadgraph';
import { createGrid } from '../world/grid';

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
  return createGrid(n);
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

/** One bus depot's worth of fielded buses, and no other mode. */
const BUS_POOL: TransitPools = { bus: 8, rail: 0, tram: 0 };

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

    const result = sys.tick(fixedAccessor(100), BUS_POOL);
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

    sys.tick(fixedAccessor(1000), BUS_POOL);
    expect(edges[0]!.volume).toBeLessThan(1000);
  });

  it('produces an empty snapshot when there are no lines', () => {
    const sys = new TransitSystem(createFakeNetwork(() => null));
    expect(sys.tick(fixedAccessor(100))).toEqual(emptyTransitResult());
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
    const tram = new RoadNetwork(isTramTier, tramShape);
    tram.rebuild(g);
    return { road, tram };
  }

  describe('crossing another street', () => {
    const CROSS_X = 7;

    /** The track, with an avenue drawn north–south across it first, so the crossing tile is the avenue's. */
    function crossedGrid(): GridState {
      const g = tramGrid();
      for (let z = TRAM_Z - 5; z <= TRAM_Z + 5; z++)
        g.roadTier[z * SIZE + CROSS_X] = RoadTier.Avenue;
      return g;
    }
    const ends = [
      { x: 2, z: TRAM_Z },
      { x: 12, z: TRAM_Z },
    ];

    it('goes straight over the junction, though the tile stays the avenue', () => {
      const g = crossedGrid();
      expect(g.roadTier[TRAM_Z * SIZE + CROSS_X]).toBe(RoadTier.Avenue);
      const { road, tram } = networks(g);
      const sys = new TransitSystem(road, null, tram);
      const line = sys.createLine(ends, 0, 'tram');
      const points = sys.route(line.id)?.points ?? [];
      expect(points.some((p) => p.x === CROSS_X && p.z === TRAM_Z)).toBe(true);
      for (const p of points) expect(p.z).toBe(TRAM_Z);
      expect(sys.ridership(line.id, fixedAccessor(100))).toBeGreaterThan(0);
    });

    it('keeps the tram graph to one tram edge across it, and the avenue to cars', () => {
      const { road, tram } = networks(crossedGrid());
      expect(tram.getEdges().map((e) => e.tier)).toEqual([RoadTier.Tram]);
      // Cars still meet the avenue at a junction there, and drive on along it.
      const avenue = road.getEdges().filter((e) => e.tiles.every((t) => t.x === CROSS_X));
      expect(avenue.length).toBeGreaterThan(0);
    });

    it('never turns there, onto a street with no track to turn onto', () => {
      // A second tramway meets the crossing from the north and ends at it. The
      // crossing still carries the east–west tramway over, but the tile has no
      // track round the corner, so nothing links the two tramways.
      const g = crossedGrid();
      for (let z = TRAM_Z - 5; z < TRAM_Z; z++) g.roadTier[z * SIZE + CROSS_X] = RoadTier.Tram;
      const { road, tram } = networks(g);
      const sys = new TransitSystem(road, null, tram);
      expect(sys.route(sys.createLine(ends, 0, 'tram').id)).not.toBeNull();
      const turning = sys.createLine(
        [
          { x: 2, z: TRAM_Z },
          { x: CROSS_X, z: TRAM_Z - 5 },
        ],
        0,
        'tram',
      );
      expect(sys.route(turning.id)).toBeNull();
    });

    it('goes over a road laid as two carriageways, through the median it opens', () => {
      // A six-lane road running south in columns 7 and 8, its halves flagged
      // as one corridor, with the tramway drawn across both.
      const g = tramGrid();
      for (let z = TRAM_Z - 5; z <= TRAM_Z + 5; z++) {
        for (const [x, flow] of [
          [CROSS_X, RoadFlow.South | 0b1000],
          [CROSS_X + 1, RoadFlow.South | 0b1000 | 0b1_0000],
        ] as const) {
          const i = z * SIZE + x;
          g.roadTier[i] = RoadTier.Avenue;
          g.roadProfile[i] = 40;
          g.roadFlow[i] = flow;
        }
      }
      const { road, tram } = networks(g);
      const sys = new TransitSystem(road, null, tram);
      const points = sys.route(sys.createLine(ends, 0, 'tram').id)?.points ?? [];
      for (const x of [CROSS_X, CROSS_X + 1]) {
        expect(points.some((p) => p.x === x && p.z === TRAM_Z)).toBe(true);
      }
      for (const p of points) expect(p.z).toBe(TRAM_Z);
    });

    it('stops at three street tiles in a row, which no crossing spans', () => {
      const g = tramGrid();
      for (const x of [CROSS_X, CROSS_X + 1, CROSS_X + 2]) {
        for (let z = TRAM_Z - 5; z <= TRAM_Z + 5; z++) g.roadTier[z * SIZE + x] = RoadTier.Avenue;
      }
      const { road, tram } = networks(g);
      const sys = new TransitSystem(road, null, tram);
      expect(sys.route(sys.createLine(ends, 0, 'tram').id)).toBeNull();
    });

    it('is an ordinary junction again once one tram arm is gone', () => {
      const g = crossedGrid();
      for (let x = CROSS_X + 1; x <= 12; x++) g.roadTier[TRAM_Z * SIZE + x] = RoadTier.None;
      const { road, tram } = networks(g);
      const sys = new TransitSystem(road, null, tram);
      const line = sys.createLine(
        [
          { x: 2, z: TRAM_Z },
          { x: CROSS_X, z: TRAM_Z },
        ],
        0,
        'tram',
      );
      const points = sys.route(line.id)?.points ?? [];
      expect(points.some((p) => p.x === CROSS_X)).toBe(false);
    });
  });

  /** Road edges lying wholly on one row. */
  function edgesOnRow(road: RoadNetwork, z: number): GraphEdge[] {
    return road.getEdges().filter((e) => e.tiles.every((t) => t.z === z));
  }

  it('puts a tram tile in both graphs — it is a street as well as a track', () => {
    const { road, tram } = networks(tramGrid());
    expect(edgesOnRow(road, TRAM_Z).length).toBeGreaterThan(0); // cars may drive it
    expect(tram.getEdges().length).toBeGreaterThan(0); // and a tram may run it
  });

  describe('on a road composed with a tram lane', () => {
    const COMPOSED = FIRST_CUSTOM_PROFILE_ID;
    const ends = [
      { x: 2, z: TRAM_Z },
      { x: 12, z: TRAM_Z },
    ];
    /** The tram row laid as `base` carrying the composed profile, which the networks resolve. */
    function composedNetworks(
      base: RoadTier,
      profile: RoadProfile,
    ): { road: RoadNetwork; tram: RoadNetwork } {
      const g = tramGrid();
      for (let x = 2; x <= 12; x++) {
        g.roadTier[TRAM_Z * SIZE + x] = base;
        g.roadProfile[TRAM_Z * SIZE + x] = COMPOSED;
      }
      const resolve = (id: number): RoadProfile | null => (id === COMPOSED ? profile : null);
      const road = new RoadNetwork();
      road.setProfileResolver(resolve);
      road.rebuild(g);
      const tram = new RoadNetwork(isTramTier, tramShape);
      tram.setProfileResolver(resolve);
      tram.rebuild(g);
      return { road, tram };
    }

    for (const [choice, base] of [
      ['mixed', RoadTier.TwoLane],
      ['reserved', RoadTier.Avenue],
    ] as const) {
      it(`routes a tram line down a ${choice} tram lane, and cars down the road`, () => {
        const profile = composeProfile(presetProfileForTier(base), { ...NO_EDITS, tram: choice });
        const { road, tram } = composedNetworks(base, profile);
        expect(edgesOnRow(road, TRAM_Z).length).toBeGreaterThan(0);
        const sys = new TransitSystem(road, null, tram);
        const line = sys.createLine(ends, 0, 'tram');
        const points = sys.route(line.id)?.points ?? [];
        expect(points.length).toBeGreaterThan(0);
        for (const p of points) expect(p.z).toBe(TRAM_Z);
        expect(sys.ridership(line.id, fixedAccessor(100))).toBeGreaterThan(0);
      });
    }

    it('crosses a street straight over the junction, as the Tramway does', () => {
      const profile = composeProfile(presetProfileForTier(RoadTier.TwoLane), {
        ...NO_EDITS,
        tram: 'mixed',
      });
      const g = tramGrid();
      for (let x = 2; x <= 12; x++) {
        g.roadTier[TRAM_Z * SIZE + x] = RoadTier.TwoLane;
        g.roadProfile[TRAM_Z * SIZE + x] = COMPOSED;
      }
      for (let z = TRAM_Z - 5; z <= TRAM_Z + 5; z++) {
        g.roadTier[z * SIZE + 7] = RoadTier.Avenue;
        g.roadProfile[z * SIZE + 7] = 0;
      }
      const tram = new RoadNetwork(isTramTier, tramShape);
      tram.setProfileResolver((id) => (id === COMPOSED ? profile : null));
      tram.rebuild(g);
      expect(tram.getEdges().map((e) => e.tier)).toEqual([RoadTier.Tram]);
      const sys = new TransitSystem(new RoadNetwork(), null, tram);
      const points = sys.route(sys.createLine(ends, 0, 'tram').id)?.points ?? [];
      expect(points.some((p) => p.x === 7 && p.z === TRAM_Z)).toBe(true);
    });

    it('is no track where the lane carries no tram', () => {
      const plain = presetProfileForTier(RoadTier.TwoLane);
      const { road, tram } = composedNetworks(RoadTier.TwoLane, plain);
      expect(tram.getEdges()).toEqual([]);
      const sys = new TransitSystem(road, null, tram);
      expect(sys.route(sys.createLine(ends, 0, 'tram').id)).toBeNull();
    });
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

    sys.tick(fixedAccessor(200), { bus: 0, rail: 0, tram: 6 });

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

// ---------------------------------------------------------------------------
// The fleet: pools, allocation, and what a line fielded short carries
// ---------------------------------------------------------------------------

describe('the fleet a line runs', () => {
  /** A straight route of `tiles` points down one edge, with a fixed demand at every stop. */
  function straightSystem(
    tiles: number,
    volume = 1000,
  ): { sys: TransitSystem; edges: GraphEdge[] } {
    const points: TilePoint[] = Array.from({ length: tiles }, (_, i) => ({ x: i, z: 0 }));
    const edges = [makeEdge(1, volume)];
    const sys = new TransitSystem(createFakeNetwork(() => makePath(points, [1]), edges));
    return { sys, edges };
  }
  const STOPS: TilePoint[] = [
    { x: 0, z: 0 },
    { x: 59, z: 0 },
  ];

  it('serves nothing, carries nobody and relieves nothing with no depot of its mode', () => {
    const { sys, edges } = straightSystem(60);
    sys.createLine(STOPS, 1);
    const result = sys.tick(fixedAccessor(1000));
    expect(result.pools).toEqual({ bus: 0, rail: 0, tram: 0 });
    expect(result.requested[0]).toBeGreaterThan(0);
    expect(result.served).toEqual([0]);
    expect(result.ridership).toEqual([0]);
    expect(result.headwayMin).toEqual([0]);
    expect(result.runningCost).toEqual([0]);
    expect(edges[0]!.volume).toBe(1000);
  });

  it('a depot of another mode adds nothing to a bus line', () => {
    const { sys } = straightSystem(60);
    sys.createLine(STOPS, 1);
    expect(sys.tick(fixedAccessor(1000), { bus: 0, rail: 4, tram: 6 }).served).toEqual([0]);
  });

  it('gives a line its whole request when the pool covers it, and reports headway and cost', () => {
    const { sys } = straightSystem(60);
    sys.createLine(STOPS, 1, 'bus', 2);
    const result = sys.tick(fixedAccessor(1000), BUS_POOL);
    expect(result.requested).toEqual([2]);
    expect(result.served).toEqual([2]);
    expect(result.headwayMin[0]).toBeCloseTo(4.14, 2);
    expect(result.runningCost).toEqual([2 * RUNNING_COST_CENTS.bus]);
    expect(result.pools).toEqual(BUS_POOL);
  });

  it('cuts lines back in proportion when they ask for more than the pool, summing to exactly the pool', () => {
    const { sys } = straightSystem(60);
    sys.createLine(STOPS, 1, 'bus', 4);
    sys.createLine(STOPS, 2, 'bus', 4);
    sys.createLine(STOPS, 3, 'bus', 2);
    const result = sys.tick(fixedAccessor(1000), { bus: 5, rail: 0, tram: 0 });
    expect(result.served).toEqual([2, 2, 1]);
    expect(result.served.reduce((a, b) => a + b, 0)).toBe(5);
  });

  it('hands remainders down by ascending line id, whatever order the lines were restored in', () => {
    const { sys } = straightSystem(60);
    sys.restore([
      { id: 9, stops: STOPS, color: 0, vehicles: 3 },
      { id: 4, stops: STOPS, color: 0, vehicles: 3 },
      { id: 7, stops: STOPS, color: 0, vehicles: 3 },
    ]);
    const result = sys.tick(fixedAccessor(1000), { bus: 5, rail: 0, tram: 0 });
    expect(result.lines.map((l) => l.id)).toEqual([4, 7, 9]);
    expect(result.served).toEqual([2, 2, 1]);
  });

  it('carries and relieves in proportion to the share it got', () => {
    const full = straightSystem(60);
    full.sys.createLine(STOPS, 1, 'bus', 4);
    const whole = full.sys.tick(fixedAccessor(1000), BUS_POOL);

    const short = straightSystem(60);
    short.sys.createLine(STOPS, 1, 'bus', 4);
    const half = short.sys.tick(fixedAccessor(1000), { bus: 2, rail: 0, tram: 0 });

    expect(half.served).toEqual([2]);
    expect(half.ridership[0]).toBeCloseTo(whole.ridership[0]! / 2, 9);
    expect(1000 - short.edges[0]!.volume).toBeCloseTo((1000 - full.edges[0]!.volume) / 2, 9);
  });

  it('is deterministic across runs', () => {
    const a = straightSystem(60);
    const b = straightSystem(60);
    for (const { sys } of [a, b]) {
      sys.createLine(STOPS, 1, 'bus', 7);
      sys.createLine(STOPS, 2, 'bus', 5);
      sys.createLine(STOPS, 3, 'bus', 3);
    }
    const pool = { bus: 9, rail: 0, tram: 0 };
    expect(a.sys.tick(fixedAccessor(500), pool)).toEqual(b.sys.tick(fixedAccessor(500), pool));
  });

  it('asks for the derived default when the player set no fleet, and the player’s figure when they did', () => {
    const { sys } = straightSystem(60);
    const derived = sys.createLine(STOPS, 1);
    const set = sys.createLine(STOPS, 2, 'bus', 6);
    const result = sys.tick(fixedAccessor(1000), { bus: 40, rail: 0, tram: 0 });
    const riders = result.ridership[0]!;
    expect(result.requested[0]).toBe(defaultFleet('bus', riders, 60));
    expect(result.requested[1]).toBe(6);
    expect(sys.getLine(derived.id)!.vehicles).toBeUndefined();
    expect(sys.getLine(set.id)!.vehicles).toBe(6);
  });

  it('holds a default steady across a one-vehicle dip', () => {
    expect(settleDefault(undefined, 3)).toBe(3);
    expect(settleDefault(3, 4)).toBe(4);
    expect(settleDefault(4, 3)).toBe(4);
    expect(settleDefault(4, 2)).toBe(2);
    expect(settleDefault(4, 4)).toBe(4);
  });

  it('carries a line’s requested fleet through an update, and drops it when the update leaves it out', () => {
    const { sys } = straightSystem(60);
    const line = sys.createLine(STOPS, 1, 'bus', 3);
    expect(sys.updateLine(line.id, STOPS, 2, undefined, 5)!.vehicles).toBe(5);
    expect(sys.updateLine(line.id, STOPS, 2)!.vehicles).toBeUndefined();
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

// ---------------------------------------------------------------------------
// Dead runs: which depot fields a line, the path between them, and the day's
// two crossings.
// ---------------------------------------------------------------------------

describe('dead runs', () => {
  /** The first tick whose clock hour is at or past `hour`, with the tick before it short of it. */
  function crossingTick(hour: number): number {
    for (let t = 1; t <= VISUAL_DAY_TICKS; t++) {
      if (dayHourFromTick(t - 1) < hour && dayHourFromTick(t) >= hour) return t;
    }
    throw new Error('no crossing');
  }
  const PULL_OUT = crossingTick(SERVICE_START_HOUR);
  const PULL_IN = crossingTick(SERVICE_END_HOUR);

  const STOPS: TilePoint[] = [
    { x: 40, z: 0 },
    { x: 59, z: 0 },
  ];
  /** Depot 1 stands five tiles from the first stop, depot 2 fifty: distance says 1, the costs below may not. */
  const DEPOT_A: FleetDepot = { id: 1, mode: 'bus', fields: 8, tiles: [{ x: 45, z: 5 }] };
  const DEPOT_B: FleetDepot = { id: 2, mode: 'bus', fields: 8, tiles: [{ x: 90, z: 5 }] };
  const BOTH = [DEPOT_A, DEPOT_B];
  const POOL: TransitPools = { bus: 16, rail: 0, tram: 0 };

  /** A dead-run path's edge id names its depot; the route's names its last stop. */
  const deadRunEdge = (depotId: number): number => 10 + depotId;
  const routeEdge = (to: TilePoint): number => 1000 + to.x;

  function fixture(costs: Record<number, number | null>, depots: readonly FleetDepot[] = BOTH) {
    const edges = [makeEdge(routeEdge(STOPS[1]!), 0), makeEdge(11, 0), makeEdge(12, 0)];
    const gateCalls: TilePoint[] = [];
    const network = createFakeNetwork((from, to) => {
      const depot = depots.find((d) => d.tiles[0]!.x === from.x && d.tiles[0]!.z === from.z);
      if (depot) {
        gateCalls.push(from);
        const cost = costs[depot.id];
        if (cost === null || cost === undefined) return null;
        return { ...makePath([from, to], [deadRunEdge(depot.id)]), cost };
      }
      return makePath([from, to], [routeEdge(to)]);
    }, edges);
    const sys = new TransitSystem(network);
    return { sys, network, edges, gateCalls };
  }

  /** Volume added, never taken away: relief is negative and the dead runs are the only positive loads. */
  const loads = (network: ReturnType<typeof createFakeNetwork>) =>
    network.addVolumeCalls.filter((c) => c.amount > 0);

  describe('which depot fields a line', () => {
    it('takes the vehicles from the nearest depot by path cost, not by distance', () => {
      const { sys } = fixture({ 1: 100, 2: 10 });
      sys.createLine(STOPS, 1, 'bus', 6);
      const result = sys.tick(fixedAccessor(0), POOL, BOTH);
      expect(result.served).toEqual([6]);
      expect(result.depotId).toEqual([2]);
      expect(result.inService).toEqual(new Map([[2, 6]]));
    });

    it('spills to the next nearest when the nearest runs dry, and names the depot fielding most', () => {
      const { sys } = fixture({ 1: 100, 2: 10 });
      sys.createLine(STOPS, 1, 'bus', 12);
      const result = sys.tick(fixedAccessor(0), POOL, BOTH);
      expect(result.served).toEqual([12]);
      expect(result.depotId).toEqual([2]);
      expect(result.inService).toEqual(
        new Map([
          [2, 8],
          [1, 4],
        ]),
      );
    });

    it('breaks an equal cost by depot id', () => {
      const { sys } = fixture({ 1: 10, 2: 10 });
      sys.createLine(STOPS, 1, 'bus', 3);
      const result = sys.tick(fixedAccessor(0), POOL, BOTH);
      expect(result.depotId).toEqual([1]);
    });

    it('serves the lines in id order, so a later line takes what the earlier left', () => {
      const { sys } = fixture({ 1: 100, 2: 10 });
      sys.createLine(STOPS, 1, 'bus', 8);
      sys.createLine(STOPS, 2, 'bus', 8);
      const result = sys.tick(fixedAccessor(0), POOL, BOTH);
      expect(result.served).toEqual([8, 8]);
      expect(result.depotId).toEqual([2, 1]);
      expect(result.inService).toEqual(
        new Map([
          [2, 8],
          [1, 8],
        ]),
      );
    });

    it('a depot no path reaches fields nothing for the line', () => {
      const near = fixture({ 1: null, 2: 10 });
      near.sys.createLine(STOPS, 1, 'bus', 6);
      expect(near.sys.tick(fixedAccessor(0), POOL, BOTH).depotId).toEqual([2]);

      const none = fixture({ 1: null, 2: null });
      none.sys.createLine(STOPS, 1, 'bus', 6);
      const result = none.sys.tick(fixedAccessor(0), POOL, BOTH);
      expect(result.served).toEqual([6]);
      expect(result.depotId).toEqual([null]);
      expect(result.inService).toEqual(new Map());
    });

    it('a line served nothing comes from no depot', () => {
      const { sys } = fixture({ 1: 10, 2: 10 });
      sys.createLine(STOPS, 1, 'bus', 6);
      const result = sys.tick(fixedAccessor(0), { bus: 0, rail: 0, tram: 0 }, BOTH);
      expect(result.depotId).toEqual([null]);
      expect(result.inService).toEqual(new Map());
    });

    it('with no depots given, every line comes from none and the result still shapes up', () => {
      const { sys } = fixture({ 1: 10, 2: 10 });
      sys.createLine(STOPS, 1, 'bus', 6);
      const result = sys.tick(fixedAccessor(0), POOL);
      expect(result.served).toEqual([6]);
      expect(result.depotId).toEqual([null]);
      expect(result.deadRuns).toEqual([]);
    });
  });

  describe('the gate', () => {
    it('is the footprint tile nearest the node the network snaps it to', () => {
      const network: RoadNetworkApi = {
        ...createFakeNetwork(() => null),
        nearestNode: () => 7,
        getNodes: () => [{ id: 7, x: 10, z: 10, edges: [] }],
      };
      const depot: FleetDepot = {
        id: 1,
        mode: 'bus',
        fields: 8,
        tiles: [
          { x: 3, z: 3 },
          { x: 4, z: 3 },
          { x: 3, z: 4 },
          { x: 4, z: 4 },
        ],
      };
      expect(gateOf(depot, network)).toEqual({ x: 4, z: 4 });
    });

    it('is the first tile where nothing snaps', () => {
      const depot: FleetDepot = {
        id: 1,
        mode: 'bus',
        fields: 8,
        tiles: [
          { x: 3, z: 3 },
          { x: 4, z: 3 },
        ],
      };
      expect(
        gateOf(
          depot,
          createFakeNetwork(() => null),
        ),
      ).toEqual({ x: 3, z: 3 });
    });
  });

  describe('the path and its cache', () => {
    it('is found once per depot and kept while nothing changes', () => {
      const { sys, gateCalls } = fixture({ 1: 100, 2: 10 });
      sys.createLine(STOPS, 1, 'bus', 6);
      sys.tick(fixedAccessor(0), POOL, BOTH);
      expect(gateCalls).toEqual([DEPOT_A.tiles[0], DEPOT_B.tiles[0]]);
      sys.tick(fixedAccessor(0), POOL, BOTH);
      sys.tick(fixedAccessor(0), POOL, BOTH);
      expect(gateCalls).toHaveLength(2);
    });

    it('is found again when the line’s route changes', () => {
      const { sys, gateCalls } = fixture({ 1: 100, 2: 10 });
      const line = sys.createLine(STOPS, 1, 'bus', 6);
      sys.tick(fixedAccessor(0), POOL, BOTH);
      sys.updateLine(line.id, [STOPS[0]!, { x: 58, z: 0 }], 1, 'bus', 6);
      sys.tick(fixedAccessor(0), POOL, BOTH);
      expect(gateCalls).toHaveLength(4);
      sys.tick(fixedAccessor(0), POOL, BOTH);
      expect(gateCalls).toHaveLength(4);
    });

    it('is found again when the mode’s depots change', () => {
      const { sys, gateCalls } = fixture({ 1: 100, 2: 10 });
      sys.createLine(STOPS, 1, 'bus', 6);
      sys.tick(fixedAccessor(0), POOL, BOTH);
      const result = sys.tick(fixedAccessor(0), { bus: 8, rail: 0, tram: 0 }, [DEPOT_A]);
      expect(gateCalls).toHaveLength(3);
      expect(result.depotId).toEqual([1]);
      sys.tick(fixedAccessor(0), { bus: 8, rail: 0, tram: 0 }, [DEPOT_A]);
      expect(gateCalls).toHaveLength(3);
    });

    it('is found again the tick after the graph is rebuilt under it', () => {
      const { sys, edges, gateCalls } = fixture({ 1: 100, 2: 10 });
      sys.createLine(STOPS, 1, 'bus', 6);
      sys.tick(fixedAccessor(0), POOL, BOTH);
      // A rebuilt graph hands out new edge objects under the same ids.
      edges[2] = makeEdge(12, 0);
      sys.tick(fixedAccessor(0), POOL, BOTH);
      expect(gateCalls).toHaveLength(4);
      sys.tick(fixedAccessor(0), POOL, BOTH);
      expect(gateCalls).toHaveLength(4);
    });

    it('is forgotten with the line', () => {
      const { sys, gateCalls } = fixture({ 1: 100, 2: 10 });
      const line = sys.createLine(STOPS, 1, 'bus', 6);
      sys.tick(fixedAccessor(0), POOL, BOTH);
      sys.deleteLine(line.id);
      sys.createLine(STOPS, 1, 'bus', 6);
      sys.tick(fixedAccessor(0), POOL, BOTH);
      expect(gateCalls).toHaveLength(4);
    });
  });

  describe('the two crossings', () => {
    it('loads the path’s edges with the served vehicles at 05:00 and at 23:00, once each, and nowhere else', () => {
      const { sys, network } = fixture({ 1: 100, 2: 10 });
      sys.createLine(STOPS, 1, 'bus', 6);
      for (let t = 0; t < VISUAL_DAY_TICKS; t++) sys.tick(fixedAccessor(0), POOL, BOTH, t);
      expect(loads(network)).toEqual([
        { edgeIds: [deadRunEdge(2)], amount: 6 },
        { edgeIds: [deadRunEdge(2)], amount: 6 },
      ]);
      // The road the line itself drives takes no dead-run load.
      expect(network.addVolumeCalls.some((c) => c.edgeIds.includes(routeEdge(STOPS[1]!)))).toBe(
        false,
      );
    });

    it('fires at the tick the clock crosses the hour, and not at the ticks beside it', () => {
      const { sys, network } = fixture({ 1: 100, 2: 10 });
      sys.createLine(STOPS, 1, 'bus', 6);
      sys.tick(fixedAccessor(0), POOL, BOTH, PULL_OUT - 1);
      expect(loads(network)).toHaveLength(0);
      const out = sys.tick(fixedAccessor(0), POOL, BOTH, PULL_OUT);
      expect(loads(network)).toHaveLength(1);
      expect(out.deadRuns).toHaveLength(1);
      expect(sys.tick(fixedAccessor(0), POOL, BOTH, PULL_OUT + 1).deadRuns).toEqual([]);
      expect(loads(network)).toHaveLength(1);
    });

    it('sends the served buses out from the gate one per headway, and back the other way at night', () => {
      const { sys } = fixture({ 1: 100, 2: 10 });
      sys.createLine(STOPS, 1, 'bus', 6);
      sys.tick(fixedAccessor(0), POOL, BOTH, PULL_OUT - 1);
      const out = sys.tick(fixedAccessor(0), POOL, BOTH, PULL_OUT);
      const gate = { x: tileToWorld(DEPOT_B.tiles[0]!.x), z: tileToWorld(DEPOT_B.tiles[0]!.z) };
      const stop = { x: tileToWorld(STOPS[0]!.x), z: tileToWorld(STOPS[0]!.z) };
      expect(out.deadRuns).toEqual([
        {
          lineId: 1,
          route: [gate, stop],
          count: 6,
          headwayTicks: deadRunHeadwayTicks(out.headwayMin[0]!),
        },
      ]);
      expect(out.deadRuns[0]!.headwayTicks).toBe(Math.round(out.headwayMin[0]! * 60 * TICK_RATE));

      const back = sys.tick(fixedAccessor(0), POOL, BOTH, PULL_IN);
      expect(back.deadRuns[0]!.route).toEqual([stop, gate]);
      expect(back.deadRuns[0]!.count).toBe(6);
    });

    it('a headway is never under a tick', () => {
      expect(deadRunHeadwayTicks(0)).toBe(1);
      expect(deadRunHeadwayTicks(1 / (60 * TICK_RATE) / 10)).toBe(1);
      expect(deadRunHeadwayTicks(2)).toBe(2 * 60 * TICK_RATE);
    });

    it('a line with no depot path, or none served, runs nothing and loads nothing', () => {
      const unreachable = fixture({ 1: null, 2: null });
      unreachable.sys.createLine(STOPS, 1, 'bus', 6);
      unreachable.sys.tick(fixedAccessor(0), POOL, BOTH, PULL_OUT - 1);
      expect(unreachable.sys.tick(fixedAccessor(0), POOL, BOTH, PULL_OUT).deadRuns).toEqual([]);
      expect(loads(unreachable.network)).toHaveLength(0);

      const idle = fixture({ 1: 10, 2: 10 });
      idle.sys.createLine(STOPS, 1, 'bus', 6);
      idle.sys.tick(fixedAccessor(0), { bus: 0, rail: 0, tram: 0 }, BOTH, PULL_OUT - 1);
      const result = idle.sys.tick(fixedAccessor(0), { bus: 0, rail: 0, tram: 0 }, BOTH, PULL_OUT);
      expect(result.deadRuns).toEqual([]);
      expect(loads(idle.network)).toHaveLength(0);
    });

    it('a tram and a train dead-run on their own graphs: no volume anywhere, no bus to animate', () => {
      const path = (from: TilePoint, to: TilePoint): PathResult => ({
        ...makePath([from, to], [1]),
        cost: 5,
      });
      const roads = createFakeNetwork(path, [makeEdge(1, 0)]);
      const rail = createFakeNetwork(path, [makeEdge(1, 0)]);
      const tram = createFakeNetwork(path, [makeEdge(1, 0)]);
      const sys = new TransitSystem(roads, rail, tram);
      sys.createLine(STOPS, 1, 'tram', 2);
      sys.createLine(STOPS, 2, 'rail', 2);
      const depots: FleetDepot[] = [
        { id: 1, mode: 'tram', fields: 6, tiles: [{ x: 45, z: 5 }] },
        { id: 2, mode: 'rail', fields: 4, tiles: [{ x: 45, z: 9 }] },
      ];
      const pools: TransitPools = { bus: 0, rail: 4, tram: 6 };
      sys.tick(fixedAccessor(0), pools, depots, PULL_OUT - 1);
      const result = sys.tick(fixedAccessor(0), pools, depots, PULL_OUT);
      expect(result.served).toEqual([2, 2]);
      expect(result.depotId).toEqual([1, 2]);
      expect(result.deadRuns).toEqual([]);
      expect(loads(roads)).toHaveLength(0);
      expect(loads(rail)).toHaveLength(0);
      expect(loads(tram)).toHaveLength(0);
    });

    it('is the same on every run: two systems ticked alike agree tick for tick', () => {
      const a = fixture({ 1: 100, 2: 10 });
      const b = fixture({ 1: 100, 2: 10 });
      for (const { sys } of [a, b]) {
        sys.createLine(STOPS, 1, 'bus', 9);
        sys.createLine(STOPS, 2, 'bus', 5);
      }
      for (let t = PULL_IN - 2; t < PULL_OUT + 2; t++) {
        expect(a.sys.tick(fixedAccessor(300), POOL, BOTH, t)).toEqual(
          b.sys.tick(fixedAccessor(300), POOL, BOTH, t),
        );
      }
      expect(a.network.addVolumeCalls).toEqual(b.network.addVolumeCalls);
      expect(loads(a.network)).toHaveLength(4);
    });
  });
});
