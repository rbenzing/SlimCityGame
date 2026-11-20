import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { clashOf, fileClash } from '../../tools/shots/lib/names.mjs';

const SERIES_DIR = fileURLToPath(new URL('../../tools/shots/series/', import.meta.url));

async function readAll(): Promise<{ name: string; path: string }[]> {
  process.env.SHOTS_NO_RUN = '1';
  try {
    const found: { name: string; path: string }[] = [];
    for (const type of readdirSync(SERIES_DIR)) {
      for (const f of readdirSync(SERIES_DIR + type).filter((x) => x.endsWith('.mjs'))) {
        const path = `${SERIES_DIR}${type}/${f}`;
        const spec = (await import(/* @vite-ignore */ pathToFileURL(path).href)).default;
        found.push({ name: spec.name, path });
      }
    }
    return found;
  } finally {
    delete process.env.SHOTS_NO_RUN;
  }
}

describe('series names', () => {
  it('are unique across every type, so each series has its own output folder', async () => {
    expect(clashOf(await readAll())).toBeNull();
  });

  it('each equal its file name', async () => {
    for (const s of await readAll()) expect(s.path.endsWith(`/${s.name}.mjs`), s.path).toBe(true);
  });

  it('a clash names both files', () => {
    const message = clashOf([
      { name: 'power', path: '/s/civic/power.mjs' },
      { name: 'power', path: '/s/street/power.mjs' },
    ]);
    expect(message).toContain('/s/civic/power.mjs');
    expect(message).toContain('/s/street/power.mjs');
  });

  it('a series file whose name another file shares is refused, naming the other', () => {
    expect(fileClash(`${SERIES_DIR}civic/power.mjs`)).toBeNull();
    expect(fileClash(`${SERIES_DIR}street/supply.mjs`)).toBeNull();
    expect(fileClash(`${SERIES_DIR}town/town.mjs`)).toBeNull();
  });
});
