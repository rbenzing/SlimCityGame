/**
 * Parked cars & lot life: a static, deterministic occupancy
 * signal drawn along each Active building's road-facing footprint edge.
 * Fully independent of vehicles.ts/buildings.ts/facade.ts by design — the
 * two-box car geometry below is a small, intentional local duplication.
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
} from '../shared/types';
import { TILE_METERS } from '../shared/constants';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/**
 * How far the stall row sits INWARD from the building's road-facing footprint
 * edge, in tiles (onto the lot, toward the building — never outward onto the
 * road). ~1.1 m: a parallel-parked car (1.8 m wide) then sits fully inside the
 * footprint tile, clear of the carriageway.
 */
export const STALL_INSET_TILES = 0.07;
/** Depth of the paved apron strip, inward from the footprint edge, in tiles. */
export const APRON_DEPTH_TILES = 0.14;
/** Center-to-center spacing between stalls along the edge, in tiles. */
export const STALL_SPACING_TILES = 0.45;
/** Max absolute per-car yaw jitter, radians. */
export const YAW_JITTER_MAX = 0.06;

/**
 * Curated ~10-color saturated palette: red, blue, teal, green, magenta, pink,
 * yellow, orange, white, charcoal — deliberate saturation contrast against
 * the desaturated city palette.
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

const APRON_Y_OFFSET = 0.05;
const STRIPE_LINE_Y_OFFSET = 0.06;
const STRIPE_LINE_HALF_WIDTH_TILES = 0.03;
/** Divider lines run inward across the apron strip (from the footprint edge). */
const STRIPE_LINE_NEAR_TILES = 0.0;
const STRIPE_LINE_FAR_TILES = APRON_DEPTH_TILES;

const BODY_WIDTH = 1.8;
const BODY_HEIGHT = 1.0;
const BODY_LENGTH = 4.0;
const CABIN_WIDTH = 1.5;
const CABIN_HEIGHT = 0.6;
const CABIN_LENGTH = 2.0;
/** Cabin sits slightly toward the rear (local +Z; local forward is -Z). */
const CABIN_Z_OFFSET = 0.3;

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

/** count = min(level + 1, floor(edgeTiles / STALL_SPACING_TILES)). */
export function computeStallCount(level: number, edgeTiles: number): number {
  const maxByCapacity = Math.floor(edgeTiles / STALL_SPACING_TILES);
  return Math.max(0, Math.min(level + 1, maxByCapacity));
}

export interface StallPlacement {
  worldX: number;
  worldZ: number;
  /** Base facing yaw (radians) before per-car jitter; see EDGE_BASE_YAW. */
  baseYaw: number;
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
 * heading convention: yaw 0 faces local/world -Z ("N"); see buildCarGeometry.
 * The car's long axis (BODY_LENGTH) runs along local Z, so a bare yaw of
 * {N:0, S:PI, E:-PI/2, W:PI/2} points that long axis straight outward,
 * across the edge — nose-in *perpendicular* parking. *Parallel* street
 * parking is wanted instead: the long axis must run ALONG the
 * road-facing edge, not across it. Adding Math.PI/2 to each side rotates the
 * car a quarter turn so its local-Z (long) axis now tracks the edge's own
 * "along" axis (world X for N/S, world Z for E/W) instead of the outward
 * axis — before/after per side:
 *   N: 0       -> PI/2
 *   E: -PI/2   -> 0
 *   S: PI      -> -PI/2 (i.e. 3*PI/2, wrapped into (-PI, PI])
 *   W: PI/2    -> PI
 */
const EDGE_BASE_YAW: Record<Side, number> = {
  N: Math.PI / 2,
  S: -Math.PI / 2,
  E: 0,
  W: Math.PI,
};

/**
 * Deterministic stall centers along the chosen edge: evenly spaced every
 * STALL_SPACING_TILES tiles (each stall centered within its spacing slot),
 * inset STALL_INSET_TILES tiles INWARD from the building's own edge line, onto
 * the lot (away from the road). Pure function of (x, z, w, d, edge, count) —
 * no hashing.
 */
export function computeStallPlacements(
  x: number,
  z: number,
  w: number,
  d: number,
  edge: RoadFacingEdge,
  count: number,
): StallPlacement[] {
  if (count <= 0) return [];

  const frame = edgeFrameFor(edge.side, x, z, w, d);
  const spacingM = STALL_SPACING_TILES * TILE_METERS;
  const baseYaw = EDGE_BASE_YAW[edge.side];

  const placements: StallPlacement[] = [];
  for (let i = 0; i < count; i++) {
    const along = (i + 0.5) * spacingM;
    const { x: worldX, z: worldZ } = frameToWorld(frame, along, -STALL_INSET_TILES);
    placements.push({ worldX, worldZ, baseYaw });
  }
  return placements;
}

// ---------------------------------------------------------------------------
// Raw quad builders for the stall-striping mesh (mirrors render/roadsmesh.ts)
// ---------------------------------------------------------------------------

function pushVertex(
  positions: number[],
  colors: number[],
  x: number,
  y: number,
  z: number,
  color: readonly [number, number, number],
): void {
  positions.push(x, y, z);
  colors.push(color[0], color[1], color[2]);
}

/** Two triangles covering an axis-aligned world-space quad, corners sampled via heightAt. */
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
  const y00 = heightAt(x0, z0) + yOffset;
  const y10 = heightAt(x1, z0) + yOffset;
  const y11 = heightAt(x1, z1) + yOffset;
  const y01 = heightAt(x0, z1) + yOffset;

  pushVertex(positions, colors, x0, y00, z0, color);
  pushVertex(positions, colors, x1, y11, z1, color);
  pushVertex(positions, colors, x1, y10, z0, color);

  pushVertex(positions, colors, x0, y00, z0, color);
  pushVertex(positions, colors, x0, y01, z1, color);
  pushVertex(positions, colors, x1, y11, z1, color);
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
// The shared two-box car geometry (built once; intentional local duplication)
// ---------------------------------------------------------------------------

/** Concatenates two indexed BufferGeometries (position+normal+index) into one. */
function mergeTwoBoxGeometries(
  a: THREE.BufferGeometry,
  b: THREE.BufferGeometry,
): THREE.BufferGeometry {
  const merged = new THREE.BufferGeometry();

  const posA = a.getAttribute('position') as THREE.BufferAttribute;
  const posB = b.getAttribute('position') as THREE.BufferAttribute;
  const normA = a.getAttribute('normal') as THREE.BufferAttribute;
  const normB = b.getAttribute('normal') as THREE.BufferAttribute;

  const positions = new Float32Array(posA.array.length + posB.array.length);
  positions.set(posA.array as Float32Array, 0);
  positions.set(posB.array as Float32Array, posA.array.length);

  const normals = new Float32Array(normA.array.length + normB.array.length);
  normals.set(normA.array as Float32Array, 0);
  normals.set(normB.array as Float32Array, normA.array.length);

  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

  const indices: number[] = [];
  const idxA = a.index;
  const idxB = b.index;
  if (idxA) for (let i = 0; i < idxA.count; i++) indices.push(idxA.getX(i));
  const vertexOffsetB = posA.count;
  if (idxB) for (let i = 0; i < idxB.count; i++) indices.push(idxB.getX(i) + vertexOffsetB);
  merged.setIndex(indices);

  a.dispose();
  b.dispose();
  return merged;
}

/**
 * The shared "two-box" car silhouette: a body slab plus a
 * smaller cabin box merged into a single BufferGeometry, so every parked car
 * is one instance of one InstancedMesh. Local origin sits at ground level,
 * centered in X/Z; local -Z is "forward" (matches EDGE_BASE_YAW's N=0).
 */
function buildCarGeometry(): THREE.BufferGeometry {
  const body = new THREE.BoxGeometry(BODY_WIDTH, BODY_HEIGHT, BODY_LENGTH);
  body.translate(0, BODY_HEIGHT / 2, 0);
  const cabin = new THREE.BoxGeometry(CABIN_WIDTH, CABIN_HEIGHT, CABIN_LENGTH);
  cabin.translate(0, BODY_HEIGHT + CABIN_HEIGHT / 2, CABIN_Z_OFFSET);
  return mergeTwoBoxGeometries(body, cabin);
}

// ---------------------------------------------------------------------------
// ParkedCarRenderer
// ---------------------------------------------------------------------------

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _unitScale = new THREE.Vector3(1, 1, 1);
/**
 * Industrial lots park box TRUCKS, not cars: the shared car silhouette scaled
 * up to a box-truck footprint (base 1.8×1.0×4.0 → ~2.4×2.4×7.0 m) — wider,
 * much taller, longer. A distinct cab-plus-cargo mesh is a later refinement.
 */
const _truckScale = new THREE.Vector3(1.35, 2.4, 1.75);
const _tmpColor = new THREE.Color();
const HIDDEN_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

export class ParkedCarRenderer {
  private readonly scene: THREE.Scene;
  private readonly heightAt: (x: number, z: number) => number;
  private readonly roadAt: (x: number, z: number) => boolean;
  private readonly catalogById: Map<string, BuildingCatalogEntry>;

  private readonly carGeometry = buildCarGeometry();
  private readonly carMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
  private readonly stripeMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });

  private carMesh: THREE.InstancedMesh | null = null;
  private carCapacity = 0;
  private usedSlotCount = 0;
  private readonly freeSlots: number[] = [];

  private readonly buildingSlots = new Map<number, number[]>();
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

  /** Number of instances the car InstancedMesh currently draws (includes hidden, recycled slots). */
  carInstanceCount(): number {
    return this.carMesh?.count ?? 0;
  }

  /** How many InstancedMeshes this renderer has added to the scene (0 or 1). */
  carMeshCount(): number {
    return this.scene.children.filter((c) => c instanceof THREE.InstancedMesh).length;
  }

  /** Car instance slot indices currently owned by a building (empty if it has no cars). */
  stallSlotsFor(buildingId: number): readonly number[] {
    return this.buildingSlots.get(buildingId) ?? [];
  }

  getCarMatrix(slot: number, out: THREE.Matrix4): void {
    this.carMesh?.getMatrixAt(slot, out);
  }

  getCarColor(slot: number, out: THREE.Color): void {
    this.carMesh?.getColorAt(slot, out);
  }

  hasStripeMesh(buildingId: number): boolean {
    return this.buildingStripes.has(buildingId);
  }

  /** Vertex count of a building's merged apron+divider-stripe geometry (0 if it has none). */
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
    // Parked-car stalls + frontage apron are for COMMERCIAL and INDUSTRIAL lots
    // only. Homes park off-street (garage/driveway, render/houses.ts); utilities
    // (water tower, wind turbine, power, etc.), parks and civic plinths get no
    // parking apron — a water tower next to a road must not sprout a grey
    // parking rectangle bleeding into the street.
    if (entry.category !== 'com' && entry.category !== 'ind') return;

    const edge = findRoadFacingEdge(
      building.x,
      building.z,
      entry.footprint.w,
      entry.footprint.d,
      this.roadAt,
    );
    if (!edge) return;

    const count = computeStallCount(building.level, edge.edgeTiles);
    if (count <= 0) return;

    const placements = computeStallPlacements(
      building.x,
      building.z,
      entry.footprint.w,
      entry.footprint.d,
      edge,
      count,
    );

    const vehicleScale = entry.category === 'ind' ? _truckScale : _unitScale;
    const slots: number[] = [];
    for (let i = 0; i < placements.length; i++) {
      const placement = placements[i]!;
      const slot = this.allocateSlot();
      const groundY = this.heightAt(placement.worldX, placement.worldZ);
      const yaw = placement.baseYaw + stallYawJitter(building.id, i);

      _position.set(placement.worldX, groundY, placement.worldZ);
      _quaternion.setFromAxisAngle(_yAxis, yaw);
      _matrix.compose(_position, _quaternion, vehicleScale);
      this.carMesh!.setMatrixAt(slot, _matrix);

      _tmpColor.setHex(CAR_PALETTE[stallColorIndex(building.id, i)]!);
      this.carMesh!.setColorAt(slot, _tmpColor);

      slots.push(slot);
    }

    this.carMesh!.count = this.usedSlotCount;
    this.carMesh!.instanceMatrix.needsUpdate = true;
    if (this.carMesh!.instanceColor) this.carMesh!.instanceColor.needsUpdate = true;
    // Invalidate the cached frustum-cull sphere (three.js only recomputes it
    // while null — otherwise cars added after the first cull pass stay culled).
    this.carMesh!.boundingSphere = null;
    this.buildingSlots.set(building.id, slots);

    this.rebuildStripes(building, entry, edge, count);
  }

  private rebuildStripes(
    building: BuildingInstance,
    entry: BuildingCatalogEntry,
    edge: RoadFacingEdge,
    count: number,
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

    const edgeLenM = edge.edgeTiles * TILE_METERS;
    // The light-grey apron: a shallow paved strip on the lot's own frontage,
    // running INWARD from the footprint edge (negative depth) so it never
    // paves the road tile beyond the building.
    pushFrameQuad(
      positions,
      colors,
      frame,
      0,
      edgeLenM,
      0,
      -APRON_DEPTH_TILES,
      APRON_Y_OFFSET,
      APRON_COLOR,
      this.heightAt,
    );

    // Near-white divider lines between each pair of adjacent stalls.
    const spacingM = STALL_SPACING_TILES * TILE_METERS;
    const halfLineM = STRIPE_LINE_HALF_WIDTH_TILES * TILE_METERS;
    for (let i = 1; i < count; i++) {
      const centerAlong = i * spacingM;
      pushFrameQuad(
        positions,
        colors,
        frame,
        centerAlong - halfLineM,
        centerAlong + halfLineM,
        -STRIPE_LINE_NEAR_TILES,
        -STRIPE_LINE_FAR_TILES,
        STRIPE_LINE_Y_OFFSET,
        NEAR_WHITE_STRIPE_COLOR,
        this.heightAt,
      );
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geometry, this.stripeMaterial);
    this.scene.add(mesh);
    this.buildingStripes.set(building.id, mesh);
  }

  private freeBuilding(buildingId: number): void {
    const slots = this.buildingSlots.get(buildingId);
    if (slots && this.carMesh) {
      for (const slot of slots) this.carMesh.setMatrixAt(slot, HIDDEN_MATRIX);
      this.carMesh.instanceMatrix.needsUpdate = true;
      this.buildingSlots.delete(buildingId);
      for (const slot of slots) this.freeSlots.push(slot);
    }

    const stripeMesh = this.buildingStripes.get(buildingId);
    if (stripeMesh) {
      this.scene.remove(stripeMesh);
      stripeMesh.geometry.dispose();
      this.buildingStripes.delete(buildingId);
    }
  }

  private ensureCarMesh(): void {
    if (this.carMesh) return;
    this.carCapacity = INITIAL_CAR_CAPACITY;
    this.carMesh = new THREE.InstancedMesh(this.carGeometry, this.carMaterial, this.carCapacity);
    this.carMesh.count = 0;
    this.scene.add(this.carMesh);
  }

  private growCarCapacity(): void {
    const previous = this.carMesh!;
    const newCapacity = this.carCapacity * 2;
    const newMesh = new THREE.InstancedMesh(this.carGeometry, this.carMaterial, newCapacity);

    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    for (let i = 0; i < this.usedSlotCount; i++) {
      previous.getMatrixAt(i, m);
      newMesh.setMatrixAt(i, m);
      previous.getColorAt(i, c);
      newMesh.setColorAt(i, c);
    }
    newMesh.count = this.usedSlotCount;
    newMesh.instanceMatrix.needsUpdate = true;
    if (newMesh.instanceColor) newMesh.instanceColor.needsUpdate = true;

    this.scene.remove(previous);
    this.scene.add(newMesh);
    this.carMesh = newMesh;
    this.carCapacity = newCapacity;
  }

  private allocateSlot(): number {
    this.ensureCarMesh();
    const recycled = this.freeSlots.pop();
    if (recycled !== undefined) return recycled;
    if (this.usedSlotCount >= this.carCapacity) this.growCarCapacity();
    return this.usedSlotCount++;
  }
}
