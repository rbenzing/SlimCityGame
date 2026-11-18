/** Airport shots: the three airports drawn from their layout, and the former
 * airport as it was.
 *
 * For each new rung (airfield, regional-airport, international-airport), on
 * ground levelled through the real terraform command, with the street along
 * the car park's edge (the plot's south edge at rotation 0, so the runway runs
 * east-west and reads 09 / 27):
 *   <id>-plot         the whole plot from above (the international's plot is
 *                     wider than the camera's furthest view, so its runway ends
 *                     and terminal are the subjects)
 *   <id>-runway-end   the low end from the approach: numerals, threshold stripes
 *   <id>-apron        the apron, aircraft on their stands and the buildings
 *   <id>-night        the apron at night
 * Then the former airport: airport-overview, airport-above, terminal-close,
 * apron-close, airport-night.
 * Every frame is guarded by requireInFrame on the subject it is of.
 * The sim is paused: a running sim with no power or water abandons the
 * building within a minute.
 *
 * Usage: node tools/airport-shots.mjs [baseUrl] [outDir] [id,id...]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import {
  cleanShot,
  closeUp,
  hooksReady,
  requireInFrame,
  setClock,
  tileCamera,
} from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'tools/shots-airport';
mkdirSync(out, { recursive: true });
/** Optional comma list of catalog ids to shoot, for a re-run of one rung. */
const only = process.argv[4]?.split(',');

/** Seeds tried in turn for a dry block big enough for the plot. */
const SEEDS = [7, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const NIGHT_HOUR = 23;
const CAR = 0;
const DEFAULT_PITCH = 0.7;
const OVERHEAD_PITCH = 1.2;
const CAMERA_FAR = 2400;
const RUNGS = [
  { id: 'airfield', w: 49, d: 9 },
  { id: 'regional-airport', w: 107, d: 23 },
  { id: 'international-airport', w: 183, d: 33 },
];
const LEGACY = { id: 'airport', w: 8, d: 6 };

const browser = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
let failed = false;
let pageErrors = 0;

/** A fresh game page in sandbox with money, paused at noon. */
async function openGame(seed) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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
    [{ screen: 'playing', seed, mode: 'new' }],
  );
  await page.goto(base + '?nobloom', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#viewport canvas', { timeout: 60000 });
  await hooksReady(page);
  const send = (label, commands) =>
    page.evaluate(([l, c]) => window.__slimcity.cmd(l, c), [label, commands]);
  await send('Sandbox', [{ kind: 'setSandbox', on: true }]);
  await send('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
  await page.evaluate(() => {
    window.__slimcity.setSpeed(0);
    window.__slimcity.setDayT(0.5);
  });
  return { page, send, cam: tileCamera(page) };
}

/**
 * The first dry stretch of the map with `cols` by `rows` tiles of no water and
 * at most 20 m of relief, found with a prefix sum over the water layer.
 */
async function findDryBlock(page, cols, rows) {
  const g = await page.evaluate(() => window.__slimcity.readGrid());
  const N = g.size;
  const prefix = new Int32Array((N + 1) * (N + 1));
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      prefix[(z + 1) * (N + 1) + x + 1] =
        (g.water[z * N + x] ? 1 : 0) +
        prefix[z * (N + 1) + x + 1] +
        prefix[(z + 1) * (N + 1) + x] -
        prefix[z * (N + 1) + x];
    }
  }
  const wet = (x, z) =>
    prefix[(z + rows) * (N + 1) + x + cols] -
    prefix[z * (N + 1) + x + cols] -
    prefix[(z + rows) * (N + 1) + x] +
    prefix[z * (N + 1) + x];
  for (let z = 20; z + rows < N - 20; z++) {
    for (let x = 20; x + cols < N - 20; x++) {
      if (wet(x, z) !== 0) continue;
      let lo = Infinity;
      let hi = -Infinity;
      for (let dz = 0; dz < rows; dz++) {
        for (let dx = 0; dx < cols; dx++) {
          const h = g.height[(z + dz) * N + x + dx];
          if (h < lo) lo = h;
          if (h > hi) hi = h;
        }
      }
      if (hi - lo <= 20) return { x, z, level: (lo + hi) / 2 };
    }
  }
  return null;
}

/** A game on the first seed that has a dry block of `cols` by `rows` tiles, and the block. */
async function openWithBlock(cols, rows) {
  for (const seed of SEEDS) {
    const game = await openGame(seed);
    const block = await findDryBlock(game.page, cols, rows);
    if (block) {
      console.log(`seed ${seed}: dry ${cols}x${rows} block at ${block.x},${block.z}`);
      return { ...game, block };
    }
    await game.page.close();
  }
  throw new Error(`no dry ${cols}x${rows} block on seeds ${SEEDS.join(',')}`);
}

/** Level the block through the terraform command, then wait for the ground to settle. */
async function level(page, x, z, w, h, height) {
  await page.evaluate(
    ([bx, bz, bw, bh, lv]) => {
      const heights = new Float32Array(bw * bh).fill(lv);
      window.__slimcity.cmd('Level site', [
        { kind: 'terraformSet', x: bx, z: bz, w: bw, h: bh, heights },
      ]);
    },
    [x, z, w, h, height],
  );
  await page.waitForTimeout(2000);
}

const MARGIN = 2;
const STREET_TILES = 20;

/** One new rung: level, street along the south edge, place, and take the four frames. */
async function shootRung(rung) {
  const cols = rung.w + 2 * MARGIN;
  const rows = rung.d + 1 + 2 * MARGIN;
  const { page, send, cam, block } = await openWithBlock(cols, rows);
  try {
    const AX = block.x + MARGIN;
    const AZ = block.z + MARGIN;
    await level(page, block.x, block.z, cols, rows, block.level);
    const road = AZ + rung.d;
    const streetX = AX + Math.floor((rung.w - STREET_TILES) / 2);
    await send('Street', [
      {
        kind: 'buildRoad',
        tier: 1,
        tiles: Array.from({ length: STREET_TILES }, (_, i) => ({ x: streetX + i, z: road })),
      },
    ]);
    await send('Airport', [
      { kind: 'placeBuilding', catalogId: rung.id, x: AX, z: AZ, rotation: 0 },
    ]);
    await page.waitForTimeout(3000);
    const standing = await page.evaluate(() => window.__slimcity.readBuildings());
    if (!standing.some((b) => b.catalogId === rung.id)) throw new Error(`${rung.id} not standing`);

    const T = await page.evaluate(() => window.__slimcity.tileMeters());
    const L = await page.evaluate(async (id) => {
      const m = await import('/src/shared/airportlayout.ts');
      return m.airportLayout(id);
    }, rung.id);
    // A point of the layout's frame (x along the runway, z toward the street) as a camera tile.
    const at = (lx, lz) => [AX + lx / T - 0.5, AZ + lz / T - 0.5];
    const rz = L.runwayCentreZ;
    const x0 = L.runway.x;
    const x1 = x0 + L.runway.w;
    const terminal = L.terminal ?? L.pilotsBuilding;

    const need = (name, lx, lz, y = 0) => requireInFrame(page, name, ...at(lx, lz), y);
    const shoot = async (name, target, distance, yaw, pitch, subjects) => {
      await cam(...at(...target), distance, yaw, pitch);
      await page.waitForTimeout(1200);
      for (const [lx, lz, y] of subjects) await need(name, lx, lz, y);
      await cleanShot(page, `${out}/${rung.id}-${name}.png`);
      console.log('shot', rung.id, name);
    };

    const plotDistance = Number(process.env.PLOT_DISTANCE) || Math.min(CAMERA_FAR, L.plot.w / 1.15);
    // The international's plot is wider than the camera's furthest view, so its frame
    // is the low runway end, 2.6 km of runway and the terminal.
    const wide = L.plot.w > plotDistance * 1.3;
    const plotSubjects = wide
      ? [
          [x0, rz],
          [x0 + 2600, rz],
          [terminal.x + terminal.w / 2, terminal.z + terminal.d / 2],
        ]
      : [
          [0, 0],
          [L.plot.w, L.plot.d],
        ];
    const plotTarget = wide ? [x0 + 1300, L.plot.d / 2] : [L.plot.w / 2, L.plot.d / 2];
    await shoot('plot', plotTarget, plotDistance, 0, 1.4, plotSubjects);

    // The low end seen from the approach: the eye is west of the target looking east.
    const restore = await closeUp(page, 2);
    await shoot('runway-end', [x0 + 50, rz], 150, -Math.PI / 2, 0.8, [
      [x0 + 8, rz],
      [x0 + 82, rz],
    ]);

    // The apron from the taxiway side, looking south at the aircraft and the buildings.
    const apron = L.apron;
    const apronDistance = Math.max(80, apron.w / 0.8);
    const apronTarget = [apron.x + apron.w / 2, apron.z + apron.d];
    const apronSubjects = [
      [apron.x + 4, apron.z + apron.d / 2],
      [apron.x + apron.w - 4, apron.z + apron.d / 2],
    ];
    await shoot('apron', apronTarget, apronDistance, Math.PI, 0.6, apronSubjects);
    await restore();

    await setClock(page, NIGHT_HOUR);
    await page.evaluate(() => window.__slimcity.setSpeed(0));
    await page.waitForTimeout(1500);
    await shoot('night', apronTarget, apronDistance, Math.PI, 0.6, apronSubjects);
  } finally {
    await page.close();
  }
}

/** The former airport on level ground beside a street to its north: its terminal half is its back edge. */
async function shootLegacy() {
  const STREET = 18;
  const ROWS_ABOVE = 1;
  const cols = STREET + 4;
  const rows = ROWS_ABOVE + 1 + LEGACY.d + 1 + 2;
  const { page, send, cam, block } = await openWithBlock(cols, rows);
  try {
    const X = block.x + 2;
    const Z0 = block.z + 1;
    await level(page, block.x, block.z, cols, rows, block.level);
    const road = Z0 + ROWS_ABOVE;
    const AX = X + 5;
    const AZ = road + 1;
    await send('Street', [
      {
        kind: 'buildRoad',
        tier: 1,
        tiles: Array.from({ length: STREET }, (_, i) => ({ x: X + i, z: road })),
      },
    ]);
    await send('Airport', [
      { kind: 'placeBuilding', catalogId: LEGACY.id, x: AX, z: AZ, rotation: 0 },
    ]);
    await page.waitForTimeout(3000);
    const standing = await page.evaluate(() => window.__slimcity.readBuildings());
    if (!standing.some((b) => b.catalogId === LEGACY.id)) {
      // The former airport is retired: the place command refuses it, so only a loaded save holds one.
      console.log('former airport frames skipped: the place command refuses a retired entry');
      return;
    }

    const T = await page.evaluate(() => window.__slimcity.tileMeters());
    // The plot centre in tiles, and a point in the kit's local frame (local +Z is south, away from the street).
    const cx = AX + LEGACY.w / 2;
    const cz = AZ + LEGACY.d / 2;
    const local = (lx, lz) => [cx + lx / T - 0.5, cz + lz / T - 0.5];
    await page.evaluate(
      ([list]) => window.__slimcity.setVehicles(list),
      [[{ x: cx * T, z: (road + 0.5) * T, heading: Math.PI / 2, kind: CAR }]],
    );
    const shoot = async (name, [tx, tz], distance, yaw, pitch = DEFAULT_PITCH) => {
      await cam(tx, tz, distance, yaw, pitch);
      await page.waitForTimeout(1200);
      await requireInFrame(page, name, tx, tz);
      await cleanShot(page, `${out}/${name}.png`);
      console.log('shot', name);
    };

    await shoot('airport-overview', local(0, 0), 320, 0.4);
    await shoot('airport-above', local(0, -10), 300, 0, OVERHEAD_PITCH);
    const restore = await closeUp(page, 2);
    await shoot('terminal-close', local(0, -58), 40, Math.PI + 0.3, 0.4);
    await shoot('apron-close', local(64, 40), 40, 1.2, 0.5);
    await restore();
    await setClock(page, NIGHT_HOUR);
    await page.evaluate(() => window.__slimcity.setSpeed(0));
    await page.waitForTimeout(1500);
    await shoot('airport-night', local(0, 0), 320, 0.4);
  } finally {
    await page.close();
  }
}

try {
  for (const rung of RUNGS) if (!only || only.includes(rung.id)) await shootRung(rung);
  if (!only || only.includes(LEGACY.id)) await shootLegacy();
} catch (e) {
  failed = true;
  console.log('FAILED', e.message);
} finally {
  await browser.close();
}
if (pageErrors > 0) failed = true;
process.exit(failed ? 1 : 0);
