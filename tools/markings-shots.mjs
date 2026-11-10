/** Marking continuity (SPEC 29): does painted line work follow the road's own
 * geometry from end to end, or does each tile paint its own private idea of
 * where the lines go?
 *
 * Five cases, each laid on flat ground and photographed from close overhead so
 * the paint is legible:
 *   A  a long straight run          — dash phase across tile and chunk seams
 *   B  a right-angle turn           — curved paint meeting the straight arms
 *   C  a wide road narrowing        — paint against a bending kerb
 *   D  a crossroads                 — stop bars, crossings, and the box itself
 *   E  a cross-section that changes — lines whose offset moves mid-run
 *
 * Usage: node tools/markings-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { cleanShot, closeUp, tileCamera, unlimitedMoneyOption } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-markings';
mkdirSync(out, { recursive: true });

const TWO_LANE = 1;
const FOUR_LANE = 7;

const b = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
const pageErrors = [];
page.on('pageerror', (e) => {
  pageErrors.push(e.message);
  console.log('[pageerror]', e.message);
});
await page.addInitScript(() => {
  try {
    sessionStorage.setItem(
      'slimcity.session',
      JSON.stringify({ screen: 'playing', seed: 12345, mode: 'new' }),
    );
  } catch (e) {
    void e;
  }
});
await unlimitedMoneyOption(page);
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#viewport canvas', { timeout: 20000 });
await page.waitForTimeout(4000);

const call = (fn, ...a) => page.evaluate(fn, ...a);
const cmd = (l, c) => call(([x, y]) => window.__slimcity.cmd(x, y), [l, c]);
const readGrid = () => call(() => window.__slimcity.readGrid());
const approach = (x, z) => call(([ax, az]) => window.__slimcity.readApproach(ax, az), [x, z]);
const cam = tileCamera(page);

const g0 = await readGrid();
const N = g0.size;
const idx = (x, z) => z * N + x;

// The flattest dry square we can find: a slope hides a marking defect behind
// its own shading, and terrain height is sampled per vertex.
const SPAN = 40;
let anchor = null;
let flattest = { spread: Infinity, at: null };
for (let z = 40; z < N - SPAN - 40 && !anchor; z++) {
  for (let x = 40; x < N - SPAN - 40; x++) {
    let lo = Infinity;
    let hi = -Infinity;
    let dry = true;
    for (let dz = 0; dz < SPAN && dry; dz += 2) {
      for (let dx = 0; dx < SPAN && dry; dx += 2) {
        const i = idx(x + dx, z + dz);
        if (g0.water[i]) dry = false;
        const h = g0.height[i];
        if (h < lo) lo = h;
        if (h > hi) hi = h;
      }
    }
    if (!dry) continue;
    const spread = hi - lo;
    if (spread < flattest.spread) flattest = { spread, at: { x, z } };
    if (spread <= 0.4) {
      anchor = { x, z };
      break;
    }
  }
}
if (!anchor) anchor = flattest.at;
const { x: X, z: Z } = anchor;
console.log('anchor', JSON.stringify(anchor), 'spread', flattest.spread.toFixed(2));

await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
await page.waitForTimeout(300);

const failures = [];
const notes = [];
const col = (x, a, c) => Array.from({ length: c - a + 1 }, (_, i) => ({ x: X + x, z: Z + a + i }));
const row = (z, a, c) => Array.from({ length: c - a + 1 }, (_, i) => ({ x: X + a + i, z: Z + z }));
const build = (label, tier, tiles) => cmd(label, [{ kind: 'buildRoad', tier, tiles }]);

// A — a long straight run, crossing at least one chunk seam.
await build('A straight', TWO_LANE, col(4, 2, 34));

// B — a right-angle turn on a four-lane.
await build('B turn arm', FOUR_LANE, col(12, 2, 16));
await build('B turn leg', FOUR_LANE, row(16, 12, 26));

// C — a four-lane running straight into a two-lane: the kerb bends, and the
// question is whether the paint bends with it.
await build('C wide', FOUR_LANE, col(32, 2, 12));
await build('C narrow', TWO_LANE, col(32, 13, 22));

// D — a crossroads of four-lanes.
await build('D main', FOUR_LANE, col(22, 24, 38));
await build('D cross', FOUR_LANE, row(31, 16, 30));

await page.waitForTimeout(3000);

// The narrowing tile: what the sim believes its cross-section is there.
const taperTile = await approach(X + 32, Z + 12);
console.log('taper tile:', JSON.stringify(taperTile));
if (taperTile) notes.push(`narrowing tile draws ${taperTile.lanes} lanes at ${taperTile.width}m`);

await call(() => window.__slimcity.setSpeed(0));
await call(() => window.__slimcity.setDayT(0.5));

// The first terrain chunk edge inside run A: the world tile row that is a
// multiple of the chunk size, which a dash phase has to carry across.
const CHUNK_TILES = 16;
const seamZ = Math.ceil((Z + 8) / CHUNK_TILES) * CHUNK_TILES;
// Camera targets are tile centres, so half a tile back lands on the edge between
// two tiles: the row boundary at seamZ, and the one where the wide road ends.
const shots = [
  // A: the whole run from above, then the chunk seam on doubled pixels.
  ['A-straight-top', X + 4, Z + 18, 150, 0, 1.5, 1],
  ['A-straight-seam', X + 4, seamZ - 0.5, 40, 0, 1.5, 2],
  // B: the corner, top-down and from an eye height.
  ['B-turn-top', X + 12, Z + 16, 40, 0, 1.5, 1],
  ['B-turn-oblique', X + 12, Z + 16, 34, 0.7, 0.55, 1],
  // C: the narrowing, top-down — the whole transition, then the paint against
  // the bending kerb on doubled pixels. The kerb eases in over the
  // six tiles before the narrow road starts at row 13, so the middle of the taper is row 9.
  ['C-narrow-top', X + 32, Z + 9.5, 160, 0, 1.5, 1],
  ['C-narrow-close', X + 32, Z + 9.5, 40, 0, 1.5, 2],
  // D: the crossroads.
  ['D-cross-top', X + 22, Z + 31, 52, 0, 1.5, 1],
  ['D-cross-close', X + 22, Z + 31, 30, 0, 1.5, 1],
];
for (const [name, tx, tz, d, yaw, pitch, scale] of shots) {
  const restore = scale > 1 ? await closeUp(page, scale) : null;
  await cam(tx, tz, d, yaw, pitch);
  await page.waitForTimeout(700);
  await cleanShot(page, `${out}/${name}.png`);
  await restore?.();
  console.log('shot', name);
}

await b.close();
for (const e of pageErrors) failures.push(`page error: ${e}`);
for (const n of notes) console.log('note:', n);
if (failures.length > 0) {
  console.log('FAIL');
  for (const f of failures) console.log(' -', f);
  process.exitCode = 1;
} else {
  console.log('shots written to', out);
}
