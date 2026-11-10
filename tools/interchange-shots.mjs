/** Interchange check: a dual-carriageway motorway with a two-lane street
 * carried over it on a bridge, and the four slip roads of a diamond joining
 * the two, all laid by the game's own Interchange tool.
 *
 * Only the motorway is laid by command. The interchange is placed the way a
 * player does it: select the Interchange tool, aim the pointer at a motorway
 * tile and click. Nothing about its layout is written here, so what is shot is
 * what the game builds.
 *
 * Frames: diamond-above, diamond-oblique, ramp-terminal-close (40 m where a
 * ramp meets the street), gore-close (where a ramp leaves the motorway),
 * deck-join-close (where the west approach meets the deck), bridge-side,
 * diamond-night (street powered by a wind turbine).
 *
 * Proofs read back from the grid before any frame: four slip-road runs, each
 * joined both ways to the motorway at one end and to the street at the other;
 * the street on the over layer across the motorway; the ramp terminals
 * controlled; a lamp lit-street powered by the turbine.
 *
 * Usage: node tools/interchange-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import {
  cleanShot,
  dismissToasts,
  hooksReady,
  readToasts,
  tileCamera,
  tileMeters,
  unlimitedMoneyOption,
} from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-interchanges';
mkdirSync(out, { recursive: true });

const TWO_LANE = 1;
const HIGHWAY = 3;
const RAMP = 12;
const FLOW = { N: 1, S: 3 };
const BIT = { N: 1, E: 2, S: 4, W: 8 };
const REACH = 8;

const failures = [];
const fail = (m) => {
  console.log('FAIL:', m);
  failures.push(m);
};

const b = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
try {
  const page = await b.newPage({ viewport: { width: 1500, height: 950 } });
  const pageErrors = [];
  page.on('pageerror', (e) => {
    pageErrors.push(e.message);
    console.log('[pageerror]', e.message);
  });
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('[console.error]', m.text());
  });
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
  await unlimitedMoneyOption(page);
  // The tool's preview reads the sandbox unlock setting from the saved
  // settings; without it a Tiny Village sees the tool as locked and a click
  // lays nothing.
  await page.addInitScript(() => {
    try {
      const key = 'slimcity.settings';
      const saved = JSON.parse(localStorage.getItem(key) ?? '{}');
      localStorage.setItem(key, JSON.stringify({ ...saved, sandboxUnlockAll: true }));
    } catch (e) {
      void e;
    }
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#viewport canvas', { timeout: 20000 });
  await hooksReady(page);
  await page.waitForTimeout(3000);

  const call = (fn, ...a) => page.evaluate(fn, ...a);
  const cmd = (l, c) => call(([x, y]) => window.__slimcity.cmd(x, y), [l, c]);
  const cam = tileCamera(page);

  await call(() => window.__slimcity.setSpeed(0));
  await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
  await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
  await page.waitForTimeout(300);

  const g0 = await call(() => window.__slimcity.readGrid());
  const N = g0.size;
  const idx = (x, z) => z * N + x;

  // The flattest dry footprint: the motorway runs north-south in the middle,
  // the street east-west across it.
  const W = 14;
  const H = 27;
  let site = null;
  for (let z = 40; z < N - H - 40; z += 2) {
    for (let x = 40; x < N - W - 40; x += 2) {
      let lo = Infinity;
      let hi = -Infinity;
      let ok = true;
      for (let dz = 0; dz < H && ok; dz++) {
        for (let dx = 0; dx < W && ok; dx++) {
          const i = idx(x + dx, z + dz);
          if (g0.water[i] || g0.roadTier[i]) ok = false;
          lo = Math.min(lo, g0.height[i]);
          hi = Math.max(hi, g0.height[i]);
        }
      }
      if (ok && (!site || hi - lo < site.spread)) site = { x, z, spread: hi - lo };
    }
  }
  if (!site) {
    console.log('FAIL: no dry footprint found');
    process.exit(1);
  }
  console.log('site', JSON.stringify(site));
  // XL is the southbound carriageway's column, XL + 1 the northbound one; S is
  // the row the street will cross on.
  const XL = site.x + 6;
  const S = site.z + 13;

  const column = (x, z0, z1) =>
    Array.from({ length: Math.abs(z1 - z0) + 1 }, (_, i) => ({
      x,
      z: z0 + Math.sign(z1 - z0) * i,
    }));
  const south = column(XL, S - REACH - 4, S + REACH + 4);
  const north = column(XL + 1, S + REACH + 4, S - REACH - 4);
  const refusals = async () => {
    await page.waitForTimeout(700);
    const refused = (await readToasts(page)).filter((t) => / failed$/.test(t.title));
    await dismissToasts(page);
    return refused.map((t) => `${t.title}: ${t.body}`);
  };
  await cmd('southbound', [
    { kind: 'buildRoad', tier: HIGHWAY, tiles: south, flows: south.map(() => FLOW.S) },
  ]);
  await cmd('northbound', [
    { kind: 'buildRoad', tier: HIGHWAY, tiles: north, flows: north.map(() => FLOW.N) },
  ]);
  const motorwayRefused = await refusals();
  if (motorwayRefused.length > 0) fail(`motorway refused: ${motorwayRefused.join(' | ')}`);
  await page.waitForTimeout(1500);

  // --- Place the interchange with the game's tool -------------------------------
  // Look straight down on the motorway tile, find the pixel the app says is
  // that tile, and click it.
  await cam(XL, S, 120, 0, 1.45);
  await page.waitForTimeout(900);
  const px = await call(
    ([tx, tz]) => {
      let sx = 0;
      let sy = 0;
      let n = 0;
      for (let y = 100; y < 800; y += 3) {
        for (let x = 300; x < 1200; x += 3) {
          const t = window.__slimcity.screenToTile(x, y);
          if (t && t.x === tx && t.z === tz) {
            sx += x;
            sy += y;
            n++;
          }
        }
      }
      return n > 0 ? [sx / n, sy / n] : null;
    },
    [XL, S],
  );
  if (!px) throw new Error(`no pixel maps to the motorway tile (${XL},${S})`);
  await call(() => window.__slimcity.setTool('interchange'));
  await page.waitForTimeout(400);
  await page.mouse.move(px[0], px[1]);
  await page.waitForTimeout(500);
  await page.mouse.click(px[0], px[1]);
  await page.waitForTimeout(1500);
  const tool = await refusals();
  if (tool.length > 0) fail(`the Interchange tool was refused: ${tool.join(' | ')}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(2500);

  // --- Proof that the interchange stands ---------------------------------------
  const g = await call(() => window.__slimcity.readGrid());
  const junctions = await call(() => window.__slimcity.readJunctions());
  const tierAt = (x, z) => g.roadTier[idx(x, z)];
  const maskAt = (x, z) => g.roadMask[idx(x, z)];
  const overAt = (x, z) => (g.overRoads ?? []).find((o) => o.x === x && o.z === z);
  const DIRS = [
    [0, -1, BIT.N, BIT.S],
    [1, 0, BIT.E, BIT.W],
    [0, 1, BIT.S, BIT.N],
    [-1, 0, BIT.W, BIT.E],
  ];

  // The slip roads: runs of tier-12 tiles joined to each other.
  const ramps = [];
  const seen = new Set();
  for (let z = S - 16; z <= S + 16; z++) {
    for (let x = XL - 12; x <= XL + 13; x++) {
      if (tierAt(x, z) !== RAMP || seen.has(`${x},${z}`)) continue;
      const tiles = [];
      const stack = [{ x, z }];
      seen.add(`${x},${z}`);
      while (stack.length > 0) {
        const t = stack.pop();
        tiles.push(t);
        for (const [dx, dz, bit] of DIRS) {
          const n = { x: t.x + dx, z: t.z + dz };
          if (tierAt(n.x, n.z) !== RAMP || seen.has(`${n.x},${n.z}`)) continue;
          if ((maskAt(t.x, t.z) & bit) === 0) continue;
          seen.add(`${n.x},${n.z}`);
          stack.push(n);
        }
      }
      ramps.push(tiles);
    }
  }
  console.log('slip road runs:', ramps.length, 'tiles each', JSON.stringify(ramps.map((r) => r.length)));
  if (ramps.length !== 4) fail(`${ramps.length} slip road runs stand, wanted 4`);
  const streetJoins = new Set();
  for (const [i, tiles] of ramps.entries()) {
    const joins = (tier) => {
      const found = [];
      for (const t of tiles) {
        for (const [dx, dz, bit, back] of DIRS) {
          const n = { x: t.x + dx, z: t.z + dz };
          if (tierAt(n.x, n.z) !== tier) continue;
          if ((maskAt(t.x, t.z) & bit) !== 0 && (maskAt(n.x, n.z) & back) !== 0) found.push(n);
        }
      }
      return found;
    };
    const mw = joins(HIGHWAY);
    const st = joins(TWO_LANE);
    console.log(`ramp ${i}: joined to motorway at ${JSON.stringify(mw)}, to street at ${JSON.stringify(st)}`);
    if (mw.length !== 1) fail(`ramp ${i} joins the motorway at ${mw.length} tiles, wanted 1`);
    if (st.length !== 1) fail(`ramp ${i} joins the street at ${st.length} tiles, wanted 1`);
    for (const t of st) streetJoins.add(`${t.x},${t.z}`);
  }
  for (const k of streetJoins) {
    const [x, z] = k.split(',').map(Number);
    const j = junctions.find((q) => q.x === x && q.z === z);
    console.log(`terminal junction (${x},${z}):`, JSON.stringify(j ?? null));
    if (!j || j.control === 'none') fail(`the ramp terminal at (${x},${z}) takes no control`);
  }
  for (const k of [XL, XL + 1]) {
    if (!overAt(k, S)) fail(`the street does not pass over the motorway at (${k},${S})`);
    if (tierAt(k, S) !== HIGHWAY) fail(`no motorway under the bridge at (${k},${S})`);
  }

  // The street along its row, tile by tile: is it one road across the motorway?
  console.log('street row, west to east (x: ground tier/mask/elev | over layer):');
  let streetFrom = null;
  let streetTo = null;
  for (let x = XL - 10; x <= XL + 11; x++) {
    const o = overAt(x, S);
    if (tierAt(x, S) === TWO_LANE || (o && o.tier === TWO_LANE)) {
      streetFrom ??= x;
      streetTo = x;
    }
    console.log(
      `  ${x}: t${tierAt(x, S)} m${maskAt(x, S)} e${g.roadElevation[idx(x, S)].toFixed(2)} | ` +
        (o ? `over t${o.tier} m${o.mask} e${o.elevation.toFixed(2)}` : '-'),
    );
  }
  if (streetFrom === null) fail('no street stands on the crossing row');

  if (pageErrors.length > 0) fail(`page errors: ${pageErrors.join(' | ')}`);

  // --- Power for the night: a turbine at the street's west end -------------------
  const turbineRefused = [];
  if (streetFrom !== null) {
    await cmd('turbine', [
      { kind: 'placeBuilding', catalogId: 'wind-turbine', x: streetFrom - 1, z: S, rotation: 0 },
    ]);
    turbineRefused.push(...(await refusals()));
  }
  if (turbineRefused.length > 0) fail(`the wind turbine was refused: ${turbineRefused.join(' | ')}`);

  const shot = async (name, tx, tz, d, yaw, pitch) => {
    await cam(tx, tz, d, yaw, pitch);
    await page.waitForTimeout(1000);
    await cleanShot(page, `${out}/${name}.png`);
    console.log('shot', name);
  };

  if (failures.length === 0) {
    await call(() => window.__slimcity.setDayT(0.5));
    await page.waitForTimeout(500);
    const cx = XL + 1;
    // The ramp that meets the street west of the bridge, and where the street
    // comes up to the deck: the first tile west of the motorway with a lift.
    const west = [...streetJoins].map((k) => k.split(',').map(Number)).sort((a, c) => a[0] - c[0])[0];
    await shot('diamond-above', cx, S, 260, 0, 1.45);
    await shot('diamond-oblique', cx, S, 230, 0.7, 0.8);
    await shot('ramp-terminal-close', west[0] + 0.5, S, 40, 0, 0.95);
    const gore = ramps
      .flat()
      .filter((t) => t.x < XL)
      .sort((a, c) => a.z - c.z)[0];
    await shot('gore-close', gore.x + 0.5, gore.z, 40, 0.4, 1.0);
    await shot('deck-join-close', XL - 1.5, S, 40, 0, 0.6);
    await shot('bridge-side', cx, S, 110, 0, 0.2);

    // Night is last: the light follows the running clock, so the sim runs
    // while night comes on and is paused again before the frame.
    await call(() => window.__slimcity.setSpeed(1));
    await call(() => window.__slimcity.setDayT(0.96));
    await page.waitForTimeout(2500);
    const T = await tileMeters(page);
    const lamps = (await call(() => window.__slimcity.readLampPoles())).filter(
      (p) => Math.abs(p.x / T - XL) <= 10 && Math.abs(p.z / T - S) <= 10,
    );
    console.log(`${lamps.length} lamp poles near the interchange`);
    if (lamps.length === 0) fail('no lamp poles stand near the interchange: the street is not powered');
    await call(() => window.__slimcity.setSpeed(0));
    await page.waitForTimeout(600);
    await shot('diamond-night', cx, S, 230, 0.7, 0.8);
  }
} catch (e) {
  fail(`exception: ${e.message}`);
} finally {
  await b.close();
}

if (failures.length > 0) {
  console.log('FAIL');
  for (const f of failures) console.log(' -', f);
  process.exit(1);
}
console.log('PASS');
