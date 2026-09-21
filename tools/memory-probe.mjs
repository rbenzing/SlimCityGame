/** Where the heap goes as a city grows.
 *
 * A screenshot run died with 314 "Array buffer allocation failed" the moment
 * its city passed 3,600 people, so something allocates faster than the city
 * grows. This samples the JS heap against population and building count at a
 * fixed interval and prints the three side by side, because "it runs out of
 * memory" is not a diagnosis — the shape of the curve is. Linear with buildings
 * is a budget; superlinear, or climbing while the city is static, is a leak.
 *
 * Usage: node tools/memory-probe.mjs [url] [seconds]
 */
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const budget = Number(process.argv[3] ?? 240);

const TWO_LANE = 1;
const ZONES = { resLow: 1, resRow: 6, resMedium: 7, mixed: 8, resHigh: 2 };
const ZONE_COM = 3;
const ZONE_IND = 5;

const b = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
let allocFailures = 0;
page.on('pageerror', (e) => {
  if (/allocation failed/i.test(e.message)) allocFailures += 1;
  else console.log('[pageerror]', e.message);
});
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
const stats = () => call(() => window.__slimcity.getStats());

const g = await call(() => {
  const r = window.__slimcity.readGrid();
  // Summarise INSIDE the page: handing 10 full layers across the boundary is
  // itself tens of megabytes, and a probe that perturbs what it measures is
  // worse than no probe.
  return { size: r.size, water: Array.from(r.water), height: Array.from(r.height) };
});
const N = g.size;
const idx = (x, z) => z * N + x;
let A = null;
for (let z = 12; z < N - 62 && !A; z++)
  for (let x = 12; x < N - 62 && !A; x++) {
    const h0 = g.height[idx(x, z)];
    let ok = true;
    for (let dz = 0; dz < 56 && ok; dz++)
      for (let dx = 0; dx < 56 && ok; dx++) {
        const i = idx(x + dx, z + dz);
        if (g.water[i] || Math.abs(g.height[i] - h0) > 8) ok = false;
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

await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
const line = (fixed, vary, horiz) =>
  cmd('R', [
    {
      kind: 'buildRoad',
      tier: TWO_LANE,
      tiles: Array.from({ length: 55 }, (_, i) =>
        horiz ? { x: vary + i, z: fixed } : { x: fixed, z: vary + i },
      ),
    },
  ]);
for (let i = 0; i <= 54; i += 6) await line(Z + i, X, true);
for (let i = 0; i <= 54; i += 6) await line(X + i, Z, false);
const ladder = [ZONES.resLow, ZONES.resRow, ZONES.resMedium, ZONES.mixed, ZONES.resHigh];
let block = 0;
for (let bz = 0; bz < 54; bz += 6)
  for (let bx = 0; bx < 54; bx += 6) {
    const ring = Math.min(bx, bz, 48 - bx, 48 - bz) / 6;
    const zone =
      ring >= 2 && block % 3 === 1
        ? ZONE_COM
        : ring >= 2 && block % 3 === 2
          ? ZONE_IND
          : ladder[Math.min(ring, ladder.length - 1)];
    await cmd('Z', [
      {
        kind: 'paintZone',
        zone,
        tiles: Array.from({ length: 25 }, (_, i) => ({
          x: X + bx + 1 + (i % 5),
          z: Z + bz + 1 + Math.floor(i / 5),
        })),
      },
    ]);
    block += 1;
  }
await cmd('U', [
  ...Array.from({ length: 6 }, (_, i) => ({
    kind: 'placeBuilding',
    catalogId: 'coal-plant',
    x: X + 55,
    z: Z + 1 + i * 6,
    rotation: 0,
  })),
  // X+55 touches the last road column at X+54. At X+60 the tower supplies the
  // city on paper and reaches none of it: powerSupply/waterSupply count every
  // generator whether or not it is connected, so the stats read healthy while
  // nothing is watered and nothing grows.
  ...Array.from({ length: 4 }, (_, i) => ({
    kind: 'placeBuilding',
    catalogId: 'water-tower',
    x: X + 55,
    z: Z + 37 + i * 4,
    rotation: 0,
  })),
]);
await cmd('S', [
  { kind: 'placeBuilding', catalogId: 'clinic', x: X + 1, z: Z + 7, rotation: 0 },
  { kind: 'placeBuilding', catalogId: 'school', x: X + 13, z: Z + 7, rotation: 0 },
  { kind: 'placeBuilding', catalogId: 'police-station', x: X + 7, z: Z + 13, rotation: 0 },
  { kind: 'placeBuilding', catalogId: 'fire-station', x: X + 19, z: Z + 13, rotation: 0 },
]);

const sample = () =>
  call(() => {
    const m = performance.memory;
    const s = window.__slimcity.getStats();
    return {
      heapMB: m ? Math.round(m.usedJSHeapSize / 1048576) : -1,
      limitMB: m ? Math.round(m.jsHeapSizeLimit / 1048576) : -1,
      pop: s.population,
      pwr: Math.round(s.powerDemand) + '/' + Math.round(s.powerSupply),
      wtr: Math.round(s.waterDemand) + '/' + Math.round(s.waterSupply),
    };
  });

await call((x) => window.__slimcity.setSpeed(x), 4);
console.log(' t(s)  pop     heapMB  power MW d/s   water kL d/s  allocFail');
for (let t = 0; t <= budget; t += 10) {
  await page.waitForTimeout(10000);
  const s = await sample();
  console.log(
    `${String(t + 10).padStart(5)}  ${String(s.pop).padStart(6)}  ${String(s.heapMB).padStart(6)}  ${s.pwr.padStart(13)}  ${s.wtr.padStart(13)}  ${String(allocFailures).padStart(9)}`,
  );
  if (allocFailures > 50) {
    console.log('--- allocation failures running away, stopping ---');
    break;
  }
}
const final = await stats().catch(() => null);
console.log('final pop', final ? final.population : 'unreadable');
await b.close();
