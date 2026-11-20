import { defineSeries } from '../../lib/series.mjs';
import { stackedSubjects } from '../../lib/zoned.mjs';

export default defineSeries({
  name: 'stacked-shops',
  type: 'zoned',
  purpose:
    'Stacked shops and restaurants carry their parking in the building: working floors over garage storeys drawn with their openings, no surface car park, on a smaller lot than the spread form.',
  budgetS: 60,
  subjects: stackedSubjects(['shop', 'restaurant']),
});
