/**
 * The paths a track takes across one tile: for every movement the network
 * allows between two of the tile's arms, a centre line from the middle of one
 * edge to the middle of the other. A straight movement runs edge to edge; a
 * turn sweeps a quarter circle about the tile corner the two arms share, so a
 * bend's lanes and the turns of a junction are concentric arcs.
 *
 * A path is a list of samples, each a point with the unit normal that a lateral
 * offset is measured along, so a rail laid at an offset stays on the same
 * circle as its track's centre and its sleepers fan with the radius. Pure.
 */

export type TrackSide = 'n' | 'e' | 's' | 'w';

/** Local tile frame: the tile centre is the origin, +x east, +z south. */
export interface PathSample {
  x: number;
  z: number;
  /** Unit normal: a lateral offset `d` lands at (x + nx * d, z + nz * d). */
  nx: number;
  nz: number;
  /** Distance along the path from its first sample. */
  s: number;
}

export interface TrackPath {
  from: TrackSide;
  to: TrackSide;
  /** The lane's offset across the vertical arm (x) and, on a straight, across the horizontal one (z). */
  lane: number;
  samples: PathSample[];
  length: number;
  /** Direction of travel at the first sample. */
  startDir: { x: number; z: number };
  /** The circle a turn sweeps; null on a straight. */
  arc: { px: number; pz: number; r: number } | null;
}

const HALF = 10;
/** A turn is laid in this many chords, as the curved road tile is. */
export const TRACK_ARC_SEGMENTS = 12;
/** A straight is sampled at least this often so it can follow a slope. */
const STRAIGHT_STEP_M = 2;

const OPPOSITE: Record<TrackSide, TrackSide> = { n: 's', s: 'n', e: 'w', w: 'e' };
const VERTICAL = (side: TrackSide): boolean => side === 'n' || side === 's';

/** Every pair of arms: the movements a junction of track allows. */
export function allMovements(arms: readonly TrackSide[]): [TrackSide, TrackSide][] {
  const out: [TrackSide, TrackSide][] = [];
  for (let i = 0; i < arms.length; i++)
    for (let j = i + 1; j < arms.length; j++) out.push([arms[i]!, arms[j]!]);
  return out;
}

function straightPath(from: TrackSide, to: TrackSide, lane: number): TrackPath {
  const vertical = VERTICAL(from);
  const sign = from === 'n' || from === 'w' ? 1 : -1;
  const count = Math.ceil((2 * HALF) / STRAIGHT_STEP_M);
  const samples: PathSample[] = [];
  for (let i = 0; i <= count; i++) {
    const s = (i / count) * 2 * HALF;
    const along = sign * (-HALF + s);
    samples.push(
      vertical ? { x: lane, z: along, nx: 1, nz: 0, s } : { x: along, z: lane, nx: 0, nz: 1, s },
    );
  }
  return {
    from,
    to,
    lane,
    samples,
    length: 2 * HALF,
    startDir: vertical ? { x: 0, z: sign } : { x: sign, z: 0 },
    arc: null,
  };
}

/** The quarter circle between a vertical arm and a horizontal one, from the vertical arm's lane `lane`. */
function turnPath(
  vertical: TrackSide,
  horizontal: TrackSide,
  lane: number,
  reverse: boolean,
): TrackPath {
  const px = horizontal === 'e' ? 1 : -1;
  const pz = vertical === 'n' ? -1 : 1;
  const r = HALF - px * lane;
  const samples: PathSample[] = [];
  for (let i = 0; i <= TRACK_ARC_SEGMENTS; i++) {
    const t = ((reverse ? TRACK_ARC_SEGMENTS - i : i) / TRACK_ARC_SEGMENTS) * (Math.PI / 2);
    const ux = -px * Math.cos(t);
    const uz = -pz * Math.sin(t);
    samples.push({
      x: px * HALF + r * ux,
      z: pz * HALF + r * uz,
      nx: -px * ux,
      nz: -px * uz,
      s: (i / TRACK_ARC_SEGMENTS) * r * (Math.PI / 2),
    });
  }
  const first = samples[0]!;
  const next = samples[1]!;
  const d = Math.hypot(next.x - first.x, next.z - first.z);
  return {
    from: reverse ? horizontal : vertical,
    to: reverse ? vertical : horizontal,
    lane,
    samples,
    length: r * (Math.PI / 2),
    startDir: { x: (next.x - first.x) / d, z: (next.z - first.z) / d },
    arc: { px: px * HALF, pz: pz * HALF, r },
  };
}

/**
 * The centre lines of every movement between `arms` in `moves`, once per lane.
 * A turn takes the lane `a` of its vertical arm onto the lane `px * pz * a` of
 * its horizontal one, the lane that lies on the same circle.
 */
export function trackPaths(
  moves: readonly (readonly [TrackSide, TrackSide])[],
  lanes: readonly number[],
): TrackPath[] {
  const out: TrackPath[] = [];
  for (const [a, b] of moves) {
    for (const lane of lanes) {
      if (OPPOSITE[a] === b) out.push(straightPath(a, b, lane));
      else if (VERTICAL(a) !== VERTICAL(b)) {
        const vertical = VERTICAL(a) ? a : b;
        const horizontal = VERTICAL(a) ? b : a;
        out.push(turnPath(vertical, horizontal, lane, !VERTICAL(a)));
      }
    }
  }
  return out;
}

/** The point and unit tangent `s` along a path, from its samples. */
export function pathAt(
  path: TrackPath,
  s: number,
): { x: number; z: number; nx: number; nz: number; tx: number; tz: number } {
  const samples = path.samples;
  let i = 1;
  while (i < samples.length - 1 && samples[i]!.s < s) i++;
  const a = samples[i - 1]!;
  const b = samples[i]!;
  const span = b.s - a.s || 1;
  const f = Math.min(1, Math.max(0, (s - a.s) / span));
  const nx = a.nx + (b.nx - a.nx) * f;
  const nz = a.nz + (b.nz - a.nz) * f;
  const nl = Math.hypot(nx, nz) || 1;
  const tl = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return {
    x: a.x + (b.x - a.x) * f,
    z: a.z + (b.z - a.z) * f,
    nx: nx / nl,
    nz: nz / nl,
    tx: (b.x - a.x) / tl,
    tz: (b.z - a.z) / tl,
  };
}
