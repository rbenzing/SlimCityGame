import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MAP_SIZE, MAX_WATER_DEPTH_VIS, SEA_LEVEL, TILE_METERS } from '../shared/constants';
import { timeOfDayColors } from './scene';
import {
  DEEP_WATER_COLOR,
  DEFAULT_SKY_HORIZON_COLOR,
  DEFAULT_SKY_ZENITH_COLOR,
  FOUL_WATER_COLOR,
  MOON_GLINT_FRACTION,
  OPACITY_AT_GRAZING_ANGLE,
  OPACITY_AT_NORMAL_INCIDENCE,
  SHALLOW_WATER_COLOR,
  SHORELINE_FOAM_DEPTH_M,
  WATER_REBUILD_SETTLE_S,
  WATER_VERTEX_SPACING_M,
  WaterRenderer,
  buildWaterGrid,
  coveredTiles,
  depthColor,
  foamStrength,
  foulMix,
  fouledColor,
  vertexFouling,
  glancingOpacity,
  glintScale,
  glintSpecular,
  reflectedColor,
} from './water';
import { WaterKind, deriveWaterBodies, sampleWater } from '../shared/waterbodies';
import { WAVE_TRAINS } from '../shared/waves';

describe('depthColor', () => {
  it('is the shallow anchor at depth 0', () => {
    expect(depthColor(0)).toEqual([
      SHALLOW_WATER_COLOR[0],
      SHALLOW_WATER_COLOR[1],
      SHALLOW_WATER_COLOR[2],
    ]);
  });

  it('is the deep anchor at depth === MAX_WATER_DEPTH_VIS', () => {
    const c = depthColor(MAX_WATER_DEPTH_VIS);
    expect(c[0]).toBeCloseTo(DEEP_WATER_COLOR[0], 9);
    expect(c[1]).toBeCloseTo(DEEP_WATER_COLOR[1], 9);
    expect(c[2]).toBeCloseTo(DEEP_WATER_COLOR[2], 9);
  });

  it('is the exact midpoint at half depth', () => {
    const mid = depthColor(MAX_WATER_DEPTH_VIS / 2);
    expect(mid[0]).toBeCloseTo((SHALLOW_WATER_COLOR[0] + DEEP_WATER_COLOR[0]) / 2, 5);
    expect(mid[1]).toBeCloseTo((SHALLOW_WATER_COLOR[1] + DEEP_WATER_COLOR[1]) / 2, 5);
    expect(mid[2]).toBeCloseTo((SHALLOW_WATER_COLOR[2] + DEEP_WATER_COLOR[2]) / 2, 5);
  });

  it('saturates to the deep anchor beyond MAX_WATER_DEPTH_VIS', () => {
    expect(depthColor(MAX_WATER_DEPTH_VIS * 5)).toEqual(depthColor(MAX_WATER_DEPTH_VIS));
  });

  it('clamps negative depth to the shallow anchor', () => {
    expect(depthColor(-3)).toEqual(depthColor(0));
  });
});

describe('fouledColor', () => {
  const closeTo = (
    got: readonly [number, number, number],
    want: readonly [number, number, number],
  ): void => {
    for (let i = 0; i < 3; i++) expect(got[i]).toBeCloseTo(want[i]!, 9);
  };

  it('is the depth colour on clean water and the foul brown on water fully fouled', () => {
    closeTo(fouledColor(0, 0), SHALLOW_WATER_COLOR);
    closeTo(fouledColor(MAX_WATER_DEPTH_VIS, 0), DEEP_WATER_COLOR);
    closeTo(fouledColor(3, 1), FOUL_WATER_COLOR);
    closeTo(fouledColor(3, 2), FOUL_WATER_COLOR);
  });

  it('mixes by the square root of the fouling, so a quarter fouled is half brown and a smudge still shows', () => {
    const clean = depthColor(3);
    const quarter = fouledColor(3, 0.25);
    for (let i = 0; i < 3; i++) {
      expect(quarter[i]).toBeCloseTo((clean[i]! + FOUL_WATER_COLOR[i]!) / 2, 9);
    }
    expect(foulMix(0.25)).toBeCloseTo(0.5, 9);
    // Two units of 255 are under 1% of the scale and about 9% of the mix.
    expect(foulMix(2 / 255)).toBeGreaterThan(0.08);
    expect(foulMix(0)).toBe(0);
    expect(foulMix(1)).toBe(1);
  });

  it('reads as a brown: more red than green, more green than blue', () => {
    expect(FOUL_WATER_COLOR[0]).toBeGreaterThan(FOUL_WATER_COLOR[1]);
    expect(FOUL_WATER_COLOR[1]).toBeGreaterThan(FOUL_WATER_COLOR[2]);
  });
});

describe('vertexFouling', () => {
  it('takes the worst of the tiles meeting at the vertex, so a stain never falls between vertices', () => {
    const size = 4;
    const layer = new Uint8Array(size * size);
    layer[1 * size + 1] = 255; // tile (1, 1)
    layer[2 * size + 2] = 51; // tile (2, 2)
    expect(vertexFouling(layer, size, 1, 1)).toBe(1); // corner shared by tiles (0..1, 0..1)
    expect(vertexFouling(layer, size, 2, 2)).toBe(1); // shared by (1..2, 1..2): the worse wins
    expect(vertexFouling(layer, size, 3, 3)).toBeCloseTo(0.2, 9);
    expect(vertexFouling(layer, size, 0, 0)).toBe(0);
  });

  it('reads only the tile a half-tile vertex stands inside, and both tiles on a shared edge', () => {
    const size = 4;
    const layer = new Uint8Array(size * size);
    layer[1 * size + 1] = 255; // tile (1, 1)
    expect(vertexFouling(layer, size, 0.5, 0.5)).toBe(0);
    expect(vertexFouling(layer, size, 1.5, 1.5)).toBe(1);
    expect(vertexFouling(layer, size, 1, 1.5)).toBe(1); // edge between tiles (0,1) and (1,1)
    expect(vertexFouling(layer, size, 0.5, 1.5)).toBe(0);
  });

  it('clamps at the map edge instead of reading off it', () => {
    const size = 2;
    const layer = new Uint8Array([255, 0, 0, 0]);
    expect(vertexFouling(layer, size, 0, 0)).toBe(1);
    expect(vertexFouling(layer, size, 2, 2)).toBe(0);
  });
});

describe('glancingOpacity', () => {
  it('is OPACITY_AT_NORMAL_INCIDENCE straight-on (cosViewAngle=1)', () => {
    expect(glancingOpacity(1)).toBeCloseTo(OPACITY_AT_NORMAL_INCIDENCE, 9);
  });

  it('is OPACITY_AT_GRAZING_ANGLE at grazing incidence (cosViewAngle=0)', () => {
    expect(glancingOpacity(0)).toBeCloseTo(OPACITY_AT_GRAZING_ANGLE, 9);
  });

  it('decreases monotonically as the view angle moves from grazing to straight-on', () => {
    const vals = [0, 0.25, 0.5, 0.75, 1].map((c) => glancingOpacity(c));
    for (let i = 1; i < vals.length; i++) expect(vals[i]!).toBeLessThanOrEqual(vals[i - 1]!);
  });

  it('clamps out-of-range cosViewAngle', () => {
    expect(glancingOpacity(-5)).toBeCloseTo(OPACITY_AT_GRAZING_ANGLE, 9);
    expect(glancingOpacity(5)).toBeCloseTo(OPACITY_AT_NORMAL_INCIDENCE, 9);
  });
});

describe('DEFAULT_SKY_ZENITH_COLOR / DEFAULT_SKY_HORIZON_COLOR', () => {
  it('matches scene.ts noon (day) keyframe exactly, so the surface is never black before the first setSkyColors() call', () => {
    const noon = timeOfDayColors(0.5);
    expect(DEFAULT_SKY_ZENITH_COLOR[0]).toBeCloseTo(noon.skyZenithColor[0], 9);
    expect(DEFAULT_SKY_ZENITH_COLOR[1]).toBeCloseTo(noon.skyZenithColor[1], 9);
    expect(DEFAULT_SKY_ZENITH_COLOR[2]).toBeCloseTo(noon.skyZenithColor[2], 9);
    expect(DEFAULT_SKY_HORIZON_COLOR[0]).toBeCloseTo(noon.skyHorizonColor[0], 9);
    expect(DEFAULT_SKY_HORIZON_COLOR[1]).toBeCloseTo(noon.skyHorizonColor[1], 9);
    expect(DEFAULT_SKY_HORIZON_COLOR[2]).toBeCloseTo(noon.skyHorizonColor[2], 9);
  });
});

describe('reflectedColor', () => {
  const sampleDepthColor: [number, number, number] = [0.1, 0.2, 0.3];
  const zenith = DEFAULT_SKY_ZENITH_COLOR;
  const horizon = DEFAULT_SKY_HORIZON_COLOR;

  it('is deterministic: identical inputs always produce the identical output', () => {
    expect(reflectedColor(0.4, sampleDepthColor, zenith, horizon)).toEqual(
      reflectedColor(0.4, sampleDepthColor, zenith, horizon),
    );
  });

  it('is exactly the depth color straight down (cosView=1: no sky contribution, a mirror at zero grazing)', () => {
    const c = reflectedColor(1, sampleDepthColor, zenith, horizon);
    expect(c[0]).toBeCloseTo(sampleDepthColor[0], 9);
    expect(c[1]).toBeCloseTo(sampleDepthColor[1], 9);
    expect(c[2]).toBeCloseTo(sampleDepthColor[2], 9);
  });

  it('is exactly the horizon color at grazing incidence (cosView=0: full mirror weight)', () => {
    const c = reflectedColor(0, sampleDepthColor, zenith, horizon);
    expect(c[0]).toBeCloseTo(horizon[0], 9);
    expect(c[1]).toBeCloseTo(horizon[1], 9);
    expect(c[2]).toBeCloseTo(horizon[2], 9);
  });

  it('matches a hand-computed lerp at cosView=0.5', () => {
    // sky = lerp(horizon, zenith, 0.5); result = lerp(depthColor, sky, 0.5)
    const sky: [number, number, number] = [
      (horizon[0] + zenith[0]) / 2,
      (horizon[1] + zenith[1]) / 2,
      (horizon[2] + zenith[2]) / 2,
    ];
    const expected: [number, number, number] = [
      (sampleDepthColor[0] + sky[0]) / 2,
      (sampleDepthColor[1] + sky[1]) / 2,
      (sampleDepthColor[2] + sky[2]) / 2,
    ];
    const c = reflectedColor(0.5, sampleDepthColor, zenith, horizon);
    expect(c[0]).toBeCloseTo(expected[0], 9);
    expect(c[1]).toBeCloseTo(expected[1], 9);
    expect(c[2]).toBeCloseTo(expected[2], 9);
  });

  it('trends from bright sky-mirror tones toward the plain depth color as the view steepens from grazing to overhead', () => {
    const nearGrazing = reflectedColor(0.01, sampleDepthColor, zenith, horizon);
    const mid = reflectedColor(0.5, sampleDepthColor, zenith, horizon);
    const nearOverhead = reflectedColor(0.99, sampleDepthColor, zenith, horizon);
    // Default sky horizon is much brighter than the sample depth color on
    // every channel, so the red channel alone is a monotone proxy here.
    expect(nearGrazing[0]).toBeGreaterThan(mid[0]);
    expect(mid[0]).toBeGreaterThan(nearOverhead[0]);
  });

  it('clamps out-of-range cosView', () => {
    expect(reflectedColor(-5, sampleDepthColor, zenith, horizon)).toEqual(
      reflectedColor(0, sampleDepthColor, zenith, horizon),
    );
    expect(reflectedColor(5, sampleDepthColor, zenith, horizon)).toEqual(
      reflectedColor(1, sampleDepthColor, zenith, horizon),
    );
  });
});

describe('foamStrength', () => {
  it('is deterministic: identical inputs always produce the identical output', () => {
    expect(foamStrength(0.3, 5, 6, 1.2)).toBe(foamStrength(0.3, 5, 6, 1.2));
  });

  it('is exactly 0 at and beyond SHORELINE_FOAM_DEPTH_M, for any position/time', () => {
    for (let t = 0; t < 10; t += 1.3) {
      for (let x = 0; x < 100; x += 17) {
        expect(foamStrength(SHORELINE_FOAM_DEPTH_M, x, x * 0.7, t)).toBe(0);
        expect(foamStrength(SHORELINE_FOAM_DEPTH_M + 5, x, x * 0.7, t)).toBe(0);
      }
    }
  });

  it('stays within [0,1] across a broad scan of depth/position/time', () => {
    for (let depth = 0; depth <= 1; depth += 0.1) {
      for (let t = 0; t < 6; t += 1.1) {
        const s = foamStrength(depth, 11, 22, t);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it('is non-increasing in depth at a fixed position/time (the envelope fades toward the depth limit)', () => {
    const depths = [0, 0.2, 0.4, 0.6, 0.8, 1.0];
    const values = depths.map((d) => foamStrength(d, 3, 4, 2.5));
    for (let i = 1; i < values.length; i++)
      expect(values[i]!).toBeLessThanOrEqual(values[i - 1]! + 1e-9);
  });

  it('varies over time at a fixed shallow position (an actual scroll, not a static band)', () => {
    const values = new Set<string>();
    for (let t = 0; t < 10; t += 0.3) values.add(foamStrength(0.2, 10, 10, t).toFixed(6));
    expect(values.size).toBeGreaterThan(1);
  });

  it('varies across space at a fixed shallow depth/time (a scrolling band, not a uniform wash)', () => {
    const values = new Set<string>();
    for (let x = 0; x < 40; x += 3) values.add(foamStrength(0.2, x, 0, 1.5).toFixed(6));
    expect(values.size).toBeGreaterThan(1);
  });
});

describe('glintScale', () => {
  it('is 1 at full day (nightFactor=0)', () => {
    expect(glintScale(0)).toBe(1);
  });

  it('is exactly MOON_GLINT_FRACTION at full night (nightFactor=1)', () => {
    expect(glintScale(1)).toBeCloseTo(MOON_GLINT_FRACTION, 9);
  });

  it('decreases monotonically as nightFactor rises', () => {
    const vals = [0, 0.25, 0.5, 0.75, 1].map((n) => glintScale(n));
    for (let i = 1; i < vals.length; i++) expect(vals[i]!).toBeLessThanOrEqual(vals[i - 1]!);
  });

  it('clamps out-of-range nightFactor', () => {
    expect(glintScale(-2)).toBe(1);
    expect(glintScale(3)).toBeCloseTo(MOON_GLINT_FRACTION, 9);
  });
});

describe('glintSpecular', () => {
  it('is exactly 0 at ndotH=0 (both lobes vanish)', () => {
    expect(glintSpecular(0)).toBe(0);
  });

  it('is deterministic: identical inputs always produce the identical output', () => {
    expect(glintSpecular(0.6)).toBe(glintSpecular(0.6));
  });

  it('increases monotonically as ndotH rises from 0 to 1', () => {
    const vals = [0, 0.2, 0.4, 0.6, 0.8, 1].map((n) => glintSpecular(n));
    for (let i = 1; i < vals.length; i++) expect(vals[i]!).toBeGreaterThanOrEqual(vals[i - 1]!);
  });

  it('is the peak of the sampled domain at ndotH=1', () => {
    const vals = [0, 0.2, 0.4, 0.6, 0.8, 0.99].map((n) => glintSpecular(n));
    for (const v of vals) expect(glintSpecular(1)).toBeGreaterThanOrEqual(v);
  });

  it('is meaningfully non-zero well away from the peak (v2: the broader lobe reads before the tight lobe would)', () => {
    // A single tight (~60-shininess) lobe would be utterly negligible at
    // ndotH=0.7 (0.7**60 ~ 5e-10); v2's added broad lobe keeps the glint
    // track visible here, which is the whole point of the second lobe.
    expect(glintSpecular(0.7)).toBeGreaterThan(1e-4);
  });

  it('clamps out-of-range ndotH', () => {
    expect(glintSpecular(-3)).toBe(glintSpecular(0));
    expect(glintSpecular(7)).toBeCloseTo(glintSpecular(1), 9);
  });
});

describe('WaterRenderer', () => {
  const flatHeightAt = (): number => -5; // uniformly 5m underwater
  const mixedHeightAt = (x: number): number => (x < 32 ? -5 : 20);
  const allWet = (): Uint8Array => new Uint8Array(16).fill(1);
  /** The water mask a height field implies: a tile is water where its centre is below sea level. */
  const maskOf = (height: (x: number, z: number) => number, size: number): Uint8Array => {
    const mask = new Uint8Array(size * size);
    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        mask[z * size + x] =
          height((x + 0.5) * TILE_METERS, (z + 0.5) * TILE_METERS) < SEA_LEVEL ? 1 : 0;
      }
    }
    return mask;
  };

  it('adds exactly one named mesh to the scene, positioned at SEA_LEVEL', () => {
    const scene = new THREE.Scene();
    new WaterRenderer(scene, flatHeightAt, allWet(), 4);
    expect(scene.children.length).toBe(1);
    const mesh = scene.children[0] as THREE.Mesh;
    expect(mesh.name).toBe('water-surface');
    expect(mesh.position.y).toBe(SEA_LEVEL);
  });

  it('sizes the plane to mapSizeTiles * TILE_METERS', () => {
    const scene = new THREE.Scene();
    new WaterRenderer(scene, flatHeightAt, allWet(), 4);
    const mesh = scene.children[0] as THREE.Mesh;
    const position = mesh.geometry.attributes.position!;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < position.count; i++) {
      maxX = Math.max(maxX, position.getX(i));
      maxZ = Math.max(maxZ, position.getZ(i));
    }
    expect(maxX).toBeCloseTo(4 * TILE_METERS, 5);
    expect(maxZ).toBeCloseTo(4 * TILE_METERS, 5);
  });

  it('retints its vertices from the fouling layer, and only the ones a fouled tile meets', () => {
    const scene = new THREE.Scene();
    const renderer = new WaterRenderer(scene, flatHeightAt, allWet(), 4);
    const mesh = scene.children[0] as THREE.Mesh;
    const foul = mesh.geometry.getAttribute('waterFoul');
    expect(foul).toBeDefined();
    const layer = new Uint8Array(16);
    layer[1 * 4 + 1] = 255; // tile (1, 1)
    renderer.setFouling(layer);
    const position = mesh.geometry.attributes.position!;
    let atCorner = -1;
    let atOrigin = -1;
    for (let i = 0; i < position.count; i++) {
      const tx = Math.round(position.getX(i) / TILE_METERS);
      const tz = Math.round(position.getZ(i) / TILE_METERS);
      const onCorner =
        Math.abs(position.getX(i) - TILE_METERS) < 1e-6 &&
        Math.abs(position.getZ(i) - TILE_METERS) < 1e-6;
      if (onCorner && tx === 1 && tz === 1) atCorner = i;
      if (position.getX(i) === 0 && position.getZ(i) === 0) atOrigin = i;
    }
    expect(atCorner).toBeGreaterThanOrEqual(0);
    expect(renderer.foulingAtVertex(atCorner)).toBe(1);
    expect(renderer.foulingAtVertex(atOrigin)).toBe(0);
  });

  it('defaults mapSizeTiles to MAP_SIZE when omitted', () => {
    const scene = new THREE.Scene();
    const mask = new Uint8Array(MAP_SIZE * MAP_SIZE);
    mask[MAP_SIZE * MAP_SIZE - 1] = 1; // the last tile
    new WaterRenderer(scene, flatHeightAt, mask);
    const mesh = scene.children[0] as THREE.Mesh;
    const position = mesh.geometry.attributes.position!;
    let maxX = -Infinity;
    for (let i = 0; i < position.count; i++) maxX = Math.max(maxX, position.getX(i));
    expect(maxX).toBeCloseTo(MAP_SIZE * TILE_METERS, 5);
  });

  it('covers wet tiles and the ring of tiles round them, and nothing else', () => {
    const size = 12;
    const mask = new Uint8Array(size * size);
    mask[5 * size + 5] = 1;
    const covered = coveredTiles(mask, size);
    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        const near = Math.abs(x - 5) <= 1 && Math.abs(z - 5) <= 1;
        expect(covered[z * size + x]).toBe(near ? 1 : 0);
      }
    }
    // 3 x 3 tiles of 2 x 2 squares: 6 x 6 squares, 7 x 7 vertices, two triangles a square.
    const grid = buildWaterGrid(mask, size);
    expect(grid.positions.length / 3).toBe(49);
    expect(grid.indices.length / 3).toBe(72);
    for (let i = 0; i < grid.positions.length; i += 3) {
      expect(grid.positions[i]! % WATER_VERTEX_SPACING_M).toBe(0);
      expect(grid.positions[i]!).toBeGreaterThanOrEqual(4 * TILE_METERS);
      expect(grid.positions[i]!).toBeLessThanOrEqual(7 * TILE_METERS);
      expect(grid.positions[i + 2]!).toBeGreaterThanOrEqual(4 * TILE_METERS);
      expect(grid.positions[i + 2]!).toBeLessThanOrEqual(7 * TILE_METERS);
    }
  });

  it('draws no mesh where there is no water', () => {
    const grid = buildWaterGrid(new Uint8Array(64), 8);
    expect(grid.positions.length).toBe(0);
    expect(grid.indices.length).toBe(0);
  });

  it('faces every triangle up', () => {
    const mask = new Uint8Array(36);
    mask[2 * 6 + 3] = 1;
    const grid = buildWaterGrid(mask, 6);
    for (let t = 0; t < grid.indices.length; t += 3) {
      const [a, b, c] = [grid.indices[t]!, grid.indices[t + 1]!, grid.indices[t + 2]!];
      const ux = grid.positions[b * 3]! - grid.positions[a * 3]!;
      const uz = grid.positions[b * 3 + 2]! - grid.positions[a * 3 + 2]!;
      const vx = grid.positions[c * 3]! - grid.positions[a * 3]!;
      const vz = grid.positions[c * 3 + 2]! - grid.positions[a * 3 + 2]!;
      // y of cross(u, v) is uz*vx - ux*vz; positive faces up.
      expect(uz * vx - ux * vz).toBeGreaterThan(0);
    }
  });

  it('carries fetch, swell and flow attributes equal to the sampled water bodies', () => {
    // A 3-wide strait with open sea on the west edge of a 40-tile map.
    const size = 40;
    const height = (x: number, z: number): number => {
      const tx = Math.floor(x / TILE_METERS);
      const tz = Math.floor(z / TILE_METERS);
      return tx < 8 || (tx < 38 && tz >= 18 && tz <= 20) ? -4 : 10;
    };
    const mask = maskOf(height, size);
    const scene = new THREE.Scene();
    new WaterRenderer(scene, height, mask, size);
    const geometry = (scene.children[0] as THREE.Mesh).geometry;
    const position = geometry.attributes.position!;
    const fetch = geometry.attributes.waterFetch!;
    const swell = geometry.attributes.waterSwell!;
    const flow = geometry.attributes.waterFlow!;
    const depth = geometry.attributes.waterDepth!;
    expect(fetch.count).toBe(position.count);
    expect(swell.itemSize).toBe(2);
    expect(flow.itemSize).toBe(2);
    const bodies = deriveWaterBodies(mask, size, (tx, tz) =>
      height((tx + 0.5) * TILE_METERS, (tz + 0.5) * TILE_METERS),
    );
    let sawSwell = false;
    let sawFlow = false;
    for (let i = 0; i < position.count; i++) {
      const s = sampleWater(bodies, position.getX(i), position.getZ(i));
      expect(Math.abs(fetch.getX(i) - s.fetchM)).toBeLessThanOrEqual(s.fetchM * 1e-6 + 1e-6);
      expect(swell.getX(i)).toBeCloseTo(s.swellX, 5);
      expect(swell.getY(i)).toBeCloseTo(s.swellZ, 5);
      if (depth.getX(i) > 0) {
        expect(flow.getX(i)).toBeCloseTo(s.flowX, 5);
        expect(flow.getY(i)).toBeCloseTo(s.flowZ, 5);
      } else {
        expect(flow.getX(i)).toBe(0);
        expect(flow.getY(i)).toBe(0);
      }
      if (Math.hypot(swell.getX(i), swell.getY(i)) > 0.5) sawSwell = true;
      if (Math.hypot(flow.getX(i), flow.getY(i)) > 0.1) sawFlow = true;
    }
    expect(sawSwell).toBe(true);
    expect(sawFlow).toBe(true);
  });

  it('builds its node graph from the exported train list, every train once', () => {
    const scene = new THREE.Scene();
    const renderer = new WaterRenderer(scene, flatHeightAt, allWet(), 4);
    expect(renderer.graphTrains()).toEqual([...WAVE_TRAINS]);
  });

  describe('when the terrain changes the water', () => {
    const size = 12;
    let ground: Float32Array;
    const heightOf = (x: number, z: number): number =>
      ground[Math.floor(z / TILE_METERS) * size + Math.floor(x / TILE_METERS)] ?? 0;
    const setup = (): { renderer: WaterRenderer; mask: Uint8Array; mesh: THREE.Mesh } => {
      ground = new Float32Array(size * size).fill(5);
      for (let z = 4; z < 8; z++) for (let x = 0; x < size; x++) ground[z * size + x] = -4;
      const mask = maskOf(heightOf, size);
      const scene = new THREE.Scene();
      const renderer = new WaterRenderer(scene, heightOf, mask, size);
      return { renderer, mask, mesh: scene.children[0] as THREE.Mesh };
    };
    /** Depth of the vertex standing on a tile's centre. */
    const depthAtTile = (mesh: THREE.Mesh, tx: number, tz: number): number | undefined => {
      const position = mesh.geometry.attributes.position!;
      const depth = mesh.geometry.attributes.waterDepth!;
      for (let i = 0; i < position.count; i++) {
        if (
          position.getX(i) === (tx + 0.5) * TILE_METERS &&
          position.getZ(i) === (tz + 0.5) * TILE_METERS
        )
          return depth.getX(i);
      }
      return undefined;
    };
    /** A player digs the bank tile (6, 3) down to 6 m below sea level, as clientgrid does to heights and mask. */
    const dig = (mask: Uint8Array): void => {
      ground[3 * size + 6] = -6;
      mask[3 * size + 6] = 1;
    };

    it('keeps the old depth until the edits settle, then draws the dug tile with its new depth and kind', () => {
      const { renderer, mask, mesh } = setup();
      expect(renderer.kindAt(6, 3)).toBe(WaterKind.None);
      expect(depthAtTile(mesh, 6, 3)).toBe(0);

      dig(mask);
      renderer.markTerrainChanged();
      renderer.update(WATER_REBUILD_SETTLE_S * 1000 * 0.9, 0);
      expect(renderer.kindAt(6, 3)).toBe(WaterKind.None);
      expect(depthAtTile(mesh, 6, 3)).toBe(0);

      renderer.update(WATER_REBUILD_SETTLE_S * 1000 * 0.2, 0);
      expect(renderer.kindAt(6, 3)).toBe(WaterKind.Lake);
      expect(depthAtTile(mesh, 6, 3)).toBeCloseTo(6, 5);
    });

    it('waits for a further edit to settle too: each edit restarts the wait', () => {
      const { renderer, mask, mesh } = setup();
      dig(mask);
      renderer.markTerrainChanged();
      renderer.update(400, 0);
      renderer.markTerrainChanged();
      renderer.update(400, 0);
      expect(depthAtTile(mesh, 6, 3)).toBe(0);
      renderer.update(150, 0);
      expect(depthAtTile(mesh, 6, 3)).toBeCloseTo(6, 5);
    });

    it('does not rebuild when nothing changed', () => {
      const { renderer, mesh } = setup();
      const before = mesh.geometry;
      renderer.update(5000, 0);
      expect(mesh.geometry).toBe(before);
    });

    it('keeps the fouling it was given across a rebuild', () => {
      const { renderer, mask, mesh } = setup();
      const foul = new Uint8Array(size * size);
      foul[5 * size + 5] = 255;
      renderer.setFouling(foul);
      dig(mask);
      renderer.markTerrainChanged();
      renderer.update(600, 0);
      const position = mesh.geometry.attributes.position!;
      let stained = 0;
      for (let i = 0; i < position.count; i++) {
        if (renderer.foulingAtVertex(i) !== 1) continue;
        stained++;
        // Every stained vertex lies on the fouled tile, its boundary included.
        expect(position.getX(i)).toBeGreaterThanOrEqual(5 * TILE_METERS);
        expect(position.getX(i)).toBeLessThanOrEqual(6 * TILE_METERS);
        expect(position.getZ(i)).toBeGreaterThanOrEqual(5 * TILE_METERS);
        expect(position.getZ(i)).toBeLessThanOrEqual(6 * TILE_METERS);
      }
      expect(stained).toBe(9); // the tile's 3 x 3 vertices at half-tile spacing
    });
  });

  it('carries a waterDepth vertex attribute from the injected heightAt sampler', () => {
    const scene = new THREE.Scene();
    new WaterRenderer(scene, mixedHeightAt, maskOf(mixedHeightAt, 4), 4);
    const mesh = scene.children[0] as THREE.Mesh;
    const position = mesh.geometry.attributes.position!;
    const depth = mesh.geometry.attributes.waterDepth!;
    expect(depth.count).toBe(position.count);

    let sawDeep = false;
    let sawDry = false;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const d = depth.getX(i);
      if (x < 32) {
        expect(d).toBeCloseTo(5, 5); // SEA_LEVEL(0) - (-5)
        sawDeep = true;
      } else {
        expect(d).toBe(0); // dry land clamps to 0 (occluded by terrain anyway)
        sawDry = true;
      }
    }
    expect(sawDeep).toBe(true);
    expect(sawDry).toBe(true);
  });

  it('setVisible toggles the mesh visibility', () => {
    const scene = new THREE.Scene();
    const water = new WaterRenderer(scene, flatHeightAt, allWet(), 4);
    const mesh = scene.children[0] as THREE.Mesh;
    expect(mesh.visible).toBe(true);
    water.setVisible(false);
    expect(mesh.visible).toBe(false);
    water.setVisible(true);
    expect(mesh.visible).toBe(true);
  });

  it('update() accumulates elapsed time from dtMs (in seconds)', () => {
    const scene = new THREE.Scene();
    const water = new WaterRenderer(scene, flatHeightAt, allWet(), 4);
    expect(water.elapsedSeconds()).toBe(0);
    water.update(500, 0);
    expect(water.elapsedSeconds()).toBeCloseTo(0.5, 9);
    water.update(250, 0);
    expect(water.elapsedSeconds()).toBeCloseTo(0.75, 9);
  });

  it('pinClock holds the clock at a time, whatever frames pass, until it is released', () => {
    const scene = new THREE.Scene();
    const water = new WaterRenderer(scene, flatHeightAt, allWet(), 4);
    water.pinClock(12.5);
    water.update(1000, 0);
    water.update(1000, 0);
    expect(water.elapsedSeconds()).toBe(12.5);
    water.pinClock(null);
    water.update(500, 0);
    expect(water.elapsedSeconds()).toBeCloseTo(13, 9);
  });

  it('update() ignores negative dtMs rather than rewinding the clock', () => {
    const scene = new THREE.Scene();
    const water = new WaterRenderer(scene, flatHeightAt, allWet(), 4);
    water.update(1000, 0);
    const before = water.elapsedSeconds();
    water.update(-500, 0);
    expect(water.elapsedSeconds()).toBe(before);
  });

  it('update() does not throw across in-range and out-of-range nightFactor values', () => {
    const scene = new THREE.Scene();
    const water = new WaterRenderer(scene, flatHeightAt, allWet(), 4);
    for (const nf of [-3, 0, 0.4, 1, 6]) {
      expect(() => water.update(16, nf)).not.toThrow();
    }
  });

  it('works without any DirectionalLight in the scene (falls back gracefully)', () => {
    const scene = new THREE.Scene();
    expect(() => {
      const water = new WaterRenderer(scene, flatHeightAt, allWet(), 4);
      water.update(16, 0.5);
    }).not.toThrow();
  });

  it('tracks a DirectionalLight already present in the scene without throwing', () => {
    const scene = new THREE.Scene();
    const sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.position.set(10, 20, 5);
    scene.add(sun.target);
    scene.add(sun);
    const water = new WaterRenderer(scene, flatHeightAt, allWet(), 4);
    expect(() => water.update(16, 0.1)).not.toThrow();
  });

  it('material is translucent and does not write depth (matches the flat-plane water it replaces)', () => {
    const scene = new THREE.Scene();
    new WaterRenderer(scene, flatHeightAt, allWet(), 4);
    const mesh = scene.children[0] as THREE.Mesh;
    const material = mesh.material as THREE.Material;
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
  });

  it('does not leak meshes across repeated update() calls', () => {
    const scene = new THREE.Scene();
    const water = new WaterRenderer(scene, flatHeightAt, allWet(), 4);
    for (let i = 0; i < 20; i++) water.update(16, 0.3);
    expect(scene.children.length).toBe(1);
  });

  it('setSkyColors accepts zenith/horizon RGB tuples without throwing', () => {
    const scene = new THREE.Scene();
    const water = new WaterRenderer(scene, flatHeightAt, allWet(), 4);
    expect(() => water.setSkyColors([0.1, 0.2, 0.9], [0.8, 0.85, 0.95])).not.toThrow();
  });

  it('setSkyColors can be called every frame alongside update() without throwing or leaking meshes', () => {
    const scene = new THREE.Scene();
    const water = new WaterRenderer(scene, flatHeightAt, allWet(), 4);
    for (let i = 0; i < 10; i++) {
      water.setSkyColors([0.05 * i, 0.2, 0.3], [0.5, 0.6, 0.05 * i]);
      water.update(16, i / 10);
    }
    expect(scene.children.length).toBe(1);
  });

  it('setSkyColors does not throw for out-of-range (unclamped) color components', () => {
    const scene = new THREE.Scene();
    const water = new WaterRenderer(scene, flatHeightAt, allWet(), 4);
    expect(() => water.setSkyColors([-1, 2, 0], [3, -2, 1])).not.toThrow();
  });
});
