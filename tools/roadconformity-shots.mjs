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

const TIER = { twoLane: 1, avenue: 2, highway: 3, gravel: 4, alley: 5, oneWay: 6, fourLane: 7, bus: 8, bike: 9, tram: 10, rail: 11, ramp: 12 };

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
// How much map to leave round the edge. Enough to stay clear of the border,
// small enough that the search finds a plot for every scenario below.
const MARGIN = 20;
const candidates = [];
for (let z = MARGIN; z < N - SPAN - MARGIN; z += STRIDE) {
  for (let x = MARGIN; x < N - SPAN - MARGIN; x += STRIDE) {
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
// Pin midday. A shot taken at night is a shot nobody can read, and looking at
// the shot is the whole point of taking it.
await call(() => window.__slimcity.setDayT(0.5));
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
  // The rest of the catalog against an ordinary street. A gravel track is the
  // control for the service rule — it has no kerb either, but it IS a road, so
  // it must still turn the corner and still bend the road that ends at it.
  { name: 'gravel-t-twolane', major: TIER.twoLane, minor: TIER.gravel, shape: 'tee' },
  { name: 'gravel-corner-twolane', major: TIER.twoLane, minor: TIER.gravel, shape: 'corner' },
  { name: 'oneway-x-twolane', major: TIER.twoLane, minor: TIER.oneWay, shape: 'cross' },
  // The reserved kerbside lanes, where the edge line and the coloured fill
  // have their own rule, and the tier the original bike-lane report was about.
  { name: 'bus-x-twolane', major: TIER.twoLane, minor: TIER.bus, shape: 'cross' },
  { name: 'bike-x-twolane', major: TIER.twoLane, minor: TIER.bike, shape: 'cross' },
  { name: 'twolane-x-bike', major: TIER.bike, minor: TIER.twoLane, shape: 'cross' },
  // Tram runs in the carriageway; rail is a separate network that crosses a
  // street at grade without joining it.
  { name: 'tram-x-twolane', major: TIER.twoLane, minor: TIER.tram, shape: 'cross' },
  { name: 'rail-x-twolane', major: TIER.twoLane, minor: TIER.rail, shape: 'cross' },
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
  '0.55,0.55,0.53': 'g', // grey paint
  // Two different greens, which is why the earlier label was wrong: an
  // avenue's PLANTED MEDIAN is the paler one and a bike lane's fill the
  // darker. Calling both "bike" read a median as a lane.
  '0.28,0.50,0.26': 'm', // planted median
  '0.13,0.42,0.22': 'B', // bike-lane fill
  '0.60,0.24,0.18': 'U', // bus-lane fill
  '0.34,0.33,0.31': 'o', // rail ballast
};

/**
 * A surface the legend does not name exactly.
 *
 * Gravel is tinted per tile off the terrain beneath it, so its colours cannot
 * be enumerated — listing the ones a run happened to produce just makes the
 * next run print a different set. Anything warm and mid-toned reads as gravel;
 * anything else stays `?`, which is the alarm this map is supposed to raise.
 */
const classify = (c) => {
  const [r, g, b] = c.split(',').map(Number);
  // Blue lowest and barely saturated: earth, whatever the ground under it
  // tinted it toward. Asphalt is the near-miss and is excluded because its
  // blue is the HIGHEST channel, not the lowest.
  const earthy = b < r && b < g && Math.max(r, g) - b < 0.28;
  return earthy && b > 0.25 && Math.max(r, g) < 0.75 ? ',' : '?';
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
        const guess = classify(v);
        if (guess === '?') unknown.add(v);
        line += guess;
      }
    }
    lines.push('    ' + line);
  }
  return { text: lines.join('\n'), unknown: [...unknown], metres: (halfSpan * 2) / n };
};

/**
 * Can somebody on foot get round the junction?
 *
 * "The sidewalks don't connect" was a player report, and until now the only
 * way to answer it was to look at a picture of a corner — which has been wrong
 * about corners repeatedly. This walks the footway instead: sample the
 * junction and a tile of each approach, take every footway cell, flood-fill
 * them into connected patches, and ask whether the footway arriving on one
 * edge of that square is the same patch as the footway arriving on the next.
 *
 * A break between them is a person stepping into the carriageway to carry on
 * walking, which is the defect the report was describing.
 */
const footwayConnects = async (jx, jz, T) => {
  const span = T * 1.5; // the junction tile plus a tile of each approach
  const n = 120; // 0.5 m cells at a 20 m tile
  const grid = await call(([a, c, d, e, f]) => window.__slimcity.readSurface(a, c, d, e, f), [
    jx * T + T / 2 - span,
    jz * T + T / 2 - span,
    jx * T + T / 2 + span,
    jz * T + T / 2 + span,
    n,
  ]);
  const FOOTWAY = '0.82,0.81,0.79';
  const isWalk = (r, c) => r >= 0 && r < n && c >= 0 && c < n && grid[r * n + c] === FOOTWAY;
  // Label every footway cell with the patch it belongs to.
  const patch = new Int32Array(n * n).fill(-1);
  let patches = 0;
  for (let r0 = 0; r0 < n; r0++) {
    for (let c0 = 0; c0 < n; c0++) {
      if (!isWalk(r0, c0) || patch[r0 * n + c0] !== -1) continue;
      const id = patches++;
      const stack = [[r0, c0]];
      patch[r0 * n + c0] = id;
      while (stack.length > 0) {
        const [r, c] = stack.pop();
        for (const [dr, dc] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ]) {
          const nr = r + dr;
          const nc = c + dc;
          if (!isWalk(nr, nc) || patch[nr * n + nc] !== -1) continue;
          patch[nr * n + nc] = id;
          stack.push([nr, nc]);
        }
      }
    }
  }
  // The patches the footway arriving on each side of the square belongs to.
  // `half` narrows it to one side of the road's centreline, which is what
  // separates "you can walk round the corner" from "you can walk straight on
  // down THIS pavement".
  const onEdge = (side, half) => {
    const ids = new Set();
    for (let i = 0; i < n; i++) {
      if (half === 'low' && i >= n / 2) continue;
      if (half === 'high' && i < n / 2) continue;
      const [r, c] =
        side === 'n' ? [0, i] : side === 's' ? [n - 1, i] : side === 'w' ? [i, 0] : [i, n - 1];
      const id = patch[r * n + c];
      if (id !== -1) ids.add(id);
    }
    return ids;
  };
  const edges = { n: onEdge('n'), s: onEdge('s'), e: onEdge('e'), w: onEdge('w') };
  const shares = (a, b) => [...edges[a]].some((id) => edges[b].has(id));
  /**
   * Whether the pavement on ONE side of a road runs past whatever joins it
   * there. `arm` is the side the thing joining is on; the pavement tested is
   * the one it would interrupt.
   */
  const runsPast = (arm) => {
    const [from, to, half] =
      arm === 'n' || arm === 's'
        ? ['w', 'e', arm === 'n' ? 'low' : 'high']
        : ['n', 's', arm === 'w' ? 'low' : 'high'];
    const a = onEdge(from, half);
    const b = onEdge(to, half);
    if (a.size === 0 || b.size === 0) return null;
    return [...a].some((id) => b.has(id));
  };
  return { edges, shares, runsPast, patches };
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
  const approachLine = async (label, ax, az) => {
    const a = await call(([p, q]) => window.__slimcity.readApproach(p, q), [ax, az]);
    const d = await drawn(ax, az);
    console.log(
      `  ${label} approach:`,
      a === null
        ? 'null'
        : `lanes ${a.lanes} width ${a.width.toFixed(2)} pocket ${a.pocket} ` +
          `open ${a.openness.toFixed(2)} ` +
          `taper ${a.taper ? `${a.taper.closed}/${a.taper.length}` : 'null'} dist ${a.distance}` +
          (d ? ` | mesh width ${d.width.toFixed(2)}` : ''),
    );
  };
  for (const d of [1, 2, 3]) await approachLine(`W-${d}`, jx - d, jz);
  // The MINOR arm too: its own flare into the junction throat is measured here
  // rather than read off a picture of it.
  for (const d of [1, 2, 3]) await approachLine(`N-${d}`, jx, jz - d);
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

  // Whether a person can walk round each corner of the junction without
  // stepping into the road.
  const walk = await footwayConnects(jx, jz, T);
  const corners = [
    ['NW', 'n', 'w'],
    ['NE', 'n', 'e'],
    ['SE', 's', 'e'],
    ['SW', 's', 'w'],
  ];
  // Only a corner with footway arriving on BOTH its sides is a corner this can
  // say anything about; the count is printed so a vacuous pass cannot read as
  // a real one.
  const checkable = corners.filter(
    ([, a, b]) => walk.edges[a].size > 0 && walk.edges[b].size > 0,
  );
  const broken = checkable.filter(([, a, b]) => !walk.shares(a, b)).map(([name]) => name);
  // And the question an alley raises, which is the opposite one: the pavement
  // on the side a SERVICE access joins must run straight past it. Severed by an
  // ordinary road is correct — that is what a crossing is for — so this asks
  // only about the arms that are accesses.
  const serviceArms =
    s.minor === TIER.alley
      ? s.shape === 'cross'
        ? ['n', 's']
        : s.shape === 'corner'
          ? ['w']
          : ['n']
      : [];
  const past = serviceArms.map((arm) => [arm, walk.runsPast(arm)]);
  const cut = past.filter(([, ok]) => ok === false).map(([arm]) => arm.toUpperCase());
  const tested = past.filter(([, ok]) => ok !== null).length;
  console.log(
    `  footway    : ${walk.patches} patch(es), arriving on ` +
      (['n', 'e', 's', 'w'].filter((k) => walk.edges[k].size > 0).join('') || '-') +
      `; ${checkable.length} corner(s)` +
      (checkable.length === 0
        ? ''
        : broken.length > 0
          ? ` BROKEN AT ${broken.join(', ')}`
          : ' all join') +
      `; ${tested} access mouth(s)` +
      (tested === 0 ? '' : cut.length > 0 ? ` CUT AT ${cut.join(', ')}` : ' walked past'),
  );

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
