/**
 * Bounded undo/redo history for player tool edits.
 *
 * Holds `ReversibleEdit` records (label + forward/inverse commands + cost)
 * produced when a tool commit is acknowledged by the worker. `undo()` hands
 * back the inverse commands for the caller to dispatch to the worker;
 * `redo()` hands back the forward commands. Sim-grown changes never enter
 * this stack — only player edits do.
 */
import type { Command, ReversibleEdit } from '../shared/types';

const MAX_DEPTH = 64;

export class UndoStack {
  private readonly undoList: ReversibleEdit[] = [];
  private readonly redoList: ReversibleEdit[] = [];

  /** Records a newly committed edit and clears the redo history. */
  push(edit: ReversibleEdit): void {
    this.undoList.push(edit);
    if (this.undoList.length > MAX_DEPTH) {
      this.undoList.shift();
    }
    this.redoList.length = 0;
  }

  /** Pops the most recent edit and returns its inverse commands, or null if empty. */
  undo(): Command[] | null {
    const edit = this.undoList.pop();
    if (!edit) return null;
    this.redoList.push(edit);
    return edit.inverse;
  }

  /** Pops the most recently undone edit and returns its forward commands, or null if empty. */
  redo(): Command[] | null {
    const edit = this.redoList.pop();
    if (!edit) return null;
    this.undoList.push(edit);
    return edit.forward;
  }

  canUndo(): boolean {
    return this.undoList.length > 0;
  }

  canRedo(): boolean {
    return this.redoList.length > 0;
  }

  /** Number of edits currently available to undo. */
  get depth(): number {
    return this.undoList.length;
  }
}
