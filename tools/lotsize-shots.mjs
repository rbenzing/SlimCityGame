/** Shots of the lot-size house families: half (res-half-1..3), normal-low
 * (res-low-1..3), estate (res-estate-1..3) and acre (res-acre-1..3), one street
 * per family with every id placed along it at a spacing that fits its footprint.
 * Per family: `<family>-street` (oblique along the row), `<family>-above`
 * (straight down: lot lines, drives, fences, yards) and `<family>-close` (40 m
 * at one home that has a car on its lot); then `all-night`, the four streets
 * lit after dark. 13 frames.
 * Homes are placed by command along streets on flat dry ground with the sim
 * paused, as the frame budget does: a running sim with no power, water or zones
 * abandons and clears them within a minute. A turbine at the connector head
 * powers the streets so the night frame shows lamps lit.
 *
 * Usage: node tools/lotsize-shots.mjs [baseUrl] [outDir]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import {
  cleanShot,
  closeUp,
  hooksReady,
  tileCamera,
  tileMeters,
  unlimitedMoneyOption,
} from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'tools/shots-lotsizes';
mkdirSync(out, { recursive: true });

const SEED = 7;
/** Homes on each street: the three ids in order, then the first again. */
const HOMES = 4;
/** Rows a street takes: the deepest home (3), the road, and the gap to the next street. */
const STREET_ROWS = 7;
const DEFAULT_PITCH = 0.7;
const TOP_PITCH = 1.45;
/** Tiles of road each side of the homes, and the widest family's home-plus-gap step. */
const SPAN = HOMES * 4;

/** The families, north to south: ids, footprint width and depth in tiles. */
const FAMILIES = [
  { name: 'half', ids: ['res-half-1', 'res-half-2', 'res-half-3'], w: 1, d: 1 },
  { name: 'low', ids: ['res-low-1', 'res-low-2', 'res-low-3'], w: 2, d: 2 },
  { name: 'estate', ids: ['res-estate-1', 'res-estate-2', 'res-estate-3'], w: 2, d: 3 },
  { name: 'acre', ids: ['res-acre-1', 'res-acre-2', 'res-acre-3'], w: 3, d: 3 },
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
  const T = await tileMeters(page);
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
  const rowsNeeded = FAMILIES.length * STREET_ROWS + 2;
  let anchor = null;
  for (let z = 20; z < N - rowsNeeded - 10 && !anchor; z++) {
    for (let x = 20; x < N - SPAN - 12 && !anchor; x++) {
      const h0 = g.height[idx(x, z)];
      let ok = true;
      for (let dz = -3; dz < rowsNeeded && ok; dz++) {
        for (let dx = -2; dx < SPAN + 4 && ok; dx++) if (!flatDry(x + dx, z + dz, h0)) ok = false;
      }
      if (ok) anchor = { x, z };
    }
  }
  if (!anchor) throw new Error('no flat dry ground for the streets');
  const { x: X, z: Z0 } = anchor;
  const roadRow = (s) => Z0 + 3 + s * STREET_ROWS;

  for (const [s] of FAMILIES.entries()) {
    await send('Street', [
      {
        kind: 'buildRoad',
        tier: 1,
        tiles: Array.from({ length: SPAN + 4 }, (_, i) => ({ x: X - 2 + i, z: roadRow(s) })),
      },
    ]);
  }
  // A connector down the east end joins the streets into one network, and a
  // turbine at its head powers them all.
  await send('Connector', [
    {
      kind: 'buildRoad',
      tier: 1,
      tiles: Array.from({ length: roadRow(FAMILIES.length - 1) - roadRow(0) + 1 }, (_, i) => ({
        x: X + SPAN + 1,
        z: roadRow(0) + i,
      })),
    },
  ]);
  await send('Power', [
    {
      kind: 'placeBuilding',
      catalogId: 'wind-turbine',
      x: X + SPAN + 1,
      z: roadRow(0) - 1,
      rotation: 0,
    },
  ]);
  // One command each: a batch is atomic, and one refused tile would drop the street.
  const place = (catalogId, x, z) =>
    send('Home', [{ kind: 'placeBuilding', catalogId, x, z, rotation: 0 }]);
  const homeSpots = [];
  for (const [s, fam] of FAMILIES.entries()) {
    for (let i = 0; i < HOMES; i++) {
      const catalogId = fam.ids[i % fam.ids.length];
      const x = X + i * (fam.w + 1);
      const z = roadRow(s) - fam.d;
      homeSpots.push({ catalogId, x, z, family: fam.name });
      await place(catalogId, x, z);
    }
  }
  await page.waitForTimeout(3000);

  // Prove every home stands, by id and position, before any frame.
  const standing = await readBuildings();
  const missing = homeSpots.filter(
    (h) => !standing.some((b) => b.catalogId === h.catalogId && b.x === h.x && b.z === h.z),
  );
  if (missing.length > 0) {
    throw new Error(`not standing: ${missing.map((h) => `${h.catalogId}@${h.x},${h.z}`).join(' ')}`);
  }
  for (const fam of FAMILIES) {
    for (const id of fam.ids) {
      if (!standing.some((b) => b.catalogId === id)) throw new Error(`${id} never placed`);
    }
  }
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

  await setPhase(0.5);
  for (const [s, fam] of FAMILIES.entries()) {
    const spots = homeSpots.filter((h) => h.family === fam.name);
    const last = spots[spots.length - 1];
    // The row's middle in the tile-centre coordinates the camera takes.
    const midX = (spots[0].x + last.x + fam.w) / 2 - 0.5;
    const midZ = roadRow(s) - fam.d / 2;
    const cars = [];
    for (const h of spots) {
      const b = standing.find((c) => c.x === h.x && c.z === h.z);
      const slots = await page.evaluate((id) => window.__slimcity.readHouseCars(id), b.id);
      // The house's centre and its nearest car, in the tile coordinates the camera takes.
      const hx = h.x + fam.w / 2 - 0.5;
      const hz = h.z + fam.d / 2 - 0.5;
      const near = slots
        .map((c) => ({ x: c.x / T - 0.5, z: c.z / T - 0.5 }))
        .sort((a, c) => Math.hypot(a.x - hx, a.z - hz) - Math.hypot(c.x - hx, c.z - hz))[0];
      cars.push({ ...h, id: b.id, cars: slots.length, hx, hz, near });
    }
    console.log(`${fam.name} cars per home`, cars.map((c) => `${c.catalogId}:${c.cars}`).join(' '));
    // The whole row fits across the frame (about 1.6 m of ground per metre of distance),
    // and the lots' depth plus the street fit in the top four fifths of its height.
    const rowM = (last.x + fam.w - spots[0].x) * T;
    const wide = Math.max((rowM + 4 * T) / 1.6, ((fam.d + 3) * T) / 0.95);
    // Aiming south of the lots' middle lifts them clear of the toolbar along the bottom.
    const liftTiles = (0.12 * 1.19 * wide) / T;
    await shoot(`${fam.name}-street`, midX, roadRow(s) - 1, wide * 1.1, 0.3);
    await shoot(`${fam.name}-above`, midX, midZ + liftTiles, wide, 0, TOP_PITCH);
    // The car stands beside its house: aim between them so both are in frame.
    // Prefer a car on the street side of its house, which the camera at the street sees past the roof.
    const subject = cars
      .filter((c) => c.near)
      .sort(
        (a, c) =>
          Number(c.near.z >= c.hz) - Number(a.near.z >= a.hz) ||
          Math.hypot(a.near.x - a.hx, a.near.z - a.hz) -
            Math.hypot(c.near.x - c.hx, c.near.z - c.hz),
      )[0];
    if (!subject) {
      fail(`${fam.name}: no home has a car on its lot, close shot has no scale car`);
      continue;
    }
    console.log(
      `${fam.name} close subject ${subject.catalogId} house ${subject.hx},${subject.hz} car ${subject.near.x.toFixed(2)},${subject.near.z.toFixed(2)}`,
    );
    const restore = await closeUp(page, 2);
    await shoot(
      `${fam.name}-close`,
      (subject.hx + subject.near.x) / 2,
      (subject.hz + subject.near.z) / 2,
      40,
      // A car behind its house is seen from behind the house.
      subject.near.z >= subject.hz ? 0.3 : Math.PI + 0.3,
      // A three-tile-deep house's roof hides a car parked behind it at the default pitch.
      fam.d >= 3 ? 1.15 : DEFAULT_PITCH,
    );
    await restore();
  }

  await setPhase(0.96);
  // The four streets stand 7 rows apart; from high up they fall in one frame.
  await shoot(
    'all-night',
    X + SPAN / 2,
    roadRow(0) + (roadRow(FAMILIES.length - 1) - roadRow(0)) / 2 - 1,
    300,
    0.3,
    1.1,
  );
} catch (e) {
  fail(e.stack ?? String(e));
} finally {
  await browser.close();
}
if (failures.length > 0) process.exit(1);
