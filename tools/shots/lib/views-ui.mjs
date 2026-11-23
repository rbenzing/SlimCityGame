/** Series of type `views`: how the game shows itself (the underground view, a lens, a panel, a
 * placement preview, the night), photographed through the real controls.
 *
 * A series' `frames` each name a `subject` (a sheet row), a `view` (the column and the frame's
 * name, `<subject>-<view>`) and what the frame `shows`. A frame is one of:
 *   camera(scene)  the scene from a camera `{ tx, tz, distance, yaw, pitch }`
 *   full: true     the page as the player sees it, HUD included, whatever its setup opened;
 *                  with a `camera` it is aimed first, without one the camera stays as it was
 *                  (a subject's one plain full frame is the view 'full', the standard's name)
 * and may carry `setup(session, scene)` (open a panel, pick a tool, set a lens; runs after the
 * camera is aimed, just before the frame), `check(session, scene)` (throws when what the
 * player sees is wrong), `clip(session, scene)` (a page rectangle, so the frame is one panel),
 * `after(session, scene)` (lets go of a held mouse button, closes what the frame opened) and
 * `viewport` (`{ width, height }` the window is set to for this frame, then put back).
 * `scene(session, { tile, catalogBox })` builds the ground once, on the one page;
 * `catalogBox(id)` is a catalog entry's footprint, ready for `buildSite`.
 */
import { pixelOn } from './roads.mjs';
import { settle } from './session.mjs';

const WINDOW = { width: 1280, height: 800 };
const CLICK_MS = 15000;
/** Escapes pressed, at most, to reach the plain view from wherever a frame left the game. */
const MAX_ESCAPES = 6;
/** The smallest touch target, in CSS px (WCAG 2.5.8). */
export const MIN_TARGET = 24;

export function checkViews(spec) {
  if (!spec.frames?.length) throw new Error('a views series needs frames');
  const names = new Set();
  for (const f of spec.frames) {
    const name = `${f.subject}-${f.view}`;
    if (!spec.subjects.some((s) => s.id === f.subject))
      throw new Error(`frame ${name} names unknown subject '${f.subject}'`);
    if (!f.shows) throw new Error(`frame ${name} says nothing about what it shows`);
    if (!f.camera && !f.full) throw new Error(`frame ${name} needs a camera or full`);
    if (names.has(name)) throw new Error(`two frames are named ${name}`);
    names.add(name);
  }
}

async function resize(page, { width, height }) {
  await page.setViewportSize({ width, height });
  await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [width, height]);
  await settle(page);
}

export async function photographViews(session, spec, ctx) {
  const { page } = session;
  const scene = spec.scene ? await spec.scene(session, ctx) : {};
  await settle(page);
  for (const frame of spec.frames) {
    const name = `${frame.subject}-${frame.view}`;
    if (frame.viewport) await resize(page, frame.viewport);
    // Aimed before its setup, so a setup that points the mouse at a tile points at it.
    if (frame.camera) {
      const cam = frame.camera(scene);
      await ctx.aim(cam.tx, cam.tz, cam.distance, cam.yaw, cam.pitch);
      await settle(page);
    }
    if (frame.setup) await frame.setup(session, scene);
    if (frame.check) await frame.check(session, scene);
    const clip = frame.clip ? await frame.clip(session, scene) : null;
    await ctx.capture(name, clip ? { clip } : undefined);
    if (frame.after) await frame.after(session, scene);
    if (frame.viewport) await resize(page, WINDOW);
  }
}

// ---------------------------------------------------------------------------
// Driving the real controls.
// ---------------------------------------------------------------------------

export const dockButton = (page, name) =>
  page.getByRole('toolbar', { name: 'Main dock' }).getByRole('button', { name, exact: true });
export const infoviews = (page) => page.getByRole('menu', { name: 'Infoviews' });
export const lensButton = (page, name) =>
  infoviews(page).getByRole('button', { name, exact: true });
/** The chip a view carries: it says which view the player is in and has the way out. */
export const viewChip = (page) => page.getByRole('group', { name: 'Active view' });
export const getView = (page) => page.evaluate(() => window.__slimcity.getView());
export const isUnderground = async (page) =>
  (await page.evaluate(() => window.__slimcity.readUnderground())).active;

export async function dock(page, name) {
  await dockButton(page, name).click({ timeout: CLICK_MS });
  await settle(page);
}

/** Turn a lens on through the Infoviews grid, leaving the grid shut. */
export async function chooseLens(page, name) {
  if (!(await infoviews(page).isVisible())) await dock(page, 'Infoviews');
  await lensButton(page, name).click({ timeout: CLICK_MS });
  if (await infoviews(page).isVisible()) await dock(page, 'Infoviews');
}

/** Take the Water Pipe tool in hand through the Water drawer, as a player does. */
export async function pickWaterPipe(page) {
  await dock(page, 'Water');
  await page
    .getByRole('region', { name: 'Asset drawer' })
    .getByRole('button', { name: /Water Pipe/ })
    .first()
    .click({ timeout: CLICK_MS });
  await settle(page);
}

/** Choose a road in the Roads drawer by its tab and card, opening the drawer if it is shut. */
export async function pickRoad(page, tab, card) {
  // The Roads button toggles the drawer, so it is pressed only when the tabs are not there.
  if ((await page.getByRole('tab', { name: tab }).count()) === 0) await dock(page, 'Roads');
  await page.getByRole('tab', { name: tab }).click({ timeout: CLICK_MS });
  await settle(page);
  await page.getByRole('button', { name: new RegExp(`^${card}\\b`) }).click({ timeout: CLICK_MS });
  await settle(page);
}

/** Shut the asset drawer if it is open; Escape keeps the tool in hand. */
export async function closeDrawer(page) {
  if (await page.getByRole('region', { name: 'Asset drawer' }).isVisible())
    await press(page, 'Escape');
}

const hasGhost = () => window.__slimcity.ghostBounds() !== null;

/** Drag the tool in hand from one tile to another and stay there, button down: the preview shows. */
export async function dragPreview(page, from, to) {
  const a = await pixelOn(page, from.x, from.z, 0.5, 0.5);
  const b = await pixelOn(page, to.x, to.z, 0.5, 0.5);
  if (!a || !b) throw new Error(`no pixel maps to tile ${from.x},${from.z} or ${to.x},${to.z}`);
  await page.mouse.move(a[0], a[1], { steps: 4 });
  await page.mouse.down();
  await page.mouse.move(b[0], b[1], { steps: 12 });
  await settle(page, { until: hasGhost });
}

/** Point the tool in hand at a tile (`fx`, `fz` across it) without pressing: its preview shows. */
export async function hoverPreview(page, tile, [fx, fz] = [0.5, 0.5]) {
  const p = await pixelOn(page, tile.x, tile.z, fx, fz);
  if (!p) throw new Error(`no pixel maps to tile ${tile.x},${tile.z}`);
  await page.mouse.move(p[0], p[1], { steps: 4 });
  await settle(page, { until: hasGhost });
}

/** Cancel the drag and let go, so nothing is laid. */
export async function endPreview(page) {
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await settle(page);
}

/** The ghost's extent across the street, in metres, and along it. */
export async function ghostSize(page) {
  const b = await page.evaluate(() => window.__slimcity.ghostBounds());
  if (!b) throw new Error('no ghost is drawn');
  return { across: b.maxZ - b.minZ, along: b.maxX - b.minX };
}

export async function press(page, key) {
  await page.keyboard.press(key);
  await settle(page);
}

/** Escape until nothing is open, so a frame starts from the plain view whatever the last one did. */
export async function plain(page) {
  for (let i = 0; i < MAX_ESCAPES; i++) {
    const v = await getView(page);
    if (v.tool === 'select' && v.overlay === null && !(await infoviews(page).isVisible())) return;
    await press(page, 'Escape');
  }
  throw new Error(`Escape x${MAX_ESCAPES} did not reach the plain view`);
}

// ---------------------------------------------------------------------------
// What a layout must hold at a window width; each returns the problems it found.
// ---------------------------------------------------------------------------

/** Throw naming every problem, so a frame is not taken of a broken layout. */
export function expectNone(problems) {
  const found = problems.filter(Boolean);
  if (found.length > 0) throw new Error(found.join('; '));
}

/**
 * Size, and whether the element at the centre of the button is the button itself (or inside
 * it). Scrolls the button into view first, which a sideways scrolling strip allows.
 */
export async function controlProblems(label, locator) {
  await locator.scrollIntoViewIfNeeded({ timeout: CLICK_MS });
  const p = await locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      w: r.width,
      h: r.height,
      inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
      reachable: hit !== null && (el === hit || el.contains(hit)),
      covers: hit && !el.contains(hit) ? (hit.getAttribute('aria-label') ?? hit.tagName) : null,
      width: innerWidth,
    };
  });
  return [
    !p.reachable && `${p.width}: ${label} is covered by ${p.covers}`,
    !p.inside && `${p.width}: ${label} lies outside the window`,
    (p.w < MIN_TARGET || p.h < MIN_TARGET) &&
      `${p.width}: ${label} is ${p.w.toFixed(0)}x${p.h.toFixed(0)}, under ${MIN_TARGET}x${MIN_TARGET}`,
  ];
}

/** Whether the element at `selector` stays in the window and clear of the dock. */
export async function panelProblems(page, label, selector) {
  const box = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const dock = document.querySelector('[role="toolbar"][aria-label="Main dock"]');
    return {
      l: r.left,
      r: r.right,
      b: r.bottom,
      dockTop: dock ? dock.getBoundingClientRect().top : innerHeight,
      w: innerWidth,
    };
  }, selector);
  if (!box) return [`${label} is not on the page`];
  return [
    (box.l < -0.5 || box.r > box.w + 0.5) && `${box.w}: ${label} runs past the window edge`,
    box.b > box.dockTop + 0.5 && `${box.w}: ${label} runs under the dock`,
  ];
}

/** Whether the chip clears the dock, the status strip and the corner buttons. */
export async function chipClearProblems(page) {
  const boxes = await page.evaluate(() => {
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { l: r.left, t: r.top, r: r.right, b: r.bottom };
    };
    const chip = document.querySelector('[aria-label="Active view"]');
    const others = [
      ...document.querySelectorAll('[role="toolbar"], [role="contentinfo"]'),
      ...document.querySelectorAll(
        'button[aria-label="City info"], button[aria-label="Advisor"], button[aria-label="Menu"]',
      ),
    ].map((e) => ({ name: e.getAttribute('aria-label') ?? e.tagName, ...rect(e) }));
    return { chip: chip ? rect(chip) : null, others };
  });
  if (!boxes.chip) return ['no chip on the page'];
  return boxes.others.map(
    (o) =>
      boxes.chip.l < o.r &&
      boxes.chip.r > o.l &&
      boxes.chip.t < o.b &&
      boxes.chip.b > o.t &&
      `the chip covers ${o.name}`,
  );
}

/**
 * Every control of the dock, the status strip and the top corners is reachable and a target;
 * the strips that cannot fit scroll sideways; no fixed layer is wider than the window.
 */
export async function hudProblems(page) {
  const found = [];
  const dockStrip = page.getByRole('group', { name: 'Build categories' });
  const labels = await dockStrip
    .getByRole('button')
    .evaluateAll((els) => els.map((e) => e.ariaLabel));
  for (const name of labels)
    found.push(...(await controlProblems(`dock category ${name}`, dockButton(page, name))));
  const overflows = await dockStrip.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  const scrolls = await dockStrip.evaluate((el) => getComputedStyle(el).overflowX === 'auto');
  found.push(overflows && !scrolls && 'the category strip overflows and cannot scroll');
  await dockStrip.evaluate((el) => (el.scrollLeft = 0));
  found.push(...(await controlProblems('Infoviews button', dockButton(page, 'Infoviews'))));
  found.push(
    ...(await controlProblems(
      'Milestone button',
      page.getByRole('button', { name: /Milestone progress/ }),
    )),
  );
  const status = page.getByRole('contentinfo', { name: 'Status strip' });
  for (const name of ['1×', '2×', '4×', 'Undo', 'Redo', /Happiness/])
    found.push(
      ...(await controlProblems(`status strip ${name}`, status.getByRole('button', { name }))),
    );
  const statusFits = await status.evaluate(
    (el) => el.scrollWidth <= el.clientWidth + 1 || getComputedStyle(el).overflowX === 'auto',
  );
  found.push(!statusFits && 'the status strip overflows and cannot scroll');
  for (const name of ['City info', 'Advisor', 'City stats', 'Photo mode', 'Help', 'Menu'])
    found.push(
      ...(await controlProblems(
        `corner button ${name}`,
        page.getByRole('button', { name, exact: true }),
      )),
    );
  const wide = await page.evaluate(() =>
    [...document.querySelectorAll('#ui-root *')]
      .filter((e) => getComputedStyle(e).position === 'fixed')
      .filter((e) => e.getBoundingClientRect().right > innerWidth + 0.5)
      .map((e) => e.getAttribute('aria-label') ?? e.className.slice(0, 40)),
  );
  found.push(wide.length > 0 && `fixed elements past the right edge: ${JSON.stringify(wide)}`);
  return found;
}

/**
 * Mark the Services panel (the fixed card holding the load gauges) so it can be measured and
 * clipped, and return its selector. Throws when no service lens or tool has opened it.
 */
export async function markServicesPanel(page) {
  const marked = await page.evaluate(() => {
    const row = document.querySelector('[data-testid="service-load-police"]');
    const card = row?.closest('.fixed');
    if (!card) return false;
    card.setAttribute('data-shots-panel', 'services');
    return true;
  });
  if (!marked) throw new Error('the Services panel is not on the page');
  return '[data-shots-panel="services"]';
}

/** A page rectangle round the element at `selector`, for a frame that is one panel. */
export const clipOf = (page, selector) =>
  page.evaluate((sel) => {
    const r = document.querySelector(sel).getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  }, selector);
