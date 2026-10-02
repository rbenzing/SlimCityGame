import { describe, expect, it } from 'vitest';
import { createGrid } from './grid';
import { canLayPipe, layWaterPipe, pipeAt, waterPipeCount, waterPipeTiles } from './waterpipe';
import { RoadTier } from '../shared/types';

const SIZE = 8;
const idx = (x: number, z: number): number => z * SIZE + x;

describe('layWaterPipe', () => {
  it('lays a run and reports exactly the tiles it changed', () => {
    const g = createGrid(SIZE);
    const changed = layWaterPipe(
      g,
      [
        { x: 1, z: 1 },
        { x: 2, z: 1 },
        { x: 3, z: 1 },
      ],
      true,
    );
    expect(changed).toHaveLength(3);
    expect(waterPipeCount(g)).toBe(3);
    expect(pipeAt(g, 2, 1)).toBe(true);
  });

  it('charges nothing for dragging back over a run already laid', () => {
    const g = createGrid(SIZE);
    const tiles = [
      { x: 1, z: 1 },
      { x: 2, z: 1 },
    ];
    expect(layWaterPipe(g, tiles, true)).toHaveLength(2);
    expect(layWaterPipe(g, tiles, true)).toHaveLength(0);
    expect(waterPipeCount(g)).toBe(2);
  });

  it('pulls a pipe up and reports what came up', () => {
    const g = createGrid(SIZE);
    layWaterPipe(g, [{ x: 4, z: 4 }], true);
    expect(layWaterPipe(g, [{ x: 4, z: 4 }], false)).toHaveLength(1);
    expect(pipeAt(g, 4, 4)).toBe(false);
    expect(layWaterPipe(g, [{ x: 4, z: 4 }], false)).toHaveLength(0);
  });

  it('runs under a road — the pipe is buried, not in the surface', () => {
    const g = createGrid(SIZE);
    g.roadTier[idx(2, 2)] = RoadTier.TwoLane;
    expect(canLayPipe(g, 2, 2)).toBe(true);
    expect(layWaterPipe(g, [{ x: 2, z: 2 }], true)).toHaveLength(1);
    expect(g.roadTier[idx(2, 2)]).toBe(RoadTier.TwoLane);
  });

  it('will not cross open water, which the intake and the outfall are the buildings for', () => {
    const g = createGrid(SIZE);
    g.water[idx(3, 3)] = 1;
    expect(canLayPipe(g, 3, 3)).toBe(false);
    expect(layWaterPipe(g, [{ x: 3, z: 3 }], true)).toHaveLength(0);
  });

  it('will not stand on a building, which has its own connection', () => {
    const g = createGrid(SIZE);
    g.buildingId[idx(5, 5)] = 42;
    expect(canLayPipe(g, 5, 5)).toBe(false);
    expect(layWaterPipe(g, [{ x: 5, z: 5 }], true)).toHaveLength(0);
  });

  it('ignores tiles off the map rather than throwing', () => {
    const g = createGrid(SIZE);
    expect(
      layWaterPipe(
        g,
        [
          { x: -1, z: 0 },
          { x: SIZE, z: 0 },
          { x: 0, z: 0 },
        ],
        true,
      ),
    ).toEqual([{ x: 0, z: 0 }]);
  });

  it('lists its tiles row-major, which is the order the overlay walks', () => {
    const g = createGrid(SIZE);
    layWaterPipe(
      g,
      [
        { x: 5, z: 2 },
        { x: 1, z: 1 },
        { x: 3, z: 2 },
      ],
      true,
    );
    expect(waterPipeTiles(g)).toEqual([
      { x: 1, z: 1 },
      { x: 3, z: 2 },
      { x: 5, z: 2 },
    ]);
  });

  it('shares its ground with a power line: one is buried, the other on poles', () => {
    const g = createGrid(SIZE);
    g.powerLine[idx(6, 6)] = 1;
    expect(layWaterPipe(g, [{ x: 6, z: 6 }], true)).toHaveLength(1);
    expect(g.powerLine[idx(6, 6)]).toBe(1);
  });
});
