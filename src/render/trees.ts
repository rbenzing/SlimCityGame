/**
 * Tree kit: four species — broadleaf, pine, poplar, shrub —
 * each a merged low-poly BufferGeometry (built once) driving a single
 * InstancedMesh (one draw call per species, four total). Placement is
 * deterministic from a seed via a local mulberry32 PRNG;
 * species choice is a pure function of map data (elevation/water/density)
 * plus a position-keyed hash tiebreak where bands overlap — zero
 * Math.random anywhere. Uses the night-window idiom of baking
 * per-instance identity into instanced buffers, applied here to color
 * instead of a lit-window threshold.
 *
 * Natural scatter: per-tile counts are modulated by clusterNoise
 * (a smooth seeded value-noise field over tile coords) so equal-density
 * regions still produce clearings and thickets; jitter spans ±0.46 of a tile
 * with a rejection-resampled minimum same-tile separation (sampleTileOffset);
 * and a per-tile standMaturity draw correlates a stand's instances toward a
 * young or mature scale range (scaleRangeForStand). All of it is driven purely
 * by the mulberry32(seed) stream plus tileHash-style hashing — zero
 * Math.random anywhere, and clearAt's tile-keyed bookkeeping is unaffected.
 */
import * as THREE from 'three';
import { MapData, TilePoint } from '../shared/types';
import { TILE_METERS } from '../shared/constants';

export type TreeSpecies = 'broadleaf' | 'pine' | 'poplar' | 'shrub';

type SpeciesRecord<T> = Record<TreeSpecies, T>;

const SPECIES_LIST: readonly TreeSpecies[] = ['broadleaf', 'pine', 'poplar', 'shrub'];

// ---------------------------------------------------------------------------
// Placement thresholds
// ---------------------------------------------------------------------------

/** Tiles at/under this density place no trees at all. */
export const TREE_DENSITY_THRESHOLD = 96;
/** At/above this density, up to MAX_TREES_PER_TILE_DENSE trees place (the "forest read"). */
export const HIGH_DENSITY_THRESHOLD = 200;
/** The 1-2 rule's divisor and cap, for density in (TREE_DENSITY_THRESHOLD, HIGH_DENSITY_THRESHOLD). */
export const TREES_PER_DENSITY_UNIT = 96;
export const MAX_TREES_PER_TILE = 2;
export const MAX_TREES_PER_TILE_DENSE = 3;
/** Absolute per-tile cap AFTER cluster-noise modulation (counts clamp 0-4 per tile) — see treeCountForTile. */
export const MAX_TREES_PER_TILE_SCATTERED = 4;

/** pine if elevation exceeds this many meters. */
export const PINE_ELEVATION_METERS = 18;
/** poplar if within this many tiles (Chebyshev distance) of a water tile. */
export const WATER_PROXIMITY_TILES = 2;
/** shrub if tree density is under this value ("forest edges"). */
export const SHRUB_DENSITY_MAX = 128;

/**
 * Young-stand per-instance scale range (young stands 0.45-0.9), i.e.
 * standMaturity near 0. Also the range a
 * sapling-outlier instance draws from regardless of its tile's maturity.
 */
export const YOUNG_SCALE_MIN = 0.45;
export const YOUNG_SCALE_MAX = 0.9;
/** Mature-stand per-instance scale range (mature stands 1.0-1.6), i.e. standMaturity near 1. */
export const MATURE_SCALE_MIN = 1.0;
export const MATURE_SCALE_MAX = 1.6;
/** Absolute scale bounds across every stand (young through mature) — see scaleRangeForStand. */
export const SCALE_MIN = YOUNG_SCALE_MIN;
export const SCALE_MAX = MATURE_SCALE_MAX;

/**
 * Max jitter offset from tile center on each axis, as a fraction of tile size
 * — the offset range spans ±0.46 of a tile.
 * Edge margin only: 2*JITTER_MAX_FRACTION (0.92) stays under a full tile
 * width, so a tree's world position never bleeds into a neighboring tile —
 * clearAt's per-tile ownership stays exact.
 */
export const JITTER_MAX_FRACTION = 0.46;
/**
 * Minimum center-to-center separation between two trees placed in the same
 * tile, as a fraction of tile size (minimum same-tile separation) — keeps
 * the wider jitter from letting
 * multi-tree tiles self-overlap. See sampleTileOffset.
 */
export const MIN_SAME_TILE_SEPARATION_FRACTION = 0.25;
/**
 * Rejection-resample attempts sampleTileOffset spends looking for a
 * same-tile-separated draw before accepting the least-crowded candidate it
 * saw (rejection-resample a few times from the SAME rng stream) — bounded so
 * placement always terminates deterministically.
 */
export const JITTER_RESAMPLE_ATTEMPTS = 6;
/**
 * Chance any individual tree in a multi-tree tile instead draws a
 * young/sapling-sized scale regardless of its tile's stand maturity
 * (one tree may draw a sapling-sized outlier). See scaleRangeForStand.
 */
export const SAPLING_OUTLIER_PROBABILITY = 0.12;

/** Max lean angle off vertical, radians (~5.2 degrees) — a slight natural tilt, not a toppled tree. */
export const LEAN_MAX_RADIANS = 0.09;

/** Per-instance hue/value jitter bounds (+/-6%). */
export const HUE_JITTER_MAX = 0.06;
export const VALUE_JITTER_MAX = 0.06;
/**
 * Fixed per-channel weights approximating a hue rotation within the green
 * family: R and B trade off oppositely (sum to zero, so pure hue jitter
 * doesn't shift overall brightness) while G stays the anchor channel —
 * positive hueJitter leans warmer/olive, negative leans cooler/blue-green.
 */
const HUE_TILT_R = 1;
const HUE_TILT_G = 0;
const HUE_TILT_B = -1;

/**
 * Feature size, in tiles, of the cluster-noise density-modulation field
 * (feature size ~6-10 tiles) — the scale at which clearings/thickets should
 * read.
 */
export const CLUSTER_NOISE_CELL_TILES = 8;
/** clusterNoise's upper bound (0.0-1.6x). */
export const CLUSTER_NOISE_MAX = 1.6;
/** Feature size, in tiles, of the stand-maturity noise field — larger than a single tile so a whole clump reads as one age cohort ("stand"), not per-tree static. */
export const STAND_MATURITY_CELL_TILES = 10;

// ---------------------------------------------------------------------------
// Deterministic PRNG (public-domain mulberry32); never Math.random.
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 32-bit avalanche hash of (x, z, seed) -> [0,1), used ONLY for the species
 * overlap tiebreak (a hash(x,z,seed) tiebreak mixes bands).
 * Deliberately independent of the sequential mulberry32 jitter stream so
 * species choice is a pure function of tile identity, not of placement
 * iteration order. clusterNoise/standMaturity below use the same avalanche
 * technique (latticeHash) but salt `seed` apart first so the two noise
 * fields and this tiebreak never correlate.
 */
function tileHash(x: number, z: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

// ---------------------------------------------------------------------------
// Deterministic value noise: backs
// clusterNoise (density modulation) and standMaturity (stand-correlated
// scale). Same bilinear-lattice-hash + quintic-fade technique as
// terrain.ts's valueNoise2D — a fresh, dependency-free copy here (this file
// stays self-contained, matching its locally-reimplemented-mulberry32 style)
// keyed on TILE coordinates rather than world meters.
// ---------------------------------------------------------------------------

/**
 * 32-bit avalanche hash of (ix, iz, seed) -> [0,1) — the lattice-corner
 * primitive behind valueNoise2D. Same technique as tileHash/terrain.ts's
 * hash01; callers decorrelate channels by XOR-salting `seed` before calling
 * in (the same idiom world/maps.ts uses to keep its tree-density noise
 * independent of its terrain-height noise).
 */
function latticeHash(ix: number, iz: number, seed: number): number {
  let h =
    (Math.imul(ix | 0, 374761393) +
      Math.imul(iz | 0, 668265263) +
      Math.imul(seed | 0, 2246822519)) >>>
    0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/** Quintic smoothstep (Perlin's improved fade curve) — smooths the value-noise lattice interpolation. */
const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

/**
 * Deterministic, smoothed 2D value noise in [0,1) over TILE coordinates,
 * sampled on a lattice of `cellTiles` tiles per cycle (one octave is
 * enough). Bilinear blend of the 4 surrounding
 * lattice hashes with a quintic fade, so it reads as smooth clumps/stands
 * rather than a blocky per-tile grid. Pure; no Math.random/Date.now.
 */
function valueNoise2D(x: number, z: number, cellTiles: number, seed: number): number {
  const gx = x / cellTiles;
  const gz = z / cellTiles;
  const x0 = Math.floor(gx);
  const z0 = Math.floor(gz);
  const tx = fade(gx - x0);
  const tz = fade(gz - z0);
  const h00 = latticeHash(x0, z0, seed);
  const h10 = latticeHash(x0 + 1, z0, seed);
  const h01 = latticeHash(x0, z0 + 1, seed);
  const h11 = latticeHash(x0 + 1, z0 + 1, seed);
  const top = lerp(h00, h10, tx);
  const bottom = lerp(h01, h11, tx);
  return lerp(top, bottom, tz);
}

// ---------------------------------------------------------------------------
// Pure placement rules
// ---------------------------------------------------------------------------

/**
 * BASE trees per tile from density, before cluster-noise modulation (see
 * treeCountForTile): the floor(density/96) rule (capped at 2) below
 * HIGH_DENSITY_THRESHOLD, else a flat 3 (density >= 200 tiles may place up to
 * 3 trees). At/under TREE_DENSITY_THRESHOLD, no trees
 * place at all — and since treeCountForTile only ever MULTIPLIES this base,
 * that gate holds no matter what clusterNoise says.
 */
export function treeCountForDensity(density: number): number {
  if (density <= TREE_DENSITY_THRESHOLD) return 0;
  if (density >= HIGH_DENSITY_THRESHOLD) return MAX_TREES_PER_TILE_DENSE;
  return Math.min(MAX_TREES_PER_TILE, Math.floor(density / TREES_PER_DENSITY_UNIT));
}

/**
 * Is any tile within `radius` tiles (Chebyshev distance, i.e. a
 * (2*radius+1)-wide square neighborhood) of (x, z) water? Bounds-clamped, so
 * querying near a map edge never throws.
 */
export function isNearWater(map: MapData, x: number, z: number, radius: number): boolean {
  const size = map.size;
  const minX = Math.max(0, x - radius);
  const maxX = Math.min(size - 1, x + radius);
  const minZ = Math.max(0, z - radius);
  const maxZ = Math.min(size - 1, z + radius);
  for (let zz = minZ; zz <= maxZ; zz++) {
    for (let xx = minX; xx <= maxX; xx++) {
      if (map.water[zz * size + xx]) return true;
    }
  }
  return false;
}

/**
 * Species from map data: pine above PINE_ELEVATION_METERS,
 * poplar within WATER_PROXIMITY_TILES of water, shrub under
 * SHRUB_DENSITY_MAX, broadleaf otherwise. Where a tile qualifies for more
 * than one band simultaneously, hash(x,z,seed) tiebreaks among ONLY the
 * eligible bands (never broadleaf, which is strictly the "nothing applies"
 * fallback) — this is what makes forest-edge/water-edge/elevation-band
 * boundaries mix naturally instead of one band always winning the overlap.
 */
export function speciesFor(
  elevation: number,
  nearWater: boolean,
  density: number,
  x: number,
  z: number,
  seed: number,
): TreeSpecies {
  const candidates: TreeSpecies[] = [];
  if (elevation > PINE_ELEVATION_METERS) candidates.push('pine');
  if (nearWater) candidates.push('poplar');
  if (density < SHRUB_DENSITY_MAX) candidates.push('shrub');

  if (candidates.length === 0) return 'broadleaf';
  if (candidates.length === 1) return candidates[0]!;

  const pick = Math.min(
    candidates.length - 1,
    Math.floor(tileHash(x, z, seed) * candidates.length),
  );
  return candidates[pick]!;
}

/**
 * Cluster-noise density multiplier in [0, CLUSTER_NOISE_MAX): a smooth
 * value-noise field over tile coordinates
 * (feature size CLUSTER_NOISE_CELL_TILES tiles) that multiplies each tile's
 * tree count, so
 * equal-density map regions still produce clearings, thickets, and lone
 * trees instead of a uniform per-tile count — see treeCountForTile, which
 * applies this to treeCountForDensity's base. Salted apart from tileHash's
 * species tiebreak and standMaturity's field so all three stay decorrelated.
 */
export function clusterNoise(x: number, z: number, seed: number): number {
  const salted = (seed ^ 0x1f5b3aa1) >>> 0;
  return valueNoise2D(x, z, CLUSTER_NOISE_CELL_TILES, salted) * CLUSTER_NOISE_MAX;
}

/**
 * Per-tile "stand maturity" in [0,1): an
 * independent noise/hash channel (decorrelated from clusterNoise and from
 * speciesFor's tileHash via a distinct seed salt) driving scaleRangeForStand.
 * Smoothed over STAND_MATURITY_CELL_TILES tiles so a whole clump of trees
 * reads as one age cohort rather than each tree rolling its age alone.
 */
export function standMaturity(x: number, z: number, seed: number): number {
  const salted = (seed ^ 0x2545f491) >>> 0;
  return valueNoise2D(x, z, STAND_MATURITY_CELL_TILES, salted);
}

/**
 * Final per-tile tree count:
 * treeCountForDensity's base count times clusterNoise(x,z,seed), rounded and
 * clamped to [0, MAX_TREES_PER_TILE_SCATTERED]. A tile at/under
 * TREE_DENSITY_THRESHOLD has a base of 0, so clusterNoise can never conjure
 * trees where the density rule says there should be none; above the
 * threshold, it reshapes what would otherwise be a uniform per-tile count
 * into clearings (rounds down to 0) and thickets (rounds up to 4).
 */
export function treeCountForTile(density: number, x: number, z: number, seed: number): number {
  const base = treeCountForDensity(density);
  if (base === 0) return 0;
  const modulated = base * clusterNoise(x, z, seed);
  return Math.min(MAX_TREES_PER_TILE_SCATTERED, Math.max(0, Math.round(modulated)));
}

/**
 * Per-instance scale range for a stand of the given maturity: the stand
 * maturity draw shifts the scale range (mature stands 1.0-1.6, young stands
 * 0.45-0.9). Lerps linearly from the young
 * range (maturity 0) to the mature range (maturity 1). `isSaplingOutlier`
 * forces the young range regardless of maturity — one instance in an
 * otherwise-mature stand can still read as a young sapling.
 */
export function scaleRangeForStand(maturity: number, isSaplingOutlier: boolean): [number, number] {
  if (isSaplingOutlier) return [YOUNG_SCALE_MIN, YOUNG_SCALE_MAX];
  return [
    lerp(YOUNG_SCALE_MIN, MATURE_SCALE_MIN, maturity),
    lerp(YOUNG_SCALE_MAX, MATURE_SCALE_MAX, maturity),
  ];
}

/**
 * Draws one tile-local jitter offset in meters (each axis within
 * ±JITTER_MAX_FRACTION of a tile) from `rng`, rejection-resampling up to
 * JITTER_RESAMPLE_ATTEMPTS times against `existing` same-tile offsets so
 * multi-tree tiles don't self-overlap despite the wide jitter (a minimum
 * same-tile separation). Always
 * consumes rng in a fixed pattern determined entirely by its own draws and
 * `existing` — 2 draws per attempt, stopping as soon as a candidate clears
 * `minSeparationMeters` from every existing offset, or after
 * JITTER_RESAMPLE_ATTEMPTS attempts — so the same rng stream (i.e. the same
 * seed) always reproduces the same result. Never throws or loops
 * unboundedly: once attempts are exhausted it accepts whichever candidate
 * was least-crowded (a best-effort spacing heuristic, not a hard packing
 * guarantee — pathological density can still land two trees closer than
 * minSeparationMeters).
 */
export function sampleTileOffset(
  rng: () => number,
  existing: ReadonlyArray<readonly [number, number]>,
  minSeparationMeters: number,
): [number, number] {
  const bound = JITTER_MAX_FRACTION * TILE_METERS;
  let bestCandidate: [number, number] = [0, 0];
  let bestMinDist = -Infinity;

  for (let attempt = 0; attempt < JITTER_RESAMPLE_ATTEMPTS; attempt++) {
    const x = (rng() * 2 - 1) * bound;
    const z = (rng() * 2 - 1) * bound;

    if (existing.length === 0) return [x, z];

    let minDist = Infinity;
    for (const [ex, ez] of existing) {
      const dist = Math.hypot(x - ex, z - ez);
      if (dist < minDist) minDist = dist;
    }
    if (minDist >= minSeparationMeters) return [x, z];
    if (minDist > bestMinDist) {
      bestMinDist = minDist;
      bestCandidate = [x, z];
    }
  }

  return bestCandidate;
}

/**
 * Per-instance hue/value jitter as an RGB multiplier around 1.0 (+/-6% on
 * species base greens).
 * `hueJitter`/`valueJitter` are each in [-1, 1] (typically 2*rng()-1); value
 * jitter shifts overall brightness uniformly, hue jitter tilts red/blue
 * oppositely (green is the anchor channel) to approximate a hue rotation
 * without a full HSL round-trip. Multiplies against whichever layer holds
 * the species' authored absolute color (a geometry vertex-color bake here),
 * so it composes correctly regardless of that base color's exact RGB ratio.
 */
export function hueValueJitter(hueJitter: number, valueJitter: number): [number, number, number] {
  const hue = hueJitter * HUE_JITTER_MAX;
  const val = valueJitter * VALUE_JITTER_MAX;
  return [1 + hue * HUE_TILT_R + val, 1 + hue * HUE_TILT_G + val, 1 + hue * HUE_TILT_B + val];
}

// ---------------------------------------------------------------------------
// Seasonal tint: a continuous month-keyed ramp, applied ONLY
// to broadleaf + shrub materials by setSeason(). Mirrors scene.ts's
// timeOfDayColors keyframe-ramp idiom, but circular (December wraps to
// January) since a calendar year has no start/end the way a day does.
// ---------------------------------------------------------------------------

/** Desaturated, cool-muted — winter's "no leaf-drop geometry, tint only" look. */
export const WINTER_TINT: readonly [number, number, number] = [0.82, 0.85, 0.86];
/** Fresh yellow-green. */
export const SPRING_TINT: readonly [number, number, number] = [1.05, 1.12, 0.85];
/** Deep — the reference tone the species base colors were authored against. */
export const SUMMER_TINT: readonly [number, number, number] = [1, 1, 1];
/** Olive-brown: boosted red, cut green and blue. */
export const AUTUMN_TINT: readonly [number, number, number] = [1.15, 0.85, 0.55];

/**
 * Anchored at each season's mid-month (matching ui/format.ts's
 * seasonForMonth bounds: Dec-Feb winter, Mar-May spring, Jun-Aug summer,
 * Sep-Nov fall — reimplemented locally rather than imported, since render/
 * never depends on ui/ in this codebase), circularly interpolated so the
 * ramp is continuous month-to-month including the Dec -> Jan wrap.
 */
const SEASON_KEYFRAMES: ReadonlyArray<readonly [number, readonly [number, number, number]]> = [
  [1, WINTER_TINT],
  [4, SPRING_TINT],
  [7, SUMMER_TINT],
  [10, AUTUMN_TINT],
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpTint(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/**
 * Seasonal foliage tint multiplier for the given game month: a continuous
 * ramp spring (fresh) -> summer (deep) -> autumn (olive-brown) -> winter
 * (desaturated), circularly wrapping December -> January. `month` need not
 * be an integer or in 1..12 — it is canonicalized (wrapped) first, so
 * callers never need to clamp.
 */
export function seasonalTint(month: number): [number, number, number] {
  const wrapped = ((((month - 1) % 12) + 12) % 12) + 1; // canonical [1, 13)
  const count = SEASON_KEYFRAMES.length;
  for (let i = 0; i < count; i++) {
    const [m0, c0] = SEASON_KEYFRAMES[i]!;
    const [m1raw, c1] = SEASON_KEYFRAMES[(i + 1) % count]!;
    const m1 = m1raw > m0 ? m1raw : m1raw + 12; // wrap the final segment (10 -> 13)
    if (wrapped >= m0 && wrapped <= m1) {
      const t = (wrapped - m0) / (m1 - m0);
      return lerpTint(c0, c1, t);
    }
  }
  /* istanbul ignore next -- wrapped is always in [1, 13), which the four
     segments [1,4] [4,7] [7,10] [10,13] provably cover in full. */
  throw new Error(`trees: seasonalTint(${month}) fell through the keyframe ramp`);
}

// ---------------------------------------------------------------------------
// Species geometry kits: each a merged low-poly BufferGeometry, built once
// and shared by every instance of that species. A 'color'
// vertex attribute bakes in each part's authored absolute tone (e.g.
// broadleaf's brown trunk vs green canopy); material.color stays a pure
// multiplier (identity until setSeason touches it) and instanceColor
// carries the per-instance jitter — see TreeRenderer's class doc for how
// the three layers compose.
// ---------------------------------------------------------------------------

const RADIAL_SEGMENTS = 6;
const BLOB_WIDTH_SEGMENTS = 7;
const BLOB_HEIGHT_SEGMENTS = 5;

const TRUNK_COLOR = 0x6b4a2f;
const BROADLEAF_CANOPY_COLOR = 0x2f6b3a;
const PINE_COLOR = 0x24503a;
const POPLAR_COLOR = 0x5c8a4a;
const SHRUB_COLOR = 0x6b7a3f;

/** Paints every vertex of `geometry` the same absolute color (RGB baked in, not a multiplier). */
function paintVertexColor(geometry: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const position = geometry.getAttribute('position');
  const count = position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/**
 * Merges several BufferGeometries (each already given local position via
 * .translate()/.scale()/etc. and a baked 'color' attribute) into one indexed
 * BufferGeometry carrying position/normal/uv/color through unchanged — a
 * self-contained stand-in for three/addons' BufferGeometryUtils.mergeGeometries
 * (this file's own utilities stay dependency-free, matching its existing
 * locally-reimplemented-mulberry32 style). Normals are copied as-is (each
 * part's .translate()/.scale() already transforms them correctly), so the
 * low-poly faceting between parts is preserved rather than smoothed over.
 */
function mergeGeometryParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let vertexCount = 0;
  let indexCount = 0;
  for (const part of parts) {
    const position = part.getAttribute('position');
    if (!position) throw new Error('trees: geometry part missing a position attribute');
    vertexCount += position.count;
    const index = part.getIndex();
    indexCount += index ? index.count : position.count;
  }

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const colors = new Float32Array(vertexCount * 3).fill(1);
  const indices = new Uint32Array(indexCount);

  let vertexOffset = 0;
  let indexOffset = 0;
  for (const part of parts) {
    const position = part.getAttribute('position');
    const normal = part.getAttribute('normal');
    const uv = part.getAttribute('uv');
    const color = part.getAttribute('color');
    const index = part.getIndex();
    const count = position.count;

    for (let i = 0; i < count; i++) {
      const vi = vertexOffset + i;
      positions[vi * 3] = position.getX(i);
      positions[vi * 3 + 1] = position.getY(i);
      positions[vi * 3 + 2] = position.getZ(i);
      if (normal) {
        normals[vi * 3] = normal.getX(i);
        normals[vi * 3 + 1] = normal.getY(i);
        normals[vi * 3 + 2] = normal.getZ(i);
      }
      if (uv) {
        uvs[vi * 2] = uv.getX(i);
        uvs[vi * 2 + 1] = uv.getY(i);
      }
      if (color) {
        colors[vi * 3] = color.getX(i);
        colors[vi * 3 + 1] = color.getY(i);
        colors[vi * 3 + 2] = color.getZ(i);
      }
    }

    if (index) {
      for (let i = 0; i < index.count; i++) {
        indices[indexOffset + i] = vertexOffset + index.getX(i);
      }
      indexOffset += index.count;
    } else {
      for (let i = 0; i < count; i++) {
        indices[indexOffset + i] = vertexOffset + i;
      }
      indexOffset += count;
    }

    vertexOffset += count;
    part.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  return merged;
}

const BROADLEAF_TRUNK_HEIGHT = 1.8;
const BROADLEAF_TRUNK_RADIUS_TOP = 0.16;
const BROADLEAF_TRUNK_RADIUS_BOTTOM = 0.22;
/** 2-3 offset canopy blobs clustered above the trunk: [x, yOffsetAboveTrunkTop, z, radius]. */
const BROADLEAF_CANOPY_BLOBS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 1.5, 0, 1.3],
  [0.85, 1.0, 0.2, 1.0],
  [-0.75, 0.75, -0.4, 0.95],
];

/** Broadleaf: 2-3 offset canopy blobs + trunk, the "default" species. */
function buildBroadleafGeometry(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(
    BROADLEAF_TRUNK_RADIUS_TOP,
    BROADLEAF_TRUNK_RADIUS_BOTTOM,
    BROADLEAF_TRUNK_HEIGHT,
    RADIAL_SEGMENTS,
  );
  trunk.translate(0, BROADLEAF_TRUNK_HEIGHT / 2, 0);
  paintVertexColor(trunk, TRUNK_COLOR);

  const parts: THREE.BufferGeometry[] = [trunk];
  for (const [ox, oy, oz, radius] of BROADLEAF_CANOPY_BLOBS) {
    const blob = new THREE.SphereGeometry(radius, BLOB_WIDTH_SEGMENTS, BLOB_HEIGHT_SEGMENTS);
    blob.translate(ox, BROADLEAF_TRUNK_HEIGHT + oy, oz);
    paintVertexColor(blob, BROADLEAF_CANOPY_COLOR);
    parts.push(blob);
  }

  return mergeGeometryParts(parts);
}

/** Bottom-widest -> top-narrowest tiers. */
const PINE_TIERS: ReadonlyArray<{ height: number; radius: number }> = [
  { height: 2.6, radius: 1.15 },
  { height: 2.0, radius: 0.82 },
  { height: 1.5, radius: 0.5 },
];
/** Fraction of a tier's height before the next tier starts, so tiers overlap into one continuous silhouette rather than 3 stacked discs with visible seams. */
const PINE_TIER_OVERLAP = 0.62;

/** Pine: 3 stacked narrowing cones, tall — placed above PINE_ELEVATION_METERS. */
function buildPineGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  let baseY = 0;
  for (const tier of PINE_TIERS) {
    const cone = new THREE.ConeGeometry(tier.radius, tier.height, RADIAL_SEGMENTS);
    cone.translate(0, baseY + tier.height / 2, 0);
    paintVertexColor(cone, PINE_COLOR);
    parts.push(cone);
    baseY += tier.height * PINE_TIER_OVERLAP;
  }
  return mergeGeometryParts(parts);
}

const POPLAR_HALF_HEIGHT = 2.6;
const POPLAR_RADIUS = 0.55;

/** Poplar: a single tall, columnar ellipsoid — placed near water. */
function buildPoplarGeometry(): THREE.BufferGeometry {
  const ellipsoid = new THREE.SphereGeometry(1, 8, 6);
  ellipsoid.scale(POPLAR_RADIUS, POPLAR_HALF_HEIGHT, POPLAR_RADIUS);
  ellipsoid.translate(0, POPLAR_HALF_HEIGHT, 0);
  paintVertexColor(ellipsoid, POPLAR_COLOR);
  return mergeGeometryParts([ellipsoid]);
}

const SHRUB_HALF_HEIGHT = 0.5;
const SHRUB_RADIUS = 0.75;

/** Shrub: a single low, near-groundcover blob — forest edges / low density. */
function buildShrubGeometry(): THREE.BufferGeometry {
  const blob = new THREE.SphereGeometry(1, 7, 5);
  blob.scale(SHRUB_RADIUS, SHRUB_HALF_HEIGHT, SHRUB_RADIUS);
  blob.translate(0, SHRUB_HALF_HEIGHT, 0);
  paintVertexColor(blob, SHRUB_COLOR);
  return mergeGeometryParts([blob]);
}

// ---------------------------------------------------------------------------
// TreeRenderer
// ---------------------------------------------------------------------------

interface TreeInstanceRef {
  species: TreeSpecies;
  slot: number;
}

interface PendingTree {
  tileKey: number;
  worldX: number;
  worldZ: number;
  scale: number;
  yaw: number;
  /** Direction (radians, in the XZ plane) the lean tilts toward. */
  leanAxisAngle: number;
  /** Radians tilted off vertical, in [0, LEAN_MAX_RADIANS]. */
  leanMagnitude: number;
  colorMultiplier: readonly [number, number, number];
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _yawQuat = new THREE.Quaternion();
const _leanQuat = new THREE.Quaternion();
const _leanAxis = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();
const HIDDEN_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Four-species tree kit. Each species' geometry and material
 * are built ONCE (constructor) and persist across rebuilds — build() only
 * (re)creates the InstancedMesh + per-instance buffers, so a material
 * mutation like setSeason() naturally survives a later build() call, the
 * same way buildings.ts's nightFactor uniform survives apply().
 *
 * Per-instance color composes three multiplicative layers (standard
 * three.js instancing: diffuseColor = material.color * geometry vertex
 * color * instanceColor):
 *  - geometry 'color' attribute: the species' authored absolute tone(s)
 *    (e.g. broadleaf's brown trunk vs green canopy) — shared, baked once.
 *  - material.color: the seasonal tint multiplier (identity [1,1,1] until
 *    setSeason() is called; only ever reassigned for broadleaf/shrub).
 *  - instanceColor: the per-instance hue/value jitter multiplier.
 */
export class TreeRenderer {
  private readonly scene: THREE.Scene;
  private readonly heightAt: (x: number, z: number) => number;
  private readonly geometries: SpeciesRecord<THREE.BufferGeometry>;
  private readonly materials: SpeciesRecord<THREE.MeshLambertMaterial>;
  private readonly meshes: SpeciesRecord<THREE.InstancedMesh | null> = {
    broadleaf: null,
    pine: null,
    poplar: null,
    shrub: null,
  };
  private readonly tileToInstances = new Map<number, TreeInstanceRef[]>();
  private gridSize = 0;

  constructor(scene: THREE.Scene, heightAt: (x: number, z: number) => number) {
    this.scene = scene;
    this.heightAt = heightAt;
    this.geometries = {
      broadleaf: buildBroadleafGeometry(),
      pine: buildPineGeometry(),
      poplar: buildPoplarGeometry(),
      shrub: buildShrubGeometry(),
    };
    this.materials = {
      broadleaf: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
      pine: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
      poplar: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
      shrub: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    };
  }

  build(map: MapData, seed: number): void {
    this.removeExistingMeshes();
    this.tileToInstances.clear();
    this.gridSize = map.size;

    const bySpecies = this.planPlacements(map, seed);

    for (const species of SPECIES_LIST) {
      const pending = bySpecies[species];
      const capacity = Math.max(1, pending.length);
      const mesh = new THREE.InstancedMesh(
        this.geometries[species],
        this.materials[species],
        capacity,
      );
      mesh.count = pending.length;
      mesh.castShadow = true; // shadow sweep: foliage casts onto ground/buildings
      const colorArray = new Float32Array(capacity * 3).fill(1);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(colorArray, 3);

      for (let slot = 0; slot < pending.length; slot++) {
        const tree = pending[slot]!;
        this.writeInstance(mesh, slot, tree);

        let refs = this.tileToInstances.get(tree.tileKey);
        if (!refs) {
          refs = [];
          this.tileToInstances.set(tree.tileKey, refs);
        }
        refs.push({ species, slot });
      }

      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      this.scene.add(mesh);
      this.meshes[species] = mesh;
    }
  }

  /** Hides every instance on the given tiles, across whichever species mesh each tile's trees actually live in. */
  clearAt(tiles: TilePoint[]): void {
    const touchedSpecies = new Set<TreeSpecies>();

    for (const tile of tiles) {
      const key = tile.z * this.gridSize + tile.x;
      const refs = this.tileToInstances.get(key);
      if (!refs) continue;
      for (const ref of refs) {
        const mesh = this.meshes[ref.species];
        if (!mesh) continue;
        mesh.setMatrixAt(ref.slot, HIDDEN_MATRIX);
        touchedSpecies.add(ref.species);
      }
      this.tileToInstances.delete(key);
    }

    for (const species of touchedSpecies) {
      const mesh = this.meshes[species];
      if (mesh) mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** Seasonal foliage tint: broadleaf + shrub only, pine/poplar stay green. */
  setSeason(month: number): void {
    const [r, g, b] = seasonalTint(month);
    this.materials.broadleaf.color.setRGB(r, g, b);
    this.materials.shrub.color.setRGB(r, g, b);
  }

  /** This species' current InstancedMesh, or null before the first build(). */
  meshFor(species: TreeSpecies): THREE.InstancedMesh | null {
    return this.meshes[species];
  }

  /** This species' persistent material (survives rebuilds — see class doc). */
  materialFor(species: TreeSpecies): THREE.MeshLambertMaterial {
    return this.materials[species];
  }

  private planPlacements(map: MapData, seed: number): SpeciesRecord<PendingTree[]> {
    const rng = mulberry32(seed);
    const bySpecies: SpeciesRecord<PendingTree[]> = {
      broadleaf: [],
      pine: [],
      poplar: [],
      shrub: [],
    };
    const minSeparationMeters = MIN_SAME_TILE_SEPARATION_FRACTION * TILE_METERS;

    for (let z = 0; z < map.size; z++) {
      for (let x = 0; x < map.size; x++) {
        const idx = z * map.size + x;
        if ((map.water[idx] ?? 0) !== 0) continue;

        const density = map.trees[idx] ?? 0;
        const count = treeCountForTile(density, x, z, seed);
        if (count === 0) continue;

        const elevation = map.height[idx] ?? 0;
        const nearWater = isNearWater(map, x, z, WATER_PROXIMITY_TILES);
        const species = speciesFor(elevation, nearWater, density, x, z, seed);

        const tileCenterX = (x + 0.5) * TILE_METERS;
        const tileCenterZ = (z + 0.5) * TILE_METERS;
        const maturity = standMaturity(x, z, seed);
        const placedOffsets: Array<[number, number]> = [];

        for (let i = 0; i < count; i++) {
          const offset = sampleTileOffset(rng, placedOffsets, minSeparationMeters);
          placedOffsets.push(offset);

          const isSaplingOutlier = count > 1 && rng() < SAPLING_OUTLIER_PROBABILITY;
          const [scaleMin, scaleMax] = scaleRangeForStand(maturity, isSaplingOutlier);
          const scale = scaleMin + rng() * (scaleMax - scaleMin);

          const yaw = rng() * Math.PI * 2;
          const leanAxisAngle = rng() * Math.PI * 2;
          const leanMagnitude = rng() * LEAN_MAX_RADIANS;
          const hueJitter = rng() * 2 - 1;
          const valueJitter = rng() * 2 - 1;

          bySpecies[species].push({
            tileKey: idx,
            worldX: tileCenterX + offset[0],
            worldZ: tileCenterZ + offset[1],
            scale,
            yaw,
            leanAxisAngle,
            leanMagnitude,
            colorMultiplier: hueValueJitter(hueJitter, valueJitter),
          });
        }
      }
    }

    return bySpecies;
  }

  private writeInstance(mesh: THREE.InstancedMesh, slot: number, tree: PendingTree): void {
    const groundY = this.heightAt(tree.worldX, tree.worldZ);

    _yawQuat.setFromAxisAngle(Y_AXIS, tree.yaw);
    _leanAxis.set(Math.cos(tree.leanAxisAngle), 0, Math.sin(tree.leanAxisAngle));
    _leanQuat.setFromAxisAngle(_leanAxis, tree.leanMagnitude);
    _quaternion.copy(_leanQuat).multiply(_yawQuat);

    _position.set(tree.worldX, groundY, tree.worldZ);
    _scale.set(tree.scale, tree.scale, tree.scale);
    _matrix.compose(_position, _quaternion, _scale);
    mesh.setMatrixAt(slot, _matrix);

    _color.setRGB(tree.colorMultiplier[0], tree.colorMultiplier[1], tree.colorMultiplier[2]);
    mesh.setColorAt(slot, _color);
  }

  /** Removes the current per-species meshes from the scene. Geometries/materials are shared and persist (never disposed here). */
  private removeExistingMeshes(): void {
    for (const species of SPECIES_LIST) {
      const mesh = this.meshes[species];
      if (mesh) this.scene.remove(mesh);
      this.meshes[species] = null;
    }
  }
}
