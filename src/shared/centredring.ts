/**
 * Centred roundabouts: the compact single-lane ring on a 3×3 block of tiles,
 * centred on the middle tile, so every road meets it head on down its own
 * centre line.
 *
 * Nothing is stored for one but the centred roundabout code, on each of its
 * nine tiles. Which blocks are one, where their legs are, whether one may be
 * laid, and the line a car drives round one are all read off that and the
 * roads, here, for the worker, the graph, the mirror, the mesh and the tool.
 *
 * A block is named by its north-west tile; its tiles come row by row, and its
 * middle tile is the junction. A leg is the road beyond a side's middle tile:
 * the arm runs straight for two tiles, the side's middle tile inside the block
 * and the leg's first tile outside it.
 *
 * Pure: tiles, readers and metres, no grid and no scene.
 */
import { TILE_METERS } from './constants';
import { CENTRED_ROUNDABOUT_CODE } from './junction';
import {
  effectiveControlCode,
  EAST,
  inMap,
  NORTH,
  RING_MAX_GRADE,
  RING_ROUTE_RADIUS_M,
  ringArc,
  ringArcTiles,
  ringPoint,
  ROUNDABOUT_CODE,
  ROUNDABOUT_REFUSALS,
  roadRefusal,
  SOUTH,
  WEST,
  type RingReader,
  type RoundaboutGround,
  type RoundaboutLeg,
} from './roundabout';
import { isStreetTier, RoadFlow, RoadTier } from './types';
import type { Command, TilePoint } from './types';

export { CENTRED_ROUNDABOUT_CODE };

/** A centred roundabout's block, by its north-west tile. */
export interface CentredRing {
  x: number;
  z: number;
}

/** A centred roundabout and the roads into it. */
export interface CentredRingFound extends CentredRing {
  legs: RoundaboutLeg[];
}

/** How far either side of the junction tile's centre the pointer still picks the centred form, on both axes. */
export const CENTRED_RING_ZONE_M = TILE_METERS / 4;

/** The four sides of the block: the step out from the middle tile, the mask bit, the side. */
const SIDES: ReadonlyArray<{ dx: number; dz: number; bit: number; side: RoadFlow; along: number }> =
  [
    { dx: 0, dz: -1, bit: NORTH, side: RoadFlow.North, along: NORTH | SOUTH },
    { dx: 1, dz: 0, bit: EAST, side: RoadFlow.East, along: EAST | WEST },
    { dx: 0, dz: 1, bit: SOUTH, side: RoadFlow.South, along: NORTH | SOUTH },
    { dx: -1, dz: 0, bit: WEST, side: RoadFlow.West, along: EAST | WEST },
  ];

/** The block's nine tiles, row by row from the north-west. */
export function centredRingTiles(block: CentredRing): TilePoint[] {
  const out: TilePoint[] = [];
  for (let dz = 0; dz < 3; dz++)
    for (let dx = 0; dx < 3; dx++) out.push({ x: block.x + dx, z: block.z + dz });
  return out;
}

/** The junction's own tile, in the middle of the block. */
export const centredRingMiddle = (block: CentredRing): TilePoint => ({
  x: block.x + 1,
  z: block.z + 1,
});

const inBlock = (block: CentredRing, x: number, z: number): boolean =>
  x >= block.x && x < block.x + 3 && z >= block.z && z < block.z + 3;

/** The roads a block's side-middle tiles join outside it, and any a corner or a sideways join makes (which no roundabout may have). */
function outsideJoins(
  block: CentredRing,
  maskAt: (x: number, z: number) => number,
): { legs: RoundaboutLeg[]; stray: boolean } {
  const legs: RoundaboutLeg[] = [];
  let stray = false;
  const mid = centredRingMiddle(block);
  for (const from of centredRingTiles(block)) {
    for (const s of SIDES) {
      const tile = { x: from.x + s.dx, z: from.z + s.dz };
      if (inBlock(block, tile.x, tile.z) || (maskAt(from.x, from.z) & s.bit) === 0) continue;
      const isLeg = from.x - mid.x === s.dx && from.z - mid.z === s.dz;
      if (isLeg) legs.push({ from, tile, side: s.side });
      else stray = true;
    }
  }
  return { legs, stray };
}

/** The roads into a block of nine laid tiles, each leaving a side's middle tile. */
export function centredRingLegs(
  block: CentredRing,
  maskAt: (x: number, z: number) => number,
): RoundaboutLeg[] {
  return outsideJoins(block, maskAt).legs;
}

/** Whether a block's tiles are street on the ground, each joined to every neighbour inside the block. */
function joinedInside(block: CentredRing, reader: RingReader): boolean {
  return centredRingTiles(block).every(
    (t) =>
      reader.groundStreetAt(t.x, t.z) &&
      SIDES.every(
        (s) => !inBlock(block, t.x + s.dx, t.z + s.dz) || (reader.maskAt(t.x, t.z) & s.bit) !== 0,
      ),
  );
}

/** The roads into an intact block: three or four, each leaving a side's middle tile, and nothing else touching the block. */
function intactLegs(block: CentredRing, reader: RingReader): RoundaboutLeg[] | null {
  if (!joinedInside(block, reader)) return null;
  const { legs, stray } = outsideJoins(block, (x, z) => reader.maskAt(x, z));
  return !stray && legs.length >= 3 ? legs : null;
}

/** The block of nine centred-roundabout-coded tiles that (x, z) belongs to, or null; first by row and then column. */
function codedBlockOf(
  x: number,
  z: number,
  codeAt: (x: number, z: number) => number,
): CentredRing | null {
  for (let oz = z - 2; oz <= z; oz++) {
    for (let ox = x - 2; ox <= x; ox++) {
      const block = { x: ox, z: oz };
      if (
        centredRingTiles(block).every(
          (t) => inMap(t.x, t.z) && codeAt(t.x, t.z) === CENTRED_ROUNDABOUT_CODE,
        )
      ) {
        return block;
      }
    }
  }
  return null;
}

/**
 * The centred roundabout (x, z) is a tile of, or null. Nine coded tiles that
 * are not nine street tiles on the ground, joined to each other, with three
 * or four roads leaving the middles of the sides and none leaving a corner,
 * are no roundabout of either kind: they read as the plain road they are.
 */
export function centredRingAt(x: number, z: number, reader: RingReader): CentredRingFound | null {
  const block = codedBlockOf(x, z, (tx, tz) => reader.codeAt(tx, tz));
  if (!block) return null;
  const legs = intactLegs(block, reader);
  return legs ? { ...block, legs } : null;
}

/** Every centred roundabout that any of `coded` — tiles storing its code — belongs to, each once, by row and then column. */
export function centredRingsAmong(
  coded: Iterable<TilePoint>,
  reader: RingReader,
): CentredRingFound[] {
  const found = new Map<string, CentredRingFound>();
  for (const t of coded) {
    const ring = centredRingAt(t.x, t.z, reader);
    if (ring) found.set(`${ring.z},${ring.x}`, ring);
  }
  return [...found.values()].sort((a, b) => a.z - b.z || a.x - b.x);
}

/**
 * `effectiveControlCode`, reading a centred roundabout too: an intact one's
 * tiles stand for the roundabout control to every neighbour and leg, and a
 * broken block's code is no override at all.
 */
export function ringControlCode(x: number, z: number, reader: RingReader): number {
  if (reader.codeAt(x, z) !== CENTRED_ROUNDABOUT_CODE) return effectiveControlCode(x, z, reader);
  return centredRingAt(x, z, reader) ? ROUNDABOUT_CODE : 0;
}

// --- Geometry ---------------------------------------------------------------

/**
 * The block the compact ring's helpers measure from: one whose own centre is
 * the middle tile's, so a point of the ring is read off the same way.
 */
const frameOf = (block: CentredRing): { x: number; z: number } => ({
  x: block.x + 0.5,
  z: block.z + 0.5,
});

/** The ring's centre, world metres: the middle of the middle tile. */
export function centredRingCentre(block: CentredRing): { x: number; z: number } {
  return { x: (block.x + 1.5) * TILE_METERS, z: (block.z + 1.5) * TILE_METERS };
}

/** The angle about the centre of the line through a tile's centre. */
function tileAngle(block: CentredRing, t: TilePoint): number {
  return Math.atan2(t.z - block.z - 1, t.x - block.x - 1);
}

function wrapAngle(a: number): number {
  let out = a;
  while (out <= -Math.PI) out += 2 * Math.PI;
  while (out > Math.PI) out -= 2 * Math.PI;
  return out;
}

/** Where a tile's routes meet the ring's route, world metres: on the line from the centre through the tile's own. */
export function centredRingPoint(block: CentredRing, t: TilePoint): { x: number; z: number } {
  return ringPoint(frameOf(block), t, RING_ROUTE_RADIUS_M);
}

/** Whether traffic round the ring goes from tile `from` to the next tile `to`: anticlockwise, north up. */
export function centredRunsRound(block: CentredRing, from: TilePoint, to: TilePoint): boolean {
  return wrapAngle(tileAngle(block, to) - tileAngle(block, from)) < 0;
}

/** The line driven round the ring along a run of its outer tiles, in the run's order. */
export function centredRingArc(
  block: CentredRing,
  tiles: readonly TilePoint[],
): { x: number; z: number }[] {
  return ringArc(frameOf(block), tiles, RING_ROUTE_RADIUS_M);
}

/** How far round the ring a run of its outer tiles goes, in tiles, along a car's route. */
export function centredRingRunTiles(block: CentredRing, tiles: readonly TilePoint[]): number {
  let turned = 0;
  for (let i = 1; i < tiles.length; i++) {
    turned += Math.abs(wrapAngle(tileAngle(block, tiles[i]!) - tileAngle(block, tiles[i - 1]!)));
  }
  return ringArcTiles(turned / (Math.PI / 2));
}

// --- Whether one may be laid --------------------------------------------------

export const CENTRED_RING_REFUSALS = {
  corners: 'The corners of a centred roundabout, and a side with no road, must be open ground',
  armBends: 'Each road into a centred roundabout must run straight for two tiles',
  touches:
    'A road beside the block would touch the centred roundabout: only its own roads may meet it',
  touchesRing: 'A centred roundabout may not touch another roundabout',
  notLaid: 'A centred roundabout needs all nine tiles laid as street',
} as const;

export interface CentredRingPlan {
  block: CentredRing;
  /** The block's tiles with no road yet, which the tool lays; none for a block already laid. */
  toLay: TilePoint[];
  /** The roads into it. */
  legs: RoundaboutLeg[];
  /** Why it may not be laid, or null. */
  refusal: string | null;
}

/**
 * The centred roundabout the tool would lay at the junction `at`: the block
 * round the junction's tile, its corners and any side with no road laid as the
 * junction's own street.
 */
export function centredRingAtJunction(at: TilePoint, ground: RoundaboutGround): CentredRingPlan {
  return centredRingPlan({ x: at.x - 1, z: at.z - 1 }, ground, true);
}

/**
 * Whether a centred roundabout may stand on `block`. The worker asks it of a
 * block laid in full; the tool (`laying`), of one it is about to lay, whose
 * corners and any side with no road must still be open ground.
 */
export function centredRingPlan(
  block: CentredRing,
  ground: RoundaboutGround,
  laying = false,
): CentredRingPlan {
  const plan = (refusal: string | null, toLay: TilePoint[] = [], legs: RoundaboutLeg[] = []) => ({
    block,
    toLay,
    legs,
    refusal,
  });
  const tiles = centredRingTiles(block);
  if (!tiles.every((t) => inMap(t.x, t.z))) return plan(ROUNDABOUT_REFUSALS.offMap);
  const mid = centredRingMiddle(block);

  for (const t of tiles) {
    const code = ground.codeAt(t.x, t.z);
    if (code === ROUNDABOUT_CODE || code === CENTRED_ROUNDABOUT_CODE)
      return plan(ROUNDABOUT_REFUSALS.already);
    if (ground.offGridAt(t.x, t.z)) return plan(ROUNDABOUT_REFUSALS.offGrid);
  }
  const middle = ground.roadAt(mid.x, mid.z);
  if (laying) {
    const arms = [NORTH, EAST, SOUTH, WEST].filter((b) => (ground.maskAt(mid.x, mid.z) & b) !== 0);
    if (!middle || !isStreetTier(middle.tier) || arms.length < 3)
      return plan(ROUNDABOUT_REFUSALS.notJunction);
  }

  const toLay: TilePoint[] = [];
  for (const t of tiles) {
    const road = ground.roadAt(t.x, t.z);
    const isMiddle = t.x === mid.x && t.z === mid.z;
    if (!road) {
      if (!laying) return plan(CENTRED_RING_REFUSALS.notLaid);
      if (!ground.buildableAt(t.x, t.z)) return plan(ROUNDABOUT_REFUSALS.inTheWay);
      toLay.push(t);
      continue;
    }
    if (!isStreetTier(road.tier)) return plan(ROUNDABOUT_REFUSALS.railway);
    if (road.elevation > 0 || ground.overRoadAt(t.x, t.z)) return plan(ROUNDABOUT_REFUSALS.raised);
    const refused = roadRefusal(road, false);
    if (refused) return plan(refused);
    // Only the junction's own tile and the middles of its sides may be roads already.
    const sideMiddle = SIDES.some((s) => t.x === mid.x + s.dx && t.z === mid.z + s.dz);
    if (laying && !isMiddle && !sideMiddle) return plan(CENTRED_RING_REFUSALS.corners);
  }

  // Each road into the block runs straight for two tiles: the side's middle tile and the leg's first.
  const legs: RoundaboutLeg[] = [];
  for (const s of SIDES) {
    const from = { x: mid.x + s.dx, z: mid.z + s.dz };
    const tile = { x: from.x + s.dx, z: from.z + s.dz };
    const fromRoad = ground.roadAt(from.x, from.z);
    if (!fromRoad) continue; // a side with no road: laid open ground
    if (laying && (ground.maskAt(mid.x, mid.z) & s.bit) === 0)
      return plan(CENTRED_RING_REFUSALS.touches);
    const out = (ground.maskAt(from.x, from.z) & s.bit) !== 0;
    // A road that stops at the side's middle tile has no leg: the arm is one tile, not two.
    if (!out && laying) return plan(CENTRED_RING_REFUSALS.armBends);
    if (!out) continue;
    if (!inMap(tile.x, tile.z) || !ground.roadAt(tile.x, tile.z))
      return plan(CENTRED_RING_REFUSALS.armBends);
    const leg = ground.roadAt(tile.x, tile.z)!;
    if (!isStreetTier(leg.tier)) return plan(ROUNDABOUT_REFUSALS.railway);
    if (leg.elevation > 0 || ground.overRoadAt(tile.x, tile.z))
      return plan(ROUNDABOUT_REFUSALS.raised);
    const refused = roadRefusal(leg, false);
    if (refused) return plan(refused);
    // Before the corners are laid the side's middle tile is straight too; once they are, it joins them.
    if (
      (laying && (ground.maskAt(from.x, from.z) & ~s.along) !== 0) ||
      (ground.maskAt(tile.x, tile.z) & ~s.along) !== 0
    ) {
      return plan(CENTRED_RING_REFUSALS.armBends);
    }
    legs.push({ from, tile, side: s.side });
  }

  // Nothing but a leg touches the block from outside.
  for (const t of tiles) {
    for (const s of SIDES) {
      const n = { x: t.x + s.dx, z: t.z + s.dz };
      if (inBlock(block, n.x, n.z) || !inMap(n.x, n.z)) continue;
      if (legs.some((l) => l.tile.x === n.x && l.tile.z === n.z)) continue;
      if (
        ground.codeAt(n.x, n.z) === CENTRED_ROUNDABOUT_CODE ||
        ground.codeAt(n.x, n.z) === ROUNDABOUT_CODE
      )
        return plan(CENTRED_RING_REFUSALS.touchesRing);
      if (ground.roadAt(n.x, n.z) || ground.overRoadAt(n.x, n.z))
        return plan(CENTRED_RING_REFUSALS.touches);
    }
  }

  if (!laying) {
    if (!joinedInside(block, ground)) return plan(ROUNDABOUT_REFUSALS.apart);
    const joins = outsideJoins(block, (x, z) => ground.maskAt(x, z));
    if (joins.stray) return plan(CENTRED_RING_REFUSALS.touches);
  }
  if (legs.length < 3) return plan(ROUNDABOUT_REFUSALS.legCount);

  const rise = TILE_METERS * RING_MAX_GRADE;
  for (const t of tiles) {
    for (const [dx, dz] of [
      [1, 0],
      [0, 1],
    ] as const) {
      const n = { x: t.x + dx, z: t.z + dz };
      if (!inBlock(block, n.x, n.z)) continue;
      if (Math.abs(ground.heightAt(t.x, t.z) - ground.heightAt(n.x, n.z)) > rise + 1e-9)
        return plan(ROUNDABOUT_REFUSALS.steep);
    }
  }
  return plan(null, toLay, legs);
}

/**
 * Whether the pointer, at `pointer` in world metres, is over the middle of the
 * junction tile `at` rather than in one of its quarters: strictly inside the
 * zone of the tile's centre on both axes.
 */
export function pointerOnJunctionCentre(at: TilePoint, pointer: { x: number; z: number }): boolean {
  return (
    Math.abs(pointer.x - (at.x + 0.5) * TILE_METERS) < CENTRED_RING_ZONE_M &&
    Math.abs(pointer.z - (at.z + 0.5) * TILE_METERS) < CENTRED_RING_ZONE_M
  );
}

/** The commands that lay `plan` as one batch: its open tiles as the street `tier` on the ground, then the roundabout. */
export function centredRingCommands(
  plan: CentredRingPlan,
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
  return [...road, { kind: 'buildRoundabout', x: plan.block.x, z: plan.block.z, centred: true }];
}
