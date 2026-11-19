/**
 * The yard of a low-density home's lot: the zoned rows behind the lot, in from
 * its street up to the zoning depth. A lot covers only the depth its home
 * needs, so a half lot is followed by two rows of yard and a normal or double
 * lot by one; an estate or an acre reaches the zoning depth itself.
 *
 * A yard tile is one only the lot in front of it can reach: free zoned
 * ground, and no street within the zoning depth of it other than the lot's
 * own, so no lot cut from another street can cover it and no tile is in two
 * yards or in a parcel of the plat. Derived from the zone, the roads and the
 * buildings alone; nothing is stored and nothing the sim reads changes.
 *
 * Pure: no sim, no three.js.
 */
import { inBounds, tileIndex } from '../shared/constants';
import { ZoneType, type TilePoint } from '../shared/types';
import type { Front, Parcel, PlatSource } from './plat';
import { ZONE_DEPTH } from './zonable';

/** What the yard reads of the world: the plat's own layers. */
export type YardSource = Pick<PlatSource, 'size' | 'zone' | 'buildingId' | 'streetAt'>;

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
  /** One tile toward the lot's street. */
  street: readonly [number, number];
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
    street: [0, -1],
    rear: (l, c) => [l.x + c, l.z + l.d - 1],
    depth: (l) => l.d,
    frontage: (l) => l.w,
  },
  S: {
    inward: [0, -1],
    street: [0, 1],
    rear: (l, c) => [l.x + c, l.z],
    depth: (l) => l.d,
    frontage: (l) => l.w,
  },
  W: {
    inward: [1, 0],
    street: [-1, 0],
    rear: (l, c) => [l.x + l.w - 1, l.z + c],
    depth: (l) => l.w,
    frontage: (l) => l.d,
  },
  E: {
    inward: [-1, 0],
    street: [1, 0],
    rear: (l, c) => [l.x, l.z + c],
    depth: (l) => l.w,
    frontage: (l) => l.d,
  },
};

const COMPASS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/** Whether a street other than the lot's own is within the zoning depth of the tile: a lot cut from it could cover the tile. */
function otherStreetReaches(
  src: YardSource,
  x: number,
  z: number,
  own: readonly [number, number],
): boolean {
  for (const [dx, dz] of COMPASS) {
    if (dx === own[0] && dz === own[1]) continue;
    for (let m = 1; m <= ZONE_DEPTH; m++) {
      if (src.streetAt(x + m * dx, z + m * dz)) return true;
    }
  }
  return false;
}

/** Whether the tile is zoned like the lot, with no building and no street on it, and no other street's lot could reach it. */
function isYardTile(
  src: YardSource,
  zone: ZoneType,
  x: number,
  z: number,
  own: readonly [number, number],
): boolean {
  if (!inBounds(x, z)) return false;
  const i = tileIndex(x, z);
  return (
    src.zone[i] === zone &&
    src.buildingId[i] === 0 &&
    !src.streetAt(x, z) &&
    !otherStreetReaches(src, x, z, own)
  );
}

/**
 * How many rows of yard stand behind the lot: the rows every column of the
 * lot's frontage has free and unreached, from the lot's rear back to the
 * zoning depth. Zero for any lot whose land is not low-density housing.
 */
export function yardRowsBehind(src: YardSource, lot: YardLot): number {
  const zone = inBounds(lot.x, lot.z) ? (src.zone[tileIndex(lot.x, lot.z)] as ZoneType) : 0;
  if (!YARD_ZONES.includes(zone)) return 0;
  const dir = DIRECTIONS[lot.front];
  const room = Math.max(0, ZONE_DEPTH - dir.depth(lot));
  let rows = room;
  for (let c = 0; c < dir.frontage(lot) && rows > 0; c++) {
    const [rx, rz] = dir.rear(lot, c);
    let free = 0;
    while (
      free < rows &&
      isYardTile(
        src,
        zone,
        rx + (free + 1) * dir.inward[0],
        rz + (free + 1) * dir.inward[1],
        dir.street,
      )
    ) {
      free++;
    }
    rows = free;
  }
  return rows;
}

/** The yard's tiles, nearest the lot first, row by row. */
export function yardTilesOf(src: YardSource, lot: YardLot): TilePoint[] {
  const rows = yardRowsBehind(src, lot);
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
export function parcelWithYard(src: YardSource, lot: Parcel): Parcel {
  const rows = yardRowsBehind(src, lot);
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
