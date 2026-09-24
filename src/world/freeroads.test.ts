import { describe, expect, it } from 'vitest';
import { RoadTier, ZoneType } from '../shared/types';
import type { GridState, RoadTier as Tier } from '../shared/types';
import { tileCentreCm } from '../shared/roadgeom';
import type { CmPoint } from '../shared/roadgeom';
import { canPlaceFootprint, createGrid, setZones } from './grid';
import { computeZonableMask } from './zonable';
import { applyRoad, removeRoad } from './roads';
import {
  deriveRoadLayers,
  isFreeSegment,
  liveNodes,
  liveSegments,
  networkFromGrid,
  reconcileRoads,
  syncRoadLayers,
} from './roadnet';
import { deriveRoadFootprint, laySegment, planSegment, removeSegmentAt } from './freeroads';
import { RoadNetwork } from './roadgraph';

const SIZE = 48;
const noCustom = (): null => null;

/** A point `x`, `z` metres into the map, in centimetres. */
const at = (x: number, z: number): CmPoint => ({ x: Math.round(x * 100), z: Math.round(z * 100) });
/** A tile's centre, in centimetres. */
const centre = (x: number, z: number): CmPoint => ({ x: tileCentreCm(x), z: tileCentreCm(z) });

function world(): GridState {
  const g = createGrid(SIZE);
  g.roads = networkFromGrid(g);
  return g;
}

interface Ask {
  tier?: Tier;
  a: CmPoint;
  b: CmPoint;
  control?: CmPoint;
  flow?: number;
}

const request = (ask: Ask) => {
  const tier = ask.tier ?? RoadTier.TwoLane;
  return {
    tier,
    profileId: tier,
    a: ask.a,
    b: ask.b,
    control: ask.control ?? null,
    flow: ask.flow ?? 0,
  };
};

/** What planning `ask` says, without laying it. */
function plan(g: GridState, ask: Ask) {
  return planSegment(g, g.roads!, request(ask), noCustom);
}

/** Lays `ask` the way the worker does, and expects it to be allowed. */
function lay(g: GridState, ask: Ask): void {
  const req = request(ask);
  const p = planSegment(g, g.roads!, req, noCustom);
  if (!p.ok) throw new Error(`refused: ${p.reason}`);
  laySegment(g, g.roads!, p, req);
  settle(g);
}

/** The network takes up the tiles, and the layers and footprint are derived again. */
function settle(g: GridState): void {
  reconcileRoads(g.roads!, g);
  expect(syncRoadLayers(g, g.roads!)).toEqual([]);
  deriveRoadFootprint(g, g.roads!, noCustom);
}

const freeSegments = (g: GridState): number[] =>
  liveSegments(g.roads!).filter((s) => isFreeSegment(g.roads!, s));

describe('roads off the grid: laying one', () => {
  it('lays a street at an angle across open ground, holding its footprint and no road tile', () => {
    const g = world();
    lay(g, { a: at(100, 100), b: at(300, 220) });
    expect(freeSegments(g)).toHaveLength(1);
    expect(liveNodes(g.roads!).map((s) => g.roads!.nodeTier[s])).toEqual([0, 0]);
    expect(Array.from(g.roadTier).every((t) => t === 0)).toBe(true);
    const covered = Array.from(g.roadFootprint).filter((v) => v === 1).length;
    expect(covered).toBeGreaterThan(10);
  });

  it('lays a curve its class can take', () => {
    const g = world();
    lay(g, { a: at(100, 100), b: at(300, 300), control: at(300, 100) });
    expect(freeSegments(g)).toHaveLength(1);
  });

  it('keeps a free road through every later grid command', () => {
    const g = world();
    lay(g, { a: at(100, 100), b: at(300, 220) });
    applyRoad(
      g,
      [
        { x: 30, z: 40 },
        { x: 31, z: 40 },
        { x: 32, z: 40 },
      ],
      RoadTier.TwoLane,
    );
    settle(g);
    expect(freeSegments(g)).toHaveLength(1);
  });

  it('is taken away with its own nodes, leaving a node another road still meets', () => {
    const g = world();
    lay(g, { a: at(100, 100), b: at(300, 220) });
    lay(g, { a: at(300, 220), b: at(420, 100) });
    expect(removeSegmentAt(g.roads!, at(100, 100), at(300, 220), null)).not.toBeNull();
    settle(g);
    expect(freeSegments(g)).toHaveLength(1);
    expect(liveNodes(g.roads!)).toHaveLength(2);
    expect(removeSegmentAt(g.roads!, at(100, 100), at(300, 220), null)).toBeNull();
  });
});

describe('roads off the grid: what is refused', () => {
  it('refuses a straight road along the grid, which the grid tools lay', () => {
    const r = plan(world(), { a: centre(3, 5), b: centre(12, 5) });
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/grid tools/) });
  });

  it('refuses a curve tighter than its class takes, naming the radius', () => {
    const r = plan(world(), { a: at(100, 100), b: at(130, 130), control: at(130, 100) });
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/40 m radius/) });
  });

  it('refuses a motorway curve a street could take', () => {
    const r = plan(world(), {
      tier: RoadTier.Highway,
      a: at(100, 100),
      b: at(300, 300),
      control: at(300, 100),
    });
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/200 m radius/) });
  });

  it('refuses a road shorter than half a tile', () => {
    const r = plan(world(), { a: at(100, 100), b: at(106, 103) });
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/at least 10 m/) });
  });

  it('refuses water, a building, and a slope a road cannot climb', () => {
    const wet = world();
    wet.water[10 * SIZE + 10] = 1;
    expect(plan(wet, { a: at(150, 150), b: at(270, 270) })).toMatchObject({
      reason: expect.stringMatching(/water/),
    });
    const built = world();
    built.buildingId[10 * SIZE + 10] = 7;
    expect(plan(built, { a: at(150, 150), b: at(270, 270) })).toMatchObject({
      reason: expect.stringMatching(/building/),
    });
    const steep = world();
    for (let z = 0; z < SIZE; z++)
      for (let x = 0; x < SIZE; x++) steep.height[z * SIZE + x] = x * 12;
    expect(plan(steep, { a: at(150, 150), b: at(300, 190) })).toMatchObject({
      reason: expect.stringMatching(/steep/),
    });
  });

  it('refuses crossing another free road where there is no junction', () => {
    const g = world();
    lay(g, { a: at(100, 200), b: at(400, 260) });
    const r = plan(g, { a: at(200, 100), b: at(260, 400) });
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/no junction/) });
  });

  it('refuses a road crowding one alongside it', () => {
    const g = world();
    lay(g, { a: at(100, 200), b: at(400, 260) });
    const r = plan(g, { a: at(100, 210), b: at(400, 270) });
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/Too close/) });
  });

  it('meets another free road at a node at 45°, and refuses 20°', () => {
    const g = world();
    lay(g, { a: at(100, 200), b: at(300, 200) });
    expect(plan(g, { a: at(300, 200), b: at(440, 340) })).toMatchObject({ ok: true });
    // Leaving the shared node 20° off the first road's line back toward it.
    const back = { x: -Math.cos(Math.PI / 9), z: Math.sin(Math.PI / 9) };
    const r = plan(g, { a: at(300, 200), b: at(300 + back.x * 150, 200 + back.z * 150) });
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/narrow an angle/) });
  });

  it('holds six roads at one junction and refuses a seventh', () => {
    const g = world();
    const hub = at(480, 480);
    const spoke = (k: number): CmPoint =>
      at(480 + Math.cos((2 * Math.PI * k) / 7) * 150, 480 + Math.sin((2 * Math.PI * k) / 7) * 150);
    for (let k = 0; k < 6; k++) lay(g, { a: hub, b: spoke(k) });
    expect(plan(g, { a: hub, b: spoke(6) })).toMatchObject({
      reason: expect.stringMatching(/At most 6/),
    });
  });

  it('refuses classes that may not meet, and a ramp across a motorway', () => {
    const g = world();
    lay(g, { tier: RoadTier.Highway, a: at(100, 100), b: at(300, 150), flow: 1 });
    lay(g, { tier: RoadTier.Highway, a: at(300, 150), b: at(500, 200), flow: 1 });
    expect(plan(g, { a: at(300, 150), b: at(360, 320) })).toMatchObject({
      reason: expect.stringMatching(/ramp/),
    });
    const along = { x: 200 / Math.hypot(200, 50), z: 50 / Math.hypot(200, 50) };
    const turn = (deg: number): CmPoint => {
      const r = (deg * Math.PI) / 180;
      const d = {
        x: along.x * Math.cos(r) - along.z * Math.sin(r),
        z: along.x * Math.sin(r) + along.z * Math.cos(r),
      };
      return at(300 + d.x * 180, 150 + d.z * 180);
    };
    expect(plan(g, { tier: RoadTier.Ramp, a: at(300, 150), b: turn(45), flow: 1 })).toMatchObject({
      reason: expect.stringMatching(/within 20/),
    });
    expect(plan(g, { tier: RoadTier.Ramp, a: at(300, 150), b: turn(12), flow: 1 })).toMatchObject({
      ok: true,
    });
  });
});

describe('roads off the grid: meeting the grid', () => {
  /** A street along row 20, and a free road leaving tile (20, 20) at an angle. */
  function meeting(): GridState {
    const g = world();
    applyRoad(
      g,
      Array.from({ length: 21 }, (_, i) => ({ x: 10 + i, z: 20 })),
      RoadTier.TwoLane,
    );
    settle(g);
    lay(g, { a: centre(20, 20), b: at(520, 600) });
    return g;
  }

  it('meets a grid road at a tile centre, and the grid keeps a node there', () => {
    const g = meeting();
    expect(freeSegments(g)).toHaveLength(1);
    const node = liveNodes(g.roads!).find(
      (s) => g.roads!.nodeX[s] === tileCentreCm(20) && g.roads!.nodeZ[s] === tileCentreCm(20),
    );
    expect(node).toBeDefined();
    expect(g.roads!.nodeTier[node!]).toBe(RoadTier.TwoLane);
    // The grid's own tiles are exactly as they were.
    const back = createGrid(SIZE);
    expect(deriveRoadLayers(back, g.roads!)).toEqual([]);
    expect(Array.from(back.roadTier)).toEqual(Array.from(g.roadTier));
  });

  it('refuses meeting a grid road anywhere but a tile centre', () => {
    const g = world();
    applyRoad(
      g,
      Array.from({ length: 21 }, (_, i) => ({ x: 10 + i, z: 20 })),
      RoadTier.TwoLane,
    );
    settle(g);
    const r = plan(g, { a: { x: tileCentreCm(20) + 300, z: tileCentreCm(20) }, b: at(520, 600) });
    expect(r).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/centre of one of its tiles/),
    });
  });

  it('refuses running into a grid road away from where it meets one', () => {
    const g = world();
    applyRoad(
      g,
      Array.from({ length: 21 }, (_, i) => ({ x: 10 + i, z: 20 })),
      RoadTier.TwoLane,
    );
    settle(g);
    const r = plan(g, { a: at(250, 300), b: at(560, 330) });
    expect(plan(g, { a: at(250, 300), b: at(560, 360) })).toMatchObject({ ok: true });
    const through = plan(g, { a: at(300, 300), b: at(320, 500) });
    expect(r).toMatchObject({ ok: true });
    expect(through).toMatchObject({ ok: false, reason: expect.stringMatching(/grid/) });
  });

  it('keeps the free road when the grid road it met is bulldozed', () => {
    const g = meeting();
    removeRoad(
      g,
      Array.from({ length: 21 }, (_, i) => ({ x: 10 + i, z: 20 })),
    );
    settle(g);
    expect(freeSegments(g)).toHaveLength(1);
    expect(liveNodes(g.roads!).every((s) => g.roads!.nodeTier[s] === 0)).toBe(true);
    expect(Array.from(g.roadTier).every((t) => t === 0)).toBe(true);
  });
});

describe('roads off the grid: the graph routes along them', () => {
  /** Two grid streets, joined by a free road at 45° between their ends. */
  function joined(): GridState {
    const g = world();
    applyRoad(
      g,
      Array.from({ length: 6 }, (_, i) => ({ x: 5 + i, z: 10 })),
      RoadTier.TwoLane,
    );
    applyRoad(
      g,
      Array.from({ length: 6 }, (_, i) => ({ x: 20 + i, z: 25 })),
      RoadTier.TwoLane,
    );
    settle(g);
    lay(g, { a: centre(10, 10), b: centre(20, 25) });
    return g;
  }

  it('finds a route from one grid street to the other across the free road', () => {
    const g = joined();
    const net = new RoadNetwork();
    net.rebuild(g);
    const path = net.findPath({ x: 5, z: 10 }, { x: 25, z: 25 });
    expect(path).not.toBeNull();
    // Neither street end is a junction, so the whole way is one run: six tiles
    // of street, the free road as long as its centre line, six more of street.
    const edges = net.getEdges();
    expect(edges).toHaveLength(1);
    const centreLine = Math.hypot(10, 15);
    expect(edges[0]!.length).toBeCloseTo(12 + centreLine, 3);
  });

  it('runs a one-way free road the way it was drawn, and no other', () => {
    const g = world();
    lay(g, { tier: RoadTier.OneWay, a: at(100, 100), b: at(400, 300), flow: 1 });
    const net = new RoadNetwork();
    net.rebuild(g);
    const [edge] = net.getEdges();
    expect(edge).toBeDefined();
    const nodeA = net.getNodes()[edge!.a]!;
    const forwardFromA = nodeA.x === 5 && nodeA.z === 5;
    expect(edge!.forwardAtoB).toBe(forwardFromA);
    expect(net.findPath({ x: 5, z: 5 }, { x: 20, z: 15 })).not.toBeNull();
    expect(net.findPath({ x: 20, z: 15 }, { x: 5, z: 5 })).toBeNull();
  });
});

describe('roads off the grid: the land reads them', () => {
  /** A free street running east-north-east across open ground. */
  function street(): GridState {
    const g = world();
    lay(g, { a: at(100, 300), b: at(700, 400) });
    return g;
  }

  it('fronts lots on both sides, out to the zoning depth, and none on its own footprint', () => {
    const g = street();
    const mask = computeZonableMask(g);
    // Its footprint is never zonable.
    for (let i = 0; i < mask.length; i++) if (g.roadFootprint[i]) expect(mask[i]).toBe(0);
    // A tile just beside the road, on either side, is; one far off is not.
    const at20 = (x: number, z: number): number => Math.floor(z / 20) * SIZE + Math.floor(x / 20);
    const line = (x: number): number => 300 + ((x - 100) * 100) / 600;
    expect(mask[at20(400, line(400) - 30)]).toBe(1);
    expect(mask[at20(400, line(400) + 30)]).toBe(1);
    expect(mask[at20(400, line(400) + 150)]).toBe(0);
    expect(mask.some((v) => v === 1)).toBe(true);
  });

  it('keeps buildings and zones off its footprint, and zones the lots it fronts', () => {
    const g = street();
    const covered = Array.from(g.roadFootprint).findIndex((v) => v === 1);
    const cx = covered % SIZE;
    const cz = Math.floor(covered / SIZE);
    expect(canPlaceFootprint(g, cx, cz, 1, 1)).toBe(false);
    expect(setZones(g, [{ x: cx, z: cz }], ZoneType.ResLow)).toEqual([]);
    const mask = computeZonableMask(g);
    const lot = mask.findIndex((v) => v === 1);
    expect(
      setZones(g, [{ x: lot % SIZE, z: Math.floor(lot / SIZE) }], ZoneType.ResLow),
    ).toHaveLength(1);
  });
});
