import { describe, expect, it } from 'vitest';
import { createGrid } from './grid';
import {
  canStringLine,
  lineAt,
  powerLineCount,
  powerLineTiles,
  stringPowerLine,
} from './powerline';
import { RoadTier } from '../shared/types';

const SIZE = 8;
const idx = (x: number, z: number): number => z * SIZE + x;

describe('stringPowerLine', () => {
  it('strings a run and reports exactly the tiles it changed', () => {
    const g = createGrid(SIZE);
    const changed = stringPowerLine(
      g,
      [
        { x: 1, z: 1 },
        { x: 2, z: 1 },
        { x: 3, z: 1 },
      ],
      true,
    );
    expect(changed).toHaveLength(3);
    expect(powerLineCount(g)).toBe(3);
    expect(lineAt(g, 2, 1)).toBe(true);
  });

  it('charges nothing for dragging back over a run already strung', () => {
    const g = createGrid(SIZE);
    const tiles = [
      { x: 1, z: 1 },
      { x: 2, z: 1 },
    ];
    expect(stringPowerLine(g, tiles, true)).toHaveLength(2);
    // The second pass changes nothing, so the caller has nothing to bill for.
    expect(stringPowerLine(g, tiles, true)).toHaveLength(0);
    expect(powerLineCount(g)).toBe(2);
  });

  it('pulls a line down and reports what came down', () => {
    const g = createGrid(SIZE);
    stringPowerLine(g, [{ x: 4, z: 4 }], true);
    expect(stringPowerLine(g, [{ x: 4, z: 4 }], false)).toHaveLength(1);
    expect(lineAt(g, 4, 4)).toBe(false);
    // And pulling down empty ground is likewise no change at all.
    expect(stringPowerLine(g, [{ x: 4, z: 4 }], false)).toHaveLength(0);
  });

  it('shares its ground with a road — the wire is on poles, not in the surface', () => {
    const g = createGrid(SIZE);
    g.roadTier[idx(2, 2)] = RoadTier.TwoLane;
    expect(canStringLine(g, 2, 2)).toBe(true);
    expect(stringPowerLine(g, [{ x: 2, z: 2 }], true)).toHaveLength(1);
    // …and the road is untouched by it.
    expect(g.roadTier[idx(2, 2)]).toBe(RoadTier.TwoLane);
  });

  it('will not cross open water, which needs a structure it does not have', () => {
    const g = createGrid(SIZE);
    g.water[idx(3, 3)] = 1;
    expect(canStringLine(g, 3, 3)).toBe(false);
    expect(stringPowerLine(g, [{ x: 3, z: 3 }], true)).toHaveLength(0);
  });

  it('will not stand on a building, whose ground is already taken', () => {
    const g = createGrid(SIZE);
    g.buildingId[idx(5, 5)] = 42;
    expect(canStringLine(g, 5, 5)).toBe(false);
    expect(stringPowerLine(g, [{ x: 5, z: 5 }], true)).toHaveLength(0);
  });

  it('ignores tiles off the map rather than throwing', () => {
    const g = createGrid(SIZE);
    expect(
      stringPowerLine(
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

  it('lists its tiles row-major, which is the order the renderer walks', () => {
    const g = createGrid(SIZE);
    stringPowerLine(
      g,
      [
        { x: 5, z: 2 },
        { x: 1, z: 1 },
        { x: 3, z: 2 },
      ],
      true,
    );
    expect(powerLineTiles(g)).toEqual([
      { x: 1, z: 1 },
      { x: 3, z: 2 },
      { x: 5, z: 2 },
    ]);
  });
});
