import { describe, expect, it } from 'vitest';
import { corridorRunsFor, corridorTiles } from './corridor';
import { corridorHalfOf, flowDirection, RoadFlow } from './types';
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
