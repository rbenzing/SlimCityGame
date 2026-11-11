/**
 * Which map side a placed building's front stands on: the edge its door, drive
 * and car park open on. One answer for the worker's refusal, the ghost's turn
 * and the renderer's crossing, so a building is never judged on a different
 * side than it is drawn on.
 *
 * A kit declares its front in civicaccess.ts (its spans' edge and what decides
 * its turn); a plain building's front is its local +Z edge. Pure: no scene.
 */
import { civicAccessFor, type CivicAccess } from './civicaccess';
import { footprintForRotation, type Footprint } from './footprint';
import type { Side } from './roadedge';
import type { BuildingCatalogEntry } from './types';

type Turn = 0 | 1 | 2 | 3;

/** The terrain a kit turns to face: the water beside a shore kit, the track beside a station or a rail yard. */
export interface KitSensors {
  waterAt: (tileX: number, tileZ: number) => boolean;
  railAt: (tileX: number, tileZ: number) => boolean;
}

/** Sensors that find neither water nor track: every kit takes its placed rotation. */
export const NO_SENSORS: KitSensors = { waterAt: () => false, railAt: () => false };

const SIDES_CLOCKWISE: readonly Side[] = ['N', 'E', 'S', 'W'];

/** A kit with no declared access: its front is its local +Z edge and its turn is its rotation. */
const PLAIN_ACCESS: CivicAccess = { spans: [] };

/**
 * Which way a shore building faces: the rotation (as rotateLocalXZ counts it,
 * so local +Z lands on the water) toward the first water tile orthogonally
 * beside the footprint, south first; 0 when none is beside it. Pure.
 */
export function waterSideOf(
  x: number,
  z: number,
  footprint: Footprint,
  waterAt: (tx: number, tz: number) => boolean,
): Turn {
  const { w, d } = footprint;
  for (let dx = 0; dx < w; dx++) if (waterAt(x + dx, z + d)) return 0; // south: +Z
  for (let dz = 0; dz < d; dz++) if (waterAt(x + w, z + dz)) return 1; // east: +X
  for (let dx = 0; dx < w; dx++) if (waterAt(x + dx, z - 1)) return 2; // north: -Z
  for (let dz = 0; dz < d; dz++) if (waterAt(x - 1, z + dz)) return 3; // west: -X
  return 0;
}

/**
 * Which edge of a footprint the rail runs along, as the side its track-frame
 * -Z faces: 0 south (+Z), 1 east (+X), 2 north (-Z), 3 west (-X). The edge
 * with the most rail tiles, ties north, east, south, west; null when no rail
 * touches the lot.
 */
export function railSideOf(
  x: number,
  z: number,
  lot: Footprint,
  railAt: (tx: number, tz: number) => boolean,
): Turn | null {
  const { w, d } = lot;
  const count = (tiles: [number, number][]): number =>
    tiles.filter(([tx, tz]) => railAt(tx, tz)).length;
  const row = (tz: number): [number, number][] => Array.from({ length: w }, (_, i) => [x + i, tz]);
  const col = (tx: number): [number, number][] => Array.from({ length: d }, (_, i) => [tx, z + i]);
  const sides: [Turn, number][] = [
    [2, count(row(z - 1))],
    [1, count(col(x + w))],
    [0, count(row(z + d))],
    [3, count(col(x - 1))],
  ];
  let best: Turn | null = null;
  let most = 0;
  for (const [side, n] of sides) {
    if (n > most) {
      most = n;
      best = side;
    }
  }
  return best;
}

/**
 * The station's track frame for a lot: the footprint with its width along
 * the track, and the turn that lays that frame's -Z edge on the track's side.
 * `long` says the track runs along the lot's longer edge.
 */
export function depotFrame(
  entry: BuildingCatalogEntry,
  rotation: Turn,
  facing: Turn,
): { footprint: Footprint; turn: Turn; long: boolean } {
  const lot = footprintForRotation(entry, rotation);
  const alongX = facing % 2 === 0;
  const footprint = alongX ? { w: lot.w, d: lot.d } : { w: lot.d, d: lot.w };
  return { footprint, turn: ((facing + 2) % 4) as Turn, long: footprint.w > footprint.d };
}

/**
 * A yard's frame: the lot with its long side along X and the track on its -Z
 * edge, or, where the track runs along a short edge of the lot, off its -X
 * end; and the turn that lays that frame on the placed lot.
 */
export function yardFrame(
  entry: BuildingCatalogEntry,
  rotation: Turn,
  facing: Turn,
): { footprint: Footprint; turn: Turn; fromEnd: boolean } {
  const lot = footprintForRotation(entry, rotation);
  const longAlongX = lot.w >= lot.d;
  const trackAlongX = facing % 2 === 0;
  const fromEnd = trackAlongX !== longAlongX;
  return {
    footprint: longAlongX ? { w: lot.w, d: lot.d } : { w: lot.d, d: lot.w },
    turn: ((facing + (fromEnd ? 1 : 2)) % 4) as Turn,
    fromEnd,
  };
}

/** The map side a kit's access edge lies on when the kit stands turned `turn` quarter turns. */
export function civicEdgeSide(access: CivicAccess, turn: Turn): Side {
  const front = (2 - turn + 4) % 4;
  return SIDES_CLOCKWISE[access.edge === 'back' ? (front + 2) % 4 : front]!;
}

/** The turn a kit stands at, and the width of its own frame in tiles. */
export function kitFrameOf(
  entry: BuildingCatalogEntry,
  access: CivicAccess,
  building: { x: number; z: number; rotation: Turn },
  sensors: KitSensors,
): { turn: Turn; widthTiles: number } {
  const { x, z, rotation } = building;
  const lot = footprintForRotation(entry, rotation);
  switch (access.turn ?? 'placed') {
    case 'water':
      return { turn: waterSideOf(x, z, lot, sensors.waterAt), widthTiles: entry.footprint.w };
    case 'station': {
      const facing = railSideOf(x, z, lot, sensors.railAt) ?? (((rotation + 2) % 4) as Turn);
      const frame = depotFrame(entry, rotation, facing);
      return { turn: frame.turn, widthTiles: frame.footprint.w };
    }
    case 'yard': {
      const facing = railSideOf(x, z, lot, sensors.railAt) ?? (((rotation + 2) % 4) as Turn);
      const frame = yardFrame(entry, rotation, facing);
      return { turn: frame.turn, widthTiles: frame.footprint.w };
    }
    default:
      return { turn: rotation, widthTiles: entry.footprint.w };
  }
}

/**
 * The side a building placed at (x, z) turned `rotation` fronts: where its
 * door, drive and car park open. Null for a building with no front on a street:
 * one marked off-street, and a depot whose gate faces its track.
 */
export function frontSideOf(
  entry: BuildingCatalogEntry,
  x: number,
  z: number,
  rotation: Turn,
  sensors: KitSensors,
): Side | null {
  if (entry.offStreet) return null;
  const access = civicAccessFor(entry);
  if (access === null) return civicEdgeSide(PLAIN_ACCESS, rotation);
  if (access.spans.length === 0) return null;
  const { turn } = kitFrameOf(entry, access, { x, z, rotation }, sensors);
  return civicEdgeSide(access, turn);
}
