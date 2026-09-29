import { beforeEach, describe, expect, it } from 'vitest';
import { MAP_SIZE, MAP_TILES, START_FUNDS, tileIndex } from '../../src/shared/constants';
import { RoadTier } from '../../src/shared/types';
import type { GridState, MapData, TilePoint, WorkerToMain } from '../../src/shared/types';
import { createGrid } from '../../src/world/grid';
import { computeTerraformPatch, type TerraformCommand } from '../../src/world/terraform';
import {
  catalog,
  initialized,
  latestSaveGrid,
  makeHarness,
  roadRow,
  send,
  type Harness,
} from '../support/sim';
import { guardRoadNetwork } from '../support/guard';

guardRoadNetwork();

describe('terraform: landscaping the ground', () => {
  let h: Harness;
  beforeEach(() => {
    h = initialized();
  });

  it('applies a raise stroke: charges the kernel cost, debits funds, and acks a terraformSet inverse of the pre-edit heights', () => {
    const center = { x: 128, z: 128 };
    const cmd: TerraformCommand = {
      kind: 'terraform',
      mode: 'raise',
      center,
      radius: 4,
      strength: 3,
    };
    send(h, 1, [cmd]);
    h.ticks(2);

    // Oracle: an identical fresh flat grid (Flatland is a uniform 5m) run through the pure kernel directly.
    const oracleGrid = createGrid(MAP_SIZE);
    oracleGrid.height.fill(5);
    const expected = computeTerraformPatch(oracleGrid, cmd);
    expect(expected).not.toBeNull();

    const ack = h.ackFor(1)!;
    expect(ack.ok).toBe(true);
    expect(ack.cost).toBeGreaterThan(0);
    expect(ack.cost).toBeCloseTo(expected!.cost, 5);
    expect(h.lastSnapshot()!.stats.funds).toBeCloseTo(START_FUNDS - ack.cost, 5);

    expect(ack.inverse).toHaveLength(1);
    const inverse = ack.inverse[0]!;
    expect(inverse.kind).toBe('terraformSet');
    if (inverse.kind !== 'terraformSet') return;
    expect(inverse.x).toBe(expected!.inverse.x);
    expect(inverse.z).toBe(expected!.inverse.z);
    expect(inverse.w).toBe(expected!.inverse.w);
    expect(inverse.h).toBe(expected!.inverse.h);
    expect(Array.from(inverse.heights)).toEqual(Array.from(expected!.inverse.heights));
    // Flatland started at a uniform 5m, so every previous height in the inverse is exactly 5.
    expect(Array.from(inverse.heights).every((v) => v === 5)).toBe(true);
  });

  it('funds-gates a stroke that would cost more than the treasury holds, without mutating anything', () => {
    // Drain funds to exactly 0 with a 50x50 road block (2500 tiles * ¢20 = ¢50,000 = START_FUNDS).
    const tiles: TilePoint[] = [];
    for (let z = 0; z < 50; z++) {
      for (let x = 0; x < 50; x++) tiles.push({ x, z });
    }
    send(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles }]);
    h.ticks(2);
    expect(h.lastSnapshot()!.stats.funds).toBe(0);

    send(h, 2, [
      { kind: 'terraform', mode: 'raise', center: { x: 150, z: 150 }, radius: 4, strength: 3 },
    ]);
    h.ticks(2);

    const ack = h.ackFor(2)!;
    expect(ack.ok).toBe(false);
    expect(ack.reason).toBe('funds');
    expect(ack.inverse).toEqual([]);
    expect(h.lastSnapshot()!.stats.funds).toBe(0); // untouched

    const heightSnaps = h.messages.filter(
      (m): m is Extract<WorkerToMain, { type: 'snapshot' }> =>
        m.type === 'snapshot' && m.snap.heightPatches !== undefined,
    );
    expect(heightSnaps).toHaveLength(0); // nothing was ever queued for the renderer
  });

  it('rejects a brush that covers only structure-excluded tiles', () => {
    send(h, 1, [{ kind: 'placeBuilding', catalogId: 'wind-turbine', x: 60, z: 60, rotation: 0 }]);
    h.ticks(1);

    send(h, 2, [
      { kind: 'terraform', mode: 'raise', center: { x: 60, z: 60 }, radius: 1, strength: 3 },
    ]);
    h.ticks(1);

    const ack = h.ackFor(2)!;
    expect(ack.ok).toBe(false);
    expect(ack.reason).toBe('invalid');
  });

  it('undoes a terraform stroke exactly via the ack inverse, and the undo itself acks a redo inverse', () => {
    const center = { x: 90, z: 90 };
    send(h, 1, [{ kind: 'terraform', mode: 'raise', center, radius: 3, strength: 2 }]);
    h.ticks(2);
    const forwardAck = h.ackFor(1)!;
    expect(forwardAck.ok).toBe(true);

    // Height right after the raise: falloff 1 at the exact center -> 5 + 2*1*0.5 = 6.
    h.sim.handleMessage({ type: 'requestSave' });
    const afterRaise = latestSaveGrid(h);
    expect(afterRaise.height[tileIndex(center.x, center.z)]).toBeCloseTo(6, 5);

    send(h, 2, forwardAck.inverse);
    h.ticks(2);
    const undoAck = h.ackFor(2)!;
    expect(undoAck.ok).toBe(true);
    expect(undoAck.cost).toBe(0);
    expect(undoAck.inverse).toHaveLength(1);
    expect(undoAck.inverse[0]!.kind).toBe('terraformSet');

    h.sim.handleMessage({ type: 'requestSave' });
    const afterUndo = latestSaveGrid(h);
    expect(afterUndo.height[tileIndex(center.x, center.z)]).toBe(5); // exact restore, float-exact
  });

  it('carries the edited region in the next snapshot.heightPatches, then clears until the next edit', () => {
    const center = { x: 40, z: 200 };
    send(h, 1, [{ kind: 'terraform', mode: 'raise', center, radius: 3, strength: 2 }]);
    h.ticks(2);

    const withPatch = h.messages.find(
      (m): m is Extract<WorkerToMain, { type: 'snapshot' }> =>
        m.type === 'snapshot' && m.snap.heightPatches !== undefined,
    );
    expect(withPatch).toBeDefined();
    const patch = withPatch!.snap.heightPatches![0]!;
    expect(patch.w).toBe(7); // radius 3 -> 2*3+1, fully in-bounds
    expect(patch.h).toBe(7);
    expect(patch.heights).toHaveLength(patch.w * patch.h);

    const before = h.messages.length;
    h.ticks(6); // no further edits
    const later = h.messages.slice(before);
    expect(later.some((m) => m.type === 'snapshot' && m.snap.heightPatches !== undefined)).toBe(
      false,
    );
  });

  it('round-trips an edited height through requestSave/loadSave', () => {
    const center = { x: 200, z: 30 };
    send(h, 1, [{ kind: 'terraform', mode: 'raise', center, radius: 2, strength: 4 }]);
    h.ticks(2);

    h.sim.handleMessage({ type: 'requestSave' });
    const saved = latestSaveGrid(h);
    const editedHeight = saved.height[tileIndex(center.x, center.z)]!;
    expect(editedHeight).toBeCloseTo(5 + 4 * 1 * 0.5, 5); // falloff 1 at the exact center

    const saveMsg = [...h.messages].reverse().find((m) => m.type === 'save');
    expect(saveMsg).toBeDefined();
    if (!saveMsg || saveMsg.type !== 'save') return;

    const h2 = initialized();
    h2.sim.handleMessage({ type: 'loadSave', data: saveMsg.data });
    h2.ticks(2);

    h2.sim.handleMessage({ type: 'requestSave' });
    const reloaded = latestSaveGrid(h2);
    expect(reloaded.height[tileIndex(center.x, center.z)]).toBe(editedHeight); // exact, float-for-float

    // The post-load snapshot also republishes the whole grid as a heightPatches
    // full-map resync, exactly like roads/zones/power/watered.
    const postLoad = h2.messages.find(
      (m): m is Extract<WorkerToMain, { type: 'snapshot' }> =>
        m.type === 'snapshot' && m.snap.heightPatches !== undefined,
    );
    expect(postLoad).toBeDefined();
    const fullPatch = postLoad!.snap.heightPatches![0]!;
    expect(fullPatch.w).toBe(MAP_SIZE);
    expect(fullPatch.h).toBe(MAP_SIZE);
    expect(fullPatch.heights[tileIndex(center.x, center.z)]).toBe(editedHeight);
  });
});

describe('auto-flatten: the ground levels under a placed footprint', () => {
  const waterTower = catalog.find((e) => e.id === 'water-tower')!;

  /** Gentle 1-2m ripple (well under MAX_BUILD_SLOPE=4) so every tile is buildable, but varied enough that a footprint's mean differs from its individual tile heights. */
  function variedHeight(x: number, z: number): number {
    return 5 + ((x + z) % 3);
  }

  function variedMap(): MapData {
    const height = new Float32Array(MAP_TILES);
    for (let z = 0; z < MAP_SIZE; z++) {
      for (let x = 0; x < MAP_SIZE; x++) height[tileIndex(x, z)] = variedHeight(x, z);
    }
    return {
      name: 'Varied',
      size: MAP_SIZE,
      height,
      water: new Uint8Array(MAP_TILES),
      trees: new Uint8Array(MAP_TILES),
      seaLevel: 0,
      spawn: { x: MAP_SIZE / 2, z: MAP_SIZE / 2 },
    };
  }

  function initializedVaried(): Harness {
    const h = makeHarness();
    h.sim.handleMessage({ type: 'init', seed: 1337, map: variedMap() });
    return h;
  }

  it('placing a building on varied terrain flattens its whole footprint to the mean height and emits heightPatches', () => {
    const h = initializedVaried();
    const x = 50;
    const z = 60;
    const footprintTiles: TilePoint[] = [
      { x, z },
      { x: x + 1, z },
      { x, z: z + 1 },
      { x: x + 1, z: z + 1 },
    ];
    const mean =
      footprintTiles.reduce((sum, t) => sum + variedHeight(t.x, t.z), 0) / footprintTiles.length;
    // Sanity: the footprint really is varied (mean differs from at least one covered tile).
    expect(footprintTiles.some((t) => variedHeight(t.x, t.z) !== mean)).toBe(true);

    send(h, 1, [{ kind: 'placeBuilding', catalogId: 'water-tower', x, z, rotation: 0 }]);
    h.ticks(2);
    expect(h.ackFor(1)!.ok).toBe(true);

    const patchSnap = h.messages.find(
      (m): m is Extract<WorkerToMain, { type: 'snapshot' }> =>
        m.type === 'snapshot' && m.snap.heightPatches !== undefined,
    );
    expect(patchSnap).toBeDefined();

    h.sim.handleMessage({ type: 'requestSave' });
    const grid = latestSaveGrid(h);
    for (const t of footprintTiles) {
      expect(grid.height[tileIndex(t.x, t.z)]).toBeCloseTo(mean, 5);
    }
  });

  /** Linear ramp climbing along +x (slope 1m/tile, well under ROAD_MAX_SLOPE=10). */
  function rampMap(): MapData {
    const height = new Float32Array(MAP_TILES);
    for (let z = 0; z < MAP_SIZE; z++) {
      for (let x = 0; x < MAP_SIZE; x++) height[tileIndex(x, z)] = 5 + x;
    }
    return {
      name: 'Ramp',
      size: MAP_SIZE,
      height,
      water: new Uint8Array(MAP_TILES),
      trees: new Uint8Array(MAP_TILES),
      seaLevel: 0,
      spawn: { x: MAP_SIZE / 2, z: MAP_SIZE / 2 },
    };
  }

  function initializedRamp(): Harness {
    const h = makeHarness();
    h.sim.handleMessage({ type: 'init', seed: 1337, map: rampMap() });
    return h;
  }

  /**
   * Anti-poke invariant: after grading, no grass apron tile in `rect` ends up
   * higher than the max height of the road tiles it borders. Reads the live
   * grid directly (road + apron heights are both committed).
   */
  function assertNoApronPoke(
    grid: GridState,
    rect: { x0: number; z0: number; x1: number; z1: number },
  ): void {
    for (let z = rect.z0; z <= rect.z1; z++) {
      for (let x = rect.x0; x <= rect.x1; x++) {
        const idx = tileIndex(x, z);
        // Only grass tiles (no road/building/water) are apron shoulders.
        if (grid.roadTier[idx] !== RoadTier.None) continue;
        if (grid.buildingId[idx] !== 0) continue;
        if (grid.water[idx] !== 0) continue;
        let maxRoad = -Infinity;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dz === 0) continue;
            const nIdx = tileIndex(x + dx, z + dz);
            if (grid.roadTier[nIdx] !== RoadTier.None)
              maxRoad = Math.max(maxRoad, grid.height[nIdx]!);
          }
        }
        if (maxRoad === -Infinity) continue; // borders no road — not an apron tile
        expect(grid.height[idx]!).toBeLessThanOrEqual(maxRoad + 1e-5);
      }
    }
  }

  it('road grade pulls the apron down to the road it borders (never above) and skips apron tiles carrying another road', () => {
    const h = initializedVaried();

    // Seed road: an existing structure that will sit inside the next road's apron ring.
    send(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: [{ x: 106, z: 106 }] }]);
    h.ticks(1);
    expect(h.ackFor(1)!.ok).toBe(true);

    h.sim.handleMessage({ type: 'requestSave' });
    const beforeGrid = latestSaveGrid(h);
    const seedHeight = beforeGrid.height[tileIndex(106, 106)]!;

    // Second road, Chebyshev-adjacent to the seed tile so the seed sits in its apron ring.
    send(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: [{ x: 106, z: 107 }] }]);
    h.ticks(1);
    expect(h.ackFor(2)!.ok).toBe(true);

    h.sim.handleMessage({ type: 'requestSave' });
    const afterGrid = latestSaveGrid(h);

    // Core anti-poke guarantee across the whole touched region.
    assertNoApronPoke(afterGrid, { x0: 104, z0: 105, x1: 108, z1: 109 });

    // The seed road tile sits in the apron ring but is NOT grass, so it is
    // skipped: its height is untouched by the second command's grade.
    expect(afterGrid.height[tileIndex(106, 106)]).toBe(seedHeight);
  });

  it('road grade blends a new tile toward the existing road it joins (junction continuity)', () => {
    const h = initializedRamp();

    // Seed road up the ramp, then a tile joining it one step further up.
    send(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: [{ x: 120, z: 100 }] }]);
    h.ticks(1);
    send(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: [{ x: 121, z: 100 }] }]);
    h.ticks(1);
    expect(h.ackFor(2)!.ok).toBe(true);

    h.sim.handleMessage({ type: 'requestSave' });
    const grid = latestSaveGrid(h);
    const joinHeight = grid.height[tileIndex(121, 100)]!;
    const seedHeight = grid.height[tileIndex(120, 100)]!;
    // Junction continuity: the new tile box-smooths toward the existing road it
    // joins, so it meets the seed cleanly (no step up at the junction) rather
    // than sitting at its raw uphill height of 5 + 121 = 126.
    expect(joinHeight).toBeLessThan(5 + 121);
    expect(joinHeight).toBeCloseTo(seedHeight, 5);
  });

  it('road grade preserves a monotonic climb across a slope (no single plateau)', () => {
    const h = initializedRamp();
    send(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(120, 100, 4) }]);
    h.ticks(1);
    expect(h.ackFor(1)!.ok).toBe(true);

    h.sim.handleMessage({ type: 'requestSave' });
    const grid = latestSaveGrid(h);
    const hs = [120, 121, 122, 123].map((x) => grid.height[tileIndex(x, 100)]!);
    // Still a rising ramp — NOT all equal (the old mean-flatten made a plateau).
    expect(new Set(hs).size).toBeGreaterThan(1);
    for (let i = 1; i < hs.length; i++) expect(hs[i]!).toBeGreaterThan(hs[i - 1]!);
    assertNoApronPoke(grid, { x0: 118, z0: 98, x1: 125, z1: 102 });
  });

  it('two connecting runs on a slope: the join tile lands between the runs and no apron pokes through', () => {
    // Diagonal ramp: height rises with x+z so BOTH runs climb.
    const height = new Float32Array(MAP_TILES);
    for (let z = 0; z < MAP_SIZE; z++) {
      for (let x = 0; x < MAP_SIZE; x++) height[tileIndex(x, z)] = 5 + (x + z);
    }
    const map: MapData = {
      name: 'DiagRamp',
      size: MAP_SIZE,
      height,
      water: new Uint8Array(MAP_TILES),
      trees: new Uint8Array(MAP_TILES),
      seaLevel: 0,
      spawn: { x: MAP_SIZE / 2, z: MAP_SIZE / 2 },
    };
    const h = makeHarness();
    h.sim.handleMessage({ type: 'init', seed: 1337, map });

    // Straight run along +x at z=100, then a perpendicular run joining it at
    // (122,100), climbing in +z.
    send(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(120, 100, 5) }]);
    h.ticks(1);
    send(h, 2, [
      {
        kind: 'buildRoad',
        tier: RoadTier.TwoLane,
        tiles: [
          { x: 122, z: 101 },
          { x: 122, z: 102 },
          { x: 122, z: 103 },
        ],
      },
    ]);
    h.ticks(1);
    expect(h.ackFor(2)!.ok).toBe(true);

    h.sim.handleMessage({ type: 'requestSave' });
    const grid = latestSaveGrid(h);

    // Continuity: the join tile (122,101) blends the run-1 tile it touches
    // (122,100) and its own uphill run-2 continuation (122,102) — so its
    // graded height sits strictly between those two neighbours' road heights.
    const join = grid.height[tileIndex(122, 101)]!;
    const run1Neighbor = grid.height[tileIndex(122, 100)]!;
    const run2Neighbor = grid.height[tileIndex(122, 102)]!;
    const lo = Math.min(run1Neighbor, run2Neighbor);
    const hi = Math.max(run1Neighbor, run2Neighbor);
    expect(join).toBeGreaterThanOrEqual(lo - 1e-5);
    expect(join).toBeLessThanOrEqual(hi + 1e-5);

    assertNoApronPoke(grid, { x0: 118, z0: 98, x1: 126, z1: 105 });
  });

  it('skips apron tiles that are water: they are neither leveled nor pulled down', () => {
    const height = new Float32Array(MAP_TILES).fill(5);
    const water = new Uint8Array(MAP_TILES);
    const wx = 150;
    const wz = 150;
    height[tileIndex(wx, wz)] = -1; // below SEA_LEVEL(0)
    water[tileIndex(wx, wz)] = 1;
    // Every OTHER ring tile of the build site is raised to 8, so the apron
    // shoulders start well above the road and must be pulled DOWN to it.
    const bx = 151;
    const bz = 151;
    for (let z = bz - 1; z <= bz + 1; z++) {
      for (let x = bx - 1; x <= bx + 1; x++) {
        if (x === bx && z === bz) continue;
        if (x === wx && z === wz) continue; // leave the water tile at -1
        height[tileIndex(x, z)] = 8;
      }
    }
    const map: MapData = {
      name: 'WaterNeighbor',
      size: MAP_SIZE,
      height,
      water,
      trees: new Uint8Array(MAP_TILES),
      seaLevel: 0,
      spawn: { x: MAP_SIZE / 2, z: MAP_SIZE / 2 },
    };
    const h = makeHarness();
    h.sim.handleMessage({ type: 'init', seed: 1337, map });

    send(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: [{ x: bx, z: bz }] }]);
    h.ticks(1);
    expect(h.ackFor(1)!.ok).toBe(true);

    h.sim.handleMessage({ type: 'requestSave' });
    const grid = latestSaveGrid(h);

    // Lone road tile: no road-source neighbors, so it keeps its own height (5).
    expect(grid.height[tileIndex(bx, bz)]).toBeCloseTo(5, 5);
    // Grass apron shoulders (were 8): pulled DOWN to the road height (5).
    for (let z = bz - 1; z <= bz + 1; z++) {
      for (let x = bx - 1; x <= bx + 1; x++) {
        if (x === wx && z === wz) continue;
        if (x === bx && z === bz) continue;
        expect(grid.height[tileIndex(x, z)]).toBeCloseTo(5, 5);
      }
    }
    // The water tile itself: untouched height, still marked water.
    expect(grid.height[tileIndex(wx, wz)]).toBe(-1);
    expect(grid.water[tileIndex(wx, wz)]).toBe(1);
  });

  it('undo (ack.inverse) restores exact pre-placement heights for a road build + apron flatten', () => {
    const h = initializedVaried();
    const tiles = roadRow(120, 120, 4);

    const region: TilePoint[] = [];
    for (let z = 119; z <= 121; z++) {
      for (let x = 119; x <= 124; x++) region.push({ x, z });
    }
    h.sim.handleMessage({ type: 'requestSave' });
    const before = latestSaveGrid(h);
    const beforeHeights = new Map(
      region.map((t) => [tileIndex(t.x, t.z), before.height[tileIndex(t.x, t.z)]!]),
    );

    send(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles }]);
    h.ticks(1);
    const ack = h.ackFor(1)!;
    expect(ack.ok).toBe(true);
    expect(ack.inverse.some((c) => c.kind === 'terraformSet')).toBe(true);

    // Sanity: the flatten really did change something in the region.
    h.sim.handleMessage({ type: 'requestSave' });
    const afterBuild = latestSaveGrid(h);
    const anyChanged = region.some(
      (t) => afterBuild.height[tileIndex(t.x, t.z)] !== beforeHeights.get(tileIndex(t.x, t.z)),
    );
    expect(anyChanged).toBe(true);

    send(h, 2, ack.inverse);
    h.ticks(2);
    expect(h.ackFor(2)!.ok).toBe(true);

    h.sim.handleMessage({ type: 'requestSave' });
    const afterUndo = latestSaveGrid(h);
    for (const t of region) {
      expect(afterUndo.height[tileIndex(t.x, t.z)]).toBe(beforeHeights.get(tileIndex(t.x, t.z)));
    }
  });

  it('undo (ack.inverse) restores exact pre-placement heights for a flattened building footprint', () => {
    const h = initializedVaried();
    const x = 30;
    const z = 40;

    h.sim.handleMessage({ type: 'requestSave' });
    const before = latestSaveGrid(h);
    const footprintTiles: TilePoint[] = [
      { x, z },
      { x: x + 1, z },
      { x, z: z + 1 },
      { x: x + 1, z: z + 1 },
    ];
    const beforeHeights = footprintTiles.map((t) => before.height[tileIndex(t.x, t.z)]!);

    send(h, 1, [{ kind: 'placeBuilding', catalogId: 'water-tower', x, z, rotation: 0 }]);
    h.ticks(2);
    const ack = h.ackFor(1)!;
    expect(ack.ok).toBe(true);
    expect(ack.cost).toBe(waterTower.cost);
    expect(ack.inverse.some((c) => c.kind === 'terraformSet')).toBe(true);
    expect(ack.inverse.some((c) => c.kind === 'bulldoze')).toBe(true);

    send(h, 2, ack.inverse);
    h.ticks(2);
    expect(h.ackFor(2)!.ok).toBe(true);

    h.sim.handleMessage({ type: 'requestSave' });
    const afterUndo = latestSaveGrid(h);
    footprintTiles.forEach((t, i) => {
      expect(afterUndo.height[tileIndex(t.x, t.z)]).toBe(beforeHeights[i]);
      expect(afterUndo.buildingId[tileIndex(t.x, t.z)]).toBe(0); // structure removal replayed too
    });
  });

  it('is deterministic: identical placement on two independent sims yields bit-identical flattened heights (no Math.random)', () => {
    const h1 = initializedVaried();
    const h2 = initializedVaried();
    send(h1, 1, [{ kind: 'placeBuilding', catalogId: 'water-tower', x: 80, z: 90, rotation: 0 }]);
    send(h2, 1, [{ kind: 'placeBuilding', catalogId: 'water-tower', x: 80, z: 90, rotation: 0 }]);
    h1.ticks(2);
    h2.ticks(2);

    h1.sim.handleMessage({ type: 'requestSave' });
    h2.sim.handleMessage({ type: 'requestSave' });
    const g1 = latestSaveGrid(h1);
    const g2 = latestSaveGrid(h2);
    for (let z = 89; z <= 92; z++) {
      for (let x = 79; x <= 82; x++) {
        expect(g1.height[tileIndex(x, z)]).toBe(g2.height[tileIndex(x, z)]);
      }
    }
  });

  it('is deterministic: identical road builds on two independent sims yield bit-identical graded heights (no Math.random)', () => {
    const h1 = initializedVaried();
    const h2 = initializedVaried();
    send(h1, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(80, 90, 5) }]);
    send(h2, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(80, 90, 5) }]);
    h1.ticks(2);
    h2.ticks(2);

    h1.sim.handleMessage({ type: 'requestSave' });
    h2.sim.handleMessage({ type: 'requestSave' });
    const g1 = latestSaveGrid(h1);
    const g2 = latestSaveGrid(h2);
    for (let z = 88; z <= 92; z++) {
      for (let x = 78; x <= 86; x++) {
        expect(g1.height[tileIndex(x, z)]).toBe(g2.height[tileIndex(x, z)]);
      }
    }
  });
});
