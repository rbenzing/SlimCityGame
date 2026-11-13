/**
 * The raised median island, decided in one place. A median is a kerbed strip of
 * planting down a road: a grass top inside a thin concrete kerb, raised above
 * the carriageway. It is swept along a path of stations, so the same island is
 * drawn on a straight grid tile, round a bend and along a road off the grid,
 * and ends in a rounded nose wherever the median stops.
 *
 * The island hands back flat triangles in the caller's own 2D frame; the
 * caller lifts each one to its own ground and height.
 */

export type Pt = readonly [number, number];
export type Rgb = readonly [number, number, number];

/** What a median is drawn to when a cross-section does not say: a 6 ft island. */
export const MEDIAN_WIDTH_M = 1.8;
/** A kerbed island stands 6 in above the carriageway. */
export const MEDIAN_RAISE = 0.15;
/** The kerb's width on top, inside the island's edge. */
export const MEDIAN_CONCRETE_EDGE_M = 0.15;
export const MEDIAN_CONCRETE_COLOR: Rgb = [0.55, 0.55, 0.53];
export const MEDIAN_GRASS_COLOR: Rgb = [0.28, 0.5, 0.26];
/** Segments round a nose's half-circle. */
export const MEDIAN_NOSE_SEGMENTS = 10;
/** The longest cell the island is cut into along its length, so it follows the ground. */
const MAX_CELL_ALONG_M = 2;

/** The kerb width actually used on an island of this half-width: a narrow one gives up some. */
export function kerbWidthFor(half: number): number {
  return Math.min(MEDIAN_CONCRETE_EDGE_M, half / 2);
}

/** A median swept along stations. */
export interface IslandPath {
  /** How many stations there are, at least two, in the order of travel. */
  count: number;
  /** The point `across` metres from the island's centre line at station `k`. */
  at(k: number, across: number): Pt;
  /** Half the island's width at station `k`. */
  half(k: number): number;
}

export interface IslandOptions {
  /** End the island in a rounded nose at its first / last station. */
  noseStart: boolean;
  noseEnd: boolean;
  /** The colour of a nose's kerb: the approach end of a raised median is marked yellow. */
  noseColor: Rgb;
}

export type IslandSink = (a: Pt, b: Pt, c: Pt, color: Rgb) => void;

/** The unit vector from `a` to `b`. */
function unit(a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz) || 1;
  return [dx / len, dz / len];
}

/** A band between two offsets along the whole path, cut across its width. */
function band(
  path: IslandPath,
  from: (k: number) => number,
  to: (k: number) => number,
  color: Rgb,
  sink: IslandSink,
): void {
  for (let k = 0; k + 1 < path.count; k++) {
    const a = path.at(k, from(k));
    const b = path.at(k, to(k));
    const d = path.at(k + 1, from(k + 1));
    const e = path.at(k + 1, to(k + 1));
    sink(a, b, d, color);
    sink(d, b, e, color);
  }
}

/** A nose: the half-circle capping the island's end, its grass inside a kerb ring. */
function nose(
  centre: Pt,
  across: Pt,
  outward: Pt,
  half: number,
  grass: Rgb,
  kerb: Rgb,
  sink: IslandSink,
): void {
  const k = kerbWidthFor(half);
  const inner = half - k;
  const ring = (r: number, i: number): Pt => {
    const a = (Math.PI * i) / MEDIAN_NOSE_SEGMENTS;
    return [
      centre[0] + r * (Math.cos(a) * across[0] + Math.sin(a) * outward[0]),
      centre[1] + r * (Math.cos(a) * across[1] + Math.sin(a) * outward[1]),
    ];
  };
  for (let i = 0; i < MEDIAN_NOSE_SEGMENTS; i++) {
    sink(centre, ring(inner, i), ring(inner, i + 1), grass);
    sink(ring(inner, i), ring(half, i), ring(inner, i + 1), kerb);
    sink(ring(inner, i + 1), ring(half, i), ring(half, i + 1), kerb);
  }
}

/**
 * Sweeps a median island along `path`: kerb, grass, kerb, and a half-circle
 * nose of the island's own half-width at each end that asks for one. The path
 * ends where the straight part ends, so a nose reaches one half-width further.
 */
export function emitIsland(path: IslandPath, options: IslandOptions, sink: IslandSink): void {
  if (path.count < 2) return;
  const kerb = (k: number): number => kerbWidthFor(path.half(k));
  band(
    path,
    (k) => -path.half(k),
    (k) => -path.half(k) + kerb(k),
    MEDIAN_CONCRETE_COLOR,
    sink,
  );
  band(
    path,
    (k) => path.half(k) - kerb(k),
    (k) => path.half(k),
    MEDIAN_CONCRETE_COLOR,
    sink,
  );
  band(
    path,
    (k) => -path.half(k) + kerb(k),
    (k) => path.half(k) - kerb(k),
    MEDIAN_GRASS_COLOR,
    sink,
  );
  const last = path.count - 1;
  if (options.noseStart) {
    const c = path.at(0, 0);
    nose(
      c,
      unit(c, path.at(0, 1)),
      unit(path.at(1, 0), c),
      path.half(0),
      MEDIAN_GRASS_COLOR,
      options.noseColor,
      sink,
    );
  }
  if (options.noseEnd) {
    const c = path.at(last, 0);
    nose(
      c,
      unit(c, path.at(last, 1)),
      unit(path.at(last - 1, 0), c),
      path.half(last),
      MEDIAN_GRASS_COLOR,
      options.noseColor,
      sink,
    );
  }
}

/**
 * Stations for an island that runs `from`..`to` along a straight line, cut
 * about every `MAX_CELL_ALONG_M`. Returns the along-coordinate of each.
 */
export function stationsAlong(from: number, to: number): number[] {
  const steps = Math.max(1, Math.ceil(Math.abs(to - from) / MAX_CELL_ALONG_M));
  return Array.from({ length: steps + 1 }, (_, i) => from + ((to - from) * i) / steps);
}
