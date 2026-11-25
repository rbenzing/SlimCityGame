/**
 * Dev-only frame-cost instruments: which renderer put each object in the scene,
 * switches that hide one group of them at a time, and a census of the meshes a
 * frame submits. Nothing here is reached from a production build.
 */
import * as THREE from 'three';

/** Draw group of each renderer file (the file name without extension). */
const GROUP_OF_FILE: Record<string, string> = {
  terrain: 'terrain',
  water: 'water',
  trees: 'trees',
  roadsmesh: 'roads',
  freeroadmesh: 'roads',
  bridges: 'roads',
  guideway: 'roads',
  tramstations: 'roads',
  roadfurniture: 'furniture',
  lamps: 'furniture',
  soundwalls: 'furniture',
  busstops: 'furniture',
  buildings: 'buildings',
  massing: 'buildings',
  utilitykits: 'buildings',
  landmarks: 'buildings',
  farms: 'buildings',
  landfill: 'buildings',
  lots: 'lots',
  parked: 'lots',
  vehicles: 'vehicles',
  servicevehicles: 'vehicles',
  transit: 'vehicles',
  pedestrians: 'vehicles',
  powerlines: 'power',
  cables: 'power',
  sky: 'sky',
  stars: 'sky',
  clouds: 'sky',
};

/** The groups a switch can hide, in report order. */
export const FRAME_GROUPS = [
  'terrain',
  'water',
  'sea',
  'trees',
  'roads',
  'furniture',
  'buildings',
  'lots',
  'vehicles',
  'power',
] as const;

const owners = new Map<THREE.Object3D, string>();
const hidden = new Set<string>();

/** The group a stack of renderer files belongs to: the first file the table knows, else the first one named. */
function groupOfStack(stack: string): string {
  const files = [...stack.matchAll(/\/src\/render\/([a-z0-9]+)\.ts/g)]
    .map((m) => m[1]!)
    .filter((f) => f !== 'framecostprobe' && f !== 'scene');
  for (const file of files) {
    const group = GROUP_OF_FILE[file];
    if (group) return group;
  }
  return files[0] ? `other:${files[0]}` : 'other:main';
}

/** Records the renderer file behind everything added to `scene` from here on. */
export function watchSceneOwners(scene: THREE.Scene): void {
  const add = scene.add.bind(scene);
  scene.add = (...objects: THREE.Object3D[]): THREE.Scene => {
    const group = groupOfStack(new Error().stack ?? '');
    for (const o of objects) owners.set(o, o.name === 'water-sea' ? 'sea' : group);
    return add(...objects) as THREE.Scene;
  };
}

/** Shows or hides one group; `other:` groups are named by their file. */
export function setGroupHidden(group: string, off: boolean): void {
  if (off) hidden.add(group);
  else hidden.delete(group);
  for (const [obj, g] of owners) if (g === group) obj.visible = !off;
}

/** Shows everything the switches hid. */
export function showAllGroups(): void {
  for (const g of [...hidden]) setGroupHidden(g, false);
}

export interface MeshCensusRow {
  group: string;
  name: string;
  instanced: boolean;
  instances: number;
  trianglesEach: number;
  /** Instances whose centre sphere meets the camera frustum. */
  inView: number;
  /** Whether three tests this mesh against the frustum at all. */
  frustumCulled: boolean;
  castsShadow: boolean;
}

const trianglesOf = (g: THREE.BufferGeometry): number =>
  (g.index ? g.index.count : (g.getAttribute('position')?.count ?? 0)) / 3;

/** Every visible mesh in the scene, with the triangles it submits and how many of its instances are in view. */
export function meshCensus(scene: THREE.Scene, camera: THREE.Camera): MeshCensusRow[] {
  camera.updateMatrixWorld();
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  );
  const rows: MeshCensusRow[] = [];
  const sphere = new THREE.Sphere();
  const matrix = new THREE.Matrix4();
  scene.traverseVisible((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const geometry = obj.geometry as THREE.BufferGeometry;
    geometry.computeBoundingSphere();
    const base = geometry.boundingSphere;
    const instanced = obj instanceof THREE.InstancedMesh;
    const instances = instanced ? obj.count : 1;
    let inView = 0;
    if (base) {
      for (let i = 0; i < instances; i++) {
        if (instanced) obj.getMatrixAt(i, matrix);
        else matrix.copy(obj.matrixWorld);
        sphere.copy(base).applyMatrix4(matrix);
        if (frustum.intersectsSphere(sphere)) inView++;
      }
    }
    let owner: THREE.Object3D | null = obj;
    let group: string | undefined;
    while (owner && !(group = owners.get(owner))) owner = owner.parent;
    rows.push({
      group: group ?? 'other:untracked',
      name: obj.name || geometry.type,
      instanced,
      instances,
      trianglesEach: trianglesOf(geometry),
      inView,
      frustumCulled: obj.frustumCulled,
      castsShadow: obj.castShadow,
    });
  });
  return rows;
}
