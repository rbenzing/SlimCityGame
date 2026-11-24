import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LENS_MEANING } from '../../src/shared/lenses';
import { framedBox, gridBox, row, viewOf } from '../../tools/shots/lib/town.mjs';

const SERIES_DIR = fileURLToPath(new URL('../../tools/shots/series/town/', import.meta.url));

interface Subject {
  id: string;
  lens?: number | string;
  views?: string[];
}
interface Spec {
  name: string;
  type: string;
  budgetS: number;
  subjects: Subject[];
}

async function readSeries(): Promise<Spec[]> {
  process.env.SHOTS_NO_RUN = '1';
  try {
    return await Promise.all(
      readdirSync(SERIES_DIR)
        .filter((f) => f.endsWith('.mjs'))
        .map(
          async (f) =>
            (await import(/* @vite-ignore */ pathToFileURL(SERIES_DIR + f).href)).default,
        ),
    );
  } finally {
    delete process.env.SHOTS_NO_RUN;
  }
}

describe('town series', () => {
  it('stay inside the town type budget and name each subject once', async () => {
    const series = await readSeries();
    expect(series.map((s) => s.name).sort()).toEqual([
      'circles',
      'firstgame',
      'lenses',
      'life',
      'lots',
      'town',
    ]);
    for (const s of series) {
      expect(s.type).toBe('town');
      expect(s.budgetS).toBeLessThanOrEqual(300);
      const ids = s.subjects.map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('lenses shows every lens the game has, once', async () => {
    const lenses = (await readSeries()).find((s) => s.name === 'lenses')!;
    const shown = lenses.subjects.filter((s) => s.lens !== undefined).map((s) => s.lens);
    expect(new Set(shown).size).toBe(shown.length);
    expect([...shown].map(String).sort()).toEqual(Object.keys(LENS_MEANING).sort());
  });

  it('keeps the first game to a few full frames, one a step', async () => {
    const first = (await readSeries()).find((s) => s.name === 'firstgame')!;
    expect(first.subjects.length).toBeLessThanOrEqual(25);
    for (const s of first.subjects) expect(s.views).toEqual(['full']);
  });

  it('turns a lot to its street: a north-facing lot is looked at from the north', () => {
    const farm = { catalogId: 'farm-crops-1', x: 10, z: 20, rotation: 2 };
    const box = gridBox(farm);
    // The 4 by 5 lot's centre, whatever way it faces.
    expect([box.cx, box.cz]).toEqual([11.5, 22]);
    expect(box.facing).toBeCloseTo(Math.PI);
    const front = viewOf('front', { ...box, tile: 20 });
    expect(front.yaw).toBeCloseTo(Math.PI);
    // The camera stands north of the centre, on the street side.
    expect(front.tz).toBeLessThan(box.cz);
    // A parcel on a road running east (heading 0) fronts north, too.
    const framed = framedBox(
      { frame: { x: 400, z: 400, heading: 0 } },
      { footprint: { w: 2, d: 2 }, height: 8 },
      20,
    );
    expect(framed.facing).toBeCloseTo(Math.PI);
    expect([framed.cx, framed.cz]).toEqual([20 + 1 - 0.5, 20 + 1 - 0.5]);
  });

  it('lays a row of tiles from its first tile', () => {
    expect(row(5, 9, 3)).toEqual([
      { x: 5, z: 9 },
      { x: 6, z: 9 },
      { x: 7, z: 9 },
    ]);
  });
});
