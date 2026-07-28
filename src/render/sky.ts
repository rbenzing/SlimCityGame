/**
 * Sky dome, sun disc + glow, built on top of scene.ts's
 * existing time-of-day ramp. Two layers, both driven by the ramp's pure
 * color functions (never re-derived here):
 *
 *  - SkyDome: an inverted sphere whose vertex colors ramp from a deep-blue
 *    zenith to a pale horizon haze, using timeOfDayColors' skyZenithColor/
 *    skyHorizonColor fields (extended in scene.ts). No textures, no custom
 *    GLSL — vertex colors, same idiom as terrain.ts/trees.ts. Replaces the
 *    old flat scene.background (scene.ts's single owner now).
 *  - SunBillboard: a bright disc + soft additive glow sprite placed along
 *    sunDirection(t), warm and enlarged near the horizon, white at noon,
 *    swapped to a dim pale moon disc once the sun sits below the horizon
 *    (the same "moonlight" half already described by scene.ts's night
 *    keyframe). Both sprites billboard toward the camera automatically
 *    (THREE.Sprite) — no per-frame camera reference is ever needed.
 */
import * as THREE from 'three';
import { MAP_SIZE, TILE_METERS } from '../shared/constants';
import { sunDirection, timeOfDayColors } from './scene';

// ---------------------------------------------------------------------------
// SkyDome
// ---------------------------------------------------------------------------

/** Meters — comfortably beyond CAMERA_MAX_DISTANCE, inside STAR_FIELD_RADIUS (stars.ts): the atmosphere reads closer than the stars. */
export const SKY_DOME_RADIUS = 5000;
const SKY_DOME_WIDTH_SEGMENTS = 24;
const SKY_DOME_HEIGHT_SEGMENTS = 16;
/** Drawn first among opaque objects (very low renderOrder) so later geometry cleanly overdraws it; depthWrite stays off (see class doc). */
const SKY_DOME_RENDER_ORDER = -10;
/** Mild power curve so the horizon-to-zenith transition reads as a thinner band near the horizon, not a linear half-sky gradient. Endpoints (0 and 1) are unaffected by the exponent. */
const SKY_GRADIENT_EXPONENT = 0.45;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * Inverted-sphere gradient dome: deep blue at zenith falling
 * to pale horizon haze, colors from timeOfDayColors' skyZenithColor/
 * skyHorizonColor. Vertex-colored (no textures, no custom shader) so it
 * renders correctly under WebGPURenderer with zero extra material work.
 * Drawn behind everything: BackSide (viewed from inside), depthWrite off,
 * a very low renderOrder, and frustumCulled off (the dome is far larger
 * than any sane frustum-culling box — same reasoning as stars.ts).
 */
export class SkyDome {
  readonly mesh: THREE.Mesh;
  private readonly colorAttribute: THREE.BufferAttribute;

  constructor(scene: THREE.Scene, radius: number = SKY_DOME_RADIUS) {
    const geometry = new THREE.SphereGeometry(
      radius,
      SKY_DOME_WIDTH_SEGMENTS,
      SKY_DOME_HEIGHT_SEGMENTS,
    );
    const count = geometry.getAttribute('position').count;
    this.colorAttribute = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    geometry.setAttribute('color', this.colorAttribute);

    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
      toneMapped: false,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.renderOrder = SKY_DOME_RENDER_ORDER;
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    scene.add(this.mesh);

    this.setTimeOfDay(0.5);
  }

  /** Repaints every vertex from the current time-of-day's zenith/horizon colors. */
  setTimeOfDay(t: number): void {
    const c = timeOfDayColors(t);
    const zenith = c.skyZenithColor;
    const horizon = c.skyHorizonColor;

    const position = this.mesh.geometry.getAttribute('position');
    const count = position.count;
    for (let i = 0; i < count; i++) {
      const y = position.getY(i);
      const radius = Math.hypot(position.getX(i), y, position.getZ(i)) || 1;
      // 0 at/below the equator (horizon and everything below it), 1 at the
      // north pole (zenith) — the lower hemisphere is never visible from a
      // camera above the ground, so painting it uniformly horizon-colored is
      // a deliberate simplification, not an oversight.
      const up = clamp01(y / radius);
      const mix = Math.pow(up, SKY_GRADIENT_EXPONENT);
      this.colorAttribute.setXYZ(
        i,
        horizon[0] + (zenith[0] - horizon[0]) * mix,
        horizon[1] + (zenith[1] - horizon[1]) * mix,
        horizon[2] + (zenith[2] - horizon[2]) * mix,
      );
    }
    this.colorAttribute.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// Sun disc + glow (pure visual state, then the THREE.Sprite wiring)
// ---------------------------------------------------------------------------

export interface SunVisual {
  /** RGB tint for the disc/glow sprites. */
  color: [number, number, number];
  /** 0..1 overall opacity/brightness of the body (never exactly 0 — the moon stays dimly visible). */
  opacity: number;
  /** >=1 multiplier on the base sprite size; peaks at the horizon, minimal at zenith/nadir. */
  sizeMultiplier: number;
  /** True once the sun sits at/below the horizon — the moon disc replaces the sun disc for this half of the cycle. */
  isMoon: boolean;
}

/** Extra size fraction added at the exact horizon (elevation=0), fading out toward zenith/nadir. */
const SUN_HORIZON_ENLARGE = 1.3;
/** Opacity floor so the moon stays a "dim" but genuinely visible disc, never fully invisible. */
const MOON_MIN_OPACITY = 0.22;
/** How far the moon's tint blends toward white — "pale", not the ramp's more saturated moonlight blue. */
const MOON_PALE_BLEND = 0.5;

/**
 * Pure per-t visual state for the sun/moon billboard: warm
 * and enlarged near the horizon, white at noon, swapped to a dim pale moon
 * once the body sits at/below the horizon (elevation <= 0 — the same "night
 * half" scene.ts's ramp already treats as moonlight). Built entirely from
 * scene.ts's exposed sunDirection(t)/timeOfDayColors(t); no new state.
 */
export function sunVisual(t: number): SunVisual {
  const direction = sunDirection(t);
  const c = timeOfDayColors(t);
  const elevation = direction.y;
  const isMoon = elevation <= 0;

  const horizonCloseness = 1 - Math.min(1, Math.abs(elevation));
  const sizeMultiplier = 1 + horizonCloseness * SUN_HORIZON_ENLARGE;

  const brightness = 1 - c.nightFactor; // 1 at the day keyframe, 0 at the night keyframe
  const opacity = MOON_MIN_OPACITY + (1 - MOON_MIN_OPACITY) * brightness;

  const raw = c.sunColor;
  const color: [number, number, number] = isMoon
    ? [
        raw[0] + (1 - raw[0]) * MOON_PALE_BLEND,
        raw[1] + (1 - raw[1]) * MOON_PALE_BLEND,
        raw[2] + (1 - raw[2]) * MOON_PALE_BLEND,
      ]
    : [raw[0], raw[1], raw[2]];

  return { color, opacity, sizeMultiplier, isMoon };
}

// ---------------------------------------------------------------------------
// SunBillboard (THREE wiring)
// ---------------------------------------------------------------------------

/** Meters — independent of scene.ts's own light-positioning distance; only the *direction* needs to match the light for a believable read, not the exact distance. */
export const SUN_DISTANCE = 4500;
const SUN_DISC_BASE_SIZE = 260;
const SUN_GLOW_BASE_SIZE = 900;
const GLOW_OPACITY_FACTOR = 0.65;
const DISC_TEXTURE_SIZE = 128;
const GLOW_TEXTURE_SIZE = 128;

/**
 * Canvas-drawn bright disc texture (soft AA edge, hard-ish core). Falls back
 * to a blank (but still valid) canvas when a 2D context isn't available (e.g.
 * jsdom without the optional `canvas` npm package) — real browsers always
 * have one (same fallback idiom as pin.ts's MapPin).
 */
function drawDiscCanvas(): HTMLCanvasElement {
  const size = DISC_TEXTURE_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.42;
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.72, 'rgba(255,255,255,1)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

/** Canvas-drawn soft radial glow texture (full-bleed, gentle falloff), additively blended in the scene. */
function drawGlowCanvas(): HTMLCanvasElement {
  const size = GLOW_TEXTURE_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

function buildSpriteMaterial(canvas: HTMLCanvasElement): THREE.SpriteMaterial {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending,
  });
}

/**
 * Visible sun/moon billboard: a bright disc sprite + a
 * softer, larger additive glow sprite, both positioned along
 * sunDirection(t) from the map center — the same direction scene.ts's actual
 * DirectionalLight uses, so the visible body always matches the light/
 * shadows. THREE.Sprite auto-billboards toward the camera; no per-frame
 * camera reference is ever needed here.
 */
export class SunBillboard {
  private readonly disc: THREE.Sprite;
  private readonly glow: THREE.Sprite;
  private readonly discMaterial: THREE.SpriteMaterial;
  private readonly glowMaterial: THREE.SpriteMaterial;
  private readonly mapCenter: THREE.Vector3;
  private readonly distance: number;

  constructor(scene: THREE.Scene, distance: number = SUN_DISTANCE) {
    this.distance = distance;
    const mapMeters = MAP_SIZE * TILE_METERS;
    this.mapCenter = new THREE.Vector3(mapMeters / 2, 0, mapMeters / 2);

    this.glowMaterial = buildSpriteMaterial(drawGlowCanvas());
    this.glow = new THREE.Sprite(this.glowMaterial);

    this.discMaterial = buildSpriteMaterial(drawDiscCanvas());
    this.disc = new THREE.Sprite(this.discMaterial);

    scene.add(this.glow, this.disc);
    this.setTimeOfDay(0.5);
  }

  /** Repositions, resizes, retints and re-opacifies both sprites for time t. */
  setTimeOfDay(t: number): void {
    const direction = sunDirection(t);
    const visual = sunVisual(t);

    const x = this.mapCenter.x + direction.x * this.distance;
    const y = this.mapCenter.y + direction.y * this.distance;
    const z = this.mapCenter.z + direction.z * this.distance;
    this.disc.position.set(x, y, z);
    this.glow.position.set(x, y, z);

    const discSize = SUN_DISC_BASE_SIZE * visual.sizeMultiplier;
    const glowSize = SUN_GLOW_BASE_SIZE * visual.sizeMultiplier;
    this.disc.scale.set(discSize, discSize, 1);
    this.glow.scale.set(glowSize, glowSize, 1);

    this.discMaterial.color.setRGB(visual.color[0], visual.color[1], visual.color[2]);
    this.glowMaterial.color.setRGB(visual.color[0], visual.color[1], visual.color[2]);
    this.discMaterial.opacity = visual.opacity;
    this.glowMaterial.opacity = visual.opacity * GLOW_OPACITY_FACTOR;
  }
}
