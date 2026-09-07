/**
 * The two carriageways a corridor is laid as.
 *
 * A road too wide for its tile is not drawn wider — it is laid as two
 * carriageways side by side, each centred on its own tile and each carrying
 * half the road's cross-section. This turns the path a player dragged into the
 * two runs that make one road, and the stored flow byte each tile needs to say
 * which half it is.
 */
import { flowForStep, RoadFlow, storedFlow } from './types';
import type { CorridorHalf, TilePoint } from './types';

export interface CorridorRuns {
  /**
   * The run the drag traced. It carries the LEFT half of the section — the
   * pieces at the negative offsets — because a marking at offset `o` is drawn
   * at the tile centre plus `o`, so the half holding the negative offsets
   * belongs on the tile at the lower coordinate across the run.
   */
  near: TilePoint[];
  /** One tile across from it, carrying the other half. */
  far: TilePoint[];
  /** The stored flow byte for every tile of each run: direction plus its half. */
  nearFlow: number;
  farFlow: number;
  /** Which way the pair runs. */
  direction: RoadFlow;
}

/**
 * The two runs for a drag, or null where a corridor cannot be laid.
 *
 * Only a STRAIGHT run gets one. The two halves have to lie beside each other
 * ACROSS the way they run for anything downstream to see them as one road —
 * the mask that keeps them from reading as a junction the length of the road
 * tests exactly that. Around a corner they would be diagonal neighbours, which
 * is not a pair, so a bend is refused rather than laid as something that draws
 * as a row of crossroads.
 */
export function corridorRunsFor(path: readonly TilePoint[]): CorridorRuns | null {
  if (path.length < 2) return null;
  const first = path[0]!;
  const last = path[path.length - 1]!;
  const alongX = first.z === last.z;
  const alongZ = first.x === last.x;
  // Both true is a single tile with no direction to it; neither is a bend.
  if (alongX === alongZ) return null;
  for (const t of path) {
    if (alongX ? t.z !== first.z : t.x !== first.x) return null;
  }

  const direction = alongX
    ? flowForStep(Math.sign(last.x - first.x), 0)
    : flowForStep(0, Math.sign(last.z - first.z));
  if (direction === RoadFlow.None) return null;

  // The far half sits one tile up the CROSS axis: across x for a run going
  // north or south, across z for one going east or west.
  const step = alongX ? { dx: 0, dz: 1 } : { dx: 1, dz: 0 };
  return {
    near: path.map((t) => ({ x: t.x, z: t.z })),
    far: path.map((t) => ({ x: t.x + step.dx, z: t.z + step.dz })),
    nearFlow: storedFlow(direction, 'left'),
    farFlow: storedFlow(direction, 'right'),
    direction,
  };
}

/** Every tile a corridor occupies, near run then far — what a preview outlines. */
export function corridorTiles(runs: CorridorRuns): TilePoint[] {
  return [...runs.near, ...runs.far];
}

/**
 * Whether a neighbouring tile is the OTHER HALF of the same corridor rather
 * than a road joining it.
 *
 * Anything that counts a tile's neighbours has to ask this, because the two
 * halves of a corridor touch along their whole length: counted as neighbours,
 * every tile of a six-lane road looks like a junction. Auto-tiling draws it as
 * a chain of crossroads; the network graph puts a node on every step; the
 * approach walk decides no tile is a straight run and so never finds the
 * junction the road actually arrives at.
 *
 * They are partners when both are halves, are OPPOSITE halves, carry the same
 * cross-section, and lie beside each other ACROSS the way the road runs — a
 * road running east-west has its halves stacked in z, one running north-south
 * has them side by side in x.
 */
export function corridorPartners(
  half: CorridorHalf,
  halfThere: CorridorHalf,
  profileId: number,
  profileIdThere: number,
  runs: RoadFlow,
  dx: number,
  dz: number,
): boolean {
  if (half === 'none' || halfThere === 'none' || half === halfThere) return false;
  if (profileId !== profileIdThere) return false;
  const alongX = runs === RoadFlow.East || runs === RoadFlow.West;
  return alongX ? dx === 0 : dz === 0;
}
