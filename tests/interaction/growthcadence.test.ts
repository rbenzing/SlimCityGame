import { describe, expect, it } from 'vitest';
import { decodeSave } from '../../src/app/persist';
import { SPEED_MULTIPLIERS, TICK_MS } from '../../src/shared/constants';
import { RoadTier, ZoneType } from '../../src/shared/types';
import type { Command } from '../../src/shared/types';
import {
  GROWTH_TIMEOUT_MS,
  initialized,
  latestSaveData,
  roadRow,
  rows,
  run,
  standingBuildings,
  type Harness,
} from '../support/sim';
import { guardRoadNetwork } from '../support/guard';

guardRoadNetwork();

/** The opening a new game offers: a street, power, water and a strip of each zone. */
const TOWN: Command[] = [
  { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(60, 49, 32) },
  { kind: 'placeBuilding', catalogId: 'wind-turbine', x: 60, z: 48, rotation: 0 },
  { kind: 'placeBuilding', catalogId: 'wind-turbine', x: 64, z: 48, rotation: 0 },
  { kind: 'placeBuilding', catalogId: 'water-tower', x: 66, z: 48, rotation: 0 },
  { kind: 'paintZone', zone: ZoneType.ResLow, tiles: rows(60, 50, 16, 2) },
  { kind: 'paintZone', zone: ZoneType.Industrial, tiles: rows(76, 50, 16, 2) },
  { kind: 'paintZone', zone: ZoneType.ComLow, tiles: rows(66, 47, 26, 2) },
];

const TARGET_TICKS = 2000;

interface Saved {
  tick: number;
  population: number;
  buildings: number;
  data: Uint8Array;
}

/** The tick the sim has reached, read from a save (a snapshot lags by up to a tick). */
function simTick(h: Harness): number {
  h.sim.handleMessage({ type: 'requestSave' });
  return decodeSave(latestSaveData(h)).meta.stats.tick;
}

function saved(h: Harness): Saved {
  h.sim.handleMessage({ type: 'setSpeed', speed: 1 });
  h.sim.handleMessage({ type: 'requestSave' });
  const data = latestSaveData(h);
  const stats = decodeSave(data).meta.stats;
  return {
    tick: stats.tick,
    population: stats.population,
    buildings: standingBuildings(h).size,
    data: new Uint8Array(data),
  };
}

function town(): Harness {
  const h = initialized();
  expect(run(h, 1, TOWN).ok).toBe(true);
  return h;
}

describe('growth does not depend on how ticks are pumped', () => {
  it(
    'grows the same town to the same saved bytes one tick a pump and at speed 4',
    () => {
      const single = town();
      single.ticks(TARGET_TICKS - simTick(single));
      const one = saved(single);

      const fast = town();
      fast.sim.handleMessage({ type: 'setSpeed', speed: 4 });
      // Bulk at the worker's speed-4 rate, stopping short of the target.
      while (fast.lastSnapshot()!.stats.tick <= TARGET_TICKS - 12) fast.sim.pump(TICK_MS);
      // Finish a tick at a time: a pump of a tenth of a tick never runs two.
      fast.sim.handleMessage({ type: 'setSpeed', speed: 1 });
      const sliver = TICK_MS / SPEED_MULTIPLIERS[1] / 10;
      while (simTick(fast) < TARGET_TICKS) fast.sim.pump(sliver);
      const many = saved(fast);

      expect(one.tick).toBe(TARGET_TICKS);
      expect(many.tick).toBe(one.tick);
      expect(one.population).toBeGreaterThan(0);
      expect(many.population).toBe(one.population);
      expect(many.buildings).toBe(one.buildings);
      expect(many.data).toEqual(one.data);
    },
    GROWTH_TIMEOUT_MS,
  );
});
