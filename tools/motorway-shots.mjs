/** Motorway check: a carriageway is one direction, and its paint says so.
 *
 * Four things the tests assert but cannot see. The left edge line is solid
 * yellow and the right solid white (MUTCD 3B.09), so on a dual carriageway
 * both yellow lines must face the median and both white lines the verge —
 * which is only true if "left" is worked out from the direction the tile was
 * drawn, and a yellow line on the wrong side is worse than no change at all.
 * A motorway carries no sewer, so no manhole cover. And the shoulders sit
 * outside the paint but inside the asphalt.
 *
 * It lays a street alongside as the control: the covers belong on that.
 *
 * Usage: node tools/motorway-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { tileCamera, closeUp } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-motorway';
mkdirSync(out, { recursive: true });

const TWO_LANE = 1;
const HIGHWAY = 3;
/** RoadFlow: the byte the drag stores, so a run can be laid in a named direction. */
const FLOW = { north: 1, east: 2, south: 3, west: 4 };

const b = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
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
const cam = tileCamera(page);

const g = await call(() => {
  const r = window.__slimcity.readGrid();
  return { size: r.size, water: Array.from(r.water), height: Array.from(r.height) };
});
const N = g.size;
const idx = (x, z) => z * N + x;
let A = null;
for (let z = 20; z < N - 40 && !A; z++)
  for (let x = 20; x < N - 40 && !A; x++) {
    const h0 = g.height[idx(x, z)];
    let ok = true;
    for (let dz = 0; dz < 30 && ok; dz++)
      for (let dx = 0; dx < 30 && ok; dx++) {
        const i = idx(x + dx, z + dz);
        if (g.water[i] || Math.abs(g.height[i] - h0) > 5) ok = false;
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
await page.waitForTimeout(400);

const run = (label, tier, tiles, flows) =>
  cmd(label, [{ kind: 'buildRoad', tier, tiles, ...(flows ? { flows } : {}) }]);
const colTiles = (x, z0, len) => Array.from({ length: len }, (_, i) => ({ x, z: z0 + i }));

// A dual carriageway: two motorway runs with one tile of ground between them,
// drawn in OPPOSITE directions.
//
// The traffic drives on the right, so the SOUTHBOUND carriageway is the west
// one and the northbound is the east one — each driver keeps the median on
// their left. Laying them the other way round builds a left-hand-traffic
// interchange, and then correct paint looks wrong: both yellow lines land on
// the outside of the pair instead of facing the median. The first run of this
// harness did exactly that and very nearly booked it as a defect.
const south = colTiles(X + 4, Z, 24);
const north = colTiles(X + 6, Z, 24);
await run('NB', HIGHWAY, north, north.map(() => FLOW.north));
await run('SB', HIGHWAY, south, south.map(() => FLOW.south));
// The control: an ordinary street, which DOES have a sewer under it.
await run('Street', TWO_LANE, colTiles(X + 12, Z, 24));
await page.waitForTimeout(2500);

const laid = await readGrid();
const tierAt = (x, z) => laid.roadTier[idx(x, z)];
console.log(
  `tiers — NB ${tierAt(X + 4, Z + 8)} SB ${tierAt(X + 6, Z + 8)} street ${tierAt(X + 12, Z + 8)}`,
);
if (tierAt(X + 4, Z + 8) !== HIGHWAY || tierAt(X + 6, Z + 8) !== HIGHWAY) {
  console.log('MOTORWAY DID NOT LAY — the shots below show nothing worth reading');
}

await call(() => window.__slimcity.setDayT(0.45));
await page.waitForTimeout(600);

const restore = await closeUp(page, 3);
// Straight down: the only angle where both carriageways' paint can be compared
// side by side without perspective deciding which line looks wider.
await cam(X + 5, Z + 8, 60, 0, 1.45);
await page.waitForTimeout(1000);
await page.screenshot({ path: `${out}/dual-carriageway-top.png` });

await cam(X + 5, Z + 14, 45, 0, 0.35);
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/dual-carriageway-eye.png` });

// The whole 24-tile street in one frame. Covers sit every 6 tiles, so a frame
// holding only a few tiles can miss all of them — and then the control proves
// nothing, because "no covers here" reads the same as "no covers anywhere".
await cam(X + 12, Z + 12, 150, 0, 1.5);
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/street-control-covers.png` });
await restore();

console.log('done');
await b.close();
