/**
 * The compact roundabout rules of `src/shared/roundabout.ts`, read off a grid:
 * the world's own, or the render thread's mirror of it, which carries the
 * same road layers.
 */
import { presetProfileForTier } from '../shared/roadprofile';
import {
  blockTiles,
  compactRoundaboutsAmong,
  ringArc,
  ringArcTiles,
  ringPoint,
  ROUNDABOUT_CODE,
  runsRound,
  type RingReader,
  type RoundaboutBlock,
  type RoundaboutGround,
} from '../shared/roundabout';
import { corridorHalfOf, isStreetTier, RoadTier } from '../shared/types';
import type { GraphEdge, GraphNode, GridState, RoadProfile, TilePoint } from '../shared/types';
import { isRoadBuildable } from './grid';

/** The road layers a roundabout's site is read from. */
export type RoundaboutLayers = Pick<
  GridState,
  | 'size'
  | 'height'
  | 'water'
  | 'roadTier'
  | 'roadMask'
  | 'roadElevation'
  | 'roadProfile'
  | 'roadFlow'
  | 'overTier'
  | 'buildingId'
  | 'roadFootprint'
>;

const inGrid = (g: Pick<GridState, 'size'>, x: number, z: number): boolean =>
  x >= 0 && z >= 0 && x < g.size && z < g.size;

/**
 * A block reader over `g`, with the stored control codes read by `codeAt`:
 * the grid's own layer in the world, and in the mirror the roundabouts the
 * world has said stand there.
 */
export function ringReaderOf(
  g: RoundaboutLayers,
  codeAt: (x: number, z: number) => number,
): RingReader {
  const at = (x: number, z: number): number => z * g.size + x;
  return {
    codeAt: (x, z) => (inGrid(g, x, z) ? codeAt(x, z) : 0),
    groundStreetAt: (x, z) =>
      inGrid(g, x, z) &&
      isStreetTier(g.roadTier[at(x, z)] ?? 0) &&
      (g.roadElevation[at(x, z)] ?? 0) === 0,
    maskAt: (x, z) => (inGrid(g, x, z) ? (g.roadMask[at(x, z)] ?? 0) : 0),
  };
}

/** The world's own block reader: its stored control codes. */
export function gridRingReader(g: GridState): RingReader {
  return ringReaderOf(g, (x, z) => g.junctionControl[z * g.size + x] ?? 0);
}

/**
 * A roundabout's site over `g`. `profileOf` resolves a stored profile id to
 * its cross-section; a tile whose id it cannot resolve reads as its tier's
 * preset, which is what every tile carried before profiles.
 */
export function roundaboutGroundOf(
  g: RoundaboutLayers,
  codeAt: (x: number, z: number) => number,
  profileOf: (id: number) => RoadProfile | null,
): RoundaboutGround {
  const at = (x: number, z: number): number => z * g.size + x;
  return {
    ...ringReaderOf(g, codeAt),
    roadAt: (x, z) => {
      if (!inGrid(g, x, z)) return null;
      const i = at(x, z);
      const tier = (g.roadTier[i] ?? 0) as RoadTier;
      if (tier === RoadTier.None) return null;
      return {
        tier,
        profile: profileOf(g.roadProfile[i] || tier) ?? presetProfileForTier(tier),
        corridor: corridorHalfOf(g.roadFlow[i] ?? 0) !== 'none',
        elevation: g.roadElevation[i] ?? 0,
      };
    },
    overRoadAt: (x, z) => inGrid(g, x, z) && (g.overTier[at(x, z)] ?? 0) !== 0,
    offGridAt: (x, z) => inGrid(g, x, z) && g.roadFootprint[at(x, z)] === 1,
    buildableAt: (x, z) =>
      inGrid(g, x, z) && isRoadBuildable(g, x, z) && (g.buildingId[at(x, z)] ?? 0) === 0,
    heightAt: (x, z) => (inGrid(g, x, z) ? (g.height[at(x, z)] ?? 0) : 0),
  };
}

const keyOf = (t: TilePoint): string => `${t.x},${t.z}`;

/**
 * Shapes the graph round every roundabout in `blocks`. A run whose tiles all
 * lie on one ring is a stretch of it: one lane, driven only the way round the
 * traffic goes, on the circle, as far as the arc it covers. Every other run
 * meeting a corner of a ring ends at that corner's point on the ring, so a car
 * coming in bends onto it rather than driving across the island. Each corner
 * that is a node is marked as one.
 */
export function shapeRoundabouts(
  nodes: GraphNode[],
  edges: GraphEdge[],
  blocks: readonly RoundaboutBlock[],
): void {
  if (blocks.length === 0) return;
  const blockAt = new Map<string, RoundaboutBlock>();
  for (const block of blocks) for (const t of blockTiles(block)) blockAt.set(keyOf(t), block);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  for (const node of nodes) if (blockAt.has(keyOf(node))) node.ring = true;
  const ringOf = (nodeId: number): RoundaboutBlock | undefined => {
    const node = nodeById.get(nodeId);
    return node ? blockAt.get(keyOf(node)) : undefined;
  };

  for (const edge of edges) {
    const tiles = edge.tiles;
    const block = blockAt.get(keyOf(tiles[0]!));
    const onRing =
      block !== undefined &&
      tiles.length >= 2 &&
      tiles.every((t) => blockAt.get(keyOf(t)) === block);
    if (onRing) {
      const forward = runsRound(block, tiles[0]!, tiles[1]!);
      edge.lanes = 1;
      edge.lanesAtoB = forward ? 1 : 0;
      edge.lanesBtoA = forward ? 0 : 1;
      edge.forwardAtoB = forward;
      delete edge.pocketAtoB;
      delete edge.pocketBtoA;
      edge.circulating = true;
      edge.route = ringArc(block, tiles);
      edge.length = ringArcTiles(tiles.length - 1);
      continue;
    }
    const route = edge.route;
    if (!route || route.length === 0) continue;
    const atA = ringOf(edge.a);
    if (atA) route[0] = ringPoint(atA, tiles[0]!);
    const atB = ringOf(edge.b);
    if (atB) route[route.length - 1] = ringPoint(atB, tiles[tiles.length - 1]!);
  }
}

/** Every compact roundabout on the world's grid, by row and then column. */
export function compactRoundaboutsIn(g: GridState): RoundaboutBlock[] {
  const coded: TilePoint[] = [];
  for (let i = 0; i < g.junctionControl.length; i++) {
    if (g.junctionControl[i] === ROUNDABOUT_CODE)
      coded.push({ x: i % g.size, z: Math.floor(i / g.size) });
  }
  return compactRoundaboutsAmong(coded, gridRingReader(g));
}
