import { describe, expect, it } from 'vitest';
import type {
  BuildingCatalogEntry,
  BuildingInstance,
  CityStats,
  GridState,
  RoadSpec,
} from '../shared/types';
import { BuildingState, FIELD_COUNT, FieldId, RoadTier } from '../shared/types';
import { MAP_SIZE, MAX_LOAN, MILESTONES, TICKS_PER_MONTH, tileIndex } from '../shared/constants';
import { EconomySystem, buildingMonthlyTax } from './economy';

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

function place(
  g: GridState,
  buildings: BuildingInstance[],
  id: number,
  catalogId: string,
  x: number,
  z: number,
  state: BuildingInstance['state'] = BuildingState.Active,
): BuildingInstance {
  g.buildingId[tileIndex(x, z)] = id;
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

function makeStats(overrides: Partial<CityStats> = {}): CityStats {
  return {
    tick: 0,
    funds: 10000,
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
    ...overrides,
  };
}

const resHouse: BuildingCatalogEntry = {
  id: 'res',
  name: 'Res',
  category: 'res',
  zone: 1,
  level: 1,
  footprint: { w: 1, d: 1 },
  height: 5,
  color: 0,
  residents: 10,
  powerUse: 0,
  waterUse: 0,
  cost: 0,
  upkeep: 0,
  unlockMilestone: 0,
};

const comShop: BuildingCatalogEntry = {
  id: 'com',
  name: 'Com',
  category: 'com',
  zone: 3,
  level: 1,
  footprint: { w: 1, d: 1 },
  height: 5,
  color: 0,
  jobs: 5,
  powerUse: 0,
  waterUse: 0,
  cost: 0,
  upkeep: 0,
  unlockMilestone: 0,
};

const indYard: BuildingCatalogEntry = {
  id: 'ind',
  name: 'Ind',
  category: 'ind',
  zone: 5,
  level: 1,
  footprint: { w: 1, d: 1 },
  height: 5,
  color: 0,
  jobs: 3,
  powerUse: 0,
  waterUse: 0,
  cost: 0,
  upkeep: 0,
  unlockMilestone: 0,
};

const police: BuildingCatalogEntry = {
  id: 'police',
  name: 'Police',
  category: 'service',
  footprint: { w: 1, d: 1 },
  height: 5,
  color: 0,
  powerUse: 0,
  waterUse: 0,
  service: { kind: 'police', strength: 100, range: 10 },
  cost: 0,
  upkeep: 300,
  unlockMilestone: 0,
};

const bigRes: BuildingCatalogEntry = {
  id: 'big-res',
  name: 'BigRes',
  category: 'res',
  zone: 1,
  level: 1,
  footprint: { w: 1, d: 1 },
  height: 5,
  color: 0,
  residents: 500,
  powerUse: 0,
  waterUse: 0,
  cost: 0,
  upkeep: 0,
  unlockMilestone: 0,
};

// Mixed housing: category 'res' but carries BOTH residents and
// commercial ground-floor jobs.
const mixedBlock: BuildingCatalogEntry = {
  id: 'mixed',
  name: 'Mixed',
  category: 'res',
  zone: 8,
  level: 1,
  footprint: { w: 2, d: 2 },
  height: 18,
  color: 0,
  residents: 30,
  jobs: 12,
  powerUse: 0,
  waterUse: 0,
  cost: 0,
  upkeep: 0,
  unlockMilestone: 3,
};

const catalog = [resHouse, comShop, indYard, police];

const roadSpecs: RoadSpec[] = [
  {
    tier: RoadTier.TwoLane,
    name: 'Two-Lane',
    costPerTile: 20,
    upkeepPerTile: 0.4,
    speed: 14,
    capacity: 600,
    unlockMilestone: 0,
  },
  {
    tier: RoadTier.Avenue,
    name: 'Avenue',
    costPerTile: 45,
    upkeepPerTile: 0.9,
    speed: 18,
    capacity: 1600,
    unlockMilestone: 1,
  },
  {
    tier: RoadTier.Highway,
    name: 'Highway',
    costPerTile: 90,
    upkeepPerTile: 1.8,
    speed: 28,
    capacity: 4000,
    unlockMilestone: 3,
  },
];

describe('EconomySystem: population/jobs/employed aggregation', () => {
  it('aggregates Active buildings every tick, ignoring Constructing/Abandoned', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    place(g, buildings, 1, 'res', 0, 0);
    place(g, buildings, 2, 'com', 1, 0);
    place(g, buildings, 3, 'ind', 2, 0);
    place(g, buildings, 4, 'res', 5, 0, BuildingState.Constructing);
    place(g, buildings, 5, 'com', 6, 0, BuildingState.Abandoned);

    const sys = new EconomySystem(catalog, roadSpecs);
    const stats = makeStats();
    const { statsPatch } = sys.tick({ g, buildings, stats, tickNo: 1 });

    expect(statsPatch.population).toBe(10);
    expect(statsPatch.jobs).toBe(8);
    expect(statsPatch.employed).toBe(5); // min(floor(10*0.55)=5, 8)
  });

  it('counts Mixed (res-category) buildings into BOTH population and jobs (§6.21)', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    place(g, buildings, 1, 'mixed', 0, 0);
    place(g, buildings, 2, 'com', 1, 0);

    const sys = new EconomySystem([...catalog, mixedBlock], roadSpecs);
    const stats = makeStats();
    const { statsPatch } = sys.tick({ g, buildings, stats, tickNo: 1 });

    // Mixed contributes 30 residents to population AND 12 jobs; com adds 5 jobs.
    expect(statsPatch.population).toBe(30);
    expect(statsPatch.jobs).toBe(17);
  });
});

describe('EconomySystem: monthly income/expenses', () => {
  it('computes income and expenses on a hand-built scenario at the month boundary', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    place(g, buildings, 1, 'res', 0, 0);
    place(g, buildings, 2, 'com', 1, 0);
    place(g, buildings, 3, 'ind', 2, 0);
    place(g, buildings, 4, 'police', 3, 0);
    for (const [x, z] of [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ] as const) {
      g.fields[FieldId.LandValue]![tileIndex(x, z)] = 255;
    }
    for (let x = 10; x < 20; x++) g.roadTier[tileIndex(x, 0)] = RoadTier.TwoLane;

    const sys = new EconomySystem(catalog, roadSpecs);
    const stats = makeStats({ funds: 10000, loanBalance: 1000 });
    const { statsPatch } = sys.tick({ g, buildings, stats, tickNo: TICKS_PER_MONTH });

    // rawIncome = 10*0.1*12 + 5*0.1*12 + 3*0.1*12 = 21.6; landValueFactor = 0.75+(255/255)*0.5 = 1.25
    expect(statsPatch.monthlyIncome).toBeCloseTo(27, 6);
    // expenses = 300 (police upkeep, funding 1) + 10*0.4 (road) + 1000*0.01 (interest) = 314
    expect(statsPatch.monthlyExpenses).toBeCloseTo(314, 6);
    expect(statsPatch.funds).toBeCloseTo(10000 + 27 - 314, 6);
  });

  it('skips the monthly cycle on tick 0 and on non-boundary ticks', () => {
    const g = makeGrid();
    const sys = new EconomySystem(catalog, roadSpecs);
    const stats = makeStats();

    const r0 = sys.tick({ g, buildings: [], stats, tickNo: 0 });
    expect(r0.statsPatch.monthlyIncome).toBeUndefined();
    expect(r0.statsPatch.monthlyExpenses).toBeUndefined();

    const r1 = sys.tick({ g, buildings: [], stats, tickNo: TICKS_PER_MONTH - 1 });
    expect(r1.statsPatch.monthlyIncome).toBeUndefined();
  });

  it('scales building upkeep by service funding', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    place(g, buildings, 1, 'police', 0, 0);
    const sys = new EconomySystem(catalog, roadSpecs);
    const stats = makeStats({
      serviceFunding: { police: 0.5, fire: 1, health: 1, education: 1, park: 1 },
    });
    const { statsPatch } = sys.tick({ g, buildings, stats, tickNo: TICKS_PER_MONTH });
    expect(statsPatch.monthlyExpenses).toBeCloseTo(150, 6); // 300 * 0.5, no roads/loan
  });

  it('emits a warning notification when funds drop below 2000, critical below 0', () => {
    const g = makeGrid();
    const sys = new EconomySystem(catalog, roadSpecs);

    const warnStats = makeStats({ funds: 2100, loanBalance: 20000 }); // interest 200 drags it to 1900
    const warnResult = sys.tick({ g, buildings: [], stats: warnStats, tickNo: TICKS_PER_MONTH });
    expect(warnResult.statsPatch.funds).toBeCloseTo(1900, 6);
    expect(warnResult.notifications.some((n) => n.severity === 'warning')).toBe(true);
    expect(warnResult.notifications.some((n) => n.severity === 'critical')).toBe(false);

    const critStats = makeStats({ funds: 50, loanBalance: 20000 }); // interest 200 drags it to -150
    const critResult = sys.tick({ g, buildings: [], stats: critStats, tickNo: TICKS_PER_MONTH });
    expect(critResult.statsPatch.funds).toBeCloseTo(-150, 6);
    expect(critResult.notifications.some((n) => n.severity === 'critical')).toBe(true);
  });
});

describe('EconomySystem: milestones', () => {
  it('levels up exactly once per threshold crossed, granting the reward once', () => {
    const g = makeGrid();
    const localCatalog = [...catalog, bigRes];
    const sys = new EconomySystem(localCatalog, roadSpecs);
    const buildings: BuildingInstance[] = [];
    place(g, buildings, 1, 'big-res', 0, 0); // residents 500 -> crosses MILESTONES[1].population (400)

    let stats = makeStats({ funds: 0, milestoneLevel: 0 });
    const r1 = sys.tick({ g, buildings, stats, tickNo: 1 });
    expect(r1.statsPatch.milestoneLevel).toBe(1);
    expect(r1.statsPatch.funds).toBe(MILESTONES[1]!.reward);
    expect(
      r1.notifications.filter((n) => n.title.toLowerCase().includes('milestone')),
    ).toHaveLength(1);

    stats = { ...stats, ...r1.statsPatch };
    const r2 = sys.tick({ g, buildings, stats, tickNo: 2 });
    expect(r2.statsPatch.milestoneLevel).toBe(1); // still below MILESTONES[2].population (1200)
    expect(r2.statsPatch.funds).toBe(stats.funds); // no additional reward
    expect(
      r2.notifications.filter((n) => n.title.toLowerCase().includes('milestone')),
    ).toHaveLength(0);

    // Cross MILESTONES[2].population (1200) by adding two more big-res buildings (total 1500).
    place(g, buildings, 2, 'big-res', 1, 0);
    place(g, buildings, 3, 'big-res', 2, 0);
    stats = { ...stats, ...r2.statsPatch };
    const r3 = sys.tick({ g, buildings, stats, tickNo: 3 });
    expect(r3.statsPatch.milestoneLevel).toBe(2);
    expect(r3.statsPatch.funds).toBe(stats.funds + MILESTONES[2]!.reward);
    expect(
      r3.notifications.filter((n) => n.title.toLowerCase().includes('milestone')),
    ).toHaveLength(1);
  });

  it('exposes milestoneProgress toward the next threshold, clamped to [0,1]', () => {
    const g = makeGrid();
    const sys = new EconomySystem(catalog, roadSpecs);
    const buildings: BuildingInstance[] = [];
    place(g, buildings, 1, 'big-res', 0, 0); // not in `catalog`, contributes 0 residents (unknown id)

    const stats = makeStats({ milestoneLevel: 0 });
    const { statsPatch } = sys.tick({ g, buildings, stats, tickNo: 1 });
    // population 0 (big-res isn't in `catalog` here) -> progress 0 toward MILESTONES[1]
    expect(statsPatch.milestoneProgress).toBeCloseTo(0, 6);
  });
});

describe('EconomySystem: loans', () => {
  it('applyLoan clamps to MAX_LOAN', () => {
    const sys = new EconomySystem(catalog, roadSpecs);
    const stats = makeStats({ funds: 1000, loanBalance: MAX_LOAN - 500 });
    const patch = sys.applyLoan(stats, 10000);
    expect(patch.loanBalance).toBe(MAX_LOAN);
    expect(patch.funds).toBe(1500);
  });

  it('applyLoan clamps negative amounts to zero', () => {
    const sys = new EconomySystem(catalog, roadSpecs);
    const stats = makeStats({ funds: 1000, loanBalance: 0 });
    const patch = sys.applyLoan(stats, -500);
    expect(patch.loanBalance).toBe(0);
    expect(patch.funds).toBe(1000);
  });

  it('applyRepay clamps to available funds', () => {
    const sys = new EconomySystem(catalog, roadSpecs);
    const stats = makeStats({ funds: 100, loanBalance: 5000 });
    const patch = sys.applyRepay(stats, 1000);
    expect(patch.loanBalance).toBe(4900);
    expect(patch.funds).toBe(0);
  });

  it('applyRepay clamps to the outstanding balance', () => {
    const sys = new EconomySystem(catalog, roadSpecs);
    const stats = makeStats({ funds: 10000, loanBalance: 300 });
    const patch = sys.applyRepay(stats, 1000);
    expect(patch.loanBalance).toBe(0);
    expect(patch.funds).toBe(9700);
  });

  it('applyRepay never lets funds go further negative when already bankrupt', () => {
    const sys = new EconomySystem(catalog, roadSpecs);
    const stats = makeStats({ funds: -500, loanBalance: 5000 });
    const patch = sys.applyRepay(stats, 1000);
    expect(patch.loanBalance).toBe(5000);
    expect(patch.funds).toBe(-500);
  });
});

describe('buildingMonthlyTax', () => {
  const rates = { res: 0.1, com: 0.2, ind: 0.3 };

  it('taxes an Active residential building: residents x res rate x 12 x land-value factor', () => {
    // Land value 0 -> factor 0.75 (LAND_VALUE_FACTOR_BASE).
    expect(buildingMonthlyTax(resHouse, BuildingState.Active, rates, 0)).toBeCloseTo(
      10 * 0.1 * 12 * 0.75,
    );
    // Land value 255 -> factor 1.25 (base + full span).
    expect(buildingMonthlyTax(resHouse, BuildingState.Active, rates, 255)).toBeCloseTo(
      10 * 0.1 * 12 * 1.25,
    );
  });

  it('taxes com and ind buildings on jobs at their sector rates', () => {
    expect(buildingMonthlyTax(comShop, BuildingState.Active, rates, 0)).toBeCloseTo(
      5 * 0.2 * 12 * 0.75,
    );
    expect(buildingMonthlyTax(indYard, BuildingState.Active, rates, 0)).toBeCloseTo(
      3 * 0.3 * 12 * 0.75,
    );
  });

  it('returns 0 for ploppables (services/utilities) regardless of state', () => {
    expect(buildingMonthlyTax(police, BuildingState.Active, rates, 255)).toBe(0);
  });

  it('returns 0 for non-Active buildings (Constructing/Abandoned pay no tax)', () => {
    expect(buildingMonthlyTax(resHouse, BuildingState.Constructing, rates, 128)).toBe(0);
    expect(buildingMonthlyTax(resHouse, BuildingState.Abandoned, rates, 128)).toBe(0);
  });
});
