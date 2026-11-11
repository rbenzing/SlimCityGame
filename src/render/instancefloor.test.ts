import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { TilePoint } from '../shared/types';
import { VehicleKind } from '../shared/types';
import { MIN_INSTANCE_CAPACITY } from './groundquad';
import { LampRenderer } from './lamps';
import { InstancedSlotPool } from './massing';
import { VehicleKitPool } from './vehicles';

const row = (length: number): TilePoint[] =>
  Array.from({ length }, (_, x) => ({ x, z: 0 }) as TilePoint);

const instanced = (scene: THREE.Scene): THREE.InstancedMesh[] =>
  scene.children.filter((c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh);

describe('the instance capacity floor', () => {
  it('is over any uniform block limit, so a matrix array is never compiled into a shader', () => {
    expect(MIN_INSTANCE_CAPACITY * 64).toBeGreaterThan(65536);
  });

  it('gives a small slot pool the floor, and doubling only past it', () => {
    const scene = new THREE.Scene();
    const pool = new InstancedSlotPool(
      scene,
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
      4,
    );
    const first = pool.getMesh();
    expect(first.instanceMatrix.count).toBe(MIN_INSTANCE_CAPACITY);

    for (let i = 0; i < MIN_INSTANCE_CAPACITY; i++) pool.allocate();
    expect(pool.getMesh()).toBe(first);

    pool.allocate();
    expect(pool.getMesh()).not.toBe(first);
    expect(pool.getMesh().instanceMatrix.count).toBe(MIN_INSTANCE_CAPACITY * 2);
  });

  it('gives a small vehicle pool the floor, and doubling only past it', () => {
    const pool = new VehicleKitPool(new THREE.Scene(), VehicleKind.Car, 8);
    const first = pool.mesh;
    expect(first.instanceMatrix.count).toBe(MIN_INSTANCE_CAPACITY);

    for (let i = 0; i < MIN_INSTANCE_CAPACITY; i++) pool.allocate();
    expect(pool.mesh).toBe(first);

    pool.allocate();
    expect(pool.mesh).not.toBe(first);
    expect(pool.mesh.instanceMatrix.count).toBe(MIN_INSTANCE_CAPACITY * 2);
  });

  it('keeps the lamp meshes across rebuilds that fit the floor, replacing them only past it', () => {
    const scene = new THREE.Scene();
    const renderer = new LampRenderer(scene, () => 0);
    renderer.rebuild(row(12));
    const first = instanced(scene);
    expect(first).toHaveLength(4);
    for (const mesh of first) expect(mesh.instanceMatrix.count).toBe(MIN_INSTANCE_CAPACITY);

    renderer.rebuild(row(60));
    expect(instanced(scene)).toEqual(first);

    renderer.rebuild(row(MIN_INSTANCE_CAPACITY * 3));
    const grown = instanced(scene);
    expect(grown).toHaveLength(4);
    for (const mesh of grown) {
      expect(first).not.toContain(mesh);
      expect(mesh.instanceMatrix.count).toBe(MIN_INSTANCE_CAPACITY * 2);
    }
  });
});
