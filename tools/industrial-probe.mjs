/** Industrial growth probe: builds a powered, watered, road-served block with
 * a DEEP industrial band (the shape players actually paint) beside
 * residential, then reports per-sector building counts broken down by
 * lifecycle state and problem bits. Answers "do industrial lots fail to spawn,
 * stall in construction, or spawn and get abandoned" without eyeballing. */
import { chromium } from 'playwright';
const base = process.argv[2] ?? 'http://localhost:5174';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const RT = { TwoLane: 1 };
const ZONE = { ResLow: 1, ComLow: 3, Industrial: 5 };
const STATE = ['Constructing', 'Active', 'Abandoned', 'Demolishing'];
const PROBLEM = [
  [1, 'NoPower'],
  [2, 'NoWater'],
  [4, 'NoRoad'],
  [8, 'HighCrime'],
  [16, 'HighPollution'],
  [32, 'LowDemand'],
];
const b = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await b.newPage({ viewport: { width: 1000, height: 700 } });
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
const readBuildings = () => call(() => window.__slimcity.readBuildings());
const stats = () => call(() => window.__slimcity.getStats());
const setSpeed = (s) => call((x) => window.__slimcity.setSpeed(x), s);

const g = await readGrid();
const N = g.size;
const idx = (x, z) => z * N + x;
let A = null;
for (let z = 25; z < N - 40 && !A; z++)
  for (let x = 25; x < N - 45 && !A; x++) {
    const h0 = g.height[idx(x, z)];
    let ok = true;
    for (let dz = -10; dz < 16 && ok; dz++)
      for (let dx = -2; dx < 32 && ok; dx++) {
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
console.log('anchor', JSON.stringify(A));
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
await hrow(Z + 9, X, X + 26);
await vcol(X, Z, Z + 9);
await vcol(X + 26, Z, Z + 9);
await cmd('Coal Plant', [
  { kind: 'placeBuilding', catalogId: 'coal-plant', x: X + 9, z: Z - 4, rotation: 0 },
]);
await cmd('Water Tower', [
  { kind: 'placeBuilding', catalogId: 'water-tower', x: X + 5, z: Z - 2, rotation: 0 },
]);
// Residential fronts the north street; industry gets a DEEP band (4 rows,
// the full zonable depth) fronting the south street — the shape a player
// paints, not a single road-hugging row.
await band(ZONE.ResLow, X + 1, X + 25, Z + 1, Z + 2);
await band(ZONE.Industrial, X + 1, X + 25, Z + 5, Z + 8);

await setSpeed(4);
const describe = (buildings, prefix) => {
  const mine = buildings.filter((b2) => b2.catalogId.startsWith(prefix));
  const byState = {};
  const byProblem = {};
  for (const b2 of mine) {
    const s = STATE[b2.state] ?? `state${b2.state}`;
    byState[s] = (byState[s] ?? 0) + 1;
    for (const [bit, name] of PROBLEM) {
      if (b2.problems & bit) byProblem[name] = (byProblem[name] ?? 0) + 1;
    }
  }
  const probs = Object.entries(byProblem)
    .map(([k, v]) => `${k}:${v}`)
    .join(',');
  return `${prefix}=${mine.length} [${JSON.stringify(byState)}]${probs ? ' problems{' + probs + '}' : ''}`;
};

const marks = [600, 1500, 3000, 5000];
let next = 0;
for (let guard = 0; guard < 4000 && next < marks.length; guard++) {
  await page.waitForTimeout(1000);
  const s = await stats();
  if (s.tick < marks[next]) continue;
  const buildings = await readBuildings();
  console.log(
    `tick=${s.tick} pop=${s.population} jobs=${s.jobs} demandInd=${(s.demand?.ind ?? 0).toFixed(2)}\n` +
      `   ${describe(buildings, 'res')}\n` +
      `   ${describe(buildings, 'ind')}`,
  );
  next++;
}
console.log(errors.length ? 'PAGE ERRORS:\n' + errors.slice(0, 5).join('\n') : 'no page errors');
await b.close();
