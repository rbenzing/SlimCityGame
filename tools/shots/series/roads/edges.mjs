import { defineSeries } from '../../lib/series.mjs';
import { corridorRuns, definedProfile, TIER } from '../../lib/roads.mjs';

const shoulderL = { kind: 'shoulder', width: 1.2 };
const shoulderR = { kind: 'shoulder', width: 3 };
const lane = (width = 3.75) => ({ kind: 'travel', width, flow: 'fwd' });
const wall = (height) => ({ kind: 'soundWall', width: 0.6, height });

/** A three-lane motorway walled both sides, 4.5 m. */
const WALL_M = 4.5;
const WALLED = {
  class: 'highway',
  kerbs: true,
  pieces: [wall(WALL_M), shoulderL, lane(), lane(), lane(), shoulderR, wall(WALL_M)],
};
/** Six lanes walled at the outer edges, 6 m: laid as the two halves of a corridor. */
const WALLED_SIX = {
  class: 'highway',
  kerbs: true,
  pieces: [wall(6), shoulderL, ...Array.from({ length: 6 }, () => lane(3.6)), shoulderR, wall(6)],
};
/** A slip road walled both sides, 3 m. */
const WALLED_RAMP = {
  class: 'ramp',
  kerbs: true,
  pieces: [wall(3), shoulderL, lane(4.2), { kind: 'shoulder', width: 2.4 }, wall(3)],
};

const LENGTH = 12;
/** Deck height of the bridge, tile by tile, metres: it climbs, levels and lands. */
const DECK = [0, 1, 2, 3, 4, 5, 5, 5, 5, 4, 3, 2, 1, 0];

export default defineSeries({
  name: 'edges',
  type: 'roads',
  purpose:
    'What stands beside a carriageway stands along all of it: a sound wall on both edges of a motorway with an unwalled twin beside it for comparison, the gap it opens at a slip road, the outer walls of a six-lane corridor and a wall carried along a bridge deck.',
  budgetS: 60,
  gap: 4,
  subjects: [
    {
      // A walled motorway and, two tiles north of it, the same motorway without walls.
      id: 'walled-motorway',
      pad: { w: LENGTH, h: 7 },
      view: { x0: 0, z0: 0, length: LENGTH, width: 7, line: 4, height: WALL_M },
      close: { x0: 2, z0: 1, length: 8, width: 5 },
      lay: (p) => {
        const { id, define } = definedProfile(WALLED);
        return [
          define,
          p.road(TIER.highway, p.row(4, 0, LENGTH - 1), { profile: id }),
          p.road(TIER.highway, p.row(1, 0, LENGTH - 1)),
        ];
      },
    },
    {
      // A walled slip road beside a walled motorway: the gap the wall opens at the slip road's mouth.
      id: 'ramp-gap',
      pad: { w: LENGTH, h: 6 },
      view: { x0: 0, z0: 0, length: LENGTH, width: 6, line: 2, height: 3 },
      close: { x0: 2, z0: 0, length: 8, width: 5 },
      lay: (p) => {
        const hw = definedProfile(WALLED);
        const ramp = definedProfile(WALLED_RAMP);
        return [
          hw.define,
          ramp.define,
          p.road(TIER.highway, p.row(2, 0, LENGTH - 1), { profile: hw.id }),
          p.road(TIER.ramp, p.row(3, 4, 8), { profile: ramp.id }),
        ];
      },
    },
    {
      id: 'six-lane',
      pad: { w: 5, h: LENGTH },
      view: { x0: 0, z0: 0, length: LENGTH, width: 5, axis: 'z', line: 2.5, height: 6 },
      close: { z0: 2, length: 8 },
      lay: async (p) => {
        const { id, define } = definedProfile(WALLED_SIX);
        return [define, ...(await corridorRuns(p, TIER.highway, p.col(2, 1, LENGTH - 2), id))];
      },
    },
    {
      id: 'walled-bridge',
      pad: { w: DECK.length + 2, h: 3 },
      view: { x0: 0, z0: 0, length: DECK.length + 2, width: 3, line: 1, height: 5 + WALL_M },
      close: { x0: 1, z0: 1, length: DECK.length, width: 1 },
      lay: (p) => {
        const { id, define } = definedProfile(WALLED);
        return [
          define,
          p.road(TIER.highway, p.row(1, 1, DECK.length), { profile: id, elevations: DECK }),
        ];
      },
    },
  ],
  details: [
    {
      subject: 'walled-motorway',
      name: 'far-side',
      shows: 'the wall from its far side: one face takes the sun and the other does not',
      local: [0, 20],
      distance: 70,
      yaw: 0.5 + Math.PI,
      pitch: 0.45,
      scale: 1,
    },
    {
      subject: 'walled-bridge',
      name: 'side',
      shows: 'the wall carried up onto the deck and down again, edge-on',
      local: [0, 0],
      distance: 170,
      yaw: 0,
      pitch: 0.2,
      scale: 1,
    },
    {
      subject: 'ramp-gap',
      name: 'gap',
      shows: 'the opening in the wall at the slip road: its ends and the slip road alongside',
      local: [-20, 10],
      distance: 60,
      yaw: -0.6,
      pitch: 0.55,
      scale: 1,
    },
  ],
});
