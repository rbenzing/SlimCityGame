import { describe, expect, it } from 'vitest';
import {
  CUL_DE_SAC_CODE,
  CUL_DE_SAC_RADIUS_M,
  CUL_DE_SAC_REFUSALS,
  CUL_DE_SAC_ROUTE_RADIUS_M,
  culDeSacArc,
  culDeSacAtEnd,
  culDeSacBlockOf,
  culDeSacCommands,
  culDeSacPlan,
  culDeSacPoint,
  culDeSacsAmong,
  loopRunsRound,
} from './culdesac';
import { codeForControl, controlFromCode } from './junction';
import { presetProfileForTier } from './roadprofile';
import { blockTiles, ringCentre, type RoundaboutGround, type RoundaboutRoad } from './roundabout';
import { RoadTier } from './types';
import type { RoadProfile, TilePoint } from './types';

const key = (x: number, z: number): string => `${x},${z}`;

interface Fixture {
  roads: Map<string, RoundaboutRoad>;
  apart: Set<string>;
  codes: Map<string, number>;
  blocked: Set<string>;
  over: Set<string>;
  offGrid: Set<string>;
}

function fixture(): Fixture {
  return {
    roads: new Map(),
    apart: new Set(),
    codes: new Map(),
    blocked: new Set(),
    over: new Set(),
    offGrid: new Set(),
  };
}

function road(
  f: Fixture,
  tiles: TilePoint[],
  tier: RoadTier = RoadTier.TwoLane,
  profile: RoadProfile = presetProfileForTier(tier),
): void {
  for (const t of tiles) {
    f.roads.set(key(t.x, t.z), { tier, profile, corridor: false, elevation: 0 });
  }
}

const col = (x: number, z0: number, z1: number): TilePoint[] =>
  Array.from({ length: z1 - z0 + 1 }, (_, i) => ({ x, z: z0 + i }));

function ground(f: Fixture): RoundaboutGround {
  const joins = (x: number, z: number, nx: number, nz: number): boolean => {
    const a = f.roads.get(key(x, z));
    const b = f.roads.get(key(nx, nz));
    if (!a || !b) return false;
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
    heightAt: () => 0,
  };
}

/** A street down column 20 from row 10 that ends at (20, 20), facing south. */
function deadEnd(): Fixture {
  const f = fixture();
  road(f, col(20, 10, 20));
  return f;
}

const END = { x: 20, z: 20 };
/** The block beyond that end, to its east side. */
const BLOCK = { x: 20, z: 21 };

/** The dead end with its block laid as street and coded. */
function laid(f: Fixture = deadEnd()): Fixture {
  road(f, blockTiles(BLOCK));
  for (const t of blockTiles(BLOCK)) f.codes.set(key(t.x, t.z), CUL_DE_SAC_CODE);
  return f;
}

describe('the cul-de-sac code', () => {
  it('is its own number after the last control, and reads as no control', () => {
    expect(CUL_DE_SAC_CODE).toBeGreaterThan(codeForControl('roundabout'));
    expect(controlFromCode(CUL_DE_SAC_CODE)).toBeNull();
  });

  it('is a turning circle of 96 ft across, which fits its block with its footway', () => {
    expect(CUL_DE_SAC_RADIUS_M).toBeCloseTo((96 / 2) * 0.3048, 1);
    expect(CUL_DE_SAC_RADIUS_M).toBeLessThan(20);
    expect(CUL_DE_SAC_ROUTE_RADIUS_M).toBeLessThan(CUL_DE_SAC_RADIUS_M);
  });
});

describe('the cul-de-sac a tile belongs to', () => {
  it('is the block of four coded tiles at the end of exactly one street', () => {
    const f = laid();
    for (const t of blockTiles(BLOCK)) {
      const c = culDeSacBlockOf(t.x, t.z, ground(f));
      expect(c).toMatchObject(BLOCK);
      expect(c?.leg.tile).toEqual(END);
      expect(c?.leg.from).toEqual({ x: 20, z: 21 });
    }
    expect(culDeSacBlockOf(END.x, END.z, ground(f))).toBeNull();
  });

  it('is plain road where its tiles are not joined round the square', () => {
    const f = laid();
    f.apart.add(`${key(21, 21)}|${key(21, 22)}`);
    expect(culDeSacBlockOf(21, 21, ground(f))).toBeNull();
  });

  it('is plain road once a second street leaves the block', () => {
    const f = laid();
    road(f, col(22, 21, 26));
    expect(culDeSacBlockOf(21, 21, ground(f))).toBeNull();
  });

  it('is plain road once the street that met it is gone', () => {
    const f = laid();
    f.roads.delete(key(END.x, END.z));
    expect(culDeSacBlockOf(21, 21, ground(f))).toBeNull();
  });

  it('is plain road when one tile of the block is on a deck', () => {
    const f = laid();
    f.roads.set(key(21, 22), { ...f.roads.get(key(21, 22))!, elevation: 5 });
    expect(culDeSacBlockOf(20, 21, ground(f))).toBeNull();
  });

  it('is found once each among the coded tiles', () => {
    const f = laid();
    const found = culDeSacsAmong([...blockTiles(BLOCK), ...blockTiles(BLOCK)], ground(f));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject(BLOCK);
  });
});

describe('where the tool lays one', () => {
  it('puts the block beyond the end, on the side the pointer is on', () => {
    const east = culDeSacAtEnd(END, true, true, ground(deadEnd()));
    expect(east.refusal).toBeNull();
    expect(east.block).toEqual({ x: 20, z: 21 });
    expect(east.toLay).toEqual(blockTiles(east.block));
    const west = culDeSacAtEnd(END, false, true, ground(deadEnd()));
    expect(west.refusal).toBeNull();
    expect(west.block).toEqual({ x: 19, z: 21 });
  });

  it('turns to face a street that ends going another way', () => {
    const f = fixture();
    road(
      f,
      Array.from({ length: 11 }, (_, i) => ({ x: 10 + i, z: 20 })),
    );
    const plan = culDeSacAtEnd({ x: 20, z: 20 }, true, false, ground(f));
    expect(plan.refusal).toBeNull();
    expect(plan.block).toEqual({ x: 21, z: 19 });
    const up = culDeSacAtEnd({ x: 20, z: 20 }, true, true, ground(f));
    expect(up.block).toEqual({ x: 21, z: 20 });
  });

  it('sends a buildRoad of the four tiles, then the cul-de-sac', () => {
    const plan = culDeSacAtEnd(END, true, true, ground(deadEnd()));
    const commands = culDeSacCommands(plan, RoadTier.TwoLane, 9);
    expect(commands).toHaveLength(2);
    expect(commands[0]).toMatchObject({ kind: 'buildRoad', tier: RoadTier.TwoLane, profile: 9 });
    expect((commands[0] as { tiles: TilePoint[] }).tiles).toHaveLength(4);
    expect(commands[1]).toEqual({ kind: 'buildCulDeSac', x: 20, z: 21 });
  });

  const refusal = (f: Fixture, at: TilePoint = END): string | null =>
    culDeSacAtEnd(at, true, true, ground(f)).refusal;

  it('refuses anything that is not a dead end', () => {
    expect(refusal(deadEnd(), { x: 20, z: 15 })).toBe(CUL_DE_SAC_REFUSALS.notDeadEnd);
    expect(refusal(deadEnd(), { x: 30, z: 30 })).toBe(CUL_DE_SAC_REFUSALS.notDeadEnd);
    const f = deadEnd();
    road(f, [{ x: 20, z: 21 }]);
    expect(refusal(f)).toBe(CUL_DE_SAC_REFUSALS.notDeadEnd);
  });

  it.each([
    [RoadTier.Alley, CUL_DE_SAC_REFUSALS.alley],
    [RoadTier.OneWay, CUL_DE_SAC_REFUSALS.oneWay],
    [RoadTier.Ramp, CUL_DE_SAC_REFUSALS.motorway],
    [RoadTier.Highway, CUL_DE_SAC_REFUSALS.motorway],
    [RoadTier.RailTrack, CUL_DE_SAC_REFUSALS.railway],
    [RoadTier.Tram, CUL_DE_SAC_REFUSALS.tramway],
    [RoadTier.Avenue, CUL_DE_SAC_REFUSALS.wide],
    [RoadTier.FourLane, CUL_DE_SAC_REFUSALS.wide],
  ])('refuses a street of tier %i with a sentence that says why', (tier, sentence) => {
    const f = fixture();
    road(f, col(20, 10, 20), tier);
    expect(refusal(f)).toBe(sentence);
  });

  it('accepts a gravel street, which has one lane each way', () => {
    const f = fixture();
    road(f, col(20, 10, 20), RoadTier.Gravel);
    expect(refusal(f)).toBeNull();
  });

  it('refuses a street drawn one way, whatever its tier', () => {
    const f = fixture();
    const oneLane: RoadProfile = {
      class: 'local',
      pieces: [
        { kind: 'sidewalk', width: 1.875 },
        { kind: 'travel', width: 3.75, flow: 'fwd' },
        { kind: 'sidewalk', width: 1.875 },
      ],
    };
    road(f, col(20, 10, 20), RoadTier.TwoLane, oneLane);
    expect(refusal(f)).toBe(CUL_DE_SAC_REFUSALS.oneWay);
    // Two lanes drawn the same way is still one-way, not wide.
    const f2 = fixture();
    road(f2, col(20, 10, 20), RoadTier.OneWay);
    expect(refusal(f2)).toBe(CUL_DE_SAC_REFUSALS.oneWay);
  });

  it('refuses a deck', () => {
    const f = deadEnd();
    f.roads.set(key(20, 20), { ...f.roads.get(key(20, 20))!, elevation: 5 });
    expect(refusal(f)).toBe(CUL_DE_SAC_REFUSALS.raised);
  });

  it('refuses ground a building or water holds, and a road, and the map edge', () => {
    const blocked = deadEnd();
    blocked.blocked.add(key(21, 22));
    expect(refusal(blocked)).toBe(CUL_DE_SAC_REFUSALS.inTheWay);

    const crossed = deadEnd();
    road(crossed, [{ x: 21, z: 22 }]);
    expect(refusal(crossed)).toBe(CUL_DE_SAC_REFUSALS.road);

    const beside = deadEnd();
    road(beside, col(23, 21, 30));
    road(beside, [{ x: 19, z: 22 }]);
    expect(refusal(beside)).toBe(CUL_DE_SAC_REFUSALS.road);
  });

  it('refuses a block that runs off the map', () => {
    const f = fixture();
    road(
      f,
      Array.from({ length: 6 }, (_, i) => ({ x: i, z: 5 })),
    );
    expect(refusal(f, { x: 0, z: 5 })).toBe(CUL_DE_SAC_REFUSALS.offMap);
  });
});

describe('whether the worker lets one stand', () => {
  it('accepts a laid block that ends one street', () => {
    const f = laid();
    f.codes.clear();
    expect(culDeSacPlan(BLOCK, ground(f)).refusal).toBeNull();
  });

  it('refuses a block that is not all laid, or holds a second street, or is already one', () => {
    const open = deadEnd();
    expect(culDeSacPlan(BLOCK, ground(open)).refusal).toBe(CUL_DE_SAC_REFUSALS.notLaid);

    const two = laid();
    two.codes.clear();
    road(two, col(22, 21, 26));
    expect(culDeSacPlan(BLOCK, ground(two)).refusal).toBe(CUL_DE_SAC_REFUSALS.notEnd);

    expect(culDeSacPlan(BLOCK, ground(laid())).refusal).toBe(CUL_DE_SAC_REFUSALS.already);
  });

  it('refuses a block on an avenue', () => {
    const f = fixture();
    road(f, col(20, 10, 20), RoadTier.Avenue);
    road(f, blockTiles(BLOCK), RoadTier.Avenue);
    expect(culDeSacPlan(BLOCK, ground(f)).refusal).toBe(CUL_DE_SAC_REFUSALS.wide);
  });
});

describe('the line a car drives round it', () => {
  const block = BLOCK;
  const centre = ringCentre(block);

  it('is a circle inside the kerb, not tile centre to tile centre', () => {
    const tiles = [
      { x: 20, z: 21 },
      { x: 20, z: 22 },
      { x: 21, z: 22 },
      { x: 21, z: 21 },
      { x: 20, z: 21 },
    ];
    const route = culDeSacArc(block, tiles);
    expect(route.length).toBeGreaterThan(16);
    for (const p of route) {
      const r = Math.hypot(p.x - centre.x, p.z - centre.z);
      expect(r).toBeCloseTo(CUL_DE_SAC_ROUTE_RADIUS_M, 6);
      expect(r).toBeLessThan(CUL_DE_SAC_RADIUS_M);
    }
    const mouth = culDeSacPoint(block, { x: 20, z: 21 });
    expect(route[0]).toEqual(mouth);
  });

  it('goes round anticlockwise, with z growing south', () => {
    expect(
      loopRunsRound(block, [
        { x: 20, z: 21 },
        { x: 20, z: 22 },
      ]),
    ).toBe(true);
    expect(
      loopRunsRound(block, [
        { x: 20, z: 21 },
        { x: 21, z: 21 },
      ]),
    ).toBe(false);
  });
});
