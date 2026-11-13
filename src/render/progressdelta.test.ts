import { describe, expect, it } from 'vitest';
import { isProgressOnly, withoutProgressOnly } from './progressdelta';
import { BuildingState, type BuildingInstance, type SimSnapshot } from '../shared/types';

function inst(over: Partial<BuildingInstance> = {}): BuildingInstance {
  return {
    id: 1,
    catalogId: 'x',
    x: 3,
    z: 4,
    rotation: 0,
    level: 1,
    state: BuildingState.Constructing,
    problems: 0,
    progress: 0,
    ...over,
  };
}

const snap = (updated: BuildingInstance[], added: BuildingInstance[] = []): SimSnapshot =>
  ({ stats: {}, buildings: { added, removed: [], updated } }) as unknown as SimSnapshot;

describe('withoutProgressOnly', () => {
  const known = new Map([[1, inst()]]);

  it('takes a progress-only update out of the snapshot, leaving no building delta', () => {
    const { snapshot, progressOnly } = withoutProgressOnly(snap([inst({ progress: 0.4 })]), known);
    expect(progressOnly).toHaveLength(1);
    expect(snapshot.buildings).toBeUndefined();
  });

  it('keeps every other update, and the added and removed lists', () => {
    const finished = inst({ id: 2, state: BuildingState.Active, progress: undefined });
    const both = new Map([...known, [2, inst({ id: 2 })]]);
    const { snapshot, progressOnly } = withoutProgressOnly(
      snap([inst({ progress: 0.4 }), finished], [inst({ id: 3 })]),
      both,
    );
    expect(progressOnly.map((b) => b.id)).toEqual([1]);
    expect(snapshot.buildings!.updated.map((b) => b.id)).toEqual([2]);
    expect(snapshot.buildings!.added.map((b) => b.id)).toEqual([3]);
  });

  it('treats a building not yet known, or changed in anything else, as a full update', () => {
    expect(isProgressOnly(undefined, inst({ progress: 0.4 }))).toBe(false);
    expect(isProgressOnly(inst(), inst({ progress: 0.4, problems: 2 }))).toBe(false);
    expect(isProgressOnly(inst(), inst({ progress: 0.4, level: 2 }))).toBe(false);
    expect(isProgressOnly(inst(), inst({ progress: undefined }))).toBe(false);
    const { snapshot } = withoutProgressOnly(snap([inst({ progress: 0.4 })]), new Map());
    expect(snapshot.buildings!.updated).toHaveLength(1);
  });
});
