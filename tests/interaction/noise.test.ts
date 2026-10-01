import { describe, expect, it } from 'vitest';
import { START_FUNDS, tileIndex } from '../../src/shared/constants';
import {
  composeProfile,
  FIRST_CUSTOM_PROFILE_ID,
  NO_EDITS,
  presetProfileForTier,
  ROAD_PRESETS,
  roadPriceOf,
} from '../../src/shared/roadprofile';
import { soundWallPrice } from '../../src/shared/soundwall';
import { FieldId, RoadTier } from '../../src/shared/types';
import {
  catalog,
  initialized,
  initializedAtMilestone5,
  latestNoiseField,
  latestSaveGrid,
  roadRow,
  send,
  type Harness,
} from '../support/sim';
import { guardRoadNetwork } from '../support/guard';

guardRoadNetwork();

describe('landmark noise: the airport is heard around it', () => {
  const airport = catalog.find((e) => e.id === 'airport')!;

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

describe('road noise: a busy road is loud and a quiet one is not', () => {
  it('a busy highway raises Noise nearby more than a quiet gravel road', () => {
    // Highways need milestone 3.
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

describe('a sound wall along a busy motorway', () => {
  const WALLED = FIRST_CUSTOM_PROFILE_ID;
  const walled = composeProfile(presetProfileForTier(RoadTier.Highway), {
    ...NO_EDITS,
    soundWall: 'both',
    soundWallHeight: 6,
  });

  /** The busy motorway of the test above, with walls or without, and its noise after 24 ticks. */
  function busyMotorway(withWalls: boolean): { h: Harness; noise: Uint8Array } {
    const h = initializedAtMilestone5();
    send(h, 1, [
      ...(withWalls ? [{ kind: 'defineRoadProfile' as const, id: WALLED, profile: walled }] : []),
      {
        kind: 'buildRoad',
        tier: RoadTier.Highway,
        tiles: roadRow(100, 100, 21),
        ...(withWalls ? { profile: WALLED } : {}),
      },
      { kind: 'placeBuilding', catalogId: 'res-low-1', x: 100, z: 101, rotation: 0 },
      { kind: 'placeBuilding', catalogId: 'com-low-1', x: 120, z: 101, rotation: 0 },
    ]);
    h.ticks(24);
    expect(h.ackFor(1)!.ok).toBe(true);
    h.sim.handleMessage({ type: 'requestField', field: FieldId.Noise });
    return { h, noise: latestNoiseField(h)! };
  }

  it('is quieter behind the wall, on both sides, and no quieter on the motorway', () => {
    const open = busyMotorway(false).noise;
    const { noise } = busyMotorway(true);
    for (const z of [99, 101]) {
      expect(noise[tileIndex(110, z)]!).toBeLessThan(open[tileIndex(110, z)]!);
    }
    expect(noise[tileIndex(110, 100)]!).toBeGreaterThanOrEqual(open[tileIndex(110, 100)]!);
  });

  it('charges the wall with the road, and takes it away with the road', () => {
    const { h } = busyMotorway(true);
    const built = h.ackFor(1)!;
    const plain = initializedAtMilestone5();
    send(plain, 1, [{ kind: 'buildRoad', tier: RoadTier.Highway, tiles: roadRow(100, 100, 21) }]);
    plain.ticks(1);
    const motorway = ROAD_PRESETS.find((s) => s.tier === RoadTier.Highway)!;
    expect(plain.ackFor(1)!.cost).toBe(21 * motorway.costPerTile);
    expect(built.cost).toBe(21 * roadPriceOf(motorway, walled).costPerTile);
    expect(roadPriceOf(motorway, walled).costPerTile).toBe(
      Math.round(motorway.costPerTile + 2 * soundWallPrice(6).cost),
    );

    send(h, 2, [{ kind: 'bulldoze', tiles: roadRow(100, 100, 21) }]);
    h.ticks(1);
    h.sim.handleMessage({ type: 'requestSave' });
    expect(latestSaveGrid(h).roadTier[tileIndex(110, 100)]).toBe(RoadTier.None);
    send(h, 3, h.ackFor(2)!.inverse);
    h.ticks(1);
    h.sim.handleMessage({ type: 'requestSave' });
    expect(latestSaveGrid(h).roadProfile[tileIndex(110, 100)]).toBe(WALLED);
  });
});
