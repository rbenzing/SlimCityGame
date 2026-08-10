import { describe, it, expect } from 'vitest';
import { cityIssues, criticalCount, type CityIssue } from './advisor';
import {
  BuildingState,
  Problem,
  type BuildingInstance,
  type CityStats,
  type Sector,
  type ServiceKind,
} from '../shared/types';

/** A city with nothing wrong: supply covers demand, books balance, all employed. */
function healthyStats(overrides: Partial<CityStats> = {}): CityStats {
  return {
    tick: 100,
    funds: 50000,
    monthlyIncome: 1000,
    monthlyExpenses: 500,
    population: 100,
    jobs: 120,
    employed: 100,
    demand: { res: 0, com: 0, ind: 0 },
    happiness: 70,
    powerSupply: 100,
    powerDemand: 50,
    waterSupply: 100,
    waterDemand: 50,
    milestoneLevel: 1,
    milestoneProgress: 0.5,
    loanBalance: 0,
    taxRates: {} as Record<Sector, number>,
    serviceFunding: {} as Record<ServiceKind, number>,
    ...overrides,
  };
}

let nextId = 1;
function building(problems: number, overrides: Partial<BuildingInstance> = {}): BuildingInstance {
  return {
    id: nextId++,
    catalogId: 'res_low_1',
    x: 10,
    z: 10,
    rotation: 0,
    level: 1,
    state: BuildingState.Active,
    problems,
    ...overrides,
  };
}

const idsOf = (issues: CityIssue[]): string[] => issues.map((i) => i.id);

describe('cityIssues', () => {
  it('says nothing when nothing is wrong', () => {
    expect(cityIssues([building(0), building(0)], healthyStats())).toEqual([]);
  });

  it('counts the buildings carrying each problem flag', () => {
    const issues = cityIssues(
      [building(Problem.NoPower), building(Problem.NoPower), building(Problem.NoWater)],
      healthyStats(),
    );
    expect(issues.find((i) => i.id === 'no-power')?.count).toBe(2);
    expect(issues.find((i) => i.id === 'no-water')?.count).toBe(1);
  });

  it('reads every flag on a building that has several at once', () => {
    const issues = cityIssues(
      [building(Problem.NoPower | Problem.NoWater | Problem.HighCrime)],
      healthyStats(),
    );
    expect(idsOf(issues)).toEqual(expect.arrayContaining(['no-power', 'no-water', 'high-crime']));
  });

  it('ignores buildings still under construction — their services are not judged yet', () => {
    const issues = cityIssues(
      [building(Problem.NoPower, { state: BuildingState.Constructing })],
      healthyStats(),
    );
    expect(issues).toEqual([]);
  });

  it('still reports abandoned buildings, which are a symptom worth seeing', () => {
    const issues = cityIssues(
      [building(Problem.NoPower, { state: BuildingState.Abandoned })],
      healthyStats(),
    );
    expect(idsOf(issues)).toContain('no-power');
  });

  it('ranks critical above warning above info', () => {
    const issues = cityIssues(
      [
        building(Problem.LowDemand),
        building(Problem.LowDemand),
        building(Problem.LowDemand),
        building(Problem.HighCrime),
        building(Problem.HighCrime),
        building(Problem.NoPower),
      ],
      healthyStats(),
    );
    expect(idsOf(issues)).toEqual(['no-power', 'high-crime', 'low-demand']);
  });

  it('within a severity, the problem hurting more buildings comes first', () => {
    const issues = cityIssues(
      [
        building(Problem.NoPower),
        building(Problem.NoWater),
        building(Problem.NoWater),
        building(Problem.NoWater),
      ],
      healthyStats(),
    );
    expect(idsOf(issues)).toEqual(['no-water', 'no-power']);
  });

  it('breaks ties in a fixed order, so the list cannot reshuffle under the cursor', () => {
    // Equal counts, equal severity: the rule order decides, every time.
    const make = (): CityIssue[] =>
      cityIssues([building(Problem.NoWater), building(Problem.NoPower)], healthyStats());
    expect(idsOf(make())).toEqual(['no-power', 'no-water']);
    expect(idsOf(make())).toEqual(idsOf(make()));
  });

  it('focuses the lowest-id affected building, whatever order the mirror is in', () => {
    const first = building(Problem.NoPower, { x: 3, z: 4 });
    const later = building(Problem.NoPower, { x: 90, z: 90 });
    const forwards = cityIssues([first, later], healthyStats());
    const backwards = cityIssues([later, first], healthyStats());

    expect(forwards.find((i) => i.id === 'no-power')?.focus).toEqual({ x: 3, z: 4 });
    expect(backwards.find((i) => i.id === 'no-power')?.focus).toEqual({ x: 3, z: 4 });
  });

  it('city-wide issues carry no focus tile — there is no one place to look', () => {
    const issues = cityIssues([], healthyStats({ powerDemand: 200 }));
    expect(issues.find((i) => i.id === 'power-deficit')?.focus).toBeUndefined();
  });
});

describe('city-wide checks', () => {
  it('flags power and water deficits with the actual numbers', () => {
    const issues = cityIssues([], healthyStats({ powerDemand: 150, waterDemand: 150 }));
    expect(idsOf(issues)).toEqual(expect.arrayContaining(['power-deficit', 'water-deficit']));
    expect(issues.find((i) => i.id === 'power-deficit')?.detail).toContain('150 MW of 100 MW');
  });

  it('does not flag a grid that exactly meets demand', () => {
    expect(cityIssues([], healthyStats({ powerDemand: 100, powerSupply: 100 }))).toEqual([]);
  });

  it('reports a deficit as a warning but insolvency as critical', () => {
    const deficit = cityIssues([], healthyStats({ monthlyExpenses: 1500 }));
    expect(deficit[0]!.id).toBe('budget-deficit');
    expect(deficit[0]!.severity).toBe('warning');
    expect(deficit[0]!.detail).toContain('500');

    const broke = cityIssues([], healthyStats({ funds: -200, monthlyExpenses: 1500 }));
    expect(broke[0]!.id).toBe('insolvent');
    expect(broke[0]!.severity).toBe('critical');
    // One money problem at a time — being broke supersedes running a deficit.
    expect(idsOf(broke)).not.toContain('budget-deficit');
  });

  it('says nothing about jobs on an empty map', () => {
    const issues = cityIssues([], healthyStats({ population: 0, jobs: 0, employed: 0 }));
    expect(idsOf(issues)).not.toContain('no-jobs');
    expect(idsOf(issues)).not.toContain('unemployment');
  });

  it('flags a city with residents but no jobs at all', () => {
    const issues = cityIssues([], healthyStats({ population: 50, jobs: 0, employed: 0 }));
    expect(idsOf(issues)).toContain('no-jobs');
  });

  it('flags unemployment past a quarter of the population, with the percentage', () => {
    const issues = cityIssues([], healthyStats({ population: 100, jobs: 100, employed: 60 }));
    const unemployment = issues.find((i) => i.id === 'unemployment');
    expect(unemployment?.title).toContain('40%');
  });

  it('tolerates a little unemployment without nagging', () => {
    expect(cityIssues([], healthyStats({ population: 100, jobs: 100, employed: 90 }))).toEqual([]);
  });

  it('flags a labour shortage only when industry actually wants to grow', () => {
    const noDemand = healthyStats({ population: 100, jobs: 100, employed: 100 });
    expect(idsOf(cityIssues([], noDemand))).not.toContain('labour-short');

    const wantsToGrow = healthyStats({
      population: 100,
      jobs: 100,
      employed: 100,
      demand: { res: 0, com: 0, ind: 0.5 },
    });
    expect(idsOf(cityIssues([], wantsToGrow))).toContain('labour-short');
  });
});

describe('criticalCount', () => {
  it('counts only the critical issues, for the unopened badge', () => {
    const issues = cityIssues(
      [building(Problem.NoPower), building(Problem.HighCrime), building(Problem.LowDemand)],
      healthyStats({ powerDemand: 500 }),
    );
    expect(criticalCount(issues)).toBe(2); // no-power + power-deficit
  });

  it('is zero for a healthy city', () => {
    expect(criticalCount(cityIssues([], healthyStats()))).toBe(0);
  });
});
