import { defineSeries } from '../../lib/series.mjs';
import { composeProfile, TIER } from '../../lib/roads.mjs';

/** The motorway with a fourth lane, a profile the game composes from its own preset. */
const FOUR_LANE_MOTORWAY = 13;

/** Tiles of a run: the first road to `SEAM - 1`, the second from `SEAM`. A lane drop closes over seven tiles. */
const LENGTH = 14;
const SEAM = 8;
const AWAY = 1;
/** Metres from the middle of the run to the seam between its halves (one tile is 20 m). */
const toSeam = (seam, tile = 20) => (seam - 0.5 - (LENGTH - 1) / 2) * tile;

/** One straight run that is `from` for its first half and `to` for its second. */
const change = (id, from, to) => ({
  id,
  pad: { w: LENGTH, h: 1 },
  lay: (p) => [p.road(from, p.row(0, 0, SEAM - 1)), p.road(to, p.row(0, SEAM, LENGTH - 1))],
});

const seamDetail = (subject, seam = SEAM) => ({
  subject,
  name: 'seam',
  shows:
    'the join at pixel scale: whether the kerb, the edge line and the lane paint flow through the change',
  local: [toSeam(seam), 0],
  distance: 40,
  yaw: 0,
  pitch: 1.45,
  scale: 2,
});

export default defineSeries({
  name: 'changes',
  type: 'roads',
  purpose:
    'Where one road becomes another, the paint and the kerb flow through the change: a width change closes tile by tile, a lane drop tapers, and a motorway that loses a lane keeps its pavement and closes the lane with paint.',
  budgetS: 60,
  gap: 8,
  subjects: [
    {
      // The first subject is shot at night, lit by a turbine at the far end of the run.
      ...change('avenue-to-twolane', TIER.avenue, TIER.twoLane),
      lay: (p) => [
        p.road(TIER.avenue, p.row(0, 0, SEAM - 1)),
        p.road(TIER.twoLane, p.row(0, SEAM, LENGTH - 1)),
        p.building('wind-turbine', LENGTH - 1, -AWAY),
      ],
    },
    change('fourlane-to-twolane', TIER.fourLane, TIER.twoLane),
    change('fourlane-to-avenue', TIER.fourLane, TIER.avenue),
    change('twolane-to-gravel', TIER.twoLane, TIER.gravel),
    change('avenue-to-oneway', TIER.avenue, TIER.oneWay),
    {
      id: 'motorway-lane-drop',
      pad: { w: LENGTH, h: 1 },
      lay: async (p) => {
        const profile = await composeProfile(p.page, TIER.highway, { lanes: 4 });
        return [
          { kind: 'defineRoadProfile', id: FOUR_LANE_MOTORWAY, profile },
          p.road(TIER.highway, p.row(0, 0, SEAM + 1), { profile: FOUR_LANE_MOTORWAY }),
          p.road(TIER.highway, p.row(0, SEAM + 2, LENGTH - 1)),
        ];
      },
    },
  ],
  details: [
    seamDetail('avenue-to-twolane'),
    seamDetail('fourlane-to-twolane'),
    seamDetail('fourlane-to-avenue'),
    seamDetail('twolane-to-gravel'),
    seamDetail('avenue-to-oneway'),
    seamDetail('motorway-lane-drop', SEAM + 2),
  ],
});
