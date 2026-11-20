import { defineSeries } from '../../lib/series.mjs';
import { kindSubjects } from '../../lib/zoned.mjs';

export default defineSeries({
  name: 'roadside',
  type: 'zoned',
  purpose:
    'Auto repair, quick lube and car wash read as themselves at every level and on their roomiest lot: bays, wash tunnel, queue lane, car park and rear all drawn, no wall missing.',
  budgetS: 60,
  subjects: kindSubjects(['autorepair', 'quicklube', 'carwash']),
});
