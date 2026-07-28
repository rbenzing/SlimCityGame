/** Solvent M1 city -> active fire+police stations -> capture incidents/service vehicles. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const url = (process.argv[2] ?? 'http://localhost:5173') + '?nobloom';
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
const cam = (tx, tz, d) => call(([x, z, dd]) => window.__slimcity.setCamera((x + 0.5) * 16, (z + 0.5) * 16, dd), [tx, tz, d]);
const g = await readGrid();
const N = g.size; const idx = (x, z) => z * N + x;
const flat = (x, z, r = 1) => { const h0 = g.height[idx(x, z)]; for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, zz = z + dz; if (xx < 0 || zz < 0 || xx >= N || zz >= N) return false; if (g.water[idx(xx, zz)]) return false; if (Math.abs(g.height[idx(xx, zz)] - h0) > 3) return false; } return true; };
let A = null;
for (let z = 24; z < N - 34 && !A; z++) for (let x = 20; x < N - 40 && !A; x++) { let ok = true; for (let dz = -6; dz < 28 && ok; dz++) for (let dx = 0; dx < 34 && ok; dx++) if (!flat(x + dx, z + dz)) ok = false; if (ok) A = { x, z }; }
console.log('anchor', JSON.stringify(A));
const X0 = A.x + 2, X1 = A.x + 30;
const R1 = A.z + 3, R2 = A.z + 7, R3 = A.z + 11, R4 = A.z + 15, RS = A.z + 20;
const row = (z, x0 = X0, x1 = X1) => Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, z }));
const colr = (x, z0, z1) => Array.from({ length: z1 - z0 + 1 }, (_, i) => ({ x, z: z0 + i }));
for (const rz of [R1, R2, R3, R4]) await cmd('Road', [{ kind: 'buildRoad', tier: RT.TwoLane, tiles: row(rz) }]);
await cmd('Road', [{ kind: 'buildRoad', tier: RT.TwoLane, tiles: colr(X0, R1, RS) }]);
await cmd('Road', [{ kind: 'buildRoad', tier: RT.TwoLane, tiles: colr(X1, R1, R4) }]);
await cmd('Road', [{ kind: 'buildRoad', tier: RT.TwoLane, tiles: row(RS, X0, X0 + 22) }]);
await page.waitForTimeout(500);
// MINIMAL solvent utilities: 1 water + 6 turbines (probe showed ~32 power demand @462 pop)
await cmd('Water', [{ kind: 'placeBuilding', catalogId: 'water-tower', x: X0, z: R1 - 2, rotation: 0 }]);
for (let i = 0; i < 6; i++) await cmd('Turbine', [{ kind: 'placeBuilding', catalogId: 'wind-turbine', x: X0 + 4 + i, z: R1 - 1, rotation: 0 }]);
await page.waitForTimeout(500);
const flankS = (z) => row(z + 1), flankN = (z) => row(z - 1);
await cmd('Z', [{ kind: 'paintZone', zone: ZONE.ResLow, tiles: [...flankS(R1), ...flankN(R2), ...flankS(R2)] }]);
await cmd('Z', [{ kind: 'paintZone', zone: ZONE.ComLow, tiles: [...flankN(R3), ...flankS(R3)] }]);
await cmd('Z', [{ kind: 'paintZone', zone: ZONE.Industrial, tiles: [...flankN(R4)] }]);
await page.waitForTimeout(500);
await setSpeed(4); let s = await stats(); const t0 = Date.now();
while (Date.now() - t0 < 150000) { await page.waitForTimeout(6000); s = await stats(); if (s.milestoneLevel >= 1) break; }
console.log('grown pop=' + s.population + ' ms=' + s.milestoneLevel + ' funds=' + s.funds);
// fire + police on the service spur (cheaper than +clinic)
await cmd('Fire', [{ kind: 'placeBuilding', catalogId: 'fire-station', x: X0 + 2, z: RS + 1, rotation: 0 }]);
await cmd('Police', [{ kind: 'placeBuilding', catalogId: 'police-station', x: X0 + 9, z: RS + 1, rotation: 0 }]);
await cmd('Clinic', [{ kind: 'placeBuilding', catalogId: 'clinic', x: X0 + 16, z: RS + 1, rotation: 0 }]);
await page.waitForTimeout(600);
const g2 = await readGrid();
console.log('stations placed:', g2.buildingId[(RS + 1) * N + (X0 + 2)], g2.buildingId[(RS + 1) * N + (X0 + 9)], g2.buildingId[(RS + 1) * N + (X0 + 16)], 'funds=' + (await stats()).funds);
// let Crime/FireRisk/Pollution fields build + incidents spawn/dispatch
await setSpeed(4);
for (let i = 0; i < 12; i++) { await page.waitForTimeout(8000); const st = await stats(); console.log(`disp t${i} pop=${st.population} funds=${Math.round(st.funds)}`); }
// capture several angles to catch incident cones + service vehicles
await cam((X0 + X1) / 2, R2, 90); await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/12f-res.png` });
await cam((X0 + X1) / 2, R4, 90); await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/12g-ind.png` });
await cam(X0 + 8, (R4 + RS) / 2, 130); await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/12h-stations.png` });
// crime field overlay to correlate incident hot-spots (if 'crime' is a lens)
await cam((X0 + X1) / 2, R2, 110); await page.waitForTimeout(1000);
await page.screenshot({ path: `${out}/12i-wide.png` });
console.log('final pop=' + (await stats()).population + ' funds=' + Math.round((await stats()).funds));
await browser.close();
