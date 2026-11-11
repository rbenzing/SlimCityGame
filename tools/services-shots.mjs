/** Services panel check: the funding slider and the load gauge on one row, and
 * the reading a selected facility gives for itself.
 *
 * The panel is the first place a player can reach service funding at all, and
 * the thing most likely to be wrong about it is not a number but a layout —
 * five rows each carrying a name, a slider, a multiplier, a load and a worst
 * figure, at the panel's own width. A read-back cannot see a column wrap or a
 * slider squeezed too narrow to grab, so this shoots it.
 *
 * It grows a real city first: every load on screen has to come from residents
 * the sim actually counted, or the panel is reading its own defaults back.
 *
 * It also times the page while the city grows at speed 4 and exits non-zero if
 * one read-back takes longer than STALL_LIMIT_MS: that limit guards the page
 * answering, not freezing, while snapshots arrive 53 times a second.
 *
 * Usage: node tools/services-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { cleanShot, tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-services';
mkdirSync(out, { recursive: true });

/** The longest the page may take to answer one read-back while the city grows at speed 4, in milliseconds. A page that stops answering while it grows fails the run. */
const STALL_LIMIT_MS = 4000;

/** A read-back that has not come back in this long means the page is hung, not slow. */
const HUNG_MS = 90000;
const HUNG = Symbol('hung');

const TWO_LANE = 1;
// Every residential density, painted at once. Sandbox unlocks what can be
// PLOPPED, not what a zone may grow into: growth reads milestoneLevel, which
// comes from population alone (400, 1200, 3500, 8000...). So a high-density
// block sits empty until the city earns it, and the way to a big city is to
// paint the whole ladder and let each rung unlock the next.
const ZONES = {
  resLow: 1, // milestone 0
  resRow: 6, // milestone 1 — 400
  resMedium: 7, // milestone 2 — 1,200
  mixed: 8, // milestone 3 — 3,500
  resHigh: 2, // milestone 4 — 8,000
};
const FIELD_HEALTH = 7;
/** Enough people that one school (capacity 5,000) is genuinely oversubscribed. */
const TARGET_POP = 5500;

const b = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
// Only the first three are printed, with their stack: a page that has run out
// of memory repeats one error thousands of times.
let pageErrors = 0;
page.on('pageerror', (e) => {
  pageErrors++;
  if (pageErrors <= 3) console.log('[pageerror]', e.stack ?? e.message);
});
await page.addInitScript(() => {
  try {
    sessionStorage.setItem(
      'slimcity.session',
      JSON.stringify({ screen: 'playing', seed: 12345, mode: 'new' }),
    );
    localStorage.setItem('slimcity.settings', JSON.stringify({ sandboxUnlockAll: true, unlimitedMoney: true }));
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
const stats = () => call(() => window.__slimcity.getStats());
const setSpeed = (s) => call((x) => window.__slimcity.setSpeed(x), s);
const cam = tileCamera(page);

const g = await readGrid();
const N = g.size;
const idx = (x, z) => z * N + x;
let A = null;
// The street grid is 61 tiles square and the utilities stand in the four columns
// east of it, so the dry ground has to cover 66 columns.
// Twelve more rows south of the grid hold the quay and a pond: past Big Town
// (3,500) sewage needs a drain on water, so the city gets a shore to stand it on.
const SITE_W = 66;
const GRID_D = 62;
const SITE_D = GRID_D + 12;
const PLATEAU = 2; // metres; the pond bed sits below the 0 m water line, inside MAX_BUILD_SLOPE of it
const POND_BED = -1.5;
for (let z = 8; z < N - SITE_D - 6 && !A; z++)
  for (let x = 8; x < N - SITE_W - 6 && !A; x++) {
    const h0 = g.height[idx(x, z)];
    let ok = true;
    for (let dz = 0; dz < SITE_D && ok; dz++)
      for (let dx = 0; dx < SITE_W && ok; dx++) {
        const i = idx(x + dx, z + dz);
        if (g.water[i] || Math.abs(g.height[i] - h0) > 11) ok = false;
      }
    if (ok) A = { x, z };
  }
if (!A) {
  console.log('no anchor');
  await b.close();
  process.exit(1);
}
const X = A.x;
const Z = A.z;
console.log('anchor', JSON.stringify(A));

// The anchor only promises dry ground within 11 m, and a building is refused on
// a tile steeper than MAX_BUILD_SLOPE (4 m), so the whole site is levelled to
// a plateau before anything is placed on it, the last rows dug into a pond.
await call(
  ([x, z, w, h, gridD, plateau, bed]) => {
    const heights = new Float32Array(w * h);
    for (let row = 0; row < h; row++)
      for (let col = 0; col < w; col++) heights[row * w + col] = row >= gridD + 5 ? bed : plateau;
    window.__slimcity.cmd('Level', [{ kind: 'terraformSet', x, z, w, h, heights }]);
  },
  [X, Z, SITE_W, SITE_D, GRID_D, PLATEAU, POND_BED],
);
await page.waitForTimeout(800);

await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
await page.waitForTimeout(300);

// A grid of streets, so density can actually arrive: dense blocks need frontage
// on every side, and a single ribbon of road grows a village however long it is.
const row = (z) =>
  cmd('R', [
    {
      kind: 'buildRoad',
      tier: TWO_LANE,
      tiles: Array.from({ length: 61 }, (_, i) => ({ x: X + i, z })),
    },
  ]);
const col = (x) =>
  cmd('R', [
    {
      kind: 'buildRoad',
      tier: TWO_LANE,
      tiles: Array.from({ length: 61 }, (_, i) => ({ x, z: Z + i })),
    },
  ]);
for (let i = 0; i <= 60; i += 6) await row(Z + i);
for (let i = 0; i <= 60; i += 6) await col(X + i);

const zoneBlock = (zone, x0, z0, w, d) =>
  cmd('Zone', [
    {
      kind: 'paintZone',
      zone,
      tiles: Array.from({ length: w * d }, (_, i) => ({
        x: x0 + (i % w),
        z: z0 + Math.floor(i / w),
      })),
    },
  ]);
// Residential alone plateaus: people arrive for jobs, so a city of nothing but
// housing stalls at its first milestone however much of it there is. A first
// run zoned 25 residential blocks and stopped dead at 1,016. The split below is
// the ordinary planning ratio — roughly three parts housing to one commerce and
// one industry — and the densities that unlock late go in the middle, so the
// outer ring can grow from milestone 0 and pull the rest up behind it.
const ladder = [ZONES.resLow, ZONES.resRow, ZONES.resMedium, ZONES.mixed, ZONES.resHigh];
const ZONE_COM = 3;
const ZONE_IND = 5;
let block = 0;
const counts = { res: 0, com: 0, ind: 0 };
for (let bz = 0; bz < 60; bz += 6)
  for (let bx = 0; bx < 60; bx += 6) {
    const ring = Math.min(bx, bz, 54 - bx, 54 - bz) / 6;
    let zone;
    if (ring >= 2 && block % 3 === 1) {
      zone = ZONE_COM;
      counts.com += 1;
    } else if (ring >= 2 && block % 3 === 2) {
      zone = ZONE_IND;
      counts.ind += 1;
    } else {
      zone = ladder[Math.min(ring, ladder.length - 1)];
      counts.res += 1;
    }
    await zoneBlock(zone, X + bx + 1, Z + bz + 1, 5, 5);
    block += 1;
  }
console.log(`zoned ${block} blocks — ${counts.res} res, ${counts.com} com, ${counts.ind} ind`);

// Utilities butted against a street: set back even one tile and nothing is
// powered, nothing grows, and the panel reads zero off an empty city.
// The last road column is at X+30, so a footprint starting at X+31 touches it.
// At X+32 it does not, and a plant one tile clear of the network powers nothing
// — which shows up only as a city that never grows.
const UTILITIES = [
  ...Array.from({ length: 7 }, (_, i) => ({
    kind: 'placeBuilding',
    catalogId: 'coal-plant',
    x: X + 61,
    z: Z + 1 + i * 6,
    rotation: 0,
  })),
  // A tower is 2x2 and supplies 378 units; four stalled the city at 3,447 people
  // with water fully drawn and the next milestone (3,500) out of reach, so the
  // column from the last plant to the edge of the site is filled with them.
  ...Array.from({ length: 10 }, (_, i) => ({
    kind: 'placeBuilding',
    catalogId: 'water-tower',
    x: X + 61,
    z: Z + 41 + i * 2,
    rotation: 0,
  })),
];
// One of each capped service, plus the park that deliberately has no capacity.
const SERVICES = [
  { kind: 'placeBuilding', catalogId: 'school', x: X + 31, z: Z + 31, rotation: 0 },
  { kind: 'placeBuilding', catalogId: 'clinic', x: X + 25, z: Z + 31, rotation: 0 },
  { kind: 'placeBuilding', catalogId: 'police-station', x: X + 31, z: Z + 25, rotation: 0 },
  { kind: 'placeBuilding', catalogId: 'fire-station', x: X + 37, z: Z + 31, rotation: 0 },
  { kind: 'placeBuilding', catalogId: 'small-park', x: X + 25, z: Z + 25, rotation: 0 },
];
// The water loop on the quay, south of the grid: a street stub down to the shore
// (rows Z+61..Z+66; the pond's first row is Z+67), the pump on its east side and
// the works and a drain on its west, each touching the stub and the water.
await cmd('Quay street', [
  {
    kind: 'buildRoad',
    tier: TWO_LANE,
    tiles: Array.from({ length: 6 }, (_, i) => ({ x: X + 30, z: Z + 61 + i })),
  },
]);
const SEWAGE = [
  { kind: 'placeBuilding', catalogId: 'water-pump', x: X + 31, z: Z + 65, rotation: 0 },
  { kind: 'placeBuilding', catalogId: 'water-drain', x: X + 29, z: Z + 66, rotation: 0 },
  { kind: 'placeBuilding', catalogId: 'sewage-works', x: X + 27, z: Z + 65, rotation: 0 },
];
const EXPECTED = UTILITIES.length + SERVICES.length + SEWAGE.length;
await cmd('Utilities', UTILITIES);
await cmd('Services', SERVICES);
await cmd('Sewage', SEWAGE);
// The works is joined to the stub by one length of pipe.
await cmd('Works pipe', [{ kind: 'layWaterPipe', tiles: [{ x: X + 29, z: Z + 65 }], on: true }]);

// Everything above is fire-and-forget: a refused placement acks quietly and the
// only symptom is a city that never grows. Count what actually stands before
// spending two minutes waiting on it.
// Commands are posted to the worker and land on a later snapshot, so the
// client mirror is still empty the instant after they are sent.
// Each one is looked up at its own origin tile: houses grown meanwhile also
// carry building ids, so a bare count of ids would pass with a plant missing.
const standing = () =>
  call(
    (origins) => {
      const g2 = window.__slimcity.readGrid();
      return origins.filter(([x, z]) => g2.buildingId[z * g2.size + x] !== 0).length;
    },
    [...UTILITIES, ...SERVICES, ...SEWAGE].map((p) => [p.x, p.z]),
  );
let placed = 0;
for (let i = 0; i < 30 && placed < EXPECTED; i++) {
  await page.waitForTimeout(500);
  placed = await standing();
}
console.log(`buildings standing after placement: ${placed} of ${EXPECTED}`);
if (placed < EXPECTED) {
  console.log(
    `EXPECTED ${EXPECTED} PLOPPABLES, GOT ${placed} — too many refused to trust this run`,
  );
  await b.close();
  process.exit(1);
}

// Grown at speed 4, where the worker posts a snapshot 53 times a second: a main
// thread whose snapshot work follows the size of the city stops answering, and
// the read-back below is how long it took to answer.
await setSpeed(4);
let s = await stats();
let lastMilestone = -1;
let longestMs = 0;
// A read-back that does not come back in HUNG_MS ends the run.
const answered = async (readBack) => {
  let hungTimer;
  const hung = new Promise((resolve) => {
    hungTimer = setTimeout(() => resolve(HUNG), HUNG_MS);
  });
  const answer = await Promise.race([readBack, hung]);
  clearTimeout(hungTimer);
  if (answer === HUNG) {
    console.log(`HUNG >${HUNG_MS / 1000}s at pop ${s.population}`);
    // A hung browser may not close either; give it ten seconds, then leave.
    await Promise.race([b.close().catch(() => {}), new Promise((r) => setTimeout(r, 10000))]);
    process.exit(1);
  }
  return answer;
};
const readCounts = () => call(() => window.__slimcity.snapshotCounts());
const GROWTH_CAP_MS = 15 * 60 * 1000;
// A city that gains under 1% in two minutes has stopped growing: waiting out
// the cap would time nothing more.
const PLATEAU_MS = 120 * 1000;
const growthStart = Date.now();
const grown = [];
for (let i = 0; i < 1200; i++) {
  await page.waitForTimeout(1000);
  const askedAt = Date.now();
  s = await answered(stats());
  const answeredMs = Date.now() - askedAt;
  longestMs = Math.max(longestMs, answeredMs);
  if (answeredMs > 2000)
    console.log(`STALL ${answeredMs} at pop ${s.population} tick ${s.tick}`);
  grown.push({ at: Date.now(), population: s.population });
  while (grown.length > 1 && Date.now() - grown[1].at > PLATEAU_MS) grown.shift();
  const since = grown[0];
  if (
    Date.now() - since.at > PLATEAU_MS &&
    s.population > 0 &&
    s.population < since.population * 1.01
  ) {
    console.log(`PLATEAU at pop ${s.population} tick ${s.tick}`);
    break;
  }
  if (s.milestoneLevel !== lastMilestone) {
    lastMilestone = s.milestoneLevel;
    console.log(`  milestone ${lastMilestone} at pop ${s.population} (${i}s)`);
  }
  if (i % 10 === 9) {
    const mem = await answered(
      call(() => ({
        heap: performance.memory ? performance.memory.usedJSHeapSize : 0,
        info: window.__slimcity.renderInfo?.() ?? {},
      })),
    );
    console.log(
      `MEM heap=${Math.round(mem.heap / 1048576)}MB geometries=${mem.info.geometries ?? '?'} ` +
        `textures=${mem.info.textures ?? '?'} pop=${s.population} tick=${s.tick}`,
    );
  }
  if (s.population >= TARGET_POP) break;
  if (Date.now() - growthStart > GROWTH_CAP_MS) {
    console.log(`CAPPED at pop ${s.population}`);
    break;
  }
}
console.log(`LONGEST ${longestMs}`);
const fieldCounts = await answered(readCounts());
console.log(
  'FIELDS ' +
    Object.entries(fieldCounts)
      .map(([k, v]) => `${k}=${v}`)
      .join(' '),
);
const fin = await stats();
console.log(`pop ${s.population} power ${Math.round(fin.powerDemand)}/${Math.round(fin.powerSupply)} water ${Math.round(fin.waterDemand)}/${Math.round(fin.waterSupply)}`);
if (s.population === 0) console.log('NOTHING GREW: do not read the shots below as a pass');
if (s.population < TARGET_POP)
  console.log(
    `UNDER TARGET (${s.population} < ${TARGET_POP}): no service will read over 100%, so the ` +
      `overloaded-row styling is NOT exercised by these shots`,
  );
await setSpeed(0);
await page.waitForTimeout(800);

// Everything stays at ×1.00. Cutting funding was the obvious way to force an
// overloaded row and it is the wrong one: funding scales reach and capacity
// together, so a starved service sheds people faster than capacity and reads
// LOWER. The only thing that overloads a facility is more people than it can
// serve, which is why this harness grows a city instead.
await page.waitForTimeout(2000);

const load = await call(() => window.__slimcity.getStats?.() ?? null);
console.log('funding after starve:', JSON.stringify(load?.serviceFunding));

// Does money actually relieve a service? The design says funding buys reach AND
// throughput, so a starved service should show queues. Funding scales the range
// too, and a wider catchment holds more people — so the two move together and
// the direction is an open question the panel can answer. Sweep it and read the
// gauge at each setting rather than reasoning about it.
const readLoad = () =>
  call(() =>
    Object.fromEntries(
      ['police', 'fire', 'health', 'education', 'park'].map((k) => {
        const el = document.querySelector(`[data-testid="service-load-${k}"]`);
        return [k, el ? el.textContent.trim() : '?'];
      }),
    ),
  );
await call((f) => window.__slimcity.setOverlay(f), FIELD_HEALTH);
// The sim has to be RUNNING for any of this to mean anything: coverage is
// recomputed on a service pass, so against a paused city every sample below
// reads back the same stale byte and the sweep looks perfectly flat.
await setSpeed(1);
await page.waitForTimeout(500);
for (const f of [0.1, 0.5, 1.0, 1.5]) {
  await cmd('Sweep', [{ kind: 'setServiceFunding', service: 'health', funding: f }]);
  await page.waitForTimeout(4000);
  const row = await readLoad();
  const pop = (await stats()).population;
  console.log(`health funding ×${f.toFixed(2)} -> load ${row.health}  (pop ${pop})`);
}
await cmd('Restore', [{ kind: 'setServiceFunding', service: 'health', funding: 0.1 }]);
await page.waitForTimeout(4000);
await setSpeed(0);
await page.waitForTimeout(600);

// The health lens opens the panel, which is one of its two documented gates.
await call((f) => window.__slimcity.setOverlay(f), FIELD_HEALTH);
await call(() => window.__slimcity.setDayT(0.45));
await cam(X + 15, Z + 15, 260, 0, 0.75);
await page.waitForTimeout(1200);
await cleanShot(page, `${out}/panel-open.png`);

// Just the panel, big enough to read every column at its real width.
// The panel has no test id of its own; its rows do, and the card is the nearest
// fixed-position ancestor of any of them.
const panel = await page.$(
  '[data-testid="service-load-police"] >> xpath=ancestor::div[contains(@class,"fixed")][1]',
);
if (panel) await panel.screenshot({ path: `${out}/panel-detail.png` });
else {
  console.log(
    'NO PANEL: the services panel (ancestor of service-load-police) not found — clipping the left slot instead',
  );
  await cleanShot(page, `${out}/panel-detail.png`);
}

console.log('done');
await b.close();
console.log(`PAGEERRORS ${pageErrors}`);
if (pageErrors > 0) process.exit(1);
if (longestMs > STALL_LIMIT_MS) {
  console.log(`FAIL: the page took ${longestMs} ms to answer once, over the ${STALL_LIMIT_MS} ms limit`);
  process.exit(1);
}
