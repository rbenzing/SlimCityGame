/** Tramway shots: the street tramway as a street a car and a tram share. Three
 * east–west roads on a dry strip — the Tramway preset, a two-lane street
 * composed with mixed running, and an avenue composed with a reservation (at
 * grade until it is lifted onto its guideway) — each with a tram depot and a
 * turbine on its north kerb and a tram line down it, so trams field. Each at
 * the default pitch from the street and close up, and the two street tramways
 * again at night.
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
// A reservation of two tracks down the middle, one general lane each way.
const reserved = {
  class: 'arterial',
  kerbs: true,
  pieces: [
    { kind: 'sidewalk', width: 1.875 },
    { kind: 'travel', width: 3.75, flow: 'back' },
    { kind: 'tram', width: 3.5, flow: 'back' },
    { kind: 'tram', width: 3.5, flow: 'fwd' },
    { kind: 'travel', width: 3.75, flow: 'fwd' },
    { kind: 'sidewalk', width: 1.875 },
  ],
};

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
      for (let dz = -10; dz <= 10 && ok; dz++) {
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

const row = (z, tier, profile) =>
  cmd('Road', [
    {
      kind: 'buildRoad',
      tier,
      tiles: Array.from({ length: 41 }, (_, i) => ({ x: X + i, z })),
      ...(profile ? { profile } : {}),
    },
  ]);
// The Tramway on row Z, the composed mixed street seven rows north, the
// reservation seven rows south.
const ROWS = [
  { name: 'tramway', z: Z, tier: RT.Tram },
  { name: 'mixed', z: Z - 7, tier: RT.TwoLane, profile: FIRST_CUSTOM },
  { name: 'reserved', z: Z + 7, tier: RT.Avenue, profile: FIRST_CUSTOM + 1 },
];
for (const r of ROWS) await row(r.z, r.tier, r.profile);
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
        color: [0x3cb45a, 0xef5350, 0x42a5f5][i],
        mode: 'tram',
        stops: [
          { x: X + 6, z: r.z },
          { x: X + 16, z: r.z },
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
    // The middle of the eastbound general lane: the tram's own on the two street
    // tramways, the one beside the reservation on the avenue.
    [T, X, ROWS.map((r) => [r.z, r.name === 'reserved' ? 5.375 : 1.875])],
  );
await placeCars();

// A line's trams are drawn under the transit lens, as every line's vehicles are.
await hook(() => window.__slimcity.setOverlay('transit'));
const PITCH = 0.7;
const views = [];
for (const r of ROWS) {
  views.push([`${r.name}-line`, X + 11, r.z, 150, Math.PI, PITCH]);
  views.push([`${r.name}-street`, X + 11, r.z, 60, Math.PI, PITCH]);
  views.push([`${r.name}-close`, X + 11.5, r.z, 40, Math.PI - 0.5, 0.4]);
}
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

// The night, before the trams pull in at 23:00: the clock is applied by the
// next snapshot, which a command sends, and the cars go back after it.
await hook(() => window.__slimcity.setOverlay('transit'));
await hook(() => window.__slimcity.setDayT(0.9));
await cmd('Phase', [{ kind: 'setUnlimitedMoney', on: true }]);
await page.waitForTimeout(2000);
await placeCars();
for (const r of ROWS.slice(0, 2)) {
  await camera(X + 11, r.z, 150, Math.PI, PITCH);
  await shot(`${r.name}-night-line`, 2500);
  await camera(X + 11, r.z, 60, Math.PI, PITCH);
  await shot(`${r.name}-night`, 2500);
}

console.log('page errors', errors.length ? errors : 'none');
await browser.close();
