import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  bodyFillFor,
  bodyMetresFor,
  computeSetbacks,
  DEFAULT_BODY_M_PER_TILE,
  frontageSetbackFor,
  InstancedSlotPool,
  massingLifecycleTint,
  MassingRenderer,
  MASSING_FOOTPRINT_SHRINK,
  MAX_FOOTPRINT_FILL,
  MAX_SETBACK_INSET,
  MIN_SETBACK_INSET,
  DETACHED_BODY_MIN_M,
  RES_LOW_BODY_M_PER_TILE,
  tierCountOf,
} from './massing';
import { lotPlanFor, lotPointToWorld } from './lotplan';
import { bodyPlateM2 } from '../shared/floorarea';
import { deriveFacadeParams, FLOOR_HEIGHT_METERS } from './facade';
import {
  BuildingCatalogEntry,
  BuildingDelta,
  BuildingInstance,
  BuildingKind,
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

  it('stacks the boxes bottom-to-top with no gap or overlap, the top tier reaching the roof exactly', () => {
    for (const level of [1, 2, 3]) {
      for (const height of [4.7, 5, 12, 30, 46.5]) {
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

  it('returns exactly 1 box for a house of any level, whose pitched roof has nowhere to step', () => {
    for (const kind of ['detached', 'duplex', 'fourplex', 'townhouse'] as const) {
      for (const level of [2, 3]) {
        const { boxes } = computeSetbacks(entry({ level, height: 12, kind }), 3);
        expect(boxes).toHaveLength(1);
        expect(boxes[0]!.h).toBeCloseTo(12, 9);
      }
    }
    expect(computeSetbacks(entry({ level: 3, height: 30, kind: 'garden' }), 3).boxes).toHaveLength(
      3,
    );
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
// frontageSetbackFor (pure) — where the car park laid to code leaves the body
// ---------------------------------------------------------------------------

/** The body's world centre the lot plan puts it at, as a shift from the lot's centre. */
function planShift(
  e: BuildingCatalogEntry,
  roadAt: (x: number, z: number) => boolean,
  rotation: 0 | 1 | 2 | 3 = 0,
): { x: number; z: number } {
  const plan = lotPlanFor(e, 5, 5, roadAt, rotation)!;
  const { body } = plan.layout;
  const at = lotPointToWorld(plan.frame, (body.u0 + body.u1) / 2, (body.v0 + body.v1) / 2);
  const lot = rotation % 2 === 1 ? { w: e.footprint.d, d: e.footprint.w } : e.footprint;
  return { x: at.x - (5 + lot.w / 2) * TILE_METERS, z: at.z - (5 + lot.d / 2) * TILE_METERS };
}

describe('frontageSetbackFor', () => {
  // A 2x2 works at (5,5). Its car park is laid to code; the body slides where
  // the layout leaves it room and is never cut, so no span ever comes off.
  const com = entry({ category: 'ind', zone: 5, kind: 'workshop', footprint: { w: 2, d: 2 } });

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

  const sides = [
    ['N', roadAtTiles([[5, 4]])],
    ['S', roadAtTiles([[5, 7]])],
    ['E', roadAtTiles([[7, 5]])],
    ['W', roadAtTiles([[4, 5]])],
  ] as const;

  it.each(sides)(
    '%s-side road: cuts nothing and moves the body where its lot plan puts it',
    (_, roadAt) => {
      const shift = planShift(com, roadAt);
      expectSetback(frontageSetbackFor(com, 5, 5, roadAt), {
        spanXM: 0,
        spanZM: 0,
        centerXM: shift.x,
        centerZM: shift.z,
      });
    },
  );

  it('slides the body away from the road, never toward it', () => {
    expect(frontageSetbackFor(com, 5, 5, roadAtTiles([[5, 4]])).centerZM).toBeGreaterThan(0);
    expect(frontageSetbackFor(com, 5, 5, roadAtTiles([[5, 7]])).centerZM).toBeLessThan(0);
    expect(frontageSetbackFor(com, 5, 5, roadAtTiles([[7, 5]])).centerXM).toBeLessThan(0);
    expect(frontageSetbackFor(com, 5, 5, roadAtTiles([[4, 5]])).centerXM).toBeGreaterThan(0);
  });

  it('keeps the whole body on its lot', () => {
    const body = bodyMetresFor(com);
    for (const [, roadAt] of sides) {
      const s = frontageSetbackFor(com, 5, 5, roadAt);
      const cx = 6 * TILE_METERS + s.centerXM;
      const cz = 6 * TILE_METERS + s.centerZM;
      expect(cx - body.w / 2).toBeGreaterThanOrEqual(5 * TILE_METERS - 1e-9);
      expect(cx + body.w / 2).toBeLessThanOrEqual(7 * TILE_METERS + 1e-9);
      expect(cz - body.d / 2).toBeGreaterThanOrEqual(5 * TILE_METERS - 1e-9);
      expect(cz + body.d / 2).toBeLessThanOrEqual(7 * TILE_METERS + 1e-9);
    }
  });

  it('stands a downtown office centred: it parks at the kerb', () => {
    const office = entry({ category: 'com', zone: 4, kind: 'office', footprint: { w: 2, d: 2 } });
    expect(frontageSetbackFor(office, 5, 5, roadAtTiles([[5, 4]]))).toEqual({
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

  it('keeps the base tier the whole plate its floor area is counted on', () => {
    const frontage = frontageSetbackFor(com, 5, 5, roadAtTiles([[5, 4]]));
    const { boxes } = computeSetbacks(com, 7, frontage);
    const plate = bodyMetresFor(com);
    expect(boxes[0]!.w).toBeCloseTo(plate.w, 9);
    expect(boxes[0]!.d).toBeCloseTo(plate.d, 9);
    expect(boxes[0]!.w * boxes[0]!.d).toBeCloseTo(bodyPlateM2(com), 9);
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

  it('renders no slot for the tiers of a level-2 or level-3 building, which are the body instancer’s', () => {
    const scene = new THREE.Scene();
    const two = entry({ id: 'two', level: 2, height: 20 });
    const three = entry({ id: 'three', level: 3, height: 40 });
    const renderer = new MassingRenderer(scene, flatHeightAt, [two, three]);
    renderer.apply(
      deltaAdd(
        building({ id: 1, catalogId: 'two', level: 2 }),
        building({ id: 2, catalogId: 'three', level: 3, x: 10, z: 10 }),
      ),
    );
    expect(renderer.upperBoxSlotsFor(1)).toHaveLength(0);
    expect(renderer.upperBoxSlotsFor(2)).toHaveLength(0);
    expect(renderer.instanceCount()).toBe(0);
  });

  /** A tower on its podium: the one thing the renderer still draws. */
  const tower = (overrides: Partial<BuildingCatalogEntry> = {}): BuildingCatalogEntry =>
    entry({ kind: 'tower', level: 3, height: 40, footprint: { w: 2, d: 2 }, ...overrides });

  it('renders exactly 1 slot for a tower, its podium, positioned per computeSetbacks', () => {
    const scene = new THREE.Scene();
    const e = tower();
    const renderer = new MassingRenderer(scene, flatHeightAt, [e]);
    renderer.apply(deltaAdd(building({ level: 3 })));

    const slots = renderer.upperBoxSlotsFor(1);
    expect(slots).toHaveLength(1);

    const { podium } = computeSetbacks(e, 1);
    const m = new THREE.Matrix4();
    renderer.getBoxMatrix(slots[0]!, m);
    const { pos, scl } = decompose(m);

    const centerX = (5 + e.footprint.w / 2) * TILE_METERS;
    const centerZ = (5 + e.footprint.d / 2) * TILE_METERS;
    expect(pos.x).toBeCloseTo(centerX, 5);
    expect(pos.z).toBeCloseTo(centerZ, 5);
    expect(pos.y).toBeCloseTo(podium!.yOffset + podium!.h / 2, 5);
    expect(scl.x).toBeCloseTo(podium!.w, 5);
    expect(scl.y).toBeCloseTo(podium!.h, 5);
    expect(scl.z).toBeCloseTo(podium!.d, 5);
  });

  it('follows ground height at the footprint center', () => {
    const heightAt = (): number => 8;
    const scene = new THREE.Scene();
    const e = tower();
    const renderer = new MassingRenderer(scene, heightAt, [e]);
    renderer.apply(deltaAdd(building({ level: 3 })));
    const slot = renderer.upperBoxSlotsFor(1)[0]!;
    const m = new THREE.Matrix4();
    renderer.getBoxMatrix(slot, m);
    const { pos } = decompose(m);
    const { podium } = computeSetbacks(e, 1);
    expect(pos.y).toBeCloseTo(8 + podium!.yOffset + podium!.h / 2, 5);
  });

  it('rotates the podium by rotation * 90 degrees about Y, matching the base instancer convention', () => {
    const scene = new THREE.Scene();
    const e = tower();
    const renderer = new MassingRenderer(scene, flatHeightAt, [e]);
    renderer.apply(deltaAdd(building({ level: 3, rotation: 1 })));
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
    const e = tower({ color: 0x336699 });
    const renderer = new MassingRenderer(scene, flatHeightAt, [e]);
    renderer.apply(deltaAdd(building({ level: 3, id: 9 })));
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
    const e = tower({ color: 0xffffff });
    const renderer = new MassingRenderer(scene, flatHeightAt, [e]);
    renderer.apply(deltaAdd(building({ level: 3, state: BuildingState.Constructing })));

    const slot = renderer.upperBoxSlotsFor(1)[0]!;
    const m = new THREE.Matrix4();
    renderer.getBoxMatrix(slot, m);
    const { pos, scl } = decompose(m);

    const { podium } = computeSetbacks(e, 1);
    expect(scl.x).toBeCloseTo(podium!.w, 5); // footprint is NOT scaled during construction
    expect(scl.y).toBeCloseTo(podium!.h * 0.25, 5);
    expect(pos.y).toBeCloseTo((podium!.yOffset + podium!.h / 2) * 0.25, 5);

    const c = new THREE.Color();
    renderer.getBoxColor(slot, c);
    const { wallColor } = deriveFacadeParams(e, 1);
    expect(c.r).toBeCloseTo(wallColor[0] * 0.55, 4);
    expect(c.g).toBeCloseTo(wallColor[1] * 0.55, 4);
    expect(c.b).toBeCloseTo(wallColor[2] * 0.55, 4);
  });

  it('tints Abandoned buildings dark (0.25x)', () => {
    const scene = new THREE.Scene();
    const e = tower({ color: 0xffffff });
    const renderer = new MassingRenderer(scene, flatHeightAt, [e]);
    renderer.apply(deltaAdd(building({ level: 3, state: BuildingState.Abandoned })));
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
    const e = tower();
    const renderer = new MassingRenderer(scene, flatHeightAt, [e]);
    renderer.apply(
      deltaAdd(
        building({ id: 1, x: 0, z: 0, level: 3 }),
        building({ id: 2, x: 10, z: 10, level: 3 }),
      ),
    );

    const slotsA = [...renderer.upperBoxSlotsFor(1)];
    const slotsB = [...renderer.upperBoxSlotsFor(2)];
    expect(slotsA).toHaveLength(1);
    expect(slotsB).toHaveLength(1);

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
    const e = tower();
    const renderer = new MassingRenderer(scene, flatHeightAt, [e]);
    renderer.apply(deltaAdd(building({ id: 1, x: 0, z: 0, level: 3 })));
    const before = renderer.instanceCount();

    renderer.apply(deltaRemove(1));
    renderer.apply(deltaAdd(building({ id: 2, x: 10, z: 10, level: 3 })));
    expect(renderer.instanceCount()).toBe(before);
  });

  it('an update that migrates a building to a tower entry grows its slot count from 0 to 1 (the kind is catalog-driven, per buildings.ts convention)', () => {
    const scene = new THREE.Scene();
    const e1 = entry({ id: 'e-lvl1', level: 1, height: 10 });
    const e3 = tower({ id: 'e-tower' });
    const renderer = new MassingRenderer(scene, flatHeightAt, [e1, e3]);
    renderer.apply(deltaAdd(building({ catalogId: 'e-lvl1', level: 1 })));
    expect(renderer.upperBoxSlotsFor(1)).toHaveLength(0);

    // Real growth re-emits the SAME building id under a different catalogId
    // (buildings.ts's own "migrates an id to a different bucket" behavior);
    // massing reads the KIND FROM THE CATALOG ENTRY, not instance.level.
    renderer.apply(deltaUpdate(building({ catalogId: 'e-tower', level: 3 })));
    expect(renderer.upperBoxSlotsFor(1)).toHaveLength(1);
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

    // Every tier is the body instancer's; only a tower's podium is drawn here.
    for (let i = 0; i < realCatalog.length; i++) {
      const expected = realCatalog[i]!.kind === 'tower' ? 1 : 0;
      expect(renderer.upperBoxSlotsFor(i + 1)).toHaveLength(expected);
    }
    expect(realCatalog.some((c) => c.kind === 'tower')).toBe(true);
  });
});

describe('MassingRenderer frontage setback (optional roadAt)', () => {
  const COM = entry({
    category: 'com',
    zone: 3,
    kind: 'tower',
    footprint: { w: 2, d: 2 },
    level: 3,
    height: 40,
  });

  it('shifts the podium with the set-back body when the com lot faces a road', () => {
    const roadAt = roadAtTiles([[5, 4]]); // N of the footprint at (5,5)
    const scene = new THREE.Scene();
    const renderer = new MassingRenderer(scene, flatHeightAt, [COM], roadAt);
    renderer.apply(deltaAdd(building({ level: 3 })));

    const frontage = frontageSetbackFor(COM, 5, 5, roadAt);
    const { podium } = computeSetbacks(COM, 1, frontage);

    const slot = renderer.upperBoxSlotsFor(1)[0]!;
    const m = new THREE.Matrix4();
    renderer.getBoxMatrix(slot, m);
    const { pos, scl } = decompose(m);
    expect(pos.x).toBeCloseTo((5 + 1) * TILE_METERS + frontage.centerXM, 5);
    expect(pos.z).toBeCloseTo((5 + 1) * TILE_METERS + frontage.centerZM, 5);
    expect(scl.x).toBeCloseTo(podium!.w, 5);
    expect(scl.z).toBeCloseTo(podium!.d, 5);
  });

  it('with roadAt present but no road nearby, the podium matches the no-roadAt renderer exactly', () => {
    const withRoadAt = new MassingRenderer(new THREE.Scene(), flatHeightAt, [COM], noRoad);
    const withoutRoadAt = new MassingRenderer(new THREE.Scene(), flatHeightAt, [COM]);
    withRoadAt.apply(deltaAdd(building({ level: 3 })));
    withoutRoadAt.apply(deltaAdd(building({ level: 3 })));

    const mA = new THREE.Matrix4();
    const mB = new THREE.Matrix4();
    withRoadAt.getBoxMatrix(withRoadAt.upperBoxSlotsFor(1)[0]!, mA);
    withoutRoadAt.getBoxMatrix(withoutRoadAt.upperBoxSlotsFor(1)[0]!, mB);
    expect(mA.elements).toEqual(mB.elements);
  });

  it('leaves a road-adjacent RES building untouched even with roadAt wired', () => {
    const res = entry({
      category: 'res',
      kind: 'tower',
      footprint: { w: 2, d: 2 },
      level: 3,
      height: 40,
    });
    const withRoad = new MassingRenderer(
      new THREE.Scene(),
      flatHeightAt,
      [res],
      roadAtTiles([[5, 4]]),
    );
    const withoutRoad = new MassingRenderer(new THREE.Scene(), flatHeightAt, [res]);
    withRoad.apply(deltaAdd(building({ level: 3 })));
    withoutRoad.apply(deltaAdd(building({ level: 3 })));

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

describe('a building keeps its real proportions whatever the tile measures', () => {
  const sized = (kind: BuildingKind | undefined, w = 1, d = 1): BuildingCatalogEntry =>
    ({ id: `e-${kind ?? 'plain'}`, kind, footprint: { w, d }, height: 10 }) as BuildingCatalogEntry;

  it('gives a body a size in metres rather than a share of the tile', () => {
    // The fill is only ever the last step. What is fixed is the body: a home
    // covers RES_LOW_BODY_M_PER_TILE of each lot tile, and resizing the grid
    // moves the fill so the building itself does not move.
    expect(bodyMetresFor(sized('detached', 3, 3)).w).toBeCloseTo(3 * RES_LOW_BODY_M_PER_TILE, 9);
    expect(bodyMetresFor(sized(undefined)).w).toBeCloseTo(DEFAULT_BODY_M_PER_TILE, 9);
    expect(bodyFillFor(sized('detached', 3, 3)).x * TILE_METERS).toBeCloseTo(
      (3 * RES_LOW_BODY_M_PER_TILE) / 3,
      9,
    );
  });

  it('stands a house on a half or a normal lot as wide as one on a double lot, and lets only the lot shrink', () => {
    for (const [w, d] of [
      [1, 1],
      [1, 2],
      [2, 2],
    ]) {
      const body = bodyMetresFor(sized('detached', w, d));
      expect(body.w).toBeCloseTo(DETACHED_BODY_MIN_M, 9);
      expect(body.d).toBeCloseTo(DETACHED_BODY_MIN_M, 9);
    }
    expect(bodyMetresFor(sized('detached', 2, 3)).d).toBeGreaterThan(DETACHED_BODY_MIN_M);
  });

  it('stands a house on an acre lot, 3 by 3 tiles, as 14.25 m square', () => {
    const body = bodyMetresFor(sized('detached', 3, 3));
    expect(body.w).toBeCloseTo(14.25, 9);
    expect(body.d).toBeCloseTo(14.25, 9);
  });

  it('keeps a detached home the narrower of the two, so a yard survives', () => {
    expect(RES_LOW_BODY_M_PER_TILE).toBeLessThan(DEFAULT_BODY_M_PER_TILE);
    expect(bodyMetresFor(sized('detached')).w).toBeLessThan(bodyMetresFor(sized(undefined)).w);
  });

  it('never lets a body fill its lot outright, however the tile is cut', () => {
    for (const kind of [
      'detached',
      'duplex',
      'fourplex',
      'multiplex',
      'tower',
      undefined,
    ] as const) {
      for (const [w, d] of [
        [1, 1],
        [1, 2],
        [2, 2],
        [3, 3],
      ]) {
        const fill = bodyFillFor(sized(kind, w, d));
        expect(fill.x).toBeGreaterThan(0);
        expect(fill.x).toBeLessThanOrEqual(MAX_FOOTPRINT_FILL);
        expect(fill.z).toBeGreaterThan(0);
        expect(fill.z).toBeLessThanOrEqual(MAX_FOOTPRINT_FILL);
      }
    }
  });

  it('sizes a duplex, a fourplex and a multiplex as the fixed buildings their types are', () => {
    // A duplex is 28-55 by 28-60 ft, a fourplex 34-56 by 32-60, a multiplex
    // 50-80 by 35-75: a share of a small lot, and no bigger on a big one.
    expect(bodyMetresFor(sized('duplex', 1, 2))).toEqual({ w: 12, d: 16 });
    expect(bodyMetresFor(sized('duplex', 2, 2))).toEqual({ w: 16, d: 16 });
    expect(bodyMetresFor(sized('fourplex', 1, 2))).toEqual({ w: 14, d: 18 });
    expect(bodyMetresFor(sized('fourplex', 2, 2))).toEqual({ w: 18, d: 18 });
    expect(bodyMetresFor(sized('multiplex', 2, 2))).toEqual({ w: 24, d: 24 });
    expect(bodyMetresFor(sized('multiplex', 2, 3))).toEqual({ w: 24, d: 24 });
  });

  it('sizes a townhouse row as three homes on one 20 m tile, upright and turned alike', () => {
    expect(bodyMetresFor(sized('townhouse', 1, 2))).toEqual({ w: 18, d: 18 });
    expect(bodyMetresFor(sized('townhouse', 2, 1))).toEqual({ w: 18, d: 18 });
  });

  it('keeps a restaurant a box on its car park and a filling station a kiosk behind its forecourt', () => {
    expect(bodyMetresFor(sized('restaurant', 1, 2))).toEqual({ w: 13.6, d: 24 });
    expect(bodyMetresFor(sized('restaurant', 2, 2))).toEqual({ w: 24, d: 24 });
    expect(bodyMetresFor(sized('restaurant', 3, 2))).toEqual({ w: 24, d: 24 });
    expect(bodyMetresFor(sized('fuel', 2, 2))).toEqual({ w: 14, d: 14 });
    expect(bodyMetresFor(sized('fuel', 3, 2))).toEqual({ w: 16, d: 14 });
    expect(bodyMetresFor(sized('fuel', 3, 3))).toEqual({ w: 16, d: 16 });
    // A strip and a supermarket fill their plates like any block.
    expect(bodyMetresFor(sized('strip', 5, 2))).toEqual({ w: 68, d: 27.2 });
  });

  it('sits a flex building in its car park and leaves a chemical plant half its site for the tank farm', () => {
    // ULI: R&D/flex covers 25–40% of its site, heavy manufacturing 40–50%; a
    // warehouse fills its plate like any block, at the default's 46%.
    expect(bodyMetresFor(sized('flex', 2, 2))).toEqual({ w: 22, d: 22 });
    expect(bodyMetresFor(sized('flex', 3, 4))).toEqual({ w: 33, d: 44 });
    expect(bodyMetresFor(sized('chemical', 3, 3))).toEqual({ w: 30, d: 30 });
    expect(bodyMetresFor(sized('chemical', 5, 4))).toEqual({ w: 50, d: 40 });
    expect(bodyMetresFor(sized('warehouse', 5, 4))).toEqual({ w: 68, d: 54.4 });
    expect(bodyMetresFor(sized('metals', 5, 3))).toEqual({ w: 68, d: 40.8 });
  });

  it('stands a storey tall against a plan that is no longer stretched under it', () => {
    // The complaint this answers: heights are real metres and never scaled, so
    // when the plan grew with the tile every building flattened by the ratio.
    // A 3.2 m storey against a one-tile home is the proportion to hold.
    // The smallest ResLow the catalogue grows stands on a two-tile lot, so a
    // frontage is two of these. Anchored against the 4.0 m car at the kerb, a
    // detached home is 9-14 m across the front — wider than that and it reads
    // as a hall, whatever the roof on top says.
    const frontageM = bodyMetresFor(sized('detached', 2, 2)).w;
    expect(frontageM).toBeCloseTo(2 * RES_LOW_BODY_M_PER_TILE, 9);
    expect(frontageM).toBeGreaterThanOrEqual(9);
    expect(frontageM).toBeLessThanOrEqual(14);
    // And it is never taller in plan than the biggest ResLow lot allows.
    expect(bodyMetresFor(sized('detached', 3, 3)).w).toBeLessThanOrEqual(15);
  });
});

describe('a high-density block houses what its drawn floor area holds', () => {
  const NET_TO_GROSS = 0.85;
  const APARTMENT_M2 = 93;
  const STEP_INSET = (MIN_SETBACK_INSET + MAX_SETBACK_INSET) / 2;
  const blocks = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings.filter(
    (e) => e.kind === 'midrise' || e.kind === 'tower' || e.kind === 'mixed',
  );

  // Homes in the stacked body: equal storeys per tier, each tier inset on both
  // axes; a mixed block's ground storey is shops, so it holds no homes.
  const expectedHomes = (e: BuildingCatalogEntry): number => {
    const body = bodyMetresFor(e);
    const tiers = tierCountOf(e);
    const storeysPerTier = e.height / FLOOR_HEIGHT_METERS / tiers;
    let floorAreaM2 = 0;
    for (let tier = 0; tier < tiers; tier++) {
      const plate = body.w * body.d * (1 - STEP_INSET) ** (2 * tier);
      const homeStoreys = tier === 0 && e.kind === 'mixed' ? storeysPerTier - 1 : storeysPerTier;
      floorAreaM2 += plate * homeStoreys;
    }
    return Math.round((floorAreaM2 * NET_TO_GROSS) / APARTMENT_M2);
  };

  it('covers every mid-rise, tower and mixed-use block', () => {
    expect(blocks).toHaveLength(9);
  });

  it.each(blocks.map((e) => [e.id, e] as const))('%s', (id, e) => {
    expect(e.units, id).toBe(expectedHomes(e));
  });
});

describe('a tower stands on a podium', () => {
  const tower = (level: number): BuildingCatalogEntry =>
    ({
      id: `tower-${level}`,
      kind: 'tower',
      level,
      footprint: { w: 2, d: 2 },
      height: 38.4,
    }) as BuildingCatalogEntry;

  it('adds a two-storey tier at ground that fills the lot to the ceiling, under the slab', () => {
    const { boxes, podium } = computeSetbacks(tower(1), 7);
    expect(boxes).toHaveLength(1);
    expect(podium).toEqual({
      w: 2 * TILE_METERS * MAX_FOOTPRINT_FILL,
      d: 2 * TILE_METERS * MAX_FOOTPRINT_FILL,
      h: 2 * FLOOR_HEIGHT_METERS,
      yOffset: 0,
    });
    expect(podium!.w).toBeGreaterThan(boxes[0]!.w);
  });

  it('keeps the podium out of the bay row the slab keeps out of', () => {
    const frontage = { spanXM: 0, spanZM: 4, centerXM: 0, centerZM: 2 };
    const { podium } = computeSetbacks(tower(2), 7, frontage);
    expect(podium!.d).toBeCloseTo(2 * TILE_METERS * MAX_FOOTPRINT_FILL - 4, 9);
  });

  it('gives no podium to a block that is not a tower', () => {
    expect(computeSetbacks({ ...tower(1), kind: 'midrise' }, 7).podium).toBeUndefined();
  });
});

describe('frontageSetbackFor on a building turned a quarter', () => {
  const shop = entry({ category: 'com', zone: 3, footprint: { w: 1, d: 2 } });
  // Turned, the 1x2 lot lies 2 tiles along x and 1 along z; a road down its west edge.
  const westRoad = roadAtTiles([[4, 5]]);
  const body = bodyMetresFor(shop);

  it('finds the road-facing edge on the turned lot, not the upright one', () => {
    // Upright the lot holds (5,5) and (5,6), so (6,4) is nowhere near it; turned
    // it holds (5,5) and (6,5), and (6,4) is its north neighbour.
    const roadAbove = roadAtTiles([[6, 4]]);
    expect(frontageSetbackFor(shop, 5, 5, roadAbove, undefined, 0)).toEqual({
      spanXM: 0,
      spanZM: 0,
      centerXM: 0,
      centerZM: 0,
    });
    const turned = frontageSetbackFor(shop, 5, 5, roadAbove, undefined, 1);
    expect(Math.hypot(turned.centerXM, turned.centerZM)).toBeGreaterThan(0);
    expect(turned.centerXM).toBeCloseTo(planShift(shop, roadAbove, 1).x, 9);
  });

  it('shifts the centre where the turned lot plan puts it, on the map, and cuts nothing', () => {
    const setback = frontageSetbackFor(shop, 5, 5, westRoad, undefined, 1);
    const shift = planShift(shop, westRoad, 1);
    expect(setback.centerXM).toBeCloseTo(shift.x, 9);
    expect(setback.centerZM).toBeCloseTo(shift.z, 9);
    expect(setback.centerXM).toBeGreaterThanOrEqual(0);
    expect(setback.spanXM).toBe(0);
    expect(setback.spanZM).toBe(0);
    const { boxes } = computeSetbacks(shop, 1, setback);
    expect(boxes[0]!.w).toBeCloseTo(body.w, 9);
    expect(boxes[0]!.d).toBeCloseTo(body.d, 9);
  });

  it('leaves the stand-off from the road the same as the upright building facing it', () => {
    // Upright 1x2 lot with the road on its north edge.
    const upright = frontageSetbackFor(shop, 5, 5, roadAtTiles([[5, 4]]), undefined, 0);
    const turned = frontageSetbackFor(shop, 5, 5, westRoad, undefined, 1);
    expect(turned.spanZM).toBeCloseTo(upright.spanZM, 9);
    expect(turned.centerXM).toBeCloseTo(upright.centerZM, 9);
  });
});
