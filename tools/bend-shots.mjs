/** Shots of a bend: two straight runs of one road meeting at an angle, which the road turns
 * through on one arc, the kerbs, footways, lane lines and median sweeping about it. For each of
 * two-lane, avenue, four-lane, one-way and gravel, the runs meet 30, 60, 90 and 120 degrees off
 * straight, laid on flat dry ground with the game's own buildSegment command, and shot from
 * straight above (~120 m) and from an oblique angle (~70 m). Two last frames are the 60 degree
 * two-lane bend with vehicles stood on it, each at a point of the bend's centre line read from
 * the shared bend geometry and facing along it, in both directions, so the renderer's own lane
 * offset puts each in its lane.
 *
 * Usage: node tools/bend-shots.mjs [baseUrl] [outDir]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { cleanShot, hooksReady, tileCamera, unlimitedMoneyOption } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-bends';
mkdirSync(out, { recursive: true });

const SEED = 12345;
const RT = { TwoLane: 1, Avenue: 2, Gravel: 4, OneWay: 6, FourLane: 7 };
const VEHICLE = { Car: 0, Truck: 1, Bus: 2 };
/** One free segment is one way when its flow is 1; every other kind is two-way. */
const KINDS = [
  { name: 'two-lane', tier: RT.TwoLane, flow: 0 },
  { name: 'avenue', tier: RT.Avenue, flow: 0 },
  { name: 'four-lane', tier: RT.FourLane, flow: 0 },
  { name: 'one-way', tier: RT.OneWay, flow: 1 },
  { name: 'gravel', tier: RT.Gravel, flow: 0 },
];
const DEFLECTIONS = [30, 60, 90, 120];
/** Each run's length, metres: long enough that no kind's arc is held short. */
const ARM_M = 90;
/** A scene's ground, tiles on a side: the flattest dry block left is taken. */
const SITE_TILES = 14;
const ABOVE_M = 120;
const OBLIQUE_M = 70;
const OBLIQUE_PITCH = 0.9;
const START_MILESTONE = 2;

const b = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const context = await b.newContext({ viewport: { width: 1400, height: 900 } });
const initSession = (session) =>
  context.addInitScript(
    ([s]) => {
      try {
        sessionStorage.setItem('slimcity.session', JSON.stringify(s));
        localStorage.setItem(
          'slimcity.settings',
          JSON.stringify({ sandboxUnlockAll: true, unlimitedMoney: true }),
        );
      } catch (e) {
        void e;
      }
    },
    [session],
  );

try {
  // A scratch page stores a save at a milestone the town page then loads.
  await initSession({ screen: 'playing', seed: SEED, mode: 'new' });
  const boot = await context.newPage();
  await boot.goto(url, { waitUntil: 'domcontentloaded' });
  await boot.waitForSelector('#viewport canvas', { timeout: 60000 });
  await hooksReady(boot);
  const saveId = await boot.evaluate(async (level) => {
    const sim = await import('/tests/support/sim.ts');
    const persist = await import('/src/app/persist.ts');
    const h = sim.initializedAtMilestone(level);
    h.sim.handleMessage({ type: 'requestSave' });
    await persist.storeSave(sim.latestSaveData(h));
    return (await persist.listSaves())[0].id;
  }, START_MILESTONE);
  await boot.close();
  await initSession({ screen: 'playing', seed: 0, mode: 'load', saveId });
  const page = await context.newPage();
  await unlimitedMoneyOption(page);
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#viewport canvas', { timeout: 60000 });
  await hooksReady(page);

  const call = (fn, ...a) => page.evaluate(fn, ...a);
  const cmd = (l, c) => call(([x, y]) => window.__slimcity.cmd(x, y), [l, c]);
  const readGrid = () => call(() => window.__slimcity.readGrid());
  const cam = tileCamera(page);
  const T = await call(() => window.__slimcity.tileMeters());
  const shot = async (name, settle = 1200) => {
    await page.waitForTimeout(settle);
    await cleanShot(page, `${out}/${name}.png`);
    console.log('shot', name);
  };
  /** Centres a camera on a point in metres. */
  const look = (x, z, distance, yaw, pitch) => cam(x / T - 0.5, z / T - 0.5, distance, yaw, pitch);
  const cm = (metres) => Math.round(metres * 100);

  await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
  await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
  await call(() => {
    window.__slimcity.setSpeed(0);
    window.__slimcity.setDayT(0.5);
  });

  // --- ground: the flattest dry sites, none overlapping --------------------------
  const g = await readGrid();
  const N = g.size;
  const idx = (x, z) => z * N + x;
  const taken = new Uint8Array(N * N);
  /** The flattest dry block of tiles not yet used, or null. */
  const claimSite = (w, d) => {
    let best = null;
    for (let z = 20; z < N - d - 20; z += 2) {
      for (let x = 20; x < N - w - 20; x += 2) {
        let lo = Infinity;
        let hi = -Infinity;
        let ok = true;
        for (let dz = 0; dz < d && ok; dz += 2) {
          for (let dx = 0; dx < w && ok; dx += 2) {
            const i = idx(x + dx, z + dz);
            if (g.water[i] || taken[i] || g.roadTier[i] !== 0) ok = false;
            lo = Math.min(lo, g.height[i]);
            hi = Math.max(hi, g.height[i]);
          }
        }
        if (ok && (!best || hi - lo < best.spread)) best = { x, z, spread: hi - lo };
      }
    }
    if (!best) return null;
    for (let dz = -1; dz <= d; dz++)
      for (let dx = -1; dx <= w; dx++) taken[idx(best.x + dx, best.z + dz)] = 1;
    return best;
  };

  /** Lays two runs meeting at node `n` (metres), the second turned `deg` degrees off the first's line. */
  const layBend = async (kind, deg, n) => {
    const rad = (deg * Math.PI) / 180;
    const start = { x: n.x - ARM_M, z: n.z };
    const end = { x: n.x + Math.cos(rad) * ARM_M, z: n.z + Math.sin(rad) * ARM_M };
    for (const [a, c] of [
      [start, n],
      [n, end],
    ]) {
      await cmd(`${kind.name} ${deg}`, [
        {
          kind: 'buildSegment',
          tier: kind.tier,
          a: { x: cm(a.x), z: cm(a.z) },
          b: { x: cm(c.x), z: cm(c.z) },
          flow: kind.flow,
        },
      ]);
    }
    return { start, end };
  };
  const siteNode = (site) => ({
    x: (site.x + SITE_TILES / 2) * T,
    z: (site.z + SITE_TILES / 2 - 2) * T,
  });

  // --- the scenes --------------------------------------------------------------
  for (const kind of KINDS) {
    for (const deg of DEFLECTIONS) {
      const site = claimSite(SITE_TILES, SITE_TILES);
      if (!site) {
        console.log(`WARNING: no flat site left for ${kind.name} ${deg}`);
        continue;
      }
      const n = siteNode(site);
      await layBend(kind, deg, n);
      await page.waitForTimeout(500);
      const name = `${kind.name}-${deg}`;
      await look(n.x, n.z, ABOVE_M, 0, Math.PI / 2);
      await shot(`${name}-above`, 1000);
      await look(n.x, n.z, OBLIQUE_M, 0.6, OBLIQUE_PITCH);
      await shot(`${name}-oblique`, 1000);
    }
  }

  // --- a free run off the end of a grid street, which is how a player draws a bend --------
  for (const kind of KINDS.filter((k) => k.name === 'two-lane' || k.name === 'avenue')) {
    for (const deg of [30, 60, 90]) {
      const site = claimSite(SITE_TILES, SITE_TILES);
      if (!site) {
        console.log(`WARNING: no flat site left for grid ${kind.name} ${deg}`);
        continue;
      }
      const z = site.z + 4;
      const tiles = Array.from({ length: 9 }, (_, i) => ({ x: site.x + 1 + i, z }));
      await cmd(`grid ${kind.name}`, [{ kind: 'buildRoad', tier: kind.tier, tiles }]);
      const end = tiles[tiles.length - 1];
      const n = { x: (end.x + 0.5) * T, z: (end.z + 0.5) * T };
      const rad = (deg * Math.PI) / 180;
      await cmd(`grid ${kind.name} ${deg}`, [
        {
          kind: 'buildSegment',
          tier: kind.tier,
          a: { x: cm(n.x), z: cm(n.z) },
          b: { x: cm(n.x + Math.cos(rad) * ARM_M), z: cm(n.z + Math.sin(rad) * ARM_M) },
          flow: 0,
        },
      ]);
      await page.waitForTimeout(500);
      const name = `grid-${kind.name}-${deg}`;
      await look(n.x - 20, n.z + 10, ABOVE_M, 0, Math.PI / 2);
      await shot(`${name}-above`, 1000);
      await look(n.x - 20, n.z + 10, OBLIQUE_M, 0.6, OBLIQUE_PITCH);
      await shot(`${name}-oblique`, 1000);
    }
  }

  // --- vehicles on the 60 degree two-lane bend -----------------------------------
  const site = claimSite(SITE_TILES, SITE_TILES);
  if (!site) throw new Error('no flat site for the vehicles');
  const n = siteNode(site);
  const laid = await layBend(KINDS[0], 60, n);
  await page.waitForTimeout(600);
  // The bend's centre line, from the same geometry the renderer and the sim read.
  const stand = await call(
    async ([node, start, end, arm, tier, share]) => {
      const geom = await import('/src/shared/roadgeom.ts');
      const prof = await import('/src/shared/roadprofile.ts');
      const toCm = (p) => ({ x: Math.round(p.x * 100), z: Math.round(p.z * 100) });
      const bend = geom.bendBetween(
        { geom: { a: toCm(start), b: toCm(node), control: null }, atA: false },
        { geom: { a: toCm(node), b: toCm(end), control: null }, atA: true },
        prof.bendRadiusOf(prof.presetProfileForTier(tier)),
        [arm * share, arm * share],
      );
      const path = bend.path;
      const length = path[path.length - 1].s;
      // A point `d` metres along the centre line from the arc's middle, carried on straight
      // along the runs beyond either end of the bend.
      const first = path[0];
      const last = path[path.length - 1];
      const at = (d) => {
        const s = path[bend.middle].s + d;
        if (s <= 0)
          return {
            x: first.x + first.hx * s,
            z: first.z + first.hz * s,
            hx: first.hx,
            hz: first.hz,
          };
        if (s >= length) {
          const over = s - length;
          return {
            x: last.x + last.hx * over,
            z: last.z + last.hz * over,
            hx: last.hx,
            hz: last.hz,
          };
        }
        let i = 0;
        while (i < path.length - 2 && path[i + 1].s < s) i++;
        const p = path[i];
        const q = path[i + 1];
        const u = q.s === p.s ? 0 : (s - p.s) / (q.s - p.s);
        return { x: p.x + (q.x - p.x) * u, z: p.z + (q.z - p.z) * u, hx: p.hx, hz: p.hz };
      };
      // Forward vehicles drive first run to second; the others come back, on the other lane.
      return [
        [-26, 1, 0],
        [-2, 0, 0],
        [22, 2, 0],
        [-14, 0, 1],
        [10, 1, 1],
        [34, 0, 1],
      ].map(([f, kind, back]) => {
        const p = at(f);
        const hx = back ? -p.hx : p.hx;
        const hz = back ? -p.hz : p.hz;
        return { x: p.x, z: p.z, heading: Math.atan2(hx, hz), kind };
      });
    },
    [n, laid.start, laid.end, ARM_M, RT.TwoLane, 0.45],
  );
  const kinds = [VEHICLE.Truck, VEHICLE.Car, VEHICLE.Bus, VEHICLE.Car, VEHICLE.Truck, VEHICLE.Car];
  const list = stand.map((v, i) => ({ ...v, kind: kinds[i] }));
  await call((l) => window.__slimcity.setVehicles(l), list);
  await page.waitForTimeout(600);
  const drawn = await call(() => window.__slimcity.readVehicles());
  console.log('vehicles stood', drawn.length, 'of', list.length);
  await look(n.x, n.z, 70, 0.4, 1.0);
  await shot('vehicles-60-two-lane-oblique', 800);
  await look(n.x, n.z, 55, 0, Math.PI / 2);
  await shot('vehicles-60-two-lane-above', 800);
} finally {
  await b.close();
}
