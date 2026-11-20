import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { houseStyleOf } from '../../src/render/houselot';
import type { BuildingCatalogEntry } from '../../src/shared/types';
import {
  catalog,
  formOf,
  kindSubjects,
  roomiest,
  standard,
  stackedSubjects,
  type CatalogEntry,
} from '../../tools/shots/lib/zoned.mjs';

const SERIES_DIR = fileURLToPath(new URL('../../tools/shots/series/zoned/', import.meta.url));
/** Zone ids the zoned series leave to others: farms are the civic farms series' (src/shared/types.ts ZoneType.Agriculture). */
const AGRICULTURE = 9;

interface Spec {
  name: string;
  type: string;
  subjects: { id: string; as?: string }[];
  details?: { subject: string }[];
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

const zoned = (e: CatalogEntry) =>
  ['res', 'com', 'ind'].includes(e.category) && e.zone !== undefined && e.zone !== AGRICULTURE;

describe('zoned shot series', () => {
  it('are all of type zoned, with unique names and unique frame names inside each', async () => {
    const series = await readSeries();
    expect(series.length).toBeGreaterThan(0);
    expect(new Set(series.map((s) => s.name)).size).toBe(series.length);
    for (const s of series) {
      expect(s.type).toBe('zoned');
      const names = s.subjects.map((k) => k.as ?? k.id);
      expect(new Set(names).size, s.name).toBe(names.length);
      for (const k of s.subjects)
        expect(
          catalog().some((e) => e.id === k.id),
          k.id,
        ).toBe(true);
    }
  });

  it('photograph every kind of every zoned zone at every level it has', async () => {
    const ids = new Set((await readSeries()).flatMap((s) => s.subjects.map((k) => k.id)));
    // A kind at a level counts once whatever lot it stands on: the ordinary lot is shot, a variant only where it draws differently.
    const levelKey = (e: CatalogEntry) => `${e.zone}/${e.kind}/level ${e.level}`;
    // Every lot size a kind comes in is shot at its first level.
    const lotKey = (e: CatalogEntry) => `${e.zone}/${e.kind}/${e.lot ?? 'any'} lot`;
    const covered = catalog().filter((e) => zoned(e) && ids.has(e.id));
    const shot = new Set([...covered.map(levelKey), ...covered.map(lotKey)]);
    const wanted = new Set(
      catalog()
        .filter(zoned)
        .flatMap((e) => [levelKey(e), lotKey(e)]),
    );
    expect([...wanted].filter((k) => !shot.has(k))).toEqual([]);
  });

  it('photograph every stacked variant and the roomiest lot of every kind that has one', async () => {
    const ids = new Set((await readSeries()).flatMap((s) => s.subjects.map((k) => k.id)));
    for (const e of catalog().filter((c) => c.stacked && zoned(c)))
      expect(ids.has(e.id), e.id).toBe(true);
    const kinds = new Set(
      catalog()
        .filter(zoned)
        .map((e) => e.kind as string),
    );
    for (const kind of kinds) {
      const roomy = roomiest(kind);
      if (roomy) expect(ids.has(roomy.id), roomy.id).toBe(true);
    }
  });

  it('puts no catalog id in two series, so no frame is taken twice', async () => {
    const ids = (await readSeries()).flatMap((s) => [...new Set(s.subjects.map((k) => k.id))]);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it('only gives a detail a subject its series plants', async () => {
    for (const s of await readSeries()) {
      const names = s.subjects.map((k) => k.as ?? k.id);
      for (const d of s.details ?? []) expect(names, `${s.name} ${d.subject}`).toContain(d.subject);
    }
  });
});

describe('zoned scene helpers', () => {
  it('find one ordinary entry for each level of a kind, on a lot not a variant', () => {
    for (const level of [1, 2, 3]) {
      const e = standard('shop', level);
      expect(e.level).toBe(level);
      expect(e.id).not.toMatch(/-(lot|up)\d+x\d+$/);
    }
  });

  it('refuse a kind or level the catalog does not have', () => {
    expect(() => standard('shop', 9)).toThrow(/expected one ordinary/);
    expect(() => standard('nonesuch', 1)).toThrow(/expected one ordinary/);
  });

  it('list a kind with no roomy lot as its three levels alone', () => {
    expect(roomiest('chemical')).toBeUndefined();
    expect(kindSubjects(['chemical'])).toHaveLength(3);
    expect(kindSubjects(['shop'])).toHaveLength(4);
  });

  it('take only the stacked variants of the kinds asked for', () => {
    const subjects = stackedSubjects(['restaurant']);
    expect(subjects.length).toBeGreaterThan(0);
    for (const s of subjects) {
      const e = catalog().find((c) => c.id === s.id)!;
      expect(e.kind).toBe('restaurant');
      expect(e.stacked).toBeDefined();
    }
  });

  it('read a one-storey home as the same form the render does, for every building id', () => {
    const entry = catalog().find((e) => e.id === 'res-normal-1') as unknown as BuildingCatalogEntry;
    for (let id = 1; id <= 500; id++) {
      expect(formOf(id), `id ${id}`).toBe(houseStyleOf(entry, id));
    }
  });
});
