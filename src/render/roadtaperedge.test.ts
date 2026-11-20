import { describe, expect, it } from 'vitest';
import { TILE_METERS } from '../shared/constants';
import { presetProfileForTier } from '../shared/roadprofile';
import { RoadFlow, RoadTier } from '../shared/types';
import { EDGE_LINE_MARGIN_M } from './roadmarkings';
import { roadTileVertices, SIDEWALK_COLOR } from './roadsmesh';

const N = 1;
const S = 4;
const flat = (): number => 0;
/** Width of an edge line, so the paint's outer edge sits this much nearer the kerb than its centre. */
const LINE_WIDTH_M = 0.15;
/** Tolerance on a distance read from the vertices, in metres. */
const TOLERANCE_M = 0.06;
/** A four-lane road closing 7.5 m of carriageway over seven tiles. */
const TAPER_TILES = 7;
const CLOSED_M = 7.5;

const triples = (flat3: readonly number[]): number[][] => {
  const out: number[][] = [];
  for (let i = 0; i < flat3.length; i += 3) out.push(flat3.slice(i, i + 3));
  return out;
};
const isWhite = (c: readonly number[]): boolean => c.every((v) => v > 0.9);
const isKerb = (c: readonly number[]): boolean =>
  SIDEWALK_COLOR.every((v, k) => Math.abs(v - c[k]!) < 1e-6);

/** A four-lane tile `remaining` tiles short of the end of its taper, the drop lying south. */
const closing = (remaining: number): { positions: number[]; colors: number[] } =>
  roadTileVertices(
    4,
    4,
    RoadTier.FourLane,
    N | S,
    flat,
    undefined,
    presetProfileForTier(RoadTier.FourLane),
    undefined,
    RoadFlow.None,
    undefined,
    undefined,
    { toward: RoadFlow.South, remaining, length: TAPER_TILES, closed: CLOSED_M },
  );

describe('the edge line down a lane-drop taper', () => {
  it('keeps its distance from the kerb on every tile of the taper, on both sides', () => {
    const centre = 4.5 * TILE_METERS;
    const asRead = (v: { positions: number[]; colors: number[] }) => {
      const at = triples(v.positions);
      return triples(v.colors).map((c, i) => ({ c, dx: at[i]![0]! - centre, z: at[i]![2]! }));
    };
    for (let remaining = TAPER_TILES - 1; remaining >= 0; remaining--) {
      const verts = asRead(closing(remaining));
      // The tile's two ends: its head, where the taper has closed the least, and its foot.
      for (const end of [4 * TILE_METERS, 5 * TILE_METERS]) {
        const row = verts.filter((p) => Math.abs(p.z - end) < 0.05);
        for (const side of [-1, 1]) {
          const kerbs = row.filter((p) => isKerb(p.c) && Math.sign(p.dx) === side);
          expect(kerbs.length, `kerb, remaining ${remaining}`).toBeGreaterThan(0);
          const kerbInner = Math.min(...kerbs.map((p) => Math.abs(p.dx)));
          const paint = row.filter(
            (p) => isWhite(p.c) && Math.sign(p.dx) === side && Math.abs(p.dx) < kerbInner,
          );
          expect(paint.length, `edge line, remaining ${remaining}`).toBeGreaterThan(0);
          const lineOuter = Math.max(...paint.map((p) => Math.abs(p.dx)));
          const gap = kerbInner - lineOuter;
          expect(gap, `remaining ${remaining}, side ${side}`).toBeGreaterThan(
            EDGE_LINE_MARGIN_M - LINE_WIDTH_M / 2 - TOLERANCE_M,
          );
          expect(gap, `remaining ${remaining}, side ${side}`).toBeLessThan(
            EDGE_LINE_MARGIN_M - LINE_WIDTH_M / 2 + TOLERANCE_M,
          );
        }
      }
    }
  });
});
