import { describe, expect, it } from 'vitest';
import type { BuildingCatalogEntry, BuildingInstance, GridState } from '../shared/types';
import { BuildingState, FIELD_COUNT, RoadTier } from '../shared/types';
import { MAP_SIZE, tileIndex } from '../shared/constants';
import { recomputeUtilities } from './network';

function makeGrid(): GridState {
  const n = MAP_SIZE * MAP_SIZE;
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
    fields: Array.from({ length: FIELD_COUNT }, () => new Uint8Array(n)),
    district: new Uint8Array(n),
    landfill: new Uint8Array(n),
  };
}

/** Paints a straight horizontal two-lane road strip from x0..x1 inclusive at row z. */
function paintRoadRow(g: GridState, x0: number, x1: number, z: number): void {
  for (let x = x0; x <= x1; x++) {
    g.roadTier[tileIndex(x, z)] = RoadTier.TwoLane;
  }
}

/** Paints a single road tile at the given tier (default two-lane). */
function paintRoad(g: GridState, x: number, z: number, tier: RoadTier = RoadTier.TwoLane): void {
  g.roadTier[tileIndex(x, z)] = tier;
}

function placeBuilding(
  g: GridState,
  buildings: BuildingInstance[],
  id: number,
  catalogId: string,
  x: number,
  z: number,
  w: number,
  d: number,
  state: BuildingInstance['state'] = BuildingState.Active,
): BuildingInstance {
  for (let dz = 0; dz < d; dz++) {
    for (let dx = 0; dx < w; dx++) {
      g.buildingId[tileIndex(x + dx, z + dz)] = id;
    }
  }
  const instance: BuildingInstance = {
    id,
    catalogId,
    x,
    z,
    rotation: 0,
    level: 1,
    state,
    problems: 0,
  };
  buildings.push(instance);
  return instance;
}

const powerPlant: BuildingCatalogEntry = {
  id: 'power-plant',
  name: 'Power Plant',
  category: 'utility',
  footprint: { w: 1, d: 1 },
  height: 20,
  color: 0,
  powerUse: 0,
  waterUse: 0,
  utility: { powerMW: 10 },
  cost: 1000,
  upkeep: 100,
  unlockMilestone: 0,
};

const waterTower: BuildingCatalogEntry = {
  id: 'water-tower',
  name: 'Water Tower',
  category: 'utility',
  footprint: { w: 1, d: 1 },
  height: 10,
  color: 0,
  powerUse: 0.2,
  waterUse: 0,
  utility: { waterKL: 10 },
  cost: 500,
  upkeep: 50,
  unlockMilestone: 0,
};

const house: BuildingCatalogEntry = {
  id: 'house',
  name: 'House',
  category: 'res',
  zone: 1,
  level: 1,
  footprint: { w: 1, d: 1 },
  height: 5,
  color: 0,
  residents: 4,
  powerUse: 3,
  waterUse: 2,
  cost: 0,
  upkeep: 0,
  unlockMilestone: 0,
};

const catalog = [powerPlant, waterTower, house];

describe('recomputeUtilities: power propagation', () => {
  it('powers a connected strip via roads but not a disconnected island', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];

    // Generator at (5,5), road immediately east at x=6, running to x=20.
    placeBuilding(g, buildings, 1, 'power-plant', 5, 5, 1, 1);
    paintRoadRow(g, 6, 20, 5);

    // A connected consumer south of the road strip, well inside the network.
    placeBuilding(g, buildings, 2, 'house', 12, 6, 1, 1);

    // A disconnected island far away: separate road + building, no path back to the plant.
    paintRoadRow(g, 60, 65, 5);
    placeBuilding(g, buildings, 3, 'house', 62, 6, 1, 1);

    const totals = recomputeUtilities(g, buildings, catalog);

    expect(totals.powerSupply).toBe(10);
    expect(totals.powerDemand).toBe(3 + 3); // the two houses only; no water-tower in this scenario
    expect(g.power[tileIndex(12, 6)]).toBe(1); // connected consumer powered
    expect(g.power[tileIndex(62, 6)]).toBe(0); // disconnected island unpowered
    expect(g.power[tileIndex(5, 5)]).toBe(1); // generator's own footprint always powered
  });

  // A building/zone tile is powered/watered only when within 1 orthogonal
  // step of a supplied road.
  it('radiates power only within 1 orthogonal step of a powered road tile', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    placeBuilding(g, buildings, 1, 'power-plant', 0, 0, 1, 1);
    paintRoadRow(g, 1, 1, 0); // single road tile east of the plant at (1,0)

    recomputeUtilities(g, buildings, catalog);

    // (1,0) is a powered road tile. (1,1) is 1 orthogonal step away -> powered.
    expect(g.power[tileIndex(1, 1)]).toBe(1);
    // (1,2) is 2 steps away -> not powered under the new radius-1 rule.
    expect(g.power[tileIndex(1, 2)]).toBe(0);
  });

  it('powers a building adjacent to a supplied road but not one two tiles away', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    placeBuilding(g, buildings, 1, 'power-plant', 5, 5, 1, 1);
    paintRoadRow(g, 6, 20, 5);

    // One tile off the road (south neighbor of x=12,z=5) -> powered.
    placeBuilding(g, buildings, 2, 'house', 12, 6, 1, 1);
    // Two tiles off the road (south of x=12, one more row down) -> not powered.
    placeBuilding(g, buildings, 3, 'house', 12, 7, 1, 1);

    recomputeUtilities(g, buildings, catalog);
    expect(g.power[tileIndex(12, 6)]).toBe(1);
    expect(g.power[tileIndex(12, 7)]).toBe(0);
  });

  it('energizes every tile of a connected road run from a single adjacent source', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    placeBuilding(g, buildings, 1, 'power-plant', 5, 5, 1, 1);
    paintRoadRow(g, 6, 20, 5);

    recomputeUtilities(g, buildings, catalog);
    // Every road tile along the connected run is energized, not just tiles
    // near the source.
    for (let x = 6; x <= 20; x++) {
      expect(g.power[tileIndex(x, 5)]).toBe(1);
    }
  });

  it('a disconnected road island stays cold even though it has road tiles', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    placeBuilding(g, buildings, 1, 'power-plant', 5, 5, 1, 1);
    paintRoadRow(g, 6, 20, 5);
    // Separate island, no path back to the source.
    paintRoadRow(g, 60, 65, 5);

    recomputeUtilities(g, buildings, catalog);
    for (let x = 60; x <= 65; x++) {
      expect(g.power[tileIndex(x, 5)]).toBe(0);
    }
  });

  it('a highway tile conducts power but blocks water propagation through it', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];

    // Water tower feeding a two-lane run: x=6..12 two-lane, x=13 highway, x=14..20 two-lane.
    placeBuilding(g, buildings, 1, 'water-tower', 5, 5, 1, 1);
    paintRoadRow(g, 6, 20, 5);
    paintRoad(g, 13, 5, RoadTier.Highway);

    recomputeUtilities(g, buildings, catalog);

    // Water reaches the run up to (but not through) the highway tile.
    expect(g.watered[tileIndex(12, 5)]).toBe(1);
    expect(g.watered[tileIndex(13, 5)]).toBe(0); // the highway tile itself has no pipe
    expect(g.watered[tileIndex(14, 5)]).toBe(0); // blocked beyond the highway too

    // Power, by contrast, conducts across the highway tile and reaches the far side.
    const g2 = makeGrid();
    const buildings2: BuildingInstance[] = [];
    placeBuilding(g2, buildings2, 1, 'power-plant', 5, 5, 1, 1);
    paintRoadRow(g2, 6, 20, 5);
    paintRoad(g2, 13, 5, RoadTier.Highway);

    recomputeUtilities(g2, buildings2, catalog);
    expect(g2.power[tileIndex(13, 5)]).toBe(1); // highway tile itself is powered
    expect(g2.power[tileIndex(20, 5)]).toBe(1); // and power reaches the far side
  });

  it('does not power tiles when there is no generator at all', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    paintRoadRow(g, 0, 10, 0);
    placeBuilding(g, buildings, 2, 'house', 5, 1, 1, 1);

    const totals = recomputeUtilities(g, buildings, catalog);
    expect(totals.powerSupply).toBe(0);
    expect(g.power[tileIndex(5, 1)]).toBe(0);
  });

  it('only counts Active-or-Constructing utility instances toward supply', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    placeBuilding(g, buildings, 1, 'power-plant', 5, 5, 1, 1, BuildingState.Abandoned);

    const totals = recomputeUtilities(g, buildings, catalog);
    expect(totals.powerSupply).toBe(0);

    const g2 = makeGrid();
    const buildings2: BuildingInstance[] = [];
    placeBuilding(g2, buildings2, 1, 'power-plant', 5, 5, 1, 1, BuildingState.Constructing);
    const totals2 = recomputeUtilities(g2, buildings2, catalog);
    expect(totals2.powerSupply).toBe(10);
  });
});

describe('recomputeUtilities: brownout', () => {
  it('cuts exactly the over-budget consumers, sorted by ascending id, deterministically', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];

    // Generator supplies only 5 MW.
    const smallPlant: BuildingCatalogEntry = {
      ...powerPlant,
      id: 'small-plant',
      utility: { powerMW: 5 },
    };
    const localCatalog = [...catalog, smallPlant];

    placeBuilding(g, buildings, 1, 'small-plant', 5, 5, 1, 1);
    paintRoadRow(g, 6, 20, 5);

    // Two consumers both within coverage. house.powerUse = 3 each. id 10 first (3<=5 ok),
    // id 20 pushes cumulative to 6 > 5 -> cut.
    placeBuilding(g, buildings, 10, 'house', 10, 6, 1, 1);
    placeBuilding(g, buildings, 20, 'house', 11, 6, 1, 1);

    const totals = recomputeUtilities(g, buildings, localCatalog);
    expect(totals.powerSupply).toBe(5);
    expect(totals.powerDemand).toBeCloseTo(6);
    expect(g.power[tileIndex(10, 6)]).toBe(1); // within budget
    expect(g.power[tileIndex(11, 6)]).toBe(0); // beyond budget, cut
  });

  it('brownout ordering is independent of the input array order (sorted by id)', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    const smallPlant: BuildingCatalogEntry = {
      ...powerPlant,
      id: 'small-plant',
      utility: { powerMW: 5 },
    };
    const localCatalog = [...catalog, smallPlant];

    placeBuilding(g, buildings, 1, 'small-plant', 5, 5, 1, 1);
    paintRoadRow(g, 6, 20, 5);
    // Push id 20 into the buildings array BEFORE id 10, to prove sort-by-id happens internally.
    placeBuilding(g, buildings, 20, 'house', 11, 6, 1, 1);
    placeBuilding(g, buildings, 10, 'house', 10, 6, 1, 1);

    recomputeUtilities(g, buildings, localCatalog);
    expect(g.power[tileIndex(10, 6)]).toBe(1);
    expect(g.power[tileIndex(11, 6)]).toBe(0);
  });

  it('clears only the cut building footprint, leaving coverage for others intact', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    const smallPlant: BuildingCatalogEntry = {
      ...powerPlant,
      id: 'small-plant',
      utility: { powerMW: 3 },
    };
    const localCatalog = [...catalog, smallPlant];

    placeBuilding(g, buildings, 1, 'small-plant', 5, 5, 1, 1);
    paintRoadRow(g, 6, 20, 5);
    placeBuilding(g, buildings, 10, 'house', 10, 6, 1, 1); // powerUse 3, exactly at budget
    placeBuilding(g, buildings, 20, 'house', 11, 6, 1, 1); // cut

    recomputeUtilities(g, buildings, localCatalog);
    // Coverage still nominally reaches the road network near building 20's tile (e.g., the road tile itself).
    expect(g.power[tileIndex(11, 5)]).toBe(1); // road tile still powered (coverage stays)
    expect(g.power[tileIndex(11, 6)]).toBe(0); // building 20's own footprint cleared
  });
});

describe('recomputeUtilities: water', () => {
  it('is independent of power (separate supply/coverage)', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    placeBuilding(g, buildings, 1, 'power-plant', 5, 5, 1, 1);
    paintRoadRow(g, 6, 20, 5);
    placeBuilding(g, buildings, 2, 'house', 12, 6, 1, 1);

    const totals = recomputeUtilities(g, buildings, catalog);
    expect(totals.waterSupply).toBe(0);
    expect(totals.waterDemand).toBeCloseTo(2);
    expect(g.watered[tileIndex(12, 6)]).toBe(0); // no water producer anywhere
    expect(g.power[tileIndex(12, 6)]).toBe(1); // power still works
  });

  it('propagates from a water tower the same way power does', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    placeBuilding(g, buildings, 1, 'water-tower', 5, 5, 1, 1);
    paintRoadRow(g, 6, 20, 5);
    placeBuilding(g, buildings, 2, 'house', 12, 6, 1, 1);

    const totals = recomputeUtilities(g, buildings, catalog);
    expect(totals.waterSupply).toBe(10);
    expect(g.watered[tileIndex(12, 6)]).toBe(1);
    expect(g.power[tileIndex(12, 6)]).toBe(0); // no power producer in this scenario
  });
});
