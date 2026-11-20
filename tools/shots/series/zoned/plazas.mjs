import { defineSeries } from '../../lib/series.mjs';
import { kindSubjects } from '../../lib/zoned.mjs';

export default defineSeries({
  name: 'plazas',
  type: 'zoned',
  purpose:
    'Strip malls, supermarkets and filling stations read as themselves at every level and on their roomiest lot: frontage, pylon or canopy, car park with painted stalls and the loading side drawn.',
  budgetS: 60,
  subjects: kindSubjects(['strip', 'supermarket', 'fuel']),
});
