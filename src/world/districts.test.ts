import { describe, expect, it } from 'vitest';
import { districtAt, districtTiles, paintDistrict, type DistrictGridSource } from './districts';

function makeGrid(size: number): DistrictGridSource {
  return { size, district: new Uint8Array(size * size) };
}

describe('paintDistrict', () => {
  it('stamps districtId onto every requested tile and returns them all', () => {
    const g = makeGrid(8);
    const tiles = [
      { x: 1, z: 1 },
      { x: 2, z: 1 },
      { x: 1, z: 2 },
    ];
    const applied = paintDistrict(g, 3, tiles);

    expect(applied).toEqual(tiles);
    for (const t of tiles) expect(districtAt(g, t.x, t.z)).toBe(3);
  });

  it('skips out-of-bounds tiles but still applies the in-bounds ones', () => {
    const g = makeGrid(4);
    const tiles = [
      { x: 1, z: 1 },
      { x: -1, z: 0 },
      { x: 0, z: 4 }, // z === size is out of bounds
      { x: 2, z: 2 },
    ];
    const applied = paintDistrict(g, 5, tiles);

    expect(applied).toEqual([
      { x: 1, z: 1 },
      { x: 2, z: 2 },
    ]);
    expect(districtAt(g, 1, 1)).toBe(5);
    expect(districtAt(g, 2, 2)).toBe(5);
  });

  it('erasing with districtId 0 clears a previously painted tile back to unassigned', () => {
    const g = makeGrid(4);
    paintDistrict(g, 7, [{ x: 1, z: 1 }]);
    expect(districtAt(g, 1, 1)).toBe(7);

    paintDistrict(g, 0, [{ x: 1, z: 1 }]);
    expect(districtAt(g, 1, 1)).toBe(0);
  });

  it('overwrites (last write wins) rather than accumulating when painted again with a different id', () => {
    const g = makeGrid(4);
    paintDistrict(g, 1, [{ x: 2, z: 2 }]);
    paintDistrict(g, 2, [{ x: 2, z: 2 }]);
    expect(districtAt(g, 2, 2)).toBe(2);
  });

  it('an empty tiles array applies nothing and returns an empty array', () => {
    const g = makeGrid(4);
    expect(paintDistrict(g, 1, [])).toEqual([]);
  });
});

describe('districtAt', () => {
  it('returns 0 for an unassigned tile', () => {
    const g = makeGrid(4);
    expect(districtAt(g, 0, 0)).toBe(0);
  });

  it('returns 0 for an out-of-bounds tile (negative or >= size)', () => {
    const g = makeGrid(4);
    expect(districtAt(g, -1, 0)).toBe(0);
    expect(districtAt(g, 0, 4)).toBe(0);
    expect(districtAt(g, 4, 4)).toBe(0);
  });
});

describe('districtTiles', () => {
  it('enumerates exactly the tiles carrying the given id, excluding tiles of other ids', () => {
    const g = makeGrid(4);
    paintDistrict(g, 1, [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
    ]);
    paintDistrict(g, 2, [{ x: 2, z: 0 }]);

    expect(districtTiles(g, 1)).toEqual([
      { x: 0, z: 0 },
      { x: 1, z: 0 },
    ]);
    expect(districtTiles(g, 2)).toEqual([{ x: 2, z: 0 }]);
  });

  it('returns an empty array for an id nothing is painted with', () => {
    const g = makeGrid(4);
    expect(districtTiles(g, 9)).toEqual([]);
  });

  it('districtId 0 enumerates every currently-unassigned tile', () => {
    const g = makeGrid(2); // 4 tiles, all start unassigned (0)
    expect(districtTiles(g, 0)).toEqual([
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 0, z: 1 },
      { x: 1, z: 1 },
    ]);
    paintDistrict(g, 1, [{ x: 0, z: 0 }]);
    expect(districtTiles(g, 0)).toEqual([
      { x: 1, z: 0 },
      { x: 0, z: 1 },
      { x: 1, z: 1 },
    ]);
  });
});

describe('undo/redo pattern (mirrors world/grid.ts setZones + worker.entry.ts paintZone inverse building)', () => {
  it('capturing previous district ids before a paint, then re-painting by previous-id groups, restores the original layout exactly', () => {
    const g = makeGrid(4);
    // Seed: district 1 on the left column, district 2 on one tile, rest unassigned.
    paintDistrict(g, 1, [
      { x: 0, z: 0 },
      { x: 0, z: 1 },
    ]);
    paintDistrict(g, 2, [{ x: 1, z: 1 }]);

    const requested = [
      { x: 0, z: 0 }, // was 1
      { x: 0, z: 1 }, // was 1
      { x: 1, z: 1 }, // was 2
      { x: 2, z: 2 }, // was 0 (unassigned)
    ];

    // Snapshot "before" state the way worker.entry.ts would, prior to mutating.
    const prevByTile = new Map<string, number>();
    for (const t of requested) prevByTile.set(`${t.x},${t.z}`, districtAt(g, t.x, t.z));

    const applied = paintDistrict(g, 5, requested);
    expect(applied).toEqual(requested);
    for (const t of requested) expect(districtAt(g, t.x, t.z)).toBe(5);

    // Build the inverse: group applied tiles by their previous id.
    const byPrev = new Map<number, { x: number; z: number }[]>();
    for (const t of applied) {
      const prev = prevByTile.get(`${t.x},${t.z}`) ?? 0;
      const list = byPrev.get(prev) ?? [];
      list.push(t);
      byPrev.set(prev, list);
    }

    // Replay the inverse groups (undo).
    for (const [prevId, groupTiles] of byPrev) {
      paintDistrict(g, prevId, groupTiles);
    }

    expect(districtAt(g, 0, 0)).toBe(1);
    expect(districtAt(g, 0, 1)).toBe(1);
    expect(districtAt(g, 1, 1)).toBe(2);
    expect(districtAt(g, 2, 2)).toBe(0);
  });
});
