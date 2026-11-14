import { describe, expect, it } from 'vitest';
import { LENS_MEANING, LENS_RAMP_STOPS, lensRampColor, type LensMeaning } from './lenses';
import { FIELD_COUNT, FieldId, type LensId } from './types';

const MEANINGS: readonly LensMeaning[] = ['worse', 'better'];

const ALL_LENS_IDS: readonly LensId[] = [
  ...Object.values(FieldId),
  'power',
  'watered',
  'sewered',
  'transit',
  'districts',
  'trash',
  'soil',
];

/** Relative luminance of an sRGB colour, 0..1. */
function luminance([r, g, b]: readonly [number, number, number]): number {
  const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** True when the colour is a clear red: strong red, weak green and blue. */
const isRed = ([r, g, b]: readonly [number, number, number]): boolean =>
  r > 0.6 && g < 0.35 && b < 0.35;

describe('lens meanings', () => {
  it('declares a meaning for every lens id', () => {
    expect(Object.values(FieldId)).toHaveLength(FIELD_COUNT);
    for (const id of ALL_LENS_IDS) {
      expect(Object.prototype.hasOwnProperty.call(LENS_MEANING, id), `lens ${id}`).toBe(true);
    }
    expect(Object.keys(LENS_MEANING)).toHaveLength(ALL_LENS_IDS.length);
  });

  it('classifies every field lens as worse or better', () => {
    for (const id of Object.values(FieldId)) {
      expect(MEANINGS, `field ${id}`).toContain(LENS_MEANING[id]);
    }
  });

  it('reads the good-when-high lenses as better and the bad-when-high ones as worse', () => {
    expect(LENS_MEANING[FieldId.Happiness]).toBe('better');
    expect(LENS_MEANING[FieldId.Education]).toBe('better');
    expect(LENS_MEANING[FieldId.Health]).toBe('better');
    expect(LENS_MEANING[FieldId.Pollution]).toBe('worse');
    expect(LENS_MEANING[FieldId.Crime]).toBe('worse');
    expect(LENS_MEANING.trash).toBe('worse');
  });
});

describe('lens ramps', () => {
  it('paints the top of a worse lens red and the top of a better lens not red', () => {
    expect(isRed(lensRampColor('worse', 255))).toBe(true);
    expect(isRed(lensRampColor('better', 255))).toBe(false);
  });

  it('keeps red off a better lens at every value', () => {
    for (let v = 0; v <= 255; v += 5) {
      expect(isRed(lensRampColor('better', v)), `better ${v}`).toBe(false);
    }
  });

  it('darkens each ramp from its low end to its high end', () => {
    for (const meaning of MEANINGS) {
      let previous = Infinity;
      for (let v = 0; v <= 255; v += 5) {
        const l = luminance(lensRampColor(meaning, v));
        expect(l, `${meaning} ${v}`).toBeLessThanOrEqual(previous + 1e-9);
        previous = l;
      }
      expect(luminance(lensRampColor(meaning, 0))).toBeGreaterThan(
        luminance(lensRampColor(meaning, 255)) + 0.1,
      );
    }
  });

  it('returns the first and last stop at the ends and clamps beyond them', () => {
    for (const meaning of MEANINGS) {
      const stops = LENS_RAMP_STOPS[meaning];
      expect(lensRampColor(meaning, 0)).toEqual([...stops[0]![1]]);
      expect(lensRampColor(meaning, 255)).toEqual([...stops[stops.length - 1]![1]]);
      expect(lensRampColor(meaning, -40)).toEqual(lensRampColor(meaning, 0));
      expect(lensRampColor(meaning, 900)).toEqual(lensRampColor(meaning, 255));
    }
  });
});
