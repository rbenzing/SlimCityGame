import { describe, expect, it } from 'vitest';
import type { WaterSample } from './waterbodies';
import {
  BREAKING_RATIO,
  DESIGN_WIND_MPS,
  SWELL_TRAINS,
  WIND_BANDS,
  deepWaterLength,
  smbHeight,
  smbPeriod,
  surfaceHeightAt,
} from './waves';

const calm = (fetchM: number): WaterSample => ({
  fetchM,
  swellX: 0,
  swellZ: 0,
  flowX: 0,
  flowZ: 0,
});
const ocean: WaterSample = { fetchM: 20000, swellX: 1, swellZ: 0, flowX: 0, flowZ: 0 };

/**
 * Significant height measured as four standard deviations of the surface over
 * time and over a spread of points (two trains of one period add or cancel by
 * position, so one point alone is not representative).
 */
function measuredHs(sample: WaterSample, depthM: number): number {
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let p = 0; p < 40; p++) {
    const x = 137 + p * 23.7;
    const z = 52 + p * 41.3;
    for (let t = 0; t < 400; t += 0.1137) {
      const h = surfaceHeightAt(x, z, t, sample, depthM);
      sum += h;
      sumSq += h * h;
      count++;
    }
  }
  const mean = sum / count;
  return 4 * Math.sqrt(sumSq / count - mean * mean);
}

describe('wind bands', () => {
  it('match the spec table', () => {
    expect(WIND_BANDS.map((b) => b.fetchM)).toEqual([100, 500, 2000, 5000, 20000]);
    const amps = [0.022, 0.037, 0.064, 0.081, 0.157];
    const lengths = [1.2, 2.6, 5.0, 7.5, 13.5];
    WIND_BANDS.forEach((b, i) => {
      expect(b.amplitudeM).toBeCloseTo(amps[i]!, 3);
      expect(b.lengthM).toBeCloseTo(lengths[i]!, 1);
    });
  });

  it('follow the fetch-limited relation', () => {
    expect(smbHeight(DESIGN_WIND_MPS, 100)).toBeCloseTo(0.06, 2);
    expect(smbPeriod(DESIGN_WIND_MPS, 100)).toBeCloseTo(0.87, 2);
    expect(deepWaterLength(8)).toBeCloseTo(99.9, 0);
  });
});

describe('surfaceHeightAt', () => {
  it('measures the relation height at fetches 500 and 5000', () => {
    for (const f of [500, 5000]) {
      const hs = measuredHs(calm(f), 100);
      const expected = smbHeight(DESIGN_WIND_MPS, f);
      expect(Math.abs(hs - expected) / expected).toBeLessThan(0.15);
    }
  });

  it('adds about a metre of swell on an ocean sample', () => {
    const swell = SWELL_TRAINS.reduce((s, t) => s + t.amplitudeM ** 2, 0);
    expect(4 * Math.sqrt(swell / 2)).toBeCloseTo(1, 5);
    const withSwell = measuredHs(ocean, 100);
    const without = measuredHs({ ...ocean, swellX: 0 }, 100);
    expect(Math.sqrt(withSwell ** 2 - without ** 2)).toBeGreaterThan(0.85);
    expect(Math.sqrt(withSwell ** 2 - without ** 2)).toBeLessThan(1.15);
  });

  it('is flat on land (no fetch, no swell)', () => {
    expect(surfaceHeightAt(10, 10, 3, calm(0), 5)).toBe(0);
  });

  it('keeps the significant height under the breaking ratio of the depth', () => {
    for (const depth of [0.1, 0.5, 2]) {
      const hs = measuredHs(ocean, depth);
      expect(hs).toBeLessThanOrEqual(BREAKING_RATIO * depth * 1.05);
      // At 2 m the uncapped surface (about 1.15 m) is already under the limit.
      if (depth < 1) expect(hs).toBeGreaterThan(BREAKING_RATIO * depth * 0.8);
    }
  });

  it('gives the same output for the same inputs', () => {
    const a = surfaceHeightAt(12.5, 99, 7.25, ocean, 3);
    const b = surfaceHeightAt(12.5, 99, 7.25, ocean, 3);
    expect(a).toBe(b);
    expect(surfaceHeightAt(12.5, 99, 8.25, ocean, 3)).not.toBe(a);
  });
});
