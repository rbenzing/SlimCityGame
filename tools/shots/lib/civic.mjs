/** Scene code shared by the civic series: the ground a civic subject needs
 * beside it, and where to stand a vehicle in front of one.
 *
 * Some kits only stand beside something: an intake or outfall on a shore, a
 * station or yard on a track. The site finder knows only dry ground, so the
 * water or the track is laid behind the subject (its north side; the street is
 * its south), through the game's own commands, before the subject is placed.
 * The kit then turns itself to face it, as it does for a player.
 */

/** Road tiers of a tram street and a railway (src/shared/types.ts RoadTier). */
const TRAM_TIER = 10;
const RAIL_TIER = 11;
/** The site's plateau and the pond dug below it: a 3.5 m bank drops in one tile, inside the build
 * slope, and the pond floor is under the water line. */
const PLATEAU = 2;
const POND_FLOOR = -1.5;
/** Tiles of pond or track behind a subject, and track past each end of its edge. */
const POND_ROWS = 2;
const POND_MIN_W = 3;
const TRACK_OVERRUN = 2;

/** Dig the pond tiles behind `s` and lay its track, as its catalog entry asks. */
async function layBeside({ send, page }, s) {
  if (s.needs === 'water') {
    // At least POND_MIN_W wide, centred on the subject, so a one-tile outfall has water to read.
    const w = Math.max(s.w, POND_MIN_W);
    await page.evaluate(
      ([x, z, w, h, floor]) => {
        const heights = new Float32Array(w * h).fill(floor);
        window.__slimcity.cmd('Pond', [{ kind: 'terraformSet', x, z, w, h, heights }]);
      },
      [s.x - Math.floor((w - s.w) / 2), s.z - POND_ROWS, w, POND_ROWS, POND_FLOOR],
    );
  } else if (s.needs === 'rail' || s.needs === 'tram') {
    const tier = s.needs === 'rail' ? RAIL_TIER : TRAM_TIER;
    const tiles = Array.from({ length: s.w + 2 * TRACK_OVERRUN }, (_, i) => ({
      x: s.x - TRACK_OVERRUN + i,
      z: s.z - 1,
    }));
    await send('Track', [{ kind: 'buildRoad', tier, tiles }]);
  }
}

/** Site options for a civic series: a level plateau, and what each subject needs beside it. */
export const civicSite = {
  level: PLATEAU,
  prepare: async (session, site) => {
    for (const s of site.subjects) await layBeside(session, s);
  },
};

/**
 * Place buildings on a plot subject, each at a tile offset (`dx`, `dz`) from the plot's top-left
 * tile, and wait until each stands. Returns them with their tiles.
 */
export async function plopOn({ page, send }, site, plotId, list) {
  const plot = site.subjects.find((k) => k.id === plotId);
  if (!plot?.plot) throw new Error(`'${plotId}' is not a plot of the site`);
  const wants = list.map((b) => ({ ...b, x: plot.x + b.dx, z: plot.z + b.dz }));
  for (const b of wants)
    await send('Plop', [{ kind: 'placeBuilding', catalogId: b.id, x: b.x, z: b.z, rotation: 0 }]);
  await page.waitForFunction(
    (spots) => {
      const up = window.__slimcity.readBuildings().filter((b) => b.state === 1);
      return spots.every((s) => up.some((b) => b.catalogId === s.id && b.x === s.x && b.z === s.z));
    },
    wants,
    { timeout: 10000, polling: 100 },
  );
  return wants;
}

/** The site's tile of a subject by id. */
export const subjectOf = (site, id) => {
  const s = site.subjects.find((k) => k.id === id);
  if (!s) throw new Error(`site has no subject '${id}'`);
  return s;
};

/**
 * A point in metres on the street side of a subject: `out` beyond its front wall, `along` from
 * its middle toward the viewer's right.
 */
export function streetPoint(site, id, out, along = 0) {
  const s = subjectOf(site, id);
  const T = site.tile;
  return { x: (s.cx + 0.5) * T + along, z: (s.cz + 0.5) * T + (s.d * T) / 2 + out };
}
