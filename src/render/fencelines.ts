/**
 * Where a home's fence really stands once its neighbours are known. A planned
 * fence run is a stretch of the lot's own line; here it is cut back wherever it
 * would enter a neighbour's lot, stand in a road, a neighbour's drive or house,
 * or lie on a line a lower-numbered neighbour already fences. Every cut depends
 * only on the lots present, never on the order they arrived in.
 */

import { type FenceRun, type HouseLotPlan, driveFootprints, lotToWorld } from './houselot';
import type { LotRect } from './houselot';

interface Pt {
  x: number;
  z: number;
}

/** A fence stretch shorter than this is not one sound panel (a 6 ft board panel) and is dropped. */
export const MIN_FENCE_RUN_M = 1.8;
/** Room kept around a neighbour's house and drive. */
const KEEP_CLEAR_M = 0.3;
/** Two fence lines this near and this nearly parallel are one line. */
const SHARED_LINE_M = 0.6;
const PARALLEL_SIN = 0.15;
/** A fence crossing or touching another is cut this far either side of it, across the line. */
const CROSS_CUT_M = 0.15;
const MAX_CROSS_CUT_M = 1.5;
/** A road is looked for under a fence at this spacing. */
const ROAD_STEP_M = 0.5;
/** Lots whose bounds come within this of one another are neighbours. */
const NEIGHBOUR_REACH_M = 1;
const CELL_M = 20;

/** What a lot offers its neighbours' fences, in world metres. */
export interface FenceLot {
  id: number;
  /** Whether the lot's own fence stands (a home going up draws none). */
  draws: boolean;
  outline: Pt[];
  /** The house and drives a neighbour's fence keeps out of, grown by the clearance. */
  blocks: Pt[][];
  /** The planned runs, in the lot's frame. */
  runs: readonly FenceRun[];
  toWorld: (u: number, v: number) => Pt;
  bounds: { x0: number; z0: number; x1: number; z1: number };
}

function corners(toWorld: (u: number, v: number) => Pt, r: LotRect, grow = 0): Pt[] {
  return [
    toWorld(r.u0 - grow, r.v0 - grow),
    toWorld(r.u1 + grow, r.v0 - grow),
    toWorld(r.u1 + grow, r.v1 + grow),
    toWorld(r.u0 - grow, r.v1 + grow),
  ];
}

/** A built home's lot as its neighbours' fences see it. `draws` is false while it is going up. */
export function fenceLotOf(id: number, plan: HouseLotPlan, draws: boolean): FenceLot {
  const toWorld = (u: number, v: number): Pt => lotToWorld(plan.frame, u, v);
  const outline = corners(toWorld, { u0: 0, u1: plan.edgeLenM, v0: 0, v1: plan.lotDepthM });
  const blocks = [plan.body, ...driveFootprints(plan.drives)].map((r) =>
    corners(toWorld, r, KEEP_CLEAR_M),
  );
  const xs = outline.map((p) => p.x);
  const zs = outline.map((p) => p.z);
  return {
    id,
    draws: draws && plan.yard.fence.length > 0,
    outline,
    blocks,
    runs: plan.yard.fence,
    toWorld,
    bounds: { x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs) },
  };
}

type Interval = [number, number];

/** The stretch of the segment P + t·D, 0 ≤ t ≤ len, inside a convex polygon; null where it misses. */
function insideConvex(p: Pt, d: Pt, len: number, poly: readonly Pt[]): Interval | null {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    area += a.x * b.z - b.x * a.z;
  }
  const sign = area >= 0 ? 1 : -1;
  let lo = 0;
  let hi = len;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    // Signed distance from the edge, positive inside.
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const elen = Math.hypot(ex, ez) || 1;
    const nx = (-ez / elen) * sign;
    const nz = (ex / elen) * sign;
    const at0 = (p.x - a.x) * nx + (p.z - a.z) * nz;
    const slope = d.x * nx + d.z * nz;
    if (Math.abs(slope) < 1e-12) {
      if (at0 <= 0) return null;
      continue;
    }
    const t = -at0 / slope;
    if (slope > 0) lo = Math.max(lo, t);
    else hi = Math.min(hi, t);
    if (lo >= hi) return null;
  }
  return [lo, hi];
}

/** The stretch of a run that stands on, or crosses, another fence run. */
function crossCut(p: Pt, d: Pt, len: number, q: Pt, e: Pt, elen: number): Interval | null {
  const sin = d.x * e.z - d.z * e.x;
  const wx = q.x - p.x;
  const wz = q.z - p.z;
  if (Math.abs(sin) < PARALLEL_SIN) {
    if (Math.abs(wx * d.z - wz * d.x) >= SHARED_LINE_M) return null;
    const t0 = wx * d.x + wz * d.z;
    const t1 = t0 + elen * (e.x * d.x + e.z * d.z);
    return [Math.min(t0, t1), Math.max(t0, t1)];
  }
  const t = (wx * e.z - wz * e.x) / sin;
  const s = (wx * d.z - wz * d.x) / sin;
  const w = CROSS_CUT_M;
  if (s < -w || s > elen + w || t < -MAX_CROSS_CUT_M || t > len + MAX_CROSS_CUT_M) return null;
  const half = Math.min(MAX_CROSS_CUT_M, CROSS_CUT_M / Math.abs(sin));
  return [t - half, t + half];
}

/** The stretches of [0, len] left once `cuts` are taken out. */
function remainder(len: number, cuts: Interval[]): Interval[] {
  const out: Interval[] = [];
  let from = 0;
  for (const [c0, c1] of cuts.sort((a, b) => a[0] - b[0])) {
    if (c1 <= from) continue;
    if (c0 > from) out.push([from, Math.min(c0, len)]);
    from = Math.max(from, c1);
    if (from >= len) return out;
  }
  if (from < len) out.push([from, len]);
  return out;
}

/**
 * A lot's fence runs, in its own frame, cut back so none enters a neighbour's
 * lot, house or drive, a road, or a line a lower-numbered neighbour fences,
 * and none shorter than one sound panel is left.
 */
export function trimFence(
  lot: FenceLot,
  neighbours: readonly FenceLot[],
  roadAt: (x: number, z: number) => boolean,
): FenceRun[] {
  const out: FenceRun[] = [];
  for (const run of lot.runs) {
    const alongU = run.v0 === run.v1;
    const lo = alongU ? Math.min(run.u0, run.u1) : Math.min(run.v0, run.v1);
    const hi = alongU ? Math.max(run.u0, run.u1) : Math.max(run.v0, run.v1);
    const line = alongU ? run.v0 : run.u0;
    const at = (t: number): Pt => (alongU ? lot.toWorld(lo + t, line) : lot.toWorld(line, lo + t));
    const len = hi - lo;
    const p = at(0);
    const end = at(len);
    const d = { x: (end.x - p.x) / len, z: (end.z - p.z) / len };

    const cuts: Interval[] = [];
    // Keep to the lot's own outline.
    const own = insideConvex(p, d, len, lot.outline);
    if (!own) continue;
    cuts.push([-1, own[0]], [own[1], len + 1]);
    for (let t = ROAD_STEP_M / 2; t < len; t += ROAD_STEP_M) {
      const s = at(t);
      if (roadAt(s.x, s.z)) cuts.push([t - ROAD_STEP_M / 2, t + ROAD_STEP_M / 2]);
    }
    for (const other of neighbours) {
      const outside = insideConvex(p, d, len, other.outline);
      if (outside) cuts.push(outside);
      for (const block of other.blocks) {
        const hit = insideConvex(p, d, len, block);
        if (hit) cuts.push(hit);
      }
      if (!other.draws || other.id > lot.id) continue;
      for (const r of other.runs) {
        const rAlongU = r.v0 === r.v1;
        const a = rAlongU
          ? other.toWorld(Math.min(r.u0, r.u1), r.v0)
          : other.toWorld(r.u0, Math.min(r.v0, r.v1));
        const b = rAlongU
          ? other.toWorld(Math.max(r.u0, r.u1), r.v0)
          : other.toWorld(r.u0, Math.max(r.v0, r.v1));
        const elen = Math.hypot(b.x - a.x, b.z - a.z);
        if (elen === 0) continue;
        const hit = crossCut(p, d, len, a, { x: (b.x - a.x) / elen, z: (b.z - a.z) / elen }, elen);
        if (hit) cuts.push(hit);
      }
    }
    for (const [t0, t1] of remainder(len, cuts)) {
      if (t1 - t0 < MIN_FENCE_RUN_M) continue;
      out.push(
        alongU
          ? { u0: lo + t0, v0: line, u1: lo + t1, v1: line }
          : { u0: line, v0: lo + t0, u1: line, v1: lo + t1 },
      );
    }
  }
  return out;
}

/** Every lot that draws or could affect a fence, found by the cell its bounds fall in. */
export class FenceBook {
  private readonly lots = new Map<number, FenceLot>();
  private readonly cells = new Map<number, Set<number>>();

  get(id: number): FenceLot | undefined {
    return this.lots.get(id);
  }

  set(lot: FenceLot): void {
    this.remove(lot.id);
    this.lots.set(lot.id, lot);
    for (const key of this.keysOf(lot)) {
      let cell = this.cells.get(key);
      if (!cell) this.cells.set(key, (cell = new Set()));
      cell.add(lot.id);
    }
  }

  remove(id: number): void {
    const lot = this.lots.get(id);
    if (!lot) return;
    for (const key of this.keysOf(lot)) {
      const cell = this.cells.get(key);
      cell?.delete(id);
      if (cell?.size === 0) this.cells.delete(key);
    }
    this.lots.delete(id);
  }

  /** The other lots whose bounds come within a metre of this one's. */
  neighboursOf(lot: FenceLot): FenceLot[] {
    const seen = new Set<number>();
    const out: FenceLot[] = [];
    for (const key of this.keysOf(lot)) {
      for (const id of this.cells.get(key) ?? []) {
        if (id === lot.id || seen.has(id)) continue;
        seen.add(id);
        const other = this.lots.get(id)!;
        const a = lot.bounds;
        const b = other.bounds;
        const m = NEIGHBOUR_REACH_M;
        if (b.x0 > a.x1 + m || b.x1 < a.x0 - m || b.z0 > a.z1 + m || b.z1 < a.z0 - m) continue;
        out.push(other);
      }
    }
    return out;
  }

  private keysOf(lot: FenceLot): number[] {
    const { x0, z0, x1, z1 } = lot.bounds;
    const m = NEIGHBOUR_REACH_M;
    const keys: number[] = [];
    for (let cx = Math.floor((x0 - m) / CELL_M); cx <= Math.floor((x1 + m) / CELL_M); cx++) {
      for (let cz = Math.floor((z0 - m) / CELL_M); cz <= Math.floor((z1 + m) / CELL_M); cz++) {
        keys.push(cx * 100_000 + cz);
      }
    }
    return keys;
  }
}
