/**
 * The plat: how a zoned block is cut into lots from the street it fronts.
 *
 * A lot forms from its street. Every tile beside a street fronts it, and the
 * tiles in a row along the street that front the same side, in one zone, are
 * a run. A run is cut from one end into parcels, one frontage at a time, each
 * the largest lot the land value at its first tile warrants that still fits
 * the free, zoned ground in from the street; a building already standing is
 * a parcel of its own and is stepped over. So the cut follows the street
 * around a bend or a cul-de-sac, where each stretch of kerb fronts its own
 * side, and is derived from the zone, the roads, the buildings and the land
 * value alone: nothing is stored.
 *
 * Medium density is cut as normal lots whatever the land value, and a kind
 * larger than one parcel takes whole parcels side by side along the street,
 * never half of one.
 *
 * Pure: no sim, no three.js. The caller says what a street is, so grid roads
 * and roads off the grid front lots alike.
 */
import { inBounds, TILE_METERS, tileIndex } from '../shared/constants';
import { claimedTiles, frameCorners, toWorld, type WorldPoint } from '../shared/lotframe';
import { LOT_EXTENT, LOT_SIZES, lotsOfZone, warrantedLot } from '../shared/lots';
import {
  footprintTiles,
  kerbLine,
  type KerbSample,
  type SegmentGeom,
} from '../shared/roadgeom';
import {
  isStreetTier,
  ZoneType,
  type FramedParcel,
  type LotSize,
  type ParcelFrame,
  type RoadNet,
} from '../shared/types';
import { segmentHalfWidthM, type ProfileLookup } from './freeroads';
import {
  freeCellsOn,
  isFreeSegment,
  liveSegments,
  segmentGeom,
  segmentsAt,
  type RoadCells,
} from './roadnet';

/** The grid layers the plat reads: the sim's grid and the render mirror both have them. */
export interface PlatGrid {
  size: number;
  zone: Uint8Array;
  buildingId: Uint32Array;
  roadTier: Uint8Array;
  roadElevation: Float32Array;
  water: Uint8Array;
  roads?: RoadNet;
}

/**
 * A plat source over a grid: a street is a street tier on the tile or a
 * road off the grid with a cell there, and never a deck overhead. The one
 * reading the spawner and the lens share, so what the lens draws is what
 * grows.
 */
export function platSourceOf(
  g: PlatGrid,
  cells: RoadCells | null,
  landValue: Uint8Array | undefined,
  profileOf: ProfileLookup = () => null,
): PlatSource {
  const gridStreetAt = (x: number, z: number): boolean => {
    if (!inBounds(x, z)) return false;
    const idx = tileIndex(x, z);
    return (g.roadElevation[idx] ?? 0) <= 0 && isStreetTier(g.roadTier[idx] ?? 0);
  };
  const net = g.roads;
  return {
    size: g.size,
    zone: g.zone,
    buildingId: g.buildingId,
    landValue,
    streetAt: (x, z) => {
      if (gridStreetAt(x, z)) return true;
      if (!inBounds(x, z) || (g.roadElevation[tileIndex(x, z)] ?? 0) > 0) return false;
      const idx = tileIndex(x, z);
      return cells !== null && freeCellsOn(cells, idx).some((c) => isStreetTier(cells.tier[c]!));
    },
    gridStreetAt,
    kerbs: net
      ? {
          net,
          halfWidthM: (seg) => segmentHalfWidthM(net, seg, profileOf),
          blocked: (x, z) => {
            const idx = tileIndex(x, z);
            return (g.roadTier[idx] ?? 0) !== 0 || (g.water[idx] ?? 0) !== 0;
          },
        }
      : undefined,
  };
}

/** The side of a lot that meets its street. */
export type Front = 'N' | 'E' | 'S' | 'W';

/** What the plat reads of the world. */
export interface PlatSource {
  size: number;
  zone: Uint8Array;
  buildingId: Uint32Array;
  /** The land-value field; a source without it reads as worthless land. */
  landValue?: Uint8Array;
  /** Whether the tile is a street a lot can front: not a railway, not a deck overhead. */
  streetAt(x: number, z: number): boolean;
  /** `streetAt` counting only the roads on the grid, for a zone whose lots along a curve are framed. */
  gridStreetAt?(x: number, z: number): boolean;
  /** The roads off the grid and the ground beside them, for the plat along their kerbs. */
  kerbs?: KerbSource;
}

/** What the plat along a kerb reads beyond the grid: the network and the ground a parcel may never claim. */
export interface KerbSource {
  net: RoadNet;
  /** Half of a segment's whole cross-section, metres. */
  halfWidthM(seg: number): number;
  /** Whether the tile carries a grid road or water. */
  blocked(x: number, z: number): boolean;
}

/** A lot of the plat, in world tiles: its min corner and its footprint. */
export interface Parcel {
  x: number;
  z: number;
  w: number;
  d: number;
  lot: LotSize;
  front: Front;
}

interface FrontGeometry {
  front: Front;
  /** From a row tile to the street tile it fronts. */
  street: readonly [number, number];
  /** In from the street, across the lot's depth. */
  depth: readonly [number, number];
  /** Along the street, across the lot's frontage. */
  along: readonly [number, number];
}

/** The four fronts, in the order a tie between streets is broken: north, east, south, west. */
const FRONTS: readonly FrontGeometry[] = [
  { front: 'N', street: [0, -1], depth: [0, 1], along: [1, 0] },
  { front: 'E', street: [1, 0], depth: [-1, 0], along: [0, 1] },
  { front: 'S', street: [0, 1], depth: [0, -1], along: [1, 0] },
  { front: 'W', street: [-1, 0], depth: [1, 0], along: [0, 1] },
];

/** The deepest lot the plat cuts, so the farthest a tile stands from its row. */
const MAX_DEPTH = Math.max(...LOT_SIZES.map((s) => LOT_EXTENT[s].depth));

/** The longest stretch of street counted when two streets both border a tile. */
const STREET_RUN_CAP = 16;

function streetRun(
  src: PlatSource,
  x: number,
  z: number,
  along: readonly [number, number],
): number {
  let n = 1;
  for (const sign of [1, -1]) {
    for (let i = 1; i < STREET_RUN_CAP; i++) {
      if (!src.streetAt(x + sign * i * along[0], z + sign * i * along[1])) break;
      n++;
    }
  }
  return n;
}

/**
 * The side a tile beside a street fronts, or null for a tile no street
 * touches. Where two streets border it, the one running longest through the
 * neighbouring tile, so a bend fronts its longer arm; a tie goes north, east,
 * south, west.
 */
function frontOf(src: PlatSource, x: number, z: number): FrontGeometry | null {
  if (!inBounds(x, z) || src.streetAt(x, z)) return null;
  let best: FrontGeometry | null = null;
  let bestRun = 0;
  for (const f of FRONTS) {
    const sx = x + f.street[0];
    const sz = z + f.street[1];
    if (!inBounds(sx, sz) || !src.streetAt(sx, sz)) continue;
    const run = streetRun(src, sx, sz, f.along);
    if (run > bestRun) {
      best = f;
      bestRun = run;
    }
  }
  return best;
}

/** True for a tile on the map in `zone`, with no building and no street on it. */
function freeZoned(src: PlatSource, zone: ZoneType, x: number, z: number): boolean {
  if (!inBounds(x, z)) return false;
  const i = tileIndex(x, z);
  return src.zone[i] === zone && src.buildingId[i] === 0 && !src.streetAt(x, z);
}

/** The row tiles of the run through (x, z): the tiles along its street that front the same side. */
function runThrough(
  src: PlatSource,
  zone: ZoneType,
  f: FrontGeometry,
  x: number,
  z: number,
): Array<[number, number]> {
  const inRun = (tx: number, tz: number): boolean =>
    inBounds(tx, tz) &&
    src.zone[tileIndex(tx, tz)] === zone &&
    frontOf(src, tx, tz)?.front === f.front;
  let sx = x;
  let sz = z;
  while (inRun(sx - f.along[0], sz - f.along[1])) {
    sx -= f.along[0];
    sz -= f.along[1];
  }
  const tiles: Array<[number, number]> = [];
  for (let tx = sx, tz = sz; inRun(tx, tz); tx += f.along[0], tz += f.along[1]) {
    tiles.push([tx, tz]);
  }
  return tiles;
}

/** Whether a lot of `lot` fits with its first frontage tile at `row[at]`, on ground no parcel has claimed. */
function lotFits(
  src: PlatSource,
  zone: ZoneType,
  claimed: Uint8Array,
  f: FrontGeometry,
  row: ReadonlyArray<[number, number]>,
  at: number,
  lot: LotSize,
): boolean {
  const { frontage, depth } = LOT_EXTENT[lot];
  if (at + frontage > row.length) return false;
  for (let j = 0; j < frontage; j++) {
    const [rx, rz] = row[at + j]!;
    for (let k = 0; k < depth; k++) {
      const tx = rx + k * f.depth[0];
      const tz = rz + k * f.depth[1];
      if (!freeZoned(src, zone, tx, tz) || claimed[tileIndex(tx, tz)] === 1) return false;
    }
  }
  return true;
}

/** A lot's min corner and footprint, from its first row tile and the side it fronts. */
function parcelOf(f: FrontGeometry, rx: number, rz: number, lot: LotSize): Parcel {
  const { frontage, depth } = LOT_EXTENT[lot];
  const alongX = f.along[0] === 1;
  const w = alongX ? frontage : depth;
  const d = alongX ? depth : frontage;
  // A lot fronting east or south is anchored by its far row, so its min corner steps back by its depth.
  const x = f.depth[0] === -1 ? rx - (depth - 1) : rx;
  const z = f.depth[1] === -1 ? rz - (depth - 1) : rz;
  return { x, z, w, d, lot, front: f.front };
}

/**
 * The run's parcels, cut from its first tile: a building stands as a parcel of
 * its own and is stepped over, a tile another run's parcel has claimed is
 * stepped over too, and every other stretch takes the largest lot the land
 * warrants that fits, down to the half lot.
 */
function cutRun(
  src: PlatSource,
  zone: ZoneType,
  claimed: Uint8Array,
  f: FrontGeometry,
  row: ReadonlyArray<[number, number]>,
): Parcel[] {
  const parcels: Parcel[] = [];
  let at = 0;
  while (at < row.length) {
    const [rx, rz] = row[at]!;
    const id = src.buildingId[tileIndex(rx, rz)]!;
    if (id !== 0) {
      while (at < row.length && src.buildingId[tileIndex(row[at]![0], row[at]![1])] === id) at++;
      continue;
    }
    const warranted = LOT_SIZES.indexOf(
      warrantedLot(zone, src.landValue?.[tileIndex(rx, rz)] ?? 0),
    );
    const allowed = lotsOfZone(zone);
    let cut: LotSize | null = null;
    for (let s = warranted; s >= 0 && cut === null; s--) {
      const size = LOT_SIZES[s]!;
      if (allowed.includes(size) && lotFits(src, zone, claimed, f, row, at, size)) cut = size;
    }
    if (cut === null) {
      at++;
      continue;
    }
    const parcel = parcelOf(f, rx, rz, cut);
    for (let dz = 0; dz < parcel.d; dz++) {
      for (let dx = 0; dx < parcel.w; dx++) claimed[tileIndex(parcel.x + dx, parcel.z + dz)] = 1;
    }
    parcels.push(parcel);
    at += LOT_EXTENT[cut].frontage;
  }
  return parcels;
}

/** The plat of one zone: its parcels, and the tiles a street's run reaches within the lot depth. */
export interface Plat {
  parcels: Parcel[];
  /** The parcels by the tile index of their min corner. */
  byAnchor: Map<number, Parcel[]>;
  /** 1 where a run fronts the tile or lies within the lot depth behind it: the plat reaches it. */
  reached: Uint8Array;
  /**
   * The parcel on each tile, -1 where none stands: an index into `parcels`,
   * or past its length an index into `framed`.
   */
  parcelAt: Int32Array;
  /** The parcels cut along the kerbs of the roads off the grid. */
  framed: FramedParcel[];
}

/** The grid parcel on the tile, or null where none or a framed one stands. */
function gridParcelAt(plat: Plat, x: number, z: number): Parcel | null {
  const n = plat.parcelAt[tileIndex(x, z)] ?? -1;
  return n < 0 ? null : (plat.parcels[n] ?? null);
}

/** The framed parcel on the tile, or null where none or a grid one stands. */
export function framedParcelAt(plat: Plat, x: number, z: number): FramedParcel | null {
  if (!inBounds(x, z)) return null;
  const n = plat.parcelAt[tileIndex(x, z)] ?? -1;
  return n < plat.parcels.length ? null : (plat.framed[n - plat.parcels.length] ?? null);
}

/**
 * Every parcel of the zone over the whole map, each run cut once from its
 * first tile, in row-major order of the tiles the runs are found from, so
 * no two parcels share a tile: a run cut later steps over what an earlier
 * one claimed. The spawner and the lens read the same plat.
 */
export function platOf(source: PlatSource, zone: ZoneType): Plat {
  // Low density is framed along a curve, so a tile beside one takes a grid
  // parcel only from a grid street; every other zone still plats against the
  // tiles the curve crosses.
  const alongKerbs = zone === ZoneType.ResLow && source.kerbs !== undefined;
  const src =
    alongKerbs && source.gridStreetAt !== undefined
      ? { ...source, streetAt: source.gridStreetAt }
      : source;
  const parcels: Parcel[] = [];
  const claimed = new Uint8Array(src.size * src.size);
  const reached = new Uint8Array(src.size * src.size);
  const cut = new Set<string>();
  for (let z = 0; z < src.size; z++) {
    for (let x = 0; x < src.size; x++) {
      if (src.zone[tileIndex(x, z)] !== zone) continue;
      const f = frontOf(src, x, z);
      if (f === null) continue;
      // The run reaches its row and the lot depth behind it.
      for (let k = 0; k < MAX_DEPTH; k++) {
        const tx = x + k * f.depth[0];
        const tz = z + k * f.depth[1];
        if (inBounds(tx, tz)) reached[tileIndex(tx, tz)] = 1;
      }
      const row = runThrough(src, zone, f, x, z);
      const key = `${f.front}:${row[0]![0]},${row[0]![1]}`;
      if (cut.has(key)) continue;
      cut.add(key);
      parcels.push(...cutRun(src, zone, claimed, f, row));
    }
  }
  const byAnchor = new Map<number, Parcel[]>();
  for (const p of parcels) {
    const i = tileIndex(p.x, p.z);
    const list = byAnchor.get(i);
    if (list) list.push(p);
    else byAnchor.set(i, [p]);
  }
  const parcelAt = new Int32Array(src.size * src.size).fill(-1);
  parcels.forEach((p, n) => {
    for (let dz = 0; dz < p.d; dz++) {
      for (let dx = 0; dx < p.w; dx++) parcelAt[tileIndex(p.x + dx, p.z + dz)] = n;
    }
  });
  const plat: Plat = { parcels, byAnchor, reached, parcelAt, framed: [] };
  if (alongKerbs) platAlongKerbs(src.kerbs!, src, zone, plat);
  return plat;
}

/** The corner clearance a drive keeps from a junction, metres. */
const DRIVE_CORNER_CLEARANCE_M = 6;
/** The least frontage a parcel has at the kerb, metres: 35 ft. */
export const MIN_KERB_FRONTAGE_M = 10.7;
/** How far the cut advances along the kerb when no parcel stands, metres. */
const KERB_CUT_STEP_M = 2;
/** The furthest a framed parcel reaches from a kerb, so the farthest a tile the curve plats lies from it. */
const KERB_REACH_M = MAX_DEPTH * TILE_METERS;

/** The kerb at arc length `s`: the samples either side blended, with the nearer one's heading. */
function kerbAt(kerb: readonly KerbSample[], s: number): KerbSample {
  let hi = 1;
  while (hi < kerb.length - 1 && kerb[hi]!.s < s) hi++;
  const a = kerb[hi - 1]!;
  const b = kerb[hi]!;
  const span = b.s - a.s;
  const f = span <= 0 ? 0 : Math.max(0, Math.min(1, (s - a.s) / span));
  return {
    x: a.x + (b.x - a.x) * f,
    z: a.z + (b.z - a.z) * f,
    s,
    heading: f < 0.5 ? a.heading : b.heading,
  };
}

/** The kerb sample nearest a world point. */
function nearestKerb(kerb: readonly KerbSample[], p: WorldPoint): KerbSample {
  let best = kerb[0]!;
  let bestD = Infinity;
  for (const k of kerb) {
    const d = (k.x - p.x) ** 2 + (k.z - p.z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

/** The chord a parcel has at the kerb: between the kerb points nearest its two front corners, metres. */
export function kerbChordM(kerb: readonly KerbSample[], frame: ParcelFrame, w: number): number {
  const left = nearestKerb(kerb, toWorld(frame, 0, 0));
  const right = nearestKerb(kerb, toWorld(frame, w, 0));
  return Math.hypot(right.x - left.x, right.z - left.z);
}

/** Whether two convex polygons overlap by more than a shared edge: the separating axis test. */
function polygonsOverlap(p: readonly WorldPoint[], q: readonly WorldPoint[]): boolean {
  const axes: WorldPoint[] = [];
  for (const shape of [p, q]) {
    for (let i = 0; i < shape.length; i++) {
      const a = shape[i]!;
      const b = shape[(i + 1) % shape.length]!;
      axes.push({ x: -(b.z - a.z), z: b.x - a.x });
    }
  }
  const project = (shape: readonly WorldPoint[], axis: WorldPoint): [number, number] => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of shape) {
      const t = v.x * axis.x + v.z * axis.z;
      if (t < lo) lo = t;
      if (t > hi) hi = t;
    }
    return [lo, hi];
  };
  for (const axis of axes) {
    const len = Math.hypot(axis.x, axis.z);
    if (len === 0) continue;
    const [a0, a1] = project(p, axis);
    const [b0, b1] = project(q, axis);
    if (a1 - b0 <= 1e-3 * len || b1 - a0 <= 1e-3 * len) return false;
  }
  return true;
}

/** The half width of the widest road at a node: how far its junction reaches along each arm. */
function junctionHalfWidthM(kerbs: KerbSource, node: number): number {
  let half = 0;
  for (const seg of segmentsAt(kerbs.net, node)) half = Math.max(half, kerbs.halfWidthM(seg));
  return half;
}

/**
 * The frame of a parcel `w` metres wide fronting the kerb from `s`: its
 * front-left corner as seen from the street, turned to the road's heading at
 * the frontage's middle and facing away from the road.
 */
function frameOnKerb(
  kerb: readonly KerbSample[],
  side: 1 | -1,
  s: number,
  w: number,
): ParcelFrame {
  const heading = kerbAt(kerb, s + w / 2).heading;
  const from = kerbAt(kerb, s);
  // Local v runs to the left of the heading, which on the left kerb is away
  // from the road. On the right kerb it would run back over the kerb into the
  // road, so the frame is turned about and anchored at the frontage's far end,
  // where its front-left corner then is.
  if (side === 1) return { x: from.x, z: from.z, heading };
  const far = kerbAt(kerb, s + w);
  return { x: far.x, z: far.z, heading: heading + Math.PI };
}

/**
 * Cuts framed parcels along both kerbs of every road off the grid into
 * `plat`, after the grid plat. Each kerb is walked from one junction's
 * clearance to the other's; at each stop the ladder is tried from the lot the
 * land under the kerb warrants down, and a parcel stands where every tile its
 * rectangle overlaps is zoned, free of buildings, roads and water, claimed by
 * no other parcel, and its kerb chord is at least the frontage floor. Where
 * none stands the cut steps on two metres; after one stands the next begins
 * where it ends, and further until the rectangles no longer overlap. Segments
 * are taken in slot order, so the result is the same every time.
 */
export function platAlongKerbs(
  kerbs: KerbSource,
  src: PlatSource,
  zone: ZoneType,
  plat: Plat,
): void {
  const { net } = kerbs;
  const extentM = src.size * TILE_METERS;
  const allowed = lotsOfZone(zone);
  const onMap = (p: WorldPoint): boolean =>
    p.x >= 0 && p.z >= 0 && p.x <= extentM && p.z <= extentM;
  // A parcel fronts its own road from the kerb, so the tile under the kerb is
  // its to claim; the ground under any other road off the grid is not.
  const free = liveSegments(net).filter((seg) => isFreeSegment(net, seg));
  const roadOn = new Map<number, number[]>();
  for (const seg of free) {
    for (const idx of footprintTiles(segmentGeom(net, seg), kerbs.halfWidthM(seg), src.size)) {
      const on = roadOn.get(idx);
      if (on) on.push(seg);
      else roadOn.set(idx, [seg]);
    }
  }
  // The kerb is cut as if nothing stood on it, and a parcel a building stands
  // in is then stepped over, its ground still its own, so a built parcel
  // never moves and never moves the parcels after it.
  const taken = new Uint8Array(src.size * src.size);
  const freeFor = (seg: number, t: { x: number; z: number }): boolean =>
    inBounds(t.x, t.z) &&
    src.zone[tileIndex(t.x, t.z)] === zone &&
    !kerbs.blocked(t.x, t.z) &&
    !src.streetAt(t.x, t.z) &&
    plat.parcelAt[tileIndex(t.x, t.z)] === -1 &&
    taken[tileIndex(t.x, t.z)] === 0 &&
    !(roadOn.get(tileIndex(t.x, t.z)) ?? []).some((other) => other !== seg);

  // Every rectangle cut so far, the grid parcels first and then either kerb
  // of any road: a tile belongs to the parcel its centre lies in, so two
  // turned rectangles can overlap in area without sharing a tile, and only
  // the rectangles themselves say so.
  const standing: WorldPoint[][] = plat.parcels.map((p) => [
    { x: p.x * TILE_METERS, z: p.z * TILE_METERS },
    { x: (p.x + p.w) * TILE_METERS, z: p.z * TILE_METERS },
    { x: (p.x + p.w) * TILE_METERS, z: (p.z + p.d) * TILE_METERS },
    { x: p.x * TILE_METERS, z: (p.z + p.d) * TILE_METERS },
  ]);
  for (const seg of free) {
    const geom: SegmentGeom = segmentGeom(net, seg);
    const half = kerbs.halfWidthM(seg);
    const clearA = junctionHalfWidthM(kerbs, net.segA[seg]!) + DRIVE_CORNER_CLEARANCE_M;
    const clearB = junctionHalfWidthM(kerbs, net.segB[seg]!) + DRIVE_CORNER_CLEARANCE_M;
    // The ground a framed parcel could reach is the curve's to plat: a lot
    // there grows only in a framed parcel, never wherever a box happens to fit.
    for (const idx of footprintTiles(geom, half + KERB_REACH_M, src.size)) plat.reached[idx] = 1;
    for (const side of [1, -1] as const) {
      const kerb = kerbLine(geom, side, half);
      const end = kerb[kerb.length - 1]!.s - clearB;
      let s = clearA;
      while (s + MIN_KERB_FRONTAGE_M <= end) {
        const at = kerbAt(kerb, s);
        const tx = Math.floor(at.x / TILE_METERS);
        const tz = Math.floor(at.z / TILE_METERS);
        const value = inBounds(tx, tz) ? (src.landValue?.[tileIndex(tx, tz)] ?? 0) : 0;
        const warranted = LOT_SIZES.indexOf(warrantedLot(zone, value));
        let cut: FramedParcel | null = null;
        for (let n = warranted; n >= 0 && cut === null; n--) {
          const lot = LOT_SIZES[n]!;
          if (!allowed.includes(lot)) continue;
          const w = LOT_EXTENT[lot].frontage * TILE_METERS;
          const d = LOT_EXTENT[lot].depth * TILE_METERS;
          if (s + w > end) continue;
          const frame = frameOnKerb(kerb, side, s, w);
          const corners = frameCorners(frame, w, d);
          if (!corners.every(onMap)) continue;
          if (kerbChordM(kerb, frame, w) + 1e-9 < MIN_KERB_FRONTAGE_M) continue;
          if (standing.some((q) => polygonsOverlap(corners, q))) continue;
          const tiles = claimedTiles(frame, w, d, src.size);
          if (tiles.length === 0 || !tiles.every((t) => freeFor(seg, t))) continue;
          cut = { frame, lot, w, d, tiles };
        }
        if (cut === null) {
          s += KERB_CUT_STEP_M;
          continue;
        }
        const built = cut.tiles.some((t) => src.buildingId[tileIndex(t.x, t.z)] !== 0);
        if (built) {
          for (const t of cut.tiles) taken[tileIndex(t.x, t.z)] = 1;
        } else {
          const index = plat.parcels.length + plat.framed.length;
          for (const t of cut.tiles) plat.parcelAt[tileIndex(t.x, t.z)] = index;
          plat.framed.push(cut);
        }
        standing.push(frameCorners(cut.frame, cut.w, cut.d));
        s += cut.w;
      }
    }
  }
}

/** Whether the plat reaches the tile: a street within the lot depth fronts it. */
export function platReaches(plat: Plat, x: number, z: number): boolean {
  return inBounds(x, z) && plat.reached[tileIndex(x, z)] === 1;
}

/**
 * Whether the rectangle at (x, z), w by d, is exactly tiled by parcels of
 * `lot` that share one front and lie wholly inside it: a building takes whole
 * parcels, never half of one.
 */
export function takesWholeParcels(
  plat: Plat,
  x: number,
  z: number,
  w: number,
  d: number,
  lot: LotSize,
): boolean {
  if (!inBounds(x, z) || !inBounds(x + w - 1, z + d - 1)) return false;
  let front: Front | null = null;
  for (let dz = 0; dz < d; dz++) {
    for (let dx = 0; dx < w; dx++) {
      const p = gridParcelAt(plat, x + dx, z + dz);
      if (p === null) return false;
      if (p.lot !== lot || (front !== null && p.front !== front)) return false;
      if (p.x < x || p.z < z || p.x + p.w > x + w || p.z + p.d > z + d) return false;
      front = p.front;
    }
  }
  return true;
}

/**
 * Whether a building covering the rectangle at (x, z), w by d, stands on the
 * frontage of the parcels it touches: it touches at least one (or none, for a
 * building growing into its own yard when `allowNone`), they all front the
 * same side (the given `front`, when one is), none is split across the
 * frontage, and each starts at the building's street-side edge. A building
 * shallower than its parcels leaves the rest of them as its yard, and a deeper
 * one runs into the unparcelled ground behind them; every rectangle tile in no
 * parcel is such ground or the building's own old tiles, which the cut steps
 * over, so none is tested.
 */
export function takesFrontageLots(
  plat: Plat,
  x: number,
  z: number,
  w: number,
  d: number,
  front?: Front,
  allowNone = false,
): boolean {
  if (!inBounds(x, z) || !inBounds(x + w - 1, z + d - 1)) return false;
  let seen: Front | null = front ?? null;
  let touched = false;
  for (let dz = 0; dz < d; dz++) {
    for (let dx = 0; dx < w; dx++) {
      const n = plat.parcelAt[tileIndex(x + dx, z + dz)]!;
      if (n < 0) continue;
      // A framed parcel is no grid building's frontage.
      const p = plat.parcels[n];
      if (p === undefined) return false;
      touched = true;
      if (seen !== null && p.front !== seen) return false;
      seen = p.front;
      const alongInside =
        seen === 'N' || seen === 'S'
          ? p.x >= x && p.x + p.w <= x + w
          : p.z >= z && p.z + p.d <= z + d;
      const atStreet =
        seen === 'N'
          ? p.z === z
          : seen === 'S'
            ? p.z + p.d === z + d
            : seen === 'W'
              ? p.x === x
              : p.x + p.w === x + w;
      if (!alongInside || !atStreet) return false;
    }
  }
  return touched || allowNone;
}

/**
 * The parcels whose min corner is (x, z), or null where the plat does not
 * reach the tile: no street within the lot depth fronts it, so a lot there
 * grows wherever it fits, as it did before a block was cut. A tile the plat
 * reaches that no parcel starts on gives an empty list: it is yard behind
 * or beside a lot, and no lot of the plat starts there.
 */
export function parcelsAnchoredAt(plat: Plat, x: number, z: number): Parcel[] | null {
  if (!inBounds(x, z) || plat.reached[tileIndex(x, z)] !== 1) return null;
  return plat.byAnchor.get(tileIndex(x, z)) ?? [];
}
