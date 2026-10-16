/** Dead-run shots: a bus depot beside a side street, a bus line whose first
 * stop stands fifteen tiles west of the depot's gate, and the street between
 * them at three hours of the clock. The sim runs at speed until its own clock
 * reaches each hour, since the dead runs fire on the sim's tick and the
 * lighting override only sets the sky: 05:00 with the buses pulling out onto
 * the street between depot and first stop, 12:00 with the loop running, and
 * 03:00 for the street at night.
 *
 * Usage: node tools/deadrun-shots.mjs [baseUrl]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { hooksReady, tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = 'tools/shots-deadruns';
mkdirSync(out, { recursive: true });

const RT = { TwoLane: 1 };
/** The clock: 2400 ticks a visual day, tick 0 at 09:00 (src/shared/constants.ts). */
const DAY_TICKS = 2400;
const START_OFFSET = Math.round((DAY_TICKS * 9) / 24);
/** The first tick on or after `fromTick` at which the clock reads `hour`. */
const tickAtHour = (hour, fromTick) => {
  const phase =
    (((Math.round((DAY_TICKS * hour) / 24) - START_OFFSET) % DAY_TICKS) + DAY_TICKS) % DAY_TICKS;
  let t = Math.floor(fromTick / DAY_TICKS) * DAY_TICKS + phase;
  while (t < fromTick) t += DAY_TICKS;
  return t;
};

const browser = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
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
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#viewport canvas', { timeout: 30000 });
await hooksReady(page);
await page.waitForTimeout(3000);

const hook = (fn, arg) => page.evaluate(fn, arg);
const cmd = (label, commands) => hook(([l, c]) => window.__slimcity.cmd(l, c), [label, commands]);
const camera = tileCamera(page);
const shot = async (name, settle = 1800) => {
  await page.waitForTimeout(settle);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
};
const tickNow = () => hook(() => window.__slimcity.getStats().tick);
/** Sets the sky's hour; a no-op command forces the snapshot the lighting is read on while paused. */
const sky = async (hour) => {
  await hook((t) => window.__slimcity.setDayT(t), hour / 24);
  await cmd('Phase', [{ kind: 'setUnlimitedMoney', on: true }]);
  await page.waitForTimeout(600);
};
/** Runs the sim until its tick reaches `target`, then pauses it. */
const runUntil = async (target) => {
  await hook(() => window.__slimcity.setSpeed(4));
  await page.waitForFunction((t) => window.__slimcity.getStats().tick >= t, target, {
    timeout: 180000,
  });
  await hook(() => window.__slimcity.setSpeed(0));
  console.log('paused at tick', await tickNow(), 'for', target);
};

// A dry, flat strip to build the block across.
const g0 = await hook(() => window.__slimcity.readGrid());
const N = g0.size;
const idx = (x, z) => z * N + x;
let anchor = null;
for (let z = 40; z < N - 40 && !anchor; z++) {
  for (let x = 40; x < N - 60; x++) {
    let ok = true;
    for (let k = 0; k < 44 && ok; k++) {
      for (let dz = -6; dz <= 6 && ok; dz++) {
        const i = idx(x + k, z + dz);
        if (g0.water[i] || Math.abs(g0.height[i]) > 22) ok = false;
      }
    }
    if (ok) anchor = { x, z };
  }
}
if (!anchor) {
  console.log('no dry strip found');
  await browser.close();
  process.exit(1);
}
const { x: X, z: Z } = anchor;
console.log('anchor', JSON.stringify(anchor));

await hook(() => window.__slimcity.setSpeed(0));
await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
await page.waitForTimeout(300);

const row = (z, x0, x1) =>
  cmd('Road', [
    {
      kind: 'buildRoad',
      tier: RT.TwoLane,
      tiles: Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, z })),
    },
  ]);
const col = (x, z0, z1) =>
  cmd('Road', [
    {
      kind: 'buildRoad',
      tier: RT.TwoLane,
      tiles: Array.from({ length: z1 - z0 + 1 }, (_, i) => ({ x, z: z0 + i })),
    },
  ]);
// Main street along row Z; a side street south of it at X+15 (the first
// stop's node) and at X+30 (the depot's gate node).
await row(Z, X, X + 40);
await col(X + 15, Z + 1, Z + 4);
await col(X + 30, Z + 1, Z + 4);
await page.waitForTimeout(800);

const place = (catalogId, x, z, rotation) =>
  cmd(catalogId, [{ kind: 'placeBuilding', catalogId, x, z, rotation }]);
// Power from a turbine at the street's east end; the depot beside the X+30
// side street, on the south kerb; the stops on the north kerb.
await place('wind-turbine', X + 36, Z - 1, 0);
await place('bus-depot', X + 28, Z + 1, 0);
await place('bus-stop', X + 14, Z - 1, 0);
await place('bus-stop', X + 4, Z - 1, 0);
await page.waitForTimeout(800);

await cmd('Bus line', [
  {
    kind: 'createTransitLine',
    line: {
      id: 0,
      color: 0xef5350,
      mode: 'bus',
      vehicles: 3,
      stops: [
        { x: X + 14, z: Z - 1 },
        { x: X + 4, z: Z - 1 },
      ],
    },
  },
]);
await page.waitForTimeout(1500);

const standing = await hook(() =>
  window.__slimcity
    .readBuildings()
    .filter((b) => ['bus-depot', 'bus-stop', 'wind-turbine'].includes(b.catalogId))
    .map((b) => `${b.catalogId}@${b.x},${b.z}`),
);
console.log('standing', JSON.stringify(standing));

const PITCH = 0.7;
const street = { x: X + 22, z: Z };
const gate = { x: X + 29, z: Z };
const loop = { x: X + 9, z: Z };
const transit = () => hook(() => window.__slimcity.readTransit());
const render = () => hook(() => window.__slimcity.readTransitRender());

const vehicles = () => hook(() => window.__slimcity.readVehicles());
/** The street at its own hour's sky, and again lit as noon so the vehicles read. */
const streetAt = async (name, hour) => {
  await sky(hour);
  await camera(street.x, street.z, 260, 0, PITCH);
  await shot(`${name}-street`, 2500);
  await sky(12);
  await camera(street.x, street.z, 260, 0, PITCH);
  await shot(`${name}-street-lit`, 2500);
};

// 03:00 on the first night: the pull-in fired at 23:00, so what is on the
// street is whatever of it is still driving home.
const t0 = await tickNow();
await runUntil(tickAtHour(3, t0));
console.log('03:00 transit', JSON.stringify(await transit()), JSON.stringify(await render()));
console.log('03:00 vehicles', JSON.stringify(await vehicles()));
await streetAt('a-0300', 3);
await camera(gate.x, gate.z, 90, Math.PI, PITCH);
await shot('a2-0300-depot-lit', 2500);

// 05:00: the pull-out. Paused the tick after it fires, so the first bus is at
// the gate node and the loop has just come on.
await runUntil(tickAtHour(5, await tickNow()));
console.log('05:00 transit', JSON.stringify(await transit()), JSON.stringify(await render()));
console.log('05:00 vehicles', JSON.stringify(await vehicles()));
await streetAt('b-0500', 5);
await camera(gate.x, gate.z, 90, Math.PI, PITCH);
await shot('b2-0500-depot-gate-lit', 2500);
// Let it drive for a visual hour, then the street again with the bus under way.
await runUntil(tickAtHour(6, await tickNow()));
console.log('06:00 vehicles', JSON.stringify(await vehicles()));
await streetAt('b3-0600', 6);
// An hour of travel is a tile and a half: the bus is still at the depot's junction.
await camera(X + 29.5, Z + 0.5, 60, Math.PI, 0.5);
await shot('b4-0600-bus-close-lit', 2500);

// 12:00: the loop running the line, under the transit lens that shows it.
await runUntil(tickAtHour(12, await tickNow()));
console.log('12:00 transit', JSON.stringify(await transit()), JSON.stringify(await render()));
console.log('12:00 vehicles', JSON.stringify(await vehicles()));
await sky(12);
await hook(() => window.__slimcity.setOverlay('transit'));
await camera(loop.x, loop.z, 200, 0, PITCH);
await shot('c-1200-loop-lens', 2500);
await camera(street.x, street.z, 300, 0, PITCH);
await shot('c2-1200-street-lens', 2500);
// The lens off again at 03:00 the next night: the loop is hidden, the shelters stay.
await runUntil(tickAtHour(3, await tickNow()));
await sky(3);
await camera(loop.x, loop.z, 200, 0, PITCH);
await shot('d-0300-loop-lens-hidden', 2500);
await hook(() => window.__slimcity.setOverlay(null));
console.log('page errors', errors.length ? errors : 'none');
await browser.close();
