import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import type { BuildingCatalogEntry } from '../shared/types';
import { BuildingState } from '../shared/types';
import { createGrid } from '../world/grid';
import { BuildingRegistry } from './buildings';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;

/** The lots added for the roomy rungs: absent from the catalog an older save was written against. */
const ADDED_IDS = [
  'com-low-1-lot1x2',
  'com-low-2-lot4x2',
  'com-restaurant-1-lot1x3',
  'com-strip-2-lot7x2',
  'com-strip-3-lot9x2',
  'com-market-2-lot7x3',
  'com-market-3-lot9x4',
  'ind-1-lot3x2',
  'ind-workshop-2-lot3x3',
  'ind-workshop-3-lot5x3',
  'ind-warehouse-1-lot5x3',
  'ind-warehouse-2-lot6x3',
  'ind-warehouse-3-lot8x4',
  'ind-factory-1-lot3x3',
  'ind-2-lot5x3',
  'ind-factory-3-lot6x3',
  'ind-flex-1-lot2x3',
  'ind-3-lot5x3',
  'heavy-food-1-lot5x3',
  'heavy-food-2-lot6x3',
  'heavy-food-3-lot8x4',
  'heavy-metals-1-lot4x4',
  'heavy-metals-2-lot5x4',
  'heavy-metals-3-lot6x4',
  'heavy-paper-1-lot5x3',
  'heavy-paper-2-lot6x4',
  'heavy-paper-3-lot8x4',
];

describe('a save written before the roomy lots', () => {
  const older = catalog.filter((e) => !ADDED_IDS.includes(e.id));

  it('names every added lot in the catalog, and none in the older one', () => {
    expect(catalog.length - older.length).toBe(ADDED_IDS.length);
    for (const id of ADDED_IDS)
      expect(
        catalog.some((e) => e.id === id),
        id,
      ).toBe(true);
  });

  it('refers to a building by its catalog id string, never by its place in the catalog', () => {
    const g = createGrid();
    const registry = new BuildingRegistry(older);
    registry.place(
      g,
      older.find((e) => e.id === 'com-shop-2')!,
      40,
      40,
      0,
      BuildingState.Active,
    );
    const [saved] = registry.serialize().buildings;
    expect(saved!.catalogId).toBe('com-shop-2');
    expect(Object.keys(saved!).sort()).toEqual(
      ['catalogId', 'd', 'id', 'level', 'problems', 'rotation', 'state', 'w', 'x', 'z'].sort(),
    );
  });

  it('loads on the catalog with the added lots as the same buildings in the same places', () => {
    const g = createGrid();
    const registry = new BuildingRegistry(older);
    older
      .filter((e) => e.category === 'com' || e.category === 'ind')
      .forEach((e, i) => {
        registry.place(
          g,
          e,
          4 + (i % 12) * 20,
          4 + Math.floor(i / 12) * 20,
          0,
          BuildingState.Active,
        );
      });
    const data = JSON.parse(JSON.stringify(registry.serialize())) as ReturnType<
      BuildingRegistry['serialize']
    >;
    expect(data.buildings.length).toBeGreaterThan(60);

    const restored = BuildingRegistry.deserialize(catalog, data);
    expect(restored.all()).toEqual(registry.all());
    expect(restored.totals()).toEqual(registry.totals());
    expect(restored.serialize()).toEqual(data);
    for (const inst of restored.all()) {
      const was = older.find((e) => e.id === inst.catalogId);
      const now = catalog.find((e) => e.id === inst.catalogId);
      expect(now, inst.catalogId).toEqual(was);
    }
  });
});
