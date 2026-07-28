/**
 * Stats charts: a pure ring-buffer recorder over the existing
 * `SimSnapshot.stats` stream. No sim/protocol changes — the integrator calls
 * `history.record(snapshot.stats)` once per snapshot (main.ts), and
 * StatsPanel.tsx reads back `history.samples()` / `history.series(key)` to
 * draw its charts. Deterministic: purely a function of the CityStats values
 * it's fed (no Math.random/Date.now), and bounded by a fixed capacity so it
 * never grows unbounded over a long play session.
 */
import type { CityStats } from '../shared/types';

/** One recorded point in the history, derived from a single CityStats sample. */
export interface StatsSample {
  tick: number;
  population: number;
  funds: number;
  /** monthlyIncome - monthlyExpenses: the net monthly cashflow at this sample. */
  monthlyDelta: number;
  demandRes: number;
  demandCom: number;
  demandInd: number;
  happiness: number;
}

/** Keys StatsPanel can plot/toggle as an independent line series. */
export type StatsSeriesKey =
  'population' | 'funds' | 'monthlyDelta' | 'demandRes' | 'demandCom' | 'demandInd' | 'happiness';

export const STATS_SERIES_KEYS: readonly StatsSeriesKey[] = [
  'population',
  'funds',
  'monthlyDelta',
  'demandRes',
  'demandCom',
  'demandInd',
  'happiness',
];

/** ~a long play session's worth of samples at the UI's snapshot cadence. */
export const DEFAULT_STATS_HISTORY_CAPACITY = 240;

/** Pure projection from a CityStats snapshot to the fields the history tracks. */
export function sampleFromStats(stats: CityStats): StatsSample {
  return {
    tick: stats.tick,
    population: stats.population,
    funds: stats.funds,
    monthlyDelta: stats.monthlyIncome - stats.monthlyExpenses,
    demandRes: stats.demand.res,
    demandCom: stats.demand.com,
    demandInd: stats.demand.ind,
    happiness: stats.happiness,
  };
}

/**
 * Fixed-length ring buffer of StatsSample. Once `record` has been called
 * `capacity` times, each further call evicts the oldest sample. `samples()`
 * / `series()` always return oldest-first, so charts plot left-to-right in
 * time order regardless of where the internal write head currently sits.
 */
export class StatsHistory {
  readonly maxSize: number;
  private buf: (StatsSample | undefined)[];
  private head = 0; // index the NEXT record() will write to
  private count = 0;

  constructor(capacity: number = DEFAULT_STATS_HISTORY_CAPACITY) {
    if (!Number.isFinite(capacity) || capacity < 1) {
      throw new Error(`StatsHistory capacity must be a positive integer, got ${capacity}`);
    }
    this.maxSize = Math.floor(capacity);
    this.buf = new Array(this.maxSize);
  }

  get size(): number {
    return this.count;
  }

  record(stats: CityStats): void {
    this.buf[this.head] = sampleFromStats(stats);
    this.head = (this.head + 1) % this.maxSize;
    this.count = Math.min(this.count + 1, this.maxSize);
  }

  /** All recorded samples, oldest first. */
  samples(): StatsSample[] {
    if (this.count === 0) return [];
    const start = this.count < this.maxSize ? 0 : this.head;
    const out: StatsSample[] = new Array(this.count);
    for (let i = 0; i < this.count; i++) {
      const idx = (start + i) % this.maxSize;
      out[i] = this.buf[idx] as StatsSample;
    }
    return out;
  }

  /** A single series' values, oldest first, aligned index-for-index with samples(). */
  series(key: StatsSeriesKey): number[] {
    return this.samples().map((s) => s[key]);
  }

  /** The most recently recorded sample, or undefined if nothing's been recorded yet. */
  latest(): StatsSample | undefined {
    if (this.count === 0) return undefined;
    const idx = (this.head - 1 + this.maxSize) % this.maxSize;
    return this.buf[idx];
  }

  /** Empties the buffer back to a fresh state (e.g. on new-game/load-save). */
  clear(): void {
    this.buf = new Array(this.maxSize);
    this.head = 0;
    this.count = 0;
  }
}
