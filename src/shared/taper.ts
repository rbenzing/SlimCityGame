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
import { CARRIAGEWAY_KINDS, carriagewayWidth, laneWidthFor, roadClass } from './roadprofile';
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
 * The kerbside pieces a road can simply END: a parking lane and a bike lane.
 * Where the road ahead does not carry one, it closes itself over the taper on
 * its own side of the road, and the travel lanes beside it are not touched.
 */
const ENDING_KINDS = ['parking', 'bike'] as const;
type EndingKind = (typeof ENDING_KINDS)[number];

/**
 * Metres of each kerbside piece that ends, on the low side of the section and
 * on the high one, in world order.
 */
export type KerbsideDrop = Readonly<Record<EndingKind, readonly [number, number]>>;

/** How wide a road's pieces of one kind are, on its low half and its high half. */
function widthBySide(profile: RoadProfile, kind: LanePiece['kind']): [number, number] {
  const out: [number, number] = [0, 0];
  let edge = -carriagewayWidth(profile) / 2;
  for (const piece of profile.pieces) {
    if (!CARRIAGEWAY_KINDS.has(piece.kind)) continue;
    const centre = edge + piece.width / 2;
    edge += piece.width;
    if (piece.kind === kind) out[centre < 0 ? 0 : 1] += piece.width;
  }
  return out;
}

/** What a lane drop closes: the kerbside pieces that end, and the whole width. */
export interface LaneDrop {
  /** Metres of carriageway closed in all. */
  total: number;
  /** The share of it that is parking and bike lanes ending, side by side. */
  kerbside: KerbsideDrop;
}

/**
 * What closes between `wide` and the `narrow` stretch of the same road it runs
 * on as: each parking or bike lane the narrow road does not carry on that
 * side, and then travel lanes for whatever width is left over. A drop is
 * nothing where the narrow road is no narrower and ends nothing, which is what
 * a road WIDENING reads as — a road that gains a lane gains it at the
 * transition rather than over a taper.
 */
export function laneDrop(wide: RoadProfile, narrow: RoadProfile): LaneDrop {
  const ends = (kind: EndingKind): [number, number] => {
    const a = widthBySide(wide, kind);
    const b = widthBySide(narrow, kind);
    return [Math.max(0, a[0] - b[0]), Math.max(0, a[1] - b[1])];
  };
  const kerbside: KerbsideDrop = { parking: ends('parking'), bike: ends('bike') };
  const ending = ENDING_KINDS.reduce((sum, k) => sum + kerbside[k][0] + kerbside[k][1], 0);
  const travel = Math.max(0, carriagewayWidth(wide) - carriagewayWidth(narrow) - ending);
  return { total: ending + travel, kerbside };
}

/**
 * How much narrower `narrow` is than `wide` across the carriageway, in metres:
 * everything a lane drop between the two closes (see {@link laneDrop}).
 */
export function dropWidth(wide: RoadProfile, narrow: RoadProfile): number {
  return laneDrop(wide, narrow).total;
}

/**
 * The cross-section partway through a taper: the wide road with `closed`
 * metres of it closed. The parking and bike lanes that end (`kerbside`, how
 * much of each has closed by here) narrow on their own sides; the rest comes
 * off the outermost travel lanes, taken from the kerb inward, which is the
 * side a lane drops on when nobody has said otherwise — traffic keeps the
 * lanes nearest the centreline and the outside one runs out. A piece closed to
 * nothing is gone from the section entirely.
 *
 * Nothing that carries on gives way: a lane drop never squeezes the lanes
 * that remain, and footways and reserved bus lanes are still there on the
 * other side of the drop.
 */
export function taperedCrossSection(
  wide: RoadProfile,
  closed: number,
  /**
   * Whether the section is in world order the other way round from its
   * direction of travel — a road heading south or west, whose driver's right
   * is at its LOW end.
   */
  reversed = false,
  /** How much of each ending parking and bike lane has closed by here. */
  kerbside?: KerbsideDrop,
): RoadProfile {
  if (closed <= 0) return wide;
  const pieces = wide.pieces.map((p) => ({ ...p }));
  /** Closes up to `amount` from the pieces in `order`, first to last; returns what it could not. */
  const close = (order: readonly number[], amount: number): number => {
    let left = amount;
    for (const index of order) {
      if (left <= 1e-9) break;
      const piece = pieces[index]!;
      const take = Math.min(piece.width, left);
      piece.width -= take;
      left -= take;
    }
    return left;
  };
  let travelClosed = closed;
  if (kerbside) {
    // Each side's ending pieces close from the outside in, which is where a
    // parking or bike lane lies: the low side from its first piece, the high
    // side from its last.
    let edge = -carriagewayWidth(wide) / 2;
    const sideOf = pieces.map((p) => {
      if (!CARRIAGEWAY_KINDS.has(p.kind)) return -1;
      const centre = edge + p.width / 2;
      edge += p.width;
      return centre < 0 ? 0 : 1;
    });
    for (const kind of ENDING_KINDS) {
      for (const side of [0, 1] as const) {
        const order = pieces
          .map((_, i) => i)
          .filter((i) => pieces[i]!.kind === kind && sideOf[i] === side);
        if (side === 1) order.reverse();
        travelClosed -= kerbside[kind][side];
        close(order, kerbside[kind][side]);
      }
    }
    travelClosed = Math.max(0, travelClosed);
  }
  const sides = directionSides(pieces, reversed);
  if (sides) {
    // A two-way road closes each direction's kerbside lane together, so its
    // centre line runs straight down the taper. An uneven road first gives up
    // the width its wider side has over the other.
    const width = (order: readonly number[]): number =>
      order.reduce((sum, i) => sum + pieces[i]!.width, 0);
    const excess = width(sides.right) - width(sides.left);
    const wider = excess > 0 ? sides.right : sides.left;
    const evening = Math.min(travelClosed, Math.abs(excess));
    const rest = travelClosed - evening + close(wider, evening);
    // Half from each side; whatever one side has not got, the other gives.
    const unclosed = close(sides.right, rest / 2) + close(sides.left, rest / 2);
    close(sides.left, close(sides.right, unclosed));
  } else {
    close(droppingOrder(pieces, reversed), travelClosed);
  }
  const closable = (p: LanePiece): boolean =>
    isDroppable(p) || (ENDING_KINDS as readonly string[]).includes(p.kind);
  return { ...wide, pieces: pieces.filter((p) => !closable(p) || p.width > 1e-9) };
}

/**
 * The travel lanes of a two-way road by the direction they carry, each
 * outermost first: the oncoming lanes on the driver's left and their own on
 * the right. Null for a road whose lanes all run one way, or that never said
 * which way they run.
 */
function directionSides(
  pieces: readonly LanePiece[],
  reversed: boolean,
): { left: number[]; right: number[] } | null {
  const travel = pieces
    .map((piece, index) => ({ piece, index }))
    .filter((e) => isDroppable(e.piece));
  // Read from the driver's left to their right, whichever end of the section
  // that is.
  if (reversed) travel.reverse();
  const back = travel.filter((e) => e.piece.flow === 'back');
  const fwd = travel.filter((e) => e.piece.flow === 'fwd');
  if (back.length === 0 || fwd.length === 0 || back.length + fwd.length !== travel.length) {
    return null;
  }
  return { left: back.map((e) => e.index), right: fwd.map((e) => e.index).reverse() };
}

/**
 * The order a road with no oncoming lanes closes its travel lanes in: the
 * driver's right-hand lane first, then the outermost of what is left on
 * either side in turn, working inward.
 */
function droppingOrder(pieces: readonly LanePiece[], reversed: boolean): number[] {
  const travel = pieces
    .map((piece, index) => ({ piece, index }))
    .filter((e) => isDroppable(e.piece));
  // Read from the driver's left to their right, whichever end of the section
  // that is.
  if (reversed) travel.reverse();
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
  /** Metres of carriageway the whole drop closes. */
  closed: number;
  /** The parking and bike lanes among them that end, side by side; none where only lanes drop. */
  kerbside?: KerbsideDrop;
}

/** How far through its closing a tile `remaining` tiles short of the narrow road is, 0 to 1. */
function closedShare(step: TaperStep): number {
  if (step.length <= 0) return 1;
  return Math.min(1, Math.max(0, (step.length - step.remaining) / step.length));
}

/**
 * How much of the drop has closed by a tile `remaining` tiles short of the
 * narrow road. The lane closes linearly, which is what a straight taper is,
 * and it is fully closed on the tile that meets the narrow road.
 */
export function closedAt(step: TaperStep): number {
  return step.closed * closedShare(step);
}

/** How much of each ending parking and bike lane has closed by the same tile. */
export function kerbsideClosedAt(step: TaperStep): KerbsideDrop | undefined {
  const kerbside = step.kerbside;
  if (!kerbside) return undefined;
  const share = closedShare(step);
  const scaled = (pair: readonly [number, number]): [number, number] => [
    pair[0] * share,
    pair[1] * share,
  ];
  return { parking: scaled(kerbside.parking), bike: scaled(kerbside.bike) };
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
export function pavedCrossSection(
  wide: RoadProfile,
  closed: number,
  reversed = false,
  kerbside?: KerbsideDrop,
): RoadProfile {
  return paintsGore(wide.class) ? wide : taperedCrossSection(wide, closed, reversed, kerbside);
}
