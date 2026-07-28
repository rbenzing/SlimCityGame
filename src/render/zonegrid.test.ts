import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RoadTier, ZoneType, type ZonePatch } from '../shared/types';
import { computeZonableTiles as computeZonableTilesFrontage, ZONE_DEPTH } from '../world/zonable';
import {
  boundaryEdges,
  computeZonableTiles,
  VERTS_PER_CELL,
  VERTS_PER_EDGE_STRIP,
  ZoneGridRenderer,
  zoneTintColor,
  type ZoneGridSource,
} from './zonegrid';

const flatHeightAt = (): number => 0;

/** Builds a flat (height=0), water-free, building-free grid of `size`, with
 * a single ISOLATED road tile at (roadX, roadZ) — no road neighbour, so
 * under the frontage rule it has no run axis and contributes zero
 * zonable tiles. Still useful for exercising rebuild()/applyZonePatches()
 * plumbing that doesn't care about the zonable-tile count. */
function gridWithOneRoad(size: number, roadX: number, roadZ: number): ZoneGridSource {
  const n = size * size;
  const g: ZoneGridSource = {
    size,
    roadTier: new Uint8Array(n),
    water: new Uint8Array(n),
    zone: new Uint8Array(n),
    buildingId: new Uint32Array(n),
    height: new Float32Array(n),
  };
  g.roadTier[roadZ * size + roadX] = RoadTier.TwoLane;
  return g;
}

/** Builds a flat grid with full-width road rows at each z in `roadRows`. Every
 * tile of such a row is part of one horizontal straight run, so every
 * column frontages the row's N and S sides — plenty of zonable tiles. */
function gridWithRoadRows(size: number, roadRows: number[]): ZoneGridSource {
  const n = size * size;
  const g: ZoneGridSource = {
    size,
    roadTier: new Uint8Array(n),
    water: new Uint8Array(n),
    zone: new Uint8Array(n),
    buildingId: new Uint32Array(n),
    height: new Float32Array(n),
  };
  for (const z of roadRows) {
    for (let x = 0; x < size; x++) g.roadTier[z * size + x] = RoadTier.TwoLane;
  }
  return g;
}

/** Builds a grid with one N-S straight road run (the "straight" case): a
 * vertical segment at `roadX`, z in [zFrom, zTo]. Interior AND dangling-end
 * tiles of a vertical run both frontage E/W, so this yields a solid E/W band
 * (depth ZONE_DEPTH, clipped at map bounds) alongside every road z — the
 * fixture used wherever a test needs real (non-empty) zonable geometry. */
function gridWithStraightRoad(
  size: number,
  roadX: number,
  zFrom: number,
  zTo: number,
): ZoneGridSource {
  const n = size * size;
  const g: ZoneGridSource = {
    size,
    roadTier: new Uint8Array(n),
    water: new Uint8Array(n),
    zone: new Uint8Array(n),
    buildingId: new Uint32Array(n),
    height: new Float32Array(n),
  };
  for (let z = zFrom; z <= zTo; z++) g.roadTier[z * size + roadX] = RoadTier.TwoLane;
  return g;
}

function has(tiles: Array<{ x: number; z: number }>, x: number, z: number): boolean {
  return tiles.some((t) => t.x === x && t.z === z);
}

/** Vertex count of a mesh's non-indexed position attribute (0 for a fresh empty geometry). */
function vertexCount(mesh: THREE.Mesh): number {
  const position = mesh.geometry.getAttribute('position');
  return position ? position.count : 0;
}

describe('computeZonableTiles (UI-SPEC §6.19 — delegates to world/zonable.ts)', () => {
  // The exhaustive rule-behavior matrix (straight runs, turns, junctions,
  // dangling ends, blocking obstacles, slope budget, depth parameter, dedupe)
  // lives in world/zonable.test.ts against the one shared predicate; the
  // tests here just confirm THIS module's computeZonableTiles is that same
  // predicate, plus spot-check the headline behaviors (frontage depth,
  // never off a road end).

  it('returns EXACTLY what world/zonable.ts computeZonableTiles returns for the same grid', () => {
    const g = gridWithStraightRoad(12, 5, 2, 7);
    g.buildingId[4 * 12 + 8] = 42; // an obstacle, to exercise the "stops at first block" path too
    const viaZonegrid = new Set(computeZonableTiles(g).map((t) => `${t.x},${t.z}`));
    const viaZonable = new Set(computeZonableTilesFrontage(g).map((t) => `${t.x},${t.z}`));
    expect(viaZonegrid).toEqual(viaZonable);
    expect(viaZonegrid.size).toBeGreaterThan(0);
  });

  it('marks a perpendicular-frontage band of depth ZONE_DEPTH on both sides of a straight run, never the road tile itself', () => {
    const g = gridWithStraightRoad(12, 5, 2, 7);
    const tiles = computeZonableTiles(g);
    expect(ZONE_DEPTH).toBe(4);
    expect(has(tiles, 5, 4)).toBe(false); // the road tile itself
    expect(has(tiles, 6, 4)).toBe(true); // E depth 1
    expect(has(tiles, 9, 4)).toBe(true); // E depth 4 (the reach boundary)
    expect(has(tiles, 10, 4)).toBe(false); // E depth 5, one past the boundary
    expect(has(tiles, 4, 4)).toBe(true); // W depth 1
    expect(has(tiles, 1, 4)).toBe(true); // W depth 4
    expect(has(tiles, 0, 4)).toBe(false); // W depth 5
  });

  it('never zones off a dangling road end (screenshot 2 fix): nothing straight off the run axis', () => {
    const g = gridWithStraightRoad(12, 5, 2, 7);
    const tiles = computeZonableTiles(g);
    expect(has(tiles, 5, 1)).toBe(false); // straight off the N (top) end
    expect(has(tiles, 5, 8)).toBe(false); // straight off the S (bottom) end
  });

  it('excludes water and building-occupied tiles from the frontage band', () => {
    const g = gridWithStraightRoad(12, 5, 2, 7);
    g.water[4 * 12 + 9] = 1; // E depth 4 of row z=4
    g.buildingId[5 * 12 + 6] = 7; // E depth 1 of row z=5
    const tiles = computeZonableTiles(g);
    expect(has(tiles, 9, 4)).toBe(false);
    expect(has(tiles, 6, 5)).toBe(false);
  });

  it('a currently-zoned tile is still zonable (the grid does not care about g.zone)', () => {
    const g = gridWithStraightRoad(12, 5, 2, 7);
    g.zone[4 * 12 + 6] = ZoneType.ResLow;
    const tiles = computeZonableTiles(g);
    expect(has(tiles, 6, 4)).toBe(true);
  });

  it('returns an empty list when there are no roads at all', () => {
    const g = gridWithOneRoad(5, 0, 0);
    g.roadTier[0] = RoadTier.None; // undo the single (already isolated) road
    expect(computeZonableTiles(g)).toEqual([]);
  });

  it('an isolated single road tile (no neighbour, no run axis) contributes no frontage', () => {
    const g = gridWithOneRoad(9, 4, 4);
    expect(computeZonableTiles(g)).toEqual([]);
  });
});

describe('zoneTintColor (UI-SPEC §8 RCI palette)', () => {
  it('maps residential (low + high) to the green-dominant RCI R color', () => {
    for (const zone of [ZoneType.ResLow, ZoneType.ResHigh]) {
      const color = zoneTintColor(zone);
      expect(color).not.toBeNull();
      const [r, g, b] = color!;
      expect(g).toBeGreaterThan(r);
      expect(g).toBeGreaterThan(b);
    }
  });

  it('maps the new medium-density residential zones (ResMediumRow, ResMedium) into the SAME green-dominant RCI family as ResLow/ResHigh', () => {
    for (const zone of [ZoneType.ResMediumRow, ZoneType.ResMedium]) {
      const color = zoneTintColor(zone);
      expect(color).not.toBeNull();
      const [r, g, b] = color!;
      expect(g).toBeGreaterThan(r);
      expect(g).toBeGreaterThan(b);
    }
  });

  it('gives ResMediumRow and ResMedium each their own shade, distinct from ResLow/ResHigh and from each other', () => {
    const resLow = zoneTintColor(ZoneType.ResLow)!;
    const row = zoneTintColor(ZoneType.ResMediumRow)!;
    const medium = zoneTintColor(ZoneType.ResMedium)!;
    expect(row).not.toEqual(resLow);
    expect(medium).not.toEqual(resLow);
    expect(row).not.toEqual(medium);
  });

  it('maps Mixed to a distinct TEAL sitting between the res-green and com-blue families: green-dominant but blue lifted well above the pure-res green', () => {
    const mixed = zoneTintColor(ZoneType.Mixed)!;
    const res = zoneTintColor(ZoneType.ResLow)!;
    const com = zoneTintColor(ZoneType.ComLow)!;
    const [r, g, b] = mixed;
    expect(g).toBeGreaterThan(r); // still reads as the residential-sector family (growth.ts's zoneSector())
    expect(g).toBeGreaterThan(b); // ...but not AS blue-starved as pure res green
    expect(b).toBeGreaterThan(res[2]); // blue channel lifted toward commercial...
    expect(b).toBeLessThan(com[2]); // ...without going all the way to commercial blue
    expect(mixed).not.toEqual(res);
    expect(mixed).not.toEqual(com);
  });

  it('maps commercial (low + high) to the blue-dominant RCI C color', () => {
    for (const zone of [ZoneType.ComLow, ZoneType.ComHigh]) {
      const color = zoneTintColor(zone);
      expect(color).not.toBeNull();
      const [r, g, b] = color!;
      expect(b).toBeGreaterThan(r);
      expect(b).toBeGreaterThan(g);
    }
  });

  it('maps industrial to the orange RCI I color (red+green high, blue low)', () => {
    const [r, g, b] = zoneTintColor(ZoneType.Industrial)!;
    expect(r).toBeGreaterThan(b);
    expect(g).toBeGreaterThan(b);
  });

  it('maps None to null (unpainted tiles are not drawn on the tint layer)', () => {
    expect(zoneTintColor(ZoneType.None)).toBeNull();
  });

  it('gives every zone (res family, medium-density family, mixed, commercial, industrial) a pairwise-distinct color', () => {
    const zones = [
      ZoneType.ResLow,
      ZoneType.ResMediumRow,
      ZoneType.ResMedium,
      ZoneType.Mixed,
      ZoneType.ComLow,
      ZoneType.Industrial,
    ];
    const colors = zones.map((z) => zoneTintColor(z)!);
    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        expect(colors[i]).not.toEqual(colors[j]);
      }
    }
  });
});

describe('boundaryEdges (deduped tile-boundary line segments)', () => {
  it('a lone tile owns all 4 of its edges', () => {
    expect(boundaryEdges([{ x: 3, z: 5 }]).length).toBe(4);
  });

  it('two side-by-side tiles share their inner boundary: 7 edges, not 8', () => {
    const edges = boundaryEdges([
      { x: 0, z: 0 },
      { x: 1, z: 0 },
    ]);
    expect(edges.length).toBe(7);
    // The shared boundary is drawn exactly once: as (1,0)'s always-owned W edge.
    expect(edges.filter((e) => e.x === 1 && e.z === 0 && e.side === 'W').length).toBe(1);
    expect(edges.filter((e) => e.x === 0 && e.z === 0 && e.side === 'E').length).toBe(0);
  });

  it('a 2x2 block yields 12 edges (8 perimeter + 4 inner, each inner drawn once)', () => {
    const edges = boundaryEdges([
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 0, z: 1 },
      { x: 1, z: 1 },
    ]);
    expect(edges.length).toBe(12);
  });

  it('vertically adjacent tiles share their inner boundary via the lower tile always owning N', () => {
    const edges = boundaryEdges([
      { x: 0, z: 0 },
      { x: 0, z: 1 },
    ]);
    expect(edges.length).toBe(7);
    expect(edges.filter((e) => e.x === 0 && e.z === 1 && e.side === 'N').length).toBe(1);
    expect(edges.filter((e) => e.x === 0 && e.z === 0 && e.side === 'S').length).toBe(0);
  });
});

describe('ZoneGridRenderer construction', () => {
  it('adds exactly 3 mesh layers to the scene (fill, lines, tint), all hidden and empty', () => {
    const scene = new THREE.Scene();
    const renderer = new ZoneGridRenderer(scene, flatHeightAt);
    expect(scene.children.length).toBe(3);
    const { fill, lines, tint } = renderer.layers();
    expect(fill.visible).toBe(false);
    expect(lines.visible).toBe(false);
    expect(tint.visible).toBe(false);
    expect(vertexCount(fill)).toBe(0);
    expect(vertexCount(lines)).toBe(0);
    expect(vertexCount(tint)).toBe(0);
  });
});

describe('ZoneGridRenderer.rebuild', () => {
  it('builds fill geometry for exactly computeZonableTiles(grid).length cells', () => {
    const scene = new THREE.Scene();
    const renderer = new ZoneGridRenderer(scene, flatHeightAt);
    const g = gridWithStraightRoad(12, 5, 2, 7);
    renderer.rebuild(g);

    const tiles = computeZonableTiles(g);
    expect(tiles.length).toBeGreaterThan(0);
    expect(vertexCount(renderer.layers().fill)).toBe(tiles.length * VERTS_PER_CELL);
    expect(vertexCount(renderer.layers().lines)).toBe(
      boundaryEdges(tiles).length * VERTS_PER_EDGE_STRIP,
    );
  });

  it('CONFORMS to the terrain: on a slope, every fill/line/tint vertex hugs heightAt at its own (x,z), always above ground and clear of the road plates', () => {
    // A steep-but-buildable two-axis slope: 0.2 m/m in x (3.2 m per 16 m
    // tile) and 0.05 m/m in z (0.8 m per tile) — both inside MAX_BUILD_SLOPE
    // (4 m per orthogonal-neighbor step) so the tiles stay zonable.
    const slopedHeightAt = (x: number, z: number): number => x * 0.2 + z * 0.05;
    const scene = new THREE.Scene();
    const renderer = new ZoneGridRenderer(scene, slopedHeightAt);
    renderer.rebuild(gridWithStraightRoad(12, 5, 2, 7));
    renderer.applyZonePatches([
      { x: 6, z: 4, w: 1, h: 1, data: Uint8Array.from([ZoneType.ResLow]) },
    ]);

    for (const mesh of [renderer.layers().fill, renderer.layers().lines, renderer.layers().tint]) {
      const position = mesh.geometry.getAttribute('position')!;
      expect(position.count).toBeGreaterThan(0);
      for (let i = 0; i < position.count; i++) {
        const terrain = slopedHeightAt(position.getX(i), position.getZ(i));
        const lift = position.getY(i) - terrain;
        // Every vertex floats a small, positive offset above ITS OWN ground
        // height — never buried (lift <= 0 was the clipped-cell bug), never
        // hovering above the road plates at 0.15.
        expect(lift).toBeGreaterThan(0);
        expect(lift).toBeLessThan(0.15);
      }
    }
  });

  it('rebuilding with a new road layout changes the fill geometry size', () => {
    const scene = new THREE.Scene();
    const renderer = new ZoneGridRenderer(scene, flatHeightAt);
    renderer.rebuild(gridWithStraightRoad(9, 4, 2, 6));
    const first = vertexCount(renderer.layers().fill);

    renderer.rebuild(gridWithRoadRows(9, [0, 6]));
    const second = vertexCount(renderer.layers().fill);
    expect(second).not.toBe(first);
  });
});

describe('ZoneGridRenderer.setVisible', () => {
  it('toggles all three layers together', () => {
    const scene = new THREE.Scene();
    const renderer = new ZoneGridRenderer(scene, flatHeightAt);
    renderer.setVisible(true);
    expect(renderer.layers().fill.visible).toBe(true);
    expect(renderer.layers().lines.visible).toBe(true);
    expect(renderer.layers().tint.visible).toBe(true);

    renderer.setVisible(false);
    expect(renderer.layers().fill.visible).toBe(false);
    expect(renderer.layers().lines.visible).toBe(false);
    expect(renderer.layers().tint.visible).toBe(false);
  });

  it('a rebuild() and applyZonePatches() after setVisible(false) leave all layers hidden (UI-SPEC §6.19 hide-when-idle: the flag must survive a rebuild, main.ts:634 only calls setVisible on tool change)', () => {
    const scene = new THREE.Scene();
    const renderer = new ZoneGridRenderer(scene, flatHeightAt);
    renderer.setVisible(true);
    renderer.rebuild(gridWithStraightRoad(9, 4, 2, 6)); // sanity: visible survives a rebuild while shown too
    expect(renderer.layers().fill.visible).toBe(true);

    renderer.setVisible(false);
    renderer.rebuild(gridWithRoadRows(9, [0, 6])); // a road-network change elsewhere, no tool switch
    renderer.applyZonePatches([
      { x: 0, z: 0, w: 1, h: 1, data: Uint8Array.from([ZoneType.ResLow]) },
    ]);

    const { fill, lines, tint } = renderer.layers();
    expect(fill.visible).toBe(false);
    expect(lines.visible).toBe(false);
    expect(tint.visible).toBe(false);
  });
});

describe('ZoneGridRenderer.applyZonePatches', () => {
  function patch(x: number, z: number, w: number, h: number, data: number[]): ZonePatch {
    return { x, z, w, h, data: Uint8Array.from(data) };
  }

  it('is a harmless no-op before any rebuild() has established a grid size', () => {
    const scene = new THREE.Scene();
    const renderer = new ZoneGridRenderer(scene, flatHeightAt);
    expect(() =>
      renderer.applyZonePatches([patch(0, 0, 2, 1, [ZoneType.ResLow, ZoneType.ComLow])]),
    ).not.toThrow();
    expect(vertexCount(renderer.layers().tint)).toBe(0);
  });

  it('populates the tint layer only for non-None tiles in the patch', () => {
    const scene = new THREE.Scene();
    const renderer = new ZoneGridRenderer(scene, flatHeightAt);
    renderer.rebuild(gridWithOneRoad(9, 4, 4));

    renderer.applyZonePatches([
      patch(0, 0, 2, 1, [ZoneType.ResLow, ZoneType.None]), // one painted, one bare
    ]);
    expect(vertexCount(renderer.layers().tint)).toBe(1 * VERTS_PER_CELL);
  });

  it('colors tint vertices per zoneTintColor', () => {
    const scene = new THREE.Scene();
    const renderer = new ZoneGridRenderer(scene, flatHeightAt);
    renderer.rebuild(gridWithOneRoad(9, 4, 4));
    renderer.applyZonePatches([patch(0, 0, 1, 1, [ZoneType.Industrial])]);

    const color = renderer.layers().tint.geometry.getAttribute('color')!;
    const [r, g, b] = zoneTintColor(ZoneType.Industrial)!;
    expect(color.count).toBe(VERTS_PER_CELL);
    for (let i = 0; i < color.count; i++) {
      expect(color.getX(i)).toBeCloseTo(r, 5);
      expect(color.getY(i)).toBeCloseTo(g, 5);
      expect(color.getZ(i)).toBeCloseTo(b, 5);
    }
  });

  it('tint cells conform to sloped terrain exactly like the grid layers', () => {
    const slopedHeightAt = (_x: number, z: number): number => z * 0.15;
    const scene = new THREE.Scene();
    const renderer = new ZoneGridRenderer(scene, slopedHeightAt);
    renderer.rebuild(gridWithOneRoad(9, 4, 4));
    renderer.applyZonePatches([patch(2, 3, 1, 1, [ZoneType.ResLow])]);

    const position = renderer.layers().tint.geometry.getAttribute('position')!;
    expect(position.count).toBe(VERTS_PER_CELL);
    for (let i = 0; i < position.count; i++) {
      const lift = position.getY(i) - slopedHeightAt(position.getX(i), position.getZ(i));
      expect(lift).toBeGreaterThan(0);
      expect(lift).toBeLessThan(0.15);
    }
  });

  it('a later patch overwriting a tile to None removes it from the tint layer', () => {
    const scene = new THREE.Scene();
    const renderer = new ZoneGridRenderer(scene, flatHeightAt);
    renderer.rebuild(gridWithOneRoad(9, 4, 4));

    renderer.applyZonePatches([patch(0, 0, 1, 1, [ZoneType.ComHigh])]);
    expect(vertexCount(renderer.layers().tint)).toBe(VERTS_PER_CELL);

    renderer.applyZonePatches([patch(0, 0, 1, 1, [ZoneType.None])]);
    expect(vertexCount(renderer.layers().tint)).toBe(0);
  });

  it('ignores patch tiles that fall outside the grid bounds', () => {
    const scene = new THREE.Scene();
    const renderer = new ZoneGridRenderer(scene, flatHeightAt);
    renderer.rebuild(gridWithOneRoad(9, 4, 4));
    expect(() =>
      renderer.applyZonePatches([patch(7, 7, 4, 4, new Array(16).fill(ZoneType.ResLow))]),
    ).not.toThrow();
    // Only the in-bounds corner of that patch (tiles 7,8 x 7,8 -> 4 tiles) should land.
    expect(vertexCount(renderer.layers().tint)).toBe(4 * VERTS_PER_CELL);
  });

  it('the zone cache survives a later rebuild() with a different road layout of the same size', () => {
    const scene = new THREE.Scene();
    const renderer = new ZoneGridRenderer(scene, flatHeightAt);
    renderer.rebuild(gridWithOneRoad(9, 4, 4));
    renderer.applyZonePatches([patch(0, 0, 1, 1, [ZoneType.ResHigh])]);
    expect(vertexCount(renderer.layers().tint)).toBe(VERTS_PER_CELL);

    renderer.rebuild(gridWithRoadRows(9, [0, 6])); // road network changed elsewhere
    expect(vertexCount(renderer.layers().tint)).toBe(VERTS_PER_CELL); // previously-painted zone still remembered
  });
});

describe('ZoneGridRenderer — large tile counts (merged geometry, no capacity ceiling)', () => {
  it('handles a zonable set well beyond the old 256-instance capacity with exactly 3 scene children', () => {
    const scene = new THREE.Scene();
    const renderer = new ZoneGridRenderer(scene, flatHeightAt);
    const size = 40;
    const g = gridWithRoadRows(
      size,
      Array.from({ length: Math.ceil(size / 6) }, (_, i) => i * 6),
    );
    const expected = computeZonableTiles(g).length;
    expect(expected).toBeGreaterThan(256);

    renderer.rebuild(g);
    expect(scene.children.length).toBe(3);
    expect(vertexCount(renderer.layers().fill)).toBe(expected * VERTS_PER_CELL);
  });

  it('handles more than 256 painted tint tiles', () => {
    const scene = new THREE.Scene();
    const renderer = new ZoneGridRenderer(scene, flatHeightAt);
    const size = 20; // 400 tiles
    renderer.rebuild(gridWithOneRoad(size, 0, 0));

    const w = size;
    const h = size;
    const data = new Array(w * h).fill(ZoneType.ResLow);
    renderer.applyZonePatches([{ x: 0, z: 0, w, h, data: Uint8Array.from(data) }]);

    expect(scene.children.length).toBe(3);
    expect(vertexCount(renderer.layers().tint)).toBe(w * h * VERTS_PER_CELL);
  });
});

describe('ZoneGridRenderer frustum-culling regression (wave 6)', () => {
  it('rebuild() + applyZonePatches() install FRESH geometry whose bounding sphere is uncached, even if the empty layers were culled first', () => {
    const scene = new THREE.Scene();
    const renderer = new ZoneGridRenderer(scene, flatHeightAt);
    const { fill, lines, tint } = renderer.layers();
    // Simulate the renderer's first cull pass over the still-empty layers.
    fill.geometry.computeBoundingSphere();
    lines.geometry.computeBoundingSphere();
    tint.geometry.computeBoundingSphere();
    expect(fill.geometry.boundingSphere).not.toBeNull();

    renderer.rebuild(gridWithOneRoad(9, 4, 4));
    renderer.applyZonePatches([
      { x: 4, z: 5, w: 1, h: 1, data: Uint8Array.from([ZoneType.ResLow]) },
    ]);
    // Geometry replacement (not in-place mutation) resets the cached sphere.
    expect(renderer.layers().fill.geometry.boundingSphere).toBeNull();
    expect(renderer.layers().lines.geometry.boundingSphere).toBeNull();
    expect(renderer.layers().tint.geometry.boundingSphere).toBeNull();
  });
});
