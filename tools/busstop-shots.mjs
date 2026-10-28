/** Shots of bus stops as road furniture: a kerbed two-lane street and a gravel
 * road side by side on flat dry ground, each with a sign on one tile and, on
 * another tile, a shelter on one side and a sign on the other, so a stop on
 * each side of one tile is in frame. An overview of both roads, then close
 * plates (a doubled viewport, the camera's own floor being 40 m) of the sign,
 * the shelter and the two-sided tile on each road, from the south and from the
 * north, which puts the pole at the pad's leading end on each kerb for a reader
 * to check against the lane that arrives there first.
 * Stops are placed by command with the sim paused, as the other harnesses do.
 *
 * Usage: node tools/busstop-shots.mjs [baseUrl] [outDir]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { closeUp, hooksReady, tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'tools/shots-busstops';
mkdirSync(out, { recursive: true });

const SEED = 7;
const TWO_LANE = 1;
const GRAVEL = 4;
const LENGTH = 14;
/** Rows between the kerbed street and the gravel road. */
const GAP = 8;
const DEFAULT_PITCH = 0.7;
/** A stop's own tiles along each road: a lone sign, then a shelter with a sign across from it. */
const SIGN_AT = 3;
const BOTH_AT = 9;

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
    Math.abs(g.height[idx(x, z)] - h0) <= 3;
  let anchor = null;
  for (let z = 20; z < N - GAP - 12 && !anchor; z++) {
    for (let x = 20; x < N - LENGTH - 10 && !anchor; x++) {
      const h0 = g.height[idx(x, z)];
      let ok = true;
      for (let dz = -4; dz <= GAP + 4 && ok; dz++) {
        for (let dx = -2; dx < LENGTH + 2 && ok; dx++) if (!flatDry(x + dx, z + dz, h0)) ok = false;
      }
      if (ok) anchor = { x, z };
    }
  }
  if (!anchor) throw new Error('no flat dry ground for the roads');
  const { x: X, z: Z } = anchor;

  const roads = [
    { name: 'kerbed', tier: TWO_LANE, z: Z },
    { name: 'gravel', tier: GRAVEL, z: Z + GAP },
  ];
  for (const road of roads) {
    await send('Road', [
      {
        kind: 'buildRoad',
        tier: road.tier,
        tiles: Array.from({ length: LENGTH }, (_, i) => ({ x: X + i, z: road.z })),
      },
    ]);
    // One command each: a refused stop must not take the others with it.
    const stop = (dx, side, kind) =>
      send('Stop', [{ kind: 'placeStop', stop: { x: X + dx, z: road.z, side, kind } }]);
    await stop(SIGN_AT, 1, 'sign');
    await stop(BOTH_AT, 1, 'shelter');
    await stop(BOTH_AT, 0, 'sign');
  }
  await page.waitForTimeout(1500);

  const shoot = async (name, tx, tz, distance, yaw, pitch = DEFAULT_PITCH) => {
    await cam(tx, tz, distance, yaw, pitch);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/${name}.png` });
  };
  const midX = X + LENGTH / 2;
  const midZ = Z + GAP / 2;

  await shoot('overview', midX, midZ, 90, 0);

  const back = await closeUp(page, 2);
  const plates = [
    { name: 'sign', at: SIGN_AT },
    { name: 'shelter-and-sign', at: BOTH_AT },
  ];
  for (const road of roads) {
    for (const plate of plates) {
      // From the south (the high side's own kerb) and from the north.
      await shoot(`${road.name}-${plate.name}-south`, X + plate.at, road.z, 40, 0, 0.5);
      await shoot(`${road.name}-${plate.name}-north`, X + plate.at, road.z, 40, Math.PI, 0.5);
    }
  }
  await back();
} finally {
  await browser.close();
}
