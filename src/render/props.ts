/**
 * Roof props and industrial extras. Every building gets rooftop clutter on
 * its TOP massing tier (see
 * massing.ts's computeSetbacks — for level-1 buildings/ploppables that's the
 * only box; for level-2/3 it's the topmost, most-inset tier): a single-floor
 * building gets a vent, a 2+-floor building gets area-scaled AC units plus an
 * occasional antenna (its tip a warning-light emissive that switches on with
 * setNightFactor, exactly like lamps.ts's head glow); industrial buildings
 * additionally get a smokestack (level 2+) and/or a silo cluster (footprint
 * >= 3x3), each at its own deterministic footprint corner.
 *
 * All positions/counts are PURE functions of (topBox, buildingId[, propIndex])
 * — no THREE/DOM dependency, no Math.random/Date.now — mirroring facade.ts's
 * and massing.ts's convention so they're unit-testable without a scene.
 * RoofPropRenderer then wires them into 6 independent InstancedSlotPool
 * layers (massing.ts's generic allocator), one per prop kind.
 */
import * as THREE from 'three';
import {
  BuildingCatalogEntry,
  BuildingDelta,
  BuildingInstance,
  BuildingState,
} from '../shared/types';
import { TILE_METERS } from '../shared/constants';
import { deriveFacadeParams } from './facade';
import {
  computeSetbacks,
  CONSTRUCTING_MASSING_HEIGHT_SCALE,
  InstancedSlotPool,
  massingLifecycleTint,
  SetbackBox,
} from './massing';

// ---------------------------------------------------------------------------
// Deterministic hashing (never Math.random/Date.now) — each render/*.ts file
// keeps its own copy of this exact recipe rather than importing it (see
// buildings.ts's, facade.ts's, and massing.ts's identical local copies).
// ---------------------------------------------------------------------------

function hash1(n: number): number {
  let h = n >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

const PROP_HASH_SLOT_MULTIPLIER = 4096;
const HASH_SLOT_COUNT_BONUS = 20;
const HASH_SLOT_ANTENNA = 21;
const HASH_SLOT_SMOKESTACK_CORNER = 22;
const HASH_SLOT_SILO_CORNER_OFFSET = 23;
const HASH_SLOT_SILO_COUNT = 24;
/** propIndex*2 (+1 for z) is added on top of this; kept apart from the corner/bonus slots above. */
const HASH_SLOT_PLACEMENT_BASE = 30;
/** A propIndex sentinel for the antenna's own scatter draw, well clear of any realistic vent/AC propIndex (0..5). */
const ANTENNA_PLACEMENT_INDEX = 97;

// ---------------------------------------------------------------------------
// Roof area -> prop count: 1 vent on a 1x1 house, up to 4-6 AC units on big
// slabs.
// ---------------------------------------------------------------------------

export const ROOF_PROP_COUNT_MIN = 1;
export const ROOF_PROP_COUNT_BASE_MAX = 4;
/** Once the area-scaled base reaches ROOF_PROP_COUNT_BASE_MAX, an id-hashed 0..BONUS_MAX top-up spreads "big slabs" across 4-6. */
export const ROOF_PROP_COUNT_BONUS_MAX = 2;
/** A 1x1 footprint's (post-FOOTPRINT_SHRINK) roof area, in tile-equivalents — the low end of the scale. */
export const ROOF_PROP_AREA_MIN_TILES = 1;
/** A 3x3-or-larger low/single-tier footprint's roof area — the high end ("big slabs"). */
export const ROOF_PROP_AREA_MAX_TILES = 9;

/** roofAreaTiles = box.w * box.d / TILE_METERS^2 (world meters^2 -> tile-equivalent area). */
export function roofAreaTiles(box: SetbackBox): number {
  return (box.w * box.d) / (TILE_METERS * TILE_METERS);
}

/**
 * Count scales with roof area: 1 at/below
 * ROOF_PROP_AREA_MIN_TILES, climbing to ROOF_PROP_COUNT_BASE_MAX at/above
 * ROOF_PROP_AREA_MAX_TILES, at which point a per-building hashed bonus
 * spreads the "big slab" case across the full 4-6 range rather than pinning
 * it at exactly 4.
 */
export function computeRoofPropCount(areaTiles: number, buildingId: number): number {
  const span = ROOF_PROP_AREA_MAX_TILES - ROOF_PROP_AREA_MIN_TILES;
  const t = span <= 0 ? 1 : Math.min(1, Math.max(0, (areaTiles - ROOF_PROP_AREA_MIN_TILES) / span));
  const base = Math.round(
    ROOF_PROP_COUNT_MIN + t * (ROOF_PROP_COUNT_BASE_MAX - ROOF_PROP_COUNT_MIN),
  );
  if (base < ROOF_PROP_COUNT_BASE_MAX) return base;

  const bonus = Math.floor(
    hash1(buildingId * PROP_HASH_SLOT_MULTIPLIER + HASH_SLOT_COUNT_BONUS) *
      (ROOF_PROP_COUNT_BONUS_MAX + 1),
  );
  return base + bonus;
}

// ---------------------------------------------------------------------------
// Occasional antenna (floors >= MIN_FLOORS_FOR_AC only).
// ---------------------------------------------------------------------------

/** Buildings >= 2 floors get AC boxes; single-floor gets a vent. */
export const MIN_FLOORS_FOR_AC = 2;
/** "occasional antenna" — a minority, not roughly half-and-half (mirrors buildings.ts's WINDOW_COOL_PROBABILITY idiom). */
export const ANTENNA_PROBABILITY = 0.35;

export function hasAntenna(buildingId: number): boolean {
  return hash1(buildingId * PROP_HASH_SLOT_MULTIPLIER + HASH_SLOT_ANTENNA) < ANTENNA_PROBABILITY;
}

// ---------------------------------------------------------------------------
// Scattered placement on the top box (vents/AC units/antenna) — pure.
// ---------------------------------------------------------------------------

/** Keeps scattered props inset from the top box's own edge. */
const PLACEMENT_MARGIN_FRACTION = 0.2;

/**
 * Deterministic local (x, z) offset (world meters, relative to the top box's
 * own center, UNROTATED) for the propIndex-th prop on a building's roof,
 * deterministic from buildingId on the TOP box. The
 * renderer rotates this by the building's own rotation before adding it to
 * the building's world center — see rotateLocalOffset.
 */
export function computePropPlacement(
  box: SetbackBox,
  buildingId: number,
  propIndex: number,
): { x: number; z: number } {
  const seedX = buildingId * PROP_HASH_SLOT_MULTIPLIER + HASH_SLOT_PLACEMENT_BASE + propIndex * 2;
  const seedZ = seedX + 1;
  const fracX = hash1(seedX) * 2 - 1; // [-1, 1)
  const fracZ = hash1(seedZ) * 2 - 1;
  const halfW = (box.w / 2) * (1 - PLACEMENT_MARGIN_FRACTION);
  const halfD = (box.d / 2) * (1 - PLACEMENT_MARGIN_FRACTION);
  return { x: fracX * halfW, z: fracZ * halfD };
}

/**
 * Rotates a LOCAL (unrotated footprint-frame) offset by rotation*90 degrees
 * about Y, matching buildings.ts's/massing.ts's own
 * `setFromAxisAngle(yAxis, rotation * PI/2)` convention exactly (cross-
 * checked against THREE.Vector3.applyQuaternion in props.test.ts) — so a
 * prop scattered on the roof stays "on the roof" regardless of the
 * building's rotation, the same way the roof box itself rotates.
 */
export function rotateLocalOffset(
  x: number,
  z: number,
  rotation: 0 | 1 | 2 | 3,
): { x: number; z: number } {
  const theta = rotation * (Math.PI / 2);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return { x: x * cos + z * sin, z: -x * sin + z * cos };
}

// ---------------------------------------------------------------------------
// Industrial extras: footprint-corner placement, pure.
// ---------------------------------------------------------------------------

export type Corner = 0 | 1 | 2 | 3;

/** 3-4 silo cluster. */
export const SILO_CLUSTER_MIN = 3;
export const SILO_CLUSTER_MAX = 4;
/** Industrial level >= 2 adds a smokestack. */
export const MIN_SMOKESTACK_LEVEL = 2;
/** Large industrial (>= 3x3) may get a silo cluster. */
export const MIN_SILO_FOOTPRINT_TILES = 3;

/** Keeps corner props inset from the top box's own edge, same spirit as PLACEMENT_MARGIN_FRACTION. */
const CORNER_MARGIN_FRACTION = 0.15;
/** Spacing between grouped silos in a cluster, world meters. */
const SILO_CLUSTER_STEP_METERS = 2.2;
/** First `count` entries are used per siloClusterCount() (3 drops the last corner of this 2x2, 4 uses all). Nestled INWARD from the corner anchor (see computeSiloClusterPlacements). */
const SILO_CLUSTER_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
];

function cornerSignX(corner: Corner): 1 | -1 {
  return corner === 0 || corner === 1 ? 1 : -1;
}
function cornerSignZ(corner: Corner): 1 | -1 {
  return corner === 0 || corner === 2 ? 1 : -1;
}

/** Local (x, z) offset for a deterministic footprint corner, inset from the edge. */
export function computeCornerOffset(box: SetbackBox, corner: Corner): { x: number; z: number } {
  const halfW = (box.w / 2) * (1 - CORNER_MARGIN_FRACTION);
  const halfD = (box.d / 2) * (1 - CORNER_MARGIN_FRACTION);
  return { x: cornerSignX(corner) * halfW, z: cornerSignZ(corner) * halfD };
}

/** Deterministic corner pick for the smokestack. */
export function smokestackCorner(buildingId: number): Corner {
  return Math.floor(
    hash1(buildingId * PROP_HASH_SLOT_MULTIPLIER + HASH_SLOT_SMOKESTACK_CORNER) * 4,
  ) as Corner;
}

/**
 * Deterministic corner pick for the silo cluster, guaranteed to differ from
 * smokestackCorner(buildingId) for the SAME id — offset by 1-3 (mod 4) from
 * the smokestack's own corner, so the
 * two extras never collide even when a building qualifies for both.
 */
export function siloCorner(buildingId: number): Corner {
  const smokestack = smokestackCorner(buildingId);
  const offset =
    1 +
    Math.floor(hash1(buildingId * PROP_HASH_SLOT_MULTIPLIER + HASH_SLOT_SILO_CORNER_OFFSET) * 3);
  return ((smokestack + offset) % 4) as Corner;
}

/** 3-4 silo cluster, deterministic per building id. */
export function siloClusterCount(buildingId: number): number {
  return (
    SILO_CLUSTER_MIN +
    Math.floor(
      hash1(buildingId * PROP_HASH_SLOT_MULTIPLIER + HASH_SLOT_SILO_COUNT) *
        (SILO_CLUSTER_MAX - SILO_CLUSTER_MIN + 1),
    )
  );
}

/**
 * Local (x, z) offsets for a full silo cluster: siloClusterCount(id) silos
 * grouped at siloCorner(id), nestled INWARD (toward the box center) from the
 * corner anchor so the group reads as one cluster rather than individually
 * corner-pinned cylinders.
 */
export function computeSiloClusterPlacements(
  box: SetbackBox,
  buildingId: number,
): { x: number; z: number }[] {
  const count = siloClusterCount(buildingId);
  const corner = siloCorner(buildingId);
  const anchor = computeCornerOffset(box, corner);
  const signX = cornerSignX(corner);
  const signZ = cornerSignZ(corner);

  const placements: { x: number; z: number }[] = [];
  for (let i = 0; i < count; i++) {
    const [ox, oz] = SILO_CLUSTER_OFFSETS[i]!;
    placements.push({
      x: anchor.x - signX * ox * SILO_CLUSTER_STEP_METERS,
      z: anchor.z - signZ * oz * SILO_CLUSTER_STEP_METERS,
    });
  }
  return placements;
}

// ---------------------------------------------------------------------------
// RoofPropRenderer
// ---------------------------------------------------------------------------

export type PropKind = 'vent' | 'ac' | 'antenna' | 'warningLight' | 'smokestack' | 'silo';
const ALL_PROP_KINDS: readonly PropKind[] = [
  'vent',
  'ac',
  'antenna',
  'warningLight',
  'smokestack',
  'silo',
];

interface PropSize {
  w: number;
  h: number;
  d: number;
}

const VENT_SIZE: PropSize = { w: 0.6, h: 0.4, d: 0.6 };
const AC_SIZE: PropSize = { w: 1.0, h: 0.7, d: 1.0 };
const ANTENNA_SIZE: PropSize = { w: 0.1, h: 2.5, d: 0.1 };
const SMOKESTACK_SIZE: PropSize = { w: 1.6, h: 6, d: 1.6 };
const SILO_SIZE: PropSize = { w: 2.2, h: 4, d: 2.2 };
const WARNING_LIGHT_DIAMETER = 0.3;

const VENT_COLOR = 0x53585d;
const AC_COLOR = 0xced2d5;
const ANTENNA_COLOR = 0x2b2e33;
const SMOKESTACK_COLOR = 0x4a4d50;
const SILO_COLOR = 0xd8d4c8;
const WARNING_LIGHT_COLOR = 0xff3b30;

const INITIAL_PROP_CAPACITY = 32;

/** BoxGeometry/CylinderGeometry translated so their LOCAL origin sits at the shape's own BASE (not its center) — position.y can then be set directly to the roof's world Y. */
function baseAnchoredBox(): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.translate(0, 0.5, 0);
  return geometry;
}
function baseAnchoredCylinder(): THREE.CylinderGeometry {
  const geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
  geometry.translate(0, 0.5, 0);
  return geometry;
}

interface BuildingPropSlots {
  vent: number[];
  ac: number[];
  antenna: number[];
  warningLight: number[];
  smokestack: number[];
  silo: number[];
}
function emptySlots(): BuildingPropSlots {
  return { vent: [], ac: [], antenna: [], warningLight: [], smokestack: [], silo: [] };
}

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _identityQuat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();
const _yAxis = new THREE.Vector3(0, 1, 0);

export class RoofPropRenderer {
  private readonly heightAt: (x: number, z: number) => number;
  private readonly catalogById: Map<string, BuildingCatalogEntry>;
  private readonly warningLightMaterial: THREE.MeshLambertMaterial;
  private readonly pools: Record<PropKind, InstancedSlotPool>;
  private readonly buildingSlots = new Map<number, BuildingPropSlots>();

  constructor(
    scene: THREE.Scene,
    heightAt: (x: number, z: number) => number,
    catalog: BuildingCatalogEntry[],
  ) {
    this.heightAt = heightAt;
    this.catalogById = new Map(catalog.map((entry) => [entry.id, entry]));

    this.warningLightMaterial = new THREE.MeshLambertMaterial({
      color: WARNING_LIGHT_COLOR,
      emissive: WARNING_LIGHT_COLOR,
      emissiveIntensity: 0,
    });

    this.pools = {
      vent: new InstancedSlotPool(
        scene,
        baseAnchoredBox(),
        new THREE.MeshLambertMaterial(),
        INITIAL_PROP_CAPACITY,
      ),
      ac: new InstancedSlotPool(
        scene,
        baseAnchoredBox(),
        new THREE.MeshLambertMaterial(),
        INITIAL_PROP_CAPACITY,
      ),
      antenna: new InstancedSlotPool(
        scene,
        baseAnchoredCylinder(),
        new THREE.MeshLambertMaterial(),
        INITIAL_PROP_CAPACITY,
      ),
      warningLight: new InstancedSlotPool(
        scene,
        new THREE.SphereGeometry(0.5, 8, 6),
        this.warningLightMaterial,
        INITIAL_PROP_CAPACITY,
      ),
      smokestack: new InstancedSlotPool(
        scene,
        baseAnchoredCylinder(),
        new THREE.MeshLambertMaterial(),
        INITIAL_PROP_CAPACITY,
      ),
      silo: new InstancedSlotPool(
        scene,
        baseAnchoredCylinder(),
        new THREE.MeshLambertMaterial(),
        INITIAL_PROP_CAPACITY,
      ),
    };
  }

  /** Consumes one BuildingDelta: removed ids free every prop slot they own; added/updated recompute theirs. */
  apply(delta: BuildingDelta): void {
    for (const id of delta.removed) this.freeBuilding(id);
    for (const building of delta.added) this.applyOne(building);
    for (const building of delta.updated) this.applyOne(building);
    for (const kind of ALL_PROP_KINDS) this.pools[kind].commit();
  }

  /** 0 (day) .. 1 (night) — drives the shared warning-light material's emissive strength (antenna tip + smokestack tip alike), exactly like lamps.ts's head glow. */
  setNightFactor(nightFactor: number): void {
    this.warningLightMaterial.emissiveIntensity = Math.min(1, Math.max(0, nightFactor));
  }

  nightFactor(): number {
    return this.warningLightMaterial.emissiveIntensity;
  }

  /** Alias kept explicit for tests/introspection (mirrors lamps.ts's headEmissiveIntensity()). */
  warningLightEmissiveIntensity(): number {
    return this.warningLightMaterial.emissiveIntensity;
  }

  /** Slot indices of one prop kind currently owned by a building (empty if it has none). */
  slotsFor(buildingId: number, kind: PropKind): readonly number[] {
    return this.buildingSlots.get(buildingId)?.[kind] ?? [];
  }

  getMatrix(kind: PropKind, slot: number, out: THREE.Matrix4): void {
    this.pools[kind].getMatrixAt(slot, out);
  }

  getColor(kind: PropKind, slot: number, out: THREE.Color): void {
    this.pools[kind].getColorAt(slot, out);
  }

  instanceCount(kind: PropKind): number {
    return this.pools[kind].instanceCount();
  }

  private place(
    kind: PropKind,
    worldX: number,
    worldY: number,
    worldZ: number,
    rotation: 0 | 1 | 2 | 3,
    size: PropSize,
    colorHex: number,
    tint: readonly [number, number, number],
  ): number {
    const pool = this.pools[kind];
    const slot = pool.allocate();

    _position.set(worldX, worldY, worldZ);
    _quaternion.setFromAxisAngle(_yAxis, rotation * (Math.PI / 2));
    _scale.set(size.w, size.h, size.d);
    _matrix.compose(_position, _quaternion, _scale);
    pool.setMatrixAt(slot, _matrix);

    _color.setHex(colorHex);
    _color.r *= tint[0];
    _color.g *= tint[1];
    _color.b *= tint[2];
    pool.setColorAt(slot, _color);

    return slot;
  }

  private placeWarningLight(worldX: number, worldY: number, worldZ: number): number {
    const pool = this.pools.warningLight;
    const slot = pool.allocate();
    _position.set(worldX, worldY, worldZ);
    _scale.set(WARNING_LIGHT_DIAMETER, WARNING_LIGHT_DIAMETER, WARNING_LIGHT_DIAMETER);
    _matrix.compose(_position, _identityQuat, _scale);
    pool.setMatrixAt(slot, _matrix);
    return slot;
  }

  private applyOne(building: BuildingInstance): void {
    this.freeBuilding(building.id);

    const entry = this.catalogById.get(building.catalogId);
    if (!entry) return;

    const { boxes } = computeSetbacks(entry, building.id);
    const topBox = boxes[boxes.length - 1]!;
    const { floors } = deriveFacadeParams(entry, building.id);

    const heightScale =
      building.state === BuildingState.Constructing ? CONSTRUCTING_MASSING_HEIGHT_SCALE : 1;
    const tint = massingLifecycleTint(building.state);

    const centerX = (building.x + entry.footprint.w / 2) * TILE_METERS;
    const centerZ = (building.z + entry.footprint.d / 2) * TILE_METERS;
    const groundY = this.heightAt(centerX, centerZ);
    const roofY = groundY + (topBox.yOffset + topBox.h) * heightScale;

    const slots = emptySlots();

    // --- vent / AC boxes: count scales with top-box roof area ---
    const count = computeRoofPropCount(roofAreaTiles(topBox), building.id);
    const kind: PropKind = floors >= MIN_FLOORS_FOR_AC ? 'ac' : 'vent';
    const size = kind === 'ac' ? AC_SIZE : VENT_SIZE;
    const color = kind === 'ac' ? AC_COLOR : VENT_COLOR;
    for (let i = 0; i < count; i++) {
      const local = computePropPlacement(topBox, building.id, i);
      const rotated = rotateLocalOffset(local.x, local.z, building.rotation);
      const slot = this.place(
        kind,
        centerX + rotated.x,
        roofY,
        centerZ + rotated.z,
        building.rotation,
        size,
        color,
        tint,
      );
      slots[kind].push(slot);
    }

    // --- occasional antenna (2+ floors only), warning light at its tip -----------
    if (floors >= MIN_FLOORS_FOR_AC && hasAntenna(building.id)) {
      const local = computePropPlacement(topBox, building.id, ANTENNA_PLACEMENT_INDEX);
      const rotated = rotateLocalOffset(local.x, local.z, building.rotation);
      const worldX = centerX + rotated.x;
      const worldZ = centerZ + rotated.z;

      slots.antenna.push(
        this.place(
          'antenna',
          worldX,
          roofY,
          worldZ,
          building.rotation,
          ANTENNA_SIZE,
          ANTENNA_COLOR,
          tint,
        ),
      );
      slots.warningLight.push(this.placeWarningLight(worldX, roofY + ANTENNA_SIZE.h, worldZ));
    }

    // --- industrial extras ---------------------------------------
    if (entry.category === 'ind') {
      if ((entry.level ?? 1) >= MIN_SMOKESTACK_LEVEL) {
        const local = computeCornerOffset(topBox, smokestackCorner(building.id));
        const rotated = rotateLocalOffset(local.x, local.z, building.rotation);
        const worldX = centerX + rotated.x;
        const worldZ = centerZ + rotated.z;

        slots.smokestack.push(
          this.place(
            'smokestack',
            worldX,
            roofY,
            worldZ,
            building.rotation,
            SMOKESTACK_SIZE,
            SMOKESTACK_COLOR,
            tint,
          ),
        );
        slots.warningLight.push(this.placeWarningLight(worldX, roofY + SMOKESTACK_SIZE.h, worldZ));
      }

      if (
        entry.footprint.w >= MIN_SILO_FOOTPRINT_TILES &&
        entry.footprint.d >= MIN_SILO_FOOTPRINT_TILES
      ) {
        for (const local of computeSiloClusterPlacements(topBox, building.id)) {
          const rotated = rotateLocalOffset(local.x, local.z, building.rotation);
          slots.silo.push(
            this.place(
              'silo',
              centerX + rotated.x,
              roofY,
              centerZ + rotated.z,
              building.rotation,
              SILO_SIZE,
              SILO_COLOR,
              tint,
            ),
          );
        }
      }
    }

    this.buildingSlots.set(building.id, slots);
  }

  private freeBuilding(buildingId: number): void {
    const slots = this.buildingSlots.get(buildingId);
    if (!slots) return;
    for (const kind of ALL_PROP_KINDS) {
      for (const slot of slots[kind]) this.pools[kind].free(slot);
    }
    this.buildingSlots.delete(buildingId);
  }
}
