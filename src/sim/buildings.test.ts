import { describe, expect, it } from 'vitest';
import { MAP_SIZE, tileIndex } from '../shared/constants';
import { BuildingState, FIELD_COUNT, ZoneType } from '../shared/types';
import type { BuildingCatalogEntry, GridState } from '../shared/types';
import { BuildingRegistry } from './buildings';

function makeGrid(): GridState {
  const n = MAP_SIZE * MAP_SIZE;
  const fields: Uint8Array[] = [];
  for (let i = 0; i < FIELD_COUNT; i++) fields.push(new Uint8Array(n));
  return {
    size: MAP_SIZE,
    height: new Float32Array(n),
    water: new Uint8Array(n),
    trees: new Uint8Array(n),
    zone: new Uint8Array(n),
    roadTier: new Uint8Array(n),
    roadMask: new Uint8Array(n),
    buildingId: new Uint32Array(n),
    power: new Uint8Array(n),
    watered: new Uint8Array(n),
    fields,
    district: new Uint8Array(n),
  };
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
