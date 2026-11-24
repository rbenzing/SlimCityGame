/** Opening the game for a shot series: one browser, one page, one session.
 *
 * The page is 1280x800, in a sandbox with unlimited money, the simulation
 * paused and the clock at noon. Page errors and refused commands are recorded
 * for the runner to fail on.
 */
import { chromium } from 'playwright';
import { hooksReady } from './camera.mjs';

const SEED = 7;
const NOON = 0.5;
/** Frames drawn after a move or a command before the page is judged still. */
const SETTLE_FRAMES = 3;

/** Playwright's full Chromium with WebGPU switched on: the bundled headless shell cannot give three a WebGPU canvas. */
const WEBGPU_ARGS = [
  '--enable-unsafe-webgpu',
  '--ignore-gpu-blocklist',
  '--use-angle=d3d11',
  '--enable-features=WebGPU',
];
/** A console error from three's WebGPU renderer or a GPU validation failure: the frame is not what the game draws. */
const GPU_FAULT = /THREE\.WebGPURenderer|GPUValidationError/;

/** Titles of the toasts the game raised for a refused command, recorded as they appear. */
const watchRefusals = () => {
  window.__refused = [];
  const scan = () => {
    for (const el of document.querySelectorAll('[role="status"]')) {
      const title = el.children[1]?.children[0]?.textContent ?? '';
      const body = el.children[1]?.children[1]?.textContent ?? '';
      const text = `${title}: ${body}`;
      if (/ failed$/.test(title) && !window.__refused.includes(text)) window.__refused.push(text);
    }
  };
  new MutationObserver(scan).observe(document, { childList: true, subtree: true });
};

/**
 * Open the game ready to place things.
 *
 * Returns `{ page, backend, errors, send, refusals, close }`; `backend` is 'webgpu' or 'webgl2'.
 * `webgpu: true` (or SHOTS_WEBGPU=1) runs the real WebGPU backend; a THREE.WebGPURenderer or
 * GPUValidationError console error lands in `errors` on any backend and fails the series. `send(label, commands)`
 * runs one command batch through the game's own path.
 */
export async function openSession(
  url,
  { fresh = false, seed = SEED, bloom = false, webgpu = false } = {},
) {
  // SHOTS_WEBGL=1 asks for the WebGL2 fallback and wins; SHOTS_WEBGPU=1 asks every series for WebGPU.
  const wantGpu = process.env.SHOTS_WEBGL !== '1' && (webgpu || process.env.SHOTS_WEBGPU === '1');
  const browser = await chromium.launch(
    wantGpu
      ? { headless: true, channel: 'chromium', args: WEBGPU_ARGS }
      : { headless: true, args: ['--use-angle=default'] },
  );
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('[console.error]', m.text());
    if (m.type() === 'error' && GPU_FAULT.test(m.text())) errors.push(m.text());
    if (process.env.SHOTS_WEBGL === '1' && /WebGL ?2|WebGPU/i.test(m.text()))
      console.log('[renderer]', m.text());
  });
  // A `fresh` game is a player's first: no sandbox, no unlimited money, no unlocked rungs. Only
  // the first load starts a new game; a save loaded from the menu reloads the page with its own
  // session intent, which must survive.
  await page.addInitScript(
    ([session, plain]) => {
      try {
        if (!sessionStorage.getItem('slimcity.session'))
          sessionStorage.setItem('slimcity.session', JSON.stringify(session));
        if (!plain)
          localStorage.setItem(
            'slimcity.settings',
            JSON.stringify({ sandboxUnlockAll: true, unlimitedMoney: true }),
          );
      } catch (e) {
        void e;
      }
    },
    [{ screen: 'playing', seed, mode: 'new' }, fresh],
  );
  await page.addInitScript(watchRefusals);
  // SHOTS_WEBGL=1 hides WebGPU before the page loads, so the game takes its WebGL2 fallback.
  if (process.env.SHOTS_WEBGL === '1')
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined });
    });
  // The post-process pass is skipped by default (it destabilises long headless runs);
  // `bloom: true` (or SHOTS_BLOOM=1) keeps it, for a frame that depends on what the pass does to the scene.
  const query = bloom || process.env.SHOTS_BLOOM === '1' ? '' : '?nobloom';
  await page.goto(new URL(query, url).href, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#viewport canvas', { timeout: 60000 });
  await hooksReady(page);
  const backend = await page.evaluate(() => window.__slimcity.backend());
  console.log(`[backend] ${backend}`);
  if (wantGpu && backend !== 'webgpu')
    errors.push(`WebGPU was asked for but the page drew with ${backend}`);

  const send = (label, commands) =>
    page.evaluate(([l, c]) => window.__slimcity.cmd(l, c), [label, commands]);
  if (!fresh) {
    await send('Sandbox', [{ kind: 'setSandbox', on: true }]);
    await send('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
  }
  // The light follows the clock only when a snapshot lands, and a paused sim sends none, so
  // pinning the hour sends a no-op command and waits for the snapshot it brings.
  const pinDay = async (t) => {
    const before = await page.evaluate(() => window.__slimcity.snapshotCounts().snapshots);
    await page.evaluate((x) => window.__slimcity.setDayT(x), t);
    await send('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
    await settle(page, {
      until: (n) => window.__slimcity.snapshotCounts().snapshots > n,
      arg: before,
    });
  };
  await page.evaluate(() => window.__slimcity.setSpeed(0));
  // The hour is pinned with a command that turns money unlimited on, which a first game must not.
  if (fresh) await page.evaluate((t) => window.__slimcity.setDayT(t), NOON);
  else await pinDay(NOON);

  return {
    browser,
    page,
    backend,
    errors,
    send,
    pinDay,
    refusals: () => page.evaluate(() => window.__refused),
    close: () => browser.close(),
  };
}

/**
 * Wait until the frame is drawn after a camera move or a command.
 *
 * `until` is a page function (with `arg`) true once what was asked for exists:
 * the building standing, the ground level. Without one, the wait is the frames
 * alone. Frames are counted after the condition holds, so the draw that shows it
 * has happened. The page's queued road, lamp and tree work is done first, so a
 * large build is not caught part-drawn.
 */
export async function settle(page, { until, arg, timeout = 15000 } = {}) {
  if (until) await page.waitForFunction(until, arg, { timeout, polling: 100 });
  await page.evaluate(
    (n) =>
      new Promise((done) => {
        window.__slimcity?.flushDeferred?.();
        const tick = (left) => (left === 0 ? done() : requestAnimationFrame(() => tick(left - 1)));
        tick(n);
      }),
    SETTLE_FRAMES,
  );
}
