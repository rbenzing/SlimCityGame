import { chromium } from 'playwright';
const dayTof = (t) => ((t + 900) % 2400) / 2400;
const b = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const p = await b.newPage({ viewport: { width: 640, height: 480 } });
p.on('pageerror', e => console.log('[pageerror]', e.message));
await p.goto('http://localhost:5173/?nobloom', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('#viewport canvas', { timeout: 20000 });
await p.waitForTimeout(3000);
const stats = () => p.evaluate(() => window.__slimcity.getStats());
const setSpeed = (s) => p.evaluate((x) => window.__slimcity.setSpeed(x), s);
for (const sp of [1, 2, 4]) {
  await setSpeed(sp);
  const t0 = (await stats()).tick; const wall0 = Date.now();
  await p.waitForTimeout(3000);
  const t1 = (await stats()).tick; const dt = (Date.now() - wall0) / 1000;
  console.log(`speed=${sp} ticks/sec=${((t1 - t0) / dt).toFixed(1)} (t0=${t0} t1=${t1})`);
}
// now watch dayT progression at speed 1 with 250ms polls
await setSpeed(1);
for (let i = 0; i < 12; i++) { const t = (await stats()).tick; console.log(`poll ${i} tick=${t} dayT=${dayTof(t).toFixed(3)}`); await p.waitForTimeout(250); }
await setSpeed(0);
await b.close();
