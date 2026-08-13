/** Rail transit check (SPEC 26): lay track, plop stations on it, draw a rail
 * line between them, and report what the sim actually did — did the line route
 * over the track, does it carry riders, did the station refuse to sit where no
 * track reaches — then shoot the result.
 *
 * Usage: node tools/rail-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-rail';
mkdirSync(out, { recursive: true });

const RT = { TwoLane: 1, RailTrack: 11 };

const b = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
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

const call = (fn, ...a) => page.evaluate(fn, ...a);
const cmd = (l, c) => call(([x, y]) => window.__slimcity.cmd(x, y), [l, c]);
const readGrid = () => call(() => window.__slimcity.readGrid());
const readBuildings = () => call(() => window.__slimcity.readBuildings());
const stats = () => call(() => window.__slimcity.getStats());
const setSpeed = (s) => call((x) => window.__slimcity.setSpeed(x), s);
const cam = (tx, tz, d, yaw, pitch) =>
  call(
    ([x, z, dd, yy, pp]) =>
      window.__slimcity.setCamera((x + 0.5) * 16, (z + 0.5) * 16, dd, yy, pp),
    [tx, tz, d, yaw, pitch],
  );

const g0 = await readGrid();
const N = g0.size;
const idx = (x, z) => z * N + x;

// A dry, flat-ish strip to build a railway across.
let anchor = null;
for (let z = 40; z < N - 40 && !anchor; z++) {
  for (let x = 40; x < N - 60; x++) {
    let ok = true;
    for (let k = 0; k < 40 && ok; k++) {
      for (let dz = -4; dz <= 4 && ok; dz++) {
        const i = idx(x + k, z + dz);
        if (g0.water[i] || Math.abs(g0.height[i]) > 22) ok = false;
      }
    }
    if (ok) {
      anchor = { x, z };
      break;
    }
  }
}
if (!anchor) {
  console.log('no dry strip found');
  await b.close();
  process.exit(1);
}
const { x: X, z: Z } = anchor;
console.log('anchor', JSON.stringify(anchor));

await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
await page.waitForTimeout(300);

// Track along row Z, a parallel street two rows south for the relief check.
const row = (z, tier, x0, x1) =>
  cmd('R', [
    {
      kind: 'buildRoad',
      tier,
      tiles: Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, z })),
    },
  ]);
await row(Z, RT.RailTrack, X, X + 36);
await row(Z + 6, RT.TwoLane, X, X + 36);
await page.waitForTimeout(700);

// Stations: touching the track (should place) and well away from it (should not).
const place = (x, z) =>
  cmd('Station', [{ kind: 'placeBuilding', catalogId: 'rail-station', x, z, rotation: 0 }]);
await place(X + 2, Z + 1); // touches the track's south side
await place(X + 30, Z + 1);
await place(X + 15, Z + 12); // nowhere near track — must be refused
await page.waitForTimeout(700);

const buildings = await readBuildings();
const stations = buildings.filter((bl) => bl.catalogId === 'rail-station');
console.log(
  'stations placed:',
  stations.length,
  stations.map((s) => `(${s.x},${s.z})`).join(' '),
);

// The rail line between the two stations.
await cmd('Rail line', [
  {
    kind: 'createTransitLine',
    line: {
      id: 0,
      color: 0x42a5f5,
      mode: 'rail',
      stops: [
        { x: X + 2, z: Z },
        { x: X + 30, z: Z },
      ],
    },
  },
]);
// A bus line on the parallel street, to prove both modes still work together.
await cmd('Bus line', [
  {
    kind: 'createTransitLine',
    line: {
      id: 0,
      color: 0xef5350,
      stops: [
        { x: X + 4, z: Z + 6 },
        { x: X + 28, z: Z + 6 },
      ],
    },
  },
]);
await page.waitForTimeout(900);

await setSpeed(4);
await page.waitForTimeout(2500);
const dayTof = (t) => ((t + 900) % 2400) / 2400;
for (let i = 0; i < 500; i++) {
  const d = dayTof((await stats()).tick);
  if (d >= 0.47 && d <= 0.53) {
    await setSpeed(0);
    break;
  }
  await page.waitForTimeout(120);
}

const transit = await call(() => {
  const s = window.__slimcity.readTransit ? window.__slimcity.readTransit() : null;
  return s;
});
console.log('transit snapshot:', JSON.stringify(transit));

const shot = async (name, tx, tz, d, yaw, pitch) => {
  await cam(tx, tz, d, yaw, pitch);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
};
await shot('station', X + 2, Z, 40, 0, 0.4);
await shot('train-side', X + 16, Z, 45, 0, 0.18);
await shot('line-overview', X + 18, Z + 2, 150, 0.5, 0.8);

console.log('done ->', out);
await b.close();
