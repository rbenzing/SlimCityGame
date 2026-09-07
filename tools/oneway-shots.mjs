/** Road direction check (SPEC 29, wave 2): a one-way street runs the way it
 * was drawn, not the way its geometry reads. Lays two identical one-way
 * columns — one drawn north to south, one drawn south to north — reads back
 * the direction every tile stored, and shoots them so the arrows can be seen
 * pointing opposite ways down the same axis.
 *
 * Usage: node tools/oneway-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-oneway';
mkdirSync(out, { recursive: true });

const ONE_WAY = 6;
const FLOW = { none: 0, north: 1, east: 2, south: 3, west: 4 };

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
const cam = tileCamera(page);

const g0 = await readGrid();
const N = g0.size;
const idx = (x, z) => z * N + x;
let anchor = null;
let flattest = { spread: Infinity, at: null };
for (let z = 40; z < N - 60; z++) {
  for (let x = 40; x < N - 40; x++) {
    let lo = Infinity;
    let hi = -Infinity;
    let dry = true;
    for (let k = 0; k < 14 && dry; k++) {
      for (let dx = -2; dx <= 6 && dry; dx++) {
        const i = idx(x + dx, z + k);
        if (g0.water[i]) dry = false;
        const h = g0.height[i];
        if (h < lo) lo = h;
        if (h > hi) hi = h;
      }
    }
    if (!dry) continue;
    const spread = hi - lo;
    if (spread < flattest.spread) flattest = { spread, at: { x, z } };
    if (spread <= 0.25) {
      anchor = { x, z };
      break;
    }
  }
  if (anchor) break;
}
if (!anchor) anchor = flattest.at;
if (!anchor) {
  console.log('no dry block found');
  await b.close();
  process.exit(1);
}
console.log('ground spread over the block:', flattest.spread.toFixed(2), 'm');
const { x: X, z: Z } = anchor;
console.log('anchor', JSON.stringify(anchor));

await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
await page.waitForTimeout(300);

const column = (x) => Array.from({ length: 12 }, (_, i) => ({ x, z: Z + i }));
// Same tiles, opposite drags: the left column is drawn downward, the right one
// upward. Nothing about their geometry differs.
await cmd('One-Way Road', [{ kind: 'buildRoad', tier: ONE_WAY, tiles: column(X) }]);
await cmd('One-Way Road', [
  { kind: 'buildRoad', tier: ONE_WAY, tiles: column(X + 4).reverse() },
]);
await page.waitForTimeout(1500);

const g = await readGrid();
const flows = (x) => [...new Set(column(x).map((t) => g.roadFlow[idx(t.x, t.z)]))];
const report = { drawnSouthward: flows(X), drawnNorthward: flows(X + 4) };
console.log('flows:', JSON.stringify(report));

const failures = [];
if (!(report.drawnSouthward.length === 1 && report.drawnSouthward[0] === FLOW.south))
  failures.push(`the southward column stored ${JSON.stringify(report.drawnSouthward)}, not south`);
if (!(report.drawnNorthward.length === 1 && report.drawnNorthward[0] === FLOW.north))
  failures.push(`the northward column stored ${JSON.stringify(report.drawnNorthward)}, not north`);

await call(() => window.__slimcity.setSpeed(0));
await call(() => window.__slimcity.setDayT(0.5));
const shot = async (name, tx, tz, d, yaw, pitch) => {
  await cam(tx, tz, d, yaw, pitch);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
};
// The two columns while they still disagree: same geometry, opposite arrows.
await shot('drawn-southward', X, Z + 5, 120, 0.0, 1.45);
await shot('drawn-northward', X + 4, Z + 5, 120, 0.0, 1.45);
// One arrow tile of each, close: the head is the wide end, and the two point
// opposite ways down the same axis.
const arrowZ = Z + ((3 - (Z % 3)) % 3) + 3;
await shot('arrow-southward', X, arrowZ, 26, 0.0, 1.5);
await shot('arrow-northward', X + 4, arrowZ, 26, 0.0, 1.5);

// Turning one round is a redraw, not a rebuild: the road stays, the flow flips.
await cmd('One-Way Road', [{ kind: 'buildRoad', tier: ONE_WAY, tiles: column(X) }]);
await cmd('One-Way Road', [{ kind: 'buildRoad', tier: ONE_WAY, tiles: column(X).reverse() }]);
await page.waitForTimeout(1000);
const turned = await readGrid();
const turnedFlows = [...new Set(column(X).map((t) => turned.roadFlow[idx(t.x, t.z)]))];
console.log('after redrawing the first column upward:', JSON.stringify(turnedFlows));
if (!(turnedFlows.length === 1 && turnedFlows[0] === FLOW.north))
  failures.push(`redrawing the column the other way left ${JSON.stringify(turnedFlows)}`);
for (const t of column(X)) {
  if (turned.roadTier[idx(t.x, t.z)] !== ONE_WAY)
    failures.push(`turning the column round took its road away at ${t.x},${t.z}`);
}

if (pageErrors.length > 0) failures.push(`page errors: ${pageErrors.join(' | ')}`);

// Both columns now run north: the left one turned round without being rebuilt.
await shot('turned-northward', X, Z + 5, 120, 0.0, 1.45);

console.log(failures.length === 0 ? 'PASS' : 'FAIL:\n - ' + failures.join('\n - '));
console.log('done ->', out);
await b.close();
