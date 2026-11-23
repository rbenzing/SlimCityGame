/** Corner map: what a junction's corner is made of, as text, and whether a person can walk it.
 *
 * Lays mixed-class junctions (a street crossing and tee-ing an avenue, a four-lane road, an
 * alley tee-ing and ending at a street, a ramp meeting a motorway, one-way, bus, bike, tram and
 * rail against a street) and, for each, prints the junction's control and a map of the
 * north-west corner sampled off the mesh with `readSurface`: `#` footway, `.` asphalt, `W` and
 * `Y` paint, blank where the terrain shows. A kerb return reaches no tile edge, so no band
 * read-back sees it.
 *
 * Two questions fail the probe: the footway arriving on one side of a corner must be one patch
 * with the footway arriving on the next (no stepping into the road to go round), and the
 * pavement on the side an alley joins must be one patch from edge to edge (the footway runs past
 * an access). The counts are printed so a pass over zero corners shows.
 *
 * Usage: node tools/probes/corner-map.mjs [url]
 * Exits 1 when a corner is broken or an access mouth is cut.
 */
import { pathToFileURL } from 'node:url';
import { tileCamera } from '../shots/lib/camera.mjs';
import { TIER } from '../shots/lib/roads.mjs';
import { openSession, settle } from '../shots/lib/session.mjs';
import { cornerText, footwayPatches, judgeFootway } from './lib/checks.mjs';

/** One scenario's plot: a square of dry ground, as tiles. */
const SPAN = 30;
const STRIDE = SPAN + 6;
/** Map left clear round the edge. */
const MARGIN = 20;
/** The junction's offset inside its plot. */
const CX = 14;
const CZ = 14;
const MAP_CELLS = 64;
const MAP_HALF_SPAN_M = 8;
/** The footway question samples the junction tile and a tile of each approach at 0.5 m cells. */
const WALK_CELLS = 120;
const READ_TIMEOUT_MS = 15000;

/**
 * The major road runs east-west through the plot and the minor north-south. `shape`: `cross` takes
 * the minor through, `tee` stops it at the box, `corner` runs the major north-south into the box
 * and stops, `ramp` lays a ramp up beside the motorway and east along it to merge.
 */
const SCENARIOS = [
  { name: 'twolane-x-avenue', major: TIER.avenue, minor: TIER.twoLane, shape: 'cross' },
  { name: 'twolane-t-avenue', major: TIER.avenue, minor: TIER.twoLane, shape: 'tee' },
  { name: 'twolane-x-fourlane', major: TIER.fourLane, minor: TIER.twoLane, shape: 'cross' },
  { name: 'alley-t-avenue', major: TIER.avenue, minor: TIER.alley, shape: 'tee' },
  { name: 'ramp-t-highway', major: TIER.highway, minor: TIER.ramp, shape: 'ramp' },
  { name: 'twolane-x-twolane', major: TIER.twoLane, minor: TIER.twoLane, shape: 'cross' },
  { name: 'alley-t-twolane', major: TIER.twoLane, minor: TIER.alley, shape: 'tee' },
  { name: 'twolane-t-twolane', major: TIER.twoLane, minor: TIER.twoLane, shape: 'tee' },
  { name: 'alley-corner-twolane', major: TIER.twoLane, minor: TIER.alley, shape: 'corner' },
  { name: 'twolane-corner-twolane', major: TIER.twoLane, minor: TIER.twoLane, shape: 'corner' },
  { name: 'gravel-t-twolane', major: TIER.twoLane, minor: TIER.gravel, shape: 'tee' },
  { name: 'gravel-corner-twolane', major: TIER.twoLane, minor: TIER.gravel, shape: 'corner' },
  { name: 'oneway-x-twolane', major: TIER.twoLane, minor: TIER.oneWay, shape: 'cross' },
  { name: 'bus-x-twolane', major: TIER.twoLane, minor: TIER.bus, shape: 'cross' },
  { name: 'bike-x-twolane', major: TIER.twoLane, minor: TIER.bike, shape: 'cross' },
  { name: 'twolane-x-bike', major: TIER.bike, minor: TIER.twoLane, shape: 'cross' },
  { name: 'tram-x-twolane', major: TIER.twoLane, minor: TIER.tram, shape: 'cross' },
  { name: 'rail-breaks-twolane', major: TIER.twoLane, minor: TIER.rail, shape: 'cross' },
];

/** The sides of the junction an alley (a service access, not a leg of the network) joins on. */
const serviceArms = (s) =>
  s.minor !== TIER.alley
    ? []
    : s.shape === 'cross'
      ? ['n', 's']
      : s.shape === 'corner'
        ? ['w']
        : ['n'];

/** Dry plots, flattest first, so a scenario added above always gets ground. */
function flatPlots(grid) {
  const N = grid.size;
  const found = [];
  for (let z = MARGIN; z < N - SPAN - MARGIN; z += STRIDE) {
    for (let x = MARGIN; x < N - SPAN - MARGIN; x += STRIDE) {
      let lo = Infinity;
      let hi = -Infinity;
      let dry = true;
      for (let dz = 0; dz < SPAN && dry; dz += 2)
        for (let dx = 0; dx < SPAN && dry; dx += 2) {
          const i = (z + dz) * N + x + dx;
          if (grid.water[i]) dry = false;
          lo = Math.min(lo, grid.height[i]);
          hi = Math.max(hi, grid.height[i]);
        }
      if (dry) found.push({ x, z, spread: hi - lo });
    }
  }
  return found.sort((a, c) => a.spread - c.spread);
}

/** The tiles each scenario lays, in plot coordinates offset to the plot (X, Z). */
function tilesOf(s, X, Z) {
  const row = (dz, a, c) =>
    Array.from({ length: c - a + 1 }, (_, k) => ({ x: X + a + k, z: Z + dz }));
  const col = (dx, a, c) =>
    Array.from({ length: c - a + 1 }, (_, k) => ({ x: X + dx, z: Z + a + k }));
  const major = s.shape === 'corner' ? col(CX, 2, CZ) : row(CZ, 2, 26);
  const minor =
    s.shape === 'cross'
      ? col(CX, 2, 26)
      : s.shape === 'corner'
        ? row(CZ, 2, CX)
        : s.shape === 'ramp'
          ? [...col(CX - 4, CZ + 1, CZ + 8).reverse(), ...row(CZ + 1, CX - 3, CX)]
          : col(CX, 2, CZ);
  return { major, minor };
}

/** Samples a square of the mesh round the junction once the renderer holds it. */
async function sample(page, [x0, z0, x1, z1], n) {
  const read = () =>
    page.evaluate(
      ([a, b, c, d, k]) => window.__slimcity.readSurface(a, b, c, d, k),
      [x0, z0, x1, z1, n],
    );
  const deadline = performance.now() + READ_TIMEOUT_MS;
  for (;;) {
    await settle(page);
    const grid = await read();
    if (grid.some((c) => c !== null) || performance.now() > deadline) return grid;
  }
}

/** Runs the probe against `url`; returns the failures. */
export async function runCornerMap(url) {
  const started = performance.now();
  const session = await openSession(url);
  const { page, send } = session;
  const cam = tileCamera(page);
  const failures = [];
  const totals = { corners: 0, broken: 0, mouths: 0, cut: 0 };
  try {
    const grid = await page.evaluate(() => {
      const g = window.__slimcity.readGrid();
      return { size: g.size, water: Array.from(g.water), height: Array.from(g.height) };
    });
    const plots = flatPlots(grid);
    if (plots.length < SCENARIOS.length)
      failures.push(`only ${plots.length} dry plots for ${SCENARIOS.length} scenarios`);
    const T = await page.evaluate(() => window.__slimcity.tileMeters());
    for (let i = 0; i < SCENARIOS.length && i < plots.length; i++) {
      const s = SCENARIOS[i];
      const { x: X, z: Z } = plots[i];
      const jx = X + CX;
      const jz = Z + CZ;
      const { major, minor } = tilesOf(s, X, Z);
      await send('major', [{ kind: 'buildRoad', tier: s.major, tiles: major }]);
      await send('minor', [{ kind: 'buildRoad', tier: s.minor, tiles: minor }]);
      await cam(jx, jz, 64, 0, 1.5);
      const junctions = await page.evaluate(
        ([x, z]) =>
          window.__slimcity
            .readJunctions()
            .filter((j) => Math.abs(j.x - x) <= 1 && Math.abs(j.z - z) <= 1),
        [jx, jz],
      );
      console.log(`\n=== ${s.name} ===  plot ${X},${Z}`);
      // The control decides which arms are painted: an arm giving way carries the crossing and
      // the stop bar, an arm running through neither, so a missing crossing is read against it.
      console.log('  junction   :', JSON.stringify(junctions));

      const reach = T * 1.5;
      const cx = jx * T + T / 2;
      const cz = jz * T + T / 2;
      const walkGrid = await sample(
        page,
        [cx - reach, cz - reach, cx + reach, cz + reach],
        WALK_CELLS,
      );
      const walk = footwayPatches(walkGrid, WALK_CELLS);
      const verdict = judgeFootway(walk, serviceArms(s));
      totals.corners += verdict.corners;
      totals.broken += verdict.broken.length;
      totals.mouths += verdict.mouths;
      totals.cut += verdict.cut.length;
      console.log(
        `  footway    : ${walk.patches} patch(es), arriving on ${verdict.arriving || '-'}; ` +
          `${verdict.corners} corner(s)` +
          (verdict.corners === 0
            ? ''
            : verdict.broken.length > 0
              ? ` BROKEN AT ${verdict.broken.join(', ')}`
              : ' all join') +
          `; ${verdict.mouths} access mouth(s)` +
          (verdict.mouths === 0
            ? ''
            : verdict.cut.length > 0
              ? ` CUT AT ${verdict.cut.join(', ')}`
              : ' walked past'),
      );
      if (verdict.broken.length > 0)
        failures.push(`${s.name}: footway does not join round corner ${verdict.broken.join(', ')}`);
      if (verdict.cut.length > 0)
        failures.push(`${s.name}: pavement is cut at the alley mouth on ${verdict.cut.join(', ')}`);

      const mapGrid = await sample(
        page,
        [
          jx * T - MAP_HALF_SPAN_M,
          jz * T - MAP_HALF_SPAN_M,
          jx * T + MAP_HALF_SPAN_M,
          jz * T + MAP_HALF_SPAN_M,
        ],
        MAP_CELLS,
      );
      const map = cornerText(mapGrid, MAP_CELLS);
      console.log(
        `  corner map (${((MAP_HALF_SPAN_M * 2) / MAP_CELLS).toFixed(2)} m/cell, NW corner at the middle):`,
      );
      console.log(map.text);
      if (map.unknown.length > 0) console.log('  unnamed colours:', map.unknown.join(' '));
    }
    if (totals.corners === 0 || totals.mouths === 0)
      failures.push(
        `vacuous: ${totals.corners} corners and ${totals.mouths} access mouths were asked about`,
      );
    for (const e of session.errors) failures.push(`page error: ${e}`);
  } finally {
    await session.close();
  }
  const seconds = ((performance.now() - started) / 1000).toFixed(0);
  console.log(
    `\n${totals.corners} corner(s) asked, ${totals.broken} broken; ${totals.mouths} access mouth(s) asked, ${totals.cut} cut; ${seconds} s`,
  );
  if (failures.length > 0) {
    console.log(`FAIL (${failures.length})`);
    for (const f of failures) console.log(' -', f);
  } else console.log('every corner joins and every access is walked past');
  return failures;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const failures = await runCornerMap(process.argv[2] ?? 'http://localhost:5173');
  process.exitCode = failures.length > 0 ? 1 : 0;
}
