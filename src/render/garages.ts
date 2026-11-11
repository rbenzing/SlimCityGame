/**
 * Garages: the parking deck a dense building (office, hotel, mixed-use block,
 * mid-rise or tower) stands beside on its own lot, drawn from the garage kit.
 * Each distinct deck is one geometry, every building that has it one instance
 * of an InstancedMesh; a building arriving, levelling up or leaving lays only
 * its own instance again, and a deck's geometry is built once, the first time
 * a building needs it.
 *
 * Zero per-frame work: everything happens inside apply(BuildingDelta).
 */
import * as THREE from 'three';
import { uniform } from 'three/tsl';
import { BuildingState } from '../shared/types';
import type { BuildingCatalogEntry, BuildingDelta, BuildingInstance } from '../shared/types';
import { nightBodyMaterial } from './nightlook';
import { InstancedSlotPool, massingLifecycleTint, tierHeightOf } from './massing';
import { MIN_INSTANCE_CAPACITY } from './groundquad';
import { garagePlanAt, lotPointToWorld } from './lotplan';
import {
  buildGarageGeometry,
  closedTiersFor,
  garageGroundY,
  garageTurn,
  garageVariantKey,
} from './garagekit';

interface Variant {
  pool: InstancedSlotPool;
  geometry: THREE.BufferGeometry;
}

interface Placed {
  key: string;
  slot: number;
  tiers: number;
}

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _yAxis = new THREE.Vector3(0, 1, 0);
const _color = new THREE.Color();

export class GarageRenderer {
  private readonly scene: THREE.Scene;
  private readonly heightAt: (x: number, z: number) => number;
  private readonly catalogById: Map<string, BuildingCatalogEntry>;
  private readonly roadAt: (tileX: number, tileZ: number) => boolean;
  private readonly nightFactorUniform = uniform(0);
  private readonly material = nightBodyMaterial(this.nightFactorUniform, { vertexColors: true });
  private readonly variants = new Map<string, Variant>();
  private readonly placed = new Map<number, Placed>();

  constructor(
    scene: THREE.Scene,
    heightAt: (x: number, z: number) => number,
    catalog: readonly BuildingCatalogEntry[],
    roadAt: (tileX: number, tileZ: number) => boolean,
  ) {
    this.scene = scene;
    this.heightAt = heightAt;
    this.catalogById = new Map(catalog.map((e) => [e.id, e]));
    this.roadAt = roadAt;
  }

  /** 0 (day) .. 1 (night): how far the decks shade toward the night tint, as the bodies do. */
  setNightFactor(nightFactor: number): void {
    this.nightFactorUniform.value = Math.min(1, Math.max(0, nightFactor));
  }

  apply(delta: BuildingDelta): void {
    for (const id of delta.removed) this.free(id);
    for (const building of delta.added) this.place(building);
    for (const building of delta.updated) this.place(building);
    for (const variant of this.variants.values()) variant.pool.commit();
  }

  /** How many decks stand. */
  deckCount(): number {
    return this.placed.size;
  }

  /** The tiers the building's deck is drawn with; 0 where it has none. */
  tiersOf(buildingId: number): number {
    return this.placed.get(buildingId)?.tiers ?? 0;
  }

  /** How many distinct deck meshes the renderer holds. */
  meshCount(): number {
    return this.variants.size;
  }

  /** The matrix a building's deck stands at, for tests. */
  matrixOf(buildingId: number, out: THREE.Matrix4): boolean {
    const placed = this.placed.get(buildingId);
    if (!placed) return false;
    this.variants.get(placed.key)?.pool.getMatrixAt(placed.slot, out);
    return true;
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
    if (!entry) return;
    const plan = garagePlanAt(entry, building, this.roadAt);
    if (!plan) return;
    const { garage, frame } = plan;
    const { yaw, mirror } = garageTurn(frame);
    const closed = closedTiersFor(tierHeightOf(entry));
    const key = garageVariantKey(garage, garage.tiers, closed, mirror);
    const variant = this.variantFor(key, () =>
      buildGarageGeometry(garage, garage.tiers, closed, mirror),
    );

    const centre = lotPointToWorld(frame, garage.lotW / 2, garage.lotD / 2);
    _position.set(centre.x, garageGroundY(this.heightAt, frame, garage), centre.z);
    _quaternion.setFromAxisAngle(_yAxis, yaw);
    _matrix.compose(_position, _quaternion, _scale);
    const slot = variant.pool.allocate();
    variant.pool.setMatrixAt(slot, _matrix);
    const tint = massingLifecycleTint(building.state);
    _color.setRGB(tint[0], tint[1], tint[2]);
    variant.pool.setColorAt(slot, _color);
    this.placed.set(building.id, { key, slot, tiers: garage.tiers });
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
