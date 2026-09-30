/** Farm shots: grows a farming district the way a player lays one out — a
 * town street with its own power and water, and off it a dirt road with a
 * pole line strung along it and Agriculture land either side — on ground
 * chosen for mixed soil, so row crops, orchards and pasture all grow. Then
 * photographs the district, each kind of farm close up, the Soil lens, the
 * zoning grid with the Agriculture tool in hand, the district at night, a
 * farmhouse up close by night and by day with its truck, and a farm abandoned
 * when its dirt road is taken away. Prints what the kit drew, lit windows and
 * trucks included, and every page error.
 *
 * Usage: node tools/farm-shots.mjs [baseUrl]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { hooksReady, tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = 'tools/shots-farms';
mkdirSync(out, { recursive: true });
const RT = { TwoLane: 1, Gravel: 4 };
const ZONE = { ResLow: 1, Agriculture: 9 };

const browser = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => {
  try {
    sessionStorage.setItem(
      'slimcity.session',
      JSON.stringify({ screen: 'playing', seed: 20260929, mode: 'new' }),
    );
  } catch (e) {
    void e;
  }
});
await page.goto(base, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#viewport canvas', { timeout: 30000 });
await hooksReady(page);
const hook = (fn, arg) => page.evaluate(fn, arg);
const cmd = (label, commands) => hook(([l, c]) => window.__slimcity.cmd(l, c), [label, commands]);
const camera = tileCamera(page);
const shot = async (name) => {
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
};

// Ground for the district: dry, and with some of every farmable grade in it.
const g = await hook(() => window.__slimcity.readGrid());
const N = g.size;
const soilOf = await hook((n) => {
  const s = [];
  for (let i = 0; i < n * n; i++) s.push(window.__slimcity.soilAt(i % n, Math.floor(i / n)));
  return s;
}, N);
const W = 44;
const D = 24;
let anchor = null;
let best = -1;
for (let z = 20; z < N - D - 20; z += 2) {
  for (let x = 20; x < N - W - 20; x += 2) {
    const counts = [0, 0, 0, 0];
    let wet = false;
    for (let dz = 0; dz < D && !wet; dz++) {
      for (let dx = 0; dx < W; dx++) {
        const i = (z + dz) * N + x + dx;
        if (g.water[i]) {
          wet = true;
          break;
        }
        counts[soilOf[i]]++;
      }
    }
    if (wet || counts[0] > W * D * 0.1) continue;
    const score = Math.min(counts[1], counts[2], counts[3]);
    if (score > best) {
      best = score;
      anchor = { x, z };
    }
  }
}
if (!anchor) throw new Error('no dry ground with mixed soil on this map');
const { x: X, z: Z } = anchor;
console.log('district at', X, Z, 'least-common grade covers', best, 'tiles');

const row = (x0, z, n) => Array.from({ length: n }, (_, i) => ({ x: x0 + i, z }));
const rect = (x0, z0, w, d) => Array.from({ length: d }, (_, dz) => row(x0, z0 + dz, w)).flat();

await cmd('Sandbox', [
  { kind: 'setSandbox', on: true },
  { kind: 'setUnlimitedMoney', on: true },
]);
await page.waitForTimeout(300);
// The town: a street across the top with a plant, a tower and homes.
await cmd('Street', [{ kind: 'buildRoad', tier: RT.TwoLane, tiles: row(X, Z, W) }]);
await cmd('Plant', [
  { kind: 'placeBuilding', catalogId: 'coal-plant', x: X + 2, z: Z - 4, rotation: 0 },
]);
await cmd('Tower', [
  { kind: 'placeBuilding', catalogId: 'water-tower', x: X + 8, z: Z - 2, rotation: 0 },
]);
await cmd('Homes', [
  { kind: 'paintZone', zone: ZONE.ResLow, tiles: rect(X + 12, Z - 3, W - 12, 3) },
]);
// The farms: a dirt road down the middle of the district, joined to the
// street, with the pole line along it.
const dirtZ = Z + 12;
await cmd('Lane', [
  {
    kind: 'buildRoad',
    tier: RT.Gravel,
    tiles: Array.from({ length: 12 }, (_, i) => ({ x: X, z: Z + 1 + i })),
  },
]);
await cmd('Dirt', [{ kind: 'buildRoad', tier: RT.Gravel, tiles: row(X, dirtZ, W) }]);
await cmd('Line', [
  {
    kind: 'stringPowerLine',
    tiles: Array.from({ length: 12 }, (_, i) => ({ x: X, z: Z + i })),
    on: true,
  },
]);
await cmd('Line', [{ kind: 'stringPowerLine', tiles: row(X, dirtZ, W), on: true }]);
await cmd('Farmland', [
  { kind: 'paintZone', zone: ZONE.Agriculture, tiles: rect(X + 1, dirtZ - 8, W - 1, 8) },
  { kind: 'paintZone', zone: ZONE.Agriculture, tiles: rect(X + 1, dirtZ + 1, W - 1, 8) },
]);

await hook(() => window.__slimcity.setSpeed(4));
let farms = [];
for (let i = 0; i < 180; i++) {
  await page.waitForTimeout(1000);
  const buildings = await hook(() => window.__slimcity.readBuildings());
  farms = buildings.filter((b) => b.catalogId.startsWith('farm-'));
  const kinds = new Set(farms.filter((b) => b.state === 1).map((b) => b.catalogId.split('-')[1]));
  if (kinds.size === 3 && farms.every((b) => b.state === 1) && i > 60) break;
}
// The sky follows the clock only while it runs, so the shots are taken at speed 1.
await hook(() => window.__slimcity.setSpeed(1));
const stats = await hook(() => window.__slimcity.getStats());
console.log(
  'tick',
  stats.tick,
  'pop',
  stats.population,
  'jobs',
  stats.jobs,
  'demand',
  JSON.stringify(stats.demand),
);
console.log(
  'farms',
  farms.map((b) => `${b.catalogId}@${b.x},${b.z} s${b.state} p${b.problems}`).join(' '),
);
console.log('kit', JSON.stringify(await hook(() => window.__slimcity.farmKit())));

await hook(() => window.__slimcity.setDayT(0.5));
await camera(X + W / 2, dirtZ, 700, Math.PI / 5, 0.95);
await shot('district');
for (const kind of ['crops', 'orchard', 'pasture']) {
  const levelOf = (b) => Number(b.catalogId.split('-')[2]);
  const f = farms
    .filter((b) => b.catalogId.startsWith(`farm-${kind}`))
    .sort((a, b) => levelOf(b) - levelOf(a))[0];
  if (!f) {
    console.log('no', kind, 'farm grew');
    continue;
  }
  await camera(f.x + 3, f.z + 3, 190, Math.PI / 4, 0.75);
  await shot(`${kind}`);
  await camera(f.x + 3, f.z + 3, 120, -Math.PI / 3, 0.45);
  await shot(`${kind}-low`);
}
await hook(() => window.__slimcity.setOverlay('soil'));
await camera(X + W / 2, dirtZ, 900, 0, 1.2);
await shot('soil-lens');
await hook(() => window.__slimcity.setOverlay(null));
await hook(() => window.__slimcity.setTool('zone.agriculture'));
await camera(X + W / 2, dirtZ, 700, 0, 1.2);
await shot('agriculture-grid');
await hook(() => window.__slimcity.setTool('select'));
await hook(() => window.__slimcity.setDayT(0.96));
await camera(X + W / 2, dirtZ, 600, Math.PI / 5, 0.9);
await shot('night');
console.log('kit at night', JSON.stringify(await hook(() => window.__slimcity.farmKit())));
// A farmhouse up close after dark: its windows lit, and its truck parked by it.
// South of the dirt road a farm's gate is on its north edge, and its house
// stands in from the lot's north-west corner.
const home = farms.find((b) => b.state === 1 && b.z > dirtZ);
if (home) {
  await camera(home.x + 0.4, home.z + 0.4, 45, Math.PI / 4, 0.5);
  await shot('farmhouse-night');
  await hook(() => window.__slimcity.setDayT(0.5));
  await shot('farmhouse-day');
}
await hook(() => window.__slimcity.setDayT(0.5));

// Take the dirt road away from the farms at the east end and let them lapse:
// three growth passes cut off abandons a farm, and ten more clear it away.
const east = farms.filter((b) => b.x > X + W / 2);
await cmd('Bulldoze', [
  { kind: 'bulldoze', tiles: row(X + Math.floor(W / 2), dirtZ, Math.ceil(W / 2)) },
]);
// At speed 1 three passes take 1.5 s and clearing it away another 5 s.
await page.waitForTimeout(3000);
const cut = await hook(() => window.__slimcity.readGrid());
console.log(
  'dirt road east of the cut:',
  [X + W - 6, X + W - 2].map((x) => cut.roadTier[dirtZ * N + x]).join(','),
  'tick',
  (await hook(() => window.__slimcity.getStats())).tick,
);
const after = await hook(() => window.__slimcity.readBuildings());
// A farm that grew a level since the list above was taken has a new id, so
// the cut-off farms are found by where they stand and what they report.
const NO_ROAD = 4;
const lapsed = after.filter(
  (b) => b.catalogId.startsWith('farm-') && (b.state === 2 || (b.problems & NO_ROAD) !== 0),
);
console.log(
  'every farm after the cut',
  after
    .filter((b) => b.catalogId.startsWith('farm-'))
    .map((b) => `${b.catalogId}@${b.x},${b.z} s${b.state} p${b.problems}`)
    .join(' '),
);
console.log(
  'farms after losing their road',
  lapsed.map((b) => `${b.catalogId}@${b.x},${b.z} s${b.state} p${b.problems}`).join(' ') || 'none',
);
const one = lapsed.find((b) => b.state === 2) ?? lapsed[0] ?? east[0];
if (one) {
  await camera(one.x + 3, one.z + 3, 190, Math.PI / 4, 0.75);
  await shot('abandoned');
}

console.log(errors.length ? 'PAGE ERRORS:\n' + errors.slice(0, 8).join('\n') : 'no page errors');
await browser.close();
