/**
 * Renderer bootstrap + world scene. createRenderer() owns the
 * WebGPURenderer (auto-falls-back to WebGL2) and the frame loop; createWorldScene()
 * builds the lit THREE.Scene (hemisphere + sun + fog + sky) and exposes a
 * day/night driver. The color math itself lives in the pure, exported
 * timeOfDayColors() so it's testable without a GPU.
 */

import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { MAP_SIZE, TILE_METERS } from '../shared/constants';
import { StarField } from './stars';
import { SkyDome, SunBillboard } from './sky';

// ---------------------------------------------------------------------------
// Renderer bootstrap
// ---------------------------------------------------------------------------

export interface RendererHandle {
  renderer: WebGPURenderer;
  start(frame: (dtMs: number) => void): void;
  stop(): void;
  onResize(cb: (w: number, h: number) => void): void;
}

/**
 * Creates and initializes a WebGPURenderer (falls back to WebGL2 automatically),
 * sizes it to `container` via ResizeObserver, and wires up an animation loop.
 */
export async function createRenderer(container: HTMLElement): Promise<RendererHandle> {
  const renderer = new WebGPURenderer({ antialias: true });
  await renderer.init();
  renderer.shadowMap.enabled = true;
  // Filmic tone mapping so the night city's emissive windows/
  // lamps (HDR values > 1 at WINDOW_EMISSIVE_STRENGTH) roll off into a soft
  // glow instead of clamping to flat white sheets.
  // Neutral (Khronos PBR Neutral) tames highlights while preserving hue/
  // saturation of the daytime facades — unlike ACES, which would shift them.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;

  const resizeCallbacks: Array<(w: number, h: number) => void> = [];

  const applySize = (width: number, height: number): void => {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    for (const cb of resizeCallbacks) cb(width, height);
  };

  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';
  container.appendChild(renderer.domElement);

  const initialRect = container.getBoundingClientRect();
  applySize(
    Math.max(1, Math.round(initialRect.width)),
    Math.max(1, Math.round(initialRect.height)),
  );

  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      applySize(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
    }
  });
  resizeObserver.observe(container);

  let lastTime: number | null = null;

  return {
    renderer,
    start(frame: (dtMs: number) => void): void {
      void renderer.setAnimationLoop((time: number) => {
        const dtMs = lastTime === null ? 0 : time - lastTime;
        lastTime = time;
        frame(dtMs);
      });
    },
    stop(): void {
      void renderer.setAnimationLoop(null);
      lastTime = null;
    },
    onResize(cb: (w: number, h: number) => void): void {
      resizeCallbacks.push(cb);
    },
  };
}

// ---------------------------------------------------------------------------
// Day/night color math (pure) — a 4-keyframe ramp: day (warm
// sun, light-blue sky) -> golden hour (low warm sun, orange horizon) -> dusk
// (violet) -> night (deep navy, dim blue moonlight). Hemisphere and shadow
// intensity lerp on the same ramp.
// ---------------------------------------------------------------------------

export interface TimeOfDayColors {
  /** Unit-ish vector from the map center toward the sun. */
  sunDirection: { x: number; y: number; z: number };
  sunColor: [number, number, number];
  sunIntensity: number;
  hemiSkyColor: [number, number, number];
  hemiGroundColor: [number, number, number];
  hemiIntensity: number;
  fogColor: [number, number, number];
  backgroundColor: [number, number, number];
  /**
   * Sky dome: deep-blue zenith tone at this time of day. Always
   * blue-dominant (unlike backgroundColor, which warms toward orange/violet
   * at golden hour/dusk) — the zenith overhead stays blue even when the
   * horizon glows warm, matching a real sky's read.
   */
  skyZenithColor: [number, number, number];
  /**
   * Sky dome: paled horizon-haze tone at this time of day — a
   * whitened version of backgroundColor that collapses back to the exact
   * flat night color once nightFactor reaches 1 (no haze glow after dark).
   */
  skyHorizonColor: [number, number, number];
  /** Multiplier (0..1) on the sun's shadow darkness; lerps on the same ramp. */
  shadowIntensity: number;
  /**
   * 0 at full day, 1 at full night. The single shared "how dark is it right
   * now" value every other night-cycle system reads: stars.ts's opacity
   * ramp, buildings.ts's window dusk-sweep, lamps.ts's fade-in.
   */
  nightFactor: number;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const clampRange = (lo: number, hi: number, v: number): number => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const lerp3 = (
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): [number, number, number] => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

interface Keyframe {
  sunColor: readonly [number, number, number];
  sunIntensity: number;
  hemiSkyColor: readonly [number, number, number];
  hemiGroundColor: readonly [number, number, number];
  hemiIntensity: number;
  backgroundColor: readonly [number, number, number];
  shadowIntensity: number;
  nightFactor: number;
}

const NIGHT_KEYFRAME: Keyframe = {
  sunColor: [0.55, 0.65, 1.0], // dim blue moonlight directional
  sunIntensity: 0.12, // gentle moonlight so terrain forms read
  // Hemisphere floor (sole ambient term) kept just below dusk's 0.28 so night
  // stays darkest, but high enough that landscape silhouettes stay legible.
  hemiSkyColor: [0.08, 0.11, 0.24],
  hemiGroundColor: [0.06, 0.07, 0.11],
  hemiIntensity: 0.26,
  backgroundColor: [0x0a / 0xff, 0x12 / 0xff, 0x24 / 0xff], // deep navy #0a1224
  shadowIntensity: 0.2,
  nightFactor: 1,
};

const DUSK_KEYFRAME: Keyframe = {
  sunColor: [0.5, 0.35, 0.55], // cooling toward violet
  sunIntensity: 0.25,
  hemiSkyColor: [0.16, 0.14, 0.28],
  hemiGroundColor: [0.05, 0.04, 0.09],
  hemiIntensity: 0.28,
  backgroundColor: [0.14, 0.1, 0.22], // violet dusk sky
  shadowIntensity: 0.45,
  nightFactor: 0.65,
};

const GOLDEN_KEYFRAME: Keyframe = {
  sunColor: [1.0, 0.55, 0.2], // low, warm sun
  sunIntensity: 0.85,
  hemiSkyColor: [0.65, 0.45, 0.35],
  hemiGroundColor: [0.3, 0.22, 0.15],
  hemiIntensity: 0.55,
  backgroundColor: [0.85, 0.5, 0.32], // orange horizon
  shadowIntensity: 0.75,
  nightFactor: 0.2,
};

const DAY_KEYFRAME: Keyframe = {
  sunColor: [1.0, 0.98, 0.92],
  sunIntensity: 1.8,
  hemiSkyColor: [0.55, 0.72, 0.95],
  hemiGroundColor: [0.25, 0.2, 0.12],
  hemiIntensity: 0.9,
  backgroundColor: [0.55, 0.75, 0.95],
  shadowIntensity: 1,
  nightFactor: 0,
};

/**
 * Sorted ascending by sun `elevation` (-1 midnight .. +1 noon). `elevation`
 * is itself already symmetric about both noon and midnight (see
 * timeOfDayColors below), so this single ascending night -> dusk -> golden
 * -> day table naturally reproduces the day -> golden hour ->
 * dusk -> night sequence going into the evening, and its mirror image going
 * into the morning, without needing two separate tables.
 */
const KEYFRAMES: ReadonlyArray<readonly [number, Keyframe]> = [
  [-1, NIGHT_KEYFRAME],
  [-0.4, DUSK_KEYFRAME],
  [0.15, GOLDEN_KEYFRAME],
  [1, DAY_KEYFRAME],
];

function lerpKeyframe(a: Keyframe, b: Keyframe, t: number): Keyframe {
  return {
    sunColor: lerp3(a.sunColor, b.sunColor, t),
    sunIntensity: lerp(a.sunIntensity, b.sunIntensity, t),
    hemiSkyColor: lerp3(a.hemiSkyColor, b.hemiSkyColor, t),
    hemiGroundColor: lerp3(a.hemiGroundColor, b.hemiGroundColor, t),
    hemiIntensity: lerp(a.hemiIntensity, b.hemiIntensity, t),
    backgroundColor: lerp3(a.backgroundColor, b.backgroundColor, t),
    shadowIntensity: lerp(a.shadowIntensity, b.shadowIntensity, t),
    nightFactor: lerp(a.nightFactor, b.nightFactor, t),
  };
}

/** Piecewise-linear sample of the 4-keyframe ramp at a given sun elevation. */
function sampleKeyframes(elevation: number): Keyframe {
  const e = clampRange(-1, 1, elevation);
  const lastIndex = KEYFRAMES.length - 1;
  for (let i = 0; i < lastIndex; i++) {
    const [loE, loKf] = KEYFRAMES[i]!;
    const [hiE, hiKf] = KEYFRAMES[i + 1]!;
    if (e <= hiE || i === lastIndex - 1) {
      const span = hiE - loE;
      const t = span === 0 ? 0 : clamp01((e - loE) / span);
      return lerpKeyframe(loKf, hiKf, t);
    }
  }
  return KEYFRAMES[lastIndex]![1];
}

/**
 * Unit-ish vector from the map center toward the sun (or, below the horizon,
 * the moon) for t in [0,1) — the same `elevation`/direction math
 * timeOfDayColors uses internally, factored out so sky.ts's
 * SunBillboard and clouds.ts can place themselves without recomputing the
 * whole color ramp. Pure: no three.js, no globals.
 */
export function sunDirection(t: number): { x: number; y: number; z: number } {
  const angle = t * Math.PI * 2;
  const elevation = -Math.cos(angle);
  const rawX = Math.sin(angle);
  const rawZ = 0.15; // small fixed tilt: keeps the shadow azimuth well-defined at zenith/nadir
  const len = Math.hypot(rawX, elevation, rawZ) || 1;
  return { x: rawX / len, y: elevation / len, z: rawZ / len };
}

// Sky dome: zenith is a simple 2-point ramp driven directly by
// nightFactor (always blue, brightness follows day/night) — deliberately NOT
// derived from backgroundColor, since the zenith overhead stays blue even
// during a warm golden-hour/dusk horizon. Horizon is a paled (whitened)
// backgroundColor whose haze amount itself fades out as nightFactor rises,
// so the horizon collapses back to the exact flat night color after dark
// instead of staying implausibly bright.
const SKY_ZENITH_DAY: readonly [number, number, number] = [0.25, 0.45, 0.85];
const SKY_ZENITH_NIGHT: readonly [number, number, number] = [0.02, 0.04, 0.12];
const SKY_HORIZON_HAZE_BLEND_DAY = 0.45;
const SKY_HAZE_WHITE: readonly [number, number, number] = [1, 1, 1];

/**
 * Deterministic day/night color state for t in [0,1) (t=0.5 is noon, t=0/1
 * is midnight). Pure: no three.js, no globals. `elevation` (-1 at midnight,
 * 0 at dawn/dusk, +1 at noon) indexes the 4-keyframe ramp above.
 */
export function timeOfDayColors(t: number): TimeOfDayColors {
  const angle = t * Math.PI * 2;
  const elevation = -Math.cos(angle);
  const direction = sunDirection(t);

  const kf = sampleKeyframes(elevation);
  const backgroundColor: [number, number, number] = [...kf.backgroundColor];

  const skyZenithColor = lerp3(SKY_ZENITH_DAY, SKY_ZENITH_NIGHT, kf.nightFactor);
  const horizonHazeBlend = SKY_HORIZON_HAZE_BLEND_DAY * (1 - kf.nightFactor);
  const skyHorizonColor = lerp3(backgroundColor, SKY_HAZE_WHITE, horizonHazeBlend);

  return {
    sunDirection: direction,
    sunColor: [...kf.sunColor],
    sunIntensity: kf.sunIntensity,
    hemiSkyColor: [...kf.hemiSkyColor],
    hemiGroundColor: [...kf.hemiGroundColor],
    hemiIntensity: kf.hemiIntensity,
    fogColor: [...backgroundColor],
    backgroundColor,
    skyZenithColor,
    skyHorizonColor,
    shadowIntensity: kf.shadowIntensity,
    nightFactor: kf.nightFactor,
  };
}

// ---------------------------------------------------------------------------
// World scene
// ---------------------------------------------------------------------------

export interface WorldScene {
  scene: THREE.Scene;
  setTimeOfDay(t: number): void;
  /** Slews the (limited-span) sun shadow frustum to centre on a world XZ point — the camera target — so shadows stay resolved where the player is looking. */
  setShadowFocus(x: number, z: number): void;
}

/** Builds the lit THREE.Scene: hemisphere ambient, shadow-casting sun, fog, sky background. */
export function createWorldScene(): WorldScene {
  const scene = new THREE.Scene();
  const mapMeters = MAP_SIZE * TILE_METERS;
  const mapCenter = new THREE.Vector3(mapMeters / 2, 0, mapMeters / 2);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 0.6);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0006;

  // Shadow sweep: rather than stretch one map over the
  // whole 4096m map (~1.1 m/texel — far too coarse to resolve a lamp pole, a
  // pedestrian, or a slim tree trunk, so their shadows vanish), the frustum
  // covers only a focused region around the camera target (SHADOW_SPAN_METERS
  // each side) and follows it via setShadowFocus() every frame. At 4096² over
  // ±360m that is ~0.18 m/texel — dense enough to catch a ~0.25m tree trunk, so
  // a tree's shadow bridges from its trunk base to the canopy blob instead of
  // reading as a detached floating patch. Distant props fall outside the
  // frustum, which is fine for a top-down RTS.
  const SHADOW_SPAN_METERS = 360;
  const shadowCamera = sun.shadow.camera;
  shadowCamera.left = -SHADOW_SPAN_METERS;
  shadowCamera.right = SHADOW_SPAN_METERS;
  shadowCamera.top = SHADOW_SPAN_METERS;
  shadowCamera.bottom = -SHADOW_SPAN_METERS;
  shadowCamera.near = mapMeters * 0.2;
  shadowCamera.far = mapMeters * 3.2;
  shadowCamera.updateProjectionMatrix();

  // The point the shadow frustum + sun rig are centred on (world XZ). Defaults
  // to the map centre; setShadowFocus() slews it to the camera target so the
  // limited-span shadow map tracks whatever the player is looking at.
  const shadowFocus = mapCenter.clone();
  let sunDir = { x: 0, y: 1, z: 0 };

  sun.target.position.copy(mapCenter);
  scene.add(sun.target);
  scene.add(sun);

  const fog = new THREE.Fog(0x8fc7f0, mapMeters * 0.35, mapMeters * 1.4);
  scene.fog = fog;
  // sky.ts's gradient dome is the sole background visual —
  // no flat scene.background assignment here (single owner).

  const stars = new StarField(scene);
  const sky = new SkyDome(scene);
  const sunBillboard = new SunBillboard(scene);

  const sunDistance = mapMeters * 1.4;
  // Minimum elevation (as sin θ) the shadow-casting direction is lifted to when
  // the sun is low — ~27°, capping cast-shadow length at ~2× object height so
  // dawn/dusk tree shadows stay tight instead of raking across the ground.
  const MIN_SHADOW_SUN_ELEVATION_SIN = 0.45;

  // Re-places the sun light so it sits `sunDistance` up-sun of the current
  // shadow focus, with its target ON the focus. Called whenever either the
  // time-of-day (sunDir) or the focus point changes.
  //
  // The light direction is `sunDir` EXCEPT its elevation is floored at
  // MIN_SHADOW_SUN_ELEVATION_SIN: cast-shadow length ≈ objectHeight /
  // tan(elevation), so at a low dawn/dusk sun the tall tree canopies otherwise
  // rake into long streaks far from the trunk (thin lamp poles barely show it).
  // Flooring the elevation caps every cast shadow's length so foliage reads as
  // grounded, not smeared, while shadows still track the sun's azimuth and
  // shorten toward noon. Color/intensity/the visible sun billboard still use
  // the true `sunDir`, so the day/night look is unchanged; only the direction
  // the shadow map is projected from is lifted, and only while the sun is low.
  const placeSun = (): void => {
    let dx = sunDir.x;
    let dy = sunDir.y;
    let dz = sunDir.z;
    if (dy < MIN_SHADOW_SUN_ELEVATION_SIN) {
      const horizLen = Math.hypot(dx, dz) || 1e-6;
      const horizScale =
        Math.sqrt(Math.max(0, 1 - MIN_SHADOW_SUN_ELEVATION_SIN * MIN_SHADOW_SUN_ELEVATION_SIN)) /
        horizLen;
      dx *= horizScale;
      dz *= horizScale;
      dy = MIN_SHADOW_SUN_ELEVATION_SIN;
    }
    sun.position.set(
      shadowFocus.x + dx * sunDistance,
      shadowFocus.y + dy * sunDistance,
      shadowFocus.z + dz * sunDistance,
    );
    sun.target.position.copy(shadowFocus);
    sun.target.updateMatrixWorld();
  };

  /**
   * Shadow sweep: slew the limited-span shadow frustum so it
   * tracks the camera target, keeping the shadowed region wherever the player
   * is looking. Cheap — just repositions the existing sun/target, no allocation.
   */
  const setShadowFocus = (x: number, z: number): void => {
    if (x === shadowFocus.x && z === shadowFocus.z) return;
    shadowFocus.set(x, 0, z);
    placeSun();
  };

  const setTimeOfDay = (t: number): void => {
    const c = timeOfDayColors(t);

    sunDir = c.sunDirection;
    placeSun();
    sun.color.setRGB(c.sunColor[0], c.sunColor[1], c.sunColor[2]);
    sun.intensity = c.sunIntensity;
    sun.shadow.intensity = c.shadowIntensity;

    hemi.color.setRGB(c.hemiSkyColor[0], c.hemiSkyColor[1], c.hemiSkyColor[2]);
    hemi.groundColor.setRGB(c.hemiGroundColor[0], c.hemiGroundColor[1], c.hemiGroundColor[2]);
    hemi.intensity = c.hemiIntensity;

    fog.color.setRGB(c.fogColor[0], c.fogColor[1], c.fogColor[2]);

    stars.setNightFactor(c.nightFactor);
    sky.setTimeOfDay(t);
    sunBillboard.setTimeOfDay(t);
  };

  setTimeOfDay(0.5);

  return { scene, setTimeOfDay, setShadowFocus };
}
