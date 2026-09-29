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
import { mix, uniform, vec3 } from 'three/tsl';
import { BuildingState } from '../shared/types';
import type { BuildingCatalogEntry, BuildingDelta, BuildingInstance } from '../shared/types';
import { NIGHT_BODY_TINT } from './buildings';
import { massingLifecycleTint, InstancedSlotPool } from './massing';
import { materialUnit, type MaterialName } from './palette';
import { maxHeightOverRect } from './footprint';
import {
  BARN_EAVE_SHARE,
  BIN_DIAMETER_M,
  BIN_EAVE_M,
  HOUSE_EAVE_M,
  HOUSE_RIDGE_M,
  SILO_DIAMETER_M,
  SILO_HEIGHT_M,
  orchardTrees,
  paddockHerd,
  planFarm,
  type FarmBox,
  type FarmPlan,
  type FarmRect,
} from './farmlot';

/** A post every 4 m, 1.3 m high, carrying rails at these heights. */
const FENCE_POST_SPACING_M = 4;
const FENCE_POST_H_M = 1.3;
const FENCE_RAIL_HEIGHTS_M: readonly number[] = [0.55, 1.1];
/** A semi-dwarf apple tree: a short trunk under a round head about 3.5 m across. */
const TREE_TRUNK_H_M = 1.2;
const TREE_CROWN_M = 3.4;
/** Cattle: 2.4 m nose to tail, which the shape's proportions stand at 1.45 m at the shoulder. */
const COW_LENGTH_M = 2.4;
/** Cattle drift across the paddock at a grazing walk, keeping back from the fence. */
const COW_SPEED_M_PER_S = 0.25;
const COW_FENCE_CLEARANCE_M = 4;
/** A cone-roofed bin rises a fifth of its width above its eave. */
const BIN_ROOF_RISE = 0.2;
/** A silo's dome is half its width tall. */
const SILO_DOME_RISE = 0.5;
/** A barn roof and a house roof overhang their walls a little. */
const ROOF_OVERHANG_M = 0.4;

const INITIAL_CAPACITY = 64;

type Part =
  | 'barnRoof'
  | 'barnGable'
  | 'houseBody'
  | 'houseRoof'
  | 'houseGable'
  | 'silo'
  | 'siloDome'
  | 'bin'
  | 'binRoof'
  | 'trunk'
  | 'crown'
  | 'post'
  | 'rail'
  | 'cow';

/** Each part's surface. A barn's gables take its own paint instead (placeRoof). */
const PART_COLOUR: Readonly<Record<Exclude<Part, 'cow' | 'barnGable'>, MaterialName>> = {
  barnRoof: 'metalPlates',
  houseBody: 'whitePlaster',
  houseRoof: 'slateRoof',
  houseGable: 'whitePlaster',
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

/** Flat-shaded triangles from a list of [x, y, z] corners, three per face. */
function faceted(corners: ReadonlyArray<readonly [number, number, number]>): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(corners.flat(), 3));
  geometry.computeVertexNormals();
  return geometry;
}

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

const SHAPES: Readonly<Record<Part, () => THREE.BufferGeometry>> = {
  barnRoof: () => roofSlopes(GAMBREL),
  barnGable: () => roofGables(GAMBREL),
  houseBody: baseBox,
  houseRoof: () => roofSlopes(GABLE),
  houseGable: () => roofGables(GABLE),
  silo: baseCylinder,
  siloDome: () =>
    new THREE.SphereGeometry(0.5, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 2, 1),
  bin: baseCylinder,
  binRoof: () => new THREE.ConeGeometry(0.5, 1, 14, 1, true).translate(0, 0.5, 0),
  trunk: baseBox,
  crown: () => new THREE.IcosahedronGeometry(0.5, 0).translate(0, 0.5, 0),
  post: baseBox,
  rail: baseBox,
  cow: cowShape,
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

/** Takes a slot in `part`'s pool at `matrix`, painted a palette surface or a catalog colour. */
type Put = (part: Part, colour: MaterialName | number, matrix: THREE.Matrix4) => void;

export class FarmRenderer {
  private readonly heightAt: (x: number, z: number) => number;
  private readonly catalogById: Map<string, BuildingCatalogEntry>;
  private readonly dirtAt: (x: number, z: number) => boolean;
  private readonly nightFactorUniform = uniform(0);
  private readonly pools: Record<Part, InstancedSlotPool>;
  /** building id -> the slots it holds in each pool. */
  private readonly owned = new Map<number, Array<[Part, number]>>();
  private readonly herds = new Map<number, Herd>();

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
    // Instance colour carries each part's surface; the night ramp darkens all of it.
    material.colorNode = mix(vec3(1, 1, 1), vec3(...NIGHT_BODY_TINT), this.nightFactorUniform);
    const pools = {} as Record<Part, InstancedSlotPool>;
    for (const part of Object.keys(SHAPES) as Part[]) {
      pools[part] = new InstancedSlotPool(scene, SHAPES[part](), material, INITIAL_CAPACITY);
    }
    // The herd moves every frame, so its bounds are never still enough to cull by.
    pools.cow.getMesh().frustumCulled = false;
    this.pools = pools;
  }

  apply(delta: BuildingDelta): void {
    for (const id of delta.removed) this.free(id);
    for (const b of [...delta.added, ...delta.updated]) {
      this.free(b.id);
      this.place(b);
    }
    for (const pool of Object.values(this.pools)) pool.commit();
    this.pools.cow.getMesh().frustumCulled = false;
  }

  /** Walks every herd to where it stands at `tMs`, the caller's visual clock. */
  update(tMs: number): void {
    if (this.herds.size === 0) return;
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
    this.pools.cow.getMesh().instanceMatrix.needsUpdate = true;
  }

  setNightFactor(nightFactor: number): void {
    this.nightFactorUniform.value = Math.min(1, Math.max(0, nightFactor));
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
      else _color.setRGB(...materialUnit(colour));
      _color.setRGB(_color.r * tint[0], _color.g * tint[1], _color.b * tint[2]);
      pool.setColorAt(slot, _color);
      slots.push([part, slot]);
    };

    const eave = entry.height * BARN_EAVE_SHARE;
    this.placeRoof('barnRoof', 'barnGable', entry.color, plan.barn, eave, entry.height - eave, put);
    this.placeHouse(plan.house, put);
    for (const silo of plan.silos)
      this.placeRound(
        'silo',
        'siloDome',
        silo,
        SILO_DIAMETER_M,
        SILO_HEIGHT_M,
        SILO_DOME_RISE,
        put,
      );
    for (const bin of plan.bins)
      this.placeRound('bin', 'binRoof', bin, BIN_DIAMETER_M, BIN_EAVE_M, BIN_ROOF_RISE, put);
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
      this.update(0);
    }
  }

  /**
   * A roof over a box's walls, `eave` up from the highest ground under it,
   * rising `rise`: its pitches in the roof's own surface and its gable ends
   * in `gableColour`, the walls'.
   */
  private placeRoof(
    roof: 'barnRoof' | 'houseRoof',
    gable: 'barnGable' | 'houseGable',
    gableColour: MaterialName | number,
    box: FarmBox,
    eave: number,
    rise: number,
    put: Put,
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
    _scale.set(along + ROOF_OVERHANG_M * 2, rise, across + ROOF_OVERHANG_M * 2);
    _matrix.compose(_position, _quaternion, _scale);
    put(roof, PART_COLOUR[roof], _matrix);
    _scale.set(along, rise, across);
    _matrix.compose(_position, _quaternion, _scale);
    put(gable, gableColour, _matrix);
  }

  private placeHouse(house: FarmBox, put: Put): void {
    const ground = maxHeightOverRect(this.heightAt, house.x0, house.z0, house.x1, house.z1);
    _position.set((house.x0 + house.x1) / 2, ground, (house.z0 + house.z1) / 2);
    _quaternion.identity();
    _scale.set(house.x1 - house.x0, HOUSE_EAVE_M, house.z1 - house.z0);
    _matrix.compose(_position, _quaternion, _scale);
    put('houseBody', PART_COLOUR.houseBody, _matrix);
    this.placeRoof(
      'houseRoof',
      'houseGable',
      PART_COLOUR.houseGable,
      house,
      HOUSE_EAVE_M,
      HOUSE_RIDGE_M - HOUSE_EAVE_M,
      put,
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
