/**
 * What each lane of an approach is allowed to do at the junction ahead of it.
 *
 * A lane is not a road, it is a set of MOVEMENTS: left, through, right, and
 * the U-turn that is usually only allowed from the innermost one. Everything
 * downstream reads that set and nothing else — the arrows painted on the
 * carriageway, whether a turn is a legal path at all, and how much of the
 * junction's delay a movement carries, which divides by the number of lanes
 * serving it. A turn RESTRICTION is the degenerate case: a movement no lane
 * offers is a movement a driver cannot make.
 *
 * Pure: bit sets, tile counts and cardinals, no grid and no graph.
 */
import { RoadFlow } from './types';
import type { RoadClassId } from './types';

/** What a driver does at a junction, as bits so a lane can offer several. */
export const Movement = {
  Left: 1,
  Through: 2,
  Right: 4,
  UTurn: 8,
} as const;
export type Movement = (typeof Movement)[keyof typeof Movement];

/** The movements one lane offers, as a set of `Movement` bits. */
export type MovementSet = number;

/** Every movement, in the order a lane offers them from the centreline out. */
export const MOVEMENTS: readonly Movement[] = [
  Movement.Left,
  Movement.Through,
  Movement.Right,
  Movement.UTurn,
];

/** How a movement reads in the inspector. */
const MOVEMENT_NAMES: Readonly<Record<Movement, string>> = {
  [Movement.Left]: 'Left',
  [Movement.Through]: 'Through',
  [Movement.Right]: 'Right',
  [Movement.UTurn]: 'U-turn',
};

export function movementName(movement: Movement): string {
  return MOVEMENT_NAMES[movement];
}

/**
 * Cardinals clockwise from north, which is the order `RoadFlow` numbers them
 * in — so the turn between two headings is the difference between their
 * indices, with no angle-wrap cases to handle.
 */
function headingIndex(flow: RoadFlow): number | null {
  switch (flow) {
    case RoadFlow.North:
      return 0;
    case RoadFlow.East:
      return 1;
    case RoadFlow.South:
      return 2;
    case RoadFlow.West:
      return 3;
    default:
      return null;
  }
}

/**
 * The movement a driver makes who enters a junction heading `entering` and
 * leaves heading `leaving`. Null when either heading is unknown, which is what
 * a road that never recorded a direction looks like.
 */
export function movementBetween(entering: RoadFlow, leaving: RoadFlow): Movement | null {
  const from = headingIndex(entering);
  const to = headingIndex(leaving);
  if (from === null || to === null) return null;
  switch ((to - from + 4) % 4) {
    case 0:
      return Movement.Through;
    case 1:
      return Movement.Right;
    case 2:
      return Movement.UTurn;
    default:
      return Movement.Left;
  }
}

/**
 * What each lane of an approach is allowed to do when nobody has said
 * otherwise, from the centreline out. One lane does everything. Two share the
 * turns with the through movement. Three earn a dedicated left, which is the
 * first thing a widened approach buys. Four or more earn a dedicated right as
 * well, and everything between them runs through.
 *
 * A U-turn is never offered by default: it is legal in some states and not
 * others, and a player who wants one asks for it.
 */
export function defaultLaneMovements(lanes: number): MovementSet[] {
  const n = Math.max(0, Math.floor(lanes));
  if (n === 0) return [];
  if (n === 1) return [Movement.Left | Movement.Through | Movement.Right];
  if (n === 2) return [Movement.Left | Movement.Through, Movement.Through | Movement.Right];
  if (n === 3) return [Movement.Left, Movement.Through, Movement.Through | Movement.Right];
  return [
    Movement.Left,
    ...Array.from({ length: n - 2 }, () => Movement.Through as MovementSet),
    Movement.Right,
  ];
}

/** How many lanes of an approach offer a movement. Zero means it is banned. */
export function lanesServing(movement: Movement, lanes: readonly MovementSet[]): number {
  return lanes.reduce((count, set) => count + ((set & movement) !== 0 ? 1 : 0), 0);
}

/** Whether any lane of the approach offers the movement at all. */
export function permits(lanes: readonly MovementSet[], movement: Movement): boolean {
  return lanesServing(movement, lanes) > 0;
}

/**
 * How the junction's delay divides between the lanes serving a movement: the
 * queue for a turn two lanes offer is half as long as the queue for one. A
 * movement no lane offers is not a path at all, so it has no delay to share
 * and the caller should already have refused it; it reads as one lane here
 * rather than dividing by nothing.
 */
export function movementDelayShare(movement: Movement, lanes: readonly MovementSet[]): number {
  return Math.max(1, lanesServing(movement, lanes));
}

/**
 * How many tiles before a junction are its APPROACH ZONE — the length a turn
 * queue needs, from AASHTO's 15 m minimum plus one vehicle per 20 s of red at
 * 7.5 m a car: a local approach stores two cars, a collector four or five, an
 * arterial seven to nine. It is the stretch where a lane can mean something
 * different from the road behind it, which is what lets a two-lane street earn
 * a left-turn pocket at one junction without becoming a three-lane street.
 */
const APPROACH_ZONE_BY_CLASS: Readonly<Record<RoadClassId, number>> = {
  dirt: 1,
  alley: 1,
  rural: 2,
  local: 2,
  oneWay: 2,
  urban: 3,
  collector: 3,
  arterial: 4,
  divided: 5,
  highway: 5,
  ramp: 2,
  rail: 0,
};

export function approachZoneTiles(classId: RoadClassId): number {
  return APPROACH_ZONE_BY_CLASS[classId];
}

/**
 * What an approach allows when nobody has restricted it: everything the
 * default lane sets between them offer, which is every turn but the U.
 */
export const DEFAULT_ALLOWED: MovementSet = Movement.Left | Movement.Through | Movement.Right;

/**
 * A junction's turn restrictions, packed as one NIBBLE per arm — north, east,
 * south, west, in the order the cardinals climb — each the set of movements
 * that arm allows. A zero nibble is no restriction, so an untouched junction
 * packs to zero; banning every movement is not a restriction anyone can mean,
 * which is what leaves zero free to say "as it comes".
 */
export type PackedTurns = number;

/** What the arm lying in `arm` allows. */
export function armAllowed(packed: PackedTurns, arm: RoadFlow): MovementSet {
  const slot = headingIndex(arm);
  if (slot === null) return DEFAULT_ALLOWED;
  const nibble = (packed >> (slot * 4)) & 0xf;
  return nibble === 0 ? DEFAULT_ALLOWED : nibble;
}

/** Whether the arm lying in `arm` has been restricted at all. */
export function armIsRestricted(packed: PackedTurns, arm: RoadFlow): boolean {
  const slot = headingIndex(arm);
  return slot !== null && ((packed >> (slot * 4)) & 0xf) !== 0;
}

/** The same junction with one arm set, or handed back to the default by a null. */
export function withArmAllowed(
  packed: PackedTurns,
  arm: RoadFlow,
  allowed: MovementSet | null,
): PackedTurns {
  const slot = headingIndex(arm);
  if (slot === null) return packed;
  const cleared = packed & ~(0xf << (slot * 4));
  return cleared | (((allowed ?? 0) & 0xf) << (slot * 4));
}

/** Whether a driver arriving on `arm` may make `movement`. */
export function movementAllowed(packed: PackedTurns, arm: RoadFlow, movement: Movement): boolean {
  return (armAllowed(packed, arm) & movement) !== 0;
}

/**
 * The lane sets an approach actually offers: the derived defaults with every
 * restricted movement taken out of every lane. A lane left with nothing is
 * still a lane — it simply carries no arrow, which is what a lane that may
 * only go straight on a straight-banned approach would look like.
 */
export function laneMovementsFor(lanes: number, allowed: MovementSet): MovementSet[] {
  return defaultLaneMovements(lanes).map((set) => set & allowed);
}
