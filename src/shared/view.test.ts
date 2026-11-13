import { describe, expect, it } from 'vitest';
import { FieldId } from './types';
import { isUnderground } from './view';

describe('isUnderground', () => {
  it('is on for the Water and Sewer lenses', () => {
    expect(isUnderground('watered', 'select')).toBe(true);
    expect(isUnderground('sewered', 'select')).toBe(true);
  });

  it('is on for the pipe tool, the cable tool and Water-tab buildings', () => {
    expect(isUnderground(null, 'water.pipe')).toBe(true);
    expect(isUnderground(null, 'power.cable')).toBe(true);
    expect(isUnderground(null, 'plop.water-tower')).toBe(true);
  });

  it('is off in the plain view and for other lenses and tools', () => {
    expect(isUnderground(null, 'select')).toBe(false);
    expect(isUnderground(FieldId.Pollution, 'select')).toBe(false);
    expect(isUnderground('power', 'road.two')).toBe(false);
    expect(isUnderground('transit', 'select')).toBe(false);
  });
});
