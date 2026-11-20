/** Grown towns for the `town` series: the only shot type that lets the simulation run.
 *
 * A town is grown in the page by the same sim harness the interaction tests use (a few seconds
 * for thousands of ticks), stored as a saved game, and loaded the way the Load Game menu does.
 * So a frame shows a town the game itself holds, and what was grown is repeatable: the sim has a
 * seed and the batches are data. Each series process grows its own town (about 10 s); nothing is
 * shared between processes.
 *
 * A grown scene is a `plan`: `milestone` the rung the sim starts at, `phases` each with
 * `batches` (`{ label, commands }`, one command batch each), `hold` (freeze every building's
 * construction countdown, so a site stays a site), and a way to stop: `until` conditions
 * (`{ x0, z0, x1, z1, min, max, prefix, state }` counted over standing buildings) checked every
 * `step` ticks, or `maxTicks` alone. A phase whose conditions are unmet at `maxTicks` fails the
 * series. `plan.interactionTown` grows the town of tests/support/town.ts instead.
 *
 * A saved game cannot carry a building under construction (loading finishes it), so a scene
 * that needs sites (`plan.live`) saves an empty flat map and runs its phases in the loaded game
 * itself, at speed 4, each phase ending on its `until` conditions or failing at `timeoutMs`.
 */
import { readFileSync } from 'node:fs';
import { hooksReady } from './camera.mjs';
import { settle } from './session.mjs';
import { BUILDING_VIEWS, buildingView, threeQuarterView } from './views.mjs';

const CATALOG = JSON.parse(
  readFileSync(new URL('../../../src/data/catalog.json', import.meta.url), 'utf8'),
).buildings;
const NIGHT = 22 / 24;
const NOON = 0.5;
const SAVE_ID_KEY = 'saveId';

/** Tiles of a row along x from (x0, z), `n` long. */
export const row = (x0, z, n) => Array.from({ length: n }, (_, i) => ({ x: x0 + i, z }));
/** Tiles of a column along z from (x, z0), `n` long. */
export const column = (x, z0, n) => Array.from({ length: n }, (_, i) => ({ x, z: z0 + i }));
/** Tiles of a rectangle `w` wide and `d` deep from (x0, z0). */
export const rect = (x0, z0, w, d) =>
  Array.from({ length: d }, (_, i) => row(x0, z0 + i, w)).flat();

/** A box over tiles x0..x1, z0..z1 and `h` metres tall, as the views take it. */
export const districtBox = (x0, z0, x1, z1, h = 25) => ({ x0, z0, x1, z1, h });

/** Runs in the page: grows the plan in a sim harness, stores the save, returns its id and facts. */
async function growInPage(plan) {
  const sim = await import('/tests/support/sim.ts');
  const persist = await import('/src/app/persist.ts');
  const constants = await import('/src/shared/constants.ts');
  let h;
  const refused = [];
  if (plan.interactionTown) {
    const town = await import('/tests/support/town.ts');
    const built = town.buildTown();
    built.steps.forEach((s, i) => {
      if (!built.acks[i].ok) refused.push(s.label);
    });
    town.growTown(built, town.GROW_TICKS);
    h = built.h;
  } else {
    h = plan.milestone ? sim.initializedAtMilestone(plan.milestone) : sim.initialized();
    let seq = 1;
    const apply = (label, commands) => {
      sim.send(h, seq, commands);
      h.ticks(1);
      const ack = h.ackFor(seq++);
      if (!ack || !ack.ok) refused.push(`${label} ${JSON.stringify(ack)}`);
    };
    apply('sandbox', [
      { kind: 'setSandbox', on: true },
      { kind: 'setUnlimitedMoney', on: true },
    ]);
    // Standing buildings, kept by replaying only the snapshots posted since the last look.
    const live = new Map();
    let seen = 0;
    const look = () => {
      for (; seen < h.messages.length; seen++) {
        const m = h.messages[seen];
        if (m.type !== 'snapshot' || !m.snap.buildings) continue;
        for (const b of [...m.snap.buildings.added, ...m.snap.buildings.updated]) live.set(b.id, b);
        for (const id of m.snap.buildings.removed) live.delete(id);
      }
      return [...live.values()];
    };
    const count = (w) =>
      look().filter(
        (b) =>
          b.x >= w.x0 &&
          b.x <= w.x1 &&
          b.z >= w.z0 &&
          b.z <= w.z1 &&
          (w.state === undefined || b.state === w.state) &&
          (!w.prefix || b.catalogId.startsWith(w.prefix)),
      ).length;
    const met = (w, n) => n >= (w.min ?? 0) && n <= (w.max ?? Infinity);
    for (const [p, phase] of (plan.live ? [] : plan.phases).entries()) {
      h.sim.handleMessage({ type: 'devHoldConstruction', hold: !!phase.hold });
      for (const b of phase.batches) apply(b.label, b.commands);
      h.sim.handleMessage({ type: 'setSpeed', speed: 1 });
      const until = phase.until ?? [];
      const step = phase.step ?? 10;
      let ticks = 0;
      while (ticks < phase.maxTicks) {
        h.ticks(step);
        ticks += step;
        if (until.length > 0 && until.every((w) => met(w, count(w)))) break;
      }
      const unmet = until.filter((w) => !met(w, count(w)));
      if (unmet.length > 0)
        throw new Error(
          `phase ${p}: after ${ticks} ticks ${unmet
            .map(
              (w) =>
                `${w.prefix ?? 'any'} state ${w.state} in ${w.x0},${w.z0}-${w.x1},${w.z1} has ${count(w)}`,
            )
            .join(', ')}; demand ${JSON.stringify(h.lastSnapshot().stats.demand)}`,
        );
    }
  }
  if (refused.length > 0) throw new Error(`the sim refused: ${refused.join('; ')}`);
  h.sim.handleMessage({ type: 'requestSave' });
  const payload = persist.decodeSave(sim.latestSaveData(h));
  if (plan.backlog) {
    const death = payload.meta.deathCare ?? {
      deathRemainder: 0,
      deaths: 0,
      reletRemainder: 0,
      relets: 0,
    };
    death.interments = [];
    death.backlog = plan.backlog.map((b) => ({
      tile: b.z * constants.MAP_SIZE + b.x,
      count: b.count,
      sinceTick: Math.max(0, payload.header.tick - 3 * constants.TICKS_PER_MONTH),
    }));
    payload.meta.deathCare = death;
  }
  await persist.storeSave(persist.encodeSave(payload));
  const stats = h.lastSnapshot().stats;
  return {
    saveId: (await persist.listSaves())[0].id,
    population: stats.population,
    jobs: stats.jobs,
  };
}

/** Loads a stored save into the page the way the Load Game menu does. */
async function loadSave(session, url, saveId) {
  const { page } = session;
  await page.addInitScript(
    ([record]) => {
      try {
        sessionStorage.setItem('slimcity.session', JSON.stringify(record));
      } catch (e) {
        void e;
      }
    },
    [{ screen: 'playing', seed: 0, mode: 'load', saveId }],
  );
  await page.goto(new URL('?nobloom', url).href, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#viewport canvas', { timeout: 60000 });
  await hooksReady(page);
  // The saved map is flat at 5 m; the new game that booted first has terrain.
  await page.waitForFunction(
    () => {
      const g = window.__slimcity.readGrid();
      return [0, (g.size * g.size) >> 1, g.size * g.size - 1].every((i) => g.height[i] === 5);
    },
    null,
    { timeout: 30000 },
  );
  await session.send('Sandbox', [{ kind: 'setSandbox', on: true }]);
  await session.send('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
  await page.evaluate(() => window.__slimcity.setSpeed(0));
  await session.pinDay(NOON);
}

/**
 * Lets the sim run until `until` (a page function, true when the scene is as wanted) holds,
 * then pauses it. Fails after `timeoutMs` rather than photographing a scene that never came.
 */
export async function runUp(page, until, arg, timeoutMs = 40000) {
  await page.evaluate(() => window.__slimcity.setSpeed(4));
  try {
    await page.waitForFunction(until, arg, { timeout: timeoutMs, polling: 250 });
  } finally {
    await page.evaluate(() => window.__slimcity.setSpeed(0));
  }
}

/** Whether every condition holds over the buildings standing in the page. */
const metInPage = ([until]) => {
  const all = window.__slimcity.readBuildings();
  return until.every((w) => {
    const n = all.filter(
      (b) =>
        b.x >= w.x0 &&
        b.x <= w.x1 &&
        b.z >= w.z0 &&
        b.z <= w.z1 &&
        (w.state === undefined || b.state === w.state) &&
        (!w.prefix || b.catalogId.startsWith(w.prefix)),
    ).length;
    return n >= (w.min ?? 0) && n <= (w.max ?? Infinity);
  });
};

/** Runs a plan's phases in the loaded game, the way a player would: commands, then time. */
async function growLive(session, phases) {
  const { page } = session;
  for (const [p, phase] of phases.entries()) {
    await page.evaluate((hold) => window.__slimcity.holdConstruction(hold), !!phase.hold);
    for (const b of phase.batches) await session.send(b.label, b.commands);
    if (!phase.until) continue;
    try {
      await runUp(page, metInPage, [phase.until], phase.timeoutMs ?? 60000);
    } catch (e) {
      throw new Error(`phase ${p} (${phase.batches.map((b) => b.label).join(', ')}): ${e.message}`);
    }
  }
}

/** The view a subject's frame is taken from, by its name, for a box whose street is on +z. */
function plainViewOf(name, box) {
  if (name === 'oblique' || name === 'night') return threeQuarterView(box);
  if (name === 'full') return buildingView('above', box);
  if (BUILDING_VIEWS.includes(name)) return buildingView(name, box);
  throw new Error(`unknown town view '${name}'`);
}

/**
 * The view of a box, turned about its centre when it carries `facing`: the radians its street
 * side is turned from +z (a parcel on a curved street). The views are worked out for the box
 * square to its street, then the camera is swung round with it.
 */
export function viewOf(name, box) {
  if (!box.facing) return plainViewOf(name, box);
  const v = plainViewOf(name, { ...box, cx: 0, cz: 0 });
  const c = Math.cos(box.facing);
  const s = Math.sin(box.facing);
  return {
    ...v,
    tx: box.cx + v.tx * c + v.tz * s,
    tz: box.cz - v.tx * s + v.tz * c,
    yaw: v.yaw + box.facing,
  };
}

/** A catalog entry by id, from the game's own data. */
export const catalogEntry = (id) => {
  const entry = CATALOG.find((e) => e.id === id);
  if (!entry) throw new Error(`catalog has no building '${id}'`);
  return entry;
};

/**
 * A grown building's box on a grid lot, turned to face the street its `rotation` names (0
 * south, 1 east, 2 north, 3 west, as the views name them). `b` is a building read from the page.
 */
export function gridBox(b) {
  const entry = catalogEntry(b.catalogId);
  const { w, d } = entry.footprint;
  const turned = b.rotation % 2 === 1;
  return {
    cx: b.x + ((turned ? d : w) - 1) / 2,
    cz: b.z + ((turned ? w : d) - 1) / 2,
    w,
    d,
    h: entry.height,
    facing: (b.rotation * Math.PI) / 2,
  };
}

/**
 * A grown building's box on a framed parcel (a curved street's), turned to face its street:
 * `b` a building read from the page, `entry` its catalog entry, `tile` metres. The frame is
 * the one of `src/shared/lotframe.ts`: local u along the street, v into the lot, street at -v.
 */
export function framedBox(b, entry, tile) {
  const f = b.frame;
  const c = Math.cos(f.heading);
  const s = Math.sin(f.heading);
  const w = entry.footprint.w * tile;
  const d = entry.footprint.d * tile;
  const centre = { x: f.x + (w / 2) * c - (d / 2) * s, z: f.z + (w / 2) * s + (d / 2) * c };
  return {
    cx: centre.x / tile - 0.5,
    cz: centre.z / tile - 0.5,
    w: entry.footprint.w,
    d: entry.footprint.d,
    h: entry.height,
    facing: Math.PI - f.heading,
  };
}

/**
 * Photographs a town series: grows and loads its town, then each subject in turn, then the
 * night frames. Returns the sheet rows.
 *
 * Spec: `plan` (see the file's head), `ready(session, town)` optional, run once the town is
 * loaded (traffic, the clock), and `subjects`: `{ id, box, views, lens, tool, before, night }`
 * where `box` is `{ x0, z0, x1, z1, h }` or `(town) => box` (or a `framedBox`), `views` default
 * `['above', 'oblique']`, `lens` a lens id shown for the subject's frames, `tool` a tool held
 * for its `full` frame only (the zoning lens a zone tool shows), `before(session, town)` lays
 * what the frame needs, and `night` takes the subject's `night` frame in the night pass.
 *
 * A series with `play(session, { capture })` plays a first game instead (see `playthrough.mjs`).
 */
export async function photographTown(session, spec, { url, tile, shoot, capture, onTown }) {
  const { page } = session;
  if (spec.play) return spec.play(session, { capture });
  const grown = await page.evaluate(growInPage, spec.plan);
  console.log('grown', JSON.stringify(grown));
  await loadSave(session, url, grown[SAVE_ID_KEY]);
  if (spec.plan.live) await growLive(session, spec.plan.phases);
  const town = {
    tile,
    facts: grown,
    buildings: () => page.evaluate(() => window.__slimcity.readBuildings()),
    vehicles: () => page.evaluate(() => window.__slimcity.readVehicles()),
    /** Runs `fn(arg)` in the page, for a read hook a series needs. */
    read: (fn, arg) => page.evaluate(fn, arg),
  };
  if (spec.plan.interactionTown)
    town.TOWN = await page.evaluate(async () => (await import('/tests/support/town.ts')).TOWN);
  if (spec.ready) await spec.ready(session, town);
  if (onTown) onTown(town);

  const boxOf = async (s) => {
    const b = typeof s.box === 'function' ? await s.box(town) : s.box;
    if (b.cx !== undefined) return { ...b, tile };
    return {
      w: b.x1 - b.x0 + 1,
      d: b.z1 - b.z0 + 1,
      h: b.h,
      cx: (b.x0 + b.x1) / 2,
      cz: (b.z0 + b.z1) / 2,
      tile,
    };
  };
  const rows = spec.subjects.map((s) => s.id);
  for (const s of spec.subjects) {
    if (s.before) await s.before(session, town);
    if (s.lens !== undefined) {
      await page.evaluate((l) => window.__slimcity.setOverlay(l), s.lens);
      await settle(page);
    }
    const box = await boxOf(s);
    for (const view of s.views ?? ['above', 'oblique']) {
      const held = view === 'full' && s.tool;
      if (held) await page.evaluate((t) => window.__slimcity.setTool(t), s.tool);
      await shoot(`${s.id}-${view}`, viewOf(view, box));
      if (held) await page.evaluate(() => window.__slimcity.setTool('select'));
    }
    if (s.lens !== undefined) await page.evaluate(() => window.__slimcity.setOverlay(null));
    if (s.after) await s.after(session, town);
  }
  const dark = spec.subjects.filter((s, i) => s.night ?? i === 0);
  await session.pinDay(NIGHT);
  for (const s of dark) {
    if (s.before) await s.before(session, town);
    await shoot(`${s.id}-night`, viewOf('night', await boxOf(s)));
  }
  return rows;
}
