/**
 * Cul-de-sacs: a turning circle on a block of tiles laid beyond a dead end,
 * which homes form round. It comes in two forms. The offset form is a 2×2
 * block with the circle on the corner its four tiles share, so the street,
 * which runs down tile centres, meets it half a tile off its middle. The
 * centred form is a block three tiles across its street and two along, with
 * the circle on the street's own centre line.
 *
 * Nothing is stored for one but its code, on each tile of its block: the
 * cul-de-sac code for the offset form, the centred one for the other. Whether
 * a block is one, where its single street meets it, whether one may be laid,
 * and the line a car drives round it are all read off that and the roads,
 * here, for the worker, the graph, the mirror, the mesh and the tool alike.
 *
 * A block is named by its north-west tile. An offset block's tiles come in the
 * order `blockTiles` keeps: north-west, north-east, south-west, south-east; a
 * centred one's, row by row.
 *
 * Pure: tiles, readers and metres, no grid and no scene.
 */
import { TILE_METERS } from './constants';
import { CENTRED_CUL_DE_SAC_CODE, CUL_DE_SAC_CODE } from './junction';
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
  ringPoint,
  roundaboutLegs,
  SOUTH,
  WEST,
  type RingReader,
  type RoundaboutGround,
  type RoundaboutLeg,
  type RoundaboutRoad,
} from './roundabout';
import { isOneWayProfile, isTramTrack } from './roadprofile';
import { isStreetTier, RoadFlow, RoadTier } from './types';
import type { CentredAxis, Command, CulDeSacMark, TilePoint } from './types';

export { CENTRED_CUL_DE_SAC_CODE, CUL_DE_SAC_CODE };

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
  /** The axis a centred block is three tiles long on; absent for the 2×2 offset form. */
  centred?: CentredAxis;
}

/** A cul-de-sac: its block and the one street that meets it. */
export interface CulDeSac extends CulDeSacBlock {
  /** The tile the street joins, the street's own first tile outside, and the side of the block it meets. */
  leg: RoundaboutLeg;
}

/** The byte a block's tiles store. */
export const culDeSacCodeOf = (block: CulDeSacBlock): number =>
  block.centred ? CENTRED_CUL_DE_SAC_CODE : CUL_DE_SAC_CODE;

/** Whether a stored byte is either form's cul-de-sac code. */
export const isCulDeSacCode = (code: number): boolean =>
  code === CUL_DE_SAC_CODE || code === CENTRED_CUL_DE_SAC_CODE;

/** A block as the world reports it, from the one the mirror and the snapshot carry. */
export const culDeSacMarkOf = (block: CulDeSacBlock): CulDeSacMark => ({
  x: block.x,
  z: block.z,
  ...(block.centred ? { centred: block.centred } : {}),
});

/** A block's width and depth, in tiles. */
export function culDeSacSize(block: CulDeSacBlock): { w: number; d: number } {
  if (block.centred === 'x') return { w: 3, d: 2 };
  if (block.centred === 'z') return { w: 2, d: 3 };
  return { w: 2, d: 2 };
}

/** A block's tiles: the offset form's in `blockTiles` order, a centred one's row by row. */
export function culDeSacTiles(block: CulDeSacBlock): TilePoint[] {
  if (!block.centred) return blockTiles(block);
  const { w, d } = culDeSacSize(block);
  const out: TilePoint[] = [];
  for (let dz = 0; dz < d; dz++)
    for (let dx = 0; dx < w; dx++) out.push({ x: block.x + dx, z: block.z + dz });
  return out;
}

const inside = (block: CulDeSacBlock, x: number, z: number): boolean => {
  const { w, d } = culDeSacSize(block);
  return x >= block.x && x < block.x + w && z >= block.z && z < block.z + d;
};

/** The four steps off a tile, with the mask bit and the side of a block each leaves by. */
const STEPS: ReadonlyArray<{ dx: number; dz: number; bit: number; side: RoadFlow }> = [
  { dx: 0, dz: -1, bit: NORTH, side: RoadFlow.North },
  { dx: 1, dz: 0, bit: EAST, side: RoadFlow.East },
  { dx: 0, dz: 1, bit: SOUTH, side: RoadFlow.South },
  { dx: -1, dz: 0, bit: WEST, side: RoadFlow.West },
];

/** The roads a block's tiles join outside it, one per tile and side. */
export function culDeSacLegs(
  block: CulDeSacBlock,
  maskAt: (x: number, z: number) => number,
): RoundaboutLeg[] {
  if (!block.centred) return roundaboutLegs(block, maskAt);
  const out: RoundaboutLeg[] = [];
  for (const from of culDeSacTiles(block)) {
    for (const s of STEPS) {
      const tile = { x: from.x + s.dx, z: from.z + s.dz };
      if (!inside(block, tile.x, tile.z) && (maskAt(from.x, from.z) & s.bit) !== 0) {
        out.push({ from, tile, side: s.side });
      }
    }
  }
  return out;
}

/** Whether a block's tiles are street on the ground, each joined to its neighbours inside the block. */
function joinedInside(block: CulDeSacBlock, reader: RingReader): boolean {
  if (!block.centred) return blockIntact(block, reader);
  return culDeSacTiles(block).every((t) => {
    if (!reader.groundStreetAt(t.x, t.z)) return false;
    return STEPS.every(
      (s) => !inside(block, t.x + s.dx, t.z + s.dz) || (reader.maskAt(t.x, t.z) & s.bit) !== 0,
    );
  });
}

/**
 * Whether a block's tiles are street on the ground joined to each other, and
 * the one street leaving them. A centred block's street leaves by the middle
 * tile of a long side, down the line the circle is centred on.
 */
function intactLeg(block: CulDeSacBlock, reader: RingReader): RoundaboutLeg | null {
  if (!joinedInside(block, reader)) return null;
  const legs = culDeSacLegs(block, (x, z) => reader.maskAt(x, z));
  const leg = legs.length === 1 ? legs[0]! : null;
  if (!leg || !block.centred) return leg;
  const vertical = leg.side === RoadFlow.North || leg.side === RoadFlow.South;
  const middle = vertical ? leg.from.x === block.x + 1 : leg.from.z === block.z + 1;
  const long = block.centred === 'x' ? vertical : !vertical;
  return middle && long ? leg : null;
}

/** The centred block of tiles all storing the centred code that (x, z) belongs to, or null; first by row and then column. */
function centredCodedBlockOf(
  x: number,
  z: number,
  codeAt: (x: number, z: number) => number,
): CulDeSacBlock | null {
  for (const centred of ['x', 'z'] as const) {
    const { w, d } = culDeSacSize({ x: 0, z: 0, centred });
    for (let oz = z - d + 1; oz <= z; oz++) {
      for (let ox = x - w + 1; ox <= x; ox++) {
        const block = { x: ox, z: oz, centred };
        const coded = culDeSacTiles(block).every(
          (t) => inMap(t.x, t.z) && codeAt(t.x, t.z) === CENTRED_CUL_DE_SAC_CODE,
        );
        if (coded) return block;
      }
    }
  }
  return null;
}

/**
 * The cul-de-sac (x, z) belongs to, or null. Coded tiles that are not street
 * on the ground joined to each other with exactly one street leaving them are
 * no cul-de-sac: they read as the plain road they are.
 */
export function culDeSacBlockOf(x: number, z: number, reader: RingReader): CulDeSac | null {
  const codeAt = (tx: number, tz: number): number => reader.codeAt(tx, tz);
  const block: CulDeSacBlock | null =
    codedBlockOf(x, z, CUL_DE_SAC_CODE, codeAt) ?? centredCodedBlockOf(x, z, codeAt);
  if (!block) return null;
  const leg = intactLeg(block, reader);
  return leg ? { ...block, leg } : null;
}

/** Every cul-de-sac that any of `coded` — the tiles storing its code — belongs to, each once, by row and then column. */
export function culDeSacsAmong(coded: Iterable<TilePoint>, reader: RingReader): CulDeSac[] {
  const found = new Map<string, CulDeSac>();
  for (const t of coded) {
    const c = culDeSacBlockOf(t.x, t.z, reader);
    if (c) found.set(`${c.z},${c.x},${c.centred ?? ''}`, c);
  }
  return [...found.values()].sort((a, b) => a.z - b.z || a.x - b.x);
}

// --- Geometry ---------------------------------------------------------------

/** The circle's centre in tiles: the corner an offset block's four tiles share, the middle of a centred block's long sides. */
function centreTiles(block: CulDeSacBlock): { x: number; z: number } {
  if (block.centred === 'x') return { x: block.x + 1.5, z: block.z + 1 };
  if (block.centred === 'z') return { x: block.x + 1, z: block.z + 1.5 };
  return { x: block.x + 1, z: block.z + 1 };
}

/** The circle's centre, world metres. */
export function culDeSacCentre(block: CulDeSacBlock): { x: number; z: number } {
  const c = centreTiles(block);
  return { x: c.x * TILE_METERS, z: c.z * TILE_METERS };
}

/**
 * The block the ring helpers measure from: one whose own centre, as an offset
 * block's, is the circle's, so a point of the circle is read off the same way
 * whichever form it is.
 */
function frameOf(block: CulDeSacBlock): { x: number; z: number } {
  const c = centreTiles(block);
  return { x: c.x - 1, z: c.z - 1 };
}

/** The angle, about the circle's centre, of the line through a tile's centre. */
function tileAngle(block: CulDeSacBlock, t: TilePoint): number {
  const c = centreTiles(block);
  return Math.atan2(t.z + 0.5 - c.z, t.x + 0.5 - c.x);
}

/** An angle brought into (−π, π]. */
function wrapAngle(a: number): number {
  let out = a;
  while (out <= -Math.PI) out += 2 * Math.PI;
  while (out > Math.PI) out -= 2 * Math.PI;
  return out;
}

/**
 * Where a tile's routes meet the circle's route, world metres: on the line from
 * the centre through the tile's own, so a car entering bends onto the circle
 * rather than driving on to a tile centre, which lies at the kerb.
 */
export function culDeSacPoint(block: CulDeSacBlock, t: TilePoint): { x: number; z: number } {
  return ringPoint(frameOf(block), t, CUL_DE_SAC_ROUTE_RADIUS_M);
}

/**
 * Whether a run of the block's tiles, in order, goes round anticlockwise seen
 * from above, north up: the way right-hand traffic circulates.
 */
export function loopRunsRound(block: CulDeSacBlock, tiles: readonly TilePoint[]): boolean {
  return wrapAngle(tileAngle(block, tiles[1]!) - tileAngle(block, tiles[0]!)) < 0;
}

/** The line driven round the circle along a run of the block's tiles, in the run's order. */
export function culDeSacArc(
  block: CulDeSacBlock,
  tiles: readonly TilePoint[],
): { x: number; z: number }[] {
  return ringArc(frameOf(block), tiles, CUL_DE_SAC_ROUTE_RADIUS_M);
}

/** How far round the circle a run of `quarters` quarters is, in tiles, along a car's route. */
export function culDeSacArcTiles(quarters: number): number {
  return (quarters * Math.PI * CUL_DE_SAC_ROUTE_RADIUS_M) / (2 * TILE_METERS);
}

/** How far round the circle a run of the block's tiles goes, in tiles, along a car's route. */
export function culDeSacRunTiles(block: CulDeSacBlock, tiles: readonly TilePoint[]): number {
  if (!block.centred) return culDeSacArcTiles(tiles.length - 1);
  let turned = 0;
  for (let i = 1; i < tiles.length; i++) {
    turned += Math.abs(wrapAngle(tileAngle(block, tiles[i]!) - tileAngle(block, tiles[i - 1]!)));
  }
  return (turned * CUL_DE_SAC_ROUTE_RADIUS_M) / TILE_METERS;
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
  centredNotLaid: 'A centred cul-de-sac needs all six tiles laid as street',
  centredNotEnd: 'A centred cul-de-sac must end exactly one street, at the middle of its long side',
  touchesRoad:
    'A road beside the block would touch the centred cul-de-sac: only its own street may meet it',
  touchesCentred: 'A centred cul-de-sac may not touch another',
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
 * The step a block leaves the dead end `at` by, or the reason there is none:
 * the tile is the end of one street, of a kind a cul-de-sac may end.
 */
function deadEndStep(at: TilePoint, ground: RoundaboutGround): { dx: number; dz: number } | string {
  const road = ground.roadAt(at.x, at.z);
  if (!road || ground.overRoadAt(at.x, at.z)) return CUL_DE_SAC_REFUSALS.notDeadEnd;
  if (!isStreetTier(road.tier)) return CUL_DE_SAC_REFUSALS.railway;
  const step = awayFrom(ground.maskAt(at.x, at.z));
  if (!step) return CUL_DE_SAC_REFUSALS.notDeadEnd;
  return streetRefusal(road) ?? step;
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
  const found = deadEndStep(at, ground);
  if (typeof found === 'string') return fail(found);
  const step = found;

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

/** How far either side of a street's centre line the pointer still picks the centred form: half a tile's width. */
export const CENTRED_ZONE_M = TILE_METERS / 4;

/**
 * Whether the pointer, at `pointer` in world metres, is over the middle of the
 * street ending at `at` rather than to one side of it: strictly inside the zone
 * of the street's centre line, across it. The zone's own edge is already a side.
 */
export function pointerOnCentreLine(
  at: TilePoint,
  pointer: { x: number; z: number },
  ground: RoundaboutGround,
): boolean {
  const step = awayFrom(ground.maskAt(at.x, at.z));
  if (!step) return false;
  const across =
    step.dx === 0 ? pointer.x - (at.x + 0.5) * TILE_METERS : pointer.z - (at.z + 0.5) * TILE_METERS;
  return Math.abs(across) < CENTRED_ZONE_M;
}

/**
 * The centred cul-de-sac the tool would lay beyond the dead end `at`: three
 * tiles across the street and two along, the street joining the middle of the
 * near long side. Nothing but the street may touch the block, and another
 * centred cul-de-sac may not.
 */
export function centredCulDeSacAtEnd(at: TilePoint, ground: RoundaboutGround): CulDeSacPlan {
  const own = { x: at.x, z: at.z };
  const fail = (refusal: string, block: CulDeSacBlock = own): CulDeSacPlan => ({
    block,
    end: own,
    toLay: [],
    refusal,
  });
  const found = deadEndStep(at, ground);
  if (typeof found === 'string') return fail(found);
  const step = found;

  const across = step.dx === 0 ? { dx: 1, dz: 0 } : { dx: 0, dz: 1 };
  const tiles: TilePoint[] = [];
  for (const k of [1, 2]) {
    for (const lateral of [-1, 0, 1]) {
      tiles.push({
        x: at.x + step.dx * k + across.dx * lateral,
        z: at.z + step.dz * k + across.dz * lateral,
      });
    }
  }
  const block: CulDeSacBlock = {
    x: Math.min(...tiles.map((t) => t.x)),
    z: Math.min(...tiles.map((t) => t.z)),
    centred: step.dx === 0 ? 'x' : 'z',
  };
  if (!tiles.every((t) => inMap(t.x, t.z))) return fail(CUL_DE_SAC_REFUSALS.offMap, block);

  for (const t of culDeSacTiles(block)) {
    if (ground.offGridAt(t.x, t.z)) return fail(CUL_DE_SAC_REFUSALS.offGrid, block);
    if (ground.roadAt(t.x, t.z) || ground.overRoadAt(t.x, t.z))
      return fail(CUL_DE_SAC_REFUSALS.road, block);
    if (!ground.buildableAt(t.x, t.z)) return fail(CUL_DE_SAC_REFUSALS.inTheWay, block);
  }
  // A road beside the block would join its tiles and make a second street of it.
  for (const t of culDeSacTiles(block)) {
    for (const s of STEPS) {
      const n = { x: t.x + s.dx, z: t.z + s.dz };
      if (inside(block, n.x, n.z) || (n.x === at.x && n.z === at.z) || !inMap(n.x, n.z)) continue;
      if (ground.codeAt(n.x, n.z) === CENTRED_CUL_DE_SAC_CODE)
        return fail(CUL_DE_SAC_REFUSALS.touchesCentred, block);
      if (ground.roadAt(n.x, n.z) || ground.overRoadAt(n.x, n.z))
        return fail(CUL_DE_SAC_REFUSALS.touchesRoad, block);
    }
  }
  return { block, end: own, toLay: culDeSacTiles(block), refusal: null };
}

/**
 * Whether a cul-de-sac may stand on `block`, which the worker asks of a block
 * whose tiles are laid: street on the ground of one lane each way, joined to
 * each other, with exactly one street leaving it (a centred block's at the
 * middle of a long side).
 */
export function culDeSacPlan(block: CulDeSacBlock, ground: RoundaboutGround): CulDeSacPlan {
  const plan = (refusal: string | null): CulDeSacPlan => ({
    block,
    end: null,
    toLay: [],
    refusal,
  });
  const centred = block.centred !== undefined;
  const tiles = culDeSacTiles(block);
  if (!tiles.every((t) => inMap(t.x, t.z))) return plan(CUL_DE_SAC_REFUSALS.offMap);
  for (const t of tiles) {
    if (isCulDeSacCode(ground.codeAt(t.x, t.z))) return plan(CUL_DE_SAC_REFUSALS.already);
    if (ground.offGridAt(t.x, t.z)) return plan(CUL_DE_SAC_REFUSALS.offGrid);
    const road = ground.roadAt(t.x, t.z);
    if (!road || ground.overRoadAt(t.x, t.z))
      return plan(centred ? CUL_DE_SAC_REFUSALS.centredNotLaid : CUL_DE_SAC_REFUSALS.notLaid);
    const refused = streetRefusal(road);
    if (refused) return plan(refused);
  }
  if (!joinedInside(block, ground))
    return plan(centred ? CUL_DE_SAC_REFUSALS.centredNotLaid : CUL_DE_SAC_REFUSALS.notLaid);
  const legs = culDeSacLegs(block, (x, z) => ground.maskAt(x, z));
  if (centred && !intactLeg(block, ground)) return plan(CUL_DE_SAC_REFUSALS.centredNotEnd);
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
  return [
    ...road,
    {
      kind: 'buildCulDeSac',
      x: plan.block.x,
      z: plan.block.z,
      ...(plan.block.centred ? { centred: plan.block.centred } : {}),
    },
  ];
}
