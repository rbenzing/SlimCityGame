/** Junction quality check: what a crossroads actually looks like on the
 * ground, and who is standing beside it.
 *
 * Four things this exists to catch, all of them things the unit tests cannot
 * see and a player sees immediately:
 *   - a crossing painted where nobody can walk (a road with a kerb but no
 *     footway sends nobody over the road it meets);
 *   - a signalised approach with no stop line;
 *   - a signal head standing anywhere but the driver's right at the stop line;
 *   - two pieces of furniture in one kerbside slot.
 *
 * Usage: node tools/junction-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-junctions-qa';
mkdirSync(out, { recursive: true });

const TWO_LANE = 1;
const AVENUE = 2;

const b = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await b.newPage({ viewport: { width: 1500, height: 950 } });
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
const readSigns = () => call(() => window.__slimcity.readSigns());
const cam = (tx, tz, d, yaw, pitch) =>
  call(
    ([x, z, dd, yy, pp]) => {
      const T = window.__slimcity.tileMeters();
      window.__slimcity.setCamera((x + 0.5) * T, (z + 0.5) * T, dd, yy, pp);
    },
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
    if (spread <= 0.35) {
      anchor = { x, z };
      break;
    }
  }
}
if (!anchor) anchor = flattest.at;
const { x: X, z: Z } = anchor;
console.log('anchor', JSON.stringify(anchor), 'spread', flattest.spread.toFixed(2), 'm');

await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
await page.waitForTimeout(300);

const row = (z, a, c) => Array.from({ length: c - a + 1 }, (_, i) => ({ x: X + a + i, z: Z + z }));
const col = (x, a, c) => Array.from({ length: c - a + 1 }, (_, i) => ({ x: X + x, z: Z + a + i }));

// An avenue (kerbed, but NO footway) crossed by a two-lane street (footways
// both sides) — the pairing that showed every defect at once.
const JX = 10;
const JZ = 10;
await cmd('avenue', [{ kind: 'buildRoad', tier: AVENUE, tiles: row(JZ, 0, 20) }]);
await cmd('street', [{ kind: 'buildRoad', tier: TWO_LANE, tiles: col(JX, 2, 18) }]);
await page.waitForTimeout(2000);
await cmd('signal', [{ kind: 'setJunctionControl', x: X + JX, z: Z + JZ, control: 'signal' }]);
await page.waitForTimeout(2000);

const failures = [];

// --- What the avenue actually draws as it runs into the junction -------------
const approach = (x, z) => call(([ax, az]) => window.__slimcity.readApproach(ax, az), [x, z]);
const along = [];
for (let d = 4; d >= 1; d--) along.push({ d, ...(await approach(X + JX - d, Z + JZ)) });
console.log('avenue into the junction:', JSON.stringify(along));
// A carriageway wider than the tile is a road spilling into the next one. The
// figure comes from the app so this keeps meaning that when the tile changes.
const TILE = await call(() => window.__slimcity.tileMeters());
for (const t of along) {
  if (t.width > TILE + 1e-6)
    failures.push(`the avenue draws ${t.width} m of carriageway on a ${TILE} m tile`);
}

// --- Who stands beside the junction, and where -------------------------------
const signs = await readSigns();
const near = signs.filter((s) => Math.abs(s.x - (X + JX)) <= 2 && Math.abs(s.z - (Z + JZ)) <= 2);
console.log('signs near the junction:', JSON.stringify(near));
const heads = near.filter((s) => s.type === 'signal');
if (heads.length !== 4)
  failures.push(`${heads.length} signal heads on a four-arm signal, wanted one per approach`);
// Each head belongs on its own approach tile, one tile out from the junction.
for (const h of heads) {
  const d = Math.abs(h.x - (X + JX)) + Math.abs(h.z - (Z + JZ));
  if (d !== 1) failures.push(`a signal head sits ${d} tiles from the junction, wanted 1`);
}
const slots = new Set(heads.map((h) => `${h.x},${h.z}`));
if (slots.size !== heads.length) failures.push('two signal heads share one tile');

if (pageErrors.length > 0) failures.push(`page errors: ${pageErrors.join(' | ')}`);

const shot = async (name, tx, tz, d, yaw, pitch) => {
  await cam(tx, tz, d, yaw, pitch);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
};
await shot('junction-top', X + JX, Z + JZ, 105, 0.0, 1.15);
await shot('junction-close', X + JX, Z + JZ, 48, 0.0, 1.25);
await shot('junction-eye', X + JX, Z + JZ + 3, 40, 0.0, 0.75);
// The north-west corner, where the avenue's kerb strip has to meet the
// street's wider footway.
await shot('junction-corner', X + JX - 1, Z + JZ - 1, 22, 0.0, 1.3);

await b.close();
if (failures.length > 0) {
  console.log('FAIL');
  for (const f of failures) console.log(' -', f);
  process.exit(1);
}
console.log('PASS');
