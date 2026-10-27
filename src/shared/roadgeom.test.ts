import { describe, expect, it } from 'vitest';
import {
  SAMPLE_STEP_M,
  footprintTiles,
  headingAt,
  isGridSegment,
  kerbLine,
  leavingDirection,
  sampleCentreLine,
  segmentLengthM,
  tightestRadiusM,
  tileCentreCm,
  tooSteep,
  wideEnoughApart,
  withinMergeAngle,
} from './roadgeom';
import type { SegmentGeom } from './roadgeom';

const m = (metres: number): number => Math.round(metres * 100);
const dirAt = (deg: number): { x: number; z: number } => ({
  x: Math.cos((deg * Math.PI) / 180),
  z: Math.sin((deg * Math.PI) / 180),
});

describe('road geometry', () => {
  it('samples a centre line no more than a step apart, both ends included', () => {
    const g: SegmentGeom = {
      a: { x: 0, z: 0 },
      b: { x: m(100), z: m(0) },
      control: { x: m(50), z: m(60) },
    };
    const samples = sampleCentreLine(g);
    expect(samples[0]).toMatchObject({ x: 0, z: 0, s: 0 });
    expect(samples[samples.length - 1]).toMatchObject({ x: 100, z: 0 });
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!.s - samples[i - 1]!.s).toBeLessThanOrEqual(SAMPLE_STEP_M + 1e-9);
    }
  });

  it('measures a straight segment as the distance between its ends', () => {
    expect(
      segmentLengthM({ a: { x: 0, z: 0 }, b: { x: m(30), z: m(40) }, control: null }),
    ).toBeCloseTo(50, 6);
  });

  it('finds a quarter curve tightest at its middle, at a leg over root two', () => {
    const leg = 100;
    const g: SegmentGeom = {
      a: { x: 0, z: 0 },
      b: { x: m(leg), z: m(leg) },
      control: { x: m(leg), z: 0 },
    };
    expect(tightestRadiusM(g)).toBeCloseTo(leg / Math.SQRT2, 3);
    expect(tightestRadiusM({ ...g, control: null })).toBe(Infinity);
  });

  it('leaves each end along the tangent that aims at the control point', () => {
    const g: SegmentGeom = {
      a: { x: 0, z: 0 },
      b: { x: m(100), z: m(100) },
      control: { x: m(100), z: 0 },
    };
    expect(leavingDirection(g, 'a')).toEqual({ x: 1, z: 0 });
    const atB = leavingDirection(g, 'b');
    expect(atB.x).toBeCloseTo(0, 12);
    expect(atB.z).toBeCloseTo(-1, 12);
  });

  it('draws the narrowest angle at 30° and the merge angle at 20°', () => {
    expect(wideEnoughApart(dirAt(0), dirAt(31))).toBe(true);
    expect(wideEnoughApart(dirAt(0), dirAt(29))).toBe(false);
    expect(withinMergeAngle(dirAt(0), dirAt(19))).toBe(true);
    expect(withinMergeAngle(dirAt(0), dirAt(21))).toBe(false);
  });

  it('covers every tile the cross-section reaches, and only those', () => {
    // A 45° line from the centre of tile (1, 1) to the centre of tile (4, 4).
    const g: SegmentGeom = {
      a: { x: tileCentreCm(1), z: tileCentreCm(1) },
      b: { x: tileCentreCm(4), z: tileCentreCm(4) },
      control: null,
    };
    const narrow = footprintTiles(g, 1, 8);
    for (let t = 1; t <= 4; t++) expect(narrow).toContain(t * 8 + t);
    // Where the line passes a tile corner it clips the two tiles beside it.
    expect(narrow).toContain(1 * 8 + 2);
    expect(narrow).not.toContain(0);
    expect(narrow).not.toContain(1 * 8 + 3);
    expect(narrow).not.toContain(1 * 8 + 0);
    // A road 24 m across reaches the tile west of where it starts, 10 m away.
    const wide = footprintTiles(g, 12, 8);
    expect(wide).toContain(1 * 8 + 0);
    expect(wide.length).toBeGreaterThan(narrow.length);
  });

  it('holds a straight line between two tile centres on one row as a grid segment', () => {
    const a = { x: tileCentreCm(2), z: tileCentreCm(5) };
    expect(isGridSegment({ a, b: { x: tileCentreCm(9), z: tileCentreCm(5) }, control: null })).toBe(
      true,
    );
    expect(isGridSegment({ a, b: { x: tileCentreCm(9), z: tileCentreCm(6) }, control: null })).toBe(
      false,
    );
    expect(
      isGridSegment({ a, b: { x: tileCentreCm(9), z: tileCentreCm(5) }, control: { x: 0, z: 0 } }),
    ).toBe(false);
    expect(
      isGridSegment({
        a: { x: a.x + 1, z: a.z },
        b: { x: tileCentreCm(9), z: tileCentreCm(5) },
        control: null,
      }),
    ).toBe(false);
  });

  it('finds a climb steeper than a road may take', () => {
    const g: SegmentGeom = { a: { x: 0, z: 0 }, b: { x: m(100), z: 0 }, control: null };
    expect(tooSteep(g, (x) => x * 0.4)).toBe(false);
    expect(tooSteep(g, (x) => x * 0.6)).toBe(true);
  });
});

describe('a kerb line', () => {
  const curve: SegmentGeom = {
    a: { x: 0, z: 0 },
    b: { x: m(100), z: m(0) },
    control: { x: m(50), z: m(60) },
  };
  const straight: SegmentGeom = {
    a: { x: 0, z: 0 },
    b: { x: m(80), z: m(60) },
    control: null,
  };

  it('offsets every sample square to its tangent by the half width', () => {
    for (const g of [curve, straight]) {
      const centre = sampleCentreLine(g);
      for (const side of [1, -1] as const) {
        const kerb = kerbLine(g, side, 6);
        expect(kerb).toHaveLength(centre.length);
        kerb.forEach((k, i) => {
          const c = centre[i]!;
          const off = { x: k.x - c.x, z: k.z - c.z };
          expect(Math.hypot(off.x, off.z)).toBeCloseTo(6, 6);
          const t = { x: Math.cos(k.heading), z: Math.sin(k.heading) };
          expect(off.x * t.x + off.z * t.z).toBeCloseTo(0, 6);
          // Side 1 is the left of the direction of travel, side -1 the right.
          expect(Math.sign(t.x * off.z - t.z * off.x)).toBe(side);
        });
      }
    }
  });

  it('runs its arc length along the kerb, so the outer kerb of a bend is the longer', () => {
    // The hump bows toward +z, so its centre of curvature lies to the right of travel.
    const outer = kerbLine(curve, 1, 6);
    const inner = kerbLine(curve, -1, 6);
    const centreLength = sampleCentreLine(curve).at(-1)!.s;
    expect(outer.at(-1)!.s).toBeGreaterThan(centreLength);
    expect(inner.at(-1)!.s).toBeLessThan(centreLength);
    expect(outer[0]!.s).toBe(0);
    for (let i = 1; i < outer.length; i++) expect(outer[i]!.s).toBeGreaterThan(outer[i - 1]!.s);
  });

  it('reads the heading that leavingDirection gives at both ends', () => {
    for (const g of [curve, straight]) {
      const a = leavingDirection(g, 'a');
      expect(Math.cos(headingAt(g, 0))).toBeCloseTo(a.x, 9);
      expect(Math.sin(headingAt(g, 0))).toBeCloseTo(a.z, 9);
      const b = leavingDirection(g, 'b');
      expect(Math.cos(headingAt(g, 1))).toBeCloseTo(-b.x, 9);
      expect(Math.sin(headingAt(g, 1))).toBeCloseTo(-b.z, 9);
    }
    expect(headingAt(straight, 0.5)).toBeCloseTo(Math.atan2(60, 80), 12);
  });
});
