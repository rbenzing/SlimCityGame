import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { framesOf } from '../../tools/shots/lib/frames.mjs';

const SERIES_DIR = fileURLToPath(new URL('../../tools/shots/series/', import.meta.url));

describe('framesOf', () => {
  it('counts three views a road piece, for roads and street alike', () => {
    const subjects = [{ id: 'a' }, { id: 'b' }];
    const details = [{ subject: 'a' }];
    expect(framesOf({ type: 'roads', subjects, details })).toBe(2 * 3 + 1 + 1);
    expect(framesOf({ type: 'street', subjects })).toBe(2 * 3 + 1);
  });

  it('counts five views a building', () => {
    expect(framesOf({ type: 'civic', subjects: [{ id: 'a' }] })).toBe(5 + 1);
  });

  it('counts the frames of a views series, not a multiple of them', () => {
    const frames = [{ subject: 'a' }, { subject: 'a' }, { subject: 'b' }];
    expect(framesOf({ type: 'views', subjects: [{ id: 'a' }, { id: 'b' }], frames })).toBe(3);
  });

  it('counts a town subject its views and a night frame for the first', () => {
    const subjects = [{ id: 'a' }, { id: 'b', views: ['above'] }, { id: 'c', night: true }];
    expect(framesOf({ type: 'town', subjects })).toBe(2 + 1 + 2 + 2);
  });

  it('is a whole number for every series on disk', async () => {
    process.env.SHOTS_NO_RUN = '1';
    try {
      for (const type of readdirSync(SERIES_DIR)) {
        for (const file of readdirSync(`${SERIES_DIR}${type}`).filter((f) => f.endsWith('.mjs'))) {
          const spec = (await import(pathToFileURL(`${SERIES_DIR}${type}/${file}`).href)).default;
          const n = framesOf(spec);
          expect(Number.isInteger(n) && n > 0, `${type}/${file}`).toBe(true);
        }
      }
    } finally {
      delete process.env.SHOTS_NO_RUN;
    }
  });
});
