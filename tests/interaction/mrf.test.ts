import { describe, expect, it } from 'vitest';
import { RoadTier, VEHICLE_STRIDE, VehicleKind, ZoneType } from '../../src/shared/types';
import { INACTIVE_VEHICLE_X } from '../../src/shared/types';
import type { Command } from '../../src/shared/types';
import { decodeSave } from '../../src/app/persist';
import {
  column,
  initializedAtMilestone,
  latestSaveData,
  roadRow,
  rows,
  run,
  standingBuildings,
  type Harness,
} from '../support/sim';

const MRF_AT = { x: 108, z: 94 };
const GROW_TICKS = 2_400;

/**
 * A street with a depot, a landfill, houses and shops on it; with `mrf` a
 * Materials Recovery Facility beside the depot. Both towns are the same
 * streets, zones and utilities.
 */
function town(mrf: boolean): Harness {
  // Busy Township grows small apartment blocks and is still on septic tanks;
  // the sandbox lets the Grand City plant be placed in it.
  const h = initializedAtMilestone(2);
  run(h, 1, [
    { kind: 'setSandbox', on: true },
    { kind: 'setUnlimitedMoney', on: true },
  ]);
  run(h, 2, [
    { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(100, 100, 40) },
    { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: column(120, 101, 12) },
  ]);
  const plops: Command[] = [
    { kind: 'placeBuilding', catalogId: 'coal-plant', x: 124, z: 96, rotation: 0 },
    { kind: 'placeBuilding', catalogId: 'water-tower', x: 130, z: 99, rotation: 0 },
    { kind: 'placeBuilding', catalogId: 'recycling-depot', x: 104, z: 97, rotation: 0 },
  ];
  if (mrf) {
    plops.push({
      kind: 'placeBuilding',
      catalogId: 'materials-recovery-facility',
      x: MRF_AT.x,
      z: MRF_AT.z,
      rotation: 0,
    });
  }
  expect(run(h, 3, plops).ok).toBe(true);
  expect(run(h, 4, [{ kind: 'paintLandfill', tiles: rows(132, 98, 8, 2), on: true }]).ok).toBe(
    true,
  );
  run(h, 5, [
    { kind: 'paintZone', zone: ZoneType.ResLow, tiles: rows(101, 101, 18, 4) },
    { kind: 'paintZone', zone: ZoneType.ResMedium, tiles: rows(122, 101, 12, 4) },
  ]);
  return h;
}

/** Recycling trucks on the road in the latest snapshot. */
function recyclingOnRoad(h: Harness): number {
  const vehicles = h.lastSnapshot()?.vehicles;
  if (!vehicles) return 0;
  let count = 0;
  for (let slot = 0; slot < vehicles.length / VEHICLE_STRIDE; slot++) {
    const base = slot * VEHICLE_STRIDE;
    if (vehicles[base] === INACTIVE_VEHICLE_X) continue;
    if (vehicles[base + 4] === VehicleKind.Recycling) count += 1;
  }
  return count;
}

const garbageSaved = (h: Harness) => {
  h.sim.handleMessage({ type: 'requestSave' });
  return decodeSave(latestSaveData(h)).meta.garbage!;
};

describe('a Materials Recovery Facility through the worker', () => {
  it('sorts the depot carts and its round, slows the landfill, books the credit and runs recycling trucks', () => {
    const withMrf = town(true);
    const without = town(false);
    const mrfId = [...standingBuildings(withMrf).values()].find(
      (b) => b.catalogId === 'materials-recovery-facility',
    )!.id;

    // The depot fields four recycling trucks; more than that on the road at
    // once can only be the MRF's.
    let mostWith = 0;
    let mostWithout = 0;
    for (let i = 0; i < GROW_TICKS; i++) {
      withMrf.ticks(1);
      without.ticks(1);
      mostWith = Math.max(mostWith, recyclingOnRoad(withMrf));
      mostWithout = Math.max(mostWithout, recyclingOnRoad(without));
    }

    // The same town grew on both sides, the MRF aside.
    const grown = (h: Harness): string[] =>
      [...standingBuildings(h).values()]
        .filter((b) => b.catalogId !== 'materials-recovery-facility')
        .map((b) => `${b.catalogId}@${b.x},${b.z}`)
        .sort();
    expect(grown(withMrf)).toEqual(grown(without));
    // Apartment blocks grew for the round to serve, and houses for the depot.
    expect(grown(withMrf).some((b) => /^res-(medium|multiplex)-/.test(b))).toBe(true);
    expect(grown(withMrf).some((b) => /^res-(normal|half)-/.test(b))).toBe(true);

    // The plant's readout, from the last snapshot that carried the garbage state.
    const readouts = withMrf.messages.flatMap((m) =>
      m.type === 'snapshot' && m.snap.garbage?.mrfs ? [m.snap.garbage.mrfs] : [],
    );
    const plant = readouts[readouts.length - 1]?.find((m) => m.id === mrfId);
    expect(plant).toBeDefined();
    expect(plant!.stopped).toBe(false);
    expect(readouts.some((r) => r.some((m) => m.servedBuildings > 0))).toBe(true);

    const a = garbageSaved(withMrf);
    const b = garbageSaved(without);
    // The round's recycling never reaches the landfill, and its residue does.
    expect(a.landfillStored).toBeLessThan(b.landfillStored);
    // Sorted in town or regionally, the carts earn alike; the round earns more.
    expect(a.recoveredThisMonth!).toBeGreaterThan(b.recoveredThisMonth!);
    expect(mostWithout).toBeLessThanOrEqual(4);
    expect(mostWith).toBeGreaterThan(4);
  }, 240_000);
});
