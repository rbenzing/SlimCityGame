/** Kerb-furniture audit (SPEC 28): grow a real district on streets that BEND,
 * then re-derive from the live game where every kerbside car, every lamp and
 * every walker actually ended up.
 *
 * A fixture proves the rule; only the running city proves the inputs the rule
 * is fed. The bends are the point — a straight test street cannot fail the way
 * the reported bugs failed.
 *
 * Usage: node tools/kerb-audit.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-kerb';
mkdirSync(out, { recursive: true });

const RT = { TwoLane: 1 };
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
const stats = () => call(() => window.__slimcity.getStats());
const setSpeed = (s) => call((x) => window.__slimcity.setSpeed(x), s);
const cam = tileCamera(page);

const g0 = await call(() => window.__slimcity.readGrid());
const N = g0.size;
const idx = (x, z) => z * N + x;

let anchor = null;
for (let z = 40; z < N - 40 && !anchor; z++) {
  for (let x = 40; x < N - 60; x++) {
    let ok = true;
    for (let k = 0; k < 34 && ok; k++) {
      for (let dz = -10; dz <= 10 && ok; dz++) {
        const i = idx(x + k, z + dz);
        if (g0.water[i] || Math.abs(g0.height[i]) > 18) ok = false;
      }
    }
    if (ok) anchor = { x, z };
    if (anchor) break;
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

const road = (tiles) => cmd('R', [{ kind: 'buildRoad', tier: RT.TwoLane, tiles }]);
const rowTiles = (z, x0, x1) => Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, z }));
const colTiles = (x, z0, z1) => Array.from({ length: z1 - z0 + 1 }, (_, i) => ({ x, z: z0 + i }));

// A straight spine, plus a STAIRCASE street that turns every few tiles. Every
// step is a corner, and a corner is where a row measured from the building
// walks off the tarmac.
await road(rowTiles(Z - 8, X, X + 30));
await road(rowTiles(Z, X, X + 30));
await road(rowTiles(Z + 10, X, X + 30));
for (let x = X; x <= X + 30; x += 6) await road(colTiles(x, Z - 8, Z + 10));
let sx = X + 2;
for (let sz = Z + 2; sz <= Z + 8; sz += 2) {
  await road(rowTiles(sz, sx, sx + 5));
  await road(colTiles(sx + 5, sz, sz + 2));
  sx += 5;
}
await page.waitForTimeout(600);

await cmd('Utilities', [
  { kind: 'placeBuilding', catalogId: 'coal-plant', x: X + 2, z: Z - 12, rotation: 0 },
  { kind: 'placeBuilding', catalogId: 'water-tower', x: X + 9, z: Z - 10, rotation: 0 },
]);
await page.waitForTimeout(500);

// Homes on both sides of the bends (kerbside parkers) and shops on the spine
// (own-lot parkers) — both halves of the rule in one city.
for (const z of [Z - 7, Z - 6, Z - 5, Z - 4, Z - 3, Z - 2, Z - 1]) {
  await cmd('Zone', [{ kind: 'paintZone', zone: ZONE.ResLow, tiles: rowTiles(z, X + 1, X + 29) }]);
}
for (const z of [Z + 1, Z + 3, Z + 5, Z + 7, Z + 9]) {
  await cmd('Zone', [{ kind: 'paintZone', zone: ZONE.ComLow, tiles: rowTiles(z, X + 1, X + 29) }]);
}
await page.waitForTimeout(600);

await setSpeed(4);
for (let i = 0; i < 1800; i++) {
  const s = await stats();
  if ((s.population ?? 0) >= 300) break;
  await page.waitForTimeout(200);
}
const s1 = await stats();
console.log('population', s1.population, 'jobs', s1.jobs);

// One atomic read at speed 0: the city keeps growing otherwise, and two reads
// would audit two different cities.
await setSpeed(0);
await page.waitForTimeout(400);
const audit = await call(() => window.__slimcity.readKerbAudit());
console.log('cars   :', JSON.stringify(audit.cars));
console.log('lamps  :', JSON.stringify(audit.lamps));
console.log('walkers:', JSON.stringify(audit.walkers));

const failures = [];
if (audit.cars.total === 0) failures.push('no kerbside cars grew — the audit proved nothing');
if (audit.cars.offRoad > 0) failures.push(`${audit.cars.offRoad} kerbside cars off the carriageway`);
if (audit.cars.junction > 0) failures.push(`${audit.cars.junction} kerbside cars in a junction`);
if (audit.cars.wrongTier > 0) failures.push(`${audit.cars.wrongTier} kerbside cars on a tier that forbids it`);
if (audit.lamps.driveways === 0) failures.push('no driveways recorded — the lamp rule proved nothing');
if (audit.lamps.onDriveway > 0) failures.push(`${audit.lamps.onDriveway} lamps in a curb cut`);
if (audit.walkers.total === 0) failures.push('no walkers — the pavement rule proved nothing');
if (audit.walkers.wrongAxis > 0) failures.push(`${audit.walkers.wrongAxis} walkers crossing their street`);

const dayTof = (t) => ((t + 900) % 2400) / 2400;
for (let i = 0; i < 500; i++) {
  const d = dayTof((await stats()).tick);
  if (d >= 0.47 && d <= 0.53) break;
  await setSpeed(4);
  await page.waitForTimeout(120);
}
await setSpeed(0);

const shot = async (name, tx, tz, d, yaw, pitch) => {
  await cam(tx, tz, d, yaw, pitch);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
};
await shot('bends', X + 8, Z + 5, 90, 0.5, 0.5);
await shot('street', X + 10, Z - 4, 70, 0.5, 0.35);
await shot('block', X + 15, Z, 200, 0.5, 0.85);

console.log(failures.length === 0 ? 'PASS' : 'FAIL:\n - ' + failures.join('\n - '));
console.log('done ->', out);
await b.close();
process.exit(failures.length === 0 ? 0 : 1);
