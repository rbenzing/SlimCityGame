/**
 * The road tiles the lots' driveways cross, kept per building so a snapshot
 * redoes only the buildings its delta names. What decides a building's tiles
 * besides the building is the world around it — roads, their sections, junction
 * controls, water — so a change to any of those must `invalidate()`: the next
 * `apply` then recomputes every building.
 */
import type { BuildingDelta, BuildingInstance } from '../shared/types';

export class DrivewayTiles {
  private readonly known = new Map<number, BuildingInstance>();
  private readonly keysById = new Map<number, readonly number[]>();
  private stale = false;
  private readonly pending: ((inst: BuildingInstance) => boolean)[] = [];

  /** Make the next `apply` recompute the tiles of every building it knows. */
  invalidate(): void {
    this.stale = true;
  }

  /** Make the next `apply` recompute only the known buildings `picks` names, for a change only they read. */
  invalidateWhere(picks: (inst: BuildingInstance) => boolean): void {
    this.pending.push(picks);
  }

  /** Take a delta: recompute what it added or updated (everything, when stale) and drop what it removed. */
  apply(delta: BuildingDelta, keysFor: (inst: BuildingInstance) => readonly number[]): void {
    for (const id of delta.removed) {
      this.known.delete(id);
      this.keysById.delete(id);
    }
    for (const inst of delta.added) this.known.set(inst.id, inst);
    for (const inst of delta.updated) this.known.set(inst.id, inst);
    const picks = this.pending.splice(0);
    if (this.stale) {
      this.stale = false;
      for (const inst of this.known.values()) this.keysById.set(inst.id, keysFor(inst));
      return;
    }
    const redo = new Set<number>();
    for (const inst of delta.added) redo.add(inst.id);
    for (const inst of delta.updated) redo.add(inst.id);
    if (picks.length > 0) {
      for (const inst of this.known.values()) {
        if (picks.some((p) => p(inst))) redo.add(inst.id);
      }
    }
    for (const id of redo) this.keysById.set(id, keysFor(this.known.get(id)!));
  }

  /** Every tile key any building contributes. */
  keys(): Set<number> {
    const out = new Set<number>();
    for (const keys of this.keysById.values()) for (const key of keys) out.add(key);
    return out;
  }
}
