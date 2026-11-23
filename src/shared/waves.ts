/**
 * The wave table: wind waves sized by fetch, ocean swell, and the height of
 * the surface at a point and time. One table feeds both the drawn surface and
 * anything that floats, so they always agree. Pure in (x, z, t).
 */

import { WIND_TOWARD, type WaterSample } from './waterbodies';

const GRAVITY = 9.81;
const TWO_PI = Math.PI * 2;
const DEG = Math.PI / 180;

/** Wind speed every wave is sized for. */
export const DESIGN_WIND_MPS = 7;
/** Waves never grow past this fraction of the depth they travel in. */
export const BREAKING_RATIO = 0.8;

// Positional phase warp: a slow positional sine field added to every wave
// phase bends straight wavefronts into wandering curves, which breaks the
// lattice they would otherwise interfere into. Deterministic in (x, z).
export const PHASE_WARP_TERMS: ReadonlyArray<{
  readonly amplitude: number; // radians of phase shift contributed
  readonly freqX: number; // radians per meter
  readonly freqZ: number;
}> = [
  { amplitude: 2.4, freqX: 0.071, freqZ: 0.113 },
  { amplitude: 1.7, freqX: 0.157, freqZ: -0.089 },
];

/** Deterministic positional phase offset (radians) at world (x, z). Pure. */
export function phaseWarp(x: number, z: number): number {
  let w = 0;
  for (const term of PHASE_WARP_TERMS) {
    w += Math.sin(x * term.freqX + z * term.freqZ) * term.amplitude;
  }
  return w;
}

/** Significant wave height in metres for wind `U` m/s over `F` metres of fetch. */
export function smbHeight(U: number, F: number): number {
  const X = (GRAVITY * F) / (U * U);
  return ((0.283 * U * U) / GRAVITY) * Math.tanh(0.0125 * Math.pow(X, 0.42));
}

/** Peak wave period in seconds for wind `U` m/s over `F` metres of fetch. */
export function smbPeriod(U: number, F: number): number {
  const X = (GRAVITY * F) / (U * U);
  return ((7.54 * U) / GRAVITY) * Math.tanh(0.077 * Math.pow(X, 0.25));
}

/** Deep-water wavelength in metres of a wave of period `T` seconds. */
export function deepWaterLength(T: number): number {
  return (GRAVITY * T * T) / TWO_PI;
}

const BAND_FETCHES_M = [100, 500, 2000, 5000, 20000] as const;
const BAND_SIDE_RAD = 15 * DEG;
// Fixed phase offsets (radians) so the trains never line up.
const BAND_PHASES: ReadonlyArray<readonly [number, number]> = [
  [0.4, 2.1],
  [3.7, 5.2],
  [1.3, 4.4],
  [5.9, 0.9],
  [2.8, 3.3],
];

export interface WindBand {
  readonly fetchM: number;
  readonly prevFetchM: number;
  readonly periodS: number;
  readonly lengthM: number;
  readonly amplitudeM: number;
}

/** The five wind bands, each worked out from the relation at the design wind. */
export const WIND_BANDS: readonly WindBand[] = BAND_FETCHES_M.map((fetchM, i) => {
  const prevFetchM = i === 0 ? 0 : BAND_FETCHES_M[i - 1]!;
  const h = smbHeight(DESIGN_WIND_MPS, fetchM);
  const hPrev = i === 0 ? 0 : smbHeight(DESIGN_WIND_MPS, prevFetchM);
  const periodS = smbPeriod(DESIGN_WIND_MPS, fetchM);
  return {
    fetchM,
    prevFetchM,
    periodS,
    lengthM: deepWaterLength(periodS),
    amplitudeM: Math.sqrt(h * h - hPrev * hPrev) / Math.sqrt(8),
  };
});

export interface SwellTrain {
  readonly periodS: number;
  readonly amplitudeM: number;
  /** Degrees off the swell's direction of travel. */
  readonly angleDeg: number;
  readonly phase: number;
}

export const SWELL_TRAINS: readonly SwellTrain[] = [
  { periodS: 8, amplitudeM: 0.25, angleDeg: -12, phase: 1.1 },
  { periodS: 9.5, amplitudeM: 0.2, angleDeg: 0, phase: 4.2 },
  { periodS: 11, amplitudeM: 0.15, angleDeg: 12, phase: 2.6 },
];

const windAngle = Math.atan2(WIND_TOWARD.z, WIND_TOWARD.x);

const smooth01 = (v: number): number => {
  const t = Math.min(1, Math.max(0, v));
  return t * t * (3 - 2 * t);
};

/** How much of a band is present at a fetch: 0 up to the previous band's fetch, 1 from its own. */
function bandWeight(band: WindBand, fetchM: number): number {
  return smooth01((fetchM - band.prevFetchM) / (band.fetchM - band.prevFetchM));
}

/**
 * Height of the water surface above sea level at world (x, z) and time `t`
 * seconds, for a water of depth `depthM`. Vertical sines only; the sum is
 * scaled down so its significant height never passes the breaking ratio.
 */
export function surfaceHeightAt(
  x: number,
  z: number,
  t: number,
  sample: WaterSample,
  depthM: number,
): number {
  const warp = phaseWarp(x, z);
  let sum = 0;
  let energy = 0;

  const train = (amplitude: number, periodS: number, angle: number, phase: number): void => {
    if (amplitude === 0) return;
    const k = TWO_PI / deepWaterLength(periodS);
    const omega = TWO_PI / periodS;
    const along = x * Math.cos(angle) + z * Math.sin(angle);
    sum += amplitude * Math.sin(k * along - omega * t + phase + warp);
    energy += (amplitude * amplitude) / 2;
  };

  BAND_PHASES.forEach((phases, i) => {
    const band = WIND_BANDS[i]!;
    const a = (bandWeight(band, sample.fetchM) * band.amplitudeM) / Math.SQRT2;
    train(a, band.periodS, windAngle - BAND_SIDE_RAD, phases[0]);
    train(a, band.periodS, windAngle + BAND_SIDE_RAD, phases[1]);
  });

  const exposure = Math.min(1, Math.hypot(sample.swellX, sample.swellZ));
  if (exposure > 0) {
    const swellAngle = Math.atan2(sample.swellZ, sample.swellX);
    for (const s of SWELL_TRAINS) {
      train(s.amplitudeM * exposure, s.periodS, swellAngle + s.angleDeg * DEG, s.phase);
    }
  }

  const significant = 4 * Math.sqrt(energy);
  const limit = BREAKING_RATIO * Math.max(0, depthM);
  return significant > limit ? (sum * limit) / significant : sum;
}
