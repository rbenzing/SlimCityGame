import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import { bodyMetresFor } from '../shared/floorarea';
import type { BuildingCatalogEntry } from '../shared/types';
import { windowGrid } from './facade';
import { computeSetbacks, tierCountOf, tierHeightOf } from './massing';

const forms = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings.filter(
  (e) => e.stacked !== undefined,
);
const lowForms = forms.filter((e) => e.kind === 'shop' || e.kind === 'restaurant');

describe('the body of a built-in shop or restaurant', () => {
  it('is one straight-walled volume, never stepped tiers', () => {
    expect(lowForms.length).toBeGreaterThan(0);
    for (const entry of lowForms) {
      expect(tierCountOf(entry), entry.id).toBe(1);
      const { boxes } = computeSetbacks(entry, 7);
      const body = bodyMetresFor(entry);
      expect(boxes, entry.id).toHaveLength(1);
      expect(boxes[0]!.w, entry.id).toBeCloseTo(body.w, 6);
      expect(boxes[0]!.d, entry.id).toBeCloseTo(body.d, 6);
      expect(boxes[0]!.h, entry.id).toBeCloseTo(entry.height, 6);
    }
  });

  it('is cut into one window row for each of its working storeys', () => {
    for (const entry of lowForms) {
      const { rows } = windowGrid(entry, tierHeightOf(entry));
      expect(rows, entry.id).toBe(entry.stacked!.workingStoreys);
    }
  });
});
