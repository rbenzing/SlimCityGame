import { defineSeries } from '../../lib/series.mjs';
import { kindSubjects } from '../../lib/zoned.mjs';

export default defineSeries({
  name: 'downtown',
  type: 'zoned',
  purpose:
    'Offices and hotels read as downtown buildings at every level and on their roomiest lot: podium, glazing, crown, entrance and the faces not on the street all drawn.',
  budgetS: 60,
  subjects: kindSubjects(['office', 'hotel']),
});
