/** §21 Stage B validation: grow a small city, sandbox-plop an incinerator next
 * to it (bypassing the milestone/funds gates), let it collect + burn city trash,
 * then screenshot the incinerator model, the 'trash' lens (collection working),
 * and the pollution lens (the burn trade-off) in daylight. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-incinerator';
mkdirSync(out, { recursive: true });
const RT = { TwoLane: 1 };
const ZONE = { ResLow: 1, ComLow: 3, Industrial: 5 };
const POLLUTION_LENS = 1; // FieldId.Pollution
const b = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.addInitScript(() => {
  try { sessionStorage.setItem('slimcity.session', JSON.stringify({ screen: 'playing', seed: 12345, mode: 'new' })); } catch (e) { void e; }
});
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#viewport canvas', { timeout: 20000 });
await page.waitForTimeout(4000);
const ready = () => page.waitForFunction(() => !!window.__slimcity && !!window.__slimcity.cmd, null, { timeout: 20000 });
const call = async (fn, ...a) => { await ready(); return page.evaluate(fn, ...a); };
const cmd = (l, c) => call(([x, y]) => window.__slimcity.cmd(x, y), [l, c]);
const readGrid = () => call(() => window.__slimcity.readGrid());
const stats = () => call(() => window.__slimcity.getStats());
const setSpeed = (s) => call((x) => window.__slimcity.setSpeed(x), s);
const setOverlay = (o) => call((x) => window.__slimcity.setOverlay(x), o);
const cam = (tx, tz, d) => call(([x, z, dd]) => window.__slimcity.setCamera((x + 0.5) * 16, (z + 0.5) * 16, dd), [tx, tz, d]);

const g = await readGrid(); const N = g.size; const idx = (x, z) => z * N + x;
const flat = (x, z, r = 1) => { const h0 = g.height[idx(x, z)]; for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, zz = z + dz; if (xx < 0 || zz < 0 || xx >= N || zz >= N) return false; if (g.water[idx(xx, zz)]) return false; if (Math.abs(g.height[idx(xx, zz)] - h0) > 3) return false; } return true; };
let A = null;
for (let z = 24; z < N - 40 && !A; z++) for (let x = 20; x < N - 40 && !A; x++) { let ok = true; for (let dz = -6; dz < 34 && ok; dz++) for (let dx = -4; dx < 36 && ok; dx++) if (!flat(x + dx, z + dz)) ok = false; if (ok) A = { x, z }; }
console.log('anchor', JSON.stringify(A));
const X0 = A.x + 2, X1 = A.x + 30;
const R1 = A.z + 3, R2 = A.z + 7, R3 = A.z + 11, R4 = A.z + 15;
const row = (z) => Array.from({ length: X1 - X0 + 1 }, (_, i) => ({ x: X0 + i, z }));
for (const rz of [R1, R2, R3, R4]) await cmd('Road', [{ kind: 'buildRoad', tier: RT.TwoLane, tiles: row(rz) }]);
const colr = (x, z0, z1) => Array.from({ length: z1 - z0 + 1 }, (_, i) => ({ x, z: z0 + i }));
await cmd('Road', [{ kind: 'buildRoad', tier: RT.TwoLane, tiles: colr(X0, R1, R4) }]);
await cmd('Road', [{ kind: 'buildRoad', tier: RT.TwoLane, tiles: colr(X1, R1, R4) }]);
await page.waitForTimeout(400);
await cmd('W1', [{ kind: 'placeBuilding', catalogId: 'water-tower', x: X0, z: R1 - 2, rotation: 0 }]);
await cmd('W2', [{ kind: 'placeBuilding', catalogId: 'water-tower', x: X0 + 3, z: R1 - 2, rotation: 0 }]);
for (let i = 0; i < 14; i++) await cmd('T', [{ kind: 'placeBuilding', catalogId: 'wind-turbine', x: X0 + 6 + i, z: R1 - 1, rotation: 0 }]);
const flankS = (z) => row(z + 1); const flankN = (z) => row(z - 1);
await cmd('Z', [{ kind: 'paintZone', zone: ZONE.ResLow, tiles: [...flankS(R1), ...flankN(R2), ...flankS(R2)] }]);
await cmd('Z', [{ kind: 'paintZone', zone: ZONE.ComLow, tiles: [...flankN(R3), ...flankS(R3)] }]);
await cmd('Z', [{ kind: 'paintZone', zone: ZONE.Industrial, tiles: [...flankN(R4), ...flankS(R4)] }]);
await setSpeed(4); const t0 = Date.now(); let s = await stats();
while (Date.now() - t0 < 70000) { await page.waitForTimeout(6000); s = await stats(); if (s.population > 60) break; }
console.log('grown pop=' + s.population + ' ms=' + s.milestoneLevel);

// The 14 turbines + incinerator upkeep bankrupt the city (bankruptcy resets the
// game); take a loan so funds stay positive through the run.
await cmd('Loan', [{ kind: 'takeLoan', amount: 100000 }]);
await page.waitForTimeout(200);
// Sandbox on -> milestone/funds gates bypassed for the milestone-3, 40k incinerator.
await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await page.waitForTimeout(200);
// Plop the 4x4 incinerator on the clear strip just WEST of the X0 road column
// (east edge 1-2 tiles off the road for collection access; next to the north
// utility cluster so it's powered + watered -> Active).
const INC = { x: X0 - 5, z: R1 + 1 };
await cmd('Incinerator', [{ kind: 'placeBuilding', catalogId: 'incinerator', x: INC.x, z: INC.z, rotation: 0 }]);
console.log('incinerator placed at ' + JSON.stringify(INC) + ' funds=' + (await stats()).funds);

// Run so trash generates and the incinerator collects + burns, then settle the
// sim clock to a daylight tick for a readable shot.
await setSpeed(4); await page.waitForTimeout(12000);
const dayTof = (t) => ((t + 900) % 2400) / 2400;
for (let i = 0; i < 400; i++) { const t = (await stats()).tick; const d = dayTof(t); if (d >= 0.30 && d <= 0.44) { await setSpeed(0); break; } await page.waitForTimeout(150); }
await page.waitForTimeout(500);
console.log('paused pop=' + (await stats()).population + ' funds=' + (await stats()).funds);

// Close-up of the incinerator model (hall + flue + tipping bay), from the west.
await cam(INC.x - 1, INC.z + 2, 42); await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/incinerator-closeup.png` });
// Wider context: incinerator + the city it services to the east.
await cam(INC.x + 6, R2, 120); await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/incinerator-context.png` });
// Trash lens over the block (collection should keep serviced tiles low).
await setOverlay('trash'); await page.waitForTimeout(800);
await cam((X0 + X1) / 2, (R2 + R4) / 2, 150); await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/incinerator-trash-lens.png` });
// Pollution lens (the burn trade-off — a hot spot at the incinerator).
await setOverlay(POLLUTION_LENS); await page.waitForTimeout(800);
await cam(INC.x + 3, R2, 130); await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/incinerator-pollution-lens.png` });
await setOverlay(null);
console.log('done');
await b.close();
