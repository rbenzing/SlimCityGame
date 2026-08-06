/** R1 typed-signage validation: build a layout that contains every sign trigger
 * — a 4-way crossroads (stop), a T-junction (give-way), a turn (bend), a one-way
 * run (one-way), a highway run (speed), and a dead-end stub (no-through) — then
 * shoot each so the right sign type shows up only where it makes sense. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-signage';
mkdirSync(out, { recursive: true });
const RT = { TwoLane: 1, Avenue: 2, Highway: 3, OneWay: 6 };
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
const okTile = (x, z, h0) => x >= 0 && z >= 0 && x < N && z < N && !g.water[idx(x, z)] && Math.abs(g.height[idx(x, z)] - h0) <= 8;
let A = null;
for (let z = 20; z < N - 40 && !A; z++) for (let x = 20; x < N - 40 && !A; x++) { const h0 = g.height[idx(x, z)]; let ok = true; for (let dz = -8; dz < 26 && ok; dz++) for (let dx = -2; dx < 24 && ok; dx++) if (!okTile(x + dx, z + dz, h0)) ok = false; if (ok) A = { x, z }; }
if (!A) { console.log('no anchor'); await b.close(); process.exit(1); }
const X = A.x, Z = A.z; console.log('anchor', JSON.stringify(A));
await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await page.waitForTimeout(200);
const hrow = (z, x0, x1, tier) => cmd('R', [{ kind: 'buildRoad', tier, tiles: Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, z })) }]);
const vcol = (x, z0, z1, tier) => cmd('R', [{ kind: 'buildRoad', tier, tiles: Array.from({ length: z1 - z0 + 1 }, (_, i) => ({ x, z: z0 + i })) }]);
// Grid with two 4-way crossroads: two horizontals crossed by two verticals that pass through both.
await hrow(Z, X, X + 16, RT.TwoLane);
await hrow(Z + 8, X, X + 16, RT.TwoLane);
await vcol(X + 6, Z - 3, Z + 11, RT.TwoLane);
await vcol(X + 12, Z - 3, Z + 11, RT.TwoLane);
// T-junction: a stem dropping off the lower horizontal.
await vcol(X + 9, Z + 8, Z + 12, RT.TwoLane);
// Isolated L-turn (bend at its corner).
await hrow(Z + 15, X + 14, X + 18, RT.TwoLane);
await vcol(X + 18, Z + 15, Z + 18, RT.TwoLane);
// One-way run + highway run.
await hrow(Z + 16, X, X + 12, RT.OneWay);
await hrow(Z + 20, X, X + 16, RT.Highway);
// Isolated dead-end stub (its endpoints are no-through).
await vcol(X + 2, Z + 2, Z + 5, RT.TwoLane);
await page.waitForTimeout(500);

await setSpeed(4); await page.waitForTimeout(1200);
const dayTof = (t) => ((t + 900) % 2400) / 2400;
for (let i = 0; i < 500; i++) { const t = (await stats()).tick; const d = dayTof(t); if (d >= 0.47 && d <= 0.53) { await setSpeed(0); break; } await page.waitForTimeout(120); }
await page.waitForTimeout(400);
console.log('built + paused');

const shot = async (name, tx, tz, d) => { await cam(tx, tz, d); await page.waitForTimeout(850); await page.screenshot({ path: `${out}/${name}.png` }); };
await shot('crossroads-stop', X + 6, Z, 22);
await shot('tjunction-giveway', X + 9, Z + 8, 16);
await shot('turn-bend', X + 18, Z + 15, 14);
await shot('oneway', X + 4, Z + 16, 16);
await shot('highway-speed', X + 6, Z + 20, 18);
await shot('deadend-nothrough', X + 2, Z + 3, 13);
console.log('done');
await b.close();
