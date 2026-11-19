import { describe, expect, it } from 'vitest';
import { BuildingState, Problem, RoadTier, ZoneType } from '../../src/shared/types';
import { SMALL_CITY_MILESTONE } from '../../src/shared/constants';
import {
  column,
  entryOf,
  GROWTH_TIMEOUT_MS,
  initializedAtMilestone,
  pondAndDrain,
  roadRow,
  rows,
  send,
  standingBuildings,
} from '../support/sim';
import { guardRoadNetwork } from '../support/guard';

guardRoadNetwork();

/** The east-west streets and the avenue joining them. */
const STREETS_Z = [60, 68, 90, 98, 120, 150];
const AVENUE_X = 40;

describe('a town grown on commercial streets seven tiles apart', () => {
  it(
    'never flags a standing building NoRoad while a street is within three tiles of its lot',
    () => {
      const h = initializedAtMilestone(SMALL_CITY_MILESTONE);
      send(h, 1, [
        { kind: 'setSandbox', on: true },
        { kind: 'setUnlimitedMoney', on: true },
        { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: column(AVENUE_X, 36, 124) },
        { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(41, 36, 20) },
        ...STREETS_Z.map((z) => ({
          kind: 'buildRoad' as const,
          tier: RoadTier.TwoLane,
          tiles: roadRow(41, z, 60),
        })),
      ]);
      h.ticks(1);
      send(h, 2, [
        { kind: 'placeBuilding', catalogId: 'gas-turbine', x: 42, z: 34, rotation: 0 },
        { kind: 'placeBuilding', catalogId: 'gas-turbine', x: 46, z: 34, rotation: 0 },
        ...pondAndDrain({ x: 58, z: 34 }, { x: 58, z: 35 }),
        { kind: 'placeBuilding', catalogId: 'water-tower', x: 50, z: 35, rotation: 0 },
        { kind: 'placeBuilding', catalogId: 'water-tower', x: 52, z: 35, rotation: 0 },
        { kind: 'placeBuilding', catalogId: 'water-tower', x: 54, z: 35, rotation: 0 },
        { kind: 'placeBuilding', catalogId: 'water-tower', x: 56, z: 35, rotation: 0 },
        // Between two streets seven tiles apart every row is within three of one of them.
        { kind: 'paintZone', zone: ZoneType.ComHigh, tiles: rows(42, 61, 58, 7) },
        { kind: 'paintZone', zone: ZoneType.ComLow, tiles: rows(42, 91, 58, 7) },
        { kind: 'paintZone', zone: ZoneType.ResLow, tiles: rows(42, 117, 58, 3) },
        { kind: 'paintZone', zone: ZoneType.ResMedium, tiles: rows(42, 121, 58, 3) },
        { kind: 'paintZone', zone: ZoneType.Industrial, tiles: rows(42, 147, 58, 3) },
        { kind: 'paintZone', zone: ZoneType.Industrial, tiles: rows(42, 151, 58, 3) },
      ]);
      h.ticks(2);
      expect(h.ackFor(2)).toMatchObject({ ok: true });

      const built = new Set<number>();
      const noRoadAbandoned = new Set<string>();
      let seen = 0;
      for (let chunk = 0; chunk < 20; chunk++) {
        h.ticks(100);
        const from = seen;
        seen = h.messages.length;
        for (const m of h.messages.slice(from)) {
          if (m.type !== 'snapshot' || !m.snap.buildings) continue;
          for (const b of [...m.snap.buildings.added, ...m.snap.buildings.updated]) {
            if (entryOf(b).zone !== undefined) built.add(b.id);
            if (b.state === BuildingState.Abandoned && (b.problems & Problem.NoRoad) !== 0) {
              noRoadAbandoned.add(`${b.catalogId} at ${b.x},${b.z}`);
            }
          }
        }
      }
      const standing = [...standingBuildings(h).values()].filter((b) => entryOf(b).zone);

      expect(built.size).toBeGreaterThan(50);
      expect(standing.length).toBeGreaterThan(50);
      expect([...noRoadAbandoned]).toEqual([]);
    },
    GROWTH_TIMEOUT_MS,
  );
});
