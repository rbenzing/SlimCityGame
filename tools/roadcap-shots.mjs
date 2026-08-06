/** Road dead-end cap check: lay a short isolated stub of every tier (both tips
 * are dead-ends), then shoot the ends so the rounded turnaround caps are
 * visible — avenue / highway / four-lane should now round like the two-lane. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-roadcap';
mkdirSync(out, { recursive: true });
const TIERS = [
  ['TwoLane', 1], ['Avenue', 2], ['Highway', 3], ['FourLane', 7],
  ['OneWay', 6], ['Gravel', 4], ['Alley', 5],
];
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
// Roads auto-grade the ground under them, so the only hard constraint is
// water-free tiles across the whole stub block (plus the bulb room past the
// east/west tips). Keep a loose height-variance cap so the shot isn't on a cliff.
const okTile = (x, z, h0) => x >= 0 && z >= 0 && x < N && z < N && !g.water[idx(x, z)] && Math.abs(g.height[idx(x, z)] - h0) <= 8;
let A = null;
for (let z = 20; z < N - 45 && !A; z++) {
  for (let x = 20; x < N - 20 && !A; x++) {
    const h0 = g.height[idx(x, z)];
    let ok = true;
    for (let i = 0; i < TIERS.length && ok; i++) {
      const zz = z + i * 5;
      for (let dx = -3; dx < 9 && ok; dx++) if (!okTile(x + dx, zz, h0)) ok = false;
    }
    if (ok) A = { x, z };
  }
}
if (!A) { console.log('no water-free anchor found'); await b.close(); process.exit(1); }
console.log('anchor', JSON.stringify(A) + ' h=' + g.height[idx(A.x, A.z)].toFixed(1));
const X0 = A.x, Z0 = A.z;
// Avenue/Highway/Four-Lane/One-Way/Alley are milestone-locked at game start;
// sandbox bypasses the gate so every tier builds.
await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await page.waitForTimeout(200);
const stub = (z) => Array.from({ length: 6 }, (_, i) => ({ x: X0 + i, z }));
for (let i = 0; i < TIERS.length; i++) {
  const [name, tier] = TIERS[i];
  await cmd(name, [{ kind: 'buildRoad', tier, tiles: stub(Z0 + i * 5) }]);
  await page.waitForTimeout(120);
}
console.log('built ' + TIERS.length + ' stubs');

// Settle the sim clock to daylight, then pause.
await setSpeed(4); await page.waitForTimeout(1500);
const dayTof = (t) => ((t + 900) % 2400) / 2400;
for (let i = 0; i < 400; i++) { const t = (await stats()).tick; const d = dayTof(t); if (d >= 0.32 && d <= 0.42) { await setSpeed(0); break; } await page.waitForTimeout(120); }
await page.waitForTimeout(400);

const midZ = Z0 + Math.floor((TIERS.length * 5) / 2);
// Overview looking down the column of EAST dead-ends (x = X0+5).
await cam(X0 + 5, midZ, 140); await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/all-ends-overview.png` });
// Close-ups on the previously-broken wide tiers' east ends.
await cam(X0 + 5, Z0 + 1 * 5, 34); await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/avenue-end.png` });
await cam(X0 + 5, Z0 + 2 * 5, 34); await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/highway-end.png` });
await cam(X0 + 5, Z0 + 3 * 5, 34); await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/fourlane-end.png` });
// Two-lane end as the control (should be unchanged).
await cam(X0 + 5, Z0 + 0 * 5, 30); await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/twolane-end.png` });
console.log('done');
await b.close();
