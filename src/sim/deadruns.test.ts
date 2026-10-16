import { describe, expect, it } from 'vitest';
import {
  DeadRunSystem,
  DEAD_RUN_SPEED_MPS,
  MAX_DEAD_RUN_BUSES,
  type DeadRunStart,
} from './deadruns';
import { INACTIVE_VEHICLE_X, VEHICLE_STRIDE, VehicleKind } from '../shared/types';
import { TICK_RATE } from '../shared/constants';
import { COMMERCIAL_SPEED_MPS } from '../shared/transitfleet';

/** The gate 100 m west of the first stop, a straight run between them. */
const ROUTE = [
  { x: 0, z: 0 },
  { x: 100, z: 0 },
];

function slotsInUse(sys: DeadRunSystem): number[] {
  const out: number[] = [];
  for (let slot = 0; slot < MAX_DEAD_RUN_BUSES; slot++) {
    if (sys.vehicleBuffer[slot * VEHICLE_STRIDE] !== INACTIVE_VEHICLE_X) out.push(slot);
  }
  return out;
}

function at(
  sys: DeadRunSystem,
  slot: number,
): { x: number; z: number; speed: number; kind: number } {
  const base = slot * VEHICLE_STRIDE;
  return {
    x: sys.vehicleBuffer[base]!,
    z: sys.vehicleBuffer[base + 1]!,
    speed: sys.vehicleBuffer[base + 3]!,
    kind: sys.vehicleBuffer[base + 4]!,
  };
}

function run(count: number, headwayTicks: number, route = ROUTE): DeadRunStart {
  return { lineId: 1, route, count, headwayTicks };
}

describe('a pull-out', () => {
  it('releases the line’s buses from the gate one per headway, as buses, at the commercial speed', () => {
    const sys = new DeadRunSystem();
    sys.tick([run(3, 4)]);
    expect(sys.activeCount()).toBe(1);
    expect(sys.pendingCount()).toBe(2);
    const [first] = slotsInUse(sys);
    const bus = at(sys, first!);
    expect([bus.x, bus.z, bus.kind]).toEqual([0, 0, VehicleKind.Bus]);
    expect(bus.speed).toBeCloseTo(DEAD_RUN_SPEED_MPS, 5);
    expect(DEAD_RUN_SPEED_MPS).toBe(COMMERCIAL_SPEED_MPS.bus);

    // Three more ticks and still one bus; the fourth tick after the first release brings the second.
    sys.tick([]);
    sys.tick([]);
    sys.tick([]);
    expect(sys.activeCount()).toBe(1);
    sys.tick([]);
    expect(sys.activeCount()).toBe(2);
    for (let i = 0; i < 4; i++) sys.tick([]);
    expect(sys.activeCount()).toBe(3);
    expect(sys.pendingCount()).toBe(0);
  });

  it('spaces the buses a headway of travel apart along the path', () => {
    const sys = new DeadRunSystem();
    sys.tick([run(2, 10)]);
    for (let i = 0; i < 10; i++) sys.tick([]);
    const xs = slotsInUse(sys)
      .map((slot) => at(sys, slot).x)
      .sort((a, b) => a - b);
    expect(xs).toHaveLength(2);
    expect(xs[1]! - xs[0]!).toBeCloseTo((10 * DEAD_RUN_SPEED_MPS) / TICK_RATE, 6);
  });

  it('drives the path at the commercial speed and drops the bus where it ends', () => {
    const sys = new DeadRunSystem();
    sys.tick([run(1, 1)]);
    const slot = slotsInUse(sys)[0]!;
    sys.tick([]);
    expect(at(sys, slot).x).toBeCloseTo(DEAD_RUN_SPEED_MPS / TICK_RATE, 6);
    const ticksToArrive = Math.ceil(100 / (DEAD_RUN_SPEED_MPS / TICK_RATE));
    // One tick of travel is already done above.
    for (let i = 2; i < ticksToArrive; i++) sys.tick([]);
    expect(sys.activeCount()).toBe(1);
    sys.tick([]);
    expect(sys.activeCount()).toBe(0);
    expect(slotsInUse(sys)).toEqual([]);
  });

  it('never releases two buses in one tick, whatever the headway', () => {
    const sys = new DeadRunSystem();
    sys.tick([run(4, 0)]);
    expect(sys.activeCount()).toBe(1);
    sys.tick([]);
    expect(sys.activeCount()).toBe(2);
  });

  it('starts nothing for a run of no buses or no path', () => {
    const sys = new DeadRunSystem();
    sys.tick([run(0, 1), run(3, 1, [{ x: 5, z: 5 }])]);
    expect(sys.activeCount()).toBe(0);
    expect(sys.pendingCount()).toBe(0);
  });
});

describe('a pull-in', () => {
  it('drives the same path backwards: the first bus leaves from the first stop for the gate', () => {
    const sys = new DeadRunSystem();
    sys.tick([run(1, 1, [...ROUTE].reverse())]);
    const slot = slotsInUse(sys)[0]!;
    expect(at(sys, slot).x).toBe(100);
    sys.tick([]);
    expect(at(sys, slot).x).toBeLessThan(100);
  });

  it('takes over from a pull-out still under way: the line’s buses out and pending are gone', () => {
    const sys = new DeadRunSystem();
    sys.tick([run(3, 50)]);
    sys.tick([]);
    expect(sys.activeCount()).toBe(1);
    expect(sys.pendingCount()).toBe(2);
    sys.tick([run(2, 50, [...ROUTE].reverse())]);
    expect(sys.activeCount()).toBe(1);
    expect(sys.pendingCount()).toBe(1);
    expect(at(sys, slotsInUse(sys)[0]!).x).toBe(100);
  });

  it('leaves another line’s run alone', () => {
    const sys = new DeadRunSystem();
    sys.tick([run(2, 50), { ...run(2, 50), lineId: 2 }]);
    sys.tick([run(1, 50, [...ROUTE].reverse())]);
    expect(sys.activeCount()).toBe(2);
    expect(sys.pendingCount()).toBe(1);
  });
});

describe('the pool', () => {
  it('holds no more buses than it has slots; a bus due waits for a slot', () => {
    const sys = new DeadRunSystem(2);
    sys.tick([run(3, 1)]);
    sys.tick([]);
    sys.tick([]);
    expect(sys.activeCount()).toBe(2);
    expect(sys.pendingCount()).toBe(1);
  });

  it('frees a slot when a bus arrives, and the next bus takes it', () => {
    const sys = new DeadRunSystem(1);
    const short = [
      { x: 0, z: 0 },
      { x: 0.1, z: 0 },
    ];
    sys.tick([run(3, 1, short)]);
    expect([sys.activeCount(), sys.pendingCount()]).toEqual([1, 2]);
    sys.tick([]);
    expect([sys.activeCount(), sys.pendingCount()]).toEqual([1, 1]);
    sys.tick([]);
    expect([sys.activeCount(), sys.pendingCount()]).toEqual([1, 0]);
    sys.tick([]);
    expect([sys.activeCount(), sys.pendingCount()]).toEqual([0, 0]);
  });

  it('reset clears every bus and run', () => {
    const sys = new DeadRunSystem();
    sys.tick([run(3, 5)]);
    sys.reset();
    expect(sys.activeCount()).toBe(0);
    expect(sys.pendingCount()).toBe(0);
    expect(slotsInUse(sys)).toEqual([]);
  });

  it('is deterministic: two systems fed the same runs write the same buffer', () => {
    const a = new DeadRunSystem();
    const b = new DeadRunSystem();
    for (const sys of [a, b]) {
      sys.tick([run(3, 7), { ...run(2, 3), lineId: 2 }]);
      for (let i = 0; i < 40; i++) sys.tick([]);
      sys.tick([run(2, 5, [...ROUTE].reverse())]);
      for (let i = 0; i < 40; i++) sys.tick([]);
    }
    expect(Array.from(a.vehicleBuffer)).toEqual(Array.from(b.vehicleBuffer));
  });
});
