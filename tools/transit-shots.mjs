/** Transit-variant check: a bus lane and a tramway are options on a road, not
 * roads of their own. Drives the real drawer — the Roads list must no longer
 * offer Bus Lane / Bike Lane / Tram Track as cards, and the road tool's
 * options row must offer Bus and Tram where the class carries them and nowhere
 * else — then lays what those controls compose and shoots the result. The DOM
 * proves the controls; the picture proves the road they build.
 *
 * Usage: node tools/transit-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-transit';
mkdirSync(out, { recursive: true });

const TWO_LANE = 1;
const AVENUE = 2;
const FOUR_LANE = 7;

// What composeProfile builds once the new controls are touched: a small street
// with a bus lane on one side, an avenue with a twin-track tram reservation,
// and a four-lane traded down to two to afford a bus lane each way.
const BUS_ONE_SIDE = {
  class: 'local',
  kerbs: true,
  pieces: [
    { kind: 'sidewalk', width: 1.875 },
    { kind: 'travel', width: 3.05, flow: 'back' },
    { kind: 'travel', width: 3.05, flow: 'fwd' },
    { kind: 'bus', width: 3.5, flow: 'fwd' },
    { kind: 'sidewalk', width: 1.875 },
  ],
};
const TRAM_RESERVED = {
  class: 'arterial',
  kerbs: true,
  pieces: [
    { kind: 'sidewalk', width: 1.875 },
    { kind: 'travel', width: 3.6, flow: 'back' },
    { kind: 'tram', width: 3.5 },
    { kind: 'tram', width: 3.5 },
    { kind: 'travel', width: 3.6, flow: 'fwd' },
    { kind: 'sidewalk', width: 1.875 },
  ],
};
const BUS_BOTH = {
  class: 'urban',
  kerbs: true,
  pieces: [
    { kind: 'sidewalk', width: 1.875 },
    { kind: 'bus', width: 3.5, flow: 'back' },
    { kind: 'travel', width: 3.35, flow: 'back' },
    { kind: 'travel', width: 3.35, flow: 'fwd' },
    { kind: 'bus', width: 3.5, flow: 'fwd' },
    { kind: 'sidewalk', width: 1.875 },
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
    // Every road unlocked, so a card locked behind a milestone cannot read as
    // a card that was retired.
    localStorage.setItem('slimcity.settings', JSON.stringify({ sandboxUnlockAll: true }));
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

const failures = [];

// Every road unlocked, so a locked card cannot read as a retired one.
await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
await page.waitForTimeout(500);

// ---------------------------------------------------------------------------
// The drawer: what it offers, and what it no longer does.
// ---------------------------------------------------------------------------
await page.getByRole('button', { name: 'Roads' }).click();
await page.waitForTimeout(400);

const tabNames = await page.getByRole('tab').allTextContents();
console.log('road sub-tabs:', JSON.stringify(tabNames));
for (const gone of ['Bus Lane', 'Bike Lane', 'Tram Track']) {
  for (const tab of tabNames) {
    await page.getByRole('tab', { name: tab }).click();
    await page.waitForTimeout(150);
    if ((await page.getByText(gone, { exact: true }).count()) > 0)
      failures.push(`the ${tab} tab still offers "${gone}" as a road of its own`);
  }
}

/** The options row for a road tool, by the card that selects it. */
const pickRoad = async (tab, card) => {
  await page.getByRole('tab', { name: tab }).click();
  await page.waitForTimeout(150);
  // By role, because a card and a sub-tab can carry the same word (Highway).
  await page.getByRole('button', { name: new RegExp(`^${card}\\b`) }).click();
  await page.waitForTimeout(250);
};
const hasGroup = async (name) => (await page.getByRole('group', { name }).count()) > 0;

await pickRoad('Small', 'Two-Lane Road');
if (!(await hasGroup('Bus lanes'))) failures.push('a two-lane street is not offered a bus lane');
if (!(await hasGroup('Tramway'))) failures.push('a two-lane street is not offered a tramway');

// One side fits its lane range; both sides is a four-lane road, and the
// readout has to say which rule refused it rather than laying it anyway.
await page.getByRole('group', { name: 'Bus lanes' }).getByText('Right', { exact: true }).click();
await page.waitForTimeout(250);
const oneSide = await page.getByLabel('Profile width').getAttribute('title');
const oneSideText = await page.getByLabel('Profile width').textContent();
console.log('two-lane + one bus lane:', oneSideText, '|', oneSide);
if (oneSide !== 'Fits the tile')
  failures.push(`a two-lane street with one bus lane reads "${oneSide}"`);
await page.screenshot({ path: `${out}/options-two-lane-bus.png` });

await page.getByRole('group', { name: 'Bus lanes' }).getByText('Both', { exact: true }).click();
await page.waitForTimeout(250);
const bothSides = await page.getByLabel('Profile width').getAttribute('title');
console.log('two-lane + two bus lanes:', bothSides);
if (!/runs 2 to 3 lanes/.test(bothSides ?? ''))
  failures.push(`two bus lanes on a two-lane street reads "${bothSides}", not the lane-range rule`);

await pickRoad('Small', 'Alley');
if (await hasGroup('Bus lanes')) failures.push('an alley is offered a bus lane');
if (await hasGroup('Tramway')) failures.push('an alley is offered a tramway');

await pickRoad('Highway', 'Highway');
if (!(await hasGroup('Bus lanes'))) failures.push('a motorway is not offered a reserved lane');
if (await hasGroup('Tramway')) failures.push('a motorway is offered a tramway');

await pickRoad('Medium', 'Avenue');
if (!(await hasGroup('Bus lanes'))) failures.push('an avenue is not offered a bus lane');
if (!(await hasGroup('Tramway'))) failures.push('an avenue is not offered a tramway');
await page.getByRole('group', { name: 'Tramway' }).getByText('Reserved', { exact: true }).click();
await page.waitForTimeout(250);
await page.screenshot({ path: `${out}/options-avenue-tram.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// ---------------------------------------------------------------------------
// The ground: lay what those controls compose and look at it.
// ---------------------------------------------------------------------------
const g0 = await readGrid();
const N = g0.size;
const idx = (x, z) => z * N + x;
let anchor = null;
let flattest = { spread: Infinity, at: null };
for (let z = 40; z < N - 40 && !anchor; z++) {
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
}
if (!anchor) anchor = flattest.at;
if (!anchor) {
  console.log('no dry block found');
  await b.close();
  process.exit(1);
}
const { x: X, z: Z } = anchor;
console.log('anchor', JSON.stringify(anchor), 'spread', flattest.spread.toFixed(2), 'm');

const row = (z) => Array.from({ length: 12 }, (_, i) => ({ x: X + 2 + i, z }));
await cmd('Two-Lane Road', [
  { kind: 'defineRoadProfile', id: 20, profile: BUS_ONE_SIDE },
  { kind: 'buildRoad', tier: TWO_LANE, tiles: row(Z), profile: 20 },
]);
await cmd('Avenue', [
  { kind: 'defineRoadProfile', id: 21, profile: TRAM_RESERVED },
  { kind: 'buildRoad', tier: AVENUE, tiles: row(Z + 4), profile: 21 },
]);
await cmd('Four-Lane Road', [
  { kind: 'defineRoadProfile', id: 22, profile: BUS_BOTH },
  { kind: 'buildRoad', tier: FOUR_LANE, tiles: row(Z + 8), profile: 22 },
]);
await page.waitForTimeout(1500);

const g = await readGrid();
const ids = (z) => [...new Set(row(z).map((t) => g.roadProfile[idx(t.x, t.z)]))];
const expectId = (name, z, want) => {
  const got = ids(z);
  if (!(got.length === 1 && got[0] === want))
    failures.push(`${name} carries ${JSON.stringify(got)}, not ${want} — the worker refused it`);
};
expectId('two-lane with a kerbside bus lane', Z, 20);
expectId('avenue with a tram reservation', Z + 4, 21);
expectId('four-lane traded down for two bus lanes', Z + 8, 22);

// The retired tiers still lay, because every save built before holds them.
// Tier 10 is the mixed-running tram street: rails in the running lanes.
await cmd('Bus Lane (retired tier)', [{ kind: 'buildRoad', tier: 8, tiles: row(Z + 12) }]);
await cmd('Tram Track (retired tier)', [{ kind: 'buildRoad', tier: 10, tiles: row(Z + 16) }]);
await page.waitForTimeout(1000);
const g2 = await readGrid();
for (const [tier, z] of [
  [8, Z + 12],
  [10, Z + 16],
]) {
  const got = g2.roadTier[idx(X + 6, z)];
  if (got !== tier) failures.push(`a saved tier-${tier} road no longer lays (got tier ${got})`);
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
await shot('three-variants', X + 8, Z + 4, 150, 0.0, 1.2);
await shot('bus-kerbside-close', X + 8, Z, 30, 0.0, 0.9);
await shot('tram-reservation-close', X + 8, Z + 4, 34, 0.0, 0.9);
await shot('bus-both-close', X + 8, Z + 8, 34, 0.0, 0.9);
await shot('tram-mixed-close', X + 8, Z + 16, 34, 0.0, 0.9);

console.log(failures.length === 0 ? 'PASS' : 'FAIL:\n - ' + failures.join('\n - '));
console.log('done ->', out);
await b.close();
