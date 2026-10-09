import { describe, expect, it } from 'vitest';
import { RoadTier, ZoneType } from '../../src/shared/types';
import type { Command } from '../../src/shared/types';
import { MAP_SIZE } from '../../src/shared/constants';
import { decodeSave } from '../../src/app/persist';
import {
  initializedAtMilestone,
  latestSaveData,
  latestTrash,
  roadRow,
  rows,
  run,
  standingBuildings,
  type Harness,
} from '../support/sim';

const STATION_AT = { x: 140, z: 95 };
/** The far neighbourhood: houses some 90 road tiles from the landfill's street. */
const FAR = { x0: 150, x1: 169 };
const GROW_TICKS = 2_000;

/**
 * One long street, x 60–179: a landfill at its west end, whose 28-tile reach
 * covers the near houses and not the far ones; with `station` a transfer
 * station near the far houses. Both towns are the same streets, zones and
 * utilities.
 */
function town(station: boolean): Harness {
  // Busy Township grows houses on septic tanks; the sandbox lets the Small City
  // station be placed in it.
  const h = initializedAtMilestone(2);
  run(h, 1, [
    { kind: 'setSandbox', on: true },
    { kind: 'setUnlimitedMoney', on: true },
  ]);
  run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(60, 100, 120) }]);
  const plops: Command[] = [
    { kind: 'placeBuilding', catalogId: 'coal-plant', x: 110, z: 96, rotation: 0 },
    { kind: 'placeBuilding', catalogId: 'water-tower', x: 85, z: 99, rotation: 0 },
    { kind: 'placeBuilding', catalogId: 'water-tower', x: 148, z: 99, rotation: 0 },
  ];
  if (station) {
    plops.push({
      kind: 'placeBuilding',
      catalogId: 'transfer-station',
      x: STATION_AT.x,
      z: STATION_AT.z,
      rotation: 0,
    });
  }
  expect(run(h, 3, plops).ok).toBe(true);
  expect(run(h, 4, [{ kind: 'paintLandfill', tiles: rows(62, 98, 8, 2), on: true }]).ok).toBe(true);
  run(h, 5, [
    { kind: 'paintZone', zone: ZoneType.ResLow, tiles: rows(72, 101, 12, 4) },
    { kind: 'paintZone', zone: ZoneType.ResLow, tiles: rows(FAR.x0, 101, FAR.x1 - FAR.x0 + 1, 4) },
  ]);
  return h;
}

const garbageSaved = (h: Harness) => {
  h.sim.handleMessage({ type: 'requestSave' });
  return decodeSave(latestSaveData(h)).meta.garbage!;
};

/** Uncollected trash on the far neighbourhood's tiles, as the trash lens holds it. */
function farTrash(h: Harness): number {
  const trash = latestTrash(h);
  let sum = 0;
  for (let z = 101; z <= 104; z++) {
    for (let x = FAR.x0; x <= FAR.x1; x++) sum += trash[z * MAP_SIZE + x]!;
  }
  return sum;
}

describe('a transfer station through the worker', () => {
  it("collects a neighbourhood beyond the landfill's reach and fills the landfill by what it forwards", () => {
    const withStation = town(true);
    const without = town(false);
    for (let i = 0; i < GROW_TICKS; i++) {
      withStation.ticks(1);
      without.ticks(1);
    }
    const stationId = [...standingBuildings(withStation).values()].find(
      (b) => b.catalogId === 'transfer-station',
    )!.id;

    // The landfill's side of town grew the same on both sides, so it took the
    // same trash from it; the far houses grew on both (a lot or two may differ
    // there, beside the station).
    const grownWest = (h: Harness): string[] =>
      [...standingBuildings(h).values()]
        .filter((b) => b.x < 100)
        .map((b) => `${b.catalogId}@${b.x},${b.z}`)
        .sort();
    expect(grownWest(withStation)).toEqual(grownWest(without));
    for (const h of [withStation, without]) {
      expect([...standingBuildings(h).values()].some((b) => b.x >= FAR.x0 && b.z > 100)).toBe(true);
    }

    // Without the station the far houses' trash piles up; with it, none is left.
    expect(farTrash(without)).toBeGreaterThan(0);
    expect(farTrash(withStation)).toBe(0);

    // Every pass's readout: the station collected, forwarded everything to the
    // landfill, and was never stopped.
    const readouts = withStation.messages.flatMap((m) =>
      m.type === 'snapshot' && m.snap.garbage?.transfers
        ? m.snap.garbage.transfers.filter((s) => s.id === stationId)
        : [],
    );
    const collected = readouts.reduce((sum, s) => sum + s.collected, 0);
    const forwarded = readouts.reduce((sum, s) => sum + s.forwarded, 0);
    expect(collected).toBeGreaterThan(0);
    expect(forwarded).toBe(collected);
    expect(readouts.every((s) => !s.stopped && s.stored === 0)).toBe(true);

    // The landfill took exactly what the station forwarded on top of the near houses'.
    const a = garbageSaved(withStation);
    const b = garbageSaved(without);
    expect(a.landfillStored - b.landfillStored).toBe(forwarded);
    expect(a.transfers ?? []).toEqual([]);
    expect(a.recoveredThisMonth ?? 0).toBe(b.recoveredThisMonth ?? 0);
  }, 240_000);
});
