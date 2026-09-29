import { describe, expect, it } from 'vitest';
import { tileIndex } from '../../src/shared/constants';
import { Problem, RoadTier, ZoneType } from '../../src/shared/types';
import {
  initialized,
  latestSaveGrid,
  roadRow,
  send,
  waterTowerEntry,
  type Harness,
} from '../support/sim';
import { guardRoadNetwork } from '../support/guard';

guardRoadNetwork();

describe('a generator that cannot deliver says so', () => {
  /** Every problems reading the snapshots ever carried for `id`, in order. */
  function problemsSeen(h: Harness, id: number): number[] {
    const seen: number[] = [];
    for (const m of h.messages) {
      if (m.type !== 'snapshot' || !m.snap.buildings) continue;
      for (const b of [...m.snap.buildings.added, ...m.snap.buildings.updated]) {
        if (b.id === id) seen.push(b.problems);
      }
    }
    return seen;
  }

  /** The id the placement stamped, read back off the grid the worker saved. */
  function placedId(h: Harness, x: number, z: number): number {
    h.sim.handleMessage({ type: 'requestSave' });
    return latestSaveGrid(h).buildingId[tileIndex(x, z)]!;
  }

  it('tells the mirror a stranded water tower is cut off, so the advisor can count it', () => {
    const h = initialized();
    send(h, 1, [{ kind: 'placeBuilding', catalogId: 'water-tower', x: 80, z: 90, rotation: 0 }]);
    h.ticks(30);
    expect(h.ackFor(1)!.ok).toBe(true);

    const id = placedId(h, 80, 90);
    const seen = problemsSeen(h, id);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]! & Problem.NoRoad).toBe(Problem.NoRoad);
    // The figure it contributes is untouched: the point is that it is visible.
    expect(h.lastSnapshot()!.stats.waterSupply).toBe(waterTowerEntry.utility!.waterKL);
  });

  it('says nothing about a tower the street reaches', () => {
    const h = initialized();
    send(h, 1, [
      { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(78, 90, 12) },
      { kind: 'placeBuilding', catalogId: 'water-tower', x: 80, z: 91, rotation: 0 },
    ]);
    h.ticks(30);

    const id = placedId(h, 80, 91);
    for (const problems of problemsSeen(h, id)) {
      expect(problems & Problem.NoRoad).toBe(0);
    }
  });
});

describe('a grid too small for its city — the snapshot says what growth waits for', () => {
  it('reports nothing waiting in a city with room to grow', () => {
    const h = initialized();
    h.ticks(2);
    expect(h.lastSnapshot()!.growthWaiting).toEqual({ power: 0, water: 0 });
  });

  it('counts the zoned lots a full grid holds back', () => {
    const h = initialized();
    send(h, 1, [
      { kind: 'setSandbox', on: true },
      { kind: 'setUnlimitedMoney', on: true },
      { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(60, 49, 30) },
    ]);
    h.ticks(1);
    send(h, 2, [
      { kind: 'placeBuilding', catalogId: 'wind-turbine', x: 60, z: 48, rotation: 0 },
      { kind: 'placeBuilding', catalogId: 'water-tower', x: 62, z: 47, rotation: 0 },
      // 8 MW on a 6 MW grid: nothing is spare for anyone else.
      { kind: 'placeBuilding', catalogId: 'airport', x: 70, z: 43, rotation: 0 },
      {
        kind: 'paintZone',
        zone: ZoneType.ResLow,
        tiles: [...roadRow(60, 50, 30), ...roadRow(60, 51, 30)],
      },
    ]);
    h.ticks(2);
    expect(h.ackFor(2)!.ok).toBe(true);

    h.ticks(400); // longer than one sweep of the spawn scan
    const snap = h.lastSnapshot()!;
    expect(snap.stats.powerDemand).toBeGreaterThan(snap.stats.powerSupply);
    expect(snap.growthWaiting!.power).toBeGreaterThan(0);
    expect(snap.growthWaiting!.water).toBe(0);
  });
});
