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

/** A city with nothing wrong: supply covers demand, books balance, its workforce of 50 employed. */
function healthyStats(overrides: Partial<CityStats> = {}): CityStats {
  return {
    tick: 100,
    funds: 50000,
    monthlyIncome: 1000,
    monthlyExpenses: 500,
    population: 100,
    jobs: 60,
    employed: 50,
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

  it('sends a building a dirt road leaves dark to a power line, and a farm to a dirt road', () => {
    const issues = cityIssues([building(Problem.NoPower | Problem.NoRoad)], healthyStats());
    expect(issues.find((i) => i.id === 'no-power')?.detail).toContain('power line');
    expect(issues.find((i) => i.id === 'no-road')?.detail).toContain('dirt road');
  });

  it('counts the buildings carrying each problem flag', () => {
    const issues = cityIssues(
      [building(Problem.NoPower), building(Problem.NoPower), building(Problem.NoWater)],
      healthyStats(),
    );
    expect(issues.find((i) => i.id === 'no-power')?.count).toBe(2);
    expect(issues.find((i) => i.id === 'no-water')?.count).toBe(1);
  });

  it('counts a stranded generator among the cut-off buildings, like any other', () => {
    const issues = cityIssues(
      [building(Problem.NoRoad, { catalogId: 'water-tower' })],
      healthyStats(),
    );
    const cutOff = issues.find((i) => i.id === 'no-road');
    expect(cutOff?.count).toBe(1);
    expect(cutOff?.focus).toEqual({ x: 10, z: 10 });
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
    const issues = cityIssues([], healthyStats(), { power: 3, water: 0 });
    const waiting = issues.find((i) => i.id === 'power-waiting');
    expect(waiting).toBeDefined();
    expect(waiting?.focus).toBeUndefined();
  });
});

describe('a grid too small for its city', () => {
  const short = Problem.NoPower | Problem.PowerShortage;
  const dry = Problem.NoWater | Problem.WaterShortage;

  it('names the buildings the shortage darkened, with the numbers, and not as a gap', () => {
    const issues = cityIssues(
      [building(short), building(short), building(Problem.NoPower)],
      healthyStats({ powerDemand: 150, powerSupply: 100 }),
    );
    const shortage = issues.find((i) => i.id === 'power-short');
    expect(shortage?.severity).toBe('critical');
    expect(shortage?.count).toBe(2);
    expect(shortage?.detail).toContain('needs 150 MW and makes 100 MW');
    expect(shortage?.detail).toContain('build another plant');
    // Only the building the network does not reach is sent looking for a gap.
    expect(issues.find((i) => i.id === 'no-power')?.count).toBe(1);
  });

  it('does the same for water', () => {
    const issues = cityIssues(
      [building(dry), building(Problem.NoWater)],
      healthyStats({ waterDemand: 480, waterSupply: 400 }),
    );
    expect(issues.find((i) => i.id === 'water-short')?.count).toBe(1);
    expect(issues.find((i) => i.id === 'water-short')?.detail).toContain(
      'needs 480 kL and pumps 400 kL',
    );
    expect(issues.find((i) => i.id === 'no-water')?.count).toBe(1);
  });

  it('keeps naming it while the dark buildings stand abandoned', () => {
    const issues = cityIssues(
      [building(short, { state: BuildingState.Abandoned })],
      healthyStats({ powerDemand: 0.4, powerSupply: 0.35 }),
    );
    expect(idsOf(issues)).toEqual(['power-short']);
  });

  it('reads a small grid in the fractions a turbine deals in, not rounded to nothing', () => {
    const issues = cityIssues(
      [building(short)],
      healthyStats({ powerDemand: 0.4, powerSupply: 0.35 }),
    );
    expect(issues[0]!.detail).toContain('needs 0.4 MW and makes 0.35 MW');
  });

  it('warns while growth waits for supply though nothing is dark yet', () => {
    const issues = cityIssues([], healthyStats(), { power: 4, water: 0 });
    expect(idsOf(issues)).toEqual(['power-waiting']);
    expect(issues[0]!.severity).toBe('warning');
    expect(issues[0]!.count).toBe(4);
    expect(issues[0]!.detail).toBe(
      '4 new or growing buildings need more power than the grid has spare — build another plant.',
    );
  });

  it('warns for water the same way, in the singular for one', () => {
    const issues = cityIssues([], healthyStats(), { power: 0, water: 1 });
    expect(idsOf(issues)).toEqual(['water-waiting']);
    expect(issues[0]!.detail).toContain('1 new or growing building needs more water');
  });

  it('says nothing when growth is waiting for neither', () => {
    expect(cityIssues([], healthyStats(), { power: 0, water: 0 })).toEqual([]);
  });
});

describe('city-wide checks', () => {
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

  // A city of 100 has a workforce of 50: employed is min(50, jobs).

  it('flags unemployment past a quarter of the workforce, with its share of the workforce', () => {
    const issues = cityIssues([], healthyStats({ population: 100, jobs: 35, employed: 35 }));
    const unemployment = issues.find((i) => i.id === 'unemployment');
    expect(unemployment?.title).toBe('30% of the workforce is out of work'); // 15 of 50
  });

  it('tolerates a little unemployment without nagging', () => {
    expect(cityIssues([], healthyStats({ population: 100, jobs: 45, employed: 45 }))).toEqual([]);
  });

  it('reads a workforce with a job each as fully employed, not half out of work', () => {
    // The town that reported "45% of residents are out of work": 84 residents,
    // 42 workers, and more jobs than that.
    const issues = cityIssues([], healthyStats({ population: 84, jobs: 46, employed: 42 }));
    expect(issues).toEqual([]);
  });

  it('says employers cannot find workers once the empty jobs pass a quarter of the workforce', () => {
    const issues = cityIssues([], healthyStats({ population: 84, jobs: 60, employed: 42 }));
    const short = issues.find((i) => i.id === 'labour-short');
    expect(short?.severity).toBe('warning');
    expect(short?.detail).toBe('18 jobs stand empty — zone more housing to grow the workforce.');
    expect(idsOf(issues)).not.toContain('unemployment');
  });

  it('tolerates a few empty jobs', () => {
    expect(cityIssues([], healthyStats({ population: 100, jobs: 60, employed: 50 }))).toEqual([]);
  });

  it('reads one empty job in the singular', () => {
    const issues = cityIssues([], healthyStats({ population: 1, jobs: 1, employed: 0 }));
    expect(issues.find((i) => i.id === 'labour-short')?.detail).toBe(
      '1 job stands empty — zone more housing to grow the workforce.',
    );
  });
});

describe('criticalCount', () => {
  it('counts only the critical issues, for the unopened badge', () => {
    const issues = cityIssues(
      [
        building(Problem.NoPower),
        building(Problem.NoPower | Problem.PowerShortage),
        building(Problem.HighCrime),
        building(Problem.LowDemand),
      ],
      healthyStats({ powerDemand: 500 }),
      { power: 2, water: 0 },
    );
    expect(criticalCount(issues)).toBe(2); // no-power + power-short; waiting is a warning
  });

  it('is zero for a healthy city', () => {
    expect(criticalCount(cityIssues([], healthyStats()))).toBe(0);
  });
});
