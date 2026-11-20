import { civicSite } from '../../lib/civic.mjs';
import { defineSeries } from '../../lib/series.mjs';

export default defineSeries({
  name: 'utilities',
  type: 'civic',
  purpose:
    'The waste and water kits each read as their own works: halls, bale docks, bays, tanks and pipes drawn on every side, and the shore kits standing at the water with their land side to the street.',
  budgetS: 60,
  site: civicSite,
  subjects: [
    { id: 'incinerator' },
    { id: 'materials-recovery-facility' },
    { id: 'transfer-station' },
    { id: 'recycling-depot' },
    { id: 'water-tower' },
    { id: 'water-pump' },
    { id: 'sewage-works' },
    { id: 'water-drain' },
  ],
  details: [
    {
      subject: 'materials-recovery-facility',
      name: 'docks',
      shows: 'the bale docks on the hall wall from the bale yard',
      local: [30, 10],
      distance: 70,
      yaw: Math.PI / 2,
      pitch: 0.4,
      scale: 1,
    },
    {
      subject: 'transfer-station',
      name: 'doors',
      shows: 'the open tipping doors of the hall facing the street, low',
      local: [-20, 30],
      distance: 85,
      yaw: 0.25,
      pitch: 0.35,
      scale: 1,
    },
  ],
});
