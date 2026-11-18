import { describe, expect, it } from 'vitest';
import { ISLAND_WIDTH_M } from './parkingcode';
import {
  AISLE_TURN_RADIUS_M,
  ALLEY_CORNER_RADIUS_M,
  arcSegments,
  CAR_PARK_CORNER_RADIUS_M,
  filletPolyline,
  ISLAND_NOSE_RADIUS_M,
  roundedRect,
  SERVICE_TURN_RADIUS_M,
  TAXIWAY_FILLET_RADIUS_M,
  type Pt,
} from './roundedoutline';

const area = (pts: Pt[]) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p.x * q.z - q.x * p.z;
  }
  return a / 2;
};

describe('constants', () => {
  it('carry the spec numbers', () => {
    expect(CAR_PARK_CORNER_RADIUS_M).toBe(1.5);
    expect(ISLAND_NOSE_RADIUS_M).toBeCloseTo(0.762, 9);
    expect(ISLAND_NOSE_RADIUS_M * 2).toBe(ISLAND_WIDTH_M);
    expect(AISLE_TURN_RADIUS_M).toBe(4.6);
    expect(SERVICE_TURN_RADIUS_M).toBe(7.6);
    expect(ALLEY_CORNER_RADIUS_M).toBe(6.1);
    expect(TAXIWAY_FILLET_RADIUS_M).toBe(9.1);
  });
});

describe('arcSegments', () => {
  it('is 4 up to 2 m and 8 above', () => {
    expect(arcSegments(0.76)).toBe(4);
    expect(arcSegments(2)).toBe(4);
    expect(arcSegments(2.01)).toBe(8);
    expect(arcSegments(9.1)).toBe(8);
  });
});

describe('roundedRect', () => {
  const rect = { x: 10, z: 20, w: 30, d: 16 };

  it('winds counter-clockwise', () => {
    expect(area(roundedRect(rect, 1.5))).toBeGreaterThan(0);
  });

  it('puts every NW arc point a radius from its centre and tangent to both edges', () => {
    const pts = roundedRect(rect, [3, 0, 0, 0]);
    const arc = pts.slice(0, arcSegments(3) + 1);
    expect(arc).toHaveLength(9);
    for (const p of arc) expect(Math.hypot(p.x - 13, p.z - 23)).toBeCloseTo(3, 9);
    expect(arc[0]).toEqual({ x: 10, z: 23 });
    expect(arc[arc.length - 1]!.x).toBeCloseTo(13, 9);
    expect(arc[arc.length - 1]!.z).toBeCloseTo(20, 9);
  });

  it('rounds all four corners on their own radius', () => {
    const pts = roundedRect(rect, [1, 2, 3, 4]);
    const centres: [number, number, number][] = [
      [11, 21, 1],
      [38, 22, 2],
      [37, 33, 3],
      [14, 32, 4],
    ];
    for (const [cx, cz, r] of centres) {
      const near = pts.filter((p) => Math.abs(Math.hypot(p.x - cx, p.z - cz) - r) < 1e-9);
      expect(near.length).toBeGreaterThanOrEqual(arcSegments(r) + 1);
    }
  });

  it('keeps a zero radius corner square', () => {
    const pts = roundedRect(rect, [0, 1.5, 1.5, 0]);
    expect(pts).toContainEqual({ x: 10, z: 20 });
    expect(pts).toContainEqual({ x: 10, z: 36 });
    expect(pts).not.toContainEqual({ x: 40, z: 20 });
    expect(roundedRect(rect, 0)).toEqual([
      { x: 10, z: 20 },
      { x: 40, z: 20 },
      { x: 40, z: 36 },
      { x: 10, z: 36 },
    ]);
  });

  it('clamps a radius to half the shorter side', () => {
    const pts = roundedRect(rect, 50);
    const cx = 18;
    const cz = 28;
    for (const p of pts.slice(0, 5)) expect(Math.hypot(p.x - cx, p.z - cz)).toBeCloseTo(8, 9);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(10 - 1e-9);
      expect(p.x).toBeLessThanOrEqual(40 + 1e-9);
    }
  });

  it('takes a little area from the square and never adds any', () => {
    const a = area(roundedRect(rect, 1.5));
    expect(a).toBeLessThan(30 * 16);
    expect(a).toBeGreaterThan(30 * 16 - 4 * 1.5 * 1.5);
  });
});

describe('filletPolyline', () => {
  it('keeps the ends and turns a right angle on the radius, tangent to both legs', () => {
    const out = filletPolyline(
      [
        { x: 0, z: 0 },
        { x: 20, z: 0 },
        { x: 20, z: 20 },
      ],
      4.6,
    );
    expect(out[0]).toEqual({ x: 0, z: 0 });
    expect(out[out.length - 1]).toEqual({ x: 20, z: 20 });
    const arc = out.slice(1, -1);
    expect(arc).toHaveLength(arcSegments(4.6) + 1);
    for (const p of arc) expect(Math.hypot(p.x - 15.4, p.z - 4.6)).toBeCloseTo(4.6, 9);
    expect(arc[0]!.x).toBeCloseTo(15.4, 9);
    expect(arc[0]!.z).toBeCloseTo(0, 9);
    expect(arc[arc.length - 1]!.x).toBeCloseTo(20, 9);
    expect(arc[arc.length - 1]!.z).toBeCloseTo(4.6, 9);
  });

  it('turns the other way for the opposite bend', () => {
    const out = filletPolyline(
      [
        { x: 0, z: 0 },
        { x: 20, z: 0 },
        { x: 20, z: -20 },
      ],
      3,
    );
    for (const p of out.slice(1, -1)) expect(Math.hypot(p.x - 17, p.z + 3)).toBeCloseTo(3, 9);
  });

  it('clamps to half the shorter leg', () => {
    const out = filletPolyline(
      [
        { x: 0, z: 0 },
        { x: 4, z: 0 },
        { x: 4, z: 30 },
      ],
      9.1,
    );
    expect(out[1]!.x).toBeCloseTo(2, 9);
    for (const p of out.slice(1, -1)) expect(Math.hypot(p.x - 2, p.z - 2)).toBeCloseTo(2, 9);
  });

  it('leaves collinear points and a zero radius alone', () => {
    const line = [
      { x: 0, z: 0 },
      { x: 5, z: 0 },
      { x: 10, z: 0 },
    ];
    expect(filletPolyline(line, 3)).toEqual(line);
    const bend = [...line.slice(0, 2), { x: 5, z: 5 }];
    expect(filletPolyline(bend, 0)).toEqual(bend);
  });

  it('uses more segments for a larger radius', () => {
    const bend = [
      { x: 0, z: 0 },
      { x: 40, z: 0 },
      { x: 40, z: 40 },
    ];
    expect(filletPolyline(bend, 9.1).length).toBeGreaterThan(filletPolyline(bend, 1.5).length);
  });
});
