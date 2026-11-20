import { defineSeries } from '../../lib/series.mjs';
import { subjectsOf } from '../../lib/zoned.mjs';

/** Metres from a subject's centre to a point just in front of its street wall: half its depth less a little. */
const frontWall = (tilesDeep) => tilesDeep * 10 - 3;

export default defineSeries({
  name: 'apartments',
  type: 'zoned',
  purpose:
    'Each apartment kind reads as itself at every level: multiplex, garden walk-up, mid-rise, tower and the mixed-use blocks with their shopfronts, entrances, car parks and rooflines drawn on every side.',
  budgetS: 60,
  subjects: subjectsOf(
    'res-multiplex-1',
    'res-multiplex-2',
    'res-multiplex-3',
    'res-medium-1',
    'res-medium-2',
    'res-medium-3',
    'res-high-1',
    'res-high-1-lot2x2',
    'res-high-2',
    'res-high-3',
    'res-tower-1',
    'res-tower-2',
    'res-tower-3',
    'mixed-1',
    'mixed-1-lot2x2',
    'mixed-2',
    'mixed-3',
  ),
  details: [
    {
      subject: 'res-medium-2',
      name: 'breezeway',
      shows: 'the walk-up breezeway: stair and landings against the windows and unit doors',
      local: [0, frontWall(2)],
      distance: 40,
      yaw: -0.3,
      pitch: 0.35,
      scale: 2,
    },
    {
      subject: 'res-tower-1',
      name: 'podium',
      shows: 'the tower podium: lobby and storefront band at pedestrian scale',
      local: [0, frontWall(2)],
      distance: 40,
      yaw: 0.3,
      pitch: 0.35,
      scale: 2,
    },
    {
      subject: 'mixed-1',
      name: 'shopfront',
      shows: 'the ground-floor shopfront and the flat entrance beside it',
      local: [0, frontWall(2)],
      distance: 40,
      yaw: 0.3,
      pitch: 0.35,
      scale: 2,
    },
    {
      subject: 'mixed-2',
      name: 'shopfront',
      shows: 'the ground-floor shopfront and the flat entrance beside it',
      local: [0, frontWall(2)],
      distance: 40,
      yaw: 0.3,
      pitch: 0.35,
      scale: 2,
    },
    {
      subject: 'mixed-3',
      name: 'shopfront',
      shows: 'the ground-floor shopfront and the flat entrance beside it',
      local: [0, frontWall(3)],
      distance: 40,
      yaw: 0.3,
      pitch: 0.35,
      scale: 2,
    },
  ],
});
