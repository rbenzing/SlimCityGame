import { describe, expect, it } from 'vitest';
import {
  GarbageTruckSystem,
  MAX_GARBAGE_TRUCKS,
  type TruckDepot,
  type TruckTarget,
} from './garbagetrucks';
import type { GridState } from '../shared/types';
import { FIELD_COUNT, INACTIVE_VEHICLE_X, RoadTier, VEHICLE_STRIDE, VehicleKind } from '../shared/types';
import { MAP_SIZE, tileIndex } from '../shared/constants';
import { RoadNetwork } from '../world/roads';

function makeGrid(): GridState {
  const n = MAP_SIZE * MAP_SIZE;
  return {
    size: MAP_SIZE,
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

function straightRoad(g: GridState, x0: number, z: number, tiles: number): void {
  for (let x = x0; x <= x0 + tiles; x++) g.roadTier[tileIndex(x, z)] = RoadTier.TwoLane;
}

function net(g: GridState): RoadNetwork {
  const network = new RoadNetwork();
  network.rebuild(g);
  return network;
}

function countActive(buf: Float32Array): number {
  let n = 0;
  for (let slot = 0; slot < MAX_GARBAGE_TRUCKS; slot++) {
    if (buf[slot * VEHICLE_STRIDE] !== INACTIVE_VEHICLE_X) n++;
  }
  return n;
}

const depot = (id: number, x: number, z: number, budget: number): TruckDepot => ({
  id,
  sourceTile: { x, z },
  budget,
});
const target = (id: number, x: number, z: number): TruckTarget => ({ id, tile: { x, z } });

describe('GarbageTruckSystem', () => {
  it('dispatches up to the depot budget, every truck kind Garbage', () => {
    const g = makeGrid();
    straightRoad(g, 0, 0, 10);
    const network = net(g);
    const sys = new GarbageTruckSystem();

    sys.tick({ network, depots: [depot(1, 0, 0, 2)], targets: [target(100, 4, 1), target(101, 7, 1), target(102, 10, 1)] });

    expect(countActive(sys.vehicleBuffer)).toBe(2);
    for (let slot = 0; slot < MAX_GARBAGE_TRUCKS; slot++) {
      const base = slot * VEHICLE_STRIDE;
      if (sys.vehicleBuffer[base] !== INACTIVE_VEHICLE_X) {
        expect(sys.vehicleBuffer[base + 4]).toBe(VehicleKind.Garbage);
      }
    }
  });

  it('never exceeds the budget over a long run and keeps recycling slots', () => {
    const g = makeGrid();
    straightRoad(g, 0, 0, 12);
    const network = net(g);
    const sys = new GarbageTruckSystem();
    const depots = [depot(1, 0, 0, 3)];
    const targets = [target(100, 3, 1), target(101, 6, 1), target(102, 9, 1), target(103, 12, 1)];

    let maxActive = 0;
    for (let t = 0; t < 600; t++) {
      sys.tick({ network, depots, targets });
      maxActive = Math.max(maxActive, countActive(sys.vehicleBuffer));
    }
    expect(maxActive).toBe(3); // reaches the budget, never above it (no slot leak)
    expect(countActive(sys.vehicleBuffer)).toBeGreaterThan(0); // still busy, not stalled
  });

  it('sends at most one truck to a given building at a time', () => {
    const g = makeGrid();
    straightRoad(g, 0, 0, 8);
    const network = net(g);
    const sys = new GarbageTruckSystem();

    // Budget 3 but a single reachable building -> only one truck out.
    sys.tick({ network, depots: [depot(1, 0, 0, 3)], targets: [target(100, 5, 1)] });
    expect(countActive(sys.vehicleBuffer)).toBe(1);
  });

  it('drives a truck to the building and dwells there (speed drops to 0)', () => {
    const g = makeGrid();
    straightRoad(g, 0, 0, 8);
    const network = net(g);
    const sys = new GarbageTruckSystem();
    const depots = [depot(1, 0, 0, 1)];
    const targets = [target(100, 6, 1)];

    const speeds: number[] = [];
    for (let t = 0; t < 20; t++) {
      sys.tick({ network, depots, targets });
      // The single truck lives in whichever slot is active this tick.
      for (let slot = 0; slot < MAX_GARBAGE_TRUCKS; slot++) {
        const base = slot * VEHICLE_STRIDE;
        if (sys.vehicleBuffer[base] !== INACTIVE_VEHICLE_X) speeds.push(sys.vehicleBuffer[base + 3]!);
      }
    }
    expect(speeds.some((s) => s > 0)).toBe(true); // travelling
    expect(speeds.some((s) => s === 0)).toBe(true); // arrived + dwelling
  });

  it('dispatches nothing with no depots or no targets', () => {
    const g = makeGrid();
    straightRoad(g, 0, 0, 6);
    const network = net(g);
    const sys = new GarbageTruckSystem();

    sys.tick({ network, depots: [], targets: [target(100, 3, 1)] });
    expect(countActive(sys.vehicleBuffer)).toBe(0);
    sys.tick({ network, depots: [depot(1, 0, 0, 2)], targets: [] });
    expect(countActive(sys.vehicleBuffer)).toBe(0);
  });

  it('reset() clears all trucks', () => {
    const g = makeGrid();
    straightRoad(g, 0, 0, 6);
    const network = net(g);
    const sys = new GarbageTruckSystem();
    sys.tick({ network, depots: [depot(1, 0, 0, 2)], targets: [target(100, 3, 1), target(101, 5, 1)] });
    expect(countActive(sys.vehicleBuffer)).toBeGreaterThan(0);

    sys.reset();
    expect(countActive(sys.vehicleBuffer)).toBe(0);
  });

  it('is deterministic — identical inputs give byte-identical buffers', () => {
    function run(): Float32Array {
      const g = makeGrid();
      straightRoad(g, 0, 0, 10);
      const network = net(g);
      const sys = new GarbageTruckSystem();
      const depots = [depot(1, 0, 0, 3)];
      const targets = [target(100, 3, 1), target(101, 6, 1), target(102, 9, 1)];
      for (let t = 0; t < 300; t++) sys.tick({ network, depots, targets });
      return sys.vehicleBuffer.slice();
    }
    expect(Array.from(run())).toEqual(Array.from(run()));
  });
});
