/** Shots of the storefront kit's parts: a Main Street of shops, a shopping strip
 * with its pylon, a supermarket from its car park, a drive-through restaurant
 * from above and at street level, a filling station, and an office and a hotel
 * downtown, each at the default camera pitch with the lot's cars in their
 * stalls; then the same streets at night, where the sign bands, the pylon, the
 * price sign, the tower glazing and the lobby portal glow and nothing else
 * does. Buildings are placed by command along streets on flat dry ground with
 * the sim paused, as the frame budget does: a running sim with no power, water
 * or zones abandons and clears them within a minute.
 *
 * Usage: node tools/storefront-shots.mjs [baseUrl] [outDir]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { closeUp, hooksReady, tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'tools/shots-storefronts';
mkdirSync(out, { recursive: true });

const catalog = JSON.parse(readFileSync('src/data/catalog.json', 'utf8')).buildings;
const footprint = (id) => {
  const entry = catalog.find((c) => c.id === id);
  if (!entry) throw new Error(`no catalog entry ${id}`);
  return entry.footprint;
};

const SEED = 7;
const DEFAULT_PITCH = 0.7;
/** Tiles a street takes: the deepest lot (4), the road, and the gap to the next street. */
const STREET_ROWS = 9;
/** Tiles of road beyond each end of a street's buildings. */
const MARGIN = 2;
const LONGEST = 24;

/** The streets, north to south: what stands along each, left to right. */
const STREETS = [
  {
    name: 'main',
    ids: [
      'com-low-1',
      'com-shop-2',
      'com-low-1',
      'com-low-2',
      'com-low-1',
      'com-shop-2',
      'com-low-1',
      'com-low-1',
    ],
  },
  { name: 'strip', ids: ['com-strip-2', 'com-strip-3', 'com-strip-1'] },
  { name: 'market', ids: ['com-market-2', 'com-market-1', 'com-market-3'] },
  {
    name: 'restaurant',
    ids: [
      'com-restaurant-2',
      'com-restaurant-1-lot2x2',
      'com-restaurant-3-lot6x2',
      'com-restaurant-2',
    ],
  },
  { name: 'fuel', ids: ['com-fuel-2', 'com-fuel-1', 'com-fuel-3'] },
  {
    name: 'downtown',
    ids: ['com-high-1', 'com-office-2', 'com-high-2', 'com-hotel-1', 'com-hotel-2', 'com-hotel-3'],
  },
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
    for (let x = 20; x < N - LONGEST - 20 && !anchor; x++) {
      const h0 = g.height[idx(x, z)];
      let ok = true;
      for (let dz = -3; dz < rowsNeeded && ok; dz++) {
        for (let dx = -MARGIN; dx < LONGEST + MARGIN && ok; dx++) {
          if (!flatDry(x + dx, z + dz, h0)) ok = false;
        }
      }
      if (ok) anchor = { x, z };
    }
  }
  if (!anchor) throw new Error('no flat dry ground for the streets');
  const { x: X, z: Z0 } = anchor;

  // Each street's road runs along its row; its buildings stand on the north side, fronting it.
  const roadRow = (s) => Z0 + 4 + s * STREET_ROWS;
  const spans = STREETS.map((street) => {
    let at = X;
    return street.ids.map((id) => {
      const fp = footprint(id);
      const placed = { id, x: at, z: 0, w: fp.w, d: fp.d };
      at += fp.w;
      return placed;
    });
  });
  for (const [s, placed] of spans.entries()) {
    const length = placed.reduce((sum, b) => sum + b.w, 0) + 2 * MARGIN;
    await send('Street', [
      {
        kind: 'buildRoad',
        tier: 1,
        tiles: Array.from({ length }, (_, i) => ({ x: X - MARGIN + i, z: roadRow(s) })),
      },
    ]);
  }
  // One command each: a batch is atomic, and one refused tile would drop the street.
  for (const [s, placed] of spans.entries()) {
    for (const b of placed) {
      b.z = roadRow(s) - b.d;
      await send('Building', [
        { kind: 'placeBuilding', catalogId: b.id, x: b.x, z: b.z, rotation: 0 },
      ]);
    }
  }
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
  const find = (street, id, nth = 0) =>
    spans[STREETS.findIndex((s) => s.name === street)].filter((b) => b.id === id)[nth];
  const middleOf = (s) => {
    const placed = spans[s];
    const last = placed[placed.length - 1];
    return (placed[0].x + last.x + last.w) / 2;
  };
  const centre = (b) => ({ x: b.x + b.w / 2, z: b.z + b.d / 2 });

  const views = (suffix) => async () => {
    for (const [s, street] of STREETS.entries()) {
      await shoot(`${street.name}${suffix}`, middleOf(s), roadRow(s) + 2, 95, 0.3);
    }
    const strip = centre(find('strip', 'com-strip-2'));
    await shoot(`strip-pylon${suffix}`, strip.x, strip.z + 2, 85, 0.3);
    const market = centre(find('market', 'com-market-2'));
    await shoot(`market-car-park${suffix}`, market.x, market.z + 3, 90, 0.2);
    const eat = centre(find('restaurant', 'com-restaurant-2'));
    await shoot(`restaurant-above${suffix}`, eat.x, eat.z, 75, 0.3, 1.25);
    const fuel = centre(find('fuel', 'com-fuel-2'));
    await shoot(`fuel-station${suffix}`, fuel.x, fuel.z + 2, 75, 0.3);
    const office = centre(find('downtown', 'com-high-1'));
    await shoot(`office${suffix}`, office.x, office.z + 1, 90, 0.3);
    const hotel = centre(find('downtown', 'com-hotel-2'));
    await shoot(`hotel${suffix}`, hotel.x, hotel.z + 1, 90, 0.3);
  };

  await setPhase(0.5);
  await views('')();

  // The close shots, at twice the pixels over the camera's floor distance.
  const restore = await closeUp(page, 2);
  const shop = centre(find('main', 'com-low-1'));
  await shoot('close-shop', shop.x, shop.z + 1, 40, 0.3);
  const strip = centre(find('strip', 'com-strip-2'));
  await shoot('close-strip', strip.x, strip.z + 1, 40, 0.3);
  const eat = centre(find('restaurant', 'com-restaurant-2'));
  await shoot('close-restaurant', eat.x, eat.z, 40, 0.3, 1.0);
  const fuel = centre(find('fuel', 'com-fuel-2'));
  await shoot('close-fuel', fuel.x, fuel.z + 1, 40, 0.3);
  await restore();

  await setPhase(0.96);
  await views('-night')();
} finally {
  await browser.close();
}
