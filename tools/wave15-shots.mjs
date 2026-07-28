/** Wave 15 visual verification (§15 transit/props polish).
 * Grows an M1 town, adds a dead-end spur + a transit line, settles the clock to
 * a readable-shadow daytime, and captures close-ups of:
 *  (a) bus-stop shelter + pedestrians
 *  (b) modeled lamp casting a shadow
 *  (c) dead-end rounded sidewalk + dirt->grass ring
 *  (d) small props (lamps/trees/vehicles) casting shadows
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-wave15';
const GROW_MS = Number(process.argv[4] ?? 360000);
mkdirSync(out, { recursive: true });

const RT = { TwoLane: 1 };
const ZONE = { ResLow: 1, ComLow: 3, Industrial: 5 };
const VISUAL_DAY_TICKS = 2400, OFFSET = 900;
const dayTof = (tick) => ((tick + OFFSET) % VISUAL_DAY_TICKS) / VISUAL_DAY_TICKS;
const clockOf = (tick) => {
  const h = dayTof(tick) * 24; const hh = Math.floor(h); const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

const browser = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#viewport canvas', { timeout: 20000 });
await page.waitForTimeout(4000);

const ready = () => page.waitForFunction(() => !!window.__slimcity && !!window.__slimcity.cmd, null, { timeout: 20000 });
const call = async (fn, ...a) => { await ready(); return page.evaluate(fn, ...a); };
const cmd = (l, c) => call(([x, y]) => window.__slimcity.cmd(x, y), [l, c]);
const readGrid = () => call(() => window.__slimcity.readGrid());
const stats = () => call(() => window.__slimcity.getStats());
const setSpeed = (s) => call((x) => window.__slimcity.setSpeed(x), s);
const setOverlay = (o) => call((x) => window.__slimcity.setOverlay(x), o);
const setTool = (t) => call((x) => window.__slimcity.setTool(x), t);
const cam = (tx, tz, d) => call(([x, z, dd]) => window.__slimcity.setCamera((x + 0.5) * 16, (z + 0.5) * 16, dd), [tx, tz, d]);
const countBuildings = async () => { const gg = await readGrid(); let n = 0; for (const b of gg.buildingId) if (b) n++; return n; };

const g = await readGrid();
const N = g.size; const idx = (x, z) => z * N + x;
const flat = (x, z, r = 1) => { const h0 = g.height[idx(x, z)]; for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, zz = z + dz; if (xx < 0 || zz < 0 || xx >= N || zz >= N) return false; if (g.water[idx(xx, zz)]) return false; if (Math.abs(g.height[idx(xx, zz)] - h0) > 3) return false; } return true; };
let A = null;
for (let z = 24; z < N - 34 && !A; z++) for (let x = 20; x < N - 40 && !A; x++) { let ok = true; for (let dz = -6; dz < 28 && ok; dz++) for (let dx = -4; dx < 36 && ok; dx++) if (!flat(x + dx, z + dz)) ok = false; if (ok) A = { x, z }; }
if (!A) { console.log('no area'); await browser.close(); process.exit(1); }
console.log('anchor', JSON.stringify(A));
const X0 = A.x + 2, X1 = A.x + 30;
const R1 = A.z + 3, R2 = A.z + 7, R3 = A.z + 11, R4 = A.z + 15;
const roads = [R1, R2, R3, R4];
const row = (z) => Array.from({ length: X1 - X0 + 1 }, (_, i) => ({ x: X0 + i, z }));
for (const rz of roads) await cmd('Road', [{ kind: 'buildRoad', tier: RT.TwoLane, tiles: row(rz) }]);
const colr = (x, z0, z1) => Array.from({ length: z1 - z0 + 1 }, (_, i) => ({ x, z: z0 + i }));
await cmd('Road', [{ kind: 'buildRoad', tier: RT.TwoLane, tiles: colr(X0, R1, R4) }]);
await cmd('Road', [{ kind: 'buildRoad', tier: RT.TwoLane, tiles: colr(X1, R1, R4) }]);
await page.waitForTimeout(600);

// DEAD-END SPUR: a short stub branching south off R4 that terminates in open
// ground -> its tip tile is a popcount-1 dead end (rounded cap + dirt ring).
const DEADX = X0 + 8;
await cmd('DeadEnd', [{ kind: 'buildRoad', tier: RT.TwoLane, tiles: colr(DEADX, R4, R4 + 5) }]);
await page.waitForTimeout(400);

// Utilities NORTH of R1, orthogonally adjacent to road R1 so road-carried
// power/water energizes the whole graph.
await cmd('Water1', [{ kind: 'placeBuilding', catalogId: 'water-tower', x: X0, z: R1 - 2, rotation: 0 }]);
await cmd('Water2', [{ kind: 'placeBuilding', catalogId: 'water-tower', x: X0 + 3, z: R1 - 2, rotation: 0 }]);
for (let i = 0; i < 14; i++) await cmd('Turbine', [{ kind: 'placeBuilding', catalogId: 'wind-turbine', x: X0 + 6 + i, z: R1 - 1, rotation: 0 }]);
await page.waitForTimeout(800);
console.log('utilities placed, buildings=' + (await countBuildings()));

const flankS = (z) => Array.from({ length: X1 - X0 + 1 }, (_, i) => ({ x: X0 + i, z: z + 1 }));
const flankN = (z) => Array.from({ length: X1 - X0 + 1 }, (_, i) => ({ x: X0 + i, z: z - 1 }));
await cmd('Z', [{ kind: 'paintZone', zone: ZONE.ResLow, tiles: [...flankS(R1), ...flankN(R2), ...flankS(R2)] }]);
await cmd('Z', [{ kind: 'paintZone', zone: ZONE.ComLow, tiles: [...flankN(R3), ...flankS(R3)] }]);
await cmd('Z', [{ kind: 'paintZone', zone: ZONE.Industrial, tiles: [...flankN(R4), ...flankS(R4)] }]);
await page.waitForTimeout(600);

// grow toward M1
await setSpeed(4); let s = await stats(); const t0 = Date.now();
while (Date.now() - t0 < GROW_MS) { await page.waitForTimeout(8000); s = await stats(); const nb = await countBuildings(); console.log(`t+${Math.round((Date.now() - t0) / 1000)}s pop=${s.population} jobs=${s.jobs} ms=${s.milestoneLevel} bld=${nb} tick=${s.tick} clk=${clockOf(s.tick)}`); if (s.milestoneLevel >= 1 && nb > 20) break; }
console.log('grown pop=' + s.population + ' ms=' + s.milestoneLevel + ' bld=' + (await countBuildings()));

// transit line along R1 (stops on the R1 road tiles)
const stopXs = [X0 + 1, X0 + 10, X0 + 19, X0 + 28];
if (s.milestoneLevel >= 1) for (const bx of stopXs) await cmd('BusStop', [{ kind: 'placeBuilding', catalogId: 'bus-stop', x: bx, z: R1 + 2, rotation: 0 }]);
await cmd('Transit', [{ kind: 'createTransitLine', line: { id: 0, stops: stopXs.map((bx) => ({ x: bx, z: R1 })), color: 0x33bbff } }]);
await setSpeed(4); await page.waitForTimeout(6000);
console.log('after transit pop=' + (await stats()).population);

// SETTLE THE CLOCK to a readable-shadow afternoon window (dayT 0.60..0.70 ~
// 13:24-16:48): sun descending and angled so props throw clear long shadows,
// still unambiguously daytime, "near midday". Accepts the morning window too
// if we happen to already be in it. Speed 1 = 10 ticks/s (2.5 ticks/300ms poll),
// so a 240-tick-wide window cannot be skipped.
async function settleDay() {
  await setSpeed(1);
  for (let i = 0; i < 500; i++) {
    const t = (await stats()).tick; const d = dayTof(t);
    if ((d >= 0.60 && d <= 0.70) || (d >= 0.34 && d <= 0.44)) { await setSpeed(0); return { t, d }; }
    if (i % 20 === 0) console.log(`  settle i=${i} tick=${t} dayT=${d.toFixed(3)} clk=${clockOf(t)}`);
    await page.waitForTimeout(300);
  }
  await setSpeed(0); const t = (await stats()).tick; return { t, d: dayTof(t) };
}
const sd = await settleDay();
console.log(`PAUSED at tick=${sd.t} dayT=${sd.d.toFixed(3)} clock=${clockOf(sd.t)}`);
await page.waitForTimeout(800);

// (a) bus-stop shelter + pedestrians — tight on a stop
await setOverlay('transit'); await page.waitForTimeout(400);
await cam(X0 + 10, R1 + 1, 70); await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/a-shelter-peds.png` }); console.log('shot a');
await cam(X0 + 19, R1 + 1, 60); await page.waitForTimeout(1000);
await page.screenshot({ path: `${out}/a2-shelter-peds.png` });
await setOverlay(null); await page.waitForTimeout(300);

// (b) modeled lamp casting a shadow — low oblique on a road edge
await cam(X0 + 6, R2, 55); await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/b-lamp-shadow.png` }); console.log('shot b');
await cam(X0 + 16, R3, 60); await page.waitForTimeout(1000);
await page.screenshot({ path: `${out}/b2-lamp-shadow.png` });

// (c) dead-end rounded sidewalk + dirt->grass ring
await cam(DEADX, R4 + 5, 55); await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/c-deadend-ring.png` }); console.log('shot c');
await cam(DEADX, R4 + 5, 80); await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/c2-deadend-ring.png` });

// (d) small props casting shadows — mid-distance over the town
await cam((X0 + X1) / 2, R3, 130); await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/d-props-shadows.png` }); console.log('shot d');
await cam((X0 + X1) / 2, R2, 100); await page.waitForTimeout(1000);
await page.screenshot({ path: `${out}/d2-props-shadows.png` });

// wide context
await cam((X0 + X1) / 2, (R1 + R4) / 2, 220); await page.waitForTimeout(1000);
await page.screenshot({ path: `${out}/e-context.png` });

console.log('final pop=' + (await stats()).population + ' ms=' + (await stats()).milestoneLevel + ' bld=' + (await countBuildings()) + ' clk=' + clockOf((await stats()).tick));
await browser.close();
