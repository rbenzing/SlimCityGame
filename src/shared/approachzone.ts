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
import { armAllowed, movementsOffered, pocketWarranted } from './approach';
import type { MovementSet, PackedLaneTurns, PackedTurns } from './approach';
import {
  isOneWayProfile,
  reversedInWorld,
  roadRank,
  withAuxiliaryLane,
  withCentreTurn,
  withTurnPocket,
} from './roadprofile';
import { controlHoldsArm, isRampNode } from './junction';
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
import { corridorPartners, rampJoinAround, rampJoins, sideBySideCarriageways } from './corridor';
import type { RampJoin } from './corridor';

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

/**
 * How long a block between two junctions may be and still be carried as one
 * stretch. Beyond this there is a real length of ordinary road in the middle,
 * worth returning to its own width for; inside it the road would widen,
 * narrow and widen again over a couple of hundred metres.
 */
export const SHARED_TURN_LANE_MAX_TILES = 8;

/**
 * Whether a tile is inside a SHORT BLOCK — a straight run with a junction at
 * each end, close enough together that the turn bays they each want would
 * leave no road between them worth the name.
 *
 * It is a question about the RUN rather than about an approach, which is why
 * it is asked separately: the tile halfway along belongs to neither junction
 * more than the other, and `approachAhead` rightly declines to say which one
 * it approaches. It still has to be the same road as its neighbours.
 */
export function sharedTurnLaneAt(x: number, z: number, world: ApproachSurroundings): boolean {
  if (!world.hasRoad(x, z) || roadDegree(x, z, world) !== 2) return false;
  /** Tiles short of the junction that way, or null where that way has none. */
  const reach = (dx: number, dz: number): number | null => {
    if (!world.hasRoad(x + dx, z + dz)) return null;
    if (isSeparateRoad(x, z, dx, dz, world)) return null;
    for (let step = 1; step <= SHARED_TURN_LANE_MAX_TILES; step++) {
      const tx = x + dx * step;
      const tz = z + dz * step;
      if (!world.hasRoad(tx, tz)) return null;
      const degree = roadDegree(tx, tz, world);
      if (degree >= 3) return step - 1;
      // Anything that is not a straight continuation ends the run.
      if (degree !== 2 || !world.hasRoad(tx + dx, tz + dz)) return null;
    }
    return null;
  };
  for (const [dx, dz] of STEPS) {
    const ahead = reach(dx, dz);
    if (ahead === null) continue;
    const behind = reach(-dx, -dz);
    if (behind === null) continue;
    // Both ends counted from this tile, plus the tile itself.
    if (ahead + behind + 1 <= SHARED_TURN_LANE_MAX_TILES) return true;
  }
  return false;
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
 * A road that lies alongside without joining does not count — the other half
 * of a corridor, or a second motorway carriageway. Either touches along the
 * whole run, so counting it would make every tile a junction — and, because an
 * approach has to be a straight run, would leave no tile able to find the
 * junction it really arrives at.
 */
export function roadDegree(x: number, z: number, world: ApproachSurroundings): number {
  let n = 0;
  for (const [dx, dz] of STEPS) {
    if (!world.hasRoad(x + dx, z + dz)) continue;
    if (isSeparateRoad(x, z, dx, dz, world)) continue;
    n++;
  }
  return n;
}

/**
 * Whether the neighbour at (dx, dz) is a road of its own rather than an arm of
 * this one: this tile's other corridor half, or a motorway carriageway lying
 * alongside.
 */
function isSeparateRoad(
  x: number,
  z: number,
  dx: number,
  dz: number,
  world: ApproachSurroundings,
): boolean {
  const here = world.profileAt(x, z);
  const there = world.profileAt(x + dx, z + dz);
  return (
    corridorPartners(
      world.corridorHalfAt(x, z),
      world.corridorHalfAt(x + dx, z + dz),
      world.profileIdAt(x, z),
      world.profileIdAt(x + dx, z + dz),
      world.flowAt(x, z),
      dx,
      dz,
    ) ||
    sideBySideCarriageways(
      here?.class === 'highway',
      there?.class === 'highway',
      world.flowAt(x, z),
      world.flowAt(x + dx, z + dz),
      dx,
      dz,
    ) ||
    (here?.class === 'ramp' &&
      there?.class === 'highway' &&
      !rampJoins(rampJoinWith(x, z, x + dx, z + dz, world))) ||
    (here?.class === 'highway' &&
      there?.class === 'ramp' &&
      !rampJoins(rampJoinWith(x + dx, z + dz, x, z, world)))
  );
}

/** How the ramp tile at (rx, rz) meets the motorway tile at (hx, hz). */
function rampJoinWith(
  rx: number,
  rz: number,
  hx: number,
  hz: number,
  world: ApproachSurroundings,
): RampJoin {
  return rampJoinAround(
    (x, z) => world.profileAt(x, z)?.class === 'ramp',
    (x, z) => world.flowAt(x, z),
    rx,
    rz,
    hx,
    hz,
  );
}

/**
 * Whether a tile is a motorway a ramp joins or leaves — a merge or a diverge,
 * which is a straight carriageway with a slip road beside it and not a junction
 * anything approaches. See {@link isRampNode}.
 */
export function isRampNodeAt(x: number, z: number, world: ApproachSurroundings): boolean {
  const arm = (dx: number, dz: number): RoadClassId | null => {
    if (!world.hasRoad(x + dx, z + dz) || isSeparateRoad(x, z, dx, dz, world)) return null;
    return world.profileAt(x + dx, z + dz)?.class ?? null;
  };
  return isRampNode(world.profileAt(x, z)?.class, [arm(0, -1), arm(1, 0), arm(0, 1), arm(-1, 0)]);
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
    if (isSeparateRoad(x, z, dx, dz, world)) continue;
    if (!world.hasRoad(x - dx, z - dz)) continue; // a corner, not a run
    for (let step = 1; step <= reach; step++) {
      const tx = x + dx * step;
      const tz = z + dz * step;
      if (!world.hasRoad(tx, tz)) break;
      // A merge or a diverge is not a junction to arrive at: the motorway runs
      // straight through it, and a ramp reaching it ends there.
      const degree = isRampNodeAt(tx, tz, world) ? 2 : roadDegree(tx, tz, world);
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
  const mine = world.profileAt(x, z);
  // Whether the junction holds THIS arm. A minor-road stop holds the side
  // street and lets the road through, and a road nobody stops has no queue to
  // store a turn out of.
  const armRanks: number[] = [];
  // The legs there is anywhere to turn onto. A ONE-WAY leg running at the
  // junction is a road a driver cannot take, so it offers no turn either —
  // where a two-way road records the direction it was drawn in and can be
  // taken either way regardless.
  const legs: RoadFlow[] = [];
  for (const [dx, dz, heading] of STEPS) {
    const leg = world.profileAt(best.jx + dx, best.jz + dz);
    if (!leg) continue;
    armRanks.push(roadRank(leg));
    const against =
      isOneWayProfile(leg) && world.flowAt(best.jx + dx, best.jz + dz) === oppositeFlow(heading);
    if (!against) legs.push(heading);
  }
  // What the player has restricted, narrowed to what the junction has to
  // offer: an arrow and a turn bay are both claims about somewhere to go.
  const allowed =
    armAllowed(world.turnsAt(best.jx, best.jz), arm) & movementsOffered(best.toward, legs);
  const pocket =
    best.distance < zone &&
    pocketWarranted(
      world.controlAt(best.jx, best.jz),
      allowed,
      controlHoldsArm(
        world.controlAt(best.jx, best.jz),
        mine ? roadRank(mine) : 0,
        armRanks,
      ),
      // A service access stores nothing: an alley is one lane to the back of a
      // building, and a bay would double its width for a one-van queue.
      mine ? mine.class : "local",
    );
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
  /** Whether the tile is in a short block, and carries a shared turn lane. */
  sharedTurn = false,
): RoadProfile {
  // A shared lane down the middle answers both junctions at once, so it takes
  // precedence over the one-sided bay either of them would otherwise ask for.
  if (sharedTurn) {
    const shared = withCentreTurn(profile);
    if (shared) return shared;
  }
  if (!approach?.pocket) return profile;
  if (isOneWayProfile(profile) && flow !== RoadFlow.None && flow !== approach.toward) {
    return profile;
  }
  const { leftSign } = approachAxis(approach.toward);
  return (
    withTurnPocket(profile, -leftSign as 1 | -1, approach.openness, leftSign as 1 | -1) ?? profile
  );
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
  sharedTurn?: boolean,
): RoadProfile {
  const base = withAuxiliary(profile, auxiliary);
  if (narrowing) return pavedCrossSection(base, closedAt(narrowing), reversedInWorld(flow));
  return pocketedCrossSection(base, approach, flow, sharedTurn);
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
  sharedTurn?: boolean,
): RoadProfile {
  const base = withAuxiliary(profile, auxiliary);
  if (narrowing) return taperedCrossSection(base, closedAt(narrowing), reversedInWorld(flow));
  return pocketedCrossSection(base, approach, flow, sharedTurn);
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
    if (isSeparateRoad(x, z, dx, dz, world)) continue;
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
  if (!mine) return undefined;
  // The tile the slip road meets carries the lane at full width too: the lane
  // runs across the join rather than stopping short of it and starting again.
  if (isRampNodeAt(x, z, world)) return auxiliaryLaneOnNode(x, z, world);
  if (roadDegree(x, z, world) !== 2) return undefined;

  for (const [dx, dz, toward] of STEPS) {
    if (!world.hasRoad(x + dx, z + dz)) continue;
    // Never walk sideways into your own other half: along that way lies the
    // length of the road, not anything the road arrives at.
    if (isSeparateRoad(x, z, dx, dz, world)) continue;
    if (!world.hasRoad(x - dx, z - dz)) continue; // a corner, not a run
    for (let step = 1; step <= AUXILIARY_ZONE_TILES; step++) {
      const jx = x + dx * step;
      const jz = z + dz * step;
      if (!world.hasRoad(jx, jz)) break;
      const degree = roadDegree(jx, jz, world);
      if (degree >= 3) {
        const ramp = rampArmAt(jx, jz, toward, world);
        // A slip road that cannot say whether it is joined or left by gets no
        // lane, since an auxiliary lane is one or the other.
        if (!ramp || ramp.leaving === undefined) return undefined;
        const { leftSign } = approachAxis(toward);
        const side = (ramp.onTheLeft ? leftSign : -leftSign) as -1 | 1;
        // Both lanes stand on the slip road's own side of the road, which is
        // also the kerb of the direction it serves. So whether this tile is on
        // the near side of the junction or the far side follows from whether
        // the way it is walking IS that direction: walking toward the junction
        // its driver's kerb is -leftSign.
        const servesThisWay = side === -leftSign;
        const leaving = ramp.leaving;
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
 * Where a ramp running alongside meets the motorway tile it joins: which side
 * of the tile it lies on, and which half of the tile, along the run, it joins
 * over.
 */
export interface RampMouth {
  /** The way from the motorway tile to the ramp. */
  arm: RoadFlow;
  /** The way along the run to the half the ramp joins over. */
  opens: RoadFlow;
}

/**
 * The mouth of a ramp that joins this motorway tile from alongside, or
 * undefined where no ramp does.
 *
 * A merging ramp narrows into the auxiliary lane over the downstream half of
 * the tile, so that is where the motorway's edge line lets it in; a diverging
 * ramp peels away over the upstream half. A head-on ramp a save still holds
 * has no such half and keeps the mouth centred on the tile.
 */
export function rampMouthAt(x: number, z: number, world: ApproachSurroundings): RampMouth | undefined {
  if (!isRampNodeAt(x, z, world)) return undefined;
  const run = world.flowAt(x, z);
  if (run === RoadFlow.None) return undefined;
  for (const [dx, dz, arm] of STEPS) {
    if (arm === run || arm === oppositeFlow(run)) continue;
    if (world.profileAt(x + dx, z + dz)?.class !== 'ramp') continue;
    if (isSeparateRoad(x, z, dx, dz, world)) continue;
    const join = rampJoinWith(x + dx, z + dz, x, z, world);
    if (join === 'merge') return { arm, opens: run };
    if (join === 'diverge') return { arm, opens: oppositeFlow(run) };
  }
  return undefined;
}

/**
 * The auxiliary lane on the motorway tile a slip road meets, or undefined
 * where the slip road or the motorway never recorded which way it runs.
 *
 * It is the lane at its widest: on the slip road's side, open in full, and
 * joined or left by as the slip road's own direction says. Read in the frame
 * of the motorway's traffic — the frame the walk on either side of it reads
 * from when it arrives here — so the lane meets itself at both seams.
 */
function auxiliaryLaneOnNode(
  x: number,
  z: number,
  world: ApproachSurroundings,
): AuxiliaryLane | undefined {
  const run = world.flowAt(x, z);
  if (run === RoadFlow.None) return undefined;
  const ramp = rampArmAt(x, z, run, world);
  if (!ramp || ramp.leaving === undefined) return undefined;
  const { leftSign } = approachAxis(run);
  return {
    side: (ramp.onTheLeft ? leftSign : -leftSign) as -1 | 1,
    openness: 1,
    merging: !ramp.leaving,
  };
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
): { onTheLeft: boolean; arm: RoadFlow; leaving: boolean | undefined } | undefined {
  const { leftSign, vertical } = approachAxis(toward);
  for (const [dx, dz, arm] of STEPS) {
    if (arm === toward || arm === oppositeFlow(toward)) continue;
    const profile = world.profileAt(jx + dx, jz + dz);
    if (!profile || profile.class !== 'ramp') continue;
    // A ramp running alongside without joining here is not this node's arm.
    if (isSeparateRoad(jx, jz, dx, dz, world)) continue;
    // The arm lies on the driver's left when its own cross-offset shares the
    // sign of that side.
    const across = vertical ? dx : dz;
    return {
      onTheLeft: across * leftSign > 0,
      arm,
      leaving: rampLeaves(rampJoinWith(jx + dx, jz + dz, jx, jz, world), world.flowAt(jx + dx, jz + dz), arm),
    };
  }
  return undefined;
}

/**
 * Whether a ramp arm is LEFT by, rather than joined from, or undefined where
 * that cannot be said. A ramp alongside says it by where it joins: at its start
 * it is an exit, at its end an entry. A head-on ramp a save still holds says it
 * by pointing away from the motorway or into it.
 */
function rampLeaves(join: RampJoin, flow: RoadFlow, arm: RoadFlow): boolean | undefined {
  if (join === 'diverge') return true;
  if (join === 'merge') return false;
  // Head-on — or beside a motorway old enough to have no direction of its own:
  // the ramp's own direction still says it, pointing out along the arm or in.
  if (join === 'headOn' || join === 'unknown') {
    if (flow === arm) return true;
    if (flow === oppositeFlow(arm)) return false;
  }
  return undefined;
}
