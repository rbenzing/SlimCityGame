/** Isolated bus-stop shelter + idle-pedestrian capture: a short standalone
 * road on open ground + a transit line, at fresh-boot 09:00 daytime (dayT
 * ~0.375, angled sun), so nothing occludes the shelter parts or the idlers. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-wave15c';
mkdirSync(out, { recursive: true });
const RT = { TwoLane: 1 };
const dayTof = (t) => ((t + 900) % 2400) / 2400;
const b = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
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
for (let z = 30; z < N - 20 && !A; z++) for (let x = 20; x < N - 20 && !A; x++) { let ok = true; for (let dz = -6; dz < 6 && ok; dz++) for (let dx = -2; dx < 16 && ok; dx++) if (!flat(x + dx, z + dz)) ok = false; if (ok) A = { x, z }; }
console.log('anchor', JSON.stringify(A));
const zR = A.z; const X0 = A.x, X1 = A.x + 12;
const row = (z) => Array.from({ length: X1 - X0 + 1 }, (_, i) => ({ x: X0 + i, z }));
await cmd('Road', [{ kind: 'buildRoad', tier: RT.TwoLane, tiles: row(zR) }]);
await page.waitForTimeout(400);
const stopXs = [X0 + 2, X0 + 6, X0 + 10];
await cmd('Transit', [{ kind: 'createTransitLine', line: { id: 0, stops: stopXs.map((bx) => ({ x: bx, z: zR })), color: 0xffcc22 } }]);
// let the transit snapshot + pedestrian idlers propagate (a couple sim ticks); clock barely moves
await setSpeed(1); await page.waitForTimeout(2500); await setSpeed(0);
const t = (await stats()).tick; console.log('tick=' + t + ' dayT=' + dayTof(t).toFixed(3));
await setOverlay('transit'); await page.waitForTimeout(500);
let n = 0;
for (const sx of stopXs) {
  for (const d of [22, 32, 45]) {
    await cam(sx, zR, d); await page.waitForTimeout(1000);
    await page.screenshot({ path: `${out}/iso-x${sx}-d${d}.png` }); n++;
  }
}
// a wider one down the whole line
await cam((X0 + X1) / 2, zR, 90); await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/iso-line.png` }); n++;
console.log('captured ' + n);
await b.close();
