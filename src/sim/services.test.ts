import { describe, expect, it } from 'vitest';
import type {
  BuildingCatalogEntry,
  BuildingInstance,
  GridState,
  ServiceKind,
} from '../shared/types';
import { BuildingState, FIELD_COUNT, FieldId, RoadTier, ZoneType } from '../shared/types';
import { MAP_SIZE, tileIndex } from '../shared/constants';
import { ServiceSim } from './services';

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
