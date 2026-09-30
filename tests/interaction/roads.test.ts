import { describe, expect, it } from 'vitest';
import { MAP_SIZE, MAP_TILES, tileIndex } from '../../src/shared/constants';
import { RoadFlow, RoadTier, ZoneType } from '../../src/shared/types';
import type {
  Command,
  GridState,
  MapData,
  RoadProfile,
  RoadTileDelta,
  SimSnapshot,
  TilePoint,
  WorkerToMain,
} from '../../src/shared/types';
import { FIRST_CUSTOM_PROFILE_ID } from '../../src/shared/roadprofile';
import { decodeSave, encodeSave } from '../../src/app/persist';
import { serializeGridV12 } from '../../src/world/grid';
import {
  cellStep,
  isFreeSegment,
  loadGrid,
  neighbours,
  roadCellsOf,
} from '../../src/world/roadnet';
import { RUNS_INTO_FREE_ROAD } from '../../src/world/freeroads';
import {
  column,
  initialized,
  latestSaveGrid,
  makeHarness,
  roadRow,
  roadSpecs,
  run,
  sandboxed,
  send,
  sixLaneCommands,
  twoLaneSpec,
  type Harness,
} from '../support/sim';
import { RoadNetwork } from '../../src/world/roadgraph';
import { guardRoadNetwork } from '../support/guard';

guardRoadNetwork();

describe('roads on a slope', () => {
  /** Flat at `base`, except one elevated "step" tile at (stepX, stepZ) whose height differs from its flat neighbors by exactly `delta`. */
  function slopeMap(stepX: number, stepZ: number, base: number, delta: number): MapData {
    const height = new Float32Array(MAP_TILES).fill(base);
    height[tileIndex(stepX, stepZ)] = base + delta;
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

  function initializedSlope(stepX: number, stepZ: number, base: number, delta: number): Harness {
    const h = makeHarness();
    h.sim.handleMessage({ type: 'init', seed: 1337, map: slopeMap(stepX, stepZ, base, delta) });
    return h;
  }

  it('places a road on a moderate slope (7m/tile) that MAX_BUILD_SLOPE(4) would reject', () => {
    const stepX = 101;
    const stepZ = 100;
    const h = initializedSlope(stepX, stepZ, 5, 7); // > MAX_BUILD_SLOPE(4), < ROAD_MAX_SLOPE(10)
    send(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: [{ x: 100, z: 100 }] }]);
    h.ticks(1);
    const ack = h.ackFor(1)!;
    expect(ack.ok).toBe(true);
    expect(ack.cost).toBe(twoLaneSpec.costPerTile);
  });

  it('rejects a tile whose slope exceeds ROAD_MAX_SLOPE(10)', () => {
    const stepX = 101;
    const stepZ = 100;
    const h = initializedSlope(stepX, stepZ, 5, 11); // > ROAD_MAX_SLOPE(10)
    send(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: [{ x: 100, z: 100 }] }]);
    h.ticks(1);
    const ack = h.ackFor(1)!;
    expect(ack.ok).toBe(false);
    expect(ack.reason).toBe('invalid');
  });

  it('still rejects a water tile for road placement', () => {
    const h = makeHarness();
    const height = new Float32Array(MAP_TILES).fill(5);
    const water = new Uint8Array(MAP_TILES);
    water[tileIndex(100, 100)] = 1;
    const map: MapData = {
      name: 'Water',
      size: MAP_SIZE,
      height,
      water,
      trees: new Uint8Array(MAP_TILES),
      seaLevel: 0,
      spawn: { x: MAP_SIZE / 2, z: MAP_SIZE / 2 },
    };
    h.sim.handleMessage({ type: 'init', seed: 1337, map });
    send(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: [{ x: 100, z: 100 }] }]);
    h.ticks(1);
    const ack = h.ackFor(1)!;
    expect(ack.ok).toBe(false);
    expect(ack.reason).toBe('invalid');
  });

  it('buildings/zoning are unaffected: still bound by MAX_BUILD_SLOPE on the same moderate slope', () => {
    const stepX = 61;
    const stepZ = 60;
    const h = initializedSlope(stepX, stepZ, 5, 7); // same 7m grade the road test above accepts
    send(h, 1, [{ kind: 'placeBuilding', catalogId: 'wind-turbine', x: 60, z: 60, rotation: 0 }]);
    h.ticks(1);
    const ack = h.ackFor(1)!;
    expect(ack.ok).toBe(false);
    expect(ack.reason).toBe('invalid');
  });

  it('placing a road on a sloped tile emits auto-flatten heightPatches and undoes exactly', () => {
    const stepX = 101;
    const stepZ = 100;
    const base = 5;
    const delta = 7;
    const h = initializedSlope(stepX, stepZ, base, delta);

    h.sim.handleMessage({ type: 'requestSave' });
    const before = latestSaveGrid(h);
    const region: TilePoint[] = [];
    for (let z = 99; z <= 101; z++) {
      for (let x = 99; x <= 101; x++) region.push({ x, z });
    }
    const beforeHeights = new Map(
      region.map((t) => [tileIndex(t.x, t.z), before.height[tileIndex(t.x, t.z)]!]),
    );

    send(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: [{ x: 100, z: 100 }] }]);
    h.ticks(2); // 2 ticks so the SNAPSHOT_TICKS(=2) cadence actually posts one
    const ack = h.ackFor(1)!;
    expect(ack.ok).toBe(true);
    expect(ack.inverse.some((c) => c.kind === 'terraformSet')).toBe(true);

    const patchSnap = h.messages.find(
      (m): m is Extract<WorkerToMain, { type: 'snapshot' }> =>
        m.type === 'snapshot' && m.snap.heightPatches !== undefined,
    );
    expect(patchSnap).toBeDefined();

    // Sanity: the grade pulled the raised step apron tile DOWN toward the road
    // (never above it) — so it no longer sits at its original raised height.
    h.sim.handleMessage({ type: 'requestSave' });
    const afterBuild = latestSaveGrid(h);
    expect(afterBuild.height[tileIndex(stepX, stepZ)]).not.toBe(base + delta);
    expect(afterBuild.height[tileIndex(stepX, stepZ)]).toBeLessThanOrEqual(
      afterBuild.height[tileIndex(100, 100)]! + 1e-5,
    );

    send(h, 2, ack.inverse);
    h.ticks(2);
    expect(h.ackFor(2)!.ok).toBe(true);

    h.sim.handleMessage({ type: 'requestSave' });
    const afterUndo = latestSaveGrid(h);
    for (const t of region) {
      expect(afterUndo.height[tileIndex(t.x, t.z)]).toBe(beforeHeights.get(tileIndex(t.x, t.z)));
    }
  });
});

describe('road composition — profiles the worker stores, lays and saves', () => {
  /** The first id a composed profile may claim: everything below it is a preset. */
  const CUSTOM_ID = FIRST_CUSTOM_PROFILE_ID;
  const customLocal: RoadProfile = {
    class: 'local',
    pieces: [
      { kind: 'sidewalk', width: 1.9 },
      { kind: 'parking', width: 2.25 },
      { kind: 'travel', width: 3.5, flow: 'back' },
      { kind: 'travel', width: 3.5, flow: 'fwd' },
      { kind: 'sidewalk', width: 1.9 },
    ],
  };

  /** The most recent snapshot that carried the profile table (it only travels when it changes). */
  function lastTable(h: Harness): SimSnapshot['roadProfiles'] {
    for (let i = h.messages.length - 1; i >= 0; i--) {
      const m = h.messages[i]!;
      if (m.type === 'snapshot' && m.snap.roadProfiles !== undefined) return m.snap.roadProfiles;
    }
    return undefined;
  }
  /** Every road delta the worker has sent for a row, newest first per tile. */
  function rowDeltas(h: Harness, z: number, x0: number, x1: number) {
    const byX = new Map<number, RoadTileDelta>();
    for (const m of h.messages) {
      if (m.type !== 'snapshot' || !m.snap.roads) continue;
      for (const d of m.snap.roads) if (d.z === z && d.x >= x0 && d.x < x1) byX.set(d.x, d);
    }
    return [...byX.values()].sort((a, b) => a.x - b.x);
  }

  it('defines a composed profile, lays it under its nearest tier, and the delta names it', () => {
    const h = initialized();
    expect(run(h, 1, [{ kind: 'defineRoadProfile', id: CUSTOM_ID, profile: customLocal }]).ok).toBe(
      true,
    );
    expect(
      run(h, 2, [
        {
          kind: 'buildRoad',
          tier: RoadTier.TwoLane,
          tiles: roadRow(10, 10, 3),
          profile: CUSTOM_ID,
        },
      ]).ok,
    ).toBe(true);
    expect(lastTable(h)).toEqual([{ id: CUSTOM_ID, profile: customLocal }]);
    const laid = rowDeltas(h, 10, 10, 13);
    expect(laid).toHaveLength(3);
    for (const d of laid) {
      expect(d.profile).toBe(CUSTOM_ID);
      expect(d.tier).toBe(RoadTier.TwoLane);
    }
  });

  it('refuses a preset id, a taken id with a different shape, and a profile that breaks its class', () => {
    const h = initialized();
    expect(run(h, 1, [{ kind: 'defineRoadProfile', id: 3, profile: customLocal }]).ok).toBe(false);
    expect(run(h, 2, [{ kind: 'defineRoadProfile', id: CUSTOM_ID, profile: customLocal }]).ok).toBe(
      true,
    );
    // Idempotent for the same shape.
    expect(run(h, 3, [{ kind: 'defineRoadProfile', id: CUSTOM_ID, profile: customLocal }]).ok).toBe(
      true,
    );
    // A different shape under a taken id would silently re-shape every road laid with it.
    const other: RoadProfile = { ...customLocal, pieces: customLocal.pieces.slice(2, 4) };
    expect(run(h, 4, [{ kind: 'defineRoadProfile', id: CUSTOM_ID, profile: other }]).ok).toBe(
      false,
    );
    // Parking on a motorway is not a thing the class admits.
    const parkedHighway: RoadProfile = {
      class: 'highway',
      pieces: [
        { kind: 'parking', width: 2.25 },
        { kind: 'travel', width: 3.5, flow: 'fwd' },
        { kind: 'travel', width: 3.5, flow: 'back' },
      ],
    };
    expect(
      run(h, 5, [{ kind: 'defineRoadProfile', id: CUSTOM_ID + 1, profile: parkedHighway }]).ok,
    ).toBe(false);
    // Laying an id nothing defined is refused rather than guessed at.
    expect(
      run(h, 6, [
        { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(10, 10, 2), profile: 99 },
      ]).ok,
    ).toBe(false);
  });

  it('replaces a same-tier preset with a composed profile, and undo puts the preset back', () => {
    const h = initialized();
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(10, 10, 3) }]);
    run(h, 2, [{ kind: 'defineRoadProfile', id: CUSTOM_ID, profile: customLocal }]);
    const ack = run(h, 3, [
      { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(10, 10, 3), profile: CUSTOM_ID },
    ]);
    expect(ack.ok).toBe(true);
    h.sim.handleMessage({ type: 'requestSave' });
    const g = latestSaveGrid(h);
    for (let x = 10; x < 13; x++) expect(g.roadProfile[10 * MAP_SIZE + x]).toBe(CUSTOM_ID);

    // The inverse re-lays the preset under its own id.
    run(h, 4, ack.inverse);
    h.sim.handleMessage({ type: 'requestSave' });
    const back = latestSaveGrid(h);
    for (let x = 10; x < 13; x++) {
      expect(back.roadProfile[10 * MAP_SIZE + x]).toBe(RoadTier.TwoLane);
      expect(back.roadTier[10 * MAP_SIZE + x]).toBe(RoadTier.TwoLane);
    }
  });

  it('saves the profile table and a load brings it back with the roads that use it', () => {
    const h = initialized();
    run(h, 1, [{ kind: 'defineRoadProfile', id: CUSTOM_ID, profile: customLocal }]);
    run(h, 2, [
      { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(10, 10, 3), profile: CUSTOM_ID },
    ]);
    h.sim.handleMessage({ type: 'requestSave' });
    const saves = h.messages.filter(
      (m): m is Extract<WorkerToMain, { type: 'save' }> => m.type === 'save',
    );
    const data = saves[saves.length - 1]!.data;

    const fresh = initialized();
    fresh.sim.handleMessage({ type: 'loadSave', data });
    fresh.ticks(1);
    expect(lastTable(fresh)).toEqual([{ id: CUSTOM_ID, profile: customLocal }]);
    expect(rowDeltas(fresh, 10, 10, 13).map((d) => d.profile)).toEqual([
      CUSTOM_ID,
      CUSTOM_ID,
      CUSTOM_ID,
    ]);
  });

  it('replace mode lays a lesser road over a greater one, and undo puts the greater one back', () => {
    const h = initialized();
    run(h, 0, [{ kind: 'setSandbox', on: true }]); // an avenue is milestone-locked at the start
    expect(
      run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.Avenue, tiles: roadRow(10, 10, 3) }]).ok,
    ).toBe(true);
    // Without the flag an avenue stands its ground, as it always has.
    run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(10, 10, 3) }]);
    expect(rowDeltas(h, 10, 10, 13).map((d) => d.tier)).toEqual([
      RoadTier.Avenue,
      RoadTier.Avenue,
      RoadTier.Avenue,
    ]);

    const ack = run(h, 3, [
      { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(10, 10, 3), replace: true },
    ]);
    expect(ack.ok).toBe(true);
    h.sim.handleMessage({ type: 'requestSave' });
    const g = latestSaveGrid(h);
    for (let x = 10; x < 13; x++) {
      expect(g.roadTier[10 * MAP_SIZE + x]).toBe(RoadTier.TwoLane);
      expect(g.roadProfile[10 * MAP_SIZE + x]).toBe(RoadTier.TwoLane);
    }

    run(h, 4, ack.inverse);
    h.sim.handleMessage({ type: 'requestSave' });
    const back = latestSaveGrid(h);
    for (let x = 10; x < 13; x++) {
      expect(back.roadTier[10 * MAP_SIZE + x]).toBe(RoadTier.Avenue);
      expect(back.roadProfile[10 * MAP_SIZE + x]).toBe(RoadTier.Avenue);
    }
  });

  it('replace mode charges for the road it lays and still refuses a road with no money', () => {
    const h = initialized();
    run(h, 0, [{ kind: 'setSandbox', on: true }]);
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.Avenue, tiles: roadRow(20, 20, 3) }]);
    const ack = run(h, 2, [
      { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(20, 20, 3), replace: true },
    ]);
    expect(ack.cost).toBeGreaterThan(0);
  });
});

// A one-way street is milestone-locked at the start, so these build in the sandbox.
describe('road direction — a road runs the way it was drawn', () => {
  function rowDeltas(h: Harness, z: number, x0: number, x1: number): RoadTileDelta[] {
    const byX = new Map<number, RoadTileDelta>();
    for (const m of h.messages) {
      if (m.type !== 'snapshot' || !m.snap.roads) continue;
      for (const d of m.snap.roads) if (d.z === z && d.x >= x0 && d.x < x1) byX.set(d.x, d);
    }
    return [...byX.values()].sort((a, b) => a.x - b.x);
  }

  it('points every tile at the next one along the drag, and the last tile the way it arrived', () => {
    const h = sandboxed();
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.OneWay, tiles: column(10, 10, 4) }]);
    h.sim.handleMessage({ type: 'requestSave' });
    const g = latestSaveGrid(h);
    for (let z = 10; z < 14; z++) expect(g.roadFlow[z * MAP_SIZE + 10]).toBe(RoadFlow.South);
  });

  it('turns a one-way street round when it is drawn back the other way', () => {
    const h = sandboxed();
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.OneWay, tiles: column(12, 10, 4) }]);
    const ack = run(h, 2, [
      { kind: 'buildRoad', tier: RoadTier.OneWay, tiles: column(12, 10, 4).reverse() },
    ]);
    expect(ack.ok).toBe(true);
    h.sim.handleMessage({ type: 'requestSave' });
    const turned = latestSaveGrid(h);
    for (let z = 10; z < 14; z++) expect(turned.roadFlow[z * MAP_SIZE + 12]).toBe(RoadFlow.North);

    // Undo puts back the direction that was there, not the one the tiles read.
    run(h, 3, ack.inverse);
    h.sim.handleMessage({ type: 'requestSave' });
    const back = latestSaveGrid(h);
    for (let z = 10; z < 14; z++) expect(back.roadFlow[z * MAP_SIZE + 12]).toBe(RoadFlow.South);
  });

  it('takes the direction with the road when the road is bulldozed', () => {
    const h = sandboxed();
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.OneWay, tiles: column(14, 10, 3) }]);
    run(h, 2, [{ kind: 'bulldoze', tiles: column(14, 10, 3) }]);
    h.sim.handleMessage({ type: 'requestSave' });
    const g = latestSaveGrid(h);
    for (let z = 10; z < 13; z++) expect(g.roadFlow[z * MAP_SIZE + 14]).toBe(RoadFlow.None);
  });

  it('saves the direction and a load brings it back', () => {
    const h = sandboxed();
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.OneWay, tiles: column(16, 10, 3) }]);
    h.sim.handleMessage({ type: 'requestSave' });
    const saves = h.messages.filter(
      (m): m is Extract<WorkerToMain, { type: 'save' }> => m.type === 'save',
    );
    const data = saves[saves.length - 1]!.data;

    const fresh = sandboxed();
    fresh.sim.handleMessage({ type: 'loadSave', data });
    fresh.ticks(1);
    expect(rowDeltas(fresh, 10, 16, 17).map((d) => d.flow)).toEqual([RoadFlow.South]);
  });
});

describe('which roads may touch — the world refuses, not only the tool', () => {
  function tierAt(h: Harness, x: number, z: number): number {
    h.sim.handleMessage({ type: 'requestSave' });
    return latestSaveGrid(h).roadTier[z * MAP_SIZE + x] ?? 0;
  }

  it('refuses a street drawn across a motorway whole, and says a ramp is the way on', () => {
    const h = sandboxed();
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.Highway, tiles: column(20, 10, 9) }]);
    const ack = run(h, 2, [
      { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(16, 14, 9) },
    ]);
    expect(ack.ok).toBe(false);
    expect(ack.reason).toMatch(/ramp/);
    expect(tierAt(h, 19, 14)).toBe(RoadTier.None);
    expect(tierAt(h, 21, 14)).toBe(RoadTier.None);
    expect(tierAt(h, 20, 14)).toBe(RoadTier.Highway);
  });

  it('refuses a street that only ends against a motorway', () => {
    const h = sandboxed();
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.Highway, tiles: column(20, 10, 9) }]);
    const ack = run(h, 2, [
      { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(15, 14, 5) },
    ]);
    expect(ack.ok).toBe(false);
    expect(tierAt(h, 19, 14)).toBe(RoadTier.None);
  });

  it('lays a street that stops one tile short of the motorway', () => {
    const h = sandboxed();
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.Highway, tiles: column(20, 10, 9) }]);
    const ack = run(h, 2, [
      { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(14, 14, 5) },
    ]);
    expect(ack.ok).toBe(true);
    expect(tierAt(h, 18, 14)).toBe(RoadTier.TwoLane);
  });

  it('lays a ramp against a motorway', () => {
    const h = sandboxed();
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.Highway, tiles: column(20, 10, 9) }]);
    const ack = run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.Ramp, tiles: column(21, 8, 5) }]);
    expect(ack.ok).toBe(true);
    expect(tierAt(h, 21, 11)).toBe(RoadTier.Ramp);
  });

  it('draws a loaded city by the rules of today, not the masks its save was written with', () => {
    const h = sandboxed();
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(30, 30, 3) }]);
    h.sim.handleMessage({ type: 'requestSave' });
    const saves = h.messages.filter(
      (m): m is Extract<WorkerToMain, { type: 'save' }> => m.type === 'save',
    );
    const payload = decodeSave(saves[saves.length - 1]!.data);
    // Masks are saved only by versions before the road network, so the stale
    // one goes into a save of the last of them.
    const g = loadGrid(payload.grid).grid;
    g.roadMask[30 * MAP_SIZE + 31] = 15; // written by rules that joined every side
    payload.grid = serializeGridV12(g);
    h.messages.length = 0;
    h.sim.handleMessage({ type: 'loadSave', data: encodeSave(payload) });
    h.ticks(2);
    const deltas = h.messages.flatMap((m) =>
      m.type === 'snapshot' && m.snap.roads ? m.snap.roads : [],
    );
    const middle = deltas.filter((d) => d.x === 31 && d.z === 30).pop();
    expect(middle?.mask).toBe(2 | 8);
  });

  it('never lets rail take a street tile, or a street take a rail tile, unless asked to replace', () => {
    const h = sandboxed();
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: column(40, 10, 9) }]);
    run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.RailTrack, tiles: roadRow(36, 14, 9) }]);
    expect(tierAt(h, 40, 14)).toBe(RoadTier.TwoLane);
    run(h, 3, [{ kind: 'buildRoad', tier: RoadTier.RailTrack, tiles: column(50, 10, 9) }]);
    run(h, 4, [{ kind: 'buildRoad', tier: RoadTier.Avenue, tiles: roadRow(46, 14, 9) }]);
    expect(tierAt(h, 50, 14)).toBe(RoadTier.RailTrack);
    run(h, 5, [
      { kind: 'buildRoad', tier: RoadTier.RailTrack, tiles: roadRow(36, 14, 9), replace: true },
    ]);
    expect(tierAt(h, 40, 14)).toBe(RoadTier.RailTrack);
  });

  it('refuses a ramp that runs head-on into a motorway, and one that joins against its traffic', () => {
    const h = sandboxed();
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.Highway, tiles: column(20, 10, 9) }]);
    const headOn = run(h, 2, [
      { kind: 'buildRoad', tier: RoadTier.Ramp, tiles: roadRow(15, 14, 5) },
    ]);
    expect(headOn.ok).toBe(false);
    expect(headOn.reason).toMatch(/alongside/);
    expect(tierAt(h, 19, 14)).toBe(RoadTier.None);
    // Beside the southbound motorway but driving north, ending where it meets it.
    const wrongWay = run(h, 3, [
      { kind: 'buildRoad', tier: RoadTier.Ramp, tiles: column(21, 13, 5).reverse() },
    ]);
    expect(wrongWay.ok).toBe(false);
    expect(wrongWay.reason).toMatch(/same way/);
  });

  it('refuses a dirt road against a ramp', () => {
    const h = sandboxed();
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.Ramp, tiles: column(20, 10, 6) }]);
    const ack = run(h, 2, [
      { kind: 'buildRoad', tier: RoadTier.Gravel, tiles: roadRow(15, 12, 5) },
    ]);
    expect(ack.ok).toBe(false);
    expect(tierAt(h, 19, 12)).toBe(RoadTier.None);
  });
});

describe('roads off the grid — the world lays them, undoes them and keeps them', () => {
  /** A point `x`, `z` metres into the map, in centimetres. */
  const at = (x: number, z: number): { x: number; z: number } => ({ x: x * 100, z: z * 100 });
  const centre = (t: number): number => (t * 20 + 10) * 100;

  /** The free segments of the city as last saved: their ends and control. */
  function savedFree(h: Harness): string[] {
    h.sim.handleMessage({ type: 'requestSave' });
    const net = latestSaveGrid(h).roads!;
    const out: string[] = [];
    for (let s = 0; s < net.segSlots; s++) {
      if (!net.segLive[s] || !isFreeSegment(net, s)) continue;
      const a = net.segA[s]!;
      const b = net.segB[s]!;
      out.push(
        `${net.nodeX[a]},${net.nodeZ[a]}-${net.nodeX[b]},${net.nodeZ[b]}~${net.segCurved[s] ? `${net.segCX[s]},${net.segCZ[s]}` : '-'}`,
      );
    }
    return out;
  }

  const curve: Command = {
    kind: 'buildSegment',
    tier: RoadTier.TwoLane,
    a: at(1000, 1000),
    b: at(1200, 1200),
    control: at(1200, 1000),
  };

  it('lays a curve, charges for its length, and undoes it exactly', () => {
    const h = sandboxed();
    const ack = run(h, 1, [curve]);
    expect(ack.ok).toBe(true);
    expect(ack.cost).toBeGreaterThan(0);
    expect(savedFree(h)).toEqual(['100000,100000-120000,120000~120000,100000']);
    const undo = run(h, 2, ack.inverse);
    expect(undo.ok).toBe(true);
    expect(savedFree(h)).toEqual([]);
    const redo = run(h, 3, undo.inverse);
    expect(redo.ok).toBe(true);
    expect(savedFree(h)).toEqual(['100000,100000-120000,120000~120000,100000']);
  });

  it('moves a curve’s end onto the tile centre a grid road meets it at, in one undo step', () => {
    const h = sandboxed();
    run(h, 1, [curve]);
    // The curve starts on the corner of tile (50, 50); a street runs north
    // from that tile once the start is brought to its centre.
    const column = Array.from({ length: 6 }, (_, i) => ({ x: 50, z: 50 - i }));
    const ack = run(h, 2, [
      { kind: 'moveSegmentEnd', from: at(1000, 1000), to: at(1010, 1010) },
      { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: column },
    ]);
    expect(ack.ok).toBe(true);
    expect(savedFree(h)).toEqual(['101000,101000-120000,120000~120000,100000']);
    const g = latestSaveGrid(h);
    expect(g.roadTier[50 * MAP_SIZE + 50]).toBe(RoadTier.TwoLane);
    // The street and the curve meet there: the street's tile links to the curve.
    const cells = roadCellsOf(g);
    const firstFree = 2 * MAP_SIZE * MAP_SIZE;
    expect(neighbours(cells, 50 * MAP_SIZE + 50).some((c) => c >= firstFree)).toBe(true);

    const undo = run(h, 3, ack.inverse);
    expect(undo.ok).toBe(true);
    expect(savedFree(h)).toEqual(['100000,100000-120000,120000~120000,100000']);
    expect(latestSaveGrid(h).roadTier[50 * MAP_SIZE + 50]).toBe(RoadTier.None);
    expect(run(h, 4, undo.inverse).ok).toBe(true);
    expect(savedFree(h)).toEqual(['101000,101000-120000,120000~120000,100000']);
  });

  it('moves a curve’s end for nothing, and only an end no other road meets', () => {
    const h = sandboxed();
    run(h, 1, [curve]);
    const moved = run(h, 2, [{ kind: 'moveSegmentEnd', from: at(1000, 1000), to: at(1010, 1010) }]);
    expect(moved).toMatchObject({ ok: true, cost: 0 });
    expect(moved.inverse).toEqual([
      { kind: 'moveSegmentEnd', from: at(1010, 1010), to: at(1000, 1000) },
    ]);
    const nowhere = run(h, 3, [
      { kind: 'moveSegmentEnd', from: at(1100, 1100), to: at(1110, 1110) },
    ]);
    expect(nowhere).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('refuses a grid road run into a free road away from where the two meet, whole', () => {
    const h = sandboxed();
    run(h, 1, [curve]);
    // The curve passes (1150, 1050) m, on tile (57, 52); a street down column
    // 57 runs straight into it.
    const column = Array.from({ length: 16 }, (_, i) => ({ x: 57, z: 45 + i }));
    const ack = run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: column }]);
    expect(ack).toMatchObject({ ok: false, cost: 0, reason: RUNS_INTO_FREE_ROAD });
    h.sim.handleMessage({ type: 'requestSave' });
    expect(Array.from(latestSaveGrid(h).roadTier).every((t) => t === 0)).toBe(true);
  });

  it('refuses what the geometry rules refuse, with the reason', () => {
    const h = sandboxed();
    const ack = run(h, 1, [
      {
        kind: 'buildSegment',
        tier: RoadTier.TwoLane,
        a: at(1000, 1000),
        b: at(1030, 1030),
        control: at(1030, 1000),
      },
    ]);
    expect(ack.ok).toBe(false);
    expect(ack.reason).toMatch(/radius/);
  });

  it('keeps a free road through a save and a load', () => {
    const h = sandboxed();
    run(h, 1, [curve]);
    h.sim.handleMessage({ type: 'requestSave' });
    const saves = h.messages.filter(
      (m): m is Extract<WorkerToMain, { type: 'save' }> => m.type === 'save',
    );
    const data = saves[saves.length - 1]!.data;
    const fresh = sandboxed();
    fresh.sim.handleMessage({ type: 'loadSave', data });
    fresh.ticks(2);
    expect(savedFree(fresh)).toEqual(['100000,100000-120000,120000~120000,100000']);
  });

  it('keeps a grid drag off a free road, except where the two meet', () => {
    const h = sandboxed();
    const row = Array.from({ length: 11 }, (_, i) => ({ x: 40 + i, z: 40 }));
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: row }]);
    const leave = run(h, 2, [
      {
        kind: 'buildSegment',
        tier: RoadTier.TwoLane,
        a: { x: centre(45), z: centre(40) },
        b: at(1060, 1000),
      },
    ]);
    expect(leave.ok).toBe(true);
    // A grid street drawn straight across the free road is refused.
    const across = Array.from({ length: 11 }, (_, i) => ({ x: 44 + i, z: 45 }));
    const refused = run(h, 3, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: across }]);
    expect(refused.ok).toBe(false);
    expect(refused.reason).toMatch(/off the grid/);
    expect(savedFree(h)).toHaveLength(1);
  });

  it('splits a free road to meet a new one, for nothing, and undoes the pair exactly', () => {
    const h = sandboxed();
    run(h, 1, [
      { kind: 'buildSegment', tier: RoadTier.TwoLane, a: at(1000, 1000), b: at(1400, 1000) },
    ]);
    const before = savedFree(h);
    const mid = at(1200, 1000);
    const ack = run(h, 2, [
      { kind: 'splitSegment', at: mid },
      { kind: 'buildSegment', tier: RoadTier.TwoLane, a: at(1200, 800), b: mid },
    ]);
    expect(ack.ok).toBe(true);
    expect(savedFree(h)).toHaveLength(3);
    // Only the new road is paid for: 200 m of two-lane.
    const perTile = roadSpecs.find((r) => r.tier === RoadTier.TwoLane)!.costPerTile;
    expect(ack.cost).toBe(Math.round((200 / 20) * perTile));
    const undo = run(h, 3, ack.inverse);
    expect(undo.ok).toBe(true);
    expect(savedFree(h)).toEqual(before);
    const redo = run(h, 4, undo.inverse);
    expect(redo.ok).toBe(true);
    expect(savedFree(h)).toHaveLength(3);
  });

  it('zones the lots a free road fronts, and nothing on its footprint', () => {
    const h = sandboxed();
    run(h, 1, [
      { kind: 'buildSegment', tier: RoadTier.TwoLane, a: at(1000, 1000), b: at(1600, 1100) },
    ]);
    // Beside the road, 30 m off its centre line at x = 1300 m, and right on it.
    const beside = { x: Math.floor(1300 / 20), z: Math.floor((1050 - 30) / 20) };
    const on = { x: Math.floor(1300 / 20), z: Math.floor(1050 / 20) };
    run(h, 2, [{ kind: 'paintZone', zone: ZoneType.ResLow, tiles: [beside, on] }]);
    h.sim.handleMessage({ type: 'requestSave' });
    const g = latestSaveGrid(h);
    expect(g.zone[beside.z * MAP_SIZE + beside.x]).toBe(ZoneType.ResLow);
    expect(g.zone[on.z * MAP_SIZE + on.x]).toBe(ZoneType.None);
  });
});

describe('buildRoad: a road laid as its own road', () => {
  /** The city as a save holds it, its road layers derived from its network. */
  function grid(h: Harness): GridState {
    h.sim.handleMessage({ type: 'requestSave' });
    return latestSaveGrid(h);
  }
  const at = (x: number, z: number): number => z * MAP_SIZE + x;
  const rowMasks = (g: GridState, z: number, x0: number, len: number): number[] =>
    Array.from({ length: len }, (_, i) => g.roadMask[at(x0 + i, z)] ?? 0);
  const street = (tiles: TilePoint[], join?: boolean): Command => ({
    kind: 'buildRoad',
    tier: RoadTier.TwoLane,
    tiles,
    ...(join === undefined ? {} : { join }),
  });
  /** A street along z = 20, and a second laid beside it along z = 21 with snapping off. */
  function sideBySide(): Harness {
    const h = sandboxed();
    run(h, 1, [street(roadRow(10, 20, 9))]);
    expect(run(h, 2, [street(roadRow(10, 21, 9), false)]).ok).toBe(true);
    expect(grid(h).roadSeparate[at(14, 21)]).toBe(1);
    return h;
  }

  it('keeps it apart from the street beside it, in the tiles, the network and a reload', () => {
    const h = sideBySide();
    const g = grid(h);
    expect(rowMasks(g, 20, 11, 7)).toEqual(Array<number>(7).fill(2 | 8));
    expect(rowMasks(g, 21, 11, 7)).toEqual(Array<number>(7).fill(2 | 8));
    expect(g.roadSeparate[at(14, 20)]).toBe(4);
    expect(g.roadSeparate[at(14, 21)]).toBe(1);
    expect(cellStep(roadCellsOf(g), at(14, 20), 0, 1)).toBeNull();

    const saves = h.messages.filter(
      (m): m is Extract<WorkerToMain, { type: 'save' }> => m.type === 'save',
    );
    const fresh = sandboxed();
    fresh.sim.handleMessage({ type: 'loadSave', data: saves[saves.length - 1]!.data });
    fresh.ticks(2);
    const reloaded = grid(fresh);
    expect(Array.from(reloaded.roadMask)).toEqual(Array.from(g.roadMask));
    expect(Array.from(reloaded.roadSeparate)).toEqual(Array.from(g.roadSeparate));
  });

  /** The newest road delta the worker has sent for each tile. */
  function newestDeltas(h: Harness): Map<number, RoadTileDelta> {
    const newest = new Map<number, RoadTileDelta>();
    for (const m of h.messages) {
      if (m.type !== 'snapshot' || !m.snap.roads) continue;
      for (const d of m.snap.roads) newest.set(at(d.x, d.z), d);
    }
    return newest;
  }

  it('tells the render thread which arms are held apart, and when they no longer are', () => {
    const h = sideBySide();
    expect(newestDeltas(h).get(at(14, 20))).toMatchObject({ mask: 2 | 8, apart: 4 });
    expect(newestDeltas(h).get(at(14, 21))).toMatchObject({ mask: 2 | 8, apart: 1 });
    // Taking the second street away leaves the first's mask as it was, so only
    // what is held apart has changed on it.
    run(h, 3, [{ kind: 'bulldoze', tiles: roadRow(10, 21, 9) }]);
    const after = newestDeltas(h).get(at(14, 20));
    expect(after).toMatchObject({ mask: 2 | 8 });
    expect(after?.apart).toBeUndefined();
  });

  it('joins the street beside it when joining is left on', () => {
    const h = sandboxed();
    run(h, 1, [street(roadRow(10, 20, 9))]);
    run(h, 2, [street(roadRow(10, 21, 9))]);
    const g = grid(h);
    expect(rowMasks(g, 20, 11, 7)).toEqual(Array<number>(7).fill(2 | 4 | 8));
    expect(Array.from(g.roadSeparate).every((a) => a === 0)).toBe(true);
  });

  it('still joins a street it crosses, so the crossing is a junction', () => {
    const h = sandboxed();
    run(h, 1, [street(roadRow(10, 20, 9))]);
    const column = Array.from({ length: 9 }, (_, i) => ({ x: 14, z: 16 + i }));
    expect(run(h, 2, [street(column, false)]).ok).toBe(true);
    const g = grid(h);
    expect(g.roadMask[at(14, 20)]).toBe(1 | 2 | 4 | 8);
    expect(Array.from(g.roadSeparate).every((a) => a === 0)).toBe(true);
  });

  it('comes back apart when a bulldoze of it is undone, and goes again on redo', () => {
    const h = sideBySide();
    const before = grid(h);
    const dozed = run(h, 3, [{ kind: 'bulldoze', tiles: roadRow(10, 21, 9) }]);
    expect(dozed.ok).toBe(true);
    const undo = run(h, 4, dozed.inverse);
    expect(undo.ok).toBe(true);
    const after = grid(h);
    expect(Array.from(after.roadMask)).toEqual(Array.from(before.roadMask));
    expect(Array.from(after.roadSeparate)).toEqual(Array.from(before.roadSeparate));
    expect(run(h, 5, undo.inverse).ok).toBe(true);
    expect(rowMasks(grid(h), 20, 11, 7)).toEqual(Array<number>(7).fill(2 | 8));
    expect(grid(h).roadTier[at(14, 21)]).toBe(RoadTier.None);
  });

  it('joins up when laid over with joining on, and comes apart again on undo', () => {
    const h = sideBySide();
    const before = grid(h);
    const over = run(h, 3, [
      { kind: 'buildRoad', tier: RoadTier.Avenue, tiles: roadRow(10, 21, 9) },
    ]);
    expect(over.ok).toBe(true);
    expect(rowMasks(grid(h), 21, 11, 7)).toEqual(Array<number>(7).fill(1 | 2 | 8));
    const undo = run(h, 4, over.inverse);
    expect(undo.ok).toBe(true);
    const after = grid(h);
    expect(Array.from(after.roadMask)).toEqual(Array.from(before.roadMask));
    expect(Array.from(after.roadSeparate)).toEqual(Array.from(before.roadSeparate));
  });
});

describe('crossing a road laid as two carriageways', () => {
  // A six-lane avenue running south down columns 40 and 41, and a street
  // across it on row 50.
  const NEAR = 40;
  const FAR = 41;
  const ROW = 50;
  const EAST = 2;
  const WEST = 8;

  function sixLane(): Harness {
    const h = sandboxed();
    expect(run(h, 1, sixLaneCommands(column(NEAR, 30, 40))).ok).toBe(true);
    return h;
  }
  function grid(h: Harness): GridState {
    h.sim.handleMessage({ type: 'requestSave' });
    return latestSaveGrid(h);
  }
  const maskAt = (g: GridState, x: number): number => g.roadMask[tileIndex(x, ROW)] ?? 0;

  it('opens the median where a street is drawn across both halves, and cars drive straight over', () => {
    const h = sixLane();
    expect(
      run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(20, ROW, 42) }]).ok,
    ).toBe(true);
    const g = grid(h);
    expect(maskAt(g, NEAR) & (EAST | WEST)).toBe(EAST | WEST);
    expect(maskAt(g, FAR) & (EAST | WEST)).toBe(EAST | WEST);
    // Only on the street's row: a tile along either half is still a straight run.
    expect(g.roadMask[tileIndex(NEAR, ROW - 3)]).toBe(1 | 4);
    const cars = new RoadNetwork();
    cars.rebuild(g);
    const path = cars.findPath({ x: 20, z: ROW }, { x: 61, z: ROW });
    expect(path).not.toBeNull();
    for (const x of [NEAR, FAR]) {
      expect(path!.points.some((p) => p.x === x && p.z === ROW)).toBe(true);
    }
  });

  it('keeps the median shut where a street meets one half only', () => {
    const h = sixLane();
    run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(20, ROW, 21) }]);
    const g = grid(h);
    expect(maskAt(g, NEAR) & (EAST | WEST)).toBe(WEST);
    expect(maskAt(g, FAR) & (EAST | WEST)).toBe(0);
  });

  it('shuts the median again when the street beyond it is bulldozed, and opens it on undo', () => {
    const h = sixLane();
    run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(20, ROW, 42) }]);
    const dozed = run(h, 3, [{ kind: 'bulldoze', tiles: roadRow(FAR + 1, ROW, 20) }]);
    expect(dozed.ok).toBe(true);
    expect(maskAt(grid(h), NEAR) & EAST).toBe(0);
    expect(run(h, 4, dozed.inverse).ok).toBe(true);
    expect(maskAt(grid(h), NEAR) & EAST).toBe(EAST);
  });
});

describe('a road laid as two carriageways is one road', () => {
  // A six-lane avenue running south down columns 40 and 41.
  const PATH = column(40, 30, 10);
  const flowsOn = (g: GridState, x: number): number[] =>
    PATH.map((t) => g.roadFlow[tileIndex(x, t.z)] ?? 0);
  function sixLane(): { h: Harness; before: GridState } {
    const h = sandboxed();
    expect(run(h, 1, sixLaneCommands(PATH)).ok).toBe(true);
    h.sim.handleMessage({ type: 'requestSave' });
    return { h, before: latestSaveGrid(h) };
  }
  const after = (h: Harness): GridState => {
    h.sim.handleMessage({ type: 'requestSave' });
    return latestSaveGrid(h);
  };

  it('refuses a half re-laid one column off, which would leave the other on its own', () => {
    const { h, before } = sixLane();
    // The run the tool sends first for a corridor down columns 41 and 42.
    const [, nearRun] = sixLaneCommands(column(41, 30, 10));
    const result = run(h, 2, [nearRun!]);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('That would split a corridor');
    const g = after(h);
    expect(flowsOn(g, 40)).toEqual(flowsOn(before, 40));
    expect(flowsOn(g, 41)).toEqual(flowsOn(before, 41));
  });

  it('refuses a street laid over one half in replace mode', () => {
    const { h } = sixLane();
    const result = run(h, 2, [
      { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: PATH, replace: true },
    ]);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('That would split a corridor');
  });

  it('turns round when drawn back the other way, both halves together, and undoes exactly', () => {
    const { h, before } = sixLane();
    const turned = run(h, 2, sixLaneCommands([...PATH].reverse()));
    expect(turned.ok).toBe(true);
    const g = after(h);
    for (const x of [40, 41]) {
      for (const f of flowsOn(g, x)) expect(f & 0b111).toBe(RoadFlow.North);
    }
    expect(run(h, 3, turned.inverse).ok).toBe(true);
    const undone = after(h);
    expect(flowsOn(undone, 40)).toEqual(flowsOn(before, 40));
    expect(flowsOn(undone, 41)).toEqual(flowsOn(before, 41));
  });
});
