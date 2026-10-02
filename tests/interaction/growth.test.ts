import { describe, expect, it } from 'vitest';
import { BuildingState, Problem, RoadTier, ZoneType } from '../../src/shared/types';
import { BASE_MULTIPLIER, COMMERCIAL_SPAN_JOBS } from '../../src/sim/demand';
import {
  catalog,
  column,
  entryOf,
  GROWTH_TIMEOUT_MS,
  initialized,
  initializedAtMilestone5,
  roadRow,
  rows,
  send,
  standingBuildings,
} from '../support/sim';
import { guardRoadNetwork } from '../support/guard';

guardRoadNetwork();

describe('a small town grows the way a farming or mill town does', () => {
  it(
    'builds its industry before its shops, and no more shops than its industry supports',
    () => {
      const h = initialized();
      send(h, 1, [
        { kind: 'setSandbox', on: true },
        { kind: 'setUnlimitedMoney', on: true },
        { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(60, 49, 32) },
      ]);
      h.ticks(1);
      send(h, 2, [
        { kind: 'placeBuilding', catalogId: 'wind-turbine', x: 60, z: 48, rotation: 0 },
        { kind: 'placeBuilding', catalogId: 'wind-turbine', x: 61, z: 48, rotation: 0 },
        { kind: 'placeBuilding', catalogId: 'water-tower', x: 62, z: 47, rotation: 0 },
        { kind: 'paintZone', zone: ZoneType.ResLow, tiles: rows(60, 50, 16, 2) },
        { kind: 'paintZone', zone: ZoneType.Industrial, tiles: rows(76, 50, 16, 2) },
        { kind: 'paintZone', zone: ZoneType.ComLow, tiles: rows(66, 47, 26, 2) },
      ]);
      h.ticks(2);
      expect(h.ackFor(2)!.ok).toBe(true);
      h.ticks(2000);

      // Replay every snapshot's building log: what stands, and when each first stood Active.
      const catalogIdOf = new Map<number, string>();
      const activeAt = new Map<number, number>();
      const firstAdded = new Map<string, number>();
      const sectorOf = (id: number): string | undefined =>
        catalog.find((e) => e.id === catalogIdOf.get(id))?.category;
      for (const m of h.messages) {
        if (m.type !== 'snapshot' || !m.snap.buildings) continue;
        const { added, updated, removed } = m.snap.buildings;
        for (const b of [...added, ...updated]) {
          catalogIdOf.set(b.id, b.catalogId);
          const sector = sectorOf(b.id)!;
          if (!firstAdded.has(sector)) firstAdded.set(sector, m.snap.stats.tick);
          if (b.state === BuildingState.Active && !activeAt.has(b.id)) {
            activeAt.set(b.id, m.snap.stats.tick);
          }
        }
        for (const id of removed) catalogIdOf.delete(id);
      }
      const firstActive = (sector: string): number =>
        Math.min(...[...activeAt].filter(([id]) => sectorOf(id) === sector).map(([, t]) => t));
      const jobsOf = (sector: string): number =>
        [...catalogIdOf.keys()]
          .filter((id) => sectorOf(id) === sector)
          .reduce(
            (sum, id) => sum + (catalog.find((e) => e.id === catalogIdOf.get(id))?.jobs ?? 0),
            0,
          );

      expect(firstActive('ind')).toBeLessThan(Infinity);
      expect(jobsOf('com')).toBeGreaterThan(0);
      // No shop is even begun until an industrial building is open for work.
      expect(firstAdded.get('com')!).toBeGreaterThan(firstActive('ind'));
      // And the town's shops stay within what its industry supports — give or
      // take the one shop that fills the last gap, a building being the least a
      // town can grow by.
      expect(jobsOf('com')).toBeLessThanOrEqual(
        (BASE_MULTIPLIER - 1) * jobsOf('ind') + COMMERCIAL_SPAN_JOBS,
      );
    },
    GROWTH_TIMEOUT_MS,
  );
});

describe('a farming town', () => {
  it(
    'grows farms off a dirt road on a pole line, with no city water, and counts their work as industry',
    () => {
      const h = initialized();
      send(h, 1, [
        { kind: 'setSandbox', on: true },
        { kind: 'setUnlimitedMoney', on: true },
        // The town: a street with its own power and water, and homes on it.
        { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(60, 40, 24) },
        // The farms: a dirt road of their own, joined to nothing, with a line
        // strung along it from a turbine and no water anywhere near.
        { kind: 'buildRoad', tier: RoadTier.Gravel, tiles: roadRow(60, 60, 32) },
      ]);
      h.ticks(1);
      send(h, 2, [
        { kind: 'placeBuilding', catalogId: 'wind-turbine', x: 60, z: 39, rotation: 0 },
        { kind: 'placeBuilding', catalogId: 'water-tower', x: 62, z: 38, rotation: 0 },
        { kind: 'paintZone', zone: ZoneType.ResLow, tiles: rows(60, 41, 24, 2) },
        { kind: 'placeBuilding', catalogId: 'wind-turbine', x: 60, z: 59, rotation: 0 },
        { kind: 'stringPowerLine', tiles: roadRow(60, 60, 32), on: true },
        { kind: 'paintZone', zone: ZoneType.Agriculture, tiles: rows(60, 61, 32, 8) },
      ]);
      h.ticks(2);
      expect(h.ackFor(2)!.ok).toBe(true);
      // A paved street fronts no farmland: the land beside the town street refuses it.
      send(h, 3, [{ kind: 'paintZone', zone: ZoneType.Agriculture, tiles: rows(60, 43, 24, 2) }]);
      h.ticks(2);
      expect(h.ackFor(3)!.ok).toBe(false);
      h.ticks(3000);

      const farms = [...standingBuildings(h).values()].filter(
        (b) => entryOf(b).zone === ZoneType.Agriculture,
      );
      expect(farms.length).toBeGreaterThan(0);
      expect(farms.some((b) => b.state === BuildingState.Active)).toBe(true);
      // Level ground here is very fertile and its stony patches only somewhat:
      // crop farms and pasture, and no orchard on the flat.
      expect(farms.map((b) => entryOf(b).kind)).not.toContain('orchard');
      // All of it south of the dirt road, with no water ever reaching it.
      for (const b of farms) expect(b.z).toBeGreaterThan(60);
      expect(farms.every((b) => (b.problems & Problem.NoWater) === 0)).toBe(true);
      // Their work is the town's industry.
      const farmJobs = farms
        .filter((b) => b.state === BuildingState.Active)
        .reduce((sum, b) => sum + (entryOf(b).jobs ?? 0), 0);
      expect(h.lastSnapshot()!.stats.jobs).toBeGreaterThanOrEqual(farmJobs);
      expect(farmJobs).toBeGreaterThan(0);
    },
    GROWTH_TIMEOUT_MS,
  );
});

describe('a low-density strip one tile wide', () => {
  it(
    'grows the house-scale kinds that fit it, a duplex or a fourplex, and never a detached house',
    () => {
      const h = initializedAtMilestone5();
      send(h, 1, [
        { kind: 'setSandbox', on: true },
        { kind: 'setUnlimitedMoney', on: true },
        { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(60, 60, 12) },
      ]);
      h.ticks(1);
      send(h, 2, [
        { kind: 'placeBuilding', catalogId: 'wind-turbine', x: 60, z: 59, rotation: 0 },
        { kind: 'placeBuilding', catalogId: 'water-tower', x: 62, z: 58, rotation: 0 },
        // One tile wide, four deep: a 2×2 house can never fit, a 1×2 can.
        { kind: 'paintZone', zone: ZoneType.ResLow, tiles: column(66, 61, 4) },
      ]);
      h.ticks(2);
      expect(h.ackFor(2)!.ok).toBe(true);
      h.ticks(2000);

      const homes = [...standingBuildings(h).values()].filter(
        (b) => entryOf(b).zone === ZoneType.ResLow,
      );
      expect(homes.length).toBeGreaterThan(0);
      for (const b of homes) {
        expect(['duplex', 'fourplex']).toContain(entryOf(b).kind);
        expect(entryOf(b).footprint).toEqual({ w: 1, d: 2 });
      }
    },
    GROWTH_TIMEOUT_MS,
  );
});

describe('a country lane', () => {
  it(
    'grows houses off a dirt road on a pole line, each on its own well',
    () => {
      const h = initialized();
      send(h, 1, [
        { kind: 'setSandbox', on: true },
        { kind: 'setUnlimitedMoney', on: true },
        // A dirt road, a turbine and a line strung along it, and no water
        // tower anywhere on the map.
        { kind: 'buildRoad', tier: RoadTier.Gravel, tiles: roadRow(60, 60, 32) },
      ]);
      h.ticks(1);
      send(h, 2, [
        { kind: 'placeBuilding', catalogId: 'wind-turbine', x: 60, z: 59, rotation: 0 },
        { kind: 'stringPowerLine', tiles: roadRow(60, 60, 32), on: true },
        { kind: 'paintZone', zone: ZoneType.ResLow, tiles: rows(61, 61, 30, 2) },
      ]);
      h.ticks(2);
      expect(h.ackFor(2)!.ok).toBe(true);
      h.ticks(2000);

      const homes = [...standingBuildings(h).values()].filter(
        (b) => entryOf(b).zone === ZoneType.ResLow,
      );
      expect(homes.some((b) => b.state === BuildingState.Active)).toBe(true);
      expect(homes.every((b) => (b.problems & Problem.NoWater) === 0)).toBe(true);
      // Every one of them pumps its own: the mains carry nothing.
      const stats = h.lastSnapshot()!.stats;
      expect(stats.waterSupply).toBe(0);
      expect(stats.waterDemand).toBe(0);
    },
    GROWTH_TIMEOUT_MS,
  );
});
