import { describe, expect, it } from 'vitest';
import { MAP_SIZE, SEA_LEVEL, tileIndex } from '../shared/constants';
import { decodeMap, generateProceduralMap } from './maps';

describe('generateProceduralMap', () => {
  it('is deterministic for a given seed', () => {
    const a = generateProceduralMap(1234, 'Test Island');
    const b = generateProceduralMap(1234, 'Test Island');
    expect(Array.from(a.height)).toEqual(Array.from(b.height));
    expect(Array.from(a.water)).toEqual(Array.from(b.water));
    expect(Array.from(a.trees)).toEqual(Array.from(b.trees));
    expect(a.spawn).toEqual(b.spawn);
  });

  it('produces different terrain for different seeds', () => {
    const a = generateProceduralMap(1, 'A');
    const b = generateProceduralMap(2, 'B');
    expect(Array.from(a.height)).not.toEqual(Array.from(b.height));
  });

  it('allocates a MAP_SIZE grid with matching name and sea level', () => {
    const m = generateProceduralMap(42, 'Alpha');
    const n = MAP_SIZE * MAP_SIZE;
    expect(m.size).toBe(MAP_SIZE);
    expect(m.name).toBe('Alpha');
    expect(m.seaLevel).toBe(SEA_LEVEL);
    expect(m.height.length).toBe(n);
    expect(m.water.length).toBe(n);
    expect(m.trees.length).toBe(n);
  });

  it('keeps heights within the documented range', () => {
    const m = generateProceduralMap(99, 'Range');
    for (let i = 0; i < m.height.length; i++) {
      expect(m.height[i]).toBeGreaterThanOrEqual(-8);
      expect(m.height[i]).toBeLessThanOrEqual(40);
    }
  });

  it('derives water exactly from height vs sea level, and never grows trees on water', () => {
    const m = generateProceduralMap(7, 'Consistency');
    for (let i = 0; i < m.height.length; i++) {
      const shouldBeWater = m.height[i]! < m.seaLevel;
      expect(m.water[i]).toBe(shouldBeWater ? 1 : 0);
      if (m.water[i] === 1) {
        expect(m.trees[i]).toBe(0);
      }
    }
  });

  it('places spawn in bounds and on dry land', () => {
    const m = generateProceduralMap(2024, 'Spawn');
    expect(m.spawn.x).toBeGreaterThanOrEqual(0);
    expect(m.spawn.x).toBeLessThan(MAP_SIZE);
    expect(m.spawn.z).toBeGreaterThanOrEqual(0);
    expect(m.spawn.z).toBeLessThan(MAP_SIZE);
    const i = tileIndex(m.spawn.x, m.spawn.z);
    expect(m.water[i]).toBe(0);
  });
});

describe('decodeMap', () => {
  it('resamples a uniform 4x4 heightmap to a constant MAP_SIZE grid', () => {
    const heightPx = new Uint8ClampedArray(16).fill(128);
    const m = decodeMap(
      { width: 4, height: 4, heightPx },
      { name: 'Uniform', minHeight: -8, maxHeight: 40, seaLevel: 0 },
    );
    const expected = -8 + (128 / 255) * 48;
    expect(m.size).toBe(MAP_SIZE);
    for (let i = 0; i < m.height.length; i++) {
      expect(m.height[i]).toBeCloseTo(expected, 5);
    }
  });

  it('resamples a left-to-right ramp monotonically and hits the exact edges', () => {
    // 4 columns x 4 rows, value depends only on column: 0, 85, 170, 255
    const heightPx = new Uint8ClampedArray(16);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        heightPx[row * 4 + col] = col * 85;
      }
    }
    const m = decodeMap(
      { width: 4, height: 4, heightPx },
      { name: 'Ramp', minHeight: 0, maxHeight: 100, seaLevel: 50 },
    );
    // Leftmost column samples exactly the source's first column (clamped edge).
    expect(m.height[tileIndex(0, 0)]).toBeCloseTo(0, 5);
    // Rightmost column samples exactly the source's last column (clamped edge).
    expect(m.height[tileIndex(MAP_SIZE - 1, 0)]).toBeCloseTo(100, 5);
    // Monotonic non-decreasing across a row.
    for (let x = 1; x < MAP_SIZE; x++) {
      expect(m.height[tileIndex(x, 0)]).toBeGreaterThanOrEqual(
        m.height[tileIndex(x - 1, 0)]! - 1e-6,
      );
    }
  });

  it('derives water from the resampled height vs seaLevel', () => {
    const heightPx = new Uint8ClampedArray(16);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        heightPx[row * 4 + col] = col * 85;
      }
    }
    const m = decodeMap(
      { width: 4, height: 4, heightPx },
      { name: 'Water', minHeight: 0, maxHeight: 100, seaLevel: 50 },
    );
    for (let i = 0; i < m.height.length; i++) {
      expect(m.water[i]).toBe(m.height[i]! < 50 ? 1 : 0);
    }
    // left edge is below sea level, right edge is above it
    expect(m.water[tileIndex(0, 0)]).toBe(1);
    expect(m.water[tileIndex(MAP_SIZE - 1, 0)]).toBe(0);
  });

  it('fills trees with zero when no treePx is supplied', () => {
    const heightPx = new Uint8ClampedArray(16).fill(200); // all dry land
    const m = decodeMap(
      { width: 4, height: 4, heightPx },
      { name: 'NoTrees', minHeight: 0, maxHeight: 10, seaLevel: -100 },
    );
    expect(m.trees.every((v) => v === 0)).toBe(true);
  });

  it('resamples treePx when supplied, and still zeroes trees on water', () => {
    const heightPx = new Uint8ClampedArray(16);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        heightPx[row * 4 + col] = col * 85;
      }
    }
    const treePx = new Uint8ClampedArray(16).fill(200);
    const m = decodeMap(
      { width: 4, height: 4, heightPx, treePx },
      { name: 'Trees', minHeight: 0, maxHeight: 100, seaLevel: 50 },
    );
    // left edge is water -> no trees regardless of treePx
    expect(m.trees[tileIndex(0, 0)]).toBe(0);
    // right edge is dry -> trees resampled to exactly the (uniform) source value
    expect(m.trees[tileIndex(MAP_SIZE - 1, 0)]).toBe(200);
  });

  it('produces a spawn point in bounds', () => {
    const heightPx = new Uint8ClampedArray(16).fill(200);
    const m = decodeMap(
      { width: 4, height: 4, heightPx },
      { name: 'Spawn', minHeight: 0, maxHeight: 10, seaLevel: -100 },
    );
    expect(m.spawn.x).toBeGreaterThanOrEqual(0);
    expect(m.spawn.x).toBeLessThan(MAP_SIZE);
    expect(m.spawn.z).toBeGreaterThanOrEqual(0);
    expect(m.spawn.z).toBeLessThan(MAP_SIZE);
  });
});
