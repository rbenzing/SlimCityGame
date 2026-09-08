/**
 * Which junction a road tile approaches, and how close it is to it.
 *
 * The last few tiles before a junction are its APPROACH ZONE — the stretch
 * where the road may mean something different from the road behind it: the
 * lane-use arrows are painted there, and the turn pocket a two-lane street
 * earns at one junction lives there and nowhere else. Both the mesh and the
 * furniture have to agree about where that stretch is and what it holds, so
 * the walk lives here and they both read it.
 *
 * The tiles are reached through accessors rather than a grid, so this stays a
 * question about cardinals and distances that either side can ask.
 */
import { armAllowed, pocketWarranted } from './approach';
import type { MovementSet, PackedLaneTurns, PackedTurns } from './approach';
import { isOneWayProfile, withAuxiliaryLane, withTurnPocket } from './roadprofile';
import {
  closedAt,
  dropWidth,
  laneTaperTiles,
  pavedCrossSection,
  TAPER_MAX_TILES,
  taperedCrossSection,
  taperTilesFor,
} from './taper';
import type { TaperStep } from './taper';
import type { CorridorHalf, JunctionControl, RoadClassId, RoadProfile } from './types';
import { RoadFlow } from './types';
import { corridorPartners } from './corridor';

/** What the walk needs to know about the tiles around it. */
export interface ApproachSurroundings {
  /** Whether a road of any kind sits on the tile. */
  hasRoad(x: number, z: number): boolean;
  /** The control worked out for a junction tile; undefined where there is none. */
  controlAt(x: number, z: number): JunctionControl | undefined;
  /** A junction tile's per-arm turn restrictions, zero where it has none. */
  turnsAt(x: number, z: number): PackedTurns;
  /** The cross-section the tile's own profile names, or null off-road. */
  profileAt(x: number, z: number): RoadProfile | null;
  /**
   * Which way the tile was drawn, or `RoadFlow.None` where nothing said. A
   * one-way road's direction is the whole of its meaning, which is how a slip
   * road is told from the motorway it joins.
   */
  flowAt(x: number, z: number): RoadFlow;
  /** Which half of a corridor the tile carries, `'none'` for an ordinary road. */
  corridorHalfAt(x: number, z: number): CorridorHalf;
  /** The id of the cross-section the tile carries — what says two halves are one road. */
  profileIdAt(x: number, z: number): number;
  /**
   * The packed per-lane sets a junction holds for one of its arms, zero where
   * every lane of that arm is on the set the approach derives for it.
   */
  laneTurnsAt(x: number, z: number, arm: RoadFlow): PackedLaneTurns;
}

/** The junction a tile approaches, and what this arm of it may do. */
export interface ApproachAhead {
  /** Which way the junction lies from the tile. */
  toward: RoadFlow;
  /** Tiles still to go: 0 is the last tile before the junction. */
  distance: number;
  /** The movements this arm allows there. */
  allowed: MovementSet;
  /** Whether the approach carries its turn pocket on this tile. */
  pocket: boolean;
  /** How far open that pocket is here, 0 to 1: full against the junction. */
  openness: number;
  /**
   * What the player has said about INDIVIDUAL lanes of this arm, packed a
   * nibble each. Zero is every lane on the set the approach derives, which is
   * what an untouched junction carries.
   */
  laneAllowed: PackedLaneTurns;
}

/**
 * How far open a turn bay is on a tile `distance` tiles short of the junction,
 * given a zone of `zone` tiles. A bay is a taper and then storage: the taper
 * takes the class's own ratio to open one lane width, and what is left of the
 * zone is held at full width, since a queue standing in a wedge is a queue
 * standing half in the through lane. A zone with no room for both is all
 * taper but for the tile against the junction.
 */
function pocketOpenness(classId: RoadClassId, zone: number, distance: number): number {
  const taper = Math.min(laneTaperTiles(classId), Math.max(0, zone - 1));
  if (taper <= 0) return 1;
  return Math.min(1, (zone - distance) / (taper + 1));
}

/** The four cardinals as steps, in the order `RoadFlow` numbers them. */
const STEPS: ReadonlyArray<readonly [number, number, RoadFlow]> = [
  [0, -1, RoadFlow.North],
  [1, 0, RoadFlow.East],
  [0, 1, RoadFlow.South],
  [-1, 0, RoadFlow.West],
];

/** The cardinal facing the other way — the arm a junction sees a tile on. */
export function oppositeFlow(flow: RoadFlow): RoadFlow {
  switch (flow) {
    case RoadFlow.North:
      return RoadFlow.South;
    case RoadFlow.South:
      return RoadFlow.North;
    case RoadFlow.East:
      return RoadFlow.West;
    case RoadFlow.West:
      return RoadFlow.East;
    default:
      return RoadFlow.None;
  }
}

/**
 * How many roads meet on a tile: three or more of them make it a junction.
 *
 * The other half of a corridor does not count. It touches along the whole run,
 * so counting it would make every tile of a divided road a junction — and,
 * because an approach has to be a straight run, would leave no tile of one
 * able to find the junction it really arrives at.
 */
export function roadDegree(x: number, z: number, world: ApproachSurroundings): number {
  let n = 0;
  for (const [dx, dz] of STEPS) {
    if (!world.hasRoad(x + dx, z + dz)) continue;
    if (isCorridorPartner(x, z, dx, dz, world)) continue;
    n++;
  }
  return n;
}

/** Whether the neighbour at (dx, dz) is this tile's own other half. */
function isCorridorPartner(
  x: number,
  z: number,
  dx: number,
  dz: number,
  world: ApproachSurroundings,
): boolean {
  return corridorPartners(
    world.corridorHalfAt(x, z),
    world.corridorHalfAt(x + dx, z + dz),
    world.profileIdAt(x, z),
    world.profileIdAt(x + dx, z + dz),
    world.flowAt(x, z),
    dx,
    dz,
  );
}

/**
 * The junction tile `(x, z)` is an approach to, within `zone` tiles of it, or
 * undefined when it is not one.
 *
 * An approach is a straight run: the tile carries the road through, with the
 * junction ahead of it and more of the same road behind. A corner has no lane
 * to arrow and no room for a pocket, and a tile with junctions both ways at
 * the same distance belongs to neither of them.
 */
export function approachAhead(
  x: number,
  z: number,
  zone: number,
  world: ApproachSurroundings,
): ApproachAhead | undefined {
  if (!world.hasRoad(x, z) || roadDegree(x, z, world) !== 2) return undefined;
  // The walk always looks at least as far as the tile next door, so a road
  // that earns no pocket at all still knows the junction it arrives at.
  const reach = Math.max(1, zone);

  let best: { toward: RoadFlow; distance: number; jx: number; jz: number } | undefined;
  let tied = false;
  for (const [dx, dz, toward] of STEPS) {
    if (!world.hasRoad(x + dx, z + dz)) continue;
    // Never walk sideways into your own other half: along that way lies the
    // length of the road, not anything the road arrives at.
    if (isCorridorPartner(x, z, dx, dz, world)) continue;
    if (!world.hasRoad(x - dx, z - dz)) continue; // a corner, not a run
    for (let step = 1; step <= reach; step++) {
      const tx = x + dx * step;
      const tz = z + dz * step;
      if (!world.hasRoad(tx, tz)) break;
      const degree = roadDegree(tx, tz, world);
      if (degree >= 3) {
        const distance = step - 1;
        if (!best || distance < best.distance) {
          best = { toward, distance, jx: tx, jz: tz };
          tied = false;
        } else if (distance === best.distance) {
          tied = true;
        }
        break;
      }
      // Anything that is not a straight continuation ends the run: a corner
      // turns the road away from the junction, an end has none.
      if (degree !== 2 || !world.hasRoad(tx + dx, tz + dz)) break;
    }
  }
  if (!best || tied) return undefined;

  const arm = oppositeFlow(best.toward);
  const allowed = armAllowed(world.turnsAt(best.jx, best.jz), arm);
  const pocket =
    best.distance < zone && pocketWarranted(world.controlAt(best.jx, best.jz), allowed);
  const mine = world.profileAt(x, z);
  return {
    toward: best.toward,
    distance: best.distance,
    allowed,
    pocket,
    openness: pocket && mine ? pocketOpenness(mine.class, zone, best.distance) : 1,
    laneAllowed: world.laneTurnsAt(best.jx, best.jz, arm),
  };
}

/**
 * Which way the traffic on an approach is going, and the across direction on
 * its driver's left — the side the leftmost lane sits on, and the side a left
 * turn hooks toward. The approaching lanes are the ones on the driver's RIGHT
 * of the centreline, so their offsets carry the opposite sign.
 */
export function approachAxis(toward: RoadFlow): {
  vertical: boolean;
  ahead: 1 | -1;
  leftSign: 1 | -1;
} {
  const vertical = toward === RoadFlow.North || toward === RoadFlow.South;
  const ahead: 1 | -1 = toward === RoadFlow.South || toward === RoadFlow.East ? 1 : -1;
  const leftSign: 1 | -1 = vertical ? ahead : (-ahead as 1 | -1);
  return { vertical, ahead, leftSign };
}

/**
 * The cross-section a tile actually carries: its own, or its own plus the turn
 * pocket where it stands inside a junction's approach zone and the road can
 * find the width for one. Everything measured off the road reads this — the
 * paint, the asphalt it is painted on, and the kerb the furniture stands at —
 * so the pocket widens all of them together or none of them.
 *
 * A one-way running AWAY from the junction has no approaching lane to add a
 * pocket beside; a road that never recorded a direction is taken to run both
 * ways, which is what it is drawn as.
 */
export function pocketedCrossSection(
  profile: RoadProfile,
  approach: ApproachAhead | undefined,
  flow: number,
): RoadProfile {
  if (!approach?.pocket) return profile;
  if (isOneWayProfile(profile) && flow !== RoadFlow.None && flow !== approach.toward) {
    return profile;
  }
  const { leftSign } = approachAxis(approach.toward);
  return withTurnPocket(profile, -leftSign as 1 | -1, approach.openness) ?? profile;
}

/**
 * The cross-section a tile's PAVEMENT is laid to: its own profile, the turn
 * pocket it may have gained for the junction ahead, and the lanes it may be
 * closing for the narrower road ahead. A lane that is on its way out has no
 * width to lend a pocket, so a taper takes precedence over one.
 *
 * A motorway's lane closes by paint rather than by tarmac, so on one of those
 * this is the road at full width all the way down the taper — see
 * `paintedCrossSection` for what the lines are laid to instead, and the strip
 * between the two is the neutral area.
 */
export function drawnCrossSection(
  profile: RoadProfile,
  approach: ApproachAhead | undefined,
  narrowing: TaperStep | undefined,
  flow: number,
  auxiliary?: AuxiliaryLane,
): RoadProfile {
  const base = withAuxiliary(profile, auxiliary);
  if (narrowing) return pavedCrossSection(base, closedAt(narrowing));
  return pocketedCrossSection(base, approach, flow);
}

/**
 * The road plus the auxiliary lane it carries beside a slip road, or the road
 * itself where it carries none or cannot find the width for one.
 */
function withAuxiliary(profile: RoadProfile, auxiliary: AuxiliaryLane | undefined): RoadProfile {
  if (!auxiliary) return profile;
  return withAuxiliaryLane(profile, auxiliary.side, auxiliary.openness) ?? profile;
}

/**
 * The cross-section a tile's PAINT is laid to. Down a taper it is always the
 * narrowing one, whatever the pavement is doing: the lane line is what closes
 * the lane, and on a motorway it is the only thing that does.
 */
export function paintedCrossSection(
  profile: RoadProfile,
  approach: ApproachAhead | undefined,
  narrowing: TaperStep | undefined,
  flow: number,
  auxiliary?: AuxiliaryLane,
): RoadProfile {
  const base = withAuxiliary(profile, auxiliary);
  if (narrowing) return taperedCrossSection(base, closedAt(narrowing));
  return pocketedCrossSection(base, approach, flow);
}

/**
 * The lane drop this tile is running into, or undefined when the road ahead is
 * no narrower than it is. A drop does not happen at the tile boundary: the
 * lanes close over a taper of the length the class's own ratio gives, and this
 * says how far through that closing the tile stands.
 *
 * The walk is the same straight run the approach zone uses — a taper cannot
 * turn a corner, and a road that ends is not a road that narrows. Where a wide
 * stretch narrows at both ends, the nearer one claims the tile, since that is
 * the drop its lanes are closing for.
 */
export function narrowingAhead(
  x: number,
  z: number,
  world: ApproachSurroundings,
): (TaperStep & { toward: RoadFlow }) | undefined {
  const mine = world.profileAt(x, z);
  if (!mine || roadDegree(x, z, world) !== 2) return undefined;

  let best: (TaperStep & { toward: RoadFlow }) | undefined;
  for (const [dx, dz, toward] of STEPS) {
    if (!world.hasRoad(x + dx, z + dz)) continue;
    // Never walk sideways into your own other half: along that way lies the
    // length of the road, not anything the road arrives at.
    if (isCorridorPartner(x, z, dx, dz, world)) continue;
    if (!world.hasRoad(x - dx, z - dz)) continue; // a corner, not a run
    for (let step = 1; step <= TAPER_MAX_TILES; step++) {
      const tx = x + dx * step;
      const tz = z + dz * step;
      const theirs = world.profileAt(tx, tz);
      if (!theirs) break;
      const drop = dropWidth(mine, theirs);
      if (drop > 1e-6) {
        const length = taperTilesFor(mine.class, drop);
        const remaining = step - 1;
        // Only the tiles within the taper's own length are closing; the road
        // further back is simply the wide road it is.
        if (remaining < length && (!best || remaining < best.remaining)) {
          best = { toward, remaining, length, closed: drop };
        }
        break;
      }
      // A tile that is no narrower carries the run on, so long as the run
      // itself carries on straight.
      if (roadDegree(tx, tz, world) !== 2 || !world.hasRoad(tx + dx, tz + dz)) break;
    }
  }
  return best;
}

/**
 * How many tiles of auxiliary lane a motorway grows beside a slip road. AASHTO
 * wants 180 m or more to get up to motorway speed, which is eleven of these
 * tiles; the game's own bound on a taper is twelve, and this stays inside it so
 * an interchange never swallows the run between two of them.
 */
export const AUXILIARY_ZONE_TILES = 8;

/** The auxiliary lane a motorway tile carries beside a slip road. */
export interface AuxiliaryLane {
  /** Which side of the carriageway it stands on. */
  side: -1 | 1;
  /** How far open it is here, 0 to 1: full against the junction. */
  openness: number;
  /** Whether it is the lane traffic joins on, rather than the one it leaves by. */
  merging: boolean;
}

/**
 * The auxiliary lane this tile carries, or undefined where it carries none.
 *
 * A slip road joining a motorway leaves the driver going far slower than the
 * traffic they are joining, so the motorway grows a lane beside the slip road
 * for them to get up to speed in — and, where the slip road LEAVES, one to slow
 * down in before taking it. Which of the two it is comes off the slip road's
 * own stored direction, and where it lies follows from that: an acceleration
 * lane runs downstream of the junction and a deceleration lane runs up to it,
 * both on the side the slip road is on.
 *
 * The lane opens from nothing at the far end of the zone to full width against
 * the junction — a driver joins at the wide end, which is the end nearest the
 * traffic they are joining.
 */
export function auxiliaryLaneAt(
  x: number,
  z: number,
  world: ApproachSurroundings,
): AuxiliaryLane | undefined {
  const mine = world.profileAt(x, z);
  if (!mine || roadDegree(x, z, world) !== 2) return undefined;

  for (const [dx, dz, toward] of STEPS) {
    if (!world.hasRoad(x + dx, z + dz)) continue;
    // Never walk sideways into your own other half: along that way lies the
    // length of the road, not anything the road arrives at.
    if (isCorridorPartner(x, z, dx, dz, world)) continue;
    if (!world.hasRoad(x - dx, z - dz)) continue; // a corner, not a run
    for (let step = 1; step <= AUXILIARY_ZONE_TILES; step++) {
      const jx = x + dx * step;
      const jz = z + dz * step;
      if (!world.hasRoad(jx, jz)) break;
      const degree = roadDegree(jx, jz, world);
      if (degree >= 3) {
        const ramp = rampArmAt(jx, jz, toward, world);
        // A slip road that never recorded a direction cannot say whether it is
        // joined or left by, and an auxiliary lane is one or the other.
        if (!ramp || ramp.flow === RoadFlow.None) return undefined;
        const { leftSign } = approachAxis(toward);
        const side = (ramp.onTheLeft ? leftSign : -leftSign) as -1 | 1;
        // Both lanes stand on the slip road's own side of the road, which is
        // also the kerb of the direction it serves. So whether this tile is on
        // the near side of the junction or the far side follows from whether
        // the way it is walking IS that direction: walking toward the junction
        // its driver's kerb is -leftSign.
        const servesThisWay = side === -leftSign;
        // The slip road is LEFT by when its own direction points away from the
        // junction, and joined from when it points into it.
        const leaving = ramp.flow === ramp.arm;
        // A lane to slow down in runs up to the turn-off; a lane to speed up in
        // runs on beyond the join. Anything else is the other direction's.
        if (leaving !== servesThisWay) return undefined;
        return {
          side,
          openness: Math.min(1, (AUXILIARY_ZONE_TILES - (step - 1)) / AUXILIARY_ZONE_TILES),
          merging: !leaving,
        };
      }
      if (degree !== 2 || !world.hasRoad(jx + dx, jz + dz)) break;
    }
  }
  return undefined;
}

/**
 * The slip road arm of a junction, seen by traffic heading `toward` it: which
 * side of the road it leaves on, which cardinal it lies in, and which way it
 * runs. Undefined where no arm of the junction is one.
 */
function rampArmAt(
  jx: number,
  jz: number,
  toward: RoadFlow,
  world: ApproachSurroundings,
): { onTheLeft: boolean; arm: RoadFlow; flow: RoadFlow } | undefined {
  const { leftSign, vertical } = approachAxis(toward);
  for (const [dx, dz, arm] of STEPS) {
    if (arm === toward || arm === oppositeFlow(toward)) continue;
    const profile = world.profileAt(jx + dx, jz + dz);
    if (!profile || profile.class !== 'ramp') continue;
    // The arm lies on the driver's left when its own cross-offset shares the
    // sign of that side.
    const across = vertical ? dx : dz;
    return {
      onTheLeft: across * leftSign > 0,
      arm,
      flow: world.flowAt(jx + dx, jz + dz),
    };
  }
  return undefined;
}
