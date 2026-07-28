/**
 * Deterministic RNG for the simulation: seeded RNG, integer math where
 * possible, for reproducibility/replayability/debuggability.
 *
 * Production code must NEVER call Math.random() or Date.now() — all
 * randomness must flow through an `Rng` instance, injected by the caller.
 */

export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Next integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** Next float in [a, b). */
  range(a: number, b: number): number;
  /**
   * A new, independent Rng stream derived from this Rng's original
   * construction seed and `streamId`. Deterministic and stable: the same
   * (seed, streamId) pair always produces the same stream, regardless of
   * how far this Rng (or any sibling fork) has already advanced. Forking
   * never consumes or otherwise perturbs this stream's own sequence.
   */
  fork(streamId: number): Rng;
}

/**
 * 32-bit avalanche mix (the murmur3 finalizer) used to combine a seed and a
 * stream id into a single well-distributed 32-bit seed for `fork`, so that
 * nearby/related (seed, streamId) pairs still produce decorrelated streams.
 */
function mixSeed(seed: number, streamId: number): number {
  let h = (seed ^ streamId ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** mulberry32: fast, small, well-distributed 32-bit PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Create a deterministic Rng from a numeric seed (truncated to uint32). */
export function createRng(seed: number): Rng {
  const originalSeed = seed >>> 0;
  const nextRaw = mulberry32(originalSeed);

  return {
    next(): number {
      return nextRaw();
    },
    int(maxExclusive: number): number {
      return Math.floor(nextRaw() * maxExclusive);
    },
    range(a: number, b: number): number {
      return a + nextRaw() * (b - a);
    },
    fork(streamId: number): Rng {
      return createRng(mixSeed(originalSeed, streamId));
    },
  };
}
