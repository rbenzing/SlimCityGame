/**
 * A farm's plan: where on its lot the farmstead stands, where the drive runs
 * out to the dirt road, and what the rest of the land is. Every farm renderer
 * reads the same plan — the lot's ground, the barn the instancer draws as the
 * farm's body, and the kit of roofs, silos, trees, fences and cattle — so the
 * barn roof sits on the barn walls and the silo stands in the yard it was
 * given.
 *
 * The lot is laid out from the side a dirt road is on, since a farm's gate
 * opens only onto one: the farmstead takes a strip along that edge — the
 * house by the gate, the barn beside it, silos and bins behind — and the land
 * beyond is the field, the orchard or the paddock.
 *
 * Coordinates: a local frame of u metres along the gate edge and v metres
 * into the lot from it, turned into world metres by the edge's frame. Every
 * size is absolute metres, from the figures in the farms design document.
 *
 * Pure: no three.js, no scene.
 */
import { TILE_METERS } from '../shared/constants';
import type { BuildingCatalogEntry, BuildingInstance, FarmKind } from '../shared/types';
import { farmKindOf } from '../shared/buildingkind';
import { edgeFrameFor, frameToWorld, type EdgeFrame, type Side } from './frontage';

/** An axis-aligned world rectangle, low corner first. */
export interface FarmRect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** A building on the farm: its world rectangle, and which way its ridge runs. */
export interface FarmBox extends FarmRect {
  ridgeAlongX: boolean;
}

/** A round thing standing on the farm — a silo or a bin — by its centre. */
export interface FarmRound {
  x: number;
  z: number;
}

/**
 * A window in the farmhouse wall: where the middle of its sill meets the wall,
 * world metres, and the way the wall faces, as a unit vector out of the house.
 */
export interface FarmWindow {
  x: number;
  z: number;
  /** Height of the sill above the house's ground. */
  sill: number;
  nx: number;
  nz: number;
}

/** An open-sided shed: its walls' box, and which way the open side faces, as a unit vector out of it. */
export interface FarmShed extends FarmBox {
  open: FarmRound;
}

export interface FarmPlan {
  kind: FarmKind;
  level: number;
  /** A crop farm stands either in a growing crop or in ripe grain, by its id. */
  ripe: boolean;
  /** The lot edge the gate is on. */
  side: Side;
  lot: FarmRect;
  /** The farmstead strip: grass around the buildings. */
  yard: FarmRect;
  /** Packed earth where the machinery stands: round the barn, silos and bins. */
  apron: FarmRect;
  /** From the gate at the lot line in to the yard. */
  drive: FarmRect;
  /** The field, the orchard or the paddock. */
  field: FarmRect;
  /** Whether the crop rows, orchard rows and the field's long side run along world X. */
  rowsAlongX: boolean;
  /** The unit vector from the farmstead out to the gate: the way the farmhouse and the barn face. */
  front: FarmRound;
  /** The unit vector along the gate edge, in the direction the farmstead's u grows. */
  along: FarmRound;
  house: FarmBox;
  barn: FarmBox;
  silos: FarmRound[];
  bins: FarmRound[];
  /** A crop farm's equipment shed in the gravel yard, where the yard has room for it. */
  shed: FarmShed | null;
  /** The farmhouse's windows, in the order their lights are keyed by. */
  houseWindows: FarmWindow[];
  /**
   * The farm truck's round of the yard, as a closed line of world points that
   * starts and ends at its parking spot on the drive by the house. Null where
   * the lot leaves it no room.
   */
  truckRoute: FarmRound[] | null;
  /** The index in `truckRoute` of the point by the silos where it stops. */
  truckStop: number;
}

/** How deep the farmstead strip runs back from the gate edge. */
export const YARD_DEPTH_M = 30;
/** A barn is 11 m across, the width of a dairy barn; a large farm's is a metre wider. */
export const BARN_WIDTH_M = 11;
/**
 * The gambrel's rise is this multiple of the wall under it: the historic dairy
 * barn is 29 ft to the ridge, 10 ft of wall under 19 ft of loft.
 */
export const GAMBREL_RISE_RATIO = 1.9;
/** The walls stand to this share of the ridge; the gambrel roof takes the rest. */
export const BARN_EAVE_SHARE = 1 / (1 + GAMBREL_RISE_RATIO);
/** A barn roof and a house roof overhang their walls a little. */
export const ROOF_OVERHANG_M = 0.4;
/** A farmhouse, an American foursquare: two storeys on a near-square 9 × 8 m plan under a hipped roof. */
export const HOUSE_W_M = 9;
export const HOUSE_D_M = 8;
export const HOUSE_EAVE_M = 5.4;
/** Where the farmhouse stands: in from the lot's corner along the gate, and back from it. */
const HOUSE_U = 3;
const HOUSE_V = 4;
/** The hipped roof is 6:12, rising half a metre for every metre in from the eave. */
export const HOUSE_ROOF_PITCH = 0.5;
export const HOUSE_ROOF_RISE_M = HOUSE_ROOF_PITCH * (HOUSE_D_M / 2 + ROOF_OVERHANG_M);
export const HOUSE_RIDGE_M = HOUSE_EAVE_M + HOUSE_ROOF_RISE_M;
/** The full-width porch: 2.4 m deep, its floor 0.45 m up on two risers, posts 0.2 m square 2.4 m tall. */
export const PORCH_DEPTH_M = 2.4;
export const PORCH_FLOOR_M = 0.45;
export const PORCH_POST_M = 0.2;
export const PORCH_POST_HEIGHT_M = 2.4;
/** A one-bay dormer on the front slope. */
export const DORMER_WIDTH_M = 2;
export const DORMER_DEPTH_M = 1.6;
export const DORMER_HEIGHT_M = 1.6;
/** How far in from the wall's face the dormer's front stands, along the plan. */
export const DORMER_INSET_M = 1;
/** A stave silo, 6 m across and 16 m to the eave of its dome. */
export const SILO_DIAMETER_M = 6;
export const SILO_HEIGHT_M = 16;
/** A grain bin, 5.5 m across with its eave at 4 m under a shallow cone. */
export const BIN_DIAMETER_M = 5.5;
export const BIN_EAVE_M = 4;
/** A farm drive is one vehicle wide. */
const DRIVE_WIDTH_M = 4;
/** A 36 × 60 inch double-hung window, the commonest size. */
export const WINDOW_W_M = 0.91;
export const WINDOW_H_M = 1.52;
/** Ground-floor sills, under the 44-inch limit for a bedroom window. */
export const WINDOW_SILL_M = 0.9;
/** The upper storey's floor, a 2.4 m ceiling and its joists above the ground floor. */
const UPPER_FLOOR_M = 2.7;
/**
 * The farm truck, a full-size regular-cab pickup: 5.31 m long, 2.03 m wide and
 * 1.91 m tall, the Ford F-150 with its standard bed.
 */
export const TRUCK_SIZE_M: readonly [number, number, number] = [2.03, 1.91, 5.31];
/** How far the middle of the truck's lane keeps from the side of anything in the yard. */
const TRUCK_CLEARANCE_M = 2.5;
/** The truck's lane along the front of the barn, in from the gate edge. */
const TRUCK_FRONT_V_M = 3;
/** Where it parks on the drive, beside the farmhouse. */
const TRUCK_PARK_V_M = 9;
/** An equipment shed: a three-sided pole barn 12 × 6 m, 3.7 m (12 ft) to the eave, a post every 3.7 m along its open side. */
export const SHED_LENGTH_M = 12;
export const SHED_DEPTH_M = 6;
export const SHED_EAVE_M = 3.7;
export const SHED_POST_SPACING_M = 3.7;
/** What a shed keeps clear between itself and the buildings, silos, bins and truck lane. */
const SHED_CLEARANCE_M = 1.5;
/** The corners of its round are turned on this radius. */
const TRUCK_TURN_RADIUS_M = 4;
const TRUCK_TURN_SEGMENTS = 6;

/** Barn length along the gate edge by kind and level: the dairy barn runs longest. */
const BARN_LENGTH_M: Readonly<Record<FarmKind, readonly [number, number, number]>> = {
  crops: [18, 24, 30],
  orchard: [14, 18, 24],
  pasture: [18, 30, 36],
};
/** Silos by kind and level: an orchard keeps its fruit in a packing barn, not a silo. */
const SILOS: Readonly<Record<FarmKind, readonly [number, number, number]>> = {
  crops: [1, 1, 2],
  orchard: [0, 0, 0],
  pasture: [1, 1, 2],
};
/** Grain bins join a crop farm's silo as it grows. */
const BINS: Readonly<Record<FarmKind, readonly [number, number, number]>> = {
  crops: [0, 1, 2],
  orchard: [0, 0, 0],
  pasture: [0, 0, 0],
};

/** Crop rows 30 inches apart, the spacing most corn is planted at. */
export const CROP_ROW_M = 0.762;
/** Rows are drawn in fours — three of crop, one of bare furrow — so they hold still at a distance. */
export const CROP_BAND_ROWS = 4;
/** Semi-dwarf apple trees: 16 ft apart in the row, rows 20 ft apart. */
export const ORCHARD_IN_ROW_M = 4.9;
export const ORCHARD_ROW_M = 6.1;
/** Trees stand back from the orchard's edge by half a row. */
const ORCHARD_MARGIN_M = ORCHARD_ROW_M / 2;
/** One head of cattle drawn per this many paddock tiles. */
export const PADDOCK_TILES_PER_COW = 4;

const byLevel = (table: readonly [number, number, number], level: number): number =>
  table[Math.min(3, Math.max(1, level)) - 1]!;

function hash1(n: number): number {
  let h = n >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/** Tiles in the strip one step beyond `side` at `distance` tiles out. */
function stripTiles(
  side: Side,
  x: number,
  z: number,
  w: number,
  d: number,
  distance: number,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  if (side === 'N' || side === 'S') {
    const tz = side === 'N' ? z - distance : z + d - 1 + distance;
    for (let i = 0; i < w; i++) out.push([x + i, tz]);
  } else {
    const tx = side === 'W' ? x - distance : x + w - 1 + distance;
    for (let i = 0; i < d; i++) out.push([tx, z + i]);
  }
  return out;
}

/**
 * The side of the lot its dirt road is on: the nearest strip beyond an edge
 * that holds one, out to `reach` tiles, ties broken N, E, S, W. A lot with no
 * dirt road in reach — it has lost it since it grew — keeps its gate north.
 */
export function farmGateSide(
  x: number,
  z: number,
  w: number,
  d: number,
  dirtAt: (tileX: number, tileZ: number) => boolean,
  reach = 3,
): Side {
  for (let distance = 1; distance <= reach; distance++) {
    for (const side of ['N', 'E', 'S', 'W'] as const) {
      if (stripTiles(side, x, z, w, d, distance).some(([tx, tz]) => dirtAt(tx, tz))) return side;
    }
  }
  return 'N';
}

/** A local rectangle, u along the gate edge and v into the lot, in world metres. */
function localRect(frame: EdgeFrame, u0: number, v0: number, u1: number, v1: number): FarmRect {
  const a = frameToWorld(frame, u0, -v0 / TILE_METERS);
  const b = frameToWorld(frame, u1, -v1 / TILE_METERS);
  return {
    x0: Math.min(a.x, b.x),
    z0: Math.min(a.z, b.z),
    x1: Math.max(a.x, b.x),
    z1: Math.max(a.z, b.z),
  };
}

function localPoint(frame: EdgeFrame, u: number, v: number): FarmRound {
  const p = frameToWorld(frame, u, -v / TILE_METERS);
  return { x: p.x, z: p.z };
}

/** A step (du, dv) in the lot's frame as a unit vector in world metres. */
function localDirection(frame: EdgeFrame, du: number, dv: number): FarmRound {
  const a = localPoint(frame, 0, 0);
  const b = localPoint(frame, du, dv);
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  return { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
}

/**
 * The farmhouse's windows on its walls from u0 to u1 along the gate and v0 to
 * v1 into the lot: two upstairs in the front wall facing the road, above the
 * porch, and two downstairs in the back, each a quarter of the way in from a
 * corner, and in the middle of each end wall one at ground level and one
 * upstairs.
 */
function farmhouseWindows(
  frame: EdgeFrame,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
): FarmWindow[] {
  const windows: FarmWindow[] = [];
  const at = (u: number, v: number, du: number, dv: number, sill: number): void => {
    const p = localPoint(frame, u, v);
    const n = localDirection(frame, du, dv);
    windows.push({ x: p.x, z: p.z, sill, nx: n.x, nz: n.z });
  };
  const bay = (u1 - u0) / 4;
  for (const u of [u0 + bay, u1 - bay]) at(u, v0, 0, -1, UPPER_FLOOR_M + WINDOW_SILL_M);
  for (const u of [u0 + bay, u1 - bay]) at(u, v1, 0, 1, WINDOW_SILL_M);
  const middle = (v0 + v1) / 2;
  for (const [u, du] of [
    [u0, -1],
    [u1, 1],
  ] as const) {
    at(u, middle, du, 0, WINDOW_SILL_M);
    at(u, middle, du, 0, UPPER_FLOOR_M + WINDOW_SILL_M);
  }
  return windows;
}

/**
 * The truck's round as a closed line in the lot's frame: from its parking spot
 * at (uLane, TRUCK_PARK_V_M) out along the drive to vBack behind the barn,
 * along to uFar past the silos, back to the barn's front and along it to the
 * drive, every corner turned on TRUCK_TURN_RADIUS_M. Returns the points and
 * the index of the stop, halfway along the side past the silos.
 */
function truckRound(
  uLane: number,
  uFar: number,
  vBack: number,
): { points: Array<[number, number]>; stop: number } {
  const corners: Array<[number, number]> = [
    [uLane, vBack],
    [uFar, vBack],
    [uFar, TRUCK_FRONT_V_M],
    [uLane, TRUCK_FRONT_V_M],
  ];
  const points: Array<[number, number]> = [[uLane, TRUCK_PARK_V_M]];
  let stop = 0;
  corners.forEach((corner, i) => {
    const prev = corners[(i + corners.length - 1) % corners.length]!;
    const next = corners[(i + 1) % corners.length]!;
    const unit = (a: [number, number], b: [number, number]): [number, number] => {
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    };
    const din = unit(prev, corner);
    const dout = unit(corner, next);
    const r = TRUCK_TURN_RADIUS_M;
    const start: [number, number] = [corner[0] - din[0] * r, corner[1] - din[1] * r];
    const end: [number, number] = [corner[0] + dout[0] * r, corner[1] + dout[1] * r];
    const centre: [number, number] = [start[0] + dout[0] * r, start[1] + dout[1] * r];
    for (let k = 0; k <= TRUCK_TURN_SEGMENTS; k++) {
      const phi = ((k / TRUCK_TURN_SEGMENTS) * Math.PI) / 2;
      points.push([
        centre[0] + (start[0] - centre[0]) * Math.cos(phi) + (end[0] - centre[0]) * Math.sin(phi),
        centre[1] + (start[1] - centre[1]) * Math.cos(phi) + (end[1] - centre[1]) * Math.sin(phi),
      ]);
    }
    // The side past the silos is the one after the second corner.
    if (i === 1) {
      stop = points.length;
      points.push([uFar, (vBack + TRUCK_FRONT_V_M) / 2]);
    }
  });
  points.push([uLane, TRUCK_PARK_V_M]);
  return { points, stop };
}

interface UVRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/** The gap between two rectangles in the lot's frame, 0 where they touch or overlap. */
const rectGap = (a: UVRect, b: UVRect): number =>
  Math.hypot(Math.max(a.u0 - b.u1, 0, b.u0 - a.u1), Math.max(a.v0 - b.v1, 0, b.v0 - a.v1));

/**
 * Where an equipment shed stands in the gravel yard: the spot nearest the
 * middle of the barn's back wall that holds it inside the apron, clear of the
 * barn, the house, every silo and bin, and the truck's lane. Null where the
 * yard has no such ground.
 */
function shedSpot(
  apron: UVRect,
  barn: UVRect,
  house: UVRect,
  rounds: ReadonlyArray<{ u: number; v: number; r: number }>,
  route: ReadonlyArray<readonly [number, number]> | null,
): UVRect | null {
  const lane: UVRect[] = [];
  for (let i = 1; route && i < route.length; i++) {
    const [au, av] = route[i - 1]!;
    const [bu, bv] = route[i]!;
    const steps = Math.max(1, Math.ceil(Math.hypot(bu - au, bv - av) / 0.5));
    for (let s = 0; s <= steps; s++) {
      const u = au + ((bu - au) * s) / steps;
      const v = av + ((bv - av) * s) / steps;
      lane.push({ u0: u, v0: v, u1: u, v1: v });
    }
  }
  const target = { u: (barn.u0 + barn.u1) / 2, v: barn.v1 };
  let best: { rect: UVRect; cost: number } | null = null;
  for (let u0 = apron.u0; u0 + SHED_LENGTH_M <= apron.u1 + 1e-9; u0 += 0.5) {
    for (let v0 = barn.v1; v0 + SHED_DEPTH_M <= apron.v1 + 1e-9; v0 += 0.5) {
      const rect = { u0, v0, u1: u0 + SHED_LENGTH_M, v1: v0 + SHED_DEPTH_M };
      const cost = Math.hypot(
        (rect.u0 + rect.u1) / 2 - target.u,
        (rect.v0 + rect.v1) / 2 - target.v,
      );
      if (best && cost >= best.cost) continue;
      if (rectGap(rect, barn) < SHED_CLEARANCE_M || rectGap(rect, house) < SHED_CLEARANCE_M)
        continue;
      const near = (p: UVRect, clear: number): boolean => rectGap(rect, p) < clear;
      if (rounds.some((c) => near({ u0: c.u, v0: c.v, u1: c.u, v1: c.v }, c.r + SHED_CLEARANCE_M)))
        continue;
      if (lane.some((p) => near(p, TRUCK_SIZE_M[0] / 2 + SHED_CLEARANCE_M))) continue;
      best = { rect, cost };
    }
  }
  return best?.rect ?? null;
}

/** The plan of a farm, or null when the entry is not a farm. */
export function planFarm(
  building: BuildingInstance,
  entry: BuildingCatalogEntry,
  dirtAt: (tileX: number, tileZ: number) => boolean,
): FarmPlan | null {
  const kind = farmKindOf(entry);
  if (!kind) return null;
  const level = entry.level ?? 1;
  const { w, d } = entry.footprint;
  const side = farmGateSide(building.x, building.z, w, d, dirtAt);
  const frame = edgeFrameFor(side, building.x, building.z, w, d);
  const along = (side === 'N' || side === 'S' ? w : d) * TILE_METERS;
  const deep = (side === 'N' || side === 'S' ? d : w) * TILE_METERS;
  // Along the edge runs world X on a north or south gate, world Z on an east or west one.
  const alongX = frame.alongX;

  const house = localRect(frame, HOUSE_U, HOUSE_V, HOUSE_U + HOUSE_W_M, HOUSE_V + HOUSE_D_M);
  const driveU = HOUSE_U + HOUSE_W_M + 3;
  const barnLength = byLevel(BARN_LENGTH_M[kind], level);
  const barnWidth = BARN_WIDTH_M + (level >= 3 ? 1 : 0);
  const barnU0 = driveU + DRIVE_WIDTH_M + 3;
  const barnV0 = 5;
  const barn = localRect(frame, barnU0, barnV0, barnU0 + barnLength, barnV0 + barnWidth);

  const silos: FarmRound[] = [];
  const siloV = barnV0 + barnWidth / 2;
  for (let i = 0; i < byLevel(SILOS[kind], level); i++) {
    silos.push(localPoint(frame, barnU0 + barnLength + 5 + i * (SILO_DIAMETER_M + 2), siloV));
  }
  const bins: FarmRound[] = [];
  const binV = barnV0 + barnWidth + 2 + BIN_DIAMETER_M / 2;
  for (let i = 0; i < byLevel(BINS[kind], level); i++) {
    bins.push(localPoint(frame, barnU0 + 3 + i * (BIN_DIAMETER_M + 1.5), binV));
  }
  const workEnd = Math.min(
    along - 2,
    barnU0 + barnLength + (silos.length > 0 ? 8 + silos.length * (SILO_DIAMETER_M + 2) : 4),
  );

  // The truck's round keeps its clearance from the barn, the bins behind it and
  // the silos past its end, and stays inside the lot and short of the field.
  const binCount = byLevel(BINS[kind], level);
  const siloCount = byLevel(SILOS[kind], level);
  const vBack = (binCount > 0 ? binV + BIN_DIAMETER_M / 2 : barnV0 + barnWidth) + TRUCK_CLEARANCE_M;
  const uFar =
    Math.max(
      barnU0 + barnLength,
      siloCount > 0
        ? barnU0 + barnLength + 5 + (siloCount - 1) * (SILO_DIAMETER_M + 2) + SILO_DIAMETER_M / 2
        : 0,
      binCount > 0 ? barnU0 + 3 + (binCount - 1) * (BIN_DIAMETER_M + 1.5) + BIN_DIAMETER_M / 2 : 0,
    ) + TRUCK_CLEARANCE_M;
  const truckFits = uFar + TRUCK_SIZE_M[0] <= along && vBack + TRUCK_SIZE_M[0] <= YARD_DEPTH_M;
  const round = truckFits ? truckRound(driveU + DRIVE_WIDTH_M / 2, uFar, vBack) : null;

  // A crop farm keeps its machinery under a shed in the gravel yard, where the yard has the room.
  let shed: FarmShed | null = null;
  if (kind === 'crops') {
    const rounds = [
      ...Array.from({ length: siloCount }, (_, i) => ({
        u: barnU0 + barnLength + 5 + i * (SILO_DIAMETER_M + 2),
        v: siloV,
        r: SILO_DIAMETER_M / 2,
      })),
      ...Array.from({ length: binCount }, (_, i) => ({
        u: barnU0 + 3 + i * (BIN_DIAMETER_M + 1.5),
        v: binV,
        r: BIN_DIAMETER_M / 2,
      })),
    ];
    const spot = shedSpot(
      { u0: barnU0 - 3, v0: barnV0 - 3, u1: workEnd, v1: YARD_DEPTH_M - 2 },
      { u0: barnU0, v0: barnV0, u1: barnU0 + barnLength, v1: barnV0 + barnWidth },
      { u0: HOUSE_U, v0: HOUSE_V, u1: HOUSE_U + HOUSE_W_M, v1: HOUSE_V + HOUSE_D_M },
      rounds,
      round?.points ?? null,
    );
    if (spot) {
      shed = {
        ...localRect(frame, spot.u0, spot.v0, spot.u1, spot.v1),
        ridgeAlongX: alongX,
        open: localDirection(frame, 0, -1),
      };
    }
  }

  return {
    kind,
    level,
    ripe: hash1(building.id * 31 + 7) < 0.5,
    side,
    lot: localRect(frame, 0, 0, along, deep),
    yard: localRect(frame, 0, 0, along, YARD_DEPTH_M),
    apron: localRect(frame, barnU0 - 3, barnV0 - 3, workEnd, YARD_DEPTH_M - 2),
    drive: localRect(frame, driveU, 0, driveU + DRIVE_WIDTH_M, barnV0 + barnWidth),
    field: localRect(frame, 0, YARD_DEPTH_M, along, deep),
    // Rows run away from the road, into the field: across the gate edge.
    rowsAlongX: !alongX,
    front: localDirection(frame, 0, -1),
    along: localDirection(frame, 1, 0),
    house: { ...house, ridgeAlongX: alongX },
    barn: { ...barn, ridgeAlongX: alongX },
    silos,
    bins,
    shed,
    houseWindows: farmhouseWindows(
      frame,
      HOUSE_U,
      HOUSE_V,
      HOUSE_U + HOUSE_W_M,
      HOUSE_V + HOUSE_D_M,
    ),
    truckRoute: round ? round.points.map(([u, v]) => localPoint(frame, u, v)) : null,
    truckStop: round?.stop ?? 0,
  };
}

/** One band of a crop field: three rows of crop, or the bare furrow between bands. */
export interface CropBand {
  rect: FarmRect;
  furrow: boolean;
}

/**
 * A crop field cut into its bands, running the way its rows do and tiling
 * the field exactly: three rows of crop, one of furrow, repeated to the far
 * edge, where the last band is cut short.
 */
export function cropBands(plan: FarmPlan): CropBand[] {
  const { field } = plan;
  const bands: CropBand[] = [];
  // Rows along X are stacked across Z, and the other way about.
  const start = plan.rowsAlongX ? field.z0 : field.x0;
  const end = plan.rowsAlongX ? field.z1 : field.x1;
  const cropWidth = (CROP_BAND_ROWS - 1) * CROP_ROW_M;
  const rect = (a: number, b: number): FarmRect =>
    plan.rowsAlongX
      ? { x0: field.x0, z0: a, x1: field.x1, z1: b }
      : { x0: a, z0: field.z0, x1: b, z1: field.z1 };
  for (let at = start; at < end - 1e-9; at += CROP_BAND_ROWS * CROP_ROW_M) {
    const cropEnd = Math.min(end, at + cropWidth);
    bands.push({ rect: rect(at, cropEnd), furrow: false });
    const furrowEnd = Math.min(end, cropEnd + CROP_ROW_M);
    if (furrowEnd > cropEnd + 1e-9) bands.push({ rect: rect(cropEnd, furrowEnd), furrow: true });
  }
  return bands;
}

/** Where an orchard's trees stand: in rows the way the field's rows run, at orchard spacing. */
export function orchardTrees(plan: FarmPlan): FarmRound[] {
  const { field } = plan;
  const trees: FarmRound[] = [];
  const rowStart = plan.rowsAlongX ? field.z0 : field.x0;
  const rowEnd = plan.rowsAlongX ? field.z1 : field.x1;
  const alongStart = plan.rowsAlongX ? field.x0 : field.z0;
  const alongEnd = plan.rowsAlongX ? field.x1 : field.z1;
  for (
    let across = rowStart + ORCHARD_MARGIN_M;
    across <= rowEnd - ORCHARD_MARGIN_M;
    across += ORCHARD_ROW_M
  ) {
    for (
      let along = alongStart + ORCHARD_MARGIN_M;
      along <= alongEnd - ORCHARD_MARGIN_M;
      along += ORCHARD_IN_ROW_M
    ) {
      trees.push(plan.rowsAlongX ? { x: along, z: across } : { x: across, z: along });
    }
  }
  return trees;
}

/** How many head of cattle a paddock carries, never none. */
export function paddockHerd(plan: FarmPlan): number {
  const { field } = plan;
  const tiles = ((field.x1 - field.x0) * (field.z1 - field.z0)) / (TILE_METERS * TILE_METERS);
  return Math.max(1, Math.floor(tiles / PADDOCK_TILES_PER_COW));
}
