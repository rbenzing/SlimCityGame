/**
 * Cuts kerb ramps into a tile's finished road triangles. The footway and the
 * kerb face under its edge are clipped against each ramp's rectangle; the
 * footway there is replaced by a surface that falls from the footway's height
 * at the back to the road's at the kerb, closed at its two sides by a cheek.
 */
import { kerbRampBox, kerbRampRise, type KerbRamp } from '../shared/kerbramps';

type Point = [number, number, number];
type Colour = readonly [number, number, number];

/** What the cut needs to know of how the tile's surfaces were laid. */
export interface RampSurfaces {
  footway: Colour;
  kerbFace: Colour;
  /** Height above the ground of the footway and of the carriageway. */
  footwayY: number;
  roadY: number;
}

const EPS = 1e-6;

/** The part of a convex polygon where `side` is at least zero, its other coordinates interpolated. */
function clipPolygon(poly: Point[], side: (p: Point) => number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const da = side(a);
    const db = side(b);
    if (da >= -EPS) out.push(a);
    if ((da > EPS && db < -EPS) || (da < -EPS && db > EPS)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return out;
}

/** A polygon's area, in whatever plane it lies. */
function areaOf(poly: Point[]): number {
  let ax = 0;
  let ay = 0;
  let az = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    ax += a[1] * b[2] - a[2] * b[1];
    ay += a[2] * b[0] - a[0] * b[2];
    az += a[0] * b[1] - a[1] * b[0];
  }
  return Math.hypot(ax, ay, az) / 2;
}

/** Appends a convex polygon as a fan of triangles in its own winding. */
function fan(poly: Point[], colour: Colour, positions: number[], colors: number[]): void {
  if (poly.length < 3 || areaOf(poly) < 1e-9) return;
  for (let i = 1; i + 1 < poly.length; i++) {
    for (const p of [poly[0]!, poly[i]!, poly[i + 1]!]) {
      positions.push(p[0], p[1], p[2]);
      colors.push(colour[0], colour[1], colour[2]);
    }
  }
}

const sameColour = (colors: number[], v: number, c: Colour): boolean =>
  Math.abs(colors[v]! - c[0]) < EPS &&
  Math.abs(colors[v + 1]! - c[1]) < EPS &&
  Math.abs(colors[v + 2]! - c[2]) < EPS;

/**
 * Rewrites `positions` and `colors` so no footway or kerb face lies where a
 * ramp does, and appends each ramp's surface and cheeks. The footway is told
 * by its colour and its height over the ground, which `groundAt` gives.
 * Returns the change in the number of triangles.
 */
export function cutKerbRamps(
  positions: number[],
  colors: number[],
  ramps: readonly KerbRamp[],
  surfaces: RampSurfaces,
  groundAt: (x: number, z: number) => number,
): number {
  const before = positions.length / 9;
  for (const ramp of ramps) cutOne(positions, colors, ramp, surfaces, groundAt);
  return positions.length / 9 - before;
}

function cutOne(
  positions: number[],
  colors: number[],
  ramp: KerbRamp,
  surfaces: RampSurfaces,
  groundAt: (x: number, z: number) => number,
): void {
  const box = kerbRampBox(ramp);
  const fall = ramp.axis === 'x' ? 0 : 2;
  const along = ramp.axis === 'x' ? 2 : 0;
  const keptPositions: number[] = [];
  const keptColors: number[] = [];
  const rampPositions: number[] = [];
  const rampColors: number[] = [];
  const sideMet = { from: false, to: false };
  const footwayAt = (p: Point): boolean =>
    Math.abs(p[1] - groundAt(p[0], p[2]) - surfaces.footwayY) < EPS;
  const sides: Array<(p: Point) => number> = [
    (p) => p[0] - box.x0,
    (p) => box.x1 - p[0],
    (p) => p[2] - box.z0,
    (p) => box.z1 - p[2],
  ];

  for (let i = 0; i + 2 < positions.length / 3; i += 3) {
    const v0 = i * 3;
    const tri: Point[] = [0, 1, 2].map((k) => {
      const v = v0 + k * 3;
      return [positions[v]!, positions[v + 1]!, positions[v + 2]!];
    });
    const keep = (): void => {
      for (let k = 0; k < 9; k++) {
        keptPositions.push(positions[v0 + k]!);
        keptColors.push(colors[v0 + k]!);
      }
    };
    const coloured = (c: Colour): boolean =>
      sameColour(colors, v0, c) && sameColour(colors, v0 + 3, c) && sameColour(colors, v0 + 6, c);

    if (coloured(surfaces.kerbFace) && tri.every((p) => Math.abs(p[fall] - ramp.kerb) < EPS)) {
      // A face on the ramp's kerb loses the stretch the ramp spans.
      const alongs = tri.map((p) => p[along]);
      if (Math.max(...alongs) <= ramp.from + EPS || Math.min(...alongs) >= ramp.to - EPS) {
        keep();
        continue;
      }
      fan(
        clipPolygon(tri, (p) => ramp.from - p[along]),
        surfaces.kerbFace,
        keptPositions,
        keptColors,
      );
      fan(
        clipPolygon(tri, (p) => p[along] - ramp.to),
        surfaces.kerbFace,
        keptPositions,
        keptColors,
      );
      continue;
    }
    if (!coloured(surfaces.footway) || !tri.every(footwayAt)) {
      keep();
      continue;
    }
    // The footway is cut against the rectangle one side at a time: what lies
    // outside a side stays footway, what lies inside all four is the ramp.
    let inside: Point[] = tri;
    const outside: Point[][] = [];
    for (const side of sides) {
      outside.push(clipPolygon(inside, (p) => -side(p)));
      inside = clipPolygon(inside, side);
    }
    if (areaOf(inside) < 1e-9) {
      keep();
      continue;
    }
    for (const piece of outside) fan(piece, surfaces.footway, keptPositions, keptColors);
    const surface = inside.map<Point>((p) => [
      p[0],
      groundAt(p[0], p[2]) +
        surfaces.roadY +
        (surfaces.footwayY - surfaces.roadY) * kerbRampRise(ramp, p[fall]),
      p[2],
    ]);
    fan(surface, surfaces.footway, rampPositions, rampColors);
    for (const p of surface) {
      if (Math.abs(p[along] - ramp.from) < EPS) sideMet.from = true;
      if (Math.abs(p[along] - ramp.to) < EPS) sideMet.to = true;
    }
  }

  // Each side the footway beside the ramp stands above is closed by a cheek:
  // the triangle between the ramp's slope and the footway's level.
  const cheeks: number[] = [];
  const cheekColors: number[] = [];
  for (const [side, met, outward] of [
    [ramp.from, sideMet.from, -1],
    [ramp.to, sideMet.to, 1],
  ] as const) {
    if (!met) continue;
    const at = (fallAt: number, y: number): Point => {
      const p: Point = [0, 0, 0];
      p[fall] = fallAt;
      p[along] = side;
      p[1] = groundAt(p[0], p[2]) + y;
      return p;
    };
    const corners = [
      at(ramp.kerb, surfaces.roadY),
      at(ramp.kerb, surfaces.footwayY),
      at(ramp.back, surfaces.footwayY),
    ];
    const [a, b, c] = corners as [Point, Point, Point];
    // The face is wound to look away from the ramp, toward the footway beside it.
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const normal = [
      u[1]! * v[2]! - u[2]! * v[1]!,
      u[2]! * v[0]! - u[0]! * v[2]!,
      u[0]! * v[1]! - u[1]! * v[0]!,
    ];
    fan(
      normal[along]! * outward >= 0 ? corners : [a, c, b],
      surfaces.kerbFace,
      cheeks,
      cheekColors,
    );
  }

  positions.length = 0;
  colors.length = 0;
  for (const list of [keptPositions, rampPositions, cheeks]) {
    for (const n of list) positions.push(n);
  }
  for (const list of [keptColors, rampColors, cheekColors]) {
    for (const n of list) colors.push(n);
  }
}
