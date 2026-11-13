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
import { laneOffset, sizeForKind } from './vehicles';
import { ROAD_Y_OFFSET } from './roadsmesh';
import { tileToWorld } from '../shared/constants';

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
      VehicleKind.Garbage,
      VehicleKind.Recycling,
    ] as ServiceVehicleKind[]) {
      const geo = buildServiceVehicleGeometry(kind);
      expect(geo.getAttribute('position').count).toBeGreaterThan(0);
      const color = geo.getAttribute('color');
      expect(color).toBeDefined();
      expect(color.count).toBe(geo.getAttribute('position').count);
    }
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
    const garbage = firstPartColor(
      buildServiceVehicleGeometry(VehicleKind.Garbage as ServiceVehicleKind),
    );

    expect(fire[0]).toBeGreaterThan(0.7); // red-dominant
    expect(fire[0]).toBeGreaterThan(fire[2]);
    expect(police[2]).toBeGreaterThan(0.3); // blue-dominant
    expect(police[2]).toBeGreaterThan(police[0]);
    expect(ambulance[0]).toBeGreaterThan(0.8); // near-white: every channel high
    expect(ambulance[1]).toBeGreaterThan(0.8);
    expect(ambulance[2]).toBeGreaterThan(0.8);
    expect(garbage[1]).toBeGreaterThan(garbage[0]); // green-dominant
    expect(garbage[1]).toBeGreaterThan(garbage[2]);

    const recycling = firstPartColor(
      buildServiceVehicleGeometry(VehicleKind.Recycling as ServiceVehicleKind),
    );
    expect(recycling[2]).toBeGreaterThan(recycling[0]); // teal-blue: not the refuse truck's green
    expect(recycling[2]).toBeGreaterThan(garbage[2] + 0.2);
    expect(recycling[1]).toBeGreaterThan(police[1] + 0.15); // and greener than the police blue
  });

  it('gives the recycling truck a white cab where the refuse truck has a green one', () => {
    function whiteVertices(kind: VehicleKind): number {
      const color = buildServiceVehicleGeometry(kind as ServiceVehicleKind).getAttribute('color');
      let white = 0;
      for (let i = 0; i < color.count; i++) {
        if (Math.min(color.getX(i), color.getY(i), color.getZ(i)) > 0.9) white++;
      }
      return white;
    }
    expect(whiteVertices(VehicleKind.Recycling)).toBeGreaterThan(0);
    expect(whiteVertices(VehicleKind.Garbage)).toBe(0);
  });

  describe('the hearse', () => {
    const geo = buildServiceVehicleGeometry(VehicleKind.Hearse as ServiceVehicleKind);
    geo.computeBoundingBox();
    const [sx, sy, sz] = sizeForKind(VehicleKind.Hearse);
    const size = geo.boundingBox!.getSize(new THREE.Vector3());

    it('is 6.2 × 1.9 × 1.9 m once scaled, standing from the road up', () => {
      expect(size.x * sx).toBeCloseTo(1.9, 2);
      expect(size.y * sy).toBeCloseTo(1.9, 2);
      expect(size.z * sz).toBeCloseTo(6.2, 2);
      expect(geo.boundingBox!.min.y).toBeCloseTo(-0.5, 6);
      expect(geo.boundingBox!.max.y).toBeCloseTo(0.5, 6);
    });

    it('is black, with no light bar and no red cross, and its own livery against the ambulance', () => {
      const color = geo.getAttribute('color');
      let red = 0;
      let dark = 0;
      for (let i = 0; i < color.count; i++) {
        const [r, g, b] = [color.getX(i), color.getY(i), color.getZ(i)];
        if (r > 0.7 && g < 0.3 && b < 0.3) red++;
        if (Math.max(r, g, b) < 0.15) dark++;
      }
      expect(red).toBe(0);
      expect(dark / color.count).toBeGreaterThan(0.3);
      expect(color.getX(0)).toBeLessThan(0.1);
    });

    it('stands lower than the ambulance and the fire engine, and taller than a car', () => {
      expect(sy).toBeLessThan(sizeForKind(VehicleKind.Ambulance)[1] - 0.5);
      expect(sy).toBeGreaterThan(sizeForKind(VehicleKind.Car)[1]);
    });
  });

  describe('each vehicle is recognisable by shape at its real size', () => {
    const REAL_SIZE_M: ReadonlyArray<
      readonly [string, ServiceVehicleKind, number, number, number]
    > = [
      ['police patrol SUV', VehicleKind.Police, 2.0, 1.76, 5.05],
      ['fire pumper', VehicleKind.Fire, 2.5, 3.0, 10],
      ['Type III ambulance', VehicleKind.Ambulance, 2.5, 2.7, 6.9],
      ['rear-loader refuse truck', VehicleKind.Garbage, 2.44, 3.5, 9],
    ];
    const boundsOf = (kind: ServiceVehicleKind): THREE.Vector3 => {
      const geo = buildServiceVehicleGeometry(kind);
      geo.computeBoundingBox();
      const [sx, sy, sz] = sizeForKind(kind);
      const size = geo.boundingBox!.getSize(new THREE.Vector3());
      return size.multiply(new THREE.Vector3(sx, sy, sz));
    };

    for (const [name, kind, w, h, l] of REAL_SIZE_M) {
      it(`${name} measures ${w} x ${h} x ${l} m within 5 %, standing on the road`, () => {
        const size = boundsOf(kind);
        expect(size.x).toBeGreaterThan(w * 0.95);
        expect(size.x).toBeLessThan(w * 1.05);
        expect(size.y).toBeGreaterThan(h * 0.95);
        expect(size.y).toBeLessThan(h * 1.05);
        expect(size.z).toBeGreaterThan(l * 0.95);
        expect(size.z).toBeLessThan(l * 1.05);
        const geo = buildServiceVehicleGeometry(kind);
        geo.computeBoundingBox();
        expect(geo.boundingBox!.min.y).toBeCloseTo(-0.5, 6);
      });
    }

    // The geometry's metres: the unit-box vertices scaled by the kind's size.
    const vertices = (kind: ServiceVehicleKind) => {
      const geo = buildServiceVehicleGeometry(kind);
      const [sx, sy, sz] = sizeForKind(kind);
      const pos = geo.getAttribute('position');
      const color = geo.getAttribute('color');
      return Array.from({ length: pos.count }, (_, i) => ({
        x: pos.getX(i) * sx,
        y: (pos.getY(i) + 0.5) * sy,
        z: pos.getZ(i) * sz,
        rgb: [color.getX(i), color.getY(i), color.getZ(i)] as const,
      }));
    };

    // The solid's extent in metres at one z: where every triangle crossing that plane meets it.
    const crossSection = (kind: ServiceVehicleKind, z: number) => {
      const geo = buildServiceVehicleGeometry(kind);
      const [sx, sy, sz] = sizeForKind(kind);
      const pos = geo.getAttribute('position');
      const index = geo.getIndex()!;
      const at = (i: number): [number, number, number] => [
        pos.getX(i) * sx,
        (pos.getY(i) + 0.5) * sy,
        pos.getZ(i) * sz,
      ];
      const xs: number[] = [];
      const ys: number[] = [];
      for (let t = 0; t < index.count; t += 3) {
        const tri = [at(index.getX(t)), at(index.getX(t + 1)), at(index.getX(t + 2))];
        for (let e = 0; e < 3; e++) {
          const a = tri[e]!;
          const b = tri[(e + 1) % 3]!;
          if ((a[2] - z) * (b[2] - z) > 0) continue;
          const k = a[2] === b[2] ? 0 : (z - a[2]) / (b[2] - a[2]);
          xs.push(a[0] + (b[0] - a[0]) * k);
          ys.push(a[1] + (b[1] - a[1]) * k);
        }
      }
      return { top: Math.max(...ys), width: Math.max(...xs) - Math.min(...xs) };
    };

    it('gives the patrol car a roof light bar about 1.2 m wide, above the roofline, and a livery stripe', () => {
      const vs = vertices(VehicleKind.Police);
      const lit = vs.filter(({ rgb }) => rgb[0] > 0.9 && rgb[1] < 0.3 && rgb[2] < 0.3);
      const bar = vs.filter(
        ({ rgb }) =>
          (rgb[0] > 0.9 && rgb[1] < 0.3 && rgb[2] < 0.3) ||
          (rgb[0] < 0.3 && rgb[1] < 0.4 && rgb[2] > 0.5 && rgb[2] < 0.7),
      );
      expect(lit.length).toBeGreaterThan(0);
      const xs = bar.map((v) => v.x);
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(1.1);
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1.3);
      // The bar is the highest thing on the car, over the front doors (forward of the middle).
      expect(Math.max(...bar.map((v) => v.y))).toBeCloseTo(1.76, 2);
      expect(bar.every((v) => v.z > -0.3 && v.z < 1.5)).toBe(true);
      // A white door panel on each side, so it is not a plain blue car without the bar.
      const doors = vs.filter(({ rgb }) => Math.min(...rgb) > 0.85);
      expect(doors.some((v) => v.x > 0.9)).toBe(true);
      expect(doors.some((v) => v.x < -0.9)).toBe(true);
    });

    it('builds the pumper from a cab, a taller pump section, a lower hose bed, a ladder and a cab-roof bar', () => {
      const vs = vertices(VehicleKind.Fire);
      const topAt = (z: number): number => crossSection(VehicleKind.Fire, z).top;
      const cab = topAt(3.7);
      const pump = topAt(1.3);
      const hoseBed = topAt(-4.7);
      expect(cab).toBeGreaterThan(pump + 0.4);
      expect(pump).toBeGreaterThan(hoseBed + 0.3);
      // A ladder: a grey part running most of the body's length along one side only.
      const ladder = vs.filter(
        ({ rgb }) => Math.abs(rgb[0] - rgb[1]) < 0.05 && rgb[0] > 0.5 && rgb[0] < 0.85,
      );
      const zs = ladder.map((v) => v.z);
      expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(5);
      expect(ladder.some((v) => v.x < -0.5)).toBe(false);
    });

    it('builds the ambulance as a low van cab in front of a taller, wider box with a stripe and a front light bar', () => {
      const vs = vertices(VehicleKind.Ambulance);
      const box = crossSection(VehicleKind.Ambulance, -1);
      const cab = crossSection(VehicleKind.Ambulance, 3.2);
      expect(box.top).toBeGreaterThan(cab.top + 0.4);
      expect(box.width).toBeGreaterThan(cab.width + 0.1);
      expect(vs.some(({ rgb, y }) => rgb[0] > 0.7 && rgb[1] < 0.3 && rgb[2] < 0.3 && y > 2.5)).toBe(
        true,
      );
    });

    it('builds the refuse truck as a cab-over cab, a tall body and a hopper that slopes down at the tail', () => {
      const topAt = (z: number): number => crossSection(VehicleKind.Garbage, z).top;
      expect(topAt(0)).toBeGreaterThan(topAt(3.6) + 0.4); // body over the cab
      expect(topAt(-3.1)).toBeGreaterThan(topAt(-4.4) + 0.8); // the hopper slopes down to the tail
      expect(topAt(-4.4)).toBeGreaterThan(1.0);
    });

    it('draws the four kinds with plainly different height profiles along the body', () => {
      const profile = (kind: ServiceVehicleKind): number[] => {
        const [, sy, sz] = sizeForKind(kind);
        return Array.from(
          { length: 10 },
          (_, bin) => crossSection(kind, -sz / 2 + (sz * (bin + 0.5)) / 10).top / sy,
        );
      };
      const kinds = [
        VehicleKind.Fire,
        VehicleKind.Police,
        VehicleKind.Ambulance,
        VehicleKind.Garbage,
      ];
      for (let a = 0; a < kinds.length; a++) {
        for (let b = a + 1; b < kinds.length; b++) {
          const pa = profile(kinds[a]!);
          const pb = profile(kinds[b]!);
          const gap = pa.reduce((sum, v, i) => sum + Math.abs(v - pb[i]!), 0) / pa.length;
          expect(gap, `${kinds[a]} vs ${kinds[b]}`).toBeGreaterThan(0.08);
        }
      }
    });
  });

  it('draws a kind it has no livery for as a refuse truck', () => {
    const unknown = buildServiceVehicleGeometry(99 as ServiceVehicleKind).getAttribute('color');
    const garbage = buildServiceVehicleGeometry(
      VehicleKind.Garbage as ServiceVehicleKind,
    ).getAttribute('color');
    expect([unknown.getX(0), unknown.getY(0), unknown.getZ(0)]).toEqual([
      garbage.getX(0),
      garbage.getY(0),
      garbage.getZ(0),
    ]);
  });
});

describe('ServiceVehicleRenderer', () => {
  it('adds one hidden InstancedMesh per service kind (Fire/Police/Ambulance/Garbage) up front, sized MAX_VEHICLES, plus an incident-marker mesh', () => {
    const scene = new THREE.Scene();
    const renderer = new ServiceVehicleRenderer(scene, flatHeightAt);
    expect(() => renderer.update(0.5)).not.toThrow();

    const fireMesh = meshForKind(scene, VehicleKind.Fire);
    const policeMesh = meshForKind(scene, VehicleKind.Police);
    const ambulanceMesh = meshForKind(scene, VehicleKind.Ambulance);
    const garbageMesh = meshForKind(scene, VehicleKind.Garbage);
    expect(fireMesh.count).toBe(MAX_VEHICLES);
    expect(policeMesh.count).toBe(MAX_VEHICLES);
    expect(ambulanceMesh.count).toBe(MAX_VEHICLES);
    expect(garbageMesh.count).toBe(MAX_VEHICLES);
    expect(isHiddenAt(fireMesh, 0)).toBe(true);
    expect(isHiddenAt(policeMesh, 0)).toBe(true);
    expect(isHiddenAt(ambulanceMesh, 0)).toBe(true);
    expect(isHiddenAt(garbageMesh, 0)).toBe(true);

    const instancedMeshes = scene.children.filter(
      (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh,
    );
    expect(instancedMeshes.length).toBe(8); // fire + police + ambulance + garbage + recycling + hearse + answered pins + open pins
    for (const kind of Object.values(VehicleKind).filter(
      (k) => k !== VehicleKind.Car && k !== VehicleKind.Truck && k !== VehicleKind.Bus,
    )) {
      expect(scene.children.filter((c) => c.userData.vehicleKind === kind)).toHaveLength(1);
    }
  });

  it('places an active Hearse-kit slot in the hearse mesh only, at the hearse size on the road plate', () => {
    const scene = new THREE.Scene();
    const renderer = new ServiceVehicleRenderer(scene, flatHeightAt);
    renderer.setBuffer(makeBuffer({ 3: [32, 48, 0, 5, VehicleKind.Hearse] }));
    renderer.update(0);

    expect(isHiddenAt(meshForKind(scene, VehicleKind.Hearse), 3)).toBe(false);
    for (const kind of [
      VehicleKind.Fire,
      VehicleKind.Police,
      VehicleKind.Ambulance,
      VehicleKind.Garbage,
      VehicleKind.Recycling,
    ]) {
      expect(isHiddenAt(meshForKind(scene, kind), 3)).toBe(true);
    }
    const { pos, scl } = decomposeAt(meshForKind(scene, VehicleKind.Hearse), 3);
    expect(scl.x).toBeCloseTo(1.9, 5);
    expect(scl.y).toBeCloseTo(1.9, 5);
    expect(scl.z).toBeCloseTo(6.2, 5);
    expect(pos.y).toBeCloseTo(ROAD_Y_OFFSET + 0.95, 5);
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
    expect(pos.y).toBeCloseTo(ROAD_Y_OFFSET + scl.y / 2, 5); // rides the road plate
    expect(scl.x).toBeGreaterThan(0);
  });

  it('places an active Garbage-kind slot in the garbage mesh and hides it in the other service meshes', () => {
    const scene = new THREE.Scene();
    const renderer = new ServiceVehicleRenderer(scene, flatHeightAt);
    const buf = makeBuffer({ 7: [32, 48, 0, 5, VehicleKind.Garbage] });
    renderer.setBuffer(buf);
    renderer.update(0);

    const garbageMesh = meshForKind(scene, VehicleKind.Garbage);
    expect(isHiddenAt(garbageMesh, 7)).toBe(false);
    for (const kind of [VehicleKind.Fire, VehicleKind.Police, VehicleKind.Ambulance]) {
      expect(isHiddenAt(meshForKind(scene, kind), 7)).toBe(true);
    }

    const { pos, scl } = decomposeAt(garbageMesh, 7);
    expect(pos.y).toBeCloseTo(ROAD_Y_OFFSET + scl.y / 2, 5); // rides the road plate
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

    for (const kind of [
      VehicleKind.Fire,
      VehicleKind.Police,
      VehicleKind.Ambulance,
      VehicleKind.Garbage,
    ]) {
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
    for (const kind of [
      VehicleKind.Fire,
      VehicleKind.Police,
      VehicleKind.Ambulance,
      VehicleKind.Garbage,
    ]) {
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

    const pinMeshes = (scene: THREE.Scene) => {
      const find = (state: string): THREE.InstancedMesh =>
        scene.children.find(
          (c): c is THREE.InstancedMesh =>
            c instanceof THREE.InstancedMesh && c.userData.incidentPin === state,
        )!;
      return { answered: find('answered'), open: find('open') };
    };

    it('draws an unanswered call in a different, duller colour than an answered one of the same kind', () => {
      const scene = new THREE.Scene();
      const renderer = new ServiceVehicleRenderer(scene, flatHeightAt, 8);
      renderer.setIncidents([
        { kind: 'fire', x: 4, z: 4, severity: 0.5, answered: true },
        { kind: 'fire', x: 6, z: 4, severity: 0.5, answered: false },
        { kind: 'fire', x: 8, z: 4, severity: 0.5 },
      ]);
      const { answered, open } = pinMeshes(scene);
      // The colour buffer exists before any call: without it a material that
      // has already drawn never picks one up.
      expect(answered.instanceColor).not.toBeNull();
      expect(open.instanceColor).not.toBeNull();
      const colour = (mesh: THREE.InstancedMesh, i: number): THREE.Color => {
        const c = new THREE.Color();
        mesh.getColorAt(i, c);
        return c;
      };
      const answeredFire = colour(answered, 0);
      const lapsing = colour(open, 1);
      expect(lapsing.equals(answeredFire)).toBe(false);
      expect(lapsing.r).toBeLessThan(answeredFire.r);
      // Absent means answered, as it does everywhere else.
      expect(colour(answered, 2).equals(answeredFire)).toBe(true);
    });

    it('draws an answered call and an open one in different shapes, not only different colours', () => {
      const scene = new THREE.Scene();
      const renderer = new ServiceVehicleRenderer(scene, flatHeightAt, 8);
      renderer.setIncidents([
        { kind: 'crime', x: 4, z: 4, severity: 0.5, answered: true },
        { kind: 'crime', x: 6, z: 4, severity: 0.5, answered: false },
      ]);
      const { answered, open } = pinMeshes(scene);
      expect(answered.geometry).not.toBe(open.geometry);
      // An answered pin is shown in its own mesh and an open one in the other, never both.
      expect(isHiddenAt(answered, 0)).toBe(false);
      expect(isHiddenAt(open, 0)).toBe(true);
      expect(isHiddenAt(answered, 1)).toBe(true);
      expect(isHiddenAt(open, 1)).toBe(false);
      // The answered pin carries a ring around the cone the open one lacks: wider, with more faces.
      answered.geometry.computeBoundingBox();
      open.geometry.computeBoundingBox();
      const width = (geometry: THREE.BufferGeometry): number =>
        geometry.boundingBox!.getSize(new THREE.Vector3()).x;
      expect(width(answered.geometry)).toBeGreaterThan(width(open.geometry) * 1.3);
      expect(answered.geometry.getAttribute('position').count).toBeGreaterThan(
        open.geometry.getAttribute('position').count,
      );
      // Both still hover their point where the call is: the point is at y = 0.
      expect(answered.geometry.boundingBox!.min.y).toBeCloseTo(0, 6);
      expect(open.geometry.boundingBox!.min.y).toBeCloseTo(0, 6);
    });

    it('moves a call between the two shapes when a station takes it', () => {
      const scene = new THREE.Scene();
      const renderer = new ServiceVehicleRenderer(scene, flatHeightAt, 8);
      renderer.setIncidents([{ kind: 'fire', x: 4, z: 4, severity: 0.5, answered: false }]);
      renderer.setIncidents([{ kind: 'fire', x: 4, z: 4, severity: 0.5, answered: true }]);
      const { answered, open } = pinMeshes(scene);
      expect(isHiddenAt(answered, 0)).toBe(false);
      expect(isHiddenAt(open, 0)).toBe(true);
    });

    describe('sized against the art anchors, point down over the roof', () => {
      const pinMeshOf = (scene: THREE.Scene): THREE.InstancedMesh =>
        scene.children.find(
          (c): c is THREE.InstancedMesh =>
            c instanceof THREE.InstancedMesh && !('vehicleKind' in c.userData),
        )!;
      // The geometry's point is at y = 0 and its base at y = 1, so the
      // instance's position is where the point hovers and its y scale is its
      // height. Its base is a unit-radius circle, so the x scale is half the
      // base's width.
      const pointYOf = (geometry: THREE.BufferGeometry): [number, number] => {
        geometry.computeBoundingBox();
        return [geometry.boundingBox!.min.y, geometry.boundingBox!.max.y];
      };

      it('hovers its point 2.5 m over a 10 m roof at the lot centre, 4.4 m tall and 1.6 m across at severity 0', () => {
        const scene = new THREE.Scene();
        const hill = (): number => 3;
        // The call's tile (4, 4) is the back yard of a lot whose building
        // stands centred at (3.5, 3) tiles: the pin hangs over the building.
        const lotCentre = { x: 70, y: 3 + 10, z: 60 };
        const renderer = new ServiceVehicleRenderer(scene, hill, 8, (x, z) =>
          x === 4 && z === 4 ? lotCentre : null,
        );
        renderer.setIncidents([{ kind: 'fire', x: 4, z: 4, severity: 0 }]);
        const pin = pinMeshOf(scene);
        expect(pointYOf(pin.geometry)).toEqual([0, 1]);
        const { pos, scl } = decomposeAt(pin, 0);
        expect(pos.x).toBeCloseTo(lotCentre.x, 6);
        expect(pos.z).toBeCloseTo(lotCentre.z, 6);
        expect(pos.y).toBeCloseTo(3 + 10 + 2.5, 6);
        expect(scl.y).toBeCloseTo(4.4, 6);
        expect(scl.x * 2).toBeCloseTo(1.6, 6);
        expect(scl.z * 2).toBeCloseTo(1.6, 6);
      });

      it('grows to one and a half times by severity 1, and no further', () => {
        const scene = new THREE.Scene();
        const renderer = new ServiceVehicleRenderer(scene, flatHeightAt, 8, (x, z) => ({
          x: tileToWorld(x),
          y: 10,
          z: tileToWorld(z),
        }));
        renderer.setIncidents([
          { kind: 'crime', x: 1, z: 1, severity: 1 },
          { kind: 'crime', x: 2, z: 2, severity: 5 },
        ]);
        const pin = pinMeshOf(scene);
        const full = decomposeAt(pin, 0);
        expect(full.scl.y).toBeCloseTo(6.6, 6);
        expect(full.scl.x * 2).toBeCloseTo(2.4, 6);
        // It still hovers the same 2.5 m: the growth is in the cone, not the gap.
        expect(full.pos.y).toBeCloseTo(12.5, 6);
        expect(decomposeAt(pin, 1).scl.y).toBeCloseTo(6.6, 6);
      });

      it('hovers 2.5 m over the tile centre on the ground where there is no building, and when nobody can say', () => {
        const scene = new THREE.Scene();
        const ground = (): number => 4;
        const asked = new ServiceVehicleRenderer(scene, ground, 8, () => null);
        asked.setIncidents([{ kind: 'medical', x: 4, z: 6, severity: 0 }]);
        const fallback = decomposeAt(pinMeshOf(scene), 0).pos;
        expect(fallback.x).toBeCloseTo(tileToWorld(4), 6);
        expect(fallback.z).toBeCloseTo(tileToWorld(6), 6);
        expect(fallback.y).toBeCloseTo(4 + 2.5, 6);

        const unaskedScene = new THREE.Scene();
        const unasked = new ServiceVehicleRenderer(unaskedScene, ground, 8);
        unasked.setIncidents([{ kind: 'medical', x: 4, z: 6, severity: 0 }]);
        const unaskedPos = decomposeAt(pinMeshOf(unaskedScene), 0).pos;
        expect(unaskedPos.toArray()).toEqual(fallback.toArray());
      });
    });
  });
});
