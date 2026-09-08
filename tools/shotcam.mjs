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

/** The app's tile size in metres, for harnesses that measure as well as look. */
export async function tileMeters(page) {
  await ready(page);
  return page.evaluate(() => window.__slimcity.tileMeters());
}
