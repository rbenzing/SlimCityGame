/** Tramway shots: the street tramway as a street a car and a tram share, and
 * the guideway as a monorail over a street that keeps its traffic. Four
 * east–west roads on a dry strip — the Tramway preset, a two-lane street
 * composed with mixed running, an avenue composed with a reservation (its
 * guideway, with a cross street passing under it at a junction), and a mixed
 * street tramway running on into a reservation, so the guideway ramps up from
 * the street — each with a tram depot and a turbine on its north kerb and a
 * tram line down it, so trams field. Each at the default pitch from the street
 * and close up, the junction under the guideway, and the two street tramways
 * and the guideway again at night.
 *
 * Usage: node tools/tramway-shots.mjs [baseUrl]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { closeUp, hooksReady, tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = 'tools/shots-tramways';
mkdirSync(out, { recursive: true });

const RT = { TwoLane: 1, Avenue: 2, Tram: 10 };
const FIRST_CUSTOM = 13;
const presets = JSON.parse(readFileSync('src/data/roads.json', 'utf8')).specs;
const presetOf = (tier) => presets.find((s) => s.tier === tier).profile;
// Mixed running is a flag on the lanes the street already has.
const mixed = {
  ...presetOf(RT.TwoLane),
  pieces: presetOf(RT.TwoLane).pieces.map((p) => (p.kind === 'travel' ? { ...p, tram: true } : p)),
};
// A reservation of two tracks down the middle of a four-lane arterial that
// keeps its lanes: the two 1.2 m pieces are the median the guideway's columns
// stand in.
const TRAM_PIECE_M = 1.2;
const LANE_M = 3.3;
const reserved = {
  class: 'arterial',
  kerbs: true,
  pieces: [
    { kind: 'sidewalk', width: 1.875 },
    { kind: 'travel', width: LANE_M, flow: 'back' },
    { kind: 'travel', width: LANE_M, flow: 'back' },
    { kind: 'tram', width: TRAM_PIECE_M, flow: 'back' },
    { kind: 'tram', width: TRAM_PIECE_M, flow: 'fwd' },
    { kind: 'travel', width: LANE_M, flow: 'fwd' },
    { kind: 'travel', width: LANE_M, flow: 'fwd' },
    { kind: 'sidewalk', width: 1.875 },
  ],
};
/** The inner eastbound general lane's centre, south of the reservation. */
const RESERVED_EAST_LANE = TRAM_PIECE_M + LANE_M / 2;

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

// A dry, flat strip to build the three roads across.
const g0 = await hook(() => window.__slimcity.readGrid());
const N = g0.size;
const idx = (x, z) => z * N + x;
let anchor = null;
for (let z = 40; z < N - 40 && !anchor; z++) {
  for (let x = 40; x < N - 60; x++) {
    let ok = true;
    for (let k = 0; k < 44 && ok; k++) {
      for (let dz = -10; dz <= 17 && ok; dz++) {
        const i = idx(x + k, z + dz);
        if (g0.water[i] || Math.abs(g0.height[i]) > 22) ok = false;
      }
    }
    if (ok) anchor = { x, z };
  }
}
if (!anchor) {
  console.log('no dry strip found');
  await browser.close();
  process.exit(1);
}
const { x: X, z: Z } = anchor;
console.log('anchor', JSON.stringify(anchor));

await hook(() => window.__slimcity.setDayT(0.5));
await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
await cmd('Profiles', [
  { kind: 'defineRoadProfile', id: FIRST_CUSTOM, profile: mixed },
  { kind: 'defineRoadProfile', id: FIRST_CUSTOM + 1, profile: reserved },
]);
await page.waitForTimeout(300);

const road = (tier, tiles, profile) =>
  cmd('Road', [{ kind: 'buildRoad', tier, tiles, ...(profile ? { profile } : {}) }]);
const row = (z, tier, profile, from = 0, to = 40) =>
  road(
    tier,
    Array.from({ length: to - from + 1 }, (_, i) => ({ x: X + from + i, z })),
    profile,
  );
// The Tramway on row Z, the composed mixed street seven rows north, the
// reservation seven rows south, and seven rows further the street tramway
// that runs on into a reservation at RAMP_FROM.
const RAMP_FROM = 13;
const ROWS = [
  { name: 'tramway', z: Z, tier: RT.Tram },
  { name: 'mixed', z: Z - 7, tier: RT.TwoLane, profile: FIRST_CUSTOM },
  { name: 'reserved', z: Z + 7, tier: RT.Avenue, profile: FIRST_CUSTOM + 1 },
  { name: 'ramp', z: Z + 14, tier: RT.TwoLane, profile: FIRST_CUSTOM },
];
for (const r of ROWS) {
  if (r.name === 'ramp') {
    await row(r.z, RT.TwoLane, FIRST_CUSTOM, 0, RAMP_FROM - 1);
    await row(r.z, RT.Avenue, FIRST_CUSTOM + 1, RAMP_FROM, 40);
  } else await row(r.z, r.tier, r.profile);
}
// A plain street crossing the reservation at a junction, passing under the guideway.
const CROSS_AT = 26;
const reservedZ = ROWS.find((r) => r.name === 'reserved').z;
await road(
  RT.TwoLane,
  Array.from({ length: 11 }, (_, i) => ({ x: X + CROSS_AT, z: reservedZ - 5 + i })),
);
await page.waitForTimeout(800);

const place = (catalogId, x, z, rotation) =>
  cmd(catalogId, [{ kind: 'placeBuilding', catalogId, x, z, rotation }]);
for (const [i, r] of ROWS.entries()) {
  await place('wind-turbine', X + 1, r.z - 1, 0);
  await place('tram-depot', X + 34, r.z - 3, 0);
  await cmd('Tram line', [
    {
      kind: 'createTransitLine',
      line: {
        id: i,
        color: [0x3cb45a, 0xef5350, 0x42a5f5, 0xffb300][i],
        mode: 'tram',
        // The ramp's line runs from the street up onto the guideway.
        stops: [
          { x: X + 6, z: r.z },
          { x: X + (r.name === 'ramp' ? 30 : 16), z: r.z },
        ],
      },
    },
  ]);
}
await page.waitForTimeout(800);

const grid = await hook(() => window.__slimcity.readGrid());
for (const r of ROWS) {
  const i = idx(X + 10, r.z);
  console.log(r.name, 'tier', grid.roadTier[i], 'profile', grid.roadProfile[i]);
}
const depots = await hook(() =>
  window.__slimcity
    .readBuildings()
    .filter((b) => b.catalogId === 'tram-depot')
    .map((b) => `${b.catalogId}@${b.x},${b.z} state ${b.state}`),
);
console.log('depots', JSON.stringify(depots));

// Let the depots field their trams, then hold the city still for the shots.
await hook(() => window.__slimcity.setSpeed(1));
await page.waitForTimeout(6000);
await hook(() => window.__slimcity.setSpeed(0));
await page.waitForTimeout(1000);
console.log(
  'transit render',
  JSON.stringify(await hook(() => window.__slimcity.readTransitRender())),
);
console.log('furniture', JSON.stringify(await hook(() => window.__slimcity.readFurnitureCounts())));

const T = await hook(() => window.__slimcity.tileMeters());
// A car in each road's eastbound lane beside the camera's subject, for scale.
const placeCars = () =>
  hook(
    ([tile, x, rows]) =>
      window.__slimcity.setVehicles(
        rows.map(([z, across]) => ({
          x: (x + 11.5) * tile,
          z: (z + 0.5) * tile + across,
          heading: Math.PI / 2,
          kind: 0,
        })),
      ),
    // The middle of the eastbound general lane: the tram's own on the street
    // tramways, the one beside the reservation on the avenue.
    [T, X, ROWS.map((r) => [r.z, r.name === 'reserved' ? RESERVED_EAST_LANE : 1.875])],
  );
await placeCars();

// A line's trams are drawn under the transit lens, as every line's vehicles are.
await hook(() => window.__slimcity.setOverlay('transit'));
const PITCH = 0.7;
const views = [];
for (const r of ROWS) {
  // The ramp is framed on the reservation's first five tiles, where it climbs.
  const at = r.name === 'ramp' ? RAMP_FROM + 2 : 11;
  views.push([`${r.name}-line`, X + at, r.z, 150, Math.PI, PITCH]);
  views.push([`${r.name}-street`, X + at, r.z, 60, Math.PI, PITCH]);
  views.push([`${r.name}-close`, X + at + 0.5, r.z, 40, Math.PI - 0.5, 0.4]);
}
// The cross street passing under the guideway at its junction, from the street
// and from low down beside it.
views.push(['reserved-junction', X + CROSS_AT, reservedZ, 70, Math.PI - 0.6, PITCH]);
views.push(['reserved-junction-low', X + CROSS_AT, reservedZ, 40, Math.PI - 0.9, 0.25]);
for (const [name, tx, tz, d, yaw, pitch] of views) {
  await camera(tx, tz, d, yaw, pitch);
  await shot(name);
}
// Fine detail: the slab, rails and grooves over the same ground, at twice the
// pixels, with the lens off so nothing is laid over the paving.
await hook(() => window.__slimcity.setOverlay(null));
const restore = await closeUp(page, 2);
await camera(X + 11.5, Z, 40, Math.PI - 0.5, 0.55);
await shot('tramway-rails-detail');
await restore();
// The guideway's structure and the median under it, and the ramp down to the
// street tramway, with nothing laid over the paving.
const rampZ = ROWS.find((r) => r.name === 'ramp').z;
for (const [name, tx, tz, d, yaw, pitch] of [
  ['guideway-structure', X + 11.5, reservedZ, 40, Math.PI - 0.5, 0.4],
  ['guideway-from-above', X + 11, reservedZ, 50, Math.PI, 1.2],
  ['guideway-ramp', X + RAMP_FROM + 1, rampZ, 70, Math.PI - 0.9, 0.3],
]) {
  await camera(tx, tz, d, yaw, pitch);
  await shot(name);
}

// The night, before the trams pull in at 23:00: the clock is applied by the
// next snapshot, which a command sends, and the cars go back after it.
await hook(() => window.__slimcity.setOverlay('transit'));
await hook(() => window.__slimcity.setDayT(0.9));
await cmd('Phase', [{ kind: 'setUnlimitedMoney', on: true }]);
await page.waitForTimeout(2000);
await placeCars();
for (const r of ROWS.slice(0, 3)) {
  await camera(X + 11, r.z, 150, Math.PI, PITCH);
  await shot(`${r.name}-night-line`, 2500);
  await camera(X + 11, r.z, 60, Math.PI, PITCH);
  await shot(`${r.name}-night`, 2500);
}

console.log('page errors', errors.length ? errors : 'none');
await browser.close();
