/** Auxiliary lane check (SPEC 29, wave 5d): the lane a motorway grows beside a
 * slip road, so a driver joining has somewhere to get up to speed and one
 * leaving has somewhere to slow down.
 *
 * A four-lane motorway fills the tile edge to edge and cannot have one —
 * that road is a two-tile corridor. A TWO-lane motorway has the room, so that
 * is what this lays: the feature is real, and where it does not appear the
 * reason is width rather than a bug.
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
const JZ = 12;

// A two-lane motorway running south, with a slip road leaving it eastward at
// (MX, JZ) and a street for the slip road to reach.
// A two-lane motorway: 7.5 m of carriageway, which leaves the tile the room
// for an auxiliary lane. The four-lane preset does not, and that is the point.
const SLIM_MOTORWAY = 13;
await cmd('define', [
  {
    kind: 'defineRoadProfile',
    id: SLIM_MOTORWAY,
    profile: {
      class: 'highway',
      kerbs: true,
      pieces: [
        { kind: 'travel', width: 3.75, flow: 'back' },
        { kind: 'travel', width: 3.75, flow: 'fwd' },
      ],
    },
  },
]);
await cmd('motorway', [
  { kind: 'buildRoad', tier: HIGHWAY, tiles: col(MX, 0, 20), profile: SLIM_MOTORWAY },
]);
await cmd('ramp', [{ kind: 'buildRoad', tier: RAMP, tiles: row(JZ, MX, MX + 7) }]);
await cmd('street', [{ kind: 'buildRoad', tier: TWO_LANE, tiles: col(MX + 8, JZ - 4, JZ + 4) }]);
await page.waitForTimeout(2500);

const along = [];
for (let z = JZ - 8; z <= JZ + 8; z++) along.push({ z, ...(await approach(X + MX, Z + z)) });
console.log(
  'down the motorway:',
  JSON.stringify(along.map((a) => ({ z: a.z, lanes: a.lanes, w: a.width, aux: a.auxiliary }))),
);

const withAux = along.filter((a) => a.auxiliary);
if (withAux.length === 0)
  failures.push('the motorway grew no auxiliary lane at all beside the slip road');
// The slip road leaves eastward, and the east kerb is the northbound driver's,
// so the lane to slow down in runs up to the turn-off from the SOUTH.
const near = along.find((a) => a.z === JZ + 1);
const far = along.find((a) => a.z === JZ + 7);
if (!near?.auxiliary) failures.push('the tile beside the turn-off carries no auxiliary lane');
if (!far?.auxiliary) failures.push('the auxiliary lane does not reach back down the zone');
if (near && !(near.lanes > 2))
  failures.push(`the tile beside the turn-off carries ${near.lanes} lanes, wanted more than 2`);
if (near && far && !(near.width > far.width))
  failures.push(`the lane does not open toward the turn-off: ${far.width} -> ${near.width}`);
// And the plain motorway well away from the interchange is untouched.
const plain = along.find((a) => a.z === JZ - 8);
if (plain && (plain.auxiliary || Math.abs(plain.width - 7.5) > 1e-6))
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
await shot('aux-wide', X + MX + 2, Z + JZ + 2, 150, 0.0, 1.1);
await shot('aux-close', X + MX, Z + JZ + 2, 55, 0.0, 1.2);

await b.close();
if (failures.length > 0) {
  console.log('FAIL');
  for (const f of failures) console.log(' -', f);
  process.exit(1);
}
console.log('PASS');
