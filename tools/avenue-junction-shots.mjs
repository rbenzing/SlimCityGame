/** An avenue meeting a two-lane street: the markings on the approach, in the
 * box, and on the way out.
 *
 * This is the case that was reported as wrong, so the shots are framed the way
 * a player sees it — straight down, close enough to read the paint — and the
 * approach is photographed on its own because the turn bay opens there and
 * that is where the lines have the most to do.
 *
 * Usage: node tools/avenue-junction-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-avenue-junction';
mkdirSync(out, { recursive: true });

const AVENUE = 2;
const TWO_LANE = 1;

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
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#viewport canvas', { timeout: 20000 });
await page.waitForTimeout(4000);

const call = (fn, ...a) => page.evaluate(fn, ...a);
const cmd = (l, c) => call(([x, y]) => window.__slimcity.cmd(x, y), [l, c]);
const readGrid = () => call(() => window.__slimcity.readGrid());
const approach = (x, z) => call(([ax, az]) => window.__slimcity.readApproach(ax, az), [x, z]);
const cam = (tx, tz, d, yaw, pitch) =>
  call(
    ([x, z, dd, yy, pp]) => window.__slimcity.setCamera((x + 0.5) * 16, (z + 0.5) * 16, dd, yy, pp),
    [tx, tz, d, yaw, pitch],
  );

const g0 = await readGrid();
const N = g0.size;
const idx = (x, z) => z * N + x;

const SPAN = 30;
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
    if (spread <= 0.3) {
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

const row = (z, a, c) => Array.from({ length: c - a + 1 }, (_, i) => ({ x: X + a + i, z: Z + z }));
const col = (x, a, c) => Array.from({ length: c - a + 1 }, (_, i) => ({ x: X + x, z: Z + a + i }));

// The avenue runs east-west; the two-lane street crosses it north-south.
const CROSS_X = 14;
const CROSS_Z = 14;
await cmd('avenue', [{ kind: 'buildRoad', tier: AVENUE, tiles: row(CROSS_Z, 2, 26) }]);
await cmd('street', [{ kind: 'buildRoad', tier: TWO_LANE, tiles: col(CROSS_X, 2, 26) }]);
await page.waitForTimeout(3000);

const junctions = await call(() => window.__slimcity.readJunctions());
console.log('junction:', JSON.stringify(junctions));
for (const d of [1, 2, 3, 4]) {
  const a = await approach(X + CROSS_X - d, Z + CROSS_Z);
  console.log(
    `avenue ${d} tile(s) west of the box:`,
    JSON.stringify(a && { lanes: a.lanes, width: a.width, pocket: a.pocket, distance: a.distance }),
  );
}
const counts = await call(() => window.__slimcity.readFurnitureCounts());
console.log('furniture:', JSON.stringify(counts));

const shots = [
  ['box', X + CROSS_X, Z + CROSS_Z, 34, 0, 1.5],
  ['approach-west', X + CROSS_X - 4, Z + CROSS_Z, 34, 0, 1.5],
  ['whole', X + CROSS_X, Z + CROSS_Z, 78, 0, 1.5],
  ['oblique', X + CROSS_X, Z + CROSS_Z, 46, 0.5, 0.7],
];
for (const [name, tx, tz, d, yaw, pitch] of shots) {
  await cam(tx, tz, d, yaw, pitch);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
}

await b.close();
if (pageErrors.length > 0) {
  console.log('FAIL');
  for (const e of pageErrors) console.log(' - page error:', e);
  process.exitCode = 1;
} else {
  console.log('shots written to', out);
}
