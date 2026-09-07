/** Where one road becomes another: does the paint flow through the change, or
 * step sideways and stop dead?
 *
 * Lays a matrix of straight runs, each half one road and half another, and
 * photographs every seam from directly overhead. A width change is the case
 * the player sees most and the one that reads worst when it is wrong, so the
 * matrix is deliberately every pairing of the common paved tiers rather than
 * the single one that was reported.
 *
 * Usage: node tools/transition-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-transitions';
mkdirSync(out, { recursive: true });

const TIER = { TwoLane: 1, Avenue: 2, Highway: 3, Gravel: 4, OneWay: 6, FourLane: 7 };

// Each case is one straight north-south run: `from` for its first half,
// `to` for its second. The seam is where the paint has to flow through.
const CASES = [
  ['avenue-to-twolane', TIER.Avenue, TIER.TwoLane],
  ['fourlane-to-twolane', TIER.FourLane, TIER.TwoLane],
  ['highway-to-avenue', TIER.Highway, TIER.Avenue],
  ['fourlane-to-avenue', TIER.FourLane, TIER.Avenue],
  ['avenue-to-oneway', TIER.Avenue, TIER.OneWay],
  ['twolane-to-gravel', TIER.TwoLane, TIER.Gravel],
];

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

// A flat dry block wide enough for every case side by side.
const SPAN_X = CASES.length * 6 + 4;
const SPAN_Z = 26;
let anchor = null;
let flattest = { spread: Infinity, at: null };
for (let z = 40; z < N - SPAN_Z - 40 && !anchor; z++) {
  for (let x = 40; x < N - SPAN_X - 40; x++) {
    let lo = Infinity;
    let hi = -Infinity;
    let dry = true;
    for (let dz = 0; dz < SPAN_Z && dry; dz += 2) {
      for (let dx = 0; dx < SPAN_X && dry; dx += 2) {
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
    if (spread <= 0.35) {
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

const col = (x, a, c) => Array.from({ length: c - a + 1 }, (_, i) => ({ x: X + x, z: Z + a + i }));
const SEAM = 12;

let lane = 2;
const placed = [];
for (const [name, from, to] of CASES) {
  const x = lane;
  await cmd(`${name} a`, [{ kind: 'buildRoad', tier: from, tiles: col(x, 2, SEAM - 1) }]);
  await cmd(`${name} b`, [{ kind: 'buildRoad', tier: to, tiles: col(x, SEAM, 22) }]);
  placed.push({ name, x });
  lane += 6;
}
await page.waitForTimeout(3000);

// What each side of the seam believes its cross-section is — a step in the
// paint is a step between these two numbers.
for (const { name, x } of placed) {
  const before = await approach(X + x, Z + SEAM - 1);
  const after = await approach(X + x, Z + SEAM);
  console.log(
    name,
    JSON.stringify({
      before: before && { lanes: before.lanes, width: before.width, taper: before.taper },
      after: after && { lanes: after.lanes, width: after.width },
    }),
  );
}

for (const { name, x } of placed) {
  // The seam itself, and the whole length the change is spread over — a taper
  // that reads fine tile by tile can still be a staircase seen end to end.
  await cam(X + x, Z + SEAM - 0.5, 30, 0, 1.5);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/${name}.png` });
  await cam(X + x, Z + SEAM - 2, 72, 0, 1.5);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/${name}-run.png` });
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
