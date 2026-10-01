/** Sound walls in a real browser: a walled motorway beside an unwalled twin;
 * the gap a slip road opens; a six-lane
 * corridor's outer walls; a wall carried along a bridge; and the Sound wall
 * panel in the road drawer. The read-backs say what the world holds and how
 * many parts were drawn; the pictures say whether they are drawn right.
 *
 * Usage: node tools/soundwall-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { closeUp, hooksReady, tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-soundwalls';
mkdirSync(out, { recursive: true });

const HIGHWAY = 3;
const RAMP = 12;
const WALLED = 13;
const WALLED_SIX = 14;
const WALLED_RAMP = 15;

const shoulderL = { kind: 'shoulder', width: 1.2 };
const lane = { kind: 'travel', width: 3.75, flow: 'fwd' };
const shoulderR = { kind: 'shoulder', width: 3 };
const wall = (height) => ({ kind: 'soundWall', width: 0.6, height });
const WALLED_PROFILE = {
  class: 'highway',
  kerbs: true,
  pieces: [wall(4.5), shoulderL, lane, lane, lane, shoulderR, wall(4.5)],
};
const sixLane = { kind: 'travel', width: 3.6, flow: 'fwd' };
const WALLED_SIX_PROFILE = {
  class: 'highway',
  kerbs: true,
  pieces: [wall(6), shoulderL, ...Array(6).fill(sixLane), shoulderR, wall(6)],
};
const WALLED_RAMP_PROFILE = {
  class: 'ramp',
  kerbs: true,
  pieces: [
    wall(3),
    { kind: 'shoulder', width: 1.2 },
    { kind: 'travel', width: 4.2, flow: 'fwd' },
    { kind: 'shoulder', width: 2.4 },
    wall(3),
  ],
};

const b = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
const pageErrors = [];
page.on('pageerror', (e) => {
  pageErrors.push(e.message);
  console.log('[pageerror]', e.message);
});
page.on('console', (m) => {
  if (m.type() === 'error') {
    pageErrors.push(m.text());
    console.log('[console.error]', m.text());
  }
});
await page.addInitScript(() => {
  sessionStorage.setItem(
    'slimcity.session',
    JSON.stringify({ screen: 'playing', seed: 12345, mode: 'new' }),
  );
});
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#viewport canvas', { timeout: 30000 });
await hooksReady(page);
await page.waitForTimeout(1500);

const call = (fn, ...a) => page.evaluate(fn, ...a);
const cmd = (label, commands) => call(([l, c]) => window.__slimcity.cmd(l, c), [label, commands]);
const grid = () => call(() => window.__slimcity.readGrid());
const cam = tileCamera(page);

// The flattest dry block 40 × 30 on the map.
const g0 = await grid();
const N = g0.size;
const idx = (x, z) => z * N + x;
let anchor = null;
let flattest = Infinity;
for (let z = 20; z < N - 40; z += 2) {
  for (let x = 20; x < N - 50; x += 2) {
    let lo = Infinity;
    let hi = -Infinity;
    let dry = true;
    for (let dz = 0; dz < 30 && dry; dz++) {
      for (let dx = 0; dx < 40 && dry; dx++) {
        const i = idx(x + dx, z + dz);
        if (g0.water[i]) dry = false;
        lo = Math.min(lo, g0.height[i]);
        hi = Math.max(hi, g0.height[i]);
      }
    }
    if (dry && hi - lo < flattest) {
      flattest = hi - lo;
      anchor = { x, z };
    }
  }
}
console.log('ground spread over the block', flattest.toFixed(1), 'm');
if (!anchor) {
  console.log('no flat block found');
  await b.close();
  process.exit(1);
}
const { x: X, z: Z } = anchor;
console.log('anchor', JSON.stringify(anchor));
const row = (x0, z, len) => Array.from({ length: len }, (_, i) => ({ x: x0 + i, z }));
const col = (x, z0, len) => Array.from({ length: len }, (_, i) => ({ x, z: z0 + i }));

await cmd('Sandbox', [
  { kind: 'setSandbox', on: true },
  { kind: 'setUnlimitedMoney', on: true },
]);
await cmd('Profiles', [
  { kind: 'defineRoadProfile', id: WALLED, profile: WALLED_PROFILE },
  { kind: 'defineRoadProfile', id: WALLED_SIX, profile: WALLED_SIX_PROFILE },
  { kind: 'defineRoadProfile', id: WALLED_RAMP, profile: WALLED_RAMP_PROFILE },
]);
// Two motorways, the same but for the wall.
await cmd('Walled motorway', [
  { kind: 'buildRoad', tier: HIGHWAY, tiles: row(X + 2, Z + 4, 24), profile: WALLED },
]);
await cmd('Open motorway', [{ kind: 'buildRoad', tier: HIGHWAY, tiles: row(X + 2, Z + 12, 24) }]);
// A slip road joining the walled motorway from the south, alongside it.
await cmd('Ramp', [
  { kind: 'buildRoad', tier: RAMP, tiles: row(X + 10, Z + 5, 5), profile: WALLED_RAMP },
]);
// A six-lane motorway, walled at its outer edges, laid as its two halves the
// way the road tool lays a corridor from one drag.
const runs = await call(
  async (path) => (await import('/src/shared/corridor.ts')).corridorRunsFor(path),
  col(X + 34, Z + 2, 20),
);
await cmd('Six lanes', [
  {
    kind: 'buildRoad',
    tier: HIGHWAY,
    tiles: runs.near,
    profile: WALLED_SIX,
    flows: runs.near.map(() => runs.nearFlow),
  },
  {
    kind: 'buildRoad',
    tier: HIGHWAY,
    tiles: runs.far,
    profile: WALLED_SIX,
    flows: runs.far.map(() => runs.farFlow),
  },
]);
// A walled motorway lifted onto a deck over its middle.
const deck = [0, 1, 2, 3, 4, 5, 5, 5, 5, 4, 3, 2, 1, 0];
await cmd('Bridge', [
  {
    kind: 'buildRoad',
    tier: HIGHWAY,
    tiles: row(X + 2, Z + 24, deck.length),
    profile: WALLED,
    elevations: deck,
  },
]);
await page.waitForTimeout(1500);

const g = await grid();
const counts = await call(() => window.__slimcity.readSoundWalls());
const profileOf = (x, z) => g.roadProfile[idx(x, z)];
console.log(
  'profiles',
  JSON.stringify({
    walled: profileOf(X + 8, Z + 4),
    open: profileOf(X + 8, Z + 12),
    ramp: profileOf(X + 12, Z + 5),
    six: [profileOf(X + 34, Z + 10), profileOf(X + 35, Z + 10)],
    bridge: [profileOf(X + 8, Z + 24), g.roadElevation[idx(X + 8, Z + 24)]],
  }),
);
console.log('parts', JSON.stringify(counts));

const failures = [];
if (profileOf(X + 8, Z + 4) !== WALLED)
  failures.push('the walled motorway was not laid with its walls');
if (counts.panels === 0) failures.push('no wall was drawn');
if (pageErrors.length > 0) failures.push(`page errors: ${pageErrors.join(' | ')}`);

await call(() => window.__slimcity.setSpeed(0));
await call(() => window.__slimcity.setDayT(0.45));

const shot = async (name, tx, tz, d, yaw, pitch) => {
  await cam(tx, tz, d, yaw, pitch);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
};
await shot('overview', X + 18, Z + 14, 520, 0.4, 1.0);
await shot('walled-oblique', X + 8, Z + 4, 70, 0.5, 0.45);
// The same wall from the far side: one face takes the sun, the other does not.
await shot('walled-far-side', X + 8, Z + 4, 70, 0.5 + Math.PI, 0.45);
const back = await closeUp(page, 2);
await shot('wall-closeup', X + 6, Z + 4, 40, 0.9, 0.25);
await back();
await shot('ramp-gap', X + 12, Z + 4, 60, -0.6, 0.55);
await shot('six-lane', X + 34, Z + 10, 80, 1.2, 0.5);
await shot('bridge', X + 8, Z + 24, 90, 0.3, 0.35);

// The panel, through the real drawer, with the sandbox unlocking the motorway.
await page.getByRole('button', { name: 'Menu', exact: true }).click();
await page.getByRole('button', { name: 'Options', exact: true }).click();
await page.getByLabel('Sandbox: unlock all build items').check();
await page.getByRole('button', { name: 'Back', exact: true }).click();
await page.getByRole('button', { name: 'Resume Game', exact: true }).click();
await page
  .getByRole('toolbar', { name: 'Main dock' })
  .getByRole('button', { name: 'Roads', exact: true })
  .click();
await page.getByRole('tab', { name: 'Highway' }).click();
await page
  .getByRole('region', { name: 'Asset drawer' })
  .getByRole('button', { name: /^Highway/ })
  .first()
  .click();
await page
  .getByRole('group', { name: 'Sound wall sides' })
  .getByRole('button', { name: 'Both' })
  .click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/panel.png` });
console.log('shot panel');

console.log(failures.length === 0 ? 'PASS' : 'FAIL:\n - ' + failures.join('\n - '));
console.log('done ->', out);
await b.close();
process.exitCode = failures.length === 0 ? 0 : 1;
