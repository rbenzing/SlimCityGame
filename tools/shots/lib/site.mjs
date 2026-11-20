/** The ground a series stands on: flat dry land, levelled, one street, the
 * subjects in a row along it fronting it, each checked to be standing.
 *
 * The street runs east to west with the subjects on its north side, so a
 * subject's street side is south and the camera never has to look through a
 * neighbour: the gaps between subjects come from `rowGaps`.
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
/** Street tier: the plain two-lane street. */
const STREET_TIER = 1;
const ACTIVE = 1;
const STAND_TIMEOUT_MS = 10000;

/** Offsets along the street of each subject, its left tile, and the row's width in tiles. */
export function layoutRow(subjects, tile) {
  const gaps = rowGaps(subjects.map((s) => ({ ...s, tile })));
  let at = END_TILES;
  const placed = subjects.map((s, i) => {
    if (i > 0) at += gaps[i - 1];
    const dx = at;
    at += s.w;
    return { ...s, dx };
  });
  return { placed, width: at + END_TILES };
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
 * `subjects`: `{ id, w, d, h }` (catalog id, footprint in tiles, height in metres).
 * Returns each subject with its top-left tile (`x`, `z`), its building id and
 * `cx`, `cz`, the footprint centre as tile coordinates, plus the street's tiles.
 * Throws naming any subject that is not standing.
 */
export async function buildSite(session, subjects, tile) {
  const { page, send } = session;
  const { placed, width } = layoutRow(subjects, tile);
  const deepest = Math.max(...subjects.map((s) => s.d));
  const rowsBehind = deepest + ROWS_BEHIND;
  const rows = rowsBehind + ROWS_FRONT;
  const grid = await page.evaluate(() => window.__slimcity.readGrid());
  const site = findFlat(grid, width, rows);
  const { x: X, z: Z0, h0 } = site;
  const road = Z0 + rowsBehind;

  // Level the site so no lot, drive or deck stands on a slope.
  await page.evaluate(
    ([x, z, w, h, level]) => {
      const heights = new Float32Array(w * h).fill(level);
      window.__slimcity.cmd('Level site', [{ kind: 'terraformSet', x, z, w, h, heights }]);
    },
    [X, Z0, width, rows, h0],
  );
  await settle(page, {
    until: ([i, h]) => window.__slimcity.readGrid().height[i] === h,
    arg: [(Z0 + rows - 1) * grid.size + X + width - 1, h0],
  });

  const tiles = Array.from({ length: width }, (_, i) => ({ x: X + i, z: road }));
  await send('Street', [{ kind: 'buildRoad', tier: STREET_TIER, tiles }]);
  await settle(page, {
    until: ([i]) => window.__slimcity.readGrid().roadTier[i] > 0,
    arg: [road * grid.size + X + width - 1],
  });

  // One command each: a batch is atomic, and one refused tile would drop the building.
  const wants = placed.map((s) => `${s.id}@${X + s.dx},${road - s.d}`);
  for (const s of placed) {
    await send('Civic', [
      { kind: 'placeBuilding', catalogId: s.id, x: X + s.dx, z: road - s.d, rotation: 0 },
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
    const x = X + s.dx;
    const z = road - s.d;
    const b = buildings.find((k) => k.catalogId === s.id && k.x === x && k.z === z);
    return { ...s, x, z, buildingId: b.id, cx: x + (s.w - 1) / 2, cz: z + (s.d - 1) / 2 };
  });
  return { subjects: out, street: { x0: X, z0: road, length: width }, road };
}
