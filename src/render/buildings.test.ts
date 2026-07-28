import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import {
  BuildingInstancer,
  COOL_WINDOW_COLOR,
  isBuildingLitEligible,
  isRowHouseArchetype,
  isWindowCool,
  isWindowLit,
  NIGHT_BODY_TINT,
  WARM_WINDOW_COLOR,
  windowGridSize,
  windowHash,
  windowLitFraction,
} from './buildings';
import { decodeId } from './picking';
import {
  BuildingCatalogEntry,
  BuildingInstance,
  BuildingState,
  Problem,
  ZoneType,
} from '../shared/types';
import { NIGHT_WINDOW_LIT_MAX, NIGHT_WINDOW_LIT_MIN, TILE_METERS } from '../shared/constants';
import catalogData from '../data/catalog.json';

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

const TOWER: BuildingCatalogEntry = {
  id: 'tower',
  name: 'Tower',
  category: 'res',
  zone: ZoneType.ResHigh,
  level: 1,
  footprint: { w: 2, d: 2 },
  height: 30,
  color: 0x223344,
  residents: 40,
  powerUse: 1,
  waterUse: 1,
  cost: 500,
  upkeep: 5,
  unlockMilestone: 0,
};

const CATALOG: BuildingCatalogEntry[] = [HOUSE, TOWER];

function instanceAt(
  id: number,
  x: number,
  z: number,
  overrides: Partial<BuildingInstance> = {},
): BuildingInstance {
  return {
    id,
    catalogId: 'house',
    x,
    z,
    rotation: 0,
    level: 1,
    state: BuildingState.Active,
    problems: 0,
    ...overrides,
  };
}

function decomposeAt(mesh: THREE.InstancedMesh, slot: number) {
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  mesh.getMatrixAt(slot, m);
  m.decompose(pos, quat, scl);
  return { pos, quat, scl };
}

describe('BuildingInstancer', () => {
  it('creates one InstancedMesh per catalog entry, all initially empty', () => {
    const instancer = new BuildingInstancer(new THREE.Scene(), CATALOG, flatHeightAt);
    expect(instancer.instanceCount()).toBe(0);
    const pickables = instancer.getPickables();
    // Buckets with zero active instances are not pickable yet.
    expect(pickables.length).toBe(0);
  });

  it('adds instances and computes matrix from footprint/height/position', () => {
    const instancer = new BuildingInstancer(new THREE.Scene(), CATALOG, flatHeightAt);
    instancer.apply({ added: [instanceAt(1, 2, 3)], removed: [], updated: [] });

    expect(instancer.instanceCount()).toBe(1);
    const mesh = instancer.getPickables().find((p) => p.catalogId === 'house')?.mesh;
    expect(mesh).toBeDefined();

    const { pos, scl } = decomposeAt(mesh as THREE.InstancedMesh, 0);
    expect(pos.x).toBeCloseTo((2 + 0.5) * TILE_METERS, 5);
    expect(pos.z).toBeCloseTo((3 + 0.5) * TILE_METERS, 5);
    expect(pos.y).toBeCloseTo(10 / 2, 5); // groundY(0) + height/2
    expect(scl.x).toBeCloseTo(1 * TILE_METERS * 0.85, 5);
    expect(scl.y).toBeCloseTo(10, 5);
    expect(scl.z).toBeCloseTo(1 * TILE_METERS * 0.85, 5);
  });

  it('offsets by heightAt(x,z) at the footprint center', () => {
    const heightAt = (x: number, z: number): number => x * 0 + z * 0 + 7.5;
    const instancer = new BuildingInstancer(new THREE.Scene(), CATALOG, heightAt);
    instancer.apply({ added: [instanceAt(1, 0, 0)], removed: [], updated: [] });
    const mesh = instancer.getPickables()[0]?.mesh as THREE.InstancedMesh;
    const { pos } = decomposeAt(mesh, 0);
    expect(pos.y).toBeCloseTo(7.5 + 10 / 2, 5);
  });

  it('rotates the instance matrix by rotation * 90 degrees about Y', () => {
    const instancer = new BuildingInstancer(new THREE.Scene(), CATALOG, flatHeightAt);
    instancer.apply({ added: [instanceAt(1, 0, 0, { rotation: 1 })], removed: [], updated: [] });
    const mesh = instancer.getPickables()[0]?.mesh as THREE.InstancedMesh;
    const { quat } = decomposeAt(mesh, 0);
    const expected = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.PI / 2,
    );
    expect(quat.angleTo(expected)).toBeLessThan(1e-6);
  });

  it('scales Constructing buildings to 25% height and tints them grey', () => {
    const instancer = new BuildingInstancer(new THREE.Scene(), CATALOG, flatHeightAt);
    instancer.apply({
      added: [instanceAt(1, 0, 0, { state: BuildingState.Constructing })],
      removed: [],
      updated: [],
    });
    const mesh = instancer.getPickables()[0]?.mesh as THREE.InstancedMesh;
    const { pos, scl } = decomposeAt(mesh, 0);
    expect(scl.y).toBeCloseTo(10 * 0.25, 5);
    expect(pos.y).toBeCloseTo((10 * 0.25) / 2, 5);

    const color = new THREE.Color();
    mesh.getColorAt(0, color);
    expect(color.r).toBeCloseTo(0.55, 5);
    expect(color.g).toBeCloseTo(0.55, 5);
    expect(color.b).toBeCloseTo(0.55, 5);
  });

  it('tints Abandoned buildings dark and leaves Active-with-problems untinted', () => {
    const instancer = new BuildingInstancer(new THREE.Scene(), CATALOG, flatHeightAt);
    instancer.apply({
      added: [
        instanceAt(1, 0, 0, { state: BuildingState.Abandoned }),
        instanceAt(2, 1, 0, {
          state: BuildingState.Active,
          problems: Problem.HighCrime | Problem.NoPower,
        }),
      ],
      removed: [],
      updated: [],
    });
    const mesh = instancer.getPickables()[0]?.mesh as THREE.InstancedMesh;

    const abandonedColor = new THREE.Color();
    mesh.getColorAt(0, abandonedColor);
    expect(abandonedColor.r).toBeCloseTo(0.25, 5);
    expect(abandonedColor.g).toBeCloseTo(0.25, 5);
    expect(abandonedColor.b).toBeCloseTo(0.25, 5);

    const activeColor = new THREE.Color();
    mesh.getColorAt(1, activeColor);
    expect(activeColor.r).toBeCloseTo(1, 5);
    expect(activeColor.g).toBeCloseTo(1, 5);
    expect(activeColor.b).toBeCloseTo(1, 5);
  });

  it('fills the id-color attribute with encodeId(id) and idColorAt decodes it back', () => {
    const instancer = new BuildingInstancer(new THREE.Scene(), CATALOG, flatHeightAt);
    instancer.apply({ added: [instanceAt(12345, 0, 0)], removed: [], updated: [] });
    const rgb = instancer.idColorAt('house', 0);
    expect(rgb).not.toBeNull();
    expect(decodeId(rgb as [number, number, number])).toBe(12345);
  });

  it('keeps slot integrity across swap-with-last removal of a middle instance', () => {
    const instancer = new BuildingInstancer(new THREE.Scene(), CATALOG, flatHeightAt);
    instancer.apply({
      added: [
        instanceAt(1, 0, 0),
        instanceAt(2, 1, 0),
        instanceAt(3, 2, 0),
        instanceAt(4, 3, 0),
        instanceAt(5, 4, 0),
      ],
      removed: [],
      updated: [],
    });
    expect(instancer.instanceCount()).toBe(5);

    instancer.apply({ added: [], removed: [3], updated: [] });
    expect(instancer.instanceCount()).toBe(4);

    const resolved = new Set<number | null>();
    for (let i = 0; i < 4; i++) {
      resolved.add(instancer.buildingIdAt({ catalogId: 'house', instanceIndex: i }));
    }
    expect(resolved).toEqual(new Set([1, 2, 4, 5]));
    // Slot 4 is beyond the shrunk count and must no longer resolve.
    expect(instancer.buildingIdAt({ catalogId: 'house', instanceIndex: 4 })).toBeNull();
  });

  it('removing the last slot needs no swap and still keeps remaining ids resolvable', () => {
    const instancer = new BuildingInstancer(new THREE.Scene(), CATALOG, flatHeightAt);
    instancer.apply({
      added: [instanceAt(1, 0, 0), instanceAt(2, 1, 0), instanceAt(3, 2, 0)],
      removed: [],
      updated: [],
    });
    instancer.apply({ added: [], removed: [3], updated: [] });
    expect(instancer.instanceCount()).toBe(2);
    expect(instancer.buildingIdAt({ catalogId: 'house', instanceIndex: 0 })).toBe(1);
    expect(instancer.buildingIdAt({ catalogId: 'house', instanceIndex: 1 })).toBe(2);
  });

  it('removing an id that was never added (or already removed) is a harmless no-op', () => {
    const instancer = new BuildingInstancer(new THREE.Scene(), CATALOG, flatHeightAt);
    instancer.apply({ added: [instanceAt(1, 0, 0)], removed: [], updated: [] });
    expect(() => instancer.apply({ added: [], removed: [999], updated: [] })).not.toThrow();
    expect(instancer.instanceCount()).toBe(1);
    instancer.apply({ added: [], removed: [1], updated: [] });
    expect(() => instancer.apply({ added: [], removed: [1], updated: [] })).not.toThrow();
    expect(instancer.instanceCount()).toBe(0);
  });

  it('grows capacity by doubling (start 64) and preserves every existing matrix', () => {
    const instancer = new BuildingInstancer(new THREE.Scene(), CATALOG, flatHeightAt);
    const total = 65; // one more than the initial capacity of 64
    const added: BuildingInstance[] = [];
    for (let i = 0; i < total; i++) added.push(instanceAt(i + 1, i, 0));
    instancer.apply({ added, removed: [], updated: [] });

    expect(instancer.instanceCount()).toBe(total);
    const mesh = instancer.getPickables().find((p) => p.catalogId === 'house')?.mesh;
    expect(mesh).toBeDefined();
    expect((mesh as THREE.InstancedMesh).count).toBe(total);

    for (let i = 0; i < total; i++) {
      const { pos, scl } = decomposeAt(mesh as THREE.InstancedMesh, i);
      expect(pos.x).toBeCloseTo((i + 0.5) * TILE_METERS, 5);
      expect(pos.z).toBeCloseTo(0.5 * TILE_METERS, 5);
      expect(pos.y).toBeCloseTo(5, 5);
      expect(scl.x).toBeCloseTo(TILE_METERS * 0.85, 5);
      expect(scl.y).toBeCloseTo(10, 5);
      // Every id must still resolve correctly post-grow.
      expect(instancer.buildingIdAt({ catalogId: 'house', instanceIndex: i })).toBe(i + 1);
    }
  });

  it('migrates an id to a different bucket when an update changes its catalogId', () => {
    const instancer = new BuildingInstancer(new THREE.Scene(), CATALOG, flatHeightAt);
    instancer.apply({ added: [instanceAt(1, 0, 0)], removed: [], updated: [] });
    expect(instancer.buildingIdAt({ catalogId: 'house', instanceIndex: 0 })).toBe(1);

    instancer.apply({
      added: [],
      removed: [],
      updated: [{ ...instanceAt(1, 0, 0), catalogId: 'tower' }],
    });

    expect(instancer.instanceCount()).toBe(1);
    expect(instancer.buildingIdAt({ catalogId: 'house', instanceIndex: 0 })).toBeNull();
    expect(instancer.buildingIdAt({ catalogId: 'tower', instanceIndex: 0 })).toBe(1);
  });

  it('sums instance counts across multiple catalog buckets', () => {
    const instancer = new BuildingInstancer(new THREE.Scene(), CATALOG, flatHeightAt);
    instancer.apply({
      added: [
        instanceAt(1, 0, 0),
        instanceAt(2, 1, 0),
        { ...instanceAt(3, 5, 5), catalogId: 'tower' },
      ],
      removed: [],
      updated: [],
    });
    expect(instancer.instanceCount()).toBe(3);
  });

  it('throws when applying an added instance for an unknown catalogId', () => {
    const instancer = new BuildingInstancer(new THREE.Scene(), CATALOG, flatHeightAt);
    expect(() =>
      instancer.apply({
        added: [{ ...instanceAt(1, 0, 0), catalogId: 'does-not-exist' }],
        removed: [],
        updated: [],
      }),
    ).toThrow();
  });
});

describe('night cycle (UI-SPEC §6.5)', () => {
  describe('windowGridSize (pure)', () => {
    it('derives a small grid for a small, short building, clamped to sane minimums', () => {
      const { cols, rows } = windowGridSize(HOUSE); // footprint 1x1, height 10
      expect(cols).toBeGreaterThanOrEqual(2);
      expect(rows).toBeGreaterThanOrEqual(1);
    });

    it('derives a bigger grid for a taller, wider building', () => {
      const small = windowGridSize(HOUSE);
      const big = windowGridSize(TOWER); // footprint 2x2, height 30
      expect(big.cols).toBeGreaterThanOrEqual(small.cols);
      expect(big.rows).toBeGreaterThan(small.rows);
    });

    it('clamps extreme footprints/heights to a bounded grid (stays well under the 128-slot seed budget)', () => {
      const landmark: BuildingCatalogEntry = { ...TOWER, footprint: { w: 20, d: 20 }, height: 400 };
      const { cols, rows } = windowGridSize(landmark);
      expect(cols * rows).toBeLessThan(127);
    });

    it('is deterministic and pure', () => {
      expect(windowGridSize(TOWER)).toEqual(windowGridSize(TOWER));
    });
  });

  // Row-house massing tweak.
  describe('isRowHouseArchetype / row-house window-grid massing (pure)', () => {
    const ROW_HOUSE: BuildingCatalogEntry = {
      ...HOUSE,
      id: 'row-house',
      zone: ZoneType.ResMediumRow,
      footprint: { w: 1, d: 6 },
      height: 11,
    };
    const SAME_SHAPE_NOT_ROW_HOUSE: BuildingCatalogEntry = {
      ...HOUSE,
      id: 'not-a-row-house',
      zone: ZoneType.ResLow,
      footprint: { w: 1, d: 6 }, // identical footprint/height to ROW_HOUSE...
      height: 11,
    };

    it('identifies the ResMediumRow zone as the row-house archetype', () => {
      expect(isRowHouseArchetype(ROW_HOUSE)).toBe(true);
    });

    it('does NOT fire for an unrelated entry that merely shares a narrow footprint', () => {
      expect(isRowHouseArchetype(SAME_SHAPE_NOT_ROW_HOUSE)).toBe(false);
    });

    it('does not fire for entries with no zone at all (ploppables)', () => {
      const ploppable: BuildingCatalogEntry = {
        ...HOUSE,
        zone: undefined,
        footprint: { w: 1, d: 6 },
      };
      expect(isRowHouseArchetype(ploppable)).toBe(false);
    });

    it('gives the row-house archetype a TIGHTER (>=) window-column grid than an identically-shaped non-row-house entry', () => {
      const rowHouseGrid = windowGridSize(ROW_HOUSE);
      const plainGrid = windowGridSize(SAME_SHAPE_NOT_ROW_HOUSE);
      expect(rowHouseGrid.cols).toBeGreaterThan(plainGrid.cols);
      expect(rowHouseGrid.rows).toBe(plainGrid.rows); // height-derived row count is untouched by the tweak
    });

    it('stays within the existing MAX_WINDOW_COLS clamp, so the WINDOW_SEED_SLOTS budget invariant is untouched', () => {
      const wideRowHouse: BuildingCatalogEntry = { ...ROW_HOUSE, footprint: { w: 1, d: 20 } };
      const { cols, rows } = windowGridSize(wideRowHouse);
      expect(cols * rows).toBeLessThan(127);
    });

    it('is deterministic and pure', () => {
      expect(windowGridSize(ROW_HOUSE)).toEqual(windowGridSize(ROW_HOUSE));
      expect(isRowHouseArchetype(ROW_HOUSE)).toBe(isRowHouseArchetype(ROW_HOUSE));
    });
  });

  describe('windowHash (pure)', () => {
    it('is deterministic: same (buildingId, windowIndex) always hashes the same', () => {
      expect(windowHash(42, 7)).toBe(windowHash(42, 7));
    });

    it('stays within [0,1)', () => {
      for (let id = 0; id < 50; id++) {
        for (let idx = 0; idx < 20; idx++) {
          const h = windowHash(id, idx);
          expect(h).toBeGreaterThanOrEqual(0);
          expect(h).toBeLessThan(1);
        }
      }
    });

    it('varies across window indices for the same building (not a constant)', () => {
      const values = new Set<number>();
      for (let idx = 0; idx < 30; idx++) values.add(windowHash(9, idx));
      expect(values.size).toBeGreaterThan(20);
    });

    it('varies across buildings for the same window index (not a constant)', () => {
      const values = new Set<number>();
      for (let id = 0; id < 30; id++) values.add(windowHash(id, 3));
      expect(values.size).toBeGreaterThan(20);
    });
  });

  describe('windowLitFraction (pure)', () => {
    it('always lands within the NIGHT_WINDOW_LIT_MIN..MAX band', () => {
      for (let id = 0; id < 300; id++) {
        const f = windowLitFraction(id);
        expect(f).toBeGreaterThanOrEqual(NIGHT_WINDOW_LIT_MIN);
        expect(f).toBeLessThan(NIGHT_WINDOW_LIT_MAX);
      }
    });

    it('is stable per building id', () => {
      expect(windowLitFraction(123)).toBe(windowLitFraction(123));
    });

    it('varies across buildings (the "mix" is stable per-building, not identical across buildings)', () => {
      const fractions = new Set<number>();
      for (let id = 0; id < 50; id++) fractions.add(windowLitFraction(id));
      expect(fractions.size).toBeGreaterThan(30);
    });
  });

  describe('isWindowLit (pure)', () => {
    it('lights nothing at nightFactor=0', () => {
      for (let idx = 0; idx < 50; idx++) {
        expect(isWindowLit(7, idx, 0)).toBe(false);
      }
    });

    it('turns on progressively and monotonically as nightFactor sweeps 0 -> 1 (no flicker-off)', () => {
      const steps = 20;
      for (let id = 0; id < 25; id++) {
        for (let idx = 0; idx < 10; idx++) {
          let wasLit = false;
          for (let s = 0; s <= steps; s++) {
            const nightFactor = s / steps;
            const lit = isWindowLit(id, idx, nightFactor);
            if (wasLit) expect(lit).toBe(true); // once lit, must stay lit as it gets darker
            wasLit = wasLit || lit;
          }
        }
      }
    });

    it('at full night, the fraction of lit windows on a building matches its windowLitFraction within tolerance', () => {
      const buildingId = 4242;
      const sampleSize = 4000;
      let lit = 0;
      for (let idx = 0; idx < sampleSize; idx++) {
        if (isWindowLit(buildingId, idx, 1)) lit++;
      }
      const observed = lit / sampleSize;
      expect(observed).toBeCloseTo(windowLitFraction(buildingId), 1);
    });
  });

  describe('isWindowCool (pure)', () => {
    it('is deterministic', () => {
      expect(isWindowCool(11, 4)).toBe(isWindowCool(11, 4));
    });

    it('is an occasional minority pick, not roughly half-and-half', () => {
      let cool = 0;
      const sampleSize = 4000;
      for (let idx = 0; idx < sampleSize; idx++) {
        if (isWindowCool(55, idx)) cool++;
      }
      const fraction = cool / sampleSize;
      expect(fraction).toBeGreaterThan(0.05);
      expect(fraction).toBeLessThan(0.35);
    });
  });

  it('warm/cool window colors match the UI-SPEC hex values exactly', () => {
    expect(WARM_WINDOW_COLOR).toBe(0xffd9a0);
    expect(COOL_WINDOW_COLOR).toBe(0xcfe4ff);
  });

  describe('NIGHT_BODY_TINT (UI-SPEC §6.18 #7 — night facades stay color-legible, not black)', () => {
    // Rec. 709 relative luminance; day color is untinted (mix factor 0 -> [1,1,1],
    // luminance 1), so this tint's own luminance IS the night/day retained fraction.
    function relativeLuminance([r, g, b]: readonly [number, number, number]): number {
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    it('retains a meaningful fraction (> 0.3) of day luminance at full night, rather than collapsing to near-black', () => {
      const luminance = relativeLuminance(NIGHT_BODY_TINT);
      expect(luminance).toBeGreaterThan(0.3);
    });

    it('is still clearly dimmer than day (every channel stays below 1)', () => {
      for (const channel of NIGHT_BODY_TINT) {
        expect(channel).toBeLessThan(1);
      }
    });

    it('reads as cool (blue channel is the strongest, red the weakest) rather than a neutral grey dim', () => {
      const [r, g, b] = NIGHT_BODY_TINT;
      expect(b).toBeGreaterThan(g);
      expect(g).toBeGreaterThan(r);
    });
  });

  describe('isBuildingLitEligible (pure) — abandoned-dark rule', () => {
    it('is true only for Active buildings', () => {
      expect(isBuildingLitEligible(BuildingState.Active)).toBe(true);
      expect(isBuildingLitEligible(BuildingState.Abandoned)).toBe(false);
      expect(isBuildingLitEligible(BuildingState.Constructing)).toBe(false);
    });
  });

  describe('BuildingInstancer.setNightFactor / activeAt', () => {
    it('defaults to nightFactor 0 and clamps out-of-range values into [0,1]', () => {
      const instancer = new BuildingInstancer(new THREE.Scene(), CATALOG, flatHeightAt);
      expect(instancer.nightFactor()).toBe(0);
      instancer.setNightFactor(1.5);
      expect(instancer.nightFactor()).toBe(1);
      instancer.setNightFactor(-2);
      expect(instancer.nightFactor()).toBe(0);
      instancer.setNightFactor(0.42);
      expect(instancer.nightFactor()).toBeCloseTo(0.42, 9);
    });

    it('marks Active instances eligible for lit windows and Abandoned/Constructing instances dark', () => {
      const instancer = new BuildingInstancer(new THREE.Scene(), CATALOG, flatHeightAt);
      instancer.apply({
        added: [
          instanceAt(1, 0, 0, { state: BuildingState.Active }),
          instanceAt(2, 1, 0, { state: BuildingState.Abandoned }),
          instanceAt(3, 2, 0, { state: BuildingState.Constructing }),
        ],
        removed: [],
        updated: [],
      });

      expect(instancer.activeAt('house', 0)).toBe(1);
      expect(instancer.activeAt('house', 1)).toBe(0);
      expect(instancer.activeAt('house', 2)).toBe(0);
    });

    it('activeAt tracks a building through swap-with-last removal', () => {
      const instancer = new BuildingInstancer(new THREE.Scene(), CATALOG, flatHeightAt);
      instancer.apply({
        added: [
          instanceAt(1, 0, 0, { state: BuildingState.Active }),
          instanceAt(2, 1, 0, { state: BuildingState.Active }),
          instanceAt(3, 2, 0, { state: BuildingState.Abandoned }),
        ],
        removed: [],
        updated: [],
      });
      // Remove the middle (Active) instance: slot 1 is now the swapped-in
      // last instance (id 3, Abandoned) — activeAt must follow the swap.
      instancer.apply({ added: [], removed: [2], updated: [] });
      expect(instancer.activeAt('house', 1)).toBe(0);
    });

    it('activeAt returns null for an unknown catalogId or an out-of-range slot', () => {
      const instancer = new BuildingInstancer(new THREE.Scene(), CATALOG, flatHeightAt);
      instancer.apply({ added: [instanceAt(1, 0, 0)], removed: [], updated: [] });
      expect(instancer.activeAt('does-not-exist', 0)).toBeNull();
      expect(instancer.activeAt('house', 5)).toBeNull();
    });
  });
});

describe('day facade (UI-SPEC §6.6 Stage 1) — extends the §6.5 material, no new draw calls', () => {
  // One entry per facade family plus industrial and every
  // non-zoned category, so material construction is exercised for every
  // family/category branch deriveFacadeParams can produce.
  const GLASS_COM: BuildingCatalogEntry = {
    id: 'glass-com',
    name: 'Glass Office Tower',
    category: 'com',
    zone: ZoneType.ComHigh,
    level: 1,
    footprint: { w: 2, d: 2 },
    height: 40,
    color: 0x557799,
    jobs: 60,
    powerUse: 2,
    waterUse: 1,
    cost: 0,
    upkeep: 0,
    unlockMilestone: 0,
  };
  const MASONRY_COM: BuildingCatalogEntry = {
    id: 'masonry-com',
    name: 'Corner Shop',
    category: 'com',
    zone: ZoneType.ComLow,
    level: 1,
    footprint: { w: 1, d: 1 },
    height: 8,
    color: 0x995533,
    jobs: 8,
    powerUse: 0.3,
    waterUse: 0.3,
    cost: 0,
    upkeep: 0,
    unlockMilestone: 0,
  };
  const GLASS_RES_TOWER: BuildingCatalogEntry = {
    id: 'glass-res-tower',
    name: 'Residential Tower',
    category: 'res',
    zone: ZoneType.ResHigh,
    level: 3,
    footprint: { w: 3, d: 3 },
    height: 46,
    color: 0x445566,
    residents: 150,
    powerUse: 3,
    waterUse: 8,
    cost: 0,
    upkeep: 0,
    unlockMilestone: 3,
  };
  const PLASTER_RES: BuildingCatalogEntry = {
    id: 'plaster-res',
    name: 'Small House',
    category: 'res',
    zone: ZoneType.ResLow,
    level: 1,
    footprint: { w: 1, d: 1 },
    height: 5,
    color: 0xddccaa,
    residents: 4,
    powerUse: 0.1,
    waterUse: 0.1,
    cost: 0,
    upkeep: 0,
    unlockMilestone: 0,
  };
  const INDUSTRIAL: BuildingCatalogEntry = {
    id: 'industrial',
    name: 'Factory Hall',
    category: 'ind',
    zone: ZoneType.Industrial,
    level: 1,
    footprint: { w: 3, d: 3 },
    height: 13,
    color: 0x887766,
    jobs: 30,
    powerUse: 2,
    waterUse: 1,
    pollution: 90,
    cost: 0,
    upkeep: 0,
    unlockMilestone: 0,
  };
  const SERVICE: BuildingCatalogEntry = {
    id: 'service',
    name: 'Police Station',
    category: 'service',
    footprint: { w: 2, d: 2 },
    height: 12,
    color: 0x224477,
    powerUse: 0.6,
    waterUse: 0.6,
    service: { kind: 'police', strength: 160, range: 48 },
    cost: 4000,
    upkeep: 300,
    unlockMilestone: 1,
  };
  const UTILITY: BuildingCatalogEntry = {
    id: 'utility',
    name: 'Water Tower',
    category: 'utility',
    footprint: { w: 2, d: 2 },
    height: 24,
    color: 0x556677,
    powerUse: 0.2,
    waterUse: 0,
    utility: { waterKL: 400 },
    cost: 2500,
    upkeep: 120,
    unlockMilestone: 0,
  };
  const PARK: BuildingCatalogEntry = {
    id: 'park',
    name: 'Pocket Park',
    category: 'park',
    footprint: { w: 1, d: 1 },
    height: 2,
    color: 0x336633,
    powerUse: 0,
    waterUse: 0.2,
    cost: 400,
    upkeep: 20,
    unlockMilestone: 0,
  };

  const FULL_CATALOG: BuildingCatalogEntry[] = [
    GLASS_COM,
    MASONRY_COM,
    GLASS_RES_TOWER,
    PLASTER_RES,
    INDUSTRIAL,
    SERVICE,
    UTILITY,
    PARK,
  ];

  it('constructs a material for every facade family + industrial + every non-zoned category, without throwing', () => {
    expect(
      () => new BuildingInstancer(new THREE.Scene(), FULL_CATALOG, flatHeightAt),
    ).not.toThrow();
  });

  it('renders one instance per archetype with correct matrix/id bookkeeping and exactly one InstancedMesh per catalog entry (no draw-call growth)', () => {
    const instancer = new BuildingInstancer(new THREE.Scene(), FULL_CATALOG, flatHeightAt);
    const added = FULL_CATALOG.map((catalogEntry, i) =>
      instanceAt(i + 1, i * 5, 0, {
        catalogId: catalogEntry.id,
        rotation: (i % 4) as 0 | 1 | 2 | 3,
      }),
    );
    instancer.apply({ added, removed: [], updated: [] });

    expect(instancer.instanceCount()).toBe(FULL_CATALOG.length);
    const pickables = instancer.getPickables();
    expect(pickables.length).toBe(FULL_CATALOG.length); // still exactly one mesh per archetype
    for (const catalogEntry of FULL_CATALOG) {
      const pick = pickables.find((p) => p.catalogId === catalogEntry.id);
      expect(pick).toBeDefined();
      expect((pick?.mesh as THREE.InstancedMesh).count).toBe(1);
    }
  });

  it('keeps rotation, height-scale, and Constructing/Abandoned tinting correct across every family (Stage 1 only changes the shader, not the instance-matrix/tint bookkeeping)', () => {
    const instancer = new BuildingInstancer(new THREE.Scene(), FULL_CATALOG, flatHeightAt);
    instancer.apply({
      added: [
        instanceAt(1, 0, 0, {
          catalogId: INDUSTRIAL.id,
          rotation: 2,
          state: BuildingState.Constructing,
        }),
        instanceAt(2, 1, 0, {
          catalogId: GLASS_RES_TOWER.id,
          rotation: 1,
          state: BuildingState.Abandoned,
        }),
      ],
      removed: [],
      updated: [],
    });

    const industrialMesh = instancer.getPickables().find((p) => p.catalogId === INDUSTRIAL.id)
      ?.mesh as THREE.InstancedMesh;
    const { scl: industrialScale } = decomposeAt(industrialMesh, 0);
    expect(industrialScale.y).toBeCloseTo(INDUSTRIAL.height * 0.25, 5); // Constructing scale unchanged

    const towerMesh = instancer.getPickables().find((p) => p.catalogId === GLASS_RES_TOWER.id)
      ?.mesh as THREE.InstancedMesh;
    const abandonedColor = new THREE.Color();
    towerMesh.getColorAt(0, abandonedColor);
    expect(abandonedColor.r).toBeCloseTo(0.25, 5); // Abandoned tint unchanged

    expect(instancer.activeAt(INDUSTRIAL.id, 0)).toBe(0); // Constructing: not lit-eligible
    expect(instancer.activeAt(GLASS_RES_TOWER.id, 0)).toBe(0); // Abandoned: not lit-eligible
  });

  it('constructs materials for the full production catalog (src/data/catalog.json) without throwing, one instance each resolves correctly', () => {
    const realCatalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
    expect(realCatalog.length).toBeGreaterThan(0);

    const instancer = new BuildingInstancer(new THREE.Scene(), realCatalog, flatHeightAt);
    const added = realCatalog.map((catalogEntry, i) =>
      instanceAt(i + 1, i * 6, 0, { catalogId: catalogEntry.id }),
    );
    expect(() => instancer.apply({ added, removed: [], updated: [] })).not.toThrow();

    expect(instancer.instanceCount()).toBe(realCatalog.length);
    expect(instancer.getPickables().length).toBe(realCatalog.length);
    for (let i = 0; i < realCatalog.length; i++) {
      const catalogEntry = realCatalog[i]!;
      expect(instancer.buildingIdAt({ catalogId: catalogEntry.id, instanceIndex: 0 })).toBe(i + 1);
    }
  });

  // The generic facade system
  // renders ANY catalog entry by footprint/height/color, so the new zones
  // (ResMediumRow=6, ResMedium=7, Mixed=8) render "for free" once their
  // catalog entries exist; this confirms that end-to-end rather than assuming
  // it from the full-catalog smoke test above.
  it('instances one building of each new zone (ResMediumRow, ResMedium, Mixed) and lands each in its own bucket', () => {
    const realCatalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
    const newZoneEntries = realCatalog.filter(
      (e) =>
        e.zone === ZoneType.ResMediumRow ||
        e.zone === ZoneType.ResMedium ||
        e.zone === ZoneType.Mixed,
    );
    // Sanity: the catalog really does carry entries for all three new zones.
    expect(newZoneEntries.some((e) => e.zone === ZoneType.ResMediumRow)).toBe(true);
    expect(newZoneEntries.some((e) => e.zone === ZoneType.ResMedium)).toBe(true);
    expect(newZoneEntries.some((e) => e.zone === ZoneType.Mixed)).toBe(true);

    const instancer = new BuildingInstancer(new THREE.Scene(), realCatalog, flatHeightAt);
    const added = newZoneEntries.map((entry, i) =>
      instanceAt(i + 1, i * 8, 0, { catalogId: entry.id }),
    );
    expect(() => instancer.apply({ added, removed: [], updated: [] })).not.toThrow();

    expect(instancer.instanceCount()).toBe(newZoneEntries.length);
    for (const entry of newZoneEntries) {
      const bucket = instancer.getPickables().find((p) => p.catalogId === entry.id);
      expect(bucket).toBeDefined();
      const mesh = bucket!.mesh;
      expect(mesh.count).toBeGreaterThan(0);
    }
  });
});

describe('plinth mode (UI-SPEC §6.15) — additive-only 4th constructor arg, default byte-identical', () => {
  const UTILITY_ENTRY: BuildingCatalogEntry = {
    id: 'utility-kit-owned',
    name: 'Wind Turbine',
    category: 'utility',
    footprint: { w: 1, d: 1 },
    height: 40,
    color: 0xe6e6d6,
    powerUse: 0,
    waterUse: 0,
    cost: 3000,
    upkeep: 100,
    unlockMilestone: 0,
  };
  const SHORT_UTILITY_ENTRY: BuildingCatalogEntry = {
    id: 'short-utility',
    name: 'Pocket Park',
    category: 'park',
    footprint: { w: 1, d: 1 },
    height: 2,
    color: 0x336633,
    powerUse: 0,
    waterUse: 0.2,
    cost: 400,
    upkeep: 20,
    unlockMilestone: 0,
  };
  const MIXED_CATALOG: BuildingCatalogEntry[] = [UTILITY_ENTRY, SHORT_UTILITY_ENTRY, HOUSE];

  function materialOf(instancer: BuildingInstancer, catalogId: string): MeshStandardNodeMaterial {
    const mesh = instancer.getPickables().find((p) => p.catalogId === catalogId)?.mesh as
      THREE.InstancedMesh | undefined;
    expect(mesh).toBeDefined();
    return (mesh as THREE.InstancedMesh).material as MeshStandardNodeMaterial;
  }

  it('default (plinthIds omitted) behaves byte-identically to today: full height, full facade material', () => {
    const instancer = new BuildingInstancer(new THREE.Scene(), MIXED_CATALOG, flatHeightAt);
    instancer.apply({
      added: [instanceAt(1, 0, 0, { catalogId: UTILITY_ENTRY.id })],
      removed: [],
      updated: [],
    });
    const mesh = instancer.getPickables().find((p) => p.catalogId === UTILITY_ENTRY.id)
      ?.mesh as THREE.InstancedMesh;
    const { scl } = decomposeAt(mesh, 0);
    expect(scl.y).toBeCloseTo(UTILITY_ENTRY.height, 5);
    expect(materialOf(instancer, UTILITY_ENTRY.id).emissiveNode).not.toBeNull();
  });

  it('scales a plinth-designated entry to height*0.08 instead of full height', () => {
    const instancer = new BuildingInstancer(
      new THREE.Scene(),
      MIXED_CATALOG,
      flatHeightAt,
      new Set([UTILITY_ENTRY.id]),
    );
    instancer.apply({
      added: [instanceAt(1, 0, 0, { catalogId: UTILITY_ENTRY.id })],
      removed: [],
      updated: [],
    });
    const mesh = instancer.getPickables().find((p) => p.catalogId === UTILITY_ENTRY.id)
      ?.mesh as THREE.InstancedMesh;
    const { pos, scl } = decomposeAt(mesh, 0);
    expect(scl.y).toBeCloseTo(UTILITY_ENTRY.height * 0.08, 5);
    expect(pos.y).toBeCloseTo((UTILITY_ENTRY.height * 0.08) / 2, 5); // groundY(0) + height/2
  });

  it('clamps the plinth height to a 0.4m minimum for a short catalog entry', () => {
    const instancer = new BuildingInstancer(
      new THREE.Scene(),
      MIXED_CATALOG,
      flatHeightAt,
      new Set([SHORT_UTILITY_ENTRY.id]),
    );
    instancer.apply({
      added: [instanceAt(1, 0, 0, { catalogId: SHORT_UTILITY_ENTRY.id })],
      removed: [],
      updated: [],
    });
    const mesh = instancer.getPickables().find((p) => p.catalogId === SHORT_UTILITY_ENTRY.id)
      ?.mesh as THREE.InstancedMesh;
    const { scl } = decomposeAt(mesh, 0);
    // 2 * 0.08 = 0.16, below the 0.4m floor.
    expect(scl.y).toBeCloseTo(0.4, 5);
  });

  it('leaves footprint span (X/Z) untouched by plinth mode — only height changes', () => {
    const instancer = new BuildingInstancer(
      new THREE.Scene(),
      MIXED_CATALOG,
      flatHeightAt,
      new Set([UTILITY_ENTRY.id]),
    );
    instancer.apply({
      added: [instanceAt(1, 0, 0, { catalogId: UTILITY_ENTRY.id })],
      removed: [],
      updated: [],
    });
    const mesh = instancer.getPickables().find((p) => p.catalogId === UTILITY_ENTRY.id)
      ?.mesh as THREE.InstancedMesh;
    const { scl } = decomposeAt(mesh, 0);
    expect(scl.x).toBeCloseTo(1 * TILE_METERS * 0.85, 5);
    expect(scl.z).toBeCloseTo(1 * TILE_METERS * 0.85, 5);
  });

  it('still applies the existing Constructing height-scale on top of the plinth height', () => {
    const instancer = new BuildingInstancer(
      new THREE.Scene(),
      MIXED_CATALOG,
      flatHeightAt,
      new Set([UTILITY_ENTRY.id]),
    );
    instancer.apply({
      added: [
        instanceAt(1, 0, 0, { catalogId: UTILITY_ENTRY.id, state: BuildingState.Constructing }),
      ],
      removed: [],
      updated: [],
    });
    const mesh = instancer.getPickables().find((p) => p.catalogId === UTILITY_ENTRY.id)
      ?.mesh as THREE.InstancedMesh;
    const { scl } = decomposeAt(mesh, 0);
    expect(scl.y).toBeCloseTo(UTILITY_ENTRY.height * 0.08 * 0.25, 5);
  });

  it('gives plinth-designated entries a PLAIN material with no emissive/window graph at all', () => {
    const instancer = new BuildingInstancer(
      new THREE.Scene(),
      MIXED_CATALOG,
      flatHeightAt,
      new Set([UTILITY_ENTRY.id]),
    );
    instancer.apply({
      added: [instanceAt(1, 0, 0, { catalogId: UTILITY_ENTRY.id })],
      removed: [],
      updated: [],
    });
    const material = materialOf(instancer, UTILITY_ENTRY.id);
    expect(material.colorNode).not.toBeNull();
    expect(material.emissiveNode).toBeNull();
  });

  it('non-plinth entries in the SAME mixed catalog keep the full §6.6 facade material (emissiveNode set)', () => {
    const instancer = new BuildingInstancer(
      new THREE.Scene(),
      MIXED_CATALOG,
      flatHeightAt,
      new Set([UTILITY_ENTRY.id]),
    );
    instancer.apply({
      added: [instanceAt(1, 0, 0, { catalogId: 'house' })],
      removed: [],
      updated: [],
    });
    expect(materialOf(instancer, 'house').emissiveNode).not.toBeNull();
  });

  it('keeps picking/id bookkeeping fully working for a plinth-mode bucket', () => {
    const instancer = new BuildingInstancer(
      new THREE.Scene(),
      MIXED_CATALOG,
      flatHeightAt,
      new Set([UTILITY_ENTRY.id]),
    );
    instancer.apply({
      added: [instanceAt(777, 0, 0, { catalogId: UTILITY_ENTRY.id })],
      removed: [],
      updated: [],
    });
    expect(instancer.instanceCount()).toBe(1);
    expect(instancer.buildingIdAt({ catalogId: UTILITY_ENTRY.id, instanceIndex: 0 })).toBe(777);
    const rgb = instancer.idColorAt(UTILITY_ENTRY.id, 0);
    expect(rgb).not.toBeNull();
    expect(decodeId(rgb as [number, number, number])).toBe(777);
  });

  it('does not throw across the full production catalog when every entry is marked as a plinth', () => {
    const realCatalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
    const allIds = new Set(realCatalog.map((e) => e.id));
    const instancer = new BuildingInstancer(new THREE.Scene(), realCatalog, flatHeightAt, allIds);
    const added = realCatalog.map((catalogEntry, i) =>
      instanceAt(i + 1, i * 6, 0, { catalogId: catalogEntry.id }),
    );
    expect(() => instancer.apply({ added, removed: [], updated: [] })).not.toThrow();
    expect(instancer.instanceCount()).toBe(realCatalog.length);
  });
});

describe('BuildingInstancer frustum-culling regression (wave 6)', () => {
  it('apply() nulls a bounding sphere cached while the bucket was empty', () => {
    const scene = new THREE.Scene();
    const instancer = new BuildingInstancer(scene, CATALOG, flatHeightAt);
    // Simulate the renderer's first cull pass over the still-empty buckets:
    // three.js caches an empty sphere and never recomputes it on its own.
    for (const child of scene.children) {
      if (child instanceof THREE.InstancedMesh) child.computeBoundingSphere();
    }

    instancer.apply({ added: [instanceAt(1, 120, 120)], removed: [], updated: [] });
    const mesh = instancer.getPickables().find((p) => p.catalogId === 'house')?.mesh;
    expect(mesh).toBeDefined();
    expect((mesh as THREE.InstancedMesh).boundingSphere).toBeNull();
  });
});
