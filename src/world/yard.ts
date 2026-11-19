/**
 * The yard of a low-density home's lot: the zoned rows behind the lot, in from
 * its street up to the zoning depth. A lot covers only the depth its home
 * needs, so a half lot is followed by two rows of yard and a normal or double
 * lot by one; an estate or an acre reaches the zoning depth itself.
 *
 * A yard tile is zoned ground behind the lot, contiguous from its rear line,
 * that holds no building and that no parcel of the current plat covers: the
 * ground no lot will ever start on. A tile two lots reach, as inside a corner,
 * goes to the lot whose street is nearer, and on a tie to the lot whose
 * street-side edge tile comes first in map order. So no tile is in two yards
 * or in a parcel. Derived from the plat, the zone, the roads and the
 * buildings; nothing is stored and nothing the sim reads changes. When the
 * plat later claims a yard tile for a new parcel, the yard shrinks.
 *
 * Pure: no sim, no three.js.
 */
import { inBounds, tileIndex } from '../shared/constants';
import { ZoneType, type TilePoint } from '../shared/types';
import type { Front, Parcel, Plat, PlatSource } from './plat';
import { ZONE_DEPTH } from './zonable';

/** What the yard reads of the world: the plat's own layers. */
export type YardSource = Pick<PlatSource, 'size' | 'zone' | 'buildingId' | 'streetAt'>;

/** The plat's claim on each tile: the parcel on it, or -1. */
export type YardPlat = Pick<Plat, 'parcelAt'>;

/** A grid lot: its min corner, its footprint and the side its street is on. */
export interface YardLot {
  x: number;
  z: number;
  w: number;
  d: number;
  front: Front;
}

/** The zones whose lots have a yard: detached homes. */
const YARD_ZONES: readonly ZoneType[] = [ZoneType.ResLow];

interface Direction {
  /** One tile in from the lot's street. */
  inward: readonly [number, number];
  /** The tile of the lot's rear row, at `column` tiles along the frontage. */
  rear: (lot: YardLot, column: number) => readonly [number, number];
  /** The lot's depth, in tiles. */
  depth: (lot: YardLot) => number;
  /** Frontage, in tiles. */
  frontage: (lot: YardLot) => number;
}

const DIRECTIONS: Readonly<Record<Front, Direction>> = {
  N: {
    inward: [0, 1],
    rear: (l, c) => [l.x + c, l.z + l.d - 1],
    depth: (l) => l.d,
    frontage: (l) => l.w,
  },
  S: {
    inward: [0, -1],
    rear: (l, c) => [l.x + c, l.z],
    depth: (l) => l.d,
    frontage: (l) => l.w,
  },
  W: {
    inward: [1, 0],
    rear: (l, c) => [l.x + l.w - 1, l.z + c],
    depth: (l) => l.w,
    frontage: (l) => l.d,
  },
  E: {
    inward: [-1, 0],
    rear: (l, c) => [l.x, l.z + c],
    depth: (l) => l.w,
    frontage: (l) => l.d,
  },
};

const FRONTS: readonly Front[] = ['N', 'E', 'S', 'W'];

/** Whether the tile is zoned like the lot, free of buildings and streets, and no parcel of the plat covers it. */
function isUnclaimed(
  src: YardSource,
  plat: YardPlat,
  zone: ZoneType,
  x: number,
  z: number,
): boolean {
  if (!inBounds(x, z)) return false;
  const i = tileIndex(x, z);
  return (
    src.zone[i] === zone &&
    src.buildingId[i] === 0 &&
    !src.streetAt(x, z) &&
    (plat.parcelAt[i] ?? -1) < 0
  );
}

/** Whether the tile is part of a lot: a building stands on it or a parcel covers it. */
function lotRegion(src: YardSource, plat: YardPlat, x: number, z: number): string | null {
  if (!inBounds(x, z)) return null;
  const i = tileIndex(x, z);
  const building = src.buildingId[i] ?? 0;
  if (building !== 0) return `b${building}`;
  const parcel = plat.parcelAt[i] ?? -1;
  return parcel >= 0 ? `p${parcel}` : null;
}

/**
 * The lot that claims an unclaimed tile: from the tile, each side is walked
 * toward its street through unclaimed ground, then through one lot, to the
 * street. The nearest street wins; on a tie the lot whose first tile is first
 * in map order. Null when no lot has the tile within the zoning depth.
 */
function claimant(
  src: YardSource,
  plat: YardPlat,
  zone: ZoneType,
  x: number,
  z: number,
): Front | null {
  let best: { front: Front; distance: number; edgeX: number; edgeZ: number } | null = null;
  for (const front of FRONTS) {
    const [ix, iz] = DIRECTIONS[front].inward;
    // Toward the street is back along the lot's inward direction.
    const dx = -ix;
    const dz = -iz;
    let step = 1;
    while (step <= ZONE_DEPTH && isUnclaimed(src, plat, zone, x + step * dx, z + step * dz)) step++;
    const edgeX = x + step * dx;
    const edgeZ = z + step * dz;
    const region = lotRegion(src, plat, edgeX, edgeZ);
    if (region === null) continue;
    while (step <= ZONE_DEPTH && lotRegion(src, plat, x + step * dx, z + step * dz) === region) {
      step++;
    }
    if (step > ZONE_DEPTH || !src.streetAt(x + step * dx, z + step * dz)) continue;
    const better =
      best === null ||
      step < best.distance ||
      (step === best.distance &&
        (edgeZ < best.edgeZ || (edgeZ === best.edgeZ && edgeX < best.edgeX)));
    if (better) best = { front, distance: step, edgeX, edgeZ };
  }
  return best?.front ?? null;
}

/**
 * How many rows of yard stand behind the lot: the rows every column of the
 * lot's frontage has, contiguous from the rear line, unclaimed by any parcel
 * and won by this lot, to the zoning depth. Zero for any lot whose land is not
 * low-density housing.
 */
export function yardRowsBehind(src: YardSource, plat: YardPlat, lot: YardLot): number {
  const zone = inBounds(lot.x, lot.z) ? (src.zone[tileIndex(lot.x, lot.z)] as ZoneType) : 0;
  if (!YARD_ZONES.includes(zone)) return 0;
  const dir = DIRECTIONS[lot.front];
  let rows = Math.max(0, ZONE_DEPTH - dir.depth(lot));
  for (let c = 0; c < dir.frontage(lot) && rows > 0; c++) {
    const [rx, rz] = dir.rear(lot, c);
    let free = 0;
    while (free < rows) {
      const x = rx + (free + 1) * dir.inward[0];
      const z = rz + (free + 1) * dir.inward[1];
      if (!isUnclaimed(src, plat, zone, x, z) || claimant(src, plat, zone, x, z) !== lot.front) {
        break;
      }
      free++;
    }
    rows = free;
  }
  return rows;
}

/** The yard's tiles, nearest the lot first, row by row. */
export function yardTilesOf(src: YardSource, plat: YardPlat, lot: YardLot): TilePoint[] {
  const rows = yardRowsBehind(src, plat, lot);
  const dir = DIRECTIONS[lot.front];
  const tiles: TilePoint[] = [];
  for (let r = 1; r <= rows; r++) {
    for (let c = 0; c < dir.frontage(lot); c++) {
      const [rx, rz] = dir.rear(lot, c);
      tiles.push({ x: rx + r * dir.inward[0], z: rz + r * dir.inward[1] });
    }
  }
  return tiles;
}

/** The lot's parcel grown back over its yard: the whole garden the lot reads as. */
export function parcelWithYard(src: YardSource, plat: YardPlat, lot: Parcel): Parcel {
  const rows = yardRowsBehind(src, plat, lot);
  if (rows === 0) return lot;
  const { front } = lot;
  return {
    ...lot,
    x: front === 'E' ? lot.x - rows : lot.x,
    z: front === 'S' ? lot.z - rows : lot.z,
    w: front === 'E' || front === 'W' ? lot.w + rows : lot.w,
    d: front === 'N' || front === 'S' ? lot.d + rows : lot.d,
  };
}
