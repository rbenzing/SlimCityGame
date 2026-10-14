/** Education shots: the four schools and the library of the interaction-test
 * town (tests/support/town.ts), which already stands the middle school, the high
 * school and the college together south of main street, the elementary school
 * beside the avenue and the library beside the hospital.
 *
 * The page grows that town, stores it as a save and loads it. Shots: the
 * elementary school and the library beside a parked car, the middle and high
 * school campuses, the college inside the grid, an elementary coverage lens over
 * the campuses, a campus turned a quarter, and all five at night.
 *
 * Usage: node tools/education-shots.mjs [baseUrl]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { closeUp, hooksReady, tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = 'tools/shots-education';
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
  const t = town.TOWN;
  return {
    saveId,
    middle: t.middleSchool,
    high: t.highSchool,
    college: t.college,
    library: t.library,
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
await hook(() => {
  window.__slimcity.cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
  window.__slimcity.cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
});

// The elementary school stands at (91,116) and a campus turned a quarter is put
// down east of the bus lane; its lot is 4 wide by 5 deep once turned.
const elementary = { x: 91, z: 116 };
const turned = { x: 123, z: 104 };
await hook(
  (t) =>
    window.__slimcity.cmd('Turned campus', [
      { kind: 'placeBuilding', catalogId: 'high-school', x: t.x, z: t.z, rotation: 1 },
    ]),
  turned,
);
// Civic neighbours round the college, so it stands in a built-up block.
await hook(() =>
  window.__slimcity.cmd('College neighbours', [
    { kind: 'placeBuilding', catalogId: 'clinic', x: 68, z: 108, rotation: 0 },
    { kind: 'placeBuilding', catalogId: 'police-station', x: 68, z: 112, rotation: 0 },
    { kind: 'placeBuilding', catalogId: 'small-park', x: 68, z: 115, rotation: 0 },
    { kind: 'placeBuilding', catalogId: 'fire-station', x: 62, z: 113, rotation: 0 },
  ]),
);
await page.waitForTimeout(2500);
const placed = await hook(() =>
  window.__slimcity
    .readBuildings()
    .filter((b) =>
      ['school', 'middle-school', 'high-school', 'college', 'library'].includes(b.catalogId),
    )
    .map((b) => `${b.catalogId}@${b.x},${b.z}`),
);
console.log('education buildings', JSON.stringify(placed));

const T = await hook(() => window.__slimcity.tileMeters());
const yaw = Number(process.env.EDU_YAW ?? 0);

// A car parked at the kerb for scale, 4.0 m beside a 10 m school and a 3.2 m library.
const parkCar = (x, z) =>
  hook(
    ([cx, cz, tile]) =>
      window.__slimcity.setVehicles([
        { x: cx * tile, z: cz * tile, heading: Math.PI / 2, kind: 0 },
      ]),
    [x, z, T],
  );
await parkCar(elementary.x - 0.5, elementary.z + 1);
await camera(elementary.x + 1, elementary.z + 1.5, 70, yaw, 0.55);
await shot('a-elementary-with-car', 2000);
await camera(elementary.x + 1, elementary.z + 1.5, 120, yaw + 0.5, 0.45);
await shot('a2-elementary-three-quarter', 2000);
await parkCar(saved.library.x + 0.5, saved.library.z + 2.5);
await camera(saved.library.x + 1, saved.library.z + 0.5, 70, yaw, 0.55);
await shot('a3-library-with-car', 2000);
await camera(saved.library.x + 1, saved.library.z + 0.5, 100, yaw + 0.6, 0.4);
await shot('a4-library-three-quarter', 2000);
await hook(() => window.__slimcity.setVehicles([]));

// The middle and high schools side by side, then each close.
await camera(65.5, 104, 190, yaw, 0.7);
await shot('b-middle-and-high-campuses');
await camera(62.5, 104.5, 110, yaw + 0.3, 0.55);
await shot('b2-middle-school-campus');
await camera(67, 102.5, 120, yaw + 0.3, 0.55);
await shot('b3-high-school-campus');
await camera(67, 102.5, 90, yaw + 0.9, 0.35);
await shot('b4-high-school-low');

// The college, with the town round it.
await camera(64, 109.5, 220, yaw, 0.7);
await shot('c-college-in-the-grid');
await camera(63.5, 109.5, 130, yaw + 0.35, 0.5);
await shot('c2-college-quad');
await camera(63.5, 109, 90, yaw - 0.6, 0.3);
await shot('c3-college-portico-low');

// Pedestrian scale at twice the resolution: a car in front of the library door.
const restore = await closeUp(page, 2);
await camera(saved.library.x + 1, saved.library.z + 1.2, 40, yaw, 0.25);
await shot('a5-library-door-close', 2500);
await restore();

// One coverage lens over the campuses.
await hook(() => window.__slimcity.setOverlay(10));
await camera(65.5, 106, 200, yaw, 0.7);
await shot('e-high-school-lens-over-campuses');
await hook(() => window.__slimcity.setOverlay(null));

// A campus turned a quarter: the lot swings with its street side.
await camera(turned.x + 1.5, turned.z + 2, 130, yaw + 0.3, 0.6);
await shot('f-high-school-turned');
await camera(turned.x + 1.5, turned.z + 2, 90, yaw + 0.9, 0.35);
await shot('f2-high-school-turned-low');

// Night: the windows, gym bands, clerestory and door panes are the lit face of each building.
await hook(() => window.__slimcity.setSpeed(1));
await hook(() => window.__slimcity.setDayT(0.96));
await camera(65.5, 106, 190, yaw, 0.65);
await shot('d-campuses-night', 2500);
await camera(elementary.x + 1, elementary.z + 1.5, 100, yaw + 0.3, 0.5);
await shot('d2-elementary-night', 2500);
await camera(saved.library.x + 1, saved.library.z + 0.5, 90, yaw + 0.3, 0.45);
await shot('d3-library-night', 2500);

console.log('page errors', errors.length ? errors : 'none');
await browser.close();
