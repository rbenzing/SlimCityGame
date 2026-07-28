/**
 * Procedural facade parameters (building on the night-window system). PURE
 * derivation from a catalog entry + building id —
 * no three.js/DOM dependency, mirroring cameramath.ts's "plain-number math,
 * unit-testable without a GPU/DOM" convention. buildings.ts wires these
 * values (and mirrors the hash formulas below as TSL shader nodes, the same
 * way it already mirrors windowHash's CPU formula with the TSL `hash()`
 * node) into the existing per-archetype instanced material; this module
 * never touches THREE itself.
 *
 * Determinism: every export here is a pure function of its arguments. No
 * Math.random, no Date.now — variation across buildings/windows comes only
 * from hashing the buildingId (and, for windows, the window index), per the
 * project's determinism rule.
 */
import { BuildingCatalogEntry, ZoneType } from '../shared/types';
import { TILE_METERS } from '../shared/constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FacadeFamily = 'glass' | 'masonry' | 'concrete' | 'plaster';

/** Normalized (0..1 per channel) RGB, matching the codebase's existing color-tuple convention (buildings.ts's tintFor, roadsmesh.ts's tier colors). */
export type RGB = readonly [number, number, number];

export interface FacadeParams {
  /** Story count: height / FLOOR_HEIGHT_METERS, rounded, minimum 1. */
  floors: number;
  /** Structural bay count across the footprint's width, minimum 1. */
  bays: number;
  /** Archetype family, decided from category + zone + level. */
  family: FacadeFamily;
  /** Desaturated + hue-jittered wall base color for this specific building instance. */
  wallColor: RGB;
  /** White/grey/tan rotation (or the fixed industrial grey), always distinct from wallColor. */
  roofColor: RGB;
  /** Punched (inset) window openings vs. flush curtain-wall glazing. */
  windowInset: boolean;
  /** Visible horizontal spandrel bands every floor (masonry only). */
  spandrel: boolean;
}

interface HSL {
  h: number;
  s: number;
  l: number;
}

// ---------------------------------------------------------------------------
// Facade constants
// ---------------------------------------------------------------------------

/** "floors = height/3.2m"; also the window-row floor height. */
export const FLOOR_HEIGHT_METERS = 3.2;
/** "bays from footprint" — a ~2.6m structural bay width. */
export const BAY_WIDTH_METERS = 2.6;
/** First 3.2m band gets storefront treatment. */
export const GROUND_FLOOR_METERS = FLOOR_HEIGHT_METERS;
/** Top 0.4m darker band. */
export const PARAPET_METERS = 0.4;

/** Palette preset: "clamp saturation low" for every wall, family hue aside. */
export const MAX_WALL_SATURATION = 0.18;
/** Keeps even dark catalog colors off pure black — industrial stays a "rare dark accent", not ink. */
export const MIN_WALL_LIGHTNESS = 0.32;
/** Keeps pale catalog colors off blown-out white. */
export const MAX_WALL_LIGHTNESS = 0.92;
/** Deterministic per-instance hue jitter ±4% from building id. */
export const HUE_JITTER_FRACTION = 0.04;

/** Roof plate tinted distinctly from walls (white/grey/tan rotation by id hash). */
export const ROOF_PALETTE: readonly RGB[] = [
  [0.93, 0.91, 0.87], // off-white/bone
  [0.58, 0.58, 0.61], // grey
  [0.78, 0.67, 0.52], // tan
];
/** Minimum RGB distance a roof color must clear from the wall color ("distinct from walls"). */
export const MIN_ROOF_WALL_DISTANCE = 0.12;

/** Palette: steel blue / light grey / off-white walls (desaturated rules apply). */
export const INDUSTRIAL_WALL_PALETTE: readonly RGB[] = [
  [0.45, 0.52, 0.58], // steel blue
  [0.68, 0.68, 0.7], // light grey
  [0.9, 0.89, 0.86], // off-white
];
/** Grey roof plates — fixed, not rotated. */
export const INDUSTRIAL_ROOF_COLOR: RGB = [0.42, 0.43, 0.45];
/** One accent stripe band (red or blue by id hash). */
export const ACCENT_RED: RGB = [0.72, 0.2, 0.18];
export const ACCENT_BLUE: RGB = [0.18, 0.34, 0.65];
/** Accent stripe sits at 2/3 height. */
export const INDUSTRIAL_ACCENT_HEIGHT_FRACTION = 2 / 3;

/**
 * Seed-slot scheme for combining (buildingId, drawSlot) into one hash input,
 * mirroring buildings.ts's existing WINDOW_SEED_SLOTS convention so every
 * per-instance draw here (hue jitter, roof rotation, industrial wall/accent
 * picks) is decorrelated from the others and from the window hash.
 * buildings.ts's TSL shader mirrors this same seed formula with its own
 * hash node, exactly like it already mirrors windowHash's CPU formula.
 */
export const FACADE_HASH_SLOT_MULTIPLIER = 4096;
export const HASH_SLOT_HUE_JITTER = 1;
export const HASH_SLOT_ROOF_ROTATION = 2;
export const HASH_SLOT_INDUSTRIAL_WALL = 3;
export const HASH_SLOT_INDUSTRIAL_ACCENT = 4;

// ---------------------------------------------------------------------------
// Deterministic hashing (32-bit avalanche mix, "triple32", public domain —
// the same recipe buildings.ts uses for windowHash). Never Math.random.
// ---------------------------------------------------------------------------

function hash1(n: number): number {
  let h = n >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/** hash(buildingId, slot) -> [0,1), decorrelated per named HASH_SLOT_*. */
function facadeHash(buildingId: number, slot: number): number {
  return hash1(buildingId * FACADE_HASH_SLOT_MULTIPLIER + slot);
}

// ---------------------------------------------------------------------------
// RGB <-> HSL (standard CSS-Color-3 formulas), exported as small reusable
// pure helpers — buildings.ts's shader mirrors the *effect* of these using
// three's own TSL `hue`/`saturation` color-adjustment nodes (see buildings.ts),
// not these functions directly (shaders can't call arbitrary JS).
// ---------------------------------------------------------------------------

export function rgbToHsl(r: number, g: number, b: number): HSL {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h /= 6;
  return { h, s, l };
}

function hue2rgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
}

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
const wrap01 = (v: number): number => ((v % 1) + 1) % 1;

function hexToRgb01(hex: number): RGB {
  return [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255];
}

function rgbDistance(a: RGB, b: RGB): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Guarded fixed-palette lookup — throws rather than silently wrapping (mirrors buildings.ts's slotId idiom for "should never happen but noUncheckedIndexedAccess needs proof"). */
function paletteAt(palette: readonly RGB[], index: number): RGB {
  const color = palette[index];
  if (!color)
    throw new RangeError(`facade: palette index ${index} out of range 0..${palette.length - 1}`);
  return color;
}

// ---------------------------------------------------------------------------
// Family (from category + zone + level)
// ---------------------------------------------------------------------------

const FAMILY_FLAGS: Record<FacadeFamily, { windowInset: boolean; spandrel: boolean }> = {
  // Curtain wall: glazing dominates, flush with the frame, no spandrel reveal.
  glass: { windowInset: false, spandrel: false },
  // Brick/masonry: punched openings, visible spandrel band under every floor.
  masonry: { windowInset: true, spandrel: true },
  // Precast concrete panel: punched, narrow windows, no spandrel banding.
  concrete: { windowInset: true, spandrel: false },
  // Beige plaster (low-density res): simple punched openings.
  plaster: { windowInset: true, spandrel: false },
};

/**
 * Real-world-inspired, deterministic family assignment: low-density
 * residential is plaster; everything else graduates toward
 * glass curtain-wall as density/level rises (res-high level 3 towers,
 * com-high office blocks), with masonry as the mid-rise/low-com step.
 * Industrial and civic/utility/park ploppables share the utilitarian
 * concrete base — buildings.ts layers the industrial-specific palette
 * and wall treatment on top of that, keyed off entry.category directly.
 */
function deriveFamily(entry: BuildingCatalogEntry): FacadeFamily {
  if (entry.category === 'res') {
    if (entry.zone === ZoneType.ResLow) return 'plaster';
    return (entry.level ?? 1) >= 3 ? 'glass' : 'masonry';
  }
  if (entry.category === 'com') {
    return entry.zone === ZoneType.ComHigh ? 'glass' : 'masonry';
  }
  return 'concrete';
}

// ---------------------------------------------------------------------------
// Wall / roof color derivation
// ---------------------------------------------------------------------------

/** Industrial wall base: a deterministic rotation among the steel-blue/light-grey/off-white palette, before hue jitter. */
export function industrialWallBase(buildingId: number): RGB {
  const index = Math.floor(
    facadeHash(buildingId, HASH_SLOT_INDUSTRIAL_WALL) * INDUSTRIAL_WALL_PALETTE.length,
  );
  return paletteAt(INDUSTRIAL_WALL_PALETTE, Math.min(index, INDUSTRIAL_WALL_PALETTE.length - 1));
}

/** The pre-jitter HSL base for a wall: industrial draws from its own fixed palette; everything else desaturates+lightness-clamps the catalog color. */
function baseWallHsl(entry: BuildingCatalogEntry, buildingId: number): HSL {
  if (entry.category === 'ind') {
    const [r, g, b] = industrialWallBase(buildingId);
    return rgbToHsl(r, g, b);
  }
  const [r, g, b] = hexToRgb01(entry.color);
  const hsl = rgbToHsl(r, g, b);
  return {
    h: hsl.h,
    s: Math.min(hsl.s, MAX_WALL_SATURATION),
    l: clamp(hsl.l, MIN_WALL_LIGHTNESS, MAX_WALL_LIGHTNESS),
  };
}

function deriveWallColor(entry: BuildingCatalogEntry, buildingId: number): RGB {
  const { h, s, l } = baseWallHsl(entry, buildingId);
  const jitter = (facadeHash(buildingId, HASH_SLOT_HUE_JITTER) * 2 - 1) * HUE_JITTER_FRACTION;
  return hslToRgb(wrap01(h + jitter), s, l);
}

/**
 * White/grey/tan rotation by id hash, cycled forward until it clears
 * MIN_ROOF_WALL_DISTANCE from the wall color ("distinct from walls").
 * The palette's own entries sit well over 0.2 apart pairwise, so this
 * converges within the palette's size; the final fallback (all attempts
 * too close) keeps the original hash pick rather than looping forever.
 */
function rotateRoofColor(buildingId: number, wallColor: RGB): RGB {
  const baseIndex = Math.floor(
    facadeHash(buildingId, HASH_SLOT_ROOF_ROTATION) * ROOF_PALETTE.length,
  );
  for (let attempt = 0; attempt < ROOF_PALETTE.length; attempt++) {
    const candidate = paletteAt(ROOF_PALETTE, (baseIndex + attempt) % ROOF_PALETTE.length);
    if (rgbDistance(candidate, wallColor) >= MIN_ROOF_WALL_DISTANCE) return candidate;
  }
  return paletteAt(ROOF_PALETTE, baseIndex % ROOF_PALETTE.length);
}

function deriveRoofColor(entry: BuildingCatalogEntry, buildingId: number, wallColor: RGB): RGB {
  if (entry.category === 'ind') return INDUSTRIAL_ROOF_COLOR;
  return rotateRoofColor(buildingId, wallColor);
}

// ---------------------------------------------------------------------------
// Industrial accent stripe
// ---------------------------------------------------------------------------

/** One accent stripe band (red or blue by id hash). */
export function industrialAccentColor(buildingId: number): RGB {
  return facadeHash(buildingId, HASH_SLOT_INDUSTRIAL_ACCENT) < 0.5 ? ACCENT_RED : ACCENT_BLUE;
}

// ---------------------------------------------------------------------------
// Floors / bays
// ---------------------------------------------------------------------------

function deriveFloors(height: number): number {
  return Math.max(1, Math.round(height / FLOOR_HEIGHT_METERS));
}

function deriveBays(entry: BuildingCatalogEntry): number {
  const widthMeters = entry.footprint.w * TILE_METERS;
  return Math.max(1, Math.round(widthMeters / BAY_WIDTH_METERS));
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/** Full facade parameter set for one building instance. Pure; deterministic in (entry, buildingId). */
export function deriveFacadeParams(entry: BuildingCatalogEntry, buildingId: number): FacadeParams {
  const family = deriveFamily(entry);
  const { windowInset, spandrel } = FAMILY_FLAGS[family];
  const wallColor = deriveWallColor(entry, buildingId);
  const roofColor = deriveRoofColor(entry, buildingId, wallColor);

  return {
    floors: deriveFloors(entry.height),
    bays: deriveBays(entry),
    family,
    wallColor,
    roofColor,
    windowInset,
    spandrel,
  };
}

/** First FLOOR_HEIGHT_METERS band gets the storefront treatment. Returns the band thickness as a fraction of total height (1 = the whole face, for buildings shorter than the band itself). */
export function groundFloorBand(height: number): number {
  if (!(height > 0)) return 1;
  return Math.min(1, GROUND_FLOOR_METERS / height);
}

/** Top PARAPET_METERS gets a darker band. Same "fraction of total height" convention as groundFloorBand. */
export function parapetBand(height: number): number {
  if (!(height > 0)) return 1;
  return Math.min(1, PARAPET_METERS / height);
}
