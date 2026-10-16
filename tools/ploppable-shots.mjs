/** Ploppable shots: the clinic, the rail station and the bus stop, each drawn
 * by its kit beside a street. A railway runs one block north of the street with
 * two stations on it, one with the track along its short edge and one along its
 * long edge; the clinic and two bus stops stand on the street's south kerb, and
 * a bus line stops on one of the bus stops' tiles so the line draws no shelter
 * of its own there. Each shot at the default pitch beside the 4 m car, and the
 * same at night.
 *
 * Usage: node tools/ploppable-shots.mjs [baseUrl]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { hooksReady, tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = 'tools/shots-ploppables';
mkdirSync(out, { recursive: true });

const RT = { TwoLane: 1, RailTrack: 11 };

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

// A dry, flat strip to build the block across.
const g0 = await hook(() => window.__slimcity.readGrid());
const N = g0.size;
const idx = (x, z) => z * N + x;
let anchor = null;
for (let z = 40; z < N - 40 && !anchor; z++) {
  for (let x = 40; x < N - 60; x++) {
    let ok = true;
    for (let k = 0; k < 44 && ok; k++) {
      for (let dz = -6; dz <= 6 && ok; dz++) {
        const i = idx(x + k, z + dz);
        if (g0.water[i] || Math.abs(g0.height[i]) > 22) ok = false;
      }
    }
    if (ok) anchor = { x, z };
  }
}
if (!anchor) {
  console.log('no dry strip found');
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
// The street along row Z, the railway four rows north of it.
await row(Z, RT.TwoLane, X, X + 40);
await row(Z - 4, RT.RailTrack, X, X + 40);
await page.waitForTimeout(800);

const place = (catalogId, x, z, rotation) =>
  cmd(catalogId, [{ kind: 'placeBuilding', catalogId, x, z, rotation }]);
// Station A fills the block between the track and the street, its short edge on
// the track; station B stands with its long edge on the track.
await place('rail-station', X + 8, Z - 3, 0);
await place('rail-station', X + 22, Z - 3, 1);
// The clinic and the bus stops on the street's south kerb, turned to face it.
await place('clinic', X + 2, Z + 1, 2);
await place('bus-stop', X + 6, Z + 1, 2);
await place('bus-stop', X + 14, Z + 1, 2);
await page.waitForTimeout(800);

// A bus line whose first stop stands on the second bus stop's tile and whose
// last stands on bare kerb: one kit shelter, one line shelter.
await cmd('Bus line', [
  {
    kind: 'createTransitLine',
    line: {
      id: 0,
      color: 0xef5350,
      stops: [
        { x: X + 14, z: Z + 1 },
        { x: X + 18, z: Z + 1 },
      ],
    },
  },
]);
await page.waitForTimeout(1500);

const standing = await hook(() =>
  window.__slimcity
    .readBuildings()
    .filter((b) => ['clinic', 'rail-station', 'bus-stop'].includes(b.catalogId))
    .map((b) => `${b.catalogId}@${b.x},${b.z}r${b.rotation}`),
);
console.log('standing', JSON.stringify(standing));
const transit = await hook(() => window.__slimcity.readTransitRender());
console.log('transit render', JSON.stringify(transit));

const T = await hook(() => window.__slimcity.tileMeters());
// Cars on the street for scale: before the clinic, the station and the bus stop.
await hook(
  ([tile, x, z]) =>
    window.__slimcity.setVehicles([
      { x: (x + 2.5) * tile, z: (z + 0.65) * tile, heading: Math.PI / 2, kind: 0 },
      { x: (x + 9) * tile, z: (z + 0.35) * tile, heading: -Math.PI / 2, kind: 0 },
      { x: (x + 14.5) * tile, z: (z + 0.65) * tile, heading: Math.PI / 2, kind: 0 },
    ]),
  [T, X, Z],
);

// The camera centres on the tile it is given, so a lot's centre is its origin
// tile plus half its size less a half. The bus stop is aimed at its shelter,
// which stands at the lot's street edge: a tile and a half off the centre.
const PITCH = 0.6;
const clinic = { x: X + 2, z: Z + 1.5 };
const stationA = { x: X + 8.5, z: Z - 2 };
const stationB = { x: X + 23, z: Z - 2.5 };
const shelterOf = (x) => ({ x: x - 0.16, z: Z + 0.56 });
const views = [
  ['a-clinic-street', clinic.x, clinic.z, 60, Math.PI, PITCH],
  ['a2-clinic-dropoff', clinic.x, clinic.z - 0.3, 42, Math.PI - 0.7, 0.45],
  ['b-station-track', stationA.x, stationA.z - 0.4, 85, Math.PI, PITCH],
  ['b2-station-street', stationA.x, stationA.z + 0.4, 85, 0, PITCH],
  ['b3-station-long-track', stationB.x, stationB.z - 0.2, 95, Math.PI, PITCH],
  ['b4-station-long-street', stationB.x, stationB.z + 0.3, 95, 0.4, PITCH],
  ['c-busstop', shelterOf(X + 6).x, shelterOf(X + 6).z, 42, Math.PI, 0.75],
  ['c1-busstop-close', shelterOf(X + 6).x, shelterOf(X + 6).z, 40, Math.PI + 0.5, 0.35],
  ['c2-busstop-with-line-stop', shelterOf(X + 14).x, shelterOf(X + 14).z, 42, Math.PI, 0.75],
];
for (const [name, tx, tz, d, yaw, pitch] of views) {
  await camera(tx, tz, d, yaw, pitch);
  await shot(name);
}

// The line's own shelter shows under the transit lens, where every line's does.
await hook(() => window.__slimcity.setOverlay('transit'));
for (const [name, tx, tz, d, yaw, pitch] of [
  ['c3-line-both-stops', X + 15.5, Z + 0.7, 105, Math.PI, 0.7],
  ['c4-line-own-shelter', X + 17.5, Z + 0.5, 42, Math.PI + 0.4, 0.5],
]) {
  await camera(tx, tz, d, yaw, pitch);
  await shot(name);
}
await hook(() => window.__slimcity.setOverlay(null));

await hook(() => window.__slimcity.setDayT(0.96));
await cmd('Phase', [{ kind: 'setUnlimitedMoney', on: true }]);
await page.waitForTimeout(2000);
for (const [name, tx, tz, d, yaw, pitch] of [
  ['d-clinic-night', clinic.x, clinic.z, 60, Math.PI, PITCH],
  ['d2-station-night', stationA.x, stationA.z + 0.4, 85, 0, PITCH],
  ['d3-busstop-night', shelterOf(X + 14).x, shelterOf(X + 14).z, 42, Math.PI, 0.75],
]) {
  await camera(tx, tz, d, yaw, pitch);
  await shot(name, 2500);
}

console.log('page errors', errors.length ? errors : 'none');
await browser.close();
