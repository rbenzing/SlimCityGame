import { describe, expect, it, vi } from 'vitest';
import { DrivewayTiles } from './drivewaytiles';
import { BuildingState, type BuildingDelta, type BuildingInstance } from '../shared/types';

function inst(id: number, x: number, z: number): BuildingInstance {
  return {
    id,
    catalogId: 'house',
    x,
    z,
    rotation: 0,
    level: 1,
    state: BuildingState.Active,
    problems: 0,
  };
}

const delta = (d: Partial<BuildingDelta>): BuildingDelta => ({
  added: [],
  removed: [],
  updated: [],
  ...d,
});

/** Two keys per building, moved by `shift` so a "world change" changes every answer. */
const makeKeysFor =
  (shift: { v: number }) =>
  (b: BuildingInstance): number[] => [b.x * 100_000 + b.z + shift.v, b.id];

function fullRecompute(
  live: Map<number, BuildingInstance>,
  keysFor: (b: BuildingInstance) => readonly number[],
): Set<number> {
  const out = new Set<number>();
  for (const b of live.values()) for (const k of keysFor(b)) out.add(k);
  return out;
}

describe('DrivewayTiles', () => {
  it('matches a full recompute across a run of add, update and remove deltas', () => {
    const shift = { v: 0 };
    const keysFor = makeKeysFor(shift);
    const cache = new DrivewayTiles();
    const live = new Map<number, BuildingInstance>();
    const step = (d: BuildingDelta): void => {
      cache.apply(d, keysFor);
      for (const id of d.removed) live.delete(id);
      for (const b of [...d.added, ...d.updated]) live.set(b.id, b);
      expect(cache.keys()).toEqual(fullRecompute(live, keysFor));
    };
    step(delta({ added: [inst(1, 2, 3), inst(2, 4, 5), inst(3, 6, 7)] }));
    step(delta({ updated: [inst(2, 8, 9)] }));
    step(delta({ removed: [1], added: [inst(4, 1, 1)] }));
    step(delta({}));
    step(delta({ removed: [2, 3, 4] }));
    expect(cache.keys().size).toBe(0);
  });

  it('calls keysFor once per added or updated building, never per known building', () => {
    const keysFor = vi.fn(makeKeysFor({ v: 0 }));
    const cache = new DrivewayTiles();
    cache.apply(delta({ added: [inst(1, 1, 1), inst(2, 2, 2), inst(3, 3, 3)] }), keysFor);
    expect(keysFor).toHaveBeenCalledTimes(3);
    keysFor.mockClear();
    cache.apply(delta({ added: [inst(4, 4, 4)], updated: [inst(2, 5, 5)] }), keysFor);
    expect(keysFor).toHaveBeenCalledTimes(2);
    keysFor.mockClear();
    cache.apply(delta({ removed: [1] }), keysFor);
    expect(keysFor).not.toHaveBeenCalled();
  });

  it('recomputes every known building on the apply after invalidate, then only the delta again', () => {
    const shift = { v: 0 };
    const keysFor = vi.fn(makeKeysFor(shift));
    const cache = new DrivewayTiles();
    cache.apply(delta({ added: [inst(1, 1, 1), inst(2, 2, 2), inst(3, 3, 3)] }), keysFor);
    shift.v = 7;
    cache.invalidate();
    keysFor.mockClear();
    cache.apply(delta({ added: [inst(4, 4, 4)] }), keysFor);
    expect(keysFor).toHaveBeenCalledTimes(4);
    expect(cache.keys()).toEqual(
      new Set([100_001 + 7, 1, 200_002 + 7, 2, 300_003 + 7, 3, 400_004 + 7, 4]),
    );
    keysFor.mockClear();
    cache.apply(delta({ updated: [inst(1, 1, 1)] }), keysFor);
    expect(keysFor).toHaveBeenCalledTimes(1);
  });

  it('invalidateWhere recomputes only the picked buildings, once, at the next apply', () => {
    const shift = { v: 0 };
    const keysFor = vi.fn(makeKeysFor(shift));
    const cache = new DrivewayTiles();
    cache.apply(delta({ added: [inst(1, 1, 1), inst(2, 2, 2), inst(3, 3, 3)] }), keysFor);
    shift.v = 5;
    cache.invalidateWhere((b) => b.id !== 2);
    keysFor.mockClear();
    cache.apply(delta({ added: [inst(4, 4, 4)] }), keysFor);
    expect(keysFor.mock.calls.map(([b]) => b.id).sort()).toEqual([1, 3, 4]);
    expect(cache.keys()).toEqual(
      new Set([100_001 + 5, 1, 200_002, 2, 300_003 + 5, 3, 400_004 + 5, 4]),
    );
    keysFor.mockClear();
    cache.apply(delta({}), keysFor);
    expect(keysFor).not.toHaveBeenCalled();
  });

  it('invalidateWhere asked of a building the same delta names calls keysFor once for it', () => {
    const keysFor = vi.fn(makeKeysFor({ v: 0 }));
    const cache = new DrivewayTiles();
    cache.apply(delta({ added: [inst(1, 1, 1)] }), keysFor);
    keysFor.mockClear();
    cache.invalidateWhere(() => true);
    cache.apply(delta({ updated: [inst(1, 9, 9)] }), keysFor);
    expect(keysFor).toHaveBeenCalledTimes(1);
    expect(cache.keys()).toEqual(new Set([900_009, 1]));
  });

  it("drops a removed building's keys, and keeps a key another building still holds", () => {
    const keysFor = (b: BuildingInstance): number[] => (b.id === 1 ? [10, 11] : [11]);
    const cache = new DrivewayTiles();
    cache.apply(delta({ added: [inst(1, 0, 0), inst(2, 0, 0)] }), keysFor);
    expect(cache.keys()).toEqual(new Set([10, 11]));
    cache.apply(delta({ removed: [1] }), keysFor);
    expect(cache.keys()).toEqual(new Set([11]));
    cache.apply(delta({ removed: [2] }), keysFor);
    expect(cache.keys().size).toBe(0);
  });
});
