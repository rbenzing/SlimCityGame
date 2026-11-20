import { defineSeries } from '../../lib/series.mjs';
import { settle } from '../../lib/session.mjs';
import { TIER } from '../../lib/roads.mjs';

const HOME = 'res-normal-1';
const BLOCKER = 'com-low-1';
const TURBINE = 'wind-turbine';
/** Rotations of a building that fronts south (north of its street), north, east and west. */
const FRONTS_SOUTH = 0;
const FRONTS_NORTH = 2;
const FRONTS_WEST = 3;

/** The street runs east along `ROW`, ending at tile `LAST`; the pad is `LENGTH` tiles long. */
const ROW = 3;
const LAST = 8;
const LENGTH = 14;
/** The box above and oblique frame: the end and its last three tiles, a tile of homes each side of a street's row `row`. */
const atEnd = (row, length = 5) => ({ x0: LAST - 3, z0: row - 2, length, width: 5 });

/** Homes line only the last few tiles of the street: the rest is out of every frame, and every home costs a frame's time. */
const HOMES_FROM = LAST - 4;
/** The view: the homed stretch of street, its end and a tile beyond. */
const END_VIEW = {
  x0: HOMES_FROM - 2,
  z0: 0,
  length: LAST + 3 - (HOMES_FROM - 2),
  width: 2 * ROW + 1,
};

/** Homes lining row `r` from `x0` to `x1` on both sides, every `step` tiles, but not on `skip`ped tiles of the north side. */
const lining = (p, r, x0, x1, { skip = [], step = 1 } = {}) => {
  const { d } = p.size(HOME);
  const out = [];
  for (let x = x0; x <= x1; x += step) {
    if (!skip.includes(x)) out.push(p.building(HOME, x, r - d, FRONTS_SOUTH));
    out.push(p.building(HOME, x, r + 1, FRONTS_NORTH));
  }
  return out;
};

/** A street that ends at `LAST`, homes both sides, of `tier`. */
const street = (id, tier) => ({
  id,
  pad: { w: LENGTH, h: 2 * ROW + 1 },
  view: END_VIEW,
  close: atEnd(ROW),
  lay: (p) => [p.road(tier, p.row(ROW, 0, LAST)), ...lining(p, ROW, HOMES_FROM, LAST)],
});

/** An avenue that ends at `LAST`, homes every second tile, with a shop on the tile it faces when `blocked`. */
const avenue = (id, blocked) => ({
  id,
  pad: { w: LENGTH, h: 2 * ROW + 3 },
  view: { ...END_VIEW, z0: 0, width: 2 * ROW + 3 },
  close: atEnd(ROW + 1),
  lay: (p) => [
    p.road(TIER.avenue, p.row(ROW + 1, 0, LAST)),
    ...(blocked ? [p.building(BLOCKER, LAST + 1, ROW + 1, FRONTS_WEST)] : []),
    ...lining(p, ROW + 1, HOMES_FROM, LAST, { step: 2 }),
  ],
});

/** A two-lane street with a cul-de-sac laid beyond its end by the game's tool, on the south half of the end tile or the north. */
const culdesac = (id, south) => ({
  id,
  pad: { w: LENGTH, h: 2 * ROW + 1 },
  view: { x0: HOMES_FROM - 2, z0: 0, length: 11, width: 2 * ROW + 1 },
  close: atEnd(ROW, 6),
  lay: (p) => [p.road(TIER.twoLane, p.row(ROW, 0, LAST)), ...lining(p, ROW, HOMES_FROM, LAST - 1)],
  after: async (p, { page, aim, clickTool }) => {
    await clickTool(page, aim, 'culdesac', p.at(LAST, ROW), [0.5, south ? 0.85 : 0.15]);
    // The block of four tiles beyond the end, on the side the tool was pointed at.
    const top = south ? ROW : ROW - 1;
    return [0, 1].flatMap((dx) => [0, 1].map((dz) => p.at(LAST + 1 + dx, top + dz)));
  },
});

export default defineSeries({
  name: 'ends',
  type: 'roads',
  purpose:
    'Every way a street ends reads as an ending: a plain end with homes beside it on each class, a one-tile stub, an end that meets a building, an off-grid curve and a cul-de-sac, each with its rounded cap, edge line and kerb clear of any drive.',
  budgetS: 60,
  gap: 4,
  subjects: [
    {
      // Shot at night, lit by a turbine on the north side of the last tile but one.
      id: 'blocked',
      pad: { w: LENGTH, h: 2 * ROW + 1 },
      view: END_VIEW,
      close: atEnd(ROW),
      lay: (p) => [
        p.road(TIER.twoLane, p.row(ROW, 0, LAST)),
        p.building(BLOCKER, LAST + 1, ROW, FRONTS_WEST),
        p.building(TURBINE, LAST - 1, ROW - 1, FRONTS_SOUTH),
        ...lining(p, ROW, HOMES_FROM, LAST, { skip: [LAST - 1] }),
      ],
    },
    street('two-lane-end', TIER.twoLane),
    street('four-lane-end', TIER.fourLane),
    {
      id: 'stub',
      pad: { w: 8, h: 8 },
      view: { x0: 1, z0: 1, length: 5, width: 5 },
      lay: (p) => [
        p.road(TIER.twoLane, [p.at(3, 3)]),
        p.building(HOME, 3, 3 - p.size(HOME).d, FRONTS_SOUTH),
        p.building(HOME, 3, 4, FRONTS_NORTH),
      ],
    },
    avenue('avenue-end', false),
    avenue('avenue-end-blocked', true),
    {
      id: 'free-curve-end',
      pad: { w: 24, h: 2 * ROW + 1 },
      view: { x0: 0, z0: 0, length: 23, width: 2 * ROW + 1 },
      lay: (p) => [
        p.road(TIER.twoLane, p.row(ROW, 0, 6)),
        // Leaves the grid street's last tile going east, bends south and ends going east.
        {
          kind: 'buildSegment',
          tier: TIER.twoLane,
          a: p.cm(6, ROW),
          control: p.cm(14, ROW + 3),
          b: p.cm(21, ROW + 3),
        },
      ],
      after: async (p) => {
        await settle(p.page, {
          until: () => window.__slimcity.freeRoadTriangles() > 0,
        });
        return [];
      },
    },
    culdesac('culdesac-south', true),
    culdesac('culdesac-north', false),
  ],
});
