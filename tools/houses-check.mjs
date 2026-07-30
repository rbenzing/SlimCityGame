/** Visual check for the residential home overhaul (SPEC §16/§17) + dead-end
 * apron: builds a two-lane street with a dead-end spur, zones ResLow both
 * sides, grows briefly (res-low unlocks at M0), pins daylight, and captures an
 * overview + a street-level angle + the dead-end. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'tools/shots-houses';
const GROW_MS = Number(process.argv[4] ?? 120000);
mkdirSync(out, { recursive: true });

const RT = { TwoLane: 1 };
const ZONE = { ResLow: 1 };

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.stack || e.message}`));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[console.${m.type()}] ${m.text()}`); });
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#viewport canvas', { timeout: 20000 });
await page.waitForTimeout(4000);

const ready = () => page.waitForFunction(() => !!window.__slimcity && !!window.__slimcity.cmd, null, { timeout: 90000 });
const call = async (fn, ...a) => {
  for (let attempt = 0; ; attempt++) {
    try { await ready(); return await page.evaluate(fn, ...a); }
    catch (e) { if (attempt >= 2) throw e; await page.waitForTimeout(3000); }
  }
};
const cmd = (label, commands) => call(([l, c]) => window.__slimcity.cmd(l, c), [label, commands]);
const readGrid = () => call(() => window.__slimcity.readGrid());
const stats = () => call(() => window.__slimcity.getStats());
const setSpeed = (s) => call((x) => window.__slimcity.setSpeed(x), s);
const setDayT = (t) => call((x) => window.__slimcity.setDayT(x), t);
const cam = (tx, tz, d) => call(([x, z, dd]) => window.__slimcity.setCamera((x + 0.5) * 16, (z + 0.5) * 16, dd), [tx, tz, d]);

await setDayT(0.5); // pin noon daylight

const g = await readGrid();
const N = g.size;
const idx = (x, z) => z * N + x;
const flat = (x, z, r = 1) => {
  const h0 = g.height[idx(x, z)];
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const xx = x + dx, zz = z + dz;
    if (xx < 0 || zz < 0 || xx >= N || zz >= N) return false;
    if (g.water[idx(xx, zz)]) return false;
    if (Math.abs(g.height[idx(xx, zz)] - h0) > 3) return false;
  }
  return true;
};

let A = null;
for (let z = 20; z < N - 30 && !A; z += 2)
  for (let x = 20; x < N - 46 && !A; x += 2) {
    let ok = true;
    for (let dz = 0; dz < 20 && ok; dz += 2) for (let dx = 0; dx < 40 && ok; dx += 2)
      if (!flat(x + dx, z + dz)) ok = false;
    if (ok) A = { x, z };
  }
if (!A) { console.log('no flat build area'); await browser.close(); process.exit(1); }
console.log('anchor:', JSON.stringify(A));

const X0 = A.x + 2, X1 = A.x + 36;
const ROADZ = A.z + 8;
const row = (z) => Array.from({ length: X1 - X0 + 1 }, (_, i) => ({ x: X0 + i, z }));
await cmd('Road', [{ kind: 'buildRoad', tier: RT.TwoLane, tiles: row(ROADZ) }]);
// Dead-end spur: a short stub going north into open land (ends free -> apron).
const spurX = X0 + 6;
await cmd('Road', [{ kind: 'buildRoad', tier: RT.TwoLane, tiles: [
  { x: spurX, z: ROADZ - 1 }, { x: spurX, z: ROADZ - 2 }, { x: spurX, z: ROADZ - 3 },
] }]);
await page.waitForTimeout(800);

// Utilities adjacent to the street so zoned tiles get power+water.
await cmd('Wind Turbine', [{ kind: 'placeBuilding', catalogId: 'wind-turbine', x: X1 - 1, z: ROADZ - 2, rotation: 0 }]);
await cmd('Water Tower', [{ kind: 'placeBuilding', catalogId: 'water-tower', x: X1 - 4, z: ROADZ - 3, rotation: 0 }]);
await page.waitForTimeout(800);

// Zone ResLow both sides of the street (avoid the spur column).
const tiles = [];
for (let x = X0; x <= X1; x++) for (let d = 1; d <= 3; d++) {
  if (Math.abs(x - spurX) <= 0) continue;
  tiles.push({ x, z: ROADZ - d }); tiles.push({ x, z: ROADZ + d });
}
await cmd('Zone', [{ kind: 'paintZone', zone: ZONE.ResLow, tiles }]);
await page.waitForTimeout(600);

// Grow with a SINGLE fixed wait and no mid-grow evaluate polling — under the
// headless WebGL2 fallback, page.evaluate calls contend with the render loop
// and hang the automation gate. Just let it run, then stop and read once.
await setSpeed(4);
await page.waitForTimeout(GROW_MS);
await setSpeed(0);
await setDayT(0.5);
await page.waitForTimeout(800);
const s = await stats();
console.log('grown pop=', s.population);

// Overview.
await cam((X0 + X1) / 2, ROADZ, 240);
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/01-overview.png` });
// Street-level angle.
await cam((X0 + X1) / 2, ROADZ, 110);
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/02-street.png` });
// Dead-end spur (apron).
await cam(spurX, ROADZ - 3, 60);
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/03-deadend-apron.png` });

console.log('final:', JSON.stringify(await stats()));
await browser.close();
