import { describe, expect, it } from 'vitest';
import { TILE_METERS } from '../shared/constants';
import { maxHeightOverRect, maxHeightUnderBody } from './footprint';

describe('maxHeightUnderBody', () => {
  it('is the highest ground under the body itself, not under the whole footprint', () => {
    // Flat lot with a spike at the footprint's far corner, where a climbing
    // street might leave the shared vertex: the body is set back from it.
    const heightAt = (x: number, z: number): number =>
      x / TILE_METERS === 2 && z / TILE_METERS === 2 ? 50 : 0;
    const centre = TILE_METERS; // a 2×2 footprint at tile (0, 0)
    expect(maxHeightUnderBody(heightAt, centre, centre, 30, 30, 0)).toBe(0);
    // Widen the body to the corner and it stands on the spike.
    expect(maxHeightUnderBody(heightAt, centre, centre, 40, 40, 0)).toBe(50);
  });

  it('turns the body with the building, swapping its extents', () => {
    const heightAt = (x: number): number => (x > 30 ? 9 : 0);
    const centre = TILE_METERS;
    // Unturned, the long side runs along x and reaches the high ground.
    expect(maxHeightUnderBody(heightAt, centre, centre, 30, 10, 0)).toBe(9);
    // A quarter turn puts the long side along z, clear of it.
    expect(maxHeightUnderBody(heightAt, centre, centre, 30, 10, 1)).toBe(0);
  });

  it('catches an interior bump the centre sample would miss', () => {
    const heightAt = (x: number, z: number): number =>
      Math.round(x / TILE_METERS) === 1 && Math.round(z / TILE_METERS) === 1 ? 7 : 0;
    expect(maxHeightOverRect(heightAt, 5, 5, 35, 35)).toBe(7);
  });
});
