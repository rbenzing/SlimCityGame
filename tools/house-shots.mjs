/** Shots of the house kit's parts: a street of ranches, of Capes and of
 * colonials at the default camera pitch with the residents' cars on their
 * drives; a street of duplexes, fourplexes and townhouse rows; a close shot of
 * a porch and of a portico and stoop beside a 4 m car; and the streets at
 * night. Homes are placed by command along streets on flat dry ground with the
 * sim paused, as the frame budget does: a running sim with no power, water or
 * zones abandons and clears them within a minute.
 *
 * Usage: node tools/house-shots.mjs [baseUrl] [outDir]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { closeUp, hooksReady, tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'tools/shots-houses';
mkdirSync(out, { recursive: true });

const SEED = 7;
const HOMES = 10;
/** Rows a street takes: the homes two deep, the road, and the gap to the next street. */
const STREET_ROWS = 7;
const DEFAULT_PITCH = 0.7;

/** The streets, north to south: what stands along each. */
const STREETS = [
  { name: 'ranch', ids: ['res-normal-1'] },
  { name: 'cape', ids: ['res-normal-2'] },
  { name: 'colonial', ids: ['res-normal-3'] },
  { name: 'attached', ids: ['res-duplex-1', 'res-fourplex-1', 'res-medium-row-2'] },
];

// The same avalanche hash the render code seeds its choices with; only used to
// find which colonial the seed gave a porch, so the close shot can aim at one.
function hash1(n) {
  let h = n >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}
const SLOT_ENTRY = 14;
const hasPorch = (id) => hash1(id * 131 + SLOT_ENTRY) < 0.5;

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
  const rowsNeeded = STREETS.length * STREET_ROWS;
  let anchor = null;
  for (let z = 20; z < N - rowsNeeded - 10 && !anchor; z++) {
    for (let x = 20; x < N - 40 && !anchor; x++) {
      const h0 = g.height[idx(x, z)];
      let ok = true;
      for (let dz = -3; dz < rowsNeeded && ok; dz++) {
        for (let dx = -2; dx < HOMES + 4 && ok; dx++) if (!flatDry(x + dx, z + dz, h0)) ok = false;
      }
      if (ok) anchor = { x, z };
    }
  }
  if (!anchor) throw new Error('no flat dry ground for the streets');
  const { x: X, z: Z0 } = anchor;

  // Each street's road runs along its row; its homes stand on the north side.
  const roadRow = (s) => Z0 + 2 + s * STREET_ROWS;
  for (const [s] of STREETS.entries()) {
    await send('Street', [
      {
        kind: 'buildRoad',
        tier: 1,
        tiles: Array.from({ length: HOMES + 4 }, (_, i) => ({ x: X - 2 + i, z: roadRow(s) })),
      },
    ]);
  }
  // A turbine at the east end of the first street powers them all: a lamp
  // stands only on a powered street, so the night views show the lamps lit.
  await send('Power', [
    {
      kind: 'placeBuilding',
      catalogId: 'wind-turbine',
      x: X + HOMES + 1,
      z: roadRow(0) - 1,
      rotation: 0,
    },
  ]);
  // One command each: a batch is atomic, and one refused tile would drop the street.
  for (const [s, street] of STREETS.entries()) {
    for (let i = 0; i < HOMES; i++) {
      await send('Home', [
        {
          kind: 'placeBuilding',
          catalogId: street.ids[i % street.ids.length],
          x: X + i,
          z: roadRow(s) - 2,
          rotation: 0,
        },
      ]);
    }
  }
  await page.waitForTimeout(3000);
  const standing = await page.evaluate(() => window.__slimcity.readBuildings());
  console.log('lamp poles', await page.evaluate(() => window.__slimcity.readLampPoles().length));
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
      for (let i = 0; i < 100; i++) {
        const buttons = document.querySelectorAll('[aria-label="Dismiss notification"]');
        if (buttons.length === 0) return;
        buttons.forEach((b) => b.click());
      }
    }, dayT);
    await page.waitForTimeout(2000);
  };
  const shoot = async (name, tx, tz, distance, yaw, pitch = DEFAULT_PITCH) => {
    await cam(tx, tz, distance, yaw, pitch);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/${name}.png` });
  };
  const middle = X + HOMES / 2;

  await setPhase(0.5);
  for (const [s, street] of STREETS.entries()) {
    await shoot(`street-${street.name}`, middle, roadRow(s) - 1, 70, 0.3);
  }
  // A closer read of each at the default pitch, from the other end.
  for (const [s, street] of STREETS.entries()) {
    await shoot(`street-${street.name}-west`, X + 2, roadRow(s) - 1, 45, -0.5);
  }

  // The close shots, at twice the pixels over the camera's floor distance.
  const homeAt = (catalogId, porch) =>
    standing.find(
      (b) => b.catalogId === catalogId && (porch === undefined || hasPorch(b.id) === porch),
    );
  const restore = await closeUp(page, 2);
  const porched = homeAt('res-normal-3', true);
  if (porched) await shoot('close-porch', porched.x, porched.z + 1, 40, 0.3);
  else console.log('no colonial with a porch among the street');
  const portico = homeAt('res-normal-3', false) ?? homeAt('res-normal-2');
  if (portico) await shoot('close-portico', portico.x, portico.z + 1, 40, 0.3);
  const cape = homeAt('res-normal-2');
  if (cape) await shoot('close-cape', cape.x, cape.z + 1, 40, -0.4);
  await restore();

  await setPhase(0.96);
  for (const [s, street] of STREETS.entries()) {
    await shoot(`night-${street.name}`, middle, roadRow(s) - 1, 70, 0.3);
  }
} finally {
  await browser.close();
}
