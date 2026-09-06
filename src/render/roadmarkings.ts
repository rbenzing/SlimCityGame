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
/** A bike lane's paint is at most this wide; a wider piece keeps a buffer to the kerb. */
export const BIKE_PAINT_MAX_WIDTH_M = 1.6;

export type BandKind = 'bus' | 'bike' | 'parking';

export interface MarkingBand {
  kind: BandKind;
  /** Signed offsets from the centreline, metres, `from` < `to`. */
  from: number;
  to: number;
}

export interface MarkingPlan {
  /** Signed offsets of solid white lines. */
  solid: number[];
  /** Signed offsets of dashed white lines. */
  dashed: number[];
  /** Reserved and parking lanes to fill or tick. */
  bands: MarkingBand[];
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
  dirt: { centre: 'none', laneLines: false, edgeLines: false },
  alley: { centre: 'none', laneLines: false, edgeLines: false },
  rural: { centre: 'auto', laneLines: true, edgeLines: false },
  local: { centre: 'auto', laneLines: true, edgeLines: false },
  urban: { centre: 'auto', laneLines: true, edgeLines: false },
  collector: { centre: 'auto', laneLines: true, edgeLines: false },
  arterial: { centre: 'double', laneLines: true, edgeLines: false },
  divided: { centre: 'double', laneLines: true, edgeLines: false },
  oneWay: { centre: 'none', laneLines: true, edgeLines: false },
  highway: { centre: 'none', laneLines: false, edgeLines: true },
  ramp: { centre: 'none', laneLines: false, edgeLines: true },
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

/** Lays the carriageway pieces across the tile and reads the lines between them. */
export function markingPlan(profile: RoadProfile): MarkingPlan {
  const style = CLASS_MARKINGS[profile.class];
  const pieces = profile.pieces.filter((p) => CARRIAGEWAY_KINDS.has(p.kind));
  const half = carriagewayHalfWidthOf(profile);

  const solid: number[] = [];
  const dashed: number[] = [];
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
      if (style.centre !== 'none') solid.push(boundary);
    } else if (opposing) {
      // Rails down both centre lanes mark them already; paint nothing under them.
      if (piece.tram && next.tram) continue;
      if (centre === 'dashed') dashed.push(boundary);
      if (centre === 'double')
        solid.push(boundary - CENTRE_PAIR_OFFSET_M, boundary + CENTRE_PAIR_OFFSET_M);
    } else if ((sameWay || travelToBus) && style.laneLines) {
      dashed.push(boundary);
    }
  }

  if (style.edgeLines && half > EDGE_LINE_MARGIN_M) {
    solid.push(-(half - EDGE_LINE_MARGIN_M), half - EDGE_LINE_MARGIN_M);
  }

  const hasMedian = pieces.some((p) => p.kind === 'median');
  // A median splits the centre: the double pair around it is only painted
  // where the raised median itself is absent, which the mesh decides per tile.
  if (hasMedian && style.centre !== 'none') {
    const medianIndex = pieces.findIndex((p) => p.kind === 'median');
    const before = pieces.slice(0, medianIndex).reduce((w, p) => w + p.width, -half);
    const centreAt = before + pieces[medianIndex]!.width / 2;
    solid.push(centreAt - CENTRE_PAIR_OFFSET_M, centreAt + CENTRE_PAIR_OFFSET_M);
  }

  return {
    solid: solid.sort((a, b) => a - b),
    dashed: dashed.sort((a, b) => a - b),
    bands,
    hasMedian,
    barrier: profile.class === 'highway',
  };
}

/** The pair of solid lines painted around the centre, or none. */
export function centrePair(plan: MarkingPlan): [number, number] | null {
  const lo = plan.solid.find((o) => Math.abs(o + CENTRE_PAIR_OFFSET_M) < 1e-6);
  const hi = plan.solid.find((o) => Math.abs(o - CENTRE_PAIR_OFFSET_M) < 1e-6);
  return lo !== undefined && hi !== undefined ? [lo, hi] : null;
}
