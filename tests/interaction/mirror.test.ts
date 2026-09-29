import { describe, expect, it } from 'vitest';
import { MAP_SIZE } from '../../src/shared/constants';
import { RoadTier } from '../../src/shared/types';
import type { GridState } from '../../src/shared/types';
import { ClientGridMirror } from '../../src/app/clientgrid';
import { deriveRoadFootprint } from '../../src/world/freeroads';
import { computeZonableMask } from '../../src/world/zonable';
import {
  feedMirror,
  flatMap,
  latestSaveGrid,
  makeHarness,
  run,
  type Harness,
} from '../support/sim';
import { guardRoadNetwork } from '../support/guard';

guardRoadNetwork();

describe('ClientGridMirror — the roads off the grid, as the worker sends them', () => {
  const at = (x: number, z: number): { x: number; z: number } => ({ x: x * 100, z: z * 100 });

  function worldAndMirror(): { h: Harness; mirror: ClientGridMirror; saved: () => GridState } {
    const map = flatMap();
    const mirror = new ClientGridMirror(map);
    const h = makeHarness(feedMirror(mirror));
    h.sim.handleMessage({ type: 'init', seed: 1, map });
    run(h, 0, [{ kind: 'setSandbox', on: true }]);
    return {
      h,
      mirror,
      saved: () => {
        h.sim.handleMessage({ type: 'requestSave' });
        const grid = latestSaveGrid(h);
        deriveRoadFootprint(grid, grid.roads!, () => null);
        return grid;
      },
    };
  }

  const sum = (a: Uint8Array): number => a.reduce((n, v) => n + v, 0);

  it('reads the frontage and the footprint of a free road exactly as zone painting does', () => {
    const { h, mirror, saved } = worldAndMirror();
    const ack = run(h, 1, [
      {
        kind: 'buildSegment',
        tier: RoadTier.TwoLane,
        a: at(1000, 1000),
        b: at(1200, 1200),
        control: at(1200, 1000),
      },
    ]);
    expect(ack.ok).toBe(true);
    const world = saved();
    expect(sum(mirror.roadFootprint)).toBeGreaterThan(0);
    expect(mirror.roadFootprint).toEqual(world.roadFootprint);
    const seen = computeZonableMask(mirror);
    expect(sum(seen)).toBeGreaterThan(0);
    expect(seen).toEqual(computeZonableMask(world));
    // Nothing is plopped on the road itself.
    const i = mirror.roadFootprint.indexOf(1);
    expect(mirror.isFreeForPlop([{ x: i % MAP_SIZE, z: Math.floor(i / MAP_SIZE) }])).toBe(false);

    // Undone, the road leaves the mirror too.
    run(h, 2, ack.inverse);
    expect(sum(mirror.roadFootprint)).toBe(0);
    expect(sum(computeZonableMask(mirror))).toBe(0);
  });

  it('counts every tile a free road covers as occupied, and none once it is gone', () => {
    const { h, mirror } = worldAndMirror();
    const ack = run(h, 1, [
      {
        kind: 'buildSegment',
        tier: RoadTier.TwoLane,
        a: at(1000, 1000),
        b: at(1200, 1200),
        control: at(1200, 1000),
      },
    ]);
    expect(ack.ok).toBe(true);
    const occupied = new Set(mirror.occupiedTiles().map((t) => t.z * MAP_SIZE + t.x));
    const covered = [...mirror.roadFootprint.keys()].filter((i) => mirror.roadFootprint[i] === 1);
    expect(covered.length).toBeGreaterThan(0);
    for (const i of covered) expect(occupied.has(i)).toBe(true);
    run(h, 2, ack.inverse);
    expect(mirror.occupiedTiles()).toEqual([]);
  });
});
