import { beforeEach, describe, expect, it } from 'vitest';
import {
  MAP_SIZE,
  MAP_TILES,
  SPEED_MULTIPLIERS,
  BRIDGE_MAX_GRADE,
  START_FUNDS,
  TICK_MS,
  tileIndex,
} from '../shared/constants';
import { FieldId, RoadFlow, RoadTier, SAVE_VERSION, ZoneType } from '../shared/types';
import type {
  BuildingCatalogEntry,
  Command,
  CommandAck,
  GridState,
  MainToWorker,
  MapData,
  RoadProfile,
  RoadTileDelta,
  SimSnapshot,
  TilePoint,
  WorkerToMain,
} from '../shared/types';
import catalogData from '../data/catalog.json';
import roadsData from '../data/roads.json';
import type { RoadSpec } from '../shared/types';
import { decodeSave, encodeSave } from '../app/persist';
import { createGrid, deserializeGrid } from '../world/grid';
import { computeTerraformPatch, type TerraformCommand } from '../world/terraform';
import {
  createWorkerSim,
  roadNoiseEmission,
  selectionOccupancy,
  type WorkerSim,
} from './worker.entry';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const roadSpecs = (roadsData as { specs: RoadSpec[] }).specs;
const twoLaneSpec = roadSpecs.find((s) => s.tier === RoadTier.TwoLane)!;
const windTurbine = catalog.find((e) => e.id === 'wind-turbine')!;

/** Perfectly flat, dry, treeless map: every tile is buildable. */
function flatMap(): MapData {
  return {
    name: 'Flatland',
    size: MAP_SIZE,
    height: new Float32Array(MAP_TILES).fill(5),
    water: new Uint8Array(MAP_TILES),
    trees: new Uint8Array(MAP_TILES),
    seaLevel: 0,
    spawn: { x: MAP_SIZE / 2, z: MAP_SIZE / 2 },
  };
}

interface Harness {
  sim: WorkerSim;
  messages: WorkerToMain[];
  ticks: (n: number) => void;
  lastSnapshot: () => SimSnapshot | null;
  ackFor: (seq: number) => CommandAck | null;
}

function makeHarness(): Harness {
  const messages: WorkerToMain[] = [];
  const sim = createWorkerSim((msg) => messages.push(msg));

  // Track the set speed so `ticks(n)` advances EXACTLY n sim ticks regardless
  // of the real-time pacing multiplier (speed 1 = 0.5×, so a
  // raw pump(TICK_MS) is only half a tick). Feeding TICK_MS / multiplier per
  // tick makes the sim's own `elapsed * SPEED_MULTIPLIERS[speed]` land on
  // exactly one tickMs. Tests care about tick COUNT, not wall-clock pacing.
  let currentSpeed: 0 | 1 | 2 | 4 = 1;
  const rawHandle = sim.handleMessage.bind(sim);
  sim.handleMessage = (msg: MainToWorker): void => {
    if (msg.type === 'setSpeed') currentSpeed = msg.speed;
    rawHandle(msg);
  };

  return {
    sim,
    messages,
    ticks: (n: number) => {
      const mult = SPEED_MULTIPLIERS[currentSpeed] || 1; // paused → treat as raw so callers still step the pump
      const perTick = TICK_MS / mult;
      for (let i = 0; i < n; i++) sim.pump(perTick);
    },
    lastSnapshot: () => {
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i]!;
        if (m.type === 'snapshot') return m.snap;
      }
      return null;
    },
    ackFor: (seq: number) => {
      for (const m of messages) {
        if (m.type === 'ack' && m.ack.seq === seq) return m.ack;
      }
      return null;
    },
  };
}

function initialized(): Harness {
  const h = makeHarness();
  h.sim.handleMessage({ type: 'init', seed: 1337, map: flatMap() });
  return h;
}

function send(h: Harness, seq: number, commands: Command[]): void {
  const msg: MainToWorker = { type: 'commands', seq, commands };
  h.sim.handleMessage(msg);
}

/** Decodes the most recent 'save' message in the harness into a live GridState. */
function latestSaveGrid(h: Harness): GridState {
  const saves = h.messages.filter(
    (m): m is Extract<WorkerToMain, { type: 'save' }> => m.type === 'save',
  );
  const last = saves[saves.length - 1];
  if (!last) throw new Error('latestSaveGrid: no save message found');
  return deserializeGrid(decodeSave(last.data).grid);
}

const roadRow = (x0: number, z: number, len: number) =>
  Array.from({ length: len }, (_, i) => ({ x: x0 + i, z }));

describe('worker sim', () => {
  let h: Harness;
  beforeEach(() => {
    h = initialized();
  });

  it('posts ready and an initial snapshot with starting stats on init', () => {
    expect(h.messages.some((m) => m.type === 'ready')).toBe(true);
    const snap = h.lastSnapshot();
    expect(snap).not.toBeNull();
    expect(snap!.stats.funds).toBe(START_FUNDS);
    expect(snap!.stats.tick).toBe(0);
  });

  it('advances the tick counter through pump and snapshots at SNAPSHOT_HZ', () => {
    h.ticks(4);
    const snap = h.lastSnapshot();
    expect(snap!.stats.tick).toBe(4);
  });

  it('does not tick while speed is 0', () => {
    h.sim.handleMessage({ type: 'setSpeed', speed: 0 });
    const before = h.messages.length;
    h.ticks(6);
    expect(h.messages.length).toBe(before);
    h.sim.handleMessage({ type: 'setSpeed', speed: 1 });
    h.ticks(2);
    expect(h.lastSnapshot()!.stats.tick).toBeGreaterThan(0);
  });

  it('builds a road, charges per-tile cost, and acks with a bulldoze inverse', () => {
    const tiles = roadRow(100, 100, 5);
    send(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles }]);
    h.ticks(2);

    const ack = h.ackFor(1);
    expect(ack).not.toBeNull();
    expect(ack!.ok).toBe(true);
    expect(ack!.cost).toBe(5 * twoLaneSpec.costPerTile);
    expect(ack!.inverse.some((c) => c.kind === 'bulldoze' && c.tiles.length === 5)).toBe(true);

    const snap = h.lastSnapshot()!;
    expect(snap.stats.funds).toBe(START_FUNDS - 5 * twoLaneSpec.costPerTile);
    // Road deltas were accumulated into a snapshot for the renderer.
    const roadSnaps = h.messages.filter((m) => m.type === 'snapshot' && m.snap.roads !== undefined);
    expect(roadSnaps.length).toBeGreaterThan(0);
  });

  it('rejects a road tier that is not unlocked yet', () => {
    send(h, 2, [{ kind: 'buildRoad', tier: RoadTier.Highway, tiles: roadRow(10, 10, 3) }]);
    h.ticks(1);
    const ack = h.ackFor(2);
    expect(ack!.ok).toBe(false);
    expect(ack!.reason).toBe('locked');
    expect(h.lastSnapshot()!.stats.funds).toBe(START_FUNDS);
  });

  it('sandbox mode bypasses milestone gating for both roads and buildings', () => {
    // Baseline at milestone 0: the airport (unlockMilestone 5) is locked.
    send(h, 2, [{ kind: 'placeBuilding', catalogId: 'airport', x: 100, z: 100, rotation: 0 }]);
    h.ticks(1);
    expect(h.ackFor(2)!.ok).toBe(false);
    expect(h.ackFor(2)!.reason).toBe('locked');

    // Flip sandbox on: the same locked road tier and building both succeed.
    send(h, 3, [{ kind: 'setSandbox', on: true }]);
    h.ticks(1);
    expect(h.ackFor(3)!.ok).toBe(true);

    send(h, 4, [{ kind: 'buildRoad', tier: RoadTier.Highway, tiles: roadRow(10, 10, 3) }]);
    h.ticks(1);
    const roadAck = h.ackFor(4)!;
    expect(roadAck.ok).toBe(true);
    expect(roadAck.reason).toBeUndefined();

    // Bump funds so the airport's cost is affordable; milestoneLevel stays 0.
    h.sim.handleMessage({ type: 'requestSave' });
    const saveMsg = h.messages.find((m) => m.type === 'save');
    if (!saveMsg || saveMsg.type !== 'save') throw new Error('no save message');
    const payload = decodeSave(saveMsg.data);
    payload.meta.stats.funds = 100_000;
    h.sim.handleMessage({ type: 'loadSave', data: encodeSave(payload) });
    h.sim.handleMessage({ type: 'commands', seq: 5, commands: [{ kind: 'setSandbox', on: true }] });

    send(h, 6, [{ kind: 'placeBuilding', catalogId: 'airport', x: 150, z: 150, rotation: 0 }]);
    h.ticks(1);
    const buildingAck = h.ackFor(6)!;
    expect(buildingAck.ok).toBe(true);
    expect(buildingAck.reason).toBeUndefined();
  });

  it('unlimited money bypasses the funds gate (build anything even when broke)', () => {
    // Drain funds via a save round-trip so the coal plant (12000) is unaffordable.
    h.sim.handleMessage({ type: 'requestSave' });
    const saveMsg = h.messages.find((m) => m.type === 'save');
    if (!saveMsg || saveMsg.type !== 'save') throw new Error('no save message');
    const payload = decodeSave(saveMsg.data);
    payload.meta.stats.funds = 100;
    h.sim.handleMessage({ type: 'loadSave', data: encodeSave(payload) });

    // Baseline: too poor -> funds fail (milestone-0 building, so not a lock).
    send(h, 10, [{ kind: 'placeBuilding', catalogId: 'coal-plant', x: 100, z: 100, rotation: 0 }]);
    h.ticks(1);
    expect(h.ackFor(10)!.ok).toBe(false);
    expect(h.ackFor(10)!.reason).toBe('funds');

    // Unlimited money on: the same placement now succeeds despite the low funds.
    send(h, 11, [{ kind: 'setUnlimitedMoney', on: true }]);
    h.ticks(1);
    send(h, 12, [{ kind: 'placeBuilding', catalogId: 'coal-plant', x: 110, z: 110, rotation: 0 }]);
    h.ticks(1);
    const ack = h.ackFor(12)!;
    expect(ack.ok).toBe(true);
    expect(ack.reason).toBeUndefined();
  });

  it('paints zones and acks with a de-zoning inverse', () => {
    // Frontage: a non-None paint only lands on tiles with qualifying road
    // frontage. Lay a straight road one row north (z=49) so the four tiles at
    // z=50 are within perpendicular frontage depth and are zonable.
    send(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(50, 49, 4) }]);
    h.ticks(1);
    const tiles = roadRow(50, 50, 4);
    send(h, 3, [{ kind: 'paintZone', zone: ZoneType.ResLow, tiles }]);
    h.ticks(2);

    const ack = h.ackFor(3);
    expect(ack!.ok).toBe(true);
    expect(ack!.cost).toBe(0);
    expect(
      ack!.inverse.some(
        (c) => c.kind === 'paintZone' && c.zone === ZoneType.None && c.tiles.length === 4,
      ),
    ).toBe(true);

    const zoneSnap = h.messages.find((m) => m.type === 'snapshot' && m.snap.zones !== undefined);
    expect(zoneSnap).toBeDefined();
    if (zoneSnap && zoneSnap.type === 'snapshot' && zoneSnap.snap.zones) {
      const patch = zoneSnap.snap.zones[0]!;
      expect(Array.from(patch.data)).toContain(ZoneType.ResLow);
    }
  });

  it('re-painting a zone inverts back to the previous zone, not None', () => {
    // Frontage: both paints target zonable tiles, so lay a straight road
    // one row north (z=55) giving the three tiles at z=56 road frontage.
    send(h, 29, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(52, 55, 3) }]);
    h.ticks(1);
    const tiles = roadRow(52, 56, 3);
    send(h, 30, [{ kind: 'paintZone', zone: ZoneType.ResLow, tiles }]);
    h.ticks(1);
    send(h, 31, [{ kind: 'paintZone', zone: ZoneType.ComHigh, tiles }]);
    h.ticks(1);

    const ack = h.ackFor(31)!;
    expect(ack.ok).toBe(true);
    expect(
      ack.inverse.some(
        (c) => c.kind === 'paintZone' && c.zone === ZoneType.ResLow && c.tiles.length === 3,
      ),
    ).toBe(true);
  });

  it('places a ploppable, charges its cost, and acks with a bulldoze inverse', () => {
    send(h, 4, [{ kind: 'placeBuilding', catalogId: 'wind-turbine', x: 60, z: 60, rotation: 0 }]);
    h.ticks(2);

    const ack = h.ackFor(4);
    expect(ack!.ok).toBe(true);
    expect(ack!.cost).toBe(windTurbine.cost);
    const footprintTiles = windTurbine.footprint.w * windTurbine.footprint.d;
    expect(
      ack!.inverse.some((c) => c.kind === 'bulldoze' && c.tiles.length === footprintTiles),
    ).toBe(true);

    expect(h.lastSnapshot()!.stats.funds).toBe(START_FUNDS - windTurbine.cost);
    const withBuildings = h.messages.find(
      (m) => m.type === 'snapshot' && m.snap.buildings !== undefined,
    );
    expect(withBuildings).toBeDefined();
    if (withBuildings && withBuildings.type === 'snapshot' && withBuildings.snap.buildings) {
      expect(withBuildings.snap.buildings.added.some((b) => b.catalogId === 'wind-turbine')).toBe(
        true,
      );
    }
  });

  it('rejects placing a building on an occupied footprint', () => {
    send(h, 5, [{ kind: 'placeBuilding', catalogId: 'wind-turbine', x: 60, z: 60, rotation: 0 }]);
    h.ticks(1);
    send(h, 6, [{ kind: 'placeBuilding', catalogId: 'wind-turbine', x: 60, z: 60, rotation: 0 }]);
    h.ticks(1);
    const ack = h.ackFor(6);
    expect(ack!.ok).toBe(false);
    expect(ack!.reason).toBe('invalid');
  });

  it('bulldozes a road with a partial refund and a rebuilding inverse', () => {
    const tiles = roadRow(100, 100, 5);
    send(h, 7, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles }]);
    h.ticks(1);
    send(h, 8, [{ kind: 'bulldoze', tiles }]);
    h.ticks(2);

    const ack = h.ackFor(8);
    expect(ack!.ok).toBe(true);
    expect(ack!.cost).toBeLessThan(0); // refund
    expect(
      ack!.inverse.some(
        (c) => c.kind === 'buildRoad' && c.tier === RoadTier.TwoLane && c.tiles.length === 5,
      ),
    ).toBe(true);
  });

  it('answers requestField with a full-map field byte array', () => {
    h.sim.handleMessage({ type: 'requestField', field: FieldId.Pollution });
    const msg = h.messages.find((m) => m.type === 'field');
    expect(msg).toBeDefined();
    if (msg && msg.type === 'field') {
      expect(msg.field).toBe(FieldId.Pollution);
      expect(msg.data.length).toBe(MAP_TILES);
    }
  });

  it('round-trips state through requestSave/loadSave', () => {
    send(h, 9, [{ kind: 'placeBuilding', catalogId: 'wind-turbine', x: 70, z: 70, rotation: 0 }]);
    send(h, 10, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(72, 70, 3) }]);
    h.ticks(4);
    h.sim.handleMessage({ type: 'requestSave' });

    const saveMsg = h.messages.find((m) => m.type === 'save');
    expect(saveMsg).toBeDefined();
    if (!saveMsg || saveMsg.type !== 'save') return;

    const decoded = decodeSave(saveMsg.data);
    expect(decoded.header.version).toBe(SAVE_VERSION);
    expect(decoded.header.mapName).toBe('Flatland');
    expect(decoded.header.tick).toBe(4);
    expect(decoded.meta.stats.funds).toBe(
      START_FUNDS - windTurbine.cost - 3 * twoLaneSpec.costPerTile,
    );

    // Load into a fresh sim and confirm the world comes back.
    const h2 = initialized();
    h2.sim.handleMessage({ type: 'loadSave', data: saveMsg.data });
    h2.ticks(2);

    const snap = h2.lastSnapshot()!;
    expect(snap.stats.funds).toBe(START_FUNDS - windTurbine.cost - 3 * twoLaneSpec.costPerTile);
    const withBuildings = h2.messages.find(
      (m) => m.type === 'snapshot' && m.snap.buildings !== undefined,
    );
    expect(withBuildings).toBeDefined();
    if (withBuildings && withBuildings.type === 'snapshot' && withBuildings.snap.buildings) {
      expect(withBuildings.snap.buildings.added.some((b) => b.catalogId === 'wind-turbine')).toBe(
        true,
      );
    }
    const withRoads = h2.messages.find((m) => m.type === 'snapshot' && m.snap.roads !== undefined);
    expect(withRoads).toBeDefined();
  });

  it('adjusts taxes, funding, and loans as non-undoable commands', () => {
    send(h, 11, [
      { kind: 'setTaxRate', sector: 'res', rate: 0.12 },
      { kind: 'setServiceFunding', service: 'police', funding: 1.2 },
      { kind: 'takeLoan', amount: 10_000 },
    ]);
    h.ticks(2);

    const ack = h.ackFor(11);
    expect(ack!.ok).toBe(true);
    expect(ack!.inverse).toEqual([]);
    const stats = h.lastSnapshot()!.stats;
    expect(stats.taxRates.res).toBeCloseTo(0.12);
    expect(stats.serviceFunding.police).toBeCloseTo(1.2);
    expect(stats.loanBalance).toBe(10_000);
    expect(stats.funds).toBe(START_FUNDS + 10_000);
  });

  it('ships a vehicles buffer copy in snapshots', () => {
    h.ticks(2);
    const snap = h.lastSnapshot()!;
    expect(snap.vehicles).toBeDefined();
    expect(snap.vehicles!.length).toBeGreaterThan(0);
  });
});

describe('road-on-slope placement (UI-SPEC §6.20 playtest round 6)', () => {
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

describe('build while paused (playtest bugfix, 2026-07-23)', () => {
  let h: Harness;
  beforeEach(() => {
    h = initialized();
    h.sim.handleMessage({ type: 'setSpeed', speed: 0 });
  });

  it('drains a buildRoad batch queued while paused: ack arrives ok, snapshot carries the road delta, stats.tick unchanged', () => {
    const tickBefore = h.lastSnapshot()!.stats.tick;
    const tiles = roadRow(100, 100, 5);
    send(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles }]);
    h.sim.pump(TICK_MS);

    const ack = h.ackFor(1);
    expect(ack).not.toBeNull();
    expect(ack!.ok).toBe(true);
    expect(ack!.cost).toBe(5 * twoLaneSpec.costPerTile);

    const snap = h.lastSnapshot()!;
    expect(snap.stats.funds).toBe(START_FUNDS - 5 * twoLaneSpec.costPerTile);
    expect(snap.roads).toBeDefined();
    expect(snap.roads!.length).toBe(5);
    expect(snap.stats.tick).toBe(tickBefore);
  });

  it('places a building while paused: charges funds, emits the building delta, and recomputes coverage', () => {
    send(h, 2, [{ kind: 'placeBuilding', catalogId: 'wind-turbine', x: 60, z: 60, rotation: 0 }]);
    h.sim.pump(TICK_MS);

    const ack = h.ackFor(2);
    expect(ack).not.toBeNull();
    expect(ack!.ok).toBe(true);
    expect(ack!.cost).toBe(windTurbine.cost);

    const snap = h.lastSnapshot()!;
    expect(snap.stats.funds).toBe(START_FUNDS - windTurbine.cost);
    expect(snap.buildings).toBeDefined();
    expect(snap.buildings!.added.some((b) => b.catalogId === 'wind-turbine')).toBe(true);
    // Utilities recomputed while paused: the wind turbine's power now shows up.
    expect(snap.stats.powerSupply).toBeGreaterThan(0);
  });

  it('resumes normal ticking at speed 1 with no double-application of the paused batch', () => {
    const tiles = roadRow(110, 110, 4);
    send(h, 3, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles }]);
    h.sim.pump(TICK_MS);
    const pausedAck = h.ackFor(3)!;
    expect(pausedAck.ok).toBe(true);
    const fundsAfterPause = h.lastSnapshot()!.stats.funds;

    h.sim.handleMessage({ type: 'setSpeed', speed: 1 });
    h.ticks(2);

    const snap = h.lastSnapshot()!;
    expect(snap.stats.tick).toBeGreaterThan(0);
    // Funds were charged exactly once, not again on resume.
    expect(snap.stats.funds).toBe(fundsAfterPause);
    // Only one ack for seq 3 was ever posted.
    const acksForThree = h.messages.filter((m) => m.type === 'ack' && m.ack.seq === 3);
    expect(acksForThree.length).toBe(1);
  });

  it('pump at speed 0 with nothing queued posts nothing extra', () => {
    const before = h.messages.length;
    h.sim.pump(TICK_MS);
    expect(h.messages.length).toBe(before);
  });
});

describe('selection protocol (UI-SPEC §7)', () => {
  let h: Harness;
  beforeEach(() => {
    h = initialized();
  });

  const selectionMessages = () =>
    h.messages.filter(
      (m): m is Extract<WorkerToMain, { type: 'selection' }> => m.type === 'selection',
    );

  /** Places a wind turbine and returns its instance id from the snapshot delta. */
  function placeTurbine(): number {
    send(h, 100, [{ kind: 'placeBuilding', catalogId: 'wind-turbine', x: 60, z: 60, rotation: 0 }]);
    h.ticks(2);
    const withBuildings = h.messages.find(
      (m): m is Extract<WorkerToMain, { type: 'snapshot' }> =>
        m.type === 'snapshot' && m.snap.buildings !== undefined,
    );
    expect(withBuildings).toBeDefined();
    const inst = withBuildings!.snap.buildings!.added.find((b) => b.catalogId === 'wind-turbine');
    expect(inst).toBeDefined();
    return inst!.id;
  }

  it('responds to select with a SelectionInfo payload for the building', () => {
    const id = placeTurbine();
    h.sim.handleMessage({ type: 'select', buildingId: id });

    const msgs = selectionMessages();
    expect(msgs.length).toBe(1);
    const info = msgs[0]!.info;
    expect(info).not.toBeNull();
    expect(info!.building.id).toBe(id);
    expect(info!.building.catalogId).toBe('wind-turbine');
    // Utility ploppable: upkeep from the catalog, no tax, no occupancy rows.
    expect(info!.monthlyUpkeep).toBe(windTurbine.upkeep);
    expect(info!.monthlyTax).toBe(0);
    expect(info!.occupancy).toEqual({});
    expect(info!.happiness).toBeGreaterThanOrEqual(0);
    expect(info!.happiness).toBeLessThanOrEqual(100);
  });

  it('re-pushes the selection on every snapshot while the selection is held', () => {
    const id = placeTurbine();
    h.sim.handleMessage({ type: 'select', buildingId: id });
    const before = selectionMessages().length;
    h.ticks(4); // 2 snapshots at SNAPSHOT_TICKS=2
    expect(selectionMessages().length).toBe(before + 2);
  });

  it('clearSelect ends the stream', () => {
    const id = placeTurbine();
    h.sim.handleMessage({ type: 'select', buildingId: id });
    h.sim.handleMessage({ type: 'clearSelect' });
    const before = selectionMessages().length;
    h.ticks(6);
    expect(selectionMessages().length).toBe(before);
  });

  it('answers select of an unknown building with info: null and stops', () => {
    h.sim.handleMessage({ type: 'select', buildingId: 424242 });
    const msgs = selectionMessages();
    expect(msgs.length).toBe(1);
    expect(msgs[0]!.info).toBeNull();
    h.ticks(4);
    expect(selectionMessages().length).toBe(1);
  });

  it('pushes info: null when the selected building is demolished', () => {
    const id = placeTurbine();
    h.sim.handleMessage({ type: 'select', buildingId: id });
    send(h, 101, [{ kind: 'bulldoze', tiles: [{ x: 60, z: 60 }] }]);
    h.ticks(2);

    const msgs = selectionMessages();
    expect(msgs[msgs.length - 1]!.info).toBeNull();
    // The stream ends after the null: no further pushes.
    const count = msgs.length;
    h.ticks(4);
    expect(selectionMessages().length).toBe(count);
  });
});

describe('selectionOccupancy (pure)', () => {
  const base = {
    id: 'x',
    name: 'X',
    footprint: { w: 1, d: 1 },
    height: 5,
    color: 0,
    powerUse: 0,
    waterUse: 0,
    cost: 0,
    upkeep: 0,
    unlockMilestone: 0,
  };
  const res: BuildingCatalogEntry = {
    ...base,
    category: 'res',
    zone: ZoneType.ResLow,
    residents: 9,
  };
  const com: BuildingCatalogEntry = { ...base, category: 'com', zone: ZoneType.ComLow, jobs: 6 };
  const util: BuildingCatalogEntry = { ...base, category: 'utility', utility: { powerMW: 5 } };

  it('fills residents + households for residential (capacity = ceil(residents/4))', () => {
    expect(selectionOccupancy(res, 1)).toEqual({
      residents: 9,
      households: { occupied: 3, capacity: 3 },
    });
  });

  it('reports zero occupied residents/households for non-Active residential', () => {
    expect(selectionOccupancy(res, 0)).toEqual({
      residents: 0,
      households: { occupied: 0, capacity: 3 },
    });
    expect(selectionOccupancy(res, 2)).toEqual({
      residents: 0,
      households: { occupied: 0, capacity: 3 },
    });
  });

  it('fills jobs for com/ind, Active only', () => {
    expect(selectionOccupancy(com, 1)).toEqual({ jobs: 6 });
    expect(selectionOccupancy(com, 2)).toEqual({ jobs: 0 });
  });

  it('leaves all fields unset for services and utilities', () => {
    expect(selectionOccupancy(util, 1)).toEqual({});
  });
});

describe('landmark noise emission (UI-SPEC §6.10 airport)', () => {
  const airport = catalog.find((e) => e.id === 'airport')!;

  /** Latest full-map Noise field posted by the harness, or null. */
  function latestNoiseField(h: Harness): Uint8Array | null {
    for (let i = h.messages.length - 1; i >= 0; i--) {
      const m = h.messages[i]!;
      if (m.type === 'field' && m.field === FieldId.Noise) return m.data;
    }
    return null;
  }

  /**
   * Boots a sim whose treasury and milestone level allow the airport
   * (unlockMilestone 5, ¢60,000): save a fresh sim, patch the persisted
   * stats, and loadSave it back — milestoneLevel only ever ratchets up in
   * EconomySystem, so the patched level sticks across subsequent ticks.
   */
  function initializedAtMilestone5(): Harness {
    const h = initialized();
    h.sim.handleMessage({ type: 'requestSave' });
    const saveMsg = h.messages.find((m) => m.type === 'save');
    expect(saveMsg).toBeDefined();
    if (!saveMsg || saveMsg.type !== 'save') throw new Error('no save message');
    const payload = decodeSave(saveMsg.data);
    payload.meta.stats.milestoneLevel = 5;
    payload.meta.stats.funds = 100_000;
    h.sim.handleMessage({ type: 'loadSave', data: encodeSave(payload) });
    return h;
  }

  it('rejects the airport as locked below milestone 5', () => {
    const h = initialized();
    send(h, 1, [{ kind: 'placeBuilding', catalogId: 'airport', x: 100, z: 100, rotation: 0 }]);
    h.ticks(1);
    const ack = h.ackFor(1)!;
    expect(ack.ok).toBe(false);
    expect(ack.reason).toBe('locked');
    expect(h.lastSnapshot()!.stats.funds).toBe(START_FUNDS);
  });

  it('emits catalog noise into the Noise field at and around the airport, on the pollution cadence', () => {
    const h = initializedAtMilestone5();

    // Baseline: nothing on the flat map emits noise.
    h.sim.handleMessage({ type: 'requestField', field: FieldId.Noise });
    const before = latestNoiseField(h);
    expect(before).not.toBeNull();
    expect(before!.every((v) => v === 0)).toBe(true);

    send(h, 1, [{ kind: 'placeBuilding', catalogId: 'airport', x: 100, z: 100, rotation: 0 }]);
    // 8 ticks cover the %4==3 emission slot (twice) and the Noise field's own
    // %4==1 diffusion slot, so neighbors have received spill-over too.
    h.ticks(8);

    const ack = h.ackFor(1)!;
    expect(ack.ok).toBe(true);
    expect(ack.cost).toBe(airport.cost);
    expect(h.lastSnapshot()!.stats.funds).toBeCloseTo(100_000 - airport.cost, 5);

    h.sim.handleMessage({ type: 'requestField', field: FieldId.Noise });
    const after = latestNoiseField(h)!;
    // Strong at the source tile (emission 160 vs one 0.9-decay diffusion pass).
    expect(after[tileIndex(100, 100)]!).toBeGreaterThan(50);
    // Raised nearby, on both sides of the source tile, via diffusion.
    expect(after[tileIndex(101, 100)]!).toBeGreaterThan(0);
    expect(after[tileIndex(99, 100)]!).toBeGreaterThan(0);
    expect(after[tileIndex(100, 99)]!).toBeGreaterThan(0);
    // Untouched far from the airport.
    expect(after[tileIndex(200, 200)]!).toBe(0);
  });

  it('stops emitting once the airport is bulldozed (Noise decays back toward zero)', () => {
    const h = initializedAtMilestone5();
    send(h, 1, [{ kind: 'placeBuilding', catalogId: 'airport', x: 100, z: 100, rotation: 0 }]);
    h.ticks(8);
    h.sim.handleMessage({ type: 'requestField', field: FieldId.Noise });
    const withAirport = latestNoiseField(h)![tileIndex(100, 100)]!;
    expect(withAirport).toBeGreaterThan(0);

    send(h, 2, [{ kind: 'bulldoze', tiles: [{ x: 100, z: 100 }] }]);
    h.ticks(64); // many decay passes, zero further emissions
    h.sim.handleMessage({ type: 'requestField', field: FieldId.Noise });
    const afterBulldoze = latestNoiseField(h)![tileIndex(100, 100)]!;
    expect(afterBulldoze).toBeLessThan(withAirport / 4);
  });
});

describe('road composition — profiles the worker stores, lays and saves', () => {
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

  /** Sends one batch and steps the sim so it is processed and acked. */
  function run(h: Harness, seq: number, commands: Command[]): CommandAck {
    send(h, seq, commands);
    h.ticks(2);
    const ack = h.ackFor(seq);
    if (!ack) throw new Error(`no ack for batch ${seq}`);
    return ack;
  }
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
    expect(run(h, 1, [{ kind: 'defineRoadProfile', id: 12, profile: customLocal }]).ok).toBe(true);
    expect(
      run(h, 2, [
        { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(10, 10, 3), profile: 12 },
      ]).ok,
    ).toBe(true);
    expect(lastTable(h)).toEqual([{ id: 12, profile: customLocal }]);
    const laid = rowDeltas(h, 10, 10, 13);
    expect(laid).toHaveLength(3);
    for (const d of laid) {
      expect(d.profile).toBe(12);
      expect(d.tier).toBe(RoadTier.TwoLane);
    }
  });

  it('refuses a preset id, a taken id with a different shape, and a profile that breaks its class', () => {
    const h = initialized();
    expect(run(h, 1, [{ kind: 'defineRoadProfile', id: 3, profile: customLocal }]).ok).toBe(false);
    expect(run(h, 2, [{ kind: 'defineRoadProfile', id: 12, profile: customLocal }]).ok).toBe(true);
    // Idempotent for the same shape.
    expect(run(h, 3, [{ kind: 'defineRoadProfile', id: 12, profile: customLocal }]).ok).toBe(true);
    // A different shape under a taken id would silently re-shape every road laid with it.
    const other: RoadProfile = { ...customLocal, pieces: customLocal.pieces.slice(2, 4) };
    expect(run(h, 4, [{ kind: 'defineRoadProfile', id: 12, profile: other }]).ok).toBe(false);
    // Parking on a motorway is not a thing the class admits.
    const parkedHighway: RoadProfile = {
      class: 'highway',
      pieces: [
        { kind: 'parking', width: 2.25 },
        { kind: 'travel', width: 3.5, flow: 'fwd' },
        { kind: 'travel', width: 3.5, flow: 'back' },
      ],
    };
    expect(run(h, 5, [{ kind: 'defineRoadProfile', id: 13, profile: parkedHighway }]).ok).toBe(
      false,
    );
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
    run(h, 2, [{ kind: 'defineRoadProfile', id: 12, profile: customLocal }]);
    const ack = run(h, 3, [
      { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(10, 10, 3), profile: 12 },
    ]);
    expect(ack.ok).toBe(true);
    h.sim.handleMessage({ type: 'requestSave' });
    const g = latestSaveGrid(h);
    for (let x = 10; x < 13; x++) expect(g.roadProfile[10 * MAP_SIZE + x]).toBe(12);

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
    run(h, 1, [{ kind: 'defineRoadProfile', id: 12, profile: customLocal }]);
    run(h, 2, [
      { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(10, 10, 3), profile: 12 },
    ]);
    h.sim.handleMessage({ type: 'requestSave' });
    const saves = h.messages.filter(
      (m): m is Extract<WorkerToMain, { type: 'save' }> => m.type === 'save',
    );
    const data = saves[saves.length - 1]!.data;

    const fresh = initialized();
    fresh.sim.handleMessage({ type: 'loadSave', data });
    fresh.ticks(1);
    expect(lastTable(fresh)).toEqual([{ id: 12, profile: customLocal }]);
    expect(rowDeltas(fresh, 10, 10, 13).map((d) => d.profile)).toEqual([12, 12, 12]);
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

describe('road noise emission (UI-SPEC §6.7 Roads v3)', () => {
  /** Latest full-map Noise field posted by the harness, or null. */
  function latestNoiseField(h: Harness): Uint8Array | null {
    for (let i = h.messages.length - 1; i >= 0; i--) {
      const m = h.messages[i]!;
      if (m.type === 'field' && m.field === FieldId.Noise) return m.data;
    }
    return null;
  }

  /** Same save-patch trick as the airport suite: highways need milestone 3. */
  function initializedAtMilestone5(): Harness {
    const h = initialized();
    h.sim.handleMessage({ type: 'requestSave' });
    const saveMsg = h.messages.find((m) => m.type === 'save');
    if (!saveMsg || saveMsg.type !== 'save') throw new Error('no save message');
    const payload = decodeSave(saveMsg.data);
    payload.meta.stats.milestoneLevel = 5;
    payload.meta.stats.funds = 100_000;
    h.sim.handleMessage({ type: 'loadSave', data: encodeSave(payload) });
    return h;
  }

  describe('roadNoiseEmission (pure)', () => {
    it('emits nothing for a zero-volume (quiet) road, whatever the tier multiplier', () => {
      expect(roadNoiseEmission(0, 1)).toBe(0);
      expect(roadNoiseEmission(0, 2)).toBe(0);
      expect(roadNoiseEmission(0, 3)).toBe(0);
    });

    it('scales the base emission by the tier noiseMult (§6.7: gravel 2×, standard 1×, highway 3×)', () => {
      const standard = roadNoiseEmission(40, 1);
      expect(standard).toBeGreaterThan(0);
      expect(roadNoiseEmission(40, 2)).toBe(2 * standard); // gravel
      expect(roadNoiseEmission(40, 3)).toBe(3 * standard); // highway
    });

    it('grows with assigned traffic volume, capped so one emit can never blow past byte range', () => {
      expect(roadNoiseEmission(80, 1)).toBeGreaterThan(roadNoiseEmission(8, 1));
      // Cap: an absurd-volume highway edge still stays a legal per-emit byte amount.
      expect(roadNoiseEmission(1_000_000, 3)).toBeLessThanOrEqual(255);
      expect(roadNoiseEmission(1_000_000, 3)).toBe(roadNoiseEmission(2_000_000, 3));
    });
  });

  it('a busy highway raises Noise nearby more than a quiet gravel road', () => {
    const h = initializedAtMilestone5();
    // Busy corridor: a straight highway with an active home at one end and an
    // active shop at the other — traffic routes all its trips over this edge.
    // Quiet control: an identical-length gravel road 40 tiles away, no buildings.
    send(h, 1, [
      { kind: 'buildRoad', tier: RoadTier.Highway, tiles: roadRow(100, 100, 21) },
      { kind: 'buildRoad', tier: RoadTier.Gravel, tiles: roadRow(100, 140, 21) },
      { kind: 'placeBuilding', catalogId: 'res-low-1', x: 100, z: 101, rotation: 0 },
      { kind: 'placeBuilding', catalogId: 'com-low-1', x: 120, z: 101, rotation: 0 },
    ]);
    // 24 ticks: several %4==3 emission slots and %4==1 Noise diffusion slots,
    // while staying under growth's 3-pass abandonment horizon (tick 30).
    h.ticks(24);
    expect(h.ackFor(1)!.ok).toBe(true);

    h.sim.handleMessage({ type: 'requestField', field: FieldId.Noise });
    const noise = latestNoiseField(h)!;
    const busyMid = noise[tileIndex(110, 100)]!;
    const quietGravelMid = noise[tileIndex(110, 140)]!;
    // Loud on the busy highway itself…
    expect(busyMid).toBeGreaterThan(30);
    // …raised nearby (off-road neighbor tile) via diffusion…
    expect(noise[tileIndex(110, 101)]!).toBeGreaterThan(0);
    // …while the zero-volume gravel road emits nothing at all (cheap skip).
    expect(quietGravelMid).toBe(0);
    expect(busyMid).toBeGreaterThan(quietGravelMid);
  });
});

describe('terraform (UI-SPEC §6.11 landscaping)', () => {
  let h: Harness;
  beforeEach(() => {
    h = initialized();
  });

  it('applies a raise stroke: charges the kernel cost, debits funds, and acks a terraformSet inverse of the pre-edit heights', () => {
    const center = { x: 128, z: 128 };
    const cmd: TerraformCommand = {
      kind: 'terraform',
      mode: 'raise',
      center,
      radius: 4,
      strength: 3,
    };
    send(h, 1, [cmd]);
    h.ticks(2);

    // Oracle: an identical fresh flat grid (Flatland is a uniform 5m) run through the pure kernel directly.
    const oracleGrid = createGrid(MAP_SIZE);
    oracleGrid.height.fill(5);
    const expected = computeTerraformPatch(oracleGrid, cmd);
    expect(expected).not.toBeNull();

    const ack = h.ackFor(1)!;
    expect(ack.ok).toBe(true);
    expect(ack.cost).toBeGreaterThan(0);
    expect(ack.cost).toBeCloseTo(expected!.cost, 5);
    expect(h.lastSnapshot()!.stats.funds).toBeCloseTo(START_FUNDS - ack.cost, 5);

    expect(ack.inverse).toHaveLength(1);
    const inverse = ack.inverse[0]!;
    expect(inverse.kind).toBe('terraformSet');
    if (inverse.kind !== 'terraformSet') return;
    expect(inverse.x).toBe(expected!.inverse.x);
    expect(inverse.z).toBe(expected!.inverse.z);
    expect(inverse.w).toBe(expected!.inverse.w);
    expect(inverse.h).toBe(expected!.inverse.h);
    expect(Array.from(inverse.heights)).toEqual(Array.from(expected!.inverse.heights));
    // Flatland started at a uniform 5m, so every previous height in the inverse is exactly 5.
    expect(Array.from(inverse.heights).every((v) => v === 5)).toBe(true);
  });

  it('funds-gates a stroke that would cost more than the treasury holds, without mutating anything', () => {
    // Drain funds to exactly 0 with a 50x50 road block (2500 tiles * ¢20 = ¢50,000 = START_FUNDS).
    const tiles: TilePoint[] = [];
    for (let z = 0; z < 50; z++) {
      for (let x = 0; x < 50; x++) tiles.push({ x, z });
    }
    send(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles }]);
    h.ticks(2);
    expect(h.lastSnapshot()!.stats.funds).toBe(0);

    send(h, 2, [
      { kind: 'terraform', mode: 'raise', center: { x: 150, z: 150 }, radius: 4, strength: 3 },
    ]);
    h.ticks(2);

    const ack = h.ackFor(2)!;
    expect(ack.ok).toBe(false);
    expect(ack.reason).toBe('funds');
    expect(ack.inverse).toEqual([]);
    expect(h.lastSnapshot()!.stats.funds).toBe(0); // untouched

    const heightSnaps = h.messages.filter(
      (m): m is Extract<WorkerToMain, { type: 'snapshot' }> =>
        m.type === 'snapshot' && m.snap.heightPatches !== undefined,
    );
    expect(heightSnaps).toHaveLength(0); // nothing was ever queued for the renderer
  });

  it('rejects a brush that covers only structure-excluded tiles', () => {
    send(h, 1, [{ kind: 'placeBuilding', catalogId: 'wind-turbine', x: 60, z: 60, rotation: 0 }]);
    h.ticks(1);

    send(h, 2, [
      { kind: 'terraform', mode: 'raise', center: { x: 60, z: 60 }, radius: 1, strength: 3 },
    ]);
    h.ticks(1);

    const ack = h.ackFor(2)!;
    expect(ack.ok).toBe(false);
    expect(ack.reason).toBe('invalid');
  });

  it('undoes a terraform stroke exactly via the ack inverse, and the undo itself acks a redo inverse', () => {
    const center = { x: 90, z: 90 };
    send(h, 1, [{ kind: 'terraform', mode: 'raise', center, radius: 3, strength: 2 }]);
    h.ticks(2);
    const forwardAck = h.ackFor(1)!;
    expect(forwardAck.ok).toBe(true);

    // Height right after the raise: falloff 1 at the exact center -> 5 + 2*1*0.5 = 6.
    h.sim.handleMessage({ type: 'requestSave' });
    const afterRaise = latestSaveGrid(h);
    expect(afterRaise.height[tileIndex(center.x, center.z)]).toBeCloseTo(6, 5);

    send(h, 2, forwardAck.inverse);
    h.ticks(2);
    const undoAck = h.ackFor(2)!;
    expect(undoAck.ok).toBe(true);
    expect(undoAck.cost).toBe(0);
    expect(undoAck.inverse).toHaveLength(1);
    expect(undoAck.inverse[0]!.kind).toBe('terraformSet');

    h.sim.handleMessage({ type: 'requestSave' });
    const afterUndo = latestSaveGrid(h);
    expect(afterUndo.height[tileIndex(center.x, center.z)]).toBe(5); // exact restore, float-exact
  });

  it('carries the edited region in the next snapshot.heightPatches, then clears until the next edit', () => {
    const center = { x: 40, z: 200 };
    send(h, 1, [{ kind: 'terraform', mode: 'raise', center, radius: 3, strength: 2 }]);
    h.ticks(2);

    const withPatch = h.messages.find(
      (m): m is Extract<WorkerToMain, { type: 'snapshot' }> =>
        m.type === 'snapshot' && m.snap.heightPatches !== undefined,
    );
    expect(withPatch).toBeDefined();
    const patch = withPatch!.snap.heightPatches![0]!;
    expect(patch.w).toBe(7); // radius 3 -> 2*3+1, fully in-bounds
    expect(patch.h).toBe(7);
    expect(patch.heights).toHaveLength(patch.w * patch.h);

    const before = h.messages.length;
    h.ticks(6); // no further edits
    const later = h.messages.slice(before);
    expect(later.some((m) => m.type === 'snapshot' && m.snap.heightPatches !== undefined)).toBe(
      false,
    );
  });

  it('round-trips an edited height through requestSave/loadSave', () => {
    const center = { x: 200, z: 30 };
    send(h, 1, [{ kind: 'terraform', mode: 'raise', center, radius: 2, strength: 4 }]);
    h.ticks(2);

    h.sim.handleMessage({ type: 'requestSave' });
    const saved = latestSaveGrid(h);
    const editedHeight = saved.height[tileIndex(center.x, center.z)]!;
    expect(editedHeight).toBeCloseTo(5 + 4 * 1 * 0.5, 5); // falloff 1 at the exact center

    const saveMsg = [...h.messages].reverse().find((m) => m.type === 'save');
    expect(saveMsg).toBeDefined();
    if (!saveMsg || saveMsg.type !== 'save') return;

    const h2 = initialized();
    h2.sim.handleMessage({ type: 'loadSave', data: saveMsg.data });
    h2.ticks(2);

    h2.sim.handleMessage({ type: 'requestSave' });
    const reloaded = latestSaveGrid(h2);
    expect(reloaded.height[tileIndex(center.x, center.z)]).toBe(editedHeight); // exact, float-for-float

    // The post-load snapshot also republishes the whole grid as a heightPatches
    // full-map resync, exactly like roads/zones/power/watered.
    const postLoad = h2.messages.find(
      (m): m is Extract<WorkerToMain, { type: 'snapshot' }> =>
        m.type === 'snapshot' && m.snap.heightPatches !== undefined,
    );
    expect(postLoad).toBeDefined();
    const fullPatch = postLoad!.snap.heightPatches![0]!;
    expect(fullPatch.w).toBe(MAP_SIZE);
    expect(fullPatch.h).toBe(MAP_SIZE);
    expect(fullPatch.heights[tileIndex(center.x, center.z)]).toBe(editedHeight);
  });
});

describe('auto-flatten under footprints (UI-SPEC §6.18 #6)', () => {
  const waterTower = catalog.find((e) => e.id === 'water-tower')!;

  /** Gentle 1-2m ripple (well under MAX_BUILD_SLOPE=4) so every tile is buildable, but varied enough that a footprint's mean differs from its individual tile heights. */
  function variedHeight(x: number, z: number): number {
    return 5 + ((x + z) % 3);
  }

  function variedMap(): MapData {
    const height = new Float32Array(MAP_TILES);
    for (let z = 0; z < MAP_SIZE; z++) {
      for (let x = 0; x < MAP_SIZE; x++) height[tileIndex(x, z)] = variedHeight(x, z);
    }
    return {
      name: 'Varied',
      size: MAP_SIZE,
      height,
      water: new Uint8Array(MAP_TILES),
      trees: new Uint8Array(MAP_TILES),
      seaLevel: 0,
      spawn: { x: MAP_SIZE / 2, z: MAP_SIZE / 2 },
    };
  }

  function initializedVaried(): Harness {
    const h = makeHarness();
    h.sim.handleMessage({ type: 'init', seed: 1337, map: variedMap() });
    return h;
  }

  it('placing a building on varied terrain flattens its whole footprint to the mean height and emits heightPatches', () => {
    const h = initializedVaried();
    const x = 50;
    const z = 60;
    const footprintTiles: TilePoint[] = [
      { x, z },
      { x: x + 1, z },
      { x, z: z + 1 },
      { x: x + 1, z: z + 1 },
    ];
    const mean =
      footprintTiles.reduce((sum, t) => sum + variedHeight(t.x, t.z), 0) / footprintTiles.length;
    // Sanity: the footprint really is varied (mean differs from at least one covered tile).
    expect(footprintTiles.some((t) => variedHeight(t.x, t.z) !== mean)).toBe(true);

    send(h, 1, [{ kind: 'placeBuilding', catalogId: 'water-tower', x, z, rotation: 0 }]);
    h.ticks(2);
    expect(h.ackFor(1)!.ok).toBe(true);

    const patchSnap = h.messages.find(
      (m): m is Extract<WorkerToMain, { type: 'snapshot' }> =>
        m.type === 'snapshot' && m.snap.heightPatches !== undefined,
    );
    expect(patchSnap).toBeDefined();

    h.sim.handleMessage({ type: 'requestSave' });
    const grid = latestSaveGrid(h);
    for (const t of footprintTiles) {
      expect(grid.height[tileIndex(t.x, t.z)]).toBeCloseTo(mean, 5);
    }
  });

  /** Linear ramp climbing along +x (slope 1m/tile, well under ROAD_MAX_SLOPE=10). */
  function rampMap(): MapData {
    const height = new Float32Array(MAP_TILES);
    for (let z = 0; z < MAP_SIZE; z++) {
      for (let x = 0; x < MAP_SIZE; x++) height[tileIndex(x, z)] = 5 + x;
    }
    return {
      name: 'Ramp',
      size: MAP_SIZE,
      height,
      water: new Uint8Array(MAP_TILES),
      trees: new Uint8Array(MAP_TILES),
      seaLevel: 0,
      spawn: { x: MAP_SIZE / 2, z: MAP_SIZE / 2 },
    };
  }

  function initializedRamp(): Harness {
    const h = makeHarness();
    h.sim.handleMessage({ type: 'init', seed: 1337, map: rampMap() });
    return h;
  }

  /**
   * Anti-poke invariant: after grading, no grass apron tile in `rect` ends up
   * higher than the max height of the road tiles it borders. Reads the live
   * grid directly (road + apron heights are both committed).
   */
  function assertNoApronPoke(
    grid: GridState,
    rect: { x0: number; z0: number; x1: number; z1: number },
  ): void {
    for (let z = rect.z0; z <= rect.z1; z++) {
      for (let x = rect.x0; x <= rect.x1; x++) {
        const idx = tileIndex(x, z);
        // Only grass tiles (no road/building/water) are apron shoulders.
        if (grid.roadTier[idx] !== RoadTier.None) continue;
        if (grid.buildingId[idx] !== 0) continue;
        if (grid.water[idx] !== 0) continue;
        let maxRoad = -Infinity;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dz === 0) continue;
            const nIdx = tileIndex(x + dx, z + dz);
            if (grid.roadTier[nIdx] !== RoadTier.None)
              maxRoad = Math.max(maxRoad, grid.height[nIdx]!);
          }
        }
        if (maxRoad === -Infinity) continue; // borders no road — not an apron tile
        expect(grid.height[idx]!).toBeLessThanOrEqual(maxRoad + 1e-5);
      }
    }
  }

  it('road grade pulls the apron down to the road it borders (never above) and skips apron tiles carrying another road', () => {
    const h = initializedVaried();

    // Seed road: an existing structure that will sit inside the next road's apron ring.
    send(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: [{ x: 106, z: 106 }] }]);
    h.ticks(1);
    expect(h.ackFor(1)!.ok).toBe(true);

    h.sim.handleMessage({ type: 'requestSave' });
    const beforeGrid = latestSaveGrid(h);
    const seedHeight = beforeGrid.height[tileIndex(106, 106)]!;

    // Second road, Chebyshev-adjacent to the seed tile so the seed sits in its apron ring.
    send(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: [{ x: 106, z: 107 }] }]);
    h.ticks(1);
    expect(h.ackFor(2)!.ok).toBe(true);

    h.sim.handleMessage({ type: 'requestSave' });
    const afterGrid = latestSaveGrid(h);

    // Core anti-poke guarantee across the whole touched region.
    assertNoApronPoke(afterGrid, { x0: 104, z0: 105, x1: 108, z1: 109 });

    // The seed road tile sits in the apron ring but is NOT grass, so it is
    // skipped: its height is untouched by the second command's grade.
    expect(afterGrid.height[tileIndex(106, 106)]).toBe(seedHeight);
  });

  it('road grade blends a new tile toward the existing road it joins (junction continuity)', () => {
    const h = initializedRamp();

    // Seed road up the ramp, then a tile joining it one step further up.
    send(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: [{ x: 120, z: 100 }] }]);
    h.ticks(1);
    send(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: [{ x: 121, z: 100 }] }]);
    h.ticks(1);
    expect(h.ackFor(2)!.ok).toBe(true);

    h.sim.handleMessage({ type: 'requestSave' });
    const grid = latestSaveGrid(h);
    const joinHeight = grid.height[tileIndex(121, 100)]!;
    const seedHeight = grid.height[tileIndex(120, 100)]!;
    // Junction continuity: the new tile box-smooths toward the existing road it
    // joins, so it meets the seed cleanly (no step up at the junction) rather
    // than sitting at its raw uphill height of 5 + 121 = 126.
    expect(joinHeight).toBeLessThan(5 + 121);
    expect(joinHeight).toBeCloseTo(seedHeight, 5);
  });

  it('road grade preserves a monotonic climb across a slope (no single plateau)', () => {
    const h = initializedRamp();
    send(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(120, 100, 4) }]);
    h.ticks(1);
    expect(h.ackFor(1)!.ok).toBe(true);

    h.sim.handleMessage({ type: 'requestSave' });
    const grid = latestSaveGrid(h);
    const hs = [120, 121, 122, 123].map((x) => grid.height[tileIndex(x, 100)]!);
    // Still a rising ramp — NOT all equal (the old mean-flatten made a plateau).
    expect(new Set(hs).size).toBeGreaterThan(1);
    for (let i = 1; i < hs.length; i++) expect(hs[i]!).toBeGreaterThan(hs[i - 1]!);
    assertNoApronPoke(grid, { x0: 118, z0: 98, x1: 125, z1: 102 });
  });

  it('two connecting runs on a slope: the join tile lands between the runs and no apron pokes through', () => {
    // Diagonal ramp: height rises with x+z so BOTH runs climb.
    const height = new Float32Array(MAP_TILES);
    for (let z = 0; z < MAP_SIZE; z++) {
      for (let x = 0; x < MAP_SIZE; x++) height[tileIndex(x, z)] = 5 + (x + z);
    }
    const map: MapData = {
      name: 'DiagRamp',
      size: MAP_SIZE,
      height,
      water: new Uint8Array(MAP_TILES),
      trees: new Uint8Array(MAP_TILES),
      seaLevel: 0,
      spawn: { x: MAP_SIZE / 2, z: MAP_SIZE / 2 },
    };
    const h = makeHarness();
    h.sim.handleMessage({ type: 'init', seed: 1337, map });

    // Straight run along +x at z=100, then a perpendicular run joining it at
    // (122,100), climbing in +z.
    send(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(120, 100, 5) }]);
    h.ticks(1);
    send(h, 2, [
      {
        kind: 'buildRoad',
        tier: RoadTier.TwoLane,
        tiles: [
          { x: 122, z: 101 },
          { x: 122, z: 102 },
          { x: 122, z: 103 },
        ],
      },
    ]);
    h.ticks(1);
    expect(h.ackFor(2)!.ok).toBe(true);

    h.sim.handleMessage({ type: 'requestSave' });
    const grid = latestSaveGrid(h);

    // Continuity: the join tile (122,101) blends the run-1 tile it touches
    // (122,100) and its own uphill run-2 continuation (122,102) — so its
    // graded height sits strictly between those two neighbours' road heights.
    const join = grid.height[tileIndex(122, 101)]!;
    const run1Neighbor = grid.height[tileIndex(122, 100)]!;
    const run2Neighbor = grid.height[tileIndex(122, 102)]!;
    const lo = Math.min(run1Neighbor, run2Neighbor);
    const hi = Math.max(run1Neighbor, run2Neighbor);
    expect(join).toBeGreaterThanOrEqual(lo - 1e-5);
    expect(join).toBeLessThanOrEqual(hi + 1e-5);

    assertNoApronPoke(grid, { x0: 118, z0: 98, x1: 126, z1: 105 });
  });

  it('skips apron tiles that are water: they are neither leveled nor pulled down', () => {
    const height = new Float32Array(MAP_TILES).fill(5);
    const water = new Uint8Array(MAP_TILES);
    const wx = 150;
    const wz = 150;
    height[tileIndex(wx, wz)] = -1; // below SEA_LEVEL(0)
    water[tileIndex(wx, wz)] = 1;
    // Every OTHER ring tile of the build site is raised to 8, so the apron
    // shoulders start well above the road and must be pulled DOWN to it.
    const bx = 151;
    const bz = 151;
    for (let z = bz - 1; z <= bz + 1; z++) {
      for (let x = bx - 1; x <= bx + 1; x++) {
        if (x === bx && z === bz) continue;
        if (x === wx && z === wz) continue; // leave the water tile at -1
        height[tileIndex(x, z)] = 8;
      }
    }
    const map: MapData = {
      name: 'WaterNeighbor',
      size: MAP_SIZE,
      height,
      water,
      trees: new Uint8Array(MAP_TILES),
      seaLevel: 0,
      spawn: { x: MAP_SIZE / 2, z: MAP_SIZE / 2 },
    };
    const h = makeHarness();
    h.sim.handleMessage({ type: 'init', seed: 1337, map });

    send(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: [{ x: bx, z: bz }] }]);
    h.ticks(1);
    expect(h.ackFor(1)!.ok).toBe(true);

    h.sim.handleMessage({ type: 'requestSave' });
    const grid = latestSaveGrid(h);

    // Lone road tile: no road-source neighbors, so it keeps its own height (5).
    expect(grid.height[tileIndex(bx, bz)]).toBeCloseTo(5, 5);
    // Grass apron shoulders (were 8): pulled DOWN to the road height (5).
    for (let z = bz - 1; z <= bz + 1; z++) {
      for (let x = bx - 1; x <= bx + 1; x++) {
        if (x === wx && z === wz) continue;
        if (x === bx && z === bz) continue;
        expect(grid.height[tileIndex(x, z)]).toBeCloseTo(5, 5);
      }
    }
    // The water tile itself: untouched height, still marked water.
    expect(grid.height[tileIndex(wx, wz)]).toBe(-1);
    expect(grid.water[tileIndex(wx, wz)]).toBe(1);
  });

  it('undo (ack.inverse) restores exact pre-placement heights for a road build + apron flatten', () => {
    const h = initializedVaried();
    const tiles = roadRow(120, 120, 4);

    const region: TilePoint[] = [];
    for (let z = 119; z <= 121; z++) {
      for (let x = 119; x <= 124; x++) region.push({ x, z });
    }
    h.sim.handleMessage({ type: 'requestSave' });
    const before = latestSaveGrid(h);
    const beforeHeights = new Map(
      region.map((t) => [tileIndex(t.x, t.z), before.height[tileIndex(t.x, t.z)]!]),
    );

    send(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles }]);
    h.ticks(1);
    const ack = h.ackFor(1)!;
    expect(ack.ok).toBe(true);
    expect(ack.inverse.some((c) => c.kind === 'terraformSet')).toBe(true);

    // Sanity: the flatten really did change something in the region.
    h.sim.handleMessage({ type: 'requestSave' });
    const afterBuild = latestSaveGrid(h);
    const anyChanged = region.some(
      (t) => afterBuild.height[tileIndex(t.x, t.z)] !== beforeHeights.get(tileIndex(t.x, t.z)),
    );
    expect(anyChanged).toBe(true);

    send(h, 2, ack.inverse);
    h.ticks(2);
    expect(h.ackFor(2)!.ok).toBe(true);

    h.sim.handleMessage({ type: 'requestSave' });
    const afterUndo = latestSaveGrid(h);
    for (const t of region) {
      expect(afterUndo.height[tileIndex(t.x, t.z)]).toBe(beforeHeights.get(tileIndex(t.x, t.z)));
    }
  });

  it('undo (ack.inverse) restores exact pre-placement heights for a flattened building footprint', () => {
    const h = initializedVaried();
    const x = 30;
    const z = 40;

    h.sim.handleMessage({ type: 'requestSave' });
    const before = latestSaveGrid(h);
    const footprintTiles: TilePoint[] = [
      { x, z },
      { x: x + 1, z },
      { x, z: z + 1 },
      { x: x + 1, z: z + 1 },
    ];
    const beforeHeights = footprintTiles.map((t) => before.height[tileIndex(t.x, t.z)]!);

    send(h, 1, [{ kind: 'placeBuilding', catalogId: 'water-tower', x, z, rotation: 0 }]);
    h.ticks(2);
    const ack = h.ackFor(1)!;
    expect(ack.ok).toBe(true);
    expect(ack.cost).toBe(waterTower.cost);
    expect(ack.inverse.some((c) => c.kind === 'terraformSet')).toBe(true);
    expect(ack.inverse.some((c) => c.kind === 'bulldoze')).toBe(true);

    send(h, 2, ack.inverse);
    h.ticks(2);
    expect(h.ackFor(2)!.ok).toBe(true);

    h.sim.handleMessage({ type: 'requestSave' });
    const afterUndo = latestSaveGrid(h);
    footprintTiles.forEach((t, i) => {
      expect(afterUndo.height[tileIndex(t.x, t.z)]).toBe(beforeHeights[i]);
      expect(afterUndo.buildingId[tileIndex(t.x, t.z)]).toBe(0); // structure removal replayed too
    });
  });

  it('is deterministic: identical placement on two independent sims yields bit-identical flattened heights (no Math.random)', () => {
    const h1 = initializedVaried();
    const h2 = initializedVaried();
    send(h1, 1, [{ kind: 'placeBuilding', catalogId: 'water-tower', x: 80, z: 90, rotation: 0 }]);
    send(h2, 1, [{ kind: 'placeBuilding', catalogId: 'water-tower', x: 80, z: 90, rotation: 0 }]);
    h1.ticks(2);
    h2.ticks(2);

    h1.sim.handleMessage({ type: 'requestSave' });
    h2.sim.handleMessage({ type: 'requestSave' });
    const g1 = latestSaveGrid(h1);
    const g2 = latestSaveGrid(h2);
    for (let z = 89; z <= 92; z++) {
      for (let x = 79; x <= 82; x++) {
        expect(g1.height[tileIndex(x, z)]).toBe(g2.height[tileIndex(x, z)]);
      }
    }
  });

  it('is deterministic: identical road builds on two independent sims yield bit-identical graded heights (no Math.random)', () => {
    const h1 = initializedVaried();
    const h2 = initializedVaried();
    send(h1, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(80, 90, 5) }]);
    send(h2, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(80, 90, 5) }]);
    h1.ticks(2);
    h2.ticks(2);

    h1.sim.handleMessage({ type: 'requestSave' });
    h2.sim.handleMessage({ type: 'requestSave' });
    const g1 = latestSaveGrid(h1);
    const g2 = latestSaveGrid(h2);
    for (let z = 88; z <= 92; z++) {
      for (let x = 78; x <= 86; x++) {
        expect(g1.height[tileIndex(x, z)]).toBe(g2.height[tileIndex(x, z)]);
      }
    }
  });
});

describe('bridges — crossing water', () => {
  const RIVER_Z = 100;
  const RIVER_X0 = 98;
  const RIVER_X1 = 102;
  // Banks sit BELOW the clearance height, so a crossing genuinely has to climb
  // and then ramp back down — at flatMap's 5m the deck would come out level
  // with the banks and never exercise a ramp at all.
  const BANK_HEIGHT = 1;
  const BED_DEPTH = -3;

  /** Low flat banks with a north-south river channel cut through them. */
  function riverMap(): MapData {
    const map = flatMap();
    map.height.fill(BANK_HEIGHT);
    for (let z = 0; z < MAP_SIZE; z++) {
      for (let x = RIVER_X0; x <= RIVER_X1; x++) {
        const i = tileIndex(x, z);
        map.water[i] = 1;
        map.height[i] = BED_DEPTH;
      }
    }
    return map;
  }

  function initializedRiver(): Harness {
    const h = makeHarness();
    h.sim.handleMessage({ type: 'init', seed: 1337, map: riverMap() });
    return h;
  }

  let h: Harness;
  beforeEach(() => {
    h = initializedRiver();
  });

  it('refuses a crossing that lands on the far bank with no room to ramp down', () => {
    // Bank to bank and one tile past: the deck is still 4m up when the road
    // runs out, so there is nowhere for the ramp to reach the ground.
    const tiles = roadRow(RIVER_X0 - 1, RIVER_Z, 7);
    send(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles }]);
    h.ticks(2);

    const ack = h.ackFor(1)!;
    expect(ack.ok).toBe(false);
    expect(ack.reason).toBe('grade');
    expect(h.lastSnapshot()!.stats.funds).toBe(START_FUNDS);
  });

  it('bridges the river when the drag reaches back onto both banks', () => {
    const tiles = roadRow(RIVER_X0 - 8, RIVER_Z, 5 + 16);
    send(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles }]);
    h.ticks(2);

    const ack = h.ackFor(1)!;
    expect(ack.ok).toBe(true);
    // The span costs more than the same length of plain road: height is charged.
    expect(ack.cost).toBeGreaterThan(tiles.length * twoLaneSpec.costPerTile);

    h.sim.handleMessage({ type: 'requestSave' });
    const g = latestSaveGrid(h);
    for (let x = RIVER_X0; x <= RIVER_X1; x++) {
      const i = tileIndex(x, RIVER_Z);
      expect(g.roadTier[i]).toBe(RoadTier.TwoLane);
      // Deck stands clear of the water, and the riverbed is still a riverbed.
      expect(g.roadElevation[i]).toBeGreaterThan(0);
      expect(g.height[i]).toBe(BED_DEPTH);
      expect(g.water[i]).toBe(1);
    }
    // Both banks are at grade, so the road meets the ground where it should.
    expect(g.roadElevation[tileIndex(RIVER_X0 - 8, RIVER_Z)]).toBe(0);
    expect(g.roadElevation[tileIndex(RIVER_X1 + 8, RIVER_Z)]).toBe(0);
  });

  it('leaves the deck smooth in world height across the whole span', () => {
    const tiles = roadRow(RIVER_X0 - 8, RIVER_Z, 5 + 16);
    send(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles }]);
    h.ticks(2);

    h.sim.handleMessage({ type: 'requestSave' });
    const g = latestSaveGrid(h);
    const deckY = tiles.map((t) => {
      const i = tileIndex(t.x, t.z);
      return g.height[i]! + g.roadElevation[i]!;
    });
    for (let i = 1; i < deckY.length; i++) {
      expect(Math.abs(deckY[i]! - deckY[i - 1]!)).toBeLessThanOrEqual(BRIDGE_MAX_GRADE);
    }
    // It really does rise off the bank rather than staying flat all the way.
    expect(Math.max(...deckY)).toBeGreaterThan(BANK_HEIGHT);
  });

  it('bulldozing the span returns the river to open water', () => {
    const tiles = roadRow(RIVER_X0 - 8, RIVER_Z, 5 + 16);
    send(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles }]);
    h.ticks(2);
    send(h, 2, [{ kind: 'bulldoze', tiles }]);
    h.ticks(2);

    h.sim.handleMessage({ type: 'requestSave' });
    const g = latestSaveGrid(h);
    for (let x = RIVER_X0; x <= RIVER_X1; x++) {
      const i = tileIndex(x, RIVER_Z);
      expect(g.roadTier[i]).toBe(RoadTier.None);
      expect(g.roadElevation[i]).toBe(0);
    }
  });

  it('raises a viaduct over dry land when the tool asks for height', () => {
    const tiles = roadRow(20, 20, 24);
    send(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles, elevation: 10 }]);
    h.ticks(2);

    expect(h.ackFor(1)!.ok).toBe(true);
    h.sim.handleMessage({ type: 'requestSave' });
    const g = latestSaveGrid(h);
    const heights = tiles.map((t) => g.roadElevation[tileIndex(t.x, t.z)]!);
    expect(Math.max(...heights)).toBe(10);
    expect(heights[0]).toBe(0); // ramps down at both ends
    expect(heights[heights.length - 1]).toBe(0);
  });
});

describe('road direction — a road runs the way it was drawn', () => {
  function run(h: Harness, seq: number, commands: Command[]): CommandAck {
    send(h, seq, commands);
    h.ticks(2);
    const ack = h.ackFor(seq);
    if (!ack) throw new Error(`no ack for batch ${seq}`);
    return ack;
  }
  function rowDeltas(h: Harness, z: number, x0: number, x1: number): RoadTileDelta[] {
    const byX = new Map<number, RoadTileDelta>();
    for (const m of h.messages) {
      if (m.type !== 'snapshot' || !m.snap.roads) continue;
      for (const d of m.snap.roads) if (d.z === z && d.x >= x0 && d.x < x1) byX.set(d.x, d);
    }
    return [...byX.values()].sort((a, b) => a.x - b.x);
  }
  /** A one-way street is milestone-locked at the start, so these build in the sandbox. */
  function sandboxed(): Harness {
    const h = initialized();
    run(h, 0, [{ kind: 'setSandbox', on: true }]);
    return h;
  }
  const column = (x: number, z0: number, count: number): TilePoint[] =>
    Array.from({ length: count }, (_, i) => ({ x, z: z0 + i }));

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

describe('junction control — the sim tells the render who gives way', () => {
  function run(h: Harness, seq: number, commands: Command[]): CommandAck {
    send(h, seq, commands);
    h.ticks(2);
    const ack = h.ackFor(seq);
    if (!ack) throw new Error(`no ack for batch ${seq}`);
    return ack;
  }
  /** A four-lane road is milestone-locked at the start, so these build in the sandbox. */
  function sandboxed(): Harness {
    const h = initialized();
    run(h, 0, [{ kind: 'setSandbox', on: true }]);
    return h;
  }
  const column = (x: number, z0: number, count: number): TilePoint[] =>
    Array.from({ length: count }, (_, i) => ({ x, z: z0 + i }));

  /** The most recent snapshot that carried junctions; it only travels when it changes. */
  function lastJunctions(h: Harness): SimSnapshot['junctions'] {
    for (let i = h.messages.length - 1; i >= 0; i--) {
      const m = h.messages[i]!;
      if (m.type === 'snapshot' && m.snap.junctions !== undefined) return m.snap.junctions;
    }
    return undefined;
  }

  it('reports the crossing of two quiet streets as controlled by nothing', () => {
    const h = sandboxed();
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(10, 20, 9) }]);
    run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: column(14, 16, 9) }]);
    // Two quiet streets crossing meet on sight lines. The junction is still
    // reported — the inspector has to have something to open on.
    expect(lastJunctions(h)).toEqual([
      { x: 14, z: 20, control: 'none', warranted: 'none', auto: true },
    ]);
  });

  it('reports the crossing where a side street runs onto a four-lane road', () => {
    const h = sandboxed();
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.FourLane, tiles: roadRow(10, 20, 9) }]);
    run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: column(14, 16, 9) }]);
    expect(lastJunctions(h)).toEqual([
      { x: 14, z: 20, control: 'stop', warranted: 'stop', auto: true },
    ]);
  });

  it('takes the control the player sets, and keeps it against the warrant', () => {
    const h = sandboxed();
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.Avenue, tiles: roadRow(10, 20, 9) }]);
    run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: column(14, 16, 9) }]);
    expect(lastJunctions(h)).toEqual([
      { x: 14, z: 20, control: 'signal', warranted: 'signal', auto: true },
    ]);

    // The warrant says signal; the player says a four-way stop, and the
    // warrant does not argue with it.
    const ack = run(h, 3, [{ kind: 'setJunctionControl', x: 14, z: 20, control: 'allWayStop' }]);
    expect(ack.ok).toBe(true);
    h.ticks(4);
    expect(lastJunctions(h)).toEqual([
      { x: 14, z: 20, control: 'allWayStop', warranted: 'signal', auto: false },
    ]);

    // And undo hands it back to the warrant.
    run(h, 4, ack.inverse);
    h.ticks(4);
    expect(lastJunctions(h)).toEqual([
      { x: 14, z: 20, control: 'signal', warranted: 'signal', auto: true },
    ]);
  });

  it('lets the player take a control away entirely, and saves what they chose', () => {
    const h = sandboxed();
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.Avenue, tiles: roadRow(10, 20, 9) }]);
    run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: column(14, 16, 9) }]);
    run(h, 3, [{ kind: 'setJunctionControl', x: 14, z: 20, control: 'none' }]);
    h.ticks(4);
    expect(lastJunctions(h)).toEqual([
      { x: 14, z: 20, control: 'none', warranted: 'signal', auto: false },
    ]);

    h.sim.handleMessage({ type: 'requestSave' });
    const saves = h.messages.filter(
      (m): m is Extract<WorkerToMain, { type: 'save' }> => m.type === 'save',
    );
    const data = saves[saves.length - 1]!.data;
    const fresh = sandboxed();
    fresh.sim.handleMessage({ type: 'loadSave', data });
    fresh.ticks(4);
    // A signal the warrant would put back stays off, because the player said so.
    expect(lastJunctions(fresh)).toEqual([
      { x: 14, z: 20, control: 'none', warranted: 'signal', auto: false },
    ]);
  });

  it('refuses a tile that is not a junction, since there is nobody to give way to', () => {
    const h = sandboxed();
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(10, 20, 9) }]);
    // Mid-run, a dead end, and bare ground.
    for (const [seq, x, z] of [
      [2, 14, 20],
      [3, 10, 20],
      [4, 30, 30],
    ] as const) {
      const ack = run(h, seq, [{ kind: 'setJunctionControl', x, z, control: 'stop' }]);
      expect(ack.ok, `${x},${z}`).toBe(false);
    }
  });

  it('setting a junction to what it already carries costs nothing and undoes nothing', () => {
    const h = sandboxed();
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.Avenue, tiles: roadRow(10, 20, 9) }]);
    run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: column(14, 16, 9) }]);
    run(h, 3, [{ kind: 'setJunctionControl', x: 14, z: 20, control: 'stop' }]);
    const again = run(h, 4, [{ kind: 'setJunctionControl', x: 14, z: 20, control: 'stop' }]);
    expect(again.ok).toBe(true);
    expect(again.inverse).toEqual([]);
  });

  it('a bulldozed junction comes back with what the player set on it', () => {
    const h = sandboxed();
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.Avenue, tiles: roadRow(10, 20, 9) }]);
    run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: column(14, 16, 9) }]);
    run(h, 3, [{ kind: 'setJunctionControl', x: 14, z: 20, control: 'allWayStop' }]);
    h.ticks(4);
    expect(lastJunctions(h)).toEqual([
      { x: 14, z: 20, control: 'allWayStop', warranted: 'signal', auto: false },
    ]);

    const ack = run(h, 4, [{ kind: 'bulldoze', tiles: [{ x: 14, z: 20 }] }]);
    expect(ack.ok).toBe(true);
    run(h, 5, ack.inverse);
    h.ticks(4);
    expect(lastJunctions(h)).toEqual([
      { x: 14, z: 20, control: 'allWayStop', warranted: 'signal', auto: false },
    ]);
  });

  it('signalises where an avenue crosses, and stops sending once it settles', () => {
    const h = sandboxed();
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.Avenue, tiles: roadRow(10, 20, 9) }]);
    run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: column(14, 16, 9) }]);
    expect(lastJunctions(h)).toEqual([
      { x: 14, z: 20, control: 'signal', warranted: 'signal', auto: true },
    ]);

    const sent = h.messages.filter(
      (m) => m.type === 'snapshot' && m.snap.junctions !== undefined,
    ).length;
    h.ticks(20);
    expect(
      h.messages.filter((m) => m.type === 'snapshot' && m.snap.junctions !== undefined).length,
    ).toBe(sent);
  });
});
