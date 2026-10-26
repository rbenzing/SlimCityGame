/** The night look, measured: a street of colonials and a street of shops shot
 * from one pinned camera at noon and at 03:00, then read back pixel by pixel.
 * A body (a house wall, a shutter, a shop wall, a house roof) at night must
 * read at 18–30% of its noon value — a shaded version of its day colour, not
 * black and not an afternoon — the ground (a lawn, the road) at 12–25%, and a
 * lit pane must stay warm (red above blue) and unclipped (no channel at
 * 250 or more). The ratios are of the light on the surface — the display
 * pixel taken back through sRGB and the tone mapping's toe, which otherwise
 * spreads one share across display values by how dark the surface is — and
 * are read with bloom off, so they measure the material and the night light
 * alone; the panes are also read with bloom on,
 * the way the player sees them, and must still not clip. The exit code is 1
 * when any reading is outside its band.
 *
 * The sample boxes are pixel rectangles on the pinned camera; each noon
 * reading is checked against what the box should hold (a sunlit wall, a roof,
 * a pane) so a camera that drifted fails loudly instead of measuring sky.
 *
 * Usage: node tools/nightlook-shots.mjs [baseUrl] [outDir]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { closeUp, hooksReady, tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'tools/shots-nightlook';
mkdirSync(out, { recursive: true });

const SEED = 7;
const HOMES = 4;
const STREET_ROWS = 7;
const NOON = 0.5;
const THREE_AM = 3 / 24;
const MIDNIGHT = 0;

/** A body at night against the same pixel at noon. */
const BODY_RATIO_MIN = 0.18;
const BODY_RATIO_MAX = 0.3;
/** The ground at night against the same pixel at noon: no brighter than the bodies on it. */
const GROUND_RATIO_MIN = 0.12;
const GROUND_RATIO_MAX = 0.25;
const BAND = {
  body: [BODY_RATIO_MIN, BODY_RATIO_MAX],
  ground: [GROUND_RATIO_MIN, GROUND_RATIO_MAX],
};
/** A lit pane's brightest channel must stay under this: warm, never white. */
const PANE_CLIP = 250;
/** A pane is lit when its brightest channel reaches this at night. */
const PANE_LIT_MIN = 120;

// ---------------------------------------------------------------------------
// A PNG reader for Playwright's screenshots: 8-bit RGB or RGBA, no interlace.
// ---------------------------------------------------------------------------
function readPng(path) {
  const buf = readFileSync(path);
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8) throw new Error(`png: ${data[8]}-bit depth unsupported`);
      colorType = data[9];
      if (data[12] !== 0) throw new Error('png: interlaced screenshots unsupported');
    } else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const channels = { 2: 3, 6: 4 }[colorType];
  if (!channels) throw new Error(`png: colour type ${colorType} unsupported`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i];
      const a = i >= channels ? pixels[dst + i - channels] : 0;
      const b = y > 0 ? pixels[dst - stride + i] : 0;
      const c = y > 0 && i >= channels ? pixels[dst - stride + i - channels] : 0;
      let v;
      if (filter === 0) v = x;
      else if (filter === 1) v = x + a;
      else if (filter === 2) v = x + b;
      else if (filter === 3) v = x + ((a + b) >> 1);
      else {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      pixels[dst + i] = v & 0xff;
    }
  }
  return {
    width,
    height,
    at(x, y) {
      const i = y * stride + x * channels;
      return [pixels[i], pixels[i + 1], pixels[i + 2]];
    },
  };
}

/** Mean colour and brightest channel over a pixel box. */
function sample(png, box) {
  const sum = [0, 0, 0];
  let n = 0;
  let max = 0;
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      const [r, g, b] = png.at(x, y);
      sum[0] += r;
      sum[1] += g;
      sum[2] += b;
      max = Math.max(max, r, g, b);
      n++;
    }
  }
  return { r: sum[0] / n, g: sum[1] / n, b: sum[2] / n, max };
}
const luma = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const show = (c) => `(${c.r.toFixed(0)},${c.g.toFixed(0)},${c.b.toFixed(0)})`;

// ---------------------------------------------------------------------------
// From the display pixel back to the light on the surface. The renderer
// writes sRGB through the neutral tone mapping, whose toe (for a pixel whose
// darkest channel is under 0.08 linear, every channel loses `m - 6.25 m²`)
// crushes a dark surface's night value far more than a bright one's: one and
// the same share of noon light reads 6% on a navy wall and 26% on a lawn.
// The bands are on the light, so the ratio is taken here, after undoing both.
// ---------------------------------------------------------------------------
const srgbToLinear = (v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
function toLight(c) {
  const out = [srgbToLinear(c.r), srgbToLinear(c.g), srgbToLinear(c.b)];
  const darkest = Math.min(...out);
  // The toe maps the darkest channel m to 6.25 m² (m < 0.08); above it the offset is a flat 0.04.
  const m = darkest < 6.25 * 0.08 * 0.08 ? Math.sqrt(darkest / 6.25) : null;
  const offset = m === null ? 0.04 : m - 6.25 * m * m;
  const [r, g, b] = out.map((v) => v + offset);
  return { r, g, b };
}
/** The share of noon light a surface keeps: luminance of the light, night over noon. */
const lightRatio = (night, noon) => luma(toLight(night)) / luma(toLight(noon));

// ---------------------------------------------------------------------------
// The town: a street of colonials over a street of shops, powered by a turbine.
// ---------------------------------------------------------------------------
const STREETS = [
  { name: 'houses', ids: ['res-normal-3'], depth: 2 },
  { name: 'shops', ids: ['com-low-1'], depth: 1 },
];

async function openTown(bloom) {
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
  await page.goto(base + (bloom ? '' : '?nobloom'), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#viewport canvas', { timeout: 60000 });
  await hooksReady(page);
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
  const flatDry = (x, z, h0) =>
    x >= 0 &&
    z >= 0 &&
    x < N &&
    z < N &&
    !g.water[idx(x, z)] &&
    Math.abs(g.height[idx(x, z)] - h0) <= 6;
  const rowsNeeded = STREETS.length * STREET_ROWS;
  let anchor = null;
  for (let z = 20; z < N - rowsNeeded - 10 && !anchor; z++) {
    for (let x = 20; x < N - 40 && !anchor; x++) {
      const h0 = g.height[idx(x, z)];
      let ok = true;
      for (let dz = -3; dz < rowsNeeded && ok; dz++) {
        for (let dx = -2; dx < HOMES + 6 && ok; dx++) if (!flatDry(x + dx, z + dz, h0)) ok = false;
      }
      if (ok) anchor = { x, z };
    }
  }
  if (!anchor) throw new Error('no flat dry ground for the streets');
  const { x: X, z: Z0 } = anchor;
  const roadRow = (s) => Z0 + 2 + s * STREET_ROWS;
  for (const [s] of STREETS.entries()) {
    await send('Street', [
      {
        kind: 'buildRoad',
        tier: 1,
        tiles: Array.from({ length: HOMES + 6 }, (_, i) => ({ x: X - 2 + i, z: roadRow(s) })),
      },
    ]);
  }
  // The turbine at the east end of the first street powers both: lamps stand only on a powered street.
  await send('Power', [
    {
      kind: 'placeBuilding',
      catalogId: 'wind-turbine',
      x: X + HOMES + 2,
      z: roadRow(0) - 1,
      rotation: 0,
    },
  ]);
  // Each building fronts its street: its lot's far row is one tile short of the road.
  for (const [s, street] of STREETS.entries()) {
    for (let i = 0; i < HOMES; i++) {
      await send('Building', [
        {
          kind: 'placeBuilding',
          catalogId: street.ids[i % street.ids.length],
          x: X + i,
          z: roadRow(s) - street.depth,
          rotation: 0,
        },
      ]);
    }
  }
  await page.waitForTimeout(3000);
  const standing = await page.evaluate(() => window.__slimcity.readBuildings());
  const counts = standing.reduce(
    (m, b) => ((m[`${b.catalogId}:${b.state}`] = (m[`${b.catalogId}:${b.state}`] ?? 0) + 1), m),
    {},
  );
  console.log(`standing (bloom ${bloom ? 'on' : 'off'})`, JSON.stringify(counts));

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
  const cam = tileCamera(page);
  const shoot = async (name, tx, tz, distance, yaw, pitch) => {
    await cam(tx, tz, distance, yaw, pitch);
    await page.waitForTimeout(1200);
    const path = `${out}/${name}.png`;
    await page.screenshot({ path });
    return path;
  };
  const lamps = () => page.evaluate(() => window.__slimcity.readLampPoles().length);
  return { browser, page, X, roadRow, setPhase, shoot, lamps };
}

// ---------------------------------------------------------------------------
// The sample boxes, in pixels of the 1280 x 800 frame at each pinned camera.
// ---------------------------------------------------------------------------
/** The second colonial, head-on from its street at the camera's floor distance. */
const HOUSE_VIEW = { distance: 40, yaw: 0, pitch: 0.35 };
const HOUSE_BOXES = {
  // Upper-floor siding between the second and third bays' shutters, clear of the fascia and the porch roof.
  wall: { x: 635, y: 340, w: 9, h: 16, expect: 'wall', band: 'body' },
  // A shutter of the second bay: a kit part, so it carries the tint the facade does.
  shutter: { x: 571, y: 340, w: 14, h: 16, expect: 'shutter', band: 'body' },
  roof: { x: 640, y: 290, w: 24, h: 12, expect: 'roof', band: 'body' },
  // The front lawn left of the path, and the street in front of the house.
  lawn: { x: 290, y: 555, w: 20, h: 10, expect: 'lawn', band: 'ground' },
  road: { x: 620, y: 660, w: 40, h: 10, expect: 'road', band: 'ground' },
};
/** The second shop, the same way. */
const SHOP_VIEW = { distance: 40, yaw: 0, pitch: 0.35 };
const SHOP_BOXES = {
  // The wall band over the left awning, beside the sign band.
  wall: { x: 450, y: 360, w: 20, h: 10, expect: 'wall', band: 'body' },
  // The lawn beside the shop's path.
  lawn: { x: 300, y: 540, w: 20, h: 10, expect: 'lawn', band: 'ground' },
};

/** A noon reading must be what its box claims — a body, neither black nor the sky — so a drifted camera fails here, not in a ratio. */
function checkNoon(label, box, noon) {
  const l = luma(noon);
  if (l < 20 || l > 180) {
    return `${label}: the noon ${box.expect} box reads ${show(noon)}, not a body in daylight`;
  }
  return null;
}

const failures = [];
const report = (line) => console.log(line);

// --- bloom off: the material and the night light alone ----------------------
{
  const town = await openTown(false);
  try {
    report(`lamp poles standing: ${await town.lamps()}`);
    const views = [
      {
        name: 'house',
        tx: town.X + 1,
        tz: town.roadRow(0) - 1,
        view: HOUSE_VIEW,
        boxes: HOUSE_BOXES,
      },
      { name: 'shop', tx: town.X + 1, tz: town.roadRow(1) - 1, view: SHOP_VIEW, boxes: SHOP_BOXES },
    ];
    const shots = {};
    for (const [phase, tag] of [
      [NOON, 'noon'],
      [THREE_AM, '0300'],
      [MIDNIGHT, '0000'],
    ]) {
      await town.setPhase(phase);
      for (const v of views) {
        const { distance, yaw, pitch } = v.view;
        shots[`${v.name}-${tag}`] = await town.shoot(
          `${v.name}-${tag}`,
          v.tx,
          v.tz,
          distance,
          yaw,
          pitch,
        );
      }
    }
    for (const v of views) {
      const noon = readPng(shots[`${v.name}-noon`]);
      const night = readPng(shots[`${v.name}-0300`]);
      const midnight = readPng(shots[`${v.name}-0000`]);
      for (const [key, box] of Object.entries(v.boxes)) {
        const day = sample(noon, box);
        const bad = checkNoon(`${v.name}.${key}`, box, day);
        if (bad) {
          failures.push(bad);
          continue;
        }
        const at3 = sample(night, box);
        const at0 = sample(midnight, box);
        const ratio3 = lightRatio(at3, day);
        const ratio0 = lightRatio(at0, day);
        const shown = (luma(at3) / luma(day)).toFixed(2);
        report(
          `${v.name}.${key}: noon ${show(day)} 03:00 ${show(at3)} light ${ratio3.toFixed(3)} (pixel ${shown}) | 00:00 ${show(at0)} light ${ratio0.toFixed(3)}`,
        );
        const [lo, hi] = BAND[box.band];
        if (ratio3 < lo || ratio3 > hi) {
          failures.push(
            `${v.name}.${key}: 03:00 reads ${(ratio3 * 100).toFixed(0)}% of noon; the ${box.band} band is ${lo * 100}–${hi * 100}%`,
          );
        }
      }
    }
  } finally {
    await town.browser.close();
  }
}

// --- bloom on: the panes as the player sees them -----------------------------
{
  const town = await openTown(true);
  try {
    await town.setPhase(THREE_AM);
    const path = await town.shoot(
      'house-0300-bloom',
      town.X + 1,
      town.roadRow(0) - 1,
      HOUSE_VIEW.distance,
      HOUSE_VIEW.yaw,
      HOUSE_VIEW.pitch,
    );
    const png = readPng(path);
    // The lit panes are wherever the hash put them: scan the house's wall
    // band for the brightest pixels and judge each pane by its own colour.
    const band = { x: 420, y: 330, w: 440, h: 180 };
    let lit = 0;
    let clipped = 0;
    let cold = 0;
    let brightest = [0, 0, 0];
    for (let y = band.y; y < band.y + band.h; y++) {
      for (let x = band.x; x < band.x + band.w; x++) {
        const [r, g, b] = png.at(x, y);
        const m = Math.max(r, g, b);
        if (m < PANE_LIT_MIN) continue;
        lit++;
        if (m >= PANE_CLIP) clipped++;
        if (r <= b) cold++;
        if (m > Math.max(...brightest)) brightest = [r, g, b];
      }
    }
    report(
      `panes (bloom on): ${lit} lit pixels, ${clipped} clipped, ${cold} not warm; brightest (${brightest.join(',')})`,
    );
    if (lit === 0) failures.push('no lit pane found on the house at 03:00');
    if (clipped > 0) failures.push(`${clipped} lit pane pixels clip at ${PANE_CLIP} or more`);
    if (cold > lit * 0.25) failures.push(`${cold} of ${lit} lit pane pixels are not warm (R <= B)`);
    const restore = await closeUp(town.page, 2);
    await town.shoot(
      'house-0300-bloom-close',
      town.X + 1,
      town.roadRow(0) - 1,
      HOUSE_VIEW.distance,
      HOUSE_VIEW.yaw,
      HOUSE_VIEW.pitch,
    );
    await restore();
    await town.shoot('street-0300-bloom', town.X + HOMES / 2, town.roadRow(0) - 1, 70, 0.3, 0.7);
  } finally {
    await town.browser.close();
  }
}

if (failures.length) {
  console.log('\nFAIL');
  for (const f of failures) console.log(' - ' + f);
  process.exit(1);
}
console.log('\nOK');
