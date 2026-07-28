import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { StarField, starPositions, STAR_COUNT, STAR_FIELD_RADIUS, STAR_SEED } from './stars';

describe('starPositions (pure)', () => {
  it('returns count * 3 numbers (xyz per star)', () => {
    const positions = starPositions(50, 1);
    expect(positions.length).toBe(150);
  });

  it('is deterministic: same count + seed always produce identical positions', () => {
    const a = starPositions(200, 42);
    const b = starPositions(200, 42);
    expect(a).toEqual(b);
  });

  it('produces different layouts for different seeds', () => {
    const a = starPositions(200, 1);
    const b = starPositions(200, 2);
    expect(a).not.toEqual(b);
  });

  it('never uses Math.random (repeated calls in the same process stay identical)', () => {
    // A weak but real regression guard: if the implementation ever leaked
    // Math.random(), two independent calls with the same seed would diverge.
    const runs = [starPositions(64, 7), starPositions(64, 7), starPositions(64, 7)];
    expect(runs[1]).toEqual(runs[0]);
    expect(runs[2]).toEqual(runs[0]);
  });

  it('places every star on (or above) the horizon of the dome', () => {
    const positions = starPositions(300, 99);
    for (let i = 0; i < 300; i++) {
      const y = positions[i * 3 + 1] ?? -1;
      expect(y).toBeGreaterThanOrEqual(0);
    }
  });

  it('places every star at the requested radius from the origin', () => {
    const radius = 500;
    const positions = starPositions(120, 5, radius);
    for (let i = 0; i < 120; i++) {
      const x = positions[i * 3] ?? 0;
      const y = positions[i * 3 + 1] ?? 0;
      const z = positions[i * 3 + 2] ?? 0;
      // Relative tolerance: absolute floating-point error scales with the
      // magnitude of `radius`, so a fixed-decimal-digit assertion isn't
      // meaningful here the way it is for unit-scale values.
      expect(Math.abs(Math.hypot(x, y, z) - radius) / radius).toBeLessThan(1e-6);
    }
  });

  it('defaults line up with the exported STAR_COUNT / STAR_FIELD_RADIUS / STAR_SEED constants', () => {
    const positions = starPositions(STAR_COUNT, STAR_SEED);
    expect(positions.length).toBe(STAR_COUNT * 3);
    const x = positions[0] ?? 0;
    const y = positions[1] ?? 0;
    const z = positions[2] ?? 0;
    const radius = Math.hypot(x, y, z);
    expect(Math.abs(radius - STAR_FIELD_RADIUS) / STAR_FIELD_RADIUS).toBeLessThan(1e-6);
  });
});

describe('StarField', () => {
  it('adds a single frustum-unculled THREE.Points layer to the scene', () => {
    const scene = new THREE.Scene();
    const field = new StarField(scene, 40, 3);
    expect(scene.children).toContain(field.points);
    expect(field.points.frustumCulled).toBe(false);
    const geometry = field.points.geometry.getAttribute('position');
    expect(geometry.count).toBe(40);
  });

  it('starts invisible (opacity 0) before any setNightFactor call', () => {
    const scene = new THREE.Scene();
    const field = new StarField(scene, 20, 3);
    const material = field.points.material as THREE.PointsMaterial;
    expect(material.opacity).toBe(0);
    expect(material.transparent).toBe(true);
  });

  it('setNightFactor ramps opacity directly with nightFactor', () => {
    const scene = new THREE.Scene();
    const field = new StarField(scene, 20, 3);
    const material = field.points.material as THREE.PointsMaterial;

    field.setNightFactor(1);
    expect(material.opacity).toBeCloseTo(1, 9);

    field.setNightFactor(0.35);
    expect(material.opacity).toBeCloseTo(0.35, 9);

    field.setNightFactor(0);
    expect(material.opacity).toBeCloseTo(0, 9);
  });

  it('clamps out-of-range nightFactor into [0,1]', () => {
    const scene = new THREE.Scene();
    const field = new StarField(scene, 20, 3);
    const material = field.points.material as THREE.PointsMaterial;

    field.setNightFactor(-3);
    expect(material.opacity).toBe(0);

    field.setNightFactor(5);
    expect(material.opacity).toBe(1);
  });
});
