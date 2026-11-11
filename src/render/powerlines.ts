/**
 * Power lines drawn: wooden poles, their crossarms, the guys that hold a
 * corner or a dead end up, and the wires slung between them.
 *
 * Where the poles stand is decided in powerpoles.ts; this file turns a lay
 * into instances. A lay is kept per slot — a terrain chunk of the street's own
 * line, the player's strung line, the lines along streets off the grid — so a
 * change lays again only the slot it touches, and the pools the instances live
 * in are repacked from what each slot holds.
 *
 * A wire is geometry, never a line a pixel wide: a thin box per segment of its
 * sag, so it keeps a real thickness at every zoom.
 */

import * as THREE from 'three';
import { MIN_INSTANCE_CAPACITY, setInstanceCount } from './groundquad';
import { wirePoints } from './powerpoles';
import type { PowerLay } from './powerpoles';

/** Where the player's strung line is kept; the street's chunks are numbered from 0. */
export const STRUNG_LINE_SLOT = -1;
/** Where the lines along streets off the grid are kept. */
export const FREE_ROAD_SLOT = -2;

/** Creosoted timber, brown enough to read against both grass and asphalt. */
const POLE_COLOR = 0x5c4a38;
const WIRE_COLOR = 0x26262a;
/** Thick enough to read at street zoom and to keep a pixel's worth at a few hundred metres. */
const WIRE_THICKNESS_M = 0.1;
const GUY_THICKNESS_M = 0.06;
const ARM_THICKNESS_M = 0.14;
/** A guy meets its pole this far under the crossarm. */
const GUY_BELOW_ARM_M = 0.4;
/** The foot of a pole is this much wider than its top. */
const POLE_TAPER = 0.6;
const POLE_RADIAL_SEGMENTS = 6;

/** What one slot lays: the instance matrices of each part, and where its poles stand. */
interface Slot {
  poles: Float32Array;
  arms: Float32Array;
  cables: Float32Array;
  /** x, y, z of every pole's foot, in instance order. */
  feet: number[];
}

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _along = new THREE.Vector3();
const _east = new THREE.Vector3(1, 0, 0);
const _up = new THREE.Vector3(0, 1, 0);

/** Appends a box that runs from `a` to `b`, `thickness` square, to a matrix list. */
function pushSegment(out: number[], a: THREE.Vector3, b: THREE.Vector3, thickness: number): void {
  _along.subVectors(b, a);
  const length = _along.length();
  if (length < 1e-6) return;
  _quat.setFromUnitVectors(_east, _along.divideScalar(length));
  _position.addVectors(a, b).multiplyScalar(0.5);
  _scale.set(length, thickness, thickness);
  _matrix.compose(_position, _quat, _scale);
  out.push(..._matrix.elements);
}

/** One mesh's instances, in a pool that only grows and is replaced, disposed, when it must. */
class InstancePool {
  private mesh: THREE.InstancedMesh | null = null;
  private capacity = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly geometry: THREE.BufferGeometry,
    private readonly material: THREE.Material,
    private readonly castsShadow: boolean,
  ) {}

  /** Fills the pool with each slot's matrices, one after another. */
  write(parts: readonly Float32Array[]): void {
    let count = 0;
    for (const part of parts) count += part.length / 16;
    if (count > this.capacity) {
      this.dispose();
      // Below this a doubling compiles the shader again; see MIN_INSTANCE_CAPACITY.
      this.capacity = Math.max(MIN_INSTANCE_CAPACITY, this.capacity);
      while (this.capacity < count) this.capacity *= 2;
      this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.capacity);
      this.mesh.castShadow = this.castsShadow;
      this.scene.add(this.mesh);
    }
    const mesh = this.mesh;
    if (!mesh) return;
    let at = 0;
    for (const part of parts) {
      mesh.instanceMatrix.array.set(part, at);
      at += part.length;
    }
    setInstanceCount(mesh, count);
    // The instances moved: a bound from an earlier set would cull them.
    mesh.boundingSphere = null;
    mesh.instanceMatrix.needsUpdate = true;
  }

  count(): number {
    return this.mesh?.count ?? 0;
  }

  dispose(): void {
    if (!this.mesh) return;
    this.scene.remove(this.mesh);
    this.mesh.dispose();
    this.mesh = null;
  }
}

export class PowerLineRenderer {
  private readonly slots = new Map<number, Slot>();
  private readonly poleGeometry = new THREE.CylinderGeometry(
    POLE_TAPER,
    1,
    1,
    POLE_RADIAL_SEGMENTS,
  ).translate(0, 0.5, 0);
  private readonly armGeometry = new THREE.BoxGeometry(1, ARM_THICKNESS_M, ARM_THICKNESS_M);
  private readonly cableGeometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly timber = new THREE.MeshLambertMaterial({ color: POLE_COLOR });
  private readonly wire = new THREE.MeshLambertMaterial({ color: WIRE_COLOR });
  private readonly polePool: InstancePool;
  private readonly armPool: InstancePool;
  private readonly cablePool: InstancePool;
  /** Slots laid since construction; a test reads it to see what a change re-laid. */
  private laid = 0;

  constructor(
    scene: THREE.Scene,
    private readonly heightAt: (x: number, z: number) => number,
  ) {
    this.polePool = new InstancePool(scene, this.poleGeometry, this.timber, true);
    this.armPool = new InstancePool(scene, this.armGeometry, this.timber, true);
    this.cablePool = new InstancePool(scene, this.cableGeometry, this.wire, false);
  }

  /** Lays one slot anew, or empties it when given no lay. Nothing shows until commit(). */
  setSlot(slot: number, lay: PowerLay | null): void {
    this.laid += 1;
    if (!lay || (lay.poles.length === 0 && lay.spans.length === 0)) {
      this.slots.delete(slot);
      return;
    }
    const poles: number[] = [];
    const arms: number[] = [];
    const cables: number[] = [];
    const feet: number[] = [];
    for (const pole of lay.poles) {
      const ground = this.heightAt(pole.x, pole.z);
      feet.push(pole.x, ground, pole.z);
      _scale.set(pole.radius, pole.height, pole.radius);
      _matrix.compose(_position.set(pole.x, ground, pole.z), _quat.identity(), _scale);
      poles.push(..._matrix.elements);
      _quat.setFromAxisAngle(_up, Math.atan2(-pole.armZ, pole.armX));
      _scale.set(pole.armLength, 1, 1);
      _matrix.compose(_position.set(pole.x, ground + pole.arm, pole.z), _quat, _scale);
      arms.push(..._matrix.elements);
      if (pole.guy) {
        _from.set(pole.guy.x, this.heightAt(pole.guy.x, pole.guy.z), pole.guy.z);
        _to.set(pole.x, ground + pole.arm - GUY_BELOW_ARM_M, pole.z);
        pushSegment(cables, _from, _to, GUY_THICKNESS_M);
      }
    }
    for (const span of lay.spans) {
      for (const which of [-1, 0, 1] as const) {
        const points = wirePoints(span.a, span.b, which, this.heightAt);
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1]!;
          const b = points[i]!;
          pushSegment(cables, _from.set(a.x, a.y, a.z), _to.set(b.x, b.y, b.z), WIRE_THICKNESS_M);
        }
      }
    }
    this.slots.set(slot, {
      poles: Float32Array.from(poles),
      arms: Float32Array.from(arms),
      cables: Float32Array.from(cables),
      feet,
    });
  }

  /** Repacks the pools from every slot's instances. */
  commit(): void {
    const all = [...this.slots.values()];
    this.polePool.write(all.map((s) => s.poles));
    this.armPool.write(all.map((s) => s.arms));
    this.cablePool.write(all.map((s) => s.cables));
  }

  /** Number of poles standing after the last commit. */
  poleCount(): number {
    return this.polePool.count();
  }

  /** World position of a pole's foot, for a harness to read back. */
  polePosition(index: number): { x: number; y: number; z: number } | null {
    let left = index;
    for (const slot of this.slots.values()) {
      const here = slot.feet.length / 3;
      if (left < here)
        return {
          x: slot.feet[left * 3]!,
          y: slot.feet[left * 3 + 1]!,
          z: slot.feet[left * 3 + 2]!,
        };
      left -= here;
    }
    return null;
  }

  /** Cable segments (wires and guys) standing after the last commit. */
  cableCount(): number {
    return this.cablePool.count();
  }

  /** Slots laid so far; a change that re-lays only its own chunk raises it by one a chunk. */
  slotsLaid(): number {
    return this.laid;
  }

  /** The slots that hold anything. */
  slotKeys(): number[] {
    return [...this.slots.keys()];
  }

  dispose(): void {
    this.slots.clear();
    this.polePool.dispose();
    this.armPool.dispose();
    this.cablePool.dispose();
  }
}
