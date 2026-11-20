import { civicSite } from '../../lib/civic.mjs';
import { defineSeries } from '../../lib/series.mjs';

export default defineSeries({
  name: 'power',
  type: 'civic',
  purpose:
    'Every power plant reads as the plant it is on its lot: coal, gas, combined-cycle, reactor on its water, solar field and turbine, with stacks, halls, yards and fences drawn on every side.',
  budgetS: 60,
  site: civicSite,
  subjects: [
    { id: 'coal-plant' },
    { id: 'combined-cycle' },
    { id: 'gas-turbine' },
    { id: 'nuclear-plant' },
    { id: 'solar-farm' },
    { id: 'substation' },
    { id: 'wind-turbine' },
  ],
  details: [
    {
      subject: 'solar-farm',
      name: 'gate',
      shows: 'the gate, track and inverter skid of the solar field at pedestrian scale',
      local: [-30, 60],
      distance: 40,
      yaw: 0.4,
      pitch: 0.35,
      scale: 2,
    },
    {
      subject: 'nuclear-plant',
      name: 'intake',
      shows: 'the intake on the water side, seen from across the pond',
      local: [0, -50],
      distance: 60,
      yaw: Math.PI + 0.4,
      pitch: 0.3,
      scale: 2,
    },
  ],
});
