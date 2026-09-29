import { describe, expect, it } from 'vitest';
import type { Command, ReversibleEdit } from '../shared/types';
import { UndoStack } from './undo';

function edit(n: number): ReversibleEdit {
  const forward: Command[] = [{ kind: 'bulldoze', tiles: [{ x: n, z: n }] }];
  const inverse: Command[] = [{ kind: 'paintZone', zone: 0, tiles: [{ x: n, z: n }] }];
  return { label: `edit-${n}`, forward, inverse, cost: n };
}

describe('UndoStack', () => {
  it('starts empty', () => {
    const stack = new UndoStack();
    expect(stack.canUndo()).toBe(false);
    expect(stack.canRedo()).toBe(false);
    expect(stack.depth).toBe(0);
  });

  it('undo on an empty stack returns null', () => {
    const stack = new UndoStack();
    expect(stack.undo()).toBeNull();
  });

  it('redo on an empty stack returns null', () => {
    const stack = new UndoStack();
    expect(stack.redo()).toBeNull();
  });

  it('push makes the edit undoable and bumps depth', () => {
    const stack = new UndoStack();
    stack.push(edit(1));
    expect(stack.canUndo()).toBe(true);
    expect(stack.canRedo()).toBe(false);
    expect(stack.depth).toBe(1);
  });

  it('undo returns the inverse commands of the most recent edit', () => {
    const stack = new UndoStack();
    const e1 = edit(1);
    stack.push(e1);
    const inv = stack.undo();
    expect(inv).toEqual(e1.inverse);
    expect(stack.canUndo()).toBe(false);
    expect(stack.canRedo()).toBe(true);
    expect(stack.depth).toBe(0);
  });

  it('redo returns the forward commands of the undone edit', () => {
    const stack = new UndoStack();
    const e1 = edit(1);
    stack.push(e1);
    stack.undo();
    const fwd = stack.redo();
    expect(fwd).toEqual(e1.forward);
    expect(stack.canUndo()).toBe(true);
    expect(stack.canRedo()).toBe(false);
    expect(stack.depth).toBe(1);
  });

  it('undoes multiple edits in LIFO order', () => {
    const stack = new UndoStack();
    const e1 = edit(1);
    const e2 = edit(2);
    const e3 = edit(3);
    stack.push(e1);
    stack.push(e2);
    stack.push(e3);
    expect(stack.undo()).toEqual(e3.inverse);
    expect(stack.undo()).toEqual(e2.inverse);
    expect(stack.undo()).toEqual(e1.inverse);
    expect(stack.undo()).toBeNull();
  });

  it('redoes multiple edits in original forward order after undoing all', () => {
    const stack = new UndoStack();
    const e1 = edit(1);
    const e2 = edit(2);
    const e3 = edit(3);
    stack.push(e1);
    stack.push(e2);
    stack.push(e3);
    stack.undo();
    stack.undo();
    stack.undo();
    expect(stack.redo()).toEqual(e1.forward);
    expect(stack.redo()).toEqual(e2.forward);
    expect(stack.redo()).toEqual(e3.forward);
    expect(stack.redo()).toBeNull();
  });

  it('a new push clears the redo stack', () => {
    const stack = new UndoStack();
    stack.push(edit(1));
    stack.push(edit(2));
    stack.undo();
    expect(stack.canRedo()).toBe(true);
    stack.push(edit(3));
    expect(stack.canRedo()).toBe(false);
    expect(stack.redo()).toBeNull();
    // and the new edit is still undoable
    expect(stack.canUndo()).toBe(true);
    expect(stack.depth).toBe(2);
  });

  it('is bounded at 64: pushing beyond capacity evicts the oldest edit', () => {
    const stack = new UndoStack();
    for (let i = 0; i < 70; i++) {
      stack.push(edit(i));
    }
    expect(stack.depth).toBe(64);
    // undo 64 times, newest first (edits 69 down to 6 survive; 0..5 were evicted)
    for (let i = 69; i >= 6; i--) {
      const inv = stack.undo();
      expect(inv).toEqual(edit(i).inverse);
    }
    expect(stack.canUndo()).toBe(false);
    expect(stack.undo()).toBeNull();
  });

  it('redo after undoing a bounded-eviction stack replays surviving edits forward', () => {
    const stack = new UndoStack();
    for (let i = 0; i < 66; i++) {
      stack.push(edit(i));
    }
    // 0 and 1 were evicted; 2..65 survive (64 entries)
    for (let i = 0; i < 64; i++) {
      stack.undo();
    }
    expect(stack.canUndo()).toBe(false);
    expect(stack.redo()).toEqual(edit(2).forward);
  });
});
