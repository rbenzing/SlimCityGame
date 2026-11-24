import { defineSeries } from '../../lib/series.mjs';
import { settle } from '../../lib/session.mjs';

/** WaterKind values (src/shared/waterbodies.ts). */
const OCEAN = 1;
const LAKE = 2;
const RIVER = 3;
/** The 22:00 the standard's night frame is taken at, as a share of the day. */
const NIGHT = 22 / 24;
/**
 * A morning sun about 30 degrees up, and the camera yaw that looks toward it
 * (sunDirection in src/render/sun.ts: east with a small tilt; the camera looks
 * along -sin(yaw), -cos(yaw)).
 */
const LOW_SUN = 0.34;
const LOW_SUN_YAW = -1.747;
/** The wave clock every frame is taken at, seconds, so a run repeats. */
const WAVE_CLOCK_S = 20;
/** Seconds between the two frames of a river drift pair and of a lake gust pair. */
const DRIFT_GAP_S = 2;
const GUST_GAP_S = 10;
/** Canal: three tiles wide and its floor, metres below sea level. */
const CANAL_WIDTH = 3;
const CANAL_FLOOR = -3;
/** Land this close above sea level is beach (SAND_BAND_METERS in src/shared/constants.ts). */
const SAND_BAND = 3;

const tilesOf = (b, kind) => {
  const out = [];
  for (let i = 0; i < b.kind.length; i++) if (b.kind[i] === kind) out.push(i);
  return out;
};

/** The 4-connected run of tiles of one kind that holds tile `start`. */
function runOf(b, start) {
  const n = b.size;
  const kind = b.kind[start];
  const seen = new Set([start]);
  const list = [start];
  for (let h = 0; h < list.length; h++) {
    const i = list[h];
    const x = i % n;
    const z = (i - x) / n;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
      const j = nz * n + nx;
      if (b.kind[j] === kind && !seen.has(j)) {
        seen.add(j);
        list.push(j);
      }
    }
  }
  return list;
}

/** The tile of `list` nearest its own centroid, as { x, z }. */
function centre(list, n) {
  const xs = list.map((i) => i % n);
  const zs = list.map((i) => Math.floor(i / n));
  const cx = xs.reduce((a, v) => a + v, 0) / list.length;
  const cz = zs.reduce((a, v) => a + v, 0) / list.length;
  let best = 0;
  for (let k = 1; k < list.length; k++)
    if (Math.hypot(xs[k] - cx, zs[k] - cz) < Math.hypot(xs[best] - cx, zs[best] - cz)) best = k;
  return { x: xs[best], z: zs[best] };
}

const readBodies = (page) => page.evaluate(() => window.__slimcity.readWaterBodies());

/** Dig a canal from the largest lake to the nearest ocean the swell reaches, an L of rectangles. */
async function digCanal(session, b) {
  const n = b.size;
  const lakes = tilesOf(b, LAKE).map((i) => runOf(b, i));
  const lake = lakes.reduce((a, l) => (l.length > a.length ? l : a), []);
  const swelled = tilesOf(b, OCEAN).filter((i) => b.swellAmp[i] > 0.5);
  if (lake.length === 0 || swelled.length === 0) throw new Error('the map has no lake and ocean');
  let best = null;
  for (const l of lake) {
    for (const o of swelled) {
      const d = Math.abs((l % n) - (o % n)) + Math.abs(Math.floor(l / n) - Math.floor(o / n));
      if (!best || d < best.d) best = { d, l, o };
    }
  }
  const from = { x: best.l % n, z: Math.floor(best.l / n) };
  const to = { x: best.o % n, z: Math.floor(best.o / n) };
  const half = Math.floor(CANAL_WIDTH / 2);
  const x0 = Math.min(from.x, to.x) - half;
  const x1 = Math.max(from.x, to.x) + half;
  const z0 = Math.min(from.z, to.z);
  const z1 = Math.max(from.z, to.z);
  // East-west leg along the lake's row, then the leg along the ocean's column.
  const legs = [
    { x: x0, z: from.z - half, w: x1 - x0 + 1, h: CANAL_WIDTH },
    { x: to.x - half, z: z0, w: CANAL_WIDTH, h: z1 - z0 + 1 },
  ];
  for (const leg of legs) {
    await session.page.evaluate(
      ([l, floor]) =>
        window.__slimcity.cmd('Canal', [
          {
            kind: 'terraformSet',
            x: l.x,
            z: l.z,
            w: l.w,
            h: l.h,
            heights: new Float32Array(l.w * l.h).fill(floor),
          },
        ]),
      [leg, CANAL_FLOOR],
    );
  }
}

async function scene(session) {
  const { page } = session;
  let b = await readBodies(page);
  const n = b.size;
  if (tilesOf(b, RIVER).length === 0) {
    await digCanal(session, b);
    // The surface re-derives its kinds once the edits have stopped for half a second of frames.
    await settle(page, {
      until: () => window.__slimcity.readWaterBodies().kind.includes(3),
      timeout: 30000,
    });
    b = await readBodies(page);
  }
  const river = tilesOf(b, RIVER);
  if (river.length === 0) throw new Error('no river on the map and the canal did not become one');
  const riverRun = runOf(b, river[0]);

  // The river's mouth: a river tile with an ocean tile beside it, else any open water.
  const beside = (i, kind) => {
    const x = i % n;
    const z = (i - x) / n;
    return [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].some(([dx, dz]) => b.kind[(z + dz) * n + x + dx] === kind);
  };
  const mouthTile = riverRun.find((i) => beside(i, OCEAN)) ?? riverRun.find((i) => beside(i, LAKE));
  const mouth = { x: mouthTile % n, z: Math.floor(mouthTile / n) };

  // The river's straightest stretch: the run's tile with the most river tiles in a line on both sides.
  const lineLength = (i) => {
    const x = i % n;
    const z = (i - x) / n;
    let best = 0;
    for (const [dx, dz] of [
      [1, 0],
      [0, 1],
    ]) {
      let len = 1;
      for (const s of [1, -1])
        for (let k = 1; b.kind[(z + dz * k * s) * n + x + dx * k * s] === RIVER; k++) len++;
      best = Math.max(best, len);
    }
    return best;
  };
  const straight = riverRun.reduce((a, i) => (lineLength(i) > lineLength(a) ? i : a), riverRun[0]);
  const reach = { x: straight % n, z: Math.floor(straight / n) };

  const lakes = tilesOf(b, LAKE).map((i) => runOf(b, i));
  const bigLake = lakes.reduce((a, l) => (l.length > a.length ? l : a), []);
  const oceanTile = tilesOf(b, OCEAN)
    .filter((i) => b.swellAmp[i] > 0.5)
    .reduce((a, i) => {
      const d = (k) => Math.hypot((k % n) - mouth.x, Math.floor(k / n) - mouth.z);
      return a === null || d(i) < d(a) ? i : a;
    }, null);

  // The widest sandy shore of the swelled ocean: the beach tile (dry land within
  // the sand band of the sea) with the most beach tiles in a 15 x 15 window.
  const grid = await page.evaluate(() => {
    const g = window.__slimcity.readGrid();
    return { height: g.height, water: g.water };
  });
  const isBeach = (x, z) => {
    const i = z * n + x;
    return grid.water[i] === 0 && grid.height[i] > 0 && grid.height[i] <= SAND_BAND;
  };
  const onSwelledShore = (x, z) =>
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].some(([dx, dz]) => {
      const j = (z + dz) * n + x + dx;
      return b.kind[j] === OCEAN && b.swellAmp[j] > 0.5;
    });
  let beach = null;
  let beachCount = 0;
  const win = 7;
  for (let z = win; z < n - win; z++) {
    for (let x = win; x < n - win; x++) {
      if (!isBeach(x, z) || !onSwelledShore(x, z)) continue;
      let count = 0;
      for (let dz = -win; dz <= win; dz++)
        for (let dx = -win; dx <= win; dx++) if (isBeach(x + dx, z + dz)) count++;
      if (count > beachCount) {
        beachCount = count;
        beach = { x, z };
      }
    }
  }
  if (!beach) throw new Error('the swelled ocean has no sandy shore');

  return {
    beach,
    beachCount,
    ocean: centre(runOf(b, oceanTile), n),
    lake: centre(bigLake, n),
    river: centre(riverRun, n),
    reach,
    mouth,
    lakeSize: bigLake.length,
    riverSize: riverRun.length,
  };
}

/** The wave clock held at a fixed time before the frame, and the day at noon. */
const pinned =
  (extra, clock = WAVE_CLOCK_S) =>
  async (session, s) => {
    await session.page.evaluate((t) => {
      window.__slimcity.setDirectRender(false);
      window.__slimcity.pinWaterClock(t);
    }, clock);
    if (extra) await extra(session, s);
  };

/** The frames of one subject: from above, oblique, and optionally one low and close. */
const frames = (subject, where, { above, oblique, close }) => [
  {
    subject,
    view: 'above',
    shows: above.shows,
    setup: pinned(),
    camera: (s) => ({ ...where(s), ...above.cam, yaw: 0, pitch: 1.45 }),
  },
  {
    subject,
    view: 'oblique',
    shows: oblique.shows,
    setup: pinned(),
    camera: (s) => ({ ...where(s), ...oblique.cam }),
  },
  ...(close
    ? [
        {
          subject,
          view: 'close',
          shows: close.shows,
          setup: pinned(),
          camera: (s) => ({ ...(close.where ?? where)(s), ...close.cam }),
        },
      ]
    : []),
];

const at = (key) => (s) => ({ tx: s[key].x, tz: s[key].z });

export default defineSeries({
  name: 'water',
  type: 'views',
  purpose:
    'The three kinds of water read as what they are: swell rolls in from the ocean edge and dies behind land, a lake is calmer upwind than downwind, a river drifts toward its outlet and is still at its banks, and the surface meets every shore with no gap.',
  budgetS: 90,
  session: { bloom: true },
  subjects: [{ id: 'ocean' }, { id: 'lake' }, { id: 'river' }, { id: 'mouth' }],
  scene,
  frames: [
    ...frames('ocean', at('ocean'), {
      above: {
        cam: { distance: 520 },
        shows:
          'the ocean bay from above: swell crests run in from the map edge and fade behind land',
      },
      oblique: {
        cam: { distance: 380, yaw: 0.5, pitch: 0.5 },
        shows: 'the same swell at a slant: long smooth crests, a calm sheltered end, no flicker',
      },
      close: {
        cam: { distance: 90, yaw: 0.3, pitch: 0.28 },
        shows: 'the swell low and close: a surface that rolls, with the shore line unbroken',
      },
    }),
    ...frames('lake', at('lake'), {
      above: {
        cam: { distance: 520 },
        shows: 'the largest lake from above: small waves, calmer on the upwind shore',
      },
      oblique: {
        cam: { distance: 400, yaw: 0.6, pitch: 0.45 },
        shows: 'the lake at a slant: a rougher downwind side, no stripes or bands',
      },
    }),
    ...frames('river', at('river'), {
      above: {
        cam: { distance: 680 },
        shows: 'the river from above: its drift runs toward the outlet, still at the banks',
      },
      oblique: {
        cam: { distance: 480, yaw: 0.45, pitch: 0.5 },
        shows: 'the river at a slant: ripples carried downstream, a smooth surface otherwise',
      },
      close: {
        where: at('reach'),
        cam: { distance: 40, yaw: 0, pitch: 0.55 },
        shows: 'ripples 1.5 to 4 m long on a straight reach, drifting and fading at the banks',
      },
    }),
    ...frames('mouth', at('mouth'), {
      above: {
        cam: { distance: 240 },
        shows: 'where the river meets open water: ripples give way to swell, no gap at the join',
      },
      oblique: {
        cam: { distance: 200, yaw: 0.4, pitch: 0.5 },
        shows: 'the river mouth at a slant: one surface across the join, no seam',
      },
    }),
    {
      subject: 'ocean',
      view: 'beach-above',
      shows:
        'the widest sandy shore from above, 300 m across: swell fronts parallel to the beach, closer together as the water shoals',
      setup: pinned(),
      camera: (s) => ({ ...at('beach')(s), distance: 300, yaw: 0, pitch: 1.45 }),
    },
    {
      subject: 'ocean',
      view: 'beach-close',
      shows:
        'the shallows off the beach, 40 m across: the sand clear through the water, a moving net of light on it, a thin line of lapping at the waterline',
      setup: pinned(),
      camera: (s) => ({ ...at('beach')(s), distance: 45, yaw: 0.3, pitch: 1.1 }),
    },
    {
      subject: 'ocean',
      view: 'close-plain',
      shows:
        'the ocean low and close as in close, drawn straight to the screen with no pipeline, as after a failed post-process pass: the blended water sheet, with no bent bed',
      setup: async (session, s) => {
        await pinned()(session, s);
        await session.page.evaluate(() => window.__slimcity.setDirectRender(true));
        await settle(session.page);
      },
      camera: (s) => ({ ...at('ocean')(s), distance: 90, yaw: 0.3, pitch: 0.28 }),
    },
    {
      subject: 'ocean',
      view: 'beach-close-later',
      shows:
        'the shallows off the beach as in beach-close, 3.5 s on the water clock (half a breath): the lapping line is wider or narrower than it was',
      setup: pinned(undefined, WAVE_CLOCK_S + 3.5),
      camera: (s) => ({ ...at('beach')(s), distance: 45, yaw: 0.3, pitch: 1.1 }),
    },
    ...[
      ['a', WAVE_CLOCK_S],
      ['b', WAVE_CLOCK_S + DRIFT_GAP_S],
    ].map(([part, clock]) => ({
      subject: 'river',
      view: `drift-${part}`,
      shows:
        'a straight reach from above on the water clock, the same view two seconds apart: the foam streaks and ripples have moved downstream',
      setup: pinned(undefined, clock),
      camera: (s) => ({ ...at('reach')(s), distance: 70, yaw: 0, pitch: 1.45 }),
    })),
    ...[
      ['a', WAVE_CLOCK_S],
      ['b', WAVE_CLOCK_S + GUST_GAP_S],
    ].map(([part, clock]) => ({
      subject: 'lake',
      view: `gusts-${part}`,
      shows:
        'the largest lake from above on the water clock, the same view ten seconds apart: patches of ruffled and smooth water have drifted downwind',
      setup: pinned(undefined, clock),
      camera: (s) => ({ ...at('lake')(s), distance: 420, yaw: 0, pitch: 1.45 }),
    })),
    {
      subject: 'ocean',
      view: 'sun-oblique',
      shows:
        'the ocean looking toward a low sun: a track of glitter on the water toward the sun and none elsewhere',
      setup: async (session, s) => {
        await pinned()(session, s);
        await session.pinDay(LOW_SUN);
      },
      camera: (s) => ({ ...at('ocean')(s), distance: 300, yaw: LOW_SUN_YAW, pitch: 0.2 }),
    },
    {
      subject: 'ocean',
      view: 'night',
      shows:
        'the ocean bay at 22:00: lit by the night tint like the shore, glint at the moon, no flicker',
      setup: async (session, s) => {
        await pinned()(session, s);
        await session.pinDay(NIGHT);
      },
      camera: (s) => ({ ...at('ocean')(s), distance: 380, yaw: 0.5, pitch: 0.5 }),
    },
  ],
});
