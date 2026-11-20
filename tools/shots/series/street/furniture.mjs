import { defineSeries } from '../../lib/series.mjs';
import { TIER } from '../../lib/roads.mjs';
import { LANES, WALK, defineProfile, supply } from '../../lib/street.mjs';

/** Custom profile ids (src/shared/roadprofile.ts FIRST_CUSTOM_PROFILE_ID upward). */
const PARKED = 13;
const KERB_ONLY = 14;
const NO_KERB = 15;
const PARKING = { kind: 'parking', width: 2.25 };

/** The street runs east along row `ROW` of a pad `LENGTH` tiles long and `2 * ROW + 1` across. */
const ROW = 4;
const LENGTH = 14;
/** The tallest thing standing on a street here: a lamp or a signal mast, in metres. */
const TALL = 13;
/** The closest box that holds a lamp pair, a cover and a cabinet: five tiles of the street's middle and a tile each side. */
const middle = { x0: 5, z0: ROW - 1, length: 5, width: 3 };

/** A run of street laid with `tier` (and a custom `profile` id), a generator on its kerb at the far end as the supply. */
const run = (id, tier, profile, defs = []) => ({
  id,
  pad: { w: LENGTH, h: 2 * ROW + 1 },
  view: { x0: 0, z0: 0, length: LENGTH, width: 2 * ROW + 1, height: TALL },
  close: middle,
  lay: (p) => [
    ...defs,
    p.road(tier, p.row(ROW, 0, LENGTH - 1), profile ? { profile } : {}),
    supply(p, LENGTH - 3, ROW),
  ],
});

/** A crossing of `across` by a street down column `X`, controlled by `control`, on a 13 by 13 pad. */
const CROSS = 6;
const crossing = (id, tier, control) => ({
  id,
  pad: { w: 13, h: 13 },
  view: { x0: 0, z0: 0, length: 13, width: 13, height: TALL },
  close: { x0: CROSS - 2, z0: CROSS - 2, length: 5, width: 5 },
  lay: (p) => [
    p.road(tier, p.row(CROSS, 0, 12)),
    p.road(TIER.twoLane, p.col(CROSS, 0, 12)),
    supply(p, 10, CROSS),
    p.control(CROSS, CROSS, control),
  ],
});

export default defineSeries({
  name: 'furniture',
  type: 'street',
  purpose:
    'What stands beside a street stands where a street designer puts it: lamps, signs, signals, meters, covers and cabinets in the strip behind the kerb, off the walk, off drives and crosswalks, on every kind of street with or without a footway.',
  budgetS: 60,
  subjects: [
    crossing('crossroads-signal', TIER.avenue, 'signal'),
    crossing('crossroads-stop', TIER.twoLane, 'allWayStop'),
    run('street-footway', TIER.twoLane),
    run('street-parked', TIER.twoLane, PARKED, [
      defineProfile(PARKED, [WALK, PARKING, ...LANES, PARKING, WALK]),
    ]),
    run('street-kerb-only', TIER.twoLane, KERB_ONLY, [
      defineProfile(KERB_ONLY, LANES, { kerbs: true }),
    ]),
    run('street-no-kerb', TIER.twoLane, NO_KERB, [defineProfile(NO_KERB, LANES, { kerbs: false })]),
    run('avenue', TIER.avenue),
  ],
  details: [
    {
      subject: 'crossroads-signal',
      name: 'mast',
      shows:
        'a signal mast at the far right corner, its arm over the lanes, the stop line and the crosswalk at pedestrian scale',
      local: [6, 5],
      distance: 40,
      yaw: Math.PI / 4,
      pitch: 0.45,
      scale: 2,
    },
    {
      subject: 'crossroads-stop',
      name: 'board',
      shows: 'the stop signs at the stop lines of an all-way stop, which way each board faces',
      local: [6, 5],
      distance: 40,
      yaw: Math.PI / 4,
      pitch: 0.45,
      scale: 2,
    },
    {
      subject: 'street-parked',
      name: 'meters',
      shows: 'the meters behind the kerb of the parking stalls they serve',
      local: [-22, 6],
      distance: 40,
      yaw: 0.3,
      pitch: 0.8,
      scale: 2,
    },
    {
      subject: 'street-footway',
      name: 'cabinets',
      shows: 'the cabinets and telco pedestals in the strip behind the kerb, clear of the walk',
      local: [-10, 0],
      distance: 40,
      yaw: 0.3,
      pitch: 0.9,
      scale: 2,
    },
  ],
});
