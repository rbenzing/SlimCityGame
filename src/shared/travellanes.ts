/**
 * Where a cross-section's lanes lie across the road: every carriageway piece
 * laid edge to edge from the low kerb, and of those the travel lanes and the
 * ones a driver arrives at a junction in. Stop lines, lane-use arrows, parking
 * bands and the no-parking zone beside a stop line all read them.
 */
import { CARRIAGEWAY_KINDS, carriagewayHalfWidthOf, runsAgainstDrawing } from './roadprofile';
import type { LanePiece, RoadProfile } from './types';

/** One carriageway piece of a cross-section and the ground it covers across the road. */
export interface CarriagewaySpan {
  piece: LanePiece;
  /** Signed offset of its low edge from the centreline, metres. */
  from: number;
  /** Signed offset of its high edge. */
  to: number;
}

/** The carriageway pieces of a profile, laid edge to edge from the low kerb, in order. */
export function carriagewaySpans(profile: RoadProfile): CarriagewaySpan[] {
  let offset = -carriagewayHalfWidthOf(profile);
  const spans: CarriagewaySpan[] = [];
  for (const piece of profile.pieces) {
    if (!CARRIAGEWAY_KINDS.has(piece.kind)) continue;
    const from = offset;
    offset += piece.width;
    spans.push({ piece, from, to: offset });
  }
  return spans;
}

/** One travel lane of a cross-section: where its centre is, and which way it runs. */
export interface TravelLane {
  /** Signed offset of the lane's centre from the centreline, metres. */
  centre: number;
  /** Which way it runs, relative to the tile's own stored direction. */
  flow: 'fwd' | 'back' | 'both';
}

/** A travel lane with the ground it covers, not only the line down its middle. */
export interface TravelLaneSpan extends TravelLane {
  /** Signed offset of the lane's near edge from the centreline, metres. */
  from: number;
  /** Signed offset of its far edge. */
  to: number;
}

/**
 * The travel lanes a profile has, with the ground each covers, in order across
 * the tile. Anything painted ACROSS a set of lanes — a stop line above all —
 * has to know where those lanes end, which their centres alone do not say.
 */
export function travelLaneSpans(profile: RoadProfile): TravelLaneSpan[] {
  return carriagewaySpans(profile)
    .filter(({ piece }) => piece.kind === 'travel')
    .map(({ piece, from, to }) => ({
      centre: (from + to) / 2,
      flow: piece.flow ?? 'both',
      from,
      to,
    }));
}

/**
 * The travel lanes a profile has, in order across the tile. Anything painted
 * PER LANE — a lane-use arrow above all — has to know where the lane actually
 * is, and the cross-section is the only thing that knows.
 */
export function travelLanes(profile: RoadProfile): TravelLane[] {
  return travelLaneSpans(profile).map(({ centre, flow }) => ({ centre, flow }));
}

/**
 * The lanes of an approach a driver actually arrives in — the ones a stop line
 * is painted across and a lane-use arrow is painted in.
 *
 * On a two-way road they are the lanes on the driver's RIGHT of the centreline.
 * On a one-way, every lane approaches or none does, depending on which way the
 * road runs; `runsToward` says whether the way it was DRAWN is toward the
 * junction, and a road that never recorded a direction is taken to run both
 * ways. Half of a two-way corridor runs one way too, but its lanes may be the
 * ones running against the drawing, and they approach from the other end.
 *
 * A turn pocket is why this cannot simply be "the half with the positive
 * offsets". A pocket makes the section lopsided, so the centreline stops being
 * the middle of the road; which half a lane belongs to is then what it FLOWS,
 * read off the half that the road WITHOUT its pocket had on the driver's
 * right. `own` is that unpocketed section.
 */
export function approachingLanes(
  drawn: RoadProfile,
  own: RoadProfile,
  runsToward: boolean,
  leftSign: 1 | -1,
): TravelLaneSpan[] {
  const lanes = travelLaneSpans(drawn);
  if (lanes.length === 0) return [];
  const oneWay = lanes.every((l) => l.flow === lanes[0]!.flow);
  const onTheRight = (l: { centre: number }): boolean => l.centre * leftSign < 0;
  if (oneWay) return runsToward !== runsAgainstDrawing(drawn) ? lanes : [];
  const towardUs = travelLaneSpans(own).find(onTheRight)?.flow;
  return lanes.filter((l) => (towardUs ? l.flow === towardUs : onTheRight(l)));
}

/**
 * How far across the road an approach reaches, kerb-side edge to centreline —
 * the extent a stop line spans. Null where nothing approaches, which is a
 * one-way running away from the junction and has no stop line to paint.
 */
export function approachingSpan(
  drawn: RoadProfile,
  own: RoadProfile,
  runsToward: boolean,
  leftSign: 1 | -1,
): { from: number; to: number } | null {
  const lanes = approachingLanes(drawn, own, runsToward, leftSign);
  if (lanes.length === 0) return null;
  return {
    from: Math.min(...lanes.map((l) => l.from)),
    to: Math.max(...lanes.map((l) => l.to)),
  };
}
