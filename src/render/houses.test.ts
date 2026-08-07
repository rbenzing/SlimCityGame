import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  HouseRoofRenderer,
  NIGHT_ROOF_TINT,
  buildGableRoofGeometry,
  computeRoofRise,
  hasGarage,
  isRoofedEntry,
  nearestRoadFrontage,
  roofColorHex,
  roofRidgeAlongZ,
} from './houses';
import { NIGHT_BODY_TINT } from './buildings';
import { BuildingCatalogEntry, BuildingInstance, BuildingState, ZoneType } from '../shared/types';

const flatHeightAt = (): number => 0;

function entry(over: Partial<BuildingCatalogEntry> = {}): BuildingCatalogEntry {
  return {
    id: 'res-low-1',
    name: 'Small House',
    category: 'res',
    zone: ZoneType.ResLow,
    level: 1,
    footprint: { w: 1, d: 1 },
    height: 5,
    color: 0x4c8b4d,
    powerUse: 0.1,
    waterUse: 0.4,
    cost: 0,
    upkeep: 0,
    unlockMilestone: 0,
    ...over,
  };
}

function instance(over: Partial<BuildingInstance> = {}): BuildingInstance {
  return {
    id: 1,
    catalogId: 'res-low-1',
    x: 0,
    z: 0,
    rotation: 0,
    state: BuildingState.Active,
    ...over,
  } as BuildingInstance;
}

describe('houses — roofed-entry predicate', () => {
  it('caps detached (ResLow) and attached-row (ResMediumRow) homes, never apartments/towers/mixed/commercial/industrial', () => {
    expect(isRoofedEntry(entry({ zone: ZoneType.ResLow }))).toBe(true);
    expect(isRoofedEntry(entry({ zone: ZoneType.ResMediumRow }))).toBe(true);
    for (const zone of [
      ZoneType.ResMedium,
      ZoneType.ResHigh,
      ZoneType.Mixed,
      ZoneType.ComLow,
      ZoneType.Industrial,
    ]) {
      expect(isRoofedEntry(entry({ zone }))).toBe(false);
    }
    expect(isRoofedEntry(entry({ zone: undefined, category: 'service' }))).toBe(false);
  });
});

describe('houses — gable geometry', () => {
  it('is a base-anchored unit prism: eaves at y=0, ridge apex at y=1, spanning the unit footprint', () => {
    const geo = buildGableRoofGeometry();
    const pos = geo.getAttribute('position');
    let minY = Infinity;
    let maxY = -Infinity;
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      minY = Math.min(minY, pos.getY(i));
      maxY = Math.max(maxY, pos.getY(i));
      minX = Math.min(minX, pos.getX(i));
      maxX = Math.max(maxX, pos.getX(i));
    }
    expect(minY).toBeCloseTo(0, 6);
    expect(maxY).toBeCloseTo(1, 6);
    expect(minX).toBeCloseTo(-0.5, 6);
    expect(maxX).toBeCloseTo(0.5, 6);
    expect(geo.getAttribute('normal')).toBeTruthy(); // computeVertexNormals ran
  });
});

describe('houses — deterministic pure helpers', () => {
  it('roof rise scales with the shorter base span, jitters per id, and is capped', () => {
    const a = computeRoofRise(8, 8, 1);
    const b = computeRoofRise(8, 8, 2);
    expect(a).toBeGreaterThan(0);
    expect(a).not.toBeCloseTo(b, 6); // per-id variety
    // capped regardless of a huge base
    expect(computeRoofRise(100, 100, 3)).toBeLessThanOrEqual(4.5 + 1e-9);
    // shorter span drives it: a narrow row is shallower than a square of the long span
    expect(computeRoofRise(4, 40, 5)).toBeLessThan(computeRoofRise(40, 40, 5));
  });

  it('ridge runs along the longer footprint axis', () => {
    expect(roofRidgeAlongZ(entry({ footprint: { w: 1, d: 6 } }))).toBe(true);
    expect(roofRidgeAlongZ(entry({ footprint: { w: 2, d: 2 } }))).toBe(false);
  });

  it('roof color is a stable palette pick per id', () => {
    expect(roofColorHex(7)).toBe(roofColorHex(7));
    expect(typeof roofColorHex(7)).toBe('number');
  });
});

describe('HouseRoofRenderer', () => {
  const catalog = [
    entry({ id: 'res-low-1', zone: ZoneType.ResLow, footprint: { w: 1, d: 1 }, height: 5 }),
    entry({ id: 'row', zone: ZoneType.ResMediumRow, footprint: { w: 1, d: 4 }, height: 9 }),
    entry({ id: 'apt', zone: ZoneType.ResHigh, footprint: { w: 2, d: 2 }, height: 28 }),
  ];

  it('adds one roof instance per roofed home and none for a flat-roof apartment', () => {
    const scene = new THREE.Scene();
    const r = new HouseRoofRenderer(scene, flatHeightAt, catalog);
    r.apply({
      added: [
        instance({ id: 1, catalogId: 'res-low-1' }),
        instance({ id: 2, catalogId: 'row' }),
        instance({ id: 3, catalogId: 'apt' }),
      ],
      updated: [],
      removed: [],
    });
    expect(r.roofSlotFor(1)).not.toBeNull();
    expect(r.roofSlotFor(2)).not.toBeNull();
    expect(r.roofSlotFor(3)).toBeNull(); // apartment: flat roof, no kit
    expect(r.instanceCount()).toBe(2);
  });

  it('seats the roof on top of the full body box (eaves at ground + entry.height)', () => {
    const scene = new THREE.Scene();
    const r = new HouseRoofRenderer(scene, flatHeightAt, catalog);
    r.apply({ added: [instance({ id: 1, catalogId: 'res-low-1' })], updated: [], removed: [] });
    const m = new THREE.Matrix4();
    r.getMatrix(r.roofSlotFor(1)!, m);
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    m.decompose(pos, quat, scale);
    expect(pos.y).toBeCloseTo(5, 6); // ground 0 + height 5
    // rise scale (y) is positive and within the cap
    expect(scale.y).toBeGreaterThan(0);
    expect(scale.y).toBeLessThanOrEqual(4.5 + 1e-9);
  });

  it('a removed home frees its roof slot', () => {
    const scene = new THREE.Scene();
    const r = new HouseRoofRenderer(scene, flatHeightAt, catalog);
    r.apply({ added: [instance({ id: 1, catalogId: 'res-low-1' })], updated: [], removed: [] });
    r.apply({ added: [], updated: [], removed: [1] });
    expect(r.roofSlotFor(1)).toBeNull();
  });

  it('night factor clamps to [0,1]', () => {
    const scene = new THREE.Scene();
    const r = new HouseRoofRenderer(scene, flatHeightAt, catalog);
    r.setNightFactor(2);
    expect(r.nightFactor()).toBe(1);
    r.setNightFactor(-1);
    expect(r.nightFactor()).toBe(0);
  });

  it('roof night tint stays recognizable (matches the body, not the hidden massing tiers) so a house never reads as a flat box at night', () => {
    // Must track the exposed BODY tint, never the near-black hidden-tier value.
    expect(NIGHT_ROOF_TINT).toEqual(NIGHT_BODY_TINT);
    const [r, g, b] = NIGHT_ROOF_TINT;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    expect(luminance).toBeGreaterThan(0.3); // the "still recognizable at night" floor
  });
});

describe('houses — garage + driveway', () => {
  it('a garage is only for a 2x3+ detached (ResLow) lot; 2x2 homes, rows, and apartments get none', () => {
    expect(hasGarage(entry({ zone: ZoneType.ResLow, footprint: { w: 2, d: 3 } }))).toBe(true);
    expect(hasGarage(entry({ zone: ZoneType.ResLow, footprint: { w: 3, d: 3 } }))).toBe(true);
    expect(hasGarage(entry({ zone: ZoneType.ResLow, footprint: { w: 2, d: 2 } }))).toBe(false);
    expect(hasGarage(entry({ zone: ZoneType.ResMediumRow, footprint: { w: 1, d: 4 } }))).toBe(
      false,
    );
    expect(hasGarage(entry({ zone: ZoneType.ResHigh, footprint: { w: 3, d: 3 } }))).toBe(false);
  });

  it('nearestRoadFrontage points toward the nearest road, or null when none is in range', () => {
    const b = instance({ id: 1, x: 10, z: 10 });
    const e = entry({ footprint: { w: 2, d: 3 } });
    // footprint center is (10+1, 10+1) = (11, 11); road two tiles south of it
    const cx = 10 + Math.floor(2 / 2);
    const cz = 10 + Math.floor(3 / 2);
    const south = nearestRoadFrontage(b, e, (x, z) => x === cx && z === cz + 2);
    expect(south).not.toBeNull();
    expect(south!.fdz).toBe(1);
    expect(south!.fdx).toBe(0);
    expect(nearestRoadFrontage(b, e, () => false)).toBeNull();
  });

  const garageCatalog = [
    entry({ id: 'big', zone: ZoneType.ResLow, footprint: { w: 2, d: 3 }, height: 5 }),
    entry({ id: 'small', zone: ZoneType.ResLow, footprint: { w: 2, d: 2 }, height: 4 }),
  ];

  it('a 2x3 home beside a road gets both a garage and a driveway; a 2x2 gets neither', () => {
    const scene = new THREE.Scene();
    // Road just south of each footprint (center z is 1; footprints end at z=2,
    // so z>=3 is the first road tile outside the lot).
    const roadAt = (_x: number, z: number): boolean => z >= 3;
    const r = new HouseRoofRenderer(scene, flatHeightAt, garageCatalog, roadAt);
    r.apply({
      added: [
        instance({ id: 1, catalogId: 'big', x: 0, z: 0 }),
        instance({ id: 2, catalogId: 'small', x: 10, z: 0 }),
      ],
      updated: [],
      removed: [],
    });
    expect(r.garageSlotFor(1)).not.toBeNull();
    expect(r.hasDriveway(1)).toBe(true);
    // Conforming slab: subdivided triangle soup, not a single flat quad.
    expect(r.drivewayVertexCountFor(1)).toBeGreaterThan(6);
    expect(r.drivewayVertexCountFor(1) % 3).toBe(0);
    expect(r.garageSlotFor(2)).toBeNull(); // 2x2: no garage
    expect(r.garageCount()).toBe(1);
    expect(r.drivewayCount()).toBe(1);
    // Resident's car parked on that driveway (homes never street-park).
    expect(r.carSlotFor(1)).not.toBeNull();
    expect(r.carSlotFor(2)).toBeNull();
    expect(r.carCount()).toBe(1);
  });

  it('without a roadAt wiring, even a 2x3 home skips the garage/driveway (nothing to face)', () => {
    const scene = new THREE.Scene();
    const r = new HouseRoofRenderer(scene, flatHeightAt, garageCatalog); // roadAt defaults to none
    r.apply({
      added: [instance({ id: 1, catalogId: 'big', x: 0, z: 0 })],
      updated: [],
      removed: [],
    });
    expect(r.roofSlotFor(1)).not.toBeNull(); // roof still there
    expect(r.garageSlotFor(1)).toBeNull();
    expect(r.hasDriveway(1)).toBe(false);
  });

  it('removing a home frees its garage + driveway slots too', () => {
    const scene = new THREE.Scene();
    const r = new HouseRoofRenderer(scene, flatHeightAt, garageCatalog, () => true);
    r.apply({
      added: [instance({ id: 1, catalogId: 'big', x: 0, z: 0 })],
      updated: [],
      removed: [],
    });
    expect(r.garageSlotFor(1)).not.toBeNull();
    r.apply({ added: [], updated: [], removed: [1] });
    expect(r.garageSlotFor(1)).toBeNull();
    expect(r.hasDriveway(1)).toBe(false);
    expect(r.drivewayVertexCountFor(1)).toBe(0);
    expect(r.roofSlotFor(1)).toBeNull();
  });
});
