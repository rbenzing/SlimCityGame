import { defineSeries } from '../../lib/series.mjs';
import { kindSubjects } from '../../lib/zoned.mjs';

export default defineSeries({
  name: 'works',
  type: 'zoned',
  purpose:
    'Workshops, machine shops, factories and flex buildings read as themselves at every level and on their roomiest lot: bays, roofline, stacks, yard and car park drawn, no wall missing.',
  budgetS: 60,
  subjects: kindSubjects(['workshop', 'machineshop', 'factory', 'flex']),
});
