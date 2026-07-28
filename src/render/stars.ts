/**
 * Static star point-cloud: a fixed dome of points high above
 * the map, deterministically placed (no Math.random — a local seeded PRNG,
 * same mulberry32 idiom already used by trees.ts) and faded in purely by a
 * nightFactor-driven opacity ramp. Stars are decorative background, not tied
 * to any game entity, so a single fixed seed constant is the right "id" to
 * hash from (still zero per-frame randomness).
 */
import * as THREE from 'three';

export const STAR_COUNT = 900;
/** Meters: comfortably outside the map/fog/camera range so stars read as "at infinity". */
export const STAR_FIELD_RADIUS = 6000;
/** Fixed seed: stars are decorative background, not tied to any game entity id. */
export const STAR_SEED = 918_273_645;

const STAR_POINT_SIZE = 22;

/** Deterministic PRNG (public-domain mulberry32); never Math.random. */
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
 * Deterministic star positions scattered over the upper hemisphere of a big
 * dome (pure, testable without three.js/a GPU). The same (count, seed,
 * radius) always yields the same Float32Array (count * 3 numbers, xyz per
 * star). Elevation is sampled uniformly in [0, PI/2] (not by naive
 * cos-weighting) so stars spread across the whole sky dome rather than
 * bunching at the zenith.
 */
export function starPositions(
  count: number,
  seed: number,
  radius = STAR_FIELD_RADIUS,
): Float32Array {
  const rng = mulberry32(seed);
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const azimuth = rng() * Math.PI * 2;
    const elevation = rng() * (Math.PI / 2); // 0 = horizon, PI/2 = zenith
    const cosEl = Math.cos(elevation);
    out[i * 3] = radius * cosEl * Math.cos(azimuth);
    out[i * 3 + 1] = radius * Math.sin(elevation);
    out[i * 3 + 2] = radius * cosEl * Math.sin(azimuth);
  }
  return out;
}

/** Static point-cloud star layer; visibility is driven entirely by setNightFactor's opacity ramp. */
export class StarField {
  readonly points: THREE.Points;
  private readonly material: THREE.PointsMaterial;

  constructor(
    scene: THREE.Scene,
    count: number = STAR_COUNT,
    seed: number = STAR_SEED,
    radius: number = STAR_FIELD_RADIUS,
  ) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(starPositions(count, seed, radius), 3),
    );

    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: STAR_POINT_SIZE,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });

    const points = new THREE.Points(geometry, material);
    points.renderOrder = -1; // sky dome: always draw behind everything else
    points.frustumCulled = false; // the dome is far larger than any sane frustum-culling box

    this.material = material;
    this.points = points;
    scene.add(points);
  }

  /** 0 (invisible, daytime) .. 1 (fully visible, night) — matches TimeOfDayColors.nightFactor. */
  setNightFactor(nightFactor: number): void {
    this.material.opacity = Math.min(1, Math.max(0, nightFactor));
  }
}
