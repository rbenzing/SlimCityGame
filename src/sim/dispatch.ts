/**
 * SlimCity service dispatch: deterministically spawns
 * incidents from the existing coverage-gap fields (Crime/FireRisk/Pollution)
 * at real per-resident call rates, routes a service vehicle station ->
 * incident -> station over the road network, and resolves the incident after
 * travel + on-scene service ticks.
 *
 * A station answers only within its road reach (path tiles, scaled by the
 * kind's funding) and only while it has fewer calls in flight than its
 * `responders`. A call no station can answer waits, unanswered and without a
 * vehicle, retries each tick and lapses.
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
  FundingKey,
  GridState,
  Incident,
  PathResult,
  ResponderLoad,
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
  pathRoute,
} from '../shared/types';
import {
  CALLS_PER_RESIDENT_PER_YEAR,
  EMPLOYMENT_RATE,
  FIELD_REFERENCE,
  RESPONSE_REACH_TILES,
  TICKS_PER_DAY,
  TICKS_PER_YEAR,
  TICK_RATE,
  TILE_METERS,
  tileIndex,
} from '../shared/constants';
import { occupiedResidents } from '../shared/occupancy';

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
/** Unanswered calls held at once, apart from the vehicle pool so they can never starve it. */
export const MAX_UNANSWERED_INCIDENTS = 32;

/** Service vehicles move exactly one tile per tick -- a deliberate, simple, testable speed model (not congestion-aware; distinct from TrafficSystem's cosmetic cars). */
const SERVICE_VEHICLE_SPEED_MPS = TILE_METERS * TICK_RATE;

/** Fire on-scene duration, in ticks: BASE + severity(0..1) * SEVERITY_SCALE. A dial. */
const SERVICE_TICKS_BASE = 10;
const SERVICE_TICKS_SEVERITY_SCALE = 20;

/**
 * Mean minutes a unit is off the road per call, for the kinds with a sourced
 * figure: police arrival to clear (26.4), ambulance scene plus transport
 * (16 + 13). Severity spreads it 0.5x to 1.5x.
 */
const ON_SCENE_MINUTES: Partial<Readonly<Record<Incident['kind'], number>>> = {
  crime: 26.4,
  medical: 29,
};

const MINUTES_PER_DAY = 1440;

/** Ticks a unit stays on an incident of this kind and severity (0..1). */
export function serviceTicksFor(kind: Incident['kind'], severity: number): number {
  const minutes = ON_SCENE_MINUTES[kind];
  if (minutes === undefined) {
    return Math.round(SERVICE_TICKS_BASE + severity * SERVICE_TICKS_SEVERITY_SCALE);
  }
  // Tenths of a minute and a doubled spread keep the product integral, so an
  // exact half tick rounds up instead of landing a float hair under it.
  const tenths = Math.round(minutes * 10);
  return Math.round((tenths * (1 + 2 * severity) * TICKS_PER_DAY) / (20 * MINUTES_PER_DAY));
}

const INCIDENT_KINDS: readonly Incident['kind'][] = ['fire', 'crime', 'medical'];

/**
 * How long an unanswered call stands before it lapses: the longest an answered
 * call spends on scene (any kind, worst severity), so it is visible for as long
 * as an answered one would have been. A dial.
 */
export const UNANSWERED_LAPSE_TICKS = Math.max(
  ...INCIDENT_KINDS.map((kind) => serviceTicksFor(kind, 1)),
);

const SERVICE_KIND_FOR_INCIDENT: Readonly<Record<Incident['kind'], FundingKey>> = {
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

/**
 * How far a station answers a call of this kind, in road tiles: the standard's
 * reach scaled by the funding of the service that answers. The small epsilon
 * keeps a product that is a whole number in exact arithmetic (120 x 0.35) from
 * flooring one tile short in floating point.
 */
export function responseReach(
  kind: Incident['kind'],
  funding: Readonly<Record<FundingKey, number>>,
): number {
  const scale = funding[SERVICE_KIND_FOR_INCIDENT[kind]];
  return Math.floor(RESPONSE_REACH_TILES[kind] * scale + 1e-9);
}

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
  /** The BuildingInstance.id of the responding station -- the key its in-flight count is held under. */
  stationId: number;
  incidentTile: TilePoint;
  /** The BuildingInstance.id this incident targets -- gates re-spawning at the same building while it's still active. */
  targetBuildingId: number;
}

/** A call no station has taken: no vehicle, no slot, waiting for a responder in reach to be free. */
interface WaitingIncident {
  kind: Incident['kind'];
  severity: number;
  incidentTile: TilePoint;
  targetBuildingId: number;
  /** Ticks stood unanswered; the call lapses at UNANSWERED_LAPSE_TICKS. */
  waited: number;
}

interface Station {
  building: BuildingInstance;
  kind: ServiceKind;
  /** Calls it can have in flight; undefined is unlimited. */
  responders: number | undefined;
}

interface Responder {
  station: Station;
  path: PathResult;
}

function buildRoutedVehicle(path: PathResult): RoutedVehicle {
  const points: WorldPoint[] = pathRoute(path);
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
  /** Unanswered calls, oldest first. */
  private waiting: WaitingIncident[] = [];
  /** Calls in flight per station building id -- the count `responders` caps. */
  private readonly inFlight = new Map<number, number>();
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
   * return/resolution), offers each waiting call to a responder now free, then
   * attempts new incident spawns. Returns the answered incidents followed by
   * the unanswered ones, ready to drop straight into SimSnapshot.incidents.
   */
  tick(input: {
    grid: GridState;
    buildings: readonly BuildingInstance[];
    network: RoadNetworkApi;
    funding: Readonly<Record<FundingKey, number>>;
  }): Incident[] {
    const { grid, buildings, network, funding } = input;
    const live = buildings
      .filter((b) => b.state === BuildingState.Active)
      .sort((a, b) => a.id - b.id);
    const stations: Station[] = [];
    const targets: BuildingInstance[] = [];
    for (const building of live) {
      const entry = this.catalog.get(building.catalogId);
      if (!entry) continue;
      const service = entry.service;
      if (service) stations.push({ building, kind: service.kind, responders: service.responders });
      else targets.push(building);
    }

    this.advance(network);
    this.answerWaiting(stations, network, funding);
    this.trySpawn(grid, targets, stations, network, funding);
    for (const id of this.resolvedThisTick) this.activeTargets.delete(id);
    this.resolvedThisTick.length = 0;
    return [
      ...this.active.map((a) => ({
        kind: a.kind,
        x: a.x,
        z: a.z,
        severity: a.severity,
        answered: true,
      })),
      ...this.waiting.map((w) => ({
        kind: w.kind,
        x: w.incidentTile.x,
        z: w.incidentTile.z,
        severity: w.severity,
        answered: false,
      })),
    ];
  }

  /** Calls in flight over the responders the Active stations offer, for each kind that caps them. */
  responderLoad(
    buildings: readonly BuildingInstance[],
  ): Partial<Record<ServiceKind, ResponderLoad>> {
    const out: Partial<Record<ServiceKind, ResponderLoad>> = {};
    for (const b of buildings) {
      if (b.state !== BuildingState.Active) continue;
      const service = this.catalog.get(b.catalogId)?.service;
      if (service?.responders === undefined) continue;
      const load = (out[service.kind] ??= { inFlight: 0, total: 0 });
      load.inFlight += this.inFlight.get(b.id) ?? 0;
      load.total += service.responders;
    }
    return out;
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
    this.inFlight.set(inc.stationId, (this.inFlight.get(inc.stationId) ?? 1) - 1);
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

  /** Offers each waiting call, oldest first, to a responder; one nobody takes ages a tick and lapses at the limit. */
  private answerWaiting(
    stations: readonly Station[],
    network: RoadNetworkApi,
    funding: Readonly<Record<FundingKey, number>>,
  ): void {
    if (this.waiting.length === 0) return;
    const still: WaitingIncident[] = [];
    for (const call of this.waiting) {
      const responder =
        this.freeSlots.length > 0
          ? this.findResponder(call.kind, call.incidentTile, stations, network, funding)
          : null;
      if (responder) {
        this.dispatchIncident(call, responder);
        continue;
      }
      call.waited += 1;
      if (call.waited >= UNANSWERED_LAPSE_TICKS) {
        this.resolvedThisTick.push(call.targetBuildingId);
      } else {
        still.push(call);
      }
    }
    this.waiting = still;
  }

  private trySpawn(
    grid: GridState,
    targets: readonly BuildingInstance[],
    stations: readonly Station[],
    network: RoadNetworkApi,
    funding: Readonly<Record<FundingKey, number>>,
  ): void {
    for (const target of targets) {
      const answerable = this.freeSlots.length > 0;
      if (!answerable && this.waiting.length >= MAX_UNANSWERED_INCIDENTS) return;
      if (this.activeTargets.has(target.id)) continue;

      const entry = this.catalog.get(target.catalogId)!;
      const occupants = occupiedResidents(entry, target) + (entry.jobs ?? 0);
      if (occupants <= 0) continue;
      const incidentTile: TilePoint = { x: target.x, z: target.z };

      for (const kind of INCIDENT_KINDS) {
        const fieldValue =
          grid.fields[FIELD_FOR_INCIDENT[kind]]?.[tileIndex(target.x, target.z)] ?? 0;
        if (fieldValue <= 0) continue;

        const chance =
          (CALLS_PER_RESIDENT_PER_YEAR[kind] / TICKS_PER_YEAR) *
          (occupants / (1 + EMPLOYMENT_RATE)) *
          (fieldValue / FIELD_REFERENCE);
        if (this.rng.next() >= chance) continue;

        const responder = answerable
          ? this.findResponder(kind, incidentTile, stations, network, funding)
          : null;
        if (!responder && this.waiting.length >= MAX_UNANSWERED_INCIDENTS) continue;

        const call: WaitingIncident = {
          kind,
          severity: this.rng.next(),
          incidentTile,
          targetBuildingId: target.id,
          waited: 0,
        };
        this.activeTargets.add(target.id);
        if (responder) this.dispatchIncident(call, responder);
        else this.waiting.push(call);
        break; // at most one incident spawned per building per tick
      }
    }
  }

  /**
   * The responder for a call: of the Active stations of the matching service kind
   * that are not at their `responders` limit and lie within the kind's reach,
   * the one with the lowest path cost, ties to the lowest building id. Reach is
   * a count of path tiles; cost is congestion-scaled time and only picks between
   * stations already in reach.
   */
  private findResponder(
    kind: Incident['kind'],
    incidentTile: TilePoint,
    stations: readonly Station[],
    network: RoadNetworkApi,
    funding: Readonly<Record<FundingKey, number>>,
  ): Responder | null {
    const serviceKind = SERVICE_KIND_FOR_INCIDENT[kind];
    const reach = responseReach(kind, funding);
    let best: Responder | null = null;

    for (const station of stations) {
      if (station.kind !== serviceKind) continue;
      const { building } = station;
      if (
        station.responders !== undefined &&
        (this.inFlight.get(building.id) ?? 0) >= station.responders
      ) {
        continue;
      }
      // Road distance is never less than Manhattan distance, so this skips the
      // search for a station that cannot be in reach.
      const manhattan =
        Math.abs(building.x - incidentTile.x) + Math.abs(building.z - incidentTile.z);
      if (manhattan > reach) continue;
      const path = network.findPath({ x: building.x, z: building.z }, incidentTile);
      if (!path || path.points.length - 1 > reach) continue;
      if (best === null || path.cost < best.path.cost) best = { station, path };
    }
    return best;
  }

  private dispatchIncident(call: WaitingIncident, responder: Responder): void {
    const slot = this.freeSlots.pop();
    if (slot === undefined) return;

    const { station, path } = responder;
    const vehicle = buildRoutedVehicle(path);
    const incident: ActiveIncident = {
      kind: call.kind,
      x: call.incidentTile.x,
      z: call.incidentTile.z,
      severity: call.severity,
      slot,
      phase: 'toIncident',
      vehicle,
      serviceTicksRemaining: serviceTicksFor(call.kind, call.severity),
      stationTile: { x: station.building.x, z: station.building.z },
      stationId: station.building.id,
      incidentTile: call.incidentTile,
      targetBuildingId: call.targetBuildingId,
    };
    this.inFlight.set(station.building.id, (this.inFlight.get(station.building.id) ?? 0) + 1);
    this.active.push(incident);
    this.writeSlot(slot, vehicle, VEHICLE_KIND_FOR_INCIDENT[call.kind], SERVICE_VEHICLE_SPEED_MPS);
  }
}
