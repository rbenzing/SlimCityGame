import { describe, expect, it } from 'vitest';
import {
  CENTRED_CUL_DE_SAC_CODE,
  CENTRED_ZONE_M,
  centredCulDeSacAtEnd,
  CUL_DE_SAC_CODE,
  CUL_DE_SAC_RADIUS_M,
  CUL_DE_SAC_REFUSALS,
  CUL_DE_SAC_ROUTE_RADIUS_M,
  culDeSacArc,
  culDeSacAtEnd,
  culDeSacBlockOf,
  culDeSacCentre,
  culDeSacCommands,
  culDeSacPlan,
  culDeSacPoint,
  culDeSacRunTiles,
  culDeSacsAmong,
  culDeSacTiles,
  loopRunsRound,
  pointerOnCentreLine,
  type CulDeSacBlock,
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

// --- The centred form ----------------------------------------------------------

const row = (z: number, x0: number, x1: number): TilePoint[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, z }));

/** One way a street can end at (20, 20), and the centred block beyond it. */
interface Way {
  name: string;
  street: TilePoint[];
  block: CulDeSacBlock;
  /** The block's tile the street joins. */
  mouth: TilePoint;
  /** The circle's centre, world metres. */
  centre: { x: number; z: number };
}

const WAYS: Way[] = [
  {
    name: 'a street heading south',
    street: col(20, 10, 20),
    block: { x: 19, z: 21, centred: 'x' },
    mouth: { x: 20, z: 21 },
    centre: { x: 410, z: 440 },
  },
  {
    name: 'a street heading north',
    street: col(20, 20, 30),
    block: { x: 19, z: 18, centred: 'x' },
    mouth: { x: 20, z: 19 },
    centre: { x: 410, z: 380 },
  },
  {
    name: 'a street heading east',
    street: row(20, 10, 20),
    block: { x: 21, z: 19, centred: 'z' },
    mouth: { x: 21, z: 20 },
    centre: { x: 440, z: 410 },
  },
  {
    name: 'a street heading west',
    street: row(20, 20, 30),
    block: { x: 18, z: 19, centred: 'z' },
    mouth: { x: 19, z: 20 },
    centre: { x: 380, z: 410 },
  },
];

/** The street, with the centred block beyond its end laid and coded. */
function centredLaid(way: Way): Fixture {
  const f = fixture();
  road(f, way.street);
  road(f, culDeSacTiles(way.block));
  for (const t of culDeSacTiles(way.block)) f.codes.set(key(t.x, t.z), CENTRED_CUL_DE_SAC_CODE);
  return f;
}

describe('the centred cul-de-sac code', () => {
  it('is appended after the reserved centred roundabout code, and reads as no control', () => {
    expect(CENTRED_CUL_DE_SAC_CODE).toBe(9);
    expect(CENTRED_CUL_DE_SAC_CODE).toBeGreaterThan(CUL_DE_SAC_CODE + 1);
    expect(controlFromCode(CENTRED_CUL_DE_SAC_CODE)).toBeNull();
  });
});

describe.each(WAYS)('the centred cul-de-sac beyond $name', (way) => {
  it('is the block of six coded tiles at the end of exactly one street', () => {
    const f = centredLaid(way);
    const tiles = culDeSacTiles(way.block);
    expect(tiles).toHaveLength(6);
    for (const t of tiles) {
      const c = culDeSacBlockOf(t.x, t.z, ground(f));
      expect(c).toMatchObject(way.block);
      expect(c?.leg.tile).toEqual(END);
      expect(c?.leg.from).toEqual(way.mouth);
    }
    expect(culDeSacBlockOf(END.x, END.z, ground(f))).toBeNull();
  });

  it('has its circle on the street centre line, 20 m beyond the end tile', () => {
    expect(culDeSacCentre(way.block)).toEqual(way.centre);
    const endCentre = { x: (END.x + 0.5) * 20, z: (END.z + 0.5) * 20 };
    const along = Math.hypot(way.centre.x - endCentre.x, way.centre.z - endCentre.z);
    // Half the end tile to its far edge, then the 20 m beyond it.
    expect(along).toBe(30);
    const across =
      way.block.centred === 'x' ? way.centre.x - endCentre.x : way.centre.z - endCentre.z;
    expect(across).toBe(0);
  });

  it('is plain road where its tiles are not joined to each other', () => {
    const f = centredLaid(way);
    const [a, b] = culDeSacTiles(way.block);
    f.apart.add(`${key(a!.x, a!.z)}|${key(b!.x, b!.z)}`);
    expect(culDeSacBlockOf(a!.x, a!.z, ground(f))).toBeNull();
  });

  it('is plain road once one tile loses its code', () => {
    const f = centredLaid(way);
    const last = culDeSacTiles(way.block)[5]!;
    f.codes.delete(key(last.x, last.z));
    expect(culDeSacBlockOf(way.mouth.x, way.mouth.z, ground(f))).toBeNull();
  });

  it('is plain road once a second street touches the block', () => {
    const f = centredLaid(way);
    const far = culDeSacTiles(way.block)[5]!;
    const beside =
      way.block.centred === 'x' ? { x: far.x + 1, z: far.z } : { x: far.x, z: far.z + 1 };
    road(f, [beside]);
    expect(culDeSacBlockOf(far.x, far.z, ground(f))).toBeNull();
  });

  it('is plain road once the street that met it is gone', () => {
    const f = centredLaid(way);
    f.roads.delete(key(END.x, END.z));
    expect(culDeSacBlockOf(way.mouth.x, way.mouth.z, ground(f))).toBeNull();
  });

  it('is plain road when one tile of the block is on a deck', () => {
    const f = centredLaid(way);
    const t = culDeSacTiles(way.block)[4]!;
    f.roads.set(key(t.x, t.z), { ...f.roads.get(key(t.x, t.z))!, elevation: 5 });
    expect(culDeSacBlockOf(t.x, t.z, ground(f))).toBeNull();
  });

  it('is found once each among the coded tiles', () => {
    const f = centredLaid(way);
    const tiles = culDeSacTiles(way.block);
    const found = culDeSacsAmong([...tiles, ...tiles], ground(f));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject(way.block);
  });

  it('is laid by the tool on the six tiles beyond the end, from the street alone', () => {
    const f = fixture();
    road(f, way.street);
    const plan = centredCulDeSacAtEnd(END, ground(f));
    expect(plan.refusal).toBeNull();
    expect(plan.block).toEqual(way.block);
    expect(plan.toLay).toEqual(culDeSacTiles(way.block));
    const commands = culDeSacCommands(plan, RoadTier.TwoLane);
    expect(commands).toHaveLength(2);
    expect((commands[0] as { tiles: TilePoint[] }).tiles).toHaveLength(6);
    expect(commands[1]).toEqual({
      kind: 'buildCulDeSac',
      x: way.block.x,
      z: way.block.z,
      centred: way.block.centred,
    });
  });

  it('is accepted by the worker on a laid block, and refused once it already stands', () => {
    const f = centredLaid(way);
    expect(culDeSacPlan(way.block, ground(f)).refusal).toBe(CUL_DE_SAC_REFUSALS.already);
    f.codes.clear();
    expect(culDeSacPlan(way.block, ground(f)).refusal).toBeNull();
  });

  it('is driven anticlockwise round the new centre, inside the kerb', () => {
    const tiles = culDeSacTiles(way.block);
    const mouth = culDeSacPoint(way.block, way.mouth);
    // The ring of tiles, anticlockwise from the mouth, by their angle about the centre.
    const angle = (t: TilePoint): number =>
      Math.atan2((t.z + 0.5) * 20 - way.centre.z, (t.x + 0.5) * 20 - way.centre.x);
    const ring = tiles
      .filter((t) => !(t.x === way.mouth.x && t.z === way.mouth.z))
      .sort((a, b) => angle(b) - angle(a));
    const start = angle(way.mouth);
    const order = [
      way.mouth,
      ...ring.filter((t) => angle(t) < start),
      ...ring.filter((t) => angle(t) > start),
    ];
    // The opposite middle tile is on the circle's far side, not driven across.
    expect(order).toHaveLength(6);
    const loop = [...order, way.mouth];
    expect(loopRunsRound(way.block, loop)).toBe(true);
    expect(loopRunsRound(way.block, [...loop].reverse())).toBe(false);
    const route = culDeSacArc(way.block, loop);
    expect(route[0]).toEqual(mouth);
    for (const p of route) {
      const r = Math.hypot(p.x - way.centre.x, p.z - way.centre.z);
      expect(r).toBeCloseTo(CUL_DE_SAC_ROUTE_RADIUS_M, 6);
    }
    expect(culDeSacRunTiles(way.block, loop)).toBeCloseTo(
      (2 * Math.PI * CUL_DE_SAC_ROUTE_RADIUS_M) / 20,
      9,
    );
  });
});

describe('what the tool refuses for a centred cul-de-sac', () => {
  const plan = (f: Fixture, at: TilePoint = END) => centredCulDeSacAtEnd(at, ground(f));
  const south = WAYS[0]!;
  const open = (): Fixture => {
    const f = fixture();
    road(f, south.street);
    return f;
  };

  it('refuses anything that is not a dead end', () => {
    expect(plan(open(), { x: 20, z: 15 }).refusal).toBe(CUL_DE_SAC_REFUSALS.notDeadEnd);
    expect(plan(open(), { x: 30, z: 30 }).refusal).toBe(CUL_DE_SAC_REFUSALS.notDeadEnd);
  });

  it.each([
    [RoadTier.Alley, CUL_DE_SAC_REFUSALS.alley],
    [RoadTier.OneWay, CUL_DE_SAC_REFUSALS.oneWay],
    [RoadTier.Ramp, CUL_DE_SAC_REFUSALS.motorway],
    [RoadTier.Highway, CUL_DE_SAC_REFUSALS.motorway],
    [RoadTier.RailTrack, CUL_DE_SAC_REFUSALS.railway],
    [RoadTier.Tram, CUL_DE_SAC_REFUSALS.tramway],
    [RoadTier.Avenue, CUL_DE_SAC_REFUSALS.wide],
  ])('refuses a street of tier %i with a sentence that says why', (tier, sentence) => {
    const f = fixture();
    road(f, south.street, tier);
    expect(plan(f).refusal).toBe(sentence);
  });

  it('refuses a deck', () => {
    const f = open();
    f.roads.set(key(20, 20), { ...f.roads.get(key(20, 20))!, elevation: 5 });
    expect(plan(f).refusal).toBe(CUL_DE_SAC_REFUSALS.raised);
  });

  it.each([
    ['a building or water on the far corner', { x: 21, z: 22 }],
    ['a building or water on the flank beside the mouth', { x: 19, z: 21 }],
  ])('refuses %s', (_, at) => {
    const f = open();
    f.blocked.add(key(at.x, at.z));
    expect(plan(f).refusal).toBe(CUL_DE_SAC_REFUSALS.inTheWay);
  });

  it('refuses a road across the block, and one off the grid', () => {
    const crossed = open();
    road(crossed, [{ x: 21, z: 22 }]);
    expect(plan(crossed).refusal).toBe(CUL_DE_SAC_REFUSALS.road);
    const off = open();
    off.offGrid.add(key(19, 22));
    expect(plan(off).refusal).toBe(CUL_DE_SAC_REFUSALS.offGrid);
  });

  it('refuses a road beside the block that is not its street, and says so', () => {
    for (const beside of [
      { x: 22, z: 21 },
      { x: 18, z: 22 },
      { x: 19, z: 23 },
      { x: 20, z: 23 },
    ]) {
      const f = open();
      road(f, [beside]);
      expect(plan(f).refusal, key(beside.x, beside.z)).toBe(CUL_DE_SAC_REFUSALS.touchesRoad);
    }
  });

  it('allows the street beside the block, which is only its own', () => {
    const f = open();
    road(f, col(20, 5, 9));
    expect(plan(f).refusal).toBeNull();
  });

  it('refuses a block that would touch another centred cul-de-sac', () => {
    const f = open();
    const other: CulDeSacBlock = { x: 22, z: 21, centred: 'x' };
    road(f, culDeSacTiles(other));
    for (const t of culDeSacTiles(other)) f.codes.set(key(t.x, t.z), CENTRED_CUL_DE_SAC_CODE);
    expect(plan(f).refusal).toBe(CUL_DE_SAC_REFUSALS.touchesCentred);
  });

  it('refuses a block that runs off the map', () => {
    const f = fixture();
    road(f, row(5, 0, 5));
    expect(plan(f, { x: 0, z: 5 }).refusal).toBe(CUL_DE_SAC_REFUSALS.offMap);
  });
});

describe('whether the worker lets a centred cul-de-sac stand', () => {
  const south = WAYS[0]!;

  it('refuses a block that is not all laid', () => {
    const f = fixture();
    road(f, south.street);
    road(f, culDeSacTiles(south.block).slice(0, 5));
    expect(culDeSacPlan(south.block, ground(f)).refusal).toBe(CUL_DE_SAC_REFUSALS.centredNotLaid);
  });

  it('refuses a block whose tiles are not joined', () => {
    const f = centredLaid(south);
    f.codes.clear();
    f.apart.add(`${key(20, 21)}|${key(20, 22)}`);
    expect(culDeSacPlan(south.block, ground(f)).refusal).toBe(CUL_DE_SAC_REFUSALS.centredNotLaid);
  });

  it('refuses a block that holds a second street', () => {
    const f = centredLaid(south);
    f.codes.clear();
    road(f, col(21, 23, 28));
    expect(culDeSacPlan(south.block, ground(f)).refusal).toBe(CUL_DE_SAC_REFUSALS.centredNotEnd);
  });

  it('refuses a street that joins a corner, not the middle of a long side', () => {
    const f = fixture();
    road(f, col(19, 10, 20));
    road(f, culDeSacTiles(south.block));
    expect(culDeSacPlan(south.block, ground(f)).refusal).toBe(CUL_DE_SAC_REFUSALS.centredNotEnd);
  });

  it('refuses a street that joins a short side', () => {
    const f = fixture();
    road(f, row(21, 10, 18));
    road(f, culDeSacTiles(south.block));
    expect(culDeSacPlan(south.block, ground(f)).refusal).toBe(CUL_DE_SAC_REFUSALS.centredNotEnd);
  });

  it('refuses an avenue, and a block off the map', () => {
    const f = fixture();
    road(f, south.street, RoadTier.Avenue);
    road(f, culDeSacTiles(south.block), RoadTier.Avenue);
    expect(culDeSacPlan(south.block, ground(f)).refusal).toBe(CUL_DE_SAC_REFUSALS.wide);
    expect(culDeSacPlan({ x: -1, z: 5, centred: 'x' }, ground(fixture())).refusal).toBe(
      CUL_DE_SAC_REFUSALS.offMap,
    );
  });

  it('is not an offset cul-de-sac on the same tiles, and the two never read each other', () => {
    const f = centredLaid(south);
    // An offset block over tiles a centred one holds is already a cul-de-sac.
    expect(culDeSacPlan({ x: 20, z: 21 }, ground(f)).refusal).toBe(CUL_DE_SAC_REFUSALS.already);
    // The offset form's code on the same six tiles is no centred block.
    for (const t of culDeSacTiles(south.block)) f.codes.set(key(t.x, t.z), CUL_DE_SAC_CODE);
    expect(culDeSacBlockOf(20, 21, ground(f))).toBeNull();
  });
});

describe('where the pointer picks the centred form', () => {
  const g = ground(deadEnd());
  const sideways = ground(
    (() => {
      const f = fixture();
      road(f, row(20, 10, 20));
      return f;
    })(),
  );

  it('is inside five metres of the street centre line, across it, and not at five', () => {
    expect(CENTRED_ZONE_M).toBe(5);
    expect(pointerOnCentreLine(END, { x: 410, z: 415 }, g)).toBe(true);
    expect(pointerOnCentreLine(END, { x: 405.1, z: 415 }, g)).toBe(true);
    expect(pointerOnCentreLine(END, { x: 414.9, z: 415 }, g)).toBe(true);
    expect(pointerOnCentreLine(END, { x: 415, z: 415 }, g)).toBe(false);
    expect(pointerOnCentreLine(END, { x: 405, z: 415 }, g)).toBe(false);
    expect(pointerOnCentreLine(END, { x: 430, z: 415 }, g)).toBe(false);
  });

  it('reads across the street whichever way it runs', () => {
    expect(pointerOnCentreLine(END, { x: 415, z: 410 }, sideways)).toBe(true);
    expect(pointerOnCentreLine(END, { x: 415, z: 416 }, sideways)).toBe(false);
  });

  it('is never the middle of a tile that is not a dead end', () => {
    expect(pointerOnCentreLine({ x: 20, z: 15 }, { x: 410, z: 310 }, g)).toBe(false);
  });
});
