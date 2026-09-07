/** One-tile stub check: lay a SINGLE isolated tile of road three ways — with
 * footways, without them, and with a centre turn lane — then read back what
 * each one is made of and shoot it.
 *
 * A lone tile is the smallest thing a player can build and the least
 * exercised: it has no neighbour, so every "what does the next tile do"
 * branch in the mesh takes its empty path at once. The screenshot is the
 * point here — a read-back says how wide the carriageway is, not whether the
 * footway wrapped the stub or shot off into the grass.
 *
 * Usage: node tools/stub-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-stubs';
mkdirSync(out, { recursive: true });

const TWO_LANE = 1;

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
const signs = () => call(() => window.__slimcity.readSigns());
const cam = tileCamera(page);

const g0 = await readGrid();
const N = g0.size;
const idx = (x, z) => z * N + x;

const SPAN = 24;
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

const LANE = { kind: 'travel', width: 3.75 };
const WALK = { kind: 'sidewalk', width: 1.875 };

// Three lone tiles, eight apart so no two share a neighbour and each is
// genuinely isolated.
const CASES = [
  {
    id: 'footways-on',
    at: { x: 0, z: 0 },
    profile: 20,
    pieces: [WALK, { ...LANE, flow: 'back' }, { ...LANE, flow: 'fwd' }, WALK],
  },
  {
    id: 'footways-off',
    at: { x: 8, z: 0 },
    profile: 21,
    pieces: [{ ...LANE, flow: 'back' }, { ...LANE, flow: 'fwd' }],
  },
  {
    id: 'turn-lane',
    at: { x: 16, z: 0 },
    profile: 22,
    pieces: [
      WALK,
      { ...LANE, flow: 'back' },
      { kind: 'centreTurn', width: 3.6 },
      { ...LANE, flow: 'fwd' },
      WALK,
    ],
  },
  // The same street drawn northward: a lone tile that DID record a direction,
  // so it should lie across the other axis from the three above.
  {
    id: 'footways-on-northward',
    at: { x: 0, z: 10 },
    profile: 23,
    flow: 1,
    pieces: [WALK, { ...LANE, flow: 'back' }, { ...LANE, flow: 'fwd' }, WALK],
  },
  // Four lanes fill the tile edge to edge, so there is no room left for a
  // turnaround bulb at either end — the case that says whether the cap is
  // sized by the road or by the room.
  {
    id: 'wide',
    at: { x: 10, z: 10 },
    profile: 24,
    class: 'urban',
    pieces: [
      { kind: 'sidewalk', width: 0.9 },
      { kind: 'travel', width: 3.5, flow: 'back' },
      { kind: 'travel', width: 3.5, flow: 'back' },
      { kind: 'travel', width: 3.5, flow: 'fwd' },
      { kind: 'travel', width: 3.5, flow: 'fwd' },
      { kind: 'sidewalk', width: 0.9 },
    ],
  },
];

for (const c of CASES) {
  await cmd('define', [
    {
      kind: 'defineRoadProfile',
      id: c.profile,
      profile: { class: c.class ?? 'local', pieces: c.pieces },
    },
  ]);
  const build = {
    kind: 'buildRoad',
    tier: TWO_LANE,
    tiles: [{ x: X + c.at.x, z: Z + c.at.z }],
    profile: c.profile,
  };
  if (c.flow) build.flows = [c.flow];
  await cmd(c.id, [build]);
}
await page.waitForTimeout(2500);

const failures = [];
const grid = await readGrid();
const allSigns = await signs();

for (const c of CASES) {
  const tx = X + c.at.x;
  const tz = Z + c.at.z;
  const i = idx(tx, tz);
  const a = await approach(tx, tz);
  const near = allSigns.filter(
    (s) => Math.abs(s.x - tx) <= 1 && Math.abs(s.z - tz) <= 1,
  );
  console.log(
    c.id,
    JSON.stringify({
      tier: grid.roadTier[i],
      profile: grid.roadProfile?.[i],
      flow: grid.roadFlow?.[i],
      width: a?.width,
      lanes: a?.lanes,
      signs: near.map((s) => s.type),
    }),
  );

  if (grid.roadTier[i] === 0)
    failures.push(`${c.id}: the tile did not take the road at all`);
  // Nothing about a lone stub warrants a control board: there is no junction
  // and no traffic to hold.
  if (near.length > 0)
    failures.push(`${c.id}: a lone tile got ${near.map((s) => s.type).join(', ')}`);

  await cam(tx, tz, 34, 0.7, 0.95);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/${c.id}.png` });
  await cam(tx, tz, 26, 0, 1.45);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/${c.id}-top.png` });
}

await cam(X + 8, Z, 90, 0.6, 1.0);
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/all-three.png` });

await b.close();
for (const e of pageErrors) failures.push(`page error: ${e}`);
if (failures.length > 0) {
  console.log('FAIL');
  for (const f of failures) console.log(' -', f);
  process.exitCode = 1;
} else {
  console.log('PASS');
}
