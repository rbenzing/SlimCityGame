/**
 * The geometry of a road segment: a straight line or a quadratic curve between
 * two points, with one control point both end tangents aim at. Shared by the
 * world, which decides what may be built, and later by the tool and the
 * renderer, so every one of them reads the same centre line.
 *
 * Points are stored in whole centimetres and worked in metres. No decision
 * here calls a trigonometric function: angles are compared by their cosines,
 * so a decision about a curve comes out the same on every machine. The angles
 * that are produced rather than judged are a heading, for a parcel to be
 * turned by, and the samples round the arc of a bend.
 */

import { ROAD_MAX_SLOPE, TILE_METERS } from './constants';
import type { RoadClassId } from './types';

/** A point in world space, whole centimetres. */
export interface CmPoint {
  x: number;
  z: number;
}

/** A point or direction in world space, metres. */
export interface MPoint {
  x: number;
  z: number;
}

export interface SegmentGeom {
  a: CmPoint;
  b: CmPoint;
  /** The point both end tangents aim at, or null for a straight segment. */
  control: CmPoint | null;
}

const CM_PER_M = 100;
/** The spacing the centre line is sampled at, metres. */
export const SAMPLE_STEP_M = 1;
/** A segment is at least half a tile long. */
export const MIN_SEGMENT_M = TILE_METERS / 2;
/** Two roads meeting at a node are at least this far apart. */
export const MIN_ARM_ANGLE_DEG = 30;
/** A ramp meets a motorway within this angle of it. */
export const MAX_MERGE_ANGLE_DEG = 20;
/** At most this many roads meet at one node. */
export const MAX_ARMS = 6;

/** cos(30°) and cos(20°), written out so that no trigonometry runs at all. */
const COS_MIN_ARM_ANGLE = 0.8660254037844387;
const COS_MAX_MERGE_ANGLE = 0.9396926207859084;

/**
 * The tightest centre-line radius each class may curve at, metres. The game's
 * own choice — see road-network.md — standing in for tables the repository
 * does not hold.
 */
export const MIN_CURVE_RADIUS_M: Readonly<Record<RoadClassId, number>> = {
  dirt: 30,
  alley: 30,
  local: 40,
  oneWay: 40,
  urban: 50,
  collector: 60,
  rural: 80,
  arterial: 80,
  ramp: 80,
  divided: 120,
  rail: 150,
  highway: 200,
};

const toM = (p: CmPoint): MPoint => ({ x: p.x / CM_PER_M, z: p.z / CM_PER_M });

/** A tile's centre along one axis, in whole centimetres. */
export const tileCentreCm = (t: number): number => (t * TILE_METERS + TILE_METERS / 2) * CM_PER_M;

/** The tile a point along one axis lies in. */
export const tileOfCm = (cm: number): number => Math.floor(cm / CM_PER_M / TILE_METERS);

/** Whether a point is exactly a tile centre. */
export function isTileCentre(p: CmPoint): boolean {
  return p.x === tileCentreCm(tileOfCm(p.x)) && p.z === tileCentreCm(tileOfCm(p.z));
}

/**
 * Whether a segment is one the grid holds: straight, between two tile
 * centres on one row or column.
 */
export function isGridSegment(g: SegmentGeom): boolean {
  if (g.control !== null) return false;
  if (!isTileCentre(g.a) || !isTileCentre(g.b)) return false;
  return g.a.x === g.b.x || g.a.z === g.b.z;
}

/** The centre line at parameter t in [0, 1], metres. */
export function pointAt(g: SegmentGeom, t: number): MPoint {
  const a = toM(g.a);
  const b = toM(g.b);
  if (g.control === null) return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
  const c = toM(g.control);
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    z: u * u * a.z + 2 * u * t * c.z + t * t * b.z,
  };
}

/** The derivative of the centre line at t, metres per unit t. */
function derivativeAt(g: SegmentGeom, t: number): MPoint {
  const a = toM(g.a);
  const b = toM(g.b);
  if (g.control === null) return { x: b.x - a.x, z: b.z - a.z };
  const c = toM(g.control);
  return {
    x: 2 * (1 - t) * (c.x - a.x) + 2 * t * (b.x - c.x),
    z: 2 * (1 - t) * (c.z - a.z) + 2 * t * (b.z - c.z),
  };
}

const lengthOf = (v: MPoint): number => Math.sqrt(v.x * v.x + v.z * v.z);

function unit(v: MPoint): MPoint {
  const l = lengthOf(v);
  return l === 0 ? { x: 0, z: 0 } : { x: v.x / l, z: v.z / l };
}

/** A sample of the centre line: where it is, and how far along. */
export interface CentreSample extends MPoint {
  t: number;
  /** Distance from the first end along the centre line, metres. */
  s: number;
}

/**
 * The centre line sampled no more than `SAMPLE_STEP_M` apart, both ends
 * included. The count comes from the control polygon, which is never shorter
 * than the curve, so the spacing never exceeds the step.
 */
export function sampleCentreLine(g: SegmentGeom): CentreSample[] {
  const a = toM(g.a);
  const b = toM(g.b);
  const c = g.control === null ? null : toM(g.control);
  const polygon =
    c === null
      ? lengthOf({ x: b.x - a.x, z: b.z - a.z })
      : lengthOf({ x: c.x - a.x, z: c.z - a.z }) + lengthOf({ x: b.x - c.x, z: b.z - c.z });
  const count = Math.max(1, Math.ceil(polygon / SAMPLE_STEP_M));
  const out: CentreSample[] = [];
  let s = 0;
  let prev: MPoint | null = null;
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const p = pointAt(g, t);
    if (prev !== null) s += lengthOf({ x: p.x - prev.x, z: p.z - prev.z });
    out.push({ x: p.x, z: p.z, t, s });
    prev = p;
  }
  return out;
}

/** The segment's length along its centre line, metres. */
export function segmentLengthM(g: SegmentGeom): number {
  const samples = sampleCentreLine(g);
  return samples[samples.length - 1]!.s;
}

/**
 * The unit direction a segment leaves one of its ends in, pointing away from
 * the node along the road.
 */
export function leavingDirection(g: SegmentGeom, end: 'a' | 'b'): MPoint {
  if (end === 'a') {
    const d = derivativeAt(g, 0);
    return unit(lengthOf(d) === 0 ? derivativeAt(g, 0.5) : d);
  }
  const d = derivativeAt(g, 1);
  const v = lengthOf(d) === 0 ? derivativeAt(g, 0.5) : d;
  return unit({ x: -v.x, z: -v.z });
}

/**
 * The road's direction at t, radians about +Y: 0 is +X, with z the second
 * axis. Where the tangent vanishes (a control point on an end) the direction
 * at the middle stands in, as it does for `leavingDirection`.
 */
export function headingAt(g: SegmentGeom, t: number): number {
  const d = derivativeAt(g, t);
  const v = lengthOf(d) === 0 ? derivativeAt(g, 0.5) : d;
  return Math.atan2(v.z, v.x);
}

/** A sample of a kerb line: where it is, how far along the kerb, and the road's heading there. */
export interface KerbSample extends MPoint {
  /** Distance from the first end along the kerb, metres. */
  s: number;
  heading: number;
}

/**
 * One kerb of the road: the centre samples offset square to the tangent by
 * `halfWidthM`, to the left of the direction of travel for side 1 and to the
 * right for side -1. Arc length runs along the kerb itself, so an outer kerb
 * is longer than the centre line and an inner one shorter.
 */
export function kerbLine(g: SegmentGeom, side: 1 | -1, halfWidthM: number): KerbSample[] {
  const out: KerbSample[] = [];
  let s = 0;
  let prev: MPoint | null = null;
  for (const c of sampleCentreLine(g)) {
    const heading = headingAt(g, c.t);
    const p = {
      x: c.x - side * halfWidthM * Math.sin(heading),
      z: c.z + side * halfWidthM * Math.cos(heading),
    };
    if (prev !== null) s += lengthOf({ x: p.x - prev.x, z: p.z - prev.z });
    out.push({ x: p.x, z: p.z, s, heading });
    prev = p;
  }
  return out;
}

/**
 * The centre line's tightest radius, metres: |B'|³ / |B' × B''| at its worst
 * point, sampled along the curve. A straight segment has none, so Infinity.
 */
export function tightestRadiusM(g: SegmentGeom): number {
  if (g.control === null) return Infinity;
  const a = toM(g.a);
  const b = toM(g.b);
  const c = toM(g.control);
  const dd = { x: 2 * (a.x - 2 * c.x + b.x), z: 2 * (a.z - 2 * c.z + b.z) };
  let tightest = Infinity;
  const steps = 256;
  for (let i = 0; i <= steps; i++) {
    const d = derivativeAt(g, i / steps);
    const cross = Math.abs(d.x * dd.z - d.z * dd.x);
    if (cross === 0) continue;
    const speed = lengthOf(d);
    tightest = Math.min(tightest, (speed * speed * speed) / cross);
  }
  return tightest;
}

/** Whether two unit directions leaving one node are at least the minimum angle apart. */
export function wideEnoughApart(u: MPoint, v: MPoint): boolean {
  return u.x * v.x + u.z * v.z <= COS_MIN_ARM_ANGLE;
}

/** Whether two unit directions are within the merge angle of each other. */
export function withinMergeAngle(u: MPoint, v: MPoint): boolean {
  return u.x * v.x + u.z * v.z >= COS_MAX_MERGE_ANGLE;
}

/**
 * Every tile the road's full cross-section overlaps, `halfWidthM` either side
 * of the centre line: the tiles within that distance of any sample, which with
 * samples a metre apart misses nothing wider than a metre.
 */
export function footprintTiles(g: SegmentGeom, halfWidthM: number, size: number): number[] {
  const tiles = new Set<number>();
  const reach = halfWidthM + SAMPLE_STEP_M / 2;
  for (const p of sampleCentreLine(g)) {
    const x0 = Math.max(0, Math.floor((p.x - reach) / TILE_METERS));
    const x1 = Math.min(size - 1, Math.floor((p.x + reach) / TILE_METERS));
    const z0 = Math.max(0, Math.floor((p.z - reach) / TILE_METERS));
    const z1 = Math.min(size - 1, Math.floor((p.z + reach) / TILE_METERS));
    for (let tz = z0; tz <= z1; tz++) {
      for (let tx = x0; tx <= x1; tx++) {
        const dx = Math.max(tx * TILE_METERS - p.x, 0, p.x - (tx + 1) * TILE_METERS);
        const dz = Math.max(tz * TILE_METERS - p.z, 0, p.z - (tz + 1) * TILE_METERS);
        if (dx * dx + dz * dz <= reach * reach) tiles.add(tz * size + tx);
      }
    }
  }
  return [...tiles].sort((p, q) => p - q);
}

/** Whether every sample lies on the map. */
export function onMap(g: SegmentGeom, size: number): boolean {
  const extent = size * TILE_METERS;
  return sampleCentreLine(g).every((p) => p.x >= 0 && p.z >= 0 && p.x < extent && p.z < extent);
}

/**
 * Whether the centre line climbs more than a road may: `ROAD_MAX_SLOPE` over
 * any 20 m, read as a gradient between successive samples of the ground.
 */
export function tooSteep(g: SegmentGeom, groundAt: (x: number, z: number) => number): boolean {
  const samples = sampleCentreLine(g);
  const grade = ROAD_MAX_SLOPE / TILE_METERS;
  for (let i = 1; i < samples.length; i++) {
    const p = samples[i - 1]!;
    const q = samples[i]!;
    const run = q.s - p.s;
    if (run === 0) continue;
    if (Math.abs(groundAt(q.x, q.z) - groundAt(p.x, p.z)) > grade * run + 1e-9) return true;
  }
  return false;
}

/** A bend, or a junction, takes at most this share of a segment's length at each end. */
export const MAX_SETBACK_SHARE = 0.45;
/** The most one piece of a bend's arc turns, radians (4 degrees). */
const BEND_STEP_RAD = 0.0698;

/** One of the two runs meeting at a bend: a segment, and whether the node is its first end. */
export interface BendRun {
  geom: SegmentGeom;
  atA: boolean;
}

/** A point on a bend's centre line: where it is, how far along, and the unit heading it is driven in. */
export interface BendSample extends MPoint {
  s: number;
  hx: number;
  hz: number;
}

/**
 * Where two runs of one road meet at an angle and the road turns on an arc. The
 * centre line leaves the first run, straight on its tangent where the runs are
 * curved, turns on one circular arc tangent to both, and joins the second.
 */
export interface Bend {
  /** Metres of each run, from the node, that the bend replaces. */
  setback: readonly [number, number];
  /** The centre line from the first run's end to the second's, in the way it is driven. */
  path: BendSample[];
  /** The sample at the middle of the arc, where the two halves of the bend meet. */
  middle: number;
  /** The arc's first and last samples in `path`. */
  arc: readonly [number, number];
  /** The arc's centre, and its radius (0 where the runs meet straight on). */
  centre: MPoint;
  radius: number;
  /** Which way the road turns: 1 toward increasing angle (x toward z), -1 the other way, 0 straight on. */
  turn: 1 | -1 | 0;
}

interface RunPoint extends MPoint {
  /** Unit direction of the run at the point, away from the node. */
  hx: number;
  hz: number;
}

/** The point `s` metres from a run's node along its centre line, and the direction there away from the node. */
function runPoint(run: BendRun, samples: readonly CentreSample[], s: number): RunPoint {
  const total = samples[samples.length - 1]!.s;
  const d = Math.min(total, Math.max(0, run.atA ? s : total - s));
  let i = 0;
  while (i < samples.length - 2 && samples[i + 1]!.s < d) i++;
  const p = samples[i]!;
  const q = samples[i + 1]!;
  const f = q.s === p.s ? 0 : (d - p.s) / (q.s - p.s);
  const t = p.t + (q.t - p.t) * f;
  let v = derivativeAt(run.geom, t);
  if (lengthOf(v) === 0) v = derivativeAt(run.geom, 0.5);
  const h = unit(v);
  const away = run.atA ? 1 : -1;
  return { x: p.x + (q.x - p.x) * f, z: p.z + (q.z - p.z) * f, hx: h.x * away, hz: h.z * away };
}

const cross2 = (ux: number, uz: number, vx: number, vz: number): number => ux * vz - uz * vx;

/**
 * The bend two runs make at their shared node, on an arc of centre-line
 * `radius` metres. The arc's tangent length is what a run gives up of itself;
 * it never takes more than `maxTake` metres of either run, and where a run
 * holds less than the arc wants the arc shrinks to what it holds. Where the
 * runs are curved the arc joins the tangent lines at the ends of what is given
 * up, and the part of those lines left over is driven straight.
 */
export function bendBetween(
  first: BendRun,
  second: BendRun,
  radius: number,
  maxTake: readonly [number, number],
): Bend {
  const sa = sampleCentreLine(first.geom);
  const sb = sampleCentreLine(second.geom);
  const limit = Math.max(0, Math.min(maxTake[0], maxTake[1]));
  const wanted = (dot: number, sin: number): number =>
    1 + dot < 1e-9 ? Infinity : (radius * sin) / (1 + dot);

  /** Both ends of what `take` metres of each run gives up, and where their tangent lines cross. */
  const fit = (take: number) => {
    const e = runPoint(first, sa, take);
    const f = runPoint(second, sb, take);
    // Driven toward the node along the first run, away from it along the second.
    const hp = { x: -e.hx, z: -e.hz };
    const hq = { x: f.hx, z: f.hz };
    const cr = cross2(hp.x, hp.z, hq.x, hq.z);
    const dot = hp.x * hq.x + hp.z * hq.z;
    const d = { x: f.x - e.x, z: f.z - e.z };
    const crossing = Math.abs(cr) < 1e-6 ? null : cross2(d.x, d.z, hq.x, hq.z) / cr;
    const farSide = Math.abs(cr) < 1e-6 ? null : cross2(hp.x, hp.z, d.x, d.z) / cr;
    return { e, f, hp, hq, cr, dot, a: crossing, b: farSide, sin: Math.abs(cr) };
  };

  const node = runPoint(first, sa, 0);
  const nodeIn = { x: -node.hx, z: -node.hz };
  const nodeOut = runPoint(second, sb, 0);
  let take = Math.min(
    limit,
    wanted(
      nodeIn.x * nodeOut.hx + nodeIn.z * nodeOut.hz,
      Math.abs(cross2(nodeIn.x, nodeIn.z, nodeOut.hx, nodeOut.hz)),
    ),
  );
  // The ends of a curved run head a little differently from the node, so the
  // take is refined a few times against the tangents it really meets.
  for (let k = 0; k < 4; k++) {
    const fitted = fit(take);
    const next = Math.min(limit, wanted(fitted.dot, fitted.sin));
    if (Math.abs(next - take) < 1e-4) break;
    take = next;
  }
  const g = fit(take);

  const sample = (x: number, z: number, hx: number, hz: number): BendSample => ({
    x,
    z,
    s: 0,
    hx,
    hz,
  });
  const finish = (path: BendSample[], bend: Omit<Bend, 'path' | 'setback'>): Bend => {
    for (let k = 1; k < path.length; k++) {
      path[k]!.s =
        path[k - 1]!.s + Math.hypot(path[k]!.x - path[k - 1]!.x, path[k]!.z - path[k - 1]!.z);
    }
    return { ...bend, path, setback: [take, take] };
  };

  const straight = g.a === null || g.b === null || g.a < -1e-6 || g.b < -1e-6 || g.sin < 1e-6;
  if (straight) {
    const mid = { x: (g.e.x + g.f.x) / 2, z: (g.e.z + g.f.z) / 2 };
    const chord = unit({ x: g.f.x - g.e.x, z: g.f.z - g.e.z });
    const h = lengthOf(chord) === 0 ? g.hp : chord;
    return finish(
      [
        sample(g.e.x, g.e.z, g.hp.x, g.hp.z),
        sample(mid.x, mid.z, h.x, h.z),
        sample(g.f.x, g.f.z, g.hq.x, g.hq.z),
      ],
      { middle: 1, arc: [1, 1], centre: mid, radius: 0, turn: 0 },
    );
  }

  const a = g.a!;
  const b = g.b!;
  const t = Math.min(a, b, wanted(g.dot, g.sin));
  const r = (t * (1 + g.dot)) / g.sin;
  const turn = g.cr > 0 ? 1 : -1;
  const sweep = Math.atan2(g.sin, g.dot);
  const p1 = { x: g.e.x + g.hp.x * (a - t), z: g.e.z + g.hp.z * (a - t) };
  const centre = { x: p1.x - turn * g.hp.z * r, z: p1.z + turn * g.hp.x * r };
  const steps = 2 * Math.max(1, Math.ceil(sweep / (2 * BEND_STEP_RAD)));
  const path: BendSample[] = a - t > 1e-3 ? [sample(g.e.x, g.e.z, g.hp.x, g.hp.z)] : [];
  const arcFrom = path.length;
  for (let k = 0; k <= steps; k++) {
    const beta = (turn * sweep * k) / steps;
    const c = Math.cos(beta);
    const s = Math.sin(beta);
    const rx = p1.x - centre.x;
    const rz = p1.z - centre.z;
    path.push(
      sample(
        centre.x + rx * c - rz * s,
        centre.z + rx * s + rz * c,
        g.hp.x * c - g.hp.z * s,
        g.hp.x * s + g.hp.z * c,
      ),
    );
  }
  const arcTo = path.length - 1;
  if (b - t > 1e-3) path.push(sample(g.f.x, g.f.z, g.hq.x, g.hq.z));
  return finish(path, {
    middle: arcFrom + steps / 2,
    arc: [arcFrom, arcTo],
    centre,
    radius: r,
    turn,
  });
}

/** The nearest two samples of two centre lines come, metres. */
export function closestApproachM(p: readonly MPoint[], q: readonly MPoint[]): number {
  let best = Infinity;
  for (const a of p) {
    for (const b of q) {
      const dx = a.x - b.x;
      const dz = a.z - b.z;
      const d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
  }
  return Math.sqrt(best);
}

/** Where two straight pieces of centre line cross, strictly inside both. */
function piecesCross(p1: MPoint, p2: MPoint, q1: MPoint, q2: MPoint): boolean {
  const d1 = (q2.x - q1.x) * (p1.z - q1.z) - (q2.z - q1.z) * (p1.x - q1.x);
  const d2 = (q2.x - q1.x) * (p2.z - q1.z) - (q2.z - q1.z) * (p2.x - q1.x);
  const d3 = (p2.x - p1.x) * (q1.z - p1.z) - (p2.z - p1.z) * (q1.x - p1.x);
  const d4 = (p2.x - p1.x) * (q2.z - p1.z) - (p2.z - p1.z) * (q2.x - p1.x);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Whether two sampled centre lines cross anywhere. */
export function centreLinesCross(p: readonly MPoint[], q: readonly MPoint[]): boolean {
  for (let i = 1; i < p.length; i++) {
    for (let j = 1; j < q.length; j++) {
      if (piecesCross(p[i - 1]!, p[i]!, q[j - 1]!, q[j]!)) return true;
    }
  }
  return false;
}
