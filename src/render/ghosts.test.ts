import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { TilePoint } from '../shared/types';
import { TILE_METERS } from '../shared/constants';
import {
  GhostRenderer,
  baseColorFor,
  buildConformingEdgePositions,
  buildConformingTilePositions,
  computeFootprintEdges,
  fillColorFor,
  frameColorFor,
  hexToRgb01,
  stripeAxisIsX,
  VERTS_PER_GHOST_CELL,
  VERTS_PER_GHOST_EDGE,
  volumeBoxTransform,
  volumeColorFor,
} from './ghosts';
import type { GhostEdgeSegment } from './ghosts';
import { ZoneType } from '../shared/types';
import { zoneTintColor } from './zonegrid';

const flatHeightAt = (): number => 0;

function colorAt(mesh: THREE.Mesh | THREE.InstancedMesh): THREE.Color {
  return (mesh.material as THREE.MeshBasicMaterial).color;
}

/** Vertex count currently live on a merged (base/fill/border/inner) layer. */
function vertCount(mesh: THREE.Mesh): number {
  return mesh.geometry.getAttribute('position').count;
}

/** Axis-aligned bounds of a merged layer's geometry (world space, post-yOffset). */
function boundingBoxOf(mesh: THREE.Mesh): THREE.Box3 {
  mesh.geometry.computeBoundingBox();
  return mesh.geometry.boundingBox!;
}

/** Same, but directly over a raw position array (for testing the pure builder
 * functions without going through a renderer/scene at all). */
function boundsOfPositions(positions: Float32Array) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]!;
    const y = positions[i + 1]!;
    const z = positions[i + 2]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

const straightLine = (n: number): TilePoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, z: 0 }));

describe('hexToRgb01', () => {
  it('converts a hex triple into 0..1 channel ratios', () => {
    expect(hexToRgb01(0xffffff)).toEqual([1, 1, 1]);
    expect(hexToRgb01(0x000000)).toEqual([0, 0, 0]);
    expect(hexToRgb01(0x38b6e3)[0]).toBeCloseTo(0x38 / 255, 6);
    expect(hexToRgb01(0x38b6e3)[1]).toBeCloseTo(0xb6 / 255, 6);
    expect(hexToRgb01(0x38b6e3)[2]).toBeCloseTo(0xe3 / 255, 6);
  });
});

describe('baseColorFor', () => {
  it('is blue-dominant (accent) for road/plop/bulldoze when valid', () => {
    for (const kind of ['road', 'plop', 'bulldoze'] as const) {
      const [r, g, b] = baseColorFor(kind, true);
      expect(b).toBeGreaterThan(r);
      expect(g).toBeGreaterThan(r);
    }
  });

  it('is green-dominant (darker border shade) for zone when valid', () => {
    const [r, g, b] = baseColorFor('zone', true);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it('is red-dominant (invalid) for every kind when valid is false', () => {
    for (const kind of ['road', 'zone', 'plop', 'bulldoze'] as const) {
      const [r, g, b] = baseColorFor(kind, false);
      expect(r).toBeGreaterThan(g);
      expect(r).toBeGreaterThan(b);
    }
  });

  it('invalid overrides to the exact same color regardless of kind', () => {
    const road = baseColorFor('road', false);
    const zone = baseColorFor('zone', false);
    expect(zone).toEqual(road);
  });
});

describe('stripeAxisIsX', () => {
  it('is X for every tile of a pure horizontal run', () => {
    const path = [
      { x: 0, z: 5 },
      { x: 1, z: 5 },
      { x: 2, z: 5 },
    ];
    for (let i = 0; i < path.length; i++) expect(stripeAxisIsX(path, i)).toBe(true);
  });

  it('is Z for every tile of a pure vertical run', () => {
    const path = [
      { x: 5, z: 0 },
      { x: 5, z: 1 },
      { x: 5, z: 2 },
    ];
    for (let i = 0; i < path.length; i++) expect(stripeAxisIsX(path, i)).toBe(false);
  });

  it('defaults to X for a single-tile path', () => {
    expect(stripeAxisIsX([{ x: 3, z: 4 }], 0)).toBe(true);
  });

  it('does not throw for an out-of-range index', () => {
    expect(() => stripeAxisIsX([{ x: 0, z: 0 }], 5)).not.toThrow();
  });
});

describe('GhostRenderer construction', () => {
  it('adds exactly 6 layers to the scene (4 merged Mesh + 1 instanced stripe + 1 volume box Mesh), all empty/hidden', () => {
    const scene = new THREE.Scene();
    const renderer = new GhostRenderer(scene, flatHeightAt);
    expect(scene.children.length).toBe(6);
    const { base, fill, stripe, border, inner } = renderer.layers();
    expect(vertCount(base)).toBe(0);
    expect(vertCount(fill)).toBe(0);
    expect(stripe.count).toBe(0);
    expect(vertCount(border)).toBe(0);
    expect(vertCount(inner)).toBe(0);
    expect(renderer.volumeBox().visible).toBe(false);
  });
});

describe('GhostRenderer.setPreview — road kind', () => {
  it('populates the base + stripe layers, leaves fill empty', () => {
    const scene = new THREE.Scene();
    const renderer = new GhostRenderer(scene, flatHeightAt);
    renderer.setPreview(straightLine(4), true, 'road');

    const { base, fill, stripe } = renderer.layers();
    expect(vertCount(base)).toBe(4 * VERTS_PER_GHOST_CELL);
    expect(vertCount(fill)).toBe(0);
    expect(stripe.count).toBe(2); // every other tile: indices 0, 2

    const baseColor = colorAt(base);
    expect(baseColor.b).toBeGreaterThan(baseColor.r);
    const stripeColor = colorAt(stripe);
    expect(stripeColor.r).toBeCloseTo(1, 6);
    expect(stripeColor.g).toBeCloseTo(1, 6);
    expect(stripeColor.b).toBeCloseTo(1, 6);
  });

  it('positions the base quad at the tile center, offset above the ground height', () => {
    const heightAt = (): number => 12.5;
    const scene = new THREE.Scene();
    const renderer = new GhostRenderer(scene, heightAt);
    renderer.setPreview([{ x: 2, z: 3 }], true, 'road');

    const box = boundingBoxOf(renderer.layers().base);
    const center = box.getCenter(new THREE.Vector3());
    expect(center.x).toBeCloseTo((2 + 0.5) * TILE_METERS, 5);
    expect(center.z).toBeCloseTo((3 + 0.5) * TILE_METERS, 5);
    expect(box.min.y).toBeGreaterThan(12.5); // ground height + a small y-offset
    expect(box.max.x - box.min.x).toBeCloseTo(TILE_METERS, 5);
    expect(box.max.z - box.min.z).toBeCloseTo(TILE_METERS, 5);
  });

  it('turns off the stripe when a road preview goes invalid', () => {
    const scene = new THREE.Scene();
    const renderer = new GhostRenderer(scene, flatHeightAt);
    renderer.setPreview(straightLine(4), false, 'road');
    const { base, fill, stripe } = renderer.layers();
    expect(vertCount(base)).toBe(4 * VERTS_PER_GHOST_CELL);
    expect(vertCount(fill)).toBe(0);
    expect(stripe.count).toBe(0);
    const baseColor = colorAt(base);
    expect(baseColor.r).toBeGreaterThan(baseColor.b); // invalid orange-red
  });
});

describe('zone ghost color matches the painted zone (RCI), not a generic green', () => {
  it('commercial ghost is the commercial blue tint, not green', () => {
    const com = zoneTintColor(ZoneType.ComLow)!;
    // Fill takes the zone tint verbatim; base is a darkened version of it.
    expect(fillColorFor(ZoneType.ComLow)).toEqual(com);
    const base = baseColorFor('zone', true, ZoneType.ComLow);
    expect(base[2]).toBeGreaterThan(base[1]); // blue-dominant (commercial), not green-dominant
    // and it is a scaled-down commercial tint (same hue family)
    expect(base[2] / base[0]).toBeCloseTo(com[2] / com[0], 5);
  });

  it('each RCI zone yields a distinct ghost tint', () => {
    const res = fillColorFor(ZoneType.ResLow);
    const com = fillColorFor(ZoneType.ComLow);
    const ind = fillColorFor(ZoneType.Industrial);
    expect(res).not.toEqual(com);
    expect(com).not.toEqual(ind);
    expect(res[1]).toBeGreaterThan(res[2]); // residential green-dominant
    expect(ind[0]).toBeGreaterThan(ind[2]); // industrial warm (orange), red > blue
  });

  it('an unspecified zone falls back to the generic zone green (dezone / no zone)', () => {
    expect(fillColorFor(undefined)).toEqual(fillColorFor(ZoneType.None));
    expect(baseColorFor('zone', true, ZoneType.None)).toEqual(baseColorFor('zone', true));
  });
});

describe('GhostRenderer.setPreview — zone kind', () => {
  it('populates the base (border) + fill layers, leaves stripe empty', () => {
    const scene = new THREE.Scene();
    const renderer = new GhostRenderer(scene, flatHeightAt);
    const tiles: TilePoint[] = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 0, z: 1 },
    ];
    renderer.setPreview(tiles, true, 'zone');

    const { base, fill, stripe } = renderer.layers();
    expect(vertCount(base)).toBe(3 * VERTS_PER_GHOST_CELL);
    expect(vertCount(fill)).toBe(3 * VERTS_PER_GHOST_CELL);
    expect(stripe.count).toBe(0);
  });

  it('the fill quad is smaller than and brighter than the base border quad', () => {
    const scene = new THREE.Scene();
    const renderer = new GhostRenderer(scene, flatHeightAt);
    renderer.setPreview([{ x: 0, z: 0 }], true, 'zone');

    const { base, fill } = renderer.layers();
    const baseColor = colorAt(base);
    const fillColor = colorAt(fill);
    expect(fillColor.r).toBeGreaterThan(baseColor.r);
    expect(fillColor.g).toBeGreaterThan(baseColor.g);
    expect(fillColor.b).toBeGreaterThan(baseColor.b);

    const baseBox = boundingBoxOf(base);
    const fillBox = boundingBoxOf(fill);
    expect(fillBox.max.x - fillBox.min.x).toBeLessThan(baseBox.max.x - baseBox.min.x);
    expect(fillBox.max.z - fillBox.min.z).toBeLessThan(baseBox.max.z - baseBox.min.z);
  });

  it('turns off the fill layer entirely when the zone preview is invalid', () => {
    const scene = new THREE.Scene();
    const renderer = new GhostRenderer(scene, flatHeightAt);
    renderer.setPreview([{ x: 0, z: 0 }], false, 'zone');
    const { base, fill, stripe } = renderer.layers();
    expect(vertCount(base)).toBe(1 * VERTS_PER_GHOST_CELL);
    expect(vertCount(fill)).toBe(0);
    expect(stripe.count).toBe(0);
  });
});

describe('GhostRenderer.setPreview — plop/bulldoze kinds', () => {
  it('plop: only the base (accent) layer is populated', () => {
    const scene = new THREE.Scene();
    const renderer = new GhostRenderer(scene, flatHeightAt);
    renderer.setPreview(
      [
        { x: 0, z: 0 },
        { x: 1, z: 0 },
      ],
      true,
      'plop',
    );
    const { base, fill, stripe } = renderer.layers();
    expect(vertCount(base)).toBe(2 * VERTS_PER_GHOST_CELL);
    expect(vertCount(fill)).toBe(0);
    expect(stripe.count).toBe(0);
  });

  it('bulldoze: only the base (accent) layer is populated', () => {
    const scene = new THREE.Scene();
    const renderer = new GhostRenderer(scene, flatHeightAt);
    renderer.setPreview([{ x: 0, z: 0 }], true, 'bulldoze');
    const { base, fill, stripe } = renderer.layers();
    expect(vertCount(base)).toBe(1 * VERTS_PER_GHOST_CELL);
    expect(vertCount(fill)).toBe(0);
    expect(stripe.count).toBe(0);
  });
});

describe('GhostRenderer.clear / empty preview', () => {
  it('clear() empties every layer', () => {
    const scene = new THREE.Scene();
    const renderer = new GhostRenderer(scene, flatHeightAt);
    renderer.setPreview(straightLine(4), true, 'road');
    renderer.clear();
    const { base, fill, stripe } = renderer.layers();
    expect(vertCount(base)).toBe(0);
    expect(vertCount(fill)).toBe(0);
    expect(stripe.count).toBe(0);
  });

  it('setPreview([]) behaves the same as clear()', () => {
    const scene = new THREE.Scene();
    const renderer = new GhostRenderer(scene, flatHeightAt);
    renderer.setPreview(straightLine(4), true, 'road');
    renderer.setPreview([], true, 'road');
    const { base, fill, stripe } = renderer.layers();
    expect(vertCount(base)).toBe(0);
    expect(vertCount(fill)).toBe(0);
    expect(stripe.count).toBe(0);
  });
});

describe('GhostRenderer — switching kind between calls', () => {
  it("turns off the previous kind's exclusive layer (zone fill -> road stripe)", () => {
    const scene = new THREE.Scene();
    const renderer = new GhostRenderer(scene, flatHeightAt);
    const tiles = straightLine(4);

    renderer.setPreview(tiles, true, 'zone');
    expect(vertCount(renderer.layers().fill)).toBe(4 * VERTS_PER_GHOST_CELL);
    expect(renderer.layers().stripe.count).toBe(0);

    renderer.setPreview(tiles, true, 'road');
    expect(vertCount(renderer.layers().fill)).toBe(0);
    expect(renderer.layers().stripe.count).toBe(2);
  });
});

// base/fill/border/inner are merged, exactly-sized-on-every-call geometry with
// no instance "capacity" to grow, so only the stripe layer (still instanced)
// has a capacity growth story to test.
describe('GhostRenderer — stripe instanced-capacity growth beyond the initial 64', () => {
  it('grows stripe capacity to fit a 150-tile preview and keeps exactly 6 scene children', () => {
    const scene = new THREE.Scene();
    const renderer = new GhostRenderer(scene, flatHeightAt);
    const tiles = straightLine(150);
    renderer.setPreview(tiles, true, 'road');

    expect(scene.children.length).toBe(6); // a grown stripe mesh replaces, never accumulates
    const { base, stripe } = renderer.layers();
    expect(vertCount(base)).toBe(150 * VERTS_PER_GHOST_CELL);
    expect(stripe.count).toBe(75); // ceil(150 / 2)

    // Spot-check the merged base geometry reaches the expected far extent.
    const box = boundingBoxOf(base);
    expect(box.max.x).toBeCloseTo(150 * TILE_METERS, 5);
  });

  it('a second, smaller preview after growth still works correctly (merged layers rebuild exact-sized; stripe capacity never shrinks back)', () => {
    const scene = new THREE.Scene();
    const renderer = new GhostRenderer(scene, flatHeightAt);
    renderer.setPreview(straightLine(150), true, 'road');
    renderer.setPreview(straightLine(3), true, 'road');

    expect(scene.children.length).toBe(6);
    const { base, stripe } = renderer.layers();
    expect(vertCount(base)).toBe(3 * VERTS_PER_GHOST_CELL);
    expect(stripe.count).toBe(2); // indices 0, 2
  });
});

// ---------------------------------------------------------------------------
// Placement footprint feedback: border frame, inner grid, volume ghost
// ---------------------------------------------------------------------------

/** Sorts a segment list into a stable, comparable order regardless of input tile order. */
function sortEdges(edges: readonly GhostEdgeSegment[]): GhostEdgeSegment[] {
  return [...edges].sort(
    (a, b) => a.cx - b.cx || a.cz - b.cz || Number(a.alongX) - Number(b.alongX),
  );
}

describe('computeFootprintEdges', () => {
  it('a single tile produces its 4 edges as outer, none inner', () => {
    const { outer, inner } = computeFootprintEdges([{ x: 0, z: 0 }]);
    expect(inner).toEqual([]);
    expect(outer).toHaveLength(4);
    expect(sortEdges(outer)).toEqual(
      sortEdges([
        { cx: 8, cz: 0, alongX: true }, // north
        { cx: 8, cz: 16, alongX: true }, // south
        { cx: 0, cz: 8, alongX: false }, // west
        { cx: 16, cz: 8, alongX: false }, // east
      ]),
    );
  });

  it('a single tile away from the origin offsets every edge by its tile position', () => {
    const { outer } = computeFootprintEdges([{ x: 3, z: 4 }]);
    expect(sortEdges(outer)).toEqual(
      sortEdges([
        { cx: 56, cz: 64, alongX: true },
        { cx: 56, cz: 80, alongX: true },
        { cx: 48, cz: 72, alongX: false },
        { cx: 64, cz: 72, alongX: false },
      ]),
    );
  });

  it('a solid 2x2 block reads as one bordered square with a 4-segment inner cross', () => {
    const tiles: TilePoint[] = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 0, z: 1 },
      { x: 1, z: 1 },
    ];
    const { outer, inner } = computeFootprintEdges(tiles);
    expect(outer).toHaveLength(8); // perimeter: 2 segments/side x 4 sides
    expect(inner).toHaveLength(4); // the internal cross: 2 + 2
  });

  it('a 1-wide N-tile ribbon (road drag) has 2 end caps + 2N side segments outer, N-1 inner dividers', () => {
    const tiles = straightLine(4);
    const { outer, inner } = computeFootprintEdges(tiles);
    expect(outer).toHaveLength(2 * 4 + 2); // 10
    expect(inner).toHaveLength(3);
  });

  it('an L-shaped path reads as one connected outline (no double-counted corner edge)', () => {
    const tiles: TilePoint[] = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 1, z: 1 },
    ];
    const { outer, inner } = computeFootprintEdges(tiles);
    expect(outer).toHaveLength(8);
    expect(inner).toHaveLength(2);
  });

  it('a scattered (non-adjacent) tile set outlines every tile independently', () => {
    const tiles: TilePoint[] = [
      { x: 0, z: 0 },
      { x: 10, z: 10 },
    ];
    const { outer, inner } = computeFootprintEdges(tiles);
    expect(outer).toHaveLength(8); // 4 each, nothing shared
    expect(inner).toHaveLength(0);
  });

  it('a ring shape (terraform brush) borders BOTH its outer edge and its inner hole', () => {
    // 3x3 minus the center tile (1,1) — an annulus.
    const tiles: TilePoint[] = [];
    for (let z = 0; z <= 2; z++) {
      for (let x = 0; x <= 2; x++) {
        if (x === 1 && z === 1) continue;
        tiles.push({ x, z });
      }
    }
    const { outer, inner } = computeFootprintEdges(tiles);
    expect(outer).toHaveLength(16);
    expect(inner).toHaveLength(8);

    // The hole's own edges must be bordered too (e.g. tile (1,0)'s south edge,
    // which faces straight into the empty center tile).
    expect(outer).toContainEqual({ cx: 24, cz: 16, alongX: true });
  });

  it('invariant: every tile edge is either outer (counted once) or inner (counted once, shared by 2 tiles)', () => {
    const shapes: TilePoint[][] = [
      [{ x: 0, z: 0 }],
      [
        { x: 0, z: 0 },
        { x: 1, z: 0 },
        { x: 0, z: 1 },
        { x: 1, z: 1 },
      ],
      straightLine(6),
      [
        { x: 0, z: 0 },
        { x: 1, z: 0 },
        { x: 1, z: 1 },
      ],
      [
        { x: 0, z: 0 },
        { x: 5, z: 9 },
        { x: -3, z: 2 },
      ],
    ];
    for (const tiles of shapes) {
      const { outer, inner } = computeFootprintEdges(tiles);
      expect(outer.length + 2 * inner.length).toBe(tiles.length * 4);
    }
  });

  it('result is independent of input tile array order', () => {
    const tiles: TilePoint[] = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 0, z: 1 },
      { x: 1, z: 1 },
    ];
    const shuffled = [tiles[2]!, tiles[0]!, tiles[3]!, tiles[1]!];
    const a = computeFootprintEdges(tiles);
    const b = computeFootprintEdges(shuffled);
    expect(sortEdges(a.outer)).toEqual(sortEdges(b.outer));
    expect(sortEdges(a.inner)).toEqual(sortEdges(b.inner));
  });
});

describe('frameColorFor', () => {
  it('is white when valid', () => {
    expect(frameColorFor(true)).toEqual([1, 1, 1]);
  });

  it('is the same §8 danger red as baseColorFor when invalid', () => {
    expect(frameColorFor(false)).toEqual(baseColorFor('road', false));
  });
});

describe('volumeColorFor', () => {
  it('is blue-dominant (accent) when valid', () => {
    const [r, g, b] = volumeColorFor(true);
    expect(b).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(r);
  });

  it('is the same §8 danger red as baseColorFor when invalid', () => {
    expect(volumeColorFor(false)).toEqual(baseColorFor('plop', false));
  });
});

describe('volumeBoxTransform', () => {
  it('centers a 1x1 footprint at the origin tile and scales to TILE_METERS x heightMeters', () => {
    const t = volumeBoxTransform({ w: 1, d: 1, heightMeters: 10, originTile: { x: 0, z: 0 } });
    expect(t.centerX).toBeCloseTo(8, 6);
    expect(t.centerZ).toBeCloseTo(8, 6);
    expect(t.scaleX).toBeCloseTo(16, 6);
    expect(t.scaleY).toBeCloseTo(10, 6);
    expect(t.scaleZ).toBeCloseTo(16, 6);
  });

  it('centers a larger, offset footprint correctly', () => {
    const t = volumeBoxTransform({ w: 4, d: 4, heightMeters: 40, originTile: { x: 10, z: 20 } });
    expect(t.centerX).toBeCloseTo((10 + 2) * TILE_METERS, 6);
    expect(t.centerZ).toBeCloseTo((20 + 2) * TILE_METERS, 6);
    expect(t.scaleX).toBeCloseTo(64, 6);
    expect(t.scaleZ).toBeCloseTo(64, 6);
  });

  it('handles a non-square footprint (w != d)', () => {
    const t = volumeBoxTransform({ w: 3, d: 2, heightMeters: 12, originTile: { x: 5, z: 7 } });
    expect(t.centerX).toBeCloseTo((5 + 1.5) * TILE_METERS, 6);
    expect(t.centerZ).toBeCloseTo((7 + 1) * TILE_METERS, 6);
    expect(t.scaleX).toBeCloseTo(48, 6);
    expect(t.scaleZ).toBeCloseTo(32, 6);
  });

  it('clamps negative w/d/heightMeters to zero, never producing an inverted box', () => {
    const t = volumeBoxTransform({ w: -1, d: -2, heightMeters: -5, originTile: { x: 0, z: 0 } });
    expect(t.scaleX).toBe(0);
    expect(t.scaleZ).toBe(0);
    expect(t.scaleY).toBe(0);
  });
});

describe('GhostRenderer — §6.16 border + inner grid', () => {
  it('a single-tile preview (any kind) gets a 4-segment border and no inner grid', () => {
    const scene = new THREE.Scene();
    const renderer = new GhostRenderer(scene, flatHeightAt);
    renderer.setPreview([{ x: 0, z: 0 }], true, 'bulldoze');
    const { border, inner } = renderer.layers();
    expect(vertCount(border)).toBe(4 * VERTS_PER_GHOST_EDGE);
    expect(vertCount(inner)).toBe(0);
  });

  it('a 2x2 zone preview gets border=8, inner=4 segments (on top of the existing base+fill layers)', () => {
    const scene = new THREE.Scene();
    const renderer = new GhostRenderer(scene, flatHeightAt);
    const tiles: TilePoint[] = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 0, z: 1 },
      { x: 1, z: 1 },
    ];
    renderer.setPreview(tiles, true, 'zone');
    const { base, fill, border, inner } = renderer.layers();
    expect(vertCount(base)).toBe(4 * VERTS_PER_GHOST_CELL);
    expect(vertCount(fill)).toBe(4 * VERTS_PER_GHOST_CELL);
    expect(vertCount(border)).toBe(8 * VERTS_PER_GHOST_EDGE);
    expect(vertCount(inner)).toBe(4 * VERTS_PER_GHOST_EDGE);
  });

  it('border is white ~90% opacity and inner grid is white ~25% opacity when valid', () => {
    const scene = new THREE.Scene();
    const renderer = new GhostRenderer(scene, flatHeightAt);
    renderer.setPreview(straightLine(3), true, 'road');
    const { border, inner } = renderer.layers();

    const borderMat = border.material as THREE.MeshBasicMaterial;
    const innerMat = inner.material as THREE.MeshBasicMaterial;
    expect(borderMat.color.r).toBeCloseTo(1, 6);
    expect(borderMat.color.g).toBeCloseTo(1, 6);
    expect(borderMat.color.b).toBeCloseTo(1, 6);
    expect(borderMat.opacity).toBeCloseTo(0.9, 6);
    expect(innerMat.color.r).toBeCloseTo(1, 6);
    expect(innerMat.opacity).toBeCloseTo(0.25, 6);
  });

  it('border AND inner grid switch to danger red when the preview is invalid, on every kind', () => {
    const scene = new THREE.Scene();
    const renderer = new GhostRenderer(scene, flatHeightAt);
    renderer.setPreview(straightLine(3), false, 'road');
    const { border, inner } = renderer.layers();

    const borderMat = border.material as THREE.MeshBasicMaterial;
    const innerMat = inner.material as THREE.MeshBasicMaterial;
    expect(borderMat.color.r).toBeGreaterThan(borderMat.color.b);
    expect(innerMat.color.r).toBeGreaterThan(innerMat.color.b);
    // Border/inner still populate at the usual counts even though invalid —
    // only color changes, unlike fill/stripe which hide entirely.
    expect(vertCount(border)).toBeGreaterThan(0);
  });

  it('border/inner quads sit above the base/fill/stripe layers', () => {
    const heightAt = (): number => 5;
    const scene = new THREE.Scene();
    const renderer = new GhostRenderer(scene, heightAt);
    renderer.setPreview([{ x: 0, z: 0 }], true, 'plop');
    const { border } = renderer.layers();

    const box = boundingBoxOf(border);
    expect(box.min.y).toBeGreaterThan(5.22); // above GHOST/ZONE_FILL/STRIPE y-offsets (0.2/0.21/0.22)
  });

  it('a border/inner edge strip (buildConformingEdgePositions) is 0.18m wide across the tile edge and TILE_METERS long', () => {
    const heightAt = (): number => 5;
    // North edge of tile (0,0): cx=8 (tile-center x), cz=0.
    const positions = buildConformingEdgePositions(
      [{ cx: 8, cz: 0, alongX: true }],
      heightAt,
      0.23,
    );
    const b = boundsOfPositions(positions);
    expect(b.minY).toBeCloseTo(5.23, 6);
    expect(b.maxY).toBeCloseTo(5.23, 6);
    const sizeX = b.maxX - b.minX;
    const sizeZ = b.maxZ - b.minZ;
    const sizes = [sizeX, sizeZ].sort((a, c) => a - c);
    expect(sizes[0]).toBeCloseTo(0.18, 5);
    expect(sizes[1]).toBeCloseTo(TILE_METERS, 5);
  });

  it('clear() empties the border and inner layers along with everything else', () => {
    const scene = new THREE.Scene();
    const renderer = new GhostRenderer(scene, flatHeightAt);
    renderer.setPreview(straightLine(4), true, 'road');
    renderer.clear();
    const { border, inner } = renderer.layers();
    expect(vertCount(border)).toBe(0);
    expect(vertCount(inner)).toBe(0);
  });

  it('setPreview([]) clears border/inner exactly like clear()', () => {
    const scene = new THREE.Scene();
    const renderer = new GhostRenderer(scene, flatHeightAt);
    renderer.setPreview(straightLine(4), true, 'road');
    renderer.setPreview([], true, 'road');
    const { border, inner } = renderer.layers();
    expect(vertCount(border)).toBe(0);
    expect(vertCount(inner)).toBe(0);
  });

  it('a 150-tile preview rebuilds border/inner geometry to the expected exact size and keeps exactly 6 scene children', () => {
    const scene = new THREE.Scene();
    const renderer = new GhostRenderer(scene, flatHeightAt);
    renderer.setPreview(straightLine(150), true, 'road');

    expect(scene.children.length).toBe(6); // merged layers are never re-added, only re-geometried
    const { border, inner } = renderer.layers();
    expect(vertCount(border)).toBe((2 * 150 + 2) * VERTS_PER_GHOST_EDGE); // 302 segments
    expect(vertCount(inner)).toBe(149 * VERTS_PER_GHOST_EDGE);
  });

  it('a second, smaller preview after a large one still works correctly for border/inner too', () => {
    const scene = new THREE.Scene();
    const renderer = new GhostRenderer(scene, flatHeightAt);
    renderer.setPreview(straightLine(150), true, 'road');
    renderer.setPreview(straightLine(3), true, 'road');

    expect(scene.children.length).toBe(6);
    const { border, inner } = renderer.layers();
    expect(vertCount(border)).toBe(8 * VERTS_PER_GHOST_EDGE); // 2*3+2 side/end segments (ribbon formula above)
    expect(vertCount(inner)).toBe(2 * VERTS_PER_GHOST_EDGE);
  });
});

describe('GhostRenderer — §6.16 plop volume ghost', () => {
  it('is hidden when setPreview is called without opts (roads/zones/bulldoze unchanged)', () => {
    const scene = new THREE.Scene();
    const renderer = new GhostRenderer(scene, flatHeightAt);
    renderer.setPreview(straightLine(4), true, 'road');
    expect(renderer.volumeBox().visible).toBe(false);
  });

  it('is hidden when opts is passed but opts.volume is undefined', () => {
    const scene = new THREE.Scene();
    const renderer = new GhostRenderer(scene, flatHeightAt);
    renderer.setPreview([{ x: 0, z: 0 }], true, 'plop', {});
    expect(renderer.volumeBox().visible).toBe(false);
  });

  it('shows one translucent box sized/positioned to the volume opts when present', () => {
    const heightAt = (): number => 3;
    const scene = new THREE.Scene();
    const renderer = new GhostRenderer(scene, heightAt);
    renderer.setPreview([{ x: 2, z: 2 }], true, 'plop', {
      volume: { w: 2, d: 2, heightMeters: 24, originTile: { x: 2, z: 2 } },
    });

    const box = renderer.volumeBox();
    expect(box.visible).toBe(true);
    expect(box.position.x).toBeCloseTo((2 + 1) * TILE_METERS, 5);
    expect(box.position.z).toBeCloseTo((2 + 1) * TILE_METERS, 5);
    expect(box.position.y).toBeGreaterThan(3); // ground height + a small y-offset
    expect(box.scale.x).toBeCloseTo(2 * TILE_METERS, 5);
    expect(box.scale.y).toBeCloseTo(24, 5);
    expect(box.scale.z).toBeCloseTo(2 * TILE_METERS, 5);
  });

  it('is accent-blue-ish when valid and danger-red-tinted when invalid', () => {
    const scene = new THREE.Scene();
    const renderer = new GhostRenderer(scene, flatHeightAt);
    const opts = { volume: { w: 1, d: 1, heightMeters: 10, originTile: { x: 0, z: 0 } } };

    renderer.setPreview([{ x: 0, z: 0 }], true, 'plop', opts);
    const validColor = (renderer.volumeBox().material as THREE.MeshBasicMaterial).color;
    expect(validColor.b).toBeGreaterThan(validColor.r);

    renderer.setPreview([{ x: 0, z: 0 }], false, 'plop', opts);
    const invalidColor = (renderer.volumeBox().material as THREE.MeshBasicMaterial).color;
    expect(invalidColor.r).toBeGreaterThan(invalidColor.b);
  });

  it('the volume box material is translucent (~22% opacity) with depthWrite off', () => {
    const scene = new THREE.Scene();
    const renderer = new GhostRenderer(scene, flatHeightAt);
    renderer.setPreview([{ x: 0, z: 0 }], true, 'plop', {
      volume: { w: 1, d: 1, heightMeters: 10, originTile: { x: 0, z: 0 } },
    });
    const mat = renderer.volumeBox().material as THREE.MeshBasicMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.opacity).toBeCloseTo(0.22, 6);
    expect(mat.depthWrite).toBe(false);
  });

  it('hides again on a later setPreview call that omits opts', () => {
    const scene = new THREE.Scene();
    const renderer = new GhostRenderer(scene, flatHeightAt);
    renderer.setPreview([{ x: 0, z: 0 }], true, 'plop', {
      volume: { w: 1, d: 1, heightMeters: 10, originTile: { x: 0, z: 0 } },
    });
    expect(renderer.volumeBox().visible).toBe(true);

    renderer.setPreview([{ x: 1, z: 1 }], true, 'plop');
    expect(renderer.volumeBox().visible).toBe(false);
  });

  it('hides on clear()', () => {
    const scene = new THREE.Scene();
    const renderer = new GhostRenderer(scene, flatHeightAt);
    renderer.setPreview([{ x: 0, z: 0 }], true, 'plop', {
      volume: { w: 1, d: 1, heightMeters: 10, originTile: { x: 0, z: 0 } },
    });
    renderer.clear();
    expect(renderer.volumeBox().visible).toBe(false);
  });

  it('does not grow the scene child count regardless of how many times it toggles', () => {
    const scene = new THREE.Scene();
    const renderer = new GhostRenderer(scene, flatHeightAt);
    for (let i = 0; i < 5; i++) {
      renderer.setPreview([{ x: 0, z: 0 }], true, 'plop', {
        volume: { w: 1, d: 1, heightMeters: 10, originTile: { x: 0, z: 0 } },
      });
      renderer.setPreview([{ x: 0, z: 0 }], true, 'plop');
    }
    expect(scene.children.length).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Terrain-conforming ghost: the base/fill/border/inner layers must hug a
// sloped heightAt instead of clipping through it, and the plop volume box must
// clear the highest point under its footprint rather than just its center.
// ---------------------------------------------------------------------------

describe('GhostRenderer — terrain-conforming ghost (slope, no clipping)', () => {
  const slope = (x: number, z: number): number => x * 0.5 + z * 0.3;

  it('buildConformingTilePositions: every vertex sits its own heightAt(x,z)+yOffset, never below its own terrain height', () => {
    const tiles: TilePoint[] = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 2, z: 1 },
      { x: 5, z: 4 },
    ];
    const yOffset = 0.2;
    const positions = buildConformingTilePositions(tiles, slope, TILE_METERS, yOffset);
    expect(positions.length).toBeGreaterThan(0);
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i]!;
      const y = positions[i + 1]!;
      const z = positions[i + 2]!;
      const groundHeight = slope(x, z);
      expect(y).toBeCloseTo(groundHeight + yOffset, 5);
      expect(y).toBeGreaterThanOrEqual(groundHeight); // never below its own terrain height
      expect(y - groundHeight).toBeLessThan(1); // within a small band above it
    }
  });

  it('buildConformingEdgePositions: the same guarantee holds for the border/inner-grid strips', () => {
    const edges = computeFootprintEdges([
      { x: 2, z: 2 },
      { x: 3, z: 2 },
    ]).outer;
    const yOffset = 0.23;
    const positions = buildConformingEdgePositions(edges, slope, yOffset);
    expect(positions.length).toBeGreaterThan(0);
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i]!;
      const y = positions[i + 1]!;
      const z = positions[i + 2]!;
      const groundHeight = slope(x, z);
      expect(y).toBeCloseTo(groundHeight + yOffset, 5);
      expect(y).toBeGreaterThanOrEqual(groundHeight);
      expect(y - groundHeight).toBeLessThan(1);
    }
  });

  it('GhostRenderer.setPreview on a sloped heightAt: every emitted base/fill/border/inner vertex hugs its own terrain height', () => {
    const scene = new THREE.Scene();
    const renderer = new GhostRenderer(scene, slope);
    const tiles: TilePoint[] = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 0, z: 1 },
      { x: 1, z: 1 },
    ];
    renderer.setPreview(tiles, true, 'zone');

    const { base, fill, border, inner } = renderer.layers();
    for (const mesh of [base, fill, border, inner]) {
      const attr = mesh.geometry.getAttribute('position');
      expect(attr.count).toBeGreaterThan(0);
      for (let i = 0; i < attr.count; i++) {
        const x = attr.getX(i);
        const y = attr.getY(i);
        const z = attr.getZ(i);
        const groundHeight = slope(x, z);
        expect(y).toBeGreaterThanOrEqual(groundHeight - 1e-5); // never clips below its own terrain height
        expect(y - groundHeight).toBeLessThan(1); // hugs it — not floating far above either
      }
    }
  });

  it('the plop volume box clears the highest terrain corner under its footprint, not just its center', () => {
    const scene = new THREE.Scene();
    // Height rises sharply toward high x/z — the worst case for a center-only sample.
    const risingCorner = (x: number, z: number): number => (x > 20 && z > 20 ? 50 : 0);
    const renderer = new GhostRenderer(scene, risingCorner);
    renderer.setPreview([{ x: 1, z: 1 }], true, 'plop', {
      volume: { w: 2, d: 2, heightMeters: 10, originTile: { x: 1, z: 1 } },
    });
    const box = renderer.volumeBox();
    // Footprint spans x:[16,48], z:[16,48] — the (48,48) corner hits the risen plateau (50),
    // even though the footprint's center (32,32) does not.
    expect(box.position.y).toBeGreaterThan(50);
  });
});

describe('GhostRenderer frustum-culling regression (wave 6)', () => {
  it('setPreview() gives the merged layers fresh geometry (no stale bounding sphere) and nulls the stripe InstancedMesh bounding sphere', () => {
    const scene = new THREE.Scene();
    const renderer = new GhostRenderer(scene, flatHeightAt);
    // Simulate the renderer's first cull pass over the still-empty layers.
    const before = renderer.layers();
    for (const mesh of [before.base, before.fill, before.border, before.inner]) {
      mesh.geometry.computeBoundingSphere();
      expect(mesh.geometry.boundingSphere).not.toBeNull();
    }
    before.stripe.computeBoundingSphere();
    expect(before.stripe.boundingSphere).not.toBeNull();

    renderer.setPreview([{ x: 120, z: 120 }], true, 'plop');
    const { base, border, inner } = renderer.layers();
    // A fresh BufferGeometry object (not a mutated one) backs each merged
    // layer post-setPreview, so there's nothing stale to null explicitly —
    // its boundingSphere starts life unset.
    expect(base.geometry.boundingSphere).toBeNull();
    expect(border.geometry.boundingSphere).toBeNull();
    expect(inner.geometry.boundingSphere).toBeNull();
  });
});
