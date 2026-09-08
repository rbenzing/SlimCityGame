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
import { CAMERA_MIN_DISTANCE, closeUp, tileCamera } from './shotcam.mjs';

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

// --- A street crossing the corridor -----------------------------------------
// A corridor half is a road in its own right, so it should meet a junction the
// way a street does: a signalised crossing gives the approach a turn bay for a
// few tiles and the tiles beyond it none. Nothing had ever run the approach
// machinery against a corridor, so this is where a half either behaves like a
// road or turns out to have been carried by never being asked.
const CROSS_Z = 12;
const TWO_LANE = 1;
const row = (z, a, c) => Array.from({ length: c - a + 1 }, (_, i) => ({ x: X + a + i, z: Z + z }));
await cmd('cross street', [{ kind: 'buildRoad', tier: TWO_LANE, tiles: row(CROSS_Z, 2, 20) }]);
await page.waitForTimeout(2000);
await cmd('signal', [
  { kind: 'setJunctionControl', x: X + LEFT_X, z: Z + CROSS_Z, control: 'signal' },
  { kind: 'setJunctionControl', x: X + RIGHT_X, z: Z + CROSS_Z, control: 'signal' },
]);
await page.waitForTimeout(2500);

// Whether the crossing registered as a junction at all, before asking what the
// approach to it looks like: an approach that reports no junction and a
// junction that was never made are different faults with the same read-back.
const junctions = await call(() => window.__slimcity.readJunctions());
const onCorridor = junctions.filter((j) => Math.abs(j.z - (Z + CROSS_Z)) <= 1);
console.log('junctions on the crossing row:', JSON.stringify(onCorridor));
if (onCorridor.length === 0)
  failures.push('a street laid across the corridor made no junction on either half');

// A divided road's approach zone is five tiles, so the bay belongs to the five
// tiles before the junction (distance 0 is the last of them) and to no tile
// beyond them.
const ZONE = 5;
for (const [name, x] of [
  ['left', LEFT_X],
  ['right', RIGHT_X],
]) {
  const down = [];
  for (let d = 1; d <= ZONE + 1; d++) {
    const a = await approach(X + x, Z + CROSS_Z - d);
    const m = await call(
      ([ax, az]) => window.__slimcity.readDrawn(ax, az),
      [X + x, Z + CROSS_Z - d],
    );
    down.push({
      d,
      lanes: a?.lanes,
      width: a?.width,
      pocket: a?.pocket,
      dist: a?.distance,
      drawn: m && { lanes: m.lanes, width: m.width, pocket: m.pocket, dist: m.distance },
    });
  }
  console.log(`${name} half approaching the junction:`, JSON.stringify(down));
  // The grid says what the road means; the mesh says what is on screen. A
  // difference between them is a bug no grid read-back can see.
  for (const t of down) {
    if (t.drawn && t.drawn.lanes !== t.lanes)
      failures.push(
        `${name} half ${t.d} out: grid says ${t.lanes} lanes, the mesh draws ${t.drawn.lanes}`,
      );
  }
  const near = down[0];
  const outside = down[ZONE];
  if (near?.dist !== 0)
    failures.push(`${name} half at the stop line reports distance ${near?.dist}, wanted 0`);
  for (const t of down.slice(0, ZONE)) {
    if (t.dist !== t.d - 1)
      failures.push(`${name} half ${t.d} tile(s) out reports distance ${t.dist}`);
  }
  // Past the zone the walk stops looking, so the junction is out of reach.
  if (outside?.dist !== -1)
    failures.push(`${name} half still reports a junction past its zone (${outside?.dist})`);
  // The half has to find the junction AND widen for it: a corridor tile that
  // never counted as a straight run found neither.
  if (!down.slice(0, ZONE).every((t) => t.pocket === true))
    failures.push(`${name} half carries no turn bay inside the approach zone`);
  if (outside?.pocket === true)
    failures.push(`${name} half still claims a bay past the end of its approach zone`);
  if (near && outside && !(near.lanes > outside.lanes))
    failures.push(
      `${name} half gains no lane at the junction (${outside.lanes} out, ${near.lanes} at the line)`,
    );
}

const shots = [
  ['corridor-top', X + 10, Z + 12, 70, 0, 1.45],
  ['corridor-eye', X + 10, Z + 20, 34, 0, 0.3],
  ['corridor-oblique', X + 10, Z + 12, 60, 0.6, 0.6],
  ['corridor-junction', X + 10, Z + CROSS_Z, 46, 0, 1.5],
  // The approach itself, close and straight down: a multi-lane arm is where
  // per-lane movements have anything to say, and every lane of it should be
  // carrying its own arrow.
];
for (const [name, tx, tz, d, yaw, pitch] of shots) {
  await cam(tx, tz, d, yaw, pitch);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
}

// The arm running into the junction, at twice the resolution: the camera will
// not come closer than its floor, and a lane-use arrow is small enough that
// the pixels are what decide whether it is there.
const restore = await closeUp(page, 2);
await cam(X + LEFT_X, Z + CROSS_Z - 1, CAMERA_MIN_DISTANCE, 0, 1.5);
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/corridor-approach.png` });
console.log('shot corridor-approach');
await restore();

await b.close();
for (const e of pageErrors) failures.push(`page error: ${e}`);
if (failures.length > 0) {
  console.log('FAIL');
  for (const f of failures) console.log(' -', f);
  process.exitCode = 1;
} else {
  console.log('PASS');
}
