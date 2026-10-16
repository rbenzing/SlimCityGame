/** Depot shots: the bus depot and the central bus garage side by side on a
 * street's south kerb with a bus line running, so each apron shows what it
 * holds less what is in service; the tram depot with its long side on a tram
 * street; the rail yard with its long side on the railway. Each at the
 * default pitch beside the 4 m car, and the same at night.
 *
 * Usage: node tools/depot-shots.mjs [baseUrl]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { hooksReady, tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = 'tools/shots-depots';
mkdirSync(out, { recursive: true });

const RT = { TwoLane: 1, Tram: 10, RailTrack: 11 };

const browser = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
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
await page.waitForSelector('#viewport canvas', { timeout: 30000 });
await hooksReady(page);
await page.waitForTimeout(3000);

const hook = (fn, arg) => page.evaluate(fn, arg);
const cmd = (label, commands) => hook(([l, c]) => window.__slimcity.cmd(l, c), [label, commands]);
const camera = tileCamera(page);
const shot = async (name, settle = 1800) => {
  await page.waitForTimeout(settle);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
};

// A dry, flat block to build the three yards across.
const g0 = await hook(() => window.__slimcity.readGrid());
const N = g0.size;
const idx = (x, z) => z * N + x;
let anchor = null;
for (let z = 40; z < N - 60 && !anchor; z++) {
  for (let x = 40; x < N - 60; x++) {
    let ok = true;
    for (let k = 0; k < 44 && ok; k++) {
      for (let dz = -4; dz <= 22 && ok; dz++) {
        const i = idx(x + k, z + dz);
        if (g0.water[i] || Math.abs(g0.height[i]) > 22) ok = false;
      }
    }
    if (ok) anchor = { x, z };
  }
}
if (!anchor) {
  console.log('no dry block found');
  await browser.close();
  process.exit(1);
}
const { x: X, z: Z } = anchor;
console.log('anchor', JSON.stringify(anchor));

await hook(() => window.__slimcity.setDayT(0.5));
await hook(() => window.__slimcity.setSpeed(0));
await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
await page.waitForTimeout(300);

const row = (z, tier, x0, x1) =>
  cmd('Road', [
    {
      kind: 'buildRoad',
      tier,
      tiles: Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, z })),
    },
  ]);
const col = (x, tier, z0, z1) =>
  cmd('Road', [
    {
      kind: 'buildRoad',
      tier,
      tiles: Array.from({ length: z1 - z0 + 1 }, (_, i) => ({ x, z: z0 + i })),
    },
  ]);
// The street along row Z, with side streets for the depots' gate node and
// the first stop's node; the tram street ten rows south, the railway sixteen
// rows south (ending short of the side street that ties the block together),
// and a street under the rail yard for its power.
await row(Z, RT.TwoLane, X, X + 40);
await col(X + 5, RT.TwoLane, Z + 1, Z + 5);
await col(X + 15, RT.TwoLane, Z + 1, Z + 4);
await col(X + 38, RT.TwoLane, Z + 1, Z + 20);
await row(Z + 10, RT.Tram, X, X + 38);
await row(Z + 16, RT.RailTrack, X, X + 30);
await row(Z + 20, RT.TwoLane, X + 15, X + 38);
await page.waitForTimeout(800);

const place = (catalogId, x, z, rotation) =>
  cmd(catalogId, [{ kind: 'placeBuilding', catalogId, x, z, rotation }]);
// Power from a turbine at the street's east end. The depots on the south
// kerb turned to face the street; the stops on the north kerb.
await place('wind-turbine', X + 36, Z - 1, 0);
await place('bus-depot', X + 2, Z + 1, 2);
await place('bus-garage', X + 7, Z + 1, 2);
await place('bus-stop', X + 14, Z - 1, 0);
await place('bus-stop', X + 24, Z - 1, 0);
// The tram depot with its long side on the tram street; the rail yard with
// its long side on the railway.
await place('tram-depot', X + 12, Z + 11, 1);
await place('rail-yard', X + 20, Z + 17, 1);
await page.waitForTimeout(800);

// Twelve buses asked for: the nearer depot fields its eight and the garage
// the rest, so the depot's apron shows two at home and the garage's 32.
await cmd('Bus line', [
  {
    kind: 'createTransitLine',
    line: {
      id: 0,
      color: 0xef5350,
      mode: 'bus',
      vehicles: 12,
      stops: [
        { x: X + 14, z: Z - 1 },
        { x: X + 24, z: Z - 1 },
      ],
    },
  },
]);
await page.waitForTimeout(1500);
await hook(() => window.__slimcity.setSpeed(1));
await page.waitForTimeout(2500);
await hook(() => window.__slimcity.setSpeed(0));
await page.waitForTimeout(600);

const standing = await hook(() =>
  window.__slimcity
    .readBuildings()
    .filter((b) => ['bus-depot', 'bus-garage', 'tram-depot', 'rail-yard'].includes(b.catalogId))
    .map((b) => `${b.catalogId}#${b.id}@${b.x},${b.z}r${b.rotation}`),
);
console.log('standing', JSON.stringify(standing));
console.log('transit', JSON.stringify(await hook(() => window.__slimcity.readTransit())));
console.log('parked', JSON.stringify(await hook(() => window.__slimcity.readDepotFleets())));

const T = await hook(() => window.__slimcity.tileMeters());
// Cars on the streets for scale: before the depots, the tram depot and the yard.
await hook(
  ([tile, x, z]) =>
    window.__slimcity.setVehicles([
      { x: (x + 3) * tile, z: (z + 0.65) * tile, heading: Math.PI / 2, kind: 0 },
      { x: (x + 9) * tile, z: (z + 0.35) * tile, heading: -Math.PI / 2, kind: 0 },
      { x: (x + 13) * tile, z: (z + 10.35) * tile, heading: -Math.PI / 2, kind: 0 },
      { x: (x + 22) * tile, z: (z + 20.65) * tile, heading: Math.PI / 2, kind: 0 },
    ]),
  [T, X, Z],
);

const PITCH = 0.6;
const depots = { x: X + 5.5, z: Z + 2.5 };
const depot = { x: X + 2.5, z: Z + 1.5 };
const garage = { x: X + 8, z: Z + 2.5 };
const tram = { x: X + 13, z: Z + 11.5 };
const yard = { x: X + 21.5, z: Z + 18 };
const views = [
  ['a-bus-depots-street', depots.x, depots.z, 130, Math.PI, PITCH],
  ['a2-bus-depot-close', depot.x, depot.z, 60, Math.PI + 0.5, 0.5],
  // The bay doors open onto the drive, east of each shop: looked at from the east.
  ['a3-bus-depot-bays', depot.x - 0.3, depot.z, 55, Math.PI / 2 - 0.3, 0.45],
  ['a4-bus-garage', garage.x, garage.z, 100, Math.PI - 0.5, PITCH],
  ['a5-bus-garage-bays', garage.x - 0.6, garage.z, 80, Math.PI / 2 - 0.4, 0.5],
  // The depot's street-side row from the street, close enough to read which way the buses nose.
  ['a6-bus-noses', depot.x + 0.5, depot.z - 0.2, 40, Math.PI, 0.5],
  ['b-tram-depot-track', tram.x, tram.z, 95, Math.PI, PITCH],
  ['b2-tram-depot-yard', tram.x, tram.z, 90, 0.4, 0.5],
  ['c-rail-yard-track', yard.x, yard.z, 130, Math.PI, PITCH],
  ['c2-rail-yard-street', yard.x, yard.z, 120, 0.3, 0.5],
];
for (const [name, tx, tz, d, yaw, pitch] of views) {
  await camera(tx, tz, d, yaw, pitch);
  await shot(name);
}

await hook(() => window.__slimcity.setDayT(0.96));
await cmd('Phase', [{ kind: 'setUnlimitedMoney', on: true }]);
await page.waitForTimeout(2000);
for (const [name, tx, tz, d, yaw, pitch] of [
  ['d-bus-depots-night', depots.x, depots.z, 130, Math.PI, PITCH],
  ['d2-tram-depot-night', tram.x, tram.z, 95, Math.PI, PITCH],
  ['d3-rail-yard-night', yard.x, yard.z, 130, Math.PI, PITCH],
]) {
  await camera(tx, tz, d, yaw, pitch);
  await shot(name, 2500);
}

console.log('page errors', errors.length ? errors : 'none');
await browser.close();
