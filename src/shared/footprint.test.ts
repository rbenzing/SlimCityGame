import { describe, expect, it } from 'vitest';
import { footprintForRotation } from './footprint';
import type { BuildingCatalogEntry } from './types';

const entry = { footprint: { w: 3, d: 2 } } as BuildingCatalogEntry;

describe('footprintForRotation', () => {
  it('keeps width and depth for upright and half-turned buildings', () => {
    expect(footprintForRotation(entry, 0)).toEqual({ w: 3, d: 2 });
    expect(footprintForRotation(entry, 2)).toEqual({ w: 3, d: 2 });
  });

  it('swaps width and depth for a quarter turn either way', () => {
    expect(footprintForRotation(entry, 1)).toEqual({ w: 2, d: 3 });
    expect(footprintForRotation(entry, 3)).toEqual({ w: 2, d: 3 });
  });
});
