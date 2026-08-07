import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  computeCornerOffset,
  computePropPlacement,
  computeRoofPropCount,
  computeSiloClusterPlacements,
  hasAntenna,
  MIN_SILO_FOOTPRINT_TILES,
  MIN_SMOKESTACK_LEVEL,
  PropKind,
  ROOF_PROP_AREA_MAX_TILES,
  ROOF_PROP_AREA_MIN_TILES,
  ROOF_PROP_COUNT_BASE_MAX,
  ROOF_PROP_COUNT_BONUS_MAX,
  ROOF_PROP_COUNT_MIN,
  RoofPropRenderer,
  roofAreaTiles,
  rotateLocalOffset,
  SILO_CLUSTER_MAX,
  SILO_CLUSTER_MIN,
  siloClusterCount,
  siloCorner,
  smokestackCorner,
} from './props';
import { computeSetbacks, frontageSetbackFor, SetbackBox } from './massing';
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
    height: 10,
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
function deltaRemove(...ids: number[]): BuildingDelta {
  return { added: [], removed: ids, updated: [] };
}

function isZeroScale(m: THREE.Matrix4): boolean {
  const e = m.elements;
  return e[0] === 0 && e[5] === 0 && e[10] === 0;
}

function decompose(m: THREE.Matrix4) {
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  m.decompose(pos, quat, scl);
  return { pos, quat, scl };
}

function box(overrides: Partial<SetbackBox> = {}): SetbackBox {
  return { w: 40, d: 40, h: 10, yOffset: 0, ...overrides };
}

// ---------------------------------------------------------------------------
// roofAreaTiles (pure)
// ---------------------------------------------------------------------------

describe('roofAreaTiles', () => {
  it('is 1 for a box exactly TILE_METERS on a side', () => {
    expect(roofAreaTiles(box({ w: TILE_METERS, d: TILE_METERS }))).toBeCloseTo(1, 9);
  });

  it('scales quadratically with a uniformly larger box', () => {
    expect(roofAreaTiles(box({ w: TILE_METERS * 2, d: TILE_METERS * 2 }))).toBeCloseTo(4, 9);
  });
});

// ---------------------------------------------------------------------------
// computeRoofPropCount (pure)
// ---------------------------------------------------------------------------

describe('computeRoofPropCount', () => {
  it('is exactly ROOF_PROP_COUNT_MIN at/below the minimum area, for every building id', () => {
    for (let id = 0; id < 30; id++) {
      expect(computeRoofPropCount(ROOF_PROP_AREA_MIN_TILES, id)).toBe(ROOF_PROP_COUNT_MIN);
      expect(computeRoofPropCount(0, id)).toBe(ROOF_PROP_COUNT_MIN);
      expect(computeRoofPropCount(-5, id)).toBe(ROOF_PROP_COUNT_MIN);
    }
  });

  it('lands in the 4-6 "big slab" range at/above the maximum area', () => {
    for (let id = 0; id < 50; id++) {
      const count = computeRoofPropCount(ROOF_PROP_AREA_MAX_TILES, id);
      expect(count).toBeGreaterThanOrEqual(ROOF_PROP_COUNT_BASE_MAX);
      expect(count).toBeLessThanOrEqual(ROOF_PROP_COUNT_BASE_MAX + ROOF_PROP_COUNT_BONUS_MAX);
    }
    // Also comfortably above the threshold, in case of a non-monotonic slip.
    for (let id = 0; id < 50; id++) {
      const count = computeRoofPropCount(ROOF_PROP_AREA_MAX_TILES * 3, id);
      expect(count).toBeGreaterThanOrEqual(4);
      expect(count).toBeLessThanOrEqual(6);
    }
  });

  it('varies the "big slab" count across building ids (the 4-6 spread is real, not always 4)', () => {
    const seen = new Set<number>();
    for (let id = 0; id < 60; id++) seen.add(computeRoofPropCount(ROOF_PROP_AREA_MAX_TILES, id));
    expect(seen.size).toBeGreaterThan(1);
    for (const v of seen) {
      expect(v).toBeGreaterThanOrEqual(4);
      expect(v).toBeLessThanOrEqual(6);
    }
  });

  it('increases (non-strictly) as area grows from the min to the max threshold', () => {
    const samples = [
      ROOF_PROP_AREA_MIN_TILES,
      ROOF_PROP_AREA_MIN_TILES + (ROOF_PROP_AREA_MAX_TILES - ROOF_PROP_AREA_MIN_TILES) * 0.25,
      ROOF_PROP_AREA_MIN_TILES + (ROOF_PROP_AREA_MAX_TILES - ROOF_PROP_AREA_MIN_TILES) * 0.5,
      ROOF_PROP_AREA_MIN_TILES + (ROOF_PROP_AREA_MAX_TILES - ROOF_PROP_AREA_MIN_TILES) * 0.75,
      ROOF_PROP_AREA_MAX_TILES,
    ];
    const buildingId = 4242;
    const counts = samples.map((a) => computeRoofPropCount(a, buildingId));
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]!).toBeGreaterThanOrEqual(counts[i - 1]!);
    }
  });

  it('is deterministic: identical (area, buildingId) always yields the identical count', () => {
    expect(computeRoofPropCount(5, 77)).toBe(computeRoofPropCount(5, 77));
  });

  it('never returns a non-integer or a value below ROOF_PROP_COUNT_MIN', () => {
    for (let id = 0; id < 20; id++) {
      for (const area of [-10, 0, 0.5, 1, 3, 9, 50]) {
        const count = computeRoofPropCount(area, id);
        expect(Number.isInteger(count)).toBe(true);
        expect(count).toBeGreaterThanOrEqual(ROOF_PROP_COUNT_MIN);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// hasAntenna (pure)
// ---------------------------------------------------------------------------

describe('hasAntenna', () => {
  it('is deterministic', () => {
    expect(hasAntenna(19)).toBe(hasAntenna(19));
  });

  it('is an "occasional" pick: both outcomes occur, at a bounded rate', () => {
    let count = 0;
    const total = 4000;
    for (let id = 0; id < total; id++) if (hasAntenna(id)) count++;
    const fraction = count / total;
    expect(fraction).toBeGreaterThan(0.1);
    expect(fraction).toBeLessThan(0.6);
  });
});

// ---------------------------------------------------------------------------
// computePropPlacement (pure)
// ---------------------------------------------------------------------------

describe('computePropPlacement', () => {
  it('is deterministic', () => {
    const b = box();
    expect(computePropPlacement(b, 5, 2)).toEqual(computePropPlacement(b, 5, 2));
  });

  it('always stays within the box bounds', () => {
    const b = box({ w: 30, d: 20 });
    for (let id = 0; id < 40; id++) {
      for (let i = 0; i < 8; i++) {
        const p = computePropPlacement(b, id, i);
        expect(Math.abs(p.x)).toBeLessThanOrEqual(b.w / 2);
        expect(Math.abs(p.z)).toBeLessThanOrEqual(b.d / 2);
      }
    }
  });

  it('varies across propIndex for a fixed building id', () => {
    const b = box();
    const seen = new Set<string>();
    for (let i = 0; i < 10; i++) seen.add(JSON.stringify(computePropPlacement(b, 3, i)));
    expect(seen.size).toBeGreaterThan(5);
  });

  it('varies across building id for a fixed propIndex', () => {
    const b = box();
    const seen = new Set<string>();
    for (let id = 0; id < 10; id++) seen.add(JSON.stringify(computePropPlacement(b, id, 0)));
    expect(seen.size).toBeGreaterThan(5);
  });
});

// ---------------------------------------------------------------------------
// rotateLocalOffset (pure) — cross-checked against THREE's own quaternion math
// ---------------------------------------------------------------------------

describe('rotateLocalOffset', () => {
  it('matches THREE.Vector3.applyQuaternion for the same Y-axis rotation, for every rotation value', () => {
    const yAxis = new THREE.Vector3(0, 1, 0);
    const samples: Array<[number, number]> = [
      [3, 0],
      [0, 5],
      [2, 4],
      [-3, 7],
    ];
    for (const rotation of [0, 1, 2, 3] as const) {
      const quat = new THREE.Quaternion().setFromAxisAngle(yAxis, rotation * (Math.PI / 2));
      for (const [x, z] of samples) {
        const expected = new THREE.Vector3(x, 0, z).applyQuaternion(quat);
        const actual = rotateLocalOffset(x, z, rotation);
        expect(actual.x).toBeCloseTo(expected.x, 6);
        expect(actual.z).toBeCloseTo(expected.z, 6);
      }
    }
  });

  it('rotation 0 is the identity', () => {
    expect(rotateLocalOffset(3, -4, 0)).toEqual({ x: 3, z: -4 });
  });
});

// ---------------------------------------------------------------------------
// smokestackCorner / siloCorner / siloClusterCount (pure)
// ---------------------------------------------------------------------------

describe('smokestackCorner', () => {
  it('is deterministic and always one of the 4 corners', () => {
    for (let id = 0; id < 60; id++) {
      const c = smokestackCorner(id);
      expect(smokestackCorner(id)).toBe(c);
      expect([0, 1, 2, 3]).toContain(c);
    }
  });

  it('varies across ids', () => {
    const seen = new Set<number>();
    for (let id = 0; id < 60; id++) seen.add(smokestackCorner(id));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('siloCorner', () => {
  it('is always a different corner than smokestackCorner for the same id', () => {
    for (let id = 0; id < 200; id++) {
      expect(siloCorner(id)).not.toBe(smokestackCorner(id));
    }
  });

  it('is deterministic and always one of the 4 corners', () => {
    for (let id = 0; id < 60; id++) {
      expect(siloCorner(id)).toBe(siloCorner(id));
      expect([0, 1, 2, 3]).toContain(siloCorner(id));
    }
  });
});

describe('siloClusterCount', () => {
  it('is deterministic and always 3 or 4', () => {
    for (let id = 0; id < 60; id++) {
      const c = siloClusterCount(id);
      expect(siloClusterCount(id)).toBe(c);
      expect([SILO_CLUSTER_MIN, SILO_CLUSTER_MAX]).toContain(c);
    }
  });

  it('produces both 3 and 4 across many ids', () => {
    const seen = new Set<number>();
    for (let id = 0; id < 60; id++) seen.add(siloClusterCount(id));
    expect(seen).toEqual(new Set([3, 4]));
  });
});

// ---------------------------------------------------------------------------
// computeCornerOffset (pure)
// ---------------------------------------------------------------------------

describe('computeCornerOffset', () => {
  it('the 4 corners cover all 4 distinct sign combinations exactly once', () => {
    const b = box({ w: 40, d: 30 });
    const signPairs = new Set<string>();
    for (const corner of [0, 1, 2, 3] as const) {
      const { x, z } = computeCornerOffset(b, corner);
      expect(x).not.toBe(0);
      expect(z).not.toBe(0);
      signPairs.add(`${Math.sign(x)},${Math.sign(z)}`);
    }
    expect(signPairs).toEqual(new Set(['1,1', '1,-1', '-1,1', '-1,-1']));
  });

  it('insets within the box bounds (never sits exactly on or outside the edge)', () => {
    const b = box({ w: 40, d: 30 });
    for (const corner of [0, 1, 2, 3] as const) {
      const { x, z } = computeCornerOffset(b, corner);
      expect(Math.abs(x)).toBeLessThan(b.w / 2);
      expect(Math.abs(z)).toBeLessThan(b.d / 2);
    }
  });

  it('is deterministic', () => {
    const b = box();
    expect(computeCornerOffset(b, 2)).toEqual(computeCornerOffset(b, 2));
  });
});

// ---------------------------------------------------------------------------
// computeSiloClusterPlacements (pure)
// ---------------------------------------------------------------------------

describe('computeSiloClusterPlacements', () => {
  it('returns exactly siloClusterCount(id) distinct placements, all within box bounds', () => {
    const b = box({ w: 60, d: 60 });
    for (let id = 0; id < 20; id++) {
      const placements = computeSiloClusterPlacements(b, id);
      expect(placements).toHaveLength(siloClusterCount(id));

      const keys = new Set(placements.map((p) => `${p.x.toFixed(6)},${p.z.toFixed(6)}`));
      expect(keys.size).toBe(placements.length); // all distinct

      for (const p of placements) {
        expect(Math.abs(p.x)).toBeLessThanOrEqual(b.w / 2);
        expect(Math.abs(p.z)).toBeLessThanOrEqual(b.d / 2);
      }
    }
  });

  it('is deterministic', () => {
    const b = box({ w: 60, d: 60 });
    expect(computeSiloClusterPlacements(b, 11)).toEqual(computeSiloClusterPlacements(b, 11));
  });
});

// ---------------------------------------------------------------------------
// RoofPropRenderer
// ---------------------------------------------------------------------------

describe('RoofPropRenderer', () => {
  it('a single-floor building (height rounds to 1 floor) gets exactly 1 vent and 0 AC/antenna slots', () => {
    const scene = new THREE.Scene();
    // height=3 -> round(3/3.2)=1 floor.
    const e = entry({ footprint: { w: 1, d: 1 }, height: 3, level: 1 });
    const renderer = new RoofPropRenderer(scene, flatHeightAt, [e]);
    renderer.apply(deltaAdd(building({ level: 1 })));

    expect(renderer.slotsFor(1, 'vent')).toHaveLength(1);
    expect(renderer.slotsFor(1, 'ac')).toHaveLength(0);
    expect(renderer.slotsFor(1, 'antenna')).toHaveLength(0);
  });

  it('a multi-floor building gets AC slots (never a vent), count matching computeRoofPropCount', () => {
    const scene = new THREE.Scene();
    const e = entry({ footprint: { w: 1, d: 1 }, height: 12, level: 1 }); // several floors
    const renderer = new RoofPropRenderer(scene, flatHeightAt, [e]);
    renderer.apply(deltaAdd(building({ id: 3, level: 1 })));

    const { boxes } = computeSetbacks(e, 3);
    const expectedCount = computeRoofPropCount(roofAreaTiles(boxes[boxes.length - 1]!), 3);

    expect(renderer.slotsFor(3, 'ac')).toHaveLength(expectedCount);
    expect(renderer.slotsFor(3, 'vent')).toHaveLength(0);
  });

  it('a big-slab building (large footprint, level 1) gets 4-6 AC units', () => {
    const scene = new THREE.Scene();
    const e = entry({ footprint: { w: 4, d: 4 }, height: 20, level: 1 });
    const renderer = new RoofPropRenderer(scene, flatHeightAt, [e]);
    renderer.apply(deltaAdd(building({ id: 1, level: 1 })));

    const count = renderer.slotsFor(1, 'ac').length;
    expect(count).toBeGreaterThanOrEqual(4);
    expect(count).toBeLessThanOrEqual(6);
  });

  it('roof props (vent/AC) sit on the TOP box, positioned via computeSetbacks', () => {
    const heightAt = (): number => 6;
    const scene = new THREE.Scene();
    const e = entry({ footprint: { w: 2, d: 2 }, height: 18, level: 3 });
    const renderer = new RoofPropRenderer(scene, heightAt, [e]);
    renderer.apply(deltaAdd(building({ id: 1, x: 0, z: 0, level: 3 })));

    const { boxes } = computeSetbacks(e, 1);
    const topBox = boxes[boxes.length - 1]!;
    const expectedRoofY = 6 + topBox.yOffset + topBox.h;

    const kind: PropKind = renderer.slotsFor(1, 'ac').length > 0 ? 'ac' : 'vent';
    const slots = renderer.slotsFor(1, kind);
    expect(slots.length).toBeGreaterThan(0);
    const m = new THREE.Matrix4();
    for (const slot of slots) {
      renderer.getMatrix(kind, slot, m);
      const { pos } = decompose(m);
      expect(pos.y).toBeCloseTo(expectedRoofY, 4);
      // Local offsets are inset within the top box footprint.
      const centerX = (0 + e.footprint.w / 2) * TILE_METERS;
      const centerZ = (0 + e.footprint.d / 2) * TILE_METERS;
      expect(Math.abs(pos.x - centerX)).toBeLessThanOrEqual(topBox.w / 2 + 1e-6);
      expect(Math.abs(pos.z - centerZ)).toBeLessThanOrEqual(topBox.d / 2 + 1e-6);
    }
  });

  it('places an antenna + warning light at its tip exactly when hasAntenna(buildingId) is true', () => {
    let trueId = -1;
    let falseId = -1;
    for (let id = 0; id < 200 && (trueId < 0 || falseId < 0); id++) {
      if (hasAntenna(id)) trueId = trueId < 0 ? id : trueId;
      else falseId = falseId < 0 ? id : falseId;
    }
    expect(trueId).toBeGreaterThanOrEqual(0);
    expect(falseId).toBeGreaterThanOrEqual(0);

    const e = entry({ footprint: { w: 2, d: 2 }, height: 20, level: 1 }); // multi-floor
    const scene = new THREE.Scene();
    const renderer = new RoofPropRenderer(scene, flatHeightAt, [e]);
    renderer.apply(
      deltaAdd(building({ id: trueId, x: 0, z: 0 }), building({ id: falseId, x: 20, z: 0 })),
    );

    expect(renderer.slotsFor(trueId, 'antenna')).toHaveLength(1);
    expect(renderer.slotsFor(falseId, 'antenna')).toHaveLength(0);

    const antennaSlot = renderer.slotsFor(trueId, 'antenna')[0]!;
    const lightSlots = renderer.slotsFor(trueId, 'warningLight');
    expect(lightSlots.length).toBeGreaterThanOrEqual(1);

    const am = new THREE.Matrix4();
    renderer.getMatrix('antenna', antennaSlot, am);
    const { pos: antennaPos, scl: antennaScale } = decompose(am);

    // One of the warning lights sits exactly at the antenna's tip.
    const lm = new THREE.Matrix4();
    const tipYs = lightSlots.map((slot) => {
      renderer.getMatrix('warningLight', slot, lm);
      return decompose(lm).pos.y;
    });
    const expectedTipY = antennaPos.y + antennaScale.y;
    expect(tipYs.some((y) => Math.abs(y - expectedTipY) < 1e-4)).toBe(true);
  });

  it('industrial level >= MIN_SMOKESTACK_LEVEL gets exactly 1 smokestack + a warning light at its tip; level 1 gets none', () => {
    const scene = new THREE.Scene();
    const tall = entry({
      id: 'ind-tall',
      category: 'ind',
      level: MIN_SMOKESTACK_LEVEL,
      footprint: { w: 2, d: 2 },
      height: 14,
    });
    const short = entry({
      id: 'ind-short',
      category: 'ind',
      level: 1,
      footprint: { w: 2, d: 2 },
      height: 9,
    });
    const renderer = new RoofPropRenderer(scene, flatHeightAt, [tall, short]);
    renderer.apply(
      deltaAdd(
        building({ id: 1, catalogId: 'ind-tall', level: MIN_SMOKESTACK_LEVEL, x: 0, z: 0 }),
        building({ id: 2, catalogId: 'ind-short', level: 1, x: 20, z: 0 }),
      ),
    );

    expect(renderer.slotsFor(1, 'smokestack')).toHaveLength(1);
    expect(renderer.slotsFor(2, 'smokestack')).toHaveLength(0);

    const slot = renderer.slotsFor(1, 'smokestack')[0]!;
    const m = new THREE.Matrix4();
    renderer.getMatrix('smokestack', slot, m);
    const { pos, scl } = decompose(m);
    const expectedTipY = pos.y + scl.y;

    const lightSlots = renderer.slotsFor(1, 'warningLight');
    expect(lightSlots.length).toBeGreaterThanOrEqual(1);
    const lm = new THREE.Matrix4();
    const tipYs = lightSlots.map((s) => {
      renderer.getMatrix('warningLight', s, lm);
      return decompose(lm).pos.y;
    });
    expect(tipYs.some((y) => Math.abs(y - expectedTipY) < 1e-4)).toBe(true);
  });

  it('non-industrial buildings never get a smokestack or silo cluster, regardless of level/footprint', () => {
    const scene = new THREE.Scene();
    const e = entry({ category: 'com', level: 3, footprint: { w: 4, d: 4 }, height: 30 });
    const renderer = new RoofPropRenderer(scene, flatHeightAt, [e]);
    renderer.apply(deltaAdd(building({ id: 1, level: 3 })));
    expect(renderer.slotsFor(1, 'smokestack')).toHaveLength(0);
    expect(renderer.slotsFor(1, 'silo')).toHaveLength(0);
  });

  it(`industrial footprints >= ${MIN_SILO_FOOTPRINT_TILES}x${MIN_SILO_FOOTPRINT_TILES} get a 3-4 silo cluster at a DIFFERENT corner than the smokestack; smaller footprints get none`, () => {
    const scene = new THREE.Scene();
    const big = entry({
      id: 'ind-big',
      category: 'ind',
      level: MIN_SMOKESTACK_LEVEL,
      footprint: { w: MIN_SILO_FOOTPRINT_TILES, d: MIN_SILO_FOOTPRINT_TILES },
      height: 14,
    });
    const small = entry({
      id: 'ind-small',
      category: 'ind',
      level: MIN_SMOKESTACK_LEVEL,
      footprint: { w: MIN_SILO_FOOTPRINT_TILES - 1, d: MIN_SILO_FOOTPRINT_TILES - 1 },
      height: 14,
    });
    const renderer = new RoofPropRenderer(scene, flatHeightAt, [big, small]);
    renderer.apply(
      deltaAdd(
        building({ id: 1, catalogId: 'ind-big', level: MIN_SMOKESTACK_LEVEL, x: 0, z: 0 }),
        building({ id: 2, catalogId: 'ind-small', level: MIN_SMOKESTACK_LEVEL, x: 20, z: 0 }),
      ),
    );

    const siloSlots = renderer.slotsFor(1, 'silo');
    expect(siloSlots.length).toBeGreaterThanOrEqual(SILO_CLUSTER_MIN);
    expect(siloSlots.length).toBeLessThanOrEqual(SILO_CLUSTER_MAX);
    expect(renderer.slotsFor(2, 'silo')).toHaveLength(0);

    // Smokestack and silo cluster must not sit at the same corner: compare the
    // (sign, sign) quadrant of each relative to the building's own center.
    const centerX = (0 + big.footprint.w / 2) * TILE_METERS;
    const centerZ = (0 + big.footprint.d / 2) * TILE_METERS;
    const smokestackSlot = renderer.slotsFor(1, 'smokestack')[0]!;
    const m = new THREE.Matrix4();
    renderer.getMatrix('smokestack', smokestackSlot, m);
    const smokestackPos = decompose(m).pos;
    const smokestackQuadrant = `${Math.sign(smokestackPos.x - centerX)},${Math.sign(smokestackPos.z - centerZ)}`;

    for (const slot of siloSlots) {
      renderer.getMatrix('silo', slot, m);
      const siloPos = decompose(m).pos;
      const siloQuadrant = `${Math.sign(siloPos.x - centerX)},${Math.sign(siloPos.z - centerZ)}`;
      expect(siloQuadrant).not.toBe(smokestackQuadrant);
    }
  });

  it('zero-scales every slot of a removed building across every prop kind, leaving other buildings intact', () => {
    const scene = new THREE.Scene();
    const e = entry({
      id: 'ind-full',
      category: 'ind',
      level: MIN_SMOKESTACK_LEVEL,
      footprint: { w: MIN_SILO_FOOTPRINT_TILES, d: MIN_SILO_FOOTPRINT_TILES },
      height: 14,
    });
    const renderer = new RoofPropRenderer(scene, flatHeightAt, [e]);
    renderer.apply(
      deltaAdd(
        building({ id: 1, catalogId: 'ind-full', x: 0, z: 0, level: MIN_SMOKESTACK_LEVEL }),
        building({ id: 2, catalogId: 'ind-full', x: 30, z: 0, level: MIN_SMOKESTACK_LEVEL }),
      ),
    );

    const kinds: PropKind[] = ['vent', 'ac', 'antenna', 'warningLight', 'smokestack', 'silo'];
    const beforeA = new Map(kinds.map((k) => [k, [...renderer.slotsFor(1, k)]]));
    const beforeB = new Map(kinds.map((k) => [k, [...renderer.slotsFor(2, k)]]));
    expect([...beforeA.values()].some((s) => s.length > 0)).toBe(true);
    expect([...beforeB.values()].some((s) => s.length > 0)).toBe(true);

    renderer.apply(deltaRemove(1));

    const m = new THREE.Matrix4();
    for (const kind of kinds) {
      expect(renderer.slotsFor(1, kind)).toHaveLength(0);
      for (const slot of beforeA.get(kind)!) {
        renderer.getMatrix(kind, slot, m);
        expect(isZeroScale(m)).toBe(true);
      }
      // Building 2's own slots must be bit-for-bit untouched.
      expect([...renderer.slotsFor(2, kind)]).toEqual(beforeB.get(kind)!);
    }
  });

  it('recycles freed slots instead of growing unboundedly', () => {
    const scene = new THREE.Scene();
    const e = entry({ footprint: { w: 1, d: 1 }, height: 12, level: 1 });
    const renderer = new RoofPropRenderer(scene, flatHeightAt, [e]);
    renderer.apply(deltaAdd(building({ id: 1, x: 0, z: 0 })));
    const before = renderer.instanceCount('ac');

    renderer.apply(deltaRemove(1));
    renderer.apply(deltaAdd(building({ id: 2, x: 20, z: 0 })));
    expect(renderer.instanceCount('ac')).toBe(before);
  });

  it('Constructing buildings sit at the height-scaled (0.25x) roof level', () => {
    const scene = new THREE.Scene();
    const e = entry({ footprint: { w: 1, d: 1 }, height: 20, level: 1 });
    const activeRenderer = new RoofPropRenderer(scene, flatHeightAt, [e]);
    activeRenderer.apply(deltaAdd(building({ id: 1, state: BuildingState.Active })));

    const scene2 = new THREE.Scene();
    const constructingRenderer = new RoofPropRenderer(scene2, flatHeightAt, [e]);
    constructingRenderer.apply(deltaAdd(building({ id: 1, state: BuildingState.Constructing })));

    const activeSlot = activeRenderer.slotsFor(1, 'ac')[0]!;
    const constructingSlot = constructingRenderer.slotsFor(1, 'ac')[0]!;
    const m1 = new THREE.Matrix4();
    const m2 = new THREE.Matrix4();
    activeRenderer.getMatrix('ac', activeSlot, m1);
    constructingRenderer.getMatrix('ac', constructingSlot, m2);

    const { boxes } = computeSetbacks(e, 1);
    const topBox = boxes[boxes.length - 1]!;
    const activeY = decompose(m1).pos.y;
    const constructingY = decompose(m2).pos.y;
    expect(activeY).toBeCloseTo(topBox.yOffset + topBox.h, 4);
    expect(constructingY).toBeCloseTo((topBox.yOffset + topBox.h) * 0.25, 4);
  });

  it('setNightFactor drives warningLightEmissiveIntensity, clamped to [0,1], defaulting to 0', () => {
    const scene = new THREE.Scene();
    const renderer = new RoofPropRenderer(scene, flatHeightAt, [entry()]);
    expect(renderer.warningLightEmissiveIntensity()).toBe(0);

    renderer.setNightFactor(1);
    expect(renderer.warningLightEmissiveIntensity()).toBeCloseTo(1, 9);
    renderer.setNightFactor(0.4);
    expect(renderer.warningLightEmissiveIntensity()).toBeCloseTo(0.4, 9);
    renderer.setNightFactor(-3);
    expect(renderer.warningLightEmissiveIntensity()).toBe(0);
    renderer.setNightFactor(9);
    expect(renderer.warningLightEmissiveIntensity()).toBeCloseTo(1, 9);
  });

  it('does not throw and places zero props for an unknown catalogId', () => {
    const scene = new THREE.Scene();
    const renderer = new RoofPropRenderer(scene, flatHeightAt, []);
    expect(() => renderer.apply(deltaAdd(building({ catalogId: 'nope' })))).not.toThrow();
    expect(renderer.slotsFor(1, 'vent')).toHaveLength(0);
    expect(renderer.slotsFor(1, 'ac')).toHaveLength(0);
  });

  it('constructs and applies against the full production catalog without throwing (ind-2 exercises every feature)', () => {
    const realCatalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
    const scene = new THREE.Scene();
    const renderer = new RoofPropRenderer(scene, flatHeightAt, realCatalog);
    const added = realCatalog.map((catalogEntry, i) =>
      building({ id: i + 1, catalogId: catalogEntry.id, x: i * 8, level: catalogEntry.level ?? 1 }),
    );
    expect(() => renderer.apply(deltaAdd(...added))).not.toThrow();

    const ind2Index = realCatalog.findIndex((c) => c.id === 'ind-2');
    expect(ind2Index).toBeGreaterThanOrEqual(0);
    const ind2Id = ind2Index + 1;

    expect(renderer.slotsFor(ind2Id, 'smokestack')).toHaveLength(1); // level 2
    const siloCount = renderer.slotsFor(ind2Id, 'silo').length; // footprint 3x3
    expect(siloCount).toBeGreaterThanOrEqual(3);
    expect(siloCount).toBeLessThanOrEqual(4);
  });
});

describe('RoofPropRenderer frontage setback (optional roadAt)', () => {
  /** A predicate that is true only for the given set of tile coordinates. */
  function roadAtTiles(
    tiles: ReadonlyArray<readonly [number, number]>,
  ): (x: number, z: number) => boolean {
    const set = new Set(tiles.map(([x, z]) => `${x},${z}`));
    return (x: number, z: number): boolean => set.has(`${x},${z}`);
  }

  it('places every ind prop kind on the road-set-back roof (inset area + shifted center)', () => {
    const e = entry({
      id: 'ind-road',
      category: 'ind',
      level: MIN_SMOKESTACK_LEVEL,
      footprint: { w: MIN_SILO_FOOTPRINT_TILES, d: MIN_SILO_FOOTPRINT_TILES },
      height: 14,
    });
    const roadAt = roadAtTiles([[5, 4]]); // N of the footprint at (5,5)
    const scene = new THREE.Scene();
    const renderer = new RoofPropRenderer(scene, flatHeightAt, [e], roadAt);
    renderer.apply(deltaAdd(building({ catalogId: 'ind-road', level: MIN_SMOKESTACK_LEVEL })));

    const frontage = frontageSetbackFor(e, 5, 5, roadAt);
    expect(frontage.centerZM).toBeGreaterThan(0); // the setback really is in play
    const { boxes } = computeSetbacks(e, 1, frontage);
    const topBox = boxes[boxes.length - 1]!;
    const centerX = (5 + e.footprint.w / 2) * TILE_METERS + frontage.centerXM;
    const centerZ = (5 + e.footprint.d / 2) * TILE_METERS + frontage.centerZM;

    const m = new THREE.Matrix4();
    const kinds: PropKind[] = ['vent', 'ac', 'antenna', 'smokestack', 'silo'];
    let checked = 0;
    for (const kind of kinds) {
      for (const slot of renderer.slotsFor(1, kind)) {
        renderer.getMatrix(kind, slot, m);
        const { pos } = decompose(m);
        // Every prop stays within the set-back top box, so nothing can float
        // over the parking bays in front of the north face.
        expect(Math.abs(pos.x - centerX)).toBeLessThanOrEqual(topBox.w / 2 + 1e-6);
        expect(Math.abs(pos.z - centerZ)).toBeLessThanOrEqual(topBox.d / 2 + 1e-6);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('scattered AC placement matches the pure pipeline recomputed with the frontage setback', () => {
    const e = entry({ id: 'com-road', category: 'com', footprint: { w: 2, d: 2 }, height: 12 });
    const roadAt = roadAtTiles([[5, 4]]);
    const scene = new THREE.Scene();
    const renderer = new RoofPropRenderer(scene, flatHeightAt, [e], roadAt);
    renderer.apply(deltaAdd(building({ id: 3, catalogId: 'com-road' })));

    const frontage = frontageSetbackFor(e, 5, 5, roadAt);
    const { boxes } = computeSetbacks(e, 3, frontage);
    const topBox = boxes[boxes.length - 1]!;
    const centerX = (5 + 1) * TILE_METERS + frontage.centerXM;
    const centerZ = (5 + 1) * TILE_METERS + frontage.centerZM;

    const slots = renderer.slotsFor(3, 'ac');
    expect(slots.length).toBeGreaterThan(0);
    const m = new THREE.Matrix4();
    slots.forEach((slot, i) => {
      const local = computePropPlacement(topBox, 3, i);
      renderer.getMatrix('ac', slot, m);
      const { pos } = decompose(m);
      expect(pos.x).toBeCloseTo(centerX + local.x, 5);
      expect(pos.z).toBeCloseTo(centerZ + local.z, 5);
    });
  });

  it('leaves a road-adjacent RES building byte-identical to the roadAt-less renderer', () => {
    const e = entry({ id: 'res-road', category: 'res', footprint: { w: 2, d: 2 }, height: 12 });
    const withRoad = new RoofPropRenderer(
      new THREE.Scene(),
      flatHeightAt,
      [e],
      roadAtTiles([[5, 4]]),
    );
    const withoutRoad = new RoofPropRenderer(new THREE.Scene(), flatHeightAt, [e]);
    withRoad.apply(deltaAdd(building({ catalogId: 'res-road' })));
    withoutRoad.apply(deltaAdd(building({ catalogId: 'res-road' })));

    const slotsA = withRoad.slotsFor(1, 'ac');
    const slotsB = withoutRoad.slotsFor(1, 'ac');
    expect(slotsA).toEqual(slotsB);
    const mA = new THREE.Matrix4();
    const mB = new THREE.Matrix4();
    slotsA.forEach((slot, i) => {
      withRoad.getMatrix('ac', slot, mA);
      withoutRoad.getMatrix('ac', slotsB[i]!, mB);
      expect(mA.elements).toEqual(mB.elements);
    });
  });
});
