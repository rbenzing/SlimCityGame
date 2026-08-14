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
  RoadSpec,
  RoadTier,
  VehicleKind,
  ZoneType,
} from '../shared/types';
import roadsData from '../data/roads.json';
import { TILE_METERS } from '../shared/constants';
import { carriagewayHalfWidthMeters, ROAD_Y_OFFSET, SIDEWALK_WIDTH_M } from './roadsmesh';
import {
  sizeForKind,
  variantScaleForKind,
  VehicleKitPool,
  VEHICLE_PALETTE_HEX,
} from './vehicles';
import { materialUnit } from './palette';
import { pushConformingQuad } from './groundquad';

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

// ---------------------------------------------------------------------------
// Where a car is allowed to stand: the road's rule, then the building's.
// ---------------------------------------------------------------------------

const ROAD_SPECS: readonly RoadSpec[] = (roadsData as { specs: RoadSpec[] }).specs;

/**
 * A detached home is big enough for a garage + driveway once its lot is 2x3
 * (area >= 6 tiles); a 2x2 home stays garage-less, as does a row house.
 */
export function hasGarage(entry: BuildingCatalogEntry): boolean {
  return entry.zone === ZoneType.ResLow && entry.footprint.w * entry.footprint.d >= 6;
}

/**
 * Whether cars may park along this tier's kerb. Data, not a rule derived from
 * speed: a through-route, a reserved bus or bike lane, tram rails and a railway
 * all have better uses for their edge than storage, so a tier earns kerbside
 * parking by declaring it (roads.json) rather than by omission.
 */
export function tierAllowsRoadsideParking(tier: RoadTier): boolean {
  return ROAD_SPECS.find((s) => s.tier === tier)?.roadsideParking === true;
}

/**
 * The road tile a building's driveway crosses — the mouth of its car park or
 * the end of its drive — or null when it has neither.
 *
 * Anything that stands on the kerb has to keep off this tile: it is the one
 * stretch of frontage cars drive over, so a lamp post planted in it sits in the
 * middle of the entrance.
 */
export function curbCutTileFor(
  entry: BuildingCatalogEntry,
  x: number,
  z: number,
  roadAt: (tileX: number, tileZ: number) => boolean,
): { x: number; z: number } | null {
  if (!hasOwnLotParking(entry, x, z, roadAt)) return null;
  const edge = findRoadFacingEdge(x, z, entry.footprint.w, entry.footprint.d, roadAt);
  return edge ? { x: edge.roadTileX, z: edge.roadTileZ } : null;
}

/** The categories whose occupants own cars at all. */
const PARKING_CATEGORIES: ReadonlySet<string> = new Set(['res', 'com', 'ind']);

/**
 * Whether a building parks its cars ON ITS OWN LOT — a commercial or industrial
 * bay row, or a house's garage and driveway.
 *
 * This is the half of the rule the street cares about: a lot with its own
 * parking does not ALSO line the kerb outside it. Somewhere to put the car is
 * somewhere to put the car, and a building that has it does not need the
 * street's, which is what leaves kerb space for the buildings that have none.
 */
export function hasOwnLotParking(
  entry: BuildingCatalogEntry,
  x: number,
  z: number,
  roadAt: (tileX: number, tileZ: number) => boolean,
): boolean {
  if (entry.category === 'com' || entry.category === 'ind') {
    const edge = findRoadFacingEdge(x, z, entry.footprint.w, entry.footprint.d, roadAt);
    return edge !== null && frontageInsetTiles(entry.category, edge) > 0;
  }
  // A house with a garage has a driveway to stand on; a small home or a row
  // house has neither, and is exactly who the kerb is for.
  return hasGarage(entry);
}

/**
 * Whether this building may line the kerb of the street it fronts: the street
 * has to allow parking, and the building has to have nowhere of its own.
 */
export function usesRoadsideParking(
  entry: BuildingCatalogEntry,
  x: number,
  z: number,
  roadAt: (tileX: number, tileZ: number) => boolean,
  roadTierAt: (tileX: number, tileZ: number) => RoadTier,
): boolean {
  // Only buildings whose people own cars. A water tower, a park or a civic
  // plinth has nobody to park, and lining the kerb outside one would read as
  // abandoned vehicles rather than as a working street.
  if (!PARKING_CATEGORIES.has(entry.category)) return false;
  if (hasOwnLotParking(entry, x, z, roadAt)) return false;
  const edge = findRoadFacingEdge(x, z, entry.footprint.w, entry.footprint.d, roadAt);
  if (!edge) return false;
  return tierAllowsRoadsideParking(roadTierAt(edge.roadTileX, edge.roadTileZ));
}

/** Max absolute per-car yaw jitter, radians — parked cars sit nearly straight in their bays. */
export const YAW_JITTER_MAX = 0.03;

/**
 * A parked car is painted from the same list as a moving one — see
 * VEHICLE_PALETTE_HEX. Tints the kit body region only (cabin, wheels and light
 * quads keep their baked colors).
 */
export const CAR_PALETTE: readonly number[] = VEHICLE_PALETTE_HEX;

const NEAR_WHITE_STRIPE_COLOR: readonly [number, number, number] = [0.93, 0.93, 0.9];
/** Bay aprons are asphalt, and asphalt is a measured material. */
const APRON_COLOR: readonly [number, number, number] = materialUnit('brightAsphalt');

/** Apron rides above the terrain overlays but below the road plate (0.15). */
const APRON_Y_OFFSET = 0.12;
const STRIPE_LINE_Y_OFFSET = 0.135;
const STRIPE_LINE_HALF_WIDTH_M = 0.06;

/** Sidewalk slabs sit this far above the road plate; the curb cut must clear them. */
const SIDEWALK_TOP_ABOVE_ROAD_M = 0.08;
/** The driveway crossing rides just over the sidewalk it interrupts. */
const CURB_CUT_Y_OFFSET = ROAD_Y_OFFSET + SIDEWALK_TOP_ABOVE_ROAD_M + 0.01;
/** Width of the lot's driveway entrance, in meters — two cars wide. */
export const CURB_CUT_WIDTH_M = 7;

/**
 * Grass verge between a building's footprint edge and the near edge of the
 * adjacent street's sidewalk. The road tile is TILE_METERS wide and centered
 * on the carriageway, so the verge is whatever is left over once the
 * carriageway half-width and the sidewalk are taken out — 0 on wide tiers
 * whose sidewalk already reaches the tile boundary.
 */
export function vergeDepthMeters(tier: RoadTier): number {
  return Math.max(0, TILE_METERS / 2 - carriagewayHalfWidthMeters(tier) - SIDEWALK_WIDTH_M);
}

/** Depth of the sidewalk band the curb cut crosses, clamped to what fits inside the road tile. */
export function sidewalkDepthMeters(tier: RoadTier): number {
  const toCarriageway = Math.max(0, TILE_METERS / 2 - carriagewayHalfWidthMeters(tier));
  return Math.min(SIDEWALK_WIDTH_M, toCarriageway);
}

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
  /** First road tile found along that side — the street the lot's driveway meets. */
  roadTileX: number;
  roadTileZ: number;
}

/** Index of the first road tile in the strip, or -1 when the strip has none. */
function firstRoadInStrip(
  startX: number,
  startZ: number,
  length: number,
  axis: 'x' | 'z',
  roadAt: (x: number, z: number) => boolean,
): number {
  for (let i = 0; i < length; i++) {
    const tx = axis === 'x' ? startX + i : startX;
    const tz = axis === 'z' ? startZ + i : startZ;
    if (roadAt(tx, tz)) return i;
  }
  return -1;
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

  const north = firstRoadInStrip(x, z - 1, w, 'x', roadAt);
  if (north >= 0) {
    return { side: 'N', edgeTiles: w, roadTileX: x + north, roadTileZ: z - 1 };
  }
  const east = firstRoadInStrip(x + w, z, d, 'z', roadAt);
  if (east >= 0) {
    return { side: 'E', edgeTiles: d, roadTileX: x + w, roadTileZ: z + east };
  }
  const south = firstRoadInStrip(x, z + d, w, 'x', roadAt);
  if (south >= 0) {
    return { side: 'S', edgeTiles: w, roadTileX: x + south, roadTileZ: z + d };
  }
  const west = firstRoadInStrip(x - 1, z, d, 'z', roadAt);
  if (west >= 0) {
    return { side: 'W', edgeTiles: d, roadTileX: x - 1, roadTileZ: z + west };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Lot occupancy over the day (pure)
// ---------------------------------------------------------------------------

/** Linear ramp from 0 at `from` to 1 at `to` (either direction), clamped outside. */
function ramp(v: number, from: number, to: number): number {
  const t = (v - from) / (to - from);
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Overnight floor for industrial lots — the late shift never fully clears out. */
export const IND_NIGHT_OCCUPANCY = 0.15;

/**
 * How full a lot is at a given time of day, 0..1, where `dayFraction` is the
 * day's progress (0 = midnight, 0.5 = midday) — the same clock the sky uses.
 * Commercial lots fill for trading hours and empty overnight; industrial lots
 * fill earlier for the day shift and keep a few late-shift vehicles all night.
 */
export function lotOccupancy(category: LotCategory, dayFraction: number): number {
  const hour = (((dayFraction % 1) + 1) % 1) * 24;
  if (category === 'com') {
    // Shut overnight; customers arrive from 08:00, peak trade 11:00-19:00, gone by 21:00.
    if (hour < 8 || hour >= 21) return 0;
    return hour < 11 ? ramp(hour, 8, 11) : hour <= 19 ? 1 : 1 - ramp(hour, 19, 21);
  }
  // Industry starts earlier and runs a skeleton late shift through the night.
  if (hour < 5 || hour >= 19) return IND_NIGHT_OCCUPANCY;
  const busy = hour < 8 ? ramp(hour, 5, 8) : hour <= 17 ? 1 : 1 - ramp(hour, 17, 19);
  return IND_NIGHT_OCCUPANCY + (1 - IND_NIGHT_OCCUPANCY) * busy;
}

/**
 * Each stall's own arrival threshold in [0,1): the stall holds a vehicle while
 * {@link lotOccupancy} is above it. Spreading thresholds across the row makes
 * cars trickle in and out one at a time instead of the lot blinking full/empty.
 */
export function stallOccupancyThreshold(buildingId: number, stallIndex: number): number {
  return hash2(buildingId, stallIndex * 7 + 3) / 0x100000000;
}

/** Whether a stall is parked-in at the given time of day. */
export function stallOccupied(
  category: LotCategory,
  buildingId: number,
  stallIndex: number,
  dayFraction: number,
): boolean {
  return stallOccupancyThreshold(buildingId, stallIndex) < lotOccupancy(category, dayFraction);
}

/**
 * How deep a strip the parking-bay row claims along a building's road-facing
 * footprint edge, in tiles: BAY_DEPTH_TILES for exactly the buildings this
 * renderer paints bays for (commercial/industrial lots with a road-facing
 * edge — the same gates applyOne uses), 0 for everything else. The single
 * source of truth body renderers (buildings/massing/props) use to set the
 * base box back from the frontage edge so the bay row sits flush in FRONT of
 * the facade instead of underneath it.
 */
export function frontageInsetTiles(category: string, edge: RoadFacingEdge | null): number {
  if (!edge) return 0;
  if (category !== 'com' && category !== 'ind') return 0;
  return BAY_DEPTH_TILES[category];
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
// Kerbside parking: cars parallel to the street rather than nose-in on a lot.
// ---------------------------------------------------------------------------

/** Nose-to-tail pitch, in tiles: a car plus the room to pull out of the space. */
export const ROADSIDE_PITCH_TILES = 0.375; // 6.0 m
/** Half a car's width — how far its centre clears the kerb line. */
const ROADSIDE_CAR_HALF_WIDTH_M = 0.9;
/** Kerb space left clear at each end of the frontage, in tiles (corners, driveways). */
export const ROADSIDE_END_MARGIN_TILES = 0.25;

/**
 * How far a kerbside car's centre sits OUTWARD from the building's footprint
 * edge, in tiles: across the verge, across the sidewalk, then half a car into
 * the carriageway. Positive is toward the street.
 */
export function roadsideDepthTiles(tier: RoadTier): number {
  return (
    (vergeDepthMeters(tier) + sidewalkDepthMeters(tier) + ROADSIDE_CAR_HALF_WIDTH_M) / TILE_METERS
  );
}

/** How many cars fit along a frontage, once both ends are kept clear. */
export function computeRoadsideStallCount(edgeTiles: number): number {
  const usable = edgeTiles - 2 * ROADSIDE_END_MARGIN_TILES;
  if (usable <= 0) return 0;
  return Math.max(0, Math.floor(usable / ROADSIDE_PITCH_TILES));
}

/**
 * Whether a car may stand at the kerb of THIS tile: there has to be a road
 * here, its tier has to allow parking, and it must not be a tile the road
 * crosses on both axes.
 *
 * A turn, a T or a crossroads has no kerb — the lateral offset that clears one
 * carriageway lands inside the other — which is the same rule that keeps lamps
 * and signs out of junctions. Checking the tile a car would actually stand in
 * is also what keeps it off the grass: a frontage is a straight line of tiles,
 * but the street it faces can curve away from it, and a row measured only from
 * the building would march right off the tarmac.
 */
export function kerbTileAllowsParking(
  tileX: number,
  tileZ: number,
  roadAt: (x: number, z: number) => boolean,
  roadTierAt: (x: number, z: number) => RoadTier,
): boolean {
  if (!roadAt(tileX, tileZ)) return false;
  if (!tierAllowsRoadsideParking(roadTierAt(tileX, tileZ))) return false;
  const hasEW = roadAt(tileX - 1, tileZ) || roadAt(tileX + 1, tileZ);
  const hasNS = roadAt(tileX, tileZ - 1) || roadAt(tileX, tileZ + 1);
  return !(hasEW && hasNS);
}

/**
 * Deterministic kerbside car centres along the frontage, the row centred on it.
 * Cars sit PARALLEL to the street — yaw a quarter turn off the nose-in bay
 * yaw — because that is what fits between a moving lane and a kerb.
 *
 * `tileAllows` vets the tile each car would actually stand in and drops the
 * ones that fail, so a row never runs off a bend onto the verge or parks in a
 * junction. Omitted, every candidate is kept (pure-geometry callers/tests).
 */
export function computeRoadsideStallPlacements(
  x: number,
  z: number,
  w: number,
  d: number,
  edge: RoadFacingEdge,
  tier: RoadTier,
  count: number,
  tileAllows?: (tileX: number, tileZ: number) => boolean,
): StallPlacement[] {
  if (count <= 0) return [];

  const frame = edgeFrameFor(edge.side, x, z, w, d);
  const pitchM = ROADSIDE_PITCH_TILES * TILE_METERS;
  const start = bayRowStart(edge.edgeTiles, count, ROADSIDE_PITCH_TILES);
  const baseYaw = EDGE_BASE_YAW[edge.side] + Math.PI / 2;
  const depth = roadsideDepthTiles(tier);

  const placements: StallPlacement[] = [];
  for (let i = 0; i < count; i++) {
    const along = start + (i + 0.5) * pitchM;
    const { x: worldX, z: worldZ } = frameToWorld(frame, along, depth);
    if (tileAllows) {
      const tileX = Math.floor(worldX / TILE_METERS);
      const tileZ = Math.floor(worldZ / TILE_METERS);
      if (!tileAllows(tileX, tileZ)) continue;
    }
    placements.push({ worldX, worldZ, baseYaw, along });
  }
  return placements;
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
  pushConformingQuad(positions, colors, x0, z0, x1, z1, yOffset, color, heightAt);
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

/** A parked stall plus the transform it uses while occupied (zero-scale hides it). */
interface Stall {
  ref: StallRef;
  matrix: THREE.Matrix4;
}

interface LotRecord {
  category: LotCategory;
  stalls: Stall[];
}

/** Occupancy is re-evaluated when the day advances by more than this fraction. */
const OCCUPANCY_STEP = 1 / 96;
const HIDDEN_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

export class ParkedCarRenderer {
  private readonly scene: THREE.Scene;
  private readonly heightAt: (x: number, z: number) => number;
  private readonly roadAt: (x: number, z: number) => boolean;
  private readonly catalogById: Map<string, BuildingCatalogEntry>;

  // Lit so the paved apron receives the parked cars' cast shadows (flat +Y
  // faces read nearly uniform in daylight, like the lit road).
  private readonly stripeMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

  private readonly roadTierAt: (x: number, z: number) => RoadTier;

  private readonly pools = new Map<number, VehicleKitPool>();
  private readonly buildingSlots = new Map<number, LotRecord>();
  private readonly buildingStripes = new Map<number, THREE.Mesh>();

  /** Time of day driving lot occupancy (0.5 = midday, the default until the clock reports in). */
  private dayFraction = 0.5;

  constructor(
    scene: THREE.Scene,
    heightAt: (x: number, z: number) => number,
    catalog: BuildingCatalogEntry[],
    roadAt: (x: number, z: number) => boolean,
    roadTierAt: (x: number, z: number) => RoadTier = () => RoadTier.TwoLane,
  ) {
    this.scene = scene;
    this.heightAt = heightAt;
    this.roadAt = roadAt;
    this.roadTierAt = roadTierAt;
    this.catalogById = new Map(catalog.map((entry) => [entry.id, entry]));
  }

  /**
   * Advances the clock that drives lot occupancy. Cheap to call every
   * snapshot: the stall pass only runs once the day has moved a visible step,
   * and each stall flips independently at its own threshold so vehicles
   * arrive and leave a few at a time.
   */
  setDayFraction(dayFraction: number): void {
    const next = ((dayFraction % 1) + 1) % 1;
    if (Math.abs(next - this.dayFraction) < OCCUPANCY_STEP) return;
    this.dayFraction = next;
    for (const [buildingId, lot] of this.buildingSlots) this.applyOccupancy(buildingId, lot);
    for (const pool of this.pools.values()) pool.finalize();
  }

  /** Writes each stall's real or hidden transform for the current time of day. */
  private applyOccupancy(buildingId: number, lot: LotRecord): void {
    for (let i = 0; i < lot.stalls.length; i++) {
      const stall = lot.stalls[i]!;
      const occupied = stallOccupied(lot.category, buildingId, i, this.dayFraction);
      const pool = this.pools.get(stall.ref.kind);
      pool?.mesh.setMatrixAt(stall.ref.slot, occupied ? stall.matrix : HIDDEN_MATRIX);
    }
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
    return (this.buildingSlots.get(buildingId)?.stalls ?? []).map((s) => s.ref);
  }

  /**
   * Where a building's stalls ARE, in world meters, whether or not a car is
   * standing in one right now. An empty stall is hidden with a zero-scale
   * matrix, so reading the mesh would report every unoccupied car at the origin
   * — the placement is what the kerb rules are about, not the occupancy.
   */
  stallWorldPositions(buildingId: number): { x: number; z: number }[] {
    return (this.buildingSlots.get(buildingId)?.stalls ?? []).map((s) => ({
      x: s.matrix.elements[12] ?? 0,
      z: s.matrix.elements[14] ?? 0,
    }));
  }

  /** How many of a building's stalls hold a vehicle right now. */
  occupiedStallCount(buildingId: number): number {
    const lot = this.buildingSlots.get(buildingId);
    if (!lot) return 0;
    let n = 0;
    for (let i = 0; i < lot.stalls.length; i++) {
      if (stallOccupied(lot.category, buildingId, i, this.dayFraction)) n += 1;
    }
    return n;
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

  /** A building's merged apron + bay-line mesh (undefined if it has none). */
  stripeMeshFor(buildingId: number): THREE.Mesh | undefined {
    return this.buildingStripes.get(buildingId);
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
    //
    // Everything else falls through to the kerb, which is where a building with
    // nowhere of its own puts its cars — and only there.
    if (entry.category !== 'com' && entry.category !== 'ind') {
      this.applyRoadside(building, entry);
      return;
    }
    const category: LotCategory = entry.category;

    const edge = findRoadFacingEdge(
      building.x,
      building.z,
      entry.footprint.w,
      entry.footprint.d,
      this.roadAt,
    );
    if (!edge) {
      this.applyRoadside(building, entry);
      return;
    }

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

    const stalls: Stall[] = [];
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

      _tmpColor.setHex(CAR_PALETTE[stallColorIndex(building.id, i)]!);
      pool.mesh.setColorAt(slot, _tmpColor);

      stalls.push({ ref: { kind, slot }, matrix: _matrix.clone() });
      touchedPools.add(pool);
    }

    const lot: LotRecord = { category, stalls };
    this.buildingSlots.set(building.id, lot);
    // Seed the new lot at the current hour, so a shop that finishes building
    // overnight opens with an empty forecourt rather than a full one.
    this.applyOccupancy(building.id, lot);
    for (const pool of touchedPools) pool.finalize();

    this.rebuildStripes(building, entry, edge, count, pitchTiles, depthTiles);
  }

  /**
   * Cars along the kerb for a building that parks nowhere of its own, on a
   * street whose tier allows it. Kerbside cars share the lot machinery — the
   * same pools, the same occupancy rhythm — so a street empties overnight the
   * way a forecourt does. No apron and no bay stripes: the space is the road's,
   * and the road is already paved.
   */
  private applyRoadside(building: BuildingInstance, entry: BuildingCatalogEntry): void {
    if (!usesRoadsideParking(entry, building.x, building.z, this.roadAt, this.roadTierAt)) return;

    const edge = findRoadFacingEdge(
      building.x,
      building.z,
      entry.footprint.w,
      entry.footprint.d,
      this.roadAt,
    );
    if (!edge) return;

    const tier = this.roadTierAt(edge.roadTileX, edge.roadTileZ);
    const count = computeRoadsideStallCount(edge.edgeTiles);
    if (count <= 0) return;

    const placements = computeRoadsideStallPlacements(
      building.x,
      building.z,
      entry.footprint.w,
      entry.footprint.d,
      edge,
      tier,
      count,
      (tileX, tileZ) => kerbTileAllowsParking(tileX, tileZ, this.roadAt, this.roadTierAt),
    );
    if (placements.length === 0) return;

    const stalls: Stall[] = [];
    const touchedPools = new Set<VehicleKitPool>();
    for (let i = 0; i < placements.length; i++) {
      const placement = placements[i]!;
      const kind = VehicleKind.Car; // a resident's car, never a box truck
      const pool = this.poolFor(kind);
      const slot = pool.allocate();

      const size = sizeForKind(kind);
      const variant = variantScaleForKind(kind, stallVariantIndex(building.id, i, kind));
      const sx = size[0] * variant[0];
      const sy = size[1] * variant[1];
      const sz = size[2] * variant[2];

      // A kerbside car stands on the carriageway, not on an apron.
      const groundY = this.heightAt(placement.worldX, placement.worldZ) + ROAD_Y_OFFSET;
      const yaw = placement.baseYaw + stallYawJitter(building.id, i);

      _position.set(placement.worldX, groundY + sy / 2, placement.worldZ);
      _quaternion.setFromAxisAngle(_yAxis, yaw);
      _scale.set(sx, sy, sz);
      _matrix.compose(_position, _quaternion, _scale);

      _tmpColor.setHex(CAR_PALETTE[stallColorIndex(building.id, i)]!);
      pool.mesh.setColorAt(slot, _tmpColor);

      stalls.push({ ref: { kind, slot }, matrix: _matrix.clone() });
      touchedPools.add(pool);
    }

    const lot: LotRecord = { category: 'com', stalls };
    this.buildingSlots.set(building.id, lot);
    this.applyOccupancy(building.id, lot);
    for (const pool of touchedPools) pool.finalize();
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
    const rowStart = bayRowStart(edge.edgeTiles, count, pitchTiles);
    const edgeLenM = edge.edgeTiles * TILE_METERS;

    // The light-grey apron: the bay row's depth, run the FULL length of the
    // frontage and out across the grass verge to meet the sidewalk, so the lot
    // reads as one paved forecourt rather than a strip under the cars.
    const tier = this.roadTierAt(edge.roadTileX, edge.roadTileZ);
    const vergeTiles = vergeDepthMeters(tier) / TILE_METERS;
    pushFrameQuad(
      positions,
      colors,
      frame,
      0,
      edgeLenM,
      vergeTiles,
      -depthTiles,
      APRON_Y_OFFSET,
      APRON_COLOR,
      this.heightAt,
    );

    // Curb cut: the driveway carries the same grey across the sidewalk to the
    // carriageway, so the street shows where vehicles enter the lot.
    const sidewalkTiles = sidewalkDepthMeters(tier) / TILE_METERS;
    if (sidewalkTiles > 0) {
      const cutCenter = edgeLenM / 2;
      const cutHalf = Math.min(CURB_CUT_WIDTH_M, edgeLenM) / 2;
      pushFrameQuad(
        positions,
        colors,
        frame,
        cutCenter - cutHalf,
        cutCenter + cutHalf,
        vergeTiles,
        vergeTiles + sidewalkTiles,
        CURB_CUT_Y_OFFSET,
        APRON_COLOR,
        this.heightAt,
      );
    }

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
    const lot = this.buildingSlots.get(buildingId);
    if (lot) {
      for (const stall of lot.stalls) this.pools.get(stall.ref.kind)?.free(stall.ref.slot);
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
