import { defineSeries } from '../../lib/series.mjs';
import { settle } from '../../lib/session.mjs';
import { runUp } from '../../lib/town.mjs';
import { LAKE, OCEAN, RIVER, centre, readBodies, runOf, tilesOf } from '../../lib/waterfind.mjs';

/** The terrain generator the series stands on: the coast. */
const GENERATOR = 2;
const SEED = 7;
/** Seeds laid side by side on the overview sheet: the series' own, then others to judge the variety. */
const OVERVIEW_SEEDS = [SEED, 1000, 16838, 24757, 151461, 491978];
/** The wave clock every frame is taken at, so a run repeats. */
const WAVE_CLOCK_S = 20;
/** Land this close above sea level is beach (SAND_BAND_METERS in src/shared/constants.ts). */
const SAND_BAND = 3;
/** Dry tiles a street runs on past each bank of the river: the ramp up to the deck needs three. */
const BANK_TILES = 4;
/** TwoLane in src/shared/types.ts. */
const TWO_LANE = 1;
/** ZoneType in src/shared/types.ts: ResLow, with ComLow two above it and Industrial four. */
const RES_LOW = 1;
/** Buildings the first town shows before its frames are taken. */
const TOWN_BUILDINGS = 12;

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** The camera yaw that looks along (dx, dz): the rig looks along -sin(yaw), -cos(yaw). */
const yawToward = (dx, dz) => Math.atan2(-dx, -dz);

/** The overview: each seed's coast map drawn from its heights, shaded, water blue, steep ground red. */
async function drawOverview(session, seeds) {
  await session.page.evaluate(async (list) => {
    const { generateMap, terrainBuildable } = await import('/src/world/maps.ts');
    const root = document.createElement('div');
    root.id = 'shots-overview';
    root.style.cssText =
      'position:fixed;inset:0;z-index:99999;background:#15181c;display:grid;' +
      'grid-template-columns:repeat(3,1fr);gap:6px;padding:6px;color:#ddd;font:13px monospace';
    for (const seed of list) {
      const m = generateMap(2, seed, 'x');
      const n = m.size;
      const canvas = document.createElement('canvas');
      canvas.width = n;
      canvas.height = n;
      const ctx = canvas.getContext('2d');
      const img = ctx.createImageData(n, n);
      let buildable = 0;
      for (let z = 0; z < n; z++) {
        for (let x = 0; x < n; x++) {
          const i = z * n + x;
          const h = m.height[i];
          const shade =
            1 +
            0.12 *
              ((m.height[z * n + Math.max(0, x - 1)] ?? h) -
                (m.height[z * n + Math.min(n - 1, x + 1)] ?? h));
          let rgb;
          if (m.water[i]) {
            const d = Math.min(1, -h / 8);
            rgb = [30 - 20 * d, 90 - 50 * d, 170 - 70 * d];
          } else if (terrainBuildable(n, m.height, m.water, x, z)) {
            buildable++;
            const t = Math.min(1, h / 30);
            rgb = [90 + 90 * t, 150 + 30 * t, 70 + 80 * t];
          } else {
            rgb = [190, 70, 60];
          }
          img.data.set([rgb[0] * shade, rgb[1] * shade, rgb[2] * shade, 255], i * 4);
        }
      }
      ctx.putImageData(img, 0, 0);
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#000';
      ctx.beginPath();
      ctx.arc(m.spawn.x + 0.5, m.spawn.z + 0.5, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      canvas.style.cssText = 'width:100%;image-rendering:pixelated';
      const cell = document.createElement('div');
      cell.append(canvas);
      const label = document.createElement('div');
      label.textContent = `seed ${seed}   buildable ${((100 * buildable) / (n * n)).toFixed(1)}%`;
      cell.append(label);
      root.append(cell);
    }
    document.body.append(root);
  }, seeds);
}

async function scene(session) {
  const { page } = session;
  const b = await readBodies(page);
  const n = b.size;
  const grid = await page.evaluate(() => {
    const g = window.__slimcity.readGrid();
    return { height: g.height, water: g.water, spawn: window.__slimcity.map.spawn };
  });
  const river = tilesOf(b, RIVER);
  const oceans = tilesOf(b, OCEAN);
  const lakeTiles = tilesOf(b, LAKE);
  if (river.length === 0 || oceans.length === 0 || lakeTiles.length === 0)
    throw new Error('the map lacks an ocean, a river or a lake');
  const xz = (i) => ({ x: i % n, z: Math.floor(i / n) });
  const nearest = (list, p) =>
    list.reduce((a, i) => {
      const d = (k) => Math.hypot(xz(k).x - p.x, xz(k).z - p.z);
      return a === null || d(i) < d(a) ? i : a;
    }, null);

  // The mouth: the river tile with an ocean tile beside it.
  const beside = (i, kind) =>
    DIRS.some(([dx, dz]) => b.kind[(xz(i).z + dz) * n + xz(i).x + dx] === kind);
  const mouthTile = river.find((i) => beside(i, OCEAN));
  if (mouthTile === undefined) throw new Error('the river does not reach the ocean');
  const mouth = xz(mouthTile);
  const seaTile = xz(
    oceans.find(
      (i) =>
        beside(mouthTile, OCEAN) && Math.abs(xz(i).x - mouth.x) + Math.abs(xz(i).z - mouth.z) === 1,
    ),
  );
  const inland = { x: mouth.x - seaTile.x, z: mouth.z - seaTile.z };

  // The widest beach: dry land within the sand band of the ocean, most such tiles in a 15 x 15 window.
  const isBeach = (x, z) => {
    const i = z * n + x;
    return grid.water[i] === 0 && grid.height[i] > 0 && grid.height[i] <= SAND_BAND;
  };
  const onShore = (x, z) => DIRS.some(([dx, dz]) => b.kind[(z + dz) * n + x + dx] === OCEAN);
  let beach = null;
  let beachCount = 0;
  const win = 7;
  for (let z = win; z < n - win; z++) {
    for (let x = win; x < n - win; x++) {
      if (!isBeach(x, z) || !onShore(x, z)) continue;
      let count = 0;
      for (let dz = -win; dz <= win; dz++)
        for (let dx = -win; dx <= win; dx++) if (isBeach(x + dx, z + dz)) count++;
      if (count > beachCount) {
        beachCount = count;
        beach = { x, z };
      }
    }
  }
  if (!beach) throw new Error('the ocean has no sandy shore');
  const sea = xz(nearest(oceans, beach));

  // Mid-map: the river tile nearest the map's middle.
  const mid = xz(nearest(river, { x: n / 2, z: n / 2 }));
  const lake = centre(
    lakeTiles.map((i) => runOf(b, i)).reduce((a, l) => (l.length > a.length ? l : a), []),
    n,
  );

  // The river's crossing: the cross-section through the mid tile that is shortest, with a bank each side.
  const runLength = (dx, dz) => {
    let len = 1;
    for (const s of [1, -1])
      for (let k = 1; b.kind[(mid.z + dz * k * s) * n + mid.x + dx * k * s] === RIVER; k++) len++;
    return len;
  };
  const acrossX = runLength(1, 0) <= runLength(0, 1);
  const [cx, cz] = acrossX ? [1, 0] : [0, 1];
  let from = 0;
  while (b.kind[(mid.z + cz * (from - 1)) * n + mid.x + cx * (from - 1)] === RIVER) from--;
  let to = 0;
  while (b.kind[(mid.z + cz * (to + 1)) * n + mid.x + cx * (to + 1)] === RIVER) to++;
  const crossing = [];
  for (let k = from - BANK_TILES; k <= to + BANK_TILES; k++)
    crossing.push({ x: mid.x + cx * k, z: mid.z + cz * k });
  const waterTiles = to - from + 1;

  // The first town's block: 32 x 7 level dry tiles nearest the spawn.
  const site = await page.evaluate(
    async ([spawn, wide, deep]) => {
      const { terrainBuildable } = await import('/src/world/maps.ts');
      const m = window.__slimcity.map;
      const clear = (x0, z0) => {
        for (let z = z0; z < z0 + deep; z++)
          for (let x = x0; x < x0 + wide; x++)
            if (!terrainBuildable(m.size, m.height, m.water, x, z)) return false;
        return true;
      };
      let best = null;
      let bestD = Infinity;
      for (let z0 = 8; z0 < m.size - 16; z0 += 2)
        for (let x0 = 8; x0 < m.size - 40; x0 += 2) {
          const d = Math.hypot(x0 + wide / 2 - spawn.x, z0 + deep / 2 - spawn.z);
          if (d < bestD && clear(x0, z0)) {
            best = { x: x0, z: z0 };
            bestD = d;
          }
        }
      return best && { ...best, distance: bestD };
    },
    [grid.spawn, 32, 7],
  );
  if (!site) throw new Error('no level ground for the first town');

  // A two-lane street over the river, in one drag, from bank to bank.
  const mid2 = crossing[Math.floor(crossing.length / 2)];
  await session.send('Bridge', [{ kind: 'buildRoad', tier: TWO_LANE, tiles: crossing }]);
  await settle(page, {
    until: ([i]) => window.__slimcity.readGrid().roadTier[i] !== 0,
    arg: [mid2.z * n + mid2.x],
    timeout: 20000,
  });

  // The first town beside the spawn, from the opening commands alone, grown for a while.
  const row = (x0, z, len) => Array.from({ length: len }, (_, i) => ({ x: x0 + i, z }));
  const rows = (x0, z0, w, d) => Array.from({ length: d }, (_, k) => row(x0, z0 + k, w)).flat();
  const { x: x0, z: z0 } = site;
  await session.send('First town', [
    { kind: 'buildRoad', tier: TWO_LANE, tiles: row(x0, z0 + 2, 32) },
    { kind: 'placeBuilding', catalogId: 'wind-turbine', x: x0, z: z0 + 1, rotation: 0 },
    { kind: 'placeBuilding', catalogId: 'wind-turbine', x: x0 + 4, z: z0 + 1, rotation: 0 },
    { kind: 'placeBuilding', catalogId: 'water-tower', x: x0 + 6, z: z0 + 1, rotation: 0 },
    { kind: 'paintZone', zone: RES_LOW, tiles: rows(x0, z0 + 3, 16, 2) },
    { kind: 'paintZone', zone: RES_LOW + 4, tiles: rows(x0 + 16, z0 + 3, 16, 2) },
    { kind: 'paintZone', zone: RES_LOW + 2, tiles: rows(x0 + 6, z0, 26, 2) },
  ]);
  await runUp(
    page,
    (want) => window.__slimcity.readBuildings().length >= want,
    TOWN_BUILDINGS,
    120000,
  );
  await page.evaluate((t) => {
    window.__slimcity.setDirectRender(false);
    window.__slimcity.pinWaterClock(t);
  }, WAVE_CLOCK_S);
  await settle(page, { timeout: 20000 });

  return {
    beach,
    sea,
    mouth,
    inland,
    mid,
    lake,
    spawn: grid.spawn,
    town: { x: x0 + 16, z: z0 + 3 },
    bridge: mid2,
    along: { x: cx, z: cz },
    waterTiles,
    siteDistance: site.distance,
  };
}

const at = (key) => (s) => ({ tx: s[key].x, tz: s[key].z });

export default defineSeries({
  name: 'coast',
  type: 'views',
  purpose:
    'The new coast map reads as a coast: a beach that slopes into the sea, a river that holds its width to a clean mouth in a valley with level banks, a lake cut by nothing, a street that bridges the river, and room beside the spawn for a town; and six seeds laid side by side differ in which edge is sea and how the river winds.',
  budgetS: 180,
  session: { bloom: true, generator: GENERATOR, seed: SEED },
  subjects: [
    { id: 'beach' },
    { id: 'mouth' },
    { id: 'valley' },
    { id: 'lake' },
    { id: 'map' },
    { id: 'bridge' },
    { id: 'town' },
  ],
  scene,
  frames: [
    {
      subject: 'beach',
      view: 'above',
      shows: 'the coast from above: the shoreline, the beach plain and the sea bed shelving away',
      camera: (s) => ({ ...at('beach')(s), distance: 700, yaw: 0, pitch: 1.45 }),
    },
    {
      subject: 'beach',
      view: 'along',
      shows: 'the beach low, looking out to sea: the plain rises gently and is no wall',
      camera: (s) => ({
        ...at('beach')(s),
        distance: 260,
        yaw: yawToward(s.sea.x - s.beach.x, s.sea.z - s.beach.z),
        pitch: 0.3,
      }),
    },
    {
      subject: 'mouth',
      view: 'above',
      shows: 'the river meeting the sea from above: one channel, no pinch, no bar across it',
      camera: (s) => ({ ...at('mouth')(s), distance: 420, yaw: 0, pitch: 1.45 }),
    },
    {
      subject: 'mouth',
      view: 'oblique',
      shows: 'the mouth from the sea looking up the river: the channel and its banks',
      camera: (s) => ({
        ...at('mouth')(s),
        distance: 380,
        yaw: yawToward(s.inland.x, s.inland.z),
        pitch: 0.5,
      }),
    },
    {
      subject: 'valley',
      view: 'above',
      shows: 'the river valley mid-map from above: the channel, level banks, the hills beyond',
      camera: (s) => ({ ...at('mid')(s), distance: 800, yaw: 0, pitch: 1.45 }),
    },
    {
      subject: 'valley',
      view: 'oblique',
      shows: 'the valley from an angle: the banks rise to the hills with no cliff',
      camera: (s) => ({ ...at('mid')(s), distance: 520, yaw: 0.8, pitch: 0.55 }),
    },
    {
      subject: 'lake',
      view: 'above',
      shows: 'the largest inland lake from above: whole, with a shore all round',
      camera: (s) => ({ ...at('lake')(s), distance: 800, yaw: 0, pitch: 1.45 }),
    },
    {
      subject: 'lake',
      view: 'oblique',
      shows: 'the lake from an angle: the banks meet the water without a wall',
      camera: (s) => ({ ...at('lake')(s), distance: 600, yaw: 0.8, pitch: 0.55 }),
    },
    {
      subject: 'map',
      view: 'above',
      shows:
        'the map from the highest view the camera has: the sea, the river and the hills round the middle',
      camera: () => ({ tx: 128, tz: 128, distance: 2400, yaw: 0, pitch: 1.45 }),
    },
    {
      subject: 'map',
      view: 'full',
      shows:
        'six seeds side by side drawn from the generator, heights shaded, water blue, steep ground red, the start a white dot',
      full: true,
      setup: (session) => drawOverview(session, OVERVIEW_SEEDS),
      after: (session) =>
        session.page.evaluate(() => document.getElementById('shots-overview')?.remove()),
    },
    {
      subject: 'bridge',
      view: 'above',
      shows: 'a two-lane street laid across the river in one drag: ramps, deck and piers',
      camera: (s) => ({ ...at('bridge')(s), distance: 300, yaw: 0, pitch: 1.45 }),
    },
    {
      subject: 'bridge',
      view: 'along',
      shows: 'the bridge from the road, low: the deck level over the water, ramps either side',
      camera: (s) => ({
        ...at('bridge')(s),
        distance: 220,
        yaw: yawToward(s.along.x, s.along.z),
        pitch: 0.25,
      }),
    },
    {
      subject: 'bridge',
      view: 'oblique',
      shows: 'the bridge from a three-quarter view',
      camera: (s) => ({ ...at('bridge')(s), distance: 260, yaw: 0.7, pitch: 0.5 }),
    },
    {
      subject: 'town',
      view: 'above',
      shows:
        'the first town grown beside the start: homes, shops and works on a street, on the start bank',
      camera: (s) => ({ ...at('town')(s), distance: 380, yaw: 0, pitch: 1.45 }),
    },
    {
      subject: 'town',
      view: 'oblique',
      shows: 'the first town at an angle, with the valley and river beyond if they are near',
      camera: (s) => ({ ...at('town')(s), distance: 420, yaw: 0.7, pitch: 0.55 }),
    },
  ],
});
