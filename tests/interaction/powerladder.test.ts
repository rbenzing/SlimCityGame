import { describe, expect, it } from 'vitest';
import { MAP_SIZE, MILESTONES, tileIndex } from '../../src/shared/constants';
import { averageOutputMW } from '../../src/shared/power';
import { FieldId, RoadTier } from '../../src/shared/types';
import type { BuildingCatalogEntry, Command, GridState, MapData } from '../../src/shared/types';
import { decodeSave, encodeSave } from '../../src/app/persist';
import { generateProceduralMap } from '../../src/world/maps';
import { canPlaceFootprint, hasAdjacentWater } from '../../src/world/grid';
import {
  catalog,
  flatMap,
  latestSaveData,
  latestSaveGrid,
  makeHarness,
  roadRow,
  run,
  send,
  standingBuildings,
  type Harness,
} from '../support/sim';
import { guardRoadNetwork } from '../support/guard';

guardRoadNetwork();

const entryNamed = (id: string): BuildingCatalogEntry => {
  const entry = catalog.find((e) => e.id === id);
  if (!entry) throw new Error(`no catalog entry ${id}`);
  return entry;
};
const milestoneNamed = (name: string): number => MILESTONES.findIndex((m) => m.name === name);

const place = (catalogId: string, x: number, z: number): Command => ({
  kind: 'placeBuilding',
  catalogId,
  x,
  z,
  rotation: 0,
});

/** A sandbox with unlimited money on `map`, where every plant is unlocked and affordable. */
function sandboxOn(map: MapData = flatMap()): Harness {
  const h = makeHarness();
  h.sim.handleMessage({ type: 'init', seed: 1337, map });
  expect(
    run(h, 0, [
      { kind: 'setSandbox', on: true },
      { kind: 'setUnlimitedMoney', on: true },
    ]).ok,
  ).toBe(true);
  return h;
}

/** A flat map with a lake along x 100–140, z 70–74, its water a tile below the banks. */
function lakeMap(): MapData {
  const map = flatMap();
  for (let z = 70; z <= 74; z++) {
    for (let x = 100; x <= 140; x++) {
      map.water[tileIndex(x, z)] = 1;
      map.height[tileIndex(x, z)] = 4;
    }
  }
  return map;
}

/** The latest full-map field the harness posted for `field`. */
function fieldNow(h: Harness, field: FieldId): Uint8Array {
  h.sim.handleMessage({ type: 'requestField', field });
  for (let i = h.messages.length - 1; i >= 0; i--) {
    const m = h.messages[i]!;
    if (m.type === 'field' && m.field === field) return m.data;
  }
  throw new Error('no field message');
}

/** A street with a coal plant, a turbine and three civic buildings on it: the cities that existed before the ladder. */
function cityBeforeTheLadder(): Harness {
  const h = sandboxOn();
  const ack = run(h, 1, [
    { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(60, 60, 30) },
    place('coal-plant', 60, 56),
    place('wind-turbine', 66, 59),
    place('police-station', 72, 61),
    place('clinic', 76, 61),
    place('school', 80, 61),
  ]);
  expect(ack.ok).toBe(true);
  h.ticks(20);
  return h;
}

function savedBytes(h: Harness): ArrayBuffer {
  h.sim.handleMessage({ type: 'requestSave' });
  return latestSaveData(h);
}

function savedGrid(h: Harness): GridState {
  h.sim.handleMessage({ type: 'requestSave' });
  return latestSaveGrid(h);
}

function reloaded(data: ArrayBuffer): Harness {
  const fresh = makeHarness();
  fresh.sim.handleMessage({ type: 'init', seed: 1337, map: flatMap() });
  fresh.sim.handleMessage({ type: 'loadSave', data });
  fresh.ticks(4);
  return fresh;
}

describe('a city saved before the ladder loads after it, unchanged', () => {
  it('keeps every building, the supply, the demand and the coverage', () => {
    const before = cityBeforeTheLadder();
    const beforeStats = before.lastSnapshot()!.stats;
    const beforeGrid = savedGrid(before);
    const beforeIds = [...standingBuildings(before).values()].map((b) => b.catalogId).sort();

    const after = reloaded(savedBytes(before));
    const afterStats = after.lastSnapshot()!.stats;
    const afterGrid = savedGrid(after);

    expect(afterStats.powerSupply).toBeCloseTo(
      averageOutputMW(entryNamed('coal-plant').utility!) +
        averageOutputMW(entryNamed('wind-turbine').utility!),
      6,
    );
    expect(afterStats.powerDemand).toBeGreaterThan(0);
    expect(afterStats.powerSupply).toBe(beforeStats.powerSupply);
    expect(afterStats.powerDemand).toBe(beforeStats.powerDemand);
    expect(afterGrid.power.some((v) => v === 1)).toBe(true);
    expect(afterGrid.power).toEqual(beforeGrid.power);
    expect([...standingBuildings(after).values()].map((b) => b.catalogId).sort()).toEqual(
      beforeIds,
    );
  });

  it('loads a save naming a plant the catalog does not hold, and counts nothing for it', () => {
    const before = cityBeforeTheLadder();
    const beforeStats = before.lastSnapshot()!.stats;
    const payload = decodeSave(savedBytes(before));
    payload.meta.registry.buildings.push({
      id: payload.meta.registry.nextId,
      catalogId: 'fusion-plant',
      x: 120,
      z: 120,
      rotation: 0,
      level: 1,
      state: 1,
      problems: 0,
      w: 3,
      d: 3,
    });
    payload.meta.registry.nextId += 1;

    let after: Harness | undefined;
    expect(() => {
      after = reloaded(encodeSave(payload));
    }).not.toThrow();
    const stats = after!.lastSnapshot()!.stats;
    expect(stats.powerSupply).toBe(beforeStats.powerSupply);
    expect(stats.powerDemand).toBe(beforeStats.powerDemand);
  });
});

describe('each new plant adds its average output to the supply', () => {
  const PLANTS = [
    { id: 'solar-farm', at: { x: 150, z: 150 }, MW: 0.232 },
    { id: 'gas-turbine', at: { x: 150, z: 150 }, MW: 6.95 },
    { id: 'combined-cycle', at: { x: 150, z: 150 }, MW: 53.845 },
    { id: 'nuclear-plant', at: { x: 100, z: 75 }, MW: 69.916 },
  ];

  it.each(PLANTS)('raises the supply by exactly $MW MW for the $id and leaves the demand', (p) => {
    const h = sandboxOn(lakeMap());
    expect(
      run(h, 1, [
        { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(60, 60, 30) },
        place('wind-turbine', 66, 59),
        place('school', 72, 61),
      ]).ok,
    ).toBe(true);
    h.ticks(8);
    const base = h.lastSnapshot()!.stats;
    expect(base.powerSupply).toBeCloseTo(0.2, 6);
    expect(base.powerDemand).toBeGreaterThan(0);

    const entry = entryNamed(p.id);
    expect(averageOutputMW(entry.utility!)).toBeCloseTo(p.MW, 6);
    expect(run(h, 2, [place(p.id, p.at.x, p.at.z)]).ok).toBe(true);
    h.ticks(8);
    const stats = h.lastSnapshot()!.stats;
    expect(stats.powerSupply - base.powerSupply).toBeCloseTo(p.MW, 6);
    expect(stats.powerDemand).toBe(base.powerDemand);
  });

  it('puts each plant behind the milestone the design names', () => {
    const h = makeHarness();
    h.sim.handleMessage({ type: 'init', seed: 1337, map: lakeMap() });
    const rungs = [
      ['solar-farm', 'Tiny Village'],
      ['gas-turbine', 'Small Town'],
      ['combined-cycle', 'Small City'],
      ['nuclear-plant', 'Grand City'],
    ] as const;
    for (const [id, milestone] of rungs) {
      expect(entryNamed(id).unlockMilestone).toBe(milestoneNamed(milestone));
    }
    const ack = run(h, 1, [place('nuclear-plant', 100, 75)]);
    expect(ack.ok).toBe(false);
    expect(ack.reason).toBe('locked');
  });
});

describe('the nuclear station stands on a shore, and the other shore and rail gates hold', () => {
  it('refuses a reactor with no water beside it, takes it one tile nearer the shore, never on water', () => {
    const h = sandboxOn(lakeMap());
    expect(run(h, 1, [place('nuclear-plant', 100, 76)]).ok).toBe(false);
    expect(run(h, 2, [place('nuclear-plant', 100, 72)]).ok).toBe(false);
    expect(run(h, 3, [place('nuclear-plant', 100, 69)]).ok).toBe(false);
    expect(run(h, 4, [place('nuclear-plant', 100, 75)]).ok).toBe(true);
  });

  it('takes a reactor whose side, not its end, touches the water', () => {
    const h = sandboxOn(lakeMap());
    // Footprint x 94–99, z 70–74: standing on land, with the lake against its east edge.
    expect(run(h, 1, [place('nuclear-plant', 94, 70)]).ok).toBe(true);
  });

  it('still holds the pumping station, the drain and the treatment works to a shore', () => {
    const h = sandboxOn(lakeMap());
    for (const [i, id] of ['water-pump', 'water-drain', 'sewage-works'].entries()) {
      const x = 105 + i * 8;
      expect(run(h, i * 2 + 1, [place(id, x, 78)]).ok).toBe(false);
      expect(run(h, i * 2 + 2, [place(id, x, 75)]).ok).toBe(true);
    }
  });

  it('still holds a rail station to the track', () => {
    const h = sandboxOn(lakeMap());
    expect(run(h, 1, [place('rail-station', 60, 101)]).ok).toBe(false);
    expect(
      run(h, 2, [
        { kind: 'buildRoad', tier: RoadTier.RailTrack, tiles: roadRow(56, 100, 12) },
        place('rail-station', 60, 101),
      ]).ok,
    ).toBe(true);
  });
});

describe('a short grid is cut from the far end and a new plant gives it back', () => {
  const litSchools = (h: Harness): number[] => {
    const grid = savedGrid(h);
    return [...standingBuildings(h).values()]
      .filter((b) => b.catalogId === 'school' && grid.power[tileIndex(b.x, b.z)] === 1)
      .map((b) => b.x)
      .sort((a, b) => a - b);
  };

  it('restores exactly the buildings the cut removed', () => {
    const h = sandboxOn();
    const schoolXs = [66, 70, 74, 78, 82];
    expect(
      run(h, 1, [
        { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(60, 60, 40) },
        place('solar-farm', 60, 54),
        ...schoolXs.map((x) => place('school', x, 61)),
      ]).ok,
    ).toBe(true);
    h.ticks(60);

    // Five schools draw more than the farm's 0.232 MW: the two furthest go dark.
    const school = entryNamed('school');
    const supply = h.lastSnapshot()!.stats.powerSupply;
    expect(supply).toBeCloseTo(0.232, 6);
    expect(school.powerUse * schoolXs.length).toBeGreaterThan(supply);
    const stillLit = litSchools(h);
    expect(stillLit).toEqual([66, 70, 74]);
    expect(schoolXs.filter((x) => !stillLit.includes(x))).toEqual([78, 82]);

    // A combined-cycle station beside the street lights every one again.
    expect(run(h, 2, [place('combined-cycle', 90, 57)]).ok).toBe(true);
    h.ticks(60);
    expect(litSchools(h)).toEqual(schoolXs);
  });
});

describe('what a plant puts in the air', () => {
  /** The pollution the plant's own tile holds on the first tick it has any, or 0 if it never does. */
  function firstEmission(id: string): number {
    const h = sandboxOn();
    send(h, 1, [place(id, 100, 100)]);
    const i = tileIndex(100, 100);
    for (let tick = 0; tick < 24; tick++) {
      h.ticks(1);
      const here = fieldNow(h, FieldId.Pollution)[i]!;
      if (here > 0) {
        expect(h.ackFor(1)!.ok).toBe(true);
        return here;
      }
    }
    expect(h.ackFor(1)!.ok).toBe(true);
    return 0;
  }

  it('writes the combined-cycle station’s 26 and the gas turbine’s 5 at their own tiles', () => {
    expect(firstEmission('combined-cycle')).toBe(26);
    expect(firstEmission('gas-turbine')).toBe(5);
  });

  it('writes nothing for the solar farm or the reactor', () => {
    expect(firstEmission('solar-farm')).toBe(0);
    const h = sandboxOn(lakeMap());
    expect(run(h, 1, [place('nuclear-plant', 100, 75)]).ok).toBe(true);
    h.ticks(24);
    expect(fieldNow(h, FieldId.Pollution).every((v) => v === 0)).toBe(true);
  });
});

describe('the reactor’s 6x5 finds a shore on generated maps', () => {
  const SEEDS = [1337, 1, 2, 7, 42, 2024];
  const reactor = entryNamed('nuclear-plant');

  it.each(SEEDS)('has legal shoreline sites on the map for seed %i', (seed) => {
    const h = sandboxOn(generateProceduralMap(seed, 'Shore'));
    const g = savedGrid(h);
    const { w, d } = reactor.footprint;
    const sites: { x: number; z: number }[] = [];
    for (let z = 0; z + d <= MAP_SIZE; z++) {
      for (let x = 0; x + w <= MAP_SIZE; x++) {
        if (canPlaceFootprint(g, x, z, w, d) && hasAdjacentWater(g, x, z, w, d)) {
          sites.push({ x, z });
        }
      }
    }
    expect(sites.length).toBeGreaterThan(0);

    // The sim agrees with the scan: the first site it found takes the station.
    const first = sites[0]!;
    expect(run(h, 1, [place('nuclear-plant', first.x, first.z)]).ok).toBe(true);
  });
});
