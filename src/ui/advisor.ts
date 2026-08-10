/**
 * Advisor: turns thousands of per-building problem flags plus the city's
 * supply/demand numbers into the two or three sentences a player can act on.
 *
 * Toasts report EVENTS ("that build failed"). This reports STATE — what is
 * wrong right now, worst first. Pure: a function of the mirrored building list
 * and the stats block, with no three.js, store or worker anywhere near it, so
 * the entire ranking is testable directly.
 */
import { BuildingState, Problem, type BuildingInstance, type CityStats } from '../shared/types';

export type IssueSeverity = 'critical' | 'warning' | 'info';

export interface CityIssue {
  /** Stable across recomputes, so React keys and the sort never churn. */
  id: string;
  severity: IssueSeverity;
  title: string;
  /** One sentence on what to do about it. */
  detail: string;
  /** Buildings affected; 0 for city-wide issues that are not per-building. */
  count: number;
  /** Where to send the camera, when there is a specific place to look. */
  focus?: { x: number; z: number };
}

/** Snapshots arrive ~10x/s; a list that re-ranks that fast cannot be read. */
export const ADVISOR_REFRESH_SNAPSHOTS = 10;

const SEVERITY_RANK: Record<IssueSeverity, number> = { critical: 0, warning: 1, info: 2 };

/**
 * One entry per problem flag. Order here is the tie-break order within a
 * severity, so it runs roughly "cannot function" -> "unpleasant".
 */
const PROBLEM_RULES: {
  flag: number;
  id: string;
  severity: IssueSeverity;
  title: (count: number) => string;
  detail: string;
}[] = [
  {
    flag: Problem.NoRoad,
    id: 'no-road',
    severity: 'critical',
    title: (n) => `${n} building${n === 1 ? '' : 's'} cut off from the road network`,
    detail: 'Nothing reaches them — connect a road to their frontage.',
  },
  {
    flag: Problem.NoPower,
    id: 'no-power',
    severity: 'critical',
    title: (n) => `${n} building${n === 1 ? '' : 's'} without power`,
    detail: 'Power travels along roads from a plant — check for a gap in the network.',
  },
  {
    flag: Problem.NoWater,
    id: 'no-water',
    severity: 'critical',
    title: (n) => `${n} building${n === 1 ? '' : 's'} without water`,
    detail: 'Add a water tower within reach, or connect the road that carries the supply.',
  },
  {
    flag: Problem.HighCrime,
    id: 'high-crime',
    severity: 'warning',
    title: (n) => `Crime is hurting ${n} building${n === 1 ? '' : 's'}`,
    detail: 'A police station nearby lowers crime and lifts land value.',
  },
  {
    flag: Problem.HighPollution,
    id: 'high-pollution',
    severity: 'warning',
    title: (n) => `Pollution is hurting ${n} building${n === 1 ? '' : 's'}`,
    detail: 'Move heavy industry and incinerators downwind of housing, or add parks.',
  },
  {
    flag: Problem.LowDemand,
    id: 'low-demand',
    severity: 'info',
    title: (n) => `${n} building${n === 1 ? '' : 's'} have no one to fill them`,
    detail: 'Demand for this zone type is soft — check the RCI meter before zoning more.',
  },
];

/** Buildings still going up have not had their services judged yet. */
function countsAsProblem(building: BuildingInstance): boolean {
  return building.state !== BuildingState.Constructing;
}

/**
 * Ranked list of what is wrong with the city. Empty when nothing is — an
 * advisor that invents problems to look busy teaches players to ignore it.
 */
export function cityIssues(
  buildings: Iterable<BuildingInstance>,
  stats: CityStats,
): CityIssue[] {
  const counts = new Map<number, number>();
  const focus = new Map<number, BuildingInstance>();

  for (const building of buildings) {
    if (!countsAsProblem(building)) continue;
    for (const rule of PROBLEM_RULES) {
      if ((building.problems & rule.flag) === 0) continue;
      counts.set(rule.flag, (counts.get(rule.flag) ?? 0) + 1);
      // Lowest id wins, so the same city always points at the same building
      // however the mirror happens to be ordered.
      const held = focus.get(rule.flag);
      if (!held || building.id < held.id) focus.set(rule.flag, building);
    }
  }

  const issues: CityIssue[] = [];

  for (const rule of PROBLEM_RULES) {
    const count = counts.get(rule.flag) ?? 0;
    if (count === 0) continue;
    const at = focus.get(rule.flag);
    issues.push({
      id: rule.id,
      severity: rule.severity,
      title: rule.title(count),
      detail: rule.detail,
      count,
      focus: at ? { x: at.x, z: at.z } : undefined,
    });
  }

  issues.push(...cityWideIssues(stats));

  const order = new Map(PROBLEM_RULES.map((rule, index) => [rule.id, index]));
  return issues.sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (bySeverity !== 0) return bySeverity;
    if (a.count !== b.count) return b.count - a.count; // more buildings hurt = more urgent
    return (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99);
  });
}

/** The problems that live in the totals rather than on any one building. */
function cityWideIssues(stats: CityStats): CityIssue[] {
  const issues: CityIssue[] = [];

  if (stats.powerDemand > stats.powerSupply) {
    issues.push({
      id: 'power-deficit',
      severity: 'critical',
      title: 'The grid cannot meet demand',
      detail: `Using ${Math.round(stats.powerDemand)} MW of ${Math.round(stats.powerSupply)} MW — build another plant.`,
      count: 0,
    });
  }

  if (stats.waterDemand > stats.waterSupply) {
    issues.push({
      id: 'water-deficit',
      severity: 'critical',
      title: 'Water supply is short',
      detail: `Using ${Math.round(stats.waterDemand)} kL of ${Math.round(stats.waterSupply)} kL — add a water tower.`,
      count: 0,
    });
  }

  if (stats.funds < 0) {
    issues.push({
      id: 'insolvent',
      severity: 'critical',
      title: 'The city is in the red',
      detail: 'Raise taxes, cut service funding, or stop building until income recovers.',
      count: 0,
    });
  } else if (stats.monthlyExpenses > stats.monthlyIncome) {
    issues.push({
      id: 'budget-deficit',
      severity: 'warning',
      title: 'Spending more than the city earns',
      detail: `Losing ¢${Math.round(stats.monthlyExpenses - stats.monthlyIncome)}/month — adjust taxes or service funding.`,
      count: 0,
    });
  }

  // Only meaningful once there are people: a brand-new map has no workers and
  // no jobs, and neither is a problem yet.
  if (stats.population > 0) {
    const unemployed = stats.population - stats.employed;
    if (stats.jobs === 0) {
      issues.push({
        id: 'no-jobs',
        severity: 'warning',
        title: 'Nobody in the city is hiring',
        detail: 'Zone commercial or industrial so residents have somewhere to work.',
        count: 0,
      });
    } else if (unemployed > stats.population * 0.25) {
      issues.push({
        id: 'unemployment',
        severity: 'warning',
        title: `${Math.round((unemployed / stats.population) * 100)}% of residents are out of work`,
        detail: 'Zone more commercial and industrial, or connect the jobs that exist to the roads.',
        count: 0,
      });
    } else if (stats.employed >= stats.jobs && stats.demand.ind > 0) {
      issues.push({
        id: 'labour-short',
        severity: 'info',
        title: 'Employers cannot find workers',
        detail: 'Every job is taken — zone more housing to grow the workforce.',
        count: 0,
      });
    }
  }

  return issues;
}

/** Critical issues, for the badge on an unopened panel. */
export function criticalCount(issues: readonly CityIssue[]): number {
  return issues.reduce((total, issue) => total + (issue.severity === 'critical' ? 1 : 0), 0);
}
