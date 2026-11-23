import { fileURLToPath } from 'node:url';
import { defineSeries } from '../../lib/series.mjs';
import { settle } from '../../lib/session.mjs';
import { buildSite } from '../../lib/site.mjs';
import {
  BODY_BAND,
  GROUND_BAND,
  bandProblem,
  lightRatio,
  luma,
  noonProblem,
  readPng,
  sample,
  show,
} from '../../lib/nightread.mjs';

const OUT = fileURLToPath(new URL('../../out/night/', import.meta.url));
const NOON = 0.5;
const THREE_AM = 3 / 24;

/** A lit pane's brightest channel must stay under this: warm, never white. */
const PANE_CLIP = 250;
const PANE_LIT_MIN = 120;

/** The street: a turbine powers the lamps, then colonials, then shops. */
const ROW = [
  ['turbine', 'wind-turbine'],
  ['house-a', 'res-normal-3'],
  ['house-b', 'res-normal-3'],
  ['house-c', 'res-normal-3'],
  ['shop-a', 'com-low-1'],
  ['shop-b', 'com-low-1'],
  ['shop-c', 'com-low-1'],
];

/** The second colonial and the second shop, head-on from the street at the camera's floor
 * distance: the left tile of the front row is the target. */
const faceOf = (s, name) => {
  const b = s.site.subjects.find((k) => k.name === name);
  return { tx: b.x, tz: b.z + b.d - 1, distance: 40, yaw: 0, pitch: 0.35 };
};

/** Sample boxes, pixels of the 1280 x 800 frame at each pinned camera. */
const BOXES = {
  house: {
    // Upper-floor siding between the second and third bays' shutters, clear of the fascia and the porch roof.
    wall: { x: 635, y: 340, w: 9, h: 16, band: BODY_BAND },
    // A shutter of the second bay: a kit part, so it carries the tint the facade does.
    shutter: { x: 571, y: 340, w: 14, h: 16, band: BODY_BAND },
    roof: { x: 640, y: 290, w: 24, h: 12, band: BODY_BAND },
    // The front lawn left of the path, and the street in front of the house.
    lawn: { x: 290, y: 555, w: 20, h: 10, band: GROUND_BAND },
    road: { x: 620, y: 660, w: 40, h: 10, band: GROUND_BAND },
  },
  shop: {
    // The wall band over the left awning, beside the sign band.
    wall: { x: 450, y: 360, w: 20, h: 10, band: BODY_BAND },
    lawn: { x: 300, y: 540, w: 20, h: 10, band: GROUND_BAND },
  },
};

const noon = {};

/** Read the frame just written: its noon colours, or its night light against them. */
const measure = (kind, hour) => async () => {
  const png = readPng(`${OUT}${kind}-${hour}.png`);
  const problems = [];
  for (const [key, box] of Object.entries(BOXES[kind])) {
    const at = sample(png, box);
    if (hour === 'noon') {
      const bad = noonProblem(at);
      if (bad) problems.push(`${kind}.${key}: the noon box ${bad}`);
      noon[`${kind}.${key}`] = at;
    } else {
      const ratio = lightRatio(at, noon[`${kind}.${key}`]);
      console.log(
        `${kind}.${key}: noon ${show(noon[`${kind}.${key}`])} 03:00 ${show(at)} light ${ratio.toFixed(3)}`,
      );
      const bad = bandProblem(ratio, box.band);
      if (bad) problems.push(`${kind}.${key}: 03:00 ${bad}`);
    }
  }
  if (problems.length > 0) throw new Error(problems.join('; '));
};

/** The lit panes of the house at night, read back: lit, warm and not clipped. */
const panesProblems = () => {
  const png = readPng(`${OUT}house-night.png`);
  const band = { x: 420, y: 330, w: 440, h: 180 };
  let lit = 0;
  let clipped = 0;
  let cold = 0;
  for (let y = band.y; y < band.y + band.h; y++) {
    for (let x = band.x; x < band.x + band.w; x++) {
      const [r, g, b] = png.at(x, y);
      const m = Math.max(r, g, b);
      if (m < PANE_LIT_MIN) continue;
      lit++;
      if (m >= PANE_CLIP) clipped++;
      if (r <= b) cold++;
    }
  }
  console.log(`panes: ${lit} lit pixels, ${clipped} clipped, ${cold} not warm`);
  return [
    lit === 0 && 'no lit pane found on the house at 03:00',
    clipped > 0 && `${clipped} lit pane pixels clip at ${PANE_CLIP} or more`,
    cold > lit * 0.25 && `${cold} of ${lit} lit pane pixels are not warm (R <= B)`,
  ].filter(Boolean);
};

const pin = (t) => async (session) => {
  await session.pinDay(t);
  await settle(session.page);
};

export default defineSeries({
  name: 'night',
  type: 'views',
  purpose:
    'A street reads as a street at night: a colonial and a shop keep a shaded version of their day colour from the same camera at noon and at 03:00, the lawn and road a little darker, and the windows glow warm without going white.',
  budgetS: 40,
  subjects: [{ id: 'house' }, { id: 'shop' }, { id: 'street' }],
  scene: async (session, { tile, catalogBox }) => {
    const site = await buildSite(
      session,
      ROW.map(([as, id]) => catalogBox({ id, as })),
      tile,
    );
    return { site };
  },
  frames: [
    {
      subject: 'house',
      view: 'noon',
      shows:
        'the second colonial head-on at noon: the reference every night reading is taken against',
      camera: (s) => faceOf(s, 'house-b'),
      after: measure('house', 'noon'),
    },
    {
      subject: 'shop',
      view: 'noon',
      shows: 'the second shop head-on at noon',
      camera: (s) => faceOf(s, 'shop-b'),
      after: measure('shop', 'noon'),
    },
    {
      subject: 'house',
      view: 'night',
      shows:
        'the same colonial at 03:00: walls, shutters and roof a shaded version of noon, lit windows warm',
      setup: pin(THREE_AM),
      camera: (s) => faceOf(s, 'house-b'),
      after: async (session) => {
        await measure('house', 'night')();
        const problems = panesProblems();
        if (problems.length > 0) throw new Error(problems.join('; '));
      },
    },
    {
      subject: 'shop',
      view: 'night',
      shows: 'the same shop at 03:00: its wall a shaded version of noon, not black',
      camera: (s) => faceOf(s, 'shop-b'),
      after: measure('shop', 'night'),
    },
    {
      subject: 'street',
      view: 'night',
      shows: 'the whole street at 03:00: lamps lit, windows warm, every building still legible',
      camera: (s) => {
        const homes = s.site.subjects.filter((k) => k.name.startsWith('house'));
        const mid = homes[1];
        return { tx: mid.cx, tz: mid.z + mid.d - 1, distance: 120, yaw: 0.3, pitch: 0.7 };
      },
    },
    {
      subject: 'street',
      view: 'noon',
      shows: 'the same street at noon, for comparison',
      setup: pin(NOON),
      camera: (s) => {
        const mid = s.site.subjects.find((k) => k.name === 'house-b');
        return { tx: mid.cx, tz: mid.z + mid.d - 1, distance: 120, yaw: 0.3, pitch: 0.7 };
      },
    },
  ],
});
void luma;
