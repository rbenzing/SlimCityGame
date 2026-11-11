import { describe, expect, it } from 'vitest';
import { MAP_SIZE, tileIndex } from '../../src/shared/constants';
import { PLACEMENT_REFUSALS } from '../../src/shared/placement';
import { RoadTier } from '../../src/shared/types';
import type { Command, MapData } from '../../src/shared/types';
import { ClientGridMirror } from '../../src/app/clientgrid';
import { decodeSave, encodeSave } from '../../src/app/persist';
import {
  catalog,
  feedMirror,
  flatMap,
  initialized,
  latestSaveData,
  latestSaveGrid,
  makeHarness,
  roadRow,
  run,
  sandboxed,
  standingBuildings,
  type Harness,
} from '../support/sim';
import { guardRoadNetwork } from '../support/guard';

guardRoadNetwork();

const place = (catalogId: string, x: number, z: number): Command => ({
  kind: 'placeBuilding',
  catalogId,
  x,
  z,
  rotation: 0,
});
const street = (tier: RoadTier, x: number, z: number, len = 4): Command => ({
  kind: 'buildRoad',
  tier,
  tiles: roadRow(x, z, len),
});

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

function sandboxOn(map: MapData): Harness {
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

describe('a placed building stands beside a street [R-world-049]', () => {
  const tower = 'water-tower'; // 1 x 1, no other need

  it('refuses a building off the street, and says so', () => {
    const h = sandboxed();
    const ack = run(h, 1, [place(tower, 60, 60)]);
    expect(ack.ok).toBe(false);
    expect(ack.reason).toBe(PLACEMENT_REFUSALS.needsStreet);
    expect(ack.cost).toBe(0);
  });

  it('does not lift the rule for sandbox or unlimited money', () => {
    const h = sandboxOn(flatMap());
    expect(run(h, 1, [place(tower, 60, 60)]).reason).toBe(PLACEMENT_REFUSALS.needsStreet);
  });

  it.each([
    ['a two-lane street', RoadTier.TwoLane],
    ['a gravel road', RoadTier.Gravel],
    ['an alley', RoadTier.Alley],
    ['an avenue', RoadTier.Avenue],
    ['a tram street', RoadTier.Tram],
  ])('takes a building beside %s', (_name, tier) => {
    const h = sandboxed();
    expect(run(h, 1, [street(tier, 58, 59), place(tower, 60, 60)]).ok).toBe(true);
  });

  it.each([
    ['a motorway', RoadTier.Highway],
    ['a railway', RoadTier.RailTrack],
  ])('refuses a building beside %s alone', (_name, tier) => {
    const h = sandboxed();
    expect(run(h, 1, [street(tier, 58, 59)]).ok).toBe(true);
    const ack = run(h, 2, [place(tower, 60, 60)]);
    expect(ack.ok).toBe(false);
    expect(ack.reason).toBe(PLACEMENT_REFUSALS.needsStreet);
  });

  it('refuses a building a tile away from the street, and one touching it only at a corner', () => {
    const h = sandboxed();
    expect(run(h, 1, [street(RoadTier.TwoLane, 58, 59, 2)]).ok).toBe(true); // x 58-59, z 59
    expect(run(h, 2, [place(tower, 58, 61)]).reason).toBe(PLACEMENT_REFUSALS.needsStreet);
    expect(run(h, 3, [place(tower, 60, 60)]).reason).toBe(PLACEMENT_REFUSALS.needsStreet);
    expect(run(h, 4, [place(tower, 59, 60)]).ok).toBe(true);
  });

  it('needs the track and a street for a rail station, and says which is missing', () => {
    const h = sandboxed();
    expect(run(h, 1, [street(RoadTier.RailTrack, 56, 100, 12)]).ok).toBe(true);
    const trackOnly = run(h, 2, [place('rail-station', 60, 101)]);
    expect(trackOnly.ok).toBe(false);
    expect(trackOnly.reason).toBe(PLACEMENT_REFUSALS.needsStreet);

    expect(run(h, 3, [street(RoadTier.TwoLane, 60, 104, 2)]).ok).toBe(true);
    expect(run(h, 4, [place('rail-station', 60, 105)]).reason).toBe(PLACEMENT_REFUSALS.needsRail);
    expect(run(h, 5, [place('rail-station', 60, 101)]).ok).toBe(true);
  });

  it('refuses a draped park off the street', () => {
    const h = sandboxed();
    const park = catalog.find((e) => e.id === 'district-park')!;
    expect(park.ground).toBe('drape');
    const ack = run(h, 1, [place(park.id, 60, 60)]);
    expect(ack.ok).toBe(false);
    expect(ack.reason).toBe(PLACEMENT_REFUSALS.needsStreet);
  });

  it('marks exactly four kinds off-street in the catalog', () => {
    expect(
      catalog
        .filter((e) => e.offStreet)
        .map((e) => e.id)
        .sort(),
    ).toEqual(['solar-farm', 'water-drain', 'water-pump', 'wind-turbine']);
  });

  it('takes each exempt kind off the street', () => {
    const dry = sandboxed();
    expect(run(dry, 1, [place('wind-turbine', 60, 60)]).ok).toBe(true);
    expect(run(dry, 2, [place('solar-farm', 80, 80)]).ok).toBe(true);
    // The pump and the drain need a shore, still, and no street.
    const wet = sandboxOn(lakeMap());
    expect(run(wet, 1, [place('water-pump', 105, 75)]).ok).toBe(true);
    expect(run(wet, 2, [place('water-drain', 113, 75)]).ok).toBe(true);
  });

  it('still needs the shore, the track or the tram track beside a street', () => {
    const h = sandboxOn(lakeMap());
    expect(run(h, 1, [street(RoadTier.TwoLane, 58, 59, 8)]).ok).toBe(true);
    expect(run(h, 2, [place('nuclear-plant', 60, 60)]).reason).toBe(PLACEMENT_REFUSALS.needsShore);
    expect(run(h, 3, [place('rail-yard', 60, 60)]).reason).toBe(PLACEMENT_REFUSALS.needsRail);
    expect(run(h, 4, [place('tram-depot', 60, 60)]).reason).toBe(PLACEMENT_REFUSALS.needsTram);
  });

  it('gives each other refusal its own sentence', () => {
    const h = sandboxed();
    expect(run(h, 1, [street(RoadTier.TwoLane, 58, 59, 8)]).ok).toBe(true);
    expect(run(h, 2, [place(tower, 60, 60)]).ok).toBe(true);
    expect(run(h, 3, [place(tower, 60, 60)]).reason).toBe(PLACEMENT_REFUSALS.occupied);
    // A road is something already standing there too.
    expect(run(h, 4, [place(tower, 60, 59)]).reason).toBe(PLACEMENT_REFUSALS.occupied);
    expect(run(h, 5, [place('wind-turbine', 62, 60)]).ok).toBe(true);
    expect(run(h, 6, [place('wind-turbine', 63, 60)]).reason).toBe(PLACEMENT_REFUSALS.crowded);
    expect(run(h, 7, [place(tower, MAP_SIZE - 1, 60)]).ok).toBe(false);
    expect(run(h, 8, [{ ...place('police-station', MAP_SIZE - 1, 60) }]).reason).toBe(
      PLACEMENT_REFUSALS.offMap,
    );
    expect(run(h, 9, [place(tower, -1, 60)]).reason).toBe(PLACEMENT_REFUSALS.offMap);
  });

  it('refuses water under the footprint and a slope too steep, each in words', () => {
    const wet = sandboxOn(lakeMap());
    expect(run(wet, 1, [place(tower, 110, 72)]).reason).toBe(PLACEMENT_REFUSALS.water);

    const map = flatMap();
    for (let z = 0; z < MAP_SIZE; z++) map.height[tileIndex(61, z)] = 20;
    const steep = makeHarness();
    steep.sim.handleMessage({ type: 'init', seed: 1337, map });
    run(steep, 0, [{ kind: 'setSandbox', on: true }]);
    expect(run(steep, 1, [place(tower, 60, 60)]).reason).toBe(PLACEMENT_REFUSALS.steep);
  });

  it('keeps funds and locked as the codes they are', () => {
    const early = initialized();
    expect(run(early, 1, [place('airport', 60, 60)]).reason).toBe('locked');
  });

  it('undoes an accepted placement to the grid it found, and redoes it', () => {
    const h = sandboxed();
    expect(run(h, 1, [street(RoadTier.TwoLane, 58, 59, 4)]).ok).toBe(true);
    const snapshotOf = (): { building: Uint32Array; height: Float32Array; road: Uint8Array } => {
      h.sim.handleMessage({ type: 'requestSave' });
      const g = latestSaveGrid(h);
      return {
        building: Uint32Array.from(g.buildingId),
        height: Float32Array.from(g.height),
        road: Uint8Array.from(g.roadTier),
      };
    };
    const before = snapshotOf();
    const placed = run(h, 2, [place(tower, 60, 60)]);
    expect(placed.ok).toBe(true);
    expect(snapshotOf().building).not.toEqual(before.building);

    expect(run(h, 3, placed.inverse).ok).toBe(true);
    expect(snapshotOf()).toEqual(before);
    expect(run(h, 4, [place(tower, 60, 60)]).ok).toBe(true);
  });

  it('keeps a building an old save holds off the street, through a save and a load', () => {
    const h = sandboxed();
    const old: Command = { ...place(tower, 80, 80), restore: true } as Command;
    expect(run(h, 1, [old]).ok).toBe(true);
    expect(run(h, 2, [place(tower, 60, 60)]).ok).toBe(false); // a new one is still refused

    h.sim.handleMessage({ type: 'requestSave' });
    const bytes = latestSaveData(h);
    const fresh = makeHarness();
    fresh.sim.handleMessage({ type: 'init', seed: 1337, map: flatMap() });
    fresh.sim.handleMessage({ type: 'loadSave', data: encodeSave(decodeSave(bytes)) });
    fresh.ticks(2);
    const kept = [...standingBuildings(fresh).values()].filter((b) => b.catalogId === tower);
    expect(kept.map((b) => [b.x, b.z])).toEqual([[80, 80]]);
  });

  it('puts an off-street building back when a demolition is undone', () => {
    const h = sandboxed();
    expect(run(h, 1, [{ ...place(tower, 80, 80), restore: true } as Command]).ok).toBe(true);
    const gone = run(h, 2, [{ kind: 'bulldoze', tiles: [{ x: 80, z: 80 }] }]);
    expect(gone.ok).toBe(true);
    expect(standingBuildings(h).size).toBe(0);
    expect(run(h, 3, gone.inverse).ok).toBe(true);
    expect(standingBuildings(h).size).toBe(1);
  });
});

describe('the ghost refuses by the same predicate and says the same sentence', () => {
  it('agrees with the worker beside a street, beside a motorway, and for an exempt kind', () => {
    const map = flatMap();
    const mirror = new ClientGridMirror(map);
    const h = makeHarness(feedMirror(mirror));
    h.sim.handleMessage({ type: 'init', seed: 1, map });
    run(h, 0, [{ kind: 'setSandbox', on: true }]);
    expect(
      run(h, 1, [street(RoadTier.TwoLane, 58, 59, 4), street(RoadTier.Highway, 58, 70, 4)]).ok,
    ).toBe(true);

    const entry = (id: string) => catalog.find((e) => e.id === id)!;
    const tile = (x: number, z: number) => [{ x, z }];
    const tower = entry('water-tower');
    expect(mirror.placeRefusal(tower, tile(60, 60))).toBeNull();
    expect(mirror.placeRefusal(tower, tile(60, 80))).toBe(PLACEMENT_REFUSALS.needsStreet);
    expect(mirror.placeRefusal(tower, tile(60, 71))).toBe(PLACEMENT_REFUSALS.needsStreet);
    expect(mirror.placeRefusal(entry('wind-turbine'), tile(60, 80))).toBeNull();
    expect(mirror.placeRefusal(entry('rail-yard'), tile(60, 60))).toBe(PLACEMENT_REFUSALS.needsRail);

    for (const [x, z] of [
      [60, 60],
      [60, 80],
      [60, 71],
    ] as const) {
      const ack = run(h, 10 + x + z, [place('water-tower', x, z)]);
      expect(ack.ok).toBe(mirror.placeRefusal(tower, tile(x, z)) === null);
      if (!ack.ok) expect(ack.reason).toBe(mirror.placeRefusal(tower, tile(x, z)));
    }
  });
});
