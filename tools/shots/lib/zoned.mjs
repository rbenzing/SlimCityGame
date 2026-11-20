/** Scene code the zoned series share: choosing catalog entries by kind and
 * level, and standing a one-storey home in the form a series asks for.
 *
 * Zoned buildings are plopped like any other: the catalog entry is the
 * subject, the sim stays paused, and the views come from the library.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { settle } from './session.mjs';

const CATALOG = fileURLToPath(new URL('../../../src/data/catalog.json', import.meta.url));
const LEVELS = [1, 2, 3];

let cached;
/** Every catalog entry, read once. */
export function catalog() {
  cached ??= JSON.parse(readFileSync(CATALOG, 'utf8')).buildings;
  return cached;
}

/** A roomy-lot or stacked variant: the same kind on another lot, its id ending `-lot4x2` or `-up2x2`. */
const isVariant = (id) => /-(lot|up)\d+x\d+$/.test(id);

/** The entry of a kind at a level on its ordinary lot. Throws if the catalog has none. */
export function standard(kind, level) {
  const found = catalog().filter((e) => e.kind === kind && e.level === level && !isVariant(e.id));
  if (found.length !== 1)
    throw new Error(`expected one ordinary '${kind}' at level ${level}, found ${found.length}`);
  return found[0];
}

/** The roomiest lot of a kind: its largest `-lot` variant, which draws the most car park; undefined if it has none. */
export function roomiest(kind) {
  const found = catalog().filter((e) => e.kind === kind && /-lot\d+x\d+$/.test(e.id));
  return found.reduce(
    (a, b) => (a && a.footprint.w * a.footprint.d >= b.footprint.w * b.footprint.d ? a : b),
    undefined,
  );
}

/** Subjects for each kind: its three levels on the ordinary lot, then its roomiest lot if it has one. */
export function kindSubjects(kinds) {
  return kinds.flatMap((kind) => [
    ...LEVELS.map((level) => ({ id: standard(kind, level).id })),
    ...[roomiest(kind)].filter(Boolean).map((e) => ({ id: e.id })),
  ]);
}

/** Subjects for every stacked variant of these kinds (a catalog entry with `stacked`): the same kind built up on a smaller lot, its parking in the building. */
export const stackedSubjects = (kinds) =>
  catalog()
    .filter((e) => e.stacked && kinds.includes(e.kind))
    .map((e) => ({ id: e.id }));

/** Subjects for catalog ids, by name. */
export const subjectsOf = (...ids) => ids.map((id) => ({ id }));

/** The form a one-storey home takes. It mirrors the render's roll over the building id
 * (src/render/houselot.ts: slot 19, three forms). */
const FORMS = ['ranch', 'craftsman', 'splitLevel'];
const SLOT_FORM = 19;
function hash1(n) {
  let h = n >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}
export const formOf = (buildingId) =>
  FORMS[Math.min(FORMS.length - 1, Math.floor(hash1(buildingId * 131 + SLOT_FORM) * 3))];

/** Zone depth in tiles behind a street; a lot shallower than this has a yard behind it. */
const ZONE_DEPTH = 3;

/**
 * Zone the three rows beside the street across each subject's width, in the
 * zone its catalog entry grows in, as a player's zoning covers a lot and the
 * land behind it, so the yard a shallow lot gets is drawn. Runs before the
 * subjects stand: the game zones empty land only.
 */
export async function zoneBehind({ send }, site) {
  const byZone = new Map();
  for (const s of site.subjects) {
    const { zone } = catalog().find((e) => e.id === s.id);
    const tiles = byZone.get(zone) ?? [];
    const road = site.roads[s.band];
    for (let z = road - ZONE_DEPTH; z < road; z++)
      for (let dx = 0; dx < s.w; dx++) tiles.push({ x: s.x + dx, z });
    byZone.set(zone, tiles);
  }
  for (const [zone, tiles] of byZone) await send('Zone', [{ kind: 'paintZone', zone, tiles }]);
}

const MAX_TRIES = 24;

/**
 * Stand each named one-storey home in the form asked for.
 *
 * The form follows the building id and every placement takes the next id, so a
 * home of the wrong form is cleared and placed again until the id lands on it.
 * `wanted` maps a subject's frame name to a form (`ranch`, `craftsman`,
 * `splitLevel`).
 */
export async function standForms({ page, send }, site, wanted) {
  const at = (x, z) =>
    page.evaluate(
      ([px, pz]) => window.__slimcity.readBuildings().find((b) => b.x === px && b.z === pz),
      [x, z],
    );
  for (const [name, form] of Object.entries(wanted)) {
    const s = site.subjects.find((k) => k.name === name);
    if (!s) throw new Error(`no subject named '${name}'`);
    let current = await at(s.x, s.z);
    for (let tries = 0; current && formOf(current.id) !== form; tries++) {
      if (tries === MAX_TRIES) throw new Error(`no ${form} in ${MAX_TRIES} placements of ${name}`);
      const tiles = [];
      for (let dz = 0; dz < s.d; dz++)
        for (let dx = 0; dx < s.w; dx++) tiles.push({ x: s.x + dx, z: s.z + dz });
      await send('Clear', [{ kind: 'bulldoze', tiles }]);
      await settle(page, {
        until: ([px, pz]) =>
          !window.__slimcity.readBuildings().some((b) => b.x === px && b.z === pz),
        arg: [s.x, s.z],
      });
      await send('Home', [{ kind: 'placeBuilding', catalogId: s.id, x: s.x, z: s.z, rotation: 0 }]);
      await settle(page, {
        until: ([px, pz]) =>
          window.__slimcity.readBuildings().some((b) => b.x === px && b.z === pz && b.state === 1),
        arg: [s.x, s.z],
      });
      current = await at(s.x, s.z);
    }
    if (!current) throw new Error(`${name} is not standing`);
  }
}
