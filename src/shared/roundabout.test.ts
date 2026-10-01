import { describe, expect, it } from 'vitest';
import { codeForControl } from './junction';
import { presetProfileForTier } from './roadprofile';
import {
  blockIntact,
  blockTiles,
  compactRoundaboutAt,
  compactRoundaboutsAmong,
  effectiveControlCode,
  oneLaneEachWay,
  ringArc,
  ringArcTiles,
  ringCentre,
  ringPoint,
  RING_ROUTE_RADIUS_M,
  RING_MAX_GRADE,
  roundaboutAtJunction,
  roundaboutBlockOf,
  roundaboutCommands,
  roundaboutLegs,
  roundaboutPlan,
  ROUNDABOUT_REFUSALS,
  runsRound,
  type RoundaboutGround,
  type RoundaboutRoad,
} from './roundabout';
import { RoadFlow, RoadTier } from './types';
import type { TilePoint } from './types';
import { TILE_METERS } from './constants';

const ROUNDABOUT = codeForControl('roundabout');
const key = (x: number, z: number): string => `${x},${z}`;

interface Fixture {
  roads: Map<string, RoundaboutRoad>;
  /** Pairs of neighbouring roads that are NOT joined. */
  apart: Set<string>;
  codes: Map<string, number>;
  heights: Map<string, number>;
  blocked: Set<string>;
  over: Set<string>;
  offGrid: Set<string>;
}

function fixture(): Fixture {
  return {
    roads: new Map(),
    apart: new Set(),
    codes: new Map(),
    heights: new Map(),
    blocked: new Set(),
    over: new Set(),
    offGrid: new Set(),
  };
}

function road(f: Fixture, tiles: TilePoint[], tier: RoadTier = RoadTier.TwoLane): void {
  for (const t of tiles) {
    f.roads.set(key(t.x, t.z), {
      tier,
      profile: presetProfileForTier(tier),
      corridor: false,
      elevation: 0,
    });
  }
}

const row = (z: number, x0: number, x1: number): TilePoint[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, z }));
const col = (x: number, z0: number, z1: number): TilePoint[] =>
  Array.from({ length: z1 - z0 + 1 }, (_, i) => ({ x, z: z0 + i }));

/**
 * Every neighbouring pair of roads joins, unless held apart; rail joins
 * nothing but rail, and a motorway nothing but a motorway.
 */
function ground(f: Fixture): RoundaboutGround {
  const joins = (x: number, z: number, nx: number, nz: number): boolean => {
    const a = f.roads.get(key(x, z));
    const b = f.roads.get(key(nx, nz));
    if (!a || !b) return false;
    if ((a.tier === RoadTier.RailTrack) !== (b.tier === RoadTier.RailTrack)) return false;
    if ((a.tier === RoadTier.Highway) !== (b.tier === RoadTier.Highway)) return false;
    return (
      !f.apart.has(`${key(x, z)}|${key(nx, nz)}`) && !f.apart.has(`${key(nx, nz)}|${key(x, z)}`)
    );
  };
  return {
    codeAt: (x, z) => f.codes.get(key(x, z)) ?? 0,
    groundStreetAt: (x, z) => {
      const r = f.roads.get(key(x, z));
      return !!r && r.tier !== RoadTier.RailTrack && r.elevation === 0;
    },
    maskAt: (x, z) =>
      (joins(x, z, x, z - 1) ? 1 : 0) |
      (joins(x, z, x + 1, z) ? 2 : 0) |
      (joins(x, z, x, z + 1) ? 4 : 0) |
      (joins(x, z, x - 1, z) ? 8 : 0),
    roadAt: (x, z) => f.roads.get(key(x, z)) ?? null,
    overRoadAt: (x, z) => f.over.has(key(x, z)),
    offGridAt: (x, z) => f.offGrid.has(key(x, z)),
    buildableAt: (x, z) => !f.blocked.has(key(x, z)),
    heightAt: (x, z) => f.heights.get(key(x, z)) ?? 0,
  };
}

/** A crossroads at (20, 20): a street along row 20 and one down column 20. */
function crossroads(): Fixture {
  const f = fixture();
  road(f, row(20, 15, 25));
  road(f, col(20, 15, 25));
  return f;
}

/** The block south-east of the crossing, laid and coded as a roundabout. */
function laidRoundabout(f: Fixture = crossroads()): Fixture {
  road(f, [{ x: 21, z: 21 }]);
  for (const t of blockTiles({ x: 20, z: 20 })) f.codes.set(key(t.x, t.z), ROUNDABOUT);
  return f;
}

describe('the block a tile belongs to', () => {
  it('is the block of four roundabout-coded tiles holding it', () => {
    const f = laidRoundabout();
    const codeAt = ground(f).codeAt;
    for (const t of blockTiles({ x: 20, z: 20 })) {
      expect(roundaboutBlockOf(t.x, t.z, codeAt)).toEqual({ x: 20, z: 20 });
    }
    expect(roundaboutBlockOf(22, 20, codeAt)).toBeNull();
  });

  it('is a compact roundabout only while its four tiles are joined round the square', () => {
    const f = laidRoundabout();
    expect(compactRoundaboutAt(21, 21, ground(f))).toEqual({ x: 20, z: 20 });
    f.apart.add(`${key(21, 21)}|${key(21, 20)}`);
    expect(blockIntact({ x: 20, z: 20 }, ground(f))).toBe(false);
    expect(compactRoundaboutAt(21, 21, ground(f))).toBeNull();
  });

  it('reads the codes of a block that is no longer a roundabout as no override, and a lone one as a mini roundabout', () => {
    const f = laidRoundabout();
    f.roads.delete(key(21, 21));
    expect(effectiveControlCode(20, 20, ground(f))).toBe(0);
    const g = fixture();
    road(g, row(5, 3, 7));
    road(g, col(5, 3, 7));
    g.codes.set(key(5, 5), ROUNDABOUT);
    expect(effectiveControlCode(5, 5, ground(g))).toBe(ROUNDABOUT);
  });

  it('finds every roundabout once, whichever of its corners is asked', () => {
    const f = laidRoundabout();
    expect(compactRoundaboutsAmong(blockTiles({ x: 20, z: 20 }), ground(f))).toEqual([
      { x: 20, z: 20 },
    ]);
  });
});

describe('the ring', () => {
  const block = { x: 20, z: 20 };

  it('is centred on the corner the four tiles share', () => {
    expect(ringCentre(block)).toEqual({ x: 21 * TILE_METERS, z: 21 * TILE_METERS });
  });

  it('runs anticlockwise seen from above: north-east, north-west, south-west, south-east', () => {
    const ne = { x: 21, z: 20 };
    const nw = { x: 20, z: 20 };
    const sw = { x: 20, z: 21 };
    const se = { x: 21, z: 21 };
    expect(runsRound(block, ne, nw)).toBe(true);
    expect(runsRound(block, nw, sw)).toBe(true);
    expect(runsRound(block, sw, se)).toBe(true);
    expect(runsRound(block, se, ne)).toBe(true);
    expect(runsRound(block, nw, ne)).toBe(false);
  });

  it('puts each corner’s point on the route, on the diagonal through its centre', () => {
    const c = ringCentre(block);
    const p = ringPoint(block, { x: 20, z: 20 });
    expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeCloseTo(RING_ROUTE_RADIUS_M, 9);
    expect(p.x - c.x).toBeCloseTo(p.z - c.z, 9);
    expect(p.x).toBeLessThan(c.x);
  });

  it('drives an arc round the route from one corner’s point to the next, never inside it', () => {
    const tiles = [
      { x: 21, z: 20 },
      { x: 20, z: 20 },
      { x: 20, z: 21 },
    ];
    const arc = ringArc(block, tiles);
    const c = ringCentre(block);
    expect(arc[0]).toEqual(ringPoint(block, tiles[0]!));
    expect(arc[arc.length - 1]).toEqual(ringPoint(block, tiles[2]!));
    for (const p of arc)
      expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeCloseTo(RING_ROUTE_RADIUS_M, 6);
    // Half a turn, going the way the ring runs: the angle only ever falls.
    const angles = arc.map((p) => Math.atan2(p.z - c.z, p.x - c.x));
    const unwrapped = angles.map((a, i) => (i > 0 && a > angles[0]! ? a - 2 * Math.PI : a));
    for (let i = 1; i < unwrapped.length; i++)
      expect(unwrapped[i]!).toBeLessThan(unwrapped[i - 1]!);
  });

  it('is as long as the lane’s centre is round it', () => {
    expect(ringArcTiles(4)).toBeCloseTo((2 * Math.PI * (18 - 5.5 / 2)) / TILE_METERS, 9);
  });
});

describe('a roundabout laid on a junction', () => {
  it('takes the block on the quarter of the tile the pointer is in, and lays its missing corner', () => {
    const plan = roundaboutAtJunction({ x: 20, z: 20 }, true, true, ground(crossroads()));
    expect(plan.refusal).toBeNull();
    expect(plan.block).toEqual({ x: 20, z: 20 });
    expect(plan.toLay).toEqual([{ x: 21, z: 21 }]);
    expect(plan.legs.map((l) => l.side).sort()).toEqual(
      [RoadFlow.North, RoadFlow.East, RoadFlow.South, RoadFlow.West].sort(),
    );
    const other = roundaboutAtJunction({ x: 20, z: 20 }, false, false, ground(crossroads()));
    expect(other.block).toEqual({ x: 19, z: 19 });
    expect(other.toLay).toEqual([{ x: 19, z: 19 }]);
  });

  it('lays two corners on a tee, as one run', () => {
    const f = fixture();
    road(f, row(20, 15, 25));
    road(f, col(20, 20, 25));
    const plan = roundaboutAtJunction({ x: 20, z: 20 }, true, false, ground(f));
    expect(plan.refusal).toBeNull();
    expect(plan.toLay).toEqual([
      { x: 20, z: 19 },
      { x: 21, z: 19 },
    ]);
    expect(plan.legs).toHaveLength(3);
  });

  it('is refused anywhere but a street junction', () => {
    const f = fixture();
    road(f, row(20, 15, 25));
    expect(roundaboutAtJunction({ x: 20, z: 20 }, true, true, ground(f)).refusal).toBe(
      ROUNDABOUT_REFUSALS.notJunction,
    );
    expect(roundaboutAtJunction({ x: 3, z: 3 }, true, true, ground(f)).refusal).toBe(
      ROUNDABOUT_REFUSALS.notJunction,
    );
  });

  it('is sent as the road it lays, on the ground, and then the roundabout', () => {
    const plan = roundaboutAtJunction({ x: 20, z: 20 }, true, true, ground(crossroads()));
    expect(roundaboutCommands(plan, RoadTier.TwoLane)).toEqual([
      {
        kind: 'buildRoad',
        tier: RoadTier.TwoLane,
        tiles: [{ x: 21, z: 21 }],
        elevations: [0],
      },
      { kind: 'buildRoundabout', x: 20, z: 20 },
    ]);
    const laid = roundaboutPlan({ x: 20, z: 20 }, ground(laidRoundabout(crossroads())));
    expect(roundaboutCommands({ ...laid, refusal: null }, RoadTier.TwoLane, 14)).toEqual([
      { kind: 'buildRoundabout', x: 20, z: 20 },
    ]);
  });

  it('reads the legs of a laid block off its corners’ masks', () => {
    const f = laidRoundabout();
    const legs = roundaboutLegs({ x: 20, z: 20 }, ground(f).maskAt);
    expect(legs.map((l) => ({ tile: l.tile, side: l.side }))).toEqual([
      { tile: { x: 20, z: 19 }, side: RoadFlow.North },
      { tile: { x: 19, z: 20 }, side: RoadFlow.West },
      { tile: { x: 22, z: 20 }, side: RoadFlow.East },
      { tile: { x: 20, z: 22 }, side: RoadFlow.South },
    ]);
  });
});

describe('what refuses a roundabout', () => {
  const at = (f: Fixture): string | null =>
    roundaboutAtJunction({ x: 20, z: 20 }, true, true, ground(f)).refusal;

  it('one already there', () => {
    expect(at(laidRoundabout())).toBe(ROUNDABOUT_REFUSALS.already);
  });

  it('a building, water or steep ground where a corner is to be laid', () => {
    const f = crossroads();
    f.blocked.add(key(21, 21));
    expect(at(f)).toBe(ROUNDABOUT_REFUSALS.inTheWay);
  });

  it('a road off the grid, a bridge or a road passing over', () => {
    const offGrid = crossroads();
    offGrid.offGrid.add(key(21, 21));
    expect(at(offGrid)).toBe(ROUNDABOUT_REFUSALS.offGrid);
    const over = crossroads();
    over.over.add(key(21, 20));
    expect(at(over)).toBe(ROUNDABOUT_REFUSALS.raised);
    const raised = crossroads();
    raised.roads.set(key(20, 22), { ...raised.roads.get(key(20, 22))!, elevation: 2 });
    expect(at(raised)).toBe(ROUNDABOUT_REFUSALS.raised);
  });

  it('a road of more than one lane each way, on it or into it', () => {
    const f = fixture();
    road(f, row(20, 15, 25), RoadTier.FourLane);
    road(f, col(20, 15, 25));
    expect(at(f)).toBe(ROUNDABOUT_REFUSALS.wide);
    expect(oneLaneEachWay(presetProfileForTier(RoadTier.TwoLane))).toBe(true);
    expect(oneLaneEachWay(presetProfileForTier(RoadTier.FourLane))).toBe(false);
  });

  it('a tramway, a motorway, or a slip road running round it', () => {
    const tram = fixture();
    road(tram, row(20, 15, 25));
    road(tram, col(20, 15, 25), RoadTier.Tram);
    expect(at(tram)).toBe(ROUNDABOUT_REFUSALS.tramway);
    const motorway = crossroads();
    road(motorway, [{ x: 22, z: 21 }], RoadTier.Highway);
    expect(at(motorway)).toBe(ROUNDABOUT_REFUSALS.motorway);
    const ramp = fixture();
    road(ramp, row(20, 15, 25));
    road(ramp, col(20, 15, 19));
    road(ramp, col(20, 21, 25), RoadTier.Ramp);
    expect(at(ramp)).toBe(ROUNDABOUT_REFUSALS.slipRoad);
  });

  it('a railway on a corner', () => {
    const f = crossroads();
    road(f, [{ x: 21, z: 21 }], RoadTier.RailTrack);
    expect(at(f)).toBe(ROUNDABOUT_REFUSALS.railway);
  });

  it('two of its roads held apart', () => {
    const f = laidRoundabout();
    f.codes.clear();
    f.apart.add(`${key(21, 21)}|${key(21, 20)}`);
    expect(at(f)).toBe(ROUNDABOUT_REFUSALS.apart);
  });

  it('two roads on one side, even held apart from each other', () => {
    const f = crossroads();
    road(f, row(21, 22, 25));
    f.apart.add(`${key(22, 20)}|${key(22, 21)}`);
    expect(at(f)).toBe(ROUNDABOUT_REFUSALS.sideTwice);
  });

  it('two roads on one side joined to each other, which is a junction beside it', () => {
    const f = crossroads();
    road(f, row(21, 22, 25));
    expect(at(f)).toBe(ROUNDABOUT_REFUSALS.junctionClose);
  });

  it('a junction on a leg’s first tile', () => {
    const f = crossroads();
    road(f, col(22, 16, 19));
    expect(at(f)).toBe(ROUNDABOUT_REFUSALS.junctionClose);
  });

  it('fewer than three roads into it', () => {
    const f = fixture();
    road(f, row(20, 15, 20));
    road(f, col(20, 15, 20));
    road(f, [{ x: 20, z: 21 }]);
    // A corner with two arms is not a junction; one with three but only two
    // roads out of the block has two legs.
    expect(at(f)).toBe(ROUNDABOUT_REFUSALS.legCount);
  });

  it('ground rising more than the steepest grade across it', () => {
    const f = crossroads();
    const rise = TILE_METERS * RING_MAX_GRADE;
    f.heights.set(key(21, 20), rise * 0.9);
    f.heights.set(key(21, 21), rise * 0.9);
    expect(at(f)).toBeNull();
    f.heights.set(key(21, 21), rise * 1.1);
    f.heights.set(key(21, 20), rise * 1.1);
    expect(at(f)).toBe(ROUNDABOUT_REFUSALS.steep);
  });
});
