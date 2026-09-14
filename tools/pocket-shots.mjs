/** Turn pocket check: lay four junctions whose side streets ask four different
 * things of the same rule — one at a junction that holds its traffic, one at a
 * junction that holds nobody, one on a road with no width to spare, and one
 * that is a TEE, where the warrant and the width are both there but the left
 * turn has no leg to land on — then read back the cross-section each approach
 * actually carries and shoot them.
 *
 * The read-back is the point: a screenshot shows asphalt but not how many
 * lanes wide it is, nor which junction the stretch belongs to, nor which
 * movements the arrows on it were painted from.
 *
 * Usage: node tools/pocket-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-pockets';
mkdirSync(out, { recursive: true });

const TWO_LANE = 1;
const FOUR_LANE = 7;

// The movement bits, as the approach packs them.
const LEFT = 1;
const THROUGH = 2;
const RIGHT = 4;

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

const SPAN = 36;
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
    // The junction stops the side street, and a two-lane street has verge to
    // spare: the approach gains a lane it does not have elsewhere.
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
  {
    name: 'a street tee-ing into a four-lane road',
    at: [28, 21],
    across: FOUR_LANE,
    down: TWO_LANE,
    // The side street stops here like the first case, and the junction holds
    // it the same way — but the road ENDS at the crossbar. There is no north
    // leg, so a driver coming up it cannot go through, and the bay beside the
    // centreline would store a queue for a movement the junction does not
    // offer.
    stem: 'south',
    wantPocket: false,
    wantLanes: 2,
  },
];

for (const c of CASES) {
  const [cx, cz] = c.at;
  await cmd('across', [{ kind: 'buildRoad', tier: c.across, tiles: row(cz, cx - 4, cx + 4) }]);
  // A stem runs out of the junction one way only: the tee it makes is the
  // case where a turn has no leg to land on.
  const behind = c.stem === 'south' ? cz : cz - 3;
  await cmd('down', [{ kind: 'buildRoad', tier: c.down, tiles: col(cx, behind, cz + 4) }]);
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
  // The arm of a tee cannot go through: the road ends at the crossbar. The
  // arrows are painted from this set, so an arrow pointing at open ground is
  // this number being wrong rather than the paint being misplaced.
  const wantThrough = c.stem === undefined;
  if (((head.allowed & THROUGH) !== 0) !== wantThrough)
    failures.push(
      `${c.name}: through ${(head.allowed & THROUGH) !== 0}, wanted ${wantThrough} (allowed ${head.allowed})`,
    );
  if ((head.allowed & LEFT) === 0)
    failures.push(`${c.name}: no left turn offered, and there is a leg to its left`);
}

// The crossbar of the tee, BOTH ways along it. The stem is south of the
// junction and open ground is north, so the two arms are mirror images: one
// turns right onto the stem and the other turns left onto it, and neither has
// anything on its other side. Checking only one would pass a rule that had the
// handedness backwards.
{
  const tee = CASES.find((c) => c.stem);
  const [tx, tz] = tee.at;
  const arms = [
    // Heading east: the stem is on the right, open ground on the left.
    { name: 'from the west', at: [tx - 1, tz], onto: RIGHT, none: LEFT },
    // Heading west: the stem is on the left, open ground on the right.
    { name: 'from the east', at: [tx + 1, tz], onto: LEFT, none: RIGHT },
  ];
  for (const a of arms) {
    const read = await approach(X + a.at[0], Z + a.at[1]);
    console.log('tee crossbar', a.name, '->', JSON.stringify(read));
    if (!read) {
      failures.push(`the tee crossbar ${a.name} is not an approach at all`);
      continue;
    }
    if ((read.allowed & a.none) !== 0)
      failures.push(
        `the tee crossbar ${a.name} offers a turn onto open ground (allowed ${read.allowed})`,
      );
    if ((read.allowed & a.onto) === 0)
      failures.push(`the tee crossbar ${a.name} lost the turn onto the stem that IS there`);
    if ((read.allowed & THROUGH) === 0)
      failures.push(`the tee crossbar ${a.name} cannot go through its own road`);
  }
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
// The bay opens over a taper rather than starting at full width: the tile at
// the stop line has the whole of it, the one behind is still opening, and the
// road behind the zone is the road.
const [head, behind, past] = zone;
if (head && head.openness !== 1) failures.push('the bay is not full against the junction');
if (behind && !(behind.openness < 1 && behind.openness > 0))
  failures.push(`the bay does not open over a taper (openness ${behind?.openness})`);
if (head && behind && !(behind.width < head.width && behind.width > (past?.width ?? Infinity)))
  failures.push('the carriageway does not widen down the zone into the bay');

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
// The pair that differ only in the missing leg, shot the same way: one grows a
// bay for its left turn, the other has nowhere to turn and stays two lanes.
const [tx, tz] = CASES.find((c) => c.stem).at;
await shot('tee-close', X + tx, Z + tz + 1, 28, 0.35, 1.15);
// Straight down on the tee. Which way an arrow head points is the whole of
// what is being checked here, and an oblique shot turns a right turn and a
// left turn into two similar diagonals.
await shot('tee-overhead', X + tx, Z + tz, 90, 0, 1.55);
await shot('all-four', X + 16, Z + 12, 400, 0.5, 1.05);

console.log(failures.length === 0 ? 'PASS' : 'FAIL');
for (const f of failures) console.log(' -', f);
await b.close();
process.exit(failures.length === 0 ? 0 : 1);
