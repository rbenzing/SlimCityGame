import { describe, expect, it } from 'vitest';
import { BuildingState, Problem, RoadTier, ZoneType } from '../../src/shared/types';
import {
  entryOf,
  GROWTH_TIMEOUT_MS,
  initialized,
  roadRow,
  rows,
  send,
  standingBuildings,
} from '../support/sim';
import { guardRoadNetwork } from '../support/guard';

guardRoadNetwork();

describe('a farm whose dirt road is taken away', () => {
  it(
    'lapses with no road, while the farms still on the road stand',
    () => {
      const h = initialized();
      send(h, 1, [
        { kind: 'setSandbox', on: true },
        { kind: 'setUnlimitedMoney', on: true },
        // The town, whose people the farms' work is wanted by.
        { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(60, 40, 24) },
        { kind: 'buildRoad', tier: RoadTier.Gravel, tiles: roadRow(60, 60, 40) },
      ]);
      h.ticks(1);
      send(h, 2, [
        { kind: 'placeBuilding', catalogId: 'wind-turbine', x: 60, z: 39, rotation: 0 },
        { kind: 'placeBuilding', catalogId: 'water-tower', x: 62, z: 39, rotation: 0 },
        { kind: 'paintZone', zone: ZoneType.ResLow, tiles: rows(60, 41, 24, 2) },
        { kind: 'placeBuilding', catalogId: 'wind-turbine', x: 60, z: 59, rotation: 0 },
        { kind: 'stringPowerLine', tiles: roadRow(60, 60, 40), on: true },
        { kind: 'paintZone', zone: ZoneType.Agriculture, tiles: rows(60, 61, 40, 8) },
      ]);
      h.ticks(2);
      expect(h.ackFor(2)!.ok).toBe(true);
      h.ticks(3000);

      const farms = () =>
        [...standingBuildings(h).values()].filter((b) => entryOf(b).zone === ZoneType.Agriculture);
      const west = (b: { x: number }): boolean => b.x < 80;
      expect(farms().some((b) => b.state === BuildingState.Active && !west(b))).toBe(true);

      // Take the east half of the road away: its farms have no street within reach.
      send(h, 3, [{ kind: 'bulldoze', tiles: roadRow(80, 60, 20) }]);
      h.ticks(2);
      expect(h.ackFor(3)!.ok).toBe(true);
      // A lapsed farm is cleared away not long after, so it is looked for as it lapses.
      const lapsedNow = (): ReturnType<typeof farms> =>
        farms().filter(
          (b) => b.state === BuildingState.Abandoned && (b.problems & Problem.NoRoad) !== 0,
        );
      let lapsed = lapsedNow();
      for (let t = 0; t < 2000 && lapsed.length === 0; t += 4) {
        h.ticks(4);
        lapsed = lapsedNow();
      }
      expect(lapsed.length).toBeGreaterThan(0);
      // Only the farms the road left are lapsed.
      expect(lapsed.every((b) => b.x >= 76)).toBe(true);
      expect(farms().some((b) => west(b) && b.state === BuildingState.Active)).toBe(true);
    },
    GROWTH_TIMEOUT_MS,
  );
});
