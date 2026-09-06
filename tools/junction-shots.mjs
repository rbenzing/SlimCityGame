/** Junction control check (SPEC 29, wave 3): lay four junctions whose roads
 * call for four different answers — two quiet streets crossing, a side street
 * onto a four-lane, a side street onto an avenue, and two four-lane streets
 * crossing — then read back the control the sim warranted and the boards the
 * render put up, and shoot them.
 *
 * The read-back is the point: a screenshot shows a post beside a road but not
 * which board it carries, and the whole change is about which board.
 *
 * Usage: node tools/junction-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-junctions';
mkdirSync(out, { recursive: true });

const TWO_LANE = 1;
const AVENUE = 2;
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
const cam = (tx, tz, d, yaw, pitch) =>
  call(
    ([x, z, dd, yy, pp]) => window.__slimcity.setCamera((x + 0.5) * 16, (z + 0.5) * 16, dd, yy, pp),
    [tx, tz, d, yaw, pitch],
  );

const g0 = await readGrid();
const N = g0.size;
const idx = (x, z) => z * N + x;

// A level, dry block big enough for four crossroads on a 24-tile grid.
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
if (!anchor) {
  console.log('no dry block found');
  await b.close();
  process.exit(1);
}
const { x: X, z: Z } = anchor;
console.log('ground spread over the block:', flattest.spread.toFixed(2), 'm');
console.log('anchor', JSON.stringify(anchor));

await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
await page.waitForTimeout(300);

const row = (z, from, to) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ x: X + from + i, z: Z + z }));
const col = (x, from, to) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ x: X + x, z: Z + from + i }));

// Four crossroads, six tiles apart, each a different pair of roads.
const CASES = [
  { name: 'two-lane x two-lane', at: [3, 3], across: TWO_LANE, down: TWO_LANE, want: 'none' },
  { name: 'four-lane x two-lane', at: [3, 9], across: FOUR_LANE, down: TWO_LANE, want: 'stop' },
  { name: 'avenue x two-lane', at: [3, 15], across: AVENUE, down: TWO_LANE, want: 'signal' },
  { name: 'four-lane x four-lane', at: [3, 21], across: FOUR_LANE, down: FOUR_LANE, want: 'allWayStop' },
];

for (const c of CASES) {
  const [cx, cz] = c.at;
  await cmd('across', [{ kind: 'buildRoad', tier: c.across, tiles: row(cz, cx - 3, cx + 3) }]);
  await cmd('down', [{ kind: 'buildRoad', tier: c.down, tiles: col(cx, cz - 2, cz + 2) }]);
}
await page.waitForTimeout(2000);

const junctions = await call(() => window.__slimcity.readJunctions());
const signs = await call(() => window.__slimcity.readSigns());
console.log('junctions:', JSON.stringify(junctions));

const failures = [];
const controlAt = (x, z) => junctions.find((j) => j.x === x && j.z === z)?.control;
const signAt = (x, z) => signs.find((s) => s.x === x && s.z === z)?.type;

for (const c of CASES) {
  const [cx, cz] = c.at;
  const jx = X + cx;
  const jz = Z + cz;
  const got = controlAt(jx, jz);
  if (got !== c.want) failures.push(`${c.name}: control ${got} is not ${c.want}`);

  // The boards the control calls for, on the arms that give way.
  const across = [signAt(jx - 1, jz), signAt(jx + 1, jz)];
  const down = [signAt(jx, jz - 1), signAt(jx, jz + 1)];
  const expect = (label, got, want) => {
    if (got.some((v) => v !== want))
      failures.push(`${c.name}: ${label} boards ${JSON.stringify(got)} are not all ${want}`);
  };
  if (c.want === 'none') {
    // Reported as a junction — the inspector opens on it — but signed with
    // nothing, because nothing controls it.
    expect('across', across, undefined);
    expect('down', down, undefined);
  } else if (c.want === 'stop') {
    expect('the side street', down, 'stop');
    expect('the road running through', across, undefined);
  } else if (c.want === 'signal') {
    expect('across', across, 'signal');
    expect('down', down, 'signal');
  } else if (c.want === 'allWayStop') {
    expect('across', across, 'stop');
    expect('down', down, 'stop');
  }
}

// A roundabout is the one control that changes the geometry: the quiet
// crossroads becomes an island with a yield line across every entry.
const [rx, rz] = CASES[0].at;
await cmd('Junction control', [
  { kind: 'setJunctionControl', x: X + rx, z: Z + rz, control: 'roundabout' },
]);
await page.waitForTimeout(1500);
const roundabout = await call(() => window.__slimcity.readJunctions());
const roundSigns = await call(() => window.__slimcity.readSigns());
const atRoundabout = roundabout.find((j) => j.x === X + rx && j.z === Z + rz)?.control;
if (atRoundabout !== 'roundabout') failures.push(`roundabout: control is ${atRoundabout}`);
for (const [dx, dz] of [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
]) {
  const board = roundSigns.find((sg) => sg.x === X + rx + dx && sg.z === Z + rz + dz)?.type;
  if (board !== 'giveway')
    failures.push(`roundabout: the ${dx},${dz} entry carries ${board}, not a give-way`);
}

// The signal heads cycle. Opposing arms share an aspect, the greens alternate,
// and a paused city holds its lights — the pulse of a signal node, on the same
// clock the cars are on.
await call(() => window.__slimcity.setSpeed(4));
const aspectRuns = [];
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(2500);
  aspectRuns.push(await call(() => window.__slimcity.readSignalAspects()));
}
const distinct = new Set(aspectRuns.map((a) => JSON.stringify(a)));
console.log('signal aspects seen:', [...distinct].join(' '));
if (aspectRuns[0].length === 0) failures.push('no signal heads to cycle');
if (distinct.size < 2) failures.push('the signal heads never changed aspect');
if (aspectRuns.some((a) => a.filter((x) => x === 'green').length > a.length / 2))
  failures.push('more than one phase was green at once');
await call(() => window.__slimcity.setSpeed(0));
const held = JSON.stringify(await call(() => window.__slimcity.readSignalAspects()));
await page.waitForTimeout(2500);
if (JSON.stringify(await call(() => window.__slimcity.readSignalAspects())) !== held)
  failures.push('the lights kept cycling while the city was paused');

if (pageErrors.length > 0) failures.push(`page errors: ${pageErrors.join(' | ')}`);

await call(() => window.__slimcity.setDayT(0.5));
const shot = async (name, tx, tz, d, yaw, pitch) => {
  await cam(tx, tz, d, yaw, pitch);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
};
for (const c of CASES) {
  const [cx, cz] = c.at;
  await shot(c.name.replace(/[^a-z0-9]+/gi, '-'), X + cx, Z + cz, 70, 0.6, 0.75);
}
await shot('roundabout', X + rx, Z + rz, 55, 0.5, 0.95);
await shot('all-four', X + 3, Z + 12, 260, 0.6, 1.05);

console.log(failures.length === 0 ? 'PASS' : 'FAIL');
for (const f of failures) console.log(' -', f);
await b.close();
process.exit(failures.length === 0 ? 0 : 1);
