/**
 * Parked cars & lot life: a static, deterministic occupancy signal. A
 * suburban commercial or industrial lot's car park is drawn to code from its
 * lot plan (lotplan.ts) — stall lines, accessible spaces, berths, planted
 * islands and their trees — and its cars stand one to a stall, NOSE-IN; a
 * building with nowhere of its own parks at the kerb. Cars are real
 * vehicle-kit models (render/vehicles.ts geometries — wheels, cabin, light
 * quads, body-only palette tint).
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
} from '../shared/types';
import roadsData from '../data/roads.json';
import type { RoadProfile } from '../shared/types';
import { TILE_METERS } from '../shared/constants';
import { footprintForRotation } from '../shared/footprint';
import { ACCESSIBLE_SYMBOL_M, accessibilitySymbolPaint, ROAD_Y_OFFSET } from './roadsmesh';
import { clearOfNoParking, type KerbStall, type ParkingSetbacks } from '../shared/kerbstalls';
import type { LotRect, LotStall, StallNose } from '../shared/lotlayout';
import { lotPlanFor, lotPointToWorld, type LotPlan } from './lotplan';
import { InstancedSlotPool } from './massing';
import { buildBroadleafGeometry } from './trees';
import { parkingLaneOffset } from '../shared/roadprofile';
import { isFarmEntry, isHouseEntry } from './archetypes';
import {
  edgeFrameFor,
  findRoadFacingEdge,
  frameToWorld,
  sidewalkDepthMeters,
  vergeDepthMeters,
  type EdgeFrame,
  type RoadFacingEdge,
} from './frontage';
import { kerbSideFacing, type KerbSide, type Side } from '../shared/roadedge';
import type { KerbSurroundings } from '../shared/kerblayout';
import { sizeForKind, variantScaleForKind, VehicleKitPool, VEHICLE_PALETTE_HEX } from './vehicles';
import { materialUnit } from './palette';
import { pushConformingQuad } from './groundquad';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/** Lot category: commercial rows park customer cars, industrial rows mix in trucks. */
export type LotCategory = 'com' | 'ind';

// ---------------------------------------------------------------------------
// Where a car is allowed to stand: the road's rule, then the building's.
// ---------------------------------------------------------------------------

const ROAD_SPECS: readonly RoadSpec[] = (roadsData as { specs: RoadSpec[] }).specs;

/**
 * Whether this tier's kerb may be stopped at. Data, not a rule derived from
 * speed: a through-route, a reserved bus or bike lane, tram rails and a railway
 * all have better uses for their edge than storage, so a tier earns kerbside
 * parking by declaring it (roads.json) rather than by omission.
 */
export function tierAllowsRoadsideParking(tier: RoadTier): boolean {
  return ROAD_SPECS.find((s) => s.tier === tier)?.roadsideParking === true;
}

/**
 * When a kerb may be parked at. Beside a painted parking lane, at any hour —
 * that is what the lane is for. Where the tier allows parking but paints no
 * lane, only for short stays by day, since nothing on the street says a car
 * may be left there overnight. Anywhere else, never.
 */
export type KerbAllowance = 'anyHour' | 'daytime' | 'none';

export { kerbSideFacing, type KerbSide } from '../shared/roadedge';

export function kerbAllowance(
  tier: RoadTier,
  profile: RoadProfile | null,
  side: KerbSide,
): KerbAllowance {
  if (profile && parkingLaneOffset(profile, side) !== null) return 'anyHour';
  return tierAllowsRoadsideParking(tier) ? 'daytime' : 'none';
}

/**
 * The road tile a commercial or industrial lot's car park opens onto, or null
 * when it has no car park. A home's drives are its own plan's (houselot.ts).
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
  rotation: 0 | 1 | 2 | 3 = 0,
  kerb: KerbSurroundings | null = null,
): { x: number; z: number } | null {
  const plan = parkingPlanFor(entry, x, z, roadAt, rotation, kerb);
  if (!plan) return null;
  const { edge, frame, layout } = plan;
  // The road tile across the edge from the middle of the driveway.
  const mid = lotPointToWorld(frame, (layout.curbCut.u0 + layout.curbCut.u1) / 2, 0);
  const alongTile = Math.floor((frame.alongX ? mid.x : mid.z) / TILE_METERS);
  const tile = frame.alongX
    ? { x: alongTile, z: edge.roadTileZ }
    : { x: edge.roadTileX, z: alongTile };
  return roadAt(tile.x, tile.z) ? tile : { x: edge.roadTileX, z: edge.roadTileZ };
}

/**
 * A building's lot plan when it parks on its own lot: suburban, fronting a
 * road, with a space to draw once its kerb credit is counted. A lot the kerb
 * credit or the small-use exemption leaves nothing to hold draws no car park.
 */
function parkingPlanFor(
  entry: BuildingCatalogEntry,
  x: number,
  z: number,
  roadAt: (tileX: number, tileZ: number) => boolean,
  rotation: 0 | 1 | 2 | 3,
  kerb: KerbSurroundings | null,
): LotPlan | null {
  if (entry.category !== 'com' && entry.category !== 'ind') return null;
  const plan = lotPlanFor(entry, x, z, roadAt, rotation, kerb);
  return plan && plan.layout.provided > 0 ? plan : null;
}

/** The categories whose occupants own cars at all. */
const PARKING_CATEGORIES: ReadonlySet<string> = new Set(['res', 'com', 'ind']);

/**
 * Whether a building parks its cars ON ITS OWN LOT — a suburban commercial or
 * industrial car park laid to code, or a home's drive. Downtown offices and
 * hotels park none of their own.
 *
 * This is the half of the rule the street cares about: a lot with its own
 * parking does not ALSO line the kerb outside it. Somewhere to put the car is
 * somewhere to put the car, and a building that has it does not need the
 * street's, which is what leaves kerb space for the buildings that have none.
 * A home never parks at the kerb: one that fronts a street has its drive, and
 * one that fronts none has no kerb to use.
 */
export function hasOwnLotParking(
  entry: BuildingCatalogEntry,
  x: number,
  z: number,
  roadAt: (tileX: number, tileZ: number) => boolean,
  rotation: 0 | 1 | 2 | 3 = 0,
  kerb: KerbSurroundings | null = null,
): boolean {
  if (isFarmEntry(entry)) return false;
  if (entry.category === 'com' || entry.category === 'ind') {
    return parkingPlanFor(entry, x, z, roadAt, rotation, kerb) !== null;
  }
  return isHouseEntry(entry);
}

/**
 * When this building's cars may line the kerb of the street it fronts:
 * never, when it has somewhere of its own or nobody to park; otherwise
 * whatever the street allows at its kerb on the building's side.
 */
export function roadsideAllowance(
  entry: BuildingCatalogEntry,
  x: number,
  z: number,
  roadAt: (tileX: number, tileZ: number) => boolean,
  roadTierAt: (tileX: number, tileZ: number) => RoadTier,
  roadProfileAt: (tileX: number, tileZ: number) => RoadProfile | null = () => null,
  rotation: 0 | 1 | 2 | 3 = 0,
  kerb: KerbSurroundings | null = null,
): KerbAllowance {
  // Only buildings whose people own cars. A water tower, a park or a civic
  // plinth has nobody to park, and lining the kerb outside one would read as
  // abandoned vehicles rather than as a working street.
  if (!PARKING_CATEGORIES.has(entry.category)) return 'none';
  // A farm's truck stands in its own yard, never at a kerb.
  if (isFarmEntry(entry)) return 'none';
  if (hasOwnLotParking(entry, x, z, roadAt, rotation, kerb)) return 'none';
  const lot = footprintForRotation(entry, rotation);
  const edge = findRoadFacingEdge(x, z, lot.w, lot.d, roadAt);
  if (!edge) return 'none';
  const { roadTileX: rx, roadTileZ: rz } = edge;
  return kerbAllowance(roadTierAt(rx, rz), roadProfileAt(rx, rz), kerbSideFacing(edge.side));
}

/** Whether this building's cars may line the kerb at all, at some hour. */
export function usesRoadsideParking(
  entry: BuildingCatalogEntry,
  x: number,
  z: number,
  roadAt: (tileX: number, tileZ: number) => boolean,
  roadTierAt: (tileX: number, tileZ: number) => RoadTier,
  roadProfileAt: (tileX: number, tileZ: number) => RoadProfile | null = () => null,
  rotation: 0 | 1 | 2 | 3 = 0,
  kerb: KerbSurroundings | null = null,
): boolean {
  return (
    roadsideAllowance(entry, x, z, roadAt, roadTierAt, roadProfileAt, rotation, kerb) !== 'none'
  );
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
export const CURB_CUT_Y_OFFSET = ROAD_Y_OFFSET + SIDEWALK_TOP_ABOVE_ROAD_M + 0.01;
const INITIAL_CAR_CAPACITY = 64;
const INITIAL_TREE_CAPACITY = 64;

/** A planted island's kerb, 6 in wide, round its grass; both ride over the yard's paint. */
const ISLAND_KERB_M = 0.15;
const ISLAND_KERB_Y_OFFSET = 0.14;
const ISLAND_GRASS_Y_OFFSET = 0.145;
const ISLAND_KERB_COLOR: readonly [number, number, number] = materialUnit('cleanConcrete');
const ISLAND_GRASS_COLOR: readonly [number, number, number] = materialUnit('mownLawn');
/** A lot's trees are planted young: the broadleaf at the scale a home's yard tree stands. */
const LOT_TREE_SCALE = 0.8;
/** The hatching across an access aisle, bar to bar. */
const HATCH_SPACING_M = 0.6;

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
 * How a row of spaces fills over the day: a car park's trade or shift, or the
 * kerb's rule — the residents who leave their cars beside a painted lane
 * overnight, or the short daytime stays a street without one allows.
 */
export type OccupancyRhythm = LotCategory | 'residents' | 'shortStay';

/** Residents' cars home overnight, beside a painted parking lane. */
export const RESIDENT_NIGHT_OCCUPANCY = 0.9;
/** Residents' cars still there by day, the rest out at work. */
export const RESIDENT_DAY_OCCUPANCY = 0.4;
/** The most of a kerb short daytime stays fill at once. */
export const SHORT_STAY_OCCUPANCY = 0.5;

/**
 * How full a row of spaces is at a given time of day, 0..1, where
 * `dayFraction` is the day's progress (0 = midnight, 0.5 = midday) — the same
 * clock the sky uses. Commercial lots fill for trading hours and empty
 * overnight; industrial lots fill earlier for the day shift and keep a few
 * late-shift vehicles all night; residents' kerbs are fullest overnight; and
 * short stays happen by day only, never overnight.
 */
export function lotOccupancy(category: OccupancyRhythm, dayFraction: number): number {
  const hour = (((dayFraction % 1) + 1) % 1) * 24;
  if (category === 'residents') {
    if (hour < 7 || hour >= 19) return RESIDENT_NIGHT_OCCUPANCY;
    const spread = RESIDENT_NIGHT_OCCUPANCY - RESIDENT_DAY_OCCUPANCY;
    if (hour < 9) return RESIDENT_NIGHT_OCCUPANCY - spread * ramp(hour, 7, 9);
    if (hour <= 17) return RESIDENT_DAY_OCCUPANCY;
    return RESIDENT_DAY_OCCUPANCY + spread * ramp(hour, 17, 19);
  }
  if (category === 'shortStay') {
    if (hour < 8 || hour >= 19) return 0;
    const busy = hour < 10 ? ramp(hour, 8, 10) : hour <= 17 ? 1 : 1 - ramp(hour, 17, 19);
    return SHORT_STAY_OCCUPANCY * busy;
  }
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
  category: OccupancyRhythm,
  buildingId: number,
  stallIndex: number,
  dayFraction: number,
): boolean {
  return stallOccupancyThreshold(buildingId, stallIndex) < lotOccupancy(category, dayFraction);
}

// ---------------------------------------------------------------------------
// Stall placement (pure)
// ---------------------------------------------------------------------------

export interface StallPlacement {
  worldX: number;
  worldZ: number;
  /** Base facing yaw (radians) before per-car jitter; see EDGE_BASE_YAW. */
  baseYaw: number;
  /** Bay center's along-edge coordinate, meters from the edge start. */
  along: number;
  /** Whether the car stands across the kerb at an angled or head-in stall's angle. */
  atAngle?: boolean;
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

/** Along-edge coordinate (meters) of a kerbside row's start: the row is centered on the frontage. */
export function bayRowStart(edgeTiles: number, count: number, pitchTiles: number): number {
  const edgeLenM = edgeTiles * TILE_METERS;
  const rowLenM = count * pitchTiles * TILE_METERS;
  return (edgeLenM - rowLenM) / 2;
}

/** How far short of its stall's head a vehicle longer than the stall stops its nose. */
const LONG_VEHICLE_NOSE_CLEARANCE_M = 0.2;

/** A lot direction in world metres: `u` along the frame's edge, `v` into the lot. */
function lotDirection(frame: EdgeFrame, du: number, dv: number): { x: number; z: number } {
  const inward = -frame.outwardSign;
  return frame.alongX ? { x: du, z: dv * inward } : { x: dv * inward, z: du };
}

/** The world yaw of a car whose nose points along a lot axis: `atan2(dx, dz)`, nose at +Z. */
export function noseYaw(frame: EdgeFrame, nose: StallNose): number {
  const sign = nose[1] === '+' ? 1 : -1;
  const dir = nose[0] === 'u' ? lotDirection(frame, sign, 0) : lotDirection(frame, 0, sign);
  return Math.atan2(dir.x, dir.z);
}

/**
 * Where a vehicle stands in its stall: centred, nose-in, unless it is longer
 * than the stall, when its nose stops a hand short of the stall's head and
 * its tail stands out over the aisle, as a van's does.
 */
export function lotStallPlacement(
  frame: EdgeFrame,
  stall: LotStall,
  vehicleLength: number,
): StallPlacement {
  const { rect, nose } = stall;
  const along = nose[0] === 'u';
  const length = along ? rect.u1 - rect.u0 : rect.v1 - rect.v0;
  const back = Math.max(0, (vehicleLength - length) / 2 + LONG_VEHICLE_NOSE_CLEARANCE_M);
  const sign = nose[1] === '+' ? 1 : -1;
  const u = (rect.u0 + rect.u1) / 2 - (along ? sign * back : 0);
  const v = (rect.v0 + rect.v1) / 2 - (along ? 0 : sign * back);
  const at = lotPointToWorld(frame, u, v);
  return { worldX: at.x, worldZ: at.z, baseYaw: noseYaw(frame, nose), along: u };
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
 * edge, in tiles: across the verge, across the sidewalk, then into the
 * carriageway — to the middle of the parking lane where `laneOffsetM` gives
 * one, and half a car otherwise. Positive is toward the street.
 */
export function roadsideDepthTiles(
  tier: RoadTier,
  profile?: RoadProfile,
  laneOffsetM?: number,
): number {
  const intoCarriageway = laneOffsetM ?? ROADSIDE_CAR_HALF_WIDTH_M;
  return (
    (vergeDepthMeters(tier, profile) + sidewalkDepthMeters(tier, profile) + intoCarriageway) /
    TILE_METERS
  );
}

/** How many cars fit along a frontage, once both ends are kept clear. */
export function computeRoadsideStallCount(edgeTiles: number): number {
  const usable = edgeTiles - 2 * ROADSIDE_END_MARGIN_TILES;
  if (usable <= 0) return 0;
  return Math.max(0, Math.floor(usable / ROADSIDE_PITCH_TILES));
}

/**
 * A junction test that counts road tiles beside this one: road on both axes
 * means a turn, a T or a crossroads. It cannot tell a road that joins this
 * one from a road that merely lies beside it — the other half of a corridor,
 * a separate carriageway — so it is the fallback for a caller with no road
 * network to ask; the renderer in the game is handed the furniture's own
 * join-aware test instead.
 */
export function adjacentRoadsCross(
  roadAt: (x: number, z: number) => boolean,
): (x: number, z: number) => boolean {
  return (x, z) => {
    const hasEW = roadAt(x - 1, z) || roadAt(x + 1, z);
    const hasNS = roadAt(x, z - 1) || roadAt(x, z + 1);
    return hasEW && hasNS;
  };
}

/**
 * Whether a car may stand at the kerb of THIS tile: there has to be a road
 * here, its kerb has to be parkable (`parkable` — the street's rule for the
 * kerb in question), and it must not be a junction (`junctionAt` — a tile the
 * road runs through on both axes).
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
  parkable: (x: number, z: number) => boolean,
  junctionAt: (x: number, z: number) => boolean,
): boolean {
  if (!roadAt(tileX, tileZ)) return false;
  if (!parkable(tileX, tileZ)) return false;
  return !junctionAt(tileX, tileZ);
}

/**
 * Whether a car `halfLength` metres from its centre to either end, standing at
 * world (worldX, worldZ) on the `side` kerb of its road tile, stands clear of a
 * junction's no-parking zone (9.1 m before a stop line, 6.1 m from a crossing
 * or the junction's mouth). `setbacks` are the tile's own zones; null, the
 * tile has none to keep clear of.
 */
export function kerbCarClearOfJunctions(
  worldX: number,
  worldZ: number,
  side: KerbSide,
  halfLength: number,
  setbacks: ParkingSetbacks | null,
): boolean {
  if (!setbacks) return true;
  const tileX = Math.floor(worldX / TILE_METERS);
  const tileZ = Math.floor(worldZ / TILE_METERS);
  const along = setbacks.alongX
    ? worldX - (tileX + 0.5) * TILE_METERS
    : worldZ - (tileZ + 0.5) * TILE_METERS;
  const s = side === 'low' ? 0 : 1;
  return clearOfNoParking(along, halfLength, setbacks.lo?.[s] ?? null, setbacks.hi?.[s] ?? null);
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
  /** The street's own cross-section when it carries a composed one; the row sits at ITS kerb. */
  profile?: RoadProfile,
  /** How far in from the carriageway's edge the parking lane's middle is, where one is painted. */
  laneOffsetM?: number,
): StallPlacement[] {
  if (count <= 0) return [];

  const frame = edgeFrameFor(edge.side, x, z, w, d);
  const pitchM = ROADSIDE_PITCH_TILES * TILE_METERS;
  const start = bayRowStart(edge.edgeTiles, count, ROADSIDE_PITCH_TILES);
  const baseYaw = EDGE_BASE_YAW[edge.side] + Math.PI / 2;
  const depth = roadsideDepthTiles(tier, profile, laneOffsetM);

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

/**
 * Kerbside car centres along a frontage whose street paints its stalls: one
 * car to a marked stall, centred in it — every stall whose middle lies along
 * this frontage, so two neighbours never claim the same one. `stalls` are the
 * street's own, as world coordinates along the road; `tileAllows` vets the
 * tile each car would stand in, as for the unmarked row. A car in a parallel
 * stall lies along the kerb; one in an angled or head-in stall takes its
 * stall's own yaw.
 */
export function computeMarkedStallPlacements(
  x: number,
  z: number,
  w: number,
  d: number,
  edge: RoadFacingEdge,
  tier: RoadTier,
  stalls: readonly KerbStall[],
  tileAllows?: (tileX: number, tileZ: number) => boolean,
  profile?: RoadProfile,
  laneOffsetM?: number,
): StallPlacement[] {
  const frame = edgeFrameFor(edge.side, x, z, w, d);
  const parallelYaw = EDGE_BASE_YAW[edge.side] + Math.PI / 2;
  const depth = roadsideDepthTiles(tier, profile, laneOffsetM);
  const length = edge.edgeTiles * TILE_METERS;
  const placements: StallPlacement[] = [];
  for (const stall of [...stalls].sort((a, b) => a.from - b.from)) {
    const along = stall.centre - frame.edgeStart;
    if (along < 0 || along >= length) continue;
    const { x: worldX, z: worldZ } = frameToWorld(frame, along, depth);
    if (
      tileAllows &&
      !tileAllows(Math.floor(worldX / TILE_METERS), Math.floor(worldZ / TILE_METERS))
    )
      continue;
    placements.push(
      stall.yaw === null
        ? { worldX, worldZ, baseYaw: parallelYaw, along }
        : { worldX, worldZ, baseYaw: stall.yaw, along, atAngle: true },
    );
  }
  return placements;
}

/**
 * How far a car reaches along the road from its centre, either way: half its
 * length for one lying along it, and what its length and width make of the
 * angle for one standing across the kerb at `yaw`.
 */
export function carHalfAlongRoad(
  halfLength: number,
  halfWidth: number,
  yaw: number,
  alongX: boolean,
): number {
  const [nx, nz] = [Math.sin(yaw), Math.cos(yaw)];
  return alongX
    ? Math.abs(halfLength * nx) + Math.abs(halfWidth * nz)
    : Math.abs(halfLength * nz) + Math.abs(halfWidth * nx);
}

/**
 * What the street says about parking at its kerbs: how far each junction
 * keeps them clear, and where its parking lane's stalls are marked. The road
 * mesh answers both, from what it paints.
 */
export interface KerbParking {
  parkingSetbacksAt(x: number, z: number): ParkingSetbacks | null;
  parkingStallsAt(x: number, z: number, side: KerbSide): readonly KerbStall[] | null;
  /** The roads as the stall layout reads them, which a car park's kerb credit is counted from. */
  kerbSurroundings?(): KerbSurroundings;
}

/** Pushes a lot-frame rectangle as ground-conforming paint or paving. */
function pushLotRect(
  positions: number[],
  colors: number[],
  frame: EdgeFrame,
  r: LotRect,
  yOffset: number,
  color: readonly [number, number, number],
  heightAt: (x: number, z: number) => number,
): void {
  const a = lotPointToWorld(frame, r.u0, r.v0);
  const b = lotPointToWorld(frame, r.u1, r.v1);
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const z0 = Math.min(a.z, b.z);
  const z1 = Math.max(a.z, b.z);
  pushConformingQuad(positions, colors, x0, z0, x1, z1, yOffset, color, heightAt);
}

/** Pushes one flat triangle, each corner on the ground, wound to face up. */
function pushGroundTriangle(
  positions: number[],
  colors: number[],
  pts: readonly (readonly [number, number, number])[],
  color: readonly [number, number, number],
): void {
  const [a, b, c] = pts as [
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
  ];
  const up = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
  for (const p of up >= 0 ? [a, b, c] : [a, c, b]) {
    positions.push(p[0], p[1], p[2]);
    colors.push(color[0], color[1], color[2]);
  }
}

/**
 * The accessibility symbol in a space, upright to a driver pulling in: turned
 * to the space's yaw and laid on the ground under each of its vertices.
 */
function pushAccessibilitySymbol(
  positions: number[],
  colors: number[],
  cx: number,
  cz: number,
  yaw: number,
  heightAt: (x: number, z: number) => number,
): void {
  const symbol = accessibilitySymbolPaint(ACCESSIBLE_SYMBOL_M);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const p = symbol.positions;
  for (let i = 0; i + 8 < p.length; i += 9) {
    const tri = [0, 3, 6].map((o) => {
      const lx = p[i + o]!;
      const ly = p[i + o + 1]!;
      const lz = p[i + o + 2]!;
      const x = cx + lx * cos + lz * sin;
      const z = cz - lx * sin + lz * cos;
      return [x, heightAt(x, z) + STRIPE_LINE_Y_OFFSET + 0.005 + (ly - ROAD_Y_OFFSET), z] as const;
    });
    const c = symbol.colors;
    pushGroundTriangle(positions, colors, tri, [c[i]!, c[i + 1]!, c[i + 2]!]);
  }
}

/** Diagonal bars across an access aisle, at 45° to its sides, every HATCH_SPACING_M along it. */
function pushHatch(
  positions: number[],
  colors: number[],
  frame: EdgeFrame,
  aisle: LotRect,
  heightAt: (x: number, z: number) => number,
): void {
  const alongU = aisle.u1 - aisle.u0 > aisle.v1 - aisle.v0;
  const width = alongU ? aisle.v1 - aisle.v0 : aisle.u1 - aisle.u0;
  const lo = alongU ? aisle.u0 : aisle.v0;
  const hi = alongU ? aisle.u1 : aisle.v1;
  const half = (width * Math.SQRT2) / 2 - STRIPE_LINE_HALF_WIDTH_M;
  for (let t = lo + width / 2; t <= hi - width / 2 + 1e-9; t += HATCH_SPACING_M) {
    const cu = alongU ? t : (aisle.u0 + aisle.u1) / 2;
    const cv = alongU ? (aisle.v0 + aisle.v1) / 2 : t;
    // `s` runs along the bar, (1, 1)/√2 in the aisle's (long, short) axes; `w` across it.
    const corner = (s: number, w: number): readonly [number, number, number] => {
      const long = (s - w) / Math.SQRT2;
      const short = (s + w) / Math.SQRT2;
      const at = lotPointToWorld(frame, cu + (alongU ? long : short), cv + (alongU ? short : long));
      return [at.x, heightAt(at.x, at.z) + STRIPE_LINE_Y_OFFSET + 0.002, at.z];
    };
    const w = STRIPE_LINE_HALF_WIDTH_M;
    const a = corner(-half, -w);
    const b = corner(half, -w);
    const c = corner(half, w);
    const d = corner(-half, w);
    pushGroundTriangle(positions, colors, [a, b, c], NEAR_WHITE_STRIPE_COLOR);
    pushGroundTriangle(positions, colors, [a, c, d], NEAR_WHITE_STRIPE_COLOR);
  }
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
  category: OccupancyRhythm;
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
  private readonly roadProfileAt: (x: number, z: number) => RoadProfile | null;
  private readonly junctionAt: (x: number, z: number) => boolean;
  private readonly kerbParking: KerbParking | null;
  /** The roads a car park's kerb credit is counted from; null credits none. */
  private readonly kerb: KerbSurroundings | null;

  private readonly pools = new Map<number, VehicleKitPool>();
  private readonly buildingSlots = new Map<number, LotRecord>();
  private readonly buildingStripes = new Map<number, THREE.Mesh>();
  /** The car parks' island trees: the broadleaf of the wild and the yards, one instanced bucket. */
  private readonly treePool: InstancedSlotPool;
  private readonly buildingTrees = new Map<number, number[]>();

  /** Time of day driving lot occupancy (0.5 = midday, the default until the clock reports in). */
  private dayFraction = 0.5;

  constructor(
    scene: THREE.Scene,
    heightAt: (x: number, z: number) => number,
    catalog: BuildingCatalogEntry[],
    roadAt: (x: number, z: number) => boolean,
    roadTierAt: (x: number, z: number) => RoadTier = () => RoadTier.TwoLane,
    /** The street's own cross-section where it carries a composed one; kerb rows sit at ITS edge. */
    roadProfileAt: (x: number, z: number) => RoadProfile | null = () => null,
    /**
     * Whether the road runs through a tile on both axes, so it has no kerb.
     * The game passes the furniture's join-aware test, which knows the other
     * half of a corridor is a road beside this one and not a road through it.
     */
    junctionAt: (x: number, z: number) => boolean = adjacentRoadsCross(roadAt),
    /**
     * The street's own word on its kerbs: the junctions' no-parking zones,
     * which no car stands in, and the stalls its parking lanes mark, which
     * cars stand in one apiece. Omitted, no tile has either, which is right
     * for a caller with no road mesh to ask.
     */
    kerbParking: KerbParking | null = null,
  ) {
    this.scene = scene;
    this.heightAt = heightAt;
    this.roadAt = roadAt;
    this.roadTierAt = roadTierAt;
    this.roadProfileAt = roadProfileAt;
    this.junctionAt = junctionAt;
    this.kerbParking = kerbParking;
    this.kerb = kerbParking?.kerbSurroundings?.() ?? null;
    this.catalogById = new Map(catalog.map((entry) => [entry.id, entry]));
    this.treePool = new InstancedSlotPool(
      scene,
      buildBroadleafGeometry(),
      new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
      INITIAL_TREE_CAPACITY,
    );
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
    this.treePool.commit();
  }

  /** World positions of a building's car-park trees. */
  treePositionsFor(buildingId: number): { x: number; y: number; z: number }[] {
    return (this.buildingTrees.get(buildingId) ?? []).map((slot) => {
      this.treePool.getMatrixAt(slot, _matrix);
      _matrix.decompose(_position, _quaternion, _scale);
      return { x: _position.x, y: _position.y, z: _position.z };
    });
  }

  // --- test/debug accessors --------------------------------------------------

  /** Total instances across all kind pools (includes hidden, recycled slots). */
  carInstanceCount(): number {
    let total = 0;
    for (const pool of this.pools.values()) total += pool.usedSlots();
    return total;
  }

  /** How many vehicle InstancedMeshes this renderer has added to the scene: one per kind parked. */
  carMeshCount(): number {
    return this.pools.size;
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
  stallWorldPositions(
    buildingId: number,
  ): { x: number; z: number; yaw: number; length: number; width: number }[] {
    return (this.buildingSlots.get(buildingId)?.stalls ?? []).map((s) => {
      s.matrix.decompose(_position, _quaternion, _scale);
      return {
        x: _position.x,
        z: _position.z,
        // A turn about the vertical alone: twice the half-angle the quaternion carries.
        yaw: 2 * Math.atan2(_quaternion.y, _quaternion.w),
        length: _scale.z,
        width: _scale.x,
      };
    });
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
    // A farm's truck stands in its own yard, never in a painted bay or at a kerb.
    if (!entry || isFarmEntry(entry)) return;
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

    // A downtown building, one that fronts no road, or one its kerb credit or
    // the small-use exemption leaves nothing to hold, parks at the kerb if
    // anywhere; a suburban lot parks in the car park its code lays out.
    const plan = parkingPlanFor(
      entry,
      building.x,
      building.z,
      this.roadAt,
      building.rotation,
      this.kerb,
    );
    if (!plan) {
      this.applyRoadside(building, entry);
      return;
    }

    const stalls: Stall[] = [];
    const touchedPools = new Set<VehicleKitPool>();
    for (let i = 0; i < plan.layout.stalls.length; i++) {
      const kind = stallKind(category, building.id, i);
      const pool = this.poolFor(kind);
      const slot = pool.allocate();

      const size = sizeForKind(kind);
      const variant = variantScaleForKind(kind, stallVariantIndex(building.id, i, kind));
      const sx = size[0] * variant[0];
      const sy = size[1] * variant[1];
      const sz = size[2] * variant[2];
      const placement = lotStallPlacement(plan.frame, plan.layout.stalls[i]!, sz);

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

    this.rebuildStripes(building, plan);
    this.plantTrees(building, plan);
  }

  /**
   * Cars along the kerb for a building that parks nowhere of its own, on a
   * street whose tier allows it. Kerbside cars share the lot machinery — the
   * same pools, the same occupancy rhythm — so a street empties overnight the
   * way a forecourt does. No apron and no bay stripes: the space is the road's,
   * and the road is already paved.
   */
  private applyRoadside(building: BuildingInstance, entry: BuildingCatalogEntry): void {
    const allowance = roadsideAllowance(
      entry,
      building.x,
      building.z,
      this.roadAt,
      this.roadTierAt,
      this.roadProfileAt,
      building.rotation,
      this.kerb,
    );
    if (allowance === 'none') return;

    const tiles = footprintForRotation(entry, building.rotation);
    const edge = findRoadFacingEdge(building.x, building.z, tiles.w, tiles.d, this.roadAt);
    if (!edge) return;

    const tier = this.roadTierAt(edge.roadTileX, edge.roadTileZ);
    const profile = this.roadProfileAt(edge.roadTileX, edge.roadTileZ);
    const side = kerbSideFacing(edge.side);
    const count = computeRoadsideStallCount(edge.edgeTiles);
    if (count <= 0) return;

    // Every car in the row keeps the rule the row was placed under: a kerb
    // further along that paints no lane does not take an overnight car.
    const parkable = (tx: number, tz: number): boolean =>
      kerbAllowance(this.roadTierAt(tx, tz), this.roadProfileAt(tx, tz), side) === allowance;
    const tileAllows = (tileX: number, tileZ: number): boolean =>
      kerbTileAllowsParking(tileX, tileZ, this.roadAt, parkable, this.junctionAt);
    const laneOffset = profile ? (parkingLaneOffset(profile, side) ?? undefined) : undefined;
    // A painted parking lane marks its stalls, and its cars stand one to a
    // stall; a kerb with no lane keeps the plain row.
    const marked =
      allowance === 'anyHour' ? this.markedStallsAlong(building, tiles, edge, side) : null;
    const placements = marked
      ? computeMarkedStallPlacements(
          building.x,
          building.z,
          tiles.w,
          tiles.d,
          edge,
          tier,
          marked,
          tileAllows,
          profile ?? undefined,
          laneOffset,
        )
      : computeRoadsideStallPlacements(
          building.x,
          building.z,
          tiles.w,
          tiles.d,
          edge,
          tier,
          count,
          tileAllows,
          profile ?? undefined,
          laneOffset,
        );
    if (placements.length === 0) return;

    const stalls: Stall[] = [];
    const touchedPools = new Set<VehicleKitPool>();
    for (let i = 0; i < placements.length; i++) {
      const placement = placements[i]!;
      const kind = VehicleKind.Car; // a resident's car, never a box truck
      const size = sizeForKind(kind);
      const variant = variantScaleForKind(kind, stallVariantIndex(building.id, i, kind));
      const sx = size[0] * variant[0];
      const sy = size[1] * variant[1];
      const sz = size[2] * variant[2];
      // No car stands inside a junction's no-parking zone, nose or tail.
      const tileX = Math.floor(placement.worldX / TILE_METERS);
      const tileZ = Math.floor(placement.worldZ / TILE_METERS);
      const setbacks = this.kerbParking?.parkingSetbacksAt(tileX, tileZ) ?? null;
      const clear = kerbCarClearOfJunctions(
        placement.worldX,
        placement.worldZ,
        side,
        placement.atAngle && setbacks
          ? carHalfAlongRoad(sz / 2, sx / 2, placement.baseYaw, setbacks.alongX)
          : sz / 2,
        setbacks,
      );
      if (!clear) continue;
      const pool = this.poolFor(kind);
      const slot = pool.allocate();

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

    const lot: LotRecord = {
      category: allowance === 'anyHour' ? 'residents' : 'shortStay',
      stalls,
    };
    this.buildingSlots.set(building.id, lot);
    this.applyOccupancy(building.id, lot);
    for (const pool of touchedPools) pool.finalize();
  }

  /**
   * The marked stalls of the parking lane along a building's frontage, read
   * off the road tiles in front of it, or null where the street marks none
   * there — no road mesh to ask, or no parking lane painted on that side.
   */
  private markedStallsAlong(
    building: BuildingInstance,
    tiles: { w: number; d: number },
    edge: RoadFacingEdge,
    side: KerbSide,
  ): KerbStall[] | null {
    if (!this.kerbParking) return null;
    const alongX = edge.side === 'N' || edge.side === 'S';
    const out: KerbStall[] = [];
    let any = false;
    for (let i = 0; i < edge.edgeTiles; i++) {
      const tx = alongX
        ? building.x + i
        : edge.side === 'E'
          ? building.x + tiles.w
          : building.x - 1;
      const tz = alongX
        ? edge.side === 'N'
          ? building.z - 1
          : building.z + tiles.d
        : building.z + i;
      const stalls = this.kerbParking.parkingStallsAt(tx, tz, side);
      if (!stalls) continue;
      any = true;
      out.push(...stalls);
    }
    return any ? out : null;
  }

  private poolFor(kind: number): VehicleKitPool {
    let pool = this.pools.get(kind);
    if (!pool) {
      pool = new VehicleKitPool(this.scene, kind, INITIAL_CAR_CAPACITY);
      this.pools.set(kind, pool);
    }
    return pool;
  }

  /**
   * The car park's ground and paint, all on the lot's paved yard and
   * conforming to it: the driveway across the verge and the sidewalk, the
   * stall lines, each accessible space's symbol and hatched aisle, the
   * loading berths' outlines, and the planted islands with their kerbs.
   */
  private rebuildStripes(building: BuildingInstance, plan: LotPlan): void {
    const { edge, frame, layout } = plan;
    const positions: number[] = [];
    const colors: number[] = [];
    const rect = (r: LotRect, y: number, color: readonly [number, number, number]): void =>
      pushLotRect(positions, colors, frame, r, y, color, this.heightAt);
    // Paint on the lot stays inside it: a line on a lot line is cut at it.
    const { lot } = layout;
    const line = (r: LotRect): void => {
      const clipped = {
        u0: Math.max(r.u0, lot.u0),
        u1: Math.min(r.u1, lot.u1),
        v0: Math.max(r.v0, lot.v0),
        v1: Math.min(r.v1, lot.v1),
      };
      if (clipped.u1 > clipped.u0 && clipped.v1 > clipped.v0) {
        rect(clipped, STRIPE_LINE_Y_OFFSET, NEAR_WHITE_STRIPE_COLOR);
      }
    };

    // The driveway crosses the sidewalk at the curb cut; the lot's own ground
    // paves the verge between them (lots.ts).
    const tier = this.roadTierAt(edge.roadTileX, edge.roadTileZ);
    const streetProfile = this.roadProfileAt(edge.roadTileX, edge.roadTileZ) ?? undefined;
    const verge = vergeDepthMeters(tier, streetProfile);
    const sidewalk = sidewalkDepthMeters(tier, streetProfile);
    const cut = layout.curbCut;
    if (sidewalk > 0) {
      rect(
        { u0: cut.u0, u1: cut.u1, v0: -verge - sidewalk, v1: -verge },
        CURB_CUT_Y_OFFSET,
        APRON_COLOR,
      );
    }

    // Stall lines down both long sides of every space, each line drawn once.
    const drawn = new Set<string>();
    const sideLines = (r: LotRect, alongU: boolean): void => {
      const sides = alongU
        ? [
            {
              u0: r.u0,
              u1: r.u1,
              v0: r.v0 - STRIPE_LINE_HALF_WIDTH_M,
              v1: r.v0 + STRIPE_LINE_HALF_WIDTH_M,
            },
            {
              u0: r.u0,
              u1: r.u1,
              v0: r.v1 - STRIPE_LINE_HALF_WIDTH_M,
              v1: r.v1 + STRIPE_LINE_HALF_WIDTH_M,
            },
          ]
        : [
            {
              u0: r.u0 - STRIPE_LINE_HALF_WIDTH_M,
              u1: r.u0 + STRIPE_LINE_HALF_WIDTH_M,
              v0: r.v0,
              v1: r.v1,
            },
            {
              u0: r.u1 - STRIPE_LINE_HALF_WIDTH_M,
              u1: r.u1 + STRIPE_LINE_HALF_WIDTH_M,
              v0: r.v0,
              v1: r.v1,
            },
          ];
      for (const s of sides) {
        const key = [s.u0, s.u1, s.v0, s.v1].map((n) => n.toFixed(2)).join(',');
        if (drawn.has(key)) continue;
        drawn.add(key);
        line(s);
      }
    };
    for (const stall of layout.stalls) sideLines(stall.rect, stall.nose[0] === 'u');

    // Each accessible space: its access aisle lined and hatched, the symbol in the space.
    layout.stalls.forEach((stall) => {
      if (!stall.accessible) return;
      const yaw = noseYaw(frame, stall.nose);
      const c = lotPointToWorld(
        frame,
        (stall.rect.u0 + stall.rect.u1) / 2,
        (stall.rect.v0 + stall.rect.v1) / 2,
      );
      pushAccessibilitySymbol(positions, colors, c.x, c.z, yaw, this.heightAt);
    });
    for (const aisle of layout.accessAisles) {
      const alongU = aisle.u1 - aisle.u0 > aisle.v1 - aisle.v0;
      sideLines(aisle, alongU);
      pushHatch(positions, colors, frame, aisle, this.heightAt);
    }

    // Loading berths: outlined.
    for (const b of layout.berths) {
      const h = STRIPE_LINE_HALF_WIDTH_M;
      line({ u0: b.u0, u1: b.u1, v0: b.v0 - h, v1: b.v0 + h });
      line({ u0: b.u0, u1: b.u1, v0: b.v1 - h, v1: b.v1 + h });
      line({ u0: b.u0 - h, u1: b.u0 + h, v0: b.v0, v1: b.v1 });
      line({ u0: b.u1 - h, u1: b.u1 + h, v0: b.v0, v1: b.v1 });
    }

    // Planted islands: a concrete kerb round a bed of grass.
    for (const island of layout.islands) {
      rect(island, ISLAND_KERB_Y_OFFSET, ISLAND_KERB_COLOR);
      const k = ISLAND_KERB_M;
      rect(
        { u0: island.u0 + k, u1: island.u1 - k, v0: island.v0 + k, v1: island.v1 - k },
        ISLAND_GRASS_Y_OFFSET,
        ISLAND_GRASS_COLOR,
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

  /** One tree in each island the code plants, standing on the island's grass. */
  private plantTrees(building: BuildingInstance, plan: LotPlan): void {
    const slots: number[] = [];
    for (const tree of plan.layout.trees) {
      const at = lotPointToWorld(plan.frame, tree.u, tree.v);
      const slot = this.treePool.allocate();
      _position.set(at.x, this.heightAt(at.x, at.z) + ISLAND_GRASS_Y_OFFSET, at.z);
      _quaternion.identity();
      _scale.setScalar(LOT_TREE_SCALE);
      _matrix.compose(_position, _quaternion, _scale);
      this.treePool.setMatrixAt(slot, _matrix);
      slots.push(slot);
    }
    if (slots.length > 0) this.buildingTrees.set(building.id, slots);
  }

  private freeBuilding(buildingId: number): void {
    const lot = this.buildingSlots.get(buildingId);
    if (lot) {
      for (const stall of lot.stalls) this.pools.get(stall.ref.kind)?.free(stall.ref.slot);
      this.buildingSlots.delete(buildingId);
    }

    const trees = this.buildingTrees.get(buildingId);
    if (trees) {
      for (const slot of trees) this.treePool.free(slot);
      this.buildingTrees.delete(buildingId);
    }

    const stripeMesh = this.buildingStripes.get(buildingId);
    if (stripeMesh) {
      this.scene.remove(stripeMesh);
      stripeMesh.geometry.dispose();
      this.buildingStripes.delete(buildingId);
    }
  }
}
