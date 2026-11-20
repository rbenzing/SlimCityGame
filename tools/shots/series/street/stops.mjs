import { defineSeries } from '../../lib/series.mjs';
import { TIER } from '../../lib/roads.mjs';

/** The street runs east along row `ROW` of a pad `LENGTH` tiles long. */
const ROW = 3;
const LENGTH = 9;
/** Tiles of a lone sign, and of a shelter with a sign across the street from it. */
const SIGN_AT = 2;
const BOTH_AT = 6;
/** A stop's side of its tile: the north kerb or the south (src/shared/types.ts BusStopState). */
const NORTH = 0;
const SOUTH = 1;
/** Local metres from the run's middle tile to a tile along it. */
const MID = (LENGTH - 1) / 2;
const along = (tile) => (tile - MID) * 20;

const stopOf = (p, x, side, kind) => ({
  kind: 'placeStop',
  stop: { ...p.at(x, ROW), side, kind },
});

/** A street of `tier` with a sign on one tile and, on another, a shelter on the south kerb and a sign on the north. */
const street = (id, tier) => ({
  id,
  pad: { w: LENGTH, h: 2 * ROW + 1 },
  view: { x0: 0, z0: 0, length: LENGTH, width: 2 * ROW + 1, height: 4 },
  close: { x0: BOTH_AT - 2, z0: ROW - 1, length: 5, width: 3 },
  lay: (p) => [
    p.road(tier, p.row(ROW, 0, LENGTH - 1)),
    stopOf(p, SIGN_AT, SOUTH, 'sign'),
    stopOf(p, BOTH_AT, SOUTH, 'shelter'),
    stopOf(p, BOTH_AT, NORTH, 'sign'),
  ],
});

/** The two stop tiles of a street, from the south (the high side's own kerb) and from the north. */
const details = (subject) => [
  {
    subject,
    name: 'both-south',
    shows:
      'the tile holding a shelter on the south kerb and a sign on the north: pad, pole at its leading end, and the lane that arrives there first',
    local: [along(BOTH_AT), 0],
    distance: 40,
    yaw: 0,
    pitch: 0.5,
    scale: 2,
  },
  {
    subject,
    name: 'sign-north',
    shows: 'the lone sign and its pole from the far kerb, the cheap stop beside the shelter',
    local: [along(SIGN_AT), 0],
    distance: 40,
    yaw: Math.PI,
    pitch: 0.5,
    scale: 2,
  },
];

export default defineSeries({
  name: 'stops',
  type: 'street',
  purpose:
    'A bus stop reads as roadside furniture on a kerbed street and on a gravel road: a lone sign on its pole, a shelter on its pad with a sign across from it, each at its kerb with the boarding area clear.',
  budgetS: 60,
  subjects: [street('stop-kerbed', TIER.twoLane), street('stop-gravel', TIER.gravel)],
  details: [...details('stop-kerbed'), ...details('stop-gravel')],
});
