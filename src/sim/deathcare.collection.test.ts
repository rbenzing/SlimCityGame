import { describe, expect, it } from 'vitest';
import {
  BIG_TOWN_MILESTONE,
  DEATH_CARE_MILESTONE,
  DEATH_CARE_PERIOD,
  DEATH_RATE_PER_RESIDENT_PER_TICK,
  MAP_TILES,
  SEWER_MILESTONE,
  TICKS_PER_YEAR,
  tileIndex,
} from '../shared/constants';
import { RoadTier, ZoneType } from '../shared/types';
import type { BuildingCatalogEntry, GridState } from '../shared/types';
import catalogData from '../data/catalog.json';
import { createGrid } from '../world/grid';
import { BuildingRegistry } from './buildings';
import { DeathCareSystem, type DeathCareFacility } from './deathcare';

const entries = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const cemeteryEntry = entries.find((e) => e.id === 'cemetery')!;
const PLOTS = cemeteryEntry.deathCare!.plots!;
const RANGE = cemeteryEntry.deathCare!.collectionRange;

const home = (residents: number): BuildingCatalogEntry => ({
  id: 'house',
  name: 'house',
  category: 'res',
  zone: ZoneType.ResLow,
  level: 1,
  footprint: { w: 1, d: 1 },
  height: 5,
  color: 0,
  residents,
  powerUse: 0,
  waterUse: 0,
  cost: 0,
  upkeep: 0,
  unlockMilestone: 0,
});
const HOUSE = home(3);
const byId = new Map([[HOUSE.id, HOUSE]]);

const CEMETERY_ID = 1;
const FAR_CEMETERY_ID = 2;
const HOUSE_ID = 7;
const INLAND_ID = 8;
const house = tileIndex(9, 22);

/**
 * A street along x = 10 (z 10..60) with a cemetery's lot (a 3×3) beside it at
 * z 20, a house across the road at z 22, and a second street along x = 30 that
 * joins nothing, with a house 6 tiles from the cemetery as the crow flies.
 */
function town(): GridState {
  const g = createGrid();
  for (let z = 10; z <= 60; z++) g.roadTier[tileIndex(10, z)] = RoadTier.TwoLane;
  for (let z = 10; z <= 40; z++) g.roadTier[tileIndex(17, z)] = RoadTier.TwoLane;
  lot(g, CEMETERY_ID, 11, 20);
  g.buildingId[house] = HOUSE_ID;
  g.buildingId[tileIndex(16, 22)] = INLAND_ID;
  return g;
}

function lot(g: GridState, id: number, x: number, z: number): void {
  for (let dz = 0; dz < 3; dz++)
    for (let dx = 0; dx < 3; dx++) g.buildingId[tileIndex(x + dx, z + dz)] = id;
}

const cemetery = (id = CEMETERY_ID, plots = PLOTS): DeathCareFacility => ({
  id,
  collectionRange: RANGE,
  plots,
});

/** A system holding `count` bodies that fell at `tile` on `sinceTick`. */
function withBodies(
  bodies: { tile: number; count: number; sinceTick: number }[],
  interments: { id: number; count: number }[] = [],
): DeathCareSystem {
  const system = new DeathCareSystem(byId);
  system.restoreState({
    deathRemainder: 0,
    deaths: 0,
    reletRemainder: 0,
    relets: 0,
    interments,
    backlog: bodies,
  });
  return system;
}

describe('a death leaves a body', () => {
  it('at the anchor tile of the building where it fell, stamped with the tick', () => {
    const g = createGrid();
    const registry = new BuildingRegistry([HOUSE]);
    const inst = registry.place(g, HOUSE, 40, 41, 0)!;
    const system = new DeathCareSystem(byId);

    // One death's worth of population in one tick.
    system.tick(registry.all(), 1 / DEATH_RATE_PER_RESIDENT_PER_TICK, 0, 77);

    expect(inst.vacancies).toBe(1);
    expect(system.backlog).toEqual([{ tile: tileIndex(40, 41), count: 1, sinceTick: 77 }]);
    expect(system.uncollected).toBe(1);
    expect(system.oldestUncollectedTile).toBe(tileIndex(40, 41));
  });

  it('merges the deaths of one tile and one tick into one entry', () => {
    const g = createGrid();
    const registry = new BuildingRegistry([HOUSE]);
    registry.place(g, HOUSE, 40, 41, 0);
    const system = new DeathCareSystem(byId);
    system.tick(registry.all(), 2 / DEATH_RATE_PER_RESIDENT_PER_TICK, 0, 5);
    expect(system.backlog).toEqual([{ tile: tileIndex(40, 41), count: 2, sinceTick: 5 }]);
  });

  it('is never fed by the backlog: the same city dies at the same pace with a thousand bodies lying', () => {
    const build = (): { registry: BuildingRegistry; system: DeathCareSystem } => {
      const g = createGrid();
      const registry = new BuildingRegistry([HOUSE]);
      for (let i = 0; i < 50; i++) registry.place(g, HOUSE, i, 0, 0);
      return { registry, system: new DeathCareSystem(byId) };
    };
    const clean = build();
    const piled = build();
    piled.system.restoreState({
      deathRemainder: 0,
      deaths: 0,
      reletRemainder: 0,
      relets: 0,
      backlog: [{ tile: 5, count: 1000, sinceTick: 0 }],
    });
    for (let t = 0; t < 40_000; t++) {
      clean.system.tick(clean.registry.all(), 5_000, 0, t);
      piled.system.tick(piled.registry.all(), 5_000, 0, t);
    }
    expect(clean.system.totalDeaths).toBeGreaterThan(0);
    expect(piled.system.totalDeaths).toBe(clean.system.totalDeaths);
  });
});

describe('the cemetery collects along the roads', () => {
  it('interments every body of the buildings its streets reach, one body one interment', () => {
    const g = town();
    const system = withBodies([{ tile: house, count: 3, sinceTick: 5 }]);

    const visits = system.collect(g, 5, DEATH_CARE_MILESTONE, [cemetery()]);

    expect(system.intermentsOf(CEMETERY_ID)).toBe(3);
    expect(system.uncollected).toBe(0);
    expect(system.regionalThisMonth).toBe(0);
    expect(visits).toEqual([{ facilityId: CEMETERY_ID, tile: house }]);
  });

  it('stops collecting on the 781st body of a cemetery of 780 plots, and leaves the rest where they fell', () => {
    expect(PLOTS).toBe(780);
    const g = town();
    const system = withBodies([{ tile: house, count: 781, sinceTick: 5 }]);

    system.collect(g, 5, DEATH_CARE_MILESTONE, [cemetery()]);

    expect(system.intermentsOf(CEMETERY_ID)).toBe(780);
    expect(system.uncollected).toBe(1);
    // A later body is not taken either: the cemetery is full.
    system.restoreState({
      ...system.serializeState(),
      backlog: [{ tile: house, count: 2, sinceTick: 50 }],
    });
    system.collect(g, 50, DEATH_CARE_MILESTONE, [cemetery()]);
    expect(system.intermentsOf(CEMETERY_ID)).toBe(780);
    expect(system.uncollected).toBe(2);
  });

  it('does not collect a building inside its range as the crow flies that no road connects', () => {
    const g = town();
    const inland = tileIndex(16, 22);
    // 5 tiles from the cemetery's lot in a straight line, 40 in range; the street beside it joins nothing.
    expect(Math.abs(16 - 13)).toBeLessThan(RANGE);
    const system = withBodies([
      { tile: inland, count: 1, sinceTick: 5 },
      { tile: house, count: 1, sinceTick: 5 },
    ]);

    system.collect(g, 5, DEATH_CARE_MILESTONE, [cemetery()]);

    expect(system.intermentsOf(CEMETERY_ID)).toBe(1);
    expect(system.backlog).toEqual([{ tile: inland, count: 1, sinceTick: 5 }]);
  });

  it('does not collect a building past the road range', () => {
    const g = town();
    const far = tileIndex(9, 57);
    g.buildingId[far] = 9;
    const system = withBodies([{ tile: far, count: 1, sinceTick: 5 }]);
    system.collect(g, 5, DEATH_CARE_MILESTONE, [{ ...cemetery(), collectionRange: 30 }]);
    expect(system.uncollected).toBe(1);
    system.collect(g, 10, DEATH_CARE_MILESTONE, [{ ...cemetery(), collectionRange: 40 }]);
    expect(system.uncollected).toBe(0);
  });

  it('takes a body to the nearest cemetery with room, and ties to the lower facility id', () => {
    const g = town();
    lot(g, FAR_CEMETERY_ID, 11, 50);
    const facilities = [cemetery(CEMETERY_ID), cemetery(FAR_CEMETERY_ID)];

    const nearA = withBodies([{ tile: house, count: 1, sinceTick: 5 }]);
    nearA.collect(g, 5, DEATH_CARE_MILESTONE, facilities);
    expect(nearA.intermentsOf(CEMETERY_ID)).toBe(1);
    expect(nearA.intermentsOf(FAR_CEMETERY_ID)).toBe(0);

    // The house at z 35 stands 15 road tiles from each cemetery's street.
    const midway = tileIndex(9, 35);
    g.buildingId[midway] = 9;
    const tied = withBodies([{ tile: midway, count: 1, sinceTick: 5 }]);
    tied.collect(g, 5, DEATH_CARE_MILESTONE, [cemetery(FAR_CEMETERY_ID), cemetery(CEMETERY_ID)]);
    expect(tied.intermentsOf(CEMETERY_ID)).toBe(1);
    expect(tied.intermentsOf(FAR_CEMETERY_ID)).toBe(0);
  });

  it('falls through to the next cemetery when the nearest is full', () => {
    const g = town();
    lot(g, FAR_CEMETERY_ID, 11, 50);
    const system = withBodies([{ tile: house, count: 5, sinceTick: 5 }]);
    system.collect(g, 5, DEATH_CARE_MILESTONE, [
      cemetery(CEMETERY_ID, 3),
      cemetery(FAR_CEMETERY_ID),
    ]);
    expect(system.intermentsOf(CEMETERY_ID)).toBe(3);
    expect(system.intermentsOf(FAR_CEMETERY_ID)).toBe(2);
    expect(system.uncollected).toBe(0);
  });

  it('offers a waiting body the tick it falls and then every DEATH_CARE_PERIOD ticks', () => {
    const g = town();
    const system = withBodies([{ tile: house, count: 1, sinceTick: 3 }]);
    system.collect(g, DEATH_CARE_PERIOD - 3, DEATH_CARE_MILESTONE, [cemetery()]);
    expect(system.uncollected).toBe(1);
    system.collect(g, DEATH_CARE_PERIOD, DEATH_CARE_MILESTONE, [cemetery()]);
    expect(system.uncollected).toBe(0);
  });

  it('drops the interments of a cemetery that is gone', () => {
    const g = town();
    const system = withBodies([], [{ id: CEMETERY_ID, count: 12 }]);
    system.collect(g, 1, DEATH_CARE_MILESTONE, []);
    expect(system.serializeState().interments).toEqual([]);
  });
});

describe('the regional funeral service', () => {
  it('shares the Big Town rung with the septic tanks, from one source', () => {
    expect(DEATH_CARE_MILESTONE).toBe(BIG_TOWN_MILESTONE);
    expect(SEWER_MILESTONE).toBe(BIG_TOWN_MILESTONE);
  });

  it('collects every body off the map the tick it falls below Big Town, leaving none and counting each', () => {
    const g = town();
    const system = withBodies([
      { tile: house, count: 3, sinceTick: 7 },
      { tile: tileIndex(16, 22), count: 2, sinceTick: 7 },
    ]);

    const visits = system.collect(g, 7, DEATH_CARE_MILESTONE - 1, []);

    expect(system.backlog).toEqual([]);
    expect(system.regionalThisMonth).toBe(5);
    expect(visits).toEqual([]);
    expect(system.takeRegionalThisMonth()).toBe(5);
    expect(system.regionalThisMonth).toBe(0);
  });

  it('lets a cemetery collect first, and takes only what it did not', () => {
    const g = town();
    const system = withBodies([
      { tile: house, count: 2, sinceTick: 7 },
      { tile: tileIndex(16, 22), count: 1, sinceTick: 7 },
    ]);
    system.collect(g, 7, DEATH_CARE_MILESTONE - 1, [cemetery()]);
    expect(system.intermentsOf(CEMETERY_ID)).toBe(2);
    expect(system.regionalThisMonth).toBe(1);
    expect(system.uncollected).toBe(0);
  });

  it('stops at Big Town: with no cemetery the bodies stay where they fell and nothing is counted', () => {
    const g = town();
    const system = withBodies([{ tile: house, count: 2, sinceTick: 7 }]);
    system.collect(g, 7, DEATH_CARE_MILESTONE, []);
    expect(system.uncollected).toBe(2);
    expect(system.regionalThisMonth).toBe(0);
  });
});

describe('the backlog and the interments persist', () => {
  it('survive a save round trip identically, in the middle of a year of deaths', () => {
    const build = (): { g: GridState; registry: BuildingRegistry } => {
      const g = town();
      const registry = new BuildingRegistry([HOUSE]);
      for (let i = 0; i < 60; i++)
        registry.place(g, HOUSE, 30 + (i % 20), 41 + Math.floor(i / 20), 0);
      return { g, registry };
    };
    const step = (
      system: DeathCareSystem,
      world: { g: GridState; registry: BuildingRegistry },
      from: number,
      to: number,
    ): void => {
      for (let t = from; t < to; t++) {
        system.tick(world.registry.all(), 12_000, 0, t);
        system.collect(world.g, t, DEATH_CARE_MILESTONE, []);
      }
    };

    const whole = build();
    const wholeSystem = new DeathCareSystem(byId);
    step(wholeSystem, whole, 0, TICKS_PER_YEAR);
    expect(wholeSystem.uncollected).toBeGreaterThan(50);

    const half = build();
    const first = new DeathCareSystem(byId);
    step(first, half, 0, TICKS_PER_YEAR / 2);
    const resumed = {
      g: half.g,
      registry: BuildingRegistry.deserialize(
        [HOUSE],
        JSON.parse(JSON.stringify(half.registry.serialize())),
      ),
    };
    const second = new DeathCareSystem(byId);
    second.restoreState(JSON.parse(JSON.stringify(first.serializeState())));
    step(second, resumed, TICKS_PER_YEAR / 2, TICKS_PER_YEAR);

    expect(second.serializeState()).toEqual(wholeSystem.serializeState());
    expect(second.backlog).toEqual(wholeSystem.backlog);
  });

  it('keeps each body its age across a load, and the month and the interments with it', () => {
    const system = withBodies([{ tile: house, count: 2, sinceTick: 123 }], [{ id: 4, count: 9 }]);
    system.restoreState({ ...system.serializeState(), regionalThisMonth: 6 });
    const reloaded = new DeathCareSystem(byId);
    reloaded.restoreState(JSON.parse(JSON.stringify(system.serializeState())));
    expect(reloaded.backlog).toEqual([{ tile: house, count: 2, sinceTick: 123 }]);
    expect(reloaded.intermentsOf(4)).toBe(9);
    expect(reloaded.regionalThisMonth).toBe(6);
  });

  it('loads malformed values as zero rather than carrying them', () => {
    const system = new DeathCareSystem(byId);
    system.restoreState({
      deathRemainder: 0,
      deaths: 0,
      reletRemainder: 0,
      relets: 0,
      regionalThisMonth: -3,
      interments: [
        { id: 1, count: Number.NaN },
        { id: -2, count: 5 },
        { id: 1.5, count: 5 },
        { id: 3, count: 4 },
      ],
      backlog: [
        { tile: MAP_TILES, count: 1, sinceTick: 0 },
        { tile: -1, count: 1, sinceTick: 0 },
        { tile: 9, count: 0, sinceTick: 0 },
        { tile: 9, count: 1.5, sinceTick: 0 },
        { tile: 9, count: 1, sinceTick: Number.NaN },
        { tile: 9, count: 1, sinceTick: -4 },
        { tile: 12, count: 2, sinceTick: 8 },
      ],
    });
    expect(system.regionalThisMonth).toBe(0);
    expect(system.serializeState().interments).toEqual([{ id: 3, count: 4 }]);
    expect(system.backlog).toEqual([{ tile: 12, count: 2, sinceTick: 8 }]);

    const notLists = new DeathCareSystem(byId);
    notLists.restoreState({
      deathRemainder: 0,
      deaths: 0,
      reletRemainder: 0,
      relets: 0,
      interments: 5 as never,
      backlog: 'lots' as never,
    });
    expect(notLists.uncollected).toBe(0);
    expect(notLists.serializeState().interments).toEqual([]);
  });
});
