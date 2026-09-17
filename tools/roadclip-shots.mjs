/** Terrain-vs-road clipping sweep: roads of every size, at every deck height,
 * across every grade the game will let one be built on — looking for
 * configurations where the GROUND stands proud of the road surface.
 *
 * A road deck is flat across its tile. The terrain quad under it is not: its
 * corners are shared with the neighbours, so on a slope the interpolated
 * ground inside the tile can rise above a deck that is level. That is measured
 * here rather than judged from a screenshot — terrainHeightAt() reports the
 * surface a player actually sees, and the deck is the tile's own height plus
 * whatever elevation the road was laid at.
 *
 * Usage: node tools/roadclip-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-roadclip';
/** `junctions` runs only the junction sweep — no refused runs, so no toasts. */
const only = process.argv[4] ?? 'all';
const runs = (what) => only === 'all' || only === what;
mkdirSync(out, { recursive: true });

const TILE_M = 20;
/** Steepest grade a road may be built across, metres of height per tile. */
const ROAD_MAX_SLOPE = 10;
/** Ground standing this far above the deck is visible clipping, not z-fighting. */
const INTRUSION_EPS_M = 0.05;

const TIERS = [
  { tier: 1, name: 'Two-Lane' },
  { tier: 7, name: 'Four-Lane' },
  { tier: 2, name: 'Avenue' },
  { tier: 3, name: 'Highway' },
  { tier: 4, name: 'Gravel' },
];
const ELEVATIONS = [0, 2, 6, 12];
const RUN_TILES = 8;

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

await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
await page.waitForTimeout(400);

const g0 = await readGrid();
const N = g0.size;
const idx = (x, z) => z * N + x;

/** The steepest step between neighbouring tiles along a run, in metres. */
const runGrade = (x, z, len) => {
  let worst = 0;
  for (let i = 0; i < len; i++) {
    const a = g0.height[idx(x + i, z)];
    const c = g0.height[idx(x + i + 1, z)];
    if (!Number.isFinite(a) || !Number.isFinite(c)) return Infinity;
    worst = Math.max(worst, Math.abs(c - a));
  }
  return worst;
};
const runIsDry = (x, z, len) => {
  for (let i = 0; i <= len; i++) for (let dz = -1; dz <= 1; dz++)
    if (g0.water[idx(x + i, z + dz)]) return false;
  return true;
};

// Candidate runs in three grade bands, so the sweep covers flat ground, a
// moderate hillside, and the steepest a road is allowed on at all.
const BANDS = [
  { name: 'flat', lo: 0, hi: 0.5 },
  { name: 'gentle', lo: 2, hi: 5 },
  { name: 'steep', lo: 7, hi: ROAD_MAX_SLOPE },
];
const sites = new Map();
for (let z = 30; z < N - 30; z += 3) {
  for (let x = 30; x < N - 40; x += 3) {
    if (!runIsDry(x, z, RUN_TILES)) continue;
    const grade = runGrade(x, z, RUN_TILES);
    for (const band of BANDS) {
      if (grade < band.lo || grade > band.hi) continue;
      const have = sites.get(band.name) ?? [];
      if (have.length >= TIERS.length * ELEVATIONS.length) continue;
      // Keep the sites well apart so one run never touches another.
      if (have.some((s) => Math.abs(s.x - x) < 14 && Math.abs(s.z - z) < 8)) continue;
      have.push({ x, z, grade });
      sites.set(band.name, have);
    }
  }
}
for (const band of BANDS)
  console.log(`${band.name}: ${(sites.get(band.name) ?? []).length} sites found`);

// A generated map may hold no slope as steep as a road is ALLOWED on, and the
// steepest grade is exactly where this has to be tested. So build one: a
// staircase of raised ground climbing toward ROAD_MAX_SLOPE per tile, well
// clear of everything else, and use it as the steep band.
if (runs('grades') && (sites.get('steep') ?? []).length === 0) {
  const RX = 60;
  const RZ = N - 60;
  const lanes = TIERS.length * ELEVATIONS.length;
  // terraformSet writes exact heights. The raise brush cannot build a grade
  // this steep — it smooths as it goes, and topped out around 1.8 m/tile,
  // which is not the steep band and must not be reported as one.
  const GRADE = ROAD_MAX_SLOPE - 0.5; // just inside what a road is allowed on
  const W = RUN_TILES + 3;
  const H = lanes * 4 + 4;
  await call(
    ([x, z, w, h, grade, span]) => {
      const heights = new Float32Array(w * h);
      for (let row = 0; row < h; row++)
        for (let col = 0; col < w; col++)
          heights[row * w + col] = Math.min(col, span) * grade;
      window.__slimcity.cmd('Steep slope', [
        { kind: 'terraformSet', x, z, w, h, heights },
      ]);
    },
    [RX, RZ - lanes * 4, W, H, GRADE, RUN_TILES],
  );
  await page.waitForTimeout(1500);
  const gr = await readGrid();
  const made = [];
  for (let lane = 0; lane < lanes; lane++) {
    const z = RZ - lane * 4;
    let grade = 0;
    for (let i = 0; i < RUN_TILES; i++)
      grade = Math.max(
        grade,
        Math.abs((gr.height[idx(RX + i + 1, z)] ?? 0) - (gr.height[idx(RX + i, z)] ?? 0)),
      );
    if (grade >= 1) made.push({ x: RX, z, grade });
  }
  sites.set('steep', made);
  const steepest = made.reduce((m, s) => Math.max(m, s.grade), 0);
  console.log(`built ${made.length} steep lanes, steepest ${steepest.toFixed(1)} m/tile`);
}

/**
 * The worst height by which the rendered ground stands above the road deck,
 * anywhere across the tiles of a run. Sampled inside the carriageway only —
 * ground rising beside a road is a hillside, not a defect.
 */
const worstIntrusion = async (tiles) =>
  await call(
    ([ts, tile]) => {
      const hook = window.__slimcity;
      let worst = { m: -Infinity, at: null };
      const SAMPLES = 13;
      for (const t of ts) {
        // The whole tile is sampled and the ROAD SURFACE masks it: the reader
        // returns null wherever no road covers a point, so only actual
        // pavement is compared and the verge beside it — where ground above
        // the road is a hillside, not a defect — is excluded by construction.
        // It is also the only mask that works at a junction or a turn, where
        // the pavement is not a band of any fixed width.
        const cx = (t.x + 0.5) * tile;
        const cz = (t.z + 0.5) * tile;
        const x0 = cx - tile / 2;
        const x1 = cx + tile / 2;
        const z0 = cz - tile / 2;
        const z1 = cz + tile / 2;
        // Both surfaces at the same points: the road as the GPU has it, and
        // the ground as it is rendered. Anything else compares a surface
        // against a number and measures how much a tile's ground varies.
        const road = hook.readSurfaceHeight(x0, z0, x1, z1, SAMPLES);
        for (let row = 0; row < SAMPLES; row++) {
          const pz = z0 + ((row + 0.5) * (z1 - z0)) / SAMPLES;
          for (let col = 0; col < SAMPLES; col++) {
            const px = x0 + ((col + 0.5) * (x1 - x0)) / SAMPLES;
            const surface = road[row * SAMPLES + col];
            if (surface === null || surface === undefined) continue; // no road here
            const d = hook.terrainHeightAt(px, pz) - surface;
            if (d > worst.m) worst = { m: d, at: { x: t.x, z: t.z } };
          }
        }
      }
      return worst;
    },
    [tiles, TILE_M],
  );

const findings = [];
const tally = {};
let worstOverall = { m: -Infinity, label: null, at: null };
for (const band of runs('grades') ? BANDS : []) {
  const pool = [...(sites.get(band.name) ?? [])];
  if (pool.length === 0) {
    console.log(`no ${band.name} sites; that band is untested`);
    continue;
  }
  for (const { tier, name } of TIERS) {
    for (const elevation of ELEVATIONS) {
      const site = pool.shift();
      if (!site) break;
      const tiles = Array.from({ length: RUN_TILES + 1 }, (_, i) => ({
        x: site.x + i,
        z: site.z,
      }));
      await cmd(`${name} @${elevation}`, [
        { kind: 'buildRoad', tier, tiles, elevation },
      ]);
      await page.waitForTimeout(260);
      const g = await readGrid();
      const laid = tiles.filter((t) => g.roadTier[idx(t.x, t.z)] !== 0);
      // A refusal is the game saying no, and counting them is what stops a
      // band reading as clean when nothing in it was ever built.
      tally[band.name] = tally[band.name] ?? { laid: 0, refused: 0 };
      if (laid.length === 0) {
        tally[band.name].refused++;
        continue;
      }
      tally[band.name].laid++;
      const worst = await worstIntrusion(laid);
      const label = `${band.name} (${site.grade.toFixed(1)} m/tile) ${name} @${elevation}m`;
      if (worst.m > INTRUSION_EPS_M) {
        findings.push({ label, m: worst.m, at: worst.at, laid: laid.length });
      }
      if (worst.m > worstOverall.m) worstOverall = { m: worst.m, label, at: worst.at };
    }
  }
}

// ---------------------------------------------------------------------------
// Bridges and their approaches. A deck over water is the one place the road
// stops following the ground — it is held up while the bank climbs back to
// meet it — so it is where ground standing through a road is actually possible.
// ---------------------------------------------------------------------------
const shorelines = [];
for (let z = 30; runs('bridges') && z < N - 30 && shorelines.length < 12; z += 2) {
  for (let x = 30; x < N - 40; x += 2) {
    // A run that starts on land, crosses water, and comes back to land.
    let wet = 0;
    let dryStart = !g0.water[idx(x, z)];
    let dryEnd = !g0.water[idx(x + 10, z)];
    for (let i = 1; i < 10; i++) if (g0.water[idx(x + i, z)]) wet++;
    if (!dryStart || !dryEnd || wet < 3) continue;
    if (shorelines.some((s) => Math.abs(s.x - x) < 16 && Math.abs(s.z - z) < 10)) continue;
    shorelines.push({ x, z, wet });
  }
}
console.log(`\nshoreline crossings found: ${shorelines.length}`);
let bridgeLaid = 0;
for (const site of shorelines) {
  const spec = TIERS[bridgeLaid % TIERS.length];
  const tiles = Array.from({ length: 11 }, (_, i) => ({ x: site.x + i, z: site.z }));
  await cmd(`${spec.name} bridge`, [{ kind: 'buildRoad', tier: spec.tier, tiles, elevation: 0 }]);
  await page.waitForTimeout(300);
  const g = await readGrid();
  const laid = tiles.filter((t) => g.roadTier[idx(t.x, t.z)] !== 0);
  if (laid.length === 0) continue;
  bridgeLaid++;
  const worst = await worstIntrusion(laid);
  const label = `bridge (${site.wet} tiles of water) ${spec.name}`;
  if (worst.m > INTRUSION_EPS_M) findings.push({ label, m: worst.m, at: worst.at, laid: laid.length });
  if (worst.m > worstOverall.m) worstOverall = { m: worst.m, label, at: worst.at };
}
console.log(`bridges built: ${bridgeLaid}`);
if (bridgeLaid === 0) console.log('!! no bridge was built — the bridge case proves nothing');

// ---------------------------------------------------------------------------
// Junctions, tees and turns, including mixed-class ones. Every run above is
// straight, and a straight run is the one shape the geometry is simplest on:
// a junction box, a kerb return and a turn's arc are all built differently and
// none of them was covered.
// ---------------------------------------------------------------------------
const TOPOLOGIES = [
  { name: 'crossroads', arms: [0, 1, 2, 3] },
  { name: 'tee', arms: [0, 1, 2] },
  { name: 'turn', arms: [0, 1] },
];
const ARM = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];
const junctionSites = [];
for (let z = 40; z < N - 40 && junctionSites.length < 40; z += 5) {
  for (let x = 40; x < N - 40; x += 5) {
    let ok = true;
    for (let dz = -7; dz <= 7 && ok; dz++)
      for (let dx = -7; dx <= 7 && ok; dx++) {
        const i = idx(x + dx, z + dz);
        if (g0.water[i] || g0.roadTier[i] !== 0) ok = false;
      }
    if (!ok) continue;
    if (junctionSites.some((s) => Math.abs(s.x - x) < 18 && Math.abs(s.z - z) < 18)) continue;
    junctionSites.push({ x, z });
  }
}
console.log(`\njunction sites found: ${junctionSites.length}`);

let junctionsBuilt = 0;
const pool = [...junctionSites];
for (const topo of TOPOLOGIES) {
  for (const main of TIERS) {
    // Mixed-class on purpose: the crossbar is a different size from the stem,
    // which is where a junction's geometry has the most to reconcile.
    for (const cross of [main, TIERS[(TIERS.indexOf(main) + 2) % TIERS.length]]) {
      const site = pool.shift();
      if (!site) break;
      const centre = { x: site.x, z: site.z };
      const cmds = [];
      topo.arms.forEach((a, n) => {
        const [dx, dz] = ARM[a];
        const tiles = [centre];
        for (let i = 1; i <= 5; i++) tiles.push({ x: centre.x + dx * i, z: centre.z + dz * i });
        const spec = n % 2 === 0 ? main : cross;
        cmds.push({ kind: 'buildRoad', tier: spec.tier, tiles, elevation: 0, replace: true });
      });
      await cmd(`${topo.name} ${main.name}/${cross.name}`, cmds);
      await page.waitForTimeout(280);
      const g = await readGrid();
      // Measure the junction box and the tiles immediately around it, which is
      // where the kerb returns and the corner fills are.
      const near = [];
      for (let dz = -2; dz <= 2; dz++)
        for (let dx = -2; dx <= 2; dx++) {
          const t = { x: centre.x + dx, z: centre.z + dz };
          if (g.roadTier[idx(t.x, t.z)] !== 0) near.push(t);
        }
      if (near.length === 0) continue;
      junctionsBuilt++;
      const worst = await worstIntrusion(near);
      const label = `${topo.name} ${main.name}/${cross.name}`;
      if (worst.m > INTRUSION_EPS_M)
        findings.push({ label, m: worst.m, at: worst.at, laid: near.length });
      if (worst.m > worstOverall.m) worstOverall = { m: worst.m, label, at: worst.at };
    }
  }
}
console.log(`junctions built: ${junctionsBuilt}`);
if (junctionsBuilt === 0) console.log('!! no junction was built — the junction case proves nothing');

if (runs('grades')) console.log('\nruns actually built, by grade band:');
for (const band of runs('grades') ? BANDS : []) {
  const t = tally[band.name] ?? { laid: 0, refused: 0 };
  console.log(`  ${band.name}: ${t.laid} laid, ${t.refused} refused by the game`);
  if (t.laid === 0) console.log(`  !! ${band.name} proves nothing — nothing was built in it`);
}
console.log(`\nworst ground-above-deck anywhere: ${worstOverall.m.toFixed(2)} m`);
console.log(`  at ${worstOverall.label} tile ${JSON.stringify(worstOverall.at)}`);
if (findings.length === 0) {
  console.log('\nno configuration puts ground above its road deck');
} else {
  console.log(`\n${findings.length} configuration(s) with ground above the deck:`);
  for (const f of findings.sort((a, c) => c.m - a.m).slice(0, 14))
    console.log(`  ${f.m.toFixed(2)} m  ${f.label}  (${f.laid} tiles laid)`);
}

await call(() => window.__slimcity.setSpeed(0));
// Midday, not midnight: a dark frame hides the very thing being looked for.
await call(() => window.__slimcity.setDayT(0.5));
// Every refusal raises a warning toast, and a warning persists until it is
// dismissed — so the stack covers the shot until each one is closed.
for (let i = 0; i < 60; i++) {
  const close = page.getByRole('button', { name: 'Dismiss notification' }).first();
  if ((await close.count()) === 0) break;
  await close.click({ timeout: 2000 }).catch(() => {});
}
await page.waitForTimeout(500);
const leftOver = await page.getByRole('button', { name: 'Dismiss notification' }).count();
if (leftOver > 0) console.log(`note: ${leftOver} toasts still covering the shot`);
if (worstOverall.at) {
  await cam(worstOverall.at.x, worstOverall.at.z, 60, 0.0, 0.55);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/worst-intrusion.png` });
  await cam(worstOverall.at.x, worstOverall.at.z, 90, 0.9, 0.35);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/worst-intrusion-low.png` });
}
if (pageErrors.length > 0) console.log('page errors:', pageErrors.join(' | '));
console.log('done ->', out);
await b.close();
