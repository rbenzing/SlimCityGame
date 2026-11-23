/**
 * The arithmetic behind the water's foam and light, as pure functions of the
 * numbers the surface shader holds at a pixel. The node graph in water.ts
 * mirrors each one term for term, so a test here is a test of what is drawn.
 * Noise itself is not mirrored: each function takes the noise value it needs.
 * Nothing reads a clock or a random number.
 */

import { WaterKind } from '../shared/waterbodies';
import { BREAKING_RATIO, DESIGN_WIND_MPS } from '../shared/waves';

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (lo: number, hi: number, v: number): number => {
  const t = clamp01((v - lo) / (hi - lo));
  return t * t * (3 - 2 * t);
};
const TWO_PI = Math.PI * 2;

// ---------------------------------------------------------------------------
// Foam
// ---------------------------------------------------------------------------

/** Width of the lapping line on the ground, metres, however steep the bed. Dial. */
export const LAP_WIDTH_M = 0.6;
/** The least depth the lapping line reaches (a vertical bank still shows one) and the most (a pixel across a bank's edge does not flood), metres. */
export const LAP_DEPTH_M = 0.01;
export const LAP_MAX_DEPTH_M = 0.5;
/** Share of the lapping band's width that breathes with the noise. */
export const LAP_BREATH = 0.4;
/** Peak brightness of the lapping band. */
export const LAP_STRENGTH = 0.85;
/** The surf line's centre, in turns of phase past the crest's top, and its half-width. */
export const SURF_LINE_CENTRE_TURNS = 0.03;
export const SURF_LINE_WIDTH_TURNS = 0.035;
/** Seconds a surf trail takes to fade, and its peak brightness against the line's. */
export const SURF_TRAIL_S = 4;
export const SURF_TRAIL_STRENGTH = 0.06;
/** Peak brightness of the surf line itself: under 1, so the sand shows through even at the foam's whitest. */
export const SURF_LINE_STRENGTH = 0.7;
/** The noise (0..1) that lets the surf line show, and the higher noise that lets its trail show: the trail is the more broken. */
export const SURF_LINE_NOISE: readonly [number, number] = [0.3, 0.5];
export const SURF_TRAIL_NOISE: readonly [number, number] = [0.55, 0.75];
/** Peak brightness of a river's foam streaks. */
export const STREAK_STRENGTH = 0.2;
/** The ridge value (1 on a noise zero-crossing) where a streak starts and is whole. */
export const STREAK_RIDGE: readonly [number, number] = [0.85, 0.97];
/** A streak's noise cell, metres along its axis and across it. */
export const STREAK_ALONG_M = 14;
export const STREAK_ACROSS_M = 2.5;
/** The fixed axes (radians) a streak is stretched along; the flow's direction weighs them by |cos| to the power STREAK_AXIS_SHARPNESS. */
export const STREAK_AXES: readonly number[] = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4];
export const STREAK_AXIS_SHARPNESS = 8;
/** The length scale (metres) the streaks' pixel fade is judged at: they fade out as a pixel grows past a quarter of it. */
export const STREAK_WIDTH_FADE_M = 1.2;

/**
 * How far a swell of significant height `swellHeightM` is breaking in water
 * `depthM` deep, 0..1: nothing until it reaches 0.85 of the breaking ratio of
 * the depth, all of it from just past 1 (where the surface cap bites). The
 * height already carries the shoaling lift. Zero for no swell, so never on a lake.
 */
export function surfBreaking(swellHeightM: number, depthM: number): number {
  if (swellHeightM <= 0) return 0;
  return smooth(0.85, 1.05, swellHeightM / (BREAKING_RATIO * Math.max(depthM, 1e-3)));
}

/**
 * The line and the trail of one swell train at a phase (radians): the line a
 * narrow bump just past the crest's top, the trail what the crest left behind,
 * fading out over SURF_TRAIL_S seconds of a period `periodS`.
 */
export function surfCrest(phaseRad: number, periodS: number): { line: number; trail: number } {
  const past = phaseRad / TWO_PI - 0.25;
  const v = past - Math.round(past);
  const d = (v - SURF_LINE_CENTRE_TURNS) / SURF_LINE_WIDTH_TURNS;
  const line = Math.exp(-d * d);
  const ageS = Math.max(-v, 0) * periodS;
  const trail = SURF_TRAIL_STRENGTH * clamp01(1 - ageS / SURF_TRAIL_S) * smooth(0, 0.03, -v);
  return { line, trail };
}

/** Surf foam, 0..1: the breaking share of the strongest line or trail, with `noise01` breaking both into ragged pieces. */
export function surfFoam(breaking: number, line: number, trail: number, noise01: number): number {
  return (
    breaking *
    Math.max(
      SURF_LINE_STRENGTH * line * smooth(SURF_LINE_NOISE[0], SURF_LINE_NOISE[1], noise01),
      trail * smooth(SURF_TRAIL_NOISE[0], SURF_TRAIL_NOISE[1], noise01),
    )
  );
}

/**
 * The depth under which water laps, metres, for a bed that falls `slope` metres
 * of depth per metre along the ground: the depth LAP_WIDTH_M of ground covers,
 * kept between LAP_DEPTH_M and LAP_MAX_DEPTH_M.
 */
export function lapDepthFor(slope: number): number {
  return Math.min(LAP_MAX_DEPTH_M, Math.max(LAP_DEPTH_M, LAP_WIDTH_M * Math.max(0, slope)));
}

/** Lapping foam, 0..1: a band LAP_WIDTH_M wide on the ground (lapDepthFor `slope`), its width breathing with `breath01`. */
export function lapFoam(depthM: number, breath01: number, slope = 0): number {
  const w = lapDepthFor(slope) * (1 - LAP_BREATH + LAP_BREATH * clamp01(breath01));
  return LAP_STRENGTH * (1 - smooth(0.5 * w, w, depthM));
}

/** River foam streak, 0..1: a thin line where `ridge` (1 at a noise zero-crossing, stretched along the flow) peaks, strongest where the current is, none where it is still. */
export function streakFoam(flowShare: number, ridge: number): number {
  const f = clamp01(flowShare);
  return STREAK_STRENGTH * f * f * smooth(STREAK_RIDGE[0], STREAK_RIDGE[1], ridge);
}

// ---------------------------------------------------------------------------
// Reflection and what shows through
// ---------------------------------------------------------------------------

/** Refractive index of water. */
export const WATER_IOR = 1.33;
/** Reflectance looking straight down: ((n - 1) / (n + 1))^2, 0.02. */
export const FRESNEL_F0 = ((WATER_IOR - 1) / (WATER_IOR + 1)) ** 2;

/** Schlick's reflectance at the angle whose cosine to the normal is `cosView`. */
export function schlick(cosView: number): number {
  return FRESNEL_F0 + (1 - FRESNEL_F0) * (1 - clamp01(cosView)) ** 5;
}

/** Where along horizon -> zenith the sky tone sits for a reflected ray rising `rayY` (a unit vector's up part): quick to leave the horizon. */
export function skyBlend(rayY: number): number {
  return Math.sqrt(clamp01(rayY));
}

/** Absorption of pure water per metre, red, green, blue (Pope and Fry 1997 at 650, 550, 450 nm). */
export const ABSORPTION_PER_M: readonly [number, number, number] = [0.34, 0.0565, 0.0092];
/** The share of blue light that still comes back where the bed is called lost. */
export const BED_LOST_TRANSMISSION = 0.02;

/** Depth at which the bed is lost to sight, metres, and the scatter colour, per kind. Dials. */
export const WATER_LOOKS: Readonly<
  Record<number, { bedLostM: number; scatter: readonly [number, number, number] }>
> = {
  [WaterKind.Ocean]: { bedLostM: 8, scatter: [0.03, 0.16, 0.32] },
  [WaterKind.Lake]: { bedLostM: 4, scatter: [0.05, 0.26, 0.26] },
  [WaterKind.River]: { bedLostM: 1.5, scatter: [0.07, 0.19, 0.16] },
};

/** The look of the water of a kind; open water for none. */
export function lookOf(kind: number): { murk: number; scatter: readonly [number, number, number] } {
  const look = WATER_LOOKS[kind] ?? WATER_LOOKS[WaterKind.Ocean]!;
  return { murk: murkFor(look.bedLostM), scatter: look.scatter };
}

/** The murk (per metre, on top of pure water) that leaves BED_LOST_TRANSMISSION of blue light after `bedLostM` straight down. */
export function murkFor(bedLostM: number): number {
  return -Math.log(BED_LOST_TRANSMISSION) / bedLostM - ABSORPTION_PER_M[2];
}

/** Path of the refracted ray through water `depthM` deep, metres; `refractedCos` is its cosine to the vertical. */
export function waterPath(depthM: number, refractedCos: number): number {
  return Math.max(0, depthM) / Math.max(refractedCos, 0.1);
}

/** Share of light left per colour after `pathM` metres of water of `murk` per metre: exp(-(a + m) path). */
export function transmission(pathM: number, murk: number): [number, number, number] {
  return [
    Math.exp(-(ABSORPTION_PER_M[0] + murk) * pathM),
    Math.exp(-(ABSORPTION_PER_M[1] + murk) * pathM),
    Math.exp(-(ABSORPTION_PER_M[2] + murk) * pathM),
  ];
}

/** What is seen through the water: the bed dimmed by the transmission, the lost part replaced by the scatter colour. */
export function seenThrough(
  bed: readonly [number, number, number],
  trans: readonly [number, number, number],
  scatter: readonly [number, number, number],
): [number, number, number] {
  return [
    bed[0] * trans[0] + scatter[0] * (1 - trans[0]),
    bed[1] * trans[1] + scatter[1] * (1 - trans[1]),
    bed[2] * trans[2] + scatter[2] * (1 - trans[2]),
  ];
}

// ---------------------------------------------------------------------------
// Gusts
// ---------------------------------------------------------------------------

/** Patches of ruffled and smooth water: the field's two scales, metres. Dials. */
export const GUST_SCALES_M: readonly [number, number] = [250, 110];
/** How far the gust scale departs from 1 per unit of the field's noise, which seldom passes 0.5. */
export const GUST_GAIN = 1.6;
/** The wind's travel is the gust field's: it drifts at the design wind. */
export const GUST_DRIFT_MPS = DESIGN_WIND_MPS;

/** Scale of the wind waves' slope and the glint's width in a gust field of value `noise` (about -1..1): 0.5 in a calm patch, 1.5 in a ruffled one. */
export function gustScale(noise: number): number {
  return Math.min(1.5, Math.max(0.5, 1 + GUST_GAIN * noise));
}

// ---------------------------------------------------------------------------
// Light on the bed
// ---------------------------------------------------------------------------

/** Depth to which the light net shows on the bed, metres. Dial. */
export const NET_DEPTH_M = 3;
/** Extra brightness of the net's lines at full strength. */
export const NET_GAIN = 0.15;
/** Radians per metre of the net's two sets of lines, how far (metres) a noise value of 1 bends the point they are read at, that noise's frequency (per metre), and the net's wavelength for the pixel fade. */
export const NET_SCALE: readonly [number, number] = [1.9, 2.3];
export const NET_WARP_M = 2;
export const NET_WARP_K = 0.3;
export const NET_WAVELENGTH_M = 0.8;

/** The bright net at a bed point (x, z) and time: two sets of lines read at a point bent by two noise values (`warpX`, `warpZ`, about -1..1), 0..1. */
export function bedNet(x: number, z: number, t: number, warpX: number, warpZ: number): number {
  const qx = x + NET_WARP_M * warpX;
  const qz = z + NET_WARP_M * warpZ;
  const a = Math.sin((qx * 0.8 + qz * 0.6) * NET_SCALE[0] + t * 0.9);
  const b = Math.sin((qx * -0.6 + qz * 0.8) * NET_SCALE[1] - t * 0.8);
  return clamp01((1 - Math.abs(a)) ** 8 + (1 - Math.abs(b)) ** 8);
}

/**
 * Multiplier on the bed's light from the net: 1 beyond NET_DEPTH_M, at night,
 * or where `pixelFade` (1 near, 0 once the net's lines are under a few pixels)
 * has taken it out.
 */
export function bedNetGain(
  net: number,
  depthM: number,
  nightFactor: number,
  pixelFade = 1,
): number {
  const fade = clamp01(1 - depthM / NET_DEPTH_M) * (1 - clamp01(nightFactor)) * clamp01(pixelFade);
  return 1 + NET_GAIN * net * fade;
}
