/**
 * The cul-de-sac rules of `src/shared/culdesac.ts`, read off the world's grid
 * and laid into its road graph.
 */
import {
  CUL_DE_SAC_CODE,
  culDeSacArc,
  culDeSacArcTiles,
  culDeSacPoint,
  culDeSacsAmong,
  loopRunsRound,
  type CulDeSac,
} from '../shared/culdesac';
import { blockTiles } from '../shared/roundabout';
import type { GraphEdge, GraphNode, GridState, TilePoint } from '../shared/types';
import { gridRingReader } from './roundabouts';

const keyOf = (t: TilePoint): string => `${t.x},${t.z}`;

/** Every cul-de-sac on the world's grid, by row and then column. */
export function culDeSacsIn(g: GridState): CulDeSac[] {
  const coded: TilePoint[] = [];
  for (let i = 0; i < g.junctionControl.length; i++) {
    if (g.junctionControl[i] === CUL_DE_SAC_CODE)
      coded.push({ x: i % g.size, z: Math.floor(i / g.size) });
  }
  return culDeSacsAmong(coded, gridRingReader(g));
}

/** How far outside a block's tiles a trip's end still counts as a home round its circle, in tiles. */
const HOME_REACH_TILES = 3;

const inBlock = (cul: CulDeSac, t: TilePoint): boolean =>
  t.x >= cul.x && t.x <= cul.x + 1 && t.z >= cul.z && t.z <= cul.z + 1;

/**
 * Carries a path whose end lies round a cul-de-sac on round it. The graph ends
 * such a path at the street's mouth; the car then drives on round the circle,
 * the way traffic goes, to the corner nearest the end it is bound for, or
 * starts at the corner nearest the end it leaves and drives round to the mouth.
 * Returns the path's route with those laps added.
 */
export function routeRoundCulDeSacs(
  route: readonly { x: number; z: number }[],
  nodeIds: readonly number[],
  from: TilePoint,
  to: TilePoint,
  edges: readonly GraphEdge[],
  culs: readonly CulDeSac[],
): { x: number; z: number }[] {
  let out = [...route];
  const first = nodeIds[0];
  const last = nodeIds[nodeIds.length - 1];
  if (culs.length === 0 || first === undefined || last === undefined || nodeIds.length < 2) {
    return out;
  }
  /** The circle a trip's end at `nodeId` lies round, and the corner it is nearest, in driving order. */
  const lapOf = (
    nodeId: number,
    end: TilePoint,
  ): { cul: CulDeSac; drive: TilePoint[]; corner: number } | null => {
    for (const cul of culs) {
      const near =
        end.x >= cul.x - HOME_REACH_TILES &&
        end.x <= cul.x + 1 + HOME_REACH_TILES &&
        end.z >= cul.z - HOME_REACH_TILES &&
        end.z <= cul.z + 1 + HOME_REACH_TILES;
      if (!near) continue;
      const loop = edges.find(
        (e) => e.a === nodeId && e.b === nodeId && e.tiles.every((t) => inBlock(cul, t)),
      );
      if (!loop) continue;
      const drive = loopRunsRound(cul, loop.tiles) ? loop.tiles : [...loop.tiles].reverse();
      let corner = 0;
      let best = Infinity;
      for (let i = 0; i < drive.length - 1; i++) {
        const t = drive[i]!;
        const d = (t.x - end.x) ** 2 + (t.z - end.z) ** 2;
        if (d < best) {
          best = d;
          corner = i;
        }
      }
      return { cul, drive, corner };
    }
    return null;
  };
  const arrival = lapOf(last, to);
  if (arrival && arrival.corner > 0) {
    const lap = culDeSacArc(arrival.cul, arrival.drive.slice(0, arrival.corner + 1));
    out = [...out, ...lap.slice(1)];
  }
  const departure = lapOf(first, from);
  if (departure && departure.corner > 0) {
    const lap = culDeSacArc(departure.cul, departure.drive.slice(departure.corner));
    out = [...lap, ...out.slice(1)];
  }
  return out;
}

/**
 * Shapes the graph round every cul-de-sac in `culs`. The run that goes round
 * the block and back to the corner its street joins is one lane, driven only
 * the way round the traffic goes, on a circle inside the kerb. The street's own
 * run ends at that corner's point on the circle, so a car coming in bends onto
 * it rather than driving to a tile centre, which lies on the kerb.
 */
export function shapeCulDeSacs(
  nodes: GraphNode[],
  edges: GraphEdge[],
  culs: readonly CulDeSac[],
): void {
  if (culs.length === 0) return;
  const blockAt = new Map<string, CulDeSac>();
  for (const c of culs) for (const t of blockTiles(c)) blockAt.set(keyOf(t), c);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const culOf = (nodeId: number): CulDeSac | undefined => {
    const node = nodeById.get(nodeId);
    return node ? blockAt.get(keyOf(node)) : undefined;
  };

  for (const edge of edges) {
    const tiles = edge.tiles;
    const cul = blockAt.get(keyOf(tiles[0]!));
    const inside = cul !== undefined && tiles.every((t) => blockAt.get(keyOf(t)) === cul);
    if (inside && tiles.length >= 2) {
      const forward = loopRunsRound(cul, tiles);
      edge.lanes = 1;
      edge.lanesAtoB = forward ? 1 : 0;
      edge.lanesBtoA = forward ? 0 : 1;
      edge.forwardAtoB = forward;
      delete edge.pocketAtoB;
      delete edge.pocketBtoA;
      edge.route = culDeSacArc(cul, tiles);
      edge.length = culDeSacArcTiles(tiles.length - 1);
      continue;
    }
    const route = edge.route;
    if (!route || route.length === 0) continue;
    const atA = culOf(edge.a);
    if (atA) route[0] = culDeSacPoint(atA, tiles[0]!);
    const atB = culOf(edge.b);
    if (atB) route[route.length - 1] = culDeSacPoint(atB, tiles[tiles.length - 1]!);
  }
}
