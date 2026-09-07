/** Road-furniture audit: the things a player notices and a read-back does not.
 *
 * Lays a dead-end stub, a controlled crossroads, a street with kerb parking
 * and one with it taken out, then shoots each close enough to see which way a
 * board faces, how near the junction it stands, and whether anything is
 * sitting in the road instead of beside it.
 *
 * Usage: node tools/furniture-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-furniture';
mkdirSync(out, { recursive: true });

const TWO_LANE = 1;
const AVENUE = 2;

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
const signs = () => call(() => window.__slimcity.readSigns());
const cam = (tx, tz, d, yaw, pitch) =>
  call(
    ([x, z, dd, yy, pp]) => window.__slimcity.setCamera((x + 0.5) * 16, (z + 0.5) * 16, dd, yy, pp),
    [tx, tz, d, yaw, pitch],
  );

const g0 = await readGrid();
const N = g0.size;
const idx = (x, z) => z * N + x;

const SPAN = 34;
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
    if (spread <= 0.35) {
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

const row = (z, a, c) => Array.from({ length: c - a + 1 }, (_, i) => ({ x: X + a + i, z: Z + z }));
const col = (x, a, c) => Array.from({ length: c - a + 1 }, (_, i) => ({ x: X + x, z: Z + a + i }));

// An east-west dead-end stub: the case in the report, where a board stood
// edge-on to the driver.
await cmd('stub', [{ kind: 'buildRoad', tier: TWO_LANE, tiles: row(4, 2, 9) }]);
// A controlled crossroads: an avenue crossed by a street, so the boards are
// warranted and their setback from the box can be judged.
await cmd('avenue', [{ kind: 'buildRoad', tier: AVENUE, tiles: row(16, 0, 26) }]);
await cmd('street', [{ kind: 'buildRoad', tier: TWO_LANE, tiles: col(13, 10, 24) }]);
// A street with kerb parking, and the same street with it taken out.
const PARKED = 30;
const BARE = 31;
const walk = { kind: 'sidewalk', width: 1.875 };
const lanes = [
  { kind: 'travel', width: 3.75, flow: 'back' },
  { kind: 'travel', width: 3.75, flow: 'fwd' },
];
await cmd('define', [
  {
    kind: 'defineRoadProfile',
    id: PARKED,
    profile: {
      class: 'local',
      pieces: [walk, { kind: 'parking', width: 2.25 }, ...lanes, { kind: 'parking', width: 2.25 }, walk],
    },
  },
  { kind: 'defineRoadProfile', id: BARE, profile: { class: 'local', pieces: [walk, ...lanes, walk] } },
]);
await cmd('parked', [
  { kind: 'buildRoad', tier: TWO_LANE, tiles: row(28, 0, 24), profile: PARKED },
]);
await cmd('bare', [{ kind: 'buildRoad', tier: TWO_LANE, tiles: row(31, 0, 24), profile: BARE }]);
await page.waitForTimeout(3500);

const failures = [];
const all = await signs();
console.log('signs laid:', all.length);

// Control boards must stand close to the box they hold, not a tile back.
const near = all.filter((s) => Math.abs(s.x - (X + 13)) <= 2 && Math.abs(s.z - (Z + 16)) <= 2);
console.log('boards at the crossroads:', JSON.stringify(near.map((s) => `${s.type}@${s.x},${s.z}`)));
if (near.length === 0) failures.push('the controlled crossroads warranted no boards at all');

const shots = [
  ['stub', X + 3, Z + 4, 26, 0.0, 0.35],
  ['stub-oblique', X + 4, Z + 4, 34, 0.9, 0.5],
  ['crossroads', X + 13, Z + 16, 52, 0.6, 0.7],
  ['crossroads-eye', X + 13, Z + 19, 30, 0.0, 0.25],
  ['parking-vs-none', X + 8, Z + 29, 70, 0.5, 0.6],
  ['kerb-close', X + 6, Z + 28, 22, 0.4, 0.3],
];
for (const [name, tx, tz, d, yaw, pitch] of shots) {
  await cam(tx, tz, d, yaw, pitch);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
}

await b.close();
for (const e of pageErrors) failures.push(`page error: ${e}`);
if (failures.length > 0) {
  console.log('FAIL');
  for (const f of failures) console.log(' -', f);
  process.exitCode = 1;
} else {
  console.log('PASS');
}
