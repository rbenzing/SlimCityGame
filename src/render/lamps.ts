/**
 * Street lamps: deterministic placement every LAMP_SPACING_TILES tiles, alternating
 * sides, purely from tile coordinates (no rng) — a properly modeled
 * CANTILEVER streetlight:
 *   POLE (tapered mast, wider base, curbside) -> ARM (a curved/angled
 *   bracket — a short rising NECK off the pole top, then a longer REACH
 *   arcing back down over the road) -> HOUSING (a tapered box/cowl luminaire
 *   hanging from the arm end, over the road, pointing down) -> CONE (a warm
 *   translucent beam, apex at the housing, widening down to just above the
 *   road surface — open-ended, no ground disc).
 * All layers fade in together on the shared nightFactor dusk ramp. Every
 * part (pole/arm/housing) is one merged, instanced geometry — one draw call
 * per part regardless of lamp count — and each casts a shadow (the sun
 * shadow map + `renderer.shadowMap.enabled` are already wired in scene.ts;
 * this file only needs `castShadow = true` on its own meshes).
 * Cheap instanced geometry, not per-pixel lighting.
 */
import * as THREE from 'three';
import { RoadTier, TilePoint } from '../shared/types';
import { LAMP_SPACING_TILES, tileToWorld } from '../shared/constants';
import { carriagewayHalfWidthMeters, SIDEWALK_WIDTH_M } from './roadsmesh';

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
 * pole is already curbside — so the housing (and its light cone) land over the
 * near LANE of the road rather than the far side.
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

// How far below the arm mount the housing attach point hangs. The cone apex is
// derived from this.
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

/**
 * Light cone: apex at the housing attach point (over the road, at the arm
 * end), base just ABOVE the road surface so the additive translucent beam
 * pools on the pavement. There is no ground disc — the base sits above
 * ROAD_Y_OFFSET (0.15) so nothing clips through/under the raised road — and
 * the cone is `openEnded` (no bottom cap), so only the translucent wall shows.
 */
const CONE_BASE_Y_OFFSET = 0.16; // a hair above the road surface (ROAD_Y_OFFSET 0.15)
const CONE_APEX_Y_OFFSET = ARM_Y_OFFSET - HOUSING_DROP; // matches the housing attach point
const CONE_HEIGHT = CONE_APEX_Y_OFFSET - CONE_BASE_Y_OFFSET;
const CONE_BASE_RADIUS = 2.6;
const CONE_RADIAL_SEGMENTS = 12;
const CONE_MAX_OPACITY = 0.4;

export type LampAxis = 'x' | 'z';

/** A road tile a lamp may sit on; `tier` is optional (undefined = eligible). */
export type LampRoadTile = TilePoint & { tier?: RoadTier };

/** Whether a road tier gets street lamps. Unpaved gravel/dirt roads do not. */
export function tierGetsLamp(tier: RoadTier | undefined): boolean {
  return tier !== RoadTier.Gravel;
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

/** Curbside pole offset (m) for a tier: on the sidewalk just past the carriageway edge. */
function lampLateralOffset(tier: RoadTier | undefined): number {
  return carriagewayHalfWidthMeters(tier ?? RoadTier.TwoLane) + SIDEWALK_WIDTH_M * 0.5;
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
    // A TURN tile (exactly two perpendicular neighbors) sweeps its curved
    // carriageway across the tile — the straight-axis lateral rule would
    // plant the pole in the middle of the road, so turn tiles carry no lamp
    // (their straight neighbors light the corner).
    const neighborCount = (n ? 1 : 0) + (e ? 1 : 0) + (s ? 1 : 0) + (w ? 1 : 0);
    if (neighborCount === 2 && hasNS && hasEW) continue;
    // An east-west road (neighbors differ in x) gets lamps offset along z,
    // and vice versa. An isolated tile or a 4-way intersection (both
    // directions present) falls back to a z offset.
    const axis: LampAxis = hasNS && !hasEW ? 'x' : 'z';

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

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
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

  private readonly coneGeometry = new THREE.ConeGeometry(
    CONE_BASE_RADIUS,
    CONE_HEIGHT,
    CONE_RADIAL_SEGMENTS,
    1,
    true, // openEnded: no bottom cap — just the translucent beam wall
  );
  private readonly coneMaterial = new THREE.MeshBasicMaterial({
    color: HOUSING_COLOR,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  private poleMesh: THREE.InstancedMesh | null = null;
  private armMesh: THREE.InstancedMesh | null = null;
  private housingMesh: THREE.InstancedMesh | null = null;
  private coneMesh: THREE.InstancedMesh | null = null;
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
    this.coneMesh = new THREE.InstancedMesh(this.coneGeometry, this.coneMaterial, count);
    this.poleMesh.count = count;
    this.armMesh.count = count;
    this.housingMesh.count = count;
    this.coneMesh.count = count;

    // Pole/arm/housing are real modeled geometry, not additive FX — they
    // cast shadows. The cone stays non-shadow-casting.
    this.poleMesh.castShadow = true;
    this.armMesh.castShadow = true;
    this.housingMesh.castShadow = true;

    for (let i = 0; i < count; i++) this.writeLamp(i, this.placements[i]!);

    this.poleMesh.instanceMatrix.needsUpdate = true;
    this.armMesh.instanceMatrix.needsUpdate = true;
    this.housingMesh.instanceMatrix.needsUpdate = true;
    this.coneMesh.instanceMatrix.needsUpdate = true;

    this.scene.add(this.poleMesh, this.armMesh, this.housingMesh, this.coneMesh);
  }

  /** Fades the housing glow and light cone together on the dusk ramp. */
  setNightFactor(nightFactor: number): void {
    const f = Math.min(1, Math.max(0, nightFactor));
    this.housingMaterial.emissiveIntensity = f;
    this.coneMaterial.opacity = f * CONE_MAX_OPACITY;
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

  coneInstanceCount(): number {
    return this.coneMesh?.count ?? 0;
  }

  housingEmissiveIntensity(): number {
    return this.housingMaterial.emissiveIntensity;
  }

  coneOpacity(): number {
    return this.coneMaterial.opacity;
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

  conePosition(slot = 0): THREE.Vector3 {
    return this.positionOf(this.coneMesh, slot);
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

  /** Cone apex Y (world) at `slot` — matches the housing attach point. */
  coneApexY(slot = 0): number {
    return this.conePosition(slot).y + CONE_HEIGHT / 2;
  }

  /** Cone base Y (world) at `slot` — the beam's foot, just above the road surface. */
  coneBaseY(slot = 0): number {
    return this.conePosition(slot).y - CONE_HEIGHT / 2;
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
    _position.set(housingX, groundY + CONE_APEX_Y_OFFSET, housingZ);
    _matrix.compose(_position, housingQuat, _scale);
    this.housingMesh!.setMatrixAt(slot, _matrix);

    // ConeGeometry is centered on its own local Y axis (apex at +height/2,
    // base at -height/2), so its world center sits midway between the beam foot
    // (just above the road) and the housing (apex), over the road at the
    // housing's x/z, not the pole's.
    _position.set(housingX, groundY + CONE_BASE_Y_OFFSET + CONE_HEIGHT / 2, housingZ);
    _matrix.compose(_position, _identityQuat, _scale);
    this.coneMesh!.setMatrixAt(slot, _matrix);
  }

  private disposeMeshes(): void {
    if (this.poleMesh) this.scene.remove(this.poleMesh);
    if (this.armMesh) this.scene.remove(this.armMesh);
    if (this.housingMesh) this.scene.remove(this.housingMesh);
    if (this.coneMesh) this.scene.remove(this.coneMesh);
    this.poleMesh = null;
    this.armMesh = null;
    this.housingMesh = null;
    this.coneMesh = null;
  }
}
