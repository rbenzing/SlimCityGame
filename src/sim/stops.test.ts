import { describe, expect, it, vi } from 'vitest';
import { decodeSave, encodeSave } from '../app/persist';
import { tileIndex } from '../shared/constants';
import {
  RoadTier,
  SHELTER_WARRANT_BOARDINGS,
  type PathResult,
  type RoadNetworkApi,
  type TilePoint,
  type TransitLine,
} from '../shared/types';
import {
  initialized,
  latestSaveData,
  latestSaveGrid,
  roadRow,
  run,
  sandboxed,
  column,
} from '../../tests/support/sim';
import { StopRegistry, sideTowards } from './stops';
import { STOP_UNDER_ROAD_EDIT } from './worker.entry';
import { TransitSystem } from './transit';

describe('StopRegistry', () => {
  it('refuses a taken side, and a second sign over a sign', () => {
    const stops = new StopRegistry();
    expect(stops.place({ x: 3, z: 4, side: 0, kind: 'sign' }).placed).toBe(true);
    expect(stops.place({ x: 3, z: 4, side: 0, kind: 'sign' }).placed).toBe(false);
    expect(stops.place({ x: 3, z: 4, side: 1, kind: 'sign' }).placed).toBe(true);
    expect(stops.size).toBe(2);
  });

  it('upgrades a sign to a shelter and never takes a shelter back to a sign', () => {
    const stops = new StopRegistry();
    stops.place({ x: 3, z: 4, side: 0, kind: 'sign' });
    const upgrade = stops.place({ x: 3, z: 4, side: 0, kind: 'shelter' });
    expect(upgrade).toEqual({
      placed: true,
      replaced: { x: 3, z: 4, side: 0, kind: 'sign' },
    });
    expect(stops.at(3, 4, 0)?.kind).toBe('shelter');
    expect(stops.place({ x: 3, z: 4, side: 0, kind: 'sign' }).placed).toBe(false);
    expect(stops.place({ x: 3, z: 4, side: 0, kind: 'shelter' }).placed).toBe(false);
  });

  it('looks a tile up by side and removes by side', () => {
    const stops = new StopRegistry();
    stops.place({ x: 3, z: 4, side: 1, kind: 'shelter' });
    stops.place({ x: 3, z: 4, side: 0, kind: 'sign' });
    expect(stops.onTile(3, 4).map((s) => s.side)).toEqual([0, 1]);
    expect(stops.hasStop(3, 4)).toBe(true);
    expect(stops.remove(3, 4, 1)?.kind).toBe('shelter');
    expect(stops.remove(3, 4, 1)).toBeNull();
    expect(stops.onTile(3, 4)).toHaveLength(1);
  });

  it('warrants a shelter at 25 boardings a day and not at 24, and never a sign', () => {
    const stops = new StopRegistry();
    stops.place({ x: 1, z: 1, side: 0, kind: 'shelter' });
    stops.place({ x: 2, z: 1, side: 0, kind: 'shelter' });
    stops.place({ x: 3, z: 1, side: 0, kind: 'sign' });
    stops.addBoardings({ x: 1, z: 1 }, SHELTER_WARRANT_BOARDINGS);
    stops.addBoardings({ x: 2, z: 1 }, SHELTER_WARRANT_BOARDINGS - 1);
    stops.addBoardings({ x: 3, z: 1 }, 400);
    const warranted = stops.states().map((s) => s.warranted);
    expect(warranted).toEqual([true, false, false]);
  });

  it('sums the lines calling at a tile and shares them among the stops standing there', () => {
    const stops = new StopRegistry();
    stops.place({ x: 1, z: 1, side: 0, kind: 'shelter' });
    stops.addBoardings({ x: 1, z: 1 }, 20);
    stops.addBoardings({ x: 1, z: 1 }, 14);
    expect(stops.states()[0]!.boardingsPerDay).toBe(34);
    stops.place({ x: 1, z: 1, side: 1, kind: 'sign' });
    expect(stops.states().map((s) => s.boardingsPerDay)).toEqual([17, 17]);
    stops.clearBoardings();
    expect(stops.states()[0]!.boardingsPerDay).toBe(0);
  });

  it('round-trips through serialize and restore, and an absent list is none', () => {
    const stops = new StopRegistry();
    stops.place({ x: 9, z: 2, side: 1, kind: 'shelter' });
    stops.place({ x: 4, z: 2, side: 0, kind: 'sign' });
    const saved = JSON.parse(JSON.stringify(stops.serialize())) as unknown[];
    const loaded = new StopRegistry();
    loaded.restore(saved);
    expect(loaded.list()).toEqual(stops.list());
    loaded.restore(undefined);
    expect(loaded.size).toBe(0);
    loaded.restore([{ x: 1, z: 1, side: 7, kind: 'sign' }, 'junk', null]);
    expect(loaded.size).toBe(0);
    expect(stops.size).toBe(2);
  });

  it('reads the side a point lies on across the road axis', () => {
    const eastWest = 0b1010;
    const northSouth = 0b0101;
    const road = { x: 5, z: 5 };
    expect(sideTowards(eastWest, road, { x: 5, z: 4 })).toBe(0);
    expect(sideTowards(eastWest, road, { x: 5, z: 6 })).toBe(1);
    expect(sideTowards(northSouth, road, { x: 4, z: 5 })).toBe(0);
    expect(sideTowards(northSouth, road, { x: 6, z: 5 })).toBe(1);
  });
});

describe('transit lines and stops', () => {
  const network: RoadNetworkApi = {
    rebuild: () => {},
    invalidateRegion: () => {},
    nearestNode: () => null,
    findPath: (from, to): PathResult => ({ nodes: [], edges: [], points: [from, to], cost: 0 }),
    addVolume: () => {},
    decayVolumes: () => {},
    getEdges: () => [],
    getNodes: () => [],
  };
  const A: TilePoint = { x: 2, z: 2 };
  const B: TilePoint = { x: 6, z: 2 };
  const C: TilePoint = { x: 9, z: 2 };

  function withStops(): { stops: StopRegistry; transit: TransitSystem } {
    const stops = new StopRegistry();
    stops.place({ x: A.x, z: A.z, side: 0, kind: 'sign' });
    stops.place({ x: B.x, z: B.z, side: 1, kind: 'shelter' });
    return { stops, transit: new TransitSystem(network, null, null, stops) };
  }

  it('accepts a bus line only on tiles that hold a stop', () => {
    const { transit } = withStops();
    expect(transit.acceptsStops('bus', [A, B])).toBe(true);
    expect(transit.acceptsStops('bus', [A, C])).toBe(false);
    expect(transit.acceptsStops('rail', [A, C])).toBe(true);
  });

  it('drops the stops that do not stand when lines are restored', () => {
    const { transit } = withStops();
    const line: TransitLine = { id: 4, stops: [A, C, B], color: 1, mode: 'bus' };
    transit.restore([line]);
    expect(transit.getLine(4)?.stops).toEqual([A, B]);
  });

  it('takes a tile off every bus line and hands back the lines as they were', () => {
    const { transit } = withStops();
    const one = transit.createLine([A, B], 1, 'bus');
    const two = transit.createLine([B, A], 2, 'bus');
    const before = transit.dropStopTile(B.x, B.z);
    expect(before.map((l) => l.stops)).toEqual([
      [A, B],
      [B, A],
    ]);
    expect(transit.getLine(one.id)?.stops).toEqual([A]);
    expect(transit.getLine(two.id)?.stops).toEqual([A]);
  });

  it('writes each stop its own demand through the line rate and length bonus, summed over lines', () => {
    const { stops, transit } = withStops();
    transit.createLine([A, B], 1, 'bus');
    transit.createLine([B, A], 2, 'bus');
    const demand = (x: number): number => (x === A.x ? 10 : 30);
    transit.tick({ nearbyPopulationJobs: (x) => demand(x) });
    // Two stops, a two-tile route: the length bonus is 1 + 2 * 0.01, the bus rate 0.15.
    const factor = 0.15 * (1 + 2 * 0.01);
    const byTile = new Map(stops.states().map((s) => [s.x, s.boardingsPerDay] as const));
    expect(byTile.get(A.x)).toBeCloseTo(2 * 10 * factor, 9);
    expect(byTile.get(B.x)).toBeCloseTo(2 * 30 * factor, 9);
  });
});

describe('stops in the worker', () => {
  const street = roadRow(98, 100, 15);

  function withStreet(): ReturnType<typeof sandboxed> {
    const h = sandboxed();
    expect(run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: street }]).ok).toBe(true);
    return h;
  }

  it('places a sign for its catalog price, refuses the taken side and a junction, and upgrades it', () => {
    const h = withStreet();
    run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: column(110, 96, 9) }]);
    const sign = run(h, 3, [
      { kind: 'placeStop', stop: { x: 102, z: 100, side: 0, kind: 'sign' } },
    ]);
    expect(sign).toMatchObject({ ok: true, cost: 2 });
    expect(
      run(h, 4, [{ kind: 'placeStop', stop: { x: 102, z: 100, side: 0, kind: 'sign' } }]).ok,
    ).toBe(false);
    expect(
      run(h, 5, [{ kind: 'placeStop', stop: { x: 110, z: 100, side: 0, kind: 'sign' } }]).ok,
    ).toBe(false);
    expect(
      run(h, 6, [{ kind: 'placeStop', stop: { x: 60, z: 60, side: 0, kind: 'sign' } }]).ok,
    ).toBe(false);

    const upgrade = run(h, 7, [
      { kind: 'placeStop', stop: { x: 102, z: 100, side: 0, kind: 'shelter' } },
    ]);
    expect(upgrade).toMatchObject({ ok: true, cost: 148 });
    expect(h.lastSnapshot()?.stops).toEqual([
      { x: 102, z: 100, side: 0, kind: 'shelter', boardingsPerDay: 0, warranted: false },
    ]);

    // Its undo takes the shelter off and stands the sign back.
    expect(run(h, 8, upgrade.inverse).ok).toBe(true);
    expect(h.lastSnapshot()?.stops?.map((s) => s.kind)).toEqual(['sign']);
  });

  it('refuses a stop on a bus line it cannot name, and takes a removed stop off its lines, undoably', () => {
    const h = withStreet();
    const place = (seq: number, x: number): void => {
      expect(
        run(h, seq, [{ kind: 'placeStop', stop: { x, z: 100, side: 0, kind: 'shelter' } }]).ok,
      ).toBe(true);
    };
    place(2, 102);
    place(3, 106);
    const stopsOf = (): TilePoint[] => h.lastSnapshot()!.transit!.lines[0]!.stops;
    const bad = run(h, 4, [
      {
        kind: 'createTransitLine',
        line: {
          id: 0,
          stops: [
            { x: 102, z: 100 },
            { x: 104, z: 100 },
          ],
          color: 1,
          mode: 'bus',
        },
      },
    ]);
    expect(bad.ok).toBe(false);
    expect(
      run(h, 5, [
        {
          kind: 'createTransitLine',
          line: {
            id: 0,
            stops: [
              { x: 102, z: 100 },
              { x: 106, z: 100 },
            ],
            color: 1,
            mode: 'bus',
          },
        },
      ]).ok,
    ).toBe(true);
    expect(stopsOf()).toHaveLength(2);

    const removed = run(h, 6, [{ kind: 'removeStop', x: 102, z: 100, side: 0 }]);
    expect(removed.ok).toBe(true);
    expect(removed.cost).toBeLessThan(0);
    expect(stopsOf()).toEqual([{ x: 106, z: 100 }]);

    expect(run(h, 7, removed.inverse).ok).toBe(true);
    expect(stopsOf()).toEqual([
      { x: 102, z: 100 },
      { x: 106, z: 100 },
    ]);
    expect(h.lastSnapshot()?.stops).toHaveLength(2);
  });

  it('refuses a road edit that replaces the street under a stop, and leaves everything as it was', () => {
    const h = withStreet();
    run(h, 2, [{ kind: 'placeStop', stop: { x: 104, z: 100, side: 1, kind: 'sign' } }]);
    const fundsBefore = h.lastSnapshot()!.stats.funds;
    const replaced = run(h, 3, [
      { kind: 'buildRoad', tier: RoadTier.Avenue, tiles: roadRow(103, 100, 3), replace: true },
    ]);
    expect(replaced.ok).toBe(false);
    expect(replaced.reason).toBe(STOP_UNDER_ROAD_EDIT);
    expect(h.lastSnapshot()?.stops).toHaveLength(1);
    expect(h.lastSnapshot()!.stats.funds).toBe(fundsBefore);
    h.sim.handleMessage({ type: 'requestSave' });
    expect(latestSaveGrid(h).roadTier[tileIndex(104, 100)]).toBe(RoadTier.TwoLane);
    // The same edit a tile clear of the stop is allowed.
    const clear = run(h, 4, [
      { kind: 'buildRoad', tier: RoadTier.Avenue, tiles: roadRow(106, 100, 3), replace: true },
    ]);
    expect(clear.ok).toBe(true);
  });

  it('takes away a free road without touching the stops on the street beside it', () => {
    const h = withStreet();
    run(h, 2, [{ kind: 'placeStop', stop: { x: 104, z: 100, side: 1, kind: 'sign' } }]);
    const free = {
      kind: 'buildSegment' as const,
      tier: RoadTier.TwoLane,
      a: { x: 100000, z: 120000 },
      b: { x: 120000, z: 140000 },
    };
    expect(run(h, 3, [free]).ok).toBe(true);
    const removed = run(h, 4, [{ kind: 'removeSegment', a: free.a, b: free.b }]);
    expect(removed.ok).toBe(true);
    expect(h.lastSnapshot()?.stops).toHaveLength(1);
  });

  it('removes the stops with the street when it is bulldozed, and undo puts them back', () => {
    const h = withStreet();
    run(h, 2, [{ kind: 'placeStop', stop: { x: 104, z: 100, side: 1, kind: 'sign' } }]);
    const bulldozed = run(h, 3, [{ kind: 'bulldoze', tiles: [{ x: 104, z: 100 }] }]);
    expect(bulldozed.ok).toBe(true);
    expect(h.lastSnapshot()?.stops).toEqual([]);
    expect(run(h, 4, bulldozed.inverse).ok).toBe(true);
    expect(h.lastSnapshot()?.stops?.map((s) => s.x)).toEqual([104]);
  });

  it('refuses to place a bus stop as a building', () => {
    const h = withStreet();
    for (const catalogId of ['bus-stop', 'bus-stop-sign']) {
      const ack = run(h, 2, [{ kind: 'placeBuilding', catalogId, x: 102, z: 99, rotation: 0 }]);
      expect(ack.ok).toBe(false);
      expect(ack.reason).toMatch(/bus stop/i);
    }
  });

  it('carries its stops through a save', () => {
    const h = withStreet();
    run(h, 2, [{ kind: 'placeStop', stop: { x: 104, z: 100, side: 1, kind: 'shelter' } }]);
    h.sim.handleMessage({ type: 'requestSave' });
    const saved = decodeSave(latestSaveData(h));
    expect(saved.meta.busStops).toEqual([{ x: 104, z: 100, side: 1, kind: 'shelter' }]);

    const fresh = initialized();
    fresh.sim.handleMessage({ type: 'loadSave', data: latestSaveData(h) });
    expect(fresh.lastSnapshot()?.stops?.map((s) => [s.x, s.z, s.side, s.kind])).toEqual([
      [104, 100, 1, 'shelter'],
    ]);
  });

  it('loads a save that has no stops with none', () => {
    const h = withStreet();
    h.sim.handleMessage({ type: 'requestSave' });
    const payload = decodeSave(latestSaveData(h));
    delete payload.meta.busStops;
    h.sim.handleMessage({ type: 'loadSave', data: encodeSave(payload) });
    expect(h.lastSnapshot()?.stops).toEqual([]);
  });

  it('turns a saved bus-stop building into a shelter on the street it fronted and frees its tile', () => {
    const h = withStreet();
    // Park stand-ins are 1x1 buildings; the save then names them bus stops.
    const north = { x: 102, z: 99 };
    const south = { x: 106, z: 101 };
    const lost = { x: 50, z: 50 };
    for (const [i, t] of [north, south, lost].entries()) {
      expect(
        run(h, 2 + i, [
          { kind: 'placeBuilding', catalogId: 'small-park', x: t.x, z: t.z, rotation: 0 },
        ]).ok,
      ).toBe(true);
    }
    h.sim.handleMessage({ type: 'requestSave' });
    const payload = decodeSave(latestSaveData(h));
    for (const b of payload.meta.registry.buildings) b.catalogId = 'bus-stop';
    payload.meta.transitLines = [{ id: 1, stops: [north, south], color: 1, mode: 'bus' }];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    h.sim.handleMessage({ type: 'loadSave', data: encodeSave(payload) });
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();

    expect(h.lastSnapshot()?.stops?.map((s) => [s.x, s.z, s.side, s.kind])).toEqual([
      [102, 100, 0, 'shelter'],
      [106, 100, 1, 'shelter'],
    ]);
    expect(h.lastSnapshot()?.transit?.lines[0]?.stops).toEqual([
      { x: 102, z: 100 },
      { x: 106, z: 100 },
    ]);
    h.sim.handleMessage({ type: 'requestSave' });
    const grid = latestSaveGrid(h);
    for (const t of [north, south, lost]) expect(grid.buildingId[tileIndex(t.x, t.z)]).toBe(0);
    expect(decodeSave(latestSaveData(h)).meta.registry.buildings).toEqual([]);
  });
});
