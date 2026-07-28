import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MAP_SIZE, MAX_WATER_DEPTH_VIS, SEA_LEVEL, TILE_METERS } from '../shared/constants';
import { timeOfDayColors } from './scene';
import {
  DEEP_WATER_COLOR,
  DEFAULT_SKY_HORIZON_COLOR,
  DEFAULT_SKY_ZENITH_COLOR,
  MOON_GLINT_FRACTION,
  OPACITY_AT_GRAZING_ANGLE,
  OPACITY_AT_NORMAL_INCIDENCE,
  SHALLOW_WATER_COLOR,
  SHORELINE_FOAM_DEPTH_M,
  SWELL_AMPLITUDE_BUDGET_M,
  SWELL_LAYERS,
  WAVE_NORMAL_LAYERS,
  WaterRenderer,
  depthColor,
  foamStrength,
  glancingOpacity,
  glintScale,
  glintSpecular,
  reflectedColor,
  swellHeight,
  waveNormalTilt,
} from './water';

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

describe('swellHeight', () => {
  it('is deterministic: identical inputs always produce the identical output', () => {
    expect(swellHeight(12, 34, 5.6)).toBe(swellHeight(12, 34, 5.6));
  });

  it('stays within +-SWELL_AMPLITUDE_BUDGET_M across a broad scan of position and time (v2: budget raised 0.15m -> 0.35m by the added long-wavelength chop layer)', () => {
    for (let t = 0; t < 20; t += 0.7) {
      for (let x = 0; x < 300; x += 37) {
        const h = swellHeight(x, x * 0.5, t);
        expect(h).toBeGreaterThanOrEqual(-SWELL_AMPLITUDE_BUDGET_M - 1e-9);
        expect(h).toBeLessThanOrEqual(SWELL_AMPLITUDE_BUDGET_M + 1e-9);
      }
    }
  });

  it('varies over time at a fixed position (an actual animation, not a static offset)', () => {
    const values = new Set<string>();
    for (let t = 0; t < 10; t += 0.3) values.add(swellHeight(10, 10, t).toFixed(6));
    expect(values.size).toBeGreaterThan(1);
  });

  it('varies across space at a fixed time (not a uniform whole-plane bob)', () => {
    const values = new Set<string>();
    for (let x = 0; x < 400; x += 23) values.add(swellHeight(x, 0, 3.14).toFixed(6));
    expect(values.size).toBeGreaterThan(1);
  });
});

describe('SWELL_LAYERS (v2 long-wavelength chop layer)', () => {
  it('has three layers whose amplitudes sum to exactly SWELL_AMPLITUDE_BUDGET_M', () => {
    expect(SWELL_LAYERS.length).toBe(3);
    const sum = SWELL_LAYERS.reduce((acc, layer) => acc + layer.amplitude, 0);
    expect(sum).toBeCloseTo(SWELL_AMPLITUDE_BUDGET_M, 9);
  });

  it('includes a long-wavelength (35-60m) chop layer distinct from the original shorter layers', () => {
    const longLayers = SWELL_LAYERS.filter(
      (layer) => layer.wavelength >= 35 && layer.wavelength <= 60,
    );
    expect(longLayers.length).toBeGreaterThanOrEqual(1);
  });
});

describe('waveNormalTilt', () => {
  it('is deterministic: identical inputs always produce the identical output', () => {
    expect(waveNormalTilt(5, 6, 1.2)).toEqual(waveNormalTilt(5, 6, 1.2));
  });

  it('varies over time at a fixed position', () => {
    const values = new Set<string>();
    for (let t = 0; t < 10; t += 0.3) values.add(waveNormalTilt(4, 4, t).join(','));
    expect(values.size).toBeGreaterThan(1);
  });

  it('returns finite, bounded components', () => {
    for (let t = 0; t < 8; t += 0.9) {
      const [tiltX, tiltZ] = waveNormalTilt(11, 22, t);
      expect(Number.isFinite(tiltX)).toBe(true);
      expect(Number.isFinite(tiltZ)).toBe(true);
      expect(Math.abs(tiltX)).toBeLessThanOrEqual(1);
      expect(Math.abs(tiltZ)).toBeLessThanOrEqual(1);
    }
  });
});

describe('WAVE_NORMAL_LAYERS (v2 long-wavelength chop layer)', () => {
  it('has three layers', () => {
    expect(WAVE_NORMAL_LAYERS.length).toBe(3);
  });

  it('includes a long-wavelength (35-60m) chop layer distinct from the original 7-11m ripples', () => {
    const longLayers = WAVE_NORMAL_LAYERS.filter(
      (layer) => layer.wavelength >= 35 && layer.wavelength <= 60,
    );
    expect(longLayers.length).toBeGreaterThanOrEqual(1);
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

  it('adds exactly one named mesh to the scene, positioned at SEA_LEVEL', () => {
    const scene = new THREE.Scene();
    new WaterRenderer(scene, flatHeightAt, 4);
    expect(scene.children.length).toBe(1);
    const mesh = scene.children[0] as THREE.Mesh;
    expect(mesh.name).toBe('water-surface');
    expect(mesh.position.y).toBe(SEA_LEVEL);
  });

  it('sizes the plane to mapSizeTiles * TILE_METERS', () => {
    const scene = new THREE.Scene();
    new WaterRenderer(scene, flatHeightAt, 4);
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

  it('defaults mapSizeTiles to MAP_SIZE when omitted', () => {
    const scene = new THREE.Scene();
    new WaterRenderer(scene, flatHeightAt);
    const mesh = scene.children[0] as THREE.Mesh;
    const position = mesh.geometry.attributes.position!;
    let maxX = -Infinity;
    for (let i = 0; i < position.count; i++) maxX = Math.max(maxX, position.getX(i));
    expect(maxX).toBeCloseTo(MAP_SIZE * TILE_METERS, 5);
  });

  it('bakes a waterDepth vertex attribute from the injected heightAt sampler', () => {
    const scene = new THREE.Scene();
    new WaterRenderer(scene, mixedHeightAt, 4);
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
    const water = new WaterRenderer(scene, flatHeightAt, 4);
    const mesh = scene.children[0] as THREE.Mesh;
    expect(mesh.visible).toBe(true);
    water.setVisible(false);
    expect(mesh.visible).toBe(false);
    water.setVisible(true);
    expect(mesh.visible).toBe(true);
  });

  it('update() accumulates elapsed time from dtMs (in seconds)', () => {
    const scene = new THREE.Scene();
    const water = new WaterRenderer(scene, flatHeightAt, 4);
    expect(water.elapsedSeconds()).toBe(0);
    water.update(500, 0);
    expect(water.elapsedSeconds()).toBeCloseTo(0.5, 9);
    water.update(250, 0);
    expect(water.elapsedSeconds()).toBeCloseTo(0.75, 9);
  });

  it('update() ignores negative dtMs rather than rewinding the clock', () => {
    const scene = new THREE.Scene();
    const water = new WaterRenderer(scene, flatHeightAt, 4);
    water.update(1000, 0);
    const before = water.elapsedSeconds();
    water.update(-500, 0);
    expect(water.elapsedSeconds()).toBe(before);
  });

  it('update() does not throw across in-range and out-of-range nightFactor values', () => {
    const scene = new THREE.Scene();
    const water = new WaterRenderer(scene, flatHeightAt, 4);
    for (const nf of [-3, 0, 0.4, 1, 6]) {
      expect(() => water.update(16, nf)).not.toThrow();
    }
  });

  it('works without any DirectionalLight in the scene (falls back gracefully)', () => {
    const scene = new THREE.Scene();
    expect(() => {
      const water = new WaterRenderer(scene, flatHeightAt, 4);
      water.update(16, 0.5);
    }).not.toThrow();
  });

  it('tracks a DirectionalLight already present in the scene without throwing', () => {
    const scene = new THREE.Scene();
    const sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.position.set(10, 20, 5);
    scene.add(sun.target);
    scene.add(sun);
    const water = new WaterRenderer(scene, flatHeightAt, 4);
    expect(() => water.update(16, 0.1)).not.toThrow();
  });

  it('material is translucent and does not write depth (matches the flat-plane water it replaces)', () => {
    const scene = new THREE.Scene();
    new WaterRenderer(scene, flatHeightAt, 4);
    const mesh = scene.children[0] as THREE.Mesh;
    const material = mesh.material as THREE.Material;
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
  });

  it('does not leak meshes across repeated update() calls', () => {
    const scene = new THREE.Scene();
    const water = new WaterRenderer(scene, flatHeightAt, 4);
    for (let i = 0; i < 20; i++) water.update(16, 0.3);
    expect(scene.children.length).toBe(1);
  });

  it('setSkyColors accepts zenith/horizon RGB tuples without throwing', () => {
    const scene = new THREE.Scene();
    const water = new WaterRenderer(scene, flatHeightAt, 4);
    expect(() => water.setSkyColors([0.1, 0.2, 0.9], [0.8, 0.85, 0.95])).not.toThrow();
  });

  it('setSkyColors can be called every frame alongside update() without throwing or leaking meshes', () => {
    const scene = new THREE.Scene();
    const water = new WaterRenderer(scene, flatHeightAt, 4);
    for (let i = 0; i < 10; i++) {
      water.setSkyColors([0.05 * i, 0.2, 0.3], [0.5, 0.6, 0.05 * i]);
      water.update(16, i / 10);
    }
    expect(scene.children.length).toBe(1);
  });

  it('setSkyColors does not throw for out-of-range (unclamped) color components', () => {
    const scene = new THREE.Scene();
    const water = new WaterRenderer(scene, flatHeightAt, 4);
    expect(() => water.setSkyColors([-1, 2, 0], [3, -2, 1])).not.toThrow();
  });
});
