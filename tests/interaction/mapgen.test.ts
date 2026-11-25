import { describe, expect, it } from 'vitest';
import { decodeSave, encodeSave } from '../../src/app/persist';
import { terrainSource } from '../../src/app/session';
import { MapGenerator } from '../../src/shared/types';
import type { Command, MapData } from '../../src/shared/types';
import { BuildingState, RoadTier, ZoneType } from '../../src/shared/types';
import { generateMap, terrainBuildable } from '../../src/world/maps';
import {
  GROWTH_TIMEOUT_MS,
  entryOf,
  latestSaveData,
  makeHarness,
  roadRow,
  rows,
  run,
  standingBuildings,
  type Harness,
} from '../support/sim';
import { guardRoadNetwork } from '../support/guard';

guardRoadNetwork();

function booted(map: MapData, seed: number, generator?: number): Harness {
  const h = makeHarness();
  h.sim.handleMessage({
    type: 'init',
    seed,
    map,
    ...(generator === undefined ? {} : { generator: generator as 1 | 2 }),
  });
  return h;
}

function savedHeader(h: Harness) {
  h.sim.handleMessage({ type: 'requestSave' });
  return decodeSave(latestSaveData(h)).header;
}

const sameTerrain = (a: MapData, b: MapData): boolean =>
  a.height.every((v, i) => v === b.height[i]) &&
  a.water.every((v, i) => v === b.water[i]) &&
  a.trees.every((v, i) => v === b.trees[i]);

describe('a save keeps the terrain it was made on', () => {
  it('records generator 2 and loads back onto the same coast', () => {
    const seed = 4242;
    const map = generateMap(MapGenerator.Coast, seed, 'Coast');
    const h = booted(map, seed, MapGenerator.Coast);
    const header = savedHeader(h);
    expect(header.generator).toBe(MapGenerator.Coast);
    expect(header.seed).toBe(seed);

    const source = terrainSource({ seed: 0 }, header);
    expect(source).toEqual({ seed, generator: MapGenerator.Coast });
    expect(sameTerrain(generateMap(source.generator, source.seed, 'Coast'), map)).toBe(true);

    // The worker takes the save back and writes the same id again.
    h.sim.handleMessage({ type: 'loadSave', data: latestSaveData(h) });
    expect(savedHeader(h).generator).toBe(MapGenerator.Coast);
  });

  it('loads a save with no generator id onto generator 1', () => {
    const seed = 4242;
    const hills = generateMap(MapGenerator.Hills, seed, 'Hills');
    const h = booted(hills, seed);
    h.sim.handleMessage({ type: 'requestSave' });
    const old = decodeSave(latestSaveData(h));
    delete old.header.generator;

    const source = terrainSource({ seed: 0 }, old.header);
    expect(source).toEqual({ seed, generator: MapGenerator.Hills });
    expect(sameTerrain(generateMap(source.generator, source.seed, 'Hills'), hills)).toBe(true);

    h.sim.handleMessage({ type: 'loadSave', data: encodeSave(old) });
    expect(savedHeader(h).generator).toBe(MapGenerator.Hills);
  });

  it('gives a new game with no generator named the first, and a named one its own', () => {
    expect(terrainSource({ seed: 5 })).toEqual({ seed: 5, generator: MapGenerator.Hills });
    expect(terrainSource({ seed: 5, generator: MapGenerator.Coast })).toEqual({
      seed: 5,
      generator: MapGenerator.Coast,
    });
  });
});

/** The first town's frozen scenario, moved so its street starts at (x0, z0 + 2). */
function firstTownAt(x0: number, z0: number): Command[] {
  return [
    { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(x0, z0 + 2, 32) },
    { kind: 'placeBuilding', catalogId: 'wind-turbine', x: x0, z: z0 + 1, rotation: 0 },
    { kind: 'placeBuilding', catalogId: 'wind-turbine', x: x0 + 4, z: z0 + 1, rotation: 0 },
    { kind: 'placeBuilding', catalogId: 'water-tower', x: x0 + 6, z: z0 + 1, rotation: 0 },
    { kind: 'paintZone', zone: ZoneType.ResLow, tiles: rows(x0, z0 + 3, 16, 2) },
    { kind: 'paintZone', zone: ZoneType.Industrial, tiles: rows(x0 + 16, z0 + 3, 16, 2) },
    { kind: 'paintZone', zone: ZoneType.ComLow, tiles: rows(x0 + 6, z0, 26, 2) },
  ];
}

/** The nearest top-left corner to the spawn whose whole 32 x 7 block is dry, level ground. */
function siteNearSpawn(map: MapData): { x: number; z: number } {
  const clear = (x0: number, z0: number): boolean => {
    for (let z = z0; z < z0 + 7; z++)
      for (let x = x0; x < x0 + 32; x++)
        if (!terrainBuildable(map.size, map.height, map.water, x, z)) return false;
    return true;
  };
  let best: { x: number; z: number } | null = null;
  let bestDist = Infinity;
  for (let z0 = 8; z0 < map.size - 16; z0 += 2) {
    for (let x0 = 8; x0 < map.size - 40; x0 += 2) {
      const dist = Math.hypot(x0 + 16 - map.spawn.x, z0 + 3 - map.spawn.z);
      if (dist < bestDist && clear(x0, z0)) {
        best = { x: x0, z: z0 };
        bestDist = dist;
      }
    }
  }
  if (!best) throw new Error('no level ground for the first town');
  return best;
}

describe('the first town on the coast', () => {
  it(
    'grows homes, shops and industry from the opening commands alone, beside the spawn',
    () => {
      const seed = 31337;
      const map = generateMap(MapGenerator.Coast, seed, 'Coast');
      const site = siteNearSpawn(map);
      expect(Math.hypot(site.x + 16 - map.spawn.x, site.z + 3 - map.spawn.z)).toBeLessThan(40);
      const h = booted(map, seed, MapGenerator.Coast);
      const opening = firstTownAt(site.x, site.z);
      const allowed = new Set(['buildRoad', 'placeBuilding', 'paintZone']);
      expect(opening.every((c) => allowed.has(c.kind))).toBe(true);
      expect(run(h, 1, opening).ok).toBe(true);
      h.ticks(2000);
      const sectors = new Set<string>();
      for (const b of standingBuildings(h).values()) {
        const entry = entryOf(b);
        if (entry.zone !== undefined && b.state === BuildingState.Active)
          sectors.add(entry.category);
      }
      expect(sectors).toEqual(new Set(['res', 'com', 'ind']));
    },
    GROWTH_TIMEOUT_MS,
  );
});
