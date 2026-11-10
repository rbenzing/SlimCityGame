/** Aiming a shot harness at a tile.
 *
 * The harnesses pick their subject by tile, but the camera is placed in
 * metres, so every one of them needs the tile's size to convert. That figure
 * is read from the running app rather than written down here: a harness then
 * stays pointed at the tile it names whatever the size becomes, and cannot
 * quietly drift off to photograph empty ground while still producing a
 * plausible-looking picture.
 */

/**
 * Wait for the dev hooks a harness is about to call.
 *
 * A harness that reaches the page before the app has published them fails on
 * the hook rather than on whatever it was there to check — "cannot read
 * getStats of undefined", a hundred lines from anything it was testing. A
 * fixed sleep is not the same thing: it passes on a warm machine and fails on
 * a cold one, which is the worse of the two failures because it looks random.
 */
export const hooksReady = (page) =>
  page.waitForFunction(() => !!window.__slimcity && !!window.__slimcity.cmd, null, {
    timeout: 20000,
  });

const ready = (page) =>
  page.waitForFunction(
    () => !!window.__slimcity && !!window.__slimcity.setCamera && !!window.__slimcity.tileMeters,
    null,
    { timeout: 20000 },
  );

/** A camera aimed by tile, centred on it.
 *
 * `yaw` and `pitch` are optional and keep the rig's current angle when left
 * out, so a harness that only wants to move the eye can pass three arguments.
 */
export function tileCamera(page) {
  return async (tx, tz, distance, yaw, pitch) => {
    await ready(page);
    if (distance < CAMERA_MIN_DISTANCE) {
      // The rig re-clamps its own distance every frame, so a harness asking to
      // come closer than the player may simply gets the floor and a picture
      // that looks like the one it asked for. Detail comes from a bigger
      // viewport instead — see closeUp below.
      console.log(
        `[shotcam] distance ${distance} m is below the camera's ${CAMERA_MIN_DISTANCE} m floor; ` +
          `the shot will be taken at ${CAMERA_MIN_DISTANCE} m`,
      );
    }
    return page.evaluate(
      ([x, z, d, yy, pp]) => {
        const T = window.__slimcity.tileMeters();
        window.__slimcity.setCamera((x + 0.5) * T, (z + 0.5) * T, d, yy, pp);
      },
      [tx, tz, distance, yaw, pitch],
    );
  };
}

/**
 * The closest the camera goes. The player's own limit, applied by the rig on
 * every frame, so it binds the dev hook too.
 */
export const CAMERA_MIN_DISTANCE = 40;

/**
 * Render the next shots at `scale` times the linear resolution.
 *
 * The way to read fine paint is not a closer camera — there is a floor — but
 * more pixels over the same ground. Returns a function that puts the viewport
 * back, so a harness can take one detail shot without re-framing the rest.
 */
export async function closeUp(page, scale = 2) {
  const before = page.viewportSize();
  await page.setViewportSize({
    width: Math.round(before.width * scale),
    height: Math.round(before.height * scale),
  });
  return () => page.setViewportSize(before);
}

/**
 * The toasts on screen, as `{ title, body }`.
 *
 * `__slimcity.cmd` returns nothing, so the only sign that the game refused a
 * command is the toast it raises.
 */
export const readToasts = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[role="status"]')].map((el) => ({
      title: el.children[1]?.children[0]?.textContent ?? '',
      body: el.children[1]?.children[1]?.textContent ?? '',
    })),
  );

/**
 * Dismiss every toast, then let two frames paint so the next shot is clean.
 *
 * Toasts are re-rendered on dismissal, so the buttons are looked up afresh each
 * time round rather than held.
 */
export async function dismissToasts(page) {
  const dismiss = page.locator('button[aria-label="Dismiss notification"]');
  while ((await dismiss.count()) > 0) {
    await dismiss.first().click();
  }
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
}

/**
 * Take a screenshot that is known not to be of a refused command.
 *
 * A refused command raises a toast titled "<label> failed" and leaves the
 * subject unbuilt; a harness that shoots on photographs something other than
 * what its file name says, under an error banner. So a refusal throws, naming
 * the shot, unless `allowRefusal` (tested against "title body") says the shot is
 * OF that refusal, in which case the toast stays in frame and is dismissed
 * afterwards so it does not leak into the next shot. Any other toast is
 * dismissed before the shutter.
 */
export async function cleanShot(page, path, { allowRefusal } = {}) {
  const toasts = await readToasts(page);
  const refused = toasts.filter((t) => / failed$/.test(t.title));
  const unexpected = refused.filter((t) => !allowRefusal?.test(`${t.title} ${t.body}`));
  if (unexpected.length > 0) {
    throw new Error(
      `[shotcam] ${path}: the game refused a command — ` +
        unexpected.map((t) => `"${t.title}: ${t.body}"`).join('; '),
    );
  }
  for (const t of toasts) {
    if (/ failed$/.test(t.title)) continue;
    const text = `${t.title}: ${t.body}`;
    if (seenToasts.has(text)) continue;
    seenToasts.add(text);
    console.log(`[shotcam] ${path}: dismissed "${text}"`);
  }
  if (!alertsReported) {
    alertsReported = true;
    await logAlerts(page, path.replace(/\\/g, '/').split('/').slice(-2, -1)[0] ?? path);
  }
  if (refused.length === 0) await dismissToasts(page);
  await page.screenshot({ path });
  if (refused.length > 0) await dismissToasts(page);
}

const seenToasts = new Set();
let alertsReported = false;

/**
 * Print the advisor's open issues when the alert badge shows a count.
 *
 * A shot taken under a red "city in the red" badge is a shot of a town in
 * trouble, whatever its file name says. The advisor panel is opened to read the
 * titles and put back as it was found. Never throws: a missing badge or panel
 * only means there is nothing to report.
 */
export async function logAlerts(page, label) {
  try {
    const badge = page.locator('[aria-label$="critical issue"], [aria-label$="critical issues"]');
    if ((await badge.count()) === 0) return;
    const button = page.locator('button[aria-label="Advisor"]');
    const wasOpen = (await button.getAttribute('aria-pressed', { timeout: 2000 })) === 'true';
    // A DOM click, not a pointer one: a page busy rendering a big town can
    // miss the actionability window, and the toggle needs no pointer.
    const toggle = () => button.evaluate((el) => el.click());
    if (!wasOpen) await toggle();
    const titles = await page
      .locator('[role="dialog"][aria-label="Advisor"] li > * > span:last-child > span:first-child')
      .allTextContents({ timeout: 5000 });
    if (!wasOpen) await toggle();
    if (titles.length === 0)
      console.log(`[shotcam] ${label}: alert badge shows, no advisor titles read`);
    for (const title of titles) console.log(`[shotcam] ${label}: alert "${title}"`);
  } catch (e) {
    console.log(`[shotcam] ${label}: could not read alerts (${e.message.split('\n')[0]})`);
  }
}

/**
 * Boot the next page with the Unlimited money option on.
 *
 * The advisor's "city is in the red" badge and the HUD read the option from the
 * saved settings, not from the sim, so sending `setUnlimitedMoney` alone builds
 * for free but leaves the badge on every shot. Call before `page.goto`.
 */
export const unlimitedMoneyOption = (page) =>
  page.addInitScript(() => {
    try {
      const key = 'slimcity.settings';
      const saved = JSON.parse(localStorage.getItem(key) ?? '{}');
      localStorage.setItem(key, JSON.stringify({ ...saved, unlimitedMoney: true }));
    } catch (e) {
      void e;
    }
  });

/** The app's tile size in metres, for harnesses that measure as well as look. */
export async function tileMeters(page) {
  await ready(page);
  return page.evaluate(() => window.__slimcity.tileMeters());
}
