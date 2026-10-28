/**
 * Bus stops: road furniture on one side of a street tile, kept apart from the
 * building registry because a stop takes no tile of its own. The registry is
 * the one owner of which stops stand; transit lines may only name a tile that
 * holds one, and the worker checks the street itself before placing.
 *
 * Deterministic: no Math.random, no Date.now; every listing is in tile order.
 */
import {
  SHELTER_WARRANT_BOARDINGS,
  type BusStop,
  type BusStopState,
  type TilePoint,
} from '../shared/types';
import { MAP_SIZE } from '../shared/constants';

/** What `place` did: put a stop down, upgraded the sign standing there, or refused. */
export type StopPlacement = { placed: true; replaced: BusStop | null } | { placed: false };

function tileKey(x: number, z: number): number {
  return z * MAP_SIZE + x;
}

function stopKey(x: number, z: number, side: 0 | 1): number {
  return tileKey(x, z) * 2 + side;
}

function isStop(value: unknown): value is BusStop {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    Number.isInteger(s.x) &&
    Number.isInteger(s.z) &&
    (s.side === 0 || s.side === 1) &&
    (s.kind === 'sign' || s.kind === 'shelter')
  );
}

export class StopRegistry {
  private readonly stops = new Map<number, BusStop>();
  /** Boardings a day on each tile, summed over the lines calling there; shared by the tile's stops. */
  private readonly tileBoardings = new Map<number, number>();

  /**
   * Stands a stop on its side of the tile. A taken side is refused, unless the
   * new stop is a shelter over a sign, which is the upgrade; `replaced` is the
   * sign it took the place of.
   */
  place(stop: BusStop): StopPlacement {
    const key = stopKey(stop.x, stop.z, stop.side);
    const standing = this.stops.get(key);
    if (standing && !(standing.kind === 'sign' && stop.kind === 'shelter')) {
      return { placed: false };
    }
    this.stops.set(key, { x: stop.x, z: stop.z, side: stop.side, kind: stop.kind });
    return { placed: true, replaced: standing ? { ...standing } : null };
  }

  /** Takes the stop off the tile's side; returns it, or null where none stood. */
  remove(x: number, z: number, side: 0 | 1): BusStop | null {
    const key = stopKey(x, z, side);
    const standing = this.stops.get(key) ?? null;
    this.stops.delete(key);
    return standing;
  }

  at(x: number, z: number, side: 0 | 1): BusStop | null {
    return this.stops.get(stopKey(x, z, side)) ?? null;
  }

  /** The stops on a tile, low side first. */
  onTile(x: number, z: number): BusStop[] {
    const found: BusStop[] = [];
    for (const side of [0, 1] as const) {
      const stop = this.stops.get(stopKey(x, z, side));
      if (stop) found.push({ ...stop });
    }
    return found;
  }

  hasStop(x: number, z: number): boolean {
    return this.at(x, z, 0) !== null || this.at(x, z, 1) !== null;
  }

  get size(): number {
    return this.stops.size;
  }

  /** Every stop, in tile order then side. */
  list(): BusStop[] {
    return [...this.stops.keys()].sort((a, b) => a - b).map((key) => ({ ...this.stops.get(key)! }));
  }

  clear(): void {
    this.stops.clear();
    this.tileBoardings.clear();
  }

  /** Forgets last pass's boardings, ahead of the transit pass adding this one's. */
  clearBoardings(): void {
    this.tileBoardings.clear();
  }

  /** Adds a line's boardings a day at the tile its stop names. */
  addBoardings(tile: TilePoint, boardings: number): void {
    const key = tileKey(tile.x, tile.z);
    this.tileBoardings.set(key, (this.tileBoardings.get(key) ?? 0) + boardings);
  }

  /**
   * A stop's boardings a day: the tile's, shared evenly among the stops
   * standing on it so a tile with two sides is not counted twice.
   */
  boardings(stop: BusStop): number {
    const total = this.tileBoardings.get(tileKey(stop.x, stop.z)) ?? 0;
    const standing = this.onTile(stop.x, stop.z).length;
    return standing === 0 ? 0 : total / standing;
  }

  /** A shelter earns its keep, and its ad panel sells, from SHELTER_WARRANT_BOARDINGS a day. */
  isWarranted(stop: BusStop): boolean {
    return stop.kind === 'shelter' && this.boardings(stop) >= SHELTER_WARRANT_BOARDINGS;
  }

  /** Every stop with its boardings and warrant, as the snapshot carries them. */
  states(): BusStopState[] {
    return this.list().map((stop) => ({
      ...stop,
      boardingsPerDay: this.boardings(stop),
      warranted: this.isWarranted(stop),
    }));
  }

  serialize(): BusStop[] {
    return this.list();
  }

  /** Replaces the stops from a save; entries that are not a stop are dropped, and absent means none. */
  restore(saved: readonly unknown[] | undefined): void {
    this.clear();
    for (const entry of saved ?? []) {
      if (isStop(entry)) this.place(entry);
    }
  }
}

/**
 * Which side of a street tile a point lies on: the low-coordinate side (0) or
 * the high one (1), across the axis the road runs along. A tile that is a
 * bend or an end reads as running north-south, and a point level with the
 * road's centre reads as the low side.
 */
export function sideTowards(roadMask: number, road: TilePoint, from: TilePoint): 0 | 1 {
  const runsEastWest = (roadMask & 0b1010) !== 0 && (roadMask & 0b0101) === 0;
  const across = runsEastWest ? from.z - road.z : from.x - road.x;
  return across > 0 ? 1 : 0;
}
