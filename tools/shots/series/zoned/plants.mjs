import { defineSeries } from '../../lib/series.mjs';
import { kindSubjects } from '../../lib/zoned.mjs';

export default defineSeries({
  name: 'plants',
  type: 'zoned',
  purpose:
    'Food plants and paper mills read as heavy industry at every level and on their roomiest lot: process halls, silos, stacks, truck court and yard drawn, no wall missing.',
  budgetS: 60,
  subjects: kindSubjects(['foodplant', 'paper']),
});
