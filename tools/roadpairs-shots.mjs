/** Do the road types play well with EACH OTHER? Every class against every class.
 *
 * The uniformity harness (roadmatrix-shots.mjs) asks whether a road is the
 * same road all the way along itself, and it crosses each class with exactly
 * one other one — two-lane, or four-lane when the class under test IS
 * two-lane. That is 12 of the 144 orderings a player can actually create, and
 * the 12 it picks leave out the pairing that matters most: a motorway meeting
 * the ramp that is the only legal way onto it.
 *
 * This harness lays every ordered pair. The SPINE class goes down first, then
 * the ARM class is drawn across it, which is the order a player builds in and
 * the order the replace-by-rank rule is written for. What comes back is one
 * of four outcomes per pair, read off the grid rather than off a picture:
 *
 *   join     both runs survive and share the crossing tile
 *   refuse   the arm was refused whole — no tile of it landed
 *   replace  the arm took the crossing tile from the spine, breaking it
 *   partial  the arm landed some tiles and not others
 *
 * `partial` is the one that should never happen. A drag is refused whole or
 * it is laid whole; an arm that stops halfway leaves a road pointing at a
 * road it never reached, and no rule in the model asks for that.
 *
 * The matrix is printed for reading. Judgement stays with the reader except
 * for the rules that are written down as invariants, which are asserted.
 *
 * Usage: node tools/roadpairs-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { hooksReady, tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-roadpairs';
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

/** Plot geometry. Each pair gets its own square so no two interfere. */
const PLOT = 12;
const RUN_FROM = 1;
const RUN_TO = 10;
/** Where the spine and the crossing arm meet, as an offset inside the plot. */
const MID = 5;

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

// Sandbox and unlimited money: this audit is about what the road rules allow,
// and a class that refuses to lay for want of a milestone or a balance would
// be recorded as a refusal by the rules, which is a different thing entirely.
await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
await call(() => window.__slimcity.setDayT(0.32));

const grid = await call(() => {
  const g = window.__slimcity.readGrid();
  return { size: g.size, water: Array.from(g.water) };
});
const N = grid.size;

/** Plots are handed out from a lattice; only the cross itself has to be dry. */
const plots = [];
for (let pz = 1; (pz + 1) * PLOT < N - PLOT; pz++) {
  for (let px = 1; (px + 1) * PLOT < N - PLOT; px++) {
    const x = px * PLOT;
    const z = pz * PLOT;
    let dry = true;
    for (let k = RUN_FROM - 1; k <= RUN_TO + 1 && dry; k++) {
      if (grid.water[(z + k) * N + (x + MID)]) dry = false;
      if (grid.water[(z + MID) * N + (x + k)]) dry = false;
    }
    if (dry) plots.push({ x, z });
  }
}

const pairs = [];
for (const spine of TIERS) for (const arm of TIERS) pairs.push({ spine, arm });
if (plots.length < pairs.length) {
  console.log(
    `only ${plots.length} dry plots for ${pairs.length} pairs; the tail will not be laid`,
  );
}

const col = (X, Z, x, a, c) =>
  Array.from({ length: c - a + 1 }, (_, i) => ({ x: X + x, z: Z + a + i }));
const rowOf = (X, Z, z, a, c) =>
  Array.from({ length: c - a + 1 }, (_, i) => ({ x: X + a + i, z: Z + z }));

// Everything goes down before anything is judged, so one plot is never read
// while the next is still landing.
const laid = [];
for (let i = 0; i < pairs.length && i < plots.length; i++) {
  const { spine, arm } = pairs[i];
  const { x: X, z: Z } = plots[i];
  const tag = `${spine.name}-over-${arm.name}`;
  await cmd(`${tag} spine`, [
    { kind: 'buildRoad', tier: spine.tier, tiles: col(X, Z, MID, RUN_FROM, RUN_TO) },
  ]);
  await cmd(`${tag} arm`, [
    { kind: 'buildRoad', tier: arm.tier, tiles: rowOf(X, Z, MID, RUN_FROM, RUN_TO) },
  ]);
  laid.push({ spine, arm, X, Z, tag });
}
console.log(`laid ${laid.length} pairs`);

await page.waitForTimeout(2000);
const tiers = await call(() => Array.from(window.__slimcity.readGrid().roadTier));

/**
 * What became of a pair, read off the grid.
 *
 * The arm is counted over its own tiles EXCLUDING the crossing, because the
 * crossing tile is the one both runs claim and it is scored separately. A
 * spine is broken when the crossing no longer carries it.
 */
function outcomeOf({ spine, arm, X, Z }) {
  const at = (x, z) => tiers[z * N + x] ?? 0;
  const cross = at(X + MID, Z + MID);
  let armTiles = 0;
  let armWanted = 0;
  for (let k = RUN_FROM; k <= RUN_TO; k++) {
    if (k === MID) continue;
    armWanted++;
    if (at(X + k, Z + MID) === arm.tier) armTiles++;
  }
  let spineTiles = 0;
  let spineWanted = 0;
  for (let k = RUN_FROM; k <= RUN_TO; k++) {
    if (k === MID) continue;
    spineWanted++;
    if (at(X + MID, Z + k) === spine.tier) spineTiles++;
  }
  const counts = { cross, armTiles, armWanted, spineTiles, spineWanted };
  // The spine is the premise of the whole pair. If it never landed, the arm
  // was drawn across bare ground and whatever it did says nothing about how
  // the two classes meet — which is exactly the shape of a harness that
  // reports a tidy grid of results and has measured nothing at all.
  if (spineTiles === 0) return { code: 'no-spine', ...counts };
  if (armTiles === 0) return { code: 'refuse', ...counts };
  if (armTiles < armWanted) return { code: 'partial', ...counts };
  if (cross === arm.tier && arm.tier !== spine.tier) return { code: 'replace', ...counts };
  return { code: 'join', ...counts };
}

const SYMBOL = { join: '=', refuse: '.', replace: 'X', partial: '!', 'no-spine': '?' };
const results = new Map();
for (const entry of laid) results.set(entry.tag, { ...entry, ...outcomeOf(entry) });

// --- the matrix, for reading --------------------------------------------
const width = Math.max(...TIERS.map((t) => t.name.length));
const pad = (s) => String(s).padEnd(width);
console.log('');
console.log(
  'spine laid first, arm drawn across it:  = join   . refuse   X replace   ! partial   ? no spine',
);
console.log(`${pad('')}  ${TIERS.map((t) => t.name.slice(0, 4).padEnd(5)).join('')}`);
for (const spine of TIERS) {
  const row = TIERS.map((arm) => {
    const r = results.get(`${spine.name}-over-${arm.name}`);
    return (r ? SYMBOL[r.code] : '?').padEnd(5);
  }).join('');
  console.log(`${pad(spine.name)}  ${row}`);
}
console.log('');

const failures = [];
const notes = [];

// --- the rules that are written down, asserted ---------------------------
const get = (spineName, armName) => results.get(`${spineName}-over-${armName}`);

// "A motorway touches only a highway or a ramp." An arm of any other class
// must not end up joined to a highway spine. It may be refused, and it may
// replace — what it may not do is form a junction with the motorway.
for (const arm of TIERS) {
  if (arm.name === 'highway' || arm.name === 'ramp') continue;
  const r = get('highway', arm.name);
  if (r && r.code === 'join') {
    failures.push(
      `a motorway touches only a highway or a ramp, but a ${arm.name} arm joined a highway spine`,
    );
  }
}

// "A ramp never joins dirt or alley."
for (const other of ['gravel', 'alley']) {
  const a = get('ramp', other);
  const c = get(other, 'ramp');
  if (a && a.code === 'join')
    failures.push(`a ramp never joins ${other}, but a ${other} arm joined a ramp spine`);
  if (c && c.code === 'join')
    failures.push(`a ramp never joins ${other}, but a ramp arm joined a ${other} spine`);
}

// A drag is refused whole or laid whole. Half a drag is never right.
for (const r of results.values()) {
  if (r.code === 'partial') {
    failures.push(
      `${r.tag}: the arm landed ${r.armTiles} of ${r.armWanted} tiles — a drag is refused whole ` +
        `or laid whole, never half`,
    );
  }
}

// A pair whose spine never landed has measured nothing, and a row of them
// means a whole class could not be laid. Loud, because the failure mode this
// guards against is a full matrix of confident-looking results over bare grass.
const spineless = [...results.values()].filter((r) => r.code === 'no-spine');
if (spineless.length > 0) {
  const classes = [...new Set(spineless.map((r) => r.spine.name))];
  failures.push(
    `${spineless.length} pairs never laid their spine, so they tested nothing ` +
      `(classes affected: ${classes.join(', ')})`,
  );
}

// The pairing the old harness never exercised, and the only legal way onto a
// motorway. Reported either way: if this one cannot join, the motorway is
// unreachable, which is worth saying out loud rather than leaving in a grid.
for (const [spineName, armName] of [
  ['highway', 'ramp'],
  ['ramp', 'highway'],
]) {
  const r = get(spineName, armName);
  if (r) notes.push(`${spineName} spine with a ${armName} arm: ${r.code}`);
}

// --- shots of the pairs worth looking at ---------------------------------
// A table says what the grid holds; only a picture says whether the crossing
// was DRAWN as a junction. These are the ones whose answer is load-bearing.
// Every refused arm raised a toast, and a stack of them covers the very
// crossing being photographed.
await page.addStyleTag({ content: '[role="status"]{display:none!important}' });
const SHOT_PAIRS = [
  ['highway', 'ramp'],
  ['ramp', 'highway'],
  ['highway', 'highway'],
  ['highway', 'two-lane'],
  ['rail', 'two-lane'],
  ['two-lane', 'rail'],
  ['tram', 'two-lane'],
  ['alley', 'two-lane'],
  ['one-way', 'one-way'],
  ['four-lane', 'avenue'],
];
for (const [spineName, armName] of SHOT_PAIRS) {
  const r = get(spineName, armName);
  if (!r) continue;
  await cam(r.X + MID, r.Z + MID, 70, 0, 1.5);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/${r.tag}-${r.code}.png` });
  console.log(`shot ${r.tag} (${r.code})`);
}

for (const e of pageErrors) failures.push(`page error: ${e}`);

await b.close();
for (const n of notes) console.log('note:', n);
if (failures.length > 0) {
  console.log(`FAIL (${failures.length})`);
  for (const f of failures) console.log(' -', f);
  process.exitCode = 1;
} else {
  console.log('every pair behaved; shots written to', out);
}
