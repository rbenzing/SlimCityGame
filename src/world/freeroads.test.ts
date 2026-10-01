import { describe, expect, it } from 'vitest';
import { RoadTier, ZoneType } from '../shared/types';
import type { GridState, RoadTier as Tier } from '../shared/types';
import { sampleCentreLine, tileCentreCm } from '../shared/roadgeom';
import type { CmPoint } from '../shared/roadgeom';
import { canPlaceFootprint, createGrid, setZones } from './grid';
import { computeZonableMask } from './zonable';
import { applyRoad, removeRoad } from './roads';
import {
  deriveRoadLayers,
  encodeRoadNetwork,
  isFreeSegment,
  liveNodes,
  liveSegments,
  networkFromGrid,
  reconcileRoads,
  segmentGeom,
  syncRoadLayers,
} from './roadnet';
import {
  deriveRoadFootprint,
  gridRunRefusal,
  gridRunRefusalAfter,
  joinSegmentsAt,
  laySegment,
  moveRoadEnd,
  nearestRoadEnd,
  nearestRoadPoint,
  planSegment,
  planWithSplits,
  removeSegmentAt,
  RUNS_INTO_FREE_ROAD,
  snapRoadEnd,
  splitRefusal,
  splitSegment,
} from './freeroads';
import { RoadNetwork } from './roadgraph';
import { composeProfile, NO_EDITS, presetProfileForTier } from '../shared/roadprofile';

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

  it('refuses a motorway carrying a sound wall, which stands only along a road on the grid', () => {
    const walled = composeProfile(presetProfileForTier(RoadTier.Highway), {
      ...NO_EDITS,
      soundWall: 'right',
      soundWallHeight: 4.5,
    });
    const g = world();
    const ask = request({ tier: RoadTier.Highway, a: at(100, 100), b: at(400, 300) });
    const r = planSegment(g, g.roads!, { ...ask, profileId: 13 }, (id) =>
      id === 13 ? walled : null,
    );
    expect(r).toEqual({ ok: false, reason: 'A sound wall goes only along a road on the grid' });
    // The same road without one is fine.
    expect(planSegment(g, g.roads!, ask, noCustom).ok).toBe(true);
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

describe('where a dropped road end lands', () => {
  it('lands on a node, else on a free road, else a grid road tile’s centre, else where dropped', () => {
    const g = world();
    applyRoad(
      g,
      Array.from({ length: 6 }, (_, i) => ({ x: 5 + i, z: 5 })),
      RoadTier.TwoLane,
    );
    settle(g);
    lay(g, { a: at(300, 300), b: at(420, 300) });
    // Three metres from the free road's end: onto the end.
    expect(snapRoadEnd(g, at(302, 302))).toEqual({ at: at(300, 300), splits: false });
    // Beside it partway along: onto its centre line, which it will split.
    expect(snapRoadEnd(g, at(350, 303))).toEqual({ at: at(350, 300), splits: true });
    // Too far off it: nowhere near a road.
    expect(snapRoadEnd(g, at(350, 310))).toEqual({ at: at(350, 310), splits: false });
    // Anywhere on a grid road's tile: its centre.
    expect(snapRoadEnd(g, at(141, 103))).toEqual({ at: centre(7, 5), splits: false });
    // Open ground: exactly where it was dropped.
    expect(snapRoadEnd(g, at(600, 600))).toEqual({ at: at(600, 600), splits: false });
  });

  it('lands on a road end within half a tile, ahead of the road it would otherwise split', () => {
    const g = world();
    lay(g, { a: at(300, 300), b: at(420, 300) });
    // On the centre line eight metres short of the end: the end takes it.
    expect(snapRoadEnd(g, at(308, 300))).toEqual({ at: at(300, 300), splits: false });
    // Past half a tile from it: onto the centre line, splitting it.
    expect(snapRoadEnd(g, at(311, 300))).toEqual({ at: at(311, 300), splits: true });
  });
});

describe('moving a road end onto a tile centre', () => {
  /** The one free road's ends and control, as metres, and its tier, profile and flow. */
  const onlyFree = (g: GridState) => {
    const [s] = freeSegments(g);
    const geom = segmentGeom(g.roads!, s!);
    return {
      a: geom.a,
      b: geom.b,
      control: geom.control,
      facts: [g.roads!.segTier[s!], g.roads!.segProfile[s!], g.roads!.segFlow[s!]],
    };
  };

  it('lays the road again with that end moved, and everything else as it was', () => {
    const g = world();
    lay(g, {
      a: at(304, 303),
      b: at(420, 330),
      control: at(360, 280),
      tier: RoadTier.OneWay,
      flow: 1,
    });
    const before = onlyFree(g);
    expect(moveRoadEnd(g, g.roads!, { from: at(304, 303), to: centre(15, 15) }, noCustom)).toEqual({
      ok: true,
    });
    settle(g);
    expect(freeSegments(g)).toHaveLength(1);
    expect(onlyFree(g)).toEqual({ ...before, a: centre(15, 15) });
    // The old end is gone with it.
    expect(liveNodes(g.roads!).some((n) => g.roads!.nodeX[n] === 30400)).toBe(false);
  });

  it('refuses a move that would break a rule, with that rule, and changes nothing', () => {
    const g = world();
    // A road ending 16 m short of another: kerb to kerb they clear; moved to
    // its tile's centre it would stop 10 m short, closer than their widths.
    lay(g, { a: at(300, 404), b: at(404, 404) });
    lay(g, { a: at(420, 300), b: at(420, 500) });
    const saved = encodeRoadNetwork(g.roads!);
    expect(moveRoadEnd(g, g.roads!, { from: at(404, 404), to: centre(20, 20) }, noCustom)).toEqual({
      ok: false,
      reason: 'Too close to another road',
    });
    expect(encodeRoadNetwork(g.roads!)).toEqual(saved);
  });

  it('moves only an end no other road meets, and only half a tile each way', () => {
    const g = world();
    lay(g, { a: at(300, 304), b: at(400, 330) });
    lay(g, { a: at(400, 330), b: at(460, 420) });
    const move = (from: CmPoint, to: CmPoint) => moveRoadEnd(g, g.roads!, { from, to }, noCustom);
    expect(move(at(400, 330), centre(20, 16))).toEqual({ ok: false, reason: 'invalid' });
    expect(move(at(300, 304), at(300, 316))).toEqual({ ok: false, reason: 'invalid' });
    expect(move(at(300, 304), at(310, 310))).toEqual({ ok: true });
  });

  it('lets a grid run onto the tile a curve ends on once the end is moved to its centre', () => {
    const g = world();
    lay(g, { a: at(304, 303), b: at(420, 390) });
    const run = Array.from({ length: 6 }, (_, i) => ({ x: 15, z: 15 - i }));
    const move = { from: at(304, 303), to: centre(15, 15) };
    expect(gridRunRefusalAfter(g, g.roads!, run, [], noCustom)).toBe(RUNS_INTO_FREE_ROAD);
    expect(gridRunRefusalAfter(g, g.roads!, run, [move], noCustom)).toBeNull();
    // Judged against a copy: the world itself is untouched.
    expect(onlyFree(g).a).toEqual(at(304, 303));
  });
});

describe('a road end', () => {
  /** A street along row 5 from x = 5 to 10, and a side street down to it from (7, 1). */
  function tee(): GridState {
    const g = world();
    applyRoad(
      g,
      Array.from({ length: 6 }, (_, i) => ({ x: 5 + i, z: 5 })),
      RoadTier.TwoLane,
    );
    applyRoad(
      g,
      Array.from({ length: 4 }, (_, i) => ({ x: 7, z: 1 + i })),
      RoadTier.TwoLane,
    );
    settle(g);
    return g;
  }

  it('is the end tile of a grid road, found from anywhere within half a tile of its centre', () => {
    const g = tee();
    expect(nearestRoadEnd(g.roads!, at(106, 107))).toEqual(centre(5, 5));
    expect(nearestRoadEnd(g.roads!, at(151, 36))).toEqual(centre(7, 1));
    expect(nearestRoadEnd(g.roads!, at(122, 110))).toBeNull();
  });

  it('is the end node of a road off the grid', () => {
    const g = world();
    lay(g, { a: at(300, 300), b: at(420, 330) });
    expect(nearestRoadEnd(g.roads!, at(425, 334))).toEqual(at(420, 330));
  });

  it('is never a junction, however near it the cursor is', () => {
    const g = tee();
    expect(nearestRoadEnd(g.roads!, centre(7, 5))).toBeNull();
  });
});

describe('splitting a free road, and joining it back', () => {
  /** The free roads of the network, as ends and control, sorted. */
  const shapes = (g: GridState): string[] =>
    freeSegments(g)
      .map((s) => {
        const geom = segmentGeom(g.roads!, s);
        const c = geom.control ? `${geom.control.x},${geom.control.z}` : '-';
        return `${geom.a.x},${geom.a.z}>${geom.b.x},${geom.b.z}~${c}`;
      })
      .sort();

  it('cuts a curve in two at a point on it and joins it back exactly', () => {
    const g = world();
    lay(g, {
      tier: RoadTier.OneWay,
      a: at(100, 100),
      b: at(400, 400),
      control: at(400, 100),
      flow: 1,
    });
    const before = shapes(g);
    // The curve passes (325, 175) halfway along; this is a few metres off it.
    const rp = nearestRoadPoint(g.roads!, at(328, 179), 10)!;
    expect(rp).not.toBeNull();
    expect(splitRefusal(g.roads!, rp)).toBeNull();
    splitSegment(g.roads!, rp);
    const halves = freeSegments(g);
    expect(halves).toHaveLength(2);
    // Both pieces keep the road, and run on the way it was drawn.
    for (const s of halves) {
      expect(g.roads!.segTier[s]).toBe(RoadTier.OneWay);
      expect(g.roads!.segFlow[s]).toBe(1);
    }
    // The two pieces meet at the split point, and it lies on the old curve.
    expect(liveNodes(g.roads!).filter((n) => g.roads!.nodeX[n] === rp.at.x)).toHaveLength(1);
    expect(joinSegmentsAt(g.roads!, rp.at, at(400, 100))).toBe(true);
    expect(shapes(g)).toEqual(before);
  });

  it('refuses a split too near a road’s end, and a join where no two pieces meet', () => {
    const g = world();
    lay(g, { a: at(100, 100), b: at(300, 150) });
    const nearEnd = nearestRoadPoint(g.roads!, at(104, 101), 5)!;
    expect(splitRefusal(g.roads!, nearEnd)).toMatch(/near the end/);
    expect(joinSegmentsAt(g.roads!, at(100, 100), null)).toBe(false);
  });

  it('plans a road ending partway along another as though that road were split there', () => {
    const g = world();
    lay(g, { a: at(100, 300), b: at(500, 300) });
    const req = {
      tier: RoadTier.TwoLane,
      profileId: RoadTier.TwoLane,
      a: at(300, 100),
      b: at(300, 300),
      control: null,
      flow: 0,
    };
    // Without the split the new road runs into the old one between its nodes.
    expect(planSegment(g, g.roads!, req, noCustom).ok).toBe(false);
    expect(planWithSplits(g, g.roads!, req, [at(300, 300)], noCustom).ok).toBe(true);
    // And the plan leaves the real network as it was.
    expect(freeSegments(g)).toHaveLength(1);
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

  it('lets a grid run onto a free road’s ground only at the tile centre where they meet', () => {
    const g = meeting();
    const junction = 20 * SIZE + 20;
    const covered = [...g.roadFootprint.keys()].filter(
      (i) => g.roadFootprint[i] === 1 && i !== junction,
    );
    expect(g.roadFootprint[junction]).toBe(1);
    expect(covered.length).toBeGreaterThan(0);
    const tileOf = (i: number) => ({ x: i % SIZE, z: Math.floor(i / SIZE) });
    // The tile centre the free road meets the street at is the grid's to enter…
    expect(
      gridRunRefusal(g, g.roads!, [
        { x: 19, z: 20 },
        { x: 20, z: 20 },
      ]),
    ).toBeNull();
    // …and every other tile the free road covers is not, wherever in the run.
    for (const i of covered) {
      expect(gridRunRefusal(g, g.roads!, [{ x: 0, z: 0 }, tileOf(i)])).toBe(RUNS_INTO_FREE_ROAD);
    }
    // Ground it does not cover, and tiles off the map, say nothing.
    expect(
      gridRunRefusal(g, g.roads!, [
        { x: 2, z: 2 },
        { x: -1, z: 3 },
        { x: SIZE, z: 0 },
      ]),
    ).toBeNull();
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

  it.each([false, true])(
    'gives a route that drives the free road’s own curve, either way, without a jump (drawn backwards: %s)',
    (backwards) => {
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
      const [p, q] = backwards
        ? [centre(20, 25), centre(10, 10)]
        : [centre(10, 10), centre(20, 25)];
      lay(g, { a: p, b: q, control: centre(20, 10) });
      const [seg] = freeSegments(g);
      const curve = sampleCentreLine(segmentGeom(g.roads!, seg!));
      const street = new Set(
        [
          ...Array.from({ length: 6 }, (_, i) => [5 + i, 10]),
          ...Array.from({ length: 6 }, (_, i) => [20 + i, 25]),
        ].map(([x, z]) => `${(x! + 0.5) * 20},${(z! + 0.5) * 20}`),
      );
      const net = new RoadNetwork();
      net.rebuild(g);
      for (const [from, to] of [
        [
          { x: 5, z: 10 },
          { x: 25, z: 25 },
        ],
        [
          { x: 25, z: 25 },
          { x: 5, z: 10 },
        ],
      ] as const) {
        const route = net.findPath(from, to)!.route!;
        expect(route[0]).toEqual({ x: (from.x + 0.5) * 20, z: (from.z + 0.5) * 20 });
        expect(route.at(-1)).toEqual({ x: (to.x + 0.5) * 20, z: (to.z + 0.5) * 20 });
        for (let i = 0; i < route.length; i++) {
          const p = route[i]!;
          const onCurve = curve.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 1e-3);
          expect(onCurve || street.has(`${p.x},${p.z}`), `point ${i} at ${p.x},${p.z}`).toBe(true);
          if (i > 0) {
            const q = route[i - 1]!;
            expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeLessThanOrEqual(20 + 1e-6);
          }
        }
        // The curve is driven closely, not cut across by a chord or two, and
        // steadily from one end to the other, never doubling back.
        const along = route
          .filter((p) => !street.has(`${p.x},${p.z}`))
          .map((p) => curve.find((c) => Math.hypot(c.x - p.x, c.z - p.z) < 1e-3)!.s);
        expect(along.length).toBeGreaterThan(curve.at(-1)!.s / 6);
        const rising = along[along.length - 1]! > along[0]!;
        for (let i = 1; i < along.length; i++) {
          expect(rising ? along[i]! > along[i - 1]! : along[i]! < along[i - 1]!).toBe(true);
        }
      }
    },
  );

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

  it('leaves no unzoned strip between its footprint and the lots it fronts, at any angle', () => {
    for (const tier of [RoadTier.TwoLane, RoadTier.FourLane]) {
      for (const rise of [0, 100, 250, 400]) {
        for (const across of [false, true]) {
          const g = world();
          // Along x, rising `rise` in z; or the same road turned to run along z.
          const p = (u: number, v: number) => (across ? at(v, u) : at(u, v));
          lay(g, { tier, a: p(100, 300), b: p(700, 300 + rise) });
          const mask = computeZonableMask(g);
          const line = (u: number): number => 300 + ((u - 100) * rise) / 600;
          const idx = (u: number, v: number): number => (across ? u * SIZE + v : v * SIZE + u);
          // Every tile row across the road away from its ends: the first tile
          // off the footprint, either side, is a lot it fronts.
          for (let tu = 8; tu <= 32; tu++) {
            const tv = Math.floor(line(tu * 20 + 10) / 20);
            for (const step of [-1, 1]) {
              let v = tv;
              while (g.roadFootprint[idx(tu, v)]) v += step;
              expect(
                mask[idx(tu, v)],
                `tier ${tier}, rise ${rise}, across ${across}, row ${tu}, side ${step}`,
              ).toBe(1);
            }
          }
        }
      }
    }
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
