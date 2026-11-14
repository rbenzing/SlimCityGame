import { describe, expect, it } from 'vitest';
import { roadTileVertices } from './roadsmesh';
import type { NeighborTiers } from './roadsmesh';
import { carriagewayHalfWidthMeters, MEDIAN_GRASS_COLOR } from './roadsmesh';
import { RoadTier } from '../shared/types';
import type { JunctionControl } from '../shared/types';
import { TILE_METERS } from '../shared/constants';

const N = 1;
const E = 2;
const S = 4;
const W = 8;
const flat = (): number => 0;
const HALF = TILE_METERS / 2;

type Mesh = { positions: number[]; colors: number[] };
type Tri = { colour: [number, number, number]; pts: Array<[number, number]> };

const none = RoadTier.None;
const around = (n: RoadTier, e: RoadTier, s: RoadTier, w: RoadTier): NeighborTiers => ({
  n,
  e,
  s,
  w,
});

function tile(
  tier: RoadTier,
  mask: number,
  neighbours: NeighborTiers,
  control?: JunctionControl,
): Mesh {
  return roadTileVertices(
    0,
    0,
    tier,
    mask,
    flat,
    neighbours,
    undefined,
    undefined,
    undefined,
    control,
  );
}

function triangles(m: Mesh): Tri[] {
  const out: Tri[] = [];
  for (let i = 0; i + 8 < m.colors.length; i += 9) {
    out.push({
      colour: [m.colors[i]!, m.colors[i + 1]!, m.colors[i + 2]!],
      pts: [0, 1, 2].map((k) => [m.positions[i + k * 3]!, m.positions[i + k * 3 + 2]!]),
    });
  }
  return out;
}

const isWhite = (c: readonly number[]): boolean => c[0]! > 0.9 && c[1]! > 0.9 && c[2]! > 0.9;
const isYellow = (c: readonly number[]): boolean =>
  c[0]! > 0.85 && c[1]! > 0.6 && c[1]! < 0.85 && c[2]! < 0.35;
const isPaint = (c: readonly number[]): boolean => isWhite(c) || isYellow(c);

/** The paint a tile lays, as comparable text: every white or yellow triangle. */
function paintOf(m: Mesh): string[] {
  return triangles(m)
    .filter((t) => isPaint(t.colour))
    .map(
      (t) =>
        t.colour.map((v) => v.toFixed(2)).join(',') +
        '|' +
        t.pts.map((p) => p.map((v) => v.toFixed(2)).join(':')).join('>'),
    )
    .sort();
}

const isAsphalt = (c: readonly number[]): boolean => c[0]! < 0.5 && Math.abs(c[0]! - c[2]!) < 0.05;

const CONTROLS: JunctionControl[] = ['stop', 'allWayStop', 'signal', 'yield'];

describe('an alley meeting a street is an access: the street is drawn as if nothing joined', () => {
  for (const [name, street] of [
    ['two-lane street', RoadTier.TwoLane],
    ['avenue', RoadTier.Avenue],
  ] as const) {
    const withAlley = (control?: JunctionControl): Mesh =>
      tile(street, N | E | W, around(RoadTier.Alley, street, none, street), control);
    const plain = tile(street, E | W, around(none, street, none, street));

    it(`${name}: no control puts paint on the T, whatever the sim says`, () => {
      const base = paintOf(withAlley());
      for (const c of CONTROLS) expect(paintOf(withAlley(c))).toEqual(base);
    });

    it(`${name}: the street's lines run on across the alley's mouth as on a plain run`, () => {
      expect(paintOf(withAlley('stop'))).toEqual(paintOf(plain));
    });

    it(`${name}: the alley carries no paint of its own at its mouth`, () => {
      const alleyHalf = carriagewayHalfWidthMeters(RoadTier.Alley);
      const stray = triangles(withAlley('stop')).filter(
        (t) =>
          isPaint(t.colour) &&
          t.pts.every(([x, z]) => Math.abs(x - HALF) <= alleyHalf + 0.05 && z < HALF - 1),
      );
      expect(stray.length).toBe(0);
    });

    it(`${name}: the alley keeps its own width right to the street`, () => {
      const alleyHalf = carriagewayHalfWidthMeters(RoadTier.Alley);
      const edge = triangles(withAlley('stop')).filter(
        (t) =>
          !isPaint(t.colour) &&
          t.pts.some(([, z]) => z < 0.01) &&
          t.pts.every(([x, z]) => z < HALF - 2 && x > 0.01 && x < TILE_METERS - 0.01),
      );
      expect(edge.length).toBeGreaterThan(0);
      for (const t of edge)
        for (const [x] of t.pts) expect(Math.abs(x - HALF)).toBeLessThanOrEqual(alleyHalf + 0.01);
    });
  }

  it('an avenue keeps its median unbroken across the alley', () => {
    const m = tile(
      RoadTier.Avenue,
      N | E | W,
      around(RoadTier.Alley, RoadTier.Avenue, none, RoadTier.Avenue),
      'stop',
    );
    const grass = triangles(m).filter(
      (t) =>
        Math.abs(t.colour[0] - MEDIAN_GRASS_COLOR[0]) < 0.02 &&
        Math.abs(t.colour[1] - MEDIAN_GRASS_COLOR[1]) < 0.02,
    );
    const xs = grass.flatMap((t) => t.pts.map((p) => p[0]));
    expect(Math.min(...xs)).toBeLessThan(0.01);
    expect(Math.max(...xs)).toBeGreaterThan(TILE_METERS - 0.01);
  });

  it("an alley at a street's corner leaves the corner's own paint alone", () => {
    const withAlley = tile(
      RoadTier.TwoLane,
      N | E | S,
      around(RoadTier.Alley, RoadTier.TwoLane, RoadTier.TwoLane, none),
      'stop',
    );
    // The street turns from east to south; the alley leaves its outside.
    const turn = tile(
      RoadTier.TwoLane,
      E | S,
      around(none, RoadTier.TwoLane, RoadTier.TwoLane, none),
    );
    expect(paintOf(withAlley)).toEqual(paintOf(turn));
  });

  it("an alley at a street's dead end draws no slanted line across the street", () => {
    const withAlley = tile(
      RoadTier.TwoLane,
      N | W,
      around(RoadTier.Alley, none, none, RoadTier.TwoLane),
      'stop',
    );
    const end = tile(RoadTier.TwoLane, W, around(none, none, none, RoadTier.TwoLane));
    expect(paintOf(withAlley)).toEqual(paintOf(end));
  });
});

describe('a gravel road is a leg, but an unpaved one', () => {
  const T = RoadTier.TwoLane;
  const gravelHalf = carriagewayHalfWidthMeters(RoadTier.Gravel);
  const crossroads = (control: JunctionControl): Mesh =>
    tile(T, N | E | S | W, around(RoadTier.Gravel, T, T, T), control);

  it('carries no stop line and no crossing at its mouth, and none of its edge line', () => {
    for (const control of ['stop', 'allWayStop', 'signal'] as const) {
      const inMouth = triangles(crossroads(control)).filter(
        (t) =>
          isPaint(t.colour) &&
          t.pts.some(([x, z]) => Math.abs(x - HALF) < gravelHalf - 0.3 && z < HALF - 0.5),
      );
      expect(inMouth.length).toBe(0);
    }
  });

  it('keeps its own width right up to the street', () => {
    const edge = triangles(crossroads('allWayStop')).filter(
      (t) =>
        isAsphalt(t.colour) &&
        t.pts.some(([, z]) => z < 0.01) &&
        t.pts.every(([x, z]) => z < HALF - 2 && x > 0.01 && x < TILE_METERS - 0.01),
    );
    expect(edge.length).toBeGreaterThan(0);
    for (const t of edge)
      for (const [x] of t.pts) expect(Math.abs(x - HALF)).toBeLessThanOrEqual(gravelHalf + 0.01);
  });

  it('leaves the paved arms their own stop lines', () => {
    const paved = tile(T, N | E | S | W, around(T, T, T, T), 'allWayStop');
    // A stop line is a bar across the lanes: long along z, thin along x.
    const eastBars = (m: Mesh): number =>
      triangles(m).filter(
        (t) =>
          isWhite(t.colour) &&
          t.pts.every(([x]) => x > HALF + 4) &&
          Math.max(...t.pts.map((p) => p[1])) - Math.min(...t.pts.map((p) => p[1])) > 3,
      ).length;
    expect(eastBars(paved)).toBeGreaterThan(0);
    expect(eastBars(crossroads('allWayStop'))).toBe(eastBars(paved));
  });
});
