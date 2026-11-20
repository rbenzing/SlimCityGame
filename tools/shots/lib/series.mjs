/** A shot series: what it is for, what it photographs, and the runner that
 * takes the frames.
 *
 * A series file calls `defineSeries` and nothing else; run alone it builds its
 * scene once on one page, takes every standard view of every subject, then its
 * declared details, then the one night frame, and exits non-zero on a page
 * error, a refused command, a missing subject or no frames. The runner
 * (`tools/shots/run.mjs`) imports the file with SHOTS_NO_RUN set, to read the
 * spec without running it.
 *
 * Spec:
 *   name, type, purpose  the series' file name, its type folder, and the one
 *                        sentence a reviewer judges it by
 *   budgetS              seconds on an idle machine
 *   subjects             `[{ id }]` catalog ids, planted in order along one street;
 *                        `{ id, plot: { w, d, h } }` is ground that is not placed
 *                        `rotation` (0..3) places it turned, its lot's sides swapped on odd turns
 *                        for type `roads`, road pieces each on its own pad (see
 *                        `lib/roads.mjs`), `gap` tiles apart (3 by default)
 *   site                 optional `{ level, anywhere, prepare }`, see `buildSite`
 *   scene(session, site) optional: what to stand on the site once it is built
 *                        (vehicles, graves); `site.subjects` carries each
 *                        subject's tiles and building id, `site.tile` the tile size
 *   details              `[{ subject, name, shows, local: [lx, lz], distance,
 *                        yaw, pitch, scale }]` frames the standard views cannot
 *                        give, at most two a subject. `local` is metres from the
 *                        subject's centre, +z toward the street; `yaw` 0 looks
 *                        north from the street; `scale` multiplies the resolution;
 *                        `setup(session, site)` optional, runs just before the frame
 *                        (a worn lawn, a vehicle moved up to the camera).
 */
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cleanShot, closeUp, tileCamera, tileMeters } from './camera.mjs';
import { photographRoads } from './roads.mjs';
import { openSession, settle } from './session.mjs';
import { buildSite } from './site.mjs';
import { BUILDING_VIEWS, buildingView, threeQuarterView } from './views.mjs';

const NIGHT = 22 / 24;
const MAX_DETAILS = 2;
const OUT = fileURLToPath(new URL('../out/', import.meta.url));
const CATALOG = fileURLToPath(new URL('../../../src/data/catalog.json', import.meta.url));

/** Footprint, height and the terrain it needs beside it, of a catalog entry, from the game's own
 * data. A subject with a `plot` (`{ w, d, h }`) is ground that is not placed, such as a row of
 * parked vehicles: it carries the box it is given. */
function catalogBox(given) {
  const subject = typeof given === 'string' ? { id: given } : given;
  if (subject.plot) return { id: subject.id, plot: true, ...subject.plot };
  const entry = JSON.parse(readFileSync(CATALOG, 'utf8')).buildings.find(
    (e) => e.id === subject.id,
  );
  if (!entry) throw new Error(`catalog has no building '${subject.id}'`);
  // A quarter turn swaps the lot's sides: a yard's long side then lies along its street.
  const rotation = subject.rotation ?? 0;
  const turned = rotation % 2 === 1;
  return {
    id: subject.id,
    w: turned ? entry.footprint.d : entry.footprint.w,
    d: turned ? entry.footprint.w : entry.footprint.d,
    h: entry.height,
    needs: entry.requiresAdjacent,
    rotation,
  };
}

function check(spec) {
  for (const key of ['name', 'type', 'purpose', 'budgetS', 'subjects'])
    if (!spec[key]) throw new Error(`series is missing '${key}'`);
  const perSubject = {};
  for (const d of spec.details ?? []) {
    if (!d.shows) throw new Error(`detail ${d.subject}-${d.name} says nothing about what it shows`);
    perSubject[d.subject] = (perSubject[d.subject] ?? 0) + 1;
    if (perSubject[d.subject] > MAX_DETAILS)
      throw new Error(`subject '${d.subject}' has more than ${MAX_DETAILS} details`);
    if (!spec.subjects.some((s) => s.id === d.subject))
      throw new Error(`detail ${d.name} names unknown subject '${d.subject}'`);
  }
}

async function run(spec, url) {
  const started = performance.now();
  const dir = `${OUT}${spec.name}`;
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) if (f.endsWith('.png')) rmSync(`${dir}/${f}`);

  const session = await openSession(url);
  const { page } = session;
  let frames = 0;
  try {
    const tile = await tileMeters(page);
    const aim = tileCamera(page);
    const shoot = async (name, cam) => {
      await aim(cam.tx, cam.tz, cam.distance, cam.yaw, cam.pitch);
      await settle(page);
      await cleanShot(page, `${dir}/${name}.png`);
      frames++;
      console.log('shot', name);
    };

    if (spec.type === 'roads') {
      await photographRoads(session, spec, {
        tile,
        catalogBox,
        aim,
        shoot,
        night: () => session.pinDay(NIGHT),
      });
    } else {
      const site = await buildSite(session, spec.subjects.map(catalogBox), tile, spec.site);
      site.tile = tile;
      const boxes = site.subjects.map((s) => ({ ...s, tile }));
      if (spec.scene) await spec.scene(session, site);
      await settle(page);

      for (const box of boxes)
        for (const view of BUILDING_VIEWS)
          await shoot(`${box.id}-${view}`, buildingView(view, box));

      for (const d of spec.details ?? []) {
        const box = boxes.find((b) => b.id === d.subject);
        const [lx, lz] = d.local;
        if (d.setup) await d.setup(session, site);
        const restore = d.scale > 1 ? await closeUp(page, d.scale) : null;
        await shoot(`${d.subject}-${d.name}`, {
          tx: box.cx + lx / tile,
          tz: box.cz + lz / tile,
          distance: d.distance,
          yaw: d.yaw,
          pitch: d.pitch,
        });
        if (restore) await restore();
      }

      await session.pinDay(NIGHT);
      await shoot(`${boxes[0].id}-night`, threeQuarterView(boxes[0]));
    }

    const refused = await session.refusals();
    if (refused.length > 0) throw new Error(`the game refused: ${refused.join('; ')}`);
    if (session.errors.length > 0) throw new Error(`page errors: ${session.errors.join('; ')}`);
    if (frames === 0) throw new Error('no frames written');
    return true;
  } catch (e) {
    const refused = await session.refusals().catch(() => []);
    console.log('FAILED', e.message, refused.length > 0 ? `(refused: ${refused.join('; ')})` : '');
    return false;
  } finally {
    await session.close();
    const seconds = Math.round((performance.now() - started) / 1000);
    console.log(`${spec.name}: ${frames} frames, ${seconds}s (budget ${spec.budgetS}s)`);
  }
}

/** Declare a series. Runs it unless the runner is only reading the spec. */
export function defineSeries(spec) {
  check(spec);
  if (!process.env.SHOTS_NO_RUN) {
    run(spec, process.argv[2] ?? 'http://localhost:5173').then((ok) => process.exit(ok ? 0 : 1));
  }
  return spec;
}
