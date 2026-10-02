/**
 * Water pipes: the network that carries water and sewage where a street does
 * not.
 *
 * A pipe is to water what the power line is to electricity. It is not a road:
 * nothing drives along it and it has no tier. It conducts between its own
 * tiles and into any road or building footprint it touches, which is what
 * joins a pumping station on the shore, a drain pipe at the water's edge or a
 * lot down an unmade lane to the mains. One pipe carries both the water going
 * out and the sewage coming back.
 *
 * Pure logic over the grid layer; the conduction itself lives in
 * src/sim/network.ts, which walks this layer alongside the roads.
 */

import type { GridState, TilePoint } from '../shared/types';

/** The subset of the grid a pipe edit reads and writes. */
export interface WaterPipeGridSource {
  readonly size: number;
  readonly water: Uint8Array;
  readonly waterPipe: Uint8Array;
  readonly buildingId: Uint32Array;
}

const indexOf = (size: number, x: number, z: number): number => z * size + x;

const inBoundsOf = (size: number, x: number, z: number): boolean =>
  x >= 0 && z >= 0 && x < size && z < size;

/**
 * Whether a pipe may be laid on this tile. A pipe is buried, so it runs under
 * a road, across a field or through a landfill willingly. It will not cross
 * open water, which the intake and the outfall are the buildings for, and it
 * will not stand on a building's footprint, which has its own connection.
 */
export function canLayPipe(g: WaterPipeGridSource, x: number, z: number): boolean {
  if (!inBoundsOf(g.size, x, z)) return false;
  const i = indexOf(g.size, x, z);
  if (g.water[i] === 1) return false;
  if (g.buildingId[i] !== 0) return false;
  return true;
}

/** Whether a pipe is laid at (x, z); false out of bounds. */
export function pipeAt(g: WaterPipeGridSource, x: number, z: number): boolean {
  if (!inBoundsOf(g.size, x, z)) return false;
  return (g.waterPipe[indexOf(g.size, x, z)] ?? 0) === 1;
}

/**
 * Lays (or pulls up) pipe over `tiles`, returning the ones that actually
 * CHANGED — which is what the caller charges for and what its undo puts back.
 * A tile that already carries what is asked of it is skipped, so dragging back
 * over a run costs nothing and the command stays idempotent.
 */
export function layWaterPipe(
  g: WaterPipeGridSource,
  tiles: readonly TilePoint[],
  on: boolean,
): TilePoint[] {
  const changed: TilePoint[] = [];
  for (const { x, z } of tiles) {
    if (!inBoundsOf(g.size, x, z)) continue;
    const i = indexOf(g.size, x, z);
    const now = (g.waterPipe[i] ?? 0) === 1;
    if (now === on) continue;
    if (on && !canLayPipe(g, x, z)) continue;
    g.waterPipe[i] = on ? 1 : 0;
    changed.push({ x, z });
  }
  return changed;
}

/** Every tile carrying a pipe, row-major — what the overlay draws. */
export function waterPipeTiles(g: WaterPipeGridSource): TilePoint[] {
  const out: TilePoint[] = [];
  for (let z = 0; z < g.size; z++) {
    for (let x = 0; x < g.size; x++) {
      if (g.waterPipe[indexOf(g.size, x, z)] === 1) out.push({ x, z });
    }
  }
  return out;
}

/** How many tiles of pipe the city is paying for. */
export function waterPipeCount(g: Pick<GridState, 'waterPipe'>): number {
  let n = 0;
  for (let i = 0; i < g.waterPipe.length; i++) if (g.waterPipe[i] === 1) n += 1;
  return n;
}
