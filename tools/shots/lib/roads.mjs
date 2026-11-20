/** The ground a road series stands on: one levelled window of the map, every
 * piece on its own pad inside it, the camera moving between the pads.
 *
 * A piece is a subject of a `roads` series: a junction, a run that changes
 * class, a street end, a bridge. It names the pad it needs, the commands that
 * lay it (written in its own tile coordinates, `p.row`, `p.col`, `p.road`) and,
 * where the standard views frame the wrong box, the box to frame.
 *
 *   id        frame name stem
 *   pad       `{ w, h }` tiles the piece lays inside (11 by 11 by default)
 *   ground    `flat` (default), or `{ grade, axis }`: a plane climbing `grade`
 *             metres a tile along `axis`, written exactly
 *   lay       `(p) => commands`, sent one by one in order
 *   after     optional `(p, tools) => tiles`: work that needs the page (a tool
 *             clicked as a player does); returns the tiles that must carry road
 *   view      `{ x0, z0, length, width, axis, height }` the box the views frame,
 *             in pad tiles (the whole pad by default); the low `along` view follows it
 *   close     fields of `view` to override for `above` and `oblique`: the closest box that
 *             holds what is judged (a junction's box and two tiles of each arm, a seam and
 *             three tiles each way, an end and its last three tiles)
 */
import { closeUp } from './camera.mjs';
import { settle } from './session.mjs';
import { ROAD_VIEWS, roadView } from './views.mjs';

/** Road tiers: the bytes a save carries (src/shared/types.ts RoadTier), appended only. */
export const TIER = {
  twoLane: 1,
  avenue: 2,
  highway: 3,
  gravel: 4,
  alley: 5,
  oneWay: 6,
  fourLane: 7,
  bus: 8,
  bike: 9,
  tram: 10,
  rail: 11,
  ramp: 12,
};

/** The sea's height in metres (src/shared/constants.ts SEA_LEVEL), and the dry ground kept above it. */
const SEA_LEVEL = 0;
const FOOT_CLEARANCE = 2;
const DEFAULT_PAD = { w: 11, h: 11 };
/** Tiles of levelled ground between pads and round the window. */
const DEFAULT_GAP = 3;
const ACTIVE = 1;
const LAID_TIMEOUT_MS = 30000;
const STAND_TIMEOUT_MS = 10000;
/** Tiles of map left clear of the map's edge. */
const EDGE = 20;
/** Window search: candidates every STEP tiles, heights sampled every SAMPLE tiles. */
const STEP = 4;
const SAMPLE = 3;

/**
 * Where each piece's pad lies in a window of the map, as a near-square grid of equal cells.
 * Returns the window's size and, per piece, the pad's top-left tile in window coordinates.
 */
export function layoutPads(pieces, gap = DEFAULT_GAP) {
  const pads = pieces.map((s) => ({ ...DEFAULT_PAD, ...(s.pad ?? {}) }));
  const cellW = Math.max(...pads.map((p) => p.w)) + gap;
  const cellH = Math.max(...pads.map((p) => p.h)) + gap;
  const cols = Math.max(
    1,
    Math.min(pieces.length, Math.ceil(Math.sqrt((pieces.length * cellH) / cellW))),
  );
  const rows = Math.ceil(pieces.length / cols);
  return {
    width: cols * cellW + gap,
    height: rows * cellH + gap,
    pads: pieces.map((s, i) => ({
      id: s.id,
      x: gap + (i % cols) * cellW,
      z: gap + Math.floor(i / cols) * cellH,
      ...pads[i],
    })),
  };
}

/** The top-left tile and mean height of the dry window of `cols` by `rows` whose sampled ground varies least. */
export function findWindow(grid, cols, rows) {
  const N = grid.size;
  const wet = new Int32Array((N + 1) * (N + 1));
  for (let z = 0; z < N; z++)
    for (let x = 0; x < N; x++)
      wet[(z + 1) * (N + 1) + x + 1] =
        (grid.water[z * N + x] ? 1 : 0) +
        wet[z * (N + 1) + x + 1] +
        wet[(z + 1) * (N + 1) + x] -
        wet[z * (N + 1) + x];
  const waterIn = (x, z) =>
    wet[(z + rows) * (N + 1) + x + cols] -
    wet[z * (N + 1) + x + cols] -
    wet[(z + rows) * (N + 1) + x] +
    wet[z * (N + 1) + x];
  let best = null;
  for (let z = EDGE; z < N - rows - EDGE; z += STEP) {
    for (let x = EDGE; x < N - cols - EDGE; x += STEP) {
      if (waterIn(x, z) > 0) continue;
      let lo = Infinity;
      let hi = -Infinity;
      let sum = 0;
      let n = 0;
      for (let dz = 0; dz < rows; dz += SAMPLE) {
        for (let dx = 0; dx < cols; dx += SAMPLE) {
          const h = grid.height[(z + dz) * N + x + dx];
          lo = Math.min(lo, h);
          hi = Math.max(hi, h);
          sum += h;
          n++;
        }
      }
      if (!best || hi - lo < best.spread)
        best = { x, z, spread: hi - lo, level: Math.fround(sum / n) };
    }
  }
  if (!best) throw new Error(`no dry ground ${cols} by ${rows} tiles for the pads`);
  return best;
}

/** Dry bank, in tiles, a span needs on each side of its water for its approaches to land. */
const BANK = 8;
/** A span's water is this many tiles wide at the least and at the most. */
const SPAN_RANGE = [4, 14];
/** Rows two crossings stand apart at the least (or twice that sideways), so none is in another's frame. */
const CROSSING_APART = 12;

/**
 * `count` east-west crossings of separate stretches of water, each with dry bank on both
 * sides, as `{ z, from, to, span }` (tiles of water from `from` to `to`), north to south.
 */
export function findCrossings(grid, count) {
  const N = grid.size;
  const wet = (x, z) => grid.water[z * N + x];
  const at = (z) => {
    const found = [];
    let x = BANK;
    while (x < N - BANK) {
      if (!wet(x, z)) {
        x++;
        continue;
      }
      let end = x;
      while (end < N - BANK && wet(end, z)) end++;
      let dry = true;
      for (let k = 1; k <= BANK; k++) if (wet(x - k, z) || wet(end - 1 + k, z)) dry = false;
      if (dry && end - x >= SPAN_RANGE[0] && end - x <= SPAN_RANGE[1])
        found.push({ z, from: x, to: end - 1, span: end - x });
      x = end;
    }
    return found;
  };
  const all = [];
  for (let z = EDGE; z < N - EDGE; z++) all.push(...at(z));
  // The widest water first, each stretch of it once: a span then has no other in its frame.
  const chosen = [];
  for (const c of all.sort((a, b) => b.span - a.span || a.z - b.z || a.from - b.from)) {
    const apart = chosen.every(
      (o) =>
        Math.abs(o.z - c.z) >= CROSSING_APART ||
        Math.abs(o.from + o.to - c.from - c.to) >= 2 * CROSSING_APART,
    );
    if (apart) chosen.push(c);
    if (chosen.length === count) break;
  }
  if (chosen.length < count) throw new Error(`no ${count} separate crossings with dry banks`);
  return chosen.sort((a, b) => a.z - b.z);
}

/** Tiles of a straight run from `a` to `b` inclusive, either way, along row `z`. */
const span = (a, b) =>
  Array.from({ length: Math.abs(b - a) + 1 }, (_, i) => a + Math.sign(b - a) * i);

/** What a piece's `lay` gets: its pad's own tile coordinates turned into the map's. */
function helpers(origin, page, catalogBox, tile) {
  const at = (x, z) => ({ x: origin.x + x, z: origin.z + z });
  return {
    page,
    at,
    size: catalogBox,
    /** The middle of a pad tile in the centimetres a free-form road is drawn in. */
    cm: (x, z) => ({
      x: (origin.x + x + 0.5) * tile * 100,
      z: (origin.z + z + 0.5) * tile * 100,
    }),
    row: (z, a, b) => span(a, b).map((x) => at(x, z)),
    col: (x, a, b) => span(a, b).map((z) => at(x, z)),
    road: (tier, tiles, extra = {}) => ({ kind: 'buildRoad', tier, tiles, ...extra }),
    control: (x, z, control) => ({ kind: 'setJunctionControl', ...at(x, z), control }),
    building: (catalogId, x, z, rotation = 0) => ({
      kind: 'placeBuilding',
      catalogId,
      ...at(x, z),
      rotation,
    }),
    roundabout: (x, z) => ({ kind: 'buildRoundabout', ...at(x, z) }),
  };
}

/** A composed profile: the preset of `tier` with `edits` applied, built by the game's own code. */
export const composeProfile = (page, tier, edits) =>
  page.evaluate(
    async ([t, e]) => {
      const rp = await import('/src/shared/roadprofile.ts');
      return rp.composeProfile(rp.presetProfileForTier(t), { ...rp.NO_EDITS, ...e });
    },
    [tier, edits],
  );

/** The pixel at fraction (fx, fz) across a tile, as the camera sees it, or null when it is off screen. */
const pixelOn = (page, tx, tz, fx, fz) =>
  page.evaluate(
    ([x, z, a, b]) => {
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (let y = 60; y < 780; y += 2) {
        for (let px = 20; px < 1260; px += 2) {
          const t = window.__slimcity.screenToTile(px, y);
          if (t && t.x === x && t.z === z) {
            x0 = Math.min(x0, px);
            x1 = Math.max(x1, px);
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
          }
        }
      }
      return Number.isFinite(x0) ? [x0 + (x1 - x0) * a, y0 + (y1 - y0) * b] : null;
    },
    [tx, tz, fx, fz],
  );

/**
 * Use one of the game's tools on a tile as a player does: look straight down on it,
 * select the tool, point at the tile (`fx`, `fz` across it) and click.
 */
async function clickTool(page, aim, tool, tile, [fx, fz] = [0.5, 0.5]) {
  await aim(tile.x, tile.z, 60, 0, 1.45);
  await settle(page);
  const px = await pixelOn(page, tile.x, tile.z, fx, fz);
  if (!px) throw new Error(`no pixel maps to tile ${tile.x},${tile.z} for the ${tool} tool`);
  await page.evaluate((t) => window.__slimcity.setTool(t), tool);
  await page.mouse.move(px[0], px[1]);
  await settle(page);
  await page.mouse.click(px[0], px[1]);
  await settle(page);
  await page.keyboard.press('Escape');
}

/** Wait until every tile carries a road, or throw naming what the game refused. */
async function waitForRoads(session, tiles, label) {
  const { page } = session;
  if (tiles.length === 0) return;
  try {
    await settle(page, {
      until: ([list]) => {
        const g = window.__slimcity.readGrid();
        return list.every(([x, z]) => g.roadTier[z * g.size + x] > 0);
      },
      arg: [tiles.map((t) => [t.x, t.z])],
      timeout: LAID_TIMEOUT_MS,
    });
  } catch (e) {
    const refused = await session.refusals();
    throw new Error(`${label}: road not laid (${refused.join('; ') || e.message.split('\n')[0]})`);
  }
}

/** Wait until every building stands, or throw naming the ones that do not. */
async function waitForBuildings(page, wants) {
  if (wants.length === 0) return;
  const missing = () =>
    page.evaluate(
      ([list, state]) => {
        const up = window.__slimcity
          .readBuildings()
          .filter((b) => b.state === state)
          .map((b) => `${b.catalogId}@${b.x},${b.z}`);
        return list.filter((w) => !up.includes(w));
      },
      [wants, ACTIVE],
    );
  const deadline = performance.now() + STAND_TIMEOUT_MS;
  let absent = await missing();
  while (absent.length > 0 && performance.now() < deadline) {
    await settle(page);
    absent = await missing();
  }
  if (absent.length > 0) throw new Error(`not standing: ${absent.join(', ')}`);
}

/**
 * Level the window, lay every piece on its pad and prove each stands.
 * Returns the pieces with the box their views frame, in map tiles.
 */
export async function buildScene(session, spec, { tile, catalogBox, aim }) {
  const { page, send } = session;
  const dry = spec.subjects.filter((s) => !s.river);
  const rivers = spec.subjects.filter((s) => s.river);
  const layout = layoutPads(dry.length > 0 ? dry : [{ id: '', pad: { w: 1, h: 1 } }], spec.gap);
  const grid = await page.evaluate(() => {
    const g = window.__slimcity.readGrid();
    return { size: g.size, water: g.water, height: g.height };
  });
  const win = findWindow(grid, layout.width, layout.height);
  // A hillside pad falls below the middle of its slope: keep its foot above the sea, or water shows there.
  const drop = Math.max(
    0,
    ...dry.map((s, i) => {
      if (!s.ground?.grade) return 0;
      const pad = layout.pads[i];
      return (Math.abs(s.ground.grade) * ((s.ground.axis === 'x' ? pad.w : pad.h) - 1)) / 2;
    }),
  );
  win.level = Math.fround(Math.max(win.level, SEA_LEVEL + drop + FOOT_CLEARANCE));
  const crossings = rivers.length > 0 ? findCrossings(grid, rivers.length) : [];

  /** Write the heights of a `w` by `h` rectangle exactly, `heightAt(row, col)` each. */
  const level = (x, z, w, h, heightAt) => {
    const heights = Array.from({ length: w * h }, (_, i) => heightAt(Math.floor(i / w), i % w));
    return page.evaluate(
      ([x0, z0, cols, rows, list]) =>
        window.__slimcity.cmd('Level ground', [
          {
            kind: 'terraformSet',
            x: x0,
            z: z0,
            w: cols,
            h: rows,
            heights: Float32Array.from(list),
          },
        ]),
      [x, z, w, h, heights],
    );
  };
  const standing = (x, z, h) =>
    settle(page, {
      until: ([i, want]) => Math.abs(window.__slimcity.readGrid().height[i] - want) < 1e-3,
      arg: [z * grid.size + x, h],
    });
  await level(win.x, win.z, layout.width, layout.height, () => win.level);
  await standing(win.x + layout.width - 1, win.z + layout.height - 1, win.level);

  const pieces = [];
  const expectHomes = [];
  for (const piece of spec.subjects) {
    // A river piece lies across the water it was given, bank to bank, on the ground as it is.
    const crossing = piece.river ? crossings[rivers.indexOf(piece)] : null;
    const pad = crossing
      ? { x: 0, z: 0, w: crossing.span + 2 * BANK, h: 1 }
      : layout.pads[dry.indexOf(piece)];
    const origin = crossing
      ? { x: crossing.from - BANK, z: crossing.z }
      : { x: win.x + pad.x, z: win.z + pad.z };
    if (piece.ground && piece.ground.grade) {
      const { grade, axis = 'z' } = piece.ground;
      const along = axis === 'z' ? pad.h : pad.w;
      const base = (k) => win.level + (k - (along - 1) / 2) * grade;
      await level(origin.x, origin.z, pad.w, pad.h, (row, col) => base(axis === 'z' ? row : col));
      await standing(origin.x + pad.w - 1, origin.z + pad.h - 1, base(along - 1));
    }
    const p = { ...helpers(origin, page, catalogBox, tile), w: pad.w, h: pad.h };
    const roads = [];
    for (const cmd of await piece.lay(p)) {
      await send(piece.id, [cmd]);
      if (cmd.kind === 'buildRoad') roads.push(...cmd.tiles);
      if (cmd.kind === 'placeBuilding') expectHomes.push(`${cmd.catalogId}@${cmd.x},${cmd.z}`);
    }
    await waitForRoads(session, roads, piece.id);
    if (piece.after)
      await waitForRoads(session, await piece.after(p, { page, aim, clickTool }), piece.id);
    const view = { x0: 0, z0: 0, length: pad.w, width: pad.h, axis: 'x', ...(piece.view ?? {}) };
    const onMap = (box) => ({ ...box, x0: origin.x + box.x0, z0: origin.z + box.z0, tile });
    pieces.push({
      ...piece,
      run: onMap(view),
      closeRun: onMap({ ...view, ...(piece.close ?? {}) }),
    });
  }
  await waitForBuildings(page, expectHomes);
  await settle(page);
  return pieces;
}

/**
 * Take every standard view of every piece, then the declared details, then the one night
 * frame of the first piece's oblique view. `shoot(name, camera)` writes a frame.
 */
export async function photographRoads(session, spec, ctx) {
  const { page } = session;
  const pieces = await buildScene(session, spec, ctx);
  for (const piece of pieces)
    for (const view of ROAD_VIEWS)
      await ctx.shoot(
        `${piece.id}-${view}`,
        roadView(view, view === 'along' ? piece.run : piece.closeRun),
      );

  for (const d of spec.details ?? []) {
    const { run } = pieces.find((s) => s.id === d.subject);
    // `local` and `distance` may be functions of the run where its size is not known until the
    // water is found.
    const [lx, lz] = typeof d.local === 'function' ? d.local(run, ctx.tile) : d.local;
    const along = (run.length - 1) / 2;
    const across = ((run.width ?? 1) - 1) / 2;
    const restore = d.scale > 1 ? await closeUp(page, d.scale) : null;
    await ctx.shoot(`${d.subject}-${d.name}`, {
      tx: run.x0 + (run.axis === 'z' ? across : along) + lx / ctx.tile,
      tz: run.z0 + (run.axis === 'z' ? along : across) + lz / ctx.tile,
      distance: typeof d.distance === 'function' ? d.distance(run, ctx.tile) : d.distance,
      yaw: d.yaw,
      pitch: d.pitch,
    });
    if (restore) await restore();
  }

  await ctx.night();
  await ctx.shoot(`${pieces[0].id}-night`, roadView('oblique', pieces[0].closeRun));
}
