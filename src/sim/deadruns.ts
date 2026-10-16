/**
 * The buses a line's depot sends to its first stop at the start of the
 * service span and home again at its end, animated along the dead-run path
 * the transit tick found. The buses leave one per headway, drive at the
 * commercial speed the line's own vehicles keep, and are dropped where the
 * path ends: at the first stop on the pull-out, at the depot's gate on the
 * pull-in. A new run for a line supersedes whatever of its last run is still
 * on the road. Like the garbage trucks, this writes only its own slice of the
 * shared vehicle buffer and feeds nothing back into the sim; the road volume
 * a dead run loads is the transit tick's own doing.
 *
 * Deterministic: no Rng, no clock; runtime-only state, rebuilt after a load.
 */
import { INACTIVE_VEHICLE_X, VEHICLE_STRIDE, VehicleKind } from '../shared/types';
import { TICK_RATE } from '../shared/constants';
import { COMMERCIAL_SPEED_MPS } from '../shared/transitfleet';

/** Own small pool, overlaid onto the shared snapshot buffer just below the hearses' slice. */
export const MAX_DEAD_RUN_BUSES = 64;
/** A dead-running bus drives at the speed its line's loop is drawn at. */
export const DEAD_RUN_SPEED_MPS = COMMERCIAL_SPEED_MPS.bus;
const METRES_PER_TICK = DEAD_RUN_SPEED_MPS / TICK_RATE;

export interface WorldPoint {
  readonly x: number;
  readonly z: number;
}

/** One line's run starting this tick: `count` buses along `route`, released `headwayTicks` apart. */
export interface DeadRunStart {
  lineId: number;
  /** The line a bus drives, world metres, from where the run starts to where it ends. */
  route: readonly WorldPoint[];
  count: number;
  headwayTicks: number;
}

/** Segment-walking route state, the same model the garbage trucks and dispatch use. */
interface RoutedVehicle {
  points: readonly WorldPoint[];
  segmentLengths: readonly number[];
  segIndex: number;
  distanceIntoSegment: number;
}

interface ActiveBus {
  lineId: number;
  slot: number;
  vehicle: RoutedVehicle;
}

interface PendingRun {
  lineId: number;
  route: readonly WorldPoint[];
  left: number;
  headwayTicks: number;
  /** Ticks until the next bus leaves; 0 releases one this tick. */
  dueIn: number;
}

function buildRoutedVehicle(points: readonly WorldPoint[]): RoutedVehicle {
  const segmentLengths: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    segmentLengths.push(Math.hypot(b.x - a.x, b.z - a.z));
  }
  return { points, segmentLengths, segIndex: 0, distanceIntoSegment: 0 };
}

function stepVehicle(vehicle: RoutedVehicle): void {
  let remaining = METRES_PER_TICK;
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

export class DeadRunSystem {
  /** `slots * VEHICLE_STRIDE` floats, same per-slot layout as SimSnapshot.vehicles. */
  readonly vehicleBuffer: Float32Array;

  private readonly freeSlots: number[] = [];
  private active: ActiveBus[] = [];
  private pending: PendingRun[] = [];

  constructor(private readonly slots: number = MAX_DEAD_RUN_BUSES) {
    this.vehicleBuffer = new Float32Array(slots * VEHICLE_STRIDE);
    this.reset();
  }

  /** Buses on the road this tick. */
  activeCount(): number {
    return this.active.length;
  }

  /** Buses still to leave on the runs under way. */
  pendingCount(): number {
    return this.pending.reduce((sum, run) => sum + run.left, 0);
  }

  /** One sim tick: start the runs given, advance every bus, release the ones due. */
  tick(starts: readonly DeadRunStart[]): void {
    for (const start of starts) this.start(start);
    this.advance();
    this.release();
  }

  /** A line's new run takes over from its last: whatever was still out is gone. */
  private start(start: DeadRunStart): void {
    this.pending = this.pending.filter((run) => run.lineId !== start.lineId);
    for (let i = this.active.length - 1; i >= 0; i--) {
      if (this.active[i]!.lineId === start.lineId) this.resolve(i);
    }
    const count = Math.max(0, Math.floor(start.count));
    if (count === 0 || start.route.length < 2) return;
    this.pending.push({
      lineId: start.lineId,
      route: start.route,
      left: count,
      headwayTicks: Math.max(1, Math.floor(start.headwayTicks)),
      dueIn: 0,
    });
  }

  private advance(): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const bus = this.active[i]!;
      stepVehicle(bus.vehicle);
      if (vehicleArrived(bus.vehicle)) {
        this.resolve(i);
        continue;
      }
      this.writeSlot(bus.slot, bus.vehicle);
    }
  }

  private release(): void {
    for (const run of this.pending) {
      if (run.dueIn > 0) {
        run.dueIn -= 1;
        continue;
      }
      const slot = this.freeSlots.pop();
      if (slot === undefined) break;
      const vehicle = buildRoutedVehicle(run.route);
      this.active.push({ lineId: run.lineId, slot, vehicle });
      this.writeSlot(slot, vehicle);
      run.left -= 1;
      run.dueIn = run.headwayTicks - 1;
    }
    this.pending = this.pending.filter((run) => run.left > 0);
  }

  private resolve(index: number): void {
    const bus = this.active[index];
    if (!bus) return;
    const base = bus.slot * VEHICLE_STRIDE;
    this.vehicleBuffer[base] = INACTIVE_VEHICLE_X;
    this.vehicleBuffer[base + 1] = 0;
    this.vehicleBuffer[base + 2] = 0;
    this.vehicleBuffer[base + 3] = 0;
    this.vehicleBuffer[base + 4] = 0;
    this.freeSlots.push(bus.slot);
    this.active.splice(index, 1);
  }

  private writeSlot(slot: number, vehicle: RoutedVehicle): void {
    const segCount = vehicle.segmentLengths.length;
    const idx = Math.min(vehicle.segIndex, Math.max(segCount - 1, 0));
    const a = vehicle.points[idx] ?? { x: 0, z: 0 };
    const b = vehicle.points[idx + 1] ?? a;
    const segLen = vehicle.segmentLengths[idx] ?? 0;
    const t = segLen > 0 ? vehicle.distanceIntoSegment / segLen : 0;
    const dx = b.x - a.x;
    const dz = b.z - a.z;

    const base = slot * VEHICLE_STRIDE;
    this.vehicleBuffer[base] = a.x + dx * t;
    this.vehicleBuffer[base + 1] = a.z + dz * t;
    this.vehicleBuffer[base + 2] = Math.atan2(dx, dz);
    this.vehicleBuffer[base + 3] = DEAD_RUN_SPEED_MPS;
    this.vehicleBuffer[base + 4] = VehicleKind.Bus;
  }

  /** Clears every bus and every run (e.g. on load — this state is not persisted). */
  reset(): void {
    this.active = [];
    this.pending = [];
    this.freeSlots.length = 0;
    for (let slot = this.slots - 1; slot >= 0; slot--) {
      this.freeSlots.push(slot);
      this.vehicleBuffer[slot * VEHICLE_STRIDE] = INACTIVE_VEHICLE_X;
    }
  }
}
