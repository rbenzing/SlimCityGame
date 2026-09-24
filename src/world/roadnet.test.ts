import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng';
import { RoadFlow, RoadTier } from '../shared/types';
import type { GridState, TilePoint } from '../shared/types';
import { createGrid, savedRoadNetwork, serializeGridV12 } from './grid';
import { setOverRoad } from './overpass';
import { applyRoad, recomputeRoadMasks, roadKeyMask } from './roads';
import {
  buildRoadCells,
  cellStep,
  decodeRoadNetwork,
  deriveRoadLayers,
  encodeRoadNetwork,
  liveNodes,
  liveSegments,
  loadGrid,
  networkFromGrid,
  reconcileRoads,
  saveGrid,
} from './roadnet';
import type { RoadCells } from './roadnet';

const row = (z: number, from: number, to: number): TilePoint[] =>
  Array.from({ length: Math.abs(to - from) + 1 }, (_, i) => ({
    x: from + i * Math.sign(to - from || 1),
    z,
  }));
const column = (x: number, from: number, to: number): TilePoint[] =>
  Array.from({ length: Math.abs(to - from) + 1 }, (_, i) => ({
    x,
    z: from + i * Math.sign(to - from || 1),
  }));

const ROAD_LAYERS = [
  'roadTier',
  'roadProfile',
  'roadFlow',
  'roadElevation',
  'roadMask',
  'overTier',
  'overProfile',
  'overFlow',
  'overElevation',
] as const;

/** Every road layer of `g`, copied. */
function roadLayers(g: GridState): Record<(typeof ROAD_LAYERS)[number], number[]> {
  const out = {} as Record<(typeof ROAD_LAYERS)[number], number[]>;
  for (const k of ROAD_LAYERS) out[k] = Array.from(g[k]);
  return out;
}

/**
 * Converts `g` to a network and derives the tile layers back into a blank
 * grid of the same terrain, and expects every road layer to come back exactly.
 * The tile layers are read with the masks the rules give them, which is what
 * a save load does.
 */
function expectRoundTrip(g: GridState): void {
  recomputeRoadMasks(g);
  const before = roadLayers(g);
  const net = networkFromGrid(g);
  const back = createGrid(g.size);
  back.height.set(g.height);
  expect(deriveRoadLayers(back, net)).toEqual([]);
  expect(roadLayers(back)).toEqual(before);
  expectCellsJoinAsMasks(g, buildRoadCells(net, g.size));
}

/**
 * The cells link every road to exactly the neighbours the joining rules give
 * its mask — the network's connectivity and the tiles' say the same thing.
 */
function expectCellsJoinAsMasks(g: GridState, cells: RoadCells): void {
  const n = g.size * g.size;
  const steps = [
    [0, -1, 1],
    [1, 0, 2],
    [0, 1, 4],
    [-1, 0, 8],
  ] as const;
  const mismatches: string[] = [];
  for (let key = 0; key < 2 * n; key++) {
    const tier = key < n ? g.roadTier[key] : g.overTier[key - n];
    expect(cells.tier[key]).toBe(tier);
    if (!tier) continue;
    let linked = 0;
    for (const [dx, dz, bit] of steps) if (cellStep(cells, key, dx, dz) !== null) linked |= bit;
    const mask = roadKeyMask(g, key);
    if (linked !== mask) mismatches.push(`key ${key}: cells ${linked}, mask ${mask}`);
  }
  expect(mismatches).toEqual([]);
}

describe('road network: the tile layers convert and derive back exactly', () => {
  it('holds nothing for a grid with no roads', () => {
    const g = createGrid(8);
    const net = networkFromGrid(g);
    expect(liveNodes(net)).toEqual([]);
    expect(liveSegments(net)).toEqual([]);
    expectRoundTrip(g);
  });

  it('makes one segment of a straight road, between its two dead ends', () => {
    const g = createGrid(12);
    applyRoad(g, row(5, 1, 9), RoadTier.TwoLane);
    const net = networkFromGrid(g);
    expect(liveNodes(net)).toHaveLength(2);
    expect(liveSegments(net)).toHaveLength(1);
    expectRoundTrip(g);
  });

  it('puts a node on a bend, a tee and a crossroads', () => {
    const g = createGrid(16);
    applyRoad(g, [...row(3, 1, 8), ...column(8, 4, 12)], RoadTier.TwoLane);
    applyRoad(g, column(4, 3, 10), RoadTier.Avenue);
    applyRoad(g, row(8, 1, 14), RoadTier.TwoLane);
    expectRoundTrip(g);
  });

  it('puts a node where the profile or the flow changes along a run', () => {
    const g = createGrid(16);
    applyRoad(g, row(4, 1, 6), RoadTier.TwoLane);
    applyRoad(g, row(4, 7, 12), RoadTier.Avenue);
    applyRoad(g, row(9, 1, 12), RoadTier.OneWay, undefined, RoadTier.OneWay, false, [
      ...Array<number>(6).fill(RoadFlow.East),
      ...Array<number>(6).fill(RoadFlow.West),
    ]);
    const net = networkFromGrid(g);
    // Two roads, each broken once: three nodes and two segments apiece.
    expect(liveNodes(net)).toHaveLength(6);
    expect(liveSegments(net)).toHaveLength(4);
    expectRoundTrip(g);
  });

  it('keeps a bridge deck exactly, climbing and levelling off', () => {
    const g = createGrid(20);
    const deck = [0, 2, 4, 6, 6, 6, 6, 4, 2, 0, 0.5, 1.7, 3.1];
    applyRoad(g, row(10, 2, 2 + deck.length - 1), RoadTier.TwoLane, deck);
    expectRoundTrip(g);
  });

  it('keeps an overpass as one road passing over the one beneath', () => {
    const g = createGrid(20);
    applyRoad(
      g,
      column(10, 1, 18),
      RoadTier.Highway,
      undefined,
      RoadTier.Highway,
      false,
      Array<number>(18).fill(RoadFlow.South),
    );
    const approach = [0, 2, 4, 6];
    const west = row(8, 4, 9);
    applyRoad(
      g,
      row(8, 4, 9),
      RoadTier.TwoLane,
      [...approach, 6, 6],
      RoadTier.TwoLane,
      false,
      Array<number>(west.length).fill(RoadFlow.East),
    );
    applyRoad(
      g,
      row(8, 11, 16),
      RoadTier.TwoLane,
      [6, 6, 6, 4, 2, 0],
      RoadTier.TwoLane,
      false,
      Array<number>(6).fill(RoadFlow.East),
    );
    setOverRoad(g, 8 * 20 + 10, {
      tier: RoadTier.TwoLane,
      profile: RoadTier.TwoLane,
      flow: RoadFlow.East,
      elevation: 6,
    });
    expectRoundTrip(g);
  });

  it('keeps any tile state it is given, not only tidy ones', () => {
    const rng = createRng(20260924);
    const tiers = [
      RoadTier.TwoLane,
      RoadTier.Avenue,
      RoadTier.Gravel,
      RoadTier.Alley,
      RoadTier.OneWay,
      RoadTier.FourLane,
      RoadTier.RailTrack,
      RoadTier.Highway,
    ];
    for (let trial = 0; trial < 40; trial++) {
      const size = 24;
      const g = createGrid(size);
      for (let d = 0; d < 10; d++) {
        const tier = tiers[Math.floor(rng.next() * tiers.length)]!;
        const a = Math.floor(rng.next() * size);
        const from = Math.floor(rng.next() * size);
        const to = Math.floor(rng.next() * size);
        const path = rng.next() < 0.5 ? row(a, from, to) : column(a, from, to);
        const raised = rng.next() < 0.3;
        const deck = raised ? path.map((_, i) => Math.min(i, path.length - 1 - i) * 2) : undefined;
        const flow = [RoadFlow.None, RoadFlow.North, RoadFlow.East][Math.floor(rng.next() * 3)]!;
        applyRoad(
          g,
          path,
          tier,
          deck,
          tier,
          rng.next() < 0.3,
          path.map(() => flow),
        );
      }
      expectRoundTrip(g);
    }
  });
});

describe('road network: saves', () => {
  /** A city of every kind of road there is to keep: a bridge, a bend, a junction, one-way flow. */
  function city(): GridState {
    const g = createGrid(20);
    for (let i = 0; i < g.height.length; i++) g.height[i] = (i % 7) * 0.25;
    g.zone[3] = 2;
    g.buildingId[5] = 9;
    applyRoad(g, [...row(4, 1, 12), ...column(12, 5, 15)], RoadTier.TwoLane);
    applyRoad(
      g,
      column(6, 1, 16),
      RoadTier.Avenue,
      [0, 2, 4, 6, 6, 6, 6, 6, 6, 6, 6, 6, 4, 2, 0, 0],
    );
    applyRoad(
      g,
      row(18, 2, 17),
      RoadTier.OneWay,
      undefined,
      RoadTier.OneWay,
      false,
      Array<number>(16).fill(RoadFlow.West),
    );
    recomputeRoadMasks(g);
    return g;
  }

  it('saves the network in place of the road layers and derives them back on load', () => {
    const g = city();
    const net = networkFromGrid(g);
    const buf = saveGrid(g, net);
    expect(savedRoadNetwork(buf)).not.toBeNull();
    const loaded = loadGrid(buf);
    expect(loaded.problems).toEqual([]);
    expect(roadLayers(loaded.grid)).toEqual(roadLayers(g));
    expect(Array.from(loaded.grid.height)).toEqual(Array.from(g.height));
    expect(loaded.grid.zone[3]).toBe(2);
    expect(loaded.grid.buildingId[5]).toBe(9);
    expect(encodeRoadNetwork(loaded.roads)).toEqual(encodeRoadNetwork(net));
  });

  it('converts a save from before the network, deriving exactly the layers it held', () => {
    const g = city();
    const loaded = loadGrid(serializeGridV12(g));
    expect(loaded.problems).toEqual([]);
    expect(roadLayers(loaded.grid)).toEqual(roadLayers(g));
    expect(liveSegments(loaded.roads).length).toBeGreaterThan(0);
  });

  it('refuses a save whose network is cut short', () => {
    const buf = saveGrid(city(), networkFromGrid(city()));
    expect(() => loadGrid(buf.slice(0, buf.byteLength - 1))).toThrow();
  });
});

describe('road network: slots', () => {
  it('keeps the slot of every node and segment a later edit leaves where it was', () => {
    const g = createGrid(16);
    applyRoad(g, row(4, 1, 12), RoadTier.TwoLane);
    const net = networkFromGrid(g);
    const [west, east] = liveNodes(net)
      .map((s) => [s, net.nodeX[s]!] as const)
      .sort((p, q) => p[1] - q[1]);
    applyRoad(g, column(12, 5, 10), RoadTier.TwoLane);
    reconcileRoads(net, g);
    // The west end is untouched; the east end is now a bend at the same place.
    expect(net.nodeLive[west![0]]).toBe(1);
    expect(net.nodeX[west![0]]).toBe(west![1]);
    expect(net.nodeLive[east![0]]).toBe(1);
    expect(net.nodeX[east![0]]).toBe(east![1]);
    expect(liveSegments(net)).toHaveLength(2);
  });

  it('frees the slots of a road that is removed, and reuses the lowest first', () => {
    const g = createGrid(16);
    applyRoad(g, row(4, 1, 12), RoadTier.TwoLane);
    const net = networkFromGrid(g);
    g.roadTier.fill(0);
    reconcileRoads(net, g);
    expect(liveNodes(net)).toEqual([]);
    applyRoad(g, row(9, 1, 5), RoadTier.TwoLane);
    reconcileRoads(net, g);
    expect(liveNodes(net)).toEqual([0, 1]);
    expect(liveSegments(net)).toEqual([0]);
  });

  it('saves every slot, free ones included, and loads them back', () => {
    const g = createGrid(16);
    applyRoad(g, row(4, 1, 12), RoadTier.TwoLane);
    applyRoad(g, column(6, 1, 12), RoadTier.Avenue, [0, 2, 4, 6, 6, 6, 6, 6, 6, 4, 2, 0]);
    const net = networkFromGrid(g);
    const back = decodeRoadNetwork(encodeRoadNetwork(net));
    expect(encodeRoadNetwork(back)).toEqual(encodeRoadNetwork(net));
    const derived = createGrid(16);
    expect(deriveRoadLayers(derived, back)).toEqual([]);
    expect(roadLayers(derived)).toEqual(roadLayers(g));
  });

  it('refuses a network whose length does not add up', () => {
    const bytes = encodeRoadNetwork(networkFromGrid(createGrid(4)));
    expect(() => decodeRoadNetwork(bytes.subarray(0, 4))).toThrow(/truncated/);
    const padded = new Uint8Array(bytes.length + 1);
    padded.set(bytes);
    expect(() => decodeRoadNetwork(padded)).toThrow(/expected/);
  });
});
