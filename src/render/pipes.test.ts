import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  LEAD_INTO_LOT_M,
  PIPE_STRIP_OFFSET_M,
  PIPE_STRIP_WIDTH_M,
  PipeOverlayRenderer,
  leadStrip,
  pipeStrips,
  type PipeConnection,
  type PipeLead,
  type PipeSystemView,
} from './pipes';
import type { TilePoint } from '../shared/types';
import { TILE_METERS } from '../shared/constants';

const none = { east: false, west: false, south: false, north: false };

describe('pipeStrips', () => {
  it('draws a hub both ways at a lone tile, so it still shows', () => {
    const strips = pipeStrips(none);
    expect(strips).toHaveLength(2);
    // One hub strip runs across the centre along X, the other along Z.
    const [alongX, alongZ] = strips;
    expect(alongX![0]).toBeLessThan(TILE_METERS / 2);
    expect(alongX![2]).toBeGreaterThan(TILE_METERS / 2);
    expect(alongZ![1]).toBeLessThan(TILE_METERS / 2);
    expect(alongZ![3]).toBeGreaterThan(TILE_METERS / 2);
  });

  it('runs an arm from the centre to each edge whose neighbour carries water, with the hub only along those axes', () => {
    const strips = pipeStrips({ ...none, east: true, north: true });
    expect(strips).toHaveLength(4);
    const east = strips[2]!;
    expect(east[0]).toBe(TILE_METERS / 2);
    expect(east[2]).toBe(TILE_METERS);
    const north = strips[3]!;
    expect(north[1]).toBe(0);
    expect(north[3]).toBe(TILE_METERS / 2);
    // A straight run east–west is one hub along X and two arms: no cross tick.
    const straight = pipeStrips({ ...none, east: true, west: true });
    expect(straight).toHaveLength(3);
    expect(straight.every(([x0, , x1]) => x1 - x0 > PIPE_STRIP_WIDTH_M)).toBe(true);
  });

  it('keeps the blue run its width, off the centre line, so the brown run fits beside it', () => {
    const [hub] = pipeStrips(none);
    const [, z0, , z1] = hub!;
    expect(z1 - z0).toBeCloseTo(PIPE_STRIP_WIDTH_M, 9);
    expect((z0 + z1) / 2).toBeCloseTo(TILE_METERS / 2 - PIPE_STRIP_OFFSET_M, 9);
    expect(PIPE_STRIP_OFFSET_M).toBeGreaterThan(PIPE_STRIP_WIDTH_M / 2);
  });
});

describe('leadStrip', () => {
  it('runs from the road tile centre past its edge into the lot, one way per side', () => {
    const east = leadStrip(1, 0);
    expect(east[0]).toBe(TILE_METERS / 2);
    expect(east[2]).toBe(TILE_METERS + LEAD_INTO_LOT_M);
    const north = leadStrip(0, -1);
    expect(north[1]).toBe(-LEAD_INTO_LOT_M);
    expect(north[3]).toBe(TILE_METERS / 2);
  });
});

describe('PipeOverlayRenderer', () => {
  const flat = (): number => 0;
  const key = (x: number, z: number): string => `${x},${z}`;
  const view = (opts: {
    pipes?: TilePoint[];
    mains?: TilePoint[];
    leads?: PipeLead[];
    risers?: TilePoint[];
    connections?: PipeConnection[];
    wet?: TilePoint[];
    drained?: TilePoint[];
  }): PipeSystemView => {
    const pipes = opts.pipes ?? [];
    const mains = opts.mains ?? [];
    const carriers = new Set([...pipes, ...mains].map((t) => key(t.x, t.z)));
    const wet = new Set((opts.wet ?? []).map((t) => key(t.x, t.z)));
    const drained = new Set((opts.drained ?? []).map((t) => key(t.x, t.z)));
    return {
      pipes,
      mains,
      leads: opts.leads ?? [],
      risers: opts.risers ?? [],
      connections: opts.connections ?? [],
      carriesWater: (x, z) => carriers.has(key(x, z)),
      wet: (x, z) => wet.has(key(x, z)),
      drained: (x, z) => drained.has(key(x, z)),
    };
  };

  it('draws a blue and a brown run for every strip of every pipe tile', () => {
    const renderer = new PipeOverlayRenderer(new THREE.Scene(), flat);
    renderer.rebuild(
      view({
        pipes: [
          { x: 3, z: 3 },
          { x: 4, z: 3 },
        ],
      }),
    );
    // Each tile: a hub along X and one arm toward the other; two triangles a strip.
    const { water, sewer, mainWater } = renderer.triangleCount();
    expect(water).toBe(2 * 2 * 2);
    expect(sewer).toBe(water);
    expect(mainWater).toBe(0);
  });

  it('draws the mains apart from the pipes, and joins a pipe to the main beside it', () => {
    const renderer = new PipeOverlayRenderer(new THREE.Scene(), flat);
    renderer.rebuild(view({ pipes: [{ x: 3, z: 3 }], mains: [{ x: 3, z: 2 }] }));
    const { water, mainWater } = renderer.triangleCount();
    // The pipe: a hub along Z and an arm north; the main: the same, south.
    expect(water).toBe(2 * 2);
    expect(mainWater).toBe(2 * 2);
  });

  it('draws a lead for every served building, in the pipes’ own run', () => {
    const renderer = new PipeOverlayRenderer(new THREE.Scene(), flat);
    renderer.rebuild(view({ leads: [{ x: 5, z: 5, dx: 0, dz: 1 }] }));
    expect(renderer.triangleCount().water).toBe(2);
    expect(renderer.triangleCount().sewer).toBe(2);
  });

  it('colours a run blue where the water reaches it and grey where it does not', () => {
    const renderer = new PipeOverlayRenderer(new THREE.Scene(), flat);
    renderer.rebuild(
      view({
        pipes: [
          { x: 1, z: 1 },
          { x: 2, z: 1 },
        ],
        wet: [{ x: 1, z: 1 }],
      }),
    );
    const wet = renderer.waterColorAt(1, 1)!;
    const dry = renderer.waterColorAt(2, 1)!;
    expect(wet[2]).toBeGreaterThan(wet[0]); // blue
    expect(Math.abs(dry[0] - dry[2])).toBeLessThan(0.05); // grey
    expect(renderer.waterColorAt(7, 7)).toBeNull();
  });

  it('runs a connection from the riser out past its footprint’s edge, tile to tile', () => {
    const renderer = new PipeOverlayRenderer(new THREE.Scene(), flat);
    renderer.rebuild(
      view({
        connections: [
          {
            run: [
              { x: 5, z: 5 },
              { x: 6, z: 5 },
            ],
            dx: 1,
            dz: 0,
          },
        ],
      }),
    );
    // The riser tile: a hub along X and an arm east; the edge tile: a hub, an arm west and an arm on east.
    expect(renderer.triangleCount().water).toBe((2 + 3) * 2);
  });

  it('stands a riser on every water building, and grows its pool by doubling', () => {
    const renderer = new PipeOverlayRenderer(new THREE.Scene(), flat);
    renderer.rebuild(view({ risers: [{ x: 1, z: 1 }] }));
    expect(renderer.riserCount()).toBe(1);
    renderer.rebuild(
      view({
        risers: [
          { x: 1, z: 1 },
          { x: 2, z: 2 },
          { x: 3, z: 3 },
        ],
      }),
    );
    expect(renderer.riserCount()).toBe(3);
  });

  it('is hidden until shown, and a rebuild never changes that', () => {
    const renderer = new PipeOverlayRenderer(new THREE.Scene(), flat);
    expect(renderer.isVisible()).toBe(false);
    renderer.rebuild(view({ pipes: [{ x: 1, z: 1 }] }));
    expect(renderer.isVisible()).toBe(false);
    renderer.setVisible(true);
    renderer.rebuild(view({ pipes: [{ x: 1, z: 1 }], risers: [{ x: 2, z: 2 }] }));
    expect(renderer.isVisible()).toBe(true);
  });

  it('stays solid underground: its meshes are tagged to keep', () => {
    const scene = new THREE.Scene();
    new PipeOverlayRenderer(scene, flat);
    const tagged = scene.children.filter((o) => o.userData['underground'] === 'keep');
    expect(tagged.length).toBe(scene.children.length);
    expect(tagged.length).toBeGreaterThan(0);
  });
});
