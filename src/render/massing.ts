/**
 * Building massing: stacked-box setbacks on grown towers ("Silhouette
 * variety"). Two pieces:
 *
 *  - `computeSetbacks` is a PURE derivation (entry, buildingId) -> a stacked
 *    list of boxes, mirroring facade.ts's "no THREE/DOM dependency"
 *    convention: level-1 buildings (and ploppables, which have no `level`)
 *    are a single box; level 2/3 split the SAME total height into 2/3
 *    vertically-stacked tiers, each upper tier inset 10-20% narrower than
 *    the tier directly below it (deterministic from buildingId).
 *
 *  - `MassingRenderer` instances the UPPER tiers only (index >= 1). The
 *    base tier (index 0) is already the single full-height box
 *    BuildingInstancer draws for every building regardless of level (see
 *    buildings.ts's writeInstance) — massing.ts never edits buildings.ts,
 *    it overlays 1-2 additional inset volumes on top for level-2/3
 *    buildings, colored with the SAME wall-color family (facade.ts's
 *    deriveFacadeParams) and lifecycle tint as the base instancer, so the
 *    extra tiers read as part of the same building rather than an add-on.
 *
 * `InstancedSlotPool` is a small generic capacity-doubling instanced-mesh
 * slot allocator factored out here because both this file and props.ts need
 * several independent instanced layers with the exact same
 * allocate/free/grow bookkeeping ParkedCarRenderer already established
 * (parked.ts) — rather than re-deriving it per layer, it is written once and
 * reused.
 */
import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { mix, uniform, vec3 } from 'three/tsl';
import {
  BuildingCatalogEntry,
  BuildingDelta,
  BuildingInstance,
  BuildingState,
  ZoneType,
} from '../shared/types';
import { TILE_METERS } from '../shared/constants';
import { deriveFacadeParams } from './facade';
import { maxHeightOverFootprint } from './footprint';

// ---------------------------------------------------------------------------
// computeSetbacks (pure)
// ---------------------------------------------------------------------------

export interface SetbackBox {
  /** World meters, X extent. */
  w: number;
  /** World meters, Z extent. */
  d: number;
  /** World meters, vertical extent of just this tier. */
  h: number;
  /** World meters above ground to this tier's BOTTOM face; boxes stack with no gap/overlap. */
  yOffset: number;
}

export interface SetbackResult {
  /** Bottom-to-top: boxes[0] is the base tier (full footprint), boxes[last] is the roof tier. */
  boxes: SetbackBox[];
}

/** Default footprint shrink so neighboring buildings don't touch — mirrors buildings.ts so the base tier lines up with BuildingInstancer's own box edges. */
export const MASSING_FOOTPRINT_SHRINK = 0.85;
/** Detached single-family homes fill barely over half their lot, leaving a visible yard (SPEC §16). */
export const RES_LOW_FOOTPRINT_SHRINK = 0.55;

/**
 * Zone-aware footprint fill: the fraction of a building's tile footprint its
 * rendered mass occupies. Detached homes (ResLow) leave a yard; everything
 * else nearly fills its lot. The single source of truth shared by
 * BuildingInstancer, the massing tiers, and the pitched-roof kit so a house's
 * body, setbacks, and roof all stay flush. Pure.
 */
export function footprintShrinkFor(entry: BuildingCatalogEntry): number {
  return entry.zone === ZoneType.ResLow ? RES_LOW_FOOTPRINT_SHRINK : MASSING_FOOTPRINT_SHRINK;
}
/** "10-20% setbacks". */
export const MIN_SETBACK_INSET = 0.1;
export const MAX_SETBACK_INSET = 0.2;

const SETBACK_HASH_SLOT_MULTIPLIER = 4096;
/** tierIndex (1, 2 — never 0, the base tier is never inset) is added on top of this base slot. */
const HASH_SLOT_SETBACK_INSET_BASE = 10;

/**
 * 32-bit avalanche mix ("triple32", public domain) -> [0,1). Deterministic;
 * never Math.random/Date.now. Each render/*.ts file keeps its own copy of
 * this exact recipe rather than importing it (see buildings.ts's and
 * facade.ts's identical local copies).
 */
function hash1(n: number): number {
  let h = n >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/** Deterministic hash(buildingId, tierIndex) -> inset fraction in [MIN_SETBACK_INSET, MAX_SETBACK_INSET). */
function setbackInsetFraction(buildingId: number, tierIndex: number): number {
  const seed = buildingId * SETBACK_HASH_SLOT_MULTIPLIER + HASH_SLOT_SETBACK_INSET_BASE + tierIndex;
  return MIN_SETBACK_INSET + hash1(seed) * (MAX_SETBACK_INSET - MIN_SETBACK_INSET);
}

/**
 * Full stacked-box massing for one building instance. Pure;
 * deterministic in (entry, buildingId). level 1 (and ploppables, whose
 * catalog entries carry no `level` at all) return a single box; level 2/3
 * split entry.height across 2/3 vertically-stacked tiers — the split is even
 * (height / tierCount) except the LAST tier, which absorbs `entry.height -
 * yOffset` exactly so the stack's total height always equals entry.height
 * exactly (no floating-point drift from repeated addition). Each tier after
 * the first is inset 10-20% narrower than the tier directly below it, the
 * fraction independently re-drawn per tier from buildingId so a level-3
 * building's second setback isn't just a repeat of its first.
 */
export function computeSetbacks(entry: BuildingCatalogEntry, buildingId: number): SetbackResult {
  const level = Math.min(3, Math.max(1, Math.round(entry.level ?? 1)));
  const totalHeight = entry.height;
  const tierHeight = totalHeight / level;

  const shrink = footprintShrinkFor(entry);
  const baseW = entry.footprint.w * TILE_METERS * shrink;
  const baseD = entry.footprint.d * TILE_METERS * shrink;

  const boxes: SetbackBox[] = [];
  let w = baseW;
  let d = baseD;
  let yOffset = 0;
  for (let tier = 0; tier < level; tier++) {
    if (tier > 0) {
      const inset = setbackInsetFraction(buildingId, tier);
      w *= 1 - inset;
      d *= 1 - inset;
    }
    const isLast = tier === level - 1;
    const h = isLast ? totalHeight - yOffset : tierHeight;
    boxes.push({ w, d, h, yOffset });
    yOffset += h;
  }

  return { boxes };
}

// ---------------------------------------------------------------------------
// Lifecycle tint (mirrors buildings.ts's private tintFor/TINT_* constants —
// not exported there, so re-derived here identically for cross-renderer
// visual consistency; the "same tint" requirement).
// ---------------------------------------------------------------------------

const TINT_ACTIVE: readonly [number, number, number] = [1, 1, 1];
const TINT_CONSTRUCTING: readonly [number, number, number] = [0.55, 0.55, 0.55];
const TINT_ABANDONED: readonly [number, number, number] = [0.25, 0.25, 0.25];

/** Same per-state tint multiplier as buildings.ts's tintFor, exported for props.ts to share. */
export function massingLifecycleTint(state: BuildingState): readonly [number, number, number] {
  if (state === BuildingState.Constructing) return TINT_CONSTRUCTING;
  if (state === BuildingState.Abandoned) return TINT_ABANDONED;
  return TINT_ACTIVE;
}

/** Mirrors buildings.ts's CONSTRUCTING_HEIGHT_SCALE so overlaid tiers/props shrink in lockstep with the base box. */
export const CONSTRUCTING_MASSING_HEIGHT_SCALE = 0.25;

// ---------------------------------------------------------------------------
// InstancedSlotPool: generic capacity-doubling instanced-mesh slot allocator.
// Reused by MassingRenderer (below) and props.ts's several prop layers.
// ---------------------------------------------------------------------------

const HIDDEN_SCALE_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

export class InstancedSlotPool {
  private readonly scene: THREE.Scene;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.Material;
  private mesh: THREE.InstancedMesh;
  private capacity: number;
  private used = 0;
  private readonly freeSlots: number[] = [];

  constructor(
    scene: THREE.Scene,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    initialCapacity: number,
  ) {
    this.scene = scene;
    this.geometry = geometry;
    this.material = material;
    this.capacity = Math.max(1, initialCapacity);
    this.mesh = this.buildMesh(this.capacity);
    this.scene.add(this.mesh);
  }

  /** Always the CURRENT live mesh (growth swaps this out; never cache the return value across an allocate() call). */
  getMesh(): THREE.InstancedMesh {
    return this.mesh;
  }

  /** Returns a slot index ready to receive setMatrixAt/setColorAt; recycles a freed slot before growing. */
  allocate(): number {
    const recycled = this.freeSlots.pop();
    if (recycled !== undefined) return recycled;
    if (this.used >= this.capacity) this.grow();
    return this.used++;
  }

  /** Hides the slot (zero-scale matrix) and returns it to the free list for the next allocate(). */
  free(slot: number): void {
    this.mesh.setMatrixAt(slot, HIDDEN_SCALE_MATRIX);
    this.freeSlots.push(slot);
  }

  setMatrixAt(slot: number, m: THREE.Matrix4): void {
    this.mesh.setMatrixAt(slot, m);
  }

  getMatrixAt(slot: number, out: THREE.Matrix4): void {
    this.mesh.getMatrixAt(slot, out);
  }

  setColorAt(slot: number, c: THREE.Color): void {
    this.mesh.setColorAt(slot, c);
  }

  getColorAt(slot: number, out: THREE.Color): void {
    this.mesh.getColorAt(slot, out);
  }

  /** Flushes mesh.count + the dirty flags; call once per apply() batch, not per instance. */
  commit(): void {
    this.mesh.count = this.used;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    // Invalidate the frustum-culling sphere: three.js's Frustum.intersectsObject
    // computes it once (lazily, when null) and never again — a pool first
    // culled while empty would otherwise cache an empty sphere at the world
    // origin and every instance committed later would be culled forever.
    this.mesh.boundingSphere = null;
  }

  instanceCount(): number {
    return this.mesh.count;
  }

  private buildMesh(capacity: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity);
    mesh.count = 0;
    // Shadow sweep: pooled building-massing tiers + prop/landmark/utility
    // kits both cast and receive the sun's shadow (one instanced draw each,
    // so the budget cost is a single extra shadow-map draw per pool).
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(capacity * 3).fill(1),
      3,
    );
    return mesh;
  }

  private grow(): void {
    const newCapacity = this.capacity * 2;
    const newMesh = this.buildMesh(newCapacity);
    newMesh.instanceMatrix.array.set(this.mesh.instanceMatrix.array);
    if (this.mesh.instanceColor && newMesh.instanceColor) {
      newMesh.instanceColor.array.set(this.mesh.instanceColor.array);
    }
    newMesh.count = this.mesh.count;

    this.scene.remove(this.mesh);
    this.scene.add(newMesh);
    this.mesh = newMesh;
    this.capacity = newCapacity;
  }
}

// ---------------------------------------------------------------------------
// MassingRenderer
// ---------------------------------------------------------------------------

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();
const _yAxis = new THREE.Vector3(0, 1, 0);

const INITIAL_MASSING_CAPACITY = 64;
/** Night body-tint the massing block multiplies toward at full night. */
const NIGHT_BODY_TINT: readonly [number, number, number] = [0.11, 0.13, 0.19];

export class MassingRenderer {
  private readonly heightAt: (x: number, z: number) => number;
  private readonly catalogById: Map<string, BuildingCatalogEntry>;
  private readonly geometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly material: MeshStandardNodeMaterial;
  private readonly nightFactorUniform = uniform(0);
  private readonly pool: InstancedSlotPool;

  /** buildingId -> upper-tier slot indices (0, 1, or 2 slots depending on level). */
  private readonly buildingSlots = new Map<number, number[]>();

  constructor(
    scene: THREE.Scene,
    heightAt: (x: number, z: number) => number,
    catalog: BuildingCatalogEntry[],
  ) {
    this.heightAt = heightAt;
    this.catalogById = new Map(catalog.map((entry) => [entry.id, entry]));
    this.material = this.createMaterial();
    this.pool = new InstancedSlotPool(
      scene,
      this.geometry,
      this.material,
      INITIAL_MASSING_CAPACITY,
    );
  }

  /** Consumes one BuildingDelta: removed ids free their upper tiers; added/updated recompute theirs. */
  apply(delta: BuildingDelta): void {
    for (const id of delta.removed) this.freeBuilding(id);
    for (const building of delta.added) this.applyOne(building);
    for (const building of delta.updated) this.applyOne(building);
    this.pool.commit();
  }

  /** 0 (day) .. 1 (night) — mixes every upper tier's wall color toward the same dark blue-grey as the base instancer. */
  setNightFactor(nightFactor: number): void {
    this.nightFactorUniform.value = Math.min(1, Math.max(0, nightFactor));
  }

  nightFactor(): number {
    return this.nightFactorUniform.value;
  }

  /** Upper-tier slot indices currently owned by a building (empty for level-1 buildings/ploppables, or an unknown building). */
  upperBoxSlotsFor(buildingId: number): readonly number[] {
    return this.buildingSlots.get(buildingId) ?? [];
  }

  getBoxMatrix(slot: number, out: THREE.Matrix4): void {
    this.pool.getMatrixAt(slot, out);
  }

  getBoxColor(slot: number, out: THREE.Color): void {
    this.pool.getColorAt(slot, out);
  }

  instanceCount(): number {
    return this.pool.instanceCount();
  }

  private createMaterial(): MeshStandardNodeMaterial {
    const material = new MeshStandardNodeMaterial({ roughness: 1, metalness: 0 });
    // instanceColor (wallColor * lifecycle tint, baked per-instance in
    // applyOne below via pool.setColorAt) is multiplied into colorNode
    // automatically by three's own NodeMaterial instancing setup whenever
    // mesh.instanceColor is present — this colorNode only needs to encode
    // the night mix on top of that (see buildings.ts's identical
    // `dayColorNode.mul(nightTint)` pattern, and NodeMaterial.js's
    // `colorNode = instanceColor.mul(colorNode)` wrapping).
    material.colorNode = mix(vec3(1, 1, 1), vec3(...NIGHT_BODY_TINT), this.nightFactorUniform);
    return material;
  }

  private applyOne(building: BuildingInstance): void {
    this.freeBuilding(building.id);

    const entry = this.catalogById.get(building.catalogId);
    if (!entry) return;

    const { boxes } = computeSetbacks(entry, building.id);
    if (boxes.length <= 1) return; // level 1 / ploppables: nothing beyond the base BuildingInstancer already draws

    const heightScale =
      building.state === BuildingState.Constructing ? CONSTRUCTING_MASSING_HEIGHT_SCALE : 1;
    const tint = massingLifecycleTint(building.state);
    const { wallColor } = deriveFacadeParams(entry, building.id);

    const centerX = (building.x + entry.footprint.w / 2) * TILE_METERS;
    const centerZ = (building.z + entry.footprint.d / 2) * TILE_METERS;
    // Match BuildingInstancer's footprint-max base so setback tiers stack on
    // the same ground the body sits on (no slope poke-through / float).
    const groundY = maxHeightOverFootprint(
      this.heightAt,
      building.x,
      building.z,
      entry.footprint.w,
      entry.footprint.d,
    );

    const slots: number[] = [];
    for (let tier = 1; tier < boxes.length; tier++) {
      const box = boxes[tier]!;
      const slot = this.pool.allocate();

      const scaledYOffset = box.yOffset * heightScale;
      const scaledH = box.h * heightScale;
      _position.set(centerX, groundY + scaledYOffset + scaledH / 2, centerZ);
      _quaternion.setFromAxisAngle(_yAxis, building.rotation * (Math.PI / 2));
      _scale.set(box.w, scaledH, box.d);
      _matrix.compose(_position, _quaternion, _scale);
      this.pool.setMatrixAt(slot, _matrix);

      _color.setRGB(wallColor[0] * tint[0], wallColor[1] * tint[1], wallColor[2] * tint[2]);
      this.pool.setColorAt(slot, _color);

      slots.push(slot);
    }

    this.buildingSlots.set(building.id, slots);
  }

  private freeBuilding(buildingId: number): void {
    const slots = this.buildingSlots.get(buildingId);
    if (!slots) return;
    for (const slot of slots) this.pool.free(slot);
    this.buildingSlots.delete(buildingId);
  }
}
