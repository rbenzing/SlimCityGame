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
import { inBounds, tileIndex } from '../shared/constants';
import { LOT_EXTENT, LOT_SIZES, lotsOfZone, warrantedLot } from '../shared/lots';
import { isStreetTier, type LotSize, type ZoneType } from '../shared/types';
import { freeCellsOn, type RoadCells } from './roadnet';

/** The grid layers the plat reads: the sim's grid and the render mirror both have them. */
export interface PlatGrid {
  size: number;
  zone: Uint8Array;
  buildingId: Uint32Array;
  roadTier: Uint8Array;
  roadElevation: Float32Array;
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
): PlatSource {
  return {
    size: g.size,
    zone: g.zone,
    buildingId: g.buildingId,
    landValue,
    streetAt: (x, z) => {
      if (!inBounds(x, z)) return false;
      const idx = tileIndex(x, z);
      if ((g.roadElevation[idx] ?? 0) > 0) return false;
      if (isStreetTier(g.roadTier[idx] ?? 0)) return true;
      return cells !== null && freeCellsOn(cells, idx).some((c) => isStreetTier(cells.tier[c]!));
    },
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
  /** The index into `parcels` of the parcel on each tile, -1 where none stands. */
  parcelAt: Int32Array;
}

/**
 * Every parcel of the zone over the whole map, each run cut once from its
 * first tile, in row-major order of the tiles the runs are found from, so
 * no two parcels share a tile: a run cut later steps over what an earlier
 * one claimed. The spawner and the lens read the same plat.
 */
export function platOf(src: PlatSource, zone: ZoneType): Plat {
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
  return { parcels, byAnchor, reached, parcelAt };
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
      const n = plat.parcelAt[tileIndex(x + dx, z + dz)]!;
      if (n < 0) return false;
      const p = plat.parcels[n]!;
      if (p.lot !== lot || (front !== null && p.front !== front)) return false;
      if (p.x < x || p.z < z || p.x + p.w > x + w || p.z + p.d > z + d) return false;
      front = p.front;
    }
  }
  return true;
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
