import { describe, it, expect } from 'vitest';
import { DEATH_CARE_MILESTONE, SEWER_MILESTONE } from '../shared/constants';
import { cityIssues, criticalCount, type CityIssue } from './advisor';
import {
  BuildingState,
  Problem,
  type BuildingInstance,
  type CityStats,
  type DeathCareReport,
  type Incident,
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
    sewerSupply: 100,
    sewerDemand: 50,
    waterFouled: 0,
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
    const issues = cityIssues([], healthyStats(), { power: 3, water: 0, sewer: 0 });
    const waiting = issues.find((i) => i.id === 'power-waiting');
    expect(waiting).toBeDefined();
    expect(waiting?.focus).toBeUndefined();
  });
});

describe('buildings held at level 2 by schooling', () => {
  const held = (catalogId: string, overrides: Partial<BuildingInstance> = {}): BuildingInstance =>
    building(Problem.NeedsSchool, { catalogId, level: 2, ...overrides });

  it('counts them by the rungs their zone waits on, one issue per rung set', () => {
    const issues = cityIssues(
      [
        held('res-half-2'),
        held('res-medium-row-2'),
        held('res-high-2'),
        held('mixed-2'),
        held('com-shop-2'),
        held('com-office-2'),
      ],
      healthyStats({ milestoneLevel: 6 }),
    );
    const byId = new Map(issues.map((i) => [i.id, i]));
    expect(byId.get('needs-school-education')?.count).toBe(2);
    expect(byId.get('needs-school-middle-education+high-education')?.count).toBe(3);
    expect(byId.get('needs-school-college-education')?.count).toBe(1);
    expect(byId.get('needs-school-middle-education+high-education')?.title).toContain(
      'a middle school and a high school',
    );
  });

  it('says when a rung the town cannot build yet unlocks, and says nothing of it once it can', () => {
    const early = cityIssues([held('res-high-2')], healthyStats({ milestoneLevel: 1 }));
    expect(early[0]?.detail).toContain('unlock at Big Town');
    const later = cityIssues([held('res-high-2')], healthyStats({ milestoneLevel: 3 }));
    expect(later[0]?.detail).not.toContain('unlock');
  });

  it('points at the lowest-id building whatever order the mirror is in', () => {
    const a = held('res-high-2', { x: 4, z: 5 });
    const b = held('res-high-2', { x: 40, z: 50 });
    const issues = cityIssues([b, a], healthyStats());
    expect(issues[0]?.focus).toEqual({ x: 4, z: 5 });
  });

  it('is only information, and says nothing for industry, which never asks for a school', () => {
    const issues = cityIssues([held('res-high-2')], healthyStats());
    expect(issues[0]?.severity).toBe('info');
    expect(cityIssues([held('ind-workshop-2')], healthyStats())).toEqual([]);
  });

  it('ignores a building still going up', () => {
    expect(
      cityIssues([held('res-high-2', { state: BuildingState.Constructing })], healthyStats()),
    ).toEqual([]);
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
    const issues = cityIssues([], healthyStats(), { power: 4, water: 0, sewer: 0 });
    expect(idsOf(issues)).toEqual(['power-waiting']);
    expect(issues[0]!.severity).toBe('warning');
    expect(issues[0]!.count).toBe(4);
    expect(issues[0]!.detail).toBe(
      '4 new or growing buildings need more power than the grid has spare — build another plant.',
    );
  });

  it('warns for water the same way, in the singular for one', () => {
    const issues = cityIssues([], healthyStats(), { power: 0, water: 1, sewer: 0 });
    expect(idsOf(issues)).toEqual(['water-waiting']);
    expect(issues[0]!.detail).toContain('1 new or growing building needs more water');
  });

  it('warns for a drain the same way, and names the sewage figures when the drains ran out', () => {
    const waiting = cityIssues([], healthyStats(), { power: 0, water: 0, sewer: 2 });
    expect(idsOf(waiting)).toEqual(['sewer-waiting']);
    expect(waiting[0]!.detail).toContain('2 new or growing buildings need more drainage');

    const choked = Problem.NoSewer | Problem.SewerShortage;
    const issues = cityIssues(
      [building(choked), building(Problem.NoSewer)],
      healthyStats({ sewerDemand: 120, sewerSupply: 100 }),
    );
    expect(issues.find((i) => i.id === 'sewer-short')?.count).toBe(1);
    expect(issues.find((i) => i.id === 'sewer-short')?.detail).toContain(
      'makes 120 kL of sewage and drains 100 kL',
    );
    expect(issues.find((i) => i.id === 'no-sewer')?.count).toBe(1);
    // Nothing abandons for a missing sewer, so neither is critical.
    for (const issue of issues) expect(issue.severity).toBe('warning');
  });

  it('says nothing when growth is waiting for none of them', () => {
    expect(cityIssues([], healthyStats(), { power: 0, water: 0, sewer: 0 })).toEqual([]);
  });

  it('tells a town one rung below the sewer milestone, with no drain yet, that it is outgrowing its septic tanks', () => {
    const outgrowing = healthyStats({ milestoneLevel: SEWER_MILESTONE - 1, sewerSupply: 0 });
    const issue = cityIssues([], outgrowing).find((i) => i.id === 'septic-outgrown');
    expect(issue?.severity).toBe('info');
    expect(issue?.detail).toContain('Big Town (3,500 people)');
    expect(issue?.detail).toContain('build a drain pipe');
    // With a drain already built, or on any other rung, it says nothing.
    const quiet = (overrides: Partial<CityStats>): boolean =>
      cityIssues([], healthyStats(overrides)).some((i) => i.id === 'septic-outgrown');
    expect(quiet({ milestoneLevel: SEWER_MILESTONE - 1, sewerSupply: 3785 })).toBe(false);
    expect(quiet({ milestoneLevel: SEWER_MILESTONE - 2, sewerSupply: 0 })).toBe(false);
    expect(quiet({ milestoneLevel: SEWER_MILESTONE, sewerSupply: 0 })).toBe(false);
  });

  it('tells a town one rung below Big Town with no cemetery that the regional funeral service ends there', () => {
    const none = { power: 0, water: 0, sewer: 0 };
    const empty: DeathCareReport = { facilities: [], uncollected: 0, regionalThisMonth: 4 };
    const find = (stats: Partial<CityStats>, report = empty): CityIssue | undefined =>
      cityIssues([], healthyStats(stats), none, none, report).find(
        (i) => i.id === 'funeral-service-ending',
      );

    const issue = find({ milestoneLevel: DEATH_CARE_MILESTONE - 1 });
    expect(issue?.severity).toBe('info');
    expect(issue?.detail).toContain('Big Town (3,500 people)');
    expect(issue?.detail).toContain('build a cemetery');
    // With a cemetery placed, or on any other rung, it says nothing.
    const cemetery = { ...empty, facilities: [{ id: 3, used: 0, total: 780 }] };
    expect(find({ milestoneLevel: DEATH_CARE_MILESTONE - 1 }, cemetery)).toBeUndefined();
    const crematorium = { ...empty, crematoria: [{ id: 4, cremated: 0, room: 8 }] };
    expect(find({ milestoneLevel: DEATH_CARE_MILESTONE - 1 }, crematorium)).toBeUndefined();
    expect(find({ milestoneLevel: DEATH_CARE_MILESTONE - 2 })).toBeUndefined();
    expect(find({ milestoneLevel: DEATH_CARE_MILESTONE })).toBeUndefined();
  });

  it('raises a warning the moment the first body lies uncollected, pointing at it', () => {
    const none = { power: 0, water: 0, sewer: 0 };
    const quiet = { facilities: [], uncollected: 0, regionalThisMonth: 0 };
    expect(cityIssues([], healthyStats(), none, none, quiet)).toEqual([]);

    const one = { ...quiet, uncollected: 1, uncollectedAt: { x: 40, z: 41 } };
    const issues = cityIssues([], healthyStats(), none, none, one);
    expect(idsOf(issues)).toEqual(['bodies-uncollected']);
    expect(issues[0]).toMatchObject({
      severity: 'warning',
      count: 1,
      title: '1 body lies uncollected',
      focus: { x: 40, z: 41 },
    });
    const many = cityIssues([], healthyStats(), none, none, { ...one, uncollected: 3 });
    expect(many[0]!.title).toBe('3 bodies lie uncollected');
  });

  it('raises another for a full cemetery with bodies still waiting, and not for one that is full and idle', () => {
    const none = { power: 0, water: 0, sewer: 0 };
    const full = { id: 3, used: 780, total: 780 };
    const roomy = { id: 4, used: 12, total: 780 };
    const waiting = { facilities: [full, roomy], uncollected: 2, regionalThisMonth: 0 };
    const issues = cityIssues([], healthyStats(), none, none, waiting);
    expect(idsOf(issues).sort()).toEqual(['bodies-uncollected', 'cemetery-full']);
    expect(issues.find((i) => i.id === 'cemetery-full')).toMatchObject({
      severity: 'warning',
      title: 'A cemetery is full',
    });

    const idle = { ...waiting, uncollected: 0 };
    expect(cityIssues([], healthyStats(), none, none, idle)).toEqual([]);
    const notFull = { ...waiting, facilities: [roomy] };
    expect(idsOf(cityIssues([], healthyStats(), none, none, notFull))).toEqual([
      'bodies-uncollected',
    ]);
  });

  it('warns when an intake is drinking fouled water, and names the two remedies', () => {
    const issues = cityIssues([], healthyStats({ waterFouled: 1500 }));
    const fouled = issues.find((i) => i.id === 'intake-fouled');
    expect(fouled?.severity).toBe('warning');
    expect(fouled?.detail).toContain('1500 kL');
    expect(fouled?.detail).toContain('Move the drain pipe');
    expect(fouled?.detail).toContain('treat the sewage');
    expect(
      cityIssues([], healthyStats({ waterFouled: 0 })).some((i) => i.id === 'intake-fouled'),
    ).toBe(false);
  });
});

describe('calls no station has answered', () => {
  const none = { power: 0, water: 0, sewer: 0 };
  const quiet = { facilities: [], uncollected: 0, regionalThisMonth: 0 };
  const issuesFor = (incidents: Incident[]): CityIssue[] =>
    cityIssues([], healthyStats(), none, none, quiet, incidents);

  it('says nothing while every call has a vehicle on the way, or there are none', () => {
    expect(issuesFor([])).toEqual([]);
    expect(
      issuesFor([
        { kind: 'fire', x: 3, z: 4, severity: 0.5, answered: true },
        { kind: 'crime', x: 5, z: 6, severity: 0.2 },
      ]),
    ).toEqual([]);
  });

  it('names the unanswered calls by kind and points at the first', () => {
    const issues = issuesFor([
      { kind: 'fire', x: 3, z: 4, severity: 0.5, answered: false },
      { kind: 'crime', x: 5, z: 6, severity: 0.2, answered: true },
      { kind: 'fire', x: 7, z: 8, severity: 0.9, answered: false },
      { kind: 'medical', x: 9, z: 1, severity: 0.1, answered: false },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      id: 'calls-unanswered',
      severity: 'warning',
      count: 3,
      title: '3 calls stand unanswered: 2 fire, 1 medical',
      focus: { x: 3, z: 4 },
    });
    expect(issues[0]!.detail).toContain('Build a station');
  });

  it('reads in the singular for one call', () => {
    const [issue] = issuesFor([{ kind: 'crime', x: 1, z: 2, severity: 0.5, answered: false }]);
    expect(issue!.title).toBe('1 call stands unanswered: 1 police');
  });
});

describe('zoned land its road brings no power or water', () => {
  const none = { power: 0, water: 0, sewer: 0 };

  it('warns, counts the tiles, says why, and points at the first', () => {
    const issues = cityIssues([], healthyStats(), none, {
      power: 9,
      water: 0,
      sewer: 0,
      powerAt: { x: 71, z: 51 },
    });
    expect(idsOf(issues)).toEqual(['zoned-no-power']);
    expect(issues[0]).toMatchObject({
      severity: 'warning',
      count: 9,
      title: '9 zoned tiles have no power from the road beside them',
      focus: { x: 71, z: 51 },
    });
    expect(issues[0]!.detail).toContain('A gravel road carries no power');
    expect(issues[0]!.detail).toContain('power line');
  });

  it('warns for water the same way, in the singular for one', () => {
    const issues = cityIssues([], healthyStats(), none, {
      power: 0,
      water: 1,
      sewer: 0,
      waterAt: { x: 3, z: 4 },
    });
    expect(idsOf(issues)).toEqual(['zoned-no-water']);
    expect(issues[0]!.title).toBe('1 zoned tile has no water from the road beside it');
    expect(issues[0]!.focus).toEqual({ x: 3, z: 4 });
  });

  it('warns for a sewer the same way, pointing at a shore', () => {
    const issues = cityIssues([], healthyStats(), none, {
      power: 0,
      water: 0,
      sewer: 4,
      sewerAt: { x: 8, z: 9 },
    });
    expect(idsOf(issues)).toEqual(['zoned-no-sewer']);
    expect(issues[0]!.title).toBe('4 zoned tiles have no sewer from the road beside them');
    expect(issues[0]!.detail).toContain('drain pipe');
    expect(issues[0]!.focus).toEqual({ x: 8, z: 9 });
  });

  it('says nothing when every zoned tile beside a road is served', () => {
    expect(cityIssues([], healthyStats(), none, none)).toEqual([]);
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

  it('raises no money problem with unlimited money, in the red or in deficit', () => {
    const none = { power: 0, water: 0, sewer: 0 };
    const broke = cityIssues(
      [],
      healthyStats({ funds: -200, monthlyExpenses: 1500 }),
      none,
      none,
      undefined,
      [],
      true,
    );
    expect(idsOf(broke)).not.toContain('insolvent');
    expect(idsOf(broke)).not.toContain('budget-deficit');

    const deficit = cityIssues(
      [],
      healthyStats({ monthlyExpenses: 1500 }),
      none,
      none,
      undefined,
      [],
      true,
    );
    expect(idsOf(deficit)).not.toContain('budget-deficit');
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
      { power: 2, water: 0, sewer: 0 },
    );
    expect(criticalCount(issues)).toBe(2); // no-power + power-short; waiting is a warning
  });

  it('is zero for a healthy city', () => {
    expect(criticalCount(cityIssues([], healthyStats()))).toBe(0);
  });
});
