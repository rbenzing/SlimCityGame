/**
 * Parked cars & lot life: a static, deterministic occupancy
 * signal drawn along each Active building's road-facing footprint edge.
 * Cars are real vehicle-kit models (render/vehicles.ts geometries — wheels,
 * cabin, light quads, body-only palette tint) parked NOSE-IN, perpendicular
 * to the road, in painted parking bays on the lot's frontage apron.
 *
 * Coordinate conventions (matching the rest of src/render):
 *  - `heightAt(worldX, worldZ)` takes WORLD METERS and returns world height,
 *    same contract as trees.ts/lamps.ts.
 *  - `roadAt(tileX, tileZ)` takes TILE coordinates (integers) and answers
 *    "is this grid tile a road tile", same contract as world/grid.ts and
 *    world/roads.ts's tile-indexed helpers.
 *
 * Zero per-frame work: every mutation happens inside apply(BuildingDelta).
 */
import * as THREE from 'three';
import {
  BuildingCatalogEntry,
  BuildingDelta,
  BuildingInstance,
  BuildingState,
  VehicleKind,
} from '../shared/types';
import { TILE_METERS } from '../shared/constants';
import { sizeForKind, variantScaleForKind, VehicleKitPool } from './vehicles';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/** Lot category: commercial rows park customer cars, industrial rows mix in trucks. */
export type LotCategory = 'com' | 'ind';

/**
 * Center-to-center bay pitch along the edge, in tiles. A car is 1.8 m wide
 * (wagon variant unchanged in width), a box-truck 2.31 m — both pitches leave
 * a full walking gap between neighbors, so parked vehicles never touch.
 */
export const BAY_PITCH_TILES: Readonly<Record<LotCategory, number>> = {
  com: 0.1875, // 3.0 m car bays
  ind: 0.24, // 3.84 m truck bays
};

/**
 * Bay depth (how far the paved bay runs INWARD from the footprint edge, onto
 * the lot), in tiles. Deep enough that the longest vehicle parked
 * perpendicular sits fully inside the bay: 4.6 m wagon in a 5.3 m car bay,
 * 7 m box-truck in an 8.3 m truck bay.
 */
export const BAY_DEPTH_TILES: Readonly<Record<LotCategory, number>> = {
  com: 0.33,
  ind: 0.52,
};

/** Unpainted margin kept at each end of the bay row, in tiles. */
export const BAY_END_MARGIN_TILES = 0.06;

/** Max absolute per-car yaw jitter, radians — parked cars sit nearly straight in their bays. */
export const YAW_JITTER_MAX = 0.03;

/**
 * Curated ~10-color saturated palette: red, blue, teal, green, magenta, pink,
 * yellow, orange, white, charcoal — deliberate saturation contrast against
 * the desaturated city palette. Tints the kit body region only (cabin,
 * wheels and light quads keep their baked colors).
 */
export const CAR_PALETTE: readonly number[] = [
  0xd8433a, // red
  0x2f6fd6, // blue
  0x1f9e8f, // teal
  0x3fae4a, // green
  0xb0399c, // magenta
  0xe37fb0, // pink
  0xe8c93a, // yellow
  0xe08a2e, // orange
  0xefefe8, // white
  0x33383d, // charcoal
];

const NEAR_WHITE_STRIPE_COLOR: readonly [number, number, number] = [0.93, 0.93, 0.9];
const APRON_COLOR: readonly [number, number, number] = [0.6, 0.6, 0.58];

/** Apron rides above the terrain overlays but below the road plate (0.15). */
const APRON_Y_OFFSET = 0.12;
const STRIPE_LINE_Y_OFFSET = 0.135;
const STRIPE_LINE_HALF_WIDTH_M = 0.06;

/**
 * Max conforming sub-quad size: ground quads are subdivided so their surface
 * samples the in-tile terrain curve instead of just its corners (a single
 * 4-corner quad across a whole frontage lets a hill bulge straight through).
 * Matches roadsmesh.ts's 2 m adaptive cell target.
 */
const CONFORM_MAX_CELL_M = 2;

const INITIAL_CAR_CAPACITY = 64;

// ---------------------------------------------------------------------------
// Deterministic hashing (never Math.random/Date.now)
// ---------------------------------------------------------------------------

/** 32-bit avalanche mix of two integers (murmur3-style finalizer); pure & deterministic. */
function hash2(a: number, b: number): number {
  let h = (a ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ b, 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h >>> 0;
}

/** Deterministic palette index from (buildingId, stallIndex). */
export function stallColorIndex(buildingId: number, stallIndex: number): number {
  return hash2(buildingId, stallIndex * 2 + 1) % CAR_PALETTE.length;
}

/** Deterministic yaw jitter in [-YAW_JITTER_MAX, YAW_JITTER_MAX] from (buildingId, stallIndex). */
export function stallYawJitter(buildingId: number, stallIndex: number): number {
  const h = hash2(buildingId, stallIndex * 2);
  const frac = h / 0xffffffff; // [0,1]
  return (frac * 2 - 1) * YAW_JITTER_MAX;
}

/**
 * Deterministic vehicle kind for a stall: commercial lots park customer CARS;
 * industrial lots mix box-trucks/pickups with workers' cars (~40% cars).
 */
export function stallKind(category: LotCategory, buildingId: number, stallIndex: number): number {
  if (category === 'com') return VehicleKind.Car;
  return hash2(buildingId, stallIndex * 3 + 2) % 5 < 2 ? VehicleKind.Car : VehicleKind.Truck;
}

/** Deterministic kit silhouette variant (sedan/wagon/hatch, box-truck/pickup) for a stall. */
export function stallVariantIndex(buildingId: number, stallIndex: number, kind: number): number {
  const count = kind === VehicleKind.Truck ? 2 : 3;
  return hash2(buildingId, stallIndex * 5 + 4) % count;
}

// ---------------------------------------------------------------------------
// Road-facing edge selection (pure, testable without THREE/a scene)
// ---------------------------------------------------------------------------

export type Side = 'N' | 'E' | 'S' | 'W';

export interface RoadFacingEdge {
  side: Side;
  /** Length of the selected edge, in tiles (w for N/S, d for E/W). */
  edgeTiles: number;
}

function stripHasRoad(
  startX: number,
  startZ: number,
  length: number,
  axis: 'x' | 'z',
  roadAt: (x: number, z: number) => boolean,
): boolean {
  for (let i = 0; i < length; i++) {
    const tx = axis === 'x' ? startX + i : startX;
    const tz = axis === 'z' ? startZ + i : startZ;
    if (roadAt(tx, tz)) return true;
  }
  return false;
}

/**
 * Finds the building's road-facing footprint edge: the side
 * whose immediately-adjacent tile strip contains at least one road tile,
 * tie-broken N>E>S>W when more than one side qualifies (e.g. corner lots).
 * Returns null when no side is road-adjacent — callers park zero cars.
 */
export function findRoadFacingEdge(
  x: number,
  z: number,
  w: number,
  d: number,
  roadAt: (x: number, z: number) => boolean,
): RoadFacingEdge | null {
  if (w < 1 || d < 1) return null;

  if (stripHasRoad(x, z - 1, w, 'x', roadAt)) return { side: 'N', edgeTiles: w };
  if (stripHasRoad(x + w, z, d, 'z', roadAt)) return { side: 'E', edgeTiles: d };
  if (stripHasRoad(x, z + d, w, 'x', roadAt)) return { side: 'S', edgeTiles: w };
  if (stripHasRoad(x - 1, z, d, 'z', roadAt)) return { side: 'W', edgeTiles: d };
  return null;
}

// ---------------------------------------------------------------------------
// Stall count & placement (pure)
// ---------------------------------------------------------------------------

/** count = min(level + 1, floor((edgeTiles - 2*margin) / pitchTiles)). */
export function computeStallCount(level: number, edgeTiles: number, pitchTiles: number): number {
  const usable = edgeTiles - 2 * BAY_END_MARGIN_TILES;
  const maxByCapacity = Math.floor(usable / pitchTiles);
  return Math.max(0, Math.min(level + 1, maxByCapacity));
}

export interface StallPlacement {
  worldX: number;
  worldZ: number;
  /** Base facing yaw (radians) before per-car jitter; see EDGE_BASE_YAW. */
  baseYaw: number;
  /** Bay center's along-edge coordinate, meters from the edge start. */
  along: number;
}

/**
 * A side's local coordinate frame: `edgeStart` is the along-edge world
 * origin, `buildingLine` is the perpendicular world coordinate of the
 * building's own footprint edge, and `outwardSign`/`alongX` describe how
 * (along, depthTiles) map onto world (x, z). depthTiles = 0 sits exactly on
 * the building's edge line; positive depthTiles moves outward, toward the
 * road side.
 */
interface EdgeFrame {
  edgeStart: number;
  buildingLine: number;
  outwardSign: 1 | -1;
  alongX: boolean;
}

function edgeFrameFor(side: Side, x: number, z: number, w: number, d: number): EdgeFrame {
  const westX = x * TILE_METERS;
  const eastX = (x + w) * TILE_METERS;
  const northZ = z * TILE_METERS;
  const southZ = (z + d) * TILE_METERS;
  switch (side) {
    case 'N':
      return { edgeStart: westX, buildingLine: northZ, outwardSign: -1, alongX: true };
    case 'S':
      return { edgeStart: westX, buildingLine: southZ, outwardSign: 1, alongX: true };
    case 'E':
      return { edgeStart: northZ, buildingLine: eastX, outwardSign: 1, alongX: false };
    case 'W':
      return { edgeStart: northZ, buildingLine: westX, outwardSign: -1, alongX: false };
    default:
      throw new RangeError(`edgeFrameFor: unknown side ${side as string}`);
  }
}

function frameToWorld(
  frame: EdgeFrame,
  along: number,
  depthTiles: number,
): { x: number; z: number } {
  const perp = frame.buildingLine + frame.outwardSign * depthTiles * TILE_METERS;
  return frame.alongX
    ? { x: frame.edgeStart + along, z: perp }
    : { x: perp, z: frame.edgeStart + along };
}

/**
 * Heading convention: the vehicle-kit geometry's nose is local +Z
 * (render/vehicles.ts — headlights at z=+0.49), and rotationY(yaw) maps local
 * +Z to world (sin yaw, cos yaw). Perpendicular NOSE-IN parking points the
 * nose INWARD, away from the road, so each side's base yaw sends +Z along the
 * inward direction: N-side lots face the road to their north, so inward is
 * world +Z (yaw 0); S: -Z (PI); E: -X (-PI/2); W: +X (PI/2).
 */
const EDGE_BASE_YAW: Record<Side, number> = {
  N: 0,
  S: Math.PI,
  E: -Math.PI / 2,
  W: Math.PI / 2,
};

/** Along-edge coordinate (meters) of the bay row's start: the row is centered on the frontage. */
export function bayRowStart(edgeTiles: number, count: number, pitchTiles: number): number {
  const edgeLenM = edgeTiles * TILE_METERS;
  const rowLenM = count * pitchTiles * TILE_METERS;
  return (edgeLenM - rowLenM) / 2;
}

/**
 * Deterministic stall centers along the chosen edge: `count` bays of
 * `pitchTiles` pitch, the whole row CENTERED on the frontage, each vehicle
 * centered halfway into its bay's depth (perpendicular, nose-in). Pure
 * function of the arguments — no hashing.
 */
export function computeStallPlacements(
  x: number,
  z: number,
  w: number,
  d: number,
  edge: RoadFacingEdge,
  count: number,
  pitchTiles: number,
  depthTiles: number,
): StallPlacement[] {
  if (count <= 0) return [];

  const frame = edgeFrameFor(edge.side, x, z, w, d);
  const pitchM = pitchTiles * TILE_METERS;
  const start = bayRowStart(edge.edgeTiles, count, pitchTiles);
  const baseYaw = EDGE_BASE_YAW[edge.side];

  const placements: StallPlacement[] = [];
  for (let i = 0; i < count; i++) {
    const along = start + (i + 0.5) * pitchM;
    const { x: worldX, z: worldZ } = frameToWorld(frame, along, -depthTiles / 2);
    placements.push({ worldX, worldZ, baseYaw, along });
  }
  return placements;
}

// ---------------------------------------------------------------------------
// Conforming ground quads for the apron/bay-line mesh. Every quad is
// subdivided to <= CONFORM_MAX_CELL_M cells and split on the terrain
// PlaneGeometry's own (x0,z1)-(x1,z0) diagonal, so the pavement follows the
// rendered ground at a constant offset instead of letting a hill bulge
// through the middle of a long 4-corner quad (see render/zonegrid.ts).
// ---------------------------------------------------------------------------

function pushConformingSubQuad(
  positions: number[],
  colors: number[],
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  yOffset: number,
  color: readonly [number, number, number],
  heightAt: (x: number, z: number) => number,
): void {
  const y00 = heightAt(x0, z0) + yOffset;
  const y10 = heightAt(x1, z0) + yOffset;
  const y11 = heightAt(x1, z1) + yOffset;
  const y01 = heightAt(x0, z1) + yOffset;
  positions.push(x0, y00, z0, x0, y01, z1, x1, y10, z0);
  positions.push(x0, y01, z1, x1, y11, z1, x1, y10, z0);
  for (let i = 0; i < 6; i++) colors.push(color[0], color[1], color[2]);
}

/** Terrain-conforming axis-aligned world-space quad, subdivided to CONFORM_MAX_CELL_M cells. */
function pushQuad(
  positions: number[],
  colors: number[],
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  yOffset: number,
  color: readonly [number, number, number],
  heightAt: (x: number, z: number) => number,
): void {
  const nx = Math.max(1, Math.ceil((x1 - x0) / CONFORM_MAX_CELL_M));
  const nz = Math.max(1, Math.ceil((z1 - z0) / CONFORM_MAX_CELL_M));
  const stepX = (x1 - x0) / nx;
  const stepZ = (z1 - z0) / nz;
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const cx0 = x0 + ix * stepX;
      const cz0 = z0 + iz * stepZ;
      pushConformingSubQuad(
        positions,
        colors,
        cx0,
        cz0,
        cx0 + stepX,
        cz0 + stepZ,
        yOffset,
        color,
        heightAt,
      );
    }
  }
}

/** Pushes a quad specified in an edge's (along, depthTiles) space instead of raw world x/z. */
function pushFrameQuad(
  positions: number[],
  colors: number[],
  frame: EdgeFrame,
  along0: number,
  along1: number,
  depth0: number,
  depth1: number,
  yOffset: number,
  color: readonly [number, number, number],
  heightAt: (x: number, z: number) => number,
): void {
  const a = frameToWorld(frame, along0, depth0);
  const b = frameToWorld(frame, along1, depth1);
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const z0 = Math.min(a.z, b.z);
  const z1 = Math.max(a.z, b.z);
  pushQuad(positions, colors, x0, z0, x1, z1, yOffset, color, heightAt);
}

// ---------------------------------------------------------------------------
// ParkedCarRenderer
// ---------------------------------------------------------------------------

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _tmpColor = new THREE.Color();

interface StallRef {
  kind: number;
  slot: number;
}

export class ParkedCarRenderer {
  private readonly scene: THREE.Scene;
  private readonly heightAt: (x: number, z: number) => number;
  private readonly roadAt: (x: number, z: number) => boolean;
  private readonly catalogById: Map<string, BuildingCatalogEntry>;

  // Lit so the paved apron receives the parked cars' cast shadows (flat +Y
  // faces read nearly uniform in daylight, like the lit road).
  private readonly stripeMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

  private readonly pools = new Map<number, VehicleKitPool>();
  private readonly buildingSlots = new Map<number, StallRef[]>();
  private readonly buildingStripes = new Map<number, THREE.Mesh>();

  constructor(
    scene: THREE.Scene,
    heightAt: (x: number, z: number) => number,
    catalog: BuildingCatalogEntry[],
    roadAt: (x: number, z: number) => boolean,
  ) {
    this.scene = scene;
    this.heightAt = heightAt;
    this.roadAt = roadAt;
    this.catalogById = new Map(catalog.map((entry) => [entry.id, entry]));
  }

  /** Consumes one BuildingDelta: removed ids free their stalls; added/updated recompute theirs. */
  apply(delta: BuildingDelta): void {
    for (const id of delta.removed) this.freeBuilding(id);
    for (const building of delta.added) this.applyOne(building);
    for (const building of delta.updated) this.applyOne(building);
  }

  // --- test/debug accessors --------------------------------------------------

  /** Total instances across all kind pools (includes hidden, recycled slots). */
  carInstanceCount(): number {
    let total = 0;
    for (const pool of this.pools.values()) total += pool.usedSlots();
    return total;
  }

  /** How many InstancedMeshes this renderer has added to the scene. */
  carMeshCount(): number {
    return this.scene.children.filter((c) => c instanceof THREE.InstancedMesh).length;
  }

  /** Stall refs ({kind, slot}) currently owned by a building (empty if it has no cars). */
  stallSlotsFor(buildingId: number): readonly StallRef[] {
    return this.buildingSlots.get(buildingId) ?? [];
  }

  getCarMatrix(ref: StallRef, out: THREE.Matrix4): void {
    this.pools.get(ref.kind)?.mesh.getMatrixAt(ref.slot, out);
  }

  getCarColor(ref: StallRef, out: THREE.Color): void {
    this.pools.get(ref.kind)?.mesh.getColorAt(ref.slot, out);
  }

  hasStripeMesh(buildingId: number): boolean {
    return this.buildingStripes.has(buildingId);
  }

  /** Vertex count of a building's merged apron+bay-line geometry (0 if it has none). */
  stripeVertexCountFor(buildingId: number): number {
    const mesh = this.buildingStripes.get(buildingId);
    const pos = mesh?.geometry.getAttribute('position');
    return pos ? pos.count : 0;
  }

  // --- internals --------------------------------------------------------------

  private applyOne(building: BuildingInstance): void {
    this.freeBuilding(building.id);
    if (building.state !== BuildingState.Active) return;

    const entry = this.catalogById.get(building.catalogId);
    if (!entry) return;
    // Parked-car bays + frontage apron are for COMMERCIAL and INDUSTRIAL lots
    // only. Homes park off-street (garage/driveway, render/houses.ts); utilities
    // (water tower, wind turbine, power, etc.), parks and civic plinths get no
    // parking apron — a water tower next to a road must not sprout a grey
    // parking rectangle bleeding into the street.
    if (entry.category !== 'com' && entry.category !== 'ind') return;
    const category: LotCategory = entry.category;

    const edge = findRoadFacingEdge(
      building.x,
      building.z,
      entry.footprint.w,
      entry.footprint.d,
      this.roadAt,
    );
    if (!edge) return;

    const pitchTiles = BAY_PITCH_TILES[category];
    const depthTiles = BAY_DEPTH_TILES[category];
    const count = computeStallCount(building.level, edge.edgeTiles, pitchTiles);
    if (count <= 0) return;

    const placements = computeStallPlacements(
      building.x,
      building.z,
      entry.footprint.w,
      entry.footprint.d,
      edge,
      count,
      pitchTiles,
      depthTiles,
    );

    const refs: StallRef[] = [];
    const touchedPools = new Set<VehicleKitPool>();
    for (let i = 0; i < placements.length; i++) {
      const placement = placements[i]!;
      const kind = stallKind(category, building.id, i);
      const pool = this.poolFor(kind);
      const slot = pool.allocate();

      const size = sizeForKind(kind);
      const variant = variantScaleForKind(kind, stallVariantIndex(building.id, i, kind));
      const sx = size[0] * variant[0];
      const sy = size[1] * variant[1];
      const sz = size[2] * variant[2];

      // Cars stand ON the apron pavement (terrain + APRON_Y_OFFSET), not on
      // the bare terrain underneath it — otherwise wheels clip into the slab.
      const groundY = this.heightAt(placement.worldX, placement.worldZ) + APRON_Y_OFFSET;
      const yaw = placement.baseYaw + stallYawJitter(building.id, i);

      // Kit geometry is a unit cube with its base at y=-0.5: instance scale
      // sets real meters, and the center rides at ground + half height.
      _position.set(placement.worldX, groundY + sy / 2, placement.worldZ);
      _quaternion.setFromAxisAngle(_yAxis, yaw);
      _scale.set(sx, sy, sz);
      _matrix.compose(_position, _quaternion, _scale);
      pool.mesh.setMatrixAt(slot, _matrix);

      _tmpColor.setHex(CAR_PALETTE[stallColorIndex(building.id, i)]!);
      pool.mesh.setColorAt(slot, _tmpColor);

      refs.push({ kind, slot });
      touchedPools.add(pool);
    }

    for (const pool of touchedPools) pool.finalize();
    this.buildingSlots.set(building.id, refs);

    this.rebuildStripes(building, entry, edge, count, pitchTiles, depthTiles);
  }

  private poolFor(kind: number): VehicleKitPool {
    let pool = this.pools.get(kind);
    if (!pool) {
      pool = new VehicleKitPool(this.scene, kind, INITIAL_CAR_CAPACITY);
      this.pools.set(kind, pool);
    }
    return pool;
  }

  private rebuildStripes(
    building: BuildingInstance,
    entry: BuildingCatalogEntry,
    edge: RoadFacingEdge,
    count: number,
    pitchTiles: number,
    depthTiles: number,
  ): void {
    const frame = edgeFrameFor(
      edge.side,
      building.x,
      building.z,
      entry.footprint.w,
      entry.footprint.d,
    );
    const positions: number[] = [];
    const colors: number[] = [];

    const pitchM = pitchTiles * TILE_METERS;
    const marginM = BAY_END_MARGIN_TILES * TILE_METERS;
    const rowStart = bayRowStart(edge.edgeTiles, count, pitchTiles);
    const rowEnd = rowStart + count * pitchM;

    // The light-grey apron: the paved bay row plus an end margin each side,
    // running INWARD from the footprint edge (negative depth) so it never
    // paves the road tile beyond the building.
    pushFrameQuad(
      positions,
      colors,
      frame,
      rowStart - marginM,
      rowEnd + marginM,
      0,
      -depthTiles,
      APRON_Y_OFFSET,
      APRON_COLOR,
      this.heightAt,
    );

    // Near-white bay lines: count+1 boundaries running the full bay depth,
    // perpendicular to the road, so each vehicle sits inside a painted bay.
    for (let i = 0; i <= count; i++) {
      const centerAlong = rowStart + i * pitchM;
      pushFrameQuad(
        positions,
        colors,
        frame,
        centerAlong - STRIPE_LINE_HALF_WIDTH_M,
        centerAlong + STRIPE_LINE_HALF_WIDTH_M,
        0,
        -depthTiles,
        STRIPE_LINE_Y_OFFSET,
        NEAR_WHITE_STRIPE_COLOR,
        this.heightAt,
      );
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals(); // Lambert lighting needs normals (flat +Y apron)
    const mesh = new THREE.Mesh(geometry, this.stripeMaterial);
    mesh.receiveShadow = true; // apron takes the parked cars' shadows
    this.scene.add(mesh);
    this.buildingStripes.set(building.id, mesh);
  }

  private freeBuilding(buildingId: number): void {
    const refs = this.buildingSlots.get(buildingId);
    if (refs) {
      for (const ref of refs) this.pools.get(ref.kind)?.free(ref.slot);
      this.buildingSlots.delete(buildingId);
    }

    const stripeMesh = this.buildingStripes.get(buildingId);
    if (stripeMesh) {
      this.scene.remove(stripeMesh);
      stripeMesh.geometry.dispose();
      this.buildingStripes.delete(buildingId);
    }
  }
}
