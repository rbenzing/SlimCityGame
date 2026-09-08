/**
 * Road markings, read from the cross-section. A marking is never authored: a
 * dashed centre line means two opposing lanes with passing allowed, a double
 * solid means a multi-lane undivided road, a dashed lane line sits between two
 * lanes running the same way, an edge line belongs to a motorway, and a
 * coloured band is a reserved lane. This module turns a profile into that
 * list of offsets; the mesh only paints what it is handed.
 */
import type { LanePiece, RoadClassId, RoadProfile } from '../shared/types';
import { RoadFlow } from '../shared/types';
import { carriagewayHalfWidthOf } from '../shared/roadprofile';

/** Half the gap between the two lines of a double solid centre. */
export const CENTRE_PAIR_OFFSET_M = 0.22;
/** How far inside the carriageway edge a motorway's edge line is painted. */
export const EDGE_LINE_MARGIN_M = 0.5;
/**
 * How far onto the carriageway a divided road's left edge line sits from the
 * median it runs beside — clear of the median's concrete kerb, close enough to
 * read as that carriageway's own edge.
 */
export const MEDIAN_EDGE_LINE_INSET_M = 0.25;
/** How far inside a turn lane its broken line sits from the solid one beside it. */
export const TURN_LANE_INNER_OFFSET_M = 0.3;
/** A bike lane's paint is at most this wide; a wider piece keeps a buffer to the kerb. */
export const BIKE_PAINT_MAX_WIDTH_M = 1.6;

export type BandKind = 'bus' | 'bike' | 'parking';

export interface MarkingBand {
  kind: BandKind;
  /** Signed offsets from the centreline, metres, `from` < `to`. */
  from: number;
  to: number;
}

/** A painted line: where it sits, and what colour it is painted. */
export interface MarkingLine {
  /** Signed offset from the centreline, metres. */
  at: number;
  /**
   * Yellow separates traffic going OPPOSITE ways, white separates traffic
   * going the same way and marks the edge of the carriageway — the US
   * convention, and the one a driver reads without thinking.
   */
  color: 'white' | 'yellow';
}

export interface MarkingPlan {
  /** Solid lines, each with its colour. */
  solid: MarkingLine[];
  /** Dashed lines, each with its colour. */
  dashed: MarkingLine[];
  /** Reserved and parking lanes to fill or tick. */
  bands: MarkingBand[];
  /**
   * Where a two-way left-turn lane sits, if the profile has one: the lane
   * traffic turns from in either direction, which is marked with opposing
   * turn arrows rather than travelled along.
   */
  turnLane: { from: number; to: number } | null;
  /** The profile carries a raised median piece at the centre. */
  hasMedian: boolean;
  /** The profile is a motorway, whose straight runs carry a concrete divider. */
  barrier: boolean;
}

type CentreStyle = 'none' | 'dashed' | 'double' | 'auto';

interface ClassMarkings {
  centre: CentreStyle;
  laneLines: boolean;
  edgeLines: boolean;
}

/**
 * How each class paints. `auto` is a dashed centre for one lane a side and a
 * double solid for more — the no-passing rule of a multi-lane undivided road.
 * Motorways paint edge lines and no centre; their straight runs carry a
 * physical divider instead, and their lane lines arrive with the two-tile
 * motorway whose lanes have room for them.
 */
const CLASS_MARKINGS: Readonly<Record<RoadClassId, ClassMarkings>> = {
  // An unpaved track and a service alley carry no paint at all.
  dirt: { centre: 'none', laneLines: false, edgeLines: false },
  alley: { centre: 'none', laneLines: false, edgeLines: false },
  // A rural road runs between shoulders, so its edge line is what tells a
  // driver where the surface ends; a town street's kerb does that job, but
  // the line still marks the gutter a driver should not sit in.
  rural: { centre: 'auto', laneLines: true, edgeLines: true },
  local: { centre: 'auto', laneLines: true, edgeLines: true },
  urban: { centre: 'auto', laneLines: true, edgeLines: true },
  collector: { centre: 'auto', laneLines: true, edgeLines: true },
  arterial: { centre: 'double', laneLines: true, edgeLines: true },
  divided: { centre: 'double', laneLines: true, edgeLines: true },
  oneWay: { centre: 'none', laneLines: true, edgeLines: true },
  highway: { centre: 'none', laneLines: true, edgeLines: true },
  ramp: { centre: 'none', laneLines: true, edgeLines: true },
  rail: { centre: 'none', laneLines: false, edgeLines: false },
};

const CARRIAGEWAY_KINDS: ReadonlySet<LanePiece['kind']> = new Set([
  'travel',
  'centreTurn',
  'parking',
  'bike',
  'bus',
  'tram',
  'rail',
  'median',
  'barrier',
  'shoulder',
]);

const isTravel = (p: LanePiece): boolean => p.kind === 'travel';
const flowOf = (p: LanePiece): 'fwd' | 'back' | 'both' => p.flow ?? 'both';

/** One travel lane of a cross-section: where its centre is, and which way it runs. */
export interface TravelLane {
  /** Signed offset of the lane's centre from the centreline, metres. */
  centre: number;
  /** Which way it runs, relative to the tile's own stored direction. */
  flow: 'fwd' | 'back' | 'both';
}

/**
 * The travel lanes a profile has, in order across the tile. Anything painted
 * PER LANE — a lane-use arrow above all — has to know where the lane actually
 * is, and the cross-section is the only thing that knows.
 */
export function travelLanes(profile: RoadProfile): TravelLane[] {
  const pieces = profile.pieces.filter((p) => CARRIAGEWAY_KINDS.has(p.kind));
  let offset = -carriagewayHalfWidthOf(profile);
  const lanes: TravelLane[] = [];
  for (const piece of pieces) {
    const from = offset;
    offset += piece.width;
    if (isTravel(piece)) lanes.push({ centre: (from + offset) / 2, flow: flowOf(piece) });
  }
  return lanes;
}

/** Lays the carriageway pieces across the tile and reads the lines between them. */
/** `flow` is the stored direction, which decides which edge is the driver's left. */
export function markingPlan(profile: RoadProfile, flow: number = RoadFlow.None): MarkingPlan {
  const style = CLASS_MARKINGS[profile.class];
  const pieces = profile.pieces.filter((p) => CARRIAGEWAY_KINDS.has(p.kind));
  const half = carriagewayHalfWidthOf(profile);

  const solid: MarkingLine[] = [];
  const dashed: MarkingLine[] = [];
  const white = (at: number): MarkingLine => ({ at, color: 'white' });
  const yellow = (at: number): MarkingLine => ({ at, color: 'yellow' });
  const bands: MarkingBand[] = [];

  // Opposing travel lanes per side decide the auto centre style.
  const back = pieces.filter((p) => isTravel(p) && flowOf(p) === 'back').length;
  const fwd = pieces.filter((p) => isTravel(p) && flowOf(p) === 'fwd').length;
  const centre: 'none' | 'dashed' | 'double' =
    style.centre === 'auto' ? (back >= 2 || fwd >= 2 ? 'double' : 'dashed') : style.centre;

  let offset = -half;
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i]!;
    const from = offset;
    const to = offset + piece.width;
    offset = to;

    if (piece.kind === 'bus') bands.push({ kind: 'bus', from, to });
    if (piece.kind === 'parking') bands.push({ kind: 'parking', from, to });
    if (piece.kind === 'bike') {
      // Paint hugs the kerb side; anything wider than the paint is a buffer.
      const paint = Math.min(piece.width, BIKE_PAINT_MAX_WIDTH_M);
      const kerbSide = from < 0 ? -1 : 1;
      bands.push(
        kerbSide < 0
          ? { kind: 'bike', from, to: from + paint }
          : { kind: 'bike', from: to - paint, to },
      );
    }

    const next = pieces[i + 1];
    if (!next) continue;
    const boundary = to;
    const opposing =
      isTravel(piece) &&
      isTravel(next) &&
      flowOf(piece) !== flowOf(next) &&
      flowOf(piece) !== 'both';
    const sameWay = isTravel(piece) && isTravel(next) && flowOf(piece) === flowOf(next);
    const travelToBus =
      (isTravel(piece) && next.kind === 'bus') || (piece.kind === 'bus' && isTravel(next));
    // A two-way turn lane is bounded by a solid line on each side: traffic may
    // enter it to turn but never travel along it.
    const turnEdge =
      (piece.kind === 'centreTurn' && isTravel(next)) ||
      (isTravel(piece) && next.kind === 'centreTurn');

    if (turnEdge) {
      // A two-way turn lane is bounded on each side by a solid yellow line
      // toward the through lane and a broken yellow one toward the turn lane:
      // traffic may cross into it to turn but never travel along it.
      if (style.centre !== 'none') {
        const inward = piece.kind === 'centreTurn' ? -1 : 1;
        solid.push(yellow(boundary));
        dashed.push(yellow(boundary + inward * TURN_LANE_INNER_OFFSET_M));
      }
    } else if (opposing) {
      // Rails down both centre lanes mark them already; paint nothing under them.
      if (piece.tram && next.tram) continue;
      if (centre === 'dashed') dashed.push(yellow(boundary));
      if (centre === 'double')
        solid.push(
          yellow(boundary - CENTRE_PAIR_OFFSET_M),
          yellow(boundary + CENTRE_PAIR_OFFSET_M),
        );
    } else if ((sameWay || travelToBus) && style.laneLines) {
      dashed.push(white(boundary));
    }
  }

  // Edge lines: a solid white line down each side of the carriageway, marking
  // where the running surface ends and the shoulder, gutter or kerb begins.
  // Every paved road carries them; on a road with a shoulder the line is the
  // shoulder's inside edge, which is what tells a driver where it is safe to
  // pull over.
  if (style.edgeLines && half > EDGE_LINE_MARGIN_M) {
    const shoulderInside = (side: -1 | 1): number => {
      let edge = -half;
      let inner: number | null = null;
      for (const piece of pieces) {
        const from = edge;
        edge += piece.width;
        if (piece.kind !== 'shoulder') continue;
        if (side < 0 && from < 0) inner = edge;
        if (side > 0 && edge > 0) inner ??= from;
      }
      return inner ?? side * (half - EDGE_LINE_MARGIN_M);
    };
    // The edge of a one-way carriageway that faces the median or the opposing
    // traffic is YELLOW; the one facing the roadside is white.
    //
    // Which edge that is comes from the section itself wherever the section
    // says: a corridor carries one half of the road on each of its two tiles,
    // so the median sits at one EDGE of each half — the left edge of the far
    // half and the right edge of the near one. Only a section that does not
    // say — a whole divided road with the median in the middle of it, a
    // one-way street, a ramp — falls back to the left-hand convention.
    const medianAtLeft = pieces[0]?.kind === 'median';
    const medianAtRight = pieces[pieces.length - 1]?.kind === 'median';
    const facesMedian =
      profile.class === 'oneWay' || profile.class === 'divided' || profile.class === 'ramp';
    // Which edge the driver's LEFT is depends on which way the road RUNS, not
    // on the order of its pieces. Offsets grow east and south, so a road drawn
    // north or east has its driver's left at the low offsets and one drawn
    // south or west has it at the high ones. Reading the section alone paints
    // the yellow down the nearside of half the one-way streets in the city.
    const runsWithOffsets = flow === RoadFlow.South || flow === RoadFlow.West;
    const fallbackYellowLeft = facesMedian && !runsWithOffsets;
    const fallbackYellowRight = facesMedian && runsWithOffsets;
    const leftIsYellow = medianAtLeft || (!medianAtRight && fallbackYellowLeft);
    const rightIsYellow = medianAtRight || (!medianAtLeft && fallbackYellowRight);
    solid.push(
      leftIsYellow ? yellow(shoulderInside(-1)) : white(shoulderInside(-1)),
      rightIsYellow ? yellow(shoulderInside(1)) : white(shoulderInside(1)),
    );
  }

  // The turn lane's extent across the carriageway, for the arrows painted in it.
  let turnLane: { from: number; to: number } | null = null;
  {
    let edge = -half;
    for (const piece of pieces) {
      const from = edge;
      edge += piece.width;
      if (piece.kind === 'centreTurn') turnLane = { from, to: edge };
    }
  }

  const hasMedian = pieces.some((p) => p.kind === 'median');
  // A median makes this a DIVIDED road, and the left-hand edge of a divided
  // road's roadway is marked yellow — the line that tells a driver which side
  // of the road they are on without having to look for oncoming headlights.
  //
  // It goes at the median's two edges, just inside the running surface, and
  // not as a pair over the median's own centre: there is no centre to paint,
  // and a pair painted there is buried under the planting the moment the
  // raised median is drawn over it, which is why a straight avenue run
  // carried no yellow at all. Where the median is at an EDGE of the section —
  // a corridor's half — the edge-line rule above has already painted that
  // side, so nothing is added.
  if (hasMedian && style.centre !== 'none') {
    const medianIndex = pieces.findIndex((p) => p.kind === 'median');
    const from = pieces.slice(0, medianIndex).reduce((w, p) => w + p.width, -half);
    const to = from + pieces[medianIndex]!.width;
    if (from > -half + 1e-9) solid.push(yellow(from - MEDIAN_EDGE_LINE_INSET_M));
    if (to < half - 1e-9) solid.push(yellow(to + MEDIAN_EDGE_LINE_INSET_M));
  }

  return {
    solid: solid.sort((a, b) => a.at - b.at),
    dashed: dashed.sort((a, b) => a.at - b.at),
    bands,
    turnLane,
    hasMedian,
    barrier: profile.class === 'highway',
  };
}

/**
 * Where each of `here`'s lines sits at the seam with the road in `there`.
 *
 * A road is painted tile by tile, but a driver reads one line down its whole
 * length, so a line has to arrive at the boundary in the same place from both
 * sides or it steps. Every line meets its opposite number HALF WAY: both tiles
 * work out the same midpoint from the same two plans, so the line crosses the
 * seam unbroken without either tile knowing which of them is the wider road.
 *
 * A line with no opposite number is a lane the next road does not have. It
 * CLOSES rather than stopping dead: it runs out to the edge of the carriageway
 * it is merging into, which is the line a dropped lane actually follows.
 *
 * Opposite numbers are matched nearest-first and one to one, and only within a
 * colour — a lane line and a centre line are different things and a lane line
 * that drifted across the middle of the road to meet one would be worse than
 * the step it replaced.
 */
export function seamOffsets(
  here: readonly MarkingLine[],
  there: readonly MarkingLine[],
  /** Half the width of the carriageway on the far side, where a line closes to. */
  thereHalf: number,
): number[] {
  const taken = new Array<boolean>(there.length).fill(false);
  // Nearest first over ALL the pairs, so the closest match wins the line it is
  // closest to rather than whichever line happened to be considered first.
  const pairs: { i: number; j: number; gap: number }[] = [];
  here.forEach((a, i) =>
    there.forEach((b, j) => {
      if (a.color === b.color) pairs.push({ i, j, gap: Math.abs(a.at - b.at) });
    }),
  );
  pairs.sort((p, q) => p.gap - q.gap);
  const partner = new Array<number>(here.length).fill(-1);
  for (const { i, j } of pairs) {
    if (partner[i] !== -1 || taken[j]) continue;
    partner[i] = j;
    taken[j] = true;
  }
  /** The nearest line of the same colour over there, whether or not it is spoken for. */
  const nearestOfColour = (line: MarkingLine): MarkingLine | null => {
    let best: MarkingLine | null = null;
    for (const b of there) {
      if (b.color !== line.color) continue;
      if (!best || Math.abs(b.at - line.at) < Math.abs(best.at - line.at)) best = b;
    }
    return best;
  };
  return here.map((line, i) => {
    const j = partner[i]!;
    if (j >= 0) return (line.at + there[j]!.at) / 2;
    // Nothing of its own to carry on into. It still MERGES rather than
    // stopping dead: a dropped lane's line runs into the edge line beside it,
    // and the two lines of a double centre converge on the single centre that
    // replaces them. Either way that is the nearest line of the same colour.
    //
    // It closes ALL the way by the seam rather than half of it. A matched line
    // meets its opposite number in the middle so both tiles agree on where the
    // boundary is; this one has no opposite number, so there is nothing to
    // agree with and stopping half way would leave the stub the merge exists
    // to avoid.
    const near = nearestOfColour(line);
    if (near) return near.at;
    // Nothing of that colour at all over there, so there is only the road's
    // own edge left to close to; a line already on the centreline has no side
    // to close toward and simply ends where it is.
    if (thereHalf <= 0 || line.at === 0) return line.at;
    return Math.sign(line.at) * thereHalf;
  });
}

/**
 * The seam between two tiles' whole plans.
 *
 * Solid and dashed are matched TOGETHER, because a line that changes style
 * across the seam is still one line: a double yellow centre becoming a broken
 * one is the same centre, and matching each list only to its own kind would
 * send it off to the kerb looking for a solid partner it never had.
 */
export function seamBetween(
  here: MarkingPlan,
  there: MarkingPlan | null,
  thereHalf: number,
): { solid: number[]; dashed: number[] } {
  if (!there) {
    return { solid: here.solid.map((l) => l.at), dashed: here.dashed.map((l) => l.at) };
  }
  const at = seamOffsets(
    [...here.solid, ...here.dashed],
    [...there.solid, ...there.dashed],
    thereHalf,
  );
  return { solid: at.slice(0, here.solid.length), dashed: at.slice(here.solid.length) };
}

/** The pair of solid lines painted around the centre, or none. */
export function centrePair(plan: MarkingPlan): [MarkingLine, MarkingLine] | null {
  const lo = plan.solid.find((l) => Math.abs(l.at + CENTRE_PAIR_OFFSET_M) < 1e-6);
  const hi = plan.solid.find((l) => Math.abs(l.at - CENTRE_PAIR_OFFSET_M) < 1e-6);
  return lo !== undefined && hi !== undefined ? [lo, hi] : null;
}
