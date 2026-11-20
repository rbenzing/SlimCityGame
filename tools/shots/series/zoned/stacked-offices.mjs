import { defineSeries } from '../../lib/series.mjs';
import { stackedSubjects } from '../../lib/zoned.mjs';

export default defineSeries({
  name: 'stacked-offices',
  type: 'zoned',
  purpose:
    'Stacked offices and hotels carry their parking in the building: garage storeys drawn with their openings under the working floors, no surface car park, on a smaller lot than the spread form.',
  budgetS: 60,
  subjects: stackedSubjects(['office', 'hotel']),
});
