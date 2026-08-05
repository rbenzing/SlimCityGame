import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  ServiceVehicleRenderer,
  buildServiceVehicleGeometry,
  type ServiceVehicleKind,
} from './servicevehicles';
import {
  MAX_VEHICLES,
  VEHICLE_STRIDE,
  INACTIVE_VEHICLE_X,
  VehicleKind,
  type Incident,
} from '../shared/types';
import { laneOffset } from './vehicles';

const flatHeightAt = (): number => 0;

function makeBuffer(
  overrides: Record<number, [number, number, number, number, number]>,
): Float32Array {
  const buf = new Float32Array(MAX_VEHICLES * VEHICLE_STRIDE);
  for (let slot = 0; slot < MAX_VEHICLES; slot++) buf[slot * VEHICLE_STRIDE] = INACTIVE_VEHICLE_X;
  for (const key of Object.keys(overrides)) {
    const slot = Number(key);
    const vals = overrides[slot];
    if (!vals) continue;
    const base = slot * VEHICLE_STRIDE;
    for (let i = 0; i < VEHICLE_STRIDE; i++) buf[base + i] = vals[i] as number;
  }
  return buf;
}

function meshForKind(scene: THREE.Scene, kind: number): THREE.InstancedMesh {
  const mesh = scene.children.find(
    (c) => (c as THREE.InstancedMesh).isInstancedMesh === true && c.userData.vehicleKind === kind,
  );
  if (!mesh) throw new Error(`expected a kind-tagged InstancedMesh for kind ${kind}`);
  return mesh as THREE.InstancedMesh;
}

function decomposeAt(mesh: THREE.InstancedMesh, slot: number) {
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  mesh.getMatrixAt(slot, m);
  m.decompose(pos, quat, scl);
  return { pos, quat, scl };
}

function isHiddenAt(mesh: THREE.InstancedMesh, slot: number): boolean {
  const m = new THREE.Matrix4();
  mesh.getMatrixAt(slot, m);
  const e = m.elements;
  return e[0] === 0 && e[5] === 0 && e[10] === 0;
}

describe('buildServiceVehicleGeometry', () => {
  it('builds a distinct, non-empty vertex-colored geometry for every service kind', () => {
    for (const kind of [
      VehicleKind.Fire,
      VehicleKind.Police,
      VehicleKind.Ambulance,
    ] as ServiceVehicleKind[]) {
      const geo = buildServiceVehicleGeometry(kind);
      expect(geo.getAttribute('position').count).toBeGreaterThan(0);
      const color = geo.getAttribute('color');
      expect(color).toBeDefined();
      expect(color.count).toBe(geo.getAttribute('position').count);
    }
  });

  it('gives the ambulance extra vertices over fire/police (its red-cross roof accent parts)', () => {
    const fire = buildServiceVehicleGeometry(VehicleKind.Fire as ServiceVehicleKind);
    const police = buildServiceVehicleGeometry(VehicleKind.Police as ServiceVehicleKind);
    const ambulance = buildServiceVehicleGeometry(VehicleKind.Ambulance as ServiceVehicleKind);

    expect(fire.getAttribute('position').count).toBe(police.getAttribute('position').count);
    expect(ambulance.getAttribute('position').count).toBeGreaterThan(
      police.getAttribute('position').count,
    );
  });

  it("bakes each kind's livery body color onto its body-slab vertices (the first part built)", () => {
    // The body slab is always the first part merged in (see
    // buildServiceVehicleGeometry) -- its vertices carry the kind's exact
    // livery color, unmixed with the darker cabin/wheel/light-bar parts.
    function firstPartColor(geo: THREE.BufferGeometry): [number, number, number] {
      const color = geo.getAttribute('color');
      return [color.getX(0), color.getY(0), color.getZ(0)];
    }
    const fire = firstPartColor(
      buildServiceVehicleGeometry(VehicleKind.Fire as ServiceVehicleKind),
    );
    const police = firstPartColor(
      buildServiceVehicleGeometry(VehicleKind.Police as ServiceVehicleKind),
    );
    const ambulance = firstPartColor(
      buildServiceVehicleGeometry(VehicleKind.Ambulance as ServiceVehicleKind),
    );

    expect(fire[0]).toBeGreaterThan(0.7); // red-dominant
    expect(fire[0]).toBeGreaterThan(fire[2]);
    expect(police[2]).toBeGreaterThan(0.3); // blue-dominant
    expect(police[2]).toBeGreaterThan(police[0]);
    expect(ambulance[0]).toBeGreaterThan(0.8); // near-white: every channel high
    expect(ambulance[1]).toBeGreaterThan(0.8);
    expect(ambulance[2]).toBeGreaterThan(0.8);
  });
});

describe('ServiceVehicleRenderer', () => {
  it('adds one hidden InstancedMesh per service kind (Fire/Police/Ambulance) up front, sized MAX_VEHICLES, plus an incident-marker mesh', () => {
    const scene = new THREE.Scene();
    const renderer = new ServiceVehicleRenderer(scene, flatHeightAt);
    expect(() => renderer.update(0.5)).not.toThrow();

    const fireMesh = meshForKind(scene, VehicleKind.Fire);
    const policeMesh = meshForKind(scene, VehicleKind.Police);
    const ambulanceMesh = meshForKind(scene, VehicleKind.Ambulance);
    expect(fireMesh.count).toBe(MAX_VEHICLES);
    expect(policeMesh.count).toBe(MAX_VEHICLES);
    expect(ambulanceMesh.count).toBe(MAX_VEHICLES);
    expect(isHiddenAt(fireMesh, 0)).toBe(true);
    expect(isHiddenAt(policeMesh, 0)).toBe(true);
    expect(isHiddenAt(ambulanceMesh, 0)).toBe(true);

    const instancedMeshes = scene.children.filter(
      (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh,
    );
    expect(instancedMeshes.length).toBe(4); // fire + police + ambulance + incident pins
  });

  it('disables frustum culling on every mesh it owns (spans the whole map, moves every frame)', () => {
    const scene = new THREE.Scene();
    new ServiceVehicleRenderer(scene, flatHeightAt);
    const meshes = scene.children.filter(
      (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh,
    );
    expect(meshes.length).toBeGreaterThan(0);
    for (const mesh of meshes) expect(mesh.frustumCulled).toBe(false);
  });

  it('places an active Fire-kind slot in the fire mesh and hides it in police/ambulance meshes', () => {
    const scene = new THREE.Scene();
    const renderer = new ServiceVehicleRenderer(scene, flatHeightAt);
    const buf = makeBuffer({ 5: [32, 48, 0, 5, VehicleKind.Fire] });
    renderer.setBuffer(buf);
    renderer.update(0);

    const fireMesh = meshForKind(scene, VehicleKind.Fire);
    const policeMesh = meshForKind(scene, VehicleKind.Police);
    const ambulanceMesh = meshForKind(scene, VehicleKind.Ambulance);

    expect(isHiddenAt(fireMesh, 5)).toBe(false);
    expect(isHiddenAt(policeMesh, 5)).toBe(true);
    expect(isHiddenAt(ambulanceMesh, 5)).toBe(true);

    const { pos, scl } = decomposeAt(fireMesh, 5);
    expect(pos.y).toBeCloseTo(scl.y / 2, 5); // sits on flat ground
    expect(scl.x).toBeGreaterThan(0);
  });

  it('scales the fire truck larger than the police sedan (distinct per-kind sizes)', () => {
    const scene = new THREE.Scene();
    const renderer = new ServiceVehicleRenderer(scene, flatHeightAt);
    const buf = makeBuffer({
      0: [0, 0, 0, 5, VehicleKind.Fire],
      1: [50, 0, 0, 5, VehicleKind.Police],
    });
    renderer.setBuffer(buf);
    renderer.update(0);

    const fire = decomposeAt(meshForKind(scene, VehicleKind.Fire), 0);
    const police = decomposeAt(meshForKind(scene, VehicleKind.Police), 1);
    expect(fire.scl.z).toBeGreaterThan(police.scl.z);
  });

  it('leaves civilian-kind slots (Car/Truck/Bus) hidden across all three service meshes', () => {
    const scene = new THREE.Scene();
    const renderer = new ServiceVehicleRenderer(scene, flatHeightAt);
    const buf = makeBuffer({ 0: [10, 10, 0, 5, VehicleKind.Car] });
    renderer.setBuffer(buf);
    renderer.update(0);

    for (const kind of [VehicleKind.Fire, VehicleKind.Police, VehicleKind.Ambulance]) {
      expect(isHiddenAt(meshForKind(scene, kind), 0)).toBe(true);
    }
  });

  it('interpolates a service vehicle position between prev/curr snapshots by alpha', () => {
    const scene = new THREE.Scene();
    const renderer = new ServiceVehicleRenderer(scene, flatHeightAt);
    renderer.setBuffer(makeBuffer({ 2: [0, 0, 0, 5, VehicleKind.Police] }));
    renderer.update(0);
    // 12 m step: a realistic per-snapshot move under the slot-handoff
    // teleport-snap threshold, so this exercises interpolation, not the guard.
    renderer.setBuffer(makeBuffer({ 2: [12, 0, 0, 5, VehicleKind.Police] }));
    renderer.update(0.5);

    const mesh = meshForKind(scene, VehicleKind.Police);
    const { pos } = decomposeAt(mesh, 2);
    const offset = laneOffset(0); // heading is 0 in both frames
    expect(pos.x).toBeCloseTo(6 + offset.dx, 4);
  });

  it('hides every service mesh slot for an inactive (INACTIVE_VEHICLE_X) slot', () => {
    const scene = new THREE.Scene();
    const renderer = new ServiceVehicleRenderer(scene, flatHeightAt);
    renderer.setBuffer(makeBuffer({}));
    renderer.update(0);
    for (const kind of [VehicleKind.Fire, VehicleKind.Police, VehicleKind.Ambulance]) {
      expect(isHiddenAt(meshForKind(scene, kind), 0)).toBe(true);
    }
  });

  describe('setIncidents (marker pins)', () => {
    it('places one visible marker per active incident and hides the rest of the pool', () => {
      const scene = new THREE.Scene();
      const renderer = new ServiceVehicleRenderer(scene, flatHeightAt, 8);
      const incidents: Incident[] = [
        { kind: 'fire', x: 4, z: 4, severity: 0.5 },
        { kind: 'crime', x: 10, z: 2, severity: 0.9 },
      ];
      renderer.setIncidents(incidents);

      const pinMesh = scene.children.find(
        (c): c is THREE.InstancedMesh =>
          c instanceof THREE.InstancedMesh && !('vehicleKind' in c.userData),
      );
      expect(pinMesh).toBeDefined();
      expect(isHiddenAt(pinMesh!, 0)).toBe(false);
      expect(isHiddenAt(pinMesh!, 1)).toBe(false);
      expect(isHiddenAt(pinMesh!, 2)).toBe(true); // rest of the pool stays hidden
    });

    it('sizes a higher-severity marker larger than a lower-severity one', () => {
      const scene = new THREE.Scene();
      const renderer = new ServiceVehicleRenderer(scene, flatHeightAt, 8);
      renderer.setIncidents([
        { kind: 'medical', x: 1, z: 1, severity: 0.1 },
        { kind: 'medical', x: 2, z: 2, severity: 0.9 },
      ]);
      const pinMesh = scene.children.find(
        (c): c is THREE.InstancedMesh =>
          c instanceof THREE.InstancedMesh && !('vehicleKind' in c.userData),
      )!;
      const low = decomposeAt(pinMesh, 0);
      const high = decomposeAt(pinMesh, 1);
      expect(high.scl.y).toBeGreaterThan(low.scl.y);
    });

    it('clears all previously-shown markers when called again with fewer incidents', () => {
      const scene = new THREE.Scene();
      const renderer = new ServiceVehicleRenderer(scene, flatHeightAt, 8);
      renderer.setIncidents([
        { kind: 'fire', x: 4, z: 4, severity: 0.5 },
        { kind: 'crime', x: 10, z: 2, severity: 0.9 },
      ]);
      renderer.setIncidents([{ kind: 'fire', x: 4, z: 4, severity: 0.5 }]);

      const pinMesh = scene.children.find(
        (c): c is THREE.InstancedMesh =>
          c instanceof THREE.InstancedMesh && !('vehicleKind' in c.userData),
      )!;
      expect(isHiddenAt(pinMesh, 0)).toBe(false);
      expect(isHiddenAt(pinMesh, 1)).toBe(true);
    });
  });
});
