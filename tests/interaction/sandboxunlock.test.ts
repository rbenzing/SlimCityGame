import { describe, expect, it } from 'vitest';
import { RoadTier, ZoneType } from '../../src/shared/types';
import {
  entryOf,
  GROWTH_TIMEOUT_MS,
  initialized,
  roadRow,
  rows,
  send,
  standingBuildings,
  type Harness,
} from '../support/sim';
import { guardRoadNetwork } from '../support/guard';

guardRoadNetwork();

const GROWTH_TICKS = 1500;

/**
 * A powered, watered street with a ResMedium strip painted along it, at the
 * start of the game (Tiny Village). Sandbox builds the street; `sandboxDuringGrowth`
 * says whether it is still on while the strip grows.
 */
function townWithMediumStrip(sandboxDuringGrowth: boolean): Harness {
  const h = initialized();
  send(h, 1, [
    { kind: 'setSandbox', on: true },
    { kind: 'setUnlimitedMoney', on: true },
    { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(60, 49, 32) },
  ]);
  h.ticks(1);
  send(h, 2, [
    { kind: 'placeBuilding', catalogId: 'wind-turbine', x: 60, z: 48, rotation: 0 },
    { kind: 'placeBuilding', catalogId: 'wind-turbine', x: 64, z: 48, rotation: 0 },
    { kind: 'placeBuilding', catalogId: 'water-tower', x: 66, z: 48, rotation: 0 },
    { kind: 'paintZone', zone: ZoneType.ResMedium, tiles: rows(60, 50, 32, 3) },
  ]);
  h.ticks(2);
  expect(h.ackFor(2)!.ok).toBe(true);
  if (!sandboxDuringGrowth) send(h, 3, [{ kind: 'setSandbox', on: false }]);
  h.ticks(GROWTH_TICKS);
  return h;
}

describe('sandbox lifts the unlock on what a lot grows', () => {
  it(
    'grows a ResMedium strip at Tiny Village while sandbox is on',
    () => {
      const h = townWithMediumStrip(true);
      expect(h.lastSnapshot()!.stats.milestoneLevel).toBe(0);
      const medium = [...standingBuildings(h).values()].filter(
        (b) => entryOf(b).zone === ZoneType.ResMedium,
      );
      expect(medium.length).toBeGreaterThan(0);
    },
    GROWTH_TIMEOUT_MS,
  );

  it(
    'leaves the same strip empty once sandbox is off, the zone still being locked',
    () => {
      const h = townWithMediumStrip(false);
      expect(h.lastSnapshot()!.stats.milestoneLevel).toBe(0);
      const medium = [...standingBuildings(h).values()].filter(
        (b) => entryOf(b).zone === ZoneType.ResMedium,
      );
      expect(medium).toEqual([]);
    },
    GROWTH_TIMEOUT_MS,
  );
});
