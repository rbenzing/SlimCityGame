/** Road-on-slope conformance validation: find a genuinely SLOPED patch of the
 * (deterministic, seed-12345) map, build every clip-prone road shape across
 * the gradient — a straight cross-slope run, a dead-end stub (semicircle cap),
 * an L-turn, and a wide avenue — then shoot close-ups. Run BEFORE and AFTER a
 * conformance fix with different out dirs; the anchor search is deterministic,
 * so both runs frame identical terrain. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:5174';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-roadslope';
mkdirSync(out, { recursive: true });
const RT = { TwoLane: 1, Avenue: 2 };
const b = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
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
const cam = (tx, tz, d) =>
  call(
    ([x, z, dd]) => window.__slimcity.setCamera((x + 0.5) * 16, (z + 0.5) * 16, dd),
    [tx, tz, d],
  );

const g = await readGrid();
const N = g.size;
const idx = (x, z) => z * N + x;
// Find a water-free 18x14 patch containing the STEEPEST local terrain step
// (max height difference between adjacent tiles) — terrace cliffs are where
// the old road mesh visibly clips into / floats above the ground.
let A = null;
let bestCliff = 0;
for (let z = 20; z < N - 34; z++)
  for (let x = 20; x < N - 38; x++) {
    let cliff = 0;
    let wet = false;
    for (let dz = 0; dz < 14 && !wet; dz++)
      for (let dx = 0; dx < 18; dx++) {
        const i = idx(x + dx, z + dz);
        if (g.water[i]) {
          wet = true;
          break;
        }
        const h = g.height[i];
        if (dx > 0) cliff = Math.max(cliff, Math.abs(h - g.height[idx(x + dx - 1, z + dz)]));
        if (dz > 0) cliff = Math.max(cliff, Math.abs(h - g.height[idx(x + dx, z + dz - 1)]));
      }
    if (wet) continue;
    if (cliff > bestCliff) {
      bestCliff = cliff;
      A = { x, z };
    }
  }
if (!A) {
  console.log('no sloped anchor');
  await b.close();
  process.exit(1);
}
const X = A.x,
  Z = A.z;
console.log('anchor', JSON.stringify(A), 'cliff', bestCliff);
await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await page.waitForTimeout(200);
const hrow = (z, x0, x1, tier) =>
  cmd('R', [
    {
      kind: 'buildRoad',
      tier,
      tiles: Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, z })),
    },
  ]);
const vcol = (x, z0, z1, tier) =>
  cmd('R', [
    {
      kind: 'buildRoad',
      tier,
      tiles: Array.from({ length: z1 - z0 + 1 }, (_, i) => ({ x, z: z0 + i })),
    },
  ]);

// Straight two-lane run across the slope + an L-turn at its east end.
await hrow(Z + 4, X + 1, X + 12, RT.TwoLane);
await vcol(X + 12, Z + 4, Z + 10, RT.TwoLane);
// Dead-end stub on the gradient (semicircular cap + wrap curb).
await vcol(X + 4, Z + 6, Z + 9, RT.TwoLane);
// Wide avenue run on the slope (15m carriageway = worst diagonal error).
await hrow(Z + 11, X + 1, X + 12, RT.Avenue);
await page.waitForTimeout(600);
// Buildings AFTER the roads: their auto-flatten re-grades terrain cells right
// beside existing road tiles — the stale-heights case where the road mesh
// keeps pre-flatten geometry (buried edges / floating caps) until fixed.
await cmd('Water Tower', [
  { kind: 'placeBuilding', catalogId: 'water-tower', x: X + 6, z: Z + 2, rotation: 0 },
]);
await cmd('Wind Turbine', [
  { kind: 'placeBuilding', catalogId: 'wind-turbine', x: X + 3, z: Z + 10, rotation: 0 },
]);
await page.waitForTimeout(600);

// Settle to midday, pause.
await setSpeed(4);
await page.waitForTimeout(1200);
const dayTof = (t) => ((t + 900) % 2400) / 2400;
for (let i = 0; i < 500; i++) {
  const t = (await stats()).tick;
  const d = dayTof(t);
  if (d >= 0.47 && d <= 0.53) {
    await setSpeed(0);
    break;
  }
  await page.waitForTimeout(120);
}
await page.waitForTimeout(400);
console.log('built + paused dayT=' + dayTof((await stats()).tick).toFixed(3));

const shot = async (name, tx, tz, d) => {
  await cam(tx, tz, d);
  await page.waitForTimeout(850);
  await page.screenshot({ path: `${out}/${name}.png` });
};
await shot('straight-slope', X + 6, Z + 4, 18);
await shot('deadend-slope', X + 4, Z + 8, 14);
await shot('turn-slope', X + 12, Z + 5, 16);
await shot('avenue-slope', X + 6, Z + 11, 20);
await shot('overview', X + 7, Z + 7, 55);
console.log('done');
await b.close();
