import { describe, expect, it } from 'vitest';
import { TILE_METERS } from '../shared/constants';
import { maxHeightOverFootprint } from './footprint';

describe('maxHeightOverFootprint', () => {
  it('returns the highest corner-grid height under the footprint', () => {
    // Height rises with x+z; the far (tileX+w, tileZ+d) corner is the max.
    const heightAt = (x: number, z: number): number => x / TILE_METERS + z / TILE_METERS;
    const max = maxHeightOverFootprint(heightAt, 2, 3, 2, 3);
    expect(max).toBeCloseTo(2 + 2 + 3 + 3, 6); // (tileX+w) + (tileZ+d)
  });

  it('samples the full (w+1)x(d+1) tile-corner grid', () => {
    const seen: Array<[number, number]> = [];
    const heightAt = (x: number, z: number): number => {
      seen.push([x / TILE_METERS, z / TILE_METERS]);
      return 0;
    };
    maxHeightOverFootprint(heightAt, 0, 0, 2, 3);
    expect(seen.length).toBe((2 + 1) * (3 + 1));
    // Corners span origin tile through origin+size, inclusive.
    expect(seen).toContainEqual([0, 0]);
    expect(seen).toContainEqual([2, 3]);
  });

  it('catches an interior/off-centre bump the centre sample would miss', () => {
    // Flat except a spike on one corner tile — centre-only sampling returns 0,
    // but the footprint max must see the spike.
    const heightAt = (x: number, z: number): number =>
      x / TILE_METERS === 3 && z / TILE_METERS === 0 ? 50 : 0;
    expect(maxHeightOverFootprint(heightAt, 1, 0, 2, 2)).toBe(50);
  });

  it('works for a 1x1 footprint (four corner samples)', () => {
    const heightAt = (x: number, z: number): number => (x / TILE_METERS) * 10 + z / TILE_METERS;
    expect(maxHeightOverFootprint(heightAt, 4, 5, 1, 1)).toBeCloseTo(5 * 10 + 6, 6);
  });
});
