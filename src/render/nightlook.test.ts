import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { MeshLambertNodeMaterial } from 'three/webgpu';
import { uniform } from 'three/tsl';
import { NIGHT_TINT, nightBodyMaterial, nightTintNode } from './nightlook';

const RENDER_DIR = new URL('./', import.meta.url);
const source = (file: string): string => readFileSync(new URL(file, RENDER_DIR), 'utf8');

describe('NIGHT_TINT — the one shade every sunlit surface reads at night', () => {
  it('is dimmer than day on every channel and cool: blue strongest, red weakest', () => {
    const [r, g, b] = NIGHT_TINT;
    for (const channel of NIGHT_TINT) expect(channel).toBeLessThan(1);
    expect(b).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(r);
  });

  it('keeps the day colour recognisable: the tint and the night light share the dimming', () => {
    const [r, g, b] = NIGHT_TINT;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    expect(luminance).toBeGreaterThan(0.4);
    expect(luminance).toBeLessThan(0.75);
  });

  it('is the only night tint in the render tree: every sunlit renderer reads this one, none declares its own', () => {
    const readers = [
      'buildings.ts',
      'massing.ts',
      'houses.ts',
      'farms.ts',
      'buildingkit.ts',
      'landmarks.ts',
      'props.ts',
      'utilitykits.ts',
      'terrain.ts',
      'trees.ts',
      'lots.ts',
      'roadsmesh.ts',
      'water.ts',
    ];
    for (const file of readers) {
      const text = source(file);
      expect(text, file).toMatch(/from '\.\/nightlook'/);
      expect(text, file).not.toMatch(/NIGHT_(BODY_|ROOF_)?TINT\s*[:=]/);
    }
  });
});

describe('nightBodyMaterial — a surface shaded by the shared tint', () => {
  it('is a Lambert node material whose colour node carries the night tint, with vertex colours, flat shading and side as asked', () => {
    const night = uniform(0);
    const plain = nightBodyMaterial(night);
    expect(plain).toBeInstanceOf(MeshLambertNodeMaterial);
    expect(plain.colorNode).not.toBeNull();
    expect(plain.vertexColors).toBe(false);
    expect(plain.flatShading).toBe(false);
    expect(plain.side).toBe(THREE.FrontSide);
    expect(plain.emissive.getHex()).toBe(0);
    const foliage = nightBodyMaterial(night, {
      vertexColors: true,
      flatShading: true,
      side: THREE.DoubleSide,
    });
    expect(foliage.vertexColors).toBe(true);
    expect(foliage.flatShading).toBe(true);
    expect(foliage.side).toBe(THREE.DoubleSide);
    // The material's own colour stays live for a caller that paints by it.
    foliage.color.setRGB(0.5, 0.6, 0.7);
    expect(foliage.color.toArray()).toEqual([0.5, 0.6, 0.7]);
    const flat = nightBodyMaterial(night, { color: 0x8899aa });
    expect(flat.colorNode).not.toBeNull();
  });

  it('builds a tint node from any night uniform', () => {
    expect(nightTintNode(uniform(0.5))).toBeDefined();
  });
});
