/**
 * Which corners of a laid-out car park are drawn round. Pure and drawing-only: it reads the
 * layout and never changes a rect, a stall or a count. Everything is in the lot's own (u, v)
 * metres, carried as x = u, z = v.
 */
import type { LotLayout, LotRect, LotStall } from './lotlayout';
import { lotPaving } from './lotlayout';
import {
  AISLE_TURN_RADIUS_M,
  CAR_PARK_CORNER_RADIUS_M,
  filletPolyline,
  ISLAND_NOSE_RADIUS_M,
  type CornerRadii,
  type Pt,
} from './roundedoutline';

const EPS = 1e-6;
/** How far from a corner a probe point sits to read which of the four quadrants are paved. */
const PROBE_M = 0.01;

export interface IslandShape {
  /** Corner radii of the island's kerb, order north-west, north-east, south-east, south-west in (u, v). */
  kerbRadii: CornerRadii;
}

export interface CarParkShape {
  /** Corner radii of the yard rects that are drawn round, keyed by the layout's own rect objects. */
  rounded: Map<LotRect, CornerRadii>;
  /** Convex pieces of paving laid over planted ground to fill the inside of a turn or an island's nose. */
  fills: Pt[][];
  /** One entry per `layout.islands`, in order. */
  islands: IslandShape[];
}

type Kind = 'yard' | 'hard';
interface Paved {
  rect: LotRect;
  kind: Kind;
}

const overlaps = (a: LotRect, b: LotRect): boolean =>
  a.u0 < b.u1 - EPS && b.u0 < a.u1 - EPS && a.v0 < b.v1 - EPS && b.v0 < a.v1 - EPS;

const holds = (r: LotRect, u: number, v: number): boolean =>
  u > r.u0 && u < r.u1 && v > r.v0 && v < r.v1;

/** The square of side `s` from (u, v) toward the direction (du, dv). */
function box(u: number, v: number, du: number, dv: number, s: number): LotRect {
  return {
    u0: Math.min(u, u + du * s),
    u1: Math.max(u, u + du * s),
    v0: Math.min(v, v + dv * s),
    v1: Math.max(v, v + dv * s),
  };
}

const CORNER_DIRS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

/** The largest car a stall holds, in metres, and the most its yaw wanders from the stall's axis. */
export interface CarBody {
  width: number;
  length: number;
  yawJitter: number;
}

/** The clearance kept between a car's body and a cut corner's arc. */
const CAR_MARGIN_M = 0.02;
/** How far a long car's nose stands from the stall's head end. */
const NOSE_CLEARANCE_M = 0.2;

/** Whether a car standing in the stall keeps every corner of its body on the paving left by cutting corner `k` on `radius`. */
function carStaysOnPaving(stall: LotStall, k: number, radius: number, car: CarBody): boolean {
  const { rect, nose } = stall;
  const alongU = nose[0] === 'u';
  const sign = nose[1] === '+' ? 1 : -1;
  const length = alongU ? rect.u1 - rect.u0 : rect.v1 - rect.v0;
  const back = Math.max(0, (car.length - length) / 2 + NOSE_CLEARANCE_M);
  const cu = (rect.u0 + rect.u1) / 2 - (alongU ? sign * back : 0);
  const cv = (rect.v0 + rect.v1) / 2 - (alongU ? 0 : sign * back);
  const [ou, ov] = CORNER_DIRS[k]!;
  const pu = ou < 0 ? rect.u0 : rect.u1;
  const pv = ov < 0 ? rect.v0 : rect.v1;
  const ax = { u: alongU ? sign : 0, v: alongU ? 0 : sign };
  const cx = { u: pu - ou * radius, v: pv - ov * radius };
  for (const yaw of [-car.yawJitter, car.yawJitter]) {
    for (const a of [-1, 1]) {
      for (const b of [-1, 1]) {
        const lu = (a * car.length) / 2;
        const lv = (b * car.width) / 2;
        // Along the nose axis by lu, across it by lv, then turned by the yaw about the centre.
        const du = ax.u * lu - ax.v * lv;
        const dv = ax.v * lu + ax.u * lv;
        const qu = cu + du * Math.cos(yaw) - dv * Math.sin(yaw);
        const qv = cv + du * Math.sin(yaw) + dv * Math.cos(yaw);
        if (Math.abs(qu - pu) < radius && Math.abs(qv - pv) < radius) {
          if (Math.hypot(qu - cx.u, qv - cx.v) > radius - CAR_MARGIN_M) return false;
        }
      }
    }
  }
  return true;
}

/**
 * Reads the car park's corners. A paved corner against open ground is rounded when the whole
 * corner square is free, on the lot's sides and rear as well as inside it; a corner on the
 * street edge, against the body or a walk, or where another piece of paving carries on, stays
 * square. A stall's paving is cut only where the worst-case `car` body still stands on what is
 * left; berths and trailer bays keep their corners.
 */
export function carParkShape(
  layout: LotLayout,
  rearYardPaved: boolean,
  car?: CarBody,
): CarParkShape {
  const paving = lotPaving(layout);
  const yard = rearYardPaved ? paving.yard : paving.yard.filter((r) => r !== layout.rearYard);
  const paved: Paved[] = [
    ...yard.map((rect) => ({ rect, kind: 'yard' as const })),
    ...paving.concrete.map((rect) => ({ rect, kind: 'hard' as const })),
    ...paving.lane.map((rect) => ({ rect, kind: 'hard' as const })),
  ];
  const { lot } = layout;
  const onBoundary = (u: number, v: number): boolean =>
    Math.abs(u - lot.u0) < EPS ||
    Math.abs(u - lot.u1) < EPS ||
    Math.abs(v - lot.v0) < EPS ||
    Math.abs(v - lot.v1) < EPS;
  const insideLot = (r: LotRect): boolean =>
    r.u0 > lot.u0 - EPS && r.u1 < lot.u1 + EPS && r.v0 > lot.v0 - EPS && r.v1 < lot.v1 + EPS;
  const coveredBy = (r: LotRect, skip?: LotRect): boolean =>
    paved.some((p) => p.rect !== skip && overlaps(p.rect, r));
  const inIsland = (u: number, v: number): boolean => layout.islands.some((i) => holds(i, u, v));

  const rounded = new Map<LotRect, CornerRadii>();
  const roundable = [
    ...layout.aisles,
    ...(layout.throat ? [layout.throat] : []),
    ...(layout.forecourt ? [layout.forecourt] : []),
    ...(rearYardPaved && layout.rearYard ? [layout.rearYard] : []),
  ];
  const r0 = CAR_PARK_CORNER_RADIUS_M;
  // Only the street edge keeps a corner square: the footway runs across it. The lot's sides
  // and rear turn like any other edge, the planted ground inside the lot showing in the cut.
  const onStreetEdge = (v: number): boolean => Math.abs(v - lot.v0) < EPS;
  const stallOf = new Map(layout.stalls.map((s) => [s.rect, s]));
  const cornerRadii = (rect: LotRect): [number, number, number, number] =>
    CORNER_DIRS.map(([ou, ov], k) => {
      const u = ou < 0 ? rect.u0 : rect.u1;
      const v = ov < 0 ? rect.v0 : rect.v1;
      if (onStreetEdge(v)) return 0;
      const free =
        !coveredBy(box(u, v, -ou, -ov, r0), rect) &&
        !coveredBy(box(u, v, ou, ov, r0)) &&
        !coveredBy(box(u, v, ou, -ov, r0)) &&
        !coveredBy(box(u, v, -ou, ov, r0));
      if (!free) return 0;
      const stall = stallOf.get(rect);
      if (!stall) return r0;
      const r = Math.min(r0, (rect.u1 - rect.u0) / 2, (rect.v1 - rect.v0) / 2);
      return car && carStaysOnPaving(stall, k, r, car) ? r : 0;
    }) as [number, number, number, number];
  for (const rect of [...roundable, ...(car ? layout.stalls.map((s) => s.rect) : [])]) {
    const radii = cornerRadii(rect);
    if (radii.some((r) => r > 0)) rounded.set(rect, radii);
  }

  // The inside of a turn: a corner with three paved quadrants and one planted, given room.
  const fills: Pt[][] = [];
  const seen = new Set<string>();
  for (const { rect, kind } of paved) {
    if (kind !== 'yard') continue;
    for (const u of [rect.u0, rect.u1]) {
      for (const v of [rect.v0, rect.v1]) {
        const key = `${u.toFixed(3)},${v.toFixed(3)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (onBoundary(u, v)) continue;
        const quads = CORNER_DIRS.map(([du, dv]) => {
          const hit = paved.find((p) => holds(p.rect, u + du * PROBE_M, v + dv * PROBE_M));
          return { du, dv, hit };
        });
        const open = quads.filter((q) => !q.hit);
        if (open.length !== 1) continue;
        if (quads.some((q) => q.hit?.kind === 'hard')) continue;
        const { du, dv } = open[0]!;
        if (inIsland(u + du * PROBE_M, v + dv * PROBE_M)) continue;
        const room = box(u, v, du, dv, AISLE_TURN_RADIUS_M);
        if (!insideLot(room) || coveredBy(room) || layout.islands.some((i) => overlaps(i, room))) {
          continue;
        }
        fills.push(...noseFill(u, v, du, dv, AISLE_TURN_RADIUS_M));
      }
    }
  }

  // Planted islands: an end that meets an aisle or open ground is a full round nose.
  const islands: IslandShape[] = layout.islands.map((island) => {
    const kerb: [number, number, number, number] = [0, 0, 0, 0];
    const longV = island.v1 - island.v0 >= island.u1 - island.u0;
    const nose = Math.min(
      ISLAND_NOSE_RADIUS_M,
      (longV ? island.u1 - island.u0 : island.v1 - island.v0) / 2,
    );
    CORNER_DIRS.forEach(([ou, ov], k) => {
      const u = ou < 0 ? island.u0 : island.u1;
      const v = ov < 0 ? island.v0 : island.v1;
      // `side` runs across the island's width and `end` out along its length, both away from it.
      const side = longV ? ou : ov;
      const end = longV ? ov : ou;
      const kindAt = (s: number, e: number): Kind | null => {
        const pu = longV ? u + s * PROBE_M : u + e * PROBE_M;
        const pv = longV ? v + e * PROBE_M : v + s * PROBE_M;
        return paved.find((p) => holds(p.rect, pu, pv))?.kind ?? null;
      };
      const onEdge = onStreetEdge(v);
      const beyond = kindAt(-side, end);
      const along = kindAt(side, -end);
      const corner = kindAt(side, end);
      if (onEdge || beyond === 'hard' || along === 'hard') return;
      if (beyond === null) {
        // Open ground past the end: the nose turns against lawn, with nothing to fill.
        kerb[k] = nose;
        return;
      }
      if (along === null) {
        // Lawn beside the island: the nose's corner is lawn too, so only the kerb turns.
        kerb[k] = nose;
        return;
      }
      if (corner !== 'yard') return;
      kerb[k] = nose;
      fills.push(...noseFill(u, v, -ou, -ov, nose));
    });
    return { kerbRadii: kerb };
  });
  return { rounded, fills, islands };
}

/**
 * The paving that turns the planted quadrant at (u, v), toward (du, dv), on `radius`: the
 * corner square less its quarter disc, as triangles fanned from the corner.
 */
function noseFill(u: number, v: number, du: number, dv: number, radius: number): Pt[][] {
  const corner = { x: u, z: v };
  const legs = [{ x: u + du * radius * 2, z: v }, corner, { x: u, z: v + dv * radius * 2 }];
  const arc = filletPolyline(legs, radius).slice(1, -1);
  const out: Pt[][] = [];
  for (let i = 0; i + 1 < arc.length; i++) out.push([corner, arc[i]!, arc[i + 1]!]);
  return out;
}
