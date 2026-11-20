import { civicSite } from '../../lib/civic.mjs';
import { defineSeries } from '../../lib/series.mjs';

/** Both details of a rung, from its layout (src/shared/airportlayout.ts, metres in the plot's
 * frame, +z toward the street): the low runway end from the approach, and the apron from the
 * taxiway side. `end` and `apron` are offsets from the plot's centre. */
const rung = (subject, end, apron, apronDistance) => [
  {
    subject,
    name: 'runway-end',
    shows: 'the low runway end from the approach: numerals and threshold stripes',
    local: end,
    distance: 150,
    yaw: -Math.PI / 2,
    pitch: 0.8,
    scale: 2,
  },
  {
    subject,
    name: 'apron',
    shows:
      'the apron from the taxiway side: aircraft on their stands, the terminal and hangars behind',
    local: apron,
    distance: apronDistance,
    yaw: Math.PI,
    pitch: 0.6,
    scale: 1,
  },
];

export default defineSeries({
  name: 'airport',
  type: 'civic',
  purpose:
    'The three airports read as airports from the street and from the air: runway, taxiway, apron, terminal, car parks, hangars, tower and fence drawn and in place on every side. The international plot is wider than the camera can reach, so its frames show part of it.',
  budgetS: 60,
  // The three plots are wider than any dry stretch: levelled wherever they stand, in two bands.
  site: { ...civicSite, anywhere: true },
  subjects: [{ id: 'airfield' }, { id: 'regional-airport' }, { id: 'international-airport' }],
  details: [
    ...rung('airfield', [-361, -52], [0, 59], 224),
    ...rung('regional-airport', [-712, -108], [0, 80], 220),
    ...rung('international-airport', [-1474, -208], [0, 107], 400),
  ],
});
