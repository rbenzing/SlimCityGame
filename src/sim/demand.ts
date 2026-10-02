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
import { DEFAULT_TAX_RATE, workforceOf } from '../shared/constants';
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
 * ind = (workforce / BASE_MULTIPLIER - (ind + ind going up)) / max(INDUSTRIAL_SPAN_JOBS, workforce / BASE_MULTIPLIER)
 *     - (taxInd - DEFAULT_TAX_RATE) * 4
 *   -- the basic jobs that, with the local jobs they support, would employ the workforce
 *
 * com = ((BASE_MULTIPLIER - 1) * ind - (com + com going up)) / max(COMMERCIAL_SPAN_JOBS, (BASE_MULTIPLIER - 1) * ind)
 *     - (taxCom - DEFAULT_TAX_RATE) * 4
 *   -- the local jobs the open basic economy supports: no industry, no shops
 *
 * res = 0.3
 *     + (jobs - workforce) / max(200, population * 0.5)   -- people follow work, either way
 *     + (happiness - 50) / 150                            -- a happier city draws people
 *     - (taxRes - DEFAULT_TAX_RATE) * 4
 *   -- the 0.3 lets a town's founders arrive before there is any work
 *
 * Each clamped to -1..1.
 */
export function computeDemand(input: DemandInput): DemandLevels {
  const { population, jobs: open, pipeline, taxRates, happiness } = input;
  const workforce = workforceOf(population);
  const jobs = open.com + open.ind;
  const basicWanted = workforce / BASE_MULTIPLIER;
  const localSupported = open.ind * (BASE_MULTIPLIER - 1);
  const taxTerm = (sector: Sector): number => (taxRates[sector] - DEFAULT_TAX_RATE) * 4;

  const res = clamp(
    0.3 +
      (jobs - workforce) / Math.max(200, population * 0.5) +
      (happiness - 50) / 150 -
      taxTerm('res'),
    -1,
    1,
  );

  const com = clamp(
    (localSupported - open.com - pipeline.com) / Math.max(COMMERCIAL_SPAN_JOBS, localSupported) -
      taxTerm('com'),
    -1,
    1,
  );

  const ind = clamp(
    (basicWanted - open.ind - pipeline.ind) / Math.max(INDUSTRIAL_SPAN_JOBS, basicWanted) -
      taxTerm('ind'),
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
