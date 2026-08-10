/** Street-lamp night glow validation: grow a small residential street, then
 * pin the day/night clock at exact hours and shoot the same view at each —
 * lamps must bloom heavily overnight, dim through the hour after sunrise, and
 * be fully dark at 07:00 while the houses' own window bloom is unchanged.
 * Runs with bloom ON (no ?nobloom) — the glow IS the thing under test. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:5174';
const out = process.argv[3] ?? 'tools/shots-lampglow';
mkdirSync(out, { recursive: true });
const RT = { TwoLane: 1 };
const ZONE = { ResLow: 1 };
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
await page.goto(base, { waitUntil: 'domcontentloaded' });
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
const setDayT = (t) => call((x) => window.__slimcity.setDayT(x), t);
const cam = (tx, tz, d) =>
  call(
    ([x, z, dd]) => window.__slimcity.setCamera((x + 0.5) * 16, (z + 0.5) * 16, dd),
    [tx, tz, d],
  );

const g = await readGrid();
const N = g.size;
const idx = (x, z) => z * N + x;
const okTile = (x, z, h0) =>
  x >= 0 &&
  z >= 0 &&
  x < N &&
  z < N &&
  !g.water[idx(x, z)] &&
  Math.abs(g.height[idx(x, z)] - h0) <= 8;
let A = null;
for (let z = 25; z < N - 30 && !A; z++)
  for (let x = 25; x < N - 35 && !A; x++) {
    const h0 = g.height[idx(x, z)];
    let ok = true;
    for (let dz = -4; dz < 8 && ok; dz++)
      for (let dx = -2; dx < 26 && ok; dx++) if (!okTile(x + dx, z + dz, h0)) ok = false;
    if (ok) A = { x, z };
  }
if (!A) {
  console.log('no anchor');
  await b.close();
  process.exit(1);
}
const X = A.x,
  Z = A.z;
console.log('anchor', JSON.stringify(A));
await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await page.waitForTimeout(200);
const rect = (x0, x1, z0, z1) =>
  Array.from({ length: (x1 - x0 + 1) * (z1 - z0 + 1) }, (_, i) => ({
    x: x0 + (i % (x1 - x0 + 1)),
    z: z0 + Math.floor(i / (x1 - x0 + 1)),
  }));

// One long street with houses on both sides: lamps alternate sides along it.
await cmd('R', [
  {
    kind: 'buildRoad',
    tier: RT.TwoLane,
    tiles: Array.from({ length: 24 }, (_, i) => ({ x: X + i, z: Z })),
  },
]);
// Utilities must TOUCH a road tile for power/water to enter the network.
await cmd('Wind Turbine', [
  { kind: 'placeBuilding', catalogId: 'wind-turbine', x: X + 1, z: Z - 1, rotation: 0 },
]);
await cmd('Water Tower', [
  { kind: 'placeBuilding', catalogId: 'water-tower', x: X + 4, z: Z - 2, rotation: 0 },
]);
await cmd('Zone', [
  { kind: 'paintZone', zone: ZONE.ResLow, tiles: rect(X + 7, X + 22, Z + 1, Z + 2) },
]);
await cmd('Zone', [
  { kind: 'paintZone', zone: ZONE.ResLow, tiles: rect(X + 8, X + 22, Z - 2, Z - 1) },
]);

await setSpeed(4);
for (let i = 0; i < 600; i++) {
  const s = await stats();
  if ((s.population ?? 0) >= 20) break;
  await page.waitForTimeout(200);
}
await setSpeed(1);
console.log('pop', (await stats()).population);

const shot = async (name, hour, tx, tz, d) => {
  await cam(tx, tz, d);
  await setDayT(hour / 24);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name, 'hour', hour);
};
// Street-level: lamp heads next to lit house windows — the comparison the
// change is judged on.
await shot('lamps-2200-night', 22, X + 12, Z, 30);
await shot('lamps-0300-deep-night', 3, X + 12, Z, 30);
await shot('lamps-0600-sunrise', 6, X + 12, Z, 30);
await shot('lamps-0630-fading', 6.5, X + 12, Z, 30);
await shot('lamps-0700-off', 7, X + 12, Z, 30);
await shot('lamps-1200-day', 12, X + 12, Z, 30);
await shot('lamps-1830-lighting-up', 18.5, X + 12, Z, 30);
// Wide: the whole street after dark, lamps beading down it.
await shot('lamps-2200-street', 22, X + 12, Z, 70);
console.log('done');
await b.close();
