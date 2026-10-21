/** Ramp check: the slip road is a road the player can lay, in the shape it is
 * laid — up from the street, round an elbow beside the motorway, along the
 * motorway to the merge. Lay an on-ramp and an off-ramp that way, read back
 * the cross-section each carries, the direction it runs, that the motorway
 * end is joined both ways and the street end meets the street, and shoot it.
 *
 * The read-back is the point: a screenshot shows asphalt but not how many
 * lanes wide it is, which way its one lane goes, nor whether a mask holds.
 *
 * Usage: node tools/ramp-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-ramps';
mkdirSync(out, { recursive: true });

const HIGHWAY = 3;
const RAMP = 12;
const TWO_LANE = 1;
const FLOW = { N: 1, E: 2, S: 3, W: 4 };
const BIT = { N: 1, E: 2, S: 4, W: 8 };

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
await page.waitForTimeout(4000);

const call = (fn, ...a) => page.evaluate(fn, ...a);
const cmd = (l, c) => call(([x, y]) => window.__slimcity.cmd(x, y), [l, c]);
const readGrid = () => call(() => window.__slimcity.readGrid());
const approach = (x, z) => call(([ax, az]) => window.__slimcity.readApproach(ax, az), [x, z]);
const cam = tileCamera(page);

const g0 = await readGrid();
const N = g0.size;
const idx = (x, z) => z * N + x;

const SPAN = 24;
let anchor = null;
let flattest = { spread: Infinity, at: null };
for (let z = 40; z < N - SPAN - 40 && !anchor; z++) {
  for (let x = 40; x < N - SPAN - 40; x++) {
    let lo = Infinity;
    let hi = -Infinity;
    let dry = true;
    for (let dz = 0; dz < SPAN && dry; dz += 2) {
      for (let dx = 0; dx < SPAN && dry; dx += 2) {
        const i = idx(x + dx, z + dz);
        if (g0.water[i]) dry = false;
        const h = g0.height[i];
        if (h < lo) lo = h;
        if (h > hi) hi = h;
      }
    }
    if (!dry) continue;
    const spread = hi - lo;
    if (spread < flattest.spread) flattest = { spread, at: { x, z } };
    if (spread <= 0.4) {
      anchor = { x, z };
      break;
    }
  }
}
if (!anchor) anchor = flattest.at;
if (!anchor) {
  console.log('no dry block found');
  await b.close();
  process.exit(1);
}
const { x: X, z: Z } = anchor;
console.log('anchor', JSON.stringify(anchor), 'spread', flattest.spread.toFixed(2), 'm');

await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
await page.waitForTimeout(300);

const row = (z, from, to) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ x: X + from + i, z: Z + z }));
const col = (x, from, to) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ x: X + x, z: Z + from + i }));

// A motorway running east, a street to the south, and the two ramps that join
// them: the shapes every interchange is built out of. An on-ramp climbs from
// beside the street, turns beside the motorway and runs east along it to
// merge; an off-ramp leaves the motorway running east and turns down to the
// street. Each is one drag.
const HWY = 4;
const STREET = 14;
const ON = { x: 9, mergeX: 13 };
const OFF = { x: 5, leaveX: 2 };
const onRamp = [...col(ON.x, HWY + 1, STREET - 1).reverse(), ...row(HWY + 1, ON.x + 1, ON.mergeX)];
const offRamp = [...row(HWY + 1, OFF.leaveX, OFF.x), ...col(OFF.x, HWY + 2, STREET - 1)];
await cmd('motorway', [{ kind: 'buildRoad', tier: HIGHWAY, tiles: row(HWY, 0, 18) }]);
await cmd('street', [{ kind: 'buildRoad', tier: TWO_LANE, tiles: row(STREET, 0, 18) }]);
await cmd('on-ramp', [{ kind: 'buildRoad', tier: RAMP, tiles: onRamp }]);
await cmd('off-ramp', [{ kind: 'buildRoad', tier: RAMP, tiles: offRamp }]);
await page.waitForTimeout(2500);

const failures = [];
const g = await readGrid();
const tierAt = (x, z) => g.roadTier[idx(X + x, Z + z)];
const maskAt = (x, z) => g.roadMask[idx(X + x, Z + z)];
const flowAt = (x, z) => g.roadFlow[idx(X + x, Z + z)] & 7;

for (const [name, tiles] of [
  ['on-ramp', onRamp],
  ['off-ramp', offRamp],
]) {
  const laid = tiles.map((t) => g.roadTier[idx(t.x, t.z)]);
  console.log(`${name} tiles:`, JSON.stringify(laid));
  if (!laid.every((t) => t === RAMP))
    failures.push(`the ${name} did not lay as tier ${RAMP}: ${laid}`);
}
if (tierAt(ON.x, STREET) !== TWO_LANE || tierAt(OFF.x, STREET) !== TWO_LANE) {
  failures.push('a ramp took a tile of the street it ends against');
}

const mid = await approach(X + ON.x, Z + 9);
console.log('mid on-ramp:', JSON.stringify(mid));
if (!mid) failures.push('the ramp carries no cross-section at all');
if (mid && mid.lanes !== 1) failures.push(`the ramp draws ${mid.lanes} lanes, wanted 1`);
if (mid && Math.abs(mid.width - 7.8) > 1e-6)
  failures.push(`the ramp is ${mid.width} m across, wanted 7.8`);

// Each runs the way it was drawn — a ramp is one-way, so the stored direction
// is the whole of its meaning: the on-ramp climbs north, the off-ramp drops south.
console.log('stored flows: on-ramp', flowAt(ON.x, 9), 'off-ramp', flowAt(OFF.x, 9));
if (flowAt(ON.x, 9) !== FLOW.N) failures.push(`the on-ramp runs ${flowAt(ON.x, 9)}, wanted north`);
if (flowAt(OFF.x, 9) !== FLOW.S)
  failures.push(`the off-ramp runs ${flowAt(OFF.x, 9)}, wanted south`);

// Where a ramp meets the motorway the two hold each other: the ramp's tile
// points at the motorway and the motorway's tile points back. The same at
// the street, where the ramp's terminal meets the street's tile.
const joined = (what, x, z, bit, nx, nz, back) => {
  const ok = (maskAt(x, z) & bit) !== 0 && (maskAt(nx, nz) & back) !== 0;
  console.log(
    `${what}: ramp (${x},${z}) m${maskAt(x, z)} / other (${nx},${nz}) m${maskAt(nx, nz)}`,
  );
  if (!ok) failures.push(`${what} is not joined both ways`);
};
joined('on-ramp merge', ON.mergeX, HWY + 1, BIT.N, ON.mergeX, HWY, BIT.S);
joined('on-ramp terminal', ON.x, STREET - 1, BIT.S, ON.x, STREET, BIT.N);
joined('off-ramp diverge', OFF.leaveX, HWY + 1, BIT.N, OFF.leaveX, HWY, BIT.S);
joined('off-ramp terminal', OFF.x, STREET - 1, BIT.S, OFF.x, STREET, BIT.N);
// The stretch alongside is the ramp's own road: beside the motorway, not of it.
for (const x of [ON.x + 1, ON.mergeX - 1]) {
  if ((maskAt(x, HWY + 1) & BIT.N) !== 0)
    failures.push(`the on-ramp joins the motorway at (${x},${HWY + 1}), before its end`);
}

// The two ends of a slip road are not the same kind of place. Where it meets
// the motorway nothing holds anybody — that end is a merge. Where it meets the
// street it is a ramp TERMINAL, and a terminal is what an interchange is
// signalised at.
const controlAt = (x, z) =>
  call(
    ([cx, cz]) => (window.__slimcity.readJunctions() ?? []).find((j) => j.x === cx && j.z === cz),
    [x, z],
  );
const atMotorway = await controlAt(X + ON.mergeX, Z + HWY);
const atStreet = await controlAt(X + ON.x, Z + STREET);
console.log('motorway end:', JSON.stringify(atMotorway), 'street end:', JSON.stringify(atStreet));
if (atMotorway && atMotorway.control !== 'none')
  failures.push(
    `the motorway end is controlled (${atMotorway.control}); traffic is never stopped on a motorway`,
  );
if (!atStreet || atStreet.control === 'none')
  failures.push('the ramp terminal on the street takes no control at all');

if (pageErrors.length > 0) failures.push(`page errors: ${pageErrors.join(' | ')}`);

const shot = async (name, tx, tz, d, yaw, pitch) => {
  await cam(tx, tz, d, yaw, pitch);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
};
await shot('ramp-merge', X + ON.mergeX, Z + HWY + 1, 90, 0.6, 0.95);
await shot('ramp-elbow', X + ON.x, Z + HWY + 1, 110, 0.4, 1.0);
await shot('ramp-terminal', X + ON.x, Z + STREET - 1, 90, 0.6, 0.95);
await shot('ramp-wide', X + 8, Z + 9, 300, 0.7, 1.0);

await b.close();
if (failures.length > 0) {
  console.log('FAIL');
  for (const f of failures) console.log(' -', f);
  process.exit(1);
}
console.log('PASS');
