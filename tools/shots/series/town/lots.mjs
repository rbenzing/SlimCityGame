import { defineSeries } from '../../lib/series.mjs';
import {
  catalogEntry,
  column,
  districtBox,
  framedBox,
  gridBox,
  rect,
  row,
} from '../../lib/town.mjs';

const TWO_LANE = 1;
const GRAVEL = 4;
const RES_LOW = 1;
const COM_LOW = 3;
const INDUSTRIAL = 5;
const RES_MEDIUM = 7;
const AGRICULTURE = 9;
const ACTIVE = 1;
const ABANDONED = 2;
/** Centimetres in a tile: the free street's segment ends are world centimetres. */
const TILE_CM = 2000;
/** Vehicle kind Car (src/shared/types.ts VehicleKind). */
const CAR = 0;
/** The rung the town starts at: Busy Township, where the walk-up homes open (1,200 people). */
const MILESTONE = 2;

const place = (catalogId, x, z, rotation = 0) => ({
  kind: 'placeBuilding',
  catalogId,
  x,
  z,
  rotation,
});
const wind = (x, z) => place('wind-turbine', x, z);
const tower = (x, z) => place('water-tower', x, z);
const zone = (tiles, zoneType = RES_LOW) => ({ kind: 'paintZone', zone: zoneType, tiles });
/** Tiles once each, whatever the overlap of the rectangles they came from. */
const unique = (tiles) => [...new Map(tiles.map((t) => [`${t.x},${t.z}`, t])).values()];
const box = (x0, z0, x1, z1) => ({ x0, z0, x1, z1 });

// --- yards inside an ordinary block: a 7 by 7 block with a street each side, homes by command.
const GX = 40;
const GZ = 40;
const ring = rect(GX + 1, GZ + 1, 7, 7).filter(
  (t) => Math.min(t.x - GX, GX + 8 - t.x, t.z - GZ, GZ + 8 - t.z) <= 3,
);
// The turn picks the side the front is on (0 south, 2 north); the west and east streets take the
// turned twin, which the plat's turned lot is.
const blockHomes = [
  ...Array.from({ length: 7 }, (_, i) => ({ id: 'res-normal-1', x: GX + 1 + i, z: GZ + 1, r: 2 })),
  ...Array.from({ length: 4 }, (_, i) => ({
    id: 'res-normal-t-1',
    x: GX + 1,
    z: GZ + 3 + i,
    r: 0,
  })),
  ...Array.from({ length: 5 }, (_, i) => ({
    id: 'res-normal-t-1',
    x: GX + 6,
    z: GZ + 3 + i,
    r: 0,
  })),
  ...[3, 4, 5].map((i) => ({ id: 'res-normal-1', x: GX + i, z: GZ + 6, r: 0 })),
  ...[1, 2].map((i) => ({ id: 'res-half-1', x: GX + i, z: GZ + 7, r: 0 })),
];
const yardBatches = [
  {
    label: 'block north street',
    commands: [{ kind: 'buildRoad', tier: TWO_LANE, tiles: row(GX, GZ, 9) }],
  },
  {
    label: 'block south street',
    commands: [{ kind: 'buildRoad', tier: TWO_LANE, tiles: row(GX, GZ + 8, 9) }],
  },
  {
    label: 'block west street',
    commands: [{ kind: 'buildRoad', tier: TWO_LANE, tiles: column(GX, GZ, 9) }],
  },
  {
    label: 'block east street',
    commands: [{ kind: 'buildRoad', tier: TWO_LANE, tiles: column(GX + 8, GZ, 9) }],
  },
  { label: 'block power', commands: [wind(GX + 1, GZ - 1), tower(GX + 2, GZ - 1)] },
  { label: 'block zone', commands: [zone(ring)] },
  // One command each: a batch is atomic, and one refused tile would drop the street.
  ...blockHomes.map((h) => ({
    label: `home ${h.id}@${h.x},${h.z}`,
    commands: [
      {
        kind: 'placeBuilding',
        catalogId: h.id,
        x: h.x,
        z: h.z,
        rotation: h.r,
        ...(h.id.includes('-t-') ? { restore: true } : {}),
      },
    ],
  })),
];

// --- homes round a cul-de-sac: a street ends in a turning circle, homes grown round it.
const CX = 40;
const CZ = 70;
const CX1 = CX + 8;
/** The circle's block is named by its north-west tile, beyond the street's end. */
const BLOCK = { x: CX1 + 1, z: CZ };
const blockTiles = rect(BLOCK.x, BLOCK.z, 2, 2);
const culdesacZone = unique([
  ...rect(CX + 2, CZ - 3, 14, 3),
  ...rect(CX + 2, CZ + 1, 14, 3),
  ...rect(BLOCK.x + 2, CZ - 3, 4, 8),
]).filter(
  (t) => !(t.z === CZ && t.x <= CX1) && !blockTiles.some((b) => b.x === t.x && b.z === t.z),
);
const culdesacBatches = [
  {
    label: 'cul-de-sac street',
    commands: [{ kind: 'buildRoad', tier: TWO_LANE, tiles: row(CX, CZ, 9) }],
  },
  { label: 'cul-de-sac power', commands: [wind(CX, CZ - 1), tower(CX + 1, CZ - 1)] },
  {
    // As the Cul-de-sac tool sends it: the block's four tiles as street, then the circle.
    label: 'turning circle',
    commands: [
      {
        kind: 'buildRoad',
        tier: TWO_LANE,
        tiles: blockTiles,
        elevations: blockTiles.map(() => 0),
      },
      { kind: 'buildCulDeSac', x: BLOCK.x, z: BLOCK.z },
    ],
  },
  { label: 'cul-de-sac zone', commands: [zone(culdesacZone)] },
];

// --- parcels on a curved street: an S-bend off a grid street, zoned both sides. Its first arc
// takes homes both sides; the second takes homes on one side and, on the other, walk-ups and then
// shops, so every rung of the ladder meets the kerb.
const SX = 100;
const SZ = 90;
const cm = (tx, tz) => ({ x: (tx + 0.5) * TILE_CM, z: (tz + 0.5) * TILE_CM });
const arcs = [
  { a: cm(SX + 25, SZ), control: cm(SX + 29, SZ + 8), b: cm(SX + 19, SZ + 12.5) },
  { a: cm(SX + 19, SZ + 12.5), control: cm(SX + 19, SZ + 16.5), b: cm(SX + 17.4, SZ + 20.2) },
];
/** Tiles the zone band reaches from each arc's centre line, and half the road's width in tiles. */
const REACH = [3, 4];
const ROAD_HALF = 0.28;
/** Steps along an arc, and the share of the second arc the walk-ups take before the shops. */
const STEPS = 60;
const WALK_UP_SHARE = 0.4;
const centre = arcs.flatMap((arc, a) =>
  Array.from({ length: STEPS + 1 }, (_, i) => {
    const t = i / STEPS;
    const u = 1 - t;
    const at = (k) => (u * u * arc.a[k] + 2 * u * t * arc.control[k] + t * t * arc.b[k]) / TILE_CM;
    return { x: at('x'), z: at('z'), arc: a, step: i };
  }),
);
/** The nearest point of the centre line to a tile: how far, which arc, how far along, which side. */
const nearest = (t) => {
  let best = { d: Infinity };
  centre.forEach((p, i) => {
    const d = Math.hypot(t.x + 0.5 - p.x, t.z + 0.5 - p.z);
    if (d >= best.d) return;
    const q = centre[Math.min(i + 1, centre.length - 1)];
    const r = centre[Math.max(i - 1, 0)];
    const cross = (q.x - r.x) * (t.z + 0.5 - p.z) - (q.z - r.z) * (t.x + 0.5 - p.x);
    best = { d, arc: p.arc, step: p.step, side: cross >= 0 ? 1 : -1 };
  });
  return best;
};
const band = rect(SX + 10, SZ + 1, 25, 24)
  .map((t) => ({ t, n: nearest(t) }))
  .filter(({ n }) => n.d > ROAD_HALF && n.d <= REACH[n.arc]);
const onWalkUps = ({ n }) => n.arc === 1 && n.side > 0 && n.step < STEPS * WALK_UP_SHARE;
const onShops = ({ n }) => n.arc === 1 && n.side > 0 && n.step >= STEPS * WALK_UP_SHARE;
const bendHomes = band.filter((c) => !onWalkUps(c) && !onShops(c)).map((c) => c.t);
const bendWalkUps = band.filter(onWalkUps).map((c) => c.t);
const bendShops = band.filter(onShops).map((c) => c.t);
// The grid street's south side and the works north of it: shops open only against the jobs of
// industry, and a strip or a walk-up needs more of them than the corner shop does.
const gridHomes = rect(SX + 2, SZ + 1, 13, 3);
const works = rect(SX + 12, SZ - 3, 13, 3);
const curveBox = box(SX + 8, SZ - 4, SX + 34, SZ + 26);
const curveBatches = [
  {
    label: 'grid street',
    commands: [{ kind: 'buildRoad', tier: TWO_LANE, tiles: row(SX + 2, SZ, 24) }],
  },
  {
    label: 'curve power',
    commands: [place('coal-plant', SX + 3, SZ - 4), tower(SX + 9, SZ - 1)],
  },
  ...arcs.map((arc, i) => ({
    label: `bend ${i + 1}`,
    commands: [{ kind: 'buildSegment', tier: TWO_LANE, ...arc }],
  })),
  { label: 'curve homes', commands: [zone(bendHomes), zone(gridHomes)] },
  { label: 'curve walk-ups', commands: [zone(bendWalkUps, RES_MEDIUM)] },
  { label: 'curve works', commands: [zone(works, INDUSTRIAL)] },
];

// --- farms: a farming district off a town street, on its own dirt road and pole line.
const FX = 40;
const FZ = 125;
const FARM_W = 44;
const DIRT_Z = FZ + 12;
const farmBox = box(FX + 1, DIRT_Z - 8, FX + FARM_W, DIRT_Z + 9);
const farmEast = box(FX + FARM_W / 2, DIRT_Z - 8, FX + FARM_W, DIRT_Z + 9);
const farmBatches = [
  {
    label: 'farm street',
    commands: [{ kind: 'buildRoad', tier: TWO_LANE, tiles: row(FX, FZ, FARM_W) }],
  },
  { label: 'farm power', commands: [place('coal-plant', FX + 2, FZ - 4), tower(FX + 8, FZ - 1)] },
  { label: 'farm town homes', commands: [zone(rect(FX + 12, FZ - 3, FARM_W - 12, 3))] },
  {
    label: 'farm lane',
    commands: [{ kind: 'buildRoad', tier: GRAVEL, tiles: column(FX, FZ + 1, 12) }],
  },
  {
    label: 'dirt road',
    commands: [{ kind: 'buildRoad', tier: GRAVEL, tiles: row(FX, DIRT_Z, FARM_W) }],
  },
  // A line starts at a source: a substation on the street takes the street's supply and the line
  // runs from it to the lane and down it.
  { label: 'substation', commands: [place('substation', FX + 3, FZ + 1, 2)] },
  {
    label: 'lane line',
    commands: [
      {
        kind: 'stringPowerLine',
        tiles: [{ x: FX + 2, z: FZ + 1 }, { x: FX + 1, z: FZ + 1 }, ...column(FX, FZ + 1, 11)],
        on: true,
      },
    ],
  },
  {
    label: 'dirt road line',
    commands: [{ kind: 'stringPowerLine', tiles: row(FX, DIRT_Z, FARM_W), on: true }],
  },
  {
    label: 'farmland',
    commands: [
      zone(rect(FX + 1, DIRT_Z - 8, FARM_W - 1, 8), AGRICULTURE),
      zone(rect(FX + 1, DIRT_Z + 1, FARM_W - 1, 8), AGRICULTURE),
    ],
  },
];

const homesIn = (b, min) => ({ ...b, prefix: 'res', state: ACTIVE, min });
const views = ['above', 'oblique'];
const solid = ['above', 'front', 'oblique'];

/** What the grown town gave each subject, read once it is loaded. */
const picked = {};
const inBox = (b, w) => b.x >= w.x0 && b.x <= w.x1 && b.z >= w.z0 && b.z <= w.z1;
const levelOf = (b) => Number(b.catalogId.split('-')[2]);
const isWalkUp = (b) =>
  b.catalogId.startsWith('res-multiplex') || /^res-medium-\d/.test(b.catalogId);
const isShop = (b) => b.catalogId.startsWith('com');
const isHome = (b) => b.catalogId.startsWith('res') && !isWalkUp(b);
const bendMid = centre[STEPS + STEPS / 2];
const nearestTo = (list, at, tile) =>
  list
    .map((b) => ({
      b,
      d: Math.hypot(b.frame.x / tile - 0.5 - at.x, b.frame.z / tile - 0.5 - at.z),
    }))
    .sort((p, q) => p.d - q.d)[0]?.b;
const need = (what, b) => {
  if (!b) throw new Error(`no ${what} grew where the series looks for it`);
  return b;
};

/** The framed home whose drive cut lies nearest a lamp pole, and the point between them. */
async function lampBeside(town, homes) {
  const poles = await town.read(() => window.__slimcity.readLampPoles());
  let closest = null;
  for (const b of homes) {
    const plan = await town.read((id) => window.__slimcity.readHousePlan(id), b.id);
    if (!plan) continue;
    const c = Math.cos(plan.frame.heading);
    const s = Math.sin(plan.frame.heading);
    for (const drive of plan.drives) {
      const u = (drive.cut.u0 + drive.cut.u1) / 2;
      const cut = {
        x: plan.frame.x + u * c - drive.cut.v0 * s,
        z: plan.frame.z + u * s + drive.cut.v0 * c,
      };
      for (const pole of poles) {
        const d = Math.hypot(pole.x - cut.x, pole.z - cut.z);
        if (!closest || d < closest.d) closest = { cut, pole, d };
      }
    }
  }
  return need('framed home with a lamp near its drive', closest);
}

export default defineSeries({
  name: 'lots',
  type: 'town',
  purpose:
    'Buildings sit on their lots to the street they front: yards run behind homes to the block middle, a cul-de-sac is ringed by homes with cars on its circle, parcels on a curved street follow its kerb (a home, a shop and its car park, a strip, a walk-up, the lamps), and a farming district grows its farms, lights a farmhouse at night and lets a farm lapse.',
  budgetS: 90,
  plan: {
    milestone: MILESTONE,
    phases: [
      {
        batches: [...yardBatches, ...culdesacBatches, ...curveBatches],
        maxTicks: 12000,
        step: 20,
        until: [
          homesIn(box(CX, CZ - 4, CX + 18, CZ + 5), 4),
          homesIn(curveBox, 10),
          { ...box(SX + 8, SZ - 4, SX + 34, SZ), prefix: 'ind', state: ACTIVE, min: 2 },
        ],
      },
      {
        // The shops are zoned once the works' jobs give the town room for more than corner shops.
        batches: [{ label: 'curve shops', commands: [zone(bendShops, COM_LOW)] }],
        maxTicks: 20000,
        step: 20,
        until: [
          { ...curveBox, prefix: 'com', state: ACTIVE, min: 2 },
          { ...curveBox, prefix: 'res-m', state: ACTIVE, min: 1 },
        ],
      },
      {
        batches: farmBatches,
        maxTicks: 12000,
        step: 20,
        until: [
          { ...farmBox, prefix: 'farm-crops', state: ACTIVE, min: 1 },
          { ...farmBox, prefix: 'farm-pasture', state: ACTIVE, min: 1 },
        ],
      },
      {
        // Take the dirt road away from the east half: the farms there lapse.
        batches: [
          {
            label: 'cut the dirt road',
            commands: [{ kind: 'bulldoze', tiles: row(FX + FARM_W / 2, DIRT_Z, FARM_W / 2) }],
          },
        ],
        maxTicks: 3000,
        step: 4,
        until: [{ ...farmEast, prefix: 'farm', state: ABANDONED, min: 1 }],
      },
    ],
  },
  ready: async (_session, town) => {
    const all = await town.buildings();
    const T = town.tile;
    const framed = all.filter((b) => b.frame && inBox(b, curveBox));
    const homes = framed.filter(isHome);
    const shops = framed.filter(isShop);
    const entryW = (b) => catalogEntry(b.catalogId).footprint.w;
    picked.home = need('framed home on the bend', nearestTo(homes, centre[STEPS], T));
    picked.shop = need(
      'framed one-lot shop on the bend',
      nearestTo(
        shops.filter((b) => entryW(b) === 1),
        bendMid,
        T,
      ),
    );
    picked.strip = need(
      'framed shop two or more lots wide (a strip)',
      nearestTo(
        shops.filter((b) => entryW(b) >= 2),
        bendMid,
        T,
      ),
    );
    picked.walkUp = need(
      'framed walk-up on the bend',
      nearestTo(framed.filter(isWalkUp), bendMid, T),
    );
    const lamp = await lampBeside(town, homes);
    picked.lamp = {
      x: (lamp.cut.x + lamp.pole.x) / 2 / T - 0.5,
      z: (lamp.cut.z + lamp.pole.z) / 2 / T - 0.5,
    };
    console.log(
      'framed on the bend',
      JSON.stringify(framed.map((b) => b.catalogId)),
      'lamp',
      lamp.d.toFixed(1),
      'm from a drive',
    );
    const farms = all.filter((b) => b.catalogId.startsWith('farm-'));
    const best = (kind) =>
      farms
        .filter((b) => b.state === ACTIVE && b.catalogId.startsWith(`farm-${kind}`))
        .sort((p, q) => levelOf(q) - levelOf(p))[0];
    picked.crops = need('working crop farm', best('crops'));
    picked.pasture = need('working pasture farm', best('pasture'));
    // South of the dirt road a farm's gate is on its north edge, and its house stands in from
    // the lot's north-west corner.
    picked.house = need(
      'working farm south of the dirt road',
      farms.find((b) => b.state === ACTIVE && b.z > DIRT_Z),
    );
    picked.lapsed = need(
      'farm that lapsed',
      farms.find((b) => b.state === ABANDONED),
    );
    console.log(
      'farms',
      JSON.stringify(farms.map((b) => `${b.catalogId}@${b.x},${b.z} s${b.state}`)),
    );
  },
  subjects: [
    {
      id: 'yards',
      box: () => districtBox(GX, GZ, GX + 8, GZ + 8, 8),
      views: ['above', 'full'],
      // The zoning lens a zone tool shows, over the same block.
      tool: 'zone.resLow',
      night: true,
    },
    {
      id: 'culdesac',
      box: () => districtBox(CX + 2, CZ - 4, CX1 + 7, CZ + 5, 8),
      views,
      night: false,
    },
    {
      id: 'culdesac-cars',
      box: () => districtBox(BLOCK.x - 2, BLOCK.z - 2, BLOCK.x + 3, BLOCK.z + 3, 6),
      views: ['above'],
      night: false,
      // Three cars on the circle's route, a quarter turn apart, nose along the way round.
      before: ({ page }) =>
        page.evaluate(
          ([cx, cz, kind]) => {
            const T = window.__slimcity.tileMeters();
            const c = { x: (cx + 1) * T, z: (cz + 1) * T };
            const R = 10.6;
            window.__slimcity.setVehicles(
              [0, 1, 2].map((i) => {
                const a = (i * Math.PI) / 2;
                return {
                  x: c.x + R * Math.cos(a),
                  z: c.z + R * Math.sin(a),
                  heading: a + Math.PI / 2,
                  kind,
                };
              }),
            );
          },
          [BLOCK.x, BLOCK.z, CAR],
        ),
    },
    {
      id: 'curve',
      box: () => districtBox(SX + 8, SZ - 2, SX + 32, SZ + 24, 8),
      views: [...views, 'full'],
      tool: 'zone.resLow',
      night: false,
    },
    {
      id: 'curve-home',
      box: ({ tile }) => framedBox(picked.home, catalogEntry(picked.home.catalogId), tile),
      views: solid,
      night: false,
    },
    {
      id: 'curve-shop',
      box: ({ tile }) => framedBox(picked.shop, catalogEntry(picked.shop.catalogId), tile),
      views: solid,
      night: false,
    },
    {
      id: 'curve-strip',
      box: ({ tile }) => framedBox(picked.strip, catalogEntry(picked.strip.catalogId), tile),
      views: solid,
      night: false,
    },
    {
      id: 'curve-walkup',
      box: ({ tile }) => framedBox(picked.walkUp, catalogEntry(picked.walkUp.catalogId), tile),
      views: solid,
      night: false,
    },
    {
      // A street lamp beside a framed drive, standing clear of its mouth.
      id: 'curve-lamp',
      box: () =>
        districtBox(
          picked.lamp.x - 0.5,
          picked.lamp.z - 0.5,
          picked.lamp.x + 0.5,
          picked.lamp.z + 0.5,
          6,
        ),
      views: ['above'],
      night: false,
    },
    {
      id: 'curve-runs',
      box: () => districtBox(SX + 12, SZ + 10, SX + 28, SZ + 24, 8),
      views: ['above', 'full'],
      // The commercial side's parcels outlined by the zoning lens.
      tool: 'zone.comLow',
      night: false,
    },
    {
      id: 'curve-grid',
      box: () => districtBox(SX + 2, SZ - 2, SX + 14, SZ + 4, 8),
      views: ['above', 'oblique'],
      night: false,
    },
    {
      id: 'farms',
      box: () => districtBox(FX, DIRT_Z - 9, FX + FARM_W, DIRT_Z + 10, 15),
      views: [...views, 'full'],
      // The zoning grid with the Agriculture tool in hand.
      tool: 'zone.agriculture',
      night: true,
    },
    {
      id: 'farm-crops',
      box: () => gridBox(picked.crops),
      views: solid,
      night: false,
    },
    {
      id: 'farm-pasture',
      box: () => gridBox(picked.pasture),
      views: solid,
      night: false,
    },
    {
      // The farmhouse and its truck after dark: its windows lit.
      id: 'farmhouse',
      box: () =>
        districtBox(picked.house.x, picked.house.z, picked.house.x + 2, picked.house.z + 2, 10),
      views: [],
      night: true,
    },
    {
      id: 'farm-lapsed',
      box: () => gridBox(picked.lapsed),
      views: solid,
      night: false,
    },
  ],
});
