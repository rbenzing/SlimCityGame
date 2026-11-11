/** Healthcare shots: the hospital, the clinic and the crematorium on one
 * two-lane street, each fronting it on flat ground, with an ambulance at the
 * hospital's ambulance canopy and a hearse at the crematorium's drive.
 *
 * Frames: hospital-street (oblique, whole building), hospital-above (straight
 * down: plot, drives, deck, stalls), hospital-entrance-close (40 m at the main
 * entrance), hospital-deck-close (40 m at the parking deck), hospital-deck-above
 * (the deck's roof tier from straight above), hospital-night,
 * clinic-close, crematorium-street, crematorium-above, crematorium-close.
 * The sim is paused: a running sim with no power or water abandons the
 * buildings within a minute.
 *
 * Usage: node tools/healthcare-shots.mjs [baseUrl] [outDir]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { cleanShot, closeUp, hooksReady, tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'tools/shots-healthcare';
mkdirSync(out, { recursive: true });

const SEED = 7;
const STREET_TILES = 26;
/** Rows above the street the buildings take (the hospital is 3 deep), and a row of margin below. */
const ROWS_ABOVE = 5;
const ROWS = ROWS_ABOVE + 3;
const DEFAULT_PITCH = 0.7;
const OVERHEAD_PITCH = 1.2;
const NIGHT = 22 / 24;
/** Vehicle kinds (src/shared/types.ts VehicleKind). */
const CAR = 0;
const AMBULANCE = 5;
const HEARSE = 8;

/** What stands along the north side: the id, the tile offset along the street, its width and depth in tiles. */
const SUBJECTS = [
  { id: 'hospital', dx: 1, w: 5, d: 3 },
  { id: 'clinic', dx: 11, w: 1, d: 2 },
  { id: 'crematorium', dx: 16, w: 2, d: 2 },
];

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

  // Flat dry ground for the street and everything along it.
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
  if (!anchor) throw new Error('no dry ground for the street');
  const { x: X, z: Z0, h0 } = anchor;
  const road = Z0 + ROWS_ABOVE;

  // Level the site so no lot, drive or deck stands on a slope.
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
  // One command each: a batch is atomic, and one refused tile would drop the building.
  for (const s of SUBJECTS) {
    await send('Civic', [
      { kind: 'placeBuilding', catalogId: s.id, x: X + s.dx, z: road - s.d, rotation: 0 },
    ]);
  }
  await page.waitForTimeout(3000);

  const standing = await page.evaluate(() => window.__slimcity.readBuildings());
  console.log(
    'standing',
    JSON.stringify(standing.map((b) => `${b.catalogId}@${b.x},${b.z}:${b.state}`)),
  );
  const missing = SUBJECTS.filter((s) => !standing.some((b) => b.catalogId === s.id));
  if (missing.length) {
    throw new Error(`not standing: ${missing.map((s) => s.id).join(', ')}`);
  }
  const hospital = standing.find((b) => b.catalogId === 'hospital');
  const parking = await page.evaluate((id) => window.__slimcity.readParking(id), hospital.id);
  console.log('hospital parking', JSON.stringify(parking));
  if (!parking) throw new Error('readParking has no row for the hospital');

  const T = await page.evaluate(() => window.__slimcity.tileMeters());
  // World metres of a point in a subject's local frame (rotation 0: local +Z is south, to the street).
  const centre = (s) => ({ x: (X + s.dx + s.w / 2) * T, z: (road - s.d + s.d / 2) * T });
  const at = (s, lx, lz) => {
    const c = centre(s);
    return { x: c.x + lx, z: c.z + lz };
  };
  const [hosp, clin, crem] = SUBJECTS;
  // The ambulance stands under the hospital's canopy at the facade's west end; the hearse on the crematorium's drive.
  const amb = at(hosp, -37, 23.5);
  const hearse = at(crem, 0, crem.d * 10 + 3);
  const car = at(clin, 0, clin.d * 10 + 6);
  await page.evaluate(
    ([list]) => window.__slimcity.setVehicles(list),
    [
      [
        { ...amb, heading: Math.PI, kind: AMBULANCE },
        { ...hearse, heading: Math.PI, kind: HEARSE },
        { ...car, heading: Math.PI, kind: CAR },
      ],
    ],
  );

  const shoot = async (name, tx, tz, distance, yaw, pitch = DEFAULT_PITCH) => {
    await cam(tx, tz, distance, yaw, pitch);
    await page.waitForTimeout(1200);
    await cleanShot(page, `${out}/${name}.png`);
    console.log('shot', name);
  };
  const tile = (p) => [p.x / T - 0.5, p.z / T - 0.5];

  const hc = centre(hosp);
  const cc = centre(crem);
  const kc = centre(clin);
  await shoot('hospital-street', ...tile({ x: hc.x, z: hc.z + 10 }), 170, 0.35);
  await shoot('hospital-above', ...tile({ x: hc.x, z: hc.z + 8 }), 150, 0, OVERHEAD_PITCH);

  const restore = await closeUp(page, 2);
  const entrance = at(hosp, -18, 24);
  await shoot('hospital-entrance-close', ...tile(entrance), 40, 0.25, 0.5);
  const deck = at(hosp, 40, 5);
  await shoot('hospital-deck-close', ...tile(deck), 40, -0.5, 0.6);
  // Straight down on the deck's roof tier: one car to a stall or not.
  await shoot('hospital-deck-above', ...tile(deck), 40, 0, 1.5);
  await shoot('clinic-close', ...tile({ x: kc.x, z: kc.z + 6 }), 40, 0.3, 0.5);
  await shoot('crematorium-close', ...tile({ x: cc.x, z: cc.z + 8 }), 40, 0.3, 0.5);
  await restore();

  await shoot('crematorium-street', ...tile({ x: cc.x, z: cc.z + 5 }), 90, 0.4);
  await shoot('crematorium-above', ...tile({ x: cc.x, z: cc.z + 8 }), 70, 0, OVERHEAD_PITCH);

  await page.evaluate((t) => {
    window.__slimcity.setDayT(t);
    window.__slimcity.cmd('Phase', [{ kind: 'setUnlimitedMoney', on: true }]);
  }, NIGHT);
  await page.waitForTimeout(2000);
  await shoot('hospital-night', ...tile({ x: hc.x, z: hc.z + 10 }), 150, 0.35);
} catch (e) {
  failed = true;
  console.log('FAILED', e.message);
} finally {
  await browser.close();
}
if (pageErrors > 0) failed = true;
process.exit(failed ? 1 : 0);
