import { describe, expect, it } from 'vitest';
import { LENS_MEANING, lensRampColor } from '../shared/lenses';
import { FieldId, type LensId } from '../shared/types';
import { lensLegend } from './lensLegend';

const NO_CONTEXT = { transitLines: [], districts: [] };

const css = ([r, g, b]: readonly [number, number, number]): string =>
  `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;

describe('lensLegend ramps', () => {
  const rampLenses: LensId[] = [
    FieldId.Pollution, // worse
    FieldId.Happiness, // better
    'trash', // worse
    FieldId.LandValue, // better
  ];

  it('paints each lens the colours the map paints for the same values', () => {
    for (const lens of rampLenses) {
      const legend = lensLegend(lens, NO_CONTEXT);
      expect(legend?.kind, `lens ${lens}`).toBe('ramp');
      if (legend?.kind !== 'ramp') continue;
      const meaning = LENS_MEANING[lens]!;
      for (const stop of legend.stops) {
        expect(stop.color).toBe(css(lensRampColor(meaning, (stop.at / 100) * 255)));
      }
    }
  });

  it('gives a good lens and a bad lens different ramps, and keeps each lens’s words', () => {
    const bad = lensLegend(FieldId.Pollution, NO_CONTEXT);
    const good = lensLegend(FieldId.Happiness, NO_CONTEXT);
    if (bad?.kind !== 'ramp' || good?.kind !== 'ramp') throw new Error('expected ramps');
    expect(bad.stops.at(-1)?.color).not.toBe(good.stops.at(-1)?.color);
    expect([bad.low, bad.high]).toEqual(['Clean', 'Heavy']);
    expect([good.low, good.high]).toEqual(['Unhappy', 'Happy']);
  });

  it('leaves coverage lenses as named categories', () => {
    expect(lensLegend('power', NO_CONTEXT)?.kind).toBe('categories');
    expect(lensLegend('soil', NO_CONTEXT)?.kind).toBe('categories');
  });
});
