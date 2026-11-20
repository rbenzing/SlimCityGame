/**
 * RCI demand model: economic base theory.
 *
 * Industry is the basic sector — what the town sells beyond itself and lives
 * by — and commerce the local sector its own people keep in business. Basic
 * jobs call workers in; the wages they bring keep local jobs going; people
 * follow work. Three coupled scalar values in -1..1, one per Sector: positive
 * means the city wants more of that zone, negative that it is oversupplied.
 * Pure function of the current city figures — no state, no randomness.
 */
import catalogData from '../data/catalog.json';
import { DEFAULT_TAX_RATE, EMPLOYMENT_RATE, workforceOf } from '../shared/constants';
import { ZoneType } from '../shared/types';
import type { BuildingCatalogEntry, DemandLevels, Sector } from '../shared/types';
import type { JobsBySector } from './economy';

export interface DemandInput {
  population: number;
  /**
   * Jobs in open buildings: commercial (mixed-use ground floors included) is
   * the local economy, industrial the basic one the town lives by.
   */
  jobs: JobsBySector;
  /** Jobs in buildings still going up, which a developer counts as supply already. */
  pipeline: JobsBySector;
  /** People in homes still going up: housed already, as far as the room for homes goes. */
  peopleGoingUp: number;
  taxRates: Record<Sector, number>;
  happiness: number;
}

/**
 * Total jobs per basic job: the mean economic base multiplier across nearly
 * 200 small US communities (Mulligan 2008). Each basic job supports 0.81 local
 * ones.
 */
export const BASE_MULTIPLIER = 1.81;

const CATALOG = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;

/** The jobs of a zone's first building: the shortfall at which that sector's demand reads full. */
function firstBuildingJobs(zone: ZoneType): number {
  const entry = CATALOG.find((e) => e.zone === zone && e.level === 1);
  if (!entry?.jobs) throw new Error(`demand: no level-1 building with jobs for zone ${zone}`);
  return entry.jobs;
}

/** One small factory's jobs. */
export const INDUSTRIAL_SPAN_JOBS = firstBuildingJobs(ZoneType.Industrial);
/** One corner shop's jobs. */
export const COMMERCIAL_SPAN_JOBS = firstBuildingJobs(ZoneType.ComLow);

const clamp = (value: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, value));

/**
 * The workers who arrive before there is any work: a fixed number, never a
 * share of the town. Equal to the 0.3 of a 200-worker span it replaced, so a
 * town under 400 people reads as it did.
 */
export const FOUNDER_WORKERS = 60;

/** A small town's workforce, in workers: the floor of residential demand's scale. */
const RESIDENTIAL_FLOOR_WORKERS = 200;

/**
 * The share of its target a sector may fall short by before its demand reads
 * full. A dial: a sector a tenth short wants more at full strength, where
 * measured against the whole target a town near balance read 0.01-0.05 and its
 * spawn chance, which follows the value, starved growth. The room bounds
 * the overshoot, so the value only has to say how strongly the city leans.
 */
export const DEMAND_FULL_SHARE = 0.1;

/** What a shortfall is divided by to read it: a tenth of the target, but never less than the floor. */
function fullScale(target: number, floor: number): number {
  return Math.max(floor, target * DEMAND_FULL_SHARE);
}

/** The workers' worth of the happiness and tax pull on residential demand: the workforce, never less than a small town's. */
function residentialSpan(population: number): number {
  return Math.max(RESIDENTIAL_FLOOR_WORKERS, population * EMPLOYMENT_RATE);
}

/**
 * The workers the town still calls for: open jobs and the founders, less the
 * workforce housed and the workers of homes going up, moved by happiness and
 * the residential tax. Residential demand is this over its span; it reads
 * zero where this does.
 */
function workersWanted(input: DemandInput): number {
  const { population, jobs, peopleGoingUp, taxRates, happiness } = input;
  const pull = (happiness - 50) / 150 - (taxRates.res - DEFAULT_TAX_RATE) * 4;
  return (
    jobs.com +
    jobs.ind +
    FOUNDER_WORKERS -
    workforceOf(population) -
    peopleGoingUp * EMPLOYMENT_RATE +
    pull * residentialSpan(population)
  );
}

/**
 * The people the town has room to house: those that take residential demand
 * to zero, less the people already housed or going up. Negative when homes
 * are oversupplied. The spawner reads it so a home opens only where its people
 * fit, where the demand value only says which way the city leans.
 */
export function housingRoom(input: DemandInput): number {
  return workersWanted(input) / EMPLOYMENT_RATE;
}

/**
 * ind = (workforce / BASE_MULTIPLIER - (ind + ind going up)) / max(INDUSTRIAL_SPAN_JOBS, workforce / BASE_MULTIPLIER)
 *     - (taxInd - DEFAULT_TAX_RATE) * 4
 *   -- the basic jobs that, with the local jobs they support, would employ the workforce
 *
 * com = ((BASE_MULTIPLIER - 1) * ind - (com + com going up)) / max(COMMERCIAL_SPAN_JOBS, (BASE_MULTIPLIER - 1) * ind)
 *     - (taxCom - DEFAULT_TAX_RATE) * 4
 *   -- the local jobs the open basic economy supports: no industry, no shops
 *
 * res = (jobs + FOUNDER_WORKERS - workforce - workers of homes going up) / max(200, population * 0.5)
 *                                                         -- people follow work, either way
 *     + (happiness - 50) / 150                            -- a happier city draws people
 *     - (taxRes - DEFAULT_TAX_RATE) * 4
 *   -- the founders arrive before there is any work
 *
 * Each shortfall (the numerator, with the tax moving its zero by 4% per point
 * of the target or floor) is read over max(floor, DEMAND_FULL_SHARE * target)
 * rather than the whole target, so a sector a tenth short reads full. The
 * floors are 200 workers, INDUSTRIAL_SPAN_JOBS and COMMERCIAL_SPAN_JOBS.
 *
 * Each clamped to -1..1.
 */
export function computeDemand(input: DemandInput): DemandLevels {
  const { jobs: open, pipeline, taxRates } = input;
  const workforce = workforceOf(input.population);
  const basicWanted = workforce / BASE_MULTIPLIER;
  const localSupported = open.ind * (BASE_MULTIPLIER - 1);
  const taxTerm = (sector: Sector): number => (taxRates[sector] - DEFAULT_TAX_RATE) * 4;

  const res = clamp(workersWanted(input) / fullScale(workforce, RESIDENTIAL_FLOOR_WORKERS), -1, 1);

  // A tax point moves the zero by 4% of the whole target (or the floor), as it
  // always did, however narrow the scale the value is then read on.
  const com = clamp(
    (localSupported -
      open.com -
      pipeline.com -
      taxTerm('com') * Math.max(COMMERCIAL_SPAN_JOBS, localSupported)) /
      fullScale(localSupported, COMMERCIAL_SPAN_JOBS),
    -1,
    1,
  );

  const ind = clamp(
    (basicWanted -
      open.ind -
      pipeline.ind -
      taxTerm('ind') * Math.max(INDUSTRIAL_SPAN_JOBS, basicWanted)) /
      fullScale(basicWanted, INDUSTRIAL_SPAN_JOBS),
    -1,
    1,
  );

  return { res, com, ind };
}

/**
 * The jobs each business sector still has room for: the local jobs the open
 * industry supports less those open or going up, and the basic jobs the
 * workforce calls for less those open or going up. Negative when a sector is
 * oversupplied. The spawner reads it so a business opens only where its jobs
 * fit, where the demand value above only says which way the city leans.
 */
export function jobRoom(input: DemandInput): JobsBySector {
  const { population, jobs: open, pipeline } = input;
  const workforce = workforceOf(population);
  return {
    com: open.ind * (BASE_MULTIPLIER - 1) - open.com - pipeline.com,
    ind: workforce / BASE_MULTIPLIER - open.ind - pipeline.ind,
  };
}
