/** Vehicle/parking/traffic polish validation: grow a small mixed town with an
 * L-bend main road, then shoot close-ups of (1) commercial parking bays with
 * kit-model cars parked perpendicular in painted lines, (2) industrial truck
 * bays, (3) a home driveway with a kit car, (4) the curve — no furniture in
 * the carriageway, bend sign near the sidewalk, cars steering the arc — and
 * (5) a traffic overview (spaced vehicles, no bumper-to-bumper snake). */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:5174';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-vehiclepolish';
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
  for (let x = 25; x < N - 35 && !A; x++) {
    const h0 = g.height[idx(x, z)];
    let ok = true;
    for (let dz = -8; dz < 12 && ok; dz++)
      for (let dx = -2; dx < 24 && ok; dx++) if (!okTile(x + dx, z + dz, h0)) ok = false;
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

// Three parallel streets joined at both ends (corners at the east joins so
// routes traverse curves). Every zone band sits NORTH of its street, so lot
// frontages face SOUTH — toward the camera — and the bays/driveways are
// visible instead of occluded by their own buildings.
await hrow(Z, X, X + 20, RT.TwoLane);
await hrow(Z + 4, X, X + 20, RT.TwoLane);
await hrow(Z + 9, X, X + 20, RT.TwoLane);
await vcol(X, Z, Z + 9, RT.TwoLane);
await vcol(X + 20, Z, Z + 9, RT.TwoLane);
// Utilities butted against the north street (their footprints must touch a
// road tile for power/water to enter the road network).
await cmd('Wind Turbine', [
  { kind: 'placeBuilding', catalogId: 'wind-turbine', x: X + 1, z: Z - 1, rotation: 0 },
]);
await cmd('Water Tower', [
  { kind: 'placeBuilding', catalogId: 'water-tower', x: X + 4, z: Z - 2, rotation: 0 },
]);
// Zones: com + ind front the MID street from the north; res fronts the SOUTH street.
await band(ZONE.ComLow, X + 1, X + 9, Z + 2, Z + 3);
await band(ZONE.Industrial, X + 11, X + 19, Z + 2, Z + 3);
await band(ZONE.ResLow, X + 1, X + 19, Z + 6, Z + 8);
await page.waitForTimeout(400);

// Grow until zoned buildings actually exist (com + ind + res), then a little longer.
await setSpeed(4);
const zoneBuildingTiles = (grid, zone) => {
  const found = [];
  for (let x = X; x <= X + 20; x++)
    for (let z = Z; z <= Z + 9; z++) {
      const i = z * N + x;
      if (grid.buildingId[i] && grid.zone[i] === zone) found.push({ x, z });
    }
  return found;
};
// Active com/ind buildings create jobs; active res creates population — both
// are required, since parked bays and driveway cars are Active-only.
for (let i = 0; i < 2000; i++) {
  const s = await stats();
  if ((s.jobs ?? 0) >= 4 && (s.population ?? 0) >= 8) break;
  await page.waitForTimeout(200);
}
await page.waitForTimeout(8000);
const grid = await readGrid();
const comTiles = zoneBuildingTiles(grid, ZONE.ComLow);
const indTiles = zoneBuildingTiles(grid, ZONE.Industrial);
const resTiles = zoneBuildingTiles(grid, ZONE.ResLow);
const sNow = await stats();
console.log(
  'pop',
  sNow.population,
  'jobs',
  sNow.jobs,
  'com',
  comTiles.length,
  'ind',
  indTiles.length,
  'res',
  resTiles.length,
);
// Settle to midday for the brightest read, then pause.
const dayTof = (t) => ((t + 900) % 2400) / 2400;
for (let i = 0; i < 500; i++) {
  const t = (await stats()).tick;
  const d = dayTof(t);
  if (d >= 0.47 && d <= 0.53) {
    await setSpeed(0);
    break;
  }
  await page.waitForTimeout(120);
}
await page.waitForTimeout(400);
console.log('paused dayT=' + dayTof((await stats()).tick).toFixed(3));

const shot = async (name, tx, tz, d) => {
  await cam(tx, tz, d);
  await page.waitForTimeout(850);
  await page.screenshot({ path: `${out}/${name}.png` });
};
// Aim just SOUTH of each found building (between it and its street), so the
// south-facing frontage — bays, painted lines, parked kit vehicles — is centered.
const at = (tiles, fallbackX, fallbackZ) =>
  tiles[tiles.length - 1] ?? { x: fallbackX, z: fallbackZ };
const c = at(comTiles, X + 5, Z + 3);
const iT = at(indTiles, X + 15, Z + 3);
const r = at(resTiles, X + 6, Z + 7);
await shot('com-bays', c.x, c.z + 1, 14);
await shot('ind-bays', iT.x, iT.z + 1, 16);
await shot('res-driveway', r.x, r.z + 1, 14);
await shot('curve', X + 20, Z + 9, 17);
await shot('overview', X + 10, Z + 4, 70);
console.log('done');
await b.close();
