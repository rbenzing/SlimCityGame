/** Turn pocket check (SPEC 29, wave 4c): lay three crossroads whose side
 * streets ask three different things of the same rule — one at a junction that
 * holds its traffic, one at a junction that holds nobody, and one on a road
 * with no width to spare — then read back the cross-section each approach
 * actually carries and shoot them.
 *
 * The read-back is the point: a screenshot shows asphalt but not how many
 * lanes wide it is, nor which junction the stretch belongs to.
 *
 * Usage: node tools/pocket-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-pockets';
mkdirSync(out, { recursive: true });

const TWO_LANE = 1;
const FOUR_LANE = 7;

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

const SPAN = 28;
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

// Three crossroads six tiles apart: what gets a pocket, what does not, and why.
const CASES = [
  {
    name: 'street onto a four-lane road',
    at: [4, 3],
    across: FOUR_LANE,
    down: TWO_LANE,
    // The junction stops the side street, and a two-lane street in a 16 m tile
    // has verge to spare: the approach gains a lane it does not have elsewhere.
    wantPocket: true,
    wantLanes: 3,
  },
  {
    name: 'two quiet streets crossing',
    at: [12, 9],
    across: TWO_LANE,
    down: TWO_LANE,
    // Nothing controls it, so nobody queues and there is nothing to take out
    // of the way.
    wantPocket: false,
    wantLanes: 2,
  },
  {
    name: 'four-lane onto a four-lane road',
    at: [20, 15],
    across: FOUR_LANE,
    down: FOUR_LANE,
    // All-way stop, so the warrant is there — but four 12 ft lanes fill the
    // tile and there is no width to find.
    wantPocket: false,
    wantLanes: 4,
  },
];

for (const c of CASES) {
  const [cx, cz] = c.at;
  await cmd('across', [{ kind: 'buildRoad', tier: c.across, tiles: row(cz, cx - 4, cx + 4) }]);
  await cmd('down', [{ kind: 'buildRoad', tier: c.down, tiles: col(cx, cz - 3, cz + 4) }]);
}
await page.waitForTimeout(2500);

const failures = [];
for (const c of CASES) {
  const [cx, cz] = c.at;
  // The tile below the junction, arriving from the south.
  const head = await approach(X + cx, Z + cz + 1);
  console.log(c.name, '->', JSON.stringify(head));
  if (!head) {
    failures.push(`${c.name}: the tile below the junction is not an approach at all`);
    continue;
  }
  if (head.distance !== 0) failures.push(`${c.name}: distance ${head.distance}, not 0`);
  if (head.pocket !== c.wantPocket)
    failures.push(`${c.name}: pocket ${head.pocket}, wanted ${c.wantPocket}`);
  if (head.lanes !== c.wantLanes)
    failures.push(`${c.name}: ${head.lanes} lanes drawn, wanted ${c.wantLanes}`);
}

// The pocket runs the whole approach zone — a local street stores two tiles of
// queue — and stops where the zone does.
const [px, pz] = CASES[0].at;
const zone = [];
for (let d = 1; d <= 3; d++) zone.push(await approach(X + px, Z + pz + d));
console.log('down the zone:', JSON.stringify(zone));
if (!zone[0]?.pocket || !zone[1]?.pocket)
  failures.push('the pocket does not run the two tiles a local approach stores');
if (zone[2]?.pocket) failures.push('the pocket runs past the end of the approach zone');
const [head, behind] = zone;
if (head && behind && Math.abs(head.width - behind.width) > 1e-6)
  failures.push('the widened carriageway is not the same width down the zone');

// Hand the junction back to nothing and the pocket goes with it: the lane is
// the control's, not the road's.
await cmd('Junction control', [
  { kind: 'setJunctionControl', x: X + px, z: Z + pz, control: 'none' },
]);
await page.waitForTimeout(1500);
const uncontrolled = await approach(X + px, Z + pz + 1);
console.log('uncontrolled again:', JSON.stringify(uncontrolled));
if (uncontrolled?.pocket) failures.push('the pocket outlived the control that warranted it');

// And a left turn nobody may make is a pocket nobody needs.
await cmd('Junction control', [
  { kind: 'setJunctionControl', x: X + px, z: Z + pz, control: 'signal' },
]);
await cmd('Turn restriction', [
  { kind: 'setJunctionTurns', x: X + px, z: Z + pz, arm: 3 /* south */, allowed: 2 | 4 },
]);
await page.waitForTimeout(1500);
const noLeft = await approach(X + px, Z + pz + 1);
console.log('left turn banned:', JSON.stringify(noLeft));
if (noLeft?.pocket) failures.push('an arm that may not turn left still carries a left-turn pocket');

if (pageErrors.length > 0) failures.push(`page errors: ${pageErrors.join(' | ')}`);

// Put the left turn back for the pictures.
await cmd('Turn restriction', [
  { kind: 'setJunctionTurns', x: X + px, z: Z + pz, arm: 3, allowed: null },
]);
await page.waitForTimeout(1200);

await call(() => window.__slimcity.setDayT(0.5));
const shot = async (name, tx, tz, d, yaw, pitch) => {
  await cam(tx, tz, d, yaw, pitch);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
};
for (const c of CASES) {
  const [cx, cz] = c.at;
  await shot(c.name.replace(/[^a-z0-9]+/gi, '-'), X + cx, Z + cz + 1, 45, 0.0, 1.1);
}
await shot('pocket-close', X + px, Z + pz + 1, 28, 0.35, 1.15);
await shot('all-three', X + 12, Z + 9, 320, 0.5, 1.05);

console.log(failures.length === 0 ? 'PASS' : 'FAIL');
for (const f of failures) console.log(' -', f);
await b.close();
process.exit(failures.length === 0 ? 0 : 1);
