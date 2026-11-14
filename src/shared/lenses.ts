/**
 * The colours the lenses and the underground view paint with. The renderers
 * paint from these tables and the on-screen legend reads the same ones, so a
 * legend can never describe a colour the map does not use.
 */

import type { LensId } from './types';
import { FieldId } from './types';

/**
 * What a heat lens's value means: `worse` when more is bad, `better` when more
 * is good. The ramp a lens paints follows it.
 */
export type LensMeaning = 'worse' | 'better';

/** The meaning of every lens; null for a lens that is not a heat ramp (coverage, soil, transit, districts). */
export const LENS_MEANING: Readonly<Record<LensId, LensMeaning | null>> = {
  [FieldId.LandValue]: 'better',
  [FieldId.Pollution]: 'worse',
  [FieldId.Noise]: 'worse',
  [FieldId.Traffic]: 'worse',
  [FieldId.Crime]: 'worse',
  [FieldId.FireRisk]: 'worse',
  [FieldId.Education]: 'better',
  [FieldId.Health]: 'better',
  [FieldId.Happiness]: 'better',
  [FieldId.MiddleEducation]: 'better',
  [FieldId.HighEducation]: 'better',
  [FieldId.CollegeEducation]: 'better',
  trash: 'worse',
  power: null,
  watered: null,
  sewered: null,
  transit: null,
  districts: null,
  soil: null,
};

const hexRgb = (hex: number): readonly [number, number, number] => [
  ((hex >> 16) & 0xff) / 255,
  ((hex >> 8) & 0xff) / 255,
  (hex & 0xff) / 255,
];

const rampOf = (
  hexes: readonly number[],
): ReadonlyArray<readonly [number, readonly [number, number, number]]> =>
  hexes.map((hex, i) => [Math.round((i * 255) / (hexes.length - 1)), hexRgb(hex)] as const);

/**
 * Stops of each heat ramp, v in [0,255], colour as RGB 0..1, light at the low
 * end and dark at the high end. ColorBrewer 2.0 (Cynthia Brewer, Apache 2.0),
 * each scheme flagged colour-blind safe: YlOrRd and YlGnBu.
 */
export const LENS_RAMP_STOPS: Readonly<
  Record<LensMeaning, ReadonlyArray<readonly [number, readonly [number, number, number]]>>
> = {
  worse: rampOf([0xffffb2, 0xfecc5c, 0xfd8d3c, 0xf03b20, 0xbd0026]),
  better: rampOf([0xffffcc, 0xa1dab4, 0x41b6c4, 0x2c7fb8, 0x253494]),
};

/** The colour (RGB 0..1) of byte `v` on the ramp for `meaning`; out-of-range bytes clamp. */
export function lensRampColor(meaning: LensMeaning, v: number): [number, number, number] {
  const stops = LENS_RAMP_STOPS[meaning];
  const value = Math.min(255, Math.max(0, v));
  const lastIndex = stops.length - 1;
  for (let i = 0; i < lastIndex; i++) {
    const lo = stops[i]!;
    const hi = stops[i + 1]!;
    if (value <= hi[0] || i === lastIndex - 1) {
      const t = Math.min(1, Math.max(0, (value - lo[0]) / (hi[0] - lo[0])));
      return [
        lo[1][0] + (hi[1][0] - lo[1][0]) * t,
        lo[1][1] + (hi[1][1] - lo[1][1]) * t,
        lo[1][2] + (hi[1][2] - lo[1][2]) * t,
      ];
    }
  }
  const last = stops[lastIndex]!;
  return [last[1][0], last[1][1], last[1][2]];
}

/** Covered ground on a coverage lens, and the danger red an uncovered tile is dimmed from. */
export const COVERAGE_COVERED_HEX = 0x38b6e3;
export const COVERAGE_UNCOVERED_HEX = 0xe5533f;
export const COVERAGE_UNCOVERED_DIM_FACTOR = 0.55;

/** `hex` with each channel scaled by `factor`. */
export function dimHex(hex: number, factor: number): number {
  const channel = (shift: number): number => Math.round(((hex >> shift) & 0xff) * factor);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/**
 * The Soil lens, one colour per SoilGrade: the dim red of ground no service
 * reaches for land no farm takes, then amber pasture, light green orchard
 * slopes and deep green cropland.
 */
export const SOIL_LENS_COLORS: ReadonlyArray<{ hex: number; label: string }> = [
  {
    hex: dimHex(COVERAGE_UNCOVERED_HEX, COVERAGE_UNCOVERED_DIM_FACTOR),
    label: 'Unfit for farming',
  },
  { hex: 0xd9a441, label: 'Pasture' },
  { hex: 0x9fcf4a, label: 'Orchard slopes' },
  { hex: 0x2f9e44, label: 'Cropland' },
];

/** The underground view's drawn things: water run, sewer run, a run nothing reaches, the cable and its feet. */
export const UNDERGROUND_WATER_HEX = 0x38b6e3;
export const UNDERGROUND_SEWER_HEX = 0x8a5a2b;
export const UNDERGROUND_DRY_HEX = 0x6b6f73;
export const UNDERGROUND_CABLE_HEX = 0xd0452a;
export const UNDERGROUND_CABLE_FOOT_HEX = 0xf0a060;
