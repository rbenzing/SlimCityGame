/** §21 Stage C validation: grow a city, sandbox-plop an incinerator (4 trucks),
 * let its cosmetic garbage trucks dispatch to serviced buildings and cycle,
 * then pause mid-route at daylight and shoot the road corridor so the green
 * hopper trucks are visible driving between the incinerator and the city. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-garbagetruck';
mkdirSync(out, { recursive: true });
const RT = { TwoLane: 1 };
const ZONE = { ResLow: 1, ComLow: 3, Industrial: 5 };
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
const cam = (tx, tz, d) => call(([x, z, dd]) => window.__slimcity.setCamera((x + 0.5) * 16, (z + 0.5) * 16, dd), [tx, tz, d]);

const g = await readGrid(); const N = g.size; const idx = (x, z) => z * N + x;
const flat = (x, z, r = 1) => { const h0 = g.height[idx(x, z)]; for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, zz = z + dz; if (xx < 0 || zz < 0 || xx >= N || zz >= N) return false; if (g.water[idx(xx, zz)]) return false; if (Math.abs(g.height[idx(xx, zz)] - h0) > 3) return false; } return true; };
let A = null;
for (let z = 24; z < N - 40 && !A; z++) for (let x = 20; x < N - 40 && !A; x++) { let ok = true; for (let dz = -6; dz < 34 && ok; dz++) for (let dx = -4; dx < 36 && ok; dx++) if (!flat(x + dx, z + dz)) ok = false; if (ok) A = { x, z }; }
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
console.log('grown pop=' + s.population);

await cmd('Loan', [{ kind: 'takeLoan', amount: 100000 }]);
await page.waitForTimeout(200);
await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await page.waitForTimeout(200);
// Extra power + water right by the incinerator so it goes Active (only Active
// facilities dispatch trucks). Road-adjacent on the clear strip west of X0.
await cmd('W3', [{ kind: 'placeBuilding', catalogId: 'water-tower', x: X0 - 2, z: R3 + 1, rotation: 0 }]);
await cmd('T2', [{ kind: 'placeBuilding', catalogId: 'wind-turbine', x: X0 - 1, z: R3 + 4, rotation: 0 }]);
const INC = { x: X0 - 5, z: R1 + 1 };
await cmd('Incinerator', [{ kind: 'placeBuilding', catalogId: 'incinerator', x: INC.x, z: INC.z, rotation: 0 }]);
console.log('incinerator placed at ' + JSON.stringify(INC) + ' funds=' + (await stats()).funds);

// Run so the trucks dispatch and spread along the roads, then settle the sim
// clock to daylight and pause (freezes the trucks mid-route for a clean shot).
await setSpeed(4); await page.waitForTimeout(16000);
const dayTof = (t) => ((t + 900) % 2400) / 2400;
for (let i = 0; i < 400; i++) { const t = (await stats()).tick; const d = dayTof(t); if (d >= 0.30 && d <= 0.44) { await setSpeed(0); break; } await page.waitForTimeout(150); }
await page.waitForTimeout(500);
console.log('paused pop=' + (await stats()).population);

// The corridor between the incinerator (west) and the serviced blocks (east) —
// green hopper trucks should be on the X0 column + horizontal roads.
await cam(X0 + 1, R2, 95); await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/trucks-corridor.png` });
await cam(X0, R2 + 2, 55); await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/trucks-closeup.png` });
await cam((X0 + X1) / 2, (R2 + R3) / 2, 150); await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/trucks-overview.png` });
console.log('done');
await b.close();
