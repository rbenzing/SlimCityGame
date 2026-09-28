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

/** Distance from a point to a free segment's centre line, and which side it lies on. */
function offsetFrom(g: GridState, seg: number, p: MPoint): { d: number; side: number } {
  const samples = sampleCentreLine(segmentGeom(g.roads!, seg));
  let best = { d: Infinity, side: 0 };
  for (let k = 1; k < samples.length; k++) {
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
  return best;
}

const freeSegs = (g: GridState): number[] => {
  const out: number[] = [];
  for (let s = 0; s < g.roads!.segSlots; s++) {
    if (g.roads!.segLive[s] === 1 && isFreeSegment(g.roads!, s)) out.push(s);
  }
  return out;
};

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
    for (const t of tris) {
      const { d } = offsetFrom(g, seg!, t.centroid);
      expect(d).toBeLessThanOrEqual(OUTER + 1e-6);
      // Footway is up on the kerb, and never in the carriageway.
      if (sameColor(t.color, SIDEWALK_COLOR) && Math.abs(t.y - CURB_Y_OFFSET) < 1e-9) {
        expect(d).toBeGreaterThanOrEqual(HALF - 1e-6);
      }
      expect(t.y).toBeGreaterThanOrEqual(ROAD_Y_OFFSET - 1e-9);
    }
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
    for (const t of footway) {
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
    // Carried to both edges of the tile, where the tiles beside it take over.
    const asphalt = alongGridRoad.filter((t) => Math.abs(t.y - ROAD_Y_OFFSET) < 1e-9);
    expect(asphalt.some((t) => t.centroid.x < mouth.x - TILE_METERS / 2 + 1)).toBe(true);
    expect(asphalt.some((t) => t.centroid.x > mouth.x + TILE_METERS / 2 - 1)).toBe(true);
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
    const all = freeRoadSoup(g.roads!, noCustom, flat).positions;
    // Only what lies near the junction can cover the stretch out of it.
    const q: number[] = [];
    for (let i = 0; i < all.length; i += 9) {
      if (Math.hypot(all[i]! - 410, all[i + 2]! - 410) < 30) q.push(...all.slice(i, i + 9));
    }
    const covered = (p: MPoint): boolean => {
      for (let i = 0; i < q.length; i += 9) {
        const ax = q[i]!;
        const az = q[i + 2]!;
        const bx = q[i + 3]!;
        const bz = q[i + 5]!;
        const cx = q[i + 6]!;
        const cz = q[i + 8]!;
        // A triangle with no area seen from above covers nothing.
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
