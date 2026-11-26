import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { meshCensus, setGroupHidden, showAllGroups, watchSceneOwners } from './framecostprobe';

/** A camera at the origin looking down -Z, with its matrices current. */
function cameraAtOrigin(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.updateMatrixWorld();
  return camera;
}

const indexed = (): THREE.BufferGeometry => {
  const g = new THREE.BoxGeometry(1, 1, 1); // 12 triangles, indexed
  return g;
};
const flat = (): THREE.BufferGeometry => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3)); // 2 triangles
  return g;
};

describe('meshCensus', () => {
  it('counts triangles of indexed and non-indexed geometry', () => {
    const scene = new THREE.Scene();
    const a = new THREE.Mesh(indexed());
    const b = new THREE.Mesh(flat());
    a.position.set(0, 0, -10);
    b.position.set(0, 0, -10);
    scene.add(a, b);
    scene.updateMatrixWorld(true);
    const rows = meshCensus(scene, cameraAtOrigin());
    expect(rows.map((r) => r.trianglesEach).sort((x, y) => x - y)).toEqual([2, 12]);
  });

  it('counts the instances in view and reports count, not capacity', () => {
    const scene = new THREE.Scene();
    const mesh = new THREE.InstancedMesh(indexed(), undefined, 10);
    mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 0, -10)); // in front
    mesh.setMatrixAt(1, new THREE.Matrix4().makeTranslation(0, 0, 10)); // behind the camera
    mesh.count = 2;
    scene.add(mesh);
    const [row] = meshCensus(scene, cameraAtOrigin());
    expect(row).toMatchObject({ instanced: true, instances: 2, inView: 1, trianglesEach: 12 });
  });

  it('skips meshes that are not visible', () => {
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(indexed());
    mesh.visible = false;
    scene.add(mesh);
    expect(meshCensus(scene, cameraAtOrigin())).toEqual([]);
  });
});

describe('group switches', () => {
  it('hide and restore only their own group', () => {
    const scene = new THREE.Scene();
    const untracked = new THREE.Mesh(indexed());
    scene.add(untracked); // added before the watch: owned by no group
    watchSceneOwners(scene);
    // The owner is the renderer file found in the call stack; a test file is not one, so the
    // object lands in the `other:` group named by the first file in the stack.
    const tracked = new THREE.Mesh(indexed());
    scene.add(tracked);
    const owner = meshCensus(scene, cameraAtOrigin()).find(
      (r) => r.group !== 'other:untracked',
    )!.group;

    setGroupHidden('trees', true);
    expect(tracked.visible).toBe(true); // another group's switch leaves it alone
    setGroupHidden(owner, true);
    expect(tracked.visible).toBe(false);
    expect(untracked.visible).toBe(true);
    showAllGroups();
    expect(tracked.visible).toBe(true);
  });
});
