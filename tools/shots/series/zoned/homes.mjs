import { defineSeries } from '../../lib/series.mjs';
import { standForms, subjectsOf, zoneBehind } from '../../lib/zoned.mjs';

export default defineSeries({
  name: 'homes',
  type: 'zoned',
  purpose:
    'Every detached home reads as a house of its level on its lot size: form, porch or stoop, drive, garage, fence and yard all drawn, no wall missing, the lot filled to its size and the yard behind a shallow lot drawn.',
  budgetS: 60,
  subjects: [
    ...subjectsOf('res-half-1', 'res-half-2', 'res-half-3'),
    { id: 'res-normal-1', as: 'res-normal-1-ranch' },
    { id: 'res-normal-1', as: 'res-normal-1-craftsman' },
    { id: 'res-normal-1', as: 'res-normal-1-split-level' },
    ...subjectsOf('res-normal-2', 'res-normal-3', 'res-normal-t-1'),
    ...subjectsOf('res-low-1', 'res-low-2', 'res-low-3'),
    ...subjectsOf('res-estate-1', 'res-estate-2', 'res-estate-3', 'res-estate-t-1'),
    ...subjectsOf('res-acre-1', 'res-acre-2', 'res-acre-3'),
  ],
  site: { prepare: zoneBehind },
  scene: (session, site) =>
    standForms(session, site, {
      'res-normal-1-ranch': 'ranch',
      'res-normal-1-craftsman': 'craftsman',
      'res-normal-1-split-level': 'splitLevel',
    }),
  details: [
    {
      subject: 'res-half-1',
      name: 'yard',
      shows:
        'the half lot and the two zoned rows behind it from straight above, drawn as one deep garden',
      local: [0, -12],
      distance: 90,
      yaw: 0,
      pitch: 1.45,
      scale: 1,
    },
    {
      subject: 'res-normal-2',
      name: 'yard',
      shows: 'the normal lot and the row behind it from straight above, drawn as one deep garden',
      local: [0, 4],
      distance: 90,
      yaw: 0,
      pitch: 1.45,
      scale: 1,
    },
  ],
});
