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
 *   subjects             `[{ id, as? }]` catalog ids, planted in order along one
 *                        street; `as` names the frames (and details) where one id
 *                        stands more than once; `{ id, plot: { w, d, h } }` is
 *                        ground that is not placed; `rotation` (0..3) places it
 *                        turned, its lot's sides swapped on odd turns; for type
 *                        `roads` and `street`, road pieces each on its own pad (see
 *                        `lib/roads.mjs`), `gap` tiles apart (3 by default)
 *                        `top` (metres) is the drawn top where a stack, mast or turbine
 *                        stands above the catalog height: the views frame it (default
 *                        from `lib/tops.mjs`);
 *                        `parts: [{ name, from, to }]` splits a plot wider than the
 *                        camera reaches into slices of its width (fractions), each
 *                        taking its above, front and rear views; the whole keeps
 *                        its left and right
 *   site                 optional `{ level, anywhere, prepare }`, see `buildSite`;
 *                        `prepare(session, site)` lays what the subjects need
 *                        (zoning, a track) before they are planted
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
 *
 * Type `town` may also carry `session: { fresh, seed }` (open a player's first game, see
 * `openSession`) and `play(session, { capture })`, which plays that game itself and returns the
 * sheet rows (see `lib/playthrough.mjs`).
 *
 * Type `views` photographs how the game shows itself (a view, a panel, a preview), not a
 * building: `subjects` are the things shown (`{ id }`, one sheet row each) and `frames`
 * the frames, each a camera on the scene or `full` (the page as the player sees it, HUD
 * included), see `lib/views-ui.mjs`.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cleanShot, closeUp, tileCamera, tileMeters } from './camera.mjs';
import { photographRoads } from './roads.mjs';
import { openSession, settle } from './session.mjs';
import { writeSheets } from './sheet.mjs';
import { buildSite } from './site.mjs';
import { photographTown } from './town.mjs';
import { DRAWN_TOPS } from './tops.mjs';
import { checkViews, photographViews } from './views-ui.mjs';
import { BUILDING_VIEWS, MAX_DISTANCE, buildingView, threeQuarterView } from './views.mjs';

const NIGHT = 22 / 24;
/** Types whose subjects are runs of street on their own pads (see `lib/roads.mjs`). */
const ROAD_PIECE_TYPES = ['roads', 'street'];
const MAX_DETAILS = 2;
const OUT = fileURLToPath(new URL('../out/', import.meta.url));
const CATALOG = fileURLToPath(new URL('../../../src/data/catalog.json', import.meta.url));

/** Footprint, height and the terrain it needs beside it, of a catalog entry, from the game's own
 * data. A subject with a `plot` (`{ w, d, h }`) is ground that is not placed, such as a row of
 * parked vehicles: it carries the box it is given. */
function catalogBox(given) {
  const subject = typeof given === 'string' ? { id: given } : given;
  const name = subject.as ?? subject.id;
  if (subject.plot) return { id: subject.id, name, plot: true, ...subject.plot };
  const entry = JSON.parse(readFileSync(CATALOG, 'utf8')).buildings.find(
    (e) => e.id === subject.id,
  );
  if (!entry) throw new Error(`catalog has no building '${subject.id}'`);
  // A quarter turn swaps the lot's sides: a yard's long side then lies along its street.
  // A roomier lot of a building draws the same stacks.
  const top =
    subject.top ??
    DRAWN_TOPS[subject.id] ??
    DRAWN_TOPS[subject.id.replace(/-lot\d+x\d+$/, '')] ??
    entry.height;
  if (top < entry.height) throw new Error(`top of '${subject.id}' is below its catalog height`);
  const rotation = subject.rotation ?? 0;
  const turned = rotation % 2 === 1;
  return {
    id: subject.id,
    name,
    w: turned ? entry.footprint.d : entry.footprint.w,
    d: turned ? entry.footprint.w : entry.footprint.d,
    h: top,
    needs: entry.requiresAdjacent,
    rotation,
    parts: subject.parts,
  };
}

/** The part of a plot the camera cannot frame whole: a slice of its width, `from` to `to` as
 * fractions of it. Its box is the slice, so its views fit the slice alone. */
const partBox = (box, part) => ({
  ...box,
  w: (part.to - part.from) * box.w,
  cx: box.cx + ((part.from + part.to) / 2 - 0.5) * box.w,
});

/** The views a part takes: the faces along the plot's length. The ends belong to the whole plot. */
const PART_VIEWS = ['above', 'front', 'rear'];

/** The sheet rows of a subject: itself, then each of its parts. */
const rowsOf = (box) => [box.name, ...(box.parts ?? []).map((p) => `${box.name}-${p.name}`)];

function check(spec) {
  for (const key of ['name', 'type', 'purpose', 'budgetS', 'subjects'])
    if (!spec[key]) throw new Error(`series is missing '${key}'`);
  if (spec.type === 'views') {
    checkViews(spec);
    return;
  }
  const perSubject = {};
  for (const d of spec.details ?? []) {
    if (!d.shows) throw new Error(`detail ${d.subject}-${d.name} says nothing about what it shows`);
    perSubject[d.subject] = (perSubject[d.subject] ?? 0) + 1;
    if (perSubject[d.subject] > MAX_DETAILS)
      throw new Error(`subject '${d.subject}' has more than ${MAX_DETAILS} details`);
    if (!spec.subjects.some((s) => (s.as ?? s.id) === d.subject))
      throw new Error(`detail ${d.name} names unknown subject '${d.subject}'`);
  }
  for (const s of spec.subjects)
    for (const p of s.parts ?? [])
      if (!(p.from >= 0 && p.to <= 1 && p.from < p.to))
        throw new Error(`part '${p.name}' of '${s.id}' is not a slice of 0 to 1`);
}

async function run(spec, url) {
  const started = performance.now();
  const dir = `${OUT}${spec.name}`;
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) if (f.endsWith('.png')) rmSync(`${dir}/${f}`);

  const session = await openSession(url, spec.session);
  const { page } = session;
  const shots = [];
  let frames = 0;
  let sheets = 0;
  try {
    const tile = await tileMeters(page);
    const aim = tileCamera(page);
    const capture = async (name, options) => {
      await settle(page);
      await cleanShot(page, `${dir}/${name}.png`, options);
      frames++;
      shots.push(name);
      console.log('shot', name, `${Math.round((performance.now() - started) / 1000)}s`);
    };
    const shoot = async (name, cam) => {
      // A frame the camera cannot reach round is a cut frame: the subject needs parts.
      if (cam.needed > MAX_DISTANCE + 1)
        throw new Error(
          `${name}: the box needs ${Math.round(cam.needed)} m, the camera reaches ${MAX_DISTANCE} m`,
        );
      await aim(cam.tx, cam.tz, cam.distance, cam.yaw, cam.pitch);
      await capture(name);
    };
    let rows = spec.subjects.map((s) => s.as ?? s.id);

    if (spec.type === 'views') {
      await photographViews(session, spec, { tile, catalogBox, aim, capture });
    } else if (ROAD_PIECE_TYPES.includes(spec.type)) {
      await photographRoads(session, spec, {
        tile,
        catalogBox,
        aim,
        shoot,
        night: () => session.pinDay(NIGHT),
      });
    } else if (spec.type === 'town') {
      rows = await photographTown(session, spec, { url, tile, shoot, capture });
    } else {
      const site = await buildSite(session, spec.subjects.map(catalogBox), tile, spec.site);
      site.tile = tile;
      const boxes = site.subjects.map((s) => ({ ...s, tile }));
      if (spec.scene) await spec.scene(session, site);
      await settle(page);

      rows = boxes.flatMap(rowsOf);
      for (const box of boxes) {
        for (const view of BUILDING_VIEWS)
          if (!box.parts || !PART_VIEWS.includes(view))
            await shoot(`${box.name}-${view}`, buildingView(view, box));
        for (const part of box.parts ?? [])
          for (const view of PART_VIEWS)
            await shoot(`${box.name}-${part.name}-${view}`, buildingView(view, partBox(box, part)));
      }

      for (const d of spec.details ?? []) {
        const box = boxes.find((b) => b.name === d.subject);
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
      await shoot(`${boxes[0].name}-night`, threeQuarterView(boxes[0]));
    }

    const refused = await session.refusals();
    if (refused.length > 0) throw new Error(`the game refused: ${refused.join('; ')}`);
    if (session.errors.length > 0) throw new Error(`page errors: ${session.errors.join('; ')}`);
    if (frames === 0) throw new Error('no frames written');
    sheets = await writeSheets(session.browser, dir, rows, shots);
    return true;
  } catch (e) {
    const refused = await session.refusals().catch(() => []);
    console.log('FAILED', e.message, refused.length > 0 ? `(refused: ${refused.join('; ')})` : '');
    return false;
  } finally {
    await session.close();
    const seconds = Math.round((performance.now() - started) / 1000);
    console.log(
      `${spec.name}: ${frames} frames, ${sheets} sheets, ${seconds}s (budget ${spec.budgetS}s)`,
    );
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
