/** Focused probe: settle transit ridership, dispatch incidents, stats plotting. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + '?nobloom';
const out = 'tools/shots-wave14';
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

const g = await readGrid();
const N = g.size; const idx = (x, z) => z * N + x;
const flat = (x, z, r = 1) => { const h0 = g.height[idx(x, z)]; for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, zz = z + dz; if (xx < 0 || zz < 0 || xx >= N || zz >= N) return false; if (g.water[idx(xx, zz)]) return false; if (Math.abs(g.height[idx(xx, zz)] - h0) > 3) return false; } return true; };
let A = null;
for (let z = 24; z < N - 34 && !A; z++) for (let x = 20; x < N - 40 && !A; x++) { let ok = true; for (let dz = -6; dz < 28 && ok; dz++) for (let dx = 0; dx < 34 && ok; dx++) if (!flat(x + dx, z + dz)) ok = false; if (ok) A = { x, z }; }
console.log('anchor', JSON.stringify(A));
const X0 = A.x + 2, X1 = A.x + 30;
const R1 = A.z + 3, R2 = A.z + 7, R3 = A.z + 11, R4 = A.z + 15, RS = A.z + 20; // RS = service spur
const row = (z, x0 = X0, x1 = X1) => Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, z }));
for (const rz of [R1, R2, R3, R4]) await cmd('Road', [{ kind: 'buildRoad', tier: RT.TwoLane, tiles: row(rz) }]);
const colr = (x, z0, z1) => Array.from({ length: z1 - z0 + 1 }, (_, i) => ({ x, z: z0 + i }));
await cmd('Road', [{ kind: 'buildRoad', tier: RT.TwoLane, tiles: colr(X0, R1, RS) }]);
await cmd('Road', [{ kind: 'buildRoad', tier: RT.TwoLane, tiles: colr(X1, R1, R4) }]);
await cmd('Road', [{ kind: 'buildRoad', tier: RT.TwoLane, tiles: row(RS, X0, X0 + 22) }]); // service spur (connected via X0 column)
await page.waitForTimeout(500);
// utilities north of R1 (water first, then turbines) - proven recipe
await cmd('Water1', [{ kind: 'placeBuilding', catalogId: 'water-tower', x: X0, z: R1 - 2, rotation: 0 }]);
await cmd('Water2', [{ kind: 'placeBuilding', catalogId: 'water-tower', x: X0 + 3, z: R1 - 2, rotation: 0 }]);
for (let i = 0; i < 12; i++) await cmd('Turbine', [{ kind: 'placeBuilding', catalogId: 'wind-turbine', x: X0 + 6 + i, z: R1 - 1, rotation: 0 }]);
await page.waitForTimeout(600);
// zones
const flankS = (z) => row(z + 1), flankN = (z) => row(z - 1);
await cmd('Z', [{ kind: 'paintZone', zone: ZONE.ResLow, tiles: [...flankS(R1), ...flankN(R2), ...flankS(R2)] }]);
await cmd('Z', [{ kind: 'paintZone', zone: ZONE.ComLow, tiles: [...flankN(R3), ...flankS(R3)] }]);
await cmd('Z', [{ kind: 'paintZone', zone: ZONE.Industrial, tiles: [...flankN(R4)] }]);
await page.waitForTimeout(500);
// grow to M1
await setSpeed(4); let s = await stats(); const t0 = Date.now();
while (Date.now() - t0 < 120000) { await page.waitForTimeout(6000); s = await stats(); console.log(`t+${Math.round((Date.now() - t0) / 1000)}s pop=${s.population} ms=${s.milestoneLevel}`); if (s.milestoneLevel >= 1) break; }
console.log('grown pop=' + s.population + ' ms=' + s.milestoneLevel);

// stations on the service spur RS (south, empty, adjacent to spur road at RS+1) -- reachable
await cmd('Fire', [{ kind: 'placeBuilding', catalogId: 'fire-station', x: X0 + 2, z: RS + 1, rotation: 0 }]);
await cmd('Police', [{ kind: 'placeBuilding', catalogId: 'police-station', x: X0 + 8, z: RS + 1, rotation: 0 }]);
await cmd('Clinic', [{ kind: 'placeBuilding', catalogId: 'clinic', x: X0 + 14, z: RS + 1, rotation: 0 }]);
await page.waitForTimeout(800);
const gAfter = await readGrid();
const at = (x, z) => gAfter.buildingId[z * N + x];
console.log('station tiles:', at(X0 + 2, RS + 1), at(X0 + 8, RS + 1), at(X0 + 14, RS + 1));

// ---- ridership test: on-road stops vs off-road (res) stops ----
const riderText = async () => { try { const t = await page.getByText(/riders/).first().innerText({ timeout: 3000 }); return t; } catch { return 'n/a'; } };
// A: on-road
const stopsOnRoad = [X0 + 1, X0 + 10, X0 + 19, X0 + 27].map((bx) => ({ x: bx, z: R1 }));
await cmd('LineA', [{ kind: 'createTransitLine', line: { id: 0, stops: stopsOnRoad, color: 0x33bbff } }]);
await setSpeed(4); await page.waitForTimeout(5000);
console.log('A on-road riders:', await riderText());
// B: off-road res tiles (z = R1+1)
const stopsRes = [X0 + 1, X0 + 10, X0 + 19, X0 + 27].map((bx) => ({ x: bx, z: R1 + 1 }));
await cmd('LineB', [{ kind: 'createTransitLine', line: { id: 0, stops: stopsRes, color: 0xffaa33 } }]);
await page.waitForTimeout(5000);
const grid2 = await readGrid();
console.log('B riders (all lines):', await page.getByText(/riders/).allInnerTexts().catch(() => 'n/a'));

await setOverlay('transit'); await page.waitForTimeout(600);
await cam((X0 + X1) / 2, R1, 110); await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/11b-transit.png` });
await setOverlay(null);

// ---- dispatch: run, view populated res/com area (incidents spawn from active buildings) ----
await setSpeed(4); await page.waitForTimeout(50000);
await cam((X0 + X1) / 2, R2, 110); await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/12b-dispatch.png` });
await cam((X0 + X1) / 2, R3, 100); await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/12c-dispatch.png` });

// ---- stats: inspect SVG DOM ----
await setSpeed(4); await page.waitForTimeout(6000);
await page.getByRole('button', { name: 'City stats' }).click(); await page.waitForTimeout(1000);
const svgInfo = await page.evaluate(() => {
  const svgs = [...document.querySelectorAll('svg')];
  return svgs.map((s) => ({ w: s.getAttribute('width') || s.clientWidth, h: s.getAttribute('height') || s.clientHeight, polylines: s.querySelectorAll('polyline,path,line').length, samplePts: [...s.querySelectorAll('polyline')].map((p) => (p.getAttribute('points') || '').slice(0, 80)) }));
});
console.log('stats SVGs:', JSON.stringify(svgInfo));
await page.screenshot({ path: `${out}/14b-stats.png` });
console.log('final pop=' + (await stats()).population + ' ms=' + (await stats()).milestoneLevel);
await browser.close();
