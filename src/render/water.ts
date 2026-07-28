/**
 * Water surface renderer — the single owner
 * of water. One translucent
 * PlaneGeometry at SEA_LEVEL, animated entirely through TSL node material
 * graphs: three scrolling procedural wave-normal layers (shading-only ripple
 * detail; the third a long-wavelength "chop" layer), a sine-sum vertex
 * swell (amplitude <= 0.35m, with the same chop layer), depth-keyed color
 * sampled from the injected terrain heightAt (shallow teal near shores ->
 * deep navy over depth) fresnel-blended toward an analytic sky reflection
 * (zenith/horizon colors fed per-frame via setSkyColors), an animated
 * scrolling foam band brightening the shoreline where baked depth < ~0.8m,
 * glancing-angle (Fresnel-ish) opacity, and a two-lobe (tight + broad)
 * sun/moon glint scaled by the night-cycle's nightFactor. Every animated
 * quantity is driven by an accumulated time clock advanced from update()'s
 * dtMs — never Date.now/Math.random, matching the rest of the renderer.
 *
 * Readability at RTS distance (~600m) comes from four features layered on the
 * base formula family: (a) a long (~42-55m) wavelength chop layer in both the
 * normal tilt and the swell, (b) the analytic sky reflection above, (c) the
 * animated shoreline foam above, and (d) the second, broader glint lobe below
 * — all four mirrored as pure tested formulas.
 *
 * The pure math below (depthColor, swellHeight, waveNormalTilt,
 * glancingOpacity, reflectedColor, foamStrength, glintSpecular, glintScale)
 * is unit-tested directly; the TSL node graph in createMaterial() mirrors
 * those same formulas into the live shader, the same relationship facade.ts's
 * pure functions have to buildings.ts's TSL mirror.
 */

import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import type { Node } from 'three/webgpu';
import {
  attribute,
  clamp,
  dot,
  float,
  mix,
  normalize,
  oneMinus,
  positionLocal,
  positionViewDirection,
  positionWorldDirection,
  sin,
  transformNormalToView,
  uniform,
  vec3,
} from 'three/tsl';
import { MAP_SIZE, MAX_WATER_DEPTH_VIS, SEA_LEVEL, TILE_METERS } from '../shared/constants';

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
// Positional phase warp — moiré fix. Pure directional sine layers with
// straight wavefronts interfere into a visible lattice/checkerboard from RTS
// distance (the surface reads as woven fabric). Warping every
// layer's phase by a slow 2-term positional sine field bends the wavefronts
// into wandering curves, which breaks the lattice without any texture or
// randomness — still fully deterministic in (x, z, t).
// ---------------------------------------------------------------------------

export const PHASE_WARP_TERMS: ReadonlyArray<{
  readonly amplitude: number; // radians of phase shift contributed
  readonly freqX: number; // radians per meter
  readonly freqZ: number;
}> = [
  { amplitude: 2.4, freqX: 0.071, freqZ: 0.113 },
  { amplitude: 1.7, freqX: 0.157, freqZ: -0.089 },
];

/** Deterministic positional phase offset (radians) at world (x, z). Pure. */
export function phaseWarp(x: number, z: number): number {
  let w = 0;
  for (const term of PHASE_WARP_TERMS) {
    w += Math.sin(x * term.freqX + z * term.freqZ) * term.amplitude;
  }
  return w;
}

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
// Gentle sine-sum vertex swell (amplitude <= SWELL_AMPLITUDE_BUDGET_M total,
// 0.35m) — the actual vertical bob of the surface, low
// frequency/long wavelength.
// ---------------------------------------------------------------------------

interface SwellLayer {
  readonly dirX: number;
  readonly dirZ: number;
  readonly wavelength: number; // meters/cycle
  readonly speed: number; // radians/second
  readonly amplitude: number; // meters
}

/**
 * Total vertex-swell amplitude budget (<= 0.35m total). SWELL_LAYERS'
 * amplitudes must sum to exactly
 * this, so the exported budget stays honest as individual layers are tuned.
 */
export const SWELL_AMPLITUDE_BUDGET_M = 0.35;

/**
 * Three layers; amplitudes sum to exactly SWELL_AMPLITUDE_BUDGET_M. The third
 * (~55m wavelength) is the long-wavelength "chop" layer — slow and large
 * enough to visibly move the surface from RTS camera distance.
 */
export const SWELL_LAYERS: readonly SwellLayer[] = [
  { dirX: 0.891, dirZ: 0.454, wavelength: 85, speed: 0.9, amplitude: 0.09 },
  { dirX: -0.454, dirZ: 0.891, wavelength: 44.3, speed: -1.35, amplitude: 0.06 },
  { dirX: 0.326, dirZ: -0.945, wavelength: 57.7, speed: 0.7, amplitude: 0.2 },
];

function swellPhase(layer: SwellLayer, x: number, z: number, t: number): number {
  const k = TWO_PI / layer.wavelength;
  return (x * layer.dirX + z * layer.dirZ) * k + t * layer.speed + phaseWarp(x, z);
}

/** Deterministic vertical swell offset (meters) at world (x, z), animation time t (seconds). Pure; bounded to +-SWELL_AMPLITUDE_BUDGET_M. */
export function swellHeight(x: number, z: number, t: number): number {
  let h = 0;
  for (const layer of SWELL_LAYERS) h += Math.sin(swellPhase(layer, x, z, t)) * layer.amplitude;
  return h;
}

// ---------------------------------------------------------------------------
// Three scrolling procedural wave-normal layers — shading-only ripple detail,
// higher frequency/shorter wavelength than the swell (except the chop
// layer, long-wavelength by design), perturbing only the normal used for
// lighting/glint (no vertex displacement of their own).
// ---------------------------------------------------------------------------

interface NormalLayer {
  readonly dirX: number;
  readonly dirZ: number;
  readonly wavelength: number;
  readonly speed: number;
  readonly strength: number; // dimensionless tilt magnitude
}

/**
 * Three layers: two short/tight ripple layers plus a
 * long-wavelength (~42m) chop layer whose tilt is large-scale and coherent
 * enough to read as visible tilt/shading from RTS camera distance, where the
 * 7-11m ripples alone read as flat noise.
 */
export const WAVE_NORMAL_LAYERS: readonly NormalLayer[] = [
  { dirX: 0.945, dirZ: 0.326, wavelength: 13.7, speed: 1.6, strength: 0.3 },
  { dirX: -0.292, dirZ: 0.956, wavelength: 8.3, speed: -2.1, strength: 0.22 },
  { dirX: 0.454, dirZ: 0.891, wavelength: 47, speed: 0.55, strength: 0.34 },
];

function normalLayerPhase(layer: NormalLayer, x: number, z: number, t: number): number {
  const k = TWO_PI / layer.wavelength;
  return (x * layer.dirX + z * layer.dirZ) * k + t * layer.speed + phaseWarp(x, z);
}

/** Combined XZ shading-normal tilt (dimensionless) from both scrolling wave-normal layers at world (x,z), time t. Pure; deterministic in t. */
export function waveNormalTilt(x: number, z: number, t: number): [number, number] {
  let tiltX = 0;
  let tiltZ = 0;
  for (const layer of WAVE_NORMAL_LAYERS) {
    const s = Math.sin(normalLayerPhase(layer, x, z, t)) * layer.strength;
    tiltX += s * layer.dirX;
    tiltZ += s * layer.dirZ;
  }
  return [tiltX, tiltZ];
}

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
 * Two-lobe specular glint from ndotH (clamped dot of the shading normal and
 * the light/view half-vector, 0..1): a tight, bright sparkle lobe plus a
 * broader, dimmer lobe so the glitter
 * track is still visible well away from the tight lobe's pinpoint peak — the
 * spread that makes it read from RTS camera distance. Pure; day/night
 * tint/scale apply on top via glintColor/glintScale, not here.
 */
export function glintSpecular(ndotH: number): number {
  const n = clamp01(ndotH);
  return n ** GLINT_SHININESS * GLINT_INTENSITY + n ** GLINT_WIDE_SHININESS * GLINT_WIDE_INTENSITY;
}

// ---------------------------------------------------------------------------
// WaterRenderer
// ---------------------------------------------------------------------------

/** Vertex-grid resolution of the water plane — cheap (GPU-animated), fine enough to carry the swell/normal detail. */
const WATER_SEGMENTS = 128;
const DEFAULT_LIGHT_DIRECTION = new THREE.Vector3(0, 1, 0.15).normalize();

function findDirectionalLight(scene: THREE.Scene): THREE.DirectionalLight | null {
  for (const child of scene.children) {
    if (child instanceof THREE.DirectionalLight) return child;
  }
  return null;
}

/**
 * One translucent surface plane at SEA_LEVEL covering the whole map (opaque
 * terrain above sea level naturally depth-occludes it, exactly like the old
 * terrain.ts flat plane it replaces). `heightAt` is the terrain height
 * sampler (TerrainRenderer.heightAt) used once at construction to bake the
 * per-vertex depth attribute driving the depth-keyed color.
 */
export class WaterRenderer {
  private readonly mesh: THREE.Mesh;
  private readonly material: MeshStandardNodeMaterial;
  private readonly timeUniform = uniform(0);
  private readonly nightFactorUniform = uniform(0);
  private readonly lightDirUniform = uniform(new THREE.Vector3().copy(DEFAULT_LIGHT_DIRECTION));
  private readonly skyZenithUniform = uniform(new THREE.Vector3(...DEFAULT_SKY_ZENITH_COLOR));
  private readonly skyHorizonUniform = uniform(new THREE.Vector3(...DEFAULT_SKY_HORIZON_COLOR));
  private readonly sunLight: THREE.DirectionalLight | null;
  private readonly scratchLightDir = new THREE.Vector3();

  constructor(scene: THREE.Scene, heightAt: HeightSampler, mapSizeTiles: number = MAP_SIZE) {
    this.sunLight = findDirectionalLight(scene);

    const sizeMeters = mapSizeTiles * TILE_METERS;
    const geometry = new THREE.PlaneGeometry(
      sizeMeters,
      sizeMeters,
      WATER_SEGMENTS,
      WATER_SEGMENTS,
    );
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(sizeMeters / 2, 0, sizeMeters / 2);

    const position = geometry.attributes.position;
    if (!position) throw new Error('water plane geometry is missing its position attribute');
    const depths = new Float32Array(position.count);
    for (let i = 0; i < position.count; i++) {
      const worldX = position.getX(i);
      const worldZ = position.getZ(i);
      depths[i] = Math.max(0, SEA_LEVEL - heightAt(worldX, worldZ));
    }
    geometry.setAttribute('waterDepth', new THREE.BufferAttribute(depths, 1));

    this.material = this.createMaterial();

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'water-surface';
    this.mesh.position.y = SEA_LEVEL;
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    scene.add(this.mesh);
  }

  /**
   * Advances the animation clock by dtMs (accumulated seconds — never
   * Date.now) and refreshes the night-driven glint tint/scale and the
   * live sun/moon direction (read from the scene's THREE.DirectionalLight,
   * the same light the day/night cycle drives; falls back to a fixed
   * overhead direction if the scene has none, e.g. in isolated tests).
   */
  update(dtMs: number, nightFactor: number): void {
    this.timeUniform.value += Math.max(0, dtMs) / 1000;
    this.nightFactorUniform.value = clamp01(nightFactor);

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

  private createMaterial(): MeshStandardNodeMaterial {
    const material = new MeshStandardNodeMaterial({
      transparent: true,
      depthWrite: false,
      roughness: 0.18,
      metalness: 0.05,
    });

    const worldX = positionLocal.x;
    const worldZ = positionLocal.z;

    // Baked per-vertex depth (meters) — reused below by the depth-keyed base
    // color, the sky-reflection fresnel weight, and the shoreline foam.
    const depthAttr = attribute<'float'>('waterDepth', 'float');

    // Depth-keyed base color (shallow teal near shores -> deep navy over depth).
    const depthT = clamp(depthAttr.div(MAX_WATER_DEPTH_VIS), 0, 1);
    const baseColor = mix(vec3(...SHALLOW_WATER_COLOR), vec3(...DEEP_WATER_COLOR), depthT);

    // Positional phase warp shared by every wave/foam phase below —
    // mirrors phaseWarp(x, z) exactly (see its doc for why: straight
    // wavefronts interfere into a lattice/moiré at RTS distance).
    let warpNode: Node<'float'> = float(0);
    for (const term of PHASE_WARP_TERMS) {
      warpNode = warpNode.add(
        sin(worldX.mul(term.freqX).add(worldZ.mul(term.freqZ))).mul(term.amplitude),
      );
    }

    // Sine-sum vertex swell (vertical displacement only) — three layers, the
    // third (~55m) the long-wavelength chop.
    let swell: Node<'float'> = float(0);
    for (const layer of SWELL_LAYERS) {
      const k = TWO_PI / layer.wavelength;
      const phase = worldX
        .mul(layer.dirX)
        .add(worldZ.mul(layer.dirZ))
        .mul(k)
        .add(this.timeUniform.mul(layer.speed))
        .add(warpNode);
      swell = swell.add(sin(phase).mul(layer.amplitude));
    }
    material.positionNode = positionLocal.add(vec3(0, swell, 0));

    // Scrolling wave-normal layers: shading-only XZ tilt (no displacement) —
    // three layers, the third (~47m) the long-wavelength chop.
    let tiltX: Node<'float'> = float(0);
    let tiltZ: Node<'float'> = float(0);
    for (const layer of WAVE_NORMAL_LAYERS) {
      const k = TWO_PI / layer.wavelength;
      const phase = worldX
        .mul(layer.dirX)
        .add(worldZ.mul(layer.dirZ))
        .mul(k)
        .add(this.timeUniform.mul(layer.speed))
        .add(warpNode);
      const s = sin(phase).mul(layer.strength);
      tiltX = tiltX.add(s.mul(layer.dirX));
      tiltZ = tiltZ.add(s.mul(layer.dirZ));
    }
    const shadingNormalLocal = normalize(vec3(tiltX, float(1), tiltZ));
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
    material.colorNode = mix(reflected, vec3(1, 1, 1), foam);

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
    const specular = ndotH
      .pow(GLINT_SHININESS)
      .mul(GLINT_INTENSITY)
      .add(ndotH.pow(GLINT_WIDE_SHININESS).mul(GLINT_WIDE_INTENSITY));
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
