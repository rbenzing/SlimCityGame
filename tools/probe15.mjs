import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const p = await b.newPage({ viewport: { width: 800, height: 600 } });
p.on('pageerror', e => console.log('[pageerror]', e.message));
await p.goto('http://localhost:5173/?nobloom', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('#viewport canvas', { timeout: 20000 });
await p.waitForTimeout(3000);
const has = await p.evaluate(() => !!(window.__slimcity && window.__slimcity.cmd && window.__slimcity.readGrid));
console.log('hook=', has);
if (has) { const s = await p.evaluate(() => window.__slimcity.getStats()); const size = await p.evaluate(()=>window.__slimcity.readGrid().size); console.log('stats tick=', s.tick, 'pop=', s.population, 'gridSize=', size); }
await b.close();
