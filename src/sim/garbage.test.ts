import { describe, expect, it } from 'vitest';
import { RoadTier, type BuildingCatalogEntry, type GridState } from '../shared/types';
import {
  GARBAGE_PASSES_PER_DAY,
  LANDFILL_CAPACITY_PER_TILE,
  MILESTONES,
  MRF_KG_PER_COMMERCIAL_JOB_DAY,
  MRF_KG_PER_HOME_DAY,
  MRF_KG_PER_INDUSTRIAL_JOB_DAY,
  MRF_RESIDUE_STORE_UNITS,
  MRF_SORT_UNITS_PER_PASS,
  MRF_YIELD_PERCENT,
  RECYCLING_CREDIT_PER_UNIT,
  RECYCLING_HOMES_PER_TRUCK,
  RECYCLING_KG_PER_RESIDENT_DAY,
  TRANSFER_FLOOR_DAYS,
  TRANSFER_FLOOR_UNITS,
  TRANSFER_UNITS_PER_PASS,
  TRASH_UNITS_PER_TONNE,
  tileIndex,
} from '../shared/constants';
import { createGrid } from '../world/grid';
import {
  GarbageSystem,
  incineratorEmission,
  kerbsideKgPerDay,
  recoveredOf,
  roundKgPerDay,
  servedUnitsOnPass,
  unitsOnPass,
  type GarbageBuilding,
  type GarbageDepot,
  type GarbageFacility,
  type GarbageMrf,
  type GarbageTransfer,
} from './garbage';
import catalog from '../data/catalog.json';

/**
 * A full MAP_SIZE grid with a vertical road column x=10 (z 10..40), a 2-tile
 * landfill area beside it, and a commercial building within collection range.
 * (Uses createGrid() default size because the reused services road-BFS assumes
 * MAP_SIZE.)
 */
function baseWorld(): { g: GridState; buildingTile: number } {
  const g = createGrid();
  for (let z = 10; z <= 40; z++) g.roadTier[tileIndex(10, z)] = RoadTier.TwoLane;
  g.landfill[tileIndex(11, 20)] = 1;
  g.landfill[tileIndex(12, 20)] = 1;
  const buildingTile = tileIndex(9, 22); // 1 tile off the road → within radiate range
  g.buildingId[buildingTile] = 7;
  return { g, buildingTile };
}

// 100 jobs make 744 units a day: 37 on pass 0. 500 jobs make 186 on pass 0.
const COM: GarbageBuilding = { id: 7, residents: 0, jobs: 100, homes: 0, category: 'com' };
const IND: GarbageBuilding = { id: 7, residents: 0, jobs: 500, homes: 0, category: 'ind' };
/** A building of `residents` and `jobs` with no homes, the category irrelevant to its trash. */
const people = (id: number, residents: number, jobs: number): GarbageBuilding => ({
  id,
  residents,
  jobs,
  homes: 0,
  category: 'com',
});
const COM_PASS = 37;
const IND_PASS = 186;

const daySum = (b: GarbageBuilding): number => {
  let sum = 0;
  for (let n = 0; n < GARBAGE_PASSES_PER_DAY; n++) sum += unitsOnPass(b, n);
  return sum;
};

describe('trash per head', () => {
  it('a landfill tile holds a 20 m tile piled 6 m deep at 0.712 t a cubic metre', () => {
    expect(LANDFILL_CAPACITY_PER_TILE).toBe(6_835_200);
  });

  it('100 residents emit 528 units over a day', () => {
    expect(daySum(people(1, 100, 0))).toBe(528);
  });

  it('10 jobs emit 74 units over a day (74.4 floored)', () => {
    expect(daySum(people(1, 0, 10))).toBe(74);
  });

  it('a mixed building sums both', () => {
    expect(daySum(people(1, 100, 10))).toBe(528 + 74);
  });

  it('one resident emits on some passes and not others, yet totals right over a day', () => {
    const b = people(1, 1, 0);
    const perPass = Array.from({ length: GARBAGE_PASSES_PER_DAY }, (_, n) => unitsOnPass(b, n));
    expect(perPass).toContain(0);
    expect(perPass.some((u) => u > 0)).toBe(true);
    expect(daySum(b)).toBe(5); // 1.32 kg a day is 5.28 units
  });

  it('is the same for the same pass', () => {
    const b = people(1, 37, 9);
    expect(unitsOnPass(b, 123)).toBe(unitsOnPass(b, 123));
  });

  it('spreads a pass over the footprint, the remainder on the first tiles', () => {
    const g = createGrid();
    const tiles = [tileIndex(50, 50), tileIndex(51, 50), tileIndex(52, 50)];
    for (const t of tiles) g.buildingId[t] = 9;
    const b = people(9, 0, 100); // 37 on pass 0
    const sys = new GarbageSystem(g.size);
    sys.tick(g, [b], 0);
    expect(tiles.map((t) => sys.trash[t])).toEqual([13, 12, 12]);
  });

  it('the incinerator burns 450 t a day and holds five days of it', () => {
    const inc = (catalog as { buildings: BuildingCatalogEntry[] }).buildings.find(
      (e) => e.id === 'incinerator',
    )!;
    expect(inc.garbage!.burnRate).toBe(90_000);
    expect(inc.garbage!.bufferCapacity).toBe(9_000_000);
  });
});

describe('GarbageSystem', () => {
  it('generates trash on a building then collects it into a road-connected landfill', () => {
    const { g, buildingTile } = baseWorld();
    const sys = new GarbageSystem(g.size);

    sys.tick(g, [COM], 0);

    // The com building emitted its pass's units, all collected into the landfill.
    expect(sys.landfillStored()).toBe(COM_PASS);
    expect(sys.trash[buildingTile]).toBe(0);
    expect(sys.landfillFillFraction(g)).toBeGreaterThan(0);
    expect(sys.isLandfillFull(g)).toBe(false);
  });

  it('leaves trash uncollected for a building outside every landfill service radius', () => {
    const { g } = baseWorld();
    const farTile = tileIndex(200, 200); // nowhere near the road/landfill
    g.buildingId[farTile] = 8;
    const sys = new GarbageSystem(g.size);

    sys.tick(g, [COM, people(8, 0, 100)], 0);

    expect(sys.trash[farTile]).toBeGreaterThan(0); // generated but never collected
  });

  it('does not collect when no landfill is painted (trash just accumulates)', () => {
    const { g, buildingTile } = baseWorld();
    g.landfill.fill(0); // remove the area
    const sys = new GarbageSystem(g.size);

    sys.tick(g, [COM], 0);

    expect(sys.landfillStored()).toBe(0);
    expect(sys.trash[buildingTile]).toBe(COM_PASS);
  });

  it('stops collecting once the landfill area is full; trash then backs up on buildings', () => {
    const { g, buildingTile } = baseWorld();
    const capacity = 2 * LANDFILL_CAPACITY_PER_TILE; // 2 painted tiles
    const sys = new GarbageSystem(g.size);

    // Start a pass's worth short of full, then overfill.
    sys.restoreState({ landfillStored: capacity - IND_PASS, incinerators: [] });
    for (let i = 0; i < 3; i++) sys.tick(g, [IND], i);

    expect(sys.landfillStored()).toBe(capacity); // capped, never exceeds capacity
    expect(sys.isLandfillFull(g)).toBe(true);
    expect(sys.landfillFillFraction(g)).toBe(1);
    expect(sys.trash[buildingTile]).toBeGreaterThan(0); // collection stopped → backs up
  });

  it('is deterministic — identical inputs give identical stored totals', () => {
    const a = baseWorld();
    const b = baseWorld();
    const sysA = new GarbageSystem(a.g.size);
    const sysB = new GarbageSystem(b.g.size);
    for (let i = 0; i < 5; i++) {
      sysA.tick(a.g, [COM], i);
      sysB.tick(b.g, [COM], i);
    }
    expect(sysA.landfillStored()).toBe(sysB.landfillStored());
  });
});

/** baseWorld with the landfill removed and an incinerator footprint at (11,25). */
function incinWorld(): { g: GridState; buildingTile: number; incinId: number } {
  const { g, buildingTile } = baseWorld();
  g.landfill.fill(0); // isolate the incinerator as the only collector
  const incinId = 20;
  g.buildingId[tileIndex(11, 25)] = incinId; // 1 tile off the road column
  return { g, buildingTile, incinId };
}

const facility = (over: Partial<GarbageFacility> = {}): GarbageFacility => ({
  id: 20,
  collectionRange: 40,
  bufferCapacity: 400000,
  burnRate: 2,
  ...over,
});

describe('GarbageSystem incinerators', () => {
  it('collects covered trash into its buffer then burns burnRate off the top', () => {
    const { g, buildingTile, incinId } = incinWorld();
    const sys = new GarbageSystem(g.size);

    sys.tick(g, [COM], 0, [facility({ burnRate: 2 })]);

    // COM emitted its pass's units; all collected into the buffer, then 2 burned.
    expect(sys.incineratorStored(incinId)).toBe(COM_PASS - 2);
    expect(sys.incineratorBurnedLast(incinId)).toBe(2);
    expect(sys.trash[buildingTile]).toBe(0);
  });

  it('stops collecting when its buffer is full; trash backs up but it keeps its cap', () => {
    const { g, buildingTile, incinId } = incinWorld();
    const sys = new GarbageSystem(g.size);
    const cap = 2 * IND_PASS;
    const f = facility({ burnRate: 0, bufferCapacity: cap }); // pure store → fills fast

    for (let i = 0; i < 6; i++) sys.tick(g, [IND], i, [f]);

    expect(sys.incineratorStored(incinId)).toBe(cap); // capped, never exceeds
    expect(sys.trash[buildingTile]).toBeGreaterThan(0); // collection stopped → backs up
  });

  it('is a permanent fix when burn >= inflow — buffer stays empty, nothing backs up', () => {
    const { g, buildingTile, incinId } = incinWorld();
    const sys = new GarbageSystem(g.size);
    const f = facility({ burnRate: 1000 }); // >> per-pass inflow

    for (let i = 0; i < 20; i++) sys.tick(g, [COM], i, [f]);

    expect(sys.incineratorStored(incinId)).toBe(0);
    expect(sys.incineratorBurnedLast(incinId)).toBe(unitsOnPass(COM, 19));
    expect(sys.trash[buildingTile]).toBe(0);
  });

  it("drops a removed incinerator's buffer", () => {
    const { g, incinId } = incinWorld();
    const sys = new GarbageSystem(g.size);

    sys.tick(g, [COM], 0, [facility({ burnRate: 0 })]);
    expect(sys.incineratorStored(incinId)).toBeGreaterThan(0);

    sys.tick(g, [COM], 1, []); // incinerator gone → buffer pruned
    expect(sys.incineratorStored(incinId)).toBe(0);
  });
});

describe('GarbageSystem shares the load across the incinerators that reach a building', () => {
  /** The incinerator world with a second plant further down the same road. */
  function twoPlants(): { g: GridState; buildingTile: number; first: number; second: number } {
    const { g, buildingTile, incinId } = incinWorld();
    const second = 21;
    g.buildingId[tileIndex(11, 30)] = second;
    return { g, buildingTile, first: incinId, second };
  }

  it('gives two plants equal shares of one building, within a unit', () => {
    const { g, buildingTile, first, second } = twoPlants();
    const sys = new GarbageSystem(g.size);
    const plants = [facility({ id: first, burnRate: 0 }), facility({ id: second, burnRate: 0 })];
    let emitted = 0;
    for (let i = 0; i < 5; i++) {
      sys.tick(g, [IND], i, plants);
      emitted += unitsOnPass(IND, i);
    }
    const a = sys.incineratorStored(first);
    const b = sys.incineratorStored(second);
    expect(a + b).toBe(emitted);
    expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
    expect(sys.trash[buildingTile]).toBe(0);
  });

  it('lets the plant with room take what a full one cannot', () => {
    const { g, buildingTile, first, second } = twoPlants();
    const sys = new GarbageSystem(g.size);
    const full = facility({ id: first, burnRate: 0, bufferCapacity: 1 });
    const open = facility({ id: second, burnRate: 0 });
    sys.tick(g, [IND], 0, [full, open]);
    expect(sys.incineratorStored(first)).toBe(1);
    expect(sys.incineratorStored(second)).toBe(IND_PASS - 1);
    expect(sys.trash[buildingTile]).toBe(0);
  });

  it('lets the incinerators take a building before the landfill does, since they process what they take', () => {
    const { g, buildingTile } = baseWorld();
    const incinId = 20;
    g.buildingId[tileIndex(11, 25)] = incinId;
    const sys = new GarbageSystem(g.size);
    sys.tick(g, [COM], 0, [facility({ id: incinId, burnRate: 0 })]);
    expect(sys.incineratorStored(incinId)).toBe(COM_PASS);
    expect(sys.landfillStored()).toBe(0);
    expect(sys.trash[buildingTile]).toBe(0);
    // Once the incinerator is full the landfill takes what it leaves.
    sys.tick(g, [COM], 1, [facility({ id: incinId, burnRate: 0, bufferCapacity: COM_PASS })]);
    expect(sys.landfillStored()).toBe(unitsOnPass(COM, 1));
  });

  it('burns what it has up to its ceiling, and its plume follows the burn', () => {
    expect(incineratorEmission(120, 0, 4000)).toBe(0);
    expect(incineratorEmission(120, 2000, 4000)).toBe(60);
    expect(incineratorEmission(120, 4000, 4000)).toBe(120);
    expect(incineratorEmission(120, 9000, 4000)).toBe(120);
    expect(incineratorEmission(120, 10, 0)).toBe(120);
  });
});

describe('GarbageSystem save state', () => {
  it('round-trips landfill fill through serialize/restore', () => {
    const { g } = baseWorld();
    const sys = new GarbageSystem(g.size);
    for (let i = 0; i < 3; i++) sys.tick(g, [COM], i);
    expect(sys.landfillStored()).toBeGreaterThan(0);

    const saved = sys.serializeState();
    expect(saved.incinerators).toHaveLength(0);

    const loaded = new GarbageSystem(g.size);
    loaded.reset();
    loaded.restoreState(saved);
    expect(loaded.landfillStored()).toBe(sys.landfillStored());
  });

  it('round-trips incinerator buffers through serialize/restore', () => {
    const { g, incinId } = incinWorld();
    const sys = new GarbageSystem(g.size);
    for (let i = 0; i < 3; i++) sys.tick(g, [IND], i, [facility({ burnRate: 0 })]);
    const stored = sys.incineratorStored(incinId);
    expect(stored).toBeGreaterThan(0);

    const saved = sys.serializeState();
    expect(saved.incinerators.find((e) => e.id === incinId)?.units).toBe(stored);

    const loaded = new GarbageSystem(g.size);
    loaded.reset();
    loaded.restoreState(saved);
    expect(loaded.incineratorStored(incinId)).toBe(stored);
  });

  it('ignores an absent save state (pre-Stage-A saves)', () => {
    const { g } = baseWorld();
    const sys = new GarbageSystem(g.size);
    sys.tick(g, [COM], 0);
    const before = sys.landfillStored();
    sys.restoreState(undefined); // no-op
    expect(sys.landfillStored()).toBe(before);
  });
});

describe('the kerbside recycling depot', () => {
  const DEPOT_ID = 20;
  const depot = (over: Partial<GarbageDepot> = {}): GarbageDepot => ({
    id: DEPOT_ID,
    collectionRange: 32,
    servesHomes: 38_000,
    ...over,
  });
  const house = (id: number, homes = 1, residents = 500): GarbageBuilding => ({
    id,
    residents,
    jobs: 0,
    homes,
    category: 'res',
  });

  /** The base world (landfill collecting) with a depot footprint beside the road and houses along it. */
  function depotWorld(houseIds: number[]): GridState {
    const { g } = baseWorld();
    g.buildingId[tileIndex(9, 22)] = 0; // the base world's lone building is replaced by the houses
    g.buildingId[tileIndex(11, 25)] = DEPOT_ID;
    houseIds.forEach((id, i) => {
      g.buildingId[tileIndex(9, 23 + i)] = id;
    });
    return g;
  }

  /** Runs a day of passes; returns what reached the landfill and the recycling tally. */
  function runDay(
    g: GridState,
    buildings: GarbageBuilding[],
    depots: GarbageDepot[],
  ): { buried: number; recovered: number; sys: GarbageSystem } {
    const sys = new GarbageSystem(g.size);
    for (let n = 0; n < GARBAGE_PASSES_PER_DAY; n++) sys.tick(g, buildings, n, [], depots);
    return { buried: sys.landfillStored(), recovered: sys.takeRecoveredThisMonth(), sys };
  }

  const RECYCLED_PER_DAY = 500 * RECYCLING_KG_PER_RESIDENT_DAY * 4; // 262 units a day
  const UNSERVED_PER_DAY = 2640;
  /** What the regional plant recovers of a day's carts: 87%, floored once over the day. */
  const regional = (units: number): number => Math.floor((units * MRF_YIELD_PERCENT) / 100);

  it('buries exactly the recyclables less a day, and tallies the 87% the regional plant recovers', () => {
    const g = depotWorld([7]);
    const without = runDay(g, [house(7)], []);
    const withDepot = runDay(g, [house(7)], [depot()]);
    expect(without.buried).toBe(UNSERVED_PER_DAY);
    expect(without.recovered).toBe(0);
    expect(withDepot.recovered).toBe(regional(RECYCLED_PER_DAY));
    expect(withDepot.recovered).toBe(227);
    expect(withDepot.buried).toBe(UNSERVED_PER_DAY - RECYCLED_PER_DAY);
  });

  it('takes the tally once: a second take finds it cleared', () => {
    const g = depotWorld([7]);
    const { sys } = runDay(g, [house(7)], [depot()]);
    expect(sys.takeRecoveredThisMonth()).toBe(0);
  });

  it('does not serve a block, a tower, a shop or a works', () => {
    const g = depotWorld([7, 8, 9, 10]);
    const buildings: GarbageBuilding[] = [
      house(7, 5), // multiplex
      house(8, 120, 400), // tower
      { ...COM, id: 9 }, // shop
      { ...IND, id: 10 }, // works
    ];
    const { recovered, sys } = runDay(g, buildings, [depot()]);
    expect(recovered).toBe(0);
    expect(sys.depotSnapshot()).toEqual([{ id: DEPOT_ID, servedHomes: 0, capacityHomes: 38_000 }]);
  });

  it('serves homes until its capacity is spent, then no more', () => {
    const g = depotWorld([7, 8, 9]);
    const buildings = [house(7, 1), house(8, 2), house(9, 1)];
    const sys = new GarbageSystem(g.size);
    sys.tick(g, buildings, 0, [], [depot({ servesHomes: 3 })]);
    expect(sys.depotSnapshot()).toEqual([{ id: DEPOT_ID, servedHomes: 3, capacityHomes: 3 }]);
    const full = runDay(g, buildings, [depot({ servesHomes: 3 })]);
    const all = runDay(g, buildings, [depot()]);
    expect(full.recovered).toBe(regional(2 * RECYCLED_PER_DAY));
    expect(all.recovered).toBe(regional(3 * RECYCLED_PER_DAY));
  });

  it('serves a building once when two depots overlap, by the lower id', () => {
    const g = depotWorld([7]);
    g.buildingId[tileIndex(11, 30)] = 21;
    const { recovered, sys } = runDay(g, [house(7)], [depot({ id: 21 }), depot()]);
    expect(recovered).toBe(regional(RECYCLED_PER_DAY));
    expect(sys.depotSnapshot()).toEqual([
      { id: DEPOT_ID, servedHomes: 1, capacityHomes: 38_000 },
      { id: 21, servedHomes: 0, capacityHomes: 38_000 },
    ]);
  });

  it('does not serve a home outside the depot road reach', () => {
    const g = depotWorld([]);
    g.buildingId[tileIndex(200, 200)] = 7;
    const { recovered } = runDay(g, [house(7)], [depot()]);
    expect(recovered).toBe(0);
  });

  it('is deterministic', () => {
    const run = (): number[] => {
      const g = depotWorld([7, 8]);
      const { buried, recovered } = runDay(g, [house(8, 2), house(7)], [depot()]);
      return [buried, recovered];
    };
    expect(run()).toEqual(run());
  });

  it('saves the month tally and loads an old save without it as zero', () => {
    const g = depotWorld([7]);
    const { sys } = runDay(g, [house(7)], [depot()]);
    const none = new GarbageSystem(g.size);
    none.tick(g, [house(7)], 0, [], [depot()]);
    const saved = none.serializeState();
    const carts = servedUnitsOnPass(house(7), 0, kerbsideKgPerDay(house(7))).recycling;
    expect(saved.recoveredThisMonth).toBe(regional(carts));
    const loaded = new GarbageSystem(g.size);
    loaded.restoreState(saved);
    expect(loaded.takeRecoveredThisMonth()).toBe(saved.recoveredThisMonth);

    expect(sys.takeRecoveredThisMonth()).toBe(0); // already taken by runDay's read
    const old = new GarbageSystem(g.size);
    old.restoreState({ landfillStored: 5, incinerators: [] });
    expect(old.takeRecoveredThisMonth()).toBe(0);
  });

  it('is credited at the landfill disposal cost: a tile paint plus 30 years of upkeep over its capacity', () => {
    expect(RECYCLING_CREDIT_PER_UNIT).toBeCloseTo(0.000164, 6);
  });

  it('is a 2x3 depot of four trucks serving 4 x 9,500 homes, open at Busy Township', () => {
    const entry = (catalog as { buildings: BuildingCatalogEntry[] }).buildings.find(
      (e) => e.id === 'recycling-depot',
    )!;
    expect(entry.footprint).toEqual({ w: 2, d: 3 });
    expect(entry.garbage!.servesHomes).toBe(4 * RECYCLING_HOMES_PER_TRUCK);
    expect(entry.garbage!.trucks).toBe(4);
    expect(entry.garbage!.collectionRange).toBe(32);
    expect(MILESTONES[entry.unlockMilestone]?.name).toBe('Busy Township');
  });
});

describe('the Materials Recovery Facility', () => {
  const DEPOT_ID = 20;
  const MRF_ID = 30;
  const depot: GarbageDepot = { id: DEPOT_ID, collectionRange: 32, servesHomes: 38_000 };
  const mrf = (over: Partial<GarbageMrf> = {}): GarbageMrf => ({
    id: MRF_ID,
    collectionRange: 48,
    sortRate: MRF_SORT_UNITS_PER_PASS,
    residueCapacity: MRF_RESIDUE_STORE_UNITS,
    ...over,
  });
  const homes = (id: number, units: number, residents: number): GarbageBuilding => ({
    id,
    residents,
    jobs: 0,
    homes: units,
    category: 'res',
  });
  const shop = (id: number, jobs = 100): GarbageBuilding => ({ ...COM, id, jobs });
  const works = (id: number, jobs = 100): GarbageBuilding => ({ ...IND, id, jobs });
  /** A house of 500 residents: 262 units of carts a day, 13 on pass 0. */
  const HOUSE = homes(7, 1, 500);

  /**
   * The base world (landfill collecting at z 20) with a depot at (11,25), an
   * MRF at (11,35) and the given buildings at (9, 23 + i) along the road.
   */
  function mrfWorld(ids: number[]): GridState {
    const { g } = baseWorld();
    g.buildingId[tileIndex(9, 22)] = 0;
    g.buildingId[tileIndex(11, 25)] = DEPOT_ID;
    g.buildingId[tileIndex(11, 35)] = MRF_ID;
    ids.forEach((id, i) => {
      g.buildingId[tileIndex(9, 23 + i)] = id;
    });
    return g;
  }

  /** The day's recycling the round takes from a building on each pass, summed. */
  const roundOnPass = (b: GarbageBuilding, pass: number): number =>
    servedUnitsOnPass(b, pass, roundKgPerDay(b)).recycling;

  it('sorts 50 short tons a day, 9,072 units a pass, and holds a week of its residue', () => {
    expect(MRF_SORT_UNITS_PER_PASS).toBe(9_072);
    expect(MRF_SORT_UNITS_PER_PASS).toBe(
      Math.round((50 * 0.90718474 * TRASH_UNITS_PER_TONNE) / GARBAGE_PASSES_PER_DAY),
    );
    expect(MRF_RESIDUE_STORE_UNITS).toBe(Math.round(0.13 * 9_072 * GARBAGE_PASSES_PER_DAY * 7));
    expect(MRF_RESIDUE_STORE_UNITS).toBe(165_110);
  });

  it('is a 5x6, 11 m plant of four trucks whose catalog figures are the derived constants, open at Grand City', () => {
    const entry = (catalog as { buildings: BuildingCatalogEntry[] }).buildings.find(
      (e) => e.id === 'materials-recovery-facility',
    )!;
    expect(entry.footprint).toEqual({ w: 5, d: 6 });
    expect(entry.height).toBe(11);
    expect(entry.garbage).toEqual({
      collectionRange: 48,
      bufferCapacity: MRF_RESIDUE_STORE_UNITS,
      burnRate: 0,
      trucks: 4,
      sortRate: MRF_SORT_UNITS_PER_PASS,
    });
    expect([entry.cost, entry.upkeep, entry.pollution]).toEqual([24_000, 1_750, 20]);
    expect(MILESTONES[entry.unlockMilestone]?.name).toBe('Grand City');
  });

  it('rounds up blocks of more than four homes and every job, never a building kerbside serves', () => {
    expect(roundKgPerDay(homes(1, 5, 12))).toBeCloseTo(5 * MRF_KG_PER_HOME_DAY, 9);
    expect(roundKgPerDay(homes(1, 4, 10))).toBe(0);
    expect(roundKgPerDay(homes(1, 1, 3))).toBe(0);
    expect(roundKgPerDay(homes(1, 40, 0))).toBe(0); // an empty block
    expect(roundKgPerDay(shop(1))).toBeCloseTo(100 * MRF_KG_PER_COMMERCIAL_JOB_DAY, 9);
    expect(roundKgPerDay(works(1))).toBeCloseTo(100 * MRF_KG_PER_INDUSTRIAL_JOB_DAY, 9);
    // A mixed-use block (catalog category res) is served for its homes and its shops.
    expect(roundKgPerDay({ ...homes(1, 10, 23), jobs: 17 })).toBeCloseTo(
      10 * MRF_KG_PER_HOME_DAY + 17 * MRF_KG_PER_COMMERCIAL_JOB_DAY,
      9,
    );
    // A farm is one home: kerbside's, with its job.
    expect(roundKgPerDay({ id: 1, residents: 3, jobs: 1, homes: 1, category: 'ind' })).toBe(0);
  });

  it('recovers 87% of what it sorts, floored on the day, and keeps the rest as residue', () => {
    expect(recoveredOf(0, MRF_SORT_UNITS_PER_PASS)).toBe(7_892);
    expect(MRF_SORT_UNITS_PER_PASS - recoveredOf(0, MRF_SORT_UNITS_PER_PASS)).toBe(1_180);
    let before = 0;
    let recovered = 0;
    for (const s of [1, 1, 1, 13, 14, 0, 7, 9_072, 3]) {
      const r = recoveredOf(before, s);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(s);
      recovered += r;
      before += s;
    }
    expect(recovered).toBe(Math.floor((before * 87) / 100));
  });

  it('claims the depots carts first, then its round, up to its throughput', () => {
    const g = mrfWorld([HOUSE.id, 8, 9]);
    const sys = new GarbageSystem(g.size);
    const carts = servedUnitsOnPass(HOUSE, 0, kerbsideKgPerDay(HOUSE)).recycling;
    expect(carts).toBe(13);
    expect(roundOnPass(shop(8), 0)).toBe(6);
    // Room for the carts and one shop: the second shop does not fit what is left.
    sys.tick(g, [HOUSE, shop(8), shop(9)], 0, [], [depot], [mrf({ sortRate: 20 })]);
    expect(sys.mrfSnapshot()).toEqual([
      { id: MRF_ID, sorted: 19, servedBuildings: 1, residue: 0, stopped: false },
    ]);
    expect(sys.takeRecoveredThisMonth()).toBe(recoveredOf(0, 19));
  });

  it('leaves the round unserved and sends the rest of the carts regional when the carts fill it', () => {
    const g = mrfWorld([HOUSE.id, 8]);
    const sys = new GarbageSystem(g.size);
    sys.tick(g, [HOUSE, shop(8)], 0, [], [depot], [mrf({ sortRate: 10 })]);
    expect(sys.mrfSnapshot()[0]).toMatchObject({ sorted: 10, servedBuildings: 0 });
    expect(sys.takeRecoveredThisMonth()).toBe(recoveredOf(0, 10) + recoveredOf(0, 3));
  });

  it('leaves a depot on a road network of its own to the regional plant', () => {
    const g = mrfWorld([]);
    g.buildingId[tileIndex(11, 25)] = 0;
    for (let z = 10; z <= 40; z++) g.roadTier[tileIndex(100, z)] = RoadTier.TwoLane;
    g.buildingId[tileIndex(101, 25)] = DEPOT_ID;
    g.buildingId[tileIndex(99, 23)] = HOUSE.id;
    const sys = new GarbageSystem(g.size);
    sys.tick(g, [HOUSE], 0, [], [depot], [mrf()]);
    const carts = servedUnitsOnPass(HOUSE, 0, kerbsideKgPerDay(HOUSE)).recycling;
    expect(sys.depotSnapshot()[0]!.servedHomes).toBe(1);
    expect(sys.mrfSnapshot()[0]).toMatchObject({ sorted: 0, servedBuildings: 0 });
    expect(sys.takeRecoveredThisMonth()).toBe(recoveredOf(0, carts));
  });

  it('claims the carts of a depot its streets connect to, at any distance', () => {
    const { g, sys } = forwardWorld(0);
    g.buildingId[tileIndex(240, 49)] = DEPOT_ID; // some 235 road tiles from the plant
    g.buildingId[tileIndex(241, 51)] = HOUSE.id;
    sys.tick(g, [HOUSE], 0, [], [depot], [mrf()]);
    const carts = servedUnitsOnPass(HOUSE, 0, kerbsideKgPerDay(HOUSE)).recycling;
    expect(carts).toBeGreaterThan(0);
    expect(sys.mrfSnapshot()[0]).toMatchObject({ sorted: carts, servedBuildings: 0 });
    expect(sys.mrfResidueStored(MRF_ID)).toBe(carts - recoveredOf(0, carts)); // no landfill
  });

  it('serves blocks, towers, shops and works in reach, and no house, fourplex or farm', () => {
    const farm: GarbageBuilding = { id: 13, residents: 3, jobs: 1, homes: 1, category: 'ind' };
    const buildings = [
      homes(7, 1, 500),
      homes(8, 4, 10),
      homes(9, 50, 120),
      homes(10, 120, 400),
      shop(11),
      works(12),
      farm,
    ];
    const g = mrfWorld(buildings.map((b) => b.id));
    const sys = new GarbageSystem(g.size);
    sys.tick(g, buildings, 0, [], [], [mrf()]);
    const served = buildings.slice(2, 6);
    const sorted = served.reduce((sum, b) => sum + roundOnPass(b, 0), 0);
    expect(sys.mrfSnapshot()).toEqual([
      { id: MRF_ID, sorted, servedBuildings: served.length, residue: 0, stopped: false },
    ]);
  });

  it('serves a building once across two plants, in id order, each up to its room', () => {
    const buildings = [homes(9, 50, 120), homes(10, 120, 400), shop(11), works(12)];
    const g = mrfWorld(buildings.map((b) => b.id));
    g.buildingId[tileIndex(11, 38)] = 31;
    expect(roundOnPass(buildings[0]!, 0)).toBe(3);
    const sys = new GarbageSystem(g.size);
    sys.tick(g, buildings, 0, [], [], [mrf({ id: 31 }), mrf({ sortRate: 3 })]);
    expect(sys.mrfSnapshot().map((m) => [m.id, m.servedBuildings])).toEqual([
      [MRF_ID, 1],
      [31, 3],
    ]);
  });

  it('does not serve a building outside its road reach', () => {
    const g = mrfWorld([]);
    g.buildingId[tileIndex(200, 200)] = 11;
    const sys = new GarbageSystem(g.size);
    sys.tick(g, [shop(11)], 0, [], [], [mrf()]);
    expect(sys.mrfSnapshot()[0]).toMatchObject({ sorted: 0, servedBuildings: 0 });
  });

  it('loses and invents no unit over a day: the landfill takes the refuse and the residue', () => {
    const g = mrfWorld([11]);
    const run = (plants: GarbageMrf[]): GarbageSystem => {
      const sys = new GarbageSystem(g.size);
      for (let n = 0; n < GARBAGE_PASSES_PER_DAY; n++) sys.tick(g, [shop(11)], n, [], [], plants);
      return sys;
    };
    const without = run([]);
    const withMrf = run([mrf()]);
    // 100 jobs: 744 units a day, 120 of them recycling, 104 recovered and 16 residue.
    expect(without.landfillStored()).toBe(744);
    expect(withMrf.takeRecoveredThisMonth()).toBe(104);
    expect(withMrf.landfillStored()).toBe(744 - 120 + 16);
    expect(withMrf.mrfResidueStored(MRF_ID)).toBe(0);
  });

  /**
   * A road column x=10 (z 10..50) and a row z=50 out to x=250, the MRF at
   * (11,45) holding `residue`, and no buildings: only forwarding moves units.
   */
  function forwardWorld(residue: number): { g: GridState; sys: GarbageSystem } {
    const g = createGrid();
    for (let z = 10; z <= 50; z++) g.roadTier[tileIndex(10, z)] = RoadTier.TwoLane;
    for (let x = 11; x <= 250; x++) g.roadTier[tileIndex(x, 50)] = RoadTier.TwoLane;
    g.buildingId[tileIndex(11, 45)] = MRF_ID;
    const sys = new GarbageSystem(g.size);
    sys.restoreState({ landfillStored: 0, incinerators: [], mrfs: [{ id: MRF_ID, residue }] });
    return { g, sys };
  }
  const incinerator = (id: number, bufferCapacity = 1_000): GarbageFacility => ({
    id,
    collectionRange: 40,
    bufferCapacity,
    burnRate: 0,
  });

  it('forwards its residue to a landfill at any distance along the road', () => {
    const { g, sys } = forwardWorld(500);
    for (let x = 240; x <= 241; x++) {
      g.landfill[tileIndex(x, 51)] = 1;
      g.landfill[tileIndex(x, 52)] = 1;
    }
    sys.tick(g, [], 0, [], [], [mrf()]);
    expect(sys.landfillStored()).toBe(500);
    expect(sys.mrfResidueStored(MRF_ID)).toBe(0);
  });

  it('forwards to the nearest final facility first, and the overflow to the next', () => {
    const { g, sys } = forwardWorld(500);
    for (let x = 240; x <= 241; x++) {
      g.landfill[tileIndex(x, 51)] = 1;
      g.landfill[tileIndex(x, 52)] = 1;
    }
    g.buildingId[tileIndex(60, 51)] = 40; // nearer than the landfill
    sys.tick(g, [], 0, [incinerator(40, 200)], [], [mrf()]);
    expect(sys.incineratorStored(40)).toBe(200);
    expect(sys.landfillStored()).toBe(300);
  });

  it('forwards to the landfill before an incinerator at the same road distance', () => {
    const { g, sys } = forwardWorld(500);
    for (let x = 100; x <= 101; x++) {
      g.landfill[tileIndex(x, 51)] = 1;
      g.landfill[tileIndex(x, 52)] = 1;
    }
    g.buildingId[tileIndex(100, 49)] = 40; // its street is the landfill's
    sys.tick(g, [], 0, [incinerator(40)], [], [mrf()]);
    expect(sys.landfillStored()).toBe(500);
    expect(sys.incineratorStored(40)).toBe(0);
  });

  it('keeps its residue when no final facility is connected, or every one is full', () => {
    const lone = forwardWorld(500);
    lone.g.buildingId[tileIndex(200, 200)] = 40; // an incinerator off every road
    lone.sys.tick(lone.g, [], 0, [incinerator(40)], [], [mrf()]);
    expect(lone.sys.mrfResidueStored(MRF_ID)).toBe(500);

    const full = forwardWorld(500);
    full.g.buildingId[tileIndex(60, 51)] = 40;
    full.sys.restoreState({
      landfillStored: 0,
      incinerators: [{ id: 40, units: 1_000 }],
      mrfs: [{ id: MRF_ID, residue: 500 }],
    });
    full.sys.tick(full.g, [], 0, [incinerator(40)], [], [mrf()]);
    expect(full.sys.mrfResidueStored(MRF_ID)).toBe(500);
    expect(full.sys.incineratorStored(40)).toBe(1_000);
  });

  it('fills its store with nothing behind it, then stops: no round, and the carts go regional', () => {
    const g = mrfWorld([HOUSE.id, 8]);
    g.landfill.fill(0);
    const sys = new GarbageSystem(g.size);
    const plant = mrf({ residueCapacity: 5 });
    const buildings = [HOUSE, shop(8)];
    const day = GARBAGE_PASSES_PER_DAY;
    for (let n = 0; n < day; n++) sys.tick(g, buildings, n, [], [depot], [plant]);
    expect(sys.mrfSnapshot()).toEqual([
      { id: MRF_ID, sorted: 0, servedBuildings: 0, residue: 5, stopped: true },
    ]);

    // The first pass of a new day, stopped: every cart goes regional, and the
    // shop, off the round, puts all of its trash on its tile.
    sys.takeRecoveredThisMonth();
    sys.trash.fill(0);
    sys.tick(g, buildings, day, [], [depot], [plant]);
    const carts = servedUnitsOnPass(HOUSE, day, kerbsideKgPerDay(HOUSE)).recycling;
    expect(sys.mrfSnapshot()[0]).toMatchObject({ sorted: 0, servedBuildings: 0, stopped: true });
    expect(sys.takeRecoveredThisMonth()).toBe(recoveredOf(0, carts));
    expect(sys.trash[tileIndex(9, 24)]).toBe(unitsOnPass(shop(8), day));

    // A landfill painted behind it takes the store, and it sorts again.
    g.landfill[tileIndex(11, 20)] = 1;
    g.landfill[tileIndex(12, 20)] = 1;
    sys.tick(g, buildings, day + 1, [], [depot], [plant]);
    expect(sys.mrfSnapshot()[0]).toMatchObject({ stopped: true, residue: 0 });
    sys.tick(g, buildings, day + 2, [], [depot], [plant]);
    expect(sys.mrfSnapshot()[0]!.stopped).toBe(false);
    expect(sys.mrfSnapshot()[0]!.sorted).toBeGreaterThan(0);
  });

  it('stops the same way when the only landfill it reaches is full', () => {
    const g = mrfWorld([HOUSE.id]);
    const sys = new GarbageSystem(g.size);
    sys.restoreState({ landfillStored: 2 * LANDFILL_CAPACITY_PER_TILE, incinerators: [] });
    const plant = mrf({ residueCapacity: 5 });
    for (let n = 0; n < GARBAGE_PASSES_PER_DAY; n++) {
      sys.tick(g, [HOUSE], n, [], [depot], [plant]);
    }
    expect(sys.mrfSnapshot()[0]).toMatchObject({ residue: 5, stopped: true, sorted: 0 });
  });

  it('saves its residue store, loads an old save without one as empty, and drops a removed plant', () => {
    const g = mrfWorld([HOUSE.id]);
    g.landfill.fill(0);
    const sys = new GarbageSystem(g.size);
    for (let n = 0; n < 3; n++) sys.tick(g, [HOUSE], n, [], [depot], [mrf()]);
    const held = sys.mrfResidueStored(MRF_ID);
    expect(held).toBeGreaterThan(0);
    const saved = sys.serializeState();
    expect(saved.mrfs).toEqual([{ id: MRF_ID, residue: held }]);
    const loaded = new GarbageSystem(g.size);
    loaded.restoreState(saved);
    expect(loaded.mrfResidueStored(MRF_ID)).toBe(held);

    const old = new GarbageSystem(g.size);
    old.restoreState({ landfillStored: 5, incinerators: [] });
    expect(old.mrfResidueStored(MRF_ID)).toBe(0);

    loaded.tick(g, [HOUSE], 3, [], [depot], []);
    expect(loaded.mrfResidueStored(MRF_ID)).toBe(0);
    expect(loaded.serializeState().mrfs).toEqual([]);
  });

  it('is deterministic', () => {
    const run = (): unknown => {
      const g = mrfWorld([HOUSE.id, 8, 9]);
      const sys = new GarbageSystem(g.size);
      const buildings = [works(9), HOUSE, shop(8)];
      for (let n = 0; n < GARBAGE_PASSES_PER_DAY; n++) {
        sys.tick(g, buildings, n, [], [depot], [mrf({ sortRate: 25 })]);
      }
      return [sys.landfillStored(), sys.takeRecoveredThisMonth(), sys.mrfSnapshot()];
    };
    expect(run()).toEqual(run());
  });
});

describe('the transfer station', () => {
  const STATION_ID = 50;
  const NEAR = 7;
  const FAR = 8;
  const NEAR_TILE = tileIndex(9, 25);
  const FAR_TILE = tileIndex(60, 41);
  const station = (over: Partial<GarbageTransfer> = {}): GarbageTransfer => ({
    id: STATION_ID,
    collectionRange: 40,
    transferRate: TRANSFER_UNITS_PER_PASS,
    floorCapacity: TRANSFER_FLOOR_UNITS,
    ...over,
  });
  // 100 jobs each: 37 units on pass 0.
  const near = people(NEAR, 0, 100);
  const far = people(FAR, 0, 100);

  /**
   * A road column x=10 (z 10..40) and a row z=40 out to x=250; the landfill at
   * (11..12, 20) collects up the column, the station at (30,41) stands on the
   * row. The building at (9,25) is in both reaches, the one at (60,41) in the
   * station's alone.
   */
  function stationWorld(): GridState {
    const g = createGrid();
    for (let z = 10; z <= 40; z++) g.roadTier[tileIndex(10, z)] = RoadTier.TwoLane;
    for (let x = 11; x <= 250; x++) g.roadTier[tileIndex(x, 40)] = RoadTier.TwoLane;
    g.landfill[tileIndex(11, 20)] = 1;
    g.landfill[tileIndex(12, 20)] = 1;
    g.buildingId[tileIndex(30, 41)] = STATION_ID;
    g.buildingId[NEAR_TILE] = NEAR;
    g.buildingId[FAR_TILE] = FAR;
    return g;
  }

  /** The row z=40 alone with the station at (30,41) holding `stored` on its floor, and no buildings. */
  function floorWorld(stored: number): { g: GridState; sys: GarbageSystem } {
    const g = createGrid();
    for (let x = 10; x <= 250; x++) g.roadTier[tileIndex(x, 40)] = RoadTier.TwoLane;
    g.buildingId[tileIndex(30, 41)] = STATION_ID;
    const sys = new GarbageSystem(g.size);
    sys.restoreState({
      landfillStored: 0,
      incinerators: [],
      transfers: [{ id: STATION_ID, stored }],
    });
    return { g, sys };
  }
  const paintLandfillAt = (g: GridState, x: number): void => {
    for (const dx of [0, 1]) {
      g.landfill[tileIndex(x + dx, 41)] = 1;
      g.landfill[tileIndex(x + dx, 42)] = 1;
    }
  };
  const incinerator = (id: number, bufferCapacity = 1_000, burnRate = 0): GarbageFacility => ({
    id,
    collectionRange: 40,
    bufferCapacity,
    burnRate,
  });

  it('moves 50 short tons a day, 9,072 units a pass by the MRF derivation, onto a two-day floor', () => {
    expect(TRANSFER_UNITS_PER_PASS).toBe(MRF_SORT_UNITS_PER_PASS);
    expect(TRANSFER_UNITS_PER_PASS).toBe(
      Math.round((50 * 0.90718474 * TRASH_UNITS_PER_TONNE) / GARBAGE_PASSES_PER_DAY),
    );
    expect(TRANSFER_FLOOR_DAYS).toBe(2);
    expect(TRANSFER_FLOOR_UNITS).toBe(TRANSFER_UNITS_PER_PASS * GARBAGE_PASSES_PER_DAY * 2);
    expect(TRANSFER_FLOOR_UNITS).toBe(362_880);
  });

  it('is a 4x5, 11 m station of four trucks whose catalog figures are the derived constants, open at Small City', () => {
    const entry = (catalog as { buildings: BuildingCatalogEntry[] }).buildings.find(
      (e) => e.id === 'transfer-station',
    )!;
    expect(entry.footprint).toEqual({ w: 4, d: 5 });
    expect(entry.height).toBe(11);
    expect(entry.garbage).toEqual({
      collectionRange: 40,
      bufferCapacity: TRANSFER_FLOOR_UNITS,
      burnRate: 0,
      trucks: 4,
      transferRate: TRANSFER_UNITS_PER_PASS,
    });
    expect([entry.cost, entry.upkeep, entry.pollution]).toEqual([7_500, 540, 25]);
    expect(MILESTONES[entry.unlockMilestone]?.name).toBe('Small City');
  });

  it('collects only what the landfill leaves: a building both reach goes to the landfill, one only it reaches to it', () => {
    const g = stationWorld();
    const alone = new GarbageSystem(g.size);
    alone.tick(g, [near, far], 0);
    expect(alone.landfillStored()).toBe(COM_PASS);
    expect(alone.trash[FAR_TILE]).toBe(COM_PASS);

    const sys = new GarbageSystem(g.size);
    sys.tick(g, [near, far], 0, [], [], [], [station()]);
    expect(sys.transferSnapshot()).toEqual([
      { id: STATION_ID, collected: COM_PASS, forwarded: COM_PASS, stored: 0, stopped: false },
    ]);
    expect(sys.landfillStored()).toBe(2 * COM_PASS);
    expect(sys.trash[NEAR_TILE]).toBe(0);
    expect(sys.trash[FAR_TILE]).toBe(0);
  });

  it('collects no more than its throughput a pass', () => {
    const g = stationWorld();
    const sys = new GarbageSystem(g.size);
    sys.tick(g, [far], 0, [], [], [], [station({ transferRate: 20 })]);
    expect(sys.transferSnapshot()[0]).toMatchObject({ collected: 20, forwarded: 20, stored: 0 });
    expect(sys.trash[FAR_TILE]).toBe(COM_PASS - 20);
  });

  it('fills its floor with nothing behind it, no further than the floor, then stops collecting', () => {
    const g = stationWorld();
    g.landfill.fill(0);
    const sys = new GarbageSystem(g.size);
    const small = station({ floorCapacity: 50 });
    sys.tick(g, [far], 0, [], [], [], [small]);
    expect(sys.transferSnapshot()[0]).toEqual({
      id: STATION_ID,
      collected: 37,
      forwarded: 0,
      stored: 37,
      stopped: false,
    });
    sys.tick(g, [far], 1, [], [], [], [small]);
    expect(sys.transferSnapshot()[0]).toMatchObject({ collected: 13, stored: 50, stopped: false });
    expect(sys.trash[FAR_TILE]).toBe(unitsOnPass(far, 1) - 13);
    sys.tick(g, [far], 2, [], [], [], [small]);
    expect(sys.transferSnapshot()[0]).toMatchObject({ collected: 0, stored: 50, stopped: true });
    expect(sys.trash[FAR_TILE]).toBe(unitsOnPass(far, 1) - 13 + unitsOnPass(far, 2));
  });

  it('forwards to a landfill at any distance, up to its throughput a pass', () => {
    const { g, sys } = floorWorld(500);
    paintLandfillAt(g, 240); // some 210 road tiles from the station
    sys.tick(g, [], 0, [], [], [], [station({ transferRate: 300 })]);
    expect(sys.landfillStored()).toBe(300);
    expect(sys.transferSnapshot()[0]).toMatchObject({ collected: 0, forwarded: 300, stored: 200 });
    sys.tick(g, [], 1, [], [], [], [station({ transferRate: 300 })]);
    expect(sys.landfillStored()).toBe(500);
    expect(sys.transferStored(STATION_ID)).toBe(0);
  });

  it('forwards to the nearest final facility with room first, and the overflow to the next', () => {
    const { g, sys } = floorWorld(500);
    paintLandfillAt(g, 240);
    g.buildingId[tileIndex(60, 41)] = 40; // nearer than the landfill
    sys.tick(g, [], 0, [incinerator(40, 200)], [], [], [station()]);
    expect(sys.incineratorStored(40)).toBe(200);
    expect(sys.landfillStored()).toBe(300);
    expect(sys.transferStored(STATION_ID)).toBe(0);
  });

  it('forwards to the landfill before an incinerator at the same road distance', () => {
    const { g, sys } = floorWorld(500);
    paintLandfillAt(g, 100);
    g.buildingId[tileIndex(100, 39)] = 40; // its street is the landfill's
    sys.tick(g, [], 0, [incinerator(40)], [], [], [station()]);
    expect(sys.landfillStored()).toBe(500);
    expect(sys.incineratorStored(40)).toBe(0);
  });

  it('lands in an incinerator pit that burns it on its next pass', () => {
    const { g, sys } = floorWorld(500);
    g.buildingId[tileIndex(60, 41)] = 40;
    const plant = incinerator(40, 1_000, 50);
    sys.tick(g, [], 0, [plant], [], [], [station()]);
    expect(sys.incineratorStored(40)).toBe(500);
    expect(sys.incineratorBurnedLast(40)).toBe(0);
    sys.tick(g, [], 1, [plant], [], [], [station()]);
    expect(sys.incineratorBurnedLast(40)).toBe(50);
    expect(sys.incineratorStored(40)).toBe(450);
  });

  it('keeps its floor when no final facility is connected', () => {
    const { g, sys } = floorWorld(500);
    g.buildingId[tileIndex(200, 200)] = 40; // an incinerator off every road
    sys.tick(g, [], 0, [incinerator(40)], [], [], [station()]);
    expect(sys.transferSnapshot()[0]).toMatchObject({ forwarded: 0, stored: 500 });
    expect(sys.incineratorStored(40)).toBe(0);
  });

  it('diverts nothing and loses no unit: what it collects is forwarded or on its floor', () => {
    const g = stationWorld();
    const sys = new GarbageSystem(g.size);
    // The landfill has room for 100 more units; then it is full and the
    // station takes the building both reach as well.
    const start = 2 * LANDFILL_CAPACITY_PER_TILE - 100;
    sys.restoreState({ landfillStored: start, incinerators: [] });
    let generated = 0;
    let before = 0;
    for (let n = 0; n < 5; n++) {
      sys.tick(g, [near, far], n, [], [], [], [station()]);
      generated += unitsOnPass(near, n) + unitsOnPass(far, n);
      const s = sys.transferSnapshot()[0]!;
      expect(s.collected).toBe(s.forwarded + s.stored - before);
      before = s.stored;
    }
    expect(sys.takeRecoveredThisMonth()).toBe(0);
    expect(sys.isLandfillFull(g)).toBe(true);
    const onTiles = sys.trash[NEAR_TILE]! + sys.trash[FAR_TILE]!;
    expect(onTiles).toBe(0);
    expect(sys.landfillStored() - start + sys.transferStored(STATION_ID)).toBe(generated);
  });

  it('shares a building two stations reach between them', () => {
    const g = stationWorld();
    g.buildingId[tileIndex(31, 41)] = STATION_ID + 1;
    const sys = new GarbageSystem(g.size);
    sys.tick(g, [far], 0, [], [], [], [station({ id: STATION_ID + 1 }), station()]);
    expect(sys.transferSnapshot().map((s) => [s.id, s.collected])).toEqual([
      [STATION_ID, 19],
      [STATION_ID + 1, 18],
    ]);
    expect(sys.landfillStored()).toBe(COM_PASS);
  });

  it('saves its floor, loads an old save without one as empty, and drops a removed station', () => {
    const g = stationWorld();
    g.landfill.fill(0);
    const sys = new GarbageSystem(g.size);
    for (let n = 0; n < 3; n++) sys.tick(g, [far], n, [], [], [], [station()]);
    const held = sys.transferStored(STATION_ID);
    expect(held).toBeGreaterThan(0);
    const saved = sys.serializeState();
    expect(saved.transfers).toEqual([{ id: STATION_ID, stored: held }]);
    const loaded = new GarbageSystem(g.size);
    loaded.restoreState(saved);
    expect(loaded.transferStored(STATION_ID)).toBe(held);

    const old = new GarbageSystem(g.size);
    old.restoreState({ landfillStored: 5, incinerators: [] });
    expect(old.transferStored(STATION_ID)).toBe(0);

    loaded.tick(g, [far], 3, [], [], [], []);
    expect(loaded.transferStored(STATION_ID)).toBe(0);
    expect(loaded.serializeState().transfers).toEqual([]);
  });

  it('is deterministic', () => {
    const run = (): unknown => {
      const g = stationWorld();
      g.buildingId[tileIndex(31, 41)] = STATION_ID + 1;
      const sys = new GarbageSystem(g.size);
      sys.restoreState({ landfillStored: 2 * LANDFILL_CAPACITY_PER_TILE - 500, incinerators: [] });
      const stations = [station({ transferRate: 25 }), station({ id: STATION_ID + 1 })];
      for (let n = 0; n < GARBAGE_PASSES_PER_DAY; n++) {
        sys.tick(g, [far, near], n, [], [], [], stations);
      }
      return [sys.landfillStored(), sys.transferSnapshot(), sys.serializeState()];
    };
    expect(run()).toEqual(run());
  });
});
