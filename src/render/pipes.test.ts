import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PIPE_STRIP_OFFSET_M, PIPE_STRIP_WIDTH_M, PipeOverlayRenderer, pipeStrips } from './pipes';
import { TILE_METERS } from '../shared/constants';

const none = { east: false, west: false, south: false, north: false };

describe('pipeStrips', () => {
  it('always draws a hub at the tile centre, so a lone tile still shows', () => {
    const strips = pipeStrips(none);
    expect(strips).toHaveLength(2);
    // One hub strip runs across the centre along X, the other along Z.
    const [alongX, alongZ] = strips;
    expect(alongX![0]).toBeLessThan(TILE_METERS / 2);
    expect(alongX![2]).toBeGreaterThan(TILE_METERS / 2);
    expect(alongZ![1]).toBeLessThan(TILE_METERS / 2);
    expect(alongZ![3]).toBeGreaterThan(TILE_METERS / 2);
  });

  it('runs an arm from the centre to each edge whose neighbour carries water, and no further', () => {
    const strips = pipeStrips({ ...none, east: true, north: true });
    expect(strips).toHaveLength(4);
    const east = strips[2]!;
    expect(east[0]).toBe(TILE_METERS / 2);
    expect(east[2]).toBe(TILE_METERS);
    const north = strips[3]!;
    expect(north[1]).toBe(0);
    expect(north[3]).toBe(TILE_METERS / 2);
  });

  it('keeps the blue run its width, off the centre line, so the brown run fits beside it', () => {
    const [hub] = pipeStrips(none);
    const [, z0, , z1] = hub!;
    expect(z1 - z0).toBeCloseTo(PIPE_STRIP_WIDTH_M, 9);
    expect((z0 + z1) / 2).toBeCloseTo(TILE_METERS / 2 - PIPE_STRIP_OFFSET_M, 9);
    expect(PIPE_STRIP_OFFSET_M).toBeGreaterThan(PIPE_STRIP_WIDTH_M / 2);
  });
});

describe('PipeOverlayRenderer', () => {
  const flat = (): number => 0;

  it('draws a blue and a brown run for every strip of every pipe tile', () => {
    const renderer = new PipeOverlayRenderer(new THREE.Scene(), flat);
    const pipes = new Set(['3,3', '4,3']);
    renderer.rebuild(
      [
        { x: 3, z: 3 },
        { x: 4, z: 3 },
      ],
      (x, z) => pipes.has(`${x},${z}`),
    );
    // Each tile: two hub strips and one arm toward the other; two triangles a strip.
    const { water, sewer } = renderer.triangleCount();
    expect(water).toBe(2 * 3 * 2);
    expect(sewer).toBe(water);
  });

  it('is hidden until shown, and a rebuild never changes that', () => {
    const renderer = new PipeOverlayRenderer(new THREE.Scene(), flat);
    expect(renderer.isVisible()).toBe(false);
    renderer.rebuild([{ x: 1, z: 1 }], () => false);
    expect(renderer.isVisible()).toBe(false);
    renderer.setVisible(true);
    renderer.rebuild([{ x: 1, z: 1 }], () => false);
    expect(renderer.isVisible()).toBe(true);
  });
});
