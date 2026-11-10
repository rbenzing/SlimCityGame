/** Station shots: the four fire and police stations in a row along main street
 * of the interaction-test town, at the default pitch, then at pedestrian scale
 * (an engine and a car on the apron, the engine at its bay door) and at night.
 *
 * The page grows the town the interaction tests use (tests/support/town.ts),
 * which already stands the two district stations on the north side of main
 * street, stores it as a save and loads it. The two first-rung stations are
 * then put beside them so all four stand in a row, each facing the street.
 *
 * Usage: node tools/station-shots.mjs [baseUrl] [outDir]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { cleanShot, closeUp, hooksReady, tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'tools/shots-stations';
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
  return {
    saveId,
    policeDistrict: town.TOWN.policeDistrict,
    fireDistrict: town.TOWN.fireDistrict,
  };
});
console.log('save', JSON.stringify(saved));

// The town is in debt, which raises the red alert badge on every shot. The
// Options toggle is a persisted setting (the status strip reads it, not the sim's
// flag), so the page starts with it on, as a player who switched it on would.
await page.addInitScript(() => {
  try {
    localStorage.setItem('slimcity.settings', JSON.stringify({ unlimitedMoney: true }));
  } catch (e) {
    void e;
  }
});
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
  await cleanShot(page, `${out}/${name}.png`);
  console.log('shot', name);
};

await hook(() => window.__slimcity.setDayT(0.5));
await hook(() => window.__slimcity.setSpeed(0));
const police = saved.policeDistrict;
const fire = saved.fireDistrict;
// The two first-rung stations beside the districts, on the same north side of
// main street, so the lots all face south to the street.
const small = { police: { x: police.x + 9, z: 98 }, fire: { x: police.x + 12, z: 98 } };
await hook((s) => {
  window.__slimcity.cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
  window.__slimcity.cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
  window.__slimcity.cmd('Stations', [
    {
      kind: 'placeBuilding',
      catalogId: 'police-station',
      x: s.police.x,
      z: s.police.z,
      rotation: 0,
    },
    { kind: 'placeBuilding', catalogId: 'fire-station', x: s.fire.x, z: s.fire.z, rotation: 0 },
  ]);
}, small);
await page.waitForTimeout(2500);

const rowX = (police.x + small.fire.x + 2) / 2;
const yaw = Number(process.env.STATION_YAW ?? 0);
// Steep, so the water towers and the high-rise south of the street fall below
// the row of stations instead of standing in front of them.
const ROW_PITCH = 1.15;
await camera(rowX, 99, 270, yaw, ROW_PITCH);
await shot('a-four-stations-default-pitch');
await camera(rowX, 99, 185, yaw + 0.15, ROW_PITCH - 0.2);
await shot('a2-four-stations-closer');

// Pedestrian scale: the nearest the camera goes, at twice the resolution. The
// tile is 20 m; the engine is 10 m, the car 4 m and a bay door 4.6 m.
const restore = await closeUp(page, 2);
// Local x of the first bay door of the district fire station, in tiles from its
// lot centre, and the engine 6.5 m beyond the front wall.
const T = await hook(() => window.__slimcity.tileMeters());
const bay0X = fire.x + 1.5 + (-27 + 18 * 0.3048 * 0.5) / T;
const apronZ = fire.z + 1 + (-17 + 20 + 1.5 + 5) / T;
// A car stands on the apron beside the engines for scale (no sim car stays there).
await hook(
  ([tile, x, z]) =>
    window.__slimcity.setVehicles([
      { x: (x + 0.5) * tile, z: (z + 0.5) * tile, heading: 0, kind: 0 },
    ]),
  [T, bay0X + 0.5, apronZ - 0.2],
);
await camera(bay0X + 0.5, apronZ, 40, yaw - 0.7, 0.3);
await shot('b-engine-on-apron-with-car', 2000);
await hook(() => window.__slimcity.setVehicles([]));
await camera(bay0X, fire.z + 1 + 3 / T, 40, yaw + 0.5, 0.1);
await shot('b2-engine-at-bay-door', 2000);
await restore();

// Night: the panes and the door glazing are the lit face of each station.
// The clock is read when a snapshot arrives, so the sim must be running for the
// dusk to take hold.
await hook(() => window.__slimcity.setSpeed(1));
await hook(() => window.__slimcity.setDayT(0.96));
await camera(rowX, 99, 190, yaw, ROW_PITCH);
await shot('c-four-stations-night', 2500);
await camera(rowX, 99, 185, yaw + 0.15, ROW_PITCH - 0.2);
await shot('c2-four-stations-night-closer', 2500);

console.log('page errors', errors.length ? errors : 'none');
await browser.close();
