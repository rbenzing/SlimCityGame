/** Shots of a low-density home's yard: the zoned rows behind its lot, drawn as one deep garden.
 * Four streets zoned three deep, one frontage each: half lots (poor land), normal lots,
 * estates (which reach the zoning depth themselves and so have no yard), and a street with a
 * cross street, homes west of it and unbuilt zoned parcels east of it.
 * Frames: `yards-half-above`, `yards-half-street`, `yards-normal-above`, `yards-normal-street`,
 * `yards-corner-above`, `yards-lens` (the zone lens over the corner street, unbuilt parcels
 * outlined with their yards) and `yards-night`. 7 frames.
 * Homes are placed by command along each street with the sim paused: a running sim with no
 * supply abandons and clears them within a minute. Land value is not set, so the half and
 * normal streets are the half and normal homes' own lots.
 *
 * Usage: node tools/yard-shots.mjs [baseUrl] [outDir]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { cleanShot, hooksReady, tileCamera, unlimitedMoneyOption } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'tools/shots-yards';
mkdirSync(out, { recursive: true });

const SEED = 7;
const RES_LOW = 1;
const HOMES = 6;
/** Rows a street takes: three zoned, the road, and the gap to the next street. */
const ROWS = 8;
const STREETS = [
  { name: 'half', id: 'res-half-1', w: 1, d: 1 },
  { name: 'normal', id: 'res-normal-1', w: 1, d: 2 },
  { name: 'estate', id: 'res-estate-1', w: 2, d: 3 },
  { name: 'corner', id: 'res-half-1', w: 1, d: 1 },
];

const failures = [];
const fail = (msg) => {
  failures.push(msg);
  console.log('[FAIL]', msg);
};

const browser = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console.error]', m.text());
});
page.on('pageerror', (e) => fail(`pageerror ${e.message}`));
await unlimitedMoneyOption(page);
await page.addInitScript(
  ([session]) => {
    try {
      sessionStorage.setItem('slimcity.session', JSON.stringify(session));
      const saved = JSON.parse(localStorage.getItem('slimcity.settings') ?? '{}');
      localStorage.setItem(
        'slimcity.settings',
        JSON.stringify({ ...saved, sandboxUnlockAll: true, unlimitedMoney: true }),
      );
    } catch (e) {
      void e;
    }
  },
  [{ screen: 'playing', seed: SEED, mode: 'new' }],
);

try {
  await page.goto(base + '?nobloom', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#viewport canvas', { timeout: 60000 });
  await hooksReady(page);
  const cam = tileCamera(page);
  const send = (label, commands) =>
    page.evaluate(([l, c]) => window.__slimcity.cmd(l, c), [label, commands]);
  await send('Sandbox', [{ kind: 'setSandbox', on: true }]);
  await send('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
  await page.evaluate(() => {
    window.__slimcity.setSpeed(0);
    window.__slimcity.setDayT(0.5);
  });

  const g = await page.evaluate(() => window.__slimcity.readGrid());
  const N = g.size;
  const idx = (x, z) => z * N + x;
  const flat = (x, z, h0) => !g.water[idx(x, z)] && Math.abs(g.height[idx(x, z)] - h0) <= 6;
  const rowsNeeded = STREETS.length * ROWS + 2;
  let anchor = null;
  for (let z = 20; z < N - rowsNeeded - 10 && !anchor; z++) {
    for (let x = 20; x < N - 30 && !anchor; x++) {
      const h0 = g.height[idx(x, z)];
      let ok = true;
      for (let dz = -1; dz < rowsNeeded && ok; dz++) {
        for (let dx = -2; dx < 20 && ok; dx++) if (!flat(x + dx, z + dz, h0)) ok = false;
      }
      if (ok) anchor = { x, z };
    }
  }
  if (!anchor) throw new Error('no flat dry ground for the streets');
  const { x: X, z: Z0 } = anchor;
  const roadRow = (s) => Z0 + 4 + s * ROWS;
  const row = (z, x0, x1) => Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, z }));
  const zoneRows = (z, x0, x1) => [1, 2, 3].flatMap((k) => row(z - k, x0, x1));

  for (const [s] of STREETS.entries()) {
    await send('Street', [{ kind: 'buildRoad', tier: 1, tiles: row(roadRow(s), X - 2, X + 15) }]);
    if (s < 3) {
      await send('Zone', [
        { kind: 'paintZone', zone: RES_LOW, tiles: zoneRows(roadRow(s), X, X + 11) },
      ]);
    }
  }
  // The corner street: a cross street at X + 8, homes west of it, zoned parcels east of it left unbuilt.
  const cz = roadRow(3);
  await send('Cross street', [
    {
      kind: 'buildRoad',
      tier: 1,
      tiles: Array.from({ length: 6 }, (_, i) => ({ x: X + 8, z: cz - 5 + i })),
    },
  ]);
  await send('Zone', [
    {
      kind: 'paintZone',
      zone: RES_LOW,
      tiles: [...zoneRows(cz, X, X + 7), ...zoneRows(cz, X + 9, X + 13)],
    },
  ]);
  await send('Connector', [
    {
      kind: 'buildRoad',
      tier: 1,
      tiles: Array.from({ length: roadRow(3) - roadRow(0) + 1 }, (_, i) => ({
        x: X + 16,
        z: roadRow(0) + i,
      })),
    },
  ]);
  await send('Power', [
    {
      kind: 'placeBuilding',
      catalogId: 'wind-turbine',
      x: X + 16,
      z: roadRow(0) - 1,
      rotation: 0,
    },
  ]);
  // One command each: a batch is atomic, and one refused tile would drop the street.
  const spots = [];
  for (const [s, f] of STREETS.entries()) {
    for (let i = 0; i < HOMES; i++) {
      const spot = { catalogId: f.id, x: X + i * f.w, z: roadRow(s) - f.d };
      spots.push(spot);
      await send('Home', [{ kind: 'placeBuilding', ...spot, rotation: 0 }]);
    }
  }
  await page.waitForTimeout(3000);
  const standing = await page.evaluate(() => window.__slimcity.readBuildings());
  const missing = spots.filter(
    (h) => !standing.some((b) => b.catalogId === h.catalogId && b.x === h.x && b.z === h.z),
  );
  if (missing.length > 0) {
    throw new Error(
      `not standing: ${missing.map((h) => `${h.catalogId}@${h.x},${h.z}`).join(' ')}`,
    );
  }

  const shoot = async (name, tx, tz, distance, yaw, pitch) => {
    await cam(tx, tz, distance, yaw, pitch);
    await page.waitForTimeout(1200);
    await cleanShot(page, `${out}/${name}.png`);
  };
  const midX = (f) => X + (HOMES * f.w) / 2 - 0.5;
  for (const [s, f] of STREETS.entries()) {
    if (f.name === 'estate') continue;
    const midZ = roadRow(s) - 2;
    if (f.name !== 'corner') {
      await shoot(`yards-${f.name}-street`, midX(f), midZ + 1, 110, 0, 0.55);
    }
    await shoot(`yards-${f.name}-above`, midX(f), midZ + 0.5, 150, 0, 1.45);
  }

  // The zone lens over the corner street: the unbuilt parcels east of the cross street show their yards.
  await page.evaluate(() => window.__slimcity.setTool('zone.resLow'));
  await page.waitForTimeout(1500);
  await shoot('yards-lens', X + 7, cz - 1.5, 170, 0, 1.45);
  await page.evaluate(() => window.__slimcity.setTool('select'));

  await page.evaluate(() => {
    window.__slimcity.setDayT(0.96);
    window.__slimcity.cmd('Phase', [{ kind: 'setUnlimitedMoney', on: true }]);
  });
  await page.waitForTimeout(2000);
  await shoot('yards-night', X + 5, roadRow(1) - 1, 300, 0.3, 1.1);
} catch (e) {
  fail(e.stack ?? String(e));
} finally {
  await browser.close();
}
if (failures.length > 0) process.exit(1);
