// @vitest-environment jsdom
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TICKS_PER_DAY } from '../shared/constants';
import {
  CLOUD_COVERAGE_PERIOD_TICKS,
  CLOUD_POOL_SIZE,
  CloudLayer,
  cloudCoverage,
  cloudTint,
  PUFF_TEXTURE_SIZE,
  PUFF_VARIANT_SEEDS,
  puffTexturePixels,
  wrapCloudCoordinate,
} from './clouds';

// CloudLayer bakes its puff textures via canvas once at construction. jsdom
// has no canvas 2D backend (no optional `canvas` npm package installed):
// getContext('2d') returns null but first logs a benign "Not implemented"
// notice straight to the terminal (mirrors pin.test.ts's MapPin setup
// exactly). CloudLayer already guards a null context correctly either way;
// stub getContext so test output stays readable without changing what's
// under test.
let getContextSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  getContextSpy.mockRestore();
});

function simpleHash(bytes: Uint8ClampedArray): number {
  let h = 2166136261;
  for (let i = 0; i < bytes.length; i++) {
    h = Math.imul(h ^ bytes[i]!, 16777619);
  }
  return h >>> 0;
}

describe('puffTexturePixels (pure)', () => {
  it('returns size*size*4 bytes (RGBA)', () => {
    const pixels = puffTexturePixels(1, 16);
    expect(pixels.length).toBe(16 * 16 * 4);
  });

  it('is deterministic: same seed always produces an identical pixel buffer (and hash)', () => {
    const a = puffTexturePixels(42, 24);
    const b = puffTexturePixels(42, 24);
    expect(a).toEqual(b);
    expect(simpleHash(a)).toBe(simpleHash(b));
  });

  it('never uses Math.random (repeated calls in the same process stay identical)', () => {
    const runs = [puffTexturePixels(7, 20), puffTexturePixels(7, 20), puffTexturePixels(7, 20)];
    expect(runs[1]).toEqual(runs[0]);
    expect(runs[2]).toEqual(runs[0]);
  });

  it('produces a different pixel buffer (and hash) for a different seed', () => {
    const a = puffTexturePixels(1, 24);
    const b = puffTexturePixels(2, 24);
    expect(a).not.toEqual(b);
    expect(simpleHash(a)).not.toBe(simpleHash(b));
  });

  it('varies alpha across the image (a real puff silhouette, not a blank/solid image)', () => {
    const pixels = puffTexturePixels(3, PUFF_TEXTURE_SIZE);
    let minAlpha = 255;
    let maxAlpha = 0;
    for (let i = 3; i < pixels.length; i += 4) {
      minAlpha = Math.min(minAlpha, pixels[i]!);
      maxAlpha = Math.max(maxAlpha, pixels[i]!);
    }
    expect(maxAlpha).toBeGreaterThan(minAlpha);
    expect(maxAlpha).toBeGreaterThan(100);
  });

  it('shades the top of the texture lighter than the bottom (grey underside gradient)', () => {
    const size = PUFF_TEXTURE_SIZE;
    const pixels = puffTexturePixels(5, size);
    const col = Math.floor(size / 2);
    const topIndex = (0 * size + col) * 4;
    const bottomIndex = ((size - 1) * size + col) * 4;
    expect(pixels[topIndex]!).toBeGreaterThan(pixels[bottomIndex]!);
  });

  it('defaults line up with the exported PUFF_TEXTURE_SIZE / PUFF_VARIANT_SEEDS constants', () => {
    expect(PUFF_VARIANT_SEEDS.length).toBeGreaterThanOrEqual(2);
    expect(PUFF_VARIANT_SEEDS.length).toBeLessThanOrEqual(3);
    const pixels = puffTexturePixels(PUFF_VARIANT_SEEDS[0]!);
    expect(pixels.length).toBe(PUFF_TEXTURE_SIZE * PUFF_TEXTURE_SIZE * 4);
  });
});

describe('cloudCoverage (pure)', () => {
  it('CLOUD_COVERAGE_PERIOD_TICKS is exactly a 10-game-day period', () => {
    expect(CLOUD_COVERAGE_PERIOD_TICKS).toBe(TICKS_PER_DAY * 10);
  });

  it('stays within [0,1] across many ticks', () => {
    for (let i = 0; i <= 50; i++) {
      const tick = i * 137;
      const v = cloudCoverage(tick);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic: identical tick reproduces identical coverage', () => {
    expect(cloudCoverage(12345)).toBe(cloudCoverage(12345));
  });

  it('never uses Math.random (repeated calls in the same process stay identical)', () => {
    const runs = [cloudCoverage(999), cloudCoverage(999), cloudCoverage(999)];
    expect(runs[1]).toBe(runs[0]);
    expect(runs[2]).toBe(runs[0]);
  });

  it('is periodic with period CLOUD_COVERAGE_PERIOD_TICKS', () => {
    for (const tick of [0, 250, 900, 1500]) {
      expect(cloudCoverage(tick)).toBeCloseTo(cloudCoverage(tick + CLOUD_COVERAGE_PERIOD_TICKS), 6);
      expect(cloudCoverage(tick)).toBeCloseTo(
        cloudCoverage(tick + CLOUD_COVERAGE_PERIOD_TICKS * 3),
        6,
      );
    }
  });

  it('varies meaningfully across one period ("sometimes cloudy", not a constant)', () => {
    let min = 1;
    let max = 0;
    const samples = 40;
    for (let i = 0; i < samples; i++) {
      const tick = (i / samples) * CLOUD_COVERAGE_PERIOD_TICKS;
      const v = cloudCoverage(tick);
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(max - min).toBeGreaterThan(0.2);
  });
});

describe('wrapCloudCoordinate (pure)', () => {
  const mapMeters = 100;
  const margin = 10;

  it('passes values already inside [-margin, mapMeters+margin) through unchanged', () => {
    expect(wrapCloudCoordinate(0, mapMeters, margin)).toBeCloseTo(0, 9);
    expect(wrapCloudCoordinate(50, mapMeters, margin)).toBeCloseTo(50, 9);
    expect(wrapCloudCoordinate(-5, mapMeters, margin)).toBeCloseTo(-5, 9);
  });

  it('wraps a value past the top edge back around to the bottom edge', () => {
    // 115 is 5 past the top edge (mapMeters+margin=110); should reappear 5
    // past the bottom edge (-margin=-10).
    expect(wrapCloudCoordinate(115, mapMeters, margin)).toBeCloseTo(-5, 9);
  });

  it('wraps a value past the bottom edge back around to the top edge', () => {
    // -15 is 5 past the bottom edge (-margin=-10); should reappear 5 short of
    // the top edge (mapMeters+margin=110).
    expect(wrapCloudCoordinate(-15, mapMeters, margin)).toBeCloseTo(105, 9);
  });

  it('is exactly periodic with period (mapMeters + margin*2)', () => {
    const span = mapMeters + margin * 2;
    for (const v of [0, 33, -7, 250, -400]) {
      expect(wrapCloudCoordinate(v, mapMeters, margin)).toBeCloseTo(
        wrapCloudCoordinate(v + span, mapMeters, margin),
        9,
      );
    }
  });

  it('always returns a value within [-margin, mapMeters+margin)', () => {
    for (const v of [-1000, -123, 0, 57, 999, 12345]) {
      const wrapped = wrapCloudCoordinate(v, mapMeters, margin);
      expect(wrapped).toBeGreaterThanOrEqual(-margin);
      expect(wrapped).toBeLessThan(mapMeters + margin);
    }
  });
});

describe('cloudTint (pure)', () => {
  it('is bright and near-neutral (white) at noon (t=0.5), with opacityMultiplier near 1', () => {
    const tint = cloudTint(0.5);
    const maxChannel = Math.max(...tint.color);
    const minChannel = Math.min(...tint.color);
    expect(minChannel).toBeGreaterThan(0.85);
    expect(maxChannel - minChannel).toBeLessThan(0.15);
    expect(tint.opacityMultiplier).toBeCloseTo(1, 5);
  });

  it('warms toward orange near dusk relative to noon', () => {
    const noon = cloudTint(0.5);
    const dusk = cloudTint(0.75);
    const warmthOf = (c: readonly [number, number, number]): number => c[0] - c[2];
    expect(warmthOf(dusk.color)).toBeGreaterThan(warmthOf(noon.color));
  });

  it('fades toward near-invisible at night (t=0)', () => {
    const tint = cloudTint(0);
    expect(tint.opacityMultiplier).toBeLessThan(0.15);
    expect(tint.opacityMultiplier).toBeGreaterThanOrEqual(0);
  });

  it('keeps opacityMultiplier within [0,1] across a full day/night cycle', () => {
    for (let i = 0; i <= 24; i++) {
      const tint = cloudTint(i / 24);
      expect(tint.opacityMultiplier).toBeGreaterThanOrEqual(0);
      expect(tint.opacityMultiplier).toBeLessThanOrEqual(1);
    }
  });
});

describe('CloudLayer', () => {
  it('is safe to construct despite jsdom returning a null 2D context, adding instanced meshes covering the full pool', () => {
    const scene = new THREE.Scene();
    expect(() => new CloudLayer(scene)).not.toThrow();

    const layer = new CloudLayer(scene);
    expect(layer.poolSize()).toBe(CLOUD_POOL_SIZE);
    const total = layer.meshes.reduce((sum, m) => sum + m.count, 0);
    expect(total).toBe(CLOUD_POOL_SIZE);
    expect(layer.meshes.length).toBe(PUFF_VARIANT_SEEDS.length);
    for (const mesh of layer.meshes) {
      expect(scene.children).toContain(mesh);
      expect(mesh.isInstancedMesh).toBe(true);
    }
  });

  it('update() never throws across a range of ticks/dt/timeOfDay', () => {
    const scene = new THREE.Scene();
    const layer = new CloudLayer(scene);
    for (let i = 0; i < 10; i++) {
      expect(() => layer.update(16, i * 500, i / 10)).not.toThrow();
    }
  });

  it('activeCount always matches round(coverage * poolSize), in range', () => {
    const scene = new THREE.Scene();
    const layer = new CloudLayer(scene);
    for (const tick of [0, 777, 4321, 50000]) {
      layer.update(16, tick, 0.5);
      expect(layer.coverage()).toBe(cloudCoverage(tick));
      expect(layer.activeCount()).toBe(Math.round(layer.coverage() * CLOUD_POOL_SIZE));
      expect(layer.activeCount()).toBeGreaterThanOrEqual(0);
      expect(layer.activeCount()).toBeLessThanOrEqual(CLOUD_POOL_SIZE);
    }
  });

  it('accumulates drift over elapsed time, deterministically, and stays put when dt is 0', () => {
    const sceneA = new THREE.Scene();
    const layerA = new CloudLayer(sceneA);
    layerA.update(0, 0, 0.5);
    const start = layerA.driftOffset();
    layerA.update(0, 0, 0.5);
    expect(layerA.driftOffset()).toEqual(start); // dt=0 -> no movement

    layerA.update(2000, 0, 0.5);
    const moved = layerA.driftOffset();
    expect(moved).not.toEqual(start);

    // Deterministic: an identical dt sequence from a fresh instance reproduces the same drift.
    const sceneB = new THREE.Scene();
    const layerB = new CloudLayer(sceneB);
    layerB.update(0, 0, 0.5);
    layerB.update(0, 0, 0.5);
    layerB.update(2000, 0, 0.5);
    expect(layerB.driftOffset()).toEqual(moved);
  });

  it('tints its materials from the time-of-day ramp: warmer near dusk than at noon', () => {
    const scene = new THREE.Scene();
    const layer = new CloudLayer(scene);
    layer.update(16, 1000, 0.5); // noon
    const noonColor = (layer.meshes[0]!.material as THREE.MeshBasicMaterial).color.clone();
    layer.update(16, 1000, 0.75); // dusk
    const duskColor = (layer.meshes[0]!.material as THREE.MeshBasicMaterial).color.clone();
    expect(duskColor.r - duskColor.b).toBeGreaterThan(noonColor.r - noonColor.b);
  });

  it('fades material opacity toward near-invisible at night relative to noon', () => {
    const scene = new THREE.Scene();
    const layer = new CloudLayer(scene);
    layer.update(16, 1000, 0.5); // noon
    const noonOpacity = (layer.meshes[0]!.material as THREE.MeshBasicMaterial).opacity;
    layer.update(16, 1000, 0); // midnight
    const nightOpacity = (layer.meshes[0]!.material as THREE.MeshBasicMaterial).opacity;
    expect(nightOpacity).toBeLessThan(noonOpacity);
  });
});

describe('CloudLayer frustum culling (wave 6)', () => {
  it('disables frustum culling on every puff mesh (the layer drifts unboundedly with the wind)', () => {
    const scene = new THREE.Scene();
    new CloudLayer(scene);
    const meshes = scene.children.filter(
      (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh,
    );
    expect(meshes.length).toBeGreaterThan(0);
    for (const mesh of meshes) expect(mesh.frustumCulled).toBe(false);
  });
});
