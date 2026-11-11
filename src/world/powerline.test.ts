import { describe, expect, it } from 'vitest';
import { createGrid } from './grid';
import { POWER_LINE_REFUSALS } from '../shared/placement';
import {
  alongStreetRefusal,
  canStringLine,
  feedsLines,
  lineAt,
  powerLineCount,
  powerLineTiles,
  restoreLineCommands,
  sourceEndRefusal,
  stringPowerLine,
} from './powerline';
import { PowerLineKind, RoadTier } from '../shared/types';

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

describe('a line starts at a source', () => {
  const row = (x0: number, x1: number, z: number) =>
    Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, z }));
  const noSource = (): boolean => false;

  it('refuses a run that touches no source and no line, with the sentence', () => {
    const g = createGrid(SIZE);
    expect(sourceEndRefusal(g, row(1, 4, 3), noSource)).toBe(POWER_LINE_REFUSALS.mustStartAtSource);
  });

  it('accepts a run whose end touches a source tile', () => {
    const g = createGrid(SIZE);
    const source = (x: number, z: number): boolean => x === 0 && z === 3;
    expect(sourceEndRefusal(g, row(1, 4, 3), source)).toBeNull();
  });

  it('accepts a run that joins a line already standing, of either kind', () => {
    for (const kind of [PowerLineKind.Held, PowerLineKind.Strung]) {
      const g = createGrid(SIZE);
      g.powerLine[idx(0, 3)] = kind;
      expect(sourceEndRefusal(g, row(1, 4, 3), noSource)).toBeNull();
    }
  });

  it('asks every stretch of a run for its own source', () => {
    const g = createGrid(SIZE);
    g.powerLine[idx(3, 3)] = PowerLineKind.Strung;
    // The run's two new stretches are 1..2 (touching the line at 3) and 4..6 (also touching it): live.
    expect(sourceEndRefusal(g, row(1, 6, 3), noSource)).toBeNull();
    // Far from it, the same run is dead.
    expect(sourceEndRefusal(g, row(1, 6, 6), noSource)).toBe(POWER_LINE_REFUSALS.mustStartAtSource);
  });

  it('strings the kind it is asked for, and keeps the kind a tile already holds', () => {
    const g = createGrid(SIZE);
    g.powerLine[idx(2, 1)] = PowerLineKind.Held;
    stringPowerLine(g, row(1, 3, 1), true);
    expect(Array.from(g.powerLine.slice(idx(1, 1), idx(4, 1)))).toEqual([2, 1, 2]);
    stringPowerLine(g, row(1, 1, 5), true, PowerLineKind.Held);
    expect(g.powerLine[idx(1, 5)]).toBe(1);
  });

  it('puts old and new tiles back each to its own kind', () => {
    const tiles = row(1, 4, 2);
    const commands = restoreLineCommands(tiles, [1, 2, 2, 1]);
    expect(commands).toEqual([
      { kind: 'stringPowerLine', tiles: [tiles[0], tiles[3]], on: true, lineKind: 1 },
      { kind: 'stringPowerLine', tiles: [tiles[1], tiles[2]], on: true, lineKind: 2 },
    ]);
  });

  it('knows a generator and a substation feed lines, and a house does not', () => {
    expect(feedsLines({ utility: { powerMW: 10 } })).toBe(true);
    expect(feedsLines({ utility: { substation: true } })).toBe(true);
    expect(feedsLines({ utility: { waterKL: 10 } })).toBe(false);
    expect(feedsLines({})).toBe(false);
    expect(feedsLines(undefined)).toBe(false);
  });
});

describe('a buried cable', () => {
  const row = (x0: number, x1: number, z: number) =>
    Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, z }));
  const noSource = (): boolean => false;
  const tierColumn = [
    RoadTier.Gravel,
    RoadTier.TwoLane,
    RoadTier.Highway,
    RoadTier.Ramp,
    RoadTier.RailTrack,
  ];

  it('lies under every road tier, which a line shares its ground with too', () => {
    for (const tier of tierColumn) {
      const g = createGrid(SIZE);
      g.roadTier[idx(2, 2)] = tier;
      expect(stringPowerLine(g, [{ x: 2, z: 2 }], true, PowerLineKind.Cable)).toHaveLength(1);
      expect(g.powerLine[idx(2, 2)]).toBe(PowerLineKind.Cable);
      expect(g.roadTier[idx(2, 2)]).toBe(tier);
    }
  });

  it('will not go under water or a building', () => {
    const g = createGrid(SIZE);
    g.water[idx(3, 3)] = 1;
    g.buildingId[idx(5, 5)] = 42;
    const both = [
      { x: 3, z: 3 },
      { x: 5, z: 5 },
    ];
    expect(stringPowerLine(g, both, true, PowerLineKind.Cable)).toHaveLength(0);
    expect(powerLineCount(g)).toBe(0);
  });

  it('takes the tile a line held and gives it back: one byte a tile, never both', () => {
    const g = createGrid(SIZE);
    const tiles = row(1, 3, 1);
    stringPowerLine(g, tiles, true);
    expect(stringPowerLine(g, tiles, true, PowerLineKind.Cable)).toHaveLength(3);
    expect(Array.from(g.powerLine.slice(idx(1, 1), idx(4, 1)))).toEqual([3, 3, 3]);
    // A cable laid again changes nothing; a plain line replaces a cable.
    expect(stringPowerLine(g, tiles, true, PowerLineKind.Cable)).toHaveLength(0);
    expect(stringPowerLine(g, tiles, true)).toHaveLength(3);
    expect(Array.from(g.powerLine.slice(idx(1, 1), idx(4, 1)))).toEqual([2, 2, 2]);
    // A line already held keeps its own byte under a plain line.
    g.powerLine[idx(1, 1)] = PowerLineKind.Held;
    expect(stringPowerLine(g, tiles, true)).toHaveLength(0);
  });

  it('puts a mixed run back tile by tile, bare ground pulled down and the cable marked a restore', () => {
    const tiles = row(1, 4, 2);
    expect(restoreLineCommands(tiles, [0, 1, 2, 3])).toEqual([
      { kind: 'stringPowerLine', tiles: [tiles[0]], on: false },
      { kind: 'stringPowerLine', tiles: [tiles[1]], on: true, lineKind: 1 },
      { kind: 'stringPowerLine', tiles: [tiles[2]], on: true, lineKind: 2 },
      { kind: 'stringPowerLine', tiles: [tiles[3]], on: true, lineKind: 3, restore: true },
    ]);
  });

  it('says its own sentence for a run that would not be live, with cable where the line says line', () => {
    const g = createGrid(SIZE);
    const refusal = sourceEndRefusal(g, row(1, 4, 3), noSource, PowerLineKind.Cable);
    expect(refusal).toBe(POWER_LINE_REFUSALS.cableMustStartAtSource);
    expect(refusal).toBe(
      'A cable must start at a power station, a substation or a live line or cable.',
    );
    expect(POWER_LINE_REFUSALS.mustStartAtSource).toBe(
      'A line must start at a power station, a substation or a live line.',
    );
  });

  it('is live from a source, a line or a cable, and needs none under a sealed street', () => {
    const source = (x: number, z: number): boolean => x === 0 && z === 3;
    const g = createGrid(SIZE);
    expect(sourceEndRefusal(g, row(1, 4, 3), source, PowerLineKind.Cable)).toBeNull();
    for (const kind of [PowerLineKind.Strung, PowerLineKind.Cable]) {
      const h = createGrid(SIZE);
      h.powerLine[idx(0, 3)] = kind;
      expect(sourceEndRefusal(h, row(1, 4, 3), noSource, PowerLineKind.Cable)).toBeNull();
    }
    const underStreet = (_x: number, z: number): boolean => z === 5;
    expect(
      sourceEndRefusal(g, row(1, 4, 5), noSource, PowerLineKind.Cable, underStreet),
    ).toBeNull();
    // A stretch beyond the street's end is not fed by the street cable it adjoins.
    expect(
      sourceEndRefusal(
        g,
        [...row(1, 4, 5), ...row(4, 6, 4)],
        noSource,
        PowerLineKind.Cable,
        underStreet,
      ),
    ).toBe(POWER_LINE_REFUSALS.cableMustStartAtSource);
  });
});
