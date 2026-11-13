/**
 * The colours the lenses and the underground view paint with. The renderers
 * paint from these tables and the on-screen legend reads the same ones, so a
 * legend can never describe a colour the map does not use.
 */

/** Stops for the blue -> green -> yellow -> red heatmap ramp, v in [0,255], colour as RGB 0..1. */
export const LENS_RAMP_STOPS: ReadonlyArray<readonly [number, readonly [number, number, number]]> =
  [
    [0, [0.05, 0.1, 0.9]],
    [85, [0.1, 0.75, 0.2]],
    [170, [0.95, 0.85, 0.1]],
    [255, [0.95, 0.15, 0.1]],
  ];

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
