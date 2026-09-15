/** Placement-ghost check: the road preview is drawn at the road's REAL width,
 * so a player choosing a wider road sees it is wider before laying it — most
 * of all in replace mode, where the new road is about to reach past the one
 * already there and over whatever stands beside it.
 *
 * Measures the ghost's own extent through window.__slimcity.ghostBounds()
 * rather than judging the picture by eye, then shoots what was measured.
 *
 * Usage: node tools/ghost-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-ghost';
mkdirSync(out, { recursive: true });

const TWO_LANE = 1;
// Two 3.75 m lanes and two 1.875 m footways.
const TWO_LANE_WIDTH_M = 11.25;
// Four 3.6 m lanes, a 1.2 m median and two 1.875 m footways — nearly twice the
// street it replaces, and still inside the tile.
const AVENUE_WIDTH_M = 19.95;
// Six lanes: 26.55 m, too wide for one tile, so it is laid as two carriageways.
const CORRIDOR_WIDTH_M = 26.55;
const TILE_M = 20;

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
const ghostBounds = () => call(() => window.__slimcity.ghostBounds());
const cam = tileCamera(page);

const failures = [];
await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
await page.waitForTimeout(400);

// A flat, dry block to work over.
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
    for (let k = 0; k < 14 && dry; k++) {
      for (let dz = -3; dz <= 3 && dry; dz++) {
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
    if (spread <= 0.3) {
      anchor = { x, z };
      break;
    }
  }
}
if (!anchor) anchor = flattest.at;
const { x: X, z: Z } = anchor;
console.log('anchor', JSON.stringify(anchor), 'spread', flattest.spread.toFixed(2), 'm');

// Frame the flat block, then let the app say which tiles the drag will cross
// and lay the road that is about to be replaced along exactly those.
await call(() => window.__slimcity.setSpeed(0));
await call(() => window.__slimcity.setDayT(0.5));
await cam(X + 6, Z, 80, 0.0, 1.0);
await page.waitForTimeout(800);

/**
 * Drags the current tool straight across the middle of the viewport without
 * committing, and measures the ghost it leaves. Aiming is done by asking the
 * app which tile is under a pixel rather than searching for a pixel that
 * picks a tile — the same mapping, used the way round it is offered.
 */
const DRAG_Y = 450;
const DRAG_FROM_X = 500;
const DRAG_TO_X = 900;
const previewAcross = async () => {
  await page.mouse.move(DRAG_FROM_X, DRAG_Y, { steps: 4 });
  await page.mouse.down();
  await page.mouse.move(DRAG_TO_X, DRAG_Y, { steps: 12 });
  await page.waitForTimeout(400);
  return await ghostBounds();
};
const endDrag = async () => {
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.waitForTimeout(300);
};

const dragTiles = await call(
  ([y, x0, x1]) => {
    const hook = window.__slimcity;
    const seen = new Map();
    for (let sx = x0; sx <= x1; sx += 2) {
      const t = hook.screenToTile(sx, y);
      if (t) seen.set(`${t.x},${t.z}`, t);
    }
    return [...seen.values()];
  },
  [DRAG_Y, DRAG_FROM_X, DRAG_TO_X],
);
if (dragTiles.length === 0) {
  console.log('FAIL: the drag line picks no tiles at all');
  await b.close();
  process.exit(1);
}
console.log('drag crosses', dragTiles.length, 'tiles, rows', [
  ...new Set(dragTiles.map((t) => t.z)),
]);
await cmd('Two-Lane Road', [{ kind: 'buildRoad', tier: TWO_LANE, tiles: dragTiles }]);
await page.waitForTimeout(1000);

const pick = async (tab, card) => {
  // The Roads button TOGGLES the drawer, so opening one already open shuts it.
  if ((await page.getByRole('tab', { name: tab }).count()) === 0) {
    await page.getByRole('button', { name: 'Roads' }).click();
    await page.waitForTimeout(400);
  }
  await page.getByRole('tab', { name: tab }).click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: new RegExp(`^${card}\\b`) }).click();
  await page.waitForTimeout(300);
};

// 1. The same road it already is: the ghost is the two-lane's own width.
await pick('Small', 'Two-Lane Road');
const same = await previewAcross();
if (!same) failures.push('could not aim the two-lane preview at the row');
else {
  const across = same.maxZ - same.minZ;
  console.log('two-lane ghost across:', across.toFixed(2), 'm');
  if (Math.abs(across - TWO_LANE_WIDTH_M) > 0.01)
    failures.push(`a two-lane ghost measures ${across.toFixed(2)} m, not ${TWO_LANE_WIDTH_M}`);
  if (across >= TILE_M)
    failures.push('a two-lane ghost fills the whole tile, so it says nothing about the road');
  await page.screenshot({ path: `${out}/ghost-two-lane.png` });
}
await endDrag();

// 2. A wider road over the same tiles: the ghost has to grow to match. This is
//    the replace case — the player is about to put a 20 m road where an 11 m
//    one is, and the ghost is the only thing that says so beforehand.
await pick('Medium', 'Avenue');
const wider = await previewAcross();
if (!wider) failures.push('could not aim the avenue preview at the row');
else {
  const across = wider.maxZ - wider.minZ;
  console.log('avenue ghost across:', across.toFixed(2), 'm');
  if (Math.abs(across - AVENUE_WIDTH_M) > 0.01)
    failures.push(`an avenue ghost measures ${across.toFixed(2)} m, not ${AVENUE_WIDTH_M}`);
  if (across <= TWO_LANE_WIDTH_M + 0.5)
    failures.push(
      `an avenue ghost measures ${across.toFixed(2)} m — no wider than the road it replaces`,
    );
  if (across > TILE_M)
    failures.push(`an avenue ghost measures ${across.toFixed(2)} m, overrunning a ${TILE_M} m tile`);
  await page.screenshot({ path: `${out}/ghost-avenue-over-two-lane.png` });
}
await endDrag();

// 3. A corridor: the road outgrows one tile and is laid as two carriageways on
//    two rows. THAT is the case that claims ground the old road never had, and
//    the ghost has to show both rows — each drawn as one carriageway, not two.
await pick('Medium', 'Avenue');
await page.getByRole('group', { name: 'Lanes' }).getByText('6', { exact: true }).click();
await page.waitForTimeout(300);
// The drawer covers the lower half of the viewport and the corridor's second
// row sits behind it, so pull the camera back and aim higher for this one —
// the point of the shot is that BOTH rows are visible.
await cam(X + 6, Z + 3, 150, 0.0, 1.25);
await page.waitForTimeout(700);
const corridor = await previewAcross();
if (!corridor) failures.push('could not aim the six-lane preview at the row');
else {
  const across = corridor.maxZ - corridor.minZ;
  const perRow = CORRIDOR_WIDTH_M / 2;
  console.log('six-lane corridor ghost across both rows:', across.toFixed(2), 'm');
  // Two carriageways a tile apart: the outer extent spans a whole tile plus
  // one carriageway, which is strictly more ground than one row could claim.
  if (across <= TILE_M)
    failures.push(
      `a corridor ghost spans ${across.toFixed(2)} m — it is not showing the second row of tiles it will take`,
    );
  if (across <= perRow + 0.5)
    failures.push(`a corridor ghost spans ${across.toFixed(2)} m, no more than one carriageway`);
  await page.screenshot({ path: `${out}/ghost-corridor.png` });
}
await endDrag();

if (pageErrors.length > 0) failures.push(`page errors: ${pageErrors.join(' | ')}`);
console.log(failures.length === 0 ? 'PASS' : 'FAIL:\n - ' + failures.join('\n - '));
console.log('done ->', out);
await b.close();
