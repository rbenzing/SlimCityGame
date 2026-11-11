/** Shots of the mixed-use buildings: Shopfront Flats (mixed-1), High Street
 * Block (mixed-2) and Mixed-Use Tower (mixed-3) side by side on one street.
 * Frames: `street` (oblique along the row), `above` (straight down), `close-mixed-1`,
 * `close-mixed-2` and `close-mixed-3` (each shopfront at 40 m, twice the pixels),
 * `rear` (the back of the row and any parking, from the far side) and `night`.
 * The buildings are placed by command on flat dry ground beside a street with
 * the sim paused: a running sim with no power, water or zones abandons and
 * clears them within a minute. A turbine at the street's east end powers it so
 * the night frame shows lamps lit.
 *
 * Usage: node tools/mixeduse-shots.mjs [baseUrl] [outDir]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { cleanShot, closeUp, hooksReady, tileCamera, unlimitedMoneyOption } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'tools/shots-mixeduse';
mkdirSync(out, { recursive: true });

const SEED = 7;
const DEFAULT_PITCH = 0.7;
const TOP_PITCH = 1.45;
/** Camera distance that takes in the whole row of three. */
const WIDE = 190;
/** West to east: id and footprint (tiles) of each, one tile of gap between. */
const SUBJECTS = [
  { id: 'mixed-1', w: 1, d: 2 },
  { id: 'mixed-2', w: 2, d: 2 },
  { id: 'mixed-3', w: 3, d: 3 },
];
const SPAN = SUBJECTS.reduce((n, s) => n + s.w + 1, 0);
/** Rows the buildings and street take: the deepest building (3), the road, clear ground beyond. */
const ROWS_NORTH = 6;
const ROWS_SOUTH = 6;

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
page.on('pageerror', (e) => {
  fail(`pageerror ${e.message}`);
});
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
  const readBuildings = () => page.evaluate(() => window.__slimcity.readBuildings());
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
  for (let z = 20; z < N - ROWS_SOUTH - 10 && !anchor; z++) {
    for (let x = 20; x < N - SPAN - 12 && !anchor; x++) {
      const h0 = g.height[idx(x, z)];
      let ok = true;
      for (let dz = -ROWS_NORTH; dz <= ROWS_SOUTH && ok; dz++) {
        for (let dx = -3; dx < SPAN + 5 && ok; dx++) if (!flatDry(x + dx, z + dz, h0)) ok = false;
      }
      if (ok) anchor = { x, z };
    }
  }
  if (!anchor) throw new Error('no flat dry ground for the street');
  // The anchor is the road row; the buildings stand on its south side.
  const { x: X, z: ROAD } = anchor;

  await send('Street', [
    {
      kind: 'buildRoad',
      tier: 1,
      tiles: Array.from({ length: SPAN + 4 }, (_, i) => ({ x: X - 2 + i, z: ROAD })),
    },
  ]);
  await send('Power', [
    {
      kind: 'placeBuilding',
      catalogId: 'wind-turbine',
      x: X + SPAN + 1,
      z: ROAD - 1,
      rotation: 0,
    },
  ]);
  // One command each: a batch is atomic, and one refused tile would drop the row.
  const spots = [];
  let cursor = X;
  for (const s of SUBJECTS) {
    // The first tile row south of the street, so every front edge is beside it.
    const spot = { ...s, x: cursor, z: ROAD + 1 };
    spots.push(spot);
    await send('Mixed', [
      { kind: 'placeBuilding', catalogId: s.id, x: spot.x, z: spot.z, rotation: 0 },
    ]);
    cursor += s.w + 1;
  }
  await page.waitForTimeout(3000);

  // Prove every building stands, by id and position, before any frame.
  const standing = await readBuildings();
  const missing = spots.filter(
    (h) => !standing.some((b) => b.catalogId === h.id && b.x === h.x && b.z === h.z),
  );
  if (missing.length > 0) {
    throw new Error(`not standing: ${missing.map((h) => `${h.id}@${h.x},${h.z}`).join(' ')}`);
  }
  console.log(
    'standing',
    JSON.stringify(standing.map((b) => `${b.catalogId}@${b.x},${b.z}:state${b.state}`)),
  );

  // A paused sim posts a snapshot, which carries the pinned phase to the lighting, only when a command lands.
  const setPhase = async (dayT) => {
    await page.evaluate((t) => {
      window.__slimcity.setDayT(t);
      window.__slimcity.cmd('Phase', [{ kind: 'setUnlimitedMoney', on: true }]);
    }, dayT);
    await page.waitForTimeout(2000);
  };
  const shoot = async (name, tx, tz, distance, yaw, pitch = DEFAULT_PITCH) => {
    await cam(tx, tz, distance, yaw, pitch);
    await page.waitForTimeout(1200);
    await cleanShot(page, `${out}/${name}.png`);
  };
  // The row's middle, a tile west: the smallest building stands west and its pad needs room.
  const midX = X + SPAN / 2 - 1;
  // The entrance and shopfront are drawn on the north (-z) face at every rotation, so the row
  // stands south of the street and the street-side views look south from the north (yaw pi).
  const FRONT_YAW = Math.PI + 0.3;
  await setPhase(0.5);
  await shoot('street', midX, ROAD + 1, WIDE, FRONT_YAW);
  await shoot('above', midX, ROAD + 1, WIDE, 0, TOP_PITCH);
  const restore = await closeUp(page, 2);
  for (const s of spots) {
    // The shopfront faces the road: aim at the middle of the front edge.
    await shoot(`close-${s.id}`, s.x + s.w / 2 - 0.5, s.z, 40, FRONT_YAW, 0.45);
  }
  await restore();
  // From the south, looking north over the backs of the row.
  await shoot('rear', midX, ROAD + 2, WIDE, 0.3);
  await setPhase(0.96);
  await shoot('night', midX, ROAD + 1, WIDE, FRONT_YAW);
} catch (e) {
  fail(e.stack ?? String(e));
} finally {
  await browser.close();
}
if (failures.length > 0) process.exit(1);
