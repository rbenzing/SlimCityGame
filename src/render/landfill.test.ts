import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ZonePatch } from '../shared/types';
import { LANDFILL_MAX_PILE_METERS, TILE_METERS } from '../shared/constants';
import { LandfillRenderer, VERTS_PER_CELL, pileHeightFactor } from './landfill';

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

  it('raises each pile to its own share of landfillFill * LANDFILL_MAX_PILE_METERS', () => {
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, flatHeightAt);
    renderer.apply({ landfill: [patch(0, 0, 1, 1, [1])], landfillFill: 0.5 });
    expect(renderer.pileHeight()).toBeCloseTo(0.5 * LANDFILL_MAX_PILE_METERS);

    // The instance matrix's Y scale is the tile's heap height (base seated at y=0 on flat terrain).
    const m = new THREE.Matrix4();
    renderer.layers().piles!.getMatrixAt(0, m);
    const scale = new THREE.Vector3();
    m.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
    expect(scale.y).toBeCloseTo(renderer.pileHeight() * pileHeightFactor(0, 0));
  });

  it('winds every heap face outward (a heap wound inward renders as a black silhouette)', () => {
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, flatHeightAt);
    renderer.apply({ landfill: [patch(0, 0, 1, 1, [1])], landfillFill: 1 });

    const position = renderer.layers().piles!.geometry.getAttribute('position')!;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const centroid = new THREE.Vector3();
    // The heap spans y 0..1 around the origin, so an outward face's normal
    // must point away from the mound's mid-height core.
    const core = new THREE.Vector3(0, 0.5, 0);
    for (let i = 0; i < position.count; i += 3) {
      a.fromBufferAttribute(position, i);
      b.fromBufferAttribute(position, i + 1);
      c.fromBufferAttribute(position, i + 2);
      normal.crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
      centroid
        .copy(a)
        .add(b)
        .add(c)
        .multiplyScalar(1 / 3);
      expect(normal.dot(centroid.sub(core))).toBeGreaterThan(0);
    }
  });

  it('varies heap height per tile within the jitter band, deterministically', () => {
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, flatHeightAt);
    renderer.apply({ landfill: [patch(0, 0, 6, 1, [1, 1, 1, 1, 1, 1])], landfillFill: 1 });

    const piles = renderer.layers().piles!;
    const m = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    const heights: number[] = [];
    for (let i = 0; i < piles.count; i++) {
      piles.getMatrixAt(i, m);
      m.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
      heights.push(scale.y);
    }
    // Every heap sits inside the band, and they are not all the same height.
    for (const h of heights) {
      expect(h).toBeGreaterThanOrEqual(0.5 * LANDFILL_MAX_PILE_METERS - 1e-6);
      expect(h).toBeLessThanOrEqual(LANDFILL_MAX_PILE_METERS + 1e-6);
    }
    expect(new Set(heights.map((h) => h.toFixed(4))).size).toBeGreaterThan(1);
    // Same tile, same factor, every time.
    expect(pileHeightFactor(3, 0)).toBe(pileHeightFactor(3, 0));
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

  it('keeps membership across fill/trash-only updates (no landfill patches)', () => {
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, flatHeightAt);
    renderer.apply({ landfill: [patch(0, 0, 1, 1, [1])] });
    renderer.apply({ landfillFill: 0.5 }); // the periodic garbage-tick update
    expect(renderer.tileCount()).toBe(1);
    expect(renderer.pileHeight()).toBeCloseTo(0.5 * LANDFILL_MAX_PILE_METERS);
    expect(renderer.layers().piles!.count).toBe(1);
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

describe('LandfillRenderer office kit', () => {
  /** A street running along the z = 0 tile row. */
  const roadRow0 = (x: number, z: number): boolean => z === 0 && x >= 0;
  /** 2x2 area at (1..2, 1..2) fronting the street — big enough to operate. */
  const paintBlock = (renderer: LandfillRenderer): void => {
    renderer.apply({ landfill: [patch(1, 1, 2, 2, [1, 1, 1, 1])], landfillFill: 0.5 });
  };

  it('builds the gatehouse kit on the street-adjacent entrance tile', () => {
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, flatHeightAt, roadRow0);
    paintBlock(renderer);
    expect(renderer.officeTiles()).toEqual([{ x: 1, z: 1 }]);
    const { office, officeMarks } = renderer.layers();
    expect(vertexCount(office)).toBeGreaterThan(0); // pad + body + roof + door + pole
    expect(vertexCount(officeMarks)).toBeGreaterThan(0); // bay stripes + light glow
  });

  it('keeps every kit vertex inside the office tile footprint', () => {
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, flatHeightAt, roadRow0);
    paintBlock(renderer);
    const lo = 1 * TILE_METERS - 1e-6;
    const hi = 2 * TILE_METERS + 1e-6;
    for (const mesh of [renderer.layers().office, renderer.layers().officeMarks]) {
      const position = mesh.geometry.getAttribute('position')!;
      for (let i = 0; i < position.count; i++) {
        expect(position.getX(i)).toBeGreaterThanOrEqual(lo);
        expect(position.getX(i)).toBeLessThanOrEqual(hi);
        expect(position.getZ(i)).toBeGreaterThanOrEqual(lo);
        expect(position.getZ(i)).toBeLessThanOrEqual(hi);
      }
    }
  });

  it('excludes the office tile from the tint and piles (dumping grounds only)', () => {
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, flatHeightAt, roadRow0);
    paintBlock(renderer);
    expect(renderer.tileCount()).toBe(4); // membership still counts the office
    expect(vertexCount(renderer.layers().tint)).toBe(VERTS_PER_CELL * 3);
    expect(renderer.layers().piles!.count).toBe(3);
  });

  it('renders no office for an area below the operating minimum', () => {
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, flatHeightAt, roadRow0);
    renderer.apply({ landfill: [patch(5, 1, 2, 2, [1, 1, 1, 0])], landfillFill: 0.5 });
    expect(renderer.officeTiles()).toEqual([]);
    expect(vertexCount(renderer.layers().office)).toBe(0);
    expect(renderer.layers().piles!.count).toBe(3); // all tiles stay dumping grounds
  });

  it('renders no office for an area with no street contact', () => {
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, flatHeightAt, roadRow0);
    renderer.apply({ landfill: [patch(4, 4, 2, 2, [1, 1, 1, 1])], landfillFill: 0.5 });
    expect(renderer.officeTiles()).toEqual([]);
    expect(vertexCount(renderer.layers().tint)).toBe(VERTS_PER_CELL * 4);
  });

  it('toggles the office layers with setVisible', () => {
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, flatHeightAt, roadRow0);
    paintBlock(renderer);
    renderer.setVisible(true);
    expect(renderer.layers().office.visible).toBe(true);
    expect(renderer.layers().officeMarks.visible).toBe(true);
    renderer.setVisible(false);
    expect(renderer.layers().office.visible).toBe(false);
    expect(renderer.layers().officeMarks.visible).toBe(false);
  });

  it('is deterministic — re-applying the same membership rebuilds identical kits', () => {
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, flatHeightAt, roadRow0);
    paintBlock(renderer);
    const first = Array.from(
      renderer.layers().office.geometry.getAttribute('position')!.array as Float32Array,
    );
    paintBlock(renderer);
    const second = Array.from(
      renderer.layers().office.geometry.getAttribute('position')!.array as Float32Array,
    );
    expect(second).toEqual(first);
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
