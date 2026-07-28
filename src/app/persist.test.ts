import { describe, expect, it } from 'vitest';
import { TICKS_PER_MONTH } from '../shared/constants';
import { SAVE_VERSION, type SaveHeader } from '../shared/types';
import { AutoSaver, decodeSave, encodeSave, stampSavedAt, type SaveMeta } from './persist';

function sampleHeader(): SaveHeader {
  return { version: SAVE_VERSION, seed: 1337, tick: 4200, mapName: 'Riverton', savedAt: 0 };
}

function sampleMeta(): SaveMeta {
  return {
    registry: {
      nextId: 3,
      buildings: [
        {
          id: 1,
          catalogId: 'res-low-1',
          x: 10,
          z: 12,
          rotation: 0,
          level: 1,
          state: 1,
          problems: 0,
          w: 1,
          d: 1,
        },
        {
          id: 2,
          catalogId: 'wind-turbine',
          x: 20,
          z: 20,
          rotation: 1,
          level: 1,
          state: 1,
          problems: 0,
          w: 1,
          d: 1,
        },
      ],
    },
    stats: {
      tick: 4200,
      funds: 12345,
      monthlyIncome: 100,
      monthlyExpenses: 50,
      population: 8,
      jobs: 0,
      employed: 0,
      demand: { res: 0.5, com: 0.1, ind: 0.3 },
      happiness: 47,
      powerSupply: 6,
      powerDemand: 0.2,
      waterSupply: 0,
      waterDemand: 0.8,
      milestoneLevel: 0,
      milestoneProgress: 0.02,
      loanBalance: 0,
      taxRates: { res: 0.09, com: 0.09, ind: 0.09 },
      serviceFunding: { police: 1, fire: 1, health: 1, education: 1, park: 1 },
    },
  };
}

function sampleGrid(): ArrayBuffer {
  const grid = new ArrayBuffer(64);
  const bytes = new Uint8Array(grid);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7) % 256;
  return grid;
}

describe('save payload codec', () => {
  it('round-trips header, grid bytes, and meta exactly', () => {
    const grid = sampleGrid();
    const buf = encodeSave({ header: sampleHeader(), grid, meta: sampleMeta() });
    const decoded = decodeSave(buf);

    expect(decoded.header).toEqual(sampleHeader());
    expect(decoded.meta).toEqual(sampleMeta());
    expect(Array.from(new Uint8Array(decoded.grid))).toEqual(Array.from(new Uint8Array(grid)));
  });

  it('decoded grid is an independent copy, not a view into the payload', () => {
    const buf = encodeSave({ header: sampleHeader(), grid: sampleGrid(), meta: sampleMeta() });
    const decoded = decodeSave(buf);
    expect(decoded.grid.byteLength).toBe(64);
    new Uint8Array(buf).fill(0);
    // Still intact after the payload is clobbered.
    expect(new Uint8Array(decoded.grid)[1]).toBe(7);
  });

  it('stampSavedAt rewrites only the savedAt field', () => {
    const buf = encodeSave({ header: sampleHeader(), grid: sampleGrid(), meta: sampleMeta() });
    const stamped = stampSavedAt(buf, 1721556000000);
    const decoded = decodeSave(stamped);
    expect(decoded.header.savedAt).toBe(1721556000000);
    expect(decoded.header.mapName).toBe('Riverton');
    expect(decoded.header.tick).toBe(4200);
    expect(decoded.meta).toEqual(sampleMeta());
    expect(Array.from(new Uint8Array(decoded.grid))).toEqual(
      Array.from(new Uint8Array(sampleGrid())),
    );
  });

  it('decodeSave rejects a buffer that is too short to be a save', () => {
    expect(() => decodeSave(new ArrayBuffer(3))).toThrow();
  });
});

describe('AutoSaver', () => {
  it('does not save on the first observed tick (baseline only)', () => {
    let saves = 0;
    const saver = new AutoSaver(() => saves++);
    saver.onSnapshotTick(100);
    expect(saves).toBe(0);
  });

  it('saves once every two game-months of ticks', () => {
    let saves = 0;
    const saver = new AutoSaver(() => saves++);
    saver.onSnapshotTick(0);
    saver.onSnapshotTick(2 * TICKS_PER_MONTH - 1);
    expect(saves).toBe(0);
    saver.onSnapshotTick(2 * TICKS_PER_MONTH);
    expect(saves).toBe(1);
    // Interval restarts from the save tick.
    saver.onSnapshotTick(3 * TICKS_PER_MONTH);
    expect(saves).toBe(1);
    saver.onSnapshotTick(4 * TICKS_PER_MONTH);
    expect(saves).toBe(2);
  });
});
