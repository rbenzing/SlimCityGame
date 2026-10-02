import { describe, expect, it } from 'vitest';
import { tileIndex } from '../../src/shared/constants';
import { Problem, RoadTier, ZoneType } from '../../src/shared/types';
import {
  column,
  initialized,
  latestSaveGrid,
  pondAndDrain,
  roadRow,
  run,
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

describe('zoning down a gravel road, which carries no power', () => {
  /** A street with a turbine, a tower and a drain on it, a gravel road south off it, and homes zoned down the gravel. */
  function townDownAGravelRoad(drain = true): Harness {
    const h = initialized();
    const ack = run(h, 1, [
      { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(60, 49, 21) },
      { kind: 'buildRoad', tier: RoadTier.Gravel, tiles: column(70, 50, 10) },
      { kind: 'placeBuilding', catalogId: 'wind-turbine', x: 60, z: 48, rotation: 0 },
      { kind: 'placeBuilding', catalogId: 'water-tower', x: 62, z: 47, rotation: 0 },
      ...(drain ? pondAndDrain({ x: 64, z: 47 }, { x: 64, z: 48 }) : []),
      { kind: 'paintZone', zone: ZoneType.ResLow, tiles: column(71, 50, 10) },
    ]);
    expect(ack.ok).toBe(true);
    h.ticks(4);
    return h;
  }

  it('reports the zoned tiles the gravel leaves without power, and where the first is', () => {
    const snap = townDownAGravelRoad().lastSnapshot()!;
    // The tile on the street corner takes its power from the street.
    expect(snap.zonedUnserved).toEqual({
      power: 9,
      water: 0,
      sewer: 0,
      powerAt: { x: 71, z: 51 },
    });
  });

  it('reports nothing once a power line runs along the gravel', () => {
    const h = townDownAGravelRoad();
    expect(run(h, 2, [{ kind: 'stringPowerLine', tiles: column(72, 50, 10), on: true }]).ok).toBe(
      true,
    );
    h.ticks(4);
    expect(h.lastSnapshot()!.zonedUnserved).toEqual({ power: 0, water: 0, sewer: 0 });
  });

  it('reports the one tile on the mains with no drain, and not the nine on septic tanks', () => {
    const snap = townDownAGravelRoad(false).lastSnapshot()!;
    // The corner tile is on the street's main, so it is on its sewer too, and
    // nothing drains it; the tiles down the gravel are on wells and septic tanks.
    expect(snap.zonedUnserved).toEqual({
      power: 9,
      water: 0,
      sewer: 1,
      powerAt: { x: 71, z: 51 },
      sewerAt: { x: 71, z: 50 },
    });
  });
});

describe('a grid too small for its city — the snapshot says what growth waits for', () => {
  it('reports nothing waiting in a city with room to grow', () => {
    const h = initialized();
    h.ticks(2);
    expect(h.lastSnapshot()!.growthWaiting).toEqual({ power: 0, water: 0, sewer: 0 });
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
      ...pondAndDrain({ x: 64, z: 47 }, { x: 64, z: 48 }),
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
    expect(snap.growthWaiting!.sewer).toBe(0);
  });
});

describe('water and sewage on pipes', () => {
  /**
   * A street with power and a tower on it, a pond dug three tiles off the
   * street with a drain on its bank, and homes zoned along the street. The
   * drain touches no street, so only a pipe can join it to the mains.
   */
  function townWithADrainOffTheStreet(): Harness {
    const h = initialized();
    const ack = run(h, 1, [
      { kind: 'setSandbox', on: true },
      { kind: 'setUnlimitedMoney', on: true },
      { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(60, 49, 21) },
      { kind: 'placeBuilding', catalogId: 'wind-turbine', x: 60, z: 48, rotation: 0 },
      { kind: 'placeBuilding', catalogId: 'water-tower', x: 62, z: 47, rotation: 0 },
      ...pondAndDrain({ x: 66, z: 44 }, { x: 66, z: 45 }),
      { kind: 'paintZone', zone: ZoneType.ResLow, tiles: roadRow(60, 50, 20) },
    ]);
    expect(ack.ok).toBe(true);
    h.ticks(4);
    return h;
  }

  it('leaves a drain off the street stranded, and the street without a sewer, until a pipe joins them', () => {
    const h = townWithADrainOffTheStreet();
    let snap = h.lastSnapshot()!;
    expect(snap.stats.sewerSupply).toBe(3785);
    expect(snap.zonedUnserved!.sewer).toBe(20);
    expect(snap.zonedUnserved!.water).toBe(0);

    // Two tiles of pipe from the drain's bank to the street.
    const ack = run(h, 2, [{ kind: 'layWaterPipe', tiles: column(66, 46, 3), on: true }]);
    expect(ack.ok).toBe(true);
    expect(ack.cost).toBe(3 * 12);
    h.ticks(4);
    snap = h.lastSnapshot()!;
    expect(snap.zonedUnserved!.sewer).toBe(0);
    expect(snap.waterPipes).toBeUndefined(); // the patch travelled on an earlier snapshot
    h.sim.handleMessage({ type: 'requestSave' });
    const g = latestSaveGrid(h);
    for (let z = 46; z <= 48; z++) expect(g.waterPipe[tileIndex(66, z)]).toBe(1);
  });

  it('charges only the tiles that change, pulls the pipe up with the bulldozer, and puts it back on undo', () => {
    const h = townWithADrainOffTheStreet();
    run(h, 2, [{ kind: 'layWaterPipe', tiles: column(66, 46, 3), on: true }]);
    // Laying over a laid run costs nothing and changes nothing.
    const again = run(h, 3, [{ kind: 'layWaterPipe', tiles: column(66, 46, 3), on: true }]);
    expect(again.ok).toBe(false);
    expect(again.cost).toBe(0);

    const dozed = run(h, 4, [{ kind: 'bulldoze', tiles: [{ x: 66, z: 47 }] }]);
    expect(dozed.ok).toBe(true);
    h.ticks(4);
    expect(h.lastSnapshot()!.zonedUnserved!.sewer).toBe(20);
    expect(dozed.inverse.some((c) => c.kind === 'layWaterPipe' && c.on)).toBe(true);

    const undone = run(h, 5, dozed.inverse);
    expect(undone.ok).toBe(true);
    h.ticks(4);
    expect(h.lastSnapshot()!.zonedUnserved!.sewer).toBe(0);
  });

  it('refuses a pipe on water and on a building, and a drain or a pumping station off the shore', () => {
    const h = townWithADrainOffTheStreet();
    expect(run(h, 2, [{ kind: 'layWaterPipe', tiles: [{ x: 66, z: 44 }], on: true }]).ok).toBe(
      false,
    );
    expect(run(h, 3, [{ kind: 'layWaterPipe', tiles: [{ x: 62, z: 47 }], on: true }]).ok).toBe(
      false,
    );
    expect(
      run(h, 4, [{ kind: 'placeBuilding', catalogId: 'water-drain', x: 70, z: 45, rotation: 0 }])
        .ok,
    ).toBe(false);
    expect(
      run(h, 5, [{ kind: 'placeBuilding', catalogId: 'water-pump', x: 70, z: 45, rotation: 0 }]).ok,
    ).toBe(false);
    // On the pond's other bank, both stand.
    expect(
      run(h, 6, [{ kind: 'placeBuilding', catalogId: 'water-pump', x: 67, z: 43, rotation: 0 }]).ok,
    ).toBe(true);
  });
});
