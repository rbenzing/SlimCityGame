import { describe, expect, it } from 'vitest';
import { WATER_PIPE_COST_PER_TILE } from '../shared/constants';
import type { TilePoint } from '../shared/types';
import { pipeJoinAt, planPipeRun, snapPipeEnd, type PipeWorld } from './pipe';

const key = (x: number, z: number): string => `${x},${z}`;

function world(opts: {
  mains?: TilePoint[];
  pipes?: TilePoint[];
  buildings?: Array<TilePoint & { name: string }>;
}): PipeWorld {
  const mains = new Set((opts.mains ?? []).map((t) => key(t.x, t.z)));
  const pipes = new Set((opts.pipes ?? []).map((t) => key(t.x, t.z)));
  const buildings = new Map((opts.buildings ?? []).map((b) => [key(b.x, b.z), b.name]));
  return {
    mainAt: (x, z) => mains.has(key(x, z)),
    pipeAt: (x, z) => pipes.has(key(x, z)),
    buildingNameAt: (x, z) => buildings.get(key(x, z)) ?? null,
  };
}

const row = (x0: number, z: number, n: number): TilePoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: x0 + i, z }));

describe('snapPipeEnd', () => {
  it('keeps a tile that already carries water', () => {
    const w = world({ mains: [{ x: 5, z: 5 }] });
    expect(snapPipeEnd({ x: 5, z: 5 }, w)).toEqual({ x: 5, z: 5 });
  });

  it('moves a tile a step onto the main or pipe beside it, north first', () => {
    const w = world({ mains: [{ x: 5, z: 4 }], pipes: [{ x: 6, z: 5 }] });
    expect(snapPipeEnd({ x: 5, z: 5 }, w)).toEqual({ x: 5, z: 4 });
    expect(snapPipeEnd({ x: 7, z: 5 }, w)).toEqual({ x: 6, z: 5 });
  });

  it('stays put with nothing a step away', () => {
    expect(snapPipeEnd({ x: 9, z: 9 }, world({ mains: [{ x: 5, z: 5 }] }))).toEqual({
      x: 9,
      z: 9,
    });
  });
});

describe('pipeJoinAt', () => {
  it('names a building beside the tile before the main or pipe under it', () => {
    const w = world({
      mains: [{ x: 5, z: 5 }],
      buildings: [{ x: 5, z: 6, name: 'Water Pumping Station' }],
    });
    expect(pipeJoinAt({ x: 5, z: 5 }, w)).toBe('the Water Pumping Station');
    expect(pipeJoinAt({ x: 5, z: 5 }, world({ mains: [{ x: 5, z: 5 }] }))).toBe('a street main');
    expect(pipeJoinAt({ x: 5, z: 5 }, world({ pipes: [{ x: 5, z: 5 }] }))).toBe('your pipe');
    expect(pipeJoinAt({ x: 5, z: 5 }, world({}))).toBeNull();
  });
});

describe('planPipeRun', () => {
  it('lays and charges only the tiles that are neither a main nor a pipe already', () => {
    const w = world({ mains: [{ x: 2, z: 0 }], pipes: [{ x: 0, z: 0 }] });
    const plan = planPipeRun(row(0, 0, 5), w);
    expect(plan.laid).toEqual([
      { x: 1, z: 0 },
      { x: 3, z: 0 },
      { x: 4, z: 0 },
    ]);
    expect(plan.cost).toBe(3 * WATER_PIPE_COST_PER_TILE);
  });

  it('says a run along a street lays nothing, since the street carries a main', () => {
    const plan = planPipeRun(row(0, 0, 4), world({ mains: row(0, 0, 4) }));
    expect(plan.laid).toEqual([]);
    expect(plan.cost).toBe(0);
    expect(plan.note).toBe('The street carries a main');
  });

  it('says what each end joins: a main at the start, a building at the end', () => {
    const w = world({
      mains: [{ x: 0, z: 0 }],
      buildings: [{ x: 5, z: 0, name: 'Water Drain Pipe' }],
    });
    expect(planPipeRun(row(0, 0, 5), w).note).toBe(
      'Joins a street main · reaches the Water Drain Pipe',
    );
  });

  it('says when an end reaches nothing, and when neither does', () => {
    const w = world({ mains: [{ x: 0, z: 0 }] });
    expect(planPipeRun(row(0, 0, 3), w).note).toBe('Joins a street main · reaches nothing');
    expect(planPipeRun(row(0, 0, 3), world({})).note).toBe('Reaches nothing');
    expect(planPipeRun(row(0, 0, 3), world({ pipes: [{ x: 2, z: 0 }] })).note).toBe(
      'Reaches your pipe',
    );
  });

  it('names a join once for a run of one tile', () => {
    expect(planPipeRun(row(0, 0, 1), world({ pipes: [{ x: 0, z: 0 }] })).note).toBe(
      'Joins your pipe',
    );
  });
});
