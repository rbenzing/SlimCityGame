import { describe, expect, it } from 'vitest';
import { MAP_SIZE, MAP_TILES, tileIndex } from '../../src/shared/constants';
import { RoadTier } from '../../src/shared/types';
import type { MapData } from '../../src/shared/types';
import { GROUND_HUGGING_LIFT_M } from '../../src/world/grid';
import { latestSaveGrid, makeHarness, roadRow, run } from '../support/sim';
import { guardRoadNetwork } from '../support/guard';

guardRoadNetwork();

/** Ground that rises 1.2 m per tile eastward: a run along it is lifted a little more each tile. */
const groundAt = (x: number): number => 100 + 1.2 * x;

function mapOf(): MapData {
  const height = new Float32Array(MAP_TILES);
  for (let z = 0; z < MAP_SIZE; z++) {
    for (let x = 0; x < MAP_SIZE; x++) height[tileIndex(x, z)] = groundAt(x);
  }
  return {
    name: 'Slope',
    size: MAP_SIZE,
    height,
    water: new Uint8Array(MAP_TILES),
    trees: new Uint8Array(MAP_TILES),
    seaLevel: 0,
    spawn: { x: MAP_SIZE / 2, z: MAP_SIZE / 2 },
  };
}

describe('the ground under a deck is never levelled', () => {
  const tiles = roadRow(50, 60, 12);

  function laid() {
    const h = makeHarness();
    h.sim.handleMessage({ type: 'init', seed: 1337, map: mapOf() });
    run(h, 1, [{ kind: 'setSandbox', on: true }]);
    expect(run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles, elevation: 6 }]).ok).toBe(
      true,
    );
    h.sim.handleMessage({ type: 'requestSave' });
    const grid = latestSaveGrid(h);
    return tiles.map((t) => {
      const i = tileIndex(t.x, t.z);
      return { lift: grid.roadElevation[i]!, moved: grid.height[i]! - groundAt(t.x) };
    });
  }

  it('keeps the ground under every tile lifted half a metre or more', () => {
    const decks = laid().filter((t) => t.lift >= GROUND_HUGGING_LIFT_M);
    expect(decks.length).toBeGreaterThan(0);
    for (const t of decks) expect(t.moved).toBeCloseTo(0, 4);
  });

  it('levels a tile lifted less than half a metre with its run, as any grounded tile', () => {
    const levelled = laid().filter((t) => t.lift < GROUND_HUGGING_LIFT_M && t.moved !== 0);
    expect(levelled.length).toBeGreaterThan(0);
  });
});
