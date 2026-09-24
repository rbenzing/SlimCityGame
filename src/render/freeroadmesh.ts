/**
 * Roads off the grid, drawn from the network: each segment's cross-section
 * swept along its centre line, square to it, and each node where roads meet
 * meshed from the roads meeting there. Grid roads still draw through the tile
 * renderer; this draws only what the tiles cannot hold, in the same colours,
 * at the same heights and with the same markings plan, so the two read as one
 * road system.
 *
 * Offsets across a road are measured from its centre line, positive to the
 * right of the direction it was drawn in, first end to second: the frame a
 * tile road drawn north is laid in, which is the frame the markings plan
 * returns its offsets in.
 */

import * as THREE from 'three';
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
} from '../shared/roadprofile';
import { RoadFlow } from '../shared/types';
import type { RoadNet, RoadProfile, RoadTier } from '../shared/types';
import { isFreeSegment, isGridNode, segmentGeom, segmentsAt } from '../world/roadnet';
import { markingPlan } from './roadmarkings';
import {
  BIKE_LANE_PAINT_COLOR,
  BUS_LANE_PAINT_COLOR,
  CURB_Y_OFFSET,
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
/**
 * Where a road off the grid meets a grid road, its junction is laid just over
 * the grid road's kerb, so the grid road's footway does not run across the
 * mouth of the road joining it.
 */
const GRID_MOUTH_Y_OFFSET = CURB_Y_OFFSET + 0.01;
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

/** A point on a road's centre line, with the unit normal to its right. */
interface Station extends MPoint {
  s: number;
  nx: number;
  nz: number;
}

/** The centre line between `from` and `to` metres along it, with its normals. */
function stations(
  samples: ReturnType<typeof sampleCentreLine>,
  from: number,
  to: number,
): Station[] {
  const at = (i: number): Station => {
    const p = samples[i]!;
    const before = samples[Math.max(0, i - 1)]!;
    const after = samples[Math.min(samples.length - 1, i + 1)]!;
    const tx = after.x - before.x;
    const tz = after.z - before.z;
    const len = Math.sqrt(tx * tx + tz * tz) || 1;
    return { x: p.x, z: p.z, s: p.s, nx: -tz / len, nz: tx / len };
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
    if (s1 < to) out.push(at(i + 1));
    else {
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
}

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
  const arms = segs.map((seg): Arm => {
    const geom = segmentGeom(net, seg);
    const dir = leavingDirection(geom, net.segA[seg] === node ? 'a' : 'b');
    const profile = profileOf(net.segProfile[seg]!, lookup);
    const length = sampleCentreLine(geom).at(-1)!.s;
    return {
      dir,
      half: carriagewayHalfWidthOf(profile),
      kerb: kerbWidthOf(profile),
      kerbReturn: hasKerbs(profile) ? kerbReturnRadiusOf(profile) : 0,
      setback: 0,
      maxSetback: length * MAX_SETBACK_SHARE,
      angle: Math.atan2(dir.z, dir.x),
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
 * clock, at `out` metres beyond each carriageway edge: a curve through the
 * point where the two edges would cross, or straight across where the gap
 * between them opens wider than a straight road.
 */
function cornerLine(centre: MPoint, i: Arm, j: Arm, out: number): MPoint[] {
  const ni = turn(i.dir);
  const nj = turn(j.dir);
  const oi = i.half + out;
  const oj = j.half + out;
  const p = {
    x: centre.x + i.dir.x * i.setback + ni.x * oi,
    z: centre.z + i.dir.z * i.setback + ni.z * oi,
  };
  const q = {
    x: centre.x + j.dir.x * j.setback - nj.x * oj,
    z: centre.z + j.dir.z * j.setback - nj.z * oj,
  };
  const reflex = i.dir.x * j.dir.z - i.dir.z * j.dir.x <= 0;
  const control = reflex ? null : crossing(p, i.dir, q, j.dir);
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

/** The junction at a node: its surface, and the footway round each corner. */
function drawJunction(
  soup: Soup,
  net: RoadNet,
  node: number,
  arms: readonly Arm[],
  color: Rgb,
): void {
  const centre = { x: net.nodeX[node]! / 100, z: net.nodeZ[node]! / 100 };
  const lift = isGridNode(net, node) ? GRID_MOUTH_Y_OFFSET : ROAD_Y_OFFSET;
  const outline: MPoint[] = [];
  for (let k = 0; k < arms.length; k++) {
    const i = arms[k]!;
    const j = arms[(k + 1) % arms.length]!;
    const ni = turn(i.dir);
    outline.push({
      x: centre.x + i.dir.x * i.setback - ni.x * i.half,
      z: centre.z + i.dir.z * i.setback - ni.z * i.half,
    });
    outline.push(...cornerLine(centre, i, j, 0));
    if (i.kerb > 0 && j.kerb > 0) {
      const inner = cornerLine(centre, i, j, 0);
      const outer = cornerLine(centre, i, j, Math.min(i.kerb, j.kerb));
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

/** One segment's cross-section swept along it between its junctions. */
function drawSegment(
  soup: Soup,
  net: RoadNet,
  seg: number,
  profile: RoadProfile,
  from: number,
  to: number,
): void {
  const st = stations(sampleCentreLine(segmentGeom(net, seg)), from, to);
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
  const oneWay = (net.segFlow[seg] ?? 0) === 1;
  const plan = markingPlan(profile, oneWay ? RoadFlow.North : RoadFlow.None);
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
  const samples = sampleCentreLine(segmentGeom(net, seg));
  for (const [lo, hi] of dashSegments(from, to)) {
    const run = stations(samples, lo, hi);
    for (const line of plan.dashed) paint(line, run);
  }
}

/**
 * Every road off the grid, as triangles: each free segment between the
 * junctions at its ends, and each node a free segment meets, meshed from all
 * the roads meeting there.
 */
export function freeRoadSoup(net: RoadNet, lookup: ProfileFor, surfaceAt: SurfaceAt): RoadSoup {
  const soup = new Soup(surfaceAt);
  const setbackAt = new Map<string, number>();
  for (let node = 0; node < net.nodeSlots; node++) {
    if (net.nodeLive[node] !== 1) continue;
    const { arms, segs } = armsAt(net, node, lookup);
    if (!segs.some((s) => isFreeSegment(net, s))) continue;
    arms.forEach((arm, k) => setbackAt.set(`${segs[k]}:${node}`, arm.setback));
    if (arms.length < 2) continue;
    const free = segs.find((s) => isFreeSegment(net, s))!;
    drawJunction(soup, net, node, arms, surfaceColor(profileOf(net.segProfile[free]!, lookup)));
  }
  for (let seg = 0; seg < net.segSlots; seg++) {
    if (net.segLive[seg] !== 1 || !isFreeSegment(net, seg)) continue;
    const length = sampleCentreLine(segmentGeom(net, seg)).at(-1)!.s;
    const from = setbackAt.get(`${seg}:${net.segA[seg]}`) ?? 0;
    const to = length - (setbackAt.get(`${seg}:${net.segB[seg]}`) ?? 0);
    drawSegment(soup, net, seg, profileOf(net.segProfile[seg]!, lookup), from, to);
  }
  return soup;
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

  /** Triangles currently drawn — for tests and read-backs. */
  triangleCount(): number {
    return this.mesh ? this.mesh.geometry.getAttribute('position').count / 3 : 0;
  }
}
