import { describe, expect, it } from 'vitest';
import type { CityStats } from '../shared/types';
import { DEFAULT_STATS_HISTORY_CAPACITY, sampleFromStats, StatsHistory } from './statshistory';

function makeStats(overrides: Partial<CityStats> = {}): CityStats {
  return {
    tick: 0,
    funds: 10_000,
    monthlyIncome: 500,
    monthlyExpenses: 200,
    population: 100,
    jobs: 50,
    employed: 40,
    demand: { res: 0.2, com: -0.1, ind: 0.05 },
    happiness: 70,
    powerSupply: 10,
    powerDemand: 8,
    waterSupply: 10,
    waterDemand: 8,
    milestoneLevel: 1,
    milestoneProgress: 0.3,
    loanBalance: 0,
    taxRates: { res: 0.09, com: 0.09, ind: 0.09 },
    serviceFunding: { police: 1, fire: 1, health: 1, education: 1, park: 1 },
    ...overrides,
  } as CityStats;
}

describe('sampleFromStats', () => {
  it('maps the fields statshistory tracks, including the derived monthly delta', () => {
    const stats = makeStats({
      tick: 7,
      population: 250,
      funds: 12_345,
      monthlyIncome: 800,
      monthlyExpenses: 350,
      happiness: 62,
    });
    const sample = sampleFromStats(stats);
    expect(sample).toEqual({
      tick: 7,
      population: 250,
      funds: 12_345,
      monthlyDelta: 450,
      demandRes: 0.2,
      demandCom: -0.1,
      demandInd: 0.05,
      happiness: 62,
    });
  });
});

describe('StatsHistory', () => {
  it('defaults to DEFAULT_STATS_HISTORY_CAPACITY and starts empty', () => {
    const history = new StatsHistory();
    expect(history.maxSize).toBe(DEFAULT_STATS_HISTORY_CAPACITY);
    expect(history.size).toBe(0);
    expect(history.samples()).toEqual([]);
    expect(history.latest()).toBeUndefined();
  });

  it('records samples in order up to capacity', () => {
    const history = new StatsHistory(5);
    for (let i = 0; i < 3; i++) {
      history.record(makeStats({ tick: i, population: 100 + i }));
    }
    expect(history.size).toBe(3);
    expect(history.samples().map((s) => s.tick)).toEqual([0, 1, 2]);
    expect(history.latest()?.tick).toBe(2);
  });

  it('wraps around, dropping the oldest sample once capacity is exceeded', () => {
    const history = new StatsHistory(3);
    for (let i = 0; i < 5; i++) {
      history.record(makeStats({ tick: i, population: 100 + i }));
    }
    // capacity 3, wrote ticks 0..4 -> only the newest 3 (2,3,4) survive, oldest first
    expect(history.size).toBe(3);
    expect(history.samples().map((s) => s.tick)).toEqual([2, 3, 4]);
    expect(history.latest()?.tick).toBe(4);
  });

  it('exposes per-series arrays aligned with samples() order', () => {
    const history = new StatsHistory(3);
    history.record(makeStats({ tick: 0, population: 100, happiness: 50 }));
    history.record(makeStats({ tick: 1, population: 120, happiness: 55 }));
    history.record(makeStats({ tick: 2, population: 140, happiness: 60 }));
    history.record(makeStats({ tick: 3, population: 160, happiness: 65 })); // evicts tick 0

    expect(history.series('population')).toEqual([120, 140, 160]);
    expect(history.series('happiness')).toEqual([55, 60, 65]);
  });

  it('clear() empties the buffer and resets size/latest', () => {
    const history = new StatsHistory(4);
    history.record(makeStats({ tick: 1 }));
    history.record(makeStats({ tick: 2 }));
    history.clear();
    expect(history.size).toBe(0);
    expect(history.samples()).toEqual([]);
    expect(history.latest()).toBeUndefined();

    // recording after clear behaves like a fresh buffer, not a corrupted wraparound
    history.record(makeStats({ tick: 9 }));
    expect(history.samples().map((s) => s.tick)).toEqual([9]);
  });

  it('rejects a non-positive capacity', () => {
    expect(() => new StatsHistory(0)).toThrow();
    expect(() => new StatsHistory(-1)).toThrow();
  });
});
