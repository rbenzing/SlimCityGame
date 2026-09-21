/** Scale check: the two anchors the whole world is measured against, in one
 * frame together. A pedestrian is 1.75 m to the top of the head and a car is
 * 4.0 m long, and the only way to know they agree is to look at them standing
 * next to each other — a read-back of either number proves nothing about the
 * other.
 *
 * Idling pedestrians are guaranteed rather than hoped for: they cluster at a
 * transit shelter, so the harness lays a bus line instead of waiting for a
 * walker to wander into shot. It prints the population it actually grew,
 * because an empty map photographs perfectly well and a shot of nothing looks
 * exactly like a shot of something that is fine.
 *
 * Usage: node tools/scale-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { tileCamera, closeUp } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-scale';
mkdirSync(out, { recursive: true });

const TWO_LANE = 1;
const ZONE_RES_LOW = 1;
const ZONE_COM_LOW = 3;

const b = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.addInitScript(() => {
  try {
    sessionStorage.setItem(
      'slimcity.session',
      JSON.stringify({ screen: 'playing', seed: 12345, mode: 'new' }),
    );
    localStorage.setItem('slimcity.settings', JSON.stringify({ sandboxUnlockAll: true }));
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

// A flat, dry block to build on, found rather than assumed.
const g = await readGrid();
const N = g.size;
const idx = (x, z) => z * N + x;
let A = null;
for (let z = 25; z < N - 35 && !A; z++)
  for (let x = 25; x < N - 35 && !A; x++) {
    const h0 = g.height[idx(x, z)];
    let ok = true;
    for (let dz = -4; dz < 10 && ok; dz++)
      for (let dx = -2; dx < 26 && ok; dx++) {
        const i = idx(x + dx, z + dz);
        if (g.water[i] || Math.abs(g.height[i] - h0) > 6) ok = false;
      }
    if (ok) A = { x, z };
  }
if (!A) {
  console.log('no anchor');
  await b.close();
  process.exit(1);
}
const X = A.x;
const Z = A.z;
console.log('anchor', JSON.stringify(A));

await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
await page.waitForTimeout(300);

await cmd('Street', [
  {
    kind: 'buildRoad',
    tier: TWO_LANE,
    tiles: Array.from({ length: 24 }, (_, i) => ({ x: X + i, z: Z })),
  },
]);
// Frontage on both sides, so houses grow facing the camera and park on their
// own driveways.
const band = (zone, z0, z1) =>
  cmd('Zone', [
    {
      kind: 'paintZone',
      zone,
      tiles: Array.from({ length: 24 * (z1 - z0 + 1) }, (_, i) => ({
        x: X + (i % 24),
        z: z0 + Math.floor(i / 24),
      })),
    },
  ]);
await band(ZONE_RES_LOW, Z + 1, Z + 3);
await band(ZONE_COM_LOW, Z - 3, Z - 1);

// Butted against the street: a utility's footprint has to touch a road tile for
// its power and water to enter the network at all. Set back by even one tile,
// the whole strip stays dark and nothing grows — which photographs as a tidy
// empty field rather than as a mistake.
await cmd('Power', [
  { kind: 'placeBuilding', catalogId: 'wind-turbine', x: X + 22, z: Z - 1, rotation: 0 },
]);
await cmd('Water', [
  { kind: 'placeBuilding', catalogId: 'water-tower', x: X + 19, z: Z - 2, rotation: 0 },
]);

// Two shelters on the same street: idling people stand at them deterministically,
// which is the only way to guarantee a person in frame beside a car.
await cmd('Stops', [
  { kind: 'placeBuilding', catalogId: 'bus-stop', x: X + 6, z: Z - 1, rotation: 0 },
  { kind: 'placeBuilding', catalogId: 'bus-stop', x: X + 18, z: Z - 1, rotation: 0 },
]);
await cmd('Bus line', [
  {
    kind: 'createTransitLine',
    line: {
      id: 0,
      color: 0xef5350,
      stops: [
        { x: X + 6, z: Z },
        { x: X + 18, z: Z },
      ],
    },
  },
]);

await setSpeed(4);
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(1000);
  const s = await stats();
  if (s.population >= 60) break;
}
const s = await stats();
console.log(`pop ${s.population} jobs ${s.jobs} — a shot of an empty map proves nothing`);
if (s.population === 0) {
  console.log('NOTHING GREW: the shots below are of bare ground, do not read them as a pass');
}
await setSpeed(0);
await page.waitForTimeout(600);

// Midday, pinned. The sim clock had these at dusk, where a 1.75 m figure is a
// dark smudge against dark grass and the shot cannot be read at all.
await call(() => window.__slimcity.setDayT(0.45));
await page.waitForTimeout(600);

// Three times the pixels over the same ground: the camera has a 40 m floor, so
// resolution is the only way to get a person big enough to measure.
const restore = await closeUp(page, 3);
// A person's height reads against a car only from near ground level.
await cam(X + 6, Z, 40, 0, 0.18);
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/shelter-and-car.png` });

await cam(X + 18, Z, 40, Math.PI / 2, 0.15);
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/shelter-along-street.png` });

await cam(X + 12, Z + 1, 40, 0, 0.3);
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/houses-and-people.png` });
await restore();

await cam(X + 12, Z, 120, 0, 0.5);
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/overview.png` });

console.log('done');
await b.close();
