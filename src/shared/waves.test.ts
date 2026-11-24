import { describe, expect, it } from 'vitest';
import { SEA_LEVEL, TILE_METERS } from './constants';
import { deriveWaterBodies, sampleWater, type WaterSample } from './waterbodies';
import {
  BREAKING_RATIO,
  DESIGN_WIND_MPS,
  SWELL_BAND,
  SWELL_TRAINS,
  WAVE_TRAINS,
  WIND_BANDS,
  deepWaterLength,
  pixelFade,
  smbHeight,
  smbPeriod,
  surfaceHeightAt,
  swellHeightAt,
  waveSlopeAt,
} from './waves';

const TWO_PI_OVER = (v: number): number => (2 * Math.PI) / v;

const calm = (fetchM: number): WaterSample => ({
  fetchM,
  swellTau: 0,
  swellSlowX: 0,
  swellSlowZ: 0,
  swellAmp: 0,
  flowX: 0,
  flowZ: 0,
});
/** Seconds per metre of a swell crossing 8 m of water, heading along +x with a slight lean to +z. */
const SLOW_X = 0.1;
const SLOW_Z = 0.03;
/** Open ocean at a point: the swell's arrival time grows linearly along its heading. */
const oceanAt = (x: number, z: number): WaterSample => ({
  fetchM: 20000,
  swellTau: SLOW_X * x + SLOW_Z * z,
  swellSlowX: SLOW_X,
  swellSlowZ: SLOW_Z,
  swellAmp: 1,
  flowX: 0,
  flowZ: 0,
});
const ocean = oceanAt(0, 0);
const noSwell = (s: WaterSample): WaterSample => ({ ...s, swellAmp: 0 });

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
    const without = measuredHs(noSwell(ocean), 100);
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

describe('the train list', () => {
  const windTrains = WAVE_TRAINS.filter((t) => t.band !== SWELL_BAND);
  const swellTrains = WAVE_TRAINS.filter((t) => t.band === SWELL_BAND);

  it('holds four wind trains a band and one swell train a swell period', () => {
    expect(windTrains.length).toBe(WIND_BANDS.length * 4);
    expect(swellTrains.length).toBe(SWELL_TRAINS.length);
  });

  it('spreads the four trains of a band over directions, periods and energy shares', () => {
    const wind = Math.atan2(0.34, 0.94);
    const angles = [-32, -11, 9, 27];
    const periods = [0.88, 0.97, 1.05, 1.13];
    const shares = [0.2, 0.3, 0.3, 0.2];
    WIND_BANDS.forEach((band, i) => {
      const trains = windTrains.filter((t) => t.band === i);
      expect(trains.length).toBe(4);
      trains.forEach((t, j) => {
        const offDeg = ((t.angleRad - wind) * 180) / Math.PI;
        expect(offDeg).toBeCloseTo(angles[j]!, 6);
        expect(TWO_PI_OVER(t.omega)).toBeCloseTo(band.periodS * periods[j]!, 9);
        // Each train's length comes from its own period.
        expect(TWO_PI_OVER(t.wavenumber)).toBeCloseTo(
          deepWaterLength(band.periodS * periods[j]!),
          9,
        );
        expect(t.amplitudeM).toBeCloseTo(band.amplitudeM * Math.sqrt(shares[j]!), 12);
      });
      // The shares add to the whole band's energy.
      const energy = trains.reduce((s, t) => s + t.amplitudeM ** 2, 0);
      expect(energy).toBeCloseTo(band.amplitudeM ** 2, 12);
    });
  });

  it('warps each wind train by its own factor between 0.6 and 1.4, and never a swell train', () => {
    for (const t of windTrains) {
      expect(t.warpScale).toBeGreaterThanOrEqual(0.6);
      expect(t.warpScale).toBeLessThanOrEqual(1.4);
    }
    expect(new Set(windTrains.filter((t) => t.band === 0).map((t) => t.warpScale)).size).toBe(4);
    expect(swellTrains.every((t) => t.warpScale === 0)).toBe(true);
  });

  it('does not let two trains of a band cancel along a fixed stripe', () => {
    // With one shared period the pair would cancel at fixed places for ever; with
    // two periods the sum at one place still swings through its full range.
    const sample = calm(20000);
    let lo = Infinity;
    let hi = -Infinity;
    for (let t = 0; t < 600; t += 0.37) {
      const h = surfaceHeightAt(0, 0, t, sample, 100);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
    expect(hi - lo).toBeGreaterThan(0.3);
  });
});

describe('swellHeightAt', () => {
  it('is the sum of the swell trains riding the arrival time, with no phase warp', () => {
    for (const [x, z, t] of [
      [10, 20, 3],
      [400.5, 97.25, 41.3],
      [-30, 1500, 8],
    ] as const) {
      const sample = { ...oceanAt(x, z), swellAmp: 0.7 };
      let want = 0;
      for (const s of SWELL_TRAINS) {
        const w = (2 * Math.PI) / s.periodS;
        want += s.amplitudeM * 0.7 * Math.sin(w * (sample.swellTau - t) + s.phase);
      }
      expect(swellHeightAt(x, z, t, sample, 100)).toBeCloseTo(want, 9);
    }
  });

  it('runs crests along the way the arrival time grows, at the speed of the water', () => {
    // One crest of the 9.5 s train: where the phase is a multiple of 2 pi at t.
    const train = WAVE_TRAINS.find(
      (tr) => tr.band === SWELL_BAND && tr.omega < 0.7 && tr.omega > 0.6,
    )!;
    const phaseAt = (x: number, t: number): number =>
      train.omega * (oceanAt(x, 0).swellTau - t) + train.phase;
    const speed = 1 / SLOW_X;
    // A crest at x0 at t = 0 is at x0 + speed * dt at dt.
    expect(phaseAt(50 + speed * 4, 4)).toBeCloseTo(phaseAt(50, 0), 9);
  });

  it('is higher at 1.5 m than at 8 m, and never past the breaking ratio of the depth', () => {
    // A straight beach: 8 m deep at the map edge, shoaling to 1.5 m, open to the sea along x.
    const size = 60;
    const water = new Uint8Array(size * size).fill(1);
    const depth = (tx: number): number => 8 - (6.5 * tx) / (size - 1);
    const bodies = deriveWaterBodies(water, size, (tx) => SEA_LEVEL - depth(tx));
    const peak = (tx: number): number => {
      const d = depth(tx);
      const sample = sampleWater(bodies, (tx + 0.5) * TILE_METERS, 30.5 * TILE_METERS);
      let best = 0;
      for (let t = 0; t < 300; t += 0.25) {
        best = Math.max(best, Math.abs(swellHeightAt(0, 0, t, sample, d)));
      }
      return best;
    };
    const deep = peak(0);
    const shallow = peak(size - 1);
    expect(shallow).toBeGreaterThan(deep);
    expect(shallow).toBeLessThanOrEqual(BREAKING_RATIO * 1.5 + 1e-9);
  });

  it('is zero where there is no swell', () => {
    expect(swellHeightAt(5, 6, 7, calm(20000), 100)).toBe(0);
  });

  it('plus the wind part is the whole surface in deep water', () => {
    const wind = surfaceHeightAt(77, 31, 12.5, noSwell(oceanAt(77, 31)), 100);
    expect(swellHeightAt(77, 31, 12.5, oceanAt(77, 31), 100) + wind).toBeCloseTo(
      surfaceHeightAt(77, 31, 12.5, oceanAt(77, 31), 100),
      9,
    );
  });

  it('is capped with the same breaking ratio as the whole surface', () => {
    for (const depth of [0, 0.1, 0.5]) {
      let peak = 0;
      for (let t = 0; t < 200; t += 0.31) {
        peak = Math.max(peak, Math.abs(swellHeightAt(40, 90, t, ocean, depth)));
      }
      // A swell of height 1 m in 0.5 m of water is cut to the ratio times the depth.
      expect(peak).toBeLessThanOrEqual(BREAKING_RATIO * depth * 2.5 + 1e-9);
    }
    expect(Math.abs(swellHeightAt(40, 90, 3, ocean, 0))).toBe(0);
  });
});

describe('waveSlopeAt', () => {
  it('is the gradient of the surface, warp included', () => {
    const e = 0.001;
    for (const at of [oceanAt, (): WaterSample => calm(3000)]) {
      for (const [x, z, t] of [
        [123.4, 56.7, 5.1],
        [900, 40, 17],
      ] as const) {
        const h = (px: number, pz: number): number => surfaceHeightAt(px, pz, t, at(px, pz), 100);
        const dx = (h(x + e, z) - h(x - e, z)) / (2 * e);
        const dz = (h(x, z + e) - h(x, z - e)) / (2 * e);
        const slope = waveSlopeAt(x, z, t, at(x, z), 100);
        expect(slope.x).toBeCloseTo(dx, 4);
        expect(slope.z).toBeCloseTo(dz, 4);
      }
    }
  });

  it('fades a wind train out of the slope as its crests near the pixel grid', () => {
    const sample = calm(20000);
    // Over many points the faded surface carries less slope than the full one.
    let fineEnergy = 0;
    let coarseEnergy = 0;
    for (let p = 0; p < 60; p++) {
      const fine = waveSlopeAt(10 + p * 7.3, 10 + p * 3.1, 2, sample, 100, 3);
      const coarse = waveSlopeAt(10 + p * 7.3, 10 + p * 3.1, 2, sample, 100, 0.01);
      fineEnergy += fine.x ** 2 + fine.z ** 2;
      coarseEnergy += coarse.x ** 2 + coarse.z ** 2;
    }
    expect(fineEnergy).toBeLessThan(coarseEnergy);
    // At 30 m a pixel every wind wave is under two pixels wide: nothing is left.
    const far = waveSlopeAt(10, 10, 2, sample, 100, 30);
    expect(far.x).toBe(0);
    expect(far.z).toBe(0);
  });

  it('keeps the swell slope at any pixel size', () => {
    const far = waveSlopeAt(10, 10, 2, ocean, 100, 5);
    expect(Math.hypot(far.x, far.z)).toBeGreaterThan(0);
  });
});

describe('pixelFade', () => {
  it('is full at four pixels a wavelength, gone at two, and between them in between', () => {
    expect(pixelFade(8, 2)).toBe(1);
    expect(pixelFade(20, 2)).toBe(1);
    expect(pixelFade(4, 2)).toBe(0);
    expect(pixelFade(1, 2)).toBe(0);
    const mid = pixelFade(6, 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
});
