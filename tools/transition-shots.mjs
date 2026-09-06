/** Road transition check (SPEC 29, wave 1): lay runs that change width
 * mid-street — a four-lane continuing as a two-lane, an avenue continuing as a
 * two-lane, and a four-lane spliced into the middle of a two-lane so it
 * narrows at both ends — then read back what every tile carries and shoot the
 * seams. The tiers prove the runs really are one connected street; the picture
 * proves the kerb bends in over the tile instead of stepping at the seam.
 *
 * Usage: node tools/transition-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-transitions';
mkdirSync(out, { recursive: true });

const TWO_LANE = 1;
const AVENUE = 2;
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
const cam = (tx, tz, d, yaw, pitch) =>
  call(
    ([x, z, dd, yy, pp]) => window.__slimcity.setCamera((x + 0.5) * 16, (z + 0.5) * 16, dd, yy, pp),
    [tx, tz, d, yaw, pitch],
  );

const g0 = await readGrid();
const N = g0.size;
const idx = (x, z) => z * N + x;
// A LEVEL block: roads auto-flatten the ground per tile, so a slope would put
// a terrain step between two separately laid runs and confuse the seam with it.
let anchor = null;
let flattest = { spread: Infinity, at: null };
for (let z = 40; z < N - 40; z++) {
  for (let x = 40; x < N - 60; x++) {
    let lo = Infinity;
    let hi = -Infinity;
    let dry = true;
    for (let k = 0; k < 18 && dry; k++) {
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
console.log('ground spread over the block:', flattest.spread.toFixed(2), 'm');
if (!anchor) {
  console.log('no dry block found');
  await b.close();
  process.exit(1);
}
const { x: X, z: Z } = anchor;
console.log('anchor', JSON.stringify(anchor));

await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
await page.waitForTimeout(300);

const span = (z, from, to) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ x: X + from + i, z }));

// Row 1: a four-lane for the first half, a two-lane for the second — one seam.
await cmd('Four-Lane Road', [{ kind: 'buildRoad', tier: FOUR_LANE, tiles: span(Z, 1, 7) }]);
await cmd('Two-Lane Road', [{ kind: 'buildRoad', tier: TWO_LANE, tiles: span(Z, 8, 15) }]);
// Row 2: an avenue narrowing to a two-lane — a median run meeting a plain one.
await cmd('Avenue', [{ kind: 'buildRoad', tier: AVENUE, tiles: span(Z + 3, 1, 7) }]);
await cmd('Two-Lane Road', [{ kind: 'buildRoad', tier: TWO_LANE, tiles: span(Z + 3, 8, 15) }]);
// Row 3: a two-lane street with a four-lane stretch spliced into the middle,
// so the wide tiles at each end of the stretch narrow at BOTH ends.
await cmd('Two-Lane Road', [{ kind: 'buildRoad', tier: TWO_LANE, tiles: span(Z + 6, 1, 15) }]);
await cmd('Four-Lane Road', [{ kind: 'buildRoad', tier: FOUR_LANE, tiles: span(Z + 6, 7, 9) }]);
await page.waitForTimeout(1500);

const g = await readGrid();
const tiersAlong = (z, from, to) => span(z, from, to).map((t) => g.roadTier[idx(t.x, t.z)]);
const rows = {
  fourToTwo: tiersAlong(Z, 1, 15),
  avenueToTwo: tiersAlong(Z + 3, 1, 15),
  spliced: tiersAlong(Z + 6, 1, 15),
};
console.log('rows:', JSON.stringify(rows));

const failures = [];
const expectRow = (name, got, want) => {
  if (got.length !== want.length || got.some((v, i) => v !== want[i]))
    failures.push(`${name}: ${JSON.stringify(got)} is not ${JSON.stringify(want)}`);
};
expectRow('four -> two', rows.fourToTwo, [...Array(7).fill(FOUR_LANE), ...Array(8).fill(TWO_LANE)]);
expectRow('avenue -> two', rows.avenueToTwo, [
  ...Array(7).fill(AVENUE),
  ...Array(8).fill(TWO_LANE),
]);
expectRow('two -> four -> two', rows.spliced, [
  ...Array(6).fill(TWO_LANE),
  ...Array(3).fill(FOUR_LANE),
  ...Array(6).fill(TWO_LANE),
]);

// Every inner tile of every row has road either side of it, so each seam tile
// really is a straight continuation of one street and not two dead ends meeting.
for (const [name, z] of [
  ['four -> two', Z],
  ['avenue -> two', Z + 3],
  ['two -> four -> two', Z + 6],
]) {
  for (const t of span(z, 2, 14)) {
    const west = g.roadTier[idx(t.x - 1, t.z)];
    const east = g.roadTier[idx(t.x + 1, t.z)];
    if (!west || !east)
      failures.push(`${name}: tile ${t.x - X} is not a through-run (${west} | ${east})`);
  }
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
await shot('three-rows', X + 8, Z + 3, 110, 0.0, 1.2);
await shot('seam-close', X + 8, Z, 34, 0.0, 0.5);
await shot('spliced-close', X + 8, Z + 6, 40, 0.35, 0.5);

console.log(failures.length === 0 ? 'PASS' : 'FAIL:\n - ' + failures.join('\n - '));
console.log('done ->', out);
await b.close();
