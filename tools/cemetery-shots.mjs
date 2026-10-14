/** Cemetery shots: the cemetery as grounds, the hearse beside an ambulance and
 * a car, and the health lens over a district with a body backlog.
 *
 * The page grows the small town the interaction tests use (tests/support/
 * town.ts), which has a cemetery on main street, and stores it as a save. A
 * second save is the same town with the cemetery bulldozed, Big Town reached
 * and bodies lying uncollected in one district, which is the one state the sim
 * leaves them there. The headstones and the parked vehicles are put on screen
 * through the dev hooks, since they depend on years of deaths and on traffic
 * a screenshot cannot wait for.
 *
 * Usage: node tools/cemetery-shots.mjs [baseUrl]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { closeUp, hooksReady, tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = 'tools/shots-cemetery';
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

const saves = await page.evaluate(async () => {
  const town = await import('/tests/support/town.ts');
  const sim = await import('/tests/support/sim.ts');
  const persist = await import('/src/app/persist.ts');
  const constants = await import('/src/shared/constants.ts');

  const built = town.buildTown();
  town.growTown(built, town.GROW_TICKS);
  built.h.sim.handleMessage({ type: 'requestSave' });
  await persist.storeSave(sim.latestSaveData(built.h));
  const withCemetery = (await persist.listSaves())[0].id;

  // The same town with its cemetery gone, Big Town reached and bodies lying
  // where they fell in the homes nearest the hospital.
  const standing = [...sim.standingBuildings(built.h).values()];
  const cemetery = standing.find((b) => b.catalogId === 'cemetery');
  built.h.sim.handleMessage({
    type: 'commands',
    seq: 9001,
    commands: [{ kind: 'bulldoze', tiles: [{ x: cemetery.x, z: cemetery.z }] }],
  });
  built.h.ticks(4);
  built.h.sim.handleMessage({ type: 'requestSave' });
  const payload = persist.decodeSave(sim.latestSaveData(built.h));
  payload.meta.stats.milestoneLevel = constants.BIG_TOWN_MILESTONE;
  // Two clusters on main street's frontage, inside the hospital's reach, so the
  // loss shows as a dip in coverage that is there.
  const homes = [
    { x: 100, z: 102, catalogId: 'tile' },
    { x: 101, z: 98, catalogId: 'tile' },
  ];
  const since = Math.max(0, payload.header.tick - 3 * constants.TICKS_PER_MONTH);
  const death = payload.meta.deathCare ?? {
    deathRemainder: 0,
    deaths: 0,
    reletRemainder: 0,
    relets: 0,
  };
  death.interments = [];
  death.backlog = homes.map((b) => ({
    tile: b.z * constants.MAP_SIZE + b.x,
    count: 60,
    sinceTick: since,
  }));
  payload.meta.deathCare = death;
  await persist.storeSave(persist.encodeSave(payload));
  const backlogSave = (await persist.listSaves())[0].id;
  return {
    withCemetery,
    backlogSave,
    cemetery: cemetery ? { id: cemetery.id, x: cemetery.x, z: cemetery.z } : null,
    homes: homes.map((b) => ({ x: b.x, z: b.z, catalogId: b.catalogId })),
    population: built.h.lastSnapshot().stats.population,
  };
});
console.log('saves', JSON.stringify(saves));

async function load(saveId) {
  await session({ screen: 'playing', seed: 0, mode: 'load', saveId });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#viewport canvas', { timeout: 30000 });
  await hooksReady(page);
  await page.waitForFunction(() => window.__slimcity.getStats().population > 0, null, {
    timeout: 30000,
  });
}
const hook = (fn, arg) => page.evaluate(fn, arg);
const camera = tileCamera(page);
const shot = async (name, settle = 1500) => {
  await page.waitForTimeout(settle);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
};

// --- the cemetery, the hearse and the street -------------------------------
await load(saves.withCemetery);
await hook(() => window.__slimcity.setDayT(0.5));
await hook(() => window.__slimcity.setSpeed(0));
const c = saves.cemetery;
// The town plants it with its back to main street; a player turns the lot to
// face the road, so do the same: rotation 2 puts the gate on the north side.
await hook(
  ([x, z]) => {
    window.__slimcity.cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
    window.__slimcity.cmd('Turn', [
      { kind: 'bulldoze', tiles: [{ x, z }] },
      { kind: 'placeBuilding', catalogId: 'cemetery', x, z, rotation: 2 },
    ]);
  },
  [c.x, c.z],
);
await page.waitForTimeout(1500);
c.id = await hook(
  ([x, z]) => {
    const g = window.__slimcity.readGrid();
    return g.buildingId[z * g.size + x];
  },
  [c.x, c.z],
);
console.log('cemetery id after turning', c.id);
await hook(([id, used]) => window.__slimcity.setInterments(id, used), [c.id, 420]);
// The default pitch (0.7) and yaw, the lot's street side toward the camera.
await camera(c.x + 1, c.z + 1, 200, 0, 0.7);
await shot('a-cemetery-default-pitch');
await camera(c.x + 1, c.z + 1, 90, 0, 0.7);
await shot('a2-cemetery-closer');
await camera(c.x + 1, c.z + 1, 230, Math.PI / 4, 0.7);
await shot('a3-cemetery-oblique');

// Pedestrian scale: the nearest the camera goes, over a section of graves, at
// twice the resolution. The tile is 20 m, so a 1.75 m person is the height of
// a headstone's shoulder and a gatehouse door is 2.1 m.
const restore = await closeUp(page, 2);
await camera(c.x + 0.2, c.z + 0.6, 40, Math.PI / 6, 0.45);
await shot('b-cemetery-pedestrian-scale', 2000);
await camera(c.x + 2.2, c.z + 2, 40, -Math.PI / 5, 0.4);
await shot('b2-cemetery-gatehouse', 2000);
await restore();

// A hearse, an ambulance and a car stopped on main street (z = 100).
const T = await hook(() => window.__slimcity.tileMeters());
const roadZ = (100 + 0.5) * T;
const startX = 70 * T;
await hook(
  ([z, x0, kinds]) =>
    window.__slimcity.setVehicles(
      kinds.map((kind, i) => ({ x: x0 + i * 10, z, heading: Math.PI / 2, kind })),
    ),
  // car, ambulance, hearse
  [roadZ, startX, [0, 5, 8]],
);
await camera(70.5, 100, 40, 0, 0.18);
await shot('c-hearse-ambulance-car');
await camera(70.5, 100, 40, Math.PI / 5, 0.3);
await shot('c2-hearse-ambulance-car-three-quarter');

// --- the health lens over a body backlog -----------------------------------
await load(saves.backlogSave);
await hook(() => window.__slimcity.setDayT(0.5));
await hook(() => window.__slimcity.setSpeed(4));
await page.waitForTimeout(12000);
await hook(() => window.__slimcity.setSpeed(0));
await hook(() => window.__slimcity.setOverlay(7));
const h0 = saves.homes[0];
await camera(h0.x, h0.z, 500, 0, 1.2);
await shot('d-health-lens-district');
await camera(h0.x, h0.z, 1600, 0, 1.2);
await shot('d2-health-lens-town');
await hook(() => window.__slimcity.setOverlay(null));
await camera(h0.x, h0.z, 300, 0, 0.7);
await shot('d3-district-no-lens');

console.log('stats', JSON.stringify(await hook(() => window.__slimcity.getStats())));
console.log('page errors', errors.length ? errors : 'none');
await browser.close();
