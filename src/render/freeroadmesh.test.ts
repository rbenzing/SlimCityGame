import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MeshLambertNodeMaterial } from 'three/webgpu';
import { sampleCentreLine, tileCentreCm } from '../shared/roadgeom';
import type { Bend, CmPoint, MPoint } from '../shared/roadgeom';
import {
  bendRadiusOf,
  carriagewayHalfWidthOf,
  cornerRadiusOf,
  hasKerbs,
  kerbWidthOf,
  presetProfileForTier,
} from '../shared/roadprofile';
import { RoadFlow, RoadTier } from '../shared/types';
import type { GridState, RoadProfile, RoadTier as Tier } from '../shared/types';
import { createGrid } from '../world/grid';
import { applyRoad } from '../world/roads';
import { deriveRoadFootprint, laySegment, planSegment } from '../world/freeroads';
import {
  bendsOf,
  isFreeSegment,
  networkFromGrid,
  reconcileRoads,
  segmentGeom,
  syncRoadLayers,
} from '../world/roadnet';
import { TILE_METERS } from '../shared/constants';
import {
  FreeRoadRenderer,
  bendDashes,
  freeJunctionTiles,
  freeRoadLampStands,
  freeRoadSoup,
} from './freeroadmesh';
import type { RoadSoup } from './freeroadmesh';
import { LAMP_HEIGHTS_M, lampLateralOffset } from './lamps';
import { CENTRE_PAIR_OFFSET_M, markingPlan, noPassingPlan } from './roadmarkings';
import { MEDIAN_CONCRETE_COLOR, MEDIAN_GRASS_COLOR, MEDIAN_RAISE } from './medianisland';
import {
  CURB_Y_OFFSET,
  DASH_GAP_LENGTH_M,
  DASH_PAINT_LENGTH_M,
  DASH_PERIOD_M,
  MARKING_COLOR,
  MARK_Y_OFFSET,
  PAINT_HALF_WIDTH_M,
  ROAD_Y_OFFSET,
  SIDEWALK_COLOR,
  TRAM_GAUGE_HALF_M,
  TRAM_RAIL_COLOR,
  TRAM_RAIL_Y_OFFSET,
  TRAM_SLAB_COLOR,
  YELLOW_MARKING_COLOR,
  medianHalfWidthOf,
  surfaceColor,
} from './roadsmesh';

const SIZE = 48;
const noCustom = (): null => null;
const flat = (): number => 0;
const at = (x: number, z: number): CmPoint => ({ x: Math.round(x * 100), z: Math.round(z * 100) });
const centre = (x: number, z: number): CmPoint => ({ x: tileCentreCm(x), z: tileCentreCm(z) });

function world(): GridState {
  const g = createGrid(SIZE);
  g.roads = networkFromGrid(g);
  return g;
}

function settle(g: GridState): void {
  reconcileRoads(g.roads!, g);
  expect(syncRoadLayers(g, g.roads!)).toEqual([]);
  deriveRoadFootprint(g, g.roads!, noCustom);
}

function lay(
  g: GridState,
  ask: { tier?: Tier; a: CmPoint; b: CmPoint; control?: CmPoint; flow?: number },
): void {
  const tier = ask.tier ?? RoadTier.TwoLane;
  const req = {
    tier,
    profileId: tier,
    a: ask.a,
    b: ask.b,
    control: ask.control ?? null,
    flow: ask.flow ?? 0,
  };
  const p = planSegment(g, g.roads!, req, noCustom);
  if (!p.ok) throw new Error(`refused: ${p.reason}`);
  laySegment(g, g.roads!, p, req);
  settle(g);
}

interface Tri {
  centroid: MPoint;
  y: number;
  color: readonly number[];
}

function triangles(g: GridState): Tri[] {
  const soup = freeRoadSoup(g.roads!, noCustom, flat);
  const out: Tri[] = [];
  for (let i = 0; i < soup.positions.length; i += 9) {
    const p = soup.positions;
    out.push({
      centroid: {
        x: (p[i]! + p[i + 3]! + p[i + 6]!) / 3,
        z: (p[i + 2]! + p[i + 5]! + p[i + 8]!) / 3,
      },
      y: (p[i + 1]! + p[i + 4]! + p[i + 7]!) / 3,
      color: soup.colors.slice(i, i + 3),
    });
  }
  return out;
}

const sameColor = (a: readonly number[], b: readonly number[]): boolean =>
  a.every((v, k) => Math.abs(v - b[k]!) < 1e-6);

/** A run of a centre line's samples and the box around them. */
interface SampleRun {
  from: number;
  to: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
const RUN_SAMPLES = 16;

/**
 * Each world's centre lines, sampled once and cut into boxed runs, so a test
 * that measures every triangle against a road looks only at the runs that
 * could hold the nearest point rather than at every sample every time.
 */
const sampled = new WeakMap<
  GridState,
  Map<number, { samples: ReturnType<typeof sampleCentreLine>; runs: SampleRun[] }>
>();

function lineOf(
  g: GridState,
  seg: number,
): { samples: ReturnType<typeof sampleCentreLine>; runs: SampleRun[] } {
  const lines = sampled.get(g) ?? new Map();
  sampled.set(g, lines);
  const known = lines.get(seg);
  if (known) return known;
  const samples = sampleCentreLine(segmentGeom(g.roads!, seg));
  const runs: SampleRun[] = [];
  for (let from = 0; from < samples.length - 1; from += RUN_SAMPLES) {
    const to = Math.min(samples.length - 1, from + RUN_SAMPLES);
    const pts = samples.slice(from, to + 1);
    runs.push({
      from,
      to,
      minX: Math.min(...pts.map((q) => q.x)),
      maxX: Math.max(...pts.map((q) => q.x)),
      minZ: Math.min(...pts.map((q) => q.z)),
      maxZ: Math.max(...pts.map((q) => q.z)),
    });
  }
  const line = { samples, runs };
  lines.set(seg, line);
  return line;
}

/** Distance from a point to a free segment's centre line, and which side it lies on. */
function offsetFrom(g: GridState, seg: number, p: MPoint): { d: number; side: number } {
  const { samples, runs } = lineOf(g, seg);
  const boxDistance = (r: SampleRun): number =>
    Math.hypot(Math.max(r.minX - p.x, 0, p.x - r.maxX), Math.max(r.minZ - p.z, 0, p.z - r.maxZ));
  let best = { d: Infinity, side: 0 };
  // Nearest box first; a run whose box is farther than the best found so far
  // cannot hold anything nearer.
  for (const run of [...runs].sort((u, v) => boxDistance(u) - boxDistance(v))) {
    if (boxDistance(run) > best.d) break;
    for (let k = run.from + 1; k <= run.to; k++) {
      const a = samples[k - 1]!;
      const b = samples[k]!;
      const vx = b.x - a.x;
      const vz = b.z - a.z;
      const len2 = vx * vx + vz * vz;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / len2));
      const dx = p.x - (a.x + vx * t);
      const dz = p.z - (a.z + vz * t);
      const d = Math.sqrt(dx * dx + dz * dz);
      // Positive to the right of the way it was drawn.
      if (d < best.d) best = { d, side: Math.sign(-vz * dx + vx * dz) };
    }
  }
  return best;
}

const freeSegs = (g: GridState): number[] => {
  const out: number[] = [];
  for (let s = 0; s < g.roads!.segSlots; s++) {
    if (g.roads!.segLive[s] === 1 && isFreeSegment(g.roads!, s)) out.push(s);
  }
  return out;
};

/**
 * Whether the free-road soup covers a point seen from above, counting only
 * triangles within 30 m of `near` (which is all a junction test looks at).
 * A triangle with no area covers nothing.
 */
function coverage(g: GridState, near: MPoint): (p: MPoint) => boolean {
  const all = freeRoadSoup(g.roads!, noCustom, flat).positions;
  const q: number[] = [];
  for (let i = 0; i < all.length; i += 9) {
    if (Math.hypot(all[i]! - near.x, all[i + 2]! - near.z) < 30) q.push(...all.slice(i, i + 9));
  }
  return (p) => {
    for (let i = 0; i < q.length; i += 9) {
      const ax = q[i]!;
      const az = q[i + 2]!;
      const bx = q[i + 3]!;
      const bz = q[i + 5]!;
      const cx = q[i + 6]!;
      const cz = q[i + 8]!;
      if (Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az)) < 1e-9) continue;
      const d1 = (p.x - bx) * (az - bz) - (ax - bx) * (p.z - bz);
      const d2 = (p.x - cx) * (bz - cz) - (bx - cx) * (p.z - cz);
      const d3 = (p.x - ax) * (cz - az) - (cx - ax) * (p.z - az);
      const neg = d1 < 0 || d2 < 0 || d3 < 0;
      const pos = d1 > 0 || d2 > 0 || d3 > 0;
      if (!(neg && pos)) return true;
    }
    return false;
  };
}

const nearAny = (p: MPoint, points: readonly MPoint[], within: number): boolean =>
  points.some((q) => Math.hypot(p.x - q.x, p.z - q.z) < within);

/** The colour of the topmost free-road triangle over a point, or null where none is. */
function topColourAt(g: GridState, p: MPoint): readonly number[] | null {
  const soup = freeRoadSoup(g.roads!, noCustom, flat);
  const q = soup.positions;
  let bestY = -Infinity;
  let best: readonly number[] | null = null;
  for (let i = 0; i < q.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = q.slice(i, i + 9) as number[];
    const d = (bz! - cz!) * (ax! - cx!) + (cx! - bx!) * (az! - cz!);
    if (Math.abs(d) < 1e-9) continue;
    const wa = ((bz! - cz!) * (p.x - cx!) + (cx! - bx!) * (p.z - cz!)) / d;
    const wb = ((cz! - az!) * (p.x - cx!) + (ax! - cx!) * (p.z - cz!)) / d;
    const wc = 1 - wa - wb;
    if (wa < -1e-9 || wb < -1e-9 || wc < -1e-9) continue;
    const y = wa * ay! + wb * by! + wc * cy!;
    if (y > bestY) {
      bestY = y;
      best = soup.colors.slice(i, i + 3);
    }
  }
  return best;
}

const twoLane = presetProfileForTier(RoadTier.TwoLane);
const HALF = carriagewayHalfWidthOf(twoLane);
const OUTER = HALF + kerbWidthOf(twoLane);

describe('freeRoadSoup', () => {
  it('draws nothing where every road is on the grid', () => {
    const g = world();
    applyRoad(
      g,
      Array.from({ length: 10 }, (_, i) => ({ x: 5 + i, z: 5 })),
      RoadTier.TwoLane,
    );
    settle(g);
    expect(freeRoadSoup(g.roads!, noCustom, flat).positions).toHaveLength(0);
  });

  it('sweeps a curve: kerb to kerb within its cross-section, the road at road height', () => {
    const g = world();
    lay(g, { a: at(200, 200), b: at(500, 500), control: at(500, 200) });
    const [seg] = freeSegs(g);
    const tris = triangles(g);
    expect(tris.length).toBeGreaterThan(100);
    const ends = [
      { x: 200, z: 200 },
      { x: 500, z: 500 },
    ];
    // Gathered and asserted once: one expect a triangle is most of the run.
    const wrong: string[] = [];
    for (const t of tris) {
      const { d } = offsetFrom(g, seg!, t.centroid);
      const at = `${t.centroid.x.toFixed(2)},${t.centroid.z.toFixed(2)}`;
      if (d > OUTER + 1e-6) wrong.push(`outside the cross-section at ${at}`);
      // Footway is up on the kerb, and never in the carriageway — away from
      // the rounded ends, where it wraps the tip across the centre line.
      if (
        sameColor(t.color, SIDEWALK_COLOR) &&
        Math.abs(t.y - CURB_Y_OFFSET) < 1e-9 &&
        !nearAny(t.centroid, ends, OUTER) &&
        d < HALF - 1e-6
      ) {
        wrong.push(`footway in the carriageway at ${at}`);
      }
      if (t.y < ROAD_Y_OFFSET - 1e-9) wrong.push(`below road height at ${at}`);
    }
    expect(wrong).toEqual([]);
  });

  it('turns the inside corners where alleys meet on the alley radius, not square', () => {
    const g = world();
    const hub = at(400, 400);
    lay(g, { tier: RoadTier.Alley, a: hub, b: at(300, 400) });
    lay(g, { tier: RoadTier.Alley, a: hub, b: at(500, 400) });
    lay(g, { tier: RoadTier.Alley, a: hub, b: at(400, 500) });
    const half = carriagewayHalfWidthOf(presetProfileForTier(RoadTier.Alley));
    const r = cornerRadiusOf(presetProfileForTier(RoadTier.Alley));
    expect(r).toBeCloseTo(6.1, 6);
    const covered = coverage(g, { x: 400, z: 400 });
    for (const sx of [-1, 1]) {
      // The fillet between the south arm and the arm on side sx.
      const c = { x: 400 + sx * (half + r), z: 400 + half + r };
      const diag = { x: -sx * Math.SQRT1_2, z: -Math.SQRT1_2 };
      const at = (d: number): MPoint => ({ x: c.x + diag.x * d, z: c.z + diag.z * d });
      // Past the arc the corner is ground; between the arc and the square corner it is paved.
      expect(covered(at(r - 0.4)), `inside the fillet, side ${sx}`).toBe(false);
      expect(covered(at(r + 0.4)), `on the pavement, side ${sx}`).toBe(true);
    }
    // The side opposite the south arm has no corner to turn.
    expect(covered({ x: 400, z: 400 - half - 0.5 })).toBe(false);
  });

  it('builds a junction where three roads meet: no footway crosses another road', () => {
    const g = world();
    const hub = at(400, 400);
    lay(g, { a: hub, b: at(300, 300) });
    lay(g, { a: hub, b: at(560, 360) });
    lay(g, { a: hub, b: at(380, 600) });
    const segs = freeSegs(g);
    expect(segs).toHaveLength(3);
    const footway = triangles(g).filter(
      (t) => sameColor(t.color, SIDEWALK_COLOR) && Math.abs(t.y - CURB_Y_OFFSET) < 1e-9,
    );
    expect(footway.length).toBeGreaterThan(0);
    // The far ends round off, their footway wrapping each tip; the junction
    // is what this looks at.
    const ends = [
      { x: 300, z: 300 },
      { x: 560, z: 360 },
      { x: 380, z: 600 },
    ];
    for (const t of footway) {
      if (nearAny(t.centroid, ends, OUTER)) continue;
      for (const s of segs)
        expect(offsetFrom(g, s, t.centroid).d).toBeGreaterThanOrEqual(HALF - 1e-6);
    }
    // The footway turns every corner: it crosses the line halfway between each
    // pair of neighbouring roads, close to the junction.
    const dirs = [at(300, 300), at(560, 360), at(380, 600)].map((p) => {
      const dx = p.x / 100 - 400;
      const dz = p.z / 100 - 400;
      const l = Math.sqrt(dx * dx + dz * dz);
      return { x: dx / l, z: dz / l, angle: Math.atan2(dz, dx) };
    });
    dirs.sort((p, q) => p.angle - q.angle);
    for (let k = 0; k < dirs.length; k++) {
      const u = dirs[k]!;
      const v = dirs[(k + 1) % dirs.length]!;
      const bx = u.x + v.x;
      const bz = u.z + v.z;
      const bl = Math.sqrt(bx * bx + bz * bz);
      const crosses = footway.some((t) => {
        const px = t.centroid.x - 400;
        const pz = t.centroid.z - 400;
        const along = (px * bx + pz * bz) / bl;
        const across = Math.abs(px * bz - pz * bx) / bl;
        return along > 0 && along < 30 && across < 1;
      });
      expect(crosses, `corner ${k}`).toBe(true);
    }
  });

  it('rounds a dead end off inside the road’s own length, the way a grid road’s end rounds', () => {
    const g = world();
    lay(g, { a: at(200, 200), b: at(400, 200) });
    const kerb = kerbWidthOf(twoLane);
    const pivot = 200 + HALF + kerb;
    const asphalt = surfaceColor(twoLane);
    const tris = triangles(g);
    // Nothing reaches past the node the road ends at.
    for (const t of tris) expect(t.centroid.x).toBeGreaterThanOrEqual(200 - 1e-6);
    // The carriageway ends in a half-disc as wide as itself…
    for (const p of [
      { x: pivot - 1, z: 200 },
      { x: pivot - HALF + 0.3, z: 200 },
      { x: pivot - 1, z: 200 + HALF - 0.8 },
      { x: pivot - 1, z: 200 - HALF + 0.8 },
    ]) {
      expect(sameColor(topColourAt(g, p)!, asphalt), `asphalt at ${p.x}, ${p.z}`).toBe(true);
    }
    // …and the corners a square end would fill are footway, wrapped round it
    // to the tip.
    for (const p of [
      { x: 200 + kerb + 0.3, z: 200 + HALF - 0.3 },
      { x: 200 + kerb + 0.3, z: 200 - HALF + 0.3 },
      { x: 200 + kerb / 2, z: 200 },
    ]) {
      expect(sameColor(topColourAt(g, p)!, SIDEWALK_COLOR), `footway at ${p.x}, ${p.z}`).toBe(true);
    }
    // The edge lines run round the end; the centre line stops where it begins.
    const inCap = (t: Tri): boolean => t.centroid.x < pivot - 0.1;
    const paint = tris.filter((t) => Math.abs(t.y - MARK_Y_OFFSET) < 1e-9);
    expect(paint.some((t) => inCap(t) && sameColor(t.color, MARKING_COLOR))).toBe(true);
    expect(paint.some((t) => inCap(t) && sameColor(t.color, YELLOW_MARKING_COLOR))).toBe(false);
  });

  it('keeps each side’s colour round a one-way road’s rounded end', () => {
    const g = world();
    lay(g, { tier: RoadTier.OneWay, a: at(200, 200), b: at(300, 200), flow: 1 });
    const oneWay = presetProfileForTier(RoadTier.OneWay);
    const pivot = 200 + carriagewayHalfWidthOf(oneWay) + kerbWidthOf(oneWay);
    const inCap = triangles(g).filter(
      (t) => t.centroid.x < pivot - 0.1 && Math.abs(t.y - MARK_Y_OFFSET) < 1e-9,
    );
    // Drawn east, its driver's left is north: yellow wraps only that half.
    const yellow = inCap.filter((t) => sameColor(t.color, YELLOW_MARKING_COLOR));
    const white = inCap.filter((t) => sameColor(t.color, MARKING_COLOR));
    expect(yellow.length).toBeGreaterThan(0);
    expect(white.length).toBeGreaterThan(0);
    for (const t of yellow) expect(t.centroid.z).toBeLessThanOrEqual(200 + 0.2);
    for (const t of white) expect(t.centroid.z).toBeGreaterThanOrEqual(200 - 0.2);
  });

  it('paints a one-way road with its yellow edge on the driver’s left', () => {
    const g = world();
    lay(g, { tier: RoadTier.OneWay, a: at(200, 200), b: at(600, 350), flow: 1 });
    const [seg] = freeSegs(g);
    const yellow = triangles(g).filter(
      (t) => sameColor(t.color, YELLOW_MARKING_COLOR) && Math.abs(t.y - MARK_Y_OFFSET) < 1e-9,
    );
    expect(yellow.length).toBeGreaterThan(0);
    for (const t of yellow) expect(offsetFrom(g, seg!, t.centroid).side).toBe(-1);
  });

  it('draws a grid road it meets only inside the junction’s own tile, and all of it there', () => {
    const g = world();
    applyRoad(
      g,
      Array.from({ length: 21 }, (_, i) => ({ x: 10 + i, z: 20 })),
      RoadTier.TwoLane,
    );
    settle(g);
    lay(g, { a: centre(20, 20), b: at(520, 600) });
    const mouth = { x: 410, z: 410 };
    const tris = triangles(g);
    const alongGridRoad = tris.filter(
      (t) => Math.abs(t.centroid.z - mouth.z) < OUTER && t.centroid.z < mouth.z + HALF,
    );
    for (const t of alongGridRoad) {
      expect(Math.abs(t.centroid.x - mouth.x)).toBeLessThanOrEqual(TILE_METERS / 2 + 1e-6);
    }
    // Carried to both edges of the tile, kerb to kerb, where the tiles beside
    // it take over.
    const covered = coverage(g, mouth);
    for (const x of [mouth.x - TILE_METERS / 2 + 0.2, mouth.x + TILE_METERS / 2 - 0.2]) {
      for (let o = -OUTER + 0.1; o <= OUTER - 0.1; o += 0.5) {
        expect(covered({ x, z: mouth.z + o }), `x ${x} offset ${o.toFixed(1)}`).toBe(true);
      }
    }
  });

  it('keeps each junction on its own tile where free roads carry straight on from both ends of a grid road', () => {
    // Carrying on in line, a junction sets the grid road back by nothing, so
    // it ends exactly at the grid road's end: at its second end that was
    // read as its first, and each junction's kerbs and edge lines were drawn
    // the whole length of the grid road to the other one.
    const g = world();
    applyRoad(
      g,
      Array.from({ length: 16 }, (_, i) => ({ x: 10 + i, z: 20 })),
      RoadTier.TwoLane,
    );
    settle(g);
    lay(g, { a: centre(25, 20), b: at(620, 440), control: at(560, 410) });
    lay(g, { a: centre(10, 20), b: at(100, 380), control: at(160, 410) });
    const onGridRoad = triangles(g).filter(
      (t) => Math.abs(t.centroid.z - 410) < OUTER && t.centroid.x > 210 && t.centroid.x < 510,
    );
    expect(onGridRoad.length).toBeGreaterThan(0);
    for (const t of onGridRoad) {
      const nearEnd = t.centroid.x < 210 + TILE_METERS / 2 || t.centroid.x > 510 - TILE_METERS / 2;
      expect(nearEnd, `triangle at x ${t.centroid.x.toFixed(1)}`).toBe(true);
    }
  });

  it('lays the junction at road height, not over the kerb', () => {
    const g = world();
    applyRoad(
      g,
      Array.from({ length: 21 }, (_, i) => ({ x: 10 + i, z: 20 })),
      RoadTier.TwoLane,
    );
    settle(g);
    lay(g, { a: centre(20, 20), b: at(520, 600) });
    const mouth = { x: 410, z: 410 };
    const inJunction = triangles(g).filter(
      (t) => Math.hypot(t.centroid.x - mouth.x, t.centroid.z - mouth.z) < HALF,
    );
    expect(inJunction.length).toBeGreaterThan(0);
    for (const t of inJunction) expect(t.y).toBeLessThan(CURB_Y_OFFSET);
  });

  it('turns the edge lines round the kerb return between two grid roads a free road meets', () => {
    // A grid corner, north and west, with a free road leaving it east.
    const g = world();
    applyRoad(
      g,
      Array.from({ length: 11 }, (_, i) => ({ x: 20, z: 10 + i })),
      RoadTier.TwoLane,
    );
    applyRoad(
      g,
      Array.from({ length: 11 }, (_, i) => ({ x: 10 + i, z: 20 })),
      RoadTier.TwoLane,
    );
    settle(g);
    lay(g, { a: centre(20, 20), b: at(530, 370), control: at(470, 410) });
    const white = triangles(g).filter(
      (t) => sameColor(t.color, MARKING_COLOR) && Math.abs(t.y - MARK_Y_OFFSET) < 1e-9,
    );
    // The corner between the two grid roads lies up and to the left of the
    // tile centre, clear of both roads' straight edge lines.
    const inCorner = white.filter(
      (t) =>
        t.centroid.x < 410 - HALF + 0.5 &&
        t.centroid.z < 410 - HALF + 0.5 &&
        t.centroid.x > 400 &&
        t.centroid.z > 400,
    );
    expect(inCorner.length).toBeGreaterThan(0);
  });

  it('leaves no gap between the junction and a curve leaving it', () => {
    const g = world();
    applyRoad(
      g,
      Array.from({ length: 11 }, (_, i) => ({ x: 20, z: 10 + i })),
      RoadTier.TwoLane,
    );
    applyRoad(
      g,
      Array.from({ length: 11 }, (_, i) => ({ x: 10 + i, z: 20 })),
      RoadTier.TwoLane,
    );
    settle(g);
    lay(g, { a: centre(20, 20), b: at(530, 370), control: at(470, 410) });
    const [seg] = freeSegs(g);
    const covered = coverage(g, { x: 410, z: 410 });
    // Across the whole road, kerb to kerb, over the first stretch out of the
    // junction, where the curve has already turned from its heading at the node.
    const samples = sampleCentreLine(segmentGeom(g.roads!, seg!));
    for (let s = 0.5; s < 16; s += 0.1) {
      const k = samples.findIndex((q) => q.s > s);
      const a = samples[k - 1]!;
      const b = samples[k]!;
      const f = (s - a.s) / (b.s - a.s);
      const p = { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const nx = -(b.z - a.z) / len;
      const nz = (b.x - a.x) / len;
      for (let o = -OUTER + 0.1; o <= OUTER - 0.1; o += 0.25) {
        const point = { x: p.x + nx * o, z: p.z + nz * o };
        expect(covered(point), `s ${s.toFixed(1)} offset ${o.toFixed(2)}`).toBe(true);
      }
    }
  });
});

describe('freeJunctionTiles', () => {
  it('names the grid tile where a free road meets a grid road', () => {
    const g = world();
    applyRoad(
      g,
      Array.from({ length: 21 }, (_, i) => ({ x: 10 + i, z: 20 })),
      RoadTier.TwoLane,
    );
    settle(g);
    lay(g, { a: centre(20, 20), b: at(520, 600) });
    expect(freeJunctionTiles(g.roads!, noCustom)).toEqual([{ x: 20, z: 20 }]);
  });

  it('names no tile for a junction of free roads alone, nor for roads all on the grid', () => {
    const g = world();
    const hub = at(400, 400);
    lay(g, { a: hub, b: at(300, 300) });
    lay(g, { a: hub, b: at(560, 360) });
    lay(g, { a: hub, b: at(380, 600) });
    expect(freeJunctionTiles(g.roads!, noCustom)).toEqual([]);
    const grid = world();
    applyRoad(
      grid,
      Array.from({ length: 10 }, (_, i) => ({ x: 5 + i, z: 5 })),
      RoadTier.TwoLane,
    );
    settle(grid);
    expect(freeJunctionTiles(grid.roads!, noCustom)).toEqual([]);
  });
});

describe('freeRoadLampStands', () => {
  const powered = (): boolean => true;

  it('stands lamps along a free road at its kerbs, alternating, each reaching across it', () => {
    const g = world();
    lay(g, { a: at(200, 200), b: at(500, 500), control: at(500, 200) });
    const [seg] = freeSegs(g);
    const stands = freeRoadLampStands(g.roads!, noCustom, powered);
    expect(stands.length).toBeGreaterThanOrEqual(8);
    const offset = lampLateralOffset(RoadTier.TwoLane, twoLane);
    const sides = stands.map((s) => {
      const { d, side } = offsetFrom(g, seg!, s);
      expect(d).toBeCloseTo(offset, 1);
      // Reaching the pole's own offset across lands back on the centre line.
      const back = { x: s.x + s.reachX * offset, z: s.z + s.reachZ * offset };
      expect(offsetFrom(g, seg!, back).d).toBeLessThan(0.2);
      return side;
    });
    for (let k = 1; k < sides.length; k++) expect(sides[k]).toBe(-sides[k - 1]!);
  });

  it('stands a wide road’s lamps in facing pairs on its two kerbs, on the tallest pole', () => {
    const g = world();
    lay(g, { tier: RoadTier.Avenue, a: at(200, 200), b: at(500, 500), control: at(500, 200) });
    const [seg] = freeSegs(g);
    const stands = freeRoadLampStands(g.roads!, noCustom, powered);
    expect(stands.length).toBeGreaterThanOrEqual(4);
    expect(stands.length % 2).toBe(0);
    const offset = lampLateralOffset(RoadTier.Avenue, presetProfileForTier(RoadTier.Avenue));
    for (let k = 0; k < stands.length; k += 2) {
      const [a, b] = [stands[k]!, stands[k + 1]!];
      const [oa, ob] = [offsetFrom(g, seg!, a), offsetFrom(g, seg!, b)];
      expect(oa.d).toBeCloseTo(offset, 1);
      expect(ob.d).toBeCloseTo(offset, 1);
      expect(oa.side).toBe(-ob.side);
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeCloseTo(2 * offset, 0);
      expect(a.height).toBe(LAMP_HEIGHTS_M[2]);
    }
  });

  it('stands none where the road has no power, and none on gravel', () => {
    const g = world();
    lay(g, { a: at(200, 200), b: at(500, 260) });
    expect(freeRoadLampStands(g.roads!, noCustom, () => false)).toEqual([]);
    const gravel = world();
    lay(gravel, { tier: RoadTier.Gravel, a: at(200, 200), b: at(500, 260) });
    expect(freeRoadLampStands(gravel.roads!, noCustom, powered)).toEqual([]);
  });

  it('keeps lamps out of a junction', () => {
    const g = world();
    const hub = at(400, 400);
    lay(g, { a: hub, b: at(300, 300) });
    lay(g, { a: hub, b: at(560, 360) });
    lay(g, { a: hub, b: at(380, 600) });
    const stands = freeRoadLampStands(g.roads!, noCustom, powered);
    expect(stands.length).toBeGreaterThan(0);
    for (const s of stands) {
      // Every lamp stands beside exactly one road, clear of the others.
      const near = freeSegs(g).filter((seg) => offsetFrom(g, seg, s).d < HALF);
      expect(near).toEqual([]);
    }
  });
});

describe('a bend where two runs of one road meet', () => {
  const NODE = { x: 480, z: 400 };
  const profileOfTier = (tier: Tier) => presetProfileForTier(tier);
  const radiusOf = (tier: Tier) => () => bendRadiusOf(profileOfTier(tier));

  /** Two straight runs of `arm` metres meeting at NODE, the second turned `deg` degrees off the first's line. */
  function scene(tier: Tier, deg: number, arm = 120, grid = false) {
    const g = world();
    const d = { x: Math.cos((deg * Math.PI) / 180), z: Math.sin((deg * Math.PI) / 180) };
    if (grid) {
      // A grid street ends on a tile, and a free run leaves that tile's centre. The
      // street keeps the direction it was drawn in, as the game stores it.
      const tiles = Array.from({ length: 12 }, (_, i) => ({ x: 13 + i, z: 20 }));
      applyRoad(
        g,
        tiles,
        tier,
        undefined,
        tier,
        false,
        tiles.map(() => RoadFlow.East),
      );
      settle(g);
      const end = centre(24, 20);
      lay(g, { tier, a: end, b: at(end.x / 100 + d.x * arm, end.z / 100 + d.z * arm) });
    } else {
      lay(g, { tier, a: at(NODE.x - arm, NODE.z), b: at(NODE.x, NODE.z) });
      lay(g, { tier, a: at(NODE.x, NODE.z), b: at(NODE.x + d.x * arm, NODE.z + d.z * arm) });
    }
    const found = [...bendsOf(g.roads!, radiusOf(tier)).values()];
    expect(found).toHaveLength(1);
    const bend = found[0]!.bend;
    const soup = freeRoadSoup(g.roads!, noCustom, flat);
    const vertices: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < soup.positions.length; i += 3) {
      vertices.push({
        x: soup.positions[i]!,
        y: soup.positions[i + 1]!,
        z: soup.positions[i + 2]!,
      });
    }
    // Position round the arc's centre: how far out, and the angle off the arc's middle.
    const mid = bend.path[bend.middle]!;
    const bx = mid.x - bend.centre.x;
    const bz = mid.z - bend.centre.z;
    const polar = (p: MPoint) => {
      const wx = p.x - bend.centre.x;
      const wz = p.z - bend.centre.z;
      return {
        r: Math.hypot(wx, wz),
        angle: Math.atan2(bx * wz - bz * wx, bx * wx + bz * wz),
      };
    };
    const edge = bend.path[bend.arc[0]]!;
    const reach = Math.abs(polar(edge).angle) + 1e-6;
    const inArc = (p: MPoint): boolean => Math.abs(polar(p).angle) <= reach;
    return { g, bend, vertices, polar, inArc, reach };
  }

  it('marks a two-way two-lane bend no-passing: two solid yellow lines from its start to its end, met by yellow paint right up to it either side', () => {
    const arm = 120;
    for (const deg of [30, 90, 120]) {
      for (const shift of [0, 2.7, 5.1, 7.9]) {
        const node = { x: NODE.x + shift, z: NODE.z };
        const g = world();
        const d = { x: Math.cos((deg * Math.PI) / 180), z: Math.sin((deg * Math.PI) / 180) };
        lay(g, { a: at(node.x - arm, node.z), b: at(node.x, node.z) });
        lay(g, { a: at(node.x, node.z), b: at(node.x + d.x * arm, node.z + d.z * arm) });
        const bend = [...bendsOf(g.roads!, radiusOf(RoadTier.TwoLane)).values()][0]!.bend;
        const first = bend.path[0]!;
        const last = bend.path[bend.path.length - 1]!;
        const soup = freeRoadSoup(g.roads!, noCustom, flat);
        const label = `${deg} degrees, node shifted ${shift} m`;
        // Every yellow vertex: how far back of the bend's start (negative: along the
        // bend's first run) or past its end, and how far off the centre line.
        const backOf = { near: [] as number[], far: [] as number[] };
        const pairs: number[] = [];
        let centreInBend = 0;
        for (let i = 0; i < soup.positions.length; i += 3) {
          if (!sameColor(soup.colors.slice(i, i + 3), YELLOW_MARKING_COLOR)) continue;
          const x = soup.positions[i]!;
          const z = soup.positions[i + 2]!;
          const before = (x - first.x) * first.hx + (z - first.z) * first.hz;
          const after = (x - last.x) * last.hx + (z - last.z) * last.hz;
          const offFirst = Math.abs((x - first.x) * first.hz - (z - first.z) * first.hx);
          const offLast = Math.abs((x - last.x) * last.hz - (z - last.z) * last.hx);
          if (before < 0.01 && offFirst < 0.31) backOf.near.push(-before);
          else if (after > -0.01 && offLast < 0.31) backOf.far.push(after);
          else if (before >= 0.01 && after <= -0.01) {
            const r = Math.hypot(x - bend.centre.x, z - bend.centre.z);
            const offset = Math.abs(bend.radius - r);
            if (offset < 0.1) centreInBend++;
            else pairs.push(offset);
          }
        }
        // The bend carries no broken line, only the two solid ones either side of the centre.
        expect(centreInBend, label).toBe(0);
        expect(pairs.length, label).toBeGreaterThan(0);
        for (const o of pairs) {
          expect(Math.abs(o - CENTRE_PAIR_OFFSET_M), label).toBeLessThan(PAINT_HALF_WIDTH_M + 0.01);
        }
        // The paint either side reaches the bend: the solid pair runs on along the run up to a dash.
        expect(Math.min(...backOf.near), label).toBeLessThan(0.01);
        expect(Math.min(...backOf.far), label).toBeLessThan(0.01);
      }
    }
  });

  it('runs one unbroken broken line through the bend and across both of its seams', () => {
    const arm = 120;
    const period = DASH_PERIOD_M;
    const minGap = DASH_GAP_LENGTH_M / 2;
    let insideBend = 0;
    for (const deg of [60, 90, 120]) {
      for (const shift of [0, 2.7, 5.1, 7.9]) {
        const node = { x: NODE.x + shift, z: NODE.z };
        const g = world();
        const d = { x: Math.cos((deg * Math.PI) / 180), z: Math.sin((deg * Math.PI) / 180) };
        // A one-way road has no centre line to turn solid: the white line between its
        // two lanes is the broken line, down the middle of the carriageway.
        const one = { tier: RoadTier.OneWay, flow: 1 };
        lay(g, { ...one, a: at(node.x - arm, node.z), b: at(node.x, node.z) });
        lay(g, { ...one, a: at(node.x, node.z), b: at(node.x + d.x * arm, node.z + d.z * arm) });
        const bend = [...bendsOf(g.roads!, radiusOf(RoadTier.OneWay)).values()][0]!.bend;
        const path = bend.path;
        const length = path[path.length - 1]!.s;
        const first = path[0]!;
        const last = path[path.length - 1]!;
        // Where a point of the centre line lies along the whole line: negative
        // before the bend, past `length` after it, by whichever of the run
        // before, the bend and the run after it the point is nearest.
        const along = (x: number, z: number): { t: number; lateral: number } => {
          let best = { lateral: Infinity, t: 0 };
          const consider = (lateral: number, t: number): void => {
            if (lateral < best.lateral) best = { lateral, t };
          };
          const before = (x - first.x) * first.hx + (z - first.z) * first.hz;
          if (before < 0)
            consider(Math.abs((x - first.x) * first.hz - (z - first.z) * first.hx), before);
          const after = (x - last.x) * last.hx + (z - last.z) * last.hz;
          if (after > 0)
            consider(Math.abs((x - last.x) * last.hz - (z - last.z) * last.hx), length + after);
          for (let i = 0; i + 1 < path.length; i++) {
            const p = path[i]!;
            const q = path[i + 1]!;
            const sx = q.x - p.x;
            const sz = q.z - p.z;
            const u = Math.max(
              0,
              Math.min(1, ((x - p.x) * sx + (z - p.z) * sz) / (sx * sx + sz * sz || 1)),
            );
            consider(Math.hypot(x - p.x - sx * u, z - p.z - sz * u), p.s + (q.s - p.s) * u);
          }
          return best;
        };
        const soup = freeRoadSoup(g.roads!, noCustom, flat);
        const ts: number[] = [];
        for (let i = 0; i < soup.positions.length; i += 9) {
          if (!sameColor(soup.colors.slice(i, i + 3), MARKING_COLOR)) continue;
          for (let k = 0; k < 9; k += 3) {
            const { t, lateral } = along(soup.positions[i + k]!, soup.positions[i + k + 2]!);
            if (lateral < 0.2) ts.push(t);
          }
        }
        ts.sort((a, b) => a - b);
        const dashes: [number, number][] = [];
        for (const t of ts) {
          const open = dashes[dashes.length - 1];
          if (open && t - open[1] < 2.5) open[1] = t;
          else dashes.push([t, t]);
        }
        const label = `${deg} degrees, node shifted ${shift} m`;
        const bendDashes = dashes.filter(([a, b]) => a > 0.05 && b < length - 0.05);
        insideBend += bendDashes.length;
        // The bend's dashes are evenly spaced.
        for (let k = 1; k < bendDashes.length; k++) {
          const spacing = bendDashes[k]![0] - bendDashes[k - 1]![0];
          if (k > 1) {
            expect(spacing, label).toBeCloseTo(bendDashes[k - 1]![0] - bendDashes[k - 2]![0], 1);
          }
        }
        // No gap along the line, bend and seams included, is shorter than a half gap.
        for (const [k, run] of dashes.entries()) {
          const next = dashes[k + 1];
          if (!next || run[1] < -60 || next[0] > length + 60) continue;
          expect(next[0] - run[1], `${label}, gap after ${run[1].toFixed(1)}`).toBeGreaterThan(
            minGap - 0.15,
          );
        }
        // Either side of the bend each run keeps its own phase.
        const phaseOf = (start: number, seam: number, seamAlong: number): number =>
          (((start - seamAlong + seam) % period) + period) % period;
        const beforeBend = dashes.filter(([, b]) => b < -0.05 && b > -60).at(-1)!;
        const afterBend = dashes.find(([a]) => a > length + 0.05 && a < length + 60)!;
        const nearPhase = phaseOf(beforeBend[0], arm - bend.setback[0], 0);
        const farPhase = phaseOf(afterBend[0], bend.setback[1], length);
        for (const p of [nearPhase, farPhase]) {
          expect(Math.min(p, period - p), label).toBeLessThan(0.15);
        }
      }
    }
    expect(insideBend).toBeGreaterThan(0);
  });

  it('carries the dash the run before ends in on through a short bend, and keeps every dash 3.05 m', () => {
    const near = { origin: 0, sign: 1 } as const;
    const far = { origin: 5, sign: 1 } as const;
    expect(bendDashes(near, far, 6)).toEqual([[0, DASH_PAINT_LENGTH_M]]);
    // Two dashes closer than half a gap are one dash.
    expect(bendDashes({ origin: 0, sign: 1 }, { origin: 0.95, sign: 1 }, 6)).toEqual([[0, 6]]);
    for (const length of [20, 33, 47]) {
      const dashes = bendDashes(near, far, length);
      expect(dashes.length, `${length} m`).toBeGreaterThan(1);
      for (const [lo, hi] of dashes.slice(1, -1))
        expect(hi - lo).toBeCloseTo(DASH_PAINT_LENGTH_M, 6);
      for (let k = 1; k < dashes.length; k++) {
        expect(dashes[k]![0] - dashes[k - 1]![1]).toBeGreaterThanOrEqual(
          DASH_GAP_LENGTH_M / 2 - 1e-9,
        );
      }
    }
  });

  type PaintRun = { a: number; b: number; at: number };

  /**
   * The paint of one colour a bend and the runs either side carry, as stretches along
   * the road's centre line (`a`..`b`, negative before the bend, past `length` after
   * it) and the offset `at` of each line from it. Each stretch is also given as the
   * line's own length, which round the arc is not the centre line's.
   */
  function paintOf(
    g: GridState,
    tier: Tier,
    colour: readonly number[],
  ): {
    runs: PaintRun[];
    own: (t: number, at: number) => number;
    length: number;
    bend: Bend;
  } {
    const bend = [...bendsOf(g.roads!, radiusOf(tier)).values()][0]!.bend;
    const path = bend.path;
    const first = path[0]!;
    const last = path[path.length - 1]!;
    const line = [
      { x: first.x - first.hx * 100, z: first.z - first.hz * 100, s: -100 },
      ...path.map((p) => ({ x: p.x, z: p.z, s: p.s })),
      { x: last.x + last.hx * 100, z: last.z + last.hz * 100, s: last.s + 100 },
    ];
    const project = (x: number, z: number): { t: number; off: number } => {
      let best = { t: 0, off: 0, d: Infinity };
      for (let i = 0; i + 1 < line.length; i++) {
        const p = line[i]!;
        const q = line[i + 1]!;
        const sx = q.x - p.x;
        const sz = q.z - p.z;
        const len = Math.hypot(sx, sz);
        const u = Math.max(0, Math.min(1, ((x - p.x) * sx + (z - p.z) * sz) / (len * len)));
        const d = Math.hypot(x - p.x - sx * u, z - p.z - sz * u);
        if (d < best.d) {
          best = { t: p.s + (q.s - p.s) * u, off: ((x - p.x) * -sz + (z - p.z) * sx) / len, d };
        }
      }
      return best;
    };
    const length = last.s;
    // A line at offset `at` is shorter round the arc on the inside of the turn, longer on the outside.
    const own = (t: number, at: number): number => {
      if (t <= 0) return t;
      const scale = (k: number): number =>
        k >= bend.arc[0] && k <= bend.arc[1] ? (bend.radius - bend.turn * at) / bend.radius : 1;
      let sum = 0;
      for (let i = 1; i < path.length; i++) {
        const ds = path[i]!.s - path[i - 1]!.s;
        const used = Math.min(1, Math.max(0, (t - path[i - 1]!.s) / ds));
        sum += ds * used * ((scale(i - 1) + scale(i)) / 2);
      }
      return sum + Math.max(0, t - length);
    };
    const soup = freeRoadSoup(g.roads!, noCustom, flat);
    const runs: PaintRun[] = [];
    for (let i = 0; i < soup.positions.length; i += 9) {
      if (!sameColor(soup.colors.slice(i, i + 3), colour)) continue;
      if (Math.abs(soup.positions[i + 1]! - MARK_Y_OFFSET) > 1e-9) continue;
      const v = [0, 3, 6].map((k) => project(soup.positions[i + k]!, soup.positions[i + k + 2]!));
      const ts = v.map((p) => p.t);
      const offs = v.map((p) => p.off);
      if (Math.min(...ts) > length + 45 || Math.max(...ts) < -45) continue;
      runs.push({
        a: Math.min(...ts),
        b: Math.max(...ts),
        at: (Math.min(...offs) + Math.max(...offs)) / 2,
      });
    }
    return { runs, own, length, bend };
  }

  /** The unbroken stretches each line covers, joined where triangles touch. */
  function stretchesOf(runs: readonly PaintRun[], at: number): [number, number][] {
    const out: [number, number][] = [];
    for (const r of runs
      .filter((p) => Math.abs(p.at - at) < LINE_SPREAD_M)
      .sort((p, q) => p.a - q.a)) {
      const open = out[out.length - 1];
      if (open && r.a <= open[1] + 0.06) open[1] = Math.max(open[1], r.b);
      else out.push([r.a, r.b]);
    }
    return out;
  }

  /** Paint lines sit well over this far apart; the offsets one line's triangles measure at differ by less. */
  const LINE_SPREAD_M = 0.12;
  const atsOf = (runs: readonly PaintRun[]): number[] => {
    const out: number[] = [];
    for (const at of runs.map((r) => r.at).sort((p, q) => p - q)) {
      if (out.length === 0 || at - out[out.length - 1]! > LINE_SPREAD_M) out.push(at);
    }
    return out;
  };

  /** A two-lane road's centre line through a bend, free or off a grid street, and the shifts of pattern that put the node on every phase of a dash. */
  const centreScenes: [string, number, boolean, number][] = [30, 60, 90].flatMap((deg) => [
    ...[0, 2.7, 5.1, 7.9, 10.3].map((shift): [string, number, boolean, number] => [
      `${deg} degree free bend, node shifted ${shift} m`,
      deg,
      false,
      shift,
    ]),
    [`${deg} degree bend off a grid street`, deg, true, 0],
  ]);
  for (const [label, deg, grid, shift] of centreScenes) {
    it(`carries a two-lane road's centre line through a ${label} as one solid yellow pair, on the centre line, met by dashes with no gap and no single line`, () => {
      const arm = grid ? 90 : 120;
      const g = world();
      const d = { x: Math.cos((deg * Math.PI) / 180), z: Math.sin((deg * Math.PI) / 180) };
      if (grid) {
        const tiles = Array.from({ length: 12 }, (_, i) => ({ x: 13 + i, z: 20 }));
        applyRoad(
          g,
          tiles,
          RoadTier.TwoLane,
          undefined,
          RoadTier.TwoLane,
          false,
          tiles.map(() => RoadFlow.East),
        );
        settle(g);
        const end = centre(24, 20);
        lay(g, { a: end, b: at(end.x / 100 + d.x * arm, end.z / 100 + d.z * arm) });
      } else {
        const node = { x: NODE.x + shift, z: NODE.z };
        lay(g, { a: at(node.x - arm, node.z), b: at(node.x, node.z) });
        lay(g, { a: at(node.x, node.z), b: at(node.x + d.x * arm, node.z + d.z * arm) });
      }
      const { runs, length, bend } = paintOf(g, RoadTier.TwoLane, YELLOW_MARKING_COLOR);
      const left = stretchesOf(runs, -CENTRE_PAIR_OFFSET_M);
      const right = stretchesOf(runs, CENTRE_PAIR_OFFSET_M);
      const dashes = stretchesOf(runs, 0);
      // One pair, both lines the same stretch, covering the whole bend.
      expect(left).toHaveLength(1);
      expect(right).toHaveLength(1);
      expect(left[0]![0]).toBeCloseTo(right[0]![0], 1);
      expect(left[0]![1]).toBeCloseTo(right[0]![1], 1);
      const [lo, hi] = left[0]!;
      expect(lo).toBeLessThanOrEqual(0.05);
      expect(hi).toBeGreaterThanOrEqual(length - 0.05);
      // It lies on the centre line: each line CENTRE_PAIR_OFFSET_M off it, the pair centred on it.
      for (const r of runs) {
        if (Math.abs(r.at) < 0.03 || r.a < lo - 0.01 || r.b > hi + 0.01) continue;
        expect(Math.abs(Math.abs(r.at) - CENTRE_PAIR_OFFSET_M)).toBeLessThan(0.05);
      }
      // No single solid line: every stretch of the broken line is one dash at most, and none inside the pair.
      for (const [a, b] of dashes) {
        expect(b - a, `dash ${a.toFixed(2)}..${b.toFixed(2)}`).toBeLessThan(
          DASH_PAINT_LENGTH_M + 0.1,
        );
        expect(b <= lo + 0.05 || a >= hi - 0.05, `dash ${a}..${b} inside the pair`).toBe(true);
      }
      // The dash nearest each end of the pair meets it with no gap, and is no stub.
      const after = dashes.find(([a]) => a >= hi - 0.05);
      expect(after).toBeDefined();
      expect(after![0] - hi, 'gap after the pair').toBeLessThan(0.1);
      expect(after![1] - after![0]).toBeGreaterThan(DASH_PAINT_LENGTH_M / 2 - 0.1);
      if (grid) {
        // The street's own tile before the bend paints its dashes on the world's pattern,
        // so the pair starts where one of them ends.
        const k = (bend.path[0]!.x + lo - DASH_PAINT_LENGTH_M) / DASH_PERIOD_M;
        expect(
          Math.abs(k - Math.round(k)) * DASH_PERIOD_M,
          'pair start off a dash end',
        ).toBeLessThan(0.1);
      } else {
        const before = dashes.filter(([, b]) => b <= lo + 0.05).at(-1);
        expect(before).toBeDefined();
        expect(lo - before![1], 'gap before the pair').toBeLessThan(0.1);
        expect(before![1] - before![0]).toBeGreaterThan(DASH_PAINT_LENGTH_M / 2 - 0.1);
      }
    });
  }

  const LANE_CASES: [string, Tier, number, number][] = [
    ['four-lane', RoadTier.FourLane, 30, 0],
    ['four-lane', RoadTier.FourLane, 90, 0],
    ['avenue', RoadTier.Avenue, 30, 0],
    ['avenue', RoadTier.Avenue, 60, 0],
    ['avenue', RoadTier.Avenue, 90, 0],
    ['motorway', RoadTier.Highway, 30, 0],
    ['motorway', RoadTier.Highway, 60, 0],
    ['motorway', RoadTier.Highway, 90, 0],
    ['one-way', RoadTier.OneWay, 30, 1],
    ['one-way', RoadTier.OneWay, 60, 1],
  ];
  for (const [name, tier, deg, flow] of LANE_CASES) {
    for (const shift of [0, 3.3, 7.7]) {
      it(`keeps one dash rhythm on every lane line through a ${deg} degree ${name} bend, node shifted ${shift} m: no gap, no stub`, () => {
        const arm = 120;
        const g = world();
        const node = { x: NODE.x + shift, z: NODE.z };
        const d = { x: Math.cos((deg * Math.PI) / 180), z: Math.sin((deg * Math.PI) / 180) };
        lay(g, { tier, flow, a: at(node.x - arm, node.z), b: at(node.x, node.z) });
        lay(g, {
          tier,
          flow,
          a: at(node.x, node.z),
          b: at(node.x + d.x * arm, node.z + d.z * arm),
        });
        const { runs, own, length } = paintOf(g, tier, MARKING_COLOR);
        let broken = 0;
        for (const lineAt of atsOf(runs)) {
          const stretches = stretchesOf(runs, lineAt);
          if (stretches.length < 2) continue;
          broken++;
          const ownEnd = own(length, lineAt);
          const dashes = stretches.map(([a, b]) => [own(a, lineAt), own(b, lineAt)] as const);
          for (const [k, [a, b]] of dashes.entries()) {
            const label = `line ${lineAt}: dash ${a.toFixed(2)}..${b.toFixed(2)} of a bend ${ownEnd.toFixed(2)} long`;
            // Judge the stretch round the bend: the dashes at the window's edge are cut by it.
            if (k === 0 || k === dashes.length - 1) continue;
            expect(b - a, label).toBeGreaterThan(DASH_PAINT_LENGTH_M / 2 - 0.1);
            expect(b - a, label).toBeLessThan(DASH_PAINT_LENGTH_M * 3.5);
            // A dash the bend draws on its own, between its two ends, is whole (to what the chords of the arc measure).
            if (a > 0.05 && b < ownEnd - 0.05) {
              expect(b - a, label).toBeGreaterThan(DASH_PAINT_LENGTH_M - 0.25);
            }
            const next = dashes[k + 1]!;
            if (k + 1 === dashes.length - 1) continue;
            expect(next[0] - b, `gap after ${label}`).toBeGreaterThan(DASH_GAP_LENGTH_M / 2 - 0.1);
            expect(next[0] - b, `gap after ${label}`).toBeLessThan(DASH_GAP_LENGTH_M * 1.5);
          }
          // Through the bend itself there is always paint: no stretch of a line's own length longer than a gap and a half is bare.
          const covered = dashes.filter(([a, b]) => b > 0 && a < ownEnd);
          expect(covered.length, `line ${lineAt} paints through the bend`).toBeGreaterThan(0);
          let bare = 0;
          let from = 0;
          for (const [a, b] of [...covered, [ownEnd, ownEnd] as const]) {
            bare = Math.max(bare, a - from);
            from = Math.max(from, b);
          }
          expect(bare, `line ${lineAt} bare stretch`).toBeLessThan(DASH_GAP_LENGTH_M * 1.5);
        }
        expect(broken, 'a broken lane line').toBeGreaterThan(0);
      });
    }
  }

  const TIERS: [string, Tier][] = [
    ['two-lane', RoadTier.TwoLane],
    ['avenue', RoadTier.Avenue],
    ['four-lane', RoadTier.FourLane],
    ['gravel', RoadTier.Gravel],
    ['alley', RoadTier.Alley],
  ];
  const DEFLECTIONS = [15, 30, 60, 90, 120];

  for (const [name, tier] of TIERS) {
    const profile = profileOfTier(tier);
    const half = carriagewayHalfWidthOf(profile);
    const outer = half + (hasKerbs(profile) ? kerbWidthOf(profile) : 0);
    const plan = markingPlan(profile, RoadFlow.None);

    const GRID_DEFLECTIONS = [30, 60, 90];
    const cases: [string, number, boolean][] = [
      ...DEFLECTIONS.map((d): [string, number, boolean] => [`${d} degree ${name}`, d, false]),
      ...(tier === RoadTier.TwoLane || tier === RoadTier.Avenue
        ? GRID_DEFLECTIONS.map((d): [string, number, boolean] => [
            `${d} degree ${name} off a grid street`,
            d,
            true,
          ])
        : []),
    ];
    for (const [label, deg, grid] of cases) {
      it(`sweeps a ${label} bend about one centre: no corner, constant offsets, the same ground`, () => {
        const { g, bend, vertices, polar, inArc, reach } = scene(tier, deg, grid ? 90 : 120, grid);
        // The inner kerb holds the class's kerb return, unless the grid tile's half holds less.
        if (bend.setback[0] < TILE_METERS / 2 - 1e-6 || !grid) {
          expect(bend.radius - half).toBeCloseTo(cornerRadiusOf(profile), 2);
        }
        if (grid) {
          // The grid road's cross-section runs on to the tile's edge: the bend's own edges
          // are the same offsets there, to the centimetre.
          const boundary = centre(24, 20).x / 100 - TILE_METERS / 2;
          const across = vertices
            .filter((v) => Math.abs(v.x - boundary) < 1e-6 && Math.abs(v.y - CURB_Y_OFFSET) < 1e-9)
            .map((v) => v.z - centre(24, 20).z / 100);
          expect(across.length).toBeGreaterThan(0);
          expect(Math.min(...across)).toBeCloseTo(-outer, 2);
          expect(Math.max(...across)).toBeCloseTo(outer, 2);
        }

        // The outer edge is a run of short chords whose headings turn a few degrees at a time.
        const outerY = hasKerbs(profile) ? CURB_Y_OFFSET : ROAD_Y_OFFSET;
        const edge = vertices
          .filter((v) => Math.abs(v.y - outerY) < 1e-9 && inArc({ x: v.x, z: v.z }))
          .filter((v) => Math.abs(polar({ x: v.x, z: v.z }).r - (bend.radius + outer)) < 5e-3)
          .map((v) => ({ x: v.x, z: v.z, a: polar({ x: v.x, z: v.z }).angle }))
          .sort((p, q) => p.a - q.a)
          .filter((p, k, all) => k === 0 || Math.abs(p.a - all[k - 1]!.a) > 1e-6);
        expect(edge.length).toBeGreaterThanOrEqual(4);
        for (let k = 2; k < edge.length; k++) {
          const u = { x: edge[k - 1]!.x - edge[k - 2]!.x, z: edge[k - 1]!.z - edge[k - 2]!.z };
          const v = { x: edge[k]!.x - edge[k - 1]!.x, z: edge[k]!.z - edge[k - 1]!.z };
          const turn = Math.atan2(u.x * v.z - u.z * v.x, u.x * v.x + u.z * v.z);
          expect(Math.abs(turn)).toBeLessThan((12 * Math.PI) / 180);
        }

        // Nothing reaches further than the outer edge, and every paint line sits at a constant offset.
        const zone = noPassingPlan(plan);
        const lines = [...zone.solid, ...zone.dashed];
        const wrong: string[] = [];
        for (const v of vertices) {
          const p = { x: v.x, z: v.z };
          if (!inArc(p)) continue;
          const { r, angle } = polar(p);
          // The broken line of the run before the bend ends exactly at the arc's start.
          if (Math.abs(Math.abs(angle) - reach) < 1e-3) continue;
          if (r > bend.radius + outer + 5e-3) wrong.push(`past the outer edge at ${p.x},${p.z}`);
          if (Math.abs(v.y - MARK_Y_OFFSET) > 1e-9) continue;
          const offset = bend.turn * (bend.radius - r);
          const held = lines.some((l) =>
            [-PAINT_HALF_WIDTH_M, PAINT_HALF_WIDTH_M].some(
              (w) => Math.abs(offset - (l.at + w)) < 0.02,
            ),
          );
          if (!held) wrong.push(`paint off every line at ${p.x},${p.z}: offset ${offset}`);
        }
        expect(wrong).toEqual([]);

        // The bend holds no ground a tile outside what the segments' footprint already holds.
        const outside = vertices.filter((v) => {
          const tile = Math.floor(v.z / TILE_METERS) * SIZE + Math.floor(v.x / TILE_METERS);
          return g.roadFootprint[tile] !== 1 && g.roadTier[tile] === 0;
        });
        expect(outside).toEqual([]);
      });
    }
  }

  it('keeps a short run from the arc: no NaN, and the outer edge still turns on an arc', () => {
    for (const [, tier] of TIERS) {
      const profile = profileOfTier(tier);
      const outer =
        carriagewayHalfWidthOf(profile) + (hasKerbs(profile) ? kerbWidthOf(profile) : 0);
      // Runs barely over the shortest a segment may be.
      const { bend, vertices, polar, inArc } = scene(tier, 120, 10.5);
      expect(bend.setback[0]).toBeLessThanOrEqual(10.5 * 0.45 + 1e-3);
      for (const v of vertices) expect(Number.isFinite(v.x + v.y + v.z)).toBe(true);
      const outerY = hasKerbs(profile) ? CURB_Y_OFFSET : ROAD_Y_OFFSET;
      const edge = vertices.filter(
        (v) =>
          Math.abs(v.y - outerY) < 1e-9 &&
          inArc({ x: v.x, z: v.z }) &&
          Math.abs(polar({ x: v.x, z: v.z }).r - (bend.radius + outer)) < 5e-3,
      );
      expect(edge.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('draws a three-arm node as a junction, and two roads of different class as one too', () => {
    const g = world();
    const hub = at(400, 400);
    lay(g, { a: hub, b: at(300, 300) });
    lay(g, { a: hub, b: at(560, 360) });
    lay(g, { a: hub, b: at(380, 600) });
    expect(bendsOf(g.roads!, radiusOf(RoadTier.TwoLane)).size).toBe(0);
    const soup = freeRoadSoup(g.roads!, noCustom, flat);
    // The junction's surface fans out from a vertex on the node.
    const hubAt = (i: number): boolean =>
      Math.abs(soup.positions[i]! - 400) < 1e-6 && Math.abs(soup.positions[i + 2]! - 400) < 1e-6;
    let fanned = false;
    for (let i = 0; i < soup.positions.length; i += 3) fanned = fanned || hubAt(i);
    expect(fanned).toBe(true);

    const mixed = world();
    lay(mixed, { tier: RoadTier.TwoLane, a: at(300, 400), b: at(400, 400) });
    lay(mixed, { tier: RoadTier.Avenue, a: at(400, 400), b: at(480, 470) });
    expect(bendsOf(mixed.roads!, radiusOf(RoadTier.TwoLane)).size).toBe(0);
  });

  it('leaves a grid street and a free run of another class, or a third grid arm, a junction', () => {
    const different = world();
    applyRoad(
      different,
      Array.from({ length: 12 }, (_, i) => ({ x: 13 + i, z: 20 })),
      RoadTier.TwoLane,
    );
    settle(different);
    lay(different, { tier: RoadTier.Avenue, a: centre(24, 20), b: at(560, 480) });
    expect(bendsOf(different.roads!, radiusOf(RoadTier.TwoLane)).size).toBe(0);

    const tee = world();
    applyRoad(
      tee,
      Array.from({ length: 12 }, (_, i) => ({ x: 13 + i, z: 20 })),
      RoadTier.TwoLane,
    );
    applyRoad(
      tee,
      Array.from({ length: 5 }, (_, i) => ({ x: 24, z: 16 + i })),
      RoadTier.TwoLane,
    );
    settle(tee);
    lay(tee, { a: centre(24, 20), b: at(560, 480) });
    expect(bendsOf(tee.roads!, radiusOf(RoadTier.TwoLane)).size).toBe(0);
  });

  it('draws the median at one width and height on the arc and on the run before it', () => {
    const { g, bend, polar, inArc } = scene(RoadTier.Avenue, 90, 90);
    const half = medianHalfWidthOf(profileOfTier(RoadTier.Avenue));
    const soup = freeRoadSoup(g.roads!, noCustom, flat);
    const island: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < soup.positions.length; i += 3) {
      const rgb = soup.colors.slice(i, i + 3);
      const y = soup.positions[i + 1]!;
      if (
        y >= ROAD_Y_OFFSET + MEDIAN_RAISE - 1e-6 &&
        (sameColor(rgb, MEDIAN_GRASS_COLOR) || sameColor(rgb, MEDIAN_CONCRETE_COLOR))
      ) {
        island.push({ x: soup.positions[i]!, y, z: soup.positions[i + 2]! });
      }
    }
    const onArc = island.filter((p) => inArc(p));
    const radii = onArc.map((p) => polar(p).r);
    expect(onArc.length).toBeGreaterThan(0);
    expect(Math.max(...radii) - Math.min(...radii)).toBeCloseTo(2 * half, 3);
    expect((Math.max(...radii) + Math.min(...radii)) / 2).toBeCloseTo(bend.radius, 3);
    // The run before the bend lies along z = 400 m.
    const run = island.filter((p) => p.x < 420 && p.x > 380);
    expect(run.length).toBeGreaterThan(0);
    const across = run.map((p) => p.z - NODE.z);
    expect(Math.max(...across) - Math.min(...across)).toBeCloseTo(2 * half, 3);
    for (const p of island) expect(p.y).toBeCloseTo(ROAD_Y_OFFSET + MEDIAN_RAISE, 6);
  });

  it('ends a median in a yellow-kerbed nose at each end of the road', () => {
    const g = world();
    lay(g, { tier: RoadTier.Avenue, a: at(200, 200), b: at(520, 260) });
    const soup = freeRoadSoup(g.roads!, noCustom, flat);
    const noseKerb: number[] = [];
    for (let i = 0; i < soup.positions.length; i += 3) {
      const raised = soup.positions[i + 1]! >= ROAD_Y_OFFSET + MEDIAN_RAISE - 1e-6;
      if (raised && sameColor(soup.colors.slice(i, i + 3), YELLOW_MARKING_COLOR)) {
        noseKerb.push(soup.positions[i]!);
      }
    }
    expect(noseKerb.some((x) => x < 300)).toBe(true);
    expect(noseKerb.some((x) => x > 420)).toBe(true);
  });

  it('keeps every lamp off the carriageway of a bend', () => {
    for (const deg of [30, 90, 120]) {
      const { g, bend } = scene(RoadTier.TwoLane, deg, 60);
      const stands = freeRoadLampStands(g.roads!, noCustom, () => true);
      expect(stands.length).toBeGreaterThan(0);
      for (const s of stands) {
        const nearest = Math.min(...bend.path.map((p) => Math.hypot(p.x - s.x, p.z - s.z)));
        const alongRuns = freeSegs(g).map((seg) => offsetFrom(g, seg, s).d);
        // Beside a run, never over the bend's own carriageway.
        expect(Math.min(nearest, ...alongRuns)).toBeGreaterThanOrEqual(HALF);
      }
    }
  });
});

describe('a free road’s dead end', () => {
  it('paints no centre line on the rounded cap, only the edge lines round it', () => {
    const tier = RoadTier.FourLane;
    const g = world();
    lay(g, { tier, a: at(100, 200), b: at(220, 200) });
    const profile = presetProfileForTier(tier);
    const pivot =
      Math.min(carriagewayHalfWidthOf(profile), 60 - kerbWidthOf(profile)) + kerbWidthOf(profile);
    const soup = freeRoadSoup(g.roads!, noCustom, flat);
    const edge = Math.abs(markingPlan(profile).edges![0].at);
    const wrong: string[] = [];
    let onCap = 0;
    for (let i = 0; i < soup.positions.length; i += 3) {
      if (Math.abs(soup.positions[i + 1]! - MARK_Y_OFFSET) > 1e-6) continue;
      const x = soup.positions[i]!;
      const pivotX = x > 160 ? 220 - pivot : 100 + pivot;
      if (x > 160 ? x <= pivotX + 0.05 : x >= pivotX - 0.05) continue;
      onCap++;
      // Every mark on the cap lies on the edge line's arc round the pivot.
      const r = Math.hypot(x - pivotX, soup.positions[i + 2]! - 200);
      if (Math.abs(r - edge) > PAINT_HALF_WIDTH_M + 0.01) wrong.push(`radius ${r.toFixed(2)}`);
    }
    expect(onCap).toBeGreaterThan(0);
    expect(wrong).toEqual([]);
  });
});

describe('a free road that carries trams', () => {
  const CUSTOM = 40;
  const base = presetProfileForTier(RoadTier.TwoLane);
  /** Rails in the lanes the cars use. */
  const mixed: RoadProfile = {
    ...base,
    pieces: base.pieces.map((p) => (p.kind === 'travel' ? { ...p, tram: true } : p)),
  };
  /** A reservation of its own down the middle: its trams run on the guideway above it. */
  const reserved: RoadProfile = {
    ...base,
    pieces: [
      ...base.pieces.filter((p) => p.kind !== 'travel' || p.flow === 'back'),
      { kind: 'tram', width: 1.2, flow: 'back' },
      { kind: 'tram', width: 1.2, flow: 'fwd' },
      ...base.pieces.filter((p) => p.kind === 'travel' && p.flow !== 'back'),
    ],
  };
  const lookupOf =
    (profile: RoadProfile) =>
    (id: number): RoadProfile | null =>
      id === CUSTOM ? profile : null;

  function build(profile: RoadProfile, runs: [CmPoint, CmPoint][]) {
    const lookup = lookupOf(profile);
    const g = world();
    for (const [a, b] of runs) {
      const req = { tier: RoadTier.TwoLane, profileId: CUSTOM, a, b, control: null, flow: 0 };
      const p = planSegment(g, g.roads!, req, lookup);
      if (!p.ok) throw new Error(`refused: ${p.reason}`);
      laySegment(g, g.roads!, p, req);
      reconcileRoads(g.roads!, g);
      expect(syncRoadLayers(g, g.roads!)).toEqual([]);
      deriveRoadFootprint(g, g.roads!, lookup);
    }
    const soup = freeRoadSoup(g.roads!, lookup, flat);
    return { g, soup, lookup };
  }

  /** The centroids of every triangle in one colour at one height. */
  function centroids(soup: RoadSoup, color: readonly number[], y: number): MPoint[] {
    const out: MPoint[] = [];
    for (let i = 0; i < soup.positions.length; i += 9) {
      const p = soup.positions;
      if (!sameColor(soup.colors.slice(i, i + 3), color)) continue;
      if (Math.abs(p[i + 1]! - y) > 1e-6) continue;
      out.push({
        x: (p[i]! + p[i + 3]! + p[i + 6]!) / 3,
        z: (p[i + 2]! + p[i + 5]! + p[i + 8]!) / 3,
      });
    }
    return out;
  }

  const railOffsets = (profile: RoadProfile): number[] =>
    markingPlan(profile)
      .bands.filter((b) => b.kind === 'tram')
      .flatMap((b) => {
        const lane = (b.from + b.to) / 2;
        return [lane - TRAM_GAUGE_HALF_M, lane + TRAM_GAUGE_HALF_M];
      });

  it('lays a slab and two rails down each lane the trams share, along the whole straight', () => {
    const { soup } = build(mixed, [[at(100, 200), at(260, 200)]]);
    const rails = centroids(soup, TRAM_RAIL_COLOR, TRAM_RAIL_Y_OFFSET);
    expect(centroids(soup, TRAM_SLAB_COLOR, ROAD_Y_OFFSET + 0.004).length).toBeGreaterThan(0);
    const offsets = railOffsets(mixed);
    expect(offsets).toHaveLength(4);
    for (const rail of rails) {
      const nearest = Math.min(...offsets.map((o) => Math.abs(rail.z - 200 - o)));
      expect(nearest).toBeLessThan(0.05);
    }
    for (const o of offsets) expect(rails.some((r) => Math.abs(r.z - 200 - o) < 0.05)).toBe(true);
    expect(Math.min(...rails.map((r) => r.x))).toBeLessThan(110);
    expect(Math.max(...rails.map((r) => r.x))).toBeGreaterThan(250);
  });

  it('carries the rails round a bend on the road’s own arc, from one run to the next', () => {
    const node = { x: 480, z: 400 };
    const { g, soup } = build(mixed, [
      [at(node.x - 120, node.z), at(node.x, node.z)],
      [at(node.x, node.z), at(node.x, node.z + 120)],
    ]);
    const bend = [...bendsOf(g.roads!, () => bendRadiusOf(mixed)).values()][0]!.bend;
    const rails = centroids(soup, TRAM_RAIL_COLOR, TRAM_RAIL_Y_OFFSET);
    const mid = bend.path[bend.middle]!;
    const onArc = rails.filter((r) => Math.hypot(r.x - mid.x, r.z - mid.z) < 6);
    expect(onArc.length).toBeGreaterThan(0);
    const offsets = railOffsets(mixed).map(Math.abs);
    // Within the arc's own angle, every rail lies at a rail's offset from the arc's centre line.
    const bx = mid.x - bend.centre.x;
    const bz = mid.z - bend.centre.z;
    const edge = bend.path[bend.arc[0]]!;
    const reach = Math.abs(
      Math.atan2(
        bx * (edge.z - bend.centre.z) - bz * (edge.x - bend.centre.x),
        bx * (edge.x - bend.centre.x) + bz * (edge.z - bend.centre.z),
      ),
    );
    const angleOf = (p: MPoint): number =>
      Math.abs(
        Math.atan2(
          bx * (p.z - bend.centre.z) - bz * (p.x - bend.centre.x),
          bx * (p.x - bend.centre.x) + bz * (p.z - bend.centre.z),
        ),
      );
    const arcRails = rails.filter((q) => angleOf(q) < reach - 0.05);
    expect(arcRails.length).toBeGreaterThan(0);
    for (const r of arcRails) {
      const d = Math.abs(Math.hypot(r.x - bend.centre.x, r.z - bend.centre.z) - bend.radius);
      expect(Math.min(...offsets.map((o) => Math.abs(d - o)))).toBeLessThan(0.1);
    }
    // Both runs either side of the bend carry rails too: the track never breaks.
    expect(rails.some((r) => r.x < node.x - 40)).toBe(true);
    expect(rails.some((r) => r.z > node.z + 40)).toBe(true);
  });

  it('paints no centre line between two lanes that carry rails', () => {
    const { soup } = build(mixed, [[at(100, 200), at(260, 200)]]);
    expect(centroids(soup, YELLOW_MARKING_COLOR, MARK_Y_OFFSET)).toEqual([]);
  });

  it('draws a reservation as the raised median its guideway stands in, and no track at grade', () => {
    const { soup } = build(reserved, [[at(100, 200), at(260, 200)]]);
    expect(centroids(soup, TRAM_RAIL_COLOR, TRAM_RAIL_Y_OFFSET)).toEqual([]);
    const raised = centroids(soup, MEDIAN_GRASS_COLOR, ROAD_Y_OFFSET + MEDIAN_RAISE);
    expect(raised.length).toBeGreaterThan(0);
    const across = raised.map((p) => p.z - 200);
    expect(Math.max(...across) - Math.min(...across)).toBeLessThanOrEqual(2.4 + 1e-6);
    expect(Math.max(...across) - Math.min(...across)).toBeGreaterThan(1);
  });

  it('draws no track on a road whose lanes carry no trams', () => {
    const { soup } = build(base, [[at(100, 200), at(260, 200)]]);
    expect(centroids(soup, TRAM_RAIL_COLOR, TRAM_RAIL_Y_OFFSET)).toEqual([]);
  });

  const tee: [CmPoint, CmPoint][] = [
    [at(100, 200), at(200, 200)],
    [at(200, 200), at(300, 200)],
    [at(200, 200), at(200, 300)],
  ];
  const inBox = (rails: MPoint[]): MPoint[] =>
    rails.filter((r) => Math.hypot(r.x - 200, r.z - 200) < 5);

  it('carries the rails through a junction of tram roads, straight on and round each turn', () => {
    const { soup } = build(mixed, tee);
    const rails = inBox(centroids(soup, TRAM_RAIL_COLOR, TRAM_RAIL_Y_OFFSET));
    expect(rails.length).toBeGreaterThan(0);
    // Straight along the main road, and a turn into the side road from each end of it.
    expect(rails.some((r) => Math.abs(r.z - 200) < 2.5 && Math.abs(r.x - 200) < 1)).toBe(true);
    expect(rails.some((r) => r.x > 201 && r.z > 202)).toBe(true);
    expect(rails.some((r) => r.x < 199 && r.z > 202)).toBe(true);
    expect(inBox(centroids(soup, TRAM_SLAB_COLOR, ROAD_Y_OFFSET + 0.004)).length).toBeGreaterThan(
      0,
    );
  });

  it('lays no track in a junction of roads that carry no trams', () => {
    const { soup } = build(base, tee);
    expect(centroids(soup, TRAM_RAIL_COLOR, TRAM_RAIL_Y_OFFSET)).toEqual([]);
  });

  it('lays no track at grade through a junction of reservations', () => {
    const { soup } = build(reserved, tee);
    expect(centroids(soup, TRAM_RAIL_COLOR, TRAM_RAIL_Y_OFFSET)).toEqual([]);
  });
});

describe('a free road’s reserved lane symbols', () => {
  /** A straight free road of a preset tier along z = 200, 100 m to 300 m. */
  function straight(tier: Tier): RoadSoup {
    const g = world();
    lay(g, { tier, a: at(100, 200), b: at(400, 200) });
    return freeRoadSoup(g.roads!, noCustom, flat);
  }

  /** The x centre of each run of white marks lying mid-lane in a reserved lane: one per symbol. */
  function symbolCentres(soup: RoadSoup, tier: Tier, kind: 'bus' | 'bike'): number[] {
    const mids = markingPlan(presetProfileForTier(tier))
      .bands.filter((b) => b.kind === kind)
      .map((b) => (b.from + b.to) / 2);
    const xs: number[] = [];
    for (let i = 0; i < soup.positions.length; i += 9) {
      const p = soup.positions;
      if (!sameColor(soup.colors.slice(i, i + 3), MARKING_COLOR)) continue;
      if (Math.abs(p[i + 1]! - MARK_Y_OFFSET) > 1e-6) continue;
      const z = (p[i + 2]! + p[i + 5]! + p[i + 8]!) / 3 - 200;
      // Clear of the lane's own edge lines.
      if (!mids.some((m) => Math.abs(z - m) < 0.9)) continue;
      xs.push((p[i]! + p[i + 3]! + p[i + 6]!) / 3);
    }
    xs.sort((a, b) => a - b);
    const runs: number[][] = [];
    for (const x of xs) {
      const last = runs.at(-1);
      if (last && x - last.at(-1)! < 3) last.push(x);
      else runs.push([x]);
    }
    return runs.map((r) => (r[0]! + r.at(-1)!) / 2);
  }

  it.each([
    [RoadTier.BusLane, 'bus'],
    [RoadTier.BikeLane, 'bike'],
  ] as const)('lays a tier %i symbol along each lane at the grid spacing', (tier, kind) => {
    const centres = symbolCentres(straight(tier), tier, kind);
    const lanes = markingPlan(presetProfileForTier(tier)).bands.filter((b) => b.kind === kind);
    expect(lanes.length).toBeGreaterThan(0);
    // 200 m of road at one symbol every 3 tiles: three or more along it.
    expect(centres.length).toBeGreaterThanOrEqual(3);
    const spacing = TILE_METERS * 3;
    const distinct = centres.filter((c, k) => k === 0 || Math.abs(c - centres[k - 1]!) > 1);
    for (let k = 1; k < distinct.length; k++) {
      const gap = distinct[k]! - distinct[k - 1]!;
      expect(Math.abs(gap - spacing)).toBeLessThan(1);
    }
  });

  it('lays no symbol on a road with no reserved lane', () => {
    expect(symbolCentres(straight(RoadTier.TwoLane), RoadTier.BusLane, 'bus')).toEqual([]);
  });
});

describe('FreeRoadRenderer — night tint', () => {
  it('carries the one night tint as a shader uniform on a vertex-coloured Lambert node material', () => {
    const g = world();
    lay(g, { a: at(200, 200), b: at(500, 500), control: at(500, 200) });
    const scene = new THREE.Scene();
    const renderer = new FreeRoadRenderer(scene, flat, noCustom);
    renderer.rebuild(g.roads!);
    const mesh = scene.children[0] as THREE.Mesh;
    const material = mesh.material as MeshLambertNodeMaterial;
    expect(material).toBeInstanceOf(MeshLambertNodeMaterial);
    expect(material.vertexColors).toBe(true);
    expect(material.colorNode).not.toBeNull();
    expect(renderer.nightFactor()).toBe(0);
    renderer.setNightFactor(1);
    expect(renderer.nightFactor()).toBe(1);
    renderer.setNightFactor(9);
    expect(renderer.nightFactor()).toBe(1);
    expect(material.color.toArray()).toEqual([1, 1, 1]);
  });
});
