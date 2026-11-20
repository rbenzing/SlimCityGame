import { defineSeries } from '../../lib/series.mjs';
import { TIER } from '../../lib/roads.mjs';

/** Road flow directions in a save (src/shared/types.ts RoadFlow). */
const FLOW_NORTH = 1;
const FLOW_SOUTH = 3;
/** Terrain chunks are this many tiles across: a dash must run on over their seams. */
const CHUNK_TILES = 16;

/** A run of this many tiles always holds a chunk seam with four tiles of road either side of it. */
const RUN = 24;
const ROW = 1;
/** Tile index (in the run's frame) of the first chunk seam at least four tiles in. */
const seamAt = (origin) => Math.ceil((origin.x + 4) / CHUNK_TILES) * CHUNK_TILES - origin.x;

/** A road turning a right angle: a run down column BEND meeting a run along row BEND. */
const BEND = 4;
const turn = (id, tier) => ({
  id,
  pad: { w: 2 * BEND + 1, h: 2 * BEND + 1 },
  close: { x0: 2, z0: 2, length: BEND + 1, width: BEND + 1 },
  lay: (p) => [p.road(tier, p.col(BEND, 0, BEND)), p.road(tier, p.row(BEND, BEND, 2 * BEND))],
});

/** A one-way street of 12 tiles down column 1, drawn south to north or north to south. */
const oneWay = (id, drawnNorth) => ({
  id,
  pad: { w: 3, h: 12 },
  view: { x0: 0, z0: 0, length: 12, width: 3, axis: 'z', line: 1 },
  close: { z0: 3, length: 6 },
  lay: (p) => {
    const tiles = p.col(1, 0, 11);
    return [p.road(TIER.oneWay, drawnNorth ? tiles.reverse() : tiles)];
  },
});

/** A motorway column in a stated direction. */
const carriageway = (p, x, flow) => {
  const tiles = p.col(x, 0, 11);
  return p.road(TIER.highway, tiles, { flows: tiles.map(() => flow) });
};

export default defineSeries({
  name: 'paint',
  type: 'roads',
  purpose:
    'Painted line work runs unbroken along a road and says which way it goes: dashes carry across tile and chunk seams, lines sweep round a turn, a one-way road shows the arrows of the way it was drawn, and on a motorway both yellow lines face the median and both white lines the verge.',
  budgetS: 60,
  gap: 4,
  subjects: [
    {
      id: 'dash-straight',
      pad: { w: RUN, h: 3 },
      view: { x0: 0, z0: 0, length: RUN, width: 3, line: ROW },
      close: (pad, origin) => ({ x0: seamAt(origin) - 3, z0: ROW, length: 6, width: 1 }),
      lay: (p) => [p.road(TIER.twoLane, p.row(ROW, 1, RUN - 2))],
    },
    turn('turn-four-lane', TIER.fourLane),
    turn('turn-avenue', TIER.avenue),
    oneWay('one-way-drawn-south', false),
    oneWay('one-way-drawn-north', true),
    {
      // A motorway pair, the southbound carriageway west of the northbound, a street beside as the control.
      id: 'motorway-dual',
      pad: { w: 10, h: 12 },
      view: { x0: 0, z0: 0, length: 12, width: 10, axis: 'z', line: 2 },
      close: { x0: 1, z0: 3, length: 6, width: 5 },
      lay: (p) => [
        carriageway(p, 2, FLOW_SOUTH),
        carriageway(p, 4, FLOW_NORTH),
        p.road(TIER.twoLane, p.col(8, 0, 11)),
      ],
    },
  ],
  details: [
    {
      subject: 'dash-straight',
      name: 'seam',
      shows: 'the dashes running on over a terrain chunk seam with no gap or double',
      local: (run, tile) => {
        const seam = Math.ceil((run.x0 + 4) / CHUNK_TILES) * CHUNK_TILES;
        return [(seam - 0.5 - (run.x0 + (run.length - 1) / 2)) * tile, 0];
      },
      distance: 40,
      yaw: 0,
      pitch: 1.45,
      scale: 2,
    },
    {
      subject: 'motorway-dual',
      name: 'lines',
      shows: 'the yellow edge lines side by side facing the median, white on the outer edges',
      local: [0, 0],
      distance: 80,
      yaw: Math.PI,
      pitch: 1.45,
      scale: 2,
    },
  ],
});
