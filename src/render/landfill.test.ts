import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ZonePatch } from '../shared/types';
import { LANDFILL_MAX_PILE_METERS, MAP_SIZE, TILE_METERS } from '../shared/constants';
import { landfillAreas } from '../world/landfill';
import { LandfillRenderer, VERTS_PER_CELL, pileHeightFactor } from './landfill';

const flatHeightAt = (): number => 0;
/** The horizontal run of the mound's side slope, metres. */
const MOUND_RUN = 10;

function patch(x: number, z: number, w: number, h: number, data: number[]): ZonePatch {
  return { x, z, w, h, data: Uint8Array.from(data) };
}

/** Vertex count of a mesh's non-indexed position attribute (0 for a fresh empty geometry). */
function vertexCount(mesh: THREE.Mesh): number {
  const position = mesh.geometry.getAttribute('position');
  return position ? position.count : 0;
}

/** Where a ray dropped from above meets the mesh, or null when it meets nothing. */
function surfaceY(mesh: THREE.Mesh, x: number, z: number): number | null {
  mesh.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0));
  const hit = ray.intersectObject(mesh, false)[0];
  return hit ? hit.point.y : null;
}

/** Highest vertex of a mesh. */
function topOf(mesh: THREE.Mesh): number {
  const position = mesh.geometry.getAttribute('position')!;
  let top = -Infinity;
  for (let i = 0; i < position.count; i++) top = Math.max(top, position.getY(i));
  return top;
}

describe('LandfillRenderer construction', () => {
  it('adds a hidden, empty tint mesh and an empty mound mesh to the scene', () => {
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, flatHeightAt);
    const { tint, piles } = renderer.layers();
    expect(tint.visible).toBe(false);
    expect(vertexCount(tint)).toBe(0);
    expect(renderer.tileCount()).toBe(0);
    expect(piles).toBeInstanceOf(THREE.Mesh);
    expect(vertexCount(piles)).toBe(0);
  });
});

describe('LandfillRenderer.apply', () => {
  it('paints one tint cell per membership (=1) tile and raises a mound over them', () => {
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, flatHeightAt);
    // 2x2 patch, 3 of 4 tiles are landfill.
    renderer.apply({ landfill: [patch(1, 1, 2, 2, [1, 1, 1, 0])], landfillFill: 0.5 });

    expect(renderer.tileCount()).toBe(3);
    expect(vertexCount(renderer.layers().tint)).toBe(VERTS_PER_CELL * 3);

    const piles = renderer.layers().piles;
    expect(vertexCount(piles)).toBeGreaterThan(0);
    expect(piles.castShadow).toBe(true);
    expect(piles.receiveShadow).toBe(true);
  });

  it('caps the mound at its own share of landfillFill * LANDFILL_MAX_PILE_METERS', () => {
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, flatHeightAt);
    renderer.apply({ landfill: [patch(0, 0, 1, 1, [1])], landfillFill: 0.5 });
    expect(renderer.pileHeight()).toBeCloseTo(0.5 * LANDFILL_MAX_PILE_METERS);

    // The tile's centre is the cap: within the jitter band of the fill height, plus the small lift.
    const centre = surfaceY(renderer.layers().piles, TILE_METERS / 2, TILE_METERS / 2)!;
    expect(centre).toBeGreaterThanOrEqual(0.5 * renderer.pileHeight());
    expect(centre).toBeLessThanOrEqual(renderer.pileHeight() + 0.3);
  });

  it('is one continuous surface: it covers the seams between neighbouring tiles at cap height', () => {
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, flatHeightAt);
    // A 6x6 block; the seams well inside it are further than a side slope from the edge.
    renderer.apply({ landfill: [patch(1, 1, 6, 6, new Array(36).fill(1))], landfillFill: 1 });
    const piles = renderer.layers().piles;
    const floor = 0.5 * renderer.pileHeight();
    for (const [x, z] of [
      [3, 3],
      [3, 4],
      [4, 3],
      [4, 4],
    ] as const) {
      // The shared edge's midpoint with the next tile east, and south.
      const east = surfaceY(piles, (x + 1) * TILE_METERS, (z + 0.5) * TILE_METERS);
      const south = surfaceY(piles, (x + 0.5) * TILE_METERS, (z + 1) * TILE_METERS);
      expect(east).not.toBeNull();
      expect(east!).toBeGreaterThanOrEqual(floor);
      expect(south).not.toBeNull();
      expect(south!).toBeGreaterThanOrEqual(floor);
    }
  });

  it('slopes down to the ground at the area edge', () => {
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, flatHeightAt);
    renderer.apply({ landfill: [patch(1, 1, 6, 6, new Array(36).fill(1))], landfillFill: 1 });
    const piles = renderer.layers().piles;
    const edge = surfaceY(piles, 1 * TILE_METERS + 0.01, 4 * TILE_METERS)!;
    expect(edge).toBeLessThan(0.5);
    expect(surfaceY(piles, 1 * TILE_METERS + MOUND_RUN, 4 * TILE_METERS)!).toBeGreaterThan(
      edge + 1,
    );
  });

  it('winds every face upward, so it never renders as a black silhouette', () => {
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, flatHeightAt);
    renderer.apply({ landfill: [patch(0, 0, 2, 2, [1, 1, 1, 1])], landfillFill: 1 });

    const geometry = renderer.layers().piles.geometry;
    const position = geometry.getAttribute('position')!;
    const index = geometry.getIndex()!;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let i = 0; i < index.count; i += 3) {
      a.fromBufferAttribute(position, index.getX(i));
      b.fromBufferAttribute(position, index.getX(i + 1));
      c.fromBufferAttribute(position, index.getX(i + 2));
      const normal = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
      expect(normal.y).toBeGreaterThan(0);
    }
  });

  it('varies the cap height within the jitter band, deterministically', () => {
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, flatHeightAt);
    renderer.apply({ landfill: [patch(0, 0, 6, 6, new Array(36).fill(1))], landfillFill: 1 });

    const piles = renderer.layers().piles;
    const heights = [2, 3, 4].map((t) =>
      surfaceY(piles, (t + 0.5) * TILE_METERS, 3 * TILE_METERS)!,
    );
    for (const h of heights) {
      expect(h).toBeGreaterThanOrEqual(0.5 * LANDFILL_MAX_PILE_METERS - 1e-6);
      expect(h).toBeLessThanOrEqual(LANDFILL_MAX_PILE_METERS + 0.3);
    }
    expect(new Set(heights.map((h) => h.toFixed(3))).size).toBeGreaterThan(1);
    // Same tile, same factor, every time.
    expect(pileHeightFactor(3, 0)).toBe(pileHeightFactor(3, 0));
    expect(topOf(piles)).toBeLessThanOrEqual(LANDFILL_MAX_PILE_METERS + 0.3);
  });

  it('draws NO mound when landfillFill is 0, but still tints the ground', () => {
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, flatHeightAt);
    renderer.apply({ landfill: [patch(0, 0, 2, 1, [1, 1])], landfillFill: 0 });
    expect(renderer.tileCount()).toBe(2);
    expect(vertexCount(renderer.layers().tint)).toBe(VERTS_PER_CELL * 2);
    expect(vertexCount(renderer.layers().piles)).toBe(0);
  });

  it('defaults landfillFill to 0 when omitted', () => {
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, flatHeightAt);
    renderer.apply({ landfill: [patch(0, 0, 1, 1, [1])] });
    expect(renderer.pileHeight()).toBe(0);
    expect(vertexCount(renderer.layers().piles)).toBe(0);
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
    expect(vertexCount(renderer.layers().piles)).toBeGreaterThan(0);
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
    expect(vertexCount(renderer.layers().piles)).toBe(0);
  });
});

describe('LandfillRenderer.setVisible', () => {
  it('toggles both layers together and survives a later rebuild', () => {
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, flatHeightAt);
    renderer.setVisible(true);
    // A rebuild recreates the pile mesh — it must inherit the visible state.
    renderer.apply({ landfill: [patch(0, 0, 1, 1, [1])], landfillFill: 0.5 });
    expect(renderer.layers().tint.visible).toBe(true);
    expect(renderer.layers().piles!.visible).toBe(true);

    renderer.setVisible(false);
    expect(renderer.layers().tint.visible).toBe(false);
    expect(renderer.layers().piles!.visible).toBe(false);
  });

  // An empty layer is still submitted as a draw call with a vertex count of
  // zero, which the WebGPU backend warns about. Showing the lens over a city
  // with no landfill must not turn empty geometry on.
  it('keeps an empty layer hidden even when the lens is on', () => {
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, flatHeightAt);
    renderer.setVisible(true);
    expect(renderer.layers().tint.visible).toBe(false);
    expect(renderer.layers().piles!.visible).toBe(false);

    // ...and turns them on as soon as there is something to draw.
    renderer.apply({ landfill: [patch(0, 0, 1, 1, [1])], landfillFill: 0.5 });
    expect(renderer.layers().tint.visible).toBe(true);
    expect(renderer.layers().piles!.visible).toBe(true);
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

  it('lists every landfill tile, the office tile included, so no wild tree stands on the fill or the gatehouse', () => {
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, flatHeightAt, roadRow0);
    paintBlock(renderer);
    const tiles = renderer.memberTilePoints();
    expect(tiles).toHaveLength(renderer.tileCount());
    expect(tiles).toContainEqual({ x: 1, z: 1 });
    expect(tiles).toContainEqual({ x: 2, z: 2 });
    expect(new Set(tiles.map((t) => `${t.x},${t.z}`)).size).toBe(4);
    renderer.apply({ landfill: [patch(1, 1, 2, 2, [0, 0, 0, 0])] });
    expect(renderer.memberTilePoints()).toEqual([]);
  });

  it('paints the bay stripes with the night-tinted body material, and keeps the lamp head glowing', () => {
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, flatHeightAt, roadRow0);
    paintBlock(renderer);
    const { officeMarks, officeLamp } = renderer.layers();
    expect((officeMarks.material as { colorNode?: unknown }).colorNode).toBeDefined();
    expect(officeLamp.material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(vertexCount(officeLamp)).toBeGreaterThan(0);
    renderer.setNightFactor(1.5);
    expect(renderer.nightFactor()).toBe(1);
    renderer.setNightFactor(-1);
    expect(renderer.nightFactor()).toBe(0);
  });

  it('keeps every kit vertex inside the office tile footprint', () => {
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, flatHeightAt, roadRow0);
    paintBlock(renderer);
    const lo = 1 * TILE_METERS - 1e-6;
    const hi = 2 * TILE_METERS + 1e-6;
    for (const mesh of [
      renderer.layers().office,
      renderer.layers().officeMarks,
      renderer.layers().officeLamp,
    ]) {
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
    // The office tile is no ground: the mound slopes to the street there instead of covering it.
    const piles = renderer.layers().piles;
    expect(surfaceY(piles, 1.5 * TILE_METERS, 1.5 * TILE_METERS)).toBeNull();
    expect(surfaceY(piles, 2.5 * TILE_METERS, 2.5 * TILE_METERS)).not.toBeNull();
  });

  it('cuts a flat haul road through the mound from the office to the deepest tile', () => {
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, flatHeightAt, roadRow0);
    renderer.apply({ landfill: [patch(1, 1, 6, 6, new Array(36).fill(1))], landfillFill: 1 });
    const membership = new Uint8Array(MAP_SIZE * MAP_SIZE);
    for (let z = 1; z < 7; z++) for (let x = 1; x < 7; x++) membership[z * MAP_SIZE + x] = 1;
    const path = landfillAreas(MAP_SIZE, membership, roadRow0)[0]!.dumpPath;
    expect(path.length).toBeGreaterThan(2);
    const piles = renderer.layers().piles;
    // Every tile the road crosses, on its centre line, is at ground level.
    for (const tile of path.slice(1)) {
      const x = (tile.x + 0.5) * TILE_METERS;
      const z = (tile.z + 0.5) * TILE_METERS;
      expect(surfaceY(piles, x, z)!).toBeLessThan(0.5);
    }
    // Beside the road, along its first leg, the mound stands high.
    const first = path[1]!;
    const beside = surfaceY(
      piles,
      (first.x + 0.5) * TILE_METERS + (first.z === path[0]!.z ? 0 : 8),
      (first.z + 0.5) * TILE_METERS + (first.z === path[0]!.z ? 8 : 0),
    )!;
    expect(beside).toBeGreaterThan(0.5 * renderer.pileHeight() * 0.8);
  });

  it('renders no office for an area below the operating minimum', () => {
    const scene = new THREE.Scene();
    const renderer = new LandfillRenderer(scene, flatHeightAt, roadRow0);
    renderer.apply({ landfill: [patch(5, 1, 2, 2, [1, 1, 1, 0])], landfillFill: 0.5 });
    expect(renderer.officeTiles()).toEqual([]);
    expect(vertexCount(renderer.layers().office)).toBe(0);
    expect(surfaceY(renderer.layers().piles, 5.5 * TILE_METERS, 1.5 * TILE_METERS)).not.toBeNull(); // all tiles stay dumping grounds
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
    expect(renderer.layers().officeLamp.visible).toBe(true);
    renderer.setVisible(false);
    expect(renderer.layers().office.visible).toBe(false);
    expect(renderer.layers().officeMarks.visible).toBe(false);
    expect(renderer.layers().officeLamp.visible).toBe(false);
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
