/** Ramp check (SPEC 29, wave 5a): the slip road is a road the player can lay.
 * Draw one beside the motorway it serves, read back the cross-section it
 * carries and the direction it runs, and shoot it.
 *
 * The read-back is the point: a screenshot shows asphalt but not how many
 * lanes wide it is, nor which way its one lane goes.
 *
 * Usage: node tools/ramp-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-ramps';
mkdirSync(out, { recursive: true });

const HIGHWAY = 3;
const RAMP = 12;
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

const SPAN = 24;
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
if (!anchor) {
  console.log('no dry block found');
  await b.close();
  process.exit(1);
}
const { x: X, z: Z } = anchor;
console.log('anchor', JSON.stringify(anchor), 'spread', flattest.spread.toFixed(2), 'm');

await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
await page.waitForTimeout(300);

const row = (z, from, to) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ x: X + from + i, z: Z + z }));
const col = (x, from, to) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ x: X + x, z: Z + from + i }));

// A motorway running east-west, a street to the south, and a ramp joining
// them: the shape every interchange is built out of.
await cmd('motorway', [{ kind: 'buildRoad', tier: HIGHWAY, tiles: row(4, 0, 18) }]);
await cmd('street', [{ kind: 'buildRoad', tier: TWO_LANE, tiles: row(14, 0, 18) }]);
await cmd('ramp', [{ kind: 'buildRoad', tier: RAMP, tiles: col(9, 5, 13) }]);
await page.waitForTimeout(2500);

const failures = [];
const g = await readGrid();
const laid = [];
for (let d = 6; d <= 12; d++) laid.push(g.roadTier[idx(X + 9, Z + d)]);
console.log('ramp tiles:', JSON.stringify(laid));
if (!laid.every((t) => t === RAMP)) failures.push(`the ramp did not lay as tier ${RAMP}: ${laid}`);

const mid = await approach(X + 9, Z + 9);
console.log('mid ramp:', JSON.stringify(mid));
if (!mid) failures.push('the ramp carries no cross-section at all');
if (mid && mid.lanes !== 1) failures.push(`the ramp draws ${mid.lanes} lanes, wanted 1`);
if (mid && Math.abs(mid.width - 7.8) > 1e-6)
  failures.push(`the ramp is ${mid.width} m across, wanted 7.8`);

// It runs the way it was drawn — a ramp is one-way, so the stored direction is
// the whole of its meaning.
const flow = g.roadFlow ? g.roadFlow[idx(X + 9, Z + 9)] & 7 : null;
console.log('stored flow:', flow);
if (flow !== 3) failures.push(`the ramp runs ${flow}, wanted 3 (south, the way it was drawn)`);

// The two ends of a slip road are not the same kind of place. Where it meets
// the motorway nothing holds anybody — that end is a merge. Where it meets the
// street it is a ramp TERMINAL, and a terminal is what an interchange is
// signalised at.
const controlAt = (x, z) =>
  call(
    ([cx, cz]) => (window.__slimcity.readJunctions() ?? []).find((j) => j.x === cx && j.z === cz),
    [x, z],
  );
const atMotorway = await controlAt(X + 9, Z + 4);
const atStreet = await controlAt(X + 9, Z + 14);
console.log('motorway end:', JSON.stringify(atMotorway), 'street end:', JSON.stringify(atStreet));
if (atMotorway && atMotorway.control !== 'none')
  failures.push(
    `the motorway end is controlled (${atMotorway.control}); traffic is never stopped on a motorway`,
  );
if (!atStreet || atStreet.control === 'none')
  failures.push('the ramp terminal on the street takes no control at all');

if (pageErrors.length > 0) failures.push(`page errors: ${pageErrors.join(' | ')}`);

const shot = async (name, tx, tz, d, yaw, pitch) => {
  await cam(tx, tz, d, yaw, pitch);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
};
await shot('ramp-junction', X + 9, Z + 5, 90, 0.6, 0.95);
await shot('ramp-along', X + 9, Z + 9, 120, 0.2, 1.05);
await shot('ramp-wide', X + 9, Z + 9, 260, 0.7, 1.0);

await b.close();
if (failures.length > 0) {
  console.log('FAIL');
  for (const f of failures) console.log(' -', f);
  process.exit(1);
}
console.log('PASS');
