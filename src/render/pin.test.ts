// @vitest-environment jsdom
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bobOffset, BOB_AMPLITUDE, BOB_PERIOD_SECONDS, MapPin } from './pin';

describe('bobOffset', () => {
  it('is 0 at t=0', () => {
    expect(bobOffset(0)).toBeCloseTo(0, 9);
  });

  it('stays within [-BOB_AMPLITUDE, BOB_AMPLITUDE]', () => {
    for (let t = -5; t <= 10; t += 0.11) {
      const o = bobOffset(t);
      expect(o).toBeGreaterThanOrEqual(-BOB_AMPLITUDE - 1e-9);
      expect(o).toBeLessThanOrEqual(BOB_AMPLITUDE + 1e-9);
    }
  });

  it('is deterministic: identical t produces identical offset', () => {
    expect(bobOffset(1.23)).toBe(bobOffset(1.23));
  });

  it('actually oscillates rather than staying constant', () => {
    const samples = [0, 0.3, 0.6, 0.9, 1.2, 1.5].map(bobOffset);
    expect(new Set(samples).size).toBeGreaterThan(1);
  });

  it('is periodic with period BOB_PERIOD_SECONDS', () => {
    for (const t of [0, 0.31, 0.9, 1.7]) {
      expect(bobOffset(t)).toBeCloseTo(bobOffset(t + BOB_PERIOD_SECONDS), 9);
      expect(bobOffset(t)).toBeCloseTo(bobOffset(t + BOB_PERIOD_SECONDS * 4), 9);
    }
  });

  it('is an odd function around 0 (bobs symmetrically up and down)', () => {
    for (const t of [0.2, 0.7, 1.1]) {
      expect(bobOffset(-t)).toBeCloseTo(-bobOffset(t), 9);
    }
  });
});

describe('MapPin', () => {
  // jsdom has no canvas 2D backend (no optional `canvas` npm package
  // installed): the real getContext('2d') returns null but first logs a
  // benign "Not implemented" notice straight to the terminal (jsdom's
  // internal virtualConsole path, which sits outside vitest's per-test
  // console capture under the vmThreads pool, so a console.error spy can't
  // catch it). MapPin already guards a null context correctly either way;
  // stub getContext itself so the test output stays readable without
  // changing what's under test (the outcome — a null context — is identical
  // to jsdom's real behavior here).
  let getContextSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });
  afterEach(() => {
    getContextSpy.mockRestore();
  });

  it('adds exactly one hidden Sprite to the scene up front', () => {
    const scene = new THREE.Scene();
    new MapPin(scene);
    expect(scene.children.length).toBe(1);
    const obj = scene.children[0]!;
    expect(obj.visible).toBe(false);
    expect((obj as THREE.Sprite).isSprite).toBe(true);
  });

  it('is safe to construct even though jsdom returns a null 2D context', () => {
    const scene = new THREE.Scene();
    expect(() => new MapPin(scene)).not.toThrow();
    const sprite = scene.children[0] as THREE.Sprite;
    const material = sprite.material as THREE.SpriteMaterial;
    expect(material.map).toBeInstanceOf(THREE.CanvasTexture);
  });

  it('showAt() makes the pin visible, aligned exactly over the anchor x/z, floating above anchor y', () => {
    const scene = new THREE.Scene();
    const pin = new MapPin(scene);
    pin.showAt(42, 7, 99);

    const sprite = scene.children[0] as THREE.Sprite;
    expect(sprite.visible).toBe(true);
    expect(sprite.position.x).toBeCloseTo(42, 9);
    expect(sprite.position.z).toBeCloseTo(99, 9);
    expect(sprite.position.y).toBeGreaterThan(7); // floats above the roof anchor, never at/below it
  });

  it('showAt() places the pin immediately, before any update() call', () => {
    const scene = new THREE.Scene();
    const pin = new MapPin(scene);
    pin.showAt(5, 5, 5);
    const sprite = scene.children[0] as THREE.Sprite;
    expect(sprite.visible).toBe(true);
    expect(sprite.position.y).toBeGreaterThan(5);
  });

  it('hide() hides the pin and freezes it: further update() calls are a no-op', () => {
    const scene = new THREE.Scene();
    const pin = new MapPin(scene);
    pin.showAt(1, 2, 3);
    pin.update(0);

    const sprite = scene.children[0] as THREE.Sprite;
    const yBeforeHide = sprite.position.y;

    pin.hide();
    expect(sprite.visible).toBe(false);

    pin.update(5);
    expect(sprite.position.y).toBe(yBeforeHide);
    expect(sprite.visible).toBe(false);
  });

  it('a second showAt() call re-anchors the pin to the new position', () => {
    const scene = new THREE.Scene();
    const pin = new MapPin(scene);
    pin.showAt(0, 0, 0);

    pin.showAt(100, 50, 100);
    const sprite = scene.children[0] as THREE.Sprite;
    expect(sprite.position.x).toBeCloseTo(100, 9);
    expect(sprite.position.z).toBeCloseTo(100, 9);
    expect(sprite.position.y).toBeGreaterThan(50);
  });

  it('update(t) moves the pin by exactly the delta bobOffset(t) predicts, on top of the fixed rest height', () => {
    const scene = new THREE.Scene();
    const pin = new MapPin(scene);
    pin.showAt(10, 20, 30);
    const sprite = scene.children[0] as THREE.Sprite;

    pin.update(0);
    const yAtT0 = sprite.position.y;

    pin.update(0.85);
    const yAtT1 = sprite.position.y;

    expect(yAtT1 - yAtT0).toBeCloseTo(bobOffset(0.85) - bobOffset(0), 9);
    // Horizontal position is untouched by bobbing.
    expect(sprite.position.x).toBeCloseTo(10, 9);
    expect(sprite.position.z).toBeCloseTo(30, 9);
  });

  it('update(t) is deterministic: replaying the same t sequence reproduces the same y', () => {
    const scene = new THREE.Scene();
    const pin = new MapPin(scene);
    pin.showAt(0, 0, 0);
    const sprite = scene.children[0] as THREE.Sprite;

    pin.update(1.234);
    const y1 = sprite.position.y;
    pin.update(0); // rewind
    pin.update(1.234); // replay
    const y2 = sprite.position.y;

    expect(y2).toBeCloseTo(y1, 9);
  });
});
