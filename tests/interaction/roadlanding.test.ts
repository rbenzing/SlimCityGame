import { describe, expect, it } from 'vitest';
import { RoadTier, MapGenerator } from '../../src/shared/types';
import type { TilePoint } from '../../src/shared/types';
import { generateMap } from '../../src/world/maps';
import { guardRoadNetwork } from '../support/guard';
import { makeHarness, roadRow, run } from '../support/sim';

guardRoadNetwork();

describe('a street laid in two drags up a hillside', () => {
  it('keeps the ground where its first deck lands, so the second drag joins it', () => {
    // On this hill the first drag's run-out levelling leaves a ledge, and the second drag climbs it on a
    // short deck; smoothing the ground the deck lands on used to move it a step too far for the deck.
    const map = generateMap(MapGenerator.Hills, 7, 'Hills');
    const h = makeHarness();
    h.sim.handleMessage({ type: 'init', seed: 7, map });
    const z = 78;
    expect(
      run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(30, z, 25) }]).ok,
    ).toBe(true);
    expect(
      run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(54, z, 25) }]).ok,
    ).toBe(true);
    const grid = (
      h.sim as unknown as { grid: { size: number; roadMask: Uint8Array; roadTier: Uint8Array } }
    ).grid;
    // Every tile of the street joins its east neighbour (mask bit 2) all the way along.
    const joined = (t: TilePoint): boolean =>
      ((grid.roadMask[t.z * grid.size + t.x] ?? 0) & 2) !== 0;
    for (const t of roadRow(30, z, 48)) expect(joined(t), `tile ${t.x} joins east`).toBe(true);
  });
});
