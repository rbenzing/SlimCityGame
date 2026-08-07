/** Lot-apron + occupancy validation: grow a mixed town, then shoot the same
 * commercial and industrial frontages at three times of day — the pavement
 * must run the full building frontage and out to the sidewalk with a grey
 * curb-cut entry, and the bays must fill at midday, empty overnight for shops,
 * and keep a few late-shift vehicles at industry. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:5174';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-lotpolish';
mkdirSync(out, { recursive: true });
const RT = { TwoLane: 1 };
const ZONE = { ResLow: 1, ComLow: 3, Industrial: 5 };
const b = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
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
await page.waitForTimeout(4000);
const ready = () =>
  page.waitForFunction(() => !!window.__slimcity && !!window.__slimcity.cmd, null, {
    timeout: 20000,
  });
const call = async (fn, ...a) => {
  await ready();
  return page.evaluate(fn, ...a);
};
const cmd = (l, c) => call(([x, y]) => window.__slimcity.cmd(x, y), [l, c]);
const readGrid = () => call(() => window.__slimcity.readGrid());
const stats = () => call(() => window.__slimcity.getStats());
const setSpeed = (s) => call((x) => window.__slimcity.setSpeed(x), s);
const setDayT = (t) => call((x) => window.__slimcity.setDayT(x), t);
const cam = (tx, tz, d) =>
  call(
    ([x, z, dd]) => window.__slimcity.setCamera((x + 0.5) * 16, (z + 0.5) * 16, dd),
    [tx, tz, d],
  );

const g = await readGrid();
const N = g.size;
const idx = (x, z) => z * N + x;
const okTile = (x, z, h0) =>
  x >= 0 &&
  z >= 0 &&
  x < N &&
  z < N &&
  !g.water[idx(x, z)] &&
  Math.abs(g.height[idx(x, z)] - h0) <= 8;
let A = null;
for (let z = 25; z < N - 35 && !A; z++)
  for (let x = 25; x < N - 40 && !A; x++) {
    const h0 = g.height[idx(x, z)];
    let ok = true;
    for (let dz = -8; dz < 12 && ok; dz++)
      for (let dx = -2; dx < 30 && ok; dx++) if (!okTile(x + dx, z + dz, h0)) ok = false;
    if (ok) A = { x, z };
  }
if (!A) {
  console.log('no anchor');
  await b.close();
  process.exit(1);
}
const X = A.x,
  Z = A.z;
console.log('anchor', JSON.stringify(A));
await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await page.waitForTimeout(200);
const hrow = (z, x0, x1, tier) =>
  cmd('R', [
    {
      kind: 'buildRoad',
      tier,
      tiles: Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, z })),
    },
  ]);
const vcol = (x, z0, z1, tier) =>
  cmd('R', [
    {
      kind: 'buildRoad',
      tier,
      tiles: Array.from({ length: z1 - z0 + 1 }, (_, i) => ({ x, z: z0 + i })),
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

// Zones sit NORTH of the south street so their frontages face the camera.
await hrow(Z, X, X + 26, RT.TwoLane);
await hrow(Z + 5, X, X + 26, RT.TwoLane);
await vcol(X, Z, Z + 5, RT.TwoLane);
await vcol(X + 26, Z, Z + 5, RT.TwoLane);
await cmd('Wind Turbine', [
  { kind: 'placeBuilding', catalogId: 'wind-turbine', x: X + 2, z: Z - 1, rotation: 0 },
]);
await cmd('Water Tower', [
  { kind: 'placeBuilding', catalogId: 'water-tower', x: X + 5, z: Z - 2, rotation: 0 },
]);
await band(ZONE.ComLow, X + 1, X + 11, Z + 3, Z + 4);
await band(ZONE.Industrial, X + 14, X + 25, Z + 3, Z + 4);
await band(ZONE.ResLow, X + 1, X + 25, Z + 1, Z + 2);

await setSpeed(4);
for (let i = 0; i < 2000; i++) {
  const s = await stats();
  if ((s.jobs ?? 0) >= 8 && (s.population ?? 0) >= 12) break;
  await page.waitForTimeout(200);
}
await page.waitForTimeout(6000);
const grid = await readGrid();
const zoneBuildingTiles = (zone) => {
  const found = [];
  for (let x = X; x <= X + 26; x++)
    for (let z = Z; z <= Z + 5; z++) {
      const i = z * N + x;
      if (grid.buildingId[i] && grid.zone[i] === zone) found.push({ x, z });
    }
  return found;
};
const comTiles = zoneBuildingTiles(ZONE.ComLow);
const indTiles = zoneBuildingTiles(ZONE.Industrial);
const s = await stats();
console.log('pop', s.population, 'jobs', s.jobs, 'com', comTiles.length, 'ind', indTiles.length);
// Leave the sim RUNNING: the render clock (and everything it drives, including
// lot occupancy) is only republished on a snapshot, which a paused sim never
// sends — so a paused game would ignore the pinned time of day below.
await setSpeed(1);

const at = (tiles, fx, fz) => tiles[tiles.length - 1] ?? { x: fx, z: fz };
const c = at(comTiles, X + 5, Z + 4);
const iT = at(indTiles, X + 19, Z + 4);
const shot = async (name, tx, tz, d) => {
  await cam(tx, tz, d);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${name}.png` });
};

// The render clock is pinned per shot so the lots can be compared hour to hour.
for (const [label, hour] of [
  ['midday', 13],
  ['evening', 20],
  ['night', 3],
]) {
  await setDayT(hour / 24);
  await page.waitForTimeout(1400);
  await shot(`com-${label}`, c.x, c.z, 13);
  await shot(`ind-${label}`, iT.x, iT.z, 15);
}
await setDayT(0.5);
await shot('overview', X + 13, Z + 3, 60);
await setDayT(null);
console.log('done');
await b.close();
