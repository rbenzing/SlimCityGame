/**
 * What a lot beside a cul-de-sac needs of the turning circle it fronts: where
 * the back of the ring's footway is, and the street's mouth on it. A lot's
 * drive and walk run from the lot's front edge to the ring along the line
 * through the circle's centre, and keep clear of the mouth.
 *
 * Pure: metres and radians, no grid and no scene.
 */

const TAU = Math.PI * 2;
/** How finely an edge is sampled when it is cut round the mouth, metres. */
const CLEAR_STEP_M = 0.25;

/** The turning circle as the lots round it see it. */
export interface BulbFront {
  /** The circle's centre, world metres. */
  cx: number;
  cz: number;
  /** The radius of the back of the ring's footway. */
  ringM: number;
  /** Where the mouth begins round the ring, as the world angle `atan2(z, x)`, and how far it runs, signed. */
  mouthFrom: number;
  mouthSpan: number;
}

type Point = { x: number; z: number };

/** An angle brought into (-π, π]. */
export function wrapAngle(a: number): number {
  let t = a % TAU;
  if (t > Math.PI) t -= TAU;
  else if (t <= -Math.PI) t += TAU;
  return t;
}

/** The point of the ring's back that the line through the centre and `(x, z)` meets. */
export function bulbRingPoint(front: BulbFront, x: number, z: number): Point {
  const dx = x - front.cx;
  const dz = z - front.cz;
  const d = Math.hypot(dx, dz) || 1;
  return { x: front.cx + (dx / d) * front.ringM, z: front.cz + (dz / d) * front.ringM };
}

/**
 * How far round the ring, in metres, the ring point of `(x, z)` stands from the
 * mouth: 0 inside it.
 */
export function bulbMouthGapM(front: BulbFront, x: number, z: number): number {
  const sign = front.mouthSpan < 0 ? -1 : 1;
  const span = Math.abs(front.mouthSpan);
  const t = wrapAngle((Math.atan2(z - front.cz, x - front.cx) - front.mouthFrom) * sign);
  if (t >= 0 && t <= span) return 0;
  const toNear = t < 0 ? -t : t - span;
  const toFar = t < 0 ? t + TAU - span : TAU - t;
  return Math.min(toNear, toFar) * front.ringM;
}

/** Whether the ring point of `(x, z)` lies at least `clearanceM` from the mouth and not in it. */
export function bulbClears(front: BulbFront, x: number, z: number, clearanceM: number): boolean {
  const gap = bulbMouthGapM(front, x, z);
  return gap > 0 && gap >= clearanceM;
}

/**
 * The stretches of an edge, `at(u)` for `u` in `u0..u1`, whose ring points
 * keep `clearanceM` from the mouth: the runs a strip may be laid across.
 */
export function bulbClearRuns(
  front: BulbFront,
  at: (u: number) => Point,
  u0: number,
  u1: number,
  clearanceM: number,
): [number, number][] {
  const n = Math.max(1, Math.ceil((u1 - u0) / CLEAR_STEP_M));
  const runs: [number, number][] = [];
  let start: number | null = null;
  let last = u0;
  for (let i = 0; i <= n; i++) {
    const u = u0 + ((u1 - u0) * i) / n;
    const p = at(u);
    if (bulbClears(front, p.x, p.z, clearanceM)) {
      if (start === null) start = u;
      last = u;
      continue;
    }
    if (start !== null && last > start) runs.push([start, last]);
    start = null;
  }
  if (start !== null && last > start) runs.push([start, last]);
  return runs;
}

/**
 * A map from `(u, v)` to the world for a strip that runs from an edge, `at(u)`,
 * to the ring's back along the line through the centre: `v` is metres from 0 at
 * the edge to `reachM` at the ring, whatever `u` is, so the strip's ends are
 * slanted toward the centre.
 */
export function bulbFanToWorld(
  front: BulbFront,
  at: (u: number) => Point,
  reachM: number,
): (u: number, v: number) => Point {
  return (u, v) => {
    const p = at(u);
    const q = bulbRingPoint(front, p.x, p.z);
    const f = Math.min(1, Math.max(0, v / reachM));
    return { x: p.x + (q.x - p.x) * f, z: p.z + (q.z - p.z) * f };
  };
}

/** The longest run from the edge `at(u)` to the ring's back across `u0..u1`. */
export function bulbReachM(
  front: BulbFront,
  at: (u: number) => Point,
  u0: number,
  u1: number,
): number {
  let reach = 0;
  for (const u of [u0, (u0 + u1) / 2, u1]) {
    const p = at(u);
    const q = bulbRingPoint(front, p.x, p.z);
    reach = Math.max(reach, Math.hypot(q.x - p.x, q.z - p.z));
  }
  return reach;
}
