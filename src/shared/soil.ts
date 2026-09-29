/**
 * The soil under every land tile, graded for farming. It is read from the
 * ground itself — height, slope, the water beside it — plus stony patches
 * hashed from the map seed, so it is never stored: the worker and the render
 * thread each work it out from the same heights and agree tile for tile.
 *
 * The grades follow land capability classes: level ground is the best
 * cropland, rolling ground suits orchards, steep ground only pasture, and
 * beach sand, the wet shore and rock grow no commercial crop at all. The slope
 * bands are the land-judging slope classes (0–6%, 6–12%, 12–20%); the steepest
 * farmable slope is the steepest anything is built on, and the beach is the
 * band the terrain draws as sand, so the ground's colours and its soil agree.
 */
import { MAX_BUILD_SLOPE, SAND_BAND_METERS, SEA_LEVEL, TILE_METERS } from './constants';

export const SoilGrade = {
  /** Beach, wet shore, rock, or a slope nothing is built on. */
  Unfit: 0,
  /** Somewhat fertile: pasture. */
  Marginal: 1,
  /** Fertile: orchards. */
  Fertile: 2,
  /** Very fertile: row crops. */
  Prime: 3,
} as const;
export type SoilGrade = (typeof SoilGrade)[keyof typeof SoilGrade];

/** The steepest prime cropland, as rise over run: classes I and II. */
export const PRIME_MAX_SLOPE = 0.06;
/** The steepest fertile ground, as rise over run. */
export const FERTILE_MAX_SLOPE = 0.12;
const PRIME_MAX_RISE_M = PRIME_MAX_SLOPE * TILE_METERS;
const FERTILE_MAX_RISE_M = FERTILE_MAX_SLOPE * TILE_METERS;

/** Stony ground comes in patches about this many tiles across. */
export const STONY_CELL_TILES = 6;
/**
 * The patch field reads below this on about one land tile in six. The field
 * is smoothed value noise, which bunches towards the middle, so the cut is
 * well under a sixth of its range.
 */
const STONY_BELOW = 0.28;

/** What the grade is read from. A GridState and the render mirror both satisfy it. */
export interface SoilSource {
  readonly size: number;
  height: Float32Array;
  water: Uint8Array;
}

/** A uniform value in [0, 1) for one lattice point of one map. */
function latticeValue(seed: number, cx: number, cz: number): number {
  let h = Math.imul(cx, 0x27d4eb2d) ^ Math.imul(cz, 0x165667b1) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** The stony-patch field at a tile: lattice values blended smoothly between their points. */
function patchField(seed: number, x: number, z: number): number {
  const fx = x / STONY_CELL_TILES;
  const fz = z / STONY_CELL_TILES;
  const cx = Math.floor(fx);
  const cz = Math.floor(fz);
  const tx = smooth(fx - cx);
  const tz = smooth(fz - cz);
  const a = latticeValue(seed, cx, cz);
  const b = latticeValue(seed, cx + 1, cz);
  const c = latticeValue(seed, cx, cz + 1);
  const d = latticeValue(seed, cx + 1, cz + 1);
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * tz;
}

/** Whether a tile lies on shallow, stony soil. */
export function isStony(seed: number, x: number, z: number): boolean {
  return patchField(seed, x, z) < STONY_BELOW;
}

const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/** The soil grade of one tile. Out of bounds reads as unfit. */
export function soilGradeAt(src: SoilSource, seed: number, x: number, z: number): SoilGrade {
  const { size } = src;
  if (x < 0 || z < 0 || x >= size || z >= size) return SoilGrade.Unfit;
  const i = z * size + x;
  if (src.water[i]) return SoilGrade.Unfit;
  const h = src.height[i]!;
  if (h < SEA_LEVEL + SAND_BAND_METERS) return SoilGrade.Unfit;

  let rise = 0;
  for (const [ox, oz] of NEIGHBOURS) {
    const nx = x + ox;
    const nz = z + oz;
    if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
    const n = nz * size + nx;
    if (src.water[n]) return SoilGrade.Unfit;
    rise = Math.max(rise, Math.abs(h - src.height[n]!));
  }

  const bySlope: SoilGrade =
    rise > MAX_BUILD_SLOPE
      ? SoilGrade.Unfit
      : rise > FERTILE_MAX_RISE_M
        ? SoilGrade.Marginal
        : rise > PRIME_MAX_RISE_M
          ? SoilGrade.Fertile
          : SoilGrade.Prime;
  // Shallow soil over rock takes a plough badly whatever its slope: pasture at best.
  return isStony(seed, x, z) ? (Math.min(bySlope, SoilGrade.Marginal) as SoilGrade) : bySlope;
}

/** Every tile's grade, row-major, into `out` when one of the right size is given. */
export function soilGrades(src: SoilSource, seed: number, out?: Uint8Array): Uint8Array {
  const { size } = src;
  const grades = out && out.length === size * size ? out : new Uint8Array(size * size);
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) grades[z * size + x] = soilGradeAt(src, seed, x, z);
  }
  return grades;
}

/**
 * Regrades the tiles a height change at x..x+w-1, z..z+h-1 can reach: the
 * rectangle and the ring around it, whose slopes and shorelines it moved.
 */
export function regradeSoil(
  src: SoilSource & { soil: Uint8Array },
  seed: number,
  x: number,
  z: number,
  w: number,
  h: number,
): void {
  const { size } = src;
  const x0 = Math.max(0, x - 1);
  const z0 = Math.max(0, z - 1);
  const x1 = Math.min(size - 1, x + w);
  const z1 = Math.min(size - 1, z + h);
  for (let tz = z0; tz <= z1; tz++) {
    for (let tx = x0; tx <= x1; tx++) src.soil[tz * size + tx] = soilGradeAt(src, seed, tx, tz);
  }
}

/** Whether a grade can be farmed at all. */
export function isFarmable(grade: number): boolean {
  return grade >= SoilGrade.Marginal;
}
