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
    const prev = lastCamera.get(page);
    lastCamera.set(page, {
      tx,
      tz,
      distance: Math.max(distance, CAMERA_MIN_DISTANCE),
      yaw: yaw ?? prev?.yaw ?? 0,
      pitch: pitch ?? prev?.pitch ?? 0.7,
    });
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

const lastCamera = new WeakMap();
const CAMERA_MAX_PITCH = 1.45;
const CAMERA_MIN_PITCH = 0.18;
const FOV_TAN = Math.tan(Math.PI / 8);

/**
 * Where a world point lands on screen under the camera `tileCamera` last set,
 * as fractions of the viewport (0..1 across, 0..1 down), or null when it is
 * behind the eye. The point is a tile coordinate (the tile's centre when `tx`
 * and `tz` are whole) and a height `y` in metres above the target's ground; the
 * ground is taken as level with the target, so use it on flat sites. Mirrors the
 * rig's own placement (45 degree vertical view, eye at distance/pitch/yaw).
 */
export async function screenOf(page, tx, tz, y = 0) {
  const cam = lastCamera.get(page);
  if (!cam) throw new Error('[shotcam] screenOf called before any camera was aimed');
  const T = await tileMeters(page);
  const vp = page.viewportSize();
  const pitch = Math.min(CAMERA_MAX_PITCH, Math.max(CAMERA_MIN_PITCH, cam.pitch));
  // The point relative to the eye, then onto the camera's right, up and forward axes.
  const sy = Math.sin(cam.yaw);
  const cy = Math.cos(cam.yaw);
  const sp = Math.sin(pitch);
  const cp = Math.cos(pitch);
  const wx = (tx - cam.tx) * T - cam.distance * cp * sy;
  const wy = y - cam.distance * sp;
  const wz = (tz - cam.tz) * T - cam.distance * cp * cy;
  const depth = -(wx * cp * sy + wy * sp + wz * cp * cy);
  if (depth <= 1) return null;
  const right = wx * cy - wz * sy;
  const up = -wx * sp * sy + wy * cp - wz * sp * cy;
  const half = depth * FOV_TAN;
  return {
    x: 0.5 + right / (half * (vp.width / vp.height)) / 2,
    y: 0.5 - up / half / 2,
  };
}

/**
 * Throw, naming the shot, unless the subject tile lands inside the frame.
 *
 * `margin` is the fraction of the viewport kept clear at every edge; the bottom
 * is kept clear by `margin + 0.1` for the HUD bar. Use it on the point of the
 * subject that must be seen (a box, a riser pole, the reactor intake).
 */
export async function requireInFrame(page, name, tx, tz, y = 0, margin = 0.05) {
  const s = await screenOf(page, tx, tz, y);
  const ok = s && s.x >= margin && s.x <= 1 - margin && s.y >= margin && s.y <= 1 - margin - 0.1;
  if (!ok) {
    const at = s ? `${s.x.toFixed(2)},${s.y.toFixed(2)}` : 'behind the eye';
    throw new Error(`[shotcam] ${name}: subject at tile ${tx},${tz} is out of frame (${at})`);
  }
  return s;
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
 * dismissed before the shutter. `clip` crops the picture to a page rectangle
 * (`{ x, y, width, height }`), for a shot of a panel rather than the scene.
 */
export async function cleanShot(page, path, { allowRefusal, clip } = {}) {
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
  await page.screenshot({ path, ...(clip ? { clip } : {}) });
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

/**
 * The status strip's clock as minutes into the day, read off the page itself.
 *
 * The strip shows `HH:MM` from the sim's tick, and the scene's light is mapped
 * from the same tick, so this is the one time both agree on.
 */
export const readClockMinutes = (page) =>
  page.evaluate(() => {
    for (const el of document.querySelectorAll('span')) {
      const m = /^(\d{2}):(\d{2})$/.exec(el.textContent ?? '');
      if (m && el.children.length === 0) return Number(m[1]) * 60 + Number(m[2]);
    }
    return null;
  });

/**
 * Run the game's own clock forward to `hour` (0..24), then pause it.
 *
 * `setDayT` pins the light alone, leaving the strip at whatever hour the sim is
 * at, so a frame reads "09:00" under a night sky. This lets the sim itself carry
 * the tick to the hour — fast while far, at the slowest speed for the last
 * stretch — and clears any pin, so the strip and the scene are one time. The
 * clock only runs forward: asking for an hour already passed runs round to its
 * next turn. Buildings put up by command stand through it; the caller checks.
 */
export async function setClock(page, hour, { toleranceMin = 2, budgetMs = 120000 } = {}) {
  const target = Math.round(hour * 60) % 1440;
  await page.evaluate(() => window.__slimcity.setDayT(null));
  const started = Date.now();
  let speed = null;
  for (;;) {
    const now = await readClockMinutes(page);
    if (now === null) throw new Error('[shotcam] setClock: no clock in the status strip');
    const ahead = (target - now + 1440) % 1440;
    if (ahead <= toleranceMin || ahead >= 1440 - toleranceMin) break;
    if (Date.now() - started > budgetMs) {
      throw new Error(
        `[shotcam] setClock: still ${ahead} min short of ${hour} h after ${budgetMs} ms`,
      );
    }
    const want = ahead > 40 ? 4 : 1;
    if (want !== speed) {
      speed = want;
      await page.evaluate((s) => window.__slimcity.setSpeed(s), want);
    }
    await page.waitForTimeout(40);
  }
  await page.evaluate(() => window.__slimcity.setSpeed(0));
  await page.waitForTimeout(300);
  const shown = await readClockMinutes(page);
  console.log(
    `[shotcam] clock set to ${String(Math.floor(shown / 60)).padStart(2, '0')}:${String(shown % 60).padStart(2, '0')}`,
  );
  return shown;
}

/** The app's tile size in metres, for harnesses that measure as well as look. */
export async function tileMeters(page) {
  await ready(page);
  return page.evaluate(() => window.__slimcity.tileMeters());
}
