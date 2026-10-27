/** Shots of parcels that follow a curved street: an S-bend two-lane street
 * drawn off the grid from a grid street, its first half zoned low-density
 * both sides, its second half low commercial on one side and medium
 * residential on the other, grown, then shot (1) from above, (2) close on one
 * drive at the bend, (3) the same bend through the zoning lens, (4) the grid
 * street beside the bend, whose lots must be exactly as before, (6) a shop's
 * car park and curb cut square to the road, (6b) a strip across a run of
 * parcels, (7) a walk-up on the bend, (8) the commercial side through the
 * lens, and (9) a street lamp standing clear of a framed drive's mouth.
 *
 * The town is put on flat dry ground with the sandbox unlocked and money
 * unlimited; a plant and a tower on the grid street power and water the
 * bend through it, since every service walks the street network.
 *
 * Usage: node tools/curve-shots.mjs [baseUrl] [outDir]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { closeUp, hooksReady, tileCamera } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-curve';
mkdirSync(out, { recursive: true });

const SEED = 12345;
const RT = { TwoLane: 1 };
const ZONE = { ResLow: 1, ComLow: 3, Industrial: 5, ResMedium: 7 };
/** How wide each kind stands on its street, in lots: its catalogue footprint's width, read once the page is up. */
let kindWidths = {};
const widthOf = (catalogId) => kindWidths[catalogId] ?? 1;
const isShop = (bl) => bl.catalogId.startsWith('com');
const isWalkUp = (bl) => bl.catalogId.startsWith('res-multiplex') || bl.catalogId.startsWith('res-medium');
/** Tiles the zone band reaches from the bend's centre line, each side. */
const ZONE_REACH_TILES = 4;
/** The same for the first arc, as it was drawn before the second arc was given a run's gentle bend. */
const FIRST_ARC_REACH_TILES = 3;
/** Half the road's footprint in tiles: a tile this close to the centre line is the road's, not the zone's. */
const ROAD_HALF_TILES = 0.28;
/** How long the town is given to grow, and how often it is asked. */
const GROW_POLLS = Number(process.env.CURVE_POLLS ?? 900);
const POLL_MS = 200;
/** The jobs the town has when its shop band is zoned. */
const SHOP_ZONE_JOBS = 30;
/** The earliest poll the shops are zoned, so the park has lifted the land value the kerb is cut by. */
const SHOP_ZONE_POLL = Number(process.env.SHOP_POLL ?? 80);
const OVERHEAD_PITCH = 1.3;
const STREET_PITCH = 0.7;

/** The milestone the town starts at: walk-ups unlock at Busy Township (1,200 people), which a hand-grown
 * town of a few dozen homes never reaches, so the start is a flat dry map saved at that rung. */
const START_MILESTONE = 2;

const b = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const context = await b.newContext({ viewport: { width: 1400, height: 900 } });
const initSession = (session) =>
  context.addInitScript(
    ([s]) => {
      try {
        sessionStorage.setItem('slimcity.session', JSON.stringify(s));
        localStorage.setItem(
          'slimcity.settings',
          JSON.stringify({ sandboxUnlockAll: true, unlimitedMoney: true }),
        );
      } catch (e) {
        void e;
      }
    },
    [session],
  );

try {
  // A scratch page stores the save; the town page then loads it.
  await initSession({ screen: 'playing', seed: SEED, mode: 'new' });
  const boot = await context.newPage();
  await boot.goto(url, { waitUntil: 'domcontentloaded' });
  await boot.waitForSelector('#viewport canvas', { timeout: 60000 });
  await hooksReady(boot);
  const saveId = await boot.evaluate(async (level) => {
    const sim = await import('/tests/support/sim.ts');
    const persist = await import('/src/app/persist.ts');
    const h = sim.initializedAtMilestone(level);
    h.sim.handleMessage({ type: 'requestSave' });
    await persist.storeSave(sim.latestSaveData(h));
    return (await persist.listSaves())[0].id;
  }, START_MILESTONE);
  await boot.close();
  await initSession({ screen: 'playing', seed: 0, mode: 'load', saveId });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#viewport canvas', { timeout: 60000 });
  await hooksReady(page);

  const call = (fn, ...a) => page.evaluate(fn, ...a);
  kindWidths = await call(async () => {
    const m = await import('/src/data/catalog.json');
    const list = (m.default ?? m).buildings;
    return Object.fromEntries(list.map((e) => [e.id, e.footprint.w]));
  });
  const cmd = (l, c) => call(([x, y]) => window.__slimcity.cmd(x, y), [l, c]);
  const readGrid = () => call(() => window.__slimcity.readGrid());
  const readBuildings = () => call(() => window.__slimcity.readBuildings());
  const stats = () => call(() => window.__slimcity.getStats());
  const setSpeed = (s) => call((x) => window.__slimcity.setSpeed(x), s);
  const setTool = (t) => call((x) => window.__slimcity.setTool(x), t);
  const cam = tileCamera(page);
  const T = await call(() => window.__slimcity.tileMeters());
  const shot = async (name, settle = 1500) => {
    await page.waitForTimeout(settle);
    await page.screenshot({ path: `${out}/${name}.png` });
    console.log('shot', name);
  };

  await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
  await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
  await call(() => {
    window.__slimcity.setSpeed(0);
    window.__slimcity.setDayT(0.5);
  });

  // Flat dry ground for the grid street, the bend and the zone bands round it.
  const g = await readGrid();
  const N = g.size;
  const idx = (x, z) => z * N + x;
  const SPAN_X = 36;
  const SPAN_Z = 30;
  let anchor = null;
  let flattest = { spread: Infinity, at: null };
  for (let z = 30; z < N - SPAN_Z - 30 && !anchor; z++) {
    for (let x = 30; x < N - SPAN_X - 30; x++) {
      let lo = Infinity;
      let hi = -Infinity;
      let dry = true;
      for (let dz = 0; dz < SPAN_Z && dry; dz += 2) {
        for (let dx = 0; dx < SPAN_X && dry; dx += 2) {
          const i = idx(x + dx, z + dz);
          if (g.water[i]) dry = false;
          const h = g.height[i];
          if (h < lo) lo = h;
          if (h > hi) hi = h;
        }
      }
      if (!dry) continue;
      const spread = hi - lo;
      if (spread < flattest.spread) flattest = { spread, at: { x, z } };
      if (spread <= 0.5) {
        anchor = { x, z };
        break;
      }
    }
  }
  if (!anchor) anchor = flattest.at;
  if (!anchor) throw new Error('no dry ground for the bend');
  const { x: X, z: Z } = anchor;
  console.log('anchor', JSON.stringify(anchor));

  // --- the grid street, with the plant and the tower on it -------------------
  // A grid street along the block's north row, west to east; the bend leaves
  // its east end southward and swings back, an S of two quadratic arcs.
  const GRID_Z = Z + 2;
  const gridTiles = Array.from({ length: 24 }, (_, i) => ({ x: X + 2 + i, z: GRID_Z }));
  await cmd('Grid street', [{ kind: 'buildRoad', tier: RT.TwoLane, tiles: gridTiles }]);
  // A works street below it, joined by a short link: shops open only against
  // the local jobs of industry, and a strip or a walk-up needs more of them
  // than the corner shop does, so the town needs a works and its workers.
  const WORKS_Z = GRID_Z - 8;
  const worksTiles = Array.from({ length: 13 }, (_, i) => ({ x: X + 6 + i, z: WORKS_Z }));
  const linkTiles = Array.from({ length: 7 }, (_, i) => ({ x: X + 14, z: WORKS_Z + 1 + i }));
  await cmd('Works street', [{ kind: 'buildRoad', tier: RT.TwoLane, tiles: [...linkTiles, ...worksTiles] }]);
  // Seated hard against the grid street: power and water conduct along roads.
  await cmd('Utilities', [
    { kind: 'placeBuilding', catalogId: 'coal-plant', x: X + 3, z: GRID_Z - 4, rotation: 0 },
    { kind: 'placeBuilding', catalogId: 'water-tower', x: X + 9, z: GRID_Z - 1, rotation: 0 },
  ]);
  await page.waitForTimeout(500);
  const utilities = await readBuildings();
  console.log('utilities', JSON.stringify(utilities.map((bl) => `${bl.catalogId}@${bl.x},${bl.z}`)));
  await page.waitForTimeout(400);

  // --- the S-bend, off the grid -----------------------------------------------
  // Segment ends and controls are world centimetres; an end on a grid road
  // tile's centre joins that road. Each arc is a quadratic Bezier.
  const cm = (tx, tz) => ({ x: (tx + 0.5) * T * 100, z: (tz + 0.5) * T * 100 });
  const joinTile = { x: X + 25, z: GRID_Z };
  const midTile = { x: X + 19, z: GRID_Z + 12.5 };
  // The second arc leaves the first south, down a tile column, and bends 24 degrees over about
  // 170 m, a radius near 400 m: 35 m of lateral drift, inside a run's 8 degrees.
  const endTile = { x: X + 17.4, z: GRID_Z + 20.2 };
  const arcs = [
    { a: cm(joinTile.x, joinTile.z), control: cm(X + 29, GRID_Z + 8), b: cm(midTile.x, midTile.z) },
    { a: cm(midTile.x, midTile.z), control: cm(X + 19, GRID_Z + 16.5), b: cm(endTile.x, endTile.z) },
  ];
  for (const [i, arc] of arcs.entries()) {
    const r = await cmd(`Bend ${i + 1}`, [{ kind: 'buildSegment', tier: RT.TwoLane, ...arc }]);
    console.log('segment', i + 1, JSON.stringify(r));
  }
  await page.waitForTimeout(600);

  // --- zoning both sides of the bend, and the grid street's south side --------
  // The zone band is every tile within reach of the bend's centre line but
  // not under the road itself; the plat finds the parcels along the kerb.
  const bezier = (arc, t) => {
    const u = 1 - t;
    return {
      x: (u * u * arc.a.x + 2 * u * t * arc.control.x + t * t * arc.b.x) / 100 / T,
      z: (u * u * arc.a.z + 2 * u * t * arc.control.z + t * t * arc.b.z) / 100 / T,
    };
  };
  const ARC_STEPS = 60;
  const centreLine = [];
  for (const arc of arcs) for (let i = 0; i <= ARC_STEPS; i++) centreLine.push(bezier(arc, i / ARC_STEPS));
  // The nearest point of the centre line to a tile: how far, which arc it is
  // on, and which side of the road the tile lies (the sign of the tangent's
  // cross product with the offset).
  const nearestOnLine = (tx, tz) => {
    let best = { d: Infinity, arc: 0, side: 1 };
    centreLine.forEach((p, i) => {
      const d = Math.hypot(tx + 0.5 - p.x, tz + 0.5 - p.z);
      if (d >= best.d) return;
      const q = centreLine[Math.min(i + 1, centreLine.length - 1)];
      const r = centreLine[Math.max(i - 1, 0)];
      const cross = (q.x - r.x) * (tz + 0.5 - p.z) - (q.z - r.z) * (tx + 0.5 - p.x);
      best = { d, arc: i > ARC_STEPS ? 1 : 0, step: i % (ARC_STEPS + 1), side: cross >= 0 ? 1 : -1 };
    });
    return best;
  };
  // The first arc stays low-density both sides; the second takes shops on one
  // side and walk-ups on the other, so every rung of the ladder meets the kerb.
  const bendZone = [];
  const shopZone = [];
  const walkUpZone = [];
  for (let tz = GRID_Z + 1; tz <= endTile.z + ZONE_REACH_TILES; tz++) {
    for (let tx = X + 4; tx <= X + 34; tx++) {
      const near = nearestOnLine(tx, tz);
      const reach = near.arc === 0 ? FIRST_ARC_REACH_TILES : ZONE_REACH_TILES;
      if (near.d <= ROAD_HALF_TILES || near.d > reach || g.water[idx(tx, tz)]) continue;
      const tile = { x: tx, z: tz };
      // Runs of parcels stand abutting on the side whose kerb opens out, so
      // the walk-ups and the shops share it, the other side being homes.
      if (near.arc === 0 || near.side < 0) bendZone.push(tile);
      else if (near.step < ARC_STEPS * 0.4) walkUpZone.push(tile);
      else shopZone.push(tile);
    }
  }
  const gridZone = [];
  for (let tz = GRID_Z + 1; tz <= GRID_Z + 3; tz++) {
    for (let tx = X + 2; tx <= X + 14; tx++) gridZone.push({ x: tx, z: tz });
  }
  await cmd('Zone bend', [{ kind: 'paintZone', zone: ZONE.ResLow, tiles: bendZone }]);
  await cmd('Zone walk-ups', [{ kind: 'paintZone', zone: ZONE.ResMedium, tiles: walkUpZone }]);
  await cmd('Zone grid', [{ kind: 'paintZone', zone: ZONE.ResLow, tiles: gridZone }]);
  // Shops open only against industry's local jobs, so a small works stands on
  // the grid street's north side to call them.
  const industryZone = [];
  for (let tz = GRID_Z - 3; tz <= GRID_Z - 1; tz++) {
    for (let tx = X + 12; tx <= X + 24; tx++) industryZone.push({ x: tx, z: tz });
  }
  for (let tz = WORKS_Z + 1; tz <= WORKS_Z + 3; tz++) {
    for (let tx = X + 6; tx <= X + 18; tx++) industryZone.push({ x: tx, z: tz });
  }
  for (let tz = WORKS_Z - 3; tz < WORKS_Z; tz++) {
    for (let tx = X + 6; tx <= X + 18; tx++) gridZone.push({ x: tx, z: tz });
  }
  await cmd('Zone works homes', [{ kind: 'paintZone', zone: ZONE.ResLow, tiles: gridZone }]);
  await cmd('Zone industry', [{ kind: 'paintZone', zone: ZONE.Industrial, tiles: industryZone }]);
  console.log('zoned', JSON.stringify({ low: bendZone.length, shops: shopZone.length, walkUps: walkUpZone.length }));
  await page.waitForTimeout(400);

  // --- the plat before anything grows -----------------------------------------
  const bendCentre = { x: midTile.x, z: midTile.z };
  await setTool('zone.resLow');
  await cam(bendCentre.x, bendCentre.z, 260, 0, OVERHEAD_PITCH);
  await shot('0-plat-from-above', 2000);
  const framedPlat = await call(() => window.__slimcity.readFramedPlat());
  console.log(
    'framed plat:',
    framedPlat.length,
    'parcels',
    JSON.stringify(
      framedPlat.map((p) => ({
        x: Math.round(p.frame.x / T * 10) / 10,
        z: Math.round(p.frame.z / T * 10) / 10,
        h: Math.round(p.frame.heading * 100) / 100,
        w: p.w,
        d: p.d,
        tiles: p.tiles.length,
      })),
    ),
  );
  await setTool('select');

  // --- let it grow --------------------------------------------------------------
  await setSpeed(4);
  let framed = [];
  // The shops are zoned once the works' jobs give the town room for more than
  // corner shops: a restaurant or a strip needs more room than a corner shop,
  // and a shop band zoned from the start is filled with corner shops first.
  let shopsZoned = false;
  for (let i = 0; i < GROW_POLLS; i++) {
    await page.waitForTimeout(POLL_MS);
    if (!shopsZoned && i >= SHOP_ZONE_POLL && (await stats()).jobs >= SHOP_ZONE_JOBS) {
      await cmd('Zone shops', [{ kind: 'paintZone', zone: ZONE.ComLow, tiles: shopZone }]);
      shopsZoned = true;
      console.log('shops zoned at poll', i);
      await setTool('zone.comLow');
      await page.waitForTimeout(1500);
      const cut = await call(() => window.__slimcity.readFramedPlat());
      console.log('shop plat', JSON.stringify(cut.map((p) => `${p.side}@${Math.round(p.s * 10) / 10}:${p.lot}`)));
      const cutFit = await call(() => window.__slimcity.readFramedPlatFit());
      console.log('shop land value', JSON.stringify(cutFit.parcels.map((p) => p.landValue)));
      await setTool('select');
    }
    const buildings = await readBuildings();
    framed = buildings.filter((bl) => bl.frame);
    const grown = buildings.filter((bl) => bl.catalogId.startsWith('res')).length;
    const shops = framed.filter(isShop).length;
    const walkUps = framed.filter(isWalkUp).length;
    if (i % 25 === 0) {
      console.log('poll', i, 'homes', grown, 'framed', framed.length, 'shops', shops, 'walk-ups', walkUps);
    }
    const strips = framed.filter((bl) => isShop(bl) && widthOf(bl.catalogId) >= 2).length;
    if (framed.length >= 10 && grown >= 16 && shops >= 2 && walkUps >= 1 && strips >= 1) break;
  }
  await setSpeed(0);
  await page.waitForTimeout(800);
  const s = await stats();
  console.log(
    'population',
    s.population,
    'jobs',
    s.jobs,
    'demand',
    JSON.stringify(s.demand),
    'framed',
    framed.length,
    'shops',
    framed.filter(isShop).length,
    'walk-ups',
    framed.filter(isWalkUp).length,
  );
  if (framed.length === 0) {
    console.log('WARNING: no framed building grew on the bend');
    // What the town has to grow with: its stats, and whether the zoned tiles are served.
    console.log('stats', JSON.stringify(s));
    const g1 = await readGrid();
    const served = (tiles) => {
      let powered = 0;
      let watered = 0;
      let zoned = 0;
      for (const t of tiles) {
        const i = idx(t.x, t.z);
        if (g1.zone[i] === ZONE.ResLow) zoned++;
        if (g1.power[i]) powered++;
        if (g1.waterPipe[i]) watered++;
      }
      return { tiles: tiles.length, zoned, powered, watered };
    };
    console.log('bend band', JSON.stringify(served(bendZone)));
    console.log('grid band', JSON.stringify(served(gridZone)));
    console.log(
      'buildings',
      JSON.stringify((await readBuildings()).map((bl) => `${bl.catalogId}@${bl.x},${bl.z}:${bl.state}`)),
    );
  }

  // The parcels still free on the second arc, by zone: where a run could stand.
  for (const [tool, name] of [['zone.comLow', 'shop'], ['zone.resMedium', 'walk-up']]) {
    await setTool(tool);
    const free = await call(() => window.__slimcity.readFramedPlat());
    console.log(
      `free ${name} parcels:`,
      JSON.stringify(free.map((p) => `side${p.side}@${Math.round(p.s)}`)),
    );
  }
  await setTool('select');

  // (1) The bend from above: every house square to its street, drives to the kerb.
  await cam(bendCentre.x, bendCentre.z, 260, 0, OVERHEAD_PITCH);
  await shot('1-bend-from-above', 2000);
  await cam(bendCentre.x, bendCentre.z, 160, 0.6, 0.9);
  await shot('1b-bend-three-quarter', 2000);

  // (2) Close on one drive at the bend: the framed home nearest the S's middle.
  const nearest = framed
    .map((bl) => ({
      bl,
      d: Math.hypot(bl.frame.x / T - (bendCentre.x + 0.5), bl.frame.z / T - (bendCentre.z + 0.5)),
    }))
    .sort((p, q) => p.d - q.d)[0];
  if (nearest) {
    const f = nearest.bl.frame;
    // The frontage's middle, two tiles' worth along the parcel from its front-left corner.
    const u = T;
    const front = {
      x: (f.x + u * Math.cos(f.heading)) / T - 0.5,
      z: (f.z + u * Math.sin(f.heading)) / T - 0.5,
    };
    console.log('close on', nearest.bl.catalogId, 'frame', JSON.stringify(f));
    const restore = await closeUp(page, 2);
    // Looking along the drive from over the road: the camera yaw faces the parcel's inward direction.
    await cam(front.x, front.z, 45, f.heading + Math.PI / 2, STREET_PITCH);
    await shot('2-drive-at-the-bend', 2500);
    await cam(front.x, front.z, 45, f.heading + Math.PI / 2, OVERHEAD_PITCH);
    await shot('2b-drive-at-the-bend-above', 2500);
    await restore();
  }

  // (3) The same bend through the zoning lens: parcel outlines turned with the road.
  await setTool('zone.resLow');
  await cam(bendCentre.x, bendCentre.z, 200, 0, OVERHEAD_PITCH);
  await shot('3-bend-zoning-lens', 2500);
  // Each outline against the drawn road: its origin should stand on the kerb
  // line, the road's half width off the centre line, and be cut by a known land value.
  const fit = await call(() => window.__slimcity.readFramedPlatFit());
  console.log('lens land value known:', fit.landValueKnown, 'kerb parcels:', fit.parcels.length);
  for (const p of fit.parcels) {
    const off = p.centreLineM === null || p.halfWidthM === null ? null : p.centreLineM - p.halfWidthM;
    console.log(
      `  parcel @tile(${(p.x / T).toFixed(2)},${(p.z / T).toFixed(2)}) h=${p.heading.toFixed(2)} ${p.w}x${p.d} tiles=${p.tiles}` +
        ` centreLine=${p.centreLineM?.toFixed(2) ?? 'none'} halfWidth=${p.halfWidthM?.toFixed(2) ?? 'none'}` +
        ` drawnHalf=${p.drawnHalfM?.toFixed(2) ?? 'none'} offKerb=${off?.toFixed(2) ?? 'none'} landValue=${p.landValue}`,
    );
  }
  // (3d) Straight down over the west side of the bend, no perspective lean,
  // with the rows of every parcel in that frame against its kerb point.
  const west = { x: X + 17, z: GRID_Z + 16 };
  const WEST_REACH_TILES = 4.5;
  {
    const restore = await closeUp(page, 2);
    await cam(west.x, west.z, 110, 0, Math.PI / 2);
    await shot('3d-west-side-straight-down', 2500);
    await restore();
  }
  console.log(`west frame: tiles ${west.x}±${WEST_REACH_TILES}, ${west.z}±${WEST_REACH_TILES}`);
  for (const p of fit.parcels) {
    const tx = p.x / T;
    const tz = p.z / T;
    if (Math.abs(tx - west.x - 0.5) > WEST_REACH_TILES || Math.abs(tz - west.z - 0.5) > WEST_REACH_TILES) continue;
    const kerbGap =
      p.kerbX === null ? null : Math.hypot(p.kerbX - p.x, p.kerbZ - p.z);
    console.log(
      `  west parcel origin=(${p.x.toFixed(2)}, ${p.z.toFixed(2)}) m tile(${tx.toFixed(2)},${tz.toFixed(2)}) h=${p.heading.toFixed(3)} ${p.w}x${p.d}` +
        ` nearCentre=(${p.nearX?.toFixed(2) ?? 'none'}, ${p.nearZ?.toFixed(2) ?? 'none'})` +
        ` kerb=(${p.kerbX?.toFixed(2) ?? 'none'}, ${p.kerbZ?.toFixed(2) ?? 'none'}) originToKerb=${kerbGap?.toFixed(2) ?? 'none'} m`,
    );
  }
  // One free parcel's outline up close against the drawn road edge.
  const free = fit.parcels[0];
  if (free) {
    const restore = await closeUp(page, 2);
    await cam(free.x / T - 0.5, free.z / T - 0.5, 40, 0, OVERHEAD_PITCH);
    await shot('3c-lens-parcel-on-kerb', 2500);
    await restore();
  }
  const grownLots = (await readBuildings())
    .filter((bl) => bl.frame)
    .map((bl) => `${bl.catalogId}@tile(${(bl.frame.x / T).toFixed(2)},${(bl.frame.z / T).toFixed(2)})`);
  console.log('grown framed lots (sim):', JSON.stringify(grownLots));
  if (nearest) {
    const f = nearest.bl.frame;
    await cam(f.x / T - 0.5, f.z / T - 0.5, 80, 0, OVERHEAD_PITCH);
    await shot('3b-lens-close', 2500);
  }
  await setTool('select');

  // (5) A ploppable in hand over the bend: the grid, the tint and every plat
  // show with the ghost, so nothing is set down over unseen lots.
  await setTool('plop.police-station');
  await cam(bendCentre.x, bendCentre.z, 200, 0, OVERHEAD_PITCH);
  await page.waitForTimeout(800);
  const view = page.viewportSize();
  await page.mouse.move(view.width / 2, view.height / 2 - 60);
  await page.waitForTimeout(300);
  await page.mouse.move(view.width / 2 + 10, view.height / 2 - 50);
  await shot('5-ploppable-in-hand', 2500);
  await setTool('select');

  // (4) The grid street beside the bend: its lots exactly as before.
  await cam(X + 8, GRID_Z + 1, 120, 0, STREET_PITCH);
  await shot('4-grid-street-beside-the-bend', 2000);
  await cam(X + 8, GRID_Z + 1, 140, 0, OVERHEAD_PITCH);
  await shot('4b-grid-street-above', 2000);

  // --- the rest of the ladder on the second arc ----------------------------------
  // A lot point in the world, as lotToWorld carries it: u along the kerb, v in from the kerb line.
  const lotPoint = (f, u, v, mirror = 1) => ({
    x: f.x + u * Math.cos(f.heading) - v * mirror * Math.sin(f.heading),
    z: f.z + u * Math.sin(f.heading) + v * mirror * Math.cos(f.heading),
  });
  const secondMid = bezier(arcs[1], 0.5);
  const nearestTo = (list, at) =>
    list
      .map((bl) => ({ bl, d: Math.hypot(bl.frame.x / T - at.x, bl.frame.z / T - at.z) }))
      .sort((p, q) => p.d - q.d)[0]?.bl ?? null;
  const grownNow = await readBuildings();
  const framedNow = grownNow.filter((bl) => bl.frame);
  const shops = framedNow.filter(isShop);
  const walkUps = framedNow.filter(isWalkUp);
  console.log(
    'framed ladder:',
    JSON.stringify(framedNow.map((bl) => `${bl.catalogId}@tile(${(bl.frame.x / T).toFixed(1)},${(bl.frame.z / T).toFixed(1)})`)),
  );
  // Looking at a framed lot's frontage from over the road, square to its kerb.
  const frontOf = (bl) => {
    const f = bl.frame;
    const mid = lotPoint(f, (widthOf(bl.catalogId) * T) / 2, 0);
    return { x: mid.x / T - 0.5, z: mid.z / T - 0.5, yaw: f.heading + Math.PI / 2 };
  };

  // (6) A shop's car park and curb cut square to the road, close.
  const shop = nearestTo(shops, secondMid);
  if (shop) {
    const front = frontOf(shop);
    console.log('shop', shop.catalogId, 'frame', JSON.stringify(shop.frame));
    const restore = await closeUp(page, 2);
    await cam(front.x, front.z, 55, front.yaw, STREET_PITCH);
    await shot('6-shop-car-park-at-the-bend', 2500);
    await cam(front.x, front.z, 60, front.yaw, OVERHEAD_PITCH);
    await shot('6a-shop-car-park-above', 2500);
    await restore();
  } else {
    console.log('WARNING: no framed shop grew on the bend');
  }

  // (6b) A kind two or more lots wide across a run of parcels, from above.
  const strip = nearestTo(shops.filter((bl) => widthOf(bl.catalogId) >= 2), secondMid);
  if (strip) {
    const front = frontOf(strip);
    console.log('strip', strip.catalogId, 'width', widthOf(strip.catalogId), 'frame', JSON.stringify(strip.frame));
    const restore = await closeUp(page, 2);
    await cam(front.x, front.z, 90, front.yaw, Math.PI / 2);
    await shot('6b-strip-on-a-run', 2500);
    await restore();
  } else {
    console.log('WARNING: no framed strip grew on a run');
  }

  // (7) A walk-up on the bend: its body, car park and lawn in the parcel's frame.
  const walkUp = nearestTo(walkUps, secondMid);
  if (walkUp) {
    const front = frontOf(walkUp);
    console.log('walk-up', walkUp.catalogId, 'frame', JSON.stringify(walkUp.frame));
    const restore = await closeUp(page, 2);
    await cam(front.x, front.z, 60, front.yaw, STREET_PITCH);
    await shot('7-walk-up-on-the-bend', 2500);
    await restore();
  } else {
    console.log('WARNING: no framed walk-up grew on the bend');
  }

  // (8) The commercial side through the lens: the runs' parcels outlined.
  await setTool('zone.comLow');
  await cam(secondMid.x, secondMid.z, 200, 0, OVERHEAD_PITCH);
  await shot('8-lens-runs', 2500);
  await setTool('select');

  // (9) A street lamp beside a framed drive, standing clear of its mouth: the
  // framed home whose drive cut lies nearest a lamp pole.
  const poles = await call(() => window.__slimcity.readLampPoles());
  let closest = null;
  for (const bl of framedNow.filter((b) => !isShop(b) && !isWalkUp(b))) {
    const plan = await call((id) => window.__slimcity.readHousePlan(id), bl.id);
    if (!plan) continue;
    for (const drive of plan.drives) {
      const cut = lotPoint(plan.frame, (drive.cut.u0 + drive.cut.u1) / 2, drive.cut.v0, plan.frame.mirror);
      for (const pole of poles) {
        const d = Math.hypot(pole.x - cut.x, pole.z - cut.z);
        if (!closest || d < closest.d) closest = { bl, cut, pole, d, cutWidth: drive.cut.u1 - drive.cut.u0 };
      }
    }
  }
  if (closest) {
    const { bl, cut, pole, d, cutWidth } = closest;
    console.log(
      `lamp nearest a framed drive: ${d.toFixed(2)} m from the cut's mouth (cut ${cutWidth.toFixed(1)} m wide) ` +
        `pole=(${pole.x.toFixed(1)}, ${pole.z.toFixed(1)}) home ${bl.catalogId}`,
    );
    const restore = await closeUp(page, 2);
    const at = { x: (cut.x + pole.x) / 2 / T - 0.5, z: (cut.z + pole.z) / 2 / T - 0.5 };
    await cam(at.x, at.z, 35, bl.frame.heading + Math.PI / 2, STREET_PITCH);
    await shot('9-lamp-beside-framed-drive', 2500);
    await cam(at.x, at.z, 40, 0, Math.PI / 2);
    await shot('9b-lamp-beside-framed-drive-above', 2500);
    await restore();
  } else {
    console.log('WARNING: no lamp pole found near a framed drive');
  }
} finally {
  await b.close();
}
