/**
 * Laying a pipe underground: where a drag's ends snap to, what a run would
 * lay and cost, and what the cursor says the run joins. Pure, so the tool and
 * the tests read the same rules.
 *
 * A street already carries a main, so a run along one lays nothing there and
 * costs nothing; a pipe crossing a street is laid either side of it and joins
 * the main on its way through. A run that reaches nothing at either end is
 * laid all the same, and says so: the building it is for may be next.
 */
import { WATER_PIPE_COST_PER_TILE } from '../shared/constants';
import type { TilePoint } from '../shared/types';

/** What the pipe tool reads of the world beside a run. */
export interface PipeWorld {
  /** A street whose main carries water. */
  mainAt(x: number, z: number): boolean;
  /** A pipe the player laid. */
  pipeAt(x: number, z: number): boolean;
  /** The name of the building standing on the tile, or null. */
  buildingNameAt(x: number, z: number): string | null;
}

/** The plan for a run: the tiles that would be laid, their cost, and what the cursor says. */
export interface PipeRunPlan {
  laid: TilePoint[];
  cost: number;
  note: string;
}

/** Snap order, and the order a tie between neighbours is broken: north, east, south, west. */
const AROUND: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

const isCarrier = (world: PipeWorld, x: number, z: number): boolean =>
  world.mainAt(x, z) || world.pipeAt(x, z);

/**
 * Where a drag's end lands: the tile itself when it already carries water,
 * else the first carrier beside it, so a run begins and ends on the system
 * rather than a tile short of it; a tile with no carrier near stays put.
 */
export function snapPipeEnd(tile: TilePoint, world: PipeWorld): TilePoint {
  if (isCarrier(world, tile.x, tile.z)) return tile;
  for (const [dx, dz] of AROUND) {
    if (isCarrier(world, tile.x + dx, tile.z + dz)) return { x: tile.x + dx, z: tile.z + dz };
  }
  return tile;
}

/** What a run's end joins, in the words the cursor uses, or null for nothing. */
export function pipeJoinAt(tile: TilePoint, world: PipeWorld): string | null {
  for (const [dx, dz] of AROUND) {
    const name = world.buildingNameAt(tile.x + dx, tile.z + dz);
    if (name !== null) return `the ${name}`;
  }
  if (world.mainAt(tile.x, tile.z)) return 'a street main';
  if (world.pipeAt(tile.x, tile.z)) return 'your pipe';
  return null;
}

/** The run's plan: what is laid, what it costs, and what the cursor says it joins. */
export function planPipeRun(path: readonly TilePoint[], world: PipeWorld): PipeRunPlan {
  const laid = path.filter((t) => !world.mainAt(t.x, t.z) && !world.pipeAt(t.x, t.z));
  const cost = laid.length * WATER_PIPE_COST_PER_TILE;
  const first = path[0];
  const last = path[path.length - 1];
  if (!first || !last) return { laid, cost, note: 'Reaches nothing' };
  if (laid.length === 0 && path.every((t) => world.mainAt(t.x, t.z))) {
    return { laid, cost, note: 'The street carries a main' };
  }
  const start = pipeJoinAt(first, world);
  if (path.length === 1) {
    return { laid, cost, note: start === null ? 'Reaches nothing' : `Joins ${start}` };
  }
  const end = pipeJoinAt(last, world);
  if (start === null && end === null) return { laid, cost, note: 'Reaches nothing' };
  const parts: string[] = [];
  if (start !== null) parts.push(`Joins ${start}`);
  if (end !== null && end !== start) parts.push(`${parts.length ? 'reaches' : 'Reaches'} ${end}`);
  else if (end === null) parts.push('reaches nothing');
  return { laid, cost, note: parts.join(' · ') };
}
