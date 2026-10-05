import { describe, expect, it } from 'vitest';
import { averageOutputMW, formatMW } from './power';

describe('averageOutputMW', () => {
  it('is the nameplate times the capacity factor, and the nameplate alone when none is given', () => {
    expect(averageOutputMW({ powerMW: 3.4, capacityFactor: 0.335 })).toBeCloseTo(1.139, 9);
    expect(averageOutputMW({ powerMW: 60, capacityFactor: 0.426 })).toBeCloseTo(25.56, 9);
    expect(averageOutputMW({ powerMW: 6 })).toBe(6);
    expect(averageOutputMW({ waterKL: 100 })).toBe(0);
  });
});

describe('formatMW', () => {
  it('rounds to whole megawatts above ten, tenths above one, hundredths below', () => {
    expect(formatMW(25.56)).toBe('26');
    expect(formatMW(1.139)).toBe('1.1');
    expect(formatMW(0.0625)).toBe('0.06');
    expect(formatMW(10)).toBe('10');
  });
});
