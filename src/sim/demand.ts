/**
 * RCI demand model.
 *
 * Three coupled scalar values in -1..1, one per Sector. Positive means the
 * city wants more of that zone type; negative means it's oversupplied.
 * Pure function of the current city stats — no state, no randomness.
 */
import { DEFAULT_TAX_RATE } from '../shared/constants';
import type { DemandLevels, Sector } from '../shared/types';

export interface DemandInput {
  population: number;
  jobs: number;
  employed: number;
  taxRates: Record<Sector, number>;
  happiness: number;
}

const clamp = (value: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, value));

/**
 * res = 0.3
 *     + (jobs - employed) / max(200, population * 0.5)   -- unfilled jobs pull residents in
 *     + (happiness - 50) / 150                            -- happier city attracts more residents
 *     - (taxRes - DEFAULT_TAX_RATE) * 4                    -- above-default tax repels residents
 *   clamped to -1..1. The constant 0.3 base plus a neutral (50) happiness
 *   term and default tax rate keeps demand positive for a brand new city.
 *
 * com = (population - jobs * 1.6) / max(400, population)  -- more shoppers than shops
 *     + 0.15                                               -- small positive base
 *     - (taxCom - DEFAULT_TAX_RATE) * 4
 *   clamped to -1..1.
 *
 * ind = 0.4
 *     - employed / max(1, population * 0.55)              -- workforce already absorbed
 *     + (population - jobs) / max(600, population)         -- population outgrowing total jobs
 *     - (taxInd - DEFAULT_TAX_RATE) * 4
 *   clamped to -1..1.
 */
export function computeDemand(input: DemandInput): DemandLevels {
  const { population, jobs, employed, taxRates, happiness } = input;
  const taxRes = taxRates.res;
  const taxCom = taxRates.com;
  const taxInd = taxRates.ind;

  const res = clamp(
    0.3 +
      (jobs - employed) / Math.max(200, population * 0.5) +
      (happiness - 50) / 150 -
      (taxRes - DEFAULT_TAX_RATE) * 4,
    -1,
    1,
  );

  const com = clamp(
    (population - jobs * 1.6) / Math.max(400, population) + 0.15 - (taxCom - DEFAULT_TAX_RATE) * 4,
    -1,
    1,
  );

  const ind = clamp(
    0.4 -
      employed / Math.max(1, population * 0.55) +
      (population - jobs) / Math.max(600, population) -
      (taxInd - DEFAULT_TAX_RATE) * 4,
    -1,
    1,
  );

  return { res, com, ind };
}
