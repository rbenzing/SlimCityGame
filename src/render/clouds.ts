/**
 * Cumulus cloud layer: an instanced pool of flat-bottomed
 * puff billboards, "sometimes cloudy" — coverage sweeps deterministically
 * between clear and scattered over a slow (~10-game-day) seeded cycle, tint
 * follows scene.ts's existing time-of-day ramp, and the whole pool drifts
 * slowly in world space, wrapping at the map bounds + a margin.
 *
 * Billboard shape: CloudLayer.update() only ever receives (dtMs, tick,
 * timeOfDay) — no camera — so per-instance camera-facing rotation isn't
 * available (three.js has no InstancedSprite). Instead each cloud is a flat
 * plane lying near-horizontal, high above the map: since the city-builder
 * camera's pitch is bounded away from both the horizon and straight-down
 * (CAMERA_MIN_PITCH/MAX_PITCH) and orbits freely in yaw, a horizontal plane
 * is the one orientation that reads correctly from every yaw angle without
 * needing to track the camera at all — and since the camera looks up at the
 * cloud layer from below, the puff texture is authored for exactly that
 * view: a fluffy top-lit rim around a grey, flat-ish underside.
 */
import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { MAP_SIZE, TICKS_PER_DAY, TILE_METERS } from '../shared/constants';
import { timeOfDayColors } from './scene';

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

// ---------------------------------------------------------------------------
// Deterministic PRNG (public-domain mulberry32); never Math.random. Kept as
// its own local copy — every render module that needs one does the same
// (stars.ts, trees.ts) so each file stays independently ownable.
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

// ---------------------------------------------------------------------------
// Puff textures: canvas 2D value-noise, baked once at construction (pure
// pixel generation kept separate from the DOM/canvas step, exactly like the
// codebase's other canvas-drawn sprites split a testable pure part from a
// best-effort DOM part — see pin.ts's drawPinCanvas).
// ---------------------------------------------------------------------------

/** Square texture side, pixels. */
export const PUFF_TEXTURE_SIZE = 48;
/** Fixed seeds for the procedural puff sprites — never Math.random. */
export const PUFF_VARIANT_SEEDS: readonly number[] = [0x50553101, 0x50553102, 0x50553103];

const PUFF_NOISE_FREQUENCY = 2.2;
/** Ellipse radius above the vertical center (fluffy, generous rounded top). */
const PUFF_UPPER_RADIUS = 1.0;
/** Ellipse radius below the vertical center (compressed close to the centerline — the flat-bottomed cumulus cutoff). */
const PUFF_LOWER_RADIUS = 0.45;
/** Shade multiplier at the very bottom edge (1 = unshaded/white at the top). */
const PUFF_GREY_UNDERSIDE = 0.62;

/**
 * Deterministic puff alpha-mask + shade buffer: a squashed,
 * flat-bottomed silhouette (generous rounded top half, compressed bottom
 * half) modulated by 2D value noise for a fluffy, irregular edge, with a
 * vertical white-top -> grey-underside shade gradient baked into RGB
 * (alpha carries the shape). Pure — no canvas/DOM — so it's testable and
 * hashable without a GPU. Same (seed, size) always yields the same bytes.
 */
export function puffTexturePixels(
  seed: number,
  size: number = PUFF_TEXTURE_SIZE,
): Uint8ClampedArray {
  const noise2D = createNoise2D(mulberry32(seed));
  const pixels = new Uint8ClampedArray(size * size * 4);

  for (let py = 0; py < size; py++) {
    const v = size <= 1 ? 0 : (py / (size - 1)) * 2 - 1; // -1 top .. +1 bottom
    const vRadius = v < 0 ? PUFF_UPPER_RADIUS : PUFF_LOWER_RADIUS;
    const shade = 1 - clamp01((v + 1) / 2) * (1 - PUFF_GREY_UNDERSIDE);
    const shadeByte = Math.round(clamp01(shade) * 255);

    for (let px = 0; px < size; px++) {
      const u = size <= 1 ? 0 : (px / (size - 1)) * 2 - 1; // -1 left .. +1 right
      const dist = Math.hypot(u, v / vRadius);
      const wobble = (noise2D(u * PUFF_NOISE_FREQUENCY, v * PUFF_NOISE_FREQUENCY) + 1) / 2;
      const shapeFalloff = clamp01(1 - dist);
      const alpha = clamp01(shapeFalloff * (0.5 + 0.5 * wobble));

      const i = (py * size + px) * 4;
      pixels[i] = shadeByte;
      pixels[i + 1] = shadeByte;
      pixels[i + 2] = shadeByte;
      pixels[i + 3] = Math.round(alpha * 255);
    }
  }

  return pixels;
}

/**
 * Draws puffTexturePixels(seed) into a real canvas via putImageData. Falls
 * back to a blank (but still valid) canvas when a 2D context isn't available
 * (e.g. jsdom without the optional `canvas` npm package) — real browsers
 * always have one (same fallback idiom as pin.ts's MapPin).
 */
function drawPuffCanvas(seed: number): HTMLCanvasElement {
  const size = PUFF_TEXTURE_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const pixels = puffTexturePixels(seed, size);
  const imageData = ctx.createImageData(size, size);
  imageData.data.set(pixels);
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function buildPuffMaterial(seed: number): THREE.MeshBasicMaterial {
  const texture = new THREE.CanvasTexture(drawPuffCanvas(seed));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return new THREE.MeshBasicMaterial({
    map: texture,
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
}

// ---------------------------------------------------------------------------
// Coverage: a slow seeded 2D-noise walk around a fixed circle in noise space,
// keyed by tick/CLOUD_COVERAGE_PERIOD_TICKS — this makes cloudCoverage EXACTLY
// periodic (tick and tick+period map to the identical noise-space point),
// which a straight 1D/linear noise sample over tick would not give for free.
// ---------------------------------------------------------------------------

/** ~10 game days, matching constants.ts's TICKS_PER_DAY. */
export const CLOUD_COVERAGE_PERIOD_TICKS = TICKS_PER_DAY * 10;
const COVERAGE_NOISE_SEED = 0x434f5645; // fixed constant — never Math.random
/** Large enough that a full lap of the circle samples meaningfully different noise, not a near-constant neighborhood. */
const COVERAGE_ORBIT_RADIUS = 2.6;
const coverageNoise2D = createNoise2D(mulberry32(COVERAGE_NOISE_SEED));

/**
 * Deterministic "sometimes cloudy" coverage in [0,1]: a
 * seeded 2D-noise sample walked around a circle whose angle is
 * tick/CLOUD_COVERAGE_PERIOD_TICKS, so the result is exactly periodic and
 * varies smoothly between clear (near 0) and scattered (near 1) — the input
 * for cloud coverage/opacity today, and for a future weather system later.
 */
export function cloudCoverage(tick: number): number {
  const cycles = tick / CLOUD_COVERAGE_PERIOD_TICKS;
  const angle = (cycles - Math.floor(cycles)) * Math.PI * 2;
  const nx = Math.cos(angle) * COVERAGE_ORBIT_RADIUS;
  const nz = Math.sin(angle) * COVERAGE_ORBIT_RADIUS;
  const n = coverageNoise2D(nx, nz);
  return clamp01((n + 1) / 2);
}

// ---------------------------------------------------------------------------
// Drift wrap math
// ---------------------------------------------------------------------------

/** Meters a cloud may drift past the map edge before wrapping back around. */
export const CLOUD_DRIFT_MARGIN_METERS = 500;

/** Wraps `value` into [-margin, mapMeters+margin) — world-space drift wrap. */
export function wrapCloudCoordinate(value: number, mapMeters: number, margin: number): number {
  const span = mapMeters + margin * 2;
  const min = -margin;
  const rel = (((value - min) % span) + span) % span;
  return rel + min;
}

// ---------------------------------------------------------------------------
// Time-of-day tint
// ---------------------------------------------------------------------------

export interface CloudTint {
  /** RGB tint multiplier for the puff materials. */
  color: [number, number, number];
  /** 0..1 — fades clouds toward near-invisible at night, on top of the coverage-driven opacity. */
  opacityMultiplier: number;
}

/** How strongly night fades clouds toward invisible (1 = fully, matching "near-invisible" rather than literally 0). */
const CLOUD_NIGHT_FADE_STRENGTH = 0.92;

/** Cloud tint from the existing time-of-day ramp: white noon -> orange dusk -> near-invisible night. */
export function cloudTint(t: number): CloudTint {
  const c = timeOfDayColors(t);
  const opacityMultiplier = clamp01(1 - c.nightFactor * CLOUD_NIGHT_FADE_STRENGTH);
  return { color: [c.sunColor[0], c.sunColor[1], c.sunColor[2]], opacityMultiplier };
}

// ---------------------------------------------------------------------------
// CloudLayer
// ---------------------------------------------------------------------------

/** Instanced-billboard pool capacity ("pool of 20-40 cloud billboards"). */
export const CLOUD_POOL_SIZE = 40;

const MAP_METERS = MAP_SIZE * TILE_METERS;
/** Fixed seed for per-slot placement/scale/rotation/variant hashing — never Math.random. */
const CLOUD_LAYOUT_SEED = 0x434c4443;
const CLOUD_BASE_ALTITUDE = 320; // meters
const CLOUD_ALTITUDE_JITTER = 50; // +/- meters, per-slot
const CLOUD_WIDTH_MIN = 70; // meters
const CLOUD_WIDTH_MAX = 150; // meters
const CLOUD_DEPTH_RATIO = 0.72; // depth (Z-extent) relative to width

/** Fixed "wind" — a single shared direction/speed gives the pool's "slow uniform drift". */
const WIND_DIRECTION_RADIANS = 0.62;
const WIND_SPEED_MPS = 1.4;

/** Opacity floor once at least one cloud is active, so a lone cloud still reads as wispy rather than a flat cutout. */
const CLOUD_MIN_OPACITY = 0.3;

interface CloudSlot {
  variant: number;
  baseX: number;
  baseZ: number;
  altitude: number;
  yaw: number;
  width: number;
  depth: number;
}

/** 32-bit avalanche hash of (slot, salt, CLOUD_LAYOUT_SEED) -> [0,1) — deterministic, decorrelated per salt, never Math.random. */
function slotHash(slot: number, salt: number): number {
  let h =
    (Math.imul(slot + 1, 374761393) +
      Math.imul(salt + 1, 668265263) +
      Math.imul(CLOUD_LAYOUT_SEED, 2246822519)) >>>
    0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/** Per-slot static placement ("per-cloud scale/height variation from slot hash"). Base position excludes drift, added back each frame. */
function buildSlots(count: number, variantCount: number): CloudSlot[] {
  const margin = CLOUD_DRIFT_MARGIN_METERS;
  const span = MAP_METERS + margin * 2;
  const slots: CloudSlot[] = [];
  for (let slot = 0; slot < count; slot++) {
    const baseX = -margin + slotHash(slot, 0) * span;
    const baseZ = -margin + slotHash(slot, 1) * span;
    const altitude = CLOUD_BASE_ALTITUDE + (slotHash(slot, 2) * 2 - 1) * CLOUD_ALTITUDE_JITTER;
    const yaw = slotHash(slot, 3) * Math.PI * 2;
    const width = CLOUD_WIDTH_MIN + slotHash(slot, 4) * (CLOUD_WIDTH_MAX - CLOUD_WIDTH_MIN);
    const depth = width * CLOUD_DEPTH_RATIO;
    const variant = Math.min(variantCount - 1, Math.floor(slotHash(slot, 5) * variantCount));
    slots.push({ variant, baseX, baseZ, altitude, yaw, width, depth });
  }
  return slots;
}

/** Unit flat plane (scaled per-instance): lies near-horizontal, DoubleSide material handles being viewed from below (see file doc). */
function buildCloudPlaneGeometry(): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const HIDDEN_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Cumulus cloud layer: CLOUD_POOL_SIZE flat puff billboards
 * split across PUFF_VARIANT_SEEDS.length InstancedMeshes (one per texture
 * variant, mirroring trees.ts's one-InstancedMesh-per-species idiom), drifting
 * uniformly in world space and toggling how many are active + how opaque they
 * are from cloudCoverage(tick), tinted from cloudTint(timeOfDay).
 */
export class CloudLayer {
  readonly meshes: THREE.InstancedMesh[];
  private readonly slots: CloudSlot[];
  private readonly localIndexOf: number[];
  private readonly materials: THREE.MeshBasicMaterial[];
  private driftX = 0;
  private driftZ = 0;
  private lastCoverage = 0;
  private lastActiveCount = 0;

  constructor(scene: THREE.Scene) {
    const variantCount = PUFF_VARIANT_SEEDS.length;
    this.slots = buildSlots(CLOUD_POOL_SIZE, variantCount);

    const countPerVariant = new Array<number>(variantCount).fill(0);
    this.localIndexOf = new Array<number>(this.slots.length).fill(0);
    for (let i = 0; i < this.slots.length; i++) {
      const variant = this.slots[i]!.variant;
      this.localIndexOf[i] = countPerVariant[variant] ?? 0;
      countPerVariant[variant] = (countPerVariant[variant] ?? 0) + 1;
    }

    const geometry = buildCloudPlaneGeometry();
    this.materials = PUFF_VARIANT_SEEDS.map((seed) => buildPuffMaterial(seed));
    this.meshes = this.materials.map((material, variant) => {
      const variantSlotCount = countPerVariant[variant] ?? 0;
      const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, variantSlotCount));
      mesh.count = variantSlotCount;
      // The layer drifts unboundedly with the wind and repositions every
      // frame — three.js's one-shot cached bounding sphere would go stale and
      // wrongly cull the whole layer once it drifts far from where the first
      // cull pass saw it.
      mesh.frustumCulled = false;
      scene.add(mesh);
      return mesh;
    });

    this.applyFrame(0, 0.5);
  }

  /** Advances the slow uniform drift and repaints the pool for (tick, timeOfDay). */
  update(dtMs: number, tick: number, timeOfDay: number): void {
    const dtSeconds = Math.max(0, dtMs) / 1000;
    this.driftX += Math.cos(WIND_DIRECTION_RADIANS) * WIND_SPEED_MPS * dtSeconds;
    this.driftZ += Math.sin(WIND_DIRECTION_RADIANS) * WIND_SPEED_MPS * dtSeconds;
    this.applyFrame(tick, timeOfDay);
  }

  /** Clouds currently shown (out of poolSize()), from the last update()/construction. */
  activeCount(): number {
    return this.lastActiveCount;
  }

  /** cloudCoverage(tick) from the last update()/construction. */
  coverage(): number {
    return this.lastCoverage;
  }

  /** Accumulated world-space drift (meters) since construction. */
  driftOffset(): { x: number; z: number } {
    return { x: this.driftX, z: this.driftZ };
  }

  /** Total instanced-billboard pool capacity ("pool of 20-40"). */
  poolSize(): number {
    return this.slots.length;
  }

  private applyFrame(tick: number, timeOfDay: number): void {
    const coverage = clamp01(cloudCoverage(tick));
    this.lastCoverage = coverage;
    const activeCount = Math.round(coverage * this.slots.length);
    this.lastActiveCount = activeCount;

    const tint = cloudTint(timeOfDay);
    const coverageOpacity = CLOUD_MIN_OPACITY + (1 - CLOUD_MIN_OPACITY) * coverage;
    const finalOpacity = clamp01(coverageOpacity * tint.opacityMultiplier);
    for (const material of this.materials) {
      material.color.setRGB(tint.color[0], tint.color[1], tint.color[2]);
      material.opacity = finalOpacity;
    }

    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i]!;
      const mesh = this.meshes[slot.variant]!;
      const localIndex = this.localIndexOf[i]!;

      if (i >= activeCount) {
        mesh.setMatrixAt(localIndex, HIDDEN_MATRIX);
        continue;
      }

      const worldX = wrapCloudCoordinate(
        slot.baseX + this.driftX,
        MAP_METERS,
        CLOUD_DRIFT_MARGIN_METERS,
      );
      const worldZ = wrapCloudCoordinate(
        slot.baseZ + this.driftZ,
        MAP_METERS,
        CLOUD_DRIFT_MARGIN_METERS,
      );
      _position.set(worldX, slot.altitude, worldZ);
      _quaternion.setFromAxisAngle(Y_AXIS, slot.yaw);
      _scale.set(slot.width, 1, slot.depth);
      _matrix.compose(_position, _quaternion, _scale);
      mesh.setMatrixAt(localIndex, _matrix);
    }

    for (const mesh of this.meshes) mesh.instanceMatrix.needsUpdate = true;
  }
}
