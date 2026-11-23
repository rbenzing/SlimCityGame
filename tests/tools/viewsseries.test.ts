import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkViews, expectNone } from '../../tools/shots/lib/views-ui.mjs';

const SERIES_DIR = fileURLToPath(new URL('../../tools/shots/series/views/', import.meta.url));

interface Frame {
  subject: string;
  view: string;
  shows?: string;
  full?: boolean;
  camera?: unknown;
}
interface Spec {
  name: string;
  type: string;
  subjects: { id: string }[];
  frames: Frame[];
}

async function readSeries(): Promise<Spec[]> {
  process.env.SHOTS_NO_RUN = '1';
  try {
    const files = readdirSync(SERIES_DIR).filter((f) => f.endsWith('.mjs'));
    return await Promise.all(
      files.map(
        async (f) => (await import(/* @vite-ignore */ pathToFileURL(SERIES_DIR + f).href)).default,
      ),
    );
  } finally {
    delete process.env.SHOTS_NO_RUN;
  }
}

const spec = (frames: Frame[]) => ({ subjects: [{ id: 'a' }], frames });
const frame = (over: Partial<Frame> = {}): Frame => ({
  subject: 'a',
  view: 'one',
  shows: 'a thing',
  full: true,
  ...over,
});

describe('views series', () => {
  it('are all of type views, with unique names, each subject shown and each frame named once', async () => {
    const series = await readSeries();
    expect(series.map((s) => s.name).sort()).toEqual(['ghosts', 'night', 'panels', 'underground']);
    for (const s of series) {
      expect(s.type).toBe('views');
      const names = s.frames.map((f) => `${f.subject}-${f.view}`);
      expect(new Set(names).size, s.name).toBe(names.length);
      for (const k of s.subjects)
        expect(
          s.frames.some((f) => f.subject === k.id),
          `${s.name}: ${k.id} has no frame`,
        ).toBe(true);
    }
  });

  it('says what every frame shows', async () => {
    for (const s of await readSeries())
      for (const f of s.frames) expect(f.shows, `${s.name}-${f.subject}-${f.view}`).toBeTruthy();
  });
});

describe('checkViews', () => {
  it('accepts a full frame and a camera frame', () => {
    expect(() =>
      checkViews(spec([frame(), frame({ view: 'two', full: false, camera: {} })])),
    ).not.toThrow();
  });

  it.each([
    ['no frames', spec([]), 'needs frames'],
    ['an unknown subject', spec([frame({ subject: 'b' })]), "unknown subject 'b'"],
    ['no statement of what it shows', spec([frame({ shows: '' })]), 'what it shows'],
    ['neither a camera nor full', spec([frame({ full: false })]), 'needs a camera or full'],
    ['a name used twice', spec([frame(), frame()]), 'two frames are named'],
  ])('refuses %s', (_what, given, message) => {
    expect(() => checkViews(given)).toThrow(message);
  });
});

describe('expectNone', () => {
  it('passes on no problems and names every one it is given, skipping the false ones', () => {
    expect(() => expectNone([false, null, undefined])).not.toThrow();
    expect(() => expectNone(['a is covered', false, 'b is small'])).toThrow(
      'a is covered; b is small',
    );
  });
});
