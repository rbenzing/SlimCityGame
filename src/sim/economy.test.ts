import { describe, expect, it } from 'vitest';
import type {
  BuildingCatalogEntry,
  BuildingInstance,
  CityStats,
  GridState,
  RoadProfile,
  RoadSpec,
} from '../shared/types';
import { BuildingState, FieldId, RoadTier, ZoneType } from '../shared/types';
import {
  MAX_LOAN,
  MILESTONES,
  POWER_LINE_UPKEEP_PER_TILE,
  RECYCLING_CREDIT_PER_UNIT,
  REGIONAL_FUNERAL_FEE,
  TICKS_PER_MONTH,
  tileIndex,
} from '../shared/constants';
import { EconomySystem, buildingMonthlyTax } from './economy';
import { createGrid } from '../world/grid';

function makeGrid(): GridState {
  return createGrid();
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
    sewerSupply: 0,
    sewerDemand: 0,
    waterFouled: 0,
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

const busDepot: BuildingCatalogEntry = {
  id: 'bus-depot',
  name: 'Bus Depot',
  category: 'transit',
  footprint: { w: 2, d: 2 },
  height: 5.5,
  color: 0,
  powerUse: 0,
  waterUse: 0,
  depot: { mode: 'bus', fleet: 10 },
  cost: 3000,
  upkeep: 200,
  unlockMilestone: 1,
};

const catalog = [resHouse, comShop, indYard, police, busDepot];

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

describe('EconomySystem: a reserved lane costs more to keep than the street without it', () => {
  /** Ten tiles of street, all carrying the same composed cross-section. */
  const laneOfRoad = (g: GridState, profileId: number): void => {
    for (let x = 10; x < 20; x++) {
      const i = tileIndex(x, 0);
      g.roadTier[i] = RoadTier.TwoLane;
      g.roadProfile[i] = profileId;
    }
  };
  const withBus: RoadProfile = {
    class: 'local',
    kerbs: true,
    pieces: [
      { kind: 'sidewalk', width: 1.875 },
      { kind: 'travel', width: 3.05, flow: 'back' },
      { kind: 'travel', width: 3.05, flow: 'fwd' },
      { kind: 'bus', width: 3.5, flow: 'fwd' },
      { kind: 'sidewalk', width: 1.875 },
    ],
  };

  const upkeepOf = (profileId: number, profileOf?: (id: number) => RoadProfile | null): number => {
    const g = makeGrid();
    laneOfRoad(g, profileId);
    const sys = new EconomySystem(catalog, roadSpecs);
    const { statsPatch } = sys.tick({
      g,
      buildings: [],
      stats: makeStats({ funds: 10000 }),
      tickNo: TICKS_PER_MONTH,
      profileOf,
    });
    return statsPatch.monthlyExpenses ?? 0;
  };

  it('bills a composed bus street for the street plus the lane, not for the street alone', () => {
    // Ten tiles of a two-lane street: 10 × 0.4 = 4. One kerbside bus lane on
    // each of them adds 0.05 a tile — the figure derived from what the bus
    // road used to cost — so the city pays 10 × 0.5 = 5.
    const plain = upkeepOf(RoadTier.TwoLane);
    const bus = upkeepOf(20, (id) => (id === 20 ? withBus : null));
    expect(plain).toBeCloseTo(4, 6);
    expect(bus).toBeCloseTo(5, 6);
    expect(bus).toBeGreaterThan(plain);
  });

  it('charges the street alone when nothing can say what the road carries', () => {
    // Every caller that passes no profile lookup — and every save written
    // before profiles existed — bills exactly what it always did.
    expect(upkeepOf(20)).toBeCloseTo(4, 6);
  });
});

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
    expect(statsPatch.employed).toBe(5); // min(floor(10*0.5)=5, 8)
  });

  it('counts a farm family as population and the farm work as industrial jobs', () => {
    const farm: BuildingCatalogEntry = {
      id: 'farm',
      name: 'Homestead',
      category: 'ind',
      zone: ZoneType.Agriculture,
      level: 1,
      kind: 'crops',
      footprint: { w: 4, d: 5 },
      height: 9,
      color: 0x7a3a2c,
      residents: 4,
      jobs: 1,
      powerUse: 0.2,
      waterUse: 0,
      cost: 0,
      upkeep: 0,
      unlockMilestone: 0,
    };
    const buildings: BuildingInstance[] = [];
    place(makeGrid(), buildings, 1, 'farm', 0, 0);

    const occupancy = new EconomySystem([...catalog, farm], roadSpecs).occupancy(buildings);
    expect(occupancy.population).toBe(4);
    expect(occupancy.jobs).toEqual({ com: 0, ind: 1 });
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

  it('bills the city every month for the power line it strung', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    for (let x = 0; x < 20; x++) g.powerLine[tileIndex(x, 3)] = 1;

    const sys = new EconomySystem(catalog, roadSpecs);
    const stats = makeStats({ funds: 10000 });
    const { statsPatch } = sys.tick({ g, buildings, stats, tickNo: TICKS_PER_MONTH });

    // Nothing else in this city costs anything: the whole bill is the wire.
    expect(statsPatch.monthlyExpenses).toBeCloseTo(20 * POWER_LINE_UPKEEP_PER_TILE, 6);
  });

  it('charges nothing for a city that strung none', () => {
    const g = makeGrid();
    const sys = new EconomySystem(catalog, roadSpecs);
    const { statsPatch } = sys.tick({
      g,
      buildings: [],
      stats: makeStats({ funds: 10000 }),
      tickNo: TICKS_PER_MONTH,
    });
    expect(statsPatch.monthlyExpenses).toBeCloseTo(0, 6);
  });

  it("books the month's recovered units at the credit once, and takes the tally only at the boundary", () => {
    const g = makeGrid();
    const sys = new EconomySystem(catalog, roadSpecs);
    const stats = makeStats({ funds: 10000 });
    let tally = 1_000_000;
    let takes = 0;
    const takeRecoveredUnits = (): number => {
      takes++;
      const units = tally;
      tally = 0;
      return units;
    };

    const mid = sys.tick({
      g,
      buildings: [],
      stats,
      tickNo: TICKS_PER_MONTH - 1,
      takeRecoveredUnits,
    });
    expect(takes).toBe(0);
    expect(mid.statsPatch.monthlyIncome).toBeUndefined();

    const first = sys.tick({
      g,
      buildings: [],
      stats,
      tickNo: TICKS_PER_MONTH,
      takeRecoveredUnits,
    });
    expect(takes).toBe(1);
    expect(first.statsPatch.monthlyIncome).toBeCloseTo(1_000_000 * RECYCLING_CREDIT_PER_UNIT, 6);

    const next = sys.tick({
      g,
      buildings: [],
      stats,
      tickNo: 2 * TICKS_PER_MONTH,
      takeRecoveredUnits,
    });
    expect(takes).toBe(2);
    expect(next.statsPatch.monthlyIncome).toBeCloseTo(0, 6);
  });

  it("bills the month's regional funerals at ¢3.6 a body as an expense, once, and takes the tally only at the boundary", () => {
    const g = makeGrid();
    const sys = new EconomySystem(catalog, roadSpecs);
    const stats = makeStats({ funds: 10000 });
    let bodies = 10;
    let takes = 0;
    const takeRegionalBodies = (): number => {
      takes++;
      const taken = bodies;
      bodies = 0;
      return taken;
    };

    sys.tick({ g, buildings: [], stats, tickNo: TICKS_PER_MONTH - 1, takeRegionalBodies });
    expect(takes).toBe(0);

    const first = sys.tick({
      g,
      buildings: [],
      stats,
      tickNo: TICKS_PER_MONTH,
      takeRegionalBodies,
    });
    expect(takes).toBe(1);
    expect(REGIONAL_FUNERAL_FEE).toBe(3.6);
    expect(first.statsPatch.monthlyExpenses).toBeCloseTo(10 * 3.6, 9);
    expect(first.statsPatch.monthlyIncome).toBeCloseTo(0, 9);

    const next = sys.tick({
      g,
      buildings: [],
      stats,
      tickNo: 2 * TICKS_PER_MONTH,
      takeRegionalBodies,
    });
    expect(next.statsPatch.monthlyExpenses).toBeCloseTo(0, 9);
  });

  it("charges the transit fleet's running cost with the month's upkeep, and reports it apart", () => {
    const g = makeGrid();
    const sys = new EconomySystem(catalog, roadSpecs);
    const stats = makeStats({ funds: 10000 });
    const buildings: BuildingInstance[] = [];
    place(g, buildings, 1, 'bus-depot', 10, 10);
    const depotUpkeep = busDepot.upkeep;

    const idle = sys.tick({
      g,
      buildings,
      stats,
      tickNo: TICKS_PER_MONTH - 1,
      transitRunning: 320,
    });
    expect(idle.statsPatch.monthlyExpenses).toBeUndefined();
    expect(idle.statsPatch.transitRunning).toBeUndefined();

    const month = sys.tick({ g, buildings, stats, tickNo: TICKS_PER_MONTH, transitRunning: 320 });
    expect(month.statsPatch.transitRunning).toBe(320);
    expect(month.statsPatch.monthlyExpenses).toBeCloseTo(depotUpkeep + 320, 9);
    expect(month.statsPatch.funds).toBeCloseTo(10000 - depotUpkeep - 320, 9);

    // The depot's own upkeep stands whatever the fleet runs.
    const empty = sys.tick({ g, buildings, stats, tickNo: 2 * TICKS_PER_MONTH, transitRunning: 0 });
    expect(empty.statsPatch.transitRunning).toBe(0);
    expect(empty.statsPatch.monthlyExpenses).toBeCloseTo(depotUpkeep, 9);
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

  const active = { state: BuildingState.Active };

  it('taxes an Active residential building: residents x res rate x 12 x land-value factor', () => {
    // Land value 0 -> factor 0.75 (LAND_VALUE_FACTOR_BASE).
    expect(buildingMonthlyTax(resHouse, active, rates, 0)).toBeCloseTo(10 * 0.1 * 12 * 0.75);
    // Land value 255 -> factor 1.25 (base + full span).
    expect(buildingMonthlyTax(resHouse, active, rates, 255)).toBeCloseTo(10 * 0.1 * 12 * 1.25);
  });

  it('taxes only the residents still living there, and nothing on a wholly empty building', () => {
    expect(buildingMonthlyTax(resHouse, { ...active, vacancies: 4 }, rates, 0)).toBeCloseTo(
      6 * 0.1 * 12 * 0.75,
    );
    expect(buildingMonthlyTax(resHouse, { ...active, vacancies: 10 }, rates, 0)).toBe(0);
  });

  it('taxes com and ind buildings on jobs at their sector rates', () => {
    expect(buildingMonthlyTax(comShop, active, rates, 0)).toBeCloseTo(5 * 0.2 * 12 * 0.75);
    expect(buildingMonthlyTax(indYard, active, rates, 0)).toBeCloseTo(3 * 0.3 * 12 * 0.75);
  });

  it('returns 0 for ploppables (services/utilities) regardless of state', () => {
    expect(buildingMonthlyTax(police, active, rates, 255)).toBe(0);
  });

  it('returns 0 for non-Active buildings (Constructing/Abandoned pay no tax)', () => {
    expect(buildingMonthlyTax(resHouse, { state: BuildingState.Constructing }, rates, 128)).toBe(0);
    expect(buildingMonthlyTax(resHouse, { state: BuildingState.Abandoned }, rates, 128)).toBe(0);
  });
});

describe('EconomySystem: a city that loses residents', () => {
  const emptied = (
    id: number,
    vacancies: number,
    buildings: BuildingInstance[],
    g: GridState,
  ): BuildingInstance => {
    const inst = place(g, buildings, id, 'big-res', id, 0);
    inst.vacancies = vacancies;
    return inst;
  };
  const sys = new EconomySystem([...catalog, bigRes], roadSpecs);

  it('sums the residents still living in each building', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    emptied(1, 100, buildings, g);
    emptied(2, 500, buildings, g);
    expect(sys.occupancy(buildings).population).toBe(400);
  });

  it('collects no rent on empty flats: income follows the occupied residents', () => {
    const rentOf = (vacancies: number): number => {
      const g = makeGrid();
      const buildings: BuildingInstance[] = [];
      emptied(1, vacancies, buildings, g);
      const { statsPatch } = sys.tick({
        g,
        buildings,
        stats: makeStats({ funds: 0, milestoneLevel: 5 }),
        tickNo: TICKS_PER_MONTH,
        taxMultiplier: () => 2,
      });
      return (statsPatch.monthlyIncome ?? 0) + (statsPatch.monthlyExpenses ?? 0);
    };
    const full = rentOf(0);
    expect(rentOf(250)).toBeCloseTo(full / 2, 6);
    expect(rentOf(500)).toBeCloseTo(0, 6);
  });

  it('never lowers the milestone level when the city shrinks below its threshold', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    emptied(1, 450, buildings, g); // 50 left, under MILESTONES[1].population (400)
    const stats = makeStats({ milestoneLevel: 1, funds: 777 });
    const { statsPatch, notifications } = sys.tick({ g, buildings, stats, tickNo: 1 });
    expect(statsPatch.population).toBe(50);
    expect(statsPatch.milestoneLevel).toBe(1);
    expect(statsPatch.funds).toBe(777);
    expect(notifications).toHaveLength(0);
  });

  it('reports 0 progress, not a negative or invented figure, below the threshold it stands on', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    emptied(1, 450, buildings, g);
    const { statsPatch } = sys.tick({
      g,
      buildings,
      stats: makeStats({ milestoneLevel: 1 }),
      tickNo: 1,
    });
    expect(statsPatch.milestoneProgress).toBe(0);
  });
});
