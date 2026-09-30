import { describe, expect, it } from 'vitest';
import {
  corridorPartnerTile,
  corridorRunsFor,
  corridorSplitRefusal,
  corridorTiles,
  partnerTileOf,
  SPLITS_CORRIDOR,
  rampJoin,
  rampJoins,
  sideBySideCarriageways,
} from './corridor';
import { corridorHalfOf, flowDirection, RoadFlow, storedFlow } from './types';
import type { TilePoint } from './types';

/** A run of tiles from `from` to `to` inclusive, in either direction. */
const span = (from: number, to: number): number[] => {
  const step = to >= from ? 1 : -1;
  return Array.from({ length: Math.abs(to - from) + 1 }, (_, i) => from + i * step);
};
const col = (x: number, from: number, to: number): TilePoint[] =>
  span(from, to).map((z) => ({ x, z }));
const row = (z: number, from: number, to: number): TilePoint[] =>
  span(from, to).map((x) => ({ x, z }));

describe('a corridor is laid as two runs, not one wide one', () => {
  it('puts the far half one tile across a north-south run', () => {
    const runs = corridorRunsFor(col(5, 2, 6))!;
    expect(runs.near).toEqual(col(5, 2, 6));
    expect(runs.far).toEqual(col(6, 2, 6));
    expect(flowDirection(runs.nearFlow)).toBe(RoadFlow.South);
  });

  it('puts it one tile across an east-west run, on the other axis', () => {
    const runs = corridorRunsFor(row(9, 3, 7))!;
    expect(runs.near).toEqual(row(9, 3, 7));
    expect(runs.far).toEqual(row(10, 3, 7));
    expect(flowDirection(runs.farFlow)).toBe(RoadFlow.East);
  });

  it('flags each run as its own half of the road', () => {
    const runs = corridorRunsFor(col(5, 2, 6))!;
    // The near run holds the pieces at the NEGATIVE offsets, which is what
    // puts it on the tile at the lower coordinate across the run.
    expect(corridorHalfOf(runs.nearFlow)).toBe('left');
    expect(corridorHalfOf(runs.farFlow)).toBe('right');
    expect(flowDirection(runs.nearFlow)).toBe(flowDirection(runs.farFlow));
  });

  it('records the way the drag went, not just the axis', () => {
    expect(flowDirection(corridorRunsFor(col(5, 6, 2))!.nearFlow)).toBe(RoadFlow.North);
    expect(flowDirection(corridorRunsFor(row(9, 7, 3))!.nearFlow)).toBe(RoadFlow.West);
  });

  it('refuses a bend, because two halves round a corner are not a pair', () => {
    // The halves have to lie beside each other ACROSS the run for anything
    // downstream to read them as one road. Round a corner they are diagonal
    // neighbours, and the road would draw as a row of crossroads.
    expect(corridorRunsFor([...col(5, 2, 5), { x: 6, z: 5 }, { x: 7, z: 5 }])).toBeNull();
  });

  it('refuses a single tile, which says nothing about which way it runs', () => {
    expect(corridorRunsFor([{ x: 5, z: 5 }])).toBeNull();
    expect(corridorRunsFor([])).toBeNull();
  });

  it('occupies both runs, so a preview and a cost cover the whole road', () => {
    const runs = corridorRunsFor(col(5, 2, 6))!;
    const tiles = corridorTiles(runs);
    expect(tiles).toHaveLength(10);
    expect(new Set(tiles.map((t) => `${t.x},${t.z}`)).size).toBe(10);
  });
});

describe('two motorway carriageways side by side', () => {
  it('are separate roads when each lies across the other’s flow', () => {
    // Southbound at x, northbound at x + 1: the step east is across both.
    expect(sideBySideCarriageways(true, true, RoadFlow.South, RoadFlow.North, 1, 0)).toBe(true);
    expect(sideBySideCarriageways(true, true, RoadFlow.North, RoadFlow.South, -1, 0)).toBe(true);
    // Running the same way is still two carriageways, not a junction.
    expect(sideBySideCarriageways(true, true, RoadFlow.East, RoadFlow.East, 0, 1)).toBe(true);
  });

  it('are a junction when one arrives square-on, pointing at the other', () => {
    // An eastbound run with a southbound one arriving from the north: the step
    // is across the eastbound flow but ALONG the southbound one.
    expect(sideBySideCarriageways(true, true, RoadFlow.East, RoadFlow.South, 0, -1)).toBe(false);
  });

  it('join end on', () => {
    expect(sideBySideCarriageways(true, true, RoadFlow.East, RoadFlow.East, 1, 0)).toBe(false);
  });

  it('leave everything but two motorways alone, a ramp included', () => {
    expect(sideBySideCarriageways(true, false, RoadFlow.South, RoadFlow.South, 1, 0)).toBe(false);
    expect(sideBySideCarriageways(false, true, RoadFlow.South, RoadFlow.North, 1, 0)).toBe(false);
  });

  it('say nothing where a tile does not say which way it runs', () => {
    expect(sideBySideCarriageways(true, true, RoadFlow.None, RoadFlow.North, 1, 0)).toBe(false);
  });

  it('read the direction out of the byte, not the whole byte', () => {
    const half = storedFlow(RoadFlow.South, 'right');
    expect(sideBySideCarriageways(true, true, half, RoadFlow.North, 1, 0)).toBe(true);
  });
});

describe('how a ramp meets the motorway beside it', () => {
  // The step is from the ramp tile to the motorway tile. An eastbound
  // motorway with the ramp one row south of it: the step is north, (0, -1).
  const NORTH_STEP = [0, -1] as const;

  it('merges at its end: a ramp arriving, none ahead, running the motorway’s way', () => {
    expect(rampJoin(RoadFlow.East, RoadFlow.East, ...NORTH_STEP, true, false)).toBe('merge');
  });

  it('diverges at its start: a ramp ahead, none arriving, running the motorway’s way', () => {
    expect(rampJoin(RoadFlow.East, RoadFlow.East, ...NORTH_STEP, false, true)).toBe('diverge');
  });

  it('is its own road along the stretch in between, and at an elbow beside it', () => {
    // Arriving and continuing: the middle of the parallel run, or an elbow
    // turning away from the motorway with a ramp on both sides of it.
    expect(rampJoin(RoadFlow.East, RoadFlow.East, ...NORTH_STEP, true, true)).toBe('none');
    expect(rampJoin(RoadFlow.South, RoadFlow.East, ...NORTH_STEP, true, true)).toBe('none');
  });

  it('is head-on where it would join running across the motorway', () => {
    expect(rampJoin(RoadFlow.North, RoadFlow.East, ...NORTH_STEP, true, false)).toBe('headOn');
    expect(rampJoin(RoadFlow.South, RoadFlow.East, ...NORTH_STEP, false, true)).toBe('headOn');
  });

  it('is the wrong way where it would join running against the motorway', () => {
    expect(rampJoin(RoadFlow.West, RoadFlow.East, ...NORTH_STEP, true, false)).toBe('wrongWay');
  });

  it('is in line, not beside, where the ramp continues the motorway end on', () => {
    // The motorway ends and a ramp carries on from it: an ordinary join.
    expect(rampJoin(RoadFlow.East, RoadFlow.East, -1, 0, false, true)).toBe('inline');
  });

  it('says nothing it cannot know where either never recorded a direction', () => {
    expect(rampJoin(RoadFlow.None, RoadFlow.East, ...NORTH_STEP, true, false)).toBe('unknown');
    expect(rampJoin(RoadFlow.East, RoadFlow.None, ...NORTH_STEP, true, false)).toBe('unknown');
  });

  it('reads directions out of the byte, not the whole byte', () => {
    const half = storedFlow(RoadFlow.East, 'left');
    expect(rampJoin(half, RoadFlow.East, ...NORTH_STEP, true, false)).toBe('merge');
  });
});

describe('whether a ramp beside a motorway joins it', () => {
  it('joins where it merges or diverges, and where it cannot be told', () => {
    for (const j of ['merge', 'diverge', 'inline', 'unknown'] as const) expect(rampJoins(j)).toBe(true);
  });

  it('still joins a head-on or wrong-way ramp a save already holds: only the tool refuses one', () => {
    expect(rampJoins('headOn')).toBe(true);
    expect(rampJoins('wrongWay')).toBe(true);
  });

  it('does not join along the stretch where it is its own road', () => {
    expect(rampJoins('none')).toBe(false);
  });
});

describe('a corridor is never split', () => {
  const PROFILE = 300;
  /** A grid holding one corridor laid by a drag along `path`. */
  const gridWith = (path: TilePoint[]) => {
    const roads = new Map<string, { flow: number; profile: number }>();
    const runs = corridorRunsFor(path)!;
    for (const t of runs.near)
      roads.set(`${t.x},${t.z}`, { flow: runs.nearFlow, profile: PROFILE });
    for (const t of runs.far) roads.set(`${t.x},${t.z}`, { flow: runs.farFlow, profile: PROFILE });
    const at = (x: number, z: number) => roads.get(`${x},${z}`);
    return (x: number, z: number) =>
      corridorPartnerTile(
        x,
        z,
        (a, b) => at(a, b)?.flow ?? 0,
        (a, b) => at(a, b)?.profile ?? 0,
      );
  };
  /** The tiles and flows a corridor drag along `path` lays. */
  const laying = (path: TilePoint[]) => {
    const runs = corridorRunsFor(path)!;
    return {
      tiles: corridorTiles(runs),
      flows: [...runs.near.map(() => runs.nearFlow), ...runs.far.map(() => runs.farFlow)],
    };
  };

  it('finds each half partnered with the tile across the road from it', () => {
    const paired = gridWith(row(4, 2, 6));
    expect(paired(3, 4)).toEqual({ x: 3, z: 5 });
    expect(paired(3, 5)).toEqual({ x: 3, z: 4 });
    expect(paired(3, 6)).toBeNull();
    expect(partnerTileOf(3, 4, storedFlow(RoadFlow.North, 'left'))).toEqual({ x: 4, z: 4 });
    expect(partnerTileOf(3, 4, storedFlow(RoadFlow.North))).toBeNull();
  });

  it('refuses a corridor dragged one row off the one already there', () => {
    const paired = gridWith(row(4, 2, 6));
    // Rows 5 and 6: row 5 would leave row 4 with nothing beside it.
    const { tiles, flows } = laying(row(5, 2, 6));
    const onRoad = tiles.map((t, i) => ({ t, f: flows[i]! })).filter(({ t }) => t.z === 5);
    expect(
      corridorSplitRefusal(
        onRoad.map(({ t }) => t),
        onRoad.map(({ f }) => f),
        paired,
      ),
    ).toBe(SPLITS_CORRIDOR);
  });

  it('refuses it the other way too, a row below', () => {
    const paired = gridWith(row(4, 2, 6));
    const { tiles, flows } = laying(row(3, 2, 6));
    const onRoad = tiles.map((t, i) => ({ t, f: flows[i]! })).filter(({ t }) => t.z === 4);
    expect(
      corridorSplitRefusal(
        onRoad.map(({ t }) => t),
        onRoad.map(({ f }) => f),
        paired,
      ),
    ).toBe(SPLITS_CORRIDOR);
  });

  it('lets the same corridor be laid again, or turned round', () => {
    const paired = gridWith(row(4, 2, 6));
    for (const path of [row(4, 2, 6), row(4, 6, 2)]) {
      const { tiles, flows } = laying(path);
      expect(corridorSplitRefusal(tiles, flows, paired)).toBeNull();
    }
  });

  it('lets one half be laid again as the same pair, since its other half follows', () => {
    const paired = gridWith(row(4, 2, 6));
    const runs = corridorRunsFor(row(4, 6, 2))!;
    expect(
      corridorSplitRefusal(
        runs.near,
        runs.near.map(() => runs.nearFlow),
        paired,
      ),
    ).toBeNull();
  });

  it('lets a road replace both halves across the corridor, and not one alone', () => {
    const paired = gridWith(row(4, 2, 6));
    const street = storedFlow(RoadFlow.South);
    expect(corridorSplitRefusal(col(3, 4, 5), [street, street], paired)).toBeNull();
    expect(
      corridorSplitRefusal(
        row(4, 2, 6),
        row(4, 2, 6).map(() => street),
        paired,
      ),
    ).toBe(SPLITS_CORRIDOR);
  });
});
