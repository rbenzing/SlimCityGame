/** Power-generation shots: the solar farm, gas turbine, combined-cycle station
 * and reactor of the interaction-test town (tests/support/town.ts), which already
 * stands one of each, plus the placements each check below needs.
 *
 * The page grows that town, stores it as a save and loads it. Shots: a gas
 * turbine beside a police station at the default pitch, a combined-cycle station
 * on the avenue with a car in shot, the reactor on the river bank seen low from
 * across the water with a tower beside it, a solar farm beside houses and a
 * second turned a quarter, a field of twenty farms (with the frame time read),
 * the reactor ghost over dry land, and all of them at night.
 *
 * Usage: node tools/power-shots.mjs [baseUrl]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { hooksReady, tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = 'tools/shots-power';
mkdirSync(out, { recursive: true });

// Frame time is read over the field, so the browser must not pin frames to the display's refresh.
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=default', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
});
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

await page.addInitScript(() => {
  try {
    localStorage.setItem('slimcity.settings', JSON.stringify({ sandboxUnlockAll: true }));
  } catch (e) {
    void e;
  }
});
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
  return { saveId, t: town.TOWN };
});
console.log('save', JSON.stringify(saved.t.reactor), JSON.stringify(saved.t.solarFarm));

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
const yaw = Number(process.env.POWER_YAW ?? 0);

await hook(() => window.__slimcity.setDayT(0.5));
await hook(() => window.__slimcity.setSpeed(0));
await hook(() => {
  window.__slimcity.cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
  window.__slimcity.cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
});
await page.waitForTimeout(800);

const T = await hook(() => window.__slimcity.tileMeters());
const grid = await hook(() => window.__slimcity.readGrid());
const N = grid.size;
const at = (x, z) => z * N + x;
const free = (x, z) =>
  x >= 2 &&
  z >= 2 &&
  x < N - 2 &&
  z < N - 2 &&
  !grid.buildingId[at(x, z)] &&
  !grid.roadTier[at(x, z)] &&
  !grid.water[at(x, z)];
const freeRect = (x, z, w, d, pad = 0) => {
  for (let dz = -pad; dz < d + pad; dz++)
    for (let dx = -pad; dx < w + pad; dx++) if (!free(x + dx, z + dz)) return false;
  return true;
};
const taken = [];
const place = (label, catalogId, x, z, rotation = 0) => {
  taken.push({ x, z });
  return hook(
    ([l, id, px, pz, r]) =>
      window.__slimcity.cmd(l, [
        { kind: 'placeBuilding', catalogId: id, x: px, z: pz, rotation: r },
      ]),
    [label, catalogId, x, z, rotation],
  );
};
const parkCar = (x, z, heading = Math.PI / 2) =>
  hook(
    ([cx, cz, h, tile]) =>
      window.__slimcity.setVehicles([{ x: cx * tile, z: cz * tile, heading: h, kind: 0 }]),
    [x, z, heading, T],
  );

// 1. A gas turbine and a police station, side by side north of a street, both 2x2, street side south.
const roadAt = (x, z) => x >= 0 && z >= 0 && x < N && z < N && grid.roadTier[at(x, z)] > 0;
let turbine = null;
for (let z = 40; z < 170 && !turbine; z++)
  for (let x = 50; x < 140 && !turbine; x++) {
    let road = true;
    for (let k = 0; k < 7; k++) if (!roadAt(x + k, z + 2)) road = false;
    if (road && freeRect(x - 1, z - 1, 9, 3)) turbine = { x, z };
  }
if (!turbine) throw new Error('no room beside a street for the turbine and the station');
await place('Turbine beside the station', 'gas-turbine', turbine.x, turbine.z);
await place('Police station', 'police-station', turbine.x + 4, turbine.z);

// 2. A combined-cycle station facing the avenue (x 90) from its east side: turned so its street side is west.
let cycle = null;
for (let z = 46; z < 66 && !cycle; z++) {
  let road = true;
  for (let k = 0; k < 4; k++) if (!roadAt(90, z + k)) road = false;
  if (road && freeRect(91, z - 1, 4, 6)) cycle = { x: 91, z };
}
if (!cycle) throw new Error('no room on the avenue for the combined-cycle station');
await place('Combined cycle on the avenue', 'combined-cycle', cycle.x, cycle.z, 3);

// 3. A tower on the river bank beside the town's reactor (x 91-96, z 75-79).
let tower = null;
for (let x = 97; x < 112 && !tower; x++)
  for (let z = 75; z < 80 && !tower; z++) if (freeRect(x, z, 2, 2, 1)) tower = { x, z };
if (tower) await place('Tower by the reactor', 'res-tower-1', tower.x, tower.z);
console.log(
  'turbine',
  JSON.stringify(turbine),
  'cycle',
  JSON.stringify(cycle),
  'tower',
  JSON.stringify(tower),
);

// 4. A solar farm beside houses and another turned a quarter.
const houses = await hook(() =>
  window.__slimcity.readBuildings().filter((b) => /^(house|res-low|res-)/.test(b.catalogId)),
);
console.log('houses', houses.length, JSON.stringify([...new Set(houses.map((h) => h.catalogId))]));
let farms = null;
for (const h of houses) {
  for (let r = 3; r < 14 && !farms; r++) {
    for (const [fx, fz] of [
      [h.x + 4, h.z - 3],
      [h.x - 9 - r, h.z - 3],
      [h.x - 3, h.z + 4],
      [h.x - 3, h.z - 9 - r],
    ]) {
      if (freeRect(fx, fz, 6, 6, 1) && freeRect(fx + 8, fz, 6, 6, 1)) {
        farms = { house: h, a: { x: fx, z: fz }, b: { x: fx + 8, z: fz } };
        break;
      }
    }
  }
  if (farms) break;
}
if (!farms) throw new Error('no room for solar farms beside any house');
await place('Solar farm', 'solar-farm', farms.a.x, farms.a.z, 0);
await place('Solar farm turned', 'solar-farm', farms.b.x, farms.b.z, 1);
console.log('farms', JSON.stringify(farms));

// 5. A field of twenty farms, east of the motorway, turned every which way.
const field = [];
for (let j = 0; j < 4; j++)
  for (let i = 0; i < 5; i++) field.push({ x: 160 + i * 7, z: 170 + j * 7, rotation: (i + j) % 4 });
for (const f of field)
  if (!freeRect(f.x, f.z, 6, 6)) throw new Error(`field tile taken ${f.x},${f.z}`);
for (const f of field) await place('Field farm', 'solar-farm', f.x, f.z, f.rotation);

await page.waitForTimeout(3500);
const placed = await hook(() =>
  window.__slimcity
    .readBuildings()
    .filter((b) =>
      ['solar-farm', 'gas-turbine', 'combined-cycle', 'nuclear-plant'].includes(b.catalogId),
    )
    .map((b) => `${b.catalogId}@${b.x},${b.z}`),
);
console.log('generators', placed.length, JSON.stringify(placed));

// Shot 1: the turbine beside the police station at the default pitch, a car on the street.
await parkCar(turbine.x + 3, turbine.z + 2.5);
await camera(turbine.x + 3, turbine.z + 1, 120, yaw, 0.7);
await shot('1-gas-turbine-beside-police-station', 2000);
await camera(turbine.x + 3, turbine.z + 1, 80, yaw + 0.6, 0.45);
await shot('1b-gas-turbine-three-quarter', 2000);

// Shot 2: the combined-cycle station on the avenue, a 4.0 m car in shot.
// The street side faces west onto the avenue, so the camera stands west of it, looking east.
await parkCar(cycle.x - 0.5, cycle.z + 1.5, 0);
await camera(cycle.x + 1, cycle.z + 1.5, 100, -Math.PI / 2, 0.5);
await shot('2-combined-cycle-on-the-avenue', 2000);
await camera(cycle.x - 0.5, cycle.z + 1.5, 45, -Math.PI / 2 + 0.3, 0.3);
await shot('2b-combined-cycle-car-for-scale', 2000);
await camera(cycle.x + 1.5, cycle.z + 1.5, 120, Math.PI / 2, 0.45);
await shot('2c-combined-cycle-from-behind', 2000);
await hook(() => window.__slimcity.setVehicles([]));

// Shot 3: the reactor from across the river, low, with the tower beside it, and its intake close.
const reactorX = saved.t.reactor.x + 3;
await camera(reactorX, 77, 200, Math.PI, 0.2);
await shot('3a-reactor-from-across-the-water', 2000);
await camera(reactorX, 77, 200, 0, 0.2);
await shot('3b-reactor-from-the-street-side', 2000);
await camera(reactorX - 1.5, 74.6, 60, Math.PI, 0.3);
await shot('3c-reactor-intake-close', 2000);
await camera(reactorX - 1.5, 74.6, 60, Math.PI + 0.9, 0.3);
await shot('3d-reactor-intake-close-angled', 2000);

// Shot 4: a farm beside houses, then the second turned a quarter.
await camera(farms.a.x + 7, farms.a.z + 3, 150, yaw, 0.6);
await shot('4-solar-farm-beside-houses', 2000);
await camera(farms.a.x + 7, farms.a.z + 3, 120, yaw + 1.6, 0.5);
await shot('4b-solar-farms-seen-turned', 2000);
await camera(farms.a.x + 3, farms.a.z + 5.5, 50, yaw, 0.4);
await shot('4c-solar-gate-track-and-skid', 2000);

// Shot 5: a field of twenty, and the frame time over the field against empty ground.
const frameTime = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const dts = [];
        let last = performance.now();
        const tick = (now) => {
          dts.push(now - last);
          last = now;
          if (dts.length < 180) requestAnimationFrame(tick);
          else {
            const s = dts.slice(20).sort((a, b) => a - b);
            const mean = s.reduce((a, b) => a + b, 0) / s.length;
            resolve({ meanMs: mean, p95Ms: s[Math.floor(s.length * 0.95)], frames: s.length });
          }
        };
        requestAnimationFrame(tick);
      }),
  );
await camera(178, 184, 420, yaw + 0.4, 0.6);
await shot('5-field-of-twenty-solar-farms', 2500);
const over = await frameTime();
await camera(220, 70, 420, yaw + 0.4, 0.6);
await page.waitForTimeout(2000);
const empty = await frameTime();
await camera(178, 184, 420, yaw + 0.4, 0.6);
await page.waitForTimeout(2000);
const over2 = await frameTime();
console.log('frame time over the field', JSON.stringify(over), JSON.stringify(over2));
console.log('frame time over empty ground', JSON.stringify(empty));
await camera(178, 184, 150, yaw + 0.4, 0.45);
await shot('5b-field-closer', 2000);

// Shot 6: the reactor ghost over dry land.
let dry = null;
for (let x = 160; x < 240 && !dry; x += 3)
  for (let z = 100; z < 160 && !dry; z += 3) if (freeRect(x, z, 6, 5, 2)) dry = { x, z };
await hook(() => window.__slimcity.setTool('plop.nuclear-plant'));
await camera(dry.x + 3, dry.z + 2.5, 200, yaw, 0.7);
await page.waitForTimeout(800);
await page.mouse.move(640, 400, { steps: 6 });
await page.mouse.move(645, 402, { steps: 3 });
await shot('6-nuclear-ghost-over-dry-land', 1500);
await hook(() => window.__slimcity.setTool('select'));
// The commit over the same dry land, which the world refuses for having no water beside it.
await hook(
  (d) =>
    window.__slimcity.cmd('Reactor on dry land', [
      { kind: 'placeBuilding', catalogId: 'nuclear-plant', x: d.x, z: d.z, rotation: 0 },
    ]),
  dry,
);
await page.waitForTimeout(1200);
const afterDry = await hook(
  (d) =>
    window.__slimcity.readBuildings().filter((b) => b.catalogId === 'nuclear-plant' && b.x === d.x),
  dry,
);
console.log('reactor on dry land stands after the commit:', afterDry.length > 0);
await shot('6b-nuclear-commit-over-dry-land', 500);

// Shot 7: night. None of the new kits lights.
await hook(() => window.__slimcity.setSpeed(1));
await hook(() => window.__slimcity.setDayT(0.96));
await camera(turbine.x + 3, turbine.z + 1, 110, yaw + 0.3, 0.5);
await shot('7a-turbine-night', 2500);
await camera(farms.a.x + 7, farms.a.z + 3, 150, yaw, 0.55);
await shot('7b-solar-night', 2500);
await camera(saved.t.reactor.x + 3, 77, 200, Math.PI, 0.3);
await shot('7c-reactor-night', 2500);
await camera(cycle.x + 1.5, cycle.z + 2, 130, yaw + 1.5, 0.5);
await shot('7d-combined-cycle-night', 2500);

console.log('page errors', errors.length ? errors : 'none');
await browser.close();
