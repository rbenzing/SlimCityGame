import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { District, ZonePatch } from '../shared/types';
import {
  CELL_SUBDIV,
  DistrictsRenderer,
  districtBoundaryEdges,
  VERTS_PER_CELL,
  VERTS_PER_EDGE_STRIP,
} from './districts';

const flatHeightAt = (): number => 0;

const RED: District = { id: 1, name: 'Red District', color: 0xff0000 };
const BLUE: District = { id: 2, name: 'Blue District', color: 0x0000ff };

function patch(x: number, z: number, w: number, h: number, data: number[]): ZonePatch {
  return { x, z, w, h, data: Uint8Array.from(data) };
}

/** Vertex count of a mesh's non-indexed position attribute (0 for a fresh empty geometry). */
function vertexCount(mesh: THREE.Mesh): number {
  const position = mesh.geometry.getAttribute('position');
  return position ? position.count : 0;
}

describe('districtBoundaryEdges (pure)', () => {
  it('a lone assigned tile surrounded by unassigned (id 0) owns all 4 of its edges', () => {
    const districtOf = (x: number, z: number): number => (x === 2 && z === 2 ? 1 : 0);
    const edges = districtBoundaryEdges(6, districtOf);
    expect(edges).toHaveLength(4);
    expect(new Set(edges.map((e) => e.side))).toEqual(new Set(['N', 'E', 'S', 'W']));
  });

  it('two adjacent tiles of the SAME district draw no edge on their shared side', () => {
    // (2,2) and (3,2) both district 1: their shared E/W side is interior, not a boundary.
    const districtOf = (x: number, z: number): number => (z === 2 && (x === 2 || x === 3) ? 1 : 0);
    const edges = districtBoundaryEdges(6, districtOf);
    const tileA = edges.filter((e) => e.x === 2 && e.z === 2);
    const tileB = edges.filter((e) => e.x === 3 && e.z === 2);
    expect(tileA.some((e) => e.side === 'E')).toBe(false);
    expect(tileB.some((e) => e.side === 'W')).toBe(false);
    // Both still own their outward-facing sides.
    expect(tileA.some((e) => e.side === 'N')).toBe(true);
    expect(tileB.some((e) => e.side === 'E')).toBe(true);
  });

  it('two adjacent tiles of DIFFERENT non-zero districts both draw an edge on their shared side', () => {
    const districtOf = (x: number, z: number): number => {
      if (x === 2 && z === 2) return 1;
      if (x === 3 && z === 2) return 2;
      return 0;
    };
    const edges = districtBoundaryEdges(6, districtOf);
    const tileA = edges.filter((e) => e.x === 2 && e.z === 2);
    const tileB = edges.filter((e) => e.x === 3 && e.z === 2);
    expect(tileA.some((e) => e.side === 'E')).toBe(true);
    expect(tileB.some((e) => e.side === 'W')).toBe(true);
  });

  it('an unassigned tile (id 0) never owns an edge itself', () => {
    const districtOf = (x: number, z: number): number => (x === 2 && z === 2 ? 1 : 0);
    const edges = districtBoundaryEdges(6, districtOf);
    expect(edges.some((e) => e.x === 3 && e.z === 2)).toBe(false); // the neighbor, unassigned
  });

  it('a tile at the map edge treats the missing neighbor as unassigned (boundary drawn)', () => {
    const districtOf = (x: number, z: number): number => (x === 0 && z === 0 ? 1 : 0);
    const edges = districtBoundaryEdges(4, districtOf);
    const tile = edges.filter((e) => e.x === 0 && e.z === 0);
    expect(tile).toHaveLength(4); // N/W hit the map edge, E/S hit unassigned neighbors
  });
});

describe('DistrictsRenderer construction', () => {
  it('adds exactly 2 mesh layers to the scene (tint, lines), both hidden and empty', () => {
    const scene = new THREE.Scene();
    const renderer = new DistrictsRenderer(scene, flatHeightAt);
    expect(scene.children).toHaveLength(2);
    const { tint, lines } = renderer.layers();
    expect(tint.visible).toBe(false);
    expect(lines.visible).toBe(false);
    expect(vertexCount(tint)).toBe(0);
    expect(vertexCount(lines)).toBe(0);
  });
});

describe('DistrictsRenderer.applyDistrictPatches', () => {
  it('populates the tint layer only for non-zero (assigned) tiles in the patch', () => {
    const scene = new THREE.Scene();
    const renderer = new DistrictsRenderer(scene, flatHeightAt);
    // 2x1 patch: one assigned (district 1), one unassigned (0).
    renderer.applyDistrictPatches([patch(0, 0, 2, 1, [1, 0])], [RED]);
    expect(vertexCount(renderer.layers().tint)).toBe(VERTS_PER_CELL);
  });

  it('is a harmless no-op when both patches and defs are empty', () => {
    const scene = new THREE.Scene();
    const renderer = new DistrictsRenderer(scene, flatHeightAt);
    renderer.applyDistrictPatches([], []);
    expect(vertexCount(renderer.layers().tint)).toBe(0);
  });

  it('colors tint vertices per the matching District def color', () => {
    const scene = new THREE.Scene();
    const renderer = new DistrictsRenderer(scene, flatHeightAt);
    renderer.applyDistrictPatches([patch(1, 1, 1, 1, [1])], [RED]);
    const color = renderer.layers().tint.geometry.getAttribute('color')!;
    expect(color.getX(0)).toBeCloseTo(1); // 0xff0000 -> r=1
    expect(color.getY(0)).toBeCloseTo(0);
    expect(color.getZ(0)).toBeCloseTo(0);
  });

  it('ignores patch tiles that fall outside the map bounds', () => {
    const scene = new THREE.Scene();
    const renderer = new DistrictsRenderer(scene, flatHeightAt);
    // A patch straddling a negative x — the in-bounds tile still applies.
    renderer.applyDistrictPatches([patch(-1, 0, 2, 1, [9, 1])], [RED]);
    expect(vertexCount(renderer.layers().tint)).toBe(VERTS_PER_CELL);
  });

  it('a later patch overwriting a tile to 0 removes it from the tint layer', () => {
    const scene = new THREE.Scene();
    const renderer = new DistrictsRenderer(scene, flatHeightAt);
    renderer.applyDistrictPatches([patch(0, 0, 1, 1, [1])], [RED]);
    expect(vertexCount(renderer.layers().tint)).toBe(VERTS_PER_CELL);

    renderer.applyDistrictPatches([patch(0, 0, 1, 1, [0])], []);
    expect(vertexCount(renderer.layers().tint)).toBe(0);
  });

  it('the district cache persists across calls — a later patch elsewhere does not forget earlier tiles', () => {
    const scene = new THREE.Scene();
    const renderer = new DistrictsRenderer(scene, flatHeightAt);
    renderer.applyDistrictPatches([patch(0, 0, 1, 1, [1])], [RED]);
    renderer.applyDistrictPatches([patch(5, 5, 1, 1, [2])], [BLUE]);
    expect(vertexCount(renderer.layers().tint)).toBe(VERTS_PER_CELL * 2);
  });

  it('boundary lines are non-empty once a tile is assigned', () => {
    const scene = new THREE.Scene();
    const renderer = new DistrictsRenderer(scene, flatHeightAt);
    renderer.applyDistrictPatches([patch(2, 2, 1, 1, [1])], [RED]);
    // A single isolated assigned tile owns all 4 edges -> 4 edge strips.
    expect(vertexCount(renderer.layers().lines)).toBe(VERTS_PER_EDGE_STRIP * 4);
  });

  it('CONFORMS to the terrain: on a slope, every tint/line vertex hugs heightAt at its own (x,z)', () => {
    const slopedHeightAt = (x: number, z: number): number => x * 0.2 + z * 0.05;
    const scene = new THREE.Scene();
    const renderer = new DistrictsRenderer(scene, slopedHeightAt);
    renderer.applyDistrictPatches([patch(1, 1, 3, 3, [1, 1, 1, 1, 0, 1, 1, 1, 1])], [RED]);

    for (const mesh of [renderer.layers().tint, renderer.layers().lines]) {
      const position = mesh.geometry.getAttribute('position')!;
      expect(position.count).toBeGreaterThan(0);
      for (let i = 0; i < position.count; i++) {
        const terrain = slopedHeightAt(position.getX(i), position.getZ(i));
        const lift = position.getY(i) - terrain;
        expect(lift).toBeGreaterThan(0);
        expect(lift).toBeLessThan(0.2);
      }
    }
  });
});

describe('DistrictsRenderer.setVisible', () => {
  it('toggles both layers together', () => {
    const scene = new THREE.Scene();
    const renderer = new DistrictsRenderer(scene, flatHeightAt);
    renderer.setVisible(true);
    expect(renderer.layers().tint.visible).toBe(true);
    expect(renderer.layers().lines.visible).toBe(true);

    renderer.setVisible(false);
    expect(renderer.layers().tint.visible).toBe(false);
    expect(renderer.layers().lines.visible).toBe(false);
  });

  it('a rebuild via applyDistrictPatches after setVisible(false) leaves both layers hidden', () => {
    const scene = new THREE.Scene();
    const renderer = new DistrictsRenderer(scene, flatHeightAt);
    renderer.setVisible(true);
    renderer.applyDistrictPatches([patch(0, 0, 1, 1, [1])], [RED]);
    expect(renderer.layers().tint.visible).toBe(true);

    renderer.setVisible(false);
    renderer.applyDistrictPatches([patch(1, 1, 1, 1, [2])], [BLUE]);
    expect(renderer.layers().tint.visible).toBe(false);
    expect(renderer.layers().lines.visible).toBe(false);
  });
});

describe('DistrictsRenderer — merged geometry sanity', () => {
  it('exactly 2 scene children regardless of how many tiles/patches are applied', () => {
    const scene = new THREE.Scene();
    const renderer = new DistrictsRenderer(scene, flatHeightAt);
    const data: number[] = [];
    for (let i = 0; i < 100; i++) data.push(1);
    renderer.applyDistrictPatches([patch(0, 0, 10, 10, data)], [RED]);
    expect(scene.children).toHaveLength(2);
    expect(vertexCount(renderer.layers().tint)).toBe(VERTS_PER_CELL * 100);
  });
});

// Sanity: CELL_SUBDIV is the documented 4 (matches render/zonegrid.ts).
describe('CELL_SUBDIV', () => {
  it('is 4', () => {
    expect(CELL_SUBDIV).toBe(4);
  });
});
