/** Archetype check (SPEC 28): grow industry and commerce, then report which
 * archetype each grown building actually is and what kit it got — a warehouse,
 * a factory with a stack, a green works with none — and shoot them.
 *
 * Usage: node tools/archetype-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { hooksReady, tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-archetypes';
mkdirSync(out, { recursive: true });

const RT = { TwoLane: 1 };
const ZONE = { ResLow: 1, ComLow: 3, Industrial: 5 };

const b = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
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

const call = async (fn, ...a) => {
  await hooksReady(page);
  return page.evaluate(fn, ...a);
};
const cmd = (l, c) => call(([x, y]) => window.__slimcity.cmd(x, y), [l, c]);
const readGrid = () => call(() => window.__slimcity.readGrid());
const stats = () => call(() => window.__slimcity.getStats());
const setSpeed = (s) => call((x) => window.__slimcity.setSpeed(x), s);
const cam = tileCamera(page);

const g0 = await readGrid();
const N = g0.size;
const idx = (x, z) => z * N + x;

let anchor = null;
for (let z = 40; z < N - 40 && !anchor; z++) {
  for (let x = 40; x < N - 60; x++) {
    let ok = true;
    for (let k = 0; k < 34 && ok; k++) {
      for (let dz = -8; dz <= 8 && ok; dz++) {
        const i = idx(x + k, z + dz);
        if (g0.water[i] || Math.abs(g0.height[i]) > 18) ok = false;
      }
    }
    if (ok) anchor = { x, z };
    if (anchor) break;
  }
}
if (!anchor) {
  console.log('no dry block found');
  await b.close();
  process.exit(1);
}
const { x: X, z: Z } = anchor;
console.log('anchor', JSON.stringify(anchor));

await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
await page.waitForTimeout(300);

const rowTiles = (z, x0, x1) => Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, z }));
const row = (z, x0, x1) =>
  cmd('R', [{ kind: 'buildRoad', tier: RT.TwoLane, tiles: rowTiles(z, x0, x1) }]);
const col = (x, z0, z1) =>
  cmd('R', [
    {
      kind: 'buildRoad',
      tier: RT.TwoLane,
      tiles: Array.from({ length: z1 - z0 + 1 }, (_, i) => ({ x, z: z0 + i })),
    },
  ]);

await row(Z - 6, X, X + 30);
await row(Z, X, X + 30);
await row(Z + 6, X, X + 30);
await row(Z + 12, X, X + 30); // housing street: industry and commerce need workers
for (let x = X; x <= X + 30; x += 8) await col(x, Z - 6, Z + 12);
await page.waitForTimeout(600);

// Seated hard against the Z-6 street: power and water conduct along roads, so a
// plant a few tiles off one supplies nothing.
await cmd('Utilities', [
  { kind: 'placeBuilding', catalogId: 'coal-plant', x: X + 2, z: Z - 10, rotation: 0 },
  { kind: 'placeBuilding', catalogId: 'water-tower', x: X + 9, z: Z - 8, rotation: 0 },
]);
await page.waitForTimeout(500);
const placed = await call(() => window.__slimcity.readBuildings().map((b) => b.catalogId));
console.log('utilities placed:', JSON.stringify(placed));

// Industry north of the middle street, commerce south of it.
for (const z of [Z - 5, Z - 4, Z - 3, Z - 2, Z - 1]) {
  await cmd('Zone', [{ kind: 'paintZone', zone: ZONE.Industrial, tiles: rowTiles(z, X + 1, X + 29) }]);
}
for (const z of [Z + 1, Z + 2, Z + 3, Z + 4, Z + 5]) {
  await cmd('Zone', [{ kind: 'paintZone', zone: ZONE.ComLow, tiles: rowTiles(z, X + 1, X + 29) }]);
}
for (const z of [Z + 7, Z + 8, Z + 9, Z + 10, Z + 11]) {
  await cmd('Zone', [{ kind: 'paintZone', zone: ZONE.ResLow, tiles: rowTiles(z, X + 1, X + 29) }]);
}
await page.waitForTimeout(600);

await setSpeed(4);
for (let i = 0; i < 1800; i++) {
  const s = await stats();
  if ((s.jobs ?? 0) >= 200) break;
  await page.waitForTimeout(200);
}
const s1 = await stats();
console.log('population', s1.population, 'jobs', s1.jobs);

// Both reads in ONE evaluate: the city keeps growing at speed 4, so counting
// buildings and kit parts in separate calls compares two different cities.
await setSpeed(0);
const census = await call(() => {
  const counts = {};
  for (const bl of window.__slimcity.readBuildings()) {
    counts[bl.catalogId] = (counts[bl.catalogId] ?? 0) + 1;
  }
  const known = new Map(window.__slimcity.readBuildings().map((b) => [b.id, b.catalogId]));
  const kitIds = window.__slimcity.readKitIds();
  const orphans = kitIds.filter((id) => !known.has(id));
  const byCatalog = {};
  for (const id of kitIds) {
    const c = known.get(id) ?? 'ORPHAN';
    byCatalog[c] = (byCatalog[c] ?? 0) + 1;
  }
  return {
    buildings: counts,
    kit: window.__slimcity.readKit(),
    kitBuildings: kitIds.length,
    kitOrphans: orphans.length,
    kitByCatalog: byCatalog,
  };
});
console.log('grown buildings:', JSON.stringify(census.buildings));
console.log('kit instances:', JSON.stringify(census.kit));
console.log(
  'kit reconcile:',
  JSON.stringify({
    buildings: census.kitBuildings,
    orphans: census.kitOrphans,
    byCatalog: census.kitByCatalog,
  }),
);

// A small city never grows past the first industrial rung, and a growable
// cannot be plopped, so the factory's monitor roof and the green works' bare
// one are covered by unit test rather than seen here. Say so rather than
// leaving a silent zero in the numbers above.
if ((census.kit.monitorRoof ?? 0) === 0 && (census.kit.roofArray ?? 0) === 0) {
  console.log('note: no ind-2/ind-3 grew — this city is too small to reach them');
}

const dayTof = (t) => ((t + 900) % 2400) / 2400;
for (let i = 0; i < 500; i++) {
  const d = dayTof((await stats()).tick);
  if (d >= 0.47 && d <= 0.53) {
    await setSpeed(0);
    break;
  }
  await page.waitForTimeout(120);
}

const shot = async (name, tx, tz, d, yaw, pitch) => {
  await cam(tx, tz, d, yaw, pitch);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
};
await shot('industry', X + 10, Z - 3, 70, 0.5, 0.45);
await shot('commerce', X + 10, Z + 3, 70, 0.5, 0.45);
await shot('block', X + 15, Z, 190, 0.5, 0.8);

console.log('done ->', out);
await b.close();
