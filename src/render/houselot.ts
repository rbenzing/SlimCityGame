/**
 * A home's lot, laid out from the street it fronts: where the house stands,
 * the drive that reaches it from the carriageway, what the car parks under,
 * and the yard behind.
 *
 * Everything is measured in the frontage edge's frame, in metres: `u` runs
 * along the frontage from the edge's start, `v` runs in from the lot's street
 * edge (negative `v` is out over the road tile — its verge, then its
 * sidewalk). The lot renderer lays the ground surfaces from this plan and the
 * house kit stands its parts on it, so the two can never disagree about where
 * a drive or a garage is.
 *
 * Pure: a function of (building, catalog entry, streets). No three.js.
 */
import type { BuildingCatalogEntry, BuildingInstance } from '../shared/types';
import { TILE_METERS } from '../shared/constants';
import {
  edgeFrameFor,
  findStreetFacingEdge,
  frameToWorld,
  type EdgeFrame,
  type RoadFacingEdge,
  type StreetLookup,
} from './frontage';
import { bodyMetresFor, frontageSetbackFor, tierHeightOf } from './massing';
import { isHouseEntry } from './archetypes';
import { MULLION_MARGIN_PUNCHED, windowGrid } from './facade';
import { homesAcrossFrontage } from '../shared/buildingkind';

// Same avalanche hash every render/*.ts keeps a local copy of.
function hash1(n: number): number {
  let h = n >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/** A seeded roll in [0, 1) for one decision about one building. */
function roll(buildingId: number, slot: number): number {
  return hash1(buildingId * 131 + slot);
}

const SLOT_DRIVE_SIDE = 1;
const SLOT_SURFACE = 2;
const SLOT_COVER = 3;
const SLOT_FENCE = 4;
const SLOT_FENCE_COLOUR = 5;
const SLOT_PATIO = 6;
const SLOT_PATIO_STONE = 7;
const SLOT_GRILL = 8;
const SLOT_POOL = 9;
const SLOT_TRAMPOLINE = 10;
const SLOT_TREES = 11;
const SLOT_BUSHES = 12;
const SLOT_CHIMNEY = 13;
const SLOT_ENTRY = 14;
const SLOT_CHIMNEY_AT = 15;
/** Per-home rolls in a row start here, one block of four per home. */
const SLOT_UNIT_BASE = 40;

/** A drive is one car wide with room to open a door. */
export const DRIVE_WIDTH_M = 3;
/** The lawn left between a side drive and the house. */
const DRIVE_GAP_M = 1;
/** The least lawn a side drive keeps from the house or the lot line. */
const DRIVE_MIN_GAP_M = 0.2;
/** Half the longest car, 4.6 m — how far a car's centre stands from what it pulls up to. */
export const CAR_HALF_LENGTH_M = 2.3;
/** Room left between a car's nose and the door it faces. */
const CAR_NOSE_GAP_M = 0.4;

export const CARPORT_WIDTH_M = 3.4;
export const CARPORT_DEPTH_M = 6;
export const GARAGE_DEPTH_M = 6;
/** How far an attached garage's door stands behind the house front. */
const ATTACHED_GARAGE_SETBACK_M = 1;
export const DETACHED_GARAGE_WIDTH_M = 4;
/** Lawn between the house's back wall and a detached garage. */
const DETACHED_GARAGE_GAP_M = 3;
export const GARAGE_DOOR_WIDTH_M = 2.6;

export const PATH_WIDTH_M = 1.2;
export const DOOR_WIDTH_M = 1;

const PATIO_DEPTH_M = 4;
const PATIO_MAX_WIDTH_M = 5;
export const POOL_RADIUS_M = 2.3;
export const TRAMPOLINE_RADIUS_M = 2.15;
const TREE_RADIUS_M = 2;
/** A big back yard grows a tree more for every this much of it, over the seeded one or two. */
const BACK_YARD_M2_PER_TREE = 800;
/** Room every yard part keeps from a lot line, a fence or another part. */
const YARD_CLEARANCE_M = 0.8;
/** Spacing of the spots a yard part may take. */
const YARD_SPOT_STEP_M = 1;
/** A fence stands just inside the lot line. */
const FENCE_INSET_M = 0.1;
const BUSH_FRONT_GAP_M = 0.9;
/** A bush keeps this far from the side of a stoop or porch. */
const BUSH_ENTRY_GAP_M = 0.6;

/** A gable roof never rises more than this over its eaves, so a deep body keeps a sane ridge. */
export const ROOF_MAX_RISE_M = 4.5;
/** IRC R311.7.5: a riser is at most 7¾ in and a tread at least 10 in; the kit's are 0.2 m and 0.25 m. */
export const RISER_M = 0.2;
export const TREAD_M = 0.25;
/** A stoop's landing is at least 36 in deep in the direction of travel. */
const STOOP_LANDING_M = 0.9;
const STOOP_WIDTH_M = 1.6;
/** A ranch's stoop: a landing 0.2 m up under the eave, reached by its one step. */
const RANCH_STOOP_WIDTH_M = 1.2;
const RANCH_STOOP_DEPTH_M = 1.5;
export const PORTICO_WIDTH_M = 1.8;
export const PORTICO_DEPTH_M = 1.2;
/** The portico's hood stands this high over the landing's ground, clear of the door and the window above. */
export const PORTICO_HOOD_M = 2.45;
export const POST_M = 0.25;
export const PORCH_DEPTH_M = 1.8;
export const PORCH_FLOOR_M = 0.6;
/** Posts stand 2.4 m off the porch floor; its shed roof leaves the wall 2.9 m off it. */
export const PORCH_POST_HEIGHT_M = 2.4;
export const PORCH_ROOF_WALL_RISE_M = 2.9;
/** A porch stops a metre short of each end of the frontage. */
const PORCH_INSET_M = 1;
const PORCH_POST_SPACING_M = 3;
const PORCH_ROOF_OVERHANG_M = 0.1;
export const DORMER_WIDTH_M = 1.4;
export const DORMER_WALL_M = 1.2;
/** How deep a dormer's cheeks run back into the roof: far enough that the slope has swallowed them. */
export const DORMER_DEPTH_M = 3;
/** A dormer's front wall stands on the slope this far above the eave line. */
const DORMER_RISE_M = 0.3;
/** A dormer keeps this far in from either end wall. */
const DORMER_END_INSET_M = 0.75;
const DORMERS = 2;
export const CHIMNEY_FLUE_M = 0.53;
export const CHIMNEY_STACK_M = 0.97;
/** An interior chimney clears the ridge by 3 ft; a gable-end one by 2 ft, being the nearer to the roof it stands beside. */
const CHIMNEY_ABOVE_RIDGE_INTERIOR_M = 0.9;
const CHIMNEY_ABOVE_RIDGE_GABLE_M = 0.6;
/** A gable-end chimney stands in the end wall and shows this much outside it. */
const CHIMNEY_OUTSIDE_M = 0.33;
const CHIMNEY_INSIDE_M = CHIMNEY_FLUE_M - CHIMNEY_OUTSIDE_M;
export const SHUTTER_THICKNESS_M = 0.06;
/** A shutter is half a window wide, one either side of it, and a window is half its bay. */
const WINDOW_SHARE_OF_BAY = 0.5;
export const PARAPET_ABOVE_ROOF_M = 0.76;
export const PARAPET_THICKNESS_M = 0.3;
export const GARAGE_LEAF_WIDTH_M = 2.74;
export const GARAGE_LEAF_ROW_WIDTH_M = 2.44;
export const GARAGE_LEAF_HEIGHT_M = 2.13;
export const GARAGE_LEAF_DEPTH_M = 0.05;

/**
 * Which house a home is: a detached house is a ranch, a Cape or a colonial by
 * level; a duplex and a fourplex are colonials with a stoop at each door; a
 * townhouse is a row.
 */
export type HouseStyle = 'ranch' | 'cape' | 'colonial' | 'attached' | 'row';

export function houseStyleOf(entry: BuildingCatalogEntry): HouseStyle {
  if (entry.kind === 'duplex' || entry.kind === 'fourplex') return 'attached';
  if (entry.kind === 'townhouse') return 'row';
  const level = entry.level ?? 1;
  return level <= 1 ? 'ranch' : level === 2 ? 'cape' : 'colonial';
}

/** Rise per metre of run (5:12 low, 8:12 steep) and how far the roof overhangs its walls, eaves and rakes. */
const ROOFS: Record<HouseStyle, { slope: number; eaveM: number; rakeM: number }> = {
  ranch: { slope: 5 / 12, eaveM: 0.46, rakeM: 0.46 },
  cape: { slope: 8 / 12, eaveM: 0.2, rakeM: 0.2 },
  colonial: { slope: 8 / 12, eaveM: 0.46, rakeM: 0.2 },
  attached: { slope: 8 / 12, eaveM: 0.46, rakeM: 0.2 },
  row: { slope: 5 / 12, eaveM: 0.46, rakeM: 0.2 },
};

/** How high a gable roof stands over a body `spanM` across at `slope` rise per metre of run, within the cap. */
export function computeRoofRise(spanM: number, slope: number): number {
  return Math.min(ROOF_MAX_RISE_M, (spanM / 2) * slope);
}

export interface LotRect {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

export interface LotPoint {
  u: number;
  v: number;
}

export type DriveSurface = 'dirt' | 'concrete';

/**
 * What a drive ends at. A side drive ends at a `spot`, a `carport`, an
 * attached `garage` or a `detachedGarage`; a front drive is a `pad`, with or
 * without an `integralGarage` door in the facade behind it.
 */
export type DriveCover =
  'spot' | 'carport' | 'garage' | 'detachedGarage' | 'pad' | 'integralGarage';

export interface HomeDrive {
  /** The drive on the ground, from the lot's edge (out across the verge) to where it ends. */
  rect: LotRect;
  /** The curb cut across the sidewalk. */
  cut: LotRect;
  cover: DriveCover;
  /** The carport's or garage's footprint; null for a spot or a pad. */
  coverRect: LotRect | null;
  /** A garage door, on the face toward the street: its span along the frontage, at depth `v`. */
  garageDoor: { u0: number; u1: number; v: number } | null;
  /** Where the car's centre stands. It points into the lot, nose to the house. */
  car: LotPoint;
}

export interface FenceRun {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export interface YardPlan {
  fence: FenceRun[];
  fenceColour: 'wood' | 'white';
  /** One slab behind each home that has one. */
  patios: LotRect[];
  patioStone: 'concrete' | 'brick';
  grills: LotPoint[];
  pool: LotPoint | null;
  trampoline: LotPoint | null;
  trees: (LotPoint & { scale: number })[];
  bushes: (LotPoint & { scale: number })[];
}

/** Everything on a home's lot but its yard: what a lamp, a lawn or a car needs to know. */
export interface HouseGroundPlan {
  frame: EdgeFrame;
  /** The street edge the lot is laid out from; null when the home fronts none. */
  edge: RoadFacingEdge | null;
  edgeLenM: number;
  lotDepthM: number;
  body: LotRect;
  /** How many homes the lot holds: one, or three per frontage tile for a row along its street. */
  homes: number;
  /** Where each home's front door stands on the front wall. */
  doors: LotPoint[];
  paths: LotRect[];
  /** The lawn carried out across the verge, one strip per frontage tile with a street beyond it. */
  vergeLawn: LotRect[];
  drives: HomeDrive[];
  surface: DriveSurface;
}

/** A box in the frame: its footprint and the heights it spans above the body's ground. */
export interface KitBox {
  rect: LotRect;
  y0: number;
  y1: number;
}

/** A gable hood on two posts over a door: `u` its centre, `v` the wall it hangs on. */
export interface PorticoPlan {
  u: number;
  v: number;
}

/** A porch across the frontage: its floor, the steps up to it, its posts and its shed roof. */
export interface PorchPlan {
  floor: KitBox;
  steps: KitBox[];
  posts: KitBox[];
  /** The shed roof over it: its footprint, the height of its low edge, and of its high edge on the wall. */
  roof: { rect: LotRect; lowM: number; wallM: number };
}

/** A gable dormer on the street slope: where its front wall stands and the height it stands from. */
export interface DormerPlan {
  u: number;
  v: number;
  y: number;
}

/** Everything that stands on and beside a home's body, in the same frame, above the body's ground. */
export interface HouseKitPlan {
  style: HouseStyle;
  /** The body's wall height; the roof starts here. */
  heightM: number;
  roof: {
    /** The roof's footprint: the body and its overhang, ridge along the frontage. */
    rect: LotRect;
    eaveM: number;
    rakeM: number;
    /** The pitch drawn, rise per metre of run, once the rise cap has had its say. */
    slope: number;
    /** The ridge's height over the eaves. */
    riseM: number;
  };
  chimneys: KitBox[];
  /** The landings and treads at each door, and a ranch's slab. */
  stoops: KitBox[];
  porticos: PorticoPlan[];
  porch: PorchPlan | null;
  dormers: DormerPlan[];
  shutters: KitBox[];
  parapets: KitBox[];
  /** What stands against the front wall at each door, which nothing else is planted in front of. */
  entries: LotRect[];
}

export interface HouseLotPlan extends HouseGroundPlan {
  yard: YardPlan;
  kit: HouseKitPlan;
}

/** A frame point in world metres. */
export function lotToWorld(frame: EdgeFrame, u: number, v: number): { x: number; z: number } {
  return frameToWorld(frame, u, -v / TILE_METERS);
}

/** The frame yaw that points a vehicle's nose (+Z) into the lot, away from the street. */
export function inwardYaw(frame: EdgeFrame): number {
  // Inward is -outward: along world Z for a frame running along X, else X.
  return frame.alongX
    ? frame.outwardSign === -1
      ? 0
      : Math.PI
    : frame.outwardSign === 1
      ? -Math.PI / 2
      : Math.PI / 2;
}

/** The frame yaw that points a part's front (+Z) out to the street. */
export function outwardYaw(frame: EdgeFrame): number {
  return inwardYaw(frame) + Math.PI;
}

function worldToLot(frame: EdgeFrame, x: number, z: number): LotPoint {
  const along = frame.alongX ? x : z;
  const perp = frame.alongX ? z : x;
  return { u: along - frame.edgeStart, v: (frame.buildingLine - perp) * frame.outwardSign };
}

/** The body's footprint in the frame — read from the same placement the body renderers draw. */
function bodyRect(
  building: BuildingInstance,
  entry: BuildingCatalogEntry,
  frame: EdgeFrame,
  street: StreetLookup,
): LotRect {
  const body = bodyMetresFor(entry);
  const shift = frontageSetbackFor(entry, building.x, building.z, () => false, street);
  const cx = (building.x + entry.footprint.w / 2) * TILE_METERS + shift.centerXM;
  const cz = (building.z + entry.footprint.d / 2) * TILE_METERS + shift.centerZM;
  const hx = body.w / 2;
  const hz = body.d / 2;
  const a = worldToLot(frame, cx - hx, cz - hz);
  const b = worldToLot(frame, cx + hx, cz + hz);
  return {
    u0: Math.min(a.u, b.u),
    u1: Math.max(a.u, b.u),
    v0: Math.min(a.v, b.v),
    v1: Math.max(a.v, b.v),
  };
}

/** The road tile across the frontage from the lot tile at along-index `i`. */
function roadTileAcross(
  edge: RoadFacingEdge,
  x: number,
  z: number,
  w: number,
  d: number,
  i: number,
) {
  switch (edge.side) {
    case 'N':
      return { x: x + i, z: z - 1 };
    case 'S':
      return { x: x + i, z: z + d };
    case 'E':
      return { x: x + w, z: z + i };
    default:
      return { x: x - 1, z: z + i };
  }
}

interface Streets {
  edge: RoadFacingEdge;
  /** The verge and sidewalk beyond each frontage tile, or null where no street is. */
  across: ({ vergeM: number; sidewalkM: number; straight: boolean } | null)[];
}

function streetsAcross(
  building: BuildingInstance,
  entry: BuildingCatalogEntry,
  edge: RoadFacingEdge,
  roadAt: (x: number, z: number) => boolean,
  street: StreetLookup,
): Streets {
  const { w, d } = entry.footprint;
  const across = [];
  for (let i = 0; i < edge.edgeTiles; i++) {
    const t = roadTileAcross(edge, building.x, building.z, w, d, i);
    const s = street(t.x, t.z);
    if (!s) {
      across.push(null);
      continue;
    }
    // A drive crosses a kerb, and a tile the road leaves on both axes has none.
    const alongX = roadAt(t.x - 1, t.z) || roadAt(t.x + 1, t.z);
    const alongZ = roadAt(t.x, t.z - 1) || roadAt(t.x, t.z + 1);
    across.push({ ...s, straight: !(alongX && alongZ) });
  }
  return { edge, across };
}

/**
 * A drive across `u0..u1`, or null where some tile it would cross is no
 * straight street. Its verge and sidewalk are the deepest of the tiles it
 * crosses, so it reaches the carriageway everywhere along its width.
 */
function driveReach(
  streets: Streets,
  u0: number,
  u1: number,
): { vergeM: number; sidewalkM: number } | null {
  const first = Math.floor(u0 / TILE_METERS);
  const last = Math.floor((u1 - 1e-6) / TILE_METERS);
  let vergeM = 0;
  let sidewalkM = 0;
  for (let i = first; i <= last; i++) {
    const s = streets.across[i];
    if (!s || !s.straight) return null;
    vergeM = Math.max(vergeM, s.vergeM);
    sidewalkM = Math.max(sidewalkM, s.sidewalkM);
  }
  return { vergeM, sidewalkM };
}

function cutFor(u0: number, u1: number, reach: { vergeM: number; sidewalkM: number }): LotRect {
  return { u0, u1, v0: -(reach.vergeM + reach.sidewalkM), v1: -reach.vergeM };
}

/** The four covers a side drive may end at, and how often each is chosen. */
const SIDE_COVERS: readonly { cover: DriveCover; weight: number }[] = [
  { cover: 'spot', weight: 0.2 },
  { cover: 'carport', weight: 0.25 },
  { cover: 'garage', weight: 0.3 },
  { cover: 'detachedGarage', weight: 0.25 },
];

function sideDrive(
  building: BuildingInstance,
  body: LotRect,
  edgeLenM: number,
  lotDepthM: number,
  streets: Streets,
): HomeDrive | null {
  const first = roll(building.id, SLOT_DRIVE_SIDE) < 0.5 ? 1 : -1;
  for (const side of [first, -first]) {
    const room = side > 0 ? edgeLenM - body.u1 : body.u0;
    if (room + 1e-6 < DRIVE_WIDTH_M + DRIVE_MIN_GAP_M) continue;
    const gap = Math.max(DRIVE_MIN_GAP_M, Math.min(DRIVE_GAP_M, room - DRIVE_WIDTH_M));
    const u0 = side > 0 ? body.u1 + gap : body.u0 - gap - DRIVE_WIDTH_M;
    const u1 = u0 + DRIVE_WIDTH_M;
    const reach = driveReach(streets, u0, u1);
    if (!reach) continue;
    return coverDrive(building, body, lotDepthM, edgeLenM, side, u0, u1, reach);
  }
  return null;
}

function coverDrive(
  building: BuildingInstance,
  body: LotRect,
  lotDepthM: number,
  edgeLenM: number,
  side: number,
  u0: number,
  u1: number,
  reach: { vergeM: number; sidewalkM: number },
): HomeDrive {
  const detachedFits = body.v1 + DETACHED_GARAGE_GAP_M + GARAGE_DEPTH_M <= lotDepthM - 1;
  const choices = SIDE_COVERS.filter((c) => c.cover !== 'detachedGarage' || detachedFits);
  const total = choices.reduce((sum, c) => sum + c.weight, 0);
  let pick = roll(building.id, SLOT_COVER) * total;
  let cover: DriveCover = choices[choices.length - 1]!.cover;
  for (const c of choices) {
    if (pick < c.weight) {
      cover = c.cover;
      break;
    }
    pick -= c.weight;
  }

  const uc = (u0 + u1) / 2;
  const start = -reach.vergeM;
  const cut = cutFor(u0, u1, reach);
  switch (cover) {
    case 'garage': {
      // Attached: it fills the lawn strip too, so it meets the house wall.
      const coverRect = {
        u0: side > 0 ? body.u1 : u0,
        u1: side > 0 ? u1 : body.u0,
        v0: body.v0 + ATTACHED_GARAGE_SETBACK_M,
        v1: body.v0 + ATTACHED_GARAGE_SETBACK_M + GARAGE_DEPTH_M,
      };
      return {
        rect: { u0, u1, v0: start, v1: coverRect.v0 },
        cut,
        cover,
        coverRect,
        garageDoor: doorAcross(coverRect, coverRect.v0),
        car: { u: uc, v: coverRect.v0 - CAR_NOSE_GAP_M - CAR_HALF_LENGTH_M },
      };
    }
    case 'carport': {
      const cu = Math.min(edgeLenM - CARPORT_WIDTH_M / 2, Math.max(CARPORT_WIDTH_M / 2, uc));
      const coverRect = {
        u0: cu - CARPORT_WIDTH_M / 2,
        u1: cu + CARPORT_WIDTH_M / 2,
        v0: body.v0 + 0.5,
        v1: body.v0 + 0.5 + CARPORT_DEPTH_M,
      };
      return {
        rect: { u0, u1, v0: start, v1: coverRect.v1 },
        cut,
        cover,
        coverRect,
        garageDoor: null,
        car: { u: uc, v: (coverRect.v0 + coverRect.v1) / 2 },
      };
    }
    case 'detachedGarage': {
      const half = DETACHED_GARAGE_WIDTH_M / 2;
      const gu = Math.min(edgeLenM - half - DRIVE_MIN_GAP_M, Math.max(half + DRIVE_MIN_GAP_M, uc));
      const coverRect = {
        u0: gu - half,
        u1: gu + half,
        v0: body.v1 + DETACHED_GARAGE_GAP_M,
        v1: body.v1 + DETACHED_GARAGE_GAP_M + GARAGE_DEPTH_M,
      };
      return {
        rect: { u0, u1, v0: start, v1: coverRect.v0 },
        cut,
        cover,
        coverRect,
        garageDoor: doorAcross(coverRect, coverRect.v0),
        car: { u: uc, v: coverRect.v0 - CAR_NOSE_GAP_M - CAR_HALF_LENGTH_M },
      };
    }
    default: {
      // An open spot beside the front half of the house.
      const carV = body.v0 + CAR_HALF_LENGTH_M;
      return {
        rect: { u0, u1, v0: start, v1: carV + CAR_HALF_LENGTH_M + CAR_NOSE_GAP_M },
        cut,
        cover: 'spot',
        coverRect: null,
        garageDoor: null,
        car: { u: uc, v: carV },
      };
    }
  }
}

function doorAcross(rect: LotRect, v: number): { u0: number; u1: number; v: number } {
  const uc = (rect.u0 + rect.u1) / 2;
  const half = Math.min(GARAGE_DOOR_WIDTH_M, rect.u1 - rect.u0 - 0.6) / 2;
  return { u0: uc - half, u1: uc + half, v };
}

/** A pad in front of the facade at `u0..u1`, the car nose-in to the wall. */
function frontPad(
  u0: number,
  u1: number,
  body: LotRect,
  streets: Streets,
  integral: boolean,
): HomeDrive | null {
  const reach = driveReach(streets, u0, u1);
  if (!reach) return null;
  const uc = (u0 + u1) / 2;
  return {
    rect: { u0, u1, v0: -reach.vergeM, v1: body.v0 },
    cut: cutFor(u0, u1, reach),
    cover: integral ? 'integralGarage' : 'pad',
    coverRect: null,
    garageDoor: integral
      ? { u0: uc - GARAGE_DOOR_WIDTH_M / 2, u1: uc + GARAGE_DOOR_WIDTH_M / 2, v: body.v0 }
      : null,
    car: { u: uc, v: body.v0 - CAR_NOSE_GAP_M - CAR_HALF_LENGTH_M },
  };
}

/**
 * How many homes share the body across its frontage, each with its own door
 * and drive: three in a townhouse row, two in a duplex or a fourplex, one in
 * a detached house, whichever edge meets the street. Only a body too narrow
 * to hold a pad and a door per home falls back to the one-home layout with a
 * side drive.
 */
function homesAlongFrontage(entry: BuildingCatalogEntry, edge: RoadFacingEdge | null): number {
  if (!edge) return 1;
  return homesAcrossFrontage(entry.kind);
}

/** Where a home's front pad starts and its door stands, in from its share of the frontage. */
const FRONT_PAD_INSET_M = 0.5;
const FRONT_DOOR_INSET_M = 1.5;
/** The least frontage a home needs for its pad, a metre of wall, its door and the margins. */
const FRONT_HOME_MIN_WIDTH_M = FRONT_PAD_INSET_M + DRIVE_WIDTH_M + 1 + DOOR_WIDTH_M + 0.5;

function overlaps(a: LotRect, b: LotRect): boolean {
  return a.u0 < b.u1 && b.u0 < a.u1 && a.v0 < b.v1 && b.v0 < a.v1;
}

/** A circle of `radius` at `p`, grown by the yard clearance, as a box to test against. */
function around(p: LotPoint, radius: number): LotRect {
  const r = radius + YARD_CLEARANCE_M;
  return { u0: p.u - r, u1: p.u + r, v0: p.v - r, v1: p.v + r };
}

/**
 * The first free spot the seed offers for a part of `radius` in `yard`: the
 * spots are laid on a metre grid, the seed picks where along them to start,
 * and the walk takes the first that clears every obstacle.
 */
function freeSpot(
  yard: LotRect,
  radius: number,
  obstacles: readonly LotRect[],
  seed: number,
): LotPoint | null {
  const inset = radius + YARD_CLEARANCE_M;
  const spots: LotPoint[] = [];
  for (let v = yard.v0 + inset; v <= yard.v1 - inset + 1e-6; v += YARD_SPOT_STEP_M) {
    for (let u = yard.u0 + inset; u <= yard.u1 - inset + 1e-6; u += YARD_SPOT_STEP_M) {
      spots.push({ u, v });
    }
  }
  if (spots.length === 0) return null;
  const start = Math.floor(seed * spots.length);
  for (let k = 0; k < spots.length; k++) {
    const p = spots[(start + k) % spots.length]!;
    const box = { u0: p.u - radius, u1: p.u + radius, v0: p.v - radius, v1: p.v + radius };
    if (!obstacles.some((o) => overlaps(box, o))) return p;
  }
  return null;
}

/** Room a fence leaves around a drive or a garage it would otherwise run into. */
const FENCE_GAP_M = 0.3;

/**
 * Fence runs with every stretch that would stand in a drive, on a carport's
 * floor or through a garage taken out, so a fence always stops short of what a
 * car drives through.
 */
function fenceAround(runs: readonly FenceRun[], keepClear: readonly LotRect[]): FenceRun[] {
  const out: FenceRun[] = [];
  for (const run of runs) {
    const alongU = run.v0 === run.v1;
    const lo = alongU ? Math.min(run.u0, run.u1) : Math.min(run.v0, run.v1);
    const hi = alongU ? Math.max(run.u0, run.u1) : Math.max(run.v0, run.v1);
    const line = alongU ? run.v0 : run.u0;
    const gaps: [number, number][] = [];
    for (const r of keepClear) {
      const crossLo = (alongU ? r.v0 : r.u0) - FENCE_GAP_M;
      const crossHi = (alongU ? r.v1 : r.u1) + FENCE_GAP_M;
      if (line <= crossLo || line >= crossHi) continue;
      gaps.push(
        alongU
          ? [r.u0 - FENCE_GAP_M, r.u1 + FENCE_GAP_M]
          : [r.v0 - FENCE_GAP_M, r.v1 + FENCE_GAP_M],
      );
    }
    let from = lo;
    for (const [g0, g1] of gaps.sort((a, b) => a[0] - b[0])) {
      if (g1 <= from || g0 >= hi) continue;
      if (g0 > from) out.push(segment(alongU, line, from, g0));
      from = Math.max(from, g1);
    }
    if (from < hi) out.push(segment(alongU, line, from, hi));
  }
  return out;
}

function segment(alongU: boolean, line: number, a: number, b: number): FenceRun {
  return alongU ? { u0: a, v0: line, u1: b, v1: line } : { u0: line, v0: a, u1: line, v1: b };
}

/** Everything a car drives over or parks in, which no fence and no yard part may stand in. */
function driveFootprints(drives: readonly HomeDrive[]): LotRect[] {
  return drives.flatMap((d) => (d.coverRect ? [d.rect, d.coverRect] : [d.rect]));
}

function detachedYard(
  building: BuildingInstance,
  body: LotRect,
  edgeLenM: number,
  lotDepthM: number,
  drives: readonly HomeDrive[],
  doors: readonly LotPoint[],
  entries: readonly LotRect[],
): YardPlan {
  const id = building.id;
  const lotU1 = edgeLenM - FENCE_INSET_M;
  const backV = lotDepthM - FENCE_INSET_M;
  const driven = driveFootprints(drives);

  const fence =
    roll(id, SLOT_FENCE) < 0.75
      ? fenceAround(
          [
            { u0: FENCE_INSET_M, v0: body.v1, u1: body.u0, v1: body.v1 },
            { u0: body.u1, v0: body.v1, u1: lotU1, v1: body.v1 },
            { u0: FENCE_INSET_M, v0: body.v1, u1: FENCE_INSET_M, v1: backV },
            { u0: lotU1, v0: body.v1, u1: lotU1, v1: backV },
            { u0: FENCE_INSET_M, v0: backV, u1: lotU1, v1: backV },
          ],
          driven,
        )
      : [];

  const bodyW = body.u1 - body.u0;
  const bodyUc = (body.u0 + body.u1) / 2;
  const patioW = Math.min(PATIO_MAX_WIDTH_M, bodyW - 1);
  const patio =
    roll(id, SLOT_PATIO) < 0.7 && patioW > 1 && body.v1 + PATIO_DEPTH_M < lotDepthM - 1
      ? {
          u0: bodyUc - patioW / 2,
          u1: bodyUc + patioW / 2,
          v0: body.v1,
          v1: body.v1 + PATIO_DEPTH_M,
        }
      : null;
  const grill =
    patio && roll(id, SLOT_GRILL) < 0.6 ? { u: patio.u1 - 0.6, v: patio.v1 - 0.6 } : null;

  const yardArea = { u0: 0, u1: edgeLenM, v0: body.v1, v1: lotDepthM };
  const obstacles: LotRect[] = [
    { ...body, v1: body.v1 + YARD_CLEARANCE_M },
    ...driven,
    ...(patio ? [patio] : []),
  ];
  const place = (radius: number, slot: number, chance: number): LotPoint | null => {
    if (roll(id, slot) >= chance) return null;
    const p = freeSpot(yardArea, radius, obstacles, roll(id, slot + 100));
    if (p) obstacles.push(around(p, radius));
    return p;
  };
  const pool = place(POOL_RADIUS_M, SLOT_POOL, 0.35);
  const trampoline = place(TRAMPOLINE_RADIUS_M, SLOT_TRAMPOLINE, 0.3);
  const treeRoll = roll(id, SLOT_TREES);
  const backYardM2 = edgeLenM * (lotDepthM - body.v1);
  const treeCount =
    (treeRoll < 0.35 ? 2 : treeRoll < 0.7 ? 1 : 0) + Math.floor(backYardM2 / BACK_YARD_M2_PER_TREE);
  const trees: (LotPoint & { scale: number })[] = [];
  for (let t = 0; t < treeCount; t++) {
    const p = place(TREE_RADIUS_M, SLOT_TREES + 20 + t, 1);
    if (p) trees.push({ ...p, scale: 0.9 + 0.4 * roll(id, SLOT_TREES + 40 + t) });
  }

  return {
    fence,
    fenceColour: roll(id, SLOT_FENCE_COLOUR) < 0.6 ? 'wood' : 'white',
    patios: patio ? [patio] : [],
    patioStone: roll(id, SLOT_PATIO_STONE) < 0.5 ? 'concrete' : 'brick',
    grills: grill ? [grill] : [],
    pool,
    trampoline,
    trees,
    bushes: frontBushes(
      id,
      body,
      drives,
      doors,
      entries,
      2 + Math.floor(roll(id, SLOT_BUSHES) * 3),
    ),
  };
}

/** `count` bushes spread along the front wall, clear of each door's path and every drive. */
function frontBushes(
  id: number,
  body: LotRect,
  drives: readonly HomeDrive[],
  doors: readonly LotPoint[],
  entries: readonly LotRect[],
  count: number,
): (LotPoint & { scale: number })[] {
  const v = body.v0 - BUSH_FRONT_GAP_M;
  const blocked = [
    ...doors.map((d): [number, number] => [d.u - PATH_WIDTH_M, d.u + PATH_WIDTH_M]),
    ...entries.map((r): [number, number] => [r.u0 - BUSH_ENTRY_GAP_M, r.u1 + BUSH_ENTRY_GAP_M]),
    ...drives.map((d): [number, number] => [d.rect.u0 - 0.8, d.rect.u1 + 0.8]),
  ];
  const bushes: (LotPoint & { scale: number })[] = [];
  for (let i = 0; i < count; i++) {
    const u = body.u0 + ((i + 0.5) / count) * (body.u1 - body.u0);
    if (blocked.some(([a, b]) => u > a && u < b)) continue;
    bushes.push({ u, v, scale: 0.9 + 0.5 * roll(id, SLOT_BUSHES + 10 + i) });
  }
  return bushes;
}

function rowYard(
  building: BuildingInstance,
  body: LotRect,
  edgeLenM: number,
  lotDepthM: number,
  units: number,
  drives: readonly HomeDrive[],
  doors: readonly LotPoint[],
  entries: readonly LotRect[],
): YardPlan {
  const id = building.id;
  const lotU1 = edgeLenM - FENCE_INSET_M;
  const backV = lotDepthM - FENCE_INSET_M;
  const unitW = (body.u1 - body.u0) / units;
  const runs: FenceRun[] = [
    { u0: FENCE_INSET_M, v0: backV, u1: lotU1, v1: backV },
    { u0: FENCE_INSET_M, v0: body.v1, u1: FENCE_INSET_M, v1: backV },
    { u0: lotU1, v0: body.v1, u1: lotU1, v1: backV },
  ];
  for (let k = 1; k < units; k++) {
    const u = body.u0 + k * unitW;
    runs.push({ u0: u, v0: body.v1, u1: u, v1: backV });
  }
  const patioDepth = Math.min(3, lotDepthM - body.v1 - 1);
  const patios: LotRect[] = [];
  const grills: LotPoint[] = [];
  for (let k = 0; k < units && patioDepth > 1; k++) {
    const uc = body.u0 + (k + 0.5) * unitW;
    const patio = { u0: uc - 2.5, u1: uc + 2.5, v0: body.v1, v1: body.v1 + patioDepth };
    patios.push(patio);
    if (roll(id, SLOT_UNIT_BASE + 4 * k + 1) < 0.5)
      grills.push({ u: patio.u1 - 0.6, v: patio.v1 - 0.6 });
  }
  return {
    fence: fenceAround(runs, driveFootprints(drives)),
    fenceColour: roll(id, SLOT_FENCE_COLOUR) < 0.6 ? 'wood' : 'white',
    patios,
    patioStone: roll(id, SLOT_PATIO_STONE) < 0.5 ? 'concrete' : 'brick',
    grills,
    pool: null,
    trampoline: null,
    trees: [],
    bushes: frontBushes(id, body, drives, doors, entries, units * 2),
  };
}

/**
 * The whole layout of a home's lot, or null for anything that is not a home.
 * A home fronting no street is laid out as if its street were to the north,
 * with no drive, path or verge lawn.
 */
export function planHouseLot(
  building: BuildingInstance,
  entry: BuildingCatalogEntry,
  roadAt: (x: number, z: number) => boolean,
  street: StreetLookup,
): HouseLotPlan | null {
  const ground = planHouseGround(building, entry, roadAt, street);
  if (!ground) return null;
  const { body, edgeLenM, lotDepthM, homes, drives, doors } = ground;
  const kit = planKit(building, entry, ground);
  const yard =
    homes > 1
      ? rowYard(building, body, edgeLenM, lotDepthM, homes, drives, doors, kit.entries)
      : detachedYard(building, body, edgeLenM, lotDepthM, drives, doors, kit.entries);
  return { ...ground, yard, kit };
}

/** A stoop of three risers, its landing against the wall at `v` and its two treads out from it. */
function threeRiserStoop(u: number, v: number, widthM: number, landingM: number): KitBox[] {
  const u0 = u - widthM / 2;
  const u1 = u + widthM / 2;
  const boxes: KitBox[] = [{ rect: { u0, u1, v0: v - landingM, v1: v }, y0: 0, y1: 3 * RISER_M }];
  for (let i = 1; i <= 2; i++) {
    boxes.push({
      rect: { u0, u1, v0: v - landingM - i * TREAD_M, v1: v - landingM - (i - 1) * TREAD_M },
      y0: 0,
      y1: (3 - i) * RISER_M,
    });
  }
  return boxes;
}

function hull(boxes: readonly KitBox[]): LotRect {
  return {
    u0: Math.min(...boxes.map((b) => b.rect.u0)),
    u1: Math.max(...boxes.map((b) => b.rect.u1)),
    v0: Math.min(...boxes.map((b) => b.rect.v0)),
    v1: Math.max(...boxes.map((b) => b.rect.v1)),
  };
}

/** A porch across the frontage, or null where a drive stands in its way. */
function planPorch(body: LotRect, door: LotPoint, drives: readonly HomeDrive[]): PorchPlan | null {
  const u0 = body.u0 + PORCH_INSET_M;
  const u1 = body.u1 - PORCH_INSET_M;
  const v = door.v;
  const frontV = v - PORCH_DEPTH_M;
  const stepped = threeRiserStoop(door.u, frontV, STOOP_WIDTH_M, 0);
  const steps = stepped.slice(1);
  const footprint = hull([...steps, { rect: { u0, u1, v0: frontV, v1: v }, y0: 0, y1: 0 }]);
  if (u1 - u0 < STOOP_WIDTH_M || drives.some((d) => overlaps(d.rect, footprint))) return null;
  // Posts every three metres or so, in an even number so none stands in front of the door.
  let count = Math.ceil((u1 - u0) / PORCH_POST_SPACING_M) + 1;
  if (count % 2 === 1) count += 1;
  const half = POST_M / 2;
  const postsAt = Array.from(
    { length: count },
    (_, i) => u0 + half + (i / (count - 1)) * (u1 - u0 - POST_M),
  );
  const postV = frontV + POST_M;
  const top = PORCH_FLOOR_M + PORCH_POST_HEIGHT_M;
  return {
    floor: { rect: { u0, u1, v0: frontV, v1: v }, y0: 0, y1: PORCH_FLOOR_M },
    steps,
    posts: postsAt.map((u) => ({
      rect: { u0: u - half, u1: u + half, v0: postV - half, v1: postV + half },
      y0: PORCH_FLOOR_M,
      y1: top,
    })),
    roof: {
      rect: {
        u0: u0 - PORCH_ROOF_OVERHANG_M,
        u1: u1 + PORCH_ROOF_OVERHANG_M,
        v0: frontV - PORCH_ROOF_OVERHANG_M,
        v1: v,
      },
      lowM: top,
      wallM: PORCH_FLOOR_M + PORCH_ROOF_WALL_RISE_M,
    },
  };
}

/** The gable ends a chimney may stand at: the seed picks one or both, and a drive beside an end rules it out. */
function chimneyEnds(
  id: number,
  body: LotRect,
  drives: readonly HomeDrive[],
  heightM: number,
  riseM: number,
): KitBox[] {
  const mid = (body.v0 + body.v1) / 2;
  const stack = { v0: mid - CHIMNEY_STACK_M / 2, v1: mid + CHIMNEY_STACK_M / 2 };
  const top = heightM + riseM + CHIMNEY_ABOVE_RIDGE_GABLE_M;
  const ends: LotRect[] = [
    { u0: body.u0 - CHIMNEY_OUTSIDE_M, u1: body.u0 + CHIMNEY_INSIDE_M, ...stack },
    { u0: body.u1 - CHIMNEY_INSIDE_M, u1: body.u1 + CHIMNEY_OUTSIDE_M, ...stack },
  ].filter(
    (rect) =>
      !drives.some((d) => overlaps(d.rect, rect) || (d.coverRect && overlaps(d.coverRect, rect))),
  );
  const both = roll(id, SLOT_CHIMNEY) < 0.4;
  const pick = roll(id, SLOT_CHIMNEY_AT) < 0.5 ? 0 : ends.length - 1;
  return (both ? ends : ends.slice(pick, pick + 1)).map((rect) => ({ rect, y0: 0, y1: top }));
}

/**
 * Shutters either side of every window on the street face, on the grid the
 * facade draws: a window is half its bay, a shutter half a window. A shutter
 * a door, its stoop or a garage leaf stands in front of is left off.
 */
function planShutters(
  entry: BuildingCatalogEntry,
  body: LotRect,
  heightM: number,
  keepClear: readonly [number, number][],
): KitBox[] {
  const { cols, rows } = windowGrid(entry, tierHeightOf(entry));
  const bayW = (body.u1 - body.u0) / cols;
  const bayH = heightM / rows;
  const shutterW = (bayW * WINDOW_SHARE_OF_BAY) / 2;
  const reach = (bayW * WINDOW_SHARE_OF_BAY) / 2 + shutterW / 2;
  const out: KitBox[] = [];
  for (let row = 0; row < rows; row++) {
    const y0 = (row + MULLION_MARGIN_PUNCHED) * bayH;
    const y1 = (row + 1 - MULLION_MARGIN_PUNCHED) * bayH;
    for (let col = 0; col < cols; col++) {
      const centre = body.u0 + (col + 0.5) * bayW;
      for (const side of [-1, 1]) {
        const u = centre + side * reach;
        const rect = {
          u0: u - shutterW / 2,
          u1: u + shutterW / 2,
          v0: body.v0 - SHUTTER_THICKNESS_M,
          v1: body.v0,
        };
        if (row === 0 && keepClear.some(([a, b]) => rect.u0 < b && a < rect.u1)) continue;
        out.push({ rect, y0, y1 });
      }
    }
  }
  return out;
}

/** The kit's parts, planned in the frame: what stands on and beside the body, by style, level and seed. */
function planKit(
  building: BuildingInstance,
  entry: BuildingCatalogEntry,
  ground: HouseGroundPlan,
): HouseKitPlan {
  const { body, doors, drives, homes } = ground;
  const id = building.id;
  const style = houseStyleOf(entry);
  const spec = ROOFS[style];
  const heightM = entry.height;
  const depth = body.v1 - body.v0;
  const riseM = computeRoofRise(depth, spec.slope);
  const slope = riseM / (depth / 2);
  const mid = (body.v0 + body.v1) / 2;

  const stoops: KitBox[] = [];
  const porticos: PorticoPlan[] = [];
  let porch: PorchPlan | null = null;
  const entries: LotRect[] = [];
  for (const door of doors) {
    if (style === 'ranch') {
      const slab = {
        rect: {
          u0: door.u - RANCH_STOOP_WIDTH_M / 2,
          u1: door.u + RANCH_STOOP_WIDTH_M / 2,
          v0: door.v - RANCH_STOOP_DEPTH_M,
          v1: door.v,
        },
        y0: 0,
        y1: RISER_M,
      };
      stoops.push(slab);
      entries.push(slab.rect);
    } else if (style === 'cape' || style === 'colonial') {
      porch =
        style === 'colonial' && roll(id, SLOT_ENTRY) < 0.5 ? planPorch(body, door, drives) : null;
      if (porch) {
        stoops.push(...porch.steps);
        entries.push(hull([porch.floor, ...porch.steps]));
      } else {
        const steps = threeRiserStoop(door.u, door.v, PORTICO_WIDTH_M, PORTICO_DEPTH_M);
        stoops.push(...steps);
        porticos.push({ u: door.u, v: door.v });
        entries.push(hull(steps));
      }
    } else {
      const steps = threeRiserStoop(door.u, door.v, STOOP_WIDTH_M, STOOP_LANDING_M);
      stoops.push(...steps);
      entries.push(hull(steps));
    }
  }

  let chimneys: KitBox[] = [];
  if (style === 'ranch' || style === 'cape') {
    const bodyW = body.u1 - body.u0;
    const at = style === 'cape' ? 0.5 : roll(id, SLOT_CHIMNEY) < 0.5 ? 0.3 : 0.7;
    const u = body.u0 + at * bodyW;
    chimneys = [
      {
        rect: {
          u0: u - CHIMNEY_FLUE_M / 2,
          u1: u + CHIMNEY_FLUE_M / 2,
          v0: mid - CHIMNEY_FLUE_M / 2,
          v1: mid + CHIMNEY_FLUE_M / 2,
        },
        y0: heightM,
        y1: heightM + riseM + CHIMNEY_ABOVE_RIDGE_INTERIOR_M,
      },
    ];
  } else if (style !== 'row') {
    chimneys = chimneyEnds(id, body, drives, heightM, riseM);
  }

  const dormers: DormerPlan[] = [];
  if (style === 'cape') {
    // As many as fit evenly spaced with the end inset kept, up to two.
    const room = (n: number): number => (body.u1 - body.u0 - n * DORMER_WIDTH_M) / (n + 1);
    const count =
      room(DORMERS) >= DORMER_END_INSET_M ? DORMERS : room(1) >= DORMER_END_INSET_M ? 1 : 0;
    const gap = room(count);
    for (let k = 0; k < count; k++) {
      dormers.push({
        u: body.u0 + gap * (k + 1) + DORMER_WIDTH_M * (k + 0.5),
        v: body.v0 + DORMER_RISE_M / slope,
        y: heightM + DORMER_RISE_M,
      });
    }
  }

  const keepClear: [number, number][] = [
    ...doors.map((d): [number, number] => [d.u - PORTICO_WIDTH_M / 2, d.u + PORTICO_WIDTH_M / 2]),
    ...drives
      .filter((d) => d.cover === 'integralGarage' && d.garageDoor)
      .map((d): [number, number] => {
        const c = (d.garageDoor!.u0 + d.garageDoor!.u1) / 2;
        return [c - GARAGE_LEAF_ROW_WIDTH_M / 2, c + GARAGE_LEAF_ROW_WIDTH_M / 2];
      }),
  ];
  const shutters = style === 'ranch' ? [] : planShutters(entry, body, heightM, keepClear);

  const parapets: KitBox[] = [];
  if (style === 'row' && homes > 1) {
    const unitW = (body.u1 - body.u0) / homes;
    for (let k = 1; k < homes; k++) {
      const u = body.u0 + k * unitW;
      parapets.push({
        rect: {
          u0: u - PARAPET_THICKNESS_M / 2,
          u1: u + PARAPET_THICKNESS_M / 2,
          v0: body.v0,
          v1: body.v1,
        },
        y0: heightM,
        y1: heightM + PARAPET_ABOVE_ROOF_M,
      });
    }
  }

  return {
    style,
    heightM,
    roof: {
      rect: {
        u0: body.u0 - spec.rakeM,
        u1: body.u1 + spec.rakeM,
        v0: body.v0 - spec.eaveM,
        v1: body.v1 + spec.eaveM,
      },
      eaveM: spec.eaveM,
      rakeM: spec.rakeM,
      slope,
      riseM,
    },
    chimneys,
    stoops,
    porticos,
    porch,
    dormers,
    shutters,
    parapets,
    entries,
  };
}

/** A home's lot without its yard — the cheap half, for callers that only need the drives. */
/**
 * Where a home's first front door stands, in world metres, or null for a
 * building that is not a house or has no street to open onto. What a walker
 * from that home heads for when they go in.
 */
export function frontDoorOf(
  building: BuildingInstance,
  entry: BuildingCatalogEntry,
  roadAt: (x: number, z: number) => boolean,
  street: StreetLookup,
): { x: number; z: number } | null {
  const plan = planHouseGround(building, entry, roadAt, street);
  const door = plan?.doors[0];
  if (!plan || !door) return null;
  return lotToWorld(plan.frame, door.u, door.v);
}

export function planHouseGround(
  building: BuildingInstance,
  entry: BuildingCatalogEntry,
  roadAt: (x: number, z: number) => boolean,
  street: StreetLookup,
): HouseGroundPlan | null {
  if (!isHouseEntry(entry)) return null;
  const { w, d } = entry.footprint;
  const edge = findStreetFacingEdge(building.x, building.z, w, d, street);
  const frame = edgeFrameFor(edge?.side ?? 'N', building.x, building.z, w, d);
  const alongTiles = edge ? edge.edgeTiles : w;
  const edgeLenM = alongTiles * TILE_METERS;
  const lotDepthM = (edge && (edge.side === 'E' || edge.side === 'W') ? w : d) * TILE_METERS;
  const body = bodyRect(building, entry, frame, street);
  const surface: DriveSurface = roll(building.id, SLOT_SURFACE) < 0.4 ? 'dirt' : 'concrete';

  const streets = edge ? streetsAcross(building, entry, edge, roadAt, street) : null;
  const vergeLawn: LotRect[] = [];
  if (streets) {
    streets.across.forEach((s, i) => {
      if (s && s.vergeM > 0) {
        vergeLawn.push({ u0: i * TILE_METERS, u1: (i + 1) * TILE_METERS, v0: -s.vergeM, v1: 0 });
      }
    });
  }

  const drives: HomeDrive[] = [];
  const doors: LotPoint[] = [];
  const paths: LotRect[] = [];
  // A path only meets the back of the sidewalk, so any street across will do,
  // straight or not.
  const pathTo = (u: number): void => {
    const s = streets?.across[Math.floor(u / TILE_METERS)];
    if (!s) return;
    paths.push({ u0: u - PATH_WIDTH_M / 2, u1: u + PATH_WIDTH_M / 2, v0: -s.vergeM, v1: body.v0 });
  };

  const homes = homesAlongFrontage(entry, edge);
  if (homes > 1 && (body.u1 - body.u0) / homes >= FRONT_HOME_MIN_WIDTH_M) {
    const units = homes;
    const unitW = (body.u1 - body.u0) / units;
    for (let k = 0; k < units; k++) {
      // Each home's pad sits at its near edge and its door at the far one.
      const unitU0 = body.u0 + k * unitW;
      const padU0 = unitU0 + FRONT_PAD_INSET_M;
      const door = { u: unitU0 + unitW - FRONT_DOOR_INSET_M, v: body.v0 };
      doors.push(door);
      const integral = roll(building.id, SLOT_UNIT_BASE + 4 * k) < 0.5;
      const pad = streets ? frontPad(padU0, padU0 + DRIVE_WIDTH_M, body, streets, integral) : null;
      if (pad) drives.push(pad);
      pathTo(door.u);
    }
    return {
      frame,
      edge,
      edgeLenM,
      lotDepthM,
      body,
      homes: units,
      doors,
      paths,
      vergeLawn,
      drives,
      surface,
    };
  }

  const door = { u: (body.u0 + body.u1) / 2, v: body.v0 };
  doors.push(door);
  if (streets) {
    const drive =
      sideDrive(building, body, edgeLenM, lotDepthM, streets) ??
      frontPad(door.u + 1, door.u + 1 + DRIVE_WIDTH_M, body, streets, false);
    if (drive) drives.push(drive);
    pathTo(door.u);
  }
  return {
    frame,
    edge,
    edgeLenM,
    lotDepthM,
    body,
    homes: 1,
    doors,
    paths,
    vergeLawn,
    drives,
    surface,
  };
}

/** The road tiles a home's drives cross — where a lamp must not stand. */
export function driveRoadTiles(
  building: BuildingInstance,
  entry: BuildingCatalogEntry,
  plan: HouseGroundPlan,
): { x: number; z: number }[] {
  if (!plan.edge) return [];
  const out: { x: number; z: number }[] = [];
  const seen = new Set<number>();
  for (const drive of plan.drives) {
    const first = Math.floor(drive.cut.u0 / TILE_METERS);
    const last = Math.floor((drive.cut.u1 - 1e-6) / TILE_METERS);
    for (let i = first; i <= last; i++) {
      if (seen.has(i)) continue;
      seen.add(i);
      out.push(
        roadTileAcross(plan.edge, building.x, building.z, entry.footprint.w, entry.footprint.d, i),
      );
    }
  }
  return out;
}
