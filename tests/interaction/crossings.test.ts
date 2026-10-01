import { beforeEach, describe, expect, it } from 'vitest';
import { MAP_SIZE, BRIDGE_MAX_GRADE, START_FUNDS, tileIndex } from '../../src/shared/constants';
import { RoadFlow, RoadTier } from '../../src/shared/types';
import type { GridState, MapData, RoadTileDelta } from '../../src/shared/types';
import {
  column,
  flatMap,
  initialized,
  latestSaveGrid,
  makeHarness,
  roadRow,
  run,
  send,
  sixLaneCommands,
  twoLaneSpec,
  type Harness,
} from '../support/sim';
import { guardRoadNetwork } from '../support/guard';

guardRoadNetwork();

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

describe('overpasses — a road passing over another on the tile they cross', () => {
  function grid(h: Harness): GridState {
    h.sim.handleMessage({ type: 'requestSave' });
    return latestSaveGrid(h);
  }
  const at = (x: number, z: number): number => z * MAP_SIZE + x;
  /** A motorway running south down x = 20, and a street drag east across it at z = 14. */
  function withMotorway(): Harness {
    const h = initialized();
    run(h, 0, [{ kind: 'setSandbox', on: true }]);
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.Highway, tiles: column(20, 6, 17) }]);
    return h;
  }
  const across = roadRow(12, 14, 17); // x 12..28, crossing x = 20 at its middle

  it('lays the crossing tile on the over layer and leaves the motorway under it', () => {
    const h = withMotorway();
    const ack = run(h, 2, [
      { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: across, elevation: 8 },
    ]);
    expect(ack.ok).toBe(true);
    const g = grid(h);
    expect(g.roadTier[at(20, 14)]).toBe(RoadTier.Highway);
    expect(g.roadElevation[at(20, 14)]).toBe(0);
    expect(g.overTier[at(20, 14)]).toBe(RoadTier.TwoLane);
    expect(g.overElevation[at(20, 14)]).toBeGreaterThanOrEqual(5.75);
    expect((g.overFlow[at(20, 14)] ?? 0) & 7).toBe(RoadFlow.East);
    // The approaches either side are ordinary elevated road tiles.
    expect(g.roadTier[at(19, 14)]).toBe(RoadTier.TwoLane);
    expect(g.roadElevation[at(19, 14)]).toBeGreaterThan(0);
  });

  it('bulldozes a corridor bridging the motorway whole, and leaves the motorway beneath', () => {
    const h = withMotorway();
    const raised = sixLaneCommands(roadRow(12, 13, 17)).map((c) =>
      c.kind === 'buildRoad' ? { ...c, elevation: 8 } : c,
    );
    expect(run(h, 2, raised).ok).toBe(true);
    const before = grid(h);
    for (const z of [13, 14]) expect(before.overTier[at(20, z)]).toBe(RoadTier.Avenue);
    const dozed = run(h, 3, [{ kind: 'bulldoze', tiles: [{ x: 20, z: 13 }] }]);
    expect(dozed.ok).toBe(true);
    const g = grid(h);
    for (const z of [13, 14]) {
      expect(g.overTier[at(20, z)]).toBe(0);
      expect(g.roadTier[at(20, z)]).toBe(RoadTier.Highway);
    }
    expect(run(h, 4, dozed.inverse).ok).toBe(true);
    const undone = grid(h);
    for (const z of [13, 14]) {
      expect(undone.overFlow[at(20, z)]).toBe(before.overFlow[at(20, z)]);
      expect(undone.overElevation[at(20, z)]).toBe(before.overElevation[at(20, z)]);
    }
  });

  it('refuses a deck that would not clear the road below, and says by how much', () => {
    const h = withMotorway();
    const ack = run(h, 2, [
      { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: across, elevation: 4 },
    ]);
    expect(ack.ok).toBe(false);
    expect(ack.reason).toMatch(/clear the road below by 5\.8 m/);
    expect(grid(h).overTier[at(20, 14)]).toBe(0);
  });

  it('refuses crossing over the end of a road rather than a road running through', () => {
    const h = initialized();
    run(h, 0, [{ kind: 'setSandbox', on: true }]);
    // The motorway stops at z = 14, right under the drag.
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.Highway, tiles: column(20, 6, 9) }]);
    const ack = run(h, 2, [
      { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: across, elevation: 8 },
    ]);
    expect(ack.ok).toBe(false);
    expect(ack.reason).toMatch(/straight over/);
    expect(grid(h).overTier[at(20, 14)]).toBe(0);
  });

  it('never lets a drag that ends on the road below become an overpass', () => {
    const h = withMotorway();
    const ack = run(h, 2, [
      { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(12, 14, 9), elevation: 8 },
    ]);
    // It comes down to meet the ground at its end, which is a street meeting
    // a motorway — refused for that, and nothing is laid.
    expect(ack.ok).toBe(false);
    expect(grid(h).overTier[at(20, 14)]).toBe(0);
    expect(grid(h).roadTier[at(19, 14)]).toBe(RoadTier.None);
  });

  it('undoes an overpass by taking away exactly the road passing over', () => {
    const h = withMotorway();
    const built = run(h, 2, [
      { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: across, elevation: 8 },
    ]);
    expect(built.ok).toBe(true);
    expect(grid(h).overTier[at(20, 14)]).toBe(RoadTier.TwoLane);
    expect(run(h, 3, built.inverse).ok).toBe(true);
    const g = grid(h);
    expect(g.overTier[at(20, 14)]).toBe(0);
    expect(g.roadTier[at(20, 14)]).toBe(RoadTier.Highway);
    expect(g.roadTier[at(19, 14)]).toBe(RoadTier.None);
  });

  it('bulldozes the road on top first, and its undo puts it back exactly', () => {
    const h = withMotorway();
    run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: across, elevation: 8 }]);
    const before = grid(h);
    const deck = before.overElevation[at(20, 14)];
    const flow = before.overFlow[at(20, 14)];
    expect(before.overTier[at(20, 14)]).toBe(RoadTier.TwoLane);
    const dozed = run(h, 3, [{ kind: 'bulldoze', tiles: [{ x: 20, z: 14 }] }]);
    expect(dozed.ok).toBe(true);
    let g = grid(h);
    expect(g.overTier[at(20, 14)]).toBe(0);
    expect(g.roadTier[at(20, 14)]).toBe(RoadTier.Highway);
    expect(run(h, 4, dozed.inverse).ok).toBe(true);
    g = grid(h);
    expect(g.overTier[at(20, 14)]).toBe(RoadTier.TwoLane);
    expect(g.overElevation[at(20, 14)]).toBe(deck);
    expect(g.overFlow[at(20, 14)]).toBe(flow);
  });

  it('refuses raising the road below up into the overpass', () => {
    const h = withMotorway();
    run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: across, elevation: 8 }]);
    const ack = run(h, 3, [
      { kind: 'buildRoad', tier: RoadTier.Highway, tiles: column(20, 6, 17), elevation: 6 },
    ]);
    expect(ack.ok).toBe(false);
    expect(ack.reason).toMatch(/overpass above/);
    expect(grid(h).roadElevation[at(20, 14)]).toBe(0);
  });

  it('crosses a pair of carriageways, one crossing tile after the other', () => {
    const h = initialized();
    run(h, 0, [{ kind: 'setSandbox', on: true }]);
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.Highway, tiles: column(20, 6, 17) }]);
    run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.Highway, tiles: column(21, 6, 17).reverse() }]);
    const ack = run(h, 3, [
      { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(12, 14, 18), elevation: 8 },
    ]);
    expect(ack.ok).toBe(true);
    const g = grid(h);
    expect(g.overTier[at(20, 14)]).toBe(RoadTier.TwoLane);
    expect(g.overTier[at(21, 14)]).toBe(RoadTier.TwoLane);
    expect(g.roadTier[at(21, 14)]).toBe(RoadTier.Highway);
  });

  it('keeps the masks honest as a crossing is laid and taken away', () => {
    const h = withMotorway();
    run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: across, elevation: 8 }]);
    let g = grid(h);
    expect(g.roadMask[at(20, 14)]).toBe(1 | 4); // the motorway runs on, joined to nothing across
    expect((g.roadMask[at(19, 14)] ?? 0) & 2).toBe(2); // the approach joins the overpass
    run(h, 3, [{ kind: 'bulldoze', tiles: [{ x: 20, z: 14 }] }]);
    g = grid(h);
    // Left in the air beside the motorway, the approach joins nothing there.
    expect((g.roadMask[at(19, 14)] ?? 0) & 2).toBe(0);
    expect(g.roadMask[at(20, 14)]).toBe(1 | 4);
  });

  it('tells the render thread about the road passing over, and when it goes', () => {
    const h = withMotorway();
    const latest = (): RoadTileDelta | undefined =>
      h.messages
        .flatMap((m) => (m.type === 'snapshot' && m.snap.roads ? m.snap.roads : []))
        .filter((d) => d.x === 20 && d.z === 14)
        .pop();
    run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: across, elevation: 8 }]);
    const laid = latest();
    expect(laid?.tier).toBe(RoadTier.Highway);
    expect(laid?.over).toMatchObject({ tier: RoadTier.TwoLane, mask: 2 | 8 });
    expect(laid?.over?.elevation).toBeGreaterThanOrEqual(5.75);
    run(h, 3, [{ kind: 'bulldoze', tiles: [{ x: 20, z: 14 }] }]);
    expect(latest()?.over).toBeUndefined();
    expect(latest()?.tier).toBe(RoadTier.Highway);
  });
});

describe('a road drawn under a road already raised above it', () => {
  function grid(h: Harness): GridState {
    h.sim.handleMessage({ type: 'requestSave' });
    return latestSaveGrid(h);
  }
  const at = (x: number, z: number): number => z * MAP_SIZE + x;
  const across = roadRow(12, 14, 17); // x 12..28, passing under x = 20 at its middle
  /** A viaduct running south down x = 20, at its full height over z = 14. */
  function withViaduct(tier: RoadTier = RoadTier.TwoLane, elevation = 8, map?: MapData): Harness {
    const h = makeHarness();
    h.sim.handleMessage({ type: 'init', seed: 1337, map: map ?? flatMap() });
    run(h, 0, [{ kind: 'setSandbox', on: true }]);
    const built = run(h, 1, [{ kind: 'buildRoad', tier, tiles: column(20, 6, 17), elevation }]);
    expect(built.ok).toBe(true);
    return h;
  }

  it('moves the viaduct onto the over layer as it stands and lays the drag beneath', () => {
    const h = withViaduct();
    const before = grid(h);
    const deck = before.roadElevation[at(20, 14)]!;
    const flow = before.roadFlow[at(20, 14)]!;
    expect(deck).toBe(8);
    const ack = run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: across }]);
    expect(ack.ok).toBe(true);
    const g = grid(h);
    expect(g.overTier[at(20, 14)]).toBe(RoadTier.TwoLane);
    expect(g.overElevation[at(20, 14)]).toBe(deck);
    expect(g.overFlow[at(20, 14)]).toBe(flow);
    expect(g.roadTier[at(20, 14)]).toBe(RoadTier.TwoLane);
    expect(g.roadElevation[at(20, 14)]).toBe(0);
    expect((g.roadFlow[at(20, 14)] ?? 0) & 7).toBe(RoadFlow.East);
    // The road beneath runs on east and west; the viaduct joins its own approaches.
    expect(g.roadMask[at(20, 14)]).toBe(2 | 8);
    expect((g.roadMask[at(20, 13)] ?? 0) & 4).toBe(4);
    expect(g.roadElevation[at(20, 13)]).toBeGreaterThan(0);
  });

  it('passes under a motorway viaduct, which a street could never meet', () => {
    const h = withViaduct(RoadTier.Highway);
    const ack = run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: across }]);
    expect(ack.ok).toBe(true);
    const g = grid(h);
    expect(g.overTier[at(20, 14)]).toBe(RoadTier.Highway);
    expect(g.roadTier[at(20, 14)]).toBe(RoadTier.TwoLane);
  });

  it('refuses a viaduct too low to clear it, and says by how much', () => {
    const h = withViaduct(RoadTier.TwoLane, 4);
    const ack = run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: across }]);
    expect(ack.ok).toBe(false);
    expect(ack.reason).toMatch(/clear this one by 5\.8 m/);
    const g = grid(h);
    expect(g.overTier[at(20, 14)]).toBe(0);
    expect(g.roadElevation[at(20, 14)]).toBe(4);
    expect(g.roadTier[at(19, 14)]).toBe(RoadTier.None);
  });

  it('refuses a drag that ends under the viaduct rather than passing under it', () => {
    const h = withViaduct();
    const ack = run(h, 2, [
      { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(12, 14, 9) },
    ]);
    expect(ack.ok).toBe(false);
    expect(ack.reason).toMatch(/straight across/);
    const g = grid(h);
    expect(g.overTier[at(20, 14)]).toBe(0);
    expect(g.roadElevation[at(20, 14)]).toBe(8);
  });

  it('refuses a single tile dropped under a viaduct running across it', () => {
    const h = makeHarness();
    h.sim.handleMessage({ type: 'init', seed: 1337, map: flatMap() });
    run(h, 0, [{ kind: 'setSandbox', on: true }]);
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: across, elevation: 8 }]);
    const ack = run(h, 2, [
      { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: [{ x: 20, z: 14 }] },
    ]);
    // A lone tile's deck climbs toward the viaduct it lies against, to 6 m,
    // which is no longer low enough to pass under it.
    expect(ack.ok).toBe(false);
    expect(ack.reason).toMatch(/clear this one by/);
    expect(grid(h).roadElevation[at(20, 14)]).toBe(8);
  });

  it('leaves the ground under the viaduct as it was, so the deck above does not move', () => {
    const map = flatMap();
    map.height[at(20, 14)] = 5.5;
    const h = withViaduct(RoadTier.TwoLane, 8, map);
    const before = grid(h);
    const deckY = before.height[at(20, 14)]! + before.roadElevation[at(20, 14)]!;
    expect(run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: across }]).ok).toBe(true);
    const g = grid(h);
    expect(g.height[at(20, 14)]).toBe(5.5);
    expect(g.height[at(20, 14)]! + g.overElevation[at(20, 14)]!).toBe(deckY);
  });

  it('undoes it by taking the new road away and putting the viaduct back as it stood', () => {
    const h = withViaduct();
    const before = grid(h);
    const built = run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: across }]);
    expect(built.ok).toBe(true);
    expect(run(h, 3, built.inverse).ok).toBe(true);
    const g = grid(h);
    expect(g.overTier[at(20, 14)]).toBe(0);
    expect(g.roadTier[at(20, 14)]).toBe(RoadTier.TwoLane);
    expect(g.roadElevation[at(20, 14)]).toBe(before.roadElevation[at(20, 14)]);
    expect(g.roadFlow[at(20, 14)]).toBe(before.roadFlow[at(20, 14)]);
    expect(g.roadMask[at(20, 14)]).toBe(before.roadMask[at(20, 14)]);
    for (const t of across) {
      if (t.x === 20) continue;
      expect(g.roadTier[at(t.x, t.z)]).toBe(RoadTier.None);
    }
  });
});
