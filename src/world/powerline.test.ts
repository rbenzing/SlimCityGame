import { describe, expect, it } from 'vitest';
import { createGrid } from './grid';
import { POWER_LINE_REFUSALS } from '../shared/placement';
import {
  alongStreetRefusal,
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

  describe('alongStreetRefusal', () => {
    // Mask bits: east and west.
    const E = 2;
    const W = 8;
    const sealed = (tier: number): boolean => tier !== RoadTier.Gravel;
    /** An east-west street along row 3 from x = 0 to x = 7. */
    const streetGrid = (tier: number = RoadTier.TwoLane) => {
      const g = createGrid(SIZE);
      for (let x = 0; x < SIZE; x++) {
        g.roadTier[idx(x, 3)] = tier;
        g.roadMask[idx(x, 3)] = (x > 0 ? W : 0) | (x < SIZE - 1 ? E : 0);
      }
      return g;
    };
    const along = [1, 2, 3].map((x) => ({ x, z: 3 }));
    const across = [1, 2, 3, 4, 5].map((z) => ({ x: 4, z }));

    it('refuses two new tiles in a row along a sealed street, with its own sentence', () => {
      expect(alongStreetRefusal(streetGrid(), along, sealed)).toBe(POWER_LINE_REFUSALS.alongStreet);
    });

    it('allows a run that crosses the street at right angles', () => {
      expect(alongStreetRefusal(streetGrid(), across, sealed)).toBeNull();
    });

    it('allows a single tile on the street', () => {
      expect(alongStreetRefusal(streetGrid(), [{ x: 2, z: 3 }], sealed)).toBeNull();
    });

    it('allows a run along a street that carries no power of its own', () => {
      expect(alongStreetRefusal(streetGrid(RoadTier.Gravel), along, sealed)).toBeNull();
    });

    it('allows a run along a railway, which is not a street', () => {
      expect(alongStreetRefusal(streetGrid(RoadTier.RailTrack), along, sealed)).toBeNull();
    });

    it('leaves a line already strung along the street alone', () => {
      const g = streetGrid();
      stringPowerLine(g, along, true);
      expect(alongStreetRefusal(g, along, sealed)).toBeNull();
    });

    it('refuses a run on the street that turns off it after one tile too many', () => {
      const bend = [
        { x: 4, z: 1 },
        { x: 4, z: 2 },
        { x: 4, z: 3 },
        { x: 5, z: 3 },
      ];
      expect(alongStreetRefusal(streetGrid(), bend, sealed)).toBe(POWER_LINE_REFUSALS.alongStreet);
    });

    it('reads a road beside the run as no street the run is on', () => {
      const g = createGrid(SIZE);
      // A street one row over, running the same way: the run lies beside it, not on it.
      for (let x = 0; x < SIZE; x++) {
        g.roadTier[idx(x, 4)] = RoadTier.TwoLane;
        g.roadMask[idx(x, 4)] = E | W;
      }
      expect(alongStreetRefusal(g, along, sealed)).toBeNull();
    });
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
