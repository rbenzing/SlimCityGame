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
   * Distances along the approach from the junction's CENTRE, positive
   * outward. The crossing lies outside the box, from the crossing road's
   * kerb line out; the stop line lies further out still, because that is
   * where a driver has to stop. `crosswalkNear` is the kerb line itself.
   */
  crosswalkNear: number;
  crosswalkFar: number;
  stopLineNear: number;
  stopLineFar: number;
}

/**
 * Pure layout for one junction arm, measured OUTWARD from the junction's
 * centre: the crosswalk first, then the gap, then the stop line a driver halts
 * behind. The measurements are the real ones and never shrink.
 *
 * A crossing is the FOOTWAY OF THE CROSSING ROAD carried across this arm, so
 * it starts at that road's kerb line (`crossHalf`, half its carriageway) and
 * runs outward from there, as deep as that footway and never under the
 * minimum a marked crossing may be. It never lies inside the box.
 */
export function junctionArmLayout(
  crossHalf: number,
  footwayWidth = FOOTWAY_WIDTH_M,
): JunctionArmLayout {
  const depth = Math.max(footwayWidth, CROSSWALK_MIN_DEPTH_M);
  const crosswalkNear = crossHalf;
  const crosswalkFar = crosswalkNear + depth;
  // The stop line stands IN ADVANCE of the crossing, back down the approach:
  // stopping past the crossing is stopping on the people using it.
  const stopLineNear = crosswalkFar + STOP_LINE_GAP_M;
  const stopLineFar = stopLineNear + STOP_LINE_THICKNESS_M;
  return { crosswalkNear, crosswalkFar, stopLineNear, stopLineFar };
}

/**
 * How far from the junction's centre the outermost paint across an arm
 * reaches: the stop line where one is painted, else the crossing, else
 * nothing. Lane lines on the approach end there.
 */
export function junctionPaintReach(
  layout: JunctionArmLayout,
  paint: { crossed: boolean; stops: boolean },
): number {
  if (paint.stops) return layout.stopLineFar;
  return paint.crossed ? layout.crosswalkFar : 0;
}

/**
 * How far into the approach tile the junction's paint reaches past the tile's
 * edge, in metres: zero where it all lies inside the junction tile.
 */
export function paintReachBeyondEdge(
  layout: JunctionArmLayout,
  paint: { crossed: boolean; stops: boolean },
): number {
  return Math.max(0, junctionPaintReach(layout, paint) - TILE_HALF);
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
  /** Half the carriageway of the road crossing this arm: where its kerb line lies. */
  crossHalf: number;
  /** The footway a crossing on this arm carries across the road. */
  footwayWidth: number;
  /** Whether a crossing is painted across the arm. */
  crossed: boolean;
  /** Whether a stop line is painted across the lanes beside this kerb. */
  stopLine: boolean;
}): number {
  const layout = junctionArmLayout(arm.crossHalf, arm.footwayWidth);
  // Distances back from the tile's edge, negative where the paint lies past it.
  const mouth = TILE_HALF - (arm.crossed ? layout.crosswalkNear : arm.crossHalf);
  let reach = NO_PARKING_FROM_CROSSWALK_M - mouth;
  if (arm.stopLine) {
    reach = Math.max(reach, NO_PARKING_BEFORE_STOP_M - (TILE_HALF - layout.stopLineFar));
  }
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
