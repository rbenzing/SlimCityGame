import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  BEACON_MAX_INTENSITY,
  BEACON_MIN_INTENSITY,
  BEACON_PULSE_PERIOD_MS,
  LANDMARK_CATALOG_IDS,
  LandmarkPartKind,
  LandmarkRenderer,
  MAX_PLANES,
  MIN_PLANES,
  beaconPulseIntensity,
  computeApronLightPlacementsLocal,
  computeApronNoseZ,
  computeApronRectLocal,
  computeControlTowerLocal,
  computePlaneCount,
  computePlaneLocalPlacements,
  computeRoofMonitorLayout,
  computeWindowBandVertical,
  footprintHalfExtents,
  rotateLocalXZ,
} from './landmarks';
import {
  BuildingCatalogEntry,
  BuildingDelta,
  BuildingInstance,
  BuildingState,
  ZoneType,
} from '../shared/types';
import { TILE_METERS } from '../shared/constants';

const flatHeightAt = (): number => 0;

const ALL_KINDS: readonly LandmarkPartKind[] = [
  'roofMonitor',
  'tower',
  'beacon',
  'windowBand',
  'apronLight',
  'plane',
  'jetBridge',
];

function makeAirportEntry(overrides: Partial<BuildingCatalogEntry> = {}): BuildingCatalogEntry {
  return {
    id: 'airport',
    name: 'International Airport',
    category: 'park',
    footprint: { w: 8, d: 6 },
    height: 14,
    color: 0xe3dac9,
    powerUse: 8,
    waterUse: 6,
    pollution: 30,
    noise: 160,
    landValueBonus: 120,
    service: { kind: 'park', strength: 200, range: 80 },
    cost: 60_000,
    upkeep: 2_500,
    unlockMilestone: 5,
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

function makeInstance(id: number, overrides: Partial<BuildingInstance> = {}): BuildingInstance {
  return {
    id,
    catalogId: 'airport',
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

// ---------------------------------------------------------------------------
// Pure layout functions
// ---------------------------------------------------------------------------

describe('LANDMARK_CATALOG_IDS', () => {
  it('is exactly the airport, today (UI-SPEC §6.10: "initially [\'airport\']")', () => {
    expect(LANDMARK_CATALOG_IDS).toEqual(['airport']);
  });
});

describe('footprintHalfExtents', () => {
  it('is half the footprint in world meters', () => {
    expect(footprintHalfExtents({ w: 8, d: 6 })).toEqual({ halfW: 64, halfD: 48 });
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
      [0, 0],
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

describe('computeRoofMonitorLayout (pure)', () => {
  it('places 2 pods symmetric about local X=0, both in the terminal (negative-Z) half', () => {
    const layout = computeRoofMonitorLayout({ w: 8, d: 6 });
    expect(layout.pods[0].x).toBeCloseTo(-layout.pods[1].x, 9);
    expect(layout.pods[0].z).toBeCloseTo(layout.pods[1].z, 9);
    expect(layout.pods[0].z).toBeLessThan(0);
    expect(layout.pods[1].x).not.toBe(0);
  });

  it('centers the dome on local X=0 at the same Z as the pods', () => {
    const layout = computeRoofMonitorLayout({ w: 8, d: 6 });
    expect(layout.dome.x).toBe(0);
    expect(layout.dome.z).toBeCloseTo(layout.pods[0].z, 9);
  });

  it('scales with footprint size (deterministic per footprint)', () => {
    const small = computeRoofMonitorLayout({ w: 4, d: 3 });
    const big = computeRoofMonitorLayout({ w: 8, d: 6 });
    expect(Math.abs(big.pods[1].x)).toBeCloseTo(Math.abs(small.pods[1].x) * 2, 6);
    expect(Math.abs(big.dome.z)).toBeCloseTo(Math.abs(small.dome.z) * 2, 6);
  });

  it('is deterministic and pure', () => {
    expect(computeRoofMonitorLayout({ w: 8, d: 6 })).toEqual(
      computeRoofMonitorLayout({ w: 8, d: 6 }),
    );
  });
});

describe('computeControlTowerLocal (pure)', () => {
  it('sits at the terminal-side corner (negative x, negative z)', () => {
    const local = computeControlTowerLocal({ w: 8, d: 6 });
    expect(local.x).toBeLessThan(0);
    expect(local.z).toBeLessThan(0);
  });

  it('stays inset within the footprint half-extents', () => {
    const { halfW, halfD } = footprintHalfExtents({ w: 8, d: 6 });
    const local = computeControlTowerLocal({ w: 8, d: 6 });
    expect(Math.abs(local.x)).toBeLessThan(halfW);
    expect(Math.abs(local.z)).toBeLessThan(halfD);
  });

  it('scales with footprint size (deterministic per footprint)', () => {
    const small = computeControlTowerLocal({ w: 4, d: 3 });
    const big = computeControlTowerLocal({ w: 8, d: 6 });
    expect(big.x).toBeCloseTo(small.x * 2, 6);
    expect(big.z).toBeCloseTo(small.z * 2, 6);
  });
});

describe('computeApronRectLocal (pure)', () => {
  it('covers the non-terminal (non-negative Z) half of the footprint', () => {
    const rect = computeApronRectLocal({ w: 8, d: 6 });
    const { halfW, halfD } = footprintHalfExtents({ w: 8, d: 6 });
    expect(rect).toEqual({ minX: -halfW, maxX: halfW, minZ: 0, maxZ: halfD });
  });
});

describe('computeWindowBandVertical (pure)', () => {
  it('sits fully within the building height', () => {
    const v = computeWindowBandVertical(14);
    expect(v.yCenter - v.height / 2).toBeGreaterThan(0);
    expect(v.yCenter + v.height / 2).toBeLessThan(14);
  });

  it('scales with entryHeight (deterministic)', () => {
    const a = computeWindowBandVertical(10);
    const b = computeWindowBandVertical(20);
    expect(b.height).toBeCloseTo(a.height * 2, 6);
    expect(b.yCenter).toBeCloseTo(a.yCenter * 2, 6);
  });
});

describe('computePlaneCount (pure)', () => {
  it('stays within [0, MAX_PLANES] and is deterministic', () => {
    for (let id = 0; id < 200; id++) {
      const count = computePlaneCount(id, { w: 8, d: 6 });
      expect(count).toBeGreaterThanOrEqual(0);
      expect(count).toBeLessThanOrEqual(MAX_PLANES);
      expect(computePlaneCount(id, { w: 8, d: 6 })).toBe(count);
    }
  });

  it('produces both MIN_PLANES and MAX_PLANES across many ids for the real airport footprint (not a constant)', () => {
    const counts = new Set<number>();
    for (let id = 0; id < 300; id++) counts.add(computePlaneCount(id, { w: 8, d: 6 }));
    expect(counts.has(MIN_PLANES)).toBe(true);
    expect(counts.has(MAX_PLANES)).toBe(true);
  });

  it('clamps down for a narrow footprint that cannot fit MIN_PLANES lanes', () => {
    expect(computePlaneCount(1, { w: 2, d: 6 })).toBeLessThanOrEqual(1);
    expect(computePlaneCount(1, { w: 1, d: 6 })).toBe(0);
  });
});

describe('computePlaneLocalPlacements (pure)', () => {
  it('returns computePlaneCount(...) placements, all sharing the same small positive noseZ', () => {
    const footprint = { w: 8, d: 6 };
    const count = computePlaneCount(5, footprint);
    const placements = computePlaneLocalPlacements(5, footprint);
    expect(placements).toHaveLength(count);

    const { halfD } = footprintHalfExtents(footprint);
    const expectedNoseZ = computeApronNoseZ(footprint);
    for (const p of placements) {
      expect(p.noseZ).toBeCloseTo(expectedNoseZ, 9);
      expect(p.noseZ).toBeGreaterThan(0);
      expect(p.noseZ).toBeLessThan(halfD * 0.5); // "along the terminal edge", not deep into the apron
    }
  });

  it('spreads 3 planes symmetrically within the footprint width', () => {
    const footprint = { w: 8, d: 6 };
    let id = 0;
    while (computePlaneCount(id, footprint) !== MAX_PLANES && id < 10_000) id++;
    expect(computePlaneCount(id, footprint)).toBe(MAX_PLANES);

    const placements = computePlaneLocalPlacements(id, footprint);
    expect(placements).toHaveLength(3);
    expect(placements[0]!.x).toBeCloseTo(-placements[2]!.x, 9);
    expect(placements[1]!.x).toBeCloseTo(0, 9);

    const { halfW } = footprintHalfExtents(footprint);
    for (const p of placements) expect(Math.abs(p.x)).toBeLessThan(halfW);
  });

  it('is deterministic', () => {
    expect(computePlaneLocalPlacements(9, { w: 8, d: 6 })).toEqual(
      computePlaneLocalPlacements(9, { w: 8, d: 6 }),
    );
  });

  it('returns an empty array when the footprint cannot fit any planes', () => {
    expect(computePlaneLocalPlacements(1, { w: 1, d: 1 })).toEqual([]);
  });
});

describe('computeApronLightPlacementsLocal (pure)', () => {
  it('places every point exactly on the apron rect boundary', () => {
    const footprint = { w: 8, d: 6 };
    const rect = computeApronRectLocal(footprint);
    const placements = computeApronLightPlacementsLocal(footprint);
    expect(placements.length).toBeGreaterThan(0);

    for (const p of placements) {
      const onVerticalEdge = Math.abs(p.x - rect.minX) < 1e-9 || Math.abs(p.x - rect.maxX) < 1e-9;
      const onHorizontalEdge = Math.abs(p.z - rect.minZ) < 1e-9 || Math.abs(p.z - rect.maxZ) < 1e-9;
      expect(onVerticalEdge || onHorizontalEdge).toBe(true);
      expect(p.x).toBeGreaterThanOrEqual(rect.minX - 1e-9);
      expect(p.x).toBeLessThanOrEqual(rect.maxX + 1e-9);
      expect(p.z).toBeGreaterThanOrEqual(rect.minZ - 1e-9);
      expect(p.z).toBeLessThanOrEqual(rect.maxZ + 1e-9);
    }
  });

  it('scales the count with footprint (perimeter) size', () => {
    const small = computeApronLightPlacementsLocal({ w: 4, d: 3 });
    const big = computeApronLightPlacementsLocal({ w: 16, d: 12 });
    expect(big.length).toBeGreaterThan(small.length);
  });

  it('is deterministic', () => {
    expect(computeApronLightPlacementsLocal({ w: 8, d: 6 })).toEqual(
      computeApronLightPlacementsLocal({ w: 8, d: 6 }),
    );
  });
});

describe('beaconPulseIntensity (pure)', () => {
  it('stays within [BEACON_MIN_INTENSITY, BEACON_MAX_INTENSITY]', () => {
    for (let t = 0; t < 5000; t += 37) {
      const v = beaconPulseIntensity(t);
      expect(v).toBeGreaterThanOrEqual(BEACON_MIN_INTENSITY);
      expect(v).toBeLessThanOrEqual(BEACON_MAX_INTENSITY);
    }
  });

  it('is exactly periodic with BEACON_PULSE_PERIOD_MS', () => {
    for (let t = 0; t < 1000; t += 53) {
      expect(beaconPulseIntensity(t)).toBeCloseTo(
        beaconPulseIntensity(t + BEACON_PULSE_PERIOD_MS),
        9,
      );
    }
  });

  it('is deterministic', () => {
    expect(beaconPulseIntensity(321)).toBe(beaconPulseIntensity(321));
  });

  it('varies over time (an actual pulse, not a constant)', () => {
    const values = new Set<number>();
    for (let t = 0; t < BEACON_PULSE_PERIOD_MS; t += 20)
      values.add(Math.round(beaconPulseIntensity(t) * 1000));
    expect(values.size).toBeGreaterThan(5);
  });
});

// ---------------------------------------------------------------------------
// LandmarkRenderer: registry filtering
// ---------------------------------------------------------------------------

describe('registry filtering (UI-SPEC §6.10)', () => {
  it('isLandmarkCatalogId is true only for registered ids', () => {
    const renderer = new LandmarkRenderer(new THREE.Scene(), flatHeightAt, [makeAirportEntry()]);
    expect(renderer.isLandmarkCatalogId('airport')).toBe(true);
    expect(renderer.isLandmarkCatalogId('house')).toBe(false);
  });

  it('ignores added deltas for non-landmark catalog ids entirely (BuildingInstancer still draws their slab)', () => {
    const renderer = new LandmarkRenderer(new THREE.Scene(), flatHeightAt, [
      makeAirportEntry(),
      makeHouseEntry(),
    ]);
    renderer.apply(deltaAdd(makeInstance(1, { catalogId: 'house', x: 0, z: 0 })));

    expect(renderer.hasInstance(1)).toBe(false);
    for (const kind of ALL_KINDS) expect(renderer.instanceCount('airport', kind)).toBe(0);
  });

  it('ignores updated deltas for non-landmark catalog ids too', () => {
    const renderer = new LandmarkRenderer(new THREE.Scene(), flatHeightAt, [
      makeAirportEntry(),
      makeHouseEntry(),
    ]);
    expect(() =>
      renderer.apply(deltaUpdate(makeInstance(1, { catalogId: 'house', x: 0, z: 0 }))),
    ).not.toThrow();
    expect(renderer.hasInstance(1)).toBe(false);
  });

  it('does not throw and builds nothing when a registered id has no matching catalog entry provided', () => {
    const renderer = new LandmarkRenderer(new THREE.Scene(), flatHeightAt, []);
    expect(() => renderer.apply(deltaAdd(makeInstance(1)))).not.toThrow();
    expect(renderer.hasInstance(1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// LandmarkRenderer: kit part counts/positions deterministic per footprint
// ---------------------------------------------------------------------------

describe('kit part counts/positions (deterministic per footprint)', () => {
  it('places exactly 1 roofMonitor, 1 tower, 1 windowBand, 1 beacon slot per landmark instance', () => {
    const renderer = new LandmarkRenderer(new THREE.Scene(), flatHeightAt, [makeAirportEntry()]);
    renderer.apply(deltaAdd(makeInstance(1)));

    expect(renderer.partSlotsFor(1, 'roofMonitor')).toHaveLength(1);
    expect(renderer.partSlotsFor(1, 'tower')).toHaveLength(1);
    expect(renderer.partSlotsFor(1, 'windowBand')).toHaveLength(1);
    expect(renderer.partSlotsFor(1, 'beacon')).toHaveLength(1);
  });

  it('places apronLight count matching computeApronLightPlacementsLocal for the footprint', () => {
    const entry = makeAirportEntry();
    const renderer = new LandmarkRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    renderer.apply(deltaAdd(makeInstance(1)));

    expect(renderer.partSlotsFor(1, 'apronLight')).toHaveLength(
      computeApronLightPlacementsLocal(entry.footprint).length,
    );
  });

  it('places plane/jetBridge slot counts matching computePlaneCount(id, footprint), 1:1 paired', () => {
    const entry = makeAirportEntry();
    const renderer = new LandmarkRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    renderer.apply(deltaAdd(makeInstance(7)));

    const expectedCount = computePlaneCount(7, entry.footprint);
    expect(renderer.partSlotsFor(7, 'plane')).toHaveLength(expectedCount);
    expect(renderer.partSlotsFor(7, 'jetBridge')).toHaveLength(expectedCount);
  });

  it("places the tower instance at the footprint center (world), matching BuildingInstancer's own centerX/centerZ convention", () => {
    const entry = makeAirportEntry();
    const renderer = new LandmarkRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    renderer.apply(deltaAdd(makeInstance(1, { x: 10, z: 10, rotation: 0 })));

    const centerX = (10 + entry.footprint.w / 2) * TILE_METERS;
    const centerZ = (10 + entry.footprint.d / 2) * TILE_METERS;

    const slot = renderer.partSlotsFor(1, 'tower')[0]!;
    const m = new THREE.Matrix4();
    renderer.getPartMatrix('airport', 'tower', slot, m);
    const pos = decomposePosition(m);
    expect(pos.x).toBeCloseTo(centerX, 5);
    expect(pos.z).toBeCloseTo(centerZ, 5);
  });

  it('offsets the roofMonitor cluster by the terminal height (groundY + entry.height)', () => {
    const entry = makeAirportEntry();
    const heightAt = (): number => 3; // non-flat ground, to prove groundY is actually sampled
    const renderer = new LandmarkRenderer(new THREE.Scene(), heightAt, [entry]);
    renderer.apply(deltaAdd(makeInstance(1, { x: 0, z: 0 })));

    const slot = renderer.partSlotsFor(1, 'roofMonitor')[0]!;
    const m = new THREE.Matrix4();
    renderer.getPartMatrix('airport', 'roofMonitor', slot, m);
    const pos = decomposePosition(m);
    expect(pos.y).toBeCloseTo(3 + entry.height, 5);
  });

  it('rotates the beacon offset by the instance rotation, matching rotateLocalXZ exactly', () => {
    const entry = makeAirportEntry();
    const renderer = new LandmarkRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    renderer.apply(deltaAdd(makeInstance(2, { x: 0, z: 0, rotation: 1 })));

    const centerX = (0 + entry.footprint.w / 2) * TILE_METERS;
    const centerZ = (0 + entry.footprint.d / 2) * TILE_METERS;
    const towerLocal = computeControlTowerLocal(entry.footprint);
    const rotated = rotateLocalXZ(towerLocal.x, towerLocal.z, 1);

    const slot = renderer.partSlotsFor(2, 'beacon')[0]!;
    const m = new THREE.Matrix4();
    renderer.getPartMatrix('airport', 'beacon', slot, m);
    const pos = decomposePosition(m);
    expect(pos.x).toBeCloseTo(centerX + rotated.x, 5);
    expect(pos.z).toBeCloseTo(centerZ + rotated.z, 5);
  });

  it('apron light / plane capacity scales when the airport catalog footprint itself is bigger', () => {
    const small = makeAirportEntry({ footprint: { w: 4, d: 3 } });
    const big = makeAirportEntry({ footprint: { w: 16, d: 12 } });

    const rSmall = new LandmarkRenderer(new THREE.Scene(), flatHeightAt, [small]);
    rSmall.apply(deltaAdd(makeInstance(1, { x: 0, z: 0 })));

    const rBig = new LandmarkRenderer(new THREE.Scene(), flatHeightAt, [big]);
    rBig.apply(deltaAdd(makeInstance(1, { x: 0, z: 0 })));

    expect(rBig.partSlotsFor(1, 'apronLight').length).toBeGreaterThan(
      rSmall.partSlotsFor(1, 'apronLight').length,
    );
  });

  it('is deterministic: two renderers given the same delta produce identical matrices', () => {
    const entry = makeAirportEntry();
    const rendererA = new LandmarkRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    rendererA.apply(deltaAdd(makeInstance(3)));

    const rendererB = new LandmarkRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    rendererB.apply(deltaAdd(makeInstance(3)));

    const mA = new THREE.Matrix4();
    const mB = new THREE.Matrix4();
    for (const kind of ['roofMonitor', 'tower', 'beacon', 'windowBand'] as const) {
      const slotA = rendererA.partSlotsFor(3, kind)[0]!;
      const slotB = rendererB.partSlotsFor(3, kind)[0]!;
      rendererA.getPartMatrix('airport', kind, slotA, mA);
      rendererB.getPartMatrix('airport', kind, slotB, mB);
      expect(mA.elements).toEqual(mB.elements);
    }
  });
});

// ---------------------------------------------------------------------------
// LandmarkRenderer: plane placement along the terminal edge
// ---------------------------------------------------------------------------

describe('plane placement along the terminal edge', () => {
  it('places planes just past the terminal edge (small positive local Z), not scattered across the whole apron', () => {
    const entry = makeAirportEntry();
    const renderer = new LandmarkRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    renderer.apply(deltaAdd(makeInstance(4, { x: 0, z: 0, rotation: 0 })));

    const centerX = (0 + entry.footprint.w / 2) * TILE_METERS;
    const centerZ = (0 + entry.footprint.d / 2) * TILE_METERS;
    const { halfW, halfD } = footprintHalfExtents(entry.footprint);
    const expectedNoseZ = computeApronNoseZ(entry.footprint);

    const slots = renderer.partSlotsFor(4, 'plane');
    expect(slots.length).toBeGreaterThan(0);
    const m = new THREE.Matrix4();
    for (const slot of slots) {
      renderer.getPartMatrix('airport', 'plane', slot, m);
      const pos = decomposePosition(m);
      expect(pos.z - centerZ).toBeCloseTo(expectedNoseZ, 5);
      expect(pos.z - centerZ).toBeGreaterThan(0);
      expect(pos.z - centerZ).toBeLessThan(halfD * 0.5); // along the edge, well short of the apron's far side
      expect(Math.abs(pos.x - centerX)).toBeLessThan(halfW);
    }
  });

  it('pairs each plane with a jetBridge at the same X, anchored at the terminal edge', () => {
    const entry = makeAirportEntry();
    const renderer = new LandmarkRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    renderer.apply(deltaAdd(makeInstance(5, { x: 0, z: 0, rotation: 0 })));

    const centerZ = (0 + entry.footprint.d / 2) * TILE_METERS;
    const planeSlots = renderer.partSlotsFor(5, 'plane');
    const bridgeSlots = renderer.partSlotsFor(5, 'jetBridge');
    expect(bridgeSlots).toHaveLength(planeSlots.length);

    const mPlane = new THREE.Matrix4();
    const mBridge = new THREE.Matrix4();
    for (let i = 0; i < planeSlots.length; i++) {
      renderer.getPartMatrix('airport', 'plane', planeSlots[i]!, mPlane);
      renderer.getPartMatrix('airport', 'jetBridge', bridgeSlots[i]!, mBridge);
      const posPlane = decomposePosition(mPlane);
      const posBridge = decomposePosition(mBridge);
      expect(posBridge.x).toBeCloseTo(posPlane.x, 5);
      expect(posBridge.z).toBeCloseTo(centerZ, 5); // jet-bridge instance origin sits at the terminal edge
    }
  });

  it('rotates plane placements rigidly with the instance rotation', () => {
    const entry = makeAirportEntry();
    const renderer = new LandmarkRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    renderer.apply(deltaAdd(makeInstance(6, { x: 0, z: 0, rotation: 2 })));

    const centerX = (0 + entry.footprint.w / 2) * TILE_METERS;
    const centerZ = (0 + entry.footprint.d / 2) * TILE_METERS;
    const placements = computePlaneLocalPlacements(6, entry.footprint);
    const slots = renderer.partSlotsFor(6, 'plane');
    expect(slots).toHaveLength(placements.length);

    const m = new THREE.Matrix4();
    for (let i = 0; i < slots.length; i++) {
      renderer.getPartMatrix('airport', 'plane', slots[i]!, m);
      const pos = decomposePosition(m);
      const rotated = rotateLocalXZ(placements[i]!.x, placements[i]!.noseZ, 2);
      expect(pos.x).toBeCloseTo(centerX + rotated.x, 5);
      expect(pos.z).toBeCloseTo(centerZ + rotated.z, 5);
    }
  });
});

// ---------------------------------------------------------------------------
// LandmarkRenderer: night toggles
// ---------------------------------------------------------------------------

describe('night cycle (UI-SPEC §6.10)', () => {
  it('defaults to nightFactor 0 and clamps out-of-range values into [0,1]', () => {
    const renderer = new LandmarkRenderer(new THREE.Scene(), flatHeightAt, [makeAirportEntry()]);
    expect(renderer.nightFactor()).toBe(0);
    renderer.setNightFactor(1.7);
    expect(renderer.nightFactor()).toBe(1);
    renderer.setNightFactor(-3);
    expect(renderer.nightFactor()).toBe(0);
    renderer.setNightFactor(0.42);
    expect(renderer.nightFactor()).toBeCloseTo(0.42, 9);
  });

  it('at nightFactor 0, apron lights / window band / beacon are fully off regardless of update(t)', () => {
    const renderer = new LandmarkRenderer(new THREE.Scene(), flatHeightAt, [makeAirportEntry()]);
    renderer.setNightFactor(0);
    renderer.update(0);
    expect(renderer.apronLightIntensity('airport')).toBe(0);
    expect(renderer.windowBandIntensity('airport')).toBe(0);
    expect(renderer.beaconIntensity('airport')).toBe(0);

    renderer.update(BEACON_PULSE_PERIOD_MS / 4);
    expect(renderer.beaconIntensity('airport')).toBe(0);
  });

  it('at nightFactor 1, apron lights + window band glow steadily, independent of t (no pulsing)', () => {
    const renderer = new LandmarkRenderer(new THREE.Scene(), flatHeightAt, [makeAirportEntry()]);
    renderer.setNightFactor(1);
    renderer.update(0);
    expect(renderer.apronLightIntensity('airport')).toBeCloseTo(1, 9);
    expect(renderer.windowBandIntensity('airport')).toBeCloseTo(1, 9);

    renderer.update(BEACON_PULSE_PERIOD_MS / 3);
    expect(renderer.apronLightIntensity('airport')).toBeCloseTo(1, 9);
    expect(renderer.windowBandIntensity('airport')).toBeCloseTo(1, 9);
  });

  it('at nightFactor 1, the beacon pulses over time exactly matching beaconPulseIntensity', () => {
    const renderer = new LandmarkRenderer(new THREE.Scene(), flatHeightAt, [makeAirportEntry()]);
    renderer.setNightFactor(1);

    renderer.update(0);
    expect(renderer.beaconIntensity('airport')).toBeCloseTo(beaconPulseIntensity(0), 9);

    renderer.update(BEACON_PULSE_PERIOD_MS / 4);
    const atQuarter = renderer.beaconIntensity('airport');
    expect(atQuarter).toBeCloseTo(beaconPulseIntensity(BEACON_PULSE_PERIOD_MS / 4), 9);
    expect(atQuarter).toBeCloseTo(BEACON_MAX_INTENSITY, 6); // sin peaks at the quarter period
  });

  it('scales the beacon pulse by nightFactor (half night = half the pulse reading)', () => {
    const renderer = new LandmarkRenderer(new THREE.Scene(), flatHeightAt, [makeAirportEntry()]);
    renderer.setNightFactor(0.5);
    renderer.update(123);
    expect(renderer.beaconIntensity('airport')).toBeCloseTo(0.5 * beaconPulseIntensity(123), 9);
  });

  it('setNightFactor alone (before any update()) still gates the beacon off at nightFactor 0', () => {
    const renderer = new LandmarkRenderer(new THREE.Scene(), flatHeightAt, [makeAirportEntry()]);
    renderer.update(BEACON_PULSE_PERIOD_MS / 4); // some non-zero phase cached first
    renderer.setNightFactor(0);
    expect(renderer.beaconIntensity('airport')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// LandmarkRenderer: removal exactness
// ---------------------------------------------------------------------------

describe('removal exactness', () => {
  it('zero-scales and frees every slot a removed landmark instance owned', () => {
    const entry = makeAirportEntry();
    const renderer = new LandmarkRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    renderer.apply(deltaAdd(makeInstance(1)));

    const capturedSlots = new Map<LandmarkPartKind, readonly number[]>();
    for (const kind of ALL_KINDS) capturedSlots.set(kind, renderer.partSlotsFor(1, kind));
    expect(renderer.hasApronSurface(1)).toBe(true);
    // Sanity: every captured kind actually owned at least one slot before removal.
    for (const kind of ALL_KINDS) expect(capturedSlots.get(kind)!.length).toBeGreaterThan(0);

    renderer.apply(deltaRemove(1));

    expect(renderer.hasInstance(1)).toBe(false);
    expect(renderer.hasApronSurface(1)).toBe(false);
    for (const kind of ALL_KINDS) expect(renderer.partSlotsFor(1, kind)).toHaveLength(0);

    const m = new THREE.Matrix4();
    for (const kind of ALL_KINDS) {
      for (const slot of capturedSlots.get(kind)!) {
        renderer.getPartMatrix('airport', kind, slot, m);
        expect(isZeroScale(m)).toBe(true);
      }
    }
  });

  it('removing one instance leaves another instance fully intact', () => {
    const entry = makeAirportEntry();
    const renderer = new LandmarkRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    renderer.apply(deltaAdd(makeInstance(1, { x: 0, z: 0 }), makeInstance(2, { x: 20, z: 20 })));

    const bTowerSlot = renderer.partSlotsFor(2, 'tower')[0]!;
    const mBefore = new THREE.Matrix4();
    renderer.getPartMatrix('airport', 'tower', bTowerSlot, mBefore);

    renderer.apply(deltaRemove(1));

    expect(renderer.hasInstance(1)).toBe(false);
    expect(renderer.hasInstance(2)).toBe(true);
    expect(renderer.hasApronSurface(2)).toBe(true);

    const mAfter = new THREE.Matrix4();
    renderer.getPartMatrix('airport', 'tower', bTowerSlot, mAfter);
    expect(mAfter.elements).toEqual(mBefore.elements);
    expect(isZeroScale(mAfter)).toBe(false);
  });

  it('recycles freed slots instead of growing pools unboundedly', () => {
    const entry = makeAirportEntry();
    const renderer = new LandmarkRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    renderer.apply(deltaAdd(makeInstance(1, { x: 0, z: 0 })));
    const countAfterFirst = renderer.instanceCount('airport', 'tower');

    renderer.apply(deltaRemove(1));
    renderer.apply(deltaAdd(makeInstance(2, { x: 20, z: 20 })));
    const countAfterSecond = renderer.instanceCount('airport', 'tower');

    expect(countAfterSecond).toBe(countAfterFirst);
  });

  it('removing an id that was never added (or already removed) is a harmless no-op', () => {
    const renderer = new LandmarkRenderer(new THREE.Scene(), flatHeightAt, [makeAirportEntry()]);
    expect(() => renderer.apply(deltaRemove(999))).not.toThrow();

    renderer.apply(deltaAdd(makeInstance(1)));
    renderer.apply(deltaRemove(1));
    expect(() => renderer.apply(deltaRemove(1))).not.toThrow();
    expect(renderer.hasInstance(1)).toBe(false);
  });

  it('an update() rebuild frees the previous slot rather than leaking it (pool count stays flat)', () => {
    const entry = makeAirportEntry();
    const renderer = new LandmarkRenderer(new THREE.Scene(), flatHeightAt, [entry]);
    renderer.apply(deltaAdd(makeInstance(1, { x: 0, z: 0, rotation: 0 })));
    const countAfterAdd = renderer.instanceCount('airport', 'tower');

    renderer.apply(deltaUpdate(makeInstance(1, { x: 0, z: 0, rotation: 2 })));
    const countAfterUpdate = renderer.instanceCount('airport', 'tower');

    expect(countAfterUpdate).toBe(countAfterAdd);
  });
});
