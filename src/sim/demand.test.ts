import { describe, expect, it } from 'vitest';
import { DEFAULT_TAX_RATE } from '../shared/constants';
import type { Sector } from '../shared/types';
import { computeDemand } from './demand';

function taxes(overrides: Partial<Record<Sector, number>> = {}): Record<Sector, number> {
  return {
    res: DEFAULT_TAX_RATE,
    com: DEFAULT_TAX_RATE,
    ind: DEFAULT_TAX_RATE,
    ...overrides,
  };
}

describe('computeDemand', () => {
  it('is positive for all three sectors in a brand new, empty city', () => {
    const demand = computeDemand({
      population: 0,
      jobs: 0,
      employed: 0,
      taxRates: taxes(),
      happiness: 50,
    });
    expect(demand.res).toBeGreaterThan(0);
    expect(demand.com).toBeGreaterThan(0);
    expect(demand.ind).toBeGreaterThan(0);
  });

  it('clamps all three sectors to the -1..1 range', () => {
    const demand = computeDemand({
      population: 100_000,
      jobs: 0,
      employed: 0,
      taxRates: taxes({ res: 0, com: 0, ind: 0 }),
      happiness: 100,
    });
    expect(demand.res).toBeLessThanOrEqual(1);
    expect(demand.res).toBeGreaterThanOrEqual(-1);
    expect(demand.com).toBeLessThanOrEqual(1);
    expect(demand.com).toBeGreaterThanOrEqual(-1);
    expect(demand.ind).toBeLessThanOrEqual(1);
    expect(demand.ind).toBeGreaterThanOrEqual(-1);

    const saturated = computeDemand({
      population: 1000,
      jobs: 100_000,
      employed: 1000,
      taxRates: taxes({ res: 1 }),
      happiness: 0,
    });
    expect(saturated.res).toBeGreaterThanOrEqual(-1);
    expect(saturated.res).toBeLessThanOrEqual(1);
  });

  it('increases residential demand when there are more unfilled jobs than employed residents', () => {
    const base = { population: 2000, employed: 900, taxRates: taxes(), happiness: 50 };
    const fewJobs = computeDemand({ ...base, jobs: 1000 });
    const manyJobs = computeDemand({ ...base, jobs: 1900 });
    expect(manyJobs.res).toBeGreaterThan(fewJobs.res);
  });

  it('decreases residential demand as the residential tax rate rises', () => {
    const base = { population: 2000, jobs: 1600, employed: 900, happiness: 50 };
    const lowTax = computeDemand({ ...base, taxRates: taxes({ res: DEFAULT_TAX_RATE }) });
    const highTax = computeDemand({ ...base, taxRates: taxes({ res: 0.29 }) });
    expect(highTax.res).toBeLessThan(lowTax.res);
  });

  it('decreases commercial demand as the commercial tax rate rises', () => {
    const base = { population: 2000, jobs: 400, employed: 900, happiness: 50 };
    const lowTax = computeDemand({ ...base, taxRates: taxes({ com: DEFAULT_TAX_RATE }) });
    const highTax = computeDemand({ ...base, taxRates: taxes({ com: 0.29 }) });
    expect(highTax.com).toBeLessThan(lowTax.com);
  });

  it('decreases industrial demand as the industrial tax rate rises', () => {
    const base = { population: 2000, jobs: 800, employed: 900, happiness: 50 };
    const lowTax = computeDemand({ ...base, taxRates: taxes({ ind: DEFAULT_TAX_RATE }) });
    const highTax = computeDemand({ ...base, taxRates: taxes({ ind: 0.29 }) });
    expect(highTax.ind).toBeLessThan(lowTax.ind);
  });

  it('increases commercial demand as population grows relative to commercial jobs', () => {
    const base = { jobs: 500, employed: 900, taxRates: taxes(), happiness: 50 };
    const smallPop = computeDemand({ ...base, population: 1000 });
    const bigPop = computeDemand({ ...base, population: 5000 });
    expect(bigPop.com).toBeGreaterThan(smallPop.com);
  });

  it('increases residential demand as happiness rises', () => {
    const base = { population: 2000, jobs: 1200, employed: 900, taxRates: taxes() };
    const unhappy = computeDemand({ ...base, happiness: 10 });
    const happy = computeDemand({ ...base, happiness: 90 });
    expect(happy.res).toBeGreaterThan(unhappy.res);
  });
});
