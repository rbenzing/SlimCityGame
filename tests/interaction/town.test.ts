import { beforeAll, describe, expect, it } from 'vitest';
import { tileIndex } from '../../src/shared/constants';
import { BuildingState, Problem, RoadTier, ZoneType } from '../../src/shared/types';
import type { BuildingInstance, GridState, TransitMode } from '../../src/shared/types';
import { SoilGrade, soilGrades } from '../../src/shared/soil';
import { decodeSave } from '../../src/app/persist';
import { loadGrid } from '../../src/world/roadnet';
import {
  catalog,
  entryOf,
  latestLandfillFill,
  latestSaveData,
  latestSaveGrid,
  latestTrash,
  makeHarness,
  standingBuildings,
} from '../support/sim';
import {
  GROW_TICKS,
  RIVER,
  TOWN,
  TOWN_SEED,
  buildTown,
  growTown,
  townMap,
  type BuiltTown,
} from '../support/town';
import { guardRoadNetwork } from '../support/guard';

guardRoadNetwork();

/** Ticks after which a second town is compared with the first, byte for byte. */
const COMPARE_AT = 1000;

const saveNow = (town: BuiltTown): ArrayBuffer => {
  town.h.sim.handleMessage({ type: 'requestSave' });
  return latestSaveData(town.h);
};

const bytes = (data: ArrayBuffer): Uint8Array => new Uint8Array(data);

/** Every typed-array layer of a grid, by name. */
function layers(g: GridState): Map<string, ArrayLike<number>> {
  const out = new Map<string, ArrayLike<number>>();
  for (const [name, value] of Object.entries(g)) {
    if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
      out.set(name, value as unknown as ArrayLike<number>);
    }
  }
  return out;
}

/** The names of the layers in which `a` and `b` differ. */
function differingLayers(a: GridState, b: GridState): string[] {
  const other = layers(b);
  const differ: string[] = [];
  for (const [name, layer] of layers(a)) {
    const theirs = other.get(name);
    if (!theirs || theirs.length !== layer.length) {
      differ.push(name);
      continue;
    }
    for (let i = 0; i < layer.length; i++) {
      if (layer[i] !== theirs[i]) {
        differ.push(name);
        break;
      }
    }
  }
  return differ;
}

describe('a small town, built and grown, as the regression for everything together', () => {
  let town: BuiltTown;
  let atCompare: ArrayBuffer;
  let grid: GridState;
  let standing: BuildingInstance[];

  beforeAll(() => {
    town = buildTown();
    growTown(town, COMPARE_AT);
    atCompare = saveNow(town);
    growTown(town, GROW_TICKS - COMPARE_AT);
    town.h.sim.handleMessage({ type: 'requestSave' });
    grid = latestSaveGrid(town.h);
    standing = [...standingBuildings(town.h).values()];
  }, 300_000);

  const placed = (): BuildingInstance[] => standing.filter((b) => entryOf(b).zone === undefined);
  const farms = (): BuildingInstance[] =>
    standing.filter((b) => entryOf(b).zone === ZoneType.Agriculture);
  const activeIn = (category: string, farm: boolean): BuildingInstance[] =>
    standing.filter((b) => {
      const e = entryOf(b);
      return (
        e.category === category &&
        e.zone !== undefined &&
        (e.zone === ZoneType.Agriculture) === farm &&
        b.state === BuildingState.Active
      );
    });

  it('accepts every step a player takes to build it', () => {
    const refused = town.steps
      .map((step, i) => ({ step: step.label, reason: town.acks[i]!.reason }))
      .filter((_, i) => !town.acks[i]!.ok);
    expect(refused).toEqual([]);
  });

  it('lays every road type there is', () => {
    const laid = new Set<number>([...grid.roadTier, ...grid.overTier]);
    const missing = Object.entries(RoadTier)
      .filter(([, tier]) => tier !== RoadTier.None && !laid.has(tier))
      .map(([name]) => name);
    expect(missing).toEqual([]);
  });

  it('bridges the river where the avenue and the motorway cross it', () => {
    for (const x of [TOWN.avenue.x, TOWN.motorway.x]) {
      for (let z = RIVER.z0; z <= RIVER.z1; z++) {
        const i = tileIndex(x, z);
        expect(grid.roadElevation[i]).toBeGreaterThan(0);
        expect(grid.water[i]).toBe(1);
      }
    }
  });

  it('paints every zone there is', () => {
    const painted = new Set<number>(grid.zone);
    const missing = Object.entries(ZoneType)
      .filter(([, zone]) => zone !== ZoneType.None && !painted.has(zone))
      .map(([name]) => name);
    expect(missing).toEqual([]);
  });

  it('stands every building a player places', () => {
    const standingIds = new Set(placed().map((b) => b.catalogId));
    const missing = catalog
      .filter((e) => e.zone === undefined && !standingIds.has(e.id))
      .map((e) => e.id);
    expect(missing).toEqual([]);
  });

  it('cuts nothing the player placed off from the road, power or water', () => {
    const cutOff = placed()
      .filter((b) => (b.problems & (Problem.NoRoad | Problem.NoPower | Problem.NoWater)) !== 0)
      .map((b) => `${b.catalogId} at ${b.x},${b.z}: problems ${b.problems}`);
    expect(cutOff).toEqual([]);
  });

  it('grows homes, shops, industry and farms, and puts people to work', () => {
    expect(activeIn('res', false).length).toBeGreaterThan(0);
    expect(activeIn('com', false).length).toBeGreaterThan(0);
    expect(activeIn('ind', false).length).toBeGreaterThan(0);
    expect(activeIn('ind', true).length).toBeGreaterThan(0);
    const stats = town.h.lastSnapshot()!.stats;
    expect(stats.population).toBeGreaterThan(0);
    expect(stats.jobs).toBeGreaterThan(0);
    expect(stats.employed).toBeGreaterThan(0);
  });

  it('grows farms off the dirt road, beyond the water mains, on power alone', () => {
    const open = farms().filter((b) => b.state === BuildingState.Active);
    expect(open.length).toBeGreaterThan(0);
    for (const b of farms()) {
      expect(b.z).toBeGreaterThan(TOWN.dirt.z);
      // No main reaches the farm, and it wants none.
      expect(grid.watered[tileIndex(b.x, b.z)]).toBe(0);
      expect(b.problems & Problem.NoWater).toBe(0);
      expect(b.problems & Problem.NoPower).toBe(0);
    }
  });

  it('collects garbage where the landfill or the incinerator reaches, and nowhere else', () => {
    const trash = latestTrash(town.h);
    const trashOn = (b: BuildingInstance): number => trash[tileIndex(b.x, b.z)]!;
    const backedUp = (list: BuildingInstance[]): string[] =>
      list.filter((b) => trashOn(b) > 0).map((b) => `${b.catalogId} at ${b.x},${b.z}`);
    const zoned = standing.filter(
      (b) => entryOf(b).zone !== undefined && b.state === BuildingState.Active,
    );
    // The station road's homes across from the landfill lie within its reach.
    const { landfill } = TOWN;
    const byTheLandfill = zoned.filter(
      (b) =>
        b.z > TOWN.stationRoad.z &&
        b.z < RIVER.z0 &&
        b.x >= landfill.x0 &&
        b.x < landfill.x0 + landfill.w,
    );
    expect(byTheLandfill.length).toBeGreaterThan(0);
    expect(backedUp(byTheLandfill)).toEqual([]);
    expect(latestLandfillFill(town.h)).toBeGreaterThan(0);
    // The industry on the four-lane road lies within the incinerator's.
    const byTheIncinerator = zoned.filter(
      (b) => b.z > TOWN.fourLane.z && b.z < TOWN.fourLane.z + 5 && entryOf(b).category === 'ind',
    );
    expect(byTheIncinerator.length).toBeGreaterThan(0);
    expect(backedUp(byTheIncinerator)).toEqual([]);
    // Main street's west end is beyond both, and its trash stays where it is put.
    const beyondBoth = zoned.filter(
      (b) => b.z > TOWN.main.z - 5 && b.z < TOWN.main.z && b.x < TOWN.alley.x,
    );
    expect(beyondBoth.length).toBeGreaterThan(0);
    for (const b of beyondBoth) expect(trashOn(b)).toBeGreaterThan(0);
  });

  it('carries riders on the bus, the train and the tram', () => {
    const transit = town.h.lastSnapshot()!.transit!;
    const riders = new Map<TransitMode, number>();
    transit.lines.forEach((line, i) => riders.set(line.mode ?? 'bus', transit.ridership[i]!));
    expect(riders.get('bus')).toBeGreaterThan(0);
    expect(riders.get('rail')).toBeGreaterThan(0);
    expect(riders.get('tram')).toBeGreaterThan(0);
  });

  it('keeps the main thread mirror in step with the worker, soil and all', () => {
    const { mirror } = town;
    expect(mirror.zone).toEqual(grid.zone);
    expect(mirror.roadTier).toEqual(grid.roadTier);
    expect(mirror.roadFlow).toEqual(grid.roadFlow);
    expect(mirror.height).toEqual(grid.height);
    expect(mirror.water).toEqual(grid.water);
    // The hill raised outside town regraded the soil on both sides alike.
    const soil = soilGrades(grid, TOWN_SEED);
    expect(mirror.soil).toEqual(soil);
    const onTheHill: number[] = [];
    for (let dz = -4; dz <= 4; dz++) {
      for (let dx = -4; dx <= 4; dx++)
        onTheHill.push(soil[tileIndex(TOWN.hill.x + dx, TOWN.hill.z + dz)]!);
    }
    expect(onTheHill.some((grade) => grade < SoilGrade.Prime)).toBe(true);
  });

  it('loads a save of the grown town back as the same city, and a reload changes nothing more', () => {
    const reload = (data: ArrayBuffer): ArrayBuffer => {
      const fresh = makeHarness();
      fresh.sim.handleMessage({ type: 'init', seed: TOWN_SEED, map: townMap() });
      fresh.sim.handleMessage({ type: 'loadSave', data });
      fresh.sim.handleMessage({ type: 'requestSave' });
      return latestSaveData(fresh);
    };
    const saved = saveNow(town);
    const loaded = reload(saved);

    const before = decodeSave(saved);
    const after = decodeSave(loaded);
    expect(differingLayers(loadGrid(after.grid).grid, loadGrid(before.grid).grid)).toEqual([]);
    expect(after.header).toEqual(before.header);
    // A load finishes whatever was being built, since construction countdowns
    // are not saved, and keeps no incinerator buffer that holds nothing.
    const expected = structuredClone(before.meta);
    for (const b of expected.registry.buildings) {
      if (b.state === BuildingState.Constructing) b.state = BuildingState.Active;
    }
    if (expected.garbage) {
      expected.garbage.incinerators = expected.garbage.incinerators.filter((i) => i.units > 0);
    }
    expect(after.meta).toEqual(expected);

    expect(bytes(reload(loaded))).toEqual(bytes(loaded));
  });

  it('grows the same town, byte for byte, from the same steps on the same seed', () => {
    const again = buildTown();
    growTown(again, COMPARE_AT);
    expect(bytes(saveNow(again))).toEqual(bytes(atCompare));
  }, 120_000);

  it('undoes every step back to the untouched map', () => {
    const built = buildTown();
    const untouched = makeHarness();
    untouched.sim.handleMessage({ type: 'init', seed: TOWN_SEED, map: townMap() });
    untouched.sim.handleMessage({ type: 'requestSave' });

    let seq = built.acks.length;
    for (let i = built.acks.length - 1; i >= 0; i--) {
      const inverse = built.acks[i]!.inverse;
      if (inverse.length === 0) continue;
      seq += 1;
      built.h.sim.handleMessage({ type: 'commands', seq, commands: inverse });
      built.h.ticks(1);
      expect(built.h.ackFor(seq)?.ok, `undoing ${built.steps[i]!.label}`).toBe(true);
    }
    built.h.sim.handleMessage({ type: 'requestSave' });
    expect(differingLayers(latestSaveGrid(built.h), latestSaveGrid(untouched))).toEqual([]);
    expect(standingBuildings(built.h).size).toBe(0);
  });
});
