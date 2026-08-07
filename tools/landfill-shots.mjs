/** Landfill v2 + frontage-setback validation: grow a small mixed town, paint a
 * landfill on the road-frontage grid beside its own street, then shoot
 * (1) the landfill entrance office (gatehouse + parking bays + yard light),
 * (2) the dumping grounds behind it with trash piles, (3) the road-grid
 * overlay that appears while the landfill brush is in hand, and (4/5) com/ind
 * lots where the building must sit BEHIND its parking bays, not on top. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:5174';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-landfill';
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
const setTool = (t) => call((x) => window.__slimcity.setTool(x), t);
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
for (let z = 25; z < N - 40 && !A; z++)
  for (let x = 25; x < N - 45 && !A; x++) {
    const h0 = g.height[idx(x, z)];
    let ok = true;
    for (let dz = -8; dz < 18 && ok; dz++)
      for (let dx = -2; dx < 34 && ok; dx++) if (!okTile(x + dx, z + dz, h0)) ok = false;
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
const rect = (x0, x1, z0, z1) =>
  Array.from({ length: (x1 - x0 + 1) * (z1 - z0 + 1) }, (_, i) => ({
    x: x0 + (i % (x1 - x0 + 1)),
    z: z0 + Math.floor(i / (x1 - x0 + 1)),
  }));
const band = (zone, x0, x1, z0, z1) =>
  cmd('Zone', [{ kind: 'paintZone', zone, tiles: rect(x0, x1, z0, z1) }]);

// Town: two streets joined at the ends; zones sit NORTH of their street so the
// south-facing frontages (bays, setback lots) face the camera.
await hrow(Z, X, X + 30, RT.TwoLane);
await hrow(Z + 5, X, X + 30, RT.TwoLane);
await vcol(X, Z, Z + 5, RT.TwoLane);
await vcol(X + 30, Z, Z + 5, RT.TwoLane);
// Landfill's own street: a spur running south, so its frontage grid is clear
// of the zoned blocks.
await vcol(X + 8, Z + 5, Z + 14, RT.TwoLane);
// Utilities butted against the north street (footprints must TOUCH a road tile
// for power/water to enter the network).
await cmd('Wind Turbine', [
  { kind: 'placeBuilding', catalogId: 'wind-turbine', x: X + 2, z: Z - 1, rotation: 0 },
]);
await cmd('Water Tower', [
  { kind: 'placeBuilding', catalogId: 'water-tower', x: X + 5, z: Z - 2, rotation: 0 },
]);
// Com + ind front the SOUTH street from the north, res fronts the north street.
await band(ZONE.ComLow, X + 1, X + 12, Z + 3, Z + 4);
await band(ZONE.Industrial, X + 16, X + 28, Z + 3, Z + 4);
await band(ZONE.ResLow, X + 1, X + 28, Z + 1, Z + 2);

// Landfill: a 4-deep band on the EAST frontage of the spur (within the
// zonable frontage depth), well above the 4-tile minimum area.
const landfillTiles = rect(X + 9, X + 12, Z + 8, Z + 13);
await cmd('Landfill', [{ kind: 'paintLandfill', tiles: landfillTiles, on: true }]);
await page.waitForTimeout(600);

await setSpeed(4);
for (let i = 0; i < 2000; i++) {
  const s = await stats();
  if ((s.jobs ?? 0) >= 8 && (s.population ?? 0) >= 12) break;
  await page.waitForTimeout(200);
}
// Let trash generate and collect so the piles have visible height — but stop
// well short of capacity, since a FULL landfill correctly stops its trucks.
await page.waitForTimeout(12000);
const grid = await readGrid();
const zoneBuildingTiles = (zone) => {
  const found = [];
  for (let x = X; x <= X + 30; x++)
    for (let z = Z; z <= Z + 6; z++) {
      const i = z * N + x;
      if (grid.buildingId[i] && grid.zone[i] === zone) found.push({ x, z });
    }
  return found;
};
const comTiles = zoneBuildingTiles(ZONE.ComLow);
const indTiles = zoneBuildingTiles(ZONE.Industrial);
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
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${name}.png` });
};
const at = (tiles, fx, fz) => tiles[tiles.length - 1] ?? { x: fx, z: fz };
const c = at(comTiles, X + 6, Z + 4);
const iT = at(indTiles, X + 22, Z + 4);
// Entrance office sits on the smallest-index street-adjacent landfill tile.
await shot('landfill-office', X + 9, Z + 8, 15);
// The spur the landfill's own trucks run on, entrance in frame.
await shot('landfill-trucks', X + 8, Z + 10, 26);
await shot('landfill-grounds', X + 10, Z + 11, 30);
await shot('landfill-overview', X + 10, Z + 10, 55);
await shot('com-setback', c.x, c.z + 1, 14);
await shot('ind-setback', iT.x, iT.z + 1, 16);
// Road-grid overlay while the landfill brush is in hand.
await setTool('landfill.paint');
await page.waitForTimeout(600);
await shot('landfill-tool-grid', X + 9, Z + 9, 40);
await setTool('select');
console.log('done');
await b.close();
