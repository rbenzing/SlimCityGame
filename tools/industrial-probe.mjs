/** Industrial growth probe: builds a powered, watered, road-served block and
 * zones INDUSTRIAL beside residential (industry needs workers), then reports
 * how many buildings of each zone actually grew, plus any page errors. Answers
 * "is industrial spawning at all" without eyeballing a screenshot. */
import { chromium } from 'playwright';
const base = process.argv[2] ?? 'http://localhost:5174';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const RT = { TwoLane: 1 };
const ZONE = { ResLow: 1, ComLow: 3, Industrial: 5 };
const b = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await b.newPage({ viewport: { width: 1000, height: 700 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('[console] ' + m.text());
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

const g = await readGrid();
const N = g.size;
const idx = (x, z) => z * N + x;
let A = null;
for (let z = 25; z < N - 35 && !A; z++)
  for (let x = 25; x < N - 40 && !A; x++) {
    const h0 = g.height[idx(x, z)];
    let ok = true;
    for (let dz = -8; dz < 12 && ok; dz++)
      for (let dx = -2; dx < 30 && ok; dx++) {
        const i = idx(x + dx, z + dz);
        if (g.water[i] || Math.abs(g.height[i] - h0) > 8) ok = false;
      }
    if (ok) A = { x, z };
  }
if (!A) {
  console.log('no anchor');
  await b.close();
  process.exit(1);
}
const X = A.x,
  Z = A.z;
await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await page.waitForTimeout(200);
const hrow = (z, x0, x1) =>
  cmd('R', [
    {
      kind: 'buildRoad',
      tier: RT.TwoLane,
      tiles: Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, z })),
    },
  ]);
const vcol = (x, z0, z1) =>
  cmd('R', [
    {
      kind: 'buildRoad',
      tier: RT.TwoLane,
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

await hrow(Z, X, X + 26);
await hrow(Z + 5, X, X + 26);
await vcol(X, Z, Z + 5);
await vcol(X + 26, Z, Z + 5);
// A 60 MW coal plant, not a 6 MW turbine: an under-powered grid leaves the
// factories Constructing forever, which reads exactly like "industry never spawns".
await cmd('Coal Plant', [
  { kind: 'placeBuilding', catalogId: 'coal-plant', x: X + 9, z: Z - 4, rotation: 0 },
]);
await cmd('Water Tower', [
  { kind: 'placeBuilding', catalogId: 'water-tower', x: X + 5, z: Z - 2, rotation: 0 },
]);
// Deliberate surplus: a second plant + tower, so "industry never activates"
// cannot be blamed on the grid running short of power or water.
await cmd('Coal Plant 2', [
  { kind: 'placeBuilding', catalogId: 'coal-plant', x: X + 15, z: Z - 4, rotation: 0 },
]);
await cmd('Water Tower 2', [
  { kind: 'placeBuilding', catalogId: 'water-tower', x: X + 20, z: Z - 2, rotation: 0 },
]);
await band(ZONE.ResLow, X + 1, X + 25, Z + 1, Z + 2);
await band(ZONE.Industrial, X + 1, X + 25, Z + 3, Z + 4);

await setSpeed(4);
const countZone = (grid, zone) => {
  let n = 0;
  for (let x = X; x <= X + 26; x++)
    for (let z = Z; z <= Z + 5; z++) {
      const i = z * N + x;
      if (grid.buildingId[i] && grid.zone[i] === zone) n++;
    }
  return n;
};
// Report by SIM TICK, not wall time, so runs at different speed multipliers
// are directly comparable.
const targetTicks = Number(process.argv[3] ?? 4000);
const marks = [500, 1000, 1500, 2000, 3000, 4000, 6000, 8000].filter((m) => m <= targetTicks);
let next = 0;
for (let guard = 0; guard < 4000 && next < marks.length; guard++) {
  await page.waitForTimeout(1000);
  const s = await stats();
  if (s.tick < marks[next]) continue;
  const grid = await readGrid();
  console.log(
    `tick=${s.tick}  pop=${s.population} jobs=${s.jobs} employed=${s.employed}` +
      `  demandInd=${(s.demand?.ind ?? 0).toFixed(3)}` +
      `  res=${countZone(grid, ZONE.ResLow)} ind=${countZone(grid, ZONE.Industrial)}`,
  );
  next++;
}
console.log(errors.length ? 'PAGE ERRORS:\n' + errors.slice(0, 10).join('\n') : 'no page errors');
await b.close();
