import { describe, expect, it } from 'vitest';
import { MAP_SIZE, tileIndex } from '../shared/constants';
import { BuildingState, ZoneType } from '../shared/types';
import type { BuildingCatalogEntry, GridState } from '../shared/types';
import { BuildingRegistry, settleBuildingDelta } from './buildings';
import { createGrid } from '../world/grid';

function makeGrid(): GridState {
  return createGrid();
}

const house: BuildingCatalogEntry = {
  id: 'house',
  name: 'Small House',
  category: 'res',
  zone: ZoneType.ResLow,
  level: 1,
  footprint: { w: 1, d: 1 },
  height: 5,
  color: 0x00ff00,
  residents: 4,
  powerUse: 0.1,
  waterUse: 0.1,
  cost: 0,
  upkeep: 0,
  unlockMilestone: 0,
};

const shop: BuildingCatalogEntry = {
  id: 'shop',
  name: 'Corner Shop',
  category: 'com',
  zone: ZoneType.ComLow,
  level: 1,
  footprint: { w: 2, d: 1 },
  height: 6,
  color: 0x0000ff,
  jobs: 10,
  powerUse: 0.2,
  waterUse: 0.2,
  cost: 0,
  upkeep: 0,
  unlockMilestone: 0,
};

const park: BuildingCatalogEntry = {
  id: 'park',
  name: 'Pocket Park',
  category: 'park',
  footprint: { w: 1, d: 1 },
  height: 1,
  color: 0x00aa00,
  powerUse: 0,
  waterUse: 0,
  cost: 400,
  upkeep: 20,
  unlockMilestone: 0,
};

const catalog: BuildingCatalogEntry[] = [house, shop, park];

describe('BuildingRegistry', () => {
  it('stamps the footprint tiles with the new building id and returns the instance', () => {
    const g = makeGrid();
    const registry = new BuildingRegistry(catalog);
    const inst = registry.place(g, shop, 10, 10, 0);
    expect(inst).not.toBeNull();
    expect(inst!.id).toBe(1);
    expect(inst!.catalogId).toBe('shop');
    expect(inst!.x).toBe(10);
    expect(inst!.z).toBe(10);
    expect(inst!.level).toBe(1);
    expect(inst!.state).toBe(BuildingState.Active);
    // footprint is w=2,d=1 at rotation 0: tiles (10,10) and (11,10)
    expect(g.buildingId[tileIndex(10, 10)]).toBe(1);
    expect(g.buildingId[tileIndex(11, 10)]).toBe(1);
    expect(g.buildingId[tileIndex(12, 10)]).toBe(0);
    expect(g.buildingId[tileIndex(10, 11)]).toBe(0);
  });

  it('swaps width/depth on a 90 degree rotation', () => {
    const g = makeGrid();
    const registry = new BuildingRegistry(catalog);
    const inst = registry.place(g, shop, 20, 20, 1);
    expect(inst).not.toBeNull();
    // footprint w=2,d=1 rotated 90 degrees becomes w=1,d=2: tiles (20,20) and (20,21)
    expect(g.buildingId[tileIndex(20, 20)]).toBe(1);
    expect(g.buildingId[tileIndex(20, 21)]).toBe(1);
    expect(g.buildingId[tileIndex(21, 20)]).toBe(0);
    expect(g.buildingId[tileIndex(20, 22)]).toBe(0);
  });

  it('swaps width/depth on a 270 degree rotation the same way as 90', () => {
    const g = makeGrid();
    const registry = new BuildingRegistry(catalog);
    registry.place(g, shop, 30, 30, 3);
    expect(g.buildingId[tileIndex(30, 30)]).toBe(1);
    expect(g.buildingId[tileIndex(30, 31)]).toBe(1);
    expect(g.buildingId[tileIndex(31, 30)]).toBe(0);
  });

  it('keeps width/depth unchanged on a 180 degree rotation', () => {
    const g = makeGrid();
    const registry = new BuildingRegistry(catalog);
    registry.place(g, shop, 40, 40, 2);
    expect(g.buildingId[tileIndex(40, 40)]).toBe(1);
    expect(g.buildingId[tileIndex(41, 40)]).toBe(1);
    expect(g.buildingId[tileIndex(40, 41)]).toBe(0);
  });

  it('returns null and does not mutate the grid when the footprint runs out of bounds', () => {
    const g = makeGrid();
    const registry = new BuildingRegistry(catalog);
    const inst = registry.place(g, shop, MAP_SIZE - 1, 5, 0);
    expect(inst).toBeNull();
    expect(g.buildingId[tileIndex(MAP_SIZE - 1, 5)]).toBe(0);
    expect(registry.all()).toHaveLength(0);
  });

  it('returns null when any footprint tile is already occupied, leaving the occupant intact', () => {
    const g = makeGrid();
    const registry = new BuildingRegistry(catalog);
    const first = registry.place(g, house, 5, 5, 0);
    expect(first).not.toBeNull();
    // shop's footprint (2x1) at (4,5) would cover (4,5) and (5,5) -- (5,5) is occupied by house
    const second = registry.place(g, shop, 4, 5, 0);
    expect(second).toBeNull();
    expect(g.buildingId[tileIndex(5, 5)]).toBe(first!.id);
    expect(g.buildingId[tileIndex(4, 5)]).toBe(0);
    expect(registry.all()).toHaveLength(1);
  });

  it('allocates ids starting at 1, monotonically, and never reuses a removed id', () => {
    const g = makeGrid();
    const registry = new BuildingRegistry(catalog);
    const a = registry.place(g, house, 0, 0, 0)!;
    const b = registry.place(g, house, 1, 0, 0)!;
    expect(a.id).toBe(1);
    expect(b.id).toBe(2);
    registry.remove(g, a.id);
    const c = registry.place(g, house, 2, 0, 0)!;
    expect(c.id).toBe(3);
  });

  it('remove clears the rotated footprint and returns the removed instance; get/all reflect it', () => {
    const g = makeGrid();
    const registry = new BuildingRegistry(catalog);
    const inst = registry.place(g, shop, 50, 50, 1)!; // w=1,d=2 after rotation
    expect(g.buildingId[tileIndex(50, 50)]).toBe(inst.id);
    expect(g.buildingId[tileIndex(50, 51)]).toBe(inst.id);

    const removed = registry.remove(g, inst.id);
    expect(removed).toEqual(inst);
    expect(g.buildingId[tileIndex(50, 50)]).toBe(0);
    expect(g.buildingId[tileIndex(50, 51)]).toBe(0);
    expect(registry.get(inst.id)).toBeUndefined();
    expect(registry.all()).toHaveLength(0);
  });

  it('remove on an unknown id is a no-op that returns null', () => {
    const g = makeGrid();
    const registry = new BuildingRegistry(catalog);
    expect(registry.remove(g, 999)).toBeNull();
  });

  it('byCategory filters instances by their catalog entry category', () => {
    const g = makeGrid();
    const registry = new BuildingRegistry(catalog);
    const h = registry.place(g, house, 0, 0, 0)!;
    registry.place(g, shop, 5, 0, 0)!;
    registry.place(g, park, 10, 0, 0)!;

    const resBuildings = registry.byCategory('res');
    expect(resBuildings.map((b) => b.id)).toEqual([h.id]);
    expect(registry.byCategory('com')).toHaveLength(1);
    expect(registry.byCategory('park')).toHaveLength(1);
    expect(registry.byCategory('service')).toHaveLength(0);
  });

  it('totals sums residents/jobs only across Active instances', () => {
    const g = makeGrid();
    const registry = new BuildingRegistry(catalog);
    registry.place(g, house, 0, 0, 0, BuildingState.Active); // +4 residents
    registry.place(g, house, 1, 0, 0, BuildingState.Constructing); // not counted
    registry.place(g, house, 2, 0, 0, BuildingState.Abandoned); // not counted
    registry.place(g, shop, 10, 10, 0, BuildingState.Active); // +10 jobs
    registry.place(g, park, 20, 20, 0, BuildingState.Active); // no residents/jobs fields

    expect(registry.totals()).toEqual({ residents: 4, jobs: 10 });
  });

  it('serialize/deserialize round-trips instances and nextId', () => {
    const g = makeGrid();
    const registry = new BuildingRegistry(catalog);
    registry.place(g, house, 0, 0, 0);
    registry.place(g, shop, 10, 10, 1);
    const removedInst = registry.place(g, park, 20, 20, 0)!;
    registry.remove(g, removedInst.id);

    const data = registry.serialize();
    const restored = BuildingRegistry.deserialize(catalog, data);

    expect(restored.all()).toEqual(registry.all());
    expect(restored.totals()).toEqual(registry.totals());

    // nextId must continue monotonically from where it left off (3 buildings
    // were ever placed, so the next one must be id 4, even though one was
    // removed and only two remain).
    const g2 = makeGrid();
    const next = restored.place(g2, house, 30, 30, 0)!;
    expect(next.id).toBe(4);
  });

  it('places a ploppable with no explicit state as Active by default', () => {
    const g = makeGrid();
    const registry = new BuildingRegistry(catalog);
    const inst = registry.place(g, park, 0, 0, 0);
    expect(inst!.state).toBe(BuildingState.Active);
  });
});

describe('restampShrunkPloppables', () => {
  const oldPark: BuildingCatalogEntry = { ...park, footprint: { w: 2, d: 2 } };
  const oldShop: BuildingCatalogEntry = { ...shop, footprint: { w: 3, d: 2 } };

  /** A registry as an older build saved it, loaded under the current catalog. */
  function loadedFromOlderBuild(g: GridState, rotation: 0 | 1 | 2 | 3 = 0): BuildingRegistry {
    const older = new BuildingRegistry([oldPark, oldShop, house]);
    older.place(g, oldPark, 10, 10, rotation);
    older.place(g, oldShop, 20, 20, 0);
    older.place(g, house, 30, 30, 0);
    return BuildingRegistry.deserialize(catalog, older.serialize());
  }

  const noRoad = (): boolean => false;
  /** Fronts a road when any tile of the lot has one of `roads` orthogonally beside it. */
  const frontsRoadAt =
    (roads: readonly (readonly [number, number])[]) =>
    (tiles: readonly number[]): boolean =>
      tiles.some((t) => {
        const x = t % MAP_SIZE;
        const z = Math.floor(t / MAP_SIZE);
        return roads.some(([rx, rz]) => Math.abs(rx - x) + Math.abs(rz - z) === 1);
      });

  it('cuts a shrunk ploppable back to its catalog footprint at its origin and frees the rest', () => {
    const g = makeGrid();
    const registry = loadedFromOlderBuild(g);
    const id = g.buildingId[tileIndex(10, 10)]!;

    registry.restampShrunkPloppables(g, noRoad);

    expect(g.buildingId[tileIndex(10, 10)]).toBe(id);
    for (const [x, z] of [
      [11, 10],
      [10, 11],
      [11, 11],
    ] as const) {
      expect(g.buildingId[tileIndex(x, z)]).toBe(0);
    }
    expect(registry.serialize().buildings.find((b) => b.id === id)).toMatchObject({ w: 1, d: 1 });
  });

  it('frees the tiles a ploppable turned a quarter no longer covers', () => {
    const g = makeGrid();
    const registry = loadedFromOlderBuild(g, 1);
    registry.restampShrunkPloppables(g, noRoad);
    expect(g.buildingId[tileIndex(10, 10)]).not.toBe(0);
    expect(g.buildingId[tileIndex(11, 11)]).toBe(0);
  });

  it('leaves a zoned building on the footprint it was saved with', () => {
    const g = makeGrid();
    const registry = loadedFromOlderBuild(g);
    const before = registry.serialize().buildings.find((b) => b.catalogId === 'shop')!;
    registry.restampShrunkPloppables(g, () => true);
    expect(registry.serialize().buildings.find((b) => b.catalogId === 'shop')).toEqual(before);
    expect(before).toMatchObject({ w: 3, d: 2 });
    expect(g.buildingId[tileIndex(22, 21)]).toBe(before.id);
  });

  it('leaves a ploppable that already matches its catalog footprint alone', () => {
    const g = makeGrid();
    const registry = new BuildingRegistry(catalog);
    registry.place(g, park, 5, 5, 0);
    const stamped = g.buildingId.slice();
    const before = registry.serialize();
    registry.restampShrunkPloppables(g, () => true);
    expect(registry.serialize()).toEqual(before);
    expect(g.buildingId).toEqual(stamped);
  });

  it('does not take a tile another building has since stamped', () => {
    const g = makeGrid();
    const registry = loadedFromOlderBuild(g);
    g.buildingId[tileIndex(11, 10)] = 999;
    registry.restampShrunkPloppables(g, noRoad);
    expect(g.buildingId[tileIndex(11, 10)]).toBe(999);
  });

  it('keeps the tile on the street when the street runs along the far (z+1) edge', () => {
    const g = makeGrid();
    const registry = loadedFromOlderBuild(g);
    const id = g.buildingId[tileIndex(10, 10)]!;
    registry.restampShrunkPloppables(g, frontsRoadAt([[10, 12]]));
    expect(registry.get(id)).toMatchObject({ x: 10, z: 11 });
    expect(g.buildingId[tileIndex(10, 11)]).toBe(id);
    expect(g.buildingId[tileIndex(10, 10)]).toBe(0);
    expect(g.buildingId[tileIndex(11, 10)]).toBe(0);
    expect(g.buildingId[tileIndex(11, 11)]).toBe(0);
  });

  it('keeps the tile on the street when the street runs along the far (x+1) edge', () => {
    const g = makeGrid();
    const registry = loadedFromOlderBuild(g);
    const id = g.buildingId[tileIndex(10, 10)]!;
    registry.restampShrunkPloppables(g, frontsRoadAt([[12, 10]]));
    expect(registry.get(id)).toMatchObject({ x: 11, z: 10 });
    expect(g.buildingId[tileIndex(11, 10)]).toBe(id);
    expect(g.buildingId[tileIndex(10, 10)]).toBe(0);
  });

  it('takes the first fronting tile by z then x when two fit', () => {
    const g = makeGrid();
    const registry = loadedFromOlderBuild(g);
    const id = g.buildingId[tileIndex(10, 10)]!;
    registry.restampShrunkPloppables(
      g,
      frontsRoadAt([
        [12, 10],
        [10, 12],
      ]),
    );
    expect(registry.get(id)).toMatchObject({ x: 11, z: 10 });
  });

  it('leaves the building at its origin when no road is near', () => {
    const g = makeGrid();
    const registry = loadedFromOlderBuild(g);
    const id = g.buildingId[tileIndex(10, 10)]!;
    registry.restampShrunkPloppables(g, frontsRoadAt([[50, 50]]));
    expect(registry.get(id)).toMatchObject({ x: 10, z: 10 });
  });
});

describe('settleBuildingDelta', () => {
  function standingIn(registry: BuildingRegistry) {
    return (id: number) => registry.get(id);
  }

  it('sends a building updated and then removed in one window as removed only', () => {
    const g = makeGrid();
    const registry = new BuildingRegistry(catalog);
    const home = registry.place(g, house, 5, 5, 0, BuildingState.Constructing)!;
    home.state = BuildingState.Active;
    const updated = [home];
    registry.remove(g, home.id);

    const delta = settleBuildingDelta([], updated, [home.id], standingIn(registry));
    expect(delta).toEqual({ added: [], updated: [], removed: [home.id] });
  });

  it('drops a building added and removed again before the snapshot from the added list', () => {
    const g = makeGrid();
    const registry = new BuildingRegistry(catalog);
    const home = registry.place(g, house, 5, 5, 0)!;
    registry.remove(g, home.id);

    const delta = settleBuildingDelta([home], [], [home.id], standingIn(registry));
    expect(delta.added).toEqual([]);
    expect(delta.updated).toEqual([]);
  });

  it('sends a building added and then updated once, in added, as it stands now', () => {
    const g = makeGrid();
    const registry = new BuildingRegistry(catalog);
    const home = registry.place(g, house, 5, 5, 0, BuildingState.Constructing)!;
    const added = [{ ...home }];
    home.state = BuildingState.Active;

    const delta = settleBuildingDelta(added, [home, home], [], standingIn(registry));
    expect(delta.updated).toEqual([]);
    expect(delta.added).toEqual([{ ...home, state: BuildingState.Active }]);
  });

  it('sends an id removed and standing again (a load) as an update, never also as a removal', () => {
    const g = makeGrid();
    const before = new BuildingRegistry(catalog);
    const old = before.place(g, shop, 10, 10, 0)!;
    const after = new BuildingRegistry(catalog);
    const loaded = after.place(makeGrid(), house, 40, 40, 0)!;
    expect(loaded.id).toBe(old.id);

    const delta = settleBuildingDelta(after.all(), [], [old.id], standingIn(after));
    expect(delta).toEqual({ added: [], updated: [{ ...loaded }], removed: [] });
  });

  it('keeps unrelated additions, updates and removals where they were', () => {
    const g = makeGrid();
    const registry = new BuildingRegistry(catalog);
    const a = registry.place(g, house, 1, 1, 0)!;
    const b = registry.place(g, house, 3, 3, 0)!;
    const c = registry.place(g, house, 5, 5, 0)!;
    registry.remove(g, c.id);

    const delta = settleBuildingDelta([a], [b], [c.id], standingIn(registry));
    expect(delta).toEqual({ added: [{ ...a }], updated: [{ ...b }], removed: [c.id] });
  });

  it('never hands out the registry’s own objects', () => {
    const g = makeGrid();
    const registry = new BuildingRegistry(catalog);
    const a = registry.place(g, house, 1, 1, 0)!;
    const delta = settleBuildingDelta([a], [], [], standingIn(registry));
    expect(delta.added[0]).not.toBe(a);
  });
});
