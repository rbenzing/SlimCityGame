/**
 * The one transform between a parcel's local lot coordinates and the world.
 *
 * A framed parcel is a grid lot fronting north, moved and turned: local `u`
 * runs along the street from the front-left corner, local `v` runs into the
 * lot from the kerb line, both in metres. A grid lot fronting north at tile
 * (x, z) is the identity frame, so every lot layout the game computes for a
 * north-fronting lot is a layout in (u, v) that `toWorld` turns to its street.
 */

import { TILE_METERS } from './constants';
import type { ParcelFrame, TilePoint } from './types';

export interface WorldPoint {
  x: number;
  z: number;
}

export interface LocalPoint {
  u: number;
  v: number;
}

/** A local point turned and moved into the world by its frame. */
export function toWorld(frame: ParcelFrame, u: number, v: number): WorldPoint {
  const c = Math.cos(frame.heading);
  const s = Math.sin(frame.heading);
  return { x: frame.x + u * c - v * s, z: frame.z + u * s + v * c };
}

/** The inverse of `toWorld`: a world point in the frame's own axes. */
export function toLocal(frame: ParcelFrame, x: number, z: number): LocalPoint {
  const c = Math.cos(frame.heading);
  const s = Math.sin(frame.heading);
  const dx = x - frame.x;
  const dz = z - frame.z;
  return { u: dx * c + dz * s, v: -dx * s + dz * c };
}

/** The side of a grid lot its street is on. */
export type GridFront = 'N' | 'E' | 'S' | 'W';

/**
 * The frame of a grid lot of `w` by `d` tiles at tile (x, z) fronting `front`:
 * its front-left corner (as seen from the street) and a quarter-turn heading,
 * so a north-fronting lot is the identity frame.
 */
export function frameOfGridLot(
  x: number,
  z: number,
  w: number,
  d: number,
  front: GridFront,
): ParcelFrame {
  const west = x * TILE_METERS;
  const east = (x + w) * TILE_METERS;
  const north = z * TILE_METERS;
  const south = (z + d) * TILE_METERS;
  switch (front) {
    case 'N':
      return { x: west, z: north, heading: 0 };
    case 'E':
      return { x: east, z: north, heading: Math.PI / 2 };
    case 'S':
      return { x: east, z: south, heading: Math.PI };
    case 'W':
      return { x: west, z: south, heading: (3 * Math.PI) / 2 };
    default:
      throw new RangeError(`frameOfGridLot: unknown front ${front as string}`);
  }
}

/** The four world corners of the rectangle [0, wM] × [0, dM] in the frame, front-left first, clockwise from the street. */
export function frameCorners(frame: ParcelFrame, wM: number, dM: number): WorldPoint[] {
  return [toWorld(frame, 0, 0), toWorld(frame, wM, 0), toWorld(frame, wM, dM), toWorld(frame, 0, dM)];
}

/**
 * Every tile whose centre lies in the rectangle [0, wM) × [0, dM) in the
 * frame, inside a grid of `size` tiles a side. Claiming by centre partitions
 * the tiles between parcels: two rectangles that do not overlap never claim
 * the same tile, however their side line crosses it, so parcels can stand end
 * to end along a street at any angle. A tile the rectangle only crosses a
 * corner of belongs to the neighbour whose rectangle holds its centre, or to
 * nobody. Sorted by z then x.
 */
export function claimedTiles(frame: ParcelFrame, wM: number, dM: number, size: number): TilePoint[] {
  const corners = frameCorners(frame, wM, dM);
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const c of corners) {
    minX = Math.min(minX, c.x);
    minZ = Math.min(minZ, c.z);
    maxX = Math.max(maxX, c.x);
    maxZ = Math.max(maxZ, c.z);
  }
  const tx0 = Math.max(0, Math.floor(minX / TILE_METERS));
  const tz0 = Math.max(0, Math.floor(minZ / TILE_METERS));
  const tx1 = Math.min(size - 1, Math.floor(maxX / TILE_METERS));
  const tz1 = Math.min(size - 1, Math.floor(maxZ / TILE_METERS));
  const tiles: TilePoint[] = [];
  for (let tz = tz0; tz <= tz1; tz++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const { u, v } = toLocal(frame, (tx + 0.5) * TILE_METERS, (tz + 0.5) * TILE_METERS);
      if (u >= 0 && u < wM && v >= 0 && v < dM) tiles.push({ x: tx, z: tz });
    }
  }
  return tiles;
}
