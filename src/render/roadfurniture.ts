/**
 * Road furniture: deterministic clutter placed from the road tile set alone —
 * MANHOLE covers in the carriageway, curbside UTILITY BOXES, PARKING METERS,
 * and TRAFFIC SIGNS. Every prop is one merged, instanced geometry (one draw
 * call per prop kind regardless of count). Placement is a pure function of tile
 * coordinates and neighbor presence (no rng, no Date.now); a local triple32
 * hash drives per-tile selection, side, and jitter so a given road always
 * renders the same furniture. Orientation/curbside is derived from which
 * neighbor tiles are present (the tile stream carries no connection mask),
 * exactly as the street-lamp placer does.
 */
import * as THREE from 'three';
import { RoadTier, TilePoint } from '../shared/types';
import { tileToWorld } from '../shared/constants';
import { carriagewayHalfWidthMeters, SIDEWALK_WIDTH_M } from './roadsmesh';

// --- Manhole -----------------------------------------------------------------
const MANHOLE_RADIUS = 0.45;
const MANHOLE_HEIGHT = 0.05;
const MANHOLE_SEGMENTS = 16;
const MANHOLE_COLOR = 0x2b2b2f; // dark cast iron
const MANHOLE_LIFT = 0.03; // sits a hair proud of the road surface
const MANHOLE_MIN_OFFSET = 0.6; // kept off the centerline
const MANHOLE_EDGE_MARGIN = 0.5; // kept off the carriageway edge
const MANHOLE_SELECT_FRACTION = 1 / 6; // ~1 in 6 paved tiles

// --- Utility / electrical box ------------------------------------------------
const BOX_WIDTH = 0.55;
const BOX_HEIGHT = 1.1;
const BOX_DEPTH = 0.4;
const BOX_COLOR = 0x566356; // muted grey-green cabinet
const BOX_SELECT_FRACTION = 1 / 12; // ~1 in 12 curbed tiles

// --- Parking meter -----------------------------------------------------------
const METER_POLE_RADIUS = 0.05;
const METER_POLE_HEIGHT = 1.1;
const METER_HEAD_W = 0.18;
const METER_HEAD_H = 0.22;
const METER_HEAD_D = 0.12;
const METER_COLOR = 0x9a9ba0; // silver-grey
const METER_PERIOD = 5; // a meter pair on every (x+z) multiple of 5
const METER_ALONG = 3; // the pair straddles the tile center by ±3m along the run

// --- Traffic sign ------------------------------------------------------------
const SIGN_POLE_RADIUS = 0.04;
const SIGN_POLE_HEIGHT = 2.2;
const SIGN_BOARD = 0.5;
const SIGN_BOARD_DEPTH = 0.06;
const SIGN_POLE_COLOR = 0x50555d; // charcoal pole
const SIGN_BOARD_COLOR = 0xd8d8d8; // light board
const SIGN_PERIOD = 8; // a periodic sign on every (x+z) multiple of 8

// Distinct hash slots so each per-tile draw is decorrelated from the others.
const HASH_MANHOLE_SELECT = 1;
const HASH_MANHOLE_MAG = 2;
const HASH_MANHOLE_SIDE = 3;
const HASH_MANHOLE_ROT = 4;
const HASH_BOX_SELECT = 5;
const HASH_BOX_SIDE = 6;
const HASH_METER_SIDE = 7;
const HASH_SIGN_SIDE = 8;

// ---------------------------------------------------------------------------
// Deterministic hashing (never Math.random/Date.now) — a local copy of the
// triple32 recipe shared verbatim across the render layer.
// ---------------------------------------------------------------------------

function hash1(n: number): number {
  let h = n >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/** Wide fixed stride so (x,z) pairs never collide. */
function tileKey(x: number, z: number): number {
  return x * 100_000 + z;
}

/** Per-tile hash in [0,1) for a given draw slot. */
function hashTile(x: number, z: number, slot: number): number {
  return hash1(tileKey(x, z) * 16 + slot);
}

export type FurnitureAxis = 'x' | 'z';
export type FurnitureSide = 1 | -1;

/** A road tile furniture may sit on; `tier` is optional (undefined -> TwoLane). */
export type FurnitureRoadTile = TilePoint & { tier?: RoadTier };

/** A curbside sidewalk edge: the world axis to offset along and its sign. */
interface SideChoice {
  axis: FurnitureAxis;
  side: FurnitureSide;
}

export interface ManholePlacement {
  x: number;
  z: number;
  /** Lateral offset axis (perpendicular to the road run). */
  axis: FurnitureAxis;
  /** Signed meters from the centerline, kept inside the carriageway. */
  lateral: number;
  /** Hashed spin about Y (radians). */
  rotationY: number;
}

export interface BoxPlacement {
  x: number;
  z: number;
  /** World axis the curbside offset runs along. */
  axis: FurnitureAxis;
  side: FurnitureSide;
  /** Curbside offset magnitude (carriageway edge + half a sidewalk). */
  lateralOffset: number;
}

export interface MeterPlacement {
  x: number;
  z: number;
  /** Axis of the curbside lateral offset (perpendicular to the run). */
  curbAxis: FurnitureAxis;
  side: FurnitureSide;
  lateralOffset: number;
  /** Signed meters along the run axis — the pair straddles the tile center. */
  along: number;
}

export interface SignPlacement {
  x: number;
  z: number;
  axis: FurnitureAxis;
  side: FurnitureSide;
  lateralOffset: number;
  /** True when this sign marks a dead-end tile (exactly one road neighbor). */
  deadEnd: boolean;
}

/** Curbside offset (m): the sidewalk just past the carriageway edge. */
function curbsideLateralOffset(tier: RoadTier | undefined): number {
  return carriagewayHalfWidthMeters(tier ?? RoadTier.TwoLane) + SIDEWALK_WIDTH_M * 0.5;
}

/** Manholes sit on any paved surface — every tier but gravel. */
function tierIsPaved(tier: RoadTier | undefined): boolean {
  return (tier ?? RoadTier.TwoLane) !== RoadTier.Gravel;
}

/** Boxes/signs need a raised curb: excludes gravel and alley. */
function tierHasCurb(tier: RoadTier | undefined): boolean {
  const t = tier ?? RoadTier.TwoLane;
  return t !== RoadTier.Gravel && t !== RoadTier.Alley;
}

/** Meters sit on street tiers that allow curb parking. */
function tierHasParking(tier: RoadTier | undefined): boolean {
  const t = tier ?? RoadTier.TwoLane;
  return t === RoadTier.TwoLane || t === RoadTier.FourLane || t === RoadTier.OneWay;
}

// Canonical neighbor order (N, E, S, W); each carries the outward curbside
// offset (axis + sign) for the sidewalk on that side.
const NEIGHBOR_DIRS: readonly { dx: number; dz: number; axis: FurnitureAxis; side: FurnitureSide }[] =
  [
    { dx: 0, dz: -1, axis: 'z', side: -1 },
    { dx: 1, dz: 0, axis: 'x', side: 1 },
    { dx: 0, dz: 1, axis: 'z', side: 1 },
    { dx: -1, dz: 0, axis: 'x', side: -1 },
  ];

function buildTileSet(roadTiles: readonly FurnitureRoadTile[]): Set<number> {
  const set = new Set<number>();
  for (const tile of roadTiles) set.add(tileKey(tile.x, tile.z));
  return set;
}

/** How many of the four orthogonal neighbors are road tiles. */
function neighborCount(tileSet: Set<number>, x: number, z: number): number {
  let count = 0;
  for (const d of NEIGHBOR_DIRS) if (tileSet.has(tileKey(x + d.dx, z + d.dz))) count++;
  return count;
}

/** The sides whose neighbor tile is absent — the sidewalk edges. */
function availableSidewalkSides(tileSet: Set<number>, x: number, z: number): SideChoice[] {
  const out: SideChoice[] = [];
  for (const d of NEIGHBOR_DIRS)
    if (!tileSet.has(tileKey(x + d.dx, z + d.dz))) out.push({ axis: d.axis, side: d.side });
  return out;
}

/**
 * Lateral (perpendicular-to-run) offset axis, derived from neighbor presence:
 * an east-west road offsets along z, a north-south road along x. Isolated tiles
 * and 4-way intersections fall back to z — the same rule the lamp placer uses.
 */
function lateralAxis(tileSet: Set<number>, x: number, z: number): FurnitureAxis {
  const hasEW = tileSet.has(tileKey(x - 1, z)) || tileSet.has(tileKey(x + 1, z));
  const hasNS = tileSet.has(tileKey(x, z - 1)) || tileSet.has(tileKey(x, z + 1));
  return hasNS && !hasEW ? 'x' : 'z';
}

/** Deterministically picks one of the available sides from a [0,1) hash. */
function pickSide(sides: readonly SideChoice[], h: number): SideChoice | null {
  if (sides.length === 0) return null;
  return sides[Math.min(sides.length - 1, Math.floor(h * sides.length))]!;
}

/** Positive modulo so a straight run's (x+z) advances the period cleanly. */
function periodHits(x: number, z: number, period: number): boolean {
  return (((x + z) % period) + period) % period === 0;
}

// ---------------------------------------------------------------------------
// Pure placement functions (unit-testable, no THREE dependency).
// ---------------------------------------------------------------------------

/** Manhole covers in the carriageway on ~1 in 6 paved tiles, off the centerline. */
export function computeManholePlacements(
  roadTiles: readonly FurnitureRoadTile[],
): ManholePlacement[] {
  const tileSet = buildTileSet(roadTiles);
  const out: ManholePlacement[] = [];
  for (const tile of roadTiles) {
    if (!tierIsPaved(tile.tier)) continue;
    if (hashTile(tile.x, tile.z, HASH_MANHOLE_SELECT) >= MANHOLE_SELECT_FRACTION) continue;

    const lo = MANHOLE_MIN_OFFSET;
    const hi = carriagewayHalfWidthMeters(tile.tier ?? RoadTier.TwoLane) - MANHOLE_EDGE_MARGIN;
    if (hi <= lo) continue; // carriageway too narrow to seat a cover clear of both edges

    const mag = lo + hashTile(tile.x, tile.z, HASH_MANHOLE_MAG) * (hi - lo);
    const side: FurnitureSide = hashTile(tile.x, tile.z, HASH_MANHOLE_SIDE) < 0.5 ? -1 : 1;
    out.push({
      x: tile.x,
      z: tile.z,
      axis: lateralAxis(tileSet, tile.x, tile.z),
      lateral: mag * side,
      rotationY: hashTile(tile.x, tile.z, HASH_MANHOLE_ROT) * Math.PI * 2,
    });
  }
  return out;
}

/** Utility boxes on a sidewalk edge of ~1 in 12 curbed tiles. */
export function computeBoxPlacements(roadTiles: readonly FurnitureRoadTile[]): BoxPlacement[] {
  const tileSet = buildTileSet(roadTiles);
  const out: BoxPlacement[] = [];
  for (const tile of roadTiles) {
    if (!tierHasCurb(tile.tier)) continue;
    if (hashTile(tile.x, tile.z, HASH_BOX_SELECT) >= BOX_SELECT_FRACTION) continue;

    const pick = pickSide(
      availableSidewalkSides(tileSet, tile.x, tile.z),
      hashTile(tile.x, tile.z, HASH_BOX_SIDE),
    );
    if (!pick) continue; // no free sidewalk side (fully surrounded tile)

    out.push({
      x: tile.x,
      z: tile.z,
      axis: pick.axis,
      side: pick.side,
      lateralOffset: curbsideLateralOffset(tile.tier),
    });
  }
  return out;
}

/** Parking meters (two per tile) on curb-parking tiers, every 5th tile along the run. */
export function computeMeterPlacements(roadTiles: readonly FurnitureRoadTile[]): MeterPlacement[] {
  const tileSet = buildTileSet(roadTiles);
  const out: MeterPlacement[] = [];
  for (const tile of roadTiles) {
    if (!tierHasParking(tile.tier)) continue;
    if (!periodHits(tile.x, tile.z, METER_PERIOD)) continue;

    const curbAxis = lateralAxis(tileSet, tile.x, tile.z);
    const side: FurnitureSide = hashTile(tile.x, tile.z, HASH_METER_SIDE) < 0.5 ? -1 : 1;
    const lateralOffset = curbsideLateralOffset(tile.tier);
    for (const along of [METER_ALONG, -METER_ALONG]) {
      out.push({ x: tile.x, z: tile.z, curbAxis, side, lateralOffset, along });
    }
  }
  return out;
}

/** One traffic sign per dead-end tile, plus a periodic sign every 8th curbed tile. */
export function computeSignPlacements(roadTiles: readonly FurnitureRoadTile[]): SignPlacement[] {
  const tileSet = buildTileSet(roadTiles);
  const out: SignPlacement[] = [];
  for (const tile of roadTiles) {
    if (!tierHasCurb(tile.tier)) continue;

    const deadEnd = neighborCount(tileSet, tile.x, tile.z) === 1;
    if (!deadEnd && !periodHits(tile.x, tile.z, SIGN_PERIOD)) continue;

    const pick = pickSide(
      availableSidewalkSides(tileSet, tile.x, tile.z),
      hashTile(tile.x, tile.z, HASH_SIGN_SIDE),
    );
    if (!pick) continue;

    out.push({
      x: tile.x,
      z: tile.z,
      axis: pick.axis,
      side: pick.side,
      lateralOffset: curbsideLateralOffset(tile.tier),
      deadEnd,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Geometry merging (position/normal/index — same idiom as the lamp placer).
// ---------------------------------------------------------------------------

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
    if (index) for (let i = 0; i < index.count; i++) indices.push(index.getX(i) + vertexOffset);
    vertexOffset += pos.count;
    g.dispose();
  }

  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setIndex(indices);
  return merged;
}

/** Same merge, but paints each source part a flat color into a vertex-color attribute. */
function mergeColoredGeometries(
  parts: readonly { geometry: THREE.BufferGeometry; color: number }[],
): THREE.BufferGeometry {
  const merged = new THREE.BufferGeometry();

  let vertexTotal = 0;
  for (const p of parts)
    vertexTotal += (p.geometry.getAttribute('position') as THREE.BufferAttribute).count;

  const positions = new Float32Array(vertexTotal * 3);
  const normals = new Float32Array(vertexTotal * 3);
  const colors = new Float32Array(vertexTotal * 3);
  const indices: number[] = [];
  const rgb = new THREE.Color();

  let vertexOffset = 0;
  let floatOffset = 0;
  for (const p of parts) {
    const pos = p.geometry.getAttribute('position') as THREE.BufferAttribute;
    const norm = p.geometry.getAttribute('normal') as THREE.BufferAttribute;
    positions.set(pos.array as Float32Array, floatOffset);
    normals.set(norm.array as Float32Array, floatOffset);
    rgb.set(p.color);
    for (let i = 0; i < pos.count; i++) {
      colors[(vertexOffset + i) * 3] = rgb.r;
      colors[(vertexOffset + i) * 3 + 1] = rgb.g;
      colors[(vertexOffset + i) * 3 + 2] = rgb.b;
    }
    floatOffset += pos.array.length;

    const index = p.geometry.index;
    if (index) for (let i = 0; i < index.count; i++) indices.push(index.getX(i) + vertexOffset);
    vertexOffset += pos.count;
    p.geometry.dispose();
  }

  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  merged.setIndex(indices);
  return merged;
}

/** Thin pole + a small head box near the top, base at local origin. */
function buildMeterGeometry(): THREE.BufferGeometry {
  const pole = new THREE.CylinderGeometry(
    METER_POLE_RADIUS,
    METER_POLE_RADIUS,
    METER_POLE_HEIGHT,
    6,
  );
  pole.translate(0, METER_POLE_HEIGHT / 2, 0);
  const head = new THREE.BoxGeometry(METER_HEAD_W, METER_HEAD_H, METER_HEAD_D);
  head.translate(0, METER_POLE_HEIGHT - METER_HEAD_H / 2, 0);
  return mergeGeometries([pole, head]);
}

/** Thin pole + a rectangular board near the top, two-toned via vertex colors. */
function buildSignGeometry(): THREE.BufferGeometry {
  const pole = new THREE.CylinderGeometry(SIGN_POLE_RADIUS, SIGN_POLE_RADIUS, SIGN_POLE_HEIGHT, 6);
  pole.translate(0, SIGN_POLE_HEIGHT / 2, 0);
  const board = new THREE.BoxGeometry(SIGN_BOARD, SIGN_BOARD, SIGN_BOARD_DEPTH);
  board.translate(0, SIGN_POLE_HEIGHT - SIGN_BOARD / 2 - 0.05, 0);
  return mergeColoredGeometries([
    { geometry: pole, color: SIGN_POLE_COLOR },
    { geometry: board, color: SIGN_BOARD_COLOR },
  ]);
}

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _identityQuat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _yAxis = new THREE.Vector3(0, 1, 0);

export interface FurnitureCounts {
  manholes: number;
  boxes: number;
  meters: number;
  signs: number;
}

export class RoadFurnitureRenderer {
  private readonly scene: THREE.Scene;
  private readonly heightAt: (x: number, z: number) => number;

  private readonly manholeGeometry = new THREE.CylinderGeometry(
    MANHOLE_RADIUS,
    MANHOLE_RADIUS,
    MANHOLE_HEIGHT,
    MANHOLE_SEGMENTS,
  );
  private readonly manholeMaterial = new THREE.MeshLambertMaterial({ color: MANHOLE_COLOR });

  private readonly boxGeometry = new THREE.BoxGeometry(BOX_WIDTH, BOX_HEIGHT, BOX_DEPTH);
  private readonly boxMaterial = new THREE.MeshLambertMaterial({ color: BOX_COLOR });

  private readonly meterGeometry = buildMeterGeometry();
  private readonly meterMaterial = new THREE.MeshLambertMaterial({ color: METER_COLOR });

  private readonly signGeometry = buildSignGeometry();
  private readonly signMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

  private manholeMesh: THREE.InstancedMesh | null = null;
  private boxMesh: THREE.InstancedMesh | null = null;
  private meterMesh: THREE.InstancedMesh | null = null;
  private signMesh: THREE.InstancedMesh | null = null;

  private manholes: ManholePlacement[] = [];
  private boxes: BoxPlacement[] = [];
  private meters: MeterPlacement[] = [];
  private signs: SignPlacement[] = [];

  constructor(scene: THREE.Scene, heightAt: (x: number, z: number) => number) {
    this.scene = scene;
    this.heightAt = heightAt;
  }

  /** Full rebuild from the current road tile set (roads change relatively rarely). */
  rebuild(roadTiles: readonly FurnitureRoadTile[]): void {
    this.disposeMeshes();

    this.manholes = computeManholePlacements(roadTiles);
    this.boxes = computeBoxPlacements(roadTiles);
    this.meters = computeMeterPlacements(roadTiles);
    this.signs = computeSignPlacements(roadTiles);

    if (this.manholes.length) {
      const mesh = new THREE.InstancedMesh(
        this.manholeGeometry,
        this.manholeMaterial,
        this.manholes.length,
      );
      mesh.count = this.manholes.length;
      mesh.castShadow = false; // flat disc — nothing to cast
      mesh.receiveShadow = true;
      for (let i = 0; i < this.manholes.length; i++) this.writeManhole(mesh, i, this.manholes[i]!);
      mesh.instanceMatrix.needsUpdate = true;
      this.manholeMesh = mesh;
      this.scene.add(mesh);
    }

    if (this.boxes.length) {
      const mesh = new THREE.InstancedMesh(this.boxGeometry, this.boxMaterial, this.boxes.length);
      mesh.count = this.boxes.length;
      mesh.castShadow = true;
      for (let i = 0; i < this.boxes.length; i++) this.writeBox(mesh, i, this.boxes[i]!);
      mesh.instanceMatrix.needsUpdate = true;
      this.boxMesh = mesh;
      this.scene.add(mesh);
    }

    if (this.meters.length) {
      const mesh = new THREE.InstancedMesh(
        this.meterGeometry,
        this.meterMaterial,
        this.meters.length,
      );
      mesh.count = this.meters.length;
      mesh.castShadow = true;
      for (let i = 0; i < this.meters.length; i++) this.writeMeter(mesh, i, this.meters[i]!);
      mesh.instanceMatrix.needsUpdate = true;
      this.meterMesh = mesh;
      this.scene.add(mesh);
    }

    if (this.signs.length) {
      const mesh = new THREE.InstancedMesh(this.signGeometry, this.signMaterial, this.signs.length);
      mesh.count = this.signs.length;
      mesh.castShadow = true;
      for (let i = 0; i < this.signs.length; i++) this.writeSign(mesh, i, this.signs[i]!);
      mesh.instanceMatrix.needsUpdate = true;
      this.signMesh = mesh;
      this.scene.add(mesh);
    }
  }

  /** Instance counts for each prop layer from the last rebuild(). */
  furnitureCounts(): FurnitureCounts {
    return {
      manholes: this.manholes.length,
      boxes: this.boxes.length,
      meters: this.meters.length,
      signs: this.signs.length,
    };
  }

  private writeManhole(mesh: THREE.InstancedMesh, slot: number, p: ManholePlacement): void {
    const cx = tileToWorld(p.x);
    const cz = tileToWorld(p.z);
    const wx = p.axis === 'x' ? cx + p.lateral : cx;
    const wz = p.axis === 'z' ? cz + p.lateral : cz;
    _quat.setFromAxisAngle(_yAxis, p.rotationY);
    _position.set(wx, this.heightAt(wx, wz) + MANHOLE_LIFT, wz);
    _matrix.compose(_position, _quat, _scale);
    mesh.setMatrixAt(slot, _matrix);
  }

  private writeBox(mesh: THREE.InstancedMesh, slot: number, p: BoxPlacement): void {
    const off = p.lateralOffset * p.side;
    const wx = p.axis === 'x' ? tileToWorld(p.x) + off : tileToWorld(p.x);
    const wz = p.axis === 'z' ? tileToWorld(p.z) + off : tileToWorld(p.z);
    _position.set(wx, this.heightAt(wx, wz) + BOX_HEIGHT / 2, wz);
    _matrix.compose(_position, _identityQuat, _scale);
    mesh.setMatrixAt(slot, _matrix);
  }

  private writeMeter(mesh: THREE.InstancedMesh, slot: number, p: MeterPlacement): void {
    const cx = tileToWorld(p.x);
    const cz = tileToWorld(p.z);
    const off = p.lateralOffset * p.side;
    const runAxis: FurnitureAxis = p.curbAxis === 'x' ? 'z' : 'x';
    const wx = cx + (p.curbAxis === 'x' ? off : 0) + (runAxis === 'x' ? p.along : 0);
    const wz = cz + (p.curbAxis === 'z' ? off : 0) + (runAxis === 'z' ? p.along : 0);
    _position.set(wx, this.heightAt(wx, wz), wz);
    _matrix.compose(_position, _identityQuat, _scale);
    mesh.setMatrixAt(slot, _matrix);
  }

  private writeSign(mesh: THREE.InstancedMesh, slot: number, p: SignPlacement): void {
    const off = p.lateralOffset * p.side;
    const wx = p.axis === 'x' ? tileToWorld(p.x) + off : tileToWorld(p.x);
    const wz = p.axis === 'z' ? tileToWorld(p.z) + off : tileToWorld(p.z);
    // Turn the board's flat face toward the road: a curb offset along x needs a
    // quarter turn; a z offset already faces along z.
    _quat.setFromAxisAngle(_yAxis, p.axis === 'x' ? Math.PI / 2 : 0);
    _position.set(wx, this.heightAt(wx, wz), wz);
    _matrix.compose(_position, _quat, _scale);
    mesh.setMatrixAt(slot, _matrix);
  }

  private disposeMeshes(): void {
    for (const mesh of [this.manholeMesh, this.boxMesh, this.meterMesh, this.signMesh])
      if (mesh) this.scene.remove(mesh);
    this.manholeMesh = null;
    this.boxMesh = null;
    this.meterMesh = null;
    this.signMesh = null;
  }

  /** Removes every layer from the scene and frees the shared geometries/materials. */
  dispose(): void {
    this.disposeMeshes();
    this.manholeGeometry.dispose();
    this.boxGeometry.dispose();
    this.meterGeometry.dispose();
    this.signGeometry.dispose();
    this.manholeMaterial.dispose();
    this.boxMaterial.dispose();
    this.meterMaterial.dispose();
    this.signMaterial.dispose();
  }
}
