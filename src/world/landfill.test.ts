import { describe, expect, it } from 'vitest';
import { RoadTier } from '../shared/types';
import {
  canLandfill,
  hasUndersizedArea,
  landfillAreas,
  landfillAt,
  landfillPlacementMask,
  landfillTileCount,
  landfillTiles,
  landfillTruckDepots,
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
    zone: new Uint8Array(n),
    height: new Float32Array(n),
  };
}

const idx = (size: number, x: number, z: number): number => z * size + x;

/** A straight two-lane run along z = `z`, x0..x1 — the frontage the paint gate marches from. */
function roadRow(g: LandfillGridSource, z: number, x0: number, x1: number): void {
  for (let x = x0; x <= x1; x++) g.roadTier[idx(g.size, x, z)] = RoadTier.TwoLane;
}

/** isStreet callback over the fixture's own roadTier layer. */
const streetOf =
  (g: LandfillGridSource) =>
  (x: number, z: number): boolean =>
    x >= 0 && z >= 0 && x < g.size && z < g.size && g.roadTier[idx(g.size, x, z)] !== 0;

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

describe('landfillPlacementMask', () => {
  it('marks exactly the zonable road-frontage band (depth-limited), not roadless land', () => {
    const g = makeGrid(10);
    roadRow(g, 0, 0, 9);
    const mask = landfillPlacementMask(g);

    expect(mask[idx(10, 3, 1)]).toBe(1); // right off the frontage
    expect(mask[idx(10, 3, 4)]).toBe(1); // deepest frontage cell
    expect(mask[idx(10, 3, 5)]).toBe(0); // beyond frontage depth
    expect(mask[idx(10, 3, 0)]).toBe(0); // the road tile itself
    expect(mask[idx(10, 3, 9)]).toBe(0); // far roadless land
  });

  it('gives no frontage from a rail line (not a street)', () => {
    const g = makeGrid(8);
    for (let x = 0; x < 8; x++) g.roadTier[idx(8, x, 0)] = RoadTier.RailTrack;
    const mask = landfillPlacementMask(g);
    expect(Array.from(mask).every((v) => v === 0)).toBe(true);
  });
});

describe('paintLandfill', () => {
  it('paints only road-frontage tiles, skips blocked and roadless ones, reports applied', () => {
    const g = makeGrid(10);
    roadRow(g, 0, 0, 9);
    g.water[idx(10, 2, 1)] = 1;
    const applied = paintLandfill(
      g,
      [
        { x: 2, z: 1 }, // water — skipped
        { x: 3, z: 0 }, // road tile — skipped
        { x: 3, z: 1 }, // frontage — ok
        { x: 3, z: 2 }, // frontage — ok
        { x: 3, z: 8 }, // empty land with NO road frontage — skipped
      ],
      true,
    );
    expect(applied).toEqual([
      { x: 3, z: 1 },
      { x: 3, z: 2 },
    ]);
    expect(landfillAt(g, 3, 1)).toBe(true);
    expect(landfillAt(g, 3, 2)).toBe(true);
    expect(landfillAt(g, 2, 1)).toBe(false);
    expect(landfillAt(g, 3, 8)).toBe(false);
  });

  it('erases ungated — any in-bounds tile clears back to non-landfill', () => {
    const g = makeGrid(8);
    roadRow(g, 0, 0, 7);
    paintLandfill(
      g,
      [
        { x: 2, z: 1 },
        { x: 3, z: 1 },
      ],
      true,
    );
    expect(landfillTileCount(g)).toBe(2);
    const erased = paintLandfill(g, [{ x: 2, z: 1 }], false);
    expect(erased).toEqual([{ x: 2, z: 1 }]);
    expect(landfillAt(g, 2, 1)).toBe(false);
    expect(landfillAt(g, 3, 1)).toBe(true);
    expect(landfillTileCount(g)).toBe(1);
  });

  it('drops out-of-bounds tiles from the applied list', () => {
    const g = makeGrid(6);
    roadRow(g, 0, 0, 5);
    const applied = paintLandfill(
      g,
      [
        { x: 1, z: 1 },
        { x: 9, z: 9 },
      ],
      true,
    );
    expect(applied).toEqual([{ x: 1, z: 1 }]);
  });
});

describe('landfillTiles / landfillTileCount', () => {
  it('returns every membership tile in row-major order', () => {
    const g = makeGrid(5);
    g.landfill[idx(5, 1, 1)] = 1;
    g.landfill[idx(5, 3, 1)] = 1;
    g.landfill[idx(5, 2, 3)] = 1;
    expect(landfillTiles(g)).toEqual([
      { x: 1, z: 1 },
      { x: 3, z: 1 },
      { x: 2, z: 3 },
    ]);
    expect(landfillTileCount(g)).toBe(3);
  });
});

describe('landfillAreas', () => {
  it('splits disjoint patches into separate areas in row-major order', () => {
    const g = makeGrid(12);
    g.landfill[idx(12, 1, 1)] = 1;
    g.landfill[idx(12, 2, 1)] = 1;
    g.landfill[idx(12, 8, 6)] = 1;
    const areas = landfillAreas(12, g.landfill, () => false);
    expect(areas).toHaveLength(2);
    expect(areas[0]!.tiles).toContainEqual({ x: 1, z: 1 });
    expect(areas[0]!.tiles).toContainEqual({ x: 2, z: 1 });
    expect(areas[1]!.tiles).toEqual([{ x: 8, z: 6 }]);
  });

  it('picks the smallest-index street-adjacent tile as the office, with its street tile', () => {
    const g = makeGrid(10);
    roadRow(g, 0, 0, 9);
    // 2x2 block at (1..2, 1..2): the z=1 row touches the road, (1,1) is smallest.
    for (const [x, z] of [
      [1, 1],
      [2, 1],
      [1, 2],
      [2, 2],
    ] as const) {
      g.landfill[idx(10, x, z)] = 1;
    }
    const [area] = landfillAreas(10, g.landfill, streetOf(g));
    expect(area!.office).toEqual({ x: 1, z: 1 });
    expect(area!.roadTile).toEqual({ x: 1, z: 0 });
  });

  it('falls back to the smallest-index tile (roadTile null) when nothing touches a street', () => {
    const g = makeGrid(10);
    g.landfill[idx(10, 4, 4)] = 1;
    g.landfill[idx(10, 5, 4)] = 1;
    const [area] = landfillAreas(10, g.landfill, () => false);
    expect(area!.office).toEqual({ x: 4, z: 4 });
    expect(area!.roadTile).toBeNull();
  });

  it('routes the dump path from the office to the deepest member through adjacent members', () => {
    const g = makeGrid(10);
    roadRow(g, 0, 0, 9);
    for (const [x, z] of [
      [1, 1],
      [2, 1],
      [1, 2],
      [2, 2],
    ] as const) {
      g.landfill[idx(10, x, z)] = 1;
    }
    const [area] = landfillAreas(10, g.landfill, streetOf(g));
    expect(area!.dumpPath).toEqual([
      { x: 1, z: 1 },
      { x: 2, z: 1 },
      { x: 2, z: 2 },
    ]);
    // Every step is 4-adjacent and inside the area.
    for (let i = 1; i < area!.dumpPath.length; i++) {
      const a = area!.dumpPath[i - 1]!;
      const b = area!.dumpPath[i]!;
      expect(Math.abs(a.x - b.x) + Math.abs(a.z - b.z)).toBe(1);
      expect(area!.tiles).toContainEqual(b);
    }
  });

  it('gives a single-tile area a one-tile dump path (the office itself)', () => {
    const g = makeGrid(6);
    g.landfill[idx(6, 3, 3)] = 1;
    const [area] = landfillAreas(6, g.landfill, () => false);
    expect(area!.dumpPath).toEqual([{ x: 3, z: 3 }]);
  });

  it('flags a lone fragment smaller than the minimum (hasUndersizedArea)', () => {
    const g = makeGrid(10);
    g.landfill[idx(10, 2, 2)] = 1;
    expect(hasUndersizedArea(10, g.landfill, [{ x: 2, z: 2 }], 4)).toBe(true);
  });

  it('passes a painted block meeting the minimum', () => {
    const g = makeGrid(10);
    const block = [
      { x: 2, z: 2 },
      { x: 3, z: 2 },
      { x: 2, z: 3 },
      { x: 3, z: 3 },
    ];
    for (const t of block) g.landfill[idx(10, t.x, t.z)] = 1;
    expect(hasUndersizedArea(10, g.landfill, block, 4)).toBe(false);
  });

  it('allows a small expansion of an existing large-enough area', () => {
    const g = makeGrid(10);
    for (const [x, z] of [
      [2, 2],
      [3, 2],
      [2, 3],
      [3, 3],
      [4, 2],
    ] as const) {
      g.landfill[idx(10, x, z)] = 1;
    }
    // Only (4,2) was painted this batch; it merged into the 2x2 -> area of 5.
    expect(hasUndersizedArea(10, g.landfill, [{ x: 4, z: 2 }], 4)).toBe(false);
  });

  it('ignores pre-existing small fragments the batch never touched', () => {
    const g = makeGrid(12);
    g.landfill[idx(12, 9, 9)] = 1; // old lone fragment
    const block = [
      { x: 2, z: 2 },
      { x: 3, z: 2 },
      { x: 2, z: 3 },
      { x: 3, z: 3 },
    ];
    for (const t of block) g.landfill[idx(12, t.x, t.z)] = 1;
    expect(hasUndersizedArea(12, g.landfill, block, 4)).toBe(false);
  });

  it('builds a truck depot per operable area, staged on its street tile', () => {
    const g = makeGrid(14);
    roadRow(g, 0, 0, 13);
    for (let z = 1; z <= 4; z++) {
      for (let x = 1; x <= 4; x++) g.landfill[idx(14, x, z)] = 1;
    }
    const areas = landfillAreas(14, g.landfill, streetOf(g));
    const [depot] = landfillTruckDepots(areas, 4, 1, 16, 4);
    expect(depot!.index).toBe(0);
    expect(depot!.sourceTile).toEqual({ x: 1, z: 0 }); // the office's street tile
    expect(depot!.budget).toBe(2); // 1 base + floor(16/16)
    expect(depot!.dumpPath[0]).toEqual(areas[0]!.office);
    expect(depot!.dumpPath.length).toBeGreaterThan(1); // actually drives in
  });

  it('caps the truck budget and skips areas that cannot operate', () => {
    const g = makeGrid(20);
    roadRow(g, 0, 0, 19);
    for (let z = 1; z <= 4; z++) {
      for (let x = 1; x <= 18; x++) g.landfill[idx(20, x, z)] = 1; // 72 tiles
    }
    g.landfill[idx(20, 10, 10)] = 1; // lone roadless fragment
    const depots = landfillTruckDepots(landfillAreas(20, g.landfill, streetOf(g)), 4, 1, 16, 4);
    expect(depots).toHaveLength(1); // the fragment is undersized AND roadless
    expect(depots[0]!.budget).toBe(4); // capped (1 + 72/16 would be 5)
  });

  it('is deterministic — identical inputs give identical areas', () => {
    const g = makeGrid(14);
    roadRow(g, 3, 0, 13);
    for (let z = 4; z <= 6; z++) {
      for (let x = 2; x <= 6; x++) g.landfill[idx(14, x, z)] = 1;
    }
    g.landfill[idx(14, 10, 1)] = 1;
    const run = (): unknown => landfillAreas(14, g.landfill, streetOf(g));
    expect(run()).toEqual(run());
  });
});
