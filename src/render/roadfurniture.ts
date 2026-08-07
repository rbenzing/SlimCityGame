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
import { TILE_METERS, tileToWorld } from '../shared/constants';
import { carriagewayHalfWidthMeters, SIDEWALK_WIDTH_M } from './roadsmesh';

// --- Manhole -----------------------------------------------------------------
const MANHOLE_RADIUS = 0.5;
const MANHOLE_HEIGHT = 0.06; // rim thickness — stays low and flat
const MANHOLE_SEGMENTS = 24;
const MANHOLE_RIM_COLOR = 0x232327; // dark cast-iron rim, groove and seam
const MANHOLE_PLATE_COLOR = 0x34343b; // lighter center plate
const MANHOLE_LIFT = 0.03; // sits a hair proud of the road surface
const MANHOLE_MIN_OFFSET = 0.6; // kept off the centerline
const MANHOLE_EDGE_MARGIN = 0.5; // kept off the carriageway edge
const MANHOLE_SELECT_FRACTION = 1 / 6; // ~1 in 6 paved tiles

// --- Utility / electrical box ------------------------------------------------
const BOX_WIDTH = 0.62;
const BOX_HEIGHT = 1.2; // overall height — plinth + body + top cap
const BOX_DEPTH = 0.44;
const BOX_BODY_COLOR = 0x4c5a4c; // grey-green cabinet body
const BOX_DOOR_COLOR = 0x3f4a3f; // proud front door panel
const BOX_TRIM_COLOR = 0x2c332c; // plinth, cap and door seam
const BOX_SELECT_FRACTION = 1 / 12; // ~1 in 12 curbed tiles

// --- Parking meter -----------------------------------------------------------
const METER_POLE_RADIUS = 0.05;
const METER_POLE_HEIGHT = 0.85;
const METER_HEAD_W = 0.2;
const METER_HEAD_H = 0.26;
const METER_HEAD_D = 0.14;
const METER_POLE_COLOR = 0x6d6f74; // dark metal pole and top cap
const METER_HEAD_COLOR = 0x9a9ba0; // silver meter head
const METER_DISPLAY_COLOR = 0x20242a; // dark display face
const METER_PERIOD = 5; // a meter pair on every (x+z) multiple of 5
const METER_ALONG = 3; // the pair straddles the tile center by ±3m along the run

// --- Traffic signs -----------------------------------------------------------
// Standard road signs, each a recognizable shape+color on the shared pole.
const SIGN_POLE_RADIUS = 0.04;
const SIGN_POLE_HEIGHT = 2.2;
const SIGN_BOARD = 0.6; // board footprint used to seat every type near the pole top
const SIGN_BOARD_Y = SIGN_POLE_HEIGHT - SIGN_BOARD / 2 - 0.05; // board center height
const SIGN_POLE_COLOR = 0x50555d; // charcoal pole
const SIGN_RED = 0xc0392b; // regulatory / warning red
const SIGN_WHITE = 0xf0f0f0; // sign white
const SIGN_FIELD = 0xf3e9b5; // pale warning-triangle field
const SIGN_BLUE = 0x1f6fd0; // one-way blue
const ONEWAY_SIGN_PERIOD = 6; // a one-way marker on every (x+z) multiple of 6
const SPEED_SIGN_PERIOD = 10; // a speed marker on every (x+z) multiple of 10

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

/** The standard sign a road tile's role earns; see {@link classifySign}. */
export type SignType = 'stop' | 'giveway' | 'bend' | 'oneway' | 'speed' | 'nothrough';

export interface SignPlacement {
  x: number;
  z: number;
  axis: FurnitureAxis;
  side: FurnitureSide;
  lateralOffset: number;
  /** Which standard sign this tile's role earned. */
  type: SignType;
  /**
   * Bend signs on TURN tiles position by explicit world offset from the tile
   * center (the curve's outer corner, just past the curved sidewalk) with
   * their own facing yaw — the straight-axis side/lateralOffset rule would
   * strand them deep in the grass. Unset for every other sign.
   */
  worldOffsetX?: number;
  worldOffsetZ?: number;
  yaw?: number;
}

/**
 * Curbside offset (m): a full sidewalk width out from the carriageway edge, so
 * curbside props (boxes, meters, signs) sit clear of the road on the verge —
 * only manholes belong on the carriageway itself.
 */
function curbsideLateralOffset(tier: RoadTier | undefined): number {
  return carriagewayHalfWidthMeters(tier ?? RoadTier.TwoLane) + SIDEWALK_WIDTH_M;
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
const NEIGHBOR_DIRS: readonly {
  dx: number;
  dz: number;
  axis: FurnitureAxis;
  side: FurnitureSide;
}[] = [
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

interface PresentSides {
  n: boolean;
  e: boolean;
  s: boolean;
  w: boolean;
}

/** Which orthogonal neighbors are road tiles. */
function presentSides(tileSet: Set<number>, x: number, z: number): PresentSides {
  return {
    n: tileSet.has(tileKey(x, z - 1)),
    e: tileSet.has(tileKey(x + 1, z)),
    s: tileSet.has(tileKey(x, z + 1)),
    w: tileSet.has(tileKey(x - 1, z)),
  };
}

/** True iff the tile connects on exactly one axis — a straight-through run. */
function isCollinear2(sides: PresentSides): boolean {
  const ns = sides.n && sides.s && !sides.e && !sides.w;
  const ew = sides.e && sides.w && !sides.n && !sides.s;
  return ns || ew;
}

/**
 * True for a TURN tile: exactly two non-collinear road neighbors. The
 * carriageway sweeps a curve across the tile, so any straight-axis lateral
 * placement rule would drop props into the middle of the road — turn tiles
 * skip in-road/curbside furniture and get only the bend sign, positioned at
 * the curve's outer corner (see computeSignPlacements).
 */
function isTurnTile(tileSet: Set<number>, x: number, z: number): boolean {
  const sides = presentSides(tileSet, x, z);
  const count = (sides.n ? 1 : 0) + (sides.e ? 1 : 0) + (sides.s ? 1 : 0) + (sides.w ? 1 : 0);
  return count === 2 && !isCollinear2(sides);
}

/** The largest neighborCount among this tile's present road-neighbors (0 if none). */
function maxNeighborDegree(tileSet: Set<number>, x: number, z: number): number {
  let max = 0;
  for (const d of NEIGHBOR_DIRS) {
    const nx = x + d.dx;
    const nz = z + d.dz;
    if (tileSet.has(tileKey(nx, nz))) max = Math.max(max, neighborCount(tileSet, nx, nz));
  }
  return max;
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
    if (isTurnTile(tileSet, tile.x, tile.z)) continue; // curved carriageway: no straight-axis seat
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
    if (isTurnTile(tileSet, tile.x, tile.z)) continue; // the curve owns the tile; no curbside seat
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
    if (isTurnTile(tileSet, tile.x, tile.z)) continue; // no curb parking on a curve
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

/**
 * The one standard sign a road tile's role earns, or null. First match wins:
 * dead-end, then junction approach, then turn, then the periodic one-way / speed
 * markers on straight runs.
 */
function classifySign(tileSet: Set<number>, tile: FurnitureRoadTile): SignType | null {
  const { x, z } = tile;
  const nc = neighborCount(tileSet, x, z);

  if (nc === 1) return 'nothrough'; // dead-end

  // Approach into a junction: a low-degree tile whose busiest neighbor is one.
  if (nc <= 2) {
    const maxDeg = maxNeighborDegree(tileSet, x, z);
    if (maxDeg >= 4) return 'stop'; // crossroads approach
    if (maxDeg >= 3) return 'giveway'; // T-junction approach
  }

  const sides = presentSides(tileSet, x, z);
  if (nc === 2 && !isCollinear2(sides)) return 'bend'; // turn tile

  const straight = nc === 2 && isCollinear2(sides);
  if (tile.tier === RoadTier.OneWay && straight && periodHits(x, z, ONEWAY_SIGN_PERIOD))
    return 'oneway';
  if (
    (tile.tier === RoadTier.Highway || tile.tier === RoadTier.Avenue) &&
    straight &&
    periodHits(x, z, SPEED_SIGN_PERIOD)
  )
    return 'speed';

  return null;
}

/** How far past the curve's outer sidewalk edge the bend sign stands. */
const BEND_SIGN_CURVE_MARGIN = 0.5;

/** One typed sign per curbed tile whose road-tile role earns it. */
export function computeSignPlacements(roadTiles: readonly FurnitureRoadTile[]): SignPlacement[] {
  const tileSet = buildTileSet(roadTiles);
  const out: SignPlacement[] = [];
  for (const tile of roadTiles) {
    if (!tierHasCurb(tile.tier)) continue;

    const type = classifySign(tileSet, tile);
    if (!type) continue;

    if (type === 'bend') {
      // A turn tile's carriageway is a quarter-annulus centered on the corner
      // shared by its two connected edges. The sign stands on the OUTER side
      // of the curve — along the diagonal from that corner through the tile
      // center, just past the curved sidewalk band — facing back toward the
      // corner so drivers rounding the bend see the board.
      const sides = presentSides(tileSet, tile.x, tile.z);
      const half = TILE_METERS / 2;
      const cornerX = sides.e ? half : -half;
      const cornerZ = sides.s ? half : -half;
      const invLen = 1 / Math.hypot(cornerX, cornerZ);
      const dirX = -cornerX * invLen;
      const dirZ = -cornerZ * invLen;
      const radius =
        half +
        carriagewayHalfWidthMeters(tile.tier ?? RoadTier.TwoLane) +
        SIDEWALK_WIDTH_M +
        BEND_SIGN_CURVE_MARGIN;
      out.push({
        x: tile.x,
        z: tile.z,
        axis: 'x',
        side: 1,
        lateralOffset: 0,
        type,
        worldOffsetX: cornerX + dirX * radius,
        worldOffsetZ: cornerZ + dirZ * radius,
        yaw: Math.atan2(-dirX, -dirZ),
      });
      continue;
    }

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
      type,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Geometry merging — each source part painted a flat vertex color so one
// merged, instanced geometry carries distinctly-colored sub-parts.
// ---------------------------------------------------------------------------

/** Merges parts, painting each a flat color into a per-vertex color attribute. */
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

/**
 * Cast-iron cover: a dark full disc, a lighter center plate proud of it, a
 * concentric groove ring and a lift seam on top. Centered on local y=0 so it
 * seats near-flush with the road. The merge is tagged CylinderGeometry so the
 * shadow-flag test still finds this layer by geometry kind.
 */
function buildManholeGeometry(): THREE.BufferGeometry {
  const rim = new THREE.CylinderGeometry(
    MANHOLE_RADIUS,
    MANHOLE_RADIUS,
    MANHOLE_HEIGHT,
    MANHOLE_SEGMENTS,
  );
  const plate = new THREE.CylinderGeometry(
    MANHOLE_RADIUS - 0.08,
    MANHOLE_RADIUS - 0.08,
    MANHOLE_HEIGHT + 0.002,
    MANHOLE_SEGMENTS,
  );
  const groove = new THREE.RingGeometry(0.28, 0.33, MANHOLE_SEGMENTS);
  groove.rotateX(-Math.PI / 2);
  groove.translate(0, MANHOLE_HEIGHT / 2 + 0.002, 0);
  const seam = new THREE.BoxGeometry(MANHOLE_RADIUS * 1.4, 0.01, 0.05);
  seam.translate(0, MANHOLE_HEIGHT / 2 + 0.005, 0);
  const geometry = mergeColoredGeometries([
    { geometry: rim, color: MANHOLE_RIM_COLOR },
    { geometry: plate, color: MANHOLE_PLATE_COLOR },
    { geometry: groove, color: MANHOLE_RIM_COLOR },
    { geometry: seam, color: MANHOLE_RIM_COLOR },
  ]);
  return geometry;
}

/**
 * Street cabinet: a thin base plinth, the grey-green body, a proud front door
 * with a center seam, and a top cap. Centered on local y=0 (the renderer lifts
 * it by half its height). Tagged BoxGeometry so the shadow-flag test finds it.
 */
function buildBoxGeometry(): THREE.BufferGeometry {
  const bottom = -BOX_HEIGHT / 2;
  const bodyH = 1.0;
  const bodyY = bottom + 0.08 + bodyH / 2;
  const plinth = new THREE.BoxGeometry(BOX_WIDTH + 0.04, 0.08, BOX_DEPTH + 0.04);
  plinth.translate(0, bottom + 0.04, 0);
  const body = new THREE.BoxGeometry(BOX_WIDTH, bodyH, BOX_DEPTH);
  body.translate(0, bodyY, 0);
  const door = new THREE.BoxGeometry(0.5, 0.82, 0.03);
  door.translate(0, bodyY, BOX_DEPTH / 2 + 0.015);
  const seam = new THREE.BoxGeometry(0.02, 0.82, 0.02);
  seam.translate(0, bodyY, BOX_DEPTH / 2 + 0.03);
  const cap = new THREE.BoxGeometry(BOX_WIDTH + 0.04, 0.06, BOX_DEPTH + 0.04);
  cap.translate(0, bottom + 0.08 + bodyH + 0.03, 0);
  const geometry = mergeColoredGeometries([
    { geometry: plinth, color: BOX_TRIM_COLOR },
    { geometry: body, color: BOX_BODY_COLOR },
    { geometry: door, color: BOX_DOOR_COLOR },
    { geometry: seam, color: BOX_TRIM_COLOR },
    { geometry: cap, color: BOX_TRIM_COLOR },
  ]);
  return geometry;
}

/** Pole, a silver meter head with a dark display face, and a tapered top cap. */
function buildMeterGeometry(): THREE.BufferGeometry {
  const pole = new THREE.CylinderGeometry(
    METER_POLE_RADIUS,
    METER_POLE_RADIUS,
    METER_POLE_HEIGHT,
    12,
  );
  pole.translate(0, METER_POLE_HEIGHT / 2, 0);
  const headY = METER_POLE_HEIGHT + METER_HEAD_H / 2;
  const head = new THREE.BoxGeometry(METER_HEAD_W, METER_HEAD_H, METER_HEAD_D);
  head.translate(0, headY, 0);
  const display = new THREE.BoxGeometry(METER_HEAD_W - 0.06, METER_HEAD_H - 0.1, 0.02);
  display.translate(0, headY, METER_HEAD_D / 2 + 0.01);
  const cap = new THREE.CylinderGeometry(METER_POLE_RADIUS, METER_HEAD_W * 0.55, 0.05, 12);
  cap.translate(0, METER_POLE_HEIGHT + METER_HEAD_H + 0.025, 0);
  return mergeColoredGeometries([
    { geometry: pole, color: METER_POLE_COLOR },
    { geometry: head, color: METER_HEAD_COLOR },
    { geometry: display, color: METER_DISPLAY_COLOR },
    { geometry: cap, color: METER_POLE_COLOR },
  ]);
}

/** The shared charcoal pole every sign type sits on (base at local y=0). */
function buildSignPole(): THREE.BufferGeometry {
  const pole = new THREE.CylinderGeometry(SIGN_POLE_RADIUS, SIGN_POLE_RADIUS, SIGN_POLE_HEIGHT, 12);
  pole.translate(0, SIGN_POLE_HEIGHT / 2, 0);
  return pole;
}

/**
 * A flat triangular board (thin prism) from three (x,y) verts given CCW,
 * extruded a hair along z and centered on the board height. Normals computed so
 * the shared Lambert material lights it.
 */
function triangleBoard(points: readonly [number, number][], depth: number): THREE.BufferGeometry {
  const hz = depth / 2;
  const positions: number[] = [];
  for (const [px, py] of points) positions.push(px, py, hz); // 0,1,2 front
  for (const [px, py] of points) positions.push(px, py, -hz); // 3,4,5 back
  const indices = [0, 1, 2, 3, 5, 4];
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    indices.push(i, j, j + 3, i, j + 3, i + 3); // side quad
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** A thin forward-facing disc (octagon at 8 segments) centered on the board height. */
function discBoard(radius: number, segments: number, z: number): THREE.BufferGeometry {
  const disc = new THREE.CylinderGeometry(radius, radius, 0.05, segments);
  disc.rotateX(Math.PI / 2); // circular face now points forward (±z)
  disc.translate(0, SIGN_BOARD_Y, z);
  return disc;
}

/** Red OCTAGON with a white inset ring. */
function buildStopSign(): THREE.BufferGeometry {
  const board = discBoard(0.3, 8, 0);
  const ring = new THREE.RingGeometry(0.18, 0.24, 8);
  ring.translate(0, SIGN_BOARD_Y, 0.03);
  return mergeColoredGeometries([
    { geometry: buildSignPole(), color: SIGN_POLE_COLOR },
    { geometry: board, color: SIGN_RED },
    { geometry: ring, color: SIGN_WHITE },
  ]);
}

/** Red INVERTED triangle (point down) with a white inner triangle. */
function buildGiveWaySign(): THREE.BufferGeometry {
  const y = SIGN_BOARD_Y;
  const outer = triangleBoard(
    [
      [-0.28, y + 0.24],
      [0.28, y + 0.24],
      [0, y - 0.28],
    ],
    0.05,
  );
  const inner = triangleBoard(
    [
      [-0.18, y + 0.14],
      [0.18, y + 0.14],
      [0, y - 0.18],
    ],
    0.06,
  );
  return mergeColoredGeometries([
    { geometry: buildSignPole(), color: SIGN_POLE_COLOR },
    { geometry: outer, color: SIGN_RED },
    { geometry: inner, color: SIGN_WHITE },
  ]);
}

/** Red WARNING triangle (point up), pale field, a small dark curve bar. */
function buildBendSign(): THREE.BufferGeometry {
  const y = SIGN_BOARD_Y;
  const outer = triangleBoard(
    [
      [-0.28, y - 0.24],
      [0.28, y - 0.24],
      [0, y + 0.28],
    ],
    0.05,
  );
  const inner = triangleBoard(
    [
      [-0.18, y - 0.16],
      [0.18, y - 0.16],
      [0, y + 0.18],
    ],
    0.06,
  );
  const curve = new THREE.BoxGeometry(0.06, 0.18, 0.07);
  curve.translate(0, y - 0.02, 0.03);
  return mergeColoredGeometries([
    { geometry: buildSignPole(), color: SIGN_POLE_COLOR },
    { geometry: outer, color: SIGN_RED },
    { geometry: inner, color: SIGN_FIELD },
    { geometry: curve, color: MANHOLE_RIM_COLOR },
  ]);
}

/** Horizontal blue rectangle with a white arrow bar across it. */
function buildOneWaySign(): THREE.BufferGeometry {
  const board = new THREE.BoxGeometry(0.62, 0.24, 0.05);
  board.translate(0, SIGN_BOARD_Y, 0);
  const arrow = new THREE.BoxGeometry(0.46, 0.06, 0.06);
  arrow.translate(0, SIGN_BOARD_Y, 0.03);
  return mergeColoredGeometries([
    { geometry: buildSignPole(), color: SIGN_POLE_COLOR },
    { geometry: board, color: SIGN_BLUE },
    { geometry: arrow, color: SIGN_WHITE },
  ]);
}

/** White CIRCLE with a red ring (larger red disc set behind the white face). */
function buildSpeedSign(): THREE.BufferGeometry {
  const rim = discBoard(0.32, 20, -0.005);
  const face = discBoard(0.28, 20, 0.01);
  return mergeColoredGeometries([
    { geometry: buildSignPole(), color: SIGN_POLE_COLOR },
    { geometry: rim, color: SIGN_RED },
    { geometry: face, color: SIGN_WHITE },
  ]);
}

/** Red CIRCLE with a white horizontal bar — a no-entry read. */
function buildNoThroughSign(): THREE.BufferGeometry {
  const disc = discBoard(0.3, 20, 0);
  const bar = new THREE.BoxGeometry(0.4, 0.1, 0.06);
  bar.translate(0, SIGN_BOARD_Y, 0.03);
  return mergeColoredGeometries([
    { geometry: buildSignPole(), color: SIGN_POLE_COLOR },
    { geometry: disc, color: SIGN_RED },
    { geometry: bar, color: SIGN_WHITE },
  ]);
}

/** One merged board geometry per sign type, all on the shared charcoal pole. */
function buildSignGeometries(): Record<SignType, THREE.BufferGeometry> {
  return {
    stop: buildStopSign(),
    giveway: buildGiveWaySign(),
    bend: buildBendSign(),
    oneway: buildOneWaySign(),
    speed: buildSpeedSign(),
    nothrough: buildNoThroughSign(),
  };
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

  private readonly manholeGeometry = buildManholeGeometry();
  private readonly manholeMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

  private readonly boxGeometry = buildBoxGeometry();
  private readonly boxMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

  private readonly meterGeometry = buildMeterGeometry();
  private readonly meterMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

  private readonly signGeometries = buildSignGeometries();
  private readonly signMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

  private manholeMesh: THREE.InstancedMesh | null = null;
  private boxMesh: THREE.InstancedMesh | null = null;
  private meterMesh: THREE.InstancedMesh | null = null;
  private signMeshes: THREE.InstancedMesh[] = [];

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
      mesh.userData.furnitureKind = 'manhole';
      this.manholeMesh = mesh;
      this.scene.add(mesh);
    }

    if (this.boxes.length) {
      const mesh = new THREE.InstancedMesh(this.boxGeometry, this.boxMaterial, this.boxes.length);
      mesh.count = this.boxes.length;
      mesh.castShadow = true;
      for (let i = 0; i < this.boxes.length; i++) this.writeBox(mesh, i, this.boxes[i]!);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.userData.furnitureKind = 'box';
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
      mesh.userData.furnitureKind = 'meter';
      this.meterMesh = mesh;
      this.scene.add(mesh);
    }

    // One InstancedMesh per sign type present, grouping the placements by type.
    const byType = new Map<SignType, SignPlacement[]>();
    for (const s of this.signs) {
      const group = byType.get(s.type);
      if (group) group.push(s);
      else byType.set(s.type, [s]);
    }
    for (const [type, group] of byType) {
      const mesh = new THREE.InstancedMesh(
        this.signGeometries[type],
        this.signMaterial,
        group.length,
      );
      mesh.count = group.length;
      mesh.castShadow = true;
      for (let i = 0; i < group.length; i++) this.writeSign(mesh, i, group[i]!);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.userData.furnitureKind = 'sign';
      mesh.userData.signType = type;
      this.signMeshes.push(mesh);
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
    // Turn-tile bend signs carry an explicit world offset + facing yaw
    // (positioned at the curve's outer corner rather than by side rule).
    if (p.worldOffsetX !== undefined && p.worldOffsetZ !== undefined) {
      const wx = tileToWorld(p.x) + p.worldOffsetX;
      const wz = tileToWorld(p.z) + p.worldOffsetZ;
      _quat.setFromAxisAngle(_yAxis, p.yaw ?? 0);
      _position.set(wx, this.heightAt(wx, wz), wz);
      _matrix.compose(_position, _quat, _scale);
      mesh.setMatrixAt(slot, _matrix);
      return;
    }

    const off = p.lateralOffset * p.side;
    const wx = p.axis === 'x' ? tileToWorld(p.x) + off : tileToWorld(p.x);
    const wz = p.axis === 'z' ? tileToWorld(p.z) + off : tileToWorld(p.z);
    // Face the board along the road toward oncoming drivers (not across it): a
    // curb offset along x means the road runs N-S, so the board (default facing
    // ±z) already faces the traffic; a z offset means an E-W road, so quarter-turn
    // it to face ±x.
    _quat.setFromAxisAngle(_yAxis, p.axis === 'x' ? 0 : Math.PI / 2);
    _position.set(wx, this.heightAt(wx, wz), wz);
    _matrix.compose(_position, _quat, _scale);
    mesh.setMatrixAt(slot, _matrix);
  }

  private disposeMeshes(): void {
    for (const mesh of [this.manholeMesh, this.boxMesh, this.meterMesh])
      if (mesh) this.scene.remove(mesh);
    for (const mesh of this.signMeshes) this.scene.remove(mesh);
    this.manholeMesh = null;
    this.boxMesh = null;
    this.meterMesh = null;
    this.signMeshes = [];
  }

  /** Removes every layer from the scene and frees the shared geometries/materials. */
  dispose(): void {
    this.disposeMeshes();
    this.manholeGeometry.dispose();
    this.boxGeometry.dispose();
    this.meterGeometry.dispose();
    for (const geometry of Object.values(this.signGeometries)) geometry.dispose();
    this.manholeMaterial.dispose();
    this.boxMaterial.dispose();
    this.meterMaterial.dispose();
    this.signMaterial.dispose();
  }
}
