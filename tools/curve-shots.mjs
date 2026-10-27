/** Shots of parcels that follow a curved street: an S-bend two-lane street
 * drawn off the grid from a grid street, zoned low-density both sides and
 * grown, then shot (1) from above, (2) close on one drive at the bend, (3) the
 * same bend through the zoning lens, and (4) the grid street beside the bend,
 * whose lots must be exactly as before.
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
const ZONE = { ResLow: 1 };
/** Tiles the zone band reaches from the bend's centre line, each side. */
const ZONE_REACH_TILES = 3;
/** Half the road's footprint in tiles: a tile this close to the centre line is the road's, not the zone's. */
const ROAD_HALF_TILES = 0.75;
/** How long the town is given to grow, and how often it is asked. */
const GROW_POLLS = Number(process.env.CURVE_POLLS ?? 900);
const POLL_MS = 200;
const OVERHEAD_PITCH = 1.3;
const STREET_PITCH = 0.7;

const b = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.addInitScript(
  ([session]) => {
    try {
      sessionStorage.setItem('slimcity.session', JSON.stringify(session));
      localStorage.setItem(
        'slimcity.settings',
        JSON.stringify({ sandboxUnlockAll: true, unlimitedMoney: true }),
      );
    } catch (e) {
      void e;
    }
  },
  [{ screen: 'playing', seed: SEED, mode: 'new' }],
);

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#viewport canvas', { timeout: 60000 });
  await hooksReady(page);

  const call = (fn, ...a) => page.evaluate(fn, ...a);
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
  const midTile = { x: X + 19, z: GRID_Z + 12 };
  const endTile = { x: X + 27, z: GRID_Z + 24 };
  const arcs = [
    { a: cm(joinTile.x, joinTile.z), control: cm(X + 29, GRID_Z + 8), b: cm(midTile.x, midTile.z) },
    { a: cm(midTile.x, midTile.z), control: cm(X + 13, GRID_Z + 18), b: cm(endTile.x, endTile.z) },
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
  const centreLine = [];
  for (const arc of arcs) for (let i = 0; i <= 60; i++) centreLine.push(bezier(arc, i / 60));
  const distanceToLine = (tx, tz) => {
    let best = Infinity;
    for (const p of centreLine) best = Math.min(best, Math.hypot(tx + 0.5 - p.x, tz + 0.5 - p.z));
    return best;
  };
  const bendZone = [];
  for (let tz = GRID_Z + 1; tz <= endTile.z + ZONE_REACH_TILES; tz++) {
    for (let tx = X + 8; tx <= X + 34; tx++) {
      const d = distanceToLine(tx, tz);
      if (d > ROAD_HALF_TILES && d <= ZONE_REACH_TILES && !g.water[idx(tx, tz)]) {
        bendZone.push({ x: tx, z: tz });
      }
    }
  }
  const gridZone = [];
  for (let tz = GRID_Z + 1; tz <= GRID_Z + 3; tz++) {
    for (let tx = X + 2; tx <= X + 14; tx++) gridZone.push({ x: tx, z: tz });
  }
  await cmd('Zone bend', [{ kind: 'paintZone', zone: ZONE.ResLow, tiles: bendZone }]);
  await cmd('Zone grid', [{ kind: 'paintZone', zone: ZONE.ResLow, tiles: gridZone }]);
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
  for (let i = 0; i < GROW_POLLS; i++) {
    await page.waitForTimeout(POLL_MS);
    const buildings = await readBuildings();
    framed = buildings.filter((bl) => bl.frame);
    const grown = buildings.filter((bl) => bl.catalogId.startsWith('res')).length;
    if (i % 25 === 0) console.log('poll', i, 'homes', grown, 'framed', framed.length);
    if (framed.length >= 10 && grown >= 16) break;
  }
  await setSpeed(0);
  await page.waitForTimeout(800);
  const s = await stats();
  console.log('population', s.population, 'framed homes', framed.length);
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
} finally {
  await b.close();
}
