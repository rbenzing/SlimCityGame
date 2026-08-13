/** Numbers behind tools/bridge-shots.mjs: builds the same spans one at a time
 * and reports, per row, whether the command was accepted and what profile came
 * back — riverbed, deck height, clearance over water, and where piers land.
 * A screenshot says something looks wrong; this says what the value is.
 *
 * Usage: node tools/bridge-probe.mjs [url]
 */
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:5173';
const RT = { TwoLane: 1, Avenue: 2, Highway: 3, Gravel: 4, RailTrack: 11 };
const PIER_SPACING = 3;

const b = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await b.newPage({ viewport: { width: 800, height: 600 } });
const toasts = [];
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
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
await page.goto(base, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#viewport canvas', { timeout: 20000 });
await page.waitForTimeout(4000);

const call = async (fn, ...a) => page.evaluate(fn, ...a);
const cmd = (l, c) => call(([x, y]) => window.__slimcity.cmd(x, y), [l, c]);
const readGrid = () => call(() => window.__slimcity.readGrid());

const g0 = await readGrid();
const N = g0.size;
const idx = (x, z) => z * N + x;

const BANK = 8;
let best = null;
for (let z = 30; z < N - 30; z++) {
  let x = BANK;
  while (x < N - BANK) {
    if (!g0.water[idx(x, z)]) {
      x++;
      continue;
    }
    let end = x;
    while (end < N - BANK && g0.water[idx(end, z)]) end++;
    const span = end - x;
    let dry = true;
    for (let k = 1; k <= BANK; k++)
      if (g0.water[idx(x - k, z)] || g0.water[idx(end - 1 + k, z)]) dry = false;
    if (dry && span >= 4 && span <= 22 && (!best || span > best.span))
      best = { z, from: x, to: end - 1, span };
    x = end;
  }
}
console.log('crossing', JSON.stringify(best));

await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
await page.waitForTimeout(300);

const rows = [
  { dz: 0, tier: RT.Highway, elevation: 0, name: 'highway' },
  { dz: 4, tier: RT.TwoLane, elevation: 0, name: 'two-lane' },
  { dz: 8, tier: RT.RailTrack, elevation: 0, name: 'rail' },
  { dz: 12, tier: RT.Gravel, elevation: 0, name: 'gravel' },
  { dz: 16, tier: RT.Avenue, elevation: 12, name: 'viaduct(+12)' },
];

for (const r of rows) {
  const z = best.z + r.dz;
  const x0 = best.from - BANK;
  const x1 = best.to + BANK;
  await cmd('R', [
    {
      kind: 'buildRoad',
      tier: r.tier,
      elevation: r.elevation,
      tiles: Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, z })),
    },
  ]);
  await page.waitForTimeout(700);
  const g = await readGrid();

  let built = 0;
  let raised = 0;
  let minClear = Infinity;
  let maxDeck = -Infinity;
  let minDeck = Infinity;
  const piers = [];
  for (let x = x0; x <= x1; x++) {
    const i = idx(x, z);
    if (g.roadTier[i] === 0) continue;
    built++;
    const e = g.roadElevation[i] ?? 0;
    const deck = g.height[i] + e;
    if (e > 0) {
      raised++;
      maxDeck = Math.max(maxDeck, deck);
      minDeck = Math.min(minDeck, deck);
      if (g.water[i]) minClear = Math.min(minClear, deck); // sea level is 0
      if ((x + z) % PIER_SPACING === 0)
        piers.push(`x${x}:bed=${g.height[i].toFixed(1)}->deck=${deck.toFixed(1)}`);
    }
  }
  // What the row actually crosses — the drag is sized from ONE row's survey, so
  // a neighbouring row can be wetter and leave the ramp nowhere to land.
  let wet = 0;
  for (let x = x0; x <= x1; x++) if (g.water[idx(x, z)]) wet++;
  const endsDry = `${g.water[idx(x0, z)] ? 'wet' : 'dry'}/${g.water[idx(x1, z)] ? 'wet' : 'dry'}`;
  const toast = await call(() => {
    const el = document.querySelector('[role="alert"], [role="status"]');
    return el ? el.textContent : '';
  });

  const want = x1 - x0 + 1;
  console.log(`  row z=${z} water ${wet}/${want} ends ${endsDry}${toast ? ` toast="${toast}"` : ''}`);
  console.log(
    `${r.name.padEnd(13)} built ${built}/${want} raised ${raised}` +
      (raised
        ? ` deck ${minDeck.toFixed(2)}..${maxDeck.toFixed(2)} (flat=${(maxDeck - minDeck).toFixed(2)})` +
          ` clearance ${Number.isFinite(minClear) ? minClear.toFixed(2) : 'n/a'}`
        : ''),
  );
  if (piers.length) console.log('    piers:', piers.slice(0, 6).join(' '));
}

console.log('toasts:', toasts.length ? toasts.join(' | ') : '(none captured)');
await b.close();
