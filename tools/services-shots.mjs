/** Services panel check: the funding slider and the load gauge on one row, and
 * the reading a selected facility gives for itself.
 *
 * The panel is the first place a player can reach service funding at all, and
 * the thing most likely to be wrong about it is not a number but a layout —
 * five rows each carrying a name, a slider, a multiplier, a load and a worst
 * figure, at the panel's own width. A read-back cannot see a column wrap or a
 * slider squeezed too narrow to grab, so this shoots it.
 *
 * It grows a real city first: every load on screen has to come from residents
 * the sim actually counted, or the panel is reading its own defaults back.
 *
 * Usage: node tools/services-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-services';
mkdirSync(out, { recursive: true });

const TWO_LANE = 1;
// Low density deliberately: the dense residential entries are gated behind
// milestone 4, and a city that starts at milestone 0 grows nothing at all in a
// high-density zone however long it is left running.
const ZONE_RES_LOW = 1;
const FIELD_HEALTH = 7;

const b = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.addInitScript(() => {
  try {
    sessionStorage.setItem(
      'slimcity.session',
      JSON.stringify({ screen: 'playing', seed: 12345, mode: 'new' }),
    );
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
const stats = () => call(() => window.__slimcity.getStats());
const setSpeed = (s) => call((x) => window.__slimcity.setSpeed(x), s);
const cam = tileCamera(page);

const g = await readGrid();
const N = g.size;
const idx = (x, z) => z * N + x;
let A = null;
for (let z = 20; z < N - 45 && !A; z++)
  for (let x = 20; x < N - 45 && !A; x++) {
    const h0 = g.height[idx(x, z)];
    let ok = true;
    for (let dz = 0; dz < 34 && ok; dz++)
      for (let dx = 0; dx < 34 && ok; dx++) {
        const i = idx(x + dx, z + dz);
        if (g.water[i] || Math.abs(g.height[i] - h0) > 8) ok = false;
      }
    if (ok) A = { x, z };
  }
if (!A) {
  console.log('no anchor');
  await b.close();
  process.exit(1);
}
const X = A.x;
const Z = A.z;
console.log('anchor', JSON.stringify(A));

await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
await page.waitForTimeout(300);

// A grid of streets, so density can actually arrive: dense blocks need frontage
// on every side, and a single ribbon of road grows a village however long it is.
const row = (z) =>
  cmd('R', [
    {
      kind: 'buildRoad',
      tier: TWO_LANE,
      tiles: Array.from({ length: 31 }, (_, i) => ({ x: X + i, z })),
    },
  ]);
const col = (x) =>
  cmd('R', [
    {
      kind: 'buildRoad',
      tier: TWO_LANE,
      tiles: Array.from({ length: 31 }, (_, i) => ({ x, z: Z + i })),
    },
  ]);
for (let i = 0; i <= 30; i += 6) await row(Z + i);
for (let i = 0; i <= 30; i += 6) await col(X + i);

const zoneBlock = (x0, z0, w, d) =>
  cmd('Zone', [
    {
      kind: 'paintZone',
      zone: ZONE_RES_LOW,
      tiles: Array.from({ length: w * d }, (_, i) => ({
        x: x0 + (i % w),
        z: z0 + Math.floor(i / w),
      })),
    },
  ]);
for (let bz = 0; bz < 30; bz += 6)
  for (let bx = 0; bx < 30; bx += 6) await zoneBlock(X + bx + 1, Z + bz + 1, 5, 5);

// Utilities butted against a street: set back even one tile and nothing is
// powered, nothing grows, and the panel reads zero off an empty city.
// The last road column is at X+30, so a footprint starting at X+31 touches it.
// At X+32 it does not, and a plant one tile clear of the network powers nothing
// — which shows up only as a city that never grows.
await cmd('Utilities', [
  { kind: 'placeBuilding', catalogId: 'coal-plant', x: X + 31, z: Z + 1, rotation: 0 },
  { kind: 'placeBuilding', catalogId: 'water-tower', x: X + 31, z: Z + 7, rotation: 0 },
]);
// One of each capped service, plus the park that deliberately has no capacity.
await cmd('Services', [
  { kind: 'placeBuilding', catalogId: 'clinic', x: X + 1, z: Z + 7, rotation: 0 },
  { kind: 'placeBuilding', catalogId: 'school', x: X + 13, z: Z + 7, rotation: 0 },
  { kind: 'placeBuilding', catalogId: 'police-station', x: X + 7, z: Z + 13, rotation: 0 },
  { kind: 'placeBuilding', catalogId: 'fire-station', x: X + 19, z: Z + 13, rotation: 0 },
  { kind: 'placeBuilding', catalogId: 'small-park', x: X + 25, z: Z + 7, rotation: 0 },
]);

// Everything above is fire-and-forget: a refused placement acks quietly and the
// only symptom is a city that never grows. Count what actually stands before
// spending two minutes waiting on it.
// Commands are posted to the worker and land on a later snapshot, so the
// client mirror is still empty the instant after they are sent.
await page.waitForTimeout(2500);
const placed = await call(() => {
  const g2 = window.__slimcity.readGrid();
  const ids = new Set();
  for (const id of g2.buildingId) if (id !== 0) ids.add(id);
  return ids.size;
});
console.log(`buildings standing after placement: ${placed}`);
if (placed < 7) {
  console.log(`EXPECTED 7 PLOPPABLES, GOT ${placed} — a placement was refused, fix that first`);
  await b.close();
  process.exit(1);
}

await setSpeed(4);
let s = await stats();
for (let i = 0; i < 150; i++) {
  await page.waitForTimeout(1000);
  s = await stats();
  if (s.population >= 6000) break;
}
console.log(`pop ${s.population} — a panel reading zero off an empty city proves nothing`);
if (s.population === 0) console.log('NOTHING GREW: do not read the shots below as a pass');
await setSpeed(0);
await page.waitForTimeout(800);

// Starve one service so the panel has an overloaded row to draw. Funding scales
// capacity AND range together, so this is not a free way to force a red row —
// a smaller catchment holds fewer people too — but it moves the two at
// different rates and a dense grid tips the balance.
await cmd('Starve health', [
  { kind: 'setServiceFunding', service: 'health', funding: 0.1 },
  { kind: 'setServiceFunding', service: 'education', funding: 0.15 },
]);
await page.waitForTimeout(4000);

const load = await call(() => window.__slimcity.getStats?.() ?? null);
console.log('funding after starve:', JSON.stringify(load?.serviceFunding));

// Does money actually relieve a service? The design says funding buys reach AND
// throughput, so a starved service should show queues. Funding scales the range
// too, and a wider catchment holds more people — so the two move together and
// the direction is an open question the panel can answer. Sweep it and read the
// gauge at each setting rather than reasoning about it.
const readLoad = () =>
  call(() =>
    Object.fromEntries(
      ['police', 'fire', 'health', 'education', 'park'].map((k) => {
        const el = document.querySelector(`[data-testid="service-load-${k}"]`);
        return [k, el ? el.textContent.trim() : '?'];
      }),
    ),
  );
await call((f) => window.__slimcity.setOverlay(f), FIELD_HEALTH);
// The sim has to be RUNNING for any of this to mean anything: coverage is
// recomputed on a service pass, so against a paused city every sample below
// reads back the same stale byte and the sweep looks perfectly flat.
await setSpeed(4);
await page.waitForTimeout(500);
for (const f of [0.1, 0.5, 1.0, 1.5]) {
  await cmd('Sweep', [{ kind: 'setServiceFunding', service: 'health', funding: f }]);
  await page.waitForTimeout(4000);
  const row = await readLoad();
  const pop = (await stats()).population;
  console.log(`health funding ×${f.toFixed(2)} -> load ${row.health}  (pop ${pop})`);
}
await cmd('Restore', [{ kind: 'setServiceFunding', service: 'health', funding: 0.1 }]);
await page.waitForTimeout(4000);
await setSpeed(0);
await page.waitForTimeout(600);

// The health lens opens the panel, which is one of its two documented gates.
await call((f) => window.__slimcity.setOverlay(f), FIELD_HEALTH);
await call(() => window.__slimcity.setDayT(0.45));
await cam(X + 15, Z + 15, 260, 0, 0.75);
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/panel-open.png` });

// Just the panel, big enough to read every column at its real width.
const panel = await page.$('[data-testid="services-panel"]');
if (panel) await panel.screenshot({ path: `${out}/panel-detail.png` });
else {
  console.log(
    'NO PANEL: [data-testid="services-panel"] not found — clipping the left slot instead',
  );
  await page.screenshot({
    path: `${out}/panel-detail.png`,
    clip: { x: 0, y: 40, width: 420, height: 320 },
  });
}

console.log('done');
await b.close();
