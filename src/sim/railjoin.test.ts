import { describe, expect, it } from 'vitest';
import { tileIndex } from '../shared/constants';
import { RoadTier } from '../shared/types';
import { column, latestSaveGrid, roadRow, run, sandboxed } from '../../tests/support/sim';

describe('track laid through the build command', () => {
  const maskAt = (h: ReturnType<typeof sandboxed>, x: number, z: number): number => {
    h.sim.handleMessage({ type: 'requestSave' });
    return latestSaveGrid(h).roadMask[tileIndex(x, z)] ?? 0;
  };

  it('keeps a second row of track beside the first apart, snapping on or off', () => {
    for (const join of [undefined, false]) {
      const h = sandboxed();
      run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.RailTrack, tiles: roadRow(100, 100, 6) }]);
      const second = run(h, 2, [
        { kind: 'buildRoad', tier: RoadTier.RailTrack, tiles: roadRow(100, 101, 6), join },
      ]);
      expect(second.ok).toBe(true);
      for (let x = 101; x <= 104; x++) {
        expect(maskAt(h, x, 100)).toBe(2 | 8);
        expect(maskAt(h, x, 101)).toBe(2 | 8);
      }
    }
  });

  it('joins a stroke drawn into the side of a track, and a one-tile stroke between two tracks', () => {
    const h = sandboxed();
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.RailTrack, tiles: roadRow(100, 100, 6) }]);
    run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.RailTrack, tiles: column(103, 97, 3) }]);
    expect(maskAt(h, 103, 100)).toBe(1 | 2 | 8);
    expect(maskAt(h, 103, 99)).toBe(1 | 4);
    run(h, 3, [{ kind: 'buildRoad', tier: RoadTier.RailTrack, tiles: roadRow(100, 102, 6) }]);
    run(h, 4, [{ kind: 'buildRoad', tier: RoadTier.RailTrack, tiles: [{ x: 101, z: 101 }] }]);
    expect(maskAt(h, 101, 101)).toBe(1 | 4);
    expect(maskAt(h, 101, 100)).toBe(2 | 4 | 8);
  });
});
