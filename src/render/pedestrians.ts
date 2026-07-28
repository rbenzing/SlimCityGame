/**
 * Cosmetic pedestrians: a few low-poly people idling at
 * each bus-stop shelter (render/transit.ts) and a sparse deterministic
 * scatter walking near Active buildings. Purely decorative -- NO agent sim:
 * every position is a pure function of stable ids/tile
 * coordinates (+ the frame's accumulated tMs for the walk-cycle offset),
 * never Math.random/Date.now, mirroring render/trees.ts's mulberry32 and
 * render/buildings.ts's hash(id, slot) idioms.
 *
 * Two instanced layers -- body (capsule) + head (sphere) -- shared by both
 * idling and walking pedestrians; a per-instance hashed clothing tint gives
 * casual variety. Instance count is hard-capped well below the theoretical
 * "one per stop/building" total ("count-capped relative to
 * stops+buildings") so a large city never spends more than a fixed
 * instanced-draw budget on background people.
 *
 * A "walker" has no accumulated render-side state: computeWalkOffset(id, tMs)
 * is a pure function, so its position is fully reconstructible from tMs
 * alone -- apply()/update() call ordering never matters, and a fresh scene
 * reads correctly on the very first frame (update(0) is run once at the end
 * of apply(), mirroring transit.ts's buildBuses -> update(0) convention).
 */
import * as THREE from 'three';
import { BuildingDelta, BuildingInstance, BuildingState, TilePoint } from '../shared/types';
import { TILE_METERS, tileToWorld } from '../shared/constants';

// ---------------------------------------------------------------------------
// Deterministic hashing (never Math.random/Date.now) -- same recipe kept
// locally by every render/*.ts file (buildings.ts, facade.ts, massing.ts,
// props.ts, transit.ts).
// ---------------------------------------------------------------------------

function hash1(n: number): number {
  let h = n >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/** Wide fixed stride so (x,z) tile pairs never collide, matching lamps.ts's tileKey idiom. */
function tileKey(x: number, z: number): number {
  return x * 100_000 + z;
}

export interface WorldPoint {
  readonly x: number;
  readonly z: number;
}

// ---------------------------------------------------------------------------
// Idling pedestrians at bus stops
// ---------------------------------------------------------------------------

const STOP_SEED_MULTIPLIER = 4096;
/** Per-person hash slots are spaced 3 apart (angle/radius/tint) so they never collide. */
const STOP_PERSON_SLOT_STRIDE = 3;
const SLOT_IDLE_COUNT = 1;
const SLOT_IDLE_ANGLE = 10;
const SLOT_IDLE_RADIUS = 11;
const SLOT_IDLE_TINT = 12;

export const IDLE_MIN_PER_STOP = 1;
export const IDLE_MAX_PER_STOP = 3;
/** How far an idling pedestrian scatters from the stop's own tile point, world meters -- close enough to read as "waiting there". */
const IDLE_SCATTER_RADIUS_MIN = 0.8;
const IDLE_SCATTER_RADIUS_MAX = 2.2;

function stopSeed(x: number, z: number): number {
  return tileKey(x, z) * STOP_SEED_MULTIPLIER;
}

/** "A few" idlers per stop: 1-3, deterministic from the stop's own tile coords. */
export function idleCountForStop(x: number, z: number): number {
  const span = IDLE_MAX_PER_STOP - IDLE_MIN_PER_STOP;
  return IDLE_MIN_PER_STOP + Math.floor(hash1(stopSeed(x, z) + SLOT_IDLE_COUNT) * (span + 1));
}

/** Deterministic scatter offset (world meters, relative to the stop's own tile point) for the personIndex-th idler at that stop. */
export function idleOffset(x: number, z: number, personIndex: number): WorldPoint {
  const seed = stopSeed(x, z) + personIndex * STOP_PERSON_SLOT_STRIDE;
  const angle = hash1(seed + SLOT_IDLE_ANGLE) * Math.PI * 2;
  const radius =
    IDLE_SCATTER_RADIUS_MIN +
    hash1(seed + SLOT_IDLE_RADIUS) * (IDLE_SCATTER_RADIUS_MAX - IDLE_SCATTER_RADIUS_MIN);
  return { x: Math.sin(angle) * radius, z: Math.cos(angle) * radius };
}

/** Deterministic facing (radians, Y yaw) for the personIndex-th idler at a stop -- reuses the scatter angle so idlers loosely face outward from the shelter. */
export function idleHeading(x: number, z: number, personIndex: number): number {
  const seed = stopSeed(x, z) + personIndex * STOP_PERSON_SLOT_STRIDE;
  return hash1(seed + SLOT_IDLE_ANGLE) * Math.PI * 2;
}

/** 0..1, mapped to CLOTHING_PALETTE by the renderer. */
export function idleTint(x: number, z: number, personIndex: number): number {
  const seed = stopSeed(x, z) + personIndex * STOP_PERSON_SLOT_STRIDE;
  return hash1(seed + SLOT_IDLE_TINT);
}

export interface IdlePlacement {
  readonly x: number;
  readonly z: number;
  readonly personIndex: number;
}

export const MAX_IDLE_PEDESTRIANS = 96;

/**
 * Every idling placement across a stop list, deduplicated by tile (two
 * lines sharing a physical stop shouldn't double its crowd), stably ordered
 * (so truncation at the cap is deterministic regardless of input order), and
 * hard-capped at MAX_IDLE_PEDESTRIANS.
 */
export function computeIdlePlacements(stops: readonly TilePoint[]): IdlePlacement[] {
  const seen = new Set<number>();
  const uniqueStops: TilePoint[] = [];
  for (const stop of stops) {
    const key = tileKey(stop.x, stop.z);
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueStops.push(stop);
  }
  uniqueStops.sort((a, b) => tileKey(a.x, a.z) - tileKey(b.x, b.z));

  const placements: IdlePlacement[] = [];
  for (const stop of uniqueStops) {
    const count = idleCountForStop(stop.x, stop.z);
    for (let personIndex = 0; personIndex < count; personIndex += 1) {
      if (placements.length >= MAX_IDLE_PEDESTRIANS) return placements;
      placements.push({ x: stop.x, z: stop.z, personIndex });
    }
  }
  return placements;
}

// ---------------------------------------------------------------------------
// Sparse walking scatter near Active buildings
// ---------------------------------------------------------------------------

const BUILDING_SEED_MULTIPLIER = 4096;
const SLOT_WALK_PICK = 40;
const SLOT_WALK_AXIS = 41;
const SLOT_WALK_SIDE = 42;
const SLOT_WALK_PHASE = 43;
const SLOT_WALK_TINT = 44;

/** "Sparse": only a minority of Active buildings get a walker. */
export const WALKER_BUILDING_PROBABILITY = 0.12;
export const MAX_WALKING_PEDESTRIANS = 64;

/** How far a walker's stretch sits from the building's own tile point, off to one side (world meters). */
const WALK_LATERAL_OFFSET_METERS = TILE_METERS * 0.7;
/** Half-length of the back-and-forth walked stretch, world meters. */
const WALK_AMPLITUDE_METERS = TILE_METERS * 0.9;
/** One full there-and-back cycle, ms -- a slow, ambient pace. */
const WALK_PERIOD_MS = 14_000;
const WALK_ANGULAR_RATE = (Math.PI * 2) / WALK_PERIOD_MS;

function buildingSeed(id: number): number {
  return id * BUILDING_SEED_MULTIPLIER;
}

/** Deterministic per-building pick of whether it gets a walker at all. */
export function isWalkerBuilding(buildingId: number): boolean {
  return hash1(buildingSeed(buildingId) + SLOT_WALK_PICK) < WALKER_BUILDING_PROBABILITY;
}

export interface WalkSample {
  readonly dx: number;
  readonly dz: number;
  /** Y-axis yaw for a +Z-nosed mesh, matching transit.ts's/sim/traffic.ts's heading convention. */
  readonly heading: number;
}

/**
 * Pure function of (buildingId, tMs): a slow deterministic back-and-forth
 * walk offset (world meters, relative to the building's own walkAnchorOffset)
 * approximating a lerp along a short sidewalk stretch beside the building.
 * Sinusoidal rather than a literal ping-pong lerp, but reads identically
 * (smooth there-and-back motion) and stays trivially pure/stateless.
 */
export function computeWalkOffset(buildingId: number, tMs: number): WalkSample {
  const axisIsX = hash1(buildingSeed(buildingId) + SLOT_WALK_AXIS) < 0.5;
  const phase = hash1(buildingSeed(buildingId) + SLOT_WALK_PHASE) * Math.PI * 2;
  const t = tMs * WALK_ANGULAR_RATE + phase;
  const s = Math.sin(t) * WALK_AMPLITUDE_METERS;
  const facingForward = Math.cos(t) >= 0;

  if (axisIsX) return { dx: s, dz: 0, heading: facingForward ? Math.PI / 2 : -Math.PI / 2 };
  return { dx: 0, dz: s, heading: facingForward ? 0 : Math.PI };
}

/** Deterministic lateral offset placing a building's walked stretch just beside it, alternating which side by hash. */
export function walkAnchorOffset(buildingId: number): WorldPoint {
  const axisIsX = hash1(buildingSeed(buildingId) + SLOT_WALK_AXIS) < 0.5;
  const side = hash1(buildingSeed(buildingId) + SLOT_WALK_SIDE) < 0.5 ? 1 : -1;
  return axisIsX
    ? { x: 0, z: WALK_LATERAL_OFFSET_METERS * side }
    : { x: WALK_LATERAL_OFFSET_METERS * side, z: 0 };
}

export function walkerTint(buildingId: number): number {
  return hash1(buildingSeed(buildingId) + SLOT_WALK_TINT);
}

/**
 * Active buildings selected for a walker ("sparse deterministic
 * scatter ... near Active buildings"), stably ordered by id and hard-capped
 * at MAX_WALKING_PEDESTRIANS.
 */
export function computeWalkerBuildingIds(buildings: readonly BuildingInstance[]): number[] {
  return buildings
    .filter((b) => b.state === BuildingState.Active && isWalkerBuilding(b.id))
    .map((b) => b.id)
    .sort((a, b) => a - b)
    .slice(0, MAX_WALKING_PEDESTRIANS);
}

export const MAX_PEDESTRIANS = MAX_IDLE_PEDESTRIANS + MAX_WALKING_PEDESTRIANS;

// ---------------------------------------------------------------------------
// PedestrianRenderer
// ---------------------------------------------------------------------------

export interface PedestrianSnapshot {
  /** Flattened stop tile-points across every transit line (transit snapshot). */
  stops: readonly TilePoint[];
  buildings: BuildingDelta;
}

const BODY_RADIUS = 0.18;
/** Cylindrical mid-section length of the capsule (excludes the two hemisphere caps). */
const BODY_HEIGHT = 0.6;
const HEAD_RADIUS = 0.15;
const HEAD_GAP = 0.04;

/** Casual clothing-color variety, picked deterministically per instance. */
const CLOTHING_PALETTE: readonly number[] = [
  0xd94f4f, 0x4f7dd9, 0x4fd97a, 0xd9c34f, 0x8a4fd9, 0xd9974f, 0x4fd9d3, 0x707070,
];
const HEAD_COLOR = 0xe8c39e;

function paletteColor(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  const idx = Math.min(CLOTHING_PALETTE.length - 1, Math.floor(clamped * CLOTHING_PALETTE.length));
  return CLOTHING_PALETTE[idx]!;
}

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _identityQuat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _color = new THREE.Color();
const _yAxis = new THREE.Vector3(0, 1, 0);
const HIDDEN_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

export class PedestrianRenderer {
  private readonly scene: THREE.Scene;
  private readonly heightAt: (x: number, z: number) => number;

  private readonly bodyGeometry = new THREE.CapsuleGeometry(BODY_RADIUS, BODY_HEIGHT, 4, 8);
  private readonly headGeometry = new THREE.SphereGeometry(HEAD_RADIUS, 8, 6);
  private readonly bodyMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  private readonly headMaterial = new THREE.MeshLambertMaterial({ color: HEAD_COLOR });

  private bodyMesh: THREE.InstancedMesh | null = null;
  private headMesh: THREE.InstancedMesh | null = null;

  private readonly buildingsById = new Map<number, BuildingInstance>();
  private idlePlacements: IdlePlacement[] = [];
  private walkerIds: number[] = [];
  private visible = true;

  constructor(scene: THREE.Scene, heightAt: (x: number, z: number) => number) {
    this.scene = scene;
    this.heightAt = heightAt;
  }

  /**
   * Idling crowd is recomputed fresh from `stops` each call (small, changes
   * rarely -- same convention as transit.ts's own stop rebuild). The Active
   * building set feeding the walker scatter is tracked incrementally from
   * successive BuildingDelta's, exactly like render/buildings.ts's own id ->
   * instance bookkeeping, since SimSnapshot.buildings is itself a delta.
   */
  apply(snapshot: PedestrianSnapshot): void {
    for (const id of snapshot.buildings.removed) this.buildingsById.delete(id);
    for (const b of snapshot.buildings.added) this.buildingsById.set(b.id, b);
    for (const b of snapshot.buildings.updated) this.buildingsById.set(b.id, b);

    this.idlePlacements = computeIdlePlacements(snapshot.stops);
    this.walkerIds = computeWalkerBuildingIds([...this.buildingsById.values()]);

    this.rebuildMeshes();
  }

  /** Advances every walker's position along its deterministic walk cycle for the given accumulated frame time; idlers are static. */
  update(tMs: number): void {
    if (!this.bodyMesh || !this.headMesh) return;

    const idleCount = this.idlePlacements.length;
    for (let w = 0; w < this.walkerIds.length; w += 1) {
      const buildingId = this.walkerIds[w]!;
      const slot = idleCount + w;
      const building = this.buildingsById.get(buildingId);
      if (!building) {
        this.hideSlot(slot);
        continue;
      }

      const worldX = tileToWorld(building.x);
      const worldZ = tileToWorld(building.z);
      const lateral = walkAnchorOffset(buildingId);
      const walk = computeWalkOffset(buildingId, tMs);
      const px = worldX + lateral.x + walk.dx;
      const pz = worldZ + lateral.z + walk.dz;
      const groundY = this.heightAt(px, pz);

      this.writePerson(slot, px, groundY, pz, walk.heading, paletteColor(walkerTint(buildingId)));
    }

    this.bodyMesh.instanceMatrix.needsUpdate = true;
    if (this.bodyMesh.instanceColor) this.bodyMesh.instanceColor.needsUpdate = true;
    this.headMesh.instanceMatrix.needsUpdate = true;
  }

  /** Visibility toggle (e.g. a future pedestrians lens): hides/shows without disposing. */
  setVisible(visible: boolean): void {
    this.visible = visible;
    if (this.bodyMesh) this.bodyMesh.visible = visible;
    if (this.headMesh) this.headMesh.visible = visible;
  }

  isVisible(): boolean {
    return this.visible;
  }

  idleCount(): number {
    return this.idlePlacements.length;
  }

  walkerCount(): number {
    return this.walkerIds.length;
  }

  /** Total instanced pedestrian count -- always <= MAX_PEDESTRIANS. */
  totalCount(): number {
    return this.idlePlacements.length + this.walkerIds.length;
  }

  dispose(): void {
    this.disposeMeshes();
  }

  // -- internals -------------------------------------------------------------

  private rebuildMeshes(): void {
    this.disposeMeshes();

    const total = this.idlePlacements.length + this.walkerIds.length;
    if (total === 0) return;

    const bodyMesh = new THREE.InstancedMesh(this.bodyGeometry, this.bodyMaterial, total);
    const headMesh = new THREE.InstancedMesh(this.headGeometry, this.headMaterial, total);
    bodyMesh.count = total;
    headMesh.count = total;
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    headMesh.castShadow = true;
    headMesh.receiveShadow = true;
    bodyMesh.visible = this.visible;
    headMesh.visible = this.visible;

    this.bodyMesh = bodyMesh;
    this.headMesh = headMesh;
    this.scene.add(bodyMesh, headMesh);

    for (let i = 0; i < this.idlePlacements.length; i += 1) {
      const p = this.idlePlacements[i]!;
      const worldX = tileToWorld(p.x);
      const worldZ = tileToWorld(p.z);
      const off = idleOffset(p.x, p.z, p.personIndex);
      const px = worldX + off.x;
      const pz = worldZ + off.z;
      const groundY = this.heightAt(px, pz);
      const heading = idleHeading(p.x, p.z, p.personIndex);
      const tint = paletteColor(idleTint(p.x, p.z, p.personIndex));
      this.writePerson(i, px, groundY, pz, heading, tint);
    }

    // Places every walker at its tMs=0 position immediately, so a fresh
    // apply() reads correctly even before the next update(tMs) call.
    this.update(0);
  }

  private writePerson(
    slot: number,
    x: number,
    groundY: number,
    z: number,
    heading: number,
    colorHex: number,
  ): void {
    // CapsuleGeometry is centered on Y (its hemisphere caps extend +-(height/2+radius)
    // from its own origin), so its bottom cap sits exactly at groundY when the
    // instance center is groundY + radius + height/2.
    _position.set(x, groundY + BODY_RADIUS + BODY_HEIGHT / 2, z);
    _quaternion.setFromAxisAngle(_yAxis, heading);
    _matrix.compose(_position, _quaternion, _scale);
    this.bodyMesh!.setMatrixAt(slot, _matrix);
    _color.setHex(colorHex);
    this.bodyMesh!.setColorAt(slot, _color);

    _position.set(x, groundY + BODY_HEIGHT + BODY_RADIUS * 2 + HEAD_RADIUS + HEAD_GAP, z);
    _matrix.compose(_position, _identityQuat, _scale);
    this.headMesh!.setMatrixAt(slot, _matrix);
  }

  private hideSlot(slot: number): void {
    this.bodyMesh?.setMatrixAt(slot, HIDDEN_MATRIX);
    this.headMesh?.setMatrixAt(slot, HIDDEN_MATRIX);
  }

  private disposeMeshes(): void {
    if (this.bodyMesh) this.scene.remove(this.bodyMesh);
    if (this.headMesh) this.scene.remove(this.headMesh);
    this.bodyMesh = null;
    this.headMesh = null;
  }
}
