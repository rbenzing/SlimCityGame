import { describe, expect, it } from 'vitest';
import { codeForControl } from '../shared/junction';
import { blockTiles, ringPoint, runsRound } from '../shared/roundabout';
import { RoadTier } from '../shared/types';
import type { GraphEdge, GraphNode, GridState, TilePoint } from '../shared/types';
import { createGrid } from './grid';
import { junctionDelay, turnAllowed } from './pathfind';
import { RoadNetwork } from './roadgraph';
import { applyRoad } from './roads';
import { compactRoundaboutsIn } from './roundabouts';

const row = (z: number, from: number, to: number): TilePoint[] =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ x: from + i, z }));
const column = (x: number, from: number, to: number): TilePoint[] =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ x, z: from + i }));

const BLOCK = { x: 10, z: 10 };

/** A crossroads at (10, 10) with the block south-east of it made a roundabout. */
function roundabout(coded = true): GridState {
  const g = createGrid(21);
  applyRoad(g, row(10, 2, 18), RoadTier.TwoLane);
  applyRoad(g, column(10, 2, 18), RoadTier.TwoLane);
  applyRoad(g, [{ x: 11, z: 11 }], RoadTier.TwoLane);
  if (coded) {
    for (const t of blockTiles(BLOCK))
      g.junctionControl[t.z * g.size + t.x] = codeForControl('roundabout');
  }
  return g;
}

function graph(g: GridState): { nodes: readonly GraphNode[]; edges: readonly GraphEdge[] } {
  const net = new RoadNetwork();
  net.rebuild(g);
  return { nodes: net.getNodes(), edges: net.getEdges() };
}

const inBlock = (t: TilePoint): boolean =>
  t.x >= BLOCK.x && t.x <= BLOCK.x + 1 && t.z >= BLOCK.z && t.z <= BLOCK.z + 1;

describe('the graph round a compact roundabout', () => {
  it('finds the roundabout only where all four tiles carry the control', () => {
    expect(compactRoundaboutsIn(roundabout())).toEqual([BLOCK]);
    expect(compactRoundaboutsIn(roundabout(false))).toEqual([]);
  });

  it('makes each stretch of the ring one lane, driven only the way round it goes, on the arc', () => {
    const { edges } = graph(roundabout());
    const ring = edges.filter((e) => e.circulating);
    // Three corners have a road into them; the south-east one has none, so
    // the ring runs on round it, and one stretch is two quarters long.
    expect(ring).toHaveLength(3);
    expect(ring.map((e) => e.tiles.length).sort()).toEqual([2, 2, 3]);
    for (const e of ring) {
      expect(e.tiles.every(inBlock)).toBe(true);
      expect(e.lanes).toBe(1);
      const forward = runsRound(BLOCK, e.tiles[0]!, e.tiles[1]!);
      expect(e.lanesAtoB).toBe(forward ? 1 : 0);
      expect(e.lanesBtoA).toBe(forward ? 0 : 1);
      // Longer than the tile it crosses, as the quarter circle is.
      expect(e.length).toBeGreaterThan(1);
      expect(e.route![0]).toEqual(ringPoint(BLOCK, e.tiles[0]!));
    }
  });

  it('ends every road into it at its corner’s point on the ring, not across the island', () => {
    const { nodes, edges } = graph(roundabout());
    const corner = nodes.find((n) => n.x === 10 && n.z === 10)!;
    expect(corner.ring).toBe(true);
    const legs = edges.filter((e) => !e.circulating && (e.a === corner.id || e.b === corner.id));
    expect(legs).toHaveLength(2);
    for (const e of legs) {
      const end = e.a === corner.id ? e.route![0] : e.route![e.route!.length - 1];
      expect(end).toEqual(ringPoint(BLOCK, { x: 10, z: 10 }));
    }
  });

  it('charges the roundabout’s delay to a driver coming in, and nothing to one going round', () => {
    const { nodes, edges } = graph(roundabout());
    const byId = (id: number): GraphEdge | undefined => edges.find((e) => e.id === id);
    const corner = nodes.find((n) => n.x === 10 && n.z === 10)!;
    expect(corner.control).toBe('roundabout');
    const at = corner.edges.map((id) => byId(id)!);
    const ringIn = at.find(
      (e) => e.circulating && (e.a === corner.id ? e.lanesBtoA : e.lanesAtoB) === 1,
    )!;
    const ringOut = at.find((e) => e.circulating && e !== ringIn)!;
    const leg = at.find((e) => !e.circulating)!;
    expect(junctionDelay(corner, ringIn, ringOut, byId)).toBe(0);
    expect(junctionDelay(corner, leg, ringOut, byId)).toBeGreaterThan(0);
  });

  it('holds a driver coming in longer the busier the ring is going past', () => {
    const { nodes, edges } = graph(roundabout());
    const byId = (id: number): GraphEdge | undefined => edges.find((e) => e.id === id);
    const corner = nodes.find((n) => n.x === 10 && n.z === 10)!;
    const at = corner.edges.map((id) => byId(id)!);
    const ringIn = at.find(
      (e) => e.circulating && (e.a === corner.id ? e.lanesBtoA : e.lanesAtoB) === 1,
    )!;
    const ringOut = at.find((e) => e.circulating && e !== ringIn)!;
    const leg = at.find((e) => !e.circulating)!;
    const delayWith = (into: number, outOf: number): number => {
      for (const e of edges) e.volume = 0;
      leg.volume = 300;
      ringIn.volume = into;
      ringOut.volume = outOf;
      return junctionDelay(corner, leg, ringOut, byId);
    };
    const empty = delayWith(0, 0);
    const busy = delayWith(400, 400);
    expect(busy).toBeGreaterThan(empty);
    // Ring traffic all leaving at this corner passes nobody coming in.
    expect(delayWith(400, 0)).toBeCloseTo(empty, 9);
    // Nor does traffic only joining here, which is this leg's own.
    expect(delayWith(0, 400)).toBeCloseTo(empty, 9);
  });

  it('lets a corner’s two roads into each other only the short way, a right turn', () => {
    const { nodes, edges } = graph(roundabout());
    const corner = nodes.find((n) => n.x === 10 && n.z === 10)!;
    const at = corner.edges.map((id) => edges.find((e) => e.id === id)!);
    const toward = (dx: number, dz: number): GraphEdge =>
      at.find((e) => {
        const next = e.a === corner.id ? e.tiles[1]! : e.tiles[e.tiles.length - 2]!;
        return next.x - corner.x === dx && next.z - corner.z === dz;
      })!;
    const westLeg = toward(-1, 0);
    const northLeg = toward(0, -1);
    // In from the north, out to the west: a right turn, a quarter of a turn
    // the way the ring goes. In from the west, out to the north: the long way.
    expect(turnAllowed(corner, northLeg, westLeg)).toBe(true);
    expect(turnAllowed(corner, westLeg, northLeg)).toBe(false);
  });
});

describe('a mini roundabout’s entry gives way to what goes round it', () => {
  /** A crossroads at (10, 10) made a one-tile roundabout. */
  function mini(): { node: GraphNode; edges: readonly GraphEdge[] } {
    const g = createGrid(21);
    applyRoad(g, row(10, 2, 18), RoadTier.TwoLane);
    applyRoad(g, column(10, 2, 18), RoadTier.TwoLane);
    g.junctionControl[10 * g.size + 10] = codeForControl('roundabout');
    const { nodes, edges } = graph(g);
    return { node: nodes.find((n) => n.x === 10 && n.z === 10)!, edges };
  }
  /** The arm of the crossroads lying (dx, dz) from its centre. */
  const arm = (node: GraphNode, edges: readonly GraphEdge[], dx: number, dz: number): GraphEdge =>
    edges.find((e) => {
      if (e.a !== node.id && e.b !== node.id) return false;
      const next = e.a === node.id ? e.tiles[1]! : e.tiles[e.tiles.length - 2]!;
      return next.x - node.x === dx && next.z - node.z === dz;
    })!;

  it('is a roundabout of one tile, with no ring of its own', () => {
    const { node, edges } = mini();
    expect(node.control).toBe('roundabout');
    expect(edges.some((e) => e.circulating)).toBe(false);
  });

  it('waits longer for traffic from the leg upstream, and not at all for the one downstream', () => {
    const { node, edges } = mini();
    const byId = (id: number): GraphEdge | undefined => edges.find((e) => e.id === id);
    const west = arm(node, edges, -1, 0);
    const east = arm(node, edges, 1, 0);
    // Anticlockwise, the ring reaches the west entry from the north and runs
    // on to the south: the north leg is upstream of it, the south downstream.
    const north = arm(node, edges, 0, -1);
    const south = arm(node, edges, 0, 1);
    const delayWith = (busy: GraphEdge | null): number => {
      for (const e of edges) e.volume = 0;
      west.volume = 300;
      if (busy) busy.volume = 800;
      return junctionDelay(node, west, east, byId);
    };
    const quiet = delayWith(null);
    expect(delayWith(north)).toBeGreaterThan(delayWith(east));
    expect(delayWith(east)).toBeGreaterThan(quiet);
    expect(delayWith(south)).toBeCloseTo(quiet, 9);
  });
});
