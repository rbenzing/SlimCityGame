/**
 * House kit for the residential HOUSE archetypes (detached single-family =
 * ResLow, attached rows = ResMediumRow). The base BuildingInstancer still draws
 * each body box with its facade shader; this layers the details that make a
 * home read as a home instead of a flat-topped office box:
 *   - a pitched GABLE ROOF capping every detached/row home;
 *   - for larger detached lots (2x3+), an attached GARAGE box on the road-
 *     facing side plus a DRIVEWAY strip running out to the street;
 *   - smaller 2x2 homes get the roof but no garage/driveway.
 * Apartments, towers, and mixed-use (ResMedium/ResHigh/Mixed) keep their flat
 * roofs. Anything below 2x2 never zones a home in the first place (catalog).
 *
 * Mirrors massing.ts / props.ts: InstancedSlotPools, a per-building slot map,
 * fed the same BuildingDelta stream, night-tinted through the same
 * MeshStandardNodeMaterial colorNode mix (one shared night uniform across all
 * three kit pools). All geometry/placement is a PURE function of (entry,
 * buildingId[, roadAt]) — no Math.random, no Date.now — so a home's kit is
 * deterministic across reloads. `roadAt` (optional) orients the garage +
 * driveway toward the nearest street; without it, garage/driveway are skipped.
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
  ZoneType,
} from '../shared/types';
import { TILE_METERS, tileToWorld } from '../shared/constants';
import { maxHeightOverFootprint } from './footprint';
import {
  CONSTRUCTING_MASSING_HEIGHT_SCALE,
  footprintShrinkFor,
  InstancedSlotPool,
  massingLifecycleTint,
} from './massing';
import { sizeForKind, variantScaleForKind, VehicleKitPool } from './vehicles';

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
const HASH_SLOT_GARAGE_SIDE = 73;
const HASH_SLOT_CAR_VARIANT = 74;

const INITIAL_ROOF_CAPACITY = 64;
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

/** Roof-tile palette: terracotta, slate, weathered brown, charcoal, moss. */
const ROOF_PALETTE: readonly number[] = [0x9c5a3c, 0x6d7178, 0x7a5a44, 0x3f4247, 0x5b6b52];
/** Garage wall — a light warm render/stucco tone, distinct from the roof. */
const GARAGE_WALL_COLOR = 0xcfc7b6;
/** Driveway — plain concrete grey. */
const DRIVEWAY_COLOR = 0x8b9097;

/** A detached home is big enough for a garage + driveway once its lot is 2x3 (area >= 6 tiles); a 2x2 home stays garage-less. */
export function hasGarage(entry: BuildingCatalogEntry): boolean {
  return entry.zone === ZoneType.ResLow && entry.footprint.w * entry.footprint.d >= 6;
}

const GARAGE_WIDTH_METERS = 4.2;
const GARAGE_DEPTH_METERS = 5.5;
const GARAGE_HEIGHT_METERS = 2.6;
/** Driveway slab rides above the terrain overlays but below the road plate (0.15). */
const DRIVEWAY_Y_OFFSET = 0.1;
/**
 * Max conforming sub-quad size for the driveway slab: subdivided so the slab
 * follows the in-tile terrain curve instead of letting ground bulge through a
 * single flat quad (matches parked.ts / roadsmesh.ts's ~2 m cell target).
 */
const DRIVEWAY_CONFORM_CELL_M = 2;
/** How far out (tiles) to look for the street a garage faces. */
export const GARAGE_ROAD_SEARCH_TILES = 3;

// Resident's car, parked ON the driveway (homes never street-park — see
// parked.ts, which skips residential). A real vehicle-kit Car model
// (render/vehicles.ts), deterministic sedan/wagon/hatch variant per home.
const CAR_LENGTH_METERS = sizeForKind(VehicleKind.Car)[2];
/** Saturated body colors, picked per building — reads against the muted city. */
const CAR_PALETTE: readonly number[] = [
  0xd8433a, 0x2f6fd6, 0x1f9e8f, 0x3fae4a, 0xe8c93a, 0xe08a2e, 0xefefe8, 0x33383d,
];

/** Zones whose buildings get a pitched roof (detached homes + attached rows). */
export function isRoofedEntry(entry: BuildingCatalogEntry): boolean {
  return entry.zone === ZoneType.ResLow || entry.zone === ZoneType.ResMediumRow;
}

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
 * Nearest street the house fronts onto, as a unit tile direction from the
 * footprint center + the road tile hit (ring search out to
 * GARAGE_ROAD_SEARCH_TILES, deterministic N→E→S→W). null when no road is in
 * range (garage/driveway are then skipped). Pure given `roadAt`.
 */
export function nearestRoadFrontage(
  building: BuildingInstance,
  entry: BuildingCatalogEntry,
  roadAt: (x: number, z: number) => boolean,
): { fdx: number; fdz: number; roadX: number; roadZ: number } | null {
  const cx = building.x + Math.floor(entry.footprint.w / 2);
  const cz = building.z + Math.floor(entry.footprint.d / 2);
  for (let r = 1; r <= GARAGE_ROAD_SEARCH_TILES; r += 1) {
    const candidates: ReadonlyArray<readonly [number, number]> = [
      [cx, cz - r],
      [cx + r, cz],
      [cx, cz + r],
      [cx - r, cz],
    ];
    for (const [rx, rz] of candidates) {
      if (roadAt(rx, rz))
        return { fdx: Math.sign(rx - cx), fdz: Math.sign(rz - cz), roadX: rx, roadZ: rz };
    }
  }
  return null;
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

/** Base-anchored unit box (origin at the base center) for the garage. */
function buildGarageGeometry(): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.translate(0, 0.5, 0);
  return geometry;
}

/**
 * Terrain-conforming driveway slab: the axis-aligned rect subdivided to
 * <= DRIVEWAY_CONFORM_CELL_M cells, each corner sampled through heightAt and
 * split on the terrain PlaneGeometry's own (x0,z1)-(x1,z0) diagonal, so the
 * slab rides a constant offset above the rendered ground instead of a flat
 * single-sample plane the terrain can bulge through (see render/zonegrid.ts).
 */
function buildConformingDrivewayGeometry(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  heightAt: (x: number, z: number) => number,
  color: THREE.Color,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const nx = Math.max(1, Math.ceil((x1 - x0) / DRIVEWAY_CONFORM_CELL_M));
  const nz = Math.max(1, Math.ceil((z1 - z0) / DRIVEWAY_CONFORM_CELL_M));
  const stepX = (x1 - x0) / nx;
  const stepZ = (z1 - z0) / nz;
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const cx0 = x0 + ix * stepX;
      const cz0 = z0 + iz * stepZ;
      const cx1 = cx0 + stepX;
      const cz1 = cz0 + stepZ;
      const y00 = heightAt(cx0, cz0) + DRIVEWAY_Y_OFFSET;
      const y10 = heightAt(cx1, cz0) + DRIVEWAY_Y_OFFSET;
      const y11 = heightAt(cx1, cz1) + DRIVEWAY_Y_OFFSET;
      const y01 = heightAt(cx0, cz1) + DRIVEWAY_Y_OFFSET;
      positions.push(cx0, y00, cz0, cx0, y01, cz1, cx1, y10, cz0);
      positions.push(cx0, y01, cz1, cx1, y11, cz1, cx1, y10, cz0);
      for (let i = 0; i < 6; i++) colors.push(color.r, color.g, color.b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _identityQuat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();
const _yAxis = new THREE.Vector3(0, 1, 0);

interface HouseSlots {
  roof: number;
  garage: number | null;
  /** Whether this building owns a conforming driveway mesh (see drivewayMeshes). */
  driveway: boolean;
  car: number | null;
}

export class HouseRoofRenderer {
  private readonly scene: THREE.Scene;
  private readonly heightAt: (x: number, z: number) => number;
  private readonly roadAt: (x: number, z: number) => boolean;
  private readonly catalogById: Map<string, BuildingCatalogEntry>;
  private readonly nightFactorUniform = uniform(0);
  private readonly roofPool: InstancedSlotPool;
  private readonly garagePool: InstancedSlotPool;
  private readonly carPool: VehicleKitPool;
  // Driveways are per-building terrain-conforming meshes (not instanced
  // planes): a flat instance can't follow a slope, so ground bulged through.
  private readonly drivewayMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  private readonly drivewayMeshes = new Map<number, THREE.Mesh>();
  private readonly buildingSlots = new Map<number, HouseSlots>();

  constructor(
    scene: THREE.Scene,
    heightAt: (x: number, z: number) => number,
    catalog: BuildingCatalogEntry[],
    roadAt: (x: number, z: number) => boolean = () => false,
  ) {
    this.scene = scene;
    this.heightAt = heightAt;
    this.roadAt = roadAt;
    this.catalogById = new Map(catalog.map((entry) => [entry.id, entry]));
    // One shared night uniform drives both kit pools' colorNode mix, so a
    // house's roof and garage darken together with the body.
    this.roofPool = new InstancedSlotPool(
      scene,
      buildGableRoofGeometry(),
      this.kitMaterial(),
      INITIAL_ROOF_CAPACITY,
    );
    this.garagePool = new InstancedSlotPool(
      scene,
      buildGarageGeometry(),
      this.kitMaterial(),
      INITIAL_ROOF_CAPACITY,
    );
    // Cars are real vehicle-kit models, lit naturally (they darken with the
    // scene at night, like the lot-parked cars in parked.ts) — body-only
    // palette tint, lights off.
    this.carPool = new VehicleKitPool(scene, VehicleKind.Car, INITIAL_ROOF_CAPACITY);
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
    this.roofPool.commit();
    this.garagePool.commit();
    this.carPool.finalize();
  }

  /** 0 (day) .. 1 (night) — mixes the whole kit toward the same tint as the body. */
  setNightFactor(nightFactor: number): void {
    this.nightFactorUniform.value = Math.min(1, Math.max(0, nightFactor));
  }

  nightFactor(): number {
    return this.nightFactorUniform.value;
  }

  /** Roof slot index a building owns, or null if it has no pitched roof. For tests/introspection. */
  roofSlotFor(buildingId: number): number | null {
    return this.buildingSlots.get(buildingId)?.roof ?? null;
  }

  /** Garage slot index a building owns, or null if it has no garage. For tests/introspection. */
  garageSlotFor(buildingId: number): number | null {
    return this.buildingSlots.get(buildingId)?.garage ?? null;
  }

  /** Whether a building owns a driveway slab. For tests/introspection. */
  hasDriveway(buildingId: number): boolean {
    return this.buildingSlots.get(buildingId)?.driveway ?? false;
  }

  /** Vertex count of a building's conforming driveway slab (0 if it has none). */
  drivewayVertexCountFor(buildingId: number): number {
    const mesh = this.drivewayMeshes.get(buildingId);
    const pos = mesh?.geometry.getAttribute('position');
    return pos ? pos.count : 0;
  }

  getMatrix(slot: number, out: THREE.Matrix4): void {
    this.roofPool.getMatrixAt(slot, out);
  }

  getColor(slot: number, out: THREE.Color): void {
    this.roofPool.getColorAt(slot, out);
  }

  getGarageMatrix(slot: number, out: THREE.Matrix4): void {
    this.garagePool.getMatrixAt(slot, out);
  }

  instanceCount(): number {
    return this.roofPool.instanceCount();
  }

  garageCount(): number {
    return this.garagePool.instanceCount();
  }

  drivewayCount(): number {
    return this.drivewayMeshes.size;
  }

  carCount(): number {
    return this.carPool.usedSlots();
  }

  /** Driveway car slot a building owns, or null. For tests/introspection. */
  carSlotFor(buildingId: number): number | null {
    return this.buildingSlots.get(buildingId)?.car ?? null;
  }

  getCarMatrix(slot: number, out: THREE.Matrix4): void {
    this.carPool.mesh.getMatrixAt(slot, out);
  }

  private freeBuilding(buildingId: number): void {
    const drivewayMesh = this.drivewayMeshes.get(buildingId);
    if (drivewayMesh) {
      this.scene.remove(drivewayMesh);
      drivewayMesh.geometry.dispose();
      this.drivewayMeshes.delete(buildingId);
    }

    const slots = this.buildingSlots.get(buildingId);
    if (!slots) return;
    this.roofPool.free(slots.roof);
    if (slots.garage !== null) this.garagePool.free(slots.garage);
    if (slots.car !== null) this.carPool.free(slots.car);
    this.buildingSlots.delete(buildingId);
  }

  private applyOne(building: BuildingInstance): void {
    this.freeBuilding(building.id);

    const entry = this.catalogById.get(building.catalogId);
    if (!entry || !isRoofedEntry(entry)) return;

    const heightScale =
      building.state === BuildingState.Constructing ? CONSTRUCTING_MASSING_HEIGHT_SCALE : 1;
    const tint = massingLifecycleTint(building.state);

    // Full body box (what BuildingInstancer draws) — a house is a single mass,
    // so its roof spans the whole footprint. Base dims mirror the footprint
    // shrink so the kit sits flush.
    const shrink = footprintShrinkFor(entry);
    const baseW = entry.footprint.w * TILE_METERS * shrink;
    const baseD = entry.footprint.d * TILE_METERS * shrink;
    const centerX = (building.x + entry.footprint.w / 2) * TILE_METERS;
    const centerZ = (building.z + entry.footprint.d / 2) * TILE_METERS;
    // Match BuildingInstancer's footprint-max base so the roof sits flush on
    // the body on sloped lots (centre-only sampling floats/sinks the roof).
    const groundY = maxHeightOverFootprint(
      this.heightAt,
      building.x,
      building.z,
      entry.footprint.w,
      entry.footprint.d,
    );
    const eavesY = groundY + entry.height * heightScale; // body box top = ground + full height
    const rise = computeRoofRise(baseW, baseD, building.id) * heightScale;

    // --- roof ---------------------------------------------------------------
    const ridgeAlongZ = roofRidgeAlongZ(entry);
    const roofQuarter = building.rotation + (ridgeAlongZ ? 1 : 0);
    const roofSlot = this.roofPool.allocate();
    _position.set(centerX, eavesY, centerZ);
    _quaternion.setFromAxisAngle(_yAxis, roofQuarter * (Math.PI / 2));
    _scale.set(ridgeAlongZ ? baseD : baseW, rise, ridgeAlongZ ? baseW : baseD);
    _matrix.compose(_position, _quaternion, _scale);
    this.roofPool.setMatrixAt(roofSlot, _matrix);
    this.setTintedColor(this.roofPool, roofSlot, roofColorHex(building.id), tint);

    const slots: HouseSlots = { roof: roofSlot, garage: null, driveway: false, car: null };

    // --- garage + driveway (larger detached lots facing a street) -----------
    const frontage = hasGarage(entry) ? nearestRoadFrontage(building, entry, this.roadAt) : null;
    if (frontage) {
      this.placeGarageAndDriveway(building, entry, frontage, centerX, centerZ, tint, slots);
    }

    this.buildingSlots.set(building.id, slots);
  }

  /**
   * Attached garage tucked to one seeded side of the house's road-facing edge,
   * with a driveway strip running from its door out to the street. `frontDir`
   * is axis-aligned (the ring search only hits N/E/S/W), so both kits stay
   * axis-aligned — the garage's depth runs along the front direction and the
   * driveway spans from the garage door to the road tile's near edge.
   */
  private placeGarageAndDriveway(
    building: BuildingInstance,
    entry: BuildingCatalogEntry,
    frontage: { fdx: number; fdz: number; roadX: number; roadZ: number },
    centerX: number,
    centerZ: number,
    tint: readonly [number, number, number],
    slots: HouseSlots,
  ): void {
    const { fdx, fdz } = frontage;
    const alongX = fdx !== 0; // front direction runs along world X
    const houseHalfAlongFront =
      (alongX ? entry.footprint.w : entry.footprint.d) *
      TILE_METERS *
      0.5 *
      footprintShrinkFor(entry);
    const lateralLotHalf = (alongX ? entry.footprint.d : entry.footprint.w) * TILE_METERS * 0.5;

    const garageW = Math.min(GARAGE_WIDTH_METERS, 2 * lateralLotHalf - 2);
    const garageDepth = GARAGE_DEPTH_METERS;
    const side = hash1(building.id + HASH_SLOT_GARAGE_SIDE) < 0.5 ? 1 : -1;

    // Garage sits just ahead of the house front face, offset to one lateral side.
    const frontFace = houseHalfAlongFront; // distance from center to house front along the front axis
    const garageAlong = frontFace + garageDepth * 0.5 - 0.4; // slight overlap into the house
    const lateralOffset = Math.max(0, lateralLotHalf - garageW * 0.5 - 1) * side;

    const gx = centerX + (alongX ? fdx * garageAlong : lateralOffset);
    const gz = centerZ + (alongX ? lateralOffset : fdz * garageAlong);
    const gGround = this.heightAt(gx, gz);

    const garageSlot = this.garagePool.allocate();
    _position.set(gx, gGround, gz);
    // Box is base-anchored; depth runs along the front axis, width laterally.
    _scale.set(
      alongX ? garageDepth : garageW,
      GARAGE_HEIGHT_METERS,
      alongX ? garageW : garageDepth,
    );
    _matrix.compose(_position, _identityQuat, _scale);
    this.garagePool.setMatrixAt(garageSlot, _matrix);
    this.setTintedColor(this.garagePool, garageSlot, GARAGE_WALL_COLOR, tint);
    slots.garage = garageSlot;

    // Driveway: from the garage door out to the near edge of the road tile.
    const garageDoorAlong = garageAlong + garageDepth * 0.5;
    const roadCenterAlong = alongX
      ? tileToWorld(frontage.roadX) - centerX
      : tileToWorld(frontage.roadZ) - centerZ;
    const roadNearEdgeAlong = roadCenterAlong - Math.sign(roadCenterAlong) * (TILE_METERS * 0.5);
    const driveLength = Math.abs(roadNearEdgeAlong) - garageDoorAlong;
    if (driveLength > 0.5) {
      const driveMidAlong = garageDoorAlong + driveLength * 0.5;
      const dxw = centerX + (alongX ? fdx * driveMidAlong : lateralOffset);
      const dzw = centerZ + (alongX ? lateralOffset : fdz * driveMidAlong);
      const halfX = (alongX ? driveLength : garageW) / 2;
      const halfZ = (alongX ? garageW : driveLength) / 2;
      _color.setHex(DRIVEWAY_COLOR);
      _color.r *= tint[0];
      _color.g *= tint[1];
      _color.b *= tint[2];
      const drivewayMesh = new THREE.Mesh(
        buildConformingDrivewayGeometry(
          dxw - halfX,
          dzw - halfZ,
          dxw + halfX,
          dzw + halfZ,
          this.heightAt,
          _color,
        ),
        this.drivewayMaterial,
      );
      drivewayMesh.receiveShadow = true;
      this.scene.add(drivewayMesh);
      this.drivewayMeshes.set(building.id, drivewayMesh);
      slots.driveway = true;

      // The resident's car, parked ON the driveway slab near the garage door,
      // nose (+Z on the kit geometry) pulled in toward the garage. (Active
      // homes only — a constructing/abandoned home shows no car.)
      if (building.state === BuildingState.Active && driveLength >= CAR_LENGTH_METERS * 0.6) {
        const carAlong = garageDoorAlong + Math.min(CAR_LENGTH_METERS * 0.6, driveLength * 0.5);
        const cxw = centerX + (alongX ? fdx * carAlong : lateralOffset);
        const czw = centerZ + (alongX ? lateralOffset : fdz * carAlong);
        const carSlot = this.carPool.allocate();

        const size = sizeForKind(VehicleKind.Car);
        const variantIdx = Math.floor(hash1(building.id + HASH_SLOT_CAR_VARIANT) * 3);
        const variant = variantScaleForKind(VehicleKind.Car, variantIdx);
        const sy = size[1] * variant[1];

        // Kit geometry is a unit cube with its base at y=-0.5: scale sets real
        // meters and the center rides at the driveway surface + half height.
        _position.set(cxw, this.heightAt(cxw, czw) + DRIVEWAY_Y_OFFSET + sy / 2, czw);
        _quaternion.setFromAxisAngle(_yAxis, Math.atan2(-fdx, -fdz)); // nose toward the garage
        _scale.set(size[0] * variant[0], sy, size[2] * variant[2]);
        _matrix.compose(_position, _quaternion, _scale);
        this.carPool.mesh.setMatrixAt(carSlot, _matrix);
        const ci = Math.floor(hash1(building.id + HASH_SLOT_GARAGE_SIDE * 2) * CAR_PALETTE.length);
        _color.setHex(CAR_PALETTE[Math.min(CAR_PALETTE.length - 1, ci)]!);
        this.carPool.mesh.setColorAt(carSlot, _color);
        slots.car = carSlot;
      }
    }
  }

  private setTintedColor(
    pool: InstancedSlotPool,
    slot: number,
    hex: number,
    tint: readonly [number, number, number],
  ): void {
    _color.setHex(hex);
    _color.r *= tint[0];
    _color.g *= tint[1];
    _color.b *= tint[2];
    pool.setColorAt(slot, _color);
  }
}
