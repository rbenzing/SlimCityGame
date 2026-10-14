/** Dispatch shots: an unanswered incident marker beside an answered one with its
 * vehicle, so the two read apart at the default pitch.
 *
 * The page grows the small town the interaction tests use (tests/support/
 * town.ts), stores it as a save and loads it. Two homes on main street are then
 * given incident markers by hand through the dev hook (the sim's own rate is far
 * too low to wait for): a fire at one with an engine parked on the street beside
 * it, and a fire at the other that nobody is coming to.
 *
 * Usage: node tools/dispatch-shots.mjs [baseUrl]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { hooksReady, tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = 'tools/shots-dispatch';
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

const saved = await page.evaluate(async () => {
  const town = await import('/tests/support/town.ts');
  const sim = await import('/tests/support/sim.ts');
  const persist = await import('/src/app/persist.ts');

  const built = town.buildTown();
  town.growTown(built, town.GROW_TICKS);
  built.h.sim.handleMessage({ type: 'requestSave' });
  await persist.storeSave(sim.latestSaveData(built.h));
  const saveId = (await persist.listSaves())[0].id;
  const homes = [...sim.standingBuildings(built.h).values()]
    .filter((b) => b.z >= 98 && b.z <= 103 && b.x >= 60 && b.x <= 110)
    .sort((a, b) => a.x - b.x);
  return { saveId, homes: homes.map((b) => ({ id: b.catalogId, x: b.x, z: b.z })) };
});
console.log('save', saved.saveId, 'candidate homes', JSON.stringify(saved.homes.slice(0, 12)));

await session({ screen: 'playing', seed: 0, mode: 'load', saveId: saved.saveId });
await page.goto(base, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#viewport canvas', { timeout: 30000 });
await hooksReady(page);
await page.waitForFunction(() => window.__slimcity.getStats().population > 0, null, {
  timeout: 30000,
});

const camera = tileCamera(page);
await page.evaluate(() => window.__slimcity.setDayT(0.5));
await page.evaluate(() => window.__slimcity.setSpeed(0));

// Two homes a few tiles apart; the first is answered, the second is not.
const [a, b] = saved.homes.filter((h, i, all) => i === 0 || h.x - all[0].x >= 5).slice(0, 2);
console.log('answered at', JSON.stringify(a), 'unanswered at', JSON.stringify(b));

await page.evaluate(
  async ([first, second]) => {
    const types = await import('/src/shared/types.ts');
    const T = window.__slimcity.tileMeters();
    window.__slimcity.setIncidents([
      { kind: 'fire', x: first.x, z: first.z, severity: 0.7, answered: true },
      { kind: 'fire', x: second.x, z: second.z, severity: 0.7, answered: false },
      { kind: 'crime', x: first.x + 3, z: first.z, severity: 0.5, answered: false },
      { kind: 'medical', x: second.x + 3, z: second.z, severity: 0.5, answered: false },
    ]);
    window.__slimcity.setVehicles([
      { x: (first.x + 1.5) * T, z: 100.5 * T, heading: Math.PI / 2, kind: types.VehicleKind.Fire },
    ]);
  },
  [a, b],
);

const shot = async (name, settle = 1500) => {
  await page.waitForTimeout(settle);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
};

const midX = (a.x + b.x) / 2;
await camera(midX, a.z + 2, 170, Math.PI, 0.7);
await shot('a-unanswered-beside-answered');
await camera(midX, a.z, 70, Math.PI, 0.7);
await shot('b-closer');

console.log('page errors', errors.length ? errors : 'none');
await browser.close();
