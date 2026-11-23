import { describe, expect, it } from 'vitest';
import { TILE_METERS } from './constants';
import {
  deriveWaterBodies,
  sampleWater,
  WaterKind,
  WIND_TOWARD,
  type WaterBodies,
} from './waterbodies';

const SIZE = 96;

type Rect = readonly [x0: number, z0: number, x1: number, z1: number];

function mask(rects: readonly Rect[], size = SIZE): Uint8Array {
  const water = new Uint8Array(size * size);
  for (const [x0, z0, x1, z1] of rects) {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) water[z * size + x] = 1;
  }
  return water;
}

const flat = (): number => 0;
const at = (b: WaterBodies, x: number, z: number): number => z * b.size + x;

describe('deriveWaterBodies kinds', () => {
  it('calls open water on the map edge an ocean', () => {
    const b = deriveWaterBodies(mask([[0, 0, 30, SIZE - 1]]), SIZE, flat);
    expect(b.kind[at(b, 10, 40)]).toBe(WaterKind.Ocean);
    expect(b.kind[at(b, 60, 40)]).toBe(WaterKind.None);
  });

  it('calls enclosed open water a lake', () => {
    const b = deriveWaterBodies(mask([[30, 30, 59, 59]]), SIZE, flat);
    expect(b.kind[at(b, 45, 45)]).toBe(WaterKind.Lake);
    expect(b.kind[at(b, 31, 31)]).toBe(WaterKind.Lake);
  });

  it('calls a small pond a lake', () => {
    const b = deriveWaterBodies(mask([[40, 40, 44, 44]]), SIZE, flat);
    expect(b.kind[at(b, 42, 42)]).toBe(WaterKind.Lake);
  });

  it('calls a long narrow channel from a lake to the sea a river that flows to the sea', () => {
    // Sea on the west edge, lake in the east, a 3-wide channel of 40 tiles between.
    const b = deriveWaterBodies(
      mask([
        [0, 0, 15, SIZE - 1],
        [56, 30, 85, 59],
        [16, 44, 55, 46],
      ]),
      SIZE,
      flat,
    );
    expect(b.kind[at(b, 36, 45)]).toBe(WaterKind.River);
    expect(b.flowX[at(b, 36, 45)]!).toBeLessThan(0);
    expect(Math.abs(b.flowZ[at(b, 36, 45)]!)).toBeLessThan(0.05);
    // Fastest in the middle row, slower toward the banks.
    const mid = Math.hypot(b.flowX[at(b, 36, 45)]!, b.flowZ[at(b, 36, 45)]!);
    const side = Math.hypot(b.flowX[at(b, 36, 44)]!, b.flowZ[at(b, 36, 44)]!);
    expect(mid).toBeGreaterThan(side);
    expect(mid).toBeCloseTo(0.8, 1);
    expect(side).toBeGreaterThan(0);
  });

  it('does not call a short neck between lakes a river', () => {
    const b = deriveWaterBodies(
      mask([
        [10, 30, 39, 59],
        [50, 30, 79, 59],
        [40, 44, 49, 46],
      ]),
      SIZE,
      flat,
    );
    expect(b.kind[at(b, 45, 45)]).toBe(WaterKind.Lake);
    expect(b.flowX[at(b, 45, 45)]).toBe(0);
  });

  it('does not call a fat bay on the sea a river: it is under 400 m across its longest line', () => {
    // 9 wide and 13 long: 20 steps corner to corner along the tiles, but 316 m straight.
    const b = deriveWaterBodies(
      mask([
        [0, 0, 15, SIZE - 1],
        [16, 40, 24, 52],
      ]),
      SIZE,
      flat,
    );
    expect(b.kind[at(b, 20, 46)]).toBe(WaterKind.Ocean);
    expect(b.flowX[at(b, 20, 46)]).toBe(0);
  });

  it('still calls a diagonal channel a river by its straight length', () => {
    const water = new Uint8Array(SIZE * SIZE);
    for (let i = 0; i < 24; i++) {
      for (const d of [0, 1, 2]) water[(40 + i) * SIZE + (10 + i + d)] = 1;
    }
    for (let z = 0; z < SIZE; z++) for (let x = 0; x < 10; x++) water[z * SIZE + x] = 1;
    const b = deriveWaterBodies(water, SIZE, flat);
    expect(b.kind[at(b, 24, 53)]).toBe(WaterKind.River);
  });

  it('flows a channel between two lakes to the larger one', () => {
    // Small lake in the west, large lake in the east; the channel runs to the east.
    const b = deriveWaterBodies(
      mask([
        [2, 38, 21, 57],
        [66, 20, 93, 75],
        [22, 47, 65, 49],
      ]),
      SIZE,
      flat,
    );
    expect(b.kind[at(b, 44, 48)]).toBe(WaterKind.River);
    expect(b.flowX[at(b, 44, 48)]!).toBeGreaterThan(0);
  });

  it('flows an edge-to-edge channel toward the lower banks', () => {
    const water = mask([[0, 45, SIZE - 1, 47]]);
    const low = (tx: number): number => (tx < SIZE / 2 ? 0 : 10);
    const b = deriveWaterBodies(water, SIZE, (tx) => low(tx));
    expect(b.kind[at(b, 48, 46)]).toBe(WaterKind.River);
    expect(b.flowX[at(b, 48, 46)]!).toBeLessThan(0);
    const flipped = deriveWaterBodies(water, SIZE, (tx) => 10 - low(tx));
    expect(flipped.flowX[at(flipped, 48, 46)]!).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    const water = mask([
      [0, 0, 15, SIZE - 1],
      [16, 44, 55, 46],
    ]);
    const a = deriveWaterBodies(water, SIZE, flat);
    const b = deriveWaterBodies(water, SIZE, flat);
    expect(Array.from(a.kind)).toEqual(Array.from(b.kind));
    expect(Array.from(a.fetchM)).toEqual(Array.from(b.fetchM));
  });
});

describe('deriveWaterBodies fetch', () => {
  it('is larger on the downwind shore than the upwind one', () => {
    const b = deriveWaterBodies(mask([[20, 20, 69, 69]]), SIZE, flat);
    expect(WIND_TOWARD.x).toBeGreaterThan(0);
    const downwind = b.fetchM[at(b, 68, 45)]!;
    const upwind = b.fetchM[at(b, 21, 45)]!;
    expect(downwind).toBeGreaterThan(upwind * 5);
  });

  it('gives a one-wide canal along the wind far less fetch than its length', () => {
    const b = deriveWaterBodies(mask([[10, 50, 80, 50]]), SIZE, flat);
    const lengthM = 70 * TILE_METERS;
    expect(b.fetchM[at(b, 70, 50)]!).toBeLessThan(lengthM / 4);
  });

  it('counts the open sea where an ocean tile faces the map edge upwind', () => {
    const b = deriveWaterBodies(mask([[0, 0, 40, SIZE - 1]]), SIZE, flat);
    expect(b.fetchM[at(b, 5, 48)]!).toBeGreaterThan(10000);
  });
});

describe('deriveWaterBodies swell', () => {
  it('is 1 on open ocean and 0 on a lake', () => {
    const b = deriveWaterBodies(
      mask([
        [0, 0, 60, SIZE - 1],
        [70, 20, 90, 40],
      ]),
      SIZE,
      flat,
    );
    const open = at(b, 30, 48);
    expect(Math.hypot(b.swellX[open]!, b.swellZ[open]!)).toBeCloseTo(1, 5);
    expect(b.swellX[open]!).toBeGreaterThan(0);
    expect(b.swellX[at(b, 80, 30)]).toBe(0);
    expect(b.swellZ[at(b, 80, 30)]).toBe(0);
  });

  it('is 0 behind a headland', () => {
    // Ocean along the west edge with a land block jutting in the middle of it.
    const water = mask([[0, 0, 70, SIZE - 1]]);
    for (let z = 20; z <= 75; z++) for (let x = 10; x <= 25; x++) water[z * SIZE + x] = 0;
    const b = deriveWaterBodies(water, SIZE, flat);
    const shelter = at(b, 40, 48);
    expect(b.kind[shelter]).toBe(WaterKind.Ocean);
    expect(Math.hypot(b.swellX[shelter]!, b.swellZ[shelter]!)).toBe(0);
    expect(Math.hypot(b.swellX[at(b, 40, 5)]!, b.swellZ[at(b, 40, 5)]!)).toBeCloseTo(1, 5);
  });
});

describe('sampleWater', () => {
  it('reads a tile centre exactly and blends between centres', () => {
    const b = deriveWaterBodies(mask([[20, 20, 69, 69]]), SIZE, flat);
    const i = at(b, 40, 40);
    const centre = sampleWater(b, 40.5 * TILE_METERS, 40.5 * TILE_METERS);
    expect(centre.fetchM).toBeCloseTo(b.fetchM[i]!, 3);
    const mid = sampleWater(b, 41 * TILE_METERS, 40.5 * TILE_METERS);
    expect(mid.fetchM).toBeCloseTo((b.fetchM[i]! + b.fetchM[i + 1]!) / 2, 3);
  });
});
