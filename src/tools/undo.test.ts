import { describe, expect, it } from 'vitest';
import { MAP_SIZE, MAP_TILES, SPEED_MULTIPLIERS, TICK_MS } from '../shared/constants';
import type { Command, MapData, ReversibleEdit, WorkerToMain } from '../shared/types';
import { decodeSave } from '../app/persist';
import { createWorkerSim } from '../sim/worker.entry';
import { deserializeGrid } from '../world/grid';
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

/**
 * Terraform integration: a terraform ack's inverse is a terraformSet patch that
 * flows through the UndoStack exactly the way main.ts wires it (onAck pushes
 * {forward, inverse: ack.inverse}; undo/redo dispatch what the stack returns
 * back to the worker as silent command batches).
 */
describe('terraform undo/redo through the UndoStack path (UI-SPEC §6.11)', () => {
  function flatMap(): MapData {
    return {
      name: 'Flatland',
      size: MAP_SIZE,
      height: new Float32Array(MAP_TILES).fill(5),
      water: new Uint8Array(MAP_TILES),
      trees: new Uint8Array(MAP_TILES),
      seaLevel: 0,
      spawn: { x: MAP_SIZE / 2, z: MAP_SIZE / 2 },
    };
  }

  function heightsFromLastSave(messages: WorkerToMain[]): Float32Array {
    const saves = messages.filter(
      (m): m is Extract<WorkerToMain, { type: 'save' }> => m.type === 'save',
    );
    const last = saves[saves.length - 1];
    if (!last) throw new Error('no save message');
    return deserializeGrid(decodeSave(last.data).grid).height;
  }

  it('undo restores heights float-exactly and redo replays the forward stroke', () => {
    const messages: WorkerToMain[] = [];
    const sim = createWorkerSim((m) => messages.push(m));
    sim.handleMessage({ type: 'init', seed: 7, map: flatMap() });

    const stack = new UndoStack();
    const forward: Command[] = [
      { kind: 'terraform', mode: 'raise', center: { x: 64, z: 64 }, radius: 4, strength: 3 },
    ];
    sim.handleMessage({ type: 'commands', seq: 1, commands: forward });
    sim.pump(TICK_MS / SPEED_MULTIPLIERS[1]); // speed 1 = 0.5x pacing (round 6): feed a full tick // command batches drain on the next sim tick

    const ackMsg = messages.find(
      (m): m is Extract<WorkerToMain, { type: 'ack' }> => m.type === 'ack' && m.ack.seq === 1,
    );
    expect(ackMsg).toBeDefined();
    const ack = ackMsg!.ack;
    expect(ack.ok).toBe(true);
    expect(ack.inverse).toHaveLength(1);
    expect(ack.inverse[0]!.kind).toBe('terraformSet');

    // main.ts onAck: the acked edit lands on the undo stack.
    stack.push({ label: 'Raise', forward, inverse: ack.inverse, cost: ack.cost });
    expect(stack.canUndo()).toBe(true);

    // The stroke really changed the terrain.
    sim.handleMessage({ type: 'requestSave' });
    const raised = heightsFromLastSave(messages);
    const center = 64 * MAP_SIZE + 64;
    expect(raised[center]).toBeGreaterThan(5);

    // Undo: dispatch the stack's inverse to the worker, silently.
    const inverse = stack.undo();
    expect(inverse).toBe(ack.inverse);
    sim.handleMessage({ type: 'commands', seq: 2, commands: inverse! });
    sim.pump(TICK_MS / SPEED_MULTIPLIERS[1]); // speed 1 = 0.5x pacing (round 6): feed a full tick
    sim.handleMessage({ type: 'requestSave' });
    const restored = heightsFromLastSave(messages);
    for (let i = 0; i < restored.length; i++) {
      if (restored[i] !== 5) throw new Error(`height not restored at ${i}: ${restored[i]}`);
    }

    // Redo hands back the original forward commands; the worker re-applies them.
    const redo = stack.redo();
    expect(redo).toBe(forward);
    sim.handleMessage({ type: 'commands', seq: 3, commands: redo! });
    sim.pump(TICK_MS / SPEED_MULTIPLIERS[1]); // speed 1 = 0.5x pacing (round 6): feed a full tick
    sim.handleMessage({ type: 'requestSave' });
    const reraised = heightsFromLastSave(messages);
    expect(reraised[center]).toBe(raised[center]);
  });
});
