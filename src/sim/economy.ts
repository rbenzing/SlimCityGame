/**
 * Economy & progression.
 *
 * Every tick: population/jobs/employed are aggregated from Active building
 * instances. On month boundaries, tax income and upkeep/loan expenses are
 * settled against funds, and budget notifications fire when funds run low.
 * Milestones level up as soon as population crosses the next threshold,
 * independent of the month cycle. Loan take/repay are exposed as pure
 * stats-transform helpers for the command layer to call.
 */

import type {
  BuildingCatalogEntry,
  BuildingInstance,
  CityNotification,
  CityStats,
  GridState,
  RoadSpec,
} from '../shared/types';
import { BuildingState, FieldId, RoadTier } from '../shared/types';
import {
  LOAN_MONTHLY_INTEREST,
  MAP_TILES,
  MAX_LOAN,
  MILESTONES,
  TICKS_PER_MONTH,
} from '../shared/constants';

const EMPLOYMENT_RATE = 0.55;
const LAND_VALUE_FACTOR_BASE = 0.75;
const LAND_VALUE_FACTOR_SPAN = 0.5;
const MONTHS_PER_YEAR = 12;
const FUNDS_WARNING_THRESHOLD = 2000;

export interface EconomyTickInput {
  g: GridState;
  buildings: BuildingInstance[];
  stats: CityStats;
  tickNo: number;
  /**
   * Optional per-building district tax multiplier (lowTax/highTax
   * policies). Returns 1 for tiles in no policied district, so with no policy
   * set — and for every caller that omits it — monthly income is byte-for-byte
   * unchanged. The correction is applied on top of the existing aggregate
   * income so the un-policied result never shifts.
   */
  taxMultiplier?: (x: number, z: number) => number;
}

export interface EconomyTickResult {
  statsPatch: Partial<CityStats>;
  notifications: CityNotification[];
}

/**
 * Monthly tax a single building contributes (SelectionInfo.monthlyTax):
 * occupants × sector tax rate × 12 × land-value factor — the
 * same per-occupant formula the monthly settlement in {@link EconomySystem}
 * uses, instantiated with the land value at the building's own tile (the
 * city-wide settlement uses the average over all occupied tiles).
 * 0 for ploppables (service/utility/park) and for non-Active buildings,
 * mirroring how the settlement only counts Active res/com/ind occupants.
 */
export function buildingMonthlyTax(
  entry: BuildingCatalogEntry,
  state: BuildingState,
  taxRates: Record<'res' | 'com' | 'ind', number>,
  landValueByte: number,
): number {
  if (state !== BuildingState.Active) return 0;
  let occupants: number;
  let rate: number;
  if (entry.category === 'res') {
    occupants = entry.residents ?? 0;
    rate = taxRates.res;
  } else if (entry.category === 'com') {
    occupants = entry.jobs ?? 0;
    rate = taxRates.com;
  } else if (entry.category === 'ind') {
    occupants = entry.jobs ?? 0;
    rate = taxRates.ind;
  } else {
    return 0;
  }
  const clamped = Math.max(0, Math.min(255, landValueByte));
  const landValueFactor = LAND_VALUE_FACTOR_BASE + (clamped / 255) * LAND_VALUE_FACTOR_SPAN;
  return occupants * rate * MONTHS_PER_YEAR * landValueFactor;
}

function computeMilestoneProgress(level: number, population: number): number {
  const current = MILESTONES[level];
  const next = MILESTONES[level + 1];
  if (!current || !next) return 1;
  const span = next.population - current.population;
  if (span <= 0) return 1;
  const progress = (population - current.population) / span;
  return Math.max(0, Math.min(1, progress));
}

export class EconomySystem {
  private readonly catalog: Map<string, BuildingCatalogEntry>;
  private readonly roadSpecs: Map<number, RoadSpec>;

  constructor(catalog: BuildingCatalogEntry[], roadSpecs: RoadSpec[]) {
    this.catalog = new Map(catalog.map((c) => [c.id, c] as const));
    this.roadSpecs = new Map<number, RoadSpec>(roadSpecs.map((r) => [r.tier, r]));
  }

  tick(input: EconomyTickInput): EconomyTickResult {
    const { g, buildings, stats, tickNo } = input;
    const notifications: CityNotification[] = [];
    let notificationSlot = 0;
    const nextId = (): number => tickNo * 1000 + notificationSlot++;

    // --- 1. population / jobs / employed, every tick, Active only ---------
    let population = 0;
    let jobsCom = 0;
    let jobsInd = 0;
    for (const b of buildings) {
      if (b.state !== BuildingState.Active) continue;
      const spec = this.catalog.get(b.catalogId);
      if (!spec) continue;
      if (spec.category === 'res') {
        population += spec.residents ?? 0;
        // Mixed housing: a res-category building may carry
        // commercial ground-floor jobs. Count those into commercial jobs so
        // they reach CityStats.jobs / employed / commercial tax income. Pure
        // residential entries have no `jobs` field, so `?? 0` is a no-op there.
        jobsCom += spec.jobs ?? 0;
      } else if (spec.category === 'com') jobsCom += spec.jobs ?? 0;
      else if (spec.category === 'ind') jobsInd += spec.jobs ?? 0;
    }
    const jobs = jobsCom + jobsInd;
    const employed = Math.min(Math.floor(population * EMPLOYMENT_RATE), jobs);

    // --- 2. milestones, every tick (independent of the month cycle) -------
    let funds = stats.funds;
    let milestoneLevel = stats.milestoneLevel;
    while (milestoneLevel + 1 < MILESTONES.length) {
      const next = MILESTONES[milestoneLevel + 1]!;
      if (population < next.population) break;
      milestoneLevel += 1;
      funds += next.reward;
      notifications.push({
        id: nextId(),
        severity: 'info',
        title: 'Milestone reached',
        body: `${next.name} — population ${next.population}+`,
        tick: tickNo,
      });
    }
    const milestoneProgress = computeMilestoneProgress(milestoneLevel, population);

    const statsPatch: Partial<CityStats> = {
      population,
      jobs,
      employed,
      milestoneLevel,
      milestoneProgress,
    };

    // --- 3. monthly income / expenses --------------------------------------
    if (tickNo !== 0 && tickNo % TICKS_PER_MONTH === 0) {
      const landValueField = g.fields[FieldId.LandValue]!;
      let landValueSum = 0;
      let occupiedCount = 0;
      for (let i = 0; i < MAP_TILES; i++) {
        if (g.buildingId[i]! !== 0) {
          landValueSum += landValueField[i]!;
          occupiedCount += 1;
        }
      }
      const avgLandValue = occupiedCount > 0 ? landValueSum / occupiedCount : 0;
      const landValueFactor =
        LAND_VALUE_FACTOR_BASE + (avgLandValue / 255) * LAND_VALUE_FACTOR_SPAN;

      const rawIncome =
        population * stats.taxRates.res * MONTHS_PER_YEAR +
        jobsCom * stats.taxRates.com * MONTHS_PER_YEAR +
        jobsInd * stats.taxRates.ind * MONTHS_PER_YEAR;
      // lowTax/highTax correction: additive per-building delta so the
      // un-policied income (taxMultiplier absent or returning 1) is unchanged.
      let taxCorrection = 0;
      if (input.taxMultiplier) {
        for (const b of buildings) {
          if (b.state !== BuildingState.Active) continue;
          const spec = this.catalog.get(b.catalogId);
          if (!spec) continue;
          let occupants: number;
          let rate: number;
          if (spec.category === 'res') {
            occupants = spec.residents ?? 0;
            rate = stats.taxRates.res;
          } else if (spec.category === 'com') {
            occupants = spec.jobs ?? 0;
            rate = stats.taxRates.com;
          } else if (spec.category === 'ind') {
            occupants = spec.jobs ?? 0;
            rate = stats.taxRates.ind;
          } else {
            continue;
          }
          const mult = input.taxMultiplier(b.x, b.z);
          if (mult !== 1) {
            taxCorrection += occupants * rate * MONTHS_PER_YEAR * landValueFactor * (mult - 1);
          }
        }
      }
      const income = rawIncome * landValueFactor + taxCorrection;

      let buildingUpkeep = 0;
      for (const b of buildings) {
        if (b.state !== BuildingState.Active) continue;
        const spec = this.catalog.get(b.catalogId);
        if (!spec) continue;
        let upkeep = spec.upkeep;
        if (spec.service) upkeep *= stats.serviceFunding[spec.service.kind];
        buildingUpkeep += upkeep;
      }

      const tileCountsByTier = new Map<number, number>();
      for (let i = 0; i < MAP_TILES; i++) {
        const tier = g.roadTier[i]!;
        if (tier === RoadTier.None) continue;
        tileCountsByTier.set(tier, (tileCountsByTier.get(tier) ?? 0) + 1);
      }
      let roadUpkeep = 0;
      for (const [tier, count] of tileCountsByTier) {
        const spec = this.roadSpecs.get(tier);
        if (spec) roadUpkeep += spec.upkeepPerTile * count;
      }

      const loanInterest = stats.loanBalance * LOAN_MONTHLY_INTEREST;
      const expenses = buildingUpkeep + roadUpkeep + loanInterest;

      funds += income - expenses;
      statsPatch.monthlyIncome = income;
      statsPatch.monthlyExpenses = expenses;

      if (funds < 0) {
        notifications.push({
          id: nextId(),
          severity: 'critical',
          title: 'Budget critical',
          body: 'City funds are negative. Bankruptcy risk.',
          tick: tickNo,
        });
      } else if (funds < FUNDS_WARNING_THRESHOLD) {
        notifications.push({
          id: nextId(),
          severity: 'warning',
          title: 'Budget low',
          body: 'City funds are running low.',
          tick: tickNo,
        });
      }
    }

    statsPatch.funds = funds;

    return { statsPatch, notifications };
  }

  applyLoan(stats: CityStats, amount: number): Partial<CityStats> {
    const delta = Math.max(0, Math.min(amount, MAX_LOAN - stats.loanBalance));
    return { loanBalance: stats.loanBalance + delta, funds: stats.funds + delta };
  }

  applyRepay(stats: CityStats, amount: number): Partial<CityStats> {
    const delta = Math.max(0, Math.min(amount, stats.funds, stats.loanBalance));
    return { loanBalance: stats.loanBalance - delta, funds: stats.funds - delta };
  }
}
