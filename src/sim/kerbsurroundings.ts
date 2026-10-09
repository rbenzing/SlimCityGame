/**
 * The roads as the sim holds them, read the way the road mesh reads its own
 * copy: the road tiles the worker sends the render thread, the junction
 * controls it sends with them, and the profile table. Handed to the shared
 * kerb layout, it gives the sim exactly the stalls the street paints.
 */
import { armSlot } from '../shared/approach';
import { roadSurroundings, type KerbSurroundings } from '../shared/kerblayout';
import { RoadTier } from '../shared/types';
import type { GraphNode, GridState, RoadProfile, RoadTileDelta } from '../shared/types';
import { ARMS_PER_TILE } from '../world/grid';
import { overRoadStateOf, roadTileOf } from '../world/roads';

/**
 * The kerb surroundings of the grid as it stands now. `nodes` is the road
 * graph's, whose junctions — three arms or more — carry the control the
 * render thread is told; `profileById` is the sim's profile table. It reads
 * each tile once, so build a fresh one after the roads change.
 */
export function gridKerbSurroundings(
  g: GridState,
  nodes: readonly GraphNode[],
  profileById: (id: number) => RoadProfile | null,
): KerbSurroundings {
  const junctions = new Map<number, GraphNode>();
  for (const node of nodes) {
    if (node.edges.length >= 3) junctions.set(node.z * g.size + node.x, node);
  }
  const inBounds = (x: number, z: number): boolean => x >= 0 && z >= 0 && x < g.size && z < g.size;
  const junctionAt = (x: number, z: number): GraphNode | undefined =>
    inBounds(x, z) ? junctions.get(z * g.size + x) : undefined;
  const read = new Map<number, RoadTileDelta | undefined>();
  const roadAt = (x: number, z: number): RoadTileDelta | undefined => {
    if (!inBounds(x, z)) return undefined;
    const idx = z * g.size + x;
    if (read.has(idx)) return read.get(idx);
    const tile = roadTileOf(g, idx);
    const over = overRoadStateOf(g, idx);
    const apart = g.roadSeparate[idx] ?? 0;
    const road =
      tile.tier === RoadTier.None
        ? undefined
        : { ...tile, ...(over ? { over } : {}), ...(apart !== 0 ? { apart } : {}) };
    read.set(idx, road);
    return road;
  };
  return roadSurroundings(
    { roadAt, profileById },
    {
      controlAt: (x, z) => {
        const node = junctionAt(x, z);
        return node ? (node.control ?? 'none') : undefined;
      },
      turnsAt: (x, z) => junctionAt(x, z)?.turns ?? 0,
      laneTurnsAt: (x, z, arm) => {
        const slot = armSlot(arm);
        if (slot === null || !junctionAt(x, z)) return 0;
        return g.junctionLaneTurns[(z * g.size + x) * ARMS_PER_TILE + slot] ?? 0;
      },
    },
  );
}
