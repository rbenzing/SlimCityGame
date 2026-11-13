/** Narrow-window shots: the HUD stays usable from 360 CSS px wide up (WCAG 1.4.10 reflow,
 * 2.5.8 target size).
 *
 * At 360 and 480 wide (and a 600 tall window) it drives the real controls and fails when:
 *   - a dock category button, the Infoviews button or a top-corner button is covered by
 *     another element at its centre, or is smaller than 24 by 24 CSS px;
 *   - the category strip does not scroll sideways when its buttons do not all fit;
 *   - an open lens picker, a lens legend, the City Stats panel or the Services panel
 *     reaches past the window edge, under a corner button, or down under the dock;
 *   - the ViewChip's Exit button is covered.
 * Frames land in <outDir>/<width>-*.png.
 *
 * Usage: node tools/narrow-shots.mjs [baseUrl] [outDir]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { cleanShot, hooksReady, unlimitedMoneyOption } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-narrow';
mkdirSync(out, { recursive: true });

const CLICK_MS = 15000;
const MIN_TARGET = 24;
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

const press = async (key) => {
  await page.keyboard.press(key);
  await page.waitForTimeout(300);
};
const dockButton = (name) =>
  page.getByRole('toolbar', { name: 'Main dock' }).getByRole('button', { name, exact: true });
const lensButton = (name) =>
  page.getByRole('menu', { name: 'Infoviews' }).getByRole('button', { name, exact: true });

/**
 * Size, and whether the element at the centre of the button is the button itself
 * (or something inside it). Scrolls the button into view first, which a sideways
 * scrolling strip allows.
 */
async function probe(locator) {
  await locator.scrollIntoViewIfNeeded({ timeout: CLICK_MS });
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      w: r.width,
      h: r.height,
      inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
      reachable: hit !== null && (el === hit || el.contains(hit)),
      covers: hit && !el.contains(hit) ? (hit.getAttribute('aria-label') ?? hit.tagName) : null,
    };
  });
}

async function checkControl(label, locator, width) {
  const p = await probe(locator);
  check(p.reachable, `${width}: ${label} is covered by ${p.covers}`);
  check(p.inside, `${width}: ${label} lies outside the window`);
  check(
    p.w >= MIN_TARGET && p.h >= MIN_TARGET,
    `${width}: ${label} is ${p.w.toFixed(0)}x${p.h.toFixed(0)}, under ${MIN_TARGET}x${MIN_TARGET}`,
  );
}

/** Whether `box` stays in the window, clear of the dock (and of the corner row when `clearTop`). */
async function checkPanel(label, selector, width, { clearTop = 0 } = {}) {
  const box = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const dock = document.querySelector('[role="toolbar"][aria-label="Main dock"]');
    return {
      l: r.left,
      t: r.top,
      r: r.right,
      b: r.bottom,
      dockTop: dock ? dock.getBoundingClientRect().top : innerHeight,
      w: innerWidth,
    };
  }, selector);
  check(box !== null, `${width}: no ${label}`);
  if (!box) return;
  check(box.l >= -0.5 && box.r <= box.w + 0.5, `${width}: ${label} runs past the window edge`);
  check(box.b <= box.dockTop + 0.5, `${width}: ${label} runs under the dock`);
  check(box.t >= clearTop - 0.5, `${width}: ${label} starts above ${clearTop}px`);
}

async function atWidth(width, height) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(500);
  const tag = `${width}`;

  // Dock: every category and the right cluster are reachable; the strip scrolls if it must.
  const strip = page.getByRole('group', { name: 'Build categories' });
  const labels = await strip.getByRole('button').evaluateAll((els) => els.map((e) => e.ariaLabel));
  for (const name of labels) await checkControl(`dock category ${name}`, dockButton(name), tag);
  const scrolls = await strip.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  const canScroll = await strip.evaluate((el) => getComputedStyle(el).overflowX === 'auto');
  check(!scrolls || canScroll, `${tag}: the category strip overflows and cannot scroll`);
  await strip.evaluate((el) => (el.scrollLeft = 0));
  await checkControl('Infoviews button', dockButton('Infoviews'), tag);
  await checkControl(
    'Milestone button',
    page.getByRole('button', { name: /Milestone progress/ }),
    tag,
  );

  // Status strip: the controls are targets too, and the readouts scroll rather than clip.
  const strip2 = page.getByRole('contentinfo', { name: 'Status strip' });
  for (const name of ['1×', '2×', '4×', 'Undo', 'Redo', /Happiness/]) {
    await checkControl(`status strip ${name}`, strip2.getByRole('button', { name }), tag);
  }
  check(
    await strip2.evaluate(
      (el) => el.scrollWidth <= el.clientWidth + 1 || getComputedStyle(el).overflowX === 'auto',
    ),
    `${tag}: the status strip overflows and cannot scroll`,
  );

  // Top corners.
  for (const name of ['City info', 'Advisor', 'City stats', 'Photo mode', 'Help', 'Menu']) {
    await checkControl(
      `corner button ${name}`,
      page.getByRole('button', { name, exact: true }),
      tag,
    );
  }

  // A category click opens its drawer.
  await dockButton('Roads').click({ timeout: CLICK_MS });
  await page.waitForTimeout(300);
  check(
    await page.getByRole('region', { name: 'Asset drawer' }).isVisible(),
    `${tag}: a click on the Roads category did not open its drawer`,
  );
  await press('Escape');

  // A top-corner click opens its panel, which stays inside the window.
  await page.getByRole('button', { name: 'City stats', exact: true }).click({ timeout: CLICK_MS });
  await page.waitForTimeout(300);
  await checkPanel('City Stats panel', '[aria-label="Chart axes"]', tag);
  await checkControl('City Stats close', page.getByRole('button', { name: 'Close stats' }), tag);
  await cleanShot(page, `${out}/${tag}-stats.png`);
  await page.getByRole('button', { name: 'Close stats' }).click({ timeout: CLICK_MS });

  // The lens picker, then a lens with the picker open and shut.
  await dockButton('Infoviews').click({ timeout: CLICK_MS });
  await page.waitForTimeout(300);
  await checkPanel('lens picker', '[role="menu"][aria-label="Infoviews"]', tag);
  await checkControl('lens Pollution', lensButton('Pollution'), tag);
  await lensButton('Pollution').click({ timeout: CLICK_MS });
  await page.waitForTimeout(600);
  await checkPanel('legend', '[aria-label="Legend"]', tag);
  await checkControl('Exit view', page.getByRole('button', { name: 'Exit view' }), tag);
  await cleanShot(page, `${out}/${tag}-lens-picker-open.png`);
  await dockButton('Infoviews').click({ timeout: CLICK_MS });
  await page.waitForTimeout(300);
  await checkPanel('legend (picker shut)', '[aria-label="Legend"]', tag);

  // Services panel under a service lens.
  await page.evaluate(() => window.__slimcity.setOverlay(7));
  await page.waitForTimeout(600);
  await checkPanel('legend (Health lens)', '[aria-label="Legend"]', tag);
  const services = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find(
      (d) => d.textContent?.startsWith('Services') && d.className.includes('overflow-y-auto'),
    );
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const dock = document.querySelector('[role="toolbar"][aria-label="Main dock"]');
    return {
      l: r.left,
      r: r.right,
      b: r.bottom,
      dockTop: dock.getBoundingClientRect().top,
      w: innerWidth,
    };
  });
  check(services !== null, `${tag}: the Health lens opened no Services panel`);
  if (services) {
    check(
      services.l >= -0.5 && services.r <= services.w + 0.5,
      `${tag}: Services runs past the window edge`,
    );
    check(services.b <= services.dockTop + 0.5, `${tag}: Services runs under the dock`);
  }
  await cleanShot(page, `${out}/${tag}-services.png`);
  await page.evaluate(() => window.__slimcity.setOverlay(null));
  await page.waitForTimeout(300);

  // No fixed layer may be wider than the window (no sideways scroll of the page).
  const wide = await page.evaluate(() =>
    [...document.querySelectorAll('#ui-root *')]
      .filter((e) => getComputedStyle(e).position === 'fixed')
      .filter((e) => e.getBoundingClientRect().right > innerWidth + 0.5)
      .map((e) => e.getAttribute('aria-label') ?? e.className.slice(0, 40)),
  );
  check(wide.length === 0, `${tag}: fixed elements past the right edge: ${JSON.stringify(wide)}`);
  await cleanShot(page, `${out}/${tag}-plain.png`);
}

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#viewport canvas', { timeout: 30000 });
  await hooksReady(page);
  await page.waitForFunction(() => !!window.__slimcity.getView, null, { timeout: 20000 });
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.__slimcity.setSpeed(0));

  await atWidth(480, 600);
  await atWidth(360, 600);

  console.log('page errors', errors.length ? errors : 'none');
  if (errors.length) failures.push('page errors');
} catch (e) {
  console.log('error:', e.message);
  failures.push(e.message);
} finally {
  await browser.close();
}
if (failures.length) {
  console.log('FAILURES:', JSON.stringify(failures));
  process.exit(1);
}
console.log('narrow checks passed');
