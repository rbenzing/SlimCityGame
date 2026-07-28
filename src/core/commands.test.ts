import { describe, it, expect } from 'vitest';
import { CommandQueue } from './commands';
import type { Command } from '../shared/types';

const bulldoze = (x: number, z: number): Command => ({
  kind: 'bulldoze',
  tiles: [{ x, z }],
});

describe('CommandQueue', () => {
  it('assigns a monotonically increasing seq to each push, starting at 1', () => {
    const queue = new CommandQueue();
    const seq1 = queue.push([bulldoze(0, 0)]);
    const seq2 = queue.push([bulldoze(1, 0)]);
    const seq3 = queue.push([bulldoze(2, 0)]);

    expect([seq1, seq2, seq3]).toEqual([1, 2, 3]);
  });

  it('drain returns queued batches in push order with their seq and commands', () => {
    const queue = new CommandQueue();
    const cmdsA = [bulldoze(0, 0)];
    const cmdsB = [bulldoze(1, 1), bulldoze(2, 2)];
    const seqA = queue.push(cmdsA);
    const seqB = queue.push(cmdsB);

    const batches = queue.drain();

    expect(batches).toEqual([
      { seq: seqA, commands: cmdsA },
      { seq: seqB, commands: cmdsB },
    ]);
  });

  it('drain empties the queue: a second drain call returns nothing', () => {
    const queue = new CommandQueue();
    queue.push([bulldoze(0, 0)]);

    queue.drain();
    const second = queue.drain();

    expect(second).toEqual([]);
  });

  it('draining an empty queue returns an empty array', () => {
    const queue = new CommandQueue();
    expect(queue.drain()).toEqual([]);
  });

  it('seq numbering continues across drains rather than resetting', () => {
    const queue = new CommandQueue();
    const seq1 = queue.push([bulldoze(0, 0)]);
    queue.drain();
    const seq2 = queue.push([bulldoze(1, 1)]);

    expect(seq2).toBe(seq1 + 1);
  });

  it('supports pushing an empty command batch', () => {
    const queue = new CommandQueue();
    const seq = queue.push([]);

    expect(queue.drain()).toEqual([{ seq, commands: [] }]);
  });

  it('mutating the caller array after push does not affect the queued batch', () => {
    const queue = new CommandQueue();
    const cmds = [bulldoze(0, 0)];
    queue.push(cmds);
    cmds.push(bulldoze(9, 9));

    const batches = queue.drain();
    expect(batches[0]?.commands).toEqual([bulldoze(0, 0)]);
  });

  it('accumulates multiple pushes between drains and returns them all at once', () => {
    const queue = new CommandQueue();
    queue.push([bulldoze(0, 0)]);
    queue.push([bulldoze(1, 1)]);
    queue.push([bulldoze(2, 2)]);

    expect(queue.drain()).toHaveLength(3);
    expect(queue.drain()).toHaveLength(0);
  });
});
