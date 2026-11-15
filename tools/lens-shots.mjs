/** Lens shots: one lens of each kind (worse, better) over a small grown town, with its legend.
 *
 * Builds two streets, power, water and homes by exact tile, lets the town grow,
 * then shoots Pollution (more is worse), Happiness and Land Value (more is
 * better) and Education reach, each with the legend on screen.
 *
 * Usage: node tools/lens-shots.mjs [baseUrl] [outDir] [growMs]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { cleanShot, tileCamera, unlimitedMoneyOption } from './shotcam.mjs';

const url = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'tools/shots-lens';
const GROW_MS = Number(process.argv[4] ?? 90000);
mkdirSync(out, { recursive: true });

const RT = { TwoLane: 1 };
const ZONE = { ResLow: 1, ComLow: 3, Industrial: 5 };
const LENSES = [
  ['pollution-worse', 1],
  ['happiness-better', 8],
  ['landvalue-better', 0],
  ['education-better', 6],
];

const browser = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.addInitScript(
  (v) => {
    try {
      sessionStorage.setItem('slimcity.session', JSON.stringify(v));
    } catch (e) {
      void e;
    }
  },
  { screen: 'playing', seed: 1, mode: 'new' },
);
await unlimitedMoneyOption(page);
await page.goto(url + (url.includes('?') ? '&' : '?') + 'nobloom', {
  waitUntil: 'domcontentloaded',
});
await page.waitForSelector('#viewport canvas', { timeout: 30000 });
await page.waitForTimeout(4000);

const ready = () =>
  page.waitForFunction(() => !!window.__slimcity && !!window.__slimcity.cmd, null, {
    timeout: 120000,
  });
const call = async (fn, ...a) => {
  await ready();
  return page.evaluate(fn, ...a);
};
const cmd = (label, commands) => call(([l, c]) => window.__slimcity.cmd(l, c), [label, commands]);
const cam = tileCamera(page);

const g = await call(() => window.__slimcity.readGrid());
const N = g.size;
const idx = (x, z) => z * N + x;
const flat = (x, z) => {
  const h0 = g.height[idx(x, z)];
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx;
      const zz = z + dz;
      if (xx < 0 || zz < 0 || xx >= N || zz >= N) return false;
      if (g.water[idx(xx, zz)] || Math.abs(g.height[idx(xx, zz)] - h0) > 3) return false;
    }
  return true;
};
let A = null;
for (let z = 20; z < N - 40 && !A; z += 2)
  for (let x = 20; x < N - 46 && !A; x += 2) {
    let ok = true;
    for (let dz = 0; dz < 30 && ok; dz += 2)
      for (let dx = 0; dx < 40 && ok; dx += 2) if (!flat(x + dx, z + dz)) ok = false;
    if (ok) A = { x, z };
  }
if (!A) {
  console.log('no flat build area');
  await browser.close();
  process.exit(1);
}
const X0 = A.x + 2;
const X1 = A.x + 36;
const Z1 = A.z + 4;
const Z2 = A.z + 18;
const row = (z) => Array.from({ length: X1 - X0 + 1 }, (_, i) => ({ x: X0 + i, z }));
for (const z of [Z1, Z2])
  await cmd('Road', [{ kind: 'buildRoad', tier: RT.TwoLane, tiles: row(z) }]);
await cmd('Road', [
  {
    kind: 'buildRoad',
    tier: RT.TwoLane,
    tiles: Array.from({ length: Z2 - Z1 - 1 }, (_, i) => ({ x: X1, z: Z1 + 1 + i })),
  },
]);
await cmd('Wind Turbine', [
  { kind: 'placeBuilding', catalogId: 'wind-turbine', x: X0, z: Z1 - 1, rotation: 0 },
]);
await cmd('Water Tower', [
  { kind: 'placeBuilding', catalogId: 'water-tower', x: X0 + 3, z: Z1 - 1, rotation: 0 },
]);
await cmd('Coal Plant', [
  { kind: 'placeBuilding', catalogId: 'coal-plant', x: X1 + 1, z: Z1 + 2, rotation: 3 },
]);
const band = (z, zone, depth, keep = () => true) => ({
  kind: 'paintZone',
  zone,
  tiles: Array.from({ length: X1 - X0 + 1 }, (_, i) => X0 + i)
    .filter(keep)
    .flatMap((x) => {
      const t = [];
      for (let d = 1; d <= depth; d++) t.push({ x, z: z - d }, { x, z: z + d });
      return t;
    }),
});
await cmd('Zone', [band(Z1, ZONE.ResLow, 3)]);
await cmd('Zone', [band(Z2, ZONE.ComLow, 2, (x) => x < (X0 + X1) / 2)]);
await cmd('Zone', [band(Z2, ZONE.Industrial, 2, (x) => x >= (X0 + X1) / 2)]);

await call(() => window.__slimcity.setSpeed(2));
const t0 = Date.now();
let s;
while (Date.now() - t0 < GROW_MS) {
  await page.waitForTimeout(6000);
  s = await call(() => window.__slimcity.getStats());
  console.log(`t+${Math.round((Date.now() - t0) / 1000)}s pop=${s.population}`);
}
await call(() => window.__slimcity.setSpeed(0));
await call(() => window.__slimcity.setDayT(0.5));

for (const [name, lens] of LENSES) {
  // The pollution frame is aimed at the coal plant, the town's polluter; the rest at the town.
  if (lens === 1) await cam(X1 + 1, Z1 + 3, 140);
  else await cam((X0 + X1) / 2, (Z1 + Z2) / 2, 260);
  await call((x) => window.__slimcity.setOverlay(x), lens);
  await page.waitForTimeout(2500);
  await cleanShot(page, `${out}/${name}.png`);
  console.log('shot', name);
}
await browser.close();
