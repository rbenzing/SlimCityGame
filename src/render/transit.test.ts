import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  TransitRenderer,
  MAX_TRANSIT_VEHICLE_SLOTS,
  TRAIN_CARS_PER_SET,
  TRAM_CARS_PER_SET,
  toWorldPoints,
  polylineLength,
  sampleAlongPolyline,
  computeStopHeading,
  computeShelterLayout,
  shelterSide,
  buildTramCarGeometry,
  TRAM_CAR_SIZE,
  TRAM_FLOOR_ABOVE_ORIGIN_M,
  type TransitSnapshot,
} from './transit';
import { BUS_SHELTER } from './busshelter';
import {
  computeGuideway,
  GUIDEWAY_BEAM_TOP_M,
  TRAM_FLOOR_ABOVE_BEAM_M,
  type GuidewaySeatSampler,
} from './guideway';
import { composeProfile, NO_EDITS, presetProfileForTier } from '../shared/roadprofile';
import { RoadTier } from '../shared/types';
import type { TransitLine } from '../shared/types';
import { TILE_METERS, tileToWorld } from '../shared/constants';
import { COMMERCIAL_SPEED_MPS } from '../shared/transitfleet';

const flatHeightAt = (): number => 0;

describe('the vehicles a line draws', () => {
  const route = [
    { x: 0, z: 0 },
    { x: 40, z: 0 },
  ];

  it('draws exactly the vehicles the sim says the line runs, whatever its ridership', () => {
    const scene = new THREE.Scene();
    const renderer = new TransitRenderer(scene, flatHeightAt);
    renderer.apply({ lines: [line(1, route, 1)], ridership: [10_000], served: [3] });
    expect(renderer.busCount()).toBe(3);

    renderer.apply({ lines: [line(1, route, 1)], ridership: [10_000], served: [0] });
    expect(renderer.busCount()).toBe(0);
  });

  it('hides the loop outside the service span and keeps the ribbon and shelters, then shows it again', () => {
    const scene = new THREE.Scene();
    const renderer = new TransitRenderer(scene, flatHeightAt);
    // Three buses on a two-stop line: the only instanced mesh with three instances is the buses'.
    renderer.apply({ lines: [line(1, route, 1)], ridership: [0], served: [3] });
    const mesh = scene.children.find(
      (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh && c.count === 3,
    )!;
    const m = new THREE.Matrix4();
    const s = new THREE.Vector3();
    const drawn = (): boolean[] => {
      const out: boolean[] = [];
      for (let i = 0; i < 3; i += 1) {
        mesh.getMatrixAt(i, m);
        s.setFromMatrixScale(m);
        out.push(s.x > 0);
      }
      return out;
    };

    renderer.setDayHour(3);
    renderer.update(0.1);
    expect(renderer.isRunning()).toBe(false);
    expect(drawn()).toEqual([false, false, false]);
    expect(renderer.busCount()).toBe(3);
    expect(renderer.stopCount()).toBe(2);
    expect(renderer.lineCount()).toBe(1);

    renderer.setDayHour(12);
    renderer.update(0.1);
    expect(renderer.isRunning()).toBe(true);
    expect(drawn()).toEqual([true, true, true]);

    // The span is [05:00, 23:00): the first minute of service runs, the last minute of the day does not.
    renderer.setDayHour(5);
    expect(renderer.isRunning()).toBe(true);
    renderer.setDayHour(23);
    expect(renderer.isRunning()).toBe(false);
  });

  it('draws nothing for a snapshot with no served figures, as an older worker sends', () => {
    const scene = new THREE.Scene();
    const renderer = new TransitRenderer(scene, flatHeightAt);
    renderer.apply({ lines: [line(1, route, 1)], ridership: [500] });
    expect(renderer.busCount()).toBe(0);
  });

  it('spaces the vehicles at one served-th of the route', () => {
    const scene = new THREE.Scene();
    const renderer = new TransitRenderer(scene, flatHeightAt);
    renderer.apply({ lines: [line(1, route, 1)], ridership: [0], served: [4] });
    const mesh = scene.children.find(
      (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh && c.count === 4,
    )!;
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const xs: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      mesh.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      xs.push(p.x);
    }
    const gaps = xs.slice(1).map((x, i) => x - xs[i]!);
    for (const gap of gaps) expect(gap).toBeCloseTo(polylineLength(toWorldPoints(route)) / 4, 6);
  });

  it('moves a bus at its commercial speed, not a cosmetic one', () => {
    const scene = new THREE.Scene();
    const renderer = new TransitRenderer(scene, flatHeightAt);
    renderer.apply({ lines: [line(1, route, 1)], ridership: [0], served: [1] });
    const mesh = scene.children.find(
      (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh && c.count === 1,
    )!;
    const m = new THREE.Matrix4();
    const before = new THREE.Vector3();
    mesh.getMatrixAt(0, m);
    before.setFromMatrixPosition(m);
    renderer.update(1);
    const after = new THREE.Vector3();
    mesh.getMatrixAt(0, m);
    after.setFromMatrixPosition(m);
    expect(after.x - before.x).toBeCloseTo(COMMERCIAL_SPEED_MPS.bus, 6);
    expect(COMMERCIAL_SPEED_MPS.bus).toBeCloseTo(5.56, 6);
  });

  it('holds slots for the largest depot fleet on every line', () => {
    expect(MAX_TRANSIT_VEHICLE_SLOTS).toBe(32 * 36 * TRAIN_CARS_PER_SET);
  });
});

describe('toWorldPoints / polylineLength (pure)', () => {
  it('converts tile coordinates to world space via tileToWorld', () => {
    const points = toWorldPoints([
      { x: 0, z: 0 },
      { x: 2, z: 0 },
    ]);
    expect(points).toEqual([
      { x: tileToWorld(0), z: tileToWorld(0) },
      { x: tileToWorld(2), z: tileToWorld(0) },
    ]);
  });

  it('sums Euclidean segment lengths', () => {
    const points = [
      { x: 0, z: 0 },
      { x: 3, z: 0 },
      { x: 3, z: 4 },
    ];
    expect(polylineLength(points)).toBeCloseTo(3 + 4, 6);
  });

  it('is 0 for a single point or empty polyline', () => {
    expect(polylineLength([])).toBe(0);
    expect(polylineLength([{ x: 5, z: 5 }])).toBe(0);
  });
});

describe('sampleAlongPolyline (pure)', () => {
  const points = [
    { x: 0, z: 0 },
    { x: 10, z: 0 },
  ];

  it('returns the start point (heading toward the next) at distance 0', () => {
    const s = sampleAlongPolyline(points, 0);
    expect(s.x).toBeCloseTo(0, 6);
    expect(s.z).toBeCloseTo(0, 6);
    expect(s.heading).toBeCloseTo(Math.PI / 2, 6); // travel +X -> atan2(dx=10,dz=0)
  });

  it('returns the midpoint at half the total length', () => {
    const s = sampleAlongPolyline(points, 5);
    expect(s.x).toBeCloseTo(5, 6);
    expect(s.z).toBeCloseTo(0, 6);
  });

  it('returns the end point at the full length', () => {
    const s = sampleAlongPolyline(points, 10);
    expect(s.x).toBeCloseTo(10, 6);
    expect(s.z).toBeCloseTo(0, 6);
  });

  it('clamps distance beyond either end of the polyline', () => {
    const under = sampleAlongPolyline(points, -5);
    const over = sampleAlongPolyline(points, 50);
    expect(under.x).toBeCloseTo(0, 6);
    expect(over.x).toBeCloseTo(10, 6);
  });

  it('handles a degenerate single-point polyline without throwing', () => {
    const s = sampleAlongPolyline([{ x: 5, z: 5 }], 3);
    expect(s.x).toBe(5);
    expect(s.z).toBe(5);
  });

  it('handles an empty polyline without throwing', () => {
    expect(() => sampleAlongPolyline([], 0)).not.toThrow();
  });

  it('follows a multi-segment path (corner turn)', () => {
    const corner = [
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      { x: 10, z: 10 },
    ];
    const atCorner = sampleAlongPolyline(corner, 10);
    expect(atCorner.x).toBeCloseTo(10, 6);
    expect(atCorner.z).toBeCloseTo(0, 6);
    const pastCorner = sampleAlongPolyline(corner, 15);
    expect(pastCorner.x).toBeCloseTo(10, 6);
    expect(pastCorner.z).toBeCloseTo(5, 6);
  });
});

describe('computeStopHeading (pure)', () => {
  it('points toward the next stop for a non-last stop', () => {
    const points = [
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      { x: 10, z: 10 },
    ];
    expect(computeStopHeading(points, 0)).toBeCloseTo(Math.PI / 2, 6); // +X
    expect(computeStopHeading(points, 1)).toBeCloseTo(0, 6); // +Z
  });

  it('points from the previous stop for the LAST stop (keeps incoming heading)', () => {
    const points = [
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      { x: 10, z: 10 },
    ];
    expect(computeStopHeading(points, 2)).toBeCloseTo(0, 6); // same as segment 1->2
  });

  it('falls back to 0 for a lone-stop line', () => {
    expect(computeStopHeading([{ x: 5, z: 5 }], 0)).toBe(0);
  });

  it('is deterministic for the same inputs', () => {
    const points = [
      { x: 0, z: 0 },
      { x: 3, z: 4 },
    ];
    expect(computeStopHeading(points, 0)).toBe(computeStopHeading(points, 0));
  });
});

describe('shelterSide (pure)', () => {
  it('is deterministic for the same tile coords', () => {
    expect(shelterSide(3, 7)).toBe(shelterSide(3, 7));
  });

  it('returns either 1 or -1', () => {
    for (let x = 0; x < 20; x += 1) expect([1, -1]).toContain(shelterSide(x, x * 5 + 1));
  });
});

describe('computeShelterLayout (pure)', () => {
  it('places the 2 roof posts symmetrically around the anchor+lateral-offset center, along the heading axis', () => {
    const layout = computeShelterLayout({ x: 0, z: 0 }, 0, 1); // heading 0 -> along +Z
    // side=1, heading=0 -> perp = (cos0, -sin0)*1 = (1,0): center offsets along +X
    expect(layout.postA.z).toBeGreaterThan(0);
    expect(layout.postB.z).toBeLessThan(0);
    expect(layout.postA.x).toBeCloseTo(layout.postB.x, 6);
    expect(layout.roofCenter.x).toBeCloseTo(layout.benchCenter.x, 6);
    expect(layout.roofCenter.z).toBeCloseTo(layout.benchCenter.z, 6);
  });

  it('is deterministic for the same inputs', () => {
    const a = computeShelterLayout({ x: 5, z: 5 }, 0.4, -1);
    const b = computeShelterLayout({ x: 5, z: 5 }, 0.4, -1);
    expect(a).toEqual(b);
  });

  it('the sign pole sits beyond one end of the shelter, further from center than either roof post', () => {
    const anchor = { x: 0, z: 0 };
    const layout = computeShelterLayout(anchor, 0, 1);
    const distA = Math.hypot(
      layout.postA.x - layout.roofCenter.x,
      layout.postA.z - layout.roofCenter.z,
    );
    const distSign = Math.hypot(
      layout.signPole.x - layout.roofCenter.x,
      layout.signPole.z - layout.roofCenter.z,
    );
    expect(distSign).toBeGreaterThan(distA);
  });

  it('flipping side mirrors the shelter to the other side of the anchor', () => {
    const left = computeShelterLayout({ x: 0, z: 0 }, 0, 1);
    const right = computeShelterLayout({ x: 0, z: 0 }, 0, -1);
    expect(left.roofCenter.x).toBeCloseTo(-right.roofCenter.x, 6);
  });
});

// ---------------------------------------------------------------------------
// TransitRenderer
// ---------------------------------------------------------------------------

function line(id: number, stops: { x: number; z: number }[], color: number): TransitLine {
  return { id, stops, color };
}

describe('TransitRenderer.apply', () => {
  it('creates one bus-stop shelter (roof posts + roof + bench + sign pole + sign) per stop across every line', () => {
    const scene = new THREE.Scene();
    const renderer = new TransitRenderer(scene, flatHeightAt);
    const snapshot: TransitSnapshot = {
      lines: [
        line(
          1,
          [
            { x: 0, z: 0 },
            { x: 5, z: 0 },
          ],
          0xff0000,
        ),
        line(
          2,
          [
            { x: 10, z: 10 },
            { x: 12, z: 10 },
            { x: 14, z: 10 },
          ],
          0x00ff00,
        ),
      ],
      ridership: [0, 0],
    };
    renderer.apply(snapshot);

    expect(renderer.stopCount()).toBe(5);
    expect(renderer.lineCount()).toBe(2);

    // the shared shelter + sign pole + sign (no buses since ridership is 0 for both lines)
    expect(renderer.shelterInstanceCount()).toBe(5);
    expect(renderer.signPoleInstanceCount()).toBe(5);
    expect(renderer.signInstanceCount()).toBe(5);

    const instancedMeshes = scene.children.filter(
      (c) => c instanceof THREE.InstancedMesh,
    ) as THREE.InstancedMesh[];
    expect(instancedMeshes).toHaveLength(3);
  });

  it('draws the shared bus shelter, its long axis along the route and its open front toward the stop', () => {
    const scene = new THREE.Scene();
    const renderer = new TransitRenderer(scene, flatHeightAt);
    renderer.apply({
      lines: [
        line(
          1,
          [
            { x: 0, z: 0 },
            { x: 5, z: 0 },
          ],
          0xff0000,
        ),
      ],
      ridership: [0],
    });
    const shelter = scene.children.find(
      (c) => c instanceof THREE.InstancedMesh,
    ) as THREE.InstancedMesh;
    const geometry = shelter.geometry;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    expect(box.max.x - box.min.x).toBeCloseTo(BUS_SHELTER.w + 2 * BUS_SHELTER.overhang, 6);
    expect(box.max.z - box.min.z).toBeCloseTo(BUS_SHELTER.d + 2 * BUS_SHELTER.overhang, 6);
    expect(box.max.y).toBeCloseTo(BUS_SHELTER.clear + BUS_SHELTER.roof, 6);

    // The first stop heads +X (toward the second), so the shelter's long
    // axis lies along X and its front faces back across its side offset.
    const m = new THREE.Matrix4();
    renderer.getShelterMatrix(0, m);
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    m.decompose(p, q, new THREE.Vector3());
    const along = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    expect(Math.abs(along.x)).toBeCloseTo(1, 6);
    const front = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const toStop = new THREE.Vector3(tileToWorld(0) - p.x, 0, tileToWorld(0) - p.z).normalize();
    expect(front.dot(toStop)).toBeCloseTo(1, 6);
  });

  it('draws no shelter and no sign where a plopped bus stop stands on the stop tile, and keeps the others', () => {
    const scene = new THREE.Scene();
    const renderer = new TransitRenderer(scene, flatHeightAt);
    const snapshot: TransitSnapshot = {
      lines: [
        line(
          1,
          [
            { x: 0, z: 0 },
            { x: 5, z: 0 },
            { x: 9, z: 0 },
          ],
          0xff0000,
        ),
      ],
      ridership: [0],
    };
    renderer.apply(snapshot, (x, z) => x === 5 && z === 0);
    expect(renderer.stopCount()).toBe(2);
    expect(renderer.shelterInstanceCount()).toBe(2);
    expect(renderer.signPoleInstanceCount()).toBe(2);
    expect(renderer.signInstanceCount()).toBe(2);

    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    for (const slot of [0, 1]) {
      renderer.getShelterMatrix(slot, m);
      m.decompose(p, new THREE.Quaternion(), new THREE.Vector3());
      expect(Math.abs(p.x - tileToWorld(5))).toBeGreaterThan(TILE_METERS / 2);
    }

    renderer.apply(snapshot);
    expect(renderer.stopCount()).toBe(3);
    expect(renderer.shelterInstanceCount()).toBe(3);
  });

  it('casts and receives shadows on every shelter mesh (UI-SPEC §15 #3)', () => {
    const scene = new THREE.Scene();
    const renderer = new TransitRenderer(scene, flatHeightAt);
    renderer.apply({
      lines: [
        line(
          1,
          [
            { x: 0, z: 0 },
            { x: 5, z: 0 },
          ],
          0xff0000,
        ),
      ],
      ridership: [0],
    });

    const instancedMeshes = scene.children.filter(
      (c) => c instanceof THREE.InstancedMesh,
    ) as THREE.InstancedMesh[];
    expect(instancedMeshes.length).toBeGreaterThan(0);
    for (const mesh of instancedMeshes) {
      expect(mesh.castShadow).toBe(true);
      expect(mesh.receiveShadow).toBe(true);
    }
  });

  it('a lone-stop line still gets a full shelter (heading falls back to 0)', () => {
    const scene = new THREE.Scene();
    const renderer = new TransitRenderer(scene, flatHeightAt);
    renderer.apply({ lines: [line(1, [{ x: 3, z: 3 }], 0xff0000)], ridership: [0] });

    expect(renderer.stopCount()).toBe(1);
    expect(renderer.shelterInstanceCount()).toBe(1);
    expect(renderer.signPoleInstanceCount()).toBe(1);
    expect(renderer.signInstanceCount()).toBe(1);
  });

  it('shelter placement is deterministic: two applies of the same snapshot produce identical instance transforms', () => {
    const snapshot: TransitSnapshot = {
      lines: [
        line(
          1,
          [
            { x: 0, z: 0 },
            { x: 5, z: 0 },
            { x: 5, z: 5 },
          ],
          0xff0000,
        ),
      ],
      ridership: [0],
    };

    const sceneA = new THREE.Scene();
    const rendererA = new TransitRenderer(sceneA, flatHeightAt);
    rendererA.apply(snapshot);
    // buildShelters() always adds the shelter mesh first (scene.add(shelter, signPole, sign)).
    const meshA = sceneA.children[0] as THREE.InstancedMesh;
    const matrixA = new THREE.Matrix4();
    meshA.getMatrixAt(0, matrixA);

    const sceneB = new THREE.Scene();
    const rendererB = new TransitRenderer(sceneB, flatHeightAt);
    rendererB.apply(snapshot);
    const meshB = sceneB.children[0] as THREE.InstancedMesh;
    const matrixB = new THREE.Matrix4();
    meshB.getMatrixAt(0, matrixB);

    expect(matrixA.toArray()).toEqual(matrixB.toArray());
  });

  it('produces a route ribbon mesh for a line with >= 2 stops, and no ribbon for a lone-stop line', () => {
    const scene = new THREE.Scene();
    const renderer = new TransitRenderer(scene, flatHeightAt);
    renderer.apply({
      lines: [
        line(
          1,
          [
            { x: 0, z: 0 },
            { x: 5, z: 0 },
          ],
          0xff0000,
        ),
      ],
      ridership: [0],
    });

    const ribbon = scene.children.find(
      (c) => c instanceof THREE.Mesh && !(c instanceof THREE.InstancedMesh),
    );
    expect(ribbon).toBeDefined();

    const scene2 = new THREE.Scene();
    const renderer2 = new TransitRenderer(scene2, flatHeightAt);
    renderer2.apply({ lines: [line(1, [{ x: 0, z: 0 }], 0xff0000)], ridership: [0] });
    const noRibbon = scene2.children.find(
      (c) => c instanceof THREE.Mesh && !(c instanceof THREE.InstancedMesh),
    );
    expect(noRibbon).toBeUndefined();
    // But the single stop still gets its post.
    expect(renderer2.stopCount()).toBe(1);
  });

  it('spawns cosmetic buses per line as the snapshot serves them', () => {
    const scene = new THREE.Scene();
    const renderer = new TransitRenderer(scene, flatHeightAt);
    const busyLine = line(
      1,
      [
        { x: 0, z: 0 },
        { x: 20, z: 0 },
      ],
      0xff0000,
    );
    const quietLine = line(
      2,
      [
        { x: 0, z: 10 },
        { x: 20, z: 10 },
      ],
      0x00ff00,
    );
    renderer.apply({ lines: [busyLine, quietLine], ridership: [120, 0], served: [3, 0] });

    expect(renderer.busCount()).toBe(3);

    const busMesh = scene.children.find(
      (c) => c instanceof THREE.InstancedMesh && c.count === renderer.busCount() && c.count > 0,
    );
    expect(busMesh).toBeDefined();
  });

  it('a second apply() disposes the previous meshes instead of accumulating them', () => {
    const scene = new THREE.Scene();
    const renderer = new TransitRenderer(scene, flatHeightAt);
    renderer.apply({
      lines: [
        line(
          1,
          [
            { x: 0, z: 0 },
            { x: 5, z: 0 },
          ],
          1,
        ),
      ],
      ridership: [40],
      served: [1],
    });
    const firstChildren = [...scene.children];

    renderer.apply({
      lines: [
        line(
          1,
          [
            { x: 0, z: 0 },
            { x: 5, z: 0 },
          ],
          1,
        ),
      ],
      ridership: [40],
      served: [1],
    });
    for (const child of firstChildren) expect(scene.children).not.toContain(child);
  });

  it('an empty snapshot clears everything back to zero', () => {
    const scene = new THREE.Scene();
    const renderer = new TransitRenderer(scene, flatHeightAt);
    renderer.apply({
      lines: [
        line(
          1,
          [
            { x: 0, z: 0 },
            { x: 5, z: 0 },
          ],
          1,
        ),
      ],
      ridership: [40],
      served: [1],
    });
    renderer.apply({ lines: [], ridership: [] });

    expect(renderer.stopCount()).toBe(0);
    expect(renderer.busCount()).toBe(0);
    expect(renderer.lineCount()).toBe(0);
    expect(scene.children).toHaveLength(0);
  });
});

describe('TransitRenderer.setVisible', () => {
  it('toggles visibility on every owned mesh without disposing them', () => {
    const scene = new THREE.Scene();
    const renderer = new TransitRenderer(scene, flatHeightAt);
    renderer.apply({
      lines: [
        line(
          1,
          [
            { x: 0, z: 0 },
            { x: 5, z: 0 },
          ],
          1,
        ),
      ],
      ridership: [40],
      served: [1],
    });

    renderer.setVisible(false);
    expect(renderer.isVisible()).toBe(false);
    for (const child of scene.children) expect((child as THREE.Object3D).visible).toBe(false);

    renderer.setVisible(true);
    for (const child of scene.children) expect((child as THREE.Object3D).visible).toBe(true);
  });
});

describe('TransitRenderer.update', () => {
  it('advances cosmetic bus positions along the route over time', () => {
    const scene = new THREE.Scene();
    const renderer = new TransitRenderer(scene, flatHeightAt);
    renderer.apply({
      lines: [
        line(
          1,
          [
            { x: 0, z: 0 },
            { x: 40, z: 0 },
          ],
          1,
        ),
      ],
      ridership: [40],
      served: [1],
    });

    const busMesh = scene.children.find(
      (c) => c instanceof THREE.InstancedMesh && c.count === renderer.busCount(),
    ) as THREE.InstancedMesh;
    expect(busMesh).toBeDefined();

    const before = new THREE.Matrix4();
    busMesh.getMatrixAt(0, before);
    const beforePos = new THREE.Vector3().setFromMatrixPosition(before);

    renderer.update(1);
    renderer.update(1);

    const after = new THREE.Matrix4();
    busMesh.getMatrixAt(0, after);
    const afterPos = new THREE.Vector3().setFromMatrixPosition(after);

    expect(afterPos.distanceTo(beforePos)).toBeGreaterThan(0);
  });
});

describe('TransitRenderer.dispose', () => {
  it('removes every owned mesh from the scene', () => {
    const scene = new THREE.Scene();
    const renderer = new TransitRenderer(scene, flatHeightAt);
    renderer.apply({
      lines: [
        line(
          1,
          [
            { x: 0, z: 0 },
            { x: 5, z: 0 },
          ],
          1,
        ),
      ],
      ridership: [40],
      served: [1],
    });
    expect(scene.children.length).toBeGreaterThan(0);

    renderer.dispose();
    expect(scene.children).toHaveLength(0);
  });
});

describe('rail lines (SPEC 26)', () => {
  const railLine = (id: number, stops: { x: number; z: number }[]): TransitLine => ({
    id,
    stops,
    color: 0x42a5f5,
    mode: 'rail',
  });

  const longRoute = [
    { x: 0, z: 0 },
    { x: 40, z: 0 },
  ];

  it('draws a train as several cars, not one long box', () => {
    const scene = new THREE.Scene();
    const renderer = new TransitRenderer(scene, flatHeightAt);
    renderer.apply({ lines: [railLine(1, longRoute)], ridership: [220], served: [1] });

    expect(renderer.busCount()).toBe(TRAIN_CARS_PER_SET);
  });

  it('runs a train at its own commercial speed, faster than a bus', () => {
    expect(COMMERCIAL_SPEED_MPS.rail).toBeCloseTo(13.3, 6);
    expect(COMMERCIAL_SPEED_MPS.rail).toBeGreaterThan(COMMERCIAL_SPEED_MPS.bus);
  });

  it('stands no bus shelter at a rail stop — the station is already there', () => {
    const scene = new THREE.Scene();
    const renderer = new TransitRenderer(scene, flatHeightAt);
    renderer.apply({ lines: [railLine(1, longRoute)], ridership: [220], served: [1] });
    expect(renderer.stopCount()).toBe(0);

    // The same geometry as a bus line does get shelters.
    const busScene = new THREE.Scene();
    const busRenderer = new TransitRenderer(busScene, flatHeightAt);
    busRenderer.apply({ lines: [line(1, longRoute, 0xff0000)], ridership: [220], served: [1] });
    expect(busRenderer.stopCount()).toBe(2);
  });

  it('keeps a train coupled: its cars stay a fixed distance apart as it runs', () => {
    const scene = new THREE.Scene();
    const renderer = new TransitRenderer(scene, flatHeightAt);
    renderer.apply({ lines: [railLine(1, longRoute)], ridership: [220], served: [1] });

    const mesh = scene.children.find(
      (c): c is THREE.InstancedMesh =>
        c instanceof THREE.InstancedMesh && c.count === TRAIN_CARS_PER_SET,
    );
    expect(mesh).toBeDefined();

    const gaps = (): number[] => {
      const m = new THREE.Matrix4();
      const p = new THREE.Vector3();
      const xs: number[] = [];
      for (let i = 0; i < TRAIN_CARS_PER_SET; i++) {
        mesh!.getMatrixAt(i, m);
        p.setFromMatrixPosition(m);
        xs.push(p.x);
      }
      return xs.slice(1).map((x, i) => Math.abs(x - xs[i]!));
    };

    const before = gaps();
    renderer.update(1.5);
    const after = gaps();
    expect(before.length).toBe(TRAIN_CARS_PER_SET - 1);
    for (let i = 0; i < before.length; i++) expect(after[i]!).toBeCloseTo(before[i]!, 4);
  });
});

describe('tram lines (SPEC 27)', () => {
  const modeLine = (
    id: number,
    stops: { x: number; z: number }[],
    mode: TransitLine['mode'],
  ): TransitLine => ({ id, stops, color: 0x66bb6a, mode });

  /** Runs due +X, so "keeps right" shows up as a non-zero z offset. */
  const straightRoute = [
    { x: 0, z: 0 },
    { x: 40, z: 0 },
  ];

  it('draws a tram as two cars', () => {
    const scene = new THREE.Scene();
    const renderer = new TransitRenderer(scene, flatHeightAt);
    renderer.apply({ lines: [modeLine(1, straightRoute, 'tram')], ridership: [90], served: [1] });
    expect(renderer.busCount()).toBe(TRAM_CARS_PER_SET);
  });

  it('runs a tram at a bus’s pace, since it shares the street', () => {
    expect(COMMERCIAL_SPEED_MPS.tram).toBe(COMMERCIAL_SPEED_MPS.bus);
  });

  it('stands a shelter at a tram stop — a tram takes no land for a station', () => {
    const scene = new THREE.Scene();
    const renderer = new TransitRenderer(scene, flatHeightAt);
    renderer.apply({ lines: [modeLine(1, straightRoute, 'tram')], ridership: [90], served: [1] });
    expect(renderer.stopCount()).toBe(straightRoute.length);
  });

  it('keeps a tram in its lane, where a train has its track to itself', () => {
    const carZ = (mode: TransitLine['mode'], cars: number): number => {
      const scene = new THREE.Scene();
      const renderer = new TransitRenderer(scene, flatHeightAt);
      renderer.apply({
        lines: [modeLine(1, straightRoute, mode)],
        ridership: [220],
        served: [1],
      });
      const mesh = scene.children.find(
        (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh && c.count === cars,
      );
      expect(mesh).toBeDefined();
      const m = new THREE.Matrix4();
      const p = new THREE.Vector3();
      mesh!.getMatrixAt(0, m);
      p.setFromMatrixPosition(m);
      return p.z;
    };

    const centerline = tileToWorld(0); // the route's own z, both stops being on tile row 0
    expect(Math.abs(carZ('tram', TRAM_CARS_PER_SET) - centerline)).toBeGreaterThan(0);
    expect(carZ('rail', TRAIN_CARS_PER_SET)).toBe(centerline);
  });
});

describe('a tram on the guideway', () => {
  /** A reservation down tile row 0 from x = 0 to 9: full height all along. */
  const reservedProfile = composeProfile(presetProfileForTier(RoadTier.Avenue), {
    ...NO_EDITS,
    tram: 'reserved',
  });
  const run = Array.from({ length: 10 }, (_, x) => ({
    x,
    z: 0,
    tier: RoadTier.Avenue,
    profile: reservedProfile,
  }));
  const line: TransitLine = {
    id: 1,
    // Three stops, so the two cars' pool is the only one of two instances.
    stops: [
      { x: 1, z: 0 },
      { x: 5, z: 0 },
      { x: 8, z: 0 },
    ],
    color: 0x66bb6a,
    mode: 'tram',
  };

  const carPositions = (sampler: GuidewaySeatSampler | null): THREE.Vector3[] => {
    const scene = new THREE.Scene();
    const renderer = new TransitRenderer(scene, flatHeightAt);
    renderer.setGuideway(sampler);
    renderer.apply({ lines: [line], ridership: [90], served: [1] });
    const mesh = scene.children.find(
      (c): c is THREE.InstancedMesh =>
        c instanceof THREE.InstancedMesh && c.count === TRAM_CARS_PER_SET,
    )!;
    const m = new THREE.Matrix4();
    return Array.from({ length: TRAM_CARS_PER_SET }, (_, i) => {
      mesh.getMatrixAt(i, m);
      return new THREE.Vector3().setFromMatrixPosition(m);
    });
  };

  it('rides the beam on its right, its floor 0.45 m above the beam top', () => {
    const { seatAt } = computeGuideway(run, flatHeightAt);
    const floor = GUIDEWAY_BEAM_TOP_M + TRAM_FLOOR_ABOVE_BEAM_M;
    for (const p of carPositions(seatAt)) {
      expect(p.y - TRAM_CAR_SIZE[1] / 2 + TRAM_FLOOR_ABOVE_ORIGIN_M).toBeCloseTo(floor, 6);
      // Eastbound, its right is +z: the beam south of the centre line.
      const seat = seatAt(p.x, p.z, Math.PI / 2)!;
      expect(p.z).toBeCloseTo(seat.z, 6);
      expect(seat.z).toBeGreaterThan(tileToWorld(0));
    }
  });

  it('stays on the street without a guideway under it', () => {
    for (const p of carPositions(null)) expect(p.y).toBeCloseTo(TRAM_CAR_SIZE[1] / 2, 6);
  });

  it('sets the car by the floor the drawn car has, over its wheels', () => {
    const geometry = buildTramCarGeometry();
    const position = geometry.getAttribute('position');
    const color = geometry.getAttribute('color');
    let bottom = Infinity;
    let wheelTop = -Infinity;
    for (let i = 0; i < position.count; i++) {
      bottom = Math.min(bottom, position.getY(i));
      const wheel =
        Math.abs(color.getX(i) - 0x0d / 255) < 1e-6 &&
        Math.abs(color.getY(i) - 0x0e / 255) < 1e-6 &&
        Math.abs(color.getZ(i) - 0x10 / 255) < 1e-6;
      if (wheel) wheelTop = Math.max(wheelTop, position.getY(i));
    }
    expect(wheelTop - bottom).toBeCloseTo(TRAM_FLOOR_ABOVE_ORIGIN_M, 2);
    geometry.dispose();
  });
});

describe('a vehicle set stays together across the end of its route', () => {
  /**
   * Widest gap between any two cars of one set, over a full lap and then some.
   * Three stops keep every shelter mesh's instance count clear of the vehicle
   * mesh's, so the mesh picked below is unambiguously the cars.
   */
  const widestSpan = (mode: TransitLine['mode'], cars: number): number => {
    const scene = new THREE.Scene();
    const renderer = new TransitRenderer(scene, flatHeightAt);
    renderer.apply({
      lines: [
        {
          id: 1,
          stops: [
            { x: 0, z: 0 },
            { x: 20, z: 0 },
            { x: 40, z: 0 },
          ],
          color: 0xffffff,
          mode,
        },
      ],
      ridership: [200],
      served: [1],
    });
    expect(renderer.busCount()).toBe(cars);
    const mesh = scene.children.find(
      (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh && c.count === cars,
    );
    expect(mesh).toBeDefined();

    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    let worst = 0;
    // A 800 m route laps in 60 s at the train's speed and 144 s at the
    // tram's; 200 s of travel takes either set round the end at least once.
    for (let step = 0; step < 800; step += 1) {
      renderer.update(0.25);
      const xs: number[] = [];
      for (let i = 0; i < cars; i += 1) {
        mesh!.getMatrixAt(i, m);
        p.setFromMatrixPosition(m);
        xs.push(p.x);
      }
      worst = Math.max(worst, Math.max(...xs) - Math.min(...xs));
    }
    return worst;
  };

  // The defect this guards: each car used to wrap its own distance past the end
  // of an OPEN polyline, so the lead restarted while its trailing cars were
  // still at the far end — one tram at both ends of the city at once.
  // Bounds are the set's own coupled length — 3 train cars at a ~15m pitch span
  // ~31m, 2 tram cars at a ~11m pitch span ~11m — not merely "less than the
  // route", so a set that drifts a few tiles apart fails just as a torn one does.
  it('never strands a train car at the far end of the line', () => {
    expect(widestSpan('rail', TRAIN_CARS_PER_SET)).toBeLessThan(35);
  });

  it('never strands a tram car at the far end of the line', () => {
    expect(widestSpan('tram', TRAM_CARS_PER_SET)).toBeLessThan(15);
  });
});
