/**
 * What stands on a shop's, an office's or a works' lot besides its building
 * and its car park: lights, a sign, planting, a walk to the door, a bench, a
 * bin, bicycles, a refuse enclosure and a works' yard fence. One pure plan in
 * the lot's frontage frame (u along the street, v into the lot), laid on the
 * ground the layout leaves free, in the order of need; a piece that does not
 * fit is left out, and no piece moves the body or a stall.
 */
import { MIN_FRONT_WALK_M } from './parkingcode';
import {
  DOCK_PLATFORM_DEPTH_M,
  type LotLayout,
  type LotPoint,
  type LotRect,
  type LoadingWall,
} from './lotlayout';
import type { BuildingKind } from './types';

/** A pole light's height, and the shorter one within reach of a residential zone. */
export const LOT_LIGHT_HEIGHT_M = 7.6;
export const LOT_LIGHT_NEAR_HOMES_M = 4.3;
/** A light closer than this to a residential zone is the short pole. */
export const LOT_LIGHT_HOME_REACH_M = 30;
/** Lights stand this many mounting heights apart. */
export const LOT_LIGHT_SPACING_HEIGHTS = 4;
/** A light's pole base. */
export const LOT_LIGHT_POLE_M = 0.3;

/** The planted strip inside a lot line, where the car park holds ten spaces or more. */
export const LOT_PERIMETER_STRIP_M = 1.5;
export const LOT_PERIMETER_MIN_SPACES = 10;
/** The deeper strip on a side that abuts a residential zone. */
export const LOT_HOME_BUFFER_M = 3.0;
export const SHRUB_SPACING_M = 1.5;
export const SHRUB_FOOTPRINT_M = 0.9;
export const TREE_FOOTPRINT_M = 1.0;
export const FRONTAGE_TREE_SPACING_M = 9;

/** A monument sign: 1.8 m high, a 2.3 m² face (2.0 m wide), its face 1.5 m inside the street line. */
export const MONUMENT_SIGN = { height: 1.8, width: 2.0, depth: 0.4, setback: 1.5 } as const;
/** A pylon sign: 7.6 m high, 0.46 m² of face a metre of frontage up to 14 m², 0.6 m inside the lot lines. */
export const PYLON_SIGN = {
  height: 7.6,
  faceAreaPerFrontageM: 0.46,
  maxFaceArea: 14,
  cabinetHeight: 4,
  depth: 0.5,
  setback: 0.6,
} as const;
/** A strip, a market and a filling station on a frontage this long or longer carry a pylon. */
export const PYLON_MIN_FRONTAGE_M = 60;
const PYLON_KINDS: ReadonlySet<BuildingKind> = new Set(['strip', 'supermarket', 'fuel']);
/** The ground each side of the drive mouth a sign on a pole takes where the kit lays its own. */
const KIT_SIGN_WIDTH_M = 3.66;
const KIT_SIGN_GAP_M = 0.5;
/** The kit's dumpster enclosure stands 0.8 m off the body, 3.66 m long at most, with room to open. */
const KIT_REFUSE_GAP_M = 0.8;
const KIT_REFUSE_LENGTH_M = 3.66;
const KIT_REFUSE_MARGIN_M = 0.5;
const KIT_SIGN_DEPTH_M = MONUMENT_SIGN.setback + MONUMENT_SIGN.depth;
/** A sign stands this far off the drive's edge. */
const SIGN_DRIVE_GAP_M = 1;

/** The walk from the street's footway to the door, and the bench, bin and bicycles beside it. */
export const LOT_WALK_WIDTH_M = 1.5;
export const BENCH_M = { along: 1.8, depth: 0.6, height: 0.9 } as const;
export const BIN_M = { along: 0.6, depth: 0.6, height: 1.0 } as const;
/** A bicycle space is 0.6 × 1.8 m; a lot has two, in a row along the wall, with 1.5 m to manoeuvre. */
export const BIKE_SPACE_M = { width: 0.6, length: 1.8 } as const;
export const BIKE_SPACES = 2;
export const BIKE_MANOEUVRE_M = 1.5;
/** An entrance bed 1.2 m deep along the front wall, never shorter than this. */
export const ENTRANCE_BED_DEPTH_M = 1.2;
const ENTRANCE_BED_MIN_M = 1.5;
/** A door's clear ground: the width across it and the depth in front of the wall. */
export const DOOR_CLEAR_M = 3;
const DOOR_CLEAR_DEPTH_M = 1.2;
const DOOR_FURNITURE_GAP_M = 0.2;

/** A repair shop's office in its end wall: the glass from the street corner in, its door beside it. */
export const REPAIR_OFFICE_M = { corner: 0.6, glass: 3, doorGap: 0.2, door: 0.9 } as const;
/** The office door's middle, in from the street corner of its wall. */
export const REPAIR_OFFICE_DOOR_IN_M =
  REPAIR_OFFICE_M.corner +
  REPAIR_OFFICE_M.glass +
  REPAIR_OFFICE_M.doorGap +
  REPAIR_OFFICE_M.door / 2;

/** The ground at each end of a front wall the kit's ice locker and propane cage take: this wide along the wall, this deep off it. */
export const WALL_LOCKER_ZONE_M = { along: 2.4, depth: 1.0 } as const;

/** A refuse enclosure: 2.4 × 3.7 m inside, 1.8 m walls, a 3.7 m gate, a 2.4 m apron before it. */
export const REFUSE_ENCLOSURE_M = {
  inside: { across: 3.7, depth: 2.4 },
  wall: 0.2,
  wallHeight: 1.8,
  gate: 3.7,
  apron: 2.4,
} as const;

/** A works' yard fence: 2.4 m chain link, with a gate 7.3 m wide at the drive. */
export const YARD_FENCE_HEIGHT_M = 2.4;
export const YARD_GATE_M = 7.3;
/** The works that stand behind a fence: every industrial kind but flex space. */
const UNFENCED_KINDS: ReadonlySet<BuildingKind> = new Set(['flex']);

const EPS = 0.01;

/** The way a piece faces, along the frame's axes. */
export type GroundsFacing = 'u+' | 'u-' | 'v+' | 'v-';

/** A side of the lot that can abut a residential zone; the street side never does. */
export type HomeSide = 'u-' | 'u+' | 'v+';

export type GroundsKind =
  | 'light'
  | 'monument'
  | 'pylon'
  | 'tree'
  | 'shrub'
  | 'bed'
  | 'walk'
  | 'crossing'
  | 'bench'
  | 'bin'
  | 'bikeRack'
  | 'refuse'
  | 'fence'
  | 'gate';

export interface GroundsPiece {
  kind: GroundsKind;
  /** The ground it takes; a fence run or gate is a line, its thin side zero. */
  rect: LotRect;
  /** The side it faces: a sign and a bench the street, an enclosure's gate its aisle. */
  facing: GroundsFacing;
  /** Standing height in metres: a pole's, a wall's, a sign's. */
  height: number;
  /** A light's pole is the short one. */
  short?: boolean;
  /** A walk the layout already paves; the renderer does not lay it again. */
  laid?: boolean;
  /** A walk over a planted island, drawn above its kerb. */
  raised?: boolean;
}

/** What the plan needs to know beyond the layout. */
export interface LotGroundsFacts {
  kind: BuildingKind | undefined;
  category: 'com' | 'ind';
  /** The sides of the lot that abut a residential zone. */
  homeSides: readonly HomeSide[];
  /** The kit already stands a pole sign (pylon, sign pole or price sign) on this lot. */
  kitSign: boolean;
  /** The kit already stands a refuse enclosure on this lot. */
  kitRefuse: boolean;
  /** The kit stands its own furniture (cart corrals) in the car park's islands. */
  kitIslandFurniture?: boolean;
  /** The kit stands lockers against both ends of the front wall, which the wall furniture leaves free. */
  kitWallLockers?: boolean;
  /** The side of the drive a sign is set on first: the side traffic arrives from. */
  signSide?: 'u-' | 'u+';
}

export interface LotGroundsPlan {
  pieces: GroundsPiece[];
}

const overlaps = (a: LotRect, b: LotRect): boolean =>
  a.u0 < b.u1 - EPS && b.u0 < a.u1 - EPS && a.v0 < b.v1 - EPS && b.v0 < a.v1 - EPS;

const within = (r: LotRect, lot: LotRect): boolean =>
  r.u0 >= lot.u0 - EPS && r.u1 <= lot.u1 + EPS && r.v0 >= lot.v0 - EPS && r.v1 <= lot.v1 + EPS;

const around = (u: number, v: number, w: number, d: number): LotRect => ({
  u0: u - w / 2,
  u1: u + w / 2,
  v0: v - d / 2,
  v1: v + d / 2,
});

/** Whether the lot's kind and frontage call for a pylon rather than a monument sign. */
export function wantsPylon(kind: BuildingKind | undefined, along: number): boolean {
  return kind !== undefined && PYLON_KINDS.has(kind) && along >= PYLON_MIN_FRONTAGE_M - EPS;
}

/** Whether a works' yard is fenced. */
export function isFencedWorks(facts: Pick<LotGroundsFacts, 'category' | 'kind'>): boolean {
  return facts.category === 'ind' && !(facts.kind && UNFENCED_KINDS.has(facts.kind));
}

/** The pylon's face, in square metres, on a frontage `along` metres long. */
export function pylonFaceArea(along: number): number {
  return Math.min(PYLON_SIGN.faceAreaPerFrontageM * along, PYLON_SIGN.maxFaceArea);
}

/** The ground a door keeps clear: the body's street door, a row of service bay doors across its street face, and the wall a loading dock stands on. */
export function doorClearances(layout: LotLayout): LotRect[] {
  const { body, entrance } = layout;
  const out: LotRect[] = [
    {
      u0: entrance.u - DOOR_CLEAR_M / 2,
      u1: entrance.u + DOOR_CLEAR_M / 2,
      v0: body.v0 - DOOR_CLEAR_DEPTH_M,
      v1: body.v0,
    },
  ];
  if (layout.bayDoors) {
    out.push({ ...layout.bayDoors, v0: body.v0 - DOOR_CLEAR_DEPTH_M, v1: body.v0 });
    out.push(officeDoorClearance(layout));
  }
  const wall: LoadingWall | null = layout.loadingWall;
  if (wall === 'v+') out.push({ ...body, v0: body.v1, v1: body.v1 + DOCK_PLATFORM_DEPTH_M });
  if (wall === 'u+') out.push({ ...body, u0: body.u1, u1: body.u1 + DOCK_PLATFORM_DEPTH_M });
  if (wall === 'u-') out.push({ ...body, u0: body.u0 - DOCK_PLATFORM_DEPTH_M, u1: body.u0 });
  return out;
}

/** Ground a vehicle drives over: a walk crossing it is painted. */
const drivenGround = (layout: LotLayout): LotRect[] => [
  ...layout.aisles,
  ...(layout.throat ? [layout.throat] : []),
];

/** The lot's ground that is never a walk or an aisle: the body, the stalls, the berths and the yards. */
function solidGround(layout: LotLayout): LotRect[] {
  return [
    layout.body,
    ...layout.stalls.map((s) => s.rect),
    ...layout.accessAisles,
    ...layout.berths,
    ...layout.trailerStalls,
    ...(layout.forecourt ? [layout.forecourt] : []),
    ...(layout.rearYard ? [layout.rearYard] : []),
    ...(layout.driveThrough?.rects ?? []),
    ...(layout.driveThrough?.island ? [layout.driveThrough.island] : []),
    ...(layout.driveThrough?.links ?? []),
    ...(layout.lube
      ? [layout.lube.apron, layout.lube.lane, layout.lube.court].filter((r) => r !== null)
      : []),
  ];
}

/** Every piece of the lot's own ground a furnishing must stay off, apart from its planted islands. */
function hardGround(layout: LotLayout): LotRect[] {
  return [
    ...solidGround(layout),
    ...drivenGround(layout),
    ...(layout.frontWalk ? [layout.frontWalk] : []),
    ...(layout.entranceWalk ? [layout.entranceWalk] : []),
    ...doorClearances(layout),
  ];
}

interface Ctx {
  layout: LotLayout;
  facts: LotGroundsFacts;
  lot: LotRect;
  hard: LotRect[];
  /** Ground the plan has already given to a piece or reserved for the kit's own. */
  taken: LotRect[];
  pieces: GroundsPiece[];
}

/** Whether `rect` lies in the lot on ground nothing else holds; `island` lets it stand in a planted island. */
function clear(ctx: Ctx, rect: LotRect, island = false, onWalk = false): boolean {
  if (!within(rect, ctx.lot)) return false;
  const { frontWalk, entranceWalk } = ctx.layout;
  if (onWalk && frontWalk && within(rect, frontWalk)) {
    // Furniture stands against the wall on the front walk, which lies over the aisle's end; only a door or the entrance walk stops it.
    const stops = [
      ...solidGround(ctx.layout),
      ...doorClearances(ctx.layout),
      ...(entranceWalk ? [entranceWalk] : []),
    ];
    return !stops.some((h) => overlaps(h, rect)) && !ctx.taken.some((t) => overlaps(t, rect));
  }
  if (ctx.hard.some((h) => overlaps(h, rect))) return false;
  if (!island && ctx.layout.islands.some((i) => overlaps(i, rect))) return false;
  return !ctx.taken.some((t) => overlaps(t, rect));
}

function put(ctx: Ctx, piece: GroundsPiece, claim = true): void {
  ctx.pieces.push(piece);
  if (claim && piece.rect.u1 - piece.rect.u0 > EPS && piece.rect.v1 - piece.rect.v0 > EPS) {
    ctx.taken.push(piece.rect);
  }
}

const homeDistance = (side: HomeSide, p: LotPoint, lot: LotRect): number =>
  side === 'u-' ? p.u - lot.u0 : side === 'u+' ? lot.u1 - p.u : lot.v1 - p.v;

// ---------------------------------------------------------------------------
// The walk
// ---------------------------------------------------------------------------

/** The walk from the footway to the door: the layout's own where it has one, else a straight run that no stall or island crosses. */
function planWalk(ctx: Ctx): void {
  for (const piece of walkPieces(ctx.layout)) put(ctx, piece);
}

/**
 * The walk's pieces from the layout alone. Where no straight route is free of
 * the car park's islands, the walk runs through the planted island nearest the
 * entrance, which it paves, and its tree is dropped (`droppedTrees`).
 */
export function walkPieces(layout: LotLayout): GroundsPiece[] {
  if (layout.noPublicDoor) return [];
  if (layout.entranceWalk) {
    return [{ kind: 'walk', rect: layout.entranceWalk, facing: 'v+', height: 0, laid: true }];
  }
  const front = layout.frontWalk;
  const end = front ? front.v0 : layout.body.v0;
  if (end <= EPS) return [];
  const half = LOT_WALK_WIDTH_M / 2;
  const lo = front ? front.u0 + half : layout.entrance.u;
  const hi = front ? front.u1 - half : layout.entrance.u;
  const solid = [
    layout.body,
    ...layout.stalls.map((s) => s.rect),
    ...layout.accessAisles,
    ...layout.berths,
    ...layout.trailerStalls,
    ...(layout.forecourt ? [layout.forecourt] : []),
    ...(layout.rearYard ? [layout.rearYard] : []),
    ...(layout.driveThrough?.rects ?? []),
  ];
  const e = layout.entrance.u;
  const free = (u: number, islands: boolean): LotRect | null => {
    if (u < lo - EPS || u > hi + EPS) return null;
    const walk: LotRect = { u0: u - half, u1: u + half, v0: 0, v1: end };
    if (!within(walk, layout.lot) || solid.some((s) => overlaps(s, walk))) return null;
    if (!islands && layout.islands.some((i) => overlaps(i, walk))) return null;
    return walk;
  };
  for (let step = 0; e - step >= lo - EPS || e + step <= hi + EPS; step += 0.5) {
    for (const u of step === 0 ? [e] : [e - step, e + step]) {
      const walk = free(u, false);
      if (walk) return layWalk(layout, walk);
    }
  }
  // No clear gap: through a planted island, the nearest the entrance, as wide as the walk.
  const through = layout.islands
    .filter((i) => i.u1 - i.u0 >= LOT_WALK_WIDTH_M - EPS)
    .map((i) => Math.min(Math.max(e, i.u0 + half), i.u1 - half))
    .sort((a, b) => Math.abs(a - e) - Math.abs(b - e));
  for (const u of through) {
    const walk = free(u, true);
    if (walk) return layWalk(layout, walk);
  }
  return [];
}

/** The island trees a walk through an island takes the place of. */
export function droppedTrees(layout: LotLayout): LotPoint[] {
  const walks = walkPieces(layout).map((p) => p.rect);
  return layout.trees.filter((t) =>
    walks.some((w) => t.u > w.u0 && t.u < w.u1 && t.v > w.v0 && t.v < w.v1),
  );
}

/** A straight walk as concrete, painted where it crosses a driven aisle; raised where it crosses an island. */
function layWalk(layout: LotLayout, walk: LotRect): GroundsPiece[] {
  const out: GroundsPiece[] = [];
  const put = (kind: 'walk' | 'crossing', rect: LotRect): void => {
    const raised = layout.islands.some((i) => overlaps(i, rect));
    out.push({ kind, rect, facing: 'v+', height: 0, ...(raised ? { raised: true } : {}) });
  };
  const crossings = drivenGround(layout)
    .filter((a) => a.u0 < walk.u1 - EPS && walk.u0 < a.u1 - EPS && a.v0 < walk.v1 && walk.v0 < a.v1)
    .map((a) => ({ v0: Math.max(a.v0, walk.v0), v1: Math.min(a.v1, walk.v1) }))
    .sort((a, b) => a.v0 - b.v0);
  const merged: { v0: number; v1: number }[] = [];
  for (const c of crossings) {
    const last = merged[merged.length - 1];
    if (last && c.v0 <= last.v1 + EPS) last.v1 = Math.max(last.v1, c.v1);
    else merged.push({ ...c });
  }
  let v = walk.v0;
  for (const c of merged) {
    if (c.v0 - v > EPS) put('walk', { ...walk, v0: v, v1: c.v0 });
    put('crossing', { ...walk, v0: c.v0, v1: c.v1 });
    v = c.v1;
  }
  if (walk.v1 - v > EPS) put('walk', { ...walk, v0: v });
  return out;
}

// ---------------------------------------------------------------------------
// The sign
// ---------------------------------------------------------------------------

function planSign(ctx: Ctx): void {
  const { layout, facts, lot } = ctx;
  const cut = layout.curbCut;
  const sides: ('u-' | 'u+')[] = facts.signSide === 'u+' ? ['u+', 'u-'] : ['u-', 'u+'];
  if (facts.kitSign) {
    // The kit stands its own pole sign nearest the drive mouth, either side of it.
    ctx.taken.push(
      {
        u0: cut.u1 + KIT_SIGN_GAP_M,
        u1: cut.u1 + KIT_SIGN_GAP_M + KIT_SIGN_WIDTH_M,
        v0: 0,
        v1: KIT_SIGN_DEPTH_M,
      },
      {
        u0: cut.u0 - KIT_SIGN_GAP_M - KIT_SIGN_WIDTH_M,
        u1: cut.u0 - KIT_SIGN_GAP_M,
        v0: 0,
        v1: KIT_SIGN_DEPTH_M,
      },
    );
    return;
  }
  const pylon = wantsPylon(facts.kind, lot.u1);
  const width = pylon ? pylonFaceArea(lot.u1) / PYLON_SIGN.cabinetHeight : MONUMENT_SIGN.width;
  const depth = pylon ? PYLON_SIGN.depth : MONUMENT_SIGN.depth;
  const v0 = pylon ? PYLON_SIGN.setback : MONUMENT_SIGN.setback;
  for (let step = 0; step <= lot.u1; step += 0.5) {
    for (const side of sides) {
      const u0 =
        side === 'u+' ? cut.u1 + SIGN_DRIVE_GAP_M + step : cut.u0 - SIGN_DRIVE_GAP_M - step - width;
      const rect: LotRect = { u0, u1: u0 + width, v0, v1: v0 + depth };
      if (!clear(ctx, rect, true)) continue;
      put(ctx, {
        kind: pylon ? 'pylon' : 'monument',
        rect,
        facing: 'v-',
        height: pylon ? PYLON_SIGN.height : MONUMENT_SIGN.height,
      });
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Lights and planting
// ---------------------------------------------------------------------------

/** The planted strip along each lot line a car park or a residential neighbour earns. */
function stripBands(ctx: Ctx): { side: 'u-' | 'u+' | 'v-' | 'v+'; rect: LotRect; width: number }[] {
  const { lot, facts, layout } = ctx;
  const bands: { side: 'u-' | 'u+' | 'v-' | 'v+'; rect: LotRect; width: number }[] = [];
  const parked = layout.provided >= LOT_PERIMETER_MIN_SPACES;
  const sideWidth = (side: HomeSide): number =>
    facts.homeSides.includes(side) ? LOT_HOME_BUFFER_M : parked ? LOT_PERIMETER_STRIP_M : 0;
  const frontWidth = parked ? LOT_PERIMETER_STRIP_M : 0;
  if (frontWidth > 0)
    bands.push({ side: 'v-', rect: { ...lot, v1: lot.v0 + frontWidth }, width: frontWidth });
  const rear = sideWidth('v+');
  if (rear > 0) bands.push({ side: 'v+', rect: { ...lot, v0: lot.v1 - rear }, width: rear });
  const left = sideWidth('u-');
  if (left > 0) bands.push({ side: 'u-', rect: { ...lot, u1: lot.u0 + left }, width: left });
  const right = sideWidth('u+');
  if (right > 0) bands.push({ side: 'u+', rect: { ...lot, u0: lot.u1 - right }, width: right });
  return bands;
}

/** A point on a band's middle line, stepped `spacing` along it from its first free end. */
function bandPoints(band: { side: string; rect: LotRect }, spacing: number, from = 0): LotPoint[] {
  const r = band.rect;
  const alongU = band.side === 'v-' || band.side === 'v+';
  const length = alongU ? r.u1 - r.u0 : r.v1 - r.v0;
  const mid = alongU ? (r.v0 + r.v1) / 2 : (r.u0 + r.u1) / 2;
  const out: LotPoint[] = [];
  for (let s = from; s <= length + EPS; s += spacing) {
    out.push(alongU ? { u: r.u0 + s, v: mid } : { u: mid, v: r.v0 + s });
  }
  return out;
}

function planLights(ctx: Ctx): void {
  const { layout, facts, lot } = ctx;
  const candidates: LotPoint[] = [];
  for (const island of facts.kitIslandFurniture ? [] : layout.islands) {
    const cu = (island.u0 + island.u1) / 2;
    const cv = (island.v0 + island.v1) / 2;
    const longV = island.v1 - island.v0 >= island.u1 - island.u0;
    candidates.push({ u: cu, v: cv });
    for (
      let off = 1.2;
      off <= (longV ? island.v1 - island.v0 : island.u1 - island.u0) / 2;
      off += 1.2
    ) {
      candidates.push(longV ? { u: cu, v: cv - off } : { u: cu - off, v: cv });
      candidates.push(longV ? { u: cu, v: cv + off } : { u: cu + off, v: cv });
    }
  }
  for (const band of stripBands(ctx)) candidates.push(...bandPoints(band, 1, 1));
  const lights: { p: LotPoint; h: number }[] = [];
  for (const p of candidates) {
    const nearest = Math.min(Infinity, ...facts.homeSides.map((s) => homeDistance(s, p, lot)));
    const short = nearest < LOT_LIGHT_HOME_REACH_M;
    const h = short ? LOT_LIGHT_NEAR_HOMES_M : LOT_LIGHT_HEIGHT_M;
    if (short && nearest < h) continue;
    const spacing = LOT_LIGHT_SPACING_HEIGHTS * h;
    if (
      lights.some(
        (l) =>
          Math.hypot(l.p.u - p.u, l.p.v - p.v) < Math.min(spacing, LOT_LIGHT_SPACING_HEIGHTS * l.h),
      )
    )
      continue;
    const rect = around(p.u, p.v, LOT_LIGHT_POLE_M, LOT_LIGHT_POLE_M);
    if (!clear(ctx, rect, !facts.kitIslandFurniture)) continue;
    lights.push({ p, h });
    put(ctx, { kind: 'light', rect, facing: 'v-', height: h, ...(short ? { short: true } : {}) });
  }
}

function planPlanting(ctx: Ctx): void {
  const bands = stripBands(ctx);
  // Trees along the street frontage and down a deep buffer, then shrubs between them.
  for (const band of bands) {
    if (band.side !== 'v-' && band.width < LOT_HOME_BUFFER_M - EPS) continue;
    for (const p of bandPoints(band, FRONTAGE_TREE_SPACING_M, FRONTAGE_TREE_SPACING_M / 2)) {
      const rect = around(p.u, p.v, TREE_FOOTPRINT_M, TREE_FOOTPRINT_M);
      if (clear(ctx, rect)) put(ctx, { kind: 'tree', rect, facing: 'v-', height: 4 });
    }
  }
  for (const band of bands) {
    for (const p of bandPoints(band, SHRUB_SPACING_M, SHRUB_SPACING_M / 2)) {
      const rect = around(p.u, p.v, SHRUB_FOOTPRINT_M, SHRUB_FOOTPRINT_M);
      if (clear(ctx, rect)) put(ctx, { kind: 'shrub', rect, facing: 'v-', height: 0.8 });
    }
  }
}

// ---------------------------------------------------------------------------
// Refuse
// ---------------------------------------------------------------------------

/** An enclosure beside or behind the building, its gate on an aisle, a berth's court or a trailer stall. */
function planRefuse(ctx: Ctx): void {
  const { layout, facts, lot } = ctx;
  if (facts.kitRefuse) {
    // The kit stands its own enclosure behind or beside the body, a gap and an enclosure off it: keep that ring clear.
    const reach = KIT_REFUSE_GAP_M + KIT_REFUSE_LENGTH_M + KIT_REFUSE_MARGIN_M;
    const b = layout.body;
    ctx.taken.push(
      { u0: b.u0 - reach, u1: b.u0, v0: b.v0, v1: b.v1 + reach },
      { u0: b.u1, u1: b.u1 + reach, v0: b.v0, v1: b.v1 + reach },
      { u0: b.u0, u1: b.u1, v0: b.v1, v1: b.v1 + reach },
    );
    return;
  }
  const { across, depth } = REFUSE_ENCLOSURE_M.inside;
  const t = REFUSE_ENCLOSURE_M.wall;
  const outerAcross = across + 2 * t;
  const outerDepth = depth + t;
  const courts = [...layout.aisles, ...layout.berths, ...layout.trailerStalls];
  let best: { rect: LotRect; facing: GroundsFacing; score: number } | null = null;
  const consider = (rect: LotRect, facing: GroundsFacing): void => {
    if (rect.v0 < layout.body.v0 - EPS) return;
    if (!clear(ctx, rect)) return;
    const apron = apronOf(rect, facing);
    if (!within(apron, lot) || layout.stalls.some((s) => overlaps(s.rect, apron))) return;
    const score = Math.hypot(rect.u0 - layout.entrance.u, rect.v0 - layout.entrance.v);
    if (!best || score > best.score) best = { rect, facing, score };
  };
  for (const c of courts) {
    for (let s = c.u0 - outerAcross; s <= c.u1 + EPS; s += 1) {
      // Gate toward the court from above (v+ side of the enclosure's court edge) and below.
      consider({ u0: s, u1: s + outerAcross, v0: c.v1, v1: c.v1 + outerDepth }, 'v-');
      consider({ u0: s, u1: s + outerAcross, v0: c.v0 - outerDepth, v1: c.v0 }, 'v+');
    }
    for (let s = c.v0 - outerAcross; s <= c.v1 + EPS; s += 1) {
      consider({ u0: c.u1, u1: c.u1 + outerDepth, v0: s, v1: s + outerAcross }, 'u-');
      consider({ u0: c.u0 - outerDepth, u1: c.u0, v0: s, v1: s + outerAcross }, 'u+');
    }
  }
  if (best) {
    const found: { rect: LotRect; facing: GroundsFacing } = best;
    put(ctx, {
      kind: 'refuse',
      rect: found.rect,
      facing: found.facing,
      height: REFUSE_ENCLOSURE_M.wallHeight,
    });
  }
}

/** The apron before an enclosure's gate, which a truck stands on. */
function apronOf(rect: LotRect, facing: GroundsFacing): LotRect {
  const a = REFUSE_ENCLOSURE_M.apron;
  if (facing === 'v-') return { ...rect, v0: rect.v0 - a, v1: rect.v0 };
  if (facing === 'v+') return { ...rect, v0: rect.v1, v1: rect.v1 + a };
  if (facing === 'u-') return { ...rect, u0: rect.u0 - a, u1: rect.u0 };
  return { ...rect, u0: rect.u1, u1: rect.u1 + a };
}

// ---------------------------------------------------------------------------
// The front wall: bed, bench, bin, bicycles
// ---------------------------------------------------------------------------

/** A strip `depth` deep against the body's street wall, from u0 to u1. */
const wallStrip = (ctx: Ctx, u0: number, u1: number, depth: number): LotRect => ({
  u0,
  u1,
  v0: ctx.layout.body.v0 - depth,
  v1: ctx.layout.body.v0,
});

/** Whether the front walk keeps a clear lane past a piece `depth` deep against the wall. */
function laneKept(ctx: Ctx, depth: number): boolean {
  const front = ctx.layout.frontWalk;
  return !front || front.v1 - front.v0 - depth >= MIN_FRONT_WALK_M - EPS;
}

/** The end wall a repair shop's office door is in, named by the way the wall faces: the end its entrance walk lands at. */
function officeWall(layout: LotLayout): 'u-' | 'u+' {
  return layout.entrance.u < (layout.body.u0 + layout.body.u1) / 2 ? 'u-' : 'u+';
}

/** The ground the office door's wall keeps clear: the door's width along the wall and the depth in front of it. */
function officeDoorClearance(layout: LotLayout): LotRect {
  const { body } = layout;
  const wall = officeWall(layout);
  const v = body.v0 + REPAIR_OFFICE_DOOR_IN_M;
  const [u0, u1] =
    wall === 'u-'
      ? [body.u0 - DOOR_CLEAR_DEPTH_M, body.u0]
      : [body.u1, body.u1 + DOOR_CLEAR_DEPTH_M];
  return { u0, u1, v0: v - DOOR_CLEAR_M / 2, v1: v + DOOR_CLEAR_M / 2 };
}

/** A repair shop's bin and bench stand against its end wall, past the office door. */
function planOfficeFurniture(ctx: Ctx): void {
  const { body } = ctx.layout;
  const wall = officeWall(ctx.layout);
  const door = officeDoorClearance(ctx.layout);
  const strip = (v0: number, v1: number, depth: number): LotRect =>
    wall === 'u-'
      ? { u0: body.u0 - depth, u1: body.u0, v0, v1 }
      : { u0: body.u1, u1: body.u1 + depth, v0, v1 };
  // The first clear ground along the wall past the door, from the door outward: a drive aisle in front of the door is walked round.
  const place = (from: number, along: number, depth: number): LotRect | null => {
    for (let v = from; v + along <= body.v1 + EPS; v += 0.2) {
      const rect = strip(v, v + along, depth);
      if (clear(ctx, rect)) return rect;
    }
    return null;
  };
  const bin = place(door.v1 + DOOR_FURNITURE_GAP_M, BIN_M.along, BIN_M.depth);
  if (bin) put(ctx, { kind: 'bin', rect: bin, facing: wall, height: BIN_M.height });
  const bench = place((bin?.v1 ?? door.v1) + DOOR_FURNITURE_GAP_M, BENCH_M.along, BENCH_M.depth);
  if (bench) put(ctx, { kind: 'bench', rect: bench, facing: wall, height: BENCH_M.height });
}

function planWallFurniture(ctx: Ctx): void {
  const { layout } = ctx;
  if (layout.bayDoors) {
    planOfficeFurniture(ctx);
    return;
  }
  const e = layout.entrance.u;
  const body = layout.body;
  const gap = DOOR_FURNITURE_GAP_M;
  const left1 = e - DOOR_CLEAR_M / 2 - gap;
  const right0 = e + DOOR_CLEAR_M / 2 + gap;
  const binRect = wallStrip(ctx, right0, right0 + BIN_M.along, BIN_M.depth);
  const benchRect = wallStrip(ctx, left1 - BENCH_M.along, left1, BENCH_M.depth);
  const bikeLength = BIKE_SPACES * BIKE_SPACE_M.length;
  const bikeRect = wallStrip(
    ctx,
    binRect.u1 + 2 * gap,
    binRect.u1 + 2 * gap + bikeLength,
    BIKE_SPACE_M.width,
  );
  const fits = (rect: LotRect, depth: number): boolean =>
    rect.u0 >= body.u0 - EPS &&
    rect.u1 <= body.u1 + EPS &&
    laneKept(ctx, depth) &&
    clear(ctx, rect, false, true);

  // The beds take the wall the furniture leaves, at the order of need after planting.
  const bedAt = (u0: number, u1: number): void => {
    if (u1 - u0 < ENTRANCE_BED_MIN_M) return;
    const rect = wallStrip(ctx, u0, u1, ENTRANCE_BED_DEPTH_M);
    if (laneKept(ctx, ENTRANCE_BED_DEPTH_M) && clear(ctx, rect, false, true)) {
      put(ctx, { kind: 'bed', rect, facing: 'v-', height: 0.3 });
    }
  };
  bedAt(body.u0, benchRect.u0 - gap);
  bedAt(bikeRect.u1 + gap, body.u1);

  if (fits(binRect, BIN_M.depth))
    put(ctx, { kind: 'bin', rect: binRect, facing: 'v-', height: BIN_M.height });
  if (fits(benchRect, BENCH_M.depth)) {
    put(ctx, { kind: 'bench', rect: benchRect, facing: 'v-', height: BENCH_M.height });
  }
  const free = ctx.taken.every((t) => !overlaps(t, bikeRect));
  if (
    free &&
    fits(bikeRect, BIKE_SPACE_M.width) &&
    laneKept(ctx, BIKE_SPACE_M.width + 0) &&
    walkRoom(ctx)
  ) {
    put(ctx, { kind: 'bikeRack', rect: bikeRect, facing: 'v-', height: 1 });
  }
}

/** A bicycle row needs 1.5 m to manoeuvre in front of it on the front walk, or on open ground. */
function walkRoom(ctx: Ctx): boolean {
  const front = ctx.layout.frontWalk;
  return !front || front.v1 - front.v0 - BIKE_SPACE_M.width >= BIKE_MANOEUVRE_M - EPS;
}

// ---------------------------------------------------------------------------
// The works' yard fence
// ---------------------------------------------------------------------------

interface Span {
  a: number;
  b: number;
}

/** Spans of [a0, a1] a line at `at` along `axis` crosses `rects` in, merged. */
function crossings(
  rects: readonly LotRect[],
  axis: 'u' | 'v',
  at: number,
  a0: number,
  a1: number,
): Span[] {
  const spans: Span[] = [];
  for (const r of rects) {
    const [lo, hi, ra, rb] = axis === 'v' ? [r.v0, r.v1, r.u0, r.u1] : [r.u0, r.u1, r.v0, r.v1];
    if (!(lo < at - EPS && at < hi - EPS)) continue;
    const a = Math.max(a0, ra);
    const b = Math.min(a1, rb);
    if (b - a > EPS) spans.push({ a, b });
  }
  spans.sort((x, y) => x.a - y.a);
  const merged: Span[] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s.a <= last.b + EPS) last.b = Math.max(last.b, s.b);
    else merged.push({ ...s });
  }
  return merged;
}

/** One fence line from a0 to a1: gated where vehicles cross it, cut where a stall or the body lies across it. */
function fenceLine(
  ctx: Ctx,
  axis: 'u' | 'v',
  at: number,
  a0: number,
  a1: number,
  outward: GroundsFacing,
): void {
  const { layout } = ctx;
  if (a1 - a0 <= EPS) return;
  const gates = crossings(drivenGround(layout), axis, at, a0, a1);
  const cut = crossings([...solidGround(layout), ...layout.islands], axis, at, a0, a1);
  const line = (a: number, b: number): LotRect =>
    axis === 'v' ? { u0: a, u1: b, v0: at, v1: at } : { u0: at, u1: at, v0: a, v1: b };
  // Gaps in the fence, in order: a gate where vehicles cross, a plain gap where a stall or the body does.
  const gaps = [
    ...gates.map((s) => ({ ...s, gate: true })),
    ...cut
      .filter((c) => !gates.some((g) => c.a < g.b - EPS && g.a < c.b - EPS))
      .map((s) => ({ ...s, gate: false })),
  ].sort((x, y) => x.a - y.a);
  let from = a0;
  for (const g of gaps) {
    if (g.a - from > EPS)
      put(
        ctx,
        { kind: 'fence', rect: line(from, g.a), facing: outward, height: YARD_FENCE_HEIGHT_M },
        false,
      );
    if (g.gate) {
      const mid = (g.a + g.b) / 2;
      const width = Math.min(g.b - g.a, YARD_GATE_M);
      put(
        ctx,
        {
          kind: 'gate',
          rect: line(mid - width / 2, mid + width / 2),
          facing: axis === 'v' ? 'v-' : 'u-',
          height: YARD_FENCE_HEIGHT_M,
        },
        false,
      );
      // The fence closes on each side of a gate narrower than the opening.
      if (width < g.b - g.a - EPS) {
        put(
          ctx,
          {
            kind: 'fence',
            rect: line(g.a, mid - width / 2),
            facing: outward,
            height: YARD_FENCE_HEIGHT_M,
          },
          false,
        );
        put(
          ctx,
          {
            kind: 'fence',
            rect: line(mid + width / 2, g.b),
            facing: outward,
            height: YARD_FENCE_HEIGHT_M,
          },
          false,
        );
      }
    }
    from = Math.max(from, g.b);
  }
  if (a1 - from > EPS)
    put(
      ctx,
      { kind: 'fence', rect: line(from, a1), facing: outward, height: YARD_FENCE_HEIGHT_M },
      false,
    );
}

/** The yard behind the building's front: its side lines, its rear line and the line across the front beside the body. */
function planFence(ctx: Ctx): void {
  const { layout, lot, facts } = ctx;
  if (!isFencedWorks(facts)) return;
  const front = layout.body.v0;
  fenceLine(ctx, 'u', lot.u0, front, lot.v1, 'u-');
  fenceLine(ctx, 'u', lot.u1, front, lot.v1, 'u+');
  fenceLine(ctx, 'v', lot.v1, lot.u0, lot.u1, 'v+');
  fenceLine(ctx, 'v', front, lot.u0, layout.body.u0, 'v-');
  fenceLine(ctx, 'v', front, layout.body.u1, lot.u1, 'v-');
}

/**
 * Plans a lot's grounds on the ground its layout leaves free: the walk, the
 * sign, lights, the refuse enclosure, perimeter planting, the entrance bed,
 * bench and bin, then bicycles. A lot short of room loses the later pieces
 * first; the body and every stall stay where the layout put them.
 */
export function planLotGrounds(layout: LotLayout, facts: LotGroundsFacts): LotGroundsPlan {
  const ctx: Ctx = {
    layout,
    facts,
    lot: layout.lot,
    hard: hardGround(layout),
    taken: layout.trees.map((t) => around(t.u, t.v, TREE_FOOTPRINT_M, TREE_FOOTPRINT_M)),
    pieces: [],
  };
  planWalk(ctx);
  if (facts.kitWallLockers) {
    const { body } = layout;
    const { along, depth } = WALL_LOCKER_ZONE_M;
    ctx.taken.push(
      wallStrip(ctx, body.u0, body.u0 + along, depth),
      wallStrip(ctx, body.u1 - along, body.u1, depth),
    );
  }
  planSign(ctx);
  planLights(ctx);
  planRefuse(ctx);
  planPlanting(ctx);
  planWallFurniture(ctx);
  planFence(ctx);
  return { pieces: ctx.pieces };
}

/** The walk's end at the street line: its rect there, and whether the layout already paves it. Null where the walk starts short of the street. */
export function streetWalk(layout: LotLayout): { rect: LotRect; laid: boolean } | null {
  const first = walkPieces(layout).find((p) => p.rect.v0 <= EPS);
  return first ? { rect: first.rect, laid: first.laid === true } : null;
}
