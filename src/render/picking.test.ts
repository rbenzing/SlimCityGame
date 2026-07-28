import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { encodeId, decodeId, buildIdColorArray, IdPicker, MAX_ENCODABLE_ID } from './picking';
import { BuildingInstancer } from './buildings';
import { BuildingCatalogEntry, BuildingInstance, BuildingState, ZoneType } from '../shared/types';

const flatHeightAt = (): number => 0;

const HOUSE: BuildingCatalogEntry = {
  id: 'house',
  name: 'House',
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
};

const SHOP: BuildingCatalogEntry = {
  id: 'shop',
  name: 'Shop',
  category: 'com',
  zone: ZoneType.ComLow,
  level: 1,
  footprint: { w: 1, d: 1 },
  height: 6,
  color: 0x334455,
  jobs: 6,
  powerUse: 0.3,
  waterUse: 0.3,
  cost: 200,
  upkeep: 2,
  unlockMilestone: 0,
};

function instanceAt(id: number, x: number, z: number, catalogId = 'house'): BuildingInstance {
  return { id, catalogId, x, z, rotation: 0, level: 1, state: BuildingState.Active, problems: 0 };
}

/** Downward ray positioned above a tile's world center. */
function downwardRayAt(worldX: number, worldZ: number, fromY = 200): THREE.Raycaster {
  const raycaster = new THREE.Raycaster();
  raycaster.set(new THREE.Vector3(worldX, fromY, worldZ), new THREE.Vector3(0, -1, 0));
  return raycaster;
}

describe('encodeId / decodeId', () => {
  it('round-trips explicit boundary and spot-check ids', () => {
    for (const id of [0, 1, 2, 255, 256, 65535, 65536, 16_000_000, MAX_ENCODABLE_ID]) {
      expect(decodeId(encodeId(id))).toBe(id);
    }
  });

  it('round-trips a dense sweep across the whole 1..16M range', () => {
    for (let id = 1; id <= MAX_ENCODABLE_ID; id += 104_729) {
      expect(decodeId(encodeId(id))).toBe(id);
    }
  });

  it('encodes low/mid/high bytes in the documented order', () => {
    expect(encodeId(0x010203)).toEqual([0x03, 0x02, 0x01]);
  });

  it('throws for ids outside the encodable 24-bit range', () => {
    expect(() => encodeId(-1)).toThrow();
    expect(() => encodeId(MAX_ENCODABLE_ID + 1)).toThrow();
    expect(() => encodeId(1.5)).toThrow();
  });

  it('decodeId masks each component to a byte defensively', () => {
    expect(decodeId([0x1ff, 0, 0])).toBe(0xff);
  });
});

describe('buildIdColorArray', () => {
  it('produces one normalized RGB triple per instance, id 0 -> black', () => {
    const ids = [0, 1, 256, 16_777_215];
    const out = buildIdColorArray(ids);
    expect(out.length).toBe(ids.length * 3);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i] as number;
      const [r, g, b] = encodeId(id);
      expect(out[i * 3]).toBeCloseTo(r / 255, 6);
      expect(out[i * 3 + 1]).toBeCloseTo(g / 255, 6);
      expect(out[i * 3 + 2]).toBeCloseTo(b / 255, 6);
    }
  });

  it('returns an empty array for an empty instance list', () => {
    expect(buildIdColorArray([]).length).toBe(0);
  });
});

describe('IdPicker.encodeId / decodeId', () => {
  it('delegate to the standalone pure functions', () => {
    const picker = new IdPicker();
    expect(picker.encodeId(42)).toEqual(encodeId(42));
    expect(picker.decodeId([1, 2, 3])).toEqual(decodeId([1, 2, 3]));
  });
});

describe('IdPicker.pickBuilding', () => {
  it('returns null when the instancer has no buildings at all', () => {
    const instancer = new BuildingInstancer(new THREE.Scene(), [HOUSE], flatHeightAt);
    const picker = new IdPicker();
    expect(picker.pickBuilding(downwardRayAt(0, 0), instancer)).toBeNull();
  });

  it('returns null when the ray does not hit any building', () => {
    const instancer = new BuildingInstancer(new THREE.Scene(), [HOUSE], flatHeightAt);
    instancer.apply({ added: [instanceAt(1, 2, 3)], removed: [], updated: [] });
    const picker = new IdPicker();
    expect(picker.pickBuilding(downwardRayAt(9999, 9999), instancer)).toBeNull();
  });

  it('resolves a hit on a single building to its stable id', () => {
    const instancer = new BuildingInstancer(new THREE.Scene(), [HOUSE], flatHeightAt);
    instancer.apply({ added: [instanceAt(777, 2, 3)], removed: [], updated: [] });
    const picker = new IdPicker();

    const worldX = (2 + 0.5) * 16;
    const worldZ = (3 + 0.5) * 16;
    const result = picker.pickBuilding(downwardRayAt(worldX, worldZ), instancer);
    expect(result).toBe(777);
  });

  it('distinguishes buildings across different catalog buckets', () => {
    const instancer = new BuildingInstancer(new THREE.Scene(), [HOUSE, SHOP], flatHeightAt);
    instancer.apply({
      added: [instanceAt(1, 0, 0, 'house'), instanceAt(2, 10, 10, 'shop')],
      removed: [],
      updated: [],
    });
    const picker = new IdPicker();

    const houseCenter = 0.5 * 16;
    const shopCenter = 10.5 * 16;
    expect(picker.pickBuilding(downwardRayAt(houseCenter, houseCenter), instancer)).toBe(1);
    expect(picker.pickBuilding(downwardRayAt(shopCenter, shopCenter), instancer)).toBe(2);
  });

  it('cross-checks consistently against buildingIdAt for the same hit instance', () => {
    const instancer = new BuildingInstancer(new THREE.Scene(), [HOUSE], flatHeightAt);
    instancer.apply({
      added: [instanceAt(10, 0, 0), instanceAt(11, 1, 0), instanceAt(12, 2, 0)],
      removed: [],
      updated: [],
    });
    const picker = new IdPicker();

    for (const [x, expectedId] of [
      [0, 10],
      [1, 11],
      [2, 12],
    ] as const) {
      const worldX = (x + 0.5) * 16;
      const worldZ = 0.5 * 16;
      const picked = picker.pickBuilding(downwardRayAt(worldX, worldZ), instancer);
      expect(picked).toBe(expectedId);
      expect(picked).toBe(instancer.buildingIdAt({ catalogId: 'house', instanceIndex: x }));
    }
  });
});
