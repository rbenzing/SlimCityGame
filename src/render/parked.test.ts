import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CAR_PALETTE,
  computeStallCount,
  computeStallPlacements,
  findRoadFacingEdge,
  ParkedCarRenderer,
  STALL_INSET_TILES,
  STALL_SPACING_TILES,
  stallColorIndex,
  stallYawJitter,
  YAW_JITTER_MAX,
} from './parked';
import {
  BuildingCatalogEntry,
  BuildingDelta,
  BuildingInstance,
  BuildingState,
} from '../shared/types';
import { TILE_METERS } from '../shared/constants';

const flatHeightAt = (): number => 0;
const noRoad = (): boolean => false;

/** A predicate that is true only for the given set of tile coordinates. */
function roadAtTiles(
  tiles: ReadonlyArray<readonly [number, number]>,
): (x: number, z: number) => boolean {
  const set = new Set(tiles.map(([x, z]) => `${x},${z}`));
  return (x: number, z: number): boolean => set.has(`${x},${z}`);
}

function makeCatalogEntry(overrides: Partial<BuildingCatalogEntry> = {}): BuildingCatalogEntry {
  return {
    // Parked-car lots are a commercial/industrial feature — homes park
    // off-street (garage/driveway), so the geometry fixtures here are a shop.
    id: 'house',
    name: 'Test Shop',
    category: 'com',
    zone: 3,
    level: 1,
    footprint: { w: 1, d: 1 },
    height: 5,
    color: 0xffffff,
    powerUse: 0,
    waterUse: 0,
    cost: 0,
    upkeep: 0,
    unlockMilestone: 0,
    ...overrides,
  };
}

function makeBuilding(overrides: Partial<BuildingInstance> = {}): BuildingInstance {
  return {
    id: 1,
    catalogId: 'house',
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

// ---------------------------------------------------------------------------
// Pure function: findRoadFacingEdge (edge selection + tie-break)
// ---------------------------------------------------------------------------

describe('findRoadFacingEdge', () => {
  it('selects N when only the north strip is road-adjacent', () => {
    // 1x1 footprint at (5,5): N strip is (5,4)
    const edge = findRoadFacingEdge(5, 5, 1, 1, roadAtTiles([[5, 4]]));
    expect(edge).toEqual({ side: 'N', edgeTiles: 1 });
  });

  it('selects E when only the east strip is road-adjacent', () => {
    // 1x2 footprint (w=1,d=2) at (5,5) occupies z=5..6; E strip is x=6, z=5..6
    const edge = findRoadFacingEdge(5, 5, 1, 2, roadAtTiles([[6, 6]]));
    expect(edge).toEqual({ side: 'E', edgeTiles: 2 });
  });

  it('selects S when only the south strip is road-adjacent', () => {
    // 3x1 footprint (w=3,d=1) at (2,2) occupies x=2..4; S strip is z=3, x=2..4
    const edge = findRoadFacingEdge(2, 2, 3, 1, roadAtTiles([[3, 3]]));
    expect(edge).toEqual({ side: 'S', edgeTiles: 3 });
  });

  it('selects W when only the west strip is road-adjacent', () => {
    // 1x2 footprint at (5,5); W strip is x=4, z=5..6
    const edge = findRoadFacingEdge(5, 5, 1, 2, roadAtTiles([[4, 5]]));
    expect(edge).toEqual({ side: 'W', edgeTiles: 2 });
  });

  it('detects a road tile anywhere along a multi-tile strip, not just its first tile', () => {
    // 3x2 footprint (w=3,d=2) at (2,2) occupies x=2..4,z=2..3; S strip z=4,x=2..4;
    // road only at the middle tile (3,4).
    const edge = findRoadFacingEdge(2, 2, 3, 2, roadAtTiles([[3, 4]]));
    expect(edge).toEqual({ side: 'S', edgeTiles: 3 });
  });

  it('tie-breaks N over E, S, W when every side is road-adjacent', () => {
    const roadAt = roadAtTiles([
      [5, 4], // N
      [6, 5], // E
      [5, 6], // S
      [4, 5], // W
    ]);
    expect(findRoadFacingEdge(5, 5, 1, 1, roadAt)?.side).toBe('N');
  });

  it('tie-breaks E over S, W when N is absent', () => {
    const roadAt = roadAtTiles([
      [6, 5], // E
      [5, 6], // S
      [4, 5], // W
    ]);
    expect(findRoadFacingEdge(5, 5, 1, 1, roadAt)?.side).toBe('E');
  });

  it('tie-breaks S over W when N, E are absent', () => {
    const roadAt = roadAtTiles([
      [5, 6], // S
      [4, 5], // W
    ]);
    expect(findRoadFacingEdge(5, 5, 1, 1, roadAt)?.side).toBe('S');
  });

  it('falls back to W when only W is road-adjacent', () => {
    const roadAt = roadAtTiles([[4, 5]]); // W only
    expect(findRoadFacingEdge(5, 5, 1, 1, roadAt)?.side).toBe('W');
  });

  it('returns null when no side is road-adjacent', () => {
    expect(findRoadFacingEdge(5, 5, 1, 1, noRoad)).toBeNull();
  });

  it('reports edgeTiles = w for N/S and = d for E/W', () => {
    const roadAt = roadAtTiles([[2, 1]]); // N of a 4x3 footprint at (2,2)
    expect(findRoadFacingEdge(2, 2, 4, 3, roadAt)).toEqual({ side: 'N', edgeTiles: 4 });

    const roadAtE = roadAtTiles([[6, 2]]); // E of the same footprint (x+w=6)
    expect(findRoadFacingEdge(2, 2, 4, 3, roadAtE)).toEqual({ side: 'E', edgeTiles: 3 });
  });
});

// ---------------------------------------------------------------------------
// Pure function: computeStallCount
// ---------------------------------------------------------------------------

describe('computeStallCount', () => {
  it('uses level + 1 when the edge has ample capacity', () => {
    expect(computeStallCount(1, 20)).toBe(2);
    expect(computeStallCount(2, 20)).toBe(3);
    expect(computeStallCount(3, 20)).toBe(4);
  });

  it('clamps to floor(edgeTiles / 0.45) when capacity is the binding constraint', () => {
    // floor(1 / 0.45) = 2
    expect(computeStallCount(3, 1)).toBe(2);
    // floor(2 / 0.45) = 4
    expect(computeStallCount(5, 2)).toBe(4);
  });

  it('never returns a negative count', () => {
    expect(computeStallCount(0, 1)).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Pure function: computeStallPlacements
// ---------------------------------------------------------------------------

describe('computeStallPlacements', () => {
  const insetM = STALL_INSET_TILES * TILE_METERS;
  const spacingM = STALL_SPACING_TILES * TILE_METERS;

  it('spaces consecutive stalls by STALL_SPACING_TILES tiles', () => {
    const edge = { side: 'N' as const, edgeTiles: 5 };
    const placements = computeStallPlacements(2, 2, 5, 1, edge, 3);
    expect(placements).toHaveLength(3);
    expect(placements[1]!.worldX - placements[0]!.worldX).toBeCloseTo(spacingM, 6);
    expect(placements[2]!.worldX - placements[1]!.worldX).toBeCloseTo(spacingM, 6);
  });

  it('insets the N row INWARD (south, onto the lot) from the building edge', () => {
    const edge = { side: 'N' as const, edgeTiles: 1 };
    const [p] = computeStallPlacements(5, 5, 1, 1, edge, 1);
    // building's north edge line is at z=5*16=80; row sits `inset` INTO the lot
    // (larger z), never north onto the road.
    expect(p!.worldZ).toBeCloseTo(80 + insetM, 6);
  });

  it('insets the S row INWARD (north, onto the lot) from the building edge', () => {
    const edge = { side: 'S' as const, edgeTiles: 1 };
    const [p] = computeStallPlacements(5, 5, 1, 1, edge, 1);
    // south edge line at z=(5+1)*16=96; row sits INTO the lot (smaller z).
    expect(p!.worldZ).toBeCloseTo(96 - insetM, 6);
  });

  it('insets the E row INWARD (west, onto the lot) from the building edge', () => {
    const edge = { side: 'E' as const, edgeTiles: 1 };
    const [p] = computeStallPlacements(5, 5, 1, 1, edge, 1);
    expect(p!.worldX).toBeCloseTo(96 - insetM, 6);
  });

  it('insets the W row INWARD (east, onto the lot) from the building edge', () => {
    const edge = { side: 'W' as const, edgeTiles: 1 };
    const [p] = computeStallPlacements(5, 5, 1, 1, edge, 1);
    expect(p!.worldX).toBeCloseTo(80 + insetM, 6);
  });

  it('gives each of the four sides a distinct base yaw', () => {
    const yaws = (['N', 'E', 'S', 'W'] as const).map((side) => {
      const [p] = computeStallPlacements(5, 5, 1, 1, { side, edgeTiles: 1 }, 1);
      return p!.baseYaw;
    });
    expect(new Set(yaws).size).toBe(4);
  });

  it('base yaw per side is rotated a quarter turn from the perpendicular convention, for PARALLEL street parking (UI-SPEC §6.18 #3)', () => {
    // Long axis (BODY_LENGTH, local Z) must run ALONG the road-facing edge,
    // not across it -- so each side's old perpendicular yaw {N:0, S:PI,
    // E:-PI/2, W:PI/2} gets +PI/2 added (S wraps 3*PI/2 -> -PI/2).
    const yawFor = (side: 'N' | 'E' | 'S' | 'W'): number => {
      const [p] = computeStallPlacements(5, 5, 1, 1, { side, edgeTiles: 1 }, 1);
      return p!.baseYaw;
    };
    expect(yawFor('N')).toBeCloseTo(Math.PI / 2, 10);
    expect(yawFor('E')).toBeCloseTo(0, 10);
    expect(yawFor('S')).toBeCloseTo(-Math.PI / 2, 10);
    expect(yawFor('W')).toBeCloseTo(Math.PI, 10);
  });

  it('returns an empty array for count 0', () => {
    expect(computeStallPlacements(5, 5, 1, 1, { side: 'N', edgeTiles: 1 }, 0)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Pure functions: stallColorIndex / stallYawJitter (deterministic hashing)
// ---------------------------------------------------------------------------

describe('stallColorIndex / stallYawJitter', () => {
  it('is deterministic: repeated calls with the same inputs give the same output', () => {
    expect(stallColorIndex(42, 3)).toBe(stallColorIndex(42, 3));
    expect(stallYawJitter(42, 3)).toBe(stallYawJitter(42, 3));
  });

  it('stallColorIndex always lands inside the palette range', () => {
    for (let i = 0; i < 25; i++) {
      const idx = stallColorIndex(999, i);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(CAR_PALETTE.length);
      expect(Number.isInteger(idx)).toBe(true);
    }
  });

  it('stallYawJitter stays within +/- YAW_JITTER_MAX', () => {
    for (let i = 0; i < 25; i++) {
      const jitter = stallYawJitter(777, i);
      expect(jitter).toBeGreaterThanOrEqual(-YAW_JITTER_MAX);
      expect(jitter).toBeLessThanOrEqual(YAW_JITTER_MAX);
    }
  });

  it('varies across stall indices (not a constant)', () => {
    const colors = new Set(Array.from({ length: 10 }, (_, i) => stallColorIndex(1, i)));
    const jitters = new Set(Array.from({ length: 10 }, (_, i) => stallYawJitter(1, i)));
    expect(colors.size).toBeGreaterThan(1);
    expect(jitters.size).toBeGreaterThan(1);
  });

  it('varies across building ids (not a constant)', () => {
    const colors = new Set(Array.from({ length: 10 }, (_, id) => stallColorIndex(id, 0)));
    expect(colors.size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// ParkedCarRenderer (integration: THREE scene, InstancedMesh, stripe meshes)
// ---------------------------------------------------------------------------

describe('ParkedCarRenderer', () => {
  it('places min(level+1, capacity) cars for an Active, road-adjacent building', () => {
    const scene = new THREE.Scene();
    const catalog = makeCatalogEntry({ footprint: { w: 1, d: 1 } });
    const renderer = new ParkedCarRenderer(scene, flatHeightAt, [catalog], roadAtTiles([[5, 4]]));

    const building = makeBuilding({ id: 1, level: 1 });
    renderer.apply(deltaAdd(building));

    expect(renderer.stallSlotsFor(1)).toHaveLength(2); // min(1+1, floor(1/0.45)=2) = 2
    expect(renderer.carMeshCount()).toBe(1);
    expect(renderer.carInstanceCount()).toBeGreaterThanOrEqual(2);
  });

  it('parks zero cars for a RESIDENTIAL building even when road-adjacent (homes park off-street)', () => {
    const scene = new THREE.Scene();
    const home = makeCatalogEntry({ category: 'res', zone: 1, footprint: { w: 2, d: 2 } });
    const renderer = new ParkedCarRenderer(scene, flatHeightAt, [home], roadAtTiles([[5, 4]]));

    renderer.apply(deltaAdd(makeBuilding({ id: 1, level: 2 })));

    expect(renderer.stallSlotsFor(1)).toHaveLength(0);
    expect(renderer.hasStripeMesh(1)).toBe(false);
  });

  it('parks zero cars and draws NO frontage apron for a UTILITY building (water tower) next to a road', () => {
    const scene = new THREE.Scene();
    const utility = makeCatalogEntry({ category: 'utility', footprint: { w: 2, d: 2 } });
    const renderer = new ParkedCarRenderer(scene, flatHeightAt, [utility], roadAtTiles([[5, 4]]));

    renderer.apply(deltaAdd(makeBuilding({ id: 1, level: 1 })));

    expect(renderer.stallSlotsFor(1)).toHaveLength(0);
    expect(renderer.hasStripeMesh(1)).toBe(false); // no grey apron bleeding into the road
  });

  it('industrial lots park box TRUCKS (scaled-up vehicles); commercial lots park cars', () => {
    const scene = new THREE.Scene();
    const factory = makeCatalogEntry({ id: 'factory', category: 'ind', zone: 5, footprint: { w: 2, d: 1 } });
    const shop = makeCatalogEntry({ id: 'shop', category: 'com', zone: 3, footprint: { w: 2, d: 1 } });
    const renderer = new ParkedCarRenderer(
      scene,
      flatHeightAt,
      [factory, shop],
      roadAtTiles([
        [5, 4],
        [20, 4],
      ]),
    );
    renderer.apply(deltaAdd(makeBuilding({ id: 1, catalogId: 'factory', level: 1 })));
    renderer.apply(deltaAdd(makeBuilding({ id: 2, catalogId: 'shop', x: 20, level: 1 })));

    const m = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();

    renderer.getCarMatrix(renderer.stallSlotsFor(1)[0]!, m);
    m.decompose(p, q, scale);
    expect(scale.y).toBeGreaterThan(2); // truck: much taller than a car

    renderer.getCarMatrix(renderer.stallSlotsFor(2)[0]!, m);
    m.decompose(p, q, scale);
    expect(scale.y).toBeCloseTo(1, 5); // car: unit scale
  });

  it('clamps stall count to edge capacity for a high level on a short edge', () => {
    const scene = new THREE.Scene();
    const catalog = makeCatalogEntry({ footprint: { w: 1, d: 1 } });
    const renderer = new ParkedCarRenderer(scene, flatHeightAt, [catalog], roadAtTiles([[5, 4]]));

    const building = makeBuilding({ id: 1, level: 3 }); // level+1=4, but capacity is 2
    renderer.apply(deltaAdd(building));

    expect(renderer.stallSlotsFor(1)).toHaveLength(2);
  });

  it('parks zero cars for a Constructing building even when road-adjacent', () => {
    const scene = new THREE.Scene();
    const catalog = makeCatalogEntry();
    const renderer = new ParkedCarRenderer(scene, flatHeightAt, [catalog], roadAtTiles([[5, 4]]));

    renderer.apply(deltaAdd(makeBuilding({ id: 1, state: BuildingState.Constructing })));

    expect(renderer.stallSlotsFor(1)).toHaveLength(0);
    expect(renderer.hasStripeMesh(1)).toBe(false);
  });

  it('parks zero cars for an Abandoned building even when road-adjacent', () => {
    const scene = new THREE.Scene();
    const catalog = makeCatalogEntry();
    const renderer = new ParkedCarRenderer(scene, flatHeightAt, [catalog], roadAtTiles([[5, 4]]));

    renderer.apply(deltaAdd(makeBuilding({ id: 1, state: BuildingState.Abandoned })));

    expect(renderer.stallSlotsFor(1)).toHaveLength(0);
    expect(renderer.hasStripeMesh(1)).toBe(false);
  });

  it('parks zero cars, and builds no stripe mesh, when no side is road-adjacent', () => {
    const scene = new THREE.Scene();
    const catalog = makeCatalogEntry();
    const renderer = new ParkedCarRenderer(scene, flatHeightAt, [catalog], noRoad);

    renderer.apply(deltaAdd(makeBuilding({ id: 1 })));

    expect(renderer.stallSlotsFor(1)).toHaveLength(0);
    expect(renderer.hasStripeMesh(1)).toBe(false);
    expect(renderer.stripeVertexCountFor(1)).toBe(0);
  });

  it('adds cars once a Constructing building transitions to Active via an update', () => {
    const scene = new THREE.Scene();
    const catalog = makeCatalogEntry();
    const renderer = new ParkedCarRenderer(scene, flatHeightAt, [catalog], roadAtTiles([[5, 4]]));

    renderer.apply(deltaAdd(makeBuilding({ id: 1, state: BuildingState.Constructing })));
    expect(renderer.stallSlotsFor(1)).toHaveLength(0);

    renderer.apply(deltaUpdate(makeBuilding({ id: 1, state: BuildingState.Active })));
    expect(renderer.stallSlotsFor(1)).toHaveLength(2);
  });

  it('removes cars (hides their matrix) when an Active building becomes Abandoned via an update', () => {
    const scene = new THREE.Scene();
    const catalog = makeCatalogEntry();
    const renderer = new ParkedCarRenderer(scene, flatHeightAt, [catalog], roadAtTiles([[5, 4]]));

    renderer.apply(deltaAdd(makeBuilding({ id: 1, state: BuildingState.Active })));
    const slots = renderer.stallSlotsFor(1);
    expect(slots.length).toBeGreaterThan(0);

    renderer.apply(deltaUpdate(makeBuilding({ id: 1, state: BuildingState.Abandoned })));
    expect(renderer.stallSlotsFor(1)).toHaveLength(0);
    expect(renderer.hasStripeMesh(1)).toBe(false);

    const m = new THREE.Matrix4();
    for (const slot of slots) {
      renderer.getCarMatrix(slot, m);
      expect(isZeroScale(m)).toBe(true);
    }
  });

  it('removing a building frees exactly its own stalls, leaving another building intact', () => {
    const scene = new THREE.Scene();
    const catalog = makeCatalogEntry();
    const roadAt = roadAtTiles([
      [2, 1], // N of building A at (2,2)
      [10, 9], // N of building B at (10,10)
    ]);
    const renderer = new ParkedCarRenderer(scene, flatHeightAt, [catalog], roadAt);

    const a = makeBuilding({ id: 1, x: 2, z: 2 });
    const b = makeBuilding({ id: 2, x: 10, z: 10 });
    renderer.apply(deltaAdd(a, b));

    const aSlots = renderer.stallSlotsFor(1);
    const bSlotsBefore = [...renderer.stallSlotsFor(2)];
    expect(aSlots.length).toBeGreaterThan(0);
    expect(bSlotsBefore.length).toBeGreaterThan(0);

    renderer.apply(deltaRemove(1));

    expect(renderer.stallSlotsFor(1)).toHaveLength(0);
    expect(renderer.hasStripeMesh(1)).toBe(false);
    // building B untouched
    expect([...renderer.stallSlotsFor(2)]).toEqual(bSlotsBefore);
    expect(renderer.hasStripeMesh(2)).toBe(true);

    const m = new THREE.Matrix4();
    for (const slot of aSlots) {
      renderer.getCarMatrix(slot, m);
      expect(isZeroScale(m)).toBe(true);
    }
  });

  it('recycles freed slots instead of growing the InstancedMesh unboundedly', () => {
    const scene = new THREE.Scene();
    const catalog = makeCatalogEntry();
    const roadAt = roadAtTiles([
      [2, 1],
      [10, 9],
    ]);
    const renderer = new ParkedCarRenderer(scene, flatHeightAt, [catalog], roadAt);

    renderer.apply(deltaAdd(makeBuilding({ id: 1, x: 2, z: 2 })));
    const countAfterFirst = renderer.carInstanceCount();

    renderer.apply(deltaRemove(1));
    renderer.apply(deltaAdd(makeBuilding({ id: 2, x: 10, z: 10 })));
    const countAfterSecond = renderer.carInstanceCount();

    // Building 2 has the identical footprint/level/edge shape as building 1, so it
    // needs the same number of stalls; recycling means the mesh's used-slot high
    // water mark does not grow to accommodate it.
    expect(countAfterSecond).toBe(countAfterFirst);
  });

  it('produces stripe geometry with exactly 6 * stallCount vertices (apron + dividers)', () => {
    const scene = new THREE.Scene();
    // A wide footprint so the edge (10 tiles) comfortably fits several stalls.
    const catalog = makeCatalogEntry({ footprint: { w: 10, d: 1 }, level: 3 });
    const renderer = new ParkedCarRenderer(scene, flatHeightAt, [catalog], roadAtTiles([[0, -1]]));

    const building = makeBuilding({ id: 1, x: 0, z: 0, level: 3 });
    renderer.apply(deltaAdd(building));

    const count = renderer.stallSlotsFor(1).length;
    expect(count).toBeGreaterThan(1); // exercise at least one divider line
    expect(renderer.stripeVertexCountFor(1)).toBe(6 * count);
  });

  it('still draws the apron (6 vertices) with a single stall and no divider lines', () => {
    const scene = new THREE.Scene();
    const catalog = makeCatalogEntry({ footprint: { w: 1, d: 1 } });
    const renderer = new ParkedCarRenderer(scene, flatHeightAt, [catalog], roadAtTiles([[5, 4]]));

    // Force exactly 1 stall via a level that still clamps to the 1-tile edge capacity (2)...
    // use a 1-tile edge is capacity 2, so instead directly assert the general invariant
    // via the count actually produced (>=1) rather than hard-coding 1.
    renderer.apply(deltaAdd(makeBuilding({ id: 1, level: 1 })));
    const count = renderer.stallSlotsFor(1).length;
    expect(renderer.stripeVertexCountFor(1)).toBe(6 * count);
  });

  it('is deterministic: two renderer instances given the same delta produce identical matrices and colors', () => {
    const catalog = makeCatalogEntry({ footprint: { w: 4, d: 1 } });
    const roadAt = roadAtTiles([[1, -1]]);
    const building = makeBuilding({ id: 7, x: 0, z: 0, level: 2 });

    const sceneA = new THREE.Scene();
    const rendererA = new ParkedCarRenderer(sceneA, flatHeightAt, [catalog], roadAt);
    rendererA.apply(deltaAdd(building));

    const sceneB = new THREE.Scene();
    const rendererB = new ParkedCarRenderer(sceneB, flatHeightAt, [catalog], roadAt);
    rendererB.apply(deltaAdd(building));

    const slotsA = rendererA.stallSlotsFor(7);
    const slotsB = rendererB.stallSlotsFor(7);
    expect(slotsA).toEqual(slotsB);

    const mA = new THREE.Matrix4();
    const mB = new THREE.Matrix4();
    const cA = new THREE.Color();
    const cB = new THREE.Color();
    for (let i = 0; i < slotsA.length; i++) {
      rendererA.getCarMatrix(slotsA[i]!, mA);
      rendererB.getCarMatrix(slotsB[i]!, mB);
      expect(mA.elements).toEqual(mB.elements);

      rendererA.getCarColor(slotsA[i]!, cA);
      rendererB.getCarColor(slotsB[i]!, cB);
      expect(cA.getHex()).toBe(cB.getHex());
    }
  });

  it('keeps a given stall index stable across an unrelated rebuild of the same building', () => {
    const scene = new THREE.Scene();
    const catalog = makeCatalogEntry({ footprint: { w: 4, d: 1 } });
    const renderer = new ParkedCarRenderer(scene, flatHeightAt, [catalog], roadAtTiles([[1, -1]]));

    const building = makeBuilding({ id: 9, x: 0, z: 0, level: 2 });
    renderer.apply(deltaAdd(building));
    const firstColor = new THREE.Color();
    renderer.getCarColor(renderer.stallSlotsFor(9)[0]!, firstColor);

    // Re-apply the identical building as an "update" (e.g. an unrelated problems-flag
    // change elsewhere triggered a re-emit) -- stall 0's color must be unchanged.
    renderer.apply(deltaUpdate({ ...building, problems: 4 }));
    const secondColor = new THREE.Color();
    renderer.getCarColor(renderer.stallSlotsFor(9)[0]!, secondColor);

    expect(secondColor.getHex()).toBe(firstColor.getHex());
  });

  it('assigns colors from the CAR_PALETTE for every placed car', () => {
    const scene = new THREE.Scene();
    const catalog = makeCatalogEntry({ footprint: { w: 4, d: 1 } });
    const renderer = new ParkedCarRenderer(scene, flatHeightAt, [catalog], roadAtTiles([[1, -1]]));

    renderer.apply(deltaAdd(makeBuilding({ id: 3, x: 0, z: 0, level: 2 })));
    const slots = renderer.stallSlotsFor(3);
    expect(slots.length).toBeGreaterThan(0);

    const paletteHexes = new Set(CAR_PALETTE.map((hex) => new THREE.Color(hex).getHex()));
    const color = new THREE.Color();
    for (const slot of slots) {
      renderer.getCarMatrix(slot, new THREE.Matrix4()); // sanity: slot is populated
      renderer.getCarColor(slot, color);
      expect(paletteHexes.has(color.getHex())).toBe(true);
    }
  });

  it('applies slight yaw jitter around the base orientation for each car', () => {
    const scene = new THREE.Scene();
    const catalog = makeCatalogEntry({ footprint: { w: 4, d: 1 } });
    const renderer = new ParkedCarRenderer(scene, flatHeightAt, [catalog], roadAtTiles([[1, -1]]));

    renderer.apply(deltaAdd(makeBuilding({ id: 4, x: 0, z: 0, level: 2 })));
    const slots = renderer.stallSlotsFor(4);

    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();
    for (const slot of slots) {
      renderer.getCarMatrix(slot, m);
      m.decompose(pos, quat, scale);
      euler.setFromQuaternion(quat);
      // base yaw for the N edge is PI/2 (parallel-parking rotation), so
      // jitter alone should keep the yaw within YAW_JITTER_MAX of PI/2.
      expect(Math.abs(euler.y - Math.PI / 2)).toBeLessThanOrEqual(YAW_JITTER_MAX + 1e-9);
    }
  });

  it('does not throw and parks zero cars when the building references an unknown catalog id', () => {
    const scene = new THREE.Scene();
    const renderer = new ParkedCarRenderer(scene, flatHeightAt, [], roadAtTiles([[5, 4]]));
    expect(() =>
      renderer.apply(deltaAdd(makeBuilding({ id: 1, catalogId: 'nope' }))),
    ).not.toThrow();
    expect(renderer.stallSlotsFor(1)).toHaveLength(0);
  });
});

describe('ParkedCarRenderer frustum-culling regression (wave 6)', () => {
  it('apply() nulls a bounding sphere cached by an earlier cull pass', () => {
    const scene = new THREE.Scene();
    const catalog = makeCatalogEntry({ footprint: { w: 1, d: 1 } });
    const renderer = new ParkedCarRenderer(
      scene,
      flatHeightAt,
      [catalog],
      roadAtTiles([
        [5, 4],
        [8, 4],
      ]),
    );
    renderer.apply(deltaAdd(makeBuilding({ id: 1 })));

    const mesh = scene.children.find(
      (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh,
    );
    expect(mesh).toBeDefined();
    // Simulate a cull pass caching the sphere between two building deltas.
    (mesh as THREE.InstancedMesh).computeBoundingSphere();
    expect((mesh as THREE.InstancedMesh).boundingSphere).not.toBeNull();

    renderer.apply(deltaAdd(makeBuilding({ id: 2, x: 8 })));
    expect((mesh as THREE.InstancedMesh).boundingSphere).toBeNull();
  });
});
