import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  computeSetbacks,
  frontageSetbackFor,
  InstancedSlotPool,
  massingLifecycleTint,
  MassingRenderer,
  MASSING_FOOTPRINT_SHRINK,
  MAX_SETBACK_INSET,
  MIN_SETBACK_INSET,
} from './massing';
import { BAY_DEPTH_TILES } from './parked';
import { deriveFacadeParams } from './facade';
import {
  BuildingCatalogEntry,
  BuildingDelta,
  BuildingInstance,
  BuildingState,
} from '../shared/types';
import { TILE_METERS } from '../shared/constants';
import catalogData from '../data/catalog.json';

const flatHeightAt = (): number => 0;

function entry(overrides: Partial<BuildingCatalogEntry> = {}): BuildingCatalogEntry {
  return {
    id: 'test-entry',
    name: 'Test Entry',
    category: 'res',
    footprint: { w: 1, d: 1 },
    height: 12,
    color: 0x8899aa,
    powerUse: 0,
    waterUse: 0,
    cost: 0,
    upkeep: 0,
    unlockMilestone: 0,
    ...overrides,
  };
}

function building(overrides: Partial<BuildingInstance> = {}): BuildingInstance {
  return {
    id: 1,
    catalogId: 'test-entry',
    x: 5,
    z: 5,
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

const noRoad = (): boolean => false;

/** A predicate that is true only for the given set of tile coordinates. */
function roadAtTiles(
  tiles: ReadonlyArray<readonly [number, number]>,
): (x: number, z: number) => boolean {
  const set = new Set(tiles.map(([x, z]) => `${x},${z}`));
  return (x: number, z: number): boolean => set.has(`${x},${z}`);
}

function decompose(m: THREE.Matrix4) {
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  m.decompose(pos, quat, scl);
  return { pos, quat, scl };
}

// ---------------------------------------------------------------------------
// computeSetbacks (pure)
// ---------------------------------------------------------------------------

describe('computeSetbacks', () => {
  it('returns exactly 1 box for level 1', () => {
    const { boxes } = computeSetbacks(entry({ level: 1 }), 1);
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.yOffset).toBe(0);
    expect(boxes[0]!.h).toBeCloseTo(12, 9);
  });

  it('returns exactly 1 box for ploppables (level undefined)', () => {
    const { boxes } = computeSetbacks(entry({ level: undefined }), 1);
    expect(boxes).toHaveLength(1);
  });

  it('returns exactly 2 boxes for level 2, and 3 boxes for level 3', () => {
    expect(computeSetbacks(entry({ level: 2 }), 1).boxes).toHaveLength(2);
    expect(computeSetbacks(entry({ level: 3 }), 1).boxes).toHaveLength(3);
  });

  it('clamps out-of-range levels into 1..3', () => {
    expect(computeSetbacks(entry({ level: 0 }), 1).boxes).toHaveLength(1);
    expect(computeSetbacks(entry({ level: -5 }), 1).boxes).toHaveLength(1);
    expect(computeSetbacks(entry({ level: 4 }), 1).boxes).toHaveLength(3);
    expect(computeSetbacks(entry({ level: 99 }), 1).boxes).toHaveLength(3);
  });

  it('box0 matches BuildingInstancer-style footprint sizing (footprint * TILE_METERS * shrink)', () => {
    const e = entry({ footprint: { w: 2, d: 3 }, level: 1 });
    const { boxes } = computeSetbacks(e, 7);
    expect(boxes[0]!.w).toBeCloseTo(2 * TILE_METERS * MASSING_FOOTPRINT_SHRINK, 9);
    expect(boxes[0]!.d).toBeCloseTo(3 * TILE_METERS * MASSING_FOOTPRINT_SHRINK, 9);
  });

  it('preserves total height exactly: boxes stack bottom-to-top with no gap/overlap and the last box reaches entry.height', () => {
    for (const level of [1, 2, 3]) {
      for (const height of [5, 12, 30, 46.5]) {
        const { boxes } = computeSetbacks(entry({ level, height }), 42);
        let cursor = 0;
        for (const box of boxes) {
          expect(box.yOffset).toBeCloseTo(cursor, 6);
          cursor += box.h;
        }
        expect(cursor).toBeCloseTo(height, 6);
      }
    }
  });

  it('upper boxes are inset 10-20% narrower than the box directly below them', () => {
    for (let id = 0; id < 100; id++) {
      const { boxes } = computeSetbacks(entry({ level: 3, footprint: { w: 4, d: 4 } }), id);
      for (let tier = 1; tier < boxes.length; tier++) {
        const prev = boxes[tier - 1]!;
        const cur = boxes[tier]!;
        const wRatio = cur.w / prev.w;
        const dRatio = cur.d / prev.d;
        expect(wRatio).toBeGreaterThanOrEqual(1 - MAX_SETBACK_INSET - 1e-9);
        expect(wRatio).toBeLessThanOrEqual(1 - MIN_SETBACK_INSET + 1e-9);
        expect(dRatio).toBeCloseTo(wRatio, 9); // w/d inset the same fraction
      }
    }
  });

  it('does NOT inset box0 (the base tier is always the full footprint)', () => {
    const { boxes } = computeSetbacks(entry({ level: 3, footprint: { w: 4, d: 4 } }), 55);
    expect(boxes[0]!.w).toBeCloseTo(4 * TILE_METERS * MASSING_FOOTPRINT_SHRINK, 9);
  });

  it('is deterministic: identical (entry, buildingId) always yields identical boxes', () => {
    const e = entry({ level: 3, height: 40 });
    expect(computeSetbacks(e, 123)).toEqual(computeSetbacks(e, 123));
  });

  it('varies insets across building ids (not a constant fraction)', () => {
    const e = entry({ level: 3, footprint: { w: 4, d: 4 } });
    const ratios = new Set<number>();
    for (let id = 0; id < 40; id++) {
      const { boxes } = computeSetbacks(e, id);
      ratios.add(Number((boxes[1]!.w / boxes[0]!.w).toFixed(6)));
    }
    expect(ratios.size).toBeGreaterThan(10);
  });

  it('tier-2 inset is independent of tier-1 inset (not the same draw repeated)', () => {
    const e = entry({ level: 3, footprint: { w: 4, d: 4 } });
    let sawDifferentRatios = false;
    for (let id = 0; id < 40; id++) {
      const { boxes } = computeSetbacks(e, id);
      const ratio1 = boxes[1]!.w / boxes[0]!.w;
      const ratio2 = boxes[2]!.w / boxes[1]!.w;
      if (Math.abs(ratio1 - ratio2) > 1e-6) sawDifferentRatios = true;
    }
    expect(sawDifferentRatios).toBe(true);
  });

  it('rounds a non-integer level defensively', () => {
    expect(computeSetbacks(entry({ level: 2.4 }), 1).boxes).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// frontageSetbackFor (pure) — body setback that clears the parking-bay row
// ---------------------------------------------------------------------------

describe('frontageSetbackFor', () => {
  // 2x2 footprint at (5,5): the shrunk body face sits 2*(1-0.85)/2 = 0.15
  // tiles inside each footprint edge; the bay row runs BAY_DEPTH_TILES inward,
  // so the span loses the remainder and the center shifts half of it.
  const com = entry({ category: 'com', zone: 3, footprint: { w: 2, d: 2 } });
  const comSetbackM = (BAY_DEPTH_TILES.com - 0.15) * TILE_METERS;

  it('is all-zero when no side is road-adjacent', () => {
    expect(frontageSetbackFor(com, 5, 5, noRoad)).toEqual({
      spanXM: 0,
      spanZM: 0,
      centerXM: 0,
      centerZM: 0,
    });
  });

  it('is all-zero for categories parked.ts gives no bays, even with a road-facing edge', () => {
    for (const category of ['res', 'service', 'utility', 'park'] as const) {
      const e = entry({ category, footprint: { w: 2, d: 2 } });
      expect(frontageSetbackFor(e, 5, 5, roadAtTiles([[5, 4]]))).toEqual({
        spanXM: 0,
        spanZM: 0,
        centerXM: 0,
        centerZM: 0,
      });
    }
  });

  /** Field-wise comparison — the setback is computed in floats, so exact deep-equal is too strict. */
  function expectSetback(
    actual: { spanXM: number; spanZM: number; centerXM: number; centerZM: number },
    expected: { spanXM: number; spanZM: number; centerXM: number; centerZM: number },
  ): void {
    expect(actual.spanXM).toBeCloseTo(expected.spanXM, 9);
    expect(actual.spanZM).toBeCloseTo(expected.spanZM, 9);
    expect(actual.centerXM).toBeCloseTo(expected.centerXM, 9);
    expect(actual.centerZM).toBeCloseTo(expected.centerZM, 9);
  }

  it('N-side road: reduces the Z span and shifts the center south (away from the road)', () => {
    expectSetback(frontageSetbackFor(com, 5, 5, roadAtTiles([[5, 4]])), {
      spanXM: 0,
      spanZM: comSetbackM,
      centerXM: 0,
      centerZM: comSetbackM / 2,
    });
  });

  it('S-side road: reduces the Z span and shifts the center north', () => {
    expectSetback(frontageSetbackFor(com, 5, 5, roadAtTiles([[5, 7]])), {
      spanXM: 0,
      spanZM: comSetbackM,
      centerXM: 0,
      centerZM: -comSetbackM / 2,
    });
  });

  it('E-side road: reduces the X span and shifts the center west', () => {
    expectSetback(frontageSetbackFor(com, 5, 5, roadAtTiles([[7, 5]])), {
      spanXM: comSetbackM,
      spanZM: 0,
      centerXM: -comSetbackM / 2,
      centerZM: 0,
    });
  });

  it('W-side road: reduces the X span and shifts the center east', () => {
    expectSetback(frontageSetbackFor(com, 5, 5, roadAtTiles([[4, 5]])), {
      spanXM: comSetbackM,
      spanZM: 0,
      centerXM: comSetbackM / 2,
      centerZM: 0,
    });
  });

  it('lands the body road-side face exactly where the bay row ends (flush, no overlap, no gap)', () => {
    const setback = frontageSetbackFor(com, 5, 5, roadAtTiles([[5, 4]]));
    const spanZ = 2 * TILE_METERS * MASSING_FOOTPRINT_SHRINK - setback.spanZM;
    const centerZ = (5 + 1) * TILE_METERS + setback.centerZM;
    const northFace = centerZ - spanZ / 2;
    expect(northFace).toBeCloseTo(5 * TILE_METERS + BAY_DEPTH_TILES.com * TILE_METERS, 9);
    // The back face never moves.
    expect(centerZ + spanZ / 2).toBeCloseTo(7 * TILE_METERS - 0.15 * TILE_METERS, 9);
  });

  it('uses the deeper industrial bay depth for ind lots', () => {
    const ind = entry({ category: 'ind', zone: 5, footprint: { w: 2, d: 2 } });
    const setback = frontageSetbackFor(ind, 5, 5, roadAtTiles([[5, 4]]));
    expect(setback.spanZM).toBeCloseTo((BAY_DEPTH_TILES.ind - 0.15) * TILE_METERS, 9);
    expect(setback.centerZM).toBeCloseTo(setback.spanZM / 2, 9);
  });

  it('clamps to zero when the shrunk face already clears the bay row (very deep footprints)', () => {
    // 8-tile frontage axis: margin 8*0.075 = 0.6 tiles > BAY_DEPTH_TILES.com.
    const deep = entry({ category: 'com', zone: 3, footprint: { w: 8, d: 8 } });
    expect(frontageSetbackFor(deep, 5, 5, roadAtTiles([[5, 4]]))).toEqual({
      spanXM: 0,
      spanZM: 0,
      centerXM: 0,
      centerZM: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// computeSetbacks x frontage setback
// ---------------------------------------------------------------------------

describe('computeSetbacks with a frontage setback', () => {
  const com = entry({ category: 'com', zone: 3, footprint: { w: 2, d: 2 }, level: 2, height: 20 });

  it('narrows the base tier by the frontage span reductions', () => {
    const frontage = frontageSetbackFor(com, 5, 5, roadAtTiles([[5, 4]]));
    const { boxes } = computeSetbacks(com, 7, frontage);
    expect(boxes[0]!.w).toBeCloseTo(2 * TILE_METERS * MASSING_FOOTPRINT_SHRINK, 9);
    expect(boxes[0]!.d).toBeCloseTo(
      2 * TILE_METERS * MASSING_FOOTPRINT_SHRINK - frontage.spanZM,
      9,
    );
  });

  it('keeps every upper tier within the set-back base tier', () => {
    const frontage = frontageSetbackFor(com, 5, 5, roadAtTiles([[5, 4]]));
    const { boxes } = computeSetbacks(com, 7, frontage);
    for (let tier = 1; tier < boxes.length; tier++) {
      expect(boxes[tier]!.w).toBeLessThan(boxes[tier - 1]!.w);
      expect(boxes[tier]!.d).toBeLessThan(boxes[tier - 1]!.d);
    }
  });

  it('omitting the frontage argument matches an all-zero setback exactly', () => {
    const zero = frontageSetbackFor(com, 5, 5, noRoad);
    expect(computeSetbacks(com, 7, zero)).toEqual(computeSetbacks(com, 7));
  });
});

// ---------------------------------------------------------------------------
// massingLifecycleTint (pure)
// ---------------------------------------------------------------------------

describe('massingLifecycleTint', () => {
  it('is [1,1,1] for Active, grey for Constructing, dark for Abandoned', () => {
    expect(massingLifecycleTint(BuildingState.Active)).toEqual([1, 1, 1]);
    expect(massingLifecycleTint(BuildingState.Constructing)).toEqual([0.55, 0.55, 0.55]);
    expect(massingLifecycleTint(BuildingState.Abandoned)).toEqual([0.25, 0.25, 0.25]);
  });
});

// ---------------------------------------------------------------------------
// InstancedSlotPool (generic reusable helper)
// ---------------------------------------------------------------------------

describe('InstancedSlotPool', () => {
  it('allocates sequential slots starting at 0', () => {
    const scene = new THREE.Scene();
    const pool = new InstancedSlotPool(
      scene,
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
      4,
    );
    expect(pool.allocate()).toBe(0);
    expect(pool.allocate()).toBe(1);
    expect(pool.allocate()).toBe(2);
  });

  it('adds exactly one InstancedMesh to the scene', () => {
    const scene = new THREE.Scene();
    new InstancedSlotPool(scene, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 4);
    expect(scene.children.filter((c) => c instanceof THREE.InstancedMesh)).toHaveLength(1);
  });

  it('grows capacity by doubling once the initial capacity is exceeded, preserving prior matrices', () => {
    const scene = new THREE.Scene();
    const pool = new InstancedSlotPool(
      scene,
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
      2,
    );
    const m0 = new THREE.Matrix4().makeTranslation(1, 2, 3);
    const s0 = pool.allocate();
    pool.setMatrixAt(s0, m0);
    pool.allocate(); // fills capacity (2)
    const s2 = pool.allocate(); // triggers growth
    pool.commit();

    expect(s2).toBe(2);
    expect(pool.instanceCount()).toBe(3);
    const out = new THREE.Matrix4();
    pool.getMatrixAt(s0, out);
    expect(out.elements).toEqual(m0.elements);

    // Growth swaps the scene's mesh instance; only the new one should remain.
    expect(scene.children.filter((c) => c instanceof THREE.InstancedMesh)).toHaveLength(1);
    expect(scene.children[0]).toBe(pool.getMesh());
  });

  it('free() recycles a slot for the next allocate() instead of growing', () => {
    const scene = new THREE.Scene();
    const pool = new InstancedSlotPool(
      scene,
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
      4,
    );
    const a = pool.allocate();
    const b = pool.allocate();
    pool.free(a);
    const c = pool.allocate();
    expect(c).toBe(a);
    expect(b).not.toBe(a);
  });

  it('free() zero-scales the freed slot matrix', () => {
    const scene = new THREE.Scene();
    const pool = new InstancedSlotPool(
      scene,
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
      4,
    );
    const slot = pool.allocate();
    pool.setMatrixAt(slot, new THREE.Matrix4().makeTranslation(9, 9, 9));
    pool.free(slot);
    const out = new THREE.Matrix4();
    pool.getMatrixAt(slot, out);
    expect(isZeroScale(out)).toBe(true);
  });

  it('commit() sets mesh.count to the allocation high-water-mark and bumps the matrix attribute version (flags it dirty for upload)', () => {
    const scene = new THREE.Scene();
    const pool = new InstancedSlotPool(
      scene,
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
      4,
    );
    const versionBefore = pool.getMesh().instanceMatrix.version;
    pool.allocate();
    pool.allocate();
    pool.commit();
    expect(pool.getMesh().count).toBe(2);
    expect(pool.getMesh().instanceMatrix.version).toBeGreaterThan(versionBefore);
  });
});

// ---------------------------------------------------------------------------
// MassingRenderer
// ---------------------------------------------------------------------------

describe('MassingRenderer', () => {
  it('renders zero upper-box slots for a level-1 building', () => {
    const scene = new THREE.Scene();
    const renderer = new MassingRenderer(scene, flatHeightAt, [entry({ level: 1 })]);
    renderer.apply(deltaAdd(building({ level: 1 })));
    expect(renderer.upperBoxSlotsFor(1)).toHaveLength(0);
  });

  it('renders zero upper-box slots for a ploppable (no level field)', () => {
    const scene = new THREE.Scene();
    const plop = entry({ id: 'plop', level: undefined });
    const renderer = new MassingRenderer(scene, flatHeightAt, [plop]);
    renderer.apply(deltaAdd(building({ catalogId: 'plop', level: 1 })));
    expect(renderer.upperBoxSlotsFor(1)).toHaveLength(0);
  });

  it('renders exactly 1 upper-box slot for a level-2 building, positioned per computeSetbacks', () => {
    const scene = new THREE.Scene();
    const e = entry({ level: 2, height: 20, footprint: { w: 1, d: 1 } });
    const renderer = new MassingRenderer(scene, flatHeightAt, [e]);
    renderer.apply(deltaAdd(building({ level: 2 })));

    const slots = renderer.upperBoxSlotsFor(1);
    expect(slots).toHaveLength(1);

    const { boxes } = computeSetbacks(e, 1);
    const upper = boxes[1]!;
    const m = new THREE.Matrix4();
    renderer.getBoxMatrix(slots[0]!, m);
    const { pos, scl } = decompose(m);

    const centerX = (5 + e.footprint.w / 2) * TILE_METERS;
    const centerZ = (5 + e.footprint.d / 2) * TILE_METERS;
    expect(pos.x).toBeCloseTo(centerX, 5);
    expect(pos.z).toBeCloseTo(centerZ, 5);
    expect(pos.y).toBeCloseTo(upper.yOffset + upper.h / 2, 5);
    expect(scl.x).toBeCloseTo(upper.w, 5);
    expect(scl.y).toBeCloseTo(upper.h, 5);
    expect(scl.z).toBeCloseTo(upper.d, 5);
  });

  it('renders exactly 2 upper-box slots for a level-3 building', () => {
    const scene = new THREE.Scene();
    const e = entry({ level: 3, height: 40 });
    const renderer = new MassingRenderer(scene, flatHeightAt, [e]);
    renderer.apply(deltaAdd(building({ level: 3 })));
    expect(renderer.upperBoxSlotsFor(1)).toHaveLength(2);
  });

  it('follows ground height at the footprint center', () => {
    const heightAt = (): number => 8;
    const scene = new THREE.Scene();
    const e = entry({ level: 2, height: 20 });
    const renderer = new MassingRenderer(scene, heightAt, [e]);
    renderer.apply(deltaAdd(building({ level: 2 })));
    const slot = renderer.upperBoxSlotsFor(1)[0]!;
    const m = new THREE.Matrix4();
    renderer.getBoxMatrix(slot, m);
    const { pos } = decompose(m);
    const { boxes } = computeSetbacks(e, 1);
    const upper = boxes[1]!;
    expect(pos.y).toBeCloseTo(8 + upper.yOffset + upper.h / 2, 5);
  });

  it('rotates the upper box by rotation * 90 degrees about Y, matching the base instancer convention', () => {
    const scene = new THREE.Scene();
    const e = entry({ level: 2, height: 20 });
    const renderer = new MassingRenderer(scene, flatHeightAt, [e]);
    renderer.apply(deltaAdd(building({ level: 2, rotation: 1 })));
    const slot = renderer.upperBoxSlotsFor(1)[0]!;
    const m = new THREE.Matrix4();
    renderer.getBoxMatrix(slot, m);
    const { quat } = decompose(m);
    const expected = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.PI / 2,
    );
    expect(quat.angleTo(expected)).toBeLessThan(1e-6);
  });

  it('tints the wall color using facade.ts wallColor for Active buildings', () => {
    const scene = new THREE.Scene();
    const e = entry({ level: 2, height: 20, color: 0x336699 });
    const renderer = new MassingRenderer(scene, flatHeightAt, [e]);
    renderer.apply(deltaAdd(building({ level: 2, id: 9 })));
    const slot = renderer.upperBoxSlotsFor(9)[0]!;
    const c = new THREE.Color();
    renderer.getBoxColor(slot, c);

    const { wallColor } = deriveFacadeParams(e, 9);
    expect(c.r).toBeCloseTo(wallColor[0], 4);
    expect(c.g).toBeCloseTo(wallColor[1], 4);
    expect(c.b).toBeCloseTo(wallColor[2], 4);
  });

  it('scales Constructing buildings height (and yOffset) by 0.25 and tints grey', () => {
    const scene = new THREE.Scene();
    const e = entry({ level: 2, height: 20, color: 0xffffff });
    const renderer = new MassingRenderer(scene, flatHeightAt, [e]);
    renderer.apply(deltaAdd(building({ level: 2, state: BuildingState.Constructing })));

    const slot = renderer.upperBoxSlotsFor(1)[0]!;
    const m = new THREE.Matrix4();
    renderer.getBoxMatrix(slot, m);
    const { pos, scl } = decompose(m);

    const { boxes } = computeSetbacks(e, 1);
    const upper = boxes[1]!;
    expect(scl.x).toBeCloseTo(upper.w, 5); // footprint is NOT scaled during construction
    expect(scl.y).toBeCloseTo(upper.h * 0.25, 5);
    expect(pos.y).toBeCloseTo((upper.yOffset + upper.h / 2) * 0.25, 5);

    const c = new THREE.Color();
    renderer.getBoxColor(slot, c);
    const { wallColor } = deriveFacadeParams(e, 1);
    expect(c.r).toBeCloseTo(wallColor[0] * 0.55, 4);
    expect(c.g).toBeCloseTo(wallColor[1] * 0.55, 4);
    expect(c.b).toBeCloseTo(wallColor[2] * 0.55, 4);
  });

  it('tints Abandoned buildings dark (0.25x)', () => {
    const scene = new THREE.Scene();
    const e = entry({ level: 2, height: 20, color: 0xffffff });
    const renderer = new MassingRenderer(scene, flatHeightAt, [e]);
    renderer.apply(deltaAdd(building({ level: 2, state: BuildingState.Abandoned })));
    const slot = renderer.upperBoxSlotsFor(1)[0]!;
    const c = new THREE.Color();
    renderer.getBoxColor(slot, c);
    const { wallColor } = deriveFacadeParams(e, 1);
    expect(c.r).toBeCloseTo(wallColor[0] * 0.25, 4);
    expect(c.g).toBeCloseTo(wallColor[1] * 0.25, 4);
    expect(c.b).toBeCloseTo(wallColor[2] * 0.25, 4);
  });

  it('removal frees exactly the removed building slots (zero-scale), leaving other buildings intact', () => {
    const scene = new THREE.Scene();
    const e = entry({ level: 3, height: 40 });
    const renderer = new MassingRenderer(scene, flatHeightAt, [e]);
    renderer.apply(
      deltaAdd(
        building({ id: 1, x: 0, z: 0, level: 3 }),
        building({ id: 2, x: 10, z: 10, level: 3 }),
      ),
    );

    const slotsA = [...renderer.upperBoxSlotsFor(1)];
    const slotsB = [...renderer.upperBoxSlotsFor(2)];
    expect(slotsA).toHaveLength(2);
    expect(slotsB).toHaveLength(2);

    renderer.apply(deltaRemove(1));
    expect(renderer.upperBoxSlotsFor(1)).toHaveLength(0);
    expect([...renderer.upperBoxSlotsFor(2)]).toEqual(slotsB);

    const m = new THREE.Matrix4();
    for (const slot of slotsA) {
      renderer.getBoxMatrix(slot, m);
      expect(isZeroScale(m)).toBe(true);
    }
  });

  it('recycles freed slots on the next add instead of growing unboundedly', () => {
    const scene = new THREE.Scene();
    const e = entry({ level: 2, height: 20 });
    const renderer = new MassingRenderer(scene, flatHeightAt, [e]);
    renderer.apply(deltaAdd(building({ id: 1, x: 0, z: 0, level: 2 })));
    const before = renderer.instanceCount();

    renderer.apply(deltaRemove(1));
    renderer.apply(deltaAdd(building({ id: 2, x: 10, z: 10, level: 2 })));
    expect(renderer.instanceCount()).toBe(before);
  });

  it('an update that migrates a building to a higher-level catalog entry grows its slot count from 0 to 2 (levels are catalog-driven, per buildings.ts convention)', () => {
    const scene = new THREE.Scene();
    const e1 = entry({ id: 'e-lvl1', level: 1, height: 10 });
    const e3 = entry({ id: 'e-lvl3', level: 3, height: 40 });
    const renderer = new MassingRenderer(scene, flatHeightAt, [e1, e3]);
    renderer.apply(deltaAdd(building({ catalogId: 'e-lvl1', level: 1 })));
    expect(renderer.upperBoxSlotsFor(1)).toHaveLength(0);

    // Real growth re-emits the SAME building id under a different catalogId
    // (buildings.ts's own "migrates an id to a different bucket" behavior);
    // massing reads the LEVEL FROM THE CATALOG ENTRY, not instance.level.
    renderer.apply(deltaUpdate(building({ catalogId: 'e-lvl3', level: 3 })));
    expect(renderer.upperBoxSlotsFor(1)).toHaveLength(2);
  });

  it('setNightFactor defaults to 0 and clamps to [0,1]', () => {
    const scene = new THREE.Scene();
    const renderer = new MassingRenderer(scene, flatHeightAt, [entry()]);
    expect(renderer.nightFactor()).toBe(0);
    renderer.setNightFactor(1.5);
    expect(renderer.nightFactor()).toBe(1);
    renderer.setNightFactor(-1);
    expect(renderer.nightFactor()).toBe(0);
    renderer.setNightFactor(0.37);
    expect(renderer.nightFactor()).toBeCloseTo(0.37, 9);
  });

  it('does not throw and renders zero slots for an unknown catalogId', () => {
    const scene = new THREE.Scene();
    const renderer = new MassingRenderer(scene, flatHeightAt, []);
    expect(() => renderer.apply(deltaAdd(building({ catalogId: 'nope' })))).not.toThrow();
    expect(renderer.upperBoxSlotsFor(1)).toHaveLength(0);
  });

  it('adds exactly one InstancedMesh to the scene regardless of catalog size', () => {
    const scene = new THREE.Scene();
    const renderer = new MassingRenderer(scene, flatHeightAt, [
      entry({ id: 'a' }),
      entry({ id: 'b', level: 3 }),
    ]);
    renderer.apply(
      deltaAdd(
        building({ catalogId: 'a', level: 2 }),
        building({ id: 2, catalogId: 'b', level: 3, x: 20 }),
      ),
    );
    expect(scene.children.filter((c) => c instanceof THREE.InstancedMesh)).toHaveLength(1);
  });

  it('constructs and applies against the full production catalog without throwing', () => {
    const realCatalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
    const scene = new THREE.Scene();
    const renderer = new MassingRenderer(scene, flatHeightAt, realCatalog);
    const added = realCatalog.map((catalogEntry, i) =>
      building({ id: i + 1, catalogId: catalogEntry.id, x: i * 6, level: catalogEntry.level ?? 1 }),
    );
    expect(() => renderer.apply(deltaAdd(...added))).not.toThrow();

    // res-high-3 is level 3 in the real catalog -> exactly 2 upper-box slots.
    const towerIndex = realCatalog.findIndex((c) => c.id === 'res-high-3');
    expect(towerIndex).toBeGreaterThanOrEqual(0);
    expect(renderer.upperBoxSlotsFor(towerIndex + 1)).toHaveLength(2);
  });
});

describe('MassingRenderer frontage setback (optional roadAt)', () => {
  const COM = entry({ category: 'com', zone: 3, footprint: { w: 2, d: 2 }, level: 2, height: 20 });

  it('shifts the upper tiers with the set-back body when the com lot faces a road', () => {
    const roadAt = roadAtTiles([[5, 4]]); // N of the footprint at (5,5)
    const scene = new THREE.Scene();
    const renderer = new MassingRenderer(scene, flatHeightAt, [COM], roadAt);
    renderer.apply(deltaAdd(building({ level: 2 })));

    const frontage = frontageSetbackFor(COM, 5, 5, roadAt);
    const { boxes } = computeSetbacks(COM, 1, frontage);
    const upper = boxes[1]!;

    const slot = renderer.upperBoxSlotsFor(1)[0]!;
    const m = new THREE.Matrix4();
    renderer.getBoxMatrix(slot, m);
    const { pos, scl } = decompose(m);
    expect(pos.x).toBeCloseTo((5 + 1) * TILE_METERS, 5);
    expect(pos.z).toBeCloseTo((5 + 1) * TILE_METERS + frontage.centerZM, 5);
    expect(scl.x).toBeCloseTo(upper.w, 5);
    expect(scl.z).toBeCloseTo(upper.d, 5);
  });

  it('with roadAt present but no road nearby, tiers match the no-roadAt renderer exactly', () => {
    const withRoadAt = new MassingRenderer(new THREE.Scene(), flatHeightAt, [COM], noRoad);
    const withoutRoadAt = new MassingRenderer(new THREE.Scene(), flatHeightAt, [COM]);
    withRoadAt.apply(deltaAdd(building({ level: 2 })));
    withoutRoadAt.apply(deltaAdd(building({ level: 2 })));

    const mA = new THREE.Matrix4();
    const mB = new THREE.Matrix4();
    withRoadAt.getBoxMatrix(withRoadAt.upperBoxSlotsFor(1)[0]!, mA);
    withoutRoadAt.getBoxMatrix(withoutRoadAt.upperBoxSlotsFor(1)[0]!, mB);
    expect(mA.elements).toEqual(mB.elements);
  });

  it('leaves a road-adjacent RES building untouched even with roadAt wired', () => {
    const res = entry({ category: 'res', footprint: { w: 2, d: 2 }, level: 2, height: 20 });
    const withRoad = new MassingRenderer(
      new THREE.Scene(),
      flatHeightAt,
      [res],
      roadAtTiles([[5, 4]]),
    );
    const withoutRoad = new MassingRenderer(new THREE.Scene(), flatHeightAt, [res]);
    withRoad.apply(deltaAdd(building({ level: 2 })));
    withoutRoad.apply(deltaAdd(building({ level: 2 })));

    const mA = new THREE.Matrix4();
    const mB = new THREE.Matrix4();
    withRoad.getBoxMatrix(withRoad.upperBoxSlotsFor(1)[0]!, mA);
    withoutRoad.getBoxMatrix(withoutRoad.upperBoxSlotsFor(1)[0]!, mB);
    expect(mA.elements).toEqual(mB.elements);
  });
});

// ---------------------------------------------------------------------------
// Frustum-culling regression: three.js caches an
// InstancedMesh's boundingSphere the first time Frustum.intersectsObject sees
// it. A pool rendered while empty caches an EMPTY sphere at the world origin
// and everything committed later is culled forever unless the commit
// invalidates it.
// ---------------------------------------------------------------------------

describe('InstancedSlotPool bounding-sphere invalidation', () => {
  it('commit() nulls a bounding sphere cached while the pool was empty', () => {
    const scene = new THREE.Scene();
    const pool = new InstancedSlotPool(
      scene,
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
      4,
    );
    // Simulate the renderer's first cull pass, which computes + caches the
    // (empty) sphere while count is still 0.
    pool.getMesh().computeBoundingSphere();
    expect(pool.getMesh().boundingSphere).not.toBeNull();

    const slot = pool.allocate();
    pool.setMatrixAt(slot, new THREE.Matrix4().makeTranslation(2000, 10, 2000));
    pool.commit();
    expect(pool.getMesh().boundingSphere).toBeNull();
  });
});
