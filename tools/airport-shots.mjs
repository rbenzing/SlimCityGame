/** Airport shots: the International Airport on level ground beside a two-lane
 * street. The kit's terminal half is its back (north) edge, which is the street
 * side, and the apron half with its taxiway stripe and parked aircraft is the
 * far side, so the airport is placed south of the street.
 *
 * Frames: airport-overview (oblique, the whole plot), airport-above (straight
 * down), terminal-close (40 m at the terminal entrance and its car park),
 * apron-close (aircraft stands), airport-night. The kit draws no runway, so
 * there is no runway-end frame.
 * The sim is paused: a running sim with no power or water abandons the
 * building within a minute.
 *
 * Usage: node tools/airport-shots.mjs [baseUrl] [outDir]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { cleanShot, closeUp, hooksReady, tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'tools/shots-airport';
mkdirSync(out, { recursive: true });

const SEED = 7;
const STREET_TILES = 18;
/** The airport's footprint in tiles (catalog), and the rows around it: one above the street, one below the plot. */
const AIRPORT = { id: 'airport', w: 8, d: 6 };
const ROWS_ABOVE = 1;
const ROWS = ROWS_ABOVE + 1 + AIRPORT.d + 1;
const DEFAULT_PITCH = 0.7;
const OVERHEAD_PITCH = 1.2;
const NIGHT = 22 / 24;
const CAR = 0;

const browser = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
let pageErrors = 0;
page.on('pageerror', (e) => {
  pageErrors++;
  console.log('[pageerror]', e.message);
});
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console.error]', m.text());
});
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

let failed = false;
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

  // Dry ground for the street and the plot south of it.
  const g = await page.evaluate(() => window.__slimcity.readGrid());
  const N = g.size;
  const idx = (x, z) => z * N + x;
  const dry = (x, z, h0) =>
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
          if (!dry(x + dx, z + dz, h0)) ok = false;
        }
      }
      if (ok) anchor = { x, z, h0 };
    }
  }
  if (!anchor) throw new Error('no dry ground for the airport');
  const { x: X, z: Z0, h0 } = anchor;
  const road = Z0 + ROWS_ABOVE;
  const AX = X + 5;
  const AZ = road + 1;

  // Level the site so the apron and the plot stand on no slope.
  await page.evaluate(
    ([x, z, w, h, level]) => {
      const heights = new Float32Array(w * h).fill(level);
      window.__slimcity.cmd('Level site', [{ kind: 'terraformSet', x, z, w, h, heights }]);
    },
    [X - 2, Z0 - 1, STREET_TILES + 4, ROWS + 2, h0],
  );
  await page.waitForTimeout(1500);

  await send('Street', [
    {
      kind: 'buildRoad',
      tier: 1,
      tiles: Array.from({ length: STREET_TILES }, (_, i) => ({ x: X + i, z: road })),
    },
  ]);
  await send('Airport', [
    { kind: 'placeBuilding', catalogId: AIRPORT.id, x: AX, z: AZ, rotation: 0 },
  ]);
  await page.waitForTimeout(3000);

  const standing = await page.evaluate(() => window.__slimcity.readBuildings());
  console.log(
    'standing',
    JSON.stringify(standing.map((b) => `${b.catalogId}@${b.x},${b.z}:${b.state}`)),
  );
  if (!standing.some((b) => b.catalogId === AIRPORT.id)) throw new Error('airport not standing');

  const T = await page.evaluate(() => window.__slimcity.tileMeters());
  // Plot centre in tiles, and a point in the airport's local frame (local +Z is south, away from the street).
  const cx = AX + AIRPORT.w / 2;
  const cz = AZ + AIRPORT.d / 2;
  const local = (lx, lz) => [cx + lx / T - 0.5, cz + lz / T - 0.5];
  // A car on the street at the terminal's entrance, for scale.
  await page.evaluate(
    ([list]) => window.__slimcity.setVehicles(list),
    [[{ x: cx * T, z: (road + 0.5) * T, heading: Math.PI / 2, kind: CAR }]],
  );

  const shoot = async (name, [tx, tz], distance, yaw, pitch = DEFAULT_PITCH) => {
    await cam(tx, tz, distance, yaw, pitch);
    await page.waitForTimeout(1200);
    await cleanShot(page, `${out}/${name}.png`);
    console.log('shot', name);
  };

  await shoot('airport-overview', local(0, 0), 320, 0.4);
  await shoot('airport-above', local(0, -10), 300, 0, OVERHEAD_PITCH);

  const restore = await closeUp(page, 2);
  // The terminal's street front is its north edge, so the camera stands north of it.
  await shoot('terminal-close', local(0, -58), 40, Math.PI + 0.3, 0.4);
  // The aircraft stands at the plot's east end, past the terminal block's edge.
  await shoot('apron-close', local(64, 40), 40, 1.2, 0.5);
  await restore();

  await page.evaluate((t) => {
    window.__slimcity.setDayT(t);
    window.__slimcity.cmd('Phase', [{ kind: 'setUnlimitedMoney', on: true }]);
  }, NIGHT);
  await page.waitForTimeout(2000);
  await shoot('airport-night', local(0, 0), 320, 0.4);
} catch (e) {
  failed = true;
  console.log('FAILED', e.message);
} finally {
  await browser.close();
}
if (pageErrors > 0) failed = true;
process.exit(failed ? 1 : 0);
