import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import { DEFAULT_TAX_RATE } from '../shared/constants';
import type { BuildingCatalogEntry, Sector } from '../shared/types';
import {
  BASE_MULTIPLIER,
  COMMERCIAL_SPAN_JOBS,
  INDUSTRIAL_SPAN_JOBS,
  computeDemand,
  jobRoom,
  type DemandInput,
} from './demand';

function taxes(overrides: Partial<Record<Sector, number>> = {}): Record<Sector, number> {
  return {
    res: DEFAULT_TAX_RATE,
    com: DEFAULT_TAX_RATE,
    ind: DEFAULT_TAX_RATE,
    ...overrides,
  };
}

interface Town {
  population?: number;
  jobsCom?: number;
  jobsInd?: number;
  comGoingUp?: number;
  indGoingUp?: number;
  taxRates?: Record<Sector, number>;
  happiness?: number;
}

function town(t: Town = {}): DemandInput {
  return {
    population: t.population ?? 0,
    jobs: { com: t.jobsCom ?? 0, ind: t.jobsInd ?? 0 },
    pipeline: { com: t.comGoingUp ?? 0, ind: t.indGoingUp ?? 0 },
    taxRates: t.taxRates ?? taxes(),
    happiness: t.happiness ?? 50,
  };
}

describe('computeDemand: economic base', () => {
  it("lets a new town's founders arrive first, before there is work or trade", () => {
    const demand = computeDemand(town());
    expect(demand.res).toBeGreaterThan(0);
    expect(demand.com).toBe(0);
    expect(demand.ind).toBe(0);
  });

  it('wants industry, not shops, from a town with people and no industry', () => {
    // 84 residents, a workforce of 42 and 46 shop jobs: the reported town.
    const demand = computeDemand(town({ population: 84, jobsCom: 46 }));
    expect(demand.ind).toBe(1);
    expect(demand.com).toBe(-1);
  });

  it('calls for the basic jobs that, with the local jobs they support, employ the workforce', () => {
    // A workforce of 100 calls for 100 / 1.81 = 55.2 basic jobs.
    const at = (jobsInd: number): number => computeDemand(town({ population: 200, jobsInd })).ind;
    expect(at(0)).toBe(1);
    expect(at(30)).toBeCloseTo((100 / BASE_MULTIPLIER - 30) / (100 / BASE_MULTIPLIER), 10);
    expect(at(56)).toBeLessThan(0);
  });

  it('supports 0.81 local jobs for every industrial job', () => {
    const at = (jobsCom: number): number =>
      computeDemand(town({ population: 400, jobsInd: 100, jobsCom })).com;
    expect(at(0)).toBe(1);
    expect(at(81)).toBeCloseTo(0, 10);
    expect(at(100)).toBeLessThan(0);
  });

  it('counts the jobs still going up, so a spurt of building does not overshoot', () => {
    // 100 industrial jobs support 81 local ones; 60 are open and 21 on the way.
    const shops = computeDemand(
      town({ population: 400, jobsInd: 100, jobsCom: 60, comGoingUp: 21 }),
    );
    expect(shops.com).toBeCloseTo(0, 10);
    // A workforce of 100 calls for 55.2 basic jobs; 40 open and 16 on the way is enough.
    const mills = computeDemand(town({ population: 200, jobsInd: 40, indGoingUp: 16 }));
    expect(mills.ind).toBeLessThan(0);
    // What is only going up supports no shops yet: wages come when it opens.
    expect(computeDemand(town({ population: 200, indGoingUp: 50 })).com).toBe(0);
  });

  it('supports no shops in a town without industry, however many live in it', () => {
    expect(computeDemand(town({ population: 5000 })).com).toBe(0);
    expect(computeDemand(town({ population: 5000, jobsCom: 12 })).com).toBe(-1);
  });

  it('reads a whole small factory or corner shop short as full demand, and less as less', () => {
    // A tiny town calls for fewer basic jobs than one factory holds.
    const tiny = computeDemand(town({ population: 20 })); // workforce 10 -> 5.5 basic jobs
    expect(tiny.ind).toBeCloseTo(10 / BASE_MULTIPLIER / INDUSTRIAL_SPAN_JOBS, 10);
    const oneJob = computeDemand(town({ population: 40, jobsInd: 1 })); // supports 0.81 local
    expect(oneJob.com).toBeCloseTo((BASE_MULTIPLIER - 1) / COMMERCIAL_SPAN_JOBS, 10);
  });

  it('settles a balanced town: basic and local jobs filled, the workforce employed, households still coming', () => {
    const population = 1000; // workforce 500
    const jobsInd = 500 / BASE_MULTIPLIER;
    const jobsCom = jobsInd * (BASE_MULTIPLIER - 1);
    const demand = computeDemand(town({ population, jobsInd, jobsCom }));
    expect(demand.ind).toBeCloseTo(0, 10);
    expect(demand.com).toBeCloseTo(0, 10);
    expect(demand.res).toBeCloseTo(0.3, 10);
  });

  it('reports the room each business sector has, in jobs, which the spawner reads', () => {
    // 100 open industrial jobs support 81 local ones; 30 shop jobs are open and
    // 10 going up, so there is room for 41 more. The 200-strong workforce calls
    // for 110 basic jobs, 100 open, so 10 more.
    const room = jobRoom({
      population: 400,
      jobs: { com: 30, ind: 100 },
      pipeline: { com: 10, ind: 0 },
      taxRates: { res: DEFAULT_TAX_RATE, com: DEFAULT_TAX_RATE, ind: DEFAULT_TAX_RATE },
      happiness: 50,
    });
    expect(room.com).toBeCloseTo(100 * 0.81 - 40, 6);
    expect(room.ind).toBeCloseTo(200 / 1.81 - 100, 6);
  });

  it('reads its spans from the first industrial and commercial buildings in the catalog', () => {
    const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
    expect(INDUSTRIAL_SPAN_JOBS).toBe(catalog.find((e) => e.id === 'ind-1')!.jobs);
    expect(COMMERCIAL_SPAN_JOBS).toBe(catalog.find((e) => e.id === 'com-low-1')!.jobs);
  });
});

describe('computeDemand: people follow work', () => {
  it('turns households away from a workforce with no work, and draws them to empty jobs', () => {
    const idle = computeDemand(town({ population: 400 })); // workforce 200, no jobs
    expect(idle.res).toBeCloseTo(0.3 - 200 / 200, 10);
    const hiring = computeDemand(town({ population: 400, jobsInd: 150, jobsCom: 150 }));
    expect(hiring.res).toBeCloseTo(0.3 + 100 / 200, 10);
  });

  it('increases residential demand as happiness rises', () => {
    const base = town({ population: 2000, jobsInd: 600, jobsCom: 500 });
    const unhappy = computeDemand({ ...base, happiness: 10 });
    const happy = computeDemand({ ...base, happiness: 90 });
    expect(happy.res).toBeGreaterThan(unhappy.res);
  });
});

describe('computeDemand: taxes and bounds', () => {
  const base = town({ population: 2000, jobsInd: 300, jobsCom: 100 });

  it.each(['res', 'com', 'ind'] as const)('lowers %s demand as its tax rate rises', (sector) => {
    const low = computeDemand({ ...base, taxRates: taxes({ [sector]: DEFAULT_TAX_RATE }) });
    const high = computeDemand({ ...base, taxRates: taxes({ [sector]: 0.29 }) });
    expect(high[sector]).toBeLessThan(low[sector]);
  });

  it('clamps all three sectors to the -1..1 range', () => {
    for (const input of [
      town({ population: 100_000, taxRates: taxes({ res: 0, com: 0, ind: 0 }), happiness: 100 }),
      town({
        population: 1000,
        jobsCom: 100_000,
        jobsInd: 100_000,
        taxRates: taxes({ res: 1 }),
        happiness: 0,
      }),
    ]) {
      for (const value of Object.values(computeDemand(input))) {
        expect(value).toBeGreaterThanOrEqual(-1);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });
});
