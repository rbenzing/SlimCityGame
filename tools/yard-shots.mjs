/** Close shots of what the performance slice lowered: a residential street at
 * about 60 m, with its yard trees, bushes, pools and trampolines, and a solar
 * farm close. Homes are placed by command along a street on flat dry ground
 * with the sim paused, as the frame budget does: a running sim with no power,
 * water or zones abandons and clears them within a minute.
 *
 * Usage: node tools/yard-shots.mjs [baseUrl] [outDir]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { hooksReady, tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'tools/shots-framebudget';
mkdirSync(out, { recursive: true });

const SEED = 7;
const HOMES = 16;
const browser = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.addInitScript(
  ([session]) => {
    try {
      sessionStorage.setItem('slimcity.session', JSON.stringify(session));
      localStorage.setItem(
        'slimcity.settings',
        JSON.stringify({ sandboxUnlockAll: true, unlimitedMoney: true }),
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
  const flatDry = (x, z, h0) =>
    x >= 0 &&
    z >= 0 &&
    x < N &&
    z < N &&
    !g.water[idx(x, z)] &&
    Math.abs(g.height[idx(x, z)] - h0) <= 6;
  let anchor = null;
  for (let z = 20; z < N - 40 && !anchor; z++) {
    for (let x = 20; x < N - 40 && !anchor; x++) {
      const h0 = g.height[idx(x, z)];
      let ok = true;
      for (let dz = -3; dz < 12 && ok; dz++) {
        for (let dx = -2; dx < HOMES + 4 && ok; dx++) if (!flatDry(x + dx, z + dz, h0)) ok = false;
      }
      if (ok) anchor = { x, z };
    }
  }
  if (!anchor) throw new Error('no flat dry ground for the street');
  const { x: X, z: Z } = anchor;

  await send('Street', [
    {
      kind: 'buildRoad',
      tier: 1,
      tiles: Array.from({ length: HOMES + 4 }, (_, i) => ({ x: X - 2 + i, z: Z })),
    },
  ]);
  const homes = Array.from({ length: HOMES }, (_, i) => ({
    kind: 'placeBuilding',
    catalogId: 'res-normal-1',
    x: X + i,
    z: Z - 2,
    rotation: 0,
  }));
  // One command each: a batch is atomic, and one refused tile would drop the street.
  for (const home of homes) await send('Home', [home]);
  await send('Solar', [
    { kind: 'placeBuilding', catalogId: 'solar-farm', x: X + 2, z: Z + 2, rotation: 0 },
  ]);
  await page.waitForTimeout(3000);
  const standing = await page.evaluate(() => window.__slimcity.readBuildings());
  console.log(
    'standing',
    JSON.stringify(
      standing.reduce(
        (m, b) => ((m[`${b.catalogId}:${b.state}`] = (m[`${b.catalogId}:${b.state}`] ?? 0) + 1), m),
        {},
      ),
    ),
  );

  // A paused sim posts a snapshot, which carries the pinned phase to the lighting, only when a command lands.
  await page.evaluate(() => {
    window.__slimcity.setDayT(0.5);
    window.__slimcity.cmd('Phase', [{ kind: 'setUnlimitedMoney', on: true }]);
    for (let i = 0; i < 100; i++) {
      const buttons = document.querySelectorAll('[aria-label="Dismiss notification"]');
      if (buttons.length === 0) return;
      buttons.forEach((b) => b.click());
    }
  });
  await page.waitForTimeout(2000);

  const street = HOMES / 2;
  await cam(X + street, Z - 1, 60, 0.35, 0.5);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/yard-1-street.png` });
  await cam(X + 4, Z - 1, 40, -0.6, 0.55);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/yard-2-street-close.png` });
  await cam(X + 12, Z - 1, 50, 0.3, 0.55);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/yard-2b-street-east.png` });
  await cam(X + 5, Z + 5, 90, 0.4, 0.5);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/yard-3-solar.png` });
  await cam(X + 5, Z + 5, 160, -0.5, 0.7);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/yard-4-solar-wide.png` });
} finally {
  await browser.close();
}
