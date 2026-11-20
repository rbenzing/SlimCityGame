import { civicSite } from '../../lib/civic.mjs';
import { defineSeries } from '../../lib/series.mjs';

/** Vehicle kinds (src/shared/types.ts VehicleKind), in the order they stand. */
const LINEUP = [3, 4, 5, 6, 7, 8];
const CAR = 0;
/** Tiles between the vehicles of the line-up, which stand on the plot, the car beside the first. */
const SPACING = 0.6;
const HEADING_EAST = Math.PI / 2;
const HEADING_WEST = -Math.PI / 2;
const LINEUP_TILES = 4;

/** The line-up's vehicle at index `i`, as metres on the plot's middle line. */
const stand = (site, i) => {
  const plot = site.subjects.find((s) => s.id === 'service-vehicles');
  const T = site.tile;
  const start = (LINEUP_TILES - (LINEUP.length - 1) * SPACING) / 2;
  return { x: (plot.x + start + i * SPACING + 0.5) * T, z: (plot.z + 0.5) * T };
};

export default defineSeries({
  name: 'depots',
  type: 'civic',
  purpose:
    'Each depot reads as a depot beside its street, track or tram street: bays, aprons, sheds and yard drawn on every side; the six service vehicles stand in a row at their true sizes beside a 4 m car.',
  budgetS: 60,
  site: civicSite,
  subjects: [
    { id: 'bus-depot' },
    { id: 'bus-garage' },
    { id: 'tram-depot', rotation: 1 },
    { id: 'rail-yard', rotation: 1 },
    { id: 'rail-station' },
    { id: 'service-vehicles', plot: { w: LINEUP_TILES, d: 1, h: 4 } },
  ],
  scene: async ({ page }, site) => {
    const list = LINEUP.map((kind, i) => ({ ...stand(site, i), heading: HEADING_EAST, kind }));
    const car = { ...stand(site, 0), heading: HEADING_WEST, kind: CAR };
    car.z += 0.5 * site.tile * 0.4;
    await page.evaluate((v) => window.__slimcity.setVehicles(v), [...list, car]);
  },
  details: [
    {
      subject: 'bus-depot',
      name: 'bays',
      shows: 'the bus bays and the noses of the buses on the apron at pedestrian scale',
      local: [0, 22],
      distance: 40,
      yaw: 0.5,
      pitch: 0.5,
      scale: 2,
    },
    {
      subject: 'tram-depot',
      name: 'lead',
      shows: 'the track lead crossing the footway to the tram street, and its turnout',
      local: [-30, -26],
      distance: 40,
      yaw: 0.5,
      pitch: 1.1,
      scale: 2,
    },
    {
      subject: 'service-vehicles',
      name: 'emergency',
      shows: 'the fire engine, police car and ambulance at 40 m against the 4 m car',
      local: [-18, 0],
      distance: 40,
      yaw: 0.5,
      pitch: 0.35,
      scale: 2,
    },
    {
      subject: 'service-vehicles',
      name: 'trucks',
      shows: 'the garbage truck, recycling truck and hearse at 40 m',
      local: [18, 0],
      distance: 40,
      yaw: -0.5,
      pitch: 0.35,
      scale: 2,
    },
  ],
});
