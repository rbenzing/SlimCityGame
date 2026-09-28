/**
 * House kit for the residential HOUSE archetypes (detached single-family =
 * ResLow, attached rows = ResMediumRow). The base BuildingInstancer still draws
 * each body box with its facade shader; this stands up everything else that
 * makes a home read as a home, on the lot plan houselot.ts lays out from the
 * street the home fronts:
 *   - a pitched GABLE ROOF over the body;
 *   - what each drive ends at — a carport, an attached or detached garage, a
 *     garage door in a row's facade — and the resident's car on the drive;
 *   - a front door on the street-facing wall;
 *   - the yard: fence, above-ground pool, trampoline, grill, bushes and trees.
 * The drive, path, patio and lawn are ground surfaces and belong to lots.ts.
 *
 * Every repeated part is an InstancedSlotPool, fed the same BuildingDelta
 * stream as the other building renderers. The roof, garage, carport and doors
 * share the body's night tint (one uniform, the same colorNode mix as the
 * massing tiers); the yard parts, the fence and the cars are lit like any
 * other prop. Everything is a pure function of (entry, building, streets) — no
 * Math.random, no Date.now — so a home's kit is the same on every load.
 */
import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { mix, uniform, vec3 } from 'three/tsl';
import {
  BuildingCatalogEntry,
  BuildingDelta,
  BuildingInstance,
  BuildingState,
  VehicleKind,
} from '../shared/types';
import { maxHeightOverFootprint } from './footprint';
import {
  CONSTRUCTING_MASSING_HEIGHT_SCALE,
  InstancedSlotPool,
  massingLifecycleTint,
} from './massing';
import { isHouseEntry } from './archetypes';
import {
  sizeForKind,
  variantScaleForKind,
  VehicleKitPool,
  VEHICLE_PALETTE_HEX,
} from './vehicles';
import { materialHex, rgb255ToHex, SATURATED } from './palette';
import { NO_STREETS, type StreetLookup } from './frontage';
import {
  CARPORT_DEPTH_M,
  CARPORT_WIDTH_M,
  DOOR_WIDTH_M,
  POOL_RADIUS_M,
  TRAMPOLINE_RADIUS_M,
  inwardYaw,
  lotToWorld,
  planHouseLot,
  type HouseLotPlan,
  type LotRect,
} from './houselot';
import { DRIVE_Y_OFFSET } from './lots';
import {
  buildBroadleafGeometry,
  buildShrubGeometry,
  mergeGeometryParts,
  paintVertexColor,
} from './trees';

// Same avalanche hash every render/*.ts keeps a local copy of.
function hash1(n: number): number {
  let h = n >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

const HASH_SLOT_ROOF_PITCH = 71;
const HASH_SLOT_ROOF_COLOR = 72;
const HASH_SLOT_CAR_COLOR = 73;
const HASH_SLOT_CAR_VARIANT = 74;

const INITIAL_KIT_CAPACITY = 64;
/**
 * Night tint the kit multiplies toward at full night. Matches the BODY's tint
 * (buildings.ts NIGHT_BODY_TINT, relative luminance ~0.377 — above the 0.3
 * "still recognizable" floor), NOT the massing tiers' much darker [0.11,0.13,
 * 0.19]: those tiers sit hidden inside the body box so their near-black night
 * value never shows, but the roof/garage are exposed — at the dark value the
 * house shape vanishes at night and reads as a flat glowing box. Re-declared
 * locally per this repo's "each render file keeps its own copy of shared
 * visual constants" convention.
 */
export const NIGHT_ROOF_TINT: readonly [number, number, number] = [0.34, 0.38, 0.46];

/** Roof rise as a fraction of the SHORTER base span (sets the pitch angle), before per-building jitter. */
const ROOF_PITCH_FRACTION = 0.42;
/** Per-building rise jitter around the base pitch, so a street of homes isn't one uniform angle. */
const ROOF_PITCH_JITTER = 0.28;
/** A gable roof never rises more than this share of the base — keeps a 1x6 terrace from spiking. */
const ROOF_MAX_RISE_METERS = 4.5;

/**
 * Roof-tile palette, spread across the calibrated range rather than bunched at
 * its dark end: pale, mid, warm, cool, dark. The ceiling is a ceiling, not a
 * target — five roofs all picked from 47..75 turn a street of houses into one
 * dark mass, which is a worse picture than the over-bright one it replaced.
 */
const ROOF_PALETTE: readonly number[] = [
  materialHex('whiteBrick'), // pale
  materialHex('stoneBrick'), // mid
  materialHex('clayRoof'), // warm
  materialHex('metalPlates'), // cool
  materialHex('slateRoof'), // dark
];
/** Garage wall — plaster, distinct from the roof. */
const GARAGE_WALL_COLOR = materialHex('whitePlaster');
const CARPORT_COLOR = materialHex('brightWood');
const FRONT_DOOR_COLOR = materialHex('darkWood');
const GARAGE_DOOR_COLOR = materialHex('metalPlates');
const FENCE_COLOR: Readonly<Record<HouseLotPlan['yard']['fenceColour'], number>> = {
  // The palest of each: a fence is a thin board seen mostly edge-on or in its
  // own shade, and a mid tone read as a black line round every garden.
  wood: materialHex('brightestWood'),
  white: materialHex('whiteBrick'),
};

export const GARAGE_HEIGHT_M = 2.6;
export const DOOR_HEIGHT_M = 2.1;
/** A door or a garage door stands this far proud of the wall it is set in. */
const PANEL_DEPTH_M = 0.06;
export const FENCE_HEIGHT_M = 1.6;
const FENCE_THICKNESS_M = 0.08;
/** A long fence run is cut into panels no longer than this, each seated on the ground under it. */
const FENCE_PANEL_MAX_M = 2.5;
const CARPORT_HEIGHT_M = 2.4;
const POOL_HEIGHT_M = 1.2;
const TRAMPOLINE_MAT_HEIGHT_M = 0.9;
/** The broadleaf kit's canopy is a mature tree at scale 1; a yard tree is scaled from that. */
const YARD_TREE_SCALE = 0.8;

/** A resident's car is painted from the same list as every other car. */
const CAR_PALETTE: readonly number[] = VEHICLE_PALETTE_HEX;

/** Ridge runs along the LONGER footprint axis (a 1xN row house ridges down the row, not across it). Pure. */
export function roofRidgeAlongZ(entry: BuildingCatalogEntry): boolean {
  return entry.footprint.d > entry.footprint.w;
}

/** Deterministic roof rise (meters) for a building, from the shorter base span + a per-id jitter. Pure. */
export function computeRoofRise(baseW: number, baseD: number, buildingId: number): number {
  const shorter = Math.min(baseW, baseD);
  const jitter = 1 + (hash1(buildingId + HASH_SLOT_ROOF_PITCH) * 2 - 1) * ROOF_PITCH_JITTER;
  return Math.min(ROOF_MAX_RISE_METERS, shorter * ROOF_PITCH_FRACTION * jitter);
}

/** Deterministic roof color hex for a building. Pure. */
export function roofColorHex(buildingId: number): number {
  const i = Math.floor(hash1(buildingId + HASH_SLOT_ROOF_COLOR) * ROOF_PALETTE.length);
  return ROOF_PALETTE[Math.min(ROOF_PALETTE.length - 1, i)]!;
}

/**
 * A base-anchored (y=0 at the eaves, y=1 at the ridge) unit gable-roof prism:
 * a 1x1 footprint in XZ with the ridge running along local +X. Two sloped
 * faces + two triangular gable ends; no bottom face (hidden by the body box).
 */
export function buildGableRoofGeometry(): THREE.BufferGeometry {
  const A: [number, number, number] = [-0.5, 0, -0.5];
  const B: [number, number, number] = [0.5, 0, -0.5];
  const C: [number, number, number] = [0.5, 0, 0.5];
  const D: [number, number, number] = [-0.5, 0, 0.5];
  const R0: [number, number, number] = [-0.5, 1, 0];
  const R1: [number, number, number] = [0.5, 1, 0];
  const tris: [number, number, number][][] = [
    [D, C, R1],
    [D, R1, R0], // +z slope
    [A, R0, R1],
    [A, R1, B], // -z slope
    [A, D, R0], // -x gable
    [B, R1, C], // +x gable
  ];
  const positions: number[] = [];
  for (const tri of tris) for (const v of tri) positions.push(v[0], v[1], v[2]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Base-anchored unit box (origin at the base center): garages, doors, fence panels. */
function buildUnitBoxGeometry(): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.translate(0, 0.5, 0);
  return geometry;
}

/** A carport in metres, base-anchored: four posts and a flat roof, its width along local X. */
export function buildCarportGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const post = 0.12;
  const hx = CARPORT_WIDTH_M / 2 - 0.15;
  const hz = CARPORT_DEPTH_M / 2 - 0.15;
  for (const [x, z] of [
    [-hx, -hz],
    [hx, -hz],
    [-hx, hz],
    [hx, hz],
  ] as const) {
    const p = new THREE.BoxGeometry(post, CARPORT_HEIGHT_M, post);
    p.translate(x, CARPORT_HEIGHT_M / 2, z);
    parts.push(paintVertexColor(p, 0xffffff));
  }
  const roof = new THREE.BoxGeometry(CARPORT_WIDTH_M, 0.12, CARPORT_DEPTH_M);
  roof.translate(0, CARPORT_HEIGHT_M, 0);
  parts.push(paintVertexColor(roof, 0xffffff));
  return mergeGeometryParts(parts);
}

/**
 * An above-ground pool, base-anchored: a round wall, and the water inside its
 * rim. The water is a disc laid just over the wall's closed top, a hand's width
 * in from its edge, so the rim reads as a ring round it from above.
 */
export function buildPoolGeometry(): THREE.BufferGeometry {
  const wall = new THREE.CylinderGeometry(POOL_RADIUS_M, POOL_RADIUS_M, POOL_HEIGHT_M, 20);
  wall.translate(0, POOL_HEIGHT_M / 2, 0);
  const water = new THREE.CylinderGeometry(POOL_RADIUS_M - 0.15, POOL_RADIUS_M - 0.15, 0.02, 20);
  water.translate(0, POOL_HEIGHT_M + 0.01, 0);
  return mergeGeometryParts([
    paintVertexColor(wall, materialHex('bluePlaster')),
    paintVertexColor(water, rgb255ToHex(SATURATED.cyan)),
  ]);
}

/** A round trampoline, base-anchored: six legs, a frame ring and the mat. */
export function buildTrampolineGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const frame = materialHex('metalPlates');
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const leg = new THREE.CylinderGeometry(0.04, 0.04, TRAMPOLINE_MAT_HEIGHT_M, 5);
    leg.translate(
      Math.cos(a) * (TRAMPOLINE_RADIUS_M - 0.1),
      TRAMPOLINE_MAT_HEIGHT_M / 2,
      Math.sin(a) * (TRAMPOLINE_RADIUS_M - 0.1),
    );
    parts.push(paintVertexColor(leg, frame));
  }
  const ring = new THREE.CylinderGeometry(TRAMPOLINE_RADIUS_M, TRAMPOLINE_RADIUS_M, 0.08, 20, 1, true);
  ring.translate(0, TRAMPOLINE_MAT_HEIGHT_M, 0);
  parts.push(paintVertexColor(ring, frame));
  const mat = new THREE.CylinderGeometry(
    TRAMPOLINE_RADIUS_M - 0.15,
    TRAMPOLINE_RADIUS_M - 0.15,
    0.02,
    20,
  );
  mat.translate(0, TRAMPOLINE_MAT_HEIGHT_M - 0.02, 0);
  parts.push(paintVertexColor(mat, materialHex('coal')));
  return mergeGeometryParts(parts);
}

/** A kettle-style grill on four legs, base-anchored: 0.6 × 0.5 m, 1 m to the top of its lid. */
export function buildGrillGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const legColour = materialHex('metalPlates');
  for (const [x, z] of [
    [-0.25, -0.2],
    [0.25, -0.2],
    [-0.25, 0.2],
    [0.25, 0.2],
  ] as const) {
    const leg = new THREE.BoxGeometry(0.04, 0.6, 0.04);
    leg.translate(x, 0.3, z);
    parts.push(paintVertexColor(leg, legColour));
  }
  const body = new THREE.BoxGeometry(0.6, 0.25, 0.5);
  body.translate(0, 0.72, 0);
  parts.push(paintVertexColor(body, materialHex('darkBitumen')));
  const lid = new THREE.BoxGeometry(0.58, 0.15, 0.48);
  lid.translate(0, 0.92, 0);
  parts.push(paintVertexColor(lid, materialHex('coal')));
  return mergeGeometryParts(parts);
}

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();
const _yAxis = new THREE.Vector3(0, 1, 0);

/** The parts of the kit, one pool each. */
export type HousePart =
  | 'roof'
  | 'garage'
  | 'carport'
  | 'door'
  | 'fence'
  | 'pool'
  | 'trampoline'
  | 'grill'
  | 'bush'
  | 'tree';

interface OwnedSlot {
  part: HousePart;
  slot: number;
}

interface HouseSlots {
  parts: OwnedSlot[];
  cars: number[];
}

/** A frame rectangle as a world-space, axis-aligned box: its centre and its X and Z extents. */
function worldBox(plan: HouseLotPlan, r: LotRect): { x: number; z: number; sx: number; sz: number } {
  const a = lotToWorld(plan.frame, r.u0, r.v0);
  const b = lotToWorld(plan.frame, r.u1, r.v1);
  return {
    x: (a.x + b.x) / 2,
    z: (a.z + b.z) / 2,
    sx: Math.abs(a.x - b.x),
    sz: Math.abs(a.z - b.z),
  };
}

export class HouseRoofRenderer {
  private readonly heightAt: (x: number, z: number) => number;
  private readonly roadAt: (x: number, z: number) => boolean;
  private readonly street: StreetLookup;
  private readonly catalogById: Map<string, BuildingCatalogEntry>;
  private readonly nightFactorUniform = uniform(0);
  private readonly pools: Record<HousePart, InstancedSlotPool>;
  private readonly carPool: VehicleKitPool;
  private readonly buildingSlots = new Map<number, HouseSlots>();

  constructor(
    scene: THREE.Scene,
    heightAt: (x: number, z: number) => number,
    catalog: BuildingCatalogEntry[],
    roadAt: (x: number, z: number) => boolean = () => false,
    street: StreetLookup = NO_STREETS,
  ) {
    this.heightAt = heightAt;
    this.roadAt = roadAt;
    this.street = street;
    this.catalogById = new Map(catalog.map((entry) => [entry.id, entry]));
    // The structure shares one night uniform, so a house's roof, garage and
    // doors darken together with the body.
    const kit = (geometry: THREE.BufferGeometry): InstancedSlotPool =>
      new InstancedSlotPool(scene, geometry, this.kitMaterial(), INITIAL_KIT_CAPACITY);
    // Yard parts carry their colours in the geometry and are lit like trees.
    const yardMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const yard = (geometry: THREE.BufferGeometry): InstancedSlotPool =>
      new InstancedSlotPool(scene, geometry, yardMaterial, INITIAL_KIT_CAPACITY);
    this.pools = {
      roof: kit(buildGableRoofGeometry()),
      garage: kit(buildUnitBoxGeometry()),
      carport: kit(buildCarportGeometry()),
      door: kit(buildUnitBoxGeometry()),
      fence: new InstancedSlotPool(
        scene,
        buildUnitBoxGeometry(),
        new THREE.MeshLambertMaterial(),
        INITIAL_KIT_CAPACITY,
      ),
      pool: yard(buildPoolGeometry()),
      trampoline: yard(buildTrampolineGeometry()),
      grill: yard(buildGrillGeometry()),
      bush: yard(buildShrubGeometry()),
      tree: yard(buildBroadleafGeometry()),
    };
    // Cars are real vehicle-kit models, lit naturally (they darken with the
    // scene at night, like the lot-parked cars in parked.ts) — body-only
    // palette tint, lights off.
    this.carPool = new VehicleKitPool(scene, VehicleKind.Car, INITIAL_KIT_CAPACITY);
  }

  private kitMaterial(): MeshStandardNodeMaterial {
    const material = new MeshStandardNodeMaterial({ roughness: 1, metalness: 0 });
    material.colorNode = mix(vec3(1, 1, 1), vec3(...NIGHT_ROOF_TINT), this.nightFactorUniform);
    return material;
  }

  /** Consumes one BuildingDelta: removed ids free their kit; added/updated recompute theirs. */
  apply(delta: BuildingDelta): void {
    for (const id of delta.removed) this.freeBuilding(id);
    for (const building of delta.added) this.applyOne(building);
    for (const building of delta.updated) this.applyOne(building);
    for (const pool of Object.values(this.pools)) pool.commit();
    this.carPool.finalize();
  }

  /** 0 (day) .. 1 (night) — mixes the structure toward the same tint as the body. */
  setNightFactor(nightFactor: number): void {
    this.nightFactorUniform.value = Math.min(1, Math.max(0, nightFactor));
  }

  nightFactor(): number {
    return this.nightFactorUniform.value;
  }

  /** Slots a building owns in one part's pool. For tests/introspection. */
  slotsFor(buildingId: number, part: HousePart): number[] {
    return (this.buildingSlots.get(buildingId)?.parts ?? [])
      .filter((p) => p.part === part)
      .map((p) => p.slot);
  }

  /** How many instances one part's pool holds. For tests/introspection. */
  partCount(part: HousePart): number {
    return this.pools[part].instanceCount();
  }

  getPartMatrix(part: HousePart, slot: number, out: THREE.Matrix4): void {
    this.pools[part].getMatrixAt(slot, out);
  }

  getPartColor(part: HousePart, slot: number, out: THREE.Color): void {
    this.pools[part].getColorAt(slot, out);
  }

  carCount(): number {
    return this.carPool.usedSlots();
  }

  /** Car slots a building owns, one per drive while it is Active. For tests/introspection. */
  carSlotsFor(buildingId: number): number[] {
    return this.buildingSlots.get(buildingId)?.cars ?? [];
  }

  getCarMatrix(slot: number, out: THREE.Matrix4): void {
    this.carPool.mesh.getMatrixAt(slot, out);
  }

  private freeBuilding(buildingId: number): void {
    const slots = this.buildingSlots.get(buildingId);
    if (!slots) return;
    for (const { part, slot } of slots.parts) this.pools[part].free(slot);
    for (const slot of slots.cars) this.carPool.free(slot);
    this.buildingSlots.delete(buildingId);
  }

  private applyOne(building: BuildingInstance): void {
    this.freeBuilding(building.id);

    const entry = this.catalogById.get(building.catalogId);
    if (!entry || !isHouseEntry(entry)) return;
    const plan = planHouseLot(building, entry, this.roadAt, this.street);
    if (!plan) return;

    const slots: HouseSlots = { parts: [], cars: [] };
    this.buildingSlots.set(building.id, slots);
    const tint = massingLifecycleTint(building.state);
    const heightScale =
      building.state === BuildingState.Constructing ? CONSTRUCTING_MASSING_HEIGHT_SCALE : 1;
    // The body's own base: the highest ground under the footprint, which is
    // where BuildingInstancer seats it.
    const bodyGround = maxHeightOverFootprint(
      this.heightAt,
      building.x,
      building.z,
      entry.footprint.w,
      entry.footprint.d,
    );

    const put = (
      part: HousePart,
      x: number,
      y: number,
      z: number,
      yaw: number,
      sx: number,
      sy: number,
      sz: number,
      hex: number,
      tinted: boolean,
    ): void => {
      const pool = this.pools[part];
      const slot = pool.allocate();
      _position.set(x, y, z);
      _quaternion.setFromAxisAngle(_yAxis, yaw);
      _scale.set(sx, sy, sz);
      _matrix.compose(_position, _quaternion, _scale);
      pool.setMatrixAt(slot, _matrix);
      _color.setHex(hex);
      if (tinted) {
        _color.r *= tint[0];
        _color.g *= tint[1];
        _color.b *= tint[2];
      }
      pool.setColorAt(slot, _color);
      slots.parts.push({ part, slot });
    };

    // --- roof ---------------------------------------------------------------
    const body = worldBox(plan, plan.body);
    const eavesY = bodyGround + entry.height * heightScale;
    const rise = computeRoofRise(body.sx, body.sz, building.id) * heightScale;
    const ridgeAlongZ = body.sz > body.sx;
    put(
      'roof',
      body.x,
      eavesY,
      body.z,
      ridgeAlongZ ? Math.PI / 2 : 0,
      ridgeAlongZ ? body.sz : body.sx,
      rise,
      ridgeAlongZ ? body.sx : body.sz,
      roofColorHex(building.id),
      true,
    );

    // --- doors, and what each drive ends at ---------------------------------
    for (const door of plan.doors) {
      const b = worldBox(plan, {
        u0: door.u - DOOR_WIDTH_M / 2,
        u1: door.u + DOOR_WIDTH_M / 2,
        v0: door.v - PANEL_DEPTH_M,
        v1: door.v,
      });
      put('door', b.x, bodyGround, b.z, 0, b.sx, DOOR_HEIGHT_M, b.sz, FRONT_DOOR_COLOR, true);
    }
    const carportYaw = plan.frame.alongX ? 0 : Math.PI / 2;
    for (const drive of plan.drives) {
      let doorGround = bodyGround;
      if (drive.coverRect && (drive.cover === 'garage' || drive.cover === 'detachedGarage')) {
        const g = worldBox(plan, drive.coverRect);
        doorGround = this.heightAt(g.x, g.z);
        put('garage', g.x, doorGround, g.z, 0, g.sx, GARAGE_HEIGHT_M, g.sz, GARAGE_WALL_COLOR, true);
      } else if (drive.coverRect && drive.cover === 'carport') {
        const c = worldBox(plan, drive.coverRect);
        put('carport', c.x, this.heightAt(c.x, c.z), c.z, carportYaw, 1, 1, 1, CARPORT_COLOR, true);
      }
      if (drive.garageDoor) {
        const d = drive.garageDoor;
        const b = worldBox(plan, { u0: d.u0, u1: d.u1, v0: d.v - PANEL_DEPTH_M, v1: d.v });
        put('door', b.x, doorGround, b.z, 0, b.sx, DOOR_HEIGHT_M, b.sz, GARAGE_DOOR_COLOR, true);
      }
    }

    // --- the resident's car, one per drive ----------------------------------
    if (building.state === BuildingState.Active) {
      const size = sizeForKind(VehicleKind.Car);
      plan.drives.forEach((drive, i) => {
        const at = lotToWorld(plan.frame, drive.car.u, drive.car.v);
        const seed = building.id * 7 + i;
        const variant = variantScaleForKind(
          VehicleKind.Car,
          Math.floor(hash1(seed + HASH_SLOT_CAR_VARIANT) * 3),
        );
        const sy = size[1] * variant[1];
        const slot = this.carPool.allocate();
        // Kit geometry is a unit cube with its base at y=-0.5: scale sets real
        // meters and the center rides at the drive surface + half height.
        _position.set(at.x, this.heightAt(at.x, at.z) + DRIVE_Y_OFFSET + sy / 2, at.z);
        _quaternion.setFromAxisAngle(_yAxis, inwardYaw(plan.frame));
        _scale.set(size[0] * variant[0], sy, size[2] * variant[2]);
        _matrix.compose(_position, _quaternion, _scale);
        this.carPool.mesh.setMatrixAt(slot, _matrix);
        const ci = Math.floor(hash1(seed + HASH_SLOT_CAR_COLOR) * CAR_PALETTE.length);
        _color.setHex(CAR_PALETTE[Math.min(CAR_PALETTE.length - 1, ci)]!);
        this.carPool.mesh.setColorAt(slot, _color);
        slots.cars.push(slot);
      });
    }

    // --- the yard -----------------------------------------------------------
    // Nobody lives in a home still going up; an abandoned one keeps what
    // stands in the ground and loses what its family took with them.
    if (building.state === BuildingState.Constructing) return;
    const { yard } = plan;
    const fenceHex = FENCE_COLOR[yard.fenceColour];
    for (const run of yard.fence) {
      const alongU = run.v0 === run.v1;
      const length = alongU ? run.u1 - run.u0 : run.v1 - run.v0;
      const panels = Math.max(1, Math.ceil(length / FENCE_PANEL_MAX_M));
      for (let p = 0; p < panels; p++) {
        const a = (alongU ? run.u0 : run.v0) + (p / panels) * length;
        const b = (alongU ? run.u0 : run.v0) + ((p + 1) / panels) * length;
        const t = FENCE_THICKNESS_M / 2;
        const rect = alongU
          ? { u0: a, u1: b, v0: run.v0 - t, v1: run.v0 + t }
          : { u0: run.u0 - t, u1: run.u0 + t, v0: a, v1: b };
        const f = worldBox(plan, rect);
        put('fence', f.x, this.heightAt(f.x, f.z), f.z, 0, f.sx, FENCE_HEIGHT_M, f.sz, fenceHex, false);
      }
    }
    const stand = (part: HousePart, u: number, v: number, scale: number, lift = 0): void => {
      const at = lotToWorld(plan.frame, u, v);
      put(part, at.x, this.heightAt(at.x, at.z) + lift, at.z, 0, scale, scale, scale, 0xffffff, false);
    };
    for (const bush of yard.bushes) stand('bush', bush.u, bush.v, bush.scale);
    for (const tree of yard.trees) stand('tree', tree.u, tree.v, tree.scale * YARD_TREE_SCALE);
    if (building.state !== BuildingState.Active) return;
    if (yard.pool) stand('pool', yard.pool.u, yard.pool.v, 1);
    if (yard.trampoline) stand('trampoline', yard.trampoline.u, yard.trampoline.v, 1);
    for (const grill of yard.grills) stand('grill', grill.u, grill.v, 1, DRIVE_Y_OFFSET);
  }
}
