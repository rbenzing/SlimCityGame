/** Class-drawer check (SPEC 29, wave 1): lay the cross-sections the road
 * tool's Lanes, Middle and Speed controls compose — a four-lane with a median
 * down the middle, a local street with a two-way turn lane, and a four-lane
 * narrowed to one lane each way — then read back what every tile carries and
 * shoot them. The ids prove the storage; the picture proves the geometry and
 * the lines the pieces earn.
 *
 * Usage: node tools/drawer-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-drawer';
mkdirSync(out, { recursive: true });

const FOUR_LANE = 7;
const TWO_LANE = 1;
const AVENUE = 2;

// What composeProfile builds from each preset once the drawer is touched: a
// rebuilt core is laid at the class-default 3.5 m lane rather than the
// preset's own width.
const MEDIAN_FOUR = {
  class: 'urban',
  kerbs: true,
  pieces: [
    { kind: 'travel', width: 3.5, flow: 'back' },
    { kind: 'travel', width: 3.5, flow: 'back' },
    { kind: 'median', width: 1.8 },
    { kind: 'travel', width: 3.5, flow: 'fwd' },
    { kind: 'travel', width: 3.5, flow: 'fwd' },
  ],
};
const TURN_TWO = {
  class: 'local',
  pieces: [
    { kind: 'sidewalk', width: 1.875 },
    { kind: 'travel', width: 3.5, flow: 'back' },
    { kind: 'centreTurn', width: 3.5 },
    { kind: 'travel', width: 3.5, flow: 'fwd' },
    { kind: 'sidewalk', width: 1.875 },
  ],
};
const NARROW_FOUR = {
  class: 'urban',
  kerbs: true,
  pieces: [
    { kind: 'travel', width: 3.5, flow: 'back' },
    { kind: 'travel', width: 3.5, flow: 'fwd' },
  ],
};

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
for (let z = 40; z < N - 40; z++) {
  for (let x = 40; x < N - 60; x++) {
    let lo = Infinity;
    let hi = -Infinity;
    let dry = true;
    for (let k = 0; k < 16 && dry; k++) {
      for (let dz = -2; dz <= 8 && dry; dz++) {
        const i = idx(x + k, z + dz);
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

const row = (z) => Array.from({ length: 12 }, (_, i) => ({ x: X + 2 + i, z }));
await cmd('Four-Lane Road', [
  { kind: 'defineRoadProfile', id: 12, profile: MEDIAN_FOUR },
  { kind: 'buildRoad', tier: FOUR_LANE, tiles: row(Z), profile: 12 },
]);
await cmd('Two-Lane Road', [
  { kind: 'defineRoadProfile', id: 13, profile: TURN_TWO },
  { kind: 'buildRoad', tier: TWO_LANE, tiles: row(Z + 3), profile: 13 },
]);
await cmd('Four-Lane Road', [
  { kind: 'defineRoadProfile', id: 14, profile: NARROW_FOUR },
  { kind: 'buildRoad', tier: FOUR_LANE, tiles: row(Z + 6), profile: 14 },
]);
// Replace mode: an avenue rebuilt in place as a quiet two-lane street. The
// plain drag is refused first, the way it always has been.
await cmd('Avenue', [{ kind: 'buildRoad', tier: AVENUE, tiles: row(Z + 9) }]);
await cmd('Two-Lane Road', [{ kind: 'buildRoad', tier: TWO_LANE, tiles: row(Z + 9) }]);
await page.waitForTimeout(600);
const beforeReplace = (await readGrid()).roadTier[idx(X + 4, Z + 9)];
await cmd('Two-Lane Road', [
  { kind: 'buildRoad', tier: TWO_LANE, tiles: row(Z + 9), replace: true },
]);
await page.waitForTimeout(1500);

const g = await readGrid();
const ids = (z) => [...new Set(row(z).map((t) => g.roadProfile[idx(t.x, t.z)]))];
const report = { median: ids(Z), turn: ids(Z + 3), narrow: ids(Z + 6) };
console.log('rows:', JSON.stringify(report));

const failures = [];
const expectId = (name, got, want) => {
  if (!(got.length === 1 && got[0] === want))
    failures.push(`${name} row carries ${JSON.stringify(got)}, not ${want} — the worker refused it`);
};
expectId('median four-lane', report.median, 12);
expectId('turn-lane street', report.turn, 13);
expectId('narrowed four-lane', report.narrow, 14);
if (beforeReplace !== AVENUE)
  failures.push('a plain two-lane drag flattened the avenue without being asked to');
for (const t of row(Z + 9)) {
  if (g.roadTier[idx(t.x, t.z)] !== TWO_LANE)
    failures.push(`replace left tile ${t.x - X} as tier ${g.roadTier[idx(t.x, t.z)]}`);
}
if (pageErrors.length > 0) failures.push(`page errors: ${pageErrors.join(' | ')}`);

await call(() => window.__slimcity.setSpeed(0));
await call(() => window.__slimcity.setDayT(0.5));
const shot = async (name, tx, tz, d, yaw, pitch) => {
  await cam(tx, tz, d, yaw, pitch);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
};
await shot('three-rows', X + 8, Z + 3, 150, 0.0, 1.2);
await shot('median-close', X + 8, Z, 26, 0.0, 1.5);
await shot('turn-lane-close', X + 8, Z + 3, 34, 0.0, 0.9);
await shot('replaced-close', X + 8, Z + 9, 34, 0.0, 0.9);

console.log(failures.length === 0 ? 'PASS' : 'FAIL:\n - ' + failures.join('\n - '));
console.log('done ->', out);
await b.close();
