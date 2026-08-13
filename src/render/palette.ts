/**
 * The city's calibrated material palette: one source of truth for what
 * concrete, brick, plaster, roofing, asphalt, wood and vegetation actually
 * look like, measured from the reference chart rather than picked per module.
 *
 * The chart's point is headroom. Albedo is what a material reflects, not how
 * bright it appears — lighting, bloom and tone mapping add the rest — so a
 * material authored near white leaves the renderer nothing to work with and
 * blows out the moment a lamp touches it. The brightest thing in the chart is
 * snow, at 140/142/144; everything else sits below 140.
 *
 * Values are sRGB 0..255, the units the chart is in, converted at the point of
 * use. Vehicle paint is a deliberate exception and lives with the vehicles —
 * saturated cars are contrast against exactly this desaturated palette.
 */

/** sRGB 0..255, the units the reference chart is measured in. */
export type RGB255 = readonly [number, number, number];

/**
 * Nothing but snow goes above this. Materials authored past it lose the
 * renderer's lighting headroom and clip under a street lamp.
 */
export const MAX_MATERIAL_CHANNEL = 140;

/** Snow is the chart's single brightest material and the only one allowed past 140. */
export const MAX_SNOW_CHANNEL = 144;

/**
 * Every measured material in the chart. Named as the chart names them so a
 * value can be traced back to the swatch it came from.
 */
export const MATERIALS = {
  snow: [140, 142, 144],
  coal: [23, 23, 23],

  stainedConcrete: [71, 68, 65],
  cleanConcrete: [91, 91, 88],
  whiteBrick: [123, 122, 120],
  stoneBrick: [91, 85, 80],
  redBrick: [70, 50, 41],

  whitePlaster: [105, 104, 103],
  bluePlaster: [43, 61, 83],
  yellowPlaster: [97, 80, 49],
  redPlaster: [90, 48, 45],
  greenPlaster: [52, 79, 50],

  rustedMetal: [56, 38, 31],
  metalPlates: [72, 74, 75],

  brightBitumen: [52, 52, 52],
  darkBitumen: [34, 34, 36],
  asbestosRoof: [57, 57, 56],
  slateRoof: [47, 47, 46],
  clayRoof: [70, 50, 43],

  sand: [119, 102, 85],
  mud: [47, 42, 40],
  dirt: [67, 59, 54],

  darkAsphalt: [37, 36, 36],
  brightAsphalt: [59, 56, 54],

  darkVegetation: [27, 34, 22],
  brightVegetation: [46, 53, 33],

  brightestWood: [110, 96, 75],
  brightWood: [86, 67, 57],
  darkWood: [56, 46, 40],
  darkestWood: [38, 33, 31],
} as const satisfies Record<string, RGB255>;

export type MaterialName = keyof typeof MATERIALS;

/**
 * The chart's saturated reference block. A painted accent — a stripe down an
 * industrial wall, a signage band — is still a surface, so it obeys the same
 * headroom rule; the chart shows what saturation looks like inside it, peaking
 * at 102 rather than the 184 an eyedropper on a photo would give you.
 */
export const SATURATED = {
  red: [102, 36, 36],
  green: [36, 102, 36],
  blue: [36, 36, 102],
  cyan: [36, 102, 102],
  magenta: [102, 36, 102],
  yellow: [102, 102, 36],
} as const satisfies Record<string, RGB255>;

export type SaturatedName = keyof typeof SATURATED;

export function saturatedUnit(name: SaturatedName): readonly [number, number, number] {
  return rgb255ToUnit(SATURATED[name]);
}

/** The chart's neutral ramp, for greys that are not a named material. */
export const MONOCHROME_RAMP: readonly number[] = [135, 105, 74, 54, 38, 23];

export function material(name: MaterialName): RGB255 {
  return MATERIALS[name];
}

export function rgb255ToHex(rgb: RGB255): number {
  return (
    ((Math.round(rgb[0]) & 0xff) << 16) |
    ((Math.round(rgb[1]) & 0xff) << 8) |
    (Math.round(rgb[2]) & 0xff)
  );
}

export function hexToRgb255(hex: number): RGB255 {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

/** 0..1 floats, the units three.js materials want. */
export function rgb255ToUnit(rgb: RGB255): readonly [number, number, number] {
  return [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];
}

export function materialHex(name: MaterialName): number {
  return rgb255ToHex(MATERIALS[name]);
}

export function materialUnit(name: MaterialName): readonly [number, number, number] {
  return rgb255ToUnit(MATERIALS[name]);
}

/**
 * Brings an over-bright colour into the calibrated range by SCALING all three
 * channels together, never by clipping them individually. Clipping the one
 * channel that is over drags the colour toward whichever channels were not,
 * which shifts its hue — a warm grey clips to a cold one. Scaling keeps the
 * ratios, so the colour is the same colour, dimmer. Already-legal colours come
 * back untouched.
 */
export function calibrate(rgb: RGB255, ceiling: number = MAX_MATERIAL_CHANNEL): RGB255 {
  const peak = Math.max(rgb[0], rgb[1], rgb[2]);
  if (peak <= ceiling || peak <= 0) return rgb;
  const scale = ceiling / peak;
  return [rgb[0] * scale, rgb[1] * scale, rgb[2] * scale];
}

/** calibrate() for the packed-hex colours the renderers pass around. */
export function calibrateHex(hex: number, ceiling: number = MAX_MATERIAL_CHANNEL): number {
  return rgb255ToHex(calibrate(hexToRgb255(hex), ceiling));
}
