/** Unlimited-money unlock validation: pre-enable the setting, confirm the HUD
 * shows ∞ for funds, then build past the starting balance (real funds go deep
 * negative) to prove the funds gate is bypassed while cash flow still reads. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-unlimitedmoney';
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.addInitScript(() => {
  try {
    sessionStorage.setItem('slimcity.session', JSON.stringify({ screen: 'playing', seed: 12345, mode: 'new' }));
    localStorage.setItem('slimcity.settings', JSON.stringify({ unlimitedMoney: true }));
  } catch (e) { void e; }
});
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#viewport canvas', { timeout: 20000 });
await page.waitForTimeout(4000);
const ready = () => page.waitForFunction(() => !!window.__slimcity && !!window.__slimcity.cmd, null, { timeout: 20000 });
const call = async (fn, ...a) => { await ready(); return page.evaluate(fn, ...a); };
const cmd = (l, c) => call(([x, y]) => window.__slimcity.cmd(x, y), [l, c]);
const readGrid = () => call(() => window.__slimcity.readGrid());
const stats = () => call(() => window.__slimcity.getStats());
const cam = (tx, tz, d) => call(([x, z, dd]) => window.__slimcity.setCamera((x + 0.5) * 16, (z + 0.5) * 16, dd), [tx, tz, d]);
const fundsText = () => page.locator('[data-testid="funds-amount"]').textContent();

const g = await readGrid(); const N = g.size; const idx = (x, z) => z * N + x;
const flat = (x, z) => { const h0 = g.height[idx(x, z)]; for (let dz = -1; dz <= 4; dz++) for (let dx = -1; dx <= 4; dx++) { const xx = x + dx, zz = z + dz; if (xx < 0 || zz < 0 || xx >= N || zz >= N) return false; if (g.water[idx(xx, zz)]) return false; if (Math.abs(g.height[idx(xx, zz)] - h0) > 3) return false; } return true; };
let A = null;
for (let z = 30; z < N - 40 && !A; z++) for (let x = 30; x < N - 60 && !A; x++) { let ok = true; for (let i = 0; i < 8 && ok; i++) if (!flat(x + i * 5, z)) ok = false; if (ok) A = { x, z }; }
console.log('start funds=' + (await stats()).funds + ' hud=' + (await fundsText()));

// Build 8 coal plants (12,000 each = 96,000, well past the 50,000 start) — with
// unlimited money every one should place even as real funds go deep negative.
for (let i = 0; i < 8; i++) {
  await cmd('Coal', [{ kind: 'placeBuilding', catalogId: 'coal-plant', x: A.x + i * 5, z: A.z, rotation: 0 }]);
  await page.waitForTimeout(120);
}
await page.waitForTimeout(600);
const s = await stats();
console.log('after 8 coal plants: real funds=' + s.funds + ' hud=' + (await fundsText()));

// HUD crop (bottom status strip) showing the ∞ funds readout + live /mo delta.
await page.screenshot({ path: `${out}/hud-infinity.png`, clip: { x: 900, y: 772, width: 380, height: 28 } });
// The 8 plants that were built despite being "broke".
await cam(A.x + 18, A.z + 1, 150); await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/built-in-the-red.png` });
console.log('done');
await b.close();
