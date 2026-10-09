/**
 * The kerb stalls a street paints, worked out from the roads alone: the block
 * face each kerb belongs to, how far each junction keeps it clear, and the
 * stalls laid along it. The road mesh paints and parks cars from this, and the
 * sim counts the stalls along a lot's frontage from it; each reads the roads
 * through its own `KerbSurroundings`, so both see the same stalls.
 */
import { MAP_SIZE, TILE_METERS, tileIndex } from './constants';
import { approachZoneTiles } from './approach';
import {
  approachAhead,
  approachAxis,
  auxiliaryLaneAt,
  drawnCrossSection,
  isJunctionTile,
  narrowingAhead,
  paintedCrossSection,
  sharedTurnLaneAt,
} from './approachzone';
import type { ApproachAhead, ApproachSurroundings } from './approachzone';
import { junctionArmPaint, noParkingReach, type ArmSide } from './junctionpaint';
import {
  downstreamBeside,
  kerbOrientation,
  layKerbFace,
  parkingTickPositions,
  type KerbFace,
  type KerbStall,
  type ParkingSetbacks,
} from './kerbstalls';
import { axisOfFlow } from './overpass';
import { kerbSideFacing, type Side } from './roadedge';
import {
  carriagewayHalfWidthOf,
  corridorHalfProfile,
  hasFootway,
  kerbWidthOf,
  PARKING_STYLES,
  parkingStyleOn,
  presetProfileForTier,
  worldOrderedProfile,
} from './roadprofile';
import { approachingLanes, carriagewaySpans, travelLaneSpans } from './travellanes';
import { corridorHalfOf, flowDirection, RoadFlow, RoadTier } from './types';
import type { ParkingStyle, RoadProfile, RoadTileDelta, TilePoint } from './types';

const TILE_HALF = TILE_METERS / 2;
const NORTH = 1;
const EAST = 2;
const SOUTH = 4;
const WEST = 8;

/** Whether a mask's arms all lie on one axis. */
export function isCollinearMask(mask: number): boolean {
  const hasVertical = (mask & (NORTH | SOUTH)) !== 0;
  const hasHorizontal = (mask & (EAST | WEST)) !== 0;
  return !(hasVertical && hasHorizontal);
}

/** A connected, straight, non-junction tile: one or two collinear arms. */
export function isStraightRunMask(mask: number): boolean {
  const popcount =
    (mask & NORTH ? 1 : 0) + (mask & EAST ? 1 : 0) + (mask & SOUTH ? 1 : 0) + (mask & WEST ? 1 : 0);
  return popcount >= 1 && popcount <= 2 && isCollinearMask(mask);
}

/** The road tiles as a thread holds them, and the cross-sections their ids name. */
export interface RoadTiles {
  /** The road on the ground at the tile, as the render thread is told it; undefined off-road. */
  roadAt(x: number, z: number): RoadTileDelta | undefined;
  /** The cross-section behind a profile id, or null where the id names none. */
  profileById(id: number): RoadProfile | null;
}

/** Who gives way at each junction, and the turns its arms and lanes may make. */
export type JunctionReader = Pick<ApproachSurroundings, 'controlAt' | 'turnsAt' | 'laneTurnsAt'>;

/** Everything the kerb stall layout reads about the roads around a tile. */
export type KerbSurroundings = ApproachSurroundings & RoadTiles;

/**
 * The cross-section a tile draws for ITSELF. A corridor is two carriageways
 * of one road laid side by side, so each of its tiles carries only its own
 * half of the road's section — the whole one would be drawn twice, once on
 * each tile, at twice the width the road has.
 */
export function ownSection(tile: Pick<RoadTileDelta, 'flow'>, whole: RoadProfile): RoadProfile {
  return corridorHalfProfile(worldOrderedProfile(whole, tile.flow), corridorHalfOf(tile.flow));
}

/** The road passing over a crossing tile, as a tile of its own; null where none does. */
export function overTileOf(tile: RoadTileDelta): RoadTileDelta | null {
  const over = tile.over;
  if (!over) return null;
  return {
    x: tile.x,
    z: tile.z,
    tier: over.tier,
    mask: over.mask,
    elevation: over.elevation,
    profile: over.profile,
    flow: over.flow,
  };
}

/** The cross-section of a road passing over a crossing, laid in world order. */
export function overSection(over: RoadTileDelta, roads: RoadTiles): RoadProfile {
  const whole = roads.profileById(over.profile);
  return whole
    ? ownSection(over, whole)
    : worldOrderedProfile(presetProfileForTier(over.tier), over.flow);
}

/**
 * The road network as the approach-zone walk and the kerb stall layout ask
 * about it, read off the road tiles and the junctions. Both threads build
 * theirs here, so a road reads the same to each.
 */
export function roadSurroundings(roads: RoadTiles, junctions: JunctionReader): KerbSurroundings {
  return {
    roadAt: (x, z) => roads.roadAt(x, z),
    profileById: (id) => roads.profileById(id),
    hasRoad: (x, z) => (roads.roadAt(x, z)?.tier ?? RoadTier.None) !== RoadTier.None,
    controlAt: (x, z) => junctions.controlAt(x, z),
    turnsAt: (x, z) => junctions.turnsAt(x, z),
    laneTurnsAt: (x, z, arm) => junctions.laneTurnsAt(x, z, arm),
    profileAt: (x, z) => {
      const tile = roads.roadAt(x, z);
      if (!tile) return null;
      return ownSection(tile, roads.profileById(tile.profile) ?? presetProfileForTier(tile.tier));
    },
    flowAt: (x, z) => flowDirection(roads.roadAt(x, z)?.flow ?? RoadFlow.None),
    corridorHalfAt: (x, z) => corridorHalfOf(roads.roadAt(x, z)?.flow ?? 0),
    profileIdAt: (x, z) => roads.roadAt(x, z)?.profile ?? 0,
    overAxisAt: (x, z) => {
      const over = roads.roadAt(x, z)?.over;
      return over ? axisOfFlow(over.flow) : null;
    },
    apartAt: (x, z) => roads.roadAt(x, z)?.apart ?? 0,
  };
}

/**
 * The junction this tile approaches and how close it is to it, or undefined
 * when it approaches none. How far back the zone reaches is the road's own
 * class's, since that is what decides how long a queue it has to store.
 */
export function approachTowardAt(
  x: number,
  z: number,
  s: ApproachSurroundings,
): ApproachAhead | undefined {
  const profile = s.profileAt(x, z);
  if (!profile) return undefined;
  return approachAhead(x, z, approachZoneTiles(profile.class), s);
}

/** The cross-section the tile at (x, z) lays its pavement to, or null off-road. */
export function drawnSectionAt(x: number, z: number, s: ApproachSurroundings): RoadProfile | null {
  const profile = s.profileAt(x, z);
  if (!profile) return null;
  return drawnCrossSection(
    profile,
    approachTowardAt(x, z, s),
    narrowingAhead(x, z, s),
    s.flowAt(x, z),
    auxiliaryLaneAt(x, z, s),
    sharedTurnLaneAt(x, z, s),
  );
}

/**
 * The cross-section the tile at (x, z) paints, or null off-road. Down a
 * motorway's taper the tarmac and the paint part company, so this is not
 * always the section it lays.
 */
export function paintedSectionAt(
  x: number,
  z: number,
  s: ApproachSurroundings,
): RoadProfile | null {
  const profile = s.profileAt(x, z);
  if (!profile) return null;
  return paintedCrossSection(
    profile,
    approachTowardAt(x, z, s),
    narrowingAhead(x, z, s),
    s.flowAt(x, z),
    auxiliaryLaneAt(x, z, s),
    sharedTurnLaneAt(x, z, s),
  );
}

/** The carriageway half-width the tile at (x, z) lays, 0 off-road. */
export function halfAt(x: number, z: number, s: ApproachSurroundings): number {
  const section = drawnSectionAt(x, z, s);
  return section ? carriagewayHalfWidthOf(section) : 0;
}

/**
 * The road passing over tile (x, z) where it runs along `axis`, or null. An
 * approach looking along its line at a crossing sees the road it climbs onto.
 */
export function overAlong(
  x: number,
  z: number,
  axis: 'x' | 'z',
  s: RoadTiles,
): RoadTileDelta | null {
  const tile = s.roadAt(x, z);
  const over = tile ? overTileOf(tile) : null;
  return over && axisOfFlow(over.flow) === axis ? over : null;
}

/**
 * The road met by running along `axis` onto tile (x, z): the road passing
 * over it where that one runs this way, else the tile's own road.
 */
export function roadAlong(
  x: number,
  z: number,
  axis: 'x' | 'z',
  s: RoadTiles,
): RoadTileDelta | undefined {
  return overAlong(x, z, axis, s) ?? s.roadAt(x, z);
}

/** The tier of the road met along `axis` at (x, z), None off-road. */
export function tierAlong(x: number, z: number, axis: 'x' | 'z', s: RoadTiles): RoadTier {
  return roadAlong(x, z, axis, s)?.tier ?? RoadTier.None;
}

/**
 * Whether the road met along `axis` at (x, z) is a junction an arriving road
 * meets, rather than more of that road. A road passing over a crossing is
 * never one: nothing joins it there.
 */
export function junctionAlong(x: number, z: number, axis: 'x' | 'z', s: KerbSurroundings): boolean {
  if (!s.roadAt(x, z) || overAlong(x, z, axis, s)) return false;
  return isJunctionTile(x, z, s);
}

/** Whether the road met along `axis` at (x, z) is one a pedestrian can walk beside. */
export function walkableAlong(x: number, z: number, axis: 'x' | 'z', s: KerbSurroundings): boolean {
  const over = overAlong(x, z, axis, s);
  if (over) return hasFootway(overSection(over, s));
  const profile = s.profileAt(x, z);
  return profile !== null && hasFootway(profile);
}

/** One end of a straight tile at a junction: the zone kept on its two kerbs, and whether a crossing is painted across it. */
export interface JunctionEnd {
  zone: readonly [number, number];
  crossed: boolean;
}

/** The junctions directly at the two ends of a straight tile, null at an end that meets none. */
export interface JunctionEnds {
  alongX: boolean;
  lo: JunctionEnd | null;
  hi: JunctionEnd | null;
}

/**
 * The junctions directly at either end of the straight tile at (x, z): the
 * no-parking zone each keeps on this tile's two kerbs, and whether a
 * crossing is painted across this tile's arm of it. Null at an end that
 * meets no junction, and altogether where the tile is not a straight run.
 */
export function junctionEndsAt(x: number, z: number, s: KerbSurroundings): JunctionEnds | null {
  const tile = s.roadAt(x, z);
  const own = s.profileAt(x, z);
  const drawn = drawnSectionAt(x, z, s);
  if (!tile || !own || !drawn) return null;
  const ew = (tile.mask & (EAST | WEST)) !== 0;
  const ns = (tile.mask & (NORTH | SOUTH)) !== 0;
  if (ew === ns) return null;
  const alongX = ew;
  const flow = s.flowAt(x, z);
  const lanes = travelLaneSpans(drawn);
  const end = (dx: number, dz: number): JunctionEnd | null => {
    const jx = x + dx;
    const jz = z + dz;
    const bit = dz < 0 ? NORTH : dx > 0 ? EAST : dz > 0 ? SOUTH : WEST;
    if ((tile.mask & bit) === 0 || !junctionAlong(jx, jz, alongX ? 'x' : 'z', s)) return null;
    const junction = s.roadAt(jx, jz)!;
    const section = drawnSectionAt(jx, jz, s)!;
    const toward =
      dz < 0 ? RoadFlow.North : dx > 0 ? RoadFlow.East : dz > 0 ? RoadFlow.South : RoadFlow.West;
    // This tile is the junction's arm on the side facing back toward it.
    const side: ArmSide = dz < 0 ? 's' : dx > 0 ? 'w' : dz > 0 ? 'n' : 'e';
    const paint = junctionArmPaint(
      {
        tier: junction.tier,
        has: {
          n: (junction.mask & NORTH) !== 0,
          e: (junction.mask & EAST) !== 0,
          s: (junction.mask & SOUTH) !== 0,
          w: (junction.mask & WEST) !== 0,
        },
        roads: {
          n: tierAlong(jx, jz - 1, 'z', s),
          e: tierAlong(jx + 1, jz, 'x', s),
          s: tierAlong(jx, jz + 1, 'z', s),
          w: tierAlong(jx - 1, jz, 'x', s),
        },
        footways: {
          n: walkableAlong(jx, jz - 1, 'z', s),
          e: walkableAlong(jx + 1, jz, 'x', s),
          s: walkableAlong(jx, jz + 1, 'z', s),
          w: walkableAlong(jx - 1, jz, 'x', s),
        },
        ownFootway: hasFootway(section),
        control: s.controlAt(jx, jz),
      },
      side,
    );
    const armDepth = Math.max(0, TILE_HALF - carriagewayHalfWidthOf(section));
    const footwayWidth = Math.min(kerbWidthOf(section), armDepth);
    // A stop line crosses only the lanes arriving, so it is only the kerb
    // beside an arriving lane that is kept clear for it.
    const arriving = approachingLanes(
      drawn,
      own,
      flow === RoadFlow.None || flow === toward,
      approachAxis(toward).leftSign,
    );
    const kerbLaneArrives = (k: 0 | 1): boolean => {
      const lane = k === 0 ? lanes[0] : lanes[lanes.length - 1];
      return lane !== undefined && arriving.some((a) => Math.abs(a.centre - lane.centre) < 1e-6);
    };
    const reach = (k: 0 | 1): number =>
      noParkingReach({
        armDepth,
        footwayWidth,
        crossed: paint.crossed,
        stopLine: paint.stops && kerbLaneArrives(k),
      });
    return { zone: [reach(0), reach(1)] as const, crossed: paint.crossed };
  };
  return alongX
    ? { alongX, lo: end(-1, 0), hi: end(1, 0) }
    : { alongX, lo: end(0, -1), hi: end(0, 1) };
}

/** The no-parking zones of the junctions directly at either end of the tile at (x, z). */
function junctionZonesAt(x: number, z: number, s: KerbSurroundings): ParkingSetbacks | null {
  const ends = junctionEndsAt(x, z, s);
  return ends && { alongX: ends.alongX, lo: ends.lo?.zone ?? null, hi: ends.hi?.zone ?? null };
}

/**
 * The no-parking zones at the two ends of the road tile at (x, z): how far
 * back from a junction at either end its kerbs are kept clear, for the
 * parking on each side of the road. Null where the tile is not a straight
 * run — a junction, a corner or a lone tile has no kerb to park at. The
 * zone is measured from what the junction actually paints on the arm this
 * tile is, by the same function its paint is decided by, so the stall marks
 * and the parked cars keep out of exactly what is there.
 *
 * A junction one tile further on counts too, at its distance below this
 * tile's end: the stall beside its end stall may reach onto this tile, and
 * both tiles have to lay that stall in the same place.
 */
export function parkingSetbacksAt(
  x: number,
  z: number,
  s: KerbSurroundings,
): ParkingSetbacks | null {
  const here = junctionZonesAt(x, z, s);
  const tile = s.roadAt(x, z);
  if (!here || !tile) return here;
  const further = (dx: number, dz: number): readonly [number, number] | null => {
    const bit = dz < 0 ? NORTH : dx > 0 ? EAST : dz > 0 ? SOUTH : WEST;
    if ((tile.mask & bit) === 0) return null;
    const next = junctionZonesAt(x + dx, z + dz, s);
    if (!next || next.alongX !== here.alongX) return null;
    const zone = dx + dz < 0 ? next.lo : next.hi;
    return zone && [zone[0] - TILE_METERS, zone[1] - TILE_METERS];
  };
  return here.alongX
    ? { alongX: true, lo: here.lo ?? further(-1, 0), hi: here.hi ?? further(1, 0) }
    : { alongX: false, lo: here.lo ?? further(0, -1), hi: here.hi ?? further(0, 1) };
}

/**
 * The parking lane a straight tile paints on one side, as signed offsets
 * across the road, or null where that side paints none.
 */
function parkingBandOn(
  x: number,
  z: number,
  side: 'low' | 'high',
  s: KerbSurroundings,
): { from: number; to: number } | null {
  const tile = s.roadAt(x, z);
  if (!tile || !isStraightRunMask(tile.mask)) return null;
  const painted = paintedSectionAt(x, z, s);
  if (!painted) return null;
  const sign = side === 'low' ? -1 : 1;
  return (
    carriagewaySpans(painted).find(
      (b) => b.piece.kind === 'parking' && (b.from + b.to) * sign > 0,
    ) ?? null
  );
}

/**
 * The world positions, along the road, of the stall ticks the tile at
 * (x, z) paints across its parking lane on one side, or null where that
 * side paints no parking lane.
 */
export function parkingTicksAt(
  x: number,
  z: number,
  side: 'low' | 'high',
  s: KerbSurroundings,
): number[] | null {
  if (!parkingBandOn(x, z, side, s)) return null;
  const tile = s.roadAt(x, z)!;
  const alongX = (tile.mask & (EAST | WEST)) !== 0;
  const core = halfAt(x, z, s);
  const lo = (tile.mask & (alongX ? WEST : NORTH)) !== 0 ? -TILE_HALF : -core;
  const hi = (tile.mask & (alongX ? EAST : SOUTH)) !== 0 ? TILE_HALF : core;
  const origin = ((alongX ? x : z) + 0.5) * TILE_METERS;
  const setbacks = parkingSetbacksAt(x, z, s);
  const k = side === 'low' ? 0 : 1;
  return parkingTickPositions(
    origin,
    lo,
    hi,
    setbacks?.lo?.[k] ?? null,
    setbacks?.hi?.[k] ?? null,
  ).map((a) => origin + a);
}

/** The style of the parking lane a straight tile paints on one side, or null where it paints none. */
export function parkingStyleAt(
  x: number,
  z: number,
  side: 'low' | 'high',
  s: KerbSurroundings,
): ParkingStyle | null {
  if (!parkingBandOn(x, z, side, s)) return null;
  return parkingStyleOn(drawnSectionAt(x, z, s)!, side);
}

/** A block face and the road tiles it runs along, low end first. */
export interface BlockFace {
  face: KerbFace;
  tiles: TilePoint[];
}

/**
 * The block face the parking lane on one side of the tile at (x, z)
 * belongs to — that kerb's parking along the straight run, as far as the
 * tiles either way paint the same style of lane on it — laid by
 * `layKerbFace`, or null where that side paints no parking lane. Every tile
 * of a face shares it.
 */
export function blockFaceAt(
  x: number,
  z: number,
  side: 'low' | 'high',
  s: KerbSurroundings,
): BlockFace | null {
  if (x < 0 || z < 0 || x >= MAP_SIZE || z >= MAP_SIZE) return null;
  const style = parkingStyleAt(x, z, side, s);
  const tile = s.roadAt(x, z);
  if (!style || !tile) return null;
  const alongX = (tile.mask & (EAST | WEST)) !== 0;
  const [dx, dz] = alongX ? [1, 0] : [0, 1];
  const forward = alongX ? EAST : SOUTH;
  const backward = alongX ? WEST : NORTH;
  const inFace = (tx: number, tz: number): boolean => {
    const t = s.roadAt(tx, tz);
    return (
      !!t &&
      ((t.mask & (EAST | WEST)) !== 0) === alongX &&
      parkingStyleAt(tx, tz, side, s) === style
    );
  };
  const tiles: TilePoint[] = [{ x, z }];
  for (let [tx, tz] = [x, z]; ;) {
    if ((s.roadAt(tx, tz)!.mask & backward) === 0 || !inFace(tx - dx, tz - dz)) break;
    tx -= dx;
    tz -= dz;
    tiles.unshift({ x: tx, z: tz });
  }
  for (let [tx, tz] = [x, z]; ;) {
    if ((s.roadAt(tx, tz)!.mask & forward) === 0 || !inFace(tx + dx, tz + dz)) break;
    tx += dx;
    tz += dz;
    tiles.push({ x: tx, z: tz });
  }
  const { x: fx, z: fz } = tiles[0]!;
  const { x: lx, z: lz } = tiles[tiles.length - 1]!;
  const k = side === 'low' ? 0 : 1;
  const centreOf = (tx: number, tz: number): number => ((alongX ? tx : tz) + 0.5) * TILE_METERS;
  /** Where a face tile's own run ends, world, toward the low or the high coordinate. */
  const runEnd = (tx: number, tz: number, toward: 1 | -1): number => {
    const bit = toward > 0 ? forward : backward;
    const reach = (s.roadAt(tx, tz)!.mask & bit) !== 0 ? TILE_HALF : halfAt(tx, tz, s);
    return centreOf(tx, tz) + toward * reach;
  };
  const firstSet = parkingSetbacksAt(fx, fz, s)?.lo?.[k] ?? null;
  const lastSet = parkingSetbacksAt(lx, lz, s)?.hi?.[k] ?? null;
  const lowEnd = junctionEndsAt(fx, fz, s)?.lo ?? null;
  const highEnd = junctionEndsAt(lx, lz, s)?.hi ?? null;
  const ticks =
    style === 'parallel'
      ? tiles.flatMap(({ x: tx, z: tz }) => parkingTicksAt(tx, tz, side, s) ?? [])
      : undefined;
  // A junction end starts where its zone ends; any other end where the
  // lane's own marking does.
  const bound = (toward: 1 | -1): number => {
    const [tx, tz] = toward < 0 ? [fx, fz] : [lx, lz];
    const run = runEnd(tx, tz, toward);
    const set = toward < 0 ? firstSet : lastSet;
    const zone = set === null ? null : centreOf(tx, tz) + toward * (TILE_HALF - set);
    const atJunction = toward < 0 ? lowEnd !== null : highEnd !== null;
    if (ticks && !atJunction) {
      const marked = toward < 0 ? ticks[0] : ticks[ticks.length - 1];
      if (marked !== undefined) return marked;
    }
    if (zone === null) return run;
    return toward < 0 ? Math.max(run, zone) : Math.min(run, zone);
  };
  // The accessible stalls stand nearest a crosswalk, else nearest a
  // junction, else at the low end.
  const accessibleEnd: 'lo' | 'hi' =
    (lowEnd?.crossed ?? false) !== (highEnd?.crossed ?? false)
      ? highEnd?.crossed
        ? 'hi'
        : 'lo'
      : (lowEnd !== null) !== (highEnd !== null) && highEnd !== null
        ? 'hi'
        : 'lo';
  const depth = PARKING_STYLES[style].laneWidth;
  // A lane is its full depth on a tile whose band, and its neighbours' in
  // the face, are that deep: nothing bends it in across the tile.
  const deepTile = new Map<number, boolean>();
  const bandDepth = (tx: number, tz: number): number => {
    const band = parkingBandOn(tx, tz, side, s);
    return band ? Math.abs(band.to - band.from) : 0;
  };
  tiles.forEach(({ x: tx, z: tz }, i) => {
    const full = (j: number): boolean => {
      const t = tiles[j];
      return t === undefined || bandDepth(t.x, t.z) >= depth - 0.01;
    };
    deepTile.set(alongX ? tx : tz, full(i - 1) && full(i) && full(i + 1));
  });
  const fullDepth = (from: number, to: number): boolean => {
    for (let t = Math.floor(from / TILE_METERS); t * TILE_METERS < to - 1e-6; t++) {
      if (!deepTile.get(t)) return false;
    }
    return true;
  };
  const orientation = kerbOrientation(
    style,
    alongX,
    side,
    downstreamBeside(drawnSectionAt(fx, fz, s)!, s.roadAt(fx, fz)!.flow, alongX, side),
  );
  const face = layKerbFace({
    style,
    orientation,
    depth,
    lo: bound(-1),
    hi: bound(1),
    ticks,
    fullDepth,
    accessibleEnd,
  });
  return { face, tiles };
}

/**
 * The stalls of a block face counted on the road tile at (x, z): those whose
 * middle lies in it, so a stall over a seam is one stall, on one tile.
 */
export function stallsOnTile(face: KerbFace, x: number, z: number, alongX: boolean): KerbStall[] {
  const start = (alongX ? x : z) * TILE_METERS;
  return face.stalls.filter((st) => st.centre >= start && st.centre < start + TILE_METERS);
}

/** A run of road tiles beside a lot, and the kerb of it the lot fronts. */
export interface KerbFrontage {
  /** The frontage's first road tile, at its low end. */
  x: number;
  z: number;
  /** Whether the frontage runs along x (east-west) rather than along z. */
  alongX: boolean;
  /** How many road tiles it runs along. */
  tiles: number;
  /** The kerb the lot fronts: the road's low-coordinate side or its high one. */
  side: 'low' | 'high';
}

/** A painted kerb stall, and the style of the lane it is marked in. */
export interface PaintedKerbStall extends KerbStall {
  style: ParkingStyle;
}

/**
 * Every stall the street paints on one kerb along a frontage, low to high:
 * the stalls of each block face whose middles lie on the frontage's tiles,
 * exactly the stalls the road mesh marks there. A tile running the other way
 * across the frontage, or one with no parking lane on that kerb, adds none.
 */
export function paintedKerbStallsAlong(
  s: KerbSurroundings,
  frontage: KerbFrontage,
): PaintedKerbStall[] {
  const faces = new Map<number, KerbFace | null>();
  const out: PaintedKerbStall[] = [];
  for (let i = 0; i < frontage.tiles; i++) {
    const x = frontage.alongX ? frontage.x + i : frontage.x;
    const z = frontage.alongX ? frontage.z : frontage.z + i;
    const tile = s.roadAt(x, z);
    if (!tile || ((tile.mask & (EAST | WEST)) !== 0) !== frontage.alongX) continue;
    let face = faces.get(tileIndex(x, z));
    if (face === undefined) {
      const laid = blockFaceAt(x, z, frontage.side, s);
      face = laid?.face ?? null;
      for (const t of laid?.tiles ?? [{ x, z }]) faces.set(tileIndex(t.x, t.z), face);
    }
    if (!face) continue;
    const { style } = face;
    for (const stall of stallsOnTile(face, x, z, frontage.alongX)) out.push({ ...stall, style });
  }
  return out;
}

/** A lot's tiles: its min corner and its size, as it stands turned. */
export interface LotTiles {
  x: number;
  z: number;
  w: number;
  d: number;
}

/**
 * The kerb credit a lot earns on the edge it fronts: one space for every stall
 * the street paints on the lot's own side whose middle lies along the lot's
 * frontage. Parallel, angled and head-in stalls count one each, accessible
 * ones too, with no cap; the far kerb and the no-parking zones count nothing.
 */
export function kerbCreditFor(s: KerbSurroundings, lot: LotTiles, side: Side): number {
  const alongX = side === 'N' || side === 'S';
  return paintedKerbStallsAlong(s, {
    x: side === 'E' ? lot.x + lot.w : side === 'W' ? lot.x - 1 : lot.x,
    z: side === 'N' ? lot.z - 1 : side === 'S' ? lot.z + lot.d : lot.z,
    alongX,
    tiles: alongX ? lot.w : lot.d,
    side: kerbSideFacing(side),
  }).length;
}
