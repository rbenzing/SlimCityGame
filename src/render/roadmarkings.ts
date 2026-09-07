/**
 * Road markings, read from the cross-section. A marking is never authored: a
 * dashed centre line means two opposing lanes with passing allowed, a double
 * solid means a multi-lane undivided road, a dashed lane line sits between two
 * lanes running the same way, an edge line belongs to a motorway, and a
 * coloured band is a reserved lane. This module turns a profile into that
 * list of offsets; the mesh only paints what it is handed.
 */
import type { LanePiece, RoadClassId, RoadProfile } from '../shared/types';
import { carriagewayHalfWidthOf } from '../shared/roadprofile';

/** Half the gap between the two lines of a double solid centre. */
export const CENTRE_PAIR_OFFSET_M = 0.22;
/** How far inside the carriageway edge a motorway's edge line is painted. */
export const EDGE_LINE_MARGIN_M = 0.5;
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
export function markingPlan(profile: RoadProfile): MarkingPlan {
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
    const leftIsYellow = medianAtLeft || (!medianAtRight && facesMedian);
    solid.push(
      leftIsYellow ? yellow(shoulderInside(-1)) : white(shoulderInside(-1)),
      medianAtRight ? yellow(shoulderInside(1)) : white(shoulderInside(1)),
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
  // A median splits the centre: the double pair around it is only painted
  // where the raised median itself is absent, which the mesh decides per tile.
  if (hasMedian && style.centre !== 'none') {
    const medianIndex = pieces.findIndex((p) => p.kind === 'median');
    const before = pieces.slice(0, medianIndex).reduce((w, p) => w + p.width, -half);
    const centreAt = before + pieces[medianIndex]!.width / 2;
    solid.push(yellow(centreAt - CENTRE_PAIR_OFFSET_M), yellow(centreAt + CENTRE_PAIR_OFFSET_M));
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

/** The pair of solid lines painted around the centre, or none. */
export function centrePair(plan: MarkingPlan): [MarkingLine, MarkingLine] | null {
  const lo = plan.solid.find((l) => Math.abs(l.at + CENTRE_PAIR_OFFSET_M) < 1e-6);
  const hi = plan.solid.find((l) => Math.abs(l.at - CENTRE_PAIR_OFFSET_M) < 1e-6);
  return lo !== undefined && hi !== undefined ? [lo, hi] : null;
}
