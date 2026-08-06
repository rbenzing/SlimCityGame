import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ZonePatch } from '../shared/types';
import { LANDFILL_MAX_PILE_METERS } from '../shared/constants';
import { LandfillRenderer, VERTS_PER_CELL } from './landfill';

const flatHeightAt = (): number => 0;

function patch(x: number, z: number, w: number, h: number, data: number[]): ZonePatch {
  return { x, z, w, h, data: Uint8Array.from(data) };
}

/** Vertex count of a mesh's non-indexed position attribute (0 for a fresh empty geometry). */
function vertexCount(mesh: THREE.Mesh): number {
  const position = mesh.geometry.getAttribute('position');
  return position ? position.count : 0;
}

describe('LandfillRenderer construction', () => {
  it('adds a hidden, empty tint mesh and an empty pile mesh to the scene', () => {
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, flatHeightAt);
    const { tint, piles } = renderer.layers();
    expect(tint.visible).toBe(false);
    expect(vertexCount(tint)).toBe(0);
    expect(renderer.tileCount()).toBe(0);
    expect(piles).toBeInstanceOf(THREE.InstancedMesh);
    expect(piles!.count).toBe(0);
  });
});

describe('LandfillRenderer.apply', () => {
  it('paints one tint cell per membership (=1) tile and raises a pile on each', () => {
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, flatHeightAt);
    // 2x2 patch, 3 of 4 tiles are landfill.
    renderer.apply({ landfill: [patch(1, 1, 2, 2, [1, 1, 1, 0])], landfillFill: 0.5 });

    expect(renderer.tileCount()).toBe(3);
    expect(vertexCount(renderer.layers().tint)).toBe(VERTS_PER_CELL * 3);

    const piles = renderer.layers().piles!;
    expect(piles).toBeInstanceOf(THREE.InstancedMesh);
    expect(piles.count).toBe(3);
    expect(piles.castShadow).toBe(true);
    expect(piles.receiveShadow).toBe(true);
  });

  it('raises every pile to landfillFill * LANDFILL_MAX_PILE_METERS (all tiles share the fill)', () => {
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, flatHeightAt);
    renderer.apply({ landfill: [patch(0, 0, 1, 1, [1])], landfillFill: 0.5 });
    expect(renderer.pileHeight()).toBeCloseTo(0.5 * LANDFILL_MAX_PILE_METERS);

    // The instance matrix's Y scale is the pile height (base seated at y=0 on flat terrain).
    const m = new THREE.Matrix4();
    renderer.layers().piles!.getMatrixAt(0, m);
    const scale = new THREE.Vector3();
    m.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
    expect(scale.y).toBeCloseTo(0.5 * LANDFILL_MAX_PILE_METERS);
  });

  it('draws NO piles (never a zero-scale matrix) when landfillFill is 0, but still tints the ground', () => {
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, flatHeightAt);
    renderer.apply({ landfill: [patch(0, 0, 2, 1, [1, 1])], landfillFill: 0 });
    expect(renderer.tileCount()).toBe(2);
    expect(vertexCount(renderer.layers().tint)).toBe(VERTS_PER_CELL * 2);
    expect(renderer.layers().piles!.count).toBe(0);
  });

  it('defaults landfillFill to 0 when omitted', () => {
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, flatHeightAt);
    renderer.apply({ landfill: [patch(0, 0, 1, 1, [1])] });
    expect(renderer.pileHeight()).toBe(0);
    expect(renderer.layers().piles!.count).toBe(0);
  });

  it('ignores patch tiles that fall outside the map bounds', () => {
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, flatHeightAt);
    renderer.apply({ landfill: [patch(-1, 0, 2, 1, [1, 1])], landfillFill: 0.5 });
    expect(renderer.tileCount()).toBe(1); // only the in-bounds tile
  });

  it('folds successive patches into a persistent cache', () => {
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, flatHeightAt);
    renderer.apply({ landfill: [patch(0, 0, 1, 1, [1])], landfillFill: 0.5 });
    renderer.apply({ landfill: [patch(5, 5, 1, 1, [1])], landfillFill: 0.5 });
    expect(renderer.tileCount()).toBe(2);
  });

  it('conforms to the terrain: every tint vertex hugs heightAt with a small positive lift', () => {
    const slopedHeightAt = (x: number, z: number): number => x * 0.2 + z * 0.05;
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, slopedHeightAt);
    renderer.apply({ landfill: [patch(1, 1, 2, 2, [1, 1, 1, 1])], landfillFill: 0.5 });

    const position = renderer.layers().tint.geometry.getAttribute('position')!;
    expect(position.count).toBeGreaterThan(0);
    for (let i = 0; i < position.count; i++) {
      const lift = position.getY(i) - slopedHeightAt(position.getX(i), position.getZ(i));
      expect(lift).toBeGreaterThan(0);
      expect(lift).toBeLessThan(0.5);
    }
  });

  it('apply(undefined) clears both layers to empty', () => {
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, flatHeightAt);
    renderer.apply({ landfill: [patch(0, 0, 2, 2, [1, 1, 1, 1])], landfillFill: 0.5 });
    expect(renderer.tileCount()).toBe(4);

    renderer.apply(undefined);
    expect(renderer.tileCount()).toBe(0);
    expect(vertexCount(renderer.layers().tint)).toBe(0);
    expect(renderer.layers().piles!.count).toBe(0);
  });
});

describe('LandfillRenderer.setVisible', () => {
  it('toggles both layers together and survives a later rebuild', () => {
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, flatHeightAt);
    renderer.setVisible(true);
    expect(renderer.layers().tint.visible).toBe(true);
    expect(renderer.layers().piles!.visible).toBe(true);

    // A rebuild recreates the pile mesh — it must inherit the visible state.
    renderer.apply({ landfill: [patch(0, 0, 1, 1, [1])], landfillFill: 0.5 });
    expect(renderer.layers().piles!.visible).toBe(true);

    renderer.setVisible(false);
    expect(renderer.layers().tint.visible).toBe(false);
    expect(renderer.layers().piles!.visible).toBe(false);
  });
});

describe('LandfillRenderer.dispose', () => {
  it('removes both meshes from the scene', () => {
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, flatHeightAt);
    renderer.apply({ landfill: [patch(0, 0, 1, 1, [1])], landfillFill: 0.5 });
    renderer.dispose();
    expect(scene.children).toHaveLength(0);
  });
});
