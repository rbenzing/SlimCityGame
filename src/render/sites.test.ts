import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  CRANE_ABOVE_STOREYS,
  ENCLOSED_FROM,
  FENCE_HEIGHT_M,
  FOUNDATION_FROM,
  FRAME_FROM,
  layoutSite,
  SCAFFOLD_ABOVE_STOREYS,
  SiteRenderer,
  siteStage,
  SiteStage,
  storeysOf,
  type SiteBody,
} from './sites';
import { FLOOR_HEIGHT_METERS } from './facade';
import { BuildingState, type BuildingInstance } from '../shared/types';

/** A single-tier body 10 m by 8 m rising `storeys` storeys, on a 20 m lot at the origin. */
function body(storeys: number): SiteBody {
  return {
    boxes: [{ w: 10, d: 8, h: storeys * FLOOR_HEIGHT_METERS, yOffset: 0 }],
    seat: { centerX: 10, centerZ: 10, groundY: 0, yaw: 0 },
    lot: { x0: 0, z0: 0, x1: 20, z1: 20 },
  };
}

function building(progress: number | undefined, id = 1): BuildingInstance {
  return {
    id,
    catalogId: 'x',
    x: 0,
    z: 0,
    rotation: 0,
    level: 1,
    state: BuildingState.Constructing,
    problems: 0,
    progress,
  };
}

const partsOf = (boxes: ReturnType<typeof layoutSite>, part: string): number =>
  boxes.filter((b) => b.part === part).length;

describe('siteStage', () => {
  it('starts as bare earth and ends enclosed, at the boundaries', () => {
    expect(siteStage(0, 1).stage).toBe(SiteStage.Earth);
    expect(siteStage(0, 20).stage).toBe(SiteStage.Earth);
    expect(siteStage(1, 1).stage).toBe(SiteStage.Enclosed);
    expect(siteStage(1, 20).stage).toBe(SiteStage.Enclosed);
    expect(siteStage(FOUNDATION_FROM - 0.001, 1).stage).toBe(SiteStage.Earth);
    expect(siteStage(FOUNDATION_FROM, 1).stage).toBe(SiteStage.Foundation);
    expect(siteStage(FRAME_FROM, 1).stage).toBe(SiteStage.Frame);
    expect(siteStage(ENCLOSED_FROM - 0.001, 1).stage).toBe(SiteStage.Frame);
    expect(siteStage(ENCLOSED_FROM, 1).stage).toBe(SiteStage.Enclosed);
  });

  it('clamps a progress outside 0..1', () => {
    expect(siteStage(-1, 3).stage).toBe(SiteStage.Earth);
    expect(siteStage(7, 3).stage).toBe(SiteStage.Enclosed);
  });

  it('frames a one-storey house in its one storey, with no scaffold and no crane', () => {
    for (let p = FRAME_FROM; p < ENCLOSED_FROM; p += 0.05) {
      const plan = siteStage(p, 1);
      expect(plan.stage).toBe(SiteStage.Frame);
      expect(plan.storeysBuilt).toBe(1);
    }
    const done = siteStage(0.9, 1);
    expect(done.scaffold).toBe(false);
    expect(done.crane).toBe(false);
  });

  it('raises a frame in at most five lifts, however tall, one for a house', () => {
    const lifts = (storeys: number): number => {
      const seen = new Set<number>();
      for (let p = FRAME_FROM; p < ENCLOSED_FROM; p += 0.005) {
        seen.add(siteStage(p, storeys).storeysBuilt);
      }
      return seen.size;
    };
    expect(lifts(1)).toBe(1);
    expect(lifts(3)).toBe(3);
    expect(lifts(20)).toBe(5);
    expect(siteStage(0.7, 20).storeysBuilt).toBe(20);
  });

  it('raises a tall building by whole lifts, never taking one back', () => {
    const storeys = 20;
    let last = 0;
    for (let p = FRAME_FROM; p < ENCLOSED_FROM; p += 0.025) {
      const built = siteStage(p, storeys).storeysBuilt;
      expect(built).toBeGreaterThanOrEqual(last);
      expect(built).toBeGreaterThanOrEqual(1);
      expect(built).toBeLessThanOrEqual(storeys);
      last = built;
    }
    expect(last).toBeGreaterThan(storeys / 2);
    expect(siteStage(0.5, storeys).crane).toBe(true);
    expect(siteStage(0.9, storeys).scaffold).toBe(true);
    expect(siteStage(0.1, storeys).crane).toBe(false);
  });

  it('puts scaffolding over two storeys and a crane over eight, and no sooner', () => {
    expect(siteStage(0.9, SCAFFOLD_ABOVE_STOREYS).scaffold).toBe(false);
    expect(siteStage(0.9, SCAFFOLD_ABOVE_STOREYS + 1).scaffold).toBe(true);
    expect(siteStage(0.9, CRANE_ABOVE_STOREYS).crane).toBe(false);
    expect(siteStage(0.9, CRANE_ABOVE_STOREYS + 1).crane).toBe(true);
  });
});

describe('layoutSite', () => {
  it('reads a body of 3.2 m storeys as that many storeys', () => {
    expect(storeysOf(body(1).boxes)).toBe(1);
    expect(storeysOf(body(12).boxes)).toBe(12);
  });

  it('shows only the fence and the site furniture on cleared earth, the fence 1.8 m high', () => {
    const all = layoutSite(body(1), 1, 0);
    expect(all.every((b) => b.part === 'fence' || b.part === 'furniture')).toBe(true);
    const boxes = all.filter((b) => b.part === 'fence');
    expect(boxes.length).toBeGreaterThan(0);
    const tops = boxes.map((b) => b.y + b.h / 2);
    expect(Math.max(...tops)).toBeCloseTo(FENCE_HEIGHT_M, 5);
    // Posts a panel apart, so the fence can be seen through to the site.
    expect(boxes.filter((b) => b.h >= FENCE_HEIGHT_M - 1e-9).length).toBeGreaterThanOrEqual(4);
    expect(boxes.every((b) => b.y - b.h / 2 >= -1e-9)).toBe(true);
  });

  it('adds a slab of the body footprint for the foundation', () => {
    const boxes = layoutSite(body(2), 1, FOUNDATION_FROM);
    const slab = boxes.filter((b) => b.part === 'slab');
    expect(slab).toHaveLength(1);
    expect(slab[0]!.w).toBe(10);
    expect(slab[0]!.d).toBe(8);
    expect(partsOf(boxes, 'frame')).toBe(0);
  });

  it('rises through the frame to the height the finished body will have', () => {
    const tall = body(12);
    const top = (p: number): number =>
      Math.max(
        ...layoutSite(tall, 1, p)
          .filter((b) => b.part === 'frame')
          .map((b) => b.y + b.h / 2),
      );
    expect(top(FRAME_FROM)).toBeLessThan(top(0.5));
    expect(top(0.5)).toBeLessThan(top(0.7));
    expect(top(0.7)).toBeLessThanOrEqual(12 * FLOOR_HEIGHT_METERS + 1e-9);
    const house = Math.max(
      ...layoutSite(body(1), 1, 0.4)
        .filter((b) => b.part === 'frame')
        .map((b) => b.y + b.h / 2),
    );
    expect(house).toBeCloseTo(FLOOR_HEIGHT_METERS, 5);
  });

  it('frames a house in timber and a tower in steel or concrete', () => {
    const colorOf = (b: SiteBody): string =>
      layoutSite(b, 1, 0.5)
        .find((x) => x.part === 'frame')!
        .color.map((c) => c.toFixed(3))
        .join();
    expect(colorOf(body(2))).not.toBe(colorOf(body(12)));
  });

  it('encloses a tall body with walls, scaffold and a crane, and a house with walls only', () => {
    const tower = layoutSite(body(12), 1, 0.9);
    expect(partsOf(tower, 'wall')).toBe(1);
    expect(partsOf(tower, 'scaffold')).toBeGreaterThan(0);
    expect(partsOf(tower, 'crane')).toBeGreaterThan(0);
    expect(partsOf(tower, 'frame')).toBe(0);
    const house = layoutSite(body(1), 1, 0.9);
    expect(partsOf(house, 'wall')).toBe(1);
    expect(partsOf(house, 'scaffold')).toBe(0);
    expect(partsOf(house, 'crane')).toBe(0);
  });

  it('furnishes a site from the earth stage with pieces inside the fence and off the body', () => {
    const big: SiteBody = { ...body(2), lot: { x0: -10, z0: -10, x1: 30, z1: 30 } };
    const earth = layoutSite(big, 3, 0).filter((b) => b.part === 'furniture');
    expect(earth.length).toBeGreaterThanOrEqual(3);
    for (const b of earth) {
      const turned = Math.abs(Math.sin(b.yaw)) > 0.5;
      const hx = (turned ? b.d : b.w) / 2;
      const hz = (turned ? b.w : b.d) / 2;
      expect(b.x - hx).toBeGreaterThanOrEqual(-10 + 0.5);
      expect(b.x + hx).toBeLessThanOrEqual(30 - 0.5);
      expect(b.z - hz).toBeGreaterThanOrEqual(-10 + 0.5);
      expect(b.z + hz).toBeLessThanOrEqual(30 - 0.5);
      // Off the body's 10 m by 8 m footprint at (10, 10).
      const clear = Math.abs(b.x - 10) >= 5 + hx || Math.abs(b.z - 10) >= 4 + hz;
      expect(clear).toBe(true);
      expect(b.y - b.h / 2).toBeCloseTo(0, 5);
    }
  });

  it('lays no furniture on a lot with no rectangle or no room', () => {
    expect(
      layoutSite({ ...body(2), lot: null }, 3, 0.5).filter((b) => b.part === 'furniture'),
    ).toHaveLength(0);
    const tight: SiteBody = { ...body(2), lot: { x0: 3, z0: 3, x1: 17, z1: 17 } };
    expect(layoutSite(tight, 3, 0.5).filter((b) => b.part === 'furniture')).toHaveLength(0);
  });

  it('gives a house site no cabin: its furniture is shorter than a cabin', () => {
    const lot = { x0: -10, z0: -10, x1: 30, z1: 30 };
    const heights = (house: boolean): number[] =>
      layoutSite({ ...body(2), lot, house }, 3, 0.1)
        .filter((b) => b.part === 'furniture')
        .map((b) => b.h);
    expect(heights(false)).toContain(2.6);
    expect(heights(true)).not.toContain(2.6);
    expect(heights(true)).toContain(1.4);
  });

  it('carts a spoil heap away once the frame rises', () => {
    const wide: SiteBody = {
      boxes: [{ w: 40, d: 30, h: 6.4, yOffset: 0 }],
      seat: { centerX: 50, centerZ: 30, groundY: 0, yaw: 0 },
      lot: { x0: 0, z0: 0, x1: 100, z1: 60 },
    };
    const heap = (p: number): number =>
      layoutSite(wide, 3, p).filter((b) => b.part === 'furniture' && b.h < 1).length;
    expect(heap(0.05)).toBeGreaterThan(0);
    expect(heap(0.5)).toBe(0);
  });

  it('keeps a handful of boxes a site', () => {
    for (const storeys of [1, 3, 12, 20]) {
      for (let p = 0; p < 1; p += 0.05) {
        expect(layoutSite(body(storeys), 7, p).length).toBeLessThan(100);
      }
    }
  });

  it('varies only by the id: the same id lays the same site', () => {
    expect(layoutSite(body(12), 5, 0.9)).toEqual(layoutSite(body(12), 5, 0.9));
    const jib = (id: number): number =>
      layoutSite(body(12), id, 0.9).filter((b) => b.part === 'crane')[1]!.yaw;
    expect(jib(5)).not.toBe(jib(6));
  });
});

describe('SiteRenderer', () => {
  const make = (storeys = 3): { renderer: SiteRenderer; scene: THREE.Scene } => {
    const scene = new THREE.Scene();
    return { renderer: new SiteRenderer(scene, () => body(storeys)), scene };
  };

  it('draws a site for a building under construction and releases it when it is finished', () => {
    const { renderer } = make();
    renderer.apply({ added: [building(0.5)], updated: [], removed: [] });
    expect(renderer.siteInstances(1)).toBeGreaterThan(0);
    renderer.apply({
      added: [],
      updated: [{ ...building(undefined), state: BuildingState.Active }],
      removed: [],
    });
    expect(renderer.siteInstances(1)).toBe(0);
    expect(renderer.instanceCount()).toBe(0);
  });

  it('releases a site when its building is removed, and reuses the slots', () => {
    const { renderer } = make();
    renderer.apply({ added: [building(0.5)], updated: [], removed: [] });
    const held = renderer.instanceCount();
    renderer.apply({ added: [], updated: [], removed: [1] });
    expect(renderer.instanceCount()).toBe(0);
    renderer.apply({ added: [building(0.5, 2)], updated: [], removed: [] });
    expect(renderer.instanceCount()).toBe(held);
  });

  it('redraws a site as the building progresses, without keeping the earlier stage', () => {
    const { renderer } = make(12);
    renderer.apply({ added: [building(0)], updated: [], removed: [] });
    const earth = renderer.siteInstances(1);
    renderer.apply({ added: [], updated: [building(0.5)], removed: [] });
    expect(renderer.siteInstances(1)).toBeGreaterThan(earth);
    renderer.apply({ added: [], updated: [building(0)], removed: [] });
    expect(renderer.siteInstances(1)).toBe(earth);
  });

  it('draws nothing for a building with no body to draw', () => {
    const scene = new THREE.Scene();
    const renderer = new SiteRenderer(scene, () => null);
    renderer.apply({ added: [building(0.5)], updated: [], removed: [] });
    expect(renderer.instanceCount()).toBe(0);
  });

  it('emits no light: no pool carries an emissive colour or node', () => {
    const { renderer, scene } = make(12);
    renderer.apply({ added: [building(0.9)], updated: [], removed: [] });
    const meshes = scene.children.filter(
      (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh,
    );
    expect(meshes.length).toBeGreaterThan(0);
    for (const mesh of meshes) {
      const material = mesh.material as THREE.MeshStandardMaterial & { emissiveNode?: unknown };
      expect(material.emissive.getHex()).toBe(0);
      expect(material.emissiveNode ?? null).toBeNull();
      expect(material.emissiveIntensity === 0 || material.emissive.getHex() === 0).toBe(true);
    }
  });

  it('allocates no pool below the minimum size', () => {
    const { renderer, scene } = make();
    renderer.apply({ added: [building(0.5)], updated: [], removed: [] });
    const meshes = scene.children.filter(
      (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh,
    );
    for (const mesh of meshes) expect(mesh.instanceMatrix.count).toBeGreaterThanOrEqual(2048);
  });
});
