import { defineSeries } from '../../lib/series.mjs';
import { TIER } from '../../lib/roads.mjs';

/** Road flow directions in a save (src/shared/types.ts RoadFlow): the way a one-way road runs. */
const FLOW_NORTH = 1;
const FLOW_SOUTH = 3;
/** Steepest grade a road may be built across, and along, in metres a tile (src/shared/constants.ts). */
const CROSS_GRADE = 9.5;
const CLIMB_GRADE = 1.9;
const HILL_GRADE = 3;

/** Tiles of dry bank a span's approach stands on each side of the water, as the finder leaves them. */
const BANK = 8;

/** Ramp pad: a motorway along row HWY, a street along row STREET, a slip road up and a slip road down. */
const HWY = 4;
const STREET = 14;
const ON = { x: 9, mergeX: 13 };
const OFF = { x: 5, leaveX: 2 };

/** Interchange pad: a motorway down two columns, the street crossing on row CROSS. */
const SOUTHBOUND = 6;
const CROSS = 13;
const REACH = 12;

const SIDE = { yaw: 0, pitch: 0.2 };
/** Far enough back that the water and a tile either side fill the frame, never nearer than the camera allows. */
const waterFills = (run, tile) => Math.max(60, (run.length - 2 * BANK + 2) * tile * 0.9);
const sideDetail = (subject) => ({
  subject,
  name: 'side',
  shows: 'the span edge-on: the deck profile and what holds it up, which no view from above gives',
  local: [0, 0],
  distance: waterFills,
  ...SIDE,
  scale: 1,
});

/** A road laid across the water on its own row, bank to bank. */
const span = (id, tier, extra = {}, view = {}) => ({
  id,
  river: true,
  view,
  lay: (p) => [p.road(tier, p.row(0, 0, p.w - 1), extra)],
});

/** A run along row 2 of a hillside that climbs `grade` metres a tile toward the north. */
const across = (id, tier, grade = CROSS_GRADE, extra = {}, height = 0) => ({
  id,
  pad: { w: 12, h: 5 },
  ground: { grade: -grade, axis: 'z' },
  view: { x0: 0, z0: 0, length: 12, width: 5, line: 2, height },
  lay: (p) => [p.road(tier, p.row(2, 1, 10), extra)],
});

/** A run down column 2 of a hillside that climbs `grade` metres a tile toward the south. */
const along = (id, tier) => ({
  id,
  pad: { w: 5, h: 12 },
  ground: { grade: CLIMB_GRADE, axis: 'z' },
  view: { x0: 2, z0: 0, length: 12, width: 1, axis: 'z' },
  lay: (p) => [p.road(tier, p.col(2, 1, 10))],
});

export default defineSeries({
  name: 'grade',
  type: 'roads',
  purpose:
    'Where a road changes level it stays one road: a span of every structural family stands on its banks, a viaduct climbs and lands, slip roads join a motorway at one end and a street at the other, an interchange carries the street over the motorway, and on a slope no ground stands proud of a kerb or a deck.',
  budgetS: 60,
  subjects: [
    {
      // Shot at night, lit by a turbine beyond the street's east end.
      id: 'ramps',
      pad: { w: 19, h: STREET + 1 },
      view: { x0: 0, z0: 0, length: 19, width: STREET + 1, line: HWY },
      lay: (p) => {
        const col = (x, a, b) => p.col(x, a, b);
        const row = (z, a, b) => p.row(z, a, b);
        const onRamp = [
          ...col(ON.x, HWY + 1, STREET - 1).reverse(),
          ...row(HWY + 1, ON.x + 1, ON.mergeX),
        ];
        const offRamp = [...row(HWY + 1, OFF.leaveX, OFF.x), ...col(OFF.x, HWY + 2, STREET - 1)];
        return [
          p.road(TIER.highway, row(HWY, 0, 18)),
          p.road(TIER.twoLane, row(STREET, 0, 18)),
          p.road(TIER.ramp, onRamp),
          p.road(TIER.ramp, offRamp),
          p.building('wind-turbine', 18, STREET + 1),
        ];
      },
    },
    {
      id: 'diamond',
      pad: { w: 14, h: 2 * (REACH + 2) + 1 },
      view: { x0: 0, z0: 0, length: 14, width: 2 * (REACH + 2) + 1, line: CROSS },
      lay: (p) => {
        const south = p.col(SOUTHBOUND, CROSS - REACH, CROSS + REACH);
        const north = p.col(SOUTHBOUND + 1, CROSS + REACH, CROSS - REACH);
        return [
          p.road(TIER.highway, south, { flows: south.map(() => FLOW_SOUTH) }),
          p.road(TIER.highway, north, { flows: north.map(() => FLOW_NORTH) }),
        ];
      },
      // The game's own tool lays the street, the bridge and the four slip roads.
      after: async (p, { page, aim, clickTool }) => {
        await clickTool(page, aim, 'interchange', p.at(SOUTHBOUND, CROSS));
        return [p.at(SOUTHBOUND - 4, CROSS), p.at(SOUTHBOUND + 5, CROSS)];
      },
    },
    span('highway-box', TIER.highway),
    span('street-beam', TIER.twoLane),
    span('rail-truss', TIER.rail),
    span('track-plank', TIER.gravel),
    span('viaduct', TIER.avenue, { elevation: 12 }, { height: 12 }),
    across('slope-cross-twolane', TIER.twoLane),
    across('slope-cross-avenue', TIER.avenue),
    across('slope-cross-highway', TIER.highway),
    across('slope-cross-gravel', TIER.gravel),
    along('slope-fall-twolane', TIER.twoLane),
    along('slope-fall-highway', TIER.highway),
    across('slope-raised-avenue', TIER.avenue, HILL_GRADE, { elevation: 6 }, 6),
    {
      id: 'slope-crossroads',
      pad: { w: 11, h: 11 },
      ground: { grade: -CLIMB_GRADE, axis: 'z' },
      lay: (p) => [p.road(TIER.avenue, p.row(5, 0, 10)), p.road(TIER.twoLane, p.col(5, 0, 10))],
    },
  ],
  details: [
    {
      subject: 'ramps',
      name: 'merge',
      shows: 'where the on-ramp ends beside the motorway and merges into it',
      local: [(ON.mergeX - 9) * 20, (HWY + 1 - 7) * 20],
      distance: 60,
      yaw: 0,
      pitch: 1.45,
      scale: 1,
    },
    {
      subject: 'ramps',
      name: 'terminal',
      shows: 'where the on-ramp meets the street: the terminal the interchange is controlled at',
      local: [(ON.x - 9) * 20, (STREET - 1 - 7) * 20],
      distance: 90,
      yaw: 0.6,
      pitch: 0.95,
      scale: 1,
    },
    {
      subject: 'diamond',
      name: 'deck-join',
      shows: 'where the street meets the bridge deck at the west abutment',
      local: [-40, 0],
      distance: 40,
      yaw: 0,
      pitch: 0.6,
      scale: 1,
    },
    {
      subject: 'diamond',
      name: 'bridge-side',
      shows: 'the bridge edge-on: the street clearing the motorway beneath it',
      local: [0, 0],
      distance: 110,
      ...SIDE,
      scale: 1,
    },
    sideDetail('highway-box'),
    sideDetail('street-beam'),
    sideDetail('rail-truss'),
    sideDetail('track-plank'),
    sideDetail('viaduct'),
    {
      subject: 'viaduct',
      name: 'climb',
      shows: 'where the deck climbs off the ground at the first bank and levels over the water',
      local: (run, tile) => [-(run.length / 2 - BANK / 2) * tile, 0],
      distance: 70,
      ...SIDE,
      scale: 1,
    },
  ],
});
