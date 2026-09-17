/** Road guide snapping: a drag that is nearly in line with an existing road is
 * pulled into line with it, so a new street continues one rather than running
 * a tile off it. Lays a street, drags a second one deliberately one tile out,
 * and reads back which row it landed on — with the chip off and then on.
 *
 * Usage: node tools/guidesnap-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-guidesnap';
mkdirSync(out, { recursive: true });

const TWO_LANE = 1;
/** Everything the canvas shows below this is under the drawer, not on the map. */
const CANVAS_BOTTOM_PX = 560;

const b = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
const pageErrors = [];
page.on('pageerror', (e) => {
  pageErrors.push(e.message);
  console.log('[pageerror]', e.message);
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
const readGrid = () => call(() => window.__slimcity.readGrid());
const cam = tileCamera(page);

const failures = [];
await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
await page.waitForTimeout(400);

// A flat, dry strip to work on.
const g0 = await readGrid();
const N = g0.size;
const idx = (x, z) => z * N + x;
let anchor = null;
let flattest = { spread: Infinity, at: null };
for (let z = 40; z < N - 40 && !anchor; z++) {
  for (let x = 40; x < N - 60; x++) {
    let lo = Infinity;
    let hi = -Infinity;
    let dry = true;
    for (let k = 0; k < 22 && dry; k++) {
      for (let dz = -4; dz <= 4 && dry; dz++) {
        const i = idx(x + k, z + dz);
        if (g0.water[i]) dry = false;
        const h = g0.height[i];
        if (h < lo) lo = h;
        if (h > hi) hi = h;
      }
    }
    if (!dry) continue;
    const spread = hi - lo;
    if (spread < flattest.spread) flattest = { spread, at: { x, z } };
    if (spread <= 1.5) {
      anchor = { x, z };
      break;
    }
  }
}
if (!anchor) anchor = flattest.at;
const { x: X, z: Z } = anchor;
console.log('anchor', JSON.stringify(anchor), 'spread', flattest.spread.toFixed(2), 'm');

// The road the guide comes from: ten tiles along row Z.
await cmd('Two-Lane Road', [
  {
    kind: 'buildRoad',
    tier: TWO_LANE,
    tiles: Array.from({ length: 10 }, (_, i) => ({ x: X + i, z: Z })),
  },
]);
await page.waitForTimeout(900);

await call(() => window.__slimcity.setSpeed(0));
await call(() => window.__slimcity.setDayT(0.5));
await cam(X + 10, Z + 3, 460, 0.0, 1.4);
await page.waitForTimeout(800);

/** The screen point that picks a tile — above the drawer, which covers the canvas. */
const pointFor = async (tx, tz) =>
  await call(
    ([wantX, wantZ, bottom]) => {
      const hook = window.__slimcity;
      let best = null;
      let bestD = Infinity;
      for (let sy = 60; sy < bottom; sy += 4) {
        for (let sx = 60; sx < 1340; sx += 4) {
          const t = hook.screenToTile(sx, sy);
          if (!t) continue;
          const d = Math.abs(t.x - wantX) + Math.abs(t.z - wantZ);
          if (d < bestD) {
            bestD = d;
            best = { sx, sy, d };
          }
          if (d === 0) return { sx, sy, d };
        }
      }
      return best;
    },
    [tx, tz, CANVAS_BOTTOM_PX],
  );

await page.getByRole('button', { name: 'Roads' }).click();
await page.waitForTimeout(400);
await page.getByRole('tab', { name: 'Small' }).click();
await page.waitForTimeout(200);
await page.getByRole('button', { name: /^Two-Lane Road\b/ }).click();
await page.waitForTimeout(250);
await page.getByRole('button', { name: 'Straight' }).click();
await page.waitForTimeout(250);
if ((await page.getByRole('button', { name: 'Guide' }).count()) === 0)
  failures.push('the road tool offers no Guide snapping chip');

/** Drags a run one tile OFF the existing road's row, and says which row it landed on. */
const dragOffRow = async (startX, endX, offRow) => {
  const a = await pointFor(startX, offRow);
  const c = await pointFor(endX, offRow);
  if (!a || !c || a.d > 1 || c.d > 1) return { aimed: false };
  await page.mouse.move(a.sx, a.sy, { steps: 4 });
  await page.mouse.down();
  await page.mouse.move(c.sx, c.sy, { steps: 10 });
  await page.waitForTimeout(350);
  await page.mouse.up();
  await page.waitForTimeout(1400);
  const g = await readGrid();
  const rows = new Set();
  for (let z = Z - 5; z <= Z + 5; z++)
    for (let x = startX; x <= endX; x++) if (g.roadTier[idx(x, z)] !== 0) rows.add(z);
  return { aimed: true, rows: [...rows].sort((p, q) => p - q) };
};

// Off: the run goes exactly where it was pointed, one tile off the road.
const OFF_ROW = Z + 2;
const off = await dragOffRow(X + 12, X + 18, OFF_ROW);
if (!off.aimed) failures.push('could not aim the unsnapped drag');
else {
  console.log('guide OFF — rows carrying road:', off.rows.join(', '));
  if (!off.rows.includes(OFF_ROW))
    failures.push(`with the chip off the run did not land on row ${OFF_ROW}`);
  await page.screenshot({ path: `${out}/guide-off.png` });
}

// On: the same drag, the same distance off the road but on its other side, is
// pulled onto the existing road's own row. The other side keeps it clear of
// the run just laid, and keeps it on screen.
await page.getByRole('button', { name: 'Guide' }).click();
await page.waitForTimeout(300);
const on = await dragOffRow(X + 12, X + 18, Z - 2);
if (!on.aimed) failures.push('could not aim the snapped drag');
else {
  console.log('guide ON  — rows carrying road:', on.rows.join(', '));
  // The guide road only spans x = X..X+9, so road appearing at x = X+12..X+18
  // on row Z can only have come from this drag being pulled onto it.
  const g = await readGrid();
  let onGuide = 0;
  let onPointedRow = 0;
  for (let x = X + 12; x <= X + 18; x++) {
    if (g.roadTier[idx(x, Z)] !== 0) onGuide++;
    if (g.roadTier[idx(x, Z - 2)] !== 0) onPointedRow++;
  }
  console.log(`snapped run: ${onGuide}/7 tiles on the guide row, ${onPointedRow}/7 where pointed`);
  if (onGuide < 7) failures.push(`the snapped run put only ${onGuide} of 7 tiles on row ${Z}`);
  if (onPointedRow > 0)
    failures.push(`${onPointedRow} tiles stayed on row ${Z - 2}, so the drag was not snapped`);
  await page.screenshot({ path: `${out}/guide-on.png` });
}

await cam(X + 14, Z + 2, 460, 0.0, 1.45);
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/guide-overhead.png` });

if (pageErrors.length > 0) failures.push(`page errors: ${pageErrors.join(' | ')}`);
console.log(failures.length === 0 ? 'PASS' : 'FAIL:\n - ' + failures.join('\n - '));
console.log('done ->', out);
await b.close();
