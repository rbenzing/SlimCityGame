/** Shots of the apartment kit: a street of each of the four block kinds, the
 * multiplex, the garden walk-up, the mid-rise and the tower at every level,
 * each at the default camera pitch beside the 4 m car; a close-up of the
 * walk-up's breezeway and of the tower's podium; then the same again at night,
 * where the podium's storefront band and the tower's lobby glow and nothing
 * else does. Buildings are placed by command on flat dry ground with the sim
 * paused, as the frame budget does: a running sim with no power, water or
 * zones abandons and clears them within a minute.
 *
 * Usage: node tools/apartment-shots.mjs [baseUrl] [outDir]   (a dev server must be running) */
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
const out = process.argv[3] ?? 'tools/shots-apartments';
mkdirSync(out, { recursive: true });

const catalog = JSON.parse(readFileSync('src/data/catalog.json', 'utf8')).buildings;
const footprint = (id) => {
  const entry = catalog.find((c) => c.id === id);
  if (!entry) throw new Error(`no catalog entry ${id}`);
  return entry.footprint;
};

const SEED = 7;
const DEFAULT_PITCH = 0.7;
/** How far up the frame the subject is carried, as a fraction of its height. */
const LIFT = 0.12;
const RT = { TwoLane: 1 };
/** Tiles a street takes: the deepest lot (3), the road, and the gap to the next street. */
const STREET_ROWS = 8;
/** Tiles of road beyond each end of a street's buildings. */
const MARGIN = 2;
/** Tiles between neighbours on a street, so each lot reads on its own. */
const GAP = 1;

/** The streets, one per kind, each level along it left to right, with a kerb car beside each. */
const STREETS = [
  { name: 'multiplex', ids: ['res-multiplex-1', 'res-multiplex-2', 'res-multiplex-3'] },
  { name: 'garden', ids: ['res-medium-1', 'res-medium-2', 'res-medium-3'] },
  { name: 'midrise', ids: ['res-high-1', 'res-high-2', 'res-high-3'] },
  { name: 'tower', ids: ['res-tower-1', 'res-tower-2', 'res-tower-3'] },
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
  const flatDry = (x, z, h0, slope) =>
    x >= 0 &&
    z >= 0 &&
    x < N &&
    z < N &&
    !g.water[idx(x, z)] &&
    Math.abs(g.height[idx(x, z)] - h0) <= slope;
  const streetLength = (street) =>
    street.ids.reduce((sum, id) => sum + footprint(id).w + GAP, 0) + 2 * MARGIN;
  const cols = Math.max(...STREETS.map(streetLength));
  const rows = STREETS.length * STREET_ROWS;
  let anchor = null;
  for (const slope of [6, 9, 12]) {
    for (let z = 20; z < N - rows - 10 && !anchor; z++) {
      for (let x = 20; x < N - cols - 20 && !anchor; x++) {
        const h0 = g.height[idx(x, z)];
        let ok = true;
        for (let dz = -3; dz < rows && ok; dz++) {
          for (let dx = -MARGIN; dx < cols + MARGIN && ok; dx++) {
            if (!flatDry(x + dx, z + dz, h0, slope)) ok = false;
          }
        }
        if (ok) anchor = { x, z, slope };
      }
    }
    if (anchor) break;
  }
  if (!anchor) throw new Error('no flat dry ground for the streets');
  console.log('anchor', JSON.stringify(anchor));
  const { x: X, z: Z0 } = anchor;

  // Each street's road runs along its row; its buildings stand on the north side, fronting it.
  const roadRow = (s) => Z0 + 3 + s * STREET_ROWS;
  const spans = STREETS.map((street, s) => {
    let at = X;
    return street.ids.map((id) => {
      const fp = footprint(id);
      const placed = { id, x: at, z: roadRow(s) - fp.d, w: fp.w, d: fp.d };
      at += fp.w + GAP;
      return placed;
    });
  });
  for (const [s, street] of STREETS.entries()) {
    const length = streetLength(street);
    await send('Street', [
      {
        kind: 'buildRoad',
        tier: RT.TwoLane,
        tiles: Array.from({ length }, (_, i) => ({ x: X - MARGIN + i, z: roadRow(s) })),
      },
    ]);
  }
  // One command each: a batch is atomic, and one refused tile would drop the street.
  for (const placed of spans) {
    for (const b of placed) {
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
  console.log('kit', JSON.stringify(await page.evaluate(() => window.__slimcity.readKit())));

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
    // Aim a tenth of the frame's height short of the box, so its street edge clears
    // the bottom bar (the lowest 110 px of 800) instead of standing behind it.
    const lift = (LIFT * 2 * distance * Math.tan(Math.PI / 8)) / Math.sin(pitch) / T;
    const back = box.h / 2 / Math.tan(pitch) / T - lift;
    await shoot(
      name,
      box.x - 0.5 - Math.sin(yaw) * back,
      box.z - 0.5 - Math.cos(yaw) * back,
      distance,
      yaw,
      pitch,
    );
  };
  const find = (street, id) =>
    spans[STREETS.findIndex((s) => s.name === street)].find((b) => b.id === id);

  const views = (suffix) => async () => {
    // Each kind at every level from the street, beside the kerb car; the taller the farther back.
    for (const [s, street] of STREETS.entries()) {
      for (const id of street.ids) {
        await frame(`${street.name}-${id}${suffix}`, boxOf([find(street.name, id)]), 0.3);
      }
      // The street of the kind, all three levels in one frame.
      await frame(`street-${street.name}${suffix}`, boxOf(spans[s]), 0.25);
    }
  };

  await setPhase(0.5);
  await views('')();

  // The close shots, at twice the pixels over the camera's floor distance.
  const restore = await closeUp(page, 2);
  const garden = boxOf([find('garden', 'res-medium-2')]);
  // The podium is the subject: the tower over it is taller than the camera's floor distance frames.
  const tower = { ...boxOf([find('tower', 'res-tower-1')]), h: 4 };
  const multiplex = boxOf([find('multiplex', 'res-multiplex-2')]);
  // The mid-rise's close shot is of its lower storeys and entrance, for the same reason.
  const midrise = { ...boxOf([find('midrise', 'res-high-2')]), h: 8 };
  await frame('close-garden-breezeway', garden, 0.15, 0.35, 0.7);
  await frame('close-tower-podium', tower, 0.2, 0.5, 0.7);
  await frame('close-multiplex', multiplex, 0.3, 0.55, 0.7);
  await frame('close-midrise', midrise, 0.25, 0.5, 0.7);
  // The walk-ups' hips from higher up, where the four pitches meeting at the apex show.
  await frame('roof-garden', garden, 0.4, 1.1, 0.7);
  await frame('roof-multiplex', multiplex, 0.4, 1.1, 0.7);
  await restore();

  await setPhase(0.96);
  await views('-night')();
  const restoreNight = await closeUp(page, 2);
  await frame('close-tower-podium-night', tower, 0.2, 0.5, 0.7);
  await frame('close-garden-breezeway-night', garden, 0.15, 0.35, 0.7);
  await restoreNight();
} finally {
  await browser.close();
}
