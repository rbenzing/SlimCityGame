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
import { FOOTWAY_WIDTH_M } from '../shared/roadprofile';
import { NO_STREETS, type StreetLookup } from './frontage';
import { setInstanceCount } from './groundquad';

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
const SLOT_WALK_RADIUS = 45;
const SLOT_WALK_ASPECT = 46;

/** "Sparse": only a minority of Active buildings get a walker. */
export const WALKER_BUILDING_PROBABILITY = 0.12;
export const MAX_WALKING_PEDESTRIANS = 64;

/** Fallback lateral offset placing a walker beside its building when no nearby sidewalk is found (world meters). */
const WALK_LATERAL_OFFSET_METERS = TILE_METERS * 0.5;
/** One stroll out and back along the pavement, ms -- a slow, ambient pace. */
export const WALK_PERIOD_MS = 16_000;
/**
 * A walker with a front door to go to spends this share of each cycle on
 * the pavement and the rest walking up the path to the door and back; the
 * whole cycle is the stroll stretched so the pavement time stays the same.
 */
const WALK_STROLL_SHARE = 0.6;
export const WALK_CYCLE_WITH_DOOR_MS = WALK_PERIOD_MS / WALK_STROLL_SHARE;
/**
 * How far along the pavement a walker ranges from their anchor, in world
 * meters. A stretch of a couple of tiles reads as walking somewhere; the old
 * sub-tile radius read as pacing on the spot.
 */
const WALK_PATH_HALF_LENGTH_MIN_METERS = TILE_METERS * 0.9;
const WALK_PATH_HALF_LENGTH_MAX_METERS = TILE_METERS * 1.8;
/** How far across the pavement a walker drifts — kept well inside a footway. */
const WALK_PATH_HALF_WIDTH_METERS = 0.4;
/** How many tiles out from a building to look for a road, so the stroll can anchor on the frontage sidewalk. */
export const WALK_ANCHOR_SEARCH_TILES = 3;
/** Where the footway lies on a road tile nothing describes: a footway's width in from the tile's edge. */
const DEFAULT_FOOTWAY_CENTRE_FROM_EDGE_M = FOOTWAY_WIDTH_M / 2;
/** The step, as a share of the cycle, a heading is read over. */
const HEADING_SAMPLE_SHARE = 1e-3;

function buildingSeed(id: number): number {
  return id * BUILDING_SEED_MULTIPLIER;
}

/** Deterministic per-building pick of whether it gets a walker at all. */
export function isWalkerBuilding(buildingId: number): boolean {
  return hash1(buildingSeed(buildingId) + SLOT_WALK_PICK) < WALKER_BUILDING_PROBABILITY;
}

export interface WalkSample {
  /** World metres. */
  readonly x: number;
  readonly z: number;
  /** Y-axis yaw for a +Z-nosed mesh, matching transit.ts's/sim/traffic.ts's heading convention. */
  readonly heading: number;
}

/** Where a walker walks: the footway in front of their home, and the door they go in by. */
export interface WalkPlan {
  /** The point on the footway the stroll is centred on, world metres. */
  readonly anchor: WorldPoint;
  /** Which world axis the pavement runs along. */
  readonly alongX: boolean;
  /** The home's front door, world metres, or null for a building whose door nobody has drawn. */
  readonly door: WorldPoint | null;
}

const smooth = (k: number): number => k * k * (3 - 2 * k);

/**
 * Pure function of (plan, buildingId, cycle fraction): where the walker is.
 *
 * The stroll is a stretch of pavement walked out and back, ALONG the footway
 * and barely across it, starting and ending at the anchor, so a person walks
 * a good way up the street, turns, walks back past their gate and as far the
 * other way, and turns again. With a door in the plan the cycle then leaves
 * the pavement, walks the straight line to the door — the house kit's own
 * path — and comes back to the pavement before the next stroll. Nothing here
 * is a circuit around the house, which from above read as pacing rings.
 */
function walkPosition(plan: WalkPlan, buildingId: number, s: number): WorldPoint {
  const seed = buildingSeed(buildingId);
  const rAlong =
    WALK_PATH_HALF_LENGTH_MIN_METERS +
    hash1(seed + SLOT_WALK_RADIUS) *
      (WALK_PATH_HALF_LENGTH_MAX_METERS - WALK_PATH_HALF_LENGTH_MIN_METERS);
  const rAcross = WALK_PATH_HALF_WIDTH_METERS * (0.5 + hash1(seed + SLOT_WALK_ASPECT));
  const strollShare = plan.door ? WALK_STROLL_SHARE : 1;
  if (!plan.door || s < strollShare) {
    const u = s / strollShare;
    const along = Math.sin(u * Math.PI * 2) * rAlong;
    const across = Math.sin(u * Math.PI * 4) * rAcross;
    return plan.alongX
      ? { x: plan.anchor.x + along, z: plan.anchor.z + across }
      : { x: plan.anchor.x + across, z: plan.anchor.z + along };
  }
  const legShare = (1 - strollShare) / 2;
  const outward = s < strollShare + legShare;
  const k = smooth(((s - strollShare) % legShare) / legShare);
  const from = outward ? plan.anchor : plan.door;
  const to = outward ? plan.door : plan.anchor;
  return { x: from.x + (to.x - from.x) * k, z: from.z + (to.z - from.z) * k };
}

/** The cycle fraction a walker is at, from the frame clock: per-id phase and direction keep a street unsynchronised. */
function walkCycleFraction(plan: WalkPlan, buildingId: number, tMs: number): number {
  const seed = buildingSeed(buildingId);
  const phase = hash1(seed + SLOT_WALK_PHASE);
  const dir = hash1(seed + SLOT_WALK_AXIS) < 0.5 ? 1 : -1;
  const cycle = plan.door ? WALK_CYCLE_WITH_DOOR_MS : WALK_PERIOD_MS;
  const raw = (dir * tMs) / cycle + phase;
  return raw - Math.floor(raw);
}

/**
 * The walker's world position and heading at frame time `tMs`. Stateless:
 * position is fully reconstructible from tMs, so apply()/update() ordering
 * never matters and a fresh scene reads correctly on its first frame.
 */
export function walkSample(plan: WalkPlan, buildingId: number, tMs: number): WalkSample {
  const s = walkCycleFraction(plan, buildingId, tMs);
  const here = walkPosition(plan, buildingId, s);
  // Heading is where the walker is about to be: read a little way on round the
  // cycle, in the direction this walker's clock runs.
  const dir = hash1(buildingSeed(buildingId) + SLOT_WALK_AXIS) < 0.5 ? 1 : -1;
  let ahead = s + dir * HEADING_SAMPLE_SHARE;
  ahead -= Math.floor(ahead);
  const next = walkPosition(plan, buildingId, ahead);
  const dx = next.x - here.x;
  const dz = next.z - here.z;
  const heading = dx === 0 && dz === 0 ? 0 : Math.atan2(dx, dz);
  return { x: here.x, z: here.z, heading };
}

/** Deterministic fallback lateral offset placing a walker beside its building when no nearby sidewalk is found, alternating which side by hash. */
export function walkAnchorOffset(buildingId: number): WorldPoint {
  const axisIsX = hash1(buildingSeed(buildingId) + SLOT_WALK_AXIS) < 0.5;
  const side = hash1(buildingSeed(buildingId) + SLOT_WALK_SIDE) < 0.5 ? 1 : -1;
  return axisIsX
    ? { x: 0, z: WALK_LATERAL_OFFSET_METERS * side }
    : { x: WALK_LATERAL_OFFSET_METERS * side, z: 0 };
}

/**
 * World-space anchor for a walker's stroll: the footway of the nearest road
 * (searched ring-by-ring out to WALK_ANCHOR_SEARCH_TILES, deterministic
 * N→E→S→W order). Falls back to a spot just beside the building when no road
 * is within range (or `roadAt` isn't wired).
 */
export function computeWalkAnchor(
  building: BuildingInstance,
  roadAt: (x: number, z: number) => boolean,
  street: StreetLookup = NO_STREETS,
): WorldPoint {
  return computeWalkPath(building, roadAt, street).anchor;
}

/**
 * Where a walker strolls: the footway in front of the home, WHICH WAY that
 * pavement runs, and the door to go in by.
 *
 * The footway is on the road tile, not the lot: a street's cross-section puts
 * the pavement between its verge and its kerb, and the lot's own first row is
 * the house's lawn — or the house. Anchored a tile back from the road instead,
 * a walker whose home touched the street walked straight through its living
 * room. The axis is what stops them circling: walking the pavement's own
 * direction is what makes it look like a pavement.
 */
export function computeWalkPath(
  building: BuildingInstance,
  roadAt: (x: number, z: number) => boolean,
  street: StreetLookup = NO_STREETS,
  door: WorldPoint | null = null,
): WalkPlan {
  const bx = building.x;
  const bz = building.z;
  for (let r = 1; r <= WALK_ANCHOR_SEARCH_TILES; r += 1) {
    const candidates: ReadonlyArray<readonly [number, number]> = [
      [bx, bz - r],
      [bx + r, bz],
      [bx, bz + r],
      [bx - r, bz],
    ];
    for (const [rx, rz] of candidates) {
      if (!roadAt(rx, rz)) continue;
      // From the road tile's centre toward the lot: past the carriageway and
      // the kerb to the middle of the footway, as the tile's own section lays
      // it, or a footway's width in from the tile's edge where no section says.
      const tile = street(rx, rz);
      const fromCentre = tile
        ? Math.max(0, TILE_METERS / 2 - tile.vergeM - tile.sidewalkM / 2)
        : TILE_METERS / 2 - DEFAULT_FOOTWAY_CENTRE_FROM_EDGE_M;
      const towardX = Math.sign(bx - rx);
      const towardZ = Math.sign(bz - rz);
      // The street runs whichever way its own neighbours continue. A road tile
      // north or south of the building runs east-west, and the reverse — but
      // ask the tiles rather than assume, so a corner reads correctly.
      const runsEW = roadAt(rx - 1, rz) || roadAt(rx + 1, rz);
      const runsNS = roadAt(rx, rz - 1) || roadAt(rx, rz + 1);
      const alongX = runsEW || !runsNS;
      return {
        anchor: {
          x: tileToWorld(rx) + towardX * fromCentre,
          z: tileToWorld(rz) + towardZ * fromCentre,
        },
        alongX,
        door,
      };
    }
  }
  const off = walkAnchorOffset(building.id);
  return {
    anchor: { x: tileToWorld(bx) + off.x, z: tileToWorld(bz) + off.z },
    alongX: off.z !== 0,
    door: null,
  };
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

/**
 * A stop the idle crowd waits at. `anchor` (world meters) is the shelter's
 * ground center — idlers cluster there (on the sidewalk, beside the bench)
 * rather than on the carriageway. Absent (plain tile point) → idlers fall back
 * to scattering around the stop tile's own center, the pre-shelter behavior.
 */
export interface StopIdleInput extends TilePoint {
  readonly anchor?: WorldPoint;
}

export interface PedestrianSnapshot {
  /** Flattened stops across every transit line (transit snapshot), each with an optional shelter anchor. */
  stops: readonly StopIdleInput[];
  buildings: BuildingDelta;
}

// ---------------------------------------------------------------------------
// A person's dimensions, in metres. These are the human anchor the rest of the
// city's scale is read against: a person stands beside a 4.0 m car in front of
// a 3.2 m storey, and if any one of those three is wrong the whole city reads
// as the wrong size. A 0.36 m body width is wide for a real person, but a
// simplified capsule figure needs it to read as a body rather than a post.
// ---------------------------------------------------------------------------

export const PEDESTRIAN_BODY_RADIUS = 0.18;
/** Cylindrical mid-section length of the capsule (excludes the two hemisphere caps). */
export const PEDESTRIAN_BODY_HEIGHT = 1.12;
/** An adult head is about 0.23 m tall. */
export const PEDESTRIAN_HEAD_RADIUS = 0.115;
/** The neck: a sliver of daylight between the shoulders and the head. */
export const PEDESTRIAN_HEAD_GAP = 0.04;

/** Ground to the top of the head — derived, so it can never disagree with the parts it is made of. */
export const PEDESTRIAN_STATURE_METERS =
  PEDESTRIAN_BODY_HEIGHT +
  PEDESTRIAN_BODY_RADIUS * 2 +
  PEDESTRIAN_HEAD_GAP +
  PEDESTRIAN_HEAD_RADIUS * 2;

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
  private readonly roadAt: (x: number, z: number) => boolean;
  private readonly street: StreetLookup;
  private readonly doorAt: (building: BuildingInstance) => WorldPoint | null;

  private readonly bodyGeometry = new THREE.CapsuleGeometry(
    PEDESTRIAN_BODY_RADIUS,
    PEDESTRIAN_BODY_HEIGHT,
    4,
    8,
  );
  private readonly headGeometry = new THREE.SphereGeometry(PEDESTRIAN_HEAD_RADIUS, 8, 6);
  private readonly bodyMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  private readonly headMaterial = new THREE.MeshLambertMaterial({ color: HEAD_COLOR });

  private bodyMesh: THREE.InstancedMesh | null = null;
  private headMesh: THREE.InstancedMesh | null = null;

  private readonly buildingsById = new Map<number, BuildingInstance>();
  private idlePlacements: IdlePlacement[] = [];
  /** Per-stop-tile shelter ground anchor (world meters) idlers cluster around; missing key → scatter around the tile center. */
  private idleAnchors = new Map<number, WorldPoint>();
  private walkerIds: number[] = [];
  /** Each walker's plan, aligned index-for-index with `walkerIds` (recomputed each apply). */
  private walkerPaths: WalkPlan[] = [];
  private visible = true;

  /**
   * `roadAt` (optional) lets walkers anchor their stroll on the footway in
   * front of their home; without it they fall back to a spot beside the
   * building. `street` says where on the road tile that footway lies, and
   * `doorAt` where the home's front door stands, for the walk up the path.
   */
  constructor(
    scene: THREE.Scene,
    heightAt: (x: number, z: number) => number,
    roadAt: (x: number, z: number) => boolean = () => false,
    street: StreetLookup = NO_STREETS,
    doorAt: (building: BuildingInstance) => WorldPoint | null = () => null,
  ) {
    this.scene = scene;
    this.heightAt = heightAt;
    this.roadAt = roadAt;
    this.street = street;
    this.doorAt = doorAt;
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
    this.idleAnchors = new Map<number, WorldPoint>();
    for (const stop of snapshot.stops) {
      if (stop.anchor) this.idleAnchors.set(tileKey(stop.x, stop.z), stop.anchor);
    }
    this.walkerIds = computeWalkerBuildingIds([...this.buildingsById.values()]);
    // Resolve each walker's frontage-sidewalk anchor once per apply (buildings
    // are static once placed) so update() stays a cheap per-frame loop step.
    this.walkerPaths = this.walkerIds.map((id) => {
      const building = this.buildingsById.get(id)!;
      return computeWalkPath(building, this.roadAt, this.street, this.doorAt(building));
    });

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

      const plan = this.walkerPaths[w] ?? {
        anchor: { x: tileToWorld(building.x), z: tileToWorld(building.z) },
        alongX: true,
        door: null,
      };
      const walk = walkSample(plan, buildingId, tMs);
      const groundY = this.heightAt(walk.x, walk.z);

      this.writePerson(
        slot,
        walk.x,
        groundY,
        walk.z,
        walk.heading,
        paletteColor(walkerTint(buildingId)),
      );
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

  /**
   * Each walker's resolved stroll path — the building it belongs to, the
   * frontage anchor it walks around, and which world axis the pavement runs
   * along. A walker circling its house and one striding down the street look
   * alike in a single frame, so a screenshot cannot tell them apart; this can.
   */
  walkerPathsForAudit(): {
    buildingId: number;
    anchor: WorldPoint;
    alongX: boolean;
    door: WorldPoint | null;
  }[] {
    return this.walkerIds.map((buildingId, i) => ({
      buildingId,
      anchor: this.walkerPaths[i]?.anchor ?? { x: 0, z: 0 },
      alongX: this.walkerPaths[i]?.alongX ?? true,
      door: this.walkerPaths[i]?.door ?? null,
    }));
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
    setInstanceCount(bodyMesh, total);
    setInstanceCount(headMesh, total);
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
      // Cluster around the shelter (sidewalk) when an anchor is known; else the
      // stop tile's own center (pre-shelter fallback).
      const base = this.idleAnchors.get(tileKey(p.x, p.z)) ?? {
        x: tileToWorld(p.x),
        z: tileToWorld(p.z),
      };
      const off = idleOffset(p.x, p.z, p.personIndex);
      const px = base.x + off.x;
      const pz = base.z + off.z;
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
    _position.set(x, groundY + PEDESTRIAN_BODY_RADIUS + PEDESTRIAN_BODY_HEIGHT / 2, z);
    _quaternion.setFromAxisAngle(_yAxis, heading);
    _matrix.compose(_position, _quaternion, _scale);
    this.bodyMesh!.setMatrixAt(slot, _matrix);
    _color.setHex(colorHex);
    this.bodyMesh!.setColorAt(slot, _color);

    // The sphere's center sits one head-radius below the top of the head, so
    // the figure stands exactly PEDESTRIAN_STATURE_METERS tall.
    _position.set(x, groundY + PEDESTRIAN_STATURE_METERS - PEDESTRIAN_HEAD_RADIUS, z);
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
