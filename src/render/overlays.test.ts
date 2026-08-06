import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FieldId, type ZonePatch } from '../shared/types';
import { MAP_SIZE } from '../shared/constants';
import { coverageColor, OverlayRenderer, rampColor } from './overlays';

describe('rampColor', () => {
  it('is blue-dominant at 0 and red-dominant at 255', () => {
    const low = rampColor(0);
    const high = rampColor(255);
    expect(low[2]).toBeGreaterThan(low[0]);
    expect(high[0]).toBeGreaterThan(high[2]);
  });

  it('clamps out-of-range inputs to the endpoints', () => {
    expect(rampColor(-50)).toEqual(rampColor(0));
    expect(rampColor(500)).toEqual(rampColor(255));
  });

  it('has non-decreasing red and non-increasing blue across the range (monotonic blue->green->yellow->red hue rotation)', () => {
    const samples = [0, 20, 42, 64, 85, 110, 128, 150, 170, 200, 220, 255];
    let prevR = -Infinity;
    let prevB = Infinity;
    for (const v of samples) {
      const [r, , b] = rampColor(v);
      expect(r).toBeGreaterThanOrEqual(prevR - 1e-9);
      expect(b).toBeLessThanOrEqual(prevB + 1e-9);
      prevR = r;
      prevB = b;
    }
  });

  it('stays within [0,1] for every channel across the range', () => {
    for (let v = 0; v <= 255; v += 5) {
      const [r, g, b] = rampColor(v);
      for (const c of [r, g, b]) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('OverlayRenderer', () => {
  const getTextureData = (scene: THREE.Scene): Uint8Array => {
    const mesh = scene.children[0] as THREE.Mesh;
    const material = mesh.material as THREE.MeshBasicMaterial;
    const texture = material.map as THREE.DataTexture;
    return texture.image.data as Uint8Array;
  };

  it('adds exactly one mesh to the scene, hidden until a field is active', () => {
    const scene = new THREE.Scene();
    new OverlayRenderer(scene);
    expect(scene.children.length).toBe(1);
    expect(scene.children[0]!.visible).toBe(false);
  });

  it('setActive toggles mesh visibility', () => {
    const scene = new THREE.Scene();
    const overlay = new OverlayRenderer(scene);
    overlay.setActive(FieldId.Pollution);
    expect(scene.children[0]!.visible).toBe(true);
    overlay.setActive(null);
    expect(scene.children[0]!.visible).toBe(false);
  });

  it('setFieldData is a no-op when the field does not match the active field', () => {
    const scene = new THREE.Scene();
    const overlay = new OverlayRenderer(scene);
    overlay.setActive(FieldId.Traffic);
    const before = Array.from(getTextureData(scene));

    const data = new Uint8Array(MAP_SIZE * MAP_SIZE).fill(255);
    overlay.setFieldData(FieldId.Pollution, data); // different field: must not touch the texture
    const after = Array.from(getTextureData(scene));
    expect(after).toEqual(before);
  });

  it('setFieldData ramps and writes the texture when the field matches active', () => {
    const scene = new THREE.Scene();
    const overlay = new OverlayRenderer(scene);
    overlay.setActive(FieldId.Traffic);

    const data = new Uint8Array(MAP_SIZE * MAP_SIZE).fill(255);
    overlay.setFieldData(FieldId.Traffic, data);

    const bytes = getTextureData(scene);
    const expected = rampColor(255);
    expect(bytes[0]).toBe(Math.round(expected[0] * 255));
    expect(bytes[1]).toBe(Math.round(expected[1] * 255));
    expect(bytes[2]).toBe(Math.round(expected[2] * 255));
    expect(bytes[3]).toBe(255);

    const lastBase = (MAP_SIZE * MAP_SIZE - 1) * 4;
    expect(bytes[lastBase]).toBe(Math.round(expected[0] * 255));
  });

  it('reflects non-uniform field data per tile', () => {
    const scene = new THREE.Scene();
    const overlay = new OverlayRenderer(scene);
    overlay.setActive(FieldId.LandValue);

    const data = new Uint8Array(MAP_SIZE * MAP_SIZE);
    data[0] = 0;
    data[1] = 255;
    overlay.setFieldData(FieldId.LandValue, data);

    const bytes = getTextureData(scene);
    const low = rampColor(0);
    const high = rampColor(255);
    expect(bytes[0]).toBe(Math.round(low[0] * 255));
    expect(bytes[4]).toBe(Math.round(high[0] * 255));
  });

  it('switching active field back and forth does not throw and toggles visibility correctly', () => {
    const scene = new THREE.Scene();
    const overlay = new OverlayRenderer(scene);
    overlay.setActive(FieldId.Crime);
    overlay.setActive(FieldId.Health);
    overlay.setActive(null);
    overlay.setActive(FieldId.Crime);
    expect(scene.children[0]!.visible).toBe(true);
  });
});

describe('coverageColor', () => {
  it('reads any nonzero byte as covered (accent, blue-dominant)', () => {
    for (const v of [1, 128, 255]) {
      const [r, g, b] = coverageColor(v);
      expect(b).toBeGreaterThan(r);
      expect(g).toBeGreaterThan(r);
    }
  });

  it('reads a zero byte as uncovered (dim red, red-dominant)', () => {
    const [r, g, b] = coverageColor(0);
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
  });

  it('dims the uncovered red relative to the full-strength danger hex (0xe5 / 255 ~= 0.898)', () => {
    const [r] = coverageColor(0);
    expect(r).toBeLessThan(0.85);
    expect(r).toBeGreaterThan(0);
  });

  it('stays within [0,1] for both tones', () => {
    for (const v of [0, 1, 255]) {
      for (const c of coverageColor(v)) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('OverlayRenderer coverage lenses (power/watered, UI-SPEC §2/§8)', () => {
  const getTextureData = (scene: THREE.Scene): Uint8Array => {
    const mesh = scene.children[0] as THREE.Mesh;
    const material = mesh.material as THREE.MeshBasicMaterial;
    const texture = material.map as THREE.DataTexture;
    return texture.image.data as Uint8Array;
  };

  function coverPatch(x: number, z: number, w: number, h: number, data: number[]): ZonePatch {
    return { x, z, w, h, data: Uint8Array.from(data) };
  }

  it('setActive accepts a coverage lens and shows the overlay quad', () => {
    const scene = new THREE.Scene();
    const overlay = new OverlayRenderer(scene);
    overlay.setActive('power');
    expect(scene.children[0]!.visible).toBe(true);
    overlay.setActive('watered');
    expect(scene.children[0]!.visible).toBe(true);
    overlay.setActive(null);
    expect(scene.children[0]!.visible).toBe(false);
  });

  it('setCoverage is a no-op on the texture when a different lens (including the other coverage kind) is active', () => {
    const scene = new THREE.Scene();
    const overlay = new OverlayRenderer(scene);
    overlay.setActive('power');
    const before = Array.from(getTextureData(scene));

    overlay.setCoverage('watered', [coverPatch(0, 0, 2, 1, [0, 0])]);
    const after = Array.from(getTextureData(scene));
    expect(after).toEqual(before);
  });

  it('setCoverage ramps into the texture when its kind is the active lens', () => {
    const scene = new THREE.Scene();
    const overlay = new OverlayRenderer(scene);
    overlay.setActive('power');
    overlay.setCoverage('power', [coverPatch(0, 0, 2, 1, [0, 1])]);

    const bytes = getTextureData(scene);
    const uncovered = coverageColor(0);
    const covered = coverageColor(1);
    // Tile (0,0): uncovered.
    expect(bytes[0]).toBe(Math.round(uncovered[0] * 255));
    expect(bytes[1]).toBe(Math.round(uncovered[1] * 255));
    expect(bytes[2]).toBe(Math.round(uncovered[2] * 255));
    // Tile (1,0): covered.
    expect(bytes[4]).toBe(Math.round(covered[0] * 255));
    expect(bytes[5]).toBe(Math.round(covered[1] * 255));
    expect(bytes[6]).toBe(Math.round(covered[2] * 255));
  });

  it('repaints instantly from cache when switching straight onto a coverage lens', () => {
    const scene = new THREE.Scene();
    const overlay = new OverlayRenderer(scene);
    // Coverage patches can arrive while an unrelated FieldId lens is active.
    overlay.setActive(FieldId.Traffic);
    overlay.setCoverage('power', [coverPatch(0, 0, 1, 1, [1])]);
    const beforeSwitch = Array.from(getTextureData(scene));
    const expectedCovered = coverageColor(1);
    // The texture must NOT have picked up the coverage color yet (Traffic is active).
    expect(beforeSwitch[0]).not.toBe(Math.round(expectedCovered[0] * 255));

    overlay.setActive('power'); // no further setCoverage call in between
    const bytes = getTextureData(scene);
    expect(bytes[0]).toBe(Math.round(expectedCovered[0] * 255));
    expect(bytes[1]).toBe(Math.round(expectedCovered[1] * 255));
    expect(bytes[2]).toBe(Math.round(expectedCovered[2] * 255));
  });

  it('keeps power and watered caches independent', () => {
    const scene = new THREE.Scene();
    const overlay = new OverlayRenderer(scene);
    overlay.setCoverage('power', [coverPatch(0, 0, 1, 1, [1])]);
    overlay.setCoverage('watered', [coverPatch(0, 0, 1, 1, [0])]);

    overlay.setActive('power');
    const powerBytes = getTextureData(scene);
    const covered = coverageColor(1);
    expect(powerBytes[0]).toBe(Math.round(covered[0] * 255));

    overlay.setActive('watered');
    const wateredBytes = getTextureData(scene);
    const uncovered = coverageColor(0);
    expect(wateredBytes[0]).toBe(Math.round(uncovered[0] * 255));
  });

  it('ignores patch cells outside the map bounds without throwing', () => {
    const scene = new THREE.Scene();
    const overlay = new OverlayRenderer(scene);
    overlay.setActive('power');
    expect(() =>
      overlay.setCoverage('power', [
        coverPatch(MAP_SIZE - 1, MAP_SIZE - 1, 3, 3, new Array(9).fill(1)),
      ]),
    ).not.toThrow();
  });

  it('a later patch can flip a tile from covered back to uncovered', () => {
    const scene = new THREE.Scene();
    const overlay = new OverlayRenderer(scene);
    overlay.setActive('power');
    overlay.setCoverage('power', [coverPatch(0, 0, 1, 1, [1])]);
    overlay.setCoverage('power', [coverPatch(0, 0, 1, 1, [0])]);

    const bytes = getTextureData(scene);
    const uncovered = coverageColor(0);
    expect(bytes[0]).toBe(Math.round(uncovered[0] * 255));
  });
});

describe('OverlayRenderer trash coverage lens (graded 0..255, SPEC §21)', () => {
  const getTextureData = (scene: THREE.Scene): Uint8Array => {
    const mesh = scene.children[0] as THREE.Mesh;
    const material = mesh.material as THREE.MeshBasicMaterial;
    const texture = material.map as THREE.DataTexture;
    return texture.image.data as Uint8Array;
  };

  function coverPatch(x: number, z: number, w: number, h: number, data: number[]): ZonePatch {
    return { x, z, w, h, data: Uint8Array.from(data) };
  }

  it('setActive("trash") shows the overlay quad', () => {
    const scene = new THREE.Scene();
    const overlay = new OverlayRenderer(scene);
    overlay.setActive('trash');
    expect(scene.children[0]!.visible).toBe(true);
    overlay.setActive(null);
    expect(scene.children[0]!.visible).toBe(false);
  });

  it('setCoverage("trash", ...) ramps each tile 0..255 through the graded rampColor, not the two-tone coverage ramp', () => {
    const scene = new THREE.Scene();
    const overlay = new OverlayRenderer(scene);
    overlay.setActive('trash');
    overlay.setCoverage('trash', [coverPatch(0, 0, 3, 1, [0, 128, 255])]);

    const bytes = getTextureData(scene);
    for (const [tile, value] of [
      [0, 0],
      [1, 128],
      [2, 255],
    ] as const) {
      const [r, g, b] = rampColor(value);
      const base = tile * 4;
      expect(bytes[base]).toBe(Math.round(r * 255));
      expect(bytes[base + 1]).toBe(Math.round(g * 255));
      expect(bytes[base + 2]).toBe(Math.round(b * 255));
    }
    // Graded: a mid value (128) must NOT collapse to the two-tone "covered" accent.
    expect(bytes[4]).not.toBe(Math.round(coverageColor(128)[0] * 255));
  });
});
