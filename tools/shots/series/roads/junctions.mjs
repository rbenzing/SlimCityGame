import { defineSeries } from '../../lib/series.mjs';
import { TIER } from '../../lib/roads.mjs';

/** The street's one-lane, one-way profile: a compact roundabout refuses the preset's two lanes. */
const ONE_LANE_ONE_WAY = 40;
const ONE_LANE_PROFILE = {
  class: 'oneWay',
  pieces: [
    { kind: 'sidewalk', width: 1.875 },
    { kind: 'travel', width: 3.05, flow: 'fwd' },
    { kind: 'sidewalk', width: 1.875 },
  ],
};

/** Pad tiles: the junction at the middle (5, 5), arms of five tiles each way. */
const C = 5;
const END = 10;

/** A through road along row C and a minor one down column C, crossing. */
const cross = (id, major, minor, extra = {}) => ({
  id,
  lay: (p) => [
    p.road(major, p.row(C, 0, END)),
    p.road(minor, p.col(C, 0, END), extra.replace ? { replace: true } : {}),
  ],
});
/** A through road along row C and a minor one that stops against it from the north. */
const tee = (id, major, minor) => ({
  id,
  lay: (p) => [p.road(major, p.row(C, 0, END)), p.road(minor, p.col(C, 0, C))],
});
/** A road that comes from the north and ends where a second leaves it to the west, in a smaller pad. */
const BEND = 3;
const corner = (id, major, minor) => ({
  id,
  pad: { w: 2 * BEND + 1, h: 2 * BEND + 1 },
  lay: (p) => [p.road(major, p.col(BEND, 0, BEND)), p.road(minor, p.row(BEND, 0, BEND))],
});
/** The block's missing corner laid as a street, as the Roundabout tool lays it, then the ring. */
const ring = (p) => [
  p.road(TIER.twoLane, [p.at(C + 1, C + 1)], { elevations: [0] }),
  p.roundabout(C, C),
];

export default defineSeries({
  name: 'junctions',
  type: 'roads',
  purpose:
    'Where roads cross, meet and turn, every pair of classes reads as one junction: kerbs and footways join round the corners, only the arms that give way carry a crossing and a bar, the ring of a roundabout is an island with yields, and a rail tile breaks the street instead of crossing it.',
  budgetS: 60,
  subjects: [
    {
      // Lit for the night frame: a turbine at the north arm's end powers the lamps, clear of
      // the line the low view looks down.
      id: 'roundabout-four-way',
      lay: (p) => [
        p.road(TIER.twoLane, p.row(C, 0, END)),
        p.road(TIER.twoLane, p.col(C, 0, END)),
        ...ring(p),
        p.building('wind-turbine', C, -1),
      ],
    },
    {
      id: 'roundabout-tee',
      lay: (p) => [
        p.road(TIER.twoLane, p.row(C, 0, END)),
        p.road(TIER.twoLane, p.col(C, C, END)),
        ...ring(p),
      ],
    },
    {
      id: 'roundabout-one-way-arm',
      lay: (p) => [
        p.road(TIER.twoLane, p.row(C, C, END)),
        p.road(TIER.twoLane, p.col(C, 0, END)),
        { kind: 'defineRoadProfile', id: ONE_LANE_ONE_WAY, profile: ONE_LANE_PROFILE },
        p.road(TIER.oneWay, p.row(C, 0, C - 1), { profile: ONE_LANE_ONE_WAY }),
        ...ring(p),
      ],
    },
    cross('twolane-x-twolane', TIER.twoLane, TIER.twoLane),
    tee('twolane-t-twolane', TIER.twoLane, TIER.twoLane),
    cross('twolane-x-avenue', TIER.avenue, TIER.twoLane),
    tee('twolane-t-avenue', TIER.avenue, TIER.twoLane),
    cross('twolane-x-fourlane', TIER.fourLane, TIER.twoLane),
    tee('alley-t-twolane', TIER.twoLane, TIER.alley),
    tee('alley-t-avenue', TIER.avenue, TIER.alley),
    tee('gravel-t-twolane', TIER.twoLane, TIER.gravel),
    corner('alley-corner-twolane', TIER.twoLane, TIER.alley),
    corner('twolane-corner-twolane', TIER.twoLane, TIER.twoLane),
    cross('oneway-x-twolane', TIER.twoLane, TIER.oneWay),
    cross('bus-x-twolane', TIER.twoLane, TIER.bus),
    cross('bike-x-twolane', TIER.twoLane, TIER.bike),
    cross('twolane-x-bike', TIER.bike, TIER.twoLane),
    cross('tram-x-twolane', TIER.twoLane, TIER.tram),
    cross('rail-breaks-twolane', TIER.twoLane, TIER.rail, { replace: true }),
  ],
  details: [
    {
      subject: 'twolane-x-twolane',
      name: 'corner',
      shows: "the north-west kerb return: where one street's footway meets the other's",
      local: [-10, -10],
      distance: 40,
      yaw: 0,
      pitch: 1.1,
      scale: 2,
    },
    {
      subject: 'twolane-t-avenue',
      name: 'corner',
      shows:
        "the north-west corner, where the avenue's kerb strip meets the street's wider footway",
      local: [-10, -10],
      distance: 40,
      yaw: 0,
      pitch: 1.1,
      scale: 2,
    },
  ],
});
