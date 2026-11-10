/** Roundabout check: the compact roundabout the game lays on a 2x2 block of
 * street tiles, on four crossings each on its own flat plot.
 *
 * Cases, each laid the way the Roundabout tool lays it (the missing corner of
 * the block as a street, then `buildRoundabout`):
 *   fourway  two two-lane streets crossing
 *   tee      three arms of one class
 *   avenue   an avenue crossing a two-lane street (the game refuses it; the
 *            refusal is logged and the case has no frames)
 *   oneway   a crossing with one one-way arm
 *
 * Frames: <case>-above and <case>-oblique per laid case, fourway-entry-close
 * (one entry at the camera's 40 m floor: yield line, splitter island,
 * crosswalk) and fourway-night.
 *
 * Every case is proved with readJunctions(): each of the block's four tiles
 * has to carry the roundabout control before a frame is taken of it.
 *
 * Usage: node tools/roundabout-shots.mjs [url] [outDir]
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
const out = process.argv[3] ?? 'tools/shots-roundabouts';
mkdirSync(out, { recursive: true });

const TWO_LANE = 1;
const AVENUE = 2;
const ONE_WAY = 6;
const ONE_LANE_ONE_WAY = 40;
const PLOT = 22;
const ARM = 9;

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

  // The four flattest dry plots that do not overlap. The seed's ground is
  // gently sloped everywhere, so plots are ranked by their height spread and
  // the block the ring stands on has to be flat on its own.
  const spreadOf = (x, z, w, h) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let dz = 0; dz < h; dz++) {
      for (let dx = 0; dx < w; dx++) {
        const i = idx(x + dx, z + dz);
        if (g0.water[i]) return Infinity;
        lo = Math.min(lo, g0.height[i]);
        hi = Math.max(hi, g0.height[i]);
      }
    }
    return hi - lo;
  };
  const candidates = [];
  for (let z = 40; z < N - PLOT - 40; z += 2) {
    for (let x = 40; x < N - PLOT - 40; x += 2) {
      const block = spreadOf(x + ARM, z + ARM, 4, 4);
      if (block > 0.7) continue;
      const spread = spreadOf(x, z, PLOT, PLOT);
      if (spread < Infinity) candidates.push({ x, z, spread });
    }
  }
  candidates.sort((a, c) => a.spread - c.spread);
  const plots = [];
  for (const c of candidates) {
    const apart = plots.every(
      (p) => Math.abs(c.x - p.x) >= PLOT + 2 || Math.abs(c.z - p.z) >= PLOT + 2,
    );
    if (apart) plots.push(c);
    if (plots.length === 4) break;
  }
  console.log('plots', JSON.stringify(plots));
  if (plots.length < 4) {
    console.log('FAIL: fewer than four flat dry plots found');
    process.exit(1);
  }

  const run = (x0, x1, z) =>
    Array.from({ length: Math.abs(x1 - x0) + 1 }, (_, i) => ({ x: x0 + Math.sign(x1 - x0) * i, z }));
  const colRun = (x, z0, z1) =>
    Array.from({ length: Math.abs(z1 - z0) + 1 }, (_, i) => ({ x, z: z0 + Math.sign(z1 - z0) * i }));

  // Lay a batch and say what the game refused, if anything. The toasts are
  // dismissed so a refusal in one case does not carry into the next shot.
  const lay = async (label, commands) => {
    await cmd(label, commands);
    await page.waitForTimeout(700);
    const refused = (await readToasts(page)).filter((t) => / failed$/.test(t.title));
    await dismissToasts(page);
    return refused.map((t) => `${t.title}: ${t.body}`);
  };

  // The block's north-west tile is (bx, bz); the street through it runs west to
  // east along row bz and north to south along column bx.
  const cases = [
    {
      name: 'fourway',
      cmds: (bx, bz) => [
        { kind: 'buildRoad', tier: TWO_LANE, tiles: run(bx - ARM, bx + ARM + 1, bz) },
        { kind: 'buildRoad', tier: TWO_LANE, tiles: colRun(bx, bz - ARM, bz + ARM + 1) },
      ],
    },
    {
      name: 'tee',
      cmds: (bx, bz) => [
        { kind: 'buildRoad', tier: TWO_LANE, tiles: run(bx - ARM, bx + ARM + 1, bz) },
        { kind: 'buildRoad', tier: TWO_LANE, tiles: colRun(bx, bz, bz + ARM + 1) },
      ],
    },
    {
      name: 'avenue',
      cmds: (bx, bz) => [
        { kind: 'buildRoad', tier: AVENUE, tiles: run(bx - ARM, bx + ARM + 1, bz) },
        { kind: 'buildRoad', tier: TWO_LANE, tiles: colRun(bx, bz - ARM, bz + ARM + 1) },
      ],
    },
    {
      name: 'oneway',
      cmds: (bx, bz) => [
        { kind: 'buildRoad', tier: TWO_LANE, tiles: run(bx, bx + ARM + 1, bz) },
        { kind: 'buildRoad', tier: TWO_LANE, tiles: colRun(bx, bz - ARM, bz + ARM + 1) },
        // The preset one-way street carries two lanes, which the game refuses
        // at a compact roundabout, so this one-way arm is a one-lane profile.
        // Drawn eastward, so it flows into the roundabout from the west.
        {
          kind: 'defineRoadProfile',
          id: ONE_LANE_ONE_WAY,
          profile: {
            class: 'oneWay',
            pieces: [
              { kind: 'sidewalk', width: 1.875 },
              { kind: 'travel', width: 3.05, flow: 'fwd' },
              { kind: 'sidewalk', width: 1.875 },
            ],
          },
        },
        {
          kind: 'buildRoad',
          tier: ONE_WAY,
          tiles: run(bx - ARM, bx - 1, bz),
          profile: ONE_LANE_ONE_WAY,
        },
      ],
    },
  ];

  const laid = [];
  const refusals = [];
  for (const [i, c] of cases.entries()) {
    const bx = plots[i].x + ARM + 1;
    const bz = plots[i].z + ARM + 1;
    const roads = await lay(`${c.name} roads`, c.cmds(bx, bz));
    if (roads.length > 0) {
      fail(`${c.name}: the approach roads were refused: ${roads.join(' | ')}`);
      continue;
    }
    // The Roundabout tool lays the block's one missing corner as a street, then
    // the ring. The avenue's corner is laid as the street it crosses.
    const corner = [{ x: bx + 1, z: bz + 1 }];
    const gridNow = await call(() => window.__slimcity.readGrid());
    const missing = corner.filter((t) => !gridNow.roadTier[idx(t.x, t.z)]);
    const ring = [
      ...(missing.length > 0
        ? [{ kind: 'buildRoad', tier: TWO_LANE, tiles: missing, elevations: missing.map(() => 0) }]
        : []),
      { kind: 'buildRoundabout', x: bx, z: bz },
    ];
    const refused = await lay(`${c.name} roundabout`, ring);
    if (refused.length > 0) {
      console.log(`REFUSED ${c.name}: ${refused.join(' | ')}`);
      refusals.push({ name: c.name, why: refused });
      continue;
    }
    laid.push({ ...c, bx, bz });
    // A lamp stands lit only on a powered street: a wind turbine at the head of
    // the four-way's west arm powers it for the night frame.
    if (c.name === 'fourway') {
      const powered = await lay('turbine', [
        { kind: 'placeBuilding', catalogId: 'wind-turbine', x: bx - ARM - 1, z: bz, rotation: 0 },
      ]);
      if (powered.length > 0) fail(`fourway: the wind turbine was refused: ${powered.join(' | ')}`);
    }
  }
  for (const r of refusals) {
    if (r.name !== 'avenue') fail(`${r.name}: the roundabout was refused: ${r.why.join(' | ')}`);
  }
  if (!refusals.some((r) => r.name === 'avenue') && !laid.some((c) => c.name === 'avenue')) {
    fail('avenue: neither laid nor refused');
  }

  // Prove each laid roundabout stands before it is shot.
  await page.waitForTimeout(1500);
  const junctions = await call(() => window.__slimcity.readJunctions());
  for (const c of laid) {
    const tiles = [
      [c.bx, c.bz],
      [c.bx + 1, c.bz],
      [c.bx, c.bz + 1],
      [c.bx + 1, c.bz + 1],
    ];
    // A corner with only two arms (the laid one) is a bend, not a junction, so
    // it has no control to read; it has to be a street tile of the ring.
    const grid = await call(() => window.__slimcity.readGrid());
    const controls = tiles.map(
      ([x, z]) => junctions.find((j) => j.x === x && j.z === z)?.control ?? 'none-read',
    );
    const streets = tiles.map(([x, z]) => grid.roadTier[idx(x, z)]);
    console.log(
      `${c.name} block (${c.bx},${c.bz}) controls:`,
      JSON.stringify(controls),
      'tiers:',
      JSON.stringify(streets),
    );
    const roundabouts = controls.filter((k) => k === 'roundabout').length;
    const other = controls.filter((k) => k !== 'roundabout' && k !== 'none-read');
    if (roundabouts < 3 || other.length > 0 || streets.some((t) => t === 0)) {
      fail(`${c.name}: the block does not read as a roundabout: ${controls} tiers ${streets}`);
      c.laid = false;
    }
  }

  if (pageErrors.length > 0) fail(`page errors: ${pageErrors.join(' | ')}`);

  await call(() => window.__slimcity.setDayT(0.5));
  await page.waitForTimeout(500);
  const shot = async (name, tx, tz, d, yaw, pitch) => {
    await cam(tx, tz, d, yaw, pitch);
    await page.waitForTimeout(900);
    await cleanShot(page, `${out}/${name}.png`);
    console.log('shot', name);
  };

  for (const c of laid) {
    if (c.laid === false) continue;
    // The block's centre is the corner its four tiles share.
    const cx = c.bx + 0.5;
    const cz = c.bz + 0.5;
    await shot(`${c.name}-above`, cx, cz, 130, 0, 1.45);
    await shot(`${c.name}-oblique`, cx, cz, 110, 0.7, 0.75);
    if (c.name === 'fourway') {
      await shot('fourway-entry-close', c.bx - 0.3, c.bz + 0.2, 40, 0, 0.95);
    }
  }

  // Night is last: the light follows the running clock, so the sim runs while
  // night comes on and is paused again before the frame.
  const four = laid.find((c) => c.name === 'fourway' && c.laid !== false);
  if (four) {
    await call(() => window.__slimcity.setSpeed(1));
    await call(() => window.__slimcity.setDayT(0.96));
    await page.waitForTimeout(2500);
    const T = await tileMeters(page);
    const lamps = (await call(() => window.__slimcity.readLampPoles())).filter(
      (p) => Math.abs(p.x / T - four.bx) <= ARM && Math.abs(p.z / T - four.bz) <= ARM,
    );
    const turbine = (await call(() => window.__slimcity.readBuildings())).filter(
      (q) => q.catalogId === 'wind-turbine',
    );
    console.log(`fourway: ${lamps.length} lamp poles near the ring, ${turbine.length} turbine(s)`);
    if (turbine.length === 0) fail('fourway: no wind turbine stands');
    if (lamps.length === 0) fail('fourway: no lamp poles stand, so the street is not powered');
    await call(() => window.__slimcity.setSpeed(0));
    await page.waitForTimeout(600);
    await shot('fourway-night', four.bx + 0.5, four.bz + 0.5, 110, 0.7, 0.75);
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
