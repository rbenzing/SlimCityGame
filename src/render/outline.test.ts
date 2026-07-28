import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  outlineBoxSize,
  pulseOpacity,
  PULSE_MAX_OPACITY,
  PULSE_MIN_OPACITY,
  PULSE_PERIOD_SECONDS,
  SelectionOutline,
  type OutlineTarget,
} from './outline';
import { TILE_METERS } from '../shared/constants';

describe('outlineBoxSize', () => {
  it('converts footprint tiles to meters and adds an equal outward margin on every axis', () => {
    const size = outlineBoxSize({ w: 2, d: 3 }, 12);
    const marginW = size.w - 2 * TILE_METERS;
    const marginD = size.d - 3 * TILE_METERS;
    const marginH = size.h - 12;
    expect(marginW).toBeGreaterThan(0);
    expect(marginW).toBeCloseTo(marginD, 9);
    expect(marginW).toBeCloseTo(marginH, 9);
  });

  it('scales width/depth linearly with footprint tiles at exactly TILE_METERS per tile', () => {
    const a = outlineBoxSize({ w: 1, d: 1 }, 10);
    const b = outlineBoxSize({ w: 2, d: 4 }, 10);
    expect(b.w - a.w).toBeCloseTo(TILE_METERS * 1, 6); // w: 1 -> 2 tiles = +1 tile
    expect(b.d - a.d).toBeCloseTo(TILE_METERS * 3, 6); // d: 1 -> 4 tiles = +3 tiles
    expect(b.h).toBeCloseTo(a.h, 9); // height unchanged
  });

  it('maps height 1:1 in meters (plus the fixed margin), independent of footprint', () => {
    const short = outlineBoxSize({ w: 1, d: 1 }, 5);
    const tall = outlineBoxSize({ w: 1, d: 1 }, 25);
    expect(tall.h - short.h).toBeCloseTo(20, 6);
    expect(tall.w).toBeCloseTo(short.w, 9);
    expect(tall.d).toBeCloseTo(short.d, 9);
  });

  it('clamps negative/zero footprint or height to a still-positive (never inverted) box', () => {
    const size = outlineBoxSize({ w: -5, d: -5 }, -10);
    expect(size.w).toBeGreaterThan(0);
    expect(size.d).toBeGreaterThan(0);
    expect(size.h).toBeGreaterThan(0);

    const zero = outlineBoxSize({ w: 0, d: 0 }, 0);
    expect(zero.w).toBeGreaterThan(0);
    expect(zero.d).toBeGreaterThan(0);
    expect(zero.h).toBeGreaterThan(0);
  });

  it('is a pure, deterministic function of its inputs', () => {
    const a = outlineBoxSize({ w: 3, d: 4 }, 18);
    const b = outlineBoxSize({ w: 3, d: 4 }, 18);
    expect(a).toEqual(b);
  });
});

describe('pulseOpacity', () => {
  it('stays within [PULSE_MIN_OPACITY, PULSE_MAX_OPACITY] across many samples', () => {
    for (let t = -5; t <= 10; t += 0.13) {
      const o = pulseOpacity(t);
      expect(o).toBeGreaterThanOrEqual(PULSE_MIN_OPACITY - 1e-9);
      expect(o).toBeLessThanOrEqual(PULSE_MAX_OPACITY + 1e-9);
    }
  });

  it('is deterministic: identical t produces identical opacity', () => {
    expect(pulseOpacity(3.456)).toBe(pulseOpacity(3.456));
    expect(pulseOpacity(0)).toBe(pulseOpacity(0));
  });

  it('actually oscillates rather than staying constant', () => {
    const samples = [0, 0.4, 0.8, 1.2, 1.6, 2.0].map(pulseOpacity);
    expect(new Set(samples).size).toBeGreaterThan(1);
  });

  it('is periodic with period PULSE_PERIOD_SECONDS', () => {
    for (const t of [0, 0.2, 0.77, 1.4]) {
      expect(pulseOpacity(t)).toBeCloseTo(pulseOpacity(t + PULSE_PERIOD_SECONDS), 9);
      expect(pulseOpacity(t)).toBeCloseTo(pulseOpacity(t + PULSE_PERIOD_SECONDS * 5), 9);
    }
  });

  it('reaches (close to) both bounds somewhere in one period', () => {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i <= 200; i++) {
      const t = (i / 200) * PULSE_PERIOD_SECONDS;
      const o = pulseOpacity(t);
      min = Math.min(min, o);
      max = Math.max(max, o);
    }
    expect(min).toBeCloseTo(PULSE_MIN_OPACITY, 2);
    expect(max).toBeCloseTo(PULSE_MAX_OPACITY, 2);
  });
});

describe('SelectionOutline', () => {
  const target: OutlineTarget = {
    position: { x: 100, y: 4, z: 200 },
    footprint: { w: 2, d: 3 },
    height: 12,
  };

  it('adds exactly one hidden LineSegments shell to the scene up front', () => {
    const scene = new THREE.Scene();
    new SelectionOutline(scene);
    expect(scene.children.length).toBe(1);
    const shell = scene.children[0]!;
    expect(shell.visible).toBe(false);
    expect((shell as THREE.LineSegments).isLineSegments).toBe(true);
  });

  it('highlight(target) shows the shell, scaled to outlineBoxSize and centered on the box (base + height/2)', () => {
    const scene = new THREE.Scene();
    const outline = new SelectionOutline(scene);
    outline.highlight(target);

    const shell = scene.children[0] as THREE.LineSegments;
    expect(shell.visible).toBe(true);

    const expected = outlineBoxSize(target.footprint, target.height);
    expect(shell.scale.x).toBeCloseTo(expected.w, 9);
    expect(shell.scale.y).toBeCloseTo(expected.h, 9);
    expect(shell.scale.z).toBeCloseTo(expected.d, 9);

    expect(shell.position.x).toBeCloseTo(target.position.x, 9);
    expect(shell.position.z).toBeCloseTo(target.position.z, 9);
    expect(shell.position.y).toBeCloseTo(target.position.y + target.height / 2, 9);
  });

  it('highlight(null) hides the shell again', () => {
    const scene = new THREE.Scene();
    const outline = new SelectionOutline(scene);
    outline.highlight(target);
    expect((scene.children[0] as THREE.LineSegments).visible).toBe(true);

    outline.highlight(null);
    expect((scene.children[0] as THREE.LineSegments).visible).toBe(false);
    // Still exactly one shell object — hide, not remove/recreate.
    expect(scene.children.length).toBe(1);
  });

  it('re-highlighting a different target moves/resizes the same shell (no duplicate objects)', () => {
    const scene = new THREE.Scene();
    const outline = new SelectionOutline(scene);
    outline.highlight(target);

    const other: OutlineTarget = {
      position: { x: -50, y: 0, z: 10 },
      footprint: { w: 1, d: 1 },
      height: 6,
    };
    outline.highlight(other);

    expect(scene.children.length).toBe(1);
    const shell = scene.children[0] as THREE.LineSegments;
    const expected = outlineBoxSize(other.footprint, other.height);
    expect(shell.scale.x).toBeCloseTo(expected.w, 9);
    expect(shell.position.x).toBeCloseTo(other.position.x, 9);
    expect(shell.position.y).toBeCloseTo(other.position.y + other.height / 2, 9);
  });

  it('update(t) drives the shared material opacity via pulseOpacity(t)', () => {
    const scene = new THREE.Scene();
    const outline = new SelectionOutline(scene);
    outline.highlight(target);

    const shell = scene.children[0] as THREE.LineSegments;
    const material = shell.material as THREE.LineBasicMaterial;

    outline.update(0);
    expect(material.opacity).toBeCloseTo(pulseOpacity(0), 9);

    outline.update(0.77);
    expect(material.opacity).toBeCloseTo(pulseOpacity(0.77), 9);
  });
});
