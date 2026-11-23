import { defineSeries } from '../../lib/series.mjs';
import { composedRun, corridorRuns, definedProfile, TIER } from '../../lib/roads.mjs';

/** Vehicle kind of a car (src/shared/types.ts VehicleKind): 4 m long. */
const CAR = 0;
const HEADING_EAST = Math.PI / 2;

/** A straight run lies along row 1 of a pad three tiles across, from tile 1 to the tile before the pad's end. */
const LENGTH = 12;
const ROW = 1;
/** The box above and oblique frame: the road's middle four tiles, clear of both ends. */
const MIDDLE = { x0: 4, z0: ROW, length: 4, width: 1 };
const straight = (p) => p.row(ROW, 1, LENGTH - 2);

/** A run of `tier` as the preset draws it, or with the cross-section the game composes for `edits`. */
const run = (id, tier, edits = null, { height = 0 } = {}) => ({
  id,
  pad: { w: LENGTH, h: 3 },
  view: { x0: 0, z0: 0, length: LENGTH, width: 3, line: ROW, height },
  close: MIDDLE,
  lay: async (p) =>
    edits ? composedRun(p, tier, edits, straight(p)) : [p.road(tier, straight(p))],
});

/** A six-lane road laid as two halves of one tile each: three lanes a way, a median or none between. */
const SIX = { kind: 'travel', width: 3.6 };
const sixLanes = (median) => ({
  class: median ? 'divided' : 'arterial',
  pieces: [
    { kind: 'sidewalk', width: 1.9 },
    { ...SIX, flow: 'back' },
    { ...SIX, flow: 'back' },
    { ...SIX, flow: 'back' },
    ...(median ? [{ kind: 'median', width: 2.0 }] : []),
    { ...SIX, flow: 'fwd' },
    { ...SIX, flow: 'fwd' },
    { ...SIX, flow: 'fwd' },
    { kind: 'sidewalk', width: 1.9 },
  ],
});
const corridor = (id, median) => ({
  id,
  pad: { w: 5, h: LENGTH },
  view: { x0: 0, z0: 0, length: LENGTH, width: 5, axis: 'z', line: 2.5 },
  close: { z0: 3, length: 6 },
  lay: async (p) => {
    const { id: profile, define } = definedProfile(sixLanes(median));
    return [define, ...(await corridorRuns(p, TIER.avenue, p.col(2, 1, LENGTH - 2), profile))];
  },
});

/** Homes beside a street that carries a parking lane: the drive crosses the footway and meets the lane. */
const LOW = 'res-low-1';
const NORMAL = 'res-normal-t-2';
const FRONTS_SOUTH = 0;
const FRONTS_NORTH = 2;
const ROAD_ROW = 3;
/** Home positions: `[id, x, side]` along the street, on its north or south side. */
const HOMES = [
  [LOW, 1, 'south'],
  [NORMAL, 4, 'south'],
  [NORMAL, 1, 'north'],
  [LOW, 4, 'north'],
  [NORMAL, 7, 'south'],
  [NORMAL, 7, 'north'],
];
const homes = (p, list = HOMES) =>
  list.map(([id, x, side]) =>
    side === 'south'
      ? p.building(id, x, ROAD_ROW + 1, FRONTS_NORTH)
      : p.building(id, x, ROAD_ROW - p.size(id).d, FRONTS_SOUTH),
  );
const DRIVE_PAD = { w: 9, h: 7 };
const DRIVE_VIEW = { x0: 0, z0: 0, length: 9, width: 7, line: ROAD_ROW };
const DRIVE_CLOSE = { x0: 0, z0: 1, length: 8, width: 5 };
const driveRun = (p, tier, edits) => composedRun(p, tier, edits, p.row(ROAD_ROW, 0, 8));
const drive = (id, tier, edits, style) => ({
  id,
  pad: DRIVE_PAD,
  view: DRIVE_VIEW,
  close: DRIVE_CLOSE,
  lay: async (p) => [
    ...(await driveRun(p, tier, { ...edits, parking: 'both', parkingStyle: style })),
    ...homes(p),
  ],
});
const driveDetail = (subject) => ({
  subject,
  name: 'drive',
  shows:
    'the drive crossing the footway and meeting the parking lane, and any paving that strays onto the carriageway',
  local: [-2.3 * 20, 0.8 * 20],
  distance: 40,
  yaw: 0,
  pitch: 1.45,
  scale: 2,
});

/** The pad of the scale subject: a street with a bus shelter, a car beside it. */
const SCALE_ROW = 1;
const SHELTER_X = 6;

export default defineSeries({
  name: 'classes',
  type: 'roads',
  purpose:
    'Every road class is one straight road all along its run, and every option that changes what is drawn changes it everywhere at once: lanes, kerbs, footways, paint, parking lanes in their three styles, a median, a tram reservation, a two-tile corridor, drives meeting a parking lane, a person and a 4 m car at scale.',
  budgetS: 60,
  gap: 4,
  subjects: [
    {
      // Lit for the night frame: a turbine at the street's east end.
      ...run('two-lane', TIER.twoLane),
      lay: (p) => [p.road(TIER.twoLane, straight(p)), p.building('wind-turbine', LENGTH - 2, 2)],
    },
    run('avenue', TIER.avenue),
    run('four-lane', TIER.fourLane),
    run('highway', TIER.highway),
    run('gravel', TIER.gravel),
    run('alley', TIER.alley),
    run('one-way', TIER.oneWay),
    run('bus-lane', TIER.bus),
    run('bike-lane', TIER.bike),
    run('tram', TIER.tram),
    run('rail', TIER.rail),
    run('ramp', TIER.ramp),
    // Only the cross-sections that fit a tile: a two-lane street takes a parallel lane only, an
    // alley takes all three styles, an avenue and a four-lane carry no parking lane.
    run('two-lane-parking-parallel', TIER.twoLane, { parking: 'both', parkingStyle: 'parallel' }),
    run('one-way-parking-parallel', TIER.oneWay, { parking: 'both', parkingStyle: 'parallel' }),
    run('alley-parking-parallel', TIER.alley, { parking: 'both', parkingStyle: 'parallel' }),
    run('alley-parking-angled', TIER.alley, { parking: 'both', parkingStyle: 'angled' }),
    run('alley-parking-head-in', TIER.alley, { parking: 'both', parkingStyle: 'headIn' }),
    run('two-lane-no-footway', TIER.twoLane, { footways: false }),
    run('two-lane-turn-lane', TIER.twoLane, { middle: 'turn' }),
    run('avenue-median', TIER.avenue, { middle: 'median' }),
    corridor('corridor-divided', true),
    corridor('corridor-undivided', false),
    {
      id: 'scale',
      pad: { w: LENGTH, h: 3 },
      view: { x0: 0, z0: 0, length: LENGTH, width: 3, line: SCALE_ROW },
      close: { x0: SHELTER_X - 3, length: 6 },
      lay: (p) => [p.road(TIER.twoLane, straight(p))],
      // The shelter and the line that calls at it go on the finished street: people idle at a shelter.
      after: async (p) => {
        const stops = [p.at(SHELTER_X, SCALE_ROW), p.at(SHELTER_X + 2, SCALE_ROW)];
        await p.page.evaluate(
          ([commands]) => window.__slimcity.cmd('Shelter and line', commands),
          [
            [
              { kind: 'placeStop', stop: { ...stops[0], side: 1, kind: 'shelter' } },
              { kind: 'placeStop', stop: { ...stops[1], side: 1, kind: 'sign' } },
              { kind: 'createTransitLine', line: { id: 0, color: 0xef5350, stops } },
            ],
          ],
        );
        return [];
      },
    },
    drive('drive-two-lane-parallel', TIER.twoLane, {}, 'parallel'),
    drive('drive-one-way-parallel', TIER.oneWay, {}, 'parallel'),
    drive('drive-alley-angled', TIER.alley, {}, 'angled'),
    drive('drive-alley-head-in', TIER.alley, {}, 'headIn'),
    {
      // A signalled junction's turn bay beside the same homes.
      id: 'drive-turn-bay',
      pad: DRIVE_PAD,
      view: DRIVE_VIEW,
      close: DRIVE_CLOSE,
      lay: async (p) => [
        ...(await driveRun(p, TIER.twoLane, { parking: 'both', parkingStyle: 'parallel' })),
        p.road(TIER.twoLane, [...p.col(4, 0, ROAD_ROW - 1), ...p.col(4, ROAD_ROW + 1, 6)]),
        p.control(4, ROAD_ROW, 'signal'),
        ...homes(p, [
          [LOW, 0, 'south'],
          [NORMAL, 6, 'south'],
          [NORMAL, 0, 'north'],
          [LOW, 6, 'north'],
        ]),
      ],
    },
  ],
  // A car 4 m long on the street, and the people idling at the shelter beside it.
  scene: async ({ page }, { pieces, tile }) => {
    const s = pieces.find((x) => x.id === 'scale');
    const car = {
      x: (s.origin.x + SHELTER_X + 1.5) * tile,
      z: (s.origin.z + SCALE_ROW + 0.5 + 0.1) * tile,
      heading: HEADING_EAST,
      kind: CAR,
    };
    await page.evaluate((v) => window.__slimcity.setVehicles(v), [car]);
  },
  details: [
    {
      subject: 'scale',
      name: 'person-and-car',
      shows: 'a 1.75 m person at the shelter beside a 4 m car, the two scale anchors in one frame',
      local: [(SHELTER_X + 0.75 - (LENGTH - 1) / 2) * 20, 0],
      distance: 40,
      yaw: Math.PI / 2,
      pitch: 0.15,
      scale: 3,
    },
    driveDetail('drive-two-lane-parallel'),
    driveDetail('drive-one-way-parallel'),
    driveDetail('drive-alley-angled'),
    driveDetail('drive-alley-head-in'),
    {
      subject: 'drive-turn-bay',
      name: 'bay',
      shows: 'the drives either side of the junction against the turn bay as drawn',
      local: [0, 0],
      distance: 40,
      yaw: 0,
      pitch: 1.45,
      scale: 2,
    },
  ],
});
