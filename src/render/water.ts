/**
 * Water surface renderer: the single owner of water. One mesh at
 * SEA_LEVEL with a vertex every WATER_VERTEX_SPACING_M, only over water tiles
 * and the ring of tiles round them. Each vertex carries its depth, fouling,
 * wind fetch, swell and river flow, all read from the water bodies derived
 * from the water mask and the terrain heights; a terrain change that alters
 * the water marks the mesh dirty and it is rebuilt once the changes stop.
 *
 * The surface is drawn by a TSL node graph built from the one wave table in
 * shared/waves.ts: the swell trains (long enough for the mesh to carry) lift
 * the vertices, and every train, wind and swell, tilts the shading normal
 * from its analytic slope. A wind train fades out of the normal as its crests
 * near the pixel grid. Where a river flows, two crossed sets of short ripples
 * are carried along by the current. The frame behind the water is read once
 * and shown through the surface, bent by the wave normal and dimmed per colour
 * by the water's depth and murk; Schlick's reflection of the sky, surf,
 * lapping and river foam, gusts and a net of light on the bed, and a one-lobe
 * sun/moon glint are drawn over it. Every animated quantity runs off a clock
 * advanced from update()'s dtMs: no wall clock and no random numbers.
 *
 * The pure math (waterlook.ts, plus glintSpecular and glintScale below) is
 * unit-tested directly; the node graph mirrors those formulas into the live
 * shader.
 */

import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import type { Node } from 'three/webgpu';
import {
  abs,
  attribute,
  cameraFar,
  cameraNear,
  cameraPosition,
  clamp,
  cos,
  dFdx,
  dFdy,
  dot,
  exp,
  float,
  fract,
  length,
  max,
  min,
  mix,
  mx_noise_float,
  normalize,
  oneMinus,
  perspectiveDepthToViewZ,
  positionGeometry,
  positionView,
  positionWorld,
  reflect,
  refract,
  round,
  screenUV,
  sin,
  smoothstep,
  transformNormalToView,
  uniform,
  vec2,
  vec3,
  viewportDepthTexture,
  viewportSharedTexture,
} from 'three/tsl';
import { nightTintNode } from './nightlook';
import { MAP_SIZE, SEA_LEVEL, TILE_METERS } from '../shared/constants';
import {
  RIVER_SURFACE_SPEED_MPS,
  WIND_TOWARD,
  WaterKind,
  deriveWaterBodies,
  sampleWater,
} from '../shared/waterbodies';
import type { WaterBodies } from '../shared/waterbodies';
import {
  BREAKING_RATIO,
  FADE_FULL_PX,
  FADE_GONE_PX,
  PHASE_WARP_TERMS,
  SWELL_BAND,
  WAVE_TRAINS,
  WIND_BANDS,
} from '../shared/waves';
import type { WaveTrain } from '../shared/waves';
import {
  ABSORPTION_PER_M,
  FRESNEL_F0,
  GUST_DRIFT_MPS,
  GUST_GAIN,
  GUST_SCALES_M,
  LAP_BREATH,
  LAP_DEPTH_M,
  LAP_MAX_DEPTH_M,
  LAP_STRENGTH,
  LAP_WIDTH_M,
  NET_DEPTH_M,
  NET_GAIN,
  NET_SCALE,
  NET_WARP_K,
  NET_WARP_M,
  NET_WAVELENGTH_M,
  STREAK_ACROSS_M,
  STREAK_ALONG_M,
  STREAK_AXES,
  STREAK_AXIS_SHARPNESS,
  STREAK_WIDTH_FADE_M,
  STREAK_RIDGE,
  STREAK_STRENGTH,
  SURF_LINE_CENTRE_TURNS,
  SURF_LINE_NOISE,
  SURF_LINE_STRENGTH,
  SURF_TRAIL_NOISE,
  SURF_LINE_WIDTH_TURNS,
  SURF_TRAIL_S,
  SURF_TRAIL_STRENGTH,
  WATER_IOR,
  lookOf,
  schlick,
} from './waterlook';

export type HeightSampler = (x: number, z: number) => number;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

const TWO_PI = Math.PI * 2;

/** The colour of the still water a kit's pond is laid in (a flat sheet, apart from this surface). */
export const SHALLOW_WATER_COLOR: readonly [number, number, number] = [0.08, 0.5, 0.48];

// ---------------------------------------------------------------------------
// Fouling: where the city's drains empty, the water goes from its own colour
// toward a murky brown, by the sim's 0..255 fouling of the tiles that meet at
// each vertex.
// ---------------------------------------------------------------------------

/** The colour of water fully fouled by raw sewage: a murky brown, warm enough to read against the blue at distance. */
export const FOUL_WATER_COLOR: readonly [number, number, number] = [0.36, 0.28, 0.14];

/**
 * How far toward the foul colour the surface goes for a fouling of `foul`
 * (0..1): the square root, so a village's few units read as a visible smudge
 * and a saturated outfall is fully brown. The sim's figure stays linear; this
 * is the eye's curve only. Pure.
 */
export function foulMix(foul: number): number {
  return Math.sqrt(clamp01(foul));
}

/**
 * The fouling a vertex carries, 0..1: the worst of the (up to four) tiles
 * that meet at it, so a stain never falls between vertices. `tx`/`tz` is the
 * vertex's place in tile units: a whole number is a tile corner, a fraction
 * lies inside one tile. Pure.
 */
export function vertexFouling(
  waterFoul: Uint8Array,
  sizeTiles: number,
  tx: number,
  tz: number,
): number {
  let worst = 0;
  for (let z = Math.ceil(tz) - 1; z <= Math.floor(tz); z++) {
    for (let x = Math.ceil(tx) - 1; x <= Math.floor(tx); x++) {
      if (x < 0 || z < 0 || x >= sizeTiles || z >= sizeTiles) continue;
      const v = waterFoul[z * sizeTiles + x] ?? 0;
      if (v > worst) worst = v;
    }
  }
  return worst / 255;
}

// ---------------------------------------------------------------------------
// River drift: two crossed sets of short ripples carried by the current.
// Shading only: they tilt the normal and never move the mesh.
// ---------------------------------------------------------------------------

interface RippleSet {
  readonly dirX: number;
  readonly dirZ: number;
  readonly wavelengthM: number;
  /** Peak slope of the set's crests (rise over run). */
  readonly slope: number;
  readonly phase: number;
}

/** Ripples a river carries, 9 m, 4 m and 1.5 m long, set across each other. Dials. */
export const RIPPLE_SETS: readonly RippleSet[] = [
  { dirX: 0.8, dirZ: 0.6, wavelengthM: 4, slope: 0.04, phase: 0.7 },
  { dirX: -0.6, dirZ: 0.8, wavelengthM: 1.5, slope: 0.025, phase: 3.1 },
  { dirX: 0.95, dirZ: -0.31, wavelengthM: 9, slope: 0.015, phase: 5 },
];

/** How far the bed seen through the surface shifts for a tilt of the normal, as a share of the screen. Dial. */
const REFRACTION_UV_PER_SLOPE = 0.15;
/** Depth at which that shift is whole; shallower water bends the bed less. */
const REFRACTION_FULL_DEPTH_M = 1.5;

/** Seconds a ripple pattern drifts before it fades out and is replaced by a copy half a cycle on. */
export const RIPPLE_CYCLE_S = 4;

// ---------------------------------------------------------------------------
// Sky reflection: the sky tone at the reflected ray's height, weighted by
// Schlick's reflectance (waterlook.ts). No render pass, no cubemap.
// ---------------------------------------------------------------------------

/**
 * Default sky colors the surface reflects before the first setSkyColors()
 * call, matching scene.ts's noon (day) keyframe so the surface is never
 * black on boot (default uniforms are the current day sky).
 */
export const DEFAULT_SKY_ZENITH_COLOR: readonly [number, number, number] = [0.25, 0.45, 0.85];
export const DEFAULT_SKY_HORIZON_COLOR: readonly [number, number, number] = [
  0.7525, 0.8625, 0.9725,
];

// ---------------------------------------------------------------------------
// Sun/moon glint day-night scaling.
// ---------------------------------------------------------------------------

/** Moon-glint strength at full night, as a fraction of the day sun-glint (moon-glint at night x0.2). */
export const MOON_GLINT_FRACTION = 0.2;

export const SUN_GLINT_COLOR: readonly [number, number, number] = [1, 0.96, 0.82];
export const MOON_GLINT_COLOR: readonly [number, number, number] = [0.75, 0.82, 0.95];
/** Slope variance of the capillary ripples no train carries, which sets the glint's narrowest lobe. */
export const GLINT_BASE_VARIANCE = 0.004;
/** The lobe's exponent never leaves this range, so it neither blows to a pin nor spreads to the whole sky. */
export const GLINT_MIN_SHININESS = 8;
export const GLINT_MAX_SHININESS = 2000;
/** The sun's radiance against the reflectance it is seen through: scales the lobe times Schlick up to a visible glitter. */
export const GLINT_GAIN = 3;
/** The most the glint adds to a pixel (before the day/night scale). */
export const GLINT_MAX = 4;

/**
 * Glint intensity multiplier: 1 at full day (nightFactor=0), scaled by
 * (1-nightFactor) toward MOON_GLINT_FRACTION (0.2) at full night. Pure.
 */
export function glintScale(nightFactor: number): number {
  const n = clamp01(nightFactor);
  return 1 - (1 - MOON_GLINT_FRACTION) * n;
}

/**
 * The lobe's Blinn-Phong exponent from the surface's roughness: 2 over the
 * slope variance, which is the capillary floor plus the variance of every wind
 * train and river ripple, scaled by the square of the gust (a ruffled patch
 * has steeper slopes, so a wider lobe). Pure.
 */
export function glintShininess(variance = 0, gust = 1): number {
  const v = (GLINT_BASE_VARIANCE + Math.max(0, variance)) * gust * gust;
  return Math.min(GLINT_MAX_SHININESS, Math.max(GLINT_MIN_SHININESS, 2 / v));
}

/**
 * Blinn-Phong lobe of exponent `shininess` at `ndotH` (clamped dot of the
 * shading normal and the half-vector of light and eye), normalised by
 * (n + 8) / (8 pi) so the energy it reflects stays the same as it narrows.
 */
export function glintLobe(ndotH: number, shininess: number): number {
  return ((shininess + 8) / (8 * Math.PI)) * clamp01(ndotH) ** shininess;
}

/**
 * The sun or moon glitter added to a pixel: one lobe whose width comes from
 * the surface's roughness, times Schlick's reflectance at `cosView` (the
 * normal against the direction to the eye) and GLINT_GAIN, clamped to
 * GLINT_MAX, then times the day/night `scale` (glintScale). Pure; the light's
 * colour applies on top.
 */
export function glintSpecular(
  ndotH: number,
  cosView: number,
  variance = 0,
  gust = 1,
  scale = 1,
): number {
  const lobe = glintLobe(ndotH, glintShininess(variance, gust));
  return Math.min(GLINT_MAX, lobe * schlick(cosView) * GLINT_GAIN) * scale;
}

// ---------------------------------------------------------------------------
// WaterRenderer
// ---------------------------------------------------------------------------

/** Distance between mesh vertices: a 100 m swell spans ten of them. */
export const WATER_VERTEX_SPACING_M = 10;
/** Seconds of frame time with no further terrain change before the water is rebuilt. */
export const WATER_REBUILD_SETTLE_S = 0.5;
const CELLS_PER_TILE = TILE_METERS / WATER_VERTEX_SPACING_M;
const DEFAULT_LIGHT_DIRECTION = new THREE.Vector3(0, 1, 0.15).normalize();

/** Tiles the surface covers: every water tile and each of its eight neighbours. */
export function coveredTiles(water: Uint8Array, size: number): Uint8Array {
  const covered = new Uint8Array(size * size);
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      if (water[z * size + x] === 0) continue;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const nz = z + dz;
          if (nx >= 0 && nz >= 0 && nx < size && nz < size) covered[nz * size + nx] = 1;
        }
      }
    }
  }
  return covered;
}

export interface WaterGrid {
  /** x, 0, z of each vertex, in metres. */
  readonly positions: Float32Array;
  /** Triangles, three vertex indices each. */
  readonly indices: Uint32Array;
}

/**
 * The mesh's vertices and triangles: a vertex every WATER_VERTEX_SPACING_M and
 * two triangles to each square of that size lying in a covered tile.
 */
export function buildWaterGrid(water: Uint8Array, size: number): WaterGrid {
  const covered = coveredTiles(water, size);
  const cells = size * CELLS_PER_TILE;
  const stride = cells + 1;
  const vertexOf = new Int32Array(stride * stride).fill(-1);
  const positions: number[] = [];
  const indices: number[] = [];
  const vertex = (gx: number, gz: number): number => {
    const key = gz * stride + gx;
    let v = vertexOf[key]!;
    if (v < 0) {
      v = positions.length / 3;
      vertexOf[key] = v;
      positions.push(gx * WATER_VERTEX_SPACING_M, 0, gz * WATER_VERTEX_SPACING_M);
    }
    return v;
  };
  for (let cz = 0; cz < cells; cz++) {
    for (let cx = 0; cx < cells; cx++) {
      const tile = Math.floor(cz / CELLS_PER_TILE) * size + Math.floor(cx / CELLS_PER_TILE);
      if (covered[tile] === 0) continue;
      const a = vertex(cx, cz);
      const b = vertex(cx + 1, cz);
      const c = vertex(cx, cz + 1);
      const d = vertex(cx + 1, cz + 1);
      indices.push(a, c, b, b, c, d);
    }
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

/** Tiles either side over which a water tile's murk and scatter are averaged with its water neighbours', so one kind runs into the next over about this distance. */
export const LOOK_BLUR_TILES = 3;

export interface WaterLooks {
  /** Murk per metre, per tile (the average over the water tiles near it). */
  readonly murk: Float32Array;
  /** Scatter colour, three floats per tile. */
  readonly scatter: Float32Array;
  /** 1 where the tile is water: only those carry a look. */
  readonly wet: Uint8Array;
}

/**
 * The look of every water tile: its kind's murk and scatter averaged over the
 * water tiles within LOOK_BLUR_TILES (a box, in x then z), so a river's colour
 * runs out into the sea instead of ending at a tile edge. Pure.
 */
export function blurWaterLooks(
  kind: Uint8Array,
  size: number,
  radius: number = LOOK_BLUR_TILES,
): WaterLooks {
  const n = size * size;
  const wet = new Uint8Array(n);
  // Five channels per tile, each weighted by wetness: murk, r, g, b, and wetness itself.
  let a = new Float32Array(n * 5);
  for (let i = 0; i < n; i++) {
    const k = kind[i] ?? WaterKind.None;
    if (k === WaterKind.None) continue;
    wet[i] = 1;
    const look = lookOf(k);
    a[i * 5] = look.murk;
    a[i * 5 + 1] = look.scatter[0];
    a[i * 5 + 2] = look.scatter[1];
    a[i * 5 + 3] = look.scatter[2];
    a[i * 5 + 4] = 1;
  }
  for (const alongX of [true, false]) {
    const b = new Float32Array(n * 5);
    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        const o = (z * size + x) * 5;
        for (let d = -radius; d <= radius; d++) {
          const sx = alongX ? x + d : x;
          const sz = alongX ? z : z + d;
          if (sx < 0 || sz < 0 || sx >= size || sz >= size) continue;
          const s = (sz * size + sx) * 5;
          for (let c = 0; c < 5; c++) b[o + c]! += a[s + c]!;
        }
      }
    }
    a = b;
  }
  const murk = new Float32Array(n);
  const scatter = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const w = a[i * 5 + 4]!;
    if (wet[i] === 0 || w <= 0) continue;
    murk[i] = a[i * 5]! / w;
    for (let c = 0; c < 3; c++) scatter[i * 3 + c] = a[i * 5 + 1 + c]! / w;
  }
  return { murk, scatter, wet };
}

/**
 * The look a vertex takes: the mean over the (up to four) water tiles that
 * meet at it. `tx`/`tz` is the vertex's place in tile units. Open water's look
 * where no tile there is water.
 */
export function vertexLook(
  looks: WaterLooks,
  size: number,
  tx: number,
  tz: number,
): { murk: number; scatter: [number, number, number] } {
  let count = 0;
  let murk = 0;
  const scatter: [number, number, number] = [0, 0, 0];
  for (let z = Math.ceil(tz) - 1; z <= Math.floor(tz); z++) {
    for (let x = Math.ceil(tx) - 1; x <= Math.floor(tx); x++) {
      if (x < 0 || z < 0 || x >= size || z >= size) continue;
      const i = z * size + x;
      if (looks.wet[i] === 0) continue;
      count++;
      murk += looks.murk[i]!;
      for (let c = 0; c < 3; c++) scatter[c]! += looks.scatter[i * 3 + c]!;
    }
  }
  if (count === 0) {
    const open = lookOf(WaterKind.Ocean);
    return { murk: open.murk, scatter: [...open.scatter] };
  }
  return {
    murk: murk / count,
    scatter: [scatter[0] / count, scatter[1] / count, scatter[2] / count],
  };
}

function findDirectionalLight(scene: THREE.Scene): THREE.DirectionalLight | null {
  for (const child of scene.children) {
    if (child instanceof THREE.DirectionalLight) return child;
  }
  return null;
}

/**
 * One translucent surface mesh at SEA_LEVEL over the water tiles and their
 * ring (opaque terrain above sea level depth-occludes it). `heightAt` is the
 * terrain height sampler (TerrainRenderer.heightAt) and `water` the client
 * grid's water mask, held by reference so a terrain edit that changes it is
 * seen; call markTerrainChanged after one and the mesh, depth, kind, fetch
 * and current are rebuilt once the edits stop.
 */
export class WaterRenderer {
  private mesh: THREE.Mesh;
  private bodies: WaterBodies;
  private dirty = false;
  private idleS = 0;
  private pinnedClockS: number | null = null;
  private foulLayer: Uint8Array | null = null;
  private readonly graphTrainList: WaveTrain[] = [];
  private readonly material: MeshStandardNodeMaterial;
  private readonly timeUniform = uniform(0);
  private readonly nightFactorUniform = uniform(0);
  private readonly lightDirUniform = uniform(new THREE.Vector3().copy(DEFAULT_LIGHT_DIRECTION));
  private readonly skyZenithUniform = uniform(new THREE.Vector3(...DEFAULT_SKY_ZENITH_COLOR));
  private readonly skyHorizonUniform = uniform(new THREE.Vector3(...DEFAULT_SKY_HORIZON_COLOR));
  private readonly sunLight: THREE.DirectionalLight | null;
  private readonly scratchLightDir = new THREE.Vector3();
  private foulAttribute: THREE.BufferAttribute;

  constructor(
    scene: THREE.Scene,
    private readonly heightAt: HeightSampler,
    private readonly water: Uint8Array,
    private readonly sizeTiles: number = MAP_SIZE,
  ) {
    this.sunLight = findDirectionalLight(scene);
    this.material = this.createMaterial();

    const built = this.buildGeometry();
    this.bodies = built.bodies;
    this.foulAttribute = built.foul;
    this.mesh = new THREE.Mesh(built.geometry, this.material);
    this.mesh.name = 'water-surface';
    this.mesh.userData['underground'] = 'keep';
    this.mesh.position.y = SEA_LEVEL;
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    scene.add(this.mesh);
  }

  /**
   * Derives the water bodies from the mask and the heights and lays the mesh
   * over them: per vertex the depth, fetch, swell and flow read from those
   * bodies, plus an empty fouling attribute.
   */
  private buildGeometry(): {
    geometry: THREE.BufferGeometry;
    bodies: WaterBodies;
    foul: THREE.BufferAttribute;
  } {
    const bodies = deriveWaterBodies(this.water, this.sizeTiles, (tx, tz) =>
      this.heightAt((tx + 0.5) * TILE_METERS, (tz + 0.5) * TILE_METERS),
    );
    const grid = buildWaterGrid(this.water, this.sizeTiles);
    const count = grid.positions.length / 3;
    const depth = new Float32Array(count);
    const fetch = new Float32Array(count);
    const swellTau = new Float32Array(count);
    const swellSlow = new Float32Array(count * 2);
    const swellAmp = new Float32Array(count);
    const flow = new Float32Array(count * 2);
    const murk = new Float32Array(count);
    const scatter = new Float32Array(count * 3);
    const looks = blurWaterLooks(bodies.kind, this.sizeTiles);
    for (let i = 0; i < count; i++) {
      const x = grid.positions[i * 3]!;
      const z = grid.positions[i * 3 + 2]!;
      const d = Math.max(0, SEA_LEVEL - this.heightAt(x, z));
      const s = sampleWater(bodies, x, z);
      const look = vertexLook(looks, this.sizeTiles, x / TILE_METERS, z / TILE_METERS);
      murk[i] = look.murk;
      scatter.set(look.scatter, i * 3);
      depth[i] = d;
      fetch[i] = s.fetchM;
      swellTau[i] = s.swellTau;
      swellSlow[i * 2] = s.swellSlowX;
      swellSlow[i * 2 + 1] = s.swellSlowZ;
      swellAmp[i] = s.swellAmp;
      if (d > 0) {
        flow[i * 2] = s.flowX;
        flow[i * 2 + 1] = s.flowZ;
      }
    }
    const foul = new THREE.BufferAttribute(new Float32Array(count), 1);
    foul.setUsage(THREE.DynamicDrawUsage);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(grid.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(grid.indices, 1));
    geometry.setAttribute('waterDepth', new THREE.BufferAttribute(depth, 1));
    geometry.setAttribute('waterFoul', foul);
    geometry.setAttribute('waterFetch', new THREE.BufferAttribute(fetch, 1));
    geometry.setAttribute('waterSwellTau', new THREE.BufferAttribute(swellTau, 1));
    geometry.setAttribute('waterSwellSlow', new THREE.BufferAttribute(swellSlow, 2));
    geometry.setAttribute('waterSwellAmp', new THREE.BufferAttribute(swellAmp, 1));
    geometry.setAttribute('waterFlow', new THREE.BufferAttribute(flow, 2));
    geometry.setAttribute('waterMurk', new THREE.BufferAttribute(murk, 1));
    geometry.setAttribute('waterScatter', new THREE.BufferAttribute(scatter, 3));
    return { geometry, bodies, foul };
  }

  /**
   * Tells the water that terrain heights, and so perhaps the water mask,
   * changed in the given tile rectangles. Nothing is rebuilt unless a patched
   * tile or one of its neighbours is, or was, water.
   */
  markTerrainChanged(patches: ReadonlyArray<{ x: number; z: number; w: number; h: number }>): void {
    const n = this.sizeTiles;
    for (const p of patches) {
      for (let z = Math.max(0, p.z - 1); z <= Math.min(n - 1, p.z + p.h); z++) {
        for (let x = Math.max(0, p.x - 1); x <= Math.min(n - 1, p.x + p.w); x++) {
          const i = z * n + x;
          if (this.water[i] !== 0 || this.bodies.kind[i] !== WaterKind.None) {
            this.dirty = true;
            this.idleS = 0;
            return;
          }
        }
      }
    }
  }

  private rebuild(): void {
    const built = this.buildGeometry();
    const old = this.mesh.geometry;
    this.mesh.geometry = built.geometry;
    old.dispose();
    this.bodies = built.bodies;
    this.foulAttribute = built.foul;
    this.dirty = false;
    this.idleS = 0;
    if (this.foulLayer) this.setFouling(this.foulLayer);
  }

  /** What kind of water the tile holds now (a WaterKind value). For tests and checks. */
  kindAt(tx: number, tz: number): number {
    return this.bodies.kind[tz * this.sizeTiles + tx] ?? WaterKind.None;
  }

  /** The wave trains the node graph was built from. */
  graphTrains(): readonly WaveTrain[] {
    return this.graphTrainList;
  }

  /**
   * Retints the surface from the sim's fouling layer (0..255 per tile): each
   * vertex takes the worst of the tiles that meet at it. Called only when a
   * snapshot carries a new layer, so the attribute is rewritten rarely.
   */
  setFouling(waterFoul: Uint8Array): void {
    this.foulLayer = waterFoul;
    const position = this.mesh.geometry.attributes.position;
    if (!position) return;
    const values = this.foulAttribute.array as Float32Array;
    for (let i = 0; i < position.count; i++) {
      values[i] = vertexFouling(
        waterFoul,
        this.sizeTiles,
        position.getX(i) / TILE_METERS,
        position.getZ(i) / TILE_METERS,
      );
    }
    this.foulAttribute.needsUpdate = true;
  }

  /** The fouling the surface currently carries at a vertex, 0..1, for checks. */
  foulingAtVertex(index: number): number {
    return (this.foulAttribute.array as Float32Array)[index] ?? 0;
  }

  /**
   * Advances the animation clock by dtMs (accumulated seconds, never a wall
   * clock), rebuilds the mesh once terrain edits have stopped for
   * WATER_REBUILD_SETTLE_S, and refreshes the night-driven glint tint and the
   * live sun/moon direction (read from the scene's THREE.DirectionalLight, the
   * same light the day/night cycle drives; a fixed overhead direction if the
   * scene has none, e.g. in isolated tests).
   */
  update(dtMs: number, nightFactor: number): void {
    const dtS = Math.max(0, dtMs) / 1000;
    if (this.pinnedClockS === null) this.timeUniform.value += dtS;
    this.nightFactorUniform.value = clamp01(nightFactor);
    if (this.dirty) {
      this.idleS += dtS;
      if (this.idleS >= WATER_REBUILD_SETTLE_S) this.rebuild();
    }

    const light = this.sunLight;
    if (light) {
      this.scratchLightDir.copy(light.position).sub(light.target.position);
      if (this.scratchLightDir.lengthSq() < 1e-10)
        this.scratchLightDir.copy(DEFAULT_LIGHT_DIRECTION);
      else this.scratchLightDir.normalize();
    } else {
      this.scratchLightDir.copy(DEFAULT_LIGHT_DIRECTION);
    }
    (this.lightDirUniform.value as THREE.Vector3).copy(this.scratchLightDir);
  }

  /**
   * Feeds the sky
   * ramp's current zenith/horizon colors into the analytic reflection so the
   * surface mirrors whatever the sky actually looks like this frame — pure
   * mirror math (reflectedColor), no render pass, no cubemap. Callers that
   * never call this keep the DEFAULT_SKY_*_COLOR day-sky
   * uniforms set at construction, so the surface is never black on boot.
   */
  setSkyColors(
    zenith: readonly [number, number, number],
    horizon: readonly [number, number, number],
  ): void {
    (this.skyZenithUniform.value as THREE.Vector3).set(zenith[0], zenith[1], zenith[2]);
    (this.skyHorizonUniform.value as THREE.Vector3).set(horizon[0], horizon[1], horizon[2]);
  }

  setVisible(visible: boolean): void {
    this.mesh.visible = visible;
  }

  /** Accumulated animation clock, in seconds. For tests/introspection. */
  elapsedSeconds(): number {
    return this.timeUniform.value;
  }

  /**
   * Holds the animation clock at `seconds` (null lets it run again), so a
   * screenshot of the waves repeats from run to run.
   */
  pinClock(seconds: number | null): void {
    this.pinnedClockS = seconds;
    if (seconds !== null) this.timeUniform.value = seconds;
  }

  /** The derived water bodies the surface is drawn from. For checks and screenshot tools. */
  waterBodies(): WaterBodies {
    return this.bodies;
  }

  private createMaterial(): MeshStandardNodeMaterial {
    const material = new MeshStandardNodeMaterial({
      transparent: true,
      depthWrite: false,
      roughness: 0.5,
      metalness: 0,
    });

    // The mesh sits at the origin in x and z, so the raw vertex position is world.
    const worldX = positionGeometry.x;
    const worldZ = positionGeometry.z;

    // Per-vertex depth (metres), interpolated: the wave cap and the swell's
    // lift use it. The colour and foam use the pixel's own depth, below.
    const depthAttr = attribute<'float'>('waterDepth', 'float');
    const foulAttr = attribute<'float'>('waterFoul', 'float');
    const murkAttr = attribute<'float'>('waterMurk', 'float');
    const scatterAttr = attribute<'vec3'>('waterScatter', 'vec3');

    // Positional phase warp shared by every wind-wave phase below —
    // mirrors phaseWarp(x, z) exactly (see its doc for why: straight
    // wavefronts interfere into a lattice/moiré at RTS distance).
    let warpNode: Node<'float'> = float(0);
    for (const term of PHASE_WARP_TERMS) {
      warpNode = warpNode.add(
        sin(worldX.mul(term.freqX).add(worldZ.mul(term.freqZ))).mul(term.amplitude),
      );
    }

    // Warp gradient, for the chain rule on every warped train's slope.
    let warpGradX: Node<'float'> = float(0);
    let warpGradZ: Node<'float'> = float(0);
    for (const term of PHASE_WARP_TERMS) {
      const c = cos(worldX.mul(term.freqX).add(worldZ.mul(term.freqZ))).mul(term.amplitude);
      warpGradX = warpGradX.add(c.mul(term.freqX));
      warpGradZ = warpGradZ.add(c.mul(term.freqZ));
    }

    // The wave table, term for term as waves.ts sums it: each train's weight
    // from the vertex's fetch or swell, its direction (a swell train turned off
    // the swell's own), its phase, and the energy that sets the breaking cap.
    const fetchAttr = attribute<'float'>('waterFetch', 'float');
    const swellTauAttr = attribute<'float'>('waterSwellTau', 'float');
    const swellSlowAttr = attribute<'vec2'>('waterSwellSlow', 'vec2');
    const swellAmpAttr = attribute<'float'>('waterSwellAmp', 'float');
    let energy: Node<'float'> = float(0);
    const parts = WAVE_TRAINS.map((train) => {
      const weight: Node<'float'> =
        train.band === SWELL_BAND
          ? swellAmpAttr
          : smoothstep(
              WIND_BANDS[train.band]!.prevFetchM,
              WIND_BANDS[train.band]!.fetchM,
              fetchAttr,
            );
      const amplitude = weight.mul(train.amplitudeM);
      const phase: Node<'float'> =
        train.band === SWELL_BAND
          ? swellTauAttr.sub(this.timeUniform).mul(train.omega).add(train.phase)
          : worldX
              .mul(Math.cos(train.angleRad))
              .add(worldZ.mul(Math.sin(train.angleRad)))
              .mul(train.wavenumber)
              .sub(this.timeUniform.mul(train.omega))
              .add(train.phase)
              .add(warpNode.mul(train.warpScale));
      energy = energy.add(amplitude.mul(amplitude).mul(0.5));
      this.graphTrainList.push(train);
      return { train, amplitude, phase };
    });
    const significant = energy.sqrt().mul(4);
    const breakScale = min(float(1), depthAttr.mul(BREAKING_RATIO).div(max(significant, 1e-6)));

    // Only the swell moves the mesh: wind waves are shorter than the vertices
    // can carry. Vertical displacement only.
    let lift: Node<'float'> = float(0);
    for (const part of parts) {
      if (part.train.band === SWELL_BAND) lift = lift.add(part.amplitude.mul(sin(part.phase)));
    }
    material.positionNode = positionGeometry.add(vec3(0, lift.mul(breakScale), 0));

    // Every train tilts the normal by its analytic slope; a wind train fades
    // as its crests near the pixel grid (metres a pixel from the screen-space
    // derivative of world position).
    const metresPerPixel = max(length(dFdx(positionWorld)), length(dFdy(positionWorld)));
    const fadeNode = (wavelengthM: number): Node<'float'> =>
      smoothstep(FADE_GONE_PX, FADE_FULL_PX, float(wavelengthM).div(max(metresPerPixel, 1e-6)));
    // Gusts: a slow noise field drifting downwind scales the wind trains'
    // slope and the glint's width, so a calm lake shows patches of ruffled
    // and smooth water. Shading only; the surface height is untouched.
    const gustDrift = this.timeUniform.mul(GUST_DRIFT_MPS);
    const gustX = worldX.sub(gustDrift.mul(WIND_TOWARD.x));
    const gustZ = worldZ.sub(gustDrift.mul(WIND_TOWARD.z));
    const gustNoise = mx_noise_float(
      vec3(gustX.div(GUST_SCALES_M[0]), gustZ.div(GUST_SCALES_M[0]), 0.37),
    )
      .mul(0.65)
      .add(
        mx_noise_float(vec3(gustX.div(GUST_SCALES_M[1]), gustZ.div(GUST_SCALES_M[1]), 3.71)).mul(
          0.35,
        ),
      );
    const gust = clamp(gustNoise.mul(GUST_GAIN).add(1), 0.5, 1.5);

    let slopeX: Node<'float'> = float(0);
    let slopeZ: Node<'float'> = float(0);
    // The swell's own slope, which the glint follows: it is long-crested and
    // always resolved. Everything shorter reaches the glint as slope variance
    // (half the square of each train's slope amplitude) that widens its lobe,
    // so the glint is a smooth patch, not a sparkle of single facets.
    let swellSlopeX: Node<'float'> = float(0);
    let swellSlopeZ: Node<'float'> = float(0);
    let shortVariance: Node<'float'> = float(0);
    for (const part of parts) {
      const { train } = part;
      const strength = cos(part.phase).mul(part.amplitude);
      if (train.band === SWELL_BAND) {
        const sx = strength.mul(train.omega).mul(swellSlowAttr.x);
        const sz = strength.mul(train.omega).mul(swellSlowAttr.y);
        swellSlopeX = swellSlopeX.add(sx);
        swellSlopeZ = swellSlopeZ.add(sz);
        slopeX = slopeX.add(sx);
        slopeZ = slopeZ.add(sz);
        continue;
      }
      const fade = fadeNode((Math.PI * 2) / train.wavenumber);
      const dx = warpGradX.mul(train.warpScale).add(train.wavenumber * Math.cos(train.angleRad));
      const dz = warpGradZ.mul(train.warpScale).add(train.wavenumber * Math.sin(train.angleRad));
      slopeX = slopeX.add(strength.mul(fade).mul(gust).mul(dx));
      slopeZ = slopeZ.add(strength.mul(fade).mul(gust).mul(dz));
      const amplitudeSlope = part.amplitude.mul(dx.mul(dx).add(dz.mul(dz)).sqrt());
      shortVariance = shortVariance.add(amplitudeSlope.mul(amplitudeSlope).mul(0.5));
    }
    slopeX = slopeX.mul(breakScale);
    slopeZ = slopeZ.mul(breakScale);
    swellSlopeX = swellSlopeX.mul(breakScale);
    swellSlopeZ = swellSlopeZ.mul(breakScale);
    shortVariance = shortVariance.mul(breakScale).mul(breakScale);

    // River drift: two copies of the ripple pattern, each carried along the
    // flow and reset every cycle, half a cycle apart and cross-faded so the
    // pattern never winds up however the flow varies. Still where flow is zero.
    const flowAttr = attribute<'vec2'>('waterFlow', 'vec2');
    const flowStrength = clamp(length(flowAttr).div(RIVER_SURFACE_SPEED_MPS), 0, 1);
    const cycle = this.timeUniform.div(RIPPLE_CYCLE_S);
    const cycleA = fract(cycle);
    const cycleB = fract(cycle.add(0.5));
    const fadeA = oneMinus(abs(oneMinus(cycleA.mul(2))));
    const fadeB = oneMinus(fadeA);
    for (const set of RIPPLE_SETS) {
      const k = (Math.PI * 2) / set.wavelengthM;
      const crest = (cyc: Node<'float'>, fadeIn: Node<'float'>): Node<'float'> => {
        const drift = cyc.mul(RIPPLE_CYCLE_S);
        const along = worldX
          .sub(flowAttr.x.mul(drift))
          .mul(set.dirX)
          .add(worldZ.sub(flowAttr.y.mul(drift)).mul(set.dirZ));
        return cos(along.mul(k).add(set.phase)).mul(fadeIn);
      };
      const rippleFade = fadeNode(set.wavelengthM);
      const ripple = crest(cycleA, fadeA)
        .add(crest(cycleB, fadeB))
        .mul(flowStrength)
        .mul(rippleFade)
        .mul(set.slope);
      slopeX = slopeX.add(ripple.mul(set.dirX));
      slopeZ = slopeZ.add(ripple.mul(set.dirZ));
      const rippleSlope = flowStrength.mul(set.slope);
      shortVariance = shortVariance.add(rippleSlope.mul(rippleSlope).mul(0.5));
    }
    const shadingNormalLocal = normalize(vec3(slopeX.negate(), float(1), slopeZ.negate()));
    material.normalNode = transformNormalToView(shadingNormalLocal);

    // The view: from the surface point to the eye, and the ray refracted into
    // the water. The mesh has no rotation, so local and world agree.
    const eye = normalize(cameraPosition.sub(positionWorld));
    const normal = shadingNormalLocal;
    const cosView = clamp(dot(normal, eye), 0, 1);
    const refracted = refract(eye.negate(), normal, 1 / WATER_IOR);
    const refractedCos = max(refracted.y.negate(), 0.1);

    // The pixel's own water depth, from the scene's depth behind the surface:
    // the point the view ray meets there, below this surface point.
    const sceneViewZ = (uvNode: Node<'vec2'>): Node<'float'> =>
      perspectiveDepthToViewZ(viewportDepthTexture(uvNode).r, cameraNear, cameraFar).negate();
    const fragDistance = max(positionView.z.negate(), 1e-4);
    const behindY = cameraPosition.y.add(
      positionWorld.y.sub(cameraPosition.y).mul(sceneViewZ(screenUV).div(fragDistance)),
    );
    const pixelDepth = clamp(positionWorld.y.sub(behindY), 0, 200);

    // Sky reflection: Schlick's reflectance of the sky tone at the reflected
    // ray's height.
    const fresnel = oneMinus(cosView)
      .pow(5)
      .mul(1 - FRESNEL_F0)
      .add(FRESNEL_F0);
    const reflectedRay = reflect(eye.negate(), normal);
    const skyTone = mix(
      this.skyHorizonUniform,
      this.skyZenithUniform,
      clamp(reflectedRay.y, 0, 1).sqrt(),
    );

    // What shows through: one read of the frame behind the water, bent by the
    // wave normal (not where the bent sample lies in front of the water),
    // dimmed per colour by Beer-Lambert over the refracted path, the lost
    // light replaced by the kind's scatter colour.
    const normalView = transformNormalToView(normal);
    const flatView = transformNormalToView(vec3(0, 1, 0));
    const bend = vec2(normalView.x.sub(flatView.x), normalView.y.sub(flatView.y).negate()).mul(
      REFRACTION_UV_PER_SLOPE,
    );
    const bentUv = screenUV.add(bend.mul(clamp(pixelDepth.div(REFRACTION_FULL_DEPTH_M), 0, 1)));
    const bentBehind = smoothstep(
      fragDistance.sub(0.05),
      fragDistance.add(0.05),
      sceneViewZ(bentUv),
    );
    const seenUv = mix(screenUV, bentUv, bentBehind);
    const bed = viewportSharedTexture(seenUv).rgb;
    const path = pixelDepth.div(refractedCos);
    const absorb = vec3(...ABSORPTION_PER_M).add(murkAttr);
    const transmission = exp(absorb.mul(path).negate());
    const lost = oneMinus(transmission);

    // Light on the bed: a moving net of bright lines where the refracted ray
    // meets it, strongest in the shallows and by day.
    const bedX = positionWorld.x.add(refracted.x.mul(path));
    const bedZ = positionWorld.z.add(refracted.z.mul(path));
    const t = this.timeUniform;
    const noiseAt = (px: Node<'float'>, pz: Node<'float'>, scale: number, pw: Node<'float'>) =>
      mx_noise_float(vec3(px.mul(scale), pz.mul(scale), pw));
    const bedQx = bedX.add(noiseAt(bedX, bedZ, NET_WARP_K, t.mul(0.25)).mul(NET_WARP_M));
    const bedQz = bedZ.add(noiseAt(bedX, bedZ, NET_WARP_K, t.mul(0.25).add(11.7)).mul(NET_WARP_M));
    const netA = sin(bedQx.mul(0.8).add(bedQz.mul(0.6)).mul(NET_SCALE[0]).add(t.mul(0.9)));
    const netB = sin(bedQx.mul(-0.6).add(bedQz.mul(0.8)).mul(NET_SCALE[1]).sub(t.mul(0.8)));
    const net = clamp(
      oneMinus(abs(netA))
        .pow(8)
        .add(oneMinus(abs(netB)).pow(8)),
      0,
      1,
    );
    const netFade = clamp(oneMinus(pixelDepth.div(NET_DEPTH_M)), 0, 1)
      .mul(oneMinus(this.nightFactorUniform))
      .mul(fadeNode(NET_WAVELENGTH_M));
    const netGain = net.mul(netFade).mul(NET_GAIN).add(1);

    // Foam. Surf: where a swell's height, lifted by shoaling, reaches the
    // breaking ratio of the depth, a line just past each crest travels in with
    // it and a trail behind fades over SURF_TRAIL_S; noise breaks both up.
    let swellEnergy: Node<'float'> = float(0);
    let lineMax: Node<'float'> = float(0);
    let trailMax: Node<'float'> = float(0);
    for (const part of parts) {
      if (part.train.band !== SWELL_BAND) continue;
      swellEnergy = swellEnergy.add(part.amplitude.mul(part.amplitude).mul(0.5));
      const past = part.phase.div(TWO_PI).sub(0.25);
      const v = past.sub(round(past));
      const d = v.sub(SURF_LINE_CENTRE_TURNS).div(SURF_LINE_WIDTH_TURNS);
      lineMax = max(lineMax, exp(d.mul(d).negate()));
      const age = max(v.negate(), 0).mul((Math.PI * 2) / part.train.omega);
      trailMax = max(
        trailMax,
        clamp(oneMinus(age.div(SURF_TRAIL_S)), 0, 1)
          .mul(smoothstep(0, 0.03, v.negate()))
          .mul(SURF_TRAIL_STRENGTH),
      );
    }
    const breaking = smoothstep(
      0.85,
      1.05,
      swellEnergy.sqrt().mul(4).div(max(pixelDepth, 1e-3).mul(BREAKING_RATIO)),
    );
    const raggedNoise = noiseAt(worldX, worldZ, 0.15, t.mul(0.2)).mul(0.5).add(0.5);
    const surf = breaking.mul(
      max(
        lineMax
          .mul(smoothstep(SURF_LINE_NOISE[0], SURF_LINE_NOISE[1], raggedNoise))
          .mul(SURF_LINE_STRENGTH),
        trailMax.mul(smoothstep(SURF_TRAIL_NOISE[0], SURF_TRAIL_NOISE[1], raggedNoise)),
      ),
    );

    // Lapping: a band LAP_WIDTH_M wide on the ground. The bed's slope (depth
    // change per metre of ground, from the screen-space derivatives) turns that
    // width into a depth, kept between a floor and a cap; its width breathes
    // with slow noise.
    const breath = noiseAt(worldX, worldZ, 0.11, t.mul(0.15).add(7.3)).mul(0.5).add(0.5);
    const depthPerPixel = length(vec2(dFdx(depthAttr), dFdy(depthAttr)));
    const bedSlope = depthPerPixel.div(max(metresPerPixel, 1e-6));
    const lapDepth = clamp(bedSlope.mul(LAP_WIDTH_M), LAP_DEPTH_M, LAP_MAX_DEPTH_M);
    const lapWidth = breath
      .mul(LAP_BREATH)
      .add(1 - LAP_BREATH)
      .mul(lapDepth);
    const lap = oneMinus(smoothstep(lapWidth.mul(0.5), lapWidth, pixelDepth)).mul(LAP_STRENGTH);

    // River streaks: thin lines stretched along the flow and carried by it,
    // two copies cross-faded as the ripples are.
    const flowDirX = flowAttr.x.div(max(length(flowAttr), 1e-4));
    const flowDirZ = flowAttr.y.div(max(length(flowAttr), 1e-4));
    // The noise is stretched along a few fixed axes and the flow's direction
    // weighs them, so no coordinate frame turns with the flow: a frame turned
    // about the world origin swings the pattern by metres for a small change
    // of direction, and the tile-by-tile flow drew that as nested rectangles.
    const axisWeights = STREAK_AXES.map((angle) => {
      const align = abs(flowDirX.mul(Math.cos(angle)).add(flowDirZ.mul(Math.sin(angle))));
      return align.pow(STREAK_AXIS_SHARPNESS);
    });
    const axisSum = axisWeights.reduce((sum, w) => sum.add(w), float(1e-4));
    const streakCopy = (cyc: Node<'float'>, fadeIn: Node<'float'>): Node<'float'> => {
      const drift = cyc.mul(RIPPLE_CYCLE_S);
      const px = worldX.sub(flowAttr.x.mul(drift));
      const pz = worldZ.sub(flowAttr.y.mul(drift));
      let ridge: Node<'float'> = float(0);
      STREAK_AXES.forEach((angle, k) => {
        const along = px.mul(Math.cos(angle)).add(pz.mul(Math.sin(angle)));
        const across = pz.mul(Math.cos(angle)).sub(px.mul(Math.sin(angle)));
        const line = oneMinus(
          abs(
            mx_noise_float(
              vec3(along.div(STREAK_ALONG_M), across.div(STREAK_ACROSS_M), 5.3 + k * 3.1),
            ),
          ),
        );
        ridge = ridge.add(line.mul(axisWeights[k]!.div(axisSum)));
      });
      return smoothstep(STREAK_RIDGE[0], STREAK_RIDGE[1], ridge).mul(fadeIn);
    };
    const streaks = streakCopy(cycleA, fadeA)
      .add(streakCopy(cycleB, fadeB))
      .mul(flowStrength.mul(flowStrength))
      .mul(fadeNode(STREAK_WIDTH_FADE_M))
      .mul(STREAK_STRENGTH);
    const foam = clamp(max(max(surf, lap), streaks), 0, 1);

    // The colour: the water's own scatter (lit like any surface, so it carries
    // the one night tint) under the sky reflection, fouling and foam over it;
    // the bed seen through is the frame already lit, so it goes in unlit.
    const foulK = clamp(foulAttr, 0, 1).sqrt();
    const body = mix(scatterAttr.mul(lost), vec3(...FOUL_WATER_COLOR), foulK);
    const water = body.mul(oneMinus(fresnel)).add(skyTone.mul(fresnel));
    material.colorNode = mix(water, vec3(1, 1, 1), foam).mul(
      nightTintNode(this.nightFactorUniform),
    );
    const throughSurface = bed
      .mul(transmission)
      .mul(netGain)
      .mul(oneMinus(fresnel))
      .mul(oneMinus(foulK))
      .mul(oneMinus(foam));

    // Sun/moon glint: specular-ish sparkle along the light's half-vector,
    // tinted warm by day / pale by night, scaled by (1-nightFactor) with the
    // moon-glint fixed at MOON_GLINT_FRACTION of that at full night.
    const lightDir = normalize(this.lightDirUniform);
    const halfDir = normalize(lightDir.add(eye));
    const glintNormal = normalize(vec3(swellSlopeX.negate(), float(1), swellSlopeZ.negate()));
    const ndotH = clamp(dot(glintNormal, halfDir), 0, 1);
    const glintFresnel = oneMinus(clamp(dot(glintNormal, eye), 0, 1))
      .pow(5)
      .mul(1 - FRESNEL_F0)
      .add(FRESNEL_F0);
    // One normalised lobe, its exponent from the surface's roughness, times
    // Schlick and the gain: mirrors glintSpecular and glintShininess.
    const shininess = clamp(
      float(2).div(shortVariance.add(GLINT_BASE_VARIANCE).mul(gust).mul(gust)),
      GLINT_MIN_SHININESS,
      GLINT_MAX_SHININESS,
    );
    const specular = min(
      ndotH
        .pow(shininess)
        .mul(shininess.add(8).div(8 * Math.PI))
        .mul(glintFresnel)
        .mul(GLINT_GAIN),
      GLINT_MAX,
    );
    const glintColor = mix(
      vec3(...SUN_GLINT_COLOR),
      vec3(...MOON_GLINT_COLOR),
      this.nightFactorUniform,
    );
    const glintScaleNode = oneMinus(this.nightFactorUniform.mul(1 - MOON_GLINT_FRACTION));
    material.emissiveNode = throughSurface.add(glintColor.mul(specular).mul(glintScaleNode));

    return material;
  }
}
