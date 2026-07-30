import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { MapData } from '../shared/types';
import {
  CHUNK_TILES,
  CHUNKS_PER_SIDE,
  MAP_SIZE,
  MAX_BUILD_SLOPE,
  MAX_WATER_DEPTH_VIS,
  SEA_LEVEL,
  SHORELINE_BAND_METERS,
  TILE_METERS,
  tileToWorld,
} from '../shared/constants';
import {
  SKIRT_SIDE_COUNT,
  TerrainRenderer,
  chunkOfTile,
  dirtColorAt,
  groundCoverTint,
  seabedDepthColor,
  shorelineBandWeight,
  skirtColorAt,
  treeShadeFactor,
  valueNoise2D,
  vertexColorFor,
} from './terrain';

const makeFlatMap = (size: number): MapData => ({
  name: 'test-map',
  size,
  height: new Float32Array(size * size),
  water: new Uint8Array(size * size),
  trees: new Uint8Array(size * size),
  seaLevel: 0,
  spawn: { x: 0, z: 0 },
});

/** A flat map at a given height (meters), clear of the shoreline/sand bands unless explicitly testing them. */
const makeFlatMapAtHeight = (size: number, height: number): MapData => {
  const map = makeFlatMap(size);
  map.height.fill(height);
  return map;
};

/** World coordinate of the tile-corner plane vertex for tile index t (matches TerrainRenderer's chunk vertex grid). */
const cornerWorld = (t: number): number => t * TILE_METERS;

describe('vertexColorFor', () => {
  it('changes color across the sand -> grass height band', () => {
    const atSea = vertexColorFor(0, 0, 0, 0, 0, false);
    const wellAboveSea = vertexColorFor(60, 0, 0, 0, 0, false);
    expect(wellAboveSea).not.toEqual(atSea);
  });

  it('saturates to a fixed color once well above the grass ramp top', () => {
    const high1 = vertexColorFor(5_000, 0, 0, 0, 0, false);
    const high2 = vertexColorFor(100_000, 0, 0, 0, 0, false);
    expect(high1).toEqual(high2);
  });

  it('applies no rock blend at slope === MAX_BUILD_SLOPE (matches the height-only color)', () => {
    const heightOnly = vertexColorFor(50, 0, 0, 0, 0, false);
    const atThreshold = vertexColorFor(50, MAX_BUILD_SLOPE, 0, 0, 0, false);
    expect(atThreshold).toEqual(heightOnly);
  });

  it('saturates to a fixed rock color for slopes well beyond MAX_BUILD_SLOPE', () => {
    const rock1 = vertexColorFor(50, MAX_BUILD_SLOPE + 1_000, 0, 0, 0, false);
    const rock2 = vertexColorFor(50, MAX_BUILD_SLOPE + 100_000, 0, 0, 0, false);
    expect(rock1).toEqual(rock2);
    const nonRock = vertexColorFor(50, 0, 0, 0, 0, false);
    expect(rock1).not.toEqual(nonRock);
  });

  it('transitions monotonically (non-decreasing distance from base) through the rock threshold', () => {
    const base = vertexColorFor(50, 0, 0, 0, 0, false);
    const dist = (c: [number, number, number]): number =>
      Math.hypot(c[0] - base[0], c[1] - base[1], c[2] - base[2]);
    const slopes = [
      0,
      MAX_BUILD_SLOPE,
      MAX_BUILD_SLOPE + 1,
      MAX_BUILD_SLOPE + 2,
      MAX_BUILD_SLOPE + 3,
      MAX_BUILD_SLOPE + 5,
      MAX_BUILD_SLOPE + 20,
    ];
    let prev = -Infinity;
    for (const slope of slopes) {
      const d = dist(vertexColorFor(50, slope, 0, 0, 0, false));
      expect(d).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = d;
    }
  });

  it('darkens monotonically as tree density increases, isolated on rock terrain (decoupled from the §6.13 ground-cover noise, which is independently tested below)', () => {
    const rockSlope = MAX_BUILD_SLOPE + 1_000;
    const d0 = vertexColorFor(50, rockSlope, 0, 0, 0, false);
    const d128 = vertexColorFor(50, rockSlope, 128, 0, 0, false);
    const d255 = vertexColorFor(50, rockSlope, 255, 0, 0, false);
    expect(d128[0]).toBeLessThanOrEqual(d0[0]);
    expect(d255[0]).toBeLessThanOrEqual(d128[0]);
    expect(d255[0]).toBeLessThan(d0[0]);
    expect(d255[1]).toBeLessThan(d0[1]);
    expect(d255[2]).toBeLessThan(d0[2]);
  });

  it('applies treeShadeFactor multiplicatively on top of the ground-cover tint on ordinary grass', () => {
    const wx = 37;
    const wz = 141;
    const cover = groundCoverTint(wx, wz, 128, 50, false);
    const shade = treeShadeFactor(128);
    const expected: [number, number, number] = [
      cover[0] * shade,
      cover[1] * shade,
      cover[2] * shade,
    ];
    const actual = vertexColorFor(50, 0, 128, wx, wz, false);
    expect(actual[0]).toBeCloseTo(expected[0], 9);
    expect(actual[1]).toBeCloseTo(expected[1], 9);
    expect(actual[2]).toBeCloseTo(expected[2], 9);
  });

  it('always returns channels within [0,1], even for out-of-range inputs', () => {
    const cases: Array<[number, number, number]> = [
      [-50, 0, 0],
      [0, 0, 0],
      [500, 0, 0],
      [50, -5, 0],
      [50, 1_000, 0],
      [50, 0, -10],
      [50, 0, 1_000],
    ];
    for (const [h, s, tr] of cases) {
      const [r, g, b] = vertexColorFor(h, s, tr, 0, 0, false);
      for (const c of [r, g, b]) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });

  it('underwater vertices use the seabedDepthColor ramp keyed by depth below SEA_LEVEL', () => {
    const height = -6;
    const expected = seabedDepthColor(SEA_LEVEL - height);
    const actual = vertexColorFor(height, 0, 0, 0, 0, false);
    expect(actual[0]).toBeCloseTo(expected[0], 9);
    expect(actual[1]).toBeCloseTo(expected[1], 9);
    expect(actual[2]).toBeCloseTo(expected[2], 9);
  });

  it('is exactly the foam color at SEA_LEVEL (shoreline band fully saturated)', () => {
    const c = vertexColorFor(SEA_LEVEL, 0, 0, 0, 0, false);
    const foamAgain = vertexColorFor(SEA_LEVEL, 0, 0, 999, 12345, false);
    // Foam fully overrides both the seabed/ground-cover branch AND any
    // position-dependent noise at the exact waterline.
    expect(c).toEqual(foamAgain);
  });

  it('renders a uniform mown color near a road, independent of the noise position (tree density held fixed — it still legitimately darkens mown tiles too, per treeShadeFactor)', () => {
    const a = vertexColorFor(50, 0, 20, 10, 10, true);
    const b = vertexColorFor(50, 0, 20, 900, 4321, true);
    expect(a).toEqual(b);
    const notMown = vertexColorFor(50, 0, 20, 10, 10, false);
    expect(notMown).not.toEqual(a);
  });
});

describe('seabedDepthColor', () => {
  it('is the sandy shallow anchor at depth 0', () => {
    const c = seabedDepthColor(0);
    expect(c[0]).toBeCloseTo(0.55, 5);
    expect(c[1]).toBeCloseTo(0.52, 5);
    expect(c[2]).toBeCloseTo(0.38, 5);
  });

  it('is the deep blue-green anchor at depth === MAX_WATER_DEPTH_VIS (12m)', () => {
    const c = seabedDepthColor(MAX_WATER_DEPTH_VIS);
    expect(c[0]).toBeCloseTo(0.02, 5);
    expect(c[1]).toBeCloseTo(0.1, 5);
    expect(c[2]).toBeCloseTo(0.15, 5);
  });

  it('is the exact midpoint at half depth (6m)', () => {
    const shallow = seabedDepthColor(0);
    const deep = seabedDepthColor(MAX_WATER_DEPTH_VIS);
    const mid = seabedDepthColor(MAX_WATER_DEPTH_VIS / 2);
    expect(mid[0]).toBeCloseTo((shallow[0] + deep[0]) / 2, 5);
    expect(mid[1]).toBeCloseTo((shallow[1] + deep[1]) / 2, 5);
    expect(mid[2]).toBeCloseTo((shallow[2] + deep[2]) / 2, 5);
  });

  it('saturates to the deep color beyond MAX_WATER_DEPTH_VIS', () => {
    const at12 = seabedDepthColor(MAX_WATER_DEPTH_VIS);
    const beyond = seabedDepthColor(MAX_WATER_DEPTH_VIS * 10);
    expect(beyond).toEqual(at12);
  });

  it('clamps negative depth to the shallow anchor', () => {
    expect(seabedDepthColor(-5)).toEqual(seabedDepthColor(0));
  });
});

describe('shorelineBandWeight', () => {
  it('peaks at 1 exactly at SEA_LEVEL', () => {
    expect(shorelineBandWeight(SEA_LEVEL)).toBe(1);
  });

  it('is 0 at the band edge and beyond, above and below SEA_LEVEL', () => {
    expect(shorelineBandWeight(SEA_LEVEL + SHORELINE_BAND_METERS)).toBeCloseTo(0, 9);
    expect(shorelineBandWeight(SEA_LEVEL - SHORELINE_BAND_METERS)).toBeCloseTo(0, 9);
    expect(shorelineBandWeight(SEA_LEVEL + SHORELINE_BAND_METERS * 5)).toBe(0);
    expect(shorelineBandWeight(SEA_LEVEL - SHORELINE_BAND_METERS * 5)).toBe(0);
  });

  it('is symmetric around SEA_LEVEL and strictly between 0 and 1 inside the band', () => {
    const above = shorelineBandWeight(SEA_LEVEL + SHORELINE_BAND_METERS / 2);
    const below = shorelineBandWeight(SEA_LEVEL - SHORELINE_BAND_METERS / 2);
    expect(above).toBeCloseTo(below, 9);
    expect(above).toBeGreaterThan(0);
    expect(above).toBeLessThan(1);
  });
});

describe('treeShadeFactor', () => {
  it('is 1 at zero density (no darkening)', () => {
    expect(treeShadeFactor(0)).toBe(1);
  });

  it('reaches the documented max-darken fraction at full density', () => {
    expect(treeShadeFactor(255)).toBeCloseTo(0.65, 5); // 1 - 0.35
  });

  it('decreases monotonically with density', () => {
    const vals = [0, 64, 128, 192, 255].map((d) => treeShadeFactor(d));
    for (let i = 1; i < vals.length; i++) {
      expect(vals[i]!).toBeLessThanOrEqual(vals[i - 1]!);
    }
  });

  it('clamps out-of-range density', () => {
    expect(treeShadeFactor(-50)).toBe(1);
    expect(treeShadeFactor(10_000)).toBeCloseTo(0.65, 5);
  });
});

describe('valueNoise2D', () => {
  it('is deterministic: identical inputs always produce the identical output', () => {
    expect(valueNoise2D(123.4, 56.7, 40, 7)).toBe(valueNoise2D(123.4, 56.7, 40, 7));
  });

  it('stays within [0,1) across a broad scan', () => {
    for (let x = 0; x < 500; x += 13) {
      for (let z = 0; z < 500; z += 17) {
        const n = valueNoise2D(x, z, 40, 7);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThan(1);
      }
    }
  });

  it('varies across world position rather than being a constant field', () => {
    const values = new Set<string>();
    for (let x = 0; x < 300; x += 11) values.add(valueNoise2D(x, 0, 40, 7).toFixed(6));
    expect(values.size).toBeGreaterThan(1);
  });

  it('decorrelates across seeds at the same position', () => {
    const a = valueNoise2D(50, 50, 40, 1);
    const b = valueNoise2D(50, 50, 40, 2);
    expect(a).not.toBe(b);
  });
});

describe('groundCoverTint', () => {
  it('produces more than one distinct hue across world positions on otherwise-identical terrain (the "grass hue variants" read)', () => {
    const colors = new Set<string>();
    for (let x = 0; x < 400; x += 17) {
      for (let z = 0; z < 400; z += 19) {
        colors.add(
          groundCoverTint(x, z, 200, 50, false)
            .map((c) => c.toFixed(4))
            .join(','),
        );
      }
    }
    expect(colors.size).toBeGreaterThan(1);
  });

  it('is a fixed uniform color when nearRoad is true, regardless of position, tree density, or height', () => {
    const a = groundCoverTint(3, 9, 10, 20, true);
    const b = groundCoverTint(311, 777, 240, 90, true);
    expect(a).toEqual(b);
  });

  it('biases toward dry-patch brown more where trees are sparse than where they are dense, at the position the effect is strongest', () => {
    let bestDelta = -Infinity;
    let bestX = 0;
    let bestZ = 0;
    for (let x = 0; x < 260; x += 2) {
      for (let z = 0; z < 260; z += 2) {
        const sparse = groundCoverTint(x, z, 0, 50, false);
        const dense = groundCoverTint(x, z, 255, 50, false);
        const delta = Math.hypot(sparse[0] - dense[0], sparse[1] - dense[1], sparse[2] - dense[2]);
        if (delta > bestDelta) {
          bestDelta = delta;
          bestX = x;
          bestZ = z;
        }
      }
    }
    // A real patch-noise signal exists somewhere in the scanned area.
    expect(bestDelta).toBeGreaterThan(0.05);

    const at = (density: number): [number, number, number] =>
      groundCoverTint(bestX, bestZ, density, 50, false);
    const dist = (a: [number, number, number], b: [number, number, number]): number =>
      Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const c0 = at(0);
    const c128 = at(128);
    const c255 = at(255);
    // As density rises (trees get denser), patchiness shrinks monotonically,
    // so the color moves monotonically away from the sparse (0-density) end.
    const d128 = dist(c0, c128);
    const d255 = dist(c0, c255);
    expect(d255).toBeGreaterThanOrEqual(d128 - 1e-9);
    expect(d255).toBeGreaterThan(0);
  });

  it('biases toward dry-patch brown more at high elevation than low, at the position the effect is strongest', () => {
    let bestDelta = -Infinity;
    let bestX = 0;
    let bestZ = 0;
    for (let x = 0; x < 260; x += 2) {
      for (let z = 0; z < 260; z += 2) {
        const low = groundCoverTint(x, z, 128, 10, false);
        const high = groundCoverTint(x, z, 128, 129, false);
        const delta = Math.hypot(low[0] - high[0], low[1] - high[1], low[2] - high[2]);
        if (delta > bestDelta) {
          bestDelta = delta;
          bestX = x;
          bestZ = z;
        }
      }
    }
    expect(bestDelta).toBeGreaterThan(0.02);

    const at = (height: number): [number, number, number] =>
      groundCoverTint(bestX, bestZ, 128, height, false);
    const dist = (a: [number, number, number], b: [number, number, number]): number =>
      Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const cLow = at(10);
    const cMid = at(60);
    const cHigh = at(129);
    const dMid = dist(cLow, cMid);
    const dHigh = dist(cLow, cHigh);
    expect(dHigh).toBeGreaterThanOrEqual(dMid - 1e-9);
    expect(dHigh).toBeGreaterThan(0);
  });
});

describe('dirtColorAt (§6.17 skirt dirt-brown variation)', () => {
  it('is deterministic for identical world coordinates', () => {
    expect(dirtColorAt(123, 45)).toEqual(dirtColorAt(123, 45));
  });

  it('varies across different world coordinates rather than being a flat constant', () => {
    const colors = new Set<string>();
    for (let x = 0; x < 400; x += 17) {
      colors.add(
        dirtColorAt(x, 0)
          .map((c) => c.toFixed(5))
          .join(','),
      );
    }
    expect(colors.size).toBeGreaterThan(1);
  });

  it('stays within a small variation of the #6b4a2f dirt-brown family', () => {
    for (let x = -300; x < 300; x += 23) {
      const [r, g, b] = dirtColorAt(x, x * 3);
      expect(r).toBeGreaterThan(0.3);
      expect(r).toBeLessThan(0.55);
      expect(g).toBeGreaterThan(0.19);
      expect(g).toBeLessThan(0.4);
      expect(b).toBeGreaterThan(0.08);
      expect(b).toBeLessThan(0.29);
    }
  });

  it('always returns channels within [0,1]', () => {
    for (let x = -500; x < 500; x += 47) {
      const [r, g, b] = dirtColorAt(x, -x);
      for (const c of [r, g, b]) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('skirtColorAt (§6.17 earth cross-section strata bands)', () => {
  const surface: [number, number, number] = [0.3, 0.55, 0.25]; // stand-in "grass" surface color
  const wx = 40;
  const wz = 96;

  it('is exactly the surface color at depth 0 (y === surfaceHeight)', () => {
    expect(skirtColorAt(50, 50, surface, wx, wz)).toEqual(surface);
  });

  it('is exactly the surface color above the surface too (clamped, never above-ground)', () => {
    expect(skirtColorAt(999, 50, surface, wx, wz)).toEqual(surface);
  });

  it('reaches the dirt-brown color exactly at the topsoil-band depth (0.6m below the surface)', () => {
    const c = skirtColorAt(50 - 0.6, 50, surface, wx, wz);
    const dirt = dirtColorAt(wx, wz);
    expect(c[0]).toBeCloseTo(dirt[0], 9);
    expect(c[1]).toBeCloseTo(dirt[1], 9);
    expect(c[2]).toBeCloseTo(dirt[2], 9);
  });

  it('holds the flat dirt color through the middle band (below topsoil, above the rock band)', () => {
    const dirt = dirtColorAt(wx, wz);
    // surfaceHeight=60: 0.6m topsoil band ends at y=59.4; rock band starts at
    // y=-14 (SKIRT_BASE_Y + 4). y=-10 sits well inside the flat dirt middle.
    const c = skirtColorAt(-10, 60, surface, wx, wz);
    expect(c[0]).toBeCloseTo(dirt[0], 9);
    expect(c[1]).toBeCloseTo(dirt[1], 9);
    expect(c[2]).toBeCloseTo(dirt[2], 9);
  });

  it('is exactly the rock color (#4a3b30) at the fixed base y=-18', () => {
    const c = skirtColorAt(-18, 60, surface, wx, wz);
    expect(c[0]).toBeCloseTo(74 / 255, 5);
    expect(c[1]).toBeCloseTo(59 / 255, 5);
    expect(c[2]).toBeCloseTo(48 / 255, 5);
  });

  it('saturates to the rock color below the fixed base too', () => {
    const at = skirtColorAt(-18, 60, surface, wx, wz);
    const beyond = skirtColorAt(-500, 60, surface, wx, wz);
    expect(beyond).toEqual(at);
  });

  it('darkens monotonically from dirt toward rock across the rock band (last 4m above the base)', () => {
    const dirt = dirtColorAt(wx, wz);
    const dist = (c: [number, number, number]): number =>
      Math.hypot(c[0] - dirt[0], c[1] - dirt[1], c[2] - dirt[2]);
    const ys = [-14, -15, -16, -17, -18];
    let prev = -Infinity;
    for (const y of ys) {
      const d = dist(skirtColorAt(y, 60, surface, wx, wz));
      expect(d).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = d;
    }
    expect(prev).toBeGreaterThan(0);
  });

  it('always returns channels within [0,1] across a wide range of depths', () => {
    for (let y = -40; y <= 60; y += 5) {
      const [r, g, b] = skirtColorAt(y, 40, surface, wx, wz);
      for (const c of [r, g, b]) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('chunkOfTile', () => {
  it('maps tile (0,0) to chunk (0,0)', () => {
    expect(chunkOfTile(0, 0)).toEqual({ cx: 0, cz: 0 });
  });

  it('maps the last tile of the first chunk row/col to chunk (0,0)', () => {
    expect(chunkOfTile(CHUNK_TILES - 1, CHUNK_TILES - 1)).toEqual({ cx: 0, cz: 0 });
  });

  it('maps the first tile of the second chunk to chunk (1,1)', () => {
    expect(chunkOfTile(CHUNK_TILES, CHUNK_TILES)).toEqual({ cx: 1, cz: 1 });
  });

  it('maps the last tile of the map to the last chunk', () => {
    expect(chunkOfTile(MAP_SIZE - 1, MAP_SIZE - 1)).toEqual({
      cx: CHUNKS_PER_SIDE - 1,
      cz: CHUNKS_PER_SIDE - 1,
    });
  });

  it('handles mixed x/z chunk indices independently', () => {
    expect(chunkOfTile(CHUNK_TILES * 2 - 1, CHUNK_TILES * 3)).toEqual({ cx: 1, cz: 3 });
  });
});

/**
 * Height of the *rendered* terrain surface at (px, pz) read straight from a
 * chunk mesh's triangles: find the triangle whose XZ projection contains the
 * point and barycentrically interpolate its vertex Ys. This is the ground
 * truth heightAt() must match — roads/buildings sit on the mesh, not on a
 * separate interpolation of the heightmap. Returns null if no triangle covers
 * the point (outside the chunk).
 */
const meshSurfaceHeightAt = (geometry: THREE.BufferGeometry, px: number, pz: number): number | null => {
  const pos = geometry.attributes.position!;
  const index = geometry.index!;
  const eps = 1e-6;
  for (let t = 0; t < index.count; t += 3) {
    const ia = index.getX(t);
    const ib = index.getX(t + 1);
    const ic = index.getX(t + 2);
    const ax = pos.getX(ia);
    const az = pos.getZ(ia);
    const bx = pos.getX(ib);
    const bz = pos.getZ(ib);
    const cx = pos.getX(ic);
    const cz = pos.getZ(ic);
    const denom = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(denom) < eps) continue;
    const wa = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / denom;
    const wb = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / denom;
    const wc = 1 - wa - wb;
    if (wa >= -eps && wb >= -eps && wc >= -eps) {
      return wa * pos.getY(ia) + wb * pos.getY(ib) + wc * pos.getY(ic);
    }
  }
  return null;
};

describe('TerrainRenderer.heightAt', () => {
  // A twisty heightmap so the mesh's per-quad triangulation genuinely differs
  // from a naive bilinear read — the case that used to let terrain poke through
  // roads/buildings. Deterministic (no rng).
  const makeTwistyMap = (): MapData => {
    const map = makeFlatMap(MAP_SIZE);
    for (let z = 0; z < MAP_SIZE; z++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        map.height[z * MAP_SIZE + x] = ((x * 7 + z * 13) % 11) * 3 + ((x % 5) * (z % 5));
      }
    }
    return map;
  };

  const chunk0 = (scene: THREE.Scene): THREE.BufferGeometry =>
    (scene.children[0] as THREE.Mesh).geometry as THREE.BufferGeometry;

  it('matches the rendered mesh surface exactly at interior points (triangulated, not bilinear)', () => {
    const scene = new THREE.Scene();
    const terrain = new TerrainRenderer(scene);
    terrain.build(makeTwistyMap());
    const geometry = chunk0(scene);

    // Sample a spread of fractional offsets across chunk 0's quads, staying off
    // the exact chunk edge so a triangle always covers the point.
    const fracs = [0.13, 0.29, 0.5, 0.61, 0.74, 0.88];
    let checked = 0;
    let sawTwist = false;
    for (let qx = 1; qx < CHUNK_TILES - 1; qx++) {
      for (let qz = 1; qz < CHUNK_TILES - 1; qz++) {
        for (const fx of fracs) {
          for (const fz of fracs) {
            const wx = (qx + fx) * TILE_METERS;
            const wz = (qz + fz) * TILE_METERS;
            const mesh = meshSurfaceHeightAt(geometry, wx, wz);
            expect(mesh).not.toBeNull();
            expect(terrain.heightAt(wx, wz)).toBeCloseTo(mesh!, 4);
            checked++;
          }
        }
      }
    }
    // Confirm at least one sampled quad actually has twist (mesh != bilinear),
    // so this test genuinely exercises the triangulated path.
    const wx = 4.5 * TILE_METERS;
    const wz = 4.5 * TILE_METERS;
    const h00 = terrain.heightAt(4 * TILE_METERS, 4 * TILE_METERS);
    const h10 = terrain.heightAt(5 * TILE_METERS, 4 * TILE_METERS);
    const h01 = terrain.heightAt(4 * TILE_METERS, 5 * TILE_METERS);
    const h11 = terrain.heightAt(5 * TILE_METERS, 5 * TILE_METERS);
    const bilinearCenter = (h00 + h10 + h01 + h11) / 4;
    const meshCenter = meshSurfaceHeightAt(geometry, wx, wz)!;
    if (Math.abs(meshCenter - bilinearCenter) > 1e-3) sawTwist = true;
    expect(sawTwist).toBe(true);
    expect(terrain.heightAt(wx, wz)).toBeCloseTo(meshCenter, 4);
    expect(checked).toBeGreaterThan(0);
  });

  it('returns each chunk mesh vertex height exactly at its tile corner', () => {
    const scene = new THREE.Scene();
    const terrain = new TerrainRenderer(scene);
    terrain.build(makeTwistyMap());
    const geometry = chunk0(scene);
    const pos = geometry.attributes.position!;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      expect(terrain.heightAt(x, z)).toBeCloseTo(pos.getY(i), 4);
    }
  });

  it('is flat across a flat map', () => {
    const scene = new THREE.Scene();
    const terrain = new TerrainRenderer(scene);
    terrain.build(makeFlatMapAtHeight(MAP_SIZE, 42));
    expect(terrain.heightAt(tileToWorld(3), tileToWorld(7))).toBeCloseTo(42, 5);
    expect(terrain.heightAt(3.37 * TILE_METERS, 7.81 * TILE_METERS)).toBeCloseTo(42, 5);
  });

  it('clamps to the nearest edge height outside the grid', () => {
    const scene = new THREE.Scene();
    const terrain = new TerrainRenderer(scene);
    terrain.build(makeTwistyMap());
    // Far outside the map: clamps to the edge, so it equals the on-edge sample.
    const zOnGrid = 5 * TILE_METERS;
    expect(terrain.heightAt(-10_000, zOnGrid)).toBeCloseTo(terrain.heightAt(0, zOnGrid), 4);
    const eastEdge = MAP_SIZE * TILE_METERS;
    expect(terrain.heightAt(10 * eastEdge, zOnGrid)).toBeCloseTo(terrain.heightAt(eastEdge, zOnGrid), 4);
  });

  it('returns 0 before build() has ever been called', () => {
    const scene = new THREE.Scene();
    const terrain = new TerrainRenderer(scene);
    expect(terrain.heightAt(100, 100)).toBe(0);
  });
});

describe('TerrainRenderer build/markDirty/update', () => {
  it('creates exactly CHUNKS_PER_SIDE^2 chunk meshes plus the 4 §6.17 perimeter skirt meshes (water now lives entirely in water.ts)', () => {
    const scene = new THREE.Scene();
    const terrain = new TerrainRenderer(scene);
    terrain.build(makeFlatMap(MAP_SIZE));
    expect(scene.children.length).toBe(CHUNKS_PER_SIDE * CHUNKS_PER_SIDE + SKIRT_SIDE_COUNT);
  });

  it('rebuilding via a second build() call does not leak meshes (scene child count stays the same)', () => {
    const scene = new THREE.Scene();
    const terrain = new TerrainRenderer(scene);
    terrain.build(makeFlatMap(MAP_SIZE));
    terrain.build(makeFlatMap(MAP_SIZE));
    expect(scene.children.length).toBe(CHUNKS_PER_SIDE * CHUNKS_PER_SIDE + SKIRT_SIDE_COUNT);
  });

  it('markDirty + update rebuilds only the affected chunk (others keep their geometry reference)', () => {
    const scene = new THREE.Scene();
    const terrain = new TerrainRenderer(scene);
    const map = makeFlatMap(MAP_SIZE);
    terrain.build(map);

    const chunkMeshes = scene.children.slice(0, CHUNKS_PER_SIDE * CHUNKS_PER_SIDE) as THREE.Mesh[];
    const geomsBefore = chunkMeshes.map((m) => m.geometry);

    for (let z = 0; z < 4; z++) {
      for (let x = 0; x < 4; x++) {
        map.height[z * MAP_SIZE + x] = 999;
      }
    }
    terrain.markDirty(0, 0, 3, 3);
    terrain.update();

    const geomsAfter = chunkMeshes.map((m) => m.geometry);

    expect(geomsAfter[0]).not.toBe(geomsBefore[0]);
    for (let i = 1; i < geomsBefore.length; i++) {
      expect(geomsAfter[i]).toBe(geomsBefore[i]);
    }

    const rebuiltPosition = chunkMeshes[0]!.geometry.attributes.position!;
    let sawRaisedVertex = false;
    for (let i = 0; i < rebuiltPosition.count; i++) {
      if (rebuiltPosition.getY(i) > 500) sawRaisedVertex = true;
    }
    expect(sawRaisedVertex).toBe(true);
  });

  it('update() with nothing marked dirty leaves every chunk geometry reference untouched', () => {
    const scene = new THREE.Scene();
    const terrain = new TerrainRenderer(scene);
    terrain.build(makeFlatMap(MAP_SIZE));
    const chunkMeshes = scene.children.slice(0, CHUNKS_PER_SIDE * CHUNKS_PER_SIDE) as THREE.Mesh[];
    const geomsBefore = chunkMeshes.map((m) => m.geometry);
    terrain.update();
    const geomsAfter = chunkMeshes.map((m) => m.geometry);
    expect(geomsAfter).toEqual(geomsBefore);
  });
});

describe('TerrainRenderer.applyHeightPatches', () => {
  it('writes patch heights into the height source and marks exactly the covered chunk dirty', () => {
    const scene = new THREE.Scene();
    const terrain = new TerrainRenderer(scene);
    const map = makeFlatMap(MAP_SIZE);
    terrain.build(map);

    const chunkMeshes = scene.children.slice(0, CHUNKS_PER_SIDE * CHUNKS_PER_SIDE) as THREE.Mesh[];
    const geomsBefore = chunkMeshes.map((m) => m.geometry);

    // A patch entirely inside chunk (0,0): tiles [0..3) x [0..3).
    const w = 3;
    const h = 3;
    const heights = new Float32Array(w * h).fill(777);
    terrain.applyHeightPatches([{ x: 0, z: 0, w, h, heights }]);
    terrain.update();

    const geomsAfter = chunkMeshes.map((m) => m.geometry);
    expect(geomsAfter[0]).not.toBe(geomsBefore[0]);
    for (let i = 1; i < geomsBefore.length; i++) {
      expect(geomsAfter[i]).toBe(geomsBefore[i]);
    }

    expect(terrain.heightAt(tileToWorld(1), tileToWorld(1))).toBeCloseTo(777, 3);
  });

  it('marks both chunks dirty when a patch straddles a chunk boundary, and no others', () => {
    const scene = new THREE.Scene();
    const terrain = new TerrainRenderer(scene);
    const map = makeFlatMap(MAP_SIZE);
    terrain.build(map);

    const chunkMeshes = scene.children.slice(0, CHUNKS_PER_SIDE * CHUNKS_PER_SIDE) as THREE.Mesh[];
    const geomsBefore = chunkMeshes.map((m) => m.geometry);

    // CHUNK_TILES = 16: x = [14..18) straddles chunk (0,0) and chunk (1,0).
    const w = 4;
    const h = 2;
    const heights = new Float32Array(w * h).fill(42);
    terrain.applyHeightPatches([{ x: CHUNK_TILES - 2, z: 0, w, h, heights }]);
    terrain.update();

    const geomsAfter = chunkMeshes.map((m) => m.geometry);
    const chunk00 = 0; // cz*CHUNKS_PER_SIDE+cx = 0*CHUNKS_PER_SIDE+0
    const chunk10 = 1; // 0*CHUNKS_PER_SIDE+1
    expect(geomsAfter[chunk00]).not.toBe(geomsBefore[chunk00]);
    expect(geomsAfter[chunk10]).not.toBe(geomsBefore[chunk10]);
    for (let i = 0; i < geomsBefore.length; i++) {
      if (i === chunk00 || i === chunk10) continue;
      expect(geomsAfter[i]).toBe(geomsBefore[i]);
    }
  });

  it('applies multiple patches in one call, each marking only its own chunk(s)', () => {
    const scene = new THREE.Scene();
    const terrain = new TerrainRenderer(scene);
    const map = makeFlatMap(MAP_SIZE);
    terrain.build(map);

    const chunkMeshes = scene.children.slice(0, CHUNKS_PER_SIDE * CHUNKS_PER_SIDE) as THREE.Mesh[];
    const geomsBefore = chunkMeshes.map((m) => m.geometry);

    const farCx = CHUNKS_PER_SIDE - 1;
    const farTileX = farCx * CHUNK_TILES + 1;
    terrain.applyHeightPatches([
      { x: 0, z: 0, w: 1, h: 1, heights: new Float32Array([10]) },
      { x: farTileX, z: 0, w: 1, h: 1, heights: new Float32Array([20]) },
    ]);
    terrain.update();

    const geomsAfter = chunkMeshes.map((m) => m.geometry);
    const chunk00 = 0;
    const chunkFar = farCx; // cz=0
    expect(geomsAfter[chunk00]).not.toBe(geomsBefore[chunk00]);
    expect(geomsAfter[chunkFar]).not.toBe(geomsBefore[chunkFar]);
    for (let i = 0; i < geomsBefore.length; i++) {
      if (i === chunk00 || i === chunkFar) continue;
      expect(geomsAfter[i]).toBe(geomsBefore[i]);
    }
  });

  it('clips out-of-bounds rows/cols instead of throwing', () => {
    const scene = new THREE.Scene();
    const terrain = new TerrainRenderer(scene);
    terrain.build(makeFlatMap(MAP_SIZE));
    expect(() =>
      terrain.applyHeightPatches([
        { x: MAP_SIZE - 1, z: MAP_SIZE - 1, w: 3, h: 3, heights: new Float32Array(9).fill(5) },
      ]),
    ).not.toThrow();
    // The in-bounds cell was written: the map's far corner vertex (where that
    // clamped cell fully determines the mesh height) reads the patched value.
    const corner = MAP_SIZE * TILE_METERS;
    expect(terrain.heightAt(corner, corner)).toBeCloseTo(5, 3);
  });

  it('is a safe no-op before build() has ever been called', () => {
    const scene = new THREE.Scene();
    const terrain = new TerrainRenderer(scene);
    expect(() =>
      terrain.applyHeightPatches([{ x: 0, z: 0, w: 1, h: 1, heights: new Float32Array([5]) }]),
    ).not.toThrow();
    expect(terrain.heightAt(0, 0)).toBe(0);
  });
});

describe('TerrainRenderer.applyRoadTiles (§6.13 mown ground-cover band)', () => {
  it('marks affected chunks dirty when road tiles are added, and again when they are removed', () => {
    const scene = new THREE.Scene();
    const terrain = new TerrainRenderer(scene);
    terrain.build(makeFlatMap(MAP_SIZE));

    const chunkMeshes = scene.children.slice(0, CHUNKS_PER_SIDE * CHUNKS_PER_SIDE) as THREE.Mesh[];
    const geomsBefore = chunkMeshes.map((m) => m.geometry);

    terrain.applyRoadTiles([{ x: 5, z: 5 }]);
    terrain.update();
    const geomsAfterAdd = chunkMeshes.map((m) => m.geometry);
    expect(geomsAfterAdd[0]).not.toBe(geomsBefore[0]);
    for (let i = 1; i < geomsBefore.length; i++) expect(geomsAfterAdd[i]).toBe(geomsBefore[i]);

    terrain.applyRoadTiles([]);
    terrain.update();
    const geomsAfterRemove = chunkMeshes.map((m) => m.geometry);
    expect(geomsAfterRemove[0]).not.toBe(geomsAfterAdd[0]);
  });

  it('is idempotent: applying the same road tiles again marks nothing dirty', () => {
    const scene = new THREE.Scene();
    const terrain = new TerrainRenderer(scene);
    terrain.build(makeFlatMap(MAP_SIZE));
    terrain.applyRoadTiles([{ x: 5, z: 5 }]);
    terrain.update();

    const chunkMeshes = scene.children.slice(0, CHUNKS_PER_SIDE * CHUNKS_PER_SIDE) as THREE.Mesh[];
    const geomsBefore = chunkMeshes.map((m) => m.geometry);
    terrain.applyRoadTiles([{ x: 5, z: 5 }]);
    terrain.update();
    const geomsAfter = chunkMeshes.map((m) => m.geometry);
    expect(geomsAfter).toEqual(geomsBefore);
  });

  it('renders the uniform mown color within 1 tile of a road, and leaves distant tiles un-mown', () => {
    const scene = new THREE.Scene();
    const terrain = new TerrainRenderer(scene);
    // Flat, well above SEA_LEVEL/the shoreline band so the mown/ground-cover
    // read is unambiguous (not masked by the foam band).
    terrain.build(makeFlatMapAtHeight(MAP_SIZE, 50));
    terrain.applyRoadTiles([{ x: 5, z: 5 }]);
    terrain.update();

    const mesh = scene.children[0] as THREE.Mesh;
    const position = mesh.geometry.attributes.position!;
    const color = mesh.geometry.attributes.color!;

    const findVertexAt = (tileX: number, tileZ: number): number => {
      const wx = cornerWorld(tileX);
      const wz = cornerWorld(tileZ);
      for (let i = 0; i < position.count; i++) {
        if (Math.abs(position.getX(i) - wx) < 1e-6 && Math.abs(position.getZ(i) - wz) < 1e-6)
          return i;
      }
      throw new Error(`vertex not found for tile (${tileX},${tileZ})`);
    };

    const nearIdx = findVertexAt(6, 5); // adjacent to the road tile (5,5)
    const farIdx = findVertexAt(0, 0); // far away, not near any road

    const nearColor: [number, number, number] = [
      color.getX(nearIdx),
      color.getY(nearIdx),
      color.getZ(nearIdx),
    ];
    const farColor: [number, number, number] = [
      color.getX(farIdx),
      color.getY(farIdx),
      color.getZ(farIdx),
    ];

    const expectedMown = vertexColorFor(50, 0, 0, cornerWorld(6), cornerWorld(5), true);
    expect(nearColor[0]).toBeCloseTo(expectedMown[0], 5);
    expect(nearColor[1]).toBeCloseTo(expectedMown[1], 5);
    expect(nearColor[2]).toBeCloseTo(expectedMown[2], 5);

    expect(farColor).not.toEqual(nearColor);
  });
});

describe('TerrainRenderer perimeter skirt (§6.17 earth cross-section)', () => {
  const extent = MAP_SIZE * TILE_METERS;

  const findSkirt = (scene: THREE.Scene, side: 'west' | 'east' | 'north' | 'south'): THREE.Mesh => {
    const mesh = scene.children.find((c) => c.name === `skirt-${side}`);
    if (!mesh) throw new Error(`skirt-${side} mesh not found in scene`);
    return mesh as THREE.Mesh;
  };

  /** Y values (sorted surface -> base) of every skirt vertex sitting at world (wx, wz). */
  const columnYs = (mesh: THREE.Mesh, wx: number, wz: number): number[] => {
    const position = mesh.geometry.attributes.position!;
    const ys: number[] = [];
    for (let i = 0; i < position.count; i++) {
      if (Math.abs(position.getX(i) - wx) < 1e-6 && Math.abs(position.getZ(i) - wz) < 1e-6) {
        ys.push(position.getY(i));
      }
    }
    return ys.sort((a, b) => b - a);
  };

  /** Vertex colors at world (wx, wz), ordered surface -> base (same order as columnYs). */
  const columnColors = (mesh: THREE.Mesh, wx: number, wz: number): [number, number, number][] => {
    const position = mesh.geometry.attributes.position!;
    const color = mesh.geometry.attributes.color!;
    const rows: { y: number; c: [number, number, number] }[] = [];
    for (let i = 0; i < position.count; i++) {
      if (Math.abs(position.getX(i) - wx) < 1e-6 && Math.abs(position.getZ(i) - wz) < 1e-6) {
        rows.push({ y: position.getY(i), c: [color.getX(i), color.getY(i), color.getZ(i)] });
      }
    }
    return rows.sort((a, b) => b.y - a.y).map((r) => r.c);
  };

  it('spans exactly the 4 sides once each, meeting exactly at the corners (no gap, no overlap, no duplicate side)', () => {
    const scene = new THREE.Scene();
    const terrain = new TerrainRenderer(scene);
    terrain.build(makeFlatMapAtHeight(MAP_SIZE, 20));

    const skirtNames = scene.children.map((c) => c.name).filter((n) => n.startsWith('skirt-'));
    expect(skirtNames.length).toBe(SKIRT_SIDE_COUNT);
    expect(new Set(skirtNames).size).toBe(SKIRT_SIDE_COUNT);
    expect([...skirtNames].sort()).toEqual([
      'skirt-east',
      'skirt-north',
      'skirt-south',
      'skirt-west',
    ]);

    const west = findSkirt(scene, 'west');
    const east = findSkirt(scene, 'east');
    const north = findSkirt(scene, 'north');
    const south = findSkirt(scene, 'south');

    // Each of the 4 corners is covered by exactly the 2 sides that meet there, at the identical world point.
    expect(columnYs(west, 0, 0).length).toBeGreaterThan(0);
    expect(columnYs(north, 0, 0).length).toBeGreaterThan(0);
    expect(columnYs(west, 0, extent).length).toBeGreaterThan(0);
    expect(columnYs(south, 0, extent).length).toBeGreaterThan(0);
    expect(columnYs(east, extent, 0).length).toBeGreaterThan(0);
    expect(columnYs(north, extent, 0).length).toBeGreaterThan(0);
    expect(columnYs(east, extent, extent).length).toBeGreaterThan(0);
    expect(columnYs(south, extent, extent).length).toBeGreaterThan(0);

    // The two sides sharing a corner agree exactly on its surface height (no crack at the seam).
    expect(columnYs(west, 0, 0)[0]).toBeCloseTo(columnYs(north, 0, 0)[0]!, 9);
    expect(columnYs(east, extent, extent)[0]).toBeCloseTo(columnYs(south, extent, extent)[0]!, 9);
  });

  it('follows a known heightfield along the west edge exactly, matching the actual chunk mesh vertex (no cracks)', () => {
    const map = makeFlatMap(MAP_SIZE);
    // A distinctive height ramp along the whole west edge (tile column x=0).
    for (let z = 0; z < MAP_SIZE; z++) map.height[z * MAP_SIZE + 0] = 10 + z * 0.25;

    const scene = new THREE.Scene();
    const terrain = new TerrainRenderer(scene);
    terrain.build(map);

    const west = findSkirt(scene, 'west');
    for (const z of [0, 5, 40, 130, 255]) {
      const wz = cornerWorld(z);
      const expected = terrain.heightAt(0, wz);
      expect(columnYs(west, 0, wz)[0]).toBeCloseTo(expected, 5);
    }

    // Cross-check against chunk (0,0)'s own edge vertex — a genuinely independent code path
    // (PlaneGeometry + translate, not the skirt's manual position buffer) sampling the same
    // world point, so this actually proves there's no seam rather than re-deriving heightAt twice.
    const chunkMesh = scene.children[0] as THREE.Mesh; // chunk (cx=0, cz=0), which owns the x=0 edge column
    const chunkPosition = chunkMesh.geometry.attributes.position!;
    const targetZ = cornerWorld(5);
    let chunkEdgeY: number | undefined;
    for (let i = 0; i < chunkPosition.count; i++) {
      if (
        Math.abs(chunkPosition.getX(i)) < 1e-6 &&
        Math.abs(chunkPosition.getZ(i) - targetZ) < 1e-6
      ) {
        chunkEdgeY = chunkPosition.getY(i);
        break;
      }
    }
    expect(chunkEdgeY).toBeDefined();
    expect(columnYs(west, 0, targetZ)[0]).toBeCloseTo(chunkEdgeY!, 9);
  });

  it('always bottoms out at the fixed SKIRT_BASE_Y regardless of local surface height, including below SEA_LEVEL', () => {
    const map = makeFlatMap(MAP_SIZE);
    for (let z = 0; z < MAP_SIZE; z++) map.height[z * MAP_SIZE + 0] = -5; // below SEA_LEVEL along the west edge
    const scene = new THREE.Scene();
    const terrain = new TerrainRenderer(scene);
    terrain.build(map);

    const west = findSkirt(scene, 'west');
    const ys = columnYs(west, 0, cornerWorld(10));
    expect(ys[0]).toBeCloseTo(-5, 5); // surface still reads through, underwater
    expect(ys[ys.length - 1]).toBeCloseTo(-18, 9); // SKIRT_BASE_Y (local const in terrain.ts)
  });

  it('renders the strata color bands at the expected depths on a real skirt column', () => {
    const map = makeFlatMapAtHeight(MAP_SIZE, 60);
    const scene = new THREE.Scene();
    const terrain = new TerrainRenderer(scene);
    terrain.build(map);

    const west = findSkirt(scene, 'west');
    const wz = cornerWorld(20);
    const ys = columnYs(west, 0, wz);
    const colors = columnColors(west, 0, wz);
    expect(ys.length).toBe(colors.length);
    expect(ys.length).toBeGreaterThanOrEqual(4);

    const expectedSurface = vertexColorFor(60, 0, 0, 0, wz, false); // flat map: no slope, no trees, no road
    const dirt = dirtColorAt(0, wz);

    // Top row: exactly the local surface color.
    expect(colors[0]![0]).toBeCloseTo(expectedSurface[0], 5);
    expect(colors[0]![1]).toBeCloseTo(expectedSurface[1], 5);
    expect(colors[0]![2]).toBeCloseTo(expectedSurface[2], 5);

    // Bottom row: exactly the rock color at the fixed base.
    expect(colors[colors.length - 1]![0]).toBeCloseTo(74 / 255, 5);
    expect(colors[colors.length - 1]![1]).toBeCloseTo(59 / 255, 5);
    expect(colors[colors.length - 1]![2]).toBeCloseTo(48 / 255, 5);

    // A row below the thin topsoil band and above the rock band is flat dirt-brown.
    const middleColor = colors[Math.floor(colors.length / 2)]!;
    expect(middleColor[0]).toBeCloseTo(dirt[0], 4);
    expect(middleColor[1]).toBeCloseTo(dirt[1], 4);
    expect(middleColor[2]).toBeCloseTo(dirt[2], 4);
  });

  it('rebuilds only the touched side when applyHeightPatches edits a boundary row/col, updating its vertex heights', () => {
    const scene = new THREE.Scene();
    const terrain = new TerrainRenderer(scene);
    terrain.build(makeFlatMap(MAP_SIZE));

    const geomsBefore = {
      west: findSkirt(scene, 'west').geometry,
      east: findSkirt(scene, 'east').geometry,
      north: findSkirt(scene, 'north').geometry,
      south: findSkirt(scene, 'south').geometry,
    };

    // A patch touching tile column x=0 (the west edge) only, away from any corner.
    terrain.applyHeightPatches([
      { x: 0, z: 100, w: 1, h: 3, heights: new Float32Array(3).fill(555) },
    ]);
    terrain.update();

    expect(findSkirt(scene, 'west').geometry).not.toBe(geomsBefore.west);
    expect(findSkirt(scene, 'east').geometry).toBe(geomsBefore.east);
    expect(findSkirt(scene, 'north').geometry).toBe(geomsBefore.north);
    expect(findSkirt(scene, 'south').geometry).toBe(geomsBefore.south);

    expect(columnYs(findSkirt(scene, 'west'), 0, cornerWorld(101))[0]).toBeCloseTo(555, 3);
  });

  it('leaves every skirt mesh untouched (same geometry reference) when a patch stays clear of every boundary row/col', () => {
    const scene = new THREE.Scene();
    const terrain = new TerrainRenderer(scene);
    terrain.build(makeFlatMap(MAP_SIZE));

    const sides = ['west', 'east', 'north', 'south'] as const;
    const geomsBefore = new Map(sides.map((s) => [s, findSkirt(scene, s).geometry]));

    // Comfortably inside the map on every side.
    terrain.applyHeightPatches([
      { x: 100, z: 100, w: 3, h: 3, heights: new Float32Array(9).fill(321) },
    ]);
    terrain.update();

    for (const s of sides) {
      expect(findSkirt(scene, s).geometry).toBe(geomsBefore.get(s));
    }
  });

  it('rebuilds both sides meeting at a corner when a patch touches that corner tile', () => {
    const scene = new THREE.Scene();
    const terrain = new TerrainRenderer(scene);
    terrain.build(makeFlatMap(MAP_SIZE));

    const geomsBefore = {
      west: findSkirt(scene, 'west').geometry,
      north: findSkirt(scene, 'north').geometry,
      east: findSkirt(scene, 'east').geometry,
      south: findSkirt(scene, 'south').geometry,
    };

    // Tile (0,0): the corner tile shared by the west and north sides only.
    terrain.applyHeightPatches([{ x: 0, z: 0, w: 1, h: 1, heights: new Float32Array([88]) }]);
    terrain.update();

    expect(findSkirt(scene, 'west').geometry).not.toBe(geomsBefore.west);
    expect(findSkirt(scene, 'north').geometry).not.toBe(geomsBefore.north);
    expect(findSkirt(scene, 'east').geometry).toBe(geomsBefore.east);
    expect(findSkirt(scene, 'south').geometry).toBe(geomsBefore.south);
  });

  it('rebuilds the mown-color top row when a road is painted adjacent to the map edge (markDirty drives both chunk and skirt)', () => {
    const scene = new THREE.Scene();
    const terrain = new TerrainRenderer(scene);
    terrain.build(makeFlatMapAtHeight(MAP_SIZE, 50));

    const before = findSkirt(scene, 'west').geometry;
    terrain.applyRoadTiles([{ x: 0, z: 20 }]); // road tile sitting directly on the west edge
    terrain.update();

    const west = findSkirt(scene, 'west');
    expect(west.geometry).not.toBe(before);
    const topColor = columnColors(west, 0, cornerWorld(20))[0]!;
    const expectedMown = vertexColorFor(50, 0, 0, 0, cornerWorld(20), true);
    expect(topColor[0]).toBeCloseTo(expectedMown[0], 5);
    expect(topColor[1]).toBeCloseTo(expectedMown[1], 5);
    expect(topColor[2]).toBeCloseTo(expectedMown[2], 5);
  });
});
