import { defineSeries } from '../../lib/series.mjs';
import { column, districtBox, rect, row } from '../../lib/town.mjs';

const TWO_LANE = 1;
const RES_LOW = 1;
const ACTIVE = 1;
/** Centimetres in a tile: the free street's segment ends are world centimetres. */
const TILE_CM = 2000;
/** Vehicle kind Car (src/shared/types.ts VehicleKind). */
const CAR = 0;

const wind = (x, z) => ({ kind: 'placeBuilding', catalogId: 'wind-turbine', x, z, rotation: 0 });
const tower = (x, z) => ({ kind: 'placeBuilding', catalogId: 'water-tower', x, z, rotation: 0 });
const zone = (tiles) => ({ kind: 'paintZone', zone: RES_LOW, tiles });
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

// --- parcels on a curved street: an S-bend off a grid street, zoned both sides.
const SX = 100;
const SZ = 90;
const cm = (tx, tz) => ({ x: (tx + 0.5) * TILE_CM, z: (tz + 0.5) * TILE_CM });
const arcs = [
  { a: cm(SX + 25, SZ), control: cm(SX + 29, SZ + 8), b: cm(SX + 19, SZ + 12.5) },
  { a: cm(SX + 19, SZ + 12.5), control: cm(SX + 19, SZ + 16.5), b: cm(SX + 17.4, SZ + 20.2) },
];
/** Tiles the zone band reaches from the bend's centre line, and half the road's width in tiles. */
const REACH = 3.5;
const ROAD_HALF = 0.28;
const centre = arcs.flatMap((arc) =>
  Array.from({ length: 61 }, (_, i) => {
    const t = i / 60;
    const u = 1 - t;
    const at = (k) => (u * u * arc.a[k] + 2 * u * t * arc.control[k] + t * t * arc.b[k]) / TILE_CM;
    return { x: at('x'), z: at('z') };
  }),
);
const curveZone = rect(SX + 10, SZ + 1, 24, 24).filter((t) => {
  const d = Math.min(...centre.map((p) => Math.hypot(t.x + 0.5 - p.x, t.z + 0.5 - p.z)));
  return d > ROAD_HALF && d <= REACH;
});
const curveBatches = [
  {
    label: 'grid street',
    commands: [{ kind: 'buildRoad', tier: TWO_LANE, tiles: row(SX + 2, SZ, 24) }],
  },
  { label: 'curve power', commands: [wind(SX + 2, SZ - 1), tower(SX + 3, SZ - 1)] },
  ...arcs.map((arc, i) => ({
    label: `bend ${i + 1}`,
    commands: [{ kind: 'buildSegment', tier: TWO_LANE, ...arc }],
  })),
  { label: 'curve zone', commands: [zone(curveZone)] },
];

const homesIn = (b, min) => ({ ...b, prefix: 'res', state: ACTIVE, min });
const views = ['above', 'oblique'];

export default defineSeries({
  name: 'lots',
  type: 'town',
  purpose:
    'Homes sit on their lots to the street they front: yards run behind them to the block middle, a cul-de-sac is ringed by homes with cars on its circle, and parcels on a curved street follow its kerb.',
  budgetS: 120,
  plan: {
    phases: [
      {
        batches: [...yardBatches, ...culdesacBatches, ...curveBatches],
        maxTicks: 6000,
        step: 20,
        until: [
          homesIn(box(CX, CZ - 4, CX + 18, CZ + 5), 4),
          homesIn(box(SX + 8, SZ - 4, SX + 34, SZ + 26), 10),
        ],
      },
    ],
  },
  subjects: [
    {
      id: 'yards-block',
      box: () => districtBox(GX, GZ, GX + 8, GZ + 8, 8),
      views: ['above'],
      night: true,
    },
    {
      id: 'yards-lens',
      box: () => districtBox(GX, GZ, GX + 8, GZ + 8, 8),
      views: ['full'],
      night: false,
      before: ({ page }) => page.evaluate(() => window.__slimcity.setTool('zone.resLow')),
      after: ({ page }) => page.evaluate(() => window.__slimcity.setTool('select')),
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
      views,
      night: false,
    },
    {
      id: 'curve-lens',
      box: () => districtBox(SX + 8, SZ - 2, SX + 32, SZ + 24, 8),
      views: ['full'],
      night: false,
      before: ({ page }) => page.evaluate(() => window.__slimcity.setTool('zone.resLow')),
      after: ({ page }) => page.evaluate(() => window.__slimcity.setTool('select')),
    },
  ],
});
