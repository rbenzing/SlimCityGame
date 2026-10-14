/** Crematorium shots: the crematorium beside the cemetery and a house at the
 * default pitch, so the chapel and the flue read, and again at pedestrian scale.
 *
 * The page grows the small town the interaction tests use (tests/support/
 * town.ts), which has a cemetery and a crematorium side by side on main street,
 * stores it as a save and loads it. Both are then turned to face the street
 * through the same command path the tools use, in the sandbox.
 *
 * Usage: node tools/crematorium-shots.mjs [baseUrl]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { closeUp, hooksReady, tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = 'tools/shots-crematorium';
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
  const cemetery = [...sim.standingBuildings(built.h).values()].find(
    (b) => b.catalogId === 'cemetery',
  );
  const crematorium = [...sim.standingBuildings(built.h).values()].find(
    (b) => b.catalogId === 'crematorium',
  );
  return {
    saveId,
    cemetery: { x: cemetery.x, z: cemetery.z },
    crematorium: { x: crematorium.x, z: crematorium.z },
  };
});
console.log('save', JSON.stringify(saved));

await session({ screen: 'playing', seed: 0, mode: 'load', saveId: saved.saveId });
await page.goto(base, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#viewport canvas', { timeout: 30000 });
await hooksReady(page);
await page.waitForFunction(() => window.__slimcity.getStats().population > 0, null, {
  timeout: 30000,
});

const hook = (fn, arg) => page.evaluate(fn, arg);
const camera = tileCamera(page);
const shot = async (name, settle = 1500) => {
  await page.waitForTimeout(settle);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
};

await hook(() => window.__slimcity.setDayT(0.5));
await hook(() => window.__slimcity.setSpeed(0));
const c = saved.cemetery;
// Turn the cemetery to face main street, as a player would, then stand the
// crematorium beside it on the first free spot, facing the same way.
await hook(
  ([x, z]) => {
    window.__slimcity.cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
    window.__slimcity.cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
    window.__slimcity.cmd('Turn', [
      { kind: 'bulldoze', tiles: [{ x, z }] },
      { kind: 'placeBuilding', catalogId: 'cemetery', x, z, rotation: 2 },
    ]);
  },
  [c.x, c.z],
);
await page.waitForTimeout(1500);

const placed = saved.crematorium;
await hook(
  ([x, z]) =>
    window.__slimcity.cmd('Turn crematorium', [
      { kind: 'bulldoze', tiles: [{ x, z }] },
      { kind: 'placeBuilding', catalogId: 'crematorium', x, z, rotation: 2 },
    ]),
  [placed.x, placed.z],
);
console.log('crematorium turned', JSON.stringify(placed));
await page.waitForTimeout(2500);

// The default pitch (0.7), seen from the street side (main street runs north of the lot), the cemetery and
// the houses along main street in the frame.
await camera(placed.x + 1, placed.z + 1, 110, Math.PI, 0.7);
await shot('a-crematorium-default-pitch');
await camera(placed.x + 1, placed.z + 1, 90, Math.PI + Math.PI / 5, 0.7);
await shot('a2-crematorium-closer');

// Pedestrian scale: the nearest the camera goes, at twice the resolution. The
// tile is 20 m, so a 1.75 m person stands under the 7.6 m flue's third.
const restore = await closeUp(page, 2);
await camera(placed.x + 1, placed.z + 0.4, 40, Math.PI + 0.45, 0.2);
await shot('b-crematorium-pedestrian-scale', 2000);
await camera(placed.x + 1, placed.z + 0.4, 40, Math.PI - 0.5, 0.15);
await shot('b2-crematorium-flue', 2000);
await restore();

console.log('page errors', errors.length ? errors : 'none');
await browser.close();
