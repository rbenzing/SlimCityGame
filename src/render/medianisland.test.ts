import { describe, expect, it } from 'vitest';
import { TILE_METERS } from '../shared/constants';
import { junctionArmLayout } from '../shared/junctionpaint';
import { kerbWidthOf, presetProfileForTier } from '../shared/roadprofile';
import { RoadTier } from '../shared/types';
import {
  emitIsland,
  MEDIAN_CONCRETE_COLOR,
  MEDIAN_GRASS_COLOR,
  MEDIAN_RAISE,
  MEDIAN_WIDTH_M,
  type IslandPath,
  type Pt,
  type Rgb,
} from './medianisland';
import type { NeighborHalves } from './roadsmesh';
import {
  ROAD_Y_OFFSET,
  YELLOW_MARKING_COLOR,
  carriagewayHalfWidthMeters,
  medianHalfWidthOf,
  roadTileVertices,
} from './roadsmesh';

const flat = (): number => 0;
const N = 1;
const E = 2;
const S = 4;
const W = 8;
const HALF = TILE_METERS / 2;
const MEDIAN_Y = ROAD_Y_OFFSET + MEDIAN_RAISE;
const AVENUE_HALF = carriagewayHalfWidthMeters(RoadTier.Avenue);
/** The avenue's median is drawn at its own cross-section's width: its 16.2 m budget leaves 1.2 m. */
const MH = medianHalfWidthOf(presetProfileForTier(RoadTier.Avenue));

const same = (a: readonly number[], b: Rgb): boolean =>
  a.every((v, i) => Math.abs(v - b[i]!) < 1e-6);

interface Vertex {
  x: number;
  y: number;
  z: number;
  rgb: number[];
}

const verticesOf = (v: { positions: number[]; colors: number[] }): Vertex[] =>
  Array.from({ length: v.positions.length / 3 }, (_, i) => ({
    x: v.positions[3 * i]!,
    y: v.positions[3 * i + 1]!,
    z: v.positions[3 * i + 2]!,
    rgb: v.colors.slice(3 * i, 3 * i + 3),
  }));

/** The raised median's own vertices: grass, kerb, and a nose's yellow kerb. */
const islandOf = (v: { positions: number[]; colors: number[] }): Vertex[] =>
  verticesOf(v).filter(
    (p) =>
      p.y >= MEDIAN_Y - 1e-6 &&
      (same(p.rgb, MEDIAN_GRASS_COLOR) ||
        same(p.rgb, MEDIAN_CONCRETE_COLOR) ||
        same(p.rgb, YELLOW_MARKING_COLOR)),
  );

/** Solid yellow paint lying on the road, not the kerb of a nose. */
const yellowPaintOf = (v: { positions: number[]; colors: number[] }): Vertex[] =>
  verticesOf(v).filter((p) => p.y < MEDIAN_Y - 1e-6 && same(p.rgb, YELLOW_MARKING_COLOR));

const halves = (extra: Partial<NeighborHalves> = {}): NeighborHalves => ({
  n: AVENUE_HALF,
  e: AVENUE_HALF,
  s: AVENUE_HALF,
  w: AVENUE_HALF,
  ...extra,
});

const tile = (x: number, z: number, mask: number, neighbour?: NeighborHalves) =>
  roadTileVertices(x, z, RoadTier.Avenue, mask, flat, undefined, undefined, neighbour);

describe('emitIsland', () => {
  const straight = (count: number, half: number): IslandPath => ({
    count,
    at: (k, across): Pt => [across, k * 2],
    half: () => half,
  });
  const run = (path: IslandPath, noseStart: boolean, noseEnd: boolean) => {
    const out: { tri: Pt[]; color: Rgb }[] = [];
    emitIsland(path, { noseStart, noseEnd, noseColor: YELLOW_MARKING_COLOR }, (a, b, c, color) =>
      out.push({ tri: [a, b, c], color }),
    );
    return out;
  };
  const points = (tris: ReturnType<typeof run>) => tris.flatMap((t) => t.tri);

  it('is as wide as the half-width it is given, with a grass top inside a concrete kerb', () => {
    const tris = run(straight(3, 0.9), false, false);
    const xs = points(tris).map((p) => p[0]);
    expect(Math.min(...xs)).toBeCloseTo(-0.9, 9);
    expect(Math.max(...xs)).toBeCloseTo(0.9, 9);
    expect(tris.some((t) => t.color === MEDIAN_GRASS_COLOR)).toBe(true);
    expect(tris.some((t) => t.color === MEDIAN_CONCRETE_COLOR)).toBe(true);
    expect(MEDIAN_WIDTH_M).toBeCloseTo(1.8, 9);
  });

  it('ends in a half-circle of its own half-width, with a yellow kerb, where it is asked to', () => {
    const half = 0.9;
    const tris = run(straight(3, half), false, true);
    const tip = Math.max(...points(tris).map((p) => p[1]));
    expect(tip).toBeCloseTo(4 + half, 9);
    // Every point of the nose lies on or inside the circle about the last station.
    const nose = tris.filter((t) => t.tri.some((p) => p[1] > 4 + 1e-9));
    for (const p of points(nose))
      expect(Math.hypot(p[0], p[1] - 4)).toBeLessThanOrEqual(half + 1e-9);
    expect(nose.some((t) => t.color === YELLOW_MARKING_COLOR)).toBe(true);
    // A square end has none of it.
    expect(Math.max(...points(run(straight(3, half), false, false)).map((p) => p[1]))).toBeCloseTo(
      4,
      9,
    );
  });

  it('puts a nose at the start as well, facing back along the path', () => {
    const tris = run(straight(3, 0.9), true, false);
    expect(Math.min(...points(tris).map((p) => p[1]))).toBeCloseTo(-0.9, 9);
  });
});

describe('a median on the grid and round a bend', () => {
  it('meets with the same width and height where a straight tile runs into a corner', () => {
    // A straight avenue tile at (0,0), the corner turning west to north at (0,1).
    const straight = islandOf(tile(0, 0, N | S));
    const corner = islandOf(tile(0, 1, N | W));
    const atSeam = (vs: Vertex[]) => vs.filter((p) => Math.abs(p.z - TILE_METERS) < 1e-6);
    const a = atSeam(straight);
    const b = atSeam(corner);
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    const extent = (vs: Vertex[]) => [
      Math.min(...vs.map((p) => p.x)),
      Math.max(...vs.map((p) => p.x)),
    ];
    expect(extent(a)[0]).toBeCloseTo(HALF - MH, 6);
    expect(extent(a)[1]).toBeCloseTo(HALF + MH, 6);
    expect(extent(b)[0]).toBeCloseTo(extent(a)[0]!, 6);
    expect(extent(b)[1]).toBeCloseTo(extent(a)[1]!, 6);
    for (const p of [...a, ...b]) expect(p.y).toBeCloseTo(MEDIAN_Y, 9);
    // And the same two colours either side of the seam.
    const colours = (vs: Vertex[]) =>
      new Set(vs.map((p) => (same(p.rgb, MEDIAN_GRASS_COLOR) ? 'grass' : 'kerb')));
    expect(colours(b)).toEqual(colours(a));
  });

  it('keeps a corner’s median on the arc of the road’s centre', () => {
    const corner = islandOf(tile(0, 0, N | E));
    // The road's centre round a corner is a quarter circle about the tile corner
    // the two arms share, of radius half a tile.
    const pivot: Pt = [TILE_METERS, 0];
    for (const p of corner) {
      const r = Math.hypot(p.x - pivot[0], p.z - pivot[1]);
      expect(Math.abs(r - HALF)).toBeLessThanOrEqual(MH + 1e-6);
    }
    expect(corner.length).toBeGreaterThan(0);
  });
});

describe('a median ends in a nose', () => {
  const layout = junctionArmLayout(AVENUE_HALF, kerbWidthOf(presetProfileForTier(RoadTier.Avenue)));
  const reach = Math.max(0, layout.stopLineFar - HALF);
  const crossing = Math.max(0, layout.crosswalkFar - HALF);
  const centreX = HALF;

  it('behind the crossing, away from the box, at a junction', () => {
    const v = tile(
      0,
      0,
      N | S,
      halves({
        junctions: { n: false, e: false, s: true, w: false },
        reach: { n: 0, e: 0, s: reach, w: 0 },
      }),
    );
    const island = islandOf(v);
    const tip = Math.max(...island.map((p) => p.z));
    // The crossing's far edge is `crossing` into this tile from its south edge.
    expect(tip).toBeLessThanOrEqual(TILE_METERS - crossing + 1e-6);
    expect(tip).toBeCloseTo(TILE_METERS - reach, 6);
    // It is rounded: its last point is a single point on the centre line.
    const last = island.filter((p) => Math.abs(p.z - tip) < 1e-6);
    for (const p of last) expect(p.x).toBeCloseTo(centreX, 6);
    // A tile with no junction beside it runs to its edge.
    const open = islandOf(tile(0, 0, N | S));
    expect(Math.max(...open.map((p) => p.z))).toBeCloseTo(TILE_METERS, 6);
  });

  it('at the end of a road, at the edge of its carriageway', () => {
    const island = islandOf(tile(0, 0, N));
    expect(Math.max(...island.map((p) => p.z))).toBeCloseTo(HALF + AVENUE_HALF, 6);
  });

  it('where the road beside it has no median', () => {
    const v = tile(0, 0, N | S, halves({ medians: { n: MH, e: 0, s: 0, w: 0 } }));
    const island = islandOf(v);
    expect(Math.max(...island.map((p) => p.z))).toBeCloseTo(TILE_METERS, 6);
    // Narrower toward that end than the median is, which is what a nose is.
    const wide = island.filter((p) => Math.abs(p.z - (TILE_METERS - MH)) < 1e-6);
    expect(Math.max(...wide.map((p) => Math.abs(p.x - centreX)))).toBeCloseTo(MH, 6);
    const tipOnly = island.filter((p) => p.z > TILE_METERS - 1e-6);
    for (const p of tipOnly) expect(p.x).toBeCloseTo(centreX, 6);
  });

  it('tapers to meet a median of another width, with no step at the seam', () => {
    const narrow = 0.5;
    const v = tile(0, 0, N | S, halves({ medians: { n: MH, e: 0, s: narrow, w: 0 } }));
    const atEdge = islandOf(v).filter((p) => Math.abs(p.z - TILE_METERS) < 1e-6);
    expect(Math.max(...atEdge.map((p) => Math.abs(p.x - centreX)))).toBeCloseTo(narrow, 6);
  });

  it('with a solid yellow line each side that ends where the nose begins', () => {
    const v = tile(
      0,
      0,
      N | S,
      halves({
        junctions: { n: false, e: false, s: true, w: false },
        reach: { n: 0, e: 0, s: reach, w: 0 },
      }),
    );
    const lines = yellowPaintOf(v);
    const offsets = new Set(lines.map((p) => Math.round((p.x - centreX) * 100) / 100));
    expect([...offsets].some((o) => o < -0.5)).toBe(true);
    expect([...offsets].some((o) => o > 0.5)).toBe(true);
    const nosePart = MH;
    const noseBegins = TILE_METERS - reach - nosePart;
    expect(Math.max(...lines.map((p) => p.z))).toBeLessThanOrEqual(noseBegins + 1e-6);
    // The island's own kerb at the nose is yellow.
    const island = islandOf(v);
    expect(island.some((p) => same(p.rgb, YELLOW_MARKING_COLOR))).toBe(true);
  });
});
