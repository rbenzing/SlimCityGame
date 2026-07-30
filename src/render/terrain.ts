/**
 * Chunked terrain renderer. Chunk meshes
 * are heightmap-displaced PlaneGeometry with per-vertex colors: sand/grass/
 * rock ramp above sea level (with ground-cover hue/patch/mown texture),
 * a seabed depth ramp below sea level, and a shoreline foam band straddling
 * SEA_LEVEL — so the land-to-water line reads correctly under the translucent
 * water surface owned by water.ts (this module does not render water;
 * WaterRenderer is the single owner). markDirty()/update() support incremental
 * rebuilds when the sim terraforms the map (applyHeightPatches) or the road
 * network changes (applyRoadTiles, for the "mown" ground-cover band).
 */

import * as THREE from 'three';
import type { MapData, TilePoint } from '../shared/types';
import {
  CHUNK_TILES,
  CHUNKS_PER_SIDE,
  MAP_SIZE,
  MAX_BUILD_SLOPE,
  MAX_WATER_DEPTH_VIS,
  SEA_LEVEL,
  SHORELINE_BAND_METERS,
  TILE_METERS,
} from '../shared/constants';

// --- pure color ramp ---------------------------------------------------------

const SAND_BAND_METERS = 3; // meters above SEA_LEVEL that fade sand -> ground cover
const GRASS_MAX_HEIGHT = 130; // meters at which elevation-driven effects (patchiness) saturate
const ROCK_BLEND_RANGE = 3; // meters of slope beyond MAX_BUILD_SLOPE to fully saturate to rock
const TREE_DARKEN_MAX = 0.35; // fraction darkened at full (255) tree density (canopy-shadow read)

const SAND_COLOR: readonly [number, number, number] = [0.8, 0.74, 0.52];
const ROCK_COLOR: readonly [number, number, number] = [0.45, 0.43, 0.4];

// Water rendering — terrain-side seabed/shoreline treatment. The water
// SURFACE itself (translucent plane, waves, glint) is water.ts's; this is
// only the terrain color read through/around it.
const SEABED_SHALLOW_COLOR: readonly [number, number, number] = [0.55, 0.52, 0.38]; // sandy seabed just under the surface
const SEABED_DEEP_COLOR: readonly [number, number, number] = [0.02, 0.1, 0.15]; // deep blue-green, fully tinted at MAX_WATER_DEPTH_VIS
const FOAM_COLOR: readonly [number, number, number] = [0.93, 0.91, 0.84]; // shoreline sand/foam highlight

// Ground cover — grass hue variants, dry patches, mown band.
const GRASS_HUE_FRESH: readonly [number, number, number] = [0.32, 0.58, 0.26];
const GRASS_HUE_OLIVE: readonly [number, number, number] = [0.42, 0.5, 0.24];
const GRASS_HUE_YELLOW: readonly [number, number, number] = [0.58, 0.56, 0.22];
const DRY_PATCH_COLOR: readonly [number, number, number] = [0.5, 0.42, 0.22];
const MOWN_GREEN_COLOR: readonly [number, number, number] = [0.28, 0.62, 0.28];

/** Low-frequency cell size (meters/cycle) for the 3-hue grass blend — the "different grass types" read. */
const GRASS_HUE_CELL_METERS = 96;
/** Higher-frequency cell size (meters/cycle) for the brown dry-patch splotches. */
const DRY_PATCH_CELL_METERS = 26;
const GRASS_HUE_SEED = 1337;
const DRY_PATCH_SEED = 9173;

// Perimeter earth cross-section skirt — TerrainRenderer.build() adds a
// vertical quad strip along each of the 4 map-boundary edges, dropping from
// the terrain surface down to a fixed base so the map edge reads as a real
// cross-section instead of "floating layers" from outside. Colors ramp
// topsoil (matches the local surface color) -> dirt brown -> rock at the
// base; a single MeshLambertMaterial, no new shader.
/** Fixed absolute elevation (meters) every skirt vertex bottoms out at, regardless of local surface height. */
const SKIRT_BASE_Y = -18;
/** Depth (meters) below the surface that still reads as topsoil before the flat dirt-brown band takes over. */
const SKIRT_TOPSOIL_METERS = 0.6;
/** Meters directly above SKIRT_BASE_Y across which dirt blends to rock (anchored to the fixed base, not the surface). */
const SKIRT_ROCK_BAND_METERS = 4;
/** #6b4a2f dirt-brown anchor. */
const SKIRT_DIRT_COLOR: readonly [number, number, number] = [0x6b / 255, 0x4a / 255, 0x2f / 255];
/** #4a3b30 rock anchor at the fixed base. */
const SKIRT_ROCK_COLOR: readonly [number, number, number] = [0x4a / 255, 0x3b / 255, 0x30 / 255];
/** Cell size (meters/cycle) for the deterministic dirt-brown variation noise. */
const SKIRT_DIRT_VARIATION_CELL_METERS = 14;
const SKIRT_DIRT_VARIATION_SEED = 4271;
/** Max +/- per-channel delta the dirt variation noise applies around the anchor. */
const SKIRT_DIRT_VARIATION_RANGE = 0.06;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const lerp3 = (
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): [number, number, number] => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/**
 * 32-bit avalanche hash of (ix, iz, seed) -> [0,1). Same technique as
 * trees.ts's tileHash (deterministic, no Math.random anywhere), a fresh
 * instance here since terrain's ground-cover noise is keyed by continuous
 * world-meter cell coordinates rather than tile indices.
 */
function hash01(ix: number, iz: number, seed: number): number {
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
 * Deterministic, smoothed 2D value noise in [0,1) at world (x, z) meters,
 * sampled on a lattice of `cellMeters` per cycle. Bilinear blend of the 4
 * surrounding lattice hashes with a quintic fade, so it reads as smooth
 * patches rather than a blocky grid. Pure; no Math.random/Date.now.
 */
export function valueNoise2D(x: number, z: number, cellMeters: number, seed: number): number {
  const gx = x / cellMeters;
  const gz = z / cellMeters;
  const x0 = Math.floor(gx);
  const z0 = Math.floor(gz);
  const tx = fade(gx - x0);
  const tz = fade(gz - z0);
  const h00 = hash01(x0, z0, seed);
  const h10 = hash01(x0 + 1, z0, seed);
  const h01 = hash01(x0, z0 + 1, seed);
  const h11 = hash01(x0 + 1, z0 + 1, seed);
  const top = lerp(h00, h10, tx);
  const bottom = lerp(h01, h11, tx);
  return lerp(top, bottom, tz);
}

/** Fraction (0..1) the vertex color is darkened by dense tree cover — a subtle canopy-shadow read under dense tree clusters. */
export function treeShadeFactor(treeDensity: number): number {
  const treeT = clamp01(treeDensity / 255);
  return 1 - treeT * TREE_DARKEN_MAX;
}

/**
 * Underwater seabed color ramp: sandy just under the surface, ramping to a
 * deep blue-green, fully tinted at MAX_WATER_DEPTH_VIS meters. `depth` is
 * meters below SEA_LEVEL (0 at the surface).
 */
export function seabedDepthColor(depth: number): [number, number, number] {
  const t = clamp01(depth / MAX_WATER_DEPTH_VIS);
  return lerp3(SEABED_SHALLOW_COLOR, SEABED_DEEP_COLOR, t);
}

/**
 * Shoreline foam/sand band weight (0..1, peaking at 1 exactly at SEA_LEVEL,
 * fading to 0 at SHORELINE_BAND_METERS away on either side): vertices within
 * SHORELINE_BAND_METERS of SEA_LEVEL get a sand/foam lightening band.
 */
export function shorelineBandWeight(height: number): number {
  const dist = Math.abs(height - SEA_LEVEL);
  return clamp01(1 - dist / SHORELINE_BAND_METERS);
}

/** 3-hue grass blend (fresh green / olive / yellow-green) from a single low-frequency noise value in [0,1). */
function grassHueBlend(n: number): [number, number, number] {
  if (n < 0.5) return lerp3(GRASS_HUE_FRESH, GRASS_HUE_OLIVE, n / 0.5);
  return lerp3(GRASS_HUE_OLIVE, GRASS_HUE_YELLOW, (n - 0.5) / 0.5);
}

/**
 * Dry-patch blend weight (0..1) from the higher-frequency splotch noise,
 * biased patchier where tree density is low (open plains) and at higher
 * elevation, down in lush/low areas. The noise VALUE at a
 * position never depends on treeDensity/height — only how strongly it's
 * allowed to show through does — so patchiness scales smoothly with those
 * inputs rather than snapping across a moving threshold.
 */
function dryPatchWeight(patchNoise: number, treeDensity: number, height: number): number {
  const signal = clamp01((patchNoise - 0.55) / 0.45);
  const sparseT = 1 - clamp01(treeDensity / 255);
  const elevT = clamp01(
    (height - SEA_LEVEL - SAND_BAND_METERS) / (GRASS_MAX_HEIGHT - SAND_BAND_METERS),
  );
  const bias = clamp01(sparseT * 0.6 + elevT * 0.4 + 0.15);
  return signal * bias;
}

/**
 * Ground-cover tint: 3 grass hue variants blended by seeded
 * low-frequency value noise, brown dry-patch splotches from a higher-
 * frequency noise (patchier where trees are sparse / elevation is high), and
 * a uniform "mown" fresh-green override on tiles within 1 of a road. Pure;
 * exported for direct testing and composed into vertexColorFor.
 */
export function groundCoverTint(
  worldX: number,
  worldZ: number,
  treeDensity: number,
  height: number,
  nearRoad: boolean,
): [number, number, number] {
  if (nearRoad) return [MOWN_GREEN_COLOR[0], MOWN_GREEN_COLOR[1], MOWN_GREEN_COLOR[2]];
  const hueNoise = valueNoise2D(worldX, worldZ, GRASS_HUE_CELL_METERS, GRASS_HUE_SEED);
  const patchNoise = valueNoise2D(worldX, worldZ, DRY_PATCH_CELL_METERS, DRY_PATCH_SEED);
  const base = grassHueBlend(hueNoise);
  const patchT = dryPatchWeight(patchNoise, treeDensity, height);
  return lerp3(base, DRY_PATCH_COLOR, patchT);
}

/**
 * Deterministic terrain vertex color:
 * - underwater (height < SEA_LEVEL): seabedDepthColor ramp by depth.
 * - on land: sand near SEA_LEVEL fading into the ground-cover tint
 *   (hue variants + dry patches + mown-near-road), blended to rock where
 *   local slope exceeds MAX_BUILD_SLOPE.
 * - a shoreline foam band is blended in wherever height sits within
 *   SHORELINE_BAND_METERS of SEA_LEVEL, on either side.
 * - dense tree cover darkens the final color (canopy-shadow read).
 * Pure and exported for tests; `slope` is in the same units as
 * MAX_BUILD_SLOPE (meters of height delta); `worldX`/`worldZ` are meters
 * (the ground-cover noise's coordinate space); `nearRoad` is true when the
 * tile sits on or within 1 tile of a road.
 */
export function vertexColorFor(
  height: number,
  slope: number,
  treeDensity: number,
  worldX: number,
  worldZ: number,
  nearRoad: boolean,
): [number, number, number] {
  let rgb: [number, number, number];

  if (height < SEA_LEVEL) {
    rgb = seabedDepthColor(SEA_LEVEL - height);
  } else {
    const sandT = clamp01((height - SEA_LEVEL) / SAND_BAND_METERS);
    const cover = groundCoverTint(worldX, worldZ, treeDensity, height, nearRoad);
    rgb = lerp3(SAND_COLOR, cover, sandT);

    const rockT = clamp01((slope - MAX_BUILD_SLOPE) / ROCK_BLEND_RANGE);
    rgb = lerp3(rgb, ROCK_COLOR, rockT);
  }

  const shoreT = shorelineBandWeight(height);
  rgb = lerp3(rgb, FOAM_COLOR, shoreT);

  const shade = treeShadeFactor(treeDensity);
  return [rgb[0] * shade, rgb[1] * shade, rgb[2] * shade];
}

/**
 * Deterministic dirt-brown variation for the skirt strata: a small
 * seeded per-position wobble around the #6b4a2f anchor so the perimeter
 * skirt's dirt band doesn't read as one flat, obviously-tiled color. Pure —
 * built on valueNoise2D, no Math.random.
 */
export function dirtColorAt(worldX: number, worldZ: number): [number, number, number] {
  const n = valueNoise2D(
    worldX,
    worldZ,
    SKIRT_DIRT_VARIATION_CELL_METERS,
    SKIRT_DIRT_VARIATION_SEED,
  );
  const t = (n - 0.5) * 2 * SKIRT_DIRT_VARIATION_RANGE; // roughly [-range, +range]
  return [
    clamp01(SKIRT_DIRT_COLOR[0] + t),
    clamp01(SKIRT_DIRT_COLOR[1] + t * 0.7),
    clamp01(SKIRT_DIRT_COLOR[2] + t * 0.5),
  ];
}

/**
 * Earth cross-section color at absolute height `y` on the
 * perimeter skirt hanging below a boundary vertex whose terrain surface sits
 * at `surfaceHeight` with color `surfaceColor` (that same edge vertex's
 * vertexColorFor output, so the skirt's top row reads seamlessly against the
 * terrain chunk it hangs from):
 * - at or above the surface: the surface color itself (clamped — never
 *   reads "above ground").
 * - a thin topsoil band (SKIRT_TOPSOIL_METERS deep) blending the surface
 *   color into `dirtColorAt(worldX, worldZ)`.
 * - a flat dirt-brown middle.
 * - across the last SKIRT_ROCK_BAND_METERS immediately above the fixed
 *   SKIRT_BASE_Y, dirt blends to the rock anchor; below SKIRT_BASE_Y it's
 *   saturated rock. This band is anchored to the absolute base rather than
 *   the surface, so a tall edge gets a long flat dirt run while a low edge
 *   still shows the full rock transition just above the base.
 * Pure and exported for direct testing; TerrainRenderer's skirt geometry
 * calls this verbatim per row so the rendered strata match exactly.
 */
export function skirtColorAt(
  y: number,
  surfaceHeight: number,
  surfaceColor: readonly [number, number, number],
  worldX: number,
  worldZ: number,
): [number, number, number] {
  const depthBelowSurface = surfaceHeight - y;
  if (depthBelowSurface <= 0) return [surfaceColor[0], surfaceColor[1], surfaceColor[2]];

  const dirt = dirtColorAt(worldX, worldZ);
  if (depthBelowSurface <= SKIRT_TOPSOIL_METERS) {
    return lerp3(surfaceColor, dirt, depthBelowSurface / SKIRT_TOPSOIL_METERS);
  }

  const rockBandTop = SKIRT_BASE_Y + SKIRT_ROCK_BAND_METERS;
  const rockT = clamp01((rockBandTop - y) / SKIRT_ROCK_BAND_METERS);
  return lerp3(dirt, SKIRT_ROCK_COLOR, rockT);
}

/** Which chunk a tile coordinate belongs to. */
export function chunkOfTile(x: number, z: number): { cx: number; cz: number } {
  return { cx: Math.floor(x / CHUNK_TILES), cz: Math.floor(z / CHUNK_TILES) };
}

const chunkKey = (cx: number, cz: number): number => cz * CHUNKS_PER_SIDE + cx;
const clampInt = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

interface ChunkEntry {
  mesh: THREE.Mesh;
}

/** The 4 map-boundary edges the skirt covers — each built exactly once, meeting at the 4 corners. */
type SkirtSide = 'west' | 'east' | 'north' | 'south';
const SKIRT_SIDES: readonly SkirtSide[] = ['west', 'east', 'north', 'south'];
/** Exported so tests (and any future caller) can assert scene child counts without hard-coding the number of sides. */
export const SKIRT_SIDE_COUNT = SKIRT_SIDES.length;
/** Rows per skirt column: surface, topsoil-band bottom, rock-band top, fixed base — see skirtColorAt. */
const SKIRT_ROWS = 4;

interface SkirtEntry {
  mesh: THREE.Mesh;
}

export class TerrainRenderer {
  private readonly scene: THREE.Scene;
  private readonly material: THREE.MeshStandardMaterial;
  private readonly skirtMaterial: THREE.MeshLambertMaterial;
  private chunks: (ChunkEntry | null)[];
  private skirts: Record<SkirtSide, SkirtEntry | null>;
  private map: MapData | null = null;
  private readonly dirtyChunks = new Set<number>();
  /** Which perimeter sides need their skirt geometry rebuilt on next update(). */
  private readonly dirtySides = new Set<SkirtSide>();
  /** Flat-index (z*size+x) set of tiles currently carrying a road — drives the "mown" band. */
  private roadTiles = new Set<number>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.chunks = new Array<ChunkEntry | null>(CHUNKS_PER_SIDE * CHUNKS_PER_SIDE).fill(null);
    this.skirts = { west: null, east: null, north: null, south: null };
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      metalness: 0,
    });
    // Skirt: plain MeshLambertMaterial (no new shader). DoubleSide so the
    // perimeter reads correctly regardless of which way the camera happens to be facing it from.
    this.skirtMaterial = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
    });
  }

  build(map: MapData): void {
    this.map = map;
    this.dirtyChunks.clear();
    this.dirtySides.clear();
    this.roadTiles = new Set();
    this.disposeChunks();
    this.disposeSkirts();

    for (let cz = 0; cz < CHUNKS_PER_SIDE; cz++) {
      for (let cx = 0; cx < CHUNKS_PER_SIDE; cx++) {
        const mesh = this.buildChunkMesh(cx, cz);
        this.chunks[chunkKey(cx, cz)] = { mesh };
        this.scene.add(mesh);
      }
    }

    for (const side of SKIRT_SIDES) {
      const mesh = this.buildSkirtMesh(side);
      this.skirts[side] = { mesh };
      this.scene.add(mesh);
    }
  }

  /**
   * Height in meters at a tile corner (worldX/Z = cornerIx/cornerIz *
   * TILE_METERS) — the bilinear average of the four map cells meeting there.
   * These are the exact values makeChunkGeometry writes into the terrain mesh
   * vertices, so heightAt() (below) reproduces the *rendered* surface rather
   * than a separate interpolation that would drift from it between corners.
   */
  private cornerHeight(cornerIx: number, cornerIz: number): number {
    const map = this.map;
    if (!map) return 0;
    const size = map.size;
    const h = map.height;
    const cx0 = clampInt(cornerIx - 1, 0, size - 1);
    const cx1 = clampInt(cornerIx, 0, size - 1);
    const cz0 = clampInt(cornerIz - 1, 0, size - 1);
    const cz1 = clampInt(cornerIz, 0, size - 1);
    return 0.25 * (h[cz0 * size + cx0]! + h[cz0 * size + cx1]! + h[cz1 * size + cx0]! + h[cz1 * size + cx1]!);
  }

  /**
   * World-space surface height in meters, matching the *triangulated* terrain
   * mesh exactly (not a bilinear approximation that only agrees at corners).
   * Each terrain quad is split by PlaneGeometry along the u+v=1 diagonal into
   * triangles (H00,H10,H01) and (H11,H01,H10); we interpolate within whichever
   * triangle the point falls in. This is what keeps roads, driveways, aprons
   * and props sitting flush on the surface they conform to instead of dipping
   * below a terrain bulge and letting it poke through. Edge-clamped via
   * cornerHeight; 0 before build().
   */
  heightAt(x: number, z: number): number {
    if (!this.map) return 0;
    const gx = x / TILE_METERS;
    const gz = z / TILE_METERS;
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const u = gx - ix;
    const v = gz - iz;
    // Fast path for exact tile corners — the per-vertex sampling
    // makeChunkGeometry does for every mesh vertex — needs just one corner.
    if (u === 0 && v === 0) return this.cornerHeight(ix, iz);
    // Otherwise interpolate within the one triangle (u+v=1 diagonal) the point
    // falls in — only the three corners of that triangle are needed.
    if (u + v <= 1) {
      const h00 = this.cornerHeight(ix, iz);
      const h10 = this.cornerHeight(ix + 1, iz);
      const h01 = this.cornerHeight(ix, iz + 1);
      return h00 + u * (h10 - h00) + v * (h01 - h00);
    }
    const h11 = this.cornerHeight(ix + 1, iz + 1);
    const h01 = this.cornerHeight(ix, iz + 1);
    const h10 = this.cornerHeight(ix + 1, iz);
    return h11 + (1 - u) * (h01 - h11) + (1 - v) * (h10 - h11);
  }

  /**
   * Marks a tile-space rectangle dirty; affected chunks rebuild on next
   * update(). Also marks any perimeter skirt side(s) the rectangle
   * touches (tile column 0 / size-1, or row 0 / size-1) — the same tile
   * columns/rows heightAt's edge-clamping means the boundary skirt vertices
   * actually sample from, so this covers both real edits (terraform) and
   * cosmetic ones (a road painted next to the map edge, which shifts the
   * skirt's top-row "mown" color via applyRoadTiles's own markDirty call).
   */
  markDirty(minX: number, minZ: number, maxX: number, maxZ: number): void {
    const lo = chunkOfTile(Math.min(minX, maxX), Math.min(minZ, maxZ));
    const hi = chunkOfTile(Math.max(minX, maxX), Math.max(minZ, maxZ));
    const czLo = Math.max(0, lo.cz);
    const czHi = Math.min(CHUNKS_PER_SIDE - 1, hi.cz);
    const cxLo = Math.max(0, lo.cx);
    const cxHi = Math.min(CHUNKS_PER_SIDE - 1, hi.cx);
    for (let cz = czLo; cz <= czHi; cz++) {
      for (let cx = cxLo; cx <= cxHi; cx++) {
        this.dirtyChunks.add(chunkKey(cx, cz));
      }
    }

    const size = this.map?.size ?? MAP_SIZE;
    const xLo = Math.min(minX, maxX);
    const xHi = Math.max(minX, maxX);
    const zLo = Math.min(minZ, maxZ);
    const zHi = Math.max(minZ, maxZ);
    if (xLo <= 0 && 0 <= xHi) this.dirtySides.add('west');
    if (xLo <= size - 1 && size - 1 <= xHi) this.dirtySides.add('east');
    if (zLo <= 0 && 0 <= zHi) this.dirtySides.add('north');
    if (zLo <= size - 1 && size - 1 <= zHi) this.dirtySides.add('south');
  }

  /**
   * Applies worker-derived height-patch updates (emitted after
   * terraform strokes, terraformSet undo/redo restores, and loadSave) to the
   * height source and marks exactly the chunks the patch's tile rectangle
   * covers dirty, so they rebuild on the next update(). No-op before the
   * first build() (matches heightAt's "0 before build" defensive style).
   */
  applyHeightPatches(
    patches: readonly { x: number; z: number; w: number; h: number; heights: Float32Array }[],
  ): void {
    const map = this.map;
    if (!map) return;
    const size = map.size;
    for (const patch of patches) {
      for (let row = 0; row < patch.h; row++) {
        const z = patch.z + row;
        if (z < 0 || z >= size) continue;
        const rowBase = row * patch.w;
        for (let col = 0; col < patch.w; col++) {
          const x = patch.x + col;
          if (x < 0 || x >= size) continue;
          const v = patch.heights[rowBase + col];
          if (v !== undefined) map.height[z * size + x] = v;
        }
      }
      this.markDirty(patch.x, patch.z, patch.x + patch.w - 1, patch.z + patch.h - 1);
    }
  }

  /**
   * Ground cover: replaces the tracked set of road tiles (drives the
   * "within 1 tile of a road -> uniform mown fresh-green" band) and marks
   * every chunk touched by a tile that entered or left the road set dirty,
   * so the manicured band stays in sync as the network changes.
   */
  applyRoadTiles(tiles: readonly TilePoint[]): void {
    const size = this.map?.size ?? MAP_SIZE;
    const next = new Set<number>();
    for (const t of tiles) {
      if (t.x < 0 || t.z < 0 || t.x >= size || t.z >= size) continue;
      next.add(t.z * size + t.x);
    }

    const touched = new Set<number>();
    for (const key of this.roadTiles) if (!next.has(key)) touched.add(key);
    for (const key of next) if (!this.roadTiles.has(key)) touched.add(key);

    this.roadTiles = next;

    for (const key of touched) {
      const x = key % size;
      const z = Math.floor(key / size);
      this.markDirty(x - 1, z - 1, x + 1, z + 1);
    }
  }

  /** Rebuilds dirty chunk geometry and any perimeter skirt side(s) touched since the last update(). */
  update(): void {
    if (this.map && this.dirtyChunks.size > 0) {
      for (const key of this.dirtyChunks) {
        const cz = Math.floor(key / CHUNKS_PER_SIDE);
        const cx = key % CHUNKS_PER_SIDE;
        this.refreshChunk(cx, cz);
      }
      this.dirtyChunks.clear();
    }
    if (this.map && this.dirtySides.size > 0) {
      for (const side of this.dirtySides) {
        this.refreshSkirt(side);
      }
      this.dirtySides.clear();
    }
  }

  private refreshChunk(cx: number, cz: number): void {
    const entry = this.chunks[chunkKey(cx, cz)];
    if (!entry) return;
    entry.mesh.geometry.dispose();
    entry.mesh.geometry = this.makeChunkGeometry(cx, cz);
  }

  private refreshSkirt(side: SkirtSide): void {
    const entry = this.skirts[side];
    if (!entry) return;
    entry.mesh.geometry.dispose();
    entry.mesh.geometry = this.makeSkirtGeometry(side);
  }

  private buildChunkMesh(cx: number, cz: number): THREE.Mesh {
    const geometry = this.makeChunkGeometry(cx, cz);
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    return mesh;
  }

  private makeChunkGeometry(cx: number, cz: number): THREE.BufferGeometry {
    const chunkMeters = CHUNK_TILES * TILE_METERS;
    const geometry = new THREE.PlaneGeometry(chunkMeters, chunkMeters, CHUNK_TILES, CHUNK_TILES);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(cx * chunkMeters + chunkMeters / 2, 0, cz * chunkMeters + chunkMeters / 2);

    const position = geometry.attributes.position;
    if (!position) throw new Error('terrain chunk geometry is missing its position attribute');

    const count = position.count;
    const colors = new Float32Array(count * 3);
    const map = this.map;
    const trees = map?.trees ?? null;
    const mapSize = map?.size ?? MAP_SIZE;

    for (let i = 0; i < count; i++) {
      const worldX = position.getX(i);
      const worldZ = position.getZ(i);
      const h = this.heightAt(worldX, worldZ);
      position.setY(i, h);

      const [r, g, b] = this.terrainColorAt(worldX, worldZ, h, trees, mapSize);
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }

    position.needsUpdate = true;
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    return geometry;
  }

  /**
   * The terrain surface's own vertex color at a world position whose height
   * is already known (`h`) — the exact same slope/tree-density/near-road
   * inputs makeChunkGeometry feeds vertexColorFor, factored out so the
   * skirt's top row can call it verbatim and read seamlessly against
   * the terrain chunk it hangs from (no separate/approximate surface color).
   */
  private terrainColorAt(
    worldX: number,
    worldZ: number,
    h: number,
    trees: Uint8Array | null,
    mapSize: number,
  ): [number, number, number] {
    const slope = this.slopeAt(worldX, worldZ);
    const tileX = clampInt(Math.floor(worldX / TILE_METERS), 0, mapSize - 1);
    const tileZ = clampInt(Math.floor(worldZ / TILE_METERS), 0, mapSize - 1);
    const density = trees ? (trees[tileZ * mapSize + tileX] ?? 0) : 0;
    const nearRoad = this.isNearRoad(tileX, tileZ);
    return vertexColorFor(h, slope, density, worldX, worldZ, nearRoad);
  }

  private buildSkirtMesh(side: SkirtSide): THREE.Mesh {
    const geometry = this.makeSkirtGeometry(side);
    const mesh = new THREE.Mesh(geometry, this.skirtMaterial);
    mesh.name = `skirt-${side}`;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    return mesh;
  }

  /**
   * One vertical quad-strip column per boundary tile-corner along
   * `side` (MAP_SIZE+1 of them, so adjoining sides meet exactly at the 4
   * corners with no gap/overlap), each column carrying SKIRT_ROWS vertices
   * (surface / topsoil-bottom / rock-band-top / fixed base) so the GPU's
   * linear vertex-color interpolation between rows reproduces skirtColorAt
   * exactly at every point along the strip, not just at the sampled rows.
   * The top row reuses heightAt/terrainColorAt — the identical height and
   * color source the terrain chunks sample — so the skirt hangs with no
   * crack and no seam against the chunk above it. Spatial layout always
   * spans the fixed CHUNKS_PER_SIDE*CHUNK_TILES (=MAP_SIZE) world grid the
   * chunk meshes actually occupy — matching makeChunkGeometry, `map.size` is
   * used only to clamp array lookups (tree density), never geometry extent.
   */
  private makeSkirtGeometry(side: SkirtSide): THREE.BufferGeometry {
    const map = this.map;
    const mapSize = map?.size ?? MAP_SIZE;
    const trees = map?.trees ?? null;
    const columns = MAP_SIZE + 1;
    const rockBandTop = SKIRT_BASE_Y + SKIRT_ROCK_BAND_METERS;

    const positions = new Float32Array(columns * SKIRT_ROWS * 3);
    const colors = new Float32Array(columns * SKIRT_ROWS * 3);

    for (let col = 0; col < columns; col++) {
      const { wx, wz } = this.skirtColumnWorld(side, col);
      const surfaceHeight = this.heightAt(wx, wz);
      const surfaceColor = this.terrainColorAt(wx, wz, surfaceHeight, trees, mapSize);

      const topsoilBottom = Math.min(
        surfaceHeight,
        Math.max(surfaceHeight - SKIRT_TOPSOIL_METERS, SKIRT_BASE_Y),
      );
      const rockTop = Math.min(topsoilBottom, rockBandTop);
      const rowYs: readonly [number, number, number, number] = [
        surfaceHeight,
        topsoilBottom,
        rockTop,
        SKIRT_BASE_Y,
      ];

      for (let row = 0; row < SKIRT_ROWS; row++) {
        const vi = col * SKIRT_ROWS + row;
        const y = rowYs[row]!;
        positions[vi * 3] = wx;
        positions[vi * 3 + 1] = y;
        positions[vi * 3 + 2] = wz;

        const [r, g, b] = skirtColorAt(y, surfaceHeight, surfaceColor, wx, wz);
        colors[vi * 3] = r;
        colors[vi * 3 + 1] = g;
        colors[vi * 3 + 2] = b;
      }
    }

    const indices: number[] = [];
    for (let col = 0; col < columns - 1; col++) {
      for (let row = 0; row < SKIRT_ROWS - 1; row++) {
        const a = col * SKIRT_ROWS + row;
        const b = col * SKIRT_ROWS + row + 1;
        const c = (col + 1) * SKIRT_ROWS + row;
        const d = (col + 1) * SKIRT_ROWS + row + 1;
        indices.push(a, b, d, a, d, c);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  /** World (x, z) of the `col`-th boundary tile-corner (0..MAP_SIZE inclusive) along a perimeter side. */
  private skirtColumnWorld(side: SkirtSide, col: number): { wx: number; wz: number } {
    const extent = MAP_SIZE * TILE_METERS;
    const along = col * TILE_METERS;
    switch (side) {
      case 'west':
        return { wx: 0, wz: along };
      case 'east':
        return { wx: extent, wz: along };
      case 'north':
        return { wx: along, wz: 0 };
      case 'south':
        return { wx: along, wz: extent };
    }
  }

  /** Local slope proxy: max height delta to the four axis neighbors one tile away. */
  private slopeAt(x: number, z: number): number {
    const d = TILE_METERS;
    const c = this.heightAt(x, z);
    const n = this.heightAt(x, z - d);
    const s = this.heightAt(x, z + d);
    const e = this.heightAt(x + d, z);
    const w = this.heightAt(x - d, z);
    return Math.max(Math.abs(c - n), Math.abs(c - s), Math.abs(c - e), Math.abs(c - w));
  }

  /** Whether any of the 8 neighbors (or the tile itself) carries a road — the "within 1 tile" rule. */
  private isNearRoad(tileX: number, tileZ: number): boolean {
    if (this.roadTiles.size === 0) return false;
    const size = this.map?.size ?? MAP_SIZE;
    for (let dz = -1; dz <= 1; dz++) {
      const z = tileZ + dz;
      if (z < 0 || z >= size) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const x = tileX + dx;
        if (x < 0 || x >= size) continue;
        if (this.roadTiles.has(z * size + x)) return true;
      }
    }
    return false;
  }

  private disposeChunks(): void {
    for (const entry of this.chunks) {
      if (entry) {
        this.scene.remove(entry.mesh);
        entry.mesh.geometry.dispose();
      }
    }
    this.chunks = new Array<ChunkEntry | null>(CHUNKS_PER_SIDE * CHUNKS_PER_SIDE).fill(null);
  }

  private disposeSkirts(): void {
    for (const side of SKIRT_SIDES) {
      const entry = this.skirts[side];
      if (entry) {
        this.scene.remove(entry.mesh);
        entry.mesh.geometry.dispose();
      }
    }
    this.skirts = { west: null, east: null, north: null, south: null };
  }
}
