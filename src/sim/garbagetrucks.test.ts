import { describe, expect, it } from 'vitest';
import {
  GarbageTruckSystem,
  MAX_GARBAGE_TRUCKS,
  truckKindFor,
  type TruckDepot,
  type TruckTarget,
} from './garbagetrucks';
import type { GridState } from '../shared/types';
import { INACTIVE_VEHICLE_X, RoadTier, VEHICLE_STRIDE, VehicleKind } from '../shared/types';
import { tileIndex, tileToWorld, worldToTile } from '../shared/constants';
import { RoadNetwork } from '../world/roadgraph';
import { createGrid } from '../world/grid';

function makeGrid(): GridState {
  return createGrid();
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

describe('truckKindFor', () => {
  it('runs recycling trucks from a kerbside depot and a recovery facility, refuse trucks from landfill and incinerator specs', () => {
    const base = { collectionRange: 40, bufferCapacity: 0, burnRate: 0, trucks: 4 };
    expect(truckKindFor({ ...base, servesHomes: 38000 })).toBe(VehicleKind.Recycling);
    expect(truckKindFor({ ...base, bufferCapacity: 165110, sortRate: 9072 })).toBe(
      VehicleKind.Recycling,
    );
    expect(truckKindFor({ ...base, bufferCapacity: 9000000, burnRate: 90000 })).toBe(
      VehicleKind.Garbage,
    );
  });

  it('runs refuse trucks from a transfer station, which moves rubbish', () => {
    const base = { collectionRange: 40, bufferCapacity: 362880, burnRate: 0, trucks: 4 };
    expect(truckKindFor({ ...base, transferRate: 9072 })).toBe(VehicleKind.Garbage);
  });

  it('reads the catalog: the recycling depot and the recovery facility are Recycling, the incinerator and transfer station Garbage', async () => {
    const catalog = (await import('../data/catalog.json')).default as {
      buildings: { id: string; garbage?: Parameters<typeof truckKindFor>[0] }[];
    };
    const spec = (id: string) => catalog.buildings.find((b) => b.id === id)!.garbage!;
    expect(truckKindFor(spec('recycling-depot'))).toBe(VehicleKind.Recycling);
    expect(truckKindFor(spec('materials-recovery-facility'))).toBe(VehicleKind.Recycling);
    expect(truckKindFor(spec('incinerator'))).toBe(VehicleKind.Garbage);
    expect(truckKindFor(spec('transfer-station'))).toBe(VehicleKind.Garbage);
  });
});

describe('GarbageTruckSystem', () => {
  it('dispatches up to the depot budget, every truck kind Garbage', () => {
    const g = makeGrid();
    straightRoad(g, 0, 0, 10);
    const network = net(g);
    const sys = new GarbageTruckSystem();

    sys.tick({
      network,
      depots: [depot(1, 0, 0, 2)],
      targets: [target(100, 4, 1), target(101, 7, 1), target(102, 10, 1)],
    });

    expect(countActive(sys.vehicleBuffer)).toBe(2);
    for (let slot = 0; slot < MAX_GARBAGE_TRUCKS; slot++) {
      const base = slot * VEHICLE_STRIDE;
      if (sys.vehicleBuffer[base] !== INACTIVE_VEHICLE_X) {
        expect(sys.vehicleBuffer[base + 4]).toBe(VehicleKind.Garbage);
      }
    }
  });

  it('dresses a depot with a recycling kind in the recycling livery and leaves the others refuse', () => {
    const g = makeGrid();
    straightRoad(g, 0, 0, 10);
    const network = net(g);
    const sys = new GarbageTruckSystem();

    sys.tick({
      network,
      depots: [{ ...depot(1, 0, 0, 1), kind: VehicleKind.Recycling }, depot(2, 10, 0, 1)],
      targets: [target(100, 2, 1), target(101, 8, 1)],
    });

    const kinds: number[] = [];
    for (let slot = 0; slot < MAX_GARBAGE_TRUCKS; slot++) {
      const base = slot * VEHICLE_STRIDE;
      if (sys.vehicleBuffer[base] !== INACTIVE_VEHICLE_X) kinds.push(sys.vehicleBuffer[base + 4]!);
    }
    expect(kinds.sort()).toEqual([VehicleKind.Garbage, VehicleKind.Recycling]);

    // The livery holds through the whole round, dwell and return included.
    const lone = new GarbageTruckSystem();
    const recyclingDepots = [{ ...depot(1, 0, 0, 1), kind: VehicleKind.Recycling }];
    let seen = 0;
    for (let t = 0; t < 400; t++) {
      lone.tick({ network, depots: recyclingDepots, targets: [target(100, 2, 1)] });
      for (let slot = 0; slot < MAX_GARBAGE_TRUCKS; slot++) {
        const base = slot * VEHICLE_STRIDE;
        if (lone.vehicleBuffer[base] === INACTIVE_VEHICLE_X) continue;
        seen++;
        expect(lone.vehicleBuffer[base + 4]).toBe(VehicleKind.Recycling);
      }
    }
    expect(seen).toBeGreaterThan(0);
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
        if (sys.vehicleBuffer[base] !== INACTIVE_VEHICLE_X)
          speeds.push(sys.vehicleBuffer[base + 3]!);
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
    sys.tick({
      network,
      depots: [depot(1, 0, 0, 2)],
      targets: [target(100, 3, 1), target(101, 5, 1)],
    });
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

  it('drives into the landfill along its dumpPath and dwells at the dump spot', () => {
    const g = makeGrid();
    straightRoad(g, 0, 0, 8);
    const network = net(g);
    const sys = new GarbageTruckSystem();
    // Dump route off the road: entrance (0,1) beside the source tile, dump spot (0,2).
    const depots = [
      {
        ...depot(1, 0, 0, 1),
        dumpPath: [
          { x: 0, z: 1 },
          { x: 0, z: 2 },
        ],
      },
    ];
    const targets = [target(100, 6, 1)];

    let dwellTicksAtDump = 0;
    for (let t = 0; t < 60; t++) {
      sys.tick({ network, depots, targets });
      for (let slot = 0; slot < MAX_GARBAGE_TRUCKS; slot++) {
        const base = slot * VEHICLE_STRIDE;
        if (
          sys.vehicleBuffer[base] === tileToWorld(0) &&
          sys.vehicleBuffer[base + 1] === tileToWorld(2) &&
          sys.vehicleBuffer[base + 3] === 0
        ) {
          dwellTicksAtDump++;
        }
      }
    }
    expect(dwellTicksAtDump).toBeGreaterThanOrEqual(8); // parked at the dump spot for the dwell
  });

  it('returns from the dump and frees its slot after the full cycle', () => {
    const g = makeGrid();
    straightRoad(g, 0, 0, 8);
    const network = net(g);
    const sys = new GarbageTruckSystem();
    const depots = [
      {
        ...depot(1, 0, 0, 1),
        dumpPath: [
          { x: 0, z: 1 },
          { x: 0, z: 2 },
        ],
      },
    ];

    sys.tick({ network, depots, targets: [target(100, 6, 1)] });
    expect(countActive(sys.vehicleBuffer)).toBe(1);
    // No further targets -> the one dispatched truck runs its whole cycle and despawns.
    for (let t = 0; t < 100; t++) sys.tick({ network, depots, targets: [] });
    expect(countActive(sys.vehicleBuffer)).toBe(0);
  });

  it('without a dumpPath the truck resolves at the depot and never leaves road/target tiles', () => {
    const g = makeGrid();
    straightRoad(g, 0, 0, 8);
    const network = net(g);
    const sys = new GarbageTruckSystem();
    const depots = [depot(1, 0, 0, 1)];

    sys.tick({ network, depots, targets: [target(100, 6, 1)] });
    let sawActive = false;
    for (let t = 0; t < 100; t++) {
      sys.tick({ network, depots, targets: [] });
      for (let slot = 0; slot < MAX_GARBAGE_TRUCKS; slot++) {
        const base = slot * VEHICLE_STRIDE;
        const x = sys.vehicleBuffer[base]!;
        if (x === INACTIVE_VEHICLE_X) continue;
        sawActive = true;
        const tx = worldToTile(x);
        const tz = worldToTile(sys.vehicleBuffer[base + 1]!);
        const onRoad = g.roadTier[tileIndex(tx, tz)]! > 0;
        const onTarget = tx === 6 && tz === 1;
        expect(onRoad || onTarget).toBe(true);
      }
    }
    expect(sawActive).toBe(true);
    expect(countActive(sys.vehicleBuffer)).toBe(0); // despawned at the depot, no dump run
  });

  it('is deterministic with a dumpPath — identical inputs give byte-identical buffers', () => {
    function run(): Float32Array {
      const g = makeGrid();
      straightRoad(g, 0, 0, 10);
      const network = net(g);
      const sys = new GarbageTruckSystem();
      const depots = [
        {
          ...depot(1, 0, 0, 3),
          dumpPath: [
            { x: 0, z: 1 },
            { x: 0, z: 2 },
          ],
        },
      ];
      const targets = [target(100, 3, 1), target(101, 6, 1), target(102, 9, 1)];
      for (let t = 0; t < 300; t++) sys.tick({ network, depots, targets });
      return sys.vehicleBuffer.slice();
    }
    expect(Array.from(run())).toEqual(Array.from(run()));
  });
});
