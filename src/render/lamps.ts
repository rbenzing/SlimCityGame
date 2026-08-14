/**
 * Street lamps: deterministic placement every LAMP_SPACING_TILES tiles, alternating
 * sides, purely from tile coordinates (no rng) — a properly modeled
 * CANTILEVER streetlight:
 *   POLE (tapered mast, wider base, curbside) -> ARM (a curved/angled
 *   bracket — a short rising NECK off the pole top, then a longer REACH
 *   arcing back down over the road) -> HOUSING (a tapered box/cowl luminaire
 *   hanging from the arm end, over the road, pointing down) -> LENS (a warm
 *   sphere seated in the cowl mouth — the actual light source) -> POOL (a soft
 *   disc of light lying on the pavement below it).
 * There is no beam volume: housing and lens ramp their emissive well past the
 * bloom luminance threshold so the post pass smears them into a halo, and the
 * pool lights the road itself — bloom can only bleed around bright pixels, so
 * a halo at head height cannot brighten pavement that has none of its own.
 * All three fade on the lamp's own clock schedule (lampGlowFactor), not the
 * shared dusk ramp.
 * Every part (pole/arm/housing) is one merged, instanced geometry — one draw
 * call per part regardless of lamp count — and each casts a shadow (the sun
 * shadow map + `renderer.shadowMap.enabled` are already wired in scene.ts;
 * this file only needs `castShadow = true` on its own meshes).
 * Cheap instanced geometry, not per-pixel lighting.
 */
import * as THREE from 'three';
import { RoadTier, TilePoint } from '../shared/types';
import { LAMP_SPACING_TILES, tileToWorld } from '../shared/constants';
import { carriagewayHalfWidthMeters, curbWidthMeters, ROAD_Y_OFFSET } from './roadsmesh';
import { setInstanceCount } from './groundquad';

const POLE_HEIGHT = 5.5;
const POLE_RADIUS_TOP = 0.12;
const POLE_RADIUS_BOTTOM = 0.16;
const POLE_RADIAL_SEGMENTS = 8;
// Charcoal-grey painted metal. The old near-black (0x2a2e33) sat below the
// Lambert shading range in daylight, so a slim pole read as a flat black wire
// against grass/sky rather than a modeled post; a mid charcoal takes visible
// sun shading (lit vs. shaded faces) and still reads as a dark street lamp.
const POLE_COLOR = 0x50555d;

/**
 * The cantilever arm reaches from the pole top TOWARD the road centerline
 * (direction = opposite the pole's lateral-offset sign). A short reach — the
 * pole is already curbside — so the housing (and the pool it casts) land over
 * the near LANE of the road rather than the far side.
 */
const ARM_LENGTH_METERS = 2.8;
const ARM_THICKNESS = 0.1;
const ARM_Y_OFFSET = POLE_HEIGHT - 0.05; // pole-top mount height, just below the pole top

/**
 * The bracket bends in two straight runs — a cheap, deterministic stand-in
 * for a curved gooseneck: a short NECK that rises off the pole-top mount,
 * then a longer REACH that arcs back down to the housing attach point. Both
 * segments are merged into one static local geometry authored with the
 * mount at local origin, reaching only along local +X — writeLamp supplies
 * the yaw that turns +X to face the road for each (axis, side) combination.
 */
const ARM_NECK_FRACTION = 0.3;
const ARM_NECK_LENGTH = ARM_LENGTH_METERS * ARM_NECK_FRACTION;
const ARM_REACH_LENGTH = ARM_LENGTH_METERS - ARM_NECK_LENGTH;
const ARM_RISE = 0.32; // upward bend of the neck before the reach arcs back down

// How far below the arm mount the housing attach point hangs.
const HOUSING_DROP = 0.22;

const HOUSING_CAP_LENGTH = 0.36; // mounting cap, along the arm direction
const HOUSING_CAP_HEIGHT = 0.12;
const HOUSING_CAP_DEPTH = 0.3;
const HOUSING_COWL_TOP_RADIUS = 0.22; // wide where it meets the mounting cap
const HOUSING_COWL_BOTTOM_RADIUS = 0.06; // tapers down to a point — the cowl points down
const HOUSING_COWL_HEIGHT = 0.26;
const HOUSING_COWL_SEGMENTS = 4; // 4-sided taper reads as a "boxy" cowl, not a smooth cone
const HOUSING_TILT_RAD = THREE.MathUtils.degToRad(18); // angled downward, toward the road
const HOUSING_COLOR = 0xffd9a0;

/** Housing attach point: where the arm ends and the luminaire hangs. */
const HOUSING_ATTACH_Y_OFFSET = ARM_Y_OFFSET - HOUSING_DROP;

/**
 * Lens: the bulb itself, a small sphere seated in the cowl mouth. It is
 * deliberately wider than the cowl's bottom radius so it bulges past the rim
 * and stays visible from the game's angled camera — a compact, very bright
 * core is exactly what the bloom pass needs to bleed a believable halo over
 * the road.
 */
const LENS_COLOR = 0xfff1d0; // hotter and whiter than the fixture's warm body
const LENS_UNLIT_COLOR = 0x2b2620; // dark glass by day, so it still takes some sun shading
const LENS_RADIUS = 0.26;
const LENS_WIDTH_SEGMENTS = 8;
const LENS_HEIGHT_SEGMENTS = 6;
/** Distance from the housing attach point down its own (tilted) axis to the lens center. */
const LENS_DROP = HOUSING_CAP_HEIGHT + HOUSING_COWL_HEIGHT;

/**
 * Ground pool: the light the lamp actually throws on the road. Bloom only
 * bleeds around bright pixels, so a halo at head height can never light the
 * pavement however wide its radius — the road needs bright pixels of its own.
 * The pool supplies them, and being the largest bright area on the lamp it is
 * also its widest bloom source. Additive with no depth write, soft-edged by
 * vertex color rather than a texture, and terrain-conforming (every vertex
 * samples the ground) so it lies on a road running across a slope instead of
 * slicing through it.
 *
 * It is an ELLIPSE, not a circle: a real cantilever luminaire aims down the
 * roadway and throws a pool far longer along the road than across it. Stretched
 * that way the pools of successive lamps overlap into a continuously lit
 * corridor, which is what a lit street looks like — equal-radius circles read
 * as isolated puddles with dark road between them.
 */
const POOL_RADIUS = 4.5;
const POOL_ALONG_SCALE = 3; // down the roadway — ~27 m of road per lamp
const POOL_ACROSS_SCALE = 1; // across it — the carriageway plus a little verge
const POOL_SEGMENTS = 24;
const POOL_Y_OFFSET = ROAD_Y_OFFSET + 0.06; // clears the raised road surface
const POOL_MAX_OPACITY = 0.55;
/** Sodium-warm: road light is warmer and deeper than the fixture's own body. */
const POOL_COLOR = 0xffc27a;
/**
 * [radius fraction, brightness] rings from the core outward; the last must end
 * at 0. The curve decays steeply and never plateaus — a broad flat core reads
 * as a painted shape with an edge, while a hot point trailing off over most of
 * the radius reads as light falling on a surface.
 */
const POOL_RINGS: ReadonlyArray<readonly [number, number]> = [
  [0.12, 0.72],
  [0.3, 0.4],
  [0.55, 0.18],
  [0.78, 0.06],
  [1, 0],
];

/**
 * Night emissive strengths. The housing sits in the same range as lit building
 * windows (buildings.ts WINDOW_EMISSIVE_STRENGTH) so the fixture reads as lit;
 * the lens goes far hotter because it is a handful of pixels and needs to clear
 * the bloom threshold by a wide margin to smear into a halo.
 */
const HOUSING_EMISSIVE_STRENGTH = 3.2;
const LENS_EMISSIVE_STRENGTH = 14;

/**
 * Lamp schedule, in clock hours (hour = dayT × 24, matching ui/format.ts's
 * status-strip clock: sunrise 06:00, sunset 18:00). Lamps deliberately do NOT
 * follow nightFactor — that ramp only reaches 0 at noon, which left lamps
 * faintly lit all morning.
 */
const LAMP_ON_START_HOUR = 18; // sunset: lamps begin to come up
const LAMP_ON_FULL_HOUR = 19.5; // fully lit by the time dusk has settled
const LAMP_OFF_START_HOUR = 6; // sunrise: lamps begin to fade
export const LAMP_OFF_HOUR = 7; // dark by one hour past sunrise

/**
 * 0 (off) .. 1 (full) lamp glow for a visual-day fraction in [0,1). Pure: no
 * three.js, no globals. Off through the daylight hours, ramping up from sunset
 * and out over the hour after sunrise.
 */
export function lampGlowFactor(dayT: number): number {
  const hour = ((((dayT % 1) + 1) % 1) * 24) % 24;
  if (hour <= LAMP_OFF_START_HOUR || hour >= LAMP_ON_FULL_HOUR) return 1;
  if (hour < LAMP_OFF_HOUR)
    return 1 - (hour - LAMP_OFF_START_HOUR) / (LAMP_OFF_HOUR - LAMP_OFF_START_HOUR);
  if (hour < LAMP_ON_START_HOUR) return 0;
  return (hour - LAMP_ON_START_HOUR) / (LAMP_ON_FULL_HOUR - LAMP_ON_START_HOUR);
}

export type LampAxis = 'x' | 'z';

/** A road tile a lamp may sit on; `tier` is optional (undefined = eligible). */
export type LampRoadTile = TilePoint & { tier?: RoadTier };

/**
 * Whether a road tier gets street lamps. Unpaved gravel/dirt roads do not, and
 * neither does a rail line — a track is not a street, and nobody lights one.
 */
export function tierGetsLamp(tier: RoadTier | undefined): boolean {
  return tier !== RoadTier.Gravel && tier !== RoadTier.RailTrack;
}

export interface LampPlacement {
  x: number; // tile x
  z: number; // tile z
  /** World axis the lamp is offset along, away from the road centerline. */
  axis: LampAxis;
  /** Sign of the lateral offset along `axis`; alternates every LAMP_SPACING_TILES. */
  side: 1 | -1;
  /** Meters from the road centerline to the pole — the tier's carriageway edge + half a sidewalk (curbside). */
  lateralOffset: number;
}

/**
 * Curbside pole offset (m) for a tier: the middle of whatever curb the road
 * actually draws, just past the carriageway edge. On a motorway that is the
 * half-metre kerb rather than a footway it does not have, which is where a
 * motorway's columns stand anyway — and on a bridge it puts the column on the
 * deck's kerb instead of stranding it out in the middle of the span.
 */
function lampLateralOffset(tier: RoadTier | undefined): number {
  const t = tier ?? RoadTier.TwoLane;
  return carriagewayHalfWidthMeters(t) + curbWidthMeters(t) * 0.5;
}

/** Wide fixed stride so (x,z) pairs never collide without needing MAP_SIZE here. */
function tileKey(x: number, z: number): number {
  return x * 100_000 + z;
}

/**
 * Deterministic lamp placement: a lamp sits on every tile
 * whose (x+z) is a multiple of LAMP_SPACING_TILES. That sum advances by
 * exactly 1 along any straight run of tiles — horizontal, vertical, or
 * diagonal — so this single orientation-agnostic rule reproduces "every Nth
 * tile" spacing regardless of which way a road happens to run. Consecutive
 * selected tiles alternate sides. Pure function of the input list: no rng,
 * no dependency on tile ordering.
 */
export function computeLampPlacements(roadTiles: readonly LampRoadTile[]): LampPlacement[] {
  const tileSet = new Set<number>();
  for (const tile of roadTiles) tileSet.add(tileKey(tile.x, tile.z));

  const placements: LampPlacement[] = [];
  for (const tile of roadTiles) {
    // Gravel/dirt tiles carry no lamp but stay in tileSet for neighbor orientation.
    if (!tierGetsLamp(tile.tier)) continue;

    const sum = tile.x + tile.z;
    const mod = ((sum % LAMP_SPACING_TILES) + LAMP_SPACING_TILES) % LAMP_SPACING_TILES;
    if (mod !== 0) continue;

    const n = tileSet.has(tileKey(tile.x, tile.z - 1));
    const e = tileSet.has(tileKey(tile.x + 1, tile.z));
    const s = tileSet.has(tileKey(tile.x, tile.z + 1));
    const w = tileSet.has(tileKey(tile.x - 1, tile.z));
    const hasEW = e || w;
    const hasNS = n || s;
    // Any tile with road running through it on BOTH axes — a turn, a T, a
    // crossroads — has no curb to stand a pole on: the lateral offset that
    // clears one carriageway lands inside the other one. Such tiles carry no
    // lamp, and their straight neighbours light the junction from the approach.
    if (hasNS && hasEW) continue;
    // An east-west road (neighbors differ in x) gets lamps offset along z, and
    // vice versa. An isolated tile has no run axis at all and falls back to z.
    const axis: LampAxis = hasNS ? 'x' : 'z';

    const group = sum / LAMP_SPACING_TILES;
    const side: 1 | -1 = group % 2 === 0 ? 1 : -1;
    placements.push({
      x: tile.x,
      z: tile.z,
      axis,
      side,
      lateralOffset: lampLateralOffset(tile.tier),
    });
  }
  return placements;
}

/** Concatenates N indexed BufferGeometries (position+normal+index) into one, disposing the sources — same idiom as landmarks.ts's part-merge helper. */
function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = new THREE.BufferGeometry();

  let vertexTotal = 0;
  for (const g of geometries)
    vertexTotal += (g.getAttribute('position') as THREE.BufferAttribute).count;

  const positions = new Float32Array(vertexTotal * 3);
  const normals = new Float32Array(vertexTotal * 3);
  const indices: number[] = [];

  let vertexOffset = 0;
  let floatOffset = 0;
  for (const g of geometries) {
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const norm = g.getAttribute('normal') as THREE.BufferAttribute;
    positions.set(pos.array as Float32Array, floatOffset);
    normals.set(norm.array as Float32Array, floatOffset);
    floatOffset += pos.array.length;

    const index = g.index;
    if (index) {
      for (let i = 0; i < index.count; i++) indices.push(index.getX(i) + vertexOffset);
    }
    vertexOffset += pos.count;
    g.dispose();
  }

  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setIndex(indices);
  return merged;
}

/**
 * Curved/angled cantilever bracket: a short NECK rising from the pole-top
 * mount (local origin), then a longer REACH sloping back down to the
 * housing attach point at (ARM_LENGTH_METERS, -HOUSING_DROP, 0) — the same
 * local end-point the housing mesh's own attach point (local origin) will
 * be instanced at. Two straight box segments, angled and merged into one
 * static geometry; only ever reaches along local +X.
 */
function buildArmGeometry(): THREE.BufferGeometry {
  const neckDx = ARM_NECK_LENGTH;
  const neckDy = ARM_RISE;
  const neckLength = Math.hypot(neckDx, neckDy);
  const neckAngle = Math.atan2(neckDy, neckDx);
  const neck = new THREE.BoxGeometry(neckLength, ARM_THICKNESS, ARM_THICKNESS);
  neck.rotateZ(neckAngle);
  neck.translate(neckDx / 2, neckDy / 2, 0);

  const reachDx = ARM_REACH_LENGTH;
  const reachDy = -HOUSING_DROP - ARM_RISE;
  const reachLength = Math.hypot(reachDx, reachDy);
  const reachAngle = Math.atan2(reachDy, reachDx);
  const reach = new THREE.BoxGeometry(reachLength, ARM_THICKNESS, ARM_THICKNESS);
  reach.rotateZ(reachAngle);
  reach.translate(neckDx + reachDx / 2, neckDy + reachDy / 2, 0);

  return mergeGeometries([neck, reach]);
}

/**
 * Tapered cowl housing: a small mounting cap (flush with the arm's attach
 * point, local origin) with a 4-sided tapered cowl hanging below it,
 * narrowing toward the bottom — reads as "a real lamp housing", not a bare
 * box, and unambiguously points down.
 */
function buildHousingGeometry(): THREE.BufferGeometry {
  const cap = new THREE.BoxGeometry(HOUSING_CAP_LENGTH, HOUSING_CAP_HEIGHT, HOUSING_CAP_DEPTH);
  cap.translate(0, -HOUSING_CAP_HEIGHT / 2, 0);

  const cowl = new THREE.CylinderGeometry(
    HOUSING_COWL_TOP_RADIUS,
    HOUSING_COWL_BOTTOM_RADIUS,
    HOUSING_COWL_HEIGHT,
    HOUSING_COWL_SEGMENTS,
    1,
  );
  cowl.rotateY(Math.PI / 4); // square the 4-sided taper's faces up with the cap's box faces
  cowl.translate(0, -HOUSING_CAP_HEIGHT - HOUSING_COWL_HEIGHT / 2, 0);

  return mergeGeometries([cap, cowl]);
}

/** World XZ of the pole for a placement — curbside, offset along the placement's axis. */
function poleWorldXZ(placement: LampPlacement): { x: number; z: number } {
  const tileCenterX = tileToWorld(placement.x);
  const tileCenterZ = tileToWorld(placement.z);
  const offset = placement.lateralOffset * placement.side;
  return {
    x: placement.axis === 'x' ? tileCenterX + offset : tileCenterX,
    z: placement.axis === 'z' ? tileCenterZ + offset : tileCenterZ,
  };
}

/**
 * World XZ of the luminaire — the arm end, out over the near lane. The arm
 * reaches back toward the road centerline, i.e. opposite the pole's own
 * lateral offset.
 */
function housingWorldXZ(placement: LampPlacement): { x: number; z: number } {
  const pole = poleWorldXZ(placement);
  const armOffset = ARM_LENGTH_METERS * -placement.side;
  return {
    x: placement.axis === 'x' ? pole.x + armOffset : pole.x,
    z: placement.axis === 'z' ? pole.z + armOffset : pole.z,
  };
}

/** Vertices in one pool disc: the core, plus a ring of segments per falloff step. */
export const POOL_VERTICES_PER_LAMP = 1 + POOL_RINGS.length * POOL_SEGMENTS;

/**
 * One merged terrain-conforming disc per lamp, brightness carried by
 * per-vertex color: a hot core that decays fast and trails off to nothing at
 * the rim. A single center-to-rim gradient reads as a painted coin, so the
 * falloff is shaped by concentric rings; the zero-brightness rim also means
 * ground the disc can't quite match never shows a hard edge. Sampling
 * `heightAt` per vertex is what keeps the pool ON the road across a slope —
 * one flat disc at a single Y slices straight through it.
 */
function buildPoolGeometry(
  placements: readonly LampPlacement[],
  heightAt: (x: number, z: number) => number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  placements.forEach((placement, lamp) => {
    const { x: centerX, z: centerZ } = housingWorldXZ(placement);
    const base = lamp * POOL_VERTICES_PER_LAMP;
    // `axis` is the LATERAL axis the pole is offset along, so the roadway runs
    // along the other one — that is the direction the pool stretches down.
    // The two bases below are a 90° ROTATION of each other, not a coordinate
    // swap: swapping mirrors the plane, which reverses triangle winding and
    // gets one road direction's pools back-face culled into invisibility.
    const [alongX, alongZ, acrossX, acrossZ] =
      placement.axis === 'x' ? [0, 1, -1, 0] : [1, 0, 0, 1];

    positions.push(centerX, heightAt(centerX, centerZ) + POOL_Y_OFFSET, centerZ);
    colors.push(1, 1, 1);

    for (let ring = 0; ring < POOL_RINGS.length; ring++) {
      const [radiusFraction, intensity] = POOL_RINGS[ring]!;
      const radius = POOL_RADIUS * radiusFraction;
      const firstVertex = base + 1 + ring * POOL_SEGMENTS;
      const innerFirst = firstVertex - POOL_SEGMENTS;
      for (let s = 0; s < POOL_SEGMENTS; s++) {
        const angle = (s / POOL_SEGMENTS) * Math.PI * 2;
        const along = Math.cos(angle) * radius * POOL_ALONG_SCALE;
        const across = Math.sin(angle) * radius * POOL_ACROSS_SCALE;
        const vx = centerX + alongX * along + acrossX * across;
        const vz = centerZ + alongZ * along + acrossZ * across;
        positions.push(vx, heightAt(vx, vz) + POOL_Y_OFFSET, vz);
        colors.push(intensity, intensity, intensity);

        const here = firstVertex + s;
        const next = firstVertex + ((s + 1) % POOL_SEGMENTS);
        if (ring === 0) {
          indices.push(base, next, here); // fan off the core vertex
        } else {
          const innerHere = innerFirst + s;
          const innerNext = innerFirst + ((s + 1) % POOL_SEGMENTS);
          indices.push(innerHere, innerNext, here, innerNext, next, here);
        }
      }
    }
  });

  const pool = new THREE.BufferGeometry();
  pool.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  pool.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  pool.setIndex(indices);
  return pool;
}

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _lensOffset = new THREE.Vector3();
const _identityQuat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _upAxis = new THREE.Vector3(0, 1, 0);

// The arm bracket geometry only reaches along local +X (mount at origin), so
// each (axis, direction-sign) combination needs its own yaw to actually face
// the road: axis 'x' just flips +X/-X; axis 'z' turns +X into +Z or -Z.
const _armYawXPos = new THREE.Quaternion(); // armDirSign +1: local +X -> world +X
const _armYawXNeg = new THREE.Quaternion().setFromAxisAngle(_upAxis, Math.PI); // armDirSign -1: -> world -X
const _armYawZPos = new THREE.Quaternion().setFromAxisAngle(_upAxis, -Math.PI / 2); // armDirSign +1: -> world +Z
const _armYawZNeg = new THREE.Quaternion().setFromAxisAngle(_upAxis, Math.PI / 2); // armDirSign -1: -> world -Z

// Downward pitch (about the housing's own local "across" axis, local Z)
// applied before yaw, so the cowl reads as angled toward the road regardless
// of which offset axis the lamp uses. The cowl is 4-fold symmetric about its
// own vertical axis, so — unlike the arm — direction *sign* doesn't need
// separate handling here, only the offset axis does.
const _housingPitch = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(0, 0, 1),
  HOUSING_TILT_RAD,
);
const _yawToZ = new THREE.Quaternion().setFromAxisAngle(_upAxis, Math.PI / 2);
const _housingQuatAxisX = _housingPitch.clone();
const _housingQuatAxisZ = _yawToZ.clone().multiply(_housingPitch);

export class LampRenderer {
  private readonly scene: THREE.Scene;
  private readonly heightAt: (x: number, z: number) => number;

  private readonly poleGeometry = new THREE.CylinderGeometry(
    POLE_RADIUS_TOP,
    POLE_RADIUS_BOTTOM,
    POLE_HEIGHT,
    POLE_RADIAL_SEGMENTS,
  );
  private readonly poleMaterial = new THREE.MeshLambertMaterial({ color: POLE_COLOR });

  /** Curved/angled cantilever bracket (neck + reach), mount at local origin. */
  private readonly armGeometry = buildArmGeometry();

  /** Tapered box/cowl housing, attach point at local origin. */
  private readonly housingGeometry = buildHousingGeometry();
  private readonly housingMaterial = new THREE.MeshLambertMaterial({
    color: HOUSING_COLOR,
    emissive: HOUSING_COLOR,
    emissiveIntensity: 0,
  });

  /**
   * The bulb: a near-black body so by day it reads as a dark lens in the cowl
   * and by night contributes nothing but its own emissive glow.
   */
  private readonly lensGeometry = new THREE.SphereGeometry(
    LENS_RADIUS,
    LENS_WIDTH_SEGMENTS,
    LENS_HEIGHT_SEGMENTS,
  );
  private readonly lensMaterial = new THREE.MeshLambertMaterial({
    color: LENS_UNLIT_COLOR,
    emissive: LENS_COLOR,
    emissiveIntensity: 0,
  });

  private readonly poolMaterial = new THREE.MeshBasicMaterial({
    color: POOL_COLOR,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  private poleMesh: THREE.InstancedMesh | null = null;
  private armMesh: THREE.InstancedMesh | null = null;
  private housingMesh: THREE.InstancedMesh | null = null;
  private lensMesh: THREE.InstancedMesh | null = null;
  /** Not instanced: each disc carries its own terrain-sampled vertex heights. */
  private poolMesh: THREE.Mesh | null = null;
  private placements: LampPlacement[] = [];

  constructor(scene: THREE.Scene, heightAt: (x: number, z: number) => number) {
    this.scene = scene;
    this.heightAt = heightAt;
  }

  /** Full rebuild from the current road tile set (roads change relatively rarely). */
  rebuild(roadTiles: readonly LampRoadTile[]): void {
    this.disposeMeshes();
    this.placements = computeLampPlacements(roadTiles);

    const count = this.placements.length;
    if (count === 0) return;

    this.poleMesh = new THREE.InstancedMesh(this.poleGeometry, this.poleMaterial, count);
    this.armMesh = new THREE.InstancedMesh(this.armGeometry, this.poleMaterial, count);
    this.housingMesh = new THREE.InstancedMesh(this.housingGeometry, this.housingMaterial, count);
    this.lensMesh = new THREE.InstancedMesh(this.lensGeometry, this.lensMaterial, count);
    this.poolMesh = new THREE.Mesh(
      buildPoolGeometry(this.placements, this.heightAt),
      this.poolMaterial,
    );
    setInstanceCount(this.poleMesh, count);
    setInstanceCount(this.armMesh, count);
    setInstanceCount(this.housingMesh, count);
    setInstanceCount(this.lensMesh, count);

    // Pole/arm/housing are real modeled geometry — they cast shadows. The lens
    // is a light source, so it stays non-shadow-casting.
    this.poleMesh.castShadow = true;
    this.armMesh.castShadow = true;
    this.housingMesh.castShadow = true;

    for (let i = 0; i < count; i++) this.writeLamp(i, this.placements[i]!);

    this.poleMesh.instanceMatrix.needsUpdate = true;
    this.armMesh.instanceMatrix.needsUpdate = true;
    this.housingMesh.instanceMatrix.needsUpdate = true;
    this.lensMesh.instanceMatrix.needsUpdate = true;

    this.scene.add(this.poleMesh, this.armMesh, this.housingMesh, this.lensMesh, this.poolMesh);
  }

  /**
   * Drives the fixture, lens and ground pool from the visual-day fraction:
   * lamps light at dusk, burn overnight, and go dark an hour past sunrise.
   */
  setTimeOfDay(dayT: number): void {
    const f = lampGlowFactor(dayT);
    this.housingMaterial.emissiveIntensity = f * HOUSING_EMISSIVE_STRENGTH;
    this.lensMaterial.emissiveIntensity = f * LENS_EMISSIVE_STRENGTH;
    this.poolMaterial.opacity = f * POOL_MAX_OPACITY;
  }

  /** Number of lamps placed by the last rebuild(); every layer matches this 1:1. */
  lampCount(): number {
    return this.placements.length;
  }

  poleInstanceCount(): number {
    return this.poleMesh?.count ?? 0;
  }

  armInstanceCount(): number {
    return this.armMesh?.count ?? 0;
  }

  housingInstanceCount(): number {
    return this.housingMesh?.count ?? 0;
  }

  lensInstanceCount(): number {
    return this.lensMesh?.count ?? 0;
  }

  housingEmissiveIntensity(): number {
    return this.housingMaterial.emissiveIntensity;
  }

  lensEmissiveIntensity(): number {
    return this.lensMaterial.emissiveIntensity;
  }

  /** Vertices in the merged pool mesh — POOL_VERTICES_PER_LAMP per lamp. */
  poolVertexCount(): number {
    const position = this.poolMesh?.geometry.getAttribute('position');
    return position ? position.count : 0;
  }

  poolOpacity(): number {
    return this.poolMaterial.opacity;
  }

  /**
   * Sign of the Y component of triangle `tri`'s geometric normal: +1 when it
   * faces up (and so survives back-face culling from a camera above), -1 when
   * it is wound the other way. Test introspection — a pool wound backwards is
   * simply invisible in the running game, which no vertex-count check catches.
   */
  poolTriangleFacing(tri = 0): number {
    const geometry = this.poolMesh?.geometry;
    const index = geometry?.getIndex();
    const position = geometry?.getAttribute('position');
    if (!index || !position) return 0;

    const at = (i: number): THREE.Vector3 => {
      const v = index.getX(tri * 3 + i);
      return new THREE.Vector3(position.getX(v), position.getY(v), position.getZ(v));
    };
    const a = at(0);
    const normal = new THREE.Vector3()
      .subVectors(at(1), a)
      .cross(new THREE.Vector3().subVectors(at(2), a));
    return Math.sign(normal.y);
  }

  /** World coordinate of pool vertex `vertex` — test introspection for shape and conformance. */
  poolVertexX(vertex: number): number {
    const position = this.poolMesh?.geometry.getAttribute('position');
    return position ? position.getX(vertex) : NaN;
  }

  poolVertexY(vertex: number): number {
    const position = this.poolMesh?.geometry.getAttribute('position');
    return position ? position.getY(vertex) : NaN;
  }

  poolVertexZ(vertex: number): number {
    const position = this.poolMesh?.geometry.getAttribute('position');
    return position ? position.getZ(vertex) : NaN;
  }

  poleCastShadow(): boolean {
    return this.poleMesh?.castShadow ?? false;
  }

  armCastShadow(): boolean {
    return this.armMesh?.castShadow ?? false;
  }

  housingCastShadow(): boolean {
    return this.housingMesh?.castShadow ?? false;
  }

  polePosition(slot = 0): THREE.Vector3 {
    return this.positionOf(this.poleMesh, slot);
  }

  armPosition(slot = 0): THREE.Vector3 {
    return this.positionOf(this.armMesh, slot);
  }

  housingPosition(slot = 0): THREE.Vector3 {
    return this.positionOf(this.housingMesh, slot);
  }

  lensPosition(slot = 0): THREE.Vector3 {
    return this.positionOf(this.lensMesh, slot);
  }

  /** World XZ+Y of the core vertex of lamp `slot`'s pool disc. */
  poolCenter(slot = 0): THREE.Vector3 {
    const position = this.poolMesh?.geometry.getAttribute('position');
    if (!position) return new THREE.Vector3(NaN, NaN, NaN);
    const vertex = slot * POOL_VERTICES_PER_LAMP;
    return new THREE.Vector3(position.getX(vertex), position.getY(vertex), position.getZ(vertex));
  }

  /** World-space rotation of the arm instance at `slot` (test introspection for the direction-dependent yaw). */
  armQuaternion(slot = 0): THREE.Quaternion {
    const quat = new THREE.Quaternion();
    if (!this.armMesh) return quat;
    const matrix = new THREE.Matrix4();
    this.armMesh.getMatrixAt(slot, matrix);
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    matrix.decompose(position, quat, scale);
    return quat;
  }

  private positionOf(mesh: THREE.InstancedMesh | null, slot: number): THREE.Vector3 {
    if (!mesh) return new THREE.Vector3(NaN, NaN, NaN);
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(slot, matrix);
    return new THREE.Vector3().setFromMatrixPosition(matrix);
  }

  private writeLamp(slot: number, placement: LampPlacement): void {
    const tileCenterX = tileToWorld(placement.x);
    const tileCenterZ = tileToWorld(placement.z);

    // Pole: curbside placement from axis/side, at the tier-aware sidewalk offset.
    const poleOffset = placement.lateralOffset * placement.side;
    const poleX = placement.axis === 'x' ? tileCenterX + poleOffset : tileCenterX;
    const poleZ = placement.axis === 'z' ? tileCenterZ + poleOffset : tileCenterZ;
    const groundY = this.heightAt(poleX, poleZ);

    // The arm/housing reach from the pole top toward the road centerline,
    // i.e. in the direction opposite the pole's lateral-offset sign.
    const armDirSign = -placement.side;
    const armOffset = ARM_LENGTH_METERS * armDirSign;
    const housingX = placement.axis === 'x' ? poleX + armOffset : poleX;
    const housingZ = placement.axis === 'z' ? poleZ + armOffset : poleZ;

    const armYaw =
      placement.axis === 'x'
        ? armDirSign === 1
          ? _armYawXPos
          : _armYawXNeg
        : armDirSign === 1
          ? _armYawZPos
          : _armYawZNeg;
    const housingQuat = placement.axis === 'z' ? _housingQuatAxisZ : _housingQuatAxisX;

    _position.set(poleX, groundY + POLE_HEIGHT / 2, poleZ);
    _matrix.compose(_position, _identityQuat, _scale);
    this.poleMesh!.setMatrixAt(slot, _matrix);

    // Arm mounts at the pole-top attach point; the bracket geometry itself
    // encodes the rise-then-reach bend, so only the mount position + the
    // direction-dependent yaw vary per instance.
    _position.set(poleX, groundY + ARM_Y_OFFSET, poleZ);
    _matrix.compose(_position, armYaw, _scale);
    this.armMesh!.setMatrixAt(slot, _matrix);

    // Housing hangs at the arm end, over the road (near lane), angled down.
    const housingY = groundY + HOUSING_ATTACH_Y_OFFSET;
    _position.set(housingX, housingY, housingZ);
    _matrix.compose(_position, housingQuat, _scale);
    this.housingMesh!.setMatrixAt(slot, _matrix);

    // Lens sits in the cowl mouth: straight down the HOUSING's own axis, not
    // the world's, so the housing's downward tilt carries the bulb with it.
    _lensOffset.set(0, -LENS_DROP, 0).applyQuaternion(housingQuat);
    _position.set(housingX + _lensOffset.x, housingY + _lensOffset.y, housingZ + _lensOffset.z);
    _matrix.compose(_position, _identityQuat, _scale);
    this.lensMesh!.setMatrixAt(slot, _matrix);
  }

  private disposeMeshes(): void {
    if (this.poleMesh) this.scene.remove(this.poleMesh);
    if (this.armMesh) this.scene.remove(this.armMesh);
    if (this.housingMesh) this.scene.remove(this.housingMesh);
    if (this.lensMesh) this.scene.remove(this.lensMesh);
    if (this.poolMesh) {
      this.scene.remove(this.poolMesh);
      // Unlike every other layer's geometry, this one is rebuilt per road
      // change (it bakes terrain heights), so it owns nothing shared.
      this.poolMesh.geometry.dispose();
    }
    this.poleMesh = null;
    this.armMesh = null;
    this.housingMesh = null;
    this.lensMesh = null;
    this.poolMesh = null;
  }
}
