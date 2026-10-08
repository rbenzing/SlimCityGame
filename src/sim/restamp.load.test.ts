import { describe, expect, it } from 'vitest';
import { decodeSave, encodeSave } from '../app/persist';
import { RoadTier } from '../shared/types';
import { BuildingRegistry } from './buildings';
import { recomputeUtilities } from './network';
import {
  catalog,
  initialized,
  latestSaveGrid,
  roadRow,
  run,
  waterTowerEntry,
} from '../../tests/support/sim';

describe('loading a water tower saved when it was 2x2', () => {
  it('moves it onto the street it fronts and the water network still reaches it', () => {
    const h = initialized();
    expect(
      run(h, 1, [
        { kind: 'setSandbox', on: true },
        { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(98, 102, 8) },
      ]).ok,
    ).toBe(true);
    // One tile now; the old build stamped it 2x2 over z 100-101, the street at z 102.
    expect(
      run(h, 2, [{ kind: 'placeBuilding', catalogId: 'water-tower', x: 100, z: 100, rotation: 0 }])
        .ok,
    ).toBe(true);

    h.sim.handleMessage({ type: 'requestSave' });
    const first = h.messages.filter((m) => m.type === 'save').at(-1);
    if (!first || first.type !== 'save') throw new Error('no save message');
    const payload = decodeSave(first.data);
    const tower = payload.meta.registry.buildings.find((b) => b.catalogId === 'water-tower')!;
    tower.w = 2;
    tower.d = 2;
    h.sim.handleMessage({ type: 'loadSave', data: encodeSave(payload) });

    h.sim.handleMessage({ type: 'requestSave' });
    const last = h.messages.filter((m) => m.type === 'save').at(-1);
    if (!last || last.type !== 'save') throw new Error('no save message');
    const saved = decodeSave(last.data).meta.registry;
    const loaded = saved.buildings.find((b) => b.catalogId === 'water-tower')!;
    expect(loaded).toMatchObject({ x: 100, z: 101, w: 1, d: 1 });

    const grid = latestSaveGrid(h);
    const registry = BuildingRegistry.deserialize(catalog, saved);
    const totals = recomputeUtilities(grid, registry.all(), catalog);
    expect(totals.waterSupply).toBe(waterTowerEntry.utility!.waterKL);
  });
});
