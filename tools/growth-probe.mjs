/** Probe why zones aren't developing: paint a minimal town, run the sim, then
 * dump zone/power/water/building counts from the dev grid hooks. */
import { chromium } from 'playwright';
const base = process.argv[2] ?? 'http://localhost:5174';
const b = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
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
await page.goto(base + '?nobloom', { waitUntil: 'domcontentloaded' });
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

const g0 = await readGrid();
const N = g0.size;
const idx = (x, z) => z * N + x;
const okTile = (x, z, h0) =>
  x >= 0 &&
  z >= 0 &&
  x < N &&
  z < N &&
  !g0.water[idx(x, z)] &&
  Math.abs(g0.height[idx(x, z)] - h0) <= 8;
let A = null;
for (let z = 25; z < N - 35 && !A; z++)
  for (let x = 25; x < N - 35 && !A; x++) {
    const h0 = g0.height[idx(x, z)];
    let ok = true;
    for (let dz = -8; dz < 12 && ok; dz++)
      for (let dx = -2; dx < 24 && ok; dx++) if (!okTile(x + dx, z + dz, h0)) ok = false;
    if (ok) A = { x, z };
  }
const X = A.x,
  Z = A.z;
console.log('anchor', JSON.stringify(A));
await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await page.waitForTimeout(200);
await cmd('R', [
  { kind: 'buildRoad', tier: 1, tiles: Array.from({ length: 21 }, (_, i) => ({ x: X + i, z: Z })) },
]);
const r1 = await cmd('Wind Turbine', [
  { kind: 'placeBuilding', catalogId: 'wind-turbine', x: X + 1, z: Z - 1, rotation: 0 },
]);
const r2 = await cmd('Water Tower', [
  { kind: 'placeBuilding', catalogId: 'water-tower', x: X + 4, z: Z - 2, rotation: 0 },
]);
console.log('place results', JSON.stringify(r1), JSON.stringify(r2));
const tiles = [];
for (let x = X + 1; x <= X + 9; x++) for (let z = Z + 1; z <= Z + 2; z++) tiles.push({ x, z });
const r3 = await cmd('Zone', [{ kind: 'paintZone', zone: 1, tiles }]);
console.log('zone result', JSON.stringify(r3));
await page.waitForTimeout(400);
await setSpeed(4);
await page.waitForTimeout(60000);
await setSpeed(0);
const g = await readGrid();
const s = await stats();
let zoned = 0,
  buildings = 0;
for (let x = X; x <= X + 20; x++)
  for (let z = Z - 4; z <= Z + 4; z++) {
    const i = idx(x, z);
    if (g.zone[i]) zoned++;
    if (g.buildingId[i]) buildings++;
  }
console.log(JSON.stringify({ zoned, buildingTiles: buildings }));
console.log('stats', JSON.stringify(s));
await b.close();
