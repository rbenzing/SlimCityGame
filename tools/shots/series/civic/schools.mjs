import { civicSite } from '../../lib/civic.mjs';
import { defineSeries } from '../../lib/series.mjs';

export default defineSeries({
  name: 'schools',
  type: 'civic',
  purpose:
    'The four schools and the library each read as their own campus on a lot: entrance, drive and walk, grounds and every wall drawn, none cut short of its lot.',
  budgetS: 60,
  site: civicSite,
  subjects: [
    { id: 'school' },
    { id: 'middle-school' },
    { id: 'high-school' },
    { id: 'college' },
    { id: 'library' },
  ],
  details: [
    {
      subject: 'library',
      name: 'door',
      shows:
        'the library door and walk at pedestrian scale, a 1.75 m person against the 3.2 m wall',
      local: [-6, 20],
      distance: 40,
      yaw: 0.25,
      pitch: 0.25,
      scale: 2,
    },
    {
      subject: 'college',
      name: 'portico',
      shows: 'the college portico and quad from the street, low, where its entrance reads',
      local: [0, 20],
      distance: 80,
      yaw: 0,
      pitch: 0.25,
      scale: 1,
    },
  ],
});
