/** Roads epic R4 validation: build a dedicated rail line + a parallel two-lane
 * road (grown with zones so cosmetic cars appear), plus a rail line crossing a
 * road, then shoot close-ups so the ballast bed + steel rails + sleepers are
 * visible and cars stay on the road (never the rail). */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-rail';
mkdirSync(out, { recursive: true });
const RT = { TwoLane: 1, RailTrack: 11 };
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
for (let z = 25; z < N - 30 && !A; z++) for (let x = 25; x < N - 30 && !A; x++) { const h0 = g.height[idx(x, z)]; let ok = true; for (let dz = -2; dz < 18 && ok; dz++) for (let dx = -3; dx < 14 && ok; dx++) if (!okTile(x + dx, z + dz, h0)) ok = false; if (ok) A = { x, z }; }
if (!A) { console.log('no anchor'); await b.close(); process.exit(1); }
const X = A.x, Z = A.z; console.log('anchor', JSON.stringify(A));
await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await page.waitForTimeout(200);
const hrow = (z, x0, x1, tier) => cmd('R', [{ kind: 'buildRoad', tier, tiles: Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, z })) }]);
const vcol = (x, z0, z1, tier) => cmd('R', [{ kind: 'buildRoad', tier, tiles: Array.from({ length: z1 - z0 + 1 }, (_, i) => ({ x, z: z0 + i })) }]);
// A rail line, a parallel road, and a rail line crossing a road.
await vcol(X, Z, Z + 14, RT.RailTrack);
await vcol(X + 4, Z, Z + 14, RT.TwoLane);
await hrow(Z + 7, X + 4, X + 10, RT.TwoLane);
await vcol(X + 10, Z, Z + 14, RT.RailTrack);
await page.waitForTimeout(500);

await setSpeed(4); await page.waitForTimeout(1200);
const dayTof = (t) => ((t + 900) % 2400) / 2400;
for (let i = 0; i < 500; i++) { const t = (await stats()).tick; const d = dayTof(t); if (d >= 0.47 && d <= 0.53) { await setSpeed(0); break; } await page.waitForTimeout(120); }
await page.waitForTimeout(400);
console.log('built + paused dayT=' + dayTof((await stats()).tick).toFixed(3));

const shot = async (name, tx, tz, d) => { await cam(tx, tz, d); await page.waitForTimeout(850); await page.screenshot({ path: `${out}/${name}.png` }); };
await shot('rail-straight', X, Z + 3, 13);
await shot('rail-crossing', X + 10, Z + 7, 18);
await shot('rail-vs-road', X + 2, Z + 6, 30);
console.log('done');
await b.close();
