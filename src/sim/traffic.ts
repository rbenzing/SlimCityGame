/**
 * SlimCity traffic system.
 *
 * Statistical trip assignment, not per-agent simulation: each tick a handful
 * of (origin, destination) pairs are sampled and routed once over the
 * injected road network. A successful route contributes volume to its edges
 * (congestion/land-value feed off that elsewhere) and — purely for visual
 * flavor — claims a slot in a fixed cosmetic-vehicle pool that is animated
 * along the same route until it arrives.
 *
 * src/shared/types.ts does not export an `Rng` type, so it is declared
 * locally below. Any concrete RNG built to that shape (e.g. a future
 * src/core/rng.ts) is structurally assignable here without changes.
 */
import type { GraphEdge, RoadNetworkApi, TilePoint } from '../shared/types';
import {
  INACTIVE_VEHICLE_X,
  MAX_VEHICLES,
  RoadTier,
  VEHICLE_STRIDE,
  VehicleKind,
} from '../shared/types';
import { TICKS_PER_DAY, TICK_RATE, TILE_METERS, tileToWorld } from '../shared/constants';

/** Seeded random source, injected — see project rule: never Math.random/Date.now. */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** Uniform float in [a, b). */
  range(a: number, b: number): number;
  /** An independent, deterministic child stream. */
  fork(streamId: number): Rng;
}

/** Trips sampled from the origin/destination lists per tick. */
export const TRIPS_PER_TICK = 4;

/**
 * Per-trip edge-cost jitter amplitude. A grid has many equal-cost routes
 * between two points; a deterministic A* tie-breaks them the SAME way every
 * time, so every trip funnels onto one path and the cosmetic vehicles line up
 * nose-to-tail (the "snake"). A small per-trip cost jitter (stable within a
 * trip, varied across trips) makes different trips prefer different parallel
 * streets, spreading traffic across the network. The jitter seed is a pure
 * hash of the trip's origin/destination — deterministic, and it consumes NO
 * RNG draw so the sim's seeded RNG sequence is unchanged.
 */
const ROUTE_JITTER = 0.35;

/** 32-bit avalanche mix of two integers (murmur3-style finalizer) -> [0,1). Pure & deterministic. */
function hash2Unit(a: number, b: number): number {
  let h = (a ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ b, 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return (h >>> 0) / 0xffffffff;
}

/** Deterministic per-trip seed from its origin/destination tiles (no RNG draw). */
function tripSeed(from: TilePoint, to: TilePoint): number {
  let h = (from.x * 73856093) >>> 0;
  h = (h ^ Math.imul(from.z, 19349663)) >>> 0;
  h = (h ^ Math.imul(to.x, 83492791)) >>> 0;
  h = (h ^ Math.imul(to.z, 1266122987)) >>> 0;
  return h >>> 0;
}

/** Fixed sim timestep in seconds (TICK_RATE ticks/sec). */
const TICK_SECONDS = 1 / TICK_RATE;

/** Cosmetic vehicle cruise speed model: tiles/second = BASE + TIER_FACTOR * avgEdgeTier. */
const VEHICLE_BASE_SPEED_TILES = 3;
const VEHICLE_TIER_SPEED_TILES = 1.5;

/** Cosmetic vehicle-kind mix: [0, CAR_SHARE) Car, [CAR_SHARE, TRUCK_SHARE_CEILING) Truck, rest Bus. */
const CAR_SHARE = 0.8;
const TRUCK_SHARE_CEILING = 0.95;

/** Edge-volume half-life applied once per game day. */
const DAILY_DECAY_FACTOR = 0.5;

// ---------------------------------------------------------------------------
// On-road guarantee: a cosmetic vehicle's animation path must only
// ever step between cardinally-adjacent road tiles, or the straight-line lerp
// between two points (render/vehicles.ts) would visibly cut across grass/
// water. RoadNetworkApi is an injected dependency (see the module doc
// comment above) -- traffic.ts cannot assume every implementation upholds
// this on its own (the real src/world/roads.ts one does, by construction:
// PathResult.points concatenates each edge's own `tiles`, which are always a
// straight run of cardinally-adjacent tiles because road centerlines are
// never diagonal or curved), so it defensively truncates any spawned
// path to its longest cardinally-adjacent prefix before animating it.
// ---------------------------------------------------------------------------

/** True when `a` and `b` are exactly one cardinal (N/E/S/W) tile step apart. */
export function isCardinallyAdjacent(a: TilePoint, b: TilePoint): boolean {
  const dx = Math.abs(a.x - b.x);
  const dz = Math.abs(a.z - b.z);
  return (dx === 1 && dz === 0) || (dx === 0 && dz === 1);
}

/**
 * Returns the longest prefix of `points` that forms an unbroken chain of
 * cardinally-adjacent tiles, starting from `points[0]`. A network response
 * that ever produces a non-adjacent seam (e.g. a bad injected
 * RoadNetworkApi) gets its cosmetic animation dropped at that seam rather
 * than jumping/cutting across non-road terrain.
 */
export function truncateToAdjacentChain(points: readonly TilePoint[]): TilePoint[] {
  if (points.length === 0) return [];
  const out: TilePoint[] = [points[0]!];
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    if (!isCardinallyAdjacent(prev, curr)) break;
    out.push(curr);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Density cap: caps concurrent COSMETIC vehicles as a function of
// the live road network's size, so a tiny town's handful of road tiles can
// never saturate the whole MAX_VEHICLES pool into a visual gridlock. The
// statistical volume model (RoadNetworkApi.addVolume) is untouched by this
// cap -- it is applied before the cap check, exactly like the pre-existing
// "pool full" skip path, so volume keeps accruing even when the cosmetic
// spawn itself is skipped.
// ---------------------------------------------------------------------------

/** Concurrent-vehicle cap floor, regardless of how small the road network is. */
export const VEHICLE_DENSITY_MIN_CAP = 24;
/** Concurrent cosmetic vehicles allowed per live road tile, before clamping. */
export const VEHICLES_PER_ROAD_TILE = 0.5;

/**
 * Pure: the concurrent cosmetic-vehicle cap for a network with
 * `roadTileCount` live road tiles -- proportional to network size, clamped
 * to [VEHICLE_DENSITY_MIN_CAP, MAX_VEHICLES] so it never drops below a small
 * town's minimum nor exceeds the fixed pool.
 */
export function vehicleDensityCap(roadTileCount: number): number {
  const proportional = Math.round(roadTileCount * VEHICLES_PER_ROAD_TILE);
  return Math.min(MAX_VEHICLES, Math.max(VEHICLE_DENSITY_MIN_CAP, proportional));
}

/** Sums each edge's tile-length -- an approximation of live road tile count. */
function countRoadTiles(edges: readonly GraphEdge[]): number {
  let total = 0;
  for (const edge of edges) total += edge.length;
  return total;
}

type VehicleKindValue = (typeof VehicleKind)[keyof typeof VehicleKind];

interface WorldPoint {
  readonly x: number;
  readonly z: number;
}

/** A live cosmetic vehicle occupying one slot of the fixed pool. */
interface ActiveVehicle {
  readonly points: readonly WorldPoint[];
  /** points.length - 1 precomputed Euclidean segment lengths, in meters. */
  readonly segmentLengths: readonly number[];
  segIndex: number;
  /** Meters traveled into the current segment. */
  distanceIntoSegment: number;
  readonly speedMps: number;
  readonly kind: VehicleKindValue;
}

export class TrafficSystem {
  /** MAX_VEHICLES * VEHICLE_STRIDE floats, slot-stable across ticks. */
  readonly vehicleBuffer: Float32Array;

  private readonly rng: Rng;
  private readonly network: RoadNetworkApi;
  private readonly slots: Array<ActiveVehicle | null>;
  /** Stack of free slot indices; push/pop gives O(1) alloc & free. */
  private readonly freeSlots: number[] = [];

  constructor(rng: Rng, network: RoadNetworkApi) {
    this.rng = rng;
    this.network = network;
    this.vehicleBuffer = new Float32Array(MAX_VEHICLES * VEHICLE_STRIDE);
    this.slots = new Array<ActiveVehicle | null>(MAX_VEHICLES).fill(null);

    // All slots start inactive; push in descending order so slot 0 is
    // allocated first (stack pop takes the last-pushed index).
    for (let slot = MAX_VEHICLES - 1; slot >= 0; slot -= 1) {
      this.freeSlots.push(slot);
      this.vehicleBuffer[slot * VEHICLE_STRIDE] = INACTIVE_VEHICLE_X;
    }
  }

  tick(input: { origins: TilePoint[]; destinations: TilePoint[]; tickNo: number }): void {
    const { origins, destinations, tickNo } = input;

    if (tickNo % TICKS_PER_DAY === 0) {
      this.network.decayVolumes(DAILY_DECAY_FACTOR);
    }

    this.advanceVehicles();
    this.sampleTrips(origins, destinations);
  }

  private activeVehicleCount(): number {
    return MAX_VEHICLES - this.freeSlots.length;
  }

  private sampleTrips(origins: TilePoint[], destinations: TilePoint[]): void {
    if (origins.length === 0 || destinations.length === 0) return;

    // Lazily built (and cached for the rest of this tick) only if a route
    // that actually needs a cosmetic vehicle is found.
    let edgeTiers: Map<number, RoadTier> | null = null;
    // Also lazy: getEdges() is only worth calling once we know a spawn is
    // actually being considered this tick.
    let densityCap: number | null = null;

    for (let i = 0; i < TRIPS_PER_TICK; i += 1) {
      const origin = origins[this.rng.int(origins.length)];
      const dest = destinations[this.rng.int(destinations.length)];
      if (origin === undefined || dest === undefined) continue;

      // Alternate trip direction so roads carry BOTH flows (home->work and
      // work->home), not a one-way stream.
      const reverse = i % 2 === 1;
      const from = reverse ? dest : origin;
      const to = reverse ? origin : dest;

      // Per-trip cost jitter (stable within this trip via its OD-hash seed) so
      // this trip picks its own route among the grid's equal-cost alternatives.
      const seed = tripSeed(from, to);
      const path = this.network.findPath(
        from,
        to,
        (edge) => 1 + ROUTE_JITTER * hash2Unit(edge.id, seed),
      );
      if (path === null) continue;

      this.network.addVolume(path.edges, 1);

      const animPoints = truncateToAdjacentChain(path.points);
      if (animPoints.length < 2) continue; // nothing to animate (degenerate, or the chain broke immediately)

      if (densityCap === null) {
        densityCap = vehicleDensityCap(countRoadTiles(this.network.getEdges()));
      }
      if (this.activeVehicleCount() >= densityCap) continue; // density cap reached; volume already counted above

      if (edgeTiers === null) {
        edgeTiers = new Map();
        for (const edge of this.network.getEdges()) edgeTiers.set(edge.id, edge.tier);
      }
      this.spawnVehicle(animPoints, path.edges, edgeTiers);
    }
  }

  private spawnVehicle(
    animPoints: readonly TilePoint[],
    edgeIds: number[],
    edgeTiers: Map<number, RoadTier>,
  ): void {
    const slot = this.freeSlots.pop();
    if (slot === undefined) return; // pool full: volume already counted, skip cosmetic spawn

    const points: WorldPoint[] = animPoints.map((p) => ({
      x: tileToWorld(p.x),
      z: tileToWorld(p.z),
    }));

    const segmentLengths: number[] = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i]!;
      const b = points[i + 1]!;
      segmentLengths.push(Math.hypot(b.x - a.x, b.z - a.z));
    }

    const speedMps = this.averageTierSpeedMps(edgeIds, edgeTiers);

    const kindRoll = this.rng.next();
    const kind: VehicleKindValue =
      kindRoll < CAR_SHARE
        ? VehicleKind.Car
        : kindRoll < TRUCK_SHARE_CEILING
          ? VehicleKind.Truck
          : VehicleKind.Bus;

    const vehicle: ActiveVehicle = {
      points,
      segmentLengths,
      segIndex: 0,
      distanceIntoSegment: 0,
      speedMps,
      kind,
    };
    this.slots[slot] = vehicle;
    this.writeSlot(slot, vehicle);
  }

  /** tiles/second = BASE + TIER_FACTOR * avgEdgeTier, converted to m/s via TILE_METERS. */
  private averageTierSpeedMps(edgeIds: number[], edgeTiers: Map<number, RoadTier>): number {
    let tierSum = 0;
    let tierCount = 0;
    for (const edgeId of edgeIds) {
      const tier = edgeTiers.get(edgeId);
      if (tier !== undefined) {
        tierSum += tier;
        tierCount += 1;
      }
    }
    const avgTier = tierCount > 0 ? tierSum / tierCount : RoadTier.TwoLane;
    const tilesPerSecond = VEHICLE_BASE_SPEED_TILES + VEHICLE_TIER_SPEED_TILES * avgTier;
    return tilesPerSecond * TILE_METERS;
  }

  private advanceVehicles(): void {
    for (let slot = 0; slot < MAX_VEHICLES; slot += 1) {
      const vehicle = this.slots[slot];
      if (!vehicle) continue;

      let remaining = vehicle.speedMps * TICK_SECONDS;
      const segCount = vehicle.segmentLengths.length;

      // Each iteration either fully consumes a segment (segIndex++, bounded
      // by segCount) or zeroes `remaining` — so this always terminates.
      while (remaining > 0 && vehicle.segIndex < segCount) {
        const segLen = vehicle.segmentLengths[vehicle.segIndex]!;
        const distLeft = segLen - vehicle.distanceIntoSegment;
        if (remaining >= distLeft) {
          remaining -= distLeft;
          vehicle.segIndex += 1;
          vehicle.distanceIntoSegment = 0;
        } else {
          vehicle.distanceIntoSegment += remaining;
          remaining = 0;
        }
      }

      if (vehicle.segIndex >= segCount) {
        this.freeSlot(slot);
      } else {
        this.writeSlot(slot, vehicle);
      }
    }
  }

  private writeSlot(slot: number, vehicle: ActiveVehicle): void {
    const a = vehicle.points[vehicle.segIndex]!;
    const b = vehicle.points[vehicle.segIndex + 1]!;
    const segLen = vehicle.segmentLengths[vehicle.segIndex] ?? 0;
    const t = segLen > 0 ? vehicle.distanceIntoSegment / segLen : 0;
    const dx = b.x - a.x;
    const dz = b.z - a.z;

    const base = slot * VEHICLE_STRIDE;
    this.vehicleBuffer[base] = a.x + dx * t;
    this.vehicleBuffer[base + 1] = a.z + dz * t;
    // Stored heading is a Y-axis yaw applied to a +Z-nosed vehicle mesh
    // (render/vehicles.ts): rotationY(yaw) maps local +Z to world (sin yaw,
    // cos yaw), i.e. the (dx, dz) travel direction, so yaw = atan2(dx, dz)
    // -- NOT atan2(dz, dx), which is 90 degrees off.
    this.vehicleBuffer[base + 2] = Math.atan2(dx, dz);
    this.vehicleBuffer[base + 3] = vehicle.speedMps;
    this.vehicleBuffer[base + 4] = vehicle.kind;
  }

  private freeSlot(slot: number): void {
    this.slots[slot] = null;
    const base = slot * VEHICLE_STRIDE;
    this.vehicleBuffer[base] = INACTIVE_VEHICLE_X;
    this.vehicleBuffer[base + 1] = 0;
    this.vehicleBuffer[base + 2] = 0;
    this.vehicleBuffer[base + 3] = 0;
    this.vehicleBuffer[base + 4] = 0;
    this.freeSlots.push(slot);
  }
}
