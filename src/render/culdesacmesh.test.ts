import { describe, expect, it } from 'vitest';
import { CUL_DE_SAC_RADIUS_M } from '../shared/culdesac';
import { carriagewayHalfWidthOf, presetProfileForTier } from '../shared/roadprofile';
import { RoadFlow, RoadTier } from '../shared/types';
import {
  bulbLineRun,
  culDeSacVertices,
  kerbReturnOf,
  type BulbStreet,
  type BulbStyle,
} from './culdesacmesh';
import { markingPlan } from './roadmarkings';
import { paintBulbStreet } from './roadsmesh';

const STYLE: BulbStyle = {
  plate: [0.4, 0.4, 0.4],
  footway: [0.8, 0.8, 0.8],
  roadY: 0.15,
  curbY: 0.23,
};
const flat = (): number => 0;
const street = (side: BulbStreet['side'], lateral: number): BulbStreet => ({
  side,
  lateral,
  half: 4,
  kerb: 1.875,
});

/** The vertices of one colour as world-local [x, z] triples of triangles. */
function trianglesOf(
  g: ReturnType<typeof culDeSacVertices>,
  colour: readonly number[],
): number[][][] {
  const out: number[][][] = [];
  for (let v = 0; v + 2 < g.colors.length / 3; v += 3) {
    const same = [0, 1, 2].every((k) =>
      [0, 1, 2].every((c) => Math.abs(g.colors[(v + k) * 3 + c]! - colour[c]!) < 1e-6),
    );
    if (!same) continue;
    out.push([0, 1, 2].map((k) => [g.positions[(v + k) * 3]!, g.positions[(v + k) * 3 + 2]!]));
  }
  return out;
}

describe('the turning circle drawn', () => {
  const cases: [string, BulbStreet][] = [
    ['street from the east, on the south', street(RoadFlow.East, 10)],
    ['street from the east, on the north', street(RoadFlow.East, -10)],
    ['street from the north, on the east', street(RoadFlow.North, 10)],
    ['street from the south, on the west', street(RoadFlow.South, -10)],
  ];

  it.each(cases)('stays inside its 40 m block: %s', (_name, s) => {
    const g = culDeSacVertices(0, 0, s, flat, STYLE);
    expect(g.positions.length).toBeGreaterThan(0);
    for (let i = 0; i < g.positions.length; i += 3) {
      expect(Math.abs(g.positions[i]!)).toBeLessThanOrEqual(20 + 1e-6);
      expect(Math.abs(g.positions[i + 2]!)).toBeLessThanOrEqual(20 + 1e-6);
    }
  });

  it.each(cases)('is asphalt to its full radius, and footway only beyond it: %s', (_name, s) => {
    const g = culDeSacVertices(0, 0, s, flat, STYLE);
    const radius = (t: number[][]): number => Math.max(...t.map(([x, z]) => Math.hypot(x!, z!)));
    const asphalt = trianglesOf(g, STYLE.plate);
    expect(Math.max(...asphalt.map(radius))).toBeGreaterThan(CUL_DE_SAC_RADIUS_M - 0.2);
    // No footway inside the asphalt of the circle, and none beyond the footway's own width.
    const walk = trianglesOf(g, STYLE.footway);
    expect(walk.length).toBeGreaterThan(0);
    const ring = walk.filter((t) => t.every(([x, z]) => Math.hypot(x!, z!) < 17));
    for (const t of ring)
      for (const [x, z] of t)
        expect(Math.hypot(x!, z!)).toBeGreaterThan(CUL_DE_SAC_RADIUS_M - 0.01);
  });

  it.each(cases)('draws no verge, so the corners keep the terrain colour: %s', (_name, s) => {
    const g = culDeSacVertices(0, 0, s, flat, STYLE);
    // Everything drawn is road or footway, in the street's own colours; the ground
    // beyond the ring, the kerb return and the street is the terrain's.
    const total = g.colors.length / 3;
    const drawn = [STYLE.plate, STYLE.footway].reduce(
      (n, c) => n + trianglesOf(g, c).length * 3,
      0,
    );
    expect(drawn).toBe(total);
    // Nothing reaches the corners of the block.
    for (let i = 0; i < g.positions.length; i += 3) {
      const inCorner = Math.abs(g.positions[i]!) > 16.5 && Math.abs(g.positions[i + 2]!) > 16.5;
      expect(inCorner).toBe(false);
    }
  });

  it('follows the terrain', () => {
    const g = culDeSacVertices(0, 0, street(RoadFlow.East, 10), (x) => x * 0.1, STYLE);
    for (let i = 0; i < g.positions.length; i += 3) {
      expect(g.positions[i + 1]! - g.positions[i]! * 0.1).toBeGreaterThan(0.09);
    }
  });
});

describe("the street's lines in the block", () => {
  const plan = markingPlan(presetProfileForTier(RoadTier.TwoLane));
  const cases: [string, BulbStreet][] = [
    ['from the south, on the east', street(RoadFlow.South, 10)],
    ['from the north, on the west', street(RoadFlow.North, -10)],
    ['from the east, on the south', street(RoadFlow.East, 10)],
    ['from the west, on the north', street(RoadFlow.West, -10)],
  ];
  const paintOf = (s: BulbStreet): { positions: number[]; colors: number[] } => {
    const into = { positions: [] as number[], colors: [] as number[] };
    paintBulbStreet(
      into,
      plan,
      { ...s, half: carriagewayHalfWidthOf(presetProfileForTier(RoadTier.TwoLane)) },
      { x: 0, z: 0 },
      flat,
    );
    return into;
  };

  it.each(cases)('run on from the block edge to the circle and end there: %s', (_name, s) => {
    const { positions } = paintOf(s);
    expect(positions.length).toBeGreaterThan(0);
    let reach = Infinity;
    let edge = 0;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i]!;
      const z = positions[i + 2]!;
      // No paint on the circle, and none beyond the block.
      expect(Math.hypot(x, z)).toBeGreaterThan(CUL_DE_SAC_RADIUS_M - 0.1);
      expect(Math.max(Math.abs(x), Math.abs(z))).toBeLessThanOrEqual(20 + 1e-6);
      reach = Math.min(reach, Math.hypot(x, z));
      edge = Math.max(edge, Math.max(Math.abs(x), Math.abs(z)));
    }
    // The lines meet the circle's edge, and start at the block's, where the street's own tile ends them.
    expect(reach).toBeLessThan(CUL_DE_SAC_RADIUS_M + 0.1);
    expect(edge).toBeCloseTo(20, 6);
  });

  it('ends each line on the circle at its own offset', () => {
    const s = street(RoadFlow.South, 10);
    const run = bulbLineRun(s, 0)!;
    expect(run.u).toBeCloseTo(10, 9);
    expect(Math.hypot(run.s0, run.u)).toBeCloseTo(CUL_DE_SAC_RADIUS_M, 9);
    expect(run.s1).toBe(20);
    expect(bulbLineRun(s, 5.5)).toBeNull();
  });
});

describe('the kerb return', () => {
  it('stands inside the block where the street meets the circle', () => {
    const r = kerbReturnOf(6);
    expect(r).not.toBeNull();
    expect(r!.s).toBeLessThanOrEqual(20);
    expect(Math.hypot(r!.s, r!.u)).toBeCloseTo(CUL_DE_SAC_RADIUS_M + r!.radius, 6);
  });
});
