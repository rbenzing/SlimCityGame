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
const stats = () => call(() => window.__slimcity.getStats());
const setSpeed = (s) => call((x) => window.__slimcity.setSpeed(x), s);
const cam = (tx, tz, d, yaw, pitch) =>
  call(
    ([x, z, dd, yy, pp]) =>
      window.__slimcity.setCamera((x + 0.5) * 16, (z + 0.5) * 16, dd, yy, pp),
    [tx, tz, d, yaw, pitch],
  );

const g = await readGrid();
const N = g.size;
const idx = (x, z) => z * N + x;

// Find the widest east-west water crossing with dry land well back on both
// banks — the ramps need room to land, and a span with nothing either side of
// it tells us nothing about the approaches.
const BANK = 8;
let best = null;
for (let z = 30; z < N - 30; z++) {
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
    if (dryBanks && span >= 4 && span <= 22 && (!best || span > best.span))
      best = { z, from: x, to: end - 1, span };
    x = end;
  }
}
if (!best) {
  console.log('no suitable crossing found');
  await b.close();
  process.exit(1);
}
console.log('crossing', JSON.stringify(best));

await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
await page.waitForTimeout(300);

/** A west-east run at row z, reaching `BANK` tiles onto dry land either side. */
const crossing = (z, tier, elevation = 0) =>
  cmd('R', [
    {
      kind: 'buildRoad',
      tier,
      elevation,
      tiles: Array.from({ length: best.span + 2 * BANK }, (_, i) => ({
        x: best.from - BANK + i,
        z,
      })),
    },
  ]);

// One span per structural family, on parallel rows so each is framed alone.
const ROWS = [
  { dz: 0, tier: RT.Highway, name: 'highway-box' },
  { dz: 4, tier: RT.TwoLane, name: 'street-beam' },
  { dz: 8, tier: RT.RailTrack, name: 'rail-truss' },
  { dz: 12, tier: RT.Gravel, name: 'track-plank' },
];
for (const r of ROWS) await crossing(best.z + r.dz, r.tier);
// A deliberately raised viaduct over dry land: the ramp case, where the deck
// has to climb and land rather than just clear water.
const viaductZ = best.z + 16;
await crossing(viaductZ, RT.Avenue, 12);
await page.waitForTimeout(900);

const grid = await readGrid();
const decked = ROWS.map((r) => {
  const row = best.z + r.dz;
  let n = 0;
  for (let x = 0; x < N; x++) if ((grid.roadElevation?.[idx(x, row)] ?? 0) > 0) n++;
  return `${r.name}=${n}`;
}).join(' ');
console.log('elevated tiles per span:', decked);

// Settle to midday and pause, so shadows read and nothing moves between shots.
await setSpeed(4);
await page.waitForTimeout(1200);
const dayTof = (t) => ((t + 900) % 2400) / 2400;
for (let i = 0; i < 500; i++) {
  const d = dayTof((await stats()).tick);
  if (d >= 0.47 && d <= 0.53) {
    await setSpeed(0);
    break;
  }
  await page.waitForTimeout(120);
}
await page.waitForTimeout(500);

const mid = Math.round((best.from + best.to) / 2);
const shot = async (name, tx, tz, d, yaw, pitch) => {
  await cam(tx, tz, d, yaw, pitch);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
};

// Edge-on, from the side of the run: the deck profile and what holds it up.
const SIDE_YAW = 0;
const LOW = 0.12;
for (const r of ROWS) await shot(`${r.name}-side`, mid, best.z + r.dz, 34, SIDE_YAW, LOW);
// Straight down the run at deck level: a crowned or sagging deck shows here.
for (const r of ROWS)
  await shot(`${r.name}-along`, mid, best.z + r.dz, 26, Math.PI / 2, 0.16);
// Overhead: what stands on the deck, and how wide the deck is against its road.
await shot('highway-deck-top', mid, best.z, 30, 0, 1.1);
await shot('street-deck-top', mid, best.z + 4, 26, 0, 1.1);
// The ramp: where a viaduct climbs off the ground and lands again.
await shot('viaduct-ramp', best.from - BANK + 3, viaductZ, 30, Math.PI / 2, 0.18);
await shot('viaduct-side', mid, viaductZ, 40, 0, 0.14);
await shot('overview', mid, best.z + 8, 110, 0.6, 0.8);

console.log('done ->', out);
await b.close();
