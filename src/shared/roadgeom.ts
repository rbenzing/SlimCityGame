/**
 * The geometry of a road segment: a straight line or a quadratic curve between
 * two points, with one control point both end tangents aim at. Shared by the
 * world, which decides what may be built, and later by the tool and the
 * renderer, so every one of them reads the same centre line.
 *
 * Points are stored in whole centimetres and worked in metres. Nothing here
 * calls a trigonometric function: angles are compared by their cosines, so a
 * decision about a curve comes out the same on every machine.
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
