import { defineSeries } from '../../lib/series.mjs';
import { districtBox, rect, row } from '../../lib/town.mjs';

const TWO_LANE = 1;
const RES_LOW = 1;
const ACTIVE = 1;
/** Vehicle kind Car (src/shared/types.ts VehicleKind). */
const CAR = 0;
/** The rung the town starts at: Busy Township. */
const MILESTONE = 2;

const place = (catalogId, x, z) => ({ kind: 'placeBuilding', catalogId, x, z, rotation: 0 });
const zone = (tiles) => ({ kind: 'paintZone', zone: RES_LOW, tiles });
/** Tiles once each, whatever the overlap of the rectangles they came from. */
const unique = (tiles) => [...new Map(tiles.map((t) => [`${t.x},${t.z}`, t])).values()];
const box = (x0, z0, x1, z1) => ({ x0, z0, x1, z1 });
const homesIn = (b, min) => ({ ...b, prefix: 'res', state: ACTIVE, min });

// Two streets run east from x = 40 and end at x = 48, the circles beyond: the offset one on the
// north street, the centred one on the south street, 14 tiles below it. Each has its own turbine
// and tower, and homes grow on both sides of each street and round each circle.
const X = 40;
const END_X = X + 8;
const NORTH_Z = 40;
const SOUTH_Z = NORTH_Z + 14;
/** The offset block's north-west tile: the street joins its north-west corner. */
const OFFSET = { x: END_X + 1, z: NORTH_Z };
/** The centred block's north-west tile: three rows tall, the street joining the middle one. */
const CENTRED = { x: END_X + 1, z: SOUTH_Z - 1 };
const offsetTiles = rect(OFFSET.x, OFFSET.z, 2, 2);
const centredTiles = rect(CENTRED.x, CENTRED.z, 2, 3);

/** The ground a street and its circle front: both sides of the street, and round the block. */
const zoneAround = (z, block) =>
  unique([
    ...rect(END_X - 4, z - 3, 8, 4),
    ...rect(END_X - 4, z + 1, 8, 4),
    ...rect(END_X + 3, z - 3, 4, 8),
  ]).filter((t) => !(t.z === z && t.x <= END_X) && !block.some((b) => b.x === t.x && b.z === t.z));

const batches = [
  {
    label: 'north street',
    commands: [{ kind: 'buildRoad', tier: TWO_LANE, tiles: row(X, NORTH_Z, 9) }],
  },
  {
    label: 'north power',
    commands: [place('wind-turbine', X, NORTH_Z - 1), place('water-tower', X + 1, NORTH_Z - 1)],
  },
  {
    // As the Cul-de-sac tool sends it beside the street: four tiles as street, then the circle.
    label: 'offset circle',
    commands: [
      {
        kind: 'buildRoad',
        tier: TWO_LANE,
        tiles: offsetTiles,
        elevations: offsetTiles.map(() => 0),
      },
      { kind: 'buildCulDeSac', x: OFFSET.x, z: OFFSET.z },
    ],
  },
  { label: 'north zone', commands: [zone(zoneAround(NORTH_Z, offsetTiles))] },
  {
    label: 'south street',
    commands: [{ kind: 'buildRoad', tier: TWO_LANE, tiles: row(X, SOUTH_Z, 9) }],
  },
  {
    label: 'south power',
    commands: [place('wind-turbine', X, SOUTH_Z - 1), place('water-tower', X + 1, SOUTH_Z - 1)],
  },
  {
    // As the Cul-de-sac tool sends it over the street's middle: six tiles as street, then the circle.
    label: 'centred circle',
    commands: [
      {
        kind: 'buildRoad',
        tier: TWO_LANE,
        tiles: centredTiles,
        elevations: centredTiles.map(() => 0),
      },
      { kind: 'buildCulDeSac', x: CENTRED.x, z: CENTRED.z, centred: 'z' },
    ],
  },
  { label: 'south zone', commands: [zone(zoneAround(SOUTH_Z, centredTiles))] },
];

const views = ['above', 'oblique'];

/** Three cars on a circle's route, a third of a turn apart, nose along the way round. */
const carsOn =
  (cx, cz) =>
  ({ page }) =>
    page.evaluate(
      ([x, z, kind]) => {
        const T = window.__slimcity.tileMeters();
        const R = 10.6;
        window.__slimcity.setVehicles(
          [0, 1, 2].map((i) => {
            const a = (i * 2 * Math.PI) / 3;
            return {
              x: x * T + R * Math.cos(a),
              z: z * T + R * Math.sin(a),
              heading: a + Math.PI / 2,
              kind,
            };
          }),
        );
      },
      [cx, cz, CAR],
    );

export default defineSeries({
  name: 'circles',
  type: 'town',
  purpose:
    'A street ends in a turning circle on either side of its centre line or on it: the offset circle and the centred circle, each with homes grown round it, shown from above and at an angle, side by side, and with cars driving the circle.',
  budgetS: 60,
  plan: {
    milestone: MILESTONE,
    phases: [
      {
        batches,
        maxTicks: 12000,
        step: 20,
        until: [
          homesIn(box(END_X - 4, NORTH_Z - 4, END_X + 7, NORTH_Z + 5), 6),
          homesIn(box(END_X - 4, SOUTH_Z - 4, END_X + 7, SOUTH_Z + 5), 6),
        ],
      },
    ],
  },
  subjects: [
    {
      id: 'offset',
      box: () => districtBox(END_X - 3, NORTH_Z - 4, END_X + 5, NORTH_Z + 5, 8),
      views,
      night: false,
    },
    {
      id: 'centred',
      box: () => districtBox(END_X - 3, SOUTH_Z - 4, END_X + 5, SOUTH_Z + 5, 8),
      views,
      night: false,
    },
    {
      id: 'side-by-side',
      box: () => districtBox(END_X - 6, NORTH_Z - 3, END_X + 7, SOUTH_Z + 4, 8),
      views: ['above', 'oblique'],
      night: false,
    },
    {
      id: 'centred-cars',
      box: () => districtBox(CENTRED.x - 3, CENTRED.z - 2, CENTRED.x + 4, CENTRED.z + 4, 6),
      views: ['above'],
      night: false,
      // The circle sits on the street's centre line, where the block's two columns meet.
      before: carsOn(CENTRED.x + 1, CENTRED.z + 1.5),
    },
  ],
});
