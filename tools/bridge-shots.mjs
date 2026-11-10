/** Bridge visual check: find a real river on the deterministic seed-12345 map,
 * throw a span of every structural family across it, and shoot each one from
 * the angles the faults actually show at — edge-on for the deck profile and
 * the structure under it, overhead for what stands on the deck.
 *
 * The unit tests assert the numbers; this is for looking at the result. Every
 * bridge defect found so far (road under its own girder, a crowned deck, a
 * motorway span two metres too wide) was invisible to green tests and obvious
 * in a side view.
 *
 * Usage: node tools/bridge-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { cleanShot, readToasts, tileCamera, unlimitedMoneyOption } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-bridges';
mkdirSync(out, { recursive: true });

const RT = { TwoLane: 1, Avenue: 2, Highway: 3, Gravel: 4, RailTrack: 11 };

const b = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console.error]', m.text());
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
await unlimitedMoneyOption(page);
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#viewport canvas', { timeout: 20000 });
await page.waitForTimeout(4000);

const ready = () =>
  page.waitForFunction(() => !!window.__slimcity && !!window.__slimcity.cmd, null, {
    timeout: 20000,
  });
const call = async (fn, ...a) => {
  await ready();
  return page.evaluate(fn, ...a);
};
const cmd = (l, c) => call(([x, y]) => window.__slimcity.cmd(x, y), [l, c]);
const readGrid = () => call(() => window.__slimcity.readGrid());
const setSpeed = (s) => call((x) => window.__slimcity.setSpeed(x), s);
const cam = tileCamera(page);

const g = await readGrid();
const N = g.size;
const idx = (x, z) => z * N + x;

// Find the widest east-west water crossing with dry land well back on both
// banks — the ramps need room to land, and a span with nothing either side of
// it tells us nothing about the approaches.
const BANK = 8;
// The water crossings of one row that have dry land well back on both banks.
const crossingsAt = (z) => {
  const found = [];
  let x = BANK;
  while (x < N - BANK) {
    if (!g.water[idx(x, z)]) {
      x++;
      continue;
    }
    let end = x;
    while (end < N - BANK && g.water[idx(end, z)]) end++;
    const span = end - x;
    let dryBanks = true;
    for (let k = 1; k <= BANK; k++) {
      if (g.water[idx(x - k, z)] || g.water[idx(end - 1 + k, z)]) dryBanks = false;
    }
    if (dryBanks && span >= 4 && span <= 22) found.push({ z, from: x, to: end - 1, span });
    x = end;
  }
  return found;
};

// Five spans on parallel rows, each a crossing of its own row: a river widens
// and narrows, so one run laid on neighbouring rows meets water of another
// width and is refused. The rows are kept within a few tiles of each other
// sideways so one overview holds them all.
const FAMILIES = 5;
const ROW_GAP = 5;
const WINDOW = 40;
let best = null;
let spans = null;
for (let z = 30; z < N - 30 - WINDOW; z++) {
  for (const first of crossingsAt(z)) {
    const rows = [];
    for (let dz = 0; dz < WINDOW && rows.length < FAMILIES; dz++) {
      if (rows.length > 0 && z + dz - rows[rows.length - 1].z < ROW_GAP) continue;
      const near = crossingsAt(z + dz).filter(
        (c) => Math.abs(c.from + c.to - first.from - first.to) <= 24,
      );
      if (near.length > 0) rows.push(near.sort((a, c) => c.span - a.span)[0]);
    }
    if (rows.length < FAMILIES) continue;
    const total = rows.reduce((s, r) => s + r.span, 0);
    if (!best || total > best.total) {
      best = { ...first, total };
      spans = rows;
    }
  }
}
if (!best) {
  console.log('no suitable crossing found');
  await b.close();
  process.exit(1);
}
console.log('crossings', JSON.stringify(spans));

await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
await page.waitForTimeout(300);

/** A west-east run at row z, reaching `BANK` tiles onto dry land either side. */
const crossing = async (c, tier, elevation = 0) => {
  const z = c.z;
  await cmd('R', [
    {
      kind: 'buildRoad',
      tier,
      elevation,
      tiles: Array.from({ length: c.span + 2 * BANK }, (_, i) => ({
        x: c.from - BANK + i,
        z,
      })),
    },
  ]);
  await page.waitForTimeout(250);
  const refused = (await readToasts(page)).filter((t) => / failed$/.test(t.title));
  if (refused.length > 0) {
    console.log(`FAIL: span at row ${z} (tier ${tier}) refused: ${JSON.stringify(refused)}`);
    await b.close();
    process.exit(1);
  }
};

// One span per structural family, on parallel rows so each is framed alone.
const ROWS = [
  { c: spans[0], tier: RT.Highway, name: 'highway-box' },
  { c: spans[1], tier: RT.TwoLane, name: 'street-beam' },
  { c: spans[2], tier: RT.RailTrack, name: 'rail-truss' },
  { c: spans[3], tier: RT.Gravel, name: 'track-plank' },
];
for (const r of ROWS) await crossing(r.c, r.tier);
// A deliberately raised viaduct: the ramp case, where the deck has to climb
// and land rather than just clear water.
const viaduct = { c: spans[4], tier: RT.Avenue, name: 'viaduct' };
await crossing(viaduct.c, viaduct.tier, 12);
await page.waitForTimeout(900);

const grid = await readGrid();
const missing = [];
const decked = [...ROWS, viaduct]
  .map((r) => {
    let n = 0;
    for (let x = 0; x < N; x++) if ((grid.roadElevation?.[idx(x, r.c.z)] ?? 0) > 0) n++;
    if (n === 0) missing.push(r.name);
    return `${r.name}=${n}`;
  })
  .join(' ');
console.log('elevated tiles per span:', decked);
if (missing.length > 0) {
  console.log(`FAIL: no bridge deck was laid for ${missing.join(', ')}`);
  await b.close();
  process.exit(1);
}

// Pause, so nothing moves between shots, and pin midday so shadows read.
await setSpeed(0);
await call(() => window.__slimcity.setDayT(0.5));
await page.waitForTimeout(500);

const midOf = (c) => Math.round((c.from + c.to) / 2);
const shot = async (name, tx, tz, d, yaw, pitch) => {
  await cam(tx, tz, d, yaw, pitch);
  await page.waitForTimeout(900);
  await cleanShot(page, `${out}/${name}.png`);
  console.log('shot', name);
};

// A span is 20 m per tile long and is seen whole only when the camera stands
// back about that far, so the distance follows the span rather than being fixed.
const SPAN_M = (c) => (c.span + 2) * 20;
// Edge-on, from the side of the run: the deck profile and what holds it up.
const SIDE_YAW = 0;
const LOW = 0.2;
// The rail truss and the plank deck are thin, so they are framed tighter to fill the shot.
const THIN = new Set(['rail-truss', 'track-plank']);
for (const r of [...ROWS, viaduct])
  await shot(
    `${r.name}-side`,
    midOf(r.c),
    r.c.z,
    Math.max(60, SPAN_M(r.c) * (THIN.has(r.name) ? 0.55 : 0.9)),
    SIDE_YAW,
    LOW,
  );
// Straight down the run at deck level: a crowned or sagging deck shows here.
for (const r of [...ROWS, viaduct])
  await shot(
    `${r.name}-along`,
    midOf(r.c),
    r.c.z,
    Math.max(THIN.has(r.name) ? 60 : 120, SPAN_M(r.c) * (THIN.has(r.name) ? 0.8 : 1.1)),
    Math.PI / 2,
    0.2,
  );
// Overhead: what stands on the deck, and how wide the deck is against its road.
await shot('highway-deck-top', midOf(ROWS[0].c), ROWS[0].c.z, 60, 0, 1.3);
await shot('street-deck-top', midOf(ROWS[1].c), ROWS[1].c.z, 60, 0, 1.3);
// The ramp: where a viaduct climbs off the ground and lands again.
// Aimed at the first raised tile, seen edge-on from the side so the climb reads.
let rampAt = viaduct.c.from - BANK;
while (rampAt < N && (grid.roadElevation?.[idx(rampAt, viaduct.c.z)] ?? 0) === 0) rampAt++;
console.log('viaduct deck first raised at x', rampAt);
await shot('viaduct-ramp', rampAt + 1, viaduct.c.z, 70, 0, 0.2);
// Every span in one frame.
const all = [...ROWS, viaduct].map((r) => r.c);
const meanOf = (f) => Math.round(all.reduce((s, c) => s + f(c), 0) / all.length);
await shot(
  'overview',
  meanOf(midOf),
  meanOf((c) => c.z),
  800,
  0.6,
  0.9,
);

console.log('done ->', out);
await b.close();
