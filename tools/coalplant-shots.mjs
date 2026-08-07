/** Coal-plant terrain-clip repro: on sloped ground, (A) build a road L with a
 * dead-end curling around a spot, then place a 4x4 coal plant beside it (its
 * flat-mean auto-flatten re-grades terrain under/beside the existing road —
 * the stale-heights case), and (B) the reverse order on a second site. Shoot
 * close-ups of both to verify roads conform after the fix. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:5174';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-coalplant';
mkdirSync(out, { recursive: true });
const RT = { TwoLane: 1 };
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
// Steepest water-free 20x14 patch (same criterion as roadslope-shots).
let A = null;
let bestCliff = 0;
for (let z = 20; z < N - 34; z++)
  for (let x = 20; x < N - 40; x++) {
    let cliff = 0;
    let wet = false;
    for (let dz = 0; dz < 14 && !wet; dz++)
      for (let dx = 0; dx < 20; dx++) {
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
  console.log('no anchor');
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

// SITE A (road first, plant second — the user's layout): a road along the
// plant's south face with a dead-end stub curling up its east side.
await hrow(Z + 6, X + 1, X + 8, RT.TwoLane);
await vcol(X + 8, Z + 2, Z + 6, RT.TwoLane); // dead-end pointing at the plant
await page.waitForTimeout(400);
await cmd('Coal Plant', [
  { kind: 'placeBuilding', catalogId: 'coal-plant', x: X + 3, z: Z + 1, rotation: 0 },
]);
await page.waitForTimeout(400);

// SITE B (plant first, road second) further east.
await cmd('Coal Plant B', [
  { kind: 'placeBuilding', catalogId: 'coal-plant', x: X + 14, z: Z + 1, rotation: 0 },
]);
await page.waitForTimeout(400);
await hrow(Z + 6, X + 12, X + 19, RT.TwoLane);
await vcol(X + 18, Z + 2, Z + 6, RT.TwoLane);
await page.waitForTimeout(600);

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
await shot('roadfirst-south', X + 4, Z + 6, 20);
await shot('roadfirst-deadend', X + 8, Z + 4, 16);
await shot('plantfirst-south', X + 15, Z + 6, 20);
await shot('plantfirst-deadend', X + 18, Z + 4, 16);
await shot('overview', X + 10, Z + 4, 65);
console.log('done');
await b.close();
