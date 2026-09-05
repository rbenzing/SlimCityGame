/** Road composition check (SPEC 29, wave 1): lay a preset two-lane, a two-lane
 * with a parking lane at each kerb, and a two-lane with no footways, then read
 * back from the live grid which profile every tile carries and shoot the three
 * side by side. The ids prove the storage; the picture proves the width.
 *
 * Usage: node tools/profile-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-profiles';
mkdirSync(out, { recursive: true });

const TWO_LANE = 1;
const PARKED = {
  class: 'local',
  pieces: [
    { kind: 'sidewalk', width: 1.875 },
    { kind: 'parking', width: 2.25 },
    { kind: 'travel', width: 3.75, flow: 'back' },
    { kind: 'travel', width: 3.75, flow: 'fwd' },
    { kind: 'parking', width: 2.25 },
    { kind: 'sidewalk', width: 1.875 },
  ],
};
const BARE = {
  class: 'local',
  pieces: [
    { kind: 'travel', width: 3.75, flow: 'back' },
    { kind: 'travel', width: 3.75, flow: 'fwd' },
  ],
};

const b = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
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
let anchor = null;
for (let z = 40; z < N - 40 && !anchor; z++) {
  for (let x = 40; x < N - 60; x++) {
    let ok = true;
    for (let k = 0; k < 16 && ok; k++) {
      for (let dz = -2; dz <= 8 && ok; dz++) {
        const i = idx(x + k, z + dz);
        if (g0.water[i] || Math.abs(g0.height[i]) > 18) ok = false;
      }
    }
    if (ok) anchor = { x, z };
    if (anchor) break;
  }
}
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

const row = (z) => Array.from({ length: 12 }, (_, i) => ({ x: X + 2 + i, z }));
await cmd('Two-Lane Road', [{ kind: 'buildRoad', tier: TWO_LANE, tiles: row(Z) }]);
// Define and lay in one batch, the way the tool does.
await cmd('Two-Lane Road', [
  { kind: 'defineRoadProfile', id: 12, profile: PARKED },
  { kind: 'buildRoad', tier: TWO_LANE, tiles: row(Z + 3), profile: 12 },
]);
await cmd('Two-Lane Road', [
  { kind: 'defineRoadProfile', id: 13, profile: BARE },
  { kind: 'buildRoad', tier: TWO_LANE, tiles: row(Z + 6), profile: 13 },
]);
await page.waitForTimeout(1200);

const g = await readGrid();
const ids = (z) => [...new Set(row(z).map((t) => g.roadProfile[idx(t.x, t.z)]))];
const tiers = (z) => [...new Set(row(z).map((t) => g.roadTier[idx(t.x, t.z)]))];
const report = {
  preset: { profile: ids(Z), tier: tiers(Z) },
  parked: { profile: ids(Z + 3), tier: tiers(Z + 3) },
  bare: { profile: ids(Z + 6), tier: tiers(Z + 6) },
};
console.log('rows:', JSON.stringify(report));

const failures = [];
if (!(report.preset.profile.length === 1 && report.preset.profile[0] === 1))
  failures.push('preset row does not carry profile 1');
if (!(report.parked.profile.length === 1 && report.parked.profile[0] === 12))
  failures.push('parked row does not carry profile 12');
if (!(report.bare.profile.length === 1 && report.bare.profile[0] === 13))
  failures.push('bare row does not carry profile 13');
for (const k of ['preset', 'parked', 'bare']) {
  if (!(report[k].tier.length === 1 && report[k].tier[0] === TWO_LANE))
    failures.push(`${k} row is not nearest the two-lane tier`);
}

// Lamps stand at the kerb of the road they light. On the parked row that kerb
// is 6 m out (12 m of carriageway), on the preset 3.75 m — a pole placed for
// the preset would stand in the parking lane.
const poles = await call(() => window.__slimcity.readLampPoles());
const rowPoles = (z) =>
  poles
    .filter((p) => Math.abs(p.z - (z + 0.5) * 16) < 8 && p.x > (X + 2) * 16 && p.x < (X + 14) * 16)
    .map((p) => Math.abs(p.z - (z + 0.5) * 16));
const presetPoles = rowPoles(Z);
const parkedPoles = rowPoles(Z + 3);
console.log(
  'lamp offsets:',
  JSON.stringify({
    preset: presetPoles.map((v) => v.toFixed(2)),
    parked: parkedPoles.map((v) => v.toFixed(2)),
  }),
);
if (presetPoles.length === 0 || parkedPoles.length === 0) failures.push('no lamps found to measure');
if (presetPoles.some((v) => v < 3.75 || v > 3.75 + 1.875)) failures.push('preset lamps off the kerb');
if (parkedPoles.some((v) => v < 6.0 || v > 6.0 + 1.875)) failures.push('parked-row lamps not at the 6 m kerb');

await cmd('Speed', []);
await call(() => window.__slimcity.setSpeed(0));
await call(() => window.__slimcity.setDayT(0.5));
const shot = async (name, tx, tz, d, yaw, pitch) => {
  await cam(tx, tz, d, yaw, pitch);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
};
await shot('three-rows', X + 8, Z + 3, 95, 0.0, 1.2);
await shot('parked-close', X + 8, Z + 3, 40, 0.4, 0.55);

console.log(failures.length === 0 ? 'PASS' : 'FAIL:\n - ' + failures.join('\n - '));
console.log('done ->', out);
await b.close();
process.exit(failures.length === 0 ? 0 : 1);
