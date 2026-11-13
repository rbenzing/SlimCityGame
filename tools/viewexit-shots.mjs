/** View-exit shots: every view the player can enter says it is on and has a way out.
 *
 * Drives the real controls (the dock, the Infoviews grid, the Water drawer, the
 * keyboard) and fails unless each way out ends in the plain view:
 *   a. Pollution lens on -> chip shot -> Escape -> lens off.
 *   b. Pipe tool in hand -> underground chip shot -> Escape -> tool `select`, city on the surface.
 *   c. Water lens + pipe tool -> the chip's "Exit" -> both cleared.
 *   d. Infoviews grid open -> Escape closes it.
 *   e. At a narrow window the chip stays clear of the dock, status strip and corner buttons.
 * It also reports faults found on the way: a lens that will not turn off through
 * None, a second click or "Turn off overlay"; an underground view that lingers;
 * an Infoviews grid that will not reopen.
 *
 * Usage: node tools/viewexit-shots.mjs [baseUrl] [outDir]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { cleanShot, hooksReady, unlimitedMoneyOption } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-viewexit';
mkdirSync(out, { recursive: true });

const CLICK_MS = 15000;
const browser = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});
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

const failures = [];
const check = (ok, what) => {
  if (!ok) {
    failures.push(what);
    console.log('FAILED check:', what);
  }
};
const faults = [];
const fault = (what) => {
  faults.push(what);
  console.log('FAULT:', what);
};

const dockButton = (name) =>
  page.getByRole('toolbar', { name: 'Main dock' }).getByRole('button', { name, exact: true });
const dock = async (name) => {
  await dockButton(name).click({ timeout: CLICK_MS });
  await page.waitForTimeout(300);
};
const grid = () => page.getByRole('menu', { name: 'Infoviews' });
const gridOpen = () => grid().isVisible();
const openGrid = async () => {
  if (!(await gridOpen())) await dock('Infoviews');
};
const closeGrid = async () => {
  if (await gridOpen()) await dock('Infoviews');
};
const lensButton = (name) => grid().getByRole('button', { name, exact: true });
const view = () => page.evaluate(() => window.__slimcity.getView());
const underground = async () =>
  (await page.evaluate(() => window.__slimcity.readUnderground())).active;
const chip = () => page.getByRole('group', { name: 'Active view' });
const press = async (key) => {
  await page.keyboard.press(key);
  await page.waitForTimeout(400);
};
const shot = async (name) => {
  await page.waitForTimeout(1200);
  await cleanShot(page, `${out}/${name}.png`);
  console.log('shot', name);
};
const pickPipe = async () => {
  await dock('Water');
  await page
    .getByRole('region', { name: 'Asset drawer' })
    .getByRole('button', { name: /Water Pipe/ })
    .first()
    .click({ timeout: CLICK_MS });
  await page.waitForTimeout(500);
};
/** Escape until nothing is left, so a step starts from the plain view whatever the last one did. */
const plain = async () => {
  for (let i = 0; i < 6; i++) await press('Escape');
  const v = await view();
  check(
    v.tool === 'select' && v.overlay === null && !(await gridOpen()),
    'Escape x6 did not reach the plain view',
  );
};

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#viewport canvas', { timeout: 30000 });
  await hooksReady(page);
  await page.waitForFunction(() => !!window.__slimcity.getView, null, { timeout: 20000 });
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.__slimcity.setSpeed(0));
  await page.evaluate(() => window.__slimcity.setDayT(0.5));

  // Plain start: no chip.
  check(!(await chip().count()), 'a chip shows in the plain view');

  // a. Pollution lens: chip, then Escape.
  await openGrid();
  await lensButton('Pollution').click({ timeout: CLICK_MS });
  await closeGrid();
  await page.waitForTimeout(500);
  check((await view()).overlay !== null, 'a: the Pollution lens did not turn on');
  check(
    await chip().filter({ hasText: 'Pollution lens' }).isVisible(),
    'a: no "Pollution lens" chip',
  );
  check(
    (await dockButton('Infoviews').getAttribute('aria-pressed')) === 'true',
    'a: the Infoviews button does not read as on under a lens',
  );
  await shot('a-lens-chip');
  await press('Escape');
  check((await view()).overlay === null, 'a: Escape did not clear the lens');
  check(!(await chip().count()), 'a: the chip stayed after the lens went');
  await shot('a-lens-off');

  // b. Pipe tool: underground chip, then Escape (drawer first, then the tool).
  await pickPipe();
  check((await view()).tool === 'water.pipe', 'b: the pipe tool did not come to hand');
  check(await underground(), 'b: the pipe tool did not take the city underground');
  await press('Escape'); // the drawer
  check((await view()).tool === 'water.pipe', 'b: Escape on the drawer dropped the tool too');
  check(
    await chip().filter({ hasText: 'Underground view' }).isVisible(),
    'b: no "Underground view" chip',
  );
  await shot('b-underground-chip');
  await press('Escape'); // the tool
  check((await view()).tool === 'select', 'b: Escape did not drop the pipe tool');
  check(!(await underground()), 'b: the city stayed underground after the tool went');
  await shot('b-surface');

  // c. Water lens + pipe tool: the chip's own button.
  await openGrid();
  await lensButton('Water').click({ timeout: CLICK_MS });
  await closeGrid();
  await pickPipe();
  await press('Escape'); // the drawer
  let v = await view();
  check(
    v.overlay === 'watered' && v.tool === 'water.pipe',
    `c: setup wrong (${JSON.stringify(v)})`,
  );
  check(
    await chip().filter({ hasText: 'Water lens · underground' }).isVisible(),
    'c: no "Water lens · underground" chip',
  );
  await shot('c-water-lens-pipe');
  await page.getByRole('button', { name: 'Exit view' }).click({ timeout: CLICK_MS });
  await page.waitForTimeout(500);
  v = await view();
  check(v.overlay === null && v.tool === 'select', `c: Exit left ${JSON.stringify(v)}`);
  check(!(await underground()), 'c: the city stayed underground after Exit');
  check(!(await chip().count()), 'c: the chip stayed after Exit');

  // d. The Infoviews grid closes on Escape.
  await openGrid();
  check(await gridOpen(), 'd: the Infoviews grid did not open');
  await shot('d-grid-open');
  await press('Escape');
  check(!(await gridOpen()), 'd: Escape did not close the Infoviews grid');

  // e. A narrow window: the chip clears the dock, the status strip and the corner buttons.
  await page.setViewportSize({ width: 768, height: 800 });
  await page.waitForTimeout(500);
  await openGrid();
  await lensButton('Sewer').click({ timeout: CLICK_MS });
  await closeGrid();
  await pickPipe();
  await press('Escape');
  const boxes = await page.evaluate(() => {
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { l: r.left, t: r.top, r: r.right, b: r.bottom };
    };
    const chipEl = document.querySelector('[aria-label="Active view"]');
    const others = [
      ...document.querySelectorAll('[role="toolbar"], [role="contentinfo"]'),
      ...document.querySelectorAll(
        'button[aria-label="City info"], button[aria-label="Advisor"], button[aria-label="Menu"]',
      ),
    ].map((e) => ({ name: e.getAttribute('aria-label') ?? e.tagName, ...rect(e) }));
    return { chip: chipEl ? rect(chipEl) : null, others };
  });
  check(boxes.chip !== null, 'e: no chip at 768 wide');
  if (boxes.chip) {
    for (const o of boxes.others) {
      const hit =
        boxes.chip.l < o.r && boxes.chip.r > o.l && boxes.chip.t < o.b && boxes.chip.b > o.t;
      check(!hit, `e: the chip covers ${o.name} at 768 wide`);
    }
    console.log('narrow chip', JSON.stringify(boxes.chip));
  }
  await shot('e-narrow-chip');
  await page.getByRole('button', { name: 'Exit view' }).click({ timeout: CLICK_MS });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(400);
  await plain();

  // Faults on the way. Every lens turns off by None, a second click and the dock's button.
  await openGrid();
  const labels = (await grid().getByRole('button').allInnerTexts()).map((s) =>
    s.replace(/[^A-Za-z ]/g, '').trim(),
  );
  console.log('lenses', JSON.stringify(labels));
  for (const label of labels.filter((l) => l !== 'None')) {
    await openGrid();
    await lensButton(label).click({ timeout: CLICK_MS });
    if ((await view()).overlay === null) fault(`lens ${label} did not turn on`);
    await lensButton('None').click({ timeout: CLICK_MS });
    if ((await view()).overlay !== null) fault(`lens ${label} did not turn off through None`);
    await lensButton(label).click({ timeout: CLICK_MS });
    await lensButton(label).click({ timeout: CLICK_MS });
    if ((await view()).overlay !== null) fault(`lens ${label} did not turn off on a second click`);
    await lensButton(label).click({ timeout: CLICK_MS });
    await closeGrid();
    await page.getByRole('button', { name: 'Turn off overlay' }).click({ timeout: CLICK_MS });
    if ((await view()).overlay !== null)
      fault(`lens ${label} did not turn off through Turn off overlay`);
    if (await underground()) fault(`the city stayed underground after the ${label} lens went`);
    // The grid reopens however it was last left.
    await dock('Infoviews');
    if (!(await gridOpen())) fault(`the Infoviews grid did not reopen after the ${label} lens`);
  }
  await plain();

  // Underground lingering: tool dropped, and a Water-tab building placed.
  await page.evaluate(() => window.__slimcity.setTool('water.pipe'));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__slimcity.setTool('select'));
  await page.waitForTimeout(300);
  if (await underground()) fault('the city stayed underground after the pipe tool was dropped');
  await page.evaluate(() => window.__slimcity.setTool('plop.water-tower'));
  await page.waitForTimeout(300);
  const placed = await page.evaluate(() => {
    const g = window.__slimcity.readGrid();
    const N = g.size;
    for (let z = 20; z < N - 20; z += 3) {
      for (let x = 20; x < N - 20; x += 3) {
        const i = z * N + x;
        if (!g.water[i] && g.height[i] > 2 && g.height[i] < 20) {
          window.__slimcity.cmd('Tower', [
            { kind: 'placeBuilding', catalogId: 'water-tower', x, z, rotation: 0 },
          ]);
          return { x, z };
        }
      }
    }
    return null;
  });
  await page.waitForTimeout(1500);
  v = await view();
  console.log(
    'after placing a water building',
    JSON.stringify({ placed, view: v, underground: await underground() }),
  );
  if (v.tool === 'select' && (await underground()))
    fault('the city stayed underground after a water building was placed');
  if (v.tool !== 'select') {
    console.log(
      'note: a placed water building stays in hand, so the city stays underground until Escape',
    );
  }
  await plain();
  check(!(await underground()), 'the city is underground after the final Escape ladder');

  console.log('page errors', errors.length ? errors : 'none');
  if (errors.length) failures.push('page errors');
} catch (e) {
  console.log('error:', e.message);
  failures.push(e.message);
} finally {
  console.log('faults found', faults.length ? JSON.stringify(faults) : 'none');
  await browser.close();
}
if (failures.length) {
  console.log('FAILURES:', JSON.stringify(failures));
  process.exit(1);
}
