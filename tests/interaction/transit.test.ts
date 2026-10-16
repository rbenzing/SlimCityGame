import { describe, expect, it } from 'vitest';
import { tileIndex, tileToWorld, VISUAL_DAY_TICKS } from '../../src/shared/constants';
import {
  INACTIVE_VEHICLE_X,
  RoadTier,
  VEHICLE_STRIDE,
  VehicleKind,
  ZoneType,
  type BuildingInstance,
  type SimSnapshot,
  type WorkerToMain,
} from '../../src/shared/types';
import { SERVICE_END_HOUR, SERVICE_START_HOUR } from '../../src/shared/transitfleet';
import { dayHourFromTick } from '../../src/sim/traffic';
import { MAX_DEAD_RUN_BUSES } from '../../src/sim/deadruns';
import { DEAD_RUN_SLOT_OFFSET } from '../../src/sim/worker.entry';
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
  standingBuildings,
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
      depotId: [],
    });
  });
});

describe('a bus line’s dead runs', () => {
  /**
   * A street along z = 80 with a side street off it at x = 67 and at x = 72,
   * so the graph has a node at each. The depot stands beside the x = 72 side
   * street, which is its gate node; the first stop snaps to the x = 67 node,
   * five tiles west, and the last to the street's east end. One bus, so the
   * run is one bus each way.
   */
  const STREET_Z = 80;
  const stops = [
    { x: 66, z: STREET_Z - 1 },
    { x: 76, z: STREET_Z - 1 },
  ];
  const DEPOT = { x: 70, z: STREET_Z + 1 };
  const GATE_NODE = { x: 72, z: STREET_Z };
  const FIRST_STOP_NODE = { x: 67, z: STREET_Z };

  function lineWithDepot(): Harness {
    const h = initialized();
    const built = run(h, 1, [
      { kind: 'setSandbox', on: true },
      { kind: 'setUnlimitedMoney', on: true },
      { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(60, STREET_Z, 20) },
      { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: column(67, STREET_Z + 1, 4) },
      { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: column(72, STREET_Z + 1, 4) },
      { kind: 'placeBuilding', catalogId: 'wind-turbine', x: 60, z: STREET_Z - 1, rotation: 0 },
      { kind: 'placeBuilding', catalogId: 'bus-stop', ...stops[0]!, rotation: 0 },
      { kind: 'placeBuilding', catalogId: 'bus-stop', ...stops[1]!, rotation: 0 },
      { kind: 'placeBuilding', catalogId: 'bus-depot', ...DEPOT, rotation: 0 },
      {
        kind: 'createTransitLine',
        line: { id: 0, stops, color: 0xd23c3c, mode: 'bus', vehicles: 1 },
      },
    ]);
    expect(built.ok).toBe(true);
    return h;
  }

  /** The first tick whose clock hour is at or past `hour`, with the tick before it short of it. */
  function crossingTick(hour: number): number {
    for (let t = 1; t <= VISUAL_DAY_TICKS; t++) {
      if (dayHourFromTick(t - 1) < hour && dayHourFromTick(t) >= hour) return t;
    }
    throw new Error('no crossing');
  }
  const PULL_OUT = crossingTick(SERVICE_START_HOUR);
  const PULL_IN = crossingTick(SERVICE_END_HOUR);

  /** Runs the sim up to and including `tick`, and returns the snapshot taken at or just after it. */
  function advanceTo(h: Harness, tick: number): SimSnapshot {
    const now = h.lastSnapshot()!.stats.tick;
    if (tick > now) h.ticks(tick - now);
    while (h.lastSnapshot()!.stats.tick < tick) h.ticks(1);
    return h.lastSnapshot()!;
  }

  /** The buses on the dead-run slice of the vehicle buffer, as world positions. */
  function deadRunBuses(snap: SimSnapshot): { x: number; z: number; kind: number }[] {
    const out: { x: number; z: number; kind: number }[] = [];
    const vehicles = snap.vehicles!;
    for (
      let slot = DEAD_RUN_SLOT_OFFSET;
      slot < DEAD_RUN_SLOT_OFFSET + MAX_DEAD_RUN_BUSES;
      slot++
    ) {
      const base = slot * VEHICLE_STRIDE;
      if (vehicles[base] === INACTIVE_VEHICLE_X) continue;
      out.push({ x: vehicles[base]!, z: vehicles[base + 1]!, kind: vehicles[base + 4]! });
    }
    return out;
  }

  const depotOf = (h: Harness): BuildingInstance =>
    Array.from(standingBuildings(h).values()).find((b) => b.catalogId === 'bus-depot')!;

  it('names the depot that fields the line, and the depot counts the bus as in service', () => {
    const h = lineWithDepot();
    h.ticks(10);
    const t = h.lastSnapshot()!.transit!;
    expect(t.served).toEqual([1]);
    expect(t.depotId).toEqual([depotOf(h).id]);

    h.sim.handleMessage({ type: 'select', buildingId: depotOf(h).id });
    const selections = h.messages.filter(
      (m): m is Extract<WorkerToMain, { type: 'selection' }> => m.type === 'selection',
    );
    expect(selections[selections.length - 1]!.info!.depot).toEqual({
      holds: 10,
      fields: 8,
      inService: 1,
    });
  });

  it(
    'sends the bus home from the first stop at 23:00, shows an empty street at 03:00, and a bus leaving the gate at 05:00',
    () => {
      const h = lineWithDepot();
      // Nothing dead-runs before the first crossing.
      expect(deadRunBuses(advanceTo(h, PULL_IN - 2))).toEqual([]);

      const dusk = deadRunBuses(advanceTo(h, PULL_IN));
      expect(dusk).toHaveLength(1);
      expect(dusk[0]!.kind).toBe(VehicleKind.Bus);
      expect(dusk[0]!.x).toBeCloseTo(tileToWorld(FIRST_STOP_NODE.x), 0);
      expect(dusk[0]!.z).toBeCloseTo(tileToWorld(FIRST_STOP_NODE.z), 0);
      // An hour on it has driven east toward the gate.
      const night = deadRunBuses(advanceTo(h, PULL_IN + 100));
      expect(night).toHaveLength(1);
      expect(night[0]!.x).toBeGreaterThan(dusk[0]!.x);
      expect(night[0]!.x).toBeLessThan(tileToWorld(GATE_NODE.x));
      // Home by three in the morning: the street is empty.
      expect(deadRunBuses(advanceTo(h, crossingTick(3)))).toEqual([]);

      const dawn = deadRunBuses(advanceTo(h, PULL_OUT));
      expect(dawn).toHaveLength(1);
      expect(dawn[0]!.kind).toBe(VehicleKind.Bus);
      expect(dawn[0]!.x).toBeCloseTo(tileToWorld(GATE_NODE.x), 0);
      expect(dawn[0]!.z).toBeCloseTo(tileToWorld(GATE_NODE.z), 0);
      // An hour on it has driven west toward the first stop, and not past it.
      const morning = deadRunBuses(advanceTo(h, PULL_OUT + 100));
      expect(morning).toHaveLength(1);
      expect(morning[0]!.x).toBeLessThan(dawn[0]!.x);
      expect(morning[0]!.x).toBeGreaterThan(tileToWorld(FIRST_STOP_NODE.x));
      expect(morning[0]!.z).toBeCloseTo(tileToWorld(STREET_Z), 0);
    },
    GROWTH_TIMEOUT_MS,
  );
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
