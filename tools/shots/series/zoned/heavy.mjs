import { defineSeries } from '../../lib/series.mjs';
import { kindSubjects } from '../../lib/zoned.mjs';

export default defineSeries({
  name: 'heavy',
  type: 'zoned',
  purpose:
    'Chemical works and steelworks read as heavy industry at every level and on their roomiest lot: tanks, stacks, furnaces, pipe runs and yard drawn, no wall missing.',
  budgetS: 60,
  subjects: kindSubjects(['chemical', 'metals']),
});
