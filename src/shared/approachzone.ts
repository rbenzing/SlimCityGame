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
import type { MovementSet, PackedTurns } from './approach';
import { isOneWayProfile, withTurnPocket } from './roadprofile';
import {
  closedAt,
  dropWidth,
  laneTaperTiles,
  TAPER_MAX_TILES,
  taperedCrossSection,
  taperTilesFor,
} from './taper';
import type { TaperStep } from './taper';
import type { JunctionControl, RoadClassId, RoadProfile } from './types';
import { RoadFlow } from './types';

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

/** How many roads meet on a tile: three or more of them make it a junction. */
export function roadDegree(x: number, z: number, world: ApproachSurroundings): number {
  let n = 0;
  for (const [dx, dz] of STEPS) if (world.hasRoad(x + dx, z + dz)) n++;
  return n;
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

  const allowed = armAllowed(world.turnsAt(best.jx, best.jz), oppositeFlow(best.toward));
  const pocket =
    best.distance < zone && pocketWarranted(world.controlAt(best.jx, best.jz), allowed);
  const mine = world.profileAt(x, z);
  return {
    toward: best.toward,
    distance: best.distance,
    allowed,
    pocket,
    openness: pocket && mine ? pocketOpenness(mine.class, zone, best.distance) : 1,
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
 * The cross-section a tile draws, all of it: its own profile, the turn pocket
 * it may have gained for the junction ahead, and the lanes it may be closing
 * for the narrower road ahead. A lane that is on its way out has no width to
 * lend a pocket, so a taper takes precedence over one.
 */
export function drawnCrossSection(
  profile: RoadProfile,
  approach: ApproachAhead | undefined,
  narrowing: TaperStep | undefined,
  flow: number,
): RoadProfile {
  if (narrowing) return taperedCrossSection(profile, closedAt(narrowing));
  return pocketedCrossSection(profile, approach, flow);
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
