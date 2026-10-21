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
 * The parade lays every tier that can be laid as a long straight run, all
 * parallel with one empty tile between neighbours, across a cross-slope, down
 * the fall line and on flat ground, and measures every tile of every run —
 * the deck, the ground 0.3 m outside each kerb, and the ground beyond each end
 * cap — so the comparison across tiers is like for like.
 *
 * Usage: node tools/roadclip-shots.mjs [url] [outDir] [all|grades|bridges|junctions|parade]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { closeUp, tileCamera } from './shotcam.mjs';

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
  for (let i = 0; i <= len; i++)
    for (let dz = -1; dz <= 1; dz++) if (g0.water[idx(x + i, z + dz)]) return false;
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
        for (let col = 0; col < w; col++) heights[row * w + col] = Math.min(col, span) * grade;
      window.__slimcity.cmd('Steep slope', [{ kind: 'terraformSet', x, z, w, h, heights }]);
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
      await cmd(`${name} @${elevation}`, [{ kind: 'buildRoad', tier, tiles, elevation }]);
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
  if (worst.m > INTRUSION_EPS_M)
    findings.push({ label, m: worst.m, at: worst.at, laid: laid.length });
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
if (junctionsBuilt === 0)
  console.log('!! no junction was built — the junction case proves nothing');

// ---------------------------------------------------------------------------
// The parade: every tier laid the same way on the same ground, so one tier's
// clipping can be told from another's. Twelve-tile straight runs, all
// parallel, one empty tile between neighbours — once across a cross-slope,
// once down the fall line, and once on flat ground as the control.
// ---------------------------------------------------------------------------
const PARADE_LEN = 12;
/** Ground this far above a parade deck counts the tile as clipped. */
const PARADE_EPS_M = 0.02;
/** How far outside the kerb line the ground is read, to catch it rising against the kerb face. */
const KERB_OUT_M = 0.3;
/** Samples per axis across a tile: fine enough to find a kerb to half a metre. */
const PARADE_SAMPLES = 41;
// roadFlow: low three bits the direction, then the corridor bits.
const FLOW_EAST = 2;
const FLOW_SOUTH = 3;
const CORRIDOR = 0b1000;
const CORRIDOR_RIGHT = 0b1_0000;
// A six-lane divided road is wider than a tile and is laid as a two-tile
// corridor: both runs in one command here, each tile's flow saying which half
// it carries. The road tool sends the two runs as two commands.
const SIX_LANE_AVENUE = 40;
const SIX_LANE_DIVIDED = 41;
const sixLanes = (classId, laneM, median) => {
  const lane = (flow) => ({ kind: 'travel', width: laneM, flow });
  return {
    class: classId,
    pieces: [
      { kind: 'sidewalk', width: 1.9 },
      lane('back'),
      lane('back'),
      lane('back'),
      { kind: 'median', width: median },
      lane('fwd'),
      lane('fwd'),
      lane('fwd'),
      { kind: 'sidewalk', width: 1.9 },
    ],
  };
};
const PARADE_TIERS = [
  { tier: 1, name: 'Two-Lane' },
  { tier: 2, name: 'Avenue' },
  { tier: 3, name: 'Highway' },
  { tier: 4, name: 'Gravel' },
  { tier: 5, name: 'Alley' },
  { tier: 6, name: 'One-Way' },
  { tier: 7, name: 'Four-Lane' },
  { tier: 8, name: 'Bus Lane' },
  { tier: 9, name: 'Bike Lane' },
  { tier: 10, name: 'Tram' },
  { tier: 11, name: 'Rail' },
  { tier: 12, name: 'Ramp' },
  { tier: 2, name: 'Six-Lane Avenue', profile: SIX_LANE_AVENUE, corridor: true },
  { tier: 2, name: 'Six-Lane Divided', profile: SIX_LANE_DIVIDED, corridor: true },
];
/** Rows the parade occupies across its runs: each run's tiles plus a gap, less the last gap. */
const PARADE_ROWS = PARADE_TIERS.reduce((n, t) => n + (t.corridor ? 3 : 2), 0) - 1;
/** Steepest climb a deck may make along its run, metres per tile; steeper is refused. */
const ROAD_MAX_CLIMB = 2;
// The generated map's slopes are gentle where a whole parade fits, so three
// more are laid on ground BUILT to a grade: across the runs at a hillside
// grade and just inside the steepest a road may stand across, and along the
// runs just inside the steepest a road may climb.
const PARADES = [
  { name: 'cross-slope', alongX: true, ground: 'slope' },
  { name: 'fall-line', alongX: false, ground: 'slope' },
  { name: 'flat', alongX: true, ground: 'flat' },
  { name: 'cross-3m', alongX: true, ground: 'built', grade: 3 },
  { name: 'cross-9.5m', alongX: true, ground: 'built', grade: ROAD_MAX_SLOPE - 0.5 },
  { name: 'fall-1.9m', alongX: false, ground: 'built', grade: ROAD_MAX_CLIMB - 0.1 },
];

/**
 * Where a parade goes: a dry, road-free footprint with a margin of one tile
 * all round. A sloped parade wants the steepest CONSISTENT grade along z —
 * across the runs of the cross-slope parade and along the runs of the
 * fall-line one — so the mean signed step is scored, not the single worst
 * cliff, which a flat patch with one terrace in it would win. The flat
 * control wants the smallest spread. Footprints never overlap each other.
 */
const footprintStats = (grid, x, z, w, h) => {
  let lo = Infinity;
  let hi = -Infinity;
  let fall = 0;
  let steepest = 0;
  for (let dz = 0; dz < h; dz++) {
    for (let dx = 0; dx < w; dx++) {
      const i = idx(x + dx, z + dz);
      if (grid.water[i] || grid.roadTier[i] !== 0) return null;
      const hh = grid.height[i];
      lo = Math.min(lo, hh);
      hi = Math.max(hi, hh);
      if (dz > 0) {
        const step = hh - grid.height[idx(x + dx, z + dz - 1)];
        fall += step;
        steepest = Math.max(steepest, Math.abs(step));
      }
    }
  }
  return { grade: Math.abs(fall / (w * (h - 1))), steepest, spread: hi - lo, lo };
};
const paradeSite = (grid, alongX, ground, taken) => {
  const w = (alongX ? PARADE_LEN : PARADE_ROWS) + 2;
  const h = (alongX ? PARADE_ROWS : PARADE_LEN) + 2;
  let best = null;
  for (let z = 20; z + h < grid.size - 20; z++) {
    for (let x = 20; x + w < grid.size - 20; x++) {
      if (taken.some((t) => x < t.x + t.w && t.x < x + w && z < t.z + t.h && t.z < z + h)) continue;
      const stats = footprintStats(grid, x, z, w, h);
      if (!stats) continue;
      // A step no road may be laid across is a cliff — the edge of a built
      // slope, say — and a patch holding one is not a hillside however well
      // its mean grade scores.
      if (ground === 'slope' && stats.steepest > ROAD_MAX_SLOPE) continue;
      // Ground to be built on is scored like the control: the flattest patch
      // takes the least rebuilding, and nothing about its own shape matters.
      const score = ground === 'slope' ? stats.grade : -stats.spread;
      if (!best || score > best.score) best = { x, z, w, h, score, ...stats };
    }
  }
  return best;
};

/**
 * Every tile of a parade run, measured three ways against the road surface
 * the GPU is handed: the ground under the deck itself; the ground 0.3 m
 * outside each kerb, compared with the deck at that kerb; and the ground the
 * same distance beyond each end cap. A tile counts as clipped when any of
 * them stands more than PARADE_EPS_M proud.
 */
const paradeIntrusion = async (tiles, alongX) =>
  await call(
    ([ts, tile, along, n, eps, out]) => {
      const hook = window.__slimcity;
      let worst = { m: -Infinity, at: null, where: null };
      let clipped = 0;
      for (const t of ts) {
        const x0 = t.x * tile;
        const z0 = t.z * tile;
        const road = hook.readSurfaceHeight(x0, z0, x0 + tile, z0 + tile, n);
        const px = (col) => x0 + ((col + 0.5) * tile) / n;
        const pz = (row) => z0 + ((row + 0.5) * tile) / n;
        let tileWorst = -Infinity;
        const note = (d, where) => {
          if (d > tileWorst) tileWorst = d;
          if (d > worst.m) worst = { m: d, at: { x: t.x, z: t.z }, where };
        };
        for (let row = 0; row < n; row++) {
          for (let col = 0; col < n; col++) {
            const s = road[row * n + col];
            if (s === null || s === undefined) continue; // no road here
            note(hook.terrainHeightAt(px(col), pz(row)) - s, 'deck');
          }
        }
        // Walk every line of samples across the road and along it; where the
        // surface stops, the ground `out` metres beyond the boundary is read
        // against the deck at its edge. Across the run that edge is a kerb,
        // along it the end cap.
        for (const across of [true, false]) {
          const where = across === along ? 'kerb' : 'end';
          for (let i = 0; i < n; i++) {
            for (let j = 0; j < n - 1; j++) {
              // `across` walks z for a run along x and x for one along z.
              const walkZ = across === along;
              const a = walkZ ? j * n + i : i * n + j;
              const c = walkZ ? (j + 1) * n + i : i * n + j + 1;
              const sa = road[a] ?? null;
              const sc = road[c] ?? null;
              if ((sa === null) === (sc === null)) continue;
              const outward = sa === null ? -1 : 1;
              const deck = sa === null ? sc : sa;
              const edge = ((j + 1) * tile) / n + outward * out;
              const gx = walkZ ? px(i) : x0 + edge;
              const gz = walkZ ? z0 + edge : pz(i);
              note(hook.terrainHeightAt(gx, gz) - deck, where);
            }
          }
        }
        if (tileWorst > eps) clipped++;
      }
      return { worst, clipped };
    },
    [tiles, TILE_M, alongX, PARADE_SAMPLES, PARADE_EPS_M, KERB_OUT_M],
  );

/** The newest toast's text, for saying why the game refused a run. */
const lastToast = () =>
  call(() => {
    const els = document.querySelectorAll('[role="alert"], [role="status"]');
    const el = els[els.length - 1];
    return el ? el.textContent.trim() : '';
  });
// Every refusal raises a warning toast, and a warning persists until it is
// dismissed — so the stack covers a shot until each one is closed, and the
// last toast standing is not the one the latest refusal raised.
const dismissToasts = async () => {
  for (let i = 0; i < 60; i++) {
    const close = page.getByRole('button', { name: 'Dismiss notification' }).first();
    if ((await close.count()) === 0) break;
    await close.click({ timeout: 2000 }).catch(() => {});
  }
};

const paradeRows = [];
const paradeShots = [];
if (runs('parade')) {
  await cmd('six-lane profiles', [
    { kind: 'defineRoadProfile', id: SIX_LANE_AVENUE, profile: sixLanes('arterial', 3.6, 1.2) },
    { kind: 'defineRoadProfile', id: SIX_LANE_DIVIDED, profile: sixLanes('divided', 3.6, 2.0) },
  ]);
  let gp = await readGrid();
  const taken = [];
  for (const parade of PARADES) {
    let site = paradeSite(gp, parade.alongX, parade.ground, taken);
    if (!site) {
      console.log(`\n!! no ${parade.name} parade site — that parade proves nothing`);
      continue;
    }
    taken.push(site);
    if (parade.ground === 'built') {
      // A plane climbing along z from the patch's own lowest point, written
      // exactly: the raise brush smooths as it goes and cannot hold a grade.
      await call(
        ([x, z, w, h, grade, base]) => {
          const heights = new Float32Array(w * h);
          for (let row = 0; row < h; row++)
            for (let col = 0; col < w; col++) heights[row * w + col] = base + row * grade;
          window.__slimcity.cmd('Parade slope', [{ kind: 'terraformSet', x, z, w, h, heights }]);
        },
        [site.x, site.z, site.w, site.h, parade.grade, site.lo],
      );
      await page.waitForTimeout(1500);
      gp = await readGrid();
      const built = footprintStats(gp, site.x, site.z, site.w, site.h);
      if (!built) {
        console.log(
          `\n!! the ${parade.name} slope could not be built — that parade proves nothing`,
        );
        continue;
      }
      site = { ...site, ...built };
    }
    console.log(
      `\n${parade.name} parade at ${site.x},${site.z} (${site.w}x${site.h}): ` +
        `mean grade along z ${site.grade.toFixed(2)} m/tile, steepest step ${site.steepest.toFixed(2)} m, ` +
        `spread ${site.spread.toFixed(1)} m, runs along ${parade.alongX ? 'x' : 'z'}`,
    );
    const centre = { x: site.x + site.w / 2, z: site.z + site.h / 2 };
    paradeShots.push({
      kind: 'overview',
      name: parade.name,
      centre,
      alongX: parade.alongX,
      span: site,
    });
    let row = 0;
    for (const spec of PARADE_TIERS) {
      const at = (i, r) =>
        parade.alongX
          ? { x: site.x + 1 + i, z: site.z + 1 + row + r }
          : { x: site.x + 1 + row + r, z: site.z + 1 + i };
      const run = (r) => Array.from({ length: PARADE_LEN }, (_, i) => at(i, r));
      const direction = parade.alongX ? FLOW_EAST : FLOW_SOUTH;
      const tiles = spec.corridor ? [...run(0), ...run(1)] : run(0);
      const build = { kind: 'buildRoad', tier: spec.tier, tiles, elevation: 0 };
      if (spec.corridor) {
        build.profile = spec.profile;
        build.flows = [
          ...run(0).map(() => direction | CORRIDOR),
          ...run(1).map(() => direction | CORRIDOR | CORRIDOR_RIGHT),
        ];
      }
      row += spec.corridor ? 3 : 2;
      // Only a toast raised by THIS run can say why it was refused.
      await dismissToasts();
      await cmd(`${parade.name} ${spec.name}`, [build]);
      await page.waitForTimeout(300);
      const g = await readGrid();
      const laid = tiles.filter((t) => g.roadTier[idx(t.x, t.z)] !== 0);
      const entry = {
        tier: spec.name,
        orientation: parade.name,
        tiles: laid.length,
        wanted: tiles.length,
        clipped: 0,
        m: -Infinity,
        at: null,
        where: null,
        toast: '',
      };
      paradeRows.push(entry);
      if (laid.length === 0) {
        // The toast can land after the grid does; give it a moment.
        for (let i = 0; i < 5 && entry.toast === ''; i++) {
          entry.toast = await lastToast();
          if (entry.toast === '') await page.waitForTimeout(200);
        }
        continue;
      }
      const { worst, clipped } = await paradeIntrusion(laid, parade.alongX);
      Object.assign(entry, { clipped, m: worst.m, at: worst.at, where: worst.where });
      const label = `parade ${parade.name} ${spec.name}`;
      if (worst.m > INTRUSION_EPS_M)
        findings.push({ label, m: worst.m, at: worst.at, laid: laid.length });
      if (worst.m > worstOverall.m) worstOverall = { m: worst.m, label, at: worst.at };
      if (worst.m > PARADE_EPS_M)
        paradeShots.push({
          kind: 'close',
          name: parade.name,
          tier: spec.name,
          at: worst.at,
          alongX: parade.alongX,
        });
    }
  }
  console.log('\nparade: ground above the deck, per tier and orientation');
  console.log(
    `  ${'tier'.padEnd(18)}${'orientation'.padEnd(13)}${'tiles'.padEnd(8)}${'clipped'.padEnd(9)}${'max m'.padEnd(8)}worst tile`,
  );
  for (const r of paradeRows) {
    const tiles = `${r.tiles}/${r.wanted}`;
    const detail =
      r.tiles === 0
        ? `refused${r.toast ? `: ${r.toast}` : ''}`
        : `${String(r.clipped).padEnd(9)}${r.m.toFixed(2).padEnd(8)}${r.at ? `${r.at.x},${r.at.z} (${r.where})` : '-'}`;
    console.log(`  ${r.tier.padEnd(18)}${r.orientation.padEnd(13)}${tiles.padEnd(8)}${detail}`);
  }
}

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

// Midday, not midnight: a dark frame hides the very thing being looked for.
// The override is applied with the next sim snapshot, so the clock stops
// only once one has arrived — paused first, the frame stays dark.
await call(() => window.__slimcity.setDayT(0.5));
await page.waitForTimeout(1500);
await call(() => window.__slimcity.setSpeed(0));
await dismissToasts();
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
// The parade: one oblique overview of each, then a close-up at the worst
// tile of every run that clips, looking across the run so the kerb face and
// the ground against it are both in the frame.
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
for (const shot of paradeShots) {
  if (shot.kind === 'overview') {
    const reach = Math.max(shot.span.w, shot.span.h) * TILE_M;
    await cam(shot.centre.x - 0.5, shot.centre.z - 0.5, reach * 1.1, shot.alongX ? 0.6 : 2.2, 0.75);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}/parade-${slug(shot.name)}.png` });
    continue;
  }
  // Two angles at the worst tile: across the run, which shows the kerb face
  // and the ground against it, and along it, which shows the end cap.
  const restore = await closeUp(page, 2);
  for (const [view, yaw] of [
    ['across', shot.alongX ? 0.0 : 1.57],
    ['along', shot.alongX ? 1.57 : 0.0],
  ]) {
    await cam(shot.at.x, shot.at.z, 45, yaw, 0.4);
    await page.waitForTimeout(900);
    await page.screenshot({
      path: `${out}/parade-${slug(shot.name)}-${slug(shot.tier)}-${view}.png`,
    });
  }
  await restore();
}
if (pageErrors.length > 0) console.log('page errors:', pageErrors.join(' | '));
console.log('done ->', out);
await b.close();
