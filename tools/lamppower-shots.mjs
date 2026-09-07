/** Street lighting follows the supply (SPEC 30, slice 2): build a run of road
 * with no generator anywhere, confirm it stands NO lamps, then put a generator
 * on one end and confirm the lamps arrive — without anyone touching a road.
 *
 * Shot at night, because the whole point of the rule is what the city looks
 * like after dark: coverage you can read off the map without opening a lens.
 *
 * Usage: node tools/lamppower-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-lamppower';
mkdirSync(out, { recursive: true });

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
const lampCount = () => call(() => window.__slimcity.readLampPoles().length);
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
console.log('anchor', JSON.stringify(anchor));

await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
// Night, so the lamps that ARE there read as lit rather than as grey poles.
await call(() => window.__slimcity.setTimeOfDay?.(0.05));
await page.waitForTimeout(400);

const failures = [];
const row = (z, a, c) => Array.from({ length: c - a + 1 }, (_, i) => ({ x: X + a + i, z: Z + z }));

// A street with no generator anywhere in the city.
await cmd('street', [{ kind: 'buildRoad', tier: TWO_LANE, tiles: row(10, 0, 20) }]);
await page.waitForTimeout(2500);

const dark = await lampCount();
console.log('lamps with no supply:', dark);
if (dark !== 0) failures.push(`an unsupplied street stood ${dark} lamps; it should stand none`);

await cam(X + 10, Z + 10, 90, 0.6, 0.9);
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/unsupplied.png` });

// Now a generator at one end. Nobody touches the road.
await cmd('plant', [
  { kind: 'placeBuilding', catalogId: 'coal-plant', x: X, z: Z + 6, rotation: 0 },
]);
await page.waitForTimeout(4000);

const lit = await lampCount();
console.log('lamps once supplied:', lit);
if (lit === 0)
  failures.push('the street stayed dark after a generator reached it; supply did not light it');

await cam(X + 10, Z + 10, 90, 0.6, 0.9);
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/supplied.png` });
await cam(X + 10, Z + 10, 40, 0.7, 1.0);
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/supplied-close.png` });

await b.close();
for (const e of pageErrors) failures.push(`page error: ${e}`);
if (failures.length > 0) {
  console.log('FAIL');
  for (const f of failures) console.log(' -', f);
  process.exitCode = 1;
} else {
  console.log('PASS');
}
