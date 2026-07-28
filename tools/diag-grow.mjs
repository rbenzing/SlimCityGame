/** Diagnostic: build a compact town, check power/watered lenses + poll growth. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const url = process.argv[2] ?? 'http://localhost:5173';
const out = 'tools/shots-diag';
mkdirSync(out, { recursive: true });
const RT = { TwoLane: 1 };
const ZONE = { ResLow: 1 };
const browser = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#viewport canvas', { timeout: 20000 });
await page.waitForTimeout(4000);
const call = async (fn, ...a) => page.evaluate(fn, ...a);
const cmd = (l, c) => call(([x, y]) => window.__slimcity.cmd(x, y), [l, c]);
const readGrid = () => call(() => window.__slimcity.readGrid());
const stats = () => call(() => window.__slimcity.getStats());
const setSpeed = (s) => call((x) => window.__slimcity.setSpeed(x), s);
const setOverlay = (o) => call((x) => window.__slimcity.setOverlay(x), o);
const cam = (tx, tz, d) => call(([x, z, dd]) => window.__slimcity.setCamera((x + 0.5) * 16, (z + 0.5) * 16, dd), [tx, tz, d]);
const g = await readGrid();
const N = g.size; const idx = (x, z) => z * N + x;
const flat = (x, z, r = 2) => { const h0 = g.height[idx(x, z)]; for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, zz = z + dz; if (xx < 0 || zz < 0 || xx >= N || zz >= N) return false; if (g.water[idx(xx, zz)]) return false; if (Math.abs(g.height[idx(xx, zz)] - h0) > 3) return false; } return true; };
let A = null;
for (let z = 20; z < N - 20 && !A; z++) for (let x = 20; x < N - 20 && !A; x++) { let ok = true; for (let dz = 0; dz < 10 && ok; dz++) for (let dx = 0; dx < 20 && ok; dx++) if (!flat(x + dx, z + dz)) ok = false; if (ok) A = { x, z }; }
console.log('anchor', JSON.stringify(A));
const X0 = A.x + 2, X1 = A.x + 16, RZ = A.z + 4;
const row = (z) => Array.from({ length: X1 - X0 + 1 }, (_, i) => ({ x: X0 + i, z }));
await cmd('Road', [{ kind: 'buildRoad', tier: RT.TwoLane, tiles: row(RZ) }]);
await cmd('Turbine', [{ kind: 'placeBuilding', catalogId: 'wind-turbine', x: X0, z: RZ - 2, rotation: 0 }]);
await cmd('Water', [{ kind: 'placeBuilding', catalogId: 'water-tower', x: X0 + 4, z: RZ - 2, rotation: 0 }]);
await page.waitForTimeout(800);
const tiles = []; for (let x = X0; x <= X1; x++) { tiles.push({ x, z: RZ - 1 }); tiles.push({ x, z: RZ + 1 }); }
await cmd('Zone', [{ kind: 'paintZone', zone: ZONE.ResLow, tiles }]);
await page.waitForTimeout(600);
await cam((X0 + X1) / 2, RZ, 120);
await setOverlay('power'); await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/power.png` });
await setOverlay('watered'); await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/watered.png` });
await setOverlay(null);
await setSpeed(4);
for (let i = 0; i < 12; i++) { await page.waitForTimeout(5000); const s = await stats(); console.log(`t${i} pop=${s.population} pwrSup=${s.powerSupply} pwrDem=${s.powerDemand} watSup=${s.waterSupply} watDem=${s.waterDemand}`); if (s.population > 0) break; }
await page.screenshot({ path: `${out}/grown.png` });
await browser.close();
