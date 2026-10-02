import { describe, expect, it } from 'vitest';
import type { BuildingCatalogEntry, BuildingInstance, GridState, TilePoint } from '../shared/types';
import { BuildingState, RoadTier } from '../shared/types';
import {
  SEWAGE_RETURN_FRACTION,
  WATER_FOUL_PER_KL,
  WATER_FOUL_REACH_TILES,
  tileIndex,
} from '../shared/constants';
import {
  cityWaterUse,
  foulingAt,
  foulingOf,
  intakeYieldOf,
  recomputeUtilities,
  sewageOf,
  spreadFouling,
  utilityCanDeliver,
  waterBeside,
} from './network';
import { createGrid } from '../world/grid';
import { tileCentreCm } from '../shared/roadgeom';
import { applyRoad, settleArms } from '../world/roads';
import { networkFromGrid, reconcileRoads } from '../world/roadnet';
import { laySegment, planSegment } from '../world/freeroads';

function makeGrid(): GridState {
  return createGrid();
}

/** Paints a straight horizontal two-lane road strip from x0..x1 inclusive at row z. */
function paintRoadRow(g: GridState, x0: number, x1: number, z: number): void {
  for (let x = x0; x <= x1; x++) {
    g.roadTier[tileIndex(x, z)] = RoadTier.TwoLane;
  }
}

/** A straight run of tiles along row z from x0..x1 inclusive. */
const roadRow = (x0: number, x1: number, z: number): TilePoint[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, z }));

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

describe('recomputeUtilities: only a sealed road carries a cable', () => {
  it('leaves a lot on a gravel lane unpowered, and a line is the remedy', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    placeBuilding(g, buildings, 1, 'power-plant', 5, 5, 1, 1);
    for (let x = 6; x <= 14; x++) paintRoad(g, x, 5, RoadTier.Gravel);
    placeBuilding(g, buildings, 2, 'house', 12, 6, 1, 1);

    recomputeUtilities(g, buildings, catalog);
    expect(g.power[tileIndex(12, 6)]).toBe(0);

    // The line runs beside the lane and reaches what the lane could not.
    for (let x = 6; x <= 13; x++) g.powerLine[tileIndex(x, 5)] = 1;
    recomputeUtilities(g, buildings, catalog);
    expect(g.power[tileIndex(12, 6)]).toBe(1);
  });

  it('will not conduct THROUGH a gravel stretch to the paved road beyond it', () => {
    // Sealed, then a gravel gap, then sealed again. The far end is not merely
    // unpowered by its own surface — nothing crosses the gap to reach it.
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    placeBuilding(g, buildings, 1, 'power-plant', 5, 5, 1, 1);
    for (let x = 6; x <= 9; x++) paintRoad(g, x, 5, RoadTier.TwoLane);
    for (let x = 10; x <= 12; x++) paintRoad(g, x, 5, RoadTier.Gravel);
    for (let x = 13; x <= 18; x++) paintRoad(g, x, 5, RoadTier.TwoLane);

    recomputeUtilities(g, buildings, catalog);
    expect(g.power[tileIndex(8, 5)]).toBe(1); // this side of the gap
    expect(g.power[tileIndex(11, 5)]).toBe(0); // the gravel itself
    expect(g.power[tileIndex(16, 5)]).toBe(0); // and everything past it
  });

  it('carries no water down a gravel lane, nor through one: a dirt road has no main', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    placeBuilding(g, buildings, 1, 'water-tower', 5, 5, 1, 1);
    for (let x = 6; x <= 9; x++) paintRoad(g, x, 5, RoadTier.TwoLane);
    for (let x = 10; x <= 12; x++) paintRoad(g, x, 5, RoadTier.Gravel);
    for (let x = 13; x <= 18; x++) paintRoad(g, x, 5, RoadTier.TwoLane);

    recomputeUtilities(g, buildings, catalog);
    expect(g.watered[tileIndex(8, 5)]).toBe(1); // this side of the gap
    expect(g.watered[tileIndex(11, 6)]).toBe(0); // beside the gravel
    expect(g.watered[tileIndex(16, 5)]).toBe(0); // and everything past it
  });

  it('a motorway still conducts — it lights itself', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    placeBuilding(g, buildings, 1, 'power-plant', 5, 5, 1, 1);
    for (let x = 6; x <= 14; x++) paintRoad(g, x, 5, RoadTier.Highway);

    recomputeUtilities(g, buildings, catalog);
    expect(g.power[tileIndex(12, 5)]).toBe(1);
  });
});

describe('recomputeUtilities: a house on a well', () => {
  /**
   * A house at (5, 6) beside a tower at (5, 5), whose water radiates onto it,
   * and a dirt road along z = 8 serving it.
   */
  function houseBesideATower(catalogId = 'house'): { g: GridState; buildings: BuildingInstance[] } {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    placeBuilding(g, buildings, 1, 'water-tower', 5, 5, 1, 1);
    placeBuilding(g, buildings, 2, catalogId, 5, 6, 1, 1);
    for (let x = 3; x <= 8; x++) paintRoad(g, x, 8, RoadTier.Gravel);
    return { g, buildings };
  }
  const flats: BuildingCatalogEntry = { ...house, id: 'flats', zone: 7 };
  const withFlats = [...catalog, flats];

  it('leaves a house a dirt road serves out of the water line, even where the water reaches it', () => {
    const { g, buildings } = houseBesideATower();
    const totals = recomputeUtilities(g, buildings, withFlats);
    expect(g.watered[tileIndex(5, 6)]).toBe(1);
    expect(totals.waterDemand).toBe(0);
    expect(totals.water.spare).toBe(10_000_000);
  });

  it('puts the house in the line once a main runs beside its lot', () => {
    const { g, buildings } = houseBesideATower();
    paintRoad(g, 6, 6, RoadTier.TwoLane);
    expect(recomputeUtilities(g, buildings, withFlats).waterDemand).toBe(2);
  });

  it('keeps anything denser than a house in the line down a dirt road', () => {
    const { g, buildings } = houseBesideATower('flats');
    expect(recomputeUtilities(g, buildings, withFlats).waterDemand).toBe(2);
  });
});

describe('recomputeUtilities: power lines', () => {
  /** Strings a straight run of power line from x0..x1 inclusive at row z. */
  function stringLine(g: GridState, x0: number, x1: number, z: number): void {
    for (let x = x0; x <= x1; x++) g.powerLine[tileIndex(x, z)] = 1;
  }

  it('carries supply to an island no road reaches', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    placeBuilding(g, buildings, 1, 'power-plant', 5, 5, 1, 1);
    paintRoadRow(g, 6, 10, 5);
    // An island with its own road and no way back to the plant along one.
    paintRoadRow(g, 30, 34, 5);
    placeBuilding(g, buildings, 2, 'house', 32, 6, 1, 1);

    recomputeUtilities(g, buildings, catalog);
    expect(g.power[tileIndex(32, 6)]).toBe(0);

    // A line bridging the gap, touching the road at each end.
    stringLine(g, 10, 30, 5);
    recomputeUtilities(g, buildings, catalog);
    expect(g.power[tileIndex(32, 6)]).toBe(1);
  });

  it('reaches a lot straight off the plant, with no road involved at all', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    placeBuilding(g, buildings, 1, 'power-plant', 5, 5, 1, 1);
    stringLine(g, 6, 20, 5);
    placeBuilding(g, buildings, 2, 'house', 15, 6, 1, 1);

    recomputeUtilities(g, buildings, catalog);
    // Supplied by the line alone: the house sits one step off it, which is the
    // same radiating rule a supplied road tile follows.
    expect(g.power[tileIndex(15, 6)]).toBe(1);
  });

  it('breaks where the line does — it conducts along itself, not across a gap', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    placeBuilding(g, buildings, 1, 'power-plant', 5, 5, 1, 1);
    stringLine(g, 6, 12, 5);
    stringLine(g, 14, 20, 5); // a one-tile break at x=13
    placeBuilding(g, buildings, 2, 'house', 18, 6, 1, 1);

    recomputeUtilities(g, buildings, catalog);
    expect(g.power[tileIndex(18, 6)]).toBe(0);

    g.powerLine[tileIndex(13, 5)] = 1;
    recomputeUtilities(g, buildings, catalog);
    expect(g.power[tileIndex(18, 6)]).toBe(1);
  });

  it('carries no water — it is a power line, not a pipe', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    placeBuilding(g, buildings, 1, 'water-tower', 5, 5, 1, 1);
    stringLine(g, 6, 20, 5);
    placeBuilding(g, buildings, 2, 'house', 15, 6, 1, 1);

    recomputeUtilities(g, buildings, catalog);
    expect(g.watered[tileIndex(15, 6)]).toBe(0);
  });
});

describe('recomputeUtilities: water pipes', () => {
  /** Lays a straight run of pipe from x0..x1 inclusive at row z. */
  function layPipe(g: GridState, x0: number, x1: number, z: number): void {
    for (let x = x0; x <= x1; x++) g.waterPipe[tileIndex(x, z)] = 1;
  }

  it('carries water to an island no road reaches, as a line carries power', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    placeBuilding(g, buildings, 1, 'water-tower', 5, 5, 1, 1);
    paintRoadRow(g, 6, 10, 5);
    paintRoadRow(g, 30, 34, 5);
    placeBuilding(g, buildings, 2, 'house', 32, 6, 1, 1);

    recomputeUtilities(g, buildings, catalog);
    expect(g.watered[tileIndex(32, 6)]).toBe(0);

    layPipe(g, 10, 30, 5);
    recomputeUtilities(g, buildings, catalog);
    expect(g.watered[tileIndex(32, 6)]).toBe(1);
  });

  it('reaches a lot straight off the tower, with no road at all, and breaks where the pipe does', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    placeBuilding(g, buildings, 1, 'water-tower', 5, 5, 1, 1);
    layPipe(g, 6, 12, 5);
    layPipe(g, 14, 20, 5);
    placeBuilding(g, buildings, 2, 'house', 18, 6, 1, 1);

    recomputeUtilities(g, buildings, catalog);
    expect(g.watered[tileIndex(18, 6)]).toBe(0);
    g.waterPipe[tileIndex(13, 5)] = 1;
    recomputeUtilities(g, buildings, catalog);
    expect(g.watered[tileIndex(18, 6)]).toBe(1);
  });

  it('carries no power — it is a pipe, not a line', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    placeBuilding(g, buildings, 1, 'power-plant', 5, 5, 1, 1);
    layPipe(g, 6, 20, 5);
    placeBuilding(g, buildings, 2, 'house', 15, 6, 1, 1);

    recomputeUtilities(g, buildings, catalog);
    expect(g.power[tileIndex(15, 6)]).toBe(0);
  });

  it('is a main: a house beside a pipe is on the mains, not on a well', () => {
    const g = makeGrid();
    // A dirt road within reach, and only a pipe beside the lot.
    paintRoad(g, 1, 1, RoadTier.Gravel);
    g.waterPipe[tileIndex(2, 3)] = 1;
    expect(cityWaterUse(g, house, 2, 2, 1, 1)).toBe(house.waterUse);
    g.waterPipe[tileIndex(2, 3)] = 0;
    expect(cityWaterUse(g, house, 2, 2, 1, 1)).toBe(0);
  });

  it('is a way out for a water tower, so one on a pipe alone is not stranded', () => {
    const g = makeGrid();
    expect(utilityCanDeliver(g, waterTower.utility!, [tileIndex(5, 5)])).toBe(false);
    g.waterPipe[tileIndex(6, 5)] = 1;
    expect(utilityCanDeliver(g, waterTower.utility!, [tileIndex(5, 5)])).toBe(true);
  });
});

describe('recomputeUtilities: the sewer', () => {
  const drain: BuildingCatalogEntry = {
    id: 'drain',
    name: 'Drain',
    category: 'utility',
    footprint: { w: 1, d: 1 },
    height: 4,
    color: 0,
    powerUse: 0,
    waterUse: 0,
    utility: { sewerKL: 4 },
    cost: 0,
    upkeep: 0,
    unlockMilestone: 0,
  };
  const sewered = [...catalog, drain];
  /** A house makes SEWAGE_RETURN_FRACTION of the 2 kL it draws. */
  const houseSewage = house.waterUse * SEWAGE_RETURN_FRACTION;

  it('a building makes sewage from the city water it draws, and none on a well or a farm', () => {
    const g = makeGrid();
    paintRoad(g, 2, 1);
    expect(sewageOf(g, house, 2, 2, 1, 1)).toBeCloseTo(houseSewage, 9);
    // The same house down a dirt road is on a well and a septic tank.
    const lane = makeGrid();
    paintRoad(lane, 1, 1, RoadTier.Gravel);
    expect(sewageOf(lane, house, 2, 2, 1, 1)).toBe(0);
    expect(sewageOf(g, { ...house, waterUse: 0 }, 2, 2, 1, 1)).toBe(0);
  });

  it('runs back along the mains and the pipes the water came down, from the drain', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    placeBuilding(g, buildings, 1, 'drain', 5, 5, 1, 1);
    paintRoadRow(g, 6, 10, 5);
    for (let x = 10; x <= 20; x++) g.waterPipe[tileIndex(x, 5)] = 1;
    paintRoad(g, 30, 5);
    placeBuilding(g, buildings, 2, 'house', 8, 6, 1, 1);
    placeBuilding(g, buildings, 3, 'house', 18, 6, 1, 1);
    placeBuilding(g, buildings, 4, 'house', 30, 6, 1, 1);

    const totals = recomputeUtilities(g, buildings, sewered);
    expect(totals.sewerSupply).toBe(4);
    expect(g.sewered[tileIndex(8, 6)]).toBe(1);
    expect(g.sewered[tileIndex(18, 6)]).toBe(1);
    expect(g.sewered[tileIndex(30, 6)]).toBe(0);
    expect(totals.sewerDemand).toBeCloseTo(2 * houseSewage, 9);
    expect(totals.sewer.cut.size).toBe(0);
  });

  it('cuts from the far end when the drains run out, exactly as the water cut does', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    // A drain taking 4 kL against houses making 1.76 each: room for two of three.
    placeBuilding(g, buildings, 1, 'drain', 5, 5, 1, 1);
    paintRoadRow(g, 6, 20, 5);
    placeBuilding(g, buildings, 10, 'house', 18, 6, 1, 1); // the oldest, at the far end
    placeBuilding(g, buildings, 20, 'house', 7, 6, 1, 1);
    placeBuilding(g, buildings, 30, 'house', 12, 6, 1, 1);

    const totals = recomputeUtilities(g, buildings, sewered);
    expect(totals.sewer.cut).toEqual(new Set([10]));
    expect(g.sewered[tileIndex(7, 6)]).toBe(1);
    expect(g.sewered[tileIndex(12, 6)]).toBe(1);
    expect(g.sewered[tileIndex(18, 6)]).toBe(0);
    expect(totals.sewer.spare).toBeLessThan(0);
  });

  it('counts a house on a well as nothing in the sewer line', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    placeBuilding(g, buildings, 1, 'drain', 5, 5, 1, 1);
    paintRoadRow(g, 6, 10, 5);
    // A lane off the street: the house there is reached by the drain's walk
    // but on a septic tank.
    paintRoad(g, 11, 5, RoadTier.Gravel);
    paintRoad(g, 12, 5, RoadTier.Gravel);
    placeBuilding(g, buildings, 2, 'house', 12, 6, 1, 1);
    const totals = recomputeUtilities(g, buildings, sewered);
    expect(totals.sewerDemand).toBe(0);
  });

  it('a drain with no main or pipe beside it is stranded, like a tower', () => {
    const g = makeGrid();
    expect(utilityCanDeliver(g, drain.utility!, [tileIndex(5, 5)])).toBe(false);
    paintRoad(g, 6, 5);
    expect(utilityCanDeliver(g, drain.utility!, [tileIndex(5, 5)])).toBe(true);
  });
});

describe('recomputeUtilities: the fouled water', () => {
  /** A one-million-gallon outfall, and a works of the same size keeping back 85% of the load. */
  const outfall: BuildingCatalogEntry = {
    id: 'outfall',
    name: 'Outfall',
    category: 'utility',
    footprint: { w: 1, d: 1 },
    height: 4,
    color: 0,
    powerUse: 0,
    waterUse: 0,
    utility: { sewerKL: 3785 },
    cost: 0,
    upkeep: 0,
    unlockMilestone: 0,
    requiresAdjacent: 'water',
  };
  const works: BuildingCatalogEntry = {
    ...outfall,
    id: 'works',
    name: 'Works',
    utility: { sewerKL: 3785, effluent: 0.15 },
  };
  /** A shore intake of the same class, and a tower that reads no water. */
  const intake: BuildingCatalogEntry = {
    ...outfall,
    id: 'intake',
    name: 'Intake',
    footprint: { w: 2, d: 1 },
    utility: { waterKL: 3785 },
  };
  const tower: BuildingCatalogEntry = {
    ...outfall,
    id: 'tower',
    name: 'Tower',
    utility: { waterKL: 378.5 },
    requiresAdjacent: undefined,
  };
  /** A plant drinking enough that its sewage alone fills the outfall. */
  const plant: BuildingCatalogEntry = {
    ...house,
    id: 'plant',
    name: 'Plant',
    waterUse: 4300,
  };
  const fouling = [...catalog, outfall, works, intake, tower, plant];

  /** A pond along row 3 from x0 to x1, with the bank at row 4 and a street at row 5. */
  function pond(g: GridState, x0: number, x1: number, z = 3): void {
    for (let x = x0; x <= x1; x++) g.water[tileIndex(x, z)] = 1;
  }

  it('fades in a straight line to nothing at the reach, and saturates at a full outfall', () => {
    expect(foulingOf(3785)).toBe(255);
    expect(foulingOf(3785 * 0.15)).toBe(Math.round(3785 * 0.15 * WATER_FOUL_PER_KL));
    expect(foulingOf(0)).toBe(0);
    expect(foulingAt(255, 0)).toBe(255);
    expect(foulingAt(255, 5)).toBe(204);
    expect(foulingAt(255, WATER_FOUL_REACH_TILES - 1)).toBe(10);
    expect(foulingAt(255, WATER_FOUL_REACH_TILES)).toBe(0);
  });

  it('spreads along connected water only, and two stains meeting take the worse', () => {
    const g = makeGrid();
    pond(g, 0, 40);
    pond(g, 0, 5, 10); // a second pond, over land
    spreadFouling(g, new Map([[tileIndex(5, 3), 255]]));
    expect(g.waterFoul[tileIndex(5, 3)]).toBe(255);
    expect(g.waterFoul[tileIndex(10, 3)]).toBe(204);
    expect(g.waterFoul[tileIndex(29, 3)]).toBe(10);
    expect(g.waterFoul[tileIndex(30, 3)]).toBe(0);
    expect(g.waterFoul[tileIndex(5, 4)]).toBe(0); // the bank
    expect(g.waterFoul[tileIndex(2, 10)]).toBe(0); // the other pond

    spreadFouling(
      g,
      new Map([
        [tileIndex(5, 3), 255],
        [tileIndex(9, 3), 100],
      ]),
    );
    expect(g.waterFoul[tileIndex(7, 3)]).toBe(Math.max(foulingAt(255, 2), foulingAt(100, 2)));
    expect(g.waterFoul[tileIndex(12, 3)]).toBe(Math.max(foulingAt(255, 7), foulingAt(100, 3)));
    // A pass with nothing emitting leaves the water clean.
    spreadFouling(g, new Map());
    expect(g.waterFoul[tileIndex(5, 3)]).toBe(0);
  });

  it('a drain empties its share of the sewage actually drained, a works a seventh of it, and an idle drain nothing', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    pond(g, 0, 40);
    placeBuilding(g, buildings, 1, 'outfall', 5, 4, 1, 1);
    paintRoadRow(g, 5, 20, 5);
    let totals = recomputeUtilities(g, buildings, fouling);
    expect(totals.sewerDemand).toBe(0);
    expect(g.waterFoul[tileIndex(5, 3)]).toBe(0);

    placeBuilding(g, buildings, 2, 'plant', 8, 6, 1, 1);
    totals = recomputeUtilities(g, buildings, fouling);
    const sewage = 4300 * SEWAGE_RETURN_FRACTION;
    expect(totals.sewerDemand).toBeCloseTo(sewage, 6);
    expect(g.waterFoul[tileIndex(5, 3)]).toBe(foulingOf(sewage));
    expect(g.waterFoul[tileIndex(6, 3)]).toBe(foulingAt(foulingOf(sewage), 1));

    // Two outfalls share the same sewage between them.
    placeBuilding(g, buildings, 3, 'outfall', 30, 4, 1, 1);
    paintRoadRow(g, 21, 30, 5);
    recomputeUtilities(g, buildings, fouling);
    expect(g.waterFoul[tileIndex(30, 3)]).toBe(foulingOf(sewage / 2));

    // The works in the second outfall's place empties 15% of its share.
    buildings.pop();
    g.buildingId[tileIndex(30, 4)] = 0;
    placeBuilding(g, buildings, 4, 'works', 30, 4, 1, 1);
    recomputeUtilities(g, buildings, fouling);
    expect(g.waterFoul[tileIndex(30, 3)]).toBe(foulingOf((sewage / 2) * 0.15));

    // A stranded outfall, off every main and pipe, takes no share and fouls
    // nothing itself: the water beside it carries only the works' stain,
    // eight tiles along, and the other two keep their shares.
    placeBuilding(g, buildings, 5, 'outfall', 38, 4, 1, 1);
    recomputeUtilities(g, buildings, fouling);
    const worksEmit = foulingOf((sewage / 2) * 0.15);
    expect(g.waterFoul[tileIndex(38, 3)]).toBe(foulingAt(worksEmit, 8));
    expect(g.waterFoul[tileIndex(30, 3)]).toBe(worksEmit);
    expect(g.waterFoul[tileIndex(5, 3)]).toBe(foulingOf(sewage / 2));
  });

  it('an intake yields its rating less the worst fouling beside it, a tower never, and the water is cut on the yield', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    pond(g, 0, 40);
    placeBuilding(g, buildings, 1, 'outfall', 5, 4, 1, 1);
    const pump = placeBuilding(g, buildings, 2, 'intake', 6, 4, 2, 1);
    placeBuilding(g, buildings, 3, 'tower', 12, 4, 1, 1);
    paintRoadRow(g, 8, 20, 5);
    g.waterPipe[tileIndex(6, 5)] = 1;
    g.waterPipe[tileIndex(7, 5)] = 1;
    g.waterPipe[tileIndex(5, 5)] = 1;
    const factory = placeBuilding(g, buildings, 4, 'plant', 10, 6, 1, 1);

    const totals = recomputeUtilities(g, buildings, fouling);
    expect(waterBeside(g, [tileIndex(6, 4), tileIndex(7, 4)])).toEqual([
      tileIndex(6, 3),
      tileIndex(7, 3),
    ]);
    const emit = foulingOf(4300 * SEWAGE_RETURN_FRACTION);
    expect(emit).toBe(255);
    const worst = foulingAt(emit, 1);
    const yieldFraction = 1 - worst / 255;
    expect(intakeYieldOf(g, [tileIndex(6, 4), tileIndex(7, 4)])).toBeCloseTo(yieldFraction, 9);
    expect(totals.intakeYield.get(pump.id)).toBeCloseTo(yieldFraction, 9);
    expect(totals.intakeYield.has(3)).toBe(false);
    expect(totals.waterSupply).toBeCloseTo(3785 * yieldFraction + 378.5, 6);
    expect(totals.waterFouled).toBeCloseTo(3785 * (1 - yieldFraction), 6);
    // The plant wants 4,300 kL; the fouled intake and the tower together make far less.
    expect(totals.water.cut).toEqual(new Set([factory.id]));
  });
});

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
    expect(totals.powerDemand).toBe(3); // the island's house draws nothing: the network never reaches it
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

  it('cuts the far end of the grid first, however old the buildings there are', () => {
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
    placeBuilding(g, buildings, 10, 'house', 18, 6, 1, 1); // the oldest, at the far end
    placeBuilding(g, buildings, 20, 'house', 7, 6, 1, 1); // the newest, beside the plant

    const totals = recomputeUtilities(g, buildings, localCatalog);
    expect(g.power[tileIndex(7, 6)]).toBe(1);
    expect(g.power[tileIndex(18, 6)]).toBe(0);
    expect([...totals.power.cut]).toEqual([10]);
  });

  it('keeps an abandoned building in its place in line, so abandoning never re-powers it', () => {
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
    placeBuilding(g, buildings, 10, 'house', 7, 6, 1, 1);
    const far = placeBuilding(g, buildings, 20, 'house', 18, 6, 1, 1);

    recomputeUtilities(g, buildings, localCatalog);
    expect(g.power[tileIndex(18, 6)]).toBe(0);

    far.state = BuildingState.Abandoned;
    const totals = recomputeUtilities(g, buildings, localCatalog);
    expect(g.power[tileIndex(18, 6)]).toBe(0);
    expect(totals.power.cut.has(20)).toBe(true);
    expect(totals.powerDemand).toBe(6); // the city still asks for its share

    // An abandoned building nearer the plant keeps its share just the same.
    const g2 = makeGrid();
    const buildings2: BuildingInstance[] = [];
    placeBuilding(g2, buildings2, 1, 'small-plant', 5, 5, 1, 1);
    paintRoadRow(g2, 6, 20, 5);
    placeBuilding(g2, buildings2, 10, 'house', 7, 6, 1, 1, BuildingState.Abandoned);
    placeBuilding(g2, buildings2, 20, 'house', 18, 6, 1, 1);
    recomputeUtilities(g2, buildings2, localCatalog);
    expect(g2.power[tileIndex(7, 6)]).toBe(1);
    expect(g2.power[tileIndex(18, 6)]).toBe(0);
  });

  it('counts in whole millionths, so a grid that exactly meets its load cuts nobody', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    // 0.1 + 0.1 + 0.1 is 0.30000000000000004 in floating point.
    const tenth: BuildingCatalogEntry = { ...house, id: 'tenth', powerUse: 0.1 };
    const plant: BuildingCatalogEntry = {
      ...powerPlant,
      id: 'plant-0.3',
      utility: { powerMW: 0.3 },
    };
    const localCatalog = [...catalog, tenth, plant];

    placeBuilding(g, buildings, 1, 'plant-0.3', 5, 5, 1, 1);
    paintRoadRow(g, 6, 20, 5);
    for (const [id, x] of [
      [10, 8],
      [11, 10],
      [12, 12],
    ] as const) {
      placeBuilding(g, buildings, id, 'tenth', x, 6, 1, 1);
    }

    const totals = recomputeUtilities(g, buildings, localCatalog);
    expect(totals.power.cut.size).toBe(0);
    expect(totals.power.spare).toBe(0);
    expect(totals.powerDemand).toBe(0.3);
  });

  it('reports what the grid has spare, and how far short it is, in watts', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    placeBuilding(g, buildings, 1, 'power-plant', 5, 5, 1, 1); // 10 MW
    paintRoadRow(g, 6, 20, 5);
    placeBuilding(g, buildings, 10, 'house', 7, 6, 1, 1); // 3 MW

    expect(recomputeUtilities(g, buildings, catalog).power.spare).toBe(7_000_000);

    for (const [id, x] of [
      [11, 9],
      [12, 11],
      [13, 13],
    ] as const) {
      placeBuilding(g, buildings, id, 'house', x, 6, 1, 1);
    }
    const short = recomputeUtilities(g, buildings, catalog);
    expect(short.power.spare).toBe(-2_000_000);
    expect([...short.power.cut]).toEqual([13]);
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
    expect(totals.waterDemand).toBe(0); // no mains reach the house, so it draws none
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

describe('recomputeUtilities: a road that only lies alongside', () => {
  it('carries nothing across to a deck running beside the street, since the two never join', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    paintRoadRow(g, 30, 50, 40);
    // A deck 8 m up, alongside the street for its whole length, then away north.
    for (let x = 30; x <= 50; x++) {
      paintRoad(g, x, 41);
      g.roadElevation[tileIndex(x, 41)] = 8;
    }
    for (let z = 42; z <= 70; z++) {
      paintRoad(g, 50, z);
      g.roadElevation[tileIndex(50, z)] = 8;
    }
    placeBuilding(g, buildings, 1, 'power-plant', 29, 40, 1, 1);
    placeBuilding(g, buildings, 2, 'house', 51, 70, 1, 1); // only the deck comes near it
    recomputeUtilities(g, buildings, catalog);
    expect(g.power[tileIndex(35, 40)]).toBe(1);
    expect(g.power[tileIndex(51, 70)]).toBe(0);
  });
});

describe('recomputeUtilities: a road laid as its own road', () => {
  /** A street along z = 40 from the plant, and a second beside it that turns away north to a house. */
  function besideTheStreet(join: boolean): { g: GridState; buildings: BuildingInstance[] } {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    applyRoad(g, roadRow(30, 50, 40), RoadTier.TwoLane);
    const second = [
      ...roadRow(30, 50, 41),
      ...Array.from({ length: 29 }, (_, i) => ({ x: 50, z: 42 + i })),
    ];
    const keys = second.map((t) => tileIndex(t.x, t.z));
    settleArms(g, keys, new Set(keys), join);
    applyRoad(g, second, RoadTier.TwoLane);
    placeBuilding(g, buildings, 1, 'power-plant', 29, 40, 1, 1);
    placeBuilding(g, buildings, 2, 'house', 51, 70, 1, 1);
    return { g, buildings };
  }

  it('carries nothing across to a street held apart beside the one that is powered', () => {
    const { g, buildings } = besideTheStreet(false);
    recomputeUtilities(g, buildings, catalog);
    expect(g.power[tileIndex(35, 40)]).toBe(1);
    expect(g.power[tileIndex(51, 70)]).toBe(0);
  });

  it('carries it on when the two are joined', () => {
    const { g, buildings } = besideTheStreet(true);
    recomputeUtilities(g, buildings, catalog);
    expect(g.power[tileIndex(51, 70)]).toBe(1);
  });
});

describe('recomputeUtilities: a road passing over another', () => {
  /** A street overpass along z = 40, crossing a street running down x = 40. */
  function overpass(): { g: GridState; buildings: BuildingInstance[] } {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    for (let z = 20; z <= 60; z++) paintRoad(g, 40, z);
    for (let x = 30; x <= 50; x++) if (x !== 40) paintRoad(g, x, 40);
    // Ramps up to the deck either side: roads join only at one level.
    for (const [x, lift] of [
      [37, 2],
      [38, 4],
      [39, 6],
      [41, 6],
      [42, 4],
      [43, 2],
    ] as const) {
      g.roadElevation[tileIndex(x, 40)] = lift;
    }
    const c = tileIndex(40, 40);
    g.overTier[c] = RoadTier.TwoLane;
    g.overProfile[c] = RoadTier.TwoLane;
    g.overFlow[c] = 2; // east
    g.overElevation[c] = 7;
    placeBuilding(g, buildings, 1, 'power-plant', 29, 40, 1, 1);
    placeBuilding(g, buildings, 2, 'house', 50, 41, 1, 1); // beside the overpass's far end
    placeBuilding(g, buildings, 3, 'house', 41, 58, 1, 1); // beside the street beneath
    return { g, buildings };
  }

  it('carries power along the overpass, across the crossing to its far end', () => {
    const { g, buildings } = overpass();
    recomputeUtilities(g, buildings, catalog);
    expect(g.power[tileIndex(50, 41)]).toBe(1);
  });

  it('carries nothing down into the road beneath', () => {
    const { g, buildings } = overpass();
    recomputeUtilities(g, buildings, catalog);
    expect(g.power[tileIndex(41, 58)]).toBe(0);
  });
});

describe('recomputeUtilities along a road off the grid', () => {
  it('carries power along a free road to a house by the street it reaches', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    applyRoad(
      g,
      Array.from({ length: 6 }, (_, i) => ({ x: 100 + i, z: 100 })),
      RoadTier.TwoLane,
    );
    applyRoad(
      g,
      Array.from({ length: 6 }, (_, i) => ({ x: 115 + i, z: 115 })),
      RoadTier.TwoLane,
    );
    g.roads = networkFromGrid(g);
    const req = {
      tier: RoadTier.TwoLane,
      profileId: RoadTier.TwoLane,
      a: { x: tileCentreCm(105), z: tileCentreCm(100) },
      b: { x: tileCentreCm(115), z: tileCentreCm(115) },
      control: null,
      flow: 0,
    };
    const plan = planSegment(g, g.roads, req, () => null);
    if (!plan.ok) throw new Error(plan.reason);
    laySegment(g, g.roads, plan, req);
    reconcileRoads(g.roads, g);
    placeBuilding(g, buildings, 1, 'power-plant', 99, 100, 1, 1);
    placeBuilding(g, buildings, 2, 'house', 120, 116, 1, 1);
    recomputeUtilities(g, buildings, catalog);
    expect(g.power[tileIndex(120, 116)]).toBe(1);
  });
});
