/** Earliest-kits shots: the coal plant, incinerator, MRF, transfer station and
 * recycling depot drawn by their kits along the north kerb of a street, and
 * the three shore kits (pumping station, sewage works, drain) on the bank of
 * a pond dug south of it. Each at the default pitch beside the 4 m car, the
 * coal plant and the incinerator from the street and from the yard, and the
 * same at night.
 *
 * Usage: node tools/earliest-kits-shots.mjs [baseUrl]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { hooksReady, tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = 'tools/shots-earliest-kits';
mkdirSync(out, { recursive: true });

const RT = { TwoLane: 1 };

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

// A dry, flat block: 40 tiles along the street, 10 rows north of it for the
// plants and 12 south for the shore kits and their pond.
const g0 = await hook(() => window.__slimcity.readGrid());
const N = g0.size;
const idx = (x, z) => z * N + x;
let anchor = null;
for (let z = 40; z < N - 40 && !anchor; z++) {
  for (let x = 40; x < N - 60; x++) {
    let ok = true;
    for (let k = -2; k < 40 && ok; k++) {
      for (let dz = -10; dz <= 12 && ok; dz++) {
        const i = idx(x + k, z + dz);
        if (g0.water[i] || g0.height[i] < 2 || g0.height[i] > 22) ok = false;
      }
    }
    if (ok) anchor = { x, z };
  }
}
if (!anchor) {
  console.log('no dry block found');
  await browser.close();
  process.exit(1);
}
const { x: X, z: Z } = anchor;
console.log('anchor', JSON.stringify(anchor));

await hook(() => window.__slimcity.setDayT(0.5));
await hook(() => window.__slimcity.setSpeed(0));
await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
await page.waitForTimeout(300);

// The block as a low plateau with a pond dug south of the street: the bank
// drops 3.5 m in one tile, inside MAX_BUILD_SLOPE, so the shore kits have
// water on their south edge and ground they may stand on.
await hook(
  ([x, z, w, h, pondRow]) => {
    const heights = new Float32Array(w * h);
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) heights[row * w + col] = row >= pondRow ? -1.5 : 2.0;
    }
    window.__slimcity.cmd('Pond', [{ kind: 'terraformSet', x, z, w, h, heights }]);
  },
  [X - 3, Z - 12, 44, 23, 17],
);
await page.waitForTimeout(1500);

const row = (z, tier, x0, x1) =>
  cmd('Road', [
    {
      kind: 'buildRoad',
      tier,
      tiles: Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, z })),
    },
  ]);
await row(Z, RT.TwoLane, X - 1, X + 36);
await page.waitForTimeout(800);

const place = (catalogId, x, z, rotation) =>
  cmd(catalogId, [{ kind: 'placeBuilding', catalogId, x, z, rotation }]);
// North of the street, their street side (local +Z) on the kerb.
const sites = {
  coal: { id: 'coal-plant', x: X + 1, z: Z - 4, w: 4, d: 4 },
  incinerator: { id: 'incinerator', x: X + 6, z: Z - 4, w: 4, d: 4 },
  mrf: { id: 'materials-recovery-facility', x: X + 11, z: Z - 6, w: 5, d: 6 },
  transfer: { id: 'transfer-station', x: X + 17, z: Z - 5, w: 4, d: 5 },
  depot: { id: 'recycling-depot', x: X + 22, z: Z - 3, w: 2, d: 3 },
  // South of the street, on the pond's north bank.
  pump: { id: 'water-pump', x: X + 1, z: Z + 3, w: 2, d: 2 },
  works: { id: 'sewage-works', x: X + 7, z: Z + 3, w: 2, d: 2 },
  drain: { id: 'water-drain', x: X + 13, z: Z + 4, w: 1, d: 1 },
};
for (const s of Object.values(sites)) await place(s.id, s.x, s.z, 0);
await page.waitForTimeout(1200);

const standing = await hook(() =>
  window.__slimcity
    .readBuildings()
    .filter((b) =>
      [
        'coal-plant',
        'incinerator',
        'materials-recovery-facility',
        'transfer-station',
        'recycling-depot',
        'water-pump',
        'sewage-works',
        'water-drain',
      ].includes(b.catalogId),
    )
    .map((b) => `${b.catalogId}@${b.x},${b.z}r${b.rotation}`),
);
console.log('standing', JSON.stringify(standing));

const T = await hook(() => window.__slimcity.tileMeters());
// Cars on the street for scale, one before each kit.
await hook(
  ([tile, x, z]) =>
    window.__slimcity.setVehicles(
      [3, 8, 13.5, 19, 23, 2, 8, 13.5].map((dx, i) => ({
        x: (x + dx) * tile,
        z: (z + (i % 2 ? 0.35 : 0.65)) * tile,
        heading: i % 2 ? -Math.PI / 2 : Math.PI / 2,
        kind: 0,
      })),
    ),
  [T, X, Z],
);

// The camera centres on the tile it is given: a lot's centre is its origin
// tile plus half its size less a half.
const PITCH = 0.6;
const centre = (s) => ({ x: s.x + s.w / 2 - 0.5, z: s.z + s.d / 2 - 0.5 });
const c = Object.fromEntries(Object.entries(sites).map(([k, s]) => [k, centre(s)]));
const views = [
  ['a-coal-street', c.coal.x, c.coal.z + 0.5, 200, 0, PITCH],
  ['a2-coal-yard', c.coal.x, c.coal.z - 0.5, 200, Math.PI, PITCH],
  ['b-incinerator-street', c.incinerator.x, c.incinerator.z + 0.5, 200, 0, PITCH],
  ['b2-incinerator-yard', c.incinerator.x, c.incinerator.z - 0.5, 200, Math.PI, PITCH],
  ['c-mrf-street', c.mrf.x, c.mrf.z + 0.5, 220, 0, PITCH],
  // The bale docks stand on the hall's east face, seen from the bale yard.
  ['c2-mrf-docks', c.mrf.x + 0.35, c.mrf.z - 1.7, 70, Math.PI / 2, 0.4],
  ['d-transfer-street', c.transfer.x, c.transfer.z + 0.5, 190, 0, PITCH],
  // The hall stands at the lot's back-left; its open doors face the street.
  ['d2-transfer-doors', c.transfer.x - 1.1, c.transfer.z + 0.15, 85, 0.25, 0.35],
  ['e-depot-street', c.depot.x, c.depot.z + 0.3, 95, 0, PITCH],
  ['f-pump-street', c.pump.x, c.pump.z - 0.3, 85, Math.PI, PITCH],
  ['f2-pump-water', c.pump.x, c.pump.z + 0.5, 85, 0, PITCH],
  ['g-works-street', c.works.x, c.works.z - 0.3, 85, Math.PI, PITCH],
  ['g2-works-water', c.works.x, c.works.z + 0.5, 85, 0, PITCH],
  ['h-drain-street', c.drain.x, c.drain.z - 0.2, 48, Math.PI, PITCH],
  ['h2-drain-water', c.drain.x, c.drain.z + 0.3, 48, 0.4, 0.5],
];
for (const [name, tx, tz, d, yaw, pitch] of views) {
  await camera(tx, tz, d, yaw, pitch);
  await shot(name);
}

await hook(() => window.__slimcity.setDayT(0.96));
await cmd('Phase', [{ kind: 'setUnlimitedMoney', on: true }]);
await page.waitForTimeout(2000);
for (const [name, tx, tz, d, yaw, pitch] of [
  ['n-coal-night', c.coal.x, c.coal.z + 0.5, 150, 0, PITCH],
  ['n2-incinerator-night', c.incinerator.x, c.incinerator.z + 0.5, 150, 0, PITCH],
  ['n3-mrf-night', c.mrf.x, c.mrf.z + 0.5, 190, 0, PITCH],
  ['n4-transfer-night', c.transfer.x, c.transfer.z + 0.5, 160, 0, PITCH],
  ['n5-depot-night', c.depot.x, c.depot.z + 0.3, 95, 0, PITCH],
  ['n6-pump-night', c.pump.x, c.pump.z - 0.3, 85, Math.PI, PITCH],
  ['n7-works-night', c.works.x, c.works.z - 0.3, 85, Math.PI, PITCH],
  ['n8-drain-night', c.drain.x, c.drain.z - 0.2, 48, Math.PI, PITCH],
]) {
  await camera(tx, tz, d, yaw, pitch);
  await shot(name, 2500);
}

console.log('page errors', errors.length ? errors : 'none');
await browser.close();
