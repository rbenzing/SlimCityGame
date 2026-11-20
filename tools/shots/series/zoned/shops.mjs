import { defineSeries } from '../../lib/series.mjs';
import { kindSubjects } from '../../lib/zoned.mjs';

export default defineSeries({
  name: 'shops',
  type: 'zoned',
  purpose:
    'Each small shop kind reads as itself at every level and on its roomiest lot: shopfront, signs, entrance, car park and rear service side drawn, no wall missing.',
  budgetS: 60,
  subjects: kindSubjects(['shop', 'restaurant', 'convenience', 'pharmacy']),
});
