/** A new game played through its interface, the way a player plays it: the one scenario behind
 * the `town/firstgame` series (the steps where the interface is seen to work, each with a frame)
 * and the `tools/probes/playthrough.mjs` probe (every step, numbers only).
 *
 * Every action goes through the real controls: dock categories and drawer cards are clicked,
 * roads and zones are dragged with the pointer, buildings are placed with a click. Nothing is sent
 * through the command hook. After each step the grid and stats are read back, so a check fails
 * when the world did not change the way the click promised, not only when a picture looks wrong.
 *
 * The camera looks straight down and every tile in the top right of the screen is mapped to a
 * pixel, clear of the drawer and the side panels, so a drag lands on the tiles it names.
 *
 * Waits are on conditions: a snapshot after a command, a count on the grid, a clock that moved.
 * Time is run by the 4x button until what the step waits for stands and a minimum of ticks has
 * passed, so a check that something does NOT grow has had time to be wrong.
 */
import { hooksReady } from './camera.mjs';
import { settle } from './session.mjs';

/** Long enough for a page rendering in software on a busy machine to settle under the pointer. */
const CLICK_MS = 15000;
/** The longest a step waits on the game before it is reported as not having happened. */
const WAIT_MS = 120000;
/** The wait for a snapshot after a command; a refused command posts none. */
const COMMAND_MS = 2500;
const GRAVEL = 4;
/** Ticks the town is run for before a growth check: what the first game gives it in a minute. */
const GROW_TICKS = 500;
const SOUTH_TICKS = 300;
/** Frames a paused clock is watched for. */
const HOLD_FRAMES = 90;

/** The lenses of the Infoviews grid, in the order the old playthrough turned them on. */
export const LENSES = [
  'Land Value',
  'Pollution',
  'Noise',
  'Traffic',
  'Crime',
  'Fire Risk',
  'Elementary',
  'Middle',
  'High School',
  'College',
  'Health',
  'Happiness',
  'Power',
  'Water',
  'Sewer',
  'Trash',
  'Soil',
  'Transit',
  'Districts',
];

/** A dry, gentle block big enough for the whole town, as `{ x, z }`, or null. */
async function findBlock(page) {
  return page.evaluate(() => {
    const g = window.__slimcity.readGrid();
    const N = g.size;
    for (let z = 30; z < N - 40; z++) {
      for (let x = 30; x < N - 50; x++) {
        const h0 = g.height[z * N + x];
        let ok = true;
        for (let dz = -8; dz < 24 && ok; dz++)
          for (let dx = -4; dx < 38 && ok; dx++) {
            const i = (z + dz) * N + x + dx;
            if (g.water[i] || Math.abs(g.height[i] - h0) > 6) ok = false;
          }
        if (ok) return { x, z };
      }
    }
    return null;
  });
}

/**
 * The scenario's controls and steps on `page`, a first game on a flat enough map.
 * `check(name, ok, detail)` records a result; `frame(name)` is called after every step the
 * caller wants a picture of (the probe passes nothing). Returns `{ steps, run }`: `run(only)`
 * plays the steps (only those with a `frame` or that `always` run when `only`).
 */
export async function playthrough(page, { check, frame }) {
  const anchor = await findBlock(page);
  if (!anchor) throw new Error('no dry block found for the town');
  const { x: X, z: Z } = anchor;
  const call = (fn, ...a) => page.evaluate(fn, ...a);
  const grid = () => call(() => window.__slimcity.readGrid());
  const stats = () => call(() => window.__slimcity.getStats());
  const N = (await grid()).size;
  const idx = (x, z) => z * N + x;
  const T = (dx, dz) => ({ x: X + dx, z: Z + dz });
  const rect = (x0, z0, x1, z1) => {
    const r = [];
    for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) r.push(T(x, z));
    return r;
  };
  const countOn = (g, tiles, layer) => tiles.filter((t) => g[layer][idx(t.x, t.z)]).length;

  // ---- the controls, each found where the player finds it
  const button = (name) => page.getByRole('button', { name, exact: true }).first();
  const snapshots = () => call(() => window.__slimcity.snapshotCounts().snapshots);
  /** Runs `act`, then waits for the snapshot the game posts when a command lands. */
  const acting = async (act) => {
    const before = await snapshots();
    await act();
    await settle(page, {
      until: (n) => window.__slimcity.snapshotCounts().snapshots > n,
      arg: before,
      timeout: COMMAND_MS,
    }).catch(() => {});
  };
  const press = async (key) => {
    await page.keyboard.press(key);
    await settle(page);
  };
  const click = async (name) => {
    await button(name).click({ timeout: CLICK_MS });
    await settle(page);
  };
  const dockButton = (name) =>
    page.getByRole('toolbar', { name: 'Main dock' }).getByRole('button', { name, exact: true });
  const dock = async (name) => {
    await dockButton(name).click({ timeout: CLICK_MS });
    await settle(page);
  };
  const card = async (name) => {
    const c = page
      .getByRole('region', { name: 'Asset drawer' })
      .getByRole('button', { name })
      .first();
    if (await c.isDisabled()) throw new Error(`card ${name} is disabled`);
    await c.click({ timeout: CLICK_MS });
    await settle(page);
  };
  const lensMenu = () => page.getByRole('menu', { name: 'Infoviews' });
  const lens = async (name) => {
    if (!(await lensMenu().isVisible())) await dock('Infoviews');
    await lensMenu().getByRole('button', { name, exact: true }).click({ timeout: CLICK_MS });
    await settle(page);
  };
  const toasts = async () =>
    (await page.locator('[role="alert"], [role="status"]').allInnerTexts())
      .map((s) => s.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  const refused = async () => (await toasts()).filter((m) => /failed/i.test(m));
  const bodyText = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');

  /** Closes whatever the last step left open, so the next starts from the plain map. */
  const tidy = async () => {
    for (const label of [
      'Close junction inspector',
      'Close building info',
      'Close advisor',
      'Close stats',
    ]) {
      const c = page.getByRole('button', { name: label }).first();
      if (await c.isVisible().catch(() => false)) await c.click().catch(() => {});
    }
    if (
      await lensMenu()
        .isVisible()
        .catch(() => false)
    )
      await dock('Infoviews');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await settle(page);
  };

  // ---- aiming the pointer at tiles
  let tilePx = new Map();
  /** Looks straight down over `v` and maps every tile in the working area to its pixel. */
  const view = async (v) => {
    await call(
      ([x, z, d]) => {
        const t = window.__slimcity.tileMeters();
        window.__slimcity.setCamera((x + 0.5) * t, (z + 0.5) * t, d, 0, 1.45);
      },
      [v.x, v.z, v.d],
    );
    await settle(page);
    tilePx = new Map(
      await call(() => {
        const acc = new Map();
        for (let sy = 60; sy < 380; sy += 4) {
          for (let sx = 340; sx < 1280; sx += 4) {
            const t = window.__slimcity.screenToTile(sx, sy);
            if (!t) continue;
            const k = `${t.x},${t.z}`;
            const a = acc.get(k) ?? [0, 0, 0];
            a[0] += sx;
            a[1] += sy;
            a[2] += 1;
            acc.set(k, a);
          }
        }
        return [...acc].map(([k, a]) => [k, [a[0] / a[2], a[1] / a[2]]]);
      }),
    );
  };
  const px = (t) => {
    const p = tilePx.get(`${t.x},${t.z}`);
    if (!p) throw new Error(`tile ${t.x - X},${t.z - Z} is outside the working area`);
    return p;
  };
  const drag = async (from, to) => {
    const [ax, ay] = px(from);
    const [bx, by] = px(to);
    await page.mouse.move(ax, ay);
    await page.mouse.down();
    for (let s = 1; s <= 12; s++)
      await page.mouse.move(ax + ((bx - ax) * s) / 12, ay + ((by - ay) * s) / 12);
    await settle(page);
    await acting(() => page.mouse.up());
  };
  const tap = async (t, mouseButton = 'left') => {
    const [ax, ay] = px(t);
    await page.mouse.move(ax, ay);
    await settle(page);
    await acting(() => page.mouse.click(ax, ay, { button: mouseButton }));
  };
  /**
   * Runs the town at 4x until `ticks` have passed and `until` (the source of a page function,
   * true once the town is as the step needs) holds, then pauses it. The wait polls, so a page
   * that stalls for a moment at 4x does not fail a read-back.
   */
  const run = async (ticks, until = '() => true') => {
    const start = (await stats()).tick;
    await click('4×');
    try {
      await page.waitForFunction(
        ([from, n, src]) =>
          window.__slimcity.getStats().tick >= from + n && (0, eval)(`(${src})`)(),
        [start, ticks, until],
        { timeout: WAIT_MS, polling: 250 },
      );
    } finally {
      await click('Pause');
    }
  };
  /** Waits `n` drawn frames, for a check that something stays as it is. */
  const frames = (n) =>
    page.evaluate(
      (count) =>
        new Promise((done) => {
          const tick = (left) =>
            left === 0 ? done() : requestAnimationFrame(() => tick(left - 1));
          tick(count);
        }),
      n,
    );
  const clock = async () =>
    (await page.getByRole('contentinfo', { name: 'Status strip' }).innerText()).match(
      /\d\d:\d\d/,
    )?.[0];

  const TOWN = { x: X + 8, z: Z + 12, d: 900 };
  const SOUTH = { x: X + 8, z: Z + 21, d: 900 };

  // ---- the steps
  const steps = [];
  const add = (name, fn, options = {}) => steps.push({ name, fn, group: current, ...options });
  let current = '';
  const group = (name) => {
    current = name;
  };

  group('start');
  add(
    'start',
    async () => {
      await call(() => window.__slimcity.setSpeed(0));
      await view(TOWN);
      check('a new game opens on an empty map', (await stats()).population === 0);
    },
    { frame: true, fresh: false },
  );

  group('roads and utilities');
  add(
    'two-lane-road',
    async () => {
      await dock('Roads');
      await card(/^Two-Lane Road/);
      await drag(T(0, 0), T(33, 0));
      const laid = countOn(await grid(), rect(0, 0, 33, 0), 'roadTier');
      check('a two-lane road is drawn by drag', laid === 34, `${laid}/34`);
    },
    { frame: true },
  );
  add(
    'gravel-road',
    async () => {
      await card(/^Gravel Road/);
      await drag(T(12, 1), T(12, 10));
      const g = await grid();
      check(
        'a gravel road is drawn by drag',
        rect(12, 1, 12, 10).every((t) => g.roadTier[idx(t.x, t.z)] === GRAVEL),
      );
    },
    { fresh: false, frame: true },
  );
  add(
    'wind-turbine',
    async () => {
      await dock('Electricity');
      await card(/^Wind Turbine/);
      await tap(T(1, -1));
      check('a wind turbine is placed by click', (await grid()).buildingId[idx(X + 1, Z - 1)] > 0);
    },
    { frame: true },
  );
  add(
    'water-tower',
    async () => {
      await dock('Water');
      await card(/^Water Tower/);
      await tap(T(3, -1));
      check('a water tower is placed by click', (await grid()).buildingId[idx(X + 3, Z - 1)] > 0);
    },
    { frame: true },
  );

  group('zoning');
  const resStreet = [...rect(6, -3, 20, -1), ...rect(0, 1, 11, 3)];
  const resGravel = rect(13, 1, 14, 10);
  const gravelBack = resGravel.filter((t) => t.z > Z + 3);
  const industry = rect(23, 1, 33, 3);
  const shops = rect(22, -3, 33, -1);
  add(
    'zone-homes',
    async () => {
      await dock('Zoning');
      await card(/^Residential \(Low\)/);
      await drag(T(6, -3), T(20, -1));
      await drag(T(0, 1), T(11, 3));
      await drag(T(13, 1), T(14, 10));
      const all = [...resStreet, ...resGravel];
      const painted = countOn(await grid(), all, 'zone');
      check('residential is painted by drag', painted === all.length, `${painted}/${all.length}`);
    },
    { frame: true },
  );
  add(
    'zone-shops-industry',
    async () => {
      await page.getByRole('tab', { name: 'Commercial' }).click();
      await card(/^Commercial \(Low\)/);
      await drag(T(22, -3), T(33, -1));
      await page.getByRole('tab', { name: 'Industrial' }).click();
      await card(/^Industrial/);
      await drag(T(23, 1), T(33, 3));
      const g = await grid();
      check('commercial is painted', countOn(g, shops, 'zone') === shops.length);
      check('industrial is painted', countOn(g, industry, 'zone') === industry.length);
    },
    { fresh: false, frame: true },
  );

  group('growth, and the gravel road homes');
  /** A page function: standing buildings over `tiles` (as `[x, z]` pairs) number at least `min`. */
  const grownOn = (tiles, min) =>
    `() => { const g = window.__slimcity.readGrid(); return ${JSON.stringify(
      tiles.map((t) => t.z * N + t.x),
    )}.filter((i) => g.buildingId[i] > 0).length >= ${min}; }`;
  add(
    'grown',
    async () => {
      await run(GROW_TICKS, `() => (${grownOn(resStreet, 1)})() && (${grownOn(industry, 1)})()`);
      const g = await grid();
      const s = await stats();
      console.log('  stats', JSON.stringify({ pop: s.population, jobs: s.jobs, demand: s.demand }));
      check('homes grow on the street', countOn(g, resStreet, 'buildingId') > 0);
      check('industry grows', countOn(g, industry, 'buildingId') > 0);
      check(
        'nothing grows down the gravel road, which carries no power',
        countOn(g, gravelBack, 'buildingId') === 0,
      );
    },
    { frame: true },
  );
  add('advisor-gravel', async () => {
    await click('Advisor');
    const panel = (await bodyText()).match(/Advisor.{0,400}/)?.[0] ?? '';
    console.log('  advisor:', panel.slice(0, 400));
    check(
      'the Advisor names the zoned tiles the gravel leaves without power',
      /zoned tiles? ha(s|ve) no power/.test(panel),
    );
  });
  add(
    'power-lens',
    async () => {
      await lens('Power');
      check('the Power lens turns on', await dockButton('Turn off overlay').isEnabled());
    },
    { frame: true },
  );
  // A line starts at a source: a substation on the street takes the street's supply
  // and the line is strung from it down beside the homes on the gravel road.
  add(
    'substation',
    async () => {
      await dock('Electricity');
      await card(/^Substation/);
      await tap(T(16, 1));
      check(
        'a substation is placed by click',
        (await grid()).buildingId[idx(X + 16, Z + 1)] > 0,
        (await refused()).join(' | '),
      );
      await tidy();
    },
    { frame: true },
  );
  add(
    'power-line',
    async () => {
      await dock('Electricity');
      await card(/^Power Line/);
      await drag(T(15, 1), T(15, 11));
      const g = await grid();
      const strung = countOn(g, rect(15, 1, 15, 11), 'powerLine');
      const lit = countOn(g, rect(14, 4, 14, 10), 'power');
      check('a power line is strung by drag', strung === 11, `${strung}/11`);
      check('the line powers the lots beside it', lit === 7, `${lit}/7`);
    },
    { fresh: false, frame: true },
  );
  add(
    'grown-on-the-line',
    async () => {
      // Escape clears the lens as its last stage, so it may already be off.
      if (await dockButton('Turn off overlay').isEnabled()) await dock('Turn off overlay');
      await tidy();
      check(
        'the overlay is off before the town grows',
        await dockButton('Turn off overlay').isDisabled(),
      );
      await run(GROW_TICKS, `() => (${grownOn(gravelBack, 1)})() && (${grownOn(shops, 1)})()`);
      const g = await grid();
      check(
        'homes grow down the gravel road once the line is up',
        countOn(g, gravelBack, 'buildingId') > 0,
      );
      check('shops grow once industry pays wages', countOn(g, shops, 'buildingId') > 0);
    },
    { frame: true },
  );

  group('inspecting');
  add(
    'building-info',
    async () => {
      await tap(T(3, -1));
      check(
        'clicking a building opens its info panel',
        await page.getByRole('button', { name: 'Close building info' }).isVisible(),
      );
    },
    { frame: true },
  );
  add(
    'junction-panel',
    async () => {
      await tap(T(12, 0));
      check(
        'clicking a junction opens the junction panel',
        await page.getByRole('button', { name: 'Close junction inspector' }).first().isVisible(),
      );
      // Nothing in the Escape stack touches it; it closes by its own button.
      await page.keyboard.press('Escape');
      await settle(page);
      check(
        'the junction panel stays open through Escape',
        await page.getByRole('button', { name: 'Close junction inspector' }).first().isVisible(),
      );
    },
    { frame: true },
  );

  group('options');
  add('options-sandbox', async () => {
    await click('Menu');
    await click('Options');
    await page.getByLabel('Sandbox: unlock all build items').check();
    check(
      'the sandbox unlock toggles',
      await page.getByLabel('Sandbox: unlock all build items').isChecked(),
    );
  });
  add(
    'resume',
    async () => {
      await click('Back');
      await click('Resume Game');
      check('Resume closes the menu', await dockButton('Roads').isVisible());
    },
    { fresh: false },
  );

  group('services, garbage, transit and districts');
  add('south-view', () => view(SOUTH), { fresh: false });
  add('second-street', async () => {
    await dock('Roads');
    await card(/^Two-Lane Road/);
    await drag(T(12, 11), T(12, 14));
    await drag(T(0, 14), T(33, 14));
    const laid = countOn(await grid(), rect(0, 14, 33, 14), 'roadTier');
    check('a second street is drawn', laid === 34, `${laid}/34`);
  });
  const place = async (category, name, at, label) => {
    await tidy();
    await dock(category);
    await card(name);
    await tap(at);
    check(
      `${label} is placed`,
      (await grid()).buildingId[idx(at.x, at.z)] > 0,
      (await refused()).join(' | '),
    );
  };
  add('services', async () => {
    await place('Health', /^Community Clinic/, T(1, 12), 'a clinic');
    await place('Fire', /^Fire Station/, T(4, 12), 'a fire station');
    await place('Police', /^Police Station/, T(7, 12), 'a police station');
    await place('Education', /^Elementary School/, T(1, 15), 'a school');
    await place('Parks', /^Pocket Park/, T(14, 13), 'a pocket park');
  });
  add('landfill', async () => {
    await dock('Garbage');
    await card(/^Landfill/);
    await drag(T(20, 15), T(24, 18));
    const failed = await refused();
    check('a landfill is painted', failed.length === 0, failed.join(' | '));
  });
  /** A stop is furniture on a street's side, not a building: it shows as money spent. */
  const placeStop = async (name, cost, at, label) => {
    await tidy();
    await dock('Transit');
    await card(name);
    const before = (await stats()).funds;
    await tap(at);
    const spent = before - (await stats()).funds;
    check(
      `${label} is placed`,
      spent === cost,
      `spent ${spent} of ${cost}; ${(await refused()).join(' | ')}`,
    );
  };
  add('bus-stops', async () => {
    await placeStop(/^Bus shelter/, 150, T(18, 13), 'the first bus stop');
    await placeStop(/^Bus stop sign/, 2, T(28, 15), 'the second bus stop');
  });
  // A mode with no depot runs nothing, so the line needs its buses to come from one, and a
  // depot fields only with power: the second street reaches the first only down gravel,
  // which carries none, so the power line is run on to it.
  add('bus-depot', async () => {
    await dock('Electricity');
    await card(/^Power Line/);
    await drag(T(15, 12), T(15, 13));
    const strung = countOn(await grid(), rect(15, 12, 15, 13), 'powerLine');
    check('the power line is run on to the second street', strung === 2, `${strung}/2`);
    await place('Transit', /^Bus Depot/, T(22, 12), 'a bus depot');
  });
  add('bus-line', async () => {
    await dock('Transit');
    await card(/^Bus Line/);
    await tap(T(18, 13));
    await tap(T(28, 15));
    await tap(T(28, 15), 'right');
    await settle(page, {
      until: () => window.__slimcity.readTransit().lines.length > 0,
      timeout: COMMAND_MS,
    }).catch(() => {});
    const transit = await call(() => window.__slimcity.readTransit());
    check(
      'a bus line is drawn between two stops',
      transit.lines.length === 1,
      `${transit.lines.length} lines`,
    );
  });
  add('district', async () => {
    await dock('Districts');
    await card(/^Paint District/);
    await drag(T(0, 12), T(10, 18));
    check('a district is painted and named', /District 1/.test(await bodyText()));
  });
  add('town-at-work', async () => {
    await run(SOUTH_TICKS, `() => (window.__slimcity.readTransit().ridership[0] ?? 0) > 0`);
    const transit = await call(() => window.__slimcity.readTransit());
    check(
      'the bus carries riders',
      (transit.ridership[0] ?? 0) > 0,
      JSON.stringify({ ridership: transit.ridership, served: transit.served }),
    );
  });

  group('bulldoze, undo, redo');
  const stub = rect(30, 14, 33, 14);
  add('bulldoze', async () => {
    await dock('Bulldoze');
    await card(/^Bulldoze/);
    await drag(T(30, 14), T(33, 14));
    check('a bulldozer drag removes the road', countOn(await grid(), stub, 'roadTier') === 0);
  });
  add(
    'undo',
    async () => {
      await acting(() => click('Undo'));
      check('undo puts the road back', countOn(await grid(), stub, 'roadTier') === stub.length);
    },
    { fresh: false },
  );
  add(
    'redo',
    async () => {
      await acting(() => click('Redo'));
      check('redo takes it out again', countOn(await grid(), stub, 'roadTier') === 0);
    },
    { fresh: false },
  );

  group('terrain brushes');
  const heightAt = (g, t) => g.height[idx(t.x, t.z)];
  const strip = rect(25, 20, 30, 20);
  const spread = (g) => {
    const hs = strip.map((t) => heightAt(g, t));
    return Math.max(...hs) - Math.min(...hs);
  };
  add('raise', async () => {
    const before = heightAt(await grid(), T(30, 20));
    await dock('Landscaping');
    await card(/^Raise$/);
    await drag(T(29, 20), T(31, 20));
    check('Raise lifts the ground', heightAt(await grid(), T(30, 20)) > before);
  });
  add(
    'lower',
    async () => {
      const before = heightAt(await grid(), T(26, 20));
      await card(/^Lower$/);
      await drag(T(25, 20), T(27, 20));
      check('Lower drops the ground', heightAt(await grid(), T(26, 20)) < before);
    },
    { fresh: false },
  );
  add(
    'level',
    async () => {
      const before = spread(await grid());
      await card(/^Level$/);
      await drag(T(30, 20), T(25, 20));
      const after = spread(await grid());
      // A brush: each pass eases the ground toward the height it started on.
      check(
        'Level evens the strip out',
        after < before,
        `${before.toFixed(2)} m -> ${after.toFixed(2)} m`,
      );
    },
    { fresh: false },
  );
  add(
    'smooth',
    async () => {
      await card(/^Smooth$/);
      await drag(T(25, 19), T(30, 20));
      const failed = await refused();
      check('Smooth is accepted', failed.length === 0, failed.join(' | '));
    },
    { fresh: false },
  );

  group('roundabout');
  // On the tee where the stub meets the south street.
  add('roundabout', async () => {
    await dock('Roads');
    await card(/^Roundabout/);
    const [cx, cy] = px(T(12, 14));
    await page.mouse.move(cx + 5, cy + 5);
    await settle(page);
    await acting(() => page.mouse.click(cx + 5, cy + 5));
    const failed = await refused();
    check('a roundabout is stamped on the tee', failed.length === 0, failed.join(' | '));
  });

  group('lenses');
  add(
    'lens-view',
    async () => {
      await view(TOWN);
      await tidy();
    },
    { fresh: false, always: true },
  );
  for (const name of LENSES) {
    add(
      `lens-${name.replace(/ /g, '-').toLowerCase()}`,
      async () => {
        await lens(name);
        check(`the ${name} lens turns on`, await dockButton('Turn off overlay').isEnabled());
      },
      { fresh: false, frame: ['Land Value', 'Water'].includes(name) },
    );
  }
  add(
    'lens-off',
    async () => {
      await dock('Turn off overlay');
      check('the overlay turns off', await dockButton('Turn off overlay').isDisabled());
    },
    { fresh: false },
  );

  group('corner panels');
  for (const [panel, says] of [
    ['City info', /JOBS.*POWER.*WATER/i],
    ['City stats', /Population/i],
    ['Help', /Keyboard shortcuts/i],
  ]) {
    add(
      `panel-${panel.replace(/ /g, '-').toLowerCase()}`,
      async () => {
        await click(panel);
        check(`${panel} opens`, says.test(await bodyText()));
      },
      { frame: panel === 'City stats' },
    );
    add(
      `panel-${panel.replace(/ /g, '-').toLowerCase()}-close`,
      () => click(panel).catch(() => {}),
      {
        fresh: false,
        always: panel === 'City stats',
      },
    );
  }
  add(
    'milestones',
    async () => {
      await page.getByRole('button', { name: /^Milestone progress/ }).click();
      await settle(page);
      check('the milestone history opens', /Village/i.test(await bodyText()));
    },
    { frame: true },
  );
  add('photo-mode', async () => {
    await click('Photo mode');
    check(
      'photo mode hides the dock',
      !(await page.getByRole('toolbar', { name: 'Main dock' }).isVisible()),
    );
  });
  add(
    'photo-exit',
    async () => {
      await page.keyboard.press('Escape');
      await settle(page, {
        until: () => !!document.querySelector('[role="toolbar"][aria-label="Main dock"]'),
      });
      check(
        'Escape leaves photo mode',
        await page.getByRole('toolbar', { name: 'Main dock' }).isVisible(),
      );
    },
    { fresh: false },
  );

  group('speed');
  add(
    'speed',
    async () => {
      const before = await clock();
      await click('1×');
      await page
        .waitForFunction(
          (was) => {
            const t = [...document.querySelectorAll('[role="contentinfo"] *')]
              .map((e) => e.textContent ?? '')
              .join(' ')
              .match(/\d\d:\d\d/)?.[0];
            return t !== undefined && t !== was;
          },
          before,
          { timeout: 30000, polling: 100 },
        )
        .catch(() => {});
      await click('Pause');
      const after = await clock();
      // A running 1x clock moves a minute in well under a second of frames.
      await frames(HOLD_FRAMES);
      const held = await clock();
      check('the clock runs at 1×', before !== after, `${before} -> ${after}`);
      check('the clock holds on pause', after === held, `${after} -> ${held}`);
    },
    { frame: true },
  );

  group('save and load');
  add(
    'save',
    async () => {
      await click('Menu');
      await click('Save Game');
      await settle(page, {
        until: () =>
          [...document.querySelectorAll('[role="alert"], [role="status"]')].some((e) =>
            /saved/i.test(e.textContent ?? ''),
          ),
        timeout: 8000,
      }).catch(() => {});
      check(
        'Save Game saves',
        (await toasts()).some((m) => /saved/i.test(m)),
      );
      // The menu's overlay would block the toast's dismissal before a frame.
      await press('Escape');
    },
    { frame: true },
  );
  let popBefore = 0;
  let tickBefore = 0;
  let built = [];
  add(
    'load-browser',
    async () => {
      const s = await stats();
      popBefore = s.population;
      tickBefore = s.tick;
      const g = await grid();
      built = [...g.buildingId.keys()].filter((i) => g.buildingId[i] > 0);
      await click('Menu');
      const enabled = await button('Load Game').isEnabled();
      check('Load Game is offered once there is a save', enabled);
      if (enabled) await click('Load Game');
    },
    { frame: true },
  );
  add(
    'loaded',
    async () => {
      const load = page
        .getByRole('dialog')
        .getByRole('button', { name: /^(Load|Open)/ })
        .filter({ hasNotText: 'Load Game' })
        .first();
      if (await load.count()) {
        // Loading reloads the page: a mark the old page carries tells the new one apart.
        await call(() => {
          window.__beforeLoad = true;
        });
        await load.click();
        await page.waitForFunction(
          () =>
            !window.__beforeLoad &&
            !!window.__slimcity?.cmd &&
            window.__slimcity.getStats().tick > 0,
          null,
          { timeout: 60000, polling: 250 },
        );
        await hooksReady(page);
        // A loaded town runs at once: it is stopped before it can grow past what was saved.
        await click('Pause');
      }
      await view(TOWN);
      const loaded = await stats();
      const g = await grid();
      // The loaded town runs at once, so a few ticks of growth may land before it is read:
      // what was saved must all be there, and no one gone.
      const kept = built.filter((i) => g.buildingId[i] > 0).length;
      check(
        'the save loads back as the same town',
        built.length > 0 &&
          kept === built.length &&
          loaded.population >= popBefore &&
          loaded.tick >= tickBefore,
        `population ${popBefore} -> ${loaded.population}, buildings ${kept}/${built.length}, tick ${tickBefore} -> ${loaded.tick}`,
      );
    },
    { fresh: false, frame: true },
  );

  /** Plays the steps; with `only`, those with a `frame` and those that `always` run. */
  const play = async (only) => {
    const mark = () => page.evaluate(() => (window.__playMark = true));
    await mark();
    for (const step of steps) {
      if (only && !step.frame && !step.always) continue;
      // A page that reloaded under the run is a new game: nothing after it means anything.
      if (!(await page.evaluate(() => window.__playMark === true).catch(() => false)))
        throw new Error(`the page reloaded before step '${step.name}': the game restarted`);
      const began = performance.now();
      try {
        if (step.fresh !== false) await tidy();
        await step.fn();
      } catch (e) {
        check(step.name, false, `threw: ${e.message.split('\n')[0]}`);
      }
      await settle(page);
      if (step.name === 'loaded') await mark();
      console.log(`  step ${step.name} ${((performance.now() - began) / 1000).toFixed(1)}s`);
      if (step.frame && frame) await frame(step.name);
    }
  };
  return { steps, play };
}
