/** Grid road mode: one drag lays the street grid its rectangle encloses — the
 * four sides plus the internal streets that divide the block at the zoning
 * pitch. Drives the real tool through the real drawer, reads the grid back off
 * the world, and shoots it.
 *
 * Usage: node tools/gridmode-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-gridmode';
mkdirSync(out, { recursive: true });

/** 2 × ZONE_DEPTH + 1: the widest street pitch that leaves no dead ground. */
const GRID_SPACING_TILES = 9;

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

// A flat, dry block big enough to hold a divided grid.
const g0 = await readGrid();
const N = g0.size;
const idx = (x, z) => z * N + x;
let anchor = null;
let flattest = { spread: Infinity, at: null };
// Twenty tiles: wide enough that one internal street each way fits with a
// whole block behind it (the next would fall short), and small enough to sit
// entirely on the canvas above the drawer.
const SPAN = 20;
for (let z = 40; z < N - 60 && !anchor; z++) {
  for (let x = 40; x < N - 60; x++) {
    let lo = Infinity;
    let hi = -Infinity;
    let dry = true;
    for (let k = 0; k <= SPAN && dry; k += 2) {
      for (let dz = 0; dz <= SPAN && dry; dz += 2) {
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

await call(() => window.__slimcity.setSpeed(0));
await call(() => window.__slimcity.setDayT(0.5));
// The camera has to hold the whole block ABOVE the drawer: its far corner
// must be both on screen and on the canvas, or the drag cannot be aimed at it
// and cannot be finished on it. Aiming south of the block pushes it up-screen.
await cam(X + SPAN / 2, Z + SPAN / 2 + 6, 900, 0.0, 1.4);
await page.waitForTimeout(800);

/**
 * The screen point that picks a given tile, by asking the app's own picker.
 *
 * Scanned only above the drawer. screenToTile is a pure projection and knows
 * nothing about what is drawn OVER the canvas, so it will happily name a tile
 * for a pixel the drawer is covering — and a drag that ends there is delivered
 * to the drawer instead of the viewport, leaving the gesture unfinished and
 * the ghost frozen where the pointer went under.
 */
const CANVAS_BOTTOM_PX = 560;
const pointFor = async (tx, tz) =>
  await call(
    ([wantX, wantZ, bottom]) => {
      const hook = window.__slimcity;
      let best = null;
      let bestD = Infinity;
      for (let sy = 60; sy < bottom; sy += 6) {
        for (let sx = 60; sx < 1340; sx += 6) {
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

// Pick the two-lane street and put the tool in Grid mode.
await page.getByRole('button', { name: 'Roads' }).click();
await page.waitForTimeout(400);
await page.getByRole('tab', { name: 'Small' }).click();
await page.waitForTimeout(200);
await page.getByRole('button', { name: /^Two-Lane Road\b/ }).click();
await page.waitForTimeout(250);
if ((await page.getByRole('button', { name: 'Grid' }).count()) === 0) {
  failures.push('the road tool offers no Grid path mode');
} else {
  await page.getByRole('button', { name: 'Grid' }).click();
  await page.waitForTimeout(300);
}

const from = await pointFor(X, Z);
const to = await pointFor(X + SPAN, Z + SPAN);
if (!from || !to || from.d > 1 || to.d > 1) {
  failures.push(`could not aim the drag at the block (best miss ${from?.d} / ${to?.d} tiles)`);
} else {
  await page.mouse.move(from.sx, from.sy, { steps: 4 });
  await page.mouse.down();
  await page.mouse.move(to.sx, to.sy, { steps: 14 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/grid-preview.png` });
  await page.mouse.up();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${out}/grid-laid.png` });

  // Measure what was LAID rather than assume where the drag landed — the
  // pointer aim is the harness's weak point, not the feature's. The bounding
  // box of the new roads is the rectangle the player actually enclosed, and
  // the grid inside it is what has to be right.
  const g = await readGrid();
  const road = (x, z) => g.roadTier[idx(x, z)] !== 0;
  let lx = Infinity;
  let hx = -Infinity;
  let lz = Infinity;
  let hz = -Infinity;
  let roadCount = 0;
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      if (!road(x, z)) continue;
      roadCount++;
      if (x < lx) lx = x;
      if (x > hx) hx = x;
      if (z < lz) lz = z;
      if (z > hz) hz = z;
    }
  }
  console.log(`roads on the map: ${roadCount}; aimed at x ${X}..${X + SPAN}, z ${Z}..${Z + SPAN}`);
  if (!Number.isFinite(lx)) {
    failures.push('the drag laid no road at all');
  } else {
    console.log(`laid rectangle: x ${lx}..${hx}, z ${lz}..${hz}`);
    const rowsWanted = [lz, hz];
    for (let at = lz + GRID_SPACING_TILES; hz - at >= GRID_SPACING_TILES; at += GRID_SPACING_TILES)
      rowsWanted.push(at);
    const colsWanted = [lx, hx];
    for (let at = lx + GRID_SPACING_TILES; hx - at >= GRID_SPACING_TILES; at += GRID_SPACING_TILES)
      colsWanted.push(at);
    console.log(`streets expected at rows ${rowsWanted} and columns ${colsWanted}`);
    if (rowsWanted.length < 3 || colsWanted.length < 3)
      failures.push(
        `the block is only ${hx - lx}×${hz - lz} tiles — too small to divide, so this run proves nothing`,
      );
    for (const z of rowsWanted)
      for (let x = lx; x <= hx; x++)
        if (!road(x, z)) failures.push(`street along z=${z} has a gap at x=${x}`);
    for (const x of colsWanted)
      for (let z = lz; z <= hz; z++)
        if (!road(x, z)) failures.push(`street down x=${x} has a gap at z=${z}`);
    // The blocks between the streets are open ground, not paved over.
    for (let z = lz + 1; z < hz; z++) {
      for (let x = lx + 1; x < hx; x++) {
        if (rowsWanted.includes(z) || colsWanted.includes(x)) continue;
        if (road(x, z)) failures.push(`the inside of a block is paved at (${x},${z})`);
      }
    }
  }
}

await cam(X + SPAN / 2, Z + SPAN / 2, 780, 0.0, 1.4);
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/grid-overhead.png` });

if (pageErrors.length > 0) failures.push(`page errors: ${pageErrors.join(' | ')}`);
console.log(failures.length === 0 ? 'PASS' : 'FAIL:\n - ' + failures.slice(0, 8).join('\n - '));
console.log('done ->', out);
await b.close();
