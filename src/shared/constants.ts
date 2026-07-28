/**
 * SlimCity shared constants & pure helpers. Same contract rules as types.ts:
 * module agents code against this file and must not edit it.
 */

// --- world dimensions -------------------------------------------------------
export const MAP_SIZE = 256; // tiles per side
export const TILE_METERS = 16;
export const MAP_TILES = MAP_SIZE * MAP_SIZE;

/** Flat index for tile (x, z). Callers guarantee 0 <= x,z < MAP_SIZE. */
export const tileIndex = (x: number, z: number): number => z * MAP_SIZE + x;
export const inBounds = (x: number, z: number): boolean =>
  x >= 0 && z >= 0 && x < MAP_SIZE && z < MAP_SIZE;
/** Tile center in world meters (world origin = map corner tile 0,0). */
export const tileToWorld = (t: number): number => (t + 0.5) * TILE_METERS;
export const worldToTile = (w: number): number => Math.floor(w / TILE_METERS);

// --- time -------------------------------------------------------------------
export const TICK_RATE = 20; // sim ticks per real second at raw multiplier 1.0
export const TICK_MS = 1000 / TICK_RATE;

/**
 * Real-time pacing multiplier for each speed button. The FixedTimestep is a
 * pure driver (1.0 = TICK_RATE ticks/real-second); the worker maps the
 * player-facing SimSpeed button (1/2/4) through this table before advancing, so:
 *   1× → 0.5  (a calm baseline — a visual day takes ~4 real min)
 *   2× → 2.0  (4× the 1× rate)
 *   4× → 8.0  (16× the 1× rate — each button is an exponential ×4 step)
 * Pause (0) maps to 0. Keyed by the SimSpeed union (0 | 1 | 2 | 4).
 */
export const SPEED_MULTIPLIERS: Readonly<Record<0 | 1 | 2 | 4, number>> = {
  0: 0,
  1: 0.5,
  2: 2,
  4: 8,
};
export const TICKS_PER_DAY = 200; // 10s per game day at 1x
export const DAYS_PER_MONTH = 30;
export const TICKS_PER_MONTH = TICKS_PER_DAY * DAYS_PER_MONTH;
export const SNAPSHOT_HZ = 10;

export interface GameDate {
  year: number;
  month: number; // 1..12
  day: number; // 1..30
}
export const tickToDate = (tick: number): GameDate => {
  const totalDays = Math.floor(tick / TICKS_PER_DAY);
  return {
    year: 1 + Math.floor(totalDays / (DAYS_PER_MONTH * 12)),
    month: 1 + (Math.floor(totalDays / DAYS_PER_MONTH) % 12),
    day: 1 + (totalDays % DAYS_PER_MONTH),
  };
};

// --- economy ----------------------------------------------------------------
export const START_FUNDS = 50_000;
export const DEFAULT_TAX_RATE = 0.09;
export const MAX_TAX_RATE = 0.3;
export const MAX_LOAN = 100_000;
export const LOAN_MONTHLY_INTEREST = 0.01;

// --- buildability -----------------------------------------------------------
export const MAX_BUILD_SLOPE = 4; // max height delta (m) across a tile's corners
export const SEA_LEVEL = 0;
/**
 * Road-on-slope placement: roads tolerate a steeper grade than
 * buildings/zoning (MAX_BUILD_SLOPE=4) because the footprint auto-flatten
 * re-levels/banks the built tiles + apron on placement anyway — the terrain
 * never actually stays at this slope under the road. 10m/tile is a moderate
 * grade (climbable, still looks like a road hugging a hillside) well below the
 * point an unflattened slope would look absurd. Curved centerlines/elevation/
 * bridges remain unsupported — this only widens which tiles a (straight,
 * flat-banked) road may be built ON.
 */
export const ROAD_MAX_SLOPE = 10; // max height delta (m) across a tile's neighbor, for road placement only

// --- milestones -------------------------------------------------------------
export interface Milestone {
  name: string;
  population: number;
  reward: number; // one-time funds grant
}
export const MILESTONES: readonly Milestone[] = [
  { name: 'Tiny Village', population: 0, reward: 0 },
  { name: 'Small Town', population: 400, reward: 10_000 },
  { name: 'Busy Township', population: 1_200, reward: 15_000 },
  { name: 'Big Town', population: 3_500, reward: 25_000 },
  { name: 'Small City', population: 8_000, reward: 40_000 },
  { name: 'Grand City', population: 20_000, reward: 75_000 },
  { name: 'Metropolis', population: 50_000, reward: 120_000 },
] as const;

// --- camera -----------------------------------------------------------------
export const CAMERA_MIN_DISTANCE = 40;
export const CAMERA_MAX_DISTANCE = 2_400;
export const CAMERA_MIN_PITCH = 0.18; // radians above horizon
export const CAMERA_MAX_PITCH = 1.45;

// --- rendering --------------------------------------------------------------
export const CHUNK_TILES = 16; // terrain chunk edge, in tiles
export const CHUNKS_PER_SIDE = MAP_SIZE / CHUNK_TILES;

// --- night cycle & emissive city --------------------------------------------
/**
 * Visual day/night period in ticks. Deliberately decoupled from the calendar
 * day (TICKS_PER_DAY = 200 would strobe day/night every 10s): 2400 ticks =
 * 120s of real time per full cycle at 1×. The status-strip clock maps
 * `tick % VISUAL_DAY_TICKS` onto 24h; the date still advances on sim days.
 */
export const VISUAL_DAY_TICKS = 2400;
/**
 * Boot-time clock offset: a fresh game starts at 09:00 —
 * bright morning light — instead of tick 0's raw midnight, which made every
 * first boot near-black. Both the lighting rig (main.ts dayT) and the
 * status-strip clock (ui/format.ts formatClock) add this same offset before
 * mapping onto the 24h visual day, so displayed time always matches lighting.
 * 9/24 of the visual day = 900 ticks.
 */
export const CLOCK_START_OFFSET_TICKS = Math.round((VISUAL_DAY_TICKS * 9) / 24);
/**
 * Street lamps are auto-placed on every Nth road tile (alternating sides,
 * deterministic from tile coords).
 */
export const LAMP_SPACING_TILES = 3;
/**
 * Fraction of a building's windows lit at full night: each window's
 * hash(buildingId, windowIndex) threshold lands in this band, so 40–70%
 * of windows glow and the mix is stable per building.
 */
export const NIGHT_WINDOW_LIT_MIN = 0.4;
export const NIGHT_WINDOW_LIT_MAX = 0.7;

// --- landscaping & water ----------------------------------------------------
/** Terrain-brush radius bounds, in tiles (tool-options "Brush radius" row). */
export const TERRAFORM_BRUSH_MIN = 2;
export const TERRAFORM_BRUSH_MAX = 16;
/** Terrain-brush strength bounds (tool-options "Strength" row). */
export const TERRAFORM_STRENGTH_MIN = 1;
export const TERRAFORM_STRENGTH_MAX = 5;
/**
 * ¢ charged per meter of |Δheight| per edited tile — terraform strokes are
 * funds-gated like every other edit.
 */
export const TERRAFORM_COST_PER_METER_TILE = 0.5;
/**
 * Depth in meters below SEA_LEVEL at which the underwater seabed tint
 * (blue-green vertex-color ramp) reaches full strength.
 */
export const MAX_WATER_DEPTH_VIS = 12;
/**
 * Shoreline foam band: vertices with |height − SEA_LEVEL| < this (meters)
 * draw the waterline, giving every coast a drawn edge.
 */
export const SHORELINE_BAND_METERS = 0.4;
