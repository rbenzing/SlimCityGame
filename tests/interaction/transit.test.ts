import { describe, expect, it } from 'vitest';
import { tileIndex } from '../../src/shared/constants';
import { RoadTier, ZoneType, type SimSnapshot } from '../../src/shared/types';
import {
  composeProfile,
  FIRST_CUSTOM_PROFILE_ID,
  NO_EDITS,
  presetProfileForTier,
} from '../../src/shared/roadprofile';
import { decodeSave, encodeSave } from '../../src/app/persist';
import type { Harness } from '../support/sim';
import {
  column,
  GROWTH_TIMEOUT_MS,
  initialized,
  latestSaveGrid,
  roadRow,
  rows,
  run,
  send,
  sixLaneCommands,
} from '../support/sim';
import { guardRoadNetwork } from '../support/guard';

guardRoadNetwork();

describe('drawing a bus line while the city is paused', () => {
  const stops = [
    { x: 62, z: 79 },
    { x: 76, z: 79 },
  ];

  it('shows the line at once, with no riders until the city runs, and takes it away at once', () => {
    const h = initialized();
    const built = run(h, 1, [
      { kind: 'setSandbox', on: true },
      { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(60, 80, 20) },
      { kind: 'placeBuilding', catalogId: 'bus-stop', ...stops[0]!, rotation: 0 },
      { kind: 'placeBuilding', catalogId: 'bus-stop', ...stops[1]!, rotation: 0 },
    ]);
    expect(built.ok).toBe(true);
    h.sim.handleMessage({ type: 'setSpeed', speed: 0 });

    send(h, 2, [
      { kind: 'createTransitLine', line: { id: 0, stops, color: 0xd23c3c, mode: 'bus' } },
    ]);
    h.ticks(1);
    expect(h.ackFor(2)!.ok).toBe(true);
    const drawn = h.lastSnapshot()!.transit!;
    expect(drawn.lines.map((l) => l.stops)).toEqual([stops]);
    expect(drawn.ridership).toEqual([0]);
    expect(drawn.served).toEqual([0]);

    send(h, 3, [{ kind: 'deleteTransitLine', id: drawn.lines[0]!.id }]);
    h.ticks(1);
    expect(h.lastSnapshot()!.transit!).toEqual({
      lines: [],
      ridership: [],
      served: [],
      requested: [],
      headwayMin: [],
      runningCost: [],
      pools: { bus: 0, rail: 0, tram: 0 },
    });
  });
});

describe('a bus line and the depot that fields it', () => {
  const stops = [
    { x: 62, z: 79 },
    { x: 76, z: 79 },
  ];
  const DEPOT = { x: 70, z: 81 };

  /** A street with a stop at each end and a line between them, and no depot anywhere. */
  function lineWithoutDepot(): Harness {
    const h = initialized();
    const built = run(h, 1, [
      { kind: 'setSandbox', on: true },
      { kind: 'setUnlimitedMoney', on: true },
      { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(60, 80, 20) },
      { kind: 'placeBuilding', catalogId: 'wind-turbine', x: 60, z: 79, rotation: 0 },
      { kind: 'placeBuilding', catalogId: 'bus-stop', ...stops[0]!, rotation: 0 },
      { kind: 'placeBuilding', catalogId: 'bus-stop', ...stops[1]!, rotation: 0 },
      { kind: 'createTransitLine', line: { id: 0, stops, color: 0xd23c3c, mode: 'bus' } },
    ]);
    expect(built.ok).toBe(true);
    return h;
  }

  /** The transit snapshot with every fleet figure present, as the worker always sends it. */
  const transit = (h: Harness): Required<NonNullable<SimSnapshot['transit']>> =>
    h.lastSnapshot()!.transit! as Required<NonNullable<SimSnapshot['transit']>>;

  it('runs nothing with no bus depot, though it asks for vehicles', () => {
    const h = lineWithoutDepot();
    h.ticks(10);
    const t = transit(h);
    expect(t.requested[0]).toBeGreaterThan(0);
    expect(t.served).toEqual([0]);
    expect(t.headwayMin).toEqual([0]);
    expect(t.runningCost).toEqual([0]);
    expect(t.pools).toEqual({ bus: 0, rail: 0, tram: 0 });
  });

  it('loads a city saved before depots existed with its lines idle, and a bus depot fields them at once', () => {
    const h = lineWithoutDepot();
    h.ticks(10);
    h.sim.handleMessage({ type: 'requestSave' });
    const saveMsg = h.messages.find((m) => m.type === 'save');
    if (!saveMsg || saveMsg.type !== 'save') throw new Error('no save message');
    const payload = decodeSave(saveMsg.data);
    // A save from before the epic carries no requested fleet on its lines.
    for (const line of payload.meta.transitLines ?? []) delete line.vehicles;
    h.sim.handleMessage({ type: 'loadSave', data: encodeSave(payload) });
    run(h, 2, [{ kind: 'setSandbox', on: true }]);
    h.ticks(10);

    const idle = transit(h);
    expect(idle.lines).toHaveLength(1);
    expect(idle.lines[0]!.vehicles).toBeUndefined();
    expect(idle.requested[0]).toBeGreaterThan(0);
    expect(idle.served).toEqual([0]);

    const placed = run(h, 3, [
      { kind: 'placeBuilding', catalogId: 'bus-depot', ...DEPOT, rotation: 0 },
    ]);
    expect(placed.ok).toBe(true);
    h.ticks(10);
    const fielded = transit(h);
    expect(fielded.pools.bus).toBe(8);
    expect(fielded.served[0]).toBe(fielded.requested[0]);
    expect(fielded.served[0]).toBeGreaterThan(0);
    expect(fielded.headwayMin[0]).toBeGreaterThan(0);
    expect(fielded.runningCost[0]).toBe(40 * fielded.served[0]!);
  });

  it('pools two bus depots, counts a rail yard for nothing, and idles the line again when the depots go', () => {
    const h = lineWithoutDepot();
    expect(
      run(h, 2, [
        { kind: 'placeBuilding', catalogId: 'bus-depot', ...DEPOT, rotation: 0 },
        { kind: 'placeBuilding', catalogId: 'bus-depot', x: 74, z: 81, rotation: 0 },
        { kind: 'buildRoad', tier: RoadTier.RailTrack, tiles: roadRow(60, 90, 20) },
        { kind: 'placeBuilding', catalogId: 'rail-yard', x: 64, z: 91, rotation: 1 },
      ]).ok,
    ).toBe(true);
    h.ticks(10);
    expect(transit(h).pools).toEqual({ bus: 16, rail: 0, tram: 0 });

    const gone = run(h, 3, [
      { kind: 'bulldoze', tiles: rows(DEPOT.x, DEPOT.z, 2, 2) },
      { kind: 'bulldoze', tiles: rows(74, 81, 2, 2) },
    ]);
    expect(gone.ok).toBe(true);
    h.ticks(10);
    expect(transit(h).pools.bus).toBe(0);
    expect(transit(h).served).toEqual([0]);
  });

  it('lets the player set a line’s fleet, carried through the line and its undo', () => {
    const h = lineWithoutDepot();
    run(h, 2, [{ kind: 'placeBuilding', catalogId: 'bus-depot', ...DEPOT, rotation: 0 }]);
    h.ticks(5);
    const id = transit(h).lines[0]!.id;
    const set = run(h, 3, [
      {
        kind: 'updateTransitLine',
        line: { id, stops, color: 0xd23c3c, mode: 'bus', vehicles: 3 },
      },
    ]);
    expect(set.ok).toBe(true);
    const inverse = set.inverse[0]!;
    expect(inverse).toMatchObject({ kind: 'updateTransitLine', line: { id } });
    expect((inverse as { line: { vehicles?: number } }).line.vehicles).toBeUndefined();
    h.ticks(5);
    expect(transit(h).lines[0]!.vehicles).toBe(3);
    expect(transit(h).requested).toEqual([3]);
    expect(transit(h).served).toEqual([3]);
    expect(transit(h).runningCost).toEqual([120]);
  });
});

describe('where a tram depot and a rail yard may stand', () => {
  const STREET_Z = 80;
  const TRAM_Z = 90;
  const RAIL_Z = 60;

  function yards(): Harness {
    const h = initialized();
    expect(
      run(h, 1, [
        { kind: 'setSandbox', on: true },
        { kind: 'setUnlimitedMoney', on: true },
        { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(60, STREET_Z, 20) },
        { kind: 'buildRoad', tier: RoadTier.Tram, tiles: roadRow(60, TRAM_Z, 20) },
        { kind: 'buildRoad', tier: RoadTier.RailTrack, tiles: roadRow(60, RAIL_Z, 20) },
      ]).ok,
    ).toBe(true);
    return h;
  }

  it('a tram depot stands on the tram track and not on a plain street', () => {
    const h = yards();
    const onStreet = run(h, 2, [
      { kind: 'placeBuilding', catalogId: 'tram-depot', x: 65, z: STREET_Z + 1, rotation: 0 },
    ]);
    expect(onStreet.ok).toBe(false);
    expect(onStreet.reason).toBe('invalid');
    const onTrack = run(h, 3, [
      { kind: 'placeBuilding', catalogId: 'tram-depot', x: 65, z: TRAM_Z - 3, rotation: 0 },
    ]);
    expect(onTrack.ok).toBe(true);
  });

  it('a tram depot refuses a street with a tram lane composed onto it, which no tram can route', () => {
    const h = yards();
    const COMPOSED_Z = 100;
    const mixed = composeProfile(presetProfileForTier(RoadTier.TwoLane), {
      ...NO_EDITS,
      tram: 'mixed',
    });
    const defined = run(h, 2, [
      { kind: 'defineRoadProfile', id: FIRST_CUSTOM_PROFILE_ID, profile: mixed },
    ]);
    expect(defined.ok).toBe(true);
    const laid = run(h, 3, [
      {
        kind: 'buildRoad',
        tier: RoadTier.TwoLane,
        tiles: roadRow(60, COMPOSED_Z, 20),
        profile: FIRST_CUSTOM_PROFILE_ID,
      },
    ]);
    expect(laid.ok).toBe(true);
    expect(latestTier(h, 70, COMPOSED_Z)).not.toBe(RoadTier.Tram);
    const beside = run(h, 4, [
      { kind: 'placeBuilding', catalogId: 'tram-depot', x: 65, z: COMPOSED_Z + 1, rotation: 0 },
    ]);
    expect(beside.ok).toBe(false);
    expect(beside.reason).toBe('invalid');
  });

  it('a rail yard stands beside the railway and nowhere else', () => {
    const h = yards();
    const onStreet = run(h, 2, [
      { kind: 'placeBuilding', catalogId: 'rail-yard', x: 65, z: STREET_Z + 1, rotation: 1 },
    ]);
    expect(onStreet.ok).toBe(false);
    expect(onStreet.reason).toBe('invalid');
    const onRail = run(h, 3, [
      { kind: 'placeBuilding', catalogId: 'rail-yard', x: 65, z: RAIL_Z + 1, rotation: 1 },
    ]);
    expect(onRail.ok).toBe(true);
  });

  function latestTier(h: Harness, x: number, z: number): number {
    h.sim.handleMessage({ type: 'requestSave' });
    return latestSaveGrid(h).roadTier[tileIndex(x, z)]!;
  }
});

describe('a bus line down a long block', () => {
  it(
    'carries riders from a stop partway down the block, far from any junction',
    () => {
      const h = initialized();
      // A 60-tile street with no junction, homes along it, and a stop beside
      // its middle — more than 8 tiles from either end.
      expect(
        run(h, 1, [
          { kind: 'setSandbox', on: true },
          { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(50, 80, 60) },
          { kind: 'placeBuilding', catalogId: 'wind-turbine', x: 50, z: 79, rotation: 0 },
          { kind: 'placeBuilding', catalogId: 'water-tower', x: 52, z: 79, rotation: 0 },
          { kind: 'paintZone', zone: ZoneType.ResLow, tiles: rows(56, 81, 50, 2) },
          { kind: 'paintZone', zone: ZoneType.ComLow, tiles: rows(56, 77, 50, 2) },
          { kind: 'placeBuilding', catalogId: 'bus-stop', x: 54, z: 81, rotation: 0 },
          { kind: 'placeBuilding', catalogId: 'bus-stop', x: 80, z: 81, rotation: 0 },
          { kind: 'placeBuilding', catalogId: 'bus-depot', x: 106, z: 81, rotation: 0 },
          {
            kind: 'createTransitLine',
            line: {
              id: 0,
              stops: [
                { x: 54, z: 81 },
                { x: 80, z: 81 },
              ],
              color: 0xd23c3c,
              mode: 'bus',
            },
          },
        ]).ok,
      ).toBe(true);
      h.ticks(1500);
      const transit = h.lastSnapshot()!.transit!;
      expect(transit.served![0]).toBeGreaterThan(0);
      expect(transit.ridership[0]).toBeGreaterThan(0);
    },
    GROWTH_TIMEOUT_MS,
  );
});

describe('a tramway crossing another street', () => {
  const AVENUE_X = 90;
  const TRAM_Z = 85;

  /**
   * An avenue with homes and power, and a tramway drawn across it afterwards —
   * so the crossing tiles are the avenue's — with a tram line from one side of
   * it to the other. `sixLane` lays the avenue as two carriageways, in columns
   * 90 and 91.
   */
  function crossedTown(sixLane = false): Harness {
    const h = initialized();
    run(h, 1, [
      { kind: 'setSandbox', on: true },
      { kind: 'setUnlimitedMoney', on: true },
    ]);
    const avenue = column(AVENUE_X, 60, 50);
    const laid = run(
      h,
      2,
      sixLane
        ? sixLaneCommands(avenue)
        : [{ kind: 'buildRoad', tier: RoadTier.Avenue, tiles: avenue }],
    );
    expect(laid.ok).toBe(true);
    const tramway = roadRow(70, TRAM_Z, 41);
    expect(run(h, 3, [{ kind: 'buildRoad', tier: RoadTier.Tram, tiles: tramway }]).ok).toBe(true);
    run(h, 4, [
      { kind: 'placeBuilding', catalogId: 'wind-turbine', x: AVENUE_X - 1, z: 60, rotation: 0 },
      { kind: 'placeBuilding', catalogId: 'water-tower', x: AVENUE_X - 1, z: 61, rotation: 0 },
      // The depot that fields the tram, on the tramway west of the avenue.
      { kind: 'placeBuilding', catalogId: 'tram-depot', x: 70, z: TRAM_Z - 3, rotation: 0 },
      {
        kind: 'paintZone',
        zone: ZoneType.ResLow,
        tiles: [...rows(70, TRAM_Z + 1, 20, 3), ...rows(AVENUE_X + 2, TRAM_Z + 1, 20, 3)],
      },
      {
        kind: 'paintZone',
        zone: ZoneType.Industrial,
        tiles: rows(AVENUE_X + 2, TRAM_Z - 4, 20, 4),
      },
      {
        kind: 'createTransitLine',
        line: {
          id: 0,
          stops: [
            { x: 72, z: TRAM_Z },
            { x: 108, z: TRAM_Z },
          ],
          color: 0x3cb45a,
          mode: 'tram',
        },
      },
    ]);
    h.ticks(1500);
    return h;
  }

  const riders = (h: Harness): number => h.lastSnapshot()!.transit!.ridership[0]!;

  it(
    'runs the tram straight over the avenue, carrying riders, and leaves the crossing the avenue’s',
    () => {
      const h = crossedTown();
      expect(riders(h)).toBeGreaterThan(0);
      h.sim.handleMessage({ type: 'requestSave' });
      expect(latestSaveGrid(h).roadTier[tileIndex(AVENUE_X, TRAM_Z)]).toBe(RoadTier.Avenue);
    },
    GROWTH_TIMEOUT_MS,
  );

  it(
    'runs over a six-lane avenue too, through the median it opens',
    () => {
      const h = crossedTown(true);
      expect(riders(h)).toBeGreaterThan(0);
      h.sim.handleMessage({ type: 'requestSave' });
      const g = latestSaveGrid(h);
      for (const x of [AVENUE_X, AVENUE_X + 1]) {
        expect(g.roadTier[tileIndex(x, TRAM_Z)]).toBe(RoadTier.Avenue);
      }
    },
    GROWTH_TIMEOUT_MS,
  );
});
