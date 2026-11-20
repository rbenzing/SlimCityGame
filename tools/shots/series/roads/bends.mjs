import { defineSeries } from '../../lib/series.mjs';
import { settle } from '../../lib/session.mjs';
import { composeProfile, definedProfile, TIER } from '../../lib/roads.mjs';

/** Vehicle kinds (src/shared/types.ts VehicleKind). */
const VEHICLE = { Car: 0, Truck: 1, Bus: 2 };
/** Length of each run of a bend, metres: long enough that no class's arc is held short. */
const ARM_M = 90;
const NODE = { x: 5, z: 4 };
const PAD = { w: 12, h: 10 };
const VIEW = { x0: 0, z0: 0, length: PAD.w, width: PAD.h, line: NODE.z };
const CLOSE = { x0: 1, z0: 2, length: 9, width: 6 };
const cm = (metres) => Math.round(metres * 100);

/** The bend kinds: a preset tier, or a tier with the cross-section the game composes for `edits`. */
const KINDS = {
  'two-lane': { tier: TIER.twoLane, angles: [30, 120] },
  avenue: { tier: TIER.avenue, angles: [30, 120] },
  'four-lane': { tier: TIER.fourLane, angles: [30, 120] },
  'one-way': { tier: TIER.oneWay, flow: 1, angles: [30, 120] },
  gravel: { tier: TIER.gravel, angles: [30, 120] },
  alley: { tier: TIER.alley, angles: [30] },
  'bus-lane': { tier: TIER.bus, angles: [30] },
  'bike-lane': { tier: TIER.bike, angles: [30] },
  motorway: { tier: TIER.highway, angles: [30] },
  tram: { tier: TIER.avenue, edits: { tram: 'reserved' }, angles: [30, 90] },
  'tram-street': { tier: TIER.twoLane, edits: { tram: 'mixed' }, angles: [30] },
};

/** Free segments aren't waited on tile by tile: wait for the game to have drawn more of them. */
let drawn = 0;
const waitDrawn = async (page) => {
  await settle(page, {
    until: ([n]) => window.__slimcity.freeRoadTriangles() > n,
    arg: [drawn],
  });
  drawn = await page.evaluate(() => window.__slimcity.freeRoadTriangles());
};

/** The commands for two runs meeting at the pad's node, the second turned `deg` degrees off the first's line. */
async function bendCommands(p, kind, deg) {
  const node = p.cm(NODE.x, NODE.z);
  const rad = (deg * Math.PI) / 180;
  const start = { x: node.x - cm(ARM_M), z: node.z };
  const end = {
    x: node.x + Math.round(Math.cos(rad) * cm(ARM_M)),
    z: node.z + Math.round(Math.sin(rad) * cm(ARM_M)),
  };
  const out = [];
  let profile = {};
  if (kind.edits) {
    const { id, define } = definedProfile(await composeProfile(p.page, kind.tier, kind.edits));
    out.push(define);
    profile = { profile: id };
  }
  for (const [a, b] of [
    [start, node],
    [node, end],
  ])
    out.push({ kind: 'buildSegment', tier: kind.tier, a, b, flow: kind.flow ?? 0, ...profile });
  return out;
}

const bend = (name, deg) => ({
  id: `${name}-${deg}`,
  pad: PAD,
  view: VIEW,
  close: CLOSE,
  lay: (p) => bendCommands(p, KINDS[name], deg),
  after: async ({ page }) => {
    await waitDrawn(page);
    return [];
  },
});

/** A run along row `NODE.z` of the grid ending at tile 9, and a free run leaving its end. */
const gridEnd = (name, tier, deg) => ({
  id: `grid-${name}-${deg}`,
  pad: PAD,
  view: VIEW,
  close: CLOSE,
  lay: (p) => {
    const end = p.cm(9, NODE.z);
    const rad = (deg * Math.PI) / 180;
    return [
      p.road(tier, p.row(NODE.z, 1, 9)),
      {
        kind: 'buildSegment',
        tier,
        a: end,
        b: {
          x: end.x + Math.round(Math.cos(rad) * cm(ARM_M)),
          z: end.z + Math.round(Math.sin(rad) * cm(ARM_M)),
        },
        flow: 0,
      },
    ];
  },
  after: async ({ page }) => {
    await waitDrawn(page);
    return [];
  },
});

/** A corner drawn on the grid: a turn tile between two straights. */
const BEND_TILES = 4;
const gridCorner = (id, tier) => ({
  id,
  pad: { w: 2 * BEND_TILES + 1, h: 2 * BEND_TILES + 1 },
  close: { x0: 2, z0: 2, length: BEND_TILES + 1, width: BEND_TILES + 1 },
  lay: (p) => [
    p.road(tier, p.col(BEND_TILES, 0, BEND_TILES)),
    p.road(tier, p.row(BEND_TILES, BEND_TILES, 2 * BEND_TILES)),
  ],
});

/** Vehicles stand along the 60 degree bend's centre line, read from the game's own bend geometry. */
const VEHICLES_ID = 'two-lane-60-vehicles';
const STANDING = [
  [-26, VEHICLE.Truck, 0],
  [-2, VEHICLE.Car, 0],
  [22, VEHICLE.Bus, 0],
  [-14, VEHICLE.Car, 1],
  [10, VEHICLE.Truck, 1],
  [34, VEHICLE.Car, 1],
];
const SHARE = 0.45;

export default defineSeries({
  name: 'bends',
  type: 'roads',
  purpose:
    'A road turns through a bend on one arc: kerbs, footways, lane lines, median and track sweep round it together, whatever the class and at the angles that differ, on free runs, off the end of a grid street and on a grid corner, and vehicles on a bend stand in their own lanes.',
  budgetS: 60,
  gap: 6,
  subjects: [
    ...Object.entries(KINDS).flatMap(([name, k]) => k.angles.map((deg) => bend(name, deg))),
    gridEnd('two-lane', TIER.twoLane, 90),
    gridEnd('avenue', TIER.avenue, 90),
    gridCorner('grid-corner-two-lane', TIER.twoLane),
    gridCorner('rail-turn', TIER.rail),
    { ...bend('two-lane', 60), id: VEHICLES_ID },
  ],
  scene: async ({ page }, { pieces, tile }) => {
    const piece = pieces.find((s) => s.id === VEHICLES_ID);
    const node = {
      x: (piece.origin.x + NODE.x + 0.5) * tile,
      z: (piece.origin.z + NODE.z + 0.5) * tile,
    };
    const list = await page.evaluate(
      async ([n, arm, tier, share, standing, deg]) => {
        const geom = await import('/src/shared/roadgeom.ts');
        const prof = await import('/src/shared/roadprofile.ts');
        const toCm = (p) => ({ x: Math.round(p.x * 100), z: Math.round(p.z * 100) });
        const rad = (deg * Math.PI) / 180;
        const start = { x: n.x - arm, z: n.z };
        const end = { x: n.x + Math.cos(rad) * arm, z: n.z + Math.sin(rad) * arm };
        const bendAt = geom.bendBetween(
          { geom: { a: toCm(start), b: toCm(n), control: null }, atA: false },
          { geom: { a: toCm(n), b: toCm(end), control: null }, atA: true },
          prof.bendRadiusOf(prof.presetProfileForTier(tier)),
          [arm * share, arm * share],
        );
        const path = bendAt.path;
        const length = path[path.length - 1].s;
        const first = path[0];
        const last = path[path.length - 1];
        // A point `d` metres along the centre line from the arc's middle, carried on straight beyond either end.
        const at = (d) => {
          const s = path[bendAt.middle].s + d;
          if (s <= 0)
            return {
              x: first.x + first.hx * s,
              z: first.z + first.hz * s,
              hx: first.hx,
              hz: first.hz,
            };
          if (s >= length) {
            const over = s - length;
            return {
              x: last.x + last.hx * over,
              z: last.z + last.hz * over,
              hx: last.hx,
              hz: last.hz,
            };
          }
          let i = 0;
          while (i < path.length - 2 && path[i + 1].s < s) i++;
          const p = path[i];
          const q = path[i + 1];
          const u = q.s === p.s ? 0 : (s - p.s) / (q.s - p.s);
          return { x: p.x + (q.x - p.x) * u, z: p.z + (q.z - p.z) * u, hx: p.hx, hz: p.hz };
        };
        return standing.map(([f, kind, back]) => {
          const p = at(f);
          const hx = back ? -p.hx : p.hx;
          const hz = back ? -p.hz : p.hz;
          return { x: p.x, z: p.z, heading: Math.atan2(hx, hz), kind };
        });
      },
      [node, ARM_M, TIER.twoLane, SHARE, STANDING, 60],
    );
    await page.evaluate((v) => window.__slimcity.setVehicles(v), list);
    const stood = await page.evaluate(() => window.__slimcity.readVehicles().length);
    if (stood !== list.length)
      throw new Error(`${stood} of ${list.length} vehicles stand on the bend`);
  },
});
