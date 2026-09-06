/**
 * Lane drops: how a wide road becomes a narrow one.
 *
 * Where two cross-sections of different lane counts meet, the extra lanes do
 * not stop dead at the tile boundary — they close over a TAPER, and how long
 * that taper is comes from the standard ratios rather than from taste: 1:50 on
 * a motorway, 1:10 to 1:15 on a street. A lane closing at 1:50 moves one lane
 * width sideways over fifty of them, which is why a motorway lane drop is a
 * tenth of a kilometre and a street's is half a block.
 *
 * Pure: cross-sections, widths and tile counts, no grid and no graph.
 */
import { TILE_METERS } from './constants';
import { carriagewayWidth, laneWidthFor, roadClass } from './roadprofile';
import type { LanePiece, RoadClassId, RoadProfile } from './types';

/**
 * How far a closing lane travels along the road for each metre it moves
 * sideways. A motorway closes a lane at 1:50 because it is closed at speed; a
 * street at 1:10 to 1:15, which is what a driver can read at 50 km/h. The
 * classes in between take the street figure, since they are streets.
 */
const TAPER_RATIO_BY_CLASS: Readonly<Record<RoadClassId, number>> = {
  dirt: 10,
  alley: 10,
  rural: 12,
  local: 15,
  oneWay: 15,
  urban: 15,
  collector: 15,
  arterial: 15,
  divided: 30,
  highway: 50,
  ramp: 50,
  rail: 0,
};

/**
 * The longest taper the game draws. Two motorway lanes dropping at 1:50 would
 * close over 350 m — more road than most junction spacings hold, and more than
 * a player laying a transition means by it. Real practice drops such lanes one
 * at a time; this closes them together and stops at the length a corridor can
 * actually hold.
 */
export const TAPER_MAX_TILES = 12;

/**
 * The tiles a lane drop of `width` metres takes to close on this class, from
 * the class's own ratio. A drop of nothing takes no tiles; anything else takes
 * at least one, since a lane cannot close in no distance at all.
 */
export function taperTilesFor(classId: RoadClassId, width: number): number {
  const ratio = TAPER_RATIO_BY_CLASS[classId];
  if (ratio <= 0 || width <= 0) return 0;
  const tiles = Math.round((ratio * width) / TILE_METERS);
  return Math.min(TAPER_MAX_TILES, Math.max(1, tiles));
}

/** The tiles ONE lane of this class takes to close — the figure the ratios are quoted for. */
export function laneTaperTiles(classId: RoadClassId): number {
  return taperTilesFor(classId, laneWidthFor(classId));
}

/** A travel lane is a lane; a reserved one belongs to somebody else and never closes. */
function isDroppable(piece: LanePiece): boolean {
  return piece.kind === 'travel';
}

/**
 * How much narrower `narrow` is than `wide` across the carriageway, in metres.
 * Zero when it is no narrower, which is what two roads of the same width are
 * and what a road WIDENING reads as — the taper belongs to the wide side, and
 * a road that gains a lane gains it at the transition rather than over one.
 */
export function dropWidth(wide: RoadProfile, narrow: RoadProfile): number {
  return Math.max(0, carriagewayWidth(wide) - carriagewayWidth(narrow));
}

/**
 * The cross-section partway through a taper: the wide road with its outermost
 * travel lanes closed by `closed` metres between them, taken from the kerb
 * inward, which is the side a lane drops on when nobody has said otherwise —
 * traffic keeps the lanes nearest the centreline and the outside one runs out.
 * A lane closed to nothing is gone from the section entirely.
 *
 * Only the travel lanes give way. Everything else the road carries — its
 * footways, its parking, a reserved bus lane — is the road's own and is still
 * there on the other side of the drop.
 */
export function taperedCrossSection(wide: RoadProfile, closed: number): RoadProfile {
  if (closed <= 0) return wide;
  const pieces = wide.pieces.map((p) => ({ ...p }));
  // Outermost first, on alternating sides, so a two-way road closes its two
  // kerbside lanes together rather than eating one side of the road.
  const order = droppingOrder(pieces);
  let left = closed;
  for (const index of order) {
    if (left <= 1e-9) break;
    const piece = pieces[index]!;
    const take = Math.min(piece.width, left);
    piece.width -= take;
    left -= take;
  }
  return { ...wide, pieces: pieces.filter((p) => !isDroppable(p) || p.width > 1e-9) };
}

/**
 * The order the travel lanes close in: the outermost on each side, working
 * inward, taking the wider side first so an uneven road closes down to an even
 * one rather than into its own centreline.
 */
function droppingOrder(pieces: readonly LanePiece[]): number[] {
  const travel = pieces
    .map((piece, index) => ({ piece, index }))
    .filter((e) => isDroppable(e.piece));
  const half = travel.length / 2;
  const fromLeft = travel.slice(0, Math.floor(half)).map((e) => e.index);
  const fromRight = travel
    .slice(Math.ceil(half))
    .map((e) => e.index)
    .reverse();
  const order: number[] = [];
  for (let i = 0; i < Math.max(fromLeft.length, fromRight.length); i++) {
    // A lane from each kerb in turn, the right one first: on a road with an
    // odd number of lanes the extra one is the kerbside lane of the wider
    // half, and that is the one a drop takes.
    if (i < fromRight.length) order.push(fromRight[i]!);
    if (i < fromLeft.length) order.push(fromLeft[i]!);
  }
  return order;
}

/** One tile of a taper: how far through the closing it is, and what it draws. */
export interface TaperStep {
  /** Tiles still to go before the lane is gone; 0 is the tile against the narrow road. */
  remaining: number;
  /** The whole taper's length in tiles. */
  length: number;
  /** Metres of lane already closed on this tile. */
  closed: number;
}

/**
 * How much of the drop has closed by a tile `remaining` tiles short of the
 * narrow road. The lane closes linearly, which is what a straight taper is,
 * and it is fully closed on the tile that meets the narrow road.
 */
export function closedAt(step: TaperStep): number {
  if (step.length <= 0) return step.closed;
  const gone = (step.length - step.remaining) / step.length;
  return step.closed * Math.min(1, Math.max(0, gone));
}

/**
 * Whether this class closes a lane by PAINT, leaving the pavement where it is.
 * A motorway does, and so does its ramp and a divided road: at speed the
 * tarmac has to stay — it is the recovery a driver who misses the taper needs
 * — so the lane is taken away by moving the edge line inward and hatching what
 * is left. A street simply narrows, and makes do with the lane line and the
 * arrow.
 */
export function paintsGore(classId: RoadClassId): boolean {
  return roadClass(classId).surface === 'paved' && TAPER_RATIO_BY_CLASS[classId] >= 30;
}

/**
 * The cross-section the PAVEMENT is laid to partway through a taper — as
 * opposed to the one the paint is laid to, which is always the tapered one.
 *
 * On a street they are the same: the lane closes and the tarmac closes with
 * it. On a motorway the pavement runs on at full width and only the paint
 * moves, which leaves the NEUTRAL AREA between them — the wedge a driver reads
 * as somewhere not to be, rather than as the road bending away.
 */
export function pavedCrossSection(wide: RoadProfile, closed: number): RoadProfile {
  return paintsGore(wide.class) ? wide : taperedCrossSection(wide, closed);
}
