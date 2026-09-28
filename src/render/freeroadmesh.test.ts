import { describe, expect, it } from 'vitest';
import { sampleCentreLine, tileCentreCm } from '../shared/roadgeom';
import type { CmPoint, MPoint } from '../shared/roadgeom';
import { carriagewayHalfWidthOf, kerbWidthOf, presetProfileForTier } from '../shared/roadprofile';
import { RoadTier } from '../shared/types';
import type { GridState, RoadTier as Tier } from '../shared/types';
import { createGrid } from '../world/grid';
import { applyRoad } from '../world/roads';
import { deriveRoadFootprint, laySegment, planSegment } from '../world/freeroads';
import {
  isFreeSegment,
  networkFromGrid,
  reconcileRoads,
  segmentGeom,
  syncRoadLayers,
} from '../world/roadnet';
import { TILE_METERS } from '../shared/constants';
import { freeJunctionTiles, freeRoadLampStands, freeRoadSoup } from './freeroadmesh';
import { lampLateralOffset } from './lamps';
import {
  CURB_Y_OFFSET,
  MARKING_COLOR,
  MARK_Y_OFFSET,
  ROAD_Y_OFFSET,
  SIDEWALK_COLOR,
  YELLOW_MARKING_COLOR,
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
    lay(g, { a: at(200, 200), b: at(300, 200) });
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
