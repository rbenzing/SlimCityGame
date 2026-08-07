/**
 * Cosmetic garbage trucks (§21 Stage C): each garbage facility (incinerator)
 * dispatches trucks that drive depot -> a serviced building -> depot on the
 * road network, dwell briefly ("emptying the bins"), and return. Purely
 * visual — like the §12 service vehicles, this reads the road network + a
 * building list and writes only its own slice of the shared vehicle buffer;
 * it never touches the sim (collection/economy stay in garbage.ts). The
 * per-facility truck count is the depot's budget (the incinerator's
 * catalog `garbage.trucks`). Depots with a `dumpPath` (landfills) send the
 * returning truck off the road into the fill area to dump before it despawns.
 *
 * Deterministic: no Rng — targets are picked nearest-first with a building-id
 * tiebreak, and stepping mirrors DispatchSystem's segment walker exactly.
 * Trucks are runtime-only state (rebuilt after a load, like traffic volume).
 */
import type { PathResult, RoadNetworkApi, TilePoint } from '../shared/types';
import { INACTIVE_VEHICLE_X, VEHICLE_STRIDE, VehicleKind } from '../shared/types';
import { TICK_RATE, TILE_METERS, tileToWorld } from '../shared/constants';

/** Own small pool, overlaid onto the shared snapshot buffer just before the service-vehicle slice. */
export const MAX_GARBAGE_TRUCKS = 16;
const TICK_SECONDS = 1 / TICK_RATE;
/** One tile per tick — the same simple, testable speed model as service vehicles. */
const TRUCK_SPEED_MPS = TILE_METERS * TICK_RATE;
/** Ticks a truck dwells at a building before heading back. */
const COLLECT_TICKS = 8;
/** Ticks a truck dwells at the dump spot inside a landfill before leaving. */
const DUMP_TICKS = 8;
/** Nearest candidates a depot probes with findPath before giving up on a spawn. */
const MAX_TARGET_PROBES = 12;

/** A truck-dispatching facility: a road-adjacent source tile + a concurrent-truck budget. */
export interface TruckDepot {
  /** Stable id for per-depot bookkeeping (the facility building's instance id). */
  id: number;
  sourceTile: TilePoint;
  budget: number;
  /**
   * Optional drive-in route inside the facility (landfills): tile steps off the
   * road, where [0] is the entrance adjacent to sourceTile and the last element
   * is the dump spot. Returning trucks drive it, dump, and retrace it before
   * despawning. Absent/empty -> trucks despawn at the depot as usual.
   */
  dumpPath?: readonly TilePoint[];
}

/** A building a truck can visit (active R/C/I), by instance id + tile. */
export interface TruckTarget {
  id: number;
  tile: TilePoint;
}

interface WorldPoint {
  readonly x: number;
  readonly z: number;
}

/** Segment-walking route state — identical model to DispatchSystem's RoutedVehicle. */
interface RoutedVehicle {
  points: readonly WorldPoint[];
  segmentLengths: readonly number[];
  segIndex: number;
  distanceIntoSegment: number;
}

type TruckPhase = 'toBuilding' | 'collecting' | 'toDepot' | 'toDump' | 'dumping' | 'leavingDump';

interface ActiveTruck {
  depotId: number;
  sourceTile: TilePoint;
  targetTile: TilePoint;
  targetBuildingId: number;
  slot: number;
  phase: TruckPhase;
  vehicle: RoutedVehicle;
  collectTicksRemaining: number;
  /** Depot dump route captured at spawn (depot arrays are rebuilt every tick). Empty -> no dump run. */
  dumpPath: readonly TilePoint[];
  dumpTicksRemaining: number;
}

function buildRoutedVehicle(tiles: readonly TilePoint[]): RoutedVehicle {
  const points: WorldPoint[] = tiles.map((p) => ({ x: tileToWorld(p.x), z: tileToWorld(p.z) }));
  const segmentLengths: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    segmentLengths.push(Math.hypot(b.x - a.x, b.z - a.z));
  }
  return { points, segmentLengths, segIndex: 0, distanceIntoSegment: 0 };
}

function stepVehicle(vehicle: RoutedVehicle): void {
  let remaining = TRUCK_SPEED_MPS * TICK_SECONDS;
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

function manhattan(a: TilePoint, b: TilePoint): number {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
}

export class GarbageTruckSystem {
  /** MAX_GARBAGE_TRUCKS * VEHICLE_STRIDE floats, same per-slot layout as SimSnapshot.vehicles. */
  readonly vehicleBuffer: Float32Array;

  private readonly freeSlots: number[] = [];
  private active: ActiveTruck[] = [];
  /** Building ids a truck is currently visiting — one truck per building at a time. */
  private readonly activeTargets = new Set<number>();

  constructor() {
    this.vehicleBuffer = new Float32Array(MAX_GARBAGE_TRUCKS * VEHICLE_STRIDE);
    for (let slot = MAX_GARBAGE_TRUCKS - 1; slot >= 0; slot--) {
      this.freeSlots.push(slot);
      this.vehicleBuffer[slot * VEHICLE_STRIDE] = INACTIVE_VEHICLE_X;
    }
  }

  /** One sim tick: advance active trucks, then top each depot up to its budget. */
  tick(input: {
    network: RoadNetworkApi;
    depots: readonly TruckDepot[];
    targets: readonly TruckTarget[];
  }): void {
    this.advance(input.network);
    this.spawn(input.depots, input.targets, input.network);
  }

  private advance(network: RoadNetworkApi): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const truck = this.active[i]!;
      if (truck.phase === 'collecting') {
        truck.collectTicksRemaining -= 1;
        this.writeSlot(truck.slot, truck.vehicle, 0);
        if (truck.collectTicksRemaining <= 0) this.startReturn(truck, network, i);
        continue;
      }
      if (truck.phase === 'dumping') {
        truck.dumpTicksRemaining -= 1;
        this.writeSlot(truck.slot, truck.vehicle, 0);
        if (truck.dumpTicksRemaining <= 0) this.startLeavingDump(truck);
        continue;
      }
      stepVehicle(truck.vehicle);
      const arrived = vehicleArrived(truck.vehicle);
      this.writeSlot(truck.slot, truck.vehicle, arrived ? 0 : TRUCK_SPEED_MPS);
      if (!arrived) continue;
      if (truck.phase === 'toBuilding') truck.phase = 'collecting';
      else if (truck.phase === 'toDepot' && truck.dumpPath.length > 0) this.startDumpRun(truck);
      else if (truck.phase === 'toDump') truck.phase = 'dumping';
      else this.resolve(i);
    }
  }

  private startReturn(truck: ActiveTruck, network: RoadNetworkApi, index: number): void {
    const path = network.findPath(truck.targetTile, truck.sourceTile);
    if (!path) {
      this.resolve(index);
      return;
    }
    truck.vehicle = buildRoutedVehicle(path.points);
    truck.phase = 'toDepot';
  }

  /** Depot reached with a dump route: drive off the road into the facility to the dump spot. */
  private startDumpRun(truck: ActiveTruck): void {
    truck.vehicle = buildRoutedVehicle([truck.sourceTile, ...truck.dumpPath]);
    truck.phase = 'toDump';
  }

  /** Dump dwell finished: retrace the dump route back out to the depot's source tile. */
  private startLeavingDump(truck: ActiveTruck): void {
    truck.vehicle = buildRoutedVehicle([...truck.dumpPath].reverse().concat(truck.sourceTile));
    truck.phase = 'leavingDump';
  }

  private resolve(index: number): void {
    const truck = this.active[index];
    if (!truck) return;
    const base = truck.slot * VEHICLE_STRIDE;
    this.vehicleBuffer[base] = INACTIVE_VEHICLE_X;
    this.vehicleBuffer[base + 1] = 0;
    this.vehicleBuffer[base + 2] = 0;
    this.vehicleBuffer[base + 3] = 0;
    this.vehicleBuffer[base + 4] = 0;
    this.freeSlots.push(truck.slot);
    this.activeTargets.delete(truck.targetBuildingId);
    this.active.splice(index, 1);
  }

  private spawn(
    depots: readonly TruckDepot[],
    targets: readonly TruckTarget[],
    network: RoadNetworkApi,
  ): void {
    if (this.freeSlots.length === 0 || targets.length === 0) return;
    const perDepot = new Map<number, number>();
    for (const t of this.active) perDepot.set(t.depotId, (perDepot.get(t.depotId) ?? 0) + 1);

    for (const depot of [...depots].sort((a, b) => a.id - b.id)) {
      let out = perDepot.get(depot.id) ?? 0;
      while (out < depot.budget && this.freeSlots.length > 0) {
        const cand = this.pickTarget(depot.sourceTile, targets, network);
        if (!cand) break;
        this.spawnTruck(depot, cand.target, cand.path);
        out += 1;
      }
    }
  }

  /** Nearest untargeted building (Manhattan order, id tiebreak) reachable by road from the depot. */
  private pickTarget(
    source: TilePoint,
    targets: readonly TruckTarget[],
    network: RoadNetworkApi,
  ): { target: TruckTarget; path: PathResult } | null {
    const ordered = targets
      .filter((t) => !this.activeTargets.has(t.id))
      .sort((a, b) => manhattan(source, a.tile) - manhattan(source, b.tile) || a.id - b.id);
    const probes = Math.min(ordered.length, MAX_TARGET_PROBES);
    for (let i = 0; i < probes; i++) {
      const target = ordered[i]!;
      const path = network.findPath(source, target.tile);
      if (path) return { target, path };
    }
    return null;
  }

  private spawnTruck(depot: TruckDepot, target: TruckTarget, pathToBuilding: PathResult): void {
    const slot = this.freeSlots.pop();
    if (slot === undefined) return;
    const vehicle = buildRoutedVehicle(pathToBuilding.points);
    this.active.push({
      depotId: depot.id,
      sourceTile: depot.sourceTile,
      targetTile: target.tile,
      targetBuildingId: target.id,
      slot,
      phase: 'toBuilding',
      vehicle,
      collectTicksRemaining: COLLECT_TICKS,
      dumpPath: depot.dumpPath ?? [],
      dumpTicksRemaining: DUMP_TICKS,
    });
    this.activeTargets.add(target.id);
    this.writeSlot(slot, vehicle, TRUCK_SPEED_MPS);
  }

  private writeSlot(slot: number, vehicle: RoutedVehicle, speed: number): void {
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
    this.vehicleBuffer[base + 4] = VehicleKind.Garbage;
  }

  /** Clears all trucks (e.g. on load — this state is not persisted). */
  reset(): void {
    this.active = [];
    this.activeTargets.clear();
    this.freeSlots.length = 0;
    for (let slot = MAX_GARBAGE_TRUCKS - 1; slot >= 0; slot--) {
      this.freeSlots.push(slot);
      this.vehicleBuffer[slot * VEHICLE_STRIDE] = INACTIVE_VEHICLE_X;
    }
  }
}
