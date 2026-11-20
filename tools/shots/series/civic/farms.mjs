import { civicSite } from '../../lib/civic.mjs';
import { defineSeries } from '../../lib/series.mjs';

export default defineSeries({
  name: 'farms',
  type: 'civic',
  purpose:
    'Crop, orchard and pasture farms of every level read as farms on their lots: fields, rows, trees, fences, farmhouse, barn and yard drawn on every side.',
  budgetS: 60,
  site: { ...civicSite, anywhere: true },
  subjects: ['crops', 'orchard', 'pasture'].flatMap((kind) =>
    [1, 2, 3].map((level) => ({ id: `farm-${kind}-${level}` })),
  ),
  details: [],
});
