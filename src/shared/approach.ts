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
import type { JunctionControl } from './types';

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
/**
 * Which of the four packed slots an arm occupies — north, east, south, west,
 * in the order the cardinals climb. Null for anything that is not a cardinal.
 */
export function armSlot(flow: RoadFlow): number | null {
  return headingIndex(flow);
}

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

/**
 * The lanes of ONE arm, packed as a nibble each — the movements that lane
 * allows, in the order the sets come off `defaultLaneMovements`: the driver's
 * leftmost lane first.
 *
 * A zero nibble means the lane has not been touched and takes the derived
 * default, which is the same trick the per-arm nibble plays: banning every
 * movement in a lane is not something anyone can mean, so zero is free to say
 * "as it comes". Four lanes is as many as one arm of a one-tile road can hold
 * — three running lanes and the turn bay it earns.
 */
export type PackedLaneTurns = number;

/** How many lanes of one arm carry an editable movement set. */
export const MAX_EDITABLE_LANES = 4;

/** What lane `lane` of an arm has been set to, or null where it has not been. */
export function laneAllowed(packed: PackedLaneTurns, lane: number): MovementSet | null {
  if (lane < 0 || lane >= MAX_EDITABLE_LANES) return null;
  const nibble = (packed >> (lane * 4)) & 0xf;
  return nibble === 0 ? null : nibble;
}

/** The same arm with one lane set, or handed back to the default by a null. */
export function withLaneAllowed(
  packed: PackedLaneTurns,
  lane: number,
  allowed: MovementSet | null,
): PackedLaneTurns {
  if (lane < 0 || lane >= MAX_EDITABLE_LANES) return packed;
  const cleared = packed & ~(0xf << (lane * 4));
  return cleared | (((allowed ?? 0) & 0xf) << (lane * 4));
}

/**
 * What each lane of an approach actually offers: the derived defaults, with
 * any lane the player has set replacing its own.
 *
 * An override is still held to what the ARM allows. A restriction is a
 * movement taken off every lane, so letting one lane hand it back would make
 * the two controls argue — and the arm is the one the player reaches for
 * first.
 */
export function resolveLaneMovements(
  derived: readonly MovementSet[],
  packed: PackedLaneTurns,
  armAllows: MovementSet,
): MovementSet[] {
  return derived.map((set, lane) => {
    const chosen = laneAllowed(packed, lane);
    return chosen === null ? set : chosen & armAllows;
  });
}

/** How many lanes of an approach offer a movement. Zero means it is banned. */
export function lanesServing(movement: Movement, lanes: readonly MovementSet[]): number {
  return lanes.reduce((count, set) => count + ((set & movement) !== 0 ? 1 : 0), 0);
}

/** Whether any lane of the approach offers the movement at all. */
export function permits(lanes: readonly MovementSet[], movement: Movement): boolean {
  return lanesServing(movement, lanes) > 0;
}

/** How many movements one lane offers: one is a lane of its own, three is a queue. */
function breadthOf(set: MovementSet): number {
  return MOVEMENTS.reduce((n, m) => n + ((set & m) !== 0 ? 1 : 0), 0);
}

/**
 * How the junction's delay divides between the lanes serving a movement: the
 * queue for a turn two lanes offer is half as long as the queue for one, and a
 * turn made from a lane SHARED with the traffic going straight queues behind
 * that traffic too, so it gets only its share of the lane. That is the whole
 * point of a turn pocket, and the only way the delay can show it.
 *
 * The shares are measured against an approach whose every lane does
 * everything, which reads as its own lane count and is exactly what a
 * single-lane approach has always cost. So a lane of one's own is worth more
 * than a lane shared three ways, and no road got slower for the reading.
 *
 * A movement no lane offers is not a path at all, so it has no delay to share
 * and the caller should already have refused it; it reads as one lane here
 * rather than dividing by nothing.
 */
export function movementDelayShare(movement: Movement, lanes: readonly MovementSet[]): number {
  const breadth = breadthOf(lanes.reduce((all, set) => all | set, 0));
  if (breadth === 0) return 1;
  const service = lanes.reduce(
    (sum, set) => sum + ((set & movement) !== 0 ? 1 / breadthOf(set) : 0),
    0,
  );
  return service > 0 ? service * breadth : 1;
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
 * Whether an arm earns a TURN POCKET — the lane it gains for the last few
 * tiles before the junction. The junction has to hold its traffic for one to
 * be worth building: a signal, a stop or a give-way queues drivers, an
 * uncontrolled crossroads has no queue to take anybody out of. The arm has to
 * both turn left and go through as well: a pocket is the lane beside the
 * centreline, so an arm that may not turn left has nothing to put in one, and
 * an arm that may not go through is already all turn lane. A roundabout's
 * approach flares are geometry a single tile cannot hold, and wait for the
 * two-tile corridor.
 */
export function pocketWarranted(
  control: JunctionControl | null | undefined,
  allowed: MovementSet,
): boolean {
  if (!control || control === 'none' || control === 'roundabout') return false;
  return (allowed & Movement.Through) !== 0 && (allowed & Movement.Left) !== 0;
}

/**
 * What each lane offers on an approach that carries a turn pocket: the pocket
 * is a lane for turning left and nothing else, which is what it was built for,
 * and the lanes behind it divide the rest between them the way they always
 * would — the kerbside one taking the right turn with the through movement.
 */
export function pocketLaneMovements(lanes: number, allowed: MovementSet): MovementSet[] {
  const behind = defaultLaneMovements(lanes).slice(1);
  return [Movement.Left as MovementSet, ...behind].map((set) => set & allowed);
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
