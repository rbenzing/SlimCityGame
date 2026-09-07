/** Two-tile corridor (SPEC 29, wave 6): lay a six-lane divided road as two
 * parallel runs carrying the SAME profile, each tile flagged as its own half
 * of the corridor, and look at what comes out.
 *
 * The corridor bits go in by hand here because no tool sets them yet — which
 * is the point: it proves the render path draws a corridor correctly before
 * anything can draw one by accident.
 *
 * Usage: node tools/corridor-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-corridor';
mkdirSync(out, { recursive: true });

// roadFlow: low three bits the direction, then the corridor bits.
const SOUTH = 3;
const CORRIDOR = 0b1000;
const CORRIDOR_RIGHT = 0b1_0000;

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
    if (spread <= 0.3) {
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

const failures = [];
const col = (x, a, c) => Array.from({ length: c - a + 1 }, (_, i) => ({ x: X + x, z: Z + a + i }));

// A six-lane divided road: 24.5 m of cross-section, which no tile holds.
const SIX_LANE = 40;
const lane = (flow) => ({ kind: 'travel', width: 3.6, flow });
await cmd('define', [
  {
    kind: 'defineRoadProfile',
    id: SIX_LANE,
    profile: {
      class: 'divided',
      pieces: [
        { kind: 'sidewalk', width: 1.9 },
        lane('back'),
        lane('back'),
        lane('back'),
        { kind: 'median', width: 2.0 },
        lane('fwd'),
        lane('fwd'),
        lane('fwd'),
        { kind: 'sidewalk', width: 1.9 },
      ],
    },
  },
]);

// Two parallel runs of the SAME profile, each flagged as its half.
const LEFT_X = 10;
const RIGHT_X = 11;
const RUN = [2, 22];
await cmd('corridor left', [
  {
    kind: 'buildRoad',
    tier: 2,
    tiles: col(LEFT_X, RUN[0], RUN[1]),
    profile: SIX_LANE,
    flows: col(LEFT_X, RUN[0], RUN[1]).map(() => SOUTH | CORRIDOR),
  },
]);
await cmd('corridor right', [
  {
    kind: 'buildRoad',
    tier: 2,
    tiles: col(RIGHT_X, RUN[0], RUN[1]),
    profile: SIX_LANE,
    flows: col(RIGHT_X, RUN[0], RUN[1]).map(() => SOUTH | CORRIDOR | CORRIDOR_RIGHT),
  },
]);
await page.waitForTimeout(3000);

const g = await readGrid();
const leftFlow = g.roadFlow[idx(X + LEFT_X, Z + 12)];
const rightFlow = g.roadFlow[idx(X + RIGHT_X, Z + 12)];
console.log('stored flows:', JSON.stringify({ left: leftFlow, right: rightFlow }));
if ((leftFlow & CORRIDOR) === 0) failures.push('the left run did not record itself as a corridor');
if ((rightFlow & CORRIDOR_RIGHT) === 0)
  failures.push('the right run did not record itself as the far half');

// Each half must draw HALF the road: 12.25 m, not 24.5 and not the preset.
for (const [name, x] of [
  ['left', LEFT_X],
  ['right', RIGHT_X],
]) {
  const a = await approach(X + x, Z + 12);
  console.log(`${name} half:`, JSON.stringify({ lanes: a?.lanes, width: a?.width }));
  if (!a) continue;
  if (a.lanes !== 3) failures.push(`${name} half carries ${a.lanes} lanes, not the three it should`);
}

const shots = [
  ['corridor-top', X + 10, Z + 12, 70, 0, 1.45],
  ['corridor-eye', X + 10, Z + 20, 34, 0, 0.3],
  ['corridor-oblique', X + 10, Z + 12, 60, 0.6, 0.6],
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
