/**
 * The two carriageways a corridor is laid as.
 *
 * A road too wide for its tile is not drawn wider — it is laid as two
 * carriageways side by side, each centred on its own tile and each carrying
 * half the road's cross-section. This turns the path a player dragged into the
 * two runs that make one road, and the stored flow byte each tile needs to say
 * which half it is.
 */
import {
  corridorHalfOf,
  flowDirection,
  flowForStep,
  RoadFlow,
  stepForFlow,
  storedFlow,
} from './types';
import type { CorridorHalf, RoadClassId, TilePoint } from './types';

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

/**
 * Whether the median is open between a corridor half at (x, z) and its partner
 * at (x + dx, z + dz): a street crosses the corridor on that row.
 *
 * The halves never join along the road, so without this a street meeting a
 * divided road ends in a T against each half, facing the median, and nothing
 * crosses without an overpass. The median opens where a road that is not a
 * corridor half joins each half from OUTSIDE — one beyond the near half, one
 * beyond the far half, the two in line across the corridor. A street meeting
 * one half only leaves the median shut.
 *
 * A corridor nothing divides (`undivided`, see `isDividedCorridor`) has no
 * median to keep anyone from crossing it, so one road joining either half from
 * outside opens it: a T onto it is a full junction, and the far half is held
 * there as well.
 *
 * `arrivesAt(tx, tz, sx, sz)` answers whether a road that is not a corridor half
 * stands at (tx + sx, tz + sz) and joins (tx, tz) by every other rule; each
 * caller answers it from its own view of the tiles, so the mask and the
 * approach walk ask the same question.
 */
export function medianOpens(
  x: number,
  z: number,
  dx: number,
  dz: number,
  arrivesAt: (tx: number, tz: number, sx: number, sz: number) => boolean,
  undivided: boolean,
): boolean {
  const near = arrivesAt(x, z, -dx, -dz);
  const far = arrivesAt(x + dx, z + dz, dx, dz);
  return undivided ? near || far : near && far;
}

/**
 * The tile a corridor half's partner lies on, or null for a tile that is not a
 * half. The low half is the one at the lower coordinate across the road, so its
 * partner is one tile up the cross axis and the high half's one tile down.
 */
export function partnerTileOf(x: number, z: number, stored: number): TilePoint | null {
  const half = corridorHalfOf(stored);
  const direction = flowDirection(stored);
  if (half === 'none' || direction === RoadFlow.None) return null;
  const s = half === 'left' ? 1 : -1;
  const alongX = direction === RoadFlow.East || direction === RoadFlow.West;
  return alongX ? { x, z: z + s } : { x: x + s, z };
}

/**
 * The tile holding the partner of the corridor half on (x, z), or null where
 * there is no half, or nothing is paired with it. `flowAt` and `profileIdAt`
 * read the ground road of a tile, 0 where there is none or off the grid.
 */
export function corridorPartnerTile(
  x: number,
  z: number,
  flowAt: (x: number, z: number) => number,
  profileIdAt: (x: number, z: number) => number,
): TilePoint | null {
  const stored = flowAt(x, z);
  const p = partnerTileOf(x, z, stored);
  if (!p) return null;
  const paired = corridorPartners(
    corridorHalfOf(stored),
    corridorHalfOf(flowAt(p.x, p.z)),
    profileIdAt(x, z),
    profileIdAt(p.x, p.z),
    flowDirection(stored),
    p.x - x,
    p.z - z,
  );
  return paired ? p : null;
}

export const SPLITS_CORRIDOR = 'That would split a corridor';

/**
 * Why laying a road would take a corridor half away from its partner, or null.
 *
 * `laid` is every tile whose road this changes, replaced or re-laid running
 * another way, with the stored flow each will carry; `pairedWith` answers
 * {@link corridorPartnerTile} for the grid as it stands. A half may change when
 * its partner changes with it, or when it is re-laid as a half paired with the
 * same tile, since a corridor is laid one run per half and its other half
 * follows. Anything else leaves the partner as half a road with nothing
 * beside it: a corridor dragged one row off the one already there pairs the row
 * they share with a new row, and the other old row is left on its own.
 */
export function corridorSplitRefusal(
  laid: readonly TilePoint[],
  flows: readonly number[],
  pairedWith: (x: number, z: number) => TilePoint | null,
): string | null {
  const key = (t: TilePoint): string => `${t.x},${t.z}`;
  const laying = new Set(laid.map(key));
  for (let i = 0; i < laid.length; i++) {
    const t = laid[i]!;
    const partner = pairedWith(t.x, t.z);
    if (!partner || laying.has(key(partner))) continue;
    const next = partnerTileOf(t.x, t.z, flows[i] ?? RoadFlow.None);
    if (next && next.x === partner.x && next.z === partner.z) continue;
    return SPLITS_CORRIDOR;
  }
  return null;
}

/** One layer of roads as a bulldoze reads it: 0 where that layer has none. */
export interface RoadLayerReader {
  flowAt(x: number, z: number): number;
  profileIdAt(x: number, z: number): number;
}

export interface BulldozeReach {
  /** Tiles whose road passing over goes. */
  over: TilePoint[];
  /** Tiles cleared at grade: the road there, and whatever else stands on them. */
  ground: TilePoint[];
  /** Why the bulldoze cannot go ahead, or null. */
  refusal: string | null;
}

/**
 * What a bulldoze over `tiles` takes.
 *
 * On each tile it takes the road on top: the one passing over where there is
 * one, otherwise everything at grade. A corridor half it takes brings its
 * partner with it, on the same layer, so it never leaves half a road with
 * nothing beside it. A half at grade whose partner has a road passing over it
 * cannot be taken that way, because a bulldoze on the partner takes the road
 * on top and leaves the half beneath, so it is refused. `overOnly` is the undo
 * of a road laid under a raised one, which takes only what passes over.
 */
export function bulldozeReach(
  tiles: readonly TilePoint[],
  over: RoadLayerReader,
  ground: RoadLayerReader,
  overOnly = false,
): BulldozeReach {
  const key = (t: TilePoint): string => `${t.x},${t.z}`;
  const crossed = (t: TilePoint): boolean => over.profileIdAt(t.x, t.z) !== 0;
  const withPartners = (from: TilePoint[], layer: RoadLayerReader): TilePoint[] => {
    const seen = new Set(from.map(key));
    const all = [...from];
    for (const t of from) {
      const p = corridorPartnerTile(t.x, t.z, layer.flowAt, layer.profileIdAt);
      if (p && !seen.has(key(p))) {
        seen.add(key(p));
        all.push(p);
      }
    }
    return all;
  };
  const overTiles = withPartners(tiles.filter(crossed), over);
  if (overOnly) return { over: overTiles, ground: [], refusal: null };
  const groundTiles = withPartners(
    tiles.filter((t) => !crossed(t)),
    ground,
  );
  const refusal = groundTiles.some(crossed) ? SPLITS_CORRIDOR : null;
  return { over: overTiles, ground: groundTiles, refusal };
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

/**
 * Why laying `laid` as class `laidClass`, each tile with the stored flow in
 * `flows`, would make a ramp meet a motorway head-on or against its traffic —
 * or null when every ramp it touches meets one alongside, the way it runs.
 * `classAt` and `flowAt` describe the roads already there; the laid tiles
 * override them, so the drag is judged as it will stand once it lands. The
 * road tool and the world both ask this, so neither lays what the other refuses.
 */
export function rampMeetingRefusal(
  laid: readonly TilePoint[],
  flows: readonly number[],
  laidClass: RoadClassId,
  classAt: (x: number, z: number) => RoadClassId | null,
  flowAt: (x: number, z: number) => number,
): string | null {
  if (laidClass !== 'ramp' && laidClass !== 'highway') return null;
  const planned = new Map(laid.map((t, i) => [`${t.x},${t.z}`, flows[i] ?? 0]));
  const classOf = (x: number, z: number): RoadClassId | null =>
    planned.has(`${x},${z}`) ? laidClass : classAt(x, z);
  const flowOf = (x: number, z: number): number => planned.get(`${x},${z}`) ?? flowAt(x, z);
  const isRamp = (x: number, z: number): boolean => classOf(x, z) === 'ramp';
  for (const t of laid) {
    for (const [dx, dz] of NEIGHBOUR_STEPS) {
      const nx = t.x + dx;
      const nz = t.z + dz;
      if (planned.has(`${nx},${nz}`)) continue;
      const theirs = classOf(nx, nz);
      const join =
        laidClass === 'ramp' && theirs === 'highway'
          ? rampJoinAround(isRamp, flowOf, t.x, t.z, nx, nz)
          : laidClass === 'highway' && theirs === 'ramp'
            ? rampJoinAround(isRamp, flowOf, nx, nz, t.x, t.z)
            : null;
      if (join === 'headOn') {
        return 'A ramp meets a highway alongside it: bend it to run beside the highway before it joins';
      }
      if (join === 'wrongWay') return 'A ramp joins a highway running the same way, not against it';
    }
  }
  return null;
}

const NEIGHBOUR_STEPS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;
