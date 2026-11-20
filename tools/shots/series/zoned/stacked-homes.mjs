import { defineSeries } from '../../lib/series.mjs';
import { stackedSubjects } from '../../lib/zoned.mjs';

export default defineSeries({
  name: 'stacked-homes',
  type: 'zoned',
  purpose:
    'Stacked mid-rises, towers and mixed-use blocks carry their parking in the building: garage storeys drawn with their openings, no surface car park, and the block standing taller on a smaller lot than its spread form.',
  budgetS: 60,
  subjects: stackedSubjects(['midrise', 'tower', 'mixed']),
});
