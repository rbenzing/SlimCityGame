/** Road audit: is a road the same road all the way along it? Writes numbers, no frames.
 *
 * Lays every laying tier in every topology a road goes down in (a straight run, a right-angle
 * turn, a tee, a crossroads with itself, a crossroads with another class, a raised viaduct)
 * and reads what came out off the mesh (`readPaint`, `readApproach`, `readDrawn`). Three
 * checks per run: every plain tile lays an identical section, no band's edge steps more than
 * the tolerance between neighbouring tiles, and the grid and the mesh agree about what is drawn.
 * An overpass is asked for over a road at grade and must be crossed over or refused whole.
 *
 * Two read-backs of the road-composition work run beside it: lamps stand at the kerb of a row
 * with a parking lane (not in the parking lane), and the crosswalk over an undivided corridor
 * is one run of bars on an even pitch with no stop line over the edge the halves share.
 *
 * Usage: node tools/probes/road-audit.mjs [url]
 * Exits 1 when any check fails. A failure is a finding about the game, not about the probe.
 */
import { pathToFileURL } from 'node:url';
import { tileCamera } from '../shots/lib/camera.mjs';
import { definedProfile, TIER } from '../shots/lib/roads.mjs';
import { openSession, settle } from '../shots/lib/session.mjs';
import {
  auditRun,
  cornerText,
  crosswalkFindings,
  judgeOverpass,
  rowLampOffsets,
} from './lib/checks.mjs';

/** Every laying tier, by the name the audit reports it under. */
const TIERS = Object.entries(TIER).map(([name, tier]) => ({ tier, name }));
const SCENARIOS = ['straight', 'turn', 'tee', 'cross', 'mixCross', 'viaduct', 'overpass'];

/** The road every mixed junction is crossed by, and what crosses the plain street itself. */
const CROSSER = TIER.twoLane;
const CROSSER_ALT = TIER.fourLane;
/** Plot geometry: each case gets its own square so no two interfere. */
const PLOT = 18;
const RUN_FROM = 2;
const RUN_TO = 16;
/** Where the spine and the crossing arm meet, as an offset inside the plot. */
const MID = 9;
/** Gravel jitters its surface colour per tile on purpose, so its bands cannot be matched by colour. */
const JITTERED = new Set([TIER.gravel]);
/** High enough that the deck is plainly clear of the ground, low enough to climb to and land. */
const VIADUCT_HEIGHT_M = 8;
const READ_TIMEOUT_MS = 15000;

const col = (X, Z, x, a, c) =>
  Array.from({ length: c - a + 1 }, (_, i) => ({ x: X + x, z: Z + a + i }));
const rowOf = (X, Z, z, a, c) =>
  Array.from({ length: c - a + 1 }, (_, i) => ({ x: X + a + i, z: Z + z }));

/** Lays one case in its plot; says which tiles form the run to measure and which are junctions. */
async function lay(send, kase, X, Z) {
  const build = (label, tier, tiles, elevation) =>
    send(label, [{ kind: 'buildRoad', tier, tiles, ...(elevation ? { elevation } : {}) }]);
  const spine = col(X, Z, MID, RUN_FROM, RUN_TO);
  const measured = { axis: 'x', x: X + MID, from: Z + RUN_FROM, to: Z + RUN_TO };
  const mid = { x: X + MID, z: Z + MID };
  switch (kase.scenario) {
    case 'straight':
      await build(`${kase.name} straight`, kase.tier, spine);
      return { measured, junctions: [] };
    case 'turn':
      // The corner sits at the far end of the run, so the whole column is the turn's own arm.
      await build(`${kase.name} turn arm`, kase.tier, spine);
      await build(`${kase.name} turn leg`, kase.tier, rowOf(X, Z, RUN_TO, MID, RUN_TO));
      return { measured, junctions: [{ x: X + MID, z: Z + RUN_TO }] };
    case 'tee':
      await build(`${kase.name} tee spine`, kase.tier, spine);
      await build(`${kase.name} tee stem`, kase.tier, rowOf(X, Z, MID, MID, RUN_TO));
      return { measured, junctions: [mid] };
    case 'cross':
      await build(`${kase.name} cross spine`, kase.tier, spine);
      await build(`${kase.name} cross arm`, kase.tier, rowOf(X, Z, MID, RUN_FROM, RUN_TO));
      return { measured, junctions: [mid] };
    case 'mixCross': {
      const other = kase.tier === CROSSER ? CROSSER_ALT : CROSSER;
      await build(`${kase.name} mix spine`, kase.tier, spine);
      await build(`${kase.name} mix arm`, other, rowOf(X, Z, MID, RUN_FROM, RUN_TO));
      return { measured, junctions: [mid] };
    }
    case 'viaduct':
      await build(`${kase.name} viaduct`, kase.tier, spine, VIADUCT_HEIGHT_M);
      return { measured, junctions: [] };
    case 'overpass':
      // The road at grade goes down first, then the deck is asked to cross it, as a player does.
      await build(`${kase.name} under`, CROSSER, rowOf(X, Z, MID, RUN_FROM, RUN_TO));
      await build(`${kase.name} over`, kase.tier, spine, VIADUCT_HEIGHT_M);
      return { measured, junctions: [] };
    default:
      throw new Error(`unknown scenario ${kase.scenario}`);
  }
}

/** Reads the paint, grid and mesh of every tile of a run. */
const readRun = (page, m) =>
  page.evaluate((m) => {
    const S = window.__slimcity;
    const tiles = [];
    for (let k = m.from; k <= m.to; k++) {
      const x = m.axis === 'x' ? m.x : k;
      const z = m.axis === 'x' ? k : m.z;
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
  }, m);

/**
 * Reads a run once the renderer holds it: chunks rebuild on a budget, so the camera goes to the
 * plot and the read waits until every tile has paint, or the timeout passes.
 */
async function framedRead(page, cam, focus, measured) {
  await cam(focus.x, focus.z, 64, 0, 1.5);
  const deadline = performance.now() + READ_TIMEOUT_MS;
  // A tile with no paint at all (a corner box) never fills, so the read is also done once the
  // count of painted tiles has held for two further reads.
  let last = -1;
  let held = 0;
  for (;;) {
    await settle(page);
    const tiles = await readRun(page, measured);
    const painted = tiles.filter((t) => t.paint.length > 0).length;
    held = painted === last ? held + 1 : 0;
    last = painted;
    if (painted === tiles.length || (painted > 0 && held >= 2) || performance.now() > deadline)
      return tiles;
  }
}

/** Dry plots handed out from a lattice: only the cross of a spine and an arm has to be dry. */
function dryPlots(grid) {
  const N = grid.size;
  const plots = [];
  for (let pz = 1; (pz + 1) * PLOT < N - PLOT; pz++) {
    for (let px = 1; (px + 1) * PLOT < N - PLOT; px++) {
      const x = px * PLOT;
      const z = pz * PLOT;
      let dry = true;
      for (let k = RUN_FROM - 1; k <= RUN_TO + 1 && dry; k++)
        for (let m = -1; m <= 1 && dry; m++) {
          if (grid.water[(z + k) * N + (x + MID + m)]) dry = false;
          if (grid.water[(z + MID + m) * N + (x + k)]) dry = false;
        }
      if (dry) plots.push({ x, z });
    }
  }
  return plots;
}

/** Waits for a command's refusal toast to land, then returns the new ones. */
async function newRefusals(session, seen) {
  await settle(session.page);
  const all = await session.refusals();
  return { fresh: all.slice(seen), count: all.length };
}

/** Lamps stand at the kerb of the road they light, never in a parking lane. */
async function lampCheck(session, cam, plot, failures, log) {
  const { page, send } = session;
  const TWO_LANE = TIER.twoLane;
  const sidewalk = { kind: 'sidewalk', width: 1.875 };
  const parking = { kind: 'parking', width: 2.25 };
  const parked = definedProfile({
    class: 'local',
    pieces: [
      sidewalk,
      parking,
      { kind: 'travel', width: 3.75, flow: 'back' },
      { kind: 'travel', width: 3.75, flow: 'fwd' },
      parking,
      sidewalk,
    ],
  });
  const { x: X, z: Z } = plot;
  const row = (z) => rowOf(X, Z, z, 2, 13);
  const PRESET_Z = Z + 2;
  const PARKED_Z = Z + 5;
  await send('lamp preset row', [{ kind: 'buildRoad', tier: TWO_LANE, tiles: row(2) }]);
  await send('lamp parked row', [
    parked.define,
    { kind: 'buildRoad', tier: TWO_LANE, tiles: row(5), profile: parked.id },
  ]);
  // A lamp stands only on a street the grid supplies, so a plant is butted against each row's end.
  await send('lamp plants', [
    { kind: 'placeBuilding', catalogId: 'coal-plant', x: X + 14, z: Z + 1, rotation: 3 },
    { kind: 'placeBuilding', catalogId: 'coal-plant', x: X + 14, z: Z + 5, rotation: 3 },
  ]);
  await cam(X + 8, Z + 4, 64, 0, 1.5);
  const tile = await page.evaluate(() => window.__slimcity.tileMeters());
  const measure = async () => {
    const poles = await page.evaluate(() => window.__slimcity.readLampPoles());
    const spec = { x0: X + 2, x1: X + 14, tile };
    return {
      preset: rowLampOffsets(poles, { ...spec, z: PRESET_Z }),
      parked: rowLampOffsets(poles, { ...spec, z: PARKED_Z }),
    };
  };
  let found = await measure();
  const deadline = performance.now() + READ_TIMEOUT_MS;
  while ((found.preset.length === 0 || found.parked.length === 0) && performance.now() < deadline) {
    await settle(page);
    found = await measure();
  }
  const f = (v) => v.map((x) => x.toFixed(2)).join(' ');
  log(
    `lamps: ${found.preset.length} on the preset row at ${f(found.preset)} m, ${found.parked.length} on the parked row at ${f(found.parked)} m`,
  );
  if (found.preset.length === 0 || found.parked.length === 0)
    failures.push('lamps: no lamps found to measure');
  if (found.preset.some((v) => v < 3.75 || v > 3.75 + 1.875))
    failures.push('lamps: a preset-row lamp is off the kerb');
  if (found.parked.some((v) => v < 6.0 || v > 6.0 + 1.875))
    failures.push('lamps: a parked-row lamp is not at the 6 m kerb');
}

/** The crosswalk over an undivided six-lane corridor is one run of even bars across both halves. */
async function corridorCheck(session, cam, plot, failures, log) {
  const { page, send } = session;
  const SOUTH = 3;
  const CORRIDOR = 0b1000;
  const CORRIDOR_RIGHT = 0b1_0000;
  const lane = (flow) => ({ kind: 'travel', width: 3.6, flow });
  const undivided = definedProfile({
    class: 'arterial',
    pieces: [
      { kind: 'sidewalk', width: 1.9 },
      lane('back'),
      lane('back'),
      lane('back'),
      lane('fwd'),
      lane('fwd'),
      lane('fwd'),
      { kind: 'sidewalk', width: 1.9 },
    ],
  });
  const { x: X, z: Z } = plot;
  const LEFT_X = 6;
  const RIGHT_X = 7;
  const RUN = [2, 12];
  const T_Z = 7;
  await send('define undivided', [undivided.define]);
  for (const [x, bits] of [
    [LEFT_X, SOUTH | CORRIDOR],
    [RIGHT_X, SOUTH | CORRIDOR | CORRIDOR_RIGHT],
  ]) {
    const tiles = col(X, Z, x, RUN[0], RUN[1]);
    await send('undivided half', [
      {
        kind: 'buildRoad',
        tier: TIER.avenue,
        tiles,
        profile: undivided.id,
        flows: tiles.map(() => bits),
      },
    ]);
  }
  await send('T street', [
    { kind: 'buildRoad', tier: TIER.twoLane, tiles: rowOf(X, Z, T_Z, RIGHT_X + 1, RIGHT_X + 9) },
  ]);
  await send('T signal', [
    { kind: 'setJunctionControl', x: X + LEFT_X, z: Z + T_Z, control: 'signal' },
    { kind: 'setJunctionControl', x: X + RIGHT_X, z: Z + T_Z, control: 'signal' },
  ]);
  await cam(X + RIGHT_X, Z + T_Z, 64, 0, 1.5);
  const COLS = 48;
  const read = () =>
    page.evaluate(
      ([x, z, n]) => window.__slimcity.readSurface(x, z, x + 12, z + 12, n),
      // A 12 m window about the edge the two halves share, from just before the junction row.
      [(X + RIGHT_X) * 20 - 6, (Z + T_Z) * 20 - 4, COLS],
    );
  const junctionsOn = () =>
    page.evaluate(
      ([z, a, b]) =>
        window.__slimcity.readJunctions().filter((j) => j.z === z && (j.x === a || j.x === b)),
      [Z + T_Z, X + LEFT_X, X + RIGHT_X],
    );
  // The paint arrives with the chunk: read until a crosswalk shows or the timeout passes.
  let findings;
  let cells;
  const deadline = performance.now() + READ_TIMEOUT_MS;
  do {
    await settle(page);
    cells = await read();
    findings = crosswalkFindings(cells, COLS);
  } while (findings.bars === 0 && performance.now() < deadline);
  const junctions = await junctionsOn();
  log(
    `corridor crosswalk: ${findings.bars} bars in the best row, ${junctions.length} junctions on the T row`,
  );
  if (findings.failures.length > 0) {
    log(`corridor junctions: ${JSON.stringify(junctions)}`);
    log(
      `corridor window (12 m about the shared edge, north to south):\n${cornerText(cells, COLS).text}`,
    );
  }
  failures.push(...findings.failures.map((f) => `corridor: ${f}`));
  if (junctions.length !== 2)
    failures.push(
      `corridor: a T onto an undivided corridor made ${junctions.length} junctions, wanted one on each half`,
    );
}

/** Runs the probe against `url`; returns the failures. */
export async function runRoadAudit(url) {
  const started = performance.now();
  const session = await openSession(url);
  const { page, send } = session;
  const cam = tileCamera(page);
  const failures = [];
  const notes = [];
  const log = (line) => console.log(line);
  try {
    const grid = await page.evaluate(() => {
      const g = window.__slimcity.readGrid();
      return { size: g.size, water: Array.from(g.water) };
    });
    const N = grid.size;
    const plots = dryPlots(grid);
    const cases = TIERS.flatMap((t) =>
      SCENARIOS
        // A highway meets only a highway or a ramp, so no street can cross it.
        .filter((s) => !(t.tier === TIER.highway && s === 'mixCross'))
        .map((scenario) => ({ ...t, scenario })),
    );
    const EXTRA_PLOTS = 2;
    if (plots.length < cases.length + EXTRA_PLOTS)
      failures.push(`only ${plots.length} dry plots for ${cases.length + EXTRA_PLOTS} cases`);

    const plan = [];
    let seen = 0;
    for (let i = 0; i < cases.length && i < plots.length - EXTRA_PLOTS; i++) {
      const kase = cases[i];
      const { x: X, z: Z } = plots[i];
      const tag = `${kase.name}-${kase.scenario}`;
      const laid = await lay(send, kase, X, Z);
      const { fresh, count } = await newRefusals(session, seen);
      seen = count;
      // A deck over a road is asked for and may be refused; any other refusal is a finding.
      if (kase.scenario !== 'overpass')
        for (const r of fresh) failures.push(`${tag}: the game refused it - ${r}`);
      plan.push({ kase, tag, X, Z, ...laid });
    }
    log(`laid ${plan.length} cases in ${((performance.now() - started) / 1000).toFixed(0)} s`);

    let checked = 0;
    let seams = 0;
    let uniform = 0;
    for (const { kase, tag, measured, junctions } of plan) {
      if (kase.scenario === 'overpass') continue;
      const focus = junctions[0] ?? {
        x: measured.x,
        z: Math.round((measured.from + measured.to) / 2),
      };
      const tiles = await framedRead(page, cam, focus, measured);
      const result = auditRun({
        tag,
        tiles,
        measured,
        junctions,
        jittered: JITTERED.has(kase.tier),
      });
      failures.push(...result.failures);
      notes.push(...result.notes);
      seams += result.stats.seams;
      uniform += result.stats.uniform;
      checked++;
    }
    log(
      `audited ${checked} runs: ${seams} seams compared, ${uniform} tiles checked for one section`,
    );

    await settle(page);
    const after = await page.evaluate(() => {
      const g = window.__slimcity.readGrid();
      return {
        elevations: Array.from(g.roadElevation),
        tiers: Array.from(g.roadTier),
        overRoads: g.overRoads,
      };
    });
    for (const { kase, tag, X, Z } of plan.filter((p) => p.kase.scenario === 'overpass')) {
      const raisedRows = [];
      for (let k = RUN_FROM; k <= RUN_TO; k++)
        if ((after.elevations[(Z + k) * N + (X + MID)] ?? 0) > 0) raisedRows.push(Z + k);
      const { verdict, failure } = judgeOverpass({
        tag,
        crossedOver: after.overRoads.some((o) => o.x === X + MID && o.z === Z + MID),
        tierBeneath: after.tiers[(Z + MID) * N + (X + MID)],
        expectedTier: CROSSER,
        raisedRows,
      });
      log(`${tag}: ${verdict}`);
      if (failure) failures.push(failure);
      void kase;
    }

    const [lampPlot, corridorPlot] = plots.slice(-EXTRA_PLOTS);
    await lampCheck(session, cam, lampPlot, failures, log);
    await corridorCheck(session, cam, corridorPlot, failures, log);
    for (const e of session.errors) failures.push(`page error: ${e}`);
  } finally {
    await session.close();
  }
  for (const n of notes) console.log('note:', n);
  const seconds = ((performance.now() - started) / 1000).toFixed(0);
  if (failures.length > 0) {
    console.log(`FAIL (${failures.length}) in ${seconds} s`);
    for (const f of failures) console.log(' -', f);
  } else console.log(`road audit holds in ${seconds} s`);
  return failures;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const failures = await runRoadAudit(process.argv[2] ?? 'http://localhost:5173');
  process.exitCode = failures.length > 0 ? 1 : 0;
}
