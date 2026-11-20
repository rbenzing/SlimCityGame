/** The ground a series stands on: flat dry land, levelled, one street, the
 * subjects in a row along it fronting it, each checked to be standing.
 *
 * The street runs east to west with the subjects on its north side, so a
 * subject's street side is south and the camera never has to look through a
 * neighbour: the gaps between subjects come from `rowGaps`. A row wider than
 * MAX_ROW tiles wraps into bands, each with its own street, one below the other.
 */
import { rowGaps } from './views.mjs';
import { settle } from './session.mjs';

/** Street tiles past each end of the row. */
const END_TILES = 2;
/** Levelled rows north of the deepest subject, for the rear view, and south of the street. */
const ROWS_BEHIND = 2;
const ROWS_FRONT = 3;
/** The tallest step in the ground the search accepts before levelling, in metres. */
const MAX_STEP = 6;
/** Tiles levelled past the site on every side. */
const LEVEL_MARGIN = 3;
/** The widest band of one street, in tiles; the map is 256 wide. */
const MAX_ROW = 200;
/** Street tier: the plain two-lane street. */
const STREET_TIER = 1;
const ACTIVE = 1;
const STAND_TIMEOUT_MS = 10000;

/**
 * Offsets along the street of each subject, its left tile and its band, the widest band in
 * tiles, and each band's deepest subject. A subject that would end past MAX_ROW starts the
 * next band.
 */
export function layoutRow(subjects, tile) {
  const gaps = rowGaps(subjects.map((s) => ({ ...s, tile })));
  let at = END_TILES;
  let band = 0;
  const bands = [{ deepest: 0, end: 0 }];
  const placed = subjects.map((s, i) => {
    if (i > 0) {
      if (at + gaps[i - 1] + s.w + END_TILES > MAX_ROW) {
        band++;
        at = END_TILES;
        bands.push({ deepest: 0, end: 0 });
      } else {
        at += gaps[i - 1];
      }
    }
    const dx = at;
    at += s.w;
    bands[band].deepest = Math.max(bands[band].deepest, s.d);
    bands[band].end = at + END_TILES;
    return { ...s, dx, band };
  });
  return { placed, width: Math.max(...bands.map((b) => b.end)), bands };
}

/** The top-left tile of the first window of `cols` by `rows` whose ground is dry and within MAX_STEP. */
function findFlat(grid, cols, rows) {
  const N = grid.size;
  const at = (x, z) => z * N + x;
  for (let z = 20; z < N - rows - 10; z++) {
    for (let x = 20; x < N - cols - 10; x++) {
      const h0 = grid.height[at(x, z)];
      let ok = true;
      for (let dz = 0; dz < rows && ok; dz++) {
        for (let dx = 0; dx < cols && ok; dx++) {
          const i = at(x + dx, z + dz);
          ok = !grid.water[i] && Math.abs(grid.height[i] - h0) <= MAX_STEP;
        }
      }
      if (ok) return { x, z, h0 };
    }
  }
  throw new Error(`no dry ground ${cols} by ${rows} tiles for the street`);
}

/**
 * Level a site, lay the street and plant every subject along it.
 *
 * `subjects`: `{ id, w, d, h }` (catalog id, footprint in tiles, height in metres); one with
 * `plot: true` is a patch of ground that is not placed. Returns each subject with its
 * top-left tile (`x`, `z`), its building id and `cx`, `cz`, the footprint centre as tile
 * coordinates, plus the street's tiles. Throws naming any subject that is not standing.
 *
 * `options.level` levels the site to that height instead of the height found there;
 * `options.anywhere` skips the search for dry ground, so the site is the middle of the map and
 * is levelled whatever stands there; `options.prepare(session, site)` runs after the street is
 * laid and before the subjects are placed, with `site.subjects` carrying each one's tiles, each
 * with its `band`, and `site.roads` the street row of each band.
 */
export async function buildSite(session, subjects, tile, options = {}) {
  const { page, send } = session;
  const { placed: row, width, bands } = layoutRow(subjects, tile);
  const bandRows = bands.map((b) => b.deepest + ROWS_BEHIND + ROWS_FRONT + 1);
  const rows = bandRows.reduce((a, b) => a + b, 0);
  const grid = await page.evaluate(() => window.__slimcity.readGrid());
  const found = options.anywhere
    ? {
        x: Math.floor((grid.size - width) / 2),
        z: Math.floor((grid.size - rows) / 2),
        h0: options.level ?? 0,
      }
    : findFlat(grid, width, rows);
  const { x: X, z: Z0 } = found;
  const h0 = options.level ?? found.h0;

  // A band's street row, and the subjects planted north of it.
  const roads = [];
  let top = Z0;
  for (let b = 0; b < bands.length; b++) {
    roads.push(top + bands[b].deepest + ROWS_BEHIND);
    top += bandRows[b];
  }
  const placed = row.map((s) => ({
    ...s,
    x: X + s.dx,
    z: roads[s.band] - s.d,
    cx: X + s.dx + (s.w - 1) / 2,
    cz: roads[s.band] - s.d + (s.d - 1) / 2,
  }));

  // Level the site and a margin round it, so no lot, drive, deck or street end stands on a
  // slope, even where the site is levelled to a height other than the ground's.
  const lw = width + 2 * LEVEL_MARGIN;
  const lh = rows + 2 * LEVEL_MARGIN;
  await page.evaluate(
    ([x, z, w, h, level]) => {
      const heights = new Float32Array(w * h).fill(level);
      window.__slimcity.cmd('Level site', [{ kind: 'terraformSet', x, z, w, h, heights }]);
    },
    [X - LEVEL_MARGIN, Z0 - LEVEL_MARGIN, lw, lh, h0],
  );
  await settle(page, {
    until: ([i, h]) => window.__slimcity.readGrid().height[i] === h,
    arg: [(Z0 + rows + LEVEL_MARGIN - 1) * grid.size + X + width + LEVEL_MARGIN - 1, h0],
  });

  for (let b = 0; b < bands.length; b++) {
    const road = roads[b];
    const length =
      Math.max(...placed.filter((s) => s.band === b).map((s) => s.dx + s.w)) + END_TILES;
    const tiles = Array.from({ length }, (_, i) => ({ x: X + i, z: road }));
    await send('Street', [{ kind: 'buildRoad', tier: STREET_TIER, tiles }]);
    await settle(page, {
      until: ([i]) => window.__slimcity.readGrid().roadTier[i] > 0,
      arg: [road * grid.size + X + length - 1],
    });
  }

  if (options.prepare) {
    await options.prepare(session, {
      subjects: placed,
      level: h0,
      roads,
      x: X,
      z: Z0,
      width,
      rows,
    });
    await settle(page);
  }

  // One command each: a batch is atomic, and one refused tile would drop the building.
  const solid = placed.filter((s) => !s.plot);
  const wants = solid.map((s) => `${s.id}@${s.x},${s.z}`);
  for (const s of solid) {
    await send('Civic', [
      { kind: 'placeBuilding', catalogId: s.id, x: s.x, z: s.z, rotation: s.rotation ?? 0 },
    ]);
  }
  const missing = () =>
    page.evaluate(
      ([list, state]) => {
        const up = window.__slimcity
          .readBuildings()
          .filter((b) => b.state === state)
          .map((b) => `${b.catalogId}@${b.x},${b.z}`);
        return list.filter((w) => !up.includes(w));
      },
      [wants, ACTIVE],
    );
  const deadline = performance.now() + STAND_TIMEOUT_MS;
  let absent = await missing();
  while (absent.length > 0 && performance.now() < deadline) {
    await settle(page);
    absent = await missing();
  }
  if (absent.length > 0) throw new Error(`not standing: ${absent.join(', ')}`);
  await settle(page);

  const buildings = await page.evaluate(() => window.__slimcity.readBuildings());
  const out = placed.map((s) => {
    const b = buildings.find((k) => k.catalogId === s.id && k.x === s.x && k.z === s.z);
    return { ...s, buildingId: b?.id ?? null };
  });
  return { subjects: out, street: { x0: X, z0: roads[0], length: width }, road: roads[0], roads };
}
