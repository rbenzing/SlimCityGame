/**
 * SlimCity service dispatch: deterministically spawns
 * incidents from the existing coverage-gap fields (Crime/FireRisk/Pollution),
 * routes a service vehicle station -> incident -> station over
 * the road network, and resolves the incident after travel + on-scene
 * service ticks.
 *
 * Cosmetic, by design: this system only READS GridState.fields and the
 * building registry snapshot -- it never writes a field, never touches a
 * BuildingInstance, and never calls into ServiceSim. Coverage/economy stay
 * exactly as ServiceSim/EconomySystem already compute them; DispatchSystem
 * consumes their output as a spawn-rate signal, nothing more (see the "no
 * coupling into ServiceSim" tests in dispatch.test.ts).
 *
 * Pure + deterministic: everything random flows through the injected `Rng`
 * fork (project rule: never Math.random/Date.now); the road network is an
 * injected RoadNetworkApi (never RoadNetwork imported directly), and the
 * building catalog/registry snapshot is passed in every tick, mirroring the
 * existing ServiceSim/TrafficSystem convention in this same directory.
 *
 * Contract note (matches traffic.ts/growth.ts in this directory): shared/
 * types.ts does not export a structural `Rng` type, so it is declared
 * locally below with the exact shape core/rng.ts's createRng() produces --
 * any conforming Rng is structurally assignable here without changes.
 */
import type {
  BuildingCatalogEntry,
  BuildingInstance,
  GridState,
  Incident,
  PathResult,
  RoadNetworkApi,
  ServiceKind,
  TilePoint,
} from '../shared/types';
import {
  BuildingState,
  FieldId,
  INACTIVE_VEHICLE_X,
  VEHICLE_STRIDE,
  VehicleKind,
} from '../shared/types';
import { TICK_RATE, TILE_METERS, tileIndex, tileToWorld } from '../shared/constants';

/** Seeded random source, injected -- see project rule: never Math.random/Date.now. */
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

const TICK_SECONDS = 1 / TICK_RATE;

/**
 * Fixed pool of concurrently-active service vehicles/incidents this system
 * manages -- its OWN small buffer, entirely separate from TrafficSystem's
 * MAX_VEHICLES cosmetic-car pool. The integrate phase overlays this onto the
 * shared snapshot vehicle buffer.
 */
export const MAX_SERVICE_VEHICLES = 32;
/** Concurrent active incidents cap -- one incident consumes one vehicle slot. */
const MAX_ACTIVE_INCIDENTS = MAX_SERVICE_VEHICLES;

/**
 * Per-(target building, incident-kind)-per-tick spawn probability at the
 * relevant field's max value (255). Tuned so incidents are an occasional
 * event, not a constant stream, at TICK_RATE=20.
 */
const SPAWN_BASE_CHANCE = 0.02;

/** Service vehicles move exactly one tile per tick -- a deliberate, simple, testable speed model (not congestion-aware; distinct from TrafficSystem's cosmetic cars). */
const SERVICE_VEHICLE_SPEED_MPS = TILE_METERS * TICK_RATE;

/** On-scene service duration, in ticks: BASE + severity(0..1) * SEVERITY_SCALE. */
const SERVICE_TICKS_BASE = 10;
const SERVICE_TICKS_SEVERITY_SCALE = 20;

const INCIDENT_KINDS: readonly Incident['kind'][] = ['fire', 'crime', 'medical'];

const SERVICE_KIND_FOR_INCIDENT: Readonly<Record<Incident['kind'], ServiceKind>> = {
  fire: 'fire',
  crime: 'police',
  medical: 'health',
};

/** The FieldId read as this incident kind's coverage-gap spawn-rate signal. */
const FIELD_FOR_INCIDENT: Readonly<Record<Incident['kind'], FieldId>> = {
  fire: FieldId.FireRisk,
  crime: FieldId.Crime,
  // No dedicated "health risk" field exists; Pollution is the closest
  // existing coverage-gap proxy for medical-emergency rate (high pollution
  // -> more health incidents).
  medical: FieldId.Pollution,
};

export const VEHICLE_KIND_FOR_INCIDENT: Readonly<Record<Incident['kind'], number>> = {
  fire: VehicleKind.Fire,
  crime: VehicleKind.Police,
  medical: VehicleKind.Ambulance,
};

interface WorldPoint {
  readonly x: number;
  readonly z: number;
}

/** A service vehicle's route state -- same segment-walking model as TrafficSystem's ActiveVehicle. */
interface RoutedVehicle {
  points: readonly WorldPoint[];
  segmentLengths: readonly number[];
  segIndex: number;
  distanceIntoSegment: number;
  speedMps: number;
}

type DispatchPhase = 'toIncident' | 'servicing' | 'toStation';

interface ActiveIncident {
  kind: Incident['kind'];
  x: number;
  z: number;
  severity: number;
  slot: number;
  phase: DispatchPhase;
  vehicle: RoutedVehicle;
  serviceTicksRemaining: number;
  stationTile: TilePoint;
  incidentTile: TilePoint;
  /** The BuildingInstance.id this incident targets -- gates re-spawning at the same building while it's still active. */
  targetBuildingId: number;
}

function buildRoutedVehicle(path: PathResult): RoutedVehicle {
  const points: WorldPoint[] = path.points.map((p) => ({
    x: tileToWorld(p.x),
    z: tileToWorld(p.z),
  }));
  const segmentLengths: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    segmentLengths.push(Math.hypot(b.x - a.x, b.z - a.z));
  }
  return {
    points,
    segmentLengths,
    segIndex: 0,
    distanceIntoSegment: 0,
    speedMps: SERVICE_VEHICLE_SPEED_MPS,
  };
}

/** Advances one vehicle's segment position by speedMps*TICK_SECONDS (identical stepping model to TrafficSystem.advanceVehicles). */
function stepVehicle(vehicle: RoutedVehicle): void {
  let remaining = vehicle.speedMps * TICK_SECONDS;
  const segCount = vehicle.segmentLengths.length;
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
}

function vehicleArrived(vehicle: RoutedVehicle): boolean {
  return vehicle.segIndex >= vehicle.segmentLengths.length;
}

export class DispatchSystem {
  /** MAX_SERVICE_VEHICLES * VEHICLE_STRIDE floats, same per-slot layout as SimSnapshot.vehicles. */
  readonly vehicleBuffer: Float32Array;

  private readonly catalog: Map<string, BuildingCatalogEntry>;
  private readonly rng: Rng;
  private readonly freeSlots: number[] = [];
  private active: ActiveIncident[] = [];
  /** Building ids currently the target of an unresolved incident -- prevents re-spawning on the same building while it's still being handled. */
  private readonly activeTargets = new Set<number>();
  /**
   * Targets that resolved THIS tick, staying in `activeTargets` (so the same
   * tick's trySpawn still skips them -- a resolution and a fresh spawn on the
   * exact same building in the exact same tick would be an ordering
   * artifact, not a real event) until cleared at the end of `tick()`.
   */
  private readonly resolvedThisTick: number[] = [];

  constructor(catalog: BuildingCatalogEntry[], rng: Rng) {
    this.catalog = new Map(catalog.map((c) => [c.id, c] as const));
    this.rng = rng;
    this.vehicleBuffer = new Float32Array(MAX_SERVICE_VEHICLES * VEHICLE_STRIDE);
    for (let slot = MAX_SERVICE_VEHICLES - 1; slot >= 0; slot--) {
      this.freeSlots.push(slot);
      this.vehicleBuffer[slot * VEHICLE_STRIDE] = INACTIVE_VEHICLE_X;
    }
  }

  /**
   * One sim tick: advances every active incident's vehicle (arrival/service/
   * return/resolution), then attempts new incident spawns. Returns the
   * current active-incident list, ready to drop straight into
   * SimSnapshot.incidents.
   */
  tick(input: {
    grid: GridState;
    buildings: readonly BuildingInstance[];
    network: RoadNetworkApi;
  }): Incident[] {
    const { grid, buildings, network } = input;
    this.advance(network);
    this.trySpawn(grid, buildings, network);
    for (const id of this.resolvedThisTick) this.activeTargets.delete(id);
    this.resolvedThisTick.length = 0;
    return this.active.map((a) => ({ kind: a.kind, x: a.x, z: a.z, severity: a.severity }));
  }

  private advance(network: RoadNetworkApi): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const inc = this.active[i]!;
      const vehicleKind = VEHICLE_KIND_FOR_INCIDENT[inc.kind];

      if (inc.phase === 'servicing') {
        inc.serviceTicksRemaining -= 1;
        this.writeSlot(inc.slot, inc.vehicle, vehicleKind, 0);
        if (inc.serviceTicksRemaining <= 0) {
          this.startReturn(inc, network, i);
        }
        continue;
      }

      stepVehicle(inc.vehicle);
      const arrived = vehicleArrived(inc.vehicle);
      this.writeSlot(inc.slot, inc.vehicle, vehicleKind, arrived ? 0 : SERVICE_VEHICLE_SPEED_MPS);

      if (!arrived) continue;
      if (inc.phase === 'toIncident') {
        inc.phase = 'servicing';
      } else {
        this.resolve(i);
      }
    }
  }

  /** Re-routes incidentTile -> stationTile for the trip home; resolves immediately (defensive) if the road network no longer connects them. */
  private startReturn(inc: ActiveIncident, network: RoadNetworkApi, index: number): void {
    const path = network.findPath(inc.incidentTile, inc.stationTile);
    if (!path) {
      this.resolve(index);
      return;
    }
    inc.vehicle = buildRoutedVehicle(path);
    inc.phase = 'toStation';
  }

  private resolve(index: number): void {
    const inc = this.active[index];
    if (!inc) return;
    const base = inc.slot * VEHICLE_STRIDE;
    this.vehicleBuffer[base] = INACTIVE_VEHICLE_X;
    this.vehicleBuffer[base + 1] = 0;
    this.vehicleBuffer[base + 2] = 0;
    this.vehicleBuffer[base + 3] = 0;
    this.vehicleBuffer[base + 4] = 0;
    this.freeSlots.push(inc.slot);
    this.resolvedThisTick.push(inc.targetBuildingId);
    this.active.splice(index, 1);
  }

  private writeSlot(slot: number, vehicle: RoutedVehicle, kind: number, speed: number): void {
    const segCount = vehicle.segmentLengths.length;
    const idx = Math.min(vehicle.segIndex, Math.max(segCount - 1, 0));
    const a = vehicle.points[idx] ?? { x: 0, z: 0 };
    const b = vehicle.points[idx + 1] ?? a;
    const segLen = vehicle.segmentLengths[idx] ?? 0;
    const arrived = vehicle.segIndex >= segCount;
    const t = arrived ? 1 : segLen > 0 ? vehicle.distanceIntoSegment / segLen : 0;
    const dx = b.x - a.x;
    const dz = b.z - a.z;

    const base = slot * VEHICLE_STRIDE;
    this.vehicleBuffer[base] = a.x + dx * t;
    this.vehicleBuffer[base + 1] = a.z + dz * t;
    this.vehicleBuffer[base + 2] = Math.atan2(dx, dz);
    this.vehicleBuffer[base + 3] = speed;
    this.vehicleBuffer[base + 4] = kind;
  }

  private trySpawn(
    grid: GridState,
    buildings: readonly BuildingInstance[],
    network: RoadNetworkApi,
  ): void {
    if (this.active.length >= MAX_ACTIVE_INCIDENTS || this.freeSlots.length === 0) return;

    const targets = buildings
      .filter((b) => b.state === BuildingState.Active)
      .slice()
      .sort((a, b) => a.id - b.id);

    for (const target of targets) {
      if (this.active.length >= MAX_ACTIVE_INCIDENTS || this.freeSlots.length === 0) return;
      if (this.activeTargets.has(target.id)) continue;

      const entry = this.catalog.get(target.catalogId);
      if (!entry || entry.service) continue; // service buildings themselves are never incident sites

      const incidentTile: TilePoint = { x: target.x, z: target.z };

      for (const kind of INCIDENT_KINDS) {
        const fieldValue =
          grid.fields[FIELD_FOR_INCIDENT[kind]]?.[tileIndex(target.x, target.z)] ?? 0;
        if (fieldValue <= 0) continue;

        const chance = SPAWN_BASE_CHANCE * (fieldValue / 255);
        if (this.rng.next() >= chance) continue;

        const station = this.findNearestStation(kind, incidentTile, buildings, network);
        if (!station) continue; // no responder available for this service kind -- incident does not spawn

        this.spawnIncident(kind, target.id, incidentTile, station.tile, station.path);
        break; // at most one incident spawned per building per tick
      }
    }
  }

  /** Nearest (by road-network path cost) Active building whose catalog service.kind matches, ties broken by ascending building id. */
  private findNearestStation(
    kind: Incident['kind'],
    incidentTile: TilePoint,
    buildings: readonly BuildingInstance[],
    network: RoadNetworkApi,
  ): { tile: TilePoint; path: PathResult } | null {
    const serviceKind = SERVICE_KIND_FOR_INCIDENT[kind];
    let best: { tile: TilePoint; path: PathResult } | null = null;

    const stations = buildings
      .filter((b) => b.state === BuildingState.Active)
      .slice()
      .sort((a, b) => a.id - b.id);

    for (const b of stations) {
      const entry = this.catalog.get(b.catalogId);
      if (!entry?.service || entry.service.kind !== serviceKind) continue;
      const tile: TilePoint = { x: b.x, z: b.z };
      const path = network.findPath(tile, incidentTile);
      if (!path) continue;
      if (best === null || path.cost < best.path.cost) {
        best = { tile, path };
      }
    }
    return best;
  }

  private spawnIncident(
    kind: Incident['kind'],
    targetBuildingId: number,
    incidentTile: TilePoint,
    stationTile: TilePoint,
    pathToIncident: PathResult,
  ): void {
    const slot = this.freeSlots.pop();
    if (slot === undefined) return;

    const severity = this.rng.next();
    const vehicle = buildRoutedVehicle(pathToIncident);
    const incident: ActiveIncident = {
      kind,
      x: incidentTile.x,
      z: incidentTile.z,
      severity,
      slot,
      phase: 'toIncident',
      vehicle,
      serviceTicksRemaining: Math.round(
        SERVICE_TICKS_BASE + severity * SERVICE_TICKS_SEVERITY_SCALE,
      ),
      stationTile,
      incidentTile,
      targetBuildingId,
    };
    this.activeTargets.add(targetBuildingId);
    this.active.push(incident);
    this.writeSlot(slot, vehicle, VEHICLE_KIND_FOR_INCIDENT[kind], SERVICE_VEHICLE_SPEED_MPS);
  }
}
