import { describe, expect, it } from 'vitest';
import {
  canLandfill,
  landfillAt,
  landfillTileCount,
  landfillTiles,
  paintLandfill,
  type LandfillGridSource,
} from './landfill';

/** A tiny hand-built grid slice — mirrors districts.test.ts's narrow-source pattern. */
function makeGrid(size: number): LandfillGridSource {
  const n = size * size;
  return {
    size,
    landfill: new Uint8Array(n),
    water: new Uint8Array(n),
    roadTier: new Uint8Array(n),
    buildingId: new Uint32Array(n),
  };
}

const idx = (size: number, x: number, z: number): number => z * size + x;

describe('canLandfill', () => {
  it('allows empty in-bounds land; rejects water, road, building, and out-of-bounds', () => {
    const g = makeGrid(6);
    expect(canLandfill(g, 2, 2)).toBe(true);

    g.water[idx(6, 1, 1)] = 1;
    g.roadTier[idx(6, 3, 3)] = 2;
    g.buildingId[idx(6, 4, 4)] = 99;
    expect(canLandfill(g, 1, 1)).toBe(false); // water
    expect(canLandfill(g, 3, 3)).toBe(false); // road
    expect(canLandfill(g, 4, 4)).toBe(false); // building
    expect(canLandfill(g, -1, 0)).toBe(false); // out of bounds
    expect(canLandfill(g, 6, 0)).toBe(false);
  });
});

describe('paintLandfill', () => {
  it('paints eligible tiles, skips ineligible ones, and reports only applied tiles', () => {
    const g = makeGrid(6);
    g.water[idx(6, 0, 0)] = 1;
    g.roadTier[idx(6, 1, 0)] = 1;
    const applied = paintLandfill(
      g,
      [
        { x: 0, z: 0 }, // water — skipped
        { x: 1, z: 0 }, // road — skipped
        { x: 2, z: 0 }, // ok
        { x: 3, z: 0 }, // ok
      ],
      true,
    );
    expect(applied).toEqual([
      { x: 2, z: 0 },
      { x: 3, z: 0 },
    ]);
    expect(landfillAt(g, 2, 0)).toBe(true);
    expect(landfillAt(g, 3, 0)).toBe(true);
    expect(landfillAt(g, 0, 0)).toBe(false);
    expect(landfillAt(g, 1, 0)).toBe(false);
  });

  it('erases ungated — any in-bounds tile clears back to non-landfill', () => {
    const g = makeGrid(6);
    paintLandfill(g, [{ x: 2, z: 2 }, { x: 3, z: 2 }], true);
    expect(landfillTileCount(g)).toBe(2);
    const erased = paintLandfill(g, [{ x: 2, z: 2 }], false);
    expect(erased).toEqual([{ x: 2, z: 2 }]);
    expect(landfillAt(g, 2, 2)).toBe(false);
    expect(landfillAt(g, 3, 2)).toBe(true);
    expect(landfillTileCount(g)).toBe(1);
  });

  it('drops out-of-bounds tiles from the applied list', () => {
    const g = makeGrid(4);
    const applied = paintLandfill(g, [{ x: 1, z: 1 }, { x: 9, z: 9 }], true);
    expect(applied).toEqual([{ x: 1, z: 1 }]);
  });
});

describe('landfillTiles / landfillTileCount', () => {
  it('returns every membership tile in row-major order', () => {
    const g = makeGrid(5);
    paintLandfill(g, [{ x: 3, z: 1 }, { x: 1, z: 1 }, { x: 2, z: 3 }], true);
    expect(landfillTiles(g)).toEqual([
      { x: 1, z: 1 },
      { x: 3, z: 1 },
      { x: 2, z: 3 },
    ]);
    expect(landfillTileCount(g)).toBe(3);
  });
});
