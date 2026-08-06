import { describe, expect, it } from 'vitest';
import { RoadTier, type GridState } from '../shared/types';
import {
  LANDFILL_CAPACITY_PER_TILE,
  TRASH_EMIT_COM,
  TRASH_EMIT_IND,
  tileIndex,
} from '../shared/constants';
import { createGrid } from '../world/grid';
import { GarbageSystem, type GarbageBuilding, type GarbageFacility } from './garbage';

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

const IND: GarbageBuilding = { id: 7, sector: 'ind', level: 1 };

/** baseWorld with the landfill removed and an incinerator footprint at (11,25). */
function incinWorld(): { g: GridState; buildingTile: number; incinId: number } {
  const { g, buildingTile } = baseWorld();
  g.landfill.fill(0); // isolate the incinerator as the only collector
  const incinId = 20;
  g.buildingId[tileIndex(11, 25)] = incinId; // 1 tile off the road column
  return { g, buildingTile, incinId };
}

const facility = (over: Partial<GarbageFacility> = {}): GarbageFacility => ({
  id: 20,
  collectionRange: 40,
  bufferCapacity: 400000,
  burnRate: 2,
  ...over,
});

describe('GarbageSystem incinerators', () => {
  it('collects covered trash into its buffer then burns burnRate off the top', () => {
    const { g, buildingTile, incinId } = incinWorld();
    const sys = new GarbageSystem(g.size);

    sys.tick(g, [COM], [facility({ burnRate: 2 })]);

    // COM emitted TRASH_EMIT_COM; all collected into the buffer, then 2 burned.
    expect(sys.incineratorStored(incinId)).toBe(TRASH_EMIT_COM - 2);
    expect(sys.incineratorBurnedLast(incinId)).toBe(2);
    expect(sys.trash[buildingTile]).toBe(0);
  });

  it('stops collecting when its buffer is full; trash backs up but it keeps its cap', () => {
    const { g, buildingTile, incinId } = incinWorld();
    const sys = new GarbageSystem(g.size);
    const cap = 2 * TRASH_EMIT_IND;
    const f = facility({ burnRate: 0, bufferCapacity: cap }); // pure store → fills fast

    for (let i = 0; i < 6; i++) sys.tick(g, [IND], [f]);

    expect(sys.incineratorStored(incinId)).toBe(cap); // capped, never exceeds
    expect(sys.trash[buildingTile]).toBeGreaterThan(0); // collection stopped → backs up
  });

  it('is a permanent fix when burn >= inflow — buffer stays empty, nothing backs up', () => {
    const { g, buildingTile, incinId } = incinWorld();
    const sys = new GarbageSystem(g.size);
    const f = facility({ burnRate: 1000 }); // >> per-pass inflow

    for (let i = 0; i < 20; i++) sys.tick(g, [COM], [f]);

    expect(sys.incineratorStored(incinId)).toBe(0);
    expect(sys.incineratorBurnedLast(incinId)).toBe(TRASH_EMIT_COM);
    expect(sys.trash[buildingTile]).toBe(0);
  });

  it("drops a removed incinerator's buffer", () => {
    const { g, incinId } = incinWorld();
    const sys = new GarbageSystem(g.size);

    sys.tick(g, [COM], [facility({ burnRate: 0 })]);
    expect(sys.incineratorStored(incinId)).toBeGreaterThan(0);

    sys.tick(g, [COM], []); // incinerator gone → buffer pruned
    expect(sys.incineratorStored(incinId)).toBe(0);
  });
});

describe('GarbageSystem save state', () => {
  it('round-trips landfill fill through serialize/restore', () => {
    const { g } = baseWorld();
    const sys = new GarbageSystem(g.size);
    for (let i = 0; i < 3; i++) sys.tick(g, [COM]);
    expect(sys.landfillStored()).toBeGreaterThan(0);

    const saved = sys.serializeState();
    expect(saved.incinerators).toHaveLength(0);

    const loaded = new GarbageSystem(g.size);
    loaded.reset();
    loaded.restoreState(saved);
    expect(loaded.landfillStored()).toBe(sys.landfillStored());
  });

  it('round-trips incinerator buffers through serialize/restore', () => {
    const { g, incinId } = incinWorld();
    const sys = new GarbageSystem(g.size);
    for (let i = 0; i < 3; i++) sys.tick(g, [IND], [facility({ burnRate: 0 })]);
    const stored = sys.incineratorStored(incinId);
    expect(stored).toBeGreaterThan(0);

    const saved = sys.serializeState();
    expect(saved.incinerators.find((e) => e.id === incinId)?.units).toBe(stored);

    const loaded = new GarbageSystem(g.size);
    loaded.reset();
    loaded.restoreState(saved);
    expect(loaded.incineratorStored(incinId)).toBe(stored);
  });

  it('ignores an absent save state (pre-Stage-A saves)', () => {
    const { g } = baseWorld();
    const sys = new GarbageSystem(g.size);
    sys.tick(g, [COM]);
    const before = sys.landfillStored();
    sys.restoreState(undefined); // no-op
    expect(sys.landfillStored()).toBe(before);
  });
});
