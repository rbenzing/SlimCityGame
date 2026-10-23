/** Parks shots: the five rungs of the open-space ladder in a row along one
 * street, the sports ground's pitch at street scale, a district park fresh
 * and worn, its plate against the footway, the land-value lens over one
 * district park and over six pocket parks on the same ground, a civic plaza
 * between two towers, and a district park on a slope where the ground has one.
 *
 * A dry flat strip is found on the seed map and a two-lane street laid along
 * its north edge; every park stands on that street, turned to face it. The
 * worn lawn is put on screen through the dev hook, since it depends on a
 * crowd a screenshot cannot wait for.
 *
 * Usage: node tools/parks-shots.mjs [baseUrl]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { hooksReady, tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = 'tools/shots-parks';
mkdirSync(out, { recursive: true });

const RT = { TwoLane: 1 };
/** The default camera pitch, which the ladder and the plaza are judged at. */
const PITCH = 0.7;
/** The land-value field's lens id. */
const LAND_VALUE_LENS = 0;

// The ladder, west to east, each rung's footprint and the gap before it.
const RUNGS = [
  { name: 'pocket', id: 'small-park', w: 1, d: 1 },
  { name: 'plaza', id: 'civic-plaza', w: 5, d: 5 },
  { name: 'neighbourhood', id: 'neighbourhood-park', w: 9, d: 9 },
  { name: 'district', id: 'district-park', w: 20, d: 20 },
  // The pitch's long side along the street.
  { name: 'sports', id: 'sports-ground', w: 6, d: 4 },
];
const GAP = 2;
// The tallest ploppable that is a building: a zoned tower only grows, so
// placing one by id puts nothing on the ground.
const TOWER = { id: 'hospital', w: 5, d: 3 };
const PLAZA = RUNGS.find((r) => r.name === 'plaza');
// The ladder street, then the plaza-and-towers street further south.
const LADDER_W = RUNGS.reduce((n, r) => n + r.w + GAP, GAP);
const DEEPEST = Math.max(...RUNGS.map((r) => r.d));
const TOWERS_ROW = DEEPEST + 4;
const STRIP_W = LADDER_W + 2;
const STRIP_D = TOWERS_ROW + Math.max(TOWER.d, PLAZA.d) + 2;

const browser = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => {
  try {
    sessionStorage.setItem(
      'slimcity.session',
      JSON.stringify({ screen: 'playing', seed: 12345, mode: 'new' }),
    );
  } catch (e) {
    void e;
  }
});
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#viewport canvas', { timeout: 30000 });
await hooksReady(page);
await page.waitForTimeout(3000);

const hook = (fn, arg) => page.evaluate(fn, arg);
const cmd = (label, commands) => hook(([l, c]) => window.__slimcity.cmd(l, c), [label, commands]);
const camera = tileCamera(page);
const shot = async (name, settle = 1800) => {
  await page.waitForTimeout(settle);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
};
const fail = async (why) => {
  console.log(why);
  await browser.close();
  process.exit(1);
};

// A dry, flat strip for the two streets and everything on them.
const g0 = await hook(() => window.__slimcity.readGrid());
const N = g0.size;
const idx = (x, z) => z * N + x;
const dryFlat = (x, z, w, d) => {
  for (let dz = -1; dz <= d; dz++) {
    for (let dx = -1; dx <= w; dx++) {
      const i = idx(x + dx, z + dz);
      if (g0.water[i] || Math.abs(g0.height[i]) > 22) return false;
    }
  }
  return true;
};
let anchor = null;
for (let z = 20; z < N - STRIP_D - 20 && !anchor; z++) {
  for (let x = 20; x < N - STRIP_W - 20 && !anchor; x++) {
    if (dryFlat(x, z, STRIP_W, STRIP_D)) anchor = { x, z };
  }
}
if (!anchor) await fail('no dry strip found');
const { x: X, z: Z } = anchor;
console.log('anchor', JSON.stringify(anchor));

await hook(() => window.__slimcity.setDayT(0.5));
await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
await page.waitForTimeout(300);

const road = (tiles) => cmd('Road', [{ kind: 'buildRoad', tier: RT.TwoLane, tiles }]);
const row = (z, from, to) =>
  road(Array.from({ length: to - from + 1 }, (_, i) => ({ x: from + i, z })));
// Rotation 2 turns a lot's street side to the north, where its street is.
const place = (catalogId, x, z, rotation = 2) =>
  cmd(catalogId, [{ kind: 'placeBuilding', catalogId, x, z, rotation }]);
const buildingAt = (x, z) =>
  hook(
    ([px, pz]) => {
      const g = window.__slimcity.readGrid();
      return g.buildingId[pz * g.size + px];
    },
    [x, z],
  );

// --- the ladder along the street at row Z, each rung's north edge on it ----
await row(Z, X, X + LADDER_W);
let cursor = X + GAP;
for (const r of RUNGS) {
  r.x = cursor;
  r.z = Z + 1;
  await place(r.id, r.x, r.z);
  cursor += r.w + GAP;
}
// --- the plaza between two towers on the street at row Z + TOWERS_ROW -------
const towersZ = Z + TOWERS_ROW;
const plazaX = X + GAP + TOWER.w + 1;
await row(towersZ, X, X + GAP + TOWER.w + 1 + PLAZA.w + 1 + TOWER.w + GAP);
await place(TOWER.id, X + GAP, towersZ + 1);
await place(PLAZA.id, plazaX, towersZ + 1);
await place(TOWER.id, plazaX + PLAZA.w + 1, towersZ + 1);
await page.waitForTimeout(1200);

for (const r of RUNGS) r.building = await buildingAt(r.x, r.z);
console.log('placed', JSON.stringify(RUNGS.map((r) => `${r.id}@${r.x},${r.z} id ${r.building}`)));
if (RUNGS.some((r) => !r.building)) await fail('a rung did not land');

// Let the first service pass find the parks, then hold the city still.
await hook(() => window.__slimcity.setSpeed(4));
await page.waitForTimeout(5000);
await hook(() => window.__slimcity.setSpeed(0));
await page.waitForTimeout(1000);

const T = await hook(() => window.__slimcity.tileMeters());
const centre = (r) => [r.x + r.w / 2 - 0.5, r.z + r.d / 2 - 0.5];
const district = RUNGS.find((r) => r.name === 'district');
const sports = RUNGS.find((r) => r.name === 'sports');

// 1. All five rungs in a row, from the street side at the default pitch, then
// each rung close enough to read on its own.
await camera(X + LADDER_W / 2, Z + DEEPEST / 2, 900, 0, PITCH);
await shot('ladder');
for (const r of RUNGS) {
  const [cx, cz] = centre(r);
  await camera(cx, cz, Math.max(60, (Math.max(r.w, r.d) + 2) * T * 1.1), 0, PITCH);
  await shot(r.name);
}

// 2. The pitch beside the street, a car in the eastbound lane for scale.
await hook(
  ([tile, x, z]) =>
    window.__slimcity.setVehicles([
      { x: (x + 0.5) * tile, z: (z + 0.5) * tile + 1.875, heading: Math.PI / 2, kind: 0 },
    ]),
  [T, sports.x + 1, Z],
);
await camera(sports.x + sports.w / 2 - 0.5, Z + 0.5, 110, 0, 0.45);
await shot('pitch-scale');
await hook(() => window.__slimcity.setVehicles([]));

// 3. The district park at load 0.5 and at load 3, same camera and light. The
// hook holds until a snapshot carries park loads, and no command is sent
// between the hook and its shot.
const [dx, dz] = centre(district);
for (const load of [0.5, 3]) {
  await camera(dx, dz, 420, 0, PITCH);
  await hook(([id, l]) => window.__slimcity.setParkLoad(id, l), [district.building, load]);
  await shot(`district-load-${load}`);
}
// The lawn back to fresh for everything after.
await hook(([id]) => window.__slimcity.setParkLoad(id, 0), [district.building]);

// 4. The district park against the street, low along the shared edge.
await camera(district.x + district.w / 2, Z + 0.5, 45, Math.PI / 2, 0.2);
await shot('district-road-edge');

// The pond, which lands on the lowest lattice sample inside the ring path: on
// a flat strip that is the park's north-east corner.
await camera(district.x + district.w - 3, district.z + 2, 120, 0, 0.6);
await shot('district-pond');

// 6. The plaza between the two towers, from the street at the default pitch.
await camera(plazaX + PLAZA.w / 2 - 0.5, towersZ + 1 + PLAZA.d / 2, 220, 0, PITCH);
await shot('plaza-towers');

// 5. The land-value lens over the district park, then over six pocket parks on
// the same ground: a street through its middle so each pocket has a road to
// serve from, three to its north and three to its south.
const overlayCamera = () => camera(dx, dz, 700, 0, 1.2);
await hook((lens) => window.__slimcity.setOverlay(lens), LAND_VALUE_LENS);
await overlayCamera();
await shot('overlay-district');
await hook(() => window.__slimcity.setOverlay(null));
await cmd('Clear', [{ kind: 'bulldoze', tiles: [{ x: district.x, z: district.z }] }]);
await page.waitForTimeout(600);
const midZ = district.z + Math.floor(district.d / 2);
await row(midZ, district.x, district.x + district.w - 1);
const pockets = [];
for (const px of [3, 10, 16]) {
  pockets.push({ x: district.x + px, z: midZ - 1 });
  pockets.push({ x: district.x + px, z: midZ + 1 });
}
for (const p of pockets) await place('small-park', p.x, p.z, p.z < midZ ? 0 : 2);
await page.waitForTimeout(1200);
const pocketIds = [];
for (const p of pockets) pocketIds.push(await buildingAt(p.x, p.z));
console.log('pockets', JSON.stringify(pocketIds));
if (pocketIds.some((id) => !id)) await fail('a pocket park did not land');
// The field settles over a few service passes.
await hook(() => window.__slimcity.setSpeed(4));
await page.waitForTimeout(6000);
await hook(() => window.__slimcity.setSpeed(0));
await hook((lens) => window.__slimcity.setOverlay(lens), LAND_VALUE_LENS);
await overlayCamera();
await shot('overlay-pockets');
await hook(() => window.__slimcity.setOverlay(null));

// A district park on a slope, where the map has a dry one that is not a
// cliff: the gentlest-stepped 22-row patch with the widest rise across it.
let slope = null;
let bestRise = 0;
const SLOPE_W = district.w + 2;
const SLOPE_D = district.d + 2;
for (let z = 20; z < N - SLOPE_D - 20; z++) {
  for (let x = 20; x < N - SLOPE_W - 20; x++) {
    let lo = Infinity;
    let hi = -Infinity;
    let step = 0;
    let bad = false;
    for (let pz = 0; pz < SLOPE_D && !bad; pz++) {
      for (let px = 0; px < SLOPE_W; px++) {
        const i = idx(x + px, z + pz);
        if (g0.water[i] || g0.buildingId[i] || g0.roadTier[i]) {
          bad = true;
          break;
        }
        const h = g0.height[i];
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
        if (px > 0) step = Math.max(step, Math.abs(h - g0.height[idx(x + px - 1, z + pz)]));
        if (pz > 0) step = Math.max(step, Math.abs(h - g0.height[idx(x + px, z + pz - 1)]));
      }
    }
    if (bad || step > 3) continue;
    if (hi - lo > bestRise) {
      bestRise = hi - lo;
      slope = { x, z };
    }
  }
}
if (slope && bestRise >= 6) {
  console.log('slope', JSON.stringify(slope), 'rise', bestRise);
  await row(slope.z, slope.x, slope.x + SLOPE_W - 1);
  await place(district.id, slope.x + 1, slope.z + 1);
  await page.waitForTimeout(1200);
  const id = await buildingAt(slope.x + 1, slope.z + 1);
  if (id) {
    await camera(slope.x + 1 + district.w / 2, slope.z + 1 + district.d / 2, 420, 0, PITCH);
    await shot('district-slope');
    await camera(slope.x + 1 + district.w / 2, slope.z + 1 + district.d / 2, 300, Math.PI / 2, 0.3);
    await shot('district-slope-side');
  } else console.log('district-slope: the park did not land on the slope');
} else console.log('district-slope: no slope found, rise', bestRise);

console.log('page errors', errors.length ? errors : 'none');
await browser.close();
if (errors.length) process.exit(1);
