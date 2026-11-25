import { defineSeries } from '../../lib/series.mjs';
import { waterSpec } from '../../lib/watersuite.mjs';

/** The coast generator's map: its own sea, river and lakes, nothing dug. */
export default defineSeries(
  waterSpec({
    name: 'watercoast',
    purpose:
      "The coast map's three waters read as what they are on the map as it is generated: swell rolls in off the sea past the map's edge, the river runs to its mouth in its valley and is still at its banks, and the lakes are calmer upwind than downwind; the surface meets every shore with no gap.",
    session: { bloom: true, webgpu: true, generator: 2 },
  }),
);
