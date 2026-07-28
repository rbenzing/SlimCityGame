import { describe, expect, it } from 'vitest';
import { MAP_SIZE, MAX_BUILD_SLOPE, ROAD_MAX_SLOPE } from '../shared/constants';
import { FIELD_COUNT, RoadTier, SAVE_VERSION, ZoneType, type GridState } from '../shared/types';
import {
  canPlaceFootprint,
  clearTiles,
  createGrid,
  deserializeGrid,
  isBuildable,
  isRoadBuildable,
  serializeGrid,
  setZones,
} from './grid';

describe('createGrid', () => {
  it('defaults to MAP_SIZE and allocates every layer at the right length', () => {
    const g = createGrid();
    const n = MAP_SIZE * MAP_SIZE;
    expect(g.size).toBe(MAP_SIZE);
    expect(g.height.length).toBe(n);
    expect(g.water.length).toBe(n);
    expect(g.trees.length).toBe(n);
    expect(g.zone.length).toBe(n);
    expect(g.roadTier.length).toBe(n);
    expect(g.roadMask.length).toBe(n);
    expect(g.buildingId.length).toBe(n);
    expect(g.power.length).toBe(n);
    expect(g.watered.length).toBe(n);
    expect(g.district.length).toBe(n);
    expect(g.district).toBeInstanceOf(Uint8Array);
    expect(g.fields.length).toBe(FIELD_COUNT);
    for (const layer of g.fields) {
      expect(layer.length).toBe(n);
      expect(layer).toBeInstanceOf(Uint8Array);
    }
    expect(g.height).toBeInstanceOf(Float32Array);
    expect(g.buildingId).toBeInstanceOf(Uint32Array);
    expect(g.water).toBeInstanceOf(Uint8Array);
  });

  it('accepts a custom size', () => {
    const g = createGrid(9);
    expect(g.size).toBe(9);
    expect(g.height.length).toBe(81);
    expect(g.fields.length).toBe(FIELD_COUNT);
    expect(g.fields[0]?.length).toBe(81);
  });

  it('zero-initializes every layer', () => {
    const g = createGrid(4);
    expect(g.height.every((v) => v === 0)).toBe(true);
    expect(g.water.every((v) => v === 0)).toBe(true);
    expect(g.buildingId.every((v) => v === 0)).toBe(true);
    expect(g.district.every((v) => v === 0)).toBe(true);
    for (const layer of g.fields) {
      expect(layer.every((v) => v === 0)).toBe(true);
    }
  });
});

function fillDeterministic(g: GridState): void {
  const n = g.size * g.size;
  for (let i = 0; i < n; i++) {
    g.height[i] = (i % 37) - 8.5;
    g.water[i] = i % 5 === 0 ? 1 : 0;
    g.trees[i] = (i * 3) % 256;
    g.zone[i] = i % 6;
    g.roadTier[i] = i % 4;
    g.roadMask[i] = i % 16;
    g.buildingId[i] = i % 9 === 0 ? 0 : 1_000_000_000 + i;
    g.power[i] = i % 2;
    g.watered[i] = (i + 1) % 2;
    g.district[i] = (i * 7) % 256;
    for (let f = 0; f < g.fields.length; f++) {
      const layer = g.fields[f];
      if (layer) layer[i] = (i + f * 13) % 256;
    }
  }
}

describe('serializeGrid / deserializeGrid', () => {
  it('round-trips every layer exactly for a non-multiple-of-four size', () => {
    const size = 5; // 25 tiles: n is NOT a multiple of 4, stresses byte alignment
    const g = createGrid(size);
    fillDeterministic(g);

    const buf = serializeGrid(g);
    const back = deserializeGrid(buf);

    expect(back.size).toBe(size);
    expect(Array.from(back.height)).toEqual(Array.from(g.height));
    expect(Array.from(back.water)).toEqual(Array.from(g.water));
    expect(Array.from(back.trees)).toEqual(Array.from(g.trees));
    expect(Array.from(back.zone)).toEqual(Array.from(g.zone));
    expect(Array.from(back.roadTier)).toEqual(Array.from(g.roadTier));
    expect(Array.from(back.roadMask)).toEqual(Array.from(g.roadMask));
    expect(Array.from(back.buildingId)).toEqual(Array.from(g.buildingId));
    expect(Array.from(back.power)).toEqual(Array.from(g.power));
    expect(Array.from(back.watered)).toEqual(Array.from(g.watered));
    expect(Array.from(back.district)).toEqual(Array.from(g.district));
    expect(back.fields.length).toBe(g.fields.length);
    for (let f = 0; f < g.fields.length; f++) {
      expect(Array.from(back.fields[f]!)).toEqual(Array.from(g.fields[f]!));
    }
  });

  it('round-trips the default MAP_SIZE grid', () => {
    const g = createGrid();
    g.height[0] = -7.5;
    g.height[g.height.length - 1] = 39.25;
    g.buildingId[100] = 4_000_000_000; // beyond Int32 range, valid Uint32
    const buf = serializeGrid(g);
    const back = deserializeGrid(buf);
    expect(back.size).toBe(MAP_SIZE);
    expect(back.height[0]).toBeCloseTo(-7.5, 5);
    expect(back.height[back.height.length - 1]).toBeCloseTo(39.25, 5);
    expect(back.buildingId[100]).toBe(4_000_000_000);
  });

  it('produces memory independent from the source grid', () => {
    const g = createGrid(3);
    g.height[0] = 5;
    const buf = serializeGrid(g);
    g.height[0] = 999; // mutate after serializing
    const back = deserializeGrid(buf);
    expect(back.height[0]).toBe(5); // unaffected by the later mutation
  });

  it('rejects a buffer with an unsupported save version', () => {
    const g = createGrid(2);
    const buf = serializeGrid(g);
    const view = new DataView(buf);
    view.setUint32(0, SAVE_VERSION + 1, true);
    expect(() => deserializeGrid(buf)).toThrow();
  });

  it('migrates a v1 buffer (no district layer) — loads with district all-zero, other layers intact', () => {
    // Build a v2 grid, serialize it, then synthesize the equivalent v1 buffer
    // by (a) stamping the version to 1 and (b) truncating the trailing district
    // layer (n bytes). deserializeGrid must accept it and default district to 0.
    const size = 5;
    const n = size * size;
    const g = createGrid(size);
    fillDeterministic(g);
    const v2 = serializeGrid(g);

    const v1 = v2.slice(0, v2.byteLength - n); // drop the trailing district bytes
    new DataView(v1).setUint32(0, 1, true); // stamp version 1

    const back = deserializeGrid(v1);
    expect(back.size).toBe(size);
    expect(back.district.length).toBe(n);
    expect(back.district.every((v) => v === 0)).toBe(true); // defaulted
    // Every pre-district layer still round-trips.
    expect(Array.from(back.height)).toEqual(Array.from(g.height));
    expect(Array.from(back.zone)).toEqual(Array.from(g.zone));
    expect(Array.from(back.buildingId)).toEqual(Array.from(g.buildingId));
    expect(Array.from(back.watered)).toEqual(Array.from(g.watered));
    for (let f = 0; f < g.fields.length; f++) {
      expect(Array.from(back.fields[f]!)).toEqual(Array.from(g.fields[f]!));
    }
  });

  it('rejects a buffer whose length does not match its declared size', () => {
    const g = createGrid(2);
    const buf = serializeGrid(g);
    const truncated = buf.slice(0, buf.byteLength - 1);
    expect(() => deserializeGrid(truncated)).toThrow();
  });
});

describe('isBuildable', () => {
  it('rejects out-of-bounds coordinates', () => {
    const g = createGrid(5);
    expect(isBuildable(g, -1, 0)).toBe(false);
    expect(isBuildable(g, 0, -1)).toBe(false);
    expect(isBuildable(g, 5, 0)).toBe(false);
    expect(isBuildable(g, 0, 5)).toBe(false);
  });

  it('rejects water tiles', () => {
    const g = createGrid(5);
    g.water[2 * 5 + 2] = 1;
    expect(isBuildable(g, 2, 2)).toBe(false);
  });

  it('accepts flat terrain', () => {
    const g = createGrid(5);
    g.height.fill(10);
    expect(isBuildable(g, 2, 2)).toBe(true);
    expect(isBuildable(g, 0, 0)).toBe(true); // corner, fewer neighbors
  });

  it('rejects a tile whose slope to a neighbor exceeds MAX_BUILD_SLOPE', () => {
    const g = createGrid(5);
    g.height.fill(10);
    const idx = (x: number, z: number) => z * 5 + x;
    g.height[idx(3, 2)] = 10 + MAX_BUILD_SLOPE + 1;
    expect(isBuildable(g, 2, 2)).toBe(false); // its E neighbor is too steep
    expect(isBuildable(g, 3, 2)).toBe(false); // symmetric, its W neighbor is too steep
  });

  it('accepts a slope exactly at MAX_BUILD_SLOPE (inclusive boundary)', () => {
    const g = createGrid(5);
    g.height.fill(10);
    const idx = (x: number, z: number) => z * 5 + x;
    g.height[idx(2, 1)] = 10 + MAX_BUILD_SLOPE;
    expect(isBuildable(g, 1, 1)).toBe(true);
    expect(isBuildable(g, 2, 1)).toBe(true);
  });
});

describe('isRoadBuildable (UI-SPEC §6.20 road-on-slope placement)', () => {
  const idx = (x: number, z: number) => z * 5 + x;

  it('rejects out-of-bounds coordinates', () => {
    const g = createGrid(5);
    expect(isRoadBuildable(g, -1, 0)).toBe(false);
    expect(isRoadBuildable(g, 0, -1)).toBe(false);
    expect(isRoadBuildable(g, 5, 0)).toBe(false);
    expect(isRoadBuildable(g, 0, 5)).toBe(false);
  });

  it('rejects water tiles', () => {
    const g = createGrid(5);
    g.water[idx(2, 2)] = 1;
    expect(isRoadBuildable(g, 2, 2)).toBe(false);
  });

  it('accepts flat terrain', () => {
    const g = createGrid(5);
    g.height.fill(10);
    expect(isRoadBuildable(g, 2, 2)).toBe(true);
    expect(isRoadBuildable(g, 0, 0)).toBe(true); // corner, fewer neighbors
  });

  it('accepts a moderate slope (6-8m/tile) that MAX_BUILD_SLOPE (buildings) would reject', () => {
    const g = createGrid(5);
    g.height.fill(10);
    g.height[idx(3, 2)] = 10 + 7; // 7m delta: > MAX_BUILD_SLOPE(4), < ROAD_MAX_SLOPE(10)
    // Buildings/zoning are unaffected: still bound by MAX_BUILD_SLOPE.
    expect(isBuildable(g, 2, 2)).toBe(false);
    expect(isBuildable(g, 3, 2)).toBe(false);
    // Roads tolerate the steeper grade.
    expect(isRoadBuildable(g, 2, 2)).toBe(true);
    expect(isRoadBuildable(g, 3, 2)).toBe(true);
  });

  it('accepts a slope exactly at ROAD_MAX_SLOPE (inclusive boundary)', () => {
    const g = createGrid(5);
    g.height.fill(10);
    g.height[idx(2, 1)] = 10 + ROAD_MAX_SLOPE;
    expect(isRoadBuildable(g, 1, 1)).toBe(true);
    expect(isRoadBuildable(g, 2, 1)).toBe(true);
  });

  it('rejects a tile whose slope to a neighbor exceeds ROAD_MAX_SLOPE', () => {
    const g = createGrid(5);
    g.height.fill(10);
    g.height[idx(3, 2)] = 10 + ROAD_MAX_SLOPE + 1;
    expect(isRoadBuildable(g, 2, 2)).toBe(false); // its E neighbor is too steep
    expect(isRoadBuildable(g, 3, 2)).toBe(false); // symmetric, its W neighbor is too steep
  });
});

describe('canPlaceFootprint', () => {
  const idx = (x: number, z: number, size = 6) => z * size + x;

  it('accepts a clear flat footprint', () => {
    const g = createGrid(6);
    g.height.fill(10);
    expect(canPlaceFootprint(g, 1, 1, 2, 2)).toBe(true);
  });

  it('rejects zero or negative dimensions', () => {
    const g = createGrid(6);
    g.height.fill(10);
    expect(canPlaceFootprint(g, 1, 1, 0, 2)).toBe(false);
    expect(canPlaceFootprint(g, 1, 1, 2, 0)).toBe(false);
    expect(canPlaceFootprint(g, 1, 1, -1, 2)).toBe(false);
  });

  it('rejects if any tile is water', () => {
    const g = createGrid(6);
    g.height.fill(10);
    g.water[idx(2, 2)] = 1;
    expect(canPlaceFootprint(g, 1, 1, 2, 2)).toBe(false);
  });

  it('rejects if any tile already has a road', () => {
    const g = createGrid(6);
    g.height.fill(10);
    g.roadTier[idx(2, 1)] = RoadTier.TwoLane;
    expect(canPlaceFootprint(g, 1, 1, 2, 2)).toBe(false);
  });

  it('rejects if any tile already has a building', () => {
    const g = createGrid(6);
    g.height.fill(10);
    g.buildingId[idx(1, 2)] = 7;
    expect(canPlaceFootprint(g, 1, 1, 2, 2)).toBe(false);
  });

  it('ignores zone entirely', () => {
    const g = createGrid(6);
    g.height.fill(10);
    g.zone[idx(1, 1)] = ZoneType.Industrial;
    g.zone[idx(2, 2)] = ZoneType.ComHigh;
    expect(canPlaceFootprint(g, 1, 1, 2, 2)).toBe(true);
  });

  it('rejects a footprint that runs off the edge of the grid', () => {
    const g = createGrid(6);
    g.height.fill(10);
    expect(canPlaceFootprint(g, 5, 5, 2, 2)).toBe(false);
  });
});

describe('setZones', () => {
  const idx = (x: number, z: number, size = 6) => z * size + x;

  // Lays a 4-tile straight TwoLane road run along z=0 (x=0..3). Per the
  // standard perpendicular-frontage model (world/zonable.ts) a straight run's frontage is
  // its two non-connected sides — here N and S — so every tile at z=1..4
  // directly south of x=0..3 falls inside the road's frontage and is
  // isZonable. Tests below rely on this to give (1,1)/(2,1) frontage.
  function layFrontageRoad(g: GridState): void {
    for (let x = 0; x <= 3; x++) {
      g.roadTier[idx(x, 0)] = RoadTier.TwoLane;
    }
  }

  it('applies zone to every valid tile and returns them', () => {
    const g = createGrid(6);
    g.height.fill(10);
    layFrontageRoad(g); // frontage requirement: tiles need road frontage to be paintable
    const tiles = [
      { x: 1, z: 1 },
      { x: 2, z: 1 },
    ];
    const applied = setZones(g, tiles, ZoneType.ResLow);
    expect(applied).toEqual(tiles);
    expect(g.zone[idx(1, 1)]).toBe(ZoneType.ResLow);
    expect(g.zone[idx(2, 1)]).toBe(ZoneType.ResLow);
  });

  it('refuses a buildable, road-free tile with no road frontage', () => {
    // No roads anywhere: the tile is buildable and road/building-free, but
    // isZonable has nothing to grant it frontage, so it must be rejected.
    const g = createGrid(6);
    g.height.fill(10);
    const applied = setZones(g, [{ x: 1, z: 1 }], ZoneType.ResLow);
    expect(applied).toEqual([]);
    expect(g.zone[idx(1, 1)]).toBe(ZoneType.None);
  });

  it('skips tiles with a road', () => {
    const g = createGrid(6);
    g.height.fill(10);
    g.roadTier[idx(1, 1)] = RoadTier.TwoLane;
    const applied = setZones(g, [{ x: 1, z: 1 }], ZoneType.ComLow);
    expect(applied).toEqual([]);
    expect(g.zone[idx(1, 1)]).toBe(ZoneType.None);
  });

  it('skips tiles with a building when zoning (non-None)', () => {
    const g = createGrid(6);
    g.height.fill(10);
    g.buildingId[idx(1, 1)] = 3;
    const applied = setZones(g, [{ x: 1, z: 1 }], ZoneType.ResHigh);
    expect(applied).toEqual([]);
    expect(g.zone[idx(1, 1)]).toBe(ZoneType.None);
  });

  it('allows de-zoning (None) a tile that has a building', () => {
    // No road laid: de-zoning is exempt from the frontage requirement, so
    // this must still succeed on an unreachable tile (you can always remove
    // a zone).
    const g = createGrid(6);
    g.height.fill(10);
    g.buildingId[idx(1, 1)] = 3;
    g.zone[idx(1, 1)] = ZoneType.ResLow;
    const applied = setZones(g, [{ x: 1, z: 1 }], ZoneType.None);
    expect(applied).toEqual([{ x: 1, z: 1 }]);
    expect(g.zone[idx(1, 1)]).toBe(ZoneType.None);
  });

  it('skips water tiles', () => {
    const g = createGrid(6);
    g.height.fill(10);
    g.water[idx(1, 1)] = 1;
    const applied = setZones(g, [{ x: 1, z: 1 }], ZoneType.Industrial);
    expect(applied).toEqual([]);
  });

  it('skips out-of-bounds tiles without throwing', () => {
    const g = createGrid(6);
    g.height.fill(10);
    expect(() => setZones(g, [{ x: 99, z: 99 }], ZoneType.ResLow)).not.toThrow();
    expect(setZones(g, [{ x: 99, z: 99 }], ZoneType.ResLow)).toEqual([]);
  });
});

describe('clearTiles', () => {
  const idx = (x: number, z: number, size = 6) => z * size + x;

  it('zeroes zone and trees on the requested tiles', () => {
    const g = createGrid(6);
    g.zone[idx(1, 1)] = ZoneType.ResLow;
    g.trees[idx(1, 1)] = 200;
    clearTiles(g, [{ x: 1, z: 1 }]);
    expect(g.zone[idx(1, 1)]).toBe(0);
    expect(g.trees[idx(1, 1)]).toBe(0);
  });

  it('collects and clears road tiles', () => {
    const g = createGrid(6);
    g.roadTier[idx(1, 1)] = RoadTier.Avenue;
    g.roadMask[idx(1, 1)] = 0b1010;
    const result = clearTiles(g, [{ x: 1, z: 1 }]);
    expect(result.clearedRoads).toEqual([{ x: 1, z: 1 }]);
    expect(g.roadTier[idx(1, 1)]).toBe(RoadTier.None);
    expect(g.roadMask[idx(1, 1)]).toBe(0);
  });

  it('does not report tiles with no road', () => {
    const g = createGrid(6);
    const result = clearTiles(g, [{ x: 1, z: 1 }]);
    expect(result.clearedRoads).toEqual([]);
  });

  it('collects unique building ids and clears every tile carrying them across the whole grid', () => {
    const g = createGrid(6);
    g.buildingId[idx(1, 1)] = 42;
    g.buildingId[idx(2, 1)] = 42; // same building, second footprint tile
    g.buildingId[idx(4, 4)] = 42; // even far away, same id must clear too
    g.buildingId[idx(0, 0)] = 7; // a different building, must survive

    const result = clearTiles(g, [{ x: 1, z: 1 }]); // bulldoze only ONE tile of building 42

    expect(result.buildingIds).toEqual([42]);
    expect(g.buildingId[idx(1, 1)]).toBe(0);
    expect(g.buildingId[idx(2, 1)]).toBe(0);
    expect(g.buildingId[idx(4, 4)]).toBe(0);
    expect(g.buildingId[idx(0, 0)]).toBe(7); // untouched
  });

  it('returns sorted unique building ids for multiple buildings', () => {
    const g = createGrid(6);
    g.buildingId[idx(0, 0)] = 30;
    g.buildingId[idx(1, 0)] = 10;
    g.buildingId[idx(2, 0)] = 20;
    const result = clearTiles(g, [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 2, z: 0 },
    ]);
    expect(result.buildingIds).toEqual([10, 20, 30]);
  });

  it('ignores out-of-bounds tiles without throwing', () => {
    const g = createGrid(6);
    expect(() =>
      clearTiles(g, [
        { x: -1, z: 0 },
        { x: 99, z: 99 },
      ]),
    ).not.toThrow();
  });
});
