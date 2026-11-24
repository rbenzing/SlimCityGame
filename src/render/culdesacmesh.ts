/**
 * The ground a cul-de-sac is drawn on: one turning circle on its block, the
 * street running in, and the footway round both. On a 2×2 block the street
 * meets the circle half a tile off its middle, with one kerb return; on a
 * centred block it meets it on its centre line, with a return on each side. The
 * block's corners are left to the terrain, which colours a road tile's verge.
 * The block is drawn whole from here and by no tile.
 *
 * Everything is worked in the street's own frame, `s` out along the street
 * from the circle's centre and `u` across it with the street at positive `u`,
 * and set down in world metres round the centre. Pure: numbers in, vertices out.
 */
import {
  CUL_DE_SAC_RADIUS_M,
  culDeSacCentre,
  culDeSacLegs,
  type CulDeSacBlock,
} from '../shared/culdesac';
import { TILE_METERS } from '../shared/constants';
import { hasKerbs, carriagewayHalfWidthOf, kerbWidthOf } from '../shared/roadprofile';
import { RoadFlow, stepForFlow, type RoadProfile } from '../shared/types';
import { wrapAngle, type BulbFront } from './bulbfront';

type Colour = readonly [number, number, number];
type Point = readonly [number, number];

/** Half the block: its edge is this far from the circle's centre. */
const BLOCK_HALF_M = TILE_METERS;
/** The largest kerb return the block holds where the street's inner kerb meets the circle. */
const KERB_RETURN_MAX_M = 5;
/** The smallest worth drawing; below it the kerb meets the circle at a corner. */
const KERB_RETURN_MIN_M = 1;
/** The longest edge of any triangle on the road, so the ground follows the terrain. */
const MAX_CELL_M = 2;
/** Segments round the whole circle. */
const CIRCLE_SEGMENTS = 72;
/** Segments round the kerb return. */
const RETURN_SEGMENTS = 12;

export interface BulbStreet {
  /** The side of the block the street meets. */
  side: RoadFlow;
  /** Where its centre line runs across the block, from the circle's centre, metres in the world's x or z. */
  lateral: number;
  /** Its carriageway's half-width, metres. */
  half: number;
  /** The width of its kerb strip, 0 where it has none. */
  kerb: number;
}

export interface BulbStyle {
  plate: Colour;
  footway: Colour;
  /** Heights above the ground of the road and the kerb. */
  roadY: number;
  curbY: number;
}

export interface BulbGeometry {
  positions: number[];
  colors: number[];
}

/**
 * Where the kerb return stands for the kerb line `line` metres off the circle's
 * axis: its radius and its centre in the street's frame, or null where the block
 * has no room for one. An offset street's inner kerb has its ground on the axis
 * side, so the return's centre lies nearer the axis than the kerb; a centred
 * street's kerbs have it on the far side (`outside`).
 */
export function kerbReturnOf(
  line: number,
  outside = false,
): { radius: number; s: number; u: number } | null {
  const R = CUL_DE_SAC_RADIUS_M;
  for (let r = KERB_RETURN_MAX_M; r >= KERB_RETURN_MIN_M; r -= 0.5) {
    const u = outside ? line + r : line - r;
    const reach = (R + r) ** 2 - u * u;
    if (reach <= 0) continue;
    const s = Math.sqrt(reach);
    if (s <= BLOCK_HALF_M - 1e-6) return { radius: r, s, u };
  }
  return null;
}

/** The street's frame set down in the world: `(s, u)` out along the street and across it, as metres from the circle's centre. */
function streetFrame(street: BulbStreet): (s: number, u: number) => Point {
  const out = stepForFlow(street.side);
  const across = out.dx === 0 ? { x: 1, z: 0 } : { x: 0, z: 1 };
  const flip = street.lateral < 0 ? -1 : 1;
  return (s, u) => [out.dx * s + across.x * flip * u, out.dz * s + across.z * flip * u];
}

/** Whether the street meets the circle on its own centre line, with a kerb return on each side. */
const isCentred = (street: BulbStreet): boolean => street.lateral === 0;

/**
 * The street's two kerb lines across it from the circle's axis. On an offset
 * street the inner one is nearer the axis and carries the kerb return; on a
 * centred street they are the same distance either side and both do.
 */
function kerbLines(street: BulbStreet): { tIn: number; tOut: number } {
  if (isCentred(street)) return { tIn: street.half, tOut: -street.half };
  const t0 = Math.abs(street.lateral);
  return { tIn: t0 - street.half, tOut: t0 + street.half };
}

/**
 * The angles round the circle, in the street's frame, between which the street
 * meets it: where the inner kerb return ends on the ring, and where the outer
 * kerb meets it (a centred street's other return ends, mirrored). The footway
 * round the circle runs everywhere else.
 */
function mouthAngles(street: BulbStreet): { phiReturn: number; phiOut: number } {
  const R = CUL_DE_SAC_RADIUS_M;
  const { tIn, tOut } = kerbLines(street);
  const sArc = (u: number): number => Math.sqrt(Math.max(0, R * R - u * u));
  const turn = kerbReturnOf(tIn, isCentred(street));
  const phiReturn = turn ? Math.atan2(turn.u, turn.s) : Math.atan2(tIn, sArc(tIn));
  return {
    phiReturn,
    phiOut: isCentred(street) ? -phiReturn : Math.atan2(Math.min(tOut, R), sArc(tOut)),
  };
}

/**
 * Where a street's painted line runs inside the block: out from the circle's
 * edge, where it ends, to the block's edge, where the street's own tile has
 * painted it already. `at` is the line's offset from the street's centre line
 * along the world's x or z, as the street's marking plan gives it. Null for a
 * line that does not meet the circle.
 */
export function bulbLineRun(
  street: BulbStreet,
  at: number,
): { u: number; s0: number; s1: number } | null {
  const flip = street.lateral < 0 ? -1 : 1;
  const u = Math.abs(street.lateral) + flip * at;
  if (Math.abs(u) >= CUL_DE_SAC_RADIUS_M) return null;
  return { u, s0: Math.sqrt(CUL_DE_SAC_RADIUS_M ** 2 - u * u), s1: BLOCK_HALF_M };
}

/** What a lot beside the circle at `(cx, cz)` reads of it: the back of its footway and where the street meets it. */
export function bulbFrontOf(cx: number, cz: number, street: BulbStreet): BulbFront {
  const world = streetFrame(street);
  const { phiReturn, phiOut } = mouthAngles(street);
  const angleOf = (phi: number): number => {
    const [x, z] = world(Math.cos(phi), Math.sin(phi));
    return Math.atan2(z, x);
  };
  const from = angleOf(phiReturn);
  return {
    cx,
    cz,
    ringM: CUL_DE_SAC_RADIUS_M + street.kerb,
    mouthFrom: from,
    mouthSpan: wrapAngle(angleOf(phiOut) - from),
  };
}

/**
 * The street that meets a cul-de-sac's block and the circle's centre: the one
 * answer the road mesh draws the block with and the lots round it read their
 * ring by. Null where the block's one street, or its section, is not read yet.
 */
export function bulbStreetOf(
  block: CulDeSacBlock,
  maskAt: (x: number, z: number) => number,
  profileAt: (x: number, z: number) => RoadProfile | null,
): BulbStreet | null {
  const leg = culDeSacLegs(block, maskAt)[0];
  if (!leg) return null;
  const profile = profileAt(leg.tile.x, leg.tile.z);
  if (!profile) return null;
  const half = carriagewayHalfWidthOf(profile);
  // How far the street's centre line stands from the circle's centre, metres: none for a centred block.
  const centre = culDeSacCentre(block);
  const lateral =
    leg.side === RoadFlow.North || leg.side === RoadFlow.South
      ? (leg.from.x + 0.5) * TILE_METERS - centre.x
      : (leg.from.z + 0.5) * TILE_METERS - centre.z;
  return {
    side: leg.side,
    lateral,
    half,
    kerb: hasKerbs(profile) ? Math.min(kerbWidthOf(profile), TILE_METERS / 2 - half) : 0,
  };
}

/** The turning circle, its street and its footway, laid round the circle's centre `(cx, cz)`. */
export function culDeSacVertices(
  cx: number,
  cz: number,
  street: BulbStreet,
  hAt: (x: number, z: number) => number,
  style: BulbStyle,
): BulbGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const R = CUL_DE_SAC_RADIUS_M;

  const world = streetFrame(street);
  const { tIn, tOut } = kerbLines(street);
  const sArc = (u: number): number => Math.sqrt(Math.max(0, R * R - u * u));

  const tri = (a: Point, b: Point, c: Point, y: number, color: Colour): void => {
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const ordered = cross > 0 ? [a, c, b] : [a, b, c];
    for (const p of ordered) {
      const x = cx + p[0];
      const z = cz + p[1];
      positions.push(x, hAt(x, z) + y, z);
      colors.push(color[0], color[1], color[2]);
    }
  };
  const strip = (a: readonly Point[], b: readonly Point[], y: number, color: Colour): void => {
    for (let i = 0; i + 1 < a.length && i + 1 < b.length; i++) {
      tri(a[i]!, b[i]!, a[i + 1]!, y, color);
      tri(a[i + 1]!, b[i]!, b[i + 1]!, y, color);
    }
  };
  /** A polyline laid out again as `count` + 1 points evenly along its length. */
  const resample = (line: readonly Point[], count: number): Point[] => {
    const lengths = [0];
    for (let i = 1; i < line.length; i++) {
      lengths.push(
        lengths[i - 1]! + Math.hypot(line[i]![0] - line[i - 1]![0], line[i]![1] - line[i - 1]![1]),
      );
    }
    const total = lengths[lengths.length - 1]!;
    const pts: Point[] = [];
    let j = 1;
    for (let k = 0; k <= count; k++) {
      const at = (total * k) / count;
      while (j < line.length - 1 && lengths[j]! < at) j++;
      const span = lengths[j]! - lengths[j - 1]!;
      const f = span > 1e-9 ? (at - lengths[j - 1]!) / span : 0;
      const [ax, az] = line[j - 1]!;
      const [bx, bz] = line[j]!;
      pts.push([ax + (bx - ax) * f, az + (bz - az) * f]);
    }
    return pts;
  };
  /** The street's frame turned over across the street, for the second return of a centred street. */
  const mirrored = (s: number, u: number): Point => world(s, -u);
  /** Points round a circle of radius `r` about the centre, from angle `a0` to `a1` in a frame, the street's by default. */
  const round = (
    r: number,
    a0: number,
    a1: number,
    steps: number,
    frame: (s: number, u: number) => Point = world,
  ): Point[] =>
    Array.from({ length: steps + 1 }, (_, k) => {
      const a = a0 + ((a1 - a0) * k) / steps;
      return frame(r * Math.cos(a), r * Math.sin(a));
    });
  /** A band between two radii and two angles round the circle's centre. */
  const band = (
    rIn: number,
    rOut: number,
    a0: number,
    a1: number,
    y: number,
    color: Colour,
  ): void => {
    if (a1 - a0 <= 1e-6) return;
    const rings = Math.max(1, Math.ceil((rOut - rIn) / MAX_CELL_M));
    const steps = Math.max(1, Math.ceil((CIRCLE_SEGMENTS * (a1 - a0)) / (2 * Math.PI)));
    for (let i = 0; i < rings; i++) {
      const r0 = rIn + ((rOut - rIn) * i) / rings;
      const r1 = rIn + ((rOut - rIn) * (i + 1)) / rings;
      strip(round(r0, a0, a1, steps), round(r1, a0, a1, steps), y, color);
    }
  };

  // The circle itself.
  band(0, R, 0, 2 * Math.PI, style.roadY, style.plate);

  // The street, from the circle's chord out to the block's edge.
  const sInner = sArc(tIn);
  const sOuter = sArc(tOut);
  const cols = Math.max(1, Math.ceil(Math.abs(tOut - tIn) / MAX_CELL_M));
  const rows = Math.max(1, Math.ceil((BLOCK_HALF_M - Math.min(sInner, sOuter)) / MAX_CELL_M));
  const lineAt = (v: number): Point[] =>
    Array.from({ length: cols + 1 }, (_, i) => {
      const f = i / cols;
      const u = tIn + (tOut - tIn) * f;
      const s0 = sInner + (sOuter - sInner) * f;
      return world(s0 + (BLOCK_HALF_M - s0) * v, u);
    });
  for (let j = 0; j < rows; j++)
    strip(lineAt(j / rows), lineAt((j + 1) / rows), style.roadY, style.plate);

  // The kerb return: the inner kerb curves into the circle instead of meeting it at a corner.
  // A centred street has one on each side, the second drawn in the mirrored frame; their
  // ground lies beyond the kerb, so the return swings out from it rather than in.
  const centred = isCentred(street);
  const turn = kerbReturnOf(tIn, centred);
  const { phiReturn, phiOut } = mouthAngles(street);
  /** Which way from its kerb line the ground beside the street lies, along `u`. */
  const beyond = centred ? 1 : -1;
  const layReturn = (frame: (s: number, u: number) => Point): void => {
    if (turn) {
      const centre: Point = [turn.s, turn.u];
      const from = (beyond * -Math.PI) / 2;
      let to = Math.atan2(-turn.u, -turn.s);
      if (!centred && to < from) to += 2 * Math.PI;
      const arc = (radius: number): Point[] =>
        Array.from({ length: RETURN_SEGMENTS + 1 }, (_, k) => {
          const a = from + ((to - from) * k) / RETURN_SEGMENTS;
          return frame(centre[0] + radius * Math.cos(a), centre[1] + radius * Math.sin(a));
        });
      const phiInner = Math.atan2(tIn, sInner);
      const side = [frame(sInner, tIn), frame(turn.s, tIn), ...arc(turn.radius).slice(1)];
      const rim = round(R, phiInner, phiReturn, RETURN_SEGMENTS, frame);
      strip(resample(side, 24), resample(rim, 24), style.roadY, style.plate);
      if (street.kerb > 0) {
        strip(
          arc(turn.radius),
          arc(Math.max(0, turn.radius - street.kerb)),
          style.curbY,
          style.footway,
        );
        strip(
          [frame(BLOCK_HALF_M, tIn), frame(turn.s, tIn)],
          [
            frame(BLOCK_HALF_M, tIn + beyond * street.kerb),
            frame(turn.s, tIn + beyond * street.kerb),
          ],
          style.curbY,
          style.footway,
        );
      }
    } else if (street.kerb > 0) {
      strip(
        [frame(BLOCK_HALF_M, tIn), frame(sInner, tIn)],
        [
          frame(BLOCK_HALF_M, tIn + beyond * street.kerb),
          frame(sInner, tIn + beyond * street.kerb),
        ],
        style.curbY,
        style.footway,
      );
    }
  };
  layReturn(world);
  if (centred) layReturn(mirrored);

  if (street.kerb > 0) {
    if (centred) {
      // The footway round the circle, between the two returns.
      band(R, R + street.kerb, phiReturn, 2 * Math.PI + phiOut, style.curbY, style.footway);
    } else {
      // The street's outer footway runs in to the circle's.
      strip(
        [world(BLOCK_HALF_M, tOut), world(sOuter, tOut)],
        [world(BLOCK_HALF_M, tOut + street.kerb), world(sOuter, tOut + street.kerb)],
        style.curbY,
        style.footway,
      );
      // The footway round the circle, everywhere the street does not cross it.
      band(R, R + street.kerb, phiOut, 2 * Math.PI + phiReturn, style.curbY, style.footway);
    }
  }

  return { positions, colors };
}
