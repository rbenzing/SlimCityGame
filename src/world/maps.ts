/**
 * SlimCity map data: a deterministic procedural
 * fallback terrain generator, plus a pure raster-to-grid resampler for
 * AI-generated map packs. No I/O and no three.js/DOM here — PNG decoding to
 * pixels happens elsewhere; this module only turns numbers into numbers.
 */

import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { MAP_SIZE, MAX_BUILD_SLOPE, SEA_LEVEL } from '../shared/constants';
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

function terrainBuildable(
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

/**
 * Deterministic simplex-noise FBM terrain: heights roughly -8..40m, water
 * where height < SEA_LEVEL, tree density from a second noise field on land,
 * spawn placed on the most-buildable tile near the map center.
 */
export function generateProceduralMap(seed: number, name: string): MapData {
  const size = MAP_SIZE;
  const n = size * size;

  const terrainNoise = createNoise2D(mulberry32(seed));
  const treeNoise = createNoise2D(mulberry32((seed ^ TREE_SEED_SALT) >>> 0));

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
        const t = fbm(
          treeNoise,
          x * TREE_FREQUENCY,
          z * TREE_FREQUENCY,
          TREE_OCTAVES,
          TREE_LACUNARITY,
          TREE_GAIN,
        );
        trees[i] = clamp(Math.round(((t + 1) / 2) * 255), 0, 255);
      }
    }
  }

  const spawn = findSpawn(size, height, water);

  return { name, size, height, water, trees, seaLevel: SEA_LEVEL, spawn };
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
