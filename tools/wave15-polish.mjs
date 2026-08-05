/** Polish-review capture: seeds a small grown city + a transit line, then
 * shoots CLOSE-UPS of the three modeled props under review — bus-stop shelter,
 * street-lamp luminaire, and sidewalk pedestrians — with the transit overlay
 * OFF (so we judge the real world, not the ribbon tint) at a pinned afternoon
 * phase (setDayT) and again at a pinned night phase (lamp cone/emissive). */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-polish';
mkdirSync(out, { recursive: true });
const RT = { TwoLane: 1 };
const ZONE = { ResLow: 1, ComLow: 3, Industrial: 5 };
const b = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
// Skip the start menu (§19): pre-seed a fixed-seed "playing" session so boot
// goes straight into the world deterministically (no New-Game click needed).
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
for (let z = 24; z < N - 34 && !A; z++) for (let x = 20; x < N - 40 && !A; x++) { let ok = true; for (let dz = -6; dz < 28 && ok; dz++) for (let dx = -4; dx < 36 && ok; dx++) if (!flat(x + dx, z + dz)) ok = false; if (ok) A = { x, z }; }
console.log('anchor', JSON.stringify(A));
const X0 = A.x + 2, X1 = A.x + 30;
const R1 = A.z + 3, R2 = A.z + 7, R3 = A.z + 11, R4 = A.z + 15;
const row = (z) => Array.from({ length: X1 - X0 + 1 }, (_, i) => ({ x: X0 + i, z }));
for (const rz of [R1, R2, R3, R4]) await cmd('Road', [{ kind: 'buildRoad', tier: RT.TwoLane, tiles: row(rz) }]);
const colr = (x, z0, z1) => Array.from({ length: z1 - z0 + 1 }, (_, i) => ({ x, z: z0 + i }));
await cmd('Road', [{ kind: 'buildRoad', tier: RT.TwoLane, tiles: colr(X0, R1, R4) }]);
await cmd('Road', [{ kind: 'buildRoad', tier: RT.TwoLane, tiles: colr(X1, R1, R4) }]);
await page.waitForTimeout(500);
// Utilities on the north verge so the zones actually get power+water — without
// them nothing grows (pop stays 0) and there are no active-building walkers.
await cmd('W1', [{ kind: 'placeBuilding', catalogId: 'water-tower', x: X0, z: R1 - 2, rotation: 0 }]);
await cmd('W2', [{ kind: 'placeBuilding', catalogId: 'water-tower', x: X0 + 3, z: R1 - 2, rotation: 0 }]);
for (let i = 0; i < 14; i++) await cmd('T', [{ kind: 'placeBuilding', catalogId: 'wind-turbine', x: X0 + 6 + i, z: R1 - 1, rotation: 0 }]);
const flankS = (z) => row(z + 1); const flankN = (z) => row(z - 1);
await cmd('Z', [{ kind: 'paintZone', zone: ZONE.ResLow, tiles: [...flankS(R1), ...flankN(R2), ...flankS(R2)] }]);
await cmd('Z', [{ kind: 'paintZone', zone: ZONE.ComLow, tiles: [...flankN(R3), ...flankS(R3)] }]);
await cmd('Z', [{ kind: 'paintZone', zone: ZONE.Industrial, tiles: [...flankN(R4), ...flankS(R4)] }]);
await setSpeed(4); const t0 = Date.now(); let s = await stats();
while (Date.now() - t0 < 70000) { await page.waitForTimeout(6000); s = await stats(); if (s.milestoneLevel >= 1 && s.population > 40) break; }
console.log('grown pop=' + s.population + ' ms=' + s.milestoneLevel);
const stopXs = [X0 + 4, X0 + 13, X0 + 22];
await cmd('Transit', [{ kind: 'createTransitLine', line: { id: 0, stops: stopXs.map((bx) => ({ x: bx, z: R1 })), color: 0xffcc22 } }]);
await setSpeed(4); await page.waitForTimeout(4000);
// Settle to a daylight readable-shadow window on the SIM clock (setDayT only
// drives the sun, not the sim-clock nightFactor that fades lamps/windows in).
// Run at 4x and accept either the morning or afternoon window so we reliably
// land in daylight rather than falling through to night.
const dayTof = (t) => ((t + 900) % 2400) / 2400;
let paused = false;
for (let i = 0; i < 400; i++) { const t = (await stats()).tick; const d = dayTof(t); if ((d >= 0.36 && d <= 0.44) || (d >= 0.60 && d <= 0.68)) { await setSpeed(0); paused = true; console.log('PAUSED day dayT=' + d.toFixed(3) + ' tick=' + t); break; } await page.waitForTimeout(200); }
if (!paused) { await setSpeed(0); console.log('WARN never hit a daylight window'); }
await setOverlay(null); // real world, no ribbon tint

const shots = async (tag) => {
  // shelter centered on the first stop, viewed from the open (south) side
  await cam(stopXs[0], R1, 26); await page.waitForTimeout(1000);
  await page.screenshot({ path: `${out}/${tag}-shelter.png` });
  // lamp: mid-block on the residential street, close
  await cam(X0 + 8, R2, 22); await page.waitForTimeout(1000);
  await page.screenshot({ path: `${out}/${tag}-lamp.png` });
  // sidewalk walkers near active commercial frontage
  await cam(X0 + 15, R3, 24); await page.waitForTimeout(1000);
  await page.screenshot({ path: `${out}/${tag}-walkers.png` });
  // line overview
  await cam((X0 + X1) / 2, (R1 + R4) / 2, 120); await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${tag}-overview.png` });
};
await shots('day');
console.log('captured day close-ups pop=' + (await stats()).population);
await b.close();
