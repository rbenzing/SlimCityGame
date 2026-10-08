import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  COAL_SMOKESTACK_COUNT,
  DRAIN_OUTFALL_OVERHANG,
  WORKS_CLARIFIER_RADIUS,
  PARK_BENCH_COUNT,
  PUMP_INTAKE_OVERHANG,
  RECYCLING_SHED_SIZE,
  RECYCLING_OFFICE_SIZE,
  RECYCLING_YARD_HEIGHT,
  RECYCLING_TRUCK_COUNT,
  YARD_FOOTING_DEPTH,
  PARK_TREE_MAX,
  PARK_TREE_MIN,
  TURBINE_BLADE_COUNT,
  TURBINE_MAST_HEIGHT,
  TURBINE_ROTOR_ANGULAR_SPEED,
  UTILITY_KIT_CATALOG_IDS,
  UtilityKitPartKind,
  UtilityKitRenderer,
  WATER_BALCONY_OUTER_RADIUS,
  WATER_BALCONY_Y,
  WATER_CROWN_Y,
  WATER_LEG_BASE_RADIUS,
  WATER_LEG_COUNT,
  WATER_LEG_TOP_RADIUS,
  WATER_PANEL_COUNT,
  WATER_SHELL_TOP_Y,
  WATER_TANK_BOTTOM_DEPTH,
  WATER_TANK_BOTTOM_Y,
  WATER_TANK_RADIUS,
  WATER_TANK_SEGMENTS,
  WATER_TANK_SHELL_HEIGHT,
  buildWaterTowerGeometry,
  computeCoalHallLayout,
  computeCoalHeapLocalPlacement,
  computeCoalSmokestackLocalPlacements,
  computeIncineratorBayLocalPlacement,
  computeIncineratorHallLayout,
  computeIncineratorStackLocalPlacement,
  computeMrfLayout,
  MRF_BALE_SIZE,
  MRF_HALL_SIZE,
  MRF_TRUCK_COUNT,
  computeParkBenchPlacements,
  computeParkTreeCount,
  computeParkTreePlacements,
  computeRecyclingDepotLayout,
  computeWaterLegPlacements,
  footprintHalfExtents,
  rotateLocalXZ,
  turbineBeaconLocal,
  waterSideOf,
  turbineHubLocal,
  turbineRotorAngle,
  turbineRotorPhase,
} from './utilitykits';
import {
  BuildingCatalogEntry,
  BuildingDelta,
  BuildingInstance,
  BuildingState,
  VehicleKind,
  ZoneType,
} from '../shared/types';
import { TILE_METERS } from '../shared/constants';
import { footprintForRotation } from '../shared/footprint';
import { sizeForKind } from './vehicles';
import { BuildingInstancer } from './buildings';

const flatHeightAt = (): number => 0;

const ALL_KINDS: readonly UtilityKitPartKind[] = [
  'turbineTower',
  'turbineRotor',
  'turbineBeacon',
  'waterSteel',
  'waterTank',
  'pumpHouse',
  'pumpIntake',
  'drainHeadwall',
  'drainOutfall',
  'worksBody',
  'worksOutfall',
  'coalHall',
  'coalSmokestack',
  'coalHeap',
  'incineratorHall',
  'incineratorStack',
  'incineratorBay',
  'recyclingYard',
  'recyclingShed',
  'recyclingOffice',
  'recyclingTruck',
  'mrfYard',
  'mrfHall',
  'mrfBales',
  'mrfOffice',
  'mrfTruck',
  'parkGround',
  'parkTree',
  'parkBench',
];

function makeTurbineEntry(overrides: Partial<BuildingCatalogEntry> = {}): BuildingCatalogEntry {
  return {
    id: 'wind-turbine',
    name: 'Wind Turbine',
    category: 'utility',
    footprint: { w: 1, d: 1 },
    height: 40,
    color: 0xe6e6d6,
    powerUse: 0,
    waterUse: 0,
    utility: { powerMW: 6 },
    cost: 3000,
    upkeep: 100,
    unlockMilestone: 0,
    ...overrides,
  };
}

function makeWaterTowerEntry(overrides: Partial<BuildingCatalogEntry> = {}): BuildingCatalogEntry {
  return {
    id: 'water-tower',
    name: 'Water Tower',
    category: 'utility',
    footprint: { w: 1, d: 1 },
    height: 36,
    color: 0x7495d1,
    powerUse: 0.2,
    waterUse: 0,
    utility: { waterKL: 400 },
    cost: 2500,
    upkeep: 120,
    unlockMilestone: 0,
    ...overrides,
  };
}

function makeCoalPlantEntry(overrides: Partial<BuildingCatalogEntry> = {}): BuildingCatalogEntry {
  return {
    id: 'coal-plant',
    name: 'Coal Power Plant',
    category: 'utility',
    footprint: { w: 4, d: 4 },
    height: 22,
    color: 0x3d3d3d,
    powerUse: 0,
    waterUse: 1,
    pollution: 140,
    utility: { powerMW: 60 },
    cost: 12000,
    upkeep: 800,
    unlockMilestone: 0,
    ...overrides,
  };
}

function makeIncineratorEntry(overrides: Partial<BuildingCatalogEntry> = {}): BuildingCatalogEntry {
  return {
    id: 'incinerator',
    name: 'Incinerator',
    category: 'utility',
    footprint: { w: 4, d: 4 },
    height: 20,
    color: 0x6b6d72,
    powerUse: 2,
    waterUse: 2,
    pollution: 120,
    cost: 40000,
    upkeep: 1500,
    unlockMilestone: 3,
    ...overrides,
  };
}

function makeRecyclingDepotEntry(
  overrides: Partial<BuildingCatalogEntry> = {},
): BuildingCatalogEntry {
  return {
    id: 'recycling-depot',
    name: 'Recycling Depot',
    category: 'utility',
    footprint: { w: 2, d: 3 },
    height: 8,
    color: 0x5f6f73,
    powerUse: 0.1,
    waterUse: 0.1,
    garbage: { collectionRange: 40, bufferCapacity: 0, burnRate: 0, trucks: 4, servesHomes: 38000 },
    cost: 20000,
    upkeep: 800,
    unlockMilestone: 2,
    ...overrides,
  };
}

function makeMrfEntry(overrides: Partial<BuildingCatalogEntry> = {}): BuildingCatalogEntry {
  return {
    id: 'materials-recovery-facility',
    name: 'Materials Recovery Facility',
    category: 'utility',
    footprint: { w: 5, d: 6 },
    height: 11,
    color: 0x4e6a7a,
    powerUse: 0.0378,
    waterUse: 0.8,
    garbage: {
      collectionRange: 48,
      bufferCapacity: 165110,
      burnRate: 0,
      trucks: 4,
      sortRate: 9072,
    },
    cost: 24000,
    upkeep: 1750,
    unlockMilestone: 5,
    ...overrides,
  };
}

function makePumpEntry(overrides: Partial<BuildingCatalogEntry> = {}): BuildingCatalogEntry {
  return {
    id: 'water-pump',
    name: 'Water Pumping Station',
    category: 'utility',
    footprint: { w: 2, d: 2 },
    height: 8,
    color: 0x6f8aa0,
    powerUse: 0.0625,
    waterUse: 0,
    utility: { waterKL: 3785 },
    cost: 3600,
    upkeep: 180,
    unlockMilestone: 1,
    requiresAdjacent: 'water',
    ...overrides,
  };
}

function makeWorksEntry(overrides: Partial<BuildingCatalogEntry> = {}): BuildingCatalogEntry {
  return {
    id: 'sewage-works',
    name: 'Sewage Treatment Works',
    category: 'utility',
    footprint: { w: 2, d: 2 },
    height: 9,
    color: 0x8f9ba8,
    powerUse: 0.0932,
    waterUse: 0,
    pollution: 26,
    utility: { sewerKL: 3785, effluent: 0.15 },
    cost: 9000,
    upkeep: 520,
    unlockMilestone: 2,
    requiresAdjacent: 'water',
    ...overrides,
  };
}

function makeDrainEntry(overrides: Partial<BuildingCatalogEntry> = {}): BuildingCatalogEntry {
  return {
    id: 'water-drain',
    name: 'Water Drain Pipe',
    category: 'utility',
    footprint: { w: 1, d: 1 },
    height: 4,
    color: 0x7a7f84,
    powerUse: 0,
    waterUse: 0,
    pollution: 176,
    utility: { sewerKL: 3785 },
    cost: 1800,
    upkeep: 90,
    unlockMilestone: 0,
    requiresAdjacent: 'water',
    ...overrides,
  };
}

function makeSmallParkEntry(overrides: Partial<BuildingCatalogEntry> = {}): BuildingCatalogEntry {
  return {
    id: 'small-park',
    name: 'Pocket Park',
    category: 'park',
    footprint: { w: 1, d: 1 },
    height: 2,
    color: 0x3b846e,
    powerUse: 0,
    waterUse: 0.2,
    landValueBonus: 40,
    service: { kind: 'park', strength: 80, range: 16 },
    cost: 400,
    upkeep: 20,
    unlockMilestone: 0,
    ...overrides,
  };
}

function makeHouseEntry(overrides: Partial<BuildingCatalogEntry> = {}): BuildingCatalogEntry {
  return {
    id: 'house',
    name: 'Test House',
    category: 'res',
    zone: ZoneType.ResLow,
    level: 1,
    footprint: { w: 1, d: 1 },
    height: 10,
    color: 0x8899aa,
    residents: 4,
    powerUse: 0.1,
    waterUse: 0.1,
    cost: 100,
    upkeep: 1,
    unlockMilestone: 0,
    ...overrides,
  };
}

function makeInstance(
  id: number,
  catalogId: string,
  overrides: Partial<BuildingInstance> = {},
): BuildingInstance {
  return {
    id,
    catalogId,
    x: 10,
    z: 10,
    rotation: 0,
    level: 1,
    state: BuildingState.Active,
    problems: 0,
    ...overrides,
  };
}

function deltaAdd(...buildings: BuildingInstance[]): BuildingDelta {
  return { added: buildings, removed: [], updated: [] };
}
function deltaUpdate(...buildings: BuildingInstance[]): BuildingDelta {
  return { added: [], removed: [], updated: buildings };
}
function deltaRemove(...ids: number[]): BuildingDelta {
  return { added: [], removed: ids, updated: [] };
}

function isZeroScale(m: THREE.Matrix4): boolean {
  const e = m.elements;
  return e[0] === 0 && e[5] === 0 && e[10] === 0;
}

function decomposePosition(m: THREE.Matrix4): THREE.Vector3 {
  const pos = new THREE.Vector3();
  m.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
  return pos;
}

function decomposeQuaternion(m: THREE.Matrix4): THREE.Quaternion {
  const quat = new THREE.Quaternion();
  m.decompose(new THREE.Vector3(), quat, new THREE.Vector3());
  return quat;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

describe('UTILITY_KIT_CATALOG_IDS', () => {
  it('is exactly the 10 silhouette-kit ids', () => {
    expect(UTILITY_KIT_CATALOG_IDS).toEqual([
      'wind-turbine',
      'water-tower',
      'water-pump',
      'water-drain',
      'sewage-works',
      'coal-plant',
      'incinerator',
      'recycling-depot',
      'materials-recovery-facility',
      'small-park',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Pure layout functions
// ---------------------------------------------------------------------------

describe('footprintHalfExtents (pure)', () => {
  it('is half the footprint in world meters', () => {
    expect(footprintHalfExtents({ w: 4, d: 4 })).toEqual({
      halfW: 2 * TILE_METERS,
      halfD: 2 * TILE_METERS,
    });
  });
});

describe('rotateLocalXZ (pure)', () => {
  it('matches THREE.Vector3.applyQuaternion for the same Y-axis rotation, for every rotation value', () => {
    const yAxis = new THREE.Vector3(0, 1, 0);
    const samplePoints: ReadonlyArray<readonly [number, number]> = [
      [1, 0],
      [0, 1],
      [3, -4],
      [-2.5, 7.25],
    ];
    for (const rotation of [0, 1, 2, 3] as const) {
      const quat = new THREE.Quaternion().setFromAxisAngle(yAxis, rotation * (Math.PI / 2));
      for (const [x, z] of samplePoints) {
        const expected = new THREE.Vector3(x, 0, z).applyQuaternion(quat);
        const actual = rotateLocalXZ(x, z, rotation);
        expect(actual.x).toBeCloseTo(expected.x, 9);
        expect(actual.z).toBeCloseTo(expected.z, 9);
      }
    }
  });

  it('rotation=0 is the identity', () => {
    expect(rotateLocalXZ(3, -4, 0)).toEqual({ x: 3, z: -4 });
  });
});

describe('wind turbine pure layout', () => {
  it('turbineHubLocal sits above TURBINE_MAST_HEIGHT and in front of the mast (negative local Z)', () => {
    const hub = turbineHubLocal();
    expect(hub.y).toBeGreaterThan(TURBINE_MAST_HEIGHT);
    expect(hub.z).toBeLessThan(0);
    expect(hub.x).toBe(0);
  });

  it('turbineBeaconLocal sits at/above the nacelle, near the mast centerline', () => {
    const beacon = turbineBeaconLocal();
    const hub = turbineHubLocal();
    expect(beacon.y).toBeGreaterThan(TURBINE_MAST_HEIGHT);
    expect(beacon.y).not.toBe(hub.y);
  });

  it('turbineRotorPhase stays within [0, 2*PI) and is deterministic', () => {
    for (let id = 0; id < 200; id++) {
      const phase = turbineRotorPhase(id);
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(Math.PI * 2);
      expect(turbineRotorPhase(id)).toBe(phase);
    }
  });

  it('turbineRotorPhase varies across ids ("turbines don\'t sync")', () => {
    const phases = new Set<number>();
    for (let id = 0; id < 100; id++) phases.add(Math.round(turbineRotorPhase(id) * 1000));
    expect(phases.size).toBeGreaterThan(80);
  });

  it('turbineRotorAngle advances at exactly TURBINE_ROTOR_ANGULAR_SPEED rad/s, independent of phase', () => {
    for (const id of [0, 1, 7, 42, 999]) {
      const a0 = turbineRotorAngle(id, 0);
      const a1 = turbineRotorAngle(id, 2000);
      expect(a1 - a0).toBeCloseTo(2 * TURBINE_ROTOR_ANGULAR_SPEED, 9);
    }
  });

  it('turbineRotorAngle(id, 0) equals turbineRotorPhase(id)', () => {
    expect(turbineRotorAngle(5, 0)).toBeCloseTo(turbineRotorPhase(5), 9);
  });

  it('TURBINE_BLADE_COUNT is 3 ("3-blade rotor", UI-SPEC §6.15)', () => {
    expect(TURBINE_BLADE_COUNT).toBe(3);
  });
});

describe('computeWaterLegPlacements (pure)', () => {
  it('places WATER_LEG_COUNT (4) legs, 6 m out at the ground and 4.6 m out at the balcony ring', () => {
    const legs = computeWaterLegPlacements();
    expect(legs).toHaveLength(WATER_LEG_COUNT);
    expect(WATER_LEG_COUNT).toBe(4);
    for (const leg of legs) {
      expect(Math.hypot(leg.base.x, leg.base.z)).toBeCloseTo(6, 9);
      expect(Math.hypot(leg.top.x, leg.top.z)).toBeCloseTo(4.6, 9);
    }
  });

  it('is symmetric about the center (splay radius identical for every leg)', () => {
    const legs = computeWaterLegPlacements();
    const baseRadii = legs.map((l) => Math.hypot(l.base.x, l.base.z));
    for (const r of baseRadii) expect(r).toBeCloseTo(baseRadii[0]!, 9);
  });

  it('is deterministic and pure', () => {
    expect(computeWaterLegPlacements()).toEqual(computeWaterLegPlacements());
  });
});

describe('computeCoalHallLayout (pure)', () => {
  it('covers ~3x4 of a 4x4 footprint (hall width = footprint.w - 1 tiles, full depth)', () => {
    const layout = computeCoalHallLayout({ w: 4, d: 4 });
    expect(layout.hallHalfW * 2).toBeCloseTo(3 * TILE_METERS, 9);
    expect(layout.hallHalfD * 2).toBeCloseTo(4 * TILE_METERS, 9);
  });

  it('leaves a heap strip whose width plus the hall width fills the whole footprint', () => {
    const layout = computeCoalHallLayout({ w: 4, d: 4 });
    const { halfW } = footprintHalfExtents({ w: 4, d: 4 });
    expect(layout.hallHalfW + layout.heapHalfW).toBeCloseTo(halfW, 9);
  });

  it('scales with footprint size', () => {
    const small = computeCoalHallLayout({ w: 4, d: 4 });
    const big = computeCoalHallLayout({ w: 6, d: 6 });
    expect(big.hallHalfD).toBeGreaterThan(small.hallHalfD);
  });

  it('is deterministic and pure', () => {
    expect(computeCoalHallLayout({ w: 4, d: 4 })).toEqual(computeCoalHallLayout({ w: 4, d: 4 }));
  });
});

describe('computeCoalSmokestackLocalPlacements (pure)', () => {
  it('returns COAL_SMOKESTACK_COUNT (2) placements, symmetric about local Z=0, sharing the same X', () => {
    const placements = computeCoalSmokestackLocalPlacements({ w: 4, d: 4 });
    expect(placements).toHaveLength(COAL_SMOKESTACK_COUNT);
    expect(COAL_SMOKESTACK_COUNT).toBe(2);
    expect(placements[0]!.z).toBeCloseTo(-placements[1]!.z, 9);
    expect(placements[0]!.x).toBeCloseTo(placements[1]!.x, 9);
  });

  it('sits within the hall footprint (over the boiler hall roof)', () => {
    const layout = computeCoalHallLayout({ w: 4, d: 4 });
    const placements = computeCoalSmokestackLocalPlacements({ w: 4, d: 4 });
    for (const p of placements) {
      expect(p.x).toBeCloseTo(layout.hallCenterX, 9);
      expect(Math.abs(p.z)).toBeLessThan(layout.hallHalfD);
    }
  });

  it('is deterministic and pure', () => {
    expect(computeCoalSmokestackLocalPlacements({ w: 4, d: 4 })).toEqual(
      computeCoalSmokestackLocalPlacements({ w: 4, d: 4 }),
    );
  });
});

describe('computeCoalHeapLocalPlacement (pure)', () => {
  it('sits in the free strip beside the hall, not inside the hall footprint', () => {
    const layout = computeCoalHallLayout({ w: 4, d: 4 });
    const heap = computeCoalHeapLocalPlacement({ w: 4, d: 4 });
    expect(heap.x).toBeGreaterThan(layout.hallCenterX + layout.hallHalfW - 1e-9);
  });

  it('is deterministic and pure', () => {
    expect(computeCoalHeapLocalPlacement({ w: 4, d: 4 })).toEqual(
      computeCoalHeapLocalPlacement({ w: 4, d: 4 }),
    );
  });
});

describe('computeIncineratorHallLayout (pure)', () => {
  it('covers ~3x4 of a 4x4 footprint (hall width = footprint.w - 1 tiles, full depth)', () => {
    const layout = computeIncineratorHallLayout({ w: 4, d: 4 });
    expect(layout.hallHalfW * 2).toBeCloseTo(3 * TILE_METERS, 9);
    expect(layout.hallHalfD * 2).toBeCloseTo(4 * TILE_METERS, 9);
  });

  it('leaves a bay strip whose width plus the hall width fills the whole footprint', () => {
    const layout = computeIncineratorHallLayout({ w: 4, d: 4 });
    const { halfW } = footprintHalfExtents({ w: 4, d: 4 });
    expect(layout.hallHalfW + layout.bayHalfW).toBeCloseTo(halfW, 9);
  });

  it('is deterministic and pure', () => {
    expect(computeIncineratorHallLayout({ w: 4, d: 4 })).toEqual(
      computeIncineratorHallLayout({ w: 4, d: 4 }),
    );
  });
});

describe('computeIncineratorStackLocalPlacement (pure)', () => {
  it('sits within the hall footprint (over the processing hall roof)', () => {
    const layout = computeIncineratorHallLayout({ w: 4, d: 4 });
    const stack = computeIncineratorStackLocalPlacement({ w: 4, d: 4 });
    expect(stack.x).toBeCloseTo(layout.hallCenterX, 9);
    expect(Math.abs(stack.z)).toBeLessThan(layout.hallHalfD);
  });

  it('is deterministic and pure', () => {
    expect(computeIncineratorStackLocalPlacement({ w: 4, d: 4 })).toEqual(
      computeIncineratorStackLocalPlacement({ w: 4, d: 4 }),
    );
  });
});

describe('computeIncineratorBayLocalPlacement (pure)', () => {
  it('sits in the free strip beside the hall, not inside the hall footprint', () => {
    const layout = computeIncineratorHallLayout({ w: 4, d: 4 });
    const bay = computeIncineratorBayLocalPlacement({ w: 4, d: 4 });
    expect(bay.x).toBeGreaterThan(layout.hallCenterX + layout.hallHalfW - 1e-9);
  });

  it('is deterministic and pure', () => {
    expect(computeIncineratorBayLocalPlacement({ w: 4, d: 4 })).toEqual(
      computeIncineratorBayLocalPlacement({ w: 4, d: 4 }),
    );
  });
});

describe('computeParkTreeCount (pure)', () => {
  it('stays within [PARK_TREE_MIN, PARK_TREE_MAX] and is deterministic', () => {
    expect(PARK_TREE_MIN).toBe(2);
    expect(PARK_TREE_MAX).toBe(3);
    for (let id = 0; id < 200; id++) {
      const count = computeParkTreeCount(id);
      expect(count).toBeGreaterThanOrEqual(PARK_TREE_MIN);
      expect(count).toBeLessThanOrEqual(PARK_TREE_MAX);
      expect(computeParkTreeCount(id)).toBe(count);
    }
  });

  it('produces both 2 and 3 across many ids (not a constant)', () => {
    const counts = new Set<number>();
    for (let id = 0; id < 200; id++) counts.add(computeParkTreeCount(id));
    expect(counts.has(2)).toBe(true);
    expect(counts.has(3)).toBe(true);
  });
});

describe('computeParkTreePlacements (pure)', () => {
  it('returns computeParkTreeCount(id) placements, all within the tile bounds', () => {
    const footprint = { w: 1, d: 1 };
    const { halfW, halfD } = footprintHalfExtents(footprint);
    for (let id = 0; id < 20; id++) {
      const placements = computeParkTreePlacements(id, footprint);
      expect(placements).toHaveLength(computeParkTreeCount(id));
      for (const p of placements) {
        expect(Math.abs(p.x)).toBeLessThan(halfW);
        expect(Math.abs(p.z)).toBeLessThan(halfD);
      }
    }
  });

  it('is deterministic', () => {
    expect(computeParkTreePlacements(11, { w: 1, d: 1 })).toEqual(
      computeParkTreePlacements(11, { w: 1, d: 1 }),
    );
  });
});

describe('computeParkBenchPlacements (pure)', () => {
  it('returns exactly PARK_BENCH_COUNT (2) placements on opposite sides, facing each other', () => {
    expect(PARK_BENCH_COUNT).toBe(2);
    const placements = computeParkBenchPlacements({ w: 1, d: 1 });
    expect(placements).toHaveLength(2);
    expect(placements[0]!.z).toBeCloseTo(-placements[1]!.z, 9);
    expect(placements[0]!.rotation).not.toBe(placements[1]!.rotation);
  });

  it('is deterministic and pure', () => {
    expect(computeParkBenchPlacements({ w: 1, d: 1 })).toEqual(
      computeParkBenchPlacements({ w: 1, d: 1 }),
    );
  });
});

// ---------------------------------------------------------------------------
// UtilityKitRenderer: registry filtering
// ---------------------------------------------------------------------------

describe('registry filtering (UI-SPEC §6.15)', () => {
  it('kitIds() reflects only registered ids actually present in the given catalog', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [
      makeTurbineEntry(),
      makeHouseEntry(),
    ]);
    expect(renderer.kitIds()).toEqual(new Set(['wind-turbine']));
  });

  it('ignores added deltas for non-kit catalog ids entirely (BuildingInstancer still draws their slab)', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [
      makeTurbineEntry(),
      makeHouseEntry(),
    ]);
    renderer.apply(deltaAdd(makeInstance(1, 'house', { x: 0, z: 0 })));

    expect(renderer.hasInstance(1)).toBe(false);
    for (const kind of ALL_KINDS) expect(renderer.instanceCount('wind-turbine', kind)).toBe(0);
  });

  it('ignores updated deltas for non-kit catalog ids too', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [
      makeTurbineEntry(),
      makeHouseEntry(),
    ]);
    expect(() =>
      renderer.apply(deltaUpdate(makeInstance(1, 'house', { x: 0, z: 0 }))),
    ).not.toThrow();
    expect(renderer.hasInstance(1)).toBe(false);
  });

  it('does not throw and builds nothing when a registered id has no matching catalog entry provided', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, []);
    expect(() => renderer.apply(deltaAdd(makeInstance(1, 'wind-turbine')))).not.toThrow();
    expect(renderer.hasInstance(1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// UtilityKitRenderer: wind-turbine
// ---------------------------------------------------------------------------

describe('wind-turbine kit', () => {
  it('places exactly 1 turbineTower, 1 turbineRotor, 1 turbineBeacon slot per instance', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [makeTurbineEntry()]);
    renderer.apply(deltaAdd(makeInstance(1, 'wind-turbine')));

    expect(renderer.partSlotsFor(1, 'turbineTower')).toHaveLength(1);
    expect(renderer.partSlotsFor(1, 'turbineRotor')).toHaveLength(1);
    expect(renderer.partSlotsFor(1, 'turbineBeacon')).toHaveLength(1);
  });

  it('places the tower at the footprint center (world), matching the BuildingInstancer convention', () => {
    const entry = makeTurbineEntry();
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    renderer.apply(deltaAdd(makeInstance(1, 'wind-turbine', { x: 10, z: 10, rotation: 0 })));

    const centerX = (10 + entry.footprint.w / 2) * TILE_METERS;
    const centerZ = (10 + entry.footprint.d / 2) * TILE_METERS;
    const slot = renderer.partSlotsFor(1, 'turbineTower')[0]!;
    const m = new THREE.Matrix4();
    renderer.getPartMatrix('wind-turbine', 'turbineTower', slot, m);
    const pos = decomposePosition(m);
    expect(pos.x).toBeCloseTo(centerX, 5);
    expect(pos.z).toBeCloseTo(centerZ, 5);
  });

  it('offsets the tower by heightAt (non-flat ground)', () => {
    const entry = makeTurbineEntry();
    const heightAt = (): number => 4.5;
    const renderer = new UtilityKitRenderer(new THREE.Scene(), heightAt, [entry]);
    renderer.apply(deltaAdd(makeInstance(1, 'wind-turbine', { x: 0, z: 0 })));

    const slot = renderer.partSlotsFor(1, 'turbineTower')[0]!;
    const m = new THREE.Matrix4();
    renderer.getPartMatrix('wind-turbine', 'turbineTower', slot, m);
    expect(decomposePosition(m).y).toBeCloseTo(4.5, 5);
  });

  it('rotates the beacon offset by the instance rotation, matching rotateLocalXZ exactly', () => {
    const entry = makeTurbineEntry();
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    renderer.apply(deltaAdd(makeInstance(2, 'wind-turbine', { x: 0, z: 0, rotation: 1 })));

    const centerX = (0 + entry.footprint.w / 2) * TILE_METERS;
    const centerZ = (0 + entry.footprint.d / 2) * TILE_METERS;
    const beaconLocal = turbineBeaconLocal();
    const rotated = rotateLocalXZ(beaconLocal.x, beaconLocal.z, 1);

    const slot = renderer.partSlotsFor(2, 'turbineBeacon')[0]!;
    const m = new THREE.Matrix4();
    renderer.getPartMatrix('wind-turbine', 'turbineBeacon', slot, m);
    const pos = decomposePosition(m);
    expect(pos.x).toBeCloseTo(centerX + rotated.x, 5);
    expect(pos.z).toBeCloseTo(centerZ + rotated.z, 5);
  });

  it('is deterministic: two renderers given the same delta produce identical tower matrices', () => {
    const entry = makeTurbineEntry();
    const rendererA = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    rendererA.apply(deltaAdd(makeInstance(3, 'wind-turbine')));
    const rendererB = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    rendererB.apply(deltaAdd(makeInstance(3, 'wind-turbine')));

    const mA = new THREE.Matrix4();
    const mB = new THREE.Matrix4();
    const slotA = rendererA.partSlotsFor(3, 'turbineTower')[0]!;
    const slotB = rendererB.partSlotsFor(3, 'turbineTower')[0]!;
    rendererA.getPartMatrix('wind-turbine', 'turbineTower', slotA, mA);
    rendererB.getPartMatrix('wind-turbine', 'turbineTower', slotB, mB);
    expect(mA.elements).toEqual(mB.elements);
  });
});

// ---------------------------------------------------------------------------
// UtilityKitRenderer: rotor spin (phase differs per id, advances with update)
// ---------------------------------------------------------------------------

describe('wind-turbine rotor spin (UI-SPEC §6.15)', () => {
  it('at rotation=0, the rotor quaternion at t matches a pure Z-axis rotation by turbineRotorAngle(id, t)', () => {
    const entry = makeTurbineEntry();
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    renderer.apply(deltaAdd(makeInstance(1, 'wind-turbine', { x: 0, z: 0, rotation: 0 })));

    renderer.update(1234);
    const slot = renderer.partSlotsFor(1, 'turbineRotor')[0]!;
    const m = new THREE.Matrix4();
    renderer.getPartMatrix('wind-turbine', 'turbineRotor', slot, m);
    const quat = decomposeQuaternion(m);

    const expectedAngle = turbineRotorAngle(1, 1234);
    const expected = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      expectedAngle,
    );
    expect(quat.angleTo(expected)).toBeLessThan(1e-6);
  });

  it('advances the rotor rotation as update(tMs) advances', () => {
    const entry = makeTurbineEntry();
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    renderer.apply(deltaAdd(makeInstance(1, 'wind-turbine', { x: 0, z: 0, rotation: 0 })));

    renderer.update(0);
    const slot = renderer.partSlotsFor(1, 'turbineRotor')[0]!;
    const m0 = new THREE.Matrix4();
    renderer.getPartMatrix('wind-turbine', 'turbineRotor', slot, m0);
    const quat0 = decomposeQuaternion(m0);

    renderer.update(3000);
    const m1 = new THREE.Matrix4();
    renderer.getPartMatrix('wind-turbine', 'turbineRotor', slot, m1);
    const quat1 = decomposeQuaternion(m1);

    expect(quat1.angleTo(quat0)).toBeGreaterThan(0.01);

    const expectedDelta = 3 * TURBINE_ROTOR_ANGULAR_SPEED;
    const expectedQuat1 = new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(0, 0, 1), turbineRotorAngle(1, 0) + expectedDelta)
      .normalize();
    expect(quat1.angleTo(expectedQuat1)).toBeLessThan(1e-6);
  });

  it('two different turbine instances spin out of phase at the same tMs ("turbines don\'t sync")', () => {
    const entry = makeTurbineEntry();
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    renderer.apply(
      deltaAdd(
        makeInstance(10, 'wind-turbine', { x: 0, z: 0 }),
        makeInstance(11, 'wind-turbine', { x: 5, z: 5 }),
      ),
    );
    renderer.update(500);

    const slotA = renderer.partSlotsFor(10, 'turbineRotor')[0]!;
    const slotB = renderer.partSlotsFor(11, 'turbineRotor')[0]!;
    const mA = new THREE.Matrix4();
    const mB = new THREE.Matrix4();
    renderer.getPartMatrix('wind-turbine', 'turbineRotor', slotA, mA);
    renderer.getPartMatrix('wind-turbine', 'turbineRotor', slotB, mB);

    expect(decomposeQuaternion(mA).angleTo(decomposeQuaternion(mB))).toBeGreaterThan(0.01);
  });

  it('rotates rigidly with the building rotation (rotor spin axis follows the facing direction)', () => {
    const entry = makeTurbineEntry();
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    renderer.apply(deltaAdd(makeInstance(1, 'wind-turbine', { x: 0, z: 0, rotation: 2 })));
    renderer.update(777);

    const slot = renderer.partSlotsFor(1, 'turbineRotor')[0]!;
    const m = new THREE.Matrix4();
    renderer.getPartMatrix('wind-turbine', 'turbineRotor', slot, m);
    const quat = decomposeQuaternion(m);

    const yaw = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      2 * (Math.PI / 2),
    );
    const spin = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      turbineRotorAngle(1, 777),
    );
    const expected = yaw.clone().multiply(spin);
    expect(quat.angleTo(expected)).toBeLessThan(1e-6);
  });
});

// ---------------------------------------------------------------------------
// UtilityKitRenderer: water-tower
// ---------------------------------------------------------------------------

describe('water-tower kit', () => {
  it('places exactly 1 waterSteel and 1 waterTank slot per instance', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [
      makeWaterTowerEntry(),
    ]);
    renderer.apply(deltaAdd(makeInstance(1, 'water-tower')));
    expect(renderer.partSlotsFor(1, 'waterSteel')).toHaveLength(1);
    expect(renderer.partSlotsFor(1, 'waterTank')).toHaveLength(1);
  });

  it('braces the legs in 3 panels', () => {
    expect(WATER_PANEL_COUNT).toBe(3);
  });

  describe('drawn geometry', () => {
    const { steel, tank } = buildWaterTowerGeometry();
    const vertices = (g: THREE.BufferGeometry): THREE.Vector3[] => {
      const p = g.getAttribute('position');
      return Array.from({ length: p.count }, (_, i) =>
        new THREE.Vector3().fromBufferAttribute(p, i),
      );
    };
    const steelVerts = vertices(steel);
    const tankVerts = vertices(tank);

    it('holds the tank capacity in its drawn bottom and shell', () => {
      // Signed volume of the bottom + shell triangles, closed by the flat disc at the shell top.
      const index = tank.getIndex()!;
      let volume = 0;
      for (let i = 0; i < index.count; i += 3) {
        const [a, b, c] = [0, 1, 2].map((k) => tankVerts[index.getX(i + k)]!) as [
          THREE.Vector3,
          THREE.Vector3,
          THREE.Vector3,
        ];
        const lowest = Math.min(a.y, b.y, c.y);
        const highest = Math.max(a.y, b.y, c.y);
        if (lowest >= WATER_SHELL_TOP_Y - 1e-6 || highest > WATER_SHELL_TOP_Y + 1e-6) continue;
        volume += a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
      }
      const capArea =
        0.5 *
        WATER_TANK_SEGMENTS *
        WATER_TANK_RADIUS ** 2 *
        Math.sin((2 * Math.PI) / WATER_TANK_SEGMENTS);
      volume += (capArea * WATER_SHELL_TOP_Y) / 3;
      expect(Math.abs(volume - 378.5) / 378.5).toBeLessThan(0.02);
    });

    it('stands the shell top at 33.55 m, the crown near 36 m and the bottom at 27 m', () => {
      expect(WATER_TANK_BOTTOM_Y + WATER_TANK_BOTTOM_DEPTH + WATER_TANK_SHELL_HEIGHT).toBeCloseTo(
        33.55,
        9,
      );
      expect(Math.min(...tankVerts.map((v) => v.y))).toBeCloseTo(27, 5);
      const shellVerts = tankVerts.filter((v) => Math.hypot(v.x, v.z) > WATER_TANK_RADIUS - 1e-6);
      expect(Math.max(...shellVerts.map((v) => v.y))).toBeCloseTo(33.55, 5);
      expect(WATER_CROWN_Y).toBeCloseTo(35.85, 9);
      const top = Math.max(...tankVerts.map((v) => v.y));
      expect(top).toBeGreaterThanOrEqual(WATER_CROWN_Y);
      expect(top).toBeLessThanOrEqual(36.1);
    });

    it('keeps every vertex inside the 20 m tile around the centre', () => {
      for (const v of [...steelVerts, ...tankVerts]) {
        expect(Math.abs(v.x)).toBeLessThanOrEqual(TILE_METERS / 2);
        expect(Math.abs(v.z)).toBeLessThanOrEqual(TILE_METERS / 2);
      }
    });

    it('lands the legs at 6 m out on the ground and rings the balcony at 5.55 m', () => {
      expect(WATER_LEG_BASE_RADIUS).toBe(6);
      expect(WATER_LEG_TOP_RADIUS).toBe(4.6);
      expect(Math.min(...steelVerts.map((v) => v.y))).toBeGreaterThan(-0.05);
      const atGround = steelVerts.filter((v) => v.y < 0.05 && Math.hypot(v.x, v.z) > 3);
      const farthest = Math.max(...atGround.map((v) => Math.hypot(v.x, v.z)));
      expect(farthest).toBeGreaterThan(6);
      expect(farthest).toBeLessThan(6.4);
      const atBalcony = steelVerts.filter((v) => Math.abs(v.y - WATER_BALCONY_Y) < 1e-6);
      expect(Math.max(...atBalcony.map((v) => Math.hypot(v.x, v.z)))).toBeCloseTo(
        WATER_BALCONY_OUTER_RADIUS,
        6,
      );
    });
  });

  it('places both parts at the footprint center (world)', () => {
    const entry = makeWaterTowerEntry();
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    renderer.apply(deltaAdd(makeInstance(1, 'water-tower', { x: 4, z: 4, rotation: 0 })));

    const centerX = (4 + entry.footprint.w / 2) * TILE_METERS;
    const centerZ = (4 + entry.footprint.d / 2) * TILE_METERS;
    const m = new THREE.Matrix4();
    renderer.getPartMatrix(
      'water-tower',
      'waterTank',
      renderer.partSlotsFor(1, 'waterTank')[0]!,
      m,
    );
    const pos = decomposePosition(m);
    expect(pos.x).toBeCloseTo(centerX, 5);
    expect(pos.z).toBeCloseTo(centerZ, 5);
  });
});

// ---------------------------------------------------------------------------
// UtilityKitRenderer: coal-plant
// ---------------------------------------------------------------------------

describe('coal-plant kit', () => {
  it('places 1 coalHall, COAL_SMOKESTACK_COUNT (2) coalSmokestack, and 1 coalHeap slot per instance', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [
      makeCoalPlantEntry(),
    ]);
    renderer.apply(deltaAdd(makeInstance(1, 'coal-plant')));
    expect(renderer.partSlotsFor(1, 'coalHall')).toHaveLength(1);
    expect(renderer.partSlotsFor(1, 'coalSmokestack')).toHaveLength(2);
    expect(renderer.partSlotsFor(1, 'coalHeap')).toHaveLength(1);
  });

  it('places the 2 smokestacks at distinct world positions matching computeCoalSmokestackLocalPlacements', () => {
    const entry = makeCoalPlantEntry();
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    renderer.apply(deltaAdd(makeInstance(1, 'coal-plant', { x: 0, z: 0, rotation: 0 })));

    const centerX = (0 + entry.footprint.w / 2) * TILE_METERS;
    const centerZ = (0 + entry.footprint.d / 2) * TILE_METERS;
    const expectedLocals = computeCoalSmokestackLocalPlacements(entry.footprint);
    const slots = renderer.partSlotsFor(1, 'coalSmokestack');

    const m = new THREE.Matrix4();
    const worldPositions = slots.map((slot) => {
      renderer.getPartMatrix('coal-plant', 'coalSmokestack', slot, m);
      return decomposePosition(m.clone());
    });

    for (const local of expectedLocals) {
      const match = worldPositions.some(
        (p) =>
          Math.abs(p.x - (centerX + local.x)) < 1e-5 && Math.abs(p.z - (centerZ + local.z)) < 1e-5,
      );
      expect(match).toBe(true);
    }
  });

  it('scales part counts consistently across a bigger footprint (still exactly 2 smokestacks)', () => {
    const entry = makeCoalPlantEntry({ footprint: { w: 6, d: 6 } });
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    renderer.apply(deltaAdd(makeInstance(1, 'coal-plant')));
    expect(renderer.partSlotsFor(1, 'coalSmokestack')).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// UtilityKitRenderer: incinerator
// ---------------------------------------------------------------------------

describe('incinerator kit', () => {
  it('places 1 incineratorHall, 1 incineratorStack, and 1 incineratorBay slot per instance', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [
      makeIncineratorEntry(),
    ]);
    renderer.apply(deltaAdd(makeInstance(1, 'incinerator')));
    expect(renderer.partSlotsFor(1, 'incineratorHall')).toHaveLength(1);
    expect(renderer.partSlotsFor(1, 'incineratorStack')).toHaveLength(1);
    expect(renderer.partSlotsFor(1, 'incineratorBay')).toHaveLength(1);
  });

  it('places the single flue at the world position matching computeIncineratorStackLocalPlacement', () => {
    const entry = makeIncineratorEntry();
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    renderer.apply(deltaAdd(makeInstance(1, 'incinerator', { x: 0, z: 0, rotation: 0 })));

    const centerX = (0 + entry.footprint.w / 2) * TILE_METERS;
    const centerZ = (0 + entry.footprint.d / 2) * TILE_METERS;
    const local = computeIncineratorStackLocalPlacement(entry.footprint);
    const slot = renderer.partSlotsFor(1, 'incineratorStack')[0]!;

    const m = new THREE.Matrix4();
    renderer.getPartMatrix('incinerator', 'incineratorStack', slot, m);
    const pos = decomposePosition(m);
    expect(pos.x).toBeCloseTo(centerX + local.x, 5);
    expect(pos.z).toBeCloseTo(centerZ + local.z, 5);
  });

  it('scales part counts consistently across a bigger footprint (still exactly 1 flue)', () => {
    const entry = makeIncineratorEntry({ footprint: { w: 6, d: 6 } });
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    renderer.apply(deltaAdd(makeInstance(1, 'incinerator')));
    expect(renderer.partSlotsFor(1, 'incineratorStack')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// UtilityKitRenderer: recycling-depot
// ---------------------------------------------------------------------------

describe('recycling-depot kit', () => {
  const entry = makeRecyclingDepotEntry();

  it('places 1 shed, 1 office and RECYCLING_TRUCK_COUNT (4) parked trucks per instance', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    renderer.apply(deltaAdd(makeInstance(1, 'recycling-depot')));
    expect(renderer.partSlotsFor(1, 'recyclingYard')).toHaveLength(1);
    expect(renderer.partSlotsFor(1, 'recyclingShed')).toHaveLength(1);
    expect(renderer.partSlotsFor(1, 'recyclingOffice')).toHaveLength(1);
    expect(renderer.partSlotsFor(1, 'recyclingTruck')).toHaveLength(RECYCLING_TRUCK_COUNT);
    expect(RECYCLING_TRUCK_COUNT).toBe(4);
  });

  it('paves the whole 2x3 lot and stands the trucks on that pavement', () => {
    const { halfW, halfD } = footprintHalfExtents(entry.footprint);
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    const yard = renderer.partGeometry('recycling-depot', 'recyclingYard')!;
    yard.computeBoundingBox();
    expect(yard.boundingBox!.min.x).toBeCloseTo(-halfW, 5);
    expect(yard.boundingBox!.max.x).toBeCloseTo(halfW, 5);
    expect(yard.boundingBox!.min.z).toBeCloseTo(-halfD, 5);
    expect(yard.boundingBox!.max.z).toBeCloseTo(halfD, 5);
    expect(yard.boundingBox!.max.y).toBeCloseTo(RECYCLING_YARD_HEIGHT, 5);

    renderer.apply(deltaAdd(makeInstance(1, 'recycling-depot')));
    const m = new THREE.Matrix4();
    for (const slot of renderer.partSlotsFor(1, 'recyclingTruck')) {
      renderer.getPartMatrix('recycling-depot', 'recyclingTruck', slot, m);
      expect(decomposePosition(m).y).toBeCloseTo(RECYCLING_YARD_HEIGHT, 5);
    }
  });

  it('keeps the shed, office and every truck inside the 2x3 lot, clear of one another', () => {
    const { halfW, halfD } = footprintHalfExtents(entry.footprint);
    const layout = computeRecyclingDepotLayout(entry.footprint);
    const [truckW, , truckL] = sizeForKind(VehicleKind.Recycling);

    const shedHalf = { w: RECYCLING_SHED_SIZE.w / 2, d: RECYCLING_SHED_SIZE.d / 2 };
    const officeHalf = { w: RECYCLING_OFFICE_SIZE.w / 2, d: RECYCLING_OFFICE_SIZE.d / 2 };
    const boxes = [
      { ...layout.shed, hw: shedHalf.w, hd: shedHalf.d },
      { ...layout.office, hw: officeHalf.w, hd: officeHalf.d },
      ...layout.trucks.map((t) => ({ ...t, hw: truckW / 2, hd: truckL / 2 })),
    ];
    for (const b of boxes) {
      expect(b.x - b.hw).toBeGreaterThanOrEqual(-halfW);
      expect(b.x + b.hw).toBeLessThanOrEqual(halfW);
      expect(b.z - b.hd).toBeGreaterThanOrEqual(-halfD);
      expect(b.z + b.hd).toBeLessThanOrEqual(halfD);
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const overlap = Math.abs(a.x - b.x) < a.hw + b.hw && Math.abs(a.z - b.z) < a.hd + b.hd;
        expect(overlap).toBe(false);
      }
    }
  });

  it('is a 30 x 20 m shed, 8 m to the eaves, with the trucks parked in front of its street-side wall', () => {
    expect(RECYCLING_SHED_SIZE).toEqual({ w: 30, d: 20, h: 8 });
    const layout = computeRecyclingDepotLayout(entry.footprint);
    const shedFront = layout.shed.z + RECYCLING_SHED_SIZE.d / 2;
    for (const truck of layout.trucks) expect(truck.z).toBeGreaterThan(shedFront);

    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    const shed = renderer.partGeometry('recycling-depot', 'recyclingShed')!;
    shed.computeBoundingBox();
    expect(shed.boundingBox!.max.y).toBeCloseTo(8.5, 5); // 8 m eaves + the roof cap
  });

  it('draws each truck at the recycling fleet body size', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    const truck = renderer.partGeometry('recycling-depot', 'recyclingTruck')!;
    truck.computeBoundingBox();
    const size = truck.boundingBox!.getSize(new THREE.Vector3());
    const [w, h, l] = sizeForKind(VehicleKind.Recycling);
    // The body's wheels stand a little proud of the body slab, so the overall
    // extent is the fleet size plus that, and no more.
    expect(size.x).toBeGreaterThanOrEqual(w);
    expect(size.x).toBeLessThanOrEqual(w * 1.15);
    expect(size.y).toBeLessThanOrEqual(h * 1.1);
    expect(size.z).toBeGreaterThan(l * 0.9);
    expect(size.z).toBeLessThanOrEqual(l * 1.1);
    expect(l).toBe(9);
  });

  it('places every part at the rotated local position for each rotation, trucks keeping the lot turned (3x2 / 2x3)', () => {
    for (const rotation of [0, 1, 2, 3] as const) {
      const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [entry]);
      renderer.apply(deltaAdd(makeInstance(1, 'recycling-depot', { x: 0, z: 0, rotation })));
      const lot = footprintForRotation(entry, rotation);
      const centerX = (lot.w / 2) * TILE_METERS;
      const centerZ = (lot.d / 2) * TILE_METERS;
      const layout = computeRecyclingDepotLayout(entry.footprint);
      const slots = renderer.partSlotsFor(1, 'recyclingTruck');
      const m = new THREE.Matrix4();
      layout.trucks.forEach((local, i) => {
        renderer.getPartMatrix('recycling-depot', 'recyclingTruck', slots[i]!, m);
        const pos = decomposePosition(m);
        const rotated = rotateLocalXZ(local.x, local.z, rotation);
        expect(pos.x).toBeCloseTo(centerX + rotated.x, 5);
        expect(pos.z).toBeCloseTo(centerZ + rotated.z, 5);
        expect(pos.x).toBeGreaterThan(0);
        expect(pos.x).toBeLessThan(lot.w * TILE_METERS);
        expect(pos.z).toBeGreaterThan(0);
        expect(pos.z).toBeLessThan(lot.d * TILE_METERS);

        const quat = decomposeQuaternion(m);
        const expected = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          rotation * (Math.PI / 2),
        );
        expect(quat.angleTo(expected)).toBeCloseTo(0, 5);
      });
    }
  });
});

// ---------------------------------------------------------------------------
// UtilityKitRenderer: small-park
// ---------------------------------------------------------------------------

describe('small-park kit', () => {
  it('places 1 parkGround, computeParkTreeCount(id) parkTree, and PARK_BENCH_COUNT (2) parkBench slots', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [
      makeSmallParkEntry(),
    ]);
    renderer.apply(deltaAdd(makeInstance(7, 'small-park')));

    expect(renderer.partSlotsFor(7, 'parkGround')).toHaveLength(1);
    expect(renderer.partSlotsFor(7, 'parkTree')).toHaveLength(computeParkTreeCount(7));
    expect(renderer.partSlotsFor(7, 'parkBench')).toHaveLength(2);
  });

  it('places trees at world positions matching computeParkTreePlacements + rotateLocalXZ', () => {
    const entry = makeSmallParkEntry();
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    renderer.apply(deltaAdd(makeInstance(3, 'small-park', { x: 2, z: 2, rotation: 1 })));

    const centerX = (2 + entry.footprint.w / 2) * TILE_METERS;
    const centerZ = (2 + entry.footprint.d / 2) * TILE_METERS;
    const locals = computeParkTreePlacements(3, entry.footprint);
    const slots = renderer.partSlotsFor(3, 'parkTree');
    expect(slots).toHaveLength(locals.length);

    const m = new THREE.Matrix4();
    for (let i = 0; i < slots.length; i++) {
      renderer.getPartMatrix('small-park', 'parkTree', slots[i]!, m);
      const pos = decomposePosition(m);
      const rotated = rotateLocalXZ(locals[i]!.x, locals[i]!.z, 1);
      expect(pos.x).toBeCloseTo(centerX + rotated.x, 5);
      expect(pos.z).toBeCloseTo(centerZ + rotated.z, 5);
    }
  });

  it('is deterministic: two renderers given the same delta produce the same tree count and matrices', () => {
    const entry = makeSmallParkEntry();
    const rendererA = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    rendererA.apply(deltaAdd(makeInstance(9, 'small-park')));
    const rendererB = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    rendererB.apply(deltaAdd(makeInstance(9, 'small-park')));

    expect(rendererA.partSlotsFor(9, 'parkTree').length).toBe(
      rendererB.partSlotsFor(9, 'parkTree').length,
    );

    const mA = new THREE.Matrix4();
    const mB = new THREE.Matrix4();
    renderer_getFirst(rendererA, mA, 9);
    renderer_getFirst(rendererB, mB, 9);
    expect(mA.elements).toEqual(mB.elements);

    function renderer_getFirst(r: UtilityKitRenderer, out: THREE.Matrix4, id: number): void {
      r.getPartMatrix('small-park', 'parkGround', r.partSlotsFor(id, 'parkGround')[0]!, out);
    }
  });
});

// ---------------------------------------------------------------------------
// Night cycle: only the turbine beacon glows
// ---------------------------------------------------------------------------

describe('night cycle (UI-SPEC §6.15 — "kits stay unlit except a small red turbine nacelle beacon")', () => {
  it('defaults to nightFactor 0 and clamps out-of-range values into [0,1]', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [makeTurbineEntry()]);
    expect(renderer.nightFactor()).toBe(0);
    renderer.setNightFactor(1.7);
    expect(renderer.nightFactor()).toBe(1);
    renderer.setNightFactor(-3);
    expect(renderer.nightFactor()).toBe(0);
    renderer.setNightFactor(0.42);
    expect(renderer.nightFactor()).toBeCloseTo(0.42, 9);
  });

  it('the beacon glows steadily in proportion to nightFactor (no pulse dependency on time)', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [makeTurbineEntry()]);
    renderer.setNightFactor(1);
    expect(renderer.beaconIntensity()).toBeCloseTo(1, 9);
    renderer.setNightFactor(0.5);
    expect(renderer.beaconIntensity()).toBeCloseTo(0.5, 9);
    renderer.setNightFactor(0);
    expect(renderer.beaconIntensity()).toBe(0);
  });

  it('non-turbine kit parts carry no emissive color at all, even at full night', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [
      makeWaterTowerEntry(),
      makeCoalPlantEntry(),
      makeIncineratorEntry(),
      makeSmallParkEntry(),
    ]);
    renderer.setNightFactor(1);
    expect(renderer.partEmissiveHex('water-tower', 'waterTank')).toBe(0);
    expect(renderer.partEmissiveHex('coal-plant', 'coalHall')).toBe(0);
    expect(renderer.partEmissiveHex('incinerator', 'incineratorHall')).toBe(0);
    expect(renderer.partEmissiveHex('small-park', 'parkGround')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Removal exactness
// ---------------------------------------------------------------------------

describe('removal exactness', () => {
  it('zero-scales and frees every slot a removed small-park instance owned (variable tree count)', () => {
    const entry = makeSmallParkEntry();
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    renderer.apply(deltaAdd(makeInstance(1, 'small-park')));

    const captured = new Map<UtilityKitPartKind, readonly number[]>();
    for (const kind of ['parkGround', 'parkTree', 'parkBench'] as const) {
      captured.set(kind, renderer.partSlotsFor(1, kind));
    }
    for (const kind of ['parkGround', 'parkTree', 'parkBench'] as const) {
      expect(captured.get(kind)!.length).toBeGreaterThan(0);
    }

    renderer.apply(deltaRemove(1));

    expect(renderer.hasInstance(1)).toBe(false);
    for (const kind of ['parkGround', 'parkTree', 'parkBench'] as const) {
      expect(renderer.partSlotsFor(1, kind)).toHaveLength(0);
    }

    const m = new THREE.Matrix4();
    for (const kind of ['parkGround', 'parkTree', 'parkBench'] as const) {
      for (const slot of captured.get(kind)!) {
        renderer.getPartMatrix('small-park', kind, slot, m);
        expect(isZeroScale(m)).toBe(true);
      }
    }
  });

  it('zero-scales and frees every slot a removed coal-plant instance owned (add -> remove -> counts)', () => {
    const entry = makeCoalPlantEntry();
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    renderer.apply(deltaAdd(makeInstance(1, 'coal-plant')));
    expect(renderer.partSlotsFor(1, 'coalSmokestack')).toHaveLength(2);

    renderer.apply(deltaRemove(1));

    expect(renderer.hasInstance(1)).toBe(false);
    expect(renderer.partSlotsFor(1, 'coalHall')).toHaveLength(0);
    expect(renderer.partSlotsFor(1, 'coalSmokestack')).toHaveLength(0);
    expect(renderer.partSlotsFor(1, 'coalHeap')).toHaveLength(0);
  });

  it('zero-scales and frees every slot a removed incinerator instance owned (add -> remove -> counts)', () => {
    const entry = makeIncineratorEntry();
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    renderer.apply(deltaAdd(makeInstance(1, 'incinerator')));
    expect(renderer.partSlotsFor(1, 'incineratorStack')).toHaveLength(1);

    renderer.apply(deltaRemove(1));

    expect(renderer.hasInstance(1)).toBe(false);
    expect(renderer.partSlotsFor(1, 'incineratorHall')).toHaveLength(0);
    expect(renderer.partSlotsFor(1, 'incineratorStack')).toHaveLength(0);
    expect(renderer.partSlotsFor(1, 'incineratorBay')).toHaveLength(0);
  });

  it('removing one instance leaves another instance fully intact', () => {
    const entry = makeTurbineEntry();
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    renderer.apply(
      deltaAdd(
        makeInstance(1, 'wind-turbine', { x: 0, z: 0 }),
        makeInstance(2, 'wind-turbine', { x: 20, z: 20 }),
      ),
    );

    const slotB = renderer.partSlotsFor(2, 'turbineTower')[0]!;
    const before = new THREE.Matrix4();
    renderer.getPartMatrix('wind-turbine', 'turbineTower', slotB, before);

    renderer.apply(deltaRemove(1));

    expect(renderer.hasInstance(1)).toBe(false);
    expect(renderer.hasInstance(2)).toBe(true);

    const after = new THREE.Matrix4();
    renderer.getPartMatrix('wind-turbine', 'turbineTower', slotB, after);
    expect(after.elements).toEqual(before.elements);
    expect(isZeroScale(after)).toBe(false);
  });

  it('recycles freed slots instead of growing pools unboundedly', () => {
    const entry = makeTurbineEntry();
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    renderer.apply(deltaAdd(makeInstance(1, 'wind-turbine', { x: 0, z: 0 })));
    const countAfterFirst = renderer.instanceCount('wind-turbine', 'turbineTower');

    renderer.apply(deltaRemove(1));
    renderer.apply(deltaAdd(makeInstance(2, 'wind-turbine', { x: 20, z: 20 })));
    const countAfterSecond = renderer.instanceCount('wind-turbine', 'turbineTower');

    expect(countAfterSecond).toBe(countAfterFirst);
  });

  it('removing an id that was never added (or already removed) is a harmless no-op', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [makeTurbineEntry()]);
    expect(() => renderer.apply(deltaRemove(999))).not.toThrow();

    renderer.apply(deltaAdd(makeInstance(1, 'wind-turbine')));
    renderer.apply(deltaRemove(1));
    expect(() => renderer.apply(deltaRemove(1))).not.toThrow();
    expect(renderer.hasInstance(1)).toBe(false);
  });

  it('an update() rebuild (BuildingDelta.updated) frees the previous slots rather than leaking them', () => {
    const entry = makeTurbineEntry();
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    renderer.apply(deltaAdd(makeInstance(1, 'wind-turbine', { x: 0, z: 0, rotation: 0 })));
    const countAfterAdd = renderer.instanceCount('wind-turbine', 'turbineTower');

    renderer.apply(deltaUpdate(makeInstance(1, 'wind-turbine', { x: 0, z: 0, rotation: 2 })));
    const countAfterUpdate = renderer.instanceCount('wind-turbine', 'turbineTower');

    expect(countAfterUpdate).toBe(countAfterAdd);
  });
});

// ---------------------------------------------------------------------------
// UtilityKitRenderer: materials-recovery-facility
// ---------------------------------------------------------------------------

describe('materials-recovery-facility kit', () => {
  const entry = makeMrfEntry();
  const { halfW, halfD } = footprintHalfExtents(entry.footprint);
  const boundsOf = (kind: UtilityKitPartKind): THREE.Box3 => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    const geometry = renderer.partGeometry('materials-recovery-facility', kind)!;
    geometry.computeBoundingBox();
    return geometry.boundingBox!;
  };

  it('places a yard, a hall, a bale yard, an office and four parked trucks per instance', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    renderer.apply(deltaAdd(makeInstance(1, 'materials-recovery-facility')));
    for (const kind of ['mrfYard', 'mrfHall', 'mrfBales', 'mrfOffice'] as const) {
      expect(renderer.partSlotsFor(1, kind)).toHaveLength(1);
    }
    expect(renderer.partSlotsFor(1, 'mrfTruck')).toHaveLength(MRF_TRUCK_COUNT);
    expect(MRF_TRUCK_COUNT).toBe(4);
  });

  it('is a 2,510 m² clear-span hall, 11 m to the eaves, with its bay doors on the street side', () => {
    expect(MRF_HALL_SIZE.w * MRF_HALL_SIZE.d).toBeCloseTo(2_510, -1);
    expect(MRF_HALL_SIZE.h).toBe(11);
    const hall = boundsOf('mrfHall');
    expect(hall.max.y).toBeCloseTo(11.6, 5); // 11 m eaves + the roof cap
    const layout = computeMrfLayout(entry.footprint);
    // The doors stand proud of the street-side (+Z) wall and nowhere else.
    expect(hall.max.z).toBeGreaterThan(layout.hall.z + MRF_HALL_SIZE.d / 2);
    expect(hall.min.z).toBeCloseTo(layout.hall.z - MRF_HALL_SIZE.d / 2, 5);
    for (const truck of layout.trucks) {
      expect(truck.z).toBeGreaterThan(layout.hall.z + MRF_HALL_SIZE.d / 2);
    }
  });

  it('stacks bales of 1.1 x 0.75 x 1.5 m on the yard slab, some three high', () => {
    expect(MRF_BALE_SIZE).toEqual({ w: 1.1, h: 0.75, l: 1.5 });
    const { bales } = computeMrfLayout(entry.footprint);
    expect(bales.length).toBeGreaterThan(100);
    expect(Math.min(...bales.map((b) => b.y))).toBeCloseTo(RECYCLING_YARD_HEIGHT, 5);
    expect(Math.max(...bales.map((b) => b.y))).toBeCloseTo(
      RECYCLING_YARD_HEIGHT + 2 * MRF_BALE_SIZE.h,
      5,
    );
    const geometry = boundsOf('mrfBales');
    expect(geometry.max.y).toBeCloseTo(RECYCLING_YARD_HEIGHT + 3 * MRF_BALE_SIZE.h, 5);
  });

  it('keeps the yard, hall, bales, office and every truck inside the 5x6 lot, clear of one another', () => {
    for (const kind of ['mrfYard', 'mrfHall', 'mrfBales', 'mrfOffice'] as const) {
      const box = boundsOf(kind);
      expect(box.min.x).toBeGreaterThanOrEqual(-halfW - 1e-9);
      expect(box.max.x).toBeLessThanOrEqual(halfW + 1e-9);
      expect(box.min.z).toBeGreaterThanOrEqual(-halfD - 1e-9);
      expect(box.max.z).toBeLessThanOrEqual(halfD + 1e-9);
    }
    const yard = boundsOf('mrfYard');
    expect([yard.min.x, yard.max.x, yard.min.z, yard.max.z]).toEqual([
      -halfW,
      halfW,
      -halfD,
      halfD,
    ]);

    const layout = computeMrfLayout(entry.footprint);
    const [truckW, , truckL] = sizeForKind(VehicleKind.Recycling);
    const flat = (b: THREE.Box3) => ({
      x: (b.min.x + b.max.x) / 2,
      z: (b.min.z + b.max.z) / 2,
      hw: (b.max.x - b.min.x) / 2,
      hd: (b.max.z - b.min.z) / 2,
    });
    const boxes = [
      flat(boundsOf('mrfHall')),
      flat(boundsOf('mrfBales')),
      flat(boundsOf('mrfOffice')),
      ...layout.trucks.map((t) => ({ ...t, hw: truckW / 2, hd: truckL / 2 })),
    ];
    for (const b of boxes.slice(3)) {
      expect(b.x - b.hw).toBeGreaterThanOrEqual(-halfW);
      expect(b.x + b.hw).toBeLessThanOrEqual(halfW);
      expect(b.z - b.hd).toBeGreaterThanOrEqual(-halfD);
      expect(b.z + b.hd).toBeLessThanOrEqual(halfD);
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const overlap = Math.abs(a.x - b.x) < a.hw + b.hw && Math.abs(a.z - b.z) < a.hd + b.hd;
        expect(overlap).toBe(false);
      }
    }
  });

  it('places the trucks on the yard slab at the rotated local position for each rotation, inside the turned lot', () => {
    for (const rotation of [0, 1, 2, 3] as const) {
      const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [entry]);
      renderer.apply(
        deltaAdd(makeInstance(1, 'materials-recovery-facility', { x: 0, z: 0, rotation })),
      );
      const lot = footprintForRotation(entry, rotation);
      const centerX = (lot.w / 2) * TILE_METERS;
      const centerZ = (lot.d / 2) * TILE_METERS;
      const slots = renderer.partSlotsFor(1, 'mrfTruck');
      const m = new THREE.Matrix4();
      computeMrfLayout(entry.footprint).trucks.forEach((local, i) => {
        renderer.getPartMatrix('materials-recovery-facility', 'mrfTruck', slots[i]!, m);
        const pos = decomposePosition(m);
        const rotated = rotateLocalXZ(local.x, local.z, rotation);
        expect(pos.x).toBeCloseTo(centerX + rotated.x, 5);
        expect(pos.z).toBeCloseTo(centerZ + rotated.z, 5);
        expect(pos.y).toBeCloseTo(RECYCLING_YARD_HEIGHT, 5);
        expect(pos.x).toBeGreaterThan(0);
        expect(pos.x).toBeLessThan(lot.w * TILE_METERS);
        expect(pos.z).toBeGreaterThan(0);
        expect(pos.z).toBeLessThan(lot.d * TILE_METERS);
      });
    }
  });
});

// ---------------------------------------------------------------------------
// A kit that paves its lot, on a slope, over the instancer's plinth
// ---------------------------------------------------------------------------

describe('a paved kit on sloped ground', () => {
  /** A 4% grade across X and 2% across Z, left unlevelled under the whole lot. */
  const slope = (x: number, z: number): number => 0.04 * x + 0.02 * z;

  for (const entry of [makeRecyclingDepotEntry(), makeMrfEntry()]) {
    it(`keeps the plinth under the ${entry.id} yard, and the ground under its footing`, () => {
      for (const rotation of [0, 1] as const) {
        const scene = new THREE.Scene();
        const kits = new UtilityKitRenderer(scene, slope, [entry]);
        const instancer = new BuildingInstancer(scene, [entry], slope, kits.kitIds());
        const building = makeInstance(1, entry.id, { x: 3, z: 4, rotation });
        const delta = deltaAdd(building);
        kits.apply(delta);
        instancer.apply(delta);

        const yardKind = entry.id === 'recycling-depot' ? 'recyclingYard' : 'mrfYard';
        const m = new THREE.Matrix4();
        kits.getPartMatrix(entry.id, yardKind, kits.partSlotsFor(1, yardKind)[0]!, m);
        const yardTop = decomposePosition(m).y + RECYCLING_YARD_HEIGHT;
        const yardBottom = decomposePosition(m).y - YARD_FOOTING_DEPTH;

        const plinth = instancer.getPickables().find((p) => p.catalogId === entry.id)!.mesh;
        const pm = new THREE.Matrix4();
        plinth.getMatrixAt(0, pm);
        const pos = new THREE.Vector3();
        const scl = new THREE.Vector3();
        pm.decompose(pos, new THREE.Quaternion(), scl);
        expect(pos.y + scl.y / 2).toBeLessThan(yardTop);

        // Every corner of the lot: the ground stays under the yard's top and
        // above its footing's bottom, so no slope shows through or under it.
        const lot = footprintForRotation(entry, rotation);
        for (const [cx, cz] of [
          [building.x, building.z],
          [building.x + lot.w, building.z],
          [building.x, building.z + lot.d],
          [building.x + lot.w, building.z + lot.d],
        ] as const) {
          const ground = slope(cx * TILE_METERS, cz * TILE_METERS);
          expect(ground).toBeLessThanOrEqual(yardTop);
          expect(ground).toBeGreaterThan(yardBottom);
        }
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Multiple kits coexisting
// ---------------------------------------------------------------------------

describe('multiple kits coexisting', () => {
  it('builds and applies all 10 kits from one catalog + one delta without cross-talk', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [
      makeTurbineEntry(),
      makeWaterTowerEntry(),
      makePumpEntry(),
      makeDrainEntry(),
      makeWorksEntry(),
      makeCoalPlantEntry(),
      makeIncineratorEntry(),
      makeRecyclingDepotEntry(),
      makeMrfEntry(),
      makeSmallParkEntry(),
    ]);
    renderer.apply(
      deltaAdd(
        makeInstance(9, 'recycling-depot', { x: 40, z: 0 }),
        makeInstance(10, 'materials-recovery-facility', { x: 50, z: 0 }),
        makeInstance(1, 'wind-turbine', { x: 0, z: 0 }),
        makeInstance(2, 'water-tower', { x: 5, z: 0 }),
        makeInstance(3, 'coal-plant', { x: 10, z: 0 }),
        makeInstance(4, 'incinerator', { x: 15, z: 0 }),
        makeInstance(5, 'small-park', { x: 20, z: 0 }),
        makeInstance(6, 'water-pump', { x: 25, z: 0 }),
        makeInstance(7, 'water-drain', { x: 30, z: 0 }),
        makeInstance(8, 'sewage-works', { x: 35, z: 0 }),
      ),
    );

    expect(renderer.kitIds()).toEqual(new Set(UTILITY_KIT_CATALOG_IDS));
    expect(renderer.partSlotsFor(1, 'turbineTower')).toHaveLength(1);
    expect(renderer.partSlotsFor(2, 'waterTank')).toHaveLength(1);
    expect(renderer.partSlotsFor(3, 'coalSmokestack')).toHaveLength(2);
    expect(renderer.partSlotsFor(4, 'incineratorStack')).toHaveLength(1);
    expect(renderer.partSlotsFor(5, 'parkBench')).toHaveLength(2);
    expect(renderer.partSlotsFor(6, 'pumpIntake')).toHaveLength(1);
    expect(renderer.partSlotsFor(7, 'drainOutfall')).toHaveLength(1);
    expect(renderer.partSlotsFor(8, 'worksBody')).toHaveLength(1);
    expect(renderer.partSlotsFor(8, 'worksOutfall')).toHaveLength(1);
    expect(renderer.partSlotsFor(9, 'recyclingTruck')).toHaveLength(4);
    expect(renderer.partSlotsFor(10, 'mrfTruck')).toHaveLength(4);
    expect(renderer.partSlotsFor(9, 'mrfTruck')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// The shore kits: a pumping station and a drain pipe, each facing the water
// ---------------------------------------------------------------------------

describe('a shore building faces the water it touches', () => {
  const pond = (wx: number, wz: number) => (x: number, z: number) => x === wx && z === wz;
  const footprint = { w: 2, d: 2 };

  it('turns its intake toward whichever side the water lies on, south first', () => {
    expect(waterSideOf(10, 10, footprint, pond(10, 12))).toBe(0); // south: +Z
    expect(waterSideOf(10, 10, footprint, pond(12, 11))).toBe(1); // east: +X
    expect(waterSideOf(10, 10, footprint, pond(11, 9))).toBe(2); // north: -Z
    expect(waterSideOf(10, 10, footprint, pond(9, 10))).toBe(3); // west: -X
    expect(waterSideOf(10, 10, footprint, () => false)).toBe(0);
    // A corner touches nothing.
    expect(waterSideOf(10, 10, footprint, pond(12, 12))).toBe(0);
  });

  it('turns the whole kit, never the rotation the player placed it at', () => {
    const scene = new THREE.Scene();
    const waterEast = (x: number, z: number): boolean => x === 12 && z === 10;
    const renderer = new UtilityKitRenderer(scene, flatHeightAt, [makePumpEntry()], waterEast);
    renderer.apply(deltaAdd(makeInstance(1, 'water-pump', { x: 10, z: 10, rotation: 2 })));
    const m = new THREE.Matrix4();
    const slot = renderer.partSlotsFor(1, 'pumpIntake')[0]!;
    renderer.getPartMatrix('water-pump', 'pumpIntake', slot, m);
    const q = new THREE.Quaternion();
    m.decompose(new THREE.Vector3(), q, new THREE.Vector3());
    // The intake is built along local +Z; facing east turns that onto +X.
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    expect(forward.x).toBeCloseTo(1, 6);
    expect(forward.z).toBeCloseTo(0, 6);
  });

  it('runs the intake and the outfall out past the footprint over the water', () => {
    const scene = new THREE.Scene();
    const renderer = new UtilityKitRenderer(scene, flatHeightAt, [
      makePumpEntry(),
      makeDrainEntry(),
      makeWorksEntry(),
    ]);
    renderer.apply(
      deltaAdd(
        makeInstance(1, 'water-pump', { x: 0, z: 0 }),
        makeInstance(2, 'water-drain', { x: 5, z: 0 }),
        makeInstance(3, 'sewage-works', { x: 10, z: 0 }),
      ),
    );
    for (const [id, catalogId, kind, halfD, overhang] of [
      [1, 'water-pump', 'pumpIntake', TILE_METERS, PUMP_INTAKE_OVERHANG],
      [2, 'water-drain', 'drainOutfall', TILE_METERS / 2, DRAIN_OUTFALL_OVERHANG],
      [3, 'sewage-works', 'worksOutfall', TILE_METERS, DRAIN_OUTFALL_OVERHANG],
    ] as const) {
      const pool = renderer.kitIds().has(catalogId);
      expect(pool).toBe(true);
      const slot = renderer.partSlotsFor(id, kind)[0]!;
      const m = new THREE.Matrix4();
      renderer.getPartMatrix(catalogId, kind, slot, m);
      const geometry = renderer.partGeometry(catalogId, kind)!;
      geometry.computeBoundingBox();
      const far = geometry.boundingBox!.max.z;
      expect(far).toBeCloseTo(halfD + overhang, 6);
    }
  });

  it('keeps the works’ clarifiers and house inside its footprint, on the land side of the outfall', () => {
    const scene = new THREE.Scene();
    const renderer = new UtilityKitRenderer(scene, flatHeightAt, [makeWorksEntry()]);
    renderer.apply(deltaAdd(makeInstance(1, 'sewage-works', { x: 0, z: 0 })));
    const body = renderer.partGeometry('sewage-works', 'worksBody')!;
    body.computeBoundingBox();
    const box = body.boundingBox!;
    expect(box.max.x).toBeLessThanOrEqual(TILE_METERS);
    expect(box.min.x).toBeGreaterThanOrEqual(-TILE_METERS);
    expect(box.max.z).toBeLessThanOrEqual(TILE_METERS);
    expect(box.min.z).toBeGreaterThanOrEqual(-TILE_METERS);
    // The clarifiers are round tanks wide enough to read as tanks, not drums.
    expect(WORKS_CLARIFIER_RADIUS).toBeGreaterThanOrEqual(5);
    expect(box.min.y).toBeGreaterThanOrEqual(0);
  });
});
