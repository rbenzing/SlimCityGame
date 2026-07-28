/** Render-polish visual smoke (UI-SPEC §15): grows a small town, lays a
 * dead-end road spur, creates a bus line with a few stops, then captures —
 * in DAYTIME (pumped so the sun is high-but-angled and shadows read) —
 *   01  a bus-stop shelter with idling + walking pedestrians
 *   02  a modeled cantilever street lamp casting a shadow
 *   03  a dead-end road with its rounded sidewalk + dirt->grass ring
 * Uses only the DEV __slimcity hook (no screen picking). ?nobloom keeps the
 * headless swiftshader readback stable (see main.ts). */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const url = (process.argv[2] ?? 'http://localhost:5173') + '/?nobloom';
const out = process.argv[3] ?? 'tools/shots-polish';
const GROW_BUDGET_MS = Number(process.argv[4] ?? 90000);
mkdirSync(out, { recursive: true });

const RT = { TwoLane: 1 };
const ZONE = { ResLow: 1, ComLow: 3 };
const VISUAL_DAY_TICKS = 2400;
const CLOCK_OFFSET = Math.round((VISUAL_DAY_TICKS * 9) / 24);
const dayTOf = (tick) => ((tick + CLOCK_OFFSET) % VISUAL_DAY_TICKS) / VISUAL_DAY_TICKS;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#viewport canvas', { timeout: 20000 });
await page.waitForTimeout(4000);

const ready = () => page.waitForFunction(() => !!window.__slimcity && !!window.__slimcity.cmd, null, { timeout: 20000 });
const call = async (fn, ...a) => { await ready(); return page.evaluate(fn, ...a); };
const cmd = (label, commands) => call(([l, c]) => window.__slimcity.cmd(l, c), [label, commands]);
const readGrid = () => call(() => window.__slimcity.readGrid());
const stats = () => call(() => window.__slimcity.getStats());
const setSpeed = (s) => call((x) => window.__slimcity.setSpeed(x), s);
const setOverlay = (o) => call((x) => window.__slimcity.setOverlay(x), o);
const cam = (tx, tz, d) => call(([x, z, dd]) => window.__slimcity.setCamera((x + 0.5) * 16, (z + 0.5) * 16, dd), [tx, tz, d]);

// Pause the sim immediately so the day/night clock stays frozen near boot
// (tick ~0 == 09:00, dayT ~0.375: bright mid-morning, long readable shadows,
// lamps essentially off). Roads/buildings/transit all render build-while-
// paused, so no clock pump is needed — which also keeps the run short enough
// that the dev __slimcity hook never gets dropped by an HMR reload.
await setSpeed(0);

const g = await readGrid();
const N = g.size;
const idx = (x, z) => z * N + x;
const flat = (x, z, r = 1) => {
  const h0 = g.height[idx(x, z)];
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const xx = x + dx, zz = z + dz;
    if (xx < 0 || zz < 0 || xx >= N || zz >= N) return false;
    if (g.water[idx(xx, zz)]) return false;
    if (Math.abs(g.height[idx(xx, zz)] - h0) > 3) return false;
  }
  return true;
};

let A = null;
for (let z = 24; z < N - 30 && !A; z += 2)
  for (let x = 20; x < N - 40 && !A; x += 2) {
    let ok = true;
    for (let dz = -6; dz < 20 && ok; dz += 2) for (let dx = 0; dx < 34 && ok; dx += 2)
      if (!flat(x + dx, z + dz)) ok = false;
    if (ok) A = { x, z };
  }
if (!A) { console.log('no flat build area'); await browser.close(); process.exit(1); }
console.log('anchor:', JSON.stringify(A));

const X0 = A.x + 2, X1 = A.x + 30;
const MZ = A.z + 4;              // main arterial row
const JZ = A.z + 14;            // second (jobs) row
const row = (z) => Array.from({ length: X1 - X0 + 1 }, (_, i) => ({ x: X0 + i, z }));
await cmd('Road', [{ kind: 'buildRoad', tier: RT.TwoLane, tiles: row(MZ) }]);
await cmd('Road', [{ kind: 'buildRoad', tier: RT.TwoLane, tiles: row(JZ) }]);

// Dead-end spur: perpendicular stub off the main road ending in open land, so
// its far tile has exactly one connection -> rounded end cap + dirt ring.
const SX = X0 + 6;
const spur = [];
for (let z = MZ; z >= MZ - 5; z--) spur.push({ x: SX, z });
await cmd('Spur', [{ kind: 'buildRoad', tier: RT.TwoLane, tiles: spur }]);
await page.waitForTimeout(800);

// Utilities adjacent to the arterial (same relative placement as the proven
// deterministic-town harness), then residential + commercial zoning bands.
await cmd('Wind Turbine', [{ kind: 'placeBuilding', catalogId: 'wind-turbine', x: X1 - 2, z: MZ - 2, rotation: 0 }]);
await cmd('Water Tower', [{ kind: 'placeBuilding', catalogId: 'water-tower', x: X1 - 6, z: MZ - 3, rotation: 0 }]);
await page.waitForTimeout(800);

const band = (z, depth) => {
  const t = [];
  for (let x = X0; x <= X1; x++) for (let d = 1; d <= depth; d++) { t.push({ x, z: z - d }); t.push({ x, z: z + d }); }
  return t;
};
await cmd('Zone', [{ kind: 'paintZone', zone: ZONE.ResLow, tiles: band(MZ, 3).filter((p) => p.x !== SX) }]);
await cmd('Zone', [{ kind: 'paintZone', zone: ZONE.ComLow, tiles: band(JZ, 2) }]);
await page.waitForTimeout(600);

// Bus line: three stops along the arterial (shelters + idlers appear at once).
const stops = [{ x: X0 + 3, z: MZ }, { x: X0 + 14, z: MZ }, { x: X0 + 25, z: MZ }];
await cmd('Bus Line', [{ kind: 'createTransitLine', line: { id: 0, stops, color: 0xf2b134 } }]);
await page.waitForTimeout(800);

// The transit snapshot channel (shelters + the stop list PedestrianRenderer
// needs) only ships on a real sim tick, not on command-processing like roads
// do — so briefly un-pause to let one transit snapshot flow through, then
// re-freeze the clock. A couple of seconds keeps it firmly in the morning.
await setSpeed(1);
await page.waitForTimeout(2500);
await setSpeed(0);
await page.waitForTimeout(300);
const s0 = await stats();
console.log('after setup:', JSON.stringify(s0));

// NO long grow (HMR drops the dev hook on long runs — memory gotcha): shelters
// + idling pedestrians appear the instant the line exists, and lamps/dead-end
// rings need only roads. Just make sure we're in daytime; nudge a little only
// if the frozen clock happens to be after dark.
const dt = dayTOf(s0.tick);
console.log(`paused tick=${s0.tick} dayT=${dt.toFixed(3)}`);

// Camera looks toward -z at pitch 0.7 (yaw 0); a subject sits ~centre when the
// target is placed AT it (offset 0), a bit lower in frame as offset goes -z.
// 01 bus-stop shelter + idling pedestrians (close). The modeled shelter lives
// in TransitRenderer, which main.ts only shows under the transit lens/tool
// (PedestrianRenderer is always visible) — so switch the transit overlay on to
// capture shelter + crowd together. Shelter offsets laterally to a hashed side
// and idlers scatter a couple metres off the stop tile, so shoot all three.
await setOverlay('transit');
await page.waitForTimeout(400);
for (let i = 0; i < stops.length; i++) {
  await cam(stops[i].x, stops[i].z, 18);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/01-shelter-pedestrians${i === 1 ? '' : '-' + i}.png` });
}
await setOverlay(null);
await page.waitForTimeout(300);

// 02 a modeled street lamp casting a shadow onto the grass verge.
await cam(X0 + 19, MZ, 30);
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/02-lamp-shadow.png` });

// 03 dead-end road: rounded sidewalk cap (dirt ring is vertex-color at 16m/
// vertex terrain res — see report) at the dangling tip.
await cam(SX, MZ - 4, 34);
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/03-dead-end-ring.png` });

// 03b water tower — a tall prop whose shadow confirms the shadow sweep.
await cam(X1 - 5, MZ - 2, 52);
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/03b-tower-shadow.png` });

// A wider context shot for sanity.
await cam((X0 + X1) / 2, MZ + 6, 200);
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/04-town-context.png` });

console.log('final:', JSON.stringify(await stats()));
await browser.close();
