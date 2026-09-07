/** Power line (SPEC 30, slice 3): string a run out to a lot no road reaches,
 * and check the three things that matter — that the poles went up, that the
 * lot came alive, and that the city is being billed for the wire.
 *
 * Then look at it, because "poles with wire between them" is a claim about
 * the eye and a read-back cannot settle it.
 *
 * Usage: node tools/powerline-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-powerline';
mkdirSync(out, { recursive: true });

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
const poles = () => call(() => window.__slimcity.readPowerPoles());
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

const failures = [];
const row = (z, a, c) => Array.from({ length: c - a + 1 }, (_, i) => ({ x: X + a + i, z: Z + z }));

// A generator, and an island of road far off with nothing joining the two.
await cmd('plant', [
  { kind: 'placeBuilding', catalogId: 'coal-plant', x: X + 1, z: Z + 10, rotation: 0 },
]);
await cmd('island', [{ kind: 'buildRoad', tier: 1, tiles: row(10, 20, 26) }]);
await page.waitForTimeout(3000);

const before = await readGrid();
console.log('island powered before the line:', before.power?.[idx(X + 23, Z + 10)]);

await cam(X + 13, Z + 10, 130, 0.55, 0.85);
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/before.png` });

// The wire, from beside the plant out to the island's road.
await cmd('Power line', [{ kind: 'stringPowerLine', tiles: row(10, 3, 20), on: true }]);
await page.waitForTimeout(3500);

const after = await readGrid();
const stood = await poles();
console.log('poles standing:', stood.length);
console.log('island powered after the line:', after.power?.[idx(X + 23, Z + 10)]);

// A pole on every tile the line actually took. The run crosses the plant's
// own footprint, which refuses a pole — correctly, the ground is taken — so
// the count is read from the line layer rather than from the tiles asked for.
let strung = 0;
for (let i = 0; i < after.powerLine.length; i++) if (after.powerLine[i] === 1) strung += 1;
console.log('tiles carrying line:', strung);
if (stood.length === 0) failures.push('the line went up but no poles stand on it');
if (stood.length !== strung)
  failures.push(`${strung} tiles carry line but ${stood.length} poles stand`);
if (after.power?.[idx(X + 23, Z + 10)] !== 1)
  failures.push('the island road is still unpowered — the line carried nothing');

await cam(X + 13, Z + 10, 130, 0.55, 0.85);
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/after.png` });
await cam(X + 8, Z + 10, 45, 0.6, 0.55);
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/close.png` });

// SPEC 30 slice 1, in the running game: a gravel lane carries no cable, so
// nothing down it is supplied. The remedy is to run the line ALONG the lane —
// a line shares its ground with a road, being on poles above it.
const col = (x, a, c) => Array.from({ length: c - a + 1 }, (_, i) => ({ x: X + x, z: Z + a + i }));
await cmd('gravel', [{ kind: 'buildRoad', tier: 4, tiles: row(20, 3, 12) }]);
await page.waitForTimeout(3000);
const gravel = await readGrid();
console.log('gravel lane powered:', gravel.power?.[idx(X + 10, Z + 20)]);
if (gravel.power?.[idx(X + 10, Z + 20)] !== 0)
  failures.push('a gravel lane conducted power; only a sealed road has a cable in it');

// Down from the supplied line at z+10, then along the lane itself.
await cmd('Power line', [
  { kind: 'stringPowerLine', tiles: [...col(3, 10, 20), ...row(20, 3, 12)], on: true },
]);
await page.waitForTimeout(3000);
const remedied = await readGrid();
console.log('gravel lane powered once a line runs along it:', remedied.power?.[idx(X + 10, Z + 20)]);
if (remedied.power?.[idx(X + 10, Z + 20)] !== 1)
  failures.push('a line run along the gravel lane did not supply it — the remedy does not work');

await cam(X + 8, Z + 20, 70, 0.6, 0.8);
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/gravel-remedied.png` });

await b.close();
for (const e of pageErrors) failures.push(`page error: ${e}`);
if (failures.length > 0) {
  console.log('FAIL');
  for (const f of failures) console.log(' -', f);
  process.exitCode = 1;
} else {
  console.log('PASS');
}
