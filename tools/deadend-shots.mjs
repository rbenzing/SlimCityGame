/** Shots of how a street ends: the plain dead end, with homes beside it, on a
 * two-lane and a four-lane road, a one-tile stub, an off-grid curved street and
 * a dead end whose facing tile holds a building; then the cul-de-sac, empty,
 * with homes round it and offset to each side.
 *
 * Homes are placed by command along each street with the sim paused, as the
 * house shots do. Each scenario gets its own patch of flat dry ground.
 *
 * Usage: node tools/deadend-shots.mjs [baseUrl] [outDir] [scenario...]
 *   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { cleanShot, closeUp, dismissToasts, hooksReady, tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'tools/shots-deadend';
const only = process.argv.slice(4);
mkdirSync(out, { recursive: true });

const SEED = 7;
const TWO_LANE = 1;
const FOUR_LANE = 7;
const TILE_CM = 2000;
const TOP_DOWN = 1.45;
const OBLIQUE = 0.7;

const browser = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.addInitScript(
  ([session]) => {
    try {
      sessionStorage.setItem('slimcity.session', JSON.stringify(session));
      localStorage.setItem(
        'slimcity.settings',
        JSON.stringify({ sandboxUnlockAll: true, unlimitedMoney: true }),
      );
    } catch (e) {
      void e;
    }
  },
  [{ screen: 'playing', seed: SEED, mode: 'new' }],
);

try {
  await page.goto(base + '?nobloom', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#viewport canvas', { timeout: 60000 });
  await hooksReady(page);
  const cam = tileCamera(page);
  const send = (label, commands) =>
    page.evaluate(([l, c]) => window.__slimcity.cmd(l, c), [label, commands]);
  await send('Sandbox', [{ kind: 'setSandbox', on: true }]);
  await send('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
  await page.evaluate(() => {
    window.__slimcity.setSpeed(0);
    window.__slimcity.setDayT(0.5);
  });

  const g = await page.evaluate(() => window.__slimcity.readGrid());
  const N = g.size;
  const idx = (x, z) => z * N + x;
  const used = new Set();
  const flatDry = (x, z, h0) =>
    x >= 0 &&
    z >= 0 &&
    x < N &&
    z < N &&
    !used.has(idx(x, z)) &&
    !g.water[idx(x, z)] &&
    Math.abs(g.height[idx(x, z)] - h0) <= 4;
  /** The first flat dry w x d patch, claimed so the next scenario stands elsewhere. */
  const claim = (w, d) => {
    for (let z = 20; z < N - d - 20; z++) {
      for (let x = 20; x < N - w - 20; x++) {
        const h0 = g.height[idx(x, z)];
        let ok = true;
        for (let dz = 0; dz < d && ok; dz++)
          for (let dx = 0; dx < w && ok; dx++) if (!flatDry(x + dx, z + dz, h0)) ok = false;
        if (!ok) continue;
        for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) used.add(idx(x + dx, z + dz));
        return { x, z };
      }
    }
    throw new Error(`no flat dry ${w}x${d} patch`);
  };

  const place = (catalogId, x, z, rotation) =>
    send('Home', [{ kind: 'placeBuilding', catalogId, x, z, rotation }]);
  const shoot = async (name, tx, tz, distance, yaw, pitch, scale = 2) => {
    const restore = scale > 1 ? await closeUp(page, scale) : null;
    await cam(tx, tz, distance, yaw, pitch);
    await page.waitForTimeout(1500);
    await cleanShot(page, `${out}/${name}.png`);
    if (restore) await restore();
  };
  /** Top-down and oblique frames of the end at tile (ex, ez), from the side the street leaves by. */
  const frames = async (name, ex, ez, yaw = 0) => {
    await shoot(`${name}-top`, ex - 0.3, ez, 40, yaw, TOP_DOWN);
    await shoot(`${name}-oblique`, ex - 2, ez + 0.5, 50, yaw - 0.9, OBLIQUE);
  };

  /** A street running east along row `r` from x0 to x1 (the end), homes both sides. */
  const eastStreet = async (name, tier, w) => {
    const { x, z } = claim(16, 9);
    const r = z + 4;
    const x1 = x + 12;
    await send('Street', [
      {
        kind: 'buildRoad',
        tier,
        tiles: Array.from({ length: x1 - x + 1 }, (_, i) => ({ x: x + i, z: r })),
      },
    ]);
    // Rotation 0 fronts south (north side of the street); 2 fronts north.
    for (let i = 0; i <= 12; i++) {
      await place('res-normal-1', x + i, r - 2, 0);
      await place('res-normal-1', x + i, r + 1, 2);
    }
    await page.waitForTimeout(1000);
    await frames(name, x1, r);
    return { x, r, x1 };
  };

  const wanted = (n) => only.length === 0 || only.includes(n);

  if (wanted('two-lane')) await eastStreet('two-lane', TWO_LANE);
  if (wanted('four-lane')) await eastStreet('four-lane', FOUR_LANE);

  if (wanted('stub')) {
    const { x, z } = claim(8, 8);
    await send('Stub', [{ kind: 'buildRoad', tier: TWO_LANE, tiles: [{ x: x + 3, z: z + 3 }] }]);
    await place('res-normal-1', x + 3, z + 1, 0);
    await place('res-normal-1', x + 3, z + 4, 2);
    await frames('stub', x + 4, z + 3);
  }

  if (wanted('blocked')) {
    const { x, z } = claim(16, 9);
    const r = z + 4;
    await send('Street', [
      {
        kind: 'buildRoad',
        tier: TWO_LANE,
        tiles: Array.from({ length: 9 }, (_, i) => ({ x: x + i, z: r })),
      },
    ]);
    await place('wind-turbine', x + 9, r, 0);
    for (let i = 0; i <= 8; i++) {
      await place('res-normal-1', x + i, r - 2, 0);
      await place('res-normal-1', x + i, r + 1, 2);
    }
    await page.waitForTimeout(1000);
    await frames('blocked', x + 8, r);
  }

  if (wanted('free')) {
    const { x, z } = claim(18, 12);
    const px = (t) => (t + 0.5) * TILE_CM;
    await send('Free street', [
      {
        kind: 'buildSegment',
        tier: TWO_LANE,
        a: { x: px(x + 1), z: px(z + 8) },
        b: { x: px(x + 14), z: px(z + 5) },
        control: { x: px(x + 8), z: px(z + 8) },
      },
    ]);
    // Homes beside the curve: one each side per tile it passes through. A tile
    // the road only grazes may refuse one, so refusals here are dismissed.
    const seen = new Set();
    for (let s = 0; s <= 40; s++) {
      const t = s / 40;
      const ax = x + (1 - t) * (1 - t) + 16 * t * (1 - t) + 14 * t * t;
      const az = z + 8 - 3 * t * t;
      const tx = Math.floor(ax);
      const tz = Math.floor(az);
      if (seen.has(tx) || tx < x + 3 || tx > x + 13) continue;
      seen.add(tx);
      await place('res-normal-1', tx, tz - 2, 0);
      await place('res-normal-1', tx, tz + 1, 2);
    }
    await page.waitForTimeout(1000);
    await dismissToasts(page);
    await frames('free', x + 14, z + 5);
  }

  /**
   * The pixel at fraction (fx, fz) across tile (tx, tz) as the camera sees it,
   * so the game's own tool can be pointed at a side of a tile.
   */
  const pixelOn = (tx, tz, fx, fz) =>
    page.evaluate(
      ([x, z, a, b]) => {
        let x0 = Infinity;
        let x1 = -Infinity;
        let y0 = Infinity;
        let y1 = -Infinity;
        for (let y = 60; y < 780; y += 2) {
          for (let px = 20; px < 1260; px += 2) {
            const t = window.__slimcity.screenToTile(px, y);
            if (t && t.x === x && t.z === z) {
              x0 = Math.min(x0, px);
              x1 = Math.max(x1, px);
              y0 = Math.min(y0, y);
              y1 = Math.max(y1, y);
            }
          }
        }
        return Number.isFinite(x0) ? [x0 + (x1 - x0) * a, y0 + (y1 - y0) * b] : null;
      },
      [tx, tz, fx, fz],
    );

  /**
   * A street that ends going east at the returned tile, laid as the game lays one.
   * The street runs along row r from x to the end.
   */
  const bulbStreet = async (w, d) => {
    const { x, z } = claim(w, d);
    const r = z + Math.floor(d / 2);
    const x1 = x + 8;
    await send('Street', [
      {
        kind: 'buildRoad',
        tier: TWO_LANE,
        tiles: Array.from({ length: x1 - x + 1 }, (_, i) => ({ x: x + i, z: r })),
      },
    ]);
    return { x, r, x1 };
  };

  /** Points the Cul-de-sac tool at the street's end, on the given half of the tile, and optionally clicks. */
  const pointTool = async (ex, er, south, click) => {
    await cam(ex, er, 60, 0, TOP_DOWN);
    await page.waitForTimeout(900);
    await page.evaluate(() => window.__slimcity.setTool('culdesac'));
    await page.waitForTimeout(400);
    const px = await pixelOn(ex, er, 0.5, south ? 0.85 : 0.15);
    if (!px) throw new Error(`no pixel maps to the end tile (${ex},${er})`);
    await page.mouse.move(px[0], px[1]);
    await page.waitForTimeout(600);
    if (click) {
      await page.mouse.click(px[0], px[1]);
      await page.waitForTimeout(1500);
    }
  };

  if (wanted('culdesac-ghost')) {
    const { x1, r } = await bulbStreet(24, 12);
    await pointTool(x1, r, true, false);
    await shoot('culdesac-ghost', x1 + 1, r + 0.5, 60, 0, TOP_DOWN, 1);
    await page.keyboard.press('Escape');
  }

  if (wanted('culdesac-refused')) {
    const { x1, r } = await bulbStreet(24, 12);
    // Mid-street, not a dead end.
    await cam(x1 - 3, r, 60, 0, TOP_DOWN);
    await page.waitForTimeout(900);
    await page.evaluate(() => window.__slimcity.setTool('culdesac'));
    const px = await pixelOn(x1 - 3, r, 0.5, 0.5);
    await page.mouse.move(px[0], px[1]);
    await page.waitForTimeout(600);
    await shoot('culdesac-refused', x1 - 2, r, 60, 0, TOP_DOWN, 1);
    await page.keyboard.press('Escape');
  }

  /** An east-going street with a cul-de-sac beyond its end, on the south side when `south`. */
  const bulb = async (name, south) => {
    const { x1, r } = await bulbStreet(24, 12);
    await pointTool(x1, r, south, true);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);
    const block = { x: x1 + 1, z: south ? r : r - 1 };
    return { x1, r, block };
  };

  const readBuildings = () => page.evaluate(() => window.__slimcity.readBuildings());
  const run = (speed) => page.evaluate((s) => window.__slimcity.setSpeed(s), speed);

  /**
   * Homes the game grows itself: zone the ground round the block and along the
   * street low-density residential, supply power and water, and run time until
   * they stand. Returns the tiles zoned.
   */
  const growAround = async (x, r, x1, bx, bz, south) => {
    const rect = (xa, za, xb, zb) => {
      const tiles = [];
      for (let zz = za; zz <= zb; zz++)
        for (let xx = xa; xx <= xb; xx++) tiles.push({ x: xx, z: zz });
      return tiles;
    };
    // The block's own tiles are road; zone every side of it and the street's two sides.
    const lo = south ? r : r - 1;
    const hi = lo + 1;
    const zones = [
      ...rect(x + 2, r - 3, bx + 4, lo - 1),
      ...rect(x + 2, hi + 1, bx + 4, hi + 3).filter((t) => !(t.z <= r + 0 && t.x > x1)),
      ...rect(bx + 2, lo, bx + 4, hi),
    ];
    const free = zones.filter(
      (t, i) =>
        !zones.some((u, j) => j < i && u.x === t.x && u.z === t.z) && !(t.z === r && t.x <= x1),
    );
    await send('Power', [
      { kind: 'placeBuilding', catalogId: 'wind-turbine', x, z: r - 1, rotation: 0 },
    ]);
    await send('Water', [
      { kind: 'placeBuilding', catalogId: 'water-tower', x: x + 1, z: r - 1, rotation: 0 },
    ]);
    await send('Zone', [{ kind: 'paintZone', zone: 1, tiles: free }]);
    const near = (b) => b.x >= x + 2 && b.x <= bx + 6 && b.z >= r - 5 && b.z <= r + 6;
    await run(4);
    let standing = 0;
    for (let i = 0; i < 90; i++) {
      await page.waitForTimeout(2000);
      const here = (await readBuildings()).filter(near);
      standing = here.filter((b) => b.catalogId.startsWith('res')).length;
      const building = here.filter((b) => b.state === 0 || b.state === 1).length;
      if (standing >= 14 && building === 0) break;
    }
    await run(0);
    await page.waitForTimeout(1500);
    console.log(`grown homes near the bulb: ${standing}`);
    return free;
  };

  for (const [name, south] of [
    ['culdesac-grown-south', true],
    ['culdesac-grown-north', false],
  ]) {
    if (!wanted(name) && !wanted('culdesac-grown')) continue;
    const { x1, r, block } = await bulb(name, south);
    const { x: bx, z: bz } = block;
    await growAround(x1 - 8, r, x1, bx, bz, south);
    await dismissToasts(page);
    await shoot(`${name}-top`, bx + 0.5, bz + 0.5, 60, 0, TOP_DOWN);
    await shoot(`${name}-oblique`, bx + 0.5, bz + 0.5, 70, -0.9, OBLIQUE);
    await shoot(`${name}-oblique-east`, bx + 0.5, bz + 0.5, 70, 0.9, OBLIQUE);
  }

  if (wanted('culdesac-cars')) {
    const { x1, r, block } = await bulb('cars', true);
    const { x: bx, z: bz } = block;
    const x = x1 - 8;
    // A second street north off the first, with shops along it, so the homes have somewhere to drive.
    // The shops are placed before the homes grow so the zoning leaves their ground alone.
    const xc = x + 3;
    await send('Second street', [
      {
        kind: 'buildRoad',
        tier: TWO_LANE,
        tiles: Array.from({ length: 5 }, (_, i) => ({ x: xc, z: r - 5 + i })),
      },
    ]);
    for (const zz of [r - 5, r - 3]) {
      await place('com-low-1', xc - 2, zz, 1);
      await place('com-low-1', xc + 1, zz, 3);
    }
    await growAround(x, r, x1, bx, bz, true);
    await dismissToasts(page);
    const standing = (await readBuildings()).filter((b) => b.catalogId.startsWith('com')).length;
    console.log(`shops standing: ${standing}`);
    await run(4);
    await page.waitForTimeout(20000);
    await run(1);
    console.log(
      'cars after the run-up:',
      (await page.evaluate(() => window.__slimcity.readVehicles())).length,
    );
    // The disc of the circle, in metres, from the block's corner.
    const cx = (bx + 1) * 20;
    const cz = (bz + 1) * 20;
    const seen = [];
    let mostCars = 0;
    let framesTaken = 0;
    for (let i = 0; i < 240 && framesTaken < 6; i++) {
      await page.waitForTimeout(250);
      const cars = await page.evaluate(() => window.__slimcity.readVehicles());
      mostCars = Math.max(mostCars, cars.length);
      const onBlock = cars.filter((c) => Math.hypot(c.x - cx, c.z - cz) < 16);
      for (const c of onBlock) seen.push(Math.hypot(c.x - cx, c.z - cz));
      if (onBlock.length > 0 && i % 4 === 0) {
        await shoot(`culdesac-cars-${framesTaken++}`, bx + 0.5, bz + 0.5, 40, 0, TOP_DOWN, 1);
      }
    }
    await run(0);
    const lo = seen.length ? Math.min(...seen).toFixed(1) : 'none';
    const hi = seen.length ? Math.max(...seen).toFixed(1) : 'none';
    console.log(
      `car samples on the block: ${seen.length}, radius ${lo}..${hi} m (most cars anywhere: ${mostCars})`,
    );
  }

  if (wanted('culdesac-empty')) {
    const { block } = await bulb('empty', true);
    await shoot('culdesac-empty-top', block.x + 0.5, block.z + 0.5, 60, 0, TOP_DOWN);
    await shoot('culdesac-empty-oblique', block.x + 0.5, block.z + 0.5, 70, -0.9, OBLIQUE);
  }
} finally {
  await browser.close();
}
