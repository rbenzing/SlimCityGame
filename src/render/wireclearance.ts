/**
 * How near a strung wire may pass a lamp or a signal, and what is done about a
 * lamp that passes too near. Pure geometry over the polylines the lamp and
 * signal modules draw their parts along: no three.js, no randomness.
 *
 * A wire keeps WIRE_FROM_POST_M, radially, from any lamp post, lamp head, signal mast
 * or signal arm that is not on its own poles. A lamp on the kerb that carries a
 * pole line which cannot keep that clearance is not stood on a post of its own:
 * the nearest power pole carries the luminaire on a bracket, under the wires.
 */
import { LAMP_SPACING_TILES, TILE_METERS, worldToTile } from '../shared/constants';
import {
  LAMP_HEIGHTS_M,
  bracketHeightUnder,
  lampPolylines,
  type LampSettling,
  type LampStand,
  type Point3,
} from './lamps';
import { chunksAroundTile, wirePoints } from './powerpoles';
import type { PoleStand, PowerLay, WireSpan } from './powerpoles';

/** The radial distance a supply conductor of 750 to 22,500 V keeps from a lamp or signal pole it is not attached to, metres: 6 ft. */
export const WIRE_FROM_POST_M = 1.83;

/**
 * A lamp hangs on a pole whose line passes within this of it, across the street,
 * metres: the pole stands outside the footway and the lamp in the strip behind
 * the kerb, and the other kerb is a carriageway away.
 */
const SAME_KERB_M = 3;
/** The least a lamp's bracket pole may lie from where its own post would stand, metres: the narrow street's lamp spacing. */
const CARRY_REACH_M = LAMP_SPACING_TILES * TILE_METERS;
/** Passes made over the lamps: each pass takes more of them off their posts, so it ends. */
const MAX_PASSES = 4;

/** The parts of one lamp or signal, as polylines, with the circle in plan that holds them all. */
export interface Fixture {
  parts: readonly (readonly Point3[])[];
  cx: number;
  cz: number;
  radius: number;
}

export function fixtureOf(parts: readonly (readonly Point3[])[]): Fixture {
  const points = parts.flat();
  const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const cz = points.reduce((sum, p) => sum + p[2], 0) / points.length;
  const radius = Math.max(...points.map((p) => Math.hypot(p[0] - cx, p[2] - cz)));
  return { parts, cx, cz, radius };
}

type Vec = readonly [number, number, number];

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** The least distance between segment p1-q1 and segment p2-q2. */
export function segmentDistance(p1: Vec, q1: Vec, p2: Vec, q2: Vec): number {
  const d1 = sub(q1, p1);
  const d2 = sub(q2, p2);
  const r = sub(p1, p2);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  let s = 0;
  let t = 0;
  if (a > 1e-12 && e > 1e-12) {
    const c = dot(d1, r);
    const b = dot(d1, d2);
    const denom = a * e - b * b;
    s = denom > 1e-12 ? clamp01((b * f - c * e) / denom) : 0;
    t = (b * s + f) / e;
    if (t < 0) {
      t = 0;
      s = clamp01(-c / a);
    } else if (t > 1) {
      t = 1;
      s = clamp01((b - c) / a);
    }
  } else if (a > 1e-12) {
    s = clamp01(-dot(d1, r) / a);
  } else if (e > 1e-12) {
    t = clamp01(f / e);
  }
  const c1: Vec = [p1[0] + d1[0] * s, p1[1] + d1[1] * s, p1[2] + d1[2] * s];
  const c2: Vec = [p2[0] + d2[0] * t, p2[1] + d2[1] * t, p2[2] + d2[2] * t];
  return Math.hypot(c1[0] - c2[0], c1[1] - c2[1], c1[2] - c2[2]);
}

/** The three sagged wires of a span as polylines. */
function wiresOf(span: WireSpan, ground: (x: number, z: number) => number): Point3[][] {
  return ([-1, 0, 1] as const).map((which) =>
    wirePoints(span.a, span.b, which, ground).map((p): Point3 => [p.x, p.y, p.z]),
  );
}

/**
 * The least distance from any wire of `spans` to any part of `fixtures`. A span
 * and a fixture whose plan circles lie further apart than `within` are not
 * measured, so the answer is Infinity where nothing is within it.
 */
export function leastWireDistance(
  spans: readonly WireSpan[],
  fixtures: readonly Fixture[],
  ground: (x: number, z: number) => number,
  within = Infinity,
): number {
  let least = Infinity;
  for (const span of spans) {
    const mx = (span.a.x + span.b.x) / 2;
    const mz = (span.a.z + span.b.z) / 2;
    const half = Math.hypot(span.b.x - span.a.x, span.b.z - span.a.z) / 2;
    let wires: Point3[][] | null = null;
    for (const fixture of fixtures) {
      const gap = Math.hypot(mx - fixture.cx, mz - fixture.cz);
      // The crossarm carries the outer wires up to its half length either side.
      if (gap > half + span.a.armLength + fixture.radius + within) continue;
      wires ??= wiresOf(span, ground);
      for (const wire of wires) {
        for (let i = 1; i < wire.length; i++) {
          for (const part of fixture.parts) {
            for (let j = 1; j < part.length; j++) {
              least = Math.min(
                least,
                segmentDistance(wire[i - 1]!, wire[i]!, part[j - 1]!, part[j]!),
              );
            }
          }
        }
      }
    }
  }
  return least;
}

/** A lamp as a fixture, standing on `ground`. */
export function lampFixture(stand: LampStand, ground: (x: number, z: number) => number): Fixture {
  return fixtureOf(lampPolylines(stand, ground(stand.x, stand.z)));
}

/** Spans are filed by the cell their middle lies in; a cell is wider than a street span and the reach of a lamp. */
const SPAN_CELL_M = 64;
const spanCell = (x: number, z: number): number =>
  (Math.floor(x / SPAN_CELL_M) + 4096) * 8192 + Math.floor(z / SPAN_CELL_M) + 4096;

type SpanIndex = ReadonlyMap<number, readonly WireSpan[]>;

function indexSpans(spans: readonly WireSpan[]): SpanIndex {
  const out = new Map<number, WireSpan[]>();
  for (const span of spans) {
    const key = spanCell((span.a.x + span.b.x) / 2, (span.a.z + span.b.z) / 2);
    const here = out.get(key);
    if (here) here.push(span);
    else out.set(key, [span]);
  }
  return out;
}

/** Whether a lamp on its own post passes a wire of the indexed spans nearer than WIRE_FROM_POST_M. */
function breaksClearance(
  stand: LampStand,
  spans: SpanIndex,
  ground: (x: number, z: number) => number,
): boolean {
  const near: WireSpan[] = [];
  for (const dx of [-SPAN_CELL_M, 0, SPAN_CELL_M]) {
    for (const dz of [-SPAN_CELL_M, 0, SPAN_CELL_M]) {
      near.push(...(spans.get(spanCell(stand.x + dx, stand.z + dz)) ?? []));
    }
  }
  return (
    leastWireDistance(near, [lampFixture(stand, ground)], ground, WIRE_FROM_POST_M) <
    WIRE_FROM_POST_M
  );
}

/**
 * The power pole nearest a lamp's place that stands at its kerb, within the
 * narrow street's lamp spacing and not already carrying a luminaire; the lower
 * tile wins a tie so a street's lamps all move the same way.
 */
function poleFor(
  stand: LampStand,
  poles: readonly PoleStand[],
  used: ReadonlySet<PoleStand>,
): PoleStand | null {
  let best: PoleStand | null = null;
  let bestGap = Infinity;
  for (const pole of poles) {
    if (used.has(pole) || pole.kind !== 'street' || pole.riser) continue;
    const dx = pole.x - stand.x;
    const dz = pole.z - stand.z;
    if (Math.abs(dx * stand.reachX + dz * stand.reachZ) > SAME_KERB_M) continue;
    const gap = Math.hypot(dx, dz);
    if (gap > CARRY_REACH_M) continue;
    if (gap < bestGap - 1e-6 || (Math.abs(gap - bestGap) <= 1e-6 && best && pole.key < best.key)) {
      best = pole;
      bestGap = gap;
    }
  }
  return best;
}

/** The luminaire a power pole carries for a lamp: at the lamp's own mounting height, or lower where the wires are in the way. */
function onPole(stand: LampStand, pole: PoleStand): LampStand {
  const own = stand.height ?? LAMP_HEIGHTS_M[0];
  return {
    x: pole.x,
    z: pole.z,
    reachX: stand.reachX,
    reachZ: stand.reachZ,
    height: Math.min(own, bracketHeightUnder(pole.arm)),
    bracket: true,
  };
}

/**
 * Stands the street's power poles with the given lamps' posts held clear and
 * returns each terrain chunk's poles and spans; `chunks` null lays them all,
 * otherwise only those chunks.
 */
export type LayPoles = (
  posts: readonly LampStand[],
  chunks: ReadonlySet<number> | null,
) => ReadonlyMap<number, PowerLay>;

/**
 * Sees to every lamp a wire passes too near. A lamp that breaks the clearance
 * goes on the nearest power pole at its kerb; the poles are laid again, only in
 * the chunks round its post, and the rest checked again, until none moves. A
 * lamp that clears every wire keeps its post. A lamp that breaks the clearance
 * and has no pole to hang on is not drawn: no light stands under a wire.
 */
export function carryLampsOnPoles(
  lamps: readonly LampStand[],
  lay: LayPoles,
  ground: (x: number, z: number) => number,
): LampSettling {
  const carried = new Set<number>();
  const postsOf = (): LampStand[] => lamps.filter((_, i) => !carried.has(i));
  const laid = new Map(lay(lamps, null));
  const viewOf = (): { poles: PoleStand[]; spans: SpanIndex } => ({
    poles: [...laid.values()].flatMap((l) => l.poles),
    spans: indexSpans([...laid.values()].flatMap((l) => l.spans)),
  });
  let view = viewOf();
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const breaking: number[] = [];
    for (let i = 0; i < lamps.length; i++) {
      const stand = lamps[i]!;
      if (!carried.has(i) && !stand.bracket && breaksClearance(stand, view.spans, ground)) {
        breaking.push(i);
      }
    }
    if (breaking.length === 0) break;
    const near = new Set<number>();
    for (const i of breaking) {
      carried.add(i);
      const stand = lamps[i]!;
      for (const chunk of chunksAroundTile(worldToTile(stand.x), worldToTile(stand.z))) {
        near.add(chunk);
      }
    }
    for (const [chunk, chunkLay] of lay(postsOf(), near)) laid.set(chunk, chunkLay);
    view = viewOf();
  }
  const used = new Set<PoleStand>();
  const hung: LampStand[] = [];
  for (const i of carried) {
    const stand = lamps[i]!;
    const pole = poleFor(stand, view.poles, used);
    if (!pole) continue;
    used.add(pole);
    hung.push(onPole(stand, pole));
  }
  return { posts: postsOf(), carried: hung };
}
