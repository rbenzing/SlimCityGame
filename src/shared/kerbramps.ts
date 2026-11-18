/**
 * Kerb ramps and their detectable warning pads at the two ends of a crossing.
 * A ramp is a rectangle on the footway, square to the crossing, where the kerb
 * is dropped flush and the walk slopes down to the road; the pad lies on it at
 * the kerb. All coordinates are world metres.
 */

/** The kerb's height above the carriageway. */
export const KERB_HEIGHT_M = 0.08;

/** A ramp falls 1 in 12: twelve metres of run for each metre of rise. */
export const RAMP_RUN_PER_RISE = 12;

/** The narrowest a ramp may be: 48 in. */
export const RAMP_MIN_WIDTH_M = 1.22;

/** The detectable warning pad's depth, from the kerb back into the ramp: 24 in. */
export const WARNING_PAD_DEPTH_M = 0.61;

/** The width of each of a crossing's two transverse lines: 12 in. */
export const CROSSING_LINE_WIDTH_M = 0.3;

/**
 * A kerb ramp. `axis` is the axis it falls along: x for a ramp beside a road
 * running north to south. `kerb` is where it meets the road, `back` where it
 * meets the footway at full height, both on that axis; `from` and `to` bound
 * it along the kerb, on the other axis.
 */
export interface KerbRamp {
  axis: 'x' | 'z';
  kerb: number;
  back: number;
  from: number;
  to: number;
}

/** A ramp's width along the kerb: wholly between the crossing's two lines, never under the minimum. */
export function kerbRampWidth(crossingDepth: number): number {
  return Math.max(RAMP_MIN_WIDTH_M, crossingDepth - 2 * CROSSING_LINE_WIDTH_M);
}

/** A ramp's run into the footway: the kerb's height at 1 in 12, never more than the footway is wide. */
export function kerbRampRun(footwayWidth: number): number {
  return Math.min(KERB_HEIGHT_M * RAMP_RUN_PER_RISE, footwayWidth);
}

/** A ramp's rectangle: its extent on x and on z. */
export function kerbRampBox(r: KerbRamp): { x0: number; x1: number; z0: number; z1: number } {
  const lo = Math.min(r.kerb, r.back);
  const hi = Math.max(r.kerb, r.back);
  return r.axis === 'x'
    ? { x0: lo, x1: hi, z0: r.from, z1: r.to }
    : { x0: r.from, x1: r.to, z0: lo, z1: hi };
}

/** How far up the ramp a point lies on its fall axis: 0 at the kerb, 1 at the back, clamped. */
export function kerbRampRise(r: KerbRamp, coordinate: number): number {
  const t = (coordinate - r.kerb) / (r.back - r.kerb);
  return Math.min(1, Math.max(0, t));
}

/** Whether a world point lies on the ramp, within `margin` metres of its edge. */
export function onKerbRamp(r: KerbRamp, x: number, z: number, margin = 0): boolean {
  const b = kerbRampBox(r);
  return x > b.x0 - margin && x < b.x1 + margin && z > b.z0 - margin && z < b.z1 + margin;
}

/** The detectable warning pad on a ramp: its first 0.61 m from the kerb, as wide as the ramp. */
export function warningPadOf(r: KerbRamp): KerbRamp {
  const run = Math.abs(r.back - r.kerb);
  const depth = Math.min(WARNING_PAD_DEPTH_M, run);
  return { ...r, back: r.kerb + Math.sign(r.back - r.kerb) * depth };
}

/** Where a crossing lies over an arm, and the kerbs it meets. */
export interface CrossingKerbs {
  /** The arm runs north to south (its kerbs lie at x offsets) rather than east to west. */
  vertical: boolean;
  /** Which way the arm runs out from the junction on its axis. */
  armSign: 1 | -1;
  /** The junction's centre, world metres. */
  centre: { x: number; z: number };
  /** The crossing's nearer and further edge, metres from the junction's centre along the arm. */
  near: number;
  far: number;
  /** The kerbs the crossing meets, as signed offsets across the arm from the junction's centre. */
  kerbs: readonly number[];
  /** The width of the footway beside the arm. */
  footwayWidth: number;
}

/** The kerb ramp at each kerb a crossing meets, centred on the crossing. */
export function crossingRamps(c: CrossingKerbs): KerbRamp[] {
  const mid = (c.near + c.far) / 2;
  const halfWidth = kerbRampWidth(c.far - c.near) / 2;
  const run = kerbRampRun(c.footwayWidth);
  const along = c.vertical ? c.centre.z : c.centre.x;
  const across = c.vertical ? c.centre.x : c.centre.z;
  const ends = [along + c.armSign * (mid - halfWidth), along + c.armSign * (mid + halfWidth)];
  return c.kerbs.map((k) => ({
    axis: c.vertical ? 'x' : 'z',
    kerb: across + k,
    back: across + k + Math.sign(k) * run,
    from: Math.min(...ends),
    to: Math.max(...ends),
  }));
}
