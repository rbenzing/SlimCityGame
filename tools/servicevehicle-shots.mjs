/** Service vehicle shots: the six service vehicles (fire engine, police car,
 * ambulance, garbage truck, recycling truck, hearse) parked in a line along a
 * two-lane street beside a 4 m car for scale, each close up at 40 m, and three
 * incident pins (fire, crime, medical) stood by hand over three homes, one of
 * them answered.
 *
 * Frames: lineup, close-fire, close-police, close-ambulance, close-garbage,
 * close-recycling, close-hearse, incident-pins, incident-pin-close,
 * lineup-night.
 *
 * Usage: node tools/servicevehicle-shots.mjs [baseUrl] [outDir]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { cleanShot, hooksReady, tileCamera, unlimitedMoneyOption } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-servicevehicles';
mkdirSync(out, { recursive: true });

const RT = { TwoLane: 1 };
const KIND = { Car: 0, Fire: 3, Police: 4, Ambulance: 5, Garbage: 6, Recycling: 7, Hearse: 8 };

const browser = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
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
await unlimitedMoneyOption(page);

const failures = [];
const check = (ok, what) => {
  if (!ok) {
    failures.push(what);
    console.log('FAILED check:', what);
  }
};

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#viewport canvas', { timeout: 30000 });
  await hooksReady(page);
  await page.waitForTimeout(3000);

  const hook = (fn, arg) => page.evaluate(fn, arg);
  const cmd = (label, commands) =>
    hook(([l, c]) => window.__slimcity.cmd(l, c), [label, commands]);
  const camera = tileCamera(page);
  const shot = async (name, settle = 1800) => {
    await page.waitForTimeout(settle);
    await cleanShot(page, `${out}/${name}.png`);
    console.log('shot', name);
  };

  // A dry, flat block: 40 tiles along the street, 10 rows each side of it.
  const g0 = await hook(() => window.__slimcity.readGrid());
  const N = g0.size;
  const idx = (x, z) => z * N + x;
  let anchor = null;
  for (let z = 40; z < N - 40 && !anchor; z++) {
    for (let x = 40; x < N - 60; x++) {
      let ok = true;
      for (let k = -2; k < 40 && ok; k++) {
        for (let dz = -10; dz <= 10 && ok; dz++) {
          const i = idx(x + k, z + dz);
          if (g0.water[i] || g0.height[i] < 2 || g0.height[i] > 22) ok = false;
        }
      }
      if (ok) anchor = { x, z };
    }
  }
  if (!anchor) {
    process.exitCode = 1;
    throw new Error('no dry block found');
  }
  const { x: X, z: Z } = anchor;
  console.log('anchor', JSON.stringify(anchor));

  await hook(() => window.__slimcity.setDayT(0.5));
  await hook(() => window.__slimcity.setSpeed(0));
  await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
  await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
  await page.waitForTimeout(300);

  // A level plateau, so every home is within the build slope.
  await hook(
    ([x, z, w, h]) => {
      const heights = new Float32Array(w * h).fill(2.0);
      window.__slimcity.cmd('Plateau', [{ kind: 'terraformSet', x, z, w, h, heights }]);
    },
    [X - 3, Z - 12, 44, 25],
  );
  await page.waitForTimeout(1500);

  await cmd('Road', [
    {
      kind: 'buildRoad',
      tier: RT.TwoLane,
      tiles: Array.from({ length: 38 }, (_, i) => ({ x: X - 1 + i, z: Z })),
    },
  ]);
  await page.waitForTimeout(800);

  const place = (catalogId, x, z, rotation) =>
    cmd(catalogId, [{ kind: 'placeBuilding', catalogId, x, z, rotation }]);
  // Homes north of the street, their street side on the kerb; the pins stand
  // over three of them.
  const homesNorth = [X + 8, X + 12, X + 16, X + 20, X + 24, X + 28];
  for (const x of homesNorth) await place('res-low-1', x, Z - 2, 0);
  await page.waitForTimeout(1200);

  const standing = await hook(() =>
    window.__slimcity.readBuildings().filter((b) => b.catalogId === 'res-low-1').length,
  );
  console.log('homes standing', standing);
  check(standing === 6, `homes missing (${standing} of 6)`);

  const T = await hook(() => window.__slimcity.tileMeters());
  // The six service vehicles in the east lane, one every 1.1 tiles heading east,
  // and a 4 m car in the west lane beside the first.
  const order = ['Fire', 'Police', 'Ambulance', 'Garbage', 'Recycling', 'Hearse'];
  const gap = 1.1;
  const startTile = X + 6;
  const laneEast = Z + 0.65;
  const laneWest = Z + 0.35;
  const list = [
    ...order.map((name, i) => ({
      x: (startTile + i * gap) * T,
      z: laneEast * T,
      heading: Math.PI / 2,
      kind: KIND[name],
    })),
    { x: startTile * T, z: laneWest * T, heading: -Math.PI / 2, kind: KIND.Car },
  ];
  await hook((l) => window.__slimcity.setVehicles(l), list);
  await page.waitForTimeout(600);
  const drawn = await hook(() => window.__slimcity.readVehicles());
  console.log('vehicles read back', drawn.length);
  check(drawn.length >= list.length, `vehicles not stood (${drawn.length} of ${list.length})`);

  const PITCH = 0.4;
  // Plain view: no tool in hand and no lens.
  await hook(() => window.__slimcity.setTool('select'));
  await hook(() => window.__slimcity.setOverlay(null));
  const midX = startTile + 2.5 * gap;
  await camera(midX, Z + 0.5, 120, 0, PITCH);
  await shot('lineup');

  // Each vehicle at the camera floor; the tile centre is half a tile in.
  for (let i = 0; i < order.length; i++) {
    await camera(startTile + i * gap - 0.5, laneEast - 0.5, 40, 0.5, 0.35);
    await shot(`close-${order[i].toLowerCase()}`);
  }

  // Incident pins over three homes: fire and medical unanswered, crime answered.
  const pins = [
    { kind: 'fire', x: X + 16.5, z: Z - 1.5, severity: 0.8, answered: false },
    { kind: 'crime', x: X + 20.5, z: Z - 1.5, severity: 0.5, answered: true },
    { kind: 'medical', x: X + 24.5, z: Z - 1.5, severity: 0.9, answered: false },
  ];
  await hook((p) => window.__slimcity.setIncidents(p), pins);
  await page.waitForTimeout(600);
  await camera(X + 20.5, Z - 1, 170, 0, 0.7);
  await shot('incident-pins');
  await camera(X + 16.5, Z - 1.5, 40, 0, 0.7);
  await shot('incident-pin-close');

  // The lineup again at night.
  await hook(() => window.__slimcity.setDayT(0.96));
  await cmd('Phase', [{ kind: 'setUnlimitedMoney', on: true }]);
  await page.waitForTimeout(2000);
  // The command's snapshot clears the parked vehicles; stand them again.
  await hook((l) => window.__slimcity.setVehicles(l), list);
  await camera(midX, Z + 0.5, 120, 0, PITCH);
  await shot('lineup-night', 2500);

  console.log('page errors', errors.length ? errors : 'none');
  if (errors.length) failures.push('page errors');
} catch (e) {
  console.log('error:', e.message);
  failures.push(e.message);
} finally {
  await browser.close();
}
if (failures.length) {
  console.log('FAILURES:', JSON.stringify(failures));
  process.exit(1);
}
