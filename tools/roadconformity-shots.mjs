/** Road conformity at mixed-class junctions: what the kerb, the footway and
 * the paint actually do where a small road meets a big one.
 *
 * Every claim a picture makes here has been wrong before, so each scenario is
 * measured as well as photographed: the bands the tile lays (readPaint), the
 * cross-section it drew (readDrawn) and the junction it resolved
 * (readJunctions) are printed beside the shot, and the shot is framed on the
 * corner because that is where the footway either joins or does not.
 *
 * Usage: node tools/roadconformity-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { tileCamera, closeUp, hooksReady } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-conformity';
mkdirSync(out, { recursive: true });

const TIER = { twoLane: 1, avenue: 2, highway: 3, gravel: 4, alley: 5, oneWay: 6, fourLane: 7, ramp: 12 };

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
await page.waitForTimeout(2500);

const call = (fn, ...a) => page.evaluate(fn, ...a);
const cmd = (l, c) => call(([x, y]) => window.__slimcity.cmd(x, y), [l, c]);
const readGrid = () => call(() => window.__slimcity.readGrid());
const paint = (x, z) => call(([a, c]) => window.__slimcity.readPaint(a, c), [x, z]);
const drawn = (x, z) => call(([a, c]) => window.__slimcity.readDrawn(a, c), [x, z]);
const cam = tileCamera(page);

const g0 = await readGrid();
const N = g0.size;
const idx = (x, z) => z * N + x;

// One flat, dry plot per scenario, laid out on a grid so scenarios never touch.
const SPAN = 30;
const STRIDE = SPAN + 6;
const candidates = [];
for (let z = 40; z < N - SPAN - 40; z += STRIDE) {
  for (let x = 40; x < N - SPAN - 40; x += STRIDE) {
    let lo = Infinity;
    let hi = -Infinity;
    let dry = true;
    for (let dz = 0; dz < SPAN && dry; dz += 2)
      for (let dx = 0; dx < SPAN && dry; dx += 2) {
        const i = idx(x + dx, z + dz);
        if (g0.water[i]) dry = false;
        const h = g0.height[i];
        if (h < lo) lo = h;
        if (h > hi) hi = h;
      }
    if (dry) candidates.push({ x, z, spread: hi - lo });
  }
}
candidates.sort((a, c) => a.spread - c.spread);

await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
await page.waitForTimeout(300);

const CX = 14;
const CZ = 14;

// major runs east-west through the plot; minor runs north-south, crossing it.
// `shape` 'cross' carries the minor right through; 'tee' stops it at the box.
const SCENARIOS = [
  { name: 'twolane-x-avenue', major: TIER.avenue, minor: TIER.twoLane, shape: 'cross' },
  { name: 'twolane-t-avenue', major: TIER.avenue, minor: TIER.twoLane, shape: 'tee' },
  { name: 'twolane-x-fourlane', major: TIER.fourLane, minor: TIER.twoLane, shape: 'cross' },
  { name: 'alley-t-avenue', major: TIER.avenue, minor: TIER.alley, shape: 'tee' },
  // The motorway is limited access, so the street that reaches it is a ramp.
  // A street crossing it is refused by the road tool, which is where that rule
  // lives and where its unit tests are; nothing to photograph.
  { name: 'ramp-t-highway', major: TIER.highway, minor: TIER.ramp, shape: 'tee' },
  { name: 'twolane-x-twolane', major: TIER.twoLane, minor: TIER.twoLane, shape: 'cross' },
  // An alley is a service road, not a leg of the traffic network: it wants no
  // turn bay taken out of the street it joins and no footway bent into it.
  // The street-to-street tee beside it is the control — whatever is done for
  // the alley must leave an ordinary side street alone.
  { name: 'alley-t-twolane', major: TIER.twoLane, minor: TIER.alley, shape: 'tee' },
  { name: 'twolane-t-twolane', major: TIER.twoLane, minor: TIER.twoLane, shape: 'tee' },
  // A road that ENDS where an alley leaves it. The road should run straight to
  // its own rounded end with the alley as a leg off it; a road does not bend
  // itself round to become a service road.
  { name: 'alley-corner-twolane', major: TIER.twoLane, minor: TIER.alley, shape: 'corner' },
  { name: 'twolane-corner-twolane', major: TIER.twoLane, minor: TIER.twoLane, shape: 'corner' },
];

// One plot per scenario, flattest first, so a scenario added above always gets
// ground rather than being silently skipped.
const plots = candidates.slice(0, SCENARIOS.length);
if (plots.length < SCENARIOS.length) {
  console.log(`WARNING: only ${plots.length} dry plots for ${SCENARIOS.length} scenarios`);
}
console.log(
  'flattest plots:',
  plots.map((p) => `${p.x},${p.z} (${p.spread.toFixed(2)}m)`).join(' | '),
);

// What each surface reads as in the corner map. Anything unlisted prints `?`
// and is named at the end, so a new colour is noticed rather than swallowed.
const LEGEND = {
  '0.42,0.42,0.43': '.', // asphalt
  '0.82,0.81,0.79': '#', // footway / kerb
  '0.95,0.95,0.96': 'W', // white paint
  '0.92,0.76,0.16': 'Y', // yellow paint
  '0.28,0.50,0.26': 'B', // bike-lane green
  '0.55,0.55,0.53': 'g', // grey paint
};

/**
 * The junction's north-west corner, drawn as text.
 *
 * A kerb return is a couple of metres of corner and reaches no tile edge, so
 * `readPaint` — which only sees bands running a tile's whole length — is blind
 * to it, and a screenshot of it at a shallow angle has been misread more than
 * once. This asks the mesh what covers each point instead.
 */
const cornerMap = async (jx, jz, T, halfSpan, n) => {
  const x0 = jx * T - halfSpan;
  const z0 = jz * T - halfSpan;
  const grid = await call(([a, c, d, e, f]) => window.__slimcity.readSurface(a, c, d, e, f), [
    x0,
    z0,
    jx * T + halfSpan,
    jz * T + halfSpan,
    n,
  ]);
  const unknown = new Set();
  const lines = [];
  for (let r = 0; r < n; r++) {
    let line = '';
    for (let c = 0; c < n; c++) {
      const v = grid[r * n + c];
      if (v === null) line += ' ';
      else if (LEGEND[v]) line += LEGEND[v];
      else {
        unknown.add(v);
        line += '?';
      }
    }
    lines.push('    ' + line);
  }
  return { text: lines.join('\n'), unknown: [...unknown], metres: (halfSpan * 2) / n };
};

const fmt = (bands) =>
  bands
    .map(
      (x) =>
        `${x.color}/${x.axis} near[${x.near.from.toFixed(2)},${x.near.to.toFixed(2)}] far[${x.far.from.toFixed(2)},${x.far.to.toFixed(2)}]`,
    )
    .join('  ');

for (let i = 0; i < SCENARIOS.length && i < plots.length; i++) {
  const s = SCENARIOS[i];
  const { x: X, z: Z } = plots[i];
  const row = (dz, a, c) => Array.from({ length: c - a + 1 }, (_, k) => ({ x: X + a + k, z: Z + dz }));
  const col = (dx, a, c) => Array.from({ length: c - a + 1 }, (_, k) => ({ x: X + dx, z: Z + a + k }));

  // A 'corner' runs the major road NORTH-SOUTH into the box and stops there,
  // with the minor leaving west, so the box is the road's own end beside a leg.
  const majorTiles = s.shape === 'corner' ? col(CX, 2, CZ) : row(CZ, 2, 26);
  await cmd('major', [{ kind: 'buildRoad', tier: s.major, tiles: majorTiles }]);
  await page.waitForTimeout(600);
  const minorTiles =
    s.shape === 'cross' ? col(CX, 2, 26) : s.shape === 'corner' ? row(CZ, 2, CX) : col(CX, 2, CZ);
  await cmd('minor', [{ kind: 'buildRoad', tier: s.minor, tiles: minorTiles }]);
  await page.waitForTimeout(2200);

  const g = await readGrid();
  const tierAt = (x, z) => g.roadTier[idx(x, z)];
  const jx = X + CX;
  const jz = Z + CZ;
  console.log(`\n=== ${s.name} ===  plot ${X},${Z}`);
  console.log(
    '  minor laid?',
    s.shape === 'cross'
      ? `north ${tierAt(jx, jz - 1)} south ${tierAt(jx, jz + 1)}`
      : `north ${tierAt(jx, jz - 1)}`,
    ' box tier', tierAt(jx, jz),
  );
  // The control decides which arms are painted at all: an arm that gives way
  // gets the crossing and the bar, an arm running through gets neither, and a
  // signal holds every arm. Printed so a missing crossing is read against the
  // rule rather than called a defect on sight.
  const junctions = await call(() => window.__slimcity.readJunctions());
  console.log(
    '  junction   :',
    JSON.stringify(junctions.filter((j) => Math.abs(j.x - jx) <= 1 && Math.abs(j.z - jz) <= 1)),
  );
  console.log('  box drawn  :', JSON.stringify(await drawn(jx, jz)));
  // What the MAJOR road does on its way in. A turn bay carved out of a street
  // for the sake of an alley is the thing to catch here, so the approach is
  // read tile by tile back from the junction rather than only at the box.
  for (const d of [1, 2, 3]) {
    const a = await call(([ax, az]) => window.__slimcity.readApproach(ax, az), [jx - d, jz]);
    console.log(
      `  W-${d} approach:`,
      a === null
        ? 'null'
        : `lanes ${a.lanes} width ${a.width.toFixed(2)} pocket ${a.pocket} ` +
          `taper ${a.taper ? `${a.taper.closed}/${a.taper.length}` : 'null'} dist ${a.distance}`,
    );
  }
  console.log('  box paint  :', fmt(await paint(jx, jz)));
  console.log('  W-1 paint  :', fmt(await paint(jx - 1, jz)));
  console.log('  W-2 paint  :', fmt(await paint(jx - 2, jz)));
  console.log('  N-1 paint  :', fmt(await paint(jx, jz - 1)));
  console.log('  N-2 paint  :', fmt(await paint(jx, jz - 2)));

  const T = await call(() => window.__slimcity.tileMeters());

  // A signal's arm is supposed to reach out over the lanes it holds. The head
  // is a few pixels across and the arm is foreshortened to nothing from
  // overhead, so it is measured against the arm road's own kerb: how far past
  // it the head hangs, and whether it reaches the lanes that stop for it.
  const signals = await call(() => window.__slimcity.readSignals());
  const near = signals.filter(
    (g) => Math.abs(g.tile.x - jx) <= 1 && Math.abs(g.tile.z - jz) <= 1,
  );
  if (near.length > 0) {
    console.log('  signal heads:');
    for (const g of near) {
      // The kerb the mast stands on, and how far in the head reaches from it.
      const acrossMast = g.axis === 'x' ? g.mast.x : g.mast.z;
      const acrossHead = g.axis === 'x' ? g.head.x : g.head.z;
      const centre = (g.axis === 'x' ? jx : jz) * T + T / 2;
      const armTile = g.axis === 'x' ? { x: g.tile.x, z: g.tile.z } : { x: g.tile.x, z: g.tile.z };
      const d = await drawn(armTile.x, armTile.z);
      const half = d ? d.width / 2 : null;
      const kerb = Math.abs(acrossMast - centre);
      const reach = Math.abs(acrossHead - centre);
      console.log(
        `    tile ${g.tile.x},${g.tile.z} axis ${g.axis} side ${g.side}: ` +
          `mast ${kerb.toFixed(2)} m from the road's centre, head ${reach.toFixed(2)} m` +
          (half === null
            ? ''
            : ` — carriageway half ${half.toFixed(2)} m, so the head is ` +
              (reach < half ? `OVER the lanes` : `${(reach - half).toFixed(2)} m OUTSIDE the kerb`)),
      );
    }
  }

  const map = await cornerMap(jx, jz, T, 8, 64);
  console.log(`  corner map (${map.metres.toFixed(2)} m/cell, NW corner at the middle):`);
  console.log(map.text);
  if (map.unknown.length > 0) console.log('  unnamed colours:', map.unknown.join(' '));

  const shots = [
    ['box', jx, jz, 44, 0, 1.5],
    ['corner-nw', jx - 0.5, jz - 0.5, 40, 0, 1.5],
    ['wide', jx, jz, 90, 0, 1.5],
  ];
  const restore = await closeUp(page, 2);
  for (const [name, tx, tz, d, yaw, pitch] of shots) {
    await cam(tx, tz, d, yaw, pitch);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}/${s.name}-${name}.png` });
  }
  await restore();
  console.log('  shots written');
}

await b.close();
if (pageErrors.length > 0) {
  console.log('FAIL');
  for (const e of pageErrors) console.log(' - page error:', e);
  process.exitCode = 1;
} else {
  console.log('\nshots written to', out);
}
