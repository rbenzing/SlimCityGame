/**
 * The underground view: the surface goes to glass so the water system under
 * it can be seen.
 *
 * While the view is on, every mesh standing on the ground fades to a ghost
 * and stops writing depth, so the pipe strips drawn on the terrain show
 * through the houses, the trees and the road plates over them. The ground
 * itself — terrain, water, the sky and every lens and ghost drawn on the
 * ground — is left alone: an object tagged `userData.underground = 'keep'`
 * is never faded, one tagged `'road'` fades to the road's own opacity so the
 * main under a street reads as a pipe, and everything else fades to the
 * surface's.
 *
 * The scene is walked every frame while the view is on, so a chunk rebuilt
 * or a vehicle spawned underground comes in as a ghost too; materials are
 * faded once and restored exactly when the view ends. Material opacity is a
 * property, not a shader: nothing here changes how anything is drawn.
 */
import * as THREE from 'three';

/** How a mesh is treated underground, read from `object.userData.underground`. */
export type UndergroundRole = 'keep' | 'road' | 'surface';

/** What stands on the surface fades to this. */
export const SURFACE_GHOST_OPACITY = 0.25;
/** A road plate fades to this, a little firmer, so the street still reads as the street. */
export const ROAD_GHOST_OPACITY = 0.35;

interface MaterialState {
  transparent: boolean;
  opacity: number;
  depthWrite: boolean;
}

/** The role of an object: its own tag, else the nearest tagged ancestor's, else the surface. */
export function undergroundRoleOf(object: THREE.Object3D): UndergroundRole {
  for (let o: THREE.Object3D | null = object; o !== null; o = o.parent) {
    const role = o.userData['underground'] as UndergroundRole | undefined;
    if (role === 'keep' || role === 'road' || role === 'surface') return role;
  }
  return 'surface';
}

export class UndergroundView {
  private readonly scene: THREE.Scene;
  private readonly saved = new Map<THREE.Material, MaterialState>();
  /** The meshes whose shadow was switched off, to switch back on. */
  private readonly shadowed = new Set<THREE.Mesh>();
  private active = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  isActive(): boolean {
    return this.active;
  }

  /** Puts the city underground or brings the surface back; idempotent. */
  setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    if (active) this.update();
    else this.restore();
  }

  /**
   * Fades anything that has come into the scene since the last walk. Called
   * every frame while the view is on; a no-op otherwise.
   */
  update(): void {
    if (!this.active) return;
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const role = undergroundRoleOf(object);
      if (role === 'keep') return;
      const opacity = role === 'road' ? ROAD_GHOST_OPACITY : SURFACE_GHOST_OPACITY;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) this.fade(material, opacity);
      // Glass casts no shadow.
      if (object.castShadow && !this.shadowed.has(object)) {
        this.shadowed.add(object);
        object.castShadow = false;
      }
    });
  }

  /** How many materials are faded right now — for tests and read-backs. */
  fadedCount(): number {
    return this.saved.size;
  }

  private fade(material: THREE.Material, opacity: number): void {
    if (this.saved.has(material)) return;
    this.saved.set(material, {
      transparent: material.transparent,
      opacity: material.opacity,
      depthWrite: material.depthWrite,
    });
    material.transparent = true;
    material.opacity = opacity;
    material.depthWrite = false;
    material.needsUpdate = true;
  }

  private restore(): void {
    for (const [material, state] of this.saved) {
      material.transparent = state.transparent;
      material.opacity = state.opacity;
      material.depthWrite = state.depthWrite;
      material.needsUpdate = true;
    }
    this.saved.clear();
    for (const mesh of this.shadowed) mesh.castShadow = true;
    this.shadowed.clear();
  }
}
