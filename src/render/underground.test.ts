import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  ROAD_GHOST_OPACITY,
  SURFACE_GHOST_OPACITY,
  UndergroundView,
  undergroundRoleOf,
} from './underground';

const box = (role?: string): THREE.Mesh => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshLambertMaterial());
  if (role) mesh.userData['underground'] = role;
  return mesh;
};

describe('undergroundRoleOf', () => {
  it('reads the nearest tag up the tree, and takes an untagged object for the surface', () => {
    const group = new THREE.Group();
    group.userData['underground'] = 'keep';
    const child = box();
    group.add(child);
    expect(undergroundRoleOf(child)).toBe('keep');
    expect(undergroundRoleOf(box('road'))).toBe('road');
    expect(undergroundRoleOf(box())).toBe('surface');
  });
});

describe('UndergroundView', () => {
  it('fades what stands on the surface and the roads, and leaves the ground alone', () => {
    const scene = new THREE.Scene();
    const house = box();
    const road = box('road');
    const ground = box('keep');
    scene.add(house, road, ground);
    const view = new UndergroundView(scene);
    view.setActive(true);
    expect((house.material as THREE.Material).opacity).toBe(SURFACE_GHOST_OPACITY);
    expect((house.material as THREE.Material).transparent).toBe(true);
    expect((house.material as THREE.Material).depthWrite).toBe(false);
    expect((road.material as THREE.Material).opacity).toBe(ROAD_GHOST_OPACITY);
    expect((ground.material as THREE.Material).opacity).toBe(1);
    expect((ground.material as THREE.Material).transparent).toBe(false);
    expect(view.fadedCount()).toBe(2);
  });

  it('switches a ghost’s shadow off underground and back on at the surface', () => {
    const scene = new THREE.Scene();
    const house = box();
    house.castShadow = true;
    scene.add(house);
    const view = new UndergroundView(scene);
    view.setActive(true);
    expect(house.castShadow).toBe(false);
    view.setActive(false);
    expect(house.castShadow).toBe(true);
  });

  it('restores every material exactly when the surface comes back', () => {
    const scene = new THREE.Scene();
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6, depthWrite: false }),
    );
    const solid = box();
    scene.add(glass, solid);
    const view = new UndergroundView(scene);
    view.setActive(true);
    view.setActive(false);
    expect(glass.material.opacity).toBe(0.6);
    expect(glass.material.transparent).toBe(true);
    expect(glass.material.depthWrite).toBe(false);
    expect((solid.material as THREE.Material).opacity).toBe(1);
    expect((solid.material as THREE.Material).transparent).toBe(false);
    expect((solid.material as THREE.Material).depthWrite).toBe(true);
    expect(view.fadedCount()).toBe(0);
  });

  it('fades a mesh that comes into the scene while underground, on the next walk', () => {
    const scene = new THREE.Scene();
    const view = new UndergroundView(scene);
    view.setActive(true);
    const late = box();
    scene.add(late);
    expect((late.material as THREE.Material).opacity).toBe(1);
    view.update();
    expect((late.material as THREE.Material).opacity).toBe(SURFACE_GHOST_OPACITY);
  });

  it('fades a shared material once, and does nothing at all on the surface', () => {
    const scene = new THREE.Scene();
    const material = new THREE.MeshLambertMaterial();
    scene.add(
      new THREE.Mesh(new THREE.BoxGeometry(), material),
      new THREE.Mesh(new THREE.BoxGeometry(), material),
    );
    const view = new UndergroundView(scene);
    view.update();
    expect(material.opacity).toBe(1);
    view.setActive(true);
    view.update();
    expect(view.fadedCount()).toBe(1);
    expect(view.isActive()).toBe(true);
  });
});
