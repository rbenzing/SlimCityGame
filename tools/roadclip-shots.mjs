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
if ((sites.get('steep') ?? []).length === 0) {
  const RX = 60;
  const RZ = N - 60;
  const lanes = TIERS.length * ELEVATIONS.length;
  for (let lane = 0; lane < lanes; lane++) {
    const z = RZ - lane * 4;
    for (let i = 1; i <= RUN_TILES; i++) {
      // Each step up the run raises a little more ground than the last.
      for (let rep = 0; rep < i; rep++) {
        await cmd('Raise', [
          {
            kind: 'terraform',
            mode: 'raise',
            center: { x: RX + i, z },
            radius: 1,
            strength: 1,
          },
        ]);
      }
    }
  }
  await page.waitForTimeout(1200);
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
      const grid = hook.readGrid();
      const size = grid.size;
      let worst = { m: -Infinity, at: null, half: 0 };
      for (const t of ts) {
        const i = t.z * size + t.x;
        const deck = (grid.height[i] ?? 0) + (grid.roadElevation[i] ?? 0);
        // The tile's OWN carriageway, asked of the tile. Sampling a fixed
        // width would put the outer samples on the verge beside a narrow
        // road, where ground standing above the deck is a hillside and not a
        // defect — and would report every slope as clipping.
        const section = hook.readApproach(t.x, t.z);
        if (!section || !(section.width > 0)) continue;
        const half = section.width / 2 - 0.5; // inside the kerb, not on it
        if (half <= 0) continue;
        const cx = (t.x + 0.5) * tile;
        const cz = (t.z + 0.5) * tile;
        for (let a = -half; a <= half + 1e-9; a += half / 6) {
          for (let c = -tile / 2 + 1; c <= tile / 2 - 1; c += tile / 8) {
            const ground = hook.terrainHeightAt(cx + c, cz + a);
            const d = ground - deck;
            if (d > worst.m) worst = { m: d, at: { x: t.x, z: t.z }, half };
          }
        }
      }
      return worst;
    },
    [tiles, TILE_M],
  );

const findings = [];
let worstOverall = { m: -Infinity, label: null, at: null };
for (const band of BANDS) {
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
      if (laid.length === 0) continue; // refused: that is the game saying no
      const worst = await worstIntrusion(laid);
      const label = `${band.name} (${site.grade.toFixed(1)} m/tile) ${name} @${elevation}m`;
      if (worst.m > INTRUSION_EPS_M) {
        findings.push({ label, m: worst.m, at: worst.at, laid: laid.length });
      }
      if (worst.m > worstOverall.m) worstOverall = { m: worst.m, label, at: worst.at };
    }
  }
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
await call(() => window.__slimcity.setDayT(0.5));
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
