import { beforeEach, describe, expect, it } from 'vitest';
import { MAP_TILES, START_FUNDS, TICK_MS } from '../../src/shared/constants';
import { FieldId, RoadTier, SAVE_VERSION, ZoneType } from '../../src/shared/types';
import { decodeSave, encodeSave } from '../../src/app/persist';
import { initialized, roadRow, send, twoLaneSpec, windTurbine, type Harness } from '../support/sim';
import { guardRoadNetwork } from '../support/guard';

guardRoadNetwork();

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

describe('building while paused', () => {
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

  it('sends a building placed and bulldozed before the snapshot as a removal only, never also as an addition', () => {
    send(h, 4, [
      { kind: 'placeBuilding', catalogId: 'wind-turbine', x: 60, z: 60, rotation: 0 },
      { kind: 'bulldoze', tiles: [{ x: 60, z: 60 }] },
    ]);
    h.sim.pump(TICK_MS);

    const buildings = h.lastSnapshot()!.buildings!;
    expect(buildings.removed.length).toBe(1);
    const [id] = buildings.removed;
    expect(buildings.added.some((b) => b.id === id)).toBe(false);
    expect(buildings.updated.some((b) => b.id === id)).toBe(false);
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
