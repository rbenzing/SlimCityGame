import { defineSeries } from '../../lib/series.mjs';
import { kindSubjects } from '../../lib/zoned.mjs';

export default defineSeries({
  name: 'offices',
  type: 'zoned',
  purpose:
    'Banks and medical offices read as themselves at every level and on their roomiest lot: entrance, drive-up lane or canopy, car park and rear all drawn, no wall missing.',
  budgetS: 60,
  subjects: kindSubjects(['bank', 'medicaloffice']),
});
