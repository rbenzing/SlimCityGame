import { describe, expect, it } from 'vitest';
import { MAP_SIZE, MAP_TILES, tileIndex } from '../../src/shared/constants';
import { RoadTier } from '../../src/shared/types';
import type { Command, GridState, MapData } from '../../src/shared/types';
import {
  catalog,
  column,
  latestSaveGrid,
  makeHarness,
  roadRow,
  rows,
  run,
  type Harness,
} from '../support/sim';
import { guardRoadNetwork } from '../support/guard';

guardRoadNetwork();

/** Ground that rises 1.2 m per tile southward and 0.3 m per tile eastward: gentle enough to build and to draw a street on. */
function heightAt(x: number, z: number): number {
  return 20 + 1.2 * z + 0.3 * x;
}

/** The same slope falling southward, so ground rises away from a street on the south side. */
function fallingAt(x: number, z: number): number {
  return 80 - 1.2 * z + 0.3 * x;
}

function mapOf(f: (x: number, z: number) => number): MapData {
  const height = new Float32Array(MAP_TILES);
  for (let z = 0; z < MAP_SIZE; z++) {
    for (let x = 0; x < MAP_SIZE; x++) height[tileIndex(x, z)] = f(x, z);
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

function slopedHarness(f: (x: number, z: number) => number): Harness {
  const h = makeHarness();
  h.sim.handleMessage({ type: 'init', seed: 1337, map: mapOf(f) });
  run(h, 1, [{ kind: 'setSandbox', on: true }]);
  return h;
}

const heightsOf = (h: Harness): GridState['height'] => {
  h.sim.handleMessage({ type: 'requestSave' });
  return latestSaveGrid(h).height;
};

const police = catalog.find((e) => e.id === 'police-station')!; // 2 x 2
const X = 50;
const Z = 60;
const footprint = rows(X, Z, 2, 2);
const place: Command = { kind: 'placeBuilding', catalogId: police.id, x: X, z: Z, rotation: 0 };

/** The cells one step round the footprint in all eight directions. */
const ring = rows(X - 1, Z - 1, 4, 4).filter(
  (t) => !footprint.some((f) => f.x === t.x && f.z === t.z),
);

/**
 * After a placement: every open-ground ring cell is the target, a ring cell a
 * road owns kept its height, and no rendered corner of the footprint (the mean
 * of the four cells meeting there) stands above the target.
 */
function expectFlush(h: Harness, before: GridState['height'], target: number): void {
  h.sim.handleMessage({ type: 'requestSave' });
  const grid = latestSaveGrid(h);
  for (const t of ring) {
    const i = tileIndex(t.x, t.z);
    expect(grid.height[i]).toBe(grid.roadTier[i] !== RoadTier.None ? before[i] : target);
  }
  // A street's own cells rise past the target along its fall; that is the street's, not the plot's.
  const cell = (x: number, z: number): number => {
    const i = tileIndex(x, z);
    return grid.roadTier[i] !== RoadTier.None ? Math.min(grid.height[i]!, target) : grid.height[i]!;
  };
  for (let cz = Z; cz <= Z + 2; cz++) {
    for (let cx = X; cx <= X + 2; cx++) {
      const mean = (cell(cx - 1, cz - 1) + cell(cx, cz - 1) + cell(cx - 1, cz) + cell(cx, cz)) / 4;
      expect(mean).toBeLessThanOrEqual(target + 1e-4);
    }
  }
}

describe('a placed building is levelled to its street [R-world-051]', () => {
  it('stands at the highest vertex of a street on its south side, on ground rising away from it', () => {
    const h = slopedHarness(fallingAt);
    run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(X - 3, Z + 2, 8) }]);
    const before = heightsOf(h);
    const edge = [X, X + 1].map((x) => before[tileIndex(x, Z + 2)]!);
    const road = roadRow(X - 3, Z + 2, 8).map((t) => before[tileIndex(t.x, t.z)]);
    // The footprint's back is higher than the street edge: that is what the mean got wrong.
    expect(Math.max(...footprint.map((t) => before[tileIndex(t.x, t.z)]!))).toBeGreaterThan(
      Math.max(...edge),
    );

    expect(run(h, 3, [place]).ok).toBe(true);
    const after = heightsOf(h);
    const target = Math.max(...edge);
    for (const t of footprint) expect(after[tileIndex(t.x, t.z)]).toBe(target);
    roadRow(X - 3, Z + 2, 8).forEach((t, i) => expect(after[tileIndex(t.x, t.z)]).toBe(road[i]));
    expectFlush(h, before, target);
  });

  it('takes the highest street cell on its north side', () => {
    const h = slopedHarness(heightAt);
    run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(X - 3, Z - 1, 8) }]);
    const before = heightsOf(h);
    const edge = [X, X + 1].map((x) => before[tileIndex(x, Z - 1)]!);
    const target = Math.max(...edge);
    expect(footprint.some((t) => before[tileIndex(t.x, t.z)] !== target)).toBe(true);

    // Turned to front the street at its north.
    expect(run(h, 3, [{ ...place, rotation: 2 }]).ok).toBe(true);
    const after = heightsOf(h);
    for (const t of footprint) expect(after[tileIndex(t.x, t.z)]).toBe(target);
    expectFlush(h, before, target);
  });

  it('takes the highest street edge of two on a corner lot', () => {
    const h = slopedHarness(fallingAt);
    run(h, 2, [
      { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(X - 3, Z + 2, 8) },
      { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: column(X + 2, Z - 4, 8) },
    ]);
    const before = heightsOf(h);
    const edge = [
      [X, Z + 2],
      [X + 1, Z + 2],
      [X + 2, Z],
      [X + 2, Z + 1],
    ].map(([x, z]) => before[tileIndex(x!, z!)]!);
    const target = Math.max(...edge);

    expect(run(h, 3, [place]).ok).toBe(true);
    const after = heightsOf(h);
    for (const t of footprint) expect(after[tileIndex(t.x, t.z)]).toBe(target);
    expectFlush(h, before, target);
  });

  // A building that touches no street can only be a kind marked off-street: the solar farm.
  const solar = catalog.find((e) => e.id === 'solar-farm')!; // 6 x 6
  const solarFootprint = rows(X, Z, 6, 6);
  const placeSolar: Command = {
    kind: 'placeBuilding',
    catalogId: solar.id,
    x: X,
    z: Z,
    rotation: 0,
  };

  it('takes the mean of its own ground when no street touches it', () => {
    expect(solar.offStreet).toBe(true);
    const h = slopedHarness(heightAt);
    const before = heightsOf(h);
    const mean =
      solarFootprint.reduce((sum, t) => sum + before[tileIndex(t.x, t.z)]!, 0) /
      solarFootprint.length;

    expect(run(h, 2, [placeSolar]).ok).toBe(true);
    const after = heightsOf(h);
    for (const t of solarFootprint) expect(after[tileIndex(t.x, t.z)]).toBeCloseTo(mean, 4);
  });

  it.each([
    ['a motorway', RoadTier.Highway],
    ['a railway', RoadTier.RailTrack],
  ])('takes the mean beside %s alone, which is not a street', (_name, tier) => {
    const h = slopedHarness(fallingAt);
    run(h, 2, [{ kind: 'buildRoad', tier, tiles: roadRow(X - 6, Z + 6, 14) }]);
    const before = heightsOf(h);
    const mean =
      solarFootprint.reduce((sum, t) => sum + before[tileIndex(t.x, t.z)]!, 0) /
      solarFootprint.length;
    const street = Math.max(...[X, X + 1].map((x) => before[tileIndex(x, Z + 6)]!));
    expect(street).not.toBeCloseTo(mean, 3);

    expect(run(h, 3, [placeSolar]).ok).toBe(true);
    const after = heightsOf(h);
    for (const t of solarFootprint) expect(after[tileIndex(t.x, t.z)]).toBeCloseTo(mean, 4);
  });

  it('leaves a draped park as the ground lies, beside a street or not', () => {
    const park = catalog.find((e) => e.id === 'district-park')!;
    expect(park.ground).toBe('drape');
    const h = slopedHarness(heightAt);
    run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(X - 3, Z - 1, 40) }]);
    const before = heightsOf(h).slice();

    const ack = run(h, 3, [{ kind: 'placeBuilding', catalogId: park.id, x: X, z: Z, rotation: 2 }]);
    expect(ack.ok).toBe(true);
    expect(heightsOf(h)).toEqual(before);
  });

  it('undoes to every height bit for bit, and a redo levels again', () => {
    const h = slopedHarness(fallingAt);
    run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(X - 3, Z + 2, 8) }]);
    const before = heightsOf(h).slice();

    const ack = run(h, 3, [place]);
    expect(ack.ok).toBe(true);
    const levelled = heightsOf(h).slice();
    expect(levelled).not.toEqual(before);

    expect(run(h, 4, ack.inverse).ok).toBe(true);
    expect(heightsOf(h)).toEqual(before);

    expect(run(h, 5, [place]).ok).toBe(true);
    expect(heightsOf(h)).toEqual(levelled);
  });
});
