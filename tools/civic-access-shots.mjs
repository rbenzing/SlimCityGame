/** Civic access shots: a kerbed street with a fire station, a school, a clinic and
 * a bus depot along its north side, each placed by command facing the street and
 * each given the way in its kit declares (src/shared/civicaccess.ts): the fire
 * station's apron and entrance walk, the school's drive and entrance walk, the
 * clinic's two one-way drives, the depot's gate drive. Shots: the whole street
 * from above, the street at the default pitch, a close read of the fire apron
 * and of the clinic's drives at twice the pixels, the school and the depot, a
 * building turned half a turn so its way in follows it to the north kerb, and
 * the street at night.
 * Buildings are placed with the sim paused, as the other harnesses do: a
 * running sim with no power or water abandons them within a minute.
 *
 * Usage: node tools/civic-access-shots.mjs [baseUrl] [outDir]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { closeUp, hooksReady, tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'tools/shots-civic-access';
mkdirSync(out, { recursive: true });

const SEED = 7;
/** Tiles of street, and the rows the buildings, the road and a turned building take. */
const STREET_TILES = 18;
const ROWS = 12;
const DEFAULT_PITCH = 0.7;
const OVERHEAD_PITCH = 1.2;
const NIGHT = 22 / 24;

/** What stands along the north side, west to east: the id, the tile offset along the street and its depth. */
const NORTH_SIDE = [
  { id: 'fire-station', dx: 1, d: 2 },
  { id: 'school', dx: 4, d: 3 },
  { id: 'clinic', dx: 8, d: 2 },
  { id: 'bus-depot', dx: 10, d: 2 },
];

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

  // Flat dry ground for the street and the buildings on either side of it.
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
  for (let z = 20; z < N - ROWS - 10 && !anchor; z++) {
    for (let x = 20; x < N - STREET_TILES - 10 && !anchor; x++) {
      const h0 = g.height[idx(x, z)];
      let ok = true;
      for (let dz = 0; dz < ROWS && ok; dz++) {
        for (let dx = -1; dx <= STREET_TILES + 1 && ok; dx++) {
          if (!flatDry(x + dx, z + dz, h0)) ok = false;
        }
      }
      if (ok) anchor = { x, z };
    }
  }
  if (!anchor) throw new Error('no flat dry ground for the street');
  const { x: X, z: Z0 } = anchor;
  /** The street's row: three rows of buildings above it, a turned building and a gap below. */
  const road = Z0 + 4;

  await send('Street', [
    {
      kind: 'buildRoad',
      tier: 1,
      tiles: Array.from({ length: STREET_TILES }, (_, i) => ({ x: X + i, z: road })),
    },
  ]);
  // One command each: a batch is atomic, and one refused tile would drop the building.
  const place = (catalogId, x, z, rotation = 0) =>
    send('Civic', [{ kind: 'placeBuilding', catalogId, x, z, rotation }]);
  for (const b of NORTH_SIDE) await place(b.id, X + b.dx, road - b.d);
  // The same fire station on the south side, turned half a turn: its front is
  // then the north edge, and its way in lands on the same kerb from the other side.
  await place('fire-station', X + 1, road + 1, 2);
  await page.waitForTimeout(3000);

  const standing = await page.evaluate(() => window.__slimcity.readBuildings());
  console.log(
    'standing',
    JSON.stringify(standing.map((b) => `${b.catalogId}@${b.x},${b.z}r${b.rotation}:${b.state}`)),
  );
  const missing = NORTH_SIDE.filter((b) => !standing.some((s) => s.catalogId === b.id));
  if (missing.length) console.log('not placed', missing.map((b) => b.id).join(', '));

  const middle = X + STREET_TILES / 2;
  const shoot = async (name, tx, tz, distance, yaw, pitch = DEFAULT_PITCH) => {
    await cam(tx, tz, distance, yaw, pitch);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/${name}.png` });
    console.log('shot', name);
  };
  const setPhase = async (dayT) => {
    await page.evaluate((t) => {
      window.__slimcity.setDayT(t);
      window.__slimcity.cmd('Phase', [{ kind: 'setUnlimitedMoney', on: true }]);
    }, dayT);
    await page.waitForTimeout(2000);
  };

  // The whole street from above, then at the default pitch from either end.
  await shoot('a-street-from-above', middle, road, 150, 0, OVERHEAD_PITCH);
  await shoot('a2-street-west', X + 3, road - 0.5, 90, 0.4);
  await shoot('a3-street-east', X + 12, road - 0.5, 90, -0.4);

  // The fire apron and the clinic's drives at twice the pixels, from above and low.
  const restore = await closeUp(page, 2);
  await shoot('b-fire-apron-above', X + 2, road, 45, 0, OVERHEAD_PITCH);
  await shoot('b2-fire-apron-low', X + 2, road, 40, 0.5, 0.45);
  await shoot('c-clinic-drives-above', X + 8.5, road, 45, 0, OVERHEAD_PITCH);
  await shoot('c2-clinic-drives-low', X + 8.5, road, 40, -0.5, 0.45);
  await shoot('d-school-entrance-above', X + 5.5, road, 55, 0, OVERHEAD_PITCH);
  await shoot('e-depot-gate-above', X + 11, road, 45, 0, OVERHEAD_PITCH);
  await restore();

  // The turned station: its apron lands on the north kerb of the street, beside the first.
  await shoot('f-turned-fire-station', X + 2, road + 1, 70, 0.3, 0.9);

  await setPhase(NIGHT);
  await shoot('g-street-night', middle, road, 90, 0.3);
} finally {
  await browser.close();
}
