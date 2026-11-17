import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import { bodyMetresFor } from '../shared/floorarea';
import type { BuildingCatalogEntry } from '../shared/types';
import { isApartmentEntry } from './archetypes';
import {
  blockPaneCut,
  HOUSE_BAY_M,
  HOUSE_PANE_HEIGHT_M,
  HOUSE_PANE_WIDTH_M,
  windowGrid,
} from './facade';

const apartments = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings.filter((e) =>
  isApartmentEntry(e),
);

describe('a block’s lit pane', () => {
  it('is one window, never a slab over a whole bay, on every apartment kind at every level', () => {
    for (const e of apartments) {
      const cut = blockPaneCut(e, e.height)!;
      expect(cut, e.id).not.toBeNull();
      const { cols, rows } = windowGrid(e, e.height);
      const body = bodyMetresFor(e);
      const cellW = (body.w + body.d) / 2 / cols;
      const subW = cellW / cut.subCols;
      const paneW = subW * (1 - 2 * (cut.x ?? 0));
      expect(subW, e.id).toBeLessThanOrEqual(HOUSE_BAY_M * 1.5);
      if (e.kind === 'tower') {
        expect(cut.x, e.id).toBeNull();
        expect(subW, e.id).toBeLessThanOrEqual(HOUSE_BAY_M * 1.5);
      } else {
        expect(paneW, e.id).toBeCloseTo(HOUSE_PANE_WIDTH_M, 6);
        const paneH = (e.height / rows) * (1 - 2 * cut.y!);
        expect(paneH, e.id).toBeCloseTo(HOUSE_PANE_HEIGHT_M, 6);
      }
    }
  });

  it('is not cut for a building that is not an apartment block', () => {
    const shop = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings.find(
      (e) => e.category === 'com',
    )!;
    expect(blockPaneCut(shop, shop.height)).toBeNull();
  });
});
