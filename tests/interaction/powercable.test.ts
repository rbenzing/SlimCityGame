import { describe, expect, it } from 'vitest';
import {
  POWER_CABLE_COST_PER_TILE,
  POWER_LINE_COST_PER_TILE,
  tileIndex,
} from '../../src/shared/constants';
import { POWER_LINE_REFUSALS } from '../../src/shared/placement';
import { PowerLineKind, RoadTier, ZoneType } from '../../src/shared/types';
import type { Command } from '../../src/shared/types';
import { column, initialized, latestSaveGrid, roadRow, rows, run } from '../support/sim';
import type { Harness } from '../support/sim';
import { guardRoadNetwork } from '../support/guard';

guardRoadNetwork();

const savedGrid = (h: Harness) => {
  h.sim.handleMessage({ type: 'requestSave' });
  return latestSaveGrid(h);
};
const kindAt = (h: Harness, x: number, z: number): number =>
  savedGrid(h).powerLine[tileIndex(x, z)]!;

type Tiles = { x: number; z: number }[];
const line = (tiles: Tiles, on = true): Command => ({ kind: 'stringPowerLine', tiles, on });
const cable = (tiles: Tiles, on = true): Command => ({
  kind: 'stringPowerLine',
  tiles,
  on,
  lineKind: PowerLineKind.Cable,
});
const turbine = (x: number, z: number): Command => ({
  kind: 'placeBuilding',
  catalogId: 'wind-turbine',
  x,
  z,
  rotation: 0,
});
const funds = (h: Harness): number => h.lastSnapshot()!.stats.funds;

describe('the buried cable', () => {
  it('costs eight times the line a tile, and a run it does not need to pay twice for is free', () => {
    const h = initialized();
    expect(run(h, 1, [turbine(64, 56)]).ok).toBe(true);
    const tiles = column(65, 56, 5);
    const ack = run(h, 2, [cable(tiles)]);
    expect(ack.ok).toBe(true);
    expect(POWER_CABLE_COST_PER_TILE).toBe(POWER_LINE_COST_PER_TILE * 8);
    expect(POWER_CABLE_COST_PER_TILE).toBe(96);
    expect(ack.cost).toBe(5 * 96);
    expect(kindAt(h, 65, 58)).toBe(PowerLineKind.Cable);
    // Dragging back over the run changes nothing and costs nothing.
    const again = run(h, 3, [cable(tiles)]);
    expect(again.cost).toBe(0);
    expect(again.ok).toBe(false);
  });

  it('refuses a run with no source, in its own sentence, charging nothing', () => {
    const h = initialized();
    const before = funds(h);
    const ack = run(h, 1, [cable(roadRow(80, 80, 6))]);
    expect(ack.ok).toBe(false);
    expect(ack.reason).toBe(POWER_LINE_REFUSALS.cableMustStartAtSource);
    expect(ack.reason).toBe(
      'A cable must start at a power station, a substation or a live line or cable.',
    );
    expect(funds(h)).toBe(before);
    expect(kindAt(h, 82, 80)).toBe(0);
  });

  it('is laid along a sealed street, which a line is not, and buries that street`s supply', () => {
    const h = initialized();
    expect(
      run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(58, 60, 20) }]).ok,
    ).toBe(true);
    const along = roadRow(62, 60, 8);
    expect(run(h, 2, [line(along)]).reason).toBe(POWER_LINE_REFUSALS.alongStreet);
    const ack = run(h, 3, [cable(along)]);
    expect(ack.ok).toBe(true);
    for (const t of along) expect(kindAt(h, t.x, t.z)).toBe(PowerLineKind.Cable);
  });

  it('is laid under a building-free gravel road, and not under a building', () => {
    const h = initialized();
    expect(
      run(h, 1, [
        { kind: 'buildRoad', tier: RoadTier.Gravel, tiles: roadRow(58, 60, 20) },
        turbine(62, 59),
      ]).ok,
    ).toBe(true);
    expect(run(h, 2, [cable(roadRow(62, 60, 4))]).ok).toBe(true);
    expect(run(h, 3, [cable([{ x: 62, z: 59 }])]).ok).toBe(false);
    expect(kindAt(h, 62, 59)).toBe(0);
  });

  it('replaces a line and is replaced by one, each undone to exactly what stood', () => {
    const h = initialized();
    expect(run(h, 1, [turbine(64, 56)]).ok).toBe(true);
    expect(run(h, 2, [line(column(65, 56, 3))]).ok).toBe(true);
    // Laid over three tiles of line and three bare ones.
    const mixed = column(65, 56, 6);
    const laid = run(h, 3, [cable(mixed)]);
    expect(laid.ok).toBe(true);
    expect(laid.cost).toBe(6 * 96);
    for (const t of mixed) expect(kindAt(h, t.x, t.z)).toBe(PowerLineKind.Cable);

    const undone = run(h, 4, laid.inverse);
    expect(undone.ok).toBe(true);
    for (const t of mixed.slice(0, 3)) expect(kindAt(h, t.x, t.z)).toBe(PowerLineKind.Strung);
    for (const t of mixed.slice(3)) expect(kindAt(h, t.x, t.z)).toBe(0);

    // Redoing the undo lays the cable back, with no rule asked of it.
    const redone = run(h, 5, undone.inverse);
    expect(redone.ok).toBe(true);
    for (const t of mixed) expect(kindAt(h, t.x, t.z)).toBe(PowerLineKind.Cable);

    // A line laid over the cable replaces it, and its undo puts the cable back.
    const over = run(h, 6, [line(mixed)]);
    expect(over.ok).toBe(true);
    for (const t of mixed) expect(kindAt(h, t.x, t.z)).toBe(PowerLineKind.Strung);
    expect(run(h, 7, over.inverse).ok).toBe(true);
    for (const t of mixed) expect(kindAt(h, t.x, t.z)).toBe(PowerLineKind.Cable);
  });

  it('is taken up by the bulldozer with the usual refund, and put back by the undo', () => {
    const h = initialized();
    expect(run(h, 1, [turbine(64, 56)]).ok).toBe(true);
    const tiles = column(65, 56, 4);
    expect(run(h, 2, [cable(tiles)]).ok).toBe(true);
    const dozed = run(h, 3, [{ kind: 'bulldoze', tiles }]);
    expect(dozed.ok).toBe(true);
    for (const t of tiles) expect(kindAt(h, t.x, t.z)).toBe(0);
    // The refund is half of what was paid, and a negative cost says refund.
    expect(dozed.cost).toBeCloseTo(-4 * POWER_CABLE_COST_PER_TILE * 0.5, 6);
    expect(run(h, 4, dozed.inverse).ok).toBe(true);
    for (const t of tiles) expect(kindAt(h, t.x, t.z)).toBe(PowerLineKind.Cable);
  });

  it('survives a save: a cable is byte 3 on the grid it loads back as', () => {
    const h = initialized();
    expect(run(h, 1, [turbine(64, 56)]).ok).toBe(true);
    expect(run(h, 2, [cable(column(65, 56, 3))]).ok).toBe(true);
    h.sim.handleMessage({ type: 'requestSave' });
    const loaded = latestSaveGrid(h);
    expect(loaded.powerLine[tileIndex(65, 57)]).toBe(3);
  });

  it('powers the houses along a gravel lane it lies under, from a substation its street supplies', () => {
    const h = initialized();
    const ack = run(h, 1, [
      { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(60, 49, 21) },
      { kind: 'buildRoad', tier: RoadTier.Gravel, tiles: column(70, 50, 10) },
      { kind: 'placeBuilding', catalogId: 'wind-turbine', x: 60, z: 48, rotation: 0 },
      { kind: 'placeBuilding', catalogId: 'water-tower', x: 62, z: 48, rotation: 0 },
      { kind: 'paintZone', zone: ZoneType.ResLow, tiles: rows(71, 50, 1, 10) },
      { kind: 'placeBuilding', catalogId: 'substation', x: 68, z: 50, rotation: 2 },
    ]);
    expect(ack.ok).toBe(true);
    h.ticks(4);
    expect(h.lastSnapshot()!.zonedUnserved!.power).toBeGreaterThan(0);
    expect(run(h, 2, [cable(column(70, 50, 10))]).ok).toBe(true);
    h.ticks(4);
    expect(h.lastSnapshot()!.zonedUnserved).toEqual({ power: 0, water: 0, sewer: 0 });
  });
});
