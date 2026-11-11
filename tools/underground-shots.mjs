/** Underground shots: buried water pipes, the underground view and the water,
 * sewer and trash lenses. A small street grid on a plateau with homes along it,
 * pipe laid under two of the streets, a pumping station and a drain on a pond's
 * bank joined to the grid by pipe.
 *
 * Frames: surface (plain view, no pipe may show), underground-view (the view the
 * pipe tool gives), underground-close (40 m at a pipe junction under a street),
 * lens-watered, lens-sewered, lens-trash.
 *
 * Usage: node tools/underground-shots.mjs [baseUrl] [outDir]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { cleanShot, hooksReady, tileCamera, unlimitedMoneyOption } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-underground';
mkdirSync(out, { recursive: true });

const RT = { TwoLane: 1 };

const browser = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});
await page.addInitScript(() => {
  try {
    sessionStorage.setItem(
      'slimcity.session',
      JSON.stringify({ screen: 'playing', seed: 12345, mode: 'new' }),
    );
  } catch (e) {
    void e;
  }
});
await unlimitedMoneyOption(page);

const failures = [];
const check = (ok, what) => {
  if (!ok) {
    failures.push(what);
    console.log('FAILED check:', what);
  }
};

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#viewport canvas', { timeout: 30000 });
  await hooksReady(page);
  await page.waitForTimeout(3000);

  const hook = (fn, arg) => page.evaluate(fn, arg);
  const cmd = (label, commands) =>
    hook(([l, c]) => window.__slimcity.cmd(l, c), [label, commands]);
  const camera = tileCamera(page);
  const shot = async (name, settle = 1800) => {
    await page.waitForTimeout(settle);
    await cleanShot(page, `${out}/${name}.png`);
    console.log('shot', name);
  };

  // A dry, flat block: 40 tiles along the street, 10 rows north of it for the
  // homes' side streets and 12 south for the shore kits and their pond.
  const g0 = await hook(() => window.__slimcity.readGrid());
  const N = g0.size;
  const idx = (x, z) => z * N + x;
  let anchor = null;
  for (let z = 40; z < N - 40 && !anchor; z++) {
    for (let x = 40; x < N - 60; x++) {
      let ok = true;
      for (let k = -2; k < 40 && ok; k++) {
        for (let dz = -10; dz <= 12 && ok; dz++) {
          const i = idx(x + k, z + dz);
          if (g0.water[i] || g0.height[i] < 2 || g0.height[i] > 22) ok = false;
        }
      }
      if (ok) anchor = { x, z };
    }
  }
  if (!anchor) {
    console.log('no dry block found');
    process.exitCode = 1;
    throw new Error('no dry block found');
  }
  const { x: X, z: Z } = anchor;
  console.log('anchor', JSON.stringify(anchor));

  await hook(() => window.__slimcity.setDayT(0.5));
  await hook(() => window.__slimcity.setSpeed(0));
  await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
  await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
  await page.waitForTimeout(300);

  // A low plateau with a pond dug south of the street: the bank drops 3.5 m in
  // one tile, inside MAX_BUILD_SLOPE, so the shore kits have water on their
  // south edge and ground they may stand on.
  await hook(
    ([x, z, w, h, pondRow]) => {
      const heights = new Float32Array(w * h);
      for (let row = 0; row < h; row++) {
        for (let col = 0; col < w; col++) heights[row * w + col] = row >= pondRow ? -1.5 : 2.0;
      }
      window.__slimcity.cmd('Pond', [{ kind: 'terraformSet', x, z, w, h, heights }]);
    },
    [X - 3, Z - 12, 44, 23, 17],
  );
  await page.waitForTimeout(1500);

  const line = (tier, tiles) => cmd('Road', [{ kind: 'buildRoad', tier, tiles }]);
  const rowTiles = (z, x0, x1) =>
    Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, z }));
  const colTiles = (x, z0, z1) =>
    Array.from({ length: z1 - z0 + 1 }, (_, i) => ({ x, z: z0 + i }));
  await line(RT.TwoLane, rowTiles(Z, X - 1, X + 36));
  await line(RT.TwoLane, colTiles(X + 11, Z - 9, Z - 1));
  await line(RT.TwoLane, colTiles(X + 24, Z - 9, Z - 1));
  await page.waitForTimeout(800);

  const place = (catalogId, x, z, rotation) =>
    cmd(catalogId, [{ kind: 'placeBuilding', catalogId, x, z, rotation }]);
  // Homes north of the street, their street side on the kerb.
  const homes = [X + 1, X + 4, X + 7, X + 14, X + 17, X + 20, X + 27, X + 30];
  for (const x of homes) await place('res-low-1', x, Z - 2, 0);
  // Shore kits south of the street, on the pond's north bank.
  await place('water-pump', X + 1, Z + 3, 0);
  await place('water-drain', X + 13, Z + 4, 0);
  await page.waitForTimeout(1200);

  // Pipe under the street from the pump's stub to the east end, a side branch
  // under the first cross street, and the drain's stub. One command each.
  await cmd('Pipe', [{ kind: 'layWaterPipe', tiles: rowTiles(Z, X + 1, X + 30), on: true }]);
  await cmd('Pipe', [{ kind: 'layWaterPipe', tiles: colTiles(X + 11, Z - 9, Z - 1), on: true }]);
  await cmd('Pipe', [{ kind: 'layWaterPipe', tiles: colTiles(X + 1, Z + 1, Z + 2), on: true }]);
  await cmd('Pipe', [{ kind: 'layWaterPipe', tiles: colTiles(X + 13, Z + 1, Z + 3), on: true }]);
  await page.waitForTimeout(1500);

  // Prove the subject stands before shooting it.
  const standing = await hook(() =>
    window.__slimcity
      .readBuildings()
      .filter((b) => ['water-pump', 'water-drain', 'res-low-1'].includes(b.catalogId))
      .map((b) => b.catalogId),
  );
  console.log('standing', JSON.stringify(standing));
  check(standing.includes('water-pump'), 'pumping station missing');
  check(standing.includes('water-drain'), 'drain missing');
  check(standing.filter((c) => c === 'res-low-1').length === homes.length, 'homes missing');

  const g = await hook(() => window.__slimcity.readGrid());
  const pipeCount = g.waterPipe.reduce((n, v) => n + (v === 1 ? 1 : 0), 0);
  const pipeAt = (x, z) => g.waterPipe[idx(x, z)] === 1;
  console.log('pipe tiles', pipeCount);
  check(pipeCount >= 40, `pipes not laid (${pipeCount} tiles)`);
  check(pipeAt(X + 11, Z), 'no pipe at the junction under the street');
  check(pipeAt(X + 20, Z), 'no pipe under the street');
  check(pipeAt(X + 11, Z - 5), 'no pipe under the side street');

  // The lenses read coverage the sim sends, so it runs a few seconds first.
  await hook(() => window.__slimcity.setSpeed(1));
  await page.waitForTimeout(4000);
  await hook(() => window.__slimcity.setSpeed(0));
  await page.waitForTimeout(600);

  const T = await hook(() => window.__slimcity.tileMeters());
  // Cars on the street for scale.
  await hook(
    ([tile, x, z]) =>
      window.__slimcity.setVehicles(
        [5, 9, 16, 22].map((dx, i) => ({
          x: (x + dx) * tile,
          z: (z + (i % 2 ? 0.35 : 0.65)) * tile,
          heading: i % 2 ? -Math.PI / 2 : Math.PI / 2,
          kind: 0,
        })),
      ),
    [T, X, Z],
  );

  const under = () => hook(() => window.__slimcity.readUnderground());
  const overlayOff = () =>
    page.evaluate(() => {
      const b = document.querySelector('button[aria-label="Turn off overlay"]');
      return b ? b.disabled : null;
    });
  const PITCH = 0.9;
  const view = { x: X + 11, z: Z, d: 150 };

  // Plain surface: no tool, no lens, and no pipe may show.
  await hook(() => window.__slimcity.setTool('select'));
  await hook(() => window.__slimcity.setOverlay(null));
  await page.waitForTimeout(500);
  let u = await under();
  console.log('surface', JSON.stringify({ active: u.active, pipesVisible: u.pipesVisible }));
  check(!u.active && !u.pipesVisible, 'surface frame is not the plain view');
  await camera(view.x, view.z - 1, view.d, Math.PI, PITCH);
  await shot('surface');

  // The view the pipe tool gives.
  await hook(() => window.__slimcity.setTool('water.pipe'));
  await page.waitForTimeout(800);
  u = await under();
  console.log('underground', JSON.stringify({ active: u.active, tri: u.triangles, risers: u.risers }));
  check(u.active && u.pipesVisible, 'pipe tool did not take the city underground');
  check(u.triangles.water + u.triangles.sewer + u.triangles.mainWater + u.triangles.mainSewer > 0,
    'no pipe triangles drawn underground');
  await camera(view.x, view.z - 1, view.d, Math.PI, PITCH);
  await shot('underground-view');
  await camera(view.x, view.z, 40, Math.PI, 1.0);
  await shot('underground-close');

  // The buried cable: the street's own supply buried along its middle (above the
  // pipes under it), and a cable from a wind turbine north over open ground. The
  // cable tool takes the city underground; on the surface nothing of it shows but boxes.
  await place('wind-turbine', X + 33, Z - 1, 0);
  await cmd('Buried street supply', [
    { kind: 'stringPowerLine', tiles: rowTiles(Z, X + 14, X + 29), on: true, lineKind: 3 },
  ]);
  await cmd('Cable over open ground', [
    { kind: 'stringPowerLine', tiles: colTiles(X + 33, Z - 9, Z - 2), on: true, lineKind: 3 },
  ]);
  await hook(() => window.__slimcity.setSpeed(1));
  await page.waitForTimeout(3500);
  await hook(() => window.__slimcity.setSpeed(0));
  await page.waitForTimeout(600);
  const gc = await hook(() => window.__slimcity.readGrid());
  const cableTiles = gc.powerLine.reduce((n, v) => n + (v === 3 ? 1 : 0), 0);
  check(cableTiles === 16 + 8, `cable not laid (${cableTiles} tiles)`);
  const cableRead = () => hook(() => window.__slimcity.readPowerCables());

  await hook(() => window.__slimcity.setTool('select'));
  await page.waitForTimeout(500);
  let c = await cableRead();
  console.log('cable surface', JSON.stringify({ boxes: c.boxes.length, guards: c.guards, overlay: c.overlay }));
  check(!c.overlay.visible, 'the cable overlay shows on the surface');
  check(c.boxes.length >= 3, `too few boxes on the surface (${c.boxes.length})`);
  await camera(X + 22, Z, 60, Math.PI, 0.6);
  await shot('cable-surface-street');
  await camera(X + 33, Z - 5, 50, Math.PI, 0.6);
  await shot('cable-surface-open');

  await hook(() => window.__slimcity.setTool('power.cable'));
  await page.waitForTimeout(1000);
  u = await under();
  c = await cableRead();
  console.log('cable underground', JSON.stringify({ active: u.active, overlay: c.overlay }));
  check(u.active, 'the cable tool did not take the city underground');
  check(c.overlay.visible && c.overlay.tiles === 24, `cable overlay not drawn (${c.overlay.tiles} tiles)`);
  check(c.overlay.feet >= 4, `feet of boxes and risers not marked (${c.overlay.feet})`);
  await camera(X + 22, Z - 1, 60, Math.PI, PITCH);
  await shot('cable-underground-street');
  await camera(X + 13, Z, 30, Math.PI, 1.0);
  await shot('cable-underground-riser');
  await camera(X + 33, Z - 5, 55, Math.PI, 1.0);
  await shot('cable-underground-open');
  await hook(() => window.__slimcity.setTool('select'));

  // Lenses, each with the tool put back to select.
  const lenses = [
    ['watered', true],
    ['sewered', true],
    ['trash', false],
  ];
  for (const [lens, underground] of lenses) {
    await hook(() => window.__slimcity.setTool('select'));
    await hook((l) => window.__slimcity.setOverlay(l), lens);
    await page.waitForTimeout(1200);
    u = await under();
    const off = await overlayOff();
    console.log(`lens ${lens}`, JSON.stringify({ active: u.active, overlayButtonDisabled: off }));
    check(off === false, `lens ${lens} not set (overlay-off button disabled)`);
    check(u.active === underground, `lens ${lens}: underground active=${u.active}, wanted ${underground}`);
    await camera(view.x + 4, view.z - 1, 130, Math.PI, PITCH);
    await shot(`lens-${lens}`, 2200);
  }

  console.log('page errors', errors.length ? errors : 'none');
  if (errors.length) failures.push('page errors');
} catch (e) {
  console.log('error:', e.message);
  failures.push(e.message);
} finally {
  await browser.close();
}
if (failures.length) {
  console.log('FAILURES:', JSON.stringify(failures));
  process.exit(1);
}
