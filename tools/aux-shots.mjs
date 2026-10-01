/** Auxiliary lane check: the lane a motorway grows beside a slip road, so a
 * driver joining has somewhere to get up to speed and one leaving has
 * somewhere to slow down.
 *
 * This lays the three-lane preset motorway running south and an off-ramp
 * leaving it the way the world allows one to: beside it, running the same way,
 * from the tile it diverges at, then bending away west, the southbound
 * driver's right, to a street.
 *
 * Usage: node tools/aux-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-aux';
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
const cam = tileCamera(page);

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
await page.waitForTimeout(300);

const col = (x, a, c) => Array.from({ length: c - a + 1 }, (_, i) => ({ x: X + x, z: Z + a + i }));
const row = (z, a, c) => Array.from({ length: c - a + 1 }, (_, i) => ({ x: X + a + i, z: Z + z }));

const failures = [];
const MX = 10;
const JZ = 16;

// The preset motorway running south down column MX. The off-ramp diverges at
// (MX - 1, JZ): it runs beside the motorway, south, for four tiles, then bends
// west to a street.
await cmd('motorway', [{ kind: 'buildRoad', tier: HIGHWAY, tiles: col(MX, 0, 30) }]);
await cmd('ramp', [
  {
    kind: 'buildRoad',
    tier: RAMP,
    tiles: [...col(MX - 1, JZ, JZ + 3), ...row(JZ + 3, MX - 6, MX - 2).reverse()],
  },
]);
await cmd('street', [{ kind: 'buildRoad', tier: TWO_LANE, tiles: col(MX - 7, JZ - 2, JZ + 8) }]);
await page.waitForTimeout(2500);

const g = await readGrid();
if (g.roadTier[idx(X + MX - 1, Z + JZ)] !== RAMP) failures.push('the off-ramp was not laid');

const along = [];
for (let z = JZ - 14; z <= JZ + 6; z++) along.push({ z, ...(await approach(X + MX, Z + z)) });
console.log(
  'down the motorway:',
  JSON.stringify(along.map((a) => ({ z: a.z, lanes: a.lanes, w: a.width, aux: a.auxiliary }))),
);

const withAux = along.filter((a) => a.auxiliary);
if (withAux.length === 0)
  failures.push('the motorway grew no auxiliary lane at all beside the slip road');
// The ramp leaves the southbound motorway at JZ, so the lane to slow down in
// runs up to the turn-off from the NORTH, upstream of it.
const near = along.find((a) => a.z === JZ - 1);
const far = along.find((a) => a.z === JZ - 7);
const plain = along.find((a) => a.z === JZ - 14);
if (!near?.auxiliary) failures.push('the tile before the turn-off carries no auxiliary lane');
if (!far?.auxiliary) failures.push('the auxiliary lane does not reach back up the zone');
if (near && plain && !(near.lanes > plain.lanes))
  failures.push(
    `the tile before the turn-off carries ${near.lanes} lanes, no more than ${plain.lanes}`,
  );
if (near && far && !(near.width > far.width))
  failures.push(`the lane does not open toward the turn-off: ${far.width} -> ${near.width}`);
// And the plain motorway well away from the interchange is untouched.
const presetWidth = along.find((a) => a.z === JZ - 13)?.width;
if (plain && (plain.auxiliary || Math.abs(plain.width - presetWidth) > 1e-6))
  failures.push(
    `the motorway away from the interchange is ${plain.width} m with aux ${JSON.stringify(plain.auxiliary)}`,
  );

if (pageErrors.length > 0) failures.push(`page errors: ${pageErrors.join(' | ')}`);

const shot = async (name, tx, tz, d, yaw, pitch) => {
  await cam(tx, tz, d, yaw, pitch);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
};
await shot('aux-wide', X + MX - 2, Z + JZ - 2, 150, 0.0, 1.1);
await shot('aux-close', X + MX, Z + JZ - 2, 55, 0.0, 1.2);

await b.close();
if (failures.length > 0) {
  console.log('FAIL');
  for (const f of failures) console.log(' -', f);
  process.exit(1);
}
console.log('PASS');
