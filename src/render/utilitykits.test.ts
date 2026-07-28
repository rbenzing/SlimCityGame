import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  COAL_SMOKESTACK_COUNT,
  PARK_BENCH_COUNT,
  PARK_TREE_MAX,
  PARK_TREE_MIN,
  TURBINE_BLADE_COUNT,
  TURBINE_MAST_HEIGHT,
  TURBINE_ROTOR_ANGULAR_SPEED,
  UTILITY_KIT_CATALOG_IDS,
  UtilityKitPartKind,
  UtilityKitRenderer,
  WATER_LEG_COUNT,
  computeCoalHallLayout,
  computeCoalHeapLocalPlacement,
  computeCoalSmokestackLocalPlacements,
  computeParkBenchPlacements,
  computeParkTreeCount,
  computeParkTreePlacements,
  computeWaterLegPlacements,
  footprintHalfExtents,
  rotateLocalXZ,
  turbineBeaconLocal,
  turbineHubLocal,
  turbineRotorAngle,
  turbineRotorPhase,
} from './utilitykits';
import {
  BuildingCatalogEntry,
  BuildingDelta,
  BuildingInstance,
  BuildingState,
  ZoneType,
} from '../shared/types';
import { TILE_METERS } from '../shared/constants';

const flatHeightAt = (): number => 0;

const ALL_KINDS: readonly UtilityKitPartKind[] = [
  'turbineTower',
  'turbineRotor',
  'turbineBeacon',
  'waterLegs',
  'waterTank',
  'coalHall',
  'coalSmokestack',
  'coalHeap',
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
    footprint: { w: 2, d: 2 },
    height: 24,
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
  it('is exactly the 4 silhouette-kit ids (UI-SPEC §6.15)', () => {
    expect(UTILITY_KIT_CATALOG_IDS).toEqual([
      'wind-turbine',
      'water-tower',
      'coal-plant',
      'small-park',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Pure layout functions
// ---------------------------------------------------------------------------

describe('footprintHalfExtents (pure)', () => {
  it('is half the footprint in world meters', () => {
    expect(footprintHalfExtents({ w: 4, d: 4 })).toEqual({ halfW: 32, halfD: 32 });
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
  it('places WATER_LEG_COUNT (4) legs, splayed at the base and converging near center at the top', () => {
    const legs = computeWaterLegPlacements();
    expect(legs).toHaveLength(WATER_LEG_COUNT);
    expect(WATER_LEG_COUNT).toBe(4);
    for (const leg of legs) {
      const baseDist = Math.hypot(leg.base.x, leg.base.z);
      const topDist = Math.hypot(leg.top.x, leg.top.z);
      expect(baseDist).toBeGreaterThan(topDist);
      expect(topDist).toBeGreaterThan(0); // still under the tank, not collapsed to a point
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
  it('places exactly 1 waterLegs and 1 waterTank slot per instance', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [
      makeWaterTowerEntry(),
    ]);
    renderer.apply(deltaAdd(makeInstance(1, 'water-tower')));
    expect(renderer.partSlotsFor(1, 'waterLegs')).toHaveLength(1);
    expect(renderer.partSlotsFor(1, 'waterTank')).toHaveLength(1);
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
      makeSmallParkEntry(),
    ]);
    renderer.setNightFactor(1);
    expect(renderer.partEmissiveHex('water-tower', 'waterTank')).toBe(0);
    expect(renderer.partEmissiveHex('coal-plant', 'coalHall')).toBe(0);
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
// Multiple kits coexisting
// ---------------------------------------------------------------------------

describe('multiple kits coexisting', () => {
  it('builds and applies all 4 kits from one catalog + one delta without cross-talk', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flatHeightAt, [
      makeTurbineEntry(),
      makeWaterTowerEntry(),
      makeCoalPlantEntry(),
      makeSmallParkEntry(),
    ]);
    renderer.apply(
      deltaAdd(
        makeInstance(1, 'wind-turbine', { x: 0, z: 0 }),
        makeInstance(2, 'water-tower', { x: 5, z: 0 }),
        makeInstance(3, 'coal-plant', { x: 10, z: 0 }),
        makeInstance(4, 'small-park', { x: 20, z: 0 }),
      ),
    );

    expect(renderer.kitIds()).toEqual(new Set(UTILITY_KIT_CATALOG_IDS));
    expect(renderer.partSlotsFor(1, 'turbineTower')).toHaveLength(1);
    expect(renderer.partSlotsFor(2, 'waterTank')).toHaveLength(1);
    expect(renderer.partSlotsFor(3, 'coalSmokestack')).toHaveLength(2);
    expect(renderer.partSlotsFor(4, 'parkBench')).toHaveLength(2);
  });
});
