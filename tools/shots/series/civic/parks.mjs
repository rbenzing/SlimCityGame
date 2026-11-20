import { civicSite, subjectOf } from '../../lib/civic.mjs';
import { defineSeries } from '../../lib/series.mjs';

/** A district park's load that wears its lawn through (loads are crowds per capacity). */
const WORN_LOAD = 3;

export default defineSeries({
  name: 'parks',
  type: 'civic',
  purpose:
    'The five rungs of open space read at their true sizes, pocket to district park: paths, lawns, planting, shelter, pitch and stand drawn on every side, and a district lawn that wears under a crowd.',
  budgetS: 60,
  // The ladder's row is wider than any dry flat stretch of the map: levelled wherever it stands.
  site: { ...civicSite, anywhere: true },
  subjects: [
    { id: 'small-park' },
    { id: 'civic-plaza' },
    { id: 'neighbourhood-park' },
    { id: 'district-park' },
    { id: 'sports-ground' },
  ],
  details: [
    {
      subject: 'neighbourhood-park',
      name: 'play-area',
      shows: 'the play area: swings and picnic tables on their sand pad, against 1.75 m people',
      local: [45, 41],
      distance: 50,
      yaw: 0,
      pitch: 0.7,
      scale: 2,
    },
    {
      subject: 'sports-ground',
      name: 'stand',
      shows:
        "the sports ground's stand beside the pitch from the street, 1.75 m people against its rows",
      local: [0, 20],
      distance: 60,
      yaw: 0.3,
      pitch: 0.5,
      scale: 2,
    },
    {
      subject: 'district-park',
      name: 'edge',
      shows:
        'the district park against the street, low along the shared edge: kerb, footway and path',
      local: [0, 190],
      distance: 45,
      yaw: Math.PI / 2,
      pitch: 0.2,
      scale: 2,
    },
    {
      subject: 'district-park',
      name: 'worn',
      shows: 'the district lawn worn by a crowd of three times its capacity, from above',
      local: [0, 0],
      distance: 420,
      yaw: 0,
      pitch: 0.7,
      scale: 1,
      setup: ({ page }, site) =>
        page.evaluate(
          ([id, load]) => window.__slimcity.setParkLoad(id, load),
          [subjectOf(site, 'district-park').buildingId, WORN_LOAD],
        ),
    },
  ],
});
