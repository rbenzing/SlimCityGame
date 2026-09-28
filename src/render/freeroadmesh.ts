/**
 * Roads off the grid, drawn from the network: each segment's cross-section
 * swept along its centre line, square to it, and each node where roads meet
 * meshed from the roads meeting there. Grid roads still draw through the tile
 * renderer; this draws only what the tiles cannot hold, in the same colours,
 * at the same heights and with the same markings plan, so the two read as one
 * road system.
 *
 * Where a road off the grid meets a grid road, the whole grid tile is this
 * renderer's: the tile renderer draws nothing of it, and each grid road
 * meeting there is carried from the junction to the tile's edge, where the
 * tile beside it takes over.
 *
 * Offsets across a road off the grid are measured from its centre line,
 * positive to the right of the direction it was drawn in, first end to
 * second: the frame a tile road drawn north is laid in, which is the frame
 * the markings plan returns its offsets in. A grid road is laid in world
 * order, as the tile renderer lays it, with offsets growing east and south.
 */

import * as THREE from 'three';
import { LAMP_SPACING_TILES, TILE_METERS } from '../shared/constants';
import { leavingDirection, sampleCentreLine } from '../shared/roadgeom';
import type { MPoint } from '../shared/roadgeom';
import {
  CARRIAGEWAY_KINDS,
  carriagewayHalfWidthOf,
  hasKerbs,
  isPaved,
  kerbReturnRadiusOf,
  kerbWidthOf,
  presetProfileForTier,
  worldOrderedProfile,
} from '../shared/roadprofile';
import { RoadFlow } from '../shared/types';
import type { RoadNet, RoadProfile, RoadTier, TilePoint } from '../shared/types';
import { isFreeSegment, isGridNode, segmentGeom, segmentsAt } from '../world/roadnet';
import { lampLateralOffset, tierGetsLamp } from './lamps';
import type { LampStand } from './lamps';
import { markingPlan } from './roadmarkings';
import type { MarkingLine, MarkingPlan } from './roadmarkings';
import {
  BIKE_LANE_PAINT_COLOR,
  BUS_LANE_PAINT_COLOR,
  CURB_Y_OFFSET,
  END_CAP_SEGMENTS,
  HIGHWAY_BARRIER_COLOR,
  HIGHWAY_BARRIER_RAISE,
  MARKING_COLOR,
  MARK_Y_OFFSET,
  MEDIAN_GRASS_COLOR,
  MEDIAN_RAISE,
  PAINT_HALF_WIDTH_M,
  ROAD_Y_OFFSET,
  SIDEWALK_COLOR,
  YELLOW_MARKING_COLOR,
  dashSegments,
  roadNightDim,
  surfaceColor,
} from './roadsmesh';

type Rgb = readonly [number, number, number];
type SurfaceAt = (x: number, z: number) => number;
type ProfileFor = (id: number) => RoadProfile | null;

/** Triangles as flat position and colour arrays, three floats a vertex. */
export interface RoadSoup {
  positions: number[];
  colors: number[];
}

/** The widest a cell of road surface is laid across, so it follows the ground. */
const MAX_CELL_ACROSS_M = 2;
/** Coloured bands sit between the surface and the paint on it. */
const BAND_Y_OFFSET = MARK_Y_OFFSET - 0.004;
/** The kerb face is a shade darker than the footway it holds up. */
const KERB_FACE_SHADE = 0.8;
/** Below this sine two roads leaving a node count as one running straight on. */
const STRAIGHT_ON_SIN = 0.17;
/** A junction takes at most this share of a segment's length at each end. */
const MAX_SETBACK_SHARE = 0.45;
/** How many pieces a kerb return is drawn in. */
const CORNER_STEPS = 8;

const profileOf = (id: number, lookup: ProfileFor): RoadProfile =>
  lookup(id) ?? presetProfileForTier(id as RoadTier);

/** How a segment is laid: its section and its paint, in the frame its stations are laid in. */
interface Lay {
  profile: RoadProfile;
  plan: MarkingPlan;
  /** The stations' normals point to the high offsets instead of right of first end to second. */
  flip: boolean;
  /**
   * For a grid road, the world metre along its axis at its first end and which
   * way along it the road runs, so its dashes keep the tiles' phase; null off
   * the grid.
   */
  axis: { origin: number; sign: 1 | -1 } | null;
}

function layOf(net: RoadNet, seg: number, lookup: ProfileFor): Lay {
  const raw = profileOf(net.segProfile[seg]!, lookup);
  if (isFreeSegment(net, seg)) {
    const oneWay = (net.segFlow[seg] ?? 0) === 1;
    return {
      profile: raw,
      plan: markingPlan(raw, oneWay ? RoadFlow.North : RoadFlow.None),
      flip: false,
      axis: null,
    };
  }
  const flow = net.segFlow[seg]!;
  const profile = worldOrderedProfile(raw, flow);
  const a = net.segA[seg]!;
  const b = net.segB[seg]!;
  const dx = net.nodeX[b]! - net.nodeX[a]!;
  const dz = net.nodeZ[b]! - net.nodeZ[a]!;
  const alongX = Math.abs(dx) >= Math.abs(dz);
  const sign = (alongX ? dx : dz) >= 0 ? 1 : -1;
  return {
    profile,
    plan: markingPlan(profile, flow),
    // Right of a road heading east is south and right of one heading north is
    // east, the high offsets; heading west or south, right is the low side.
    flip: alongX ? sign < 0 : sign > 0,
    axis: { origin: (alongX ? net.nodeX[a]! : net.nodeZ[a]!) / 100, sign },
  };
}

/** A point on a road's centre line, with the unit normal to its right. */
interface Station extends MPoint {
  s: number;
  nx: number;
  nz: number;
}

/** The centre line between `from` and `to` metres along it, with its normals, turned round when `flip`. */
function stations(
  samples: readonly { x: number; z: number; s: number }[],
  from: number,
  to: number,
  flip = false,
): Station[] {
  const side = flip ? -1 : 1;
  const at = (i: number): Station => {
    const p = samples[i]!;
    const before = samples[Math.max(0, i - 1)]!;
    const after = samples[Math.min(samples.length - 1, i + 1)]!;
    const tx = after.x - before.x;
    const tz = after.z - before.z;
    const len = Math.sqrt(tx * tx + tz * tz) || 1;
    return { x: p.x, z: p.z, s: p.s, nx: (-tz / len) * side, nz: (tx / len) * side };
  };
  const lerp = (i: number, s: number): Station => {
    const p = at(i);
    const q = at(i + 1);
    const f = q.s === p.s ? 0 : (s - p.s) / (q.s - p.s);
    const nx = p.nx + (q.nx - p.nx) * f;
    const nz = p.nz + (q.nz - p.nz) * f;
    const nl = Math.sqrt(nx * nx + nz * nz) || 1;
    return { x: p.x + (q.x - p.x) * f, z: p.z + (q.z - p.z) * f, s, nx: nx / nl, nz: nz / nl };
  };
  const out: Station[] = [];
  for (let i = 0; i < samples.length - 1; i++) {
    const s0 = samples[i]!.s;
    const s1 = samples[i + 1]!.s;
    if (s1 < from || s0 > to) continue;
    if (out.length === 0) out.push(lerp(i, Math.max(from, s0)));
    if (s1 < to) {
      // A stretch starting exactly on a sample has laid that sample already,
      // and laying it twice leaves a cell from the sample to itself.
      if (s1 > out[out.length - 1]!.s) out.push(at(i + 1));
    } else {
      out.push(lerp(i, to));
      break;
    }
  }
  return out;
}

/** Writes triangles, wound so that a flat one faces up. */
class Soup implements RoadSoup {
  readonly positions: number[] = [];
  readonly colors: number[] = [];

  constructor(private readonly surfaceAt: SurfaceAt) {}

  vertex(x: number, z: number, lift: number): [number, number, number] {
    return [x, this.surfaceAt(x, z) + lift, z];
  }

  tri(a: readonly number[], b: readonly number[], c: readonly number[], color: Rgb): void {
    const up = (b[2]! - a[2]!) * (c[0]! - a[0]!) - (b[0]! - a[0]!) * (c[2]! - a[2]!);
    const [p, q] = up >= 0 ? [b, c] : [c, b];
    for (const v of [a, p, q]) {
      this.positions.push(v[0]!, v[1]!, v[2]!);
      this.colors.push(color[0], color[1], color[2]);
    }
  }

  quad(
    a: readonly number[],
    b: readonly number[],
    c: readonly number[],
    d: readonly number[],
    color: Rgb,
  ): void {
    this.tri(a, b, c, color);
    this.tri(a, c, d, color);
  }

  /** A band along the stations between two offsets, cut across so it follows the ground. */
  ribbon(st: readonly Station[], o1: number, o2: number, lift: number, color: Rgb): void {
    if (st.length < 2 || o2 <= o1) return;
    const cells = Math.max(1, Math.ceil((o2 - o1) / MAX_CELL_ACROSS_M));
    for (let k = 0; k < st.length - 1; k++) {
      const p = st[k]!;
      const q = st[k + 1]!;
      for (let c = 0; c < cells; c++) {
        const u = o1 + ((o2 - o1) * c) / cells;
        const v = o1 + ((o2 - o1) * (c + 1)) / cells;
        this.quad(
          this.vertex(p.x + p.nx * u, p.z + p.nz * u, lift),
          this.vertex(p.x + p.nx * v, p.z + p.nz * v, lift),
          this.vertex(q.x + q.nx * v, q.z + q.nz * v, lift),
          this.vertex(q.x + q.nx * u, q.z + q.nz * u, lift),
          color,
        );
      }
    }
  }

  /** A vertical face along the stations at one offset, from one lift to another. */
  wall(st: readonly Station[], o: number, low: number, high: number, color: Rgb): void {
    for (let k = 0; k < st.length - 1; k++) {
      const p = st[k]!;
      const q = st[k + 1]!;
      const px = p.x + p.nx * o;
      const pz = p.z + p.nz * o;
      const qx = q.x + q.nx * o;
      const qz = q.z + q.nz * o;
      const a = this.vertex(px, pz, low);
      const b = this.vertex(qx, qz, low);
      const c = this.vertex(qx, qz, high);
      const d = this.vertex(px, pz, high);
      this.positions.push(...a, ...b, ...c, ...a, ...c, ...d);
      for (let i = 0; i < 6; i++) this.colors.push(color[0], color[1], color[2]);
    }
  }
}

/** One road leaving a node, as its junction is built from it. */
interface Arm {
  dir: MPoint;
  /** Centre line to carriageway edge, metres. */
  half: number;
  /** Width of the footway or kerb strip outside the carriageway, metres. */
  kerb: number;
  kerbReturn: number;
  /** How far along it the junction ends, metres. */
  setback: number;
  /** The most setback it has room for. */
  maxSetback: number;
  angle: number;
  /** The edge line on the side a quarter turn toward increasing angle, and on the other side. */
  edgeAhead: MarkingLine | null;
  edgeBehind: MarkingLine | null;
  /**
   * Where the junction ends on the road's centre line, and the way the road
   * heads there, away from the node. A curve has already turned by then, and
   * the junction's edge has to meet the road where the road actually is.
   */
  end: MPoint;
  endDir: MPoint;
}

/** The point `s` metres along a centre line, and the heading there, away from the node at its first or second end. */
function pointAlong(
  samples: ReturnType<typeof sampleCentreLine>,
  s: number,
  atA: boolean,
): { end: MPoint; endDir: MPoint } {
  const length = samples.at(-1)!.s;
  // Anywhere on the line has a station, its two ends included.
  const t = Math.min(length, Math.max(0, atA ? s : length - s));
  const st = stations(samples, t, t)[0]!;
  // The normal is the forward heading turned a quarter toward increasing angle.
  const forward = { x: st.nz, z: -st.nx };
  return {
    end: { x: st.x, z: st.z },
    endDir: atA ? forward : { x: -forward.x, z: -forward.z },
  };
}

/**
 * The most setback a grid road has at a junction a road off the grid meets:
 * the edge of the junction's tile, where the tile beside it is drawn.
 */
const GRID_ARM_REACH = TILE_METERS / 2;

/** The unit normal a quarter turn from `d`, toward increasing angle. */
const turn = (d: MPoint): MPoint => ({ x: -d.z, z: d.x });

/**
 * How far along arm `i` its carriageway edge meets arm `j`'s, plus the length
 * of the kerb return turning between them: the edges are the lines `half` to
 * the side of each centre line, and the return's tangent points lie
 * r·(1 + cos θ)/sin θ from where they cross.
 */
function setbackBetween(i: Arm, j: Arm): number {
  const cos = i.dir.x * j.dir.x + i.dir.z * j.dir.z;
  const sin = Math.sqrt(Math.max(0, 1 - cos * cos));
  if (sin < STRAIGHT_ON_SIN) return 0;
  const meet = (j.half + i.half * cos) / sin;
  return Math.max(0, meet + (i.kerbReturn * (1 + cos)) / sin);
}

/** The roads leaving a node, in order of angle, with their setbacks solved. */
function armsAt(net: RoadNet, node: number, lookup: ProfileFor): { arms: Arm[]; segs: number[] } {
  const segs = segmentsAt(net, node);
  const centre = { x: net.nodeX[node]! / 100, z: net.nodeZ[node]! / 100 };
  const samplesOf = segs.map((seg) => sampleCentreLine(segmentGeom(net, seg)));
  const arms = segs.map((seg, k): Arm => {
    const geom = segmentGeom(net, seg);
    const atA = net.segA[seg] === node;
    const dir = leavingDirection(geom, atA ? 'a' : 'b');
    const lay = layOf(net, seg, lookup);
    const length = samplesOf[k]!.at(-1)!.s;
    // The side a quarter turn from the road as it leaves is its high-offset
    // side when it leaves the way its stations run.
    const high = atA !== lay.flip;
    const edges = isPaved(lay.profile) ? lay.plan.edges : null;
    return {
      dir,
      half: carriagewayHalfWidthOf(lay.profile),
      kerb: kerbWidthOf(lay.profile),
      kerbReturn: hasKerbs(lay.profile) ? kerbReturnRadiusOf(lay.profile) : 0,
      setback: 0,
      maxSetback: isFreeSegment(net, seg) ? length * MAX_SETBACK_SHARE : GRID_ARM_REACH,
      angle: Math.atan2(dir.z, dir.x),
      edgeAhead: edges ? edges[high ? 1 : 0] : null,
      edgeBehind: edges ? edges[high ? 0 : 1] : null,
      end: centre,
      endDir: dir,
    };
  });
  const order = arms.map((_, k) => k).sort((p, q) => arms[p]!.angle - arms[q]!.angle);
  const sorted = order.map((k) => arms[k]!);
  if (sorted.length >= 2) {
    for (let k = 0; k < sorted.length; k++) {
      const arm = sorted[k]!;
      const prev = sorted[(k + sorted.length - 1) % sorted.length]!;
      const next = sorted[(k + 1) % sorted.length]!;
      arm.setback = Math.min(
        arm.maxSetback,
        Math.max(setbackBetween(arm, prev), setbackBetween(arm, next)),
      );
    }
  }
  order.forEach((k, n) => {
    const arm = sorted[n]!;
    Object.assign(arm, pointAlong(samplesOf[k]!, arm.setback, net.segA[segs[k]!] === node));
  });
  return { arms: sorted, segs: order.map((k) => segs[k]!) };
}

/** Where two lines cross, each through a point along a direction; null when parallel. */
function crossing(p: MPoint, u: MPoint, q: MPoint, v: MPoint): MPoint | null {
  const den = u.x * v.z - u.z * v.x;
  if (Math.abs(den) < 1e-6) return null;
  const t = ((q.x - p.x) * v.z - (q.z - p.z) * v.x) / den;
  return { x: p.x + u.x * t, z: p.z + u.z * t };
}

/**
 * The line a kerb takes from arm `i` round to the next arm `j` counter to the
 * clock, at `out` metres beyond each carriageway edge (`outJ` beyond `j`'s,
 * where the two differ): a curve through the point where the two edges would
 * cross, or straight across where the gap between them opens wider than a
 * straight road.
 */
function cornerLine(i: Arm, j: Arm, out: number, outJ = out): MPoint[] {
  const ni = turn(i.endDir);
  const nj = turn(j.endDir);
  const oi = i.half + out;
  const oj = j.half + outJ;
  const p = { x: i.end.x + ni.x * oi, z: i.end.z + ni.z * oi };
  const q = { x: j.end.x - nj.x * oj, z: j.end.z - nj.z * oj };
  const reflex = i.dir.x * j.dir.z - i.dir.z * j.dir.x <= 0;
  const control = reflex ? null : crossing(p, i.endDir, q, j.endDir);
  const c = control ?? { x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 };
  const out2: MPoint[] = [];
  for (let k = 0; k <= CORNER_STEPS; k++) {
    const t = k / CORNER_STEPS;
    const u = 1 - t;
    out2.push({
      x: u * u * p.x + 2 * u * t * c.x + t * t * q.x,
      z: u * u * p.z + 2 * u * t * c.z + t * t * q.z,
    });
  }
  return out2;
}

/** The stations along a line through `points`, each with the normal to its right. */
function lineStations(points: readonly MPoint[]): Station[] {
  let s = 0;
  return points.map((p, k) => {
    if (k > 0) s += Math.hypot(p.x - points[k - 1]!.x, p.z - points[k - 1]!.z);
    const before = points[Math.max(0, k - 1)]!;
    const after = points[Math.min(points.length - 1, k + 1)]!;
    const tx = after.x - before.x;
    const tz = after.z - before.z;
    const len = Math.sqrt(tx * tx + tz * tz) || 1;
    return { x: p.x, z: p.z, s, nx: -tz / len, nz: tx / len };
  });
}

/**
 * The edge line round the kerb return from arm `i` to arm `j`, carried on from
 * each road's own edge line where they are the same paint. Where one road
 * paints none, or the two differ, the corner is left bare rather than painted
 * in a colour one of them does not use.
 */
function drawCornerEdge(soup: Soup, i: Arm, j: Arm): void {
  const from = i.edgeAhead;
  const to = j.edgeBehind;
  if (!from || !to || from.color !== to.color) return;
  const line = cornerLine(i, j, Math.abs(from.at) - i.half, Math.abs(to.at) - j.half);
  soup.ribbon(
    lineStations(line),
    -PAINT_HALF_WIDTH_M,
    PAINT_HALF_WIDTH_M,
    MARK_Y_OFFSET,
    from.color === 'yellow' ? YELLOW_MARKING_COLOR : MARKING_COLOR,
  );
}

/** The junction at a node: its surface, the footway round each corner, and the edge lines turning it. */
function drawJunction(
  soup: Soup,
  net: RoadNet,
  node: number,
  arms: readonly Arm[],
  color: Rgb,
): void {
  const centre = { x: net.nodeX[node]! / 100, z: net.nodeZ[node]! / 100 };
  const lift = ROAD_Y_OFFSET;
  const outline: MPoint[] = [];
  for (let k = 0; k < arms.length; k++) {
    const i = arms[k]!;
    const j = arms[(k + 1) % arms.length]!;
    const ni = turn(i.endDir);
    outline.push({ x: i.end.x - ni.x * i.half, z: i.end.z - ni.z * i.half });
    outline.push(...cornerLine(i, j, 0));
    drawCornerEdge(soup, i, j);
    if (i.kerb > 0 && j.kerb > 0) {
      const inner = cornerLine(i, j, 0);
      const outer = cornerLine(i, j, Math.min(i.kerb, j.kerb));
      for (let c = 0; c < inner.length - 1; c++) {
        soup.quad(
          soup.vertex(inner[c]!.x, inner[c]!.z, CURB_Y_OFFSET),
          soup.vertex(outer[c]!.x, outer[c]!.z, CURB_Y_OFFSET),
          soup.vertex(outer[c + 1]!.x, outer[c + 1]!.z, CURB_Y_OFFSET),
          soup.vertex(inner[c + 1]!.x, inner[c + 1]!.z, CURB_Y_OFFSET),
          SIDEWALK_COLOR,
        );
      }
    }
  }
  const hub = soup.vertex(centre.x, centre.z, lift);
  for (let k = 0; k < outline.length; k++) {
    const p = outline[k]!;
    const q = outline[(k + 1) % outline.length]!;
    soup.tri(hub, soup.vertex(p.x, p.z, lift), soup.vertex(q.x, q.z, lift), color);
  }
}

const shade = (c: Rgb, f: number): Rgb => [c[0] * f, c[1] * f, c[2] * f];

/**
 * Metre ranges along a segment that carry a dash. A grid road measures its
 * pattern from world metre 0 along its axis, as the tiles beside it do; a road
 * off the grid measures it along itself.
 */
function dashRuns(lay: Lay, from: number, to: number): Array<[number, number]> {
  const axis = lay.axis;
  if (!axis) return dashSegments(from, to);
  const w0 = axis.origin + axis.sign * from;
  const w1 = axis.origin + axis.sign * to;
  return dashSegments(Math.min(w0, w1), Math.max(w0, w1)).map(([lo, hi]) =>
    axis.sign > 0 ? [lo - axis.origin, hi - axis.origin] : [axis.origin - hi, axis.origin - lo],
  );
}

/** One segment's cross-section swept along it between `from` and `to` metres. */
function drawSegment(
  soup: Soup,
  net: RoadNet,
  seg: number,
  lay: Lay,
  from: number,
  to: number,
): void {
  // A grid road whose junction reaches its tile's edge has nothing left to draw.
  if (to - from < 1e-6) return;
  const { profile, plan } = lay;
  const samples = sampleCentreLine(segmentGeom(net, seg));
  const st = stations(samples, from, to, lay.flip);
  if (st.length < 2) return;
  const half = carriagewayHalfWidthOf(profile);
  const surface = surfaceColor(profile);
  soup.ribbon(st, -half, half, ROAD_Y_OFFSET, surface);

  let edge = -half;
  for (const piece of profile.pieces) {
    if (!CARRIAGEWAY_KINDS.has(piece.kind)) continue;
    const lo = edge;
    edge += piece.width;
    if (piece.kind === 'median')
      soup.ribbon(st, lo, edge, MEDIAN_RAISE + ROAD_Y_OFFSET, MEDIAN_GRASS_COLOR);
    if (piece.kind === 'barrier') {
      soup.ribbon(st, lo, edge, HIGHWAY_BARRIER_RAISE + ROAD_Y_OFFSET, HIGHWAY_BARRIER_COLOR);
    }
  }

  if (hasKerbs(profile)) {
    const kerb = kerbWidthOf(profile);
    soup.ribbon(st, half, half + kerb, CURB_Y_OFFSET, SIDEWALK_COLOR);
    soup.ribbon(st, -half - kerb, -half, CURB_Y_OFFSET, SIDEWALK_COLOR);
    const face = shade(SIDEWALK_COLOR, KERB_FACE_SHADE);
    soup.wall(st, half, ROAD_Y_OFFSET, CURB_Y_OFFSET, face);
    soup.wall(st, -half, ROAD_Y_OFFSET, CURB_Y_OFFSET, face);
  }

  if (!isPaved(profile)) return;
  for (const band of plan.bands) {
    if (band.kind === 'bus')
      soup.ribbon(st, band.from, band.to, BAND_Y_OFFSET, BUS_LANE_PAINT_COLOR);
    if (band.kind === 'bike')
      soup.ribbon(st, band.from, band.to, BAND_Y_OFFSET, BIKE_LANE_PAINT_COLOR);
  }
  const paint = (line: { at: number; color: 'white' | 'yellow' }, run: readonly Station[]): void =>
    soup.ribbon(
      run,
      line.at - PAINT_HALF_WIDTH_M,
      line.at + PAINT_HALF_WIDTH_M,
      MARK_Y_OFFSET,
      line.color === 'yellow' ? YELLOW_MARKING_COLOR : MARKING_COLOR,
    );
  for (const line of plan.solid) paint(line, st);
  for (const [lo, hi] of dashRuns(lay, from, to)) {
    const run = stations(samples, lo, hi, lay.flip);
    for (const line of plan.dashed) paint(line, run);
  }
}

/**
 * Every road off the grid, as triangles: each free segment between the
 * junctions at its ends, and each node a free segment meets, meshed from all
 * the roads meeting there, with each grid road meeting it carried to the edge
 * of the junction's tile.
 */
export function freeRoadSoup(net: RoadNet, lookup: ProfileFor, surfaceAt: SurfaceAt): RoadSoup {
  const soup = new Soup(surfaceAt);
  const { junctions, spans, caps } = layout(net, lookup);
  for (const j of junctions) drawJunction(soup, net, j.node, j.arms, j.color);
  for (const span of spans) drawSegment(soup, net, span.seg, span.lay, span.from, span.to);
  for (const cap of caps) drawCap(soup, net, cap);
  return soup;
}

/**
 * The grid tiles a junction with a road off the grid is drawn over, whole,
 * by this renderer rather than by the tiles: every grid node where a free
 * road meets another road.
 */
export function freeJunctionTiles(net: RoadNet, lookup: ProfileFor): TilePoint[] {
  return layout(net, lookup).gridTiles;
}

/** A stretch of one segment drawn here: metres along it from `from` to `to`. */
interface Span {
  seg: number;
  lay: Lay;
  from: number;
  to: number;
}

/**
 * Where every free road runs between junctions, every junction a free road
 * meets, and the stretch of each grid road inside the tile of one.
 */
function layout(
  net: RoadNet,
  lookup: ProfileFor,
): {
  junctions: { node: number; arms: Arm[]; color: Rgb }[];
  spans: Span[];
  gridTiles: TilePoint[];
  caps: Cap[];
} {
  const setbackAt = new Map<string, number>();
  const junctions: { node: number; arms: Arm[]; color: Rgb }[] = [];
  const spans: Span[] = [];
  const gridTiles: TilePoint[] = [];
  const caps: Cap[] = [];
  for (let node = 0; node < net.nodeSlots; node++) {
    if (net.nodeLive[node] !== 1) continue;
    const { arms, segs } = armsAt(net, node, lookup);
    if (!segs.some((s) => isFreeSegment(net, s))) continue;
    arms.forEach((arm, k) => setbackAt.set(`${segs[k]}:${node}`, arm.setback));
    // A lone grid tile a free road leaves is still the tile renderer's, and
    // ends the way a grid road does; a free road ending on open ground rounds.
    if (arms.length === 1 && !isGridNode(net, node)) {
      const cap = capAt(net, segs[0]!, node, lookup);
      setbackAt.set(`${segs[0]}:${node}`, cap.pivot);
      caps.push(cap);
    }
    if (arms.length < 2) continue;
    const free = segs.find((s) => isFreeSegment(net, s))!;
    junctions.push({ node, arms, color: surfaceColor(profileOf(net.segProfile[free]!, lookup)) });
    if (!isGridNode(net, node)) continue;
    gridTiles.push({
      x: Math.floor(net.nodeX[node]! / 100 / TILE_METERS),
      z: Math.floor(net.nodeZ[node]! / 100 / TILE_METERS),
    });
    segs.forEach((seg, k) => {
      if (isFreeSegment(net, seg)) return;
      const length = sampleCentreLine(segmentGeom(net, seg)).at(-1)!.s;
      const setback = arms[k]!.setback;
      const atA = net.segA[seg] === node;
      spans.push({
        seg,
        lay: layOf(net, seg, lookup),
        from: atA ? setback : length - GRID_ARM_REACH,
        to: atA ? GRID_ARM_REACH : length - setback,
      });
    });
  }
  for (let seg = 0; seg < net.segSlots; seg++) {
    if (net.segLive[seg] !== 1 || !isFreeSegment(net, seg)) continue;
    const length = sampleCentreLine(segmentGeom(net, seg)).at(-1)!.s;
    spans.push({
      seg,
      lay: layOf(net, seg, lookup),
      from: setbackAt.get(`${seg}:${net.segA[seg]}`) ?? 0,
      to: length - (setbackAt.get(`${seg}:${net.segB[seg]}`) ?? 0),
    });
  }
  return { junctions, spans, gridTiles, caps };
}

/**
 * A free road's rounded dead end: the grid's cap — a half-disc as wide as the
 * carriageway, the kerb and footway wrapped round it, the lines wrapped at
 * their own radii — laid inside the road's own length, so its footway's tip
 * is the node the road ends at and nothing reaches past the ground its
 * footprint holds.
 */
interface Cap {
  seg: number;
  lay: Lay;
  atA: boolean;
  /** Metres from the node to where the swept road stops and the cap begins. */
  pivot: number;
  /** How far the carriageway's rounded end reaches from the pivot toward the node. */
  depth: number;
}

function capAt(net: RoadNet, seg: number, node: number, lookup: ProfileFor): Cap {
  const lay = layOf(net, seg, lookup);
  const length = sampleCentreLine(segmentGeom(net, seg)).at(-1)!.s;
  const half = carriagewayHalfWidthOf(lay.profile);
  const kerb = hasKerbs(lay.profile) ? kerbWidthOf(lay.profile) : 0;
  // A true half-circle where the road is long enough, flattened along the road
  // where it is not, so a short road capped at both ends keeps a straight
  // between its two rounded ends.
  const depth = Math.max(0, Math.min(half, length / 2 - kerb));
  return { seg, lay, atA: net.segA[seg] === node, pivot: depth + kerb, depth };
}

function drawCap(soup: Soup, net: RoadNet, cap: Cap): void {
  const { profile, plan } = cap.lay;
  const half = carriagewayHalfWidthOf(profile);
  if (half <= 0) return;
  const samples = sampleCentreLine(segmentGeom(net, cap.seg));
  const { end, endDir } = pointAlong(samples, cap.pivot, cap.atA);
  // Toward the node, and across the road a quarter turn from the way it leaves it.
  const back = { x: -endDir.x, z: -endDir.z };
  const across = turn(endDir);
  const squash = half > 0 ? cap.depth / half : 0;
  /** A point `r` out across the road and `r·squash` back toward the node, at sweep angle `a`. */
  const ring = (r: number, along: number, a: number): MPoint => ({
    x: end.x + back.x * along * Math.cos(a) + across.x * r * Math.sin(a),
    z: end.z + back.z * along * Math.cos(a) + across.z * r * Math.sin(a),
  });
  const angles = Array.from(
    { length: END_CAP_SEGMENTS + 1 },
    (_, i) => -Math.PI / 2 + (Math.PI * i) / END_CAP_SEGMENTS,
  );

  const hub = soup.vertex(end.x, end.z, ROAD_Y_OFFSET);
  const rim = angles.map((a) => ring(half, cap.depth, a));
  const surface = surfaceColor(profile);
  for (let i = 0; i < rim.length - 1; i++) {
    soup.tri(
      hub,
      soup.vertex(rim[i]!.x, rim[i]!.z, ROAD_Y_OFFSET),
      soup.vertex(rim[i + 1]!.x, rim[i + 1]!.z, ROAD_Y_OFFSET),
      surface,
    );
  }

  if (hasKerbs(profile)) {
    const kerb = kerbWidthOf(profile);
    const outer = angles.map((a) => ring(half + kerb, cap.depth + kerb, a));
    for (let i = 0; i < rim.length - 1; i++) {
      soup.quad(
        soup.vertex(rim[i]!.x, rim[i]!.z, CURB_Y_OFFSET),
        soup.vertex(outer[i]!.x, outer[i]!.z, CURB_Y_OFFSET),
        soup.vertex(outer[i + 1]!.x, outer[i + 1]!.z, CURB_Y_OFFSET),
        soup.vertex(rim[i + 1]!.x, rim[i + 1]!.z, CURB_Y_OFFSET),
        SIDEWALK_COLOR,
      );
    }
    soup.wall(
      lineStations(rim),
      0,
      ROAD_Y_OFFSET,
      CURB_Y_OFFSET,
      shade(SIDEWALK_COLOR, KERB_FACE_SHADE),
    );
  }

  if (!isPaved(profile)) return;
  // Each line runs round its own half of the end, from its side of the road
  // to the tip, so the two sides meet there in the colours they carry. The
  // side a quarter turn from the road as it leaves holds its high offsets
  // when it leaves the way its stations run.
  const high = cap.atA !== cap.lay.flip;
  const wrap = (line: MarkingLine, dashed: boolean): void => {
    const r = Math.abs(line.at);
    if (r <= PAINT_HALF_WIDTH_M) return;
    const ahead = line.at > 0 === high;
    const quarter = angles.filter((a) => (ahead ? a >= 0 : a <= 0));
    const path = quarter.map((a) => ring(r, r * squash, a));
    const run = lineStations(ahead ? path : [...path].reverse());
    const length = run.at(-1)!.s;
    const color = line.color === 'yellow' ? YELLOW_MARKING_COLOR : MARKING_COLOR;
    const pieces = dashed ? dashSegments(0, length) : [[0, length] as [number, number]];
    for (const [lo, hi] of pieces) {
      soup.ribbon(
        stations(run, lo, hi),
        -PAINT_HALF_WIDTH_M,
        PAINT_HALF_WIDTH_M,
        MARK_Y_OFFSET,
        color,
      );
    }
  };
  for (const line of plan.solid) wrap(line, false);
  for (const line of plan.dashed) wrap(line, true);
}

/**
 * The street lamps along every road off the grid: one every lamp spacing
 * between its junctions, first a half spacing in, on alternate kerbs, each
 * reaching square across the road — and only where the road has power, as on
 * the grid.
 */
export function freeRoadLampStands(
  net: RoadNet,
  lookup: ProfileFor,
  powered: (x: number, z: number) => boolean,
): LampStand[] {
  const spacing = LAMP_SPACING_TILES * TILE_METERS;
  const out: LampStand[] = [];
  for (const span of layout(net, lookup).spans) {
    // A grid road's lamps are the tiles' own, whichever renderer draws it.
    if (!isFreeSegment(net, span.seg)) continue;
    const tier = net.segTier[span.seg] as RoadTier;
    if (!tierGetsLamp(tier) || !isPaved(span.lay.profile)) continue;
    const offset = lampLateralOffset(tier, span.lay.profile);
    const samples = sampleCentreLine(segmentGeom(net, span.seg));
    const first = span.from + Math.min(spacing, span.to - span.from) / 2;
    for (let s = first, k = 0; s <= span.to; s += spacing, k++) {
      const st = stations(samples, s, s)[0];
      if (!st || !powered(st.x, st.z)) continue;
      const side = k % 2 === 0 ? 1 : -1;
      out.push({
        x: st.x + st.nx * offset * side,
        z: st.z + st.nz * offset * side,
        reachX: -st.nx * side,
        reachZ: -st.nz * side,
      });
    }
  }
  return out;
}

/** Draws the roads off the grid, rebuilt whole whenever the network or the ground changes. */
export class FreeRoadRenderer {
  // Lit like the tile roads so the two shade alike. Kerb faces are drawn
  // without a winding of their own, so both sides are lit.
  private readonly material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  private mesh: THREE.Mesh | null = null;
  private junctionTiles: TilePoint[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly surfaceAt: SurfaceAt,
    private readonly profileFor: ProfileFor,
  ) {}

  rebuild(net: RoadNet | undefined): void {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    this.junctionTiles = net ? freeJunctionTiles(net, this.profileFor) : [];
    if (!net) return;
    const soup = freeRoadSoup(net, this.profileFor, this.surfaceAt);
    if (soup.positions.length === 0) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(soup.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(soup.colors, 3));
    geometry.computeVertexNormals();
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);
  }

  setNightFactor(nightFactor: number): void {
    this.material.color.setScalar(roadNightDim(nightFactor));
  }

  /** The grid tiles the last rebuild drew a junction over, which the tile renderer leaves to it. */
  gridJunctionTiles(): readonly TilePoint[] {
    return this.junctionTiles;
  }

  /** Triangles currently drawn — for tests and read-backs. */
  triangleCount(): number {
    return this.mesh ? this.mesh.geometry.getAttribute('position').count / 3 : 0;
  }
}
