/**
 * Service-dispatch vehicle rendering: fire/police/ambulance/garbage
 * liveries riding the SAME shared vehicle buffer (SimSnapshot.vehicles) as
 * cosmetic cars/trucks/buses -- distinguished only by VehicleKind.Fire/
 * Police/Ambulance/Garbage (see shared/types.ts's contract note). This file owns a
 * SEPARATE set of InstancedMeshes from render/vehicles.ts's VehicleRenderer
 * (a chokepoint file, not edited here): VehicleRenderer's ALL_KINDS list is
 * [Car, Truck, Bus] only, so it already harmlessly hides any slot whose kind
 * is Fire/Police/Ambulance (no match in its kind-routing loop) -- this
 * renderer is the one that actually draws those slots.
 *
 * Extends the vehicle-kit style at a scope appropriate to a fixed,
 * baked livery per kind (not the per-instance palette-tint system
 * render/vehicles.ts needs for its randomized civilian fleet): a merged
 * multi-part box geometry (body + cabin/light-bar + wheels) with vertex
 * colors baked directly into the geometry per kind, reusing the same
 * lerp/lane-offset helpers as the civilian renderer for exact positioning
 * parity on shared roads.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  INACTIVE_VEHICLE_X,
  MAX_VEHICLES,
  VEHICLE_STRIDE,
  VehicleKind,
  type Incident,
} from '../shared/types';
import { TILE_METERS, tileToWorld } from '../shared/constants';
import { laneOffset, lerpVehicle } from './vehicles';
import { ROAD_Y_OFFSET } from './roadsmesh';

const SERVICE_KINDS = [
  VehicleKind.Fire,
  VehicleKind.Police,
  VehicleKind.Ambulance,
  VehicleKind.Garbage,
] as const;
export type ServiceVehicleKind = (typeof SERVICE_KINDS)[number];

function isServiceKind(kind: number): kind is ServiceVehicleKind {
  return (
    kind === VehicleKind.Fire ||
    kind === VehicleKind.Police ||
    kind === VehicleKind.Ambulance ||
    kind === VehicleKind.Garbage
  );
}

function hexToRGB(hex: number): readonly [number, number, number] {
  return [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255];
}

// ---------------------------------------------------------------------------
// Fixed liveries: fire=red, police=blue, ambulance=white, garbage=municipal
// green, plus a roof light-bar accent (red for fire/ambulance, red+blue read
// as "police" via the body blue itself, so the bar stays red -- genre-standard
// single-color bars). Garbage swaps the bar for a rear hopper + amber beacon.
// ---------------------------------------------------------------------------

const FIRE_RED = hexToRGB(0xd9362c);
const POLICE_BLUE = hexToRGB(0x2f6fd6);
const AMBULANCE_WHITE = hexToRGB(0xe9edf0);
const GARBAGE_GREEN = hexToRGB(0x3f7d4f);
const GARBAGE_HOPPER = hexToRGB(0x2f5e3b);
const CABIN_DARK = hexToRGB(0x1a1f26);
const LIGHTBAR_RED = hexToRGB(0xff2a20);
const LIGHTBAR_BLUE = hexToRGB(0x274b8f);
const BEACON_AMBER = hexToRGB(0xe0a020);
const RED_CROSS = hexToRGB(0xc21f2b);

function bodyColorForKind(kind: ServiceVehicleKind): readonly [number, number, number] {
  switch (kind) {
    case VehicleKind.Fire:
      return FIRE_RED;
    case VehicleKind.Police:
      return POLICE_BLUE;
    case VehicleKind.Garbage:
      return GARBAGE_GREEN;
    case VehicleKind.Ambulance:
    default:
      return AMBULANCE_WHITE;
  }
}

/** Body footprint (w, h, d) meters -- fire truck largest, ambulance van-sized, police sedan-sized. */
function sizeForKind(kind: ServiceVehicleKind): readonly [number, number, number] {
  switch (kind) {
    case VehicleKind.Fire:
      return [2.4, 2.8, 8.2];
    case VehicleKind.Garbage:
      return [2.3, 2.7, 7.0];
    case VehicleKind.Ambulance:
      return [2.2, 2.4, 6.2];
    case VehicleKind.Police:
    default:
      return [1.9, 1.6, 4.3];
  }
}

function tagGeometry(
  geo: THREE.BufferGeometry,
  colorRGB: readonly [number, number, number],
): THREE.BufferGeometry {
  const position = geo.getAttribute('position');
  const count = position ? position.count : 0;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = colorRGB[0];
    colors[i * 3 + 1] = colorRGB[1];
    colors[i * 3 + 2] = colorRGB[2];
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geo;
}

function box(
  w: number,
  h: number,
  d: number,
  cx: number,
  cy: number,
  cz: number,
  colorRGB: readonly [number, number, number],
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(cx, cy, cz);
  return tagGeometry(geo, colorRGB);
}

function buildWheelParts(): THREE.BufferGeometry[] {
  const centers: ReadonlyArray<readonly [number, number, number]> = [
    [0.46, -0.28, 0.34],
    [0.46, -0.28, -0.34],
    [-0.46, -0.28, 0.34],
    [-0.46, -0.28, -0.34],
  ];
  return centers.map(([cx, cy, cz]) => box(0.16, 0.34, 0.34, cx, cy, cz, CABIN_DARK));
}

/**
 * Builds the merged multi-part geometry for one service-vehicle kind: body
 * slab (livery color) + cabin/window band (dark) + 4 simple wheel boxes, all
 * vertex-colored (no per-instance tinting is needed since the livery is fixed
 * per kind, not randomized). Emergency kinds add a roof light-bar (kind's
 * accent color); garbage adds a raised rear hopper + amber beacon instead.
 */
export function buildServiceVehicleGeometry(kind: ServiceVehicleKind): THREE.BufferGeometry {
  const body = bodyColorForKind(kind);

  const parts: THREE.BufferGeometry[] = [
    box(0.92, 0.56, 0.94, 0, -0.2, 0, body),
    box(0.7, 0.3, 0.5, 0, 0.22, 0.05, CABIN_DARK),
    ...buildWheelParts(),
  ];

  if (kind === VehicleKind.Garbage) {
    // Refuse truck: a raised rear hopper/compactor box over the back ~40% of
    // the body (darker green) plus a small amber beacon -- no emergency bar.
    parts.push(box(0.86, 0.66, 0.38, 0, 0.13, -0.27, GARBAGE_HOPPER));
    parts.push(box(0.16, 0.1, 0.14, 0, 0.42, 0.05, BEACON_AMBER));
  } else {
    // Emergency roof light-bar (blue for police, red for fire/ambulance).
    const lightbar = kind === VehicleKind.Police ? LIGHTBAR_BLUE : LIGHTBAR_RED;
    parts.push(box(0.5, 0.12, 0.32, 0, 0.42, -0.05, lightbar));
  }

  if (kind === VehicleKind.Ambulance) {
    // Small red-cross accent on the roof, front of the light bar.
    parts.push(box(0.22, 0.08, 0.08, 0, 0.42, 0.2, RED_CROSS));
    parts.push(box(0.08, 0.08, 0.22, 0, 0.42, 0.2, RED_CROSS));
  }

  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged)
    throw new Error(`buildServiceVehicleGeometry: mergeGeometries failed for kind ${kind}`);
  return merged;
}

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();
const _yAxis = new THREE.Vector3(0, 1, 0);
const HIDDEN_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Renders fire/police/ambulance InstancedMeshes from the shared
 * SimSnapshot.vehicles buffer (same slot layout/stride as the civilian
 * VehicleRenderer), plus a marker pin InstancedMesh at every active
 * Incident.
 */
export class ServiceVehicleRenderer {
  private readonly heightAt: (x: number, z: number) => number;
  private readonly meshes: Record<ServiceVehicleKind, THREE.InstancedMesh>;
  private prevBuffer: Float32Array | null = null;
  private currBuffer: Float32Array | null = null;

  private readonly incidentMesh: THREE.InstancedMesh;
  private readonly incidentCapacity: number;

  constructor(
    scene: THREE.Scene,
    heightAt: (x: number, z: number) => number,
    incidentCapacity = 64,
  ) {
    this.heightAt = heightAt;
    this.incidentCapacity = incidentCapacity;

    const meshes = {} as Record<ServiceVehicleKind, THREE.InstancedMesh>;
    for (const kind of SERVICE_KINDS) {
      const geometry = buildServiceVehicleGeometry(kind);
      const material = new THREE.MeshLambertMaterial({ vertexColors: true });
      const mesh = new THREE.InstancedMesh(geometry, material, MAX_VEHICLES);
      mesh.castShadow = true; // shadow sweep: service vehicles cast, matching VehicleRenderer
      mesh.frustumCulled = false; // spans the whole road network, moves every frame (matches VehicleRenderer)
      mesh.userData.vehicleKind = kind;
      for (let i = 0; i < MAX_VEHICLES; i++) mesh.setMatrixAt(i, HIDDEN_MATRIX);
      mesh.count = MAX_VEHICLES;
      mesh.instanceMatrix.needsUpdate = true;
      scene.add(mesh);
      meshes[kind] = mesh;
    }
    this.meshes = meshes;

    // A plain (uncolored) cone; per-marker color is carried entirely by
    // InstancedMesh.setColorAt/instanceColor below (three.js applies it via
    // instancing regardless of the material's own vertexColors flag).
    const pinGeometry = new THREE.ConeGeometry(1, 1, 8);
    pinGeometry.translate(0, 0.5, 0);
    const pinMaterial = new THREE.MeshBasicMaterial();
    this.incidentMesh = new THREE.InstancedMesh(pinGeometry, pinMaterial, incidentCapacity);
    this.incidentMesh.frustumCulled = false;
    this.incidentMesh.count = incidentCapacity;
    for (let i = 0; i < incidentCapacity; i++) this.incidentMesh.setMatrixAt(i, HIDDEN_MATRIX);
    this.incidentMesh.instanceMatrix.needsUpdate = true;
    scene.add(this.incidentMesh);
  }

  private meshFor(kind: ServiceVehicleKind): THREE.InstancedMesh {
    const mesh = this.meshes[kind];
    if (!mesh) throw new RangeError(`ServiceVehicleRenderer: no mesh for kind ${kind}`);
    return mesh;
  }

  /** Same double-buffer contract as VehicleRenderer.setBuffer -- call once per snapshot with the SHARED vehicles buffer. */
  setBuffer(buf: Float32Array): void {
    this.prevBuffer = this.currBuffer ?? buf;
    this.currBuffer = buf;
  }

  /** Same alpha contract as VehicleRenderer.update -- see its doc comment for the speed-scaling rationale. */
  update(alphaToNext: number): void {
    const curr = this.currBuffer;
    if (!curr) return;
    const prev = this.prevBuffer ?? curr;

    for (let slot = 0; slot < MAX_VEHICLES; slot++) {
      const base = slot * VEHICLE_STRIDE;
      const currKind = curr[base + 4] ?? VehicleKind.Car;

      if (!isServiceKind(currKind)) {
        for (const kind of SERVICE_KINDS) this.meshFor(kind).setMatrixAt(slot, HIDDEN_MATRIX);
        continue;
      }

      const prevSlot = [
        prev[base] ?? INACTIVE_VEHICLE_X,
        prev[base + 1] ?? 0,
        prev[base + 2] ?? 0,
        prev[base + 3] ?? 0,
        prev[base + 4] ?? 0,
      ];
      const currSlot = [
        curr[base] ?? INACTIVE_VEHICLE_X,
        curr[base + 1] ?? 0,
        curr[base + 2] ?? 0,
        curr[base + 3] ?? 0,
        curr[base + 4] ?? 0,
      ];
      const { x, z, heading } = lerpVehicle(prevSlot, currSlot, alphaToNext);

      if (x === INACTIVE_VEHICLE_X) {
        for (const kind of SERVICE_KINDS) this.meshFor(kind).setMatrixAt(slot, HIDDEN_MATRIX);
        continue;
      }

      const kind = currKind;
      const [sx, sy, sz] = sizeForKind(kind);
      const offset = laneOffset(heading);
      const renderX = x + offset.dx;
      const renderZ = z + offset.dz;
      // Ride ON the road plate, not the bare terrain under it (wheel clipping).
      const groundY = this.heightAt(renderX, renderZ) + ROAD_Y_OFFSET;

      _position.set(renderX, groundY + sy / 2, renderZ);
      _quaternion.setFromAxisAngle(_yAxis, heading);
      _scale.set(sx, sy, sz);
      _matrix.compose(_position, _quaternion, _scale);

      for (const meshKind of SERVICE_KINDS) {
        const mesh = this.meshFor(meshKind);
        if (meshKind === kind) mesh.setMatrixAt(slot, _matrix);
        else mesh.setMatrixAt(slot, HIDDEN_MATRIX);
      }
    }

    for (const kind of SERVICE_KINDS) {
      this.meshFor(kind).instanceMatrix.needsUpdate = true;
    }
  }

  /** Colors an incident marker pin by kind: fire=red, crime=blue, medical=white-pink. Sized by severity (0..1). */
  private colorForIncident(kind: Incident['kind']): readonly [number, number, number] {
    switch (kind) {
      case 'fire':
        return FIRE_RED;
      case 'crime':
        return POLICE_BLUE;
      case 'medical':
      default:
        return AMBULANCE_WHITE;
    }
  }

  /**
   * Places one marker pin per active incident (up to `incidentCapacity`,
   * silently truncating any excess -- MAX_SERVICE_VEHICLES caps the sim side
   * well under any reasonable capacity here). Call once per snapshot.
   */
  setIncidents(incidents: readonly Incident[]): void {
    const n = Math.min(incidents.length, this.incidentCapacity);
    for (let i = 0; i < n; i++) {
      const incident = incidents[i]!;
      const worldX = tileToWorld(incident.x);
      const worldZ = tileToWorld(incident.z);
      const groundY = this.heightAt(worldX, worldZ);
      const size = TILE_METERS * (0.5 + incident.severity * 0.6);

      _position.set(worldX, groundY + size / 2, worldZ);
      _quaternion.identity();
      _scale.set(size * 0.4, size, size * 0.4);
      _matrix.compose(_position, _quaternion, _scale);
      this.incidentMesh.setMatrixAt(i, _matrix);

      const [r, g, b] = this.colorForIncident(incident.kind);
      _color.setRGB(r, g, b);
      this.incidentMesh.setColorAt(i, _color);
    }
    for (let i = n; i < this.incidentCapacity; i++) {
      this.incidentMesh.setMatrixAt(i, HIDDEN_MATRIX);
    }
    this.incidentMesh.instanceMatrix.needsUpdate = true;
    if (this.incidentMesh.instanceColor) this.incidentMesh.instanceColor.needsUpdate = true;
  }
}
