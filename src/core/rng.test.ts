import { describe, it, expect } from 'vitest';
import { createRng } from './rng';

describe('createRng', () => {
  it('produces a deterministic sequence for a given seed', () => {
    const a = createRng(12345);
    const b = createRng(12345);

    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());

    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);

    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());

    expect(seqA).not.toEqual(seqB);
  });

  it('replaying the same seed from scratch reproduces identical draws', () => {
    const a = createRng(555);
    const b = createRng(555);

    const drawsA = Array.from({ length: 15 }, () => a.int(100));
    const drawsB = Array.from({ length: 15 }, () => b.int(100));

    expect(drawsA).toEqual(drawsB);
  });

  it('next() always returns a value in [0, 1)', () => {
    const rng = createRng(999);
    for (let i = 0; i < 5000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('next() is not a constant (sanity check against a broken generator)', () => {
    const rng = createRng(31415);
    const values = new Set(Array.from({ length: 50 }, () => rng.next()));
    expect(values.size).toBeGreaterThan(1);
  });

  describe('int', () => {
    it('returns integers within [0, maxExclusive)', () => {
      const rng = createRng(42);
      for (let i = 0; i < 2000; i++) {
        const v = rng.int(7);
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(7);
      }
    });

    it('int(1) always returns 0', () => {
      const rng = createRng(7);
      for (let i = 0; i < 100; i++) {
        expect(rng.int(1)).toBe(0);
      }
    });

    it('covers the full range for a large sample', () => {
      const rng = createRng(2718);
      const seen = new Set<number>();
      for (let i = 0; i < 5000; i++) {
        seen.add(rng.int(5));
      }
      expect(Array.from(seen).sort()).toEqual([0, 1, 2, 3, 4]);
    });
  });

  describe('range', () => {
    it('returns values within [a, b)', () => {
      const rng = createRng(123);
      for (let i = 0; i < 2000; i++) {
        const v = rng.range(-5, 10);
        expect(v).toBeGreaterThanOrEqual(-5);
        expect(v).toBeLessThan(10);
      }
    });

    it('handles a zero-width range by always returning a', () => {
      const rng = createRng(9);
      for (let i = 0; i < 20; i++) {
        expect(rng.range(3, 3)).toBe(3);
      }
    });
  });

  describe('fork', () => {
    it('is deterministic: forking the same streamId from equal parents yields identical streams', () => {
      const parentA = createRng(2024);
      const parentB = createRng(2024);

      const childA = parentA.fork(3);
      const childB = parentB.fork(3);

      const seqA = Array.from({ length: 10 }, () => childA.next());
      const seqB = Array.from({ length: 10 }, () => childB.next());

      expect(seqA).toEqual(seqB);
    });

    it('is stable regardless of how much the parent stream advanced before forking', () => {
      const parent1 = createRng(2024);
      const childImmediate = parent1.fork(3);
      const seqImmediate = Array.from({ length: 5 }, () => childImmediate.next());

      const parent2 = createRng(2024);
      parent2.next();
      parent2.next();
      parent2.next();
      const childLater = parent2.fork(3);
      const seqLater = Array.from({ length: 5 }, () => childLater.next());

      expect(seqLater).toEqual(seqImmediate);
    });

    it('different streamIds produce different sequences', () => {
      const parent = createRng(77);
      const childA = parent.fork(1);
      const childB = parent.fork(2);

      const seqA = Array.from({ length: 10 }, () => childA.next());
      const seqB = Array.from({ length: 10 }, () => childB.next());

      expect(seqA).not.toEqual(seqB);
    });

    it('different parent seeds with the same streamId produce different sequences', () => {
      const childA = createRng(1).fork(5);
      const childB = createRng(2).fork(5);

      const seqA = Array.from({ length: 10 }, () => childA.next());
      const seqB = Array.from({ length: 10 }, () => childB.next());

      expect(seqA).not.toEqual(seqB);
    });

    it('does not consume or otherwise perturb the parent stream', () => {
      const rngA = createRng(31415);
      rngA.next(); // consume the first draw
      rngA.fork(5); // must not itself draw from rngA
      const secondFromA = rngA.next();

      const rngB = createRng(31415);
      rngB.next(); // same first draw as rngA
      const secondFromB = rngB.next();

      expect(secondFromA).toBe(secondFromB);
    });

    it('a forked stream can itself be forked to further independent streams', () => {
      const root = createRng(64);
      const grandchildA = root.fork(1).fork(2);
      const grandchildB = root.fork(1).fork(2);
      const grandchildC = root.fork(1).fork(3);

      const seqA = Array.from({ length: 5 }, () => grandchildA.next());
      const seqB = Array.from({ length: 5 }, () => grandchildB.next());
      const seqC = Array.from({ length: 5 }, () => grandchildC.next());

      expect(seqA).toEqual(seqB);
      expect(seqA).not.toEqual(seqC);
    });
  });
});
