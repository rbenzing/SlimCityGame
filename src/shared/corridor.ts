/**
 * The two carriageways a corridor is laid as.
 *
 * A road too wide for its tile is not drawn wider — it is laid as two
 * carriageways side by side, each centred on its own tile and each carrying
 * half the road's cross-section. This turns the path a player dragged into the
 * two runs that make one road, and the stored flow byte each tile needs to say
 * which half it is.
 */
import { flowDirection, flowForStep, RoadFlow, stepForFlow, storedFlow } from './types';
import type { CorridorHalf, TilePoint } from './types';

export interface CorridorRuns {
  /**
   * The run the drag traced, at the lower coordinate across the road. It
   * carries the half of the section at the negative offsets, because a marking
   * at offset `o` is drawn at the tile centre plus `o`. That is the low half of
   * the section in world order, which is the driver's left heading north or
   * east and their right heading south or west.
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

/** Whether a step runs ACROSS the way a flow travels rather than along it. */
function acrossFlow(flow: RoadFlow, dx: number, dz: number): boolean {
  const alongX = flow === RoadFlow.East || flow === RoadFlow.West;
  return alongX ? dx === 0 : dz === 0;
}

/**
 * Whether two neighbouring tiles are SEPARATE motorway carriageways lying side
 * by side, rather than one road joining another.
 *
 * A motorway is one carriageway running one way, so two of them alongside each
 * other are two roads, not one wide one, and nothing crosses between them — the
 * only way on or off a motorway is a ramp, which joins it where it merges or
 * diverges ({@link rampJoin}).
 * Anything that counts a tile's neighbours has to ask this, for the same reason
 * it asks {@link corridorPartners}: counted as neighbours, a dual carriageway
 * reads as a junction its whole length.
 *
 * Which way each runs is its stored flow, never its shape. BOTH have to lie
 * across the other's flow: a carriageway arriving at right angles points AT the
 * tile it meets, which is a junction and stays one.
 */
export function sideBySideCarriageways(
  highwayHere: boolean,
  highwayThere: boolean,
  storedHere: number,
  storedThere: number,
  dx: number,
  dz: number,
): boolean {
  if (!highwayHere || !highwayThere) return false;
  const here = flowDirection(storedHere);
  const there = flowDirection(storedThere);
  if (here === RoadFlow.None || there === RoadFlow.None) return false;
  return acrossFlow(here, dx, dz) && acrossFlow(there, -dx, -dz);
}

/**
 * How a ramp tile meets the motorway tile beside it.
 *
 * - `merge` / `diverge`: it joins, at its end or its start, running the way
 *   the motorway runs.
 * - `none`: it is its own road here — the stretch alongside, or an elbow.
 * - `headOn` / `wrongWay`: it would join running across the motorway or
 *   against it. The road tool refuses both; a save that holds one keeps it.
 * - `inline`: the ramp is not beside the motorway but carries on from its end.
 * - `unknown`: one of them never recorded a direction, so nothing can be said.
 */
export type RampJoin = 'merge' | 'diverge' | 'none' | 'headOn' | 'wrongWay' | 'inline' | 'unknown';

/**
 * How a ramp tile meets a motorway tile one step (dx, dz) away from it.
 *
 * A ramp meets a motorway alongside it, never head-on: it bends round and runs
 * beside the motorway the way it goes, and joins at one tile — its END when it
 * is an on-ramp, its START when it is an off-ramp. `arriving` is whether a ramp
 * neighbour's own flow points into this tile, and `ahead` whether a ramp lies
 * one step along this tile's flow; between them they say where the ramp's run
 * begins and ends without reading its shape, which is how an elbow beside the
 * motorway, with a ramp on both sides of it, is told from a start.
 */
export function rampJoin(
  storedRamp: number,
  storedMotorway: number,
  dx: number,
  dz: number,
  arriving: boolean,
  ahead: boolean,
): RampJoin {
  const ramp = flowDirection(storedRamp);
  const motorway = flowDirection(storedMotorway);
  if (ramp === RoadFlow.None || motorway === RoadFlow.None) return 'unknown';
  if (!acrossFlow(motorway, dx, dz)) return 'inline';
  const end = !ahead;
  const start = ahead && !arriving;
  if (!end && !start) return 'none';
  if (ramp === motorway) return end ? 'merge' : 'diverge';
  const { dx: rx, dz: rz } = stepForFlow(ramp);
  return acrossFlow(motorway, rx, rz) ? 'headOn' : 'wrongWay';
}

/**
 * Whether a ramp beside a motorway is an arm of it. Everything but the stretch
 * where it is its own road joins — a head-on ramp too, so a save that already
 * holds one still carries traffic; it is the road tool, not the grid, that
 * refuses to build one.
 */
export function rampJoins(join: RampJoin): boolean {
  return join !== 'none';
}

/**
 * How the ramp tile at (rx, rz) meets the motorway tile at (hx, hz), read from
 * whatever map the caller has: `isRamp` says where a ramp lies, `flowAt` gives
 * a tile's stored flow. Every layer that counts arms asks this, so the grid,
 * the approach walk and the furniture agree on where a ramp joins.
 */
export function rampJoinAround(
  isRamp: (x: number, z: number) => boolean,
  flowAt: (x: number, z: number) => number,
  rx: number,
  rz: number,
  hx: number,
  hz: number,
): RampJoin {
  const own = flowAt(rx, rz);
  const ahead = stepForFlow(flowDirection(own));
  const arriving = NEIGHBOUR_STEPS.some(([dx, dz]) => {
    const px = rx + dx;
    const pz = rz + dz;
    if (!isRamp(px, pz)) return false;
    const step = stepForFlow(flowDirection(flowAt(px, pz)));
    return px + step.dx === rx && pz + step.dz === rz;
  });
  return rampJoin(
    own,
    flowAt(hx, hz),
    hx - rx,
    hz - rz,
    arriving,
    isRamp(rx + ahead.dx, rz + ahead.dz),
  );
}

const NEIGHBOUR_STEPS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;
