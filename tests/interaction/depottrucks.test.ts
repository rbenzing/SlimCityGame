import { describe, expect, it } from 'vitest';
import { RoadTier, VEHICLE_STRIDE, VehicleKind, ZoneType } from '../../src/shared/types';
import { INACTIVE_VEHICLE_X } from '../../src/shared/types';
import { column, roadRow, rows, run, sandboxed } from '../support/sim';

/** Kinds of every service-slice vehicle on the road in the latest snapshot. */
function kindsOnRoad(vehicles: Float32Array): Set<number> {
  const kinds = new Set<number>();
  for (let slot = 0; slot < vehicles.length / VEHICLE_STRIDE; slot++) {
    const base = slot * VEHICLE_STRIDE;
    if (vehicles[base] === INACTIVE_VEHICLE_X) continue;
    kinds.add(vehicles[base + 4]!);
  }
  return kinds;
}

describe('depot trucks through the worker', () => {
  // The depot's origin corner stands three tiles from the street; only its far
  // row touches it, so the trucks must find the road from any tile of the lot.
  it('sends recycling trucks from a kerbside depot and refuse trucks from an incinerator', () => {
    const h = sandboxed();
    run(h, 1, [{ kind: 'setUnlimitedMoney', on: true }]);
    run(h, 2, [
      { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(100, 100, 40) },
      { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: column(120, 101, 12) },
    ]);
    run(h, 3, [
      { kind: 'placeBuilding', catalogId: 'coal-plant', x: 124, z: 96, rotation: 0 },
      { kind: 'placeBuilding', catalogId: 'water-tower', x: 130, z: 98, rotation: 0 },
      { kind: 'placeBuilding', catalogId: 'recycling-depot', x: 104, z: 97, rotation: 0 },
      { kind: 'placeBuilding', catalogId: 'incinerator', x: 121, z: 108, rotation: 0 },
    ]);
    run(h, 4, [
      { kind: 'paintZone', zone: ZoneType.ResLow, tiles: rows(101, 101, 18, 4) },
      { kind: 'paintZone', zone: ZoneType.ResLow, tiles: rows(122, 101, 12, 4) },
    ]);

    const seen = new Set<number>();
    for (let i = 0; i < 3000; i++) {
      h.ticks(1);
      const vehicles = h.lastSnapshot()?.vehicles;
      if (vehicles) for (const k of kindsOnRoad(vehicles)) seen.add(k);
      if (seen.has(VehicleKind.Recycling) && seen.has(VehicleKind.Garbage)) break;
    }
    expect(seen.has(VehicleKind.Recycling)).toBe(true);
    expect(seen.has(VehicleKind.Garbage)).toBe(true);
  }, 120_000);
});
