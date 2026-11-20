import { defineSeries } from '../../lib/series.mjs';
import { kindSubjects } from '../../lib/zoned.mjs';

export default defineSeries({
  name: 'stores',
  type: 'zoned',
  purpose:
    'Warehouses and storage yards read as themselves at every level and on their roomiest lot: dock doors, truck court, units, fence and office corner drawn on every side.',
  budgetS: 60,
  subjects: kindSubjects(['warehouse', 'storage']),
});
