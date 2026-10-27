/** Shots of the house kit's parts: a street of one-storey houses (ranches,
 * craftsmen and split-levels by seed), of Capes and of colonials at the default
 * camera pitch with the residents' cars on their drives; a street of duplexes,
 * fourplexes and townhouse rows; close shots of a porch, a portico and stoop,
 * a Cape, a craftsman's porch and a split-level beside a 4 m car; the streets
 * at night; and last the line-up, one of each form along one street — ranch,
 * craftsman, split-level, Cape, colonial, duplex, row — with the one-storey
 * homes re-placed until the seed gives each its form, shot whole at 15:00 and
 * at 22:00. The sun's azimuth only ever tilts 0.15 toward +z, so a street face
 * looking south is never lit by the clock: the line-up fronts the connector
 * road and faces west, where the afternoon sun lights its siding.
 * Homes are placed by command along streets on flat dry ground with the
 * sim paused, as the frame budget does: a running sim with no power, water or
 * zones abandons and clears them within a minute.
 *
 * Usage: node tools/house-shots.mjs [baseUrl] [outDir]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { closeUp, hooksReady, tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'tools/shots-houses';
mkdirSync(out, { recursive: true });

const SEED = 7;
const HOMES = 10;
/** Rows a street takes: the homes two deep, the road, and the gap to the next street. */
const STREET_ROWS = 7;
const DEFAULT_PITCH = 0.7;
/** The line-up's day, 15:07: the sun 43° up in the west, full on a west-facing facade; and its night, 22:00. */
const LINEUP_DAY = 0.63;
const LINEUP_NIGHT = 22 / 24;

/** The streets, north to south: what stands along each; the line-up last, one home per form. */
const STREETS = [
  { name: 'one-storey', ids: ['res-normal-1'] },
  { name: 'cape', ids: ['res-normal-2'] },
  { name: 'colonial', ids: ['res-normal-3'] },
  { name: 'attached', ids: ['res-duplex-1', 'res-fourplex-1', 'res-medium-row-2'] },
  {
    name: 'lineup',
    lineup: true,
    // The turned lots (2 × 1), so each fronts the connector on a 20 m edge.
    homes: [
      { id: 'res-normal-t-1', form: 'ranch' },
      { id: 'res-normal-t-1', form: 'craftsman' },
      { id: 'res-normal-t-1', form: 'splitLevel' },
      { id: 'res-normal-t-2' },
      { id: 'res-normal-t-3' },
      { id: 'res-duplex-t-1' },
      { id: 'res-medium-row-t-2' },
    ],
  },
];

// The same avalanche hash the render code seeds its choices with, to find which
// home the seed gave a porch or a form, so a shot can aim at one.
function hash1(n) {
  let h = n >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}
const SLOT_ENTRY = 14;
const SLOT_FORM = 19;
const PORCH_SHARE = 0.67;
const FORMS = ['ranch', 'craftsman', 'splitLevel'];
const hasPorch = (id) => hash1(id * 131 + SLOT_ENTRY) < PORCH_SHARE;
const formOf = (id) => FORMS[Math.min(2, Math.floor(hash1(id * 131 + SLOT_FORM) * 3))];

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
  const lineup = STREETS.findIndex((s) => s.lineup);
  const lineupHomes = STREETS[lineup].homes.length;
  const lastStreet = STREETS.length - 2;
  // The streets' rows, then the line-up column's tile a home below the last street.
  const rowsNeeded = (STREETS.length - 1) * STREET_ROWS + lineupHomes + 2;
  let anchor = null;
  for (let z = 20; z < N - rowsNeeded - 10 && !anchor; z++) {
    for (let x = 20; x < N - 40 && !anchor; x++) {
      const h0 = g.height[idx(x, z)];
      let ok = true;
      for (let dz = -3; dz < rowsNeeded && ok; dz++) {
        for (let dx = -2; dx < HOMES + 4 && ok; dx++) if (!flatDry(x + dx, z + dz, h0)) ok = false;
      }
      if (ok) anchor = { x, z };
    }
  }
  if (!anchor) throw new Error('no flat dry ground for the streets');
  const { x: X, z: Z0 } = anchor;

  // Each street's road runs along its row; its homes stand on the north side.
  const roadRow = (s) => Z0 + 2 + s * STREET_ROWS;
  // The line-up stands east of the connector, below the last street, each home fronting it westward.
  const columnX = X + HOMES + 2;
  const columnZ0 = roadRow(lastStreet) + 1;
  for (const [s, street] of STREETS.entries()) {
    if (street.lineup) continue;
    await send('Street', [
      {
        kind: 'buildRoad',
        tier: 1,
        tiles: Array.from({ length: HOMES + 4 }, (_, i) => ({ x: X - 2 + i, z: roadRow(s) })),
      },
    ]);
  }
  // A connector down the east end joins the streets into one network, and a
  // turbine at its head powers them all: a lamp stands only on a powered
  // street, so the night views show the lamps lit.
  await send('Connector', [
    {
      kind: 'buildRoad',
      tier: 1,
      tiles: Array.from({ length: columnZ0 + lineupHomes + 1 - roadRow(0) }, (_, i) => ({
        x: X + HOMES + 1,
        z: roadRow(0) + i,
      })),
    },
  ]);
  await send('Power', [
    {
      kind: 'placeBuilding',
      catalogId: 'wind-turbine',
      x: X + HOMES + 1,
      z: roadRow(0) - 1,
      rotation: 0,
    },
  ]);
  // One command each: a batch is atomic, and one refused tile would drop the street.
  const place = (catalogId, x, z) =>
    send('Home', [{ kind: 'placeBuilding', catalogId, x, z, rotation: 0 }]);
  /**
   * A one-storey home whose seed gives the form asked for: the form hashes off
   * the building id, and each placement takes the next id, so a home of the
   * wrong form is cleared and placed again until the id lands on the form.
   */
  const placeForm = async (catalogId, x, z, form) => {
    for (let tries = 0; tries < 24; tries++) {
      await place(catalogId, x, z);
      await page.waitForTimeout(250);
      const placed = (await readBuildings()).find((b) => b.x === x && b.z === z);
      if (!placed) throw new Error(`no home placed at ${x},${z}`);
      if (!form || formOf(placed.id) === form) return placed;
      await send('Clear', [
        {
          kind: 'bulldoze',
          tiles: [
            { x, z },
            { x: x + 1, z },
          ],
        },
      ]);
      await page.waitForTimeout(250);
    }
    throw new Error(`no ${form} in 24 placements at ${x},${z}`);
  };
  for (const [s, street] of STREETS.entries()) {
    if (street.lineup) {
      for (const [i, h] of street.homes.entries()) {
        await placeForm(h.id, columnX, columnZ0 + i, h.form);
      }
      continue;
    }
    for (let i = 0; i < HOMES; i++) {
      await place(street.ids[i % street.ids.length], X + i, roadRow(s) - 2);
    }
  }
  await page.waitForTimeout(3000);
  const standing = await readBuildings();
  console.log('lamp poles', await page.evaluate(() => window.__slimcity.readLampPoles().length));
  console.log(
    'standing',
    JSON.stringify(
      standing.reduce(
        (m, b) => ((m[`${b.catalogId}:${b.state}`] = (m[`${b.catalogId}:${b.state}`] ?? 0) + 1), m),
        {},
      ),
    ),
  );
  console.log(
    'lineup forms',
    STREETS[lineup].homes
      .map((h, i) => {
        const b = standing.find((c) => c.x === columnX && c.z === columnZ0 + i);
        return b ? `${b.catalogId}#${b.id}${h.form ? ':' + formOf(b.id) : ''}` : 'missing';
      })
      .join(' '),
  );

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
    await page.screenshot({ path: `${out}/${name}.png` });
  };
  const middle = X + HOMES / 2;
  // The line-up's seven homes framed whole from the west, aimed at the
  // connector so the column stands across the upper half, a little north of
  // the middle as the yaw brings the south end nearer; a street shot's 70 m
  // frames five or six homes, so the seven need 100.
  const shootLineup = (suffix) =>
    shoot(
      `lineup${suffix}`,
      X + HOMES + 1,
      columnZ0 + lineupHomes / 2 - 0.25,
      100,
      -Math.PI / 2 + 0.2,
    );

  await setPhase(0.5);
  for (const [s, street] of STREETS.entries()) {
    if (street.lineup) continue;
    await shoot(`street-${street.name}`, middle, roadRow(s) - 1, 70, 0.3);
  }
  // A closer read of each at the default pitch, from the other end.
  for (const [s, street] of STREETS.entries()) {
    if (street.lineup) continue;
    await shoot(`street-${street.name}-west`, X + 2, roadRow(s) - 1, 45, -0.5);
  }
  await setPhase(LINEUP_DAY);
  await shootLineup('');
  await setPhase(0.5);

  // The close shots, at twice the pixels over the camera's floor distance.
  const homeAt = (catalogId, porch, form) =>
    standing.find(
      (b) =>
        b.catalogId === catalogId &&
        (porch === undefined || hasPorch(b.id) === porch) &&
        (form === undefined || formOf(b.id) === form),
    );
  const restore = await closeUp(page, 2);
  const porched = homeAt('res-normal-3', true);
  if (porched) await shoot('close-porch', porched.x, porched.z + 1, 40, 0.3);
  else console.log('no colonial with a porch among the street');
  const portico = homeAt('res-normal-3', false) ?? homeAt('res-normal-2', false);
  if (portico) await shoot('close-portico', portico.x, portico.z + 1, 40, 0.3);
  const cape = homeAt('res-normal-2');
  if (cape) await shoot('close-cape', cape.x, cape.z + 1, 40, -0.4);
  const craftsman = homeAt('res-normal-1', undefined, 'craftsman');
  if (craftsman) await shoot('close-craftsman', craftsman.x, craftsman.z + 1, 40, 0.3);
  const split = homeAt('res-normal-1', undefined, 'splitLevel');
  if (split) await shoot('close-split-level', split.x, split.z + 1, 40, 0.3);
  await restore();

  await setPhase(0.96);
  for (const [s, street] of STREETS.entries()) {
    if (street.lineup) continue;
    await shoot(`night-${street.name}`, middle, roadRow(s) - 1, 70, 0.3);
  }
  await setPhase(LINEUP_NIGHT);
  await shootLineup('-night');
} finally {
  await browser.close();
}
