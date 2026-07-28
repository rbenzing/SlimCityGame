import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  PedestrianRenderer,
  computeIdlePlacements,
  computeWalkOffset,
  computeWalkerBuildingIds,
  idleCountForStop,
  idleOffset,
  idleTint,
  isWalkerBuilding,
  walkAnchorOffset,
  walkerTint,
  IDLE_MIN_PER_STOP,
  IDLE_MAX_PER_STOP,
  MAX_IDLE_PEDESTRIANS,
  MAX_WALKING_PEDESTRIANS,
  MAX_PEDESTRIANS,
  type PedestrianSnapshot,
} from './pedestrians';
import {
  BuildingState,
  type BuildingDelta,
  type BuildingInstance,
  type TilePoint,
} from '../shared/types';

const flatHeightAt = (): number => 0;

function emptyDelta(): BuildingDelta {
  return { added: [], removed: [], updated: [] };
}

function building(
  id: number,
  x: number,
  z: number,
  state: BuildingState = BuildingState.Active,
): BuildingInstance {
  return { id, catalogId: 'house', x, z, rotation: 0, level: 1, state, problems: 0 };
}

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

describe('idleCountForStop (pure)', () => {
  it('is within [IDLE_MIN_PER_STOP, IDLE_MAX_PER_STOP]', () => {
    for (let x = 0; x < 50; x += 1) {
      const count = idleCountForStop(x, x * 3 + 1);
      expect(count).toBeGreaterThanOrEqual(IDLE_MIN_PER_STOP);
      expect(count).toBeLessThanOrEqual(IDLE_MAX_PER_STOP);
    }
  });

  it('is deterministic for the same tile coords', () => {
    expect(idleCountForStop(12, 34)).toBe(idleCountForStop(12, 34));
  });

  it('varies across different stops (not a constant)', () => {
    const counts = new Set<number>();
    for (let x = 0; x < 30; x += 1) counts.add(idleCountForStop(x, x * 17 + 5));
    expect(counts.size).toBeGreaterThan(1);
  });
});

describe('idleOffset / idleTint (pure)', () => {
  it('is deterministic for the same (x, z, personIndex)', () => {
    expect(idleOffset(5, 9, 0)).toEqual(idleOffset(5, 9, 0));
    expect(idleTint(5, 9, 0)).toBe(idleTint(5, 9, 0));
  });

  it('differs between person indices at the same stop', () => {
    const a = idleOffset(5, 9, 0);
    const b = idleOffset(5, 9, 1);
    expect(a).not.toEqual(b);
  });

  it('produces a tint in [0, 1)', () => {
    for (let i = 0; i < 10; i += 1) {
      const t = idleTint(1, 2, i);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(1);
    }
  });
});

describe('computeIdlePlacements (pure)', () => {
  it('produces idleCountForStop(x,z) placements per unique stop', () => {
    const stops: TilePoint[] = [
      { x: 0, z: 0 },
      { x: 5, z: 5 },
    ];
    const placements = computeIdlePlacements(stops);
    const expectedTotal = idleCountForStop(0, 0) + idleCountForStop(5, 5);
    expect(placements.length).toBe(expectedTotal);
  });

  it('deduplicates stops sharing the same tile', () => {
    const stops: TilePoint[] = [
      { x: 3, z: 3 },
      { x: 3, z: 3 },
    ];
    const placements = computeIdlePlacements(stops);
    expect(placements.length).toBe(idleCountForStop(3, 3));
  });

  it('is deterministic and order-independent', () => {
    const a = computeIdlePlacements([
      { x: 0, z: 0 },
      { x: 5, z: 5 },
      { x: 9, z: 1 },
    ]);
    const b = computeIdlePlacements([
      { x: 9, z: 1 },
      { x: 5, z: 5 },
      { x: 0, z: 0 },
    ]);
    expect(a).toEqual(b);
  });

  it('is empty for an empty stop list', () => {
    expect(computeIdlePlacements([])).toEqual([]);
  });

  it('never exceeds MAX_IDLE_PEDESTRIANS regardless of stop count', () => {
    const stops: TilePoint[] = [];
    for (let i = 0; i < 200; i += 1) stops.push({ x: i, z: i * 2 });
    const placements = computeIdlePlacements(stops);
    expect(placements.length).toBeLessThanOrEqual(MAX_IDLE_PEDESTRIANS);
    expect(placements.length).toBeGreaterThan(0);
  });
});

describe('isWalkerBuilding / computeWalkerBuildingIds (pure)', () => {
  it('is deterministic for the same building id', () => {
    expect(isWalkerBuilding(42)).toBe(isWalkerBuilding(42));
  });

  it('is a minority of buildings ("sparse")', () => {
    let picked = 0;
    const total = 500;
    for (let id = 0; id < total; id += 1) if (isWalkerBuilding(id)) picked += 1;
    expect(picked).toBeGreaterThan(0);
    expect(picked).toBeLessThan(total * 0.4);
  });

  it('only selects Active buildings', () => {
    const buildings: BuildingInstance[] = [];
    for (let id = 0; id < 200; id += 1) {
      buildings.push(building(id, id, id, BuildingState.Constructing));
    }
    expect(computeWalkerBuildingIds(buildings)).toEqual([]);
  });

  it('never exceeds MAX_WALKING_PEDESTRIANS regardless of Active building count', () => {
    const buildings: BuildingInstance[] = [];
    for (let id = 0; id < 2000; id += 1) buildings.push(building(id, id, id));
    const ids = computeWalkerBuildingIds(buildings);
    expect(ids.length).toBeLessThanOrEqual(MAX_WALKING_PEDESTRIANS);
    expect(ids.length).toBeGreaterThan(0);
  });

  it('is stably ordered (ascending id) so truncation is deterministic', () => {
    const buildings: BuildingInstance[] = [];
    for (let id = 0; id < 2000; id += 1) buildings.push(building(id, id, id));
    const ids = computeWalkerBuildingIds(buildings);
    const sorted = [...ids].sort((a, b) => a - b);
    expect(ids).toEqual(sorted);
  });
});

describe('computeWalkOffset / walkAnchorOffset (pure)', () => {
  it('is deterministic for the same (buildingId, tMs)', () => {
    expect(computeWalkOffset(7, 3000)).toEqual(computeWalkOffset(7, 3000));
  });

  it('advances (changes) as tMs increases', () => {
    const a = computeWalkOffset(7, 0);
    const b = computeWalkOffset(7, 4000);
    const c = computeWalkOffset(7, 8000);
    expect(a).not.toEqual(b);
    expect(b).not.toEqual(c);
  });

  it('offset stays within the walk amplitude bound on either axis', () => {
    for (let t = 0; t < 20000; t += 777) {
      const s = computeWalkOffset(11, t);
      const magnitude = Math.hypot(s.dx, s.dz);
      expect(magnitude).toBeLessThanOrEqual(16 * 0.9 + 1e-6);
    }
  });

  it('walkAnchorOffset is deterministic and nonzero', () => {
    const a = walkAnchorOffset(3);
    expect(walkAnchorOffset(3)).toEqual(a);
    expect(Math.hypot(a.x, a.z)).toBeGreaterThan(0);
  });

  it('walkerTint is deterministic and in [0, 1)', () => {
    expect(walkerTint(3)).toBe(walkerTint(3));
    expect(walkerTint(3)).toBeGreaterThanOrEqual(0);
    expect(walkerTint(3)).toBeLessThan(1);
  });
});

// ---------------------------------------------------------------------------
// PedestrianRenderer
// ---------------------------------------------------------------------------

describe('PedestrianRenderer.apply', () => {
  it('creates idling pedestrians at stops with no buildings', () => {
    const scene = new THREE.Scene();
    const renderer = new PedestrianRenderer(scene, flatHeightAt);
    const stops: TilePoint[] = [
      { x: 0, z: 0 },
      { x: 10, z: 10 },
    ];
    const snapshot: PedestrianSnapshot = { stops, buildings: emptyDelta() };
    renderer.apply(snapshot);

    const expectedIdle = idleCountForStop(0, 0) + idleCountForStop(10, 10);
    expect(renderer.idleCount()).toBe(expectedIdle);
    expect(renderer.walkerCount()).toBe(0);
    expect(renderer.totalCount()).toBe(expectedIdle);

    const instancedMeshes = scene.children.filter((c) => c instanceof THREE.InstancedMesh);
    expect(instancedMeshes).toHaveLength(2); // body + head
    for (const mesh of instancedMeshes as THREE.InstancedMesh[]) {
      expect(mesh.count).toBe(expectedIdle);
      expect(mesh.castShadow).toBe(true);
    }
  });

  it('scales pedestrian count with the number of stops', () => {
    const scene = new THREE.Scene();
    const renderer = new PedestrianRenderer(scene, flatHeightAt);
    renderer.apply({ stops: [{ x: 0, z: 0 }], buildings: emptyDelta() });
    const fewCount = renderer.idleCount();

    const manyStops: TilePoint[] = [];
    for (let i = 0; i < 20; i += 1) manyStops.push({ x: i, z: i + 1 });
    renderer.apply({ stops: manyStops, buildings: emptyDelta() });
    const manyCount = renderer.idleCount();

    expect(manyCount).toBeGreaterThan(fewCount);
  });

  it('tracks Active buildings incrementally across successive BuildingDelta applies', () => {
    const scene = new THREE.Scene();
    const renderer = new PedestrianRenderer(scene, flatHeightAt);

    const buildings: BuildingInstance[] = [];
    for (let id = 0; id < 300; id += 1) buildings.push(building(id, id, id));

    renderer.apply({ stops: [], buildings: { added: buildings, removed: [], updated: [] } });
    const walkerCountAfterAdd = renderer.walkerCount();
    expect(walkerCountAfterAdd).toBeGreaterThan(0);

    // A second apply with an EMPTY buildings delta must not lose the tracked set.
    renderer.apply({ stops: [], buildings: emptyDelta() });
    expect(renderer.walkerCount()).toBe(walkerCountAfterAdd);

    // Removing every building drops the walker scatter back to 0.
    renderer.apply({
      stops: [],
      buildings: { added: [], removed: buildings.map((b) => b.id), updated: [] },
    });
    expect(renderer.walkerCount()).toBe(0);
  });

  it('non-Active buildings never spawn a walker', () => {
    const scene = new THREE.Scene();
    const renderer = new PedestrianRenderer(scene, flatHeightAt);
    const constructing: BuildingInstance[] = [];
    for (let id = 0; id < 200; id += 1)
      constructing.push(building(id, id, id, BuildingState.Constructing));
    renderer.apply({ stops: [], buildings: { added: constructing, removed: [], updated: [] } });
    expect(renderer.walkerCount()).toBe(0);
  });

  it('respects the overall MAX_PEDESTRIANS cap with many stops AND many buildings', () => {
    const scene = new THREE.Scene();
    const renderer = new PedestrianRenderer(scene, flatHeightAt);

    const stops: TilePoint[] = [];
    for (let i = 0; i < 200; i += 1) stops.push({ x: i, z: i * 3 + 1 });
    const buildings: BuildingInstance[] = [];
    for (let id = 0; id < 2000; id += 1) buildings.push(building(id, id * 2, id * 2 + 1));

    renderer.apply({ stops, buildings: { added: buildings, removed: [], updated: [] } });

    expect(renderer.totalCount()).toBeLessThanOrEqual(MAX_PEDESTRIANS);
    expect(renderer.totalCount()).toBeGreaterThan(0);

    const instancedMeshes = scene.children.filter(
      (c) => c instanceof THREE.InstancedMesh,
    ) as THREE.InstancedMesh[];
    for (const mesh of instancedMeshes) expect(mesh.count).toBeLessThanOrEqual(MAX_PEDESTRIANS);
  });

  it('a second apply() disposes the previous meshes instead of accumulating them', () => {
    const scene = new THREE.Scene();
    const renderer = new PedestrianRenderer(scene, flatHeightAt);
    renderer.apply({ stops: [{ x: 0, z: 0 }], buildings: emptyDelta() });
    const firstChildren = [...scene.children];

    renderer.apply({ stops: [{ x: 0, z: 0 }], buildings: emptyDelta() });
    for (const child of firstChildren) expect(scene.children).not.toContain(child);
  });

  it('an empty snapshot clears everything back to zero', () => {
    const scene = new THREE.Scene();
    const renderer = new PedestrianRenderer(scene, flatHeightAt);
    renderer.apply({ stops: [{ x: 0, z: 0 }], buildings: emptyDelta() });
    renderer.apply({ stops: [], buildings: emptyDelta() });

    expect(renderer.idleCount()).toBe(0);
    expect(renderer.walkerCount()).toBe(0);
    expect(renderer.totalCount()).toBe(0);
    expect(scene.children).toHaveLength(0);
  });
});

describe('PedestrianRenderer.update', () => {
  it('advances walker positions over accumulated tMs', () => {
    const scene = new THREE.Scene();
    const renderer = new PedestrianRenderer(scene, flatHeightAt);

    const buildings: BuildingInstance[] = [];
    for (let id = 0; id < 50; id += 1) buildings.push(building(id, id, id));
    renderer.apply({ stops: [], buildings: { added: buildings, removed: [], updated: [] } });
    expect(renderer.walkerCount()).toBeGreaterThan(0);

    const bodyMesh = scene.children.find(
      (c) => c instanceof THREE.InstancedMesh && c.count === renderer.totalCount(),
    ) as THREE.InstancedMesh;
    expect(bodyMesh).toBeDefined();

    const before = new THREE.Matrix4();
    bodyMesh.getMatrixAt(renderer.idleCount(), before);
    const beforePos = new THREE.Vector3().setFromMatrixPosition(before);

    renderer.update(9000);

    const after = new THREE.Matrix4();
    bodyMesh.getMatrixAt(renderer.idleCount(), after);
    const afterPos = new THREE.Vector3().setFromMatrixPosition(after);

    expect(afterPos.distanceTo(beforePos)).toBeGreaterThan(0);
  });

  it('is a no-op before any apply() (no meshes yet)', () => {
    const scene = new THREE.Scene();
    const renderer = new PedestrianRenderer(scene, flatHeightAt);
    expect(() => renderer.update(1000)).not.toThrow();
  });
});

describe('PedestrianRenderer.setVisible', () => {
  it('toggles visibility on every owned mesh without disposing them', () => {
    const scene = new THREE.Scene();
    const renderer = new PedestrianRenderer(scene, flatHeightAt);
    renderer.apply({ stops: [{ x: 0, z: 0 }], buildings: emptyDelta() });

    renderer.setVisible(false);
    expect(renderer.isVisible()).toBe(false);
    for (const child of scene.children) expect((child as THREE.Object3D).visible).toBe(false);

    renderer.setVisible(true);
    for (const child of scene.children) expect((child as THREE.Object3D).visible).toBe(true);
  });
});

describe('PedestrianRenderer.dispose', () => {
  it('removes every owned mesh from the scene', () => {
    const scene = new THREE.Scene();
    const renderer = new PedestrianRenderer(scene, flatHeightAt);
    renderer.apply({ stops: [{ x: 0, z: 0 }], buildings: emptyDelta() });
    expect(scene.children.length).toBeGreaterThan(0);

    renderer.dispose();
    expect(scene.children).toHaveLength(0);
  });
});
