/**
 * Built-in forms' garages: the portal, ramp and garage band of a building that
 * parks inside itself, drawn from the builtin kit. Each distinct garage is one
 * geometry, every building that has it one instance of an InstancedMesh; a
 * building arriving, rebuilt or leaving lays only its own instance again.
 *
 * Zero per-frame work: everything happens inside apply(BuildingDelta).
 */
import * as THREE from 'three';
import { uniform } from 'three/tsl';
import { builtInParking } from '../shared/garage';
import type { KerbSurroundings } from '../shared/kerblayout';
import { BuildingState } from '../shared/types';
import type { BuildingCatalogEntry, BuildingDelta, BuildingInstance } from '../shared/types';
import { buildBuiltInGeometry, builtInVariantKey } from './builtinkit';
import { garageTurn } from './garagekit';
import { maxHeightOverRect } from './footprint';
import { MIN_INSTANCE_CAPACITY } from './groundquad';
import { lotPlanAt, lotPointToWorld, type KerbCreditOf } from './lotplan';
import { InstancedSlotPool, massingLifecycleTint } from './massing';
import { nightBodyMaterial } from './nightlook';

interface Variant {
  pool: InstancedSlotPool;
  geometry: THREE.BufferGeometry;
}

interface Placed {
  key: string;
  slot: number;
}

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _yAxis = new THREE.Vector3(0, 1, 0);
const _color = new THREE.Color();

export class BuiltInRenderer {
  private readonly scene: THREE.Scene;
  private readonly heightAt: (x: number, z: number) => number;
  private readonly catalogById: Map<string, BuildingCatalogEntry>;
  private readonly roadAt: (tileX: number, tileZ: number) => boolean;
  private readonly kerb: KerbSurroundings | null;
  private readonly kerbCreditOf: KerbCreditOf | null;
  private readonly nightFactorUniform = uniform(0);
  private readonly material = nightBodyMaterial(this.nightFactorUniform, { vertexColors: true });
  private readonly variants = new Map<string, Variant>();
  private readonly placed = new Map<number, Placed>();

  constructor(
    scene: THREE.Scene,
    heightAt: (x: number, z: number) => number,
    catalog: readonly BuildingCatalogEntry[],
    roadAt: (tileX: number, tileZ: number) => boolean,
    kerb: KerbSurroundings | null = null,
    kerbCreditOf: KerbCreditOf | null = null,
  ) {
    this.scene = scene;
    this.heightAt = heightAt;
    this.catalogById = new Map(catalog.map((e) => [e.id, e]));
    this.roadAt = roadAt;
    this.kerb = kerb;
    this.kerbCreditOf = kerbCreditOf;
  }

  /** 0 (day) .. 1 (night): how far the garages shade toward the night tint, as the bodies do. */
  setNightFactor(nightFactor: number): void {
    this.nightFactorUniform.value = Math.min(1, Math.max(0, nightFactor));
  }

  apply(delta: BuildingDelta): void {
    for (const id of delta.removed) this.free(id);
    for (const building of delta.added) this.place(building);
    for (const building of delta.updated) this.place(building);
    for (const variant of this.variants.values()) variant.pool.commit();
  }

  /** How many garages stand. */
  count(): number {
    return this.placed.size;
  }

  /** How many distinct garage meshes the renderer holds. */
  meshCount(): number {
    return this.variants.size;
  }

  dispose(): void {
    for (const id of Array.from(this.placed.keys())) this.free(id);
    for (const variant of this.variants.values()) {
      this.scene.remove(variant.pool.getMesh());
      variant.pool.getMesh().dispose();
      variant.geometry.dispose();
    }
    this.variants.clear();
    this.material.dispose();
  }

  private free(id: number): void {
    const placed = this.placed.get(id);
    if (!placed) return;
    this.variants.get(placed.key)?.pool.free(placed.slot);
    this.placed.delete(id);
  }

  private place(building: BuildingInstance): void {
    this.free(building.id);
    if (building.state === BuildingState.Constructing) return;
    const entry = this.catalogById.get(building.catalogId);
    if (!entry?.stacked) return;
    const plan = lotPlanAt(entry, building, this.roadAt, this.kerb, this.kerbCreditOf);
    if (!plan?.layout.portal) return;
    const { layout, frame } = plan;
    const { yaw, mirror } = garageTurn(frame);
    const above = builtInParking(entry).aboveStoreys;
    const key = builtInVariantKey(layout, above, mirror);
    const variant = this.variantFor(key, () => buildBuiltInGeometry(layout, above, mirror));

    const { body } = layout;
    const corners = [
      lotPointToWorld(frame, body.u0, body.v0),
      lotPointToWorld(frame, body.u1, body.v0),
      lotPointToWorld(frame, body.u0, body.v1),
      lotPointToWorld(frame, body.u1, body.v1),
    ];
    const xs = corners.map((c) => c.x);
    const zs = corners.map((c) => c.z);
    const ground = maxHeightOverRect(
      this.heightAt,
      Math.min(...xs),
      Math.min(...zs),
      Math.max(...xs),
      Math.max(...zs),
    );
    const centre = lotPointToWorld(frame, layout.lot.u1 / 2, layout.lot.v1 / 2);
    _position.set(centre.x, ground, centre.z);
    _quaternion.setFromAxisAngle(_yAxis, yaw);
    _matrix.compose(_position, _quaternion, _scale);
    const slot = variant.pool.allocate();
    variant.pool.setMatrixAt(slot, _matrix);
    const tint = massingLifecycleTint(building.state);
    _color.setRGB(tint[0], tint[1], tint[2]);
    variant.pool.setColorAt(slot, _color);
    this.placed.set(building.id, { key, slot });
  }

  private variantFor(key: string, build: () => THREE.BufferGeometry): Variant {
    let variant = this.variants.get(key);
    if (!variant) {
      const geometry = build();
      const pool = new InstancedSlotPool(
        this.scene,
        geometry,
        this.material,
        MIN_INSTANCE_CAPACITY,
      );
      pool.getMesh().castShadow = true;
      pool.getMesh().receiveShadow = true;
      variant = { pool, geometry };
      this.variants.set(key, variant);
    }
    return variant;
  }
}
