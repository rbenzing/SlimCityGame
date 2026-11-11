/**
 * Who may stand where beside a street. Every roadside placer (lamps, signs,
 * signals, tram and power poles, meters, cabinets, trees) asks the same two
 * questions of the same place: is it on a bus stop's span or a drive, and is
 * another object already within reach of it. Pure: no three.js, no randomness.
 *
 * Objects take their places in a fixed order, and a lower one gives way to a
 * higher one by moving along its own strip or by not standing at all.
 */
import { TILE_METERS, tileToWorld, worldToTile } from '../shared/constants';

/** Along one side of a street nothing stands within this of another object's centre, metres. */
export const OBJECT_GAP_M = 1.5;
/** A street tree keeps this far from a lamp, metres. */
export const TREE_FROM_LAMP_M = 4.6;
/** A street tree keeps this far from a stop sign or a signal, metres. */
export const TREE_FROM_CONTROL_M = 6.1;
/** A street tree keeps this far from a drive, metres. */
export const TREE_FROM_DRIVE_M = 1.8;
/**
 * A tree keeps this far from the middle of a bus stop's pad, metres: the pad's
 * half-diagonal, 2.2, and the 1.8 a tree keeps from a drive, so no trunk
 * stands on the pad or in the path to its shelter.
 */
export const TREE_FROM_STOP_M = 4;

/** A sign's post stands this far behind the kerb face, metres. */
export const SIGN_BEHIND_KERB_M = 0.46;
/** The least a sign board's edge stands behind the kerb face, metres. */
export const SIGN_EDGE_BEHIND_KERB_M = 0.3;
/** A signal's mast stands this far behind the kerb face, metres. */
export const MAST_BEHIND_KERB_M = 0.61;
/** A sign board's bottom over a walk, and over ground with no walk, metres. */
export const SIGN_BOTTOM_OVER_WALK_M = 2.1;
export const SIGN_BOTTOM_NO_WALK_M = 1.5;
/** A sign beside a road with no kerb stands this far from the travelled way, metres. */
export const SIGN_NO_KERB_M = 3.7;
/** A signal head hangs between these heights over the road, metres. */
export const SIGNAL_HEAD_MIN_M = 4.6;
export const SIGNAL_HEAD_MAX_M = 7.8;
/** How far a mast stands past a junction's edge, on its far side, to clear the kerb ramp, metres. */
export const MAST_PAST_JUNCTION_M = 1.5;

/** The kinds of roadside object, highest first: the order in which they take a place. */
export const ROADSIDE_ORDER = [
  'signal',
  'stopSign',
  'tramPole',
  'lamp',
  'powerPole',
  'sign',
  'meter',
  'cabinet',
  'tree',
] as const;
export type RoadsideKind = (typeof ROADSIDE_ORDER)[number];

/** Whether `a` takes its place before `b` and so is the one that stays. */
export function outranks(a: RoadsideKind, b: RoadsideKind): boolean {
  return ROADSIDE_ORDER.indexOf(a) < ROADSIDE_ORDER.indexOf(b);
}

export interface Spot {
  x: number;
  z: number;
}

const CELL_M = 5;
const CELL_BIAS = 4096;

const cellKey = (cx: number, cz: number): number => (cx + CELL_BIAS) * 8192 + (cz + CELL_BIAS);

/** The places already taken, in world metres, indexed so a lookup costs what is near it. */
export class Standing {
  private readonly cells = new Map<number, Spot[]>();
  private n = 0;

  add(x: number, z: number): void {
    const key = cellKey(Math.floor(x / CELL_M), Math.floor(z / CELL_M));
    const here = this.cells.get(key);
    if (here) here.push({ x, z });
    else this.cells.set(key, [{ x, z }]);
    this.n++;
  }

  addAll(spots: readonly Spot[]): this {
    for (const s of spots) this.add(s.x, s.z);
    return this;
  }

  get size(): number {
    return this.n;
  }

  /** A copy that takes more places without changing this one. */
  clone(): Standing {
    const copy = new Standing();
    for (const here of this.cells.values()) for (const s of here) copy.add(s.x, s.z);
    return copy;
  }

  /** Whether no taken place lies within `gap` of (x, z). */
  isFree(x: number, z: number, gap: number = OBJECT_GAP_M): boolean {
    const reach = Math.ceil(gap / CELL_M);
    const cx = Math.floor(x / CELL_M);
    const cz = Math.floor(z / CELL_M);
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dx = -reach; dx <= reach; dx++) {
        for (const s of this.cells.get(cellKey(cx + dx, cz + dz)) ?? []) {
          if (Math.hypot(s.x - x, s.z - z) < gap) return false;
        }
      }
    }
    return true;
  }
}

/** A bus stop as the roadside keeps clear of it: its tile and which kerb (0 the low side, 1 the high). */
export interface StopSite {
  x: number;
  z: number;
  side: 0 | 1;
}

/** What a place may not be: a drive's tile, or a bus stop's span. */
export interface KeepClear {
  /** Whether the world point is on a drive or inside a stop's span, widened by `margin` metres along the span. */
  blocks(x: number, z: number, margin?: number): boolean;
}

/** Nothing is blocked. */
export const KEEP_CLEAR_NONE: KeepClear = { blocks: () => false };

/**
 * The places a drive or a bus stop holds clear. A drive takes its whole tile
 * (`drives`, keyed by `tileKeyOf`). A stop takes its kerb's side of its tile,
 * `spanHalfM` either side of the tile's middle along the run; `axisOf` says
 * which world axis a tile's street is crossed by (its kerbs lie along it).
 */
export function keepClearOf(
  drives: ReadonlySet<number> | undefined,
  stops: readonly StopSite[],
  spanHalfM: number,
  axisOf: (tx: number, tz: number) => 'x' | 'z',
  tileKeyOf: (tx: number, tz: number) => number,
): KeepClear {
  if ((!drives || drives.size === 0) && stops.length === 0) return KEEP_CLEAR_NONE;
  const sides = new Map<number, Set<-1 | 1>>();
  for (const stop of stops) {
    const key = tileKeyOf(stop.x, stop.z);
    const here = sides.get(key) ?? new Set<-1 | 1>();
    here.add(stop.side === 0 ? -1 : 1);
    sides.set(key, here);
  }
  return {
    blocks(x, z, margin = 0) {
      const tx = worldToTile(x);
      const tz = worldToTile(z);
      const key = tileKeyOf(tx, tz);
      if (drives?.has(key)) return true;
      const here = sides.get(key);
      if (!here) return false;
      const axis = axisOf(tx, tz);
      const across = axis === 'x' ? x - tileToWorld(tx) : z - tileToWorld(tz);
      const along = axis === 'x' ? z - tileToWorld(tz) : x - tileToWorld(tx);
      const side: -1 | 1 = across < 0 ? -1 : 1;
      return here.has(side) && Math.abs(along) < spanHalfM + margin;
    },
  };
}

/** What a placer is told of the roadside it is laying: the places held clear, and the places taken. */
export interface Roadside {
  clear: KeepClear;
  taken: Standing;
}

/** Whether a place is free: off every drive and stop span, and a gap from every object taken. */
export function placeIsFree(side: Roadside, x: number, z: number, gap = OBJECT_GAP_M): boolean {
  return !side.clear.blocks(x, z) && side.taken.isFree(x, z, gap);
}

/** Offsets along a strip, nearest the base place first: 0, +step, -step, +2 step, and so on, to `limit`. */
export function alongOffsets(limit: number, step = 0.5): number[] {
  const out = [0];
  for (let k = 1; k * step <= limit + 1e-9; k++) out.push(k * step, -k * step);
  return out;
}

/** The first offset along a strip at which `free` holds, or null where none does. */
export function firstFreeAlong(
  free: (along: number) => boolean,
  limit: number,
  step = 0.5,
): number | null {
  for (const along of alongOffsets(limit, step)) if (free(along)) return along;
  return null;
}

/** How far an object may slide along its own tile's strip before it leaves the tile. */
export const SLIDE_LIMIT_M = TILE_METERS / 2 - 1;
