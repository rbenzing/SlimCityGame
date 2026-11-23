/**
 * Water surface renderer: the single owner of water. One translucent mesh at
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
 * are carried along by the current. Colour is keyed to depth and fouling,
 * blended toward an analytic sky reflection, with shoreline foam and a
 * two-lobe sun/moon glint. Every animated quantity runs off a clock advanced
 * from update()'s dtMs: no wall clock and no random numbers.
 *
 * The pure math below (depthColor, glancingOpacity, reflectedColor,
 * foamStrength, glintSpecular, glintScale) is unit-tested directly; the node
 * graph mirrors those formulas into the live shader.
 */

import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import type { Node } from 'three/webgpu';
import {
  abs,
  attribute,
  clamp,
  cos,
  dFdx,
  dFdy,
  dot,
  float,
  fract,
  length,
  max,
  min,
  mix,
  normalize,
  oneMinus,
  positionGeometry,
  positionViewDirection,
  positionWorld,
  positionWorldDirection,
  sin,
  smoothstep,
  transformNormalToView,
  uniform,
  vec3,
} from 'three/tsl';
import { nightTintNode } from './nightlook';
import { MAP_SIZE, MAX_WATER_DEPTH_VIS, SEA_LEVEL, TILE_METERS } from '../shared/constants';
import {
  RIVER_SURFACE_SPEED_MPS,
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
  phaseWarp,
} from '../shared/waves';
import type { WaveTrain } from '../shared/waves';

export type HeightSampler = (x: number, z: number) => number;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const lerp3 = (
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): [number, number, number] => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

const TWO_PI = Math.PI * 2;

// ---------------------------------------------------------------------------
// Depth-keyed surface color (shallow teal near shores -> deep navy over depth).
// ---------------------------------------------------------------------------

export const SHALLOW_WATER_COLOR: readonly [number, number, number] = [0.08, 0.5, 0.48];
export const DEEP_WATER_COLOR: readonly [number, number, number] = [0.02, 0.06, 0.22];

/** Water SURFACE color at a given depth (meters below SEA_LEVEL), saturating at MAX_WATER_DEPTH_VIS. Pure. */
export function depthColor(depth: number): [number, number, number] {
  const t = clamp01(depth / MAX_WATER_DEPTH_VIS);
  return lerp3(SHALLOW_WATER_COLOR, DEEP_WATER_COLOR, t);
}

// ---------------------------------------------------------------------------
// Fouling: where the city's drains empty, the surface goes from its depth
// colour toward a murky brown, by the sim's 0..255 fouling of the tiles that
// meet at each vertex.
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

/** The surface colour at `depth` once fouled by `foul` (0..1): the depth colour mixed toward the foul colour by foulMix. Pure. */
export function fouledColor(depth: number, foul: number): [number, number, number] {
  return lerp3(depthColor(depth), FOUL_WATER_COLOR, foulMix(foul));
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
  { dirX: 0.8, dirZ: 0.6, wavelengthM: 4, slope: 0.12, phase: 0.7 },
  { dirX: -0.6, dirZ: 0.8, wavelengthM: 1.5, slope: 0.08, phase: 3.1 },
  { dirX: 0.95, dirZ: -0.31, wavelengthM: 9, slope: 0.05, phase: 5 },
];

/** Seconds a ripple pattern drifts before it fades out and is replaced by a copy half a cycle on. */
export const RIPPLE_CYCLE_S = 4;

// ---------------------------------------------------------------------------
// Glancing-angle (Fresnel-ish) opacity — more opaque/reflective at grazing
// view angles, clearer looking straight down.
// ---------------------------------------------------------------------------

export const OPACITY_AT_NORMAL_INCIDENCE = 0.55;
export const OPACITY_AT_GRAZING_ANGLE = 0.92;

/** Surface opacity from cosViewAngle (1 = straight-on/normal incidence, 0 = grazing/horizon). Pure. */
export function glancingOpacity(cosViewAngle: number): number {
  const c = clamp01(cosViewAngle);
  return lerp(OPACITY_AT_GRAZING_ANGLE, OPACITY_AT_NORMAL_INCIDENCE, c);
}

// ---------------------------------------------------------------------------
// Analytic sky reflection — fresnel-weighted blend of the sky
// dome's zenith/horizon colors into the depth-keyed surface color. No render
// pass, no cubemap: reuses the same cosView glancingOpacity is keyed on, so
// grazing views read mostly sky (a mirror) and overhead views read mostly
// the water body's own depth color (see-through), matching real water.
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

/**
 * Water surface color once the analytic sky reflection is blended in.
 * cosView=1 (straight down) sees its own depthColor (fresnel weight 0, no
 * sky contribution); cosView=0 (grazing) sees pure horizon (fresnel weight
 * 1); in between, the reflected sky tone itself slides from horizon toward
 * zenith as the view steepens. A mirror blend, not a lit surface. Pure.
 */
export function reflectedColor(
  cosView: number,
  depthColor: readonly [number, number, number],
  zenith: readonly [number, number, number],
  horizon: readonly [number, number, number],
): [number, number, number] {
  const c = clamp01(cosView);
  const sky = lerp3(horizon, zenith, c);
  const fresnelWeight = 1 - c;
  return lerp3(depthColor, sky, fresnelWeight);
}

// ---------------------------------------------------------------------------
// Animated shoreline foam — a scrolling brightening band where the baked
// waterDepth attribute is shallow, pulsing against the static
// waterline (the separate, unanimated terrain-side foam band at 0.4m).
// ---------------------------------------------------------------------------

/** Depth (m) below which the animated foam band can appear (baked depth < ~0.8m). */
export const SHORELINE_FOAM_DEPTH_M = 0.8;
// Moiré fix: a single straight sine band would paint the whole shallow zone
// with diagonal zebra stripes. Foam is instead the product of two
// crossed, phase-warped scrolling waves — patchy pulses that hug the shore —
// shaped by an envelope exponent and capped below pure white.
const FOAM_WAVELENGTH_A = 6.3;
const FOAM_WAVELENGTH_B = 9.7;
const FOAM_DIR_A_X = 0.945;
const FOAM_DIR_A_Z = 0.326;
const FOAM_DIR_B_X = -0.292;
const FOAM_DIR_B_Z = 0.956;
const FOAM_SPEED_A = 1.6; // radians/second
const FOAM_SPEED_B = -1.1;
const FOAM_ENVELOPE_EXPONENT = 1.6; // hugs the waterline tighter than linear
const FOAM_PATTERN_EXPONENT = 1.3; // sharpens the crossed-wave product into patches
const FOAM_MAX = 0.9; // never a pure-white wash

/**
 * Foam brightening strength (0..FOAM_MAX) at world (x,z), animation time t
 * (seconds), for a given baked water depth (meters): the product of two
 * crossed, phase-warped scrolling waves (patchy pulses, not straight bands)
 * inside an envelope that fades from 1 at depth<=0 to 0 at
 * depth>=SHORELINE_FOAM_DEPTH_M. Pure; deterministic in (x, z, t).
 */
export function foamStrength(depth: number, x: number, z: number, t: number): number {
  const envelope = clamp01(1 - depth / SHORELINE_FOAM_DEPTH_M) ** FOAM_ENVELOPE_EXPONENT;
  if (envelope <= 0) return 0;
  const warp = phaseWarp(x, z);
  const phaseA =
    (x * FOAM_DIR_A_X + z * FOAM_DIR_A_Z) * (TWO_PI / FOAM_WAVELENGTH_A) + warp + t * FOAM_SPEED_A;
  const phaseB =
    (x * FOAM_DIR_B_X + z * FOAM_DIR_B_Z) * (TWO_PI / FOAM_WAVELENGTH_B) +
    warp * 0.7 +
    t * FOAM_SPEED_B;
  const a = Math.sin(phaseA) * 0.5 + 0.5;
  const b = Math.sin(phaseB) * 0.5 + 0.5;
  return envelope * (a * b) ** FOAM_PATTERN_EXPONENT * FOAM_MAX;
}

// ---------------------------------------------------------------------------
// Sun/moon glint day-night scaling.
// ---------------------------------------------------------------------------

/** Moon-glint strength at full night, as a fraction of the day sun-glint (moon-glint at night x0.2). */
export const MOON_GLINT_FRACTION = 0.2;

export const SUN_GLINT_COLOR: readonly [number, number, number] = [1, 0.96, 0.82];
export const MOON_GLINT_COLOR: readonly [number, number, number] = [0.75, 0.82, 0.95];
const GLINT_SHININESS = 60; // tight sparkle lobe
const GLINT_INTENSITY = 1.4;
const GLINT_WIDE_SHININESS = 12; // broad lobe so the glitter track survives a wide/distant shot
const GLINT_WIDE_INTENSITY = 0.15; // kept low: 0.35 would highlight every wave-lattice crossing as a dot grid

/**
 * Glint intensity multiplier: 1 at full day (nightFactor=0), scaled by
 * (1-nightFactor) toward MOON_GLINT_FRACTION (0.2) at full night. Pure.
 */
export function glintScale(nightFactor: number): number {
  const n = clamp01(nightFactor);
  return 1 - (1 - MOON_GLINT_FRACTION) * n;
}

/**
 * How much both glint lobes widen per unit of slope variance the pixel fade
 * took out of the normal: far water, whose small waves are too fine to shade,
 * glitters evenly instead of showing stripes.
 */
export const GLINT_ROUGHEN = 400;

/**
 * Two-lobe specular glint from ndotH (clamped dot of the shading normal and
 * the light/view half-vector, 0..1): a tight, bright sparkle lobe plus a
 * broader, dimmer lobe so the glitter
 * track is still visible well away from the tight lobe's pinpoint peak — the
 * spread that makes it read from RTS camera distance. `variance` is the
 * slope variance of the waves too fine to shade: each lobe's shininess is
 * divided by 1 + GLINT_ROUGHEN * variance. Pure; day/night
 * tint/scale apply on top via glintColor/glintScale, not here.
 */
export function glintSpecular(ndotH: number, variance = 0): number {
  const n = clamp01(ndotH);
  const rough = 1 + GLINT_ROUGHEN * Math.max(0, variance);
  return (
    n ** (GLINT_SHININESS / rough) * GLINT_INTENSITY +
    n ** (GLINT_WIDE_SHININESS / rough) * GLINT_WIDE_INTENSITY
  );
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
    for (let i = 0; i < count; i++) {
      const x = grid.positions[i * 3]!;
      const z = grid.positions[i * 3 + 2]!;
      const d = Math.max(0, SEA_LEVEL - this.heightAt(x, z));
      const s = sampleWater(bodies, x, z);
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
    return { geometry, bodies, foul };
  }

  /** Tells the water that terrain heights, and so perhaps the water mask, changed. */
  markTerrainChanged(): void {
    this.dirty = true;
    this.idleS = 0;
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
      roughness: 0.18,
      metalness: 0.05,
    });

    // The mesh sits at the origin in x and z, so the raw vertex position is world.
    const worldX = positionGeometry.x;
    const worldZ = positionGeometry.z;

    // Per-vertex depth (meters) — reused below by the wave cap, the depth-keyed
    // base color, the sky-reflection fresnel weight, and the shoreline foam.
    const depthAttr = attribute<'float'>('waterDepth', 'float');

    // Depth-keyed base color (shallow teal near shores -> deep navy over depth),
    // then fouled toward the sewage brown by the per-vertex fouling — mirrors
    // fouledColor exactly.
    const depthT = clamp(depthAttr.div(MAX_WATER_DEPTH_VIS), 0, 1);
    const cleanColor = mix(vec3(...SHALLOW_WATER_COLOR), vec3(...DEEP_WATER_COLOR), depthT);
    const foulAttr = attribute<'float'>('waterFoul', 'float');
    const baseColor = mix(cleanColor, vec3(...FOUL_WATER_COLOR), clamp(foulAttr, 0, 1).sqrt());

    // Positional phase warp shared by every wave/foam phase below —
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
    let slopeX: Node<'float'> = float(0);
    let slopeZ: Node<'float'> = float(0);
    // The slope variance the fade takes out of the normal, half the square of
    // each train's removed slope amplitude: the glint widens by it.
    let removedVariance: Node<'float'> = float(0);
    for (const part of parts) {
      const { train } = part;
      const strength = cos(part.phase).mul(part.amplitude);
      if (train.band === SWELL_BAND) {
        slopeX = slopeX.add(strength.mul(train.omega).mul(swellSlowAttr.x));
        slopeZ = slopeZ.add(strength.mul(train.omega).mul(swellSlowAttr.y));
        continue;
      }
      const fade = fadeNode((Math.PI * 2) / train.wavenumber);
      const dx = warpGradX.mul(train.warpScale).add(train.wavenumber * Math.cos(train.angleRad));
      const dz = warpGradZ.mul(train.warpScale).add(train.wavenumber * Math.sin(train.angleRad));
      slopeX = slopeX.add(strength.mul(fade).mul(dx));
      slopeZ = slopeZ.add(strength.mul(fade).mul(dz));
      const removed = part.amplitude.mul(oneMinus(fade)).mul(dx.mul(dx).add(dz.mul(dz)).sqrt());
      removedVariance = removedVariance.add(removed.mul(removed).mul(0.5));
    }
    slopeX = slopeX.mul(breakScale);
    slopeZ = slopeZ.mul(breakScale);
    removedVariance = removedVariance.mul(breakScale).mul(breakScale);

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
      const rippleRemoved = flowStrength.mul(oneMinus(rippleFade)).mul(set.slope);
      removedVariance = removedVariance.add(rippleRemoved.mul(rippleRemoved).mul(0.5));
    }
    const shadingNormalLocal = normalize(vec3(slopeX.negate(), float(1), slopeZ.negate()));
    material.normalNode = transformNormalToView(shadingNormalLocal);

    // Glancing-angle (Fresnel-ish) cosView — shared by opacity below and by
    // the sky reflection's fresnel weight.
    const viewDir = normalize(positionViewDirection);
    const cosView = clamp(dot(transformNormalToView(shadingNormalLocal), viewDir), 0, 1);
    material.opacityNode = mix(
      float(OPACITY_AT_GRAZING_ANGLE),
      float(OPACITY_AT_NORMAL_INCIDENCE),
      cosView,
    );

    // v2: analytic sky reflection — mirrors reflectedColor(cosView,
    // depthColor, zenith, horizon) exactly: the sky tone itself slides
    // horizon->zenith as cosView rises, then blends toward the base water
    // color by (1-cosView) (a pure mirror, not a lit surface).
    const skyTone = mix(this.skyHorizonUniform, this.skyZenithUniform, cosView);
    const reflected = mix(baseColor, skyTone, oneMinus(cosView));

    // Animated shoreline foam — mirrors foamStrength(depth, x, z, t)
    // exactly: a shore-hugging envelope (linear falloff raised to
    // FOAM_ENVELOPE_EXPONENT) times the product of two crossed, phase-warped
    // scrolling waves (patchy pulses, not straight zebra bands), capped at
    // FOAM_MAX and mixed toward white.
    const foamEnvelope = clamp(oneMinus(depthAttr.div(SHORELINE_FOAM_DEPTH_M)), 0, 1).pow(
      FOAM_ENVELOPE_EXPONENT,
    );
    const foamPhaseA = worldX
      .mul(FOAM_DIR_A_X)
      .add(worldZ.mul(FOAM_DIR_A_Z))
      .mul(TWO_PI / FOAM_WAVELENGTH_A)
      .add(warpNode)
      .add(this.timeUniform.mul(FOAM_SPEED_A));
    const foamPhaseB = worldX
      .mul(FOAM_DIR_B_X)
      .add(worldZ.mul(FOAM_DIR_B_Z))
      .mul(TWO_PI / FOAM_WAVELENGTH_B)
      .add(warpNode.mul(0.7))
      .add(this.timeUniform.mul(FOAM_SPEED_B));
    const foamA = sin(foamPhaseA).mul(0.5).add(0.5);
    const foamB = sin(foamPhaseB).mul(0.5).add(0.5);
    const foam = foamEnvelope.mul(foamA.mul(foamB).pow(FOAM_PATTERN_EXPONENT)).mul(FOAM_MAX);
    // The surface is lit by the scene's sun and sky like any other, so it
    // carries the one night tint too and reads no brighter than the shore.
    material.colorNode = mix(reflected, vec3(1, 1, 1), foam).mul(
      nightTintNode(this.nightFactorUniform),
    );

    // Sun/moon glint: specular-ish sparkle along the light's half-vector,
    // tinted warm by day / pale by night, scaled by (1-nightFactor) with the
    // moon-glint fixed at MOON_GLINT_FRACTION of that at full night.
    const worldViewDir = normalize(positionWorldDirection);
    const lightDir = normalize(this.lightDirUniform);
    const halfDir = normalize(lightDir.add(worldViewDir));
    const ndotH = clamp(dot(shadingNormalLocal, halfDir), 0, 1);
    // A tight lobe plus a second, wider/dimmer lobe — mirrors
    // glintSpecular's two-term sum exactly, so the glitter track survives a
    // wide/distant RTS shot instead of collapsing to a single pinpoint.
    const rough = removedVariance.mul(GLINT_ROUGHEN).add(1);
    const specular = ndotH
      .pow(rough.reciprocal().mul(GLINT_SHININESS))
      .mul(GLINT_INTENSITY)
      .add(ndotH.pow(rough.reciprocal().mul(GLINT_WIDE_SHININESS)).mul(GLINT_WIDE_INTENSITY));
    const glintColor = mix(
      vec3(...SUN_GLINT_COLOR),
      vec3(...MOON_GLINT_COLOR),
      this.nightFactorUniform,
    );
    const glintScaleNode = oneMinus(this.nightFactorUniform.mul(1 - MOON_GLINT_FRACTION));
    material.emissiveNode = glintColor.mul(specular).mul(glintScaleNode);

    return material;
  }
}
