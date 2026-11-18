/** Pure outline rounding for paved corners: a rectangle or a polyline with each corner turned on an arc. */
import { ISLAND_WIDTH_M } from './parkingcode';

export interface Pt {
  x: number;
  z: number;
}

export interface RectXZ {
  x: number;
  z: number;
  w: number;
  d: number;
}

/** Corner radii in the order north-west, north-east, south-east, south-west (north is the low-z edge). */
export type CornerRadii = readonly [number, number, number, number];

/** A car park's outer kerb line (m). */
export const CAR_PARK_CORNER_RADIUS_M = 1.5;
/** An island's end: half its width, a full round nose (m). */
export const ISLAND_NOSE_RADIUS_M = ISLAND_WIDTH_M / 2;
/** The inside of a turn between aisles or onto a drive (m). */
export const AISLE_TURN_RADIUS_M = 4.6;
/** The inside of a turn a bus or a lorry makes (m). */
export const SERVICE_TURN_RADIUS_M = 7.6;
/** An alley's bend and where two alleys meet (m). */
export const ALLEY_CORNER_RADIUS_M = 6.1;
/** Where two straight taxiway edges meet (m). */
export const TAXIWAY_FILLET_RADIUS_M = 9.1;

const SMALL_ARC_MAX_RADIUS_M = 2;
const SMALL_ARC_SEGMENTS = 4;
const LARGE_ARC_SEGMENTS = 8;

/** Segments in a quarter-turn arc: 4 up to 2 m of radius, 8 above. */
export function arcSegments(radius: number): number {
  return radius <= SMALL_ARC_MAX_RADIUS_M ? SMALL_ARC_SEGMENTS : LARGE_ARC_SEGMENTS;
}

/**
 * The outline of a rectangle (x, z is its minimum corner) as points wound counter-clockwise
 * (positive shoelace area over x, z). Each corner is an arc tangent to both edges; radius 0
 * keeps it square; a radius over half the shorter side is clamped.
 */
export function roundedRect(rect: RectXZ, radii: number | CornerRadii): Pt[] {
  const { x, z, w, d } = rect;
  const limit = Math.min(w, d) / 2;
  const rs = typeof radii === 'number' ? [radii, radii, radii, radii] : radii;
  const out: Pt[] = [];
  for (let k = 0; k < 4; k++) {
    const r = Math.min(Math.max(rs[k]!, 0), limit);
    const east = k === 1 || k === 2;
    const south = k === 2 || k === 3;
    const cx = east ? x + w - r : x + r;
    const cz = south ? z + d - r : z + r;
    if (r === 0) {
      out.push({ x: east ? x + w : x, z: south ? z + d : z });
      continue;
    }
    const n = arcSegments(r);
    const a0 = Math.PI + (k * Math.PI) / 2;
    for (let i = 0; i <= n; i++) {
      const a = a0 + (i / n) * (Math.PI / 2);
      out.push({ x: cx + r * Math.cos(a), z: cz + r * Math.sin(a) });
    }
  }
  return out;
}

/**
 * Replaces each interior corner of a polyline with a tangent arc. The arc is cut back so it
 * never takes more than half of either leg; collinear points and the two ends are kept.
 */
export function filletPolyline(points: readonly Pt[], radius: number): Pt[] {
  if (points.length < 3 || radius <= 0) return points.map((p) => ({ ...p }));
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const out: Pt[] = [{ ...first }];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!;
    const prev = points[i - 1]!;
    const next = points[i + 1]!;
    const inX = p.x - prev.x;
    const inZ = p.z - prev.z;
    const outX = next.x - p.x;
    const outZ = next.z - p.z;
    const lenIn = Math.hypot(inX, inZ);
    const lenOut = Math.hypot(outX, outZ);
    if (lenIn === 0 || lenOut === 0) {
      out.push({ ...p });
      continue;
    }
    const dix = inX / lenIn;
    const diz = inZ / lenIn;
    const dox = outX / lenOut;
    const doz = outZ / lenOut;
    const cross = dix * doz - diz * dox;
    const dot = dix * dox + diz * doz;
    const turn = Math.atan2(Math.abs(cross), dot);
    if (turn < 1e-6 || Math.PI - turn < 1e-6) {
      out.push({ ...p });
      continue;
    }
    const half = Math.tan(turn / 2);
    const t = Math.min(radius * half, Math.min(lenIn, lenOut) / 2);
    const r = t / half;
    const sign = cross > 0 ? 1 : -1;
    // The centre lies on the inside of the turn, a radius from the entry tangent point.
    const ax = p.x - dix * t;
    const az = p.z - diz * t;
    const cx = ax - sign * diz * r;
    const cz = az + sign * dix * r;
    const n = Math.max(1, Math.ceil((arcSegments(r) * turn) / (Math.PI / 2)));
    for (let s = 0; s <= n; s++) {
      const a = sign * turn * (s / n);
      const rx = ax - cx;
      const rz = az - cz;
      out.push({
        x: cx + rx * Math.cos(a) - rz * Math.sin(a),
        z: cz + rx * Math.sin(a) + rz * Math.cos(a),
      });
    }
  }
  out.push({ ...last });
  return out;
}
