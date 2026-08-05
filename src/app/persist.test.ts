import { describe, expect, it } from 'vitest';
import { TICKS_PER_MONTH } from '../shared/constants';
import { SAVE_VERSION, type MainToWorker, type SaveHeader } from '../shared/types';
import {
  AutoSaver,
  decodeSave,
  encodeSave,
  postLoadSaveMessage,
  sortSaveHeadersNewestFirst,
  stampSavedAt,
  type SaveHeaderWithId,
  type SaveMeta,
} from './persist';

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

// NOTE: The repo has no IndexedDB test harness (no fake-indexeddb dependency,
// and vitest here runs with `environment: 'node'`, so no browser `indexedDB`
// global either). Per scope, no new dependency was added. The multi-slot
// storage functions (listSaves/deleteSave/getSaveById/loadSaveById's
// getSaveById call) that open a real IndexedDB connection are therefore only
// exercised in the browser, not here. The tests below cover everything that
// can be tested without IndexedDB: the pure newest-first sort helper the
// multi-slot API shares, and the pure "post the found save to the worker"
// helper that loadLatest()/loadSaveById() both funnel through.

function stubWorker(): { worker: Worker; posted: { msg: unknown; transfer?: Transferable[] }[] } {
  const posted: { msg: unknown; transfer?: Transferable[] }[] = [];
  const worker = {
    postMessage: (msg: unknown, transfer?: Transferable[]) => {
      posted.push({ msg, transfer });
    },
  } as unknown as Worker;
  return { worker, posted };
}

function sampleHeaderWithId(id: number, savedAt: number): SaveHeaderWithId {
  return { ...sampleHeader(), savedAt, id };
}

describe('sortSaveHeadersNewestFirst', () => {
  it('sorts by savedAt descending without mutating the input array', () => {
    const input = [
      sampleHeaderWithId(1, 100),
      sampleHeaderWithId(2, 300),
      sampleHeaderWithId(3, 200),
    ];
    const sorted = sortSaveHeadersNewestFirst(input);

    expect(sorted.map((h) => h.id)).toEqual([2, 3, 1]);
    // Original array order is untouched.
    expect(input.map((h) => h.id)).toEqual([1, 2, 3]);
  });

  it('is a no-op on an empty list', () => {
    expect(sortSaveHeadersNewestFirst([])).toEqual([]);
  });
});

describe('postLoadSaveMessage', () => {
  it('posts a loadSave message with the entry data, transferring the buffer', () => {
    const { worker, posted } = stubWorker();
    const data = sampleGrid();

    const found = postLoadSaveMessage(worker, { data });

    expect(found).toBe(true);
    expect(posted).toHaveLength(1);
    const expected: MainToWorker = { type: 'loadSave', data };
    expect(posted[0]!.msg).toEqual(expected);
    expect(posted[0]!.transfer).toEqual([data]);
  });

  it('returns false and posts nothing when there is no entry', () => {
    const { worker, posted } = stubWorker();

    const found = postLoadSaveMessage(worker, null);

    expect(found).toBe(false);
    expect(posted).toHaveLength(0);
  });
});
