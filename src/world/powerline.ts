/**
 * Power lines: the network that carries electricity where a road cannot.
 *
 * A line is not a road. Nothing drives along it, it has no tier and no
 * cross-section, and it carries no water. All it does is conduct: between its
 * own tiles, and into any road or building footprint it touches — which is
 * what lets supply reach the lot on a lane that does not conduct, the district
 * a motorway separates, or the pump across the valley.
 *
 * Pure logic over the grid layer; the conduction itself lives in
 * src/sim/network.ts, which walks this layer alongside the roads.
 */

import { POWER_LINE_REFUSALS } from '../shared/placement';
import { isStreetTier, PowerLineKind } from '../shared/types';
import type { BuildingCatalogEntry, Command, GridState, TilePoint } from '../shared/types';

/** The subset of the grid a power-line edit reads and writes. */
export interface PowerLineGridSource {
  readonly size: number;
  readonly water: Uint8Array;
  readonly powerLine: Uint8Array;
  readonly buildingId: Uint32Array;
}

const indexOf = (size: number, x: number, z: number): number => z * size + x;

const inBoundsOf = (size: number, x: number, z: number): boolean =>
  x >= 0 && z >= 0 && x < size && z < size;

/**
 * Whether a line may stand on this tile. A line shares its ground willingly —
 * it runs along a road, across a field, through a landfill — because it is
 * carried on poles rather than laid in the surface. It will not cross open
 * water, which would need a structure it does not have, and it will not stand
 * on a building's footprint, which is already occupied at its own height.
 */
export function canStringLine(g: PowerLineGridSource, x: number, z: number): boolean {
  if (!inBoundsOf(g.size, x, z)) return false;
  const i = indexOf(g.size, x, z);
  if (g.water[i] === 1) return false;
  if (g.buildingId[i] !== 0) return false;
  return true;
}

/** Whether a line stands at (x, z); false out of bounds. */
export function lineAt(g: PowerLineGridSource, x: number, z: number): boolean {
  if (!inBoundsOf(g.size, x, z)) return false;
  return (g.powerLine[indexOf(g.size, x, z)] ?? 0) !== 0;
}

/**
 * Strings (or pulls down) a line over `tiles`, returning the ones that
 * actually CHANGED — which is what the caller charges for and what its undo
 * puts back. A tile that already carries what is asked of it is skipped, so
 * dragging back over a run costs nothing and the command stays idempotent.
 * A tile strung takes `kind`; a tile already holding a line keeps its own.
 */
export function stringPowerLine(
  g: PowerLineGridSource,
  tiles: readonly TilePoint[],
  on: boolean,
  kind: PowerLineKind = PowerLineKind.Strung,
): TilePoint[] {
  const changed: TilePoint[] = [];
  for (const { x, z } of tiles) {
    if (!inBoundsOf(g.size, x, z)) continue;
    const i = indexOf(g.size, x, z);
    const now = (g.powerLine[i] ?? 0) !== 0;
    if (now === on) continue;
    if (on && !canStringLine(g, x, z)) continue;
    g.powerLine[i] = on ? kind : 0;
    changed.push({ x, z });
  }
  return changed;
}

/**
 * The commands that put `tiles` back as they were, given the kind each held
 * before they were pulled down: one restore a kind, so an undo returns old and
 * new lines each to their own byte.
 */
export function restoreLineCommands(
  tiles: readonly TilePoint[],
  kinds: readonly number[],
): Command[] {
  const out: Command[] = [];
  for (const lineKind of [PowerLineKind.Held, PowerLineKind.Strung]) {
    const same = tiles.filter((_, i) => kinds[i] === lineKind);
    if (same.length > 0) out.push({ kind: 'stringPowerLine', tiles: same, on: true, lineKind });
  }
  return out;
}

/** Whether a building feeds the lines that touch it: a generator, or a substation. */
export function feedsLines(entry: Pick<BuildingCatalogEntry, 'utility'> | undefined): boolean {
  const u = entry?.utility;
  return u !== undefined && (u.substation === true || (u.powerMW ?? 0) > 0);
}

/**
 * The sentence refusing a run that would be dead, or null. A run is live when
 * every stretch of new line in it touches a source tile — `sourceAt` says
 * which tiles are a generator's or a substation's footprint — or a line that
 * already stands. A stretch is the new tiles that follow one another.
 */
export function sourceEndRefusal(
  g: PowerLineGridSource,
  tiles: readonly TilePoint[],
  sourceAt: (x: number, z: number) => boolean,
): string | null {
  const key = (x: number, z: number): number => indexOf(g.size, x, z);
  const fresh = new Set<number>();
  for (const { x, z } of tiles) {
    if (inBoundsOf(g.size, x, z) && g.powerLine[key(x, z)] === 0 && canStringLine(g, x, z)) {
      fresh.add(key(x, z));
    }
  }
  const seen = new Set<number>();
  for (const start of fresh) {
    if (seen.has(start)) continue;
    let live = false;
    const stack = [start];
    seen.add(start);
    while (stack.length > 0) {
      const cur = stack.pop()!;
      const x = cur % g.size;
      const z = Math.floor(cur / g.size);
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const nz = z + dz;
        if (!inBoundsOf(g.size, nx, nz)) continue;
        const n = key(nx, nz);
        if (fresh.has(n)) {
          if (!seen.has(n)) {
            seen.add(n);
            stack.push(n);
          }
        } else if (g.powerLine[n] !== 0 || sourceAt(nx, nz)) {
          live = true;
        }
      }
    }
    if (!live) return POWER_LINE_REFUSALS.mustStartAtSource;
  }
  return null;
}

/** The road layers a refusal reads, besides the line layer itself. */
export interface StreetLineGridSource extends PowerLineGridSource {
  readonly roadTier: Uint8Array;
  readonly roadMask: Uint8Array;
}

/** The mask bit a step leaves a tile by, and the one it arrives by: N=1 E=2 S=4 W=8. */
function stepBits(dx: number, dz: number): { leave: number; arrive: number } {
  if (dz < 0) return { leave: 1, arrive: 4 };
  if (dx > 0) return { leave: 2, arrive: 8 };
  if (dz > 0) return { leave: 4, arrive: 1 };
  return { leave: 8, arrive: 2 };
}

/**
 * The sentence refusing a run that strings a line ALONG a sealed street, or
 * null. Two new line tiles that follow one another over sealed street tiles
 * the street itself runs through are along it; a single tile, or a run that
 * crosses at right angles, is not, and neither is a tile that already carries
 * a line. `sealed` says which street tiers are made up, since a cable lies in
 * those and not in a dirt track.
 */
export function alongStreetRefusal(
  g: StreetLineGridSource,
  tiles: readonly TilePoint[],
  sealed: (tier: number) => boolean,
): string | null {
  const isNew = (t: TilePoint): boolean =>
    inBoundsOf(g.size, t.x, t.z) &&
    g.powerLine[indexOf(g.size, t.x, t.z)] === 0 &&
    canStringLine(g, t.x, t.z);
  const street = (t: TilePoint): boolean => {
    const tier = g.roadTier[indexOf(g.size, t.x, t.z)] ?? 0;
    return isStreetTier(tier) && sealed(tier);
  };
  for (let i = 1; i < tiles.length; i++) {
    const a = tiles[i - 1]!;
    const b = tiles[i]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    if (Math.abs(dx) + Math.abs(dz) !== 1 || !isNew(a) || !isNew(b)) continue;
    if (!street(a) || !street(b)) continue;
    const { leave, arrive } = stepBits(dx, dz);
    const maskA = g.roadMask[indexOf(g.size, a.x, a.z)] ?? 0;
    const maskB = g.roadMask[indexOf(g.size, b.x, b.z)] ?? 0;
    if ((maskA & leave) !== 0 && (maskB & arrive) !== 0) return POWER_LINE_REFUSALS.alongStreet;
  }
  return null;
}

/** Every tile carrying a line, row-major — what the renderer stands poles on. */
export function powerLineTiles(g: PowerLineGridSource): TilePoint[] {
  const out: TilePoint[] = [];
  for (let z = 0; z < g.size; z++) {
    for (let x = 0; x < g.size; x++) {
      if (g.powerLine[indexOf(g.size, x, z)] !== 0) out.push({ x, z });
    }
  }
  return out;
}

/** How many tiles of line the city is paying for. */
export function powerLineCount(g: Pick<GridState, 'powerLine'>): number {
  let n = 0;
  for (let i = 0; i < g.powerLine.length; i++) if (g.powerLine[i] !== 0) n += 1;
  return n;
}
