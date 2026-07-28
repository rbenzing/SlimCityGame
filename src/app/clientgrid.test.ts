/**
 * Render-thread grid mirror: accumulates the worker's snapshot deltas
 * (roads/zones/buildings) over the static map layers so integration can feed
 * ZoneGridRenderer.rebuild, LampRenderer.rebuild, and the plop-tool
 * "Overlapping items" check without asking the worker.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { RoadTier, ZoneType } from '../shared/types';
import type { BuildingCatalogEntry, BuildingInstance, MapData } from '../shared/types';
import { ClientGridMirror } from './clientgrid';

const SIZE = 32;

function makeMap(): MapData {
  const n = SIZE * SIZE;
  const map: MapData = {
    name: 'Test',
    size: SIZE,
    height: new Float32Array(n).fill(3),
    water: new Uint8Array(n),
    trees: new Uint8Array(n),
    seaLevel: 0,
    spawn: { x: 0, z: 0 },
  };
  map.water[5 * SIZE + 5] = 1; // one water tile at (5,5)
  return map;
}

const plant: BuildingCatalogEntry = {
  id: 'plant',
  name: 'Plant',
  category: 'utility',
  footprint: { w: 2, d: 1 },
  height: 10,
  color: 0,
  powerUse: 0,
  waterUse: 0,
  cost: 100,
  upkeep: 1,
  unlockMilestone: 0,
};

function instance(id: number, x: number, z: number, rotation: 0 | 1 | 2 | 3 = 0): BuildingInstance {
  return { id, catalogId: 'plant', x, z, rotation, level: 1, state: 1, problems: 0 };
}

const entryFor = (id: string): BuildingCatalogEntry | undefined =>
  id === 'plant' ? plant : undefined;

describe('ClientGridMirror', () => {
  let mirror: ClientGridMirror;

  beforeEach(() => {
    mirror = new ClientGridMirror(makeMap());
  });

  it('copies the static map layers and starts with empty dynamic layers', () => {
    expect(mirror.size).toBe(SIZE);
    expect(mirror.height[0]).toBe(3);
    expect(mirror.water[5 * SIZE + 5]).toBe(1);
    expect(Array.from(mirror.roadTier).every((v) => v === 0)).toBe(true);
    expect(Array.from(mirror.zone).every((v) => v === 0)).toBe(true);
    expect(mirror.roadTiles()).toEqual([]);
  });

  it('applies road deltas, including removals (tier None)', () => {
    mirror.applyRoadDeltas([
      { x: 3, z: 4, tier: RoadTier.TwoLane, mask: 0 },
      { x: 4, z: 4, tier: RoadTier.Avenue, mask: 0 },
    ]);
    expect(mirror.roadTier[4 * SIZE + 3]).toBe(RoadTier.TwoLane);
    expect(mirror.roadTier[4 * SIZE + 4]).toBe(RoadTier.Avenue);
    expect(mirror.roadTiles()).toEqual([
      { x: 3, z: 4, tier: RoadTier.TwoLane },
      { x: 4, z: 4, tier: RoadTier.Avenue },
    ]);

    mirror.applyRoadDeltas([{ x: 3, z: 4, tier: RoadTier.None, mask: 0 }]);
    expect(mirror.roadTier[4 * SIZE + 3]).toBe(RoadTier.None);
    expect(mirror.roadTiles()).toEqual([{ x: 4, z: 4, tier: RoadTier.Avenue }]);
  });

  it('applies zone patches into the zone layer', () => {
    mirror.applyZonePatches([{ x: 10, z: 10, w: 2, h: 2, data: new Uint8Array([1, 1, 3, 0]) }]);
    expect(mirror.zone[10 * SIZE + 10]).toBe(ZoneType.ResLow);
    expect(mirror.zone[10 * SIZE + 11]).toBe(ZoneType.ResLow);
    expect(mirror.zone[11 * SIZE + 10]).toBe(ZoneType.ComLow);
    expect(mirror.zone[11 * SIZE + 11]).toBe(ZoneType.None);
  });

  it('stamps building footprints on add (rotation swaps w/d) and clears them on remove', () => {
    mirror.applyBuildingDelta(
      { added: [instance(7, 8, 8, 0)], removed: [], updated: [] },
      entryFor,
    );
    // 2x1 footprint at rotation 0: (8,8) and (9,8).
    expect(mirror.buildingId[8 * SIZE + 8]).toBe(7);
    expect(mirror.buildingId[8 * SIZE + 9]).toBe(7);
    expect(mirror.buildingId[9 * SIZE + 8]).toBe(0);

    mirror.applyBuildingDelta(
      { added: [instance(9, 12, 12, 1)], removed: [], updated: [] },
      entryFor,
    );
    // Rotation 1 swaps to 1x2: (12,12) and (12,13).
    expect(mirror.buildingId[12 * SIZE + 12]).toBe(9);
    expect(mirror.buildingId[13 * SIZE + 12]).toBe(9);
    expect(mirror.buildingId[12 * SIZE + 13]).toBe(0);

    mirror.applyBuildingDelta({ added: [], removed: [7], updated: [] }, entryFor);
    expect(mirror.buildingId[8 * SIZE + 8]).toBe(0);
    expect(mirror.buildingId[8 * SIZE + 9]).toBe(0);
    // The other building is untouched.
    expect(mirror.buildingId[12 * SIZE + 12]).toBe(9);
  });

  it('re-stamps a building on update', () => {
    mirror.applyBuildingDelta(
      { added: [instance(7, 8, 8, 0)], removed: [], updated: [] },
      entryFor,
    );
    mirror.applyBuildingDelta(
      { added: [], removed: [], updated: [instance(7, 8, 8, 1)] },
      entryFor,
    );
    // Rotation now 1 -> footprint (8,8) + (8,9); old (9,8) slot cleared.
    expect(mirror.buildingId[8 * SIZE + 8]).toBe(7);
    expect(mirror.buildingId[9 * SIZE + 8]).toBe(7);
    expect(mirror.buildingId[8 * SIZE + 9]).toBe(0);
  });

  it('applies height patches into the height mirror (auto-flatten / terraform, UI-SPEC §6.18 #6)', () => {
    // A 2x2 flatten patch at (10,10) leveling those tiles to 7.5m; the
    // shape matches SimSnapshot.heightPatches / terraform's HeightPatch.
    mirror.applyHeightPatches([
      { x: 10, z: 10, w: 2, h: 2, heights: new Float32Array([7.5, 7.5, 7.5, 7.5]) },
    ]);
    expect(mirror.height[10 * SIZE + 10]).toBeCloseTo(7.5, 5);
    expect(mirror.height[10 * SIZE + 11]).toBeCloseTo(7.5, 5);
    expect(mirror.height[11 * SIZE + 10]).toBeCloseTo(7.5, 5);
    expect(mirror.height[11 * SIZE + 11]).toBeCloseTo(7.5, 5);
    // A tile outside the patch rect keeps its original map height (3).
    expect(mirror.height[0]).toBe(3);
  });

  it('clips height patches to the grid bounds without throwing', () => {
    // Patch rect partly off the +x/+z edge: in-bounds cells update, the
    // out-of-bounds portion is silently skipped.
    mirror.applyHeightPatches([
      {
        x: SIZE - 1,
        z: SIZE - 1,
        w: 2,
        h: 2,
        heights: new Float32Array([9, 9, 9, 9]),
      },
    ]);
    expect(mirror.height[(SIZE - 1) * SIZE + (SIZE - 1)]).toBeCloseTo(9, 5);
  });

  describe('isFreeForPlop', () => {
    it('accepts empty buildable land', () => {
      expect(
        mirror.isFreeForPlop([
          { x: 1, z: 1 },
          { x: 2, z: 1 },
        ]),
      ).toBe(true);
    });

    it('rejects out-of-bounds, water, road, and building tiles', () => {
      expect(mirror.isFreeForPlop([{ x: -1, z: 0 }])).toBe(false);
      expect(mirror.isFreeForPlop([{ x: SIZE, z: 0 }])).toBe(false);
      expect(mirror.isFreeForPlop([{ x: 5, z: 5 }])).toBe(false); // water
      mirror.applyRoadDeltas([{ x: 6, z: 6, tier: RoadTier.TwoLane, mask: 0 }]);
      expect(mirror.isFreeForPlop([{ x: 6, z: 6 }])).toBe(false); // road
      mirror.applyBuildingDelta(
        { added: [instance(1, 20, 20, 0)], removed: [], updated: [] },
        entryFor,
      );
      expect(mirror.isFreeForPlop([{ x: 20, z: 20 }])).toBe(false); // building
      // A mixed set fails as a whole.
      expect(
        mirror.isFreeForPlop([
          { x: 1, z: 1 },
          { x: 20, z: 20 },
        ]),
      ).toBe(false);
    });
  });
});
