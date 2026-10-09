import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  adjacentRoadsCross,
  CAR_PALETTE,
  computeRoadsideStallCount,
  computeRoadsideStallPlacements,
  curbCutTileFor,
  roadsideDepthTiles,
  hasOwnLotParking,
  lotStallPlacement,
  IND_NIGHT_OCCUPANCY,
  kerbAllowance,
  kerbCarClearOfJunctions,
  kerbSideFacing,
  kerbTileAllowsParking,
  lotOccupancy,
  ParkedCarRenderer,
  stallColorIndex,
  stallKind,
  stallOccupancyThreshold,
  stallOccupied,
  stallVariantIndex,
  stallYawJitter,
  tierAllowsRoadsideParking,
  usesRoadsideParking,
  YAW_JITTER_MAX,
} from './parked';
import {
  findRoadFacingEdge,
  sidewalkDepthMeters,
  streetLookupOf,
  vergeDepthMeters,
  type RoadFacingEdge,
} from './frontage';
import {
  BuildingCatalogEntry,
  BuildingDelta,
  BuildingInstance,
  BuildingState,
  RoadTier,
  VehicleKind,
  ZoneType,
} from '../shared/types';
import { TILE_METERS } from '../shared/constants';
import type { RoadProfile } from '../shared/types';
import { RoadMeshRenderer, SIDEWALK_WIDTH_M } from './roadsmesh';
import { LotRenderer } from './lots';
import { sizeForKind, variantScaleForKind } from './vehicles';
import { buildTileSet, hasCrossingRoad, type FurnitureRoadTile } from './roadfurniture';
import { RoadFlow, storedFlow } from '../shared/types';
import {
  carriagewayHalfWidthOf,
  composeProfile,
  corridorHalfProfile,
  NO_EDITS,
  PARKING_STYLES,
  presetProfileForTier,
} from '../shared/roadprofile';
import { CURB_CUT_M, STALL_LENGTH_M, STALL_WIDTH_M } from '../shared/parkingcode';
import { lotPlanFor, type LotPlan } from './lotplan';

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

describe('kerb rows measure from the street’s own cross-section', () => {
  const parked: RoadProfile = {
    class: 'local',
    pieces: [
      { kind: 'sidewalk', width: 1.875 },
      { kind: 'parking', width: 2.25 },
      { kind: 'travel', width: 3.75, flow: 'back' },
      { kind: 'travel', width: 3.75, flow: 'fwd' },
      { kind: 'parking', width: 2.25 },
      { kind: 'sidewalk', width: 1.875 },
    ],
  };

  it('a wider carriageway leaves less verge, so the kerb row sits nearer the lot', () => {
    const tier = RoadTier.TwoLane;
    expect(vergeDepthMeters(tier, parked)).toBeLessThan(vergeDepthMeters(tier));
    expect(vergeDepthMeters(tier, parked)).toBeCloseTo(TILE_METERS / 2 - 6 - SIDEWALK_WIDTH_M, 6);
    expect(sidewalkDepthMeters(tier, parked)).toBeCloseTo(SIDEWALK_WIDTH_M, 6);
    expect(roadsideDepthTiles(tier, parked)).toBeLessThan(roadsideDepthTiles(tier));
  });

  it('without a profile the depths are the tier’s, exactly as before', () => {
    const tier = RoadTier.TwoLane;
    expect(vergeDepthMeters(tier, undefined)).toBe(vergeDepthMeters(tier));
    expect(roadsideDepthTiles(tier, undefined)).toBe(roadsideDepthTiles(tier));
  });
});

describe('vergeDepthMeters / sidewalkDepthMeters', () => {
  it('leaves a grass verge on a narrow street and none on a wide one', () => {
    // A two-lane tile is mostly verge. A motorway is the widest thing the grid
    // lays and keeps only a kerb, so what is left beside it is verge too —
    // grass, not somewhere to walk, which is the point of it being a kerb.
    expect(vergeDepthMeters(RoadTier.TwoLane)).toBeGreaterThan(vergeDepthMeters(RoadTier.Highway));
    expect(sidewalkDepthMeters(RoadTier.Highway)).toBeLessThan(SIDEWALK_WIDTH_M);
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

/** A building's lot plan at (x, z) for the tests, which must have one. */
function planOf(
  entry: BuildingCatalogEntry,
  x: number,
  z: number,
  roadAt: (x: number, z: number) => boolean,
  rotation: 0 | 1 | 2 | 3 = 0,
): LotPlan {
  const plan = lotPlanFor(entry, x, z, roadAt, rotation);
  if (!plan) throw new Error('expected a lot plan');
  return plan;
}

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

  it('parked vehicles never touch: a 9 ft stall is wider than the widest car or truck in it', () => {
    let maxCarW = 0;
    for (let v = 0; v < 3; v++)
      maxCarW = Math.max(
        maxCarW,
        sizeForKind(VehicleKind.Car)[0] * variantScaleForKind(VehicleKind.Car, v)[0],
      );
    expect(STALL_WIDTH_M).toBeGreaterThan(maxCarW);
    let maxTruckW = 0;
    for (let v = 0; v < 2; v++)
      maxTruckW = Math.max(
        maxTruckW,
        sizeForKind(VehicleKind.Truck)[0] * variantScaleForKind(VehicleKind.Truck, v)[0],
      );
    expect(STALL_WIDTH_M).toBeGreaterThan(maxTruckW);
  });

  it('every car fits inside its 18 ft stall, the longest variant included', () => {
    let maxCarL = 0;
    for (let v = 0; v < 3; v++)
      maxCarL = Math.max(
        maxCarL,
        sizeForKind(VehicleKind.Car)[2] * variantScaleForKind(VehicleKind.Car, v)[2],
      );
    expect(STALL_LENGTH_M).toBeGreaterThan(maxCarL);
  });
});

// ---------------------------------------------------------------------------
// Pure function: lotStallPlacement
// ---------------------------------------------------------------------------

describe('lotStallPlacement', () => {
  /** A 2x2 works at (5, 5), its street on `side`. */
  const works = makeCatalogEntry({
    category: 'ind',
    zone: ZoneType.Industrial,
    footprint: { w: 2, d: 2 },
  });
  const roadOn = (side: 'N' | 'E' | 'S' | 'W'): ((x: number, z: number) => boolean) =>
    ({
      N: roadAtTiles([[5, 4]]),
      S: roadAtTiles([[5, 7]]),
      E: roadAtTiles([[7, 5]]),
      W: roadAtTiles([[4, 5]]),
    })[side];

  it('stands each car in the middle of its stall, on the lot', () => {
    for (const side of ['N', 'E', 'S', 'W'] as const) {
      const plan = planOf(works, 5, 5, roadOn(side));
      for (const stall of plan.layout.stalls) {
        const p = lotStallPlacement(plan.frame, stall, 4.0);
        expect(p.worldX).toBeGreaterThan(5 * TILE_METERS);
        expect(p.worldX).toBeLessThan(7 * TILE_METERS);
        expect(p.worldZ).toBeGreaterThan(5 * TILE_METERS);
        expect(p.worldZ).toBeLessThan(7 * TILE_METERS);
      }
    }
  });

  it('parks every car square to its stall, nose-in along one of the lot axes', () => {
    for (const side of ['N', 'E', 'S', 'W'] as const) {
      const plan = planOf(works, 5, 5, roadOn(side));
      for (const stall of plan.layout.stalls) {
        const yaw = lotStallPlacement(plan.frame, stall, 4.0).baseYaw;
        const quarter = yaw / (Math.PI / 2);
        expect(Math.abs(quarter - Math.round(quarter))).toBeLessThan(1e-9);
      }
    }
  });

  it('noses a vehicle longer than its stall up to the head and leaves its tail over the aisle', () => {
    const plan = planOf(works, 5, 5, roadOn('N'));
    const stall = plan.layout.stalls[0]!;
    const centred = lotStallPlacement(plan.frame, stall, 4.0);
    const truck = lotStallPlacement(plan.frame, stall, 7.0);
    const nose = { x: Math.sin(centred.baseYaw), z: Math.cos(centred.baseYaw) };
    const shift =
      (truck.worldX - centred.worldX) * nose.x + (truck.worldZ - centred.worldZ) * nose.z;
    expect(shift).toBeCloseTo(-((7.0 - STALL_LENGTH_M) / 2 + 0.2), 6);
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

  it('leaves the verge to the lot: beyond the lot line it lays only the cut across the sidewalk', () => {
    const { renderer } = northFrontingLot();
    const position = renderer.stripeMeshFor(1)!.geometry.getAttribute('position')!;
    const buildingEdgeZ = 5 * TILE_METERS;
    const backOfSidewalk = buildingEdgeZ - vergeDepthMeters(RoadTier.TwoLane);
    for (let i = 0; i < position.count; i++) {
      if (position.getZ(i) >= buildingEdgeZ - 1e-3) continue;
      expect(position.getZ(i)).toBeLessThanOrEqual(backOfSidewalk + 1e-3);
    }
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
    // Inward (south, +Z): never past the back of the two-deep lot.
    expect(maxZ).toBeLessThanOrEqual(7 * TILE_METERS + 1e-3);
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
    expect(cutMaxX - cutMinX).toBeCloseTo(CURB_CUT_M, 3);
    // Where the lot's drive meets the street.
    const plan = planOf(
      makeCatalogEntry({ footprint: { w: 3, d: 2 } }),
      5,
      5,
      roadAtTiles([[5, 4]]),
    );
    expect(cutMinX).toBeCloseTo(5 * TILE_METERS + plan.layout.curbCut.u0, 3);
  });

  it('meets the lot’s own crossing of the verge at the back of the sidewalk, edge to edge', () => {
    const { renderer } = northFrontingLot();
    const entry = makeCatalogEntry({ footprint: { w: 3, d: 2 } });
    const roadAt = roadAtTiles([[5, 4]]);
    const scene = new THREE.Scene();
    const street = streetLookupOf(
      (x, z) => (roadAt(x, z) ? RoadTier.TwoLane : RoadTier.None),
      () => null,
    );
    new LotRenderer(scene, flatHeightAt, [entry], roadAt, street).apply(
      deltaAdd(makeBuilding({ id: 1, level: 3 })),
    );
    const lotGround = (scene.children[0] as THREE.Mesh).geometry.getAttribute('position')!;
    const buildingEdgeZ = 5 * TILE_METERS;
    const verge = vergeDepthMeters(RoadTier.TwoLane);
    const cut = planOf(entry, 5, 5, roadAt).layout.curbCut;
    // The lot paves the verge across the curb cut's width, out to the back of the sidewalk...
    let lotMinZ = Infinity;
    const crossing = { minX: Infinity, maxX: -Infinity };
    for (let i = 0; i < lotGround.count; i++) {
      lotMinZ = Math.min(lotMinZ, lotGround.getZ(i));
      const x = lotGround.getX(i);
      if (lotGround.getZ(i) >= buildingEdgeZ - 1e-3) continue;
      if (x < 5 * TILE_METERS + cut.u0 - 1e-3 || x > 5 * TILE_METERS + cut.u1 + 1e-3) continue;
      crossing.minX = Math.min(crossing.minX, x);
      crossing.maxX = Math.max(crossing.maxX, x);
    }
    expect(lotMinZ).toBeCloseTo(buildingEdgeZ - verge, 3);
    expect(crossing.minX).toBeCloseTo(5 * TILE_METERS + cut.u0, 3);
    expect(crossing.maxX).toBeCloseTo(5 * TILE_METERS + cut.u1, 3);
    // ...and the cut takes it on from there, so no band is left that nothing covers.
    const position = renderer.stripeMeshFor(1)!.geometry.getAttribute('position')!;
    let cutNearest = -Infinity;
    for (let i = 0; i < position.count; i++) {
      if (position.getZ(i) < buildingEdgeZ - 1e-3)
        cutNearest = Math.max(cutNearest, position.getZ(i));
    }
    expect(cutNearest).toBeCloseTo(buildingEdgeZ - verge, 3);
  });
});

describe('a farm on the road', () => {
  it('lines no bays, paints no apron and parks nothing at the kerb, though its jobs count as industry', () => {
    const farm = makeCatalogEntry({
      category: 'ind',
      zone: ZoneType.Agriculture,
      kind: 'crops',
      footprint: { w: 4, d: 5 },
    });
    const renderer = new ParkedCarRenderer(
      new THREE.Scene(),
      flatHeightAt,
      [farm],
      roadAtTiles([[5, 4]]),
    );
    renderer.apply(deltaAdd(makeBuilding({ id: 1, level: 1 })));
    expect(renderer.stallSlotsFor(1)).toHaveLength(0);
    expect(hasOwnLotParking(farm, 5, 5, roadAtTiles([[5, 4]]))).toBe(false);
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

  it('reports where stalls are even when the cars have gone home', () => {
    const renderer = comLot();

    renderer.setDayFraction(13 / 24);
    const midday = renderer.stallWorldPositions(1);
    expect(midday.length).toBeGreaterThan(0);

    // The mesh hides an empty stall by zeroing its transform, which would put
    // every departed car at the origin. A stall is somewhere whether or not
    // anything is standing in it, and the kerb rules are about the somewhere.
    renderer.setDayFraction(3 / 24);
    expect(renderer.occupiedStallCount(1)).toBe(0);
    expect(renderer.stallWorldPositions(1)).toEqual(midday);
    expect(midday.every((p) => p.x !== 0 || p.z !== 0)).toBe(true);
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
  it('places one car per stall the lot lays out to code, for an Active, road-adjacent building', () => {
    const scene = new THREE.Scene();
    const catalog = makeCatalogEntry({ footprint: { w: 3, d: 2 } });
    const roadAt = roadAtTiles([[5, 4]]);
    const renderer = new ParkedCarRenderer(scene, flatHeightAt, [catalog], roadAt);

    const building = makeBuilding({ id: 1, level: 1 });
    renderer.apply(deltaAdd(building));

    const stalls = planOf(catalog, 5, 5, roadAt).layout.stalls.length;
    expect(stalls).toBeGreaterThan(1);
    expect(renderer.stallSlotsFor(1)).toHaveLength(stalls);
    expect(renderer.carMeshCount()).toBe(1); // commercial lots park cars only -> one kind pool
    expect(renderer.carInstanceCount()).toBeGreaterThanOrEqual(stalls);
  });

  it('gives an apartment block no bay row or apron — it parks at the kerb, not on a forecourt', () => {
    const scene = new THREE.Scene();
    const flats = makeCatalogEntry({
      category: 'res',
      zone: ZoneType.ResMedium,
      kind: 'garden',
      footprint: { w: 2, d: 2 },
    });
    const renderer = new ParkedCarRenderer(
      scene,
      flatHeightAt,
      [flats],
      roadAtTiles([[5, 4]]),
      () => RoadTier.TwoLane,
    );

    renderer.apply(deltaAdd(makeBuilding({ id: 1, level: 2 })));

    // No apron, no painted bays: the kerb is already paved.
    expect(renderer.hasStripeMesh(1)).toBe(false);
    // But the block does line the kerb, which is the whole point of it.
    expect(renderer.stallSlotsFor(1).length).toBeGreaterThan(0);
  });

  it('keeps every home off the kerb, even the smallest — a home parks on its own drive', () => {
    const scene = new THREE.Scene();
    const small = makeCatalogEntry({
      category: 'res',
      zone: ZoneType.ResLow,
      kind: 'detached',
      footprint: { w: 2, d: 2 },
    });
    const row = makeCatalogEntry({
      id: 'row',
      category: 'res',
      zone: ZoneType.ResMediumRow,
      kind: 'townhouse',
      footprint: { w: 1, d: 2 },
    });
    const renderer = new ParkedCarRenderer(
      scene,
      flatHeightAt,
      [small, row],
      roadAtTiles([[5, 4]]),
      () => RoadTier.TwoLane,
    );

    renderer.apply(deltaAdd(makeBuilding({ id: 1, level: 1 })));
    renderer.apply(deltaAdd(makeBuilding({ id: 2, catalogId: 'row', level: 1 })));
    expect(renderer.stallSlotsFor(1)).toHaveLength(0);
    expect(renderer.stallSlotsFor(2)).toHaveLength(0);
  });

  it('empties a kerb with no painted lane overnight, and keeps residents beside a painted one', () => {
    const scene = new THREE.Scene();
    const flats = makeCatalogEntry({
      category: 'res',
      zone: ZoneType.ResMedium,
      kind: 'garden',
      footprint: { w: 2, d: 2 },
    });
    const laned: RoadProfile = {
      class: 'local',
      pieces: [
        { kind: 'sidewalk', width: 1.875 },
        { kind: 'parking', width: 2.25 },
        { kind: 'travel', width: 3.75, flow: 'back' },
        { kind: 'travel', width: 3.75, flow: 'fwd' },
        { kind: 'parking', width: 2.25 },
        { kind: 'sidewalk', width: 1.875 },
      ],
    };
    const plain = new ParkedCarRenderer(
      scene,
      flatHeightAt,
      [flats],
      roadAtTiles([[5, 4]]),
      () => RoadTier.TwoLane,
    );
    const painted = new ParkedCarRenderer(
      scene,
      flatHeightAt,
      [flats],
      roadAtTiles([[5, 4]]),
      () => RoadTier.TwoLane,
      () => laned,
    );
    plain.apply(deltaAdd(makeBuilding({ id: 1, level: 2 })));
    painted.apply(deltaAdd(makeBuilding({ id: 1, level: 2 })));
    expect(plain.stallSlotsFor(1).length).toBeGreaterThan(0);
    expect(painted.stallSlotsFor(1).length).toBeGreaterThan(0);

    plain.setDayFraction(3 / 24);
    painted.setDayFraction(3 / 24);
    expect(plain.occupiedStallCount(1)).toBe(0);
    expect(painted.occupiedStallCount(1)).toBeGreaterThan(0);
  });

  it('keeps a home with a garage off the kerb — it already parks on its own drive', () => {
    const scene = new THREE.Scene();
    const garaged = makeCatalogEntry({
      category: 'res',
      zone: ZoneType.ResLow,
      kind: 'detached',
      footprint: { w: 2, d: 3 },
    });
    const renderer = new ParkedCarRenderer(
      scene,
      flatHeightAt,
      [garaged],
      roadAtTiles([[5, 4]]),
      () => RoadTier.TwoLane,
    );

    renderer.apply(deltaAdd(makeBuilding({ id: 1, level: 2 })));
    expect(renderer.stallSlotsFor(1)).toHaveLength(0);
  });

  it('keeps every home off the kerb of a street that forbids parking', () => {
    const scene = new THREE.Scene();
    const home = makeCatalogEntry({
      category: 'res',
      zone: 1,
      kind: 'detached',
      footprint: { w: 2, d: 2 },
    });
    const renderer = new ParkedCarRenderer(
      scene,
      flatHeightAt,
      [home],
      roadAtTiles([[5, 4]]),
      () => RoadTier.Highway,
    );

    renderer.apply(deltaAdd(makeBuilding({ id: 1, level: 2 })));
    expect(renderer.stallSlotsFor(1)).toHaveLength(0);
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

  it('parks only what fits on a lot too small for its code, whatever the level', () => {
    const scene = new THREE.Scene();
    const catalog = makeCatalogEntry({ footprint: { w: 1, d: 2 } });
    const roadAt = roadAtTiles([[5, 4]]);
    const renderer = new ParkedCarRenderer(scene, flatHeightAt, [catalog], roadAt);

    renderer.apply(deltaAdd(makeBuilding({ id: 1, level: 9 })));

    const { layout } = planOf(catalog, 5, 5, roadAt);
    expect(layout.fits).toBe(false);
    expect(layout.provided).toBeGreaterThan(0);
    expect(layout.provided).toBeLessThan(layout.required);
    expect(renderer.stallSlotsFor(1)).toHaveLength(layout.provided);
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
    // A lot big enough to lay a car park (a 1x1 shop's cannot hold its accessible space).
    const catalog = makeCatalogEntry({ footprint: { w: 3, d: 2 } });
    const renderer = new ParkedCarRenderer(scene, flatHeightAt, [catalog], roadAtTiles([[5, 4]]));

    renderer.apply(deltaAdd(makeBuilding({ id: 1, state: BuildingState.Constructing })));
    expect(renderer.stallSlotsFor(1)).toHaveLength(0);

    renderer.apply(deltaUpdate(makeBuilding({ id: 1, state: BuildingState.Active })));
    expect(renderer.stallSlotsFor(1)).toHaveLength(
      planOf(catalog, 5, 5, roadAtTiles([[5, 4]])).layout.stalls.length,
    );
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
    const catalog = makeCatalogEntry({ footprint: { w: 3, d: 2 } });
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

  it('produces conforming stripe geometry that grows with the stall count (stall lines, islands)', () => {
    const scene = new THREE.Scene();
    // Two works on the same lot: the bigger floor asks for, and gets, more stalls.
    const small = makeCatalogEntry({
      id: 'small',
      category: 'ind',
      zone: ZoneType.Industrial,
      kind: 'warehouse',
      footprint: { w: 3, d: 3 },
    });
    const big = makeCatalogEntry({ ...small, id: 'big', kind: 'workshop' });
    const renderer = new ParkedCarRenderer(
      scene,
      flatHeightAt,
      [small, big],
      roadAtTiles([[0, -1]]),
    );

    renderer.apply(deltaAdd(makeBuilding({ id: 1, x: 0, z: 0, catalogId: 'big' })));
    const countBig = renderer.stallSlotsFor(1).length;
    expect(countBig).toBeGreaterThan(1);
    const vertsBig = renderer.stripeVertexCountFor(1);
    // Conforming quads are triangle soups: always whole triangles.
    expect(vertsBig).toBeGreaterThan(0);
    expect(vertsBig % 3).toBe(0);

    renderer.apply(deltaUpdate(makeBuilding({ id: 1, x: 0, z: 0, catalogId: 'small' })));
    const countSmall = renderer.stallSlotsFor(1).length;
    expect(countSmall).toBeLessThan(countBig);
    // Fewer stalls -> fewer stall lines and islands -> strictly less geometry.
    expect(renderer.stripeVertexCountFor(1)).toBeLessThan(vertsBig);
  });

  it('subdivides the apron into conforming cells (more than one quad even for a small lot)', () => {
    const scene = new THREE.Scene();
    const catalog = makeCatalogEntry({ footprint: { w: 1, d: 2 } });
    const renderer = new ParkedCarRenderer(scene, flatHeightAt, [catalog], roadAtTiles([[5, 4]]));

    renderer.apply(deltaAdd(makeBuilding({ id: 1, level: 0 })));
    expect(renderer.stallSlotsFor(1).length).toBeGreaterThan(0);
    // One flat 4-corner quad would be exactly 6 vertices; the conforming
    // subdivision (<= 2 m cells over the apron, stall lines and islands) is far more.
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

// ---------------------------------------------------------------------------
// Who is allowed to park where: the road's rule, then the building's.
// ---------------------------------------------------------------------------

describe('tierAllowsRoadsideParking', () => {
  it('allows the kerb on low-speed streets', () => {
    for (const tier of [RoadTier.TwoLane, RoadTier.Gravel, RoadTier.Alley, RoadTier.OneWay]) {
      expect(tierAllowsRoadsideParking(tier), `tier ${tier}`).toBe(true);
    }
  });

  it('refuses the kerb where the edge has a better use', () => {
    // Through-routes, reserved lanes, rails — and nothing at all.
    for (const tier of [
      RoadTier.Avenue,
      RoadTier.Highway,
      RoadTier.FourLane,
      RoadTier.BusLane,
      RoadTier.BikeLane,
      RoadTier.Tram,
      RoadTier.RailTrack,
      RoadTier.None,
    ]) {
      expect(tierAllowsRoadsideParking(tier), `tier ${tier}`).toBe(false);
    }
  });
});

describe('hasOwnLotParking', () => {
  const roadSouthOf = (bx: number, bz: number, w: number, d: number) => {
    void bx;
    void w;
    return (x: number, z: number): boolean => z === bz + d && x >= bx && x < bx + w;
  };

  it('counts a shop or works with a bay row on its own frontage', () => {
    const roadAt = roadSouthOf(4, 6, 2, 2);
    for (const category of ['com', 'ind'] as const) {
      const entry = makeCatalogEntry({ category, footprint: { w: 2, d: 2 } });
      expect(hasOwnLotParking(entry, 4, 6, roadAt), category).toBe(true);
    }
  });

  it('counts every home, detached or in a row, whatever its size — each has its drive', () => {
    for (const [zone, kind, footprint] of [
      [ZoneType.ResLow, 'detached', { w: 2, d: 2 }],
      [ZoneType.ResLow, 'detached', { w: 2, d: 3 }],
      [ZoneType.ResLow, 'duplex', { w: 1, d: 2 }],
      [ZoneType.ResLow, 'fourplex', { w: 1, d: 2 }],
      [ZoneType.ResMediumRow, 'townhouse', { w: 1, d: 4 }],
    ] as const) {
      const entry = makeCatalogEntry({ category: 'res', zone, kind, footprint });
      const roadAt = roadSouthOf(4, 6, footprint.w, footprint.d);
      expect(hasOwnLotParking(entry, 4, 6, roadAt), `zone ${zone}`).toBe(true);
    }
  });

  it('does not count an apartment block, which has nowhere of its own', () => {
    const flats = makeCatalogEntry({
      category: 'res',
      zone: ZoneType.ResMedium,
      kind: 'garden',
      footprint: { w: 2, d: 2 },
    });
    expect(hasOwnLotParking(flats, 4, 6, roadSouthOf(4, 6, 2, 2))).toBe(false);
  });
});

describe('kerbAllowance', () => {
  const laned = (side: 'low' | 'high' | 'both'): RoadProfile => ({
    class: 'local',
    pieces: [
      { kind: 'sidewalk', width: 1.875 },
      ...(side !== 'high' ? [{ kind: 'parking' as const, width: 2.25 }] : []),
      { kind: 'travel', width: 3.75, flow: 'back' },
      { kind: 'travel', width: 3.75, flow: 'fwd' },
      ...(side !== 'low' ? [{ kind: 'parking' as const, width: 2.25 }] : []),
      { kind: 'sidewalk', width: 1.875 },
    ],
  });

  it('allows any hour beside a painted parking lane, on that side only', () => {
    expect(kerbAllowance(RoadTier.TwoLane, laned('low'), 'low')).toBe('anyHour');
    expect(kerbAllowance(RoadTier.TwoLane, laned('low'), 'high')).toBe('daytime');
    expect(kerbAllowance(RoadTier.TwoLane, laned('both'), 'high')).toBe('anyHour');
  });

  it('allows only daytime stays where the tier allows parking but no lane is painted', () => {
    expect(kerbAllowance(RoadTier.TwoLane, null, 'low')).toBe('daytime');
    expect(kerbAllowance(RoadTier.Gravel, null, 'high')).toBe('daytime');
  });

  it('allows nothing where the tier forbids parking and no lane is painted', () => {
    expect(kerbAllowance(RoadTier.Avenue, null, 'low')).toBe('none');
  });

  it('lets a painted lane allow parking even on a tier whose flag does not', () => {
    expect(kerbAllowance(RoadTier.Avenue, laned('both'), 'low')).toBe('anyHour');
  });

  it('faces the kerb on the lot’s own side of the street', () => {
    // A lot whose north edge meets the road lies on the road's high-z side.
    expect(kerbSideFacing('N')).toBe('high');
    expect(kerbSideFacing('S')).toBe('low');
    expect(kerbSideFacing('E')).toBe('low');
    expect(kerbSideFacing('W')).toBe('high');
  });
});

describe('kerbside rhythms', () => {
  it('keeps residents’ cars home overnight and most of them away by day', () => {
    expect(lotOccupancy('residents', 3 / 24)).toBeCloseTo(0.9, 6);
    expect(lotOccupancy('residents', 13 / 24)).toBeCloseTo(0.4, 6);
    expect(lotOccupancy('residents', 8 / 24)).toBeGreaterThan(0.4);
    expect(lotOccupancy('residents', 8 / 24)).toBeLessThan(0.9);
  });

  it('allows short stays by day only: none before 08:00 or from 19:00, at most half between', () => {
    for (const hour of [0, 3, 7.9, 19, 22]) {
      expect(lotOccupancy('shortStay', hour / 24), `hour ${hour}`).toBeCloseTo(0, 9);
    }
    for (let hour = 8; hour < 19; hour += 0.5) {
      expect(lotOccupancy('shortStay', hour / 24), `hour ${hour}`).toBeLessThanOrEqual(0.5);
    }
    expect(lotOccupancy('shortStay', 13 / 24)).toBeCloseTo(0.5, 6);
  });
});

describe('usesRoadsideParking', () => {
  const roadSouth = (x: number, z: number): boolean => z === 8 && x >= 4 && x < 6;
  const tierIs = (tier: RoadTier) => (): RoadTier => tier;

  const smallHome = makeCatalogEntry({
    category: 'res',
    zone: ZoneType.ResMedium,
    kind: 'garden',
    footprint: { w: 2, d: 2 },
  });

  it('lets a building with nowhere of its own use a street that allows it', () => {
    expect(usesRoadsideParking(smallHome, 4, 6, roadSouth, tierIs(RoadTier.TwoLane))).toBe(true);
  });

  it('keeps a home off the kerb, the smallest included', () => {
    const cottage = makeCatalogEntry({
      category: 'res',
      zone: ZoneType.ResLow,
      kind: 'detached',
      footprint: { w: 2, d: 2 },
    });
    expect(usesRoadsideParking(cottage, 4, 6, roadSouth, tierIs(RoadTier.TwoLane))).toBe(false);
  });

  // The rule the user asked for: a lot with its own parking does not also line
  // the kerb outside it.
  it('refuses a building that already parks on its own lot', () => {
    const shop = makeCatalogEntry({ category: 'com', footprint: { w: 2, d: 2 } });
    expect(hasOwnLotParking(shop, 4, 6, roadSouth)).toBe(true);
    expect(usesRoadsideParking(shop, 4, 6, roadSouth, tierIs(RoadTier.TwoLane))).toBe(false);

    const garaged = makeCatalogEntry({
      category: 'res',
      zone: ZoneType.ResLow,
      kind: 'detached',
      footprint: { w: 2, d: 3 },
    });
    expect(usesRoadsideParking(garaged, 4, 6, roadSouth, tierIs(RoadTier.TwoLane))).toBe(false);
  });

  it('refuses a street that does not allow parking, however needy the building', () => {
    for (const tier of [RoadTier.Highway, RoadTier.BikeLane, RoadTier.Tram]) {
      expect(usesRoadsideParking(smallHome, 4, 6, roadSouth, tierIs(tier)), `tier ${tier}`).toBe(
        false,
      );
    }
  });

  it('refuses a building with no street at all', () => {
    expect(usesRoadsideParking(smallHome, 4, 6, () => false, tierIs(RoadTier.TwoLane))).toBe(false);
  });
});

describe('kerbside placement', () => {
  const edge: RoadFacingEdge = { side: 'S', edgeTiles: 2, roadTileX: 4, roadTileZ: 8 };

  it('leaves both ends of the frontage clear', () => {
    // 2 tiles of frontage, 0.25 tiles clear each end, 0.375 pitch -> 4 cars.
    expect(computeRoadsideStallCount(2)).toBe(4);
    expect(computeRoadsideStallCount(0.4)).toBe(0);
  });

  it('parks along the street, not square to it', () => {
    const kerb = computeRoadsideStallPlacements(4, 6, 2, 2, edge, RoadTier.TwoLane, 2);
    // Along the S kerb a parallel car lies east-west: its nose on ±x.
    expect(Math.abs(Math.cos(kerb[0]!.baseYaw))).toBeLessThan(1e-9);
  });

  // A kerbside car stands in the street; a lot car stands on the lot. They must
  // end up on opposite sides of the building's own footprint edge.
  it('stands in the street, where a lot car stands on the lot', () => {
    const footprintEdgeZ = (6 + 2) * TILE_METERS;
    const kerb = computeRoadsideStallPlacements(4, 6, 2, 2, edge, RoadTier.TwoLane, 2);
    const shop = makeCatalogEntry({ footprint: { w: 2, d: 2 } });
    const plan = planOf(shop, 4, 6, (x, z) => z === 8 && x >= 4 && x < 6);
    const lot = plan.layout.stalls.map((s) => lotStallPlacement(plan.frame, s, 4.0));
    expect(lot.length).toBeGreaterThan(0);
    for (const p of kerb) expect(p.worldZ).toBeGreaterThan(footprintEdgeZ);
    for (const p of lot) expect(p.worldZ).toBeLessThan(footprintEdgeZ);
  });

  it('clears the verge and the sidewalk it parks beyond', () => {
    const tier = RoadTier.TwoLane;
    const depthM = roadsideDepthTiles(tier) * TILE_METERS;
    expect(depthM).toBeGreaterThan(vergeDepthMeters(tier) + sidewalkDepthMeters(tier));
  });

  it('stands in the middle of a painted parking lane rather than half a car out', () => {
    const tier = RoadTier.TwoLane;
    const kerbM = vergeDepthMeters(tier) + sidewalkDepthMeters(tier);
    expect(roadsideDepthTiles(tier, undefined, 1.125) * TILE_METERS).toBeCloseTo(kerbM + 1.125, 6);
  });

  it('places nothing for a count of zero', () => {
    expect(computeRoadsideStallPlacements(4, 6, 2, 2, edge, RoadTier.TwoLane, 0)).toEqual([]);
  });
});

describe('a kerbside car never leaves the tarmac', () => {
  const edge: RoadFacingEdge = { side: 'S', edgeTiles: 4, roadTileX: 4, roadTileZ: 8 };
  const allTiers = (): boolean => true;
  const allows = (
    x: number,
    z: number,
    roadAt: (x: number, z: number) => boolean,
    parkable: (x: number, z: number) => boolean = allTiers,
  ): boolean => kerbTileAllowsParking(x, z, roadAt, parkable, adjacentRoadsCross(roadAt));

  it('refuses a junction tile, which has no kerb at all', () => {
    // Road on both axes through (4,8): a turn, a T or a crossroads.
    const roadAt = (x: number, z: number): boolean => z === 8 || x === 4;
    expect(allows(4, 8, roadAt)).toBe(false);
  });

  it('accepts a straight run', () => {
    const roadAt = (_x: number, z: number): boolean => z === 8;
    expect(allows(4, 8, roadAt)).toBe(true);
  });

  it('refuses a tile with no road on it — that is the grass', () => {
    expect(allows(4, 8, () => false)).toBe(false);
  });

  it('refuses a kerb the street does not let anyone park at', () => {
    const roadAt = (_x: number, z: number): boolean => z === 8;
    expect(allows(4, 8, roadAt, () => false)).toBe(false);
  });

  // The defect: a corridor's two halves lie side by side, so counting road
  // tiles beside a kerb tile saw road on both axes and called every tile of
  // the street a junction. The furniture's own test knows the far half is a
  // road beside this one, not a road through it.
  it('parks beside a corridor, whose other half is a road alongside and not a crossing', () => {
    const arterial = composeProfile(presetProfileForTier(RoadTier.FourLane), {
      ...NO_EDITS,
      lanes: 4,
      parking: 'both',
    });
    // Four lanes heading east on rows 8 and 9, and a side street joining at x = 10.
    const tiles: FurnitureRoadTile[] = [];
    for (const [z, half] of [
      [8, 'left'],
      [9, 'right'],
    ] as const) {
      for (let x = 0; x < 20; x++) {
        tiles.push({
          x,
          z,
          tier: RoadTier.FourLane,
          flow: storedFlow(RoadFlow.East, half),
          profile: corridorHalfProfile(arterial, half),
        });
      }
    }
    for (let z = 4; z < 8; z++) tiles.push({ x: 10, z, tier: RoadTier.TwoLane });
    const tileSet = buildTileSet(tiles);
    const roadAt = (x: number, z: number): boolean => tileSet.has(x * 100_000 + z);
    const joinAware = (x: number, z: number): boolean => hasCrossingRoad(tileSet, x, z);

    // Counting neighbours refuses the whole street; the join-aware test keeps
    // the kerb and still refuses the tile the side street joins.
    expect(kerbTileAllowsParking(4, 8, roadAt, allTiers, adjacentRoadsCross(roadAt))).toBe(false);
    expect(kerbTileAllowsParking(4, 8, roadAt, allTiers, joinAware)).toBe(true);
    expect(kerbTileAllowsParking(4, 9, roadAt, allTiers, joinAware)).toBe(true);
    expect(kerbTileAllowsParking(10, 8, roadAt, allTiers, joinAware)).toBe(false);
  });

  // The defect: a frontage is a straight line of tiles, but the street it faces
  // can curve away. A row measured only from the building marched off the bend
  // and parked on the verge.
  it('drops the cars whose stretch of street has curved away', () => {
    // Road under only the first two tiles of a four-tile frontage.
    const roadAt = (x: number, z: number): boolean => z === 8 && x >= 4 && x < 6;
    const all = computeRoadsideStallPlacements(4, 6, 4, 2, edge, RoadTier.TwoLane, 8);
    const vetted = computeRoadsideStallPlacements(4, 6, 4, 2, edge, RoadTier.TwoLane, 8, (tx, tz) =>
      allows(tx, tz, roadAt),
    );

    expect(all.length).toBe(8);
    expect(vetted.length).toBeGreaterThan(0);
    expect(vetted.length).toBeLessThan(all.length);
    for (const p of vetted) {
      const tileX = Math.floor(p.worldX / TILE_METERS);
      expect(roadAt(tileX, Math.floor(p.worldZ / TILE_METERS))).toBe(true);
    }
  });

  it('leaves the corner of a bend empty while still parking its straight arm', () => {
    // An L meeting at (4,8): only that tile has road on both axes.
    const roadAt = (x: number, z: number): boolean => z === 8 || x === 4;
    const vetted = computeRoadsideStallPlacements(4, 6, 4, 2, edge, RoadTier.TwoLane, 8, (tx, tz) =>
      allows(tx, tz, roadAt),
    );

    expect(vetted.length).toBeGreaterThan(0);
    for (const p of vetted) {
      expect(Math.floor(p.worldX / TILE_METERS), 'a car stands in the junction').not.toBe(4);
    }
  });
});

describe('no kerbside car stands inside a junction’s no-parking zone', () => {
  // A street parked on both kerbs along z = 4, and a side street joining it
  // from the north at x = 7 under an all-way stop. Flats at (6, 5) front the
  // street's south kerb, the last stretch of it before the junction.
  const laned: RoadProfile = {
    class: 'local',
    pieces: [
      { kind: 'sidewalk', width: 1.875 },
      { kind: 'parking', width: 2.25 },
      { kind: 'travel', width: 3.75, flow: 'back' },
      { kind: 'travel', width: 3.75, flow: 'fwd' },
      { kind: 'parking', width: 2.25 },
      { kind: 'sidewalk', width: 1.875 },
    ],
  };
  const tiles: [number, number][] = [
    ...Array.from({ length: 13 }, (_, x): [number, number] => [x, 4]),
    ...[0, 1, 2, 3].map((z): [number, number] => [7, z]),
  ];
  const roadAt = roadAtTiles(tiles);
  const roads = new RoadMeshRenderer(new THREE.Scene(), flatHeightAt, (id) =>
    id === 100 ? laned : null,
  );
  roads.setJunctionControls([{ x: 7, z: 4, control: 'allWayStop' }]);
  roads.apply(
    tiles.map(([x, z]) => ({
      x,
      z,
      tier: RoadTier.TwoLane,
      mask:
        (roadAt(x, z - 1) ? 1 : 0) |
        (roadAt(x + 1, z) ? 2 : 0) |
        (roadAt(x, z + 1) ? 4 : 0) |
        (roadAt(x - 1, z) ? 8 : 0),
      elevation: 0,
      profile: z === 4 ? 100 : RoadTier.TwoLane,
      flow: RoadFlow.None,
    })),
  );
  const flats = makeCatalogEntry({
    category: 'res',
    zone: ZoneType.ResMedium,
    kind: 'garden',
    footprint: { w: 2, d: 2 },
  });
  const parkedBeside = (asksTheRoad: boolean, x = 6): ParkedCarRenderer => {
    const renderer = new ParkedCarRenderer(
      new THREE.Scene(),
      flatHeightAt,
      [flats],
      roadAt,
      () => RoadTier.TwoLane,
      (_x, z) => (z === 4 ? laned : null),
      undefined,
      asksTheRoad ? roads : null,
    );
    renderer.apply(deltaAdd(makeBuilding({ id: 1, x, z: 5, level: 2 })));
    return renderer;
  };
  const half = sizeForKind(VehicleKind.Car)[2] / 2;

  it('keeps every car clear of the zone the stall marks keep clear of', () => {
    const setbacks = roads.parkingSetbacksAt(6, 4)!;
    // Eastbound traffic arrives on the south kerb, which keeps 9.1 m clear
    // before the stop line.
    const zone = setbacks.hi![1];
    expect(zone).toBeGreaterThan(8);
    const junctionEdge = 7 * TILE_METERS;
    const without = parkedBeside(false).stallWorldPositions(1);
    const within = parkedBeside(true).stallWorldPositions(1);
    // A row that cannot ask the road stands a car in the zone; one that asks
    // stands none there.
    expect(without.some((p) => p.x + half > junctionEdge - zone)).toBe(true);
    expect(within.length).toBeGreaterThan(0);
    for (const p of within) {
      expect(kerbCarClearOfJunctions(p.x, p.z, 'high', half, setbacks)).toBe(true);
    }
  });

  it('stands one car in each marked stall, centred, and none across a tick', () => {
    for (const x of [3, 6]) {
      // The stalls marked along this frontage, as the road paints them.
      const stalls = [x, x + 1].flatMap((tx) => roads.parkingStallsAt(tx, 4, 'high') ?? []);
      const front = stalls.filter(
        (s) =>
          (s.from + s.to) / 2 >= x * TILE_METERS && (s.from + s.to) / 2 < (x + 2) * TILE_METERS,
      );
      const cars = parkedBeside(true, x).stallWorldPositions(1);
      expect(cars.length, `frontage at ${x}`).toBeGreaterThan(0);
      const used = new Set<number>();
      for (const car of cars) {
        const stall = front.findIndex((s) => Math.abs((s.from + s.to) / 2 - car.x) < 1e-6);
        expect(stall, `a car at x ${car.x} stands in no stall`).toBeGreaterThanOrEqual(0);
        expect(used.has(stall), 'two cars in one stall').toBe(false);
        used.add(stall);
        expect(car.x - half).toBeGreaterThan(front[stall]!.from);
        expect(car.x + half).toBeLessThan(front[stall]!.to);
      }
    }
  });

  it('measures a car by its own length, nose and tail', () => {
    const setbacks = { alongX: true, lo: null, hi: [0, 9] as const };
    const kerbZ = 4.5 * TILE_METERS + 5;
    // A 4 m car whose nose reaches 9 m from the tile's east end stands in it.
    expect(kerbCarClearOfJunctions(7 * TILE_METERS - 9 - 1.9, kerbZ, 'high', 2, setbacks)).toBe(
      false,
    );
    expect(kerbCarClearOfJunctions(7 * TILE_METERS - 9 - 2.1, kerbZ, 'high', 2, setbacks)).toBe(
      true,
    );
    // The other kerb has no zone at that end.
    expect(kerbCarClearOfJunctions(7 * TILE_METERS - 3, kerbZ, 'low', 2, setbacks)).toBe(true);
  });
});

describe('kerbside cars in angled and head-in stalls', () => {
  // A street along z = 4 parked on its south kerb, with flats fronting it.
  const tiles: [number, number][] = Array.from({ length: 12 }, (_, x): [number, number] => [x, 4]);
  const roadAt = roadAtTiles(tiles);
  const flats = makeCatalogEntry({
    category: 'res',
    zone: ZoneType.ResMedium,
    kind: 'garden',
    footprint: { w: 2, d: 2 },
  });
  const TAN60 = Math.tan(Math.PI / 3);

  for (const style of ['angled', 'headIn'] as const) {
    it(`stands each car centred in a ${style} stall, at its yaw, and across no line`, () => {
      const profile = composeProfile(presetProfileForTier(RoadTier.TwoLane), {
        ...NO_EDITS,
        parking: 'right',
        parkingStyle: style,
      });
      const roads = new RoadMeshRenderer(new THREE.Scene(), flatHeightAt, (id) =>
        id === 100 ? profile : null,
      );
      roads.apply(
        tiles.map(([x, z]) => ({
          x,
          z,
          tier: RoadTier.TwoLane,
          mask: (roadAt(x + 1, z) ? 2 : 0) | (roadAt(x - 1, z) ? 8 : 0),
          elevation: 0,
          profile: 100,
          flow: RoadFlow.None,
        })),
      );
      // The south kerb's lane, travel edge to kerb, as world z.
      const half = carriagewayHalfWidthOf(profile);
      const inner = 4.5 * TILE_METERS + half - PARKING_STYLES[style].laneWidth;
      const outer = 4.5 * TILE_METERS + half;
      // Eastbound traffic keeps to this kerb; an angled line's kerb end lies west.
      const slant = style === 'angled' ? -1 / TAN60 : 0;
      let accessibleTaken = 0;
      // The face's accessible stalls stand at its west end, before the flats at 0.
      for (const x of [0, 3, 6]) {
        const renderer = new ParkedCarRenderer(
          new THREE.Scene(),
          flatHeightAt,
          [flats],
          roadAt,
          () => RoadTier.TwoLane,
          (_x, z) => (z === 4 ? profile : null),
          undefined,
          roads,
        );
        renderer.apply(deltaAdd(makeBuilding({ id: 1, x, z: 5, level: 2 })));
        const stalls = [x, x + 1].flatMap((tx) => roads.parkingStallsAt(tx, 4, 'high') ?? []);
        const cars = renderer.stallWorldPositions(1);
        expect(cars.length, `frontage at ${x}`).toBeGreaterThan(0);
        const used = new Set<number>();
        for (const car of cars) {
          const at = stalls.findIndex((s) => Math.abs(s.centre - car.x) < 1e-6);
          expect(at, `a car at x ${car.x} stands in no stall`).toBeGreaterThanOrEqual(0);
          expect(used.has(at), 'two cars in one stall').toBe(false);
          used.add(at);
          const stall = stalls[at]!;
          if (stall.accessible) accessibleTaken += 1;
          // Centred across the lane's own depth, not the parallel row's.
          expect(car.z).toBeCloseTo((inner + outer) / 2, 6);
          // At the stall's yaw, give or take the row's small jitter.
          const turn = Math.atan2(Math.sin(car.yaw - stall.yaw!), Math.cos(car.yaw - stall.yaw!));
          expect(Math.abs(turn)).toBeLessThanOrEqual(YAW_JITTER_MAX + 1e-9);
          // Every corner between the stall's two lines and inside the lane.
          const nose: [number, number] = [Math.sin(car.yaw), Math.cos(car.yaw)];
          const side: [number, number] = [nose[1], -nose[0]];
          for (const [l, w] of [
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1],
          ] as const) {
            const cx = car.x + (l * car.length * nose[0]) / 2 + (w * car.width * side[0]) / 2;
            const cz = car.z + (l * car.length * nose[1]) / 2 + (w * car.width * side[1]) / 2;
            const depth = cz - inner;
            expect(depth).toBeGreaterThan(0);
            expect(depth).toBeLessThan(outer - inner);
            expect(cx).toBeGreaterThan(stall.from + slant * depth);
            expect(cx).toBeLessThan(stall.to + slant * depth);
          }
        }
        // Backed in, an angled car's nose points out at the lane and east,
        // with the traffic; a head-in car's nose faces the kerb.
        for (const car of cars) {
          if (style === 'angled') {
            expect(Math.sin(car.yaw)).toBeGreaterThan(0.4);
            expect(Math.cos(car.yaw)).toBeLessThan(-0.8);
          } else {
            expect(Math.cos(car.yaw)).toBeGreaterThan(0.99);
          }
        }
      }
      // An accessible stall takes a car like any other.
      expect(accessibleTaken).toBeGreaterThan(0);
    });
  }
});

describe('a building turned a quarter parks on the lot it stands on', () => {
  // A 1x2 shopfront at (5, 5): upright it holds (5,5) and (5,6); turned a
  // quarter it holds (5,5) and (6,5). Only the turned lot has (6,4) beside it.
  const shop = makeCatalogEntry({ category: 'com', footprint: { w: 1, d: 2 } });
  const roadAboveSecondTile = (x: number, z: number): boolean => x === 6 && z === 4;

  it('looks for its road on the turned footprint', () => {
    expect(hasOwnLotParking(shop, 5, 5, roadAboveSecondTile, 0)).toBe(false);
    expect(hasOwnLotParking(shop, 5, 5, roadAboveSecondTile, 1)).toBe(true);
  });

  it('puts the curb cut on the road tile beside the turned footprint', () => {
    expect(curbCutTileFor(shop, 5, 5, roadAboveSecondTile, 0)).toBeNull();
    expect(curbCutTileFor(shop, 5, 5, roadAboveSecondTile, 1)).toEqual({ x: 6, z: 4 });
  });
});
