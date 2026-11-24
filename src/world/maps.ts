/**
 * SlimCity map data: a deterministic procedural
 * fallback terrain generator, plus a pure raster-to-grid resampler for
 * AI-generated map packs. No I/O and no three.js/DOM here — PNG decoding to
 * pixels happens elsewhere; this module only turns numbers into numbers.
 */

import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { MAP_SIZE, MAX_BUILD_SLOPE, SEA_LEVEL } from '../shared/constants';
import { MapGenerator } from '../shared/types';
import type { MapData, TilePoint } from '../shared/types';

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) — seeds simplex-noise's permutation table
// so the same numeric seed always produces the same noise field.
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function random(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Fractal Brownian motion over a simplex-noise field. Each octave's simplex
// sample is in [-1, 1], and a weighted average of such samples stays within
// [-1, 1] too, so fbm(...) is bounded there regardless of octave count.
// ---------------------------------------------------------------------------

function fbm(
  noise: NoiseFunction2D,
  x: number,
  z: number,
  octaves: number,
  lacunarity: number,
  gain: number,
): number {
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amplitude * noise(x * frequency, z * frequency);
    norm += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return norm > 0 ? sum / norm : 0;
}

// ---------------------------------------------------------------------------
// Shared buildability + spawn selection. Deliberately independent of
// GridState/isBuildable in grid.ts: MapData has no zone/road/building
// layers yet at generation time, so this checks only terrain (water+slope)
// directly against the raw height/water arrays.
// ---------------------------------------------------------------------------

export function terrainBuildable(
  size: number,
  height: Float32Array,
  water: Uint8Array,
  x: number,
  z: number,
): boolean {
  if (x < 0 || z < 0 || x >= size || z >= size) return false;
  const i = z * size + x;
  if (water[i]) return false;

  const h = height[i]!;
  const offsets: ReadonlyArray<readonly [number, number]> = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];
  for (const [ox, oz] of offsets) {
    const nx = x + ox;
    const nz = z + oz;
    if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
    const nh = height[nz * size + nx]!;
    if (Math.abs(h - nh) > MAX_BUILD_SLOPE) return false;
  }
  return true;
}

/** Nearest-to-center buildable tile, searching outward ring by ring. */
function findSpawn(size: number, height: Float32Array, water: Uint8Array): TilePoint {
  const cx = Math.floor(size / 2);
  const cz = Math.floor(size / 2);

  if (terrainBuildable(size, height, water, cx, cz)) {
    return { x: cx, z: cz };
  }

  const maxRadius = size; // generous — the ring search bails out via inner bounds checks
  for (let r = 1; r <= maxRadius; r++) {
    let best: TilePoint | null = null;
    let bestDist = Infinity;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; // ring border only
        const x = cx + dx;
        const z = cz + dz;
        if (!terrainBuildable(size, height, water, x, z)) continue;
        const dist = dx * dx + dz * dz;
        if (dist < bestDist) {
          bestDist = dist;
          best = { x, z };
        }
      }
    }
    if (best) return best;
  }

  // No buildable tile anywhere on the map (degenerate terrain) — fall back
  // to the clamped center so spawn is always at least in bounds.
  return { x: clamp(cx, 0, size - 1), z: clamp(cz, 0, size - 1) };
}

// ---------------------------------------------------------------------------
// Procedural generation
// ---------------------------------------------------------------------------

const MIN_TERRAIN_HEIGHT = -8;
const MAX_TERRAIN_HEIGHT = 40;
const TERRAIN_MID = (MIN_TERRAIN_HEIGHT + MAX_TERRAIN_HEIGHT) / 2;
const TERRAIN_HALF_RANGE = (MAX_TERRAIN_HEIGHT - MIN_TERRAIN_HEIGHT) / 2;
// Shifts the elevation distribution down slightly so sea-level coastlines
// and lakes actually appear instead of requiring an extreme noise sample.
const TERRAIN_LAND_BIAS = 0.2;
const TERRAIN_FREQUENCY = 1 / 96;
const TERRAIN_OCTAVES = 5;
const TERRAIN_LACUNARITY = 2;
const TERRAIN_GAIN = 0.5;

const TREE_FREQUENCY = 1 / 24;
const TREE_OCTAVES = 3;
const TREE_LACUNARITY = 2;
const TREE_GAIN = 0.5;
// Distinguishes the tree noise stream from the terrain stream even when
// derived from the same seed.
const TREE_SEED_SALT = 0x9e3779b9;

const treeNoiseFor = (seed: number): NoiseFunction2D =>
  createNoise2D(mulberry32((seed ^ TREE_SEED_SALT) >>> 0));

/** Tree density 0..255 at a land tile. */
function treeDensityAt(treeNoise: NoiseFunction2D, x: number, z: number): number {
  const t = fbm(
    treeNoise,
    x * TREE_FREQUENCY,
    z * TREE_FREQUENCY,
    TREE_OCTAVES,
    TREE_LACUNARITY,
    TREE_GAIN,
  );
  return clamp(Math.round(((t + 1) / 2) * 255), 0, 255);
}

/**
 * Generator 1, the hills. Frozen: a seed gives these exact arrays for good,
 * because a save rebuilds its terrain by running this again.
 *
 * Deterministic simplex-noise FBM terrain: heights roughly -8..40m, water
 * where height < SEA_LEVEL, tree density from a second noise field on land,
 * spawn placed on the most-buildable tile near the map center.
 */
export function generateProceduralMap(seed: number, name: string): MapData {
  const size = MAP_SIZE;
  const n = size * size;

  const terrainNoise = createNoise2D(mulberry32(seed));
  const treeNoise = treeNoiseFor(seed);

  const height = new Float32Array(n);
  const water = new Uint8Array(n);
  const trees = new Uint8Array(n);

  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const i = z * size + x;

      const e = clamp(
        fbm(
          terrainNoise,
          x * TERRAIN_FREQUENCY,
          z * TERRAIN_FREQUENCY,
          TERRAIN_OCTAVES,
          TERRAIN_LACUNARITY,
          TERRAIN_GAIN,
        ) - TERRAIN_LAND_BIAS,
        -1,
        1,
      );
      const h = TERRAIN_MID + e * TERRAIN_HALF_RANGE;
      height[i] = h;

      const isWater = h < SEA_LEVEL;
      water[i] = isWater ? 1 : 0;

      if (isWater) {
        trees[i] = 0;
      } else {
        trees[i] = treeDensityAt(treeNoise, x, z);
      }
    }
  }

  const spawn = findSpawn(size, height, water);

  return { name, size, height, water, trees, seaLevel: SEA_LEVEL, spawn };
}

// ---------------------------------------------------------------------------
// Generator 2: the hills with a sea coast along one edge and a river across.
// ---------------------------------------------------------------------------

// Separates the coast's number stream from the hills' and the trees'.
const COAST_SEED_SALT = 0x51ed270b;
/** Mean width of the sea along its edge, in tiles (13% of the map). */
const SEA_TILES = 34;
/** Coastline wobble: amplitude and wavelength in tiles, two waves. */
const COAST_WAVES: ReadonlyArray<readonly [amplitude: number, wavelength: number]> = [
  [10, 180],
  [5, 67],
];
/** The sea bed falls this many metres a tile from the shore, to the terrain floor. */
const SEA_BED_SLOPE = 0.25;
/** The beach plain starts this far above sea level and rises PLAIN_SLOPE a tile for PLAIN_TILES. */
const PLAIN_START = 0.5;
const PLAIN_SLOPE = 0.15;
const PLAIN_TILES = 40;
/** River width in tiles at the mouth and far inland, and how far the widening eases. */
const RIVER_MOUTH_TILES = 6;
const RIVER_INLAND_TILES = 4;
const RIVER_WIDEN_TILES = 120;
/** The river's bed, in metres below sea level. */
const RIVER_BED = -2;
/** Winding: two waves, in tiles, eased in over the first RIVER_EASE_TILES from the mouth. */
const RIVER_WAVES: ReadonlyArray<readonly [amplitude: number, wavelength: number]> = [
  [18, 90],
  [6, 37],
];
const RIVER_EASE_TILES = 30;
/** The river's line leans by up to this many tiles across per tile along (14 degrees). */
const RIVER_LEAN = 0.25;
/** The river keeps this far from the map's side edges. */
const RIVER_SIDE_MARGIN = 8;
/** Valley: level this many tiles each bank at VALLEY_FLOOR metres, then rising 1 m a tile. */
const VALLEY_LEVEL_TILES = 3;
const VALLEY_FLOOR = 0.6;
/** The valley's side rises this far (the terrain's ceiling) before it can no longer lower a hill. */
const VALLEY_REACH_RISE = MAX_TERRAIN_HEIGHT;
/** Spacing of the points the river's line is stamped at, in tiles along the edge. */
const RIVER_STEP_TILES = 0.25;

/** Smoothstep of v across [lo, hi]. */
function smoothstep(lo: number, hi: number, v: number): number {
  const t = clamp((v - lo) / (hi - lo), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Generator 1's heights with a sea bed and beach along one edge and a river with its valley across. */
function shapeCoast(seed: number, hills: Float32Array): Float32Array {
  const size = MAP_SIZE;
  const rng = mulberry32((seed ^ COAST_SEED_SALT) >>> 0);
  const height = Float32Array.from(hills);
  const edge = Math.floor(rng() * 4);
  const coastPhases = COAST_WAVES.map(() => rng() * Math.PI * 2);
  const mouthAlong = (0.25 + rng() * 0.5) * size;
  const riverPhases = RIVER_WAVES.map(() => rng() * Math.PI * 2);
  const lean = (rng() - 0.5) * 2 * RIVER_LEAN;

  // Each tile as (d, t): how far in from the sea's edge, and how far along it.
  const inFromEdge = (x: number, z: number): [number, number] =>
    edge === 0 ? [x, z] : edge === 1 ? [size - 1 - x, z] : edge === 2 ? [z, x] : [size - 1 - z, x];
  const shoreAt = (t: number): number =>
    SEA_TILES +
    COAST_WAVES.reduce(
      (sum, [amp, len], k) => sum + amp * Math.sin((t * 2 * Math.PI) / len + coastPhases[k]!),
      0,
    );

  const mouthIn = shoreAt(mouthAlong);
  const riverAt = (d: number): number => {
    const s = d - mouthIn;
    const ease = smoothstep(0, RIVER_EASE_TILES, s);
    const swing = RIVER_WAVES.reduce(
      (sum, [amp, len], k) => sum + amp * Math.sin((s * 2 * Math.PI) / len + riverPhases[k]!),
      0,
    );
    return clamp(
      mouthAlong + ease * swing + lean * s,
      RIVER_SIDE_MARGIN,
      size - 1 - RIVER_SIDE_MARGIN,
    );
  };

  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const i = z * size + x;
      const [d, t] = inFromEdge(x, z);
      const s = d - shoreAt(t);
      if (s < 0) {
        // The sea bed is the slope itself: a hollow of the hills never drops a cliff off the shore.
        height[i] = Math.max(MIN_TERRAIN_HEIGHT, -PLAIN_START + s * SEA_BED_SLOPE);
      } else {
        // The land fades from the plain at the shore to the hills 40 tiles in: a hollow fills and a
        // hill rises out of it, so no hill meets the sea in a cliff.
        const plain = PLAIN_START + Math.min(s, PLAIN_TILES) * PLAIN_SLOPE;
        const keep = smoothstep(0, PLAIN_TILES, s);
        height[i] = keep * height[i]! + (1 - keep) * plain;
      }
    }
  }

  // Each tile's distance to the river's line, and the channel's half width at the point nearest it:
  // the line is stamped as points a quarter tile apart along the edge, each over the tiles it reaches.
  // (Measured along the edge instead, a hairpin bend drags the valley across the land beside it.)
  const reach = Math.ceil(RIVER_MOUTH_TILES / 2 + VALLEY_LEVEL_TILES + VALLEY_REACH_RISE);
  const nearest = new Float32Array(size * size).fill(Infinity);
  const halfAt = new Float32Array(size * size);
  for (let d = mouthIn - RIVER_INLAND_TILES; d <= size - 1; d += RIVER_STEP_TILES) {
    const t = riverAt(d);
    const half =
      (RIVER_INLAND_TILES +
        (RIVER_MOUTH_TILES - RIVER_INLAND_TILES) *
          (1 - smoothstep(0, RIVER_WIDEN_TILES, d - mouthIn))) /
      2;
    // The point in grid tiles, so the loops below run along rows.
    const px = edge === 0 ? d : edge === 1 ? size - 1 - d : t;
    const pz = edge === 2 ? d : edge === 3 ? size - 1 - d : t;
    const x0 = Math.max(0, Math.floor(px) - reach);
    const x1 = Math.min(size - 1, Math.ceil(px) + reach);
    for (
      let z = Math.max(0, Math.floor(pz) - reach);
      z <= Math.min(size - 1, Math.ceil(pz) + reach);
      z++
    ) {
      const dz2 = (z - pz) * (z - pz);
      for (let i = z * size + x0, x = x0; x <= x1; x++, i++) {
        const dist = (x - px) * (x - px) + dz2;
        if (dist < nearest[i]!) {
          nearest[i] = dist;
          halfAt[i] = half;
        }
      }
    }
  }
  for (let i = 0; i < size * size; i++) {
    if (nearest[i] === Infinity) continue;
    const across = Math.sqrt(nearest[i]!);
    const half = halfAt[i]!;
    if (across < half) {
      height[i] = Math.min(height[i]!, RIVER_BED);
    } else {
      const rise = Math.max(0, across - half - VALLEY_LEVEL_TILES);
      height[i] = Math.min(height[i]!, VALLEY_FLOOR + rise);
    }
  }
  return height;
}

/**
 * Generator 2, the coast: generator 1's hills and lakes with one sea along an
 * edge the seed picks and one river winding across to it, in a valley.
 * Water, trees and the spawn are worked out again over the shaped heights.
 */
export function generateCoastMap(seed: number, name: string): MapData {
  const size = MAP_SIZE;
  const hills = generateProceduralMap(seed, name);
  const height = shapeCoast(seed, hills.height);
  const water = new Uint8Array(size * size);
  const trees = new Uint8Array(size * size);
  const treeNoise = treeNoiseFor(seed);
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const i = z * size + x;
      if (height[i]! < SEA_LEVEL) water[i] = 1;
      else trees[i] = treeDensityAt(treeNoise, x, z);
    }
  }
  const spawn = findSpawn(size, height, water);
  return { name, size, height, water, trees, seaLevel: SEA_LEVEL, spawn };
}

/** The terrain of `generator` for `seed`. An id no generator has is refused, never defaulted. */
export function generateMap(generator: number, seed: number, name: string): MapData {
  switch (generator) {
    case MapGenerator.Hills:
      return generateProceduralMap(seed, name);
    case MapGenerator.Coast:
      return generateCoastMap(seed, name);
    default:
      throw new Error(`unknown map generator ${generator}`);
  }
}

// ---------------------------------------------------------------------------
// Raster map decoding — pure resample (bilinear) from already-decoded
// source pixels onto the MAP_SIZE grid. PNG bytes -> pixels happens
// elsewhere; this function is pure math.
// ---------------------------------------------------------------------------

export interface RasterMapSource {
  width: number;
  height: number;
  heightPx: Uint8ClampedArray | Uint16Array;
  treePx?: Uint8ClampedArray;
}

export interface DecodeMapOptions {
  name: string;
  minHeight: number;
  maxHeight: number;
  seaLevel: number;
}

/** Maps a destination index to a source coordinate, pixel-center aligned. */
function sampleCoord(dstIndex: number, dstSize: number, srcSize: number): number {
  if (srcSize <= 1) return 0;
  const raw = (dstIndex + 0.5) * (srcSize / dstSize) - 0.5;
  return clamp(raw, 0, srcSize - 1);
}

function bilinear(
  getPixel: (col: number, row: number) => number,
  srcW: number,
  srcH: number,
  sx: number,
  sz: number,
): number {
  const x0 = Math.floor(sx);
  const z0 = Math.floor(sz);
  const x1 = Math.min(srcW - 1, x0 + 1);
  const z1 = Math.min(srcH - 1, z0 + 1);
  const fx = sx - x0;
  const fz = sz - z0;

  const v00 = getPixel(x0, z0);
  const v10 = getPixel(x1, z0);
  const v01 = getPixel(x0, z1);
  const v11 = getPixel(x1, z1);

  const top = v00 + (v10 - v00) * fx;
  const bottom = v01 + (v11 - v01) * fx;
  return top + (bottom - top) * fz;
}

/**
 * Pure resample of already-decoded raster pixels onto the MAP_SIZE grid.
 * Tiles below `opts.seaLevel` become water; tree density comes from
 * `raw.treePx` if supplied (resampled the same way), else 0 everywhere, and
 * is always suppressed under water regardless of source.
 */
export function decodeMap(raw: RasterMapSource, opts: DecodeMapOptions): MapData {
  const size = MAP_SIZE;
  const n = size * size;
  const srcW = raw.width;
  const srcH = raw.height;
  const heightPx = raw.heightPx;
  const treePx = raw.treePx;
  const maxRaw = heightPx instanceof Uint16Array ? 65535 : 255;
  const heightRange = opts.maxHeight - opts.minHeight;

  const getHeightPixel = (col: number, row: number): number => heightPx[row * srcW + col]!;
  const getTreePixel = treePx
    ? (col: number, row: number): number => treePx[row * srcW + col]!
    : undefined;

  const height = new Float32Array(n);
  const water = new Uint8Array(n);
  const trees = new Uint8Array(n);

  for (let z = 0; z < size; z++) {
    const sz = sampleCoord(z, size, srcH);
    for (let x = 0; x < size; x++) {
      const sx = sampleCoord(x, size, srcW);
      const i = z * size + x;

      const rawHeight = bilinear(getHeightPixel, srcW, srcH, sx, sz);
      const norm = rawHeight / maxRaw;
      const h = opts.minHeight + norm * heightRange;
      height[i] = h;

      const isWater = h < opts.seaLevel;
      water[i] = isWater ? 1 : 0;

      if (!isWater && getTreePixel) {
        const rawTree = bilinear(getTreePixel, srcW, srcH, sx, sz);
        trees[i] = clamp(Math.round(rawTree), 0, 255);
      } else {
        trees[i] = 0;
      }
    }
  }

  const spawn = findSpawn(size, height, water);

  return { name: opts.name, size, height, water, trees, seaLevel: opts.seaLevel, spawn };
}
