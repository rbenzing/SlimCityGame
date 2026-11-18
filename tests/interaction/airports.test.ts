import { describe, expect, it } from 'vitest';
import { decodeSave } from '../../src/app/persist';
import { airportPlotTiles, AIRPORT_IDS } from '../../src/shared/airportlayout';
import { MAP_SIZE } from '../../src/shared/constants';
import { PLACEMENT_REFUSALS } from '../../src/shared/placement';
import { RoadTier } from '../../src/shared/types';
import type { Command, GridState } from '../../src/shared/types';
import { loadGrid } from '../../src/world/roadnet';
import {
  initialized,
  latestSaveData,
  roadRow,
  rows,
  run,
  standingBuildings,
  type Harness,
} from '../support/sim';

/** Bytes a command batch would cost to post: typed arrays at their byte length, the rest as JSON. */
function payloadBytes(value: unknown): number {
  if (ArrayBuffer.isView(value)) return value.byteLength;
  if (Array.isArray(value)) return value.reduce((sum: number, v) => sum + payloadBytes(v), 2);
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).reduce((sum, [k, v]) => sum + k.length + 3 + payloadBytes(v), 2);
  }
  return JSON.stringify(value)?.length ?? 0;
}

interface World {
  grid: GridState;
  buildings: unknown[];
}

function worldState(h: Harness): World {
  h.sim.handleMessage({ type: 'requestSave' });
  const payload = decodeSave(latestSaveData(h));
  return {
    grid: loadGrid(payload.grid).grid,
    buildings: payload.meta.registry.buildings.map(({ id: _id, ...rest }) => rest),
  };
}

/** Asserts two worlds hold the same buildings and every grid layer, naming the first layer and tile that differs. */
function expectSameWorld(actual: World, expected: World): void {
  expect(actual.buildings).toEqual(expected.buildings);
  for (const [layer, value] of Object.entries(expected.grid)) {
    if (!ArrayBuffer.isView(value)) continue;
    const mine = (actual.grid as unknown as Record<string, ArrayLike<number>>)[layer]!;
    const theirs = value as unknown as ArrayLike<number>;
    let first = -1;
    // A building put back takes a new id, so that layer is compared as occupied or free.
    const same = (a: number, b: number): boolean =>
      layer === 'buildingId' ? (a === 0) === (b === 0) : a === b;
    for (let i = 0; i < theirs.length && first < 0; i++) if (!same(mine[i]!, theirs[i]!)) first = i;
    expect(first, `layer ${layer}, first differing tile`).toBe(-1);
  }
}

const timed = <T>(fn: () => T): { out: T; ms: number } => {
  const t0 = performance.now();
  const out = fn();
  return { out, ms: performance.now() - t0 };
};

describe('the largest plot goes down, comes back and goes again [R-world-052]', () => {
  it('places, undoes, redoes and bulldozes the international airport on flat ground', () => {
    const h = initialized();
    run(h, 1, [
      { kind: 'setSandbox', on: true },
      { kind: 'setUnlimitedMoney', on: true },
    ]);
    const { w, d } = airportPlotTiles('international-airport');
    expect(w * d).toBe(6039);
    const x = 20;
    const z = 20;
    expect(
      run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(x, z + d, w) }]).ok,
    ).toBe(true);
    const empty = timed(() => run(h, 3, [])).ms;
    const before = worldState(h);

    const place: Command = {
      kind: 'placeBuilding',
      catalogId: 'international-airport',
      x,
      z,
      rotation: 0,
    };
    const placed = timed(() => run(h, 10, [place]));
    expect(placed.out.ok, placed.out.reason).toBe(true);
    const afterPlace = worldState(h);
    expect(afterPlace.buildings).toHaveLength(1);
    const standing = [...standingBuildings(h).values()].filter(
      (b) => b.catalogId === 'international-airport',
    );
    expect(standing).toHaveLength(1);

    const undone = timed(() => run(h, 11, placed.out.inverse));
    expect(undone.out.ok).toBe(true);
    expectSameWorld(worldState(h), before);

    const redone = timed(() => run(h, 12, undone.out.inverse));
    expect(redone.out.ok).toBe(true);
    expectSameWorld(worldState(h), afterPlace);

    const footprint = rows(x, z, w, d);
    const dozed = timed(() => run(h, 13, [{ kind: 'bulldoze', tiles: footprint }]));
    expect(dozed.out.ok).toBe(true);
    expectSameWorld(worldState(h), before);

    // Putting the demolition back stands the airport as it was.
    const back = run(h, 14, dozed.out.inverse);
    expect(back.ok).toBe(true);
    expectSameWorld(worldState(h), afterPlace);

    const largest = Math.max(
      payloadBytes(place),
      payloadBytes(placed.out.inverse),
      payloadBytes(undone.out.inverse),
      payloadBytes(dozed.out.inverse),
      payloadBytes([{ kind: 'bulldoze', tiles: footprint }]),
    );
    // Measured at 55-105 ms a step, two ticks included; the guard is wide so a loaded machine passes.
    for (const step of [placed, undone, redone, dozed]) expect(step.ms).toBeLessThan(1000);
    // Measured at 88 KB, the footprint's tile list.
    expect(largest).toBeLessThan(1_000_000);
    expect(empty).toBeLessThan(1000);
  });

  it.each(AIRPORT_IDS)('places %s on its own street and stands it', (id) => {
    const h = initialized();
    run(h, 1, [
      { kind: 'setSandbox', on: true },
      { kind: 'setUnlimitedMoney', on: true },
    ]);
    const { w, d } = airportPlotTiles(id);
    run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(20, 20 + d, w) }]);
    const ack = run(h, 3, [{ kind: 'placeBuilding', catalogId: id, x: 20, z: 20, rotation: 0 }]);
    expect(ack.ok, ack.reason).toBe(true);
    expect([...standingBuildings(h).values()].some((b) => b.catalogId === id)).toBe(true);
  });

  it('refuses every rung where the plot would stand off the map', () => {
    for (const id of AIRPORT_IDS) {
      const h = initialized();
      run(h, 1, [
        { kind: 'setSandbox', on: true },
        { kind: 'setUnlimitedMoney', on: true },
      ]);
      const ack = run(h, 2, [
        { kind: 'placeBuilding', catalogId: id, x: MAP_SIZE - 5, z: 20, rotation: 0 },
      ]);
      expect(ack.ok).toBe(false);
    }
  });

  it('refuses a plot with water in it, as any building is refused', () => {
    const h = initialized();
    run(h, 1, [
      { kind: 'setSandbox', on: true },
      { kind: 'setUnlimitedMoney', on: true },
    ]);
    const { w, d } = airportPlotTiles('airfield');
    run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(20, 20 + d, w) }]);
    run(h, 3, [
      { kind: 'terraform', mode: 'lower', center: { x: 40, z: 25 }, radius: 2, strength: 12 },
    ]);
    const ack = run(h, 4, [
      { kind: 'placeBuilding', catalogId: 'airfield', x: 20, z: 20, rotation: 0 },
    ]);
    expect(ack.ok).toBe(false);
  });

  it('fronts the street on its local +Z edge: a street behind it refuses it', () => {
    const h = initialized();
    run(h, 1, [
      { kind: 'setSandbox', on: true },
      { kind: 'setUnlimitedMoney', on: true },
    ]);
    const { w, d } = airportPlotTiles('airfield');
    run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(20, 19, w) }]);
    const north = run(h, 3, [
      { kind: 'placeBuilding', catalogId: 'airfield', x: 20, z: 20, rotation: 0 },
    ]);
    expect(north.ok).toBe(false);
    expect(north.reason).toBe(PLACEMENT_REFUSALS.frontsAway);
    run(h, 4, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(20, 20 + d, w) }]);
    expect(
      run(h, 5, [{ kind: 'placeBuilding', catalogId: 'airfield', x: 20, z: 20, rotation: 0 }]).ok,
    ).toBe(true);
  });
});

describe('the former airport is no longer for sale but stays a part of every save [R-saves-013]', () => {
  it('is refused as a new placement and stood back by a restore', () => {
    const h = initialized();
    run(h, 1, [
      { kind: 'setSandbox', on: true },
      { kind: 'setUnlimitedMoney', on: true },
      { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(20, 26, 8) },
    ]);
    const fresh = run(h, 2, [
      { kind: 'placeBuilding', catalogId: 'airport', x: 20, z: 20, rotation: 0 },
    ]);
    expect(fresh.ok).toBe(false);
    expect(fresh.reason).toBe(PLACEMENT_REFUSALS.retired);

    const restored = run(h, 3, [
      { kind: 'placeBuilding', catalogId: 'airport', x: 20, z: 20, rotation: 0, restore: true },
    ]);
    expect(restored.ok).toBe(true);
    const airport = [...standingBuildings(h).values()].find((b) => b.catalogId === 'airport');
    expect(airport).toBeDefined();

    // It survives a save and a load, and the bulldozer still takes it.
    h.sim.handleMessage({ type: 'requestSave' });
    h.sim.handleMessage({ type: 'loadSave', data: latestSaveData(h) });
    h.sim.handleMessage({ type: 'requestSave' });
    const saved = decodeSave(latestSaveData(h)).meta.registry.buildings;
    expect(saved.filter((b) => b.catalogId === 'airport')).toHaveLength(1);
    const dozed = run(h, 4, [{ kind: 'bulldoze', tiles: rows(20, 20, 8, 6) }]);
    expect(dozed.ok).toBe(true);
    h.sim.handleMessage({ type: 'requestSave' });
    expect(
      decodeSave(latestSaveData(h)).meta.registry.buildings.some((b) => b.catalogId === 'airport'),
    ).toBe(false);
  });
});
