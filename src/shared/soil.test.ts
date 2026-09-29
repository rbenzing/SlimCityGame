import { describe, expect, it } from 'vitest';
import { MAX_BUILD_SLOPE, SAND_BAND_METERS, SEA_LEVEL, TILE_METERS } from './constants';
import {
  FERTILE_MAX_SLOPE,
  PRIME_MAX_SLOPE,
  SoilGrade,
  isFarmable,
  isStony,
  regradeSoil,
  soilGradeAt,
  soilGrades,
  type SoilSource,
} from './soil';

const SIZE = 16;
const SEED = 1234;

/** A plain of dry land at one height. */
function plain(height = 10): SoilSource {
  return {
    size: SIZE,
    height: new Float32Array(SIZE * SIZE).fill(height),
    water: new Uint8Array(SIZE * SIZE),
  };
}

/** The first tile of the map, scanning row-major, that the stony patches miss or hit. */
function tileWhere(stony: boolean): { x: number; z: number } {
  for (let z = 2; z < SIZE - 2; z++) {
    for (let x = 2; x < SIZE - 2; x++) if (isStony(SEED, x, z) === stony) return { x, z };
  }
  throw new Error(`no ${stony ? 'stony' : 'deep-soiled'} tile on the test map`);
}

/** Raises the tile east of (x, z) by `rise` metres, giving (x, z) that slope. */
function withStep(src: SoilSource, x: number, z: number, rise: number): SoilSource {
  src.height[z * SIZE + x + 1] = src.height[z * SIZE + x]! + rise;
  return src;
}

describe('the soil a tile has', () => {
  const deep = tileWhere(false);

  it('is very fertile on level ground', () => {
    expect(soilGradeAt(plain(), SEED, deep.x, deep.z)).toBe(SoilGrade.Prime);
  });

  it.each([
    ['very fertile up to a 6% slope', PRIME_MAX_SLOPE, SoilGrade.Prime],
    ['fertile just past it', PRIME_MAX_SLOPE + 0.001, SoilGrade.Fertile],
    ['fertile up to 12%', FERTILE_MAX_SLOPE, SoilGrade.Fertile],
    ['somewhat fertile just past it', FERTILE_MAX_SLOPE + 0.001, SoilGrade.Marginal],
    [
      'somewhat fertile up to the steepest ground anything is built on',
      MAX_BUILD_SLOPE / TILE_METERS,
      SoilGrade.Marginal,
    ],
    [
      'unfit beyond it, where the ground turns to rock',
      MAX_BUILD_SLOPE / TILE_METERS + 0.001,
      SoilGrade.Unfit,
    ],
  ])('is %s', (_label, slope, grade) => {
    const src = withStep(plain(), deep.x, deep.z, slope * TILE_METERS);
    expect(soilGradeAt(src, SEED, deep.x, deep.z)).toBe(grade);
  });

  it('reads a slope from whichever side falls away, not only one', () => {
    const src = plain();
    src.height[(deep.z - 1) * SIZE + deep.x] = 10 - FERTILE_MAX_SLOPE * TILE_METERS - 0.5;
    expect(soilGradeAt(src, SEED, deep.x, deep.z)).toBe(SoilGrade.Marginal);
  });

  it('is unfit on the beach, the band the ground draws as sand', () => {
    expect(soilGradeAt(plain(SEA_LEVEL + SAND_BAND_METERS - 0.01), SEED, deep.x, deep.z)).toBe(
      SoilGrade.Unfit,
    );
    expect(soilGradeAt(plain(SEA_LEVEL + SAND_BAND_METERS), SEED, deep.x, deep.z)).toBe(
      SoilGrade.Prime,
    );
  });

  it('is unfit under water and at the water’s edge, but not a tile further back', () => {
    const src = plain();
    src.water[deep.z * SIZE + deep.x + 1] = 1;
    expect(soilGradeAt(src, SEED, deep.x + 1, deep.z)).toBe(SoilGrade.Unfit);
    expect(soilGradeAt(src, SEED, deep.x, deep.z)).toBe(SoilGrade.Unfit);
    const further = { ...src, water: new Uint8Array(SIZE * SIZE) };
    further.water[deep.z * SIZE + deep.x + 2] = 1;
    expect(soilGradeAt(further, SEED, deep.x, deep.z)).toBe(SoilGrade.Prime);
  });

  it('is somewhat fertile at best on stony ground, however level', () => {
    const stony = tileWhere(true);
    expect(soilGradeAt(plain(), SEED, stony.x, stony.z)).toBe(SoilGrade.Marginal);
    const steep = withStep(plain(), stony.x, stony.z, MAX_BUILD_SLOPE + 1);
    expect(soilGradeAt(steep, SEED, stony.x, stony.z)).toBe(SoilGrade.Unfit);
  });

  it('is unfit off the map', () => {
    expect(soilGradeAt(plain(), SEED, -1, 0)).toBe(SoilGrade.Unfit);
    expect(soilGradeAt(plain(), SEED, 0, SIZE)).toBe(SoilGrade.Unfit);
  });
});

describe('stony ground', () => {
  it('lies in patches across about one tile in six, on any map', () => {
    for (const seed of [1, 42, 1234567, 0xdeadbeef]) {
      let stony = 0;
      for (let z = 0; z < 256; z++) for (let x = 0; x < 256; x++) if (isStony(seed, x, z)) stony++;
      const share = stony / (256 * 256);
      expect(share).toBeGreaterThan(0.1);
      expect(share).toBeLessThan(0.25);
    }
  });

  it('lies in patches, not scattered: most stony tiles have a stony neighbour', () => {
    let stony = 0;
    let clustered = 0;
    for (let z = 1; z < 255; z++) {
      for (let x = 1; x < 255; x++) {
        if (!isStony(SEED, x, z)) continue;
        stony++;
        if (isStony(SEED, x + 1, z) || isStony(SEED, x - 1, z)) clustered++;
      }
    }
    expect(clustered / stony).toBeGreaterThan(0.8);
  });

  it('is the same for the same seed and different for another', () => {
    const pattern = (seed: number): string => {
      let s = '';
      for (let x = 0; x < 64; x++) s += isStony(seed, x, 7) ? '1' : '0';
      return s;
    };
    expect(pattern(SEED)).toBe(pattern(SEED));
    expect(pattern(SEED)).not.toBe(pattern(SEED + 1));
  });
});

describe('soilGrades', () => {
  it('grades every tile exactly as soilGradeAt does', () => {
    const src = withStep(plain(), 5, 5, 3);
    src.water[3] = 1;
    const grades = soilGrades(src, SEED);
    for (let z = 0; z < SIZE; z++) {
      for (let x = 0; x < SIZE; x++) {
        expect(grades[z * SIZE + x]).toBe(soilGradeAt(src, SEED, x, z));
      }
    }
  });

  it('fills the array it is given when it is the right size', () => {
    const out = new Uint8Array(SIZE * SIZE);
    expect(soilGrades(plain(), SEED, out)).toBe(out);
  });
});

describe('regradeSoil', () => {
  it('leaves the soil exactly as a full grading would after a height change', () => {
    const src = { ...plain(), soil: new Uint8Array(SIZE * SIZE) };
    soilGrades(src, SEED, src.soil);
    // A 2×2 mound: its own tiles and the ring around it change grade.
    for (const [x, z] of [
      [6, 6],
      [7, 6],
      [6, 7],
      [7, 7],
    ] as const) {
      src.height[z * SIZE + x] = 13;
    }
    regradeSoil(src, SEED, 6, 6, 2, 2);
    expect(Array.from(src.soil)).toEqual(Array.from(soilGrades(src, SEED)));
  });
});

it('farms only somewhat fertile ground or better', () => {
  expect(isFarmable(SoilGrade.Unfit)).toBe(false);
  expect(isFarmable(SoilGrade.Marginal)).toBe(true);
  expect(isFarmable(SoilGrade.Prime)).toBe(true);
});
