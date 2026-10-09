/**
 * What a junction paints across each of its arms, and where along the arm it
 * lies: the crossing and the stop line, decided by the junction's control and
 * the roads that meet there, and the no-parking zone each keeps on the kerbs
 * of the approach. The road mesh paints from these and the kerb stall layout
 * keeps out of them, so a kerb is kept clear of exactly what is painted.
 */
import { TILE_METERS } from './constants';
import { armGivesWay } from './junction';
import { NO_PARKING_BEFORE_STOP_M, NO_PARKING_FROM_CROSSWALK_M } from './kerbstalls';
import { FOOTWAY_WIDTH_M, isServiceClass, presetProfileForTier, rankForTier } from './roadprofile';
import { RoadTier } from './types';
import type { JunctionControl } from './types';

const TILE_HALF = TILE_METERS / 2;

/** Along-travel-axis stop-line thickness (~0.4m). */
const STOP_LINE_THICKNESS_M = 0.4;
/**
 * The shallowest a marked crossing may be, across the road it carries people
 * over. The US minimum is 6 ft; a road whose verge is thinner than that still
 * gets a crossing this deep rather than one nobody could stand in.
 */
const CROSSWALK_MIN_DEPTH_M = 1.8;
/**
 * Gap between the crossing's far edge and the stop bar. The US rule is that a
 * stop line stands at least 4 ft in advance of the nearest crosswalk line.
 */
const STOP_LINE_GAP_M = 1.2;

export interface JunctionArmLayout {
  /**
   * Distances along the approach from the junction TILE's edge, positive
   * inward. The crossing lies inside the tile; the stop line is NEGATIVE,
   * back down the approach, because that is where a driver has to stop.
   */
  crosswalkStart: number;
  crosswalkEnd: number;
  stopLineStart: number;
  stopLineEnd: number;
}

/**
 * Pure layout for one junction arm, measured INWARD from the tile's outer
 * edge: the crosswalk first, then the gap, then the stop line a driver halts
 * behind. The measurements are the real ones and never shrink — squeezing
 * them into whatever depth was left between the box and the tile edge is what
 * turned a wide road's crossing into a dashed ring hugging the box instead of
 * a crosswalk. On a road wide enough that its carriageway fills the tile the
 * crosswalk simply lies inside the junction, which is where it lies on the
 * ground too.
 */
export function junctionArmLayout(
  armDepth = TILE_HALF,
  footwayWidth = FOOTWAY_WIDTH_M,
): JunctionArmLayout {
  // A crossing is the FOOTWAY CARRIED ACROSS THE ROAD, so it belongs where the
  // footway is: the strip of tile between the junction box and the tile edge,
  // which is exactly what the crossing road spends on its own footway. Painted
  // at a fixed setback instead — which is what this did — it lands wherever
  // that setback happens to fall, and on a road whose carriageway nearly fills
  // its tile it misses the footway entirely and sits out in the box.
  //
  // It is never narrower than the minimum a marked crossing may be, so a road
  // with a thin verge still gets a crossing a person can use; that one reaches
  // a little into the box, which is where a crossing at a wide junction really
  // does lie.
  //
  // It is as deep as that footway and no deeper. Taking the whole strip —
  // which is what `armDepth` is — reads the leftover tile as the figure, and
  // the leftover runs OPPOSITE to the road: a two-lane street leaves 6.25 m
  // and an avenue 1.90 m, so the quiet street got a crossing 20 ft deep and
  // the busy one a normal 6 ft. Same inversion the kerb return had.
  // It sits against the KERB LINE, at the inner end of that strip — which is
  // where the footway it carries across actually runs. Anchored at the tile
  // edge instead it floats at the outer end and leaves a gap between itself
  // and the road: 4.4 m of it beside a two-lane street.
  const depth = Math.max(Math.min(armDepth, footwayWidth), CROSSWALK_MIN_DEPTH_M);
  const crosswalkEnd = Math.max(armDepth, depth);
  const crosswalkStart = crosswalkEnd - depth;
  // The stop line stands IN ADVANCE of the crossing — back down the approach,
  // outside the junction tile altogether. That is the whole point of it:
  // stopping past the crossing is stopping on the people using it, and there
  // is no room between the tile edge and the crossing to put it.
  const stopLineEnd = crosswalkStart - STOP_LINE_GAP_M;
  const stopLineStart = stopLineEnd - STOP_LINE_THICKNESS_M;
  return { crosswalkStart, crosswalkEnd, stopLineStart, stopLineEnd };
}

/**
 * How far back along a road from a junction tile's edge its kerb is kept clear
 * of parking: 9.1 m before a stop line where one is painted across the lanes
 * beside that kerb, and 6.1 m from the crosswalk — or from the junction's
 * mouth, the crossing road's kerb line, where the arm has none. Measured from
 * where the junction tile lays them, so it is the one figure the stall marks
 * and the parked cars both keep out of.
 */
export function noParkingReach(arm: {
  /** The tile between the junction's box and its edge on this arm's side. */
  armDepth: number;
  /** The footway a crossing on this arm carries across the road. */
  footwayWidth: number;
  /** Whether a crossing is painted across the arm. */
  crossed: boolean;
  /** Whether a stop line is painted across the lanes beside this kerb. */
  stopLine: boolean;
}): number {
  const layout = junctionArmLayout(arm.armDepth, arm.footwayWidth);
  const mouth = arm.crossed ? layout.crosswalkStart : arm.armDepth;
  let reach = NO_PARKING_FROM_CROSSWALK_M - mouth;
  if (arm.stopLine) reach = Math.max(reach, NO_PARKING_BEFORE_STOP_M - layout.stopLineStart);
  return Math.max(0, reach);
}

/** One side of a junction tile, and the arm that may leave by it. */
export type ArmSide = 'n' | 'e' | 's' | 'w';

/** What decides what a junction paints across its arms. */
export interface JunctionArms {
  /** The junction tile's own road. */
  tier: RoadTier;
  /** Which sides an arm leaves by. */
  has: Readonly<Record<ArmSide, boolean>>;
  /** The road on each arm; None where it is not named, which reads as this tile's own. */
  roads: Readonly<Record<ArmSide, RoadTier>>;
  /** Whether each arm's road has a footway; omitted, each reads as this tile's own. */
  footways?: Readonly<Record<ArmSide, boolean>>;
  /** Whether the junction's own road has a footway. */
  ownFootway: boolean;
  /** Who gives way there; undefined or `none` where nothing controls it. */
  control: JunctionControl | undefined;
}

/**
 * What a junction paints across one arm: a crossing, a stop line, both or
 * neither. The junction's own paint and the no-parking zone on the approach
 * both read it, so a kerb is kept clear of exactly the markings it is painted.
 */
export function junctionArmPaint(
  j: JunctionArms,
  side: ArmSide,
): { crossed: boolean; stops: boolean } {
  const none = { crossed: false, stops: false };
  // A stop line marks where to stop for a sign or a signal, so it is the
  // CONTROL that decides whether one is painted, not the shape of the
  // junction. An uncontrolled crossroads gets no paint at all; an approach
  // that only gives way gets its crossing but no bar. A roundabout is not
  // painted like a junction at all: no crossings on the box and no stop bars,
  // an island in the middle and a yield line across every entry.
  const control = j.control;
  if (control === undefined || control === 'none' || control === 'roundabout') return none;
  if (!j.has[side]) return none;
  // Which arms stop. A minor road meeting a bigger one gives way to it: the
  // side street gets the stop line and the crosswalk, and the road running
  // through gets neither, the way a real junction reads. Where every arm
  // ranks the same — two equal roads crossing — they all stop, which is the
  // all-way junction.
  const sides: readonly ArmSide[] = ['n', 'e', 's', 'w'];
  const armRanks = sides
    .filter((s) => j.has[s] && j.roads[s] !== RoadTier.None)
    .map((s) => rankForTier(j.roads[s]));
  const ranks = armRanks.length > 0 ? armRanks : [rankForTier(j.tier)];
  const road = j.roads[side];
  const armStops = road === RoadTier.None || armGivesWay(rankForTier(road), ranks);
  // A signal and an all-way stop hold EVERY approach, the road running
  // through included: it stops on red like everything else, and a stop line
  // is where it stops. Only a give-way or a minor-road stop leaves the through
  // road unpainted.
  const holdsEveryArm = control === 'signal' || control === 'allWayStop';
  if (!holdsEveryArm && !armStops) return none;
  const stops = control === 'stop' || control === 'allWayStop' || control === 'signal';
  // A service access carries the footway straight across its mouth rather
  // than breaking it for a crossing, so there is no crossing to paint over
  // one: the pavement IS the way across. An arm whose road is not named is
  // unknown, not absent, and reads as this tile's own road — which is never a
  // service access here.
  const service = road !== RoadTier.None && isServiceClass(presetProfileForTier(road).class);
  // Who walks over a crossing on this arm: the people going the other way, on
  // the footways of the arms ACROSS from it. A road with a raised kerb but no
  // footway — a motorway, an avenue built without one — has nobody to send
  // over the road it meets, so its arms get no crossing.
  const walkable = (s: ArmSide): boolean =>
    j.has[s] &&
    (j.roads[s] === RoadTier.None || j.footways?.[s] === undefined ? j.ownFootway : j.footways[s]);
  const vertical = side === 'n' || side === 's';
  const crossedOnFoot = vertical ? walkable('e') || walkable('w') : walkable('n') || walkable('s');
  return { crossed: !service && crossedOnFoot, stops };
}
