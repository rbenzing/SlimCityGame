import { describe, expect, it } from 'vitest';
import {
  RAILWAY_GAUGE_HALF_M,
  RAILWAY_RAIL_HALF_W_M,
  RAILWAY_RAIL_Y_OFFSET,
  RAIL_HALF_WIDTH_FRACTION,
  STANDARD_GAUGE_M,
  TRAM_GAUGE_HALF_M,
  TRAM_RAIL_Y_OFFSET,
  roadTileVertices,
} from './roadsmesh';
import type { NeighborTiers } from './roadsmesh';
import { allMovements, pathAt, trackPaths } from './trackpaths';
import type { TrackPath, TrackSide } from './trackpaths';
import { markingPlan } from './roadmarkings';
import { presetProfileForTier } from '../shared/roadprofile';
import { RoadTier } from '../shared/types';
import { TILE_METERS } from '../shared/constants';

const flat = (): number => 0;
const BITS: Record<TrackSide, number> = { n: 1, e: 2, s: 4, w: 8 };
const CENTRE = 3.5 * TILE_METERS;
const GAUGE_TOLERANCE_M = 0.02;

type Tri = [number, number][];

/** The triangles (x/z) of every vertex triple whose height is `y`. */
function trianglesAt(v: { positions: number[] }, y: number): Tri[] {
  const out: Tri[] = [];
  for (let i = 0; i + 9 <= v.positions.length; i += 9) {
    const ys = [1, 4, 7].map((k) => v.positions[i + k]!);
    if (ys.some((h) => Math.abs(h - y) > 1e-6)) continue;
    out.push(
      [0, 3, 6].map((k) => [v.positions[i + k]! - CENTRE, v.positions[i + k + 2]! - CENTRE]),
    );
  }
  return out;
}

function inside(tri: Tri, x: number, z: number): boolean {
  const eps = 1e-6;
  const [a, b, c] = tri as [[number, number], [number, number], [number, number]];
  const side = (p: [number, number], q: [number, number]): number =>
    (q[0] - p[0]) * (z - p[1]) - (q[1] - p[1]) * (x - p[0]);
  const d = [side(a, b), side(b, c), side(c, a)];
  return d.every((s) => s >= -eps) || d.every((s) => s <= eps);
}

const covered = (tris: Tri[], x: number, z: number): boolean => tris.some((t) => inside(t, x, z));

/** The point `d` to the side of a path at distance `s` along it. */
function railPoint(path: TrackPath, s: number, d: number): [number, number] {
  const p = pathAt(path, s);
  return [p.x + p.nx * d, p.z + p.nz * d];
}

/** Both rails of a path are drawn, unbroken, from the edge of one arm to the edge of the other. */
function expectUnbroken(
  tris: Tri[],
  path: TrackPath,
  gaugeHalf: number,
  halfW: number,
  tag: string,
): void {
  for (let s = 0; s <= path.length + 1e-9; s += 0.25) {
    const at = Math.min(s, path.length);
    for (const side of [1, -1]) {
      const [x, z] = railPoint(path, at, side * gaugeHalf);
      expect(covered(tris, x, z), `${tag} rail ${side} gap at s=${at.toFixed(2)}`).toBe(true);
    }
  }
  // Gauge: the head's inner face is where the standard gauge puts it, not nearer the centre.
  const mid = path.length / 2;
  const inner = gaugeHalf - halfW;
  for (const side of [1, -1]) {
    const [ix, iz] = railPoint(path, mid, side * (inner - GAUGE_TOLERANCE_M));
    const [ox, oz] = railPoint(path, mid, side * (inner + GAUGE_TOLERANCE_M));
    expect(covered(tris, ix, iz), `${tag} head inside the gauge`).toBe(false);
    expect(covered(tris, ox, oz), `${tag} head outside the gauge face`).toBe(true);
  }
}

describe('track paths', () => {
  it('runs every movement edge to edge, a turn on the circle about the shared corner', () => {
    const paths = trackPaths(allMovements(['n', 'e', 's', 'w']), [0]);
    expect(paths).toHaveLength(6);
    const edge = { n: [0, -10], s: [0, 10], e: [10, 0], w: [-10, 0] } as const;
    for (const p of paths) {
      const first = p.samples[0]!;
      const last = p.samples[p.samples.length - 1]!;
      expect([first.x, first.z]).toEqual(edge[p.from].map((c) => expect.closeTo(c, 9)));
      expect([last.x, last.z]).toEqual(edge[p.to].map((c) => expect.closeTo(c, 9)));
      if (p.arc) {
        for (const s of p.samples) {
          expect(Math.hypot(s.x - p.arc.px, s.z - p.arc.pz)).toBeCloseTo(p.arc.r, 9);
        }
      }
    }
  });

  it('keeps the lanes of a turn concentric', () => {
    const paths = trackPaths([['n', 'e']], [-1.875, 1.875]);
    expect(paths).toHaveLength(2);
    expect(paths[0]!.arc!.px).toBe(paths[1]!.arc!.px);
    expect(paths[0]!.arc!.pz).toBe(paths[1]!.arc!.pz);
    expect(Math.abs(paths[0]!.arc!.r - paths[1]!.arc!.r)).toBeCloseTo(3.75, 9);
  });
});

describe('railway track through a tile', () => {
  const rail = (arms: TrackSide[]): { positions: number[]; colors: number[] } =>
    roadTileVertices(
      3,
      3,
      RoadTier.RailTrack,
      arms.reduce((m, a) => m | BITS[a], 0),
      flat,
    );
  const railTris = (arms: TrackSide[]): Tri[] => trianglesAt(rail(arms), RAILWAY_RAIL_Y_OFFSET);

  it('keeps the gauge standard on the straight run', () => {
    expect(2 * (RAILWAY_GAUGE_HALF_M - RAILWAY_RAIL_HALF_W_M)).toBeCloseTo(STANDARD_GAUGE_M, 9);
  });

  const shapes: [string, TrackSide[]][] = [
    ['a bend', ['n', 'e']],
    ['a T', ['n', 's', 'e']],
    ['a cross', ['n', 'e', 's', 'w']],
  ];
  for (const [name, arms] of shapes) {
    it(`draws unbroken rails for every linked pair of arms on ${name}`, () => {
      const tris = railTris(arms);
      expect(tris.length).toBeGreaterThan(0);
      const paths = trackPaths(allMovements(arms), [0]);
      for (const p of paths) {
        // A junction's rails cross each other, so the gauge probe reads only a lone bend.
        if (arms.length === 2) {
          expectUnbroken(tris, p, RAILWAY_GAUGE_HALF_M, RAILWAY_RAIL_HALF_W_M, `${p.from}-${p.to}`);
          continue;
        }
        for (let s = 0; s <= p.length + 1e-9; s += 0.25) {
          for (const side of [1, -1]) {
            const [x, z] = railPoint(p, Math.min(s, p.length), side * RAILWAY_GAUGE_HALF_M);
            expect(covered(tris, x, z), `${p.from}-${p.to} gap at ${s}`).toBe(true);
          }
        }
      }
    });
  }

  it('lays no ballast beyond what the rails cover at a junction', () => {
    const coreHalf = TILE_METERS * RAIL_HALF_WIDTH_FRACTION;
    const v = rail(['n', 'e', 's', 'w']);
    const paths = trackPaths(allMovements(['n', 'e', 's', 'w']), [0]);
    const ballast = trianglesAt(v, 0.15);
    expect(ballast.length).toBeGreaterThan(0);
    for (const tri of ballast) {
      for (const [x, z] of tri) {
        let best = Infinity;
        for (const p of paths) {
          for (let s = 0; s <= p.length; s += 0.05) {
            const q = pathAt(p, s);
            best = Math.min(best, Math.hypot(q.x - x, q.z - z));
          }
        }
        expect(best).toBeLessThanOrEqual(coreHalf + 0.05);
      }
    }
  });
});

describe('street tram track through a tile', () => {
  const tramLanes = markingPlan(presetProfileForTier(RoadTier.Tram))
    .bands.filter((b) => b.kind === 'tram')
    .map((b) => (b.from + b.to) / 2);
  const around = (arms: TrackSide[], track: TrackSide[]): NeighborTiers => {
    const tier = (s: TrackSide): RoadTier => (arms.includes(s) ? RoadTier.Tram : RoadTier.None);
    const isTrack = (s: TrackSide): boolean => arms.includes(s) && track.includes(s);
    return {
      n: tier('n'),
      e: tier('e'),
      s: tier('s'),
      w: tier('w'),
      track: { n: isTrack('n'), e: isTrack('e'), s: isTrack('s'), w: isTrack('w') },
    };
  };
  const tramTris = (arms: TrackSide[], track: TrackSide[]): Tri[] =>
    trianglesAt(
      roadTileVertices(
        3,
        3,
        RoadTier.Tram,
        arms.reduce((m, a) => m | BITS[a], 0),
        flat,
        around(arms, track),
      ),
      TRAM_RAIL_Y_OFFSET,
    );
  const halfHead = 0.028;

  it('draws a tram lane at standard gauge', () => {
    expect(2 * (TRAM_GAUGE_HALF_M - halfHead)).toBeCloseTo(STANDARD_GAUGE_M, 9);
  });

  it('carries the rails round a bend on concentric arcs, edge to edge', () => {
    const tris = tramTris(['n', 'e'], ['n', 'e']);
    const paths = trackPaths([['n', 'e']], tramLanes);
    expect(paths).toHaveLength(tramLanes.length);
    for (const p of paths) expectUnbroken(tris, p, TRAM_GAUGE_HALF_M, halfHead, `bend ${p.lane}`);
  });

  const junctions: [string, TrackSide[]][] = [
    ['a T', ['n', 's', 'e']],
    ['a crossroads', ['n', 'e', 's', 'w']],
  ];
  for (const [name, arms] of junctions) {
    it(`carries the rails along every movement through ${name}`, () => {
      const tris = tramTris(arms, arms);
      for (const p of trackPaths(allMovements(arms), tramLanes)) {
        for (let s = 0; s <= p.length + 1e-9; s += 0.25) {
          for (const side of [1, -1]) {
            const [x, z] = railPoint(p, Math.min(s, p.length), side * TRAM_GAUGE_HALF_M);
            expect(covered(tris, x, z), `${p.from}-${p.to} lane ${p.lane} gap at ${s}`).toBe(true);
          }
        }
      }
    });
  }

  it('runs only straight through a street junction whose side street has no track', () => {
    const arms: TrackSide[] = ['n', 's', 'e'];
    const tris = tramTris(arms, ['n', 's']);
    const [straight] = trackPaths([['n', 's']], tramLanes);
    for (let s = 0; s <= straight!.length; s += 0.5) {
      const [x, z] = railPoint(straight!, s, TRAM_GAUGE_HALF_M);
      expect(covered(tris, x, z)).toBe(true);
    }
    const [turn] = trackPaths([['n', 'e']], tramLanes);
    const [mx, mz] = railPoint(turn!, turn!.length / 2, TRAM_GAUGE_HALF_M);
    expect(covered(tris, mx, mz)).toBe(false);
  });
});
