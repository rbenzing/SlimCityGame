/**
 * Cul-de-sacs: a turning circle on a 2×2 block of tiles laid beyond a dead
 * end, which homes form round.
 *
 * Nothing is stored for one but the cul-de-sac code, on each of its four
 * tiles. Whether a block is one, where its single street meets it, whether one
 * may be laid, and the line a car drives round it are all read off that and the
 * roads, here, for the worker, the graph, the mirror, the mesh and the tool
 * alike.
 *
 * A block is named by its north-west tile, and its tiles come in the order
 * `blockTiles` keeps: north-west, north-east, south-west, south-east. The
 * circle is centred on the corner the four tiles share, so the street, which
 * runs down tile centres, meets it half a tile off its middle.
 *
 * Pure: tiles, readers and metres, no grid and no scene.
 */
import { TILE_METERS } from './constants';
import { CUL_DE_SAC_CODE } from './junction';
import {
  blockIntact,
  blockTiles,
  codedBlockOf,
  EAST,
  inMap,
  NORTH,
  oneLaneEachWay,
  outerNeighbours,
  ringArc,
  ringCentre,
  ringPoint,
  roundaboutLegs,
  runsRound,
  SOUTH,
  WEST,
  type RingReader,
  type RoundaboutGround,
  type RoundaboutLeg,
  type RoundaboutRoad,
} from './roundabout';
import { isOneWayProfile, isTramTrack } from './roadprofile';
import { isStreetTier, RoadTier } from './types';
import type { Command, TilePoint } from './types';

export { CUL_DE_SAC_CODE };

/** The turning circle's radius: 96 ft across, the fire code's turnaround. */
export const CUL_DE_SAC_RADIUS_M = 14.6;
/** How far inside the kerb a car's route runs round the circle. */
export const CUL_DE_SAC_ROUTE_INSET_M = 4;
/** The radius of the line a car follows round the circle. */
export const CUL_DE_SAC_ROUTE_RADIUS_M = CUL_DE_SAC_RADIUS_M - CUL_DE_SAC_ROUTE_INSET_M;
/** A drive keeps this far from the end of a kerb return: 10 ft. */
export const DRIVE_END_CLEARANCE_M = 3.0;

export interface CulDeSacBlock {
  /** The block's north-west tile. */
  x: number;
  z: number;
}

/** A cul-de-sac: its block and the one street that meets it. */
export interface CulDeSac extends CulDeSacBlock {
  /** The corner the street joins, the street's own first tile outside, and the side of the block it meets. */
  leg: RoundaboutLeg;
}

/** Whether a block of four cul-de-sac-coded tiles still stands as a cul-de-sac, and its leg. */
function intactLeg(block: CulDeSacBlock, reader: RingReader): RoundaboutLeg | null {
  if (!blockIntact(block, reader)) return null;
  const legs = roundaboutLegs(block, (x, z) => reader.maskAt(x, z));
  return legs.length === 1 ? legs[0]! : null;
}

/**
 * The cul-de-sac (x, z) is a corner of, or null. Four coded tiles that are
 * not four street tiles on the ground joined round the square with exactly one
 * street leaving them are no cul-de-sac: they read as the plain road they are.
 */
export function culDeSacBlockOf(x: number, z: number, reader: RingReader): CulDeSac | null {
  const block = codedBlockOf(x, z, CUL_DE_SAC_CODE, (tx, tz) => reader.codeAt(tx, tz));
  if (!block) return null;
  const leg = intactLeg(block, reader);
  return leg ? { ...block, leg } : null;
}

/** Every cul-de-sac that any of `coded` — the tiles storing its code — is a corner of, each once, by row and then column. */
export function culDeSacsAmong(coded: Iterable<TilePoint>, reader: RingReader): CulDeSac[] {
  const found = new Map<string, CulDeSac>();
  for (const t of coded) {
    const c = culDeSacBlockOf(t.x, t.z, reader);
    if (c) found.set(`${c.z},${c.x}`, c);
  }
  return [...found.values()].sort((a, b) => a.z - b.z || a.x - b.x);
}

// --- Geometry ---------------------------------------------------------------

/** The circle's centre, world metres: the corner the block's four tiles share. */
export const culDeSacCentre = ringCentre;

/**
 * Where a corner tile's routes meet the circle's route, world metres: on the
 * diagonal from the centre through the tile's own, so a car entering bends onto
 * the circle rather than driving on to a tile centre, which lies at the kerb.
 */
export function culDeSacPoint(block: CulDeSacBlock, t: TilePoint): { x: number; z: number } {
  return ringPoint(block, t, CUL_DE_SAC_ROUTE_RADIUS_M);
}

/**
 * Whether a run of the block's tiles, in order, goes round anticlockwise seen
 * from above, north up: the way right-hand traffic circulates.
 */
export function loopRunsRound(block: CulDeSacBlock, tiles: readonly TilePoint[]): boolean {
  return runsRound(block, tiles[0]!, tiles[1]!);
}

/** The line driven round the circle along a run of the block's corner tiles, in the run's order. */
export function culDeSacArc(
  block: CulDeSacBlock,
  tiles: readonly TilePoint[],
): { x: number; z: number }[] {
  return ringArc(block, tiles, CUL_DE_SAC_ROUTE_RADIUS_M);
}

/** How far round the circle a run of `quarters` quarters is, in tiles, along a car's route. */
export function culDeSacArcTiles(quarters: number): number {
  return (quarters * Math.PI * CUL_DE_SAC_ROUTE_RADIUS_M) / (2 * TILE_METERS);
}

// --- Whether one may be laid --------------------------------------------------

export const CUL_DE_SAC_REFUSALS = {
  notDeadEnd: 'A cul-de-sac goes on the end of a street: point at a dead end',
  offMap: 'A cul-de-sac needs room on the map beyond the end',
  railway: 'A railway cannot end in a cul-de-sac',
  motorway: 'A motorway or slip road cannot end in a cul-de-sac',
  tramway: 'A tramway cannot end in a cul-de-sac',
  oneWay: 'A cul-de-sac needs a street that runs both ways, not a one-way street',
  alley: 'An alley cannot end in a cul-de-sac',
  wide: 'A cul-de-sac goes on a street of one lane each way, not an avenue or wider',
  raised: 'A cul-de-sac goes on the ground, clear of bridges',
  offGrid: 'A road off the grid is in the way',
  road: 'Another road is in the way: a cul-de-sac needs clear ground beyond the end',
  inTheWay: 'A building, water or steep ground is in the way',
  notLaid: 'A cul-de-sac needs all four tiles laid as street',
  notEnd: 'A cul-de-sac must end exactly one street',
  already: 'That is already a cul-de-sac',
} as const;

/** Why a road may not be the street a cul-de-sac ends, or null. */
function streetRefusal(road: RoundaboutRoad): string | null {
  if (road.tier === RoadTier.RailTrack) return CUL_DE_SAC_REFUSALS.railway;
  if (road.tier === RoadTier.Highway || road.tier === RoadTier.Ramp)
    return CUL_DE_SAC_REFUSALS.motorway;
  if (isTramTrack(road.tier, road.profile)) return CUL_DE_SAC_REFUSALS.tramway;
  if (road.tier === RoadTier.Alley) return CUL_DE_SAC_REFUSALS.alley;
  if (road.tier === RoadTier.OneWay) return CUL_DE_SAC_REFUSALS.oneWay;
  if (road.elevation > 0) return CUL_DE_SAC_REFUSALS.raised;
  if (road.corridor) return CUL_DE_SAC_REFUSALS.wide;
  if (isOneWayProfile(road.profile)) return CUL_DE_SAC_REFUSALS.oneWay;
  if (!oneLaneEachWay(road.profile) || !oneLaneBothWays(road)) return CUL_DE_SAC_REFUSALS.wide;
  return null;
}

/** Whether a street's own travel lanes are exactly one each way. */
function oneLaneBothWays(road: RoundaboutRoad): boolean {
  let fwd = 0;
  let back = 0;
  for (const p of road.profile.pieces) {
    if (p.kind !== 'travel' && p.kind !== 'bus') continue;
    const flow = p.flow ?? 'both';
    if (flow !== 'back') fwd++;
    if (flow !== 'fwd') back++;
  }
  return fwd === 1 && back === 1;
}

export interface CulDeSacPlan {
  block: CulDeSacBlock;
  /** The dead end it is laid beyond, or null for a block read in place. */
  end: TilePoint | null;
  /** The four tiles the tool lays, in the block's order; none for a block already laid. */
  toLay: TilePoint[];
  /** Why it may not be laid, or null. */
  refusal: string | null;
}

/** The side the street arrives on, as the step a block leaves its dead end by: away from the one arm. */
function awayFrom(mask: number): { dx: number; dz: number } | null {
  switch (mask) {
    case NORTH:
      return { dx: 0, dz: 1 };
    case SOUTH:
      return { dx: 0, dz: -1 };
    case EAST:
      return { dx: -1, dz: 0 };
    case WEST:
      return { dx: 1, dz: 0 };
    default:
      return null;
  }
}

/**
 * The cul-de-sac the tool would lay beyond the dead end `at`, on the side of
 * the street the pointer is on: `east` and `south` say which side of the
 * tile's centre it is. The block holds the two tiles straight ahead of the end
 * and the two beside those on that side.
 */
export function culDeSacAtEnd(
  at: TilePoint,
  east: boolean,
  south: boolean,
  ground: RoundaboutGround,
): CulDeSacPlan {
  const own = { x: at.x, z: at.z };
  const fail = (refusal: string, block: CulDeSacBlock = own): CulDeSacPlan => ({
    block,
    end: own,
    toLay: [],
    refusal,
  });
  const road = ground.roadAt(at.x, at.z);
  if (!road || ground.overRoadAt(at.x, at.z)) return fail(CUL_DE_SAC_REFUSALS.notDeadEnd);
  if (!isStreetTier(road.tier)) return fail(CUL_DE_SAC_REFUSALS.railway);
  const mask = ground.maskAt(at.x, at.z);
  const step = awayFrom(mask);
  if (!step) return fail(CUL_DE_SAC_REFUSALS.notDeadEnd);
  const refused = streetRefusal(road);
  if (refused) return fail(refused);

  const side = step.dx === 0 ? { dx: east ? 1 : -1, dz: 0 } : { dx: 0, dz: south ? 1 : -1 };
  const tiles = [
    { x: at.x + step.dx, z: at.z + step.dz },
    { x: at.x + 2 * step.dx, z: at.z + 2 * step.dz },
  ];
  tiles.push(...tiles.map((t) => ({ x: t.x + side.dx, z: t.z + side.dz })));
  const block = {
    x: Math.min(...tiles.map((t) => t.x)),
    z: Math.min(...tiles.map((t) => t.z)),
  };
  if (!tiles.every((t) => inMap(t.x, t.z))) return fail(CUL_DE_SAC_REFUSALS.offMap, block);

  const inBlock = (t: TilePoint): boolean =>
    t.x >= block.x && t.x <= block.x + 1 && t.z >= block.z && t.z <= block.z + 1;
  for (const t of blockTiles(block)) {
    if (ground.offGridAt(t.x, t.z)) return fail(CUL_DE_SAC_REFUSALS.offGrid, block);
    if (ground.roadAt(t.x, t.z) || ground.overRoadAt(t.x, t.z))
      return fail(CUL_DE_SAC_REFUSALS.road, block);
    if (!ground.buildableAt(t.x, t.z)) return fail(CUL_DE_SAC_REFUSALS.inTheWay, block);
  }
  // A road beside the block would join its tiles and make a second street of it.
  for (const n of outerNeighbours(block)) {
    if (inBlock(n.tile) || (n.tile.x === at.x && n.tile.z === at.z)) continue;
    if (!inMap(n.tile.x, n.tile.z)) continue;
    if (ground.roadAt(n.tile.x, n.tile.z) || ground.overRoadAt(n.tile.x, n.tile.z))
      return fail(CUL_DE_SAC_REFUSALS.road, block);
  }
  return { block, end: own, toLay: blockTiles(block), refusal: null };
}

/**
 * Whether a cul-de-sac may stand on `block`, which the worker asks of a block
 * whose four tiles are laid: street on the ground of one lane each way, joined
 * round the square, with exactly one street leaving it.
 */
export function culDeSacPlan(block: CulDeSacBlock, ground: RoundaboutGround): CulDeSacPlan {
  const plan = (refusal: string | null): CulDeSacPlan => ({
    block,
    end: null,
    toLay: [],
    refusal,
  });
  const tiles = blockTiles(block);
  if (!tiles.every((t) => inMap(t.x, t.z))) return plan(CUL_DE_SAC_REFUSALS.offMap);
  for (const t of tiles) {
    if (ground.codeAt(t.x, t.z) === CUL_DE_SAC_CODE) return plan(CUL_DE_SAC_REFUSALS.already);
    if (ground.offGridAt(t.x, t.z)) return plan(CUL_DE_SAC_REFUSALS.offGrid);
    const road = ground.roadAt(t.x, t.z);
    if (!road || ground.overRoadAt(t.x, t.z)) return plan(CUL_DE_SAC_REFUSALS.notLaid);
    const refused = streetRefusal(road);
    if (refused) return plan(refused);
  }
  if (!blockIntact(block, ground)) return plan(CUL_DE_SAC_REFUSALS.notLaid);
  const legs = roundaboutLegs(block, (x, z) => ground.maskAt(x, z));
  if (legs.length !== 1) return plan(CUL_DE_SAC_REFUSALS.notEnd);
  const leg = legs[0]!;
  const street = ground.roadAt(leg.tile.x, leg.tile.z);
  if (!street) return plan(CUL_DE_SAC_REFUSALS.notEnd);
  const refused = streetRefusal(street);
  if (refused) return plan(refused);
  return plan(null);
}

/**
 * The commands that lay `plan` as one batch: its four tiles as the street
 * `tier` (under `profile`, where the street carries a composed one) on the
 * ground, and then the cul-de-sac itself.
 */
export function culDeSacCommands(plan: CulDeSacPlan, tier: RoadTier, profile?: number): Command[] {
  const road: Command[] =
    plan.toLay.length === 0
      ? []
      : [
          {
            kind: 'buildRoad',
            tier,
            tiles: plan.toLay,
            elevations: plan.toLay.map(() => 0),
            ...(profile !== undefined ? { profile } : {}),
          },
        ];
  return [...road, { kind: 'buildCulDeSac', x: plan.block.x, z: plan.block.z }];
}
