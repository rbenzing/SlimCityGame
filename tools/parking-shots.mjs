/** Shots of every way a building parks its cars, seen from straight above so
 * stalls, aisles, paint and cars can be judged. Subjects, each placed once
 * beside a street with room around it: a strip mall, a supermarket, a
 * drive-through restaurant, a filling station, an office, a hotel, a garden
 * walk-up block, a mid-rise, a tower, a mixed-use block (mixed-2), a
 * light-industrial flex building, a warehouse, a clinic and the hospital; plus
 * one street laid with parking lanes and a few homes on it.
 * Frames: `<subject>-above` for each subject (the whole lot in frame, the
 * bottom fifth empty for the toolbar), `row-oblique` (the commercial row from
 * the street side), `kerb-parking` (the parking-lane street from above) and
 * `kerb-parking-close` (40 m at the parked cars on the lane).
 * Before any frame it prints one table from readParking(): catalogId, stalls,
 * occupied, and whether the kind is one the lot-parking rule names.
 * Buildings are placed by command on flat dry ground with the sim paused; the
 * rows stand on the SOUTH side of their street because a generic building's
 * entrance is on a fixed world face. Parked cars come from the sim's
 * occupancy: when every lot reads empty with the sim paused, the sim runs at
 * speed 1 for a few seconds and is paused again before the first frame.
 *
 * Usage: node tools/parking-shots.mjs [baseUrl] [outDir]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import {
  CAMERA_MIN_DISTANCE,
  cleanShot,
  hooksReady,
  tileCamera,
  tileMeters,
  unlimitedMoneyOption,
} from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'tools/shots-parking';
mkdirSync(out, { recursive: true });

const catalog = JSON.parse(readFileSync('src/data/catalog.json', 'utf8')).buildings;
const entryOf = (id) => {
  const entry = catalog.find((c) => c.id === id);
  if (!entry) throw new Error(`no catalog entry ${id}`);
  return entry;
};
/** The lot-parking rule: suburban commerce and industry, never downtown, mixed or a farm. */
const ZONE_COM_HIGH = 4;
const ZONE_MIXED = 8;
const ZONE_AGRICULTURE = 9;
const drawsLotParking = (e) =>
  (e.category === 'com' || e.category === 'ind') &&
  e.zone !== ZONE_AGRICULTURE &&
  e.zone !== ZONE_COM_HIGH &&
  e.zone !== ZONE_MIXED &&
  e.kind !== 'office' &&
  e.kind !== 'hotel';

const SEED = 7;
const DEFAULT_PITCH = 0.7;
const TOP_PITCH = 1.5;
/** Tiles of clear ground between neighbours on a street, and of road past each end. */
const GAP = 5;
const MARGIN = 2;
/** Tiles clear north of a road, and south of the deepest building. */
const ROWS_NORTH = 3;
const ROWS_SOUTH_EXTRA = 6;
const PARKED_PROFILE = 30;

/** One street per entry, west to east: the subjects standing on its south side. */
const STREETS = [
  { name: 'commercial', subjects: ['com-strip-2', 'com-market-2', 'com-restaurant-1-lot2x2'] },
  { name: 'fuel-downtown', subjects: ['com-fuel-2', 'com-high-1', 'com-hotel-2'] },
  { name: 'dense-homes', subjects: ['res-medium-2', 'res-high-2', 'res-tower-1'] },
  { name: 'mixed-industry', subjects: ['mixed-2', 'ind-flex-2', 'ind-warehouse-2'] },
  { name: 'health', subjects: ['clinic', 'hospital'] },
  {
    name: 'kerb',
    parkingLanes: true,
    subjects: ['res-low-1', 'res-normal-2', 'res-low-1', 'res-normal-2', 'res-low-1'],
  },
];
/** Subject names for the frames: the catalog id, as the ticket's arrangements. */
const frameName = (id) => id.replace(/[^a-z0-9]+/g, '-');

const failures = [];
const fail = (msg) => {
  failures.push(msg);
  console.log('[FAIL]', msg);
};

const browser = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console.error]', m.text());
});
page.on('pageerror', (e) => fail(`pageerror ${e.message}`));
await unlimitedMoneyOption(page);
await page.addInitScript(
  ([session]) => {
    try {
      sessionStorage.setItem('slimcity.session', JSON.stringify(session));
      const saved = JSON.parse(localStorage.getItem('slimcity.settings') ?? '{}');
      localStorage.setItem(
        'slimcity.settings',
        JSON.stringify({ ...saved, sandboxUnlockAll: true, unlimitedMoney: true }),
      );
    } catch (e) {
      void e;
    }
  },
  [{ screen: 'playing', seed: SEED, mode: 'new' }],
);

try {
  await page.goto(base + '?nobloom', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#viewport canvas', { timeout: 60000 });
  await hooksReady(page);
  const cam = tileCamera(page);
  const send = (label, commands) =>
    page.evaluate(([l, c]) => window.__slimcity.cmd(l, c), [label, commands]);
  const readBuildings = () => page.evaluate(() => window.__slimcity.readBuildings());
  await send('Sandbox', [{ kind: 'setSandbox', on: true }]);
  await send('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
  await page.evaluate(() => {
    window.__slimcity.setSpeed(0);
    window.__slimcity.setDayT(0.5);
  });

  const g = await page.evaluate(() => window.__slimcity.readGrid());
  const N = g.size;
  const idx = (x, z) => z * N + x;
  const flatDry = (x, z, h0) =>
    x >= 0 &&
    z >= 0 &&
    x < N &&
    z < N &&
    !g.water[idx(x, z)] &&
    Math.abs(g.height[idx(x, z)] - h0) <= 6;
  const used = new Set();

  // Each street gets its own flat dry site, clear of the others.
  const sites = STREETS.map((street) => {
    const widths = street.subjects.map((id) => entryOf(id).footprint.w);
    const maxD = Math.max(...street.subjects.map((id) => entryOf(id).footprint.d));
    const cols = widths.reduce((n, w) => n + w + GAP, 0) + MARGIN;
    const rowsSouth = maxD + ROWS_SOUTH_EXTRA;
    for (let z = 20 + ROWS_NORTH; z < N - rowsSouth - 10; z++) {
      for (let x = 20; x < N - cols - 20; x++) {
        const h0 = g.height[idx(x, z)];
        let ok = true;
        for (let dz = -ROWS_NORTH; dz <= rowsSouth && ok; dz++) {
          for (let dx = -MARGIN; dx < cols + MARGIN && ok; dx++) {
            if (!flatDry(x + dx, z + dz, h0) || used.has(idx(x + dx, z + dz))) ok = false;
          }
        }
        if (!ok) continue;
        for (let dz = -ROWS_NORTH - 1; dz <= rowsSouth + 1; dz++) {
          for (let dx = -MARGIN - 1; dx < cols + MARGIN + 1; dx++) used.add(idx(x + dx, z + dz));
        }
        return { x, z, cols };
      }
    }
    throw new Error(`no flat dry ground for the ${street.name} street`);
  });

  await send('Profile', [
    {
      kind: 'defineRoadProfile',
      id: PARKED_PROFILE,
      profile: {
        class: 'local',
        pieces: [
          { kind: 'sidewalk', width: 1.875 },
          { kind: 'parking', width: 2.25 },
          { kind: 'travel', width: 3.75, flow: 'back' },
          { kind: 'travel', width: 3.75, flow: 'fwd' },
          { kind: 'parking', width: 2.25 },
          { kind: 'sidewalk', width: 1.875 },
        ],
      },
    },
  ]);

  // The road runs along each site's anchor row; buildings stand on its south side.
  const spots = [];
  for (const [s, street] of STREETS.entries()) {
    const site = sites[s];
    const road = Array.from({ length: site.cols }, (_, i) => ({ x: site.x - MARGIN + i, z: site.z }));
    await send('Street', [
      {
        kind: 'buildRoad',
        tier: 1,
        tiles: road,
        ...(street.parkingLanes ? { profile: PARKED_PROFILE } : {}),
      },
    ]);
    // One command each: a batch is atomic, and one refused tile would drop the street.
    let cursor = site.x + 1;
    for (const id of street.subjects) {
      const fp = entryOf(id).footprint;
      const spot = { id, street: street.name, x: cursor, z: site.z + 1, w: fp.w, d: fp.d };
      spots.push(spot);
      await send('Building', [
        { kind: 'placeBuilding', catalogId: id, x: spot.x, z: spot.z, rotation: 0 },
      ]);
      cursor += fp.w + (street.parkingLanes ? 2 : GAP);
    }
  }
  await page.waitForTimeout(3000);

  // Prove every subject stands, by id and position, before any frame.
  const standing = await readBuildings();
  const missing = spots.filter((s) => !standing.some((b) => b.catalogId === s.id && b.x === s.x && b.z === s.z));
  if (missing.length > 0) {
    throw new Error(`not standing: ${missing.map((s) => `${s.id}@${s.x},${s.z}`).join(' ')}`);
  }

  const parkingTable = async () => {
    const rows = [];
    const now = await readBuildings();
    for (const s of spots) {
      const b = now.find((n) => n.catalogId === s.id && n.x === s.x && n.z === s.z);
      const p = await page.evaluate((id) => window.__slimcity.readParking(id), b.id);
      const cars = s.street === 'kerb'
        ? await page.evaluate((id) => window.__slimcity.readHouseCars(id).length, b.id)
        : '';
      rows.push({
        catalogId: s.id,
        stalls: p?.stalls ?? 'null',
        occupied: p?.occupied ?? 'null',
        drawsLotParking: drawsLotParking(entryOf(s.id)),
        houseCars: cars,
      });
    }
    return rows;
  };
  let table = await parkingTable();
  let ran = 'the sim stayed paused';
  if (table.every((r) => !r.occupied)) {
    // Parked cars follow the sim's occupancy: run a few seconds, then pause again.
    await page.evaluate(() => window.__slimcity.setSpeed(1));
    await page.waitForTimeout(6000);
    await page.evaluate(() => window.__slimcity.setSpeed(0));
    await page.waitForTimeout(500);
    table = await parkingTable();
    ran = 'every lot read empty paused, so the sim ran at speed 1 for 6 s and was paused again';
  }
  console.log(ran);
  console.table(table);
  const after = await readBuildings();
  const gone = spots.filter((s) => !after.some((b) => b.catalogId === s.id && b.x === s.x && b.z === s.z));
  if (gone.length > 0) throw new Error(`cleared while the sim ran: ${gone.map((s) => s.id).join(' ')}`);

  // A paused sim posts a snapshot, which carries the pinned phase to the lighting, only when a command lands.
  await page.evaluate(() => {
    window.__slimcity.setDayT(0.5);
    window.__slimcity.cmd('Phase', [{ kind: 'setUnlimitedMoney', on: true }]);
  });
  await page.waitForTimeout(2000);

  const T = await tileMeters(page);
  const aspect = 1280 / 800;
  const shoot = async (name, tx, tz, distance, yaw, pitch) => {
    await cam(tx, tz, distance, yaw, pitch);
    await page.waitForTimeout(1500);
    await cleanShot(page, `${out}/${name}.png`);
  };
  /** Straight down on a lot: the building, its road edge and a tile around the lot fill 60% of the frame, so the bottom fifth stays clear. */
  const above = async (s) => {
    const x0 = s.x - 1;
    const x1 = s.x + s.w + 1;
    const z0 = s.z - 1;
    const z1 = s.z + s.d + 1;
    const tan = Math.tan(Math.PI / 8);
    const distance = Math.max(
      CAMERA_MIN_DISTANCE,
      ((z1 - z0) * T) / (2 * tan * 0.6),
      ((x1 - x0) * T) / (2 * tan * aspect * 0.6),
    );
    await shoot(`${frameName(s.id)}-above`, (x0 + x1) / 2 - 0.5, (z0 + z1) / 2 - 0.5, distance, 0, TOP_PITCH);
  };
  for (const s of spots) {
    if (s.street === 'kerb') continue;
    await above(s);
  }

  // The commercial row from the street side, looking south over the road.
  const row = spots.filter((s) => s.street === 'commercial');
  const rx0 = Math.min(...row.map((s) => s.x));
  const rx1 = Math.max(...row.map((s) => s.x + s.w));
  await shoot('row-oblique', (rx0 + rx1) / 2 - 0.5, row[0].z + 1, 190, Math.PI + 0.3, 0.9);

  // The parking-lane street from above, then 40 m at the parked cars on the lane.
  const kerb = spots.filter((s) => s.street === 'kerb');
  const kx0 = Math.min(...kerb.map((s) => s.x));
  const kx1 = Math.max(...kerb.map((s) => s.x + s.w));
  const roadZ = kerb[0].z - 1;
  await shoot('kerb-parking', (kx0 + kx1) / 2 - 0.5, roadZ + 0.5, Math.max(CAMERA_MIN_DISTANCE, ((kx1 - kx0 + 4) * T) / (2 * Math.tan(Math.PI / 8) * aspect * 0.8)), 0, TOP_PITCH);
  await shoot('kerb-parking-close', kx0 + 2, roadZ, CAMERA_MIN_DISTANCE, 0, TOP_PITCH);
} catch (e) {
  fail(e.stack ?? String(e));
} finally {
  await browser.close();
}
if (failures.length > 0) process.exit(1);
