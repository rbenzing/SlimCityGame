import { describe, it, expect } from 'vitest';
import {
  TrafficSystem,
  TRIPS_PER_TICK,
  BASE_TRIPS_PER_TICK,
  MIN_HEADWAY_M,
  POP_TRIPS_SPAN,
  POP_FULL_TRAFFIC,
  NIGHT_ACTIVITY_FLOOR,
  SPEED_JITTER_MIN,
  SPEED_JITTER_SPAN,
  VEHICLE_DENSITY_MIN_CAP,
  VEHICLES_PER_ROAD_TILE,
  dayHourFromTick,
  isCardinallyAdjacent,
  rushHourActivity,
  smoothCorners,
  tripsForTick,
  truncateToAdjacentChain,
  vehicleDensityCap,
  type Rng,
} from './traffic';
import {
  FIELD_COUNT,
  INACTIVE_VEHICLE_X,
  MAX_VEHICLES,
  RoadTier,
  VEHICLE_STRIDE,
  VehicleKind,
  type GraphEdge,
  type GridState,
  type PathResult,
  type RoadNetworkApi,
  type TilePoint,
} from '../shared/types';
import { TICKS_PER_DAY, TICK_RATE, TILE_METERS, tileToWorld } from '../shared/constants';
import { RoadNetwork } from '../world/roads';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

/** Deterministic PRNG (mulberry32) implementing the injected Rng contract. */
function createSeededRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    int: (maxExclusive: number) => Math.floor(next() * maxExclusive),
    range: (a: number, b: number) => a + next() * (b - a),
    fork: (streamId: number) => createSeededRng((seed ^ Math.imul(streamId + 1, 0x9e3779b9)) >>> 0),
  };
  return rng;
}

/** Rng whose `.next()` returns a pre-scripted queue of exact values, in order. */
function createScriptedRng(queue: number[]): Rng {
  let cursor = 0;
  const rng: Rng = {
    next: () => {
      if (cursor >= queue.length) {
        throw new Error(`scripted rng exhausted after ${cursor} draws`);
      }
      const value = queue[cursor];
      cursor += 1;
      if (value === undefined) throw new Error('scripted rng queue hole');
      return value;
    },
    int: (maxExclusive: number) => Math.floor(rng.next() * maxExclusive),
    range: (a: number, b: number) => a + rng.next() * (b - a),
    fork: () => createScriptedRng(queue.slice(cursor)),
  };
  return rng;
}

interface FakeNetwork extends RoadNetworkApi {
  readonly addVolumeCalls: { edgeIds: number[]; amount: number }[];
  readonly decayCalls: number[];
}

function createFakeNetwork(
  findPathImpl: (from: TilePoint, to: TilePoint) => PathResult | null,
  edges: GraphEdge[] = [],
): FakeNetwork {
  const addVolumeCalls: { edgeIds: number[]; amount: number }[] = [];
  const decayCalls: number[] = [];
  return {
    rebuild: () => {},
    invalidateRegion: () => {},
    nearestNode: () => null,
    findPath: findPathImpl,
    addVolume: (edgeIds, amount) => {
      addVolumeCalls.push({ edgeIds: [...edgeIds], amount });
    },
    decayVolumes: (factor) => {
      decayCalls.push(factor);
    },
    getEdges: () => edges,
    getNodes: () => [],
    addVolumeCalls,
    decayCalls,
  };
}

function makePath(points: TilePoint[], edges: number[]): PathResult {
  return { nodes: [], edges, points, cost: 0 };
}

function makeEdge(id: number, tier: RoadTier, length = 0): GraphEdge {
  return { id, a: 0, b: 0, tier, tiles: [], length, volume: 0 };
}

/** Networks in these tests only ever return `path` on its first invocation. */
function createOneShotNetwork(path: PathResult, edges: GraphEdge[] = []): FakeNetwork {
  let calls = 0;
  return createFakeNetwork(() => {
    calls += 1;
    return calls === 1 ? path : null;
  }, edges);
}

/**
 * One tick's worth of rng draws when exactly the first of TRIPS_PER_TICK
 * sampled trips succeeds and the rest fail: sampleTrips always attempts
 * TRIPS_PER_TICK draws regardless of earlier outcomes, so every attempt
 * consumes an origin-index and destination-index draw (single-element
 * origin/destination lists make the actual values irrelevant — int(1) is
 * always 0). The one successful spawn consumes three more draws, in order:
 * speed jitter (0.5 -> multiplier exactly 1.0, keeping legacy speed math),
 * the kind roll, and the spawn stagger (0 -> vehicle starts at points[0]).
 */
function oneSuccessfulTripDraws(kindRoll: number): number[] {
  const draws = [0, 0, 0.5, kindRoll, 0];
  for (let i = 1; i < TRIPS_PER_TICK; i += 1) draws.push(0, 0);
  return draws;
}

function countActiveSlots(buffer: Float32Array): number {
  let count = 0;
  for (let slot = 0; slot < MAX_VEHICLES; slot += 1) {
    if (buffer[slot * VEHICLE_STRIDE] !== INACTIVE_VEHICLE_X) count += 1;
  }
  return count;
}

const DT = 1 / TICK_RATE;

// ---------------------------------------------------------------------------
// Buffer layout
// ---------------------------------------------------------------------------

describe('TrafficSystem vehicle buffer layout', () => {
  it('is sized MAX_VEHICLES * VEHICLE_STRIDE with every slot inactive at construction', () => {
    const sys = new TrafficSystem(
      createSeededRng(1),
      createFakeNetwork(() => null),
    );

    expect(sys.vehicleBuffer.length).toBe(MAX_VEHICLES * VEHICLE_STRIDE);
    for (let slot = 0; slot < MAX_VEHICLES; slot += 1) {
      const base = slot * VEHICLE_STRIDE;
      expect(sys.vehicleBuffer[base]).toBe(INACTIVE_VEHICLE_X);
      expect(sys.vehicleBuffer[base + 1]).toBe(0);
      expect(sys.vehicleBuffer[base + 2]).toBe(0);
      expect(sys.vehicleBuffer[base + 3]).toBe(0);
      expect(sys.vehicleBuffer[base + 4]).toBe(0);
    }
  });

  it('writes the [x, z, headingRad, speed, kind] stride for a spawned vehicle and leaves other slots untouched', () => {
    const path = makePath(
      [
        { x: 0, z: 0 },
        { x: 1, z: 0 },
      ],
      [1],
    );
    const network = createOneShotNetwork(path, [makeEdge(1, RoadTier.Highway)]);
    const sys = new TrafficSystem(createScriptedRng(oneSuccessfulTripDraws(0.99)), network);

    sys.tick({ origins: [{ x: 0, z: 0 }], destinations: [{ x: 1, z: 0 }], tickNo: 1 });

    expect(sys.vehicleBuffer[0]).toBeCloseTo(tileToWorld(0), 3);
    expect(sys.vehicleBuffer[1]).toBeCloseTo(tileToWorld(0), 3);
    // Stored heading is a Y-axis yaw for a +Z-nosed mesh: atan2(dx, dz), so
    // travel along +X (dx>0, dz=0) yaws a quarter-turn from the mesh's rest
    // orientation, i.e. PI/2.
    expect(sys.vehicleBuffer[2]).toBeCloseTo(Math.PI / 2, 6); // heading along +X
    expect(sys.vehicleBuffer[3]).toBeCloseTo((3 + 1.5 * RoadTier.Highway) * TILE_METERS, 3);
    expect(sys.vehicleBuffer[4]).toBe(VehicleKind.Bus);

    for (let slot = 1; slot < MAX_VEHICLES; slot += 1) {
      expect(sys.vehicleBuffer[slot * VEHICLE_STRIDE]).toBe(INACTIVE_VEHICLE_X);
    }
  });
});

// ---------------------------------------------------------------------------
// Trip sampling & volume
// ---------------------------------------------------------------------------

describe('TrafficSystem trip sampling', () => {
  it('does nothing when origins or destinations are empty', () => {
    let findPathCalls = 0;
    const network = createFakeNetwork(() => {
      findPathCalls += 1;
      return null;
    });
    const sys = new TrafficSystem(createSeededRng(2), network);

    sys.tick({ origins: [], destinations: [{ x: 1, z: 1 }], tickNo: 1 });
    sys.tick({ origins: [{ x: 1, z: 1 }], destinations: [], tickNo: 2 });
    sys.tick({ origins: [], destinations: [], tickNo: 3 });

    expect(findPathCalls).toBe(0);
    expect(network.addVolumeCalls).toEqual([]);
    expect(countActiveSlots(sys.vehicleBuffer)).toBe(0);
  });

  it('adds no volume and spawns nothing when the network finds no path', () => {
    const network = createFakeNetwork(() => null);
    const sys = new TrafficSystem(createSeededRng(3), network);

    sys.tick({ origins: [{ x: 0, z: 0 }], destinations: [{ x: 5, z: 5 }], tickNo: 1 });

    expect(network.addVolumeCalls).toEqual([]);
    expect(countActiveSlots(sys.vehicleBuffer)).toBe(0);
  });

  it('adds volume for each successful trip, capped at TRIPS_PER_TICK per tick', () => {
    expect(TRIPS_PER_TICK).toBe(4);

    const edges = [11, 12];
    const path = makePath(
      [
        { x: 0, z: 0 },
        { x: 5, z: 0 },
      ],
      edges,
    );
    const network = createFakeNetwork(
      () => path,
      [makeEdge(11, RoadTier.TwoLane), makeEdge(12, RoadTier.TwoLane)],
    );
    const sys = new TrafficSystem(createSeededRng(4), network);

    const origins = [
      { x: 0, z: 0 },
      { x: 1, z: 1 },
      { x: 2, z: 2 },
      { x: 3, z: 3 },
      { x: 4, z: 4 },
    ];
    const destinations = [{ x: 10, z: 10 }];

    sys.tick({ origins, destinations, tickNo: 1 });

    expect(network.addVolumeCalls.length).toBe(TRIPS_PER_TICK);
    for (const call of network.addVolumeCalls) {
      expect(call.edgeIds).toEqual(edges);
      expect(call.amount).toBe(1);
    }
  });

  it('counts volume even when the pool is full or the path has fewer than 2 points, without spawning a vehicle', () => {
    const degenerate = makePath([{ x: 3, z: 3 }], [9]);
    const network = createFakeNetwork(() => degenerate, [makeEdge(9, RoadTier.Avenue)]);
    const sys = new TrafficSystem(createSeededRng(5), network);

    sys.tick({ origins: [{ x: 3, z: 3 }], destinations: [{ x: 3, z: 3 }], tickNo: 1 });

    expect(network.addVolumeCalls.length).toBe(TRIPS_PER_TICK);
    expect(countActiveSlots(sys.vehicleBuffer)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Day-boundary decay
// ---------------------------------------------------------------------------

describe('TrafficSystem daily decay', () => {
  it('decays volumes only on tick numbers that land on a game-day boundary', () => {
    const network = createFakeNetwork(() => null);
    const sys = new TrafficSystem(createSeededRng(6), network);

    sys.tick({ origins: [], destinations: [], tickNo: 0 });
    expect(network.decayCalls).toEqual([0.5]);

    sys.tick({ origins: [], destinations: [], tickNo: 1 });
    sys.tick({ origins: [], destinations: [], tickNo: TICKS_PER_DAY - 1 });
    expect(network.decayCalls).toEqual([0.5]);

    sys.tick({ origins: [], destinations: [], tickNo: TICKS_PER_DAY });
    expect(network.decayCalls).toEqual([0.5, 0.5]);

    sys.tick({ origins: [], destinations: [], tickNo: TICKS_PER_DAY * 2 });
    expect(network.decayCalls).toEqual([0.5, 0.5, 0.5]);
  });
});

// ---------------------------------------------------------------------------
// Vehicle movement
// ---------------------------------------------------------------------------

describe('TrafficSystem vehicle movement', () => {
  it('advances a spawned vehicle along its segment at the tier-derived speed', () => {
    const points = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
    ];
    const path = makePath(points, [7]);
    const network = createOneShotNetwork(path, [makeEdge(7, RoadTier.TwoLane)]);
    const sys = new TrafficSystem(createScriptedRng(oneSuccessfulTripDraws(0.1)), network);

    sys.tick({ origins: [{ x: 0, z: 0 }], destinations: [{ x: 1, z: 0 }], tickNo: 1 });

    const startX = tileToWorld(0);
    const endX = tileToWorld(1);
    const expectedSpeed = (3 + 1.5 * RoadTier.TwoLane) * TILE_METERS; // 72 m/s

    expect(sys.vehicleBuffer[0]).toBeCloseTo(startX, 3);
    expect(sys.vehicleBuffer[1]).toBeCloseTo(tileToWorld(0), 3);
    // heading = atan2(dx, dz) -- a +Z-nosed mesh yawed to face +X travel.
    expect(sys.vehicleBuffer[2]).toBeCloseTo(Math.atan2(endX - startX, 0), 6);
    expect(sys.vehicleBuffer[3]).toBeCloseTo(expectedSpeed, 3);
    expect(sys.vehicleBuffer[4]).toBe(VehicleKind.Car);

    sys.tick({ origins: [], destinations: [], tickNo: 2 });

    const distancePerTick = expectedSpeed * DT; // 3.6 m
    expect(sys.vehicleBuffer[0]).toBeCloseTo(startX + distancePerTick, 3);
    expect(sys.vehicleBuffer[1]).toBeCloseTo(tileToWorld(0), 3);
    expect(sys.vehicleBuffer[2]).toBeCloseTo(Math.PI / 2, 6);
    expect(sys.vehicleBuffer[3]).toBeCloseTo(expectedSpeed, 3);
  });

  it('recomputes heading for each leg of a corner turn (§6.20 #3: real paths are cardinal-only -- ROADMAP §9 bans diagonal/curved road centerlines -- so a "direction change" is always an axis-aligned corner, never an arbitrary diagonal)', () => {
    const points = [
      { x: 0, z: 0 },
      { x: 1, z: 0 }, // leg 0: travel +X
      { x: 1, z: 1 }, // leg 1: travel +Z
    ];
    const path = makePath(points, [3]);
    const network = createOneShotNetwork(path, [makeEdge(3, RoadTier.TwoLane)]);
    const sys = new TrafficSystem(createScriptedRng(oneSuccessfulTripDraws(0.1)), network);

    sys.tick({ origins: [{ x: 0, z: 0 }], destinations: [{ x: 1, z: 1 }], tickNo: 1 });
    expect(sys.vehicleBuffer[2]).toBeCloseTo(Math.PI / 2, 6); // heading along +X, leg 0

    const speed = (3 + 1.5 * RoadTier.TwoLane) * TILE_METERS; // 72 m/s
    const segLen = tileToWorld(1) - tileToWorld(0); // 16m
    const perTick = speed * DT; // 3.6m
    const ticksToCross = Math.ceil(segLen / perTick) + 1; // guaranteed past the corner

    for (let t = 2; t <= 1 + ticksToCross; t += 1) {
      sys.tick({ origins: [], destinations: [], tickNo: t });
    }

    // Now on leg 1, traveling +Z: heading = atan2(dx=0, dz>0) = 0, the
    // +Z-nosed mesh's rest orientation.
    expect(sys.vehicleBuffer[2]).toBeCloseTo(0, 6);
  });

  it('advances through multiple segments of a multi-point path, carrying overshoot distance into the next segment (§6.20 #3: real tile-adjacent segments are always a full 16m tile apart, so unlike a synthetic sub-tile segment, crossing one always spans several ticks -- the overshoot-carry logic is exercised on the tick that finally crosses the boundary)', () => {
    // A straight 3-point run: collinear points survive corner smoothing
    // untouched, so the segment lengths stay exactly one 16m tile each.
    const points = [
      { x: 0, z: 0 },
      { x: 1, z: 0 }, // segment 0: travel +X, 16m
      { x: 2, z: 0 }, // segment 1: travel +X, 16m
    ];
    const path = makePath(points, [7]);
    const network = createOneShotNetwork(path, [makeEdge(7, RoadTier.TwoLane)]);
    const sys = new TrafficSystem(createScriptedRng(oneSuccessfulTripDraws(0.1)), network);

    sys.tick({ origins: [{ x: 0, z: 0 }], destinations: [{ x: 2, z: 0 }], tickNo: 1 });

    const speed = (3 + 1.5 * RoadTier.TwoLane) * TILE_METERS; // 72 m/s
    const seg0Len = tileToWorld(1) - tileToWorld(0); // 16m
    const perTick = speed * DT; // 3.6m

    // 4 advancement ticks cover 14.4m (< 16m, still on segment 0); the 5th
    // tick's 3.6m travel overshoots the remaining 1.6m into segment 1.
    for (let t = 2; t <= 5; t += 1) {
      sys.tick({ origins: [], destinations: [], tickNo: t });
    }
    const traveledBeforeCrossing = 4 * perTick; // 14.4m
    expect(traveledBeforeCrossing).toBeLessThan(seg0Len);

    sys.tick({ origins: [], destinations: [], tickNo: 6 }); // crossing tick

    const overshoot = traveledBeforeCrossing + perTick - seg0Len; // 2.0m
    expect(sys.vehicleBuffer[0]).toBeCloseTo(tileToWorld(1) + overshoot, 3);
    expect(sys.vehicleBuffer[1]).toBeCloseTo(tileToWorld(0), 3);
    expect(sys.vehicleBuffer[2]).toBeCloseTo(Math.PI / 2, 6); // still heading +X
  });
});

// ---------------------------------------------------------------------------
// Convoy breakers: corner smoothing, speed jitter, headway.
// ---------------------------------------------------------------------------

describe('smoothCorners (steering around curved corners)', () => {
  it('keeps straight polylines unchanged', () => {
    const points = [
      { x: 0, z: 0 },
      { x: 16, z: 0 },
      { x: 32, z: 0 },
    ];
    expect(smoothCorners(points)).toEqual(points);
  });

  it('replaces a 90-degree corner with an arc that never touches the corner point', () => {
    const points = [
      { x: 0, z: 0 },
      { x: 16, z: 0 },
      { x: 16, z: 16 },
    ];
    const smoothed = smoothCorners(points);
    expect(smoothed.length).toBeGreaterThan(points.length); // arc samples added
    // The raw corner point is cut — every smoothed point stays strictly
    // inside the corner (the vehicle steers around it, not through it).
    for (const p of smoothed) {
      const isCorner = Math.abs(p.x - 16) < 1e-9 && Math.abs(p.z - 0) < 1e-9;
      expect(isCorner).toBe(false);
    }
    // Endpoints survive untouched.
    expect(smoothed[0]).toEqual(points[0]);
    expect(smoothed[smoothed.length - 1]).toEqual(points[2]);
    // Heading rotates through intermediate angles: consecutive segment
    // directions include at least 3 distinct headings (entry, mid-arc, exit).
    const headings = new Set<string>();
    for (let i = 1; i < smoothed.length; i += 1) {
      const dx = smoothed[i]!.x - smoothed[i - 1]!.x;
      const dz = smoothed[i]!.z - smoothed[i - 1]!.z;
      headings.add(Math.atan2(dx, dz).toFixed(3));
    }
    expect(headings.size).toBeGreaterThanOrEqual(3);
  });
});

describe('speed jitter + headway (anti-convoy)', () => {
  it('per-vehicle speed varies across spawns within the jitter band', () => {
    const path = makePath(
      Array.from({ length: 50 }, (_, i) => ({ x: i, z: 0 })),
      [1],
    );
    const network = createFakeNetwork(() => path, [makeEdge(1, RoadTier.TwoLane, 200)]);
    const sys = new TrafficSystem(createSeededRng(7), network);
    for (let t = 1; t <= 4; t += 1) {
      sys.tick({ origins: [{ x: 0, z: 0 }], destinations: [{ x: 49, z: 0 }], tickNo: t });
    }
    const base = (3 + 1.5 * RoadTier.TwoLane) * TILE_METERS;
    const speeds = new Set<number>();
    for (let slot = 0; slot < MAX_VEHICLES; slot += 1) {
      const base5 = slot * VEHICLE_STRIDE;
      if (sys.vehicleBuffer[base5] === INACTIVE_VEHICLE_X) continue;
      const speed = sys.vehicleBuffer[base5 + 3]!;
      expect(speed).toBeGreaterThanOrEqual(base * SPEED_JITTER_MIN - 1e-9);
      expect(speed).toBeLessThanOrEqual(base * (SPEED_JITTER_MIN + SPEED_JITTER_SPAN) + 1e-9);
      speeds.add(speed);
    }
    expect(speeds.size).toBeGreaterThan(1); // no lockstep
  });

  it('vehicles sharing a straight route never ride bumper-to-bumper', () => {
    const path = makePath(
      Array.from({ length: 40 }, (_, i) => ({ x: i, z: 0 })),
      [1],
    );
    const network = createFakeNetwork(() => path, [makeEdge(1, RoadTier.TwoLane, 200)]);
    const sys = new TrafficSystem(createSeededRng(3), network);
    // Spawn a batch, then advance many ticks; measure pairwise center-to-center
    // gaps along the shared straight route on every tick.
    for (let t = 1; t <= 3; t += 1) {
      sys.tick({ origins: [{ x: 0, z: 0 }], destinations: [{ x: 39, z: 0 }], tickNo: t });
    }
    // The steady-state guarantee is MIN_HEADWAY_M; a same-tick double segment
    // entry can transiently dip below by one tick's worth of speed-jitter
    // spread, so the hard floor sits just under it — still well above a 4m
    // car length (never touching).
    const floor = MIN_HEADWAY_M - 1.2;
    for (let t = 4; t <= 40; t += 1) {
      sys.tick({ origins: [], destinations: [], tickNo: t });
      const positions: number[] = [];
      for (let slot = 0; slot < MAX_VEHICLES; slot += 1) {
        const base5 = slot * VEHICLE_STRIDE;
        if (sys.vehicleBuffer[base5] === INACTIVE_VEHICLE_X) continue;
        positions.push(sys.vehicleBuffer[base5]!);
      }
      positions.sort((a, b) => a - b);
      for (let i = 1; i < positions.length; i += 1) {
        expect(positions[i]! - positions[i - 1]!).toBeGreaterThanOrEqual(floor);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Slot pool management
// ---------------------------------------------------------------------------

describe('TrafficSystem vehicle slot pool', () => {
  it('frees a vehicle slot exactly when its path completes, then reuses it for the next spawn', () => {
    const points = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
    ];
    const path = makePath(points, [7]);
    let calls = 0;
    // Exactly the first trip of tick 1 (call 1) and the first trip of the
    // next non-empty tick (call TRIPS_PER_TICK + 1) succeed; every other
    // sampled trip (in either tick) fails, matching the draw budget below.
    const network = createFakeNetwork(() => {
      calls += 1;
      return calls === 1 || calls === TRIPS_PER_TICK + 1 ? path : null;
    }, [makeEdge(7, RoadTier.TwoLane)]);
    const rng = createScriptedRng([...oneSuccessfulTripDraws(0.1), ...oneSuccessfulTripDraws(0.1)]);
    const sys = new TrafficSystem(rng, network);

    const origin = { x: 0, z: 0 };
    const destination = { x: 1, z: 0 };

    sys.tick({ origins: [origin], destinations: [destination], tickNo: 1 }); // spawn #1 -> slot 0
    expect(sys.vehicleBuffer[0]).not.toBe(INACTIVE_VEHICLE_X);

    // segment length 16m at 72 m/s -> 3.6m/tick -> completes on the 5th advancement tick.
    for (let t = 2; t <= 5; t += 1) {
      sys.tick({ origins: [], destinations: [], tickNo: t });
    }
    expect(sys.vehicleBuffer[0]).not.toBe(INACTIVE_VEHICLE_X); // still en route (14.4m of 16m)

    sys.tick({ origins: [], destinations: [], tickNo: 6 }); // 5th advancement -> completes
    expect(sys.vehicleBuffer[0]).toBe(INACTIVE_VEHICLE_X);
    expect(sys.vehicleBuffer[1]).toBe(0);
    expect(sys.vehicleBuffer[2]).toBe(0);
    expect(sys.vehicleBuffer[3]).toBe(0);
    expect(sys.vehicleBuffer[4]).toBe(0);

    sys.tick({ origins: [origin], destinations: [destination], tickNo: 7 }); // spawn #2 -> reuses slot 0
    expect(sys.vehicleBuffer[0]).toBeCloseTo(tileToWorld(0), 3);
    expect(sys.vehicleBuffer[4]).toBe(VehicleKind.Car);
    expect(countActiveSlots(sys.vehicleBuffer)).toBe(1);
  });

  it('skips spawning once the pool is full but keeps counting volume', () => {
    // MANY-LANE fixture: each origin row gets its own long cardinally-adjacent
    // corridor (100 tiles = 1600m), so spawn-time headway (which limits how
    // densely one departure segment can emit) never starves the pool — trips
    // spread across lanes. No vehicle completes within this test's budget.
    const laneFor = (from: TilePoint): PathResult =>
      makePath(
        Array.from({ length: 101 }, (_, i) => ({ x: i, z: from.z })),
        [1],
      );
    // A big edge length keeps the density cap at MAX_VEHICLES, so
    // this test still exercises the hard slot-pool ceiling (not the density
    // cap -- see the dedicated small-network density-cap test below).
    const network = createFakeNetwork(
      (from) => laneFor(from),
      [makeEdge(1, RoadTier.TwoLane, MAX_VEHICLES * 3)],
    );
    const sys = new TrafficSystem(createSeededRng(42), network);

    const origins = Array.from({ length: 64 }, (_, k) => ({ x: 0, z: k }));
    const destinations = Array.from({ length: 64 }, (_, k) => ({ x: 100, z: k }));

    // Saturate: spawn until the fixed slot pool is exhausted.
    let t = 1;
    for (; t <= 400 && countActiveSlots(sys.vehicleBuffer) < MAX_VEHICLES; t += 1) {
      sys.tick({ origins, destinations, tickNo: t });
    }
    expect(countActiveSlots(sys.vehicleBuffer)).toBe(MAX_VEHICLES);
    expect(network.addVolumeCalls.length).toBe((t - 1) * TRIPS_PER_TICK);

    const volumeCallsBefore = network.addVolumeCalls.length;
    sys.tick({ origins, destinations, tickNo: t });

    expect(countActiveSlots(sys.vehicleBuffer)).toBe(MAX_VEHICLES); // unchanged: pool stays full
    expect(network.addVolumeCalls.length).toBe(volumeCallsBefore + TRIPS_PER_TICK); // still counted
  });

  it('caps concurrent cosmetic vehicles well below MAX_VEHICLES for a small road network (§6.20 #2 density cap)', () => {
    const laneFor = (from: TilePoint): PathResult =>
      makePath(
        Array.from({ length: 101 }, (_, i) => ({ x: i, z: from.z })),
        [1],
      );
    // A tiny network (20 road tiles) -> vehicleDensityCap(20) clamps to the
    // documented floor, VEHICLE_DENSITY_MIN_CAP, well under MAX_VEHICLES.
    const network = createFakeNetwork((from) => laneFor(from), [makeEdge(1, RoadTier.TwoLane, 20)]);
    const sys = new TrafficSystem(createSeededRng(99), network);

    const expectedCap = vehicleDensityCap(20);
    expect(expectedCap).toBe(VEHICLE_DENSITY_MIN_CAP);
    expect(expectedCap).toBeLessThan(MAX_VEHICLES);

    const origins = Array.from({ length: 10 }, (_, k) => ({ x: 0, z: k }));
    const destinations = Array.from({ length: 10 }, (_, k) => ({ x: 100, z: k }));
    const ticksToExceedCap = 40;

    for (let t = 1; t <= ticksToExceedCap; t += 1) {
      sys.tick({ origins, destinations, tickNo: t });
    }

    expect(countActiveSlots(sys.vehicleBuffer)).toBe(expectedCap);
    // Volume keeps accruing beyond the cosmetic cap -- the statistical
    // volume model is untouched by the cap.
    expect(network.addVolumeCalls.length).toBe(ticksToExceedCap * TRIPS_PER_TICK);
  });
});

// ---------------------------------------------------------------------------
// Density cap: pure-function unit tests.
// ---------------------------------------------------------------------------

describe('vehicleDensityCap (§6.20 #2 pure density-cap function)', () => {
  it('clamps to VEHICLE_DENSITY_MIN_CAP for a tiny or empty road network', () => {
    expect(vehicleDensityCap(0)).toBe(VEHICLE_DENSITY_MIN_CAP);
    expect(vehicleDensityCap(10)).toBe(VEHICLE_DENSITY_MIN_CAP);
  });

  it('scales proportionally to road tile count once it exceeds the floor', () => {
    expect(vehicleDensityCap(200)).toBe(Math.round(200 * VEHICLES_PER_ROAD_TILE));
    expect(vehicleDensityCap(500)).toBe(Math.round(500 * VEHICLES_PER_ROAD_TILE));
  });

  it('clamps to MAX_VEHICLES for a huge road network', () => {
    expect(vehicleDensityCap(1_000_000)).toBe(MAX_VEHICLES);
  });

  it('is monotonically non-decreasing in road tile count', () => {
    let prev = vehicleDensityCap(0);
    for (let n = 1; n <= 2000; n += 37) {
      const next = vehicleDensityCap(n);
      expect(next).toBeGreaterThanOrEqual(prev);
      prev = next;
    }
  });
});

// ---------------------------------------------------------------------------
// On-road guarantee: pure-function unit tests.
// ---------------------------------------------------------------------------

describe('isCardinallyAdjacent / truncateToAdjacentChain (§6.20 #3 on-road guarantee)', () => {
  it('is true only for single-tile N/E/S/W steps', () => {
    expect(isCardinallyAdjacent({ x: 0, z: 0 }, { x: 1, z: 0 })).toBe(true);
    expect(isCardinallyAdjacent({ x: 0, z: 0 }, { x: -1, z: 0 })).toBe(true);
    expect(isCardinallyAdjacent({ x: 0, z: 0 }, { x: 0, z: 1 })).toBe(true);
    expect(isCardinallyAdjacent({ x: 0, z: 0 }, { x: 0, z: -1 })).toBe(true);
  });

  it('is false for diagonal, same-tile, or multi-tile jumps', () => {
    expect(isCardinallyAdjacent({ x: 0, z: 0 }, { x: 1, z: 1 })).toBe(false); // diagonal
    expect(isCardinallyAdjacent({ x: 0, z: 0 }, { x: 0, z: 0 })).toBe(false); // same tile
    expect(isCardinallyAdjacent({ x: 0, z: 0 }, { x: 2, z: 0 })).toBe(false); // 2-tile jump
    expect(isCardinallyAdjacent({ x: 0, z: 0 }, { x: 3, z: 4 })).toBe(false); // far diagonal
  });

  it('returns the whole chain unchanged when every step is cardinally adjacent', () => {
    const points = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 2, z: 0 },
      { x: 2, z: 1 },
    ];
    expect(truncateToAdjacentChain(points)).toEqual(points);
  });

  it('truncates at the first non-adjacent seam', () => {
    const points = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 5, z: 5 }, // seam
      { x: 6, z: 5 },
    ];
    expect(truncateToAdjacentChain(points)).toEqual([
      { x: 0, z: 0 },
      { x: 1, z: 0 },
    ]);
  });

  it('handles empty and single-point inputs', () => {
    expect(truncateToAdjacentChain([])).toEqual([]);
    expect(truncateToAdjacentChain([{ x: 3, z: 3 }])).toEqual([{ x: 3, z: 3 }]);
  });
});

// ---------------------------------------------------------------------------
// Vehicle kind distribution
// ---------------------------------------------------------------------------

describe('TrafficSystem vehicle kind mix', () => {
  function spawnOneVehicleWithKindRoll(kindRoll: number): number {
    const path = makePath(
      [
        { x: 0, z: 0 },
        { x: 1, z: 0 },
      ],
      [1],
    );
    const network = createOneShotNetwork(path, [makeEdge(1, RoadTier.TwoLane)]);
    const sys = new TrafficSystem(createScriptedRng(oneSuccessfulTripDraws(kindRoll)), network);
    sys.tick({ origins: [{ x: 0, z: 0 }], destinations: [{ x: 1, z: 0 }], tickNo: 1 });
    const kind = sys.vehicleBuffer[4];
    if (kind === undefined) throw new Error('expected a spawned vehicle at slot 0');
    return kind;
  }

  it.each<[number, number]>([
    [0, VehicleKind.Car],
    [0.4, VehicleKind.Car],
    [0.79999, VehicleKind.Car],
    [0.8, VehicleKind.Truck],
    [0.9, VehicleKind.Truck],
    [0.94999, VehicleKind.Truck],
    [0.95, VehicleKind.Bus],
    [0.999999, VehicleKind.Bus],
  ])('buckets a kind roll of %f as vehicle kind %i', (roll, expectedKind) => {
    expect(spawnOneVehicleWithKindRoll(roll)).toBe(expectedKind);
  });
});

// ---------------------------------------------------------------------------
// One-way roads: cosmetic
// vehicles and volume assignment inherit directed edges automatically from
// RoadNetworkApi.findPath — TrafficSystem itself needs no direction-aware
// code, so these are integration regressions against a *real* RoadNetwork.
// ---------------------------------------------------------------------------

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

describe('TrafficSystem over a real one-way RoadNetwork', () => {
  it('routes a trip forward along a one-way road and assigns volume to it', () => {
    const size = 12;
    const g = makeGrid(size);
    for (const x of [2, 3, 4, 5, 6]) g.roadTier[z(size, x, 5)] = RoadTier.OneWay;

    const network = new RoadNetwork();
    network.rebuild(g);

    // A single reachable origin/destination pair. Traffic now alternates trip
    // direction (home->work / work->home) for two-way flow, so of the
    // TRIPS_PER_TICK sampled trips the forward (with-flow) half succeed and the
    // reversed half are blocked by the one-way — hence volume TRIPS_PER_TICK/2.
    const sys = new TrafficSystem(createSeededRng(11), network);
    sys.tick({ origins: [{ x: 2, z: 5 }], destinations: [{ x: 6, z: 5 }], tickNo: 1 });

    const edge = network.getEdges()[0]!;
    expect(edge.tier).toBe(RoadTier.OneWay);
    expect(edge.volume).toBe(TRIPS_PER_TICK / 2);

    // The first (forward, i=0) trip's vehicle sits at slot 0, travelling
    // forward (increasing x) along the one-way flow direction — at most a
    // spawn-stagger offset (< 8 m) past its origin point.
    expect(sys.vehicleBuffer[0]).toBeGreaterThanOrEqual(tileToWorld(2));
    expect(sys.vehicleBuffer[0]).toBeLessThan(tileToWorld(2) + 8.001);
    expect(sys.vehicleBuffer[2]).toBeCloseTo(Math.PI / 2, 6); // heading along +X
  });

  it('alternating trip direction fills a two-way road with vehicles heading BOTH ways (not a one-way convoy)', () => {
    const size = 12;
    const g = makeGrid(size);
    for (const x of [2, 3, 4, 5, 6]) g.roadTier[z(size, x, 5)] = RoadTier.TwoLane;

    const network = new RoadNetwork();
    network.rebuild(g);

    const sys = new TrafficSystem(createSeededRng(11), network);
    sys.tick({ origins: [{ x: 2, z: 5 }], destinations: [{ x: 6, z: 5 }], tickNo: 1 });

    const headings: number[] = [];
    for (let slot = 0; slot < MAX_VEHICLES; slot += 1) {
      const base = slot * VEHICLE_STRIDE;
      if (sys.vehicleBuffer[base] !== INACTIVE_VEHICLE_X)
        headings.push(sys.vehicleBuffer[base + 2]!);
    }
    expect(headings.length).toBeGreaterThan(1);
    // Forward trips head +X (atan2(+,0)=+π/2); reversed trips head -X (-π/2).
    expect(headings.some((h) => Math.abs(h - Math.PI / 2) < 1e-6)).toBe(true);
    expect(headings.some((h) => Math.abs(h + Math.PI / 2) < 1e-6)).toBe(true);
  });

  it('a one-way edge routes only in its flow direction (against-flow finds no route)', () => {
    const size = 12;
    const g = makeGrid(size);
    for (const x of [2, 3, 4, 5, 6]) g.roadTier[z(size, x, 5)] = RoadTier.OneWay;

    const network = new RoadNetwork();
    network.rebuild(g);

    // Direct routing check, independent of trip-direction alternation: with the
    // flow routes, against it does not.
    expect(network.findPath({ x: 2, z: 5 }, { x: 6, z: 5 })).not.toBeNull();
    expect(network.findPath({ x: 6, z: 5 }, { x: 2, z: 5 })).toBeNull();
  });

  it('always routes a chain of cardinally-adjacent tiles, including across a corner turn (§6.20 #3 on-road guarantee)', () => {
    const size = 12;
    const g = makeGrid(size);
    for (const x of [2, 3, 4, 5, 6]) g.roadTier[z(size, x, 5)] = RoadTier.TwoLane;
    for (const zCoord of [5, 6, 7]) g.roadTier[z(size, 6, zCoord)] = RoadTier.TwoLane;

    const network = new RoadNetwork();
    network.rebuild(g);

    const path = network.findPath({ x: 2, z: 5 }, { x: 6, z: 7 });
    expect(path).not.toBeNull();
    const points = path!.points;
    expect(points.length).toBeGreaterThan(1);
    for (let i = 1; i < points.length; i += 1) {
      expect(isCardinallyAdjacent(points[i - 1]!, points[i]!)).toBe(true);
    }
  });

  function z(size: number, x: number, zCoord: number): number {
    return zCoord * size + x;
  }
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('TrafficSystem determinism', () => {
  it('produces identical vehicle buffers and network calls for two runs sharing a seed', () => {
    const buildNetwork = () =>
      createFakeNetwork(
        () =>
          makePath(
            [
              { x: 0, z: 0 },
              { x: 1, z: 0 }, // cardinally-adjacent corner, not a diagonal jump
              { x: 1, z: 1 },
            ],
            [1, 2],
          ),
        [makeEdge(1, RoadTier.Avenue), makeEdge(2, RoadTier.TwoLane)],
      );

    const origins: TilePoint[] = [
      { x: 0, z: 0 },
      { x: 1, z: 2 },
      { x: 3, z: 3 },
    ];
    const destinations: TilePoint[] = [
      { x: 8, z: 8 },
      { x: 9, z: 1 },
    ];

    const networkA = buildNetwork();
    const networkB = buildNetwork();
    const sysA = new TrafficSystem(createSeededRng(2026), networkA);
    const sysB = new TrafficSystem(createSeededRng(2026), networkB);

    for (let t = 0; t <= TICKS_PER_DAY + 10; t += 1) {
      sysA.tick({ origins, destinations, tickNo: t });
      sysB.tick({ origins, destinations, tickNo: t });
    }

    expect(Array.from(sysA.vehicleBuffer)).toEqual(Array.from(sysB.vehicleBuffer));
    expect(networkA.addVolumeCalls).toEqual(networkB.addVolumeCalls);
    expect(networkA.decayCalls).toEqual(networkB.decayCalls);
    expect(networkA.addVolumeCalls.length).toBeGreaterThan(0);
    expect(networkA.decayCalls.length).toBeGreaterThan(0);
  });

  it('produces different sampling for two runs with different seeds', () => {
    // Enough distinct origins that different seeds are overwhelmingly likely to diverge.
    const origins: TilePoint[] = Array.from({ length: 50 }, (_, i) => ({ x: i, z: 0 }));
    const destinations: TilePoint[] = [{ x: 0, z: 0 }];

    // A cardinally-adjacent one-tile hop anchored at whichever origin was
    // sampled (`to` can't be used directly here since it's fixed
    // at (0,0) and rarely adjacent to `from`).
    const buildNetwork = () =>
      createFakeNetwork((from) => makePath([from, { x: from.x + 1, z: from.z }], []), []);

    const sysA = new TrafficSystem(createSeededRng(1), buildNetwork());
    const sysB = new TrafficSystem(createSeededRng(2), buildNetwork());

    for (let t = 1; t <= 5; t += 1) {
      sysA.tick({ origins, destinations, tickNo: t });
      sysB.tick({ origins, destinations, tickNo: t });
    }

    expect(Array.from(sysA.vehicleBuffer)).not.toEqual(Array.from(sysB.vehicleBuffer));
  });
});

describe('trip-volume model (people + work rhythm)', () => {
  it('dayHourFromTick maps tick 0 to the 9:00 clock start and wraps over the visual day', () => {
    expect(dayHourFromTick(0)).toBeCloseTo(9, 6);
    expect(dayHourFromTick(2400)).toBeCloseTo(9, 6); // one visual day later
    expect(dayHourFromTick(2300)).toBeCloseTo(8, 6); // 100 ticks before the 9:00 start -> 08:00
  });

  it('rushHourActivity peaks at the morning and evening commutes and bottoms out overnight', () => {
    const morning = rushHourActivity(8);
    const evening = rushHourActivity(17.5);
    const night = rushHourActivity(3);
    const midday = rushHourActivity(13);
    expect(morning).toBeCloseTo(1, 5);
    expect(evening).toBeGreaterThan(0.95);
    expect(night).toBeCloseTo(NIGHT_ACTIVITY_FLOOR, 6);
    expect(midday).toBeGreaterThan(night);
    expect(midday).toBeLessThan(morning);
    for (let h = 0; h < 24; h += 0.5) {
      const a = rushHourActivity(h);
      expect(a).toBeGreaterThanOrEqual(NIGHT_ACTIVITY_FLOOR - 1e-9);
      expect(a).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('tripsForTick keeps a population-independent baseline at rush hour, adds more for a big city, and drops to 0 overnight', () => {
    // Morning peak (activity 1): baseline at pop 0, saturating to BASE+SPAN.
    expect(tripsForTick(0, 2300)).toBe(BASE_TRIPS_PER_TICK); // lone active town still has commuters
    expect(tripsForTick(POP_FULL_TRAFFIC, 2300)).toBe(BASE_TRIPS_PER_TICK + POP_TRIPS_SPAN); // full city
    expect(tripsForTick(POP_FULL_TRAFFIC, 2300)).toBeGreaterThan(tripsForTick(0, 2300));
    // 03:00 -> essentially no new trips, whatever the size.
    expect(tripsForTick(0, 1800)).toBe(0);
    expect(tripsForTick(POP_FULL_TRAFFIC, 1800)).toBe(0);
    // Deterministic.
    expect(tripsForTick(800, 2300)).toBe(tripsForTick(800, 2300));
  });

  it('generates far more trips at a rush-hour tick than an overnight tick for the same city', () => {
    const path = makePath(
      [
        { x: 0, z: 0 },
        { x: 1, z: 0 },
      ],
      [11],
    );
    const origins = [{ x: 0, z: 0 }];
    const destinations = [{ x: 1, z: 0 }];

    const rushNet = createFakeNetwork(() => path, [makeEdge(11, RoadTier.TwoLane)]);
    const rushSys = new TrafficSystem(createSeededRng(7), rushNet);
    rushSys.tick({ origins, destinations, tickNo: 2300, population: POP_FULL_TRAFFIC }); // 08:00

    const nightNet = createFakeNetwork(() => path, [makeEdge(11, RoadTier.TwoLane)]);
    const nightSys = new TrafficSystem(createSeededRng(7), nightNet);
    nightSys.tick({ origins, destinations, tickNo: 1800, population: POP_FULL_TRAFFIC }); // 03:00

    expect(rushNet.addVolumeCalls.length).toBe(tripsForTick(POP_FULL_TRAFFIC, 2300));
    expect(nightNet.addVolumeCalls.length).toBe(0);
    expect(rushNet.addVolumeCalls.length).toBeGreaterThan(nightNet.addVolumeCalls.length);
  });

  it('falls back to TRIPS_PER_TICK when no population is supplied (test-double contract)', () => {
    const path = makePath(
      [
        { x: 0, z: 0 },
        { x: 1, z: 0 },
      ],
      [11],
    );
    const network = createFakeNetwork(() => path, [makeEdge(11, RoadTier.TwoLane)]);
    const sys = new TrafficSystem(createSeededRng(3), network);
    sys.tick({ origins: [{ x: 0, z: 0 }], destinations: [{ x: 1, z: 0 }], tickNo: 1 });
    expect(network.addVolumeCalls.length).toBe(TRIPS_PER_TICK);
  });
});
