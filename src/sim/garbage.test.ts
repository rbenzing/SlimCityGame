import { describe, expect, it } from 'vitest';
import { RoadTier, type GridState } from '../shared/types';
import {
  LANDFILL_CAPACITY_PER_TILE,
  TRASH_EMIT_COM,
  TRASH_EMIT_IND,
  tileIndex,
} from '../shared/constants';
import { createGrid } from '../world/grid';
import { GarbageSystem, type GarbageBuilding } from './garbage';

/**
 * A full MAP_SIZE grid with a vertical road column x=10 (z 10..40), a 2-tile
 * landfill area beside it, and a commercial building within collection range.
 * (Uses createGrid() default size because the reused services road-BFS assumes
 * MAP_SIZE.)
 */
function baseWorld(): { g: GridState; buildingTile: number } {
  const g = createGrid();
  for (let z = 10; z <= 40; z++) g.roadTier[tileIndex(10, z)] = RoadTier.TwoLane;
  g.landfill[tileIndex(11, 20)] = 1;
  g.landfill[tileIndex(12, 20)] = 1;
  const buildingTile = tileIndex(9, 22); // 1 tile off the road → within radiate range
  g.buildingId[buildingTile] = 7;
  return { g, buildingTile };
}

const COM: GarbageBuilding = { id: 7, sector: 'com', level: 1 };

describe('GarbageSystem', () => {
  it('generates trash on a building then collects it into a road-connected landfill', () => {
    const { g, buildingTile } = baseWorld();
    const sys = new GarbageSystem(g.size);

    sys.tick(g, [COM]);

    // The com building emitted TRASH_EMIT_COM units, all collected into the landfill.
    expect(sys.landfillStored()).toBe(TRASH_EMIT_COM);
    expect(sys.trash[buildingTile]).toBe(0);
    expect(sys.landfillFillFraction(g)).toBeGreaterThan(0);
    expect(sys.isLandfillFull(g)).toBe(false);
  });

  it('leaves trash uncollected for a building outside every landfill service radius', () => {
    const { g } = baseWorld();
    const farTile = tileIndex(200, 200); // nowhere near the road/landfill
    g.buildingId[farTile] = 8;
    const sys = new GarbageSystem(g.size);

    sys.tick(g, [COM, { id: 8, sector: 'com', level: 1 }]);

    expect(sys.trash[farTile]).toBeGreaterThan(0); // generated but never collected
  });

  it('does not collect when no landfill is painted (trash just accumulates)', () => {
    const { g, buildingTile } = baseWorld();
    g.landfill.fill(0); // remove the area
    const sys = new GarbageSystem(g.size);

    sys.tick(g, [COM]);

    expect(sys.landfillStored()).toBe(0);
    expect(sys.trash[buildingTile]).toBe(TRASH_EMIT_COM);
  });

  it('stops collecting once the landfill area is full; trash then backs up on buildings', () => {
    const { g, buildingTile } = baseWorld();
    const capacity = 2 * LANDFILL_CAPACITY_PER_TILE; // 2 painted tiles
    const sys = new GarbageSystem(g.size);
    const IND: GarbageBuilding = { id: 7, sector: 'ind', level: 1 };

    // Enough passes to overfill: each pass collects up to TRASH_EMIT_IND units.
    const passes = Math.ceil(capacity / TRASH_EMIT_IND) + 10;
    for (let i = 0; i < passes; i++) sys.tick(g, [IND]);

    expect(sys.landfillStored()).toBe(capacity); // capped, never exceeds capacity
    expect(sys.isLandfillFull(g)).toBe(true);
    expect(sys.landfillFillFraction(g)).toBe(1);
    expect(sys.trash[buildingTile]).toBeGreaterThan(0); // collection stopped → backs up
  });

  it('is deterministic — identical inputs give identical stored totals', () => {
    const a = baseWorld();
    const b = baseWorld();
    const sysA = new GarbageSystem(a.g.size);
    const sysB = new GarbageSystem(b.g.size);
    for (let i = 0; i < 5; i++) {
      sysA.tick(a.g, [COM]);
      sysB.tick(b.g, [COM]);
    }
    expect(sysA.landfillStored()).toBe(sysB.landfillStored());
  });
});
