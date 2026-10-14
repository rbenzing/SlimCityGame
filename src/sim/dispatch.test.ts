import { describe, expect, it } from 'vitest';
import {
  DispatchSystem,
  MAX_SERVICE_VEHICLES,
  MAX_UNANSWERED_INCIDENTS,
  UNANSWERED_LAPSE_TICKS,
  VEHICLE_KIND_FOR_INCIDENT,
  responseReach,
  type Rng,
} from './dispatch';
import type {
  BuildingCatalogEntry,
  BuildingInstance,
  GridState,
  Incident,
  PathResult,
  RoadNetworkApi,
  ServiceKind,
  TilePoint,
} from '../shared/types';
import {
  BuildingState,
  FIELD_COUNT,
  FieldId,
  INACTIVE_VEHICLE_X,
  RoadTier,
  VEHICLE_STRIDE,
  VehicleKind,
} from '../shared/types';
import {
  FIELD_REFERENCE,
  RESPONSE_REACH_TILES,
  TICKS_PER_YEAR,
  TICK_RATE,
  tileIndex,
} from '../shared/constants';
import { RoadNetwork } from '../world/roadgraph';
import { createGrid } from '../world/grid';
import catalogData from '../data/catalog.json';

// ---------------------------------------------------------------------------
// Test doubles (mirrors src/sim/traffic.test.ts's conventions)
// ---------------------------------------------------------------------------

/** Deterministic PRNG (mulberry32) implementing the injected Rng contract. */
function createSeededRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    int: (maxExclusive: number) => Math.floor(next() * maxExclusive),
    range: (a: number, b: number) => a + next() * (b - a),
    fork: (streamId: number) => createSeededRng((seed ^ Math.imul(streamId + 1, 0x9e3779b9)) >>> 0),
  };
  return rng;
}

/** Rng whose `.next()` returns a pre-scripted queue of exact values, in order. */
function createScriptedRng(queue: number[]): Rng {
  let cursor = 0;
  const rng: Rng = {
    next: () => {
      if (cursor >= queue.length) throw new Error(`scripted rng exhausted after ${cursor} draws`);
      const value = queue[cursor];
      cursor += 1;
      if (value === undefined) throw new Error('scripted rng queue hole');
      return value;
    },
    int: (maxExclusive: number) => Math.floor(rng.next() * maxExclusive),
    range: (a: number, b: number) => a + rng.next() * (b - a),
    fork: () => createScriptedRng(queue.slice(cursor)),
  };
  return rng;
}

/**
 * A script of (spawn roll, severity) pairs, then rolls that never succeed: the
 * dispatcher consumes a pair per call and nothing else, so a test states
 * exactly which calls start on its first tick and that none start after.
 */
function scriptedCalls(severities: number[]): Rng {
  return createScriptedRng([...severities.flatMap((s) => [0, s]), ...new Array(5000).fill(0.99)]);
}

function makeGrid(): GridState {
  return createGrid();
}

function place(
  g: GridState,
  buildings: BuildingInstance[],
  id: number,
  catalogId: string,
  x: number,
  z: number,
): BuildingInstance {
  g.buildingId[tileIndex(x, z)] = id;
  const instance: BuildingInstance = {
    id,
    catalogId,
    x,
    z,
    rotation: 0,
    level: 1,
    state: BuildingState.Active,
    problems: 0,
  };
  buildings.push(instance);
  return instance;
}

/** Straight road of `tiles+1` tiles from (x0,z) to (x0+tiles, z), inclusive both ends. */
function straightRoad(g: GridState, x0: number, z: number, tiles: number): void {
  for (let x = x0; x <= x0 + tiles; x++) {
    g.roadTier[tileIndex(x, z)] = RoadTier.TwoLane;
  }
}

const FULL_FUNDING: Readonly<Record<ServiceKind, number>> = {
  police: 1,
  fire: 1,
  health: 1,
  education: 1,
  park: 1,
};

const policeStation: BuildingCatalogEntry = {
  id: 'police',
  name: 'Police Station',
  category: 'service',
  footprint: { w: 1, d: 1 },
  height: 10,
  color: 0,
  powerUse: 0,
  waterUse: 0,
  service: { kind: 'police', strength: 160, range: 40 },
  cost: 0,
  upkeep: 0,
  unlockMilestone: 0,
};

const fireStation: BuildingCatalogEntry = {
  ...policeStation,
  id: 'fire',
  service: { kind: 'fire', strength: 160, range: 40 },
};
const clinic: BuildingCatalogEntry = {
  ...policeStation,
  id: 'clinic',
  service: { kind: 'health', strength: 140, range: 40 },
};
/** A station with a crew limit, as the catalog's fire station (one engine) and police station (six cars) carry. */
const engineHouse: BuildingCatalogEntry = {
  ...fireStation,
  id: 'engine-house',
  service: { kind: 'fire', strength: 160, range: 40, responders: 1 },
};
const patrolHouse: BuildingCatalogEntry = {
  ...policeStation,
  id: 'patrol-house',
  service: { kind: 'police', strength: 160, range: 40, responders: 6 },
};

const house: BuildingCatalogEntry = {
  id: 'house',
  name: 'House',
  category: 'res',
  footprint: { w: 1, d: 1 },
  height: 6,
  color: 0,
  powerUse: 0,
  waterUse: 0,
  residents: 100,
  cost: 0,
  upkeep: 0,
  unlockMilestone: 0,
};
/** So many residents that a call is near-certain each tick, for tests that need incidents to happen. */
const tower: BuildingCatalogEntry = { ...house, id: 'tower', residents: 20_000 };
/** 40 residents and 20 jobs: 60 occupants, 40 once divided by 1 + EMPLOYMENT_RATE. */
const mixed: BuildingCatalogEntry = { ...house, id: 'mixed', residents: 40, jobs: 20 };

const CATALOG = [policeStation, fireStation, clinic, engineHouse, patrolHouse, house, tower, mixed];

function countActive(buf: Float32Array): number {
  let n = 0;
  for (let slot = 0; slot < MAX_SERVICE_VEHICLES; slot++) {
    if (buf[slot * VEHICLE_STRIDE] !== INACTIVE_VEHICLE_X) n++;
  }
  return n;
}

function step(
  sys: DispatchSystem,
  g: GridState,
  buildings: BuildingInstance[],
  network: RoadNetworkApi,
  funding: Readonly<Record<ServiceKind, number>> = FULL_FUNDING,
): Incident[] {
  return sys.tick({ grid: g, buildings, network, funding });
}

function railed(g: GridState): RoadNetwork {
  const network = new RoadNetwork();
  network.rebuild(g);
  return network;
}

const answered = (out: readonly Incident[]): Incident[] => out.filter((i) => i.answered === true);
const unanswered = (out: readonly Incident[]): Incident[] =>
  out.filter((i) => i.answered === false);

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('DispatchSystem: determinism', () => {
  it('produces byte-identical incident sequences across two fresh instances given the same seed, grid, and buildings', () => {
    function buildScenario(): {
      sys: DispatchSystem;
      g: GridState;
      buildings: BuildingInstance[];
      network: RoadNetwork;
    } {
      const g = makeGrid();
      const buildings: BuildingInstance[] = [];
      straightRoad(g, 0, 0, 6);
      place(g, buildings, 1, 'police', 0, 1);
      place(g, buildings, 2, 'fire', 6, 1);
      place(g, buildings, 3, 'tower', 3, 1);
      g.fields[FieldId.Crime]![tileIndex(3, 1)] = 200;
      g.fields[FieldId.FireRisk]![tileIndex(3, 1)] = 200;
      const sys = new DispatchSystem(CATALOG, createSeededRng(2026));
      return { sys, g, buildings, network: railed(g) };
    }

    const a = buildScenario();
    const b = buildScenario();

    let incidentTicks = 0;
    for (let t = 0; t < 500; t++) {
      const outA = step(a.sys, a.g, a.buildings, a.network);
      const outB = step(b.sys, b.g, b.buildings, b.network);
      expect(outB).toEqual(outA);
      if (outA.length > 0) incidentTicks++;
    }
    // A sequence of nothing would be equal for any seed.
    expect(incidentTicks).toBeGreaterThan(50);
  });
});

// ---------------------------------------------------------------------------
// Rate response to fields
// ---------------------------------------------------------------------------

describe('DispatchSystem: spawn rate responds to the coverage-gap field', () => {
  it('produces strictly more incident-active ticks with a high Crime field than a low one, same seed', () => {
    function run(crimeValue: number): number {
      const g = makeGrid();
      const buildings: BuildingInstance[] = [];
      straightRoad(g, 0, 0, 4);
      place(g, buildings, 1, 'police', 0, 1);
      place(g, buildings, 2, 'tower', 4, 1);
      g.fields[FieldId.Crime]![tileIndex(4, 1)] = crimeValue;
      const network = railed(g);
      const sys = new DispatchSystem(CATALOG, createSeededRng(7));

      let activeTicks = 0;
      for (let t = 0; t < 4000; t++) {
        activeTicks += step(sys, g, buildings, network).length;
      }
      return activeTicks;
    }

    const low = run(30);
    const high = run(250);
    expect(high).toBeGreaterThan(low);
  });
});

// ---------------------------------------------------------------------------
// Nearest-station selection
// ---------------------------------------------------------------------------

describe('DispatchSystem: nearest-station selection', () => {
  it('routes from the road-nearer station, not a farther one of the same kind', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    // Near station at x=7 (3 tiles from incident at x=10); far station at x=0 (10 tiles away).
    straightRoad(g, 0, 0, 10);
    place(g, buildings, 1, 'police', 0, 1); // far station, 10 tiles away
    place(g, buildings, 2, 'police', 7, 1); // near station, 3 tiles away
    place(g, buildings, 3, 'house', 10, 1);
    g.fields[FieldId.Crime]![tileIndex(10, 1)] = 255;

    const network = railed(g);
    const sys = new DispatchSystem(CATALOG, scriptedCalls([0.4]));

    const out = step(sys, g, buildings, network);
    expect(out).toHaveLength(1);

    // 3 tiles from the near station -> arrives in exactly 3 ticks (1 tile/tick).
    // If it had routed from the far station (10 tiles) it would still be
    // travelling well past tick 3.
    let out3: Incident[] = out;
    for (let i = 0; i < 3; i++) {
      out3 = step(sys, g, buildings, network);
    }
    // After 3 movement ticks the vehicle has arrived and entered 'servicing'
    // (still active, but no longer travelling) -- confirms the short (near
    // station) route was used, not the long one.
    expect(out3).toHaveLength(1);

    const buf = sys.vehicleBuffer;
    let activeSlot = -1;
    for (let slot = 0; slot < MAX_SERVICE_VEHICLES; slot++) {
      if (buf[slot * VEHICLE_STRIDE] !== INACTIVE_VEHICLE_X) activeSlot = slot;
    }
    expect(activeSlot).toBeGreaterThanOrEqual(0);
    const base = activeSlot * VEHICLE_STRIDE;
    // Parked exactly at the incident tile (world coords), confirming arrival.
    expect(buf[base + 3]).toBe(0); // speed 0 while servicing
  });
});

// ---------------------------------------------------------------------------
// Route there-and-back + resolution timing
// ---------------------------------------------------------------------------

describe('DispatchSystem: route there-and-back and resolution timing', () => {
  it('travels station->incident->station and resolves after exactly travel+service+travel ticks', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    straightRoad(g, 0, 0, 5); // 6 tiles (x=0..5) -> 5 segments each direction
    place(g, buildings, 1, 'fire', 0, 1);
    place(g, buildings, 2, 'house', 5, 1);
    g.fields[FieldId.FireRisk]![tileIndex(5, 1)] = 255;

    const network = railed(g);
    // Severity 0.5 exactly -> serviceTicksRemaining = round(10 + 0.5*20) = 20.
    // Gated by activeTargets, no further draws are needed for the rest of
    // this incident's whole lifecycle.
    const sys = new DispatchSystem(CATALOG, scriptedCalls([0.5]));

    const travel = 5; // segments
    const service = 20;
    const totalTicks = travel + service + travel; // 30

    for (let t = 1; t <= totalTicks; t++) {
      const out = step(sys, g, buildings, network);
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({ kind: 'fire', x: 5, z: 1, answered: true });
    }

    // One tick past the total lifetime: resolved, slot freed, snapshot empty.
    const finalOut = step(sys, g, buildings, network);
    expect(finalOut).toHaveLength(0);
    expect(countActive(sys.vehicleBuffer)).toBe(0);
  });

  it('parks the vehicle at the incident tile while servicing (not still sliding along the road)', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    straightRoad(g, 0, 0, 3);
    place(g, buildings, 1, 'clinic', 0, 1);
    place(g, buildings, 2, 'house', 3, 1);
    g.fields[FieldId.Pollution]![tileIndex(3, 1)] = 255;

    const network = railed(g);
    const sys = new DispatchSystem(CATALOG, scriptedCalls([0.2]));

    step(sys, g, buildings, network); // spawn
    for (let i = 0; i < 3; i++) step(sys, g, buildings, network); // arrive (3 segments)

    const buf = sys.vehicleBuffer;
    let slot = -1;
    for (let s = 0; s < MAX_SERVICE_VEHICLES; s++)
      if (buf[s * VEHICLE_STRIDE] !== INACTIVE_VEHICLE_X) slot = s;
    expect(slot).toBeGreaterThanOrEqual(0);
    const base = slot * VEHICLE_STRIDE;
    expect(buf[base + 3]).toBe(0); // parked: speed 0
    expect(buf[base + 4]).toBe(VEHICLE_KIND_FOR_INCIDENT.medical);
    expect(buf[base + 4]).toBe(VehicleKind.Ambulance);
  });
});

// ---------------------------------------------------------------------------
// Reach
// ---------------------------------------------------------------------------

/** A network whose every path is `tiles` hops long and costs `cost`, wherever it runs. */
class FixedPathNetwork extends RoadNetwork {
  constructor(
    private readonly tiles: number,
    private readonly cost: number,
  ) {
    super();
  }
  override findPath(from: TilePoint): PathResult {
    return {
      nodes: [],
      edges: [],
      points: Array.from({ length: this.tiles + 1 }, () => ({ x: from.x, z: from.z })),
      cost: this.cost,
    };
  }
}

/** Counts the searches the dispatcher asks the network for. */
class CountingNetwork extends RoadNetwork {
  searches = 0;
  override findPath(...args: Parameters<RoadNetwork['findPath']>): PathResult | null {
    this.searches += 1;
    return super.findPath(...args);
  }
}

/**
 * One fire call at (`incidentX`, 1) from the fire station at (0, 1), over a
 * straight road that ends beside the incident, so the road from the station to
 * it is `incidentX` tiles (a road's own tiles are not nodes, its ends are).
 */
function fireCallAt(
  incidentX: number,
  funding: Readonly<Record<ServiceKind, number>>,
  network?: () => RoadNetwork,
): { out: Incident[]; network: RoadNetwork } {
  const g = makeGrid();
  const buildings: BuildingInstance[] = [];
  straightRoad(g, 0, 0, incidentX);
  place(g, buildings, 1, 'fire', 0, 1);
  place(g, buildings, 2, 'house', incidentX, 1);
  g.fields[FieldId.FireRisk]![tileIndex(incidentX, 1)] = 255;
  const net = network ? network() : new RoadNetwork();
  net.rebuild(g);
  const sys = new DispatchSystem(CATALOG, scriptedCalls([0.5]));
  return { out: step(sys, g, buildings, net, funding), network: net };
}

describe('DispatchSystem: a station answers only within its road reach', () => {
  it('derives the reach from the standards and the 20 m tile: 120 tiles for fire and police, 241 for medical', () => {
    expect(RESPONSE_REACH_TILES).toEqual({ fire: 120, crime: 120, medical: 241 });
  });

  it('answers a call 110 road tiles away and not one 130 tiles away', () => {
    const near = fireCallAt(110, FULL_FUNDING).out;
    expect(near).toHaveLength(1);
    expect(near[0]!.answered).toBe(true);

    const far = fireCallAt(130, FULL_FUNDING).out;
    expect(far).toHaveLength(1);
    expect(far[0]!.answered).toBe(false);
  });

  it('gates on path tiles, not path cost: a short route at a huge cost answers, a long route at no cost does not', () => {
    const congested = fireCallAt(3, FULL_FUNDING, () => new FixedPathNetwork(50, 1_000_000)).out;
    expect(congested[0]!.answered).toBe(true);

    // Close by in straight lines, so only the path itself can refuse it.
    const winding = fireCallAt(3, FULL_FUNDING, () => new FixedPathNetwork(130, 0)).out;
    expect(winding[0]!.answered).toBe(false);
  });

  it('scales the reach with funding: 60% funding is 72 tiles of fire reach', () => {
    const sixty = { ...FULL_FUNDING, fire: 0.6 };
    expect(responseReach('fire', sixty)).toBe(72);
    expect(responseReach('crime', { ...FULL_FUNDING, police: 0.6 })).toBe(72);
    expect(responseReach('medical', { ...FULL_FUNDING, health: 0.5 })).toBe(120);
    // Funding of another service does not move it.
    expect(responseReach('fire', { ...FULL_FUNDING, police: 0.1 })).toBe(120);

    expect(fireCallAt(70, sixty).out[0]!.answered).toBe(true);
    expect(fireCallAt(80, sixty).out[0]!.answered).toBe(false);
    expect(fireCallAt(80, FULL_FUNDING).out[0]!.answered).toBe(true);
  });

  it('does not search for a station whose straight-line distance already puts it out of reach', () => {
    const { network } = fireCallAt(130, FULL_FUNDING, () => new CountingNetwork());
    expect((network as CountingNetwork).searches).toBe(0);

    const inReach = fireCallAt(110, FULL_FUNDING, () => new CountingNetwork());
    expect((inReach.network as CountingNetwork).searches).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Busy stations
// ---------------------------------------------------------------------------

describe('DispatchSystem: a station runs only as many calls as it has responders', () => {
  it('a fire station running one call does not answer a second, which waits', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    straightRoad(g, 0, 0, 8);
    place(g, buildings, 1, 'engine-house', 0, 1);
    place(g, buildings, 2, 'house', 3, 1);
    place(g, buildings, 3, 'house', 5, 1);
    g.fields[FieldId.FireRisk]![tileIndex(3, 1)] = 255;
    g.fields[FieldId.FireRisk]![tileIndex(5, 1)] = 255;
    const sys = new DispatchSystem(CATALOG, scriptedCalls([0.5, 0.5]));

    const out = step(sys, g, buildings, railed(g));
    expect(answered(out).map((i) => i.x)).toEqual([3]);
    expect(unanswered(out).map((i) => i.x)).toEqual([5]);
    expect(countActive(sys.vehicleBuffer)).toBe(1);
    expect(sys.responderLoad(buildings)).toEqual({ fire: { inFlight: 1, total: 1 } });
  });

  it('a police station answers six calls and refuses the seventh', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    straightRoad(g, 0, 0, 9);
    place(g, buildings, 1, 'patrol-house', 0, 1);
    for (let i = 0; i < 7; i++) {
      place(g, buildings, 2 + i, 'house', 2 + i, 1);
      g.fields[FieldId.Crime]![tileIndex(2 + i, 1)] = 255;
    }
    const sys = new DispatchSystem(CATALOG, scriptedCalls(new Array(7).fill(0.5)));

    const out = step(sys, g, buildings, railed(g));
    expect(answered(out)).toHaveLength(6);
    expect(unanswered(out).map((i) => i.x)).toEqual([8]);
    expect(sys.responderLoad(buildings)).toEqual({ police: { inFlight: 6, total: 6 } });
  });

  describe('the district rungs, from the catalog', () => {
    const rung = (id: string): BuildingCatalogEntry =>
      (catalogData as { buildings: BuildingCatalogEntry[] }).buildings.find((e) => e.id === id)!;
    const districtCatalog = [
      ...CATALOG,
      rung('fire-station-district'),
      rung('police-station-district'),
    ];

    /** A station at the road's start and `calls` houses in a row beyond its lot, each on fire or each a crime scene. */
    function districtCalls(stationId: string, field: FieldId, calls: number): Incident[] {
      const g = makeGrid();
      const buildings: BuildingInstance[] = [];
      straightRoad(g, 0, 0, calls + 5);
      place(g, buildings, 1, stationId, 0, 1);
      for (let i = 0; i < calls; i++) {
        place(g, buildings, 2 + i, 'house', 4 + i, 1);
        g.fields[field]![tileIndex(4 + i, 1)] = 255;
      }
      const sys = new DispatchSystem(districtCatalog, scriptedCalls(new Array(calls).fill(0.5)));
      return step(sys, g, buildings, railed(g));
    }

    it('the district fire station answers two calls at once and refuses the third', () => {
      const out = districtCalls('fire-station-district', FieldId.FireRisk, 3);
      expect(answered(out)).toHaveLength(2);
      expect(unanswered(out).map((i) => i.x)).toEqual([6]);
    });

    it('the district police station answers eleven calls at once and refuses the twelfth', () => {
      const out = districtCalls('police-station-district', FieldId.Crime, 12);
      expect(answered(out)).toHaveLength(11);
      expect(unanswered(out).map((i) => i.x)).toEqual([15]);
    });
  });

  it('a waiting call is taken when a call resolves, with the severity it was rolled at and no re-roll', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    // Both houses sit at the road's far end, so each is 6 road tiles from the engine.
    straightRoad(g, 0, 0, 6);
    place(g, buildings, 1, 'engine-house', 0, 1);
    place(g, buildings, 2, 'house', 6, 1);
    place(g, buildings, 3, 'house', 6, 2);
    g.fields[FieldId.FireRisk]![tileIndex(6, 1)] = 255;
    g.fields[FieldId.FireRisk]![tileIndex(6, 2)] = 255;
    // Severity 0 on scene is 10 ticks; the waiting call's 0.25 must survive.
    // After the two calls the script offers only rolls that fail: a re-roll
    // for the waiting call would be one more draw that cannot succeed.
    const sys = new DispatchSystem(CATALOG, scriptedCalls([0, 0.25]));
    const network = railed(g);

    // Travel 6 + service 10 + travel 6 = 22 ticks for the first call.
    const firstCallTicks = 6 + 10 + 6;
    let out = step(sys, g, buildings, network);
    for (let t = 2; t <= firstCallTicks; t++) {
      out = step(sys, g, buildings, network);
      expect(unanswered(out).map((i) => i.z)).toEqual([2]);
    }
    expect(answered(out).map((i) => i.z)).toEqual([1]);

    // The first call's return reaches the station on this tick: it resolves and the engine is free.
    out = step(sys, g, buildings, network);
    expect(unanswered(out)).toHaveLength(0);
    expect(answered(out)).toEqual([{ kind: 'fire', x: 6, z: 2, severity: 0.25, answered: true }]);
    expect(sys.responderLoad(buildings)).toEqual({ fire: { inFlight: 1, total: 1 } });
    expect(countActive(sys.vehicleBuffer)).toBe(1);
  });

  it('a kind with no responders figure is unlimited and behaves as it did: three calls, one clinic', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    straightRoad(g, 0, 0, 8);
    place(g, buildings, 1, 'clinic', 0, 1);
    for (let i = 0; i < 3; i++) {
      place(g, buildings, 2 + i, 'house', 2 + i, 1);
      g.fields[FieldId.Pollution]![tileIndex(2 + i, 1)] = 255;
    }
    const sys = new DispatchSystem(CATALOG, scriptedCalls([0.5, 0.5, 0.5]));

    const out = step(sys, g, buildings, railed(g));
    expect(answered(out)).toHaveLength(3);
    expect(unanswered(out)).toHaveLength(0);
    expect(sys.responderLoad(buildings)).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Unanswered calls
// ---------------------------------------------------------------------------

describe('DispatchSystem: a call nobody can answer', () => {
  it('spawns unanswered with no vehicle, stands for the lapse and then goes', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    straightRoad(g, 0, 0, 4);
    place(g, buildings, 1, 'house', 4, 1); // no police/fire/clinic anywhere
    g.fields[FieldId.Crime]![tileIndex(4, 1)] = 255;
    const network = railed(g);
    const sys = new DispatchSystem(CATALOG, scriptedCalls([0.5]));

    expect(UNANSWERED_LAPSE_TICKS).toBe(30);
    for (let t = 1; t <= UNANSWERED_LAPSE_TICKS; t++) {
      const out = step(sys, g, buildings, network);
      expect(out).toEqual([{ kind: 'crime', x: 4, z: 1, severity: 0.5, answered: false }]);
      expect(countActive(sys.vehicleBuffer)).toBe(0);
    }
    expect(step(sys, g, buildings, network)).toHaveLength(0);
  });

  it('is capped apart from the vehicle pool: 32 stand, and a call a station can answer still gets its vehicle', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    straightRoad(g, 0, 0, 60);
    const houses = MAX_UNANSWERED_INCIDENTS + 8;
    for (let i = 0; i < houses; i++) {
      place(g, buildings, 1 + i, 'house', 1 + i, 1);
      g.fields[FieldId.FireRisk]![tileIndex(1 + i, 1)] = 255; // a fire, and no fire station
    }
    // The last house calls the police, who are there.
    const crimeId = houses + 2;
    place(g, buildings, crimeId, 'house', houses + 2, 1);
    g.fields[FieldId.Crime]![tileIndex(houses + 2, 1)] = 255;
    place(g, buildings, crimeId + 1, 'police', 0, 1);
    // A call that finds the unanswered pool full is refused after its roll and
    // before its severity: eight bare rolls sit between the 32 held and the police call.
    const refused = houses - MAX_UNANSWERED_INCIDENTS;
    const sys = new DispatchSystem(
      CATALOG,
      createScriptedRng([
        ...new Array(MAX_UNANSWERED_INCIDENTS).fill([0, 0.5]).flat(),
        ...new Array(refused).fill(0),
        0,
        0.5,
        ...new Array(5000).fill(0.99),
      ]),
    );

    const out = step(sys, g, buildings, railed(g));
    expect(unanswered(out)).toHaveLength(MAX_UNANSWERED_INCIDENTS);
    expect(unanswered(out).every((i) => i.kind === 'fire')).toBe(true);
    const police = answered(out);
    expect(police).toHaveLength(1);
    expect(police[0]!.kind).toBe('crime');
    expect(countActive(sys.vehicleBuffer)).toBe(1);
  });

  it('keeps the building skipped while its call stands: one call, not one a tick', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    straightRoad(g, 0, 0, 4);
    place(g, buildings, 1, 'house', 4, 1);
    g.fields[FieldId.FireRisk]![tileIndex(4, 1)] = 255;
    const network = railed(g);
    // A roll that always succeeds: only the standing call keeps a second one off.
    const sys = new DispatchSystem(CATALOG, createScriptedRng(new Array(200).fill(0)));

    for (let t = 0; t < 10; t++) {
      expect(step(sys, g, buildings, network)).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Real call rates
// ---------------------------------------------------------------------------

/** 250 buildings of 40 residents and 20 jobs: 10,000 residents and 5,000 jobs, balanced, with a station of each kind. */
function syntheticCity(field: number, seed: number) {
  const g = makeGrid();
  const buildings: BuildingInstance[] = [];
  // A road is two nodes, its ends; every building and station snaps to one, so
  // every call is within the 100 tiles of road between them and is answerable.
  straightRoad(g, 0, 2, 100);
  let id = 1;
  for (let x = 3; x < 128; x++) {
    for (const z of [1, 3]) {
      place(g, buildings, id++, 'mixed', x, z);
      for (const f of [FieldId.FireRisk, FieldId.Crime, FieldId.Pollution]) {
        g.fields[f]![tileIndex(x, z)] = field;
      }
    }
  }
  place(g, buildings, id++, 'engine-house', 65, 0);
  place(g, buildings, id++, 'patrol-house', 66, 0);
  place(g, buildings, id, 'clinic', 67, 0);
  return {
    g,
    buildings,
    network: railed(g),
    sys: new DispatchSystem(CATALOG, createSeededRng(seed)),
  };
}

/** Calls that began over `ticks` ticks, by kind: a call is new when its building was not calling on the tick before. */
function countCalls(city: ReturnType<typeof syntheticCity>, ticks: number): Record<string, number> {
  const counts: Record<string, number> = { fire: 0, crime: 0, medical: 0 };
  let before = new Set<string>();
  for (let t = 0; t < ticks; t++) {
    const now = new Set<string>();
    for (const i of step(city.sys, city.g, city.buildings, city.network)) {
      const key = `${i.kind}:${i.x},${i.z}`;
      now.add(key);
      if (!before.has(key)) counts[i.kind] = (counts[i.kind] ?? 0) + 1;
    }
    before = now;
  }
  return counts;
}

/**
 * A count is a Poisson draw, so it lies within four standard deviations
 * (sqrt of the mean) of its mean all but about one time in 16,000. A building
 * with a call open is skipped until it closes, which takes about 3% of the calls
 * a city this size would otherwise see (about 50 ticks open, at a third of a
 * thousandth of a call a tick a building), so the band allows 3% more.
 */
function expectPoisson(count: number | undefined, expected: number): void {
  expect(Math.abs((count ?? 0) - expected)).toBeLessThanOrEqual(
    4 * Math.sqrt(expected) + 0.03 * expected,
  );
}

describe('DispatchSystem: calls arrive at real per-resident rates', () => {
  it('a balanced city of 10,000 at the reference field makes about 420 fire, 850 medical and 4,500 police calls a year', () => {
    const city = syntheticCity(FIELD_REFERENCE, 20261014);
    const calls = countCalls(city, TICKS_PER_YEAR);
    expectPoisson(calls.fire, 420);
    expectPoisson(calls.medical, 850);
    expectPoisson(calls.crime, 4500);
  }, 120_000);

  it('field 0 spawns nothing, and the rate follows the field: half the reference field, half the calls', () => {
    const none = countCalls(syntheticCity(0, 5), 20_000);
    expect(none).toEqual({ fire: 0, crime: 0, medical: 0 });

    const ticks = TICKS_PER_YEAR / 4;
    const total = (field: number): number => {
      const c = countCalls(syntheticCity(field, 11), ticks);
      return c.fire! + c.crime! + c.medical!;
    };
    const perYear = (420 + 850 + 4500) * (ticks / TICKS_PER_YEAR);
    const half = total(FIELD_REFERENCE / 2);
    const full = total(FIELD_REFERENCE);
    expectPoisson(half, perYear / 2);
    expectPoisson(full, perYear);
    // Doubling the field doubles the rate: the two counts differ by about 2x.
    expect(full / half).toBeGreaterThan(1.7);
    expect(full / half).toBeLessThan(2.3);
  }, 120_000);
});

// ---------------------------------------------------------------------------
// No coupling into ServiceSim
// ---------------------------------------------------------------------------

/**
 * One field array against its snapshot, element by element.
 *
 * `toEqual` treats a 65,536-entry field as a generic object and takes about a
 * quarter of a second over each one — nine of them was the entire runtime of
 * the test below, and enough, on a loaded suite, to push it past its timeout
 * and fail for reasons that had nothing to do with dispatch. The comparison is
 * the same and says which tile moved; only the price is different.
 */
function expectFieldUnchanged(actual: Uint8Array, expected: Uint8Array, field: number): void {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== expected[i]) {
      expect.fail(`field ${field} changed at tile ${i}: ${expected[i]} became ${actual[i]}`);
    }
  }
}

describe('the guard the coupling test leans on', () => {
  it('notices a single tile moving, so a passing run means something', () => {
    const a = new Uint8Array(64);
    const b = new Uint8Array(64);
    expect(() => expectFieldUnchanged(a, b, 0)).not.toThrow();
    a[37] = 1;
    expect(() => expectFieldUnchanged(a, b, 0)).toThrow(/tile 37/);
  });
});

describe('DispatchSystem: no coupling into ServiceSim', () => {
  it('never writes any GridState.fields array, and never mutates BuildingInstance objects', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    straightRoad(g, 0, 0, 4);
    place(g, buildings, 1, 'police', 0, 1);
    place(g, buildings, 2, 'fire', 4, 1);
    place(g, buildings, 3, 'tower', 2, 1);
    g.fields[FieldId.Crime]![tileIndex(2, 1)] = 220;
    g.fields[FieldId.FireRisk]![tileIndex(2, 1)] = 220;
    g.fields[FieldId.LandValue]![tileIndex(2, 1)] = 77;

    const fieldsSnapshot = g.fields.map((f) => f.slice());
    const buildingsSnapshot = buildings.map((b) => ({ ...b }));

    const network = railed(g);
    const sys = new DispatchSystem(CATALOG, createSeededRng(99));

    let incidents = 0;
    for (let t = 0; t < 300; t++) incidents += step(sys, g, buildings, network).length;
    expect(incidents).toBeGreaterThan(0);

    for (let f = 0; f < FIELD_COUNT; f++) {
      expectFieldUnchanged(g.fields[f]!, fieldsSnapshot[f]!, f);
    }
    expect(buildings).toEqual(buildingsSnapshot);
  });
});

// ---------------------------------------------------------------------------
// Buffer layout
// ---------------------------------------------------------------------------

describe('DispatchSystem: vehicle buffer layout', () => {
  it('is sized MAX_SERVICE_VEHICLES * VEHICLE_STRIDE with every slot inactive at construction', () => {
    const sys = new DispatchSystem(CATALOG, createSeededRng(1));
    expect(sys.vehicleBuffer.length).toBe(MAX_SERVICE_VEHICLES * VEHICLE_STRIDE);
    expect(countActive(sys.vehicleBuffer)).toBe(0);
  });
});

void TICK_RATE; // referenced only for documentation parity with the 1-tile-per-tick speed model
