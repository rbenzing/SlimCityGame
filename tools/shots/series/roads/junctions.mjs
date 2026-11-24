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

/** The box above and oblique frame: the junction's tile and two tiles of each arm, and the wider one a roundabout's ring needs. */
const AT_JUNCTION = { x0: C - 2, z0: C - 2, length: 5, width: 5 };
const AT_RING = { x0: C - 3, z0: C - 3, length: 7, width: 7 };
/** The centred ring's block is three tiles across, so the frame takes in its legs' first tile as well. */
const AT_CENTRED = { x0: C - 3, z0: C - 3, length: 7, width: 7 };

/** A through road along row C and a minor one down column C, crossing. */
const cross = (id, major, minor, extra = {}) => ({
  id,
  close: AT_JUNCTION,
  lay: (p) => [
    p.road(major, p.row(C, 0, END)),
    p.road(minor, p.col(C, 0, END), extra.replace ? { replace: true } : {}),
  ],
});
/** A through road along row C and a minor one that stops against it from the north. */
const tee = (id, major, minor) => ({
  id,
  close: AT_JUNCTION,
  lay: (p) => [p.road(major, p.row(C, 0, END)), p.road(minor, p.col(C, 0, C))],
});
/** A road that comes from the north and ends where a second leaves it to the west, in a smaller pad. */
const BEND = 3;
const corner = (id, major, minor) => ({
  id,
  pad: { w: 2 * BEND + 1, h: 2 * BEND + 1 },
  close: { x0: 0, z0: 0, length: BEND + 1, width: BEND + 1 },
  lay: (p) => [p.road(major, p.col(BEND, 0, BEND)), p.road(minor, p.row(BEND, 0, BEND))],
});
/** The block's missing corner laid as a street, as the Roundabout tool lays it, then the ring. */
const ring = (p) => [
  p.road(TIER.twoLane, [p.at(C + 1, C + 1)], { elevations: [0] }),
  p.roundabout(C, C),
];

/** The corners (and a tee's side with no road) as the Roundabout tool lays them over the junction's middle, then the ring. */
const centredRing = (p, tee = false, jx = C) => {
  const tiles = [
    p.at(jx - 1, C - 1),
    p.at(jx + 1, C - 1),
    p.at(jx - 1, C + 1),
    p.at(jx + 1, C + 1),
    ...(tee ? [p.at(jx, C + 1)] : []),
  ];
  return [
    p.road(TIER.twoLane, tiles, { elevations: tiles.map(() => 0) }),
    p.centredRoundabout(jx, C),
  ];
};

/** Rings the pieces have laid, in map tiles, so the last piece can put traffic round all of them. */
const rings = [];
const noteRing = (p, x = C, z = C, centred = false) => {
  const t = p.at(x, z);
  rings.push({ x: t.x, z: t.z, centred });
};

/** Cars round every ring noted, a third of a turn apart and nose along the way round, and one on each road coming in. */
const trafficRound = async (page) => {
  await page.evaluate(async (list) => {
    const rb = await import('/src/shared/roundabout.ts');
    const T = window.__slimcity.tileMeters();
    const cars = [];
    for (const ring of list) {
      // A compact ring is centred on the corner its block shares, a centred one on its middle tile.
      const cx = (ring.x + (ring.centred ? 0.5 : 1)) * T;
      const cz = (ring.z + (ring.centred ? 0.5 : 1)) * T;
      for (let i = 0; i < 3; i++) {
        const a = (i * 2 * Math.PI) / 3 + 0.4;
        cars.push({
          x: cx + rb.RING_ROUTE_RADIUS_M * Math.cos(a),
          z: cz + rb.RING_ROUTE_RADIUS_M * Math.sin(a),
          heading: a + Math.PI / 2,
          kind: 0,
        });
      }
    }
    window.__slimcity.setVehicles(cars);
  }, rings);
  return [];
};

export default defineSeries({
  name: 'junctions',
  type: 'roads',
  purpose:
    'Where roads cross, meet and turn, every pair of classes reads as one junction: kerbs and footways join round the corners, only the arms that give way carry a crossing and a bar, the ring of a roundabout is an island with yields, and a rail tile breaks the street instead of crossing it.',
  budgetS: 60,
  // Cars round the rings once every piece stands, so they are there for every frame.
  scene: ({ page }) => trafficRound(page),
  subjects: [
    {
      // Lit for the night frame: a turbine at the north arm's end powers the lamps, clear of
      // the line the low view looks down.
      id: 'roundabout-four-way',
      close: AT_RING,
      lay: (p) => [
        p.road(TIER.twoLane, p.row(C, 0, END)),
        p.road(TIER.twoLane, p.col(C, 0, END)),
        ...ring(p),
        p.building('wind-turbine', C, -1),
      ],
    },
    {
      id: 'roundabout-tee',
      close: AT_RING,
      lay: (p) => [
        p.road(TIER.twoLane, p.row(C, 0, END)),
        p.road(TIER.twoLane, p.col(C, C, END)),
        ...ring(p),
      ],
    },
    {
      id: 'roundabout-one-way-arm',
      close: AT_RING,
      lay: (p) => [
        p.road(TIER.twoLane, p.row(C, C, END)),
        p.road(TIER.twoLane, p.col(C, 0, END)),
        { kind: 'defineRoadProfile', id: ONE_LANE_ONE_WAY, profile: ONE_LANE_PROFILE },
        p.road(TIER.oneWay, p.row(C, 0, C - 1), { profile: ONE_LANE_ONE_WAY }),
        ...ring(p),
      ],
    },
    {
      id: 'centred-four-way',
      close: AT_CENTRED,
      lay: (p) => {
        noteRing(p, C, C, true);
        return [
          p.road(TIER.twoLane, p.row(C, 0, END)),
          p.road(TIER.twoLane, p.col(C, 0, END)),
          ...centredRing(p),
        ];
      },
    },
    {
      id: 'centred-tee',
      close: AT_CENTRED,
      lay: (p) => {
        noteRing(p, C, C, true);
        return [
          p.road(TIER.twoLane, p.row(C, 0, END)),
          p.road(TIER.twoLane, p.col(C, 0, C)),
          ...centredRing(p, true),
        ];
      },
    },
    {
      // Compact on the left, centred on the right, the same roads; cars round both rings, and round
      // the centred ring on the other pieces too.
      id: 'compact-and-centred',
      pad: { w: 2 * END + 2, h: 2 * C + 1 },
      close: { x0: 1, z0: C - 3, length: 2 * END, width: 7 },
      lay: (p) => {
        noteRing(p, C, C, false);
        noteRing(p, C + END, C, true);
        return [
          p.road(TIER.twoLane, p.row(C, 0, 2 * END + 1)),
          p.road(TIER.twoLane, p.col(C, 0, END)),
          p.road(TIER.twoLane, p.col(C + END, 0, END)),
          ...ring(p),
          ...centredRing(p, false, C + END),
        ];
      },
    },
    cross('twolane-x-twolane', TIER.twoLane, TIER.twoLane),
    tee('twolane-t-twolane', TIER.twoLane, TIER.twoLane),
    cross('twolane-x-avenue', TIER.avenue, TIER.twoLane),
    tee('twolane-t-avenue', TIER.avenue, TIER.twoLane),
    cross('twolane-x-fourlane', TIER.fourLane, TIER.twoLane),
    cross('fourlane-x-fourlane', TIER.fourLane, TIER.fourLane),
    tee('ramp-t-ramp', TIER.ramp, TIER.ramp),
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
      subject: 'centred-four-way',
      name: 'ring-above',
      shows:
        'the centred ring from straight above: island, apron, splitters, yield lines and crosswalks, every leg entering on its centre line',
      local: [0, 0],
      distance: 120,
      yaw: 0,
      pitch: 1.45,
      scale: 1,
    },
    {
      subject: 'centred-four-way',
      name: 'ring-oblique',
      shows:
        'the same ring at an angle: the kerb returns, the splitter noses and the footway all round',
      local: [0, 0],
      distance: 120,
      yaw: 0.6,
      pitch: 0.55,
      scale: 1,
    },
    {
      subject: 'centred-tee',
      name: 'ring-above',
      shows: 'the centred ring on a tee: the side with no road is open ring and footway',
      local: [0, 0],
      distance: 120,
      yaw: 0,
      pitch: 1.45,
      scale: 1,
    },
    {
      subject: 'centred-tee',
      name: 'ring-oblique',
      shows: 'the tee from the side with no road',
      local: [0, 0],
      distance: 120,
      yaw: 0.6,
      pitch: 0.55,
      scale: 1,
    },
    {
      subject: 'compact-and-centred',
      name: 'pair-above',
      shows:
        'the compact ring and the centred ring side by side on the same roads, with cars round both',
      local: [0, 0],
      distance: 330,
      yaw: 0,
      pitch: 1.45,
      scale: 1,
    },
    {
      subject: 'compact-and-centred',
      name: 'centred-traffic',
      shows: 'cars round the centred ring, nose along the way round',
      local: [100, 0],
      distance: 90,
      yaw: 0.4,
      pitch: 0.9,
      scale: 1,
    },
  ],
});
