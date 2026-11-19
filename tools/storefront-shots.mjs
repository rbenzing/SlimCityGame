/** Shots of the storefront kit's parts: a Main Street of shops, a shopping strip
 * with its pylon, a supermarket from its car park, a drive-through restaurant
 * from above and at street level, a filling station, and an office and a hotel
 * downtown, each at the default camera pitch with the lot's cars in their
 * stalls; then the same streets at night, where the sign bands, the pylon, the
 * price sign, the tower glazing and the lobby portal glow and nothing else
 * does. Last, the line-up: one of each commercial kind along one street, framed
 * whole at the default pitch so a metre is about four pixels, the second pass's
 * test that each kind is nameable without its label, by day and at 22:00.
 * Buildings are placed by command along streets on flat dry ground with the
 * sim paused, as the frame budget does: a running sim with no power, water or
 * zones abandons and clears them within a minute.
 *
 * Usage: node tools/storefront-shots.mjs [baseUrl] [outDir]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import {
  CAMERA_MIN_DISTANCE,
  cleanShot,
  closeUp,
  hooksReady,
  tileCamera,
  tileMeters,
} from './shotcam.mjs';

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
const STREET_ROWS = 8;
/** How far the ground may stand above or below the anchor and still count as flat: the streets are levelled as they are built. */
const FLAT_TOLERANCE_M = 14;
/** Tiles of road beyond each end of a street's buildings. */
const MARGIN = 2;
const LONGEST = 28;
/** The line-up's night: 22:00. */
const LINEUP_NIGHT = 22 / 24;

/** The streets, north to south: what stands along each, left to right; the line-up last, shot on its own. */
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
      'com-convenience-1-lot3x2',
      'com-convenience-2-lot4x2',
      'com-convenience-3-lot5x2',
    ],
  },
  // Each spread shop and restaurant beside its built-in form, which stands the same level taller on a smaller lot with its parking below.
  {
    name: 'stacked',
    gap: 1,
    ids: [
      'com-shop-2',
      'com-shop-2-up1x2',
      'com-low-2',
      'com-low-2-up1x2',
      'com-low-2-up1x1',
      'com-restaurant-2',
      'com-restaurant-2-up1x2',
      'com-restaurant-3-lot4x2',
      'com-restaurant-3-up2x2',
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
  {
    name: 'fuel',
    ids: [
      'com-fuel-2',
      'com-fuel-1',
      'com-fuel-3',
      'com-autorepair-1-lot2x2',
      'com-autorepair-2-lot4x2',
      'com-autorepair-3-lot5x2',
    ],
  },
  {
    name: 'pharmacy',
    ids: ['com-pharmacy-1-lot7x2', 'com-pharmacy-2-lot5x4', 'com-pharmacy-3-lot8x3'],
  },
  // The bank and the lube share a street: together they are 18 tiles, under the longest street.
  {
    name: 'bank',
    // A tile of ground between the lots: side by side, a lot's lanes and court touch its neighbour's and the sim refuses it.
    gap: 1,
    ids: [
      'com-bank-1-lot2x3',
      'com-bank-2-lot3x3',
      'com-bank-3-lot4x3',
      'com-lube-1-lot2x3',
      'com-lube-2-lot3x3',
      'com-lube-3-lot4x3',
    ],
  },
  // The three car washes, a tile of ground between them for the same reason.
  {
    name: 'carwash',
    gap: 1,
    ids: ['com-carwash-1-lot2x3', 'com-carwash-2-lot2x4', 'com-carwash-3-lot3x4'],
  },
  {
    name: 'medical',
    ids: ['com-medical-1-lot4x2', 'com-medical-2-lot5x2', 'com-medical-3-lot6x3'],
  },
  {
    name: 'downtown',
    ids: ['com-high-1', 'com-office-2', 'com-high-2', 'com-hotel-1', 'com-hotel-2', 'com-hotel-3'],
  },
  // Eleven shops in a row: a lot's tile picks whether its building stands at the street or behind its car park, so both plans show.
  {
    name: 'variants',
    ids: [
      'com-shop-2-lot2x2',
      'com-shop-2-lot2x2',
      'com-convenience-1-lot3x2',
      'com-shop-2-lot2x2',
      'com-low-2-lot3x2',
      'com-shop-2-lot2x2',
      'com-convenience-1-lot3x2',
      'com-low-2-lot3x2',
      'com-shop-2-lot2x2',
      'com-low-2-lot3x2',
      'com-convenience-1-lot3x2',
    ],
  },
  {
    name: 'lineup',
    lineup: true,
    ids: [
      'com-autorepair-1-lot2x2',
      'com-convenience-1-lot3x2',
      'com-low-1',
      'com-strip-1',
      'com-market-1',
      'com-restaurant-1-lot2x2',
      'com-fuel-1',
      'com-high-1',
      'com-hotel-1',
    ],
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
    Math.abs(g.height[idx(x, z)] - h0) <= FLAT_TOLERANCE_M;
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
      at += fp.w + (street.gap ?? 0);
      return placed;
    });
  });
  for (const [s, placed] of spans.entries()) {
    const last = placed[placed.length - 1];
    const length = last.x + last.w - X + 2 * MARGIN;
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
    await cleanShot(page, `${out}/${name}.png`);
  };
  const T = await tileMeters(page);
  const heightOf = (id) => catalog.find((c) => c.id === id).height;
  /** A box of tiles, `h` metres tall, that a shot frames whole. */
  const boxOf = (placed) => {
    const x0 = Math.min(...placed.map((b) => b.x));
    const x1 = Math.max(...placed.map((b) => b.x + b.w));
    const z0 = Math.min(...placed.map((b) => b.z));
    const z1 = Math.max(...placed.map((b) => b.z + b.d));
    return {
      x: (x0 + x1) / 2,
      z: (z0 + z1) / 2,
      w: x1 - x0,
      d: z1 - z0,
      h: Math.max(...placed.map((b) => heightOf(b.id))),
    };
  };
  /**
   * Frame a box whole, roof to ground, about the middle of the frame. The
   * ground target is where the ray through the box's mid-height meets the
   * ground, so the box's own tiles, not the street, sit at the centre; the eye
   * backs off until the box's projected height and width fill `fill` of the
   * 45 degree view, but never inside the camera's floor.
   */
  const frame = async (name, box, yaw, pitch = DEFAULT_PITCH, fill = 0.6) => {
    const tall = box.h * Math.cos(pitch) + box.d * T * Math.sin(pitch);
    const wide = box.w * T * Math.abs(Math.cos(yaw)) + box.d * T * Math.abs(Math.sin(yaw));
    const aspect = 1280 / 800;
    const distance = Math.max(
      CAMERA_MIN_DISTANCE,
      tall / (2 * Math.tan(Math.PI / 8) * fill),
      wide / (2 * Math.tan(Math.PI / 8) * aspect * fill),
    );
    const back = box.h / 2 / Math.tan(pitch) / T;
    await shoot(
      name,
      box.x - 0.5 - Math.sin(yaw) * back,
      box.z - 0.5 - Math.cos(yaw) * back,
      distance,
      yaw,
      pitch,
    );
  };
  const find = (street, id, nth = 0) =>
    spans[STREETS.findIndex((s) => s.name === street)].filter((b) => b.id === id)[nth];
  /**
   * The ground a bank's lanes or a lube's loop cover, with its body: metres from the lot's
   * north-west corner (a street along its south edge), as the lot layout lays them out.
   * A bank's lanes stand on the body's low-x side; a lube's lane, apron and court round it.
   */
  const COMPLEX_M = {
    'com-bank-1-lot2x3': { cx: 25.5, cz: 40, w: 22.4, d: 27.2 },
    'com-bank-2-lot3x3': { cx: 32.3, cz: 40, w: 36, d: 27.2 },
    'com-bank-3-lot4x3': { cx: 39.1, cz: 40, w: 49.6, d: 27.2 },
    'com-lube-1-lot2x3': { cx: 22.9, cz: 39.6, w: 17.3, d: 40.7 },
    'com-lube-2-lot3x3': { cx: 29.7, cz: 39.6, w: 30.9, d: 40.7 },
    'com-lube-3-lot4x3': { cx: 36.5, cz: 39.6, w: 44.5, d: 40.7 },
    // A car wash's loop runs from the street to the end of its court: the lane, the body and the apron, the court behind.
    'com-carwash-1-lot2x3': { cx: 22.95, cz: 39.65, w: 17.3, d: 40.7 },
    'com-carwash-2-lot2x4': { cx: 22.95, cz: 43.7, w: 17.3, d: 72.6 },
    'com-carwash-3-lot3x4': { cx: 29.75, cz: 43.7, w: 30.9, d: 72.6 },
  };
  const standingNow = await page.evaluate(() => window.__slimcity.readBuildings());
  /** The placed building's own working ground as a box, found by its catalog id. */
  const complexBox = (id, street = 'bank') => {
    const b = find(street, id);
    const c = COMPLEX_M[id];
    const real = standingNow.find((s) => s.catalogId === id);
    console.log(
      'complex',
      id,
      JSON.stringify(b),
      'T',
      T,
      'standing',
      real && [real.x, real.z, real.rotation],
    );
    return { x: b.x + c.cx / T, z: b.z + c.cz / T, w: c.w / T, d: c.d / T, h: heightOf(id) };
  };
  const rowBox = (s) => boxOf(spans[s]);
  const lineup = STREETS.findIndex((s) => s.lineup);
  // The whole line-up, then its first three kinds (the repair shop, the store, the corner shop) close enough to tell apart.
  const shootLineup = async (suffix) => {
    await frame(`lineup${suffix}`, rowBox(lineup), 0.2);
    await frame(`lineup-new${suffix}`, boxOf(spans[lineup].slice(0, 3)), 0.2, DEFAULT_PITCH, 0.85);
  };

  const views = (suffix) => async () => {
    // At night the first street, the pylon and the fuel canopy stand for the kit; the rest repeat the day frames.
    const night = suffix === '-night';
    for (const [s, street] of STREETS.entries()) {
      if (street.lineup || street.name === 'variants') continue;
      if (night && s !== 0) continue;
      await frame(`${street.name}${suffix}`, rowBox(s), 0.3);
    }
    await frame(`strip-pylon${suffix}`, boxOf([find('strip', 'com-strip-2')]), 0.3);
    if (!night) await frame('stacked-above', rowBox(STREETS.findIndex((s) => s.name === 'stacked')), 0.0, 1.45);
    if (night) {
      await frame(`fuel-station${suffix}`, boxOf([find('fuel', 'com-fuel-2')]), 0.3);
      return;
    }
    await frame(`market-car-park${suffix}`, boxOf([find('market', 'com-market-2')]), 0.2);
    await frame(
      `restaurant-above${suffix}`,
      // The lot beside it too: framed on its own, the neighbour was cut at the edge.
      boxOf([
        find('restaurant', 'com-restaurant-2'),
        find('restaurant', 'com-restaurant-1-lot2x2'),
      ]),
      0.3,
      1.25,
    );
    await frame(`fuel-station${suffix}`, boxOf([find('fuel', 'com-fuel-2')]), 0.3);
    await frame(`office${suffix}`, boxOf([find('downtown', 'com-high-1')]), 0.3);
    await frame(`hotel${suffix}`, boxOf([find('downtown', 'com-hotel-2')]), 0.3);
  };

  await setPhase(0.5);
  await views('')();
  await shootLineup('');

  // The close shots, at twice the pixels over the camera's floor distance.
  const restore = await closeUp(page, 2);
  // The variants street in two halves, oblique and from above: each shop's building stands at the street or behind its car park.
  const variantsRow = spans[STREETS.findIndex((s) => s.name === 'variants')];
  const halves = [variantsRow.slice(0, 6), variantsRow.slice(6)];
  for (const [n, half] of halves.entries()) {
    const tag = n === 0 ? '' : `-${n + 1}`;
    await frame(`variants${tag}`, boxOf(half), 0.3, 0.6, 0.9);
    await frame(`variants${tag}-above`, boxOf(half), 0.0, 1.45, 0.9);
  }
  await frame('close-shop', boxOf([find('main', 'com-low-1')]), 0.3);
  // The pylon and shopfronts from the other side, lower, so these are not the street-level frames again.
  await frame('close-strip', boxOf([find('strip', 'com-strip-2')]), -0.7, 0.45, 0.8);
  await frame('close-restaurant', boxOf([find('restaurant', 'com-restaurant-2')]), 0.3, 1.0);
  // The restaurant's sign and its lane from low, and from behind: nothing stands alone off the lot's paving.
  await frame(
    'close-restaurant-low',
    boxOf([find('restaurant', 'com-restaurant-2')]),
    0.3,
    0.35,
    0.8,
  );
  await frame(
    'close-restaurant-back',
    boxOf([find('restaurant', 'com-restaurant-2')]),
    3.4,
    0.5,
    0.8,
  );
  await frame('close-fuel', boxOf([find('fuel', 'com-fuel-2')]), 0.9, 0.4, 0.8);
  // The repair shop's bay doors and sign, then its end walls (office, tyre rack, oil tank); the store's glazed front, canopy, lockers and bollards.
  await frame('close-repair', boxOf([find('fuel', 'com-autorepair-2-lot4x2')]), 0.3, 0.5, 0.9);
  await frame(
    'close-repair-side',
    boxOf([find('fuel', 'com-autorepair-2-lot4x2')]),
    1.0,
    0.45,
    0.8,
  );
  await frame(
    'close-repair-far-side',
    boxOf([find('fuel', 'com-autorepair-2-lot4x2')]),
    -1.0,
    0.45,
    0.8,
  );
  await frame('close-store', boxOf([find('main', 'com-convenience-2-lot4x2')]), 0.3, 0.5, 0.9);
  // The pharmacy's corner tower and sign bands from the street, and its drive-up window and lane from either side.
  for (const [n, id] of [
    [1, 'com-pharmacy-1-lot7x2'],
    [2, 'com-pharmacy-2-lot5x4'],
    [3, 'com-pharmacy-3-lot8x3'],
  ]) {
    await frame(`close-pharmacy-${n}`, boxOf([find('pharmacy', id)]), 0.3, 0.5, 0.9);
  }
  await frame(
    'close-pharmacy-side',
    boxOf([find('pharmacy', 'com-pharmacy-2-lot5x4')]),
    1.0,
    0.45,
    0.8,
  );
  await frame(
    'close-pharmacy-far-side',
    boxOf([find('pharmacy', 'com-pharmacy-2-lot5x4')]),
    -1.0,
    0.45,
    0.8,
  );
  // The bank's entrance from the street, its two drive-up lanes under the canopy from the side and from above; the medical office's roof, canopy and sign; the lube's doors and its court.
  for (const [n, id] of [
    [1, 'com-bank-1-lot2x3'],
    [2, 'com-bank-2-lot3x3'],
    [3, 'com-bank-3-lot4x3'],
  ]) {
    await frame(`close-bank-${n}`, complexBox(id), 0.3, 0.5, 0.9);
  }
  // The lanes stand on the body's west side: from low on that side the canopy, kiosk and pedestal read; and from above, the whole working ground.
  await frame('close-bank-lanes', complexBox('com-bank-2-lot3x3'), -1.2, 0.3, 0.85);
  await frame('close-bank-lanes-east', complexBox('com-bank-2-lot3x3'), 1.2, 0.3, 0.85);
  await frame('close-bank-above', complexBox('com-bank-2-lot3x3'), 0.0, 1.5, 0.45);
  // The canopy, island, teller kiosk and cash machine, from the street end of the lanes and from their head.
  const bankLanes = () => {
    const b = find('bank', 'com-bank-2-lot3x3');
    return { x: b.x + 18.7 / T, z: b.z + 35.3 / T, w: 10 / T, d: 14 / T, h: 3 };
  };
  await frame('close-bank-canopy', bankLanes(), -0.6, 0.5, 0.9);
  await frame('close-bank-canopy-head', bankLanes(), 2.6, 0.5, 0.9);
  for (const [n, id] of [
    [1, 'com-medical-1-lot4x2'],
    [2, 'com-medical-2-lot5x2'],
    [3, 'com-medical-3-lot6x3'],
  ]) {
    await frame(`close-medical-${n}`, boxOf([find('medical', id)]), 0.3, 0.5, 0.9);
  }
  for (const [n, id] of [
    [1, 'com-lube-1-lot2x3'],
    [2, 'com-lube-2-lot3x3'],
    [3, 'com-lube-3-lot4x3'],
  ]) {
    await frame(`close-lube-${n}`, complexBox(id), 0.3, 0.5, 0.9);
  }
  // The front apron from low; the whole loop from above; and from behind and above, the lane, the court and the rear bay doors.
  await frame('close-lube-apron', complexBox('com-lube-2-lot3x3'), 0.3, 0.3, 0.9);
  await frame('close-lube-above', complexBox('com-lube-2-lot3x3'), 0.0, 1.5, 0.9);
  await frame('close-lube-back', complexBox('com-lube-2-lot3x3'), 3.14, 0.9, 0.9);
  // The car wash: from above, the lane, the court, the tunnel and the apron as one loop; and low at the street portal under its sign band.
  const washLoop = () => complexBox('com-carwash-2-lot2x4', 'carwash');
  await frame('close-carwash-above', washLoop(), 0.0, 1.5, 0.9);
  // The street portal and the apron before it: the body's front 14 m by 12 m, from the south.
  const washPortal = () => {
    const b = find('carwash', 'com-carwash-2-lot2x4');
    return { x: b.x + 24.8 / T, z: b.z + 74 / T, w: 14 / T, d: 12 / T, h: 5 };
  };
  await frame('close-carwash-portal', washPortal(), 0.3, 0.25, 0.9);
  // A strip's front door close: the walk, the bed, the bench and bin beside the door, and the lot's lights.
  const stripDoor = () => {
    const s = find('strip', 'com-strip-1-lot5x2') ?? find('strip', 'com-strip-2');
    return { x: s.x + s.w * 0.55, z: s.z + s.d - 0.9, w: 6, d: 2, h: 4 };
  };
  await frame('close-front-door', stripDoor(), 0.3, 0.5, 0.9);
  await restore();

  await setPhase(0.96);
  await views('-night')();
  const restoreNight = await closeUp(page, 2);
  await frame('close-front-door-night', stripDoor(), 0.3, 0.5, 0.9);
  await frame(
    'close-repair-night',
    boxOf([find('fuel', 'com-autorepair-2-lot4x2')]),
    0.3,
    0.5,
    0.9,
  );
  await frame(
    'close-store-night',
    boxOf([find('main', 'com-convenience-2-lot4x2')]),
    0.3,
    0.5,
    0.9,
  );
  await frame(
    'close-pharmacy-night',
    boxOf([find('pharmacy', 'com-pharmacy-2-lot5x4')]),
    0.3,
    0.5,
    0.9,
  );
  await frame('close-bank-night', complexBox('com-bank-2-lot3x3'), -1.2, 0.3, 0.85);
  await frame('close-lube-night', complexBox('com-lube-2-lot3x3'), 0.3, 0.5, 0.9);
  await frame('close-carwash-night', washPortal(), 0.3, 0.25, 0.9);
  await restoreNight();

  await setPhase(LINEUP_NIGHT);
  await shootLineup('-night');
} finally {
  await browser.close();
}
