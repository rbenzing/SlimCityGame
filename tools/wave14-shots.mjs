/** Wave 14 visual verification (§11-§14). Grows a real M1 city, then exercises
 * transit / dispatch / districts / stats / photo. Uses ?nobloom for headless stability. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-wave14';
const GROW_MS = Number(process.argv[4] ?? 420000);
mkdirSync(out, { recursive: true });
const RT = { TwoLane: 1 };
const ZONE = { ResLow: 1, ComLow: 3, Industrial: 5 };
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
const setTool = (t) => call((x) => window.__slimcity.setTool(x), t);
const cam = (tx, tz, d) => call(([x, z, dd]) => window.__slimcity.setCamera((x + 0.5) * 16, (z + 0.5) * 16, dd), [tx, tz, d]);
const countBuildings = async () => { const gg = await readGrid(); let n = 0; for (const b of gg.buildingId) if (b) n++; return n; };

const g = await readGrid();
const N = g.size; const idx = (x, z) => z * N + x;
const flat = (x, z, r = 1) => { const h0 = g.height[idx(x, z)]; for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, zz = z + dz; if (xx < 0 || zz < 0 || xx >= N || zz >= N) return false; if (g.water[idx(xx, zz)]) return false; if (Math.abs(g.height[idx(xx, zz)] - h0) > 3) return false; } return true; };
let A = null;
for (let z = 24; z < N - 30 && !A; z++) for (let x = 20; x < N - 40 && !A; x++) { let ok = true; for (let dz = -6; dz < 24 && ok; dz++) for (let dx = 0; dx < 34 && ok; dx++) if (!flat(x + dx, z + dz)) ok = false; if (ok) A = { x, z }; }
if (!A) { console.log('no area'); await browser.close(); process.exit(1); }
console.log('anchor', JSON.stringify(A));
const X0 = A.x + 2, X1 = A.x + 30;
const R1 = A.z + 3, R2 = A.z + 7, R3 = A.z + 11, R4 = A.z + 15;
const roads = [R1, R2, R3, R4];
const row = (z) => Array.from({ length: X1 - X0 + 1 }, (_, i) => ({ x: X0 + i, z }));
for (const rz of roads) await cmd('Road', [{ kind: 'buildRoad', tier: RT.TwoLane, tiles: row(rz) }]);
// connectors so the whole thing is one network
const colr = (x, z0, z1) => Array.from({ length: z1 - z0 + 1 }, (_, i) => ({ x, z: z0 + i }));
await cmd('Road', [{ kind: 'buildRoad', tier: RT.TwoLane, tiles: colr(X0, R1, R4) }]);
await cmd('Road', [{ kind: 'buildRoad', tier: RT.TwoLane, tiles: colr(X1, R1, R4) }]);
await page.waitForTimeout(600);
// Utilities NORTH of R1 (rows R1-2/R1-1), all orthogonally adjacent to road R1
// so they inject into the whole connected road graph. WATER FIRST (cheap) so it
// is funded before turbines exhaust the 50k treasury. Wind turbines = no
// pollution. Budget: 2 water (5k) + 14 turbines (42k) = 47k.
await cmd('Water1', [{ kind: 'placeBuilding', catalogId: 'water-tower', x: X0, z: R1 - 2, rotation: 0 }]);
await cmd('Water2', [{ kind: 'placeBuilding', catalogId: 'water-tower', x: X0 + 3, z: R1 - 2, rotation: 0 }]);
for (let i = 0; i < 14; i++) await cmd('Turbine', [{ kind: 'placeBuilding', catalogId: 'wind-turbine', x: X0 + 6 + i, z: R1 - 1, rotation: 0 }]);
await page.waitForTimeout(800);
console.log('utilities placed, buildings=' + (await countBuildings()));
// zoning: res on R1 south + R2 both, com on R3 both, ind on R4 both
const flankS = (z) => Array.from({ length: X1 - X0 + 1 }, (_, i) => ({ x: X0 + i, z: z + 1 }));
const flankN = (z) => Array.from({ length: X1 - X0 + 1 }, (_, i) => ({ x: X0 + i, z: z - 1 }));
await cmd('Z', [{ kind: 'paintZone', zone: ZONE.ResLow, tiles: [...flankS(R1), ...flankN(R2), ...flankS(R2)] }]);
await cmd('Z', [{ kind: 'paintZone', zone: ZONE.ComLow, tiles: [...flankN(R3), ...flankS(R3)] }]);
await cmd('Z', [{ kind: 'paintZone', zone: ZONE.Industrial, tiles: [...flankN(R4), ...flankS(R4)] }]);
await page.waitForTimeout(600);
// power lens sanity
await cam((X0 + X1) / 2, R2, 200); await setOverlay('power'); await page.waitForTimeout(1000);
await page.screenshot({ path: `${out}/00-power.png` }); await setOverlay(null);
// grow
await setSpeed(4); let s = await stats(); const t0 = Date.now();
while (Date.now() - t0 < GROW_MS) { await page.waitForTimeout(8000); s = await stats(); const nb = await countBuildings(); console.log(`t+${Math.round((Date.now() - t0) / 1000)}s pop=${s.population} jobs=${s.jobs} ms=${s.milestoneLevel} bld=${nb} pwrS=${s.powerSupply} pwrD=${s.powerDemand} watS=${s.waterSupply} watD=${s.waterDemand}`); if (s.milestoneLevel >= 1) break; }
console.log('grown pop=' + s.population + ' ms=' + s.milestoneLevel);
await page.screenshot({ path: `${out}/01-town.png` });

const M1 = s.milestoneLevel >= 1;
// service stations (need M1)
if (M1) {
  await cmd('Fire', [{ kind: 'placeBuilding', catalogId: 'fire-station', x: X0 + 2, z: R4 + 2, rotation: 0 }]);
  await cmd('Police', [{ kind: 'placeBuilding', catalogId: 'police-station', x: X0 + 10, z: R4 + 2, rotation: 0 }]);
  await cmd('Clinic', [{ kind: 'placeBuilding', catalogId: 'clinic', x: X0 + 18, z: R4 + 2, rotation: 0 }]);
  await page.waitForTimeout(800);
}
// §11 transit
const stopXs = [X0 + 1, X0 + 10, X0 + 19, X0 + 28];
if (M1) for (const bx of stopXs) await cmd('BusStop', [{ kind: 'placeBuilding', catalogId: 'bus-stop', x: bx, z: R1 + 1 + 2, rotation: 0 }]);
await cmd('Transit', [{ kind: 'createTransitLine', line: { id: 0, stops: stopXs.map((bx) => ({ x: bx, z: R1 })), color: 0x33bbff } }]);
await setSpeed(4); await page.waitForTimeout(8000);
console.log('after transit pop=' + (await stats()).population);
await setOverlay('transit'); await page.waitForTimeout(600);
await cam((X0 + X1) / 2, R1, 120); await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/11-transit.png` }); console.log('shot 11');
await setOverlay(null);
// §12 dispatch
await setSpeed(4); await page.waitForTimeout(45000);
await cam((X0 + X1) / 2, R4, 120); await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/12-dispatch.png` }); console.log('shot 12');
await cam((X0 + X1) / 2, R2, 90); await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/12b-dispatch.png` });
// §13 districts
const dt = []; for (let x = X0; x <= X0 + 14; x++) for (let z = R1 - 1; z <= R2 + 1; z++) dt.push({ x, z });
await cmd('PaintD', [{ kind: 'paintDistrict', districtId: 1, tiles: dt }]);
await cmd('Policy', [{ kind: 'setDistrictPolicy', districtId: 1, policy: 'highTax', on: true }]);
await page.waitForTimeout(400);
await setTool('district.paint'); await setOverlay('districts'); await page.waitForTimeout(700);
await cam((X0 + X1) / 2, R1 + 3, 150); await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/13-districts.png` }); console.log('shot 13');
await setOverlay(null); await setTool('select');
// §14 stats
await setSpeed(4); await page.waitForTimeout(8000);
await page.getByRole('button', { name: 'City stats' }).click(); await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/14-stats.png` }); console.log('shot 14');
await page.getByRole('button', { name: 'City stats' }).click();
// §14 photo mode
await cam((X0 + X1) / 2, R2, 100); await page.waitForTimeout(500);
const beforeVis = await page.getByRole('button', { name: 'Photo mode' }).isVisible();
await page.getByRole('button', { name: 'Photo mode' }).click(); await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/15-photo.png` });
const inPhoto = await page.getByRole('button', { name: 'City stats' }).count();
console.log(`shot 15 beforeVis=${beforeVis} statsBtnInPhoto=${inPhoto}`);
await page.keyboard.press('Escape'); await page.waitForTimeout(800);
const afterEsc = await page.getByRole('button', { name: 'City stats' }).count();
await page.screenshot({ path: `${out}/16-photo-exit.png` });
console.log(`shot 16 statsBtnAfterEsc=${afterEsc}`);
console.log('final pop=' + (await stats()).population + ' ms=' + (await stats()).milestoneLevel);
await browser.close();
