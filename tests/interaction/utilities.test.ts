import { describe, expect, it } from 'vitest';
import { SEWER_MILESTONE, tileIndex } from '../../src/shared/constants';
import { Problem, RoadTier, ZoneType } from '../../src/shared/types';
import {
  GROWTH_TIMEOUT_MS,
  column,
  initialized,
  initializedAtMilestone,
  latestSaveGrid,
  pondAndDrain,
  roadRow,
  rows,
  run,
  send,
  standingBuildings,
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

describe('a wind turbine keeps its rotor out of its neighbour’s', () => {
  it('refuses a second turbine with fewer than three clear tiles between, in any direction, and takes one at three', () => {
    const h = initialized();
    const turbine = (x: number, z: number) =>
      run(h, x * 1000 + z, [
        { kind: 'placeBuilding', catalogId: 'wind-turbine', x, z, rotation: 0 },
      ]).ok;
    expect(
      run(h, 1, [
        { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(60, 60, 20) },
        { kind: 'placeBuilding', catalogId: 'wind-turbine', x: 64, z: 59, rotation: 0 },
      ]).ok,
    ).toBe(true);
    // One or two clear tiles along the street, or two diagonally, are too close.
    expect(turbine(66, 59)).toBe(false);
    expect(turbine(67, 59)).toBe(false);
    expect(turbine(67, 56)).toBe(false);
    // Three clear tiles put the centres 80 m apart, more than a rotor: it stands.
    expect(turbine(68, 59)).toBe(true);
    // Another kind of building may stand right beside a turbine.
    expect(
      run(h, 5, [{ kind: 'placeBuilding', catalogId: 'water-tower', x: 65, z: 57, rotation: 0 }])
        .ok,
    ).toBe(true);
  });
});

describe('zoning down a gravel road, which carries no power', () => {
  /**
   * A street with a turbine and a tower on it and no drain, a gravel road
   * south off it, and homes zoned down the gravel; a new town unless told
   * otherwise, so on septic tanks.
   */
  function townDownAGravelRoad(milestoneLevel = 0): Harness {
    const h = milestoneLevel === 0 ? initialized() : initializedAtMilestone(milestoneLevel);
    const ack = run(h, 1, [
      { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(60, 49, 21) },
      { kind: 'buildRoad', tier: RoadTier.Gravel, tiles: column(70, 50, 10) },
      { kind: 'placeBuilding', catalogId: 'wind-turbine', x: 60, z: 48, rotation: 0 },
      { kind: 'placeBuilding', catalogId: 'water-tower', x: 62, z: 47, rotation: 0 },
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

  it('asks no sewer of a new town, which is on septic tanks until it is a Big Town', () => {
    const snap = townDownAGravelRoad().lastSnapshot()!;
    expect(snap.zonedUnserved).toEqual({ power: 9, water: 0, sewer: 0, powerAt: { x: 71, z: 51 } });
  });

  it('once a Big Town, reports the one tile on the mains with no drain, and not the nine on septic tanks', () => {
    const snap = townDownAGravelRoad(SEWER_MILESTONE).lastSnapshot()!;
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
      // Two combustors drawing 1.3 MW on a turbine delivering 1.1: nothing is spare for anyone else.
      { kind: 'placeBuilding', catalogId: 'incinerator', x: 70, z: 45, rotation: 0 },
      { kind: 'placeBuilding', catalogId: 'incinerator', x: 75, z: 45, rotation: 0 },
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
   * A Big Town, so off septic tanks: a street with power and a tower on it, a
   * pond dug three tiles off the street with a drain on its bank, and homes
   * zoned along the street. The drain touches no street, so only a pipe can
   * join it to the mains.
   */
  function townWithADrainOffTheStreet(): Harness {
    const h = initializedAtMilestone(SEWER_MILESTONE);
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
    // A home may grow on the row while the street is served, so the empty
    // zoned tiles are read from the ground.
    h.sim.handleMessage({ type: 'requestSave' });
    const ground = latestSaveGrid(h);
    let empty = 0;
    for (let x = 60; x < 80; x++) if (ground.buildingId[tileIndex(x, 50)] === 0) empty++;
    expect(h.lastSnapshot()!.zonedUnserved!.sewer).toBe(empty);
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

describe('the fouled water', () => {
  /**
   * A Big Town, so off septic tanks: a street with a coal plant, a pond dug
   * off it with a drain on the near bank joined to the street by pipe, a
   * pumping station on the pond's other bank joined the same way, and homes
   * zoned along the street. The station drinks from the very water the drain
   * empties into.
   */
  function townDrinkingBesideItsDrain(): Harness {
    const h = initializedAtMilestone(SEWER_MILESTONE);
    const ack = run(h, 1, [
      { kind: 'setSandbox', on: true },
      { kind: 'setUnlimitedMoney', on: true },
      { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(60, 49, 21) },
      { kind: 'placeBuilding', catalogId: 'coal-plant', x: 60, z: 45, rotation: 0 },
      ...pondAndDrain({ x: 66, z: 44 }, { x: 66, z: 45 }),
      { kind: 'layWaterPipe', tiles: column(66, 46, 3), on: true },
      { kind: 'placeBuilding', catalogId: 'water-pump', x: 67, z: 43, rotation: 0 },
      { kind: 'layWaterPipe', tiles: column(69, 43, 6), on: true },
      { kind: 'paintZone', zone: ZoneType.ResLow, tiles: rows(60, 50, 20, 2) },
    ]);
    expect(ack.ok).toBe(true);
    h.ticks(1500);
    return h;
  }

  /** The fouling the last snapshot carried for one tile, or 0 when none travelled yet. */
  function foulAt(h: Harness, x: number, z: number): number {
    for (let i = h.messages.length - 1; i >= 0; i--) {
      const m = h.messages[i]!;
      if (m.type !== 'snapshot' || !m.snap.waterFoul) continue;
      const patch = m.snap.waterFoul[0]!;
      return patch.data[(z - patch.z) * patch.w + (x - patch.x)] ?? 0;
    }
    return 0;
  }

  function placedIdAt(h: Harness, x: number, z: number): number {
    for (const b of standingBuildings(h).values()) {
      if (b.x === x && b.z === z) return b.id;
    }
    throw new Error(`nothing stands at ${x},${z}`);
  }

  it(
    'fouls the pond from the drain, and the station drinking from it delivers less than its rating',
    () => {
      const h = townDrinkingBesideItsDrain();
      const snap = h.lastSnapshot()!;
      expect(snap.stats.sewerDemand).toBeGreaterThan(0);
      // The water beside the drain is fouled; the bank the drain stands on is not water and never is.
      expect(foulAt(h, 66, 44)).toBeGreaterThan(0);
      expect(foulAt(h, 66, 45)).toBe(0);
      // The station's yield is scaled, and the city counts what the fouling cost it.
      expect(snap.stats.waterFouled).toBeGreaterThan(0);
      expect(snap.stats.waterSupply).toBeCloseTo(3785 - snap.stats.waterFouled, 6);
      h.sim.handleMessage({ type: 'select', buildingId: placedIdAt(h, 67, 43) });
      const selection = h.messages.filter((m) => m.type === 'selection').at(-1)!;
      expect(selection.type).toBe('selection');
      if (selection.type === 'selection') {
        expect(selection.info?.intakeYield).toBeLessThan(1);
        expect(selection.info?.intakeYield).toBeGreaterThan(0);
      }
    },
    GROWTH_TIMEOUT_MS,
  );

  it(
    'a treatment works in the drain’s place takes the same sewage and fouls the pond at a seventh of the rate',
    () => {
      const h = townDrinkingBesideItsDrain();
      const before = foulAt(h, 66, 44);
      expect(before).toBeGreaterThan(0);
      expect(run(h, 2, [{ kind: 'bulldoze', tiles: [{ x: 66, z: 45 }] }]).ok).toBe(true);
      // The works is 2×2; it stands on the pond's west bank, where the station
      // stands on the east, and a short pipe joins it to the drain's old run.
      const built = run(h, 3, [
        { kind: 'placeBuilding', catalogId: 'sewage-works', x: 64, z: 43, rotation: 0 },
        { kind: 'layWaterPipe', tiles: roadRow(65, 45, 2), on: true },
      ]);
      expect(built.ok).toBe(true);
      h.ticks(4);
      const snap = h.lastSnapshot()!;
      expect(snap.stats.sewerSupply).toBe(3785);
      expect(foulAt(h, 66, 44)).toBeLessThanOrEqual(Math.ceil(before * 0.15));
      expect(snap.stats.waterFouled).toBeLessThan(3785 * (before / 255) + 1e-6);
    },
    GROWTH_TIMEOUT_MS,
  );
});
