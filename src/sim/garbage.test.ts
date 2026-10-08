import { describe, expect, it } from 'vitest';
import { RoadTier, type BuildingCatalogEntry, type GridState } from '../shared/types';
import {
  GARBAGE_PASSES_PER_DAY,
  LANDFILL_CAPACITY_PER_TILE,
  MILESTONES,
  RECYCLING_CREDIT_PER_UNIT,
  RECYCLING_HOMES_PER_TRUCK,
  RECYCLING_KG_PER_RESIDENT_DAY,
  tileIndex,
} from '../shared/constants';
import { createGrid } from '../world/grid';
import {
  GarbageSystem,
  incineratorEmission,
  servedUnitsOnPass,
  unitsOnPass,
  type GarbageBuilding,
  type GarbageDepot,
  type GarbageFacility,
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
const COM: GarbageBuilding = { id: 7, residents: 0, jobs: 100, homes: 0 };
const IND: GarbageBuilding = { id: 7, residents: 0, jobs: 500, homes: 0 };
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
    expect(daySum({ id: 1, residents: 100, jobs: 0, homes: 0 })).toBe(528);
  });

  it('10 jobs emit 74 units over a day (74.4 floored)', () => {
    expect(daySum({ id: 1, residents: 0, jobs: 10, homes: 0 })).toBe(74);
  });

  it('a mixed building sums both', () => {
    expect(daySum({ id: 1, residents: 100, jobs: 10, homes: 0 })).toBe(528 + 74);
  });

  it('one resident emits on some passes and not others, yet totals right over a day', () => {
    const b = { id: 1, residents: 1, jobs: 0, homes: 0 };
    const perPass = Array.from({ length: GARBAGE_PASSES_PER_DAY }, (_, n) => unitsOnPass(b, n));
    expect(perPass).toContain(0);
    expect(perPass.some((u) => u > 0)).toBe(true);
    expect(daySum(b)).toBe(5); // 1.32 kg a day is 5.28 units
  });

  it('is the same for the same pass', () => {
    const b = { id: 1, residents: 37, jobs: 9, homes: 0 };
    expect(unitsOnPass(b, 123)).toBe(unitsOnPass(b, 123));
  });

  it('spreads a pass over the footprint, the remainder on the first tiles', () => {
    const g = createGrid();
    const tiles = [tileIndex(50, 50), tileIndex(51, 50), tileIndex(52, 50)];
    for (const t of tiles) g.buildingId[t] = 9;
    const b = { id: 9, residents: 0, jobs: 100, homes: 0 }; // 37 on pass 0
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

    sys.tick(g, [COM, { id: 8, residents: 0, jobs: 100, homes: 0 }], 0);

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

  it('buries exactly the recyclables less a day, and tallies them', () => {
    const g = depotWorld([7]);
    const without = runDay(g, [house(7)], []);
    const withDepot = runDay(g, [house(7)], [depot()]);
    expect(without.buried).toBe(UNSERVED_PER_DAY);
    expect(without.recovered).toBe(0);
    expect(withDepot.recovered).toBe(RECYCLED_PER_DAY);
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
      { id: 9, residents: 0, jobs: 100, homes: 0 }, // shop
      { id: 10, residents: 0, jobs: 500, homes: 0 }, // works
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
    expect(full.recovered).toBe(2 * RECYCLED_PER_DAY);
    expect(all.recovered).toBe(3 * RECYCLED_PER_DAY);
  });

  it('serves a building once when two depots overlap, by the lower id', () => {
    const g = depotWorld([7]);
    g.buildingId[tileIndex(11, 30)] = 21;
    const { recovered, sys } = runDay(g, [house(7)], [depot({ id: 21 }), depot()]);
    expect(recovered).toBe(RECYCLED_PER_DAY);
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
    expect(saved.recoveredThisMonth).toBe(servedUnitsOnPass(house(7), 0).recycling);
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
