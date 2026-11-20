import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  BODY_BAND,
  GROUND_BAND,
  bandProblem,
  decodePng,
  lightRatio,
  noonProblem,
  sample,
  toLight,
} from '../../tools/shots/lib/nightread.mjs';

/** A PNG of 8-bit RGB with the given rows of pixels, each row filtered with `filter`. */
function png(rows: number[][][], filter = 0): Buffer {
  const width = rows[0]!.length;
  const raw: number[] = [];
  rows.forEach((row, y) => {
    raw.push(filter);
    row.forEach((px, x) =>
      px.forEach((v, c) => {
        const left = x > 0 ? row[x - 1]![c]! : 0;
        const up = y > 0 ? rows[y - 1]![x]![c]! : 0;
        raw.push(filter === 1 ? (v - left) & 0xff : filter === 2 ? (v - up) & 0xff : v);
      }),
    );
  });
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');
    return Buffer.concat([head, data, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(rows.length, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.alloc(8),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from(raw))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const grey = (v: number) => ({ r: v, g: v, b: v });

describe('reading a frame back', () => {
  const rows = [
    [
      [10, 20, 30],
      [40, 50, 60],
    ],
    [
      [70, 80, 90],
      [100, 110, 120],
    ],
  ];

  it.each([0, 1, 2])('decodes a PNG filtered with type %i to the pixels written', (filter) => {
    const image = decodePng(png(rows, filter));
    expect([image.width, image.height]).toEqual([2, 2]);
    expect(image.at(0, 0)).toEqual([10, 20, 30]);
    expect(image.at(1, 1)).toEqual([100, 110, 120]);
  });

  it('refuses a PNG it cannot read rather than reading it wrong', () => {
    const interlaced = png(rows);
    interlaced[8 + 8 + 12] = 1;
    expect(() => decodePng(interlaced)).toThrow('interlaced');
  });

  it('samples the mean colour and the brightest channel of a box', () => {
    const s = sample(decodePng(png(rows)), { x: 0, y: 0, w: 2, h: 2 });
    expect(s.r).toBeCloseTo(55);
    expect(s.g).toBeCloseTo(65);
    expect(s.b).toBeCloseTo(75);
    expect(s.max).toBe(120);
  });
});

describe('light ratio', () => {
  it('is 1 for a surface that did not change, and falls with the light', () => {
    expect(lightRatio(grey(120), grey(120))).toBeCloseTo(1, 6);
    expect(lightRatio(grey(60), grey(120))).toBeLessThan(lightRatio(grey(90), grey(120)));
  });

  it('undoes the tone-mapping toe: one share of light reads lower on a darker surface', () => {
    // The display value that keeps a fifth of noon's light, as a share of the noon value.
    const pixelShare = (noon: number) => {
      const lit = toLight(grey(noon)).r;
      let lo = 0;
      let hi = 255;
      while (hi - lo > 0.01) {
        const mid = (lo + hi) / 2;
        if (toLight(grey(mid)).r < lit * 0.2) lo = mid;
        else hi = mid;
      }
      return lo / noon;
    };
    expect(pixelShare(60)).toBeLessThan(pixelShare(180));
  });

  it('puts the night colonial body and lawn inside their bands, and a noon-bright night outside', () => {
    const noon = { r: 112, g: 117, b: 119 };
    const dusk = { r: 23, g: 29, b: 54 };
    expect(bandProblem(lightRatio(dusk, noon), BODY_BAND)).toBeNull();
    expect(bandProblem(lightRatio(noon, noon), BODY_BAND)).toContain('keeps 100%');
    expect(bandProblem(0.1, GROUND_BAND)).toContain('keeps 10%');
  });
});

describe('noon reading', () => {
  it('accepts a body in daylight and refuses black and sky', () => {
    expect(noonProblem(grey(100))).toBeNull();
    expect(noonProblem(grey(5))).toContain('not a body in daylight');
    expect(noonProblem(grey(230))).toContain('not a body in daylight');
  });
});
