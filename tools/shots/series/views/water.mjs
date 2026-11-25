import { defineSeries } from '../../lib/series.mjs';
import { waterSpec } from '../../lib/watersuite.mjs';

/** The first generator's map, where the river is a canal the series digs: this run pins that. */
export default defineSeries(
  waterSpec({
    name: 'water',
    purpose:
      'The three kinds of water read as what they are: swell rolls in from the ocean edge and dies behind land, a lake is calmer upwind than downwind, a river drifts toward its outlet and is still at its banks, and the surface meets every shore with no gap.',
    session: { bloom: true },
  }),
);
