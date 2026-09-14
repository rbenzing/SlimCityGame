/** Lane-drop taper check (SPEC 29, wave 4d): lay a four-lane road that becomes
 * a two-lane street, read back the cross-section tile by tile down the taper,
 * and shoot it.
 *
 * Usage: node tools/taper-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-tapers';
mkdirSync(out, { recursive: true });

const TWO_LANE = 1;
const HIGHWAY = 3;
const FOUR_LANE = 7;

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
const SPAN = 26;
let anchor = null;
let flattest = { spread: Infinity, at: null };
for (let z = 40; z < N - SPAN - 40 && !anchor; z++) {
  for (let x = 40; x < N - SPAN - 40; x++) {
    let lo = Infinity,
      hi = -Infinity,
      dry = true;
    for (let dz = 0; dz < SPAN && dry; dz += 2)
      for (let dx = 0; dx < SPAN && dry; dx += 2) {
        const i = idx(x + dx, z + dz);
        if (g0.water[i]) dry = false;
        const h = g0.height[i];
        if (h < lo) lo = h;
        if (h > hi) hi = h;
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
const { x: X, z: Z } = anchor;
console.log('anchor', JSON.stringify(anchor));

await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
await page.waitForTimeout(300);

const col = (x, from, to) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ x: X + x, z: Z + from + i }));

// A four-lane road running south into a two-lane street.
const CX = 10;
await cmd('four-lane', [{ kind: 'buildRoad', tier: FOUR_LANE, tiles: col(CX, 0, 11) }]);
await cmd('two-lane', [{ kind: 'buildRoad', tier: TWO_LANE, tiles: col(CX, 12, 20) }]);
await page.waitForTimeout(2500);

const failures = [];
const widths = [];
for (let z = 2; z <= 14; z++) widths.push({ z, ...(await approach(X + CX, Z + z)) });
console.log(
  'down the road:',
  JSON.stringify(widths.map((w) => ({ z: w.z, lanes: w.lanes, w: w.width }))),
);

// The taper closes 7.5 m over seven tiles, so the widths step down toward the
// street rather than dropping in one tile.
const wide = widths.find((w) => w.z === 2)?.width;
const atJoin = widths.find((w) => w.z === 11)?.width;
const mid = widths.find((w) => w.z === 8)?.width;
if (!(wide > mid && mid > atJoin))
  failures.push(`the road does not narrow gradually: ${wide} -> ${mid} -> ${atJoin}`);
if (!(atJoin <= 8)) failures.push(`the tile against the street is still ${atJoin} m wide`);

// The edge line has to hold its distance from the kerb the whole way down. The
// cross-section read-back cannot see this: it reports the width the tile
// carries, and the paint and the kerb can both be at the right width while
// sitting at different distances from each other — which is what a line that
// wanders in and out of the kerb down a taper looks like. So the surface is
// sampled point by point instead, at a centimetre, because a 0.15 m line is
// invisible to anything coarser.
const EDGE_LINE_MARGIN_M = 0.5;
const WHITE = '0.95,0.95,0.96';
const KERB = '0.82,0.81,0.79';
const TILE = 20;
const MIDX = (X + CX + 0.5) * TILE;

/** The runs of one colour along a line ACROSS the road at world z. */
const runsAcross = async (zWorld, x0, x1, n) => {
  const row = await call(
    ([a, b2, c, d, e]) => window.__slimcity.readSurface(a, b2, c, d, e),
    [x0, zWorld, x1, zWorld, n],
  );
  const at = (i) => x0 + ((i + 0.5) * (x1 - x0)) / n;
  const runs = [];
  let cur = null;
  for (let i = 0; i < n; i++) {
    const kind = row[i] === WHITE ? 'white' : row[i] === KERB ? 'kerb' : 'other';
    if (!cur || cur.kind !== kind) runs.push((cur = { kind, from: at(i), to: at(i) }));
    else cur.to = at(i);
  }
  return runs;
};

const gaps = [];
for (let z = 3; z <= 13; z++) {
  const here = await approach(X + CX, Z + z);
  const zWorld = (Z + z + 0.5) * TILE;
  for (const side of [-1, 1]) {
    // A two-metre window centred on where the kerb should be, so the scan is
    // fine enough to see paint without sampling the whole road at that rate.
    const kerbGuess = MIDX + side * (here.width / 2);
    const [x0, x1] = [kerbGuess - 1.2, kerbGuess + 1.2];
    const runs = await runsAcross(zWorld, x0, x1, 241);
    const kerb = side < 0 ? runs.filter((r) => r.kind === 'kerb').pop() : runs.find((r) => r.kind === 'kerb');
    const whites = runs.filter((r) => r.kind === 'white');
    const line = side < 0 ? whites.pop() : whites.shift();
    if (!kerb || !line) {
      failures.push(`z=${z} ${side < 0 ? 'left' : 'right'}: no ${!kerb ? 'kerb' : 'edge line'} found`);
      continue;
    }
    const kerbInner = side < 0 ? kerb.to : kerb.from;
    gaps.push({ z, side, gap: Math.abs((line.from + line.to) / 2 - kerbInner) });
  }
}
console.log(
  'edge line inside the kerb:',
  JSON.stringify(gaps.map((g) => ({ z: g.z, s: g.side, gap: +g.gap.toFixed(3) }))),
);
if (gaps.length < 20) failures.push(`only ${gaps.length} edge-line samples — the scan missed tiles`);
const off = gaps.filter((g) => Math.abs(g.gap - EDGE_LINE_MARGIN_M) > 0.06);
if (off.length > 0)
  failures.push(
    `the edge line does not hold its distance from the kerb down the taper: ${JSON.stringify(
      off.map((g) => ({ z: g.z, s: g.side, gap: +g.gap.toFixed(3) })),
    )}`,
  );

if (pageErrors.length > 0) failures.push(`page errors: ${pageErrors.join(' | ')}`);

await call(() => window.__slimcity.setDayT(0.5));
const shot = async (name, tx, tz, d, yaw, pitch) => {
  await cam(tx, tz, d, yaw, pitch);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
};
await shot('taper-down', X + CX, Z + 9, 90, 0.0, 1.15);
await shot('taper-head', X + CX, Z + 5, 34, 0.0, 1.2);
await shot('taper-along', X + CX, Z + 8, 120, 0.5, 0.7);

// A MOTORWAY lane drop is a different animal: the tarmac stays where it is and
// only the paint closes the lane, leaving a hatched neutral area. A street
// narrows; a motorway leaves the driver who missed the taper somewhere to go.
const MX = 20;
await cmd('motorway', [{ kind: 'buildRoad', tier: HIGHWAY, tiles: col(MX, 0, 11) }]);
await cmd('street', [{ kind: 'buildRoad', tier: TWO_LANE, tiles: col(MX, 12, 20) }]);
await page.waitForTimeout(2500);

const gore = [];
for (let z = 2; z <= 13; z++) gore.push({ z, ...(await approach(X + MX, Z + z)) });
console.log(
  'down the motorway:',
  JSON.stringify(gore.map((g) => ({ z: g.z, lanes: g.lanes, w: g.width, t: g.taper?.remaining }))),
);
// The drop is real — 15 m of motorway into a 7.5 m street — and every tile of
// the taper still keeps all 15 m of pavement. What narrows is the paint, and
// the read-back reports the pavement.
const paved = gore.filter((g) => g.z <= 11);
if (!paved.some((g) => g.taper))
  failures.push('the motorway is not tapering at all, so there is no gore to paint');
if (!paved.every((g) => Math.abs(g.width - 15) < 1e-6))
  failures.push(`the motorway unpaved its taper: ${JSON.stringify(paved.map((g) => g.width))}`);
if (Math.abs((gore.find((g) => g.z === 13)?.width ?? 0) - 7.5) > 1e-6)
  failures.push('the street it drops into is not the narrow road the drop was measured against');

await shot('gore-down', X + MX, Z + 8, 90, 0.0, 1.15);
await shot('gore-close', X + MX, Z + 9, 34, 0.0, 1.2);

console.log(failures.length === 0 ? 'PASS' : 'FAIL');
for (const f of failures) console.log(' -', f);
await b.close();
process.exit(failures.length === 0 ? 0 : 1);
