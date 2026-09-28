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
import { ZoneType } from '../shared/types';
import { TILE_METERS } from '../shared/constants';
import {
  edgeFrameFor,
  findStreetFacingEdge,
  frameToWorld,
  type EdgeFrame,
  type RoadFacingEdge,
  type StreetLookup,
} from './frontage';
import { footprintShrinkFor, frontageSetbackFor } from './massing';
import { isHouseEntry } from './archetypes';

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
export type DriveCover = 'spot' | 'carport' | 'garage' | 'detachedGarage' | 'pad' | 'integralGarage';

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
  /** How many homes the lot holds: one, or one per frontage tile for a row along its street. */
  homes: number;
  /** Where each home's front door stands on the front wall. */
  doors: LotPoint[];
  paths: LotRect[];
  /** The lawn carried out across the verge, one strip per frontage tile with a street beyond it. */
  vergeLawn: LotRect[];
  drives: HomeDrive[];
  surface: DriveSurface;
}

export interface HouseLotPlan extends HouseGroundPlan {
  yard: YardPlan;
}

/** A frame point in world metres. */
export function lotToWorld(frame: EdgeFrame, u: number, v: number): { x: number; z: number } {
  return frameToWorld(frame, u, -v / TILE_METERS);
}

/** The frame yaw that points a vehicle's nose (+Z) into the lot, away from the street. */
export function inwardYaw(frame: EdgeFrame): number {
  // Inward is -outward: along world Z for a frame running along X, else X.
  return frame.alongX ? (frame.outwardSign === -1 ? 0 : Math.PI) : frame.outwardSign === 1 ? -Math.PI / 2 : Math.PI / 2;
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
  const shrink = footprintShrinkFor(entry);
  const shift = frontageSetbackFor(entry, building.x, building.z, () => false, street);
  const cx = (building.x + entry.footprint.w / 2) * TILE_METERS + shift.centerXM;
  const cz = (building.z + entry.footprint.d / 2) * TILE_METERS + shift.centerZM;
  const hx = (entry.footprint.w * TILE_METERS * shrink) / 2;
  const hz = (entry.footprint.d * TILE_METERS * shrink) / 2;
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
function roadTileAcross(edge: RoadFacingEdge, x: number, z: number, w: number, d: number, i: number) {
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
function driveReach(streets: Streets, u0: number, u1: number): { vergeM: number; sidewalkM: number } | null {
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

/** A row laid out along its frontage: one home per lot tile, each with its own share of the body. */
function isRowAlongFrontage(entry: BuildingCatalogEntry, edge: RoadFacingEdge | null): boolean {
  return entry.zone === ZoneType.ResMediumRow && edge !== null && edge.edgeTiles >= 2;
}

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
      gaps.push(alongU ? [r.u0 - FENCE_GAP_M, r.u1 + FENCE_GAP_M] : [r.v0 - FENCE_GAP_M, r.v1 + FENCE_GAP_M]);
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
      ? { u0: bodyUc - patioW / 2, u1: bodyUc + patioW / 2, v0: body.v1, v1: body.v1 + PATIO_DEPTH_M }
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
    bushes: frontBushes(id, body, drives, doors, 2 + Math.floor(roll(id, SLOT_BUSHES) * 3)),
  };
}

/** `count` bushes spread along the front wall, clear of each door's path and every drive. */
function frontBushes(
  id: number,
  body: LotRect,
  drives: readonly HomeDrive[],
  doors: readonly LotPoint[],
  count: number,
): (LotPoint & { scale: number })[] {
  const v = body.v0 - BUSH_FRONT_GAP_M;
  const blocked = [
    ...doors.map((d): [number, number] => [d.u - PATH_WIDTH_M, d.u + PATH_WIDTH_M]),
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
    if (roll(id, SLOT_UNIT_BASE + 4 * k + 1) < 0.5) grills.push({ u: patio.u1 - 0.6, v: patio.v1 - 0.6 });
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
    bushes: frontBushes(id, body, drives, doors, units * 2),
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
  const yard =
    homes > 1
      ? rowYard(building, body, edgeLenM, lotDepthM, homes, drives, doors)
      : detachedYard(building, body, edgeLenM, lotDepthM, drives, doors);
  return { ...ground, yard };
}

/** A home's lot without its yard — the cheap half, for callers that only need the drives. */
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

  if (isRowAlongFrontage(entry, edge)) {
    const units = edge!.edgeTiles;
    const unitW = (body.u1 - body.u0) / units;
    for (let k = 0; k < units; k++) {
      const unitU0 = body.u0 + k * unitW;
      const padU0 = unitU0 + 1;
      const door = { u: unitU0 + unitW - 2.5, v: body.v0 };
      doors.push(door);
      const integral = roll(building.id, SLOT_UNIT_BASE + 4 * k) < 0.5;
      const pad = streets ? frontPad(padU0, padU0 + DRIVE_WIDTH_M, body, streets, integral) : null;
      if (pad) drives.push(pad);
      pathTo(door.u);
    }
    return { frame, edge, edgeLenM, lotDepthM, body, homes: units, doors, paths, vergeLawn, drives, surface };
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
  return { frame, edge, edgeLenM, lotDepthM, body, homes: 1, doors, paths, vergeLawn, drives, surface };
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
      out.push(roadTileAcross(plan.edge, building.x, building.z, entry.footprint.w, entry.footprint.d, i));
    }
  }
  return out;
}
