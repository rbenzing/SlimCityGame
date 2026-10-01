/** Town shots: the small town the interaction tests grow, photographed.
 *
 * The page imports the town from tests/support/town.ts through the dev server,
 * builds and grows it with the same steps and seed the tests use, stores the
 * result as a saved game and loads it the way the Load Game menu does. So what
 * is photographed is exactly the city tests/interaction/town.test.ts checks:
 * every road type, every zone, services, garbage, the railway, the bus and
 * tram lines, and the farms off the dirt road. Photographs the whole town and
 * each district, day and night, and prints what grew and every page error.
 *
 * Usage: node tools/town-shots.mjs [baseUrl]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { hooksReady, tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = 'tools/shots-town';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const session = (value) =>
  page.addInitScript((v) => {
    try {
      sessionStorage.setItem('slimcity.session', JSON.stringify(v));
    } catch (e) {
      void e;
    }
  }, value);

await session({ screen: 'playing', seed: 1, mode: 'new' });
await page.goto(base, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#viewport canvas', { timeout: 30000 });
await hooksReady(page);

// Grow the town in the page and store it as a saved game.
const grown = await page.evaluate(async () => {
  const town = await import('/tests/support/town.ts');
  const sim = await import('/tests/support/sim.ts');
  const persist = await import('/src/app/persist.ts');
  const built = town.buildTown();
  const refused = built.steps.filter((_, i) => !built.acks[i].ok).map((s) => s.label);
  town.growTown(built, town.GROW_TICKS);
  built.h.sim.handleMessage({ type: 'requestSave' });
  await persist.storeSave(sim.latestSaveData(built.h));
  const saves = await persist.listSaves();
  const stats = built.h.lastSnapshot().stats;
  return { refused, saveId: saves[0].id, population: stats.population, jobs: stats.jobs };
});
console.log('grown', JSON.stringify(grown));

await session({ screen: 'playing', seed: 0, mode: 'load', saveId: grown.saveId });
await page.goto(base, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#viewport canvas', { timeout: 30000 });
await hooksReady(page);
const hook = (fn, arg) => page.evaluate(fn, arg);
await page.waitForFunction(() => window.__slimcity.getStats().population > 0, null, {
  timeout: 30000,
});
await hook(() => window.__slimcity.setSpeed(1));
await hook(() => window.__slimcity.setDayT(0.5));
const camera = tileCamera(page);
const shot = async (name) => {
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
};

await camera(95, 100, 2600, Math.PI / 6, 1.0);
await shot('01-town');
await camera(90, 100, 700, Math.PI / 5, 0.85);
await shot('02-downtown');
await camera(90, 44, 800, Math.PI / 6, 0.85);
await shot('03-railway-and-landfill');
await camera(70, 85, 600, -Math.PI / 5, 0.8);
await shot('04-tramway');
await camera(90, 85, 120, Math.PI / 4, 0.9);
await shot('04b-tram-crossing');
await camera(134.5, 100, 140, Math.PI / 4, 0.9);
await shot('04c-median-opening');
await camera(90, 72, 600, Math.PI / 3, 0.7);
await shot('05-avenue-bridge');
await camera(100, 130, 700, Math.PI / 5, 0.85);
await shot('06-industry-and-incinerator');
await camera(70, 164, 700, Math.PI / 5, 0.85);
await shot('07-farms');
await camera(148, 60, 600, -Math.PI / 4, 0.8);
await shot('08-motorway-ramp');
await camera(150, 84, 160, -Math.PI / 4, 0.55);
await shot('08b-motorway-sound-wall');
await camera(95, 148, 600, Math.PI / 4, 0.85);
await shot('09-airfield');
await hook(() => window.__slimcity.setOverlay('trash'));
await camera(95, 100, 2600, 0, 1.2);
await shot('10-trash-lens');
await hook(() => window.__slimcity.setOverlay(null));
await hook(() => window.__slimcity.setDayT(0.96));
await camera(90, 100, 1200, Math.PI / 5, 0.9);
await shot('11-night');

console.log('stats', JSON.stringify(await hook(() => window.__slimcity.getStats())));
console.log('farm kit', JSON.stringify(await hook(() => window.__slimcity.farmKit())));
console.log('page errors', errors.length ? errors : 'none');
await browser.close();
