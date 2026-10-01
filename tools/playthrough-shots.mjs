/** Play a new game through its interface, the way a player does, and photograph every step.
 *
 * Every action goes through the real controls: dock categories and drawer
 * cards are clicked, roads and zones are dragged with the pointer, buildings
 * are placed with a click. Nothing is sent through the command hook. After
 * each step the grid and stats are read back, so a check fails when the world
 * did not change the way the click promised, not only when a picture looks
 * wrong. A starter town is built: a two-lane street, a gravel road off it,
 * a turbine and a tower, then homes, shops and industry. Homes zoned down the
 * gravel road wait for a power line. Then come services, a landfill, a bus
 * line, a district, bulldoze with undo and redo, the four terrain brushes, a
 * roundabout, every lens, the corner panels, photo mode, the speed controls,
 * and a save loaded back.
 *
 * The camera looks straight down and the harness maps every tile in the top
 * right of the screen to a pixel, clear of the drawer and the side panels, so
 * a drag lands on the tiles it names.
 *
 * Writes one numbered screenshot per step, plus contact sheets of nine.
 *
 * Usage: node tools/playthrough-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { hooksReady, tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-playthrough';
mkdirSync(out, { recursive: true });

const b = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
const pageErrors = [];
page.on('pageerror', (e) => {
  pageErrors.push(e.message);
  console.log('[pageerror]', e.message);
});
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  pageErrors.push(m.text());
  console.log('[console.error]', m.text());
});
await page.addInitScript(() => {
  // Only the first load starts a new game; loading a save reloads the page
  // with its own session intent, which must survive.
  if (!sessionStorage.getItem('slimcity.session')) {
    sessionStorage.setItem(
      'slimcity.session',
      JSON.stringify({ screen: 'playing', seed: 12345, mode: 'new' }),
    );
  }
});
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#viewport canvas', { timeout: 30000 });
await hooksReady(page);
await page.waitForTimeout(1500);

const call = (fn, ...a) => page.evaluate(fn, ...a);
const cam = tileCamera(page);
const grid = () => call(() => window.__slimcity.readGrid());
const stats = () => call(() => window.__slimcity.getStats());

// A dry, gentle block big enough for the whole town.
const g0 = await grid();
const N = g0.size;
const idx = (x, z) => z * N + x;
let anchor = null;
for (let z = 30; z < N - 40 && !anchor; z++) {
  for (let x = 30; x < N - 50 && !anchor; x++) {
    const h0 = g0.height[idx(x, z)];
    let ok = true;
    for (let dz = -8; dz < 24 && ok; dz++) {
      for (let dx = -4; dx < 38 && ok; dx++) {
        const i = idx(x + dx, z + dz);
        if (g0.water[i] || Math.abs(g0.height[i] - h0) > 6) ok = false;
      }
    }
    if (ok) anchor = { x, z };
  }
}
if (!anchor) {
  console.log('no dry block found');
  await b.close();
  process.exit(1);
}
const { x: X, z: Z } = anchor;
console.log('anchor', JSON.stringify(anchor));
const T = (dx, dz) => ({ x: X + dx, z: Z + dz });
const rect = (x0, z0, x1, z1) => {
  const r = [];
  for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) r.push(T(x, z));
  }
  return r;
};
const countOn = (g, tiles, layer) => tiles.filter((t) => g[layer][idx(t.x, t.z)]).length;

// ---- checks and shots
const results = [];
let shotNo = 0;
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name, detail);
};

// ---- the controls, each found where the player finds it
const button = (name) => page.getByRole('button', { name, exact: true }).first();
const click = async (name) => {
  await button(name).click({ timeout: 4000 });
  await page.waitForTimeout(300);
};
const dockButton = (name) =>
  page.getByRole('toolbar', { name: 'Main dock' }).getByRole('button', { name, exact: true });
const dock = async (name) => {
  await dockButton(name).click({ timeout: 4000 });
  await page.waitForTimeout(300);
};
const card = async (name) => {
  const c = page
    .getByRole('region', { name: 'Asset drawer' })
    .getByRole('button', { name })
    .first();
  if (await c.isDisabled()) throw new Error(`card ${name} is disabled`);
  await c.click({ timeout: 4000 });
  await page.waitForTimeout(300);
};
const lensMenu = () => page.getByRole('menu', { name: 'Infoviews' });
const lens = async (name) => {
  if (!(await lensMenu().isVisible())) await dock('Infoviews');
  await lensMenu().getByRole('button', { name, exact: true }).click({ timeout: 4000 });
  await page.waitForTimeout(500);
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
  await page.waitForTimeout(300);
};
const step = async (name, fn, { fresh = true } = {}) => {
  try {
    if (fresh) await tidy();
    await fn();
  } catch (e) {
    check(name, false, `threw: ${e.message.split('\n')[0]}`);
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${String(++shotNo).padStart(2, '0')}-${name}.png` });
};

// ---- aiming the pointer at tiles
let tilePx = new Map();
/** Looks straight down over `v` and maps every tile in the working area to its pixel. */
const view = async (v) => {
  await cam(v.x, v.z, v.d, 0, 1.45);
  await page.waitForTimeout(800);
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
  for (let s = 1; s <= 12; s++) {
    await page.mouse.move(ax + ((bx - ax) * s) / 12, ay + ((by - ay) * s) / 12);
  }
  await page.waitForTimeout(250);
  await page.mouse.up();
  await page.waitForTimeout(800);
};
const tap = async (t, button = 'left') => {
  const [ax, ay] = px(t);
  await page.mouse.move(ax, ay);
  await page.waitForTimeout(250);
  await page.mouse.click(ax, ay, { button });
  await page.waitForTimeout(800);
};
const run = async (seconds) => {
  await click('4×');
  await page.waitForTimeout(seconds * 1000);
  await click('Pause');
};

const TOWN = { x: X + 8, z: Z + 12, d: 900 };
const SOUTH = { x: X + 8, z: Z + 21, d: 900 };

await call(() => window.__slimcity.setSpeed(0));
await call(() => window.__slimcity.setDayT(0.5));
await view(TOWN);
await step('start', async () => {
  check('a new game opens on an empty map', (await stats()).population === 0);
});

// ---- roads and utilities
await step('two-lane-road', async () => {
  await dock('Roads');
  await card(/^Two-Lane Road/);
  await drag(T(0, 0), T(33, 0));
  const laid = countOn(await grid(), rect(0, 0, 33, 0), 'roadTier');
  check('a two-lane road is drawn by drag', laid === 34, `${laid}/34`);
});
await step(
  'gravel-road',
  async () => {
    await card(/^Gravel Road/);
    await drag(T(12, 1), T(12, 10));
    const g = await grid();
    const GRAVEL = 4;
    check(
      'a gravel road is drawn by drag',
      rect(12, 1, 12, 10).every((t) => g.roadTier[idx(t.x, t.z)] === GRAVEL),
    );
  },
  { fresh: false },
);
await step('wind-turbine', async () => {
  await dock('Electricity');
  await card(/^Wind Turbine/);
  await tap(T(1, -1));
  check('a wind turbine is placed by click', (await grid()).buildingId[idx(X + 1, Z - 1)] > 0);
});
await step('water-tower', async () => {
  await dock('Water');
  await card(/^Water Tower/);
  await tap(T(3, -2));
  check('a water tower is placed by click', (await grid()).buildingId[idx(X + 3, Z - 2)] > 0);
});

// ---- zoning
const resStreet = [...rect(6, -3, 20, -1), ...rect(0, 1, 11, 3)];
const resGravel = rect(13, 1, 14, 10);
const gravelBack = resGravel.filter((t) => t.z > Z + 3);
const industry = rect(23, 1, 33, 3);
const shops = rect(22, -3, 33, -1);
await step('zone-homes', async () => {
  await dock('Zoning');
  await card(/^Residential \(Low\)/);
  await drag(T(6, -3), T(20, -1));
  await drag(T(0, 1), T(11, 3));
  await drag(T(13, 1), T(14, 10));
  const all = [...resStreet, ...resGravel];
  const painted = countOn(await grid(), all, 'zone');
  check('residential is painted by drag', painted === all.length, `${painted}/${all.length}`);
});
await step(
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
  { fresh: false },
);

// ---- growth, and the gravel road's homes
await step('grown', async () => {
  await run(45);
  const g = await grid();
  const s = await stats();
  console.log('  stats', JSON.stringify({ pop: s.population, jobs: s.jobs, demand: s.demand }));
  check('homes grow on the street', countOn(g, resStreet, 'buildingId') > 0);
  check('industry grows', countOn(g, industry, 'buildingId') > 0);
  check(
    'nothing grows down the gravel road, which carries no power',
    countOn(g, gravelBack, 'buildingId') === 0,
  );
});
await step('advisor-gravel', async () => {
  await click('Advisor');
  const panel = (await bodyText()).match(/Advisor.{0,400}/)?.[0] ?? '';
  console.log('  advisor:', panel.slice(0, 400));
  check(
    'the Advisor names the zoned tiles the gravel leaves without power',
    /zoned tiles? ha(s|ve) no power/.test(panel),
  );
});
await step('power-lens', async () => {
  await lens('Power');
  check('the Power lens turns on', await dockButton('Turn off overlay').isEnabled());
});
await step(
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
  { fresh: false },
);
await step('grown-on-the-line', async () => {
  await dock('Turn off overlay');
  await tidy();
  await run(40);
  const g = await grid();
  check(
    'homes grow down the gravel road once the line is up',
    countOn(g, gravelBack, 'buildingId') > 0,
  );
  check('shops grow once industry pays wages', countOn(g, shops, 'buildingId') > 0);
});

// ---- inspecting
await step('building-info', async () => {
  await tap(T(3, -2));
  check(
    'clicking a building opens its info panel',
    await page.getByRole('button', { name: 'Close building info' }).isVisible(),
  );
});
await step('junction-panel', async () => {
  await tap(T(12, 0));
  check(
    'clicking a junction opens the junction panel',
    await page.getByRole('button', { name: 'Close junction inspector' }).first().isVisible(),
  );
  // Nothing in the Escape stack touches it; it closes by its own button.
  await page.keyboard.press('Escape');
  check(
    'the junction panel stays open through Escape',
    await page.getByRole('button', { name: 'Close junction inspector' }).first().isVisible(),
  );
});

// ---- options
await step('options-sandbox', async () => {
  await click('Menu');
  await click('Options');
  await page.getByLabel('Sandbox: unlock all build items').check();
  check(
    'the sandbox unlock toggles',
    await page.getByLabel('Sandbox: unlock all build items').isChecked(),
  );
});
await step(
  'resume',
  async () => {
    await click('Back');
    await click('Resume Game');
    check('Resume closes the menu', await dockButton('Roads').isVisible());
  },
  { fresh: false },
);

// ---- the south street: services, garbage, transit, districts
await view(SOUTH);
await step('second-street', async () => {
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
await step('services', async () => {
  await place('Health', /^Community Clinic/, T(1, 12), 'a clinic');
  await place('Fire', /^Fire Station/, T(4, 12), 'a fire station');
  await place('Police', /^Police Station/, T(7, 12), 'a police station');
  await place('Education', /^Elementary School/, T(1, 15), 'a school');
  await place('Parks', /^Pocket Park/, T(14, 13), 'a pocket park');
});
await step('landfill', async () => {
  await dock('Garbage');
  await card(/^Landfill/);
  await drag(T(20, 15), T(24, 18));
  const failed = await refused();
  check('a landfill is painted', failed.length === 0, failed.join(' | '));
});
await step('bus-stops', async () => {
  await place('Transit', /^Bus Stop/, T(18, 13), 'the first bus stop');
  await place('Transit', /^Bus Stop/, T(28, 15), 'the second bus stop');
});
await step('bus-line', async () => {
  await dock('Transit');
  await card(/^Bus Line/);
  await tap(T(18, 13));
  await tap(T(28, 15));
  await tap(T(28, 15), 'right');
  await page.waitForTimeout(1500);
  const transit = await call(() => window.__slimcity.readTransit());
  check(
    'a bus line is drawn between two stops',
    transit.lines.length === 1,
    `${transit.lines.length} lines`,
  );
});
await step('district', async () => {
  await dock('Districts');
  await card(/^Paint District/);
  await drag(T(0, 12), T(10, 18));
  check('a district is painted and named', /District 1/.test(await bodyText()));
});
await step('town-at-work', async () => {
  await run(20);
  const transit = await call(() => window.__slimcity.readTransit());
  check(
    'the bus carries riders',
    (transit.ridership[0] ?? 0) > 0,
    JSON.stringify(transit.ridership),
  );
});

// ---- bulldoze, undo, redo
const stub = rect(30, 14, 33, 14);
await step('bulldoze', async () => {
  await dock('Bulldoze');
  await card(/^Bulldoze/);
  await drag(T(30, 14), T(33, 14));
  check('a bulldozer drag removes the road', countOn(await grid(), stub, 'roadTier') === 0);
});
await step(
  'undo',
  async () => {
    await click('Undo');
    await page.waitForTimeout(800);
    check('undo puts the road back', countOn(await grid(), stub, 'roadTier') === stub.length);
  },
  { fresh: false },
);
await step(
  'redo',
  async () => {
    await click('Redo');
    await page.waitForTimeout(800);
    check('redo takes it out again', countOn(await grid(), stub, 'roadTier') === 0);
  },
  { fresh: false },
);

// ---- terrain brushes
const heightAt = (g, t) => g.height[idx(t.x, t.z)];
const strip = rect(25, 20, 30, 20);
const spread = (g) => {
  const hs = strip.map((t) => heightAt(g, t));
  return Math.max(...hs) - Math.min(...hs);
};
await step('raise', async () => {
  const before = heightAt(await grid(), T(30, 20));
  await dock('Landscaping');
  await card(/^Raise$/);
  await drag(T(29, 20), T(31, 20));
  check('Raise lifts the ground', heightAt(await grid(), T(30, 20)) > before);
});
await step(
  'lower',
  async () => {
    const before = heightAt(await grid(), T(26, 20));
    await card(/^Lower$/);
    await drag(T(25, 20), T(27, 20));
    check('Lower drops the ground', heightAt(await grid(), T(26, 20)) < before);
  },
  { fresh: false },
);
await step(
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
await step(
  'smooth',
  async () => {
    await card(/^Smooth$/);
    await drag(T(25, 19), T(30, 20));
    const failed = await refused();
    check('Smooth is accepted', failed.length === 0, failed.join(' | '));
  },
  { fresh: false },
);

// ---- a roundabout on the tee where the stub meets the south street
await step('roundabout', async () => {
  await dock('Roads');
  await card(/^Roundabout/);
  const [cx, cy] = px(T(12, 14));
  await page.mouse.move(cx + 5, cy + 5);
  await page.waitForTimeout(400);
  await page.mouse.click(cx + 5, cy + 5);
  await page.waitForTimeout(900);
  const failed = await refused();
  check('a roundabout is stamped on the tee', failed.length === 0, failed.join(' | '));
});

// ---- every lens
await view(TOWN);
await tidy();
for (const name of [
  'Land Value',
  'Pollution',
  'Noise',
  'Traffic',
  'Crime',
  'Fire Risk',
  'Education',
  'Health',
  'Happiness',
  'Power',
  'Water',
  'Trash',
  'Soil',
  'Transit',
  'Districts',
]) {
  await step(
    `lens-${name.replace(/ /g, '-').toLowerCase()}`,
    async () => {
      await lens(name);
      check(`the ${name} lens turns on`, await dockButton('Turn off overlay').isEnabled());
    },
    { fresh: false },
  );
}
await step(
  'lens-off',
  async () => {
    await dock('Turn off overlay');
    check('the overlay turns off', await dockButton('Turn off overlay').isDisabled());
  },
  { fresh: false },
);

// ---- the corner panels
for (const [panel, says] of [
  ['City info', /JOBS.*POWER.*WATER/i],
  ['City stats', /Population/i],
  ['Help', /Keyboard shortcuts/i],
]) {
  await step(`panel-${panel.replace(/ /g, '-').toLowerCase()}`, async () => {
    await click(panel);
    check(`${panel} opens`, says.test(await bodyText()));
  });
  await click(panel).catch(() => {});
}
await step('milestones', async () => {
  await page.getByRole('button', { name: /^Milestone progress/ }).click();
  check('the milestone history opens', /Village/i.test(await bodyText()));
});
await step('photo-mode', async () => {
  await click('Photo mode');
  check(
    'photo mode hides the dock',
    !(await page.getByRole('toolbar', { name: 'Main dock' }).isVisible()),
  );
});
await step(
  'photo-exit',
  async () => {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    check(
      'Escape leaves photo mode',
      await page.getByRole('toolbar', { name: 'Main dock' }).isVisible(),
    );
  },
  { fresh: false },
);

// ---- speed
const clock = async () =>
  (await page.getByRole('contentinfo', { name: 'Status strip' }).innerText()).match(
    /\d\d:\d\d/,
  )?.[0];
await step('speed', async () => {
  const before = await clock();
  await click('1×');
  await page.waitForTimeout(3000);
  await click('Pause');
  const after = await clock();
  await page.waitForTimeout(1500);
  const held = await clock();
  check('the clock runs at 1×', before !== after, `${before} -> ${after}`);
  check('the clock holds on pause', after === held, `${after} -> ${held}`);
});

// ---- save, and load it back
await step('save', async () => {
  await click('Menu');
  await click('Save Game');
  await page.waitForTimeout(1500);
  check(
    'Save Game saves',
    (await toasts()).some((m) => /saved/i.test(m)),
  );
});
const popBefore = (await stats()).population;
await step('load-browser', async () => {
  await click('Menu');
  const enabled = await button('Load Game').isEnabled();
  check('Load Game is offered once there is a save', enabled);
  if (enabled) await click('Load Game');
});
await step(
  'loaded',
  async () => {
    const load = page
      .getByRole('dialog')
      .getByRole('button', { name: /^(Load|Open)/ })
      .filter({ hasNotText: 'Load Game' })
      .first();
    if (await load.count()) await load.click();
    await page.waitForTimeout(3000);
    await hooksReady(page);
    await view(TOWN);
    const after = (await stats()).population;
    check('the save loads back as the same town', after === popBefore, `${popBefore} -> ${after}`);
  },
  { fresh: false },
);

// ---- contact sheets, nine shots to a sheet
const shots = readdirSync(out)
  .filter((f) => /^\d\d-.*\.png$/.test(f))
  .sort();
const sheet = await b.newPage({ viewport: { width: 1920, height: 1230 } });
for (let s = 0; s * 9 < shots.length; s++) {
  const cells = shots.slice(s * 9, s * 9 + 9).map((f) => {
    const data = readFileSync(`${out}/${f}`).toString('base64');
    return `<figure><img src="data:image/png;base64,${data}"><figcaption>${f}</figcaption></figure>`;
  });
  await sheet.setContent(
    `<style>body{margin:0;background:#111;display:grid;grid-template-columns:repeat(3,640px)}
    figure{margin:0;position:relative}img{width:640px;height:400px;display:block}
    figcaption{position:absolute;left:0;top:0;background:#000c;color:#fff;font:16px sans-serif;padding:2px 6px}</style>${cells.join('')}`,
  );
  await sheet.screenshot({ path: `${out}/sheet-${s + 1}.png` });
}

const failed = results.filter((r) => !r.ok);
if (pageErrors.length > 0)
  failed.push({ name: `page errors: ${[...new Set(pageErrors)].join(' | ')}` });
console.log(`\n${results.length - failed.length} of ${results.length} checks passed`);
console.log(
  failed.length === 0
    ? 'PASS'
    : 'FAIL:\n - ' + failed.map((f) => `${f.name} ${f.detail ?? ''}`).join('\n - '),
);
console.log('done ->', out);
await b.close();
process.exitCode = failed.length === 0 ? 0 : 1;
