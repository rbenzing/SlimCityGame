import { describe, expect, it } from 'vitest';
import {
  GROWTH_TIMEOUT_MS,
  latestSaveData,
  run,
  sandboxed,
  send,
  type Harness,
} from '../../tests/support/sim';

const snapshotCount = (h: Harness): number =>
  h.messages.filter((m) => m.type === 'snapshot').length;

const acknowledge = (h: Harness): void => h.sim.handleMessage({ type: 'snapshotApplied' });

/** A sandboxed sim whose page has acknowledged what it was sent so far: the gate is on. */
const gated = (): Harness => {
  const h = sandboxed();
  acknowledge(h);
  return h;
};

const turbine = (x: number, z: number) =>
  ({ kind: 'placeBuilding', catalogId: 'wind-turbine', x, z, rotation: 0 }) as const;

describe('snapshot gate: the worker posts the next snapshot once the page has the last', () => {
  it('posts nothing more after one unacknowledged snapshot, however many ticks run', () => {
    const h = gated();
    h.ticks(100);
    const afterFirst = snapshotCount(h);
    h.ticks(400);
    expect(snapshotCount(h)).toBe(afterFirst);
  });

  it('posts exactly one snapshot on the acknowledgement, with every delta gathered meanwhile', () => {
    const h = gated();
    h.ticks(60);
    const before = snapshotCount(h);
    run(h, 1, [turbine(40, 40)]);
    run(h, 2, [turbine(60, 60)]);
    run(h, 3, [turbine(80, 80)]);
    h.ticks(100);
    expect(snapshotCount(h)).toBe(before);
    acknowledge(h);
    expect(snapshotCount(h)).toBe(before + 1);
    const added = h.lastSnapshot()!.buildings!.added;
    expect(added.map((b) => `${b.x},${b.z}`).sort()).toEqual(['40,40', '60,60', '80,80']);
    // Nothing more is owed until another tick lands on the cadence.
    acknowledge(h);
    expect(snapshotCount(h)).toBe(before + 1);
  });

  it('nets a building placed and removed between two snapshots out as removed only', () => {
    const h = gated();
    h.ticks(60);
    run(h, 1, [turbine(40, 40)]);
    expect(h.ackFor(1)).not.toBeNull();
    run(h, 2, [{ kind: 'bulldoze', tiles: [{ x: 40, z: 40 }] }]);
    h.ticks(100);
    acknowledge(h);
    const delta = h.lastSnapshot()!.buildings!;
    expect(delta.added).toEqual([]);
    expect(delta.removed).toHaveLength(1);
  });

  it(
    'leaves the sim exactly as it would be without the gate',
    () => {
      const free = sandboxed();
      const held = gated();
      for (const h of [free, held]) {
        run(h, 1, [turbine(40, 40)]);
        h.ticks(600);
        h.sim.handleMessage({ type: 'requestSave' });
      }
      expect(new Uint8Array(latestSaveData(held))).toEqual(new Uint8Array(latestSaveData(free)));
    },
    GROWTH_TIMEOUT_MS,
  );

  it('posts a command applied while paused only once the page has acknowledged', () => {
    const h = gated();
    h.ticks(60);
    h.sim.handleMessage({ type: 'setSpeed', speed: 0 });
    h.sim.pump(50);
    const before = snapshotCount(h);
    send(h, 1, [turbine(40, 40)]);
    h.sim.pump(50);
    // The result is held, not lost: the snapshot after the acknowledgement carries it.
    h.sim.pump(50);
    h.sim.pump(50);
    expect(snapshotCount(h)).toBe(before);
    acknowledge(h);
    expect(snapshotCount(h)).toBe(before + 1);
    expect(h.lastSnapshot()!.buildings!.added.map((b) => b.x)).toContain(40);
  });

  it('behaves as before while the page has never acknowledged', () => {
    const h = sandboxed();
    h.ticks(100);
    const a = snapshotCount(h);
    h.ticks(100);
    expect(snapshotCount(h)).toBeGreaterThan(a);
  });
});
