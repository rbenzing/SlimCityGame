import { describe, expect, it } from 'vitest';
import type {
  BuildingCatalogEntry,
  BuildingInstance,
  CityStats,
  GridState,
  ServiceKind,
} from '../shared/types';
import { BuildingState, FieldId, RoadTier, ZoneType } from '../shared/types';
import { tileIndex } from '../shared/constants';
import { ServiceSim, roadBfsDistances } from './services';
import { EconomySystem } from './economy';
import { createGrid } from '../world/grid';

function makeGrid(): GridState {
  return createGrid();
}

function paintPath(g: GridState, path: ReadonlyArray<readonly [number, number]>): void {
  for (const [x, z] of path) {
    g.roadTier[tileIndex(x, z)] = RoadTier.TwoLane;
  }
}

function place(
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

const fullFunding = (v: number): Record<ServiceKind, number> => ({
  police: v,
  fire: v,
  health: v,
  education: v,
  park: v,
});

const policeStation: BuildingCatalogEntry = {
  id: 'police',
  name: 'Police Station',
  category: 'service',
  footprint: { w: 2, d: 2 },
  height: 10,
  color: 0,
  powerUse: 0,
  waterUse: 0,
  service: { kind: 'police', strength: 160, range: 10 },
  cost: 0,
  upkeep: 0,
  unlockMilestone: 0,
};

const fireStation: BuildingCatalogEntry = {
  id: 'fire',
  name: 'Fire Station',
  category: 'service',
  footprint: { w: 2, d: 2 },
  height: 10,
  color: 0,
  powerUse: 0,
  waterUse: 0,
  service: { kind: 'fire', strength: 160, range: 10 },
  cost: 0,
  upkeep: 0,
  unlockMilestone: 0,
};

const school: BuildingCatalogEntry = {
  id: 'school',
  name: 'School',
  category: 'service',
  footprint: { w: 1, d: 1 },
  height: 10,
  color: 0,
  powerUse: 0,
  waterUse: 0,
  service: { kind: 'education', strength: 100, range: 20 },
  cost: 0,
  upkeep: 0,
  unlockMilestone: 0,
};

const clinic: BuildingCatalogEntry = {
  id: 'clinic',
  name: 'Clinic',
  category: 'service',
  footprint: { w: 1, d: 1 },
  height: 10,
  color: 0,
  powerUse: 0,
  waterUse: 0,
  service: { kind: 'health', strength: 140, range: 10 },
  cost: 0,
  upkeep: 0,
  unlockMilestone: 0,
};

const parkEntry: BuildingCatalogEntry = {
  id: 'park',
  name: 'Pocket Park',
  category: 'park',
  footprint: { w: 1, d: 1 },
  height: 2,
  color: 0,
  powerUse: 0,
  waterUse: 0,
  landValueBonus: 40,
  service: { kind: 'park', strength: 80, range: 8 },
  cost: 0,
  upkeep: 0,
  unlockMilestone: 0,
};

const catalog = [policeStation, fireStation, school, clinic, parkEntry];

describe('ServiceSim: base field growth', () => {
  it('grows crime +2 on zoned tiles with landValue < 90, and fireRisk +1 on built tiles', () => {
    const g = makeGrid();
    const sim = new ServiceSim(catalog);

    g.zone[tileIndex(3, 3)] = ZoneType.ResLow;
    g.fields[FieldId.LandValue]![tileIndex(3, 3)] = 50; // below 90 -> crime grows

    g.zone[tileIndex(4, 4)] = ZoneType.ResLow;
    g.fields[FieldId.LandValue]![tileIndex(4, 4)] = 200; // >= 90 -> crime does NOT grow

    g.buildingId[tileIndex(5, 5)] = 42; // any non-zero building id -> fireRisk grows

    sim.tick(g, [], fullFunding(1));

    expect(g.fields[FieldId.Crime]![tileIndex(3, 3)]).toBe(2);
    expect(g.fields[FieldId.Crime]![tileIndex(4, 4)]).toBe(0);
    expect(g.fields[FieldId.FireRisk]![tileIndex(5, 5)]).toBe(1);
  });

  it('caps growth at 255', () => {
    const g = makeGrid();
    const sim = new ServiceSim(catalog);
    g.zone[tileIndex(1, 1)] = ZoneType.ResLow;
    g.fields[FieldId.LandValue]![tileIndex(1, 1)] = 0;
    g.fields[FieldId.Crime]![tileIndex(1, 1)] = 254;

    sim.tick(g, [], fullFunding(1));

    expect(g.fields[FieldId.Crime]![tileIndex(1, 1)]).toBe(255);
  });
});

/** Straight run of `steps` road tiles from (x0,z0), stepping by (dx,dz) each time (excludes the origin itself). */
function straightRun(
  x0: number,
  z0: number,
  dx: number,
  dz: number,
  steps: number,
): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  let x = x0;
  let z = z0;
  for (let i = 0; i < steps; i++) {
    x += dx;
    z += dz;
    pts.push([x, z]);
  }
  return pts;
}

describe('ServiceSim: coverage follows road distance, not euclidean distance', () => {
  it('gives a road-far-but-physically-close tile less coverage than a road-near-but-physically-far tile', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    // School with a large range so hop distances up to ~55 still register (see below).
    const longRangeSchool: BuildingCatalogEntry = {
      ...school,
      id: 'long-range-school',
      service: { kind: 'education', strength: 100, range: 100 },
    };
    place(g, buildings, 1, 'long-range-school', 0, 0, 1, 1);

    // A single bent path, starting one tile east of the school footprint (hop 0):
    //   east 10 tiles (hop 0..9), then south 20 (hop 10..29), then west 9 (hop 30..38),
    //   then north 17 back up to (1,3) (hop 39..55) -- physically close to the school again,
    //   but only reachable via this whole 56-tile detour.
    const east = straightRun(0, 0, 1, 0, 10); // (1,0)..(10,0), hop 0..9
    const south = straightRun(10, 0, 0, 1, 20); // (10,1)..(10,20), hop 10..29
    const west = straightRun(10, 20, -1, 0, 9); // (9,20)..(1,20), hop 30..38
    const north = straightRun(1, 20, 0, -1, 17); // (1,19)..(1,3), hop 39..55
    paintPath(g, [...east, ...south, ...west, ...north]);

    // Euclidean ~12 from the school, but only 9 hops away by road (end of the short `east` run).
    place(g, buildings, 2, 'target-marker', 12, 0, 1, 1);
    // Euclidean ~4.2 from the school (much closer!), but 55 hops away by road (end of the long detour).
    place(g, buildings, 3, 'target-marker', 3, 3, 1, 1);

    const sim = new ServiceSim([...catalog, longRangeSchool]);
    sim.tick(g, buildings, fullFunding(1));

    const farEuclideanNearRoad = g.fields[FieldId.Education]![tileIndex(12, 0)]!;
    const nearEuclideanFarRoad = g.fields[FieldId.Education]![tileIndex(3, 3)]!;

    // strength 100, range 100: hop 9 -> 100*(1-9/100) = 91
    expect(farEuclideanNearRoad).toBe(91);
    // hop 55 -> 100*(1-55/100) = 45
    expect(nearEuclideanFarRoad).toBe(45);
    // The physically closer tile receives strictly LESS coverage than the physically farther one.
    expect(nearEuclideanFarRoad).toBeLessThan(farEuclideanNearRoad);
  });

  it('scales range by funding, and stops delivering coverage beyond the scaled range', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    place(g, buildings, 1, 'clinic', 0, 0, 1, 1); // clinic: range 10
    const path: Array<[number, number]> = [[1, 0]];
    for (let x = 2; x <= 8; x++) path.push([x, 0]);
    paintPath(g, path); // hop distances 0..7 along x=1..8, row 0

    // Target adjacent to the road tile at hop distance 6 (x=7,z=0 -> hop 6), i.e. tile (7,1).
    place(g, buildings, 2, 'house-stub', 7, 1, 1, 1);

    const sim = new ServiceSim(catalog);

    // funding 0.5 -> range = floor(10*0.5) = 5; hop 6 is beyond range -> no coverage.
    sim.tick(g, buildings, fullFunding(0.5));
    expect(g.fields[FieldId.Health]![tileIndex(7, 1)]).toBe(0);

    // funding 1.5 -> range = floor(10*1.5) = 15; hop 6 is within range -> coverage present.
    const g2 = makeGrid();
    const buildings2: BuildingInstance[] = [];
    place(g2, buildings2, 1, 'clinic', 0, 0, 1, 1);
    paintPath(g2, path);
    place(g2, buildings2, 2, 'house-stub', 7, 1, 1, 1);
    sim.tick(g2, buildings2, fullFunding(1.5));
    expect(g2.fields[FieldId.Health]![tileIndex(7, 1)]).toBeGreaterThan(0);
  });
});

describe('ServiceSim: max-blend for education/health', () => {
  it('keeps the higher of the existing field value and the new coverage', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    place(g, buildings, 1, 'school', 0, 0, 1, 1);
    g.roadTier[tileIndex(1, 0)] = RoadTier.TwoLane;

    // Pre-seed a HIGHER existing value than the coverage this school would deliver.
    g.fields[FieldId.Education]![tileIndex(1, 1)] = 250; // adjacent to road tile (1,0), coverage would be 100

    const sim = new ServiceSim(catalog);
    sim.tick(g, buildings, fullFunding(1));

    expect(g.fields[FieldId.Education]![tileIndex(1, 1)]).toBe(250); // unchanged, since 250 > 100
  });

  it('raises the field when the new coverage is higher than the existing value', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    place(g, buildings, 1, 'school', 0, 0, 1, 1);
    g.roadTier[tileIndex(1, 0)] = RoadTier.TwoLane;
    g.fields[FieldId.Education]![tileIndex(1, 1)] = 10;

    const sim = new ServiceSim(catalog);
    sim.tick(g, buildings, fullFunding(1));

    expect(g.fields[FieldId.Education]![tileIndex(1, 1)]).toBe(100); // strength 100, dist 0
  });
});

describe('ServiceSim: police and fire subtract from their fields', () => {
  it('police lowers crime where covered, floored at 0', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    place(g, buildings, 1, 'police', 0, 0, 2, 2);
    g.roadTier[tileIndex(2, 0)] = RoadTier.TwoLane; // hop distance 0, adjacent to footprint

    g.fields[FieldId.Crime]![tileIndex(2, 1)] = 200; // adjacent to the road tile -> full coverage (160)

    const sim = new ServiceSim(catalog);
    sim.tick(g, buildings, fullFunding(1));

    expect(g.fields[FieldId.Crime]![tileIndex(2, 1)]).toBe(120); // 200 - 160/2
  });

  it('floors crime at 0 rather than wrapping around', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    place(g, buildings, 1, 'police', 0, 0, 2, 2);
    g.roadTier[tileIndex(2, 0)] = RoadTier.TwoLane;
    g.fields[FieldId.Crime]![tileIndex(2, 1)] = 10; // less than the 80 that would be subtracted

    const sim = new ServiceSim(catalog);
    sim.tick(g, buildings, fullFunding(1));

    expect(g.fields[FieldId.Crime]![tileIndex(2, 1)]).toBe(0);
  });

  it('fire station lowers fireRisk where covered', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    place(g, buildings, 1, 'fire', 0, 0, 2, 2);
    g.roadTier[tileIndex(2, 0)] = RoadTier.TwoLane;
    g.fields[FieldId.FireRisk]![tileIndex(2, 1)] = 200;

    const sim = new ServiceSim(catalog);
    sim.tick(g, buildings, fullFunding(1));

    expect(g.fields[FieldId.FireRisk]![tileIndex(2, 1)]).toBe(120); // 200 - 160/2
  });
});

describe('ServiceSim: parks', () => {
  it('adds landValueBonus at the source footprint unconditionally', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    // No road anywhere -> no BFS coverage possible, but the flat bonus still applies at the source.
    place(g, buildings, 1, 'park', 10, 10, 1, 1);

    const sim = new ServiceSim(catalog);
    sim.tick(g, buildings, fullFunding(1));

    expect(g.fields[FieldId.LandValue]![tileIndex(10, 10)]).toBe(40);
  });

  it('adds coverage/4 to landValue across the covered area, saturating at 255', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    place(g, buildings, 1, 'park', 0, 0, 1, 1);
    g.roadTier[tileIndex(1, 0)] = RoadTier.TwoLane; // hop 0

    g.fields[FieldId.LandValue]![tileIndex(1, 1)] = 250; // near-saturated already

    const sim = new ServiceSim(catalog);
    sim.tick(g, buildings, fullFunding(1));

    // strength 80, dist 0 -> coverage 80 -> +20 to landValue; 250+20=270 saturates at 255.
    expect(g.fields[FieldId.LandValue]![tileIndex(1, 1)]).toBe(255);
  });
});

// ---------------------------------------------------------------------------
// Service capacity: a facility serves a number of PEOPLE, and degrades
// smoothly once more of them depend on it than it can serve.
// ---------------------------------------------------------------------------

/** A clinic variant: same strength, its own capacity (undefined = uncapped) and range. */
function clinicWith(id: string, capacity: number | undefined, range = 10): BuildingCatalogEntry {
  return {
    ...clinic,
    id,
    service: { kind: 'health', strength: 140, range, capacity },
  };
}

/** A residential entry — the only thing that contributes to a reach population. */
function homeWith(id: string, residents: number, w = 1, d = 1): BuildingCatalogEntry {
  return {
    id,
    name: id,
    category: 'res',
    zone: ZoneType.ResLow,
    level: 1,
    footprint: { w, d },
    height: 5,
    color: 0,
    residents,
    powerUse: 0,
    waterUse: 0,
    cost: 0,
    upkeep: 0,
    unlockMilestone: 0,
  };
}

const home500 = homeWith('home-500', 500);
const crowd = homeWith('crowd', 100_000);
const tower900 = homeWith('tower-900', 900, 3, 3);

/** A straight road run along z = 1, covering x = 0..len-1. */
function roadStrip(g: GridState, len: number): void {
  paintPath(g, straightRun(-1, 1, 1, 0, len));
}

function makeStats(): CityStats {
  return {
    tick: 0,
    funds: 10_000,
    monthlyIncome: 0,
    monthlyExpenses: 0,
    population: 0,
    jobs: 0,
    employed: 0,
    demand: { res: 0, com: 0, ind: 0 },
    happiness: 50,
    powerSupply: 0,
    powerDemand: 0,
    waterSupply: 0,
    waterDemand: 0,
    milestoneLevel: 0,
    milestoneProgress: 0,
    loanBalance: 0,
    taxRates: { res: 0.1, com: 0.1, ind: 0.1 },
    serviceFunding: { police: 1, fire: 1, health: 1, education: 1, park: 1 },
  };
}

describe('ServiceSim: capacity', () => {
  it('never degrades a facility whose spec carries no capacity, however many people it reaches', () => {
    const uncapped = clinicWith('clinic-uncapped', undefined);
    const cat = [...catalog, uncapped, home500, crowd];
    const sim = new ServiceSim(cat);

    const quiet = makeGrid();
    const quietBuildings: BuildingInstance[] = [];
    roadStrip(quiet, 9);
    place(quiet, quietBuildings, 1, 'clinic-uncapped', 0, 0, 1, 1);
    place(quiet, quietBuildings, 2, 'home-500', 2, 2, 1, 1);
    sim.tick(quiet, quietBuildings, fullFunding(1));

    const crowded = makeGrid();
    const crowdedBuildings: BuildingInstance[] = [];
    roadStrip(crowded, 9);
    place(crowded, crowdedBuildings, 1, 'clinic-uncapped', 0, 0, 1, 1);
    place(crowded, crowdedBuildings, 2, 'crowd', 2, 2, 1, 1);
    sim.tick(crowded, crowdedBuildings, fullFunding(1));

    // 100,000 residents in reach change nothing: the same field, byte for byte.
    expect(crowded.fields[FieldId.Health]).toEqual(quiet.fields[FieldId.Health]);
    expect(crowded.fields[FieldId.Health]![tileIndex(0, 2)]).toBe(140); // full strength
  });

  it('counts a building once towards reach population however many of its tiles are reached', () => {
    const cat = [...catalog, clinicWith('clinic-900', 900), tower900];
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    // Two road rows joined at x = 0, so every tile of the 3x3 tower at
    // (3..5, 2..4) is within the 2-tile radiation of some reached road tile.
    roadStrip(g, 9);
    paintPath(g, straightRun(0, 1, 0, 1, 4)); // (0,2)..(0,5)
    paintPath(g, straightRun(-1, 5, 1, 0, 9)); // (0,5)..(8,5)
    place(g, buildings, 1, 'clinic-900', 0, 0, 1, 1);
    place(g, buildings, 2, 'tower-900', 3, 2, 3, 3);

    const sim = new ServiceSim(cat);
    const summary = sim.tick(g, buildings, fullFunding(1));

    // 900 residents against capacity 900 — one count, not nine (which reads 9.0).
    expect(summary.health.load).toBe(1);
    expect(g.fields[FieldId.Health]![tileIndex(0, 0)]).toBe(140);
  });

  it('counts only Active residents, matching the population the economy reports', () => {
    const cat = [...catalog, clinicWith('clinic-1000', 1000), home500];
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    roadStrip(g, 9);
    place(g, buildings, 1, 'clinic-1000', 0, 0, 1, 1);
    place(g, buildings, 2, 'home-500', 2, 2, 1, 1);
    place(g, buildings, 3, 'home-500', 3, 2, 1, 1);
    place(g, buildings, 4, 'home-500', 4, 2, 1, 1, BuildingState.Constructing);
    place(g, buildings, 5, 'home-500', 5, 2, 1, 1, BuildingState.Abandoned);

    const { statsPatch } = new EconomySystem(cat, []).tick({
      g,
      buildings,
      stats: makeStats(),
      tickNo: 1,
    });
    const summary = new ServiceSim(cat).tick(g, buildings, fullFunding(1));

    expect(statsPatch.population).toBe(1000); // the two Active homes only
    expect(summary.health.load).toBeCloseTo(statsPatch.population! / 1000, 10);
  });

  it('sums the capacities reaching a tile before dividing by the people there', () => {
    const cat = [...catalog, clinicWith('clinic-1000', 1000), home500];
    const sim = new ServiceSim(cat);

    const two = makeGrid();
    const twoBuildings: BuildingInstance[] = [];
    roadStrip(two, 9);
    place(two, twoBuildings, 1, 'clinic-1000', 0, 0, 1, 1);
    place(two, twoBuildings, 2, 'clinic-1000', 8, 0, 1, 1);
    for (let i = 0; i < 4; i++) place(two, twoBuildings, 10 + i, 'home-500', 2 + i, 2, 1, 1);
    sim.tick(two, twoBuildings, fullFunding(1));

    const one = makeGrid();
    const oneBuildings: BuildingInstance[] = [];
    roadStrip(one, 9);
    place(one, oneBuildings, 1, 'clinic-1000', 0, 0, 1, 1);
    for (let i = 0; i < 4; i++) place(one, oneBuildings, 10 + i, 'home-500', 2 + i, 2, 1, 1);
    sim.tick(one, oneBuildings, fullFunding(1));

    // 2,000 people: 1,000 + 1,000 of capacity covers them (full strength);
    // 1,000 alone is half the supply they need (half strength).
    expect(two.fields[FieldId.Health]![tileIndex(0, 2)]).toBe(140);
    expect(one.fields[FieldId.Health]![tileIndex(0, 2)]).toBe(70);
  });

  it('never writes more than its strength when it has capacity to spare', () => {
    const cat = [...catalog, clinicWith('clinic-1000', 1000), home500];
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    roadStrip(g, 9);
    place(g, buildings, 1, 'clinic-1000', 0, 0, 1, 1);
    place(g, buildings, 2, 'home-500', 2, 2, 1, 1);

    new ServiceSim(cat).tick(g, buildings, fullFunding(1));

    // capacity 1,000 over 500 people is supply 2.0 — min(1, 2.0) pays no bonus.
    expect(g.fields[FieldId.Health]![tileIndex(0, 2)]).toBe(140);
  });

  it('leaves a tile uncapped when one facility reaching it is uncapped, however loaded the other is', () => {
    const cat = [
      ...catalog,
      clinicWith('clinic-100', 100),
      clinicWith('clinic-uncapped', undefined),
      home500,
    ];
    const sim = new ServiceSim(cat);

    const mixed = makeGrid();
    const mixedBuildings: BuildingInstance[] = [];
    roadStrip(mixed, 9);
    place(mixed, mixedBuildings, 1, 'clinic-100', 0, 0, 1, 1);
    place(mixed, mixedBuildings, 2, 'clinic-uncapped', 8, 0, 1, 1);
    for (let i = 0; i < 4; i++) place(mixed, mixedBuildings, 10 + i, 'home-500', 2 + i, 2, 1, 1);
    sim.tick(mixed, mixedBuildings, fullFunding(1));

    const alone = makeGrid();
    const aloneBuildings: BuildingInstance[] = [];
    roadStrip(alone, 9);
    place(alone, aloneBuildings, 1, 'clinic-100', 0, 0, 1, 1);
    for (let i = 0; i < 4; i++) place(alone, aloneBuildings, 10 + i, 'home-500', 2 + i, 2, 1, 1);
    sim.tick(alone, aloneBuildings, fullFunding(1));

    expect(alone.fields[FieldId.Health]![tileIndex(0, 2)]).toBe(7); // 140 * (100/2000)
    expect(mixed.fields[FieldId.Health]![tileIndex(0, 2)]).toBe(140); // the uncapped one lifts it
  });

  it('scales both capacity and range by the funding for its kind', () => {
    const cat = [...catalog, clinicWith('clinic-1000', 1000), home500];
    const sim = new ServiceSim(cat);

    const build = (): { g: GridState; buildings: BuildingInstance[] } => {
      const g = makeGrid();
      const buildings: BuildingInstance[] = [];
      roadStrip(g, 16);
      place(g, buildings, 1, 'clinic-1000', 0, 0, 1, 1);
      for (let i = 0; i < 4; i++) place(g, buildings, 10 + i, 'home-500', 2 + i, 2, 1, 1);
      return { g, buildings };
    };

    const plain = build();
    sim.tick(plain.g, plain.buildings, fullFunding(1));
    const funded = build();
    sim.tick(funded.g, funded.buildings, fullFunding(1.5));

    const health = FieldId.Health;
    // Capacity: 1,000 over 2,000 is half strength; 1,500 over the same 2,000 is three quarters.
    expect(plain.g.fields[health]![tileIndex(0, 2)]).toBe(70);
    expect(funded.g.fields[health]![tileIndex(0, 2)]).toBe(105);
    // Range: hop 13 is outside range 10 and inside range 15.
    expect(plain.g.fields[health]![tileIndex(13, 2)]).toBe(0);
    expect(funded.g.fields[health]![tileIndex(13, 2)]).toBeGreaterThan(0);
  });

  it('walks the road network exactly once per active facility per tick', () => {
    const cat = [...catalog, clinicWith('clinic-1000', 1000)];
    let calls = 0;
    const counting = (g: GridState, start: number, maxDist: number): Map<number, number> => {
      calls += 1;
      return roadBfsDistances(g, start, maxDist);
    };
    const sim = new ServiceSim(cat, counting);

    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    roadStrip(g, 9);
    place(g, buildings, 1, 'clinic-1000', 0, 0, 1, 1);
    place(g, buildings, 2, 'school', 1, 0, 1, 1);
    place(g, buildings, 3, 'park', 2, 0, 1, 1);
    place(g, buildings, 4, 'clinic-1000', 3, 0, 1, 1, BuildingState.Constructing);
    place(g, buildings, 5, 'clinic-1000', 20, 20, 1, 1); // no road within reach of its footprint

    sim.tick(g, buildings, fullFunding(1));
    expect(calls).toBe(3);

    sim.tick(g, buildings, fullFunding(1));
    expect(calls).toBe(6);
  });

  it('produces identical fields and load figures from identical input, tick after tick', () => {
    const cat = [
      ...catalog,
      clinicWith('clinic-1000', 1000),
      clinicWith('clinic-uncapped', undefined),
      home500,
    ];
    const build = (): { g: GridState; buildings: BuildingInstance[] } => {
      const g = makeGrid();
      const buildings: BuildingInstance[] = [];
      roadStrip(g, 12);
      place(g, buildings, 3, 'clinic-1000', 0, 0, 1, 1);
      place(g, buildings, 1, 'clinic-uncapped', 9, 0, 1, 1);
      place(g, buildings, 2, 'police', 4, 0, 2, 2);
      place(g, buildings, 4, 'park', 7, 0, 1, 1);
      for (let i = 0; i < 4; i++) place(g, buildings, 10 + i, 'home-500', 2 + i, 2, 1, 1);
      return { g, buildings };
    };

    const first = build();
    const second = build();
    const firstSummary = new ServiceSim(cat).tick(first.g, first.buildings, fullFunding(1));
    const secondSummary = new ServiceSim(cat).tick(second.g, second.buildings, fullFunding(1));

    expect(secondSummary).toEqual(firstSummary);
    for (let f = 0; f < first.g.fields.length; f++) {
      expect(second.g.fields[f]).toEqual(first.g.fields[f]);
    }
  });

  it('never degrades a facility whose reach holds nobody', () => {
    const cat = [...catalog, clinicWith('clinic-1000', 1000)];
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    roadStrip(g, 9);
    place(g, buildings, 1, 'clinic-1000', 0, 0, 1, 1);

    const summary = new ServiceSim(cat).tick(g, buildings, fullFunding(1));

    expect(g.fields[FieldId.Health]![tileIndex(0, 2)]).toBe(140); // no divide-by-zero
    expect(summary.health.load).toBe(0);
    expect(summary.health.worst).toBe(0);
  });

  it('writes full strength for a zero-capacity facility reaching nobody, rather than erasing the field', () => {
    // 0 people against 0 capacity is 0/0. Left alone it is NaN, min(1, NaN) is
    // NaN, and clamp255(NaN) is 0 — which on a max-blended kind does not merely
    // fail to help, it writes zero over health that other clinics supplied.
    const cat = [...catalog, clinicWith('clinic-0', 0)];
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    roadStrip(g, 9);
    place(g, buildings, 1, 'clinic-0', 0, 0, 1, 1);

    const summary = new ServiceSim(cat).tick(g, buildings, fullFunding(1));

    expect(g.fields[FieldId.Health]![tileIndex(0, 2)]).toBe(140);
    expect(summary.health.load).not.toBeNaN();
  });

  it('counts no capped facility for a kind that has none built', () => {
    const cat = [...catalog, clinicWith('clinic-1000', 1000), home500];
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    roadStrip(g, 9);
    place(g, buildings, 1, 'clinic-1000', 0, 0, 1, 1);
    place(g, buildings, 2, 'home-500', 2, 2, 1, 1);

    const summary = new ServiceSim(cat).tick(g, buildings, fullFunding(1));

    expect(summary.health.capped).toBe(1);
    expect(summary.police.capped).toBe(0);
  });

  it('counts a capped clinic nobody can reach, so its zero load is a reading and not a silence', () => {
    const cat = [...catalog, clinicWith('clinic-1000', 1000), home500];
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    roadStrip(g, 9);
    place(g, buildings, 1, 'clinic-1000', 0, 0, 1, 1);
    // The houses are up a lane of their own, far outside the clinic's reach.
    paintPath(g, straightRun(-1, 60, 1, 0, 4));
    place(g, buildings, 2, 'home-500', 61, 61, 1, 1);

    const summary = new ServiceSim(cat).tick(g, buildings, fullFunding(1));

    expect(summary.health.capped).toBe(1);
    expect(summary.health.load).toBe(0);
  });

  it('counts facilities, so two clinics read two', () => {
    const cat = [...catalog, clinicWith('clinic-1000', 1000), home500];
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    roadStrip(g, 9);
    place(g, buildings, 1, 'clinic-1000', 0, 0, 1, 1);
    place(g, buildings, 2, 'clinic-1000', 6, 0, 1, 1);
    place(g, buildings, 3, 'home-500', 2, 2, 1, 1);

    const summary = new ServiceSim(cat).tick(g, buildings, fullFunding(1));

    expect(summary.health.capped).toBe(2);
  });

  it('counts no capped facility for an uncapped kind, however many parks are open', () => {
    const cat = [...catalog, home500];
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    roadStrip(g, 9);
    place(g, buildings, 1, 'park', 0, 0, 1, 1);
    place(g, buildings, 2, 'home-500', 2, 2, 1, 1);

    const summary = new ServiceSim(cat).tick(g, buildings, fullFunding(1));

    expect(summary.park.capped).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Behaviour preservation: with no capacity anywhere, the capacity pass must
// write exactly the bytes the per-facility pass wrote before it existed. The
// fingerprints asserted below were captured from the pre-capacity
// implementation on this very scenario — they are what "unchanged" means.
// ---------------------------------------------------------------------------

/** Order-sensitive fingerprint of a whole field, so a single shifted byte shows. */
function fieldFingerprint(f: Uint8Array): {
  sum: number;
  weighted: number;
  nonZero: number;
  max: number;
} {
  let sum = 0;
  let weighted = 0;
  let nonZero = 0;
  let max = 0;
  for (let i = 0; i < f.length; i++) {
    const v = f[i]!;
    if (v === 0) continue;
    sum += v;
    nonZero += 1;
    if (v > max) max = v;
    weighted += ((i % 251) + 1) * v;
  }
  return { sum, weighted, nonZero, max };
}

/**
 * What the pre-capacity pass wrote on the scenario below, captured by running
 * it against that implementation. Any drift here is a change in behaviour for
 * every city that has no capacity figure anywhere — which is every old save.
 */
const PRE_CAPACITY_FIELDS = {
  crime: { sum: 12558, weighted: 516809, nonZero: 143, max: 201 },
  fireRisk: { sum: 11034, weighted: 435665, nonZero: 125, max: 179 },
  landValue: { sum: 17574, weighted: 544450, nonZero: 200, max: 186 },
  education: { sum: 19171, weighted: 546220, nonZero: 197, max: 150 },
  health: { sum: 17957, weighted: 515996, nonZero: 196, max: 140 },
};

/** Strengths and ranges exactly as src/data/catalog.json states them, fractional coverage and all. */
const preservationCatalog: BuildingCatalogEntry[] = [
  { ...policeStation, id: 'p-real', service: { kind: 'police', strength: 160, range: 48 } },
  { ...fireStation, id: 'f-real', service: { kind: 'fire', strength: 160, range: 48 } },
  { ...clinic, id: 'h-real', service: { kind: 'health', strength: 140, range: 40 } },
  { ...school, id: 'e-real', service: { kind: 'education', strength: 150, range: 56 } },
  { ...parkEntry, id: 'k-real', service: { kind: 'park', strength: 80, range: 16 } },
  home500,
];

function twoOfEachCity(): { g: GridState; buildings: BuildingInstance[] } {
  const g = makeGrid();
  const buildings: BuildingInstance[] = [];
  roadStrip(g, 16);
  paintPath(g, straightRun(8, 1, 0, 1, 5)); // a spur south from (8,1)

  let id = 1;
  for (const catalogId of ['p-real', 'f-real', 'h-real', 'e-real', 'k-real']) {
    place(g, buildings, id, catalogId, id - 1, 0, 1, 1);
    id += 1;
    place(g, buildings, id, catalogId, id - 1, 0, 1, 1);
    id += 1;
  }
  for (const x of [2, 4, 6, 10, 12]) {
    place(g, buildings, id, 'home-500', x, 2, 1, 1);
    id += 1;
  }

  // Field values a coverage pass has something to subtract from and add to.
  for (let z = 0; z < 10; z++) {
    for (let x = 0; x < 20; x++) {
      const i = tileIndex(x, z);
      g.zone[i] = ZoneType.ResLow;
      g.fields[FieldId.Crime]![i] = (i * 13) % 200;
      g.fields[FieldId.FireRisk]![i] = (i * 7) % 180;
      g.fields[FieldId.LandValue]![i] = (i * 11) % 150;
      g.fields[FieldId.Education]![i] = (i * 3) % 120;
      g.fields[FieldId.Health]![i] = (i * 5) % 130;
    }
  }
  return { g, buildings };
}

describe('ServiceSim: the capacity pass preserves the fields the old pass wrote', () => {
  it('writes the pre-capacity bytes for two overlapping facilities of every kind', () => {
    const { g, buildings } = twoOfEachCity();
    new ServiceSim(preservationCatalog).tick(g, buildings, fullFunding(1));

    expect({
      crime: fieldFingerprint(g.fields[FieldId.Crime]!),
      fireRisk: fieldFingerprint(g.fields[FieldId.FireRisk]!),
      landValue: fieldFingerprint(g.fields[FieldId.LandValue]!),
      education: fieldFingerprint(g.fields[FieldId.Education]!),
      health: fieldFingerprint(g.fields[FieldId.Health]!),
    }).toEqual(PRE_CAPACITY_FIELDS);
  });
});

describe('ServiceSim: a facility keeps its own load, for the selection channel', () => {
  it('reports the people in its own reach against the capacity it offers them', () => {
    const cat = [...catalog, clinicWith('clinic-1000', 1000), home500];
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    roadStrip(g, 9);
    place(g, buildings, 1, 'clinic-1000', 0, 0, 1, 1);
    for (let i = 0; i < 3; i++) place(g, buildings, 10 + i, 'home-500', 2 + i, 2, 1, 1);

    const sim = new ServiceSim(cat);
    sim.tick(g, buildings, fullFunding(1));

    // 1,500 people against 1,000 places.
    expect(sim.facilityLoad(1)).toBeCloseTo(1.5, 10);
  });

  it('scales the facility figure by funding, as the aggregate does', () => {
    const cat = [...catalog, clinicWith('clinic-1000', 1000), home500];
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    roadStrip(g, 9);
    place(g, buildings, 1, 'clinic-1000', 0, 0, 1, 1);
    for (let i = 0; i < 3; i++) place(g, buildings, 10 + i, 'home-500', 2 + i, 2, 1, 1);

    const sim = new ServiceSim(cat);
    sim.tick(g, buildings, fullFunding(1.5));

    expect(sim.facilityLoad(1)).toBeCloseTo(1, 10);
  });

  it('has no reading for an uncapped facility, rather than a load of zero', () => {
    const cat = [...catalog, clinicWith('clinic-uncapped', undefined), home500];
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    roadStrip(g, 9);
    place(g, buildings, 1, 'clinic-uncapped', 0, 0, 1, 1);
    place(g, buildings, 2, 'home-500', 2, 2, 1, 1);

    const sim = new ServiceSim(cat);
    sim.tick(g, buildings, fullFunding(1));

    expect(sim.facilityLoad(1)).toBeUndefined();
  });

  it('forgets a facility that is gone by the next tick', () => {
    const cat = [...catalog, clinicWith('clinic-1000', 1000), home500];
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    roadStrip(g, 9);
    place(g, buildings, 1, 'clinic-1000', 0, 0, 1, 1);
    place(g, buildings, 2, 'home-500', 2, 2, 1, 1);

    const sim = new ServiceSim(cat);
    sim.tick(g, buildings, fullFunding(1));
    expect(sim.facilityLoad(1)).toBeCloseTo(0.5, 10);

    g.buildingId[tileIndex(0, 0)] = 0;
    sim.tick(g, [buildings[1]!], fullFunding(1));
    expect(sim.facilityLoad(1)).toBeUndefined();
  });
});
