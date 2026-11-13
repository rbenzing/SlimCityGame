/** Rail transit check (SPEC 26): lay track, plop stations on it, draw a rail
 * line between them, and report what the sim actually did — did the line route
 * over the track, does it carry riders, did the station refuse to sit where no
 * track reaches — then shoot the result.
 *
 * Usage: node tools/rail-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import {
  cleanShot,
  dismissToasts,
  readToasts,
  tileCamera,
  unlimitedMoneyOption,
} from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-rail';
mkdirSync(out, { recursive: true });

const RT = { TwoLane: 1, RailTrack: 11 };
/** Rows between the railway and the parallel street: the station's depth plus the track row. */
const STREET_ROW = 4;

const b = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.addInitScript(() => {
  try {
    sessionStorage.setItem(
      'slimcity.session',
      JSON.stringify({ screen: 'playing', seed: 12345, mode: 'new' }),
    );
  } catch (e) {
    void e;
  }
});
await unlimitedMoneyOption(page);
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#viewport canvas', { timeout: 20000 });
await page.waitForTimeout(4000);

const call = (fn, ...a) => page.evaluate(fn, ...a);
const cmd = (l, c) => call(([x, y]) => window.__slimcity.cmd(x, y), [l, c]);
const readGrid = () => call(() => window.__slimcity.readGrid());
const readBuildings = () => call(() => window.__slimcity.readBuildings());
const stats = () => call(() => window.__slimcity.getStats());
const setSpeed = (s) => call((x) => window.__slimcity.setSpeed(x), s);
const cam = tileCamera(page);

const g0 = await readGrid();
const N = g0.size;
const idx = (x, z) => z * N + x;

// A dry, flat-ish strip to build a railway across.
let anchor = null;
for (let z = 40; z < N - 40 && !anchor; z++) {
  for (let x = 40; x < N - 60; x++) {
    let ok = true;
    for (let k = 0; k < 40 && ok; k++) {
      for (let dz = -4; dz <= 4 && ok; dz++) {
        const i = idx(x + k, z + dz);
        if (g0.water[i] || Math.abs(g0.height[i]) > 22) ok = false;
      }
    }
    if (ok) {
      anchor = { x, z };
      break;
    }
  }
}
if (!anchor) {
  console.log('no dry strip found');
  await b.close();
  process.exit(1);
}
const { x: X, z: Z } = anchor;
console.log('anchor', JSON.stringify(anchor));

await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
await page.waitForTimeout(300);

// Track along row Z, a parallel street two rows south for the relief check.
const row = (z, tier, x0, x1) =>
  cmd('R', [
    {
      kind: 'buildRoad',
      tier,
      tiles: Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, z })),
    },
  ]);
await row(Z, RT.RailTrack, X, X + 36);
// The street runs along the stations' far edge: a station needs a street to
// open its drive onto as well as the track.
await row(Z + STREET_ROW, RT.TwoLane, X, X + 36);
await page.waitForTimeout(700);

// Stations: touching the track (should place) and well away from it (should not).
const place = (x, z) =>
  cmd('Station', [{ kind: 'placeBuilding', catalogId: 'rail-station', x, z, rotation: 0 }]);
await place(X + 6, Z + 1); // touches the track's south side
await place(X + 22, Z + 1);
await place(X + 15, Z + 12); // nowhere near track — must be refused
// With no depot nothing runs: a rail yard on the track's south side (its long
// side on the railway, a drive to the street) and a bus depot on the street's
// far kerb, with a turbine on the street for power.
const plop = (catalogId, x, z, rotation) =>
  cmd(catalogId, [{ kind: 'placeBuilding', catalogId, x, z, rotation }]);
await plop('wind-turbine', X + 34, Z + STREET_ROW - 1, 0);
await plop('rail-yard', X + 12, Z + 1, 1);
await plop('bus-depot', X + 6, Z + STREET_ROW + 1, 2);
await page.waitForTimeout(700);
console.log('toasts after placing:', JSON.stringify(await readToasts(page)));
// The third refusal is the check; it is not the subject of any shot.
await dismissToasts(page);

const buildings = await readBuildings();
const stations = buildings.filter((bl) => bl.catalogId === 'rail-station');
console.log('stations placed:', stations.length, stations.map((s) => `(${s.x},${s.z})`).join(' '));

// The rail line between the two stations.
await cmd('Rail line', [
  {
    kind: 'createTransitLine',
    line: {
      id: 0,
      color: 0x42a5f5,
      mode: 'rail',
      vehicles: 2,
      stops: [
        { x: X + 6, z: Z },
        { x: X + 22, z: Z },
      ],
    },
  },
]);
// A bus line on the parallel street, to prove both modes still work together.
for (const dx of [8, 20]) {
  await cmd('Stop', [
    { kind: 'placeStop', stop: { x: X + dx, z: Z + STREET_ROW, side: 0, kind: 'shelter' } },
  ]);
}
await cmd('Bus line', [
  {
    kind: 'createTransitLine',
    line: {
      id: 0,
      color: 0xef5350,
      vehicles: 2,
      stops: [
        { x: X + 8, z: Z + STREET_ROW },
        { x: X + 20, z: Z + STREET_ROW },
      ],
    },
  },
]);
await page.waitForTimeout(900);

await setSpeed(4);
await page.waitForTimeout(2500);
const dayTof = (t) => ((t + 900) % 2400) / 2400;
for (let i = 0; i < 500; i++) {
  const d = dayTof((await stats()).tick);
  if (d >= 0.47 && d <= 0.53) {
    await setSpeed(0);
    break;
  }
  await page.waitForTimeout(120);
}

const transit = await call(() => {
  const s = window.__slimcity.readTransit ? window.__slimcity.readTransit() : null;
  return s;
});
console.log('transit snapshot:', JSON.stringify(transit));

const shot = async (name, tx, tz, d, yaw, pitch) => {
  await cam(tx, tz, d, yaw, pitch);
  await page.waitForTimeout(900);
  await cleanShot(page, `${out}/${name}.png`);
  console.log('shot', name);
};

/** Where the train's cars show in a frame: pixel count and the horizontal span
 * of the navy the cars' roofs take from the line's blue. Trains are drawn
 * cosmetically on real time and no hook reports where they are, so the frame
 * itself is the only way to know one is in it, and whole. */
const trainPixels = async (png) =>
  page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    let x0 = c.width;
    let x1 = 0;
    // Skip the top 300 px (sky, lens panel, far ground) and the bottom bar.
    for (let y = 300; y < c.height - 110; y++) {
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        if (
          d[i + 2] > 40 &&
          d[i + 2] < 120 &&
          d[i + 2] > d[i] + 25 &&
          d[i + 1] < 70 &&
          d[i + 2] > d[i + 1] + 15
        ) {
          n++;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
        }
      }
    }
    return { n, x0, x1 };
  }, png.toString('base64'));

/** Aim, then take the shot on a frame that has a whole train in it, clear of the side edges. */
const trainShot = async (name, tx, tz, d, yaw, pitch, minPixels = 300) => {
  await cam(tx, tz, d, yaw, pitch);
  await page.waitForTimeout(900);
  for (let i = 0; i < 120; i++) {
    const { n, x0, x1 } = await trainPixels(await page.screenshot());
    if (n >= minPixels && x0 > 320 && x1 < 1380) {
      console.log(name, 'train pixels', n, x0, x1);
      await cleanShot(page, `${out}/${name}.png`);
      console.log('shot', name);
      return;
    }
    await page.waitForTimeout(150);
  }
  throw new Error(`no train came into frame for ${name}`);
};

// From the north, so the platform and track are in front of the station.
const NORTH = Math.PI;
await trainShot('station', X + 6.5, Z + 1, 90, NORTH, 0.55);
await trainShot('train-side', X + 12, Z, 80, NORTH, 0.3);
// The whole line is in frame, so both trains are, wherever they are on it.
await shot('line-overview', X + 14, Z + 2, 340, 0, 0.9);

console.log('done ->', out);
await b.close();
