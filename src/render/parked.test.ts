import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  BAY_DEPTH_TILES,
  BAY_END_MARGIN_TILES,
  BAY_PITCH_TILES,
  bayRowStart,
  CAR_PALETTE,
  computeStallCount,
  computeStallPlacements,
  CURB_CUT_WIDTH_M,
  findRoadFacingEdge,
  frontageInsetTiles,
  IND_NIGHT_OCCUPANCY,
  lotOccupancy,
  ParkedCarRenderer,
  sidewalkDepthMeters,
  stallColorIndex,
  stallKind,
  stallOccupancyThreshold,
  stallOccupied,
  stallVariantIndex,
  stallYawJitter,
  vergeDepthMeters,
  YAW_JITTER_MAX,
  type RoadFacingEdge,
} from './parked';
import {
  BuildingCatalogEntry,
  BuildingDelta,
  BuildingInstance,
  BuildingState,
  RoadTier,
  VehicleKind,
} from '../shared/types';
import { TILE_METERS } from '../shared/constants';
import { sizeForKind, variantScaleForKind } from './vehicles';

const COM_PITCH = BAY_PITCH_TILES.com;
const COM_DEPTH = BAY_DEPTH_TILES.com;

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

/** A RoadFacingEdge for the pure-geometry tests, whose road tile is irrelevant. */
function edgeOf(side: 'N' | 'E' | 'S' | 'W', edgeTiles: number): RoadFacingEdge {
  return { side, edgeTiles, roadTileX: 0, roadTileZ: 0 };
}

describe('findRoadFacingEdge', () => {
  it('selects N when only the north strip is road-adjacent', () => {
    // 1x1 footprint at (5,5): N strip is (5,4)
    const edge = findRoadFacingEdge(5, 5, 1, 1, roadAtTiles([[5, 4]]));
    expect(edge).toEqual({ side: 'N', edgeTiles: 1, roadTileX: 5, roadTileZ: 4 });
  });

  it('selects E when only the east strip is road-adjacent', () => {
    // 1x2 footprint (w=1,d=2) at (5,5) occupies z=5..6; E strip is x=6, z=5..6
    const edge = findRoadFacingEdge(5, 5, 1, 2, roadAtTiles([[6, 6]]));
    expect(edge).toEqual({ side: 'E', edgeTiles: 2, roadTileX: 6, roadTileZ: 6 });
  });

  it('selects S when only the south strip is road-adjacent', () => {
    // 3x1 footprint (w=3,d=1) at (2,2) occupies x=2..4; S strip is z=3, x=2..4
    const edge = findRoadFacingEdge(2, 2, 3, 1, roadAtTiles([[3, 3]]));
    expect(edge).toEqual({ side: 'S', edgeTiles: 3, roadTileX: 3, roadTileZ: 3 });
  });

  it('selects W when only the west strip is road-adjacent', () => {
    // 1x2 footprint at (5,5); W strip is x=4, z=5..6
    const edge = findRoadFacingEdge(5, 5, 1, 2, roadAtTiles([[4, 5]]));
    expect(edge).toEqual({ side: 'W', edgeTiles: 2, roadTileX: 4, roadTileZ: 5 });
  });

  it('detects a road tile anywhere along a multi-tile strip, not just its first tile', () => {
    // 3x2 footprint (w=3,d=2) at (2,2) occupies x=2..4,z=2..3; S strip z=4,x=2..4;
    // road only at the middle tile (3,4).
    const edge = findRoadFacingEdge(2, 2, 3, 2, roadAtTiles([[3, 4]]));
    expect(edge).toEqual({ side: 'S', edgeTiles: 3, roadTileX: 3, roadTileZ: 4 });
  });

  it('reports the road tile the lot driveway meets', () => {
    // 3x1 at (2,2): only (4,1) is road, so the N strip's road tile is x=4.
    const edge = findRoadFacingEdge(2, 2, 3, 1, roadAtTiles([[4, 1]]));
    expect(edge).toMatchObject({ side: 'N', roadTileX: 4, roadTileZ: 1 });
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
    expect(findRoadFacingEdge(2, 2, 4, 3, roadAt)).toMatchObject({ side: 'N', edgeTiles: 4 });

    const roadAtE = roadAtTiles([[6, 2]]); // E of the same footprint (x+w=6)
    expect(findRoadFacingEdge(2, 2, 4, 3, roadAtE)).toMatchObject({ side: 'E', edgeTiles: 3 });
  });
});

// ---------------------------------------------------------------------------
// Pure functions: apron reach to the sidewalk + curb cut
// ---------------------------------------------------------------------------

describe('vergeDepthMeters / sidewalkDepthMeters', () => {
  it('leaves a grass verge on a narrow street and none on a wide one', () => {
    // A two-lane tile is mostly verge; a highway's sidewalk already reaches the edge.
    expect(vergeDepthMeters(RoadTier.TwoLane)).toBeGreaterThan(0);
    expect(vergeDepthMeters(RoadTier.Highway)).toBe(0);
  });

  it('never reaches past the tile boundary or into the carriageway', () => {
    for (const tier of [RoadTier.Alley, RoadTier.TwoLane, RoadTier.Avenue, RoadTier.Highway]) {
      const verge = vergeDepthMeters(tier);
      const walk = sidewalkDepthMeters(tier);
      expect(verge).toBeGreaterThanOrEqual(0);
      expect(walk).toBeGreaterThanOrEqual(0);
      expect(verge + walk).toBeLessThanOrEqual(TILE_METERS / 2 + 1e-9);
    }
  });
});

// ---------------------------------------------------------------------------
// Pure functions: lot occupancy over the day
// ---------------------------------------------------------------------------

describe('lotOccupancy', () => {
  const at = (hour: number): number => hour / 24;

  it('empties commercial lots overnight and fills them for trading hours', () => {
    expect(lotOccupancy('com', at(3))).toBe(0);
    expect(lotOccupancy('com', at(6))).toBe(0);
    expect(lotOccupancy('com', at(13))).toBe(1);
    expect(lotOccupancy('com', at(23))).toBe(0);
  });

  it('ramps commercial lots up in the morning and down in the evening', () => {
    expect(lotOccupancy('com', at(9))).toBeGreaterThan(0);
    expect(lotOccupancy('com', at(9))).toBeLessThan(1);
    expect(lotOccupancy('com', at(20))).toBeGreaterThan(0);
    expect(lotOccupancy('com', at(20))).toBeLessThan(1);
    expect(lotOccupancy('com', at(9))).toBeLessThan(lotOccupancy('com', at(10)));
  });

  it('keeps a late shift at industrial lots all night, and fills them by day', () => {
    expect(lotOccupancy('ind', at(2))).toBeCloseTo(IND_NIGHT_OCCUPANCY, 9);
    expect(lotOccupancy('ind', at(22))).toBeCloseTo(IND_NIGHT_OCCUPANCY, 9);
    expect(lotOccupancy('ind', at(12))).toBe(1);
    // Industry opens before the shops do.
    expect(lotOccupancy('ind', at(7))).toBeGreaterThan(lotOccupancy('com', at(7)));
  });

  it('stays within 0..1 all day and wraps whole days', () => {
    for (let h = 0; h < 24; h += 0.25) {
      for (const category of ['com', 'ind'] as const) {
        const v = lotOccupancy(category, at(h));
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
    expect(lotOccupancy('com', at(13) + 3)).toBe(lotOccupancy('com', at(13)));
    expect(lotOccupancy('com', at(13) - 2)).toBe(lotOccupancy('com', at(13)));
  });
});

describe('stallOccupied', () => {
  it('spreads thresholds across a row so cars arrive a few at a time', () => {
    const thresholds = Array.from({ length: 12 }, (_, i) => stallOccupancyThreshold(42, i));
    for (const t of thresholds) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(1);
    }
    expect(new Set(thresholds.map((t) => t.toFixed(4))).size).toBeGreaterThan(8);
    expect(stallOccupancyThreshold(42, 3)).toBe(stallOccupancyThreshold(42, 3)); // deterministic
  });

  it('fills a commercial row monotonically as the day ramps up', () => {
    const filledAt = (hour: number): number => {
      let n = 0;
      for (let i = 0; i < 12; i++) if (stallOccupied('com', 42, i, hour / 24)) n += 1;
      return n;
    };
    expect(filledAt(3)).toBe(0); // shut
    expect(filledAt(13)).toBe(12); // peak trade
    expect(filledAt(9)).toBeGreaterThanOrEqual(filledAt(8));
    expect(filledAt(10)).toBeGreaterThanOrEqual(filledAt(9));
    expect(filledAt(9)).toBeLessThan(12); // still filling, not a blink to full
  });

  it('leaves a few industrial vehicles overnight instead of an empty lot', () => {
    let n = 0;
    for (let i = 0; i < 20; i++) if (stallOccupied('ind', 7, i, 2 / 24)) n += 1;
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(20);
  });
});

// ---------------------------------------------------------------------------
// Pure function: frontageInsetTiles (body-setback source of truth)
// ---------------------------------------------------------------------------

describe('frontageInsetTiles', () => {
  const N_EDGE = edgeOf('N', 2);

  it('returns the com bay depth for a commercial building with a road-facing edge', () => {
    expect(frontageInsetTiles('com', N_EDGE)).toBe(BAY_DEPTH_TILES.com);
    expect(frontageInsetTiles('com', edgeOf('W', 1))).toBe(BAY_DEPTH_TILES.com);
  });

  it('returns the ind bay depth for an industrial building with a road-facing edge', () => {
    expect(frontageInsetTiles('ind', N_EDGE)).toBe(BAY_DEPTH_TILES.ind);
    expect(frontageInsetTiles('ind', edgeOf('E', 3))).toBe(BAY_DEPTH_TILES.ind);
  });

  it('returns 0 when no road-facing edge was found', () => {
    expect(frontageInsetTiles('com', null)).toBe(0);
    expect(frontageInsetTiles('ind', null)).toBe(0);
  });

  it('returns 0 for every category parked.ts gives no bays', () => {
    for (const category of ['res', 'service', 'utility', 'park', 'transit']) {
      expect(frontageInsetTiles(category, N_EDGE)).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Pure function: computeStallCount
// ---------------------------------------------------------------------------

describe('computeStallCount', () => {
  it('uses level + 1 when the edge has ample capacity', () => {
    expect(computeStallCount(1, 20, COM_PITCH)).toBe(2);
    expect(computeStallCount(2, 20, COM_PITCH)).toBe(3);
    expect(computeStallCount(3, 20, COM_PITCH)).toBe(4);
  });

  it('clamps to the margin-trimmed bay capacity when it is the binding constraint', () => {
    // floor((1 - 2*margin) / pitch) car bays fit a 1-tile edge.
    const capacity = Math.floor((1 - 2 * BAY_END_MARGIN_TILES) / COM_PITCH);
    expect(computeStallCount(9, 1, COM_PITCH)).toBe(capacity);
    // Truck bays are wider, so fewer fit the same edge.
    const truckCapacity = Math.floor((1 - 2 * BAY_END_MARGIN_TILES) / BAY_PITCH_TILES.ind);
    expect(computeStallCount(9, 1, BAY_PITCH_TILES.ind)).toBe(truckCapacity);
    expect(truckCapacity).toBeLessThan(capacity);
  });

  it('never returns a negative count', () => {
    expect(computeStallCount(0, 1, COM_PITCH)).toBeGreaterThanOrEqual(0);
  });
});

describe('stallKind / stallVariantIndex', () => {
  it('commercial lots park only cars', () => {
    for (let i = 0; i < 20; i++) expect(stallKind('com', 7, i)).toBe(VehicleKind.Car);
  });

  it('industrial lots mix trucks with some cars', () => {
    const kinds = new Set<number>();
    for (let id = 1; id <= 10; id++) for (let i = 0; i < 4; i++) kinds.add(stallKind('ind', id, i));
    expect(kinds.has(VehicleKind.Truck)).toBe(true);
    expect(kinds.has(VehicleKind.Car)).toBe(true);
  });

  it('variant index stays within the kind variant count and varies', () => {
    const carVariants = new Set<number>();
    for (let i = 0; i < 30; i++) {
      const v = stallVariantIndex(5, i, VehicleKind.Car);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(3);
      carVariants.add(v);
    }
    expect(carVariants.size).toBeGreaterThan(1);
    for (let i = 0; i < 30; i++) {
      const v = stallVariantIndex(5, i, VehicleKind.Truck);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(2);
    }
  });

  it('parked vehicles never touch: every bay pitch exceeds the widest vehicle in it', () => {
    // Commercial car bays vs the widest car variant.
    let maxCarW = 0;
    for (let v = 0; v < 3; v++)
      maxCarW = Math.max(
        maxCarW,
        sizeForKind(VehicleKind.Car)[0] * variantScaleForKind(VehicleKind.Car, v)[0],
      );
    expect(COM_PITCH * TILE_METERS).toBeGreaterThan(maxCarW);
    // Industrial truck bays vs the widest truck variant.
    let maxTruckW = 0;
    for (let v = 0; v < 2; v++)
      maxTruckW = Math.max(
        maxTruckW,
        sizeForKind(VehicleKind.Truck)[0] * variantScaleForKind(VehicleKind.Truck, v)[0],
      );
    expect(BAY_PITCH_TILES.ind * TILE_METERS).toBeGreaterThan(maxTruckW);
  });

  it('perpendicular vehicles fit inside their bay depth (longest variant included)', () => {
    let maxCarL = 0;
    for (let v = 0; v < 3; v++)
      maxCarL = Math.max(
        maxCarL,
        sizeForKind(VehicleKind.Car)[2] * variantScaleForKind(VehicleKind.Car, v)[2],
      );
    expect(COM_DEPTH * TILE_METERS).toBeGreaterThan(maxCarL);
    let maxTruckL = 0;
    for (let v = 0; v < 2; v++)
      maxTruckL = Math.max(
        maxTruckL,
        sizeForKind(VehicleKind.Truck)[2] * variantScaleForKind(VehicleKind.Truck, v)[2],
      );
    expect(BAY_DEPTH_TILES.ind * TILE_METERS).toBeGreaterThan(maxTruckL);
  });
});

// ---------------------------------------------------------------------------
// Pure function: computeStallPlacements
// ---------------------------------------------------------------------------

describe('computeStallPlacements', () => {
  const pitchM = COM_PITCH * TILE_METERS;
  const halfDepthM = (COM_DEPTH * TILE_METERS) / 2;
  const place = (edge: RoadFacingEdge, count: number): ReturnType<typeof computeStallPlacements> =>
    computeStallPlacements(5, 5, 1, 1, edge, count, COM_PITCH, COM_DEPTH);

  it('spaces consecutive bays by the pitch', () => {
    const edge = edgeOf('N', 5);
    const placements = computeStallPlacements(2, 2, 5, 1, edge, 3, COM_PITCH, COM_DEPTH);
    expect(placements).toHaveLength(3);
    expect(placements[1]!.worldX - placements[0]!.worldX).toBeCloseTo(pitchM, 6);
    expect(placements[2]!.worldX - placements[1]!.worldX).toBeCloseTo(pitchM, 6);
  });

  it('centers the bay row on the frontage', () => {
    const edge = edgeOf('N', 5);
    const placements = computeStallPlacements(2, 2, 5, 1, edge, 3, COM_PITCH, COM_DEPTH);
    const edgeCenterX = 2 * TILE_METERS + (5 * TILE_METERS) / 2;
    const rowCenterX = (placements[0]!.worldX + placements[2]!.worldX) / 2;
    expect(rowCenterX).toBeCloseTo(edgeCenterX, 6);
    // bayRowStart is the pure helper behind that centering.
    expect(bayRowStart(5, 3, COM_PITCH)).toBeCloseTo((5 * TILE_METERS - 3 * pitchM) / 2, 6);
  });

  it('seats the N row half a bay depth INWARD (south, onto the lot)', () => {
    const [p] = place(edgeOf('N', 1), 1);
    // building's north edge line is at z=5*16=80; the vehicle sits centered in
    // its bay, half the bay depth INTO the lot (larger z), never on the road.
    expect(p!.worldZ).toBeCloseTo(80 + halfDepthM, 6);
  });

  it('seats the S row half a bay depth INWARD (north, onto the lot)', () => {
    const [p] = place(edgeOf('S', 1), 1);
    expect(p!.worldZ).toBeCloseTo(96 - halfDepthM, 6);
  });

  it('seats the E row half a bay depth INWARD (west, onto the lot)', () => {
    const [p] = place(edgeOf('E', 1), 1);
    expect(p!.worldX).toBeCloseTo(96 - halfDepthM, 6);
  });

  it('seats the W row half a bay depth INWARD (east, onto the lot)', () => {
    const [p] = place(edgeOf('W', 1), 1);
    expect(p!.worldX).toBeCloseTo(80 + halfDepthM, 6);
  });

  it('gives each of the four sides a distinct base yaw', () => {
    const yaws = (['N', 'E', 'S', 'W'] as const).map(
      (side) => place(edgeOf(side, 1), 1)[0]!.baseYaw,
    );
    expect(new Set(yaws).size).toBe(4);
  });

  it('base yaw points the kit nose (+Z) INWARD — perpendicular, nose-in parking', () => {
    const yawFor = (side: 'N' | 'E' | 'S' | 'W'): number => place(edgeOf(side, 1), 1)[0]!.baseYaw;
    // rotationY(yaw) maps local +Z to world (sin yaw, cos yaw); inward for an
    // N-side lot (road to its north) is world +Z -> yaw 0, and so on around.
    expect(yawFor('N')).toBeCloseTo(0, 10);
    expect(yawFor('S')).toBeCloseTo(Math.PI, 10);
    expect(yawFor('E')).toBeCloseTo(-Math.PI / 2, 10);
    expect(yawFor('W')).toBeCloseTo(Math.PI / 2, 10);
  });

  it('returns an empty array for count 0', () => {
    expect(place(edgeOf('N', 1), 0)).toEqual([]);
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

describe('ParkedCarRenderer frontage apron', () => {
  /** World-space bounds of a building's merged apron + bay-line geometry. */
  function stripeBounds(
    renderer: ParkedCarRenderer,
    buildingId: number,
  ): { minX: number; maxX: number; minZ: number; maxZ: number } {
    const mesh = renderer.stripeMeshFor(buildingId)!;
    const position = mesh.geometry.getAttribute('position')!;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < position.count; i++) {
      minX = Math.min(minX, position.getX(i));
      maxX = Math.max(maxX, position.getX(i));
      minZ = Math.min(minZ, position.getZ(i));
      maxZ = Math.max(maxZ, position.getZ(i));
    }
    return { minX, maxX, minZ, maxZ };
  }

  /** A 3-wide commercial lot at (5,5) fronting a two-lane street to its north. */
  function northFrontingLot(): { renderer: ParkedCarRenderer; scene: THREE.Scene } {
    const scene = new THREE.Scene();
    const catalog = makeCatalogEntry({ footprint: { w: 3, d: 2 } });
    const renderer = new ParkedCarRenderer(
      scene,
      flatHeightAt,
      [catalog],
      roadAtTiles([[5, 4]]),
      () => RoadTier.TwoLane,
    );
    renderer.apply(deltaAdd(makeBuilding({ id: 1, level: 3 })));
    return { renderer, scene };
  }

  it('paves the FULL frontage length, not just the bay row', () => {
    const { renderer } = northFrontingLot();
    const { minX, maxX } = stripeBounds(renderer, 1);
    // The lot spans tiles x=5..7, so its pavement must span that whole width.
    expect(minX).toBeCloseTo(5 * TILE_METERS, 3);
    expect(maxX).toBeCloseTo(8 * TILE_METERS, 3);
  });

  it('reaches out across the verge to the sidewalk, and crosses it with a curb cut', () => {
    const { renderer } = northFrontingLot();
    const { minZ, maxZ } = stripeBounds(renderer, 1);
    const buildingEdgeZ = 5 * TILE_METERS;
    const verge = vergeDepthMeters(RoadTier.TwoLane);
    const walk = sidewalkDepthMeters(RoadTier.TwoLane);

    // Outward (north, -Z): past the footprint edge, over the verge AND the sidewalk.
    // Positions come back through a Float32 attribute, so compare at mm scale.
    expect(minZ).toBeCloseTo(buildingEdgeZ - verge - walk, 3);
    // Inward (south, +Z): still only as deep as the bay row.
    expect(maxZ).toBeCloseTo(buildingEdgeZ + BAY_DEPTH_TILES.com * TILE_METERS, 3);
  });

  it('keeps the curb cut narrower than the frontage (an entrance, not a paved street edge)', () => {
    const { renderer } = northFrontingLot();
    const mesh = renderer.stripeMeshFor(1)!;
    const position = mesh.geometry.getAttribute('position')!;
    const buildingEdgeZ = 5 * TILE_METERS;
    const beyondVerge = buildingEdgeZ - vergeDepthMeters(RoadTier.TwoLane) - 1e-6;

    let cutMinX = Infinity;
    let cutMaxX = -Infinity;
    for (let i = 0; i < position.count; i++) {
      if (position.getZ(i) > beyondVerge) continue; // not in the sidewalk band
      cutMinX = Math.min(cutMinX, position.getX(i));
      cutMaxX = Math.max(cutMaxX, position.getX(i));
    }
    expect(cutMaxX - cutMinX).toBeCloseTo(CURB_CUT_WIDTH_M, 3);
    // Centered on the frontage.
    expect((cutMinX + cutMaxX) / 2).toBeCloseTo(5 * TILE_METERS + (3 * TILE_METERS) / 2, 3);
  });

  it('stops at the footprint edge when the street is wide enough to have no verge', () => {
    const scene = new THREE.Scene();
    const catalog = makeCatalogEntry({ footprint: { w: 3, d: 2 } });
    const renderer = new ParkedCarRenderer(
      scene,
      flatHeightAt,
      [catalog],
      roadAtTiles([[5, 4]]),
      () => RoadTier.Highway,
    );
    renderer.apply(deltaAdd(makeBuilding({ id: 1, level: 3 })));
    const { minZ } = stripeBounds(renderer, 1);
    // A highway's sidewalk already reaches the tile boundary: no verge to pave.
    expect(minZ).toBeCloseTo(5 * TILE_METERS - sidewalkDepthMeters(RoadTier.Highway), 3);
  });
});

describe('ParkedCarRenderer occupancy over the day', () => {
  function comLot(): ParkedCarRenderer {
    const scene = new THREE.Scene();
    const catalog = makeCatalogEntry({ footprint: { w: 4, d: 2 } });
    const renderer = new ParkedCarRenderer(scene, flatHeightAt, [catalog], roadAtTiles([[5, 4]]));
    renderer.apply(deltaAdd(makeBuilding({ id: 1, level: 3 })));
    return renderer;
  }

  it('empties a commercial lot overnight and fills it at midday', () => {
    const renderer = comLot();
    const stalls = renderer.stallSlotsFor(1).length;
    expect(stalls).toBeGreaterThan(0);

    renderer.setDayFraction(3 / 24);
    expect(renderer.occupiedStallCount(1)).toBe(0);

    renderer.setDayFraction(13 / 24);
    expect(renderer.occupiedStallCount(1)).toBe(stalls);
  });

  it('hides a departed car by zeroing its transform, and restores it on return', () => {
    const renderer = comLot();
    const ref = renderer.stallSlotsFor(1)[0]!;
    const m = new THREE.Matrix4();

    renderer.setDayFraction(13 / 24);
    renderer.getCarMatrix(ref, m);
    const parked = m.clone();
    expect(parked.elements[0]).not.toBe(0);

    renderer.setDayFraction(3 / 24);
    renderer.getCarMatrix(ref, m);
    expect(m.elements[0]).toBe(0); // gone for the night

    renderer.setDayFraction(13 / 24);
    renderer.getCarMatrix(ref, m);
    expect(m.toArray()).toEqual(parked.toArray()); // back in the same bay
  });

  it('opens a lot that finishes building overnight with an empty forecourt', () => {
    const scene = new THREE.Scene();
    const catalog = makeCatalogEntry({ footprint: { w: 4, d: 2 } });
    const renderer = new ParkedCarRenderer(scene, flatHeightAt, [catalog], roadAtTiles([[5, 4]]));
    renderer.setDayFraction(2 / 24);
    renderer.apply(deltaAdd(makeBuilding({ id: 1, level: 3 })));

    expect(renderer.occupiedStallCount(1)).toBe(0);
    const m = new THREE.Matrix4();
    renderer.getCarMatrix(renderer.stallSlotsFor(1)[0]!, m);
    expect(m.elements[0]).toBe(0);
  });

  it('keeps a few industrial vehicles through the night', () => {
    const scene = new THREE.Scene();
    const industry = makeCatalogEntry({ category: 'ind', zone: 5, footprint: { w: 6, d: 3 } });
    const renderer = new ParkedCarRenderer(scene, flatHeightAt, [industry], roadAtTiles([[5, 4]]));
    renderer.apply(deltaAdd(makeBuilding({ id: 1, level: 3 })));
    const stalls = renderer.stallSlotsFor(1).length;

    renderer.setDayFraction(2 / 24);
    const night = renderer.occupiedStallCount(1);
    renderer.setDayFraction(12 / 24);
    expect(night).toBeLessThan(renderer.occupiedStallCount(1));
    expect(stalls).toBeGreaterThan(0);
  });
});

describe('ParkedCarRenderer', () => {
  it('places min(level+1, capacity) cars for an Active, road-adjacent building', () => {
    const scene = new THREE.Scene();
    const catalog = makeCatalogEntry({ footprint: { w: 1, d: 1 } });
    const renderer = new ParkedCarRenderer(scene, flatHeightAt, [catalog], roadAtTiles([[5, 4]]));

    const building = makeBuilding({ id: 1, level: 1 });
    renderer.apply(deltaAdd(building));

    expect(renderer.stallSlotsFor(1)).toHaveLength(2); // min(1+1, capacity 4) = 2
    expect(renderer.carMeshCount()).toBe(1); // commercial lots park cars only -> one kind pool
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

  it('industrial lots mix in TRUCK kit models; commercial lots park only cars, sized in real meters', () => {
    const scene = new THREE.Scene();
    const factory = makeCatalogEntry({
      id: 'factory',
      category: 'ind',
      zone: 5,
      footprint: { w: 4, d: 1 },
    });
    const shop = makeCatalogEntry({
      id: 'shop',
      category: 'com',
      zone: 3,
      footprint: { w: 4, d: 1 },
    });
    const renderer = new ParkedCarRenderer(
      scene,
      flatHeightAt,
      [factory, shop],
      roadAtTiles([
        [5, 4],
        [20, 4],
      ]),
    );
    // High level so multiple stalls exercise the deterministic kind mix.
    renderer.apply(deltaAdd(makeBuilding({ id: 1, catalogId: 'factory', level: 9 })));
    renderer.apply(deltaAdd(makeBuilding({ id: 2, catalogId: 'shop', x: 20, level: 9 })));

    // Industrial stall kinds follow the pure stallKind rule (trucks + some cars).
    const indKinds = renderer.stallSlotsFor(1).map((ref) => ref.kind);
    indKinds.forEach((kind, i) => expect(kind).toBe(stallKind('ind', 1, i)));

    // Commercial stalls are all cars, instanced at the kit's real car size.
    const comRefs = renderer.stallSlotsFor(2);
    expect(comRefs.length).toBeGreaterThan(0);
    const m = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    for (const ref of comRefs) {
      expect(ref.kind).toBe(VehicleKind.Car);
      renderer.getCarMatrix(ref, m);
      m.decompose(p, q, scale);
      // car height 1.5 m x variant scale (0.94..1.12)
      expect(scale.y).toBeGreaterThan(1.3);
      expect(scale.y).toBeLessThan(1.8);
    }
  });

  it('clamps stall count to edge capacity for a high level on a short edge', () => {
    const scene = new THREE.Scene();
    const catalog = makeCatalogEntry({ footprint: { w: 1, d: 1 } });
    const renderer = new ParkedCarRenderer(scene, flatHeightAt, [catalog], roadAtTiles([[5, 4]]));

    const building = makeBuilding({ id: 1, level: 9 }); // level+1=10, but a 1-tile edge caps out
    renderer.apply(deltaAdd(building));

    const capacity = Math.floor((1 - 2 * BAY_END_MARGIN_TILES) / COM_PITCH);
    expect(renderer.stallSlotsFor(1)).toHaveLength(capacity);
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

  it('produces conforming stripe geometry that grows with the bay count (apron + bay lines)', () => {
    const scene = new THREE.Scene();
    // A wide footprint so the edge (10 tiles) comfortably fits several stalls.
    const catalog = makeCatalogEntry({ footprint: { w: 10, d: 1 }, level: 3 });
    const renderer = new ParkedCarRenderer(scene, flatHeightAt, [catalog], roadAtTiles([[0, -1]]));

    renderer.apply(deltaAdd(makeBuilding({ id: 1, x: 0, z: 0, level: 3 })));
    const countBig = renderer.stallSlotsFor(1).length;
    expect(countBig).toBeGreaterThan(1);
    const vertsBig = renderer.stripeVertexCountFor(1);
    // Conforming quads are triangle soups: always whole triangles.
    expect(vertsBig).toBeGreaterThan(0);
    expect(vertsBig % 3).toBe(0);

    renderer.apply(deltaUpdate(makeBuilding({ id: 1, x: 0, z: 0, level: 0 })));
    const countSmall = renderer.stallSlotsFor(1).length;
    expect(countSmall).toBeLessThan(countBig);
    // Fewer bays -> shorter apron + fewer bay lines -> strictly less geometry.
    expect(renderer.stripeVertexCountFor(1)).toBeLessThan(vertsBig);
  });

  it('subdivides the apron into conforming cells (more than one quad even for one bay)', () => {
    const scene = new THREE.Scene();
    const catalog = makeCatalogEntry({ footprint: { w: 1, d: 1 } });
    const renderer = new ParkedCarRenderer(scene, flatHeightAt, [catalog], roadAtTiles([[5, 4]]));

    renderer.apply(deltaAdd(makeBuilding({ id: 1, level: 0 })));
    expect(renderer.stallSlotsFor(1)).toHaveLength(1);
    // One flat 4-corner quad would be exactly 6 vertices; the conforming
    // subdivision (<= 2 m cells over a ~4 m x 5.3 m apron + bay lines) is far more.
    expect(renderer.stripeVertexCountFor(1)).toBeGreaterThan(6);
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
      // base yaw for the N edge is 0 (nose-in, pointing into the lot), so
      // jitter alone should keep the yaw within YAW_JITTER_MAX of 0.
      expect(Math.abs(euler.y)).toBeLessThanOrEqual(YAW_JITTER_MAX + 1e-9);
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
