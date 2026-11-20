import { defineSeries } from '../../lib/series.mjs';
import { subjectsOf, zoneBehind } from '../../lib/zoned.mjs';

export default defineSeries({
  name: 'attached',
  type: 'zoned',
  purpose:
    'Duplexes, fourplexes and townhouse rows read as attached homes at each level: a door and stoop for every unit, a drive or garage for each, the party walls unbroken, no wall missing, the lot filled to its shape.',
  budgetS: 60,
  subjects: subjectsOf(
    'res-duplex-1',
    'res-duplex-2',
    'res-duplex-3',
    'res-duplex-h-1',
    'res-duplex-t-1',
    'res-fourplex-1',
    'res-fourplex-2',
    'res-fourplex-3',
    'res-fourplex-h-1',
    'res-fourplex-t-1',
    'res-medium-row-1',
    'res-medium-row-2',
    'res-medium-row-3',
    'res-medium-row-t-1',
  ),
  site: { prepare: zoneBehind },
});
