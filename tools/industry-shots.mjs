/** Shots of the industrial kit's parts and the farmsteads: a warehouse from the
 * street and from its truck court, a workshop, a factory, a flex building, a
 * food plant, a chemical plant, a steelworks and a paper mill, each at the
 * default camera pitch with the lot's cars and box trucks in their stalls; then
 * a crop farm, an orchard and a pasture with their farmsteads, up close; then
 * the same again at night, where the factory's clerestory and the warehouse's
 * office corner glow and nothing else does. Last, the line-up: one of each
 * industrial kind along one street, framed whole at the default pitch so a
 * metre is about four pixels, the second pass's test that each kind is
 * nameable without its label, by day and at 22:00. Buildings are placed by
 * command on flat dry ground with the sim paused, as the frame budget does: a
 * running sim with no power, water or zones abandons and clears them within a
 * minute.
 *
 * Usage: node tools/industry-shots.mjs [baseUrl] [outDir]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import {
  CAMERA_MIN_DISTANCE,
  cleanShot,
  closeUp,
  hooksReady,
  tileCamera,
  tileMeters,
} from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'tools/shots-industry';
mkdirSync(out, { recursive: true });

const catalog = JSON.parse(readFileSync('src/data/catalog.json', 'utf8')).buildings;
const footprint = (id) => {
  const entry = catalog.find((c) => c.id === id);
  if (!entry) throw new Error(`no catalog entry ${id}`);
  return entry.footprint;
};

const SEED = 7;
const DEFAULT_PITCH = 0.7;
/** How far up the frame the subject is carried, as a fraction of its height. */
const LIFT = 0.12;
const RT = { TwoLane: 1, Gravel: 4 };
/** Tiles a street takes: the deepest lot (4), the road, and the gap to the next street. */
const STREET_ROWS = 9;
/** Tiles of road beyond each end of a street's buildings. */
const MARGIN = 2;
/** Tiles across one column of streets. */
const COLUMN_W = 24;
/** The "behind" shots look down steeper, so a stack in front does not hide the plant. */
const BEHIND_PITCH = 1.25;
/** The line-up's night: 22:00. */
const LINEUP_NIGHT = 22 / 24;

/** The streets, filled down a column and then across: what stands along each, left to right; the line-up last, shot on its own. */
const STREETS = [
  { name: 'warehouse', ids: ['ind-warehouse-1', 'ind-warehouse-2', 'ind-warehouse-3'] },
  { name: 'workshop', ids: ['ind-1', 'ind-workshop-2', 'ind-workshop-3'] },
  { name: 'factory', ids: ['ind-factory-1', 'ind-2', 'ind-factory-3'] },
  { name: 'flex', ids: ['ind-flex-1', 'ind-flex-2', 'ind-3'] },
  { name: 'food', ids: ['heavy-food-1', 'heavy-food-2', 'heavy-food-3'] },
  { name: 'chem', ids: ['heavy-chem-1', 'heavy-chem-2', 'heavy-chem-3'] },
  { name: 'steel', ids: ['heavy-metals-1', 'heavy-metals-2', 'heavy-metals-3'] },
  { name: 'paper', ids: ['heavy-paper-1', 'heavy-paper-2', 'heavy-paper-3'] },
  {
    name: 'lineup',
    lineup: true,
    ids: [
      'ind-1',
      'ind-warehouse-1',
      'ind-factory-1',
      'ind-flex-1',
      'heavy-food-1',
      'heavy-chem-1',
      'heavy-metals-1',
      'heavy-paper-1',
    ],
  },
];
/** The farms: a dirt road with a farm of each kind, large to small, south of it. */
const FARMS = ['farm-crops-2', 'farm-orchard-2', 'farm-pasture-2', 'farm-crops-1', 'farm-crops-3'];

const browser = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.addInitScript(
  ([session]) => {
    try {
      sessionStorage.setItem('slimcity.session', JSON.stringify(session));
      localStorage.setItem(
        'slimcity.settings',
        JSON.stringify({ sandboxUnlockAll: true, unlimitedMoney: true }),
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
  await send('Sandbox', [{ kind: 'setSandbox', on: true }]);
  await send('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
  await page.evaluate(() => {
    window.__slimcity.setSpeed(0);
    window.__slimcity.setDayT(0.5);
  });

  const g = await page.evaluate(() => window.__slimcity.readGrid());
  const N = g.size;
  const idx = (x, z) => z * N + x;
  const flatDry = (x, z, h0, slope) =>
    x >= 0 &&
    z >= 0 &&
    x < N &&
    z < N &&
    !g.water[idx(x, z)] &&
    Math.abs(g.height[idx(x, z)] - h0) <= slope;
  // Three columns of three streets where the ground allows, else five columns of two, on ground
  // as flat as the map gives.
  let anchor = null;
  let layout = null;
  for (const slope of [6, 9, 12]) {
    for (const [columns, perColumn] of [
      [3, 3],
      [5, 2],
    ]) {
      const rows = perColumn * STREET_ROWS + STREET_ROWS;
      const cols = columns * COLUMN_W;
      for (let z = 20; z < N - rows - 10 && !anchor; z++) {
        for (let x = 20; x < N - cols - 20 && !anchor; x++) {
          const h0 = g.height[idx(x, z)];
          let ok = true;
          for (let dz = -3; dz < rows && ok; dz++) {
            for (let dx = -MARGIN; dx < cols + MARGIN && ok; dx++) {
              if (!flatDry(x + dx, z + dz, h0, slope)) ok = false;
            }
          }
          if (ok) {
            anchor = { x, z };
            layout = { columns, perColumn, rows, cols, slope };
          }
        }
      }
      if (anchor) break;
    }
    if (anchor) break;
  }
  if (!anchor) throw new Error('no flat dry ground for the streets');
  console.log('anchor', JSON.stringify(anchor), JSON.stringify(layout));
  const { x: X, z: Z0 } = anchor;
  const rowsNeeded = layout.rows;

  // Each street's road runs along its row; its buildings stand on the north side, fronting it.
  const slot = (street) => STREETS.indexOf(street);
  const roadRow = (street) => Z0 + 4 + (slot(street) % layout.perColumn) * STREET_ROWS;
  const startX = (street) => X + Math.floor(slot(street) / layout.perColumn) * COLUMN_W;
  const spans = STREETS.map((street) => {
    let at = startX(street);
    return street.ids.map((id) => {
      const fp = footprint(id);
      const placed = { id, x: at, z: 0, w: fp.w, d: fp.d };
      at += fp.w;
      return placed;
    });
  });
  // The line-up's block is levelled to the anchor's height first: the street grid is
  // sited on ground within a few metres of flat, but one lot of eight on a tile over
  // MAX_BUILD_SLOPE would be refused and leave a gap in the one row that must be whole.
  const lineupStreet = STREETS.find((s) => s.lineup);
  const lineupLength = spans[STREETS.indexOf(lineupStreet)].reduce((sum, b) => sum + b.w, 0);
  await page.evaluate(
    ([x, z, w, h, height]) => {
      const heights = new Float32Array(w * h);
      heights.fill(height);
      window.__slimcity.cmd('Level', [{ kind: 'terraformSet', x, z, w, h, heights }]);
    },
    [
      startX(lineupStreet) - MARGIN,
      roadRow(lineupStreet) - 5,
      lineupLength + 2 * MARGIN,
      7,
      g.height[idx(X, Z0)],
    ],
  );
  await page.waitForTimeout(500);
  for (const [s, placed] of spans.entries()) {
    const street = STREETS[s];
    const length = placed.reduce((sum, b) => sum + b.w, 0) + 2 * MARGIN;
    await send('Street', [
      {
        kind: 'buildRoad',
        tier: RT.TwoLane,
        tiles: Array.from({ length }, (_, i) => ({
          x: startX(street) - MARGIN + i,
          z: roadRow(street),
        })),
      },
    ]);
  }
  // One command each: a batch is atomic, and one refused tile would drop the street.
  for (const [s, placed] of spans.entries()) {
    for (const b of placed) {
      b.z = roadRow(STREETS[s]) - b.d;
      await send('Building', [
        { kind: 'placeBuilding', catalogId: b.id, x: b.x, z: b.z, rotation: 0 },
      ]);
    }
  }

  // The farms stand south of a dirt road below the last street, each opening onto it.
  const dirtZ = Z0 + rowsNeeded + 2;
  const farmSpans = [];
  let farmAt = X;
  for (const id of FARMS) {
    const fp = footprint(id);
    farmSpans.push({ id, x: farmAt, z: dirtZ + 1, w: fp.w, d: fp.d });
    farmAt += fp.w + 1;
  }
  const farmLength = farmAt - X + 2 * MARGIN;
  const farmGround = (x, z) => x >= 0 && z >= 0 && x < N && z < N && !g.water[idx(x, z)];
  const farmsFit = farmGround(X + farmLength, dirtZ + 8) && dirtZ + 9 < N;
  if (farmsFit) {
    await send('Dirt', [
      {
        kind: 'buildRoad',
        tier: RT.Gravel,
        tiles: Array.from({ length: farmLength }, (_, i) => ({ x: X - MARGIN + i, z: dirtZ })),
      },
    ]);
    for (const f of farmSpans) {
      await send('Farm', [{ kind: 'placeBuilding', catalogId: f.id, x: f.x, z: f.z, rotation: 0 }]);
    }
  } else {
    console.log('no room for the farm row below the streets');
  }
  await page.waitForTimeout(3000);
  const standing = await page.evaluate(() => window.__slimcity.readBuildings());
  console.log(
    'standing',
    JSON.stringify(
      standing.reduce(
        (m, b) => ((m[`${b.catalogId}:${b.state}`] = (m[`${b.catalogId}:${b.state}`] ?? 0) + 1), m),
        {},
      ),
    ),
  );
  console.log('kit', JSON.stringify(await page.evaluate(() => window.__slimcity.readKit())));

  // A paused sim posts a snapshot, which carries the pinned phase to the lighting, only when a command lands.
  const setPhase = async (dayT) => {
    await page.evaluate((t) => {
      window.__slimcity.setDayT(t);
      window.__slimcity.cmd('Phase', [{ kind: 'setUnlimitedMoney', on: true }]);
      for (let i = 0; i < 100; i++) {
        const buttons = document.querySelectorAll('[aria-label="Dismiss notification"]');
        if (buttons.length === 0) return;
        buttons.forEach((b) => b.click());
      }
    }, dayT);
    await page.waitForTimeout(2000);
  };
  const shoot = async (name, tx, tz, distance, yaw, pitch = DEFAULT_PITCH) => {
    await cam(tx, tz, distance, yaw, pitch);
    await page.waitForTimeout(1200);
    await cleanShot(page, `${out}/${name}.png`);
  };
  const T = await tileMeters(page);
  // A heavy plant's stacks and silos stand well above its catalog roof height.
  const STACK_M = 45;
  const heightOf = (id) => {
    const h = catalog.find((c) => c.id === id).height;
    return id.startsWith('heavy-') ? Math.max(h, STACK_M) : h;
  };
  /** The farmstead, in the north-west strip of its lot: the gate is on the north. */
  const farmstead = (f) => ({
    // The orchard's barn and house stand a little off that corner, toward the gate.
    x: f.x + (f.id.includes('orchard') ? 1.9 : 2.5),
    z: f.z + (f.id.includes('orchard') ? 0.7 : 1.5),
    w: 5,
    d: 3,
    h: heightOf(f.id),
  });
  /** A box of tiles, `h` metres tall, that a shot frames whole. */
  const boxOf = (placed) => {
    const x0 = Math.min(...placed.map((b) => b.x));
    const x1 = Math.max(...placed.map((b) => b.x + b.w));
    const z0 = Math.min(...placed.map((b) => b.z));
    const z1 = Math.max(...placed.map((b) => b.z + b.d));
    return {
      x: (x0 + x1) / 2,
      z: (z0 + z1) / 2,
      w: x1 - x0,
      d: z1 - z0,
      h: Math.max(...placed.map((b) => heightOf(b.id))),
    };
  };
  /**
   * Frame a box whole, roof to ground, about the middle of the frame. The
   * ground target is where the ray through the box's mid-height meets the
   * ground, so the box's own tiles, not the street, sit at the centre; the eye
   * backs off until the box's projected height and width fill `fill` of the
   * 45 degree view, but never inside the camera's floor.
   */
  const frame = async (name, box, yaw, pitch = DEFAULT_PITCH, fill = 0.6) => {
    const tall = box.h * Math.cos(pitch) + box.d * T * Math.sin(pitch);
    const wide = box.w * T * Math.abs(Math.cos(yaw)) + box.d * T * Math.abs(Math.sin(yaw));
    const aspect = 1280 / 800;
    const distance = Math.max(
      CAMERA_MIN_DISTANCE,
      tall / (2 * Math.tan(Math.PI / 8) * fill),
      wide / (2 * Math.tan(Math.PI / 8) * aspect * fill),
    );
    // Aim a tenth of the frame's height short of the box, so its street edge clears
    // the bottom bar (the lowest 110 px of 800) instead of standing behind it.
    const lift = (LIFT * 2 * distance * Math.tan(Math.PI / 8)) / Math.sin(pitch) / T;
    const back = box.h / 2 / Math.tan(pitch) / T - lift;
    await shoot(
      name,
      box.x - 0.5 - Math.sin(yaw) * back,
      box.z - 0.5 - Math.cos(yaw) * back,
      distance,
      yaw,
      pitch,
    );
  };
  const find = (street, id, nth = 0) =>
    spans[STREETS.findIndex((s) => s.name === street)].filter((b) => b.id === id)[nth];
  const lineup = STREETS.findIndex((s) => s.lineup);
  const shootLineup = (suffix) => frame(`lineup${suffix}`, boxOf(spans[lineup]), 0.2);

  const views = (suffix) => async () => {
    // Each kind from the street, its biggest rung in the middle of the frame.
    const subjects = [
      ['warehouse', 'ind-warehouse-2'],
      ['workshop', 'ind-workshop-2'],
      ['factory', 'ind-2'],
      ['flex', 'ind-flex-2'],
      ['food', 'heavy-food-2'],
      ['chem', 'heavy-chem-2'],
      ['steel', 'heavy-metals-2'],
      ['paper', 'heavy-paper-2'],
    ];
    for (const [street, id] of subjects) {
      await frame(`${street}${suffix}`, boxOf([find(street, id)]), 0.3);
    }
    // The warehouse and the food plant from behind, where the truck court is.
    for (const [street, id] of [
      ['warehouse', 'ind-warehouse-2'],
      ['warehouse', 'ind-warehouse-3'],
      ['food', 'heavy-food-2'],
    ]) {
      await frame(`${street}-${id}-court${suffix}`, boxOf([find(street, id)]), Math.PI + 0.3);
    }
    // The heavy plants from the other quarter, to see what stands behind them.
    for (const [street, id] of [
      ['chem', 'heavy-chem-2'],
      ['steel', 'heavy-metals-3'],
      ['steel', 'heavy-metals-2'],
      ['paper', 'heavy-paper-3'],
    ]) {
      await frame(
        `${street}-${id}-behind${suffix}`,
        boxOf([find(street, id)]),
        Math.PI - 0.6,
        BEHIND_PITCH,
        0.45,
      );
    }
    if (farmsFit) {
      for (const f of farmSpans) {
        await frame(`farm-${f.id}${suffix}`, farmstead(f), Math.PI + 0.35);
      }
    }
  };

  await setPhase(0.5);
  await views('')();
  await shootLineup('');

  // The close shots, at twice the pixels over the camera's floor distance.
  const restore = await closeUp(page, 2);
  for (const [street, id, label] of [
    ['warehouse', 'ind-warehouse-2', 'close-warehouse'],
    ['workshop', 'ind-workshop-2', 'close-workshop'],
    ['factory', 'ind-2', 'close-factory'],
    ['chem', 'heavy-chem-2', 'close-chem'],
  ]) {
    await frame(label, boxOf([find(street, id)]), 0.3, DEFAULT_PITCH, 0.7);
  }
  if (farmsFit) {
    for (const f of farmSpans.slice(0, 3)) {
      await frame(`close-${f.id}`, farmstead(f), Math.PI + 0.3, DEFAULT_PITCH, 0.7);
      await frame(`close-${f.id}-yard`, farmstead(f), Math.PI * 0.5, 0.5, 0.7);
    }
  }
  await restore();

  await setPhase(0.96);
  await views('-night')();
  await setPhase(LINEUP_NIGHT);
  await shootLineup('-night');
} finally {
  await browser.close();
}
