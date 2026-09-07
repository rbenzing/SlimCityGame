/** Tram transit check (SPEC 27): grow a small district along tram track, draw a
 * tram line over it, and report what the sim actually did — did the line commit
 * as a tram, did it carry riders once people lived there, did trams appear —
 * then shoot the result.
 *
 * Unlike the rail harness this one GROWS a city first: ridership is demand-
 * driven, so an empty sandbox carries nobody and no transit vehicle ever
 * appears. Zoning, powering and watering a few rows is what makes a tram
 * visible at all.
 *
 * Usage: node tools/tram-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-tram';
mkdirSync(out, { recursive: true });

const RT = { TwoLane: 1, Tram: 10 };
const ZONE = { ResLow: 1, ComLow: 3 };

const b = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
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
await page.waitForSelector('#viewport canvas', { timeout: 20000 });
await page.waitForTimeout(4000);

const call = (fn, ...a) => page.evaluate(fn, ...a);
const cmd = (l, c) => call(([x, y]) => window.__slimcity.cmd(x, y), [l, c]);
const readGrid = () => call(() => window.__slimcity.readGrid());
const stats = () => call(() => window.__slimcity.getStats());
const setSpeed = (s) => call((x) => window.__slimcity.setSpeed(x), s);
const cam = tileCamera(page);

const g0 = await readGrid();
const N = g0.size;
const idx = (x, z) => z * N + x;

// A dry, flat-ish block to build a neighbourhood in.
let anchor = null;
for (let z = 40; z < N - 40 && !anchor; z++) {
  for (let x = 40; x < N - 60; x++) {
    let ok = true;
    for (let k = 0; k < 34 && ok; k++) {
      for (let dz = -6; dz <= 6 && ok; dz++) {
        const i = idx(x + k, z + dz);
        if (g0.water[i] || Math.abs(g0.height[i]) > 20) ok = false;
      }
    }
    if (ok) {
      anchor = { x, z };
      break;
    }
  }
}
if (!anchor) {
  console.log('no dry block found');
  await b.close();
  process.exit(1);
}
const { x: X, z: Z } = anchor;
console.log('anchor', JSON.stringify(anchor));

await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
await page.waitForTimeout(300);

const rowTiles = (z, x0, x1) => Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, z }));
const row = (z, tier, x0, x1) =>
  cmd('R', [{ kind: 'buildRoad', tier, tiles: rowTiles(z, x0, x1) }]);
const col = (x, tier, z0, z1) =>
  cmd('R', [
    {
      kind: 'buildRoad',
      tier,
      tiles: Array.from({ length: z1 - z0 + 1 }, (_, i) => ({ x, z: z0 + i })),
    },
  ]);

// Tram track down the middle, ordinary streets either side, cross streets tying
// the block together so power and water conduct and every zoned tile fronts one.
// The cross streets stop one tile short of the corridor and pick up again on
// the far side, so they T into the track instead of overwriting a tile of it —
// two tiers cannot share a tile, and a street laid THROUGH the corridor would
// cut the tram line in half.
await row(Z, RT.Tram, X, X + 30);
await row(Z - 4, RT.TwoLane, X, X + 30);
await row(Z + 4, RT.TwoLane, X, X + 30);
for (let x = X; x <= X + 30; x += 6) {
  await col(x, RT.TwoLane, Z - 4, Z - 1);
  await col(x, RT.TwoLane, Z + 1, Z + 4);
}
await page.waitForTimeout(700);

// Power and water, plopped touching the north street so they conduct along it.
await cmd('Utilities', [
  { kind: 'placeBuilding', catalogId: 'wind-turbine', x: X + 2, z: Z - 5, rotation: 0 },
  { kind: 'placeBuilding', catalogId: 'wind-turbine', x: X + 4, z: Z - 5, rotation: 0 },
  { kind: 'placeBuilding', catalogId: 'wind-turbine', x: X + 6, z: Z - 5, rotation: 0 },
  { kind: 'placeBuilding', catalogId: 'water-tower', x: X + 9, z: Z - 6, rotation: 0 },
]);
await page.waitForTimeout(500);

// Housing beside the tram and the streets, shops at the far end for jobs.
const zoneRows = [Z - 3, Z - 2, Z - 1, Z + 1, Z + 2, Z + 3];
for (const z of zoneRows) {
  await cmd('Zone', [
    { kind: 'paintZone', zone: ZONE.ResLow, tiles: rowTiles(z, X + 1, X + 22) },
    { kind: 'paintZone', zone: ZONE.ComLow, tiles: rowTiles(z, X + 24, X + 29) },
  ]);
}
await page.waitForTimeout(700);

// Let the district actually grow — ridership is demand-driven, so this is the
// part that makes a tram appear at all.
const g1 = await readGrid();
console.log('zoned tiles', g1.zone.filter((z) => z !== 0).length);
console.log(
  'utilities',
  (await call(() => window.__slimcity.readBuildings()))
    .map((bl) => `${bl.catalogId}@${bl.x},${bl.z}`)
    .join(' '),
);

await setSpeed(4);
let pop = 0;
for (let i = 0; i < 900; i++) {
  const s = await stats();
  pop = s.population ?? 0;
  if (pop >= 150) break;
  await page.waitForTimeout(200);
}
const grown = await call(() => window.__slimcity.readBuildings());
console.log('population', pop, 'buildings', grown.length);
const byState = {};
for (const bl of grown) byState[`${bl.state}/${bl.problems}`] = (byState[`${bl.state}/${bl.problems}`] ?? 0) + 1;
console.log('building state/problems', JSON.stringify(byState));

await cmd('Tram line', [
  {
    kind: 'createTransitLine',
    line: {
      id: 0,
      color: 0x66bb6a,
      mode: 'tram',
      stops: [
        { x: X + 3, z: Z },
        { x: X + 15, z: Z },
        { x: X + 27, z: Z },
      ],
    },
  },
]);
await page.waitForTimeout(2500);

const transit = await call(() => window.__slimcity.readTransit());
console.log('transit snapshot:', JSON.stringify(transit));
console.log(
  'tram corridor tiers:',
  [...new Set((await readGrid()).roadTier.slice(Z * N + X, Z * N + X + 31))].join(','),
);
// A tram and a traffic bus look alike in a shot; this says what the transit
// renderer itself built.
console.log(
  'transit renderer:',
  JSON.stringify(await call(() => window.__slimcity.readTransitRender())),
);

// Kerbside parking: who actually got stalls, grouped by what they are. A home
// with no drive should line the kerb; a shop with a bay row should not.
const parking = await call(() => {
  const out = {};
  for (const b of window.__slimcity.readBuildings()) {
    const p = window.__slimcity.readParking(b.id);
    if (!p) continue;
    const key = `${p.category}:north${p.northTier}`;
    out[key] = out[key] ?? { buildings: 0, withStalls: 0 };
    out[key].buildings += 1;
    if (p.stalls > 0) out[key].withStalls += 1;
  }
  return out;
});
console.log('parking by category/frontage tier:', JSON.stringify(parking));

// Park the clock near midday so the shots are lit.
const dayTof = (t) => ((t + 900) % 2400) / 2400;
for (let i = 0; i < 500; i++) {
  const d = dayTof((await stats()).tick);
  if (d >= 0.47 && d <= 0.53) {
    await setSpeed(0);
    break;
  }
  await page.waitForTimeout(120);
}

const shot = async (name, tx, tz, d, yaw, pitch) => {
  await cam(tx, tz, d, yaw, pitch);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
};
await shot('tram-close', X + 8, Z, 60, 0.6, 0.55);
await shot('tram-side', X + 16, Z, 70, 0.5, 0.4);
await shot('district', X + 15, Z, 170, 0.5, 0.8);

console.log('done ->', out);
await b.close();
