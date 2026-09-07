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

import type { GridState, TilePoint } from '../shared/types';

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
  return (g.powerLine[indexOf(g.size, x, z)] ?? 0) === 1;
}

/**
 * Strings (or pulls down) a line over `tiles`, returning the ones that
 * actually CHANGED — which is what the caller charges for and what its undo
 * puts back. A tile that already carries what is asked of it is skipped, so
 * dragging back over a run costs nothing and the command stays idempotent.
 */
export function stringPowerLine(
  g: PowerLineGridSource,
  tiles: readonly TilePoint[],
  on: boolean,
): TilePoint[] {
  const changed: TilePoint[] = [];
  for (const { x, z } of tiles) {
    if (!inBoundsOf(g.size, x, z)) continue;
    const i = indexOf(g.size, x, z);
    const now = (g.powerLine[i] ?? 0) === 1;
    if (now === on) continue;
    if (on && !canStringLine(g, x, z)) continue;
    g.powerLine[i] = on ? 1 : 0;
    changed.push({ x, z });
  }
  return changed;
}

/** Every tile carrying a line, row-major — what the renderer stands poles on. */
export function powerLineTiles(g: PowerLineGridSource): TilePoint[] {
  const out: TilePoint[] = [];
  for (let z = 0; z < g.size; z++) {
    for (let x = 0; x < g.size; x++) {
      if (g.powerLine[indexOf(g.size, x, z)] === 1) out.push({ x, z });
    }
  }
  return out;
}

/** How many tiles of line the city is paying for. */
export function powerLineCount(g: Pick<GridState, 'powerLine'>): number {
  let n = 0;
  for (let i = 0; i < g.powerLine.length; i++) if (g.powerLine[i] === 1) n += 1;
  return n;
}
