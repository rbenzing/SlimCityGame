/** Building proportion check: are the buildings the right SHAPE?
 *
 * Every other building harness frames a detail — a parking bay, a roof prop,
 * a frontage at dusk. None of them stands far enough back, in daylight, to
 * show a building's plan against its height, which is why the whole catalogue
 * could flatten by a quarter without a single shot looking wrong.
 *
 * So this one grows a street of homes beside shops and industry, pins the
 * clock at midday, and photographs the block from a low angle with the road
 * and its traffic in frame. The cars are the ruler: one is 4.0 m long and
 * 1.8 m wide, and every judgement about whether a house looks like a house is
 * made against them.
 *
 * Usage: node tools/massing-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { hooksReady, tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-massing';
mkdirSync(out, { recursive: true });

const RT = { TwoLane: 1 };
const ZONE = { ResLow: 1, ComLow: 3, Industrial: 5 };
/** Midday, so nothing is judged through dusk. */
const NOON = 0.5;

const b = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await b.newPage({ viewport: { width: 1500, height: 950 } });
const pageErrors = [];
page.on('pageerror', (e) => {
  pageErrors.push(e.message);
  console.log('[pageerror]', e.message);
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
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#viewport canvas', { timeout: 20000 });

const call = async (fn, ...a) => {
  await hooksReady(page);
  return page.evaluate(fn, ...a);
};
const cmd = (l, c) => call(([x, y]) => window.__slimcity.cmd(x, y), [l, c]);
const readGrid = () => call(() => window.__slimcity.readGrid());
const readBuildings = () => call(() => window.__slimcity.readBuildings());
const stats = () => call(() => window.__slimcity.getStats());
const setSpeed = (s) => call((x) => window.__slimcity.setSpeed(x), s);
const setDayT = (t) => call((x) => window.__slimcity.setDayT(x), t);
const cam = tileCamera(page);

const g = await readGrid();
const N = g.size;
const idx = (x, z) => z * N + x;

// The flattest dry block wide enough for a street of frontages. Flat matters
// here: a slope tilts the very proportions this harness exists to judge, so
// the search keeps the best it saw rather than giving up on a strict bound.
let anchor = null;
let flattest = { spread: Infinity, at: null };
for (let z = 30; z < N - 40 && !anchor; z++) {
  for (let x = 30; x < N - 45; x++) {
    let lo = Infinity;
    let hi = -Infinity;
    let dry = true;
    for (let dz = -2; dz < 9 && dry; dz++)
      for (let dx = -2; dx < 28 && dry; dx++) {
        const i = idx(x + dx, z + dz);
        if (g.water[i]) dry = false;
        const h = g.height[i];
        if (h < lo) lo = h;
        if (h > hi) hi = h;
      }
    if (!dry) continue;
    const spread = hi - lo;
    if (spread < flattest.spread) flattest = { spread, at: { x, z } };
    if (spread <= 1.0) {
      anchor = { x, z };
      break;
    }
  }
}
if (!anchor) anchor = flattest.at;
if (!anchor) {
  console.log('no dry block found');
  await b.close();
  process.exit(1);
}
const { x: X, z: Z } = anchor;
console.log('anchor', JSON.stringify(anchor), 'spread', flattest.spread.toFixed(2), 'm');

await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
await page.waitForTimeout(300);

const row = (z, x0, x1) =>
  cmd('R', [
    {
      kind: 'buildRoad',
      tier: RT.TwoLane,
      tiles: Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, z })),
    },
  ]);
const band = (zone, x0, x1, z0, z1) =>
  cmd('Zone', [
    {
      kind: 'paintZone',
      zone,
      tiles: Array.from({ length: (x1 - x0 + 1) * (z1 - z0 + 1) }, (_, i) => ({
        x: x0 + (i % (x1 - x0 + 1)),
        z: z0 + Math.floor(i / (x1 - x0 + 1)),
      })),
    },
  ]);

// One street with homes along it, shops at one end and sheds at the other, so
// all three fills stand in the same frame at the same distance.
await row(Z + 3, X, X + 25);
// Nothing grows unlit or unwatered, and both travel by road — so they go on
// the far kerb of the same street the lots front onto.
await cmd('Wind Turbine', [
  { kind: 'placeBuilding', catalogId: 'wind-turbine', x: X + 2, z: Z + 4, rotation: 0 },
]);
await cmd('Water Tower', [
  { kind: 'placeBuilding', catalogId: 'water-tower', x: X + 6, z: Z + 4, rotation: 0 },
]);
await page.waitForTimeout(600);
console.log('utilities placed:', (await readBuildings()).length);
await band(ZONE.ResLow, X + 1, X + 12, Z + 1, Z + 2);
await band(ZONE.ComLow, X + 14, X + 19, Z + 1, Z + 2);
await band(ZONE.Industrial, X + 21, X + 25, Z + 1, Z + 2);

await setSpeed(4);
for (let i = 0; i < 900; i++) {
  const s = await stats();
  if ((s.population ?? 0) >= 12 && (s.jobs ?? 0) >= 6) break;
  await page.waitForTimeout(200);
}
await page.waitForTimeout(5000);
const s = await stats();
console.log('pop', s.population, 'jobs', s.jobs);

// Leave the sim running: the pinned clock rides on a snapshot the paused sim
// never sends.
await setSpeed(1);
await setDayT(NOON);
await page.waitForTimeout(1200);

// What the buildings actually are, so the picture can be checked against the
// numbers rather than only admired.
const built = await readBuildings();
const near = built.filter(
  (bl) => bl.x >= X && bl.x <= X + 26 && bl.z >= Z - 1 && bl.z <= Z + 4 && bl.height > 0,
);
console.log(
  'buildings in frame:',
  JSON.stringify(
    near.slice(0, 8).map((bl) => ({ id: bl.catalogId ?? bl.id, h: bl.height })),
  ),
);

const shots = [
  // Low and along the street: the angle a plan-vs-height fault shows at.
  ['street-eye', X + 6, Z + 3, 46, 0.0, 0.32],
  ['street-oblique', X + 8, Z + 2, 62, 0.85, 0.5],
  ['homes-close', X + 5, Z + 2, 30, 0.6, 0.42],
  ['shops-close', X + 16, Z + 2, 30, 0.6, 0.42],
  ['block-top', X + 12, Z + 2, 96, 0.0, 1.35],
];
for (const [name, tx, tz, d, yaw, pitch] of shots) {
  await cam(tx, tz, d, yaw, pitch);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
}

await b.close();
if (pageErrors.length > 0) {
  console.log('FAIL');
  for (const e of pageErrors) console.log(' - page error:', e);
  process.exitCode = 1;
} else {
  console.log('shots written to', out);
}
