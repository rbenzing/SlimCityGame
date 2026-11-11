import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MIN_INSTANCE_CAPACITY } from './groundquad';
import { FREE_ROAD_SLOT, PowerLineRenderer, STRUNG_LINE_SLOT } from './powerlines';
import { layFromLinks } from './powerpoles';
import type { PoleSite } from './powerpoles';

const flat = (): number => 0;

/** A straight run of `count` street poles 40 m apart, joined in order. */
function run(count: number, z = 100): ReturnType<typeof layFromLinks> {
  const sites: PoleSite[] = Array.from({ length: count }, (_, i) => ({
    key: i,
    kind: 'street' as const,
    x: 20 + i * 40,
    z,
  }));
  const links = sites.slice(1).map((_, i) => [i, i + 1] as [number, number]);
  return layFromLinks(sites, links);
}

function build(): { scene: THREE.Scene; lines: PowerLineRenderer } {
  const scene = new THREE.Scene();
  return { scene, lines: new PowerLineRenderer(scene, flat) };
}

const meshes = (scene: THREE.Scene): THREE.InstancedMesh[] =>
  scene.children.filter((c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh);

describe('PowerLineRenderer', () => {
  it('draws a pole and a crossarm for every pole of the lay, and wire for every span', () => {
    const { scene, lines } = build();
    lines.setSlot(0, run(4));
    lines.commit();
    expect(lines.poleCount()).toBe(4);
    const [poles, arms, cables] = meshes(scene);
    expect(poles!.count).toBe(4);
    expect(arms!.count).toBe(4);
    // Three wires a span, at least four segments each, and a guy at each end.
    expect(cables!.count).toBeGreaterThanOrEqual(3 * 3 * 4 + 2);
  });

  it('draws every part as an instanced mesh with no texture and no custom shader', () => {
    const { scene, lines } = build();
    lines.setSlot(0, run(3));
    lines.commit();
    expect(meshes(scene)).toHaveLength(3);
    for (const mesh of meshes(scene)) {
      const material = mesh.material as THREE.MeshLambertMaterial;
      expect(material.map).toBeNull();
      expect(material).not.toBeInstanceOf(THREE.ShaderMaterial);
    }
  });

  it('makes a wire a box with a real thickness, not a line a pixel wide', () => {
    const { scene, lines } = build();
    lines.setSlot(0, run(2));
    lines.commit();
    const cables = meshes(scene)[2]!;
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    for (let i = 0; i < cables.count; i++) {
      cables.getMatrixAt(i, matrix);
      matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
      expect(scale.y).toBeGreaterThanOrEqual(0.05);
      expect(scale.z).toBeGreaterThanOrEqual(0.05);
    }
    expect(scene.children.some((c) => c instanceof THREE.LineSegments)).toBe(false);
  });

  it('starts every pool at the least capacity, so growing compiles no shader again', () => {
    const { scene, lines } = build();
    lines.setSlot(0, run(3));
    lines.commit();
    for (const mesh of meshes(scene)) {
      expect(mesh.instanceMatrix.count).toBe(MIN_INSTANCE_CAPACITY);
    }
  });

  it('replaces a pool it has outgrown and disposes the old one', () => {
    const { scene, lines } = build();
    lines.setSlot(0, run(3));
    lines.commit();
    const before = meshes(scene)[2]!;
    let disposed = false;
    before.addEventListener('dispose', () => (disposed = true));
    // Enough wire to pass the least capacity.
    for (let slot = 1; slot <= 40; slot++) lines.setSlot(slot, run(12, 100 + slot * 20));
    lines.commit();
    expect(disposed).toBe(true);
    expect(meshes(scene)).toHaveLength(3);
    expect(meshes(scene)[2]!.instanceMatrix.count).toBeGreaterThan(MIN_INSTANCE_CAPACITY);
  });

  it('re-lays only the slot it is given, and leaves the rest as they were', () => {
    const { lines } = build();
    lines.setSlot(0, run(3, 100));
    lines.setSlot(1, run(3, 300));
    lines.commit();
    const laid = lines.slotsLaid();
    lines.setSlot(1, run(5, 300));
    lines.commit();
    expect(lines.slotsLaid()).toBe(laid + 1);
    expect(lines.poleCount()).toBe(8);
    expect(lines.slotKeys().sort()).toEqual([0, 1]);
  });

  it('removes the poles of a slot that is emptied', () => {
    const { lines } = build();
    lines.setSlot(0, run(3));
    lines.setSlot(STRUNG_LINE_SLOT, run(2, 500));
    lines.setSlot(FREE_ROAD_SLOT, run(2, 700));
    lines.commit();
    expect(lines.poleCount()).toBe(7);
    lines.setSlot(0, null);
    lines.commit();
    expect(lines.poleCount()).toBe(4);
  });

  it('reads a pole back by index across its slots, at the height of its ground', () => {
    const scene = new THREE.Scene();
    const lines = new PowerLineRenderer(scene, (x) => x * 0.01);
    lines.setSlot(0, run(2));
    lines.commit();
    expect(lines.polePosition(0)).toEqual({ x: 20, y: 0.2, z: 100 });
    expect(lines.polePosition(1)).toEqual({ x: 60, y: 0.6, z: 100 });
    expect(lines.polePosition(2)).toBeNull();
  });
});
