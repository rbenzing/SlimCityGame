/**
 * The farm kit: everything on a farm that stands up off its ground. The barn's
 * walls are the farm's body (BuildingInstancer, from the same plan); this
 * draws the rest — the barn's gambrel roof, the farmhouse, stave silos, grain
 * bins, orchard trees, the paddock's post-and-rail fence and the cattle
 * grazing inside it.
 *
 * One InstancedMesh pool per shape, as everywhere: a shape is one merged
 * geometry, and each instance is only a transform and a colour. The cattle are
 * the one moving part, a transform written per frame from the farm id and the
 * caller's clock, so they simulate nothing and every frame agrees with every
 * other.
 *
 * A farm going up shows only its ground and the barn frame; an abandoned one
 * keeps its buildings, darkened, and loses its herd.
 */
import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { uniform, vec3 } from 'three/tsl';
import { nightTintNode } from './nightlook';
import { BuildingState, VehicleKind } from '../shared/types';
import type { BuildingCatalogEntry, BuildingDelta, BuildingInstance } from '../shared/types';
import {
  COOL_WINDOW_COLOR,
  GLASS_TINT_PUNCHED,
  WARM_WINDOW_COLOR,
  WINDOW_EMISSIVE_STRENGTH,
  isBuildingLitEligible,
  isWindowCool,
  isWindowLit,
} from './buildings';
import { massingLifecycleTint, InstancedSlotPool } from './massing';
import { materialUnit, type MaterialName } from './palette';
import { maxHeightOverRect } from './footprint';
import { TRIM_WHITE, trimColor } from './houses';
import { faceted, hipRoofGeometry } from './hiproof';
import { VEHICLE_PALETTE_HEX, VehicleKitPool } from './vehicles';
import {
  BARN_EAVE_SHARE,
  BIN_DIAMETER_M,
  BIN_EAVE_M,
  DORMER_DEPTH_M,
  DORMER_HEIGHT_M,
  DORMER_INSET_M,
  DORMER_WIDTH_M,
  HOUSE_D_M,
  HOUSE_EAVE_M,
  HOUSE_ROOF_PITCH,
  HOUSE_ROOF_RISE_M,
  HOUSE_W_M,
  PORCH_DEPTH_M,
  PORCH_FLOOR_M,
  PORCH_POST_HEIGHT_M,
  PORCH_POST_M,
  ROOF_OVERHANG_M,
  SHED_EAVE_M,
  SHED_LENGTH_M,
  SHED_POST_SPACING_M,
  SILO_DIAMETER_M,
  SILO_HEIGHT_M,
  TRUCK_SIZE_M,
  WINDOW_H_M,
  WINDOW_W_M,
  orchardTrees,
  paddockHerd,
  planFarm,
  type FarmBox,
  type FarmPlan,
  type FarmRect,
  type FarmRound,
  type FarmShed,
  type FarmWindow,
} from './farmlot';

/** A post every 4 m, 1.3 m high, carrying rails at these heights; the top rail is the USDA cattle fence's 48 in. */
const FENCE_POST_SPACING_M = 4;
const FENCE_POST_H_M = 1.3;
export const FENCE_TOP_RAIL_M = 1.22;
const FENCE_RAIL_HEIGHTS_M: readonly number[] = [0.6, FENCE_TOP_RAIL_M];
/** A semi-dwarf apple tree: a short trunk under a round head about 3.5 m across. */
const TREE_TRUNK_H_M = 1.2;
const TREE_CROWN_M = 3.4;
/** Cattle: 2.4 m nose to tail, which the shape's proportions stand at 1.45 m at the shoulder. */
const COW_LENGTH_M = 2.4;
/** Cattle drift across the paddock at a grazing walk, keeping back from the fence. */
const COW_SPEED_M_PER_S = 0.25;
const COW_FENCE_CLEARANCE_M = 4;
/** A bin's roof is a 30° cone (Sukup, SCAFCO), with a 0.4 m cap on its peak. */
export const BIN_ROOF_PITCH = Math.PI / 6;
const BIN_ROOF_RISE = Math.tan(BIN_ROOF_PITCH) / 2;
export const BIN_CAP_M = 0.4;
/** A bin's sheets are 44 in; its rings show every 1.1 m. */
export const BIN_RING_M = 1.1;
/** A silo is banded every 0.76 m, in vertex colour; the unloader chute is a 0.6 m square shaft with a 1 m cap. */
export const SILO_HOOP_M = 0.76;
export const CHUTE_M = 0.6;
export const CHUTE_CAP_M = 1;
/** The share of its colour a hoop or ring keeps: a darker band on the same surface. */
const BAND_SHADE = 0.6;
/** The thickness of one hoop or ring. */
const BAND_THICKNESS_M = 0.1;
/** A silo's dome is half its width tall. */
const SILO_DOME_RISE = 0.5;
/** The barn's loft door, sliding doors and cupolas, at the sourced sizes. */
export const LOFT_DOOR_W_M = 1.8;
export const LOFT_DOOR_H_M = 2.1;
export const SLIDING_LEAF_W_M = 1.8;
export const SLIDING_LEAF_H_M = 3.6;
const SLIDING_RAIL_ABOVE_M = 0.2;
const TRIM_M = 0.2;
/** The cupola's base is an inch for every foot of ridge it serves; two serve a ridge over 32 ft. */
export const CUPOLA_TWO_OVER_FT = 32;
const FOOT_M = 0.3048;
const INCH_M = FOOT_M / 12;
/** A cupola's body stands this tall for its base; its louvre band, hip cap and seat in the ridge are shares of it. */
const CUPOLA_HEIGHT_RATIO = 1.2;
/** Galvalume sheet on the equipment shed, under a low roof; the dormer's gable rises a little too. */
const GALVALUME_HEX = 0xb4b7b8;
const SHED_ROOF_RISE_M = 0.9;
const DORMER_ROOF_RISE_M = 0.6;

/** Cupolas on a ridge of `ridgeM` metres: one, or two over 32 ft. */
export function cupolaCount(ridgeM: number): number {
  return ridgeM / FOOT_M > CUPOLA_TWO_OVER_FT ? 2 : 1;
}

/** One cupola's base, an inch for every foot of the ridge it serves. */
export function cupolaBase(ridgeM: number, count: number): number {
  return (ridgeM / count / FOOT_M) * INCH_M;
}

/** A window pane stands this far proud of its wall and is this thick. */
const PANE_DEPTH_M = 0.06;
/** The farm truck drives its yard at 15 km/h. */
export const TRUCK_SPEED_M_PER_S = 15 / 3.6;
/** How long it stops by the silos on each round. */
export const TRUCK_STOP_S = 15;
/** It works from sunrise to sunset on the game's clock, in hours. */
export const TRUCK_WORK_FROM_H = 6;
export const TRUCK_WORK_TO_H = 18;

const INITIAL_CAPACITY = 64;
const INITIAL_TRUCK_CAPACITY = 16;

/** A farmhouse window: dark glass, or lit warm or cool. */
type Pane = 'window' | 'windowWarm' | 'windowCool';
const PANES: readonly Pane[] = ['window', 'windowWarm', 'windowCool'];

type Part =
  | Pane
  | 'barnRoof'
  | 'barnGable'
  | 'houseBody'
  | 'houseRoof'
  | 'silo'
  | 'siloDome'
  | 'bin'
  | 'binRoof'
  | 'trunk'
  | 'crown'
  | 'post'
  | 'rail'
  | 'cow'
  // The barn's detail: white trim, the loft door, the sliding leaves and their rail, the cupolas.
  | 'trim'
  | 'loftDoor'
  | 'slidingDoor'
  | 'doorRail'
  | 'cupola'
  | 'cupolaLouvre'
  | 'cupolaCap'
  // The silos' unloader chute with its cap, and the bins' peak cap.
  | 'chute'
  | 'chuteCap'
  | 'binCap'
  // The foursquare's porch, its steps and its dormer.
  | 'porchFloor'
  | 'porchStep'
  | 'porchPost'
  | 'porchRoof'
  | 'dormer'
  | 'dormerRoof'
  | 'dormerGlass'
  // A crop farm's equipment shed.
  | 'shedPost'
  | 'shedWall'
  | 'shedRoof'
  | 'shedGable';

/**
 * Each fixed part's surface. A barn's gables take its own paint instead
 * (placeRoof), a window its glass or its light (placeWindows), and the detail
 * parts the surface they are put with.
 */
const PART_COLOUR: Readonly<
  Record<
    | 'barnRoof'
    | 'houseBody'
    | 'houseRoof'
    | 'silo'
    | 'siloDome'
    | 'bin'
    | 'binRoof'
    | 'trunk'
    | 'crown'
    | 'post'
    | 'rail',
    MaterialName
  >
> = {
  barnRoof: 'metalPlates',
  houseBody: 'whitePlaster',
  houseRoof: 'slateRoof',
  silo: 'cleanConcrete',
  siloDome: 'metalPlates',
  bin: 'whiteBrick',
  binRoof: 'whiteBrick',
  trunk: 'darkWood',
  crown: 'brightVegetation',
  post: 'brightWood',
  rail: 'brightWood',
};
/** Black, white and brown, as a mixed herd is. */
const COW_COATS: readonly MaterialName[] = ['whitePlaster', 'darkestWood', 'brightWood'];

function hash1(n: number): number {
  let h = n >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

// ---------------------------------------------------------------------------
// Shapes. Each is built once, with its base at y = 0 and a unit size along
// every axis the instance scales, so an instance's scale is its size in metres.
// ---------------------------------------------------------------------------

/** The barn's gambrel: a steep lower pitch to 60% of the rise, a shallow upper one to the ridge. */
const GAMBREL: ReadonlyArray<readonly [number, number]> = [
  [0.5, 0],
  [0.36, 0.6],
  [0, 1],
  [-0.36, 0.6],
  [-0.5, 0],
];
const GABLE: ReadonlyArray<readonly [number, number]> = [
  [0.5, 0],
  [0, 1],
  [-0.5, 0],
];

/**
 * The pitches of a roof with its ridge along X, spanning x and z over
 * [-0.5, 0.5] and rising to 1: the cross-section `profile` (z, y pairs
 * across the roof, eave to eave) extruded end to end.
 */
function roofSlopes(profile: ReadonlyArray<readonly [number, number]>): THREE.BufferGeometry {
  const tris: Array<[number, number, number]> = [];
  for (let i = 0; i < profile.length - 1; i++) {
    const [za, ya] = profile[i]!;
    const [zb, yb] = profile[i + 1]!;
    tris.push([-0.5, ya, za], [0.5, ya, za], [0.5, yb, zb]);
    tris.push([-0.5, ya, za], [0.5, yb, zb], [-0.5, yb, zb]);
  }
  return faceted(tris);
}

/**
 * The two gable ends under the same roof, closing it at x = ±0.5. They are
 * the building's siding carried up under the roof, so they take its wall
 * colour rather than the roof's.
 */
function roofGables(profile: ReadonlyArray<readonly [number, number]>): THREE.BufferGeometry {
  const tris: Array<[number, number, number]> = [];
  for (const x of [-0.5, 0.5]) {
    for (let i = 0; i < profile.length - 1; i++) {
      const [za, ya] = profile[i]!;
      const [zb, yb] = profile[i + 1]!;
      if (x < 0) tris.push([x, 0, 0], [x, yb, zb], [x, ya, za]);
      else tris.push([x, 0, 0], [x, ya, za], [x, yb, zb]);
    }
  }
  return faceted(tris);
}

const baseBox = (): THREE.BufferGeometry => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const baseCylinder = (): THREE.BufferGeometry =>
  new THREE.CylinderGeometry(0.5, 0.5, 1, 14, 1, true).translate(0, 0.5, 0);

/** A cow, nose at +Z: a body on four legs and a head, merged into one shape of unit length. */
function cowShape(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number): void => {
    parts.push(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z).toNonIndexed());
  };
  // In fractions of the cow's length: a body over legs, a head forward and low.
  box(0.3, 0.34, 0.72, 0, 0.26, -0.04);
  for (const [x, z] of [
    [-0.1, 0.24],
    [0.1, 0.24],
    [-0.1, -0.3],
    [0.1, -0.3],
  ] as const) {
    box(0.07, 0.26, 0.07, x, 0, z);
  }
  box(0.16, 0.16, 0.2, 0, 0.4, 0.4);
  const positions: number[] = [];
  for (const p of parts) positions.push(...(p.getAttribute('position').array as Float32Array));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A cylinder of unit width and a height of `height` metres, banded in vertex
 * colour: a hoop `BAND_THICKNESS_M` thick at the top of every `spacing`
 * metres, darker than the stave between, so the bands cost no instance.
 */
function bandedCylinder(height: number, spacing: number): THREE.BufferGeometry {
  const bands = Math.max(1, Math.round(height / spacing));
  const pitch = height / bands;
  const radial = 14;
  const rows: Array<{ y: number; shade: number }> = [{ y: 0, shade: 1 }];
  for (let i = 0; i < bands; i++) {
    const top = (i + 1) * pitch;
    rows.push(
      { y: top - BAND_THICKNESS_M, shade: 1 },
      { y: top - BAND_THICKNESS_M, shade: BAND_SHADE },
    );
    rows.push({ y: top, shade: BAND_SHADE }, { y: top, shade: 1 });
  }
  const positions: number[] = [];
  const colors: number[] = [];
  const around = (k: number): [number, number] => {
    const a = (k / radial) * Math.PI * 2;
    return [0.5 * Math.sin(a), 0.5 * Math.cos(a)];
  };
  // Each pair of rows is a strip of quads in the shade of the band it spans, wound outward.
  for (let i = 0; i + 1 < rows.length; i++) {
    const lo = rows[i]!;
    const hi = rows[i + 1]!;
    if (hi.y - lo.y < 1e-9) continue;
    const shade = Math.min(lo.shade, hi.shade);
    const y0 = lo.y / height;
    const y1 = hi.y / height;
    for (let k = 0; k < radial; k++) {
      const [x0, z0] = around(k);
      const [x1, z1] = around(k + 1);
      positions.push(x0, y0, z0, x0, y1, z0, x1, y1, z1, x0, y0, z0, x1, y1, z1, x1, y0, z1);
      for (let v = 0; v < 6; v++) colors.push(shade, shade, shade);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** A four-sided pyramid of unit base and height, its base at y = 0: the cupola's hipped cap. */
function pyramid(): THREE.BufferGeometry {
  return new THREE.ConeGeometry(0.5 * Math.SQRT2, 1, 4, 1, true)
    .rotateY(Math.PI / 4)
    .translate(0, 0.5, 0);
}

const SHAPES: Readonly<Record<Part, () => THREE.BufferGeometry>> = {
  window: baseBox,
  windowWarm: baseBox,
  windowCool: baseBox,
  barnRoof: () => roofSlopes(GAMBREL),
  barnGable: () => roofGables(GAMBREL),
  houseBody: baseBox,
  houseRoof: () => hipRoofGeometry((HOUSE_W_M - HOUSE_D_M) / (HOUSE_W_M + 2 * ROOF_OVERHANG_M)),
  silo: () => bandedCylinder(SILO_HEIGHT_M, SILO_HOOP_M),
  siloDome: () =>
    new THREE.SphereGeometry(0.5, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 2, 1),
  bin: () => bandedCylinder(BIN_EAVE_M, BIN_RING_M),
  binRoof: () => new THREE.ConeGeometry(0.5, 1, 14, 1, true).translate(0, 0.5, 0),
  trunk: baseBox,
  crown: () => new THREE.IcosahedronGeometry(0.5, 0).translate(0, 0.5, 0),
  post: baseBox,
  rail: baseBox,
  cow: cowShape,
  trim: baseBox,
  loftDoor: baseBox,
  slidingDoor: baseBox,
  doorRail: baseBox,
  cupola: baseBox,
  cupolaLouvre: baseBox,
  cupolaCap: pyramid,
  chute: baseBox,
  chuteCap: baseBox,
  binCap: baseCylinder,
  porchFloor: baseBox,
  porchStep: baseBox,
  porchPost: baseBox,
  porchRoof: baseBox,
  dormer: baseBox,
  dormerRoof: () => roofSlopes(GABLE),
  dormerGlass: baseBox,
  shedPost: baseBox,
  shedWall: baseBox,
  shedRoof: () => roofSlopes(GABLE),
  shedGable: () => roofGables(GABLE),
};

// ---------------------------------------------------------------------------
// Grazing
// ---------------------------------------------------------------------------

/** Where a cow stands and which way it faces. */
export interface CowPose {
  x: number;
  z: number;
  /** Heading, atan2(dx, dz) of where it is walking: nose at +Z. */
  yaw: number;
}

/**
 * Cow `index` of farm `farmId` at `tMs`: a slow figure drifting across the
 * paddock, clear of the fence, each head on its own phase. A pure function of
 * its arguments, so every frame, and every renderer, agrees.
 */
export function cowPose(paddock: FarmRect, farmId: number, index: number, tMs: number): CowPose {
  const cx = (paddock.x0 + paddock.x1) / 2;
  const cz = (paddock.z0 + paddock.z1) / 2;
  const ax = Math.max(0, (paddock.x1 - paddock.x0) / 2 - COW_FENCE_CLEARANCE_M);
  const az = Math.max(0, (paddock.z1 - paddock.z0) / 2 - COW_FENCE_CLEARANCE_M);
  const seed = farmId * 97 + index * 13;
  const phaseX = hash1(seed) * Math.PI * 2;
  const phaseZ = hash1(seed + 1) * Math.PI * 2;
  // Angular rates that walk the widest sweep at grazing speed; the two differ
  // so the path is a figure that never closes into a loop the eye can follow.
  const reach = Math.max(1, Math.max(ax, az));
  const wx = (COW_SPEED_M_PER_S / reach) * (0.7 + 0.3 * hash1(seed + 2));
  const wz = wx * (0.61 + 0.2 * hash1(seed + 3));
  const t = tMs / 1000;
  const x = cx + ax * Math.sin(wx * t + phaseX);
  const z = cz + az * Math.sin(wz * t + phaseZ);
  const dx = ax * wx * Math.cos(wx * t + phaseX);
  const dz = az * wz * Math.cos(wz * t + phaseZ);
  return { x, z, yaw: Math.atan2(dx, dz) };
}

// ---------------------------------------------------------------------------
// The farm truck
// ---------------------------------------------------------------------------

/** A farm truck's round, measured: its points, how far along each one lies, and where it stops. */
export interface TruckRound {
  points: readonly FarmRound[];
  /** Distance along the round to each point, metres. */
  along: readonly number[];
  length: number;
  /** Distance along the round to the stop by the silos. */
  stopAt: number;
}

export function measureTruckRound(points: readonly FarmRound[], stop: number): TruckRound {
  const along = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    along.push(along[i - 1]! + Math.hypot(b.x - a.x, b.z - a.z));
  }
  return { points, along, length: along[along.length - 1]!, stopAt: along[stop] ?? 0 };
}

/** How long one round takes, seconds: the driving and the stop. */
export function truckLapSeconds(round: TruckRound): number {
  return round.length / TRUCK_SPEED_M_PER_S + TRUCK_STOP_S;
}

/**
 * Where the truck is `elapsedS` seconds into a round: driving at its yard
 * speed, standing at the stop for TRUCK_STOP_S, then on back to where it
 * parks, where it stays once the round is done. It faces the way it drives.
 * A pure function of its arguments.
 */
export function truckPose(round: TruckRound, elapsedS: number): CowPose {
  const t = Math.max(0, elapsedS);
  const toStop = round.stopAt / TRUCK_SPEED_M_PER_S;
  const s =
    t < toStop
      ? t * TRUCK_SPEED_M_PER_S
      : t < toStop + TRUCK_STOP_S
        ? round.stopAt
        : Math.min(round.length, (t - TRUCK_STOP_S) * TRUCK_SPEED_M_PER_S);
  // The segment the distance falls in; parked at the end, it faces the way it came in.
  let i = 1;
  while (i < round.points.length - 1 && round.along[i]! < s) i++;
  const a = round.points[i - 1]!;
  const b = round.points[i]!;
  const span = round.along[i]! - round.along[i - 1]!;
  const f = span > 0 ? Math.min(1, Math.max(0, (s - round.along[i - 1]!) / span)) : 0;
  return {
    x: a.x + (b.x - a.x) * f,
    z: a.z + (b.z - a.z) * f,
    yaw: Math.atan2(b.x - a.x, b.z - a.z),
  };
}

/** Whether a farm works at this hour of the game's day. */
export function truckWorkingAt(dayFraction: number): boolean {
  const hour = (((dayFraction % 1) + 1) % 1) * 24;
  return hour >= TRUCK_WORK_FROM_H && hour < TRUCK_WORK_TO_H;
}

// ---------------------------------------------------------------------------
// The renderer
// ---------------------------------------------------------------------------

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _xAxis = new THREE.Vector3(1, 0, 0);
const _direction = new THREE.Vector3();

interface Herd {
  paddock: FarmRect;
  farmId: number;
  slots: number[];
}

/** A farmhouse's windows: where each pane stands, which pool it is in, and its slot there. */
interface HouseLights {
  farmId: number;
  /** Only a lived-in house lights. */
  lightable: boolean;
  /** The lifecycle tint its dark glass takes. */
  tint: readonly [number, number, number];
  matrices: THREE.Matrix4[];
  panes: Pane[];
  slots: number[];
}

/** A farm's truck: its round, its slot, and when its round began, or null while it is parked. */
interface Truck {
  round: TruckRound;
  slot: number;
  lapStartMs: number | null;
}

/** The emissive material a lit pane is drawn in: its light by day too, since it is lit only at night. */
function litPaneMaterial(
  hex: number,
  nightFactor: ReturnType<typeof uniform<'float'>>,
): MeshStandardNodeMaterial {
  const c = new THREE.Color(hex);
  const light = vec3(c.r, c.g, c.b);
  const material = new MeshStandardNodeMaterial({ roughness: 1, metalness: 0 });
  material.colorNode = light;
  material.emissiveNode = light.mul(nightFactor).mul(WINDOW_EMISSIVE_STRENGTH);
  return material;
}

/** Takes a slot in `part`'s pool at `matrix`, painted a palette surface, a catalog colour or a linear colour. */
type Colour = MaterialName | number | readonly [number, number, number];
type Put = (part: Part, colour: Colour, matrix: THREE.Matrix4) => void;

export class FarmRenderer {
  private readonly heightAt: (x: number, z: number) => number;
  private readonly catalogById: Map<string, BuildingCatalogEntry>;
  private readonly dirtAt: (x: number, z: number) => boolean;
  private readonly nightFactorUniform = uniform(0);
  private readonly pools: Record<Part, InstancedSlotPool>;
  /** building id -> the slots it holds in each pool. */
  private readonly owned = new Map<number, Array<[Part, number]>>();
  private readonly herds = new Map<number, Herd>();
  private readonly lights = new Map<number, HouseLights>();
  private readonly trucks = new Map<number, Truck>();
  private readonly truckPool: VehicleKitPool;
  private nightFactor = 0;
  private working = false;

  constructor(
    scene: THREE.Scene,
    heightAt: (x: number, z: number) => number,
    catalog: readonly BuildingCatalogEntry[],
    dirtAt: (x: number, z: number) => boolean,
  ) {
    this.heightAt = heightAt;
    this.catalogById = new Map(catalog.map((e) => [e.id, e]));
    this.dirtAt = dirtAt;
    const material = new MeshStandardNodeMaterial({ roughness: 1, metalness: 0 });
    // Instance colour carries each part's surface and the silos' and bins' vertex colour their
    // hoops; the night ramp darkens all of it.
    material.vertexColors = true;
    material.colorNode = nightTintNode(this.nightFactorUniform);
    const materials: Partial<Record<Part, MeshStandardNodeMaterial>> = {
      windowWarm: litPaneMaterial(WARM_WINDOW_COLOR, this.nightFactorUniform),
      windowCool: litPaneMaterial(COOL_WINDOW_COLOR, this.nightFactorUniform),
    };
    const pools = {} as Record<Part, InstancedSlotPool>;
    for (const part of Object.keys(SHAPES) as Part[]) {
      pools[part] = new InstancedSlotPool(
        scene,
        SHAPES[part](),
        materials[part] ?? material,
        INITIAL_CAPACITY,
      );
    }
    // The herd moves every frame, so its bounds are never still enough to cull by.
    pools.cow.getMesh().frustumCulled = false;
    this.pools = pools;
    this.truckPool = new VehicleKitPool(scene, VehicleKind.Truck, INITIAL_TRUCK_CAPACITY);
  }

  apply(delta: BuildingDelta): void {
    for (const id of delta.removed) this.free(id);
    for (const b of [...delta.added, ...delta.updated]) {
      this.free(b.id);
      this.place(b);
    }
    for (const pool of Object.values(this.pools)) pool.commit();
    this.pools.cow.getMesh().frustumCulled = false;
    this.truckPool.finalize();
    // The trucks move every frame too.
    this.truckPool.mesh.frustumCulled = false;
  }

  /**
   * Walks every herd and drives every truck to where it is at `tMs`, the
   * caller's visual clock. A parked truck starts its round when the working
   * day has begun, and a round under way at the day's end is finished before
   * it parks, so it never jumps.
   */
  update(tMs: number): void {
    this.walkHerds(tMs);
    this.driveTrucks(tMs);
  }

  private walkHerds(tMs: number): void {
    for (const herd of this.herds.values()) {
      herd.slots.forEach((slot, i) => {
        const pose = cowPose(herd.paddock, herd.farmId, i, tMs);
        _position.set(pose.x, this.heightAt(pose.x, pose.z), pose.z);
        _quaternion.setFromAxisAngle(_yAxis, pose.yaw);
        _scale.setScalar(COW_LENGTH_M);
        _matrix.compose(_position, _quaternion, _scale);
        this.pools.cow.setMatrixAt(slot, _matrix);
      });
    }
    if (this.herds.size > 0) this.pools.cow.getMesh().instanceMatrix.needsUpdate = true;
  }

  private driveTrucks(tMs: number): void {
    for (const truck of this.trucks.values()) {
      if (truck.lapStartMs === null && this.working) truck.lapStartMs = tMs;
      let elapsed = truck.lapStartMs === null ? 0 : (tMs - truck.lapStartMs) / 1000;
      const lap = truckLapSeconds(truck.round);
      if (truck.lapStartMs !== null && elapsed >= lap) {
        if (this.working) {
          const laps = Math.floor(elapsed / lap);
          truck.lapStartMs += laps * lap * 1000;
          elapsed -= laps * lap;
        } else {
          truck.lapStartMs = null;
          elapsed = 0;
        }
      }
      this.placeTruck(truck, truckPose(truck.round, elapsed));
    }
    if (this.trucks.size > 0) this.truckPool.mesh.instanceMatrix.needsUpdate = true;
  }

  /** The time of day, 0 to 1 from midnight: what says whether the farms are working. */
  setDayFraction(dayFraction: number): void {
    this.working = truckWorkingAt(dayFraction);
  }

  setNightFactor(nightFactor: number): void {
    const clamped = Math.min(1, Math.max(0, nightFactor));
    this.nightFactorUniform.value = clamped;
    if (clamped === this.nightFactor) return;
    this.nightFactor = clamped;
    let changed = false;
    for (const lights of this.lights.values()) {
      lights.panes.forEach((pane, i) => {
        const want = this.paneFor(lights, i);
        if (want === pane) return;
        this.pools[pane].free(lights.slots[i]!);
        this.setPane(lights, i, want);
        changed = true;
      });
    }
    if (changed) for (const pane of PANES) this.pools[pane].commit();
  }

  /** How many farmhouse windows are dark, lit warm and lit cool, across every farm. */
  windowCounts(): Record<Pane, number> {
    const counts: Record<Pane, number> = { window: 0, windowWarm: 0, windowCool: 0 };
    for (const lights of this.lights.values()) for (const pane of lights.panes) counts[pane] += 1;
    return counts;
  }

  /** How many farmhouse windows are lit, across every farm. */
  litWindowCount(): number {
    const { windowWarm, windowCool } = this.windowCounts();
    return windowWarm + windowCool;
  }

  /** How many farm trucks there are. */
  truckCount(): number {
    return this.trucks.size;
  }

  /** Where the truck of farm `id` stands, for tests and the dev read-back. */
  truckAt(id: number): { x: number; z: number } | null {
    const truck = this.trucks.get(id);
    if (!truck) return null;
    this.truckPool.mesh.getMatrixAt(truck.slot, _matrix);
    _position.setFromMatrixPosition(_matrix);
    return { x: _position.x, z: _position.z };
  }

  /** Instances in one part's pool, for tests and the dev read-back. */
  partCount(part: Part): number {
    return this.pools[part].instanceCount();
  }

  /** How many head of cattle are grazing, across every farm. */
  herdSize(): number {
    let n = 0;
    for (const herd of this.herds.values()) n += herd.slots.length;
    return n;
  }

  private free(id: number): void {
    for (const [part, slot] of this.owned.get(id) ?? []) this.pools[part].free(slot);
    this.owned.delete(id);
    this.herds.delete(id);
    const lights = this.lights.get(id);
    if (lights) lights.panes.forEach((pane, i) => this.pools[pane].free(lights.slots[i]!));
    this.lights.delete(id);
    const truck = this.trucks.get(id);
    if (truck) this.truckPool.free(truck.slot);
    this.trucks.delete(id);
  }

  /** Which pool window `i` belongs in at the current night factor. */
  private paneFor(lights: HouseLights, i: number): Pane {
    if (!lights.lightable || !isWindowLit(lights.farmId, i, this.nightFactor)) return 'window';
    return isWindowCool(lights.farmId, i) ? 'windowCool' : 'windowWarm';
  }

  /** Puts window `i` in `pane`'s pool: dark glass in its lifecycle tint, or a light. */
  private setPane(lights: HouseLights, i: number, pane: Pane): void {
    const pool = this.pools[pane];
    const slot = pool.allocate();
    pool.setMatrixAt(slot, lights.matrices[i]!);
    if (pane === 'window') {
      const [r, g, b] = GLASS_TINT_PUNCHED;
      _color.setRGB(r * lights.tint[0], g * lights.tint[1], b * lights.tint[2]);
    } else {
      _color.setRGB(1, 1, 1);
    }
    pool.setColorAt(slot, _color);
    lights.panes[i] = pane;
    lights.slots[i] = slot;
  }

  /** The farmhouse's panes, each standing just proud of its wall, facing out. */
  private placeWindows(building: BuildingInstance, house: FarmBox, windows: FarmWindow[]): void {
    const ground = maxHeightOverRect(this.heightAt, house.x0, house.z0, house.x1, house.z1);
    const lights: HouseLights = {
      farmId: building.id,
      lightable: isBuildingLitEligible(building.state),
      tint: massingLifecycleTint(building.state),
      matrices: windows.map((w) => {
        _position.set(
          w.x + (w.nx * PANE_DEPTH_M) / 2,
          ground + w.sill,
          w.z + (w.nz * PANE_DEPTH_M) / 2,
        );
        _quaternion.setFromAxisAngle(_yAxis, Math.atan2(w.nx, w.nz));
        _scale.set(WINDOW_W_M, WINDOW_H_M, PANE_DEPTH_M);
        return new THREE.Matrix4().compose(_position, _quaternion, _scale);
      }),
      panes: [],
      slots: [],
    };
    windows.forEach((_, i) => this.setPane(lights, i, this.paneFor(lights, i)));
    this.lights.set(building.id, lights);
  }

  /** Stands a truck at `pose`, its wheels on the ground. */
  private placeTruck(truck: Truck, pose: CowPose): void {
    const [w, h, l] = TRUCK_SIZE_M;
    // The kit's base is at y = -0.5, so its middle rides half its height up.
    _position.set(pose.x, this.heightAt(pose.x, pose.z) + h / 2, pose.z);
    _quaternion.setFromAxisAngle(_yAxis, pose.yaw);
    _scale.set(w, h, l);
    _matrix.compose(_position, _quaternion, _scale);
    this.truckPool.mesh.setMatrixAt(truck.slot, _matrix);
  }

  private place(building: BuildingInstance): void {
    const entry = this.catalogById.get(building.catalogId);
    if (!entry) return;
    const plan = planFarm(building, entry, this.dirtAt);
    if (!plan) return;
    // A farm going up is its ground and the barn frame the instancer draws.
    if (building.state === BuildingState.Constructing) return;

    const slots: Array<[Part, number]> = [];
    const tint = massingLifecycleTint(building.state);
    const put: Put = (part, colour, matrix) => {
      const pool = this.pools[part];
      const slot = pool.allocate();
      pool.setMatrixAt(slot, matrix);
      // A catalog colour is the body's own paint, converted as the body converts it.
      if (typeof colour === 'number') _color.setHex(colour);
      else if (typeof colour === 'string') _color.setRGB(...materialUnit(colour));
      else _color.setRGB(...colour);
      _color.setRGB(_color.r * tint[0], _color.g * tint[1], _color.b * tint[2]);
      pool.setColorAt(slot, _color);
      slots.push([part, slot]);
    };

    const eave = entry.height * BARN_EAVE_SHARE;
    this.placeRoof('barnRoof', 'barnGable', entry.color, plan.barn, eave, entry.height - eave, put);
    this.placeBarnDetail(plan, entry.height, eave, put);
    this.placeHouse(plan, building.id, put);
    this.placeWindows(building, plan.house, plan.houseWindows);
    for (const silo of plan.silos) {
      this.placeRound(
        'silo',
        'siloDome',
        silo,
        SILO_DIAMETER_M,
        SILO_HEIGHT_M,
        SILO_DOME_RISE,
        put,
      );
      this.placeChute(plan, silo, put);
    }
    for (const bin of plan.bins) {
      this.placeRound('bin', 'binRoof', bin, BIN_DIAMETER_M, BIN_EAVE_M, BIN_ROOF_RISE, put);
      this.placeBinCap(bin, put);
    }
    if (plan.shed) this.placeShed(plan.shed, put);
    if (plan.kind === 'orchard') this.placeOrchard(plan, building.id, put);
    if (plan.kind === 'pasture') this.placeFence(plan.field, put);
    this.owned.set(building.id, slots);

    if (plan.kind === 'pasture' && building.state === BuildingState.Active) {
      const herd: Herd = { paddock: plan.field, farmId: building.id, slots: [] };
      for (let i = 0; i < paddockHerd(plan); i++) {
        _matrix.makeScale(0, 0, 0);
        put('cow', COW_COATS[Math.floor(hash1(building.id * 53 + i) * COW_COATS.length)]!, _matrix);
        herd.slots.push(slots[slots.length - 1]![1]);
      }
      this.herds.set(building.id, herd);
      this.walkHerds(0);
    }

    // A working farm's truck, parked until its day begins.
    if (plan.truckRoute && building.state === BuildingState.Active) {
      const truck: Truck = {
        round: measureTruckRound(plan.truckRoute, plan.truckStop),
        slot: this.truckPool.allocate(),
        lapStartMs: null,
      };
      _color.setHex(
        VEHICLE_PALETTE_HEX[Math.floor(hash1(building.id * 61 + 5) * VEHICLE_PALETTE_HEX.length)]!,
      );
      this.truckPool.mesh.setColorAt(truck.slot, _color);
      this.placeTruck(truck, truckPose(truck.round, 0));
      this.trucks.set(building.id, truck);
    }
  }

  /**
   * A roof over a box's walls, `eave` up from the highest ground under it,
   * rising `rise`: its pitches in the roof's own surface and its gable ends
   * in `gableColour`, the walls'.
   */
  private placeRoof(
    roof: 'barnRoof' | 'shedRoof',
    gable: 'barnGable' | 'shedGable',
    gableColour: Colour,
    box: FarmBox,
    eave: number,
    rise: number,
    put: Put,
    roofColour: Colour = roof === 'barnRoof' ? PART_COLOUR.barnRoof : GALVALUME_HEX,
    overhang = ROOF_OVERHANG_M,
  ): void {
    const ground = maxHeightOverRect(this.heightAt, box.x0, box.z0, box.x1, box.z1);
    // The pitches overhang the walls; the gables stand flush on them.
    const spanX = box.x1 - box.x0;
    const spanZ = box.z1 - box.z0;
    const along = box.ridgeAlongX ? spanX : spanZ;
    const across = box.ridgeAlongX ? spanZ : spanX;
    _position.set((box.x0 + box.x1) / 2, ground + eave, (box.z0 + box.z1) / 2);
    // The shape's ridge runs along X; a ridge along Z is the same roof turned a quarter.
    _quaternion.setFromAxisAngle(_yAxis, box.ridgeAlongX ? 0 : Math.PI / 2);
    _scale.set(along + overhang * 2, rise, across + overhang * 2);
    _matrix.compose(_position, _quaternion, _scale);
    put(roof, roofColour, _matrix);
    _scale.set(along, rise, across);
    _matrix.compose(_position, _quaternion, _scale);
    put(gable, gableColour, _matrix);
  }

  /**
   * A box standing on the ground, turned so its +Z faces the unit vector
   * `facing` (its width along the wall's tangent, its depth out of the wall):
   * centred at (x, z) with its base `base` metres up from `ground`.
   */
  private putBox(
    put: Put,
    part: Part,
    colour: Colour,
    at: { x: number; z: number },
    ground: number,
    base: number,
    facing: FarmRound,
    size: readonly [number, number, number],
    turn = 0,
  ): void {
    _position.set(at.x, ground + base, at.z);
    _quaternion.setFromAxisAngle(_yAxis, Math.atan2(facing.x, facing.z) + turn);
    _scale.set(size[0], size[1], size[2]);
    _matrix.compose(_position, _quaternion, _scale);
    put(part, colour, _matrix);
  }

  /**
   * The barn's detail: white trim at its four corners, the loft door centred
   * in the gable that faces the drive, two sliding leaves on a rail across the
   * yard face, and a cupola or two on the ridge.
   */
  private placeBarnDetail(plan: FarmPlan, height: number, eave: number, put: Put): void {
    const { barn, front, along } = plan;
    const ground = maxHeightOverRect(this.heightAt, barn.x0, barn.z0, barn.x1, barn.z1);
    const c = { x: (barn.x0 + barn.x1) / 2, z: (barn.z0 + barn.z1) / 2 };
    const length = barn.ridgeAlongX ? barn.x1 - barn.x0 : barn.z1 - barn.z0;
    const width = barn.ridgeAlongX ? barn.z1 - barn.z0 : barn.x1 - barn.x0;
    const tangent = { x: front.z, z: -front.x };
    const at = (a: number, f: number): { x: number; z: number } => ({
      x: c.x + along.x * a + front.x * f,
      z: c.z + along.z * a + front.z * f,
    });
    const box = (
      part: Part,
      colour: Colour,
      p: { x: number; z: number },
      base: number,
      facing: FarmRound,
      size: readonly [number, number, number],
    ): void => this.putBox(put, part, colour, p, ground, base, facing, size);

    for (const a of [-1, 1]) {
      for (const f of [-1, 1]) {
        box('trim', TRIM_WHITE, at((a * length) / 2, (f * width) / 2), 0, front, [
          TRIM_M,
          eave,
          TRIM_M,
        ]);
      }
    }

    // Two leaves on the yard face, each beside the door's middle, framed in white and hung from a rail.
    const wall = (f: number): { x: number; z: number } => at(0, (width / 2) * f + 0.06 * f);
    for (const k of [-1, 1]) {
      const p = wall(1);
      box(
        'slidingDoor',
        PART_COLOUR.trunk,
        {
          x: p.x + (tangent.x * (k * SLIDING_LEAF_W_M)) / 2,
          z: p.z + (tangent.z * (k * SLIDING_LEAF_W_M)) / 2,
        },
        0,
        front,
        [SLIDING_LEAF_W_M, SLIDING_LEAF_H_M, 0.12],
      );
    }
    const doorFrame = wall(1);
    for (const k of [-1, 1]) {
      box(
        'trim',
        TRIM_WHITE,
        {
          x: doorFrame.x + tangent.x * k * (SLIDING_LEAF_W_M + TRIM_M / 2),
          z: doorFrame.z + tangent.z * k * (SLIDING_LEAF_W_M + TRIM_M / 2),
        },
        0,
        front,
        [TRIM_M, SLIDING_LEAF_H_M, 0.14],
      );
    }
    box('trim', TRIM_WHITE, doorFrame, SLIDING_LEAF_H_M, front, [
      2 * SLIDING_LEAF_W_M + 2 * TRIM_M,
      TRIM_M,
      0.14,
    ]);
    box(
      'doorRail',
      PART_COLOUR.siloDome,
      doorFrame,
      SLIDING_LEAF_H_M + SLIDING_RAIL_ABOVE_M,
      front,
      [4 * SLIDING_LEAF_W_M, 0.08, 0.1],
    );

    // The loft door, 6 × 7 ft, in the middle of the gable that faces the drive, its head and jambs trimmed.
    const gable = { x: -along.x, z: -along.z };
    const gableAt = (f: number): { x: number; z: number } => ({
      x: c.x + gable.x * (length / 2 + 0.05) + front.x * f,
      z: c.z + gable.z * (length / 2 + 0.05) + front.z * f,
    });
    const sill = eave + 0.3;
    box('loftDoor', PART_COLOUR.trunk, gableAt(0), sill, gable, [
      LOFT_DOOR_W_M,
      LOFT_DOOR_H_M,
      0.1,
    ]);
    for (const k of [-1, 1]) {
      box('trim', TRIM_WHITE, gableAt((k * (LOFT_DOOR_W_M + TRIM_M)) / 2), sill, gable, [
        TRIM_M,
        LOFT_DOOR_H_M,
        0.12,
      ]);
    }
    box('trim', TRIM_WHITE, gableAt(0), sill + LOFT_DOOR_H_M, gable, [
      LOFT_DOOR_W_M + 2 * TRIM_M,
      TRIM_M,
      0.12,
    ]);

    // The cupola's base is an inch for every foot of ridge it serves; a ridge over 32 ft takes two.
    const count = cupolaCount(length);
    const base = cupolaBase(length, count);
    for (let i = 0; i < count; i++) {
      const a = count === 1 ? 0 : (i === 0 ? -1 : 1) * (length / 4);
      const p = at(a, 0);
      const seat = height - base * 0.25;
      const body = base * CUPOLA_HEIGHT_RATIO;
      box('cupola', PART_COLOUR.houseBody, p, seat, front, [base, body, base]);
      box('cupolaLouvre', PART_COLOUR.trunk, p, seat + body * 0.28, front, [
        base + 0.08,
        body * 0.44,
        base + 0.08,
      ]);
      box('cupolaCap', PART_COLOUR.siloDome, p, seat + body, front, [
        base * 1.3,
        base * 0.45,
        base * 1.3,
      ]);
    }
  }

  /**
   * The farmhouse, an American foursquare: two storeys under a hipped 6:12
   * roof with a one-bay dormer on the front slope, and a one-storey porch the
   * width of the front, its floor up on two risers, on slim posts, in the
   * house kit's trim.
   */
  private placeHouse(plan: FarmPlan, farmId: number, put: Put): void {
    const { house, front } = plan;
    const ground = maxHeightOverRect(this.heightAt, house.x0, house.z0, house.x1, house.z1);
    const c = { x: (house.x0 + house.x1) / 2, z: (house.z0 + house.z1) / 2 };
    _position.set(c.x, ground, c.z);
    _quaternion.identity();
    _scale.set(house.x1 - house.x0, HOUSE_EAVE_M, house.z1 - house.z0);
    _matrix.compose(_position, _quaternion, _scale);
    put('houseBody', PART_COLOUR.houseBody, _matrix);

    // The hip's ridge runs along the long plan, overhanging its eaves.
    const longX = house.x1 - house.x0 >= house.z1 - house.z0;
    _position.set(c.x, ground + HOUSE_EAVE_M, c.z);
    _quaternion.setFromAxisAngle(_yAxis, longX ? 0 : Math.PI / 2);
    _scale.set(HOUSE_W_M + ROOF_OVERHANG_M * 2, HOUSE_ROOF_RISE_M, HOUSE_D_M + ROOF_OVERHANG_M * 2);
    _matrix.compose(_position, _quaternion, _scale);
    put('houseRoof', PART_COLOUR.houseRoof, _matrix);

    const tangent = { x: front.z, z: -front.x };
    const trim = trimColor(farmId, materialUnit('whitePlaster'));
    const at = (t: number, f: number): { x: number; z: number } => ({
      x: c.x + tangent.x * t + front.x * f,
      z: c.z + tangent.z * t + front.z * f,
    });
    const box = (
      part: Part,
      colour: Colour,
      p: { x: number; z: number },
      base: number,
      size: readonly [number, number, number],
    ): void => this.putBox(put, part, colour, p, ground, base, front, size);

    // The porch: a floor 0.45 m up on a single tread, posts 2.4 m tall, a flat roof with a trimmed fascia.
    const wall = HOUSE_D_M / 2;
    box('porchFloor', PART_COLOUR.post, at(0, wall + PORCH_DEPTH_M / 2), 0, [
      HOUSE_W_M,
      PORCH_FLOOR_M,
      PORCH_DEPTH_M,
    ]);
    box('porchStep', PART_COLOUR.post, at(0, wall + PORCH_DEPTH_M + 0.2), 0, [
      1.6,
      PORCH_FLOOR_M / 2,
      0.4,
    ]);
    const posts = 4;
    for (let i = 0; i < posts; i++) {
      const t = -HOUSE_W_M / 2 + PORCH_POST_M / 2 + (i * (HOUSE_W_M - PORCH_POST_M)) / (posts - 1);
      box('porchPost', trim, at(t, wall + PORCH_DEPTH_M - PORCH_POST_M), PORCH_FLOOR_M, [
        PORCH_POST_M,
        PORCH_POST_HEIGHT_M,
        PORCH_POST_M,
      ]);
    }
    const roofBase = PORCH_FLOOR_M + PORCH_POST_HEIGHT_M;
    box('porchRoof', PART_COLOUR.houseRoof, at(0, wall + (PORCH_DEPTH_M + 0.3) / 2), roofBase, [
      HOUSE_W_M + 0.4,
      0.2,
      PORCH_DEPTH_M + 0.3,
    ]);
    box('trim', trim, at(0, wall + PORCH_DEPTH_M + 0.3), roofBase - 0.15, [
      HOUSE_W_M + 0.4,
      0.35,
      0.08,
    ]);

    // The dormer: its front stands DORMER_INSET_M in from the wall's face, on the front slope.
    const surface = HOUSE_EAVE_M + HOUSE_ROOF_PITCH * (ROOF_OVERHANG_M + DORMER_INSET_M);
    const dormerAt = at(0, wall - DORMER_INSET_M - DORMER_DEPTH_M / 2);
    box('dormer', PART_COLOUR.houseBody, dormerAt, surface, [
      DORMER_WIDTH_M,
      DORMER_HEIGHT_M,
      DORMER_DEPTH_M,
    ]);
    box(
      'dormerGlass',
      GLASS_TINT_PUNCHED,
      at(0, wall - DORMER_INSET_M + PANE_DEPTH_M / 2),
      surface + 0.35,
      [WINDOW_W_M, DORMER_HEIGHT_M - 0.7, PANE_DEPTH_M],
    );
    // The dormer's own roof: a gable over it, its ridge running up the slope.
    _position.set(dormerAt.x, ground + surface + DORMER_HEIGHT_M, dormerAt.z);
    _quaternion.setFromAxisAngle(_yAxis, Math.atan2(front.x, front.z) + Math.PI / 2);
    _scale.set(DORMER_DEPTH_M + 0.3, DORMER_ROOF_RISE_M, DORMER_WIDTH_M + 0.3);
    _matrix.compose(_position, _quaternion, _scale);
    put('dormerRoof', PART_COLOUR.houseRoof, _matrix);
  }

  /** The unloader chute down a silo's yard side: a 0.6 m square shaft, capped 1 m tall at the dome's foot. */
  private placeChute(plan: FarmPlan, silo: FarmRound, put: Put): void {
    const r = SILO_DIAMETER_M / 2;
    const ground = maxHeightOverRect(this.heightAt, silo.x - r, silo.z - r, silo.x + r, silo.z + r);
    const p = {
      x: silo.x + plan.front.x * (r + CHUTE_M / 2),
      z: silo.z + plan.front.z * (r + CHUTE_M / 2),
    };
    this.putBox(put, 'chute', PART_COLOUR.siloDome, p, ground, 0, plan.front, [
      CHUTE_M,
      SILO_HEIGHT_M,
      CHUTE_M,
    ]);
    this.putBox(
      put,
      'chuteCap',
      PART_COLOUR.siloDome,
      p,
      ground,
      SILO_HEIGHT_M - CHUTE_CAP_M / 5,
      plan.front,
      [CHUTE_M + 0.2, CHUTE_CAP_M, CHUTE_M + 0.2],
    );
  }

  /** A bin's 0.4 m cap on the peak of its cone. */
  private placeBinCap(bin: FarmRound, put: Put): void {
    const r = BIN_DIAMETER_M / 2;
    const ground = maxHeightOverRect(this.heightAt, bin.x - r, bin.z - r, bin.x + r, bin.z + r);
    this.putBox(
      put,
      'binCap',
      PART_COLOUR.siloDome,
      bin,
      ground,
      BIN_EAVE_M + BIN_DIAMETER_M * BIN_ROOF_RISE - BIN_CAP_M / 4,
      { x: 0, z: 1 },
      [0.5, BIN_CAP_M, 0.5],
    );
  }

  /**
   * A crop farm's equipment shed: three walls and a roof of Galvalume sheet
   * on poles, the open side facing the yard, a post every 3.7 m along it.
   */
  private placeShed(shed: FarmShed, put: Put): void {
    const ground = maxHeightOverRect(this.heightAt, shed.x0, shed.z0, shed.x1, shed.z1);
    const c = { x: (shed.x0 + shed.x1) / 2, z: (shed.z0 + shed.z1) / 2 };
    const depth = shed.ridgeAlongX ? shed.z1 - shed.z0 : shed.x1 - shed.x0;
    const { open } = shed;
    const tangent = { x: open.z, z: -open.x };
    const at = (t: number, f: number): { x: number; z: number } => ({
      x: c.x + tangent.x * t + open.x * f,
      z: c.z + tangent.z * t + open.z * f,
    });
    const box = (
      part: Part,
      colour: Colour,
      p: { x: number; z: number },
      size: readonly [number, number, number],
    ): void => this.putBox(put, part, colour, p, ground, 0, open, size);
    const wallT = 0.1;
    box('shedWall', GALVALUME_HEX, at(0, -(depth - wallT) / 2), [
      SHED_LENGTH_M,
      SHED_EAVE_M,
      wallT,
    ]);
    for (const k of [-1, 1]) {
      box('shedWall', GALVALUME_HEX, at((k * (SHED_LENGTH_M - wallT)) / 2, 0), [
        wallT,
        SHED_EAVE_M,
        depth,
      ]);
    }
    const posts = Math.ceil(SHED_LENGTH_M / SHED_POST_SPACING_M) + 1;
    for (let i = 0; i < posts; i++) {
      const t = -SHED_LENGTH_M / 2 + 0.15 + (i * (SHED_LENGTH_M - 0.3)) / (posts - 1);
      box('shedPost', PART_COLOUR.trunk, at(t, (depth - 0.3) / 2), [0.3, SHED_EAVE_M, 0.3]);
    }
    this.placeRoof(
      'shedRoof',
      'shedGable',
      GALVALUME_HEX,
      shed,
      SHED_EAVE_M,
      SHED_ROOF_RISE_M,
      put,
      GALVALUME_HEX,
      0.3,
    );
  }

  /** A round store — silo or bin — standing on the ground at its centre, capped. */
  private placeRound(
    body: 'silo' | 'bin',
    cap: 'siloDome' | 'binRoof',
    at: { x: number; z: number },
    diameter: number,
    height: number,
    capRise: number,
    put: Put,
  ): void {
    const r = diameter / 2;
    const ground = maxHeightOverRect(this.heightAt, at.x - r, at.z - r, at.x + r, at.z + r);
    _quaternion.identity();
    _position.set(at.x, ground, at.z);
    _scale.set(diameter, height, diameter);
    _matrix.compose(_position, _quaternion, _scale);
    put(body, PART_COLOUR[body], _matrix);
    _position.set(at.x, ground + height, at.z);
    _scale.set(diameter, diameter * capRise, diameter);
    _matrix.compose(_position, _quaternion, _scale);
    put(cap, PART_COLOUR[cap], _matrix);
  }

  private placeOrchard(plan: FarmPlan, farmId: number, put: Put): void {
    orchardTrees(plan).forEach((tree, i) => {
      const ground = this.heightAt(tree.x, tree.z);
      const size = 0.85 + 0.3 * hash1(farmId * 131 + i);
      _quaternion.setFromAxisAngle(_yAxis, hash1(farmId * 131 + i + 1) * Math.PI * 2);
      _position.set(tree.x, ground, tree.z);
      _scale.set(0.3, TREE_TRUNK_H_M * size, 0.3);
      _matrix.compose(_position, _quaternion, _scale);
      put('trunk', PART_COLOUR.trunk, _matrix);
      _position.set(tree.x, ground + TREE_TRUNK_H_M * size * 0.8, tree.z);
      _scale.setScalar(TREE_CROWN_M * size);
      _matrix.compose(_position, _quaternion, _scale);
      put('crown', PART_COLOUR.crown, _matrix);
    });
  }

  /** Post and rail round the paddock, each rail following the ground from post to post. */
  private placeFence(paddock: FarmRect, put: Put): void {
    const corners: Array<[number, number]> = [
      [paddock.x0, paddock.z0],
      [paddock.x1, paddock.z0],
      [paddock.x1, paddock.z1],
      [paddock.x0, paddock.z1],
    ];
    for (let side = 0; side < 4; side++) {
      const [ax, az] = corners[side]!;
      const [bx, bz] = corners[(side + 1) % 4]!;
      const length = Math.hypot(bx - ax, bz - az);
      const spans = Math.max(1, Math.round(length / FENCE_POST_SPACING_M));
      for (let i = 0; i < spans; i++) {
        const p0x = ax + ((bx - ax) * i) / spans;
        const p0z = az + ((bz - az) * i) / spans;
        const p1x = ax + ((bx - ax) * (i + 1)) / spans;
        const p1z = az + ((bz - az) * (i + 1)) / spans;
        const y0 = this.heightAt(p0x, p0z);
        const y1 = this.heightAt(p1x, p1z);
        _quaternion.identity();
        _position.set(p0x, y0, p0z);
        _scale.set(0.14, FENCE_POST_H_M, 0.14);
        _matrix.compose(_position, _quaternion, _scale);
        put('post', PART_COLOUR.post, _matrix);
        for (const h of FENCE_RAIL_HEIGHTS_M) {
          _direction.set(p1x - p0x, y1 - y0, p1z - p0z);
          const span = _direction.length();
          _quaternion.setFromUnitVectors(_xAxis, _direction.normalize());
          _position.set((p0x + p1x) / 2, (y0 + y1) / 2 + h - 0.04, (p0z + p1z) / 2);
          _scale.set(span, 0.08, 0.05);
          _matrix.compose(_position, _quaternion, _scale);
          put('rail', PART_COLOUR.rail, _matrix);
        }
      }
    }
  }
}
