// @vitest-environment jsdom
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { timeOfDayColors } from './scene';
import { SkyDome, SunBillboard, sunVisual } from './sky';

// SunBillboard draws its disc/glow textures via canvas once at construction.
// jsdom has no canvas 2D backend (no optional `canvas` npm package installed):
// getContext('2d') returns null but first logs a benign "Not implemented"
// notice straight to the terminal (mirrors pin.test.ts's MapPin setup
// exactly). SunBillboard already guards a null context correctly either way;
// stub getContext so test output stays readable without changing what's
// under test.
let getContextSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  getContextSpy.mockRestore();
});

describe('SkyDome', () => {
  it('adds a single BackSide, depth-write-off Mesh to the scene, drawn before other opaque geometry', () => {
    const scene = new THREE.Scene();
    const dome = new SkyDome(scene, 500);
    expect(scene.children).toContain(dome.mesh);
    expect(dome.mesh.isMesh).toBe(true);

    const material = dome.mesh.material as THREE.MeshBasicMaterial;
    expect(material.side).toBe(THREE.BackSide);
    expect(material.depthWrite).toBe(false);
    expect(dome.mesh.renderOrder).toBeLessThan(0);
    expect(dome.mesh.frustumCulled).toBe(false);
  });

  it('paints the top-pole vertex the zenith color and the bottom-pole vertex the horizon color', () => {
    const scene = new THREE.Scene();
    const dome = new SkyDome(scene, 500);
    dome.setTimeOfDay(0.5);
    const c = timeOfDayColors(0.5);

    const colorAttr = dome.mesh.geometry.getAttribute('color');
    const count = colorAttr.count;
    // THREE.SphereGeometry's first vertex is always the north pole (zenith);
    // the last is always the south pole (nadir) — the dome's y<=0 clamp
    // paints the whole lower hemisphere (including the south pole) the
    // horizon color, so this is a safe, ordering-guaranteed pair to sample.
    expect(colorAttr.getX(0)).toBeCloseTo(c.skyZenithColor[0], 4);
    expect(colorAttr.getY(0)).toBeCloseTo(c.skyZenithColor[1], 4);
    expect(colorAttr.getZ(0)).toBeCloseTo(c.skyZenithColor[2], 4);

    const last = count - 1;
    expect(colorAttr.getX(last)).toBeCloseTo(c.skyHorizonColor[0], 4);
    expect(colorAttr.getY(last)).toBeCloseTo(c.skyHorizonColor[1], 4);
    expect(colorAttr.getZ(last)).toBeCloseTo(c.skyHorizonColor[2], 4);
  });

  it('repaints on every setTimeOfDay call: noon and midnight produce different zenith vertex colors', () => {
    const scene = new THREE.Scene();
    const dome = new SkyDome(scene, 500);

    dome.setTimeOfDay(0.5);
    const colorAttr = dome.mesh.geometry.getAttribute('color');
    const noonZenith = [colorAttr.getX(0), colorAttr.getY(0), colorAttr.getZ(0)];

    dome.setTimeOfDay(0);
    const midnightZenith = [colorAttr.getX(0), colorAttr.getY(0), colorAttr.getZ(0)];

    expect(midnightZenith).not.toEqual(noonZenith);
  });

  it('bumps the color attribute version (GPU re-upload signal) on each repaint', () => {
    // THREE.BufferAttribute.needsUpdate is write-only (a setter that bumps
    // .version); .version is the readable signal that a re-upload was
    // requested.
    const scene = new THREE.Scene();
    const dome = new SkyDome(scene, 500);
    const colorAttr = dome.mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    const versionBefore = colorAttr.version;
    dome.setTimeOfDay(0.2);
    expect(colorAttr.version).toBeGreaterThan(versionBefore);
  });
});

describe('sunVisual (pure)', () => {
  it('is white-ish, near-full opacity, and minimally enlarged at noon (t=0.5), and not a moon', () => {
    const v = sunVisual(0.5);
    expect(v.isMoon).toBe(false);
    expect(v.opacity).toBeCloseTo(1, 5);
    const warmth = v.color[0] - v.color[2];
    expect(Math.abs(warmth)).toBeLessThan(0.15); // near-neutral, not warm
    expect(v.sizeMultiplier).toBeLessThan(1.2); // minimal horizon enlargement
  });

  it('swaps to a dim, pale moon at midnight (t=0)', () => {
    const v = sunVisual(0);
    expect(v.isMoon).toBe(true);
    expect(v.opacity).toBeLessThan(0.4); // dim
    expect(v.opacity).toBeGreaterThan(0); // never fully invisible
    // pale: bright-ish, low-contrast channels (desaturated), not a deep-saturated color.
    const maxChannel = Math.max(...v.color);
    const minChannel = Math.min(...v.color);
    expect(maxChannel).toBeGreaterThan(0.7);
    expect(maxChannel - minChannel).toBeLessThan(0.35);
  });

  it('is warm and enlarged just above the horizon (day side) relative to noon', () => {
    const noon = sunVisual(0.5);
    // t=0.25 is the exact morning horizon crossing (elevation=0); just past
    // it (0.26) is still the day side (elevation > 0).
    const nearHorizon = sunVisual(0.26);

    expect(nearHorizon.isMoon).toBe(false);
    const warmthOf = (v: typeof noon): number => v.color[0] - v.color[2];
    expect(warmthOf(nearHorizon)).toBeGreaterThan(warmthOf(noon));
    expect(nearHorizon.sizeMultiplier).toBeGreaterThan(noon.sizeMultiplier);
  });

  it('flips isMoon exactly at/below the horizon (elevation <= 0) and stays a sun above it', () => {
    expect(sunVisual(0.26).isMoon).toBe(false); // just above the morning horizon crossing
    expect(sunVisual(0.24).isMoon).toBe(true); // just below it
    expect(sunVisual(0.74).isMoon).toBe(false); // just above the evening horizon crossing
    expect(sunVisual(0.76).isMoon).toBe(true); // just below it
  });

  it('sizeMultiplier is always >= 1 and finite across a full day/night cycle', () => {
    for (let i = 0; i <= 24; i++) {
      const v = sunVisual(i / 24);
      expect(v.sizeMultiplier).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(v.sizeMultiplier)).toBe(true);
    }
  });

  it('opacity always stays within (0,1] across a full day/night cycle', () => {
    for (let i = 0; i <= 24; i++) {
      const v = sunVisual(i / 24);
      expect(v.opacity).toBeGreaterThan(0);
      expect(v.opacity).toBeLessThanOrEqual(1);
    }
  });

  it('every color channel stays within [0,1] across a full day/night cycle', () => {
    for (let i = 0; i <= 24; i++) {
      const v = sunVisual(i / 24);
      for (const ch of v.color) {
        expect(ch).toBeGreaterThanOrEqual(0);
        expect(ch).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is deterministic: identical t reproduces identical output', () => {
    expect(sunVisual(0.37)).toEqual(sunVisual(0.37));
  });
});

describe('SunBillboard', () => {
  it('is safe to construct despite jsdom returning a null 2D context, adding sprite(s) to the scene', () => {
    const scene = new THREE.Scene();
    expect(() => new SunBillboard(scene)).not.toThrow();
    const sprites = scene.children.filter((c): c is THREE.Sprite => c instanceof THREE.Sprite);
    expect(sprites.length).toBeGreaterThanOrEqual(1);
    for (const sprite of sprites) {
      const material = sprite.material as THREE.SpriteMaterial;
      expect(material.map).toBeInstanceOf(THREE.CanvasTexture);
      expect(material.depthWrite).toBe(false);
      expect(material.transparent).toBe(true);
    }
  });

  it('positions its sprite(s) along sunVisual/sunDirection, offset from the map center', () => {
    const scene = new THREE.Scene();
    const billboard = new SunBillboard(scene, 1000);
    billboard.setTimeOfDay(0.5); // noon: sun almost straight up
    const sprites = scene.children.filter((c): c is THREE.Sprite => c instanceof THREE.Sprite);
    for (const sprite of sprites) {
      expect(sprite.position.y).toBeGreaterThan(500); // clearly elevated, ~noon direction * distance
    }
  });

  it('grows the sprite scale near the horizon and shrinks it back down at noon', () => {
    const scene = new THREE.Scene();
    const billboard = new SunBillboard(scene, 1000);
    const sprite = scene.children.find((c): c is THREE.Sprite => c instanceof THREE.Sprite)!;

    billboard.setTimeOfDay(0.5);
    const noonScale = sprite.scale.x;

    billboard.setTimeOfDay(0.26); // just above the morning horizon
    const horizonScale = sprite.scale.x;

    expect(horizonScale).toBeGreaterThan(noonScale);
  });

  it('dims sprite opacity toward the moon floor at midnight relative to noon', () => {
    const scene = new THREE.Scene();
    const billboard = new SunBillboard(scene, 1000);
    const sprite = scene.children.find((c): c is THREE.Sprite => c instanceof THREE.Sprite)!;
    const material = sprite.material as THREE.SpriteMaterial;

    billboard.setTimeOfDay(0.5);
    const noonOpacity = material.opacity;
    billboard.setTimeOfDay(0);
    const midnightOpacity = material.opacity;

    expect(midnightOpacity).toBeLessThan(noonOpacity);
  });
});
