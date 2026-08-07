/**
 * Landmark ploppable detail kits (Airport). The airport is a
 * LANDMARK, not a transit system: every sim effect (land value, noise,
 * traffic/pollution, power/water draw, upkeep) already flows through the
 * EXISTING systems via its BuildingCatalogEntry and the
 * ordinary BuildingInstancer slab. This file adds ONLY the extra visual
 * identity — a "detail kit" rendered ON TOP of that same
 * slab: rooftop monitors, a control tower with a night beacon, an apron
 * ground plate with taxiway striping, static parked planes at jet-bridge
 * positions, and jet-bridge connector boxes — plus the night-only apron
 * lights and terminal window band. No flight/passenger simulation of any
 * kind lives here, or ever will.
 *
 * LandmarkRenderer acts ONLY on catalog ids in its internal registry
 * (LANDMARK_CATALOG_IDS, initially just 'airport'); every other catalog id is
 * ignored entirely — BuildingInstancer still renders that instance's base
 * slab, this file simply has nothing to add on top of it.
 *
 * Architecture mirrors the established renderer idioms exactly:
 *  - Reuses massing.ts's InstancedSlotPool (the codebase's shared
 *    capacity-doubling instanced-mesh slot allocator — already reused by
 *    massing.ts and props.ts) for every repeated kit part, so growth/removal
 *    bookkeeping is identical to every other renderer.
 *  - One LandmarkKit per REGISTERED catalog entry (built once, since a given
 *    catalog id's footprint/height never changes): merged/instanced geometry
 *    baked once from that entry's footprint, cheap per instance thereafter
 *    (one position+rotation compose per part, exactly like buildings.ts/
 *    massing.ts/props.ts).
 *  - The apron ground plate + taxiway stripes are the one per-instance custom
 *    BufferGeometry mesh (vertex-colored, heightAt-sampled corners), mirroring
 *    parked.ts's rebuildStripes exactly — they can't be pre-baked/instanced
 *    since a landmark's own footprint corners may sit at different terrain
 *    heights.
 *  - Removal zero-scales every slot a landmark instance owned (via
 *    InstancedSlotPool.free) and forgets its bookkeeping, exactly like
 *    every sibling renderer's swap/free convention.
 *
 * All placement is a PURE function of (catalog footprint/height[, instance
 * id]) — no Math.random/Date.now anywhere, matching every other render/*.ts
 * file. The pure layout functions below are exported so their positions/
 * counts are directly unit-testable without a THREE scene, exactly like
 * parked.ts's findRoadFacingEdge/computeStallPlacements and props.ts's
 * computePropPlacement/rotateLocalOffset.
 */
import * as THREE from 'three';
import { BuildingCatalogEntry, BuildingDelta, BuildingInstance } from '../shared/types';
import { TILE_METERS } from '../shared/constants';
import { InstancedSlotPool } from './massing';

// ---------------------------------------------------------------------------
// Registry ("acts ONLY on catalog ids in its landmark registry"). Fixed today
// to the airport; future landmarks (stadium, observatory) extend this same
// list and each gets its own LandmarkKit below.
// ---------------------------------------------------------------------------

export const LANDMARK_CATALOG_IDS: readonly string[] = ['airport'];

// ---------------------------------------------------------------------------
// Shared geometry helpers
// ---------------------------------------------------------------------------

export interface Vec2 {
  x: number;
  z: number;
}

interface Size3 {
  w: number;
  h: number;
  d: number;
}

/**
 * 32-bit avalanche mix ("triple32", public domain) -> [0,1). Deterministic;
 * never Math.random/Date.now. Each render/*.ts
 * file keeps its own copy of this exact recipe rather than importing it (see
 * buildings.ts's, massing.ts's, and props.ts's identical local copies).
 */
function hash1(n: number): number {
  let h = n >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/**
 * Rotates a LOCAL (unrotated footprint-frame) offset by rotation*90 degrees
 * about Y, matching buildings.ts's/massing.ts's/props.ts's own
 * `setFromAxisAngle(yAxis, rotation * PI/2)` convention exactly (see
 * landmarks.test.ts's cross-check against THREE.Vector3.applyQuaternion) —
 * so a kit part scattered in the footprint-local frame stays put on the
 * footprint regardless of the landmark instance's own rotation.
 */
export function rotateLocalXZ(x: number, z: number, rotation: 0 | 1 | 2 | 3): Vec2 {
  const theta = rotation * (Math.PI / 2);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return { x: x * cos + z * sin, z: -x * sin + z * cos };
}

export interface FootprintHalfExtents {
  halfW: number;
  halfD: number;
}

/** Half-extents of a catalog footprint, in world meters (local X = w, local Z = d). */
export function footprintHalfExtents(footprint: { w: number; d: number }): FootprintHalfExtents {
  return { halfW: (footprint.w * TILE_METERS) / 2, halfD: (footprint.d * TILE_METERS) / 2 };
}

/**
 * The footprint is conceptually split in half along local Z: negative-Z is
 * the "terminal half" (roof monitors + control tower sit here), non-negative
 * Z is the "apron half" (ground plate + taxiway + planes). z=0 is "the
 * terminal edge" jet bridges cross.
 */
export interface ApronRectLocal {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function computeApronRectLocal(footprint: { w: number; d: number }): ApronRectLocal {
  const { halfW, halfD } = footprintHalfExtents(footprint);
  return { minX: -halfW, maxX: halfW, minZ: 0, maxZ: halfD };
}

// ---------------------------------------------------------------------------
// Terminal roof monitors: 2 rooftop pods + a small dome,
// centered over the terminal half's roof.
// ---------------------------------------------------------------------------

const ROOF_POD_SIZE: Size3 = { w: 6, h: 3, d: 5 };
const ROOF_DOME_RADIUS = 3.4;
/** Symmetric left/right offset for the 2 pods, fraction of halfW. */
const ROOF_POD_X_FRACTION = 0.3;
/** Into the terminal (negative-Z) half, fraction of halfD. */
const ROOF_MONITOR_Z_FRACTION = 0.4;

export interface RoofMonitorLayout {
  pods: readonly [Vec2, Vec2];
  dome: Vec2;
}

/** Pure: deterministic per footprint (kit part positions deterministic per footprint). */
export function computeRoofMonitorLayout(footprint: { w: number; d: number }): RoofMonitorLayout {
  const { halfW, halfD } = footprintHalfExtents(footprint);
  const z = -halfD * ROOF_MONITOR_Z_FRACTION;
  const x = halfW * ROOF_POD_X_FRACTION;
  return {
    pods: [
      { x: -x, z },
      { x, z },
    ],
    dome: { x: 0, z },
  };
}

// ---------------------------------------------------------------------------
// Control tower: cylinder shaft + wider observation head, at a footprint
// corner — the terminal-side corner, inset from the true
// edge so it reads as standing ON the slab rather than hanging off it.
// ---------------------------------------------------------------------------

const TOWER_CORNER_FRACTION = 0.72;
const TOWER_SHAFT_RADIUS_TOP = 2.0;
const TOWER_SHAFT_RADIUS_BOTTOM = 2.4;
const TOWER_SHAFT_HEIGHT = 26;
const TOWER_HEAD_RADIUS_TOP = 4.0;
const TOWER_HEAD_RADIUS_BOTTOM = 4.6;
const TOWER_HEAD_HEIGHT = 4.5;
const TOWER_BEACON_RADIUS = 0.55;

/** Pure: deterministic per footprint. Terminal-side corner (negative x, negative z). */
export function computeControlTowerLocal(footprint: { w: number; d: number }): Vec2 {
  const { halfW, halfD } = footprintHalfExtents(footprint);
  return { x: -halfW * TOWER_CORNER_FRACTION, z: -halfD * TOWER_CORNER_FRACTION };
}

// ---------------------------------------------------------------------------
// Terminal window band emissive (night system): a horizontal
// glazing band wrapping the terminal half's own perimeter.
// ---------------------------------------------------------------------------

const WINDOW_BAND_BOTTOM_FRACTION = 0.55; // of entry.height
const WINDOW_BAND_HEIGHT_FRACTION = 0.16; // of entry.height
const WINDOW_BAND_THICKNESS = 0.4; // meters

export interface WindowBandVertical {
  yCenter: number;
  height: number;
}

/** Pure: deterministic per catalog height. */
export function computeWindowBandVertical(entryHeight: number): WindowBandVertical {
  const height = entryHeight * WINDOW_BAND_HEIGHT_FRACTION;
  const yCenter = entryHeight * WINDOW_BAND_BOTTOM_FRACTION + height / 2;
  return { yCenter, height };
}

// ---------------------------------------------------------------------------
// Apron ground plate + taxiway stripes covering the
// non-terminal half, and the planes/jet-bridges parked along the terminal
// edge.
// ---------------------------------------------------------------------------

const APRON_Y_OFFSET = 0.05;
const APRON_COLOR: readonly [number, number, number] = [0.56, 0.55, 0.52];
const TAXIWAY_COLOR: readonly [number, number, number] = [0.85, 0.78, 0.25];
const TAXIWAY_STRIPE_Y_OFFSET = 0.08;
const TAXIWAY_STRIPE_WIDTH = 0.9; // meters
const TAXIWAY_NEAR_FRACTION = 0.06; // of halfD, gap from the terminal edge
const TAXIWAY_FAR_FRACTION = 0.9; // of halfD, stops short of the apron's outer edge

/** "2-3 static parked planes". */
export const MIN_PLANES = 2;
export const MAX_PLANES = 3;
/** Minimum tile spacing a plane "lane" needs; bounds how many fit a narrow footprint. */
const PLANE_LANE_SPACING_TILES = 2;
/** Keeps the outermost planes off the footprint's side edges, fraction of halfW. */
const PLANE_EDGE_MARGIN_FRACTION = 0.75;
/** How far the nose sits past the terminal edge, fraction of halfD. */
const PLANE_NOSE_Z_FRACTION = 0.1;

const PLANE_FUSELAGE_WIDTH = 3.0;
const PLANE_FUSELAGE_HEIGHT = 3.2;
const PLANE_FUSELAGE_LENGTH = 20;
const PLANE_WING_SPAN = 19;
const PLANE_WING_DEPTH = 2.4;
const PLANE_WING_THICKNESS = 0.4;
const PLANE_WING_Z_FRACTION = 0.4; // of fuselage length, from the nose
const PLANE_TAIL_WIDTH = 0.5;
const PLANE_TAIL_HEIGHT = 4.4;
const PLANE_TAIL_DEPTH = 2.6;

const JETBRIDGE_WIDTH = 2.4;
const JETBRIDGE_HEIGHT = 2.6;

const LANDMARK_HASH_SLOT_MULTIPLIER = 4096;
const HASH_SLOT_PLANE_COUNT = 401;

/** Pure: how far a plane's nose sits past the terminal edge, deterministic per footprint. */
export function computeApronNoseZ(footprint: { w: number; d: number }): number {
  return footprintHalfExtents(footprint).halfD * PLANE_NOSE_Z_FRACTION;
}

/**
 * Deterministic 2-3 from (buildingId, footprint): a hashed
 * draw clamped by however many "lanes" the footprint width actually fits, so
 * a narrow footprint degrades gracefully instead of overflowing planes past
 * the building's own edges.
 */
export function computePlaneCount(buildingId: number, footprint: { w: number; d: number }): number {
  const maxByWidth = Math.floor(footprint.w / PLANE_LANE_SPACING_TILES);
  const seed = buildingId * LANDMARK_HASH_SLOT_MULTIPLIER + HASH_SLOT_PLANE_COUNT;
  const desired = MIN_PLANES + Math.floor(hash1(seed) * (MAX_PLANES - MIN_PLANES + 1));
  return Math.max(0, Math.min(desired, maxByWidth, MAX_PLANES));
}

export interface PlaneLocalPlacement {
  /** Local X (footprint-frame), meters. */
  x: number;
  /** Local Z: how far past the terminal edge (z=0) the nose sits, meters. */
  noseZ: number;
}

/**
 * Deterministic plane placements ("at jet-bridge positions
 * along the terminal edge"): computePlaneCount(...) planes evenly spread
 * across the usable width, all noses the same small distance past the
 * terminal edge.
 */
export function computePlaneLocalPlacements(
  buildingId: number,
  footprint: { w: number; d: number },
): PlaneLocalPlacement[] {
  const count = computePlaneCount(buildingId, footprint);
  if (count <= 0) return [];

  const { halfW } = footprintHalfExtents(footprint);
  const usableHalfW = halfW * PLANE_EDGE_MARGIN_FRACTION;
  const noseZ = computeApronNoseZ(footprint);

  const placements: PlaneLocalPlacement[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : (i / (count - 1)) * 2 - 1; // -1..1
    placements.push({ x: t * usableHalfW, noseZ });
  }
  return placements;
}

// ---------------------------------------------------------------------------
// Apron edge lights (night system): a ring of points around the
// apron rectangle's own perimeter, spaced like lamps.ts's road placement.
// ---------------------------------------------------------------------------

const APRON_LIGHT_SPACING_TILES = 1.5;
const APRON_LIGHT_RADIUS = 0.3;
const APRON_LIGHT_Y_OFFSET = 0.2;

function pointAtPerimeterDistance(rect: ApronRectLocal, distance: number): Vec2 {
  const width = rect.maxX - rect.minX;
  const depth = rect.maxZ - rect.minZ;
  let d = distance;
  if (d < width) return { x: rect.minX + d, z: rect.minZ };
  d -= width;
  if (d < depth) return { x: rect.maxX, z: rect.minZ + d };
  d -= depth;
  if (d < width) return { x: rect.maxX - d, z: rect.maxZ };
  d -= width;
  return { x: rect.minX, z: rect.maxZ - d };
}

/** Pure: deterministic ring of points around the apron rect's perimeter; count scales with footprint size. */
export function computeApronLightPlacementsLocal(footprint: { w: number; d: number }): Vec2[] {
  const rect = computeApronRectLocal(footprint);
  const width = rect.maxX - rect.minX;
  const depth = rect.maxZ - rect.minZ;
  const perimeter = 2 * (width + depth);
  if (perimeter <= 0) return [];

  const spacing = APRON_LIGHT_SPACING_TILES * TILE_METERS;
  const count = Math.max(4, Math.round(perimeter / spacing));
  const placements: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    placements.push(pointAtPerimeterDistance(rect, (i / count) * perimeter));
  }
  return placements;
}

// ---------------------------------------------------------------------------
// Tower beacon pulse (night system): pure sine pulse over
// elapsed visual time in ms, mirroring outline.ts's pulseOpacity/pin.ts's
// bobOffset idiom exactly (a caller-owned, deterministic clock — never
// Date.now). LandmarkRenderer.update(tMs) feeds this every frame; the
// nightFactor gate lives in the class (0 at day regardless of tMs).
// ---------------------------------------------------------------------------

export const BEACON_PULSE_PERIOD_MS = 1400;
export const BEACON_MIN_INTENSITY = 0.15;
export const BEACON_MAX_INTENSITY = 3.2;

/** Pure: slow sine pulse in [BEACON_MIN_INTENSITY, BEACON_MAX_INTENSITY], period BEACON_PULSE_PERIOD_MS. */
export function beaconPulseIntensity(tMs: number): number {
  const wave = (Math.sin((tMs / BEACON_PULSE_PERIOD_MS) * Math.PI * 2) + 1) / 2; // 0..1
  return BEACON_MIN_INTENSITY + wave * (BEACON_MAX_INTENSITY - BEACON_MIN_INTENSITY);
}

// ---------------------------------------------------------------------------
// Geometry builders (THREE-dependent; the pure layout math above feeds these)
// ---------------------------------------------------------------------------

/** Concatenates N indexed BufferGeometries (position+normal+index) into one, disposing the sources — generalizes parked.ts's 2-geometry merge to any count. */
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

/** 2 pods + a flat-bottomed dome (top hemisphere), merged, positions baked from computeRoofMonitorLayout; local Y=0 is the ROOF plane. */
function buildRoofMonitorGeometry(footprint: { w: number; d: number }): THREE.BufferGeometry {
  const layout = computeRoofMonitorLayout(footprint);

  const podA = new THREE.BoxGeometry(ROOF_POD_SIZE.w, ROOF_POD_SIZE.h, ROOF_POD_SIZE.d);
  podA.translate(layout.pods[0].x, ROOF_POD_SIZE.h / 2, layout.pods[0].z);

  const podB = new THREE.BoxGeometry(ROOF_POD_SIZE.w, ROOF_POD_SIZE.h, ROOF_POD_SIZE.d);
  podB.translate(layout.pods[1].x, ROOF_POD_SIZE.h / 2, layout.pods[1].z);

  // thetaLength = PI/2 sweeps from the north pole (y=+radius) to the equator
  // (y=0): a dome bulging upward with a flat (open, always roof-hidden) base.
  const dome = new THREE.SphereGeometry(ROOF_DOME_RADIUS, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.translate(layout.dome.x, 0, layout.dome.z);

  return mergeGeometries([podA, podB, dome]);
}

/** Shaft + wider observation head, merged, position baked from computeControlTowerLocal; local Y=0 is the GROUND plane. */
function buildTowerGeometry(footprint: { w: number; d: number }): THREE.BufferGeometry {
  const local = computeControlTowerLocal(footprint);

  const shaft = new THREE.CylinderGeometry(
    TOWER_SHAFT_RADIUS_TOP,
    TOWER_SHAFT_RADIUS_BOTTOM,
    TOWER_SHAFT_HEIGHT,
    10,
  );
  shaft.translate(local.x, TOWER_SHAFT_HEIGHT / 2, local.z);

  const head = new THREE.CylinderGeometry(
    TOWER_HEAD_RADIUS_TOP,
    TOWER_HEAD_RADIUS_BOTTOM,
    TOWER_HEAD_HEIGHT,
    12,
  );
  head.translate(local.x, TOWER_SHAFT_HEIGHT + TOWER_HEAD_HEIGHT / 2, local.z);

  return mergeGeometries([shaft, head]);
}

/** 4 thin box segments ringing the terminal half's own perimeter; local Y=0 is the GROUND plane, local XZ=0 is the footprint center. */
function buildWindowBandGeometry(
  footprint: { w: number; d: number },
  entryHeight: number,
): THREE.BufferGeometry {
  const { halfW, halfD } = footprintHalfExtents(footprint);
  const { yCenter, height } = computeWindowBandVertical(entryHeight);
  const t = WINDOW_BAND_THICKNESS;

  const north = new THREE.BoxGeometry(halfW * 2 + t, height, t);
  north.translate(0, yCenter, -halfD);

  const south = new THREE.BoxGeometry(halfW * 2 + t, height, t);
  south.translate(0, yCenter, 0);

  const east = new THREE.BoxGeometry(t, height, halfD + t);
  east.translate(halfW, yCenter, -halfD / 2);

  const west = new THREE.BoxGeometry(t, height, halfD + t);
  west.translate(-halfW, yCenter, -halfD / 2);

  return mergeGeometries([north, south, east, west]);
}

/** Fuselage (capsule-ish box) + wing slab + tail fin, merged; local origin is the NOSE, fuselage extends toward local +Z (the footprint-frame "into apron" direction). */
function buildPlaneGeometry(): THREE.BufferGeometry {
  const fuselage = new THREE.BoxGeometry(
    PLANE_FUSELAGE_WIDTH,
    PLANE_FUSELAGE_HEIGHT,
    PLANE_FUSELAGE_LENGTH,
  );
  fuselage.translate(0, PLANE_FUSELAGE_HEIGHT / 2, PLANE_FUSELAGE_LENGTH / 2);

  const wingZ = PLANE_FUSELAGE_LENGTH * PLANE_WING_Z_FRACTION;
  const wing = new THREE.BoxGeometry(PLANE_WING_SPAN, PLANE_WING_THICKNESS, PLANE_WING_DEPTH);
  wing.translate(0, PLANE_FUSELAGE_HEIGHT * 0.55, wingZ);

  const tail = new THREE.BoxGeometry(PLANE_TAIL_WIDTH, PLANE_TAIL_HEIGHT, PLANE_TAIL_DEPTH);
  tail.translate(
    0,
    PLANE_FUSELAGE_HEIGHT * 0.5 + PLANE_TAIL_HEIGHT / 2,
    PLANE_FUSELAGE_LENGTH - PLANE_TAIL_DEPTH / 2,
  );

  return mergeGeometries([fuselage, wing, tail]);
}

/** A single connector box spanning the terminal edge (local Z=0) to a plane's nose (local Z=noseZ). */
function buildJetBridgeGeometry(noseZ: number): THREE.BufferGeometry {
  const length = Math.max(0.01, noseZ);
  const geometry = new THREE.BoxGeometry(JETBRIDGE_WIDTH, JETBRIDGE_HEIGHT, length);
  geometry.translate(0, JETBRIDGE_HEIGHT / 2, length / 2);
  return geometry;
}

// ---------------------------------------------------------------------------
// Apron surface (ground plate + taxiway stripes): the one per-instance custom
// mesh, mirroring parked.ts's rebuildStripes exactly (vertex-colored quads,
// heightAt-sampled corners, one THREE.Mesh per landmark instance).
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

/**
 * Terrain-conforming axis-aligned WORLD-space quad: subdivided to ~2m cells
 * (a whole multi-tile apron with 4 height samples lets slopes bulge straight
 * through it) and split on the (x0,z1)-(x1,z0) diagonal to MATCH the terrain
 * mesh's own triangulation (render/zonegrid.ts's documented pattern).
 */
const CONFORM_CELL_M = 2;
function pushWorldQuad(
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
  const nx = Math.max(1, Math.ceil((x1 - x0) / CONFORM_CELL_M));
  const nz = Math.max(1, Math.ceil((z1 - z0) / CONFORM_CELL_M));
  const stepX = (x1 - x0) / nx;
  const stepZ = (z1 - z0) / nz;
  for (let iz = 0; iz < nz; iz++) {
    const cz0 = z0 + iz * stepZ;
    const cz1 = iz === nz - 1 ? z1 : cz0 + stepZ;
    for (let ix = 0; ix < nx; ix++) {
      const cx0 = x0 + ix * stepX;
      const cx1 = ix === nx - 1 ? x1 : cx0 + stepX;
      const y00 = heightAt(cx0, cz0) + yOffset;
      const y10 = heightAt(cx1, cz0) + yOffset;
      const y11 = heightAt(cx1, cz1) + yOffset;
      const y01 = heightAt(cx0, cz1) + yOffset;
      pushVertex(positions, colors, cx0, y00, cz0, color);
      pushVertex(positions, colors, cx0, y01, cz1, color);
      pushVertex(positions, colors, cx1, y10, cz0, color);
      pushVertex(positions, colors, cx0, y01, cz1, color);
      pushVertex(positions, colors, cx1, y11, cz1, color);
      pushVertex(positions, colors, cx1, y10, cz0, color);
    }
  }
}

/** Pushes a quad given in the footprint-LOCAL frame, rotated + translated to world (90-degree rotations keep it axis-aligned, so min/max still forms a valid world rect). */
function pushLocalQuad(
  positions: number[],
  colors: number[],
  localX0: number,
  localZ0: number,
  localX1: number,
  localZ1: number,
  yOffset: number,
  color: readonly [number, number, number],
  centerX: number,
  centerZ: number,
  rotation: 0 | 1 | 2 | 3,
  heightAt: (x: number, z: number) => number,
): void {
  const a = rotateLocalXZ(localX0, localZ0, rotation);
  const b = rotateLocalXZ(localX1, localZ1, rotation);
  const wx0 = Math.min(centerX + a.x, centerX + b.x);
  const wx1 = Math.max(centerX + a.x, centerX + b.x);
  const wz0 = Math.min(centerZ + a.z, centerZ + b.z);
  const wz1 = Math.max(centerZ + a.z, centerZ + b.z);
  pushWorldQuad(positions, colors, wx0, wz0, wx1, wz1, yOffset, color, heightAt);
}

function buildApronSurfaceGeometry(
  building: BuildingInstance,
  entry: BuildingCatalogEntry,
  centerX: number,
  centerZ: number,
  heightAt: (x: number, z: number) => number,
): { geometry: THREE.BufferGeometry; stripeCount: number } {
  const rect = computeApronRectLocal(entry.footprint);
  const positions: number[] = [];
  const colors: number[] = [];

  pushLocalQuad(
    positions,
    colors,
    rect.minX,
    rect.minZ,
    rect.maxX,
    rect.maxZ,
    APRON_Y_OFFSET,
    APRON_COLOR,
    centerX,
    centerZ,
    building.rotation,
    heightAt,
  );

  const placements = computePlaneLocalPlacements(building.id, entry.footprint);
  const halfD = rect.maxZ - rect.minZ;
  const z0 = halfD * TAXIWAY_NEAR_FRACTION;
  const z1 = halfD * TAXIWAY_FAR_FRACTION;
  const halfStripeWidth = TAXIWAY_STRIPE_WIDTH / 2;
  for (const p of placements) {
    pushLocalQuad(
      positions,
      colors,
      p.x - halfStripeWidth,
      z0,
      p.x + halfStripeWidth,
      z1,
      TAXIWAY_STRIPE_Y_OFFSET,
      TAXIWAY_COLOR,
      centerX,
      centerZ,
      building.rotation,
      heightAt,
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return { geometry, stripeCount: placements.length };
}

// ---------------------------------------------------------------------------
// LandmarkRenderer
// ---------------------------------------------------------------------------

export type LandmarkPartKind =
  'roofMonitor' | 'tower' | 'beacon' | 'windowBand' | 'apronLight' | 'plane' | 'jetBridge';

const ALL_LANDMARK_PART_KINDS: readonly LandmarkPartKind[] = [
  'roofMonitor',
  'tower',
  'beacon',
  'windowBand',
  'apronLight',
  'plane',
  'jetBridge',
];

const STRUCTURE_COLOR = 0xcac5b8;
const BEACON_COLOR = 0xff2a2a;
const APRON_LIGHT_COLOR = 0xfff0c2;
const WINDOW_BAND_COLOR = 0xffd9a0;
const PLANE_COLOR = 0xe4e6e8;
const JETBRIDGE_COLOR = 0x9a9c9f;

const INITIAL_KIT_CAPACITY = 4;
const INITIAL_APRON_LIGHT_CAPACITY = 32;

interface LandmarkKit {
  entry: BuildingCatalogEntry;
  pools: Record<LandmarkPartKind, InstancedSlotPool>;
  beaconMaterial: THREE.MeshLambertMaterial;
  apronLightMaterial: THREE.MeshLambertMaterial;
  windowBandMaterial: THREE.MeshLambertMaterial;
}

interface InstanceSlots {
  catalogId: string;
  roofMonitor: number;
  tower: number;
  beacon: number;
  windowBand: number;
  apronLights: number[];
  planes: number[];
  jetBridges: number[];
}

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _unitScale = new THREE.Vector3(1, 1, 1);
const _yAxis = new THREE.Vector3(0, 1, 0);

export class LandmarkRenderer {
  private readonly scene: THREE.Scene;
  private readonly heightAt: (x: number, z: number) => number;
  private readonly landmarkIds: ReadonlySet<string>;
  private readonly kits = new Map<string, LandmarkKit>();
  private readonly instanceSlots = new Map<number, InstanceSlots>();
  private readonly apronSurfaces = new Map<number, THREE.Mesh>();
  private readonly apronSurfaceMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });

  private nightFactorValue = 0;
  private lastTMs = 0;

  constructor(
    scene: THREE.Scene,
    heightAt: (x: number, z: number) => number,
    catalog: BuildingCatalogEntry[],
  ) {
    this.scene = scene;
    this.heightAt = heightAt;
    this.landmarkIds = new Set(LANDMARK_CATALOG_IDS);
    for (const entry of catalog) {
      if (this.landmarkIds.has(entry.id)) this.kits.set(entry.id, this.buildKit(entry));
    }
  }

  /** Consumes one BuildingDelta: non-registry catalog ids are ignored entirely (BuildingInstancer still draws their base slab). */
  apply(delta: BuildingDelta): void {
    for (const id of delta.removed) this.freeInstance(id);
    for (const building of delta.added) this.applyOne(building);
    for (const building of delta.updated) this.applyOne(building);

    for (const kit of this.kits.values()) {
      for (const kind of ALL_LANDMARK_PART_KINDS) kit.pools[kind].commit();
    }
  }

  /** 0 (day) .. 1 (night): drives the apron lights' + window band's steady glow, and gates the beacon pulse. */
  setNightFactor(nightFactor: number): void {
    this.nightFactorValue = Math.min(1, Math.max(0, nightFactor));
    for (const kit of this.kits.values()) {
      kit.apronLightMaterial.emissiveIntensity = this.nightFactorValue;
      kit.windowBandMaterial.emissiveIntensity = this.nightFactorValue;
    }
    this.applyBeaconIntensity();
  }

  /** Advances the tower-beacon's slow pulse; call every frame with elapsed visual time in ms (never Date.now — the caller owns a deterministic clock, exactly like water.ts/clouds.ts/outline.ts). */
  update(tMs: number): void {
    this.lastTMs = tMs;
    this.applyBeaconIntensity();
  }

  // --- introspection (tests + future picking/debug) --------------------------

  /** Whether a catalog id is acted on by this renderer at all (the renderer's registry). */
  isLandmarkCatalogId(catalogId: string): boolean {
    return this.landmarkIds.has(catalogId);
  }

  hasInstance(buildingId: number): boolean {
    return this.instanceSlots.has(buildingId);
  }

  /** Slot indices of one kit-part kind currently owned by a landmark instance (empty if it has none / is unknown). */
  partSlotsFor(buildingId: number, kind: LandmarkPartKind): readonly number[] {
    const slots = this.instanceSlots.get(buildingId);
    if (!slots) return [];
    return this.slotsOf(slots, kind);
  }

  getPartMatrix(catalogId: string, kind: LandmarkPartKind, slot: number, out: THREE.Matrix4): void {
    this.kits.get(catalogId)?.pools[kind].getMatrixAt(slot, out);
  }

  instanceCount(catalogId: string, kind: LandmarkPartKind): number {
    return this.kits.get(catalogId)?.pools[kind].instanceCount() ?? 0;
  }

  nightFactor(): number {
    return this.nightFactorValue;
  }

  beaconIntensity(catalogId: string): number {
    return this.kits.get(catalogId)?.beaconMaterial.emissiveIntensity ?? 0;
  }

  apronLightIntensity(catalogId: string): number {
    return this.kits.get(catalogId)?.apronLightMaterial.emissiveIntensity ?? 0;
  }

  windowBandIntensity(catalogId: string): number {
    return this.kits.get(catalogId)?.windowBandMaterial.emissiveIntensity ?? 0;
  }

  hasApronSurface(buildingId: number): boolean {
    return this.apronSurfaces.has(buildingId);
  }

  apronSurfaceVertexCountFor(buildingId: number): number {
    const mesh = this.apronSurfaces.get(buildingId);
    const pos = mesh?.geometry.getAttribute('position');
    return pos ? pos.count : 0;
  }

  // --- internals ---------------------------------------------------------------

  private slotsOf(slots: InstanceSlots, kind: LandmarkPartKind): readonly number[] {
    switch (kind) {
      case 'roofMonitor':
        return [slots.roofMonitor];
      case 'tower':
        return [slots.tower];
      case 'beacon':
        return [slots.beacon];
      case 'windowBand':
        return [slots.windowBand];
      case 'apronLight':
        return slots.apronLights;
      case 'plane':
        return slots.planes;
      case 'jetBridge':
        return slots.jetBridges;
      default:
        throw new RangeError(`LandmarkRenderer: unknown part kind ${kind as string}`);
    }
  }

  private applyBeaconIntensity(): void {
    const intensity = this.nightFactorValue * beaconPulseIntensity(this.lastTMs);
    for (const kit of this.kits.values()) kit.beaconMaterial.emissiveIntensity = intensity;
  }

  private buildKit(entry: BuildingCatalogEntry): LandmarkKit {
    const scene = this.scene;
    const noseZ = computeApronNoseZ(entry.footprint);

    const structureMaterial = new THREE.MeshLambertMaterial({ color: STRUCTURE_COLOR });
    const planeMaterial = new THREE.MeshLambertMaterial({ color: PLANE_COLOR });
    const jetBridgeMaterial = new THREE.MeshLambertMaterial({ color: JETBRIDGE_COLOR });
    const beaconMaterial = new THREE.MeshLambertMaterial({
      color: BEACON_COLOR,
      emissive: BEACON_COLOR,
      emissiveIntensity: 0,
    });
    const apronLightMaterial = new THREE.MeshLambertMaterial({
      color: APRON_LIGHT_COLOR,
      emissive: APRON_LIGHT_COLOR,
      emissiveIntensity: 0,
    });
    const windowBandMaterial = new THREE.MeshLambertMaterial({
      color: WINDOW_BAND_COLOR,
      emissive: WINDOW_BAND_COLOR,
      emissiveIntensity: 0,
    });

    const pools: Record<LandmarkPartKind, InstancedSlotPool> = {
      roofMonitor: new InstancedSlotPool(
        scene,
        buildRoofMonitorGeometry(entry.footprint),
        structureMaterial,
        INITIAL_KIT_CAPACITY,
      ),
      tower: new InstancedSlotPool(
        scene,
        buildTowerGeometry(entry.footprint),
        structureMaterial,
        INITIAL_KIT_CAPACITY,
      ),
      beacon: new InstancedSlotPool(
        scene,
        new THREE.SphereGeometry(TOWER_BEACON_RADIUS, 8, 6),
        beaconMaterial,
        INITIAL_KIT_CAPACITY,
      ),
      windowBand: new InstancedSlotPool(
        scene,
        buildWindowBandGeometry(entry.footprint, entry.height),
        windowBandMaterial,
        INITIAL_KIT_CAPACITY,
      ),
      apronLight: new InstancedSlotPool(
        scene,
        new THREE.SphereGeometry(APRON_LIGHT_RADIUS, 6, 5),
        apronLightMaterial,
        INITIAL_APRON_LIGHT_CAPACITY,
      ),
      plane: new InstancedSlotPool(
        scene,
        buildPlaneGeometry(),
        planeMaterial,
        INITIAL_KIT_CAPACITY,
      ),
      jetBridge: new InstancedSlotPool(
        scene,
        buildJetBridgeGeometry(noseZ),
        jetBridgeMaterial,
        INITIAL_KIT_CAPACITY,
      ),
    };

    return { entry, pools, beaconMaterial, apronLightMaterial, windowBandMaterial };
  }

  private placeAt(
    pool: InstancedSlotPool,
    x: number,
    y: number,
    z: number,
    rotation: 0 | 1 | 2 | 3,
  ): number {
    const slot = pool.allocate();
    _position.set(x, y, z);
    _quaternion.setFromAxisAngle(_yAxis, rotation * (Math.PI / 2));
    _matrix.compose(_position, _quaternion, _unitScale);
    pool.setMatrixAt(slot, _matrix);
    return slot;
  }

  private applyOne(building: BuildingInstance): void {
    if (!this.landmarkIds.has(building.catalogId)) return; // registry filter: every other catalog id is ignored
    this.freeInstance(building.id);

    const kit = this.kits.get(building.catalogId);
    if (!kit) return; // registry says landmark, but no matching catalog entry was provided — nothing to build

    const entry = kit.entry;
    const centerX = (building.x + entry.footprint.w / 2) * TILE_METERS;
    const centerZ = (building.z + entry.footprint.d / 2) * TILE_METERS;
    const groundY = this.heightAt(centerX, centerZ);
    const rotation = building.rotation;

    const roofMonitor = this.placeAt(
      kit.pools.roofMonitor,
      centerX,
      groundY + entry.height,
      centerZ,
      rotation,
    );
    const tower = this.placeAt(kit.pools.tower, centerX, groundY, centerZ, rotation);
    const windowBand = this.placeAt(kit.pools.windowBand, centerX, groundY, centerZ, rotation);

    const towerLocal = computeControlTowerLocal(entry.footprint);
    const towerRotated = rotateLocalXZ(towerLocal.x, towerLocal.z, rotation);
    const beaconY = groundY + TOWER_SHAFT_HEIGHT + TOWER_HEAD_HEIGHT + TOWER_BEACON_RADIUS;
    const beacon = this.placeAt(
      kit.pools.beacon,
      centerX + towerRotated.x,
      beaconY,
      centerZ + towerRotated.z,
      rotation,
    );

    const apronLights: number[] = [];
    for (const local of computeApronLightPlacementsLocal(entry.footprint)) {
      const rotated = rotateLocalXZ(local.x, local.z, rotation);
      apronLights.push(
        this.placeAt(
          kit.pools.apronLight,
          centerX + rotated.x,
          groundY + APRON_LIGHT_Y_OFFSET,
          centerZ + rotated.z,
          rotation,
        ),
      );
    }

    const planes: number[] = [];
    const jetBridges: number[] = [];
    for (const p of computePlaneLocalPlacements(building.id, entry.footprint)) {
      const planeRotated = rotateLocalXZ(p.x, p.noseZ, rotation);
      planes.push(
        this.placeAt(
          kit.pools.plane,
          centerX + planeRotated.x,
          groundY,
          centerZ + planeRotated.z,
          rotation,
        ),
      );

      const bridgeRotated = rotateLocalXZ(p.x, 0, rotation);
      jetBridges.push(
        this.placeAt(
          kit.pools.jetBridge,
          centerX + bridgeRotated.x,
          groundY,
          centerZ + bridgeRotated.z,
          rotation,
        ),
      );
    }

    this.instanceSlots.set(building.id, {
      catalogId: building.catalogId,
      roofMonitor,
      tower,
      beacon,
      windowBand,
      apronLights,
      planes,
      jetBridges,
    });

    const { geometry } = buildApronSurfaceGeometry(
      building,
      entry,
      centerX,
      centerZ,
      this.heightAt,
    );
    const mesh = new THREE.Mesh(geometry, this.apronSurfaceMaterial);
    this.scene.add(mesh);
    this.apronSurfaces.set(building.id, mesh);
  }

  private freeInstance(buildingId: number): void {
    const slots = this.instanceSlots.get(buildingId);
    if (slots) {
      const kit = this.kits.get(slots.catalogId);
      if (kit) {
        kit.pools.roofMonitor.free(slots.roofMonitor);
        kit.pools.tower.free(slots.tower);
        kit.pools.beacon.free(slots.beacon);
        kit.pools.windowBand.free(slots.windowBand);
        for (const s of slots.apronLights) kit.pools.apronLight.free(s);
        for (const s of slots.planes) kit.pools.plane.free(s);
        for (const s of slots.jetBridges) kit.pools.jetBridge.free(s);
      }
      this.instanceSlots.delete(buildingId);
    }

    const apron = this.apronSurfaces.get(buildingId);
    if (apron) {
      this.scene.remove(apron);
      apron.geometry.dispose();
      this.apronSurfaces.delete(buildingId);
    }
  }
}
