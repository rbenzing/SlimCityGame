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
export function bandWeight(band: WindBand, fetchM: number): number {
  return smooth01((fetchM - band.prevFetchM) / (band.fetchM - band.prevFetchM));
}

/** `band` of a train that belongs to the ocean swell rather than a wind band. */
export const SWELL_BAND = -1;

/** The two trains of a wind band run at these multiples of its period, so they never hold fixed stripes. */
const PAIR_PERIOD_FACTORS = [0.94, 1.06] as const;

/** One sine of the surface at its full weight. The drawn surface and the height of anything afloat are both built from the list of these. */
export interface WaveTrain {
  /** Index into WIND_BANDS, or SWELL_BAND. */
  readonly band: number;
  /** Metres at full weight. */
  readonly amplitudeM: number;
  /** Radians per metre. */
  readonly wavenumber: number;
  /** Radians per second. */
  readonly omega: number;
  /** Wind trains: world direction of travel in radians. Swell trains: offset from the swell's own direction. */
  readonly angleRad: number;
  readonly phase: number;
  /** Whether the positional phase warp bends this train's crests. Swell is long-crested and takes none. */
  readonly warped: boolean;
}

const makeTrain = (
  band: number,
  amplitudeM: number,
  periodS: number,
  angleRad: number,
  phase: number,
  warped: boolean,
): WaveTrain => ({
  band,
  amplitudeM,
  wavenumber: TWO_PI / deepWaterLength(periodS),
  omega: TWO_PI / periodS,
  angleRad,
  phase,
  warped,
});

/** Every train of the surface: two a wind band, then one a swell period. */
export const WAVE_TRAINS: readonly WaveTrain[] = [
  ...WIND_BANDS.flatMap((band, i) => {
    const a = band.amplitudeM / Math.SQRT2;
    const phases = BAND_PHASES[i]!;
    return [
      makeTrain(
        i,
        a,
        band.periodS * PAIR_PERIOD_FACTORS[0],
        windAngle - BAND_SIDE_RAD,
        phases[0],
        true,
      ),
      makeTrain(
        i,
        a,
        band.periodS * PAIR_PERIOD_FACTORS[1],
        windAngle + BAND_SIDE_RAD,
        phases[1],
        true,
      ),
    ];
  }),
  ...SWELL_TRAINS.map((s) =>
    makeTrain(SWELL_BAND, s.amplitudeM, s.periodS, s.angleDeg * DEG, s.phase, false),
  ),
];

/** How much of a swell a sample carries, 0..1: the length of its swell vector. */
export function swellExposure(sample: WaterSample): number {
  return Math.min(1, Math.hypot(sample.swellX, sample.swellZ));
}

/** The share of a train's full amplitude present at a sample. */
export function trainWeight(train: WaveTrain, sample: WaterSample): number {
  return train.band === SWELL_BAND
    ? swellExposure(sample)
    : bandWeight(WIND_BANDS[train.band]!, sample.fetchM);
}

/** World direction of a train at a sample: a wind train's own, a swell train's turned off the swell's direction. */
function trainDirection(train: WaveTrain, sample: WaterSample): { x: number; z: number } {
  const angle =
    train.band === SWELL_BAND
      ? Math.atan2(sample.swellZ, sample.swellX) + train.angleRad
      : train.angleRad;
  return { x: Math.cos(angle), z: Math.sin(angle) };
}

/** Factor that scales the whole sum so its significant height never passes the breaking ratio of the depth. */
export function breakingScale(energy: number, depthM: number): number {
  const significant = 4 * Math.sqrt(energy);
  const limit = BREAKING_RATIO * Math.max(0, depthM);
  return significant > limit ? limit / significant : 1;
}

interface TrainSums {
  readonly wind: number;
  readonly swell: number;
  readonly scale: number;
}

function sumTrains(
  x: number,
  z: number,
  t: number,
  sample: WaterSample,
  depthM: number,
): TrainSums {
  const warp = phaseWarp(x, z);
  let wind = 0;
  let swell = 0;
  let energy = 0;
  for (const train of WAVE_TRAINS) {
    const a = train.amplitudeM * trainWeight(train, sample);
    if (a === 0) continue;
    const d = trainDirection(train, sample);
    const phase =
      train.wavenumber * (x * d.x + z * d.z) -
      train.omega * t +
      train.phase +
      (train.warped ? warp : 0);
    const h = a * Math.sin(phase);
    if (train.band === SWELL_BAND) swell += h;
    else wind += h;
    energy += (a * a) / 2;
  }
  return { wind, swell, scale: breakingScale(energy, depthM) };
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
  const s = sumTrains(x, z, t, sample, depthM);
  return (s.wind + s.swell) * s.scale;
}

/**
 * The swell's part of the surface height, under the same breaking cap as the
 * whole: the only part long enough for the mesh to carry.
 */
export function swellHeightAt(
  x: number,
  z: number,
  t: number,
  sample: WaterSample,
  depthM: number,
): number {
  const s = sumTrains(x, z, t, sample, depthM);
  return s.swell * s.scale;
}

/** Wind-wave and ripple detail fades from full at this many pixels a wavelength... */
export const FADE_FULL_PX = 4;
/** ...to nothing at this many. */
export const FADE_GONE_PX = 2;

/** Share of a wave's shading that is kept when its crests are `wavelengthM` apart and a pixel covers `metresPerPixel`. */
export function pixelFade(wavelengthM: number, metresPerPixel: number): number {
  const px = wavelengthM / metresPerPixel;
  return smooth01((px - FADE_GONE_PX) / (FADE_FULL_PX - FADE_GONE_PX));
}

/**
 * Slope (dh/dx, dh/dz) of the surface: the derivative of every train, the
 * phase warp's own gradient included, under the breaking cap. With
 * `metresPerPixel`, a wind train fades out as its crests near the pixel grid.
 * What the shader's normal is built from.
 */
export function waveSlopeAt(
  x: number,
  z: number,
  t: number,
  sample: WaterSample,
  depthM: number,
  metresPerPixel = 0,
): { x: number; z: number } {
  const warp = phaseWarp(x, z);
  let warpGradX = 0;
  let warpGradZ = 0;
  for (const term of PHASE_WARP_TERMS) {
    const c = Math.cos(x * term.freqX + z * term.freqZ) * term.amplitude;
    warpGradX += c * term.freqX;
    warpGradZ += c * term.freqZ;
  }
  let sx = 0;
  let sz = 0;
  let energy = 0;
  for (const train of WAVE_TRAINS) {
    const a = train.amplitudeM * trainWeight(train, sample);
    if (a === 0) continue;
    energy += (a * a) / 2;
    const fade =
      train.band === SWELL_BAND || metresPerPixel <= 0
        ? 1
        : pixelFade(TWO_PI / train.wavenumber, metresPerPixel);
    if (fade === 0) continue;
    const d = trainDirection(train, sample);
    const phase =
      train.wavenumber * (x * d.x + z * d.z) -
      train.omega * t +
      train.phase +
      (train.warped ? warp : 0);
    const c = a * fade * Math.cos(phase);
    sx += c * (train.wavenumber * d.x + (train.warped ? warpGradX : 0));
    sz += c * (train.wavenumber * d.z + (train.warped ? warpGradZ : 0));
  }
  const scale = breakingScale(energy, depthM);
  return { x: sx * scale, z: sz * scale };
}
