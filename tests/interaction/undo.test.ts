import { describe, expect, it } from 'vitest';
import { MAP_SIZE } from '../../src/shared/constants';
import type { Command } from '../../src/shared/types';
import { decodeSave } from '../../src/app/persist';
import { deserializeGrid } from '../../src/world/grid';
import { UndoStack } from '../../src/tools/undo';
import { flatMap, latestSaveData, makeHarness, send } from '../support/sim';
import { guardRoadNetwork } from '../support/guard';

guardRoadNetwork();

/**
 * A terraform ack's inverse is a terraformSet patch that flows through the
 * UndoStack exactly the way main.ts wires it (onAck pushes {forward, inverse:
 * ack.inverse}; undo/redo dispatch what the stack returns back to the worker
 * as silent command batches).
 */
describe('terraform undo and redo through the undo stack', () => {
  it('undo restores heights float-exactly and redo replays the forward stroke', () => {
    const h = makeHarness();
    h.sim.handleMessage({ type: 'init', seed: 7, map: flatMap() });
    const heights = (): Float32Array => {
      h.sim.handleMessage({ type: 'requestSave' });
      return deserializeGrid(decodeSave(latestSaveData(h)).grid).height;
    };

    const stack = new UndoStack();
    const forward: Command[] = [
      { kind: 'terraform', mode: 'raise', center: { x: 64, z: 64 }, radius: 4, strength: 3 },
    ];
    send(h, 1, forward);
    h.ticks(1); // command batches drain on the next sim tick

    const ack = h.ackFor(1)!;
    expect(ack).not.toBeNull();
    expect(ack.ok).toBe(true);
    expect(ack.inverse).toHaveLength(1);
    expect(ack.inverse[0]!.kind).toBe('terraformSet');

    // main.ts onAck: the acked edit lands on the undo stack.
    stack.push({ label: 'Raise', forward, inverse: ack.inverse, cost: ack.cost });
    expect(stack.canUndo()).toBe(true);

    // The stroke really changed the terrain.
    const raised = heights();
    const center = 64 * MAP_SIZE + 64;
    expect(raised[center]).toBeGreaterThan(5);

    // Undo: dispatch the stack's inverse to the worker, silently.
    const inverse = stack.undo();
    expect(inverse).toBe(ack.inverse);
    send(h, 2, inverse!);
    h.ticks(1);
    const restored = heights();
    for (let i = 0; i < restored.length; i++) {
      if (restored[i] !== 5) throw new Error(`height not restored at ${i}: ${restored[i]}`);
    }

    // Redo hands back the original forward commands; the worker re-applies them.
    const redo = stack.redo();
    expect(redo).toBe(forward);
    send(h, 3, redo!);
    h.ticks(1);
    expect(heights()[center]).toBe(raised[center]);
  });
});
