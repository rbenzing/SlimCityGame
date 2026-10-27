/**
 * House kit for the residential HOUSE archetypes (detached single-family =
 * ResLow, attached rows = ResMediumRow). The base BuildingInstancer still draws
 * each body box with its facade shader; this stands up everything else that
 * makes a home read as a home, on the lot plan houselot.ts lays out from the
 * street the home fronts:
 *   - a pitched GABLE ROOF over the body, by the house it is (a ranch, a
 *     craftsman, a split-level with its second storey over the block, a Cape,
 *     a colonial, a row), with its fascia, chimney and dormers;
 *   - what each drive ends at — a carport, an attached or detached garage, a
 *     garage door in the facade — and the resident's car on the drive;
 *   - a front door on the street-facing wall, its stoop, portico or porch,
 *     and shutters on the street face's windows;
 *   - the yard: fence, above-ground pool, trampoline, grill, bushes and trees.
 * The drive, path, patio and lawn are ground surfaces and belong to lots.ts.
 *
 * Every repeated part is an InstancedSlotPool, fed the same BuildingDelta
 * stream as the other building renderers. The roof, garage, carport, doors
 * and every part on the body share its night tint (one uniform, the same
 * colorNode mix as the massing tiers); the yard parts, the fence and the cars
 * are lit like any other prop. Everything is a pure function of (entry,
 * building, streets) — no Math.random, no Date.now — so a home's kit is the
 * same on every load.
 */
import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { uniform } from 'three/tsl';
import { nightTintNode } from './nightlook';
import {
  BuildingCatalogEntry,
  BuildingDelta,
  BuildingInstance,
  BuildingState,
  VehicleKind,
} from '../shared/types';
import { maxHeightOverRect } from './footprint';
import {
  CONSTRUCTING_MASSING_HEIGHT_SCALE,
  InstancedSlotPool,
  massingLifecycleTint,
} from './massing';
import { isHouseEntry } from './archetypes';
import { sizeForKind, variantScaleForKind, VehicleKitPool, VEHICLE_PALETTE_HEX } from './vehicles';
import { materialHex, rgb255ToHex, SATURATED } from './palette';
import { FRAME_DARKEN, deriveFacadeParams } from './facade';
import { NO_STREETS, type StreetLookup } from './frontage';
import {
  CARPORT_DEPTH_M,
  CARPORT_WIDTH_M,
  DOOR_WIDTH_M,
  DORMER_DEPTH_M,
  DORMER_WALL_M,
  DORMER_WIDTH_M,
  GARAGE_LEAF_DEPTH_M,
  GARAGE_LEAF_HEIGHT_M,
  POOL_RADIUS_M,
  PORTICO_DEPTH_M,
  PORTICO_HOOD_M,
  PORTICO_WIDTH_M,
  POST_M,
  RISER_M,
  TRAMPOLINE_RADIUS_M,
  boxYaw,
  frontageYaw,
  inwardYaw,
  lotToWorld,
  outwardYaw,
  planHouseLot,
  type HouseLotPlan,
  type KitBox,
  type LotRect,
} from './houselot';
import { DRIVE_Y_OFFSET } from './lots';
import {
  buildBroadleafGeometry,
  buildShrubGeometry,
  mergeGeometryParts,
  paintVertexColor,
} from './trees';

/** Sides of the pool's drum and the trampoline's mat and ring, drawn for 40 m. */
const YARD_DISC_SEGMENTS = 12;

// Same avalanche hash every render/*.ts keeps a local copy of.
function hash1(n: number): number {
  let h = n >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

const HASH_SLOT_ROOF_COLOR = 72;
const HASH_SLOT_CAR_COLOR = 73;
const HASH_SLOT_CAR_VARIANT = 74;
const HASH_SLOT_TRIM = 75;

const INITIAL_KIT_CAPACITY = 64;

/**
 * What a house's roof is covered in, by the share of new single-family roofs
 * (Home Innovation): laminated asphalt shingle on two thirds and tile on 13%,
 * metal and the rest folded into the shingle share so the two sum to one.
 * GAF gives its 2025 shingle colours by sales rank only — charcoal, weathered
 * wood, pewter grey, barkwood — so each takes a descending rank weight,
 * 4:3:2:1, of the shingle share.
 */
const TILE_ROOF_SHARE = 0.13;
const SHINGLE_ROOF_SHARE = 1 - TILE_ROOF_SHARE;
const SHINGLE_RANK_WEIGHTS: readonly (readonly [number, number])[] = [
  [materialHex('shingleCharcoal'), 4],
  [materialHex('shingleWeathered'), 3],
  [materialHex('shinglePewter'), 2],
  [materialHex('shingleBarkwood'), 1],
];
const SHINGLE_RANK_WEIGHT_SUM = SHINGLE_RANK_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);
/** Each roof material's hex and the share of houses under it, summing to one. */
export const HOUSE_ROOF_SHARES: readonly (readonly [number, number])[] = [
  ...SHINGLE_RANK_WEIGHTS.map(
    ([hex, weight]) => [hex, (SHINGLE_ROOF_SHARE * weight) / SHINGLE_RANK_WEIGHT_SUM] as const,
  ),
  [materialHex('clayRoof'), TILE_ROOF_SHARE],
];
/** Garage wall — plaster, distinct from the roof. */
const GARAGE_WALL_COLOR = materialHex('whitePlaster');
const CARPORT_COLOR = materialHex('brightWood');
/** A chimney is brick red whatever the wall. */
const CHIMNEY_COLOR = 0x8c4332;
const STOOP_COLOR = materialHex('cleanConcrete');
const PORCH_FLOOR_COLOR = materialHex('brightestWood');
/** What trim, shutters, the garage leaf, the front door and the fascia are painted: black, white, a dark green, or the roof's own colour. */
const TRIM_BLACK = 0x22242a;
export const TRIM_WHITE = 0xd6d6d0;
const TRIM_GREEN = 0x1e3a28;
/** The dormer's glazing, over its wall colour. */
const DORMER_GLASS_COLOR = 0x4a4a4a;
const FENCE_COLOR: Readonly<Record<HouseLotPlan['yard']['fenceColour'], number>> = {
  // The palest of each: a fence is a thin board seen mostly edge-on or in its
  // own shade, and a mid tone read as a black line round every garden.
  wood: materialHex('brightestWood'),
  white: materialHex('whiteBrick'),
};

export const GARAGE_HEIGHT_M = 2.6;
export const DOOR_HEIGHT_M = 2.1;
/** A door stands this far proud of the wall it is set in. */
const PANEL_DEPTH_M = 0.06;
/** The fascia board along an eave: 1 × 8 in, a thin board standing at the roof's edge. */
const FASCIA_DEPTH_M = 0.18;
const FASCIA_THICKNESS_M = 0.04;
/** A dormer's roof overhangs its walls this far on every side. */
const DORMER_EAVE_M = 0.15;
export const FENCE_HEIGHT_M = 1.6;
const FENCE_THICKNESS_M = 0.08;
/** A long fence run is cut into panels no longer than this, each seated on the ground under it. */
const FENCE_PANEL_MAX_M = 5;
const CARPORT_HEIGHT_M = 2.4;
const POOL_HEIGHT_M = 1.2;
const TRAMPOLINE_MAT_HEIGHT_M = 0.9;
/** The broadleaf kit's canopy is a mature tree at scale 1; a yard tree is scaled from that. */
const YARD_TREE_SCALE = 0.8;

/** A resident's car is painted from the same list as every other car. */
const CAR_PALETTE: readonly number[] = VEHICLE_PALETTE_HEX;

/** A house's roof colour by id: the material whose run of the cumulative shares the id's hash lands in. Pure. */
export function roofColorHex(buildingId: number): number {
  const u = hash1(buildingId + HASH_SLOT_ROOF_COLOR);
  let acc = 0;
  for (const [hex, share] of HOUSE_ROOF_SHARES) {
    acc += share;
    if (u < acc) return hex;
  }
  return HOUSE_ROOF_SHARES[HOUSE_ROOF_SHARES.length - 1]![0];
}

/** A craftsman's porch piers. */
const PIER_COLOR = materialHex('stoneBrick');

/** Relative luminance of a wall as it is mostly drawn, in its darkened frame colour. */
export function wallLuminance(wall: readonly [number, number, number]): number {
  return (0.2126 * wall[0] + 0.7152 * wall[1] + 0.0722 * wall[2]) * FRAME_DARKEN;
}
/** A wall drawn darker than this is dark enough to swallow black trim. */
const DARK_WALL_LUMINANCE = 0.44;

/**
 * The one trim colour a house wears on its shutters, fascia, garage leaf and
 * front door: black in 39 of 100 houses, white in 19, the rest a dark green or
 * the roof's colour. Pure.
 */
export function trimColor(seed: number, wall?: readonly [number, number, number]): number {
  // Trim has to read against the wall: a wall that draws dark gets white trim, and
  // only a light wall leaves the colour to the seed.
  if (wall && wallLuminance(wall) < DARK_WALL_LUMINANCE) return TRIM_WHITE;
  const roll = hash1(seed + HASH_SLOT_TRIM);
  if (roll < 0.39) return TRIM_BLACK;
  if (roll < 0.58) return TRIM_WHITE;
  return roll < 0.79 ? TRIM_GREEN : roofColorHex(seed);
}

/**
 * A base-anchored (y=0 at the eaves, y=1 at the ridge) unit gable-roof prism:
 * a 1x1 footprint in XZ with the ridge running along local +X. Two sloped
 * faces + two triangular gable ends; no bottom face (hidden by the body box).
 */
export function buildGableRoofGeometry(): THREE.BufferGeometry {
  const A: [number, number, number] = [-0.5, 0, -0.5];
  const B: [number, number, number] = [0.5, 0, -0.5];
  const C: [number, number, number] = [0.5, 0, 0.5];
  const D: [number, number, number] = [-0.5, 0, 0.5];
  const R0: [number, number, number] = [-0.5, 1, 0];
  const R1: [number, number, number] = [0.5, 1, 0];
  const tris: [number, number, number][][] = [
    [D, C, R1],
    [D, R1, R0], // +z slope
    [A, R0, R1],
    [A, R1, B], // -z slope
    [A, D, R0], // -x gable
    [B, R1, C], // +x gable
  ];
  const positions: number[] = [];
  for (const tri of tris) for (const v of tri) positions.push(v[0], v[1], v[2]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Base-anchored unit box (origin at the base center): garages, doors, fence panels. */
function buildUnitBoxGeometry(): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.translate(0, 0.5, 0);
  return geometry;
}

/** A box without the face on the ground, which nothing sees. */
function withoutUnderside(box: THREE.BoxGeometry): THREE.BoxGeometry {
  // Faces run +x, -x, +y, -y, +z, -z, six indices each: the underside is the fourth.
  box.setIndex(Array.from(box.getIndex()!.array).filter((_, i) => Math.floor(i / 6) !== 3));
  return box;
}

/** The fence's panels, the shutters, steps and chimneys are unit boxes with no underside. */
function buildPanelGeometry(): THREE.BufferGeometry {
  return withoutUnderside(buildUnitBoxGeometry());
}

/**
 * A portico, base-anchored on its landing with the wall at z = 0 and the
 * front at +Z: two posts under a gable hood, whose ridge runs out from the
 * wall. The hood rises at the main roof's 8:12.
 */
export function buildPorticoGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const hoodY = PORTICO_HOOD_M - 3 * RISER_M;
  const half = POST_M / 2;
  for (const x of [-PORTICO_WIDTH_M / 2 + half + 0.05, PORTICO_WIDTH_M / 2 - half - 0.05]) {
    const post = withoutUnderside(new THREE.BoxGeometry(POST_M, hoodY, POST_M));
    post.translate(x, hoodY / 2, PORTICO_DEPTH_M - half - 0.05);
    parts.push(post);
  }
  const hood = buildGableRoofGeometry();
  hood.scale(PORTICO_DEPTH_M, (PORTICO_WIDTH_M / 2) * (8 / 12), PORTICO_WIDTH_M);
  hood.rotateY(Math.PI / 2);
  hood.translate(0, hoodY, PORTICO_DEPTH_M / 2);
  parts.push(hood);
  return mergeGeometryParts(parts);
}

/**
 * A porch's shed roof as a wedge, unit-sized: the wall at z = 0 and the front
 * at z = 1 (+Z), the low edge at y = 0 and the wall edge at y = 1, flat
 * underneath over the posts.
 */
export function buildShedRoofGeometry(): THREE.BufferGeometry {
  const A: [number, number, number] = [-0.5, 0, 0];
  const B: [number, number, number] = [0.5, 0, 0];
  const C: [number, number, number] = [0.5, 1, 0];
  const D: [number, number, number] = [-0.5, 1, 0];
  const F0: [number, number, number] = [-0.5, 0, 1];
  const F1: [number, number, number] = [0.5, 0, 1];
  const tris: [number, number, number][][] = [
    [D, F0, C],
    [C, F0, F1], // the slope
    [A, B, F0],
    [B, F1, F0], // the underside
    [A, F0, D],
    [B, C, F1], // the ends
  ];
  const positions: number[] = [];
  for (const tri of tris) for (const v of tri) positions.push(v[0], v[1], v[2]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A gable dormer's walls, base-anchored where its front wall stands on the
 * slope, the front at +Z and the cheeks running back into the roof. The front
 * carries a window; wall and window are painted into the geometry, so the
 * instance colour is the wall's. Its own gable roof is a roof instance.
 */
export function buildDormerGeometry(): THREE.BufferGeometry {
  const walls = withoutUnderside(
    new THREE.BoxGeometry(DORMER_WIDTH_M, DORMER_WALL_M, DORMER_DEPTH_M),
  );
  walls.translate(0, DORMER_WALL_M / 2, -DORMER_DEPTH_M / 2);
  const window = new THREE.BoxGeometry(DORMER_WIDTH_M * 0.5, DORMER_WALL_M * 0.6, 0.04);
  window.translate(0, DORMER_WALL_M * 0.55, 0.02);
  return mergeGeometryParts([
    paintVertexColor(walls, 0xffffff),
    paintVertexColor(window, DORMER_GLASS_COLOR),
  ]);
}

/** A carport in metres, base-anchored: four posts and a flat roof, its width along local X. */
export function buildCarportGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const post = 0.12;
  const hx = CARPORT_WIDTH_M / 2 - 0.15;
  const hz = CARPORT_DEPTH_M / 2 - 0.15;
  for (const [x, z] of [
    [-hx, -hz],
    [hx, -hz],
    [-hx, hz],
    [hx, hz],
  ] as const) {
    const p = new THREE.BoxGeometry(post, CARPORT_HEIGHT_M, post);
    p.translate(x, CARPORT_HEIGHT_M / 2, z);
    parts.push(paintVertexColor(p, 0xffffff));
  }
  const roof = new THREE.BoxGeometry(CARPORT_WIDTH_M, 0.12, CARPORT_DEPTH_M);
  roof.translate(0, CARPORT_HEIGHT_M, 0);
  parts.push(paintVertexColor(roof, 0xffffff));
  return mergeGeometryParts(parts);
}

/**
 * An above-ground pool, base-anchored: a round wall, and the water inside its
 * rim. The water is a disc laid just over the wall's closed top, a hand's width
 * in from its edge, so the rim reads as a ring round it from above.
 */
export function buildPoolGeometry(): THREE.BufferGeometry {
  const wall = new THREE.CylinderGeometry(
    POOL_RADIUS_M,
    POOL_RADIUS_M,
    POOL_HEIGHT_M,
    YARD_DISC_SEGMENTS,
  );
  // The side then the top cap: the underside never faces anything.
  wall.setIndex(Array.from(wall.getIndex()!.array).slice(0, YARD_DISC_SEGMENTS * 9));
  wall.translate(0, POOL_HEIGHT_M / 2, 0);
  const water = new THREE.CircleGeometry(POOL_RADIUS_M - 0.15, YARD_DISC_SEGMENTS);
  water.rotateX(-Math.PI / 2);
  water.translate(0, POOL_HEIGHT_M + 0.01, 0);
  return mergeGeometryParts([
    paintVertexColor(wall, materialHex('bluePlaster')),
    paintVertexColor(water, rgb255ToHex(SATURATED.cyan)),
  ]);
}

/** A round trampoline, base-anchored: six legs, a frame ring and the mat. */
export function buildTrampolineGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const frame = materialHex('metalPlates');
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const leg = new THREE.CylinderGeometry(0.04, 0.04, TRAMPOLINE_MAT_HEIGHT_M, 4, 1, true);
    leg.translate(
      Math.cos(a) * (TRAMPOLINE_RADIUS_M - 0.1),
      TRAMPOLINE_MAT_HEIGHT_M / 2,
      Math.sin(a) * (TRAMPOLINE_RADIUS_M - 0.1),
    );
    parts.push(paintVertexColor(leg, frame));
  }
  const ring = new THREE.CylinderGeometry(
    TRAMPOLINE_RADIUS_M,
    TRAMPOLINE_RADIUS_M,
    0.08,
    YARD_DISC_SEGMENTS,
    1,
    true,
  );
  ring.translate(0, TRAMPOLINE_MAT_HEIGHT_M, 0);
  parts.push(paintVertexColor(ring, frame));
  const mat = new THREE.CircleGeometry(TRAMPOLINE_RADIUS_M - 0.15, YARD_DISC_SEGMENTS);
  mat.rotateX(-Math.PI / 2);
  mat.translate(0, TRAMPOLINE_MAT_HEIGHT_M - 0.01, 0);
  parts.push(paintVertexColor(mat, materialHex('coal')));
  return mergeGeometryParts(parts);
}

/** A kettle-style grill on four legs, base-anchored: 0.6 × 0.5 m, 1 m to the top of its lid. */
export function buildGrillGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const legColour = materialHex('metalPlates');
  for (const [x, z] of [
    [-0.25, -0.2],
    [0.25, -0.2],
    [-0.25, 0.2],
    [0.25, 0.2],
  ] as const) {
    const leg = withoutUnderside(new THREE.BoxGeometry(0.04, 0.6, 0.04));
    leg.translate(x, 0.3, z);
    parts.push(paintVertexColor(leg, legColour));
  }
  const body = new THREE.BoxGeometry(0.6, 0.25, 0.5);
  body.translate(0, 0.72, 0);
  parts.push(paintVertexColor(body, materialHex('darkBitumen')));
  const lid = new THREE.BoxGeometry(0.58, 0.15, 0.48);
  lid.translate(0, 0.92, 0);
  parts.push(paintVertexColor(lid, materialHex('coal')));
  return mergeGeometryParts(parts);
}

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();
const _yAxis = new THREE.Vector3(0, 1, 0);

/** The parts of the kit, one pool each. */
export type HousePart =
  | 'roof'
  | 'fascia'
  | 'chimney'
  | 'stoop'
  | 'portico'
  | 'porch'
  | 'porchRoof'
  | 'dormer'
  | 'shutter'
  | 'parapet'
  | 'parapetGable'
  | 'garage'
  | 'garageLeaf'
  | 'carport'
  | 'door'
  | 'fence'
  | 'pool'
  | 'trampoline'
  | 'grill'
  | 'bush'
  | 'tree';

interface OwnedSlot {
  part: HousePart;
  slot: number;
}

interface HouseSlots {
  parts: OwnedSlot[];
  cars: number[];
}

/** A frame rectangle as a world-space box: its centre, the yaw it turns by and its extents along its own X and Z. */
function worldBox(
  plan: HouseLotPlan,
  r: LotRect,
): { x: number; z: number; yaw: number; sx: number; sz: number } {
  const a = lotToWorld(plan.frame, r.u0, r.v0);
  const b = lotToWorld(plan.frame, r.u1, r.v1);
  const yaw = boxYaw(plan.frame);
  // On a grid frame the box stays axis-aligned and its extents swap with the
  // frame; on a curve it turns whole, its extents the rectangle's own.
  const turned = yaw !== 0;
  return {
    x: (a.x + b.x) / 2,
    z: (a.z + b.z) / 2,
    yaw,
    sx: turned ? r.u1 - r.u0 : Math.abs(a.x - b.x),
    sz: turned ? r.v1 - r.v0 : Math.abs(a.z - b.z),
  };
}

/** A gable's prism over a frame rectangle: its ridge along the frontage or across it, `length` under the ridge and `span` across it. */
function ridgeBox(
  plan: HouseLotPlan,
  r: LotRect,
  ridgeAlongU: boolean,
): { x: number; z: number; yaw: number; length: number; span: number } {
  const g = worldBox(plan, r);
  const yaw = frontageYaw(plan.frame) + (ridgeAlongU ? 0 : Math.PI / 2);
  if (g.yaw !== 0) {
    const u = r.u1 - r.u0;
    const v = r.v1 - r.v0;
    return { x: g.x, z: g.z, yaw, length: ridgeAlongU ? u : v, span: ridgeAlongU ? v : u };
  }
  // Axis-aligned: the ridge runs on world X at yaw 0 or a half turn, on world Z at a quarter.
  const alongX = yaw % Math.PI === 0;
  return {
    x: g.x,
    z: g.z,
    yaw: alongX ? 0 : Math.PI / 2,
    length: alongX ? g.sx : g.sz,
    span: alongX ? g.sz : g.sx,
  };
}

export class HouseRoofRenderer {
  private readonly heightAt: (x: number, z: number) => number;
  private readonly roadAt: (x: number, z: number) => boolean;
  private readonly street: StreetLookup;
  private readonly catalogById: Map<string, BuildingCatalogEntry>;
  private readonly nightFactorUniform = uniform(0);
  private readonly pools: Record<HousePart, InstancedSlotPool>;
  private readonly carPool: VehicleKitPool;
  private readonly buildingSlots = new Map<number, HouseSlots>();

  constructor(
    scene: THREE.Scene,
    heightAt: (x: number, z: number) => number,
    catalog: BuildingCatalogEntry[],
    roadAt: (x: number, z: number) => boolean = () => false,
    street: StreetLookup = NO_STREETS,
  ) {
    this.heightAt = heightAt;
    this.roadAt = roadAt;
    this.street = street;
    this.catalogById = new Map(catalog.map((entry) => [entry.id, entry]));
    // The structure shares one night uniform, so a house's roof, garage and
    // doors darken together with the body.
    const kit = (geometry: THREE.BufferGeometry, vertexColors = false): InstancedSlotPool =>
      new InstancedSlotPool(scene, geometry, this.kitMaterial(vertexColors), INITIAL_KIT_CAPACITY);
    // Yard parts carry their colours in the geometry and are lit like trees.
    const yardMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const yard = (geometry: THREE.BufferGeometry): InstancedSlotPool =>
      new InstancedSlotPool(scene, geometry, yardMaterial, INITIAL_KIT_CAPACITY);
    this.pools = {
      roof: kit(buildGableRoofGeometry()),
      fascia: kit(buildPanelGeometry()),
      chimney: kit(buildPanelGeometry()),
      stoop: kit(buildPanelGeometry()),
      portico: kit(buildPorticoGeometry()),
      porch: kit(buildPanelGeometry()),
      porchRoof: kit(buildShedRoofGeometry()),
      dormer: kit(buildDormerGeometry(), true),
      shutter: kit(buildPanelGeometry()),
      parapet: kit(buildPanelGeometry()),
      parapetGable: kit(buildGableRoofGeometry()),
      garage: kit(buildUnitBoxGeometry()),
      garageLeaf: kit(buildPanelGeometry()),
      carport: kit(buildCarportGeometry()),
      door: kit(buildUnitBoxGeometry()),
      fence: new InstancedSlotPool(
        scene,
        buildPanelGeometry(),
        new THREE.MeshLambertMaterial(),
        INITIAL_KIT_CAPACITY,
      ),
      pool: yard(buildPoolGeometry()),
      trampoline: yard(buildTrampolineGeometry()),
      grill: yard(buildGrillGeometry()),
      bush: yard(buildShrubGeometry()),
      tree: yard(buildBroadleafGeometry()),
    };
    // Cars are real vehicle-kit models, lit naturally (they darken with the
    // scene at night, like the lot-parked cars in parked.ts) — body-only
    // palette tint, lights off.
    this.carPool = new VehicleKitPool(scene, VehicleKind.Car, INITIAL_KIT_CAPACITY);
  }

  private kitMaterial(vertexColors: boolean): MeshStandardNodeMaterial {
    const material = new MeshStandardNodeMaterial({ roughness: 1, metalness: 0, vertexColors });
    material.colorNode = nightTintNode(this.nightFactorUniform);
    return material;
  }

  /** Consumes one BuildingDelta: removed ids free their kit; added/updated recompute theirs. */
  apply(delta: BuildingDelta): void {
    for (const id of delta.removed) this.freeBuilding(id);
    for (const building of delta.added) this.applyOne(building);
    for (const building of delta.updated) this.applyOne(building);
    for (const pool of Object.values(this.pools)) pool.commit();
    this.carPool.finalize();
  }

  /** 0 (day) .. 1 (night) — mixes the structure toward the same tint as the body. */
  setNightFactor(nightFactor: number): void {
    this.nightFactorUniform.value = Math.min(1, Math.max(0, nightFactor));
  }

  nightFactor(): number {
    return this.nightFactorUniform.value;
  }

  /** Slots a building owns in one part's pool. For tests/introspection. */
  slotsFor(buildingId: number, part: HousePart): number[] {
    return (this.buildingSlots.get(buildingId)?.parts ?? [])
      .filter((p) => p.part === part)
      .map((p) => p.slot);
  }

  /** How many instances one part's pool holds. For tests/introspection. */
  partCount(part: HousePart): number {
    return this.pools[part].instanceCount();
  }

  getPartMatrix(part: HousePart, slot: number, out: THREE.Matrix4): void {
    this.pools[part].getMatrixAt(slot, out);
  }

  getPartColor(part: HousePart, slot: number, out: THREE.Color): void {
    this.pools[part].getColorAt(slot, out);
  }

  carCount(): number {
    return this.carPool.usedSlots();
  }

  /** Car slots a building owns, one per drive while it is Active. For tests/introspection. */
  carSlotsFor(buildingId: number): number[] {
    return this.buildingSlots.get(buildingId)?.cars ?? [];
  }

  getCarMatrix(slot: number, out: THREE.Matrix4): void {
    this.carPool.mesh.getMatrixAt(slot, out);
  }

  private freeBuilding(buildingId: number): void {
    const slots = this.buildingSlots.get(buildingId);
    if (!slots) return;
    for (const { part, slot } of slots.parts) this.pools[part].free(slot);
    for (const slot of slots.cars) this.carPool.free(slot);
    this.buildingSlots.delete(buildingId);
  }

  private applyOne(building: BuildingInstance): void {
    this.freeBuilding(building.id);

    const entry = this.catalogById.get(building.catalogId);
    if (!entry || !isHouseEntry(entry)) return;
    const plan = planHouseLot(building, entry, this.roadAt, this.street);
    if (!plan) return;

    const slots: HouseSlots = { parts: [], cars: [] };
    this.buildingSlots.set(building.id, slots);
    const tint = massingLifecycleTint(building.state);
    const heightScale =
      building.state === BuildingState.Constructing ? CONSTRUCTING_MASSING_HEIGHT_SCALE : 1;
    // The body's own base: the highest ground under the body itself, which is
    // where BuildingInstancer seats it; the lot around it follows the ground.
    const corners = [
      lotToWorld(plan.frame, plan.body.u0, plan.body.v0),
      lotToWorld(plan.frame, plan.body.u1, plan.body.v0),
      lotToWorld(plan.frame, plan.body.u1, plan.body.v1),
      lotToWorld(plan.frame, plan.body.u0, plan.body.v1),
    ];
    const bodyGround = maxHeightOverRect(
      this.heightAt,
      Math.min(...corners.map((c) => c.x)),
      Math.min(...corners.map((c) => c.z)),
      Math.max(...corners.map((c) => c.x)),
      Math.max(...corners.map((c) => c.z)),
    );

    const put = (
      part: HousePart,
      x: number,
      y: number,
      z: number,
      yaw: number,
      sx: number,
      sy: number,
      sz: number,
      colour: number | readonly [number, number, number],
      tinted: boolean,
    ): void => {
      const pool = this.pools[part];
      const slot = pool.allocate();
      _position.set(x, y, z);
      _quaternion.setFromAxisAngle(_yAxis, yaw);
      _scale.set(sx, sy, sz);
      _matrix.compose(_position, _quaternion, _scale);
      pool.setMatrixAt(slot, _matrix);
      // A palette hex is a swatch; a triple is the facade's own wall colour, as the body is given it.
      if (typeof colour === 'number') _color.setHex(colour);
      else _color.setRGB(colour[0], colour[1], colour[2]);
      if (tinted) {
        _color.r *= tint[0];
        _color.g *= tint[1];
        _color.b *= tint[2];
      }
      pool.setColorAt(slot, _color);
      slots.parts.push({ part, slot });
    };

    // --- the roof, and what stands on and beside the body -------------------
    const { kit } = plan;
    const roofColour = roofColorHex(building.id);
    const wall = deriveFacadeParams(entry, building.id).wallColor;
    const trim = trimColor(building.id, wall);
    // A height above the body's ground: a home going up is drawn squat, parts and all.
    const up = (y: number): number => bodyGround + y * heightScale;
    const boxOf = (
      part: HousePart,
      box: KitBox,
      colour: number | readonly [number, number, number],
    ): void => {
      const b = worldBox(plan, box.rect);
      put(
        part,
        b.x,
        up(box.y0),
        b.z,
        b.yaw,
        b.sx,
        (box.y1 - box.y0) * heightScale,
        b.sz,
        colour,
        true,
      );
    };
    // A gable roof over `rect` at `slope`, its ridge along the frontage or across it, passing through `wallTop` at the wall line.
    const gable = (
      rect: LotRect,
      ridgeAlongU: boolean,
      wallTop: number,
      eave: number,
      slope: number,
    ): void => {
      const g = ridgeBox(plan, rect, ridgeAlongU);
      const y = up(wallTop - eave * slope);
      const rise = (g.span / 2) * slope * heightScale;
      put('roof', g.x, y, g.z, g.yaw, g.length, rise, g.span, roofColour, true);
    };
    const { roof } = kit;
    // A gable along the frontage over `rect` from the wall top, with a fascia board along each eave.
    const mainRoof = (rect: LotRect, wallTop: number): void => {
      gable(rect, true, wallTop, roof.eaveM, roof.slope);
      const edgeY = wallTop - roof.eaveM * roof.slope;
      for (const v0 of [rect.v0, rect.v1 - FASCIA_THICKNESS_M]) {
        const band = { u0: rect.u0, u1: rect.u1, v0, v1: v0 + FASCIA_THICKNESS_M };
        boxOf('fascia', { rect: band, y0: edgeY - FASCIA_DEPTH_M, y1: edgeY }, trim);
      }
    };
    mainRoof(roof.rect, kit.heightM);
    if (kit.upper) {
      // The split-level's second storey, in the body's wall, under a gable of its own.
      boxOf('garage', kit.upper.box, wall);
      mainRoof(kit.upper.roof.rect, kit.upper.box.y1);
    }
    for (const chimney of kit.chimneys) boxOf('chimney', chimney, CHIMNEY_COLOR);
    for (const dormer of kit.dormers) {
      const at = lotToWorld(plan.frame, dormer.u, dormer.v);
      put(
        'dormer',
        at.x,
        up(dormer.y),
        at.z,
        outwardYaw(plan.frame),
        1,
        heightScale,
        1,
        wall,
        true,
      );
      const half = DORMER_WIDTH_M / 2 + DORMER_EAVE_M;
      const rect = {
        u0: dormer.u - half,
        u1: dormer.u + half,
        v0: dormer.v - DORMER_EAVE_M,
        v1: dormer.v + DORMER_DEPTH_M,
      };
      gable(rect, false, dormer.y + DORMER_WALL_M, DORMER_EAVE_M, roof.slope);
    }
    for (const step of kit.stoops) boxOf('stoop', step, STOOP_COLOR);
    for (const portico of kit.porticos) {
      const at = lotToWorld(plan.frame, portico.u, portico.v);
      put(
        'portico',
        at.x,
        up(3 * RISER_M),
        at.z,
        outwardYaw(plan.frame),
        1,
        heightScale,
        1,
        trim,
        true,
      );
    }
    if (kit.porch) {
      boxOf('porch', kit.porch.floor, PORCH_FLOOR_COLOR);
      for (const pier of kit.porch.piers) boxOf('porch', pier, PIER_COLOR);
      for (const post of kit.porch.posts) boxOf('porch', post, trim);
      const { rect, lowM, wallM } = kit.porch.roof;
      const at = lotToWorld(plan.frame, (rect.u0 + rect.u1) / 2, rect.v1);
      put(
        'porchRoof',
        at.x,
        up(lowM),
        at.z,
        outwardYaw(plan.frame),
        rect.u1 - rect.u0,
        (wallM - lowM) * heightScale,
        rect.v1 - rect.v0,
        roofColour,
        true,
      );
    }
    for (const shutter of kit.shutters) boxOf('shutter', shutter, trim);
    // A party wall follows the roof, 0.76 m proud of it: a band over the eave line,
    // and over that the roof's own gable section, stood in the wall's plane.
    for (const parapet of kit.parapets) {
      boxOf('parapet', parapet, wall);
      const g = ridgeBox(plan, parapet.rect, true);
      const rise = roof.riseM * heightScale;
      put('parapetGable', g.x, up(parapet.y1), g.z, g.yaw, g.length, rise, g.span, wall, true);
    }

    // --- doors, and what each drive ends at ---------------------------------
    for (const door of plan.doors) {
      const b = worldBox(plan, {
        u0: door.u - DOOR_WIDTH_M / 2,
        u1: door.u + DOOR_WIDTH_M / 2,
        v0: door.v - PANEL_DEPTH_M,
        v1: door.v,
      });
      put('door', b.x, bodyGround, b.z, b.yaw, b.sx, DOOR_HEIGHT_M, b.sz, trim, true);
    }
    const carportYaw = frontageYaw(plan.frame);
    for (const drive of plan.drives) {
      let doorGround = bodyGround;
      if (drive.coverRect && (drive.cover === 'garage' || drive.cover === 'detachedGarage')) {
        const g = worldBox(plan, drive.coverRect);
        doorGround = this.heightAt(g.x, g.z);
        put(
          'garage',
          g.x,
          doorGround,
          g.z,
          g.yaw,
          g.sx,
          GARAGE_HEIGHT_M,
          g.sz,
          GARAGE_WALL_COLOR,
          true,
        );
      } else if (drive.coverRect && drive.cover === 'carport') {
        const c = worldBox(plan, drive.coverRect);
        put('carport', c.x, this.heightAt(c.x, c.z), c.z, carportYaw, 1, 1, 1, CARPORT_COLOR, true);
      }
      // Each leaf at its own width — a row's 8 ft single, a house's 9 ft single or 16 ft double — proud of the face.
      for (const d of drive.garageDoors) {
        const b = worldBox(plan, { u0: d.u0, u1: d.u1, v0: d.v - GARAGE_LEAF_DEPTH_M, v1: d.v });
        put('garageLeaf', b.x, doorGround, b.z, b.yaw, b.sx, GARAGE_LEAF_HEIGHT_M, b.sz, trim, true);
      }
    }

    // --- the resident's car, one per drive ----------------------------------
    if (building.state === BuildingState.Active) {
      const size = sizeForKind(VehicleKind.Car);
      plan.drives.forEach((drive, i) => {
        const at = lotToWorld(plan.frame, drive.car.u, drive.car.v);
        const seed = building.id * 7 + i;
        const variant = variantScaleForKind(
          VehicleKind.Car,
          Math.floor(hash1(seed + HASH_SLOT_CAR_VARIANT) * 3),
        );
        const sy = size[1] * variant[1];
        const slot = this.carPool.allocate();
        // Kit geometry is a unit cube with its base at y=-0.5: scale sets real
        // meters and the center rides at the drive surface + half height.
        _position.set(at.x, this.heightAt(at.x, at.z) + DRIVE_Y_OFFSET + sy / 2, at.z);
        _quaternion.setFromAxisAngle(_yAxis, inwardYaw(plan.frame));
        _scale.set(size[0] * variant[0], sy, size[2] * variant[2]);
        _matrix.compose(_position, _quaternion, _scale);
        this.carPool.mesh.setMatrixAt(slot, _matrix);
        const ci = Math.floor(hash1(seed + HASH_SLOT_CAR_COLOR) * CAR_PALETTE.length);
        _color.setHex(CAR_PALETTE[Math.min(CAR_PALETTE.length - 1, ci)]!);
        this.carPool.mesh.setColorAt(slot, _color);
        slots.cars.push(slot);
      });
    }

    // --- the yard -----------------------------------------------------------
    // Nobody lives in a home still going up; an abandoned one keeps what
    // stands in the ground and loses what its family took with them.
    if (building.state === BuildingState.Constructing) return;
    const { yard } = plan;
    const fenceHex = FENCE_COLOR[yard.fenceColour];
    for (const run of yard.fence) {
      const alongU = run.v0 === run.v1;
      const length = alongU ? run.u1 - run.u0 : run.v1 - run.v0;
      const panels = Math.max(1, Math.ceil(length / FENCE_PANEL_MAX_M));
      for (let p = 0; p < panels; p++) {
        const a = (alongU ? run.u0 : run.v0) + (p / panels) * length;
        const b = (alongU ? run.u0 : run.v0) + ((p + 1) / panels) * length;
        const t = FENCE_THICKNESS_M / 2;
        const rect = alongU
          ? { u0: a, u1: b, v0: run.v0 - t, v1: run.v0 + t }
          : { u0: run.u0 - t, u1: run.u0 + t, v0: a, v1: b };
        const f = worldBox(plan, rect);
        put(
          'fence',
          f.x,
          this.heightAt(f.x, f.z),
          f.z,
          f.yaw,
          f.sx,
          FENCE_HEIGHT_M,
          f.sz,
          fenceHex,
          false,
        );
      }
    }
    const yardYaw = boxYaw(plan.frame);
    const stand = (part: HousePart, u: number, v: number, scale: number, lift = 0): void => {
      const at = lotToWorld(plan.frame, u, v);
      put(
        part,
        at.x,
        this.heightAt(at.x, at.z) + lift,
        at.z,
        yardYaw,
        scale,
        scale,
        scale,
        0xffffff,
        false,
      );
    };
    for (const bush of yard.bushes) stand('bush', bush.u, bush.v, bush.scale);
    for (const tree of yard.trees) stand('tree', tree.u, tree.v, tree.scale * YARD_TREE_SCALE);
    if (building.state !== BuildingState.Active) return;
    if (yard.pool) stand('pool', yard.pool.u, yard.pool.v, 1);
    if (yard.trampoline) stand('trampoline', yard.trampoline.u, yard.trampoline.v, 1);
    for (const grill of yard.grills) stand('grill', grill.u, grill.v, 1, DRIVE_Y_OFFSET);
  }
}
