import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  TransitRenderer,
  ridershipToBusCount,
  toWorldPoints,
  polylineLength,
  sampleAlongPolyline,
  computeStopHeading,
  computeShelterLayout,
  shelterSide,
  RIDERSHIP_PER_BUS,
  MAX_BUSES_PER_LINE,
  type TransitSnapshot,
} from './transit';
import type { TransitLine } from '../shared/types';
import { tileToWorld } from '../shared/constants';

const flatHeightAt = (): number => 0;

describe('ridershipToBusCount (pure)', () => {
  it('returns 0 for zero or negative ridership', () => {
    expect(ridershipToBusCount(0)).toBe(0);
    expect(ridershipToBusCount(-5)).toBe(0);
  });

  it('is monotonic non-decreasing in ridership', () => {
    const values = [0, 10, 39, 40, 80, 500, 10_000];
    let prev = -Infinity;
    for (const v of values) {
      const count = ridershipToBusCount(v);
      expect(count).toBeGreaterThanOrEqual(prev);
      prev = count;
    }
  });

  it('rounds to one bus per RIDERSHIP_PER_BUS riders', () => {
    expect(ridershipToBusCount(RIDERSHIP_PER_BUS)).toBe(1);
    expect(ridershipToBusCount(RIDERSHIP_PER_BUS * 2)).toBe(2);
  });

  it('caps at MAX_BUSES_PER_LINE regardless of how large ridership gets', () => {
    expect(ridershipToBusCount(RIDERSHIP_PER_BUS * 1000)).toBe(MAX_BUSES_PER_LINE);
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

    // shelter roof-posts (2x) + roof + bench + sign pole + sign (no buses since ridership is 0 for both lines)
    expect(renderer.shelterPostInstanceCount()).toBe(10);
    expect(renderer.shelterRoofInstanceCount()).toBe(5);
    expect(renderer.shelterBenchInstanceCount()).toBe(5);
    expect(renderer.signPoleInstanceCount()).toBe(5);
    expect(renderer.signInstanceCount()).toBe(5);

    const instancedMeshes = scene.children.filter(
      (c) => c instanceof THREE.InstancedMesh,
    ) as THREE.InstancedMesh[];
    expect(instancedMeshes).toHaveLength(5);
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
    expect(renderer.shelterPostInstanceCount()).toBe(2);
    expect(renderer.shelterRoofInstanceCount()).toBe(1);
    expect(renderer.shelterBenchInstanceCount()).toBe(1);
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
    // buildShelters() always adds shelterPostMesh first (scene.add(shelterPostMesh, roof, bench, signPole, sign)).
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

  it('spawns cosmetic buses whose count matches ridershipToBusCount(ridership) per line', () => {
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
    renderer.apply({ lines: [busyLine, quietLine], ridership: [RIDERSHIP_PER_BUS * 3, 0] });

    expect(renderer.busCount()).toBe(ridershipToBusCount(RIDERSHIP_PER_BUS * 3));

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
      ridership: [RIDERSHIP_PER_BUS],
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
      ridership: [RIDERSHIP_PER_BUS],
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
      ridership: [RIDERSHIP_PER_BUS],
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
      ridership: [RIDERSHIP_PER_BUS],
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
      ridership: [RIDERSHIP_PER_BUS],
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
      ridership: [RIDERSHIP_PER_BUS],
    });
    expect(scene.children.length).toBeGreaterThan(0);

    renderer.dispose();
    expect(scene.children).toHaveLength(0);
  });
});
