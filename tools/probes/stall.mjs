/** Page stall: how long the page takes to answer while a grown town runs at 4x.
 *
 * Lays a street grid with a hundred zoned blocks, utilities, one of each capped service and a
 * water loop on a levelled site, runs the sim at speed 4 (the worker posts a snapshot 20 times a
 * second) and asks the page for `getStats()` once a second. A main thread whose snapshot work
 * grows with the size of the city stops answering, and the answer's wait is the stall. Prints
 * the longest wait, the population and tick it was seen at, and the heap.
 *
 * Fails over STALL_LIMIT_MS, on any page error, on a read-back that never returns and on a town
 * that did not grow (a stall figure over an empty city proves nothing). The figure is load
 * sensitive: read it on an otherwise idle machine.
 *
 * Usage: node tools/probes/stall.mjs [url] [seconds]   (seconds of growth, default 100)
 */
import { pathToFileURL } from 'node:url';
import { TIER } from '../shots/lib/roads.mjs';
import { openSession } from '../shots/lib/session.mjs';

/** The longest the page may take to answer one read-back while the town grows, in ms. */
const STALL_LIMIT_MS = 4000;
/** The longest wait the performance budget allows before the page counts as slow, in ms. */
const STALL_TARGET_MS = 1000;
/** A read-back that has not come back in this long means the page is hung, not slow. */
const HUNG_MS = 30000;
/** Population the town grows toward; the growth stops once it is reached. */
const TARGET_POP = 5500;
const DEFAULT_GROWTH_S = 100;

/** Residential densities painted at once; each rung unlocks when the town's population earns it. */
const LADDER = [1, 6, 7, 8, 2];
const ZONE_COM = 3;
const ZONE_IND = 5;
const SITE_W = 66;
const GRID_D = 62;
const SITE_D = GRID_D + 12;
/** Plateau height, and the pond bed that sits inside the build slope of it. */
const PLATEAU = 2;
const POND_BED = -1.5;

/** The first dry anchor whose ground varies by under 11 m over the whole site. */
function findAnchor(g) {
  const N = g.size;
  for (let z = 8; z < N - SITE_D - 6; z++)
    for (let x = 8; x < N - SITE_W - 6; x++) {
      const h0 = g.height[z * N + x];
      let ok = true;
      for (let dz = 0; dz < SITE_D && ok; dz++)
        for (let dx = 0; dx < SITE_W && ok; dx++) {
          const i = (z + dz) * N + x + dx;
          if (g.water[i] || Math.abs(g.height[i] - h0) > 11) ok = false;
        }
      if (ok) return { x, z };
    }
  return null;
}

/** Runs the probe against `url`; returns `{ failures, longestMs }`. */
export async function runStall(url, growthS = DEFAULT_GROWTH_S) {
  const started = performance.now();
  const session = await openSession(url);
  const { page, send } = session;
  const failures = [];
  let longestMs = 0;
  let longestAt = '';
  let pop = 0;
  /** The longest read-back seen at each population band, in ms. */
  const byBand = new Map();
  try {
    const g = await page.evaluate(() => {
      const r = window.__slimcity.readGrid();
      return { size: r.size, water: Array.from(r.water), height: Array.from(r.height) };
    });
    const A = findAnchor(g);
    if (!A) throw new Error('no dry site for the town');
    const { x: X, z: Z } = A;
    // A building is refused on a tile steeper than the build slope, so the site is levelled to a
    // plateau first, its last rows dug into a pond for the sewage drain.
    await page.evaluate(
      ([x, z, w, h, gridD, plateau, bed]) => {
        const heights = new Float32Array(w * h);
        for (let r = 0; r < h; r++)
          for (let c = 0; c < w; c++) heights[r * w + c] = r >= gridD + 5 ? bed : plateau;
        window.__slimcity.cmd('Level', [{ kind: 'terraformSet', x, z, w, h, heights }]);
      },
      [X, Z, SITE_W, SITE_D, GRID_D, PLATEAU, POND_BED],
    );

    // A grid of streets so density can arrive: a single ribbon of road grows a village.
    const line = (n) => Array.from({ length: 61 }, (_, i) => n(i));
    for (let i = 0; i <= 60; i += 6) {
      await send('R', [
        { kind: 'buildRoad', tier: TIER.twoLane, tiles: line((k) => ({ x: X + k, z: Z + i })) },
      ]);
      await send('R', [
        { kind: 'buildRoad', tier: TIER.twoLane, tiles: line((k) => ({ x: X + i, z: Z + k })) },
      ]);
    }
    // Residential alone plateaus, so roughly three parts housing to one commerce and one industry;
    // the late-unlocking densities go in the middle and the outer ring pulls the rest up.
    let block = 0;
    for (let bz = 0; bz < 60; bz += 6)
      for (let bx = 0; bx < 60; bx += 6) {
        const ring = Math.min(bx, bz, 54 - bx, 54 - bz) / 6;
        const zone =
          ring >= 2 && block % 3 === 1
            ? ZONE_COM
            : ring >= 2 && block % 3 === 2
              ? ZONE_IND
              : LADDER[Math.min(ring, LADDER.length - 1)];
        const tiles = Array.from({ length: 25 }, (_, i) => ({
          x: X + bx + 1 + (i % 5),
          z: Z + bz + 1 + Math.floor(i / 5),
        }));
        await send('Zone', [{ kind: 'paintZone', zone, tiles }]);
        block += 1;
      }

    // Utilities butted against a street: set back one tile and nothing is powered.
    const place = (catalogId, x, z) => ({ kind: 'placeBuilding', catalogId, x, z, rotation: 0 });
    const UTILITIES = [
      ...Array.from({ length: 7 }, (_, i) => ({
        ...place('coal-plant', X + 61, Z + 1 + i * 6),
        rotation: 3,
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        ...place('water-tower', X + 61, Z + 41 + i * 2),
        rotation: 3,
      })),
    ];
    const SERVICES = [
      place('school', X + 31, Z + 33),
      place('clinic', X + 25, Z + 34),
      place('police-station', X + 31, Z + 28),
      place('fire-station', X + 37, Z + 34),
      place('small-park', X + 25, Z + 29),
    ];
    const stub = (tiles) => ({ kind: 'buildRoad', tier: TIER.twoLane, tiles });
    await send('Quay street', [
      stub(Array.from({ length: 6 }, (_, i) => ({ x: X + 30, z: Z + 61 + i }))),
    ]);
    await send('Works street', [stub([27, 28, 29].map((dx) => ({ x: X + dx, z: Z + 64 })))]);
    await send('Pump street', [
      stub([31, 32, 33].map((dx) => ({ x: X + dx, z: Z + 64 }))),
      stub([{ x: X + 33, z: Z + 65 }]),
    ]);
    const SEWAGE = [
      place('water-pump', X + 31, Z + 65),
      place('water-drain', X + 33, Z + 66),
      place('sewage-works', X + 27, Z + 65),
    ];
    await send('Utilities', UTILITIES);
    await send('Services', SERVICES);
    await send('Sewage', SEWAGE);
    await send('Works pipe', [
      { kind: 'layWaterPipe', tiles: [{ x: X + 29, z: Z + 65 }], on: true },
    ]);

    await page.evaluate(() => window.__slimcity.setSpeed(4));
    // A refused placement acks quietly and the only symptom is a town that never grows.
    const origins = [...UTILITIES, ...SERVICES, ...SEWAGE].map((p) => [p.x, p.z]);
    await page
      .waitForFunction(
        (list) => {
          const g2 = window.__slimcity.readGrid();
          return list.every(([x, z]) => g2.buildingId[z * g2.size + x] !== 0);
        },
        origins,
        { timeout: 20000, polling: 500 },
      )
      .catch(() => failures.push('not every utility and service stood after placement'));

    const asked = (promise) =>
      Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), HUNG_MS))]);
    const growthStart = performance.now();
    while (performance.now() - growthStart < growthS * 1000 && pop < TARGET_POP) {
      await new Promise((r) => setTimeout(r, 1000));
      const askedAt = performance.now();
      const s = await asked(page.evaluate(() => window.__slimcity.getStats()));
      const ms = Math.round(performance.now() - askedAt);
      if (s === null) {
        failures.push(`the page did not answer in ${HUNG_MS / 1000} s at pop ${pop}`);
        break;
      }
      pop = s.population;
      const mem = await asked(
        page.evaluate(() => ({
          heapMb: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : 0,
          ...window.__slimcity.renderInfo(),
        })),
      );
      if (mem) {
        const band = pop < 500 ? 'under 500' : pop < 1500 ? '500-1500' : 'over 1500';
        const prior = byBand.get(band) ?? 0;
        byBand.set(band, Math.max(prior, ms));
        console.log(
          `pop ${pop} read ${ms} ms heap ${mem.heapMb} MB geometries ${mem.geometries} programs ${mem.programs}`,
        );
      }
      if (ms > longestMs) {
        longestMs = ms;
        longestAt = `pop ${pop} tick ${s.tick}`;
      }
    }
    const heap = await asked(
      page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : 0)),
    );
    console.log(
      `grew to ${pop} people in ${((performance.now() - growthStart) / 1000).toFixed(0)} s`,
    );
    console.log(`heap ${Math.round((heap ?? 0) / 1048576)} MB`);
    for (const [band, ms] of byBand) console.log(`longest read-back at ${band}: ${ms} ms`);
    // Whether the browser draws on a real GPU or in software decides what the target means.
    const gpu = await asked(
      page.evaluate(() => {
        const gl = document.createElement('canvas').getContext('webgl');
        const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
        return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
      }),
    );
    console.log(`gpu ${gpu}`);
    if (pop === 0)
      failures.push('nothing grew: the stall figure over an empty town proves nothing');
    if (longestMs > STALL_LIMIT_MS)
      failures.push(
        `the page took ${longestMs} ms to answer once (${longestAt}), over ${STALL_LIMIT_MS} ms`,
      );
    for (const e of session.errors.slice(0, 3)) failures.push(`page error: ${e}`);
  } finally {
    await Promise.race([session.close().catch(() => {}), new Promise((r) => setTimeout(r, 10000))]);
  }
  const seconds = ((performance.now() - started) / 1000).toFixed(0);
  console.log(
    `longest read-back ${longestMs} ms at ${longestAt || 'n/a'} (target ${STALL_TARGET_MS} ms, limit ${STALL_LIMIT_MS} ms); ${seconds} s`,
  );
  if (failures.length > 0) {
    console.log(`FAIL (${failures.length})`);
    for (const f of failures) console.log(' -', f);
  }
  return { failures, longestMs };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { failures } = await runStall(
    process.argv[2] ?? 'http://localhost:5173',
    Number(process.argv[3] ?? DEFAULT_GROWTH_S),
  );
  process.exitCode = failures.length > 0 ? 1 : 0;
}
