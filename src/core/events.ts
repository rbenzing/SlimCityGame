/**
 * Minimal typed pub/sub event bus. `TMap` maps
 * event names to their payload type, e.g.:
 *
 *   interface AppEvents { speedChanged: SimSpeed; tick: number }
 *   const bus = new EventBus<AppEvents>();
 *   const unsubscribe = bus.on('tick', (t) => console.log(t));
 *   bus.emit('tick', 42);
 *   unsubscribe();
 */
export class EventBus<TMap extends Record<string, unknown>> {
  // Listeners are stored behind a `never`-parameter signature so a single Map
  // can hold callbacks for every event key without resorting to `any`. The
  // public on/off/emit API below stays fully and correctly typed per key;
  // the casts here are the (safe, standard) type-erasure boundary.
  private readonly listeners = new Map<keyof TMap, Set<(payload: never) => void>>();

  /**
   * Subscribe `listener` to `event`. Returns an unsubscribe function
   * equivalent to calling `off(event, listener)`.
   */
  on<K extends keyof TMap>(event: K, listener: (payload: TMap[K]) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as (payload: never) => void);
    return () => this.off(event, listener);
  }

  /** Unsubscribe a previously registered listener. Safe to call more than once. */
  off<K extends keyof TMap>(event: K, listener: (payload: TMap[K]) => void): void {
    this.listeners.get(event)?.delete(listener as (payload: never) => void);
  }

  /** Synchronously invoke every listener currently registered for `event`. */
  emit<K extends keyof TMap>(event: K, payload: TMap[K]): void {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;
    // Snapshot before iterating: a listener may (un)subscribe during emit
    // without corrupting this dispatch pass.
    for (const listener of Array.from(set)) {
      listener(payload as never);
    }
  }
}
