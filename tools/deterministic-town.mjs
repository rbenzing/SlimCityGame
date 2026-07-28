/** Deterministic town builder via the __slimcity.cmd/readGrid dev hooks —
 * no screen picking. Builds roads + utilities + zones by exact tile, proves
 * road-carried power on the lens, grows to milestone 1, then captures the
 * M1-gated roads (avenue median, one-way arrows, four-lane). */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'tools/shots-final';
const GROW_BUDGET_MS = Number(process.argv[4] ?? 600000);
mkdirSync(out, { recursive: true });

const RT = { TwoLane: 1, Avenue: 2, Highway: 3, Gravel: 4, Alley: 5, OneWay: 6, FourLane: 7 };
const ZONE = { ResLow: 1, ComLow: 3, Industrial: 5 };

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#viewport canvas', { timeout: 20000 });
await page.waitForTimeout(4000);

const ready = () => page.waitForFunction(() => !!window.__slimcity && !!window.__slimcity.cmd, null, { timeout: 20000 });
const call = async (fn, ...a) => { await ready(); return page.evaluate(fn, ...a); };
const cmd = (label, commands) => call(([l, c]) => window.__slimcity.cmd(l, c), [label, commands]);
const readGrid = () => call(() => window.__slimcity.readGrid());
const stats = () => call(() => window.__slimcity.getStats());
const setSpeed = (s) => call((x) => window.__slimcity.setSpeed(x), s);
const setOverlay = (o) => call((x) => window.__slimcity.setOverlay(x), o);
const cam = (tx, tz, d) => call(([x, z, dd]) => window.__slimcity.setCamera((x + 0.5) * 16, (z + 0.5) * 16, dd), [tx, tz, d]);

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

// Find a flat land anchor with room for a 40-wide, 24-deep build area.
let A = null;
for (let z = 20; z < N - 30 && !A; z += 2)
  for (let x = 20; x < N - 46 && !A; x += 2) {
    let ok = true;
    for (let dz = 0; dz < 24 && ok; dz += 2) for (let dx = 0; dx < 40 && ok; dx += 2)
      if (!flat(x + dx, z + dz)) ok = false;
    if (ok) A = { x, z };
  }
if (!A) { console.log('no flat build area'); await browser.close(); process.exit(1); }
console.log('anchor:', JSON.stringify(A));
const X0 = A.x + 2, X1 = A.x + 36;

// Two arterial rows (residential band ROADZ1, jobs band ROADZ2).
const ROADZ1 = A.z + 4, ROADZ2 = A.z + 16;
const row = (z) => Array.from({ length: X1 - X0 + 1 }, (_, i) => ({ x: X0 + i, z }));
await cmd('Road', [{ kind: 'buildRoad', tier: RT.TwoLane, tiles: row(ROADZ1) }]);
await cmd('Road', [{ kind: 'buildRoad', tier: RT.TwoLane, tiles: row(ROADZ2) }]);
await page.waitForTimeout(800);

// Utilities on empty flat tiles two rows above ROADZ1 (adjacent-to-road via
// the row between). Turbine 1x1, water tower 2x2.
await cmd('Wind Turbine', [{ kind: 'placeBuilding', catalogId: 'wind-turbine', x: X0, z: ROADZ1 - 2, rotation: 0 }]);
await cmd('Water Tower', [{ kind: 'placeBuilding', catalogId: 'water-tower', x: X0 + 3, z: ROADZ1 - 3, rotation: 0 }]);
await page.waitForTimeout(1000);
console.log('after utilities:', JSON.stringify(await stats()));

// Power lens over the arterial.
await cam((X0 + X1) / 2, ROADZ1, 260);
await page.waitForTimeout(500);
await setOverlay('power');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/01-power-follows-road.png` });
await setOverlay(null);
await page.waitForTimeout(300);

// Zone: residential both sides of ROADZ1, commercial + industry along ROADZ2.
const band = (z, zone, depth) => {
  const tiles = [];
  for (let x = X0; x <= X1; x++) for (let d = 1; d <= depth; d++) {
    tiles.push({ x, z: z - d }); tiles.push({ x, z: z + d });
  }
  return { kind: 'paintZone', zone, tiles };
};
await cmd('Zone', [band(ROADZ1, ZONE.ResLow, 3)]);
await cmd('Zone', [{ kind: 'paintZone', zone: ZONE.ComLow, tiles: band(ROADZ2, ZONE.ComLow, 2).tiles.filter((t) => t.x < (X0 + X1) / 2) }]);
await cmd('Zone', [{ kind: 'paintZone', zone: ZONE.Industrial, tiles: band(ROADZ2, ZONE.Industrial, 2).tiles.filter((t) => t.x >= (X0 + X1) / 2) }]);
await page.waitForTimeout(600);

// Grow.
await setSpeed(4);
let s = await stats();
const t0 = Date.now();
while (s.milestoneLevel < 1 && Date.now() - t0 < GROW_BUDGET_MS) {
  await page.waitForTimeout(6000);
  s = await stats();
  console.log(`t+${Math.round((Date.now() - t0) / 1000)}s pop=${s.population} jobs=${s.jobs} emp=${s.employed} pwrSup=${s.powerSupply} watSup=${s.waterSupply} ms=${s.milestoneLevel}`);
}
await setSpeed(0);
await page.waitForTimeout(500);
console.log(`grew to pop=${s.population} ms=${s.milestoneLevel}`);
await cam((X0 + X1) / 2, ROADZ1, 240);
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/05-town.png` });

if (s.milestoneLevel >= 1) {
  const AVZ = A.z + 22;
  await cmd('Avenue', [{ kind: 'buildRoad', tier: RT.Avenue, tiles: row(AVZ) }]);
  await cmd('One-Way', [{ kind: 'buildRoad', tier: RT.OneWay, tiles: row(AVZ + 4) }]);
  await cmd('Four-Lane', [{ kind: 'buildRoad', tier: RT.FourLane, tiles: row(AVZ + 8) }]);
  await page.waitForTimeout(800);
  await cam((X0 + X1) / 2, AVZ + 4, 150);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/02-m1-roads.png` });
  await cam((X0 + X1) / 2, AVZ, 90);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/03-avenue-median.png` });
  await cam((X0 + X1) / 2, AVZ + 4, 90);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/04-oneway-arrows.png` });
  console.log('M1 road shots captured');
} else {
  console.log('MILESTONE 1 NOT REACHED');
}
console.log('final:', JSON.stringify(await stats()));
await browser.close();
