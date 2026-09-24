import { describe, expect, it } from 'vitest';
import { isRailTier, RoadFlow, RoadTier, ZoneType } from '../shared/types';
import type { GraphEdge, GridState, RoadProfile, TilePoint } from '../shared/types';
import {
  applyRoad,
  computeMask,
  computeOverMask,
  recomputeRoadMasks,
  removeRoad,
  roadStep,
} from './roads';
import { RoadNetwork } from './roadgraph';
import { createGrid } from './grid';

function makeGrid(size: number): GridState {
  return createGrid(size);
}

function idx(size: number, x: number, z: number): number {
  return z * size + x;
}

const row = (z: number, from: number, to: number): TilePoint[] =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ x: from + i, z }));
const column = (x: number, from: number, to: number): TilePoint[] =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ x, z: from + i }));

describe('computeMask', () => {
  it('is 0 for an isolated tile with no road neighbors', () => {
    const g = makeGrid(10);
    g.roadTier[idx(10, 5, 5)] = RoadTier.TwoLane;
    expect(computeMask(g, 5, 5)).toBe(0);
  });

  it('reads an L shape correctly', () => {
    const size = 10;
    const g = makeGrid(size);
    for (const [x, z] of [
      [4, 4],
      [4, 5],
      [4, 6],
      [5, 6],
      [6, 6],
    ] as const) {
      g.roadTier[idx(size, x, z)] = RoadTier.TwoLane;
    }
    expect(computeMask(g, 4, 4)).toBe(4); // S only
    expect(computeMask(g, 4, 5)).toBe(1 | 4); // N|S (straight run)
    expect(computeMask(g, 4, 6)).toBe(1 | 2); // N|E (the corner)
    expect(computeMask(g, 5, 6)).toBe(8 | 2); // W|E
    expect(computeMask(g, 6, 6)).toBe(8); // W only
  });

  it('does not read the other half of a corridor as an arm joining it', () => {
    // A six-lane road laid as two carriageways side by side, running
    // north-south: the near half in column 4, the far half in column 5. Each
    // tile's only real neighbours are the ones ahead of and behind it.
    const size = 10;
    const g = makeGrid(size);
    const SOUTH = RoadFlow.South;
    const CORRIDOR = 0b1000;
    const CORRIDOR_RIGHT = 0b1_0000;
    for (let z = 4; z <= 6; z++) {
      for (const [x, flow] of [
        [4, SOUTH | CORRIDOR],
        [5, SOUTH | CORRIDOR | CORRIDOR_RIGHT],
      ] as const) {
        const i = idx(size, x, z);
        g.roadTier[i] = RoadTier.Avenue;
        g.roadProfile[i] = 40;
        g.roadFlow[i] = flow;
      }
    }
    // Without this the middle of a six-lane road reads as a crossroads, and
    // the mesh strips its lane markings for a junction that is not there.
    expect(computeMask(g, 4, 5)).toBe(1 | 4); // N|S — a straight run, not a T
    expect(computeMask(g, 5, 5)).toBe(1 | 4);
    expect(computeMask(g, 4, 4)).toBe(4); // the near half's first tile: S only
    expect(computeMask(g, 5, 6)).toBe(1); // the far half's last tile: N only
  });

  it('still reads a road that really does join a corridor', () => {
    const size = 10;
    const g = makeGrid(size);
    for (let z = 4; z <= 6; z++) {
      for (const [x, flow] of [
        [4, RoadFlow.South | 0b1000],
        [5, RoadFlow.South | 0b1000 | 0b1_0000],
      ] as const) {
        const i = idx(size, x, z);
        g.roadTier[i] = RoadTier.Avenue;
        g.roadProfile[i] = 40;
        g.roadFlow[i] = flow;
      }
    }
    // A plain street arriving from the west carries no corridor flag, so it is
    // an arm and the tile it meets is a junction.
    g.roadTier[idx(size, 3, 5)] = RoadTier.TwoLane;
    expect(computeMask(g, 4, 5)).toBe(1 | 4 | 8); // N|S|W
  });

  it('reads a T shape correctly', () => {
    const size = 10;
    const g = makeGrid(size);
    for (const [x, z] of [
      [5, 4],
      [5, 5],
      [5, 6],
      [6, 5],
    ] as const) {
      g.roadTier[idx(size, x, z)] = RoadTier.TwoLane;
    }
    expect(computeMask(g, 5, 5)).toBe(1 | 4 | 2); // center: N|S|E
    expect(computeMask(g, 5, 4)).toBe(4); // top arm points S back to center
    expect(computeMask(g, 5, 6)).toBe(1); // bottom arm points N back to center
    expect(computeMask(g, 6, 5)).toBe(8); // right arm points W back to center
  });

  it('reads a 4-way cross correctly', () => {
    const size = 10;
    const g = makeGrid(size);
    for (const [x, z] of [
      [5, 5],
      [5, 4],
      [5, 6],
      [6, 5],
      [4, 5],
    ] as const) {
      g.roadTier[idx(size, x, z)] = RoadTier.TwoLane;
    }
    expect(computeMask(g, 5, 5)).toBe(1 | 2 | 4 | 8);
    expect(computeMask(g, 5, 4)).toBe(4);
    expect(computeMask(g, 5, 6)).toBe(1);
    expect(computeMask(g, 6, 5)).toBe(8);
    expect(computeMask(g, 4, 5)).toBe(2);
  });

  it('ignores out-of-bounds neighbors', () => {
    const g = makeGrid(5);
    g.roadTier[idx(5, 0, 0)] = RoadTier.TwoLane;
    expect(computeMask(g, 0, 0)).toBe(0);
  });

  it('runs rail straight through a street it cuts, and ends the street at it', () => {
    const size = 10;
    const g = makeGrid(size);
    for (let x = 2; x <= 8; x++) g.roadTier[idx(size, x, 5)] = RoadTier.RailTrack;
    for (const z of [3, 4, 6, 7]) g.roadTier[idx(size, 5, z)] = RoadTier.TwoLane;
    expect(computeMask(g, 5, 5)).toBe(2 | 8); // E|W — track, not a crossroads
    expect(computeMask(g, 5, 4)).toBe(1); // N only — the street stops at the rail
    expect(computeMask(g, 5, 6)).toBe(4); // S only
  });

  it('still joins tram track to the street it meets, because tram track is a street', () => {
    const size = 10;
    const g = makeGrid(size);
    for (let x = 2; x <= 8; x++) g.roadTier[idx(size, x, 5)] = RoadTier.Tram;
    for (const z of [4, 6]) g.roadTier[idx(size, 5, z)] = RoadTier.TwoLane;
    expect(computeMask(g, 5, 5)).toBe(1 | 2 | 4 | 8);
  });
});

describe('recomputeRoadMasks', () => {
  it('rewrites every stored mask from the rules, whatever the save held', () => {
    const size = 10;
    const g = makeGrid(size);
    for (let x = 2; x <= 8; x++) g.roadTier[idx(size, x, 5)] = RoadTier.RailTrack;
    for (const z of [4, 6]) g.roadTier[idx(size, 5, z)] = RoadTier.TwoLane;
    g.roadMask.fill(15);
    recomputeRoadMasks(g);
    expect(g.roadMask[idx(size, 5, 5)]).toBe(2 | 8);
    expect(g.roadMask[idx(size, 5, 4)]).toBe(0);
    expect(g.roadMask[idx(size, 2, 5)]).toBe(2);
    expect(g.roadMask[idx(size, 0, 0)]).toBe(0); // no road, no mask
  });
});

describe('a motorway carriageway keeps to itself', () => {
  const SIZE = 20;

  /** Lays a run the way a drag lays one: every tile pointing the way it went. */
  const layRun = (
    g: GridState,
    tiles: TilePoint[],
    flow: RoadFlow,
    tier: RoadTier = RoadTier.Highway,
  ): void => {
    applyRoad(
      g,
      tiles,
      tier,
      undefined,
      tier,
      false,
      tiles.map(() => flow),
    );
  };

  const edgeAt = (net: RoadNetwork, t: TilePoint): GraphEdge => {
    const found = net.getEdges().find((e) => e.tiles.some((u) => u.x === t.x && u.z === t.z));
    if (!found) throw new Error(`no graph edge covers ${t.x},${t.z}`);
    return found;
  };

  /** Whether the graph offers any way at all to drive from one tile to the other. */
  const reaches = (net: RoadNetwork, from: TilePoint, to: TilePoint): boolean => {
    const start = edgeAt(net, from);
    const target = edgeAt(net, to);
    if (start.id === target.id) return true;
    const nodes = net.getNodes();
    const edges = net.getEdges();
    const seen = new Set<number>();
    const queue = [start.a, start.b];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const edgeId of nodes[id]!.edges) {
        if (edgeId === target.id) return true;
        const edge = edges[edgeId]!;
        queue.push(edge.a, edge.b);
      }
    }
    return false;
  };

  /** Two carriageways on adjacent columns, drawn against each other. */
  const twoCarriageways = (): GridState => {
    const g = makeGrid(SIZE);
    layRun(g, column(4, 2, 8), RoadFlow.South);
    layRun(g, column(5, 2, 8), RoadFlow.North);
    return g;
  };

  it('does not read the carriageway beside it as an arm', () => {
    const g = twoCarriageways();
    expect(computeMask(g, 4, 5)).toBe(1 | 4); // N|S — the run, and nothing east of it
    expect(computeMask(g, 5, 5)).toBe(1 | 4);
    expect(computeMask(g, 4, 2)).toBe(4); // the first tile of a run: S only
    expect(computeMask(g, 5, 8)).toBe(1);
  });

  it('leaves no way to drive from one carriageway into the other', () => {
    const net = new RoadNetwork();
    net.rebuild(twoCarriageways());
    // One edge each, end to end, and no third edge across the pair.
    expect(net.getEdges()).toHaveLength(2);
    expect(reaches(net, { x: 4, z: 5 }, { x: 5, z: 5 })).toBe(false);
    expect(reaches(net, { x: 4, z: 2 }, { x: 4, z: 8 })).toBe(true);
  });

  it('lets a ramp alongside join where it starts and where it ends, which is the only way on', () => {
    // A ramp laid beside the motorway the way it runs leaves it at its first
    // tile and rejoins it at its last; in between it is its own road.
    const g = makeGrid(SIZE);
    layRun(g, column(4, 2, 8), RoadFlow.South);
    layRun(g, column(5, 4, 6), RoadFlow.South, RoadTier.Ramp);
    expect(computeMask(g, 4, 4)).toBe(1 | 2 | 4); // N|S|E — the diverge
    expect(computeMask(g, 4, 5)).toBe(1 | 4); // beside the ramp's middle: its own road
    expect(computeMask(g, 4, 6)).toBe(1 | 2 | 4); // N|S|E — the merge
    expect(computeMask(g, 5, 5)).toBe(1 | 4);
    const net = new RoadNetwork();
    net.rebuild(g);
    expect(reaches(net, { x: 4, z: 2 }, { x: 5, z: 5 })).toBe(true);
  });

  it('still joins a motorway that meets it end on', () => {
    const g = makeGrid(SIZE);
    layRun(g, row(3, 2, 5), RoadFlow.East);
    layRun(g, row(3, 6, 9), RoadFlow.East); // a second drag, straight on
    expect(computeMask(g, 5, 3)).toBe(2 | 8);
    expect(computeMask(g, 6, 3)).toBe(2 | 8);
    const net = new RoadNetwork();
    net.rebuild(g);
    expect(reaches(net, { x: 2, z: 3 }, { x: 9, z: 3 })).toBe(true);
  });

  it('still joins a motorway arriving at right angles, which is a junction', () => {
    // The arriving run points AT the tile it meets. Only a pair that each read
    // the other as beside them is two carriageways rather than a junction.
    const g = makeGrid(SIZE);
    layRun(g, row(5, 2, 8), RoadFlow.East);
    layRun(g, column(6, 2, 4), RoadFlow.South); // stops one short of the run
    expect(computeMask(g, 6, 5)).toBe(1 | 2 | 8); // N|E|W — a T
    expect(computeMask(g, 6, 4)).toBe(1 | 4);
    const net = new RoadNetwork();
    net.rebuild(g);
    expect(reaches(net, { x: 6, z: 2 }, { x: 2, z: 5 })).toBe(true);
  });

  it('leaves every other class alone: two one-way streets side by side still meet', () => {
    const g = makeGrid(SIZE);
    layRun(g, column(4, 2, 8), RoadFlow.South, RoadTier.OneWay);
    layRun(g, column(5, 2, 8), RoadFlow.North, RoadTier.OneWay);
    expect(computeMask(g, 4, 5)).toBe(1 | 2 | 4);
    const net = new RoadNetwork();
    net.rebuild(g);
    expect(reaches(net, { x: 4, z: 5 }, { x: 5, z: 5 })).toBe(true);
  });

  it('leaves a corridor alone: its two halves are one road, not two carriageways', () => {
    const size = SIZE;
    const g = makeGrid(size);
    for (let z = 4; z <= 8; z++) {
      for (const [x, flow] of [
        [4, RoadFlow.South | 0b1000],
        [5, RoadFlow.South | 0b1000 | 0b1_0000],
      ] as const) {
        const i = idx(size, x, z);
        g.roadTier[i] = RoadTier.Avenue;
        g.roadProfile[i] = 40;
        g.roadFlow[i] = flow;
        g.roadMask[i] = computeMask(g, x, z);
      }
    }
    expect(computeMask(g, 4, 6)).toBe(1 | 4);
    const net = new RoadNetwork();
    net.rebuild(g);
    expect(net.getEdges()).toHaveLength(2); // one per half, end to end
    expect(reaches(net, { x: 4, z: 6 }, { x: 5, z: 6 })).toBe(false);
  });
});

describe('applyRoad', () => {
  it('sets tier on new tiles and returns deltas with correct masks for a straight run', () => {
    const size = 10;
    const g = makeGrid(size);
    const deltas = applyRoad(
      g,
      [
        { x: 2, z: 5 },
        { x: 3, z: 5 },
        { x: 4, z: 5 },
      ],
      RoadTier.TwoLane,
    );

    expect(deltas.length).toBe(3);
    const byX = new Map(deltas.map((d) => [d.x, d]));
    const two = RoadTier.TwoLane;
    expect(byX.get(2)).toEqual({
      x: 2,
      z: 5,
      tier: two,
      mask: 2,
      elevation: 0,
      profile: two,
      flow: RoadFlow.None,
    }); // E only
    expect(byX.get(3)).toEqual({
      x: 3,
      z: 5,
      tier: two,
      mask: 8 | 2,
      elevation: 0,
      profile: two,
      flow: RoadFlow.None,
    }); // W|E
    expect(byX.get(4)).toEqual({
      x: 4,
      z: 5,
      tier: two,
      mask: 8,
      elevation: 0,
      profile: two,
      flow: RoadFlow.None,
    }); // W only

    expect(g.roadTier[idx(size, 3, 5)]).toBe(RoadTier.TwoLane);
    expect(g.roadMask[idx(size, 3, 5)]).toBe(8 | 2);
  });

  it('lays a composed profile under its nearest tier, and replaces a same-tier road only when the profile differs', () => {
    const size = 10;
    const g = makeGrid(size);
    const tile = [{ x: 5, z: 5 }];
    const i = idx(size, 5, 5);

    // A composed local street: preset tier 1 as its nearest, id 12 as itself.
    const laid = applyRoad(g, tile, RoadTier.TwoLane, undefined, 12);
    expect(laid).toHaveLength(1);
    expect(laid[0]!.profile).toBe(12);
    expect(g.roadProfile[i]).toBe(12);
    expect(g.roadTier[i]).toBe(RoadTier.TwoLane);

    // The same profile again is a no-op, not a rebuild.
    expect(applyRoad(g, tile, RoadTier.TwoLane, undefined, 12)).toHaveLength(0);

    // A different composition of the same tier replaces it.
    const swapped = applyRoad(g, tile, RoadTier.TwoLane, undefined, 13);
    expect(swapped).toHaveLength(1);
    expect(g.roadProfile[i]).toBe(13);

    // A higher tier lands with its own profile...
    expect(applyRoad(g, tile, RoadTier.Avenue, undefined, 15)).toHaveLength(1);
    expect(g.roadProfile[i]).toBe(15);
    expect(g.roadTier[i]).toBe(RoadTier.Avenue);
    // ...and dropping back to a lower tier is still refused, profile and all.
    expect(applyRoad(g, tile, RoadTier.TwoLane, undefined, 14)).toHaveLength(0);
    expect(g.roadProfile[i]).toBe(15);

    // A preset lands as its own tier id.
    applyRoad(g, [{ x: 6, z: 5 }], RoadTier.Avenue);
    expect(g.roadProfile[idx(size, 6, 5)]).toBe(RoadTier.Avenue);
  });

  it('rejects a downgrade on a per-tile basis, leaving the higher tier intact', () => {
    const size = 10;
    const g = makeGrid(size);
    applyRoad(g, [{ x: 5, z: 5 }], RoadTier.Highway);
    expect(g.roadTier[idx(size, 5, 5)]).toBe(RoadTier.Highway);

    const deltas = applyRoad(g, [{ x: 5, z: 5 }], RoadTier.TwoLane);

    expect(deltas).toEqual([]);
    expect(g.roadTier[idx(size, 5, 5)]).toBe(RoadTier.Highway);
  });

  it('allows an upgrade and reflects the new tier in the returned delta', () => {
    const size = 10;
    const g = makeGrid(size);
    applyRoad(g, [{ x: 5, z: 5 }], RoadTier.TwoLane);

    const deltas = applyRoad(g, [{ x: 5, z: 5 }], RoadTier.Avenue);

    expect(deltas.length).toBe(1);
    expect(deltas[0]!.tier).toBe(RoadTier.Avenue);
    expect(g.roadTier[idx(size, 5, 5)]).toBe(RoadTier.Avenue);
  });

  it('clears zone on tiles it builds road over', () => {
    const size = 10;
    const g = makeGrid(size);
    g.zone[idx(size, 5, 5)] = ZoneType.ResLow;

    applyRoad(g, [{ x: 5, z: 5 }], RoadTier.TwoLane);

    expect(g.zone[idx(size, 5, 5)]).toBe(ZoneType.None);
  });

  it('clears zone even on a rejected (already-higher-tier) tile', () => {
    const size = 10;
    const g = makeGrid(size);
    applyRoad(g, [{ x: 5, z: 5 }], RoadTier.Highway);
    g.zone[idx(size, 5, 5)] = ZoneType.ComLow; // hand-inject a stray zone value

    applyRoad(g, [{ x: 5, z: 5 }], RoadTier.TwoLane); // rejected upgrade

    expect(g.zone[idx(size, 5, 5)]).toBe(ZoneType.None);
  });

  it('reports a mask change on an existing neighbor tile that was not part of this call', () => {
    const size = 10;
    const g = makeGrid(size);
    const first = applyRoad(g, [{ x: 5, z: 5 }], RoadTier.TwoLane);
    expect(first).toEqual([
      {
        x: 5,
        z: 5,
        tier: RoadTier.TwoLane,
        mask: 0,
        elevation: 0,
        profile: RoadTier.TwoLane,
        flow: RoadFlow.None,
      },
    ]);

    const second = applyRoad(g, [{ x: 6, z: 5 }], RoadTier.TwoLane);
    const byXZ = new Map(second.map((d) => [`${d.x},${d.z}`, d]));

    expect(second.length).toBe(2);
    const two = RoadTier.TwoLane;
    expect(byXZ.get('6,5')).toEqual({
      x: 6,
      z: 5,
      tier: two,
      mask: 8,
      elevation: 0,
      profile: two,
      flow: RoadFlow.None,
    }); // W
    expect(byXZ.get('5,5')).toEqual({
      x: 5,
      z: 5,
      tier: two,
      mask: 2,
      elevation: 0,
      profile: two,
      flow: RoadFlow.None,
    }); // E, updated though untouched
  });

  it('ignores out-of-bounds tiles', () => {
    const g = makeGrid(5);
    const deltas = applyRoad(
      g,
      [
        { x: -1, z: 0 },
        { x: 100, z: 100 },
      ],
      RoadTier.TwoLane,
    );
    expect(deltas).toEqual([]);
  });
});

describe('removeRoad', () => {
  it('zeroes tier and mask on removed tiles and fixes neighbor masks', () => {
    const size = 10;
    const g = makeGrid(size);
    applyRoad(
      g,
      [
        { x: 2, z: 5 },
        { x: 3, z: 5 },
        { x: 4, z: 5 },
      ],
      RoadTier.TwoLane,
    );

    const deltas = removeRoad(g, [{ x: 3, z: 5 }]);
    const byXZ = new Map(deltas.map((d) => [`${d.x},${d.z}`, d]));

    const two = RoadTier.TwoLane;
    expect(byXZ.get('3,5')).toEqual({
      x: 3,
      z: 5,
      tier: RoadTier.None,
      mask: 0,
      elevation: 0,
      profile: 0,
      flow: RoadFlow.None,
    });
    expect(byXZ.get('2,5')).toEqual({
      x: 2,
      z: 5,
      tier: two,
      mask: 0,
      elevation: 0,
      profile: two,
      flow: RoadFlow.None,
    }); // lost its E neighbor
    expect(byXZ.get('4,5')).toEqual({
      x: 4,
      z: 5,
      tier: two,
      mask: 0,
      elevation: 0,
      profile: two,
      flow: RoadFlow.None,
    }); // lost its W neighbor

    expect(g.roadTier[idx(size, 3, 5)]).toBe(RoadTier.None);
    expect(g.roadMask[idx(size, 3, 5)]).toBe(0);
  });

  it('is a no-op for tiles that carry no road', () => {
    const g = makeGrid(10);
    expect(removeRoad(g, [{ x: 5, z: 5 }])).toEqual([]);
  });

  it('ignores out-of-bounds tiles', () => {
    const g = makeGrid(5);
    expect(removeRoad(g, [{ x: -1, z: 0 }])).toEqual([]);
  });
});

describe('RoadNetwork — rail exclusion (roads epic R4)', () => {
  it('keeps a dedicated rail line out of the drivable graph entirely', () => {
    const size = 12;
    const g = makeGrid(size);
    for (const x of [2, 3, 4, 5, 6]) g.roadTier[idx(size, x, 5)] = RoadTier.RailTrack;
    const net = new RoadNetwork();
    net.rebuild(g);
    expect(net.getNodes().length).toBe(0);
    expect(net.getEdges().length).toBe(0);
  });

  it('never folds a rail tile into a road edge — rail is not a drivable bridge', () => {
    // Two two-lane stubs separated by one rail tile: [2,3] R(4) [5,6] on row 5.
    const size = 14;
    const g = makeGrid(size);
    for (const x of [2, 3]) g.roadTier[idx(size, x, 5)] = RoadTier.TwoLane;
    g.roadTier[idx(size, 4, 5)] = RoadTier.RailTrack;
    for (const x of [5, 6]) g.roadTier[idx(size, x, 5)] = RoadTier.TwoLane;
    const net = new RoadNetwork();
    net.rebuild(g);
    // The rail tile does not bridge the two road stubs.
    expect(net.findPath({ x: 2, z: 5 }, { x: 6, z: 5 })).toBeNull();
    // No drivable edge ever covers the rail tile.
    for (const e of net.getEdges()) {
      for (const t of e.tiles) {
        expect(g.roadTier[idx(size, t.x, t.z)]).not.toBe(RoadTier.RailTrack);
      }
    }
  });
});

describe('RoadNetwork — the rail network off the same implementation', () => {
  // Rows far enough apart that nearestNode's 8-tile snap cannot reach from one
  // network to the other — otherwise an "unreachable" assertion only proves
  // the endpoint snapped to a node of the network it started in.
  const SIZE = 28;
  const STREET_Z = 3;
  const RAIL_Z = 20;

  /** Streets on one row, a rail line on another, crossing nothing. */
  function mixedGrid(size = SIZE): GridState {
    const g = makeGrid(size);
    for (let x = 2; x <= 10; x++) g.roadTier[idx(size, x, STREET_Z)] = RoadTier.TwoLane;
    for (let x = 2; x <= 10; x++) g.roadTier[idx(size, x, RAIL_Z)] = RoadTier.RailTrack;
    return g;
  }

  it('leaves the road graph identical whether or not the city has rail', () => {
    // The whole risk of parameterizing the graph builder: a city that never
    // touches rail must route exactly as it did before.
    const roadsOnly = makeGrid(SIZE);
    for (let x = 2; x <= 10; x++) roadsOnly.roadTier[idx(SIZE, x, STREET_Z)] = RoadTier.TwoLane;

    const a = new RoadNetwork();
    a.rebuild(roadsOnly);
    const b = new RoadNetwork();
    b.rebuild(mixedGrid());

    expect(b.getNodes()).toEqual(a.getNodes());
    expect(b.getEdges()).toEqual(a.getEdges());
  });

  it('builds a graph over the track a car is kept off', () => {
    const rail = new RoadNetwork(isRailTier);
    rail.rebuild(mixedGrid());
    expect(rail.getNodes().length).toBeGreaterThan(0);
    expect(rail.getEdges().length).toBeGreaterThan(0);
    for (const e of rail.getEdges()) expect(e.tier).toBe(RoadTier.RailTrack);
  });

  it('routes a train along the rail and never down a street', () => {
    const g = mixedGrid();
    const rail = new RoadNetwork(isRailTier);
    rail.rebuild(g);

    const along = rail.findPath({ x: 2, z: RAIL_Z }, { x: 10, z: RAIL_Z });
    expect(along).not.toBeNull();
    for (const p of along!.points) expect(g.roadTier[idx(SIZE, p.x, p.z)]).toBe(RoadTier.RailTrack);

    // The street is a different network: unreachable from the track.
    expect(rail.findPath({ x: 2, z: RAIL_Z }, { x: 10, z: STREET_Z })).toBeNull();
  });

  it('keeps a car off the track the train runs on', () => {
    const g = mixedGrid();
    const road = new RoadNetwork();
    road.rebuild(g);
    expect(road.findPath({ x: 2, z: STREET_Z }, { x: 10, z: RAIL_Z })).toBeNull();
    for (const e of road.getEdges()) expect(e.tier).not.toBe(RoadTier.RailTrack);
  });
});

describe('RoadNetwork', () => {
  it('builds 2 nodes and 1 edge for a straight line', () => {
    const size = 12;
    const g = makeGrid(size);
    for (const x of [2, 3, 4, 5, 6]) g.roadTier[idx(size, x, 5)] = RoadTier.TwoLane;

    const net = new RoadNetwork();
    net.rebuild(g);

    expect(net.getNodes().length).toBe(2);
    expect(net.getEdges().length).toBe(1);
    expect(net.getEdges()[0]!.length).toBe(5);
    expect(net.getEdges()[0]!.tier).toBe(RoadTier.TwoLane);
    const nodeXs = net
      .getNodes()
      .map((n) => n.x)
      .sort((a, b) => a - b);
    expect(nodeXs).toEqual([2, 6]);
  });

  it('builds 2 nodes and 1 edge for an L shape', () => {
    const size = 12;
    const g = makeGrid(size);
    for (const [x, z] of [
      [2, 2],
      [2, 3],
      [2, 4],
      [3, 4],
      [4, 4],
    ] as const) {
      g.roadTier[idx(size, x, z)] = RoadTier.TwoLane;
    }

    const net = new RoadNetwork();
    net.rebuild(g);

    expect(net.getNodes().length).toBe(2);
    expect(net.getEdges().length).toBe(1);
    expect(net.getEdges()[0]!.length).toBe(5);
  });

  it('builds 4 nodes and 3 edges for a T junction', () => {
    const size = 12;
    const g = makeGrid(size);
    for (const [x, z] of [
      [5, 3],
      [5, 4],
      [5, 5],
      [5, 6],
      [6, 5],
      [7, 5],
    ] as const) {
      g.roadTier[idx(size, x, z)] = RoadTier.TwoLane;
    }

    const net = new RoadNetwork();
    net.rebuild(g);

    expect(net.getNodes().length).toBe(4);
    expect(net.getEdges().length).toBe(3);
  });

  it('builds 5 nodes and 4 edges for a 4-way cross', () => {
    const size = 12;
    const g = makeGrid(size);
    for (const [x, z] of [
      [5, 5],
      [5, 3],
      [5, 4],
      [5, 6],
      [5, 7],
      [3, 5],
      [4, 5],
      [6, 5],
      [7, 5],
    ] as const) {
      g.roadTier[idx(size, x, z)] = RoadTier.TwoLane;
    }

    const net = new RoadNetwork();
    net.rebuild(g);

    expect(net.getNodes().length).toBe(5);
    expect(net.getEdges().length).toBe(4);
  });

  it('builds a single node with no edges for an isolated tile', () => {
    const g = makeGrid(10);
    g.roadTier[idx(10, 5, 5)] = RoadTier.TwoLane;

    const net = new RoadNetwork();
    net.rebuild(g);

    expect(net.getNodes().length).toBe(1);
    expect(net.getEdges().length).toBe(0);
  });

  it('builds 4 nodes and 2 edges for two disconnected segments, and findPath returns null across them', () => {
    const size = 20;
    const g = makeGrid(size);
    for (const x of [2, 3, 4]) g.roadTier[idx(size, x, 2)] = RoadTier.TwoLane;
    for (const x of [10, 11, 12]) g.roadTier[idx(size, x, 15)] = RoadTier.TwoLane;

    const net = new RoadNetwork();
    net.rebuild(g);

    expect(net.getNodes().length).toBe(4);
    expect(net.getEdges().length).toBe(2);
    expect(net.findPath({ x: 2, z: 2 }, { x: 12, z: 15 })).toBeNull();
  });

  it('lazily rebuilds after invalidateRegion, matching a fresh rebuild', () => {
    const size = 16;
    const g = makeGrid(size);
    for (const x of [2, 3, 4]) g.roadTier[idx(size, x, 2)] = RoadTier.TwoLane;

    const net = new RoadNetwork();
    net.rebuild(g);
    expect(net.getNodes().length).toBe(2);
    expect(net.getEdges().length).toBe(1);

    // Mutate the grid directly (as another module would via applyRoad),
    // extending the line, then mark the cached network stale.
    applyRoad(
      g,
      [
        { x: 5, z: 2 },
        { x: 6, z: 2 },
      ],
      RoadTier.TwoLane,
    );
    net.invalidateRegion(0, 0, size, size);

    const lazyNodes = net.getNodes();
    const lazyEdges = net.getEdges();

    const fresh = new RoadNetwork();
    fresh.rebuild(g);

    expect(lazyNodes.length).toBe(fresh.getNodes().length);
    expect(lazyEdges.length).toBe(fresh.getEdges().length);
    expect(lazyEdges[0]!.length).toBe(fresh.getEdges()[0]!.length);
    expect(new Set(lazyNodes.map((n) => `${n.x},${n.z}`))).toEqual(
      new Set(fresh.getNodes().map((n) => `${n.x},${n.z}`)),
    );
  });

  it('findPath routes across the built graph; addVolume/decayVolumes mutate edge.volume', () => {
    const size = 12;
    const g = makeGrid(size);
    for (const x of [2, 3, 4, 5, 6]) g.roadTier[idx(size, x, 5)] = RoadTier.TwoLane;

    const net = new RoadNetwork();
    net.rebuild(g);

    const result = net.findPath({ x: 2, z: 5 }, { x: 6, z: 5 });
    expect(result).not.toBeNull();
    expect(result!.points[0]).toEqual({ x: 2, z: 5 });
    expect(result!.points[result!.points.length - 1]).toEqual({ x: 6, z: 5 });

    const edgeIds = net.getEdges().map((e) => e.id);
    net.addVolume(edgeIds, 100);
    expect(net.getEdges()[0]!.volume).toBe(100);

    net.decayVolumes(0.5);
    expect(net.getEdges()[0]!.volume).toBe(50);
  });

  it('one-way road: findPath succeeds forward (low->high coord) and fails backward with no detour', () => {
    const size = 12;
    const g = makeGrid(size);
    for (const x of [2, 3, 4, 5, 6]) g.roadTier[idx(size, x, 5)] = RoadTier.OneWay;

    const net = new RoadNetwork();
    net.rebuild(g);

    expect(net.getEdges().length).toBe(1);
    expect(net.getEdges()[0]!.tier).toBe(RoadTier.OneWay);

    // Forward: increasing x, matches the one-way rule (W->E on an E/W-ish run).
    const forward = net.findPath({ x: 2, z: 5 }, { x: 6, z: 5 });
    expect(forward).not.toBeNull();
    expect(forward!.points[0]).toEqual({ x: 2, z: 5 });
    expect(forward!.points[forward!.points.length - 1]).toEqual({ x: 6, z: 5 });

    // Backward: no alternate route exists, so no path.
    expect(net.findPath({ x: 6, z: 5 }, { x: 2, z: 5 })).toBeNull();
  });

  it('mixed network: a one-way shortcut plus a two-way loop routes correctly in both directions', () => {
    const size = 16;
    const g = makeGrid(size);
    // One-way top edge, row z=2, x 2..6 (forward: increasing x). Corner
    // tiles (2,2)/(6,2) stay OneWay — the two-way columns start at z=3 so
    // they don't overwrite the corner's own tier.
    for (const x of [2, 3, 4, 5, 6]) g.roadTier[idx(size, x, 2)] = RoadTier.OneWay;
    // Two-way loop back down and around: right side (x=6, z 3..6), bottom
    // (z=6, x 2..6), left side (x=2, z 3..6) all two-lane — a single long
    // detour edge connecting the same two nodes as the one-way shortcut.
    for (const z of [3, 4, 5, 6]) g.roadTier[idx(size, 6, z)] = RoadTier.TwoLane;
    for (const x of [2, 3, 4, 5, 6]) g.roadTier[idx(size, x, 6)] = RoadTier.TwoLane;
    for (const z of [3, 4, 5, 6]) g.roadTier[idx(size, 2, z)] = RoadTier.TwoLane;

    const net = new RoadNetwork();
    net.rebuild(g);

    // Forward along the one-way shortcut: (2,2) -> (6,2) direct.
    const forward = net.findPath({ x: 2, z: 2 }, { x: 6, z: 2 });
    expect(forward).not.toBeNull();
    expect(forward!.points[0]).toEqual({ x: 2, z: 2 });
    expect(forward!.points[forward!.points.length - 1]).toEqual({ x: 6, z: 2 });
    // The direct one-way run is 5 tiles; any detour would be far longer.
    expect(forward!.points.length).toBe(5);

    // Backward against the one-way shortcut: must detour the long way round
    // the loop (down the right side, across the bottom, up the left side)
    // rather than reversing the one-way edge.
    const backward = net.findPath({ x: 6, z: 2 }, { x: 2, z: 2 });
    expect(backward).not.toBeNull();
    expect(backward!.points[0]).toEqual({ x: 6, z: 2 });
    expect(backward!.points[backward!.points.length - 1]).toEqual({ x: 2, z: 2 });
    expect(backward!.points.length).toBeGreaterThan(5); // took the long way round
  });

  it('nearestNode returns null beyond 8 tiles and an id within range', () => {
    const size = 20;
    const g = makeGrid(size);
    for (const x of [2, 3, 4]) g.roadTier[idx(size, x, 2)] = RoadTier.TwoLane;

    const net = new RoadNetwork();
    net.rebuild(g);

    expect(net.nearestNode(2, 2)).not.toBeNull();
    expect(net.nearestNode(19, 19)).toBeNull();
  });
});

describe('RoadNetwork — snapping a point that stands mid-run', () => {
  const SIZE = 40;
  const ROW = 10;

  /** A single straight run, long enough that its middle is far from both ends. */
  function corridorGrid(): GridState {
    const g = makeGrid(SIZE);
    for (let x = 2; x <= 32; x++) g.roadTier[ROW * SIZE + x] = RoadTier.TwoLane;
    return g;
  }

  it('routes between two points on a long junction-free corridor', () => {
    const net = new RoadNetwork();
    net.rebuild(corridorGrid());

    // The premise: nodes only at the two dead ends, so both points below are
    // well beyond the proximity radius from either of them.
    expect(net.getNodes()).toHaveLength(2);
    for (const node of net.getNodes()) {
      expect(Math.abs(node.x - 17)).toBeGreaterThan(8);
    }

    expect(net.nearestNode(17, ROW)).not.toBeNull();
    const path = net.findPath({ x: 10, z: ROW }, { x: 24, z: ROW });
    expect(path).not.toBeNull();
  });

  it('snaps to the nearer end of the run it stands on', () => {
    const net = new RoadNetwork();
    net.rebuild(corridorGrid());
    const nodeAt = (id: number | null): number => net.getNodes().find((n) => n.id === id)!.x;
    expect(nodeAt(net.nearestNode(14, ROW))).toBe(2);
    expect(nodeAt(net.nearestNode(30, ROW))).toBe(32);
  });

  it('still reports a point genuinely off the network as off it', () => {
    const net = new RoadNetwork();
    net.rebuild(corridorGrid());
    expect(net.nearestNode(17, ROW + 9)).toBeNull();
    expect(net.findPath({ x: 17, z: ROW + 9 }, { x: 24, z: ROW })).toBeNull();
  });

  it('does not let the fallback bridge two networks: rail track is not a street', () => {
    const g = makeGrid(SIZE);
    for (let x = 2; x <= 32; x++) g.roadTier[ROW * SIZE + x] = RoadTier.RailTrack;
    const road = new RoadNetwork();
    road.rebuild(g);
    expect(road.nearestNode(17, ROW)).toBeNull();
  });
});

describe('applyRoad — replace mode', () => {
  it('lays a smaller road over a bigger one only when the drag says to replace', () => {
    const g = makeGrid(8);
    const tiles = [{ x: 1, z: 1 }];
    applyRoad(g, tiles, RoadTier.Avenue);
    expect(g.roadTier[idx(8, 1, 1)]).toBe(RoadTier.Avenue);

    applyRoad(g, tiles, RoadTier.TwoLane);
    expect(g.roadTier[idx(8, 1, 1)]).toBe(RoadTier.Avenue); // refused, as always

    const deltas = applyRoad(g, tiles, RoadTier.TwoLane, undefined, RoadTier.TwoLane, true);
    expect(g.roadTier[idx(8, 1, 1)]).toBe(RoadTier.TwoLane);
    expect(g.roadProfile[1 * 8 + 1]).toBe(RoadTier.TwoLane);
    expect(deltas.some((d) => d.x === 1 && d.z === 1 && d.tier === RoadTier.TwoLane)).toBe(true);
  });

  it('still changes nothing when the road it replaces is the road it lays', () => {
    const g = makeGrid(8);
    const tiles = [{ x: 2, z: 2 }];
    applyRoad(g, tiles, RoadTier.TwoLane);
    const deltas = applyRoad(g, tiles, RoadTier.TwoLane, undefined, RoadTier.TwoLane, true);
    expect(deltas).toEqual([]);
  });

  it('builds on bare ground in replace mode just as it always did', () => {
    const g = makeGrid(8);
    applyRoad(g, [{ x: 3, z: 3 }], RoadTier.TwoLane, undefined, RoadTier.TwoLane, true);
    expect(g.roadTier[idx(8, 3, 3)]).toBe(RoadTier.TwoLane);
  });
});

describe('stored flow direction', () => {
  it('records which way the drag went, and points the last tile the way it arrived', () => {
    const size = 10;
    const g = makeGrid(size);
    const tiles = [
      { x: 2, z: 5 },
      { x: 3, z: 5 },
      { x: 4, z: 5 },
    ];
    const flows = [RoadFlow.East, RoadFlow.East, RoadFlow.East];
    const deltas = applyRoad(g, tiles, RoadTier.OneWay, undefined, RoadTier.OneWay, false, flows);
    for (const t of tiles) expect(g.roadFlow[idx(size, t.x, t.z)]).toBe(RoadFlow.East);
    expect(deltas.every((d) => d.flow === RoadFlow.East)).toBe(true);
  });

  it('turns a road round when it is drawn back the other way', () => {
    const size = 10;
    const g = makeGrid(size);
    const tiles = [
      { x: 2, z: 5 },
      { x: 3, z: 5 },
    ];
    applyRoad(g, tiles, RoadTier.OneWay, undefined, RoadTier.OneWay, false, [
      RoadFlow.East,
      RoadFlow.East,
    ]);
    const back = applyRoad(g, tiles, RoadTier.OneWay, undefined, RoadTier.OneWay, false, [
      RoadFlow.West,
      RoadFlow.West,
    ]);
    expect(back).toHaveLength(2); // a turned-round road really changed
    expect(g.roadFlow[idx(size, 2, 5)]).toBe(RoadFlow.West);
  });

  it('forgets the direction when the road is taken away', () => {
    const size = 10;
    const g = makeGrid(size);
    applyRoad(g, [{ x: 5, z: 5 }], RoadTier.OneWay, undefined, RoadTier.OneWay, false, [
      RoadFlow.South,
    ]);
    removeRoad(g, [{ x: 5, z: 5 }]);
    expect(g.roadFlow[idx(size, 5, 5)]).toBe(RoadFlow.None);
  });
});

describe('the graph carries the direction its tiles were drawn in', () => {
  /** A straight one-way run from (2,5) to (6,5), with junction stubs at each end. */
  function runGrid(flow: number): GridState {
    const size = 12;
    const g = makeGrid(size);
    const tiles = Array.from({ length: 5 }, (_, i) => ({ x: 2 + i, z: 5 }));
    applyRoad(
      g,
      tiles,
      RoadTier.OneWay,
      undefined,
      RoadTier.OneWay,
      false,
      flow === RoadFlow.None ? undefined : tiles.map(() => flow),
    );
    // Stubs so each end of the run is a node rather than a dead end.
    applyRoad(g, [{ x: 2, z: 4 }], RoadTier.TwoLane);
    applyRoad(g, [{ x: 6, z: 4 }], RoadTier.TwoLane);
    return g;
  }

  it('says the run points from a to b, or from b to a, according to what it stored', () => {
    for (const [flow, expectEast] of [
      [RoadFlow.East, true],
      [RoadFlow.West, false],
    ] as const) {
      const net = new RoadNetwork();
      net.rebuild(runGrid(flow));
      const edge = net.getEdges().find((e) => e.tiles.length === 5);
      expect(edge, `flow ${flow}`).toBeDefined();
      const nodes = net.getNodes();
      const a = nodes.find((n) => n.id === edge!.a)!;
      const b = nodes.find((n) => n.id === edge!.b)!;
      // forwardAtoB is relative to the walk, so read it against the endpoints.
      const pointsEast = edge!.forwardAtoB === b.x > a.x;
      expect(pointsEast, `flow ${flow}`).toBe(expectEast);
    }
  });

  it('reads a run by its own tiles, not by the crossing another one-way last drew through', () => {
    const size = 12;
    const g = makeGrid(size);
    const spine = column(5, 1, 10);
    applyRoad(
      g,
      spine,
      RoadTier.OneWay,
      undefined,
      RoadTier.OneWay,
      false,
      spine.map(() => RoadFlow.South),
    );
    const arm = row(5, 1, 10);
    applyRoad(
      g,
      arm,
      RoadTier.OneWay,
      undefined,
      RoadTier.OneWay,
      false,
      arm.map(() => RoadFlow.East),
    );
    expect(g.roadFlow[idx(size, 5, 5)]! & 7).toBe(RoadFlow.East); // the crossing holds one flow
    const net = new RoadNetwork();
    net.rebuild(g);
    const nodes = net.getNodes();
    const along = (pick: (t: TilePoint) => boolean) =>
      net.getEdges().filter((e) => e.tiles.every(pick) && e.tiles.length > 2);
    for (const edge of along((t) => t.x === 5)) {
      const a = nodes.find((n) => n.id === edge.a)!;
      const b = nodes.find((n) => n.id === edge.b)!;
      expect(edge.forwardAtoB === b.z > a.z, `spine edge ${a.z}->${b.z}`).toBe(true);
    }
    for (const edge of along((t) => t.z === 5)) {
      const a = nodes.find((n) => n.id === edge.a)!;
      const b = nodes.find((n) => n.id === edge.b)!;
      expect(edge.forwardAtoB === b.x > a.x, `arm edge ${a.x}->${b.x}`).toBe(true);
    }
    expect(along((t) => t.x === 5)).toHaveLength(2);
  });

  it('says nothing about a road laid before the direction was stored', () => {
    const net = new RoadNetwork();
    net.rebuild(runGrid(RoadFlow.None));
    const edge = net.getEdges().find((e) => e.tiles.length === 5);
    expect(edge?.forwardAtoB).toBeUndefined();
  });
});

describe('the graph reads how a run divides between its directions', () => {
  /** A straight run of one profile from (2,5) to (6,5), drawn eastward, with stubs at each end. */
  function splitGrid(profileId: number, pieces: RoadProfile['pieces']): RoadNetwork {
    const size = 12;
    const g = makeGrid(size);
    const tiles = Array.from({ length: 5 }, (_, i) => ({ x: 2 + i, z: 5 }));
    applyRoad(
      g,
      tiles,
      RoadTier.FourLane,
      undefined,
      profileId,
      false,
      tiles.map(() => RoadFlow.East),
    );
    applyRoad(g, [{ x: 2, z: 4 }], RoadTier.TwoLane);
    applyRoad(g, [{ x: 6, z: 4 }], RoadTier.TwoLane);
    const net = new RoadNetwork();
    net.setProfileResolver((id) => (id === profileId ? { class: 'urban', pieces } : null));
    net.rebuild(g);
    return net;
  }

  const runEdge = (net: RoadNetwork) => net.getEdges().find((e) => e.tiles.length === 5);

  it('says nothing when the run is the same both ways', () => {
    const net = splitGrid(12, [
      { kind: 'travel', width: 3.5, flow: 'back' },
      { kind: 'travel', width: 3.5, flow: 'fwd' },
    ]);
    const edge = runEdge(net)!;
    expect(edge.lanesAtoB).toBeUndefined();
    expect(edge.lanesBtoA).toBeUndefined();
  });

  it('divides the lanes the way the profile does, oriented by the way the run was drawn', () => {
    const net = splitGrid(13, [
      { kind: 'travel', width: 3.5, flow: 'back' },
      { kind: 'travel', width: 3.5, flow: 'fwd' },
      { kind: 'travel', width: 3.5, flow: 'fwd' },
    ]);
    const edge = runEdge(net)!;
    const nodes = net.getNodes();
    const a = nodes.find((n) => n.id === edge.a)!;
    const b = nodes.find((n) => n.id === edge.b)!;
    // The run was drawn east, so its two forward lanes run toward the higher x.
    const eastward = b.x > a.x ? edge.lanesAtoB : edge.lanesBtoA;
    const westward = b.x > a.x ? edge.lanesBtoA : edge.lanesAtoB;
    expect(eastward).toBe(2);
    expect(westward).toBe(1);
  });
});

describe('a road only replaces one below it in the hierarchy', () => {
  it('refuses to let a gravel track cut a motorway, though its tier number is higher', () => {
    const size = 10;
    const g = makeGrid(size);
    applyRoad(g, [{ x: 5, z: 5 }], RoadTier.Highway);
    applyRoad(g, [{ x: 5, z: 5 }], RoadTier.Gravel);
    expect(g.roadTier[idx(size, 5, 5)]).toBe(RoadTier.Highway);
  });

  it('refuses an alley over an avenue, and a bike lane over a motorway', () => {
    const size = 10;
    const g = makeGrid(size);
    applyRoad(g, [{ x: 1, z: 1 }], RoadTier.Avenue);
    applyRoad(g, [{ x: 1, z: 1 }], RoadTier.Alley);
    expect(g.roadTier[idx(size, 1, 1)]).toBe(RoadTier.Avenue);

    applyRoad(g, [{ x: 2, z: 2 }], RoadTier.Highway);
    applyRoad(g, [{ x: 2, z: 2 }], RoadTier.BikeLane);
    expect(g.roadTier[idx(size, 2, 2)]).toBe(RoadTier.Highway);
  });

  it('still upgrades a lesser road, and still yields to Replace mode', () => {
    const size = 10;
    const g = makeGrid(size);
    applyRoad(g, [{ x: 3, z: 3 }], RoadTier.Gravel);
    applyRoad(g, [{ x: 3, z: 3 }], RoadTier.TwoLane);
    expect(g.roadTier[idx(size, 3, 3)]).toBe(RoadTier.TwoLane);

    applyRoad(g, [{ x: 3, z: 3 }], RoadTier.Gravel, undefined, RoadTier.Gravel, true);
    expect(g.roadTier[idx(size, 3, 3)]).toBe(RoadTier.Gravel);
  });
});

describe('a drag only re-profiles the tiles it owns', () => {
  it('does not lift a motorway onto a viaduct when a street is drawn across it', () => {
    const g = makeGrid(12);
    applyRoad(g, column(5, 0, 11), RoadTier.Highway);
    const crossing = idx(12, 5, 6);
    // A street drawn east-west across it. The motorway tile refuses the street
    // — a lesser road never replaces a greater one — so it must also refuse
    // the height the drag was carrying.
    const tiles = row(6, 2, 8);
    applyRoad(
      g,
      tiles,
      RoadTier.TwoLane,
      tiles.map(() => 6),
    );
    expect(g.roadTier[crossing]).toBe(RoadTier.Highway);
    expect(g.roadElevation[crossing]).toBe(0);
    // The street's own tiles took the height they were given.
    expect(g.roadTier[idx(12, 3, 6)]).toBe(RoadTier.TwoLane);
    expect(g.roadElevation[idx(12, 3, 6)]).toBe(6);
  });

  it('does not turn a road round when another road is drawn over it and refused', () => {
    const g = makeGrid(12);
    applyRoad(g, column(5, 0, 11), RoadTier.Highway, undefined, RoadTier.Highway, false, [
      ...column(5, 0, 11).map(() => RoadFlow.South),
    ]);
    const crossing = idx(12, 5, 6);
    const tiles = row(6, 2, 8);
    applyRoad(
      g,
      tiles,
      RoadTier.TwoLane,
      undefined,
      RoadTier.TwoLane,
      false,
      tiles.map(() => RoadFlow.East),
    );
    expect(g.roadFlow[crossing]).toBe(RoadFlow.South);
  });

  it('still lets a road re-drag its own span to a new height', () => {
    const g = makeGrid(12);
    const tiles = row(6, 2, 8);
    applyRoad(g, tiles, RoadTier.TwoLane);
    applyRoad(
      g,
      tiles,
      RoadTier.TwoLane,
      tiles.map(() => 4),
    );
    expect(g.roadElevation[idx(12, 5, 6)]).toBe(4);
  });
});

describe('a ramp meets a motorway alongside it, and only at one tile', () => {
  const SIZE = 20;
  /** Lays tiles with the exact flow each one was drawn with. */
  const lay = (g: GridState, tiles: TilePoint[], flows: RoadFlow[], tier: RoadTier): void => {
    applyRoad(g, tiles, tier, undefined, tier, false, flows);
  };
  const edgeCovering = (net: RoadNetwork, t: TilePoint): GraphEdge | undefined =>
    net.getEdges().find((e) => e.tiles.some((u) => u.x === t.x && u.z === t.z));

  /**
   * An eastbound motorway along z = 5, and an on-ramp that comes up column 4
   * from the south, elbows east at (4,6), runs beside the motorway and ends
   * at (8,6) — where it merges.
   */
  const onRamp = (): GridState => {
    const g = makeGrid(SIZE);
    lay(
      g,
      row(5, 0, 15),
      row(5, 0, 15).map(() => RoadFlow.East),
      RoadTier.Highway,
    );
    lay(
      g,
      [
        { x: 4, z: 9 },
        { x: 4, z: 8 },
        { x: 4, z: 7 },
        { x: 4, z: 6 },
        { x: 5, z: 6 },
        { x: 6, z: 6 },
        { x: 7, z: 6 },
        { x: 8, z: 6 },
      ],
      [
        RoadFlow.North,
        RoadFlow.North,
        RoadFlow.North,
        RoadFlow.East,
        RoadFlow.East,
        RoadFlow.East,
        RoadFlow.East,
        RoadFlow.East,
      ],
      RoadTier.Ramp,
    );
    return g;
  };

  it('is its own road along the stretch beside the motorway', () => {
    const g = onRamp();
    for (const x of [5, 6, 7]) {
      expect(computeMask(g, x, 6) & 1, `ramp at ${x}`).toBe(0);
      expect(computeMask(g, x, 5) & 4, `motorway at ${x}`).toBe(0);
    }
  });

  it('does not join at the elbow, which turns away with a ramp on both sides', () => {
    const g = onRamp();
    expect(computeMask(g, 4, 6) & 1).toBe(0);
    expect(computeMask(g, 4, 5) & 4).toBe(0);
  });

  it('joins at its end, which is the merge', () => {
    const g = onRamp();
    expect(computeMask(g, 8, 6) & 1).toBe(1);
    expect(computeMask(g, 8, 5) & 4).toBe(4);
  });

  it('carries traffic up the ramp and onto the motorway through the merge alone', () => {
    const net = new RoadNetwork();
    net.rebuild(onRamp());
    const merge = net.getNodes().find((n) => n.x === 8 && n.z === 5);
    expect(merge, 'the merge is a node').toBeDefined();
    // Nowhere along the stretch is there a node on the motorway for the ramp
    // to cross into.
    for (const x of [4, 5, 6, 7]) {
      expect(
        net.getNodes().some((n) => n.x === x && n.z === 5),
        `x ${x}`,
      ).toBe(false);
    }
    expect(edgeCovering(net, { x: 6, z: 6 })).toBeDefined();
  });

  it('keeps a head-on ramp a save already holds connected, so it still carries traffic', () => {
    const g = makeGrid(SIZE);
    lay(
      g,
      row(5, 0, 15),
      row(5, 0, 15).map(() => RoadFlow.East),
      RoadTier.Highway,
    );
    lay(g, column(4, 6, 8), [RoadFlow.South, RoadFlow.South, RoadFlow.South], RoadTier.Ramp);
    expect(computeMask(g, 4, 5) & 4).toBe(4);
    expect(computeMask(g, 4, 6) & 1).toBe(1);
  });
});

describe('a road passing over another on the tile they cross', () => {
  const SIZE = 20;
  /**
   * A motorway down x = 10 and a local street climbing over it along z = 9:
   * ground approaches at 0, 2, 4, 6 m each side, and the crossing tile's own
   * road on the over layer at 7 m.
   */
  function overpass(): GridState {
    const g = makeGrid(SIZE);
    for (let z = 2; z <= 17; z++) {
      const i = idx(SIZE, 10, z);
      g.roadTier[i] = RoadTier.Highway;
      g.roadProfile[i] = RoadTier.Highway;
      g.roadFlow[i] = RoadFlow.South;
    }
    const decks: Record<number, number> = { 6: 0, 7: 2, 8: 4, 9: 6, 11: 6, 12: 4, 13: 2, 14: 0 };
    for (const [x, deck] of Object.entries(decks)) {
      const i = idx(SIZE, Number(x), 9);
      g.roadTier[i] = RoadTier.TwoLane;
      g.roadProfile[i] = RoadTier.TwoLane;
      g.roadFlow[i] = RoadFlow.East;
      g.roadElevation[i] = deck;
    }
    const c = idx(SIZE, 10, 9);
    g.overTier[c] = RoadTier.TwoLane;
    g.overProfile[c] = RoadTier.TwoLane;
    g.overFlow[c] = RoadFlow.East;
    g.overElevation[c] = 7;
    recomputeRoadMasks(g);
    return g;
  }

  it('keeps the road beneath joined only along its own line', () => {
    expect(computeMask(overpass(), 10, 9)).toBe(1 | 4); // N|S
  });

  it('joins the approaches to the road passing over, not to the one beneath', () => {
    const g = overpass();
    expect(computeMask(g, 9, 9) & 2).toBe(2); // east, onto the overpass
    expect(computeMask(g, 11, 9) & 8).toBe(8); // west, onto it from the far side
    expect(computeOverMask(g, 10, 9)).toBe(2 | 8); // E|W
  });

  it('builds the overpass as one run through the crossing, apart from the road beneath', () => {
    const net = new RoadNetwork();
    net.rebuild(overpass());
    const covers = (x: number, z: number) =>
      net.getEdges().filter((e) => e.tiles.some((t) => t.x === x && t.z === z));
    const street = covers(8, 9);
    expect(street).toHaveLength(1);
    const run = street[0]!;
    const at = run.tiles.findIndex((t) => t.x === 10 && t.z === 9);
    expect(at).toBeGreaterThan(0);
    expect(run.overTiles).toEqual([at]);
    expect(run.classId).toBe('local'); // read from the over road, not the motorway
    const motorway = covers(10, 3);
    expect(motorway).toHaveLength(1);
    expect(motorway[0]!.overTiles).toBeUndefined();
    expect(motorway[0]!.classId).toBe('highway');
    // No node where they cross: neither road has a junction there.
    expect(net.getNodes().some((n) => n.x === 10 && n.z === 9)).toBe(false);
  });

  it('leaves an approach stranded in the air unjoined once the crossing is gone', () => {
    const g = overpass();
    const c = idx(SIZE, 10, 9);
    g.overTier[c] = 0;
    g.overElevation[c] = 0;
    // The last approach tile is 6 m up; the motorway beside it is on the ground.
    expect(computeMask(g, 9, 9) & 2).toBe(0);
  });

  it('still joins a bridge span to the bank it lands on, one grade step down', () => {
    const g = makeGrid(SIZE);
    for (const [x, deck] of [
      [4, 0],
      [5, 2],
      [6, 4],
    ] as const) {
      g.roadTier[idx(SIZE, x, 5)] = RoadTier.TwoLane;
      g.roadElevation[idx(SIZE, x, 5)] = deck;
    }
    expect(computeMask(g, 5, 5)).toBe(2 | 8);
  });

  it('carries on over a pair of carriageways, one crossing tile after another', () => {
    const g = overpass();
    for (let z = 2; z <= 17; z++) {
      const i = idx(SIZE, 11, z);
      g.roadTier[i] = RoadTier.Highway;
      g.roadProfile[i] = RoadTier.Highway;
      g.roadFlow[i] = RoadFlow.North;
      g.roadElevation[i] = 0;
    }
    const c2 = idx(SIZE, 11, 9);
    g.overTier[c2] = RoadTier.TwoLane;
    g.overProfile[c2] = RoadTier.TwoLane;
    g.overFlow[c2] = RoadFlow.East;
    g.overElevation[c2] = 7;
    g.roadElevation[idx(SIZE, 12, 9)] = 6;
    g.roadTier[idx(SIZE, 12, 9)] = RoadTier.TwoLane;
    recomputeRoadMasks(g);
    expect(computeOverMask(g, 10, 9)).toBe(2 | 8);
    expect(computeOverMask(g, 11, 9)).toBe(2 | 8);
    expect(roadStep(g, idx(SIZE, 9, 9), 1, 0)).toBe(SIZE * SIZE + idx(SIZE, 10, 9));
    expect(roadStep(g, SIZE * SIZE + idx(SIZE, 10, 9), 1, 0)).toBe(SIZE * SIZE + c2);
  });

  it('steps from the road beneath only along its own line', () => {
    const g = overpass();
    const c = idx(SIZE, 10, 9);
    expect(roadStep(g, c, 1, 0)).toBeNull();
    expect(roadStep(g, c, 0, 1)).toBe(idx(SIZE, 10, 10));
    expect(roadStep(g, SIZE * SIZE + c, 0, 1)).toBeNull();
  });
});
