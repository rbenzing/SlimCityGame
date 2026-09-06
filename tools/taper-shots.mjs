/** Lane-drop taper check (SPEC 29, wave 4d): lay a four-lane road that becomes
 * a two-lane street, read back the cross-section tile by tile down the taper,
 * and shoot it.
 *
 * Usage: node tools/taper-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-tapers';
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
const SPAN = 26;
let anchor = null;
let flattest = { spread: Infinity, at: null };
for (let z = 40; z < N - SPAN - 40 && !anchor; z++) {
  for (let x = 40; x < N - SPAN - 40; x++) {
    let lo = Infinity,
      hi = -Infinity,
      dry = true;
    for (let dz = 0; dz < SPAN && dry; dz += 2)
      for (let dx = 0; dx < SPAN && dry; dx += 2) {
        const i = idx(x + dx, z + dz);
        if (g0.water[i]) dry = false;
        const h = g0.height[i];
        if (h < lo) lo = h;
        if (h > hi) hi = h;
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
console.log('anchor', JSON.stringify(anchor));

await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
await page.waitForTimeout(300);

const col = (x, from, to) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ x: X + x, z: Z + from + i }));

// A four-lane road running south into a two-lane street.
const CX = 10;
await cmd('four-lane', [{ kind: 'buildRoad', tier: FOUR_LANE, tiles: col(CX, 0, 11) }]);
await cmd('two-lane', [{ kind: 'buildRoad', tier: TWO_LANE, tiles: col(CX, 12, 20) }]);
await page.waitForTimeout(2500);

const failures = [];
const widths = [];
for (let z = 2; z <= 14; z++) widths.push({ z, ...(await approach(X + CX, Z + z)) });
console.log(
  'down the road:',
  JSON.stringify(widths.map((w) => ({ z: w.z, lanes: w.lanes, w: w.width }))),
);

// The taper closes 7.5 m over seven tiles, so the widths step down toward the
// street rather than dropping in one tile.
const wide = widths.find((w) => w.z === 2)?.width;
const atJoin = widths.find((w) => w.z === 11)?.width;
const mid = widths.find((w) => w.z === 8)?.width;
if (!(wide > mid && mid > atJoin))
  failures.push(`the road does not narrow gradually: ${wide} -> ${mid} -> ${atJoin}`);
if (!(atJoin <= 8)) failures.push(`the tile against the street is still ${atJoin} m wide`);
if (pageErrors.length > 0) failures.push(`page errors: ${pageErrors.join(' | ')}`);

await call(() => window.__slimcity.setDayT(0.5));
const shot = async (name, tx, tz, d, yaw, pitch) => {
  await cam(tx, tz, d, yaw, pitch);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
};
await shot('taper-down', X + CX, Z + 9, 90, 0.0, 1.15);
await shot('taper-along', X + CX, Z + 8, 120, 0.5, 0.7);

console.log(failures.length === 0 ? 'PASS' : 'FAIL');
for (const f of failures) console.log(' -', f);
await b.close();
process.exit(failures.length === 0 ? 0 : 1);
