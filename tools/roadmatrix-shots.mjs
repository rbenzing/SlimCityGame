/** Road geometry uniformity: is a road the same road all the way along it?
 *
 * A cross-section read-back can be right about every tile of a run while the
 * asphalt and the paint on it come out a different width on each one — the
 * section is a list of pieces, and the width of the triangles emitted for
 * those pieces is a separate question. This harness asks the second question,
 * of every road type, in every topology a road is laid in:
 *
 *   straight   a long run, crossing tile and chunk seams
 *   turn       a right angle
 *   tee        a road meeting another mid-run
 *   cross      a crossroads with itself
 *   mixCross   a crossroads with a road of a DIFFERENT class
 *   viaduct    a deliberately raised run, arching clear of the ground
 *   overpass   a raised run crossing a road at grade — which the road model
 *              defers deliberately, so what is checked is that it is REFUSED
 *              cleanly rather than half-built
 *
 * Every measurement comes off the vertex buffer (`readPaint`), not from the
 * emitters, so a rule that lays a correct cross-section and emits crooked
 * geometry for it still fails here. Widths are measured across the road in
 * plan, which is unaffected by terrain height, so a run over a slope is a fair
 * test of width and needs no flat ground.
 *
 * The run reports every tile whose paint disagrees with the rest of its own
 * straight run, and writes a shot per scenario so a failure can be looked at.
 *
 * Usage: node tools/roadmatrix-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { hooksReady, tileCamera, closeUp } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-roadmatrix';
mkdirSync(out, { recursive: true });

/** Every laying tier, by the name the audit reports it under. */
const TIERS = [
  { tier: 1, name: 'two-lane' },
  { tier: 2, name: 'avenue' },
  { tier: 3, name: 'highway' },
  { tier: 4, name: 'gravel' },
  { tier: 5, name: 'alley' },
  { tier: 6, name: 'one-way' },
  { tier: 7, name: 'four-lane' },
  { tier: 8, name: 'bus-lane' },
  { tier: 9, name: 'bike-lane' },
  { tier: 10, name: 'tram' },
  { tier: 11, name: 'rail' },
  { tier: 12, name: 'ramp' },
];

/** The road every mixed junction is crossed by, and what crosses the plain street itself. */
const CROSSER = 1;
const CROSSER_ALT = 7;

/** Plot geometry. Each scenario gets its own square so no two interfere. */
const PLOT = 18;
/** The run measured for uniformity, as an offset inside the plot. */
const RUN_FROM = 2;
const RUN_TO = 16;
/** Where the spine and the crossing arm meet, as an offset inside the plot. */
const MID = 9;
/**
 * Tiles nearer a junction than this are excluded from the uniformity check: a
 * turn pocket, a taper and a junction apron are all cross-sections the road
 * legitimately has for a few tiles and nowhere else, and calling those a
 * defect would bury the ones that are.
 */
const JUNCTION_CLEARANCE = 4;
/**
 * How far two tiles of one run may disagree about a band's width before it is
 * a defect. A tile is 20 m of ground; 5 cm is a twentieth of a lane line and
 * far below anything a paint rule intends.
 */
const WIDTH_TOLERANCE_M = 0.05;
/**
 * Gravel jitters its surface colour per tile on purpose, so its bands cannot
 * be matched to each other by colour. Its total width still can be.
 */
const JITTERED_TIERS = new Set([4]);
/**
 * How high the deliberate viaducts are asked to stand. High enough that the
 * deck is plainly clear of the ground and the ramps have to be solved, low
 * enough that the run can climb to it and land again.
 */
const VIADUCT_HEIGHT_M = 8;
/**
 * How far a band's edge may move from one tile to the next.
 *
 * This is the check the uniformity one cannot make: a junction approach and an
 * end cap are SUPPOSED to change the section, so they are excluded from the
 * comparison against the run — but they still have to change smoothly. A taper
 * spreads its change over several tiles; paint that jumps sideways in a single
 * tile, or stops dead where the road carries on, is the jank a picture shows.
 */
const STEP_TOLERANCE_M = 0.75;

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
  } catch (e) {
    void e;
  }
});
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#viewport canvas', { timeout: 20000 });
await hooksReady(page);

const call = (fn, ...a) => page.evaluate(fn, ...a);
const cmd = (l, c) => call(([x, y]) => window.__slimcity.cmd(x, y), [l, c]);
const cam = tileCamera(page);

// Sandbox and unlimited money: the audit is about geometry, and a tier that
// refuses to lay for want of a milestone or a balance tests nothing.
await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
await call(() => window.__slimcity.setDayT(0.32));

const grid = await call(() => {
  const g = window.__slimcity.readGrid();
  return { size: g.size, water: Array.from(g.water) };
});
const N = grid.size;

/**
 * Plots are handed out from a lattice. Only the ground a scenario actually
 * builds on has to be dry — the cross of a spine and an arm, with a tile of
 * margin either side. Demanding a dry 24-tile square instead threw away most
 * of a map with a river in it, and quietly left the last road types untested.
 */
const plots = [];
for (let pz = 1; (pz + 1) * PLOT < N - PLOT; pz++) {
  for (let px = 1; (px + 1) * PLOT < N - PLOT; px++) {
    const x = px * PLOT;
    const z = pz * PLOT;
    let dry = true;
    for (let k = RUN_FROM - 1; k <= RUN_TO + 1 && dry; k++) {
      for (let m = -1; m <= 1 && dry; m++) {
        if (grid.water[(z + k) * N + (x + MID + m)]) dry = false;
        if (grid.water[(z + MID + m) * N + (x + k)]) dry = false;
      }
    }
    if (dry) plots.push({ x, z });
  }
}

const SCENARIOS = ['straight', 'turn', 'tee', 'cross', 'mixCross', 'viaduct', 'overpass'];
const cases = [];
for (const t of TIERS) for (const s of SCENARIOS) cases.push({ ...t, scenario: s });
if (plots.length < cases.length) {
  console.log(
    `only ${plots.length} dry plots for ${cases.length} cases; the tail will not be laid`,
  );
}

const col = (X, Z, x, a, c) =>
  Array.from({ length: c - a + 1 }, (_, i) => ({ x: X + x, z: Z + a + i }));
const rowOf = (X, Z, z, a, c) =>
  Array.from({ length: c - a + 1 }, (_, i) => ({ x: X + a + i, z: Z + z }));

/**
 * Lays one case in its plot and says which tiles form the straight run to
 * measure, on which axis, and which tiles are junctions to stand clear of.
 */
async function lay(kase, X, Z) {
  const build = (label, tier, tiles, elevation) =>
    cmd(label, [{ kind: 'buildRoad', tier, tiles, ...(elevation ? { elevation } : {}) }]);
  const spine = col(X, Z, MID, RUN_FROM, RUN_TO);
  const measured = { axis: 'x', x: X + MID, from: Z + RUN_FROM, to: Z + RUN_TO };
  switch (kase.scenario) {
    case 'straight':
      await build(`${kase.name} straight`, kase.tier, spine);
      return { measured, junctions: [] };
    case 'turn':
      // The corner sits at the far end of the measured run rather than in the
      // middle of it, so the whole column belongs to the turn's own arm and
      // there is straight road either side of the bend to compare against.
      await build(`${kase.name} turn arm`, kase.tier, spine);
      await build(`${kase.name} turn leg`, kase.tier, rowOf(X, Z, RUN_TO, MID, RUN_TO));
      return { measured, junctions: [{ x: X + MID, z: Z + RUN_TO }] };
    case 'tee':
      await build(`${kase.name} tee spine`, kase.tier, spine);
      await build(`${kase.name} tee stem`, kase.tier, rowOf(X, Z, MID, MID, RUN_TO));
      return { measured, junctions: [{ x: X + MID, z: Z + MID }] };
    case 'cross':
      await build(`${kase.name} cross spine`, kase.tier, spine);
      await build(`${kase.name} cross arm`, kase.tier, rowOf(X, Z, MID, RUN_FROM, RUN_TO));
      return { measured, junctions: [{ x: X + MID, z: Z + MID }] };
    case 'mixCross': {
      const other = kase.tier === CROSSER ? CROSSER_ALT : CROSSER;
      await build(`${kase.name} mix spine`, kase.tier, spine);
      await build(`${kase.name} mix arm`, other, rowOf(X, Z, MID, RUN_FROM, RUN_TO));
      return { measured, junctions: [{ x: X + MID, z: Z + MID }] };
    }
    case 'viaduct':
      await build(`${kase.name} viaduct`, kase.tier, spine, VIADUCT_HEIGHT_M);
      return { measured, junctions: [] };
    case 'overpass':
      // The road at grade goes down first, then the deck is asked to cross
      // it — the case a player creates, and the one one-road-per-tile cannot
      // represent. The deck has to join the road it meets, so the grade rule
      // refuses the whole drag.
      await build(`${kase.name} under`, CROSSER, rowOf(X, Z, MID, RUN_FROM, RUN_TO));
      await build(`${kase.name} over`, kase.tier, spine, VIADUCT_HEIGHT_M);
      return { measured, junctions: [] };
    default:
      throw new Error(`unknown scenario ${kase.scenario}`);
  }
}

/** Reads the paint spans of every tile of a measured run, plus both cross-section opinions. */
const readRun = (measured, axis) =>
  call(
    ([m, ax]) => {
      const S = window.__slimcity;
      const tiles = [];
      for (let k = m.from; k <= m.to; k++) {
        const x = ax === 'x' ? m.x : k;
        const z = ax === 'x' ? k : m.z;
        tiles.push({
          at: k,
          x,
          z,
          paint: S.readPaint(x, z),
          grid: S.readApproach(x, z),
          mesh: S.readDrawn(x, z),
        });
      }
      return tiles;
    },
    [measured, axis],
  );

const median = (xs) => {
  const s = [...xs].sort((a, c) => a - c);
  return s[Math.floor(s.length / 2)];
};

/** The bands a tile lays across the road it runs on, in order across it. */
const bandsOf = (tile, axis) =>
  tile.paint.filter((p) => p.axis === axis).sort((a, c) => a.from - c.from);

/**
 * What a tile says about itself, for a failure message. A band that stops is
 * only worth chasing once it is clear whether the tile it stopped at is
 * approaching a junction, and how near it has got.
 */
const describe = (t) =>
  !t.grid
    ? 'no road'
    : [
        `${t.grid.lanes} lanes`,
        `${t.grid.width.toFixed(2)}m`,
        t.grid.distance >= 0 ? `${t.grid.distance} from a junction` : 'no junction ahead',
        t.grid.pocket ? 'pocket' : null,
        t.grid.taper ? 'tapering' : null,
        t.grid.auxiliary ? 'auxiliary' : null,
      ]
        .filter(Boolean)
        .join('/');

/** A tile's band layout as one comparable string, so two tiles can be diffed at a glance. */
const signatureOf = (bands) =>
  bands
    .map((b) => `${b.color}@${((b.from + b.to) / 2).toFixed(2)}w${(b.to - b.from).toFixed(2)}`)
    .join(' | ');

const failures = [];
const notes = [];

// The cases that must be refused are laid LAST, after every screenshot has
// been taken. A refusal raises a toast, the toasts stack down the middle of
// the viewport, and a harness whose shots are half covered by its own error
// messages cannot be used to look at a road.
const ordered = [...cases].sort(
  (a, c) => Number(a.scenario === 'overpass') - Number(c.scenario === 'overpass'),
);

// Everything buildable goes down first, so the whole matrix exists before any
// of it is judged and one plot cannot be measured while the next is landing.
const plan = [];
const deferredPlan = [];
for (let i = 0; i < ordered.length && i < plots.length; i++) {
  const kase = ordered[i];
  const { x: X, z: Z } = plots[i];
  const entry = { kase, X, Z, tag: `${kase.name}-${kase.scenario}` };
  if (kase.scenario === 'overpass') {
    deferredPlan.push(entry);
    continue;
  }
  const { measured, junctions } = await lay(kase, X, Z);
  plan.push({ ...entry, measured, junctions });
  console.log(`laid ${kase.name}-${kase.scenario} at (${X},${Z})`);
}

/**
 * Reads a run once the renderer is actually holding it. Chunks rebuild on a
 * budget, so a read taken straight after a command can see a road the renderer
 * has not reached yet; the camera goes to the plot and the read waits.
 */
const framedRead = async (focus, measured) => {
  await cam(focus.x, focus.z, 64, 0, 1.5);
  const deadline = Date.now() + 15000;
  let tiles = [];
  for (;;) {
    await page.waitForTimeout(400);
    tiles = await readRun(measured, measured.axis);
    if (tiles.every((t) => t.paint.length > 0)) return tiles;
    if (Date.now() > deadline) return tiles;
  }
};

for (const { kase, tag, measured, junctions } of plan) {
  const focus = junctions[0] ?? {
    x: measured.x,
    z: Math.round((measured.from + measured.to) / 2),
  };
  const tiles = await framedRead(focus, measured);

  const laid = tiles.filter((t) => t.paint.length > 0);
  if (laid.length === 0) {
    failures.push(`${tag}: nothing was laid`);
    continue;
  }
  if (laid.length < tiles.length) {
    notes.push(`${tag}: ${tiles.length - laid.length}/${tiles.length} tiles of the run are bare`);
  }

  // Continuity, over the WHOLE run including the tiles the uniformity check
  // has to excuse. A road is allowed to change section; it is not allowed to
  // change it in one jump.
  //
  // Where the change is legitimate is not guessed at from a distance — the
  // tile is asked. A junction box, a tile the sim says is tapering, one
  // carrying a turn pocket, and one carrying an auxiliary merge lane are all
  // places the section is SUPPOSED to move, and a pair touching one of them is
  // let past. Anything left is a step no documented mechanism accounts for.
  // A road's own last tile caps itself off with a turnaround, which is a
  // different section on purpose and cannot taper into anything — there is
  // nothing beyond it to taper towards. It gets a shot of its own instead, so
  // the cap is looked at rather than measured against a rule it cannot meet.
  const endTile = (t) => t.at === measured.from || t.at === measured.to;
  const junctionTile = (t) => junctions.some((j) => j.x === t.x && j.z === t.z);
  const shifting = (t) =>
    endTile(t) ||
    junctionTile(t) ||
    !t.grid ||
    t.grid.taper !== null ||
    t.grid.auxiliary !== null ||
    t.grid.pocket;
  for (let k = 0; k + 1 < laid.length; k++) {
    const here = laid[k];
    const next = laid[k + 1];
    if (Math.abs(here.at - next.at) !== 1) continue; // a gap in the run is not a step
    if (shifting(here) || shifting(next)) continue;
    const a = bandsOf(here, measured.axis);
    const c = bandsOf(next, measured.axis);
    // Gravel jitters its surface colour per tile on purpose, so its bands
    // cannot be paired up by colour; they are paired by position across the
    // road instead, which is what the comparison is really about.
    const groups = JITTERED_TIERS.has(kase.tier)
      ? [['surface', a, c]]
      : [...new Set([...a, ...c].map((x) => x.color))].map((colour) => [
          colour,
          a.filter((x) => x.color === colour),
          c.filter((x) => x.color === colour),
        ]);
    for (const [label, mine, theirs] of groups) {
      if (mine.length !== theirs.length) {
        failures.push(
          `${tag}: band ${label} goes from ${mine.length} to ${theirs.length} between ` +
            `(${here.x},${here.z}) and (${next.x},${next.z})` +
            ` — ${describe(here)} then ${describe(next)}`,
        );
        continue;
      }
      for (let i = 0; i < mine.length; i++) {
        const step = Math.max(
          Math.abs(mine[i].from - theirs[i].from),
          Math.abs(mine[i].to - theirs[i].to),
        );
        if (step > STEP_TOLERANCE_M) {
          failures.push(
            `${tag}: band ${label} steps ${step.toFixed(2)}m sideways between ` +
              `(${here.x},${here.z}) [${mine[i].from.toFixed(2)}..${mine[i].to.toFixed(2)}] and ` +
              `(${next.x},${next.z}) [${theirs[i].from.toFixed(2)}..${theirs[i].to.toFixed(2)}]`,
          );
        }
      }
    }
  }

  // Tiles far enough from every junction — and from the road's own ends,
  // which cap themselves off with a turnaround — that their section should be
  // the road's own, unaltered.
  const ends = [
    { x: measured.axis === 'x' ? measured.x : measured.from, z: measured.axis === 'x' ? measured.from : measured.z },
    { x: measured.axis === 'x' ? measured.x : measured.to, z: measured.axis === 'x' ? measured.to : measured.z },
  ];
  const clear = laid.filter((t) =>
    [...junctions, ...ends].every(
      (j) => Math.abs(t.x - j.x) + Math.abs(t.z - j.z) >= JUNCTION_CLEARANCE,
    ),
  );
  if (clear.length < 4) {
    notes.push(`${tag}: only ${clear.length} tiles clear of junctions; uniformity not checked`);
  } else {
    // The road's total width, tile by tile: kerb to kerb over every band.
    const unions = clear.map((t) => {
      const bands = bandsOf(t, measured.axis);
      const lo = Math.min(...bands.map((p) => p.from));
      const hi = Math.max(...bands.map((p) => p.to));
      return { t, width: hi - lo, lo, hi };
    });
    const wantWidth = median(unions.map((u) => u.width));
    for (const u of unions) {
      if (Math.abs(u.width - wantWidth) > WIDTH_TOLERANCE_M) {
        failures.push(
          `${tag}: tile (${u.t.x},${u.t.z}) is ${u.width.toFixed(3)}m wide, ` +
            `the run is ${wantWidth.toFixed(3)}m`,
        );
      }
    }

    // The whole band layout, tile against tile. A run lays one cross-section,
    // so its tiles should be indistinguishable; the layout most of them agree
    // on is the road, and every tile that differs is the defect a picture of a
    // bike lane shows as jank. Gravel is excluded: it jitters its own surface
    // colour per tile on purpose, so its bands cannot be matched by colour.
    if (!JITTERED_TIERS.has(kase.tier)) {
      const signed = clear.map((t) => ({ t, sig: signatureOf(bandsOf(t, measured.axis)) }));
      const counts = new Map();
      for (const s of signed) counts.set(s.sig, (counts.get(s.sig) ?? 0) + 1);
      const [want] = [...counts.entries()].sort((a, c) => c[1] - a[1])[0];
      for (const s of signed) {
        if (s.sig === want) continue;
        failures.push(
          `${tag}: (${s.t.x},${s.t.z}) lays a different section from its run\n` +
            `      run:  ${want}\n` +
            `      tile: ${s.sig}`,
        );
      }
    }
  }

  // The grid and the mesh must agree about what is being drawn: where they
  // differ, the picture follows the mesh and every grid-only check is blind.
  for (const t of clear) {
    if (!t.grid || !t.mesh) continue;
    if (t.grid.lanes !== t.mesh.lanes || Math.abs(t.grid.width - t.mesh.width) > WIDTH_TOLERANCE_M) {
      failures.push(
        `${tag}: (${t.x},${t.z}) grid says ${t.grid.lanes} lanes/${t.grid.width.toFixed(2)}m, ` +
          `mesh draws ${t.mesh.lanes}/${t.mesh.width.toFixed(2)}m`,
      );
    }
  }

  const restore = await closeUp(page, 1.6);
  for (const [suffix, at] of [
    ['', focus],
    // The cap, which no measurement here holds to a rule: the only way it gets
    // checked is by being looked at.
    ['-end', { x: measured.axis === 'x' ? measured.x : measured.to, z: measured.axis === 'x' ? measured.to : measured.z }],
  ]) {
    await cam(at.x, at.z, 64, 0, 1.5);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/${tag}${suffix}.png` });
  }
  await restore();
}

// Last, now that nothing else needs a clean viewport: the cases the road
// model defers. One road per tile means a road crossing OVER another is not
// representable (docs/world-sim/road-model.md), and the deck has to join the
// road it meets, so the grade rule refuses the drag. What is checked is that
// the refusal is TOTAL — a deck that lands half its tiles and gives up at the
// crossing would leave a road ramping into the air, which is worse than not
// building at all.
for (const { kase, tag, X, Z } of deferredPlan) {
  await lay(kase, X, Z);
  console.log(`laid ${tag} at (${X},${Z})`);
}
await page.waitForTimeout(1500);
const elevations = await call(() => Array.from(window.__slimcity.readGrid().roadElevation));
for (const { tag, X, Z } of deferredPlan) {
  const raised = [];
  for (let k = RUN_FROM; k <= RUN_TO; k++) {
    if ((elevations[(Z + k) * N + (X + MID)] ?? 0) > 0) raised.push(Z + k);
  }
  if (raised.length > 0) {
    failures.push(
      `${tag}: an overpass is deferred by the road model, but ${raised.length} tiles of the ` +
        `deck stand clear of the ground (rows ${raised.join(', ')})`,
    );
  }
}

// Reported rather than failed: a fresh scene with no roads on it already
// submits these, so they are not the road matrix's to answer for. Worth
// printing anyway — the count rising after a road change would be.
const empty = await call(() => window.__slimcity.readEmptyDraws());
if (empty.length > 0) {
  notes.push(
    `${empty.length} empty draws in the scene (an empty map has them too, so not from the roads)`,
  );
}
for (const e of pageErrors) failures.push(`page error: ${e}`);

await b.close();
for (const n of notes) console.log('note:', n);
if (failures.length > 0) {
  console.log(`FAIL (${failures.length})`);
  for (const f of failures) console.log(' -', f);
  process.exitCode = 1;
} else {
  console.log('road matrix uniform; shots written to', out);
}
