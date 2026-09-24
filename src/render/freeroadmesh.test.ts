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
import { freeRoadSoup } from './freeroadmesh';
import {
  CURB_Y_OFFSET,
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

  it('meets a grid road at its mouth without drawing along the grid road', () => {
    const g = world();
    applyRoad(
      g,
      Array.from({ length: 21 }, (_, i) => ({ x: 10 + i, z: 20 })),
      RoadTier.TwoLane,
    );
    settle(g);
    lay(g, { a: centre(20, 20), b: at(520, 600) });
    const mouth = { x: 410, z: 410 };
    for (const t of triangles(g)) {
      const onGridRoad = Math.abs(t.centroid.z - mouth.z) < OUTER;
      if (onGridRoad) expect(Math.abs(t.centroid.x - mouth.x)).toBeLessThan(40);
    }
  });
});
