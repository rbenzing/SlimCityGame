import { defineSeries } from '../../lib/series.mjs';
import { TIER } from '../../lib/roads.mjs';
import {
  BUS_DEPOT,
  FRONTS_EAST,
  FRONTS_NORTH,
  FRONTS_SOUTH,
  RAIL_STATION,
  RAIL_YARD,
  TRAM_DEPOT,
  WALK,
  fieldVehicles,
  supply,
  transitLine,
} from '../../lib/street.mjs';

/** Custom road profiles (ids from src/shared/roadprofile.ts FIRST_CUSTOM_PROFILE_ID): a tram reservation and mixed running. */
const RESERVED = 13;
const MIXED = 14;
const TRAM_PIECE_M = 1.2;
const LANE_M = 3.3;
const reserved = {
  kind: 'defineRoadProfile',
  id: RESERVED,
  profile: {
    class: 'arterial',
    kerbs: true,
    pieces: [
      WALK,
      { kind: 'travel', width: LANE_M, flow: 'back' },
      { kind: 'travel', width: LANE_M, flow: 'back' },
      { kind: 'tram', width: TRAM_PIECE_M, flow: 'back' },
      { kind: 'tram', width: TRAM_PIECE_M, flow: 'fwd' },
      { kind: 'travel', width: LANE_M, flow: 'fwd' },
      { kind: 'travel', width: LANE_M, flow: 'fwd' },
      WALK,
    ],
  },
};
const mixed = {
  kind: 'defineRoadProfile',
  id: MIXED,
  profile: {
    class: 'local',
    kerbs: true,
    pieces: [
      WALK,
      { kind: 'travel', width: 3.75, flow: 'back', tram: true },
      { kind: 'travel', width: 3.75, flow: 'fwd', tram: true },
      WALK,
    ],
  },
};

/** The lines the series runs, so the last piece knows how many to wait for. */
const LINES = 6;
/** Local metres from a run of `length` tiles' middle tile to tile `x`. */
const at = (length, x) => (x - (length - 1) / 2) * 20;

/** A street along row 3 of a pad 16 long, supplied from its far north kerb, with a depot south of it. */
const LENGTH = 16;
const ROW = 3;
const served = (id, tier, depot, rotation, mode, stops, extra = {}, profile = null) => ({
  id,
  pad: { w: LENGTH, h: 8 },
  view: { x0: 0, z0: 0, length: LENGTH, width: 8, height: 8 },
  close: { x0: 3, z0: 1, length: 11, width: 5, height: 8 },
  ...extra,
  lay: (p) => [
    ...(profile ? [profile] : []),
    p.road(tier, p.row(ROW, 0, LENGTH - 1), profile ? { profile: profile.id } : {}),
    supply(p, LENGTH - 3, ROW),
    p.building(depot, 2, ROW + 1, rotation),
    ...stops(p),
    transitLine(extra.line ?? 0, mode, [p.at(6, ROW), p.at(11, ROW)]),
  ],
});

/** A bus stop's shelter on the north kerb of tile `x` of row `ROW`. */
const shelter = (p, x) => ({
  kind: 'placeStop',
  stop: { ...p.at(x, ROW), side: 0, kind: 'shelter' },
});

/** Rail pad: a railway on row 1, stations and a yard between it and the street on row 5. */
const RAIL_LENGTH = 24;
const RAIL_ROW = 1;
const RAIL_STREET = 5;

/** A stroke of track on row `z` from `a` to `b`, as the player draws one. */
const track = (p, z, a, b) => p.road(TIER.rail, p.row(z, a, b));

export default defineSeries({
  name: 'transit',
  type: 'street',
  purpose:
    'Transit reads as service on the street: a bus line with its shelters and buses, the street tramway, a tram reservation as a raised guideway with its station and a cross street passing under it, the ramp from street to guideway, a railway with its stations and a train, and parallel track that does not join.',
  budgetS: 60,
  subjects: [
    // Shot at night: the bus line after dark.
    served('bus-line', TIER.twoLane, BUS_DEPOT, FRONTS_NORTH, 'bus', (p) => [
      shelter(p, 6),
      shelter(p, 11),
    ]),
    served('tram-street', TIER.tram, TRAM_DEPOT, FRONTS_EAST, 'tram', () => [], { line: 1 }),
    {
      // A reservation of two tracks down the middle of an arterial, a cross street passing under it,
      // and a station over the mid-run stop.
      id: 'tram-guideway',
      pad: { w: 30, h: 11 },
      view: { x0: 0, z0: 0, length: 30, width: 11, height: 12 },
      close: { x0: 8, z0: 3, length: 13, width: 5, height: 12 },
      lay: (p) => [
        reserved,
        p.road(TIER.avenue, p.row(5, 0, 29), { profile: RESERVED }),
        p.road(TIER.twoLane, p.col(17, 0, 10)),
        supply(p, 1, 5),
        p.building(TRAM_DEPOT, 24, 2, FRONTS_SOUTH),
        transitLine(2, 'tram', [p.at(4, 5), p.at(11, 5), p.at(18, 5)]),
      ],
    },
    {
      // A street tramway running on into a reservation: the guideway climbs from the street.
      id: 'tram-ramp',
      pad: { w: 30, h: 9 },
      view: { x0: 0, z0: 0, length: 30, width: 9, height: 12 },
      close: { x0: 8, z0: 2, length: 11, width: 5, height: 12 },
      lay: (p) => [
        reserved,
        mixed,
        p.road(TIER.twoLane, p.row(5, 0, 12), { profile: MIXED }),
        p.road(TIER.avenue, p.row(5, 13, 29), { profile: RESERVED }),
        supply(p, 1, 5),
        p.building(TRAM_DEPOT, 6, 2, FRONTS_SOUTH),
        transitLine(3, 'tram', [p.at(4, 5), p.at(22, 5)]),
      ],
    },
    {
      id: 'rail-line',
      pad: { w: RAIL_LENGTH, h: 8 },
      view: { x0: 0, z0: 0, length: RAIL_LENGTH, width: 8, height: 10 },
      close: { x0: 2, z0: 0, length: 14, width: 7, height: 10 },
      lay: (p) => [
        track(p, RAIL_ROW, 0, RAIL_LENGTH - 1),
        p.road(TIER.twoLane, p.row(RAIL_STREET, 0, RAIL_LENGTH - 1)),
        supply(p, 20, RAIL_STREET),
        p.building(RAIL_STATION, 4, 2, FRONTS_SOUTH),
        p.building(RAIL_STATION, 14, 2, FRONTS_SOUTH),
        p.building(RAIL_YARD, 8, 2, FRONTS_EAST),
        transitLine(4, 'rail', [p.at(4, RAIL_ROW), p.at(14, RAIL_ROW)]),
      ],
    },
    {
      // Two parallel tracks, a stroke drawn head-on into the side of one, and a second pair linked by
      // a one-tile stroke: track joins track only where the player crosses it.
      id: 'rail-joins',
      pad: { w: 22, h: 7 },
      view: { x0: 0, z0: 0, length: 22, width: 7, height: 4 },
      close: { x0: 0, z0: 0, length: 22, width: 7, height: 4 },
      lay: (p) => [
        track(p, 0, 0, 7),
        track(p, 1, 0, 7),
        p.road(
          TIER.rail,
          [5, 4, 3, 2].map((z) => p.at(3, z)),
        ),
        track(p, 1, 12, 19),
        track(p, 3, 12, 19),
        p.road(TIER.rail, [p.at(15, 2)]),
      ],
    },
    {
      // Two streets joined at a corner, a stop on each: the buses follow the corner, not the chord.
      id: 'bus-corner',
      pad: { w: 12, h: 13 },
      view: { x0: 0, z0: 0, length: 12, width: 13, height: 6 },
      close: { x0: 3, z0: 1, length: 8, width: 11, height: 6 },
      lay: (p) => [
        p.road(TIER.twoLane, p.row(3, 0, 9)),
        p.road(TIER.twoLane, p.col(9, 4, 12)),
        supply(p, 6, 3),
        p.building(BUS_DEPOT, 1, 4, FRONTS_NORTH),
        { kind: 'placeStop', stop: { ...p.at(5, 3), side: 0, kind: 'shelter' } },
        { kind: 'placeStop', stop: { ...p.at(9, 10), side: 0, kind: 'shelter' } },
        transitLine(5, 'bus', [p.at(5, 3), p.at(9, 10)]),
      ],
      // The last piece: let the depots field every line's vehicles, then hold the city still.
      after: async (p, { page }) => {
        await fieldVehicles({ page }, LINES);
        return [];
      },
    },
  ],
  details: [
    {
      subject: 'bus-line',
      name: 'shelter',
      shows: "a line's shelter and its pole on the kerb at pedestrian scale",
      local: [at(LENGTH, 6), 0],
      distance: 40,
      yaw: 0,
      pitch: 0.5,
      scale: 2,
    },
    {
      subject: 'tram-street',
      name: 'rails',
      shows:
        'the slab, rails and grooves of a street tramway at twice the pixels, a tram on the line',
      local: [0, 0],
      distance: 40,
      yaw: Math.PI - 0.5,
      pitch: 0.55,
      scale: 2,
    },
    {
      subject: 'tram-guideway',
      name: 'station',
      shows: 'the raised station over the reservation: platforms, stair and lift, from the street',
      local: [at(30, 11), 0],
      distance: 40,
      yaw: Math.PI - 0.5,
      pitch: 0.4,
      scale: 2,
    },
    {
      subject: 'tram-guideway',
      name: 'junction',
      shows: 'the cross street passing under the guideway at its junction, from low down beside it',
      local: [at(30, 17), 0],
      distance: 40,
      yaw: Math.PI - 0.9,
      pitch: 0.25,
      scale: 1,
    },
    {
      subject: 'tram-ramp',
      name: 'ramp',
      shows: 'the guideway climbing from the street tramway, columns and deck edge-on',
      local: [at(30, 17), 0],
      distance: 90,
      yaw: Math.PI - 0.9,
      pitch: 0.25,
      scale: 1,
    },
    {
      subject: 'rail-line',
      name: 'station',
      shows:
        'a station with its platform on the track, from the track side, a train at the platform',
      local: [at(RAIL_LENGTH, 4), -20],
      distance: 50,
      yaw: Math.PI,
      pitch: 0.5,
      scale: 2,
    },
  ],
});
