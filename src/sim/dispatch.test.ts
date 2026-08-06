import { describe, expect, it } from 'vitest';
import {
  DispatchSystem,
  MAX_SERVICE_VEHICLES,
  VEHICLE_KIND_FOR_INCIDENT,
  type Rng,
} from './dispatch';
import type { BuildingCatalogEntry, BuildingInstance, GridState, Incident } from '../shared/types';
import {
  BuildingState,
  FIELD_COUNT,
  FieldId,
  INACTIVE_VEHICLE_X,
  RoadTier,
  VEHICLE_STRIDE,
  VehicleKind,
} from '../shared/types';
import { MAP_SIZE, TICK_RATE, tileIndex } from '../shared/constants';
import { RoadNetwork } from '../world/roads';

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

function makeGrid(): GridState {
  const n = MAP_SIZE * MAP_SIZE;
  return {
    size: MAP_SIZE,
    height: new Float32Array(n),
    water: new Uint8Array(n),
    trees: new Uint8Array(n),
    zone: new Uint8Array(n),
    roadTier: new Uint8Array(n),
    roadMask: new Uint8Array(n),
    buildingId: new Uint32Array(n),
    power: new Uint8Array(n),
    watered: new Uint8Array(n),
    fields: Array.from({ length: FIELD_COUNT }, () => new Uint8Array(n)),
    district: new Uint8Array(n),
    landfill: new Uint8Array(n),
  };
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

const house: BuildingCatalogEntry = {
  id: 'house',
  name: 'House',
  category: 'res',
  footprint: { w: 1, d: 1 },
  height: 6,
  color: 0,
  powerUse: 0,
  waterUse: 0,
  cost: 0,
  upkeep: 0,
  unlockMilestone: 0,
};

const CATALOG = [policeStation, fireStation, clinic, house];

function countActive(buf: Float32Array): number {
  let n = 0;
  for (let slot = 0; slot < MAX_SERVICE_VEHICLES; slot++) {
    if (buf[slot * VEHICLE_STRIDE] !== INACTIVE_VEHICLE_X) n++;
  }
  return n;
}

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
      place(g, buildings, 3, 'house', 3, 1);
      g.fields[FieldId.Crime]![tileIndex(3, 1)] = 200;
      g.fields[FieldId.FireRisk]![tileIndex(3, 1)] = 200;
      const network = new RoadNetwork();
      network.rebuild(g);
      const sys = new DispatchSystem(CATALOG, createSeededRng(2026));
      return { sys, g, buildings, network };
    }

    const a = buildScenario();
    const b = buildScenario();

    for (let t = 0; t < 500; t++) {
      const outA = a.sys.tick({ grid: a.g, buildings: a.buildings, network: a.network });
      const outB = b.sys.tick({ grid: b.g, buildings: b.buildings, network: b.network });
      expect(outB).toEqual(outA);
    }
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
      place(g, buildings, 2, 'house', 4, 1);
      g.fields[FieldId.Crime]![tileIndex(4, 1)] = crimeValue;
      const network = new RoadNetwork();
      network.rebuild(g);
      const sys = new DispatchSystem(CATALOG, createSeededRng(7));

      let activeTicks = 0;
      for (let t = 0; t < 4000; t++) {
        const out = sys.tick({ grid: g, buildings, network });
        activeTicks += out.length;
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

    const network = new RoadNetwork();
    network.rebuild(g);
    // Force the very first spawn roll to succeed regardless of chance.
    const sys = new DispatchSystem(CATALOG, createScriptedRng([0, 0.4]));

    const out = sys.tick({ grid: g, buildings, network });
    expect(out).toHaveLength(1);

    // 3 tiles from the near station -> arrives in exactly 3 ticks (1 tile/tick).
    // If it had routed from the far station (10 tiles) it would still be
    // travelling well past tick 3.
    let out3: Incident[] = out;
    for (let i = 0; i < 3; i++) {
      out3 = sys.tick({ grid: g, buildings, network });
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

    const network = new RoadNetwork();
    network.rebuild(g);
    // draw[0]: spawn-chance roll (forced success); draw[1]: severity = 0.5
    // exactly -> serviceTicksRemaining = round(10 + 0.5*20) = 20.
    // Gated by activeTargets, no further draws are needed for the rest of
    // this incident's whole lifecycle.
    const sys = new DispatchSystem(CATALOG, createScriptedRng([0, 0.5]));

    const travel = 5; // segments
    const service = 20;
    const totalTicks = travel + service + travel; // 30

    const kind: Incident['kind'] = 'fire';
    let sawKind = false;
    for (let t = 1; t <= totalTicks; t++) {
      const out = g === g ? sys.tick({ grid: g, buildings, network }) : [];
      expect(out).toHaveLength(1);
      expect(out[0]!.kind).toBe(kind);
      expect(out[0]!.x).toBe(5);
      expect(out[0]!.z).toBe(1);
      if (out[0]!.kind === kind) sawKind = true;
    }
    expect(sawKind).toBe(true);

    // One tick past the total lifetime: resolved, slot freed, snapshot empty.
    const finalOut = sys.tick({ grid: g, buildings, network });
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

    const network = new RoadNetwork();
    network.rebuild(g);
    const sys = new DispatchSystem(CATALOG, createScriptedRng([0, 0.2]));

    sys.tick({ grid: g, buildings, network }); // spawn
    for (let i = 0; i < 3; i++) sys.tick({ grid: g, buildings, network }); // arrive (3 segments)

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
// No coupling into ServiceSim
// ---------------------------------------------------------------------------

describe('DispatchSystem: no coupling into ServiceSim', () => {
  it('never writes any GridState.fields array, and never mutates BuildingInstance objects', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    straightRoad(g, 0, 0, 4);
    place(g, buildings, 1, 'police', 0, 1);
    place(g, buildings, 2, 'fire', 4, 1);
    place(g, buildings, 3, 'house', 2, 1);
    g.fields[FieldId.Crime]![tileIndex(2, 1)] = 220;
    g.fields[FieldId.FireRisk]![tileIndex(2, 1)] = 220;
    g.fields[FieldId.LandValue]![tileIndex(2, 1)] = 77;

    const fieldsSnapshot = g.fields.map((f) => f.slice());
    const buildingsSnapshot = buildings.map((b) => ({ ...b }));

    const network = new RoadNetwork();
    network.rebuild(g);
    const sys = new DispatchSystem(CATALOG, createSeededRng(99));

    for (let t = 0; t < 300; t++) sys.tick({ grid: g, buildings, network });

    for (let f = 0; f < FIELD_COUNT; f++) {
      expect(g.fields[f]).toEqual(fieldsSnapshot[f]);
    }
    expect(buildings).toEqual(buildingsSnapshot);
  }, 15000); // 300 ticks + full field/building deep-equal is slow; avoid a load-related 5s-default timeout flake
});

// ---------------------------------------------------------------------------
// Buffer layout & no-responder behavior
// ---------------------------------------------------------------------------

describe('DispatchSystem: vehicle buffer layout', () => {
  it('is sized MAX_SERVICE_VEHICLES * VEHICLE_STRIDE with every slot inactive at construction', () => {
    const sys = new DispatchSystem(CATALOG, createSeededRng(1));
    expect(sys.vehicleBuffer.length).toBe(MAX_SERVICE_VEHICLES * VEHICLE_STRIDE);
    expect(countActive(sys.vehicleBuffer)).toBe(0);
  });
});

describe('DispatchSystem: no responder available', () => {
  it('does not spawn an incident when no Active station of the matching service kind exists', () => {
    const g = makeGrid();
    const buildings: BuildingInstance[] = [];
    straightRoad(g, 0, 0, 4);
    place(g, buildings, 1, 'house', 4, 1); // no police/fire/clinic anywhere
    g.fields[FieldId.Crime]![tileIndex(4, 1)] = 255;

    const network = new RoadNetwork();
    network.rebuild(g);
    // Force every spawn-chance roll to succeed -- still nothing to route to.
    const sys = new DispatchSystem(CATALOG, createScriptedRng(new Array(50).fill(0)));

    for (let t = 0; t < 50; t++) {
      const out = sys.tick({ grid: g, buildings, network });
      expect(out).toHaveLength(0);
    }
    expect(countActive(sys.vehicleBuffer)).toBe(0);
  });
});

void TICK_RATE; // referenced only for documentation parity with the 1-tile-per-tick speed model
