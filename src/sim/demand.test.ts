import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import { DEFAULT_TAX_RATE, EMPLOYMENT_RATE } from '../shared/constants';
import type { BuildingCatalogEntry, Sector } from '../shared/types';
import {
  BASE_MULTIPLIER,
  COMMERCIAL_SPAN_JOBS,
  DEMAND_FULL_SHARE,
  FOUNDER_WORKERS,
  INDUSTRIAL_SPAN_JOBS,
  computeDemand,
  housingRoom,
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
  peopleGoingUp?: number;
}

function town(t: Town = {}): DemandInput {
  return {
    population: t.population ?? 0,
    jobs: { com: t.jobsCom ?? 0, ind: t.jobsInd ?? 0 },
    pipeline: { com: t.comGoingUp ?? 0, ind: t.indGoingUp ?? 0 },
    peopleGoingUp: t.peopleGoingUp ?? 0,
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
    expect(at(30)).toBe(1); // 25 short: more than the floor's 16
    expect(at(45)).toBeCloseTo((100 / BASE_MULTIPLIER - 45) / INDUSTRIAL_SPAN_JOBS, 10);
    expect(at(56)).toBeLessThan(0);
  });

  describe('a sector reads full a tenth short, with its zero where it was', () => {
    // Targets big enough that no floor rules: 2,000 basic jobs wanted, 800 local supported.
    const bigInd = (jobsInd: number, taxInd = DEFAULT_TAX_RATE): number =>
      computeDemand(
        town({ population: 7240, jobsInd, taxRates: taxes({ ind: taxInd }) }), // workforce 3620 = 2000 x 1.81
      ).ind;
    const bigCom = (jobsCom: number, taxCom = DEFAULT_TAX_RATE): number =>
      computeDemand(
        town({ population: 4000, jobsInd: 1000, jobsCom, taxRates: taxes({ com: taxCom }) }),
      ).com; // supports 810

    it('keeps the zero of each sector exactly', () => {
      expect(DEMAND_FULL_SHARE).toBe(0.1);
      expect(bigInd(2000)).toBeCloseTo(0, 10);
      expect(bigCom(810)).toBeCloseTo(0, 10);
      const balanced = town({ population: 4000, jobsInd: 1000, jobsCom: 1000 }); // jobs = workforce
      expect(computeDemand(balanced).res).toBeCloseTo(FOUNDER_WORKERS / 200, 10);
      expect(housingRoom(balanced)).toBeCloseTo(FOUNDER_WORKERS / EMPLOYMENT_RATE, 6);
    });

    it('reads 1 a tenth short and in proportion short of that', () => {
      expect(bigInd(1800)).toBeCloseTo(1, 10);
      expect(bigInd(1900)).toBeCloseTo(0.5, 10);
      expect(bigInd(1000)).toBe(1);
      expect(bigInd(2100)).toBeCloseTo(-0.5, 10);
      expect(bigCom(729)).toBeCloseTo(1, 10);
      expect(bigCom(770)).toBeCloseTo(0.5, 1);
      // Homes: a tenth of the workforce short of housing.
      const homes = (jobs: number): number =>
        computeDemand(town({ population: 40_000, jobsInd: jobs / 2, jobsCom: jobs / 2 })).res;
      expect(homes(20_000 - FOUNDER_WORKERS + 2000)).toBeCloseTo(1, 10);
      expect(homes(20_000 - FOUNDER_WORKERS + 1000)).toBeCloseTo(0.5, 10);
      expect(homes(20_000 - FOUNDER_WORKERS)).toBeCloseTo(0, 10);
    });

    it('empties the bar a tenth over, or a floor’s worth over in a tiny town, and not before', () => {
      expect(bigInd(2100)).toBeGreaterThan(-1); // 5% over
      expect(bigInd(2200)).toBe(-1); // a tenth over
      expect(bigCom(810 + 40)).toBeGreaterThan(-1);
      expect(bigCom(810 + 81)).toBe(-1);
      const tiny = (over: number): number =>
        computeDemand(town({ population: 20, jobsInd: 10 / BASE_MULTIPLIER + over })).ind;
      expect(tiny(INDUSTRIAL_SPAN_JOBS - 1)).toBeGreaterThan(-1);
      expect(tiny(INDUSTRIAL_SPAN_JOBS)).toBe(-1);
    });

    it('moves the zero by the same jobs a tax point always did', () => {
      // Each point of tax above the default moves the zero 4% of max(floor, target).
      expect(bigInd(2000 - 0.04 * 2000, DEFAULT_TAX_RATE + 0.01)).toBeCloseTo(0, 10);
      expect(bigCom(810 - 0.04 * 810, DEFAULT_TAX_RATE + 0.01)).toBeCloseTo(0, 10);
      // And in a town a floor rules, the floor's jobs.
      const tiny = computeDemand(
        town({
          population: 20,
          jobsInd: 10 / BASE_MULTIPLIER - 0.04 * INDUSTRIAL_SPAN_JOBS,
          taxRates: taxes({ ind: DEFAULT_TAX_RATE + 0.01 }),
        }),
      );
      expect(tiny.ind).toBeCloseTo(0, 10);
    });

    it('leaves the housing room, and the job rooms, as they were', () => {
      const base = town({ population: 2000, jobsInd: 600, jobsCom: 500, happiness: 80 });
      expect(housingRoom(base)).toBeCloseTo(
        (1100 + FOUNDER_WORKERS - 1000 + (30 / 150) * 1000) / EMPLOYMENT_RATE,
        6,
      );
    });
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
    // A tenth of 500 workers is under the 200 floor: it reads as it always did, 60 over 200.
    expect(demand.res).toBeCloseTo(FOUNDER_WORKERS / 200, 10);
  });

  it('reports the room each business sector has, in jobs, which the spawner reads', () => {
    // 100 open industrial jobs support 81 local ones; 30 shop jobs are open and
    // 10 going up, so there is room for 41 more. The 200-strong workforce calls
    // for 110 basic jobs, 100 open, so 10 more.
    const room = jobRoom({
      population: 400,
      jobs: { com: 30, ind: 100 },
      pipeline: { com: 10, ind: 0 },
      peopleGoingUp: 0,
      taxRates: { res: DEFAULT_TAX_RATE, com: DEFAULT_TAX_RATE, ind: DEFAULT_TAX_RATE },
      happiness: 50,
    });
    expect(room.com).toBeCloseTo(100 * 0.81 - 40, 6);
    expect(room.ind).toBeCloseTo(200 / 1.81 - 100, 6);
  });

  it('reports the housing room in people: where residential demand reads zero, less those housed or going up', () => {
    // 150 + 150 jobs and 60 founders against a 200 workforce: 160 more workers, 320 people.
    const base = town({ population: 400, jobsInd: 150, jobsCom: 150 });
    expect(housingRoom(base)).toBeCloseTo(320, 6);
    // 100 people going up take their 50 workers from it.
    expect(housingRoom({ ...base, peopleGoingUp: 100 })).toBeCloseTo(220, 6);
    // Housing a town's room's worth of people takes demand to zero, and no further.
    const full = { ...base, population: 400 + 320, jobs: { com: 150, ind: 150 } };
    expect(computeDemand({ ...base, peopleGoingUp: 320 }).res).toBeCloseTo((160 - 160) / 200, 10);
    expect(housingRoom(full)).toBeCloseTo(0, 6);
    expect(housingRoom({ ...full, population: full.population + 100 })).toBeLessThan(0);
  });

  it('shrinks the housing room as taxes rise and happiness falls, and never reads a second formula', () => {
    const base = town({ population: 400, jobsInd: 150, jobsCom: 150 });
    const taxed = { ...base, taxRates: taxes({ res: DEFAULT_TAX_RATE + 0.05 }) };
    const sad = { ...base, happiness: 20 };
    expect(housingRoom(taxed)).toBeLessThan(housingRoom(base));
    expect(housingRoom(sad)).toBeLessThan(housingRoom(base));
    // Room is zero exactly where the unclamped demand is.
    const input = { ...base, happiness: 50 - 150 * 0.8 };
    expect(computeDemand(input).res).toBeCloseTo(0, 10);
    expect(housingRoom(input)).toBeCloseTo(0, 6);
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
    expect(idle.res).toBeCloseTo((FOUNDER_WORKERS - 200) / 200, 10);
    const hiring = computeDemand(town({ population: 400, jobsInd: 150, jobsCom: 150 }));
    expect(hiring.res).toBeCloseTo((FOUNDER_WORKERS + 100) / 200, 10);
  });

  it('keeps the founders a fixed 60 workers: a town under 400 reads as it did, a larger one no longer idles a share', () => {
    expect(FOUNDER_WORKERS).toBe(60);
    // 400 people with the workforce's 200 jobs filled: the old 0.3 and the 60 agree.
    expect(computeDemand(town({ population: 0 })).res).toBeCloseTo(0.3, 10);
    const filled = town({ population: 4000, jobsInd: 1000, jobsCom: 1000 });
    expect(computeDemand(filled).res).toBeCloseTo(FOUNDER_WORKERS / 200, 10);
  });

  it('counts the workers of homes going up as housed', () => {
    const base = town({ population: 400, jobsInd: 150, jobsCom: 150 });
    const building = computeDemand({ ...base, peopleGoingUp: 100 }); // 50 workers
    expect(building.res).toBeCloseTo((FOUNDER_WORKERS + 100 - 50) / 200, 10);
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

  // Homes read on a narrow scale, so the town sits near balance for the tax to show.
  const nearBalance = town({ population: 2000, jobsInd: 500, jobsCom: 460 });

  it.each(['res', 'com', 'ind'] as const)('lowers %s demand as its tax rate rises', (sector) => {
    const town_ = sector === 'res' ? nearBalance : base;
    const low = computeDemand({ ...town_, taxRates: taxes({ [sector]: DEFAULT_TAX_RATE }) });
    const high = computeDemand({ ...town_, taxRates: taxes({ [sector]: 0.29 }) });
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
