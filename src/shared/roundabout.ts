/**
 * Compact roundabouts: a single-lane ring on a 2×2 block of tiles, centred on
 * the corner the block's four tiles share.
 *
 * Nothing is stored for one but the roundabout control, on each of its four
 * tiles. Which blocks are roundabouts, where their legs are, whether one may
 * be laid, and the line a car drives round one are all read off that and the
 * roads, here, for the worker, the graph, the mirror and the tool alike.
 *
 * A block is named by its north-west tile. Its corners, in the order every
 * list of them here keeps, are north-west, north-east, south-west, south-east.
 *
 * Pure: tiles, readers and metres, no grid and no scene.
 */
import { MAP_SIZE, TILE_METERS } from './constants';
import { codeForControl } from './junction';
import { atOneLevel } from './overpass';
import { PRESET_LANE_WIDTH_M } from './roadprofile';
import { isStreetTier, isTramTier, RoadFlow, RoadTier } from './types';
import type { Command, RoadProfile, TilePoint } from './types';

/** The ring's outer edge: an inscribed circle 36 m across, inside the block's 40 m. */
export const RING_OUTER_RADIUS_M = 18;
/** The circulatory roadway, one lane wide. */
export const RING_ROADWAY_WIDTH_M = 5.5;
/** The truck apron inside it, which a long vehicle's rear wheels track over. */
export const RING_APRON_WIDTH_M = 3.7;
/** The splitter island's width where it meets the ring. */
export const SPLITTER_WIDTH_M = 1.8;
/** The steepest the ground may rise or fall across the block, along either road. */
export const RING_MAX_GRADE = 0.04;

/**
 * The radius of the line a car's route follows round the ring. A car keeps
 * half a lane to the right of its route, which going round anticlockwise is
 * outward, so the route runs that far inside the lane's centre.
 */
export const RING_ROUTE_RADIUS_M =
  RING_OUTER_RADIUS_M - RING_ROADWAY_WIDTH_M / 2 - PRESET_LANE_WIDTH_M / 2;

/** The radius of the ring's lane's centre, which is what a car covers going round. */
const RING_LANE_RADIUS_M = RING_OUTER_RADIUS_M - RING_ROADWAY_WIDTH_M / 2;

export interface RoundaboutBlock {
  /** The block's north-west tile. */
  x: number;
  z: number;
}

const NORTH = 1;
const EAST = 2;
const SOUTH = 4;
const WEST = 8;

/** The block's corners from its north-west tile, in the order kept everywhere here. */
const CORNERS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
];

/** The stored code of the roundabout control, which each of a roundabout's four tiles carries. */
export const ROUNDABOUT_CODE = codeForControl('roundabout');

const inMap = (x: number, z: number): boolean => x >= 0 && z >= 0 && x < MAP_SIZE && z < MAP_SIZE;

/** The mask bit for the neighbour one step (dx, dz) away. */
function bitToward(dx: number, dz: number): number {
  if (dz < 0) return NORTH;
  if (dx > 0) return EAST;
  if (dz > 0) return SOUTH;
  return WEST;
}

/** The block's four tiles, north-west, north-east, south-west, south-east. */
export function blockTiles(block: RoundaboutBlock): TilePoint[] {
  return CORNERS.map(([dx, dz]) => ({ x: block.x + dx, z: block.z + dz }));
}

/** The sides of a corner that face the other corners of its block. */
function inwardBits(block: RoundaboutBlock, t: TilePoint): number {
  return (t.x === block.x ? EAST : WEST) | (t.z === block.z ? SOUTH : NORTH);
}

/** What reading a block needs to know of the grid. */
export interface RingReader {
  /** The stored control override at a tile, as `codeForControl` writes it. */
  codeAt(x: number, z: number): number;
  /** Whether a street road lies on the ground at a tile, not raised on a deck. */
  groundStreetAt(x: number, z: number): boolean;
  /** The neighbour mask of the road on the ground at a tile, 0 where there is none. */
  maskAt(x: number, z: number): number;
}

/**
 * The block of four roundabout-coded tiles that (x, z) belongs to, or null.
 * Where two such blocks hold it, the one whose origin comes first by row and
 * then column wins; the tool never lays two.
 */
export function roundaboutBlockOf(
  x: number,
  z: number,
  codeAt: (x: number, z: number) => number,
): RoundaboutBlock | null {
  for (const oz of [z - 1, z]) {
    for (const ox of [x - 1, x]) {
      const coded = CORNERS.every(
        ([dx, dz]) => inMap(ox + dx, oz + dz) && codeAt(ox + dx, oz + dz) === ROUNDABOUT_CODE,
      );
      if (coded) return { x: ox, z: oz };
    }
  }
  return null;
}

/** Whether a block's four tiles are street roads on the ground, joined round the square. */
export function blockIntact(block: RoundaboutBlock, reader: RingReader): boolean {
  return blockTiles(block).every((t) => {
    if (!reader.groundStreetAt(t.x, t.z)) return false;
    const inward = inwardBits(block, t);
    return (reader.maskAt(t.x, t.z) & inward) === inward;
  });
}

/** The compact roundabout (x, z) is a corner of, or null. */
export function compactRoundaboutAt(
  x: number,
  z: number,
  reader: RingReader,
): RoundaboutBlock | null {
  const block = roundaboutBlockOf(x, z, (tx, tz) => reader.codeAt(tx, tz));
  return block && blockIntact(block, reader) ? block : null;
}

/**
 * The override a tile's stored code stands for. A tile of a block of four
 * roundabout-coded tiles that are no longer joined round the square is no
 * roundabout, and its code is read as no override at all, so its junction
 * falls back to its warrant rather than becoming a mini roundabout.
 */
export function effectiveControlCode(x: number, z: number, reader: RingReader): number {
  const code = reader.codeAt(x, z);
  if (code !== ROUNDABOUT_CODE) return code;
  const block = roundaboutBlockOf(x, z, (tx, tz) => reader.codeAt(tx, tz));
  return block && !blockIntact(block, reader) ? 0 : code;
}

/**
 * Every compact roundabout that any of `coded` — the tiles storing the
 * roundabout code — is a corner of, each once, by row and then column.
 */
export function compactRoundaboutsAmong(
  coded: Iterable<TilePoint>,
  reader: RingReader,
): RoundaboutBlock[] {
  const found = new Map<number, RoundaboutBlock>();
  for (const t of coded) {
    const block = compactRoundaboutAt(t.x, t.z, reader);
    if (block) found.set(block.z * MAP_SIZE + block.x, block);
  }
  return [...found.entries()].sort((a, b) => a[0] - b[0]).map(([, block]) => block);
}

// --- The ring's geometry ----------------------------------------------------

/** The ring's centre, world metres: the corner the block's four tiles share. */
export function ringCentre(block: RoundaboutBlock): { x: number; z: number } {
  return { x: (block.x + 1) * TILE_METERS, z: (block.z + 1) * TILE_METERS };
}

/** The angle, about the ring's centre, of the diagonal through a corner tile's centre. */
function cornerAngle(block: RoundaboutBlock, t: TilePoint): number {
  return Math.atan2(t.z - block.z - 0.5, t.x - block.x - 0.5);
}

/**
 * Where a corner tile's routes meet, world metres: on the ring's route, on the
 * diagonal from the ring's centre through the tile's own. A car entering bends
 * onto the ring here rather than driving on to the tile's centre, which is
 * inside the island.
 */
export function ringPoint(block: RoundaboutBlock, t: TilePoint): { x: number; z: number } {
  const c = ringCentre(block);
  const a = cornerAngle(block, t);
  return { x: c.x + RING_ROUTE_RADIUS_M * Math.cos(a), z: c.z + RING_ROUTE_RADIUS_M * Math.sin(a) };
}

/**
 * Whether traffic round the ring goes from corner `from` to corner `to`, the
 * next one along. Right-hand traffic goes round anticlockwise seen from above,
 * north up, which with z growing south is the way the corner angle falls.
 */
export function runsRound(block: RoundaboutBlock, from: TilePoint, to: TilePoint): boolean {
  const turn = wrapAngle(cornerAngle(block, to) - cornerAngle(block, from));
  return Math.abs(turn + Math.PI / 2) < 1e-9;
}

/** An angle brought into (−π, π]. */
function wrapAngle(a: number): number {
  let out = a;
  while (out <= -Math.PI) out += 2 * Math.PI;
  while (out > Math.PI) out -= 2 * Math.PI;
  return out;
}

/** Points laid round each quarter of an arc, so it reads as round. */
const ARC_STEPS_PER_QUARTER = 9;

/**
 * The line driven along a run of corner tiles, `tiles` in order, each the
 * next corner round from the one before in one direction or the other: an arc
 * of the ring's route from the first's point to the last's.
 */
export function ringArc(
  block: RoundaboutBlock,
  tiles: readonly TilePoint[],
): { x: number; z: number }[] {
  const c = ringCentre(block);
  const first = tiles[0];
  if (!first) return [];
  const out = [ringPoint(block, first)];
  let angle = cornerAngle(block, first);
  for (let i = 1; i < tiles.length; i++) {
    const next = tiles[i]!;
    const turn = wrapAngle(cornerAngle(block, next) - angle);
    for (let k = 1; k < ARC_STEPS_PER_QUARTER; k++) {
      const a = angle + (turn * k) / ARC_STEPS_PER_QUARTER;
      out.push({
        x: c.x + RING_ROUTE_RADIUS_M * Math.cos(a),
        z: c.z + RING_ROUTE_RADIUS_M * Math.sin(a),
      });
    }
    out.push(ringPoint(block, next));
    angle += turn;
  }
  return out;
}

/** How far round the ring a run of `quarters` quarters is, in tiles, at the lane's centre. */
export function ringArcTiles(quarters: number): number {
  return (quarters * Math.PI * RING_LANE_RADIUS_M) / (2 * TILE_METERS);
}

// --- Legs --------------------------------------------------------------------

export interface RoundaboutLeg {
  /** The corner of the block it joins. */
  from: TilePoint;
  /** Its own first tile, outside the block. */
  tile: TilePoint;
  /** The side of the block it meets, which is the way out along it. */
  side: RoadFlow;
}

/** Each corner's two outward neighbours, and the side of the block each is on. */
function outerNeighbours(block: RoundaboutBlock): RoundaboutLeg[] {
  const out: RoundaboutLeg[] = [];
  for (const from of blockTiles(block)) {
    const north = from.z === block.z;
    const west = from.x === block.x;
    out.push({
      from,
      tile: { x: from.x, z: from.z + (north ? -1 : 1) },
      side: north ? RoadFlow.North : RoadFlow.South,
    });
    out.push({
      from,
      tile: { x: from.x + (west ? -1 : 1), z: from.z },
      side: west ? RoadFlow.West : RoadFlow.East,
    });
  }
  return out;
}

/** The legs of a block whose four tiles are laid: the roads its corners join outside it. */
export function roundaboutLegs(
  block: RoundaboutBlock,
  maskAt: (x: number, z: number) => number,
): RoundaboutLeg[] {
  return outerNeighbours(block).filter(
    (leg) =>
      (maskAt(leg.from.x, leg.from.z) &
        bitToward(leg.tile.x - leg.from.x, leg.tile.z - leg.from.z)) !==
      0,
  );
}

// --- Whether one may be laid ---------------------------------------------------

/** A road on the ground at a tile, as a roundabout's site reads it. */
export interface RoundaboutRoad {
  tier: RoadTier;
  /** Its cross-section. */
  profile: RoadProfile;
  /** One half of a road laid across two tiles. */
  corridor: boolean;
  /** How far its deck stands above the ground, metres. */
  elevation: number;
}

/** What a roundabout's site needs to know of the grid. */
export interface RoundaboutGround extends RingReader {
  /** The road on the ground layer at a tile, of any kind, or null. */
  roadAt(x: number, z: number): RoundaboutRoad | null;
  /** Whether a road passes over a tile. */
  overRoadAt(x: number, z: number): boolean;
  /** Whether a road off the grid covers a tile or meets the grid there. */
  offGridAt(x: number, z: number): boolean;
  /** Whether a road could be laid on a tile: dry, not too steep, no building. */
  buildableAt(x: number, z: number): boolean;
  /** The ground's height at a tile, metres. */
  heightAt(x: number, z: number): number;
}

export const ROUNDABOUT_REFUSALS = {
  notJunction: 'A roundabout goes on a junction',
  offMap: 'A roundabout needs room on the map',
  already: 'That is already a roundabout',
  railway: 'A railway is in the way',
  raised: 'A roundabout goes on the ground, clear of bridges',
  offGrid: 'A road off the grid meets it there',
  inTheWay: 'A building, water or steep ground is in the way',
  motorway: 'A motorway cannot meet a roundabout',
  slipRoad: 'A slip road can meet a roundabout, but not run round it',
  tramway: 'A tramway cannot run through a roundabout',
  wide: 'Only roads of one lane each way meet a compact roundabout',
  apart: 'Two of its roads are held apart',
  sideTwice: 'Two roads would meet one side of the roundabout',
  junctionClose: 'Another junction is too close to the roundabout',
  legCount: 'A roundabout needs three or four roads into it',
  steep: 'The ground is too steep for a roundabout',
} as const;

/** Why a road may not be part of a roundabout, as a leg or a corner, or null. */
function roadRefusal(road: RoundaboutRoad, corner: boolean): string | null {
  if (road.tier === RoadTier.Highway) return ROUNDABOUT_REFUSALS.motorway;
  if (corner && road.tier === RoadTier.Ramp) return ROUNDABOUT_REFUSALS.slipRoad;
  if (isTramTier(road.tier) || road.profile.pieces.some((p) => p.kind === 'tram' || p.tram)) {
    return ROUNDABOUT_REFUSALS.tramway;
  }
  if (road.corridor || !oneLaneEachWay(road.profile)) return ROUNDABOUT_REFUSALS.wide;
  return null;
}

/**
 * Whether a cross-section has at most one lane each way: a single-lane
 * roundabout's entries and exits are one lane, and a shared centre turn lane
 * is a third.
 */
export function oneLaneEachWay(profile: RoadProfile): boolean {
  let fwd = 0;
  let back = 0;
  for (const p of profile.pieces) {
    if (p.kind === 'centreTurn') return false;
    if (p.kind !== 'travel' && p.kind !== 'bus') continue;
    const flow = p.flow ?? 'both';
    if (flow !== 'back') fwd++;
    if (flow !== 'fwd') back++;
  }
  return fwd <= 1 && back <= 1;
}

export interface RoundaboutPlan {
  block: RoundaboutBlock;
  /** The block's tiles with no road yet, which the tool lays, as one run. */
  toLay: TilePoint[];
  /** The roads into it, once it is laid. */
  legs: RoundaboutLeg[];
  /** Why it may not be laid, or null. */
  refusal: string | null;
}

/**
 * The roundabout the tool would lay at the junction `at`, on the quarter of
 * that tile the pointer is in: `east` and `south` say which, and the block
 * reaches that way from the junction.
 */
export function roundaboutAtJunction(
  at: TilePoint,
  east: boolean,
  south: boolean,
  ground: RoundaboutGround,
): RoundaboutPlan {
  const block = { x: east ? at.x : at.x - 1, z: south ? at.z : at.z - 1 };
  const road = ground.roadAt(at.x, at.z);
  const arms = ground.maskAt(at.x, at.z);
  const armCount = [NORTH, EAST, SOUTH, WEST].filter((bit) => (arms & bit) !== 0).length;
  if (!road || !isStreetTier(road.tier) || road.elevation > 0 || armCount < 3) {
    return { block, toLay: [], legs: [], refusal: ROUNDABOUT_REFUSALS.notJunction };
  }
  return roundaboutPlan(block, ground);
}

/**
 * Whether a compact roundabout may stand on `block`, which of its tiles would
 * have to be laid, and what its legs would be. A tile to be laid joins every
 * road it touches at its own level, as any tile laid with snapping on does, so
 * those roads are its legs. The worker asks this of a block it has laid in
 * full; the tool, of one it is about to.
 */
export function roundaboutPlan(block: RoundaboutBlock, ground: RoundaboutGround): RoundaboutPlan {
  const tiles = blockTiles(block);
  const plan = (refusal: string | null, toLay: TilePoint[] = [], legs: RoundaboutLeg[] = []) => ({
    block,
    toLay,
    legs,
    refusal,
  });
  if (!tiles.every((t) => inMap(t.x, t.z))) return plan(ROUNDABOUT_REFUSALS.offMap);

  const toLay: TilePoint[] = [];
  for (const t of tiles) {
    if (compactRoundaboutAt(t.x, t.z, ground)) return plan(ROUNDABOUT_REFUSALS.already);
    if (ground.offGridAt(t.x, t.z)) return plan(ROUNDABOUT_REFUSALS.offGrid);
    const road = ground.roadAt(t.x, t.z);
    if (!road) {
      if (!ground.buildableAt(t.x, t.z)) return plan(ROUNDABOUT_REFUSALS.inTheWay);
      toLay.push(t);
      continue;
    }
    if (!isStreetTier(road.tier)) return plan(ROUNDABOUT_REFUSALS.railway);
    if (road.elevation > 0 || ground.overRoadAt(t.x, t.z)) return plan(ROUNDABOUT_REFUSALS.raised);
    const refused = roadRefusal(road, true);
    if (refused) return plan(refused);
  }
  const laid = (t: TilePoint): boolean => !toLay.some((l) => l.x === t.x && l.z === t.z);

  // Two of its roads already side by side have to be joined: the tool lays
  // only the tiles with no road, and joins nothing held apart.
  for (const t of tiles) {
    if (!laid(t)) continue;
    for (const [dx, dz] of [
      [1, 0],
      [0, 1],
    ] as const) {
      const n = { x: t.x + dx, z: t.z + dz };
      if (n.x > block.x + 1 || n.z > block.z + 1 || !laid(n)) continue;
      if ((ground.maskAt(t.x, t.z) & bitToward(dx, dz)) === 0)
        return plan(ROUNDABOUT_REFUSALS.apart);
    }
  }

  const legs: RoundaboutLeg[] = [];
  const sides = new Set<RoadFlow>();
  for (const candidate of outerNeighbours(block)) {
    const { from, tile } = candidate;
    const road = inMap(tile.x, tile.z) ? ground.roadAt(tile.x, tile.z) : null;
    if (!road) continue;
    // A tile to be laid would be joined to a motorway beside it too, which
    // the world refuses; one only lying beside a laid corner joins nothing.
    const joins = laid(from)
      ? (ground.maskAt(from.x, from.z) & bitToward(tile.x - from.x, tile.z - from.z)) !== 0
      : isStreetTier(road.tier) && atOneLevel(0, road.elevation);
    if (!joins) continue;
    if (road.elevation > 0) return plan(ROUNDABOUT_REFUSALS.raised);
    const refused = roadRefusal(road, false);
    if (refused) return plan(refused);
    const along =
      candidate.side === RoadFlow.North || candidate.side === RoadFlow.South
        ? NORTH | SOUTH
        : EAST | WEST;
    if ((ground.maskAt(tile.x, tile.z) & ~along) !== 0)
      return plan(ROUNDABOUT_REFUSALS.junctionClose);
    if (sides.has(candidate.side)) return plan(ROUNDABOUT_REFUSALS.sideTwice);
    sides.add(candidate.side);
    legs.push(candidate);
  }
  if (legs.length < 3) return plan(ROUNDABOUT_REFUSALS.legCount);

  const rise = TILE_METERS * RING_MAX_GRADE;
  const h = tiles.map((t) => ground.heightAt(t.x, t.z));
  const [nw, ne, sw, se] = h as [number, number, number, number];
  const steep = [
    [nw, ne],
    [sw, se],
    [nw, sw],
    [ne, se],
  ].some(([a, b]) => Math.abs(a! - b!) > rise + 1e-9);
  if (steep) return plan(ROUNDABOUT_REFUSALS.steep);

  return plan(null, toLay, legs);
}

/**
 * The commands that lay `plan`, as one batch: the tiles it has to lay, as
 * the road `tier` (under `profile`, where the road carries a composed one)
 * on the ground, and then the roundabout itself.
 */
export function roundaboutCommands(
  plan: RoundaboutPlan,
  tier: RoadTier,
  profile?: number,
): Command[] {
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
  return [...road, { kind: 'buildRoundabout', x: plan.block.x, z: plan.block.z }];
}
